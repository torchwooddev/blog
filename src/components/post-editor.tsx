import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Eye,
  ExternalLink,
  FileUp,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Textarea } from '#/components/ui/textarea'
import {
  createDraft,
  deletePost,
  publishPost,
  unpublishPost,
  updatePostContent,
  uploadAttachment,
  type DraftInput,
} from '#/lib/admin-client'
import { describeError } from '#/lib/errors'
import { formatBytes, formatDate } from '#/lib/format'
import { renderArticleHtml, countWords, readingMinutes } from '#/lib/post-utils'
import { categoriesOptions, filesOptions, tagsOptions } from '#/lib/query-options'
import { slugify } from '#/lib/types'
import { cleanupCommentsForPost } from '#/server/admin.functions'
import { deleteStorageFiles } from '#/server/storage.functions'
import { useAuth } from '#/lib/torchwood-client'
import { cn } from 'cn'
import type { FileRef, Post } from '#/lib/types'

export interface PostEditorProps {
  /** 存在 = 编辑已有文章；否则创建新草稿。 */
  post: Post | null
}

interface EditorState {
  title: string
  slug: string
  content: string
  categoryId: string
  tagIds: string[]
  attachmentIds: string[]
  slugTouched: boolean
  preview: boolean
}

function toState(post: Post | null): EditorState {
  return {
    title: post?.title ?? '',
    slug: post?.slug ?? '',
    content: post?.content ?? '',
    categoryId: post?.categoryId ?? '',
    tagIds: post?.tagIds ?? [],
    attachmentIds: post?.attachmentIds ?? [],
    slugTouched: !!post,
    preview: false,
  }
}

/** 参与脏检查的内容字段（slugTouched/preview 不算正文变更）。 */
function contentOf(state: EditorState): string {
  return JSON.stringify([state.title, state.slug, state.content, state.categoryId, state.tagIds, state.attachmentIds])
}

export function PostEditor({ post }: PostEditorProps) {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [state, setState] = useState<EditorState>(() => toState(post))
  const [savedPost, setSavedPost] = useState<Post | null>(post)
  const [savedSnapshot, setSavedSnapshot] = useState(() => contentOf(toState(post)))
  const [pendingDelete, setPendingDelete] = useState(false)

  const categories = useQuery(categoriesOptions())
  const tags = useQuery(tagsOptions())
  const attachments = useQuery(filesOptions(state.attachmentIds))
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setState(toState(post))
    setSavedPost(post)
    applySnapshot(contentOf(toState(post)))
  }, [post])

  const isDirty = contentOf(state) !== savedSnapshot

  const patch = (next: Partial<EditorState>) => setState((prev) => ({ ...prev, ...next }))

  // 未保存离开守卫：路由内拦截（SPA 导航）+ 仅在脏状态注册 beforeunload（关闭/刷新）。
  // 守卫读 ref 而非 state：保存成功后立即放行内部跳转（setState 尚未 flush 时守卫也能看到新快照）。
  const stateRef = useRef(state)
  stateRef.current = state
  const savedSnapshotRef = useRef(savedSnapshot)
  function applySnapshot(next: string) {
    savedSnapshotRef.current = next
    setSavedSnapshot(next)
  }
  const blocker = useBlocker({
    shouldBlockFn: () => contentOf(stateRef.current) !== savedSnapshotRef.current,
    enableBeforeUnload: false,
    withResolver: true,
  })
  const confirmLeave = blocker.status === 'blocked'
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(file),
    onSuccess: (ref: FileRef) => {
      patch({ attachmentIds: [...state.attachmentIds, ref.id] })
      if (ref.isImage) {
        // 图片：把内联 markdown 插到光标处（预览模式下追加到文末）。
        const snippet = `![${ref.name}](${ref.viewUrl})`
        const el = textareaRef.current
        if (el && !state.preview) {
          const start = el.selectionStart ?? el.value.length
          const end = el.selectionEnd ?? start
          const next = `${el.value.slice(0, start)}\n${snippet}\n${el.value.slice(end)}`
          patch({ content: next })
        } else {
          patch({ content: `${state.content}\n${snippet}\n` })
        }
        toast.success('图片已上传并插入正文')
      } else {
        toast.success('附件已上传（保存后随文章展示下载链接）')
      }
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const handleFilesChosen = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      uploadMutation.mutate(file)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const saveMutation = useMutation({
    mutationFn: async (input: DraftInput) => {
      if (savedPost) {
        return updatePostContent(savedPost, input)
      }
      return createDraft(input)
    },
    onSuccess: (updated, input) => {
      setSavedPost(updated)
      applySnapshot(
        contentOf({
          ...toState(updated),
          content: input.content,
        }),
      )
      setState((prev) => ({ ...prev, slugTouched: true }))
      toast.success('已保存')
      // 新建后跳到编辑路由（URL 与文档对齐）。
      if (!post) void navigate({ to: '/admin/$postId', params: { postId: updated.id }, replace: true })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const publishMutation = useMutation({
    mutationFn: ({ target, publish }: { target: Post; publish: boolean }) =>
      publish ? publishPost(target, auth.account?.id ?? '') : unpublishPost(target, auth.account?.id ?? ''),
    onSuccess: (updated, { publish }) => {
      setSavedPost(updated)
      toast.success(publish ? '已发布，文章现已公开可见' : '已撤回，文章回到仅自己可见')
      void queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (target: Post) => {
      const cleanup = await cleanupCommentsForPost({ data: { postId: target.id } })
      if (!cleanup.ok) throw new Error(cleanup.message)
      // 删除协议的存储级联：清理文章的附件对象。
      if (target.attachmentIds.length > 0) {
        await deleteStorageFiles({ data: { fileIds: target.attachmentIds } })
      }
      await deletePost(target)
    },
    onSuccess: () => {
      toast.success('文章已删除')
      void navigate({ to: '/admin', replace: true })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const previewHtml = useMemo(() => renderArticleHtml(state.content), [state.content])
  const busy = saveMutation.isPending || publishMutation.isPending || deleteMutation.isPending
  const canSave = state.title.trim().length > 0 && state.slug.trim().length > 0 && state.categoryId !== '' && !busy
  const words = countWords(state.content)

  const save = () => {
    if (!canSave) return
    saveMutation.mutate({
      title: state.title.trim(),
      slug: state.slug.trim(),
      content: state.content,
      categoryId: state.categoryId,
      tagIds: state.tagIds,
      attachmentIds: state.attachmentIds,
    })
  }

  // ⌘S / Ctrl+S 保存。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (canSave) save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const published = !!savedPost?.publishedAt

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2.5">
          <Button asChild variant="ghost" size="icon-sm" aria-label="返回列表">
            <Link to="/admin">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                'size-2 rounded-full',
                published ? 'bg-brand' : savedPost ? 'bg-muted-foreground/40' : 'bg-muted-foreground/40',
              )}
              aria-hidden
            />
            <span className="font-semibold">{savedPost ? '编辑文章' : '新建文章'}</span>
            <span className="text-muted-foreground">
              {published ? `· 发布于 ${formatDate(savedPost.publishedAt)}` : '· 草稿仅自己可见'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {savedPost?.publishedAt ? (
            <>
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <a href={`/posts/${savedPost.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  查看
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={busy}
                onClick={() => savedPost && publishMutation.mutate({ target: savedPost, publish: false })}
              >
                <Eye className="size-4" />
                撤回发布
              </Button>
            </>
          ) : savedPost ? (
            <Button
              size="sm"
              className="rounded-full px-4"
              disabled={busy || isDirty}
              onClick={() => savedPost && publishMutation.mutate({ target: savedPost, publish: true })}
            >
              <Eye className="size-4" />
              发布
            </Button>
          ) : null}
          {savedPost ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => setPendingDelete(true)}
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_250px]">
        {/* 书写区（Ghost 式无边框） */}
        <div className="min-w-0">
          <input
            value={state.title}
            onChange={(e) =>
              patch({
                title: e.target.value,
                slug: state.slugTouched ? state.slug : slugify(e.target.value),
              })
            }
            placeholder="文章标题"
            className="w-full bg-transparent text-3xl font-extrabold tracking-tight outline-none placeholder:text-muted-foreground/40"
            aria-label="标题"
          />

          <Tabs
            value={state.preview ? 'preview' : 'write'}
            onValueChange={(v) => patch({ preview: v === 'preview' })}
            className="mt-5 gap-0"
          >
            <div className="flex items-center justify-between border-b pb-2">
              <TabsList className="h-7 bg-transparent p-0">
                <TabsTrigger
                  value="write"
                  className="px-0 text-[13px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground"
                >
                  编辑
                </TabsTrigger>
                <span className="px-2 text-border">/</span>
                <TabsTrigger
                  value="preview"
                  className="px-0 text-[13px] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground"
                >
                  预览
                </TabsTrigger>
              </TabsList>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif,application/pdf,text/plain,video/*,audio/*"
                onChange={(e) => handleFilesChosen(e.target.files)}
              />
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                disabled={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileUp className="size-3.5" />
                )}
                上传图片 / 附件
              </Button>
            </div>

            <TabsContent value="write" className="mt-0">
              <Textarea
                ref={textareaRef}
                className="min-h-[30rem] resize-none rounded-none border-0 bg-transparent px-0 py-5 font-mono text-[15px] leading-8 shadow-none focus-visible:ring-0"
                value={state.content}
                onChange={(e) => patch({ content: e.target.value })}
                placeholder={'用 Markdown 写作……\n\n## 标题\n\n正文支持 **加粗**、列表、代码块与图片。'}
                spellCheck={false}
              />
            </TabsContent>
            <TabsContent value="preview" className="mt-0">
              {state.content.trim() ? (
                <div
                  className="prose prose-zinc dark:prose-invert max-w-none py-5"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <p className="py-24 text-center text-sm text-muted-foreground">暂无内容可预览</p>
              )}
            </TabsContent>

            <div className="flex items-center justify-between border-t py-3 text-xs text-muted-foreground">
              <span>
                {words} 字 · 约 {readingMinutes(state.content)} 分钟
              </span>
              <span className="hidden sm:inline">⌘S 快速保存</span>
            </div>
          </Tabs>
        </div>

        {/* 设置栏（发丝线分区，无卡片框） */}
        <aside className="space-y-7 lg:sticky lg:top-24 lg:self-start">
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">发布状态</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className={cn('size-2 rounded-full', published ? 'bg-brand' : 'bg-muted-foreground/40')} />
              <span className="font-medium">{published ? '已发布' : savedPost ? '草稿' : '未保存'}</span>
              {isDirty ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">· 有未保存的修改</span>
              ) : savedPost ? (
                <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Check className="size-3" />
                  已是最新
                </span>
              ) : null}
            </div>
            <Button className="w-full" disabled={!canSave} onClick={save}>
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {savedPost ? '保存修改' : '保存为草稿'}
            </Button>
          </section>

          <section className="space-y-2 border-t pt-6">
            <Label htmlFor="slug" className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Slug
            </Label>
            <Input
              id="slug"
              value={state.slug}
              onChange={(e) => patch({ slug: slugify(e.target.value), slugTouched: true })}
              placeholder="自动按标题生成"
            />
            <p className="text-xs text-muted-foreground">/posts/&lt;slug&gt;</p>
          </section>

          <section className="space-y-2 border-t pt-6">
            <Label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">分类</Label>
            <Select value={state.categoryId} onValueChange={(value) => patch({ categoryId: value })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-2 border-t pt-6">
            <Label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">标签</Label>
            <div className="flex flex-wrap gap-1.5">
              {(tags.data ?? []).map((tag) => {
                const active = state.tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patch({
                        tagIds: active
                          ? state.tagIds.filter((id) => id !== tag.id)
                          : [...state.tagIds, tag.id],
                      })
                    }
                  >
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                        active
                          ? 'border-transparent bg-primary font-medium text-primary-foreground'
                          : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                      )}
                    >
                      #{tag.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-2 border-t pt-6">
            <Label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">附件</Label>
            {(attachments.data ?? []).length > 0 || state.attachmentIds.length > 0 ? (
              <ul className="space-y-1.5">
                {state.attachmentIds.map((id) => {
                  const ref = (attachments.data ?? []).find((f) => f.id === id)
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {ref?.isImage ? (
                          <img src={ref.previewUrl} alt="" className="h-6 w-6 rounded object-cover" />
                        ) : (
                          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{ref?.name ?? id}</span>
                        {ref ? <span className="shrink-0 text-muted-foreground">{formatBytes(ref.size)}</span> : null}
                      </span>
                      <button
                        type="button"
                        aria-label="移除附件"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => patch({ attachmentIds: state.attachmentIds.filter((x) => x !== id) })}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                图片会以内联形式插入正文；其他文件保存后出现在文章附件区。
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* 删除确认 */}
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这篇文章？</AlertDialogTitle>
            <AlertDialogDescription>
              将同时删除它的全部评论与附件，操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                if (savedPost) deleteMutation.mutate(savedPost)
                setPendingDelete(false)
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 未保存离开确认 */}
      <AlertDialog
        open={confirmLeave}
        onOpenChange={(open) => {
          if (!open && blocker.status === 'blocked') blocker.reset()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
            <AlertDialogDescription>离开当前页面将丢失未保存的内容，确定要离开吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.status === 'blocked' && blocker.reset()}>
              留在本页
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => blocker.status === 'blocked' && blocker.proceed()}
            >
              放弃修改并离开
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

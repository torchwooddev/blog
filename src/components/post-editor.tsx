import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, FileUp, Loader2, Paperclip, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
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
import { formatBytes } from '#/lib/format'
import { renderMarkdown } from '#/lib/markdown'
import { categoriesOptions, filesOptions, tagsOptions } from '#/lib/query-options'
import { slugify } from '#/lib/types'
import { cleanupCommentsForPost } from '#/server/admin.functions'
import { deleteStorageFiles } from '#/server/storage.functions'
import { useAuth } from '#/lib/torchwood-client'
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
    content: post?.content ?? '## 标题\n\n用 **markdown** 写点什么……\n',
    categoryId: post?.categoryId ?? '',
    tagIds: post?.tagIds ?? [],
    attachmentIds: post?.attachmentIds ?? [],
    slugTouched: !!post,
    preview: false,
  }
}

export function PostEditor({ post }: PostEditorProps) {
  const auth = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [state, setState] = useState<EditorState>(() => toState(post))
  const [savedPost, setSavedPost] = useState<Post | null>(post)

  const categories = useQuery(categoriesOptions())
  const tags = useQuery(tagsOptions())
  const attachments = useQuery(filesOptions(state.attachmentIds))
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setState(toState(post))
    setSavedPost(post)
  }, [post])

  const patch = (next: Partial<EditorState>) => setState((prev) => ({ ...prev, ...next }))

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
        toast.success('图片已上传并插入 markdown')
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
        const updated = await updatePostContent(savedPost, input)
        return updated
      }
      const created = await createDraft(input)
      return created
    },
    onSuccess: (updated) => {
      setSavedPost(updated)
      setState((prev) => ({ ...prev, slugTouched: true }))
      toast.success('已保存（OCC version 校验通过）')
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
      toast.success(publish ? '已发布（read:any ACE 已授予）' : '已撤回（回到创建者私有）')
      void queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (target: Post) => {
      const cleanup = await cleanupCommentsForPost({ data: { postId: target.id } })
      if (!cleanup.ok) throw new Error(cleanup.message)
      // 删除协议的存储级联：清理文章的附件对象（Server 面 deleteFile）。
      if (target.attachmentIds.length > 0) {
        await deleteStorageFiles({ data: { fileIds: target.attachmentIds } })
      }
      await deletePost(target)
    },
    onSuccess: () => {
      toast.success('文章已删除（评论与附件已级联清理）')
      void navigate({ to: '/admin', replace: true })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const previewHtml = useMemo(() => renderMarkdown(state.content), [state.content])
  const busy = saveMutation.isPending || publishMutation.isPending || deleteMutation.isPending
  const canSave = state.title.trim().length > 0 && state.slug.trim().length > 0 && state.categoryId !== '' && !busy

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{savedPost ? '编辑文章' : '新建文章'}</h1>
          <p className="text-sm text-muted-foreground">
            保存即创建<strong>草稿</strong>——文档级 ACL 下只有你能看见它；发布才公开。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin">返回列表</Link>
          </Button>
          {savedPost?.publishedAt ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => savedPost && publishMutation.mutate({ target: savedPost, publish: false })}
            >
              <Eye className="size-4" />
              撤回发布
            </Button>
          ) : savedPost ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => savedPost && publishMutation.mutate({ target: savedPost, publish: true })}
            >
              <Eye className="size-4" />
              发布
            </Button>
          ) : null}
          {savedPost ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => savedPost && deleteMutation.mutate(savedPost)}
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          ) : null}
        </div>
      </header>

      {savedPost?.publishedAt ? (
        <Alert>
          <AlertTitle>已发布 · {savedPost.publishedAt}</AlertTitle>
          <AlertDescription>
            文档 ACE：<code className="rounded bg-muted px-1">{savedPost.permissions.join(', ')}</code> ——
            read:any 让任何访问者（包括 Server 面的 SSR/API Key）可见。
          </AlertDescription>
        </Alert>
      ) : savedPost ? (
        <Alert>
          <AlertTitle>草稿（创建者私有）</AlertTitle>
          <AlertDescription>
            空 ACE 种子只授予 <code className="rounded bg-muted px-1">user:{auth.account?.id}</code>
            ；公开列表、RSS、其他用户都看不到这篇文章。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">正文（Markdown）</CardTitle>
              <div className="flex items-center gap-1 text-sm">
                <Button
                  variant={state.preview ? 'ghost' : 'secondary'}
                  size="sm"
                  onClick={() => patch({ preview: false })}
                >
                  编辑
                </Button>
                <Button
                  variant={state.preview ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => patch({ preview: true })}
                >
                  预览
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif,application/pdf,text/plain,video/*,audio/*"
                onChange={(e) => handleFilesChosen(e.target.files)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploadMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileUp className="size-4" />
                )}
                上传图片 / 附件
              </Button>
              {state.preview ? (
                <div
                  className="prose prose-zinc dark:prose-invert max-w-none min-h-72"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <Textarea
                  ref={textareaRef}
                  className="min-h-72 font-mono text-sm"
                  value={state.content}
                  onChange={(e) => patch({ content: e.target.value })}
                  spellCheck={false}
                />
              )}
            </CardContent>
          </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">元信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">标题</Label>
                <Input
                  id="title"
                  value={state.title}
                  onChange={(e) =>
                    patch({
                      title: e.target.value,
                      slug: state.slugTouched ? state.slug : slugify(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug（唯一索引）</Label>
                <Input
                  id="slug"
                  value={state.slug}
                  onChange={(e) => patch({ slug: slugify(e.target.value), slugTouched: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>分类（1:N 引用属性）</Label>
                <Select
                  value={state.categoryId}
                  onValueChange={(value) => patch({ categoryId: value })}
                >
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
              </div>
              <div className="space-y-2">
                <Label>标签（M:N 数组属性）</Label>
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
                        <Badge variant={active ? 'default' : 'outline'} className="hover:bg-accent">
                          #{tag.name}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  已保存文章的标签变更走 <code className="rounded bg-muted px-1">arrayUpdates</code>（APPEND/REMOVE 原子算子）。
                </p>
              </div>
              <div className="space-y-2">
                <Label>附件（Storage 公开桶）</Label>
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
                            onClick={() =>
                              patch({ attachmentIds: state.attachmentIds.filter((x) => x !== id) })
                            }
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    图片会以内联 markdown 插入正文；其他文件保存后出现在文章附件区。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" disabled={!canSave} onClick={save}>
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {savedPost ? '保存修改' : '保存为草稿'}
          </Button>
          {savedPost ? (
            <p className="text-center text-xs text-muted-foreground">
              文档 {savedPost.id} · OCC v{savedPost.version}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )

  function save() {
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
}

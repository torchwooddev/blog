import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Eye, Loader2, Save, Trash2 } from 'lucide-react'
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
  type DraftInput,
} from '#/lib/admin-client'
import { describeError } from '#/lib/errors'
import { renderMarkdown } from '#/lib/markdown'
import { categoriesOptions, tagsOptions } from '#/lib/query-options'
import { slugify } from '#/lib/types'
import { cleanupCommentsForPost } from '#/server/admin.functions'
import { useAuth } from '#/lib/torchwood-client'
import type { Post } from '#/lib/types'

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

  useEffect(() => {
    setState(toState(post))
    setSavedPost(post)
  }, [post])

  const patch = (next: Partial<EditorState>) => setState((prev) => ({ ...prev, ...next }))

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
      await deletePost(target)
    },
    onSuccess: () => {
      toast.success('文章已删除（评论已级联清理）')
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
          <CardContent>
            {state.preview ? (
              <div
                className="prose prose-zinc dark:prose-invert max-w-none min-h-72"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <Textarea
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
    })
  }
}

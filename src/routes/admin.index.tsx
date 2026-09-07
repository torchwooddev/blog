import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { Eye, EyeOff, FileEdit, FilePlus2, FileText, Inbox, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CategoryManager } from '#/components/category-manager'
import { EmptyState } from '#/components/empty-state'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
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
import { Skeleton } from '#/components/ui/skeleton'
import {
  deletePost,
  fetchMyPosts,
  publishPost,
  unpublishPost,
} from '#/lib/admin-client'
import { publicConfig } from '#/lib/config'
import { describeError } from '#/lib/errors'
import { formatDate, formatRelative } from '#/lib/format'
import { countWords, readingMinutes } from '#/lib/post-utils'
import { cleanupCommentsForPost } from '#/server/admin.functions'
import { deleteStorageFiles } from '#/server/storage.functions'
import { useAuth } from '#/lib/torchwood-client'
import type { Post } from '#/lib/types'

type StatusFilter = 'all' | 'published' | 'draft'

export const Route = createFileRoute('/admin/')({
  head: () => ({
    meta: [
      { title: `写作台 · ${publicConfig.siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminPage,
})

function AdminPage() {
  const auth = useAuth()

  if (auth.status === 'restoring') return <AdminSkeleton />
  // 客户端守卫：未登录不允许进入写作台。
  if (auth.status === 'signedOut' || !auth.account) return <Navigate to="/login" replace />
  return <AdminHome userId={auth.account.id} />
}

function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-8 w-44" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function AdminHome({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<Post | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const myPosts = useQuery({
    queryKey: ['admin', 'my-posts', userId],
    queryFn: () => fetchMyPosts(userId),
  })

  const posts = myPosts.data ?? []
  const publishedCount = useMemo(() => posts.filter((p) => p.publishedAt).length, [posts])
  const draftCount = posts.length - publishedCount
  const visible = posts.filter((p) =>
    filter === 'all' ? true : filter === 'published' ? p.publishedAt : !p.publishedAt,
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'my-posts', userId] })
    void queryClient.invalidateQueries({ queryKey: ['posts'] })
    void queryClient.invalidateQueries({ queryKey: ['categories'] })
    void queryClient.invalidateQueries({ queryKey: ['tags'] })
  }

  const publishMutation = useMutation({
    mutationFn: ({ post, publish }: { post: Post; publish: boolean }) =>
      publish ? publishPost(post, userId) : unpublishPost(post, userId),
    onSuccess: (_updated, { publish }) => {
      toast.success(publish ? '已发布：文章现已公开可见' : '已撤回：文章回到仅自己可见')
      invalidate()
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const removeMutation = useMutation({
    // 删除协议：先级联清理评论与附件对象，再删除文档本体（带乐观锁版本）。
    mutationFn: async (post: Post) => {
      const cleanup = await cleanupCommentsForPost({ data: { postId: post.id } })
      if (cleanup.ok && cleanup.affected > 0) {
        toast.info(`已同时删除 ${cleanup.affected} 条评论`)
      }
      if (post.attachmentIds.length > 0) {
        await deleteStorageFiles({ data: { fileIds: post.attachmentIds } })
      }
      await deletePost(post)
    },
    onSuccess: () => {
      toast.success('文章已删除')
      setPendingDelete(null)
      invalidate()
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  useEffect(() => {
    if (myPosts.isError) toast.error(describeError(myPosts.error))
  }, [myPosts.isError, myPosts.error])

  const FILTERS: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: posts.length },
    { key: 'published', label: '已发布', count: publishedCount },
    { key: 'draft', label: '草稿', count: draftCount },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">写作台</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">管理你的文章与分类。</p>
        </div>
        <Button asChild>
          <Link to="/admin/new">
            <FilePlus2 className="size-4" />
            新建文章
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="文章总数" value={posts.length} />
        <StatCard label="已发布" value={publishedCount} hint="对所有人可见" />
        <StatCard label="草稿" value={draftCount} hint="仅自己可见" />
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-1 rounded-lg border p-1" role="tablist" aria-label="按状态筛选">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors sm:flex-none ${
                filter === f.key
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{f.count}</span>
            </button>
          ))}
        </div>

        {myPosts.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={posts.length === 0 ? Inbox : FileText}
            title={posts.length === 0 ? '还没有文章' : `没有${FILTERS.find((f) => f.key === filter)?.label ?? ''}的文章`}
            description={
              posts.length === 0
                ? '写下第一篇吧：保存后即为草稿，发布后公开可见。'
                : '切换筛选条件查看其他文章。'
            }
            action={
              posts.length === 0 ? (
                <Button asChild size="sm">
                  <Link to="/admin/new">
                    <FilePlus2 className="size-4" />
                    新建文章
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y rounded-xl border">
            {visible.map((post) => (
              <li key={post.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/admin/$postId"
                      params={{ postId: post.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {post.title || '（无标题）'}
                    </Link>
                    {post.publishedAt ? (
                      <Badge className="bg-primary/10 text-primary">已发布</Badge>
                    ) : (
                      <Badge variant="secondary">草稿</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {post.publishedAt ? (
                      <>
                        发布于 {formatDate(post.publishedAt)} ·{' '}
                      </>
                    ) : null}
                    约 {readingMinutes(post.content)} 分钟 · {countWords(post.content)} 字 · 更新于{' '}
                    {formatRelative(post.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/admin/$postId" params={{ postId: post.id }}>
                      <FileEdit className="size-4" />
                      编辑
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={publishMutation.isPending}
                    onClick={() => publishMutation.mutate({ post, publish: !post.publishedAt })}
                  >
                    {post.publishedAt ? (
                      <>
                        <EyeOff className="size-4" />
                        撤回
                      </>
                    ) : (
                      <>
                        <Eye className="size-4" />
                        发布
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(post)}
                  >
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CategoryManager onChange={invalidate} />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{pendingDelete?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将同时删除这篇文章的全部评论与附件，操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                if (pendingDelete) removeMutation.mutate(pendingDelete)
              }}
            >
              {removeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

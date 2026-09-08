import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { Eye, EyeOff, FileEdit, FilePlus2, Inbox, Loader2, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CategoryManager } from '#/components/category-manager'
import { EmptyState } from '#/components/empty-state'
import { ReaderNotice } from '#/components/reader-notice'
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
import { authedHeaders } from '#/lib/authed-call'
import { formatDate, formatRelative } from '#/lib/format'
import { countWords, readingMinutes } from '#/lib/post-utils'
import { cleanupCommentsForPost } from '#/server/admin.functions'
import { deleteStorageFiles } from '#/server/storage.functions'
import { useAuth } from '#/lib/torchwood-client'
import { useMyGroup } from '#/lib/user-group-client'
import { USER_GROUPS, type UserGroupKey } from '#/lib/user-groups'
import { cn } from 'cn'
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
  return <AdminEntrance userId={auth.account.id} />
}

/**
 * 用户组守卫：读者组不可进入写作台（可以阅读与评论）。组未知（查询失败）
 * 时保守放行——与既有"登录即可写作"行为一致，避免网络抖动锁死作者。
 */
function AdminEntrance({ userId }: { userId: string }) {
  const group = useMyGroup(userId)
  if (group.isPending) return <AdminSkeleton />
  if (group.data === 'reader') return <ReaderNotice />
  return <AdminHome userId={userId} viewerGroup={group.data ?? 'author'} />
}

function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <Skeleton className="h-9 w-36" />
      <div className="space-y-1">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

function StatusDot({ published }: { published: boolean }) {
  return published ? (
    <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="已发布" />
  ) : (
    <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-label="草稿" />
  )
}

function AdminHome({ userId, viewerGroup }: { userId: string; viewerGroup: UserGroupKey }) {
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
    // 级联 server function 的 handler 校验终端用户 JWT（B-01），需附带 Authorization 头。
    mutationFn: async (post: Post) => {
      const headers = await authedHeaders()
      const cleanup = await cleanupCommentsForPost({ data: { postId: post.id }, headers })
      if (cleanup.ok && cleanup.affected > 0) {
        toast.info(`已同时删除 ${cleanup.affected} 条评论`)
      }
      if (post.attachmentIds.length > 0) {
        await deleteStorageFiles({ data: { fileIds: post.attachmentIds }, headers })
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
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">写作台</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            共 {posts.length} 篇 · 已发布 {publishedCount} · 草稿 {draftCount} ·{' '}
            <span title={USER_GROUPS[viewerGroup].description}>
              你的用户组：{USER_GROUPS[viewerGroup].name}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewerGroup === 'admin' ? (
            <Button asChild size="sm" variant="outline" className="rounded-full px-4">
              <Link to="/admin/users">
                <Users className="size-4" />
                用户管理
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm" className="rounded-full px-4">
            <Link to="/admin/new">
              <FilePlus2 className="size-4" />
              新建文章
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="按状态筛选">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[13px] transition-colors',
              filter === f.key
                ? 'border-transparent bg-primary font-semibold text-primary-foreground'
                : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            {f.label}
            <span className={cn('ml-1.5 text-xs', filter === f.key ? 'opacity-70' : 'opacity-60')}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {myPosts.isLoading ? (
        <div className="space-y-1">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={posts.length === 0 ? Inbox : FileEdit}
          title={posts.length === 0 ? '还没有文章' : `没有${FILTERS.find((f) => f.key === filter)?.label ?? ''}的文章`}
          description={
            posts.length === 0
              ? '写下第一篇吧：保存后即为草稿，发布后公开可见。'
              : '切换筛选条件查看其他文章。'
          }
          action={
            posts.length === 0 ? (
              <Button asChild size="sm" className="rounded-full">
                <Link to="/admin/new">
                  <FilePlus2 className="size-4" />
                  新建文章
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y">
          {visible.map((post) => (
            <li key={post.id} className="group flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <StatusDot published={!!post.publishedAt} />
              <div className="min-w-0 flex-1">
                <Link
                  to="/admin/$postId"
                  params={{ postId: post.id }}
                  className="link-underline block truncate text-[15px] font-semibold"
                >
                  {post.title || '（无标题）'}
                </Link>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {post.publishedAt ? `发布于 ${formatDate(post.publishedAt)} · ` : ''}
                  {readingMinutes(post.content)} 分钟 · {countWords(post.content)} 字 · 更新于{' '}
                  {formatRelative(post.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={post.publishedAt ? '撤回' : '发布'}
                  disabled={publishMutation.isPending}
                  onClick={() => publishMutation.mutate({ post, publish: !post.publishedAt })}
                >
                  {post.publishedAt ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button asChild variant="ghost" size="icon-sm" title="编辑">
                  <Link to="/admin/$postId" params={{ postId: post.id }}>
                    <FileEdit className="size-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  title="删除"
                  onClick={() => setPendingDelete(post)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Eye, EyeOff, FileEdit, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryManager } from '#/components/category-manager'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Skeleton } from '#/components/ui/skeleton'
import {
  deletePost,
  fetchMyPosts,
  publishPost,
  unpublishPost,
} from '#/lib/admin-client'
import { publicConfig } from '#/lib/config'
import { describeError } from '#/lib/errors'
import { formatDate } from '#/lib/format'
import { cleanupCommentsForPost } from '#/server/admin.functions'
import { deleteStorageFiles } from '#/server/storage.functions'
import { useAuth } from '#/lib/torchwood-client'
import type { Post } from '#/lib/types'

export const Route = createFileRoute('/admin/')({
  head: () => ({ meta: [{ title: `作者台 · ${publicConfig.siteName}` }] }),
  component: AdminPage,
})

function AdminPage() {
  const auth = useAuth()

  if (auth.status === 'restoring') return <AdminSkeleton />
  // 客户端守卫：未登录不允许进入作者台。
  if (auth.status === 'signedOut' || !auth.account) return <Navigate to="/login" replace />
  return <AdminHome userId={auth.account.id} />
}

function AdminSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  )
}

function AdminHome({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<Post | null>(null)

  const myPosts = useQuery({
    queryKey: ['admin', 'my-posts', userId],
    queryFn: () => fetchMyPosts(userId),
  })

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
      toast.success(publish ? '已发布：文章获得 read:any ACE，现在公开可见' : '已撤回：文章回到仅自己可见')
      invalidate()
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const removeMutation = useMutation({
    // 删除协议（1:N comments / Storage 附件的级联）：先让服务端清空评论与附件
    // 对象，再删文档本体（OCC version）。
    mutationFn: async (post: Post) => {
      const cleanup = await cleanupCommentsForPost({ data: { postId: post.id } })
      if (cleanup.ok) {
        toast.info(`已级联清理 ${cleanup.affected} 条评论`)
      }
      if (post.attachmentIds.length > 0) {
        const removed = await deleteStorageFiles({ data: { fileIds: post.attachmentIds } })
        toast.info(`已级联清理 ${removed} 个附件`)
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">作者台</h1>
          <p className="text-sm text-muted-foreground">
            所有写操作（建文 / 编辑 / 发布 / 删除）都是浏览器直连 Torchwood Client API。
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/new">
            <Plus className="size-4" />
            新建文章
          </Link>
        </Button>
      </header>

      <section className="space-y-3">
        <h2 className="font-medium">我的文章（含草稿）</h2>
        {myPosts.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (myPosts.data?.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              还没有文章。点右上角「新建文章」，第一篇草稿就只有你能看见。
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {(myPosts.data ?? []).map((post) => (
              <li key={post.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/admin/$postId"
                          params={{ postId: post.id }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {post.title}
                        </Link>
                        {post.publishedAt ? (
                          <Badge>已发布</Badge>
                        ) : (
                          <Badge variant="secondary">草稿（仅你可见）</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        /posts/{post.slug} · v{post.version} · 更新于 {formatDate(post.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
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
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CategoryManager onChange={invalidate} />

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除「{pendingDelete?.title}」？</DialogTitle>
            <DialogDescription>
              将按删除协议执行：先由服务端级联清理该文章的评论（Server 面 bulk
              删除）与附件对象（Storage deleteFile），再删除文章本体（OCC
              version）。此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => pendingDelete && removeMutation.mutate(pendingDelete)}
            >
              {removeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

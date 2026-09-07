import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PostEditor } from '#/components/post-editor'
import { Skeleton } from '#/components/ui/skeleton'
import { publicConfig } from '#/lib/config'
import { fetchMyPost } from '#/lib/admin-client'
import { useAuth } from '#/lib/torchwood-client'
import type { Post } from '#/lib/types'

export const Route = createFileRoute('/admin/$postId')({
  head: () => ({ meta: [{ title: `编辑文章 · ${publicConfig.siteName}` }] }),
  component: AdminEditPage,
})

/**
 * 编辑数据完全在客户端加载（Client 面直读）：草稿只有属主可见。
 * SSR 阶段无法也不应该读到会话，因此这里不做服务端取数。
 */
function AdminEditPage() {
  const { postId } = Route.useParams()
  const auth = useAuth()
  const [post, setPost] = useState<Post | null | 'loading'>('loading')

  useEffect(() => {
    if (auth.status !== 'signedIn') return
    setPost('loading')
    void fetchMyPost(postId).then((result) => setPost(result))
  }, [auth.status, postId])

  if (auth.status === 'signedOut') return <Navigate to="/login" replace />
  if (auth.status === 'restoring' || post === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (post === null) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        这篇文章不存在，或者它不属于你（文档级 ACL：他人的草稿对你 404）。
      </div>
    )
  }
  return <PostEditor post={post} />
}

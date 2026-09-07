import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, FileX2 } from 'lucide-react'
import { PostEditor } from '#/components/post-editor'
import { EmptyState } from '#/components/empty-state'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { publicConfig } from '#/lib/config'
import { fetchMyPost } from '#/lib/admin-client'
import { useAuth } from '#/lib/torchwood-client'
import type { Post } from '#/lib/types'

export const Route = createFileRoute('/admin/$postId')({
  head: () => ({
    meta: [
      { title: `编辑文章 · ${publicConfig.siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminEditPage,
})

/**
 * 编辑数据完全在客户端加载（属主可见草稿）：
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
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-[26rem] w-full rounded-xl" />
      </div>
    )
  }
  if (post === null) {
    return (
      <EmptyState
        icon={FileX2}
        title="找不到这篇文章"
        description="它不存在，或者属于另一位作者——他人的草稿对外不可见。"
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <ArrowLeft className="size-4" />
              返回写作台
            </Link>
          </Button>
        }
      />
    )
  }
  return <PostEditor post={post} />
}

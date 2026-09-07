import { Navigate, createFileRoute } from '@tanstack/react-router'
import { PostEditor } from '#/components/post-editor'
import { Skeleton } from '#/components/ui/skeleton'
import { publicConfig } from '#/lib/config'
import { useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/admin/new')({
  head: () => ({
    meta: [
      { title: `新建文章 · ${publicConfig.siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminNewPage,
})

function AdminNewPage() {
  const auth = useAuth()
  if (auth.status === 'signedOut') return <Navigate to="/login" replace />
  if (auth.status === 'restoring' || !auth.account) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-[26rem] w-full rounded-xl" />
      </div>
    )
  }
  return <PostEditor post={null} />
}

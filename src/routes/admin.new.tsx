import { Navigate, createFileRoute } from '@tanstack/react-router'
import { PostEditor } from '#/components/post-editor'
import { publicConfig } from '#/lib/config'
import { useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/admin/new')({
  head: () => ({ meta: [{ title: `新建文章 · ${publicConfig.siteName}` }] }),
  component: AdminNewPage,
})

function AdminNewPage() {
  const auth = useAuth()
  if (auth.status === 'signedOut') return <Navigate to="/login" replace />
  if (auth.status === 'restoring' || !auth.account) {
    return <div className="py-20 text-center text-muted-foreground">正在恢复登录状态……</div>
  }
  return <PostEditor post={null} />
}

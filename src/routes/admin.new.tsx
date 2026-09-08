import { Navigate, createFileRoute } from '@tanstack/react-router'
import { PostEditor } from '#/components/post-editor'
import { ReaderNotice } from '#/components/reader-notice'
import { Skeleton } from '#/components/ui/skeleton'
import { settingsFromMatches } from '#/lib/site-settings'
import { useMyGroup } from '#/lib/user-group-client'
import { useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/admin/new')({
  head: ({ matches }) => ({
    meta: [
      { title: `新建文章 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminNewPage,
})

function AdminNewPage() {
  const auth = useAuth()
  const group = useMyGroup(auth.status === 'signedIn' ? auth.account?.id : undefined)
  if (auth.status === 'signedOut') return <Navigate to="/login" replace />
  // 读者组不可新建文章（组未知时保守放行，与写作台守卫一致）。
  if (group.data === 'reader') return <ReaderNotice />
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

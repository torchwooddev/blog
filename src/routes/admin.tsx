import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router'
import { AdminShell } from '#/components/admin-shell'
import { ReaderNotice } from '#/components/reader-notice'
import { Skeleton } from '#/components/ui/skeleton'
import { settingsFromMatches } from '#/lib/site-settings'
import { useMyGroup } from '#/lib/user-group-client'
import { useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/admin')({
  head: ({ matches }) => ({
    meta: [
      { name: 'robots', content: 'noindex' },
      { title: `工作台 · ${settingsFromMatches(matches).siteName}` },
    ],
  }),
  component: AdminLayout,
})

/**
 * 工作台布局路由：会话与用户组守卫在这里做一次，子页面（文章/新建/编辑/
 * 分类/用户/设置）只渲染工作区内容。
 *
 * - 未登录 → 跳登录页；恢复会话中 → 骨架屏；
 * - 读者组 → 提示页（可阅读与评论，不可写作）；
 * - 组未知（同步失败）→ 保守放行为作者，避免网络抖动锁死作者；
 * - 其余（管理员/作者）→ 控制台外壳（左侧菜单 + 右侧工作区）。
 */
function AdminLayout() {
  const auth = useAuth()
  const group = useMyGroup(auth.status === 'signedIn' ? auth.account?.id : undefined)

  if (auth.status === 'restoring' || group.isPending) return <LayoutSkeleton />
  if (auth.status === 'signedOut' || !auth.account) return <Navigate to="/login" replace />
  if (group.data === 'reader') return <ReaderNotice />
  return (
    <AdminShell viewer={auth.account} groupKey={group.data ?? 'author'}>
      <Outlet />
    </AdminShell>
  )
}

function LayoutSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-60 shrink-0 space-y-3 border-r p-4 md:block">
        <Skeleton className="h-7 w-28" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex-1 space-y-6 p-8">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  )
}

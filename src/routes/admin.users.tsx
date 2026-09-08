import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, CircleCheck, Search, ShieldAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '#/components/empty-state'
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
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { describeError } from '#/lib/errors'
import { formatDate } from '#/lib/format'
import { settingsFromMatches } from '#/lib/site-settings'
import { changeUserGroup, changeUserStatus, fetchBlogUsers, useMyGroup } from '#/lib/user-group-client'
import {
  USER_GROUP_ORDER,
  USER_GROUPS,
  USER_STATUS_LABELS,
  type BlogUserView,
  type UserGroupKey,
} from '#/lib/user-groups'
import { useAuth } from '#/lib/torchwood-client'
import { cn } from 'cn'

export const Route = createFileRoute('/admin/users')({
  head: ({ matches }) => ({
    meta: [
      { title: `用户管理 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const auth = useAuth()
  // 布局路由 /admin 已保证登录且可进工作台；这里只取当前用户 id。
  return <AdminUsersHome viewerId={auth.account?.id ?? ''} />
}

function UsersSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-10 w-full max-w-sm" />
      <div className="space-y-1">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

/** 管理员专用页：非管理员没有侧栏入口，直连 URL 由服务端判权拒绝、页面内给出提示。 */
function AdminUsersHome({ viewerId }: { viewerId: string }) {
  const group = useMyGroup(viewerId)
  const [keyword, setKeyword] = useState('')
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchBlogUsers,
    enabled: group.data === 'admin',
  })

  if (group.isPending) return <UsersSkeleton />
  // 仅管理员可进；读者/作者回工作台。
  if (group.data !== 'admin') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="需要管理员组权限"
        description="用户管理只对管理员组开放。"
      />
    )
  }

  const all = users.data ?? []
  const filtered = filterUsers(all, keyword)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">用户管理</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {users.isLoading
            ? '加载中…'
            : `共 ${all.length} 位用户 · 调整后立即生效`}
        </p>
      </header>

      {/* 搜索：按昵称/邮箱过滤（列表 ≤200 条，客户端过滤足够）。 */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索昵称或邮箱"
          aria-label="搜索用户"
          className="pl-9"
        />
      </div>

      {users.isLoading ? (
        <div className="space-y-1">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : users.isError ? (
        <EmptyState
          icon={ShieldAlert}
          title="用户列表加载失败"
          description={describeError(users.error)}
          action={
            <Button size="sm" variant="outline" onClick={() => users.refetch()}>
              重试
            </Button>
          }
        />
      ) : (
        <UserList users={filtered} totalCount={all.length} viewerId={viewerId} onChanged={() => users.refetch()} />
      )}
    </div>
  )
}

/** 按昵称/邮箱做不区分大小写的包含匹配。 */
function filterUsers(users: BlogUserView[], keyword: string): BlogUserView[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return users
  return users.filter(
    (u) => u.name.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw),
  )
}

function UserList({
  users,
  totalCount,
  viewerId,
  onChanged,
}: {
  users: BlogUserView[]
  totalCount: number
  viewerId: string
  onChanged: () => void
}) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [pendingBan, setPendingBan] = useState<BlogUserView | null>(null)

  const moveMutation = useMutation({
    mutationFn: async (input: { userId: string; group: UserGroupKey }) => {
      setPendingUserId(input.userId)
      await changeUserGroup(input)
    },
    onSuccess: (_void, { group }) => {
      toast.success(`已调整到${USER_GROUPS[group].name}组`)
      onChanged()
    },
    onError: (e: unknown) => toast.error(describeError(e)),
    onSettled: () => setPendingUserId(null),
  })

  const statusMutation = useMutation({
    mutationFn: async (input: { userId: string; status: 'active' | 'blocked'; name: string; ban: boolean }) => {
      setPendingUserId(input.userId)
      await changeUserStatus({ userId: input.userId, status: input.status })
      return { ban: input.ban, name: input.name }
    },
    onSuccess: ({ ban, name }) => {
      toast.success(ban ? `已封禁 ${name}` : `已解封 ${name}`)
      setPendingBan(null)
      onChanged()
    },
    onError: (e: unknown) => toast.error(describeError(e)),
    onSettled: () => setPendingUserId(null),
  })

  if (totalCount === 0) {
    return <EmptyState icon={Users} title="还没有注册用户" description="首个注册的用户将成为管理员。" />
  }
  if (users.length === 0) {
    return <EmptyState icon={Search} title="没有匹配的用户" description="换个昵称或邮箱关键词试试。" />
  }

  return (
    <>
      <ul className="divide-y">
        {users.map((user) => {
          const isSelf = user.id === viewerId
          const displayName = user.name || user.email.split('@')[0] || user.id.slice(0, 8)
          const busy = (moveMutation.isPending || statusMutation.isPending) && pendingUserId === user.id
          const banned = user.status === 'blocked'
          return (
            <li key={user.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 py-4', banned && 'opacity-70')}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  <span className="truncate">{displayName}</span>
                  {isSelf ? (
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">（我）</span>
                  ) : null}
                  {user.group ? (
                    <Badge variant="secondary" className="shrink-0">
                      {USER_GROUPS[user.group].name}
                    </Badge>
                  ) : (
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">未分组</span>
                  )}
                  {banned ? (
                    <Badge variant="destructive" className="shrink-0">
                      {USER_STATUS_LABELS.blocked}
                    </Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {user.email} · 注册于 {formatDate(user.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {banned ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => statusMutation.mutate({ userId: user.id, status: 'active', name: displayName, ban: false })}
                  >
                    <CircleCheck className="size-4" />
                    解封
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || isSelf}
                    title={isSelf ? '不能封禁自己的账号' : undefined}
                    onClick={() => setPendingBan(user)}
                  >
                    <Ban className="size-4" />
                    封禁
                  </Button>
                )}
                <Select
                  value={user.group ?? undefined}
                  disabled={busy}
                  onValueChange={(value) => {
                    if (!isUserGroupValue(value) || value === user.group) return
                    moveMutation.mutate({ userId: user.id, group: value })
                  }}
                >
                  <SelectTrigger size="sm" className="w-24" aria-label={`调整 ${displayName} 的用户组`}>
                    <SelectValue placeholder="未分组" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_GROUP_ORDER.map((key) => (
                      <SelectItem key={key} value={key}>
                        {USER_GROUPS[key].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </li>
          )
        })}
      </ul>

      {/* 封禁确认：不可逆感知较强的操作，先确认一次；解封是安全操作不做确认。 */}
      <AlertDialog open={pendingBan !== null} onOpenChange={(open) => !open && setPendingBan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>封禁「{pendingBan?.name || pendingBan?.email}」？</AlertDialogTitle>
            <AlertDialogDescription>
              封禁后该用户将无法登录，已有登录会话也会立即失效。解封后可恢复正常。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                if (pendingBan) {
                  statusMutation.mutate({
                    userId: pendingBan.id,
                    status: 'blocked',
                    name: pendingBan.name || pendingBan.email.split('@')[0],
                    ban: true,
                  })
                }
              }}
            >
              确认封禁
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Select 的 value 是泛化 string，收窄到 UserGroupKey（'' = 未分组，已在 value 层排除）。 */
function isUserGroupValue(value: string): value is UserGroupKey {
  return (USER_GROUP_ORDER as readonly string[]).includes(value)
}

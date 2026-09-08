import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, ShieldAlert, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '#/components/empty-state'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { publicConfig } from '#/lib/config'
import { describeError } from '#/lib/errors'
import { formatDate } from '#/lib/format'
import { changeUserGroup, fetchBlogUsers, useMyGroup } from '#/lib/user-group-client'
import { USER_GROUP_ORDER, USER_GROUPS, type BlogUserView, type UserGroupKey } from '#/lib/user-groups'
import { useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/admin/users')({
  head: () => ({
    meta: [
      { title: `用户管理 · ${publicConfig.siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const auth = useAuth()
  if (auth.status === 'restoring') return <UsersSkeleton />
  if (auth.status === 'signedOut' || !auth.account) return <Navigate to="/login" replace />
  return <AdminUsersHome viewerId={auth.account.id} />
}

function UsersSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <Skeleton className="h-9 w-36" />
      <div className="space-y-1">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

/** 管理员专用页：非管理员看不到合法入口，直连 URL 会被服务端判权拒绝。 */
function AdminUsersHome({ viewerId }: { viewerId: string }) {
  const group = useMyGroup(viewerId)
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchBlogUsers,
    enabled: group.data === 'admin',
  })

  if (group.isPending) return <UsersSkeleton />
  // 仅管理员可进；读者/作者回写作台。
  if (group.data !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={ShieldAlert}
          title="需要管理员组权限"
          description="用户管理只对管理员组开放。"
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/admin">
                <ArrowLeft className="size-4" />
                返回写作台
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">用户管理</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {users.isLoading ? '加载中…' : `共 ${users.data?.length ?? 0} 位用户 · 调整后立即生效`}
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="rounded-full px-4">
          <Link to="/admin">
            <ArrowLeft className="size-4" />
            返回写作台
          </Link>
        </Button>
      </header>

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
        <UserList users={users.data ?? []} viewerId={viewerId} onChanged={() => users.refetch()} />
      )}
    </div>
  )
}

function UserList({
  users,
  viewerId,
  onChanged,
}: {
  users: BlogUserView[]
  viewerId: string
  onChanged: () => void
}) {
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

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

  if (users.length === 0) {
    return (
      <EmptyState icon={Users} title="还没有注册用户" description="首个注册的用户将成为管理员。" />
    )
  }

  return (
    <ul className="divide-y">
      {users.map((user) => {
        const isSelf = user.id === viewerId
        const displayName = user.name || user.email.split('@')[0] || user.id.slice(0, 8)
        return (
          <li key={user.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-[15px] font-semibold">
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
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {user.email} · 注册于 {formatDate(user.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={user.group ?? undefined}
                disabled={moveMutation.isPending && pendingUserId === user.id}
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
  )
}

/** Select 的 value 是泛化 string，收窄到 UserGroupKey（'' = 未分组，已在 value 层排除）。 */
function isUserGroupValue(value: string): value is UserGroupKey {
  return (USER_GROUP_ORDER as readonly string[]).includes(value)
}

import { useQuery } from '@tanstack/react-query'
import type { BlogUserView, SettableUserStatus, UserGroupKey } from './user-groups'
import { errorStatus } from './errors'
import { authedHeaders } from './authed-call'
import { listBlogUsers, setUserGroup, setUserStatus, syncMyGroup } from '#/server/user-group.functions'
import { clearSession } from './torchwood-client'

/**
 * 用户组的客户端封装。
 *
 * 组归属的判定在服务端完成（client 面的 groups.listGroups 返回项目全部组、
 * 不按成员过滤，表达不了"我的组"），浏览器只拿结论：
 * - 登录/注册成功后调 syncMyGroupKey 落默认组；
 * - 管理台各页用 useMyGroup 做写作权限守卫（读者组拒绝）。
 */

/** 同步我的组：已在组内返回现组；未归组则按"首个用户=管理员，其余=读者"落组。
 * 收到 401（账号被封禁/未激活/会话失效）时服务端已拒绝该用户，同步清除本地会话。 */
export async function syncMyGroupKey(): Promise<UserGroupKey> {
  try {
    const headers = await authedHeaders()
    const result = await syncMyGroup({ headers })
    if (!result.ok) throw new Error(result.message)
    return result.group
  } catch (e) {
    if (errorStatus(e) === 401) clearSession()
    throw e
  }
}

/**
 * 我的组（react-query）。判定失败时 data 为 undefined——调用方按"未知"处理
 * （管理台保守放行，与既有"登录即可写作"行为一致，避免网络抖动锁死作者）。
 */
export function useMyGroup(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-group', userId],
    queryFn: syncMyGroupKey,
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: 1,
  })
}

/** 用户管理列表（服务端校验管理员组，非管理员返回 {ok:false}）。 */
export async function fetchBlogUsers(): Promise<BlogUserView[]> {
  const headers = await authedHeaders()
  const result = await listBlogUsers({ headers })
  if (!result.ok) throw new Error(result.message)
  return result.users
}

/** 调整用户组（管理员专用；服务端有末位管理员保护）。失败时抛错供 toast 呈现。 */
export async function changeUserGroup(input: { userId: string; group: UserGroupKey }): Promise<void> {
  const headers = await authedHeaders()
  const result = await setUserGroup({ data: input, headers })
  if (!result.ok) throw new Error(result.message)
}

/** 封禁/解封用户（管理员专用；服务端拒绝自封与封禁末位管理员）。 */
export async function changeUserStatus(input: { userId: string; status: SettableUserStatus }): Promise<void> {
  const headers = await authedHeaders()
  const result = await setUserStatus({ data: input, headers })
  if (!result.ok) throw new Error(result.message)
}

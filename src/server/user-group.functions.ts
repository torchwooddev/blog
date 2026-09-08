import { createServerFn } from '@tanstack/react-start'
import {
  isDeletedUserRow,
  isUserGroupKey,
  isUserStatus,
  type ListBlogUsersResult,
  type SetUserGroupResult,
  type SetUserStatusResult,
  type SettableUserStatus,
  type SyncGroupResult,
  type UserGroupKey,
} from '#/lib/user-groups'
import { getServerFnRequest, requireAdmin, requireAuthenticatedUser } from './auth.server'
import { getUserGroups, listAcceptedMemberships } from './groups.server'
import { getServerTorchwood } from './torchwood.server'

/**
 * 用户组相关 server functions。
 *
 * 鉴权（B-01 同款纪律）：server function 是可直调的 HTTP 端点，客户端调用点
 * 必须经 ensureFreshAccessToken 附带 Authorization 头；handler 入口先校验
 * 终端用户 JWT，特权动作（用户列表、调整组、站点配置）再校验管理员组成员
 * （requireAdmin 位于 auth.server.ts）。结果一律用判别联合而不是抛错："不是
 * 管理员"是正常业务分支，需要结构化返回驱动 UI（toast / 隐藏入口）。
 */

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const auth = await requireAuthenticatedUser(getServerFnRequest())
  return auth.ok ? { ok: true, userId: auth.userId } : { ok: false, message: auth.message }
}

/**
 * 分组同步（登录/注册后与管理台守卫共用）：
 * 已在组内 → 返回现组；未归组 → 落默认组。默认规则：管理员组为空时
 * （首个注册用户）归入管理员组，否则归入读者组。
 *
 * 并发窗口：两个未归组用户同时同步可能都被判为"首个"而双双成为管理员——
 * 后端无跨组事务可用，博客规模下可接受，不做额外仲裁。
 */
export const syncMyGroup = createServerFn({ method: 'POST' })
  .validator((input: unknown) => (input ?? {}) as Record<string, never>)
  .handler(async (): Promise<SyncGroupResult> => {
    const auth = await requireUserId()
    if (!auth.ok) return auth
    const tw = getServerTorchwood()
    const groups = await getUserGroups(tw)
    const memberships = await listAcceptedMemberships(tw, groups)
    const mine = memberships.find((m) => m.membership.user_id === auth.userId)
    if (mine) return { ok: true, group: mine.key }
    const target: UserGroupKey = memberships.some((m) => m.key === 'admin') ? 'reader' : 'admin'
    try {
      await tw.server.groups.createMembership(groups[target].id, {
        user_id: auth.userId,
        status: 'accepted',
      })
    } catch (e) {
      // 并发重试等场景下"已存在"不算失败：回读归属即可。
      const refreshed = await listAcceptedMemberships(tw, groups)
      const now = refreshed.find((m) => m.membership.user_id === auth.userId)
      if (!now) return { ok: false, message: e instanceof Error ? e.message : String(e) }
      return { ok: true, group: now.key }
    }
    return { ok: true, group: target }
  })

/** 用户管理列表：users.list 与三组成员表合并（Server 面才能列举用户）。
 * 排除已删除账号的匿名化残留（deleted-*@deleted.invalid——不可操作，展示无意义）。 */
export const listBlogUsers = createServerFn({ method: 'POST' })
  .validator((input: unknown) => (input ?? {}) as Record<string, never>)
  .handler(async (): Promise<ListBlogUsersResult> => {
    const auth = await requireAdmin()
    if (!auth.ok) return auth
    const tw = getServerTorchwood()
    const groups = await getUserGroups(tw)
    const memberships = await listAcceptedMemberships(tw, groups)
    const users = await tw.server.users.list({ page_size: 200 })
    const groupByUser = new Map(memberships.map((m) => [m.membership.user_id, m.key]))
    return {
      ok: true,
      users: users
        .filter((u) => !isDeletedUserRow(u.email))
        .map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          group: groupByUser.get(u.id) ?? null,
          status: isUserStatus(u.status) ? u.status : 'inactive',
          createdAt: u.created_at,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  })

/**
 * 封禁/解封用户（管理员专用）：blocked 后该账号的登录与既有会话立即失效
 * （后端对非 active 用户一律 401，探针确认）。保护规则：
 * - 不能封禁自己（否则操作者立即掉线，解封无人能做）；
 * - 不能封禁最后一个管理员（与"移出最后一个管理员"同一失败模式）。
 */
export const setUserStatus = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { userId?: unknown; status?: unknown }
    return {
      userId: typeof raw.userId === 'string' ? raw.userId.trim() : '',
      status: raw.status,
    }
  })
  .handler(async ({ data }): Promise<SetUserStatusResult> => {
    const auth = await requireAdmin()
    if (!auth.ok) return auth
    if (!data.userId) return { ok: false, message: 'userId 不能为空。' }
    if (!isUserStatus(data.status) || (data.status !== 'active' && data.status !== 'blocked')) {
      return { ok: false, message: '目标状态不合法（仅支持封禁/解封）。' }
    }
    const target: SettableUserStatus = data.status

    const tw = getServerTorchwood()
    if (data.userId === auth.userId && target === 'blocked') {
      return { ok: false, message: '不能封禁自己的账号。' }
    }
    const memberships = await listAcceptedMemberships(tw, await getUserGroups(tw))
    const targetIsAdmin = memberships.some((m) => m.key === 'admin' && m.membership.user_id === data.userId)
    const adminCount = memberships.filter((m) => m.key === 'admin').length
    if (target === 'blocked' && targetIsAdmin && adminCount <= 1) {
      return { ok: false, message: '至少需要保留一名可用管理员，无法封禁最后一个管理员。' }
    }
    try {
      const updated = await tw.server.users.update(data.userId, { status: target })
      return isUserStatus(updated.status) && updated.status === target
        ? { ok: true }
        : { ok: false, message: '状态更新未生效，请重试。' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

/**
 * 调整用户组（管理员专用）：先加入目标组（accepted）再移出其他组——中途失败
 * 也不会把用户挂在"无组"状态。末位管理员保护：不允许把最后一个管理员移出
 * 管理员组（否则系统失去管理能力，且"首个用户成为管理员"的引导无从恢复）。
 */
export const setUserGroup = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { userId?: unknown; group?: unknown }
    return {
      userId: typeof raw.userId === 'string' ? raw.userId.trim() : '',
      group: raw.group,
    }
  })
  .handler(async ({ data }): Promise<SetUserGroupResult> => {
    const auth = await requireAdmin()
    if (!auth.ok) return auth
    if (!data.userId) return { ok: false, message: 'userId 不能为空。' }
    if (!isUserGroupKey(data.group)) return { ok: false, message: '目标用户组不合法。' }
    const target = data.group

    const tw = getServerTorchwood()
    const groups = await getUserGroups(tw)
    const memberships = await listAcceptedMemberships(tw, groups)
    const current = memberships.filter((m) => m.membership.user_id === data.userId)
    const currentKeys = current.map((m) => m.key)
    if (currentKeys.length === 1 && currentKeys[0] === target) {
      return { ok: true, group: target }
    }
    const isLastAdminLeaving =
      currentKeys.includes('admin') &&
      target !== 'admin' &&
      memberships.filter((m) => m.key === 'admin').length === 1
    if (isLastAdminLeaving) {
      return { ok: false, message: '至少需要保留一名管理员，无法移出最后一个管理员。' }
    }
    try {
      if (!currentKeys.includes(target)) {
        await tw.server.groups.createMembership(groups[target].id, {
          user_id: data.userId,
          status: 'accepted',
        })
      }
      for (const m of current) {
        if (m.key !== target) {
          await tw.server.groups.deleteMembership(groups[m.key].id, m.membership.id)
        }
      }
      return { ok: true, group: target }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

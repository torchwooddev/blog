import type { Group, Membership, Torchwood } from '@torchwood/sdk'
import { USER_GROUP_ORDER, USER_GROUPS, type UserGroupKey } from '#/lib/user-groups'
import { getServerTorchwood } from './torchwood.server'

/**
 * 用户组供给与成员查询（Server 面，API Key）。
 *
 * Torchwood 的 group 不支持自定义 id，供给按 name 幂等：先 list 全部组，
 * 缺哪个补哪个，再回读解析 id。解析结果进程内缓存——组是项目级资源且
 * provision 单例保证初始化只跑一遍。
 *
 * 注意（探针验证过的网关语义）：client 面（用户 JWT）的 groups.listGroups
 * 返回项目**全部**组、不按成员过滤，无法表达"我的组"——所以"某用户在哪个组"
 * 的判定必须在服务端用 Server 面的 memberships 完成。
 */

let cachedGroups: Record<UserGroupKey, Group> | null = null

/** 确保三个用户组存在并解析其 id（幂等；结果进程内缓存）。 */
export async function getUserGroups(tw: Torchwood = getServerTorchwood()): Promise<Record<UserGroupKey, Group>> {
  if (cachedGroups) return cachedGroups
  const named = new Map((await tw.server.groups.list({ page_size: 100 })).map((g) => [g.name, g]))
  for (const key of USER_GROUP_ORDER) {
    if (!named.has(USER_GROUPS[key].name)) {
      await tw.server.groups.create({ name: USER_GROUPS[key].name })
    }
  }
  const resolved = {} as Record<UserGroupKey, Group>
  for (const group of await tw.server.groups.list({ page_size: 100 })) {
    const key = USER_GROUP_ORDER.find((k) => USER_GROUPS[k].name === group.name)
    if (key) resolved[key] = group
  }
  const missing = USER_GROUP_ORDER.filter((k) => !resolved[k])
  if (missing.length > 0) throw new Error(`用户组供给失败：创建后仍缺少 ${missing.map((k) => USER_GROUPS[k].name).join('、')}`)
  cachedGroups = resolved
  return resolved
}

/** 带组键的成员项（扁平的 membership 不知道自己属于哪个业务组）。 */
export interface GroupedMembership {
  key: UserGroupKey
  membership: Membership
}

/** 三个组全部 accepted 成员的并集（调整组、判定组归属都以这份为准）。 */
export async function listAcceptedMemberships(
  tw: Torchwood,
  groups: Record<UserGroupKey, Group>,
): Promise<GroupedMembership[]> {
  const out: GroupedMembership[] = []
  for (const key of USER_GROUP_ORDER) {
    const memberships = await tw.server.groups.listMemberships(groups[key].id, { page_size: 200 })
    for (const membership of memberships) {
      if (membership.status === 'accepted') out.push({ key, membership })
    }
  }
  return out
}

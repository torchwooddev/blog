/**
 * 用户组模型（浏览器与服务端共享的纯定义，无任何 IO）。
 *
 * 基于 Torchwood 的 group/membership：三个组按固定 name 幂等供给（Group id 由
 * 服务端生成），用户经 Membership（status=accepted）归属组。模型为"单组归属"：
 * 一个用户同一时刻只在一个组里，调整用户组 = 旧组移除 + 新组加入。
 *
 * - admin（管理员）：首个注册用户默认归入；可查看用户列表并调整他人用户组。
 * - author（作者）：可进入写作台创作、发布文章。
 * - reader（读者）：注册默认组；可阅读与评论，不可进入写作台。
 */

export const USER_GROUP_ORDER = ['admin', 'author', 'reader'] as const

export type UserGroupKey = (typeof USER_GROUP_ORDER)[number]

export interface UserGroupDef {
  key: UserGroupKey
  /** Torchwood Group.name（供给按名幂等匹配，创建后不要改名）。 */
  name: string
  description: string
}

export const USER_GROUPS: Record<UserGroupKey, UserGroupDef> = {
  admin: { key: 'admin', name: '管理员', description: '可写作、发布，并管理所有用户的用户组' },
  author: { key: 'author', name: '作者', description: '可进入写作台创作与发布文章' },
  reader: { key: 'reader', name: '读者', description: '可阅读与评论，不可进入写作台' },
}

export function isUserGroupKey(value: unknown): value is UserGroupKey {
  return typeof value === 'string' && (USER_GROUP_ORDER as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// server function 的结果形态（服务端返回、客户端消费）
// ---------------------------------------------------------------------------

/** syncMyGroup：登录/注册后的分组同步结果。 */
export type SyncGroupResult = { ok: true; group: UserGroupKey } | { ok: false; message: string }

/** 用户管理列表行（users.list 与三组成员表合并后的视图）。 */
export interface BlogUserView {
  id: string
  email: string
  name: string
  /** null = 尚未归入任何组（旧账号未同步过分组）。 */
  group: UserGroupKey | null
  createdAt: string
}

export type ListBlogUsersResult =
  | { ok: true; users: BlogUserView[] }
  | { ok: false; message: string }

export type SetUserGroupResult =
  | { ok: true; group: UserGroupKey }
  | { ok: false; message: string }

/**
 * blog 库的数据模型定义（与 README 中的模型表一一对应）。
 * 这里只有"定义"——真正执行 DDL 的供给代码在 src/server/provision.server.ts。
 *
 * 建模规约（docs/developer/16-document-modeling.md）：
 * - 1:N = 子集合引用属性（*_id string）+ key 索引；
 * - M:N = 主实体数组属性（array=true，GIN 自动，不手工建索引）；
 * - slug = unique 索引，既做唯一约束也做点查加速。
 */
export const DATABASE_ID = 'blog'

/** 附件桶（公开读）。供给时按名幂等创建；桶 ID 由服务端生成，运行时解析。 */
export const STORAGE_BUCKET_NAME = 'blog-media'

export const COLLECTIONS = {
  categories: 'categories',
  posts: 'posts',
  tags: 'tags',
  comments: 'comments',
} as const

export type CollectionId = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]

export interface AttributeDef {
  key: string
  type: 'string' | 'integer' | 'float' | 'boolean' | 'datetime' | 'json'
  required?: boolean
  array?: boolean
}

export interface IndexDef {
  id: string
  type: 'key' | 'unique' | 'fulltext'
  attributes: string[]
}

export interface CollectionDef {
  id: CollectionId
  name: string
  /** 集合级权限（type:role）；缺省（不传）= 服务端默认集（含 keys 四连，不含 read:any）。 */
  permissions: string[]
  /**
   * 文档级 ACL。注意：服务端 catalog 对该字段缺省为 true——非 posts 集合必须
   * 显式传 false，否则文档 ACE（创建者种子）会覆盖集合级权限，公开读失效。
   */
  documentSecurity: boolean
  attributes: AttributeDef[]
  indexes: IndexDef[]
}

/**
 * 权限角色备忘（docs/developer/06-databases.md §7）：
 * - `any` 是合成角色，恒被注入判定——`read:any` 即"任何人可读"；
 * - `users` = 已登录终端用户；`keys` = Server API Key 主体；
 * - `write:role` 会被服务端展开为 create/update/delete:role。
 */
const KEY_MANAGED = ['write:keys'] as const

export const COLLECTION_DEFS: CollectionDef[] = [
  {
    id: COLLECTIONS.categories,
    name: '分类',
    permissions: ['read:any', ...KEY_MANAGED],
    documentSecurity: false,
    attributes: [
      { key: 'name', type: 'string', required: true },
      { key: 'slug', type: 'string', required: true },
    ],
    indexes: [{ id: 'by_slug', type: 'unique', attributes: ['slug'] }],
  },
  {
    id: COLLECTIONS.tags,
    name: '标签',
    permissions: ['read:any', ...KEY_MANAGED],
    documentSecurity: false,
    attributes: [
      { key: 'name', type: 'string', required: true },
      { key: 'slug', type: 'string', required: true },
    ],
    indexes: [{ id: 'by_slug', type: 'unique', attributes: ['slug'] }],
  },
  {
    id: COLLECTIONS.posts,
    name: '文章',
    permissions: ['create:users', 'create:keys'],
    // 文档级安全的演示核心：创建时服务端空 ACE 种子把文档锁成"仅创建者可见"，
    // "发布"动作 = 给文档授予 read:any ACE + 写 published_at。
    documentSecurity: true,
    attributes: [
      { key: 'title', type: 'string', required: true },
      { key: 'slug', type: 'string', required: true },
      { key: 'content', type: 'string', required: true },
      { key: 'category_id', type: 'string', required: true },
      { key: 'tag_ids', type: 'string', array: true },
      { key: 'published_at', type: 'datetime' },
      // Storage 附件（图片/文件）：数组存 FileItem.id；图片内联进 markdown，
      // 全部附件在详情页"附件区"列出并可下载。
      { key: 'attachment_ids', type: 'string', array: true },
    ],
    indexes: [
      { id: 'by_slug', type: 'unique', attributes: ['slug'] },
      { id: 'by_category', type: 'key', attributes: ['category_id'] },
    ],
  },
  {
    id: COLLECTIONS.comments,
    name: '评论',
    // 任何人可读；登录用户可评论；create:keys 让服务端种子也能灌评论；
    // 删除只留给 Server API Key（文章删除时的级联清理）。
    permissions: ['read:any', 'create:users', 'create:keys', 'read:keys', 'delete:keys'],
    documentSecurity: false,
    attributes: [
      { key: 'post_id', type: 'string', required: true },
      { key: 'content', type: 'string', required: true },
      // 评论者身份（可选，展示用）：创建时由客户端从当前账号快照冗余写入——
      // 终端用户无法列举其他账号，因此存展示名而非只存不可解析的 id。
      { key: 'author_id', type: 'string' },
      { key: 'author_name', type: 'string' },
    ],
    indexes: [{ id: 'by_post', type: 'key', attributes: ['post_id'] }],
  },
]

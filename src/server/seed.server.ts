import type { Torchwood } from '@torchwood/sdk'
import { COLLECTIONS, DATABASE_ID } from '#/lib/blog-schema'
import type { Category, Tag } from '#/lib/types'

/**
 * 种子数据（BLOG_SEED=true 且 posts 为空时灌入）。
 * 种子文章通过 Server 面创建并显式携带文档 ACE：
 * - 已发布：`read:any`（公开可读）+ keys 读写删（演示种子文章可被服务端管理）；
 * - 草稿：仅 keys——公开/其他用户不可见，正是文档级 ACL 的演示。
 */

const KEY_MANAGED = ['read:keys', 'update:keys', 'delete:keys'] as const
const PUBLISHED_ACE = ['read:any', ...KEY_MANAGED] as const
// 种子草稿：模拟"某个作者的私有草稿"——ACE 只授予虚拟作者 user:seed-author，
// 不含 read:any。API Key 看不见它（SSR 直链同样 404），公开世界更看不见。
// （权限语义提示：Torchwood 是"可写即可读"，给 key 留写 ACE 也会带来读——
// 所以要彻底私有就必须把读写删都只留给属主。）
const DRAFT_ACE = [
  'read:user:seed-author',
  'update:user:seed-author',
  'delete:user:seed-author',
] as const

interface SeedCategory {
  id: string
  name: string
  slug: string
}

interface SeedTag {
  id: string
  name: string
  slug: string
}

interface SeedPost {
  id: string
  title: string
  slug: string
  categoryId: string
  tagIds: string[]
  publishedAt: string | null
  content: string
}

const CATEGORIES: SeedCategory[] = [
  { id: 'cat-tech', name: '技术', slug: 'tech' },
  { id: 'cat-tutorials', name: '教程', slug: 'tutorials' },
  { id: 'cat-essays', name: '随笔', slug: 'essays' },
]

const TAGS: SeedTag[] = [
  { id: 'tag-torchwood', name: 'Torchwood', slug: 'torchwood' },
  { id: 'tag-baas', name: 'BaaS', slug: 'baas' },
  { id: 'tag-typescript', name: 'TypeScript', slug: 'typescript' },
  { id: 'tag-react', name: 'React', slug: 'react' },
  { id: 'tag-database', name: '数据库', slug: 'database' },
  { id: 'tag-realtime', name: 'Realtime', slug: 'realtime' },
]

const POSTS: SeedPost[] = [
  {
    id: 'post-hello-torchwood',
    title: '你好，Torchwood：为什么博客不需要后端',
    slug: 'hello-torchwood',
    categoryId: 'cat-tech',
    tagIds: ['tag-torchwood', 'tag-baas'],
    publishedAt: '2026-08-20T09:00:00.000Z',
    content: `这个博客没有"自己的后端"——没有自建用户表、没有自建数据库，甚至没有一台需要你写 CRUD 的应用服务器。

它能跑起来，靠的是 Torchwood 的两副面孔：

- **Client 面**：浏览器拿着终端用户 JWT 直连 Torchwood，完成注册、登录、发文、评论；
- **Server 面**：站点的服务端函数拿 API Key 做启动供给（建库建集合）与公开内容读取（SSR）。

这就是 Agent-Native BaaS 的最小闭环：**权限模型由平台执行，应用只声明模型与业务动作**。

## 传统博客栈 vs Torchwood 栈

传统栈要写的东西：用户系统、密码哈希、会话、鉴权中间件、ORM、迁移脚本、评论接口、防刷……

Torchwood 栈要写的东西：一个 schema 定义文件 + 页面。

剩下的（认证、文档权限、实时推送、幂等写入）都是平台的。`,
  },
  {
    id: 'post-document-modeling',
    title: '无 JOIN 的世界：博客数据建模规约',
    slug: 'document-modeling-without-join',
    categoryId: 'cat-tech',
    tagIds: ['tag-torchwood', 'tag-database'],
    publishedAt: '2026-08-22T09:30:00.000Z',
    content: `Torchwood DocumentDB 没有外键，也没有跨集合 JOIN。本站的 \`categories 1:N posts\`、\`posts M:N tags\` 用两个原语表达：

## 1:N：引用属性 + key 索引

posts 上放 \`category_id\`（string，required），建 \`by_category\` key 索引。"某分类下的文章"两段式：先按 slug 查分类拿 id，再 \`eq("category_id", id)\`。

## M:N：数组属性（GIN 自动）

posts 上放 \`tag_ids\`（string，array=true）。数组列的 GIN 索引由服务端自动创建——查询用 \`containsAny\`（交集非空）/\`containsAll\`（子集）。

\`contains\` 是 ILIKE 模糊匹配，**不能**用于数组成员判断。

## 删除协议

服务端不会级联。删父文档前三步：

1. \`countDocuments\` 检查引用数；
2. 迁移 / 级联 / 拒绝，处置子文档；
3. 删除父文档（带 OCC 版本）。

本站删除分类时执行的就是这个协议。`,
  },
  {
    id: 'post-document-acl',
    title: '草稿为什么天然私有：文档级 ACL 实战',
    slug: 'document-level-acl-in-action',
    categoryId: 'cat-tutorials',
    tagIds: ['tag-torchwood', 'tag-database', 'tag-baas'],
    publishedAt: '2026-08-25T14:00:00.000Z',
    content: `posts 集合开了 \`documentSecurity=true\`。这意味着权限判定下沉到每一篇文档：

## 创建 = 私有

作者创建草稿时，服务端的"空 ACE 种子"自动授予 \`user:<创建者>\` 的 read/update/delete——文档立刻私有，其他任何主体（包括 API Key！）都看不见它，查询直接 404（防枚举）。

## 发布 = 一条原子更新

"发布"动作只是一次客户端直发的 \`updateDocument\`：

- \`data\`: 写入 \`published_at\`；
- \`permissions\`: 授予 \`read:any\`，同时保留自己的读写删 ACE。

一次请求原子完成 ACL 变更 + 内容变更。撤回发布就是反操作。

## 站点如何读

公开列表（SSR）用 Server 面 + \`isNotNull("published_at")\` 过滤；而"我的文章（含草稿）"用 Client 面按文档 ACE 回读判断属主。两条读路径分别演示了两种权限语义。`,
  },
  {
    id: 'post-realtime-comments',
    title: '实时评论：outbox、WebSocket 与断线重放',
    slug: 'realtime-comments-outbox-ws',
    categoryId: 'cat-tech',
    tagIds: ['tag-torchwood', 'tag-realtime'],
    publishedAt: '2026-08-28T10:00:00.000Z',
    content: `评论区是本站最"有意思"的部分：有人评论，所有打开页面的人秒级看到新评论。

## 链路

写路径同事务落 outbox → worker 推入 Redis Stream → 每个服务实例的消费组扇出到 WebSocket。事件信封带全局递增的 \`seq\`。

## 断线重放

SDK 连接断开重连后，客户端记录的 \`last_seq\` 之前的窗口由补偿 API \`:changes\` 补齐：

- 每条实时事件按 \`event_id\` 幂等去重；
- \`seq\` 作为续传游标；
- 重连成功后先拉 \`listChanges(since_seq)\` 再接收实时帧，无漏帧窗口。

这套"at-least-once + 客户端去重 + seq 续传"是分布式事件的标准姿势。`,
  },
  {
    id: 'post-query-ast-discipline',
    title: '查询纪律：一个 typed AST 走天下',
    slug: 'query-ast-discipline',
    categoryId: 'cat-tutorials',
    tagIds: ['tag-torchwood', 'tag-database', 'tag-typescript'],
    publishedAt: '2026-09-01T08:00:00.000Z',
    content: `Torchwood 的查询过滤只有一种载体：typed AST。

\`\`\`ts
const page = await tw.server.databases.listDocuments({
  databaseId: 'blog',
  collectionId: 'posts',
  query: {
    filter: { isNotNull: { attribute: 'published_at' } },
    orders: [{ attribute: 'published_at', desc: true }],
    pageSize: 10,
  },
})
\`\`\`

## 几条铁律

- 排序键必须是**本集合**属性（keyset 游标只编码本集合键值）；
- 分页只认 \`pageToken\`，没有 offset——\`meta.next_page_token\` 非空即有下一页；
- 服务端零字符串解析，DSL 只是 SDK 的客户端糖。

类型系统挡住了大部分错误用法：字段名、算子、值形态在编译期就有约束。`,
  },
  {
    id: 'post-ssr-with-baas',
    title: 'SSR 内容站 × BaaS：鱼与熊掌',
    slug: 'ssr-content-site-with-baas',
    categoryId: 'cat-essays',
    tagIds: ['tag-react', 'tag-baas', 'tag-typescript'],
    publishedAt: '2026-09-05T16:00:00.000Z',
    content: `有人觉得 BaaS 只适合纯客户端应用——SEO 怎么办？

本站用 TanStack Start 给出反例：

1. **公开内容走 Server 面**：服务端函数拿 API Key 读文章，SSR 输出完整 HTML；
2. **head 管理**：每篇文章自带 OG meta，分享卡片完美；
3. **RSS / sitemap**：两个 server route 直接吐 XML；
4. **写操作走 Client 面**：作者台、评论、实时——浏览器直连 BaaS。

读路径（服务端集聚合）与写路径（终端用户直写）各走各的鉴权，这正是 BaaS 架构的理想形态。`,
  },
  {
    id: 'post-draft-tanstack-start-notes',
    title: '草稿：TanStack Start 迁移手记（未完成）',
    slug: 'draft-tanstack-start-notes',
    categoryId: 'cat-tech',
    tagIds: ['tag-react', 'tag-typescript'],
    publishedAt: null,
    content: `**这篇是草稿**——公开列表、RSS、sitemap 里都不应该出现它。

计划中的要点：

- loader 与 server function 的数据流；
- Streaming SSR 与 head 管理的配合；
- 迁移中遇到的坑。

（写着写着发现：一篇"私有文档"本身就是最好的权限演示，不如留着当种子。你在"他人视角"下永远看不到这篇。）`,
  },
  {
    id: 'post-draft-occ-deep-dive',
    title: '草稿：OCC 冲突处理的三层境界',
    slug: 'draft-occ-deep-dive',
    categoryId: 'cat-tech',
    tagIds: ['tag-database'],
    publishedAt: null,
    content: `**这篇也是草稿**。

- 第一层：报错让用户刷新；
- 第二层：读版本重试一次（本站编辑器的做法）；
- 第三层：把冲突变成 UI 的显式分支（diff + 合并）。

Torchwood 用户集合强制 OCC：更新/删除必须带 \`version\`，冲突返回 \`DOCUMENT.VERSION_CONFLICT\`（metadata 携带 current_version）。`,
  },
]

const COMMENTS: { id: string; postId: string; content: string; createdAt: string }[] = [
  { id: 'cmt-hello-1', postId: 'post-hello-torchwood', content: '所以这个博客的"后端"就只有一个 TanStack Start 的薄壳？', createdAt: '2026-08-20T10:12:00.000Z' },
  { id: 'cmt-hello-2', postId: 'post-hello-torchwood', content: '评论是浏览器直连 Torchwood 的，刷新一下试试，秒级同步。', createdAt: '2026-08-20T10:30:00.000Z' },
  { id: 'cmt-modeling-1', postId: 'post-document-modeling', content: 'containsAny 和 contains 的区别这个坑太真实了，之前模糊匹配查数组查了一下午。', createdAt: '2026-08-22T11:00:00.000Z' },
  { id: 'cmt-modeling-2', postId: 'post-document-modeling', content: '删除协议那三步我们的项目也照抄了，孤儿数据确实少了很多。', createdAt: '2026-08-23T03:20:00.000Z' },
  { id: 'cmt-acl-1', postId: 'post-document-level-acl-in-action', content: 'API Key 都看不见草稿这点很关键，服务端被攻破也不泄露未发布内容。', createdAt: '2026-08-25T15:40:00.000Z' },
  { id: 'cmt-realtime-1', postId: 'post-realtime-comments-outbox-ws', content: '开着两个窗口给自己发评论玩了一会，确实是秒达。', createdAt: '2026-08-28T12:05:00.000Z' },
]

function toCategoryData(c: SeedCategory): Record<string, unknown> {
  return { name: c.name, slug: c.slug }
}

function toTagData(t: SeedTag): Record<string, unknown> {
  return { name: t.name, slug: t.slug }
}

function toPostData(p: SeedPost): Record<string, unknown> {
  return {
    title: p.title,
    slug: p.slug,
    content: p.content,
    category_id: p.categoryId,
    tag_ids: [...p.tagIds],
    ...(p.publishedAt ? { published_at: p.publishedAt } : {}),
  }
}

export function seedCategories(): Category[] {
  return CATEGORIES.map((c) => ({ id: c.id, name: c.name, slug: c.slug, createdAt: '' }))
}

export function seedTags(): Tag[] {
  return TAGS.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))
}

/** posts 集合为空才灌种子（幂等：重复启动不会重复插入）。 */
export async function seedIfEmpty(tw: Torchwood): Promise<void> {
  const existing = await tw.server.databases.countDocuments(DATABASE_ID, COLLECTIONS.posts, {})
  const count = typeof existing === 'string' ? Number.parseInt(existing, 10) : existing
  if (Number.isFinite(count) && count > 0) return

  // 确定性 document_id + "创建失败则回读验证存在"：多个进程同时灌种子也安全。
  const createOrVerify = async (collectionId: string, id: string, input: { data: Record<string, unknown>; permissions?: string[] }) => {
    try {
      await tw.server.databases.createDocument(DATABASE_ID, collectionId, { document_id: id, ...input })
    } catch {
      await tw.server.databases.getDocument(DATABASE_ID, collectionId, id)
    }
  }

  for (const c of CATEGORIES) {
    await createOrVerify(COLLECTIONS.categories, c.id, { data: toCategoryData(c) })
  }
  for (const t of TAGS) {
    await createOrVerify(COLLECTIONS.tags, t.id, { data: toTagData(t) })
  }
  for (const p of POSTS) {
    await createOrVerify(COLLECTIONS.posts, p.id, {
      data: toPostData(p),
      // 已发布种子授予 read:any；草稿仅 keys（公开世界不可见）。
      permissions: [...(p.publishedAt ? PUBLISHED_ACE : DRAFT_ACE)],
    })
  }
  for (const cm of COMMENTS) {
    await createOrVerify(COLLECTIONS.comments, cm.id, {
      data: { post_id: cm.postId, content: cm.content },
    })
  }
}

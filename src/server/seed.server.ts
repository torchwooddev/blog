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
  { id: 'tag-engineering', name: '工程实践', slug: 'engineering' },
  { id: 'tag-typescript', name: 'TypeScript', slug: 'typescript' },
  { id: 'tag-react', name: 'React', slug: 'react' },
  { id: 'tag-database', name: '数据库', slug: 'database' },
  { id: 'tag-performance', name: '性能', slug: 'performance' },
  { id: 'tag-writing', name: '写作', slug: 'writing' },
]

const POSTS: SeedPost[] = [
  {
    id: 'post-why-i-blog',
    title: '为什么我要认真写博客',
    slug: 'why-i-blog',
    categoryId: 'cat-essays',
    tagIds: ['tag-writing'],
    publishedAt: '2026-08-20T09:00:00.000Z',
    content: `断断续续写了很多年，直到最近才想明白一件事：写博客最大的受益者是我自己。

## 写作是最低成本的思考

很多问题在脑子里"想明白了"，落到纸面才发现到处是洞。写作强制你把模糊的直觉排成线性的论证，每一个"大概是这样"都必须变成"是这样，因为……"。

> 如果你不能简单地解释一件事，说明你还没有真正理解它。

这个过程没有任何工具可以替代——AI 可以帮你润色，但没法替你完成"从混沌到清晰"的那一段路。

## 公开的价值

私密笔记当然也有价值，但公开写作多了三重约束：

1. **读者视角**：你要假设读者没有你的上下文，被迫补全所有背景；
2. **正确性压力**：公开错误会被人指出，这是免费的技术评审；
3. **长期复利**：一篇文章可能在你写完的第三年，恰好解决某个陌生人的问题。

## 这个博客会写什么

大致三类：**技术**（工程实践里踩过的坑）、**教程**（把一件事从头讲清楚）、**随笔**（不那么技术的思考）。

更新频率不承诺，但每一篇都会尽量对得起"写清楚"这三个字。`,
  },
  {
    id: 'post-db-index-tuning',
    title: '数据库索引调优：从 EXPLAIN 开始',
    slug: 'database-index-tuning',
    categoryId: 'cat-tech',
    tagIds: ['tag-database', 'tag-performance', 'tag-engineering'],
    publishedAt: '2026-08-22T09:30:00.000Z',
    content: `慢查询治理是后端工程师的日常。大多数"数据库太慢"的问题，最后都归结为一个词：索引。

## 先看执行计划，再动手

拿到慢查询，第一反应不是加索引，而是看执行计划：

\`\`\`sql
EXPLAIN ANALYZE
SELECT id, title FROM posts
WHERE category_id = 'tech' AND published_at IS NOT NULL
ORDER BY published_at DESC
LIMIT 10;
\`\`\`

重点看三件事：扫描方式（Seq Scan 还是 Index Scan）、扫描行数与返回行数的比值、排序是否落盘。

## 复合索引的列序

复合索引遵循"最左前缀"原则。设计列序的经验公式：

1. 等值条件的列放前面；
2. 范围条件的列放后面；
3. 排序列紧跟范围列（或者干脆用覆盖索引扛住排序）。

比如上面那条查询，\`(category_id, published_at DESC)\` 就是一个理想的复合索引：等值在前、排序在后，LIMIT 10 时只需要读 10 行。

## 不要忘了写入成本

索引不是免费的。每个索引都会拖慢写入、占用存储，过于激进的索引策略会让 OLTP 场景雪崩。

| 指标 | 健康值 | 危险信号 |
| --- | --- | --- |
| 索引命中率 | > 99% | < 95% |
| 单表索引数 | ≤ 5~6 | 十几个起步 |
| 无人使用的索引 | 定期清理 | 越积越多 |

## 小结

调优的顺序永远是：**测量 → 定位 → 最小改动 → 复测**。EXPLAIN 是起点，也是终点——改完之后再用它确认，而不是靠感觉。`,
  },
  {
    id: 'post-code-review-culture',
    title: '代码评审的文化：从挑错到共建',
    slug: 'code-review-culture',
    categoryId: 'cat-tutorials',
    tagIds: ['tag-engineering'],
    publishedAt: '2026-08-25T14:00:00.000Z',
    content: `很多团队的代码评审形同虚设：要么走个过场无脑通过，要么变成资深工程师的个人秀。问题不在流程，在文化。

## 评审的目的是什么

先把目标说清楚：评审不是为了"证明代码没问题"，而是三件更实际的事——

- **知识流动**：让至少另一个人理解这段代码为什么这么写；
- **集体所有权**：打破"这代码只有作者能改"的 bus factor；
- **早期反馈**：设计层面的问题在合并前修正，成本最低。

## 好的评审意见长什么样

对比一下：

> 这里写得不好，应该用 map。

和：

> 这里用 for 循环处理了映射，如果改用 \`map\` 语义会更直接，也方便后续做链式过滤。你觉得呢？

前一句是判断，后一句是**建议 + 理由 + 留出讨论空间**。评审意见指向代码，永远不要指向人。

## 规模控制在 400 行以内

研究数据和个人经验一致：单次评审超过 400 行 diff，发现缺陷的效率断崖式下跌。大改动请拆分：

1. 先发一个"纯结构"的 PR（重命名、抽函数，不改行为）；
2. 再发业务逻辑的 PR，这时候 diff 已经很小；
3. 复杂算法单独出设计文档，不要指望评审者在 diff 里读懂你的架构。

## 工具只是载体

模板、checklist、自动化检查都很好，但它们只能兜底格式问题。真正让评审有价值的，是团队对"代码是共同资产"这件事的共识。`,
  },
  {
    id: 'post-web-performance-budget',
    title: '给你的网站定一份性能预算',
    slug: 'web-performance-budget',
    categoryId: 'cat-tech',
    tagIds: ['tag-performance'],
    publishedAt: '2026-08-28T10:00:00.000Z',
    content: `"性能优化"为什么总是不了了之？因为没有预算。没有预算，就没有约束力。

## 什么是性能预算

性能预算就是一句话：**我们承诺页面在什么设备、什么网络下，做到什么指标**。比如：

- LCP ≤ 2.5s（4G，中端安卓机）
- 首屏 JS ≤ 170KB（gzip 前）
- CLS ≤ 0.1

关键不是数字多精确，而是它是**团队承诺**，不是某个人的愿望。

## 把预算接进流水线

贴在墙上的预算没有意义，要让它自动化执行：

\`\`\`json
{
  "budgets": [
    {
      "path": "/*",
      "resourceSizes": [
        { "resourceType": "script", "budget": 170 }
      ]
    }
  ]
}
\`\`\`

Lighthouse 的预算机制可以在 CI 里直接卡失败。超过预算的 PR 合并不进去，讨论自然就发生了。

## 预算超了怎么办

三种处理方式，按优先级排序：

1. **删掉**：那个三方统计脚本真的必要吗？
2. **替换**：有没有更轻的实现？
3. **申请调额**：确实要加，就走正式流程调高预算，并且说明为什么。

第三条最重要——预算可以被调整，但必须**显式**调整。"先上线再说"是预算制度的天敌。

## 从哪里开始

不用追求一步到位。先测出当前的真实数据，然后把每个指标收紧 10%~20%，就是一个足够好的第一版预算。`,
  },
  {
    id: 'post-typescript-type-gymnastics',
    title: 'TypeScript 类型体操的边界',
    slug: 'typescript-type-gymnastics',
    categoryId: 'cat-tutorials',
    tagIds: ['tag-typescript'],
    publishedAt: '2026-09-01T08:00:00.000Z',
    content: `类型系统是 TypeScript 最好的礼物，也可能是最坏的诱惑。什么时候该用复杂的类型推导，什么时候该停下来，值得认真讨论。

## 类型体操真正值钱的场景

抽公共库的时候，类型体操回报最高。一个经典的例子——把对象类型的值域取出来：

\`\`\`ts
type Values<T> = T[keyof T]

const STATUS = {
  idle: 'idle',
  loading: 'loading',
  done: 'done',
} as const

type Status = Values<typeof STATUS> // 'idle' | 'loading' | 'done'
\`\`\`

这类推导的好处是**单一事实来源**：运行时对象和类型永远同步，没有第二处需要维护。

## 什么时候应该刹车

遇到这几种信号，就该退回简单方案：

- 类型参数出现三层以上的条件嵌套，报错信息已经没人读得懂；
- 为了类型完备，运行时被塞进了只服务于类型的代码；
- 团队里超过一半的人无法修改这段类型。

类型是给人看的，不是给编译器写的诗。

## 务实的替代方案

很多"高难推导"其实有平替：

1. **代码生成**：schema 生成类型，简单粗暴、永远准确；
2. **声明合并 + 显式断言**：把不确定性圈在一个有注释的小范围里；
3. **测试兜底**：用 \`expectTypeOf\` 之类的工具把类型预期写成测试，复杂度被文档化。

## 我的判断标准

一句话：**库代码可以聪明，业务代码必须无趣**。业务代码的读者是半年后的自己和刚入职的同事，无趣是一种美德。`,
  },
  {
    id: 'post-design-system-adoption',
    title: '设计系统落地的三道坎',
    slug: 'design-system-adoption',
    categoryId: 'cat-tech',
    tagIds: ['tag-engineering', 'tag-react'],
    publishedAt: '2026-09-05T16:00:00.000Z',
    content: `设计系统失败的常见姿势：组件库做得很漂亮，然后没有人用。落地比建设难，难在它是一个组织问题。

## 第一道坎：技术接入

这是最容易的一关。文档、示例、按需引入，都是工程问题，投入时间就能解决。

真正要小心的是**迁移存量页面**。千万不要发起"一次性全量替换"运动——正确姿势是新页面强制用，老页面被改到时顺手迁移。

## 第二道坎：设计一致性

组件库统一了按钮和输入框，但统一不了"页面长什么样"。这个阶段需要的是：

- **页面级模板**：列表页、详情页、表单页各有标准骨架；
- **设计走查**：新页面上线前对照规范过一遍；
- **例外登记**：确实需要破例的场景，记录下来——它们往往是规范该进化的信号。

## 第三道坎：组织惯性

最隐蔽的一道坎。设计师按旧习惯出图，开发按旧习惯手写样式，组件库沦为摆设。

解法只有让"正确的事"比"错误的事"更省力：

1. 组件质量必须明显高于手写（加载态、空态、无障碍都替你做好了）；
2. 把组件库使用率做成可见的指标；
3. 让最有影响力的两个业务线先用起来，示范比命令有效。

## 小结

设计系统的本质是把设计决策**产品化**。既然是产品，就要运营：有路线图、有用户反馈、有迭代节奏。`,
  },
  {
    id: 'post-draft-perf-checklist',
    title: '草稿：Web 性能优化清单（未完成）',
    slug: 'draft-perf-checklist',
    categoryId: 'cat-tech',
    tagIds: ['tag-performance'],
    publishedAt: null,
    content: `**这篇是草稿**——公开列表、RSS、站点地图里都不应该出现它。

计划覆盖的清单：

- 关键渲染路径：内联关键 CSS、defer 非关键 JS；
- 图片：现代格式、懒加载、正确的 sizes；
- 字体：preload + font-display；
- 缓存策略：immutable 静态资源与 hash 命名。

（写着写着发现：一篇"私有文档"本身就是最好的权限演示——你在"他人视角"下永远看不到这篇。）`,
  },
  {
    id: 'post-draft-writing-workflow',
    title: '草稿：我的写作工作流',
    slug: 'draft-writing-workflow',
    categoryId: 'cat-essays',
    tagIds: ['tag-writing'],
    publishedAt: null,
    content: `**这篇也是草稿**。

想写的几个阶段：

1. 灵感捕获：随手记一句话，不展开；
2. 素材发酵：放几天，让相关性自己浮出来；
3. 大纲先行：先写小标题，确认论证结构；
4. 一稿一口气：大纲定了就一次写完，不在初稿里修改；
5. 冷却修改：放两天后再改，删掉 20% 的字。

（每一篇草稿都只有我能看见，发布动作会把它们推到公开世界。）`,
  },
]

const COMMENTS: { id: string; postId: string; content: string; createdAt: string; authorName: string }[] = [
  { id: 'cmt-blog-1', postId: 'post-why-i-blog', content: '"写作是为了想清楚"，深有同感。很多次写着写着就发现原来的理解是错的。', createdAt: '2026-08-20T10:12:00.000Z', authorName: 'Mira' },
  { id: 'cmt-blog-2', postId: 'post-why-i-blog', content: 'RSS 已订阅，期待更新。', createdAt: '2026-08-20T10:30:00.000Z', authorName: 'Kenji' },
  { id: 'cmt-db-1', postId: 'post-db-index-tuning', content: 'EXPLAIN 那一步太真实了，上周刚治理完一条 800ms 的慢查询，最后就是个列序问题。', createdAt: '2026-08-22T11:00:00.000Z', authorName: 'Raymond' },
  { id: 'cmt-review-1', postId: 'post-code-review-culture', content: '把评审当学习而不是把关，团队氛围真的会不一样。400 行那条建议很实用。', createdAt: '2026-08-25T15:40:00.000Z', authorName: 'Mira' },
  { id: 'cmt-perf-1', postId: 'post-web-performance-budget', content: '性能预算这个提法很好，比"尽力优化"可执行多了，准备在下个季度引入。', createdAt: '2026-08-28T12:05:00.000Z', authorName: 'Kenji' },
  { id: 'cmt-ts-1', postId: 'post-typescript-type-gymnastics', content: '"库代码可以聪明，业务代码必须无趣"，这句话值得贴在工位上。', createdAt: '2026-09-01T09:20:00.000Z', authorName: 'Raymond' },
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
      data: { post_id: cm.postId, content: cm.content, author_name: cm.authorName },
    })
  }
}
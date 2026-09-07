// 端到端冒烟：完全按照浏览器会发起的 Client 面 SDK 调用执行（与应用 UI 等价），
// Server 面调用模拟 SSR 与 Server 函数的行为。
// 运行：node scripts/smoke-e2e.mjs
import { readFileSync } from 'node:fs'
import { Torchwood } from '@torchwood/sdk'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const ENDPOINT = env.BLOG_TORCHWOOD_ENDPOINT
const PROJECT = env.BLOG_TORCHWOOD_PROJECT_ID
const DB = 'blog'

// Server 面（模拟 SSR / Server 函数 / 健康检查）
const srv = Torchwood.withApiKey(ENDPOINT, PROJECT, env.BLOG_TORCHWOOD_API_KEY)

let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) {
    pass++
    console.log('  ok  ', name, extra)
  } else {
    fail++
    console.log('  FAIL', name, extra)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
async function signUpOrIn(client, email, password, name) {
  try {
    return await client.account.signUp({ email, password, name })
  } catch {
    return await client.account.signIn({ email, password })
  }
}

// 1. 注册两位终端用户（浏览器直连，JWT 由 SDK 持有）
const author = Torchwood.create({ endpoint: ENDPOINT, projectId: PROJECT })
const visitor = Torchwood.create({ endpoint: ENDPOINT, projectId: PROJECT })
const a = await signUpOrIn(author, 'smoke-author@torchwood.local', 'smoke-pass-2026!', '冒烟作者')
const b = await signUpOrIn(visitor, 'smoke-visitor@torchwood.local', 'smoke-pass-2026!', '冒烟访客')
check('1. 终端用户注册/登录（Client 面 JWT）', !!a.account?.id && !!b.account?.id, `${a.account.id} / ${b.account.id}`)

// 2. 作者创建草稿（客户端直发；默认空 ACE 种子 = 仅属主可见）
const slug = `smoke-post-${Date.now().toString(36)}`
const draft = await author.databases.createDocument(DB, 'posts', {
  document_id: `smoke-${Date.now().toString(36)}`,
  data: {
    title: '冒烟测试文章',
    slug,
    content: '# 冒烟\n\n由 smoke-e2e 创建。',
    category_id: 'cat-tech',
    tag_ids: ['tag-torchwood'],
  },
})
check('2. 创建草稿（默认私有，version=1）', String(draft.version ?? '1') === '1', `version=${JSON.stringify(draft.version)}`)

// 3. Server 面（API Key）读不到草稿 → SSR 列表/详情 404
const srvSeen = await srv.server.databases.listDocuments(DB, 'posts', {
  query: { filter: { eq: { attribute: 'slug', values: [slug] } }, pageSize: 1 },
})
check('3. Server 面看不见草稿（防枚举）', srvSeen.documents.length === 0)

// 4. 访客（另一终端用户）也看不见
const visitorSeen = await visitor.databases.listDocuments(DB, 'posts', {
  query: { filter: { containsAny: { attribute: 'tag_ids', values: ['tag-torchwood'] } }, pageSize: 100 },
})
check('4. 他人视角看不见草稿', !visitorSeen.documents.some((d) => d.id === draft.id))

// 5. OCC：用过期版本更新 → VERSION_CONFLICT → 重读重试
await author.databases.updateDocument(DB, 'posts', draft.id, {
  data: { content: '# 冒烟 v2' },
  version: draft.version,
})
let occOk = false
try {
  await author.databases.updateDocument(DB, 'posts', draft.id, {
    data: { content: '# 冒烟 v3（stale）' },
    version: draft.version, // stale
  })
} catch (e) {
  // 网关形态：域码 DOCUMENT.VERSION_CONFLICT 以 FailedPrecondition + message 前缀到达。
  occOk =
    e.code === 'DOCUMENT.VERSION_CONFLICT' ||
    (e.code === 'FailedPrecondition' && String(e.message ?? '').startsWith('DOCUMENT.VERSION_CONFLICT'))
  if (!occOk) console.log('      unexpected:', e.status, e.code, e.message)
}
check('5. OCC 过期版本被拒（DOCUMENT.VERSION_CONFLICT）', occOk)

// 6. 发布：写 published_at + 授予 read:any（一个原子 update）
const fresh = await author.databases.getDocument(DB, 'posts', draft.id)
await author.databases.updateDocument(DB, 'posts', draft.id, {
  data: { published_at: new Date().toISOString() },
  permissions: [
    'read:any',
    `read:user:${a.account.id}`,
    `update:user:${a.account.id}`,
    `delete:user:${a.account.id}`,
  ],
  version: fresh.version ?? 1,
})
const publishedSeen = await srv.server.databases.listDocuments(DB, 'posts', {
  query: { filter: { eq: { attribute: 'slug', values: [slug] } }, pageSize: 1 },
})
check('6. 发布后 Server 面（SSR/RSS）可见', publishedSeen.documents.length === 1)

// 7. 访客评论（Client 面直发）
await visitor.databases.createDocument(DB, 'comments', {
  data: { post_id: draft.id, content: '冒烟评论 1（发布后可见）' },
})
check('7. 登录用户发表评论', true)

// 8. Realtime：作者订阅 comments 频道；访客再评论 → 秒达
const conn = author.realtime.connect({ projectId: PROJECT })
await sleep(1200) // 等 hello_ok
const gotEvent = new Promise((resolve) => {
  conn.subscribe('databases.blog.collections.comments', (event) => {
    if (event.payload?.['event'] === 'databases.documents.create') resolve(event.payload)
  })
  setTimeout(() => resolve(null), 8000)
})
await sleep(300)
const c2 = await visitor.databases.createDocument(DB, 'comments', {
  data: { post_id: draft.id, content: '冒烟评论 2（realtime 秒达）' },
})
const payload = await gotEvent
check('8. Realtime 评论事件秒达（WS）', !!payload && payload['document_id'] === c2.id)

// 9. 断线补偿：记录 seq → "断线"（退订即可模拟漏收）→ 用 listChanges(since_seq) 补齐
const since = typeof payload?.['seq'] === 'number' ? payload['seq'] : 0
const c3 = await visitor.databases.createDocument(DB, 'comments', {
  data: { post_id: draft.id, content: '冒烟评论 3（断线窗口内）' },
})
const changes = await author.databases.listChanges(DB, 'comments', { since_seq: since })
const backfilled = (changes.changes ?? []).some((ch) => ch.document_id === c3.id)
check('9. :changes 补偿 API 覆盖断线窗口（seq 续传）', backfilled, `seq since=${since}`)
conn.close()

// 10. 分类删除协议（Server 面函数等价逻辑）
const cat = await srv.server.databases.createDocument(DB, 'categories', {
  document_id: `cat-smoke-${Date.now().toString(36)}`,
  data: { name: '冒烟分类', slug: `smoke-${Date.now().toString(36)}` },
})
const catDoc = await author.databases.getDocument(DB, 'categories', cat.id)
// 作者把文章迁入该分类
await author.databases.updateDocument(DB, 'posts', draft.id, {
  data: { category_id: cat.id },
  version: (await author.databases.getDocument(DB, 'posts', draft.id)).version ?? 1,
})
const refs = await srv.server.databases.countDocuments(DB, 'posts', {
  query: { filter: { eq: { attribute: 'category_id', values: [cat.id] } } },
})
const refCount = typeof refs === 'string' ? Number.parseInt(refs, 10) : refs
check('10a. 协议第 1 步：引用计数 > 0', refCount >= 1, `count=${refCount}`)
// 迁移走子文档
await author.databases.updateDocument(DB, 'posts', draft.id, {
  data: { category_id: 'cat-tech' },
  version: (await author.databases.getDocument(DB, 'posts', draft.id)).version ?? 1,
})
// 第 3 步：带 OCC 版本删除父文档
const catLatest = await srv.server.databases.getDocument(DB, 'categories', cat.id)
let deleted = false
try {
  await srv.server.databases.deleteDocument(DB, 'categories', cat.id, catLatest.version ?? 1)
  deleted = true
} catch (e) {
  console.log('      delete err:', e.status, e.code, e.message)
}
check('10b. 协议第 2/3 步：迁移后带版本删除分类', deleted)

// 11. 数组原子算子 arrayUpdates（APPEND）：SDK 0.2.0 未声明字段，wire 层支持
let arrayOk = false
try {
  const p = await author.databases.getDocument(DB, 'posts', draft.id)
  await author.databases.updateDocument(DB, 'posts', draft.id, {
    version: p.version ?? 1,
    arrayUpdates: { tag_ids: { op: 'ARRAY_UPDATE_OP_APPEND', values: ['tag-react'] } },
  })
  const after = await author.databases.getDocument(DB, 'posts', draft.id)
  arrayOk = Array.isArray(after.data['tag_ids']) && after.data['tag_ids'].includes('tag-react')
} catch (e) {
  console.log('      arrayUpdates err:', e.status, e.code, e.message)
}
check('11. arrayUpdates APPEND 原子追加标签', arrayOk)

// 12. 删除文章前级联清理评论（Server 面 bulk），再删文章（OCC）
const comments = await srv.server.databases.listDocuments(DB, 'comments', {
  query: { filter: { eq: { attribute: 'post_id', values: [draft.id] } }, pageSize: 200 },
})
await srv.server.databases.bulkDeleteDocuments(DB, 'comments', comments.documents.map((d) => d.id))
const pFinal = await author.databases.getDocument(DB, 'posts', draft.id)
await author.databases.deleteDocument(DB, 'posts', draft.id, pFinal.version ?? 1)
const gone = await srv.server.databases.listDocuments(DB, 'posts', {
  query: { filter: { eq: { attribute: 'slug', values: [slug] } }, pageSize: 1 },
})
check('12. 删除协议：级联清理评论 + 删除文章', gone.documents.length === 0)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)

// 补充实验:走应用同款路径(带 query 的 POST :list)测各资源缺失时的错误形态
import { Torchwood } from '@torchwood/sdk'

const ENDPOINT = 'http://localhost:9080'
const KEY = '06d94958140063ad439c9d12d9b9f5b80a46b26559ed7226ffb54872572e77be'
const tw = Torchwood.withApiKey(ENDPOINT, 'shop', KEY)

function fmt(e) {
  return e instanceof Error ? `${e.message} (status=${e.status ?? '?'}, code=${e.code ?? '?'})` : String(e)
}

const query = { pageSize: 3 }

// 1. 合法格式但不存在的库(POST :list)
try {
  const r = await tw.server.databases.listDocuments('nosuchdb', 'posts', { query })
  console.log('[POST:list nosuchdb/posts] ok, count =', r.documents.length)
} catch (e) {
  console.log('[POST:list nosuchdb/posts] error =', fmt(e))
}

// 2. 库存在、集合不存在(POST :list)
try {
  const r = await tw.server.databases.listDocuments('blog', 'nosuchcoll', { query })
  console.log('[POST:list blog/nosuchcoll] ok, count =', r.documents.length)
} catch (e) {
  console.log('[POST:list blog/nosuchcoll] error =', fmt(e))
}

// 3. 库不存在(GET 简单路径,匿名线上探针用的就是这条)
try {
  const r = await tw.server.databases.listDocuments('nosuchdb', 'posts', {})
  console.log('[GET nosuchdb/posts] ok, count =', r.documents.length)
} catch (e) {
  console.log('[GET nosuchdb/posts] error =', fmt(e))
}

// 4. 库存在、集合不存在(GET 简单路径)
try {
  const r = await tw.server.databases.listDocuments('blog', 'nosuchcoll', {})
  console.log('[GET blog/nosuchcoll] ok, count =', r.documents.length)
} catch (e) {
  console.log('[GET blog/nosuchcoll] error =', fmt(e))
}

// 5. 对照:正常路径(POST :list 带 filter/orders —— 首页同款)
import { isNotNull, orderDesc } from '@torchwood/sdk'
try {
  const r = await tw.server.databases.listDocuments('blog', 'posts', {
    query: { filter: isNotNull('published_at'), orders: [orderDesc('published_at')], pageSize: 3 },
  })
  console.log('[POST:list blog/posts filtered] ok, count =', r.documents.length)
} catch (e) {
  console.log('[POST:list blog/posts filtered] error =', fmt(e))
}

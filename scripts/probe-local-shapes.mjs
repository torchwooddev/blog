// 本地对照实验:验证"document not found"错误对应哪种资源缺失
import { Torchwood } from '@torchwood/sdk'

const ENDPOINT = 'http://localhost:9080'
const KEY = '06d94958140063ad439c9d12d9b9f5b80a46b26559ed7226ffb54872572e77be'
const tw = Torchwood.withApiKey(ENDPOINT, 'shop', KEY)

function fmt(e) {
  return e instanceof Error ? `${e.message} (status=${e.status ?? '?'}, code=${e.code ?? '?'})` : String(e)
}

// 1. 正常库的状态
try {
  const db = await tw.server.databases.getDatabase('blog')
  console.log('[getDatabase blog] ok, collections =', (db.collections ?? []).map((c) => c.id).join(','))
} catch (e) {
  console.log('[getDatabase blog] FAILED:', fmt(e))
}

// 2. 库内文档
try {
  const res = await tw.server.databases.listDocuments('blog', 'posts', { query: { pageSize: 3 } })
  console.log('[listDocuments blog/posts] ok, count =', res.documents.length)
} catch (e) {
  console.log('[listDocuments blog/posts] FAILED:', fmt(e))
}

// 3. 不存在的库 → 错误形态
try {
  await tw.server.databases.listDocuments('no-such-db', 'posts', { query: { pageSize: 3 } })
  console.log('[listDocuments no-such-db/posts] ok?!')
} catch (e) {
  console.log('[listDocuments no-such-db/posts] error =', fmt(e))
}

// 4. 库存在但集合不存在 → 错误形态
try {
  await tw.server.databases.listDocuments('blog', 'no-such-coll', { query: { pageSize: 3 } })
  console.log('[listDocuments blog/no-such-coll] ok?!')
} catch (e) {
  console.log('[listDocuments blog/no-such-coll] error =', fmt(e))
}

// 5. 点查不存在的文档 → 错误形态
try {
  await tw.server.databases.getDocument('blog', 'posts', 'no-such-doc')
  console.log('[getDocument no-such-doc] ok?!')
} catch (e) {
  console.log('[getDocument no-such-doc] error =', fmt(e))
}

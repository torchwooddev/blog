// 冒烟：逐步执行供给逻辑，定位失败点（与应用 src/server/provision.server.ts 等价）。
import { Torchwood } from '@torchwood/sdk'
import { readFileSync } from 'node:fs'

// 从 .env 读取（避免依赖 shell 环境）
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const tw = Torchwood.withApiKey(env.BLOG_TORCHWOOD_ENDPOINT, env.BLOG_TORCHWOOD_PROJECT_ID, env.BLOG_TORCHWOOD_API_KEY)
const log = (step, ok, extra) => console.log(ok ? '  ok ' : 'FAIL', step, extra ?? '')

try {
  const db = await tw.server.databases.createDatabase({ id: 'blog', name: 'Torchwood Blog' })
  log('createDatabase', true, db.id)
} catch (e) {
  log('createDatabase', false, `${e.status} ${e.code ?? ''} ${e.message}`)
}

for (const [id, name, perms, docSec] of [
  ['categories', '分类', ['read:any', 'write:keys'], false],
  ['tags', '标签', ['read:any', 'write:keys'], false],
  ['posts', '文章', ['create:users', 'create:keys'], true],
  ['comments', '评论', ['read:any', 'create:users', 'read:keys', 'delete:keys'], false],
]) {
  try {
    await tw.server.databases.createCollection('blog', {
      id,
      name,
      permissions: perms,
      ...(docSec ? { document_security: true } : {}),
    })
    log(`createCollection ${id}`, true)
  } catch (e) {
    log(`createCollection ${id}`, false, `${e.status} ${e.code ?? ''} ${e.message}`)
  }
}

const attrSpecs = [
  ['categories', { key: 'name', type: 'string', required: true }],
  ['categories', { key: 'slug', type: 'string', required: true }],
  ['tags', { key: 'name', type: 'string', required: true }],
  ['tags', { key: 'slug', type: 'string', required: true }],
  ['posts', { key: 'title', type: 'string', required: true }],
  ['posts', { key: 'slug', type: 'string', required: true }],
  ['posts', { key: 'content', type: 'string', required: true }],
  ['posts', { key: 'category_id', type: 'string', required: true }],
  ['posts', { key: 'tag_ids', type: 'string', array: true }],
  ['posts', { key: 'published_at', type: 'datetime' }],
  ['comments', { key: 'post_id', type: 'string', required: true }],
  ['comments', { key: 'content', type: 'string', required: true }],
]
for (const [coll, input] of attrSpecs) {
  try {
    await tw.server.databases.createAttribute('blog', coll, input)
    log(`createAttribute ${coll}.${input.key}`, true)
  } catch (e) {
    log(`createAttribute ${coll}.${input.key}`, false, `${e.status} ${e.code ?? ''} ${e.message}`)
  }
}

const idxSpecs = [
  ['categories', { id: 'by_slug', type: 'unique', attributes: ['slug'] }],
  ['tags', { id: 'by_slug', type: 'unique', attributes: ['slug'] }],
  ['posts', { id: 'by_slug', type: 'unique', attributes: ['slug'] }],
  ['posts', { id: 'by_category', type: 'key', attributes: ['category_id'] }],
  ['comments', { id: 'by_post', type: 'key', attributes: ['post_id'] }],
]
for (const [coll, input] of idxSpecs) {
  try {
    await tw.server.databases.createIndex('blog', coll, input)
    log(`createIndex ${coll}.${input.id}`, true)
  } catch (e) {
    log(`createIndex ${coll}.${input.id}`, false, `${e.status} ${e.code ?? ''} ${e.message}`)
  }
}

try {
  const count = await tw.server.databases.countDocuments('blog', 'posts', {})
  log('countDocuments posts', true, String(count))
} catch (e) {
  log('countDocuments posts', false, `${e.status} ${e.code ?? ''} ${e.message}`)
}

try {
  const page = await tw.server.databases.listDocuments('blog', 'posts', {
    query: {
      filter: { isNotNull: { attribute: 'published_at' } },
      orders: [{ attribute: 'published_at', desc: true }],
      pageSize: 5,
    },
  })
  log('listDocuments posts (published)', true, `n=${page.documents.length} next=${page.meta?.next_page_token ?? ''}`)
} catch (e) {
  log('listDocuments posts (published)', false, `${e.status} ${e.code ?? ''} ${e.message}`)
}

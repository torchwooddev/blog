// 线上诊断:匿名 client 面直读 blog 库的 posts/categories/tags/settings
import { Torchwood } from '@torchwood/sdk'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })

async function probe(name, collection, extra = {}) {
  try {
    const res = await tw.databases.listDocuments('blog', collection, {
      query: { pageSize: 5, ...extra },
    })
    console.log(`[${name}] ok, total=${res.total ?? '?'}, count=${res.documents.length}`)
    for (const d of res.documents.slice(0, 3)) {
      const data = d.data ?? {}
      console.log('   -', d.id, '|', JSON.stringify(data.title ?? data.name ?? data.slug ?? '').slice(0, 60), '| published_at =', data.published_at ?? null)
    }
    return res
  } catch (e) {
    console.log(`[${name}] FAILED:`, e instanceof Error ? `${e.message} (status=${e.status ?? '?'}, code=${e.code ?? '?'})` : e)
  }
}

await probe('posts', 'posts')
await probe('categories', 'categories')
await probe('tags', 'tags')
await probe('settings', 'settings')

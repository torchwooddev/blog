// 三层写读链路判定:JWT 直连网关建/发文章 → 站点 SSR 是否渲染 → 匿名 REST 是否可见
import { Torchwood } from '@torchwood/sdk'

const BASE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })
tw.setAccessToken(r.tokens.access_token)
const slug = `rescan3-${Date.now().toString(36)}`
const postId = `post-${slug}`

// 1) JWT 直连网关创建(集合级 create:users,不经 server fn)
let doc
try {
  doc = await tw.databases.createDocument('blog', 'posts', {
    document_id: postId,
    data: {
      title: `Rescan3 ${slug}`,
      slug,
      content: '# hello\n\nplain probe content',
      category_id: 'cat-none',
      tag_ids: [],
      attachment_ids: [],
    },
  })
  console.log('[1] JWT 直连创建: OK version=', doc.version)
} catch (e) {
  console.log('[1] JWT 直连创建: FAIL', String(e.message ?? e).slice(0, 200))
  process.exit(1)
}

// 2) 发布(read:any ACE)
try {
  const me = await tw.account.me()
  await tw.databases.updateDocument('blog', 'posts', postId, {
    data: { published_at: new Date().toISOString() },
    permissions: ['read:any', `read:user:${me.id}`, `update:user:${me.id}`, `delete:user:${me.id}`],
    version: doc.version,
  })
  console.log('[2] 发布(read:any): OK')
} catch (e) {
  console.log('[2] 发布: FAIL', String(e.message ?? e).slice(0, 200))
}

await new Promise((res) => setTimeout(res, 800))

// 3) 站点 SSR(server key 面)能否渲染
const page = await fetch(`${BASE}/posts/${slug}`)
const html = await page.text()
console.log('[3] 站点文章页:', page.status, '| 含标题:', html.includes(`Rescan3 ${slug}`))

// 4) 匿名 REST 列表能否看到
const rest = await fetch(`${GATEWAY}/v1/databases/blog/collections/posts/documents?project_id=blog&pageSize=50`).then((x) => x.json())
console.log('[4] 匿名 REST posts 可见条数:', (rest.documents ?? []).length, '| 含本文:', (rest.documents ?? []).some((d) => d.id === postId))

// 5) feed.xml
const feed = await fetch(`${BASE}/feed.xml`).then((x) => x.text())
console.log('[5] feed.xml 含本文:', feed.includes(slug))

console.log('[保留] postId=', postId, 'slug=', slug, '(后续用例复用,最后清理)')

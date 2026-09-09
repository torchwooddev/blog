// 网关数据面探针:集合元数据/校验错误 vs 500/JWT 写路径/comments 面
import { Torchwood } from '@torchwood/sdk'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD

const anon = await fetch(`${GATEWAY}/v1/databases/blog/collections/posts?project_id=blog`)
console.log('[anon GET posts collection]', anon.status, JSON.stringify(await anon.json()).slice(0, 300))

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })
tw.setAccessToken(r.tokens.access_token)

// 缺字段:若返回 400 校验错误 = 写路径活着;若 500 = 处理器炸
try {
  await tw.databases.createDocument('blog', 'posts', { document_id: `probe-${Date.now()}`, data: { title: 'x' } })
  console.log('[JWT 缺字段创建] 竟然成功??')
} catch (e) {
  console.log('[JWT 缺字段创建]', e.status, String(e.message ?? e).slice(0, 160))
}

// comments 面(create:users)
try {
  const c = await tw.databases.createDocument('blog', 'comments', {
    data: { post_id: 'post-none', content: 'probe', author_id: 'probe', author_name: 'probe' },
  })
  console.log('[JWT comments 创建] OK', c.id)
  await tw.databases.deleteDocument('blog', 'comments', c.id).catch(() => {})
} catch (e) {
  console.log('[JWT comments 创建]', e.status, String(e.message ?? e).slice(0, 160))
}

// 服务端 面(API key)不可测(无 key),但可以看 categories 匿名 GET 是否 200
const cats = await fetch(`${GATEWAY}/v1/databases/blog/collections/categories?project_id=blog`)
console.log('[anon GET categories collection]', cats.status, JSON.stringify(await cats.json()).slice(0, 200))

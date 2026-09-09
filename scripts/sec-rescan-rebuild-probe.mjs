// 重建前定性探针:server-key 写读闭环(JWT 调 server fn 建分类 → 站点 SSR 能否读 → 删)
import { Torchwood } from '@torchwood/sdk'
import { toJSONAsync } from 'seroval'

const SITE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD
const CREATE_ID = '96ffab79262343c4b20c8bb6c58d9e63f9d8b82b0f90169e3bc066ca87a94ad2'
const DELETE_ID = 'd77a92147f763545169c1885e518c06fb5afc0446799de6c0c54c04448564b1d'

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })

const slug = `rebuild-probe-${Date.now().toString(36)}`
async function callFn(id, data) {
  const payload = JSON.stringify(await toJSONAsync({ data }))
  const res = await fetch(`${SITE}/_serverFn/${id}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tsr-serverFn': 'true',
      'sec-fetch-site': 'same-origin',
      authorization: `Bearer ${r.tokens.access_token}`,
    },
    body: payload,
  })
  return { status: res.status, body: (await res.text()).slice(0, 200) }
}

const created = await callFn(CREATE_ID, { name: 'REBUILD-PROBE', slug })
console.log('[1] server-key createCategory:', created.status, created.body)

await new Promise((res) => setTimeout(res, 800))
const page = await fetch(`${SITE}/categories/${slug}`)
const html = await page.text()
const h1 = (html.match(/<h1[^>]*>([^<]*)<\/h1>/) ?? [])[1]
console.log('[2] 站点分类页(server-key 读):', page.status, '| h1 =', JSON.stringify(h1))

const del = await callFn(DELETE_ID, { categoryId: `cat-${slug}` })
console.log('[3] server-key deleteCategory:', del.status, del.body)
await new Promise((res) => setTimeout(res, 800))
const after = await fetch(`${SITE}/categories/${slug}`)
console.log('[4] 删除后分类页:', after.status, '(期望 404)')

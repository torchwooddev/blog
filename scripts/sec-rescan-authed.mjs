// 复扫 B-01 认证面:有效 JWT 放行 + 跨用户越权模型(可逆操作)
import { Torchwood } from '@torchwood/sdk'
import { toJSONAsync } from 'seroval'

const BASE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD

const IDS = {
  createCategory: '96ffab79262343c4b20c8bb6c58d9e63f9d8b82b0f90169e3bc066ca87a94ad2',
  deleteCategory: 'd77a92147f763545169c1885e518c06fb5afc0446799de6c0c54c04448564b1d',
  renameCategory: 'ce1b3447b04400a77ea5c087da3fa4cb41e9074878c626b75a88dbed54b85d8d',
}

async function callFn(id, data, token) {
  const payload = JSON.stringify(await toJSONAsync({ data }))
  const res = await fetch(`${BASE}/_serverFn/${id}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tsr-serverFn': 'true',
      'sec-fetch-site': 'same-origin',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: payload,
  })
  const text = await res.text()
  let out = text
  try {
    const json = JSON.parse(text)
    const decoded = JSON.stringify(json, (k, v) => (k === 't' || k === 'i' || k === 'p' || k === 'o' || k === 'a' ? undefined : v))
    out = decoded.slice(0, 200)
  } catch { /* raw */ }
  return { status: res.status, body: out }
}

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })
const token = r.tokens.access_token
console.log('[login] ok, userId=', r.account.id)

const slug = `rescan-ok-${Date.now().toString(36)}`
const created = await callFn(IDS.createCategory, { name: 'RESCAN-AUTHED', slug }, token)
console.log('[authed createCategory(自己的)] ', created.status, created.body)

const renamed = await callFn(IDS.renameCategory, { categoryId: 'cat-tech', name: 'RESCAN-XUSER' }, token)
console.log('[跨用户 rename cat-tech]        ', renamed.status, renamed.body)

const del = await callFn(IDS.deleteCategory, { categoryId: `cat-${slug}` }, token)
console.log('[authed deleteCategory(自己的)] ', del.status, del.body)

// 恢复 cat-tech 原名(若上面改名成功)
const restore = await callFn(IDS.renameCategory, { categoryId: 'cat-tech', name: '技术' }, token)
console.log('[恢复 cat-tech 名称]            ', restore.status, restore.body)

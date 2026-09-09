// 认证面闭环(带地面真值):authed createCategory → REST 验证存在 → 删除 → REST 验证消失
import { Torchwood } from '@torchwood/sdk'
import { toJSONAsync } from 'seroval'

const BASE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD
const CREATE_ID = '96ffab79262343c4b20c8bb6c58d9e63f9d8b82b0f90169e3bc066ca87a94ad2'
const DELETE_ID = 'd77a92147f763545169c1885e518c06fb5afc0446799de6c0c54c04448564b1d'

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })

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
  return res.status
}

async function categoryExists(slug) {
  const res = await fetch(`${GATEWAY}/v1/databases/blog/collections/categories/documents?project_id=blog&pageSize=50`)
  const j = await res.json()
  return (j.documents ?? []).some((d) => d.data?.slug === slug)
}

const slug = `rescan2-${Date.now().toString(36)}`
console.log('[1] authed createCategory http', await callFn(CREATE_ID, { name: 'RESCAN2', slug }, r.tokens.access_token))
await new Promise((res) => setTimeout(res, 600))
console.log('[2] REST 验证分类已存在:', await categoryExists(slug))

console.log('[3] 未授权 delete 同一分类 http', await callFn(DELETE_ID, { categoryId: `cat-${slug}` }, undefined))
await new Promise((res) => setTimeout(res, 600))
console.log('[4] REST 验证仍未被未授权删除(应 true):', await categoryExists(slug))

console.log('[5] authed delete http', await callFn(DELETE_ID, { categoryId: `cat-${slug}` }, r.tokens.access_token))
await new Promise((res) => setTimeout(res, 600))
console.log('[6] REST 验证已删除(应 false):', await categoryExists(slug))

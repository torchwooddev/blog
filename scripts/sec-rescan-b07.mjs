// B-07 复验:/api/upload 白名单(415 在触存储前返回,不受网关数据面影响;放行路径验证存储面)
import { Torchwood } from '@torchwood/sdk'

const SITE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })
const auth = { authorization: `Bearer ${r.tokens.access_token}` }

async function upload(name, type, content) {
  const form = new FormData()
  form.append('file', new File([content], name, { type }))
  const res = await fetch(`${SITE}/api/upload`, { method: 'POST', headers: auth, body: form })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const cases = [
  ['e2e.html', 'text/html', '<h1>x</h1>', 415],
  ['e2e.xhtml', 'application/xhtml+xml', '<html/>', 415],
  ['e2e.swf', 'application/x-shockwave-flash', 'FWS', 415],
  ['e2e.png', 'image/png', 'PNG-fake-bytes-not-really', 200],
  ['e2e.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><text>x</text></svg>', 200],
  ['e2e.pdf', 'application/pdf', '%PDF-1.4 fake', 200],
  ['mismatch.png', 'text/html', 'x', 415],
  ['noext', 'text/plain', 'x', 415],
]
const uploaded = []
for (const [name, type, content, expect] of cases) {
  const res = await upload(name, type, content)
  const ok = res.status === expect
  const fileId = res.body?.file?.id
  if (ok && fileId) uploaded.push(res.body.file)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${type}) -> ${res.status} (期望 ${expect})`, ok ? '' : JSON.stringify(res.body).slice(0, 120))
}

// 放行文件的存储响应头(要求 attachment + nosniff + CSP sandbox)
for (const f of uploaded) {
  const res = await fetch(f.viewUrl)
  const h = res.headers
  console.log(`[storage] ${f.name}: ${res.status} cd=${h.get('content-disposition')?.split(';')[0]} nosniff=${h.get('x-content-type-options')} csp=${(h.get('content-security-policy') ?? 'NONE').slice(0, 40)}`)
}

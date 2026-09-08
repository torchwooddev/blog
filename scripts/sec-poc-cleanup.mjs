// 清理测试文章 + 登录枚举/限速检查
import { Torchwood } from '@torchwood/sdk'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const email = process.argv[2]
const password = process.argv[3]
const postId = process.argv[4]

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })

// 1) 登录枚举:错误密码 vs 不存在账号,比较报错
async function tryLogin(mail, pass) {
  try {
    await tw.account.signIn({ email: mail, password: pass })
    return 'SUCCESS'
  } catch (e) {
    return `${e.status ?? e.code ?? ''} ${String(e.message ?? e).slice(0, 90)}`
  }
}
console.log('[enum] wrong-password :', await tryLogin(email, 'WrongPassword1!'))
console.log('[enum] no-such-user  :', await tryLogin('no-such-user-xyz@test.local', 'Whatever1!'))

// 2) 快速连错 5 次(限速探测,非爆破)
for (let i = 1; i <= 5; i++) {
  const r = await tryLogin(email, `BadPass${i}!`)
  console.log(`[rate] attempt ${i}:`, r.slice(0, 80))
}

// 3) 删除测试文章
const r2 = await tw.account.signIn({ email, password })
tw.setAccessToken(r2.tokens.access_token)
const doc = await tw.databases.getDocument('blog', 'posts', postId)
await tw.databases.deleteDocument('blog', 'posts', postId, doc.version)
console.log('[cleanup] test post deleted:', postId)

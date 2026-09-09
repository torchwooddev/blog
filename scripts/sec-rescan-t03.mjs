// T-03 复验:注册策略 + DeleteAccount(对一次性新账号,不动主测试账号)
import { Torchwood } from '@torchwood/sdk'
import { webcrypto as crypto } from 'node:crypto'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const rand = crypto.randomUUID().slice(0, 8)
const email = `rescan-${rand}@test.local`
const password = `Rescan-${rand}#A`

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })

// 1) 注册(观察策略:open=成功 / invite_only=403 带邀请码语义 / closed=403)
let tokens = null
try {
  const r = await tw.account.signUp({ email, password, name: 'Rescan' })
  tokens = r.tokens
  console.log('[signUp] 开放注册: 成功, userId=', r.account.id)
} catch (e) {
  console.log('[signUp] 被拒:', e.status, String(e.message ?? e).slice(0, 160), JSON.stringify(e.body ?? {}).slice(0, 200))
  process.exit(0)
}

// 2) DeleteAccount(新端点 DELETE /v1/account)
tw.setAccessToken(tokens.access_token)
try {
  const res = await fetch(`${GATEWAY}/v1/account`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${tokens.access_token}` },
  })
  const text = await res.text()
  console.log('[DeleteAccount]', res.status, text.slice(0, 160))
} catch (e) {
  console.log('[DeleteAccount] 请求失败:', String(e).slice(0, 160))
}

// 3) 删除后:旧 token 应失效(me 401),重新登录应拒绝
try {
  const me = await fetch(`${GATEWAY}/v1/account/me`, { headers: { authorization: `Bearer ${tokens.access_token}` } })
  console.log('[me with old token]', me.status, '(期望 401)')
} catch (e) {
  console.log('[me with old token] 请求失败', String(e).slice(0, 120))
}
try {
  await tw.account.signIn({ email, password })
  console.log('[signIn after delete] 竟然成功(!!)')
} catch (e) {
  console.log('[signIn after delete]', e.status, String(e.message ?? e).slice(0, 120), '(期望 401 统一 invalid credentials)')
}

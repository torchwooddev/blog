// 新面扫描:refresh token 重用检测(轮换后旧 token 应作废)
import { Torchwood } from '@torchwood/sdk'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })
const oldRefresh = r.tokens.refresh_token

// 第一次刷新:应成功并颁发新 refresh token
const r1 = await tw.account.refresh(oldRefresh)
console.log('[refresh#1] OK, 新 refresh 与旧的相同:', r1.refresh_token === oldRefresh)

// 第二次用旧 refresh token:若网关做了轮换吊销,应失败
try {
  const r2 = await tw.account.refresh(oldRefresh)
  console.log('[refresh#2 旧token重用] 竟然成功(!!) 无重用检测')
} catch (e) {
  console.log('[refresh#2 旧token重用] 被拒:', e.status, String(e.message ?? e).slice(0, 120), '(有重用检测)')
}

// 新 refresh 是否可用(确认刷新链没被上一步搞坏)
try {
  const r3 = await tw.account.refresh(r1.refresh_token)
  console.log('[refresh#3 新token] OK(链路正常)')
} catch (e) {
  console.log('[refresh#3 新token] 被拒:', e.status, String(e.message ?? e).slice(0, 120))
}

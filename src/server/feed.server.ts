import { publicConfig } from '#/lib/config'
import { xmlEscape } from '#/lib/xml'
import { excerpt } from '#/lib/types'
import { fetchAllCategories, fetchPublishedPosts } from './public-data.server'

/** RSS 2.0 订阅源（读取走 Server 面 API Key）。 */
export async function renderFeedXml(): Promise<string> {
  const page = await fetchPublishedPosts()
  const categories = await fetchAllCategories()
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const items = page.items
    .map((post) => {
      const category = categoryById.get(post.categoryId)
      // slug 由作者端写入（用户可控），拼进 <link>/<guid> 前必须转义：
      // 字面 "<" 可注入标签，裸 "&" 会破坏 XML 合法性。
      const url = xmlEscape(`${publicConfig.siteUrl}/posts/${post.slug}`)
      return [
        '    <item>',
        `      <title>${xmlEscape(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${new Date(post.publishedAt ?? post.createdAt).toUTCString()}</pubDate>`,
        ...(category ? [`      <category>${xmlEscape(category.name)}</category>`] : []),
        `      <description>${xmlEscape(excerpt(post.content, 300))}</description>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(publicConfig.siteName)}</title>
    <link>${xmlEscape(publicConfig.siteUrl)}</link>
    <description>TanStack Start + Torchwood BaaS 的参考实现</description>
    <language>zh-CN</language>
    <atom:link href="${xmlEscape(`${publicConfig.siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

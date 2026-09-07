import { publicConfig } from '#/lib/config'
import { excerpt } from '#/lib/types'
import { fetchAllCategories, fetchPublishedPosts } from './public-data.server'

/** RSS 2.0 订阅源（读取走 Server 面 API Key）。 */
export async function renderFeedXml(): Promise<string> {
  const page = await fetchPublishedPosts()
  const categories = await fetchAllCategories()
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  const escaped = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const items = page.items
    .map((post) => {
      const category = categoryById.get(post.categoryId)
      const url = `${publicConfig.siteUrl}/posts/${post.slug}`
      return [
        '    <item>',
        `      <title>${escaped(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${new Date(post.publishedAt ?? post.createdAt).toUTCString()}</pubDate>`,
        ...(category ? [`      <category>${escaped(category.name)}</category>`] : []),
        `      <description>${escaped(excerpt(post.content, 300))}</description>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escaped(publicConfig.siteName)}</title>
    <link>${publicConfig.siteUrl}</link>
    <description>TanStack Start + Torchwood BaaS 的参考实现</description>
    <language>zh-CN</language>
    <atom:link href="${publicConfig.siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
}

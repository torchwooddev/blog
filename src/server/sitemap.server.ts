import { publicConfig } from '#/lib/config'
import { xmlEscape } from '#/lib/xml'
import { fetchAllPublishedSlugs } from './public-data.server'

/** sitemap.xml（Server 面可见 = 已发布的文章）。 */
export async function renderSitemapXml(): Promise<string> {
  const entries = await fetchAllPublishedSlugs()
  // slug 来自文档字段（作者可控），拼进 <loc> 前必须转义，
  // 防止字面 "<"/"&" 注入标签或破坏 XML 解析。
  const urls = [
    { loc: xmlEscape(`${publicConfig.siteUrl}/`), lastmod: null as string | null },
    ...entries.map((e) => ({
      loc: xmlEscape(`${publicConfig.siteUrl}/posts/${e.slug}`),
      lastmod: xmlEscape(e.updatedAt),
    })),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) =>
    [
      '  <url>',
      `    <loc>${u.loc}</loc>`,
      ...(u.lastmod ? [`    <lastmod>${u.lastmod}</lastmod>`] : []),
      '  </url>',
    ].join('\n'),
  )
  .join('\n')}
</urlset>
`
}

import { publicConfig } from '#/lib/config'
import { fetchAllPublishedSlugs } from './public-data.server'

/** sitemap.xml（Server 面可见 = 已发布的文章）。 */
export async function renderSitemapXml(): Promise<string> {
  const entries = await fetchAllPublishedSlugs()
  const urls = [
    { loc: `${publicConfig.siteUrl}/`, lastmod: null as string | null },
    ...entries.map((e) => ({
      loc: `${publicConfig.siteUrl}/posts/${e.slug}`,
      lastmod: e.updatedAt,
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

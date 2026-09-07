import { createFileRoute } from '@tanstack/react-router'
import { renderSitemapXml } from '#/server/sitemap.server'

/** GET /sitemap.xml。 */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const xml = await renderSitemapXml()
        return new Response(xml, {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        })
      },
    },
  },
})

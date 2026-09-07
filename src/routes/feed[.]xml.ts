import { createFileRoute } from '@tanstack/react-router'
import { renderFeedXml } from '#/server/feed.server'

/** GET /feed.xml：RSS 2.0 订阅源。 */
export const Route = createFileRoute('/feed.xml')({
  server: {
    handlers: {
      GET: async () => {
        const xml = await renderFeedXml()
        return new Response(xml, {
          headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
        })
      },
    },
  },
})

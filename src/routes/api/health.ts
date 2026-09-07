import { createFileRoute } from '@tanstack/react-router'
import { probeTorchwood } from '#/server/health.server'

/** GET /api/health：探活 Torchwood 端点。 */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const payload = await probeTorchwood()
        return Response.json(payload, { status: payload.ok ? 200 : payload.torchwood === 'unconfigured' ? 500 : 503 })
      },
    },
  },
})

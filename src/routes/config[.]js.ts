import { createFileRoute } from '@tanstack/react-router'
import { publicConfig } from '#/lib/config'

/**
 * GET /config.js：把公开配置注入 window.__APP_CONFIG__。
 * 这是「镜像通用」的关键：配置全部来自容器运行时环境变量，
 * 换 Torchwood 实例/项目/站点域名只需改环境变量并重启，无需重新构建镜像。
 * 以 classic script 挂在 head 里，先于所有 deferred module bundle 执行。
 */
export const Route = createFileRoute('/config.js')({
  server: {
    handlers: {
      GET: async () => {
        const body = `window.__APP_CONFIG__=${JSON.stringify(publicConfig)};\n`
        return new Response(body, {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})

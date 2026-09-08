/**
 * TanStack Start 实例入口（`src/start.ts` 是 `#tanstack-start-entry` 的约定解析路径，
 * 参见 @tanstack/start-plugin-core 对 start entry 的 resolveEntry 逻辑，以及
 * createStartHandler.js 在缺失 CSRF 中间件时打印的推荐写法）。
 *
 * B-05（docs/security-audit-2026-09-08.md）：此前项目没有 start 实例，走默认回退
 * （仅有内置 CSRF 中间件），全站零安全响应头。这里显式接管 start 实例：
 *  - csrfMiddleware：与内置默认等价（filter 只拦 serverFn）。注意：一旦提供
 *    startInstance，默认回退不再生效，漏掉它会让 server functions 失去 CSRF 防护（回归）。
 *  - securityHeadersMiddleware：为所有经 Start handler 的响应（SSR 页面、/api/*、
 *    /config.js、/feed.xml、sitemap、/_serverFn/*）统一追加安全响应头，不覆盖上游同名头。
 *
 * CSP 为什么是 Report-Only 而非强制：站点依赖内联脚本（next-themes 的主题引导脚本）
 * 与 Google Fonts 的跨源样式/字体，强制 CSP 需要 'unsafe-inline'，对脚本形同虚设；
 * 先用 Report-Only 全站试跑、观察违规上报，确认无误伤后再决定是否收紧为强制。
 * 这是本次的范围决策，不是遗漏。
 */

import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { publicConfig } from '#/lib/config'

/** 强制下发的安全响应头（值固定，逐条见 applySecurityHeaders）。 */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  // dev 的 http 环境下浏览器会忽略 HSTS，无副作用；生产 https 下覆盖子域。
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
]

/**
 * 由运行时公开配置构建 CSP：附件图片/预览与浏览器直连 API 都指向 Torchwood
 * endpoint 的 origin（http://localhost:* 等开发地址同样可用；endpoint 非法时
 * 安全回退为仅 'self'）。http 源同时放行其 ws 变体，https 源放行 wss 变体。
 */
export function buildContentSecurityPolicy(endpoint: string): string {
  let apiOrigin = ''
  let wsOrigin = ''
  try {
    apiOrigin = new URL(endpoint).origin
    wsOrigin = apiOrigin.replace(/^http/, 'ws')
  } catch {
    // 解析失败时不追加任何源，策略退化为仅 'self'
  }
  const api = apiOrigin ? ` ${apiOrigin}` : ''
  return [
    "default-src 'self'",
    // 'unsafe-inline'：next-themes 内联主题引导脚本 + Tailwind 运行产物尚不可移除
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    `img-src 'self'${api} data:`,
    `connect-src 'self'${api}${wsOrigin ? ` ${wsOrigin}` : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

/** 逐条追加安全头；已有同名头不覆盖，immutable 头（如 redirect 产物）安全跳过。 */
function applySecurityHeaders(headers: Headers): void {
  const setOnce = (name: string, value: string): void => {
    try {
      if (!headers.has(name)) headers.set(name, value)
    } catch {
      // Response.headers 为 immutable guard 时（Response.redirect/error 产物），放弃该头
    }
  }
  for (const [name, value] of SECURITY_HEADERS) setOnce(name, value)
  setOnce('Content-Security-Policy-Report-Only', buildContentSecurityPolicy(publicConfig.endpoint))
}

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()
  // next() 返回的 response 是最终响应的未包装 Response；原地改 headers 可保留
  // SSR 流式响应的清理语义（不能替换 Response 实例本身）。
  const response: Response | undefined = result.response
  if (response) applySecurityHeaders(response.headers)
  return result
})

/**
 * 与 createStartHandler 内置默认等价的 CSRF 中间件。接管 start 实例后
 * `requestMiddleware` 完全由这里提供，默认回退不再生效——必须显式带上。
 */
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityHeadersMiddleware],
}))

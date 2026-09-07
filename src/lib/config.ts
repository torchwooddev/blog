/**
 * 浏览器可见的公开配置。只有 `VITE_` 前缀的值允许出现在这里——
 * API Key 等敏感配置只存在于 src/server/*.server.ts（读 process.env）。
 */
export const publicConfig = {
  endpoint: import.meta.env.VITE_TORCHWOOD_ENDPOINT || 'http://localhost:9080',
  projectId: import.meta.env.VITE_TORCHWOOD_PROJECT_ID || 'blog',
  siteName: import.meta.env.VITE_SITE_NAME || 'Torchwood Blog',
  siteUrl: (import.meta.env.VITE_SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
} as const

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Torchwood HTTP 端点（公开：浏览器直连 Client API 也用它）。 */
  readonly VITE_TORCHWOOD_ENDPOINT: string
  /** Torchwood 项目 ID（公开）。 */
  readonly VITE_TORCHWOOD_PROJECT_ID: string
  /** 站点名称。 */
  readonly VITE_SITE_NAME: string
  /** 站点对外 URL（OG / RSS / sitemap 绝对地址）。 */
  readonly VITE_SITE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

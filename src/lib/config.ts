/**
 * 公开配置（浏览器与 SSR 共用），四层解析、后者覆盖前者：
 *   内置默认 ← 构建期 import.meta.env.VITE_*（可选兜底，如静态预览）
 *            ← 服务端 process.env（SSR / feed / sitemap 运行时读取）
 *            ← 浏览器 window.__APP_CONFIG__（由 GET /config.js 注入的运行时值）
 * 因此镜像保持通用：公开配置全部运行时可调，换环境/项目无需重新构建。
 * 纪律不变：只有公开值允许出现在这里——API Key 只存在于 src/server/*.server.ts。
 */

export interface PublicConfig {
  endpoint: string
  projectId: string
  siteName: string
  siteUrl: string
}

const DEFAULTS: PublicConfig = {
  endpoint: 'http://localhost:9080',
  projectId: 'blog',
  siteName: 'Torchwood Blog',
  siteUrl: 'http://localhost:3000',
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<PublicConfig> | undefined
  }
}

/** 空串视为未设置（与 src/server/env.server.ts 的 read() 语义一致）。 */
function pick(value: string | undefined): string | undefined {
  return value !== undefined && value !== '' ? value : undefined
}

/** 剔除 undefined 键，避免 spread 时以 undefined 覆盖已解析值。 */
function compact(partial: Partial<PublicConfig>): Partial<PublicConfig> {
  return Object.fromEntries(
    Object.entries(partial).filter(([, value]) => value !== undefined),
  ) as Partial<PublicConfig>
}

/** 构建期烘入的 VITE_*（vite build/dev 提供；未设置时全部缺席）。 */
function fromBakedEnv(): Partial<PublicConfig> {
  const baked = import.meta.env
  return {
    endpoint: pick(baked.VITE_TORCHWOOD_ENDPOINT),
    projectId: pick(baked.VITE_TORCHWOOD_PROJECT_ID),
    siteName: pick(baked.VITE_SITE_NAME),
    siteUrl: pick(baked.VITE_SITE_URL),
  }
}

/** 服务端运行时环境变量（浏览器无 process，守卫跳过）。 */
function fromProcessEnv(): Partial<PublicConfig> {
  if (typeof process === 'undefined') return {}
  const env = process.env
  return {
    endpoint: pick(env['VITE_TORCHWOOD_ENDPOINT']) ?? pick(env['BLOG_TORCHWOOD_ENDPOINT']),
    projectId: pick(env['VITE_TORCHWOOD_PROJECT_ID']) ?? pick(env['BLOG_TORCHWOOD_PROJECT_ID']),
    siteName: pick(env['VITE_SITE_NAME']),
    siteUrl: pick(env['VITE_SITE_URL']),
  }
}

/** 浏览器端 /config.js 注入的运行时值（SSR 无 window，守卫跳过）。 */
function fromWindow(): Partial<PublicConfig> {
  if (typeof window === 'undefined') return {}
  return window.__APP_CONFIG__ ?? {}
}

const resolved: PublicConfig = {
  ...DEFAULTS,
  ...compact(fromBakedEnv()),
  ...compact(fromProcessEnv()),
  ...compact(fromWindow()),
}

export const publicConfig: PublicConfig = {
  ...resolved,
  siteUrl: resolved.siteUrl.replace(/\/+$/, ''),
}

import { publicConfig } from './config'

/**
 * 站点配置（settings 集合单例文档）的共享模型：类型、env 兜底、解析与校验。
 *
 * 两层语义：环境变量（src/lib/config.ts）是部署层兜底，settings 集合是管理员的
 * 运行时覆盖层——文档里**出现过的 key**（含空串）一律以 DB 值生效，缺失的 key
 * 回退 env 值。因此"清空"是可表达的（存空串），"未设置"也是可表达的（不写 key）。
 *
 * 纪律：这里只有公开值（站点名/简介等本来就是页面上展示的内容），
 * endpoint/projectId/API Key 等基础设施配置不进配置表，仍走 env。
 */

/** 生效视图：所有字段必有值（DB 命中或 env 兜底）。 */
export interface SiteSettings {
  siteName: string
  siteDescription: string
  siteFooterNote: string
  postsPerPage: number
  commentsEnabled: boolean
}

/** settings 单例的 document_id（read/write 都按它点查）。 */
export const SITE_SETTINGS_DOCUMENT_ID = 'site'

/** env 层兜底：与 publicConfig 同源，postsPerPage 沿用原硬编码默认。 */
export const SITE_SETTINGS_FALLBACK: SiteSettings = {
  siteName: publicConfig.siteName,
  siteDescription: publicConfig.siteDescription,
  siteFooterNote: publicConfig.siteFooterNote,
  postsPerPage: 5,
  commentsEnabled: true,
}

/** settings 文档 data 的宽松解析结果：key 缺失 = undefined（回退 env）。 */
export interface RawSiteSettings {
  siteName?: string
  siteDescription?: string
  siteFooterNote?: string
  postsPerPage?: number
  commentsEnabled?: boolean
}

function readStr(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key]
  return typeof v === 'string' ? v : undefined
}

function readInt(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number.parseInt(v, 10)
  return undefined
}

function readBool(data: Record<string, unknown>, key: string): boolean | undefined {
  const v = data[key]
  return typeof v === 'boolean' ? v : undefined
}

/** DocumentDB 文档 data → RawSiteSettings（只认类型正确的 key，其余视为未设置）。 */
export function parseRawSiteSettings(data: Record<string, unknown>): RawSiteSettings {
  return {
    siteName: readStr(data, 'site_name'),
    siteDescription: readStr(data, 'site_description'),
    siteFooterNote: readStr(data, 'site_footer_note'),
    postsPerPage: readInt(data, 'posts_per_page'),
    commentsEnabled: readBool(data, 'comments_enabled'),
  }
}

/** 覆盖层合并：DB key 存在（含空串）→ 生效；缺失 → env 兜底。 */
export function resolveSiteSettings(raw: RawSiteSettings, fallback: SiteSettings = SITE_SETTINGS_FALLBACK): SiteSettings {
  return {
    siteName: raw.siteName !== undefined ? raw.siteName : fallback.siteName,
    siteDescription: raw.siteDescription !== undefined ? raw.siteDescription : fallback.siteDescription,
    siteFooterNote: raw.siteFooterNote !== undefined ? raw.siteFooterNote : fallback.siteFooterNote,
    postsPerPage:
      raw.postsPerPage !== undefined && Number.isInteger(raw.postsPerPage) && raw.postsPerPage > 0
        ? raw.postsPerPage
        : fallback.postsPerPage,
    commentsEnabled: raw.commentsEnabled !== undefined ? raw.commentsEnabled : fallback.commentsEnabled,
  }
}

/** RawSiteSettings 是否携带至少一个显式 key（判定"管理员是否已保存过配置"）。 */
export function rawHasAnyValue(raw: RawSiteSettings): boolean {
  return raw.siteName !== undefined || raw.siteDescription !== undefined || raw.siteFooterNote !== undefined ||
    raw.postsPerPage !== undefined || raw.commentsEnabled !== undefined
}

/**
 * 管理端保存入参的校验：trim + 长度上限 + 数值范围。
 * 字段允许留空（空串 = 显式清空，回退语义见模块注释），但不接受越界值。
 */
export interface SiteSettingsInput {
  siteName: string
  siteDescription: string
  siteFooterNote: string
  postsPerPage: number
  commentsEnabled: boolean
}

export type ValidateSettingsResult = { ok: true; value: SiteSettingsInput } | { ok: false; message: string }

export function validateSiteSettingsInput(input: SiteSettingsInput): ValidateSettingsResult {
  const siteName = input.siteName.trim()
  const siteDescription = input.siteDescription.trim()
  const siteFooterNote = input.siteFooterNote.trim()
  if (siteName.length > 60) return { ok: false, message: '站点名称不能超过 60 个字符。' }
  if (siteDescription.length > 200) return { ok: false, message: '站点简介不能超过 200 个字符。' }
  if (siteFooterNote.length > 120) return { ok: false, message: '页脚附注不能超过 120 个字符。' }
  if (!Number.isInteger(input.postsPerPage) || input.postsPerPage < 1 || input.postsPerPage > 50) {
    return { ok: false, message: '每页文章数必须是 1~50 的整数。' }
  }
  return {
    ok: true,
    value: {
      siteName,
      siteDescription,
      siteFooterNote,
      postsPerPage: input.postsPerPage,
      commentsEnabled: input.commentsEnabled === true,
    },
  }
}

/** SiteSettingsInput → 文档 data（key 全量写入：保存动作本身声明"以表单为准"）。 */
export function siteSettingsToData(value: SiteSettingsInput): Record<string, unknown> {
  return {
    site_name: value.siteName,
    site_description: value.siteDescription,
    site_footer_note: value.siteFooterNote,
    posts_per_page: value.postsPerPage,
    comments_enabled: value.commentsEnabled,
  }
}

/**
 * head() 回调的 helper：从 matches 里找 root loader 注入的 settings。
 * root loader 失败回退时返回 undefined，调用方用 env 兜底（与渲染层一致）。
 */
export interface SettingsLoaderData {
  settings?: SiteSettings
}

export function settingsFromMatches(matches: readonly { loaderData?: unknown }[]): SiteSettings {
  for (const match of matches) {
    const data = match.loaderData as SettingsLoaderData | undefined
    if (data && typeof data === 'object' && data.settings) return data.settings
  }
  return SITE_SETTINGS_FALLBACK
}

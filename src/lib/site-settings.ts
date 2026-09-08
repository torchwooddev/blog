import { publicConfig } from './config'

/**
 * 站点配置（settings 集合，通用 KV 结构）的共享模型：类型、env 兜底、解析与校验。
 *
 * 存储形态：每项配置一行文档（document_id = `setting-<key>`），data = { key, value }，
 * value 恒为 JSON 编码字符串。**集合结构只有 key/value 两列**——加新配置 = 在本文件
 * 的键注册表声明键 + 在解析/序列化各加一行，无需 DDL，未知键在读取时被忽略、
 * 写入时不受影响（前向兼容）。
 *
 * 两层语义：环境变量（src/lib/config.ts）是部署层兜底，settings 集合是管理员的
 * 运行时覆盖层——**出现过的 key**（含空串）一律以 DB 值生效，缺失的 key 回退 env
 * 值。因此"清空"是可表达的（存空串），"未设置"也是可表达的（不写行）。
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

// ---------------------------------------------------------------------------
// KV 存储层：键注册表、行解析与序列化
// ---------------------------------------------------------------------------

/** 已知配置键（即存储 key）。加新配置 = 在这里加键，并在 rawFromSettingMap /
 * rowsFromInput 各处理一行。 */
export const SETTING_KEYS = [
  'site_name',
  'site_description',
  'site_footer_note',
  'posts_per_page',
  'comments_enabled',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

/** KV 行的文档 id 约定（key 有唯一索引，document_id 派生自 key 以天然幂等）。 */
export function settingDocId(key: string): string {
  return `setting-${key}`
}

/** 一行配置。value 恒为 JSON 编码字符串（value 列是 string 类型）。 */
export interface SettingRow {
  key: string
  value: string
}

/** 宽松解析一行 KV 文档 data：key/value 形态不对（或 value 非法 JSON）返回 null。 */
export function parseSettingDoc(data: Record<string, unknown>): { key: string; value: unknown } | null {
  const key = data['key']
  const raw = data['value']
  if (typeof key !== 'string' || key.length === 0 || typeof raw !== 'string') return null
  try {
    return { key, value: JSON.parse(raw) as unknown }
  } catch {
    return null
  }
}

/** 一批 KV 文档 → 键值 map（损坏行跳过，不影响其余配置）。 */
export function settingMapFromDocs(docs: readonly { data: Record<string, unknown> }[]): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const doc of docs) {
    const parsed = parseSettingDoc(doc.data)
    if (parsed) map.set(parsed.key, parsed.value)
  }
  return map
}

function mapStr(map: Map<string, unknown>, key: SettingKey): string | undefined {
  const v = map.get(key)
  return typeof v === 'string' ? v : undefined
}

function mapInt(map: Map<string, unknown>, key: SettingKey): number | undefined {
  const v = map.get(key)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number.parseInt(v, 10)
  return undefined
}

function mapBool(map: Map<string, unknown>, key: SettingKey): boolean | undefined {
  const v = map.get(key)
  return typeof v === 'boolean' ? v : undefined
}

/** 键值 map → 原始视图（只认类型正确的已知键，缺失 = undefined = 回退 env）。 */
export function rawSiteSettingsFromMap(map: Map<string, unknown>): RawSiteSettings {
  return {
    siteName: mapStr(map, 'site_name'),
    siteDescription: mapStr(map, 'site_description'),
    siteFooterNote: mapStr(map, 'site_footer_note'),
    postsPerPage: mapInt(map, 'posts_per_page'),
    commentsEnabled: mapBool(map, 'comments_enabled'),
  }
}

/** RawSiteSettings 是否携带至少一个显式 key（判定"管理员是否已保存过配置"）。 */
export function rawHasAnyValue(raw: RawSiteSettings): boolean {
  return raw.siteName !== undefined || raw.siteDescription !== undefined || raw.siteFooterNote !== undefined ||
    raw.postsPerPage !== undefined || raw.commentsEnabled !== undefined
}

/** 表单值 → KV 行（value 全部 JSON 编码；保存动作本身声明"以表单为准"）。 */
export function rowsFromInput(value: SiteSettingsInput): SettingRow[] {
  return [
    { key: 'site_name', value: JSON.stringify(value.siteName) },
    { key: 'site_description', value: JSON.stringify(value.siteDescription) },
    { key: 'site_footer_note', value: JSON.stringify(value.siteFooterNote) },
    { key: 'posts_per_page', value: JSON.stringify(value.postsPerPage) },
    { key: 'comments_enabled', value: JSON.stringify(value.commentsEnabled) },
  ]
}

// ---------------------------------------------------------------------------
// 旧版（列式单例文档）迁移辅助：rowsFromLegacyData 供一次性导入使用
// ---------------------------------------------------------------------------

/** 旧版单例文档的 document_id。 */
export const LEGACY_SETTING_DOCUMENT_ID = 'site'

/** 旧版集合的列名（= KV 键，同名迁移）。迁移完成后这些列会被删除。 */
export const LEGACY_SETTING_COLUMNS = [
  'site_name',
  'site_description',
  'site_footer_note',
  'posts_per_page',
  'comments_enabled',
] as const

function legacyStr(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key]
  return typeof v === 'string' ? v : undefined
}

function legacyInt(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number.parseInt(v, 10)
  return undefined
}

function legacyBool(data: Record<string, unknown>, key: string): boolean | undefined {
  const v = data[key]
  return typeof v === 'boolean' ? v : undefined
}

/** 旧版单例文档 data → KV 行（只导入类型正确的列；导入不了的丢弃，回退 env）。 */
export function rowsFromLegacyData(data: Record<string, unknown>): SettingRow[] {
  const rows: SettingRow[] = []
  const push = (key: SettingKey, v: unknown) => {
    if (v !== undefined) rows.push({ key, value: JSON.stringify(v) })
  }
  push('site_name', legacyStr(data, 'site_name'))
  push('site_description', legacyStr(data, 'site_description'))
  push('site_footer_note', legacyStr(data, 'site_footer_note'))
  push('posts_per_page', legacyInt(data, 'posts_per_page'))
  push('comments_enabled', legacyBool(data, 'comments_enabled'))
  return rows
}

// ---------------------------------------------------------------------------
// 覆盖层合并与表单校验（与存储形态无关）
// ---------------------------------------------------------------------------

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

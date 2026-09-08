import type { Document, Torchwood } from '@torchwood/sdk'
import { COLLECTIONS, DATABASE_ID } from '#/lib/blog-schema'
import {
  parseSettingDoc,
  rawHasAnyValue,
  rawSiteSettingsFromMap,
  resolveSiteSettings,
  rowsFromInput,
  settingDocId,
  validateSiteSettingsInput,
  type RawSiteSettings,
  type SettingRow,
  type SiteSettings,
  type SiteSettingsInput,
} from '#/lib/site-settings'
import { parseVersion } from '#/lib/types'
import { ensureBlogReady } from './provision.server'
import { getServerTorchwood } from './torchwood.server'

/**
 * 站点配置（settings 集合，KV 结构）的服务端读写。
 *
 * 读：一行一配置，listDocuments 全量取回（配置总量个位数）后解析成 map；
 * feed/sitemap/SSR loader 每个请求都会用到，30s 进程内缓存挡高频查询；
 * 管理端保存后立即刷新缓存（同进程立竿见影，多实例部署在 TTL 内收敛）。
 * 集合为空（首次部署）或读取失败时回退 env 兜底——配置层故障不放大成站点故障。
 *
 * 写：只 upsert 值有变化的键（幂等、省写）。单行 upsert 协议：按 document_id
 * 点查 → OCC update；不存在 → create；并发首存 create 失败回读再 update 一次。
 */

const SITE_SETTINGS_TTL_MS = 30_000

interface SettingsCache {
  value: SiteSettings
  /** 集合非空时为解析出的 raw（管理页回显"是否已自定义"用），否则 null。 */
  raw: RawSiteSettings | null
  savedAt: number
}

let cache: SettingsCache | null = null

function fromCache(): SettingsCache | null {
  if (!cache) return null
  if (Date.now() - cache.savedAt > SITE_SETTINGS_TTL_MS) return null
  return cache
}

function putCache(raw: RawSiteSettings | null): SettingsCache {
  const entry: SettingsCache = {
    value: resolveSiteSettings(raw ?? {}),
    raw,
    savedAt: Date.now(),
  }
  cache = entry
  return entry
}

/** 集合为空 / 读取失败 → null（调用方决定回退），不缓存失败结果。 */
async function readRawSettings(): Promise<RawSiteSettings | null> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  try {
    const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.settings, { page_size: 200 })
    const map = new Map<string, unknown>()
    for (const doc of result.documents) {
      const parsed = parseSettingDoc(doc.data)
      if (parsed) map.set(parsed.key, parsed.value)
    }
    if (map.size === 0) return null
    const raw = rawSiteSettingsFromMap(map)
    return rawHasAnyValue(raw) ? raw : null
  } catch {
    return null
  }
}

/** 生效配置（DB 覆盖层 + env 兜底），带 30s 进程缓存。 */
export async function fetchSiteSettings(): Promise<SiteSettings> {
  const hit = fromCache()
  if (hit) return hit.value
  const raw = await readRawSettings()
  return putCache(raw).value
}

/** 读取原始记录与生效值（管理页回显：raw 为 null = 尚未自定义，全部走 env 兜底）。 */
export async function fetchSiteSettingsWithRaw(): Promise<{ raw: RawSiteSettings | null; value: SiteSettings }> {
  const hit = fromCache()
  if (hit) return { raw: hit.raw, value: hit.value }
  const raw = await readRawSettings()
  const entry = putCache(raw)
  return { raw: entry.raw, value: entry.value }
}

/** 单行 upsert：点查 → OCC update；不存在 → create；并发首存失败回读再 update。 */
export async function upsertSettingRow(tw: Torchwood, row: SettingRow): Promise<void> {
  const data = { key: row.key, value: row.value }
  const id = settingDocId(row.key)
  let doc: Document | null = null
  try {
    doc = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.settings, id)
  } catch {
    doc = null
  }
  if (doc) {
    await tw.server.databases.updateDocument(DATABASE_ID, COLLECTIONS.settings, doc.id, {
      data,
      version: parseVersion(doc.version),
    })
    return
  }
  try {
    await tw.server.databases.createDocument(DATABASE_ID, COLLECTIONS.settings, { document_id: id, data })
  } catch {
    // 并发首存竞态：回读成功即视为完成，否则抛出原始错误。
    const existing = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.settings, id)
    await tw.server.databases.updateDocument(DATABASE_ID, COLLECTIONS.settings, existing.id, {
      data,
      version: parseVersion(existing.version),
    })
  }
}

/** 保存（管理端专用）：只写有变化的键；成功后立即刷新进程缓存。 */
export async function saveSiteSettings(input: SiteSettingsInput): Promise<SiteSettings> {
  const checked = validateSiteSettingsInput(input)
  if (!checked.ok) throw new Error(checked.message)
  await ensureBlogReady()
  const tw = getServerTorchwood()

  // 当前 DB 值 → 只 upsert 有变化的键（等值比较基于 JSON 编码形态）。
  const rows = rowsFromInput(checked.value)
  let current: Map<string, unknown> | null = null
  try {
    const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.settings, { page_size: 200 })
    current = new Map<string, unknown>()
    for (const doc of result.documents) {
      const parsed = parseSettingDoc(doc.data)
      if (parsed) current.set(parsed.key, parsed.value)
    }
  } catch {
    current = null
  }

  for (const row of rows) {
    // row.value 由 JSON.stringify 生成，必为合法 JSON。
    if (current && current.get(row.key) === (JSON.parse(row.value) as unknown)) continue
    await upsertSettingRow(tw, row)
  }

  const raw = rawSiteSettingsFromMap(
    new Map(rows.map((row) => [row.key, JSON.parse(row.value) as unknown] as const)),
  )
  return putCache(raw).value
}

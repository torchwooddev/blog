import type { Document } from '@torchwood/sdk'
import { COLLECTIONS, DATABASE_ID } from '#/lib/blog-schema'
import {
  parseRawSiteSettings,
  rawHasAnyValue,
  resolveSiteSettings,
  siteSettingsToData,
  validateSiteSettingsInput,
  SITE_SETTINGS_DOCUMENT_ID,
  type RawSiteSettings,
  type SiteSettings,
  type SiteSettingsInput,
} from '#/lib/site-settings'
import { parseVersion } from '#/lib/types'
import { ensureBlogReady } from './provision.server'
import { getServerTorchwood } from './torchwood.server'

/**
 * 站点配置（settings 单例）的服务端读写。
 *
 * 读：feed/sitemap/SSR loader 每个请求都会用到，加 30s 进程内缓存挡高频点查；
 * 管理端保存后立即刷新缓存（同进程立竿见影，多实例部署在 TTL 内收敛）。
 * 文档不存在（首次部署）或读取失败时回退 env 兜底——配置层故障不放大成站点故障。
 *
 * 写：仿 createTaxonomyDoc 的幂等协议——先点查单例，存在则 OCC update，
 * 不存在则 create；并发首存时 create 失败回读再 update 一次。
 */

const SITE_SETTINGS_TTL_MS = 30_000

interface SettingsCache {
  value: SiteSettings
  /** 文档存在时为解析出的 raw（管理页回显"是否已自定义"用），否则 null。 */
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

/** 单例文档不存在 / 读取失败 → null（调用方决定回退），不缓存失败结果。 */
async function readRawSettings(): Promise<RawSiteSettings | null> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  try {
    const doc = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.settings, SITE_SETTINGS_DOCUMENT_ID)
    const raw = parseRawSiteSettings(doc.data)
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

/** 保存（管理端专用）：成功后立即刷新进程缓存。 */
export async function saveSiteSettings(input: SiteSettingsInput): Promise<SiteSettings> {
  const checked = validateSiteSettingsInput(input)
  if (!checked.ok) throw new Error(checked.message)
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const data = siteSettingsToData(checked.value)

  let doc: Document | null
  try {
    doc = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.settings, SITE_SETTINGS_DOCUMENT_ID)
  } catch {
    doc = null
  }

  if (doc) {
    await tw.server.databases.updateDocument(DATABASE_ID, COLLECTIONS.settings, doc.id, {
      data,
      version: parseVersion(doc.version),
    })
  } else {
    try {
      await tw.server.databases.createDocument(DATABASE_ID, COLLECTIONS.settings, {
        document_id: SITE_SETTINGS_DOCUMENT_ID,
        data,
      })
    } catch {
      // 并发首存竞态：回读成功即视为保存完成，否则抛出原始错误。
      const existing = await tw.server.databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.settings,
        SITE_SETTINGS_DOCUMENT_ID,
      )
      await tw.server.databases.updateDocument(DATABASE_ID, COLLECTIONS.settings, existing.id, {
        data,
        version: parseVersion(existing.version),
      })
    }
  }

  const raw = parseRawSiteSettings(data)
  return putCache(raw).value
}

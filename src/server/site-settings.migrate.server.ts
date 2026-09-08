import type { Document, Torchwood } from '@torchwood/sdk'
import { COLLECTIONS, DATABASE_ID } from '#/lib/blog-schema'
import {
  LEGACY_SETTING_COLUMNS,
  LEGACY_SETTING_DOCUMENT_ID,
  rowsFromLegacyData,
} from '#/lib/site-settings'
import { parseVersion } from '#/lib/types'
import { upsertSettingRow } from './site-settings.server'

/**
 * 站点配置"列式单例 → KV"的一次性迁移（幂等，随 provision 在 ensureAttributes
 * 之后运行——此时 key/value 列与 by_key 索引已就绪）：
 *
 * 1. KV 集合为空且旧单例文档（document_id = 'site'）存在 → 把类型正确的旧列
 *    导入为 KV 行（保留管理员已保存的配置，升级零感知）；
 * 2. 删除旧列（deleteAttribute 为异步生命周期，失败可容忍——下轮启动重试）；
 * 3. 删除旧单例文档。
 *
 * 任何失败只记日志、不抛出——配置层故障不放大成启动故障（与读取回退 env 同纪律）。
 */
export async function migrateSiteSettingsToKV(tw: Torchwood): Promise<void> {
  try {
    const list = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.settings, { page_size: 200 })

    // 1. 首次迁移：KV 为空 → 导入旧单例的值。
    if (list.documents.length === 0) {
      let legacy: Document | null = null
      try {
        legacy = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.settings, LEGACY_SETTING_DOCUMENT_ID)
      } catch {
        legacy = null
      }
      if (legacy) {
        const rows = rowsFromLegacyData(legacy.data)
        for (const row of rows) {
          await upsertSettingRow(tw, row)
        }
        if (rows.length > 0) {
          console.log(`[settings-migrate] 已从旧版单例导入 ${rows.length} 项站点配置`)
        }
      }
    }

    // 2. 删除旧列（先查再删，避免每轮启动的 404 噪音）。
    const coll = await tw.server.databases.getCollection(DATABASE_ID, COLLECTIONS.settings)
    const present = new Set((coll.attributes ?? []).map((a) => a.key))
    for (const column of LEGACY_SETTING_COLUMNS) {
      if (!present.has(column)) continue
      try {
        await tw.server.databases.deleteAttribute(DATABASE_ID, COLLECTIONS.settings, column)
      } catch (e) {
        console.warn(`[settings-migrate] 删除旧列 ${column} 失败（下轮重试）:`, e instanceof Error ? e.message : e)
      }
    }

    // 3. 删除旧单例文档（列已弃用，留着只会造成混淆）。OCC：先取版本再删。
    try {
      const legacy = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.settings, LEGACY_SETTING_DOCUMENT_ID)
      await tw.server.databases.deleteDocument(DATABASE_ID, COLLECTIONS.settings, legacy.id, parseVersion(legacy.version))
    } catch {
      // 不存在即目标状态。
    }
  } catch (e) {
    console.error('[settings-migrate] 迁移失败（下轮启动重试）:', e instanceof Error ? e.message : e)
  }
}

import type { Torchwood } from '@torchwood/sdk'
import { COLLECTION_DEFS, DATABASE_ID, STORAGE_BUCKET_NAME } from '#/lib/blog-schema'
import { getServerTorchwood } from './torchwood.server'
import { getUserGroups } from './groups.server'
import { migrateSiteSettingsToKV } from './site-settings.migrate.server'
import { seedIfEmpty } from './seed.server'

/**
 * 启动供给（幂等）：确保 database / collections / attributes / indexes 存在，
 * 可选灌种子。guarded singleton：首个服务端请求触发，并发共享同一 Promise；
 * 失败则清空缓存允许重试。
 *
 * 幂等策略：对每个 create 动作，失败后一律回读验证"是否已存在"——已存在视为
 * 成功（本后端版本对"已存在"可能返回 409/AlreadyExists，也可能因 catalog
 * 唯一键冲突逃逸为 500 Unknown；不能只按错误码分支）。
 */

let ensurePromise: Promise<void> | null = null
let cachedBucketId: string | null = null

export function ensureBlogReady(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = provision().catch((e: unknown) => {
      ensurePromise = null
      throw e
    })
  }
  return ensurePromise
}

/** 附件桶 ID（服务端生成；ensureBlogReady 之后可用）。 */
export function getBlogBucketId(): string {
  if (!cachedBucketId) throw new Error('附件桶尚未供给')
  return cachedBucketId
}

async function provision(): Promise<void> {
  const tw = getServerTorchwood()
  await createOrVerify(
    () => tw.server.databases.createDatabase({ id: DATABASE_ID, name: 'Torchwood Blog' }),
    async () => {
      await tw.server.databases.getDatabase(DATABASE_ID)
      return true
    },
  )
  for (const def of COLLECTION_DEFS) {
    await createOrVerify(
      () =>
        tw.server.databases.createCollection(DATABASE_ID, {
          id: def.id,
          name: def.name,
          permissions: [...def.permissions],
          // 必须显式声明：服务端对 document_security 缺省为 true。
          document_security: def.documentSecurity,
        }),
      async () => {
        await tw.server.databases.getCollection(DATABASE_ID, def.id)
        return true
      },
    )
  }
  for (const def of COLLECTION_DEFS) {
    await ensureAttributes(tw, def.id, def.attributes)
    await ensureIndexes(tw, def.id, def.indexes)
  }
  await ensureStorageBucket(tw)
  // 用户组（管理员/作者/读者）：项目级资源、与库无关，但随启动供给一并幂等建立，
  // 保证首次部署后第一个注册用户就能被归入管理员组。
  await getUserGroups(tw)
  // 站点配置"列式单例 → KV"迁移（幂等；须在 ensureAttributes 之后——KV 列已就绪）。
  await migrateSiteSettingsToKV(tw)
  if (seedEnabled()) {
    await seedIfEmpty(tw)
  }
}

/**
 * 附件桶（公开读）：按名幂等创建——bucket id 由服务端生成，解析后缓存。
 * 若同名桶存在但不是 public（公开桶 = 匿名 `?project=` 可读），补一次 update。
 */
async function ensureStorageBucket(tw: Torchwood): Promise<void> {
  if (cachedBucketId) return
  const buckets = await tw.server.storage.listBuckets()
  const existing = buckets.find((b) => b.name === STORAGE_BUCKET_NAME)
  if (existing) {
    cachedBucketId = existing.id
    if (existing.public !== true) {
      await tw.server.storage.updateBucket(existing.id, { public: true })
    }
    return
  }
  const created = await tw.server.storage.createBucket({ name: STORAGE_BUCKET_NAME, public: true })
  cachedBucketId = created.id
}

function seedEnabled(): boolean {
  return (process.env['BLOG_SEED'] ?? '') === 'true'
}

/** 执行 create；失败时回读验证存在性——存在即成功，否则抛出原始错误。 */
async function createOrVerify(create: () => Promise<unknown>, verify: () => Promise<boolean>): Promise<void> {
  try {
    await create()
  } catch {
    let exists = false
    try {
      exists = await verify()
    } catch {
      exists = false
    }
    if (!exists) throw new Error('供给失败：创建动作出错且目标不存在（见服务端日志）')
  }
}

async function ensureAttributes(
  tw: Torchwood,
  collectionId: string,
  attributes: readonly { key: string; type: string; required?: boolean; array?: boolean }[],
): Promise<void> {
  const existing = await tw.server.databases.getCollection(DATABASE_ID, collectionId)
  // protojson 会省略空数组：新集合的 attributes 可能是 undefined。
  const present = new Set((existing.attributes ?? []).map((a) => a.key))
  for (const attr of attributes) {
    if (present.has(attr.key)) continue
    await createOrVerify(
      () =>
        tw.server.databases.createAttribute(DATABASE_ID, collectionId, {
          key: attr.key,
          type: attr.type,
          ...(attr.required ? { required: true } : {}),
          ...(attr.array ? { array: true } : {}),
        }),
      async () => {
        const coll = await tw.server.databases.getCollection(DATABASE_ID, collectionId)
        return (coll.attributes ?? []).some((a) => a.key === attr.key)
      },
    )
  }
}

async function ensureIndexes(
  tw: Torchwood,
  collectionId: string,
  indexes: readonly { id: string; type: string; attributes: string[] }[],
): Promise<void> {
  const existing = await tw.server.databases.getCollection(DATABASE_ID, collectionId)
  const present = new Set((existing.indexes ?? []).map((i) => i.id))
  for (const index of indexes) {
    if (present.has(index.id)) continue
    await createOrVerify(
      () =>
        tw.server.databases.createIndex(DATABASE_ID, collectionId, {
          id: index.id,
          type: index.type,
          attributes: [...index.attributes],
        }),
      async () => {
        const coll = await tw.server.databases.getCollection(DATABASE_ID, collectionId)
        return (coll.indexes ?? []).some((i) => i.id === index.id)
      },
    )
  }
}

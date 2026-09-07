import { createServerFn } from '@tanstack/react-start'
import { COLLECTIONS, DATABASE_ID } from '#/lib/blog-schema'
import { parseVersion } from '#/lib/types'
import { getServerTorchwood } from './torchwood.server'
import { ensureBlogReady } from './provision.server'

/**
 * 管理面的 Server 面动作（作者台通过 server function 调用）：
 * - 新建分类（categories 只允许 API Key 写）；
 * - 删除分类——**引用完整性删除协议**；
 * - 删除文章前的评论级联清理。
 *
 * 返回判别联合而不是抛错：错误语义（如"分类仍被引用"）是正常业务分支，
 * 需要结构化数据（count）驱动 UI。
 */

export interface CategoryInUse {
  ok: false
  reason: 'IN_USE'
  /** 服务端可见（已发布）且仍引用该分类的文章数。 */
  count: number
}

export interface CategoryDeleted {
  ok: true
  deleted: true
}

export type DeleteCategoryResult = CategoryDeleted | CategoryInUse | { ok: false; reason: 'NOT_FOUND' } | { ok: false; reason: 'ERROR'; message: string }

export const createCategory = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { name?: unknown; slug?: unknown }
    return {
      name: typeof raw.name === 'string' ? raw.name.trim() : '',
      slug: typeof raw.slug === 'string' ? raw.slug.trim() : '',
    }
  })
  .handler(async ({ data }): Promise<{ ok: true; id: string } | { ok: false; message: string }> => {
    if (!data.name || !data.slug) return { ok: false, message: '分类名和 slug 都不能为空。' }
    await ensureBlogReady()
    const tw = getServerTorchwood()
    const id = `cat-${data.slug}`
    await tw.server.databases.createDocument(DATABASE_ID, COLLECTIONS.categories, {
      document_id: id,
      data: { name: data.name, slug: data.slug },
    })
    return { ok: true, id }
  })

export const deleteCategory = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { categoryId?: unknown }
    return { categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : '' }
  })
  .handler(async ({ data }): Promise<DeleteCategoryResult> => {
    if (!data.categoryId) return { ok: false, reason: 'NOT_FOUND' }
    await ensureBlogReady()
    const tw = getServerTorchwood()

    // 删除协议第 1 步：计数检查（Server 面可见 = 已发布的文章）。
    const referenced = await tw.server.databases.countDocuments(DATABASE_ID, COLLECTIONS.posts, {
      query: { filter: { eq: { attribute: 'category_id', values: [data.categoryId] } } },
    })
    const count = typeof referenced === 'string' ? Number.parseInt(referenced, 10) : referenced
    if (Number.isFinite(count) && count > 0) {
      // 协议的"拒绝删除"分支：先处置子文档（作者在编辑器里迁移自己的文章），
      // 服务端绝不留下悬空引用而无提示地删掉父文档。
      return { ok: false, reason: 'IN_USE', count }
    }

    // 第 2 步（无可见引用，无需迁移/级联）→ 第 3 步：带 OCC 版本删除父文档。
    try {
      const doc = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.categories, data.categoryId)
      await tw.server.databases.deleteDocument(DATABASE_ID, COLLECTIONS.categories, doc.id, parseVersion(doc.version))
      return { ok: true, deleted: true }
    } catch (e) {
      return { ok: false, reason: 'ERROR', message: e instanceof Error ? e.message : String(e) }
    }
  })

export const cleanupCommentsForPost = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { postId?: unknown }
    return { postId: typeof raw.postId === 'string' ? raw.postId : '' }
  })
  .handler(async ({ data }): Promise<{ ok: true; affected: number } | { ok: false; message: string }> => {
    if (!data.postId) return { ok: false, message: 'postId 不能为空。' }
    await ensureBlogReady()
    const tw = getServerTorchwood()
    const comments = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.comments, {
      query: { filter: { eq: { attribute: 'post_id', values: [data.postId] } }, pageSize: 200 },
    })
    if (comments.documents.length === 0) return { ok: true, affected: 0 }
    // 批量级联删除（整批单事务）：删除文章前先清空其评论（1:N 的删除协议）。
    const result = await tw.server.databases.bulkDeleteDocuments(
      DATABASE_ID,
      COLLECTIONS.comments,
      comments.documents.map((doc) => doc.id),
    )
    const affected = typeof result.affected === 'string' ? Number.parseInt(result.affected, 10) : result.affected
    return { ok: true, affected: Number.isFinite(affected) ? affected : comments.documents.length }
  })

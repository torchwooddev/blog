import type { Document, UpdateDocumentInput } from '@torchwood/sdk'
import { COLLECTIONS, DATABASE_ID } from './blog-schema'
import { isVersionConflict, withOccRetry } from './errors'
import { runIdempotent } from './idempotency'
import { parsePost, parseVersion, permissionsIncludeOwner, type Post } from './types'
import { ensureFreshAccessToken, tw } from './torchwood-client'

/**
 * 作者台的写路径：全部是浏览器直连 Torchwood Client 面（终端用户 JWT）。
 * - 创建即私有（服务端空 ACE 种子绑 user:<创建者>）；
 * - 发布/撤回 = 一次原子 update（写 published_at + 调整文档 ACE）；
 * - 所有更新/删除强制 OCC version，冲突时重读重试一次；
 * - 写请求携带 Idempotency-Key（request_id 幂等）。
 */

/** 我的文章（含草稿）：文档 ACE 回读里含 user:<id> 即属主——权限回读的妙用。 */
export async function fetchMyPosts(userId: string): Promise<Post[]> {
  await ensureFreshAccessToken()
  const result = await tw.databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, {
    query: {
      orders: [{ attribute: '_updated_at', desc: true }],
      pageSize: 100,
    },
  })
  return result.documents
    .map(parsePost)
    .filter((post) => permissionsIncludeOwner(post.permissions, userId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export interface DraftInput {
  title: string
  slug: string
  content: string
  categoryId: string
  tagIds: string[]
}

/** 创建草稿：不带 published_at；权限缺省 → 服务端空 ACE 种子 = 仅创建者可见。 */
export async function createDraft(input: DraftInput): Promise<Post> {
  await ensureFreshAccessToken()
  const doc = await runIdempotent(() =>
    tw.databases.createDocument(DATABASE_ID, COLLECTIONS.posts, {
      // 客户端自选 document_id：网络层重试时天然幂等（同 id 不会产生第二篇）。
      document_id: newPostId(),
      data: {
        title: input.title,
        slug: input.slug,
        content: input.content,
        category_id: input.categoryId,
        tag_ids: [...input.tagIds],
      },
    }),
  )
  return parsePost(doc)
}

function newPostId(): string {
  return `post-${crypto.randomUUID()}`
}

/** 编辑器保存：OCC version + 冲突重读重试一次。 */
export async function updatePostContent(
  post: Post,
  input: DraftInput,
): Promise<Post> {
  await ensureFreshAccessToken()
  const data: Record<string, unknown> = {
    title: input.title,
    slug: input.slug,
    content: input.content,
    category_id: input.categoryId,
  }
  return withOccRetry(
    (version) =>
      tw.databases
        .updateDocument(DATABASE_ID, COLLECTIONS.posts, post.id, {
          data,
          version,
        })
        .then(parsePost),
    async () => {
      const fresh = await tw.databases.getDocument(DATABASE_ID, COLLECTIONS.posts, post.id)
      return parseVersion(fresh.version)
    },
    post.version,
  ).then(async (updated) => {
    // 标签增量用 arrayUpdates 原子算子（APPEND/REMOVE）演示——与 data 通道
    // 的整列替换不同，它不改写整列、与 OCC 兼容（见 applyTagDiff）。
    if (hasTagDiff(post.tagIds, input.tagIds)) {
      return applyTagDiff(updated, input.tagIds)
    }
    return updated
  })
}

function hasTagDiff(current: string[], next: string[]): boolean {
  if (current.length !== next.length) return true
  const set = new Set(current)
  return next.some((id) => !set.has(id))
}

/**
 * 标签增删（原子 array updates）。
 * 说明：SDK 0.2.0 的 UpdateDocumentInput 尚未声明 arrayUpdates 字段，但 wire
 * 协议（UpdateDocumentRequest.array_updates，protojson 双命名）支持——在 SDK
 * 类型缺口处用显式接口收窄，而不是 any。
 */
export interface ArrayUpdateSpec {
  op:
    | 'ARRAY_UPDATE_OP_APPEND'
    | 'ARRAY_UPDATE_OP_PREPEND'
    | 'ARRAY_UPDATE_OP_REMOVE'
    | 'ARRAY_UPDATE_OP_UNIQUE'
    | 'ARRAY_UPDATE_OP_INTERSECT'
    | 'ARRAY_UPDATE_OP_DIFF'
    | 'ARRAY_UPDATE_OP_INSERT'
    | 'ARRAY_UPDATE_OP_FILTER'
  values?: string[]
}

export type UpdateInputWithArrayUpdates = UpdateDocumentInput & {
  arrayUpdates?: Record<string, ArrayUpdateSpec>
}

export async function applyTagDiff(post: Post, nextTagIds: string[]): Promise<Post> {
  await ensureFreshAccessToken()
  const current = new Set(post.tagIds)
  const next = new Set(nextTagIds)
  const toAppend = nextTagIds.filter((id) => !current.has(id))
  const toRemove = post.tagIds.filter((id) => !next.has(id))

  const arrayUpdates: Record<string, ArrayUpdateSpec> = {
    tag_ids: {
      op: 'ARRAY_UPDATE_OP_APPEND',
      ...(toAppend.length > 0 ? { values: toAppend } : {}),
    },
  }
  // APPEND 只增不减；REMOVE 按值删。两者不能同时下发同列（单语句 SET 冲突），
  // 因此分两次原子更新（各自带 OCC version）。
  const afterAppend = await withOccRetry(
    (version) =>
      tw.databases
        .updateDocument(DATABASE_ID, COLLECTIONS.posts, post.id, {
          arrayUpdates,
          version,
        } as UpdateInputWithArrayUpdates)
        .then(parsePost),
    async () => {
      const fresh = await tw.databases.getDocument(DATABASE_ID, COLLECTIONS.posts, post.id)
      return parseVersion(fresh.version)
    },
    post.version,
  )

  if (toRemove.length === 0) return afterAppend
  return withOccRetry(
    (version) =>
      tw.databases
        .updateDocument(DATABASE_ID, COLLECTIONS.posts, post.id, {
          arrayUpdates: { tag_ids: { op: 'ARRAY_UPDATE_OP_REMOVE', values: toRemove } },
          version,
        } as UpdateInputWithArrayUpdates)
        .then(parsePost),
    async () => {
      const fresh = await tw.databases.getDocument(DATABASE_ID, COLLECTIONS.posts, post.id)
      return parseVersion(fresh.version)
    },
    afterAppend.version,
  )
}

function ownAcl(userId: string): string[] {
  return [`read:user:${userId}`, `update:user:${userId}`, `delete:user:${userId}`]
}

/**
 * 发布 = 一个原子 update：写 published_at + 授予 read:any ACE（保留自己读写删）。
 * 普通用户不能授予写类 any，但 read:any 是集合级显式公开的合法通道。
 */
export async function publishPost(post: Post, userId: string): Promise<Post> {
  await ensureFreshAccessToken()
  return withOccRetry(
    (version) =>
      tw.databases
        .updateDocument(DATABASE_ID, COLLECTIONS.posts, post.id, {
          data: { published_at: new Date().toISOString() },
          permissions: ['read:any', ...ownAcl(userId)],
          version,
        })
        .then(parsePost),
    async () => {
      const fresh = await tw.databases.getDocument(DATABASE_ID, COLLECTIONS.posts, post.id)
      return parseVersion(fresh.version)
    },
    post.version,
  )
}

/** 撤回发布：清 published_at + 收回 read:any（回到创建者私有）。 */
export async function unpublishPost(post: Post, userId: string): Promise<Post> {
  await ensureFreshAccessToken()
  return withOccRetry(
    (version) =>
      tw.databases
        .updateDocument(DATABASE_ID, COLLECTIONS.posts, post.id, {
          data: { published_at: null },
          permissions: ownAcl(userId),
          version,
        })
        .then(parsePost),
    async () => {
      const fresh = await tw.databases.getDocument(DATABASE_ID, COLLECTIONS.posts, post.id)
      return parseVersion(fresh.version)
    },
    post.version,
  )
}

/** 删除文章（带 OCC version；冲突时重读重试一次；已不存在视为成功）。 */
export async function deletePost(post: Post): Promise<void> {
  await ensureFreshAccessToken()
  try {
    await tw.databases.deleteDocument(DATABASE_ID, COLLECTIONS.posts, post.id, post.version)
  } catch (e) {
    if (!isVersionConflict(e)) throw e
    // 版本冲突：重读最新版本重试一次；若文档已不存在（他人已删）则视为成功。
    let latest: number
    try {
      const fresh = await tw.databases.getDocument(DATABASE_ID, COLLECTIONS.posts, post.id)
      latest = parseVersion(fresh.version)
    } catch {
      return
    }
    try {
      await tw.databases.deleteDocument(DATABASE_ID, COLLECTIONS.posts, post.id, latest)
    } catch {
      return
    }
  }
}

/** 用 Client 面读取单篇（属主可见草稿）。 */
export async function fetchMyPost(postId: string): Promise<Post | null> {
  await ensureFreshAccessToken()
  try {
    const doc: Document = await tw.databases.getDocument(DATABASE_ID, COLLECTIONS.posts, postId)
    return parsePost(doc)
  } catch {
    return null
  }
}

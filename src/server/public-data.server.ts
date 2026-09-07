import type { Category, Comment, FileRef, Page, Post, Tag } from '#/lib/types'
import {
  parseCategory,
  parseComment,
  parsePage,
  parsePost,
  parseTag,
} from '#/lib/types'
import {
  adjacentNewerPostQuery,
  adjacentOlderPostQuery,
  getPostBySlugQuery,
  listCommentsQuery,
  listPublishedPostsByCategoryQuery,
  listPublishedPostsByTagQuery,
  listPublishedPostsQuery,
  searchPublishedPostsQuery,
} from '#/lib/queries'
import { COLLECTIONS, DATABASE_ID } from '#/lib/blog-schema'
import { getServerTorchwood } from './torchwood.server'
import { ensureBlogReady } from './provision.server'
import { resolveFileRefs } from './storage.server'

/**
 * 公开读路径：全部走 Server 面（API Key），供 loader 做 SSR / RSS / sitemap。
 * 权限语义：posts 开了文档级 ACL，Server 面只能读到"发布过"（持有 read:any ACE）
 * 的文章——草稿在这里天然不可见（404 防枚举）。
 */

export const PAGE_SIZE = 5

export async function fetchPublishedPosts(cursor?: string): Promise<Page<Post>> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const q = listPublishedPostsQuery(PAGE_SIZE, cursor)
  const result = await tw.server.databases.listDocuments(q.databaseId, q.collectionId, q.params)
  return parsePage(result, parsePost)
}

export async function fetchPublishedPostsByCategory(categoryId: string, cursor?: string): Promise<Page<Post>> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const q = listPublishedPostsByCategoryQuery(categoryId, PAGE_SIZE, cursor)
  const result = await tw.server.databases.listDocuments(q.databaseId, q.collectionId, q.params)
  return parsePage(result, parsePost)
}

export async function fetchPublishedPostsByTag(tagId: string, cursor?: string): Promise<Page<Post>> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const q = listPublishedPostsByTagQuery(tagId, PAGE_SIZE, cursor)
  const result = await tw.server.databases.listDocuments(q.databaseId, q.collectionId, q.params)
  return parsePage(result, parsePost)
}

/** 空查询串直接返回空页，不打到数据库。 */
export async function fetchSearchPosts(term: string, cursor?: string): Promise<Page<Post>> {
  const trimmed = term.trim()
  if (!trimmed) return { items: [], nextCursor: null }
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const q = searchPublishedPostsQuery(trimmed, PAGE_SIZE, cursor)
  const result = await tw.server.databases.listDocuments(q.databaseId, q.collectionId, q.params)
  return parsePage(result, parsePost)
}

/** 相邻文章导航：先解析当前文章拿到 published_at，再各取相邻一篇。 */
export interface PostNeighbors {
  newer: { slug: string; title: string } | null
  older: { slug: string; title: string } | null
}

export async function fetchAdjacentPosts(slug: string): Promise<PostNeighbors> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const q = getPostBySlugQuery(slug)
  const found = await tw.server.databases.listDocuments(q.databaseId, q.collectionId, q.params)
  const doc = found.documents[0]
  if (!doc) return { newer: null, older: null }
  const post = parsePost(doc)
  if (!post.publishedAt) return { newer: null, older: null }

  const newerQ = adjacentNewerPostQuery(post.publishedAt)
  const olderQ = adjacentOlderPostQuery(post.publishedAt)
  const [newerResult, olderResult] = await Promise.all([
    tw.server.databases.listDocuments(newerQ.databaseId, newerQ.collectionId, newerQ.params),
    tw.server.databases.listDocuments(olderQ.databaseId, olderQ.collectionId, olderQ.params),
  ])
  const toRef = (target: typeof newerResult.documents[number] | undefined) =>
    target ? { slug: parsePost(target).slug, title: parsePost(target).title } : null
  return {
    newer: toRef(newerResult.documents[0]),
    older: toRef(olderResult.documents[0]),
  }
}

/** 归档条目：全量已发布文章的最小展示面（title/slug/publishedAt/category_id）。 */
export interface ArchiveEntry {
  slug: string
  title: string
  publishedAt: string
  categoryId: string
}

export async function fetchArchive(): Promise<ArchiveEntry[]> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const entries: ArchiveEntry[] = []
  let cursor: string | undefined
  do {
    const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, {
      query: {
        filter: { isNotNull: { attribute: 'published_at' } },
        orders: [{ attribute: 'published_at', desc: true }],
        select: ['title', 'slug', 'published_at', 'category_id'],
        pageSize: 100,
        ...(cursor ? { pageToken: cursor } : {}),
      },
    })
    for (const doc of result.documents) {
      const post = parsePost(doc)
      if (post.publishedAt) {
        entries.push({
          slug: post.slug,
          title: post.title,
          publishedAt: post.publishedAt,
          categoryId: post.categoryId,
        })
      }
    }
    cursor = result.meta?.next_page_token || undefined
  } while (cursor)
  return entries
}

export interface PostDetail {
  post: Post
  category: Category | null
  tags: Tag[]
  comments: Comment[]
  /** 附件（已解析为展示视图；已删除的文件自动剔除）。 */
  attachments: FileRef[]
}

/** slug → id 两段式解析：先按 slug 点查文章，再解析其分类与标签引用。 */
export async function fetchPostDetail(slug: string): Promise<PostDetail | null> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const q = getPostBySlugQuery(slug)
  const found = await tw.server.databases.listDocuments(q.databaseId, q.collectionId, q.params)
  const doc = found.documents[0]
  if (!doc) return null
  const post = parsePost(doc)

  const [category, tags, comments, attachments] = await Promise.all([
    fetchCategoryById(post.categoryId),
    fetchTagsByIds(post.tagIds),
    fetchComments(post.id),
    resolveFileRefs(post.attachmentIds),
  ])
  return { post, category, tags, comments, attachments }
}

export async function fetchCategoryById(id: string): Promise<Category | null> {
  const tw = getServerTorchwood()
  try {
    const doc = await tw.server.databases.getDocument(DATABASE_ID, COLLECTIONS.categories, id)
    return parseCategory(doc)
  } catch {
    // 分类被删或不可见：文章仍可展示，只是分类缺失（1:N 无外键的边界）。
    return null
  }
}

export async function fetchCategoryBySlug(slug: string): Promise<Category | null> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.categories, {
    query: { filter: { eq: { attribute: 'slug', values: [slug] } }, pageSize: 1 },
  })
  const doc = result.documents[0]
  return doc ? parseCategory(doc) : null
}

export async function fetchTagBySlug(slug: string): Promise<Tag | null> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.tags, {
    query: { filter: { eq: { attribute: 'slug', values: [slug] } }, pageSize: 1 },
  })
  const doc = result.documents[0]
  return doc ? parseTag(doc) : null
}

export async function fetchTagsByIds(ids: string[]): Promise<Tag[]> {
  if (ids.length === 0) return []
  const tw = getServerTorchwood()
  const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.tags, {
    query: { filter: { in: { attribute: '$id', values: ids } }, pageSize: 100 },
  })
  const byId = new Map(result.documents.map((doc) => [doc.id, parseTag(doc)]))
  return ids.flatMap((id) => {
    const tag = byId.get(id)
    return tag ? [tag] : []
  })
}

export async function fetchAllCategories(): Promise<Category[]> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.categories, {
    query: { orders: [{ attribute: 'slug', desc: false }], pageSize: 100 },
  })
  return result.documents.map(parseCategory)
}

export async function fetchAllTags(): Promise<Tag[]> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.tags, {
    query: { orders: [{ attribute: 'slug', desc: false }], pageSize: 100 },
  })
  return result.documents.map(parseTag)
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const tw = getServerTorchwood()
  const q = listCommentsQuery(postId)
  const result = await tw.server.databases.listDocuments(q.databaseId, q.collectionId, q.params)
  return result.documents.map(parseComment)
}

export interface SitemapEntry {
  slug: string
  updatedAt: string
}

export async function fetchAllPublishedSlugs(): Promise<SitemapEntry[]> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const entries: SitemapEntry[] = []
  let cursor: string | undefined
  do {
    const result = await tw.server.databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, {
      query: {
        filter: { isNotNull: { attribute: 'published_at' } },
        orders: [{ attribute: 'published_at', desc: true }],
        pageSize: 100,
        ...(cursor ? { pageToken: cursor } : {}),
      },
    })
    for (const doc of result.documents) {
      const post = parsePost(doc)
      entries.push({ slug: post.slug, updatedAt: post.updatedAt })
    }
    cursor = result.meta?.next_page_token || undefined
  } while (cursor)
  return entries
}

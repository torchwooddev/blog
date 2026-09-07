import { createServerFn } from '@tanstack/react-start'
import * as pub from './public-data.server'

/**
 * 公开读路径的 server functions（Server 面 API Key 在 *.server.ts 里）。
 * loader 内调用即获得 SSR + SEO；浏览器侧通过 TanStack Query 消费同一批函数。
 */

export const getPublishedPosts = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { cursor?: unknown }
    return { cursor: typeof raw.cursor === 'string' && raw.cursor !== '' ? raw.cursor : undefined }
  })
  .handler(async ({ data }) => pub.fetchPublishedPosts(data.cursor))

export const getPublishedPostsByCategory = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { categoryId?: unknown; cursor?: unknown }
    return {
      categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : '',
      cursor: typeof raw.cursor === 'string' && raw.cursor !== '' ? raw.cursor : undefined,
    }
  })
  .handler(async ({ data }) => {
    if (!data.categoryId) return { items: [], nextCursor: null }
    return pub.fetchPublishedPostsByCategory(data.categoryId, data.cursor)
  })

export const getPublishedPostsByTag = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { tagId?: unknown; cursor?: unknown }
    return {
      tagId: typeof raw.tagId === 'string' ? raw.tagId : '',
      cursor: typeof raw.cursor === 'string' && raw.cursor !== '' ? raw.cursor : undefined,
    }
  })
  .handler(async ({ data }) => {
    if (!data.tagId) return { items: [], nextCursor: null }
    return pub.fetchPublishedPostsByTag(data.tagId, data.cursor)
  })

export const getPostDetail = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { slug?: unknown }
    return { slug: typeof raw.slug === 'string' ? raw.slug : '' }
  })
  .handler(async ({ data }) => {
    if (!data.slug) return null
    return pub.fetchPostDetail(data.slug)
  })

export const getCategoryBySlug = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { slug?: unknown }
    return { slug: typeof raw.slug === 'string' ? raw.slug : '' }
  })
  .handler(async ({ data }) => {
    if (!data.slug) return null
    return pub.fetchCategoryBySlug(data.slug)
  })

export const getTagBySlug = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { slug?: unknown }
    return { slug: typeof raw.slug === 'string' ? raw.slug : '' }
  })
  .handler(async ({ data }) => {
    if (!data.slug) return null
    return pub.fetchTagBySlug(data.slug)
  })

export const getAllCategories = createServerFn({ method: 'GET' }).handler(() => pub.fetchAllCategories())

export const getAllTags = createServerFn({ method: 'GET' }).handler(() => pub.fetchAllTags())

export const getComments = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { postId?: unknown }
    return { postId: typeof raw.postId === 'string' ? raw.postId : '' }
  })
  .handler(async ({ data }) => {
    if (!data.postId) return []
    return pub.fetchComments(data.postId)
  })

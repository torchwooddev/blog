import { queryOptions } from '@tanstack/react-query'
import {
  getAllCategories,
  getAllTags,
  getComments,
  getPostDetail,
  getPublishedPosts,
  getPublishedPostsByCategory,
  getPublishedPostsByTag,
} from '#/server/public-data.functions'

/**
 * TanStack Query 选项：loader 里 ensureQueryData（SSR 首屏），
 * 组件里 useQuery（hydration 后接管），两端共享同一份缓存。
 */

export const publishedPostsOptions = (cursor?: string) =>
  queryOptions({
    queryKey: ['posts', 'published', cursor ?? ''],
    queryFn: () => getPublishedPosts({ data: { cursor } }),
  })

export const categoryPostsOptions = (categoryId: string, cursor?: string) =>
  queryOptions({
    queryKey: ['posts', 'category', categoryId, cursor ?? ''],
    queryFn: () => getPublishedPostsByCategory({ data: { categoryId, cursor } }),
  })

export const tagPostsOptions = (tagId: string, cursor?: string) =>
  queryOptions({
    queryKey: ['posts', 'tag', tagId, cursor ?? ''],
    queryFn: () => getPublishedPostsByTag({ data: { tagId, cursor } }),
  })

export const postDetailOptions = (slug: string) =>
  queryOptions({
    queryKey: ['posts', 'detail', slug],
    queryFn: () => getPostDetail({ data: { slug } }),
  })

export const categoriesOptions = () =>
  queryOptions({
    queryKey: ['categories'],
    queryFn: () => getAllCategories(),
  })

export const tagsOptions = () =>
  queryOptions({
    queryKey: ['tags'],
    queryFn: () => getAllTags(),
  })

export const commentsOptions = (postId: string) =>
  queryOptions({
    queryKey: ['comments', postId],
    queryFn: () => getComments({ data: { postId } }),
  })

import { and, containsAny, eq, isNotNull, orderDesc } from '@torchwood/sdk'
import { COLLECTIONS, DATABASE_ID } from './blog-schema'

/**
 * 纯 AST 查询构造器（C7：过滤唯一载体是 typed AST；不含任何 I/O，双面共用）。
 * 查询纪律：数组成员判断只用 containsAny/containsAll；排序键必须是本集合属性；
 * 分页只认 pageToken（keyset），无 offset。
 */

/** 公开文章 = published_at 非空（文档级 ACL 已把草稿挡在读路径之外）。 */
export function publishedPostsFilter() {
  return isNotNull('published_at')
}

export function listPublishedPostsQuery(pageSize: number, pageToken?: string) {
  return {
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.posts,
    params: {
      query: {
        filter: publishedPostsFilter(),
        orders: [orderDesc('published_at')],
        pageSize,
        pageToken,
      },
    },
  }
}

export function listPublishedPostsByCategoryQuery(categoryId: string, pageSize: number, pageToken?: string) {
  return {
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.posts,
    params: {
      query: {
        filter: and(publishedPostsFilter(), eq('category_id', categoryId)),
        orders: [orderDesc('published_at')],
        pageSize,
        pageToken,
      },
    },
  }
}

export function listPublishedPostsByTagQuery(tagId: string, pageSize: number, pageToken?: string) {
  return {
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.posts,
    params: {
      query: {
        // M:N 数组成员判断：containsAny（交集非空）——contains 是 ILIKE 模糊匹配，禁止用于数组。
        filter: and(publishedPostsFilter(), containsAny('tag_ids', [tagId])),
        orders: [orderDesc('published_at')],
        pageSize,
        pageToken,
      },
    },
  }
}

export function getPostBySlugQuery(slug: string) {
  return {
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.posts,
    params: {
      query: { filter: eq('slug', slug), pageSize: 1 },
    },
  }
}

export function listCommentsQuery(postId: string, pageSize = 200) {
  return {
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.comments,
    params: {
      query: {
        filter: eq('post_id', postId),
        orders: [{ attribute: '_created_at', desc: false }],
        pageSize,
      },
    },
  }
}

/** realtime 评论频道（服务端频道命名见 events.Envelope.CollectionChannel）。 */
export function commentsChannel(databaseId = DATABASE_ID): string {
  return `databases.${databaseId}.collections.${COLLECTIONS.comments}`
}

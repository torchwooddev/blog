import { Link } from '@tanstack/react-router'
import { formatDate } from '#/lib/format'
import { readingMinutes } from '#/lib/post-utils'
import { excerpt } from '#/lib/types'
import type { Category, Post, Tag } from '#/lib/types'
import { cn } from 'cn'

/**
 * 文章列表条目（Ghost 编辑风）：居中单栏里的纯排版条目——
 * 无卡片框、发丝分隔线、标题悬停下划线动画。
 */
export function PostCard({
  post,
  category,
  tags,
  featured = false,
}: {
  post: Post
  category?: Category | null
  tags?: Tag[]
  featured?: boolean
}) {
  const minutes = readingMinutes(post.content)
  return (
    <article className="group">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        {post.publishedAt ? (
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-xs">草稿</span>
        )}
        {category ? (
          <>
            <span aria-hidden>·</span>
            <Link
              to="/categories/$slug"
              params={{ slug: category.slug }}
              className="link-underline font-medium text-foreground/70 transition-colors hover:text-foreground"
            >
              {category.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden>·</span>
        <span>{minutes} 分钟</span>
      </div>

      <h2
        className={cn(
          'mt-2 font-bold tracking-tight',
          featured ? 'text-[1.75rem] leading-tight sm:text-[1.9rem]' : 'text-[1.35rem] leading-snug',
        )}
      >
        <Link
          to="/posts/$slug"
          params={{ slug: post.slug }}
          className="link-underline transition-colors"
        >
          {post.title}
        </Link>
      </h2>

      <p
        className={cn(
          'mt-2 leading-relaxed text-muted-foreground',
          featured ? 'line-clamp-3 text-[15.5px]' : 'line-clamp-2 text-[15px]',
        )}
      >
        {excerpt(post.content, featured ? 170 : 110)}
      </p>

      {tags && tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              to="/tags/$slug"
              params={{ slug: tag.slug }}
              className="link-underline transition-colors hover:text-foreground"
            >
              #{tag.name}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  )
}

import { Link } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { formatDate } from '#/lib/format'
import { readingMinutes } from '#/lib/post-utils'
import { excerpt } from '#/lib/types'
import type { Category, Post, Tag } from '#/lib/types'

/**
 * 文章列表条目（编辑风格：标题驱动、分隔线分栏，不用卡片框）。
 * featured = 列表头条：更大的标题与更长的摘要。
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
    <article className="group space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {post.publishedAt ? (
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        ) : (
          <Badge variant="secondary">草稿</Badge>
        )}
        {category ? (
          <>
            <span aria-hidden>/</span>
            <Link
              to="/categories/$slug"
              params={{ slug: category.slug }}
              className="font-medium text-primary transition-colors hover:underline"
            >
              {category.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden>/</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {minutes} 分钟
        </span>
      </div>

      <h2 className={featured ? 'text-2xl font-bold tracking-tight sm:text-[1.7rem]' : 'text-xl font-bold tracking-tight'}>
        <Link
          to="/posts/$slug"
          params={{ slug: post.slug }}
          className="transition-colors group-hover:text-primary"
        >
          {post.title}
        </Link>
      </h2>

      <p className={`leading-relaxed text-muted-foreground ${featured ? 'line-clamp-3 text-[15px]' : 'line-clamp-2 text-sm'}`}>
        {excerpt(post.content, featured ? 180 : 120)}
      </p>

      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {tags.map((tag) => (
            <Link key={tag.id} to="/tags/$slug" params={{ slug: tag.slug }}>
              <Badge
                variant="outline"
                className="font-normal text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                #{tag.name}
              </Badge>
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  )
}

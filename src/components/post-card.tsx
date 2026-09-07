import { Link } from '@tanstack/react-router'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '#/components/ui/card'
import { formatDate } from '#/lib/format'
import { excerpt } from '#/lib/types'
import type { Category, Post, Tag } from '#/lib/types'

export function PostCard({ post, category, tags }: { post: Post; category?: Category | null; tags?: Tag[] }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {post.publishedAt ? (
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          ) : (
            <Badge variant="secondary">草稿</Badge>
          )}
          {category ? (
            <Link
              to="/categories/$slug"
              params={{ slug: category.slug }}
              className="text-primary hover:underline"
            >
              {category.name}
            </Link>
          ) : null}
        </div>
        <CardTitle className="text-xl leading-snug">
          <Link
            to="/posts/$slug"
            params={{ slug: post.slug }}
            className="underline-offset-4 hover:underline"
          >
            {post.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {excerpt(post.content)}
      </CardContent>
      {tags && tags.length > 0 ? (
        <CardFooter className="flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Link key={tag.id} to="/tags/$slug" params={{ slug: tag.slug }}>
              <Badge variant="outline" className="hover:bg-accent">
                #{tag.name}
              </Badge>
            </Link>
          ))}
        </CardFooter>
      ) : null}
    </Card>
  )
}

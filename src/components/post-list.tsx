import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { PostCard } from '#/components/post-card'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Skeleton } from '#/components/ui/skeleton'
import { categoriesOptions, tagsOptions } from '#/lib/query-options'
import type { Page, Post, Tag } from '#/lib/types'

/**
 * 文章列表的共享渲染：SSR 首屏 + keyset 分页（next_page_token）。
 * placeholderData=keepPreviousData：翻页时保留上一页内容，避免闪烁。
 */
export function PostList({
  page,
  buildPageHref,
}: {
  page: Page<Post> | undefined
  buildPageHref: (cursor?: string) => {
    to: string
    search: Record<string, string | undefined>
    params?: Record<string, string>
  }
}) {
  const categories = useQuery({ ...categoriesOptions(), placeholderData: keepPreviousData })
  const tags = useQuery({ ...tagsOptions(), placeholderData: keepPreviousData })
  const tagsMap = useMemo(
    () => new Map<string, Tag>((tags.data ?? []).map((t) => [t.id, t])),
    [tags.data],
  )

  if (!page) return <LoadingList />
  if (page.items.length === 0) {
    return <div className="py-16 text-center text-muted-foreground">还没有已发布的文章。</div>
  }
  const next = page.nextCursor
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {page.items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            category={(categories.data ?? []).find((c) => c.id === post.categoryId)}
            tags={post.tagIds.flatMap((id) => {
              const tag = tagsMap.get(id)
              return tag ? [tag] : []
            })}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link {...buildPageHref(undefined)}>
            <ArrowLeft className="size-4" />
            第一页
          </Link>
        </Button>
        {next ? (
          <Button asChild variant="outline" size="sm">
            <Link {...buildPageHref(next)}>
              下一页
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">已到最后一页</span>
        )}
      </div>
    </div>
  )
}

export function LoadingList() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function DataLoaderError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <Alert variant="destructive">
      <AlertTitle>内容加载失败</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** 分类 / 标签侧栏（公开集合，任何人可读）。 */
export function TaxonomySidebar() {
  const categories = useQuery(categoriesOptions())
  const tags = useQuery(tagsOptions())
  return (
    <aside className="space-y-6 text-sm lg:sticky lg:top-20">
      <section>
        <h2 className="mb-2 font-medium text-muted-foreground">分类</h2>
        <ul className="space-y-1">
          {(categories.data ?? []).map((c) => (
            <li key={c.id}>
              <Link
                to="/categories/$slug"
                params={{ slug: c.slug }}
                className="text-foreground/80 hover:text-primary hover:underline"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-medium text-muted-foreground">标签</h2>
        <div className="flex flex-wrap gap-1.5">
          {(tags.data ?? []).map((t) => (
            <Link key={t.id} to="/tags/$slug" params={{ slug: t.slug }}>
              <Badge variant="outline" className="hover:bg-accent">
                #{t.name}
              </Badge>
            </Link>
          ))}
        </div>
      </section>
      <section className="space-y-1 text-muted-foreground">
        <h2 className="font-medium">订阅</h2>
        <a href="/feed.xml" className="block hover:text-primary hover:underline">
          RSS 订阅（/feed.xml）
        </a>
        <a href="/sitemap.xml" className="block hover:text-primary hover:underline">
          站点地图（/sitemap.xml）
        </a>
      </section>
    </aside>
  )
}

import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, FileText, Rss, Search } from 'lucide-react'
import { PostCard } from '#/components/post-card'
import { EmptyState } from '#/components/empty-state'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from 'cn'
import { categoriesOptions, tagsOptions } from '#/lib/query-options'
import type { Page, Post, Tag } from '#/lib/types'

/**
 * 文章列表的共享渲染：SSR 首屏 + keyset 分页（next_page_token）。
 * placeholderData=keepPreviousData：翻页时保留上一页内容，避免闪烁。
 */
export function PostList({
  page,
  buildPageHref,
  emptyAction,
  cursor,
}: {
  page: Page<Post> | undefined
  buildPageHref: (cursor?: string) => {
    to: string
    search: Record<string, string | undefined>
    params?: Record<string, string>
  }
  emptyAction?: React.ReactNode
  /** 当前页的 keyset 游标：非空表示不在第一页，左侧出现「回到最新」。 */
  cursor?: string
}) {
  const categories = useQuery({ ...categoriesOptions(), placeholderData: keepPreviousData })
  const tags = useQuery({ ...tagsOptions(), placeholderData: keepPreviousData })
  const tagsMap = useMemo(
    () => new Map<string, Tag>((tags.data ?? []).map((t) => [t.id, t])),
    [tags.data],
  )

  if (!page) return <LoadingList />
  if (page.items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="还没有已发布的文章"
        description="发布第一篇文章后，它会立刻出现在这里。"
        action={emptyAction}
      />
    )
  }
  const next = page.nextCursor
  return (
    <div className="space-y-8">
      <div className="divide-y">
        {page.items.map((post, index) => (
          <div key={post.id} className={index === 0 ? 'pb-8' : 'py-8'}>
            <PostCard
              post={post}
              featured={index === 0}
              category={(categories.data ?? []).find((c) => c.id === post.categoryId)}
              tags={post.tagIds.flatMap((id) => {
                const tag = tagsMap.get(id)
                return tag ? [tag] : []
              })}
            />
          </div>
        ))}
      </div>

      <nav className="flex items-center justify-between" aria-label="分页">
        {cursor ? (
          <Button asChild variant="outline" size="sm">
            <Link {...buildPageHref(undefined)}>
              <ArrowLeft className="size-4" />
              回到最新
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button asChild variant="outline" size="sm">
            <Link {...buildPageHref(next)}>
              更早的文章
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">没有更多了</span>
        )}
      </nav>
    </div>
  )
}

export function LoadingList() {
  return (
    <div className="space-y-8">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 border-b pb-8">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
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

/** 分类 / 标签侧栏（公开集合，任何人可读；当前项高亮）。 */
export function TaxonomySidebar({ currentCategorySlug }: { currentCategorySlug?: string }) {
  const categories = useQuery(categoriesOptions())
  const tags = useQuery(tagsOptions())
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside className="space-y-8 text-sm lg:sticky lg:top-24">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">分类</h2>
        <ul className="space-y-1">
          {(categories.data ?? []).map((c) => {
            const active = currentCategorySlug === c.slug || pathname === `/categories/${c.slug}`
            return (
              <li key={c.id}>
                <Link
                  to="/categories/$slug"
                  params={{ slug: c.slug }}
                  className={cn(
                    'block rounded-md px-2 py-1 transition-colors',
                    active
                      ? 'bg-accent font-medium text-primary'
                      : 'text-foreground/70 hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  {c.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">标签</h2>
        <div className="flex flex-wrap gap-1.5">
          {(tags.data ?? []).map((t) => {
            const active = pathname === `/tags/${t.slug}`
            return (
              <Link key={t.id} to="/tags/$slug" params={{ slug: t.slug }}>
                <Badge
                  variant="outline"
                  className={cn(
                    'font-normal transition-colors',
                    active
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:border-primary/40 hover:text-primary',
                  )}
                >
                  #{t.name}
                </Badge>
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">订阅</h2>
        <div className="space-y-1">
          <a
            href="/feed.xml"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <Rss className="size-3.5 text-primary" />
            RSS 订阅
          </a>
          <Link
            to="/search"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <Search className="size-3.5 text-primary" />
            搜索文章
          </Link>
        </div>
      </section>
    </aside>
  )
}

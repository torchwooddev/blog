import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, FileText } from 'lucide-react'
import { PostCard } from '#/components/post-card'
import { EmptyState } from '#/components/empty-state'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { categoriesOptions, tagsOptions } from '#/lib/query-options'
import type { Page, Post, Tag } from '#/lib/types'

/**
 * 文章列表的共享渲染（居中单栏）：SSR 首屏 + keyset 分页（next_page_token）。
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
    <div className="space-y-10">
      <div className="divide-y">
        {page.items.map((post) => (
          <div key={post.id} className="py-10 first:pt-0">
            <PostCard
              post={post}
              featured={false}
              category={(categories.data ?? []).find((c) => c.id === post.categoryId)}
              tags={post.tagIds.flatMap((id) => {
                const tag = tagsMap.get(id)
                return tag ? [tag] : []
              })}
            />
          </div>
        ))}
      </div>

      <nav className="flex items-center justify-between border-t pt-8" aria-label="分页">
        {cursor ? (
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link {...buildPageHref(undefined)}>回到最新</Link>
          </Button>
        ) : (
          <span className="text-[13px] text-muted-foreground">最新文章</span>
        )}
        {next ? (
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link {...buildPageHref(next)}>
              更早的文章
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <span className="text-[13px] text-muted-foreground">已经到底了</span>
        )}
      </nav>
    </div>
  )
}

export function LoadingList() {
  return (
    <div className="space-y-10">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 border-b pb-10">
          <Skeleton className="h-3 w-36" />
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

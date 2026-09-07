import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Search, SearchX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PostCard } from '#/components/post-card'
import { EmptyState } from '#/components/empty-state'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { publicConfig } from '#/lib/config'
import { categoriesOptions, searchPostsOptions, tagsOptions } from '#/lib/query-options'

type SearchParams = { q?: string; cursor?: string }

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search['q'] === 'string' && search['q'] !== '' ? search['q'] : undefined,
    cursor: typeof search['cursor'] === 'string' && search['cursor'] !== '' ? search['cursor'] : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q, cursor: search.cursor }),
  loader: ({ context, deps }) => {
    if (!deps.q) return null
    return Promise.all([
      context.queryClient.ensureQueryData(searchPostsOptions(deps.q, deps.cursor)),
      context.queryClient.ensureQueryData(categoriesOptions()),
      context.queryClient.ensureQueryData(tagsOptions()),
    ])
  },
  head: () => ({
    meta: [
      { title: `搜索 · ${publicConfig.siteName}` },
      { name: 'description', content: `按标题或正文搜索 ${publicConfig.siteName} 的全部已发布文章。` },
      { property: 'og:type', content: 'website' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SearchPage,
})

function SearchPage() {
  const navigate = useNavigate()
  const { q, cursor } = Route.useSearch()
  const [term, setTerm] = useState(q ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useQuery({ ...searchPostsOptions(q ?? '', cursor), placeholderData: keepPreviousData, enabled: !!q })
  const categories = useQuery({ ...categoriesOptions(), placeholderData: keepPreviousData })
  const tags = useQuery({ ...tagsOptions(), placeholderData: keepPreviousData })
  const tagMap = new Map((tags.data ?? []).map((t) => [t.id, t]))

  const submit = (value: string) => {
    const next = value.trim()
    void navigate({
      to: '/search',
      search: next ? { q: next } : {},
      replace: !next,
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search</p>
        <h1 className="text-3xl font-extrabold tracking-tight">搜索</h1>
      </header>

      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          submit(term)
        }}
        role="search"
      >
        <Search className="absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="按标题或正文搜索…"
          className="h-12 w-full rounded-xl border bg-background pl-11 pr-24 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
        />
        <Button type="submit" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2">
          搜索
        </Button>
      </form>

      {!q ? (
        <EmptyState
          icon={Search}
          title="输入关键词开始搜索"
          description="支持按文章标题与正文内容匹配。"
        />
      ) : results.isLoading ? (
        <div className="space-y-8">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3 border-b pb-8">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : (results.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`没有找到与「${q}」相关的文章`}
          description="换个更短的关键词试试，或浏览全部归档。"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/archive">浏览归档</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          <p className="text-sm text-muted-foreground">
            找到 {results.data?.items.length ?? 0} 篇与「{q}」相关的文章
          </p>
          <div className="divide-y">
            {(results.data?.items ?? []).map((post) => (
              <div key={post.id} className="py-8 first:pt-0">
                <PostCard
                  post={post}
                  featured={false}
                  category={(categories.data ?? []).find((c) => c.id === post.categoryId)}
                  tags={post.tagIds.flatMap((id) => {
                    const tag = tagMap.get(id)
                    return tag ? [tag] : []
                  })}
                />
              </div>
            ))}
          </div>
          {results.data?.nextCursor ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void navigate({ to: '/search', search: { q, cursor: results.data?.nextCursor ?? undefined } })}
              >
                更多结果
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

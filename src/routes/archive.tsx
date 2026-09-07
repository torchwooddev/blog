import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Archive as ArchiveIcon } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '#/components/empty-state'
import { LoadingList } from '#/components/post-list'
import { publicConfig } from '#/lib/config'
import { archiveOptions, categoriesOptions } from '#/lib/query-options'

export const Route = createFileRoute('/archive')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(archiveOptions()),
      context.queryClient.ensureQueryData(categoriesOptions()),
    ]),
  head: () => ({
    meta: [
      { title: `归档 · ${publicConfig.siteName}` },
      { name: 'description', content: `${publicConfig.siteName} 的全部文章，按年份归档。` },
      { property: 'og:type', content: 'website' },
    ],
    links: [{ rel: 'canonical', href: `${publicConfig.siteUrl}/archive` }],
  }),
  component: ArchivePage,
})

interface YearGroup {
  year: string
  items: { slug: string; title: string; monthDay: string; categoryName: string | null }[]
}

function ArchivePage() {
  const archive = useQuery(archiveOptions())
  const categories = useQuery(categoriesOptions())

  const groups = useMemo<YearGroup[]>(() => {
    const byCategory = new Map((categories.data ?? []).map((c) => [c.id, c.name]))
    const byYear = new Map<string, YearGroup>()
    for (const entry of archive.data ?? []) {
      const date = new Date(entry.publishedAt)
      if (Number.isNaN(date.getTime())) continue
      const year = String(date.getFullYear())
      const monthDay = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
      let group = byYear.get(year)
      if (!group) {
        group = { year, items: [] }
        byYear.set(year, group)
      }
      group.items.push({
        slug: entry.slug,
        title: entry.title,
        monthDay,
        categoryName: byCategory.get(entry.categoryId) ?? null,
      })
    }
    return [...byYear.values()]
  }, [archive.data, categories.data])

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-1 border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Archive</p>
        <h1 className="text-3xl font-extrabold tracking-tight">归档</h1>
        <p className="text-sm text-muted-foreground">
          共 {archive.data?.length ?? 0} 篇文章，按发布时间倒序。
        </p>
      </header>

      {archive.isLoading ? (
        <LoadingList />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={ArchiveIcon}
          title="还没有可归档的文章"
          description="发布第一篇文章后，这里会按年份整理全部内容。"
        />
      ) : (
        <div className="space-y-12">
          {groups.map((group) => (
            <section key={group.year} className="space-y-4">
              <h2 className="font-mono text-lg font-bold text-primary">{group.year}</h2>
              <ul className="space-y-3">
                {group.items.map((item) => (
                  <li key={item.slug} className="flex items-baseline gap-4 text-sm">
                    <time className="w-20 shrink-0 font-mono text-xs text-muted-foreground" dateTime={item.slug}>
                      {item.monthDay}
                    </time>
                    <Link
                      to="/posts/$slug"
                      params={{ slug: item.slug }}
                      className="min-w-0 flex-1 truncate font-medium transition-colors hover:text-primary"
                    >
                      {item.title}
                    </Link>
                    {item.categoryName ? (
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                        {item.categoryName}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

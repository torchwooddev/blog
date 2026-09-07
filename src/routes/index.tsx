import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Rss } from 'lucide-react'
import { DataLoaderError, PostList, TaxonomySidebar } from '#/components/post-list'
import { publicConfig } from '#/lib/config'
import { categoriesOptions, publishedPostsOptions, tagsOptions } from '#/lib/query-options'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { cursor?: string } => ({
    cursor: typeof search['cursor'] === 'string' && search['cursor'] !== '' ? search['cursor'] : undefined,
  }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: ({ context, deps }) => {
    // keyset 游标是服务端发放的不透明 token：手工伪造/过期的 cursor 会被拒绝，
    // 此时 302 回第一页（URL 归一化），而不是渲染错误页。
    const load = (cursor?: string) =>
      context.queryClient.ensureQueryData(publishedPostsOptions(cursor))
    return Promise.all([
      load(deps.cursor).catch((e: unknown) => {
        if (deps.cursor) throw redirect({ to: '/', search: {}, replace: true })
        throw e
      }),
      context.queryClient.ensureQueryData(categoriesOptions()),
      context.queryClient.ensureQueryData(tagsOptions()),
    ])
  },
  head: () => ({
    meta: [
      { title: publicConfig.siteName },
      { name: 'description', content: publicConfig.siteDescription },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: publicConfig.siteName },
      { property: 'og:description', content: publicConfig.siteDescription },
      { property: 'og:url', content: publicConfig.siteUrl },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: publicConfig.siteName,
          description: publicConfig.siteDescription,
          url: publicConfig.siteUrl,
        }),
      },
    ],
  }),
  component: HomePage,
})

function HomePage() {
  const { cursor } = Route.useSearch()
  const page = useQuery({ ...publishedPostsOptions(cursor), placeholderData: keepPreviousData })

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{publicConfig.siteName}</h1>
        <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
          {publicConfig.siteDescription}
        </p>
        <a
          href="/feed.xml"
          className="inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:underline"
        >
          <Rss className="size-3.5" />
          通过 RSS 订阅更新
        </a>
      </section>

      <div className="grid gap-12 lg:grid-cols-[1fr_220px]">
        <section className="space-y-6" aria-label="文章列表">
          {page.isError ? (
            <DataLoaderError error={page.error} />
          ) : (
            <PostList
              page={page.data}
              cursor={cursor}
              buildPageHref={(c) => ({ to: '/', search: { cursor: c } })}
            />
          )}
        </section>
        <TaxonomySidebar />
      </div>
    </div>
  )
}

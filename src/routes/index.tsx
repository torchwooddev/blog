import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Rss } from 'lucide-react'
import { DataLoaderError, PostList } from '#/components/post-list'
import { publicConfig } from '#/lib/config'
import { toSafeJsonLd } from '#/lib/jsonld'
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
        // 内容来自环境变量注入（非用户输入，风险低），但统一走安全序列化：
        // 配置值里出现 "</script>" 时同样会提前闭合脚本标签。
        children: toSafeJsonLd({
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
  const categories = useQuery(categoriesOptions())

  return (
    <div className="mx-auto w-full max-w-[44rem]">
      {/* 站点开篇（Ghost 式居中开篇） */}
      <section className="pb-14 pt-6 text-center sm:pt-10">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{publicConfig.siteName}</h1>
        <p className="mx-auto mt-4 max-w-md text-[17px] leading-8 text-muted-foreground">
          {publicConfig.siteDescription}
        </p>
        {(categories.data ?? []).length > 0 ? (
          <nav
            className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm"
            aria-label="分类"
          >
            {(categories.data ?? []).map((c) => (
              <Link
                key={c.id}
                to="/categories/$slug"
                params={{ slug: c.slug }}
                className="link-underline font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {c.name}
              </Link>
            ))}
            <a
              href="/feed.xml"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="RSS 订阅"
            >
              <Rss className="size-3.5" />
              RSS
            </a>
          </nav>
        ) : null}
      </section>

      <section aria-label="文章列表">
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
    </div>
  )
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
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
      { title: `${publicConfig.siteName} · 一个没有自建后端的博客` },
      {
        name: 'description',
        content: 'TanStack Start + Torchwood BaaS 的参考实现：SSR 内容站 + 浏览器直连的认证与写作。',
      },
      { property: 'og:site_name', content: publicConfig.siteName },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: HomePage,
})

function HomePage() {
  const { cursor } = Route.useSearch()
  const page = useQuery({ ...publishedPostsOptions(cursor), placeholderData: keepPreviousData })

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
      <section className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">最新文章</h1>
          <p className="text-sm text-muted-foreground">
            公开列表 = Server 面（API Key）读取 +{' '}
            <code className="rounded bg-muted px-1">isNotNull("published_at")</code>{' '}
            过滤；草稿因文档级 ACL 天然不可见。
          </p>
        </header>
        {page.isError ? (
          <DataLoaderError error={page.error} />
        ) : (
          <PostList page={page.data} buildPageHref={(c) => ({ to: '/', search: { cursor: c } })} />
        )}
      </section>
      <TaxonomySidebar />
    </div>
  )
}

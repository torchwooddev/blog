import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { DataLoaderError, PostList, TaxonomySidebar } from '#/components/post-list'
import { getCategoryBySlug } from '#/server/public-data.functions'
import { categoriesOptions, categoryPostsOptions, tagsOptions } from '#/lib/query-options'

/**
 * 分类过滤页：slug → id 两段式解析（先查分类拿 id，再 eq("category_id", id)），
 * 因为服务端没有跨集合 JOIN——解析结果通过 query 缓存复用。
 */
export const Route = createFileRoute('/categories/$slug')({
  validateSearch: (search: Record<string, unknown>): { cursor?: string } => ({
    cursor: typeof search['cursor'] === 'string' && search['cursor'] !== '' ? search['cursor'] : undefined,
  }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: async ({ context, params, deps }) => {
    const category = await context.queryClient.ensureQueryData({
      queryKey: ['categories', 'by-slug', params.slug],
      queryFn: () => getCategoryBySlug({ data: { slug: params.slug } }),
    })
    if (!category) throw notFound()
    const load = (cursor?: string) =>
      context.queryClient.ensureQueryData(categoryPostsOptions(category.id, cursor))
    await Promise.all([
      load(deps.cursor).catch((e: unknown) => {
        if (deps.cursor) throw redirect({ to: '/categories/$slug', params: { slug: params.slug }, search: {}, replace: true })
        throw e
      }),
      context.queryClient.ensureQueryData(categoriesOptions()),
      context.queryClient.ensureQueryData(tagsOptions()),
    ])
    return { category }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `分类：${loaderData.category.name}` : '分类' },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: CategoryPage,
})

function CategoryPage() {
  const { category } = Route.useLoaderData()
  const { cursor } = Route.useSearch()
  const page = useQuery({ ...categoryPostsOptions(category.id, cursor), placeholderData: keepPreviousData })

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
      <section className="space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">分类</p>
          <h1 className="text-2xl font-bold tracking-tight">{category.name}</h1>
          <p className="text-sm text-muted-foreground">
            slug <code className="rounded bg-muted px-1">{category.slug}</code> → 文档{' '}
            <code className="rounded bg-muted px-1">{category.id}</code>，两段式解析后按{' '}
            <code className="rounded bg-muted px-1">eq("category_id", …)</code> 过滤（1:N 引用属性 + key 索引）。
          </p>
        </header>
        {page.isError ? (
          <DataLoaderError error={page.error} />
        ) : (
          <PostList
            page={page.data}
            buildPageHref={(c) => ({
              to: '/categories/$slug',
              params: { slug: category.slug },
              search: { cursor: c },
            })}
          />
        )}
      </section>
      <TaxonomySidebar />
    </div>
  )
}

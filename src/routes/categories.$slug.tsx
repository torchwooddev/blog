import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { DataLoaderError, PostList } from '#/components/post-list'
import { getCategoryBySlug } from '#/server/public-data.functions'
import { categoriesOptions, categoryPostsOptions, tagsOptions } from '#/lib/query-options'
import { publicConfig } from '#/lib/config'

/**
 * 分类过滤页：slug → id 两段式解析（先查分类拿 id，再按引用属性过滤），
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
  head: ({ loaderData }) => {
    const name = loaderData ? loaderData.category.name : undefined
    return {
      meta: [
        { title: name ? `${name} 下的文章 · ${publicConfig.siteName}` : `分类 · ${publicConfig.siteName}` },
        ...(name
          ? [{ name: 'description', content: `${publicConfig.siteName} 中「${name}」分类下的全部文章。` }]
          : []),
        { property: 'og:type', content: 'website' },
        ...(name ? [{ property: 'og:title', content: `${name} 下的文章` }] : []),
      ],
      links: loaderData
        ? [{ rel: 'canonical', href: `${publicConfig.siteUrl}/categories/${loaderData.category.slug}` }]
        : [],
    }
  },
  component: CategoryPage,
})

function CategoryPage() {
  const { category } = Route.useLoaderData()
  const { cursor } = Route.useSearch()
  const page = useQuery({ ...categoryPostsOptions(category.id, cursor), placeholderData: keepPreviousData })

  return (
    <div className="mx-auto w-full max-w-[44rem]">
      <header className="pb-12 pt-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">分类</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{category.name}</h1>
      </header>
      {page.isError ? (
        <DataLoaderError error={page.error} />
      ) : (
        <PostList
          page={page.data}
          cursor={cursor}
          buildPageHref={(c) => ({
            to: '/categories/$slug',
            params: { slug: category.slug },
            search: { cursor: c },
          })}
        />
      )}
    </div>
  )
}

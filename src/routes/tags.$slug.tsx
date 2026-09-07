import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { DataLoaderError, PostList, TaxonomySidebar } from '#/components/post-list'
import { getTagBySlug } from '#/server/public-data.functions'
import { categoriesOptions, tagsOptions, tagPostsOptions } from '#/lib/query-options'

/**
 * 标签过滤页：slug → id 两段式解析 + containsAny("tag_ids", [id])——
 * M:N 数组属性的成员判断（contains 是模糊匹配，不能用在这里）。
 */
export const Route = createFileRoute('/tags/$slug')({
  validateSearch: (search: Record<string, unknown>): { cursor?: string } => ({
    cursor: typeof search['cursor'] === 'string' && search['cursor'] !== '' ? search['cursor'] : undefined,
  }),
  loaderDeps: ({ search }) => ({ cursor: search.cursor }),
  loader: async ({ context, params, deps }) => {
    const tag = await context.queryClient.ensureQueryData({
      queryKey: ['tags', 'by-slug', params.slug],
      queryFn: () => getTagBySlug({ data: { slug: params.slug } }),
    })
    if (!tag) throw notFound()
    const load = (cursor?: string) =>
      context.queryClient.ensureQueryData(tagPostsOptions(tag.id, cursor))
    await Promise.all([
      load(deps.cursor).catch((e: unknown) => {
        if (deps.cursor) throw redirect({ to: '/tags/$slug', params: { slug: params.slug }, search: {}, replace: true })
        throw e
      }),
      context.queryClient.ensureQueryData(categoriesOptions()),
      context.queryClient.ensureQueryData(tagsOptions()),
    ])
    return { tag }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `标签：${loaderData.tag.name}` : '标签' }],
  }),
  component: TagPage,
})

function TagPage() {
  const { tag } = Route.useLoaderData()
  const { cursor } = Route.useSearch()
  const page = useQuery({ ...tagPostsOptions(tag.id, cursor), placeholderData: keepPreviousData })

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
      <section className="space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">标签</p>
          <h1 className="text-2xl font-bold tracking-tight">#{tag.name}</h1>
          <p className="text-sm text-muted-foreground">
            slug <code className="rounded bg-muted px-1">{tag.slug}</code> → 文档{' '}
            <code className="rounded bg-muted px-1">{tag.id}</code>，过滤条件{' '}
            <code className="rounded bg-muted px-1">containsAny("tag_ids", …)</code>（M:N 数组属性，GIN 自动索引）。
          </p>
        </header>
        {page.isError ? (
          <DataLoaderError error={page.error} />
        ) : (
          <PostList
            page={page.data}
            buildPageHref={(c) => ({
              to: '/tags/$slug',
              params: { slug: tag.slug },
              search: { cursor: c },
            })}
          />
        )}
      </section>
      <TaxonomySidebar />
    </div>
  )
}

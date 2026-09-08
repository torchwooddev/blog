import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { DataLoaderError, PostList } from '#/components/post-list'
import { getTagBySlug } from '#/server/public-data.functions'
import { categoriesOptions, tagsOptions, tagPostsOptions } from '#/lib/query-options'
import { publicConfig } from '#/lib/config'
import { settingsFromMatches } from '#/lib/site-settings'

/**
 * 标签过滤页：slug → id 两段式解析 + 数组成员判断（M:N 数组属性）。
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
  head: ({ matches, loaderData }) => {
    const name = loaderData ? loaderData.tag.name : undefined
    const siteName = settingsFromMatches(matches).siteName
    return {
      meta: [
        { title: name ? `标签：${name} · ${siteName}` : `标签 · ${siteName}` },
        ...(name ? [{ name: 'description', content: `${siteName} 中标记为「${name}」的全部文章。` }] : []),
        { property: 'og:type', content: 'website' },
        ...(name ? [{ property: 'og:title', content: `标签：${name}` }] : []),
      ],
      links: loaderData
        ? [{ rel: 'canonical', href: `${publicConfig.siteUrl}/tags/${loaderData.tag.slug}` }]
        : [],
    }
  },
  component: TagPage,
})

function TagPage() {
  const { tag } = Route.useLoaderData()
  const { cursor } = Route.useSearch()
  const page = useQuery({ ...tagPostsOptions(tag.id, cursor), placeholderData: keepPreviousData })

  return (
    <div className="mx-auto w-full max-w-[44rem]">
      <header className="pb-12 pt-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">标签</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight">#{tag.name}</h1>
      </header>
      {page.isError ? (
        <DataLoaderError error={page.error} />
      ) : (
        <PostList
          page={page.data}
          cursor={cursor}
          buildPageHref={(c) => ({
            to: '/tags/$slug',
            params: { slug: tag.slug },
            search: { cursor: c },
          })}
        />
      )}
    </div>
  )
}

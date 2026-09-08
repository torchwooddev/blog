import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Clock, MessageSquare, Paperclip } from 'lucide-react'
import { CommentsSection } from '#/components/comments'
import { PostBody } from '#/components/post-body'
import { PostToc } from '#/components/post-toc'
import { ReadingProgress } from '#/components/reading-progress'
import { Skeleton } from '#/components/ui/skeleton'
import { publicConfig } from '#/lib/config'
import { formatBytes, formatDate } from '#/lib/format'
import { toSafeJsonLd } from '#/lib/jsonld'
import { extractToc, readingMinutes, renderArticleHtml } from '#/lib/post-utils'
import { excerpt } from '#/lib/types'
import { adjacentPostsOptions, commentsOptions, postDetailOptions } from '#/lib/query-options'

export const Route = createFileRoute('/posts/$slug')({
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(postDetailOptions(params.slug))
    // 不可见（草稿/他人私有）或不存在 → 404。服务端对不可见文档返回 NotFound（防枚举）。
    if (!detail) throw notFound()
    return detail
  },
  head: ({ loaderData }) => {
    const detail = loaderData
    const title = detail ? `${detail.post.title} · ${publicConfig.siteName}` : publicConfig.siteName
    const description = detail ? excerpt(detail.post.content, 140) : undefined
    const url = detail ? `${publicConfig.siteUrl}/posts/${detail.post.slug}` : undefined
    const ogImage = detail?.attachments.find((f) => f.isImage)
    // 标题等字段是用户可控内容：必须走安全序列化，
    // 否则字面 "</script>" 会提前闭合 ld+json 标签（存储型 XSS，见 B-02）。
    const jsonLd = detail
      ? toSafeJsonLd({
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: detail.post.title,
          description,
          datePublished: detail.post.publishedAt ?? detail.post.createdAt,
          dateModified: detail.post.updatedAt,
          url,
          mainEntityOfPage: url,
          inLanguage: 'zh-CN',
          author: { '@type': 'Organization', name: publicConfig.siteName },
          publisher: { '@type': 'Organization', name: publicConfig.siteName },
          ...(ogImage ? { image: ogImage.viewUrl } : {}),
          ...(detail.category ? { articleSection: detail.category.name } : {}),
          ...(detail.tags.length > 0 ? { keywords: detail.tags.map((t) => t.name).join(', ') } : {}),
        })
      : undefined
    return {
      meta: [
        { title },
        ...(description ? [{ name: 'description', content: description }] : []),
        ...(detail
          ? [
              { property: 'og:type', content: 'article' },
              { property: 'og:title', content: detail.post.title },
              ...(description ? [{ property: 'og:description', content: description }] : []),
              { property: 'og:url', content: url ?? '' },
              { property: 'article:published_time', content: detail.post.publishedAt ?? detail.post.createdAt },
              { property: 'article:modified_time', content: detail.post.updatedAt },
              { name: 'twitter:card', content: ogImage ? 'summary_large_image' : 'summary' },
              { name: 'twitter:title', content: detail.post.title },
              ...(description ? [{ name: 'twitter:description', content: description }] : []),
              ...(ogImage ? [{ property: 'og:image', content: ogImage.viewUrl }, { name: 'twitter:image', content: ogImage.viewUrl }] : []),
              ...(detail.category ? [{ property: 'article:section', content: detail.category.name }] : []),
              ...detail.tags.map((tag) => ({ property: 'article:tag', content: tag.name })),
            ]
          : []),
      ],
      links: url ? [{ rel: 'canonical', href: url }] : [],
      scripts: jsonLd ? [{ type: 'application/ld+json', children: jsonLd }] : [],
    }
  },
  component: PostPage,
})

function PostPage() {
  const { post, category, tags, attachments } = Route.useLoaderData()
  const html = renderArticleHtml(post.content)
  const minutes = readingMinutes(post.content)
  // 附件区只展示"未内联进正文"的文件（内联图片已在 markdown 中显示）。
  const listed = attachments.filter((f) => !post.content.includes(f.viewUrl))
  // 评论数用实时查询（与评论区共享缓存）：新评论后头部计数联动。
  const liveComments = useQuery({ ...commentsOptions(post.id), enabled: false, initialData: Route.useLoaderData().comments })
  const commentCount = liveComments.data?.length ?? 0

  return (
    <>
      <ReadingProgress />
      <div className="relative mx-auto w-full max-w-[44rem]">
        {/* 居中文章头 */}
        <header className="pb-12 pt-2 text-center">
          {category ? (
            <Link
              to="/categories/$slug"
              params={{ slug: category.slug }}
              className="text-xs font-bold uppercase tracking-[0.14em] text-brand transition-opacity hover:opacity-70"
            >
              {category.name}
            </Link>
          ) : null}
          <h1 className="mt-4 text-[2rem] font-extrabold leading-[1.2] tracking-tight sm:text-[2.5rem]">
            {post.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
            {post.publishedAt ? (
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            ) : (
              <span className="rounded-full border px-2 py-0.5 text-xs">草稿</span>
            )}
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {minutes} 分钟
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" />
              {commentCount} 条评论
            </span>
          </div>
          {tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              {tags.map((tag) => (
                <Link
                  key={tag.id}
                  to="/tags/$slug"
                  params={{ slug: tag.slug }}
                  className="link-underline transition-colors hover:text-foreground"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        {/* 正文在服务端完成 markdown 渲染 + 消毒，客户端拿到的是安全 HTML。 */}
        <PostBody html={html} />

        <PostNeighbors slug={post.slug} />

        {listed.length > 0 ? (
          <section className="mt-12 space-y-3 rounded-xl border bg-muted/30 p-5" aria-label="附件">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Paperclip className="size-4 text-muted-foreground" />
              附件（{listed.length}）
            </h2>
            <ul className="space-y-2">
              {listed.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.downloadUrl}
                    className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    {file.isImage ? (
                      <img src={file.previewUrl} alt={file.name} className="h-10 w-14 rounded object-cover" />
                    ) : (
                      <Paperclip className="size-4 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-14">
          <CommentsSection postId={post.id} />
        </div>

        {/* 目录挂栏：挂在居中文章列右侧的留白里，随滚动吸附（xl 起显示） */}
        <aside className="absolute bottom-0 left-full top-24 hidden w-52 xl:block 2xl:ml-2 2xl:w-56">
          <div className="sticky top-24">
            <PostToc items={extractToc(post.content)} />
          </div>
        </aside>
      </div>
    </>
  )
}

/** 上一篇 / 下一篇导航（客户端补充查询，不阻塞首屏）。 */
function PostNeighbors({ slug }: { slug: string }) {
  const neighbors = useQuery(adjacentPostsOptions(slug))

  if (neighbors.isLoading) {
    return (
      <div className="mt-12 grid gap-3 border-t pt-10 sm:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    )
  }
  const older = neighbors.data?.older ?? null
  const newer = neighbors.data?.newer ?? null
  if (!older && !newer) return null

  return (
    <nav className="mt-12 grid gap-3 border-t pt-10 sm:grid-cols-2" aria-label="相邻文章">
      {older ? (
        <Link
          to="/posts/$slug"
          params={{ slug: older.slug }}
          className="group rounded-xl border p-4 transition-colors hover:border-foreground/25"
        >
          <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="size-3" />
            上一篇
          </span>
          <span className="line-clamp-1 text-sm font-semibold transition-colors group-hover:text-brand">
            {older.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {newer ? (
        <Link
          to="/posts/$slug"
          params={{ slug: newer.slug }}
          className="group rounded-xl border p-4 text-right transition-colors hover:border-foreground/25 sm:col-start-2"
        >
          <span className="mb-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            下一篇
            <ArrowRight className="size-3" />
          </span>
          <span className="line-clamp-1 text-sm font-semibold transition-colors group-hover:text-brand">
            {newer.title}
          </span>
        </Link>
      ) : null}
    </nav>
  )
}

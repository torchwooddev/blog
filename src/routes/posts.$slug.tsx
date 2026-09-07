import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Clock, MessageSquare, Paperclip } from 'lucide-react'
import { CommentsSection } from '#/components/comments'
import { PostBody } from '#/components/post-body'
import { PostToc } from '#/components/post-toc'
import { ReadingProgress } from '#/components/reading-progress'
import { Badge } from '#/components/ui/badge'
import { Skeleton } from '#/components/ui/skeleton'
import { publicConfig } from '#/lib/config'
import { formatBytes, formatDate } from '#/lib/format'
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
    const jsonLd = detail
      ? JSON.stringify({
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
      <div className="mx-auto xl:grid xl:grid-cols-[minmax(0,1fr)_230px] xl:gap-14">
        <article className="mx-auto w-full max-w-3xl space-y-10">
          <header className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
              {category ? (
                <Link
                  to="/categories/$slug"
                  params={{ slug: category.slug }}
                  className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  {category.name}
                </Link>
              ) : null}
              <span className="inline-flex items-center gap-1.5 text-xs">
                {post.publishedAt ? (
                  <>
                    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                    <span aria-hidden>·</span>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">草稿</Badge>
                    <span aria-hidden>·</span>
                  </>
                )}
                <Clock className="size-3" />
                约 {minutes} 分钟
                <span aria-hidden>·</span>
                <MessageSquare className="size-3" />
                {commentCount} 条评论
              </span>
            </div>

            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>

            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Link key={tag.id} to="/tags/$slug" params={{ slug: tag.slug }}>
                    <Badge
                      variant="outline"
                      className="font-normal text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      #{tag.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </header>

          {/* 正文在服务端完成 markdown 渲染 + 消毒，客户端拿到的是安全 HTML。 */}
          <PostBody html={html} />

          <PostNeighbors slug={post.slug} />

          {listed.length > 0 ? (
            <section className="space-y-3 rounded-xl border bg-muted/30 p-5" aria-label="附件">
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

          <CommentsSection postId={post.id} />
        </article>

        <aside className="hidden xl:block">
          <PostToc items={extractToc(post.content)} />
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    )
  }
  const older = neighbors.data?.older ?? null
  const newer = neighbors.data?.newer ?? null
  if (!older && !newer) return null

  return (
    <nav className="grid gap-3 border-t pt-8 sm:grid-cols-2" aria-label="相邻文章">
      {older ? (
        <Link
          to="/posts/$slug"
          params={{ slug: older.slug }}
          className="group rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-accent/50"
        >
          <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="size-3" />
            上一篇
          </span>
          <span className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-primary">
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
          className="group rounded-xl border p-4 text-right transition-colors hover:border-primary/40 hover:bg-accent/50 sm:col-start-2"
        >
          <span className="mb-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            下一篇
            <ArrowRight className="size-3" />
          </span>
          <span className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-primary">
            {newer.title}
          </span>
        </Link>
      ) : null}
    </nav>
  )
}

import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, Paperclip } from 'lucide-react'
import { CommentsSection } from '#/components/comments'
import { Badge } from '#/components/ui/badge'
import { Separator } from '#/components/ui/separator'
import { publicConfig } from '#/lib/config'
import { formatBytes } from '#/lib/format'
import { formatDateTime } from '#/lib/format'
import { renderMarkdown } from '#/lib/markdown'
import { postDetailOptions } from '#/lib/query-options'

export const Route = createFileRoute('/posts/$slug')({
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(postDetailOptions(params.slug))
    // 不可见（草稿/他人私有）或不存在 → 404。服务端对不可见文档返回 NotFound（防枚举）。
    if (!detail) throw notFound()
    return detail
  },
  head: ({ loaderData }) => {
    const detail = loaderData
    const title = detail ? `${detail.post.title} · ${publicConfig.siteName}` : `${publicConfig.siteName}`
    const description = detail
      ? `${detail.post.content.slice(0, 120).replace(/[#>*`]/g, '').trim()}…`
      : undefined
    const url = detail ? `${publicConfig.siteUrl}/posts/${detail.post.slug}` : undefined
    const ogImage = detail?.attachments.find((f) => f.isImage)
    return {
      meta: [
        { title },
        ...(description ? [{ name: 'description', content: description }] : []),
        ...(detail
          ? [
              { property: 'og:type', content: 'article' },
              { property: 'og:title', content: detail.post.title },
              { property: 'og:url', content: url ?? '' },
              { property: 'article:published_time', content: detail.post.publishedAt ?? '' },
              ...(ogImage ? [{ property: 'og:image', content: ogImage.viewUrl }] : []),
              ...(detail.category ? [{ property: 'article:section', content: detail.category.name }] : []),
              ...detail.tags.map((tag) => ({ property: 'article:tag', content: tag.name })),
            ]
          : []),
      ],
    }
  },
  component: PostPage,
})

function PostPage() {
  const { post, category, tags, attachments } = Route.useLoaderData()
  const html = renderMarkdown(post.content)
  // 附件区只展示"未内联进正文"的文件（内联图片已在 markdown 中显示）。
  const listed = attachments.filter((f) => !post.content.includes(f.viewUrl))

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {post.publishedAt ? (
            <time dateTime={post.publishedAt}>发布于 {formatDateTime(post.publishedAt)}</time>
          ) : (
            <Badge variant="secondary">草稿</Badge>
          )}
          {category ? (
            <>
              <span>·</span>
              <Link
                to="/categories/$slug"
                params={{ slug: category.slug }}
                className="hover:text-primary hover:underline"
              >
                {category.name}
              </Link>
            </>
          ) : null}
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">{post.title}</h1>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Link key={tag.id} to="/tags/$slug" params={{ slug: tag.slug }}>
                <Badge variant="outline" className="hover:bg-accent">
                  #{tag.name}
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}
      </header>

      <Separator />

      {/* 正文在服务端完成 markdown 渲染 + DOMPurify 消毒，客户端拿到的是安全 HTML。 */}
      <div
        className="prose prose-zinc dark:prose-invert max-w-none prose-pre:bg-muted prose-code:before:content-none prose-code:after:content-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <Separator />

      <CommentsSection postId={post.id} />

      {listed.length > 0 ? (
        <>
          <Separator />
          <section className="space-y-3" aria-label="附件">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Paperclip className="size-4" />
              附件（{listed.length}）
            </h2>
            <ul className="space-y-2">
              {listed.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.downloadUrl}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent"
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
            <p className="text-xs text-muted-foreground">
              文件由 Torchwood Storage 托管（公开桶 blog-media，匿名可读）。
            </p>
          </section>
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">
        文档 ID <code className="rounded bg-muted px-1">{post.id}</code> · OCC version {post.version} ·
        ACE 回读 <code className="rounded bg-muted px-1">{post.permissions.join(', ') || '(空)'}</code>
      </p>

      <Link to="/" className="inline-flex items-center gap-1 text-sm hover:text-primary">
        <ArrowLeft className="size-4" />
        返回列表
      </Link>
    </article>
  )
}

import { createFileRoute, Link } from '@tanstack/react-router'
import { Clock, MessageSquare, PenSquare, Search } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { publicConfig } from '#/lib/config'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: `关于 · ${publicConfig.siteName}` },
      { name: 'description', content: `关于 ${publicConfig.siteName}：${publicConfig.siteDescription}` },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: `关于 ${publicConfig.siteName}` },
    ],
    links: [{ rel: 'canonical', href: `${publicConfig.siteUrl}/about` }],
  }),
  component: AboutPage,
})

const FEATURES = [
  {
    icon: PenSquare,
    title: '持续写作',
    description: '关于技术、设计与产品的实践记录，长期更新。',
  },
  {
    icon: MessageSquare,
    title: '开放讨论',
    description: '每篇文章都开放评论，实时同步，欢迎交流不同看法。',
  },
  {
    icon: Clock,
    title: '阅读优先',
    description: '为阅读体验打磨的排版：合理的行宽、行高与代码块样式。',
  },
] as const

function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <header className="space-y-1 border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">About</p>
        <h1 className="text-3xl font-extrabold tracking-tight">关于本站</h1>
      </header>

      <div className="prose prose-zinc dark:prose-invert max-w-none">
        <p>
          你好，欢迎来到 <strong>{publicConfig.siteName}</strong>。这里是我的公开写作空间，
          {publicConfig.siteDescription}。
        </p>
        <p>
          文章按「分类」组织、用「标签」串联；首页展示最新内容，
          <Link to="/archive" className="font-medium">
            归档
          </Link>
          页提供按年份的全量索引，右上角的搜索（快捷键 ⌘K）可以按标题或正文找任意一篇文章。
        </p>
        <p>
          如果你想持续关注更新，可以订阅{' '}
          <a href="/feed.xml" className="font-medium">
            RSS
          </a>
          ；也欢迎在任意文章下留言交流。
        </p>
      </div>

      <section className="space-y-5">
        <h2 className="text-lg font-semibold tracking-tight">这个站点</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="space-y-2 rounded-xl border p-5">
              <feature.icon className="size-5 text-primary" />
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-muted/30 p-6">
        <h2 className="text-lg font-semibold tracking-tight">开始阅读</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          从首页的最新文章开始，或直接搜索感兴趣的主题。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/">浏览最新文章</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/search">
              <Search className="size-4" />
              搜索文章
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}

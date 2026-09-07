import type { QueryClient } from '@tanstack/react-query'
import { Link, createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { Toaster } from '#/components/ui/sonner'
import { SiteFooter } from '#/components/site-footer'
import { SiteHeader } from '#/components/site-header'
import { publicConfig } from '#/lib/config'
import appCss from '../styles.css?url'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'alternate', type: 'application/rss+xml', title: publicConfig.siteName, href: '/feed.xml' },
      {
        rel: 'icon',
        href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🪵</text></svg>',
      },
    ],
  }),
  shellComponent: RootDocument,
  component: AppShell,
  notFoundComponent: NotFound,
})

function AppShell() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="container mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <SiteFooter />
      <Toaster position="top-center" richColors />
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-6xl">🪵</p>
      <h1 className="text-2xl font-semibold">页面不存在</h1>
      <p className="text-muted-foreground">
        内容可能已被删除，或者你正在查看一篇属于别人的草稿。
      </p>
      <Link to="/" className="text-primary underline-offset-4 hover:underline">
        回到首页
      </Link>
    </div>
  )
}

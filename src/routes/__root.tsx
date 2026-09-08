import type { QueryClient } from '@tanstack/react-query'
import { Link, createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react'
import { Toaster } from '#/components/ui/sonner'
import { ThemeProvider } from '#/components/theme-provider'
import { SiteFooter } from '#/components/site-footer'
import { SiteHeader } from '#/components/site-header'
import { Button } from '#/components/ui/button'
import { SITE_SETTINGS_FALLBACK, settingsFromMatches } from '#/lib/site-settings'
import { siteSettingsOptions } from '#/lib/site-settings-client'
import appCss from '../styles.css?url'

export interface RouterContext {
  queryClient: QueryClient
}

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@400;500;600;700;800&display=swap'

export const Route = createRootRouteWithContext<RouterContext>()({
  // root loader：预取站点配置（settings 集合的 DB 覆盖层），SSR 首屏即生效，
  // 并随 loaderData 注入所有子路由（各页 head() 经 settingsFromMatches 消费）。
  // 读取失败回退 env 兜底——配置层故障不放大成整站 500。
  loader: async ({ context }) => {
    const settings = await context.queryClient.ensureQueryData(siteSettingsOptions()).catch(() => undefined)
    return { settings: settings ?? SITE_SETTINGS_FALLBACK }
  },
  head: ({ matches }) => {
    const settings = settingsFromMatches(matches)
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'index, follow' },
        { property: 'og:site_name', content: settings.siteName },
        { property: 'og:locale', content: 'zh_CN' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#ffffff' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#17181d' },
      ],
      links: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
        { rel: 'stylesheet', href: FONT_CSS },
        { rel: 'stylesheet', href: appCss },
        { rel: 'alternate', type: 'application/rss+xml', title: settings.siteName, href: '/feed.xml' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    }
  },
  shellComponent: RootDocument,
  component: AppShell,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
})

function AppShell() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <Outlet />
      </main>
      <SiteFooter />
      <Toaster position="top-center" />
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 运行时公开配置：classic script 阻断执行，先于所有 deferred module bundle */}
        <script src="/config.js" />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-5 py-24 text-center">
      <p className="font-mono text-7xl font-bold tracking-tight text-primary/20">404</p>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">页面不存在</h1>
        <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
          内容可能已被删除或移动，也可能是一篇尚未公开的文章。
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/">
          <ArrowLeft className="size-4" />
          回到首页
        </Link>
      </Button>
    </div>
  )
}

function RouteError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <div className="flex flex-col items-center gap-5 py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">页面出了点问题</h1>
        <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
          {error instanceof Error ? error.message : '加载内容时发生未知错误。'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void router.invalidate()}>
          <RotateCw className="size-4" />
          重试
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/">回到首页</Link>
        </Button>
      </div>
    </div>
  )
}

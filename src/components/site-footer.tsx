import { Link } from '@tanstack/react-router'
import { Rss } from 'lucide-react'
import { LogoMark } from '#/components/logo'
import { publicConfig } from '#/lib/config'

const FOOTER_NAV = [
  { to: '/', label: '首页' },
  { to: '/archive', label: '归档' },
  { to: '/search', label: '搜索' },
  { to: '/about', label: '关于' },
] as const

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm space-y-3">
            <Link to="/" className="flex items-center gap-2.5">
              <LogoMark className="size-6 rounded-[6px]" />
              <span className="text-[15px] font-bold tracking-tight">{publicConfig.siteName}</span>
            </Link>
            <p className="text-sm leading-6 text-muted-foreground">{publicConfig.siteDescription}</p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm" aria-label="页脚导航">
            <span className="col-span-2 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              导航
            </span>
            {FOOTER_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="grid grid-cols-1 gap-y-2 text-sm">
            <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">订阅</span>
            <a
              href="/feed.xml"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Rss className="size-3.5" />
              RSS 订阅
            </a>
            <a href="/sitemap.xml" className="text-muted-foreground transition-colors hover:text-foreground">
              站点地图
            </a>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-1 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {publicConfig.siteName} · 保留所有权利
          </p>
          {publicConfig.siteFooterNote ? <p>{publicConfig.siteFooterNote}</p> : null}
        </div>
      </div>
    </footer>
  )
}

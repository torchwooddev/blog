import { Link } from '@tanstack/react-router'
import { currentYear } from '#/lib/format'
import { useSiteSettings } from '#/lib/site-settings-client'

const FOOTER_NAV = [
  { to: '/', label: '首页' },
  { to: '/archive', label: '归档' },
  { to: '/search', label: '搜索' },
  { to: '/about', label: '关于' },
] as const

/** 极简居中页脚：字标 + 简介 + 导航一行 + 订阅/版权。 */
export function SiteFooter() {
  const year = currentYear()
  const settings = useSiteSettings()
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-4 py-14 text-center sm:px-6">
        <Link
          to="/"
          className="text-[15px] font-bold tracking-tight transition-opacity hover:opacity-70"
        >
          {settings.siteName}
        </Link>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{settings.siteDescription}</p>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm" aria-label="页脚导航">
          {FOOTER_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="link-underline text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="/feed.xml"
            className="link-underline text-muted-foreground transition-colors hover:text-foreground"
          >
            RSS
          </a>
        </nav>

        <div className="mt-2 flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <p>
            © {year} {settings.siteName} · 保留所有权利
          </p>
          {settings.siteFooterNote ? <p>{settings.siteFooterNote}</p> : null}
        </div>
      </div>
    </footer>
  )
}

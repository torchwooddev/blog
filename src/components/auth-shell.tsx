import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { LogoMark } from '#/components/logo'
import { publicConfig } from '#/lib/config'

/** 登录/注册页共享外壳：居中卡片 + 站点品牌头。 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center py-10">
      <Link to="/" className="mb-6 flex items-center gap-2.5" aria-label={publicConfig.siteName}>
        <LogoMark className="size-8 rounded-[8px]" />
        <span className="text-lg font-bold tracking-tight">{publicConfig.siteName}</span>
      </Link>
      <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
      <div className="mt-5 text-sm text-muted-foreground">{footer}</div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { publicConfig } from '#/lib/config'

/** 登录/注册页共享外壳：居中字标 + 极简卡片。 */
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
    <div className="mx-auto flex w-full max-w-sm flex-col items-center py-12">
      <Link
        to="/"
        className="text-lg font-bold tracking-tight transition-opacity hover:opacity-70"
        aria-label={publicConfig.siteName}
      >
        {publicConfig.siteName}
      </Link>
      <div className="mt-8 w-full rounded-2xl border p-7 shadow-[0_1px_3px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.04)]">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
      <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
    </div>
  )
}

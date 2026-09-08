import { useMutation } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  ExternalLink,
  FilePlus2,
  FileText,
  FolderTree,
  KeyRound,
  LogOut,
  Menu,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { Account } from '@torchwood/sdk'
import { ChangePasswordDialog } from '#/components/change-password-dialog'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { publicConfig } from '#/lib/config'
import { describeError } from '#/lib/errors'
import { USER_GROUPS, type UserGroupKey } from '#/lib/user-groups'
import { logout } from '#/lib/torchwood-client'
import { cn } from 'cn'

/**
 * 工作台外壳：左侧菜单 + 右侧工作区的控制台布局（移动端折叠为顶栏 + 抽屉）。
 * 只包裹 /admin/* 路由——公开博客页保持原有页头/页脚，互不影响。
 */

interface AdminNavItem {
  to: string
  label: string
  icon: LucideIcon
  /** 前缀匹配默认开启；'/admin' 这类根路径用 exact。 */
  exact?: boolean
  adminOnly?: boolean
}

const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', label: '我的文章', icon: FileText, exact: true },
  { to: '/admin/new', label: '新建文章', icon: FilePlus2 },
  { to: '/admin/categories', label: '分类管理', icon: FolderTree },
  { to: '/admin/users', label: '用户管理', icon: Users, adminOnly: true },
  { to: '/admin/settings', label: '站点设置', icon: Settings, adminOnly: true },
]

export function AdminShell({
  viewer,
  groupKey,
  children,
}: {
  viewer: Account
  groupKey: UserGroupKey
  children: ReactNode
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [mobileOpen, setMobileOpen] = useState(false)

  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      toast.success('已退出登录')
      void (window.location.href = '/')
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const items = ADMIN_NAV.filter((item) => !item.adminOnly || groupKey === 'admin')
  const isActive = (item: AdminNavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
  const initials = (viewer.name || viewer.email || '?').trim().slice(0, 1).toUpperCase()

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1" aria-label="工作台菜单">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          aria-current={isActive(item) ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
            isActive(item)
              ? 'bg-accent font-semibold text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  )

  const accountBlock = (onNavigate?: () => void) => (
    <div className="mt-auto border-t p-3">
      <div className="flex items-center gap-2.5 px-1 pb-3">
        <Avatar className="size-8">
          <AvatarFallback className="bg-foreground/5 text-[11px] text-foreground ring-1 ring-border">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{viewer.name || '作者'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {USER_GROUPS[groupKey].name} · {viewer.email}
          </p>
        </div>
      </div>
      <div className="grid gap-0.5">
        <ChangePasswordDialog>
          <Button variant="ghost" size="sm" className="justify-start text-muted-foreground hover:text-foreground">
            <KeyRound className="size-4" />
            修改密码
          </Button>
        </ChangePasswordDialog>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground hover:text-foreground"
          onClick={onNavigate}
        >
          <Link to="/">
            <ExternalLink className="size-4" />
            返回博客
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-destructive hover:text-destructive"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          <LogOut className="size-4" />
          退出登录
        </Button>
      </div>
    </div>
  )

  const brand = (
    <Link
      to="/"
      className="flex items-baseline gap-2 px-3 py-1 transition-opacity hover:opacity-70"
      aria-label={`${publicConfig.siteName} 首页`}
    >
      <span className="text-[15px] font-bold tracking-tight">{publicConfig.siteName}</span>
      <span className="text-xs text-muted-foreground">工作台</span>
    </Link>
  )

  return (
    <div className="flex min-h-svh bg-background">
      {/* 桌面侧栏 */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-muted/40 md:flex">
        <div className="px-3 py-4">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3">{navLinks()}</div>
        {accountBlock()}
      </aside>

      {/* 工作区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur md:hidden">
          {brand}
          <Button
            variant="ghost"
            size="icon"
            aria-label="打开工作台菜单"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>

      {/* 移动端抽屉 */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle>{publicConfig.siteName} · 工作台</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto p-3">{navLinks(() => setMobileOpen(false))}</div>
            {accountBlock(() => setMobileOpen(false))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

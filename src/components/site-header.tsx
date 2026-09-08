import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { KeyRound, LogOut, PenSquare, Search, Settings, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ChangePasswordDialog } from '#/components/change-password-dialog'
import { SearchDialog } from '#/components/search-dialog'
import { ThemeToggle } from '#/components/theme-toggle'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '#/components/ui/sheet'
import { Skeleton } from '#/components/ui/skeleton'
import { describeError } from '#/lib/errors'
import { useSiteSettings } from '#/lib/site-settings-client'
import { useMyGroup } from '#/lib/user-group-client'
import { USER_GROUPS } from '#/lib/user-groups'
import { logout, useAuth } from '#/lib/torchwood-client'
import { cn } from 'cn'

const NAV_LINKS = [
  { to: '/', label: '首页', exact: true },
  { to: '/archive', label: '归档', exact: false },
  { to: '/about', label: '关于', exact: false },
] as const

export function SiteHeader() {
  const auth = useAuth()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pwDialogOpen, setPwDialogOpen] = useState(false)
  const settings = useSiteSettings()

  // 用户组：读者不展示写作入口；未知（加载中/查询失败）时保守展示，与既有行为一致。
  const group = useMyGroup(auth.status === 'signedIn' && auth.account ? auth.account.id : undefined)
  const canWrite = group.data ? group.data !== 'reader' : true
  const viewerIsAdmin = group.data === 'admin'

  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      toast.success('已退出登录')
      void navigate({ to: '/' })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)

  const initials = (auth.account?.name || auth.account?.email || '?').trim().slice(0, 1).toUpperCase()

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-7">
            <Link
              to="/"
              className="text-[15px] font-bold tracking-tight text-foreground transition-opacity hover:opacity-70"
              aria-label={settings.siteName}
            >
              {settings.siteName}
            </Link>

            <nav className="hidden items-center gap-5 md:flex" aria-label="主导航">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={cn(
                    'link-underline pb-0.5 text-sm transition-colors',
                    isActive(link.to, link.exact)
                      ? 'font-semibold text-foreground'
                      : 'font-medium text-muted-foreground hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="搜索文章"
            >
              <Search className="size-4" />
            </button>

            <ThemeToggle />

            {auth.status === 'restoring' ? (
              <Skeleton className="h-8 w-16 rounded-full" aria-label="加载登录状态" />
            ) : auth.status === 'signedIn' && auth.account ? (
              <>
                {canWrite ? (
                  <Button asChild size="sm" className="ml-1 rounded-full px-4">
                    <Link to="/admin">
                      <PenSquare className="size-3.5" />
                      写作
                    </Link>
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="ml-1.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="账号菜单"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-foreground/5 text-[11px] text-foreground ring-1 ring-border">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="truncate">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{auth.account.name || '作者'}</span>
                        {group.data ? (
                          <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px]">
                            {USER_GROUPS[group.data].name}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {auth.account.email}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {canWrite ? (
                      <DropdownMenuItem asChild>
                        <Link to="/admin">
                          <PenSquare className="size-4" />
                          我的文章
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    {viewerIsAdmin ? (
                      <>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/settings">
                            <Settings className="size-4" />
                            站点设置
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/users">
                            <Users className="size-4" />
                            用户管理
                          </Link>
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    <DropdownMenuItem onSelect={() => setPwDialogOpen(true)}>
                      <KeyRound className="size-4" />
                      修改密码
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={logoutMutation.isPending}
                      onSelect={() => logoutMutation.mutate()}
                    >
                      <LogOut className="size-4" />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="hidden items-center gap-1 sm:flex">
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                  <Link to="/login">登录</Link>
                </Button>
                <Button asChild size="sm" className="ml-1 rounded-full px-4">
                  <Link to="/register">注册</Link>
                </Button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="ml-1 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
              aria-label="打开菜单"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* 移动端导航抽屉 */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle>{settings.siteName}</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4" aria-label="移动端导航">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive(link.to, link.exact)
                    ? 'bg-accent font-semibold text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            ))}
            {auth.status === 'signedIn' && canWrite ? (
              <Link
                to="/admin"
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                我的文章
              </Link>
            ) : null}
          </nav>
          {auth.status === 'signedOut' ? (
            <div className="mt-auto grid gap-2 p-4">
              <Button asChild variant="outline">
                <Link to="/login" onClick={() => setMobileOpen(false)}>
                  登录
                </Link>
              </Button>
              <Button asChild>
                <Link to="/register" onClick={() => setMobileOpen(false)}>
                  注册
                </Link>
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <ChangePasswordDialog
        open={pwDialogOpen}
        onOpenChange={setPwDialogOpen}
      />
    </>
  )
}

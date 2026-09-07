import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogOut, Menu, PenSquare, Search } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { LogoMark } from '#/components/logo'
import { SearchDialog } from '#/components/search-dialog'
import { ThemeToggle } from '#/components/theme-toggle'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
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
import { publicConfig } from '#/lib/config'
import { logout, useAuth } from '#/lib/torchwood-client'

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
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-8">
            <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label={publicConfig.siteName}>
              <LogoMark className="size-7 shrink-0 rounded-[7px]" />
              <span className="truncate text-[15px] font-bold tracking-tight">{publicConfig.siteName}</span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive(link.to, link.exact)
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 items-center gap-2 rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="搜索文章"
            >
              <Search className="size-4" />
              <span className="hidden lg:inline">搜索</span>
              <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] lg:inline">
                ⌘K
              </kbd>
            </button>

            <ThemeToggle />

            {auth.status === 'restoring' ? (
              <Skeleton className="h-8 w-20 rounded-md" aria-label="加载登录状态" />
            ) : auth.status === 'signedIn' && auth.account ? (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link to="/admin">
                    <PenSquare className="size-4" />
                    写作
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="账号菜单"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="truncate">
                      <span className="block truncate font-medium">{auth.account.name || '作者'}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {auth.account.email}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/admin">
                        <PenSquare className="size-4" />
                        我的文章
                      </Link>
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
              <div className="hidden items-center gap-1.5 sm:flex">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">登录</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">注册</Link>
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="打开菜单"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* 移动端导航抽屉 */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2.5">
              <LogoMark className="size-6 rounded-[6px]" />
              {publicConfig.siteName}
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4" aria-label="移动端导航">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive(link.to, link.exact)
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {auth.status === 'signedIn' ? (
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
    </>
  )
}

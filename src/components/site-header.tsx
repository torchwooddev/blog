import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut, PenSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { describeError } from '#/lib/errors'
import { publicConfig } from '#/lib/config'
import { logout, useAuth } from '#/lib/torchwood-client'

export function SiteHeader() {
  const auth = useAuth()
  const navigate = useNavigate()
  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      toast.success('已退出登录')
      void navigate({ to: '/' })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden>🪵</span>
            <span>{publicConfig.siteName}</span>
          </Link>
          <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
            TanStack Start × Torchwood
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {auth.status === 'signedIn' ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">
                  <PenSquare className="size-4" />
                  作者台
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="max-w-40">
                    <span className="truncate">{auth.account?.name ?? auth.account?.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="truncate">{auth.account?.email}</DropdownMenuLabel>
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
          ) : auth.status === 'signedOut' ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">登录</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">注册</Link>
              </Button>
            </>
          ) : (
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" aria-label="加载登录状态" />
          )}
        </nav>
      </div>
    </header>
  )
}

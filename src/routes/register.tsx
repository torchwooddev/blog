import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthShell } from '#/components/auth-shell'
import { GitHubIcon } from '#/components/github-icon'
import { PasswordInput } from '#/components/password-input'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { describeError } from '#/lib/errors'
import { settingsFromMatches } from '#/lib/site-settings'
import { syncMyGroupKey } from '#/lib/user-group-client'
import { USER_GROUPS, type UserGroupKey } from '#/lib/user-groups'
import { register, startGithubLogin, useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/register')({
  head: ({ matches }) => ({
    meta: [
      { title: `注册 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  // oauth=failed：GitHub 授权失败/取消后由网关重定向回来的标记。
  // 返回类型键必须可选，否则全站 <Link to="/register"> 都会被要求传 search。
  validateSearch: (search: Record<string, unknown>): { oauth?: string } => {
    const oauth = search['oauth']
    return typeof oauth === 'string' ? { oauth } : {}
  },
  component: RegisterPage,
})

function RegisterPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { oauth } = Route.useSearch()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 区分"本次注册成功"与"带着已有会话误入本页"：前者由 onSuccess 按组分流，
  // 后者直接回首页（读者组进写作台只会看到提示页）。
  const justRegistered = useRef(false)

  useEffect(() => {
    if (auth.status === 'signedIn' && !justRegistered.current) void navigate({ to: '/' })
  }, [auth.status, navigate])

  const mutation = useMutation({
    // 注册即登录：成功后同步默认用户组（首个注册用户→管理员，其余→读者），
    // 再按组分流落点。同步失败不阻塞（下次登录会再同步）。
    mutationFn: async () => {
      const account = await register(email.trim(), password, name.trim() || email.trim())
      justRegistered.current = true
      let group: UserGroupKey | null = null
      try {
        group = await syncMyGroupKey()
      } catch {
        group = null
      }
      return { account, group }
    },
    onSuccess: ({ account, group }) => {
      if (group === 'reader') {
        toast.success(`欢迎，${account.name || account.email}！已加入${USER_GROUPS.reader.name}组。`)
        void navigate({ to: '/' })
        return
      }
      toast.success(
        group === 'admin'
          ? `欢迎，${account.name || account.email}！你是首位注册用户，已加入${USER_GROUPS.admin.name}组。`
          : `欢迎，${account.name || account.email}！你已登录，可以开始写作。`,
      )
      void navigate({ to: '/admin' })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  return (
    <AuthShell
      title="创建账号"
      description="首位注册的用户自动成为管理员，其余用户加入读者组（可阅读与评论）；需要写作权限请联系管理员调整。"
      footer={
        <>
          已有账号？{' '}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            直接登录
          </Link>
        </>
      }
    >
      {oauth === 'failed' ? (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
          GitHub 登录没有完成，请重试或改用邮箱注册。
        </p>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="name">昵称</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="你的名字"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder="至少 8 位"
            minLength={8}
          />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {mutation.isPending ? '注册中…' : '注册并登录'}
        </Button>
      </form>
      <div className="mt-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">或</span>
        <Separator className="flex-1" />
      </div>
      <Button type="button" variant="outline" className="mt-6 w-full" onClick={() => startGithubLogin()}>
        <GitHubIcon />
        使用 GitHub 注册
      </Button>
    </AuthShell>
  )
}

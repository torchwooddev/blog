import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Github, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthShell } from '#/components/auth-shell'
import { PasswordInput } from '#/components/password-input'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { describeError, isAccountNotActive } from '#/lib/errors'
import { settingsFromMatches } from '#/lib/site-settings'
import { syncMyGroupKey } from '#/lib/user-group-client'
import type { UserGroupKey } from '#/lib/user-groups'
import { login, startGithubLogin, useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/login')({
  head: ({ matches }) => ({
    meta: [
      { title: `登录 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  // oauth=failed：GitHub 授权失败/取消后由网关重定向回来的标记。
  // 返回类型键必须可选，否则全站 <Link to="/login"> 都会被要求传 search。
  validateSearch: (search: Record<string, unknown>): { oauth?: string } => {
    const oauth = search['oauth']
    return typeof oauth === 'string' ? { oauth } : {}
  },
  component: LoginPage,
})

function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { oauth } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [githubPending, setGithubPending] = useState(false)
  // 区分"本次登录成功"与"带着已有会话误入本页"：前者由 onSuccess 按组分流，
  // 后者直接回首页（读者组不该被送进写作台）。
  const justLoggedIn = useRef(false)

  useEffect(() => {
    if (auth.status === 'signedIn' && !justLoggedIn.current) void navigate({ to: '/' })
  }, [auth.status, navigate])

  async function handleGithubLogin(): Promise<void> {
    setGithubPending(true)
    try {
      await startGithubLogin()
    } catch (e) {
      toast.error(describeError(e))
      setGithubPending(false)
    }
  }

  const mutation = useMutation({
    // 登录由浏览器直连认证服务完成（终端用户 JWT），不经过应用服务器。
    // 成功后同步用户组（顺带补齐分组缺失的旧账号），按组分流落点；
    // 同步失败不阻塞登录，落回写作台由页面守卫兜底。
    mutationFn: async () => {
      const account = await login(email.trim(), password)
      justLoggedIn.current = true
      let group: UserGroupKey | null = null
      try {
        group = await syncMyGroupKey()
      } catch {
        group = null
      }
      return { account, group }
    },
    onSuccess: ({ account, group }) => {
      toast.success(`欢迎回来，${account.name || account.email}`)
      void navigate({ to: group === 'reader' ? '/' : '/admin' })
    },
    onError: (e: unknown) =>
      // 封禁/未激活账号的登录会被后端以 401 拒绝，与"密码错误"同码不同义，细分文案。
      toast.error(isAccountNotActive(e) ? '该账号已被封禁，请联系站点管理员。' : describeError(e)),
  })

  return (
    <AuthShell
      title="欢迎回来"
      description="登录你的账号，管理文章或参与评论。"
      footer={
        <>
          还没有账号？{' '}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            免费注册
          </Link>
        </>
      }
    >
      {oauth === 'failed' ? (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-5 text-destructive">
          GitHub 登录没有完成，请重试或改用邮箱密码登录。
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">密码</Label>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="你的密码"
          />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {mutation.isPending ? '登录中…' : '登录'}
        </Button>
      </form>
      <div className="mt-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">或</span>
        <Separator className="flex-1" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="mt-6 w-full"
        disabled={githubPending}
        onClick={() => void handleGithubLogin()}
      >
        {githubPending ? <Loader2 className="size-4 animate-spin" /> : <Github />}
        {githubPending ? '正在跳转 GitHub…' : '使用 GitHub 登录'}
      </Button>
    </AuthShell>
  )
}

import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthShell } from '#/components/auth-shell'
import { PasswordInput } from '#/components/password-input'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { describeError } from '#/lib/errors'
import { settingsFromMatches } from '#/lib/site-settings'
import { syncMyGroupKey } from '#/lib/user-group-client'
import type { UserGroupKey } from '#/lib/user-groups'
import { login, useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/login')({
  head: ({ matches }) => ({
    meta: [
      { title: `登录 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: LoginPage,
})

function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 区分"本次登录成功"与"带着已有会话误入本页"：前者由 onSuccess 按组分流，
  // 后者直接回首页（读者组不该被送进写作台）。
  const justLoggedIn = useRef(false)

  useEffect(() => {
    if (auth.status === 'signedIn' && !justLoggedIn.current) void navigate({ to: '/' })
  }, [auth.status, navigate])

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
    onError: (e: unknown) => toast.error(describeError(e)),
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
    </AuthShell>
  )
}

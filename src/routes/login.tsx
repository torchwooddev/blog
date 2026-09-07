import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { publicConfig } from '#/lib/config'
import { describeError } from '#/lib/errors'
import { login, useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: `登录 · ${publicConfig.siteName}` }] }),
  component: LoginPage,
})

function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (auth.status === 'signedIn') void navigate({ to: '/admin' })
  }, [auth.status, navigate])

  const mutation = useMutation({
    // 登录/注册是浏览器直连 Torchwood Client API（终端用户 JWT），不经过应用服务器。
    mutationFn: () => login(email.trim(), password),
    onSuccess: (account) => {
      toast.success(`欢迎回来，${account.name || account.email}`)
      void navigate({ to: '/admin' })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  return (
    <div className="mx-auto max-w-sm py-10">
      <Card>
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>
            凭证由 Torchwood Client API 签发（JWT 自动保存在本站、随请求携带）。
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? '登录中……' : '登录'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            还没有账号？{' '}
            <Link to="/register" className="text-primary underline-offset-4 hover:underline">
              注册
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

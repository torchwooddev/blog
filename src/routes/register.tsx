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
import { register, useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/register')({
  head: () => ({ meta: [{ title: `注册 · ${publicConfig.siteName}` }] }),
  component: RegisterPage,
})

function RegisterPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (auth.status === 'signedIn') void navigate({ to: '/admin' })
  }, [auth.status, navigate])

  const mutation = useMutation({
    // account.signUp：注册即登录（AuthResult 携带 token bundle，SDK 自动持有）。
    mutationFn: () => register(email.trim(), password, name.trim() || email.trim()),
    onSuccess: (account) => {
      toast.success(`欢迎，${account.name || account.email}！你已登录，可以开始写作。`)
      void navigate({ to: '/admin' })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  return (
    <div className="mx-auto max-w-sm py-10">
      <Card>
        <CardHeader>
          <CardTitle>注册</CardTitle>
          <CardDescription>
            注册后你就是作者：可以在作者台创建草稿（只有你能看见）并发布。
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
              <Label htmlFor="name">昵称</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="你的名字" />
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
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? '注册中……' : '注册并登录'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            已有账号？{' '}
            <Link to="/login" className="text-primary underline-offset-4 hover:underline">
              登录
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

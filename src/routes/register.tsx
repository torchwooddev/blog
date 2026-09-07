import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthShell } from '#/components/auth-shell'
import { PasswordInput } from '#/components/password-input'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { publicConfig } from '#/lib/config'
import { describeError } from '#/lib/errors'
import { register, useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/register')({
  head: () => ({
    meta: [
      { title: `注册 · ${publicConfig.siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
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
    // 注册即登录：成功后自动进入写作台。
    mutationFn: () => register(email.trim(), password, name.trim() || email.trim()),
    onSuccess: (account) => {
      toast.success(`欢迎，${account.name || account.email}！你已登录，可以开始写作。`)
      void navigate({ to: '/admin' })
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  return (
    <AuthShell
      title="创建账号"
      description="注册后即可写作：草稿仅自己可见，发布后公开。"
      footer={
        <>
          已有账号？{' '}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            直接登录
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
    </AuthShell>
  )
}

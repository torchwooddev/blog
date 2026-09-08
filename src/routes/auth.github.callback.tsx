import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthShell } from '#/components/auth-shell'
import { Button } from '#/components/ui/button'
import { describeError } from '#/lib/errors'
import { settingsFromMatches } from '#/lib/site-settings'
import { syncMyGroupKey } from '#/lib/user-group-client'
import type { UserGroupKey } from '#/lib/user-groups'
import { completeGithubLogin } from '#/lib/torchwood-client'

/**
 * GitHub OAuth 回跳页（网关带 code/state 重定向回来）：
 * 用 code 换会话 → 落组 → 按组分流，与 login.tsx 的成功路径一致。
 * GitHub 授权码一次性，用 ref 挡住 StrictMode/重渲染导致的二次交换。
 */
export const Route = createFileRoute('/auth/github/callback')({
  head: ({ matches }) => ({
    meta: [
      { title: `GitHub 登录 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { code?: string; state?: string } => {
    const code = search['code']
    const state = search['state']
    return {
      code: typeof code === 'string' ? code : undefined,
      state: typeof state === 'string' ? state : undefined,
    }
  },
  component: GithubCallbackPage,
})

function GithubCallbackPage() {
  const navigate = useNavigate()
  const { code, state } = Route.useSearch()
  const exchanged = useRef(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const account = await completeGithubLogin(code!, state!)
      // 与密码登录同一套落组与分流：读者组回首页，其余进写作台；
      // 落组失败不阻塞（下次登录补齐），页面守卫兜底。
      let group: UserGroupKey | null = null
      try {
        group = await syncMyGroupKey()
      } catch {
        group = null
      }
      return { account, group }
    },
    onSuccess: ({ account, group }) => {
      toast.success(`欢迎，${account.name || account.email}！已通过 GitHub 登录。`)
      void navigate({ to: group === 'reader' ? '/' : '/admin' })
    },
  })

  useEffect(() => {
    if (exchanged.current || !code || !state || mutation.isPending || mutation.isSuccess) return
    exchanged.current = true
    mutation.mutate()
    // 仅在回跳参数变化时触发一次交换（exchanged ref 保证 code 只用一次）。
  }, [code, state])

  if (!code || !state) {
    return (
      <AuthShell
        title="GitHub 登录未完成"
        description="回调地址缺少授权参数，可能是因为授权被取消或链接不完整。"
        footer={
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            返回登录
          </Link>
        }
      >
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">返回重试</Link>
        </Button>
      </AuthShell>
    )
  }

  if (mutation.isError) {
    return (
      <AuthShell
        title="GitHub 登录失败"
        description={describeError(mutation.error)}
        footer={
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            返回登录
          </Link>
        }
      >
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">使用邮箱密码登录</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="正在完成 GitHub 登录"
      description="正在与认证服务交换会话，请稍候……"
      footer={
        <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
          返回首页
        </Link>
      }
    >
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    </AuthShell>
  )
}

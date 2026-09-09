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
 * GitHub OAuth 回跳页。网关完成授权换发后 302 到本页并携带
 * `#access_token=…&userId=…` fragment（token 不走服务端）。这里解析 fragment
 * 建立会话 → 落组 → 按组分流，与 login.tsx 的成功路径一致。
 * 用 ref 挡住 StrictMode/重渲染导致的重复处理；fragment 只在客户端可见，
 * SSR 输出恒为"处理中"占位。
 */
export const Route = createFileRoute('/auth/github/callback')({
  head: ({ matches }) => ({
    meta: [
      { title: `GitHub 登录 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: GithubCallbackPage,
})

function GithubCallbackPage() {
  const navigate = useNavigate()
  const exchanged = useRef(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const account = await completeGithubLogin()
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
      // token 不该留在地址栏/历史记录里，处理完立即抹掉 fragment。
      window.history.replaceState(null, '', window.location.pathname)
      toast.success(`欢迎，${account.name || account.email}！已通过 GitHub 登录。`)
      void navigate({ to: group === 'reader' ? '/' : '/admin' })
    },
  })

  useEffect(() => {
    if (exchanged.current || mutation.isPending || mutation.isSuccess) return
    exchanged.current = true
    mutation.mutate()
  }, [mutation])

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
          <Link to="/login">返回重试</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="正在完成 GitHub 登录"
      description="正在建立会话，请稍候……"
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

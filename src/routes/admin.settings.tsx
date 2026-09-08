import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Loader2, Save, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '#/components/empty-state'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import { Textarea } from '#/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { describeError } from '#/lib/errors'
import { settingsFromMatches } from '#/lib/site-settings'
import type { SiteSettings, SiteSettingsInput } from '#/lib/site-settings'
import {
  fetchAdminSiteSettings,
  saveSiteSettingsViaAdmin,
  useInvalidateSiteSettings,
} from '#/lib/site-settings-client'
import { publicConfig } from '#/lib/config'
import { useMyGroup } from '#/lib/user-group-client'
import { useAuth } from '#/lib/torchwood-client'

export const Route = createFileRoute('/admin/settings')({
  head: ({ matches }) => ({
    meta: [
      { title: `站点设置 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminSettingsPage,
})

function AdminSettingsPage() {
  const auth = useAuth()
  if (auth.status === 'restoring') return <SettingsSkeleton />
  if (auth.status === 'signedOut' || !auth.account) return <Navigate to="/login" replace />
  return <AdminSettingsHome viewerId={auth.account.id} />
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <Skeleton className="h-9 w-36" />
      <div className="space-y-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}

/** 管理员专用页：非管理员看不到合法入口，直连 URL 会被服务端判权拒绝。 */
function AdminSettingsHome({ viewerId }: { viewerId: string }) {
  const group = useMyGroup(viewerId)
  const settingsQuery = useQuery({
    queryKey: ['admin', 'site-settings'],
    queryFn: fetchAdminSiteSettings,
    enabled: group.data === 'admin',
  })

  if (group.isPending) return <SettingsSkeleton />
  // 仅管理员可进；读者/作者回写作台。
  if (group.data !== 'admin') {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={ShieldAlert}
          title="需要管理员组权限"
          description="站点设置只对管理员组开放。"
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/admin">
                <ArrowLeft className="size-4" />
                返回写作台
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">站点设置</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {settingsQuery.isLoading
              ? '加载中…'
              : settingsQuery.data?.customized
                ? '以下为当前生效的配置，保存后立即生效。'
                : '尚未自定义过配置，以下为环境变量/内置默认值，保存后持久化到数据库。'}
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="rounded-full px-4">
          <Link to="/admin">
            <ArrowLeft className="size-4" />
            返回写作台
          </Link>
        </Button>
      </header>

      {settingsQuery.isLoading ? (
        <SettingsSkeleton />
      ) : settingsQuery.isError ? (
        <EmptyState
          icon={ShieldAlert}
          title="站点配置加载失败"
          description={describeError(settingsQuery.error)}
          action={
            <Button size="sm" variant="outline" onClick={() => settingsQuery.refetch()}>
              重试
            </Button>
          }
        />
      ) : settingsQuery.data ? (
        <SettingsForm settings={settingsQuery.data.settings} />
      ) : null}
    </div>
  )
}

const EMPTY_FORM: SiteSettingsInput = {
  siteName: '',
  siteDescription: '',
  siteFooterNote: '',
  postsPerPage: 5,
  commentsEnabled: true,
}

function SettingsForm({ settings }: { settings: SiteSettings }) {
  const invalidate = useInvalidateSiteSettings()
  const [form, setForm] = useState<SiteSettingsInput>(EMPTY_FORM)

  // 服务端数据到达后同步一次表单初值（仅在数据变化时，避免覆盖用户输入）。
  useEffect(() => {
    setForm({
      siteName: settings.siteName,
      siteDescription: settings.siteDescription,
      siteFooterNote: settings.siteFooterNote,
      postsPerPage: settings.postsPerPage,
      commentsEnabled: settings.commentsEnabled,
    })
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => saveSiteSettingsViaAdmin(form),
    onSuccess: (saved) => {
      toast.success('站点设置已保存')
      setForm({
        siteName: saved.siteName,
        siteDescription: saved.siteDescription,
        siteFooterNote: saved.siteFooterNote,
        postsPerPage: saved.postsPerPage,
        commentsEnabled: saved.commentsEnabled,
      })
      invalidate()
    },
    onError: (e: unknown) => toast.error(describeError(e)),
  })

  const set = <K extends keyof SiteSettingsInput>(key: K, value: SiteSettingsInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!saveMutation.isPending) saveMutation.mutate()
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="settings-site-name">站点名称</Label>
        <Input
          id="settings-site-name"
          value={form.siteName}
          maxLength={60}
          onChange={(e) => set('siteName', e.target.value)}
          placeholder="显示在站头、页脚与浏览器标题"
        />
        <p className="text-xs text-muted-foreground">留空则回退环境变量配置（当前：{publicConfig.siteName || '未设置'}）。</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-site-description">站点简介</Label>
        <Textarea
          id="settings-site-description"
          value={form.siteDescription}
          maxLength={200}
          rows={3}
          onChange={(e) => set('siteDescription', e.target.value)}
          placeholder="首页开篇、SEO description 与 RSS 频道描述"
        />
        <p className="text-xs text-muted-foreground">{form.siteDescription.length}/200 字符。</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-site-footer-note">页脚附注</Label>
        <Input
          id="settings-site-footer-note"
          value={form.siteFooterNote}
          maxLength={120}
          onChange={(e) => set('siteFooterNote', e.target.value)}
          placeholder="备案号 / 版权附注（可选）"
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="settings-posts-per-page">每页文章数</Label>
          <Input
            id="settings-posts-per-page"
            type="number"
            min={1}
            max={50}
            step={1}
            value={Number.isFinite(form.postsPerPage) ? form.postsPerPage : ''}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10)
              set('postsPerPage', Number.isNaN(parsed) ? Number.NaN : parsed)
            }}
          />
          <p className="text-xs text-muted-foreground">首页、分类、标签与搜索列表共用（1~50）。</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-comments-enabled">文章评论</Label>
          <Select
            value={form.commentsEnabled ? 'open' : 'closed'}
            onValueChange={(value) => set('commentsEnabled', value === 'open')}
          >
            <SelectTrigger id="settings-comments-enabled" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">开放</SelectItem>
              <SelectItem value="closed">关闭</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">关闭后文章页隐藏评论区与评论计数。</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-5">
        <Button type="submit" size="sm" className="rounded-full px-5" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存设置
        </Button>
      </div>
    </form>
  )
}

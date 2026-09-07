import { publicConfig } from '#/lib/config'

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="container mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground">
        <p>
          {publicConfig.siteName} · 数据与认证由 Torchwood 托管 · 浏览器直连 Client API，SSR 走 Server API
        </p>
        <p className="text-xs">
          Torchwood 端点：<code className="rounded bg-muted px-1">{publicConfig.endpoint}</code>
          （项目 <code className="rounded bg-muted px-1">{publicConfig.projectId}</code>）
        </p>
      </div>
    </footer>
  )
}

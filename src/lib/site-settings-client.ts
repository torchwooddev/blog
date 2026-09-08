import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import {
  SITE_SETTINGS_FALLBACK,
  type SiteSettings,
  type SiteSettingsInput,
} from './site-settings'
import { authedHeaders } from './authed-call'
import {
  getAdminSiteSettings,
  getSiteSettings,
  updateSiteSettings,
} from '#/server/site-settings.functions'

/**
 * 站点配置的客户端封装。
 *
 * 公开读（无鉴权）由 root loader ensureQueryData 预取——SSR 首屏即拿到 DB 值，
 * hydration 后组件经 useSiteSettings 消费同一份缓存；读取失败（DB 不可用）时
 * data 为 undefined，组件回退 env 值渲染，行为与接入配置表之前一致。
 */

export const siteSettingsOptions = () =>
  queryOptions({
    queryKey: ['site-settings'],
    queryFn: () => getSiteSettings(),
    staleTime: 30_000,
  })

/** 生效站点配置：loading / 失败时同步回退 env 兜底，调用方无需判空。 */
export function useSiteSettings(): SiteSettings {
  const query = useQuery(siteSettingsOptions())
  return query.data ?? SITE_SETTINGS_FALLBACK
}

/** 管理页数据（服务端校验管理员组；非管理员返回 {ok:false}）。失败时抛错。 */
export async function fetchAdminSiteSettings(): Promise<{ settings: SiteSettings; customized: boolean }> {
  const headers = await authedHeaders()
  const result = await getAdminSiteSettings({ headers })
  if (!result.ok) throw new Error(result.message)
  return { settings: result.settings, customized: result.customized }
}

/** 保存站点配置（管理员专用）。成功后失效公开缓存，全站立即读到新值。失败时抛错。 */
export async function saveSiteSettingsViaAdmin(input: SiteSettingsInput): Promise<SiteSettings> {
  const headers = await authedHeaders()
  const result = await updateSiteSettings({ data: input, headers })
  if (!result.ok) throw new Error(result.message)
  return result.settings
}

/** 保存成功后调用：让 header/footer 等订阅者立即拿到新值。 */
export function useInvalidateSiteSettings(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['site-settings'] })
  }
}

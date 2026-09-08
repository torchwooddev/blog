import { createServerFn } from '@tanstack/react-start'
import type { SiteSettings, SiteSettingsInput } from '#/lib/site-settings'
import { requireAdmin } from './auth.server'
import { fetchSiteSettings, fetchSiteSettingsWithRaw, saveSiteSettings } from './site-settings.server'

/**
 * 站点配置的 server functions。
 *
 * - getSiteSettings（GET，无鉴权）：公开读——配置值本身就是页面上展示的公开
 *   内容（站点名/简介等），settings 集合不开 read:any，输出面由这里白名单控制。
 * - getAdminSiteSettings / updateSiteSettings（POST）：管理员专用——handler 入口
 *   走 requireAdmin（终端用户 JWT + 管理员组成员，B-01 同款纪律），调用点需经
 *   authedHeaders 附带 Authorization 头。
 */

export const getSiteSettings = createServerFn({ method: 'GET' })
  .validator((input: unknown) => (input ?? {}) as Record<string, never>)
  .handler(async (): Promise<SiteSettings> => fetchSiteSettings())

export interface AdminSiteSettingsResult {
  ok: true
  /** 生效值（DB 覆盖层 + env 兜底）。 */
  settings: SiteSettings
  /** 是否已保存过自定义配置（false = 当前全部来自 env 兜底）。 */
  customized: boolean
}

export type AdminSettingsResult = AdminSiteSettingsResult | { ok: false; message: string }

export const getAdminSiteSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => (input ?? {}) as Record<string, never>)
  .handler(async (): Promise<AdminSettingsResult> => {
    const auth = await requireAdmin()
    if (!auth.ok) return auth
    const { raw, value } = await fetchSiteSettingsWithRaw()
    return { ok: true, settings: value, customized: raw !== null }
  })

export type UpdateSettingsResult = { ok: true; settings: SiteSettings } | { ok: false; message: string }

export const updateSiteSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as Partial<SiteSettingsInput>
    return {
      siteName: typeof raw.siteName === 'string' ? raw.siteName : '',
      siteDescription: typeof raw.siteDescription === 'string' ? raw.siteDescription : '',
      siteFooterNote: typeof raw.siteFooterNote === 'string' ? raw.siteFooterNote : '',
      postsPerPage: typeof raw.postsPerPage === 'number' ? raw.postsPerPage : Number.NaN,
      commentsEnabled: raw.commentsEnabled === true,
    }
  })
  .handler(async ({ data }): Promise<UpdateSettingsResult> => {
    const auth = await requireAdmin()
    if (!auth.ok) return auth
    try {
      const settings = await saveSiteSettings(data)
      return { ok: true, settings }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

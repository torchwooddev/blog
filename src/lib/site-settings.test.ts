import { describe, expect, it } from 'vitest'
import {
  parseRawSiteSettings,
  rawHasAnyValue,
  resolveSiteSettings,
  siteSettingsToData,
  validateSiteSettingsInput,
} from './site-settings'

describe('parseRawSiteSettings', () => {
  it('识别类型正确的 key', () => {
    const raw = parseRawSiteSettings({
      site_name: 'My Site',
      posts_per_page: 10,
      comments_enabled: false,
    })
    expect(raw.siteName).toBe('My Site')
    expect(raw.postsPerPage).toBe(10)
    expect(raw.commentsEnabled).toBe(false)
  })

  it('缺失/类型不符的 key 视为未设置（undefined）', () => {
    const raw = parseRawSiteSettings({
      site_name: 42,
      posts_per_page: 'not-a-number',
    })
    expect(raw.siteName).toBeUndefined()
    expect(raw.postsPerPage).toBeUndefined()
    expect(raw.commentsEnabled).toBeUndefined()
  })

  it('int64 的字符串形态（"10"）可解析', () => {
    expect(parseRawSiteSettings({ posts_per_page: '10' }).postsPerPage).toBe(10)
  })
})

describe('rawHasAnyValue', () => {
  it('空对象 = 未自定义', () => {
    expect(rawHasAnyValue(parseRawSiteSettings({}))).toBe(false)
  })
  it('任一 key 存在即视为已自定义', () => {
    expect(rawHasAnyValue(parseRawSiteSettings({ comments_enabled: true }))).toBe(true)
  })
})

describe('resolveSiteSettings', () => {
  const fallback = {
    siteName: 'Env Site',
    siteDescription: 'env description',
    siteFooterNote: 'ICP-000',
    postsPerPage: 5,
    commentsEnabled: true,
  }

  it('key 缺失回退 env 兜底', () => {
    expect(resolveSiteSettings({}, fallback)).toEqual(fallback)
  })

  it('key 存在（含空串）一律以 DB 值生效——"清空"可表达', () => {
    const resolved = resolveSiteSettings(
      { siteName: 'DB Site', siteFooterNote: '', commentsEnabled: false },
      fallback,
    )
    expect(resolved.siteName).toBe('DB Site')
    expect(resolved.siteFooterNote).toBe('')
    expect(resolved.commentsEnabled).toBe(false)
    // 未覆盖的字段仍回退
    expect(resolved.siteDescription).toBe(fallback.siteDescription)
    expect(resolved.postsPerPage).toBe(fallback.postsPerPage)
  })

  it('非法 postsPerPage（0/负数/非整数）不生效', () => {
    expect(resolveSiteSettings({ postsPerPage: 0 }, fallback).postsPerPage).toBe(5)
    expect(resolveSiteSettings({ postsPerPage: -3 }, fallback).postsPerPage).toBe(5)
    expect(resolveSiteSettings({ postsPerPage: 2.5 }, fallback).postsPerPage).toBe(5)
    expect(resolveSiteSettings({ postsPerPage: 20 }, fallback).postsPerPage).toBe(20)
  })
})

describe('validateSiteSettingsInput', () => {
  it('trim + 合法值通过', () => {
    const result = validateSiteSettingsInput({
      siteName: '  Site  ',
      siteDescription: ' desc ',
      siteFooterNote: '',
      postsPerPage: 8,
      commentsEnabled: true,
    })
    expect(result).toEqual({
      ok: true,
      value: {
        siteName: 'Site',
        siteDescription: 'desc',
        siteFooterNote: '',
        postsPerPage: 8,
        commentsEnabled: true,
      },
    })
  })

  it('长度与范围拒绝', () => {
    const base = { siteDescription: '', siteFooterNote: '', postsPerPage: 5, commentsEnabled: false }
    expect(validateSiteSettingsInput({ ...base, siteName: 'x'.repeat(61) }).ok).toBe(false)
    expect(
      validateSiteSettingsInput({ ...base, siteName: 's', siteDescription: 'd'.repeat(201) }).ok,
    ).toBe(false)
    expect(validateSiteSettingsInput({ ...base, siteName: 's', postsPerPage: 0 }).ok).toBe(false)
    expect(validateSiteSettingsInput({ ...base, siteName: 's', postsPerPage: 51 }).ok).toBe(false)
    expect(validateSiteSettingsInput({ ...base, siteName: 's', postsPerPage: 1.5 }).ok).toBe(false)
  })
})

describe('siteSettingsToData', () => {
  it('全量 key 写入（保存动作声明"以表单为准"）', () => {
    const data = siteSettingsToData({
      siteName: 'S',
      siteDescription: '',
      siteFooterNote: '',
      postsPerPage: 7,
      commentsEnabled: false,
    })
    expect(data).toEqual({
      site_name: 'S',
      site_description: '',
      site_footer_note: '',
      posts_per_page: 7,
      comments_enabled: false,
    })
  })
})

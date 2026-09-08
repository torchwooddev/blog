import { describe, expect, it } from 'vitest'
import {
  parseSettingDoc,
  rawHasAnyValue,
  rawSiteSettingsFromMap,
  resolveSiteSettings,
  rowsFromInput,
  rowsFromLegacyData,
  settingDocId,
  settingMapFromDocs,
  validateSiteSettingsInput,
} from './site-settings'

describe('parseSettingDoc / settingMapFromDocs', () => {
  it('识别合法 KV 行：value 为 JSON 编码字符串', () => {
    expect(parseSettingDoc({ key: 'site_name', value: '"My Site"' })).toEqual({
      key: 'site_name',
      value: 'My Site',
    })
    expect(parseSettingDoc({ key: 'posts_per_page', value: '10' })).toEqual({
      key: 'posts_per_page',
      value: 10,
    })
  })

  it('key/value 形态不对或非法 JSON 返回 null（单行损坏不影响其余）', () => {
    expect(parseSettingDoc({ key: '', value: '"x"' })).toBeNull()
    expect(parseSettingDoc({ key: 'k', value: 42 })).toBeNull()
    expect(parseSettingDoc({ key: 'k' })).toBeNull()
    expect(parseSettingDoc({ key: 'k', value: '{not-json' })).toBeNull()
  })

  it('settingMapFromDocs 聚合多行并跳过损坏行', () => {
    const map = settingMapFromDocs([
      { data: { key: 'site_name', value: '"S"' } },
      { data: { key: 'broken', value: '{oops' } },
      { data: { key: 'comments_enabled', value: 'false' } },
      { data: { other: 1 } },
    ])
    expect(map.get('site_name')).toBe('S')
    expect(map.get('comments_enabled')).toBe(false)
    expect(map.has('broken')).toBe(false)
    expect(map.size).toBe(2)
  })
})

describe('settingDocId', () => {
  it('由 key 派生文档 id', () => {
    expect(settingDocId('site_name')).toBe('setting-site_name')
  })
})

describe('rawSiteSettingsFromMap / rawHasAnyValue', () => {
  it('只认类型正确的已知键，缺失视为 undefined', () => {
    const map = settingMapFromDocs([
      { data: { key: 'site_name', value: '"My Site"' } },
      { data: { key: 'posts_per_page', value: '"10"' } },
      { data: { key: 'unknown_future_key', value: '"whatever"' } },
    ])
    const raw = rawSiteSettingsFromMap(map)
    expect(raw.siteName).toBe('My Site')
    expect(raw.postsPerPage).toBe(10)
    expect(raw.commentsEnabled).toBeUndefined()
    expect(raw.siteDescription).toBeUndefined()
  })

  it('空对象 = 未自定义；任一 key 存在即已自定义', () => {
    expect(rawHasAnyValue(rawSiteSettingsFromMap(settingMapFromDocs([])))).toBe(false)
    expect(
      rawHasAnyValue(rawSiteSettingsFromMap(settingMapFromDocs([{ data: { key: 'comments_enabled', value: 'true' } }]))),
    ).toBe(true)
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

describe('rowsFromInput', () => {
  it('全部已知键输出，value 恒为 JSON 编码字符串', () => {
    const rows = rowsFromInput({
      siteName: 'S',
      siteDescription: '',
      siteFooterNote: '',
      postsPerPage: 7,
      commentsEnabled: false,
    })
    expect(rows).toEqual([
      { key: 'site_name', value: '"S"' },
      { key: 'site_description', value: '""' },
      { key: 'site_footer_note', value: '""' },
      { key: 'posts_per_page', value: '7' },
      { key: 'comments_enabled', value: 'false' },
    ])
  })
})

describe('rowsFromLegacyData（列式单例 → KV 迁移导入）', () => {
  it('类型正确的列导入为 KV 行', () => {
    const rows = rowsFromLegacyData({
      site_name: 'Old Site',
      site_footer_note: '',
      posts_per_page: 8,
      comments_enabled: false,
    })
    expect(rows).toEqual([
      { key: 'site_name', value: '"Old Site"' },
      { key: 'site_footer_note', value: '""' },
      { key: 'posts_per_page', value: '8' },
      { key: 'comments_enabled', value: 'false' },
    ])
  })

  it('缺失/类型不符的列跳过；int64 字符串形态可解析', () => {
    const rows = rowsFromLegacyData({ posts_per_page: '12' })
    expect(rows).toEqual([{ key: 'posts_per_page', value: '12' }])
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

/** 展示层格式化（RFC3339 → 本地可读）。 */

/**
 * 展示时区固定为 Asia/Shanghai：SSR 与浏览器 hydration 必须产出逐字符相同的日期文本，
 * 否则文本比对失败，React 丢弃服务端 HTML 整页回退客户端渲染（生产报 minified #422）。
 * 服务端时区不可控（Workers 恒为 UTC、Docker 默认 UTC），因此展示格式一律显式传
 * timeZone，禁止依赖宿主本地时区的 toLocaleDateString / getFullYear。
 */
const DISPLAY_TIME_ZONE = 'Asia/Shanghai'

export function formatDate(iso: string | null): string {
  if (!iso) return '草稿'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '草稿'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  })
}

/** 归档分组用：年份（如 "2026"）。非法日期返回空串，调用方据此跳过该条。 */
export function formatYear(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return (
    new Intl.DateTimeFormat('zh-CN', { year: 'numeric', timeZone: DISPLAY_TIME_ZONE })
      .formatToParts(d)
      .find((part) => part.type === 'year')?.value ?? ''
  )
}

/** 归档列表用：月日（如 "9月6日"）。非法日期返回空串。 */
export function formatMonthDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  })
}

/** 页脚版权年份（同展示时区，避免跨年时刻 SSR 与浏览器年份不一致）。 */
export function currentYear(): string {
  return (
    new Intl.DateTimeFormat('zh-CN', { year: 'numeric', timeZone: DISPLAY_TIME_ZONE })
      .formatToParts(new Date())
      .find((part) => part.type === 'year')?.value ?? ''
  )
}

/** 相对时间（评论/列表用）：1 小时内、24 小时内、30 天内、超过则回退绝对日期。 */
export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return formatDate(iso)
}

/** HTML meta 用的时间格式（保持 RFC3339 原样即可）。 */
export function isoNow(): string {
  return new Date().toISOString()
}

/** 字节数 → 可读大小（附件列表用）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unit = 'B'
  for (const u of units) {
    if (value < 1024) break
    value /= 1024
    unit = u
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`
}

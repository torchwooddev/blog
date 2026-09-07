/** 展示层格式化（RFC3339 → 本地可读）。 */

export function formatDate(iso: string | null): string {
  if (!iso) return '草稿'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
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
  })
}

/** HTML meta 用的时间格式（保持 RFC3339 原样即可）。 */
export function isoNow(): string {
  return new Date().toISOString()
}

import { renderMarkdown } from './markdown'

/**
 * 文章展示侧的纯函数工具：阅读时长、目录提取、标题锚点。
 * 全部为确定性纯函数，SSR 与客户端各跑一遍结果一致（无 hydration 风险）。
 */

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

/** 标题文本 → 锚点 id（与 renderMarkdown 注入的 id 用同一实现）。 */
export function headingId(text: string, seen?: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '-')
    .replace(/[^\p{L}\p{N}.-]+/gu, '')
    .replace(/-+$/g, '')
  const id = base || 'section'
  if (!seen) return id
  const count = seen.get(id) ?? 0
  seen.set(id, count + 1)
  return count === 0 ? id : `${id}-${count}`
}

/**
 * 从 markdown 源码提取 h2/h3 目录。
 * 忽略代码块内的 # 行（fenced code），与渲染结果一致。
 */
export function extractToc(markdown: string): TocItem[] {
  const seen = new Map<string, number>()
  const items: TocItem[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue
    const text = match[2]?.replace(/`/g, '').trim() ?? ''
    if (!text) continue
    items.push({
      id: headingId(text, seen),
      text,
      level: match[1]?.length === 2 ? 2 : 3,
    })
  }
  return items
}

/**
 * 给渲染后的 HTML 里的 h2/h3 注入 id 与锚链接。
 * renderMarkdown 已完成消毒；这里只添加自生成的安全 id（字母/数字/连字符/CJK），
 * 因此不需要进入消毒白名单。
 */
export function addHeadingAnchors(html: string): string {
  return html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (whole, level: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '')
    const id = headingId(text)
    if (!id) return whole
    return `<h${level} id="${id}">${inner}<a class="heading-anchor" href="#${id}" aria-label="链接到这一节">#</a></h${level}>`
  })
}

/** 纯文本长度（剥离 markdown 标记与代码块后的可见字符数）。 */
function plainTextLength(markdown: string): { cjk: number; words: number } {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]+/g, ' ')
  const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length
  const latin = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ')
  const words = latin.split(/\s+/).filter(Boolean).length
  return { cjk, words }
}

export function countWords(markdown: string): number {
  const { cjk, words } = plainTextLength(markdown)
  return cjk + words
}

/** 阅读时长（分钟）：中文约 400 字/分钟，英文约 200 词/分钟，至少 1 分钟。 */
export function readingMinutes(markdown: string): number {
  const { cjk, words } = plainTextLength(markdown)
  return Math.max(1, Math.ceil(cjk / 400 + words / 200))
}

/** 渲染管线（消毒 + 标题锚点）—— 文章页与编辑器预览共用。 */
export function renderArticleHtml(markdown: string): string {
  return addHeadingAnchors(renderMarkdown(markdown))
}

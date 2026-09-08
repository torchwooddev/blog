import { useEffect, useState } from 'react'
import { ListTree } from 'lucide-react'
import { cn } from 'cn'
import type { TocItem } from '#/lib/post-utils'

/**
 * 文章目录（xl 以上屏幕显示），滚动监听高亮当前小节。
 * 监听用「最后一个滚过顶部阈值 的标题」策略，比 IntersectionObserver 多元素交叠更直观。
 */
export function PostToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (items.length === 0) return
    let frame = 0
    const update = () => {
      frame = 0
      let current: string | null = null
      for (const item of items) {
        const el = document.getElementById(item.id)
        if (!el) continue
        if (el.getBoundingClientRect().top <= 100) current = item.id
        else break
      }
      setActiveId(current ?? items[0]?.id ?? null)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [items])

  if (items.length === 0) return null

  return (
    <nav aria-label="目录" className="space-y-3 text-sm">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <ListTree className="size-3.5" />
        目录
      </h2>
      <ul className="space-y-px border-l">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })
              }}
              className={cn(
                '-ml-px block border-l-2 py-1 transition-colors',
                item.level === 3 ? 'pl-6' : 'pl-3',
                activeId === item.id
                  ? 'border-brand font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <span className="line-clamp-2">{item.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

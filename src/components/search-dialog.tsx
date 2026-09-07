import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CornerDownLeft, FileText, Loader2, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { formatRelative } from '#/lib/format'
import { searchPostsOptions } from '#/lib/query-options'
import { excerpt } from '#/lib/types'

/**
 * 全站搜索弹窗（⌘K / Ctrl+K 唤起）。
 * 输入防抖 300ms 后查询标题/正文子串匹配；回车跳转 /search 查看完整结果页。
 */

const DEBOUNCE_MS = 300
const PREVIEW_COUNT = 6

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term, DEBOUNCE_MS)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 打开时聚焦并清空上一次的词（对话框是常驻组件，状态跨开关保留体验更连贯：保留）。
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  // 全局快捷键 ⌘K / Ctrl+K。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenChange])

  const results = useQuery({
    ...searchPostsOptions(debounced),
    enabled: open && debounced.trim().length > 0,
    placeholderData: (prev) => prev,
  })
  const items = debounced.trim() ? (results.data?.items ?? []) : []

  const go = (path: string) => {
    onOpenChange(false)
    void navigate({ to: path })
  }

  const submit = () => {
    const q = term.trim()
    if (!q) return
    go(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[12%] max-w-xl translate-y-0 gap-0 p-0 sm:top-[12%]">
        <DialogHeader className="sr-only">
          <DialogTitle>搜索文章</DialogTitle>
          <DialogDescription>按标题或正文内容搜索已发布的文章</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="搜索文章…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {results.isFetching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
              ESC
            </kbd>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="搜索结果">
          {debounced.trim() === '' ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              输入关键词，按标题或正文搜索已发布的文章
            </p>
          ) : items.length === 0 && !results.isFetching ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              没有找到与「{debounced.trim()}」相关的文章
            </p>
          ) : (
            <>
              {items.slice(0, PREVIEW_COUNT).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => go(`/posts/${post.slug}`)}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{post.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {excerpt(post.content, 80)}
                    </span>
                  </span>
                  {post.publishedAt ? (
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                      {formatRelative(post.publishedAt)}
                    </span>
                  ) : null}
                </button>
              ))}
              <div className="flex items-center justify-between px-3 py-2">
                <Button variant="ghost" size="sm" onClick={submit}>
                  <CornerDownLeft className="size-3.5" />
                  查看全部结果
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

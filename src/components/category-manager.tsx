import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { categoriesOptions } from '#/lib/query-options'
import { slugify } from '#/lib/types'
import { createCategory, deleteCategory } from '#/server/admin.functions'

/**
 * 分类管理：读走公开 Server 面（任何人可读），写只经 Server 面函数（API Key 专属）。
 * 删除执行"引用完整性删除协议"：计数 → 拒绝/迁移 → 带 OCC 版本删除。
 */
export function CategoryManager({ onChange }: { onChange: () => void }) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesOptions())
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [inUseCount, setInUseCount] = useState<number | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] })
    onChange()
  }

  const createMutation = useMutation({
    mutationFn: () => createCategory({ data: { name: name.trim(), slug: slug.trim() } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success('分类已创建')
        setName('')
        setSlug('')
        invalidate()
      } else {
        toast.error(result.message)
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) => deleteCategory({ data: { categoryId } }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success('分类已删除（删除协议完成）')
        setPendingDelete(null)
        setInUseCount(null)
        invalidate()
      } else if (result.reason === 'IN_USE') {
        // 协议的"拒绝"分支：仍有已发布文章引用。作者需先在编辑器里迁移自己的文章。
        setInUseCount(result.count)
      } else if (result.reason === 'NOT_FOUND') {
        toast.error('分类不存在')
        setPendingDelete(null)
      } else {
        toast.error(result.message)
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">分类管理（Server 面写 · categories 只允许 API Key 写入）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="flex flex-wrap gap-2">
          {(categories.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
              <span>{c.name}</span>
              <span className="text-xs text-muted-foreground">/{c.slug}</span>
              <button
                type="button"
                aria-label={`删除分类 ${c.name}`}
                className="ml-1 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setInUseCount(null)
                  setPendingDelete({ id: c.id, name: c.name })
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && slug.trim()) createMutation.mutate()
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="cat-name" className="text-xs">
              分类名
            </Label>
            <Input
              id="cat-name"
              className="w-40"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：工程"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cat-slug" className="text-xs">
              Slug
            </Label>
            <Input
              id="cat-slug"
              className="w-40"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="eng"
            />
          </div>
          <Button type="submit" size="sm" disabled={createMutation.isPending || !name.trim() || !slug.trim()}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            新建分类
          </Button>
        </form>
      </CardContent>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
            setInUseCount(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除分类「{pendingDelete?.name}」？</DialogTitle>
            <DialogDescription>
              将执行删除协议：先统计引用该分类的已发布文章数，仍被引用则拒绝删除；
              通过后携带 OCC 版本删除分类。
            </DialogDescription>
          </DialogHeader>
          {inUseCount !== null ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <Badge variant="secondary" className="mb-1">
                协议分支：拒绝删除
              </Badge>
              <p>
                仍有 <strong>{inUseCount}</strong> 篇已发布文章引用该分类。请先在文章编辑器里把它们迁移到其他分类
                （私有草稿对服务端不可见，若存在此类引用，删除后作者侧会显示为「分类已删除」）。
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingDelete(null)
                setInUseCount(null)
              }}
            >
              关闭
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {inUseCount !== null ? '重试删除' : '执行删除协议'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

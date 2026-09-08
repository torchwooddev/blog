import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
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
import { createCategory, deleteCategory, renameCategory } from '#/server/admin.functions'
import { authedHeaders } from '#/lib/authed-call'
import type { Category } from '#/lib/types'

/**
 * 分类管理：读走公开读路径，写经服务端动作（分类只允许服务端写入）。
 * 删除执行引用完整性协议：仍被已发布文章引用时拒绝删除。
 * 写动作的服务端 handler 校验终端用户 JWT（B-01），故调用时附带 Authorization 头。
 */
export function CategoryManager({ onChange }: { onChange?: () => void }) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesOptions())
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [inUseCount, setInUseCount] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<Category | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['categories'] })
    onChange?.()
  }

  const createMutation = useMutation({
    mutationFn: async () =>
      createCategory({ data: { name: name.trim(), slug: slug.trim() }, headers: await authedHeaders() }),
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

  const renameMutation = useMutation({
    mutationFn: async () =>
      renameCategory({ data: { categoryId: renaming?.id ?? '', name: renameValue.trim() }, headers: await authedHeaders() }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success('分类已重命名')
        setRenaming(null)
        invalidate()
      } else {
        toast.error(result.message)
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) =>
      deleteCategory({ data: { categoryId }, headers: await authedHeaders() }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success('分类已删除')
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
    <section className="space-y-4 border-t pt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">分类管理</h2>
        <span className="text-xs text-muted-foreground">共 {categories.data?.length ?? 0} 个</span>
      </div>

      <ul className="flex flex-wrap gap-2">
        {(categories.data ?? []).map((c) => (
          <li
            key={c.id}
            className="group flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent/60"
          >
            <span>{c.name}</span>
            <span className="text-xs text-muted-foreground">/{c.slug}</span>
            <button
              type="button"
              aria-label={`重命名分类 ${c.name}`}
              className="ml-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              onClick={() => {
                setRenaming(c)
                setRenameValue(c.name)
              }}
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              aria-label={`删除分类 ${c.name}`}
              className="ml-0.5 text-muted-foreground transition-colors hover:text-destructive"
              onClick={() => {
                setInUseCount(null)
                setPendingDelete({ id: c.id, name: c.name })
              }}
            >
              <Trash2 className="size-3" />
            </button>
          </li>
        ))}
        {(categories.data ?? []).length === 0 ? (
          <li className="text-sm text-muted-foreground">还没有分类，先创建一个。</li>
        ) : null}
      </ul>

      <form
        className="flex flex-wrap items-end gap-2 border-t pt-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && slug.trim()) createMutation.mutate()
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="cat-name" className="text-xs text-muted-foreground">
            分类名
          </Label>
          <Input
            id="cat-name"
            className="w-40"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：工程实践"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cat-slug" className="text-xs text-muted-foreground">
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
        <Button type="submit" size="sm" className="rounded-full px-4" disabled={createMutation.isPending || !name.trim() || !slug.trim()}>
          <Plus className="size-4" />
          新建分类
        </Button>
      </form>

      {/* 重命名对话框 */}
      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名「{renaming?.name}」</DialogTitle>
            <DialogDescription>仅修改显示名称，链接地址（slug）保持不变。</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="新的分类名"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) {
                e.preventDefault()
                renameMutation.mutate()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              取消
            </Button>
            <Button disabled={renameMutation.isPending || !renameValue.trim()} onClick={() => renameMutation.mutate()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认（引用完整性协议） */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
            setInUseCount(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分类「{pendingDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {inUseCount !== null
                ? undefined
                : '如果仍有已发布文章使用该分类，删除会被拒绝；请先把相关文章迁移到其他分类。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {inUseCount !== null ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p>
                仍有 <strong>{inUseCount}</strong> 篇已发布文章在使用该分类。请先在编辑器里把它们迁移到其他分类后再删除。
              </p>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingDelete(null)
                setInUseCount(null)
              }}
            >
              关闭
            </AlertDialogCancel>
            {inUseCount === null ? (
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault()
                  if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
                }}
              >
                确认删除
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

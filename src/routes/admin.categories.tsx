import { createFileRoute } from '@tanstack/react-router'
import { CategoryManager } from '#/components/category-manager'
import { settingsFromMatches } from '#/lib/site-settings'

export const Route = createFileRoute('/admin/categories')({
  head: ({ matches }) => ({
    meta: [
      { title: `分类管理 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminCategoriesPage,
})

function AdminCategoriesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">分类管理</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          分类用于组织文章；删除仍被已发布文章引用的分类会被拒绝，需先迁移文章。
        </p>
      </header>
      <CategoryManager />
    </div>
  )
}

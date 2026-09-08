import { createFileRoute } from '@tanstack/react-router'
import { PostEditor } from '#/components/post-editor'
import { settingsFromMatches } from '#/lib/site-settings'

export const Route = createFileRoute('/admin/new')({
  head: ({ matches }) => ({
    meta: [
      { title: `新建文章 · ${settingsFromMatches(matches).siteName}` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminNewPage,
})

/** 布局路由 /admin 已完成登录与分组守卫，这里只渲染工作区内容。 */
function AdminNewPage() {
  return <PostEditor post={null} />
}

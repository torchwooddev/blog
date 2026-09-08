import { BookOpen } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/empty-state'
import { USER_GROUPS } from '#/lib/user-groups'

/**
 * 写作台的读者组提示页：读者组可以阅读与评论，但不能进入写作台。
 * 守卫本身在各 admin 路由（useMyGroup）；这里只负责把"为什么进不来"讲清楚。
 */
export function ReaderNotice() {
  return (
    <div className="mx-auto max-w-3xl">
      <EmptyState
        icon={BookOpen}
        title="读者组不可进入写作台"
        description={`你的账号是「${USER_GROUPS.reader.name}」组：${USER_GROUPS.reader.description}。如需写作，请联系站点管理员将你调整到「${USER_GROUPS.author.name}」组。`}
        action={
          <Button asChild size="sm" className="rounded-full">
            <Link to="/">返回首页</Link>
          </Button>
        }
      />
    </div>
  )
}

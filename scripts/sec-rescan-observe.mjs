// 观测分类名:检查首页/归档页的 category 渲染 + 直接查询 torchwood client 面
import { Torchwood } from '@torchwood/sdk'
import { toJSONAsync, fromCrossJSON } from 'seroval'

const BASE = 'https://torchwood-blog-dev.deeploop.run'
const GATEWAY = 'https://torchwood-dev.deeploop.run'

// 直接读 client 面公开分类(read:any,匿名可读)
const tw = Torchwood.create({ endpoint: GATEWAY, projectId: 'blog' })
const cats = await tw.databases.listDocuments('blog', 'categories', { query: { pageSize: 50 } })
for (const d of cats.documents) {
  console.log('category:', d.id, '| name =', JSON.stringify(d.data?.name ?? d.name), '| slug =', d.data?.slug ?? d.slug)
}

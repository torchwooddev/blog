import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * Markdown → 已消毒 HTML（双面可用：SSR 在 Node，预览在浏览器）。
 * 选型说明：unified/rehype 管线是纯 ESM、无 jsdom 依赖，可安全进入 Nitro 的
 * SSR 产物；DOMPurify 系（isomorphic-dompurify）在打包后引用 __dirname 会炸。
 * 消毒白名单 = rehype-sanitize 默认 schema（GitHub 风格），脚本/事件属性一律剥除。
 */

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'video'],
    attributes: {
      ...defaultSchema.attributes,
      code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]],
      span: [...(defaultSchema.attributes?.span ?? []), ['className', /^language-./]],
    },
  })
  .use(rehypeStringify)

export function renderMarkdown(markdown: string): string {
  return String(processor.processSync(markdown))
}

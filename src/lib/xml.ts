/**
 * XML 文本节点 / 属性值的转义。
 *
 * 为什么需要：用户可控内容（文章标题、slug、分类名……）用模板字符串拼进
 * XML（RSS、sitemap）时，字面 "<" 可注入任意标签（如 "</title><script>…"），
 * 裸 "&" 则会让 XML 解析直接失败。
 * 本项目所有 XML 属性统一用双引号包裹，因此五个标准实体足够；
 * 顺带转义单引号，属性改用单引号时也不会回退成注入点。
 */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

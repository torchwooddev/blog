/**
 * JSON-LD（application/ld+json）脚本内容的安全序列化。
 *
 * 为什么不能直接 JSON.stringify：<script> 标签的内容不经过 HTML 属性转义，
 * JSON 也不转义 "<"，因此字面 "</script>" 会提前闭合脚本标签，
 * 其后的内容会被浏览器当作 HTML 解析——用户可控内容（如文章标题）里带上
 * "</script><img src=y onerror=...>" 即构成存储型 XSS。
 * 把 "<" 替换为 "\u003c" 后浏览器不再看到字面 "</script>"，
 * 而 "\u003c" 在 JSON 语义上仍是 "<"，解析结果不变。
 */
export function toSafeJsonLd(value: unknown): string {
  return (
    JSON.stringify(value)
      .replace(/</g, '\\u003c')
      // U+2028 / U+2029 是合法 JSON 字符，但会被老 JS 引擎当作行终止符：
      // 在 classic script 内联执行时会直接语法错误，一并转义（语义不变）。
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
  )
}

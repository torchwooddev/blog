import { describe, expect, it } from 'vitest'
import { toSafeJsonLd } from './jsonld'

describe('toSafeJsonLd', () => {
  it('含 </script> 的内容序列化后不再出现字面 </script>（防标签提前闭合）', () => {
    const payload = {
      headline: 'PWN</script><img src=y onerror=alert(document.domain)>',
    }
    const json = toSafeJsonLd(payload)
    expect(json).not.toContain('</script')
    // "<" 被转成 \u003c，浏览器不会再把内容当 HTML 解析（">" 无需转义）
    expect(json).toContain('\\u003c/script>')
  })

  it('JSON.parse 后与原对象深相等（转义不改变 JSON 语义）', () => {
    const value = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: '标题 <b>加粗</b> & "引号" </script>',
      nested: { tags: ['a<b', 'c>d'], count: 3, ok: true, empty: null },
    }
    expect(JSON.parse(toSafeJsonLd(value))).toEqual(value)
  })

  it('U+2028 / U+2029 被转义（防老 JS 引擎按行终止符截断）', () => {
    const value = { text: '行分隔\u2028段分隔\u2029结束' }
    const json = toSafeJsonLd(value)
    expect(json).toContain('\\u2028')
    expect(json).toContain('\\u2029')
    expect(JSON.parse(json)).toEqual(value)
  })
})

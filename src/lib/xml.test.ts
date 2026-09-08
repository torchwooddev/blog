import { describe, expect, it } from 'vitest'
import { xmlEscape } from './xml'

describe('xmlEscape', () => {
  it('标签注入被中和为文本实体', () => {
    expect(xmlEscape('</title><script>alert(1)</script>')).toBe(
      '&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('裸 & 与引号被转义（属性值安全）', () => {
    expect(xmlEscape('a & b "c" \'d\'')).toBe('a &amp; b &quot;c&quot; &apos;d&apos;')
  })

  it('普通文本原样通过', () => {
    expect(xmlEscape('hello-torchwood/posts/abc-123')).toBe('hello-torchwood/posts/abc-123')
  })
})

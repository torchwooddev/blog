import { describe, expect, it } from 'vitest'
import { describeError, isVersionConflict, withOccRetry } from './errors'
import { excerpt, parseVersion, slugify } from './types'
import { renderMarkdown } from './markdown'
import { TorchwoodError } from '@torchwood/sdk'

describe('errors', () => {
  it('识别 OCC 冲突的两种网关形态', () => {
    const domainCoded = new TorchwoodError('DOCUMENT.VERSION_CONFLICT: x', 409, 'DOCUMENT.VERSION_CONFLICT')
    const wireForm = new TorchwoodError(
      'DOCUMENT.VERSION_CONFLICT: version_mismatch',
      400,
      'FailedPrecondition',
    )
    expect(isVersionConflict(domainCoded)).toBe(true)
    expect(isVersionConflict(wireForm)).toBe(true)
    expect(isVersionConflict(new Error('其他错误'))).toBe(false)
  })

  it('withOccRetry：冲突后重读版本重试一次', async () => {
    let calls = 0
    const result = await withOccRetry(
      async (version) => {
        calls++
        if (version === 1) {
          throw new TorchwoodError('DOCUMENT.VERSION_CONFLICT: version_mismatch', 400, 'FailedPrecondition')
        }
        return `ok@v${version}`
      },
      async () => 7,
      1,
    )
    expect(result).toBe('ok@v7')
    expect(calls).toBe(2)
  })

  it('describeError 产出用户可读文案', () => {
    const e = new TorchwoodError('DOCUMENT.NOT_FOUND: nope', 404, 'DOCUMENT.NOT_FOUND')
    expect(describeError(e)).toContain('不存在')
  })
})

describe('types', () => {
  it('parseVersion 兼容 number / int64 字符串 / 缺省', () => {
    expect(parseVersion(3)).toBe(3)
    expect(parseVersion('3')).toBe(3)
    expect(parseVersion(undefined)).toBe(1)
  })

  it('slugify 生成安全 slug', () => {
    expect(slugify('Hello Torchwood!')).toBe('hello-torchwood')
    expect(slugify('')).toMatch(/^post-/)
  })

  it('excerpt 剥除 markdown 标记', () => {
    expect(excerpt('# 标题\n\n**加粗** 正文')).toBe('标题 加粗 正文')
  })
})

describe('markdown', () => {
  it('渲染并消毒 HTML（脚本被剥除）', () => {
    const html = renderMarkdown('# 你好\n\n<script>alert(1)</script>')
    expect(html).toContain('<h1>你好</h1>')
    expect(html).not.toContain('<script>')
  })
})

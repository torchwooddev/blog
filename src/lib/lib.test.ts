import { describe, expect, it, afterEach, vi } from 'vitest'
import { describeError, isVersionConflict, withOccRetry } from './errors'
import { excerpt, parseVersion, slugify } from './types'
import { renderMarkdown } from './markdown'
import { TorchwoodError } from '@torchwood/sdk'
import type { PublicConfig } from './config'

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

describe('publicConfig 运行时解析', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  /** 用例必须封闭：.env / 外层 shell 的同名变量一律清空。 */
  function stubEnvEmpty(): void {
    for (const key of [
      'VITE_TORCHWOOD_ENDPOINT',
      'VITE_TORCHWOOD_PROJECT_ID',
      'VITE_SITE_NAME',
      'VITE_SITE_URL',
      'BLOG_TORCHWOOD_ENDPOINT',
      'BLOG_TORCHWOOD_PROJECT_ID',
    ]) {
      vi.stubEnv(key, '')
    }
  }

  /** publicConfig 在模块加载时求值，每个用例重置模块后重新导入。 */
  async function load(): Promise<PublicConfig> {
    vi.resetModules()
    return (await import('./config')).publicConfig
  }

  it('无任何配置时使用内置默认', async () => {
    stubEnvEmpty()
    const c = await load()
    expect(c.endpoint).toBe('http://localhost:9080')
    expect(c.projectId).toBe('blog')
    expect(c.siteName).toBe('Blog')
    expect(c.siteDescription).toBe('记录、思考与分享')
  })

  it('服务端 process.env 覆盖默认；公开值缺省时回退 BLOG_* 同名值', async () => {
    stubEnvEmpty()
    vi.stubEnv('BLOG_TORCHWOOD_ENDPOINT', 'http://torchwood-internal:9080')
    vi.stubEnv('VITE_SITE_URL', 'https://blog.example.com/')
    const c = await load()
    expect(c.endpoint).toBe('http://torchwood-internal:9080')
    expect(c.siteUrl).toBe('https://blog.example.com')
  })

  it('浏览器端 window.__APP_CONFIG__ 优先级最高', async () => {
    stubEnvEmpty()
    vi.stubGlobal('window', {
      __APP_CONFIG__: { endpoint: 'https://api.public.example.com', siteName: '注入站' },
    })
    const c = await load()
    expect(c.endpoint).toBe('https://api.public.example.com')
    expect(c.siteName).toBe('注入站')
    expect(c.projectId).toBe('blog')
  })
})

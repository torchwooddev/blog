import { describe, expect, it } from 'vitest'
import { addHeadingAnchors, countWords, extractToc, headingId, readingMinutes } from './post-utils'

describe('headingId', () => {
  it('小写化、空白转连字符、剔除标点', () => {
    expect(headingId('Hello, World!')).toBe('hello-world')
  })

  it('保留 CJK 字符', () => {
    expect(headingId('什么是 数据建模？')).toBe('什么是-数据建模')
  })

  it('空文本回退为 section', () => {
    expect(headingId('###')).toBe('section')
  })
})

describe('extractToc', () => {
  it('提取 h2/h3 并跳过代码块内的 # 行', () => {
    const md = [
      '# 顶层标题（不进目录）',
      '',
      '## 第二章',
      '',
      '```bash',
      '## 这不是标题',
      '```',
      '',
      'text',
      '### 2.1 小节',
      '#### h4 不进目录',
    ].join('\n')
    const toc = extractToc(md)
    expect(toc).toEqual([
      { id: '第二章', text: '第二章', level: 2 },
      { id: '2.1-小节', text: '2.1 小节', level: 3 },
    ])
  })

  it('同名标题生成唯一 id', () => {
    const toc = extractToc('## 背景\n\n正文\n\n## 背景')
    expect(toc.map((t) => t.id)).toEqual(['背景', '背景-1'])
  })
})

describe('addHeadingAnchors', () => {
  it('为 h2/h3 注入与 extractToc 一致的 id 和锚链接', () => {
    const html = '<h2>安装</h2><p>x</p><h3>依赖 <em>说明</em></h3>'
    const out = addHeadingAnchors(html)
    expect(out).toContain('<h2 id="安装">')
    expect(out).toContain('href="#安装"')
    expect(out).toContain('<h3 id="依赖-说明">')
  })

  it('不动 h1/h4 与其他标签', () => {
    const html = '<h1>标题</h1><h4>小标题</h4><p>段落</p>'
    expect(addHeadingAnchors(html)).toBe(html)
  })
})

describe('readingMinutes / countWords', () => {
  it('中文按字数、英文按词数混合计算', () => {
    // 400 个中文字 → 1 分钟；800 个 → 2 分钟。
    const cn400 = '字'.repeat(400)
    expect(readingMinutes(cn400)).toBe(1)
    expect(readingMinutes('字'.repeat(800))).toBe(2)
    // 200 个英文词 → 1 分钟。
    const en200 = Array.from({ length: 200 }, () => 'word').join(' ')
    expect(readingMinutes(en200)).toBe(1)
  })

  it('最少 1 分钟；代码块不计入字数', () => {
    expect(readingMinutes('短文')).toBe(1)
    expect(countWords('正文\n\n```js\nconst x = 1\n```\n')).toBe(2)
  })
})

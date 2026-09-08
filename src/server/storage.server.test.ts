import { describe, expect, it } from 'vitest'
import { extractUploadFile, MAX_UPLOAD_BYTES } from './storage.server'

/** 构造只含单个 file 字段的 multipart FormData。 */
function formWith(file: File): FormData {
  const form = new FormData()
  form.set('file', file)
  return form
}

function fileOf(name: string, type: string, size = 1): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('extractUploadFile 类型白名单（B-07）', () => {
  it('白名单内的类型按原样放行（如 image/png）', () => {
    const extracted = extractUploadFile(formWith(fileOf('cat.png', 'image/png')))
    expect(extracted).toBeInstanceOf(File)
  })

  it('image/jpg 别名按 image/jpeg 放行', () => {
    const extracted = extractUploadFile(formWith(fileOf('photo.jpg', 'image/jpg')))
    expect(extracted).toBeInstanceOf(File)
  })

  it('白名单其余成员逐一放行（pdf/txt/markdown/svg 等）', () => {
    const allowed: ReadonlyArray<readonly [string, string]> = [
      ['doc.pdf', 'application/pdf'],
      ['note.txt', 'text/plain'],
      ['post.md', 'text/markdown'],
      ['post.markdown', 'text/markdown'],
      ['icon.svg', 'image/svg+xml'],
      ['anim.gif', 'image/gif'],
      ['pic.webp', 'image/webp'],
      ['pic.avif', 'image/avif'],
      ['photo.jpeg', 'image/jpeg'],
    ]
    for (const [name, type] of allowed) {
      expect(extractUploadFile(formWith(fileOf(name, type))), `${type}`).toBeInstanceOf(File)
    }
  })

  it('活跃内容类型一律 415（xhtml/html/swf 不设例外）', () => {
    for (const [name, type] of [
      ['page.xhtml', 'application/xhtml+xml'],
      ['page.html', 'text/html'],
      ['movie.swf', 'application/x-shockwave-flash'],
      ['blob.bin', 'application/octet-stream'],
    ] as const) {
      const problem = extractUploadFile(formWith(fileOf(name, type)))
      expect(problem instanceof File).toBe(false)
      expect(problem).toMatchObject({ ok: false, status: 415 })
      if (!(problem instanceof File)) expect(problem.message).toContain('不支持的文件类型')
    }
  })

  it('MIME 与扩展名不一致即 415（各改一头都不行）', () => {
    const mismatched: ReadonlyArray<readonly [string, string]> = [
      ['fake.png', 'image/jpeg'], // MIME 合法但扩展名对不上
      ['fake.txt', 'image/png'], // 扩展名合法但 MIME 对不上
      ['noext', 'image/png'], // 无扩展名无法双确认
    ]
    for (const [name, type] of mismatched) {
      expect(extractUploadFile(formWith(fileOf(name, type))), `${type} ${name}`).toMatchObject({
        ok: false,
        status: 415,
      })
    }
  })

  it('413 大小上限仍在类型校验前生效', () => {
    const oversized = fileOf('big.png', 'image/png', MAX_UPLOAD_BYTES + 1)
    expect(extractUploadFile(formWith(oversized))).toMatchObject({ ok: false, status: 413 })
  })

  it('缺少文件字段仍 400', () => {
    expect(extractUploadFile(new FormData())).toMatchObject({ ok: false, status: 400 })
  })
})

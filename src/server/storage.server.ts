import { Torchwood } from '@torchwood/sdk'
import { parseFileRef, type FileRef } from '#/lib/types'
import { serverConfig } from './env.server'
import { ensureBlogReady, getBlogBucketId } from './provision.server'
import { getServerTorchwood } from './torchwood.server'

/**
 * Storage 附件的服务端逻辑。
 *
 * 上传走"同源代理"（POST /api/upload，server route 承接 multipart）而不是浏览器
 * 直传 Torchwood multipart 端点：网关 CORS 是站点配置驱动的（默认白名单不含
 * 开发域），代理同源免 CORS，并让"调用者必须是已登录终端用户"的校验用 SDK 完成。
 * 上传本身用 Server 面 SDK `uploadFile`（multipart，等价文档 §5.2 直传端点）。
 *
 * B-07（docs/security-audit-2026-09-08.md）：上传按 MIME + 扩展名双确认的白名单收敛，
 * 不一致即拒。决策：svg（image/svg+xml）允许——存储层对响应强制 attachment + nosniff
 * + CSP sandbox，其活跃内容风险已被沙箱化（且博客需要图标类素材）；html/htm/xhtml/swf
 * 等可直接执行的活跃类型一律拒绝，不设例外。白名单见 ALLOWED_UPLOAD_TYPES。
 */

/** 上传大小上限（demo）：10 MiB。 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** 允许上传的 MIME → 扩展名白名单（双确认：MIME 命中且扩展名一致才放行）。 */
const ALLOWED_UPLOAD_TYPES: ReadonlyMap<string, readonly string[]> = new Map([
  ['image/jpeg', ['.jpeg', '.jpg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['image/avif', ['.avif']],
  ['image/svg+xml', ['.svg']],
  ['application/pdf', ['.pdf']],
  ['text/plain', ['.txt']],
  ['text/markdown', ['.md', '.markdown']],
])

const UPLOAD_TYPE_MESSAGE =
  '不支持的文件类型：仅允许 JPEG/PNG/GIF/WebP/AVIF/SVG 图片、PDF、TXT 与 Markdown（MIME 与扩展名须一致）。'

export interface UploadCheck {
  ok: true
  userId: string
}

export interface UploadProblem {
  ok: false
  status: number
  message: string
}

/** 校验请求携带的终端用户 JWT（浏览器同源转发 Authorization 头）。 */
export async function verifyUploader(request: Request): Promise<UploadCheck | UploadProblem> {
  const bearer = request.headers.get('authorization')
  if (!bearer?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: '未登录：上传需要终端用户 JWT。' }
  }
  const accessToken = bearer.slice('Bearer '.length).trim()
  const config = serverConfig()
  const probe = Torchwood.create({
    endpoint: config.endpoint,
    projectId: config.projectId,
    accessToken,
  })
  try {
    const me = await probe.account.me()
    return { ok: true, userId: me.id }
  } catch {
    return { ok: false, status: 401, message: '登录状态无效或已过期。' }
  }
}

/** 规范化 MIME：部分客户端把 JPEG 发成 image/jpg，统一映射到 image/jpeg。 */
function normalizeMime(mime: string): string {
  const lower = mime.trim().toLowerCase()
  return lower === 'image/jpg' ? 'image/jpeg' : lower
}

/** 取小写扩展名（含点）；无基名（".png"）或无扩展名时返回 null。 */
function fileExtension(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return null
  return name.slice(dot).toLowerCase()
}

/** 解析 multipart 里的单个文件字段（大小 ≤10MiB + 类型白名单双确认）。 */
export function extractUploadFile(form: FormData): File | UploadProblem {
  const value = form.get('file')
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, status: 400, message: '缺少文件字段 file。' }
  }
  if (value.size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, message: '文件超过 10 MiB 上限（demo 限制）。' }
  }
  const allowedExtensions = ALLOWED_UPLOAD_TYPES.get(normalizeMime(value.type))
  const extension = fileExtension(value.name)
  if (!allowedExtensions || !extension || !allowedExtensions.includes(extension)) {
    return { ok: false, status: 415, message: UPLOAD_TYPE_MESSAGE }
  }
  return value
}

/** 上传到附件桶并返回展示视图。 */
export async function uploadToBlogBucket(file: File): Promise<FileRef> {
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const item = await tw.server.storage.uploadFile(getBlogBucketId(), file, file.name || 'attachment')
  return parseFileRef(item)
}

/** 解析附件 ID → FileRef（不可见/已删除的自动剔除，1:N 无外键的宽容读）。 */
export async function resolveFileRefs(fileIds: string[]): Promise<FileRef[]> {
  if (fileIds.length === 0) return []
  await ensureBlogReady()
  const tw = getServerTorchwood()
  const bucketId = getBlogBucketId()
  const refs = await Promise.all(
    fileIds.map(async (id) => {
      try {
        return parseFileRef(await tw.server.storage.getFile(bucketId, id))
      } catch {
        return null
      }
    }),
  )
  return refs.filter((r): r is FileRef => r !== null)
}

/** 删除附件（文章删除协议的级联步骤；单个失败不阻塞整体）。 */
export async function deleteFiles(fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return 0
  const tw = getServerTorchwood()
  const bucketId = getBlogBucketId()
  const results = await Promise.allSettled(
    fileIds.map((id) => tw.server.storage.deleteFile(bucketId, id)),
  )
  return results.filter((r) => r.status === 'fulfilled').length
}

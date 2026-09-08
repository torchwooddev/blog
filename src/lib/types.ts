import type { Document } from '@torchwood/sdk'
import { storageDownloadUrl, storagePreviewUrl, storageViewUrl } from './storage'

/**
 * 领域模型：把 Document 信封（data: Record<string, unknown>）解析成强类型视图。
 * 解析只做必要的形状校验 + 宽松缺省，绝不使用 any。
 */

export interface Category {
  id: string
  name: string
  slug: string
  createdAt: string
}

export interface Tag {
  id: string
  name: string
  slug: string
}

export interface Post {
  id: string
  title: string
  slug: string
  content: string
  categoryId: string
  tagIds: string[]
  /** Storage 附件（FileItem.id 列表）。 */
  attachmentIds: string[]
  /** RFC3339；null = 草稿。 */
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  /** OCC 版本（用户集合强制）。 */
  version: number
  /** 文档 ACE 回读：`read:any` ∈ permissions ⇔ 已发布可见（演示文档级 ACL）。 */
  permissions: string[]
}

export interface Comment {
  id: string
  postId: string
  content: string
  /** 评论者展示名（创建时冗余写入；历史数据可能为空）。 */
  authorId: string | null
  authorName: string | null
  createdAt: string
  version: number
}

/** Storage 文件的展示视图（URL 由 bucket+fileId 决定性构造）。 */
export interface FileRef {
  id: string
  name: string
  mimeType: string
  size: number
  isImage: boolean
  viewUrl: string
  previewUrl: string
  downloadUrl: string
}

export interface Page<T> {
  items: T[]
  /** keyset 分页：非空即可能有下一页（total 在 keyset 下不可靠）。 */
  nextCursor: string | null
}

function str(doc: Document, key: string): string {
  const v = doc.data[key]
  return typeof v === 'string' ? v : ''
}

function strArray(doc: Document, key: string): string[] {
  const v = doc.data[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function optStr(doc: Document, key: string): string | null {
  const v = doc.data[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * OCC version 归一化：protojson 对 int64 缺省值会省略字段、非缺省值序列化为
 * 字符串（"3"）。SDK 类型声明是 number，但 wire 上两种形态都会出现。
 */
export function parseVersion(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number.parseInt(v, 10)
  return 1
}

export function parseCategory(doc: Document): Category {
  return { id: doc.id, name: str(doc, 'name'), slug: str(doc, 'slug'), createdAt: doc.created_at }
}

export function parseTag(doc: Document): Tag {
  return { id: doc.id, name: str(doc, 'name'), slug: str(doc, 'slug') }
}

export function parsePost(doc: Document): Post {
  return {
    id: doc.id,
    title: str(doc, 'title'),
    slug: str(doc, 'slug'),
    content: str(doc, 'content'),
    categoryId: str(doc, 'category_id'),
    tagIds: strArray(doc, 'tag_ids'),
    attachmentIds: strArray(doc, 'attachment_ids'),
    publishedAt: optStr(doc, 'published_at'),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    version: parseVersion(doc.version),
    permissions: doc.permissions ?? [],
  }
}

export function parseComment(doc: Document): Comment {
  return {
    id: doc.id,
    postId: str(doc, 'post_id'),
    content: str(doc, 'content'),
    authorId: optStr(doc, 'author_id'),
    authorName: optStr(doc, 'author_name'),
    createdAt: doc.created_at,
    version: parseVersion(doc.version),
  }
}

/** SDK FileItem 形状（size 为 int64 字符串/number 二相）。 */
export interface RawFileItem {
  id?: unknown
  bucket_id?: unknown
  name?: unknown
  mime_type?: unknown
  size?: unknown
}

/** FileItem → FileRef：URL 由 bucket+fileId 决定性构造（公开桶匿名可读）。 */
export function parseFileRef(item: RawFileItem): FileRef {
  const id = typeof item.id === 'string' ? item.id : ''
  const bucketId = typeof item.bucket_id === 'string' ? item.bucket_id : ''
  const mime = typeof item.mime_type === 'string' ? item.mime_type : 'application/octet-stream'
  const sizeNum = typeof item.size === 'number' ? item.size : Number.parseInt(String(item.size ?? '0'), 10)
  return {
    id,
    name: typeof item.name === 'string' ? item.name : id,
    mimeType: mime,
    size: Number.isFinite(sizeNum) ? sizeNum : 0,
    isImage: mime.startsWith('image/') && mime !== 'image/svg+xml', // SVG 被网关强制附件，不内联
    viewUrl: storageViewUrl(bucketId, id),
    previewUrl: storagePreviewUrl(bucketId, id, 640),
    downloadUrl: storageDownloadUrl(bucketId, id),
  }
}

export function parsePage<T>(result: { documents: Document[]; meta?: { next_page_token?: string } }, parse: (doc: Document) => T): Page<T> {
  return {
    items: result.documents.map(parse),
    nextCursor: result.meta?.next_page_token ?? null,
  }
}

/** 判断文档 ACE 是否授予了某个主体（演示权限回读的用法）。 */
export function permissionsIncludeRole(permissions: string[], type: string, role: string): boolean {
  return permissions.some((p) => p === `${type}:${role}`)
}

/** 是否持有"我是属主"的 ACE（任一 `*:user:<id>` 授权——空 ACE 种子的属主信号）。 */
export function permissionsIncludeOwner(permissions: string[], userId: string): boolean {
  return permissions.some((p) => p.endsWith(`:user:${userId}`))
}

/** 发布 = 文档 ACE 中含 read:any（文档级 ACL 的可读信号）。 */
export function isPubliclyReadable(post: Post): boolean {
  return permissionsIncludeRole(post.permissions, 'read', 'any')
}

/** 摘要：去 markdown 标记取前 N 字。 */
export function excerpt(markdown: string, maxLen = 140): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}

/** slug 工具：作者输入中文标题时自动生成可用 slug。 */
export function slugify(input: string): string {
  return slugifyStrict(input) || `post-${Date.now().toString(36)}`
}

/**
 * slugify 的严格版：输入规整后为空（空串/纯符号）时返回空串，而不是时间戳兜底。
 * 编辑器的受控输入用这版——逐键把 "post-lxxx" 兜底值写进输入框会覆盖用户正在
 * 输入的内容（尤其 IME 组合态），是 slug 字段"打到一半出现怪值"的来源。
 */
export function slugifyStrict(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

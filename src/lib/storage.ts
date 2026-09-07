import { publicConfig } from './config'

/**
 * Storage 显示 URL 构造（纯函数，双面可用）。
 *
 * 公开桶的匿名读取需要 `?project=`（网关据此构造 GuestPrincipal）；
 * 已登录用户的 JWT 优先，`?project=` 与其共存无害。
 * view=内联（安全 MIME 白名单）；preview=服务端缩略图；download=恒附件。
 */

export function storageViewUrl(bucketId: string, fileId: string): string {
  return `${publicConfig.endpoint}/v1/storage/buckets/${bucketId}/files/${fileId}/view?project=${publicConfig.projectId}`
}

export function storagePreviewUrl(bucketId: string, fileId: string, width: number): string {
  return `${publicConfig.endpoint}/v1/storage/buckets/${bucketId}/files/${fileId}/preview?width=${width}&project=${publicConfig.projectId}`
}

export function storageDownloadUrl(bucketId: string, fileId: string): string {
  return `${publicConfig.endpoint}/v1/storage/buckets/${bucketId}/files/${fileId}/download?project=${publicConfig.projectId}`
}

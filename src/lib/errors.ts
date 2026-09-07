import { TorchwoodError } from '@torchwood/sdk'

/**
 * Torchwood 域错误码 → 用户可读文案的集中映射（§错误处理纪律）：
 * 判别只按 `code`（域码 + `retryable`），禁止匹配 message 文本。
 */

/** 从未知错误中提取 TorchwoodError（SDK 抛出的都是它）。 */
export function asTorchwoodError(e: unknown): TorchwoodError | null {
  if (e instanceof TorchwoodError) return e
  return null
}

export function errorCode(e: unknown): string | null {
  return asTorchwoodError(e)?.code ?? null
}

export function errorStatus(e: unknown): number | null {
  return asTorchwoodError(e)?.status ?? null
}

const DOMAIN_MESSAGES: Record<string, string> = {
  // DOCUMENT 域
  'DOCUMENT.NOT_FOUND': '内容不存在，或你没有权限查看它。',
  'DOCUMENT.ALREADY_EXISTS': '同名内容已存在（唯一键冲突，如 slug 重复）。',
  'DOCUMENT.VERSION_CONFLICT': '内容刚被其他会话修改过，正在重新读取并重试……',
  'DOCUMENT.VERSION_REQUIRED': '缺少版本号（OCC），请刷新页面重试。',
  'DOCUMENT.PERMISSION_DENIED': '没有权限执行这个操作。',
  'DOCUMENT.TOO_LARGE': '内容超出大小限制。',
  'DOCUMENT.ATTRIBUTE_UNSERIALIZABLE': '字段类型与集合定义不匹配。',
  // CATALOG 域（DDL）
  'CATALOG.DDL_CONFLICT': '集合结构正在被并发修改，请重试。',
  'CATALOG.COLUMN_LIMIT_EXCEEDED': '集合属性数量已达上限。',
  // AUTH 域
  'AUTH.INVALID_CREDENTIALS': '邮箱或密码不正确。',
  'AUTH.EMAIL_NOT_VERIFIED': '邮箱尚未验证。',
  // IDEMPOTENCY 域
  'IDEMPOTENCY.KEY_CONFLICT': '请求幂等键冲突（同键不同内容），请重试。',
  'IDEMPOTENCY.IN_PROGRESS': '相同请求正在处理中，请稍候。',
  // EVENTS 域
  'EVENTS.RESUME_EXPIRED': '实时事件续传窗口已过期，将重新拉取全量数据。',
  // 限流
  'RATE_LIMIT.EXCEEDED': '请求太频繁，请稍后再试。',
}

/** 用户可读文案；未知域码回落到带状态码的通用文案（绝不暴露原始 message 给用户）。 */
export function describeError(e: unknown): string {
  const tw = asTorchwoodError(e)
  if (!tw) {
    return e instanceof Error ? `出错了：${e.message}` : '出了点未知问题。'
  }
  const mapped = tw.code ? DOMAIN_MESSAGES[tw.code] : undefined
  if (mapped) return mapped
  if (tw.status === 401) return '登录状态已失效，请重新登录。'
  if (tw.status === 403) return '没有权限执行这个操作。'
  if (tw.status === 404) return '内容不存在，或你没有权限查看它。'
  if (tw.status === 409) return '内容状态冲突，请刷新后重试。'
  if (tw.status === 429) return '请求太频繁，请稍后再试。'
  if (tw.status >= 500 || tw.status === 0) return 'Torchwood 服务暂时不可用，请稍后再试。'
  return `请求失败（${tw.status}${tw.code ? ` ${tw.code}` : ''}）。`
}

/** OCC：用户集合强制版本号，冲突域码 DOCUMENT.VERSION_CONFLICT。 */
export const VERSION_CONFLICT_CODE = 'DOCUMENT.VERSION_CONFLICT'

/**
 * 判别 OCC 冲突。域码优先；注意本网关形态：域错误以
 * `{code: FailedPrecondition, message: "DOCUMENT.VERSION_CONFLICT: …"}`
 * 到达（域码在 message 前缀），因此同时接受该等价形态。
 */
export function isVersionConflict(e: unknown): boolean {
  if (errorCode(e) === VERSION_CONFLICT_CODE) return true
  const tw = asTorchwoodError(e)
  if (!tw) return false
  const wireCode = tw.code ?? ''
  if (wireCode === 'FailedPrecondition' || wireCode === 'VERSION_MISMATCH') {
    const message = tw.message ?? ''
    if (message.startsWith(VERSION_CONFLICT_CODE)) return true
    // body 兜底：{error:{code, message}}
    const body = tw.body as { error?: { code?: unknown; message?: unknown } } | undefined
    if (body?.error?.code === 'FailedPrecondition' && String(body.error.message ?? '').startsWith(VERSION_CONFLICT_CODE)) {
      return true
    }
  }
  return false
}

export function isNotFound(e: unknown): boolean {
  return errorCode(e) === 'DOCUMENT.NOT_FOUND' || errorStatus(e) === 404
}

export function isAlreadyExists(e: unknown): boolean {
  const code = errorCode(e)
  return !!code && code.endsWith('ALREADY_EXISTS')
}

export function isUnauthenticated(e: unknown): boolean {
  return errorStatus(e) === 401 || errorCode(e) === 'AUTH.UNAUTHENTICATED'
}

/**
 * OCC 重读重试一次：`op` 用给定版本执行一次写；
 * 遇到 DOCUMENT.VERSION_CONFLICT 时调 `readVersion` 拿最新版本重试一次。
 */
export async function withOccRetry<T>(
  op: (version: number) => Promise<T>,
  readVersion: () => Promise<number>,
  currentVersion: number,
): Promise<T> {
  try {
    return await op(currentVersion)
  } catch (e) {
    if (!isVersionConflict(e)) throw e
    const latest = await readVersion()
    return op(latest)
  }
}

/**
 * request_id 幂等的客户端载体：
 * SDK 0.2.0 的写请求不暴露 request_id 字段，但 HTTP 面支持等价的
 * `Idempotency-Key` 头（服务端按 (project, actor, request_id) 做写幂等，
 * 重放返回首次结果）。通过 TorchwoodConfig.fetch 注入包装：业务发起一次
 * 逻辑写操作时 stage 一个键，键在整次 mutation（含重试）期间保持不变。
 */

let stagedKey: string | null = null

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function currentIdempotencyKey(): string | null {
  return stagedKey
}

/** 在 fn 执行期间固定使用 key（同一次逻辑操作的重试天然复用）。 */
export async function withIdempotencyKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = stagedKey
  stagedKey = key
  try {
    return await fn()
  } finally {
    stagedKey = prev
  }
}

/** 便捷组合：生成新键并执行。 */
export async function runIdempotent<T>(fn: () => Promise<T>): Promise<T> {
  return withIdempotencyKey(newIdempotencyKey(), fn)
}

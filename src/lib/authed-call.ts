import { ensureFreshAccessToken } from './torchwood-client'

/**
 * 特权 server function 调用的 Authorization 头（B-01 修复的客户端配套）：
 * 服务端 handler 现在校验终端用户 JWT，浏览器调用点必须在请求头里带上
 * `Authorization: Bearer <token>`（TanStack 会把这里的 headers 合并进
 * `/_serverFn/<id>` 请求）。
 *
 * 未登录 / 刷新失败（ensureFreshAccessToken 返回 undefined）时直接抛错、
 * 不发请求——各调用点的 onError 分支会把消息 toast 给用户。
 */
export async function authedHeaders(): Promise<{ authorization: string }> {
  const token = await ensureFreshAccessToken()
  if (!token) throw new Error('登录状态已失效，请重新登录后再试。')
  return { authorization: `Bearer ${token}` }
}

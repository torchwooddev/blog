import { Torchwood } from '@torchwood/sdk'
import { getStartContext } from '@tanstack/start-storage-context'
import { serverConfig } from './env.server'

/**
 * Server function 的调用者鉴权（B-01 修复）。
 *
 * 背景：`/_serverFn/<id>` 是可被直调的 HTTP 端点，admin 页面的客户端登录守卫
 * 只拦 UI 导航、不拦 HTTP 请求。特权动作（分类写、评论级联清理、附件删除）的
 * handler 必须自行校验调用者携带了有效的终端用户 JWT。
 *
 * - `getServerFnRequest()`：从 TanStack Start 的 AsyncLocalStorage 请求上下文取
 *   当前 `Request`（serverFn handler 一定运行在该上下文内，见 start-server-core
 *   的 createStartHandler：`runWithStartContext({ request, handlerType: 'serverFn' })`）。
 * - `requireAuthenticatedUser()`：校验语义与 storage.server.ts 的 verifyUploader
 *   一致——取 `Authorization: Bearer <终端用户JWT>`，用该 token 直连 `account.me()`
 *   验证（绝不落到 Server API Key：API Key 代表应用而非用户，不能作为身份凭据）。
 */

/** 取当前 server function 请求的 `Request`（不含请求上下文时抛错 = 调用位置错误，应响亮失败）。 */
export function getServerFnRequest(): Request {
  return getStartContext().request
}

export interface AuthenticatedUser {
  ok: true
  /** 终端用户 ID（来自 account.me()）。 */
  userId: string
}

export interface AuthProblem {
  ok: false
  message: string
}

/** 校验请求携带的终端用户 JWT；失败时给出可直接回传 UI 的文案。 */
export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedUser | AuthProblem> {
  const bearer = request.headers.get('authorization')
  if (!bearer?.startsWith('Bearer ')) {
    return { ok: false, message: '未登录：此操作需要终端用户 JWT。' }
  }
  const accessToken = bearer.slice('Bearer '.length).trim()
  if (!accessToken) {
    return { ok: false, message: '未登录：此操作需要终端用户 JWT。' }
  }
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
    return { ok: false, message: '登录状态无效或已过期，请重新登录。' }
  }
}

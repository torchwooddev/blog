import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * requireAuthenticatedUser 的单测：mock 掉 @torchwood/sdk（不触网），
 * 只校验鉴权分支逻辑（B-01）——缺头/坏头/无效 token 拒绝，有效 token 放行。
 */

const { createMock, meMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  meMock: vi.fn(),
}))

vi.mock('@torchwood/sdk', () => ({
  Torchwood: { create: createMock },
}))

// serverConfig 在请求时才求值；mock 掉避免依赖真实环境变量。
vi.mock('./env.server', () => ({
  serverConfig: () => ({
    endpoint: 'http://torchwood.test',
    projectId: 'test-project',
    apiKey: 'test-only-fake-key',
    seed: false,
  }),
}))

import { requireAuthenticatedUser } from './auth.server'

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/_serverFn/test', { method: 'POST', headers })
}

describe('requireAuthenticatedUser', () => {
  beforeEach(() => {
    createMock.mockReset()
    createMock.mockReturnValue({ account: { me: meMock } })
    meMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('缺 Authorization 头时拒绝且不触网', async () => {
    const result = await requireAuthenticatedUser(requestWith({}))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('未登录')
    expect(createMock).not.toHaveBeenCalled()
  })

  it('非 Bearer 形态的 Authorization 头被拒绝', async () => {
    const result = await requireAuthenticatedUser(requestWith({ authorization: 'Basic dXNlcjpwYXNz' }))
    expect(result.ok).toBe(false)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('Bearer token 有效时返回用户 ID', async () => {
    meMock.mockResolvedValue({ id: 'user-1' })
    const result = await requireAuthenticatedUser(requestWith({ authorization: 'Bearer good-token' }))
    expect(result).toEqual({ ok: true, userId: 'user-1' })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'http://torchwood.test', projectId: 'test-project', accessToken: 'good-token' }),
    )
  })

  it('me() 失败（token 无效/过期）时拒绝', async () => {
    meMock.mockRejectedValue(new Error('401'))
    const result = await requireAuthenticatedUser(requestWith({ authorization: 'Bearer expired-token' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('登录状态无效')
  })
})

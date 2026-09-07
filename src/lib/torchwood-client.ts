import { useSyncExternalStore } from 'react'
import {
  Torchwood,
  type Account,
  type AuthResult,
  type RealtimeConnection,
  type RealtimeStatus,
} from '@torchwood/sdk'
import { publicConfig } from './config'
import { currentIdempotencyKey } from './idempotency'

/**
 * 浏览器直连 Torchwood 的 Client 面（终端用户 Bearer JWT——不是经过自建后端代理）。
 *
 * SDK 把 access token 持有在内存 transport 上；这里补一层 localStorage 持久化 +
 * 过期前的静默 refresh（account.refresh），页面刷新后恢复会话。
 */

const TOKENS_STORAGE_KEY = 'torchwood-blog.tokens'
const ACCOUNT_STORAGE_KEY = 'torchwood-blog.account'

interface StoredTokens {
  access_token: string
  refresh_token: string
  expires_at: string
}

function loadStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' && parsed !== null &&
      typeof (parsed as Record<string, unknown>).access_token === 'string' &&
      typeof (parsed as Record<string, unknown>).refresh_token === 'string' &&
      typeof (parsed as Record<string, unknown>).expires_at === 'string'
    ) {
      return parsed as StoredTokens
    }
    return null
  } catch {
    return null
  }
}

function saveStoredTokens(tokens: StoredTokens | null): void {
  try {
    if (tokens) localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(TOKENS_STORAGE_KEY)
  } catch {
    /* 隐私模式等场景下不可用：会话退化为仅内存 */
  }
}

function loadCachedAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).id === 'string') {
      return parsed as Account
    }
    return null
  } catch {
    return null
  }
}

function saveCachedAccount(account: Account | null): void {
  try {
    if (account) localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account))
    else localStorage.removeItem(ACCOUNT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** 注入 SDK 的 fetch：写请求带上当前逻辑操作的 Idempotency-Key。 */
function idempotencyAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const key = currentIdempotencyKey()
  const method = (init?.method ?? 'GET').toUpperCase()
  if (key && method !== 'GET' && method !== 'HEAD') {
    const headers = new Headers(init?.headers)
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', key)
    return globalThis.fetch(input, { ...init, headers })
  }
  return globalThis.fetch(input, init)
}

/** Client 面单例：浏览器直连 Torchwood（注册/登录/文档 CRUD/realtime）。 */
export const tw = Torchwood.create({
  endpoint: publicConfig.endpoint,
  projectId: publicConfig.projectId,
  fetch: idempotencyAwareFetch,
})

// ---------------------------------------------------------------------------
// 认证状态（useSyncExternalStore 友好的极简 store）
// ---------------------------------------------------------------------------

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn'

export interface AuthSnapshot {
  status: AuthStatus
  account: Account | null
}

let snapshot: AuthSnapshot = initSnapshot()
const listeners = new Set<() => void>()

/** SSR 渲染恒为 restoring；浏览器用 localStorage 缓存乐观初始化（避免头部闪烁）。 */
function initSnapshot(): AuthSnapshot {
  if (typeof window === 'undefined') return { status: 'restoring', account: null }
  const cached = loadCachedAccount()
  if (cached && loadStoredTokens()) return { status: 'signedIn', account: cached }
  return { status: 'signedOut', account: null }
}

function setAuth(next: AuthSnapshot): void {
  snapshot = next
  for (const l of listeners) l()
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAuthSnapshot(): AuthSnapshot {
  void ensureSessionRestored()
  return snapshot
}

const SERVER_SNAPSHOT: AuthSnapshot = { status: 'restoring', account: null }

/** React hook：认证状态（SSR 输出 restoring 占位，客户端恢复后更新）。 */
export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => SERVER_SNAPSHOT)
}

let restorePromise: Promise<void> | null = null

/** 启动时恢复会话：装回 token →（必要时）刷新 → me() 校验。 */
export function ensureSessionRestored(): Promise<void> {
  if (!restorePromise) {
    restorePromise = (async () => {
      const stored = loadStoredTokens()
      if (!stored) {
        setAuth({ status: 'signedOut', account: null })
        return
      }
      try {
        let tokens = stored
        if (isExpiringSoon(tokens)) {
          tokens = await refreshTokens(stored.refresh_token)
        }
        tw.setAccessToken(tokens.access_token)
        const me = await tw.account.me()
        saveStoredTokens(tokens)
        saveCachedAccount(me)
        setAuth({ status: 'signedIn', account: me })
      } catch {
        clearSession()
      }
    })().catch(() => {
      clearSession()
    })
  }
  return restorePromise
}

function clearSession(): void {
  saveStoredTokens(null)
  saveCachedAccount(null)
  tw.setAccessToken(undefined)
  setAuth({ status: 'signedOut', account: null })
}

function isExpiringSoon(tokens: StoredTokens, skewMs = 60_000): boolean {
  const exp = new Date(tokens.expires_at).getTime()
  return Number.isNaN(exp) || exp - Date.now() < skewMs
}

/** 用 refresh token 换新 token bundle（写回存储与 transport）。 */
export async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  const bundle = await tw.account.refresh(refreshToken)
  const tokens: StoredTokens = {
    access_token: bundle.access_token,
    refresh_token: bundle.refresh_token,
    expires_at: bundle.expires_at,
  }
  tw.setAccessToken(tokens.access_token)
  saveStoredTokens(tokens)
  return tokens
}

/** 确保内存中的 access token 新鲜（写操作与 realtime 重连前调用）。 */
export async function ensureFreshAccessToken(): Promise<string | undefined> {
  const stored = loadStoredTokens()
  if (!stored) return tw.getAccessToken()
  if (isExpiringSoon(stored)) {
    try {
      return (await refreshTokens(stored.refresh_token)).access_token
    } catch {
      clearSession()
      return undefined
    }
  }
  return stored.access_token
}

function applyAuthResult(result: AuthResult): void {
  if (result.tokens) {
    tw.setAccessToken(result.tokens.access_token)
    saveStoredTokens({
      access_token: result.tokens.access_token,
      refresh_token: result.tokens.refresh_token,
      expires_at: result.tokens.expires_at,
    })
  }
  saveCachedAccount(result.account)
  setAuth({ status: 'signedIn', account: result.account })
}

export async function register(email: string, password: string, name: string): Promise<Account> {
  const result = await tw.account.signUp({ email, password, name })
  applyAuthResult(result)
  return result.account
}

export async function login(email: string, password: string): Promise<Account> {
  const result = await tw.account.signIn({ email, password })
  applyAuthResult(result)
  return result.account
}

export async function logout(): Promise<void> {
  try {
    await tw.account.signOut()
  } finally {
    clearSession()
  }
}

// ---------------------------------------------------------------------------
// Realtime 单连接（登录后才可用：Realtime 网关拒绝匿名与 API Key）
// ---------------------------------------------------------------------------

let realtimeConnection: RealtimeConnection | null = null
const realtimeStatusListeners = new Set<(status: RealtimeStatus) => void>()

/** 懒创建共享 WebSocket 连接；token 每次重连都取最新的（过期自动 refresh）。 */
export function getRealtimeConnection() {
  if (!realtimeConnection) {
    realtimeConnection = tw.realtime.connect({
      projectId: publicConfig.projectId,
      getAccessToken: async () => {
        const account = snapshot.account
        if (snapshot.status !== 'signedIn' || !account) return undefined
        return ensureFreshAccessToken()
      },
      onStatusChange: (status) => {
        for (const listener of realtimeStatusListeners) listener(status)
      },
    })
  }
  return realtimeConnection
}

/** 订阅连接状态变化（重连成功 → connected 时做 listChanges 补偿）。 */
export function subscribeRealtimeStatus(
  listener: (status: RealtimeStatus) => void,
): () => void {
  realtimeStatusListeners.add(listener)
  listener(realtimeConnection?.status ?? 'closed')
  return () => realtimeStatusListeners.delete(listener)
}

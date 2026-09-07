/**
 * Server 上下文的配置来源（process.env）。
 * 纪律：BLOG_TORCHWOOD_API_KEY 只允许出现在 src/server/*.server.ts ——
 * `npm run check:server-only` 会静态检查这条边界。
 */
export interface ServerConfig {
  endpoint: string
  projectId: string
  apiKey: string
  /** BLOG_SEED=true 时首次供给后灌种子数据。 */
  seed: boolean
}

export class MissingServerConfigError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`缺少服务端环境变量：${missing.join(', ')}（参考 .env.example）`)
    this.missing = missing
  }
}

function read(name: string, fallback?: string): string | undefined {
  const value = process.env[name]
  if (value !== undefined && value !== '') return value
  return fallback
}

export function serverConfig(): ServerConfig {
  const endpoint = read('BLOG_TORCHWOOD_ENDPOINT', 'http://localhost:9080')
  const projectId = read('BLOG_TORCHWOOD_PROJECT_ID', 'blog')
  const apiKey = read('BLOG_TORCHWOOD_API_KEY')
  const seed = read('BLOG_SEED', 'false') === 'true'

  const missing: string[] = []
  if (!apiKey) missing.push('BLOG_TORCHWOOD_API_KEY')
  if (missing.length > 0) throw new MissingServerConfigError(missing)

  return { endpoint: endpoint ?? '', projectId: projectId ?? '', apiKey: apiKey ?? '', seed }
}

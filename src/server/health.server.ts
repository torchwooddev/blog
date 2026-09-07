import { Torchwood } from '@torchwood/sdk'
import { serverConfig } from './env.server'

/**
 * GET /api/health 的实现：探活 Torchwood 端点。
 * health.check() 走 /v1/health（auth: none）——未配置 API Key 时也能区分
 * "Torchwood 挂了"和"应用配置缺了"。
 */
export interface HealthPayload {
  ok: boolean
  torchwood: 'up' | 'down' | 'unconfigured'
  status?: string
  version?: string | null
  projectId?: string
  seed?: boolean
  endpoint?: string
  detail?: string
  hint?: string
}

export async function probeTorchwood(): Promise<HealthPayload> {
  let config: { endpoint: string; projectId: string; seed: boolean }
  try {
    const c = serverConfig()
    config = { endpoint: c.endpoint, projectId: c.projectId, seed: c.seed }
  } catch {
    return {
      ok: false,
      torchwood: 'unconfigured',
      hint: '缺少 BLOG_TORCHWOOD_* 环境变量，参考 .env.example',
    }
  }

  // 只用 endpoint/projectId 构造探活客户端（不带 API Key）。
  const probe = Torchwood.create({ endpoint: config.endpoint, projectId: config.projectId })
  try {
    const [health, version] = await Promise.all([
      probe.server.health.check(),
      probe.server.health.getVersion().catch(() => null),
    ])
    // ok = 端点存活（能应答 health）；后端聚合状态（依赖子检查）原样透出——
    // 例如 MinIO 不可用会令 status=unavailable，但数据库面照常工作。
    return {
      ok: true,
      torchwood: 'up',
      status: health.status,
      version: version?.version ?? null,
      projectId: config.projectId,
      seed: config.seed,
    }
  } catch (e) {
    return {
      ok: false,
      torchwood: 'down',
      endpoint: config.endpoint,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

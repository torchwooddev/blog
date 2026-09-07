import { Torchwood } from '@torchwood/sdk'
import { serverConfig } from './env.server'

/**
 * Server 面（API Key + X-Torchwood-Project）单例。
 * 仅用于：启动供给（DDL）、公开内容读取、种子、跨集合批操作。
 * 终端用户的写路径一律走浏览器直连的 Client 面（src/lib/torchwood-client.ts）。
 */

let cached: Torchwood | null = null

export function getServerTorchwood(): Torchwood {
  if (!cached) {
    const config = serverConfig()
    cached = Torchwood.withApiKey(config.endpoint, config.projectId, config.apiKey)
  }
  return cached
}

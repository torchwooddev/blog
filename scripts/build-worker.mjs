// Cloudflare Workers 构建入口（跨平台）。
// 用法：npm run build:worker（产物：.output/，部署配置由 Nitro 生成到
// .output/server/wrangler.json，根目录 wrangler.jsonc 中的 name/vars 会被合并进去）。
//
// - NITRO_PRESET 必须在构建启动前进入环境（Nitro 从 process.env 读取预设，
//   见 node_modules/nitro/dist/_chunks/nitro.mjs 的预设解析）；npm script 里内联
//   `NITRO_PRESET=... vite build` 只在 POSIX shell 生效，这里用 Node 设置以保证
//   Windows 上一致。只影响本次构建，dev/普通 build 的 node-server 预设不受影响。
// - 必须走 vite CLI 而不是 `build()` JS API：nitro 插件的服务端构建挂在
//   buildApp 钩子上（见 node_modules/nitro/dist/vite.mjs 的 nitroMain），该钩子
//   只由 CLI 触发，JS API 会在客户端构建后直接结束。这里直接用当前 Node 执行
//   vite 的 bin 文件——vite 8 的 exports 不再暴露 ./bin/*，不能用 require.resolve。
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

process.env.NITRO_PRESET = 'cloudflare-module'

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const result = spawnSync(process.execPath, [viteBin, 'build'], { stdio: 'inherit' })
process.exit(result.status ?? 1)

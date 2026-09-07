// 静态检查：BLOG_TORCHWOOD_API_KEY 只允许出现在服务端上下文文件里。
// 服务端上下文 = src/server/*.server.ts（Nitro 侧模块，绝不进客户端 bundle）。
// 用法：npm run check:server-only（exit 1 = 违例）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const SECRET = 'BLOG_TORCHWOOD_API_KEY'
const SERVER_DIR = 'server'
const SERVER_FILE = /\.server\.ts$/

/** @returns {string[]} */
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(full)
  }
  return out
}

const files = walk(ROOT)
const violations = []
const allowed = []

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  if (!content.includes(SECRET)) continue
  const normalized = file.replaceAll('\\', '/')
  const isServerContext =
    normalized.includes(`/${SERVER_DIR}/`) && SERVER_FILE.test(normalized)
  if (isServerContext) allowed.push(file)
  else violations.push(file)
}

for (const f of allowed) console.log(`  ok   ${f}`)
if (violations.length > 0) {
  console.error('\n秘钥边界被破坏：以下文件引用了 BLOG_TORCHWOOD_API_KEY，但不在服务端上下文：')
  for (const f of violations) console.error(`  FAIL ${f}`)
  process.exit(1)
} else {
  console.log(`\n秘钥边界检查通过：${allowed.length} 个命中全部位于 src/server/*.server.ts`)
}

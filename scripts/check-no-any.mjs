// 静态检查：应用源码禁止显式 any（任务纪律：SDK 有完整类型）。
// 例外：src/routeTree.gen.ts（TanStack Router 代码生成产物，不可手改）。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const GENERATED = /routeTree\.gen\.ts$/
const PATTERNS = [': any', 'as any', '<any>', 'any[]', ': any;']

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const violations = []
for (const file of walk(ROOT)) {
  if (GENERATED.test(file)) continue
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (PATTERNS.some((p) => line.includes(p))) violations.push(`${file}:${i + 1}: ${line.trim()}`)
  })
}

if (violations.length > 0) {
  console.error('发现显式 any（routeTree.gen.ts 除外）：')
  for (const v of violations) console.error('  FAIL', v)
  process.exit(1)
}
console.log('no-any 检查通过（routeTree.gen.ts 为代码生成产物，已豁免）')

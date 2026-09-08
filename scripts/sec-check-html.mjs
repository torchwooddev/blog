// 检查 SSR HTML:正文 prose 区块 vs 数据岛中的 payload
import fs from 'node:fs'
import os from 'node:os'

const file = process.argv[2] ?? `${os.tmpdir()}/xss-post.html`
const s = fs.readFileSync(file, 'utf8')

const proseStart = s.indexOf('class="prose')
const proseEnd = s.indexOf('</div>', proseStart)
const body = proseStart >= 0 ? s.slice(proseStart, proseEnd + 6) : '(prose not found)'

console.log('=== 正文 prose 区块 ===')
console.log(body)
console.log()
console.log('=== <script 出现位置上下文(前60字符)===')
let idx = -1
let n = 0
while ((idx = s.indexOf('<script', idx + 1)) >= 0 && n < 10) {
  console.log(`@${idx}: ...${s.slice(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ')}...`)
  n++
}

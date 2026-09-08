import fs from 'node:fs'

// 本地安全检测辅助:从构建产物中提取 server function 的调用 URL 协议
const dir = '.output/public/assets'
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js') && !f.endsWith('.mjs')) continue
  const s = fs.readFileSync(`${dir}/${f}`, 'utf8')
  for (const kw of ['x-tsr-serverFn', '_server', 'serverFn']) {
    let i = s.indexOf(kw)
    if (i >= 0) {
      console.log(`=== ${f} kw=${kw}`)
      console.log(s.slice(Math.max(0, i - 300), i + 300))
      console.log()
      break
    }
  }
}

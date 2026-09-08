import fs from 'node:fs'

// 从本地构建产物提取 server function 的 name -> id 映射
const dir = '.output/server/_ssr'
const re = /id:\s*"([0-9a-f]{64})",\s*\n?\s*name:\s*"([a-zA-Z]+)",\s*\n?\s*filename:\s*"([^"]+)"/g
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.mjs')) continue
  const s = fs.readFileSync(`${dir}/${f}`, 'utf8')
  let m
  while ((m = re.exec(s))) {
    console.log(`${m[2]} = ${m[1]}  (${m[3]})`)
  }
}

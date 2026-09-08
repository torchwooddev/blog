// 提取 JSON-LD 块,验证是否存在 </script 字面序列(JSON-LD 注入型 XSS)
import fs from 'node:fs'
import os from 'node:os'

const file = process.argv[2] ?? `${os.tmpdir()}/xss-post.html`
const s = fs.readFileSync(file, 'utf8')

const start = s.indexOf('<script type="application/ld+json">')
const end = s.indexOf('</script>', start)
const block = s.slice(start, end + 9)
console.log('=== ld+json 块 ===')
console.log(block)
console.log()
console.log('块内是否有字面 </script:', /<\/script/i.test(block.slice(43, -9)))
console.log('块内是否有 <img:', /<img/i.test(block.slice(43, -9)))

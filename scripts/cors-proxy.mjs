/**
 * 本地视觉验收专用：给 Torchwood Client API 补 CORS 头的转发代理（9081 → 9080）。
 * 仅用于网关白名单未配置 localhost:3000 的开发环境；不属于产品代码。
 */
import http from 'node:http'

const UPSTREAM = 'http://localhost:9080'
const PORT = 9081

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    })
    res.end()
    return
  }

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = Buffer.concat(chunks)

  const headers = { ...req.headers }
  delete headers['host']
  delete headers['origin']
  delete headers['referer']

  try {
    const upstream = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers,
      body: body.length > 0 ? body : undefined,
    })
    const resHeaders = Object.fromEntries(upstream.headers.entries())
    delete resHeaders['content-encoding']
    delete resHeaders['content-length']
    delete resHeaders['transfer-encoding']
    resHeaders['access-control-allow-origin'] = req.headers.origin ?? '*'
    resHeaders['access-control-allow-credentials'] = 'true'
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.writeHead(upstream.status, resHeaders)
    res.end(buf)
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify({ error: String(e) }))
  }
})

server.listen(PORT, () => {
  console.log(`CORS proxy listening on http://localhost:${PORT} -> ${UPSTREAM}`)
})

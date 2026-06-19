import http from 'node:http'
import { TENANT_ID } from './constants.js'
import { handleRequest } from './router.js'

const port = Number.parseInt(process.env.PORT ?? '8099', 10)

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `localhost:${port}`
    const url = new URL(req.url ?? '/', `http://${host}`)
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
      else headers.set(key, value)
    }

    let body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = Buffer.concat(chunks)
    }

    const request = new Request(url, { method: req.method, headers, body })
    const response = await handleRequest(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    const buf = Buffer.from(await response.arrayBuffer())
    res.end(buf)
  } catch (error) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: 'smoke_simulator_internal_error',
        message: error instanceof Error ? error.message : 'unknown',
      }),
    )
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[payout-smoke-simulator] listening on http://0.0.0.0:${port}`)
  console.log(`[payout-smoke-simulator] tenant_id=${TENANT_ID}`)
  console.log('[payout-smoke-simulator] Point all ZORD_*_URL env vars in zord-console to this port.')
})

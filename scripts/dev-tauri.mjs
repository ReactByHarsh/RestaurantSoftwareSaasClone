import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const START_PORT = Number.parseInt(process.env.BHOJPATRA_DEV_PORT || process.env.PORT || '5173', 10)
const HOST = process.env.BHOJPATRA_DEV_HOST || '127.0.0.1'
const MAX_PORT_ATTEMPTS = 40
const WEB_DIR = fileURLToPath(new URL('../apps/web/', import.meta.url))

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: HOST, port }, () => {
      server.close(() => resolve(true))
    })
  })
}

function waitForHttp(url, child, timeoutMs = 30_000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    let done = false

    const finish = (callback, value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.off('exit', onExit)
      callback(value)
    }

    const onExit = (code) => {
      finish(reject, new Error(`Vite exited before it was ready, code ${code ?? 'unknown'}.`))
    }

    const poll = () => {
      const req = http.get(url, (res) => {
        res.resume()
        finish(resolve)
      })

      req.once('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          finish(reject, new Error(`Timed out waiting for ${url}.`))
          return
        }
        setTimeout(poll, 250)
      })
    }

    const timer = setTimeout(() => {
      finish(reject, new Error(`Timed out waiting for ${url}.`))
    }, timeoutMs + 1000)

    child.once('exit', onExit)
    poll()
  })
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    return
  }

  child.kill('SIGTERM')
}

async function startVite() {
  for (let port = START_PORT; port < START_PORT + MAX_PORT_ATTEMPTS; port += 1) {
    if (!(await canListen(port))) {
      continue
    }

    const devUrl = `http://${HOST}:${port}`
    console.log(`Starting Vite on ${devUrl}`)

    const vite = spawn(
      'corepack',
      ['pnpm', 'exec', 'vite', '--host', HOST, '--port', String(port), '--strictPort'],
      {
        cwd: WEB_DIR,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          BHOJPATRA_DEV_PORT: String(port),
          BHOJPATRA_DEV_HOST: HOST,
        },
      },
    )

    try {
      await waitForHttp(devUrl, vite)
      return { devUrl, port, vite }
    } catch (error) {
      stopProcessTree(vite)
      console.warn(`Could not use port ${port}: ${error.message}`)
    }
  }

  throw new Error(`No working dev port found from ${START_PORT} to ${START_PORT + MAX_PORT_ATTEMPTS - 1}.`)
}

if (process.argv.includes('--dry-run')) {
  for (let port = START_PORT; port < START_PORT + MAX_PORT_ATTEMPTS; port += 1) {
    if (await canListen(port)) {
      const devUrl = `http://${HOST}:${port}`
      console.log(JSON.stringify({ port, devUrl }, null, 2))
      process.exit(0)
    }
  }
  throw new Error(`No free dev port found from ${START_PORT} to ${START_PORT + MAX_PORT_ATTEMPTS - 1}.`)
}

const { devUrl, port, vite } = await startVite()
const config = {
  build: {
    devUrl,
    beforeDevCommand: 'node -e "process.exit(0)"',
  },
}

console.log(`Starting BhojPatra Desk on ${devUrl}`)

const tauri = spawn('cargo', ['tauri', 'dev', '--config', JSON.stringify(config)], {
  cwd: WEB_DIR,
  stdio: 'inherit',
  env: {
    ...process.env,
    BHOJPATRA_DEV_PORT: String(port),
    BHOJPATRA_DEV_HOST: HOST,
  },
})

const shutdown = () => {
  stopProcessTree(tauri)
  stopProcessTree(vite)
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
process.once('exit', shutdown)

tauri.on('exit', (code, signal) => {
  stopProcessTree(vite)
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})

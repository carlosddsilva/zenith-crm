import net from 'node:net'

function checkPort(name, host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) })
    let settled = false

    const finish = (ok, detail) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ name, ok, detail })
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true, `${host}:${port}`))
    socket.once('timeout', () => finish(false, `timeout em ${host}:${port}`))
    socket.once('error', (error) => finish(false, error.message))
  })
}

const checks = await Promise.all([
  checkPort(
    'PostgreSQL',
    process.env.POSTGRES_HOST ?? '127.0.0.1',
    process.env.POSTGRES_PORT ?? '5432'
  ),
  checkPort(
    'Redis',
    process.env.REDIS_HOST ?? '127.0.0.1',
    process.env.REDIS_PORT ?? '6379'
  ),
])

for (const check of checks) {
  console.log(`${check.ok ? 'OK' : 'ERRO'}  ${check.name}: ${check.detail}`)
}

if (checks.some((check) => !check.ok)) process.exit(1)

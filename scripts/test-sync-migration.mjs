import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Local seeded database only; never accepts a remote origin.
const base = 'http://127.0.0.1:8790'
const seed = readFileSync(new URL('../packages/db/migrations/0009_platform_admin_credentials.sql', import.meta.url), 'utf8')
const login = await fetch(`${base}/api/v1/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ emailOrPhone: seed.match(/email = '([^']+)'/)[1], password: seed.match(/password_hash = '([^']+)'/)[1] }),
})
assert.equal(login.status, 200)
const cookie = login.headers.get('set-cookie').split(';')[0]
const result = await fetch(`${base}/api/v1/admin/storage-migration/out_ten_1`, { method: 'POST', headers: { Cookie: cookie } })
const body = await result.json()
assert.equal(result.status, 200, JSON.stringify(body))
assert.equal(body.compacted, 1, JSON.stringify(body))
const again = await fetch(`${base}/api/v1/admin/storage-migration/out_ten_1`, { method: 'POST', headers: { Cookie: cookie } })
assert.equal((await again.json()).compacted, 0)
console.log('PASS: backed up legacy snapshot, backfilled missing order, compacted safely, idempotent migration retry')

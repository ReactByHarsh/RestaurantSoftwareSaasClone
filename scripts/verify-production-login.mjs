import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const base = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev'
const adminSeed = readFileSync(new URL('../packages/db/migrations/0009_platform_admin_credentials.sql', import.meta.url), 'utf8')
const adminCredentials = { emailOrPhone: adminSeed.match(/email = '([^']+)'/)[1], password: adminSeed.match(/password_hash = '([^']+)'/)[1] }
async function login(path, credentials) {
  const response = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
  })
  assert.equal(response.status, 200, `${path} returned ${response.status}`)
  return { cookie: response.headers.get('set-cookie')?.split(';')[0], body: await response.json() }
}
await login('/api/v1/admin/login', adminCredentials)
const softwareAdminAttempt = await fetch(`${base}/api/v1/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(adminCredentials),
})
assert.equal(softwareAdminAttempt.status, 401, 'Platform credentials must not open a restaurant POS')
const basic = `Basic ${Buffer.from(`${adminCredentials.emailOrPhone}:${adminCredentials.password}`).toString('base64')}`
const outletId = 'out_ten_bee47ca9-d1a2-41e4-8c73-40c86dfe3d97'
const initial = await fetch(`${base}/api/v1/state/${encodeURIComponent(outletId)}/initial-state`, { headers: { Authorization: basic } })
assert.equal(initial.status, 200, `Initial-state restore returned ${initial.status}`)
const history = await fetch(`${base}/api/v1/state/${encodeURIComponent(outletId)}/history?limit=1`, { headers: { Authorization: basic } })
assert.equal(history.status, 200, `Relational history returned ${history.status}`)
const backupsResponse = await fetch(`${base}/api/v1/outlets/${encodeURIComponent(outletId)}/backups`, { headers: { Authorization: basic } })
assert.equal(backupsResponse.status, 200, `Backup list returned ${backupsResponse.status}`)
const backups = await backupsResponse.json()
assert.ok(backups.backups.length, 'No R2 backup is available for the migrated outlet')
const backup = backups.backups[0]
const download = await fetch(`${base}/api/v1/outlets/${encodeURIComponent(outletId)}/backups/${encodeURIComponent(backup.id)}/download`, { headers: { Authorization: basic } })
assert.equal(download.status, 200, `Backup download returned ${download.status}`)
const decoded = gunzipSync(Buffer.from(await download.arrayBuffer()))
assert.equal(createHash('sha256').update(decoded).digest('hex'), backup.sha256, 'R2 backup checksum mismatch')
console.log('PASS: Cloud Admin login, account separation, operational/history restore, and compressed R2 backup checksum')

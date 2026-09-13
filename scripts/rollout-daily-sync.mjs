import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Explicit production rollout; only the verified BhojPatra host is permitted.
if (!process.argv.includes('--production')) throw new Error('Pass --production to run the authorized live migration')
const base = 'https://bhojpatra-cloud.yash-v-shinde.workers.dev'
const seed = readFileSync(new URL('../packages/db/migrations/0009_platform_admin_credentials.sql', import.meta.url), 'utf8')
const response = await fetch(`${base}/api/v1/admin/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ emailOrPhone: seed.match(/email = '([^']+)'/)[1], password: seed.match(/password_hash = '([^']+)'/)[1] }),
})
if (!response.ok) throw new Error(`Cloud admin login failed: ${response.status}`)
const cookie = response.headers.get('set-cookie')?.split(';')[0]
if (!cookie) throw new Error('Admin session was not issued')
console.log('Cloud admin login verified')
const wrangler = new URL('../apps/worker/node_modules/wrangler/bin/wrangler.js', import.meta.url)
function query(sql) {
  const result = spawnSync(process.execPath, [wrangler.pathname.replace(/^\/(\w:)/, '$1'), 'd1', 'execute', 'bhojpatra-db', '--remote', '--json', '--command', sql], {
    cwd: new URL('../apps/worker/', import.meta.url), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error('Read-only migration audit failed')
  return JSON.parse(result.stdout)[0].results
}
async function post(path) {
  const response = await fetch(base + path, { method: 'POST', headers: { Cookie: cookie } })
  const body = await response.json()
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}
const outlets = query("SELECT outlet_id FROM app_snapshots WHERE COALESCE(json_extract(payload_json, '$.snapshotKind'), '') <> 'operational'")
for (const { outlet_id: outletId } of outlets) {
  let complete = false
  for (let batch = 0; batch < 30; batch++) {
    const result = await post(`/api/v1/admin/storage-migration/${encodeURIComponent(outletId)}`)
    console.log(JSON.stringify({ outletId, batch: batch + 1, ...result }))
    if (result.compacted || !result.remainingMayExist) { complete = true; break }
  }
  if (!complete) throw new Error(`Migration needs manual inspection for ${outletId}; original snapshot retained`)
}
for (let batch = 0; batch < 100; batch++) {
  const result = await post('/api/v1/admin/storage-history-migration')
  console.log(JSON.stringify({ historyBatch: batch + 1, ...result }))
  if (!result.remainingMayExist) break
  if (batch === 99) throw new Error('More legacy backups remain; rerun safely')
}
await post('/api/v1/admin/storage-maintenance')
console.log(JSON.stringify({ audit: query("SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM app_snapshots WHERE COALESCE(json_extract(payload_json, '$.snapshotKind'), '') <> 'operational') AS legacySnapshots, (SELECT COUNT(*) FROM app_snapshot_history) AS legacyBackupBlobs, (SELECT COUNT(*) FROM cloud_backups) AS r2Backups") }))

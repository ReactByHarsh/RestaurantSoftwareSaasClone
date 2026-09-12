import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

// Deliberately local-only. Uses seeded development credentials and never calls production.
const base = 'http://127.0.0.1:8790'
const headers = { Authorization: `Basic ${Buffer.from('admin@demo.com:admin123').toString('base64')}`, 'Content-Type': 'application/json' }
const run = randomUUID()
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([,x]) => x !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => [k,canonical(x)])) : v
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex')
async function request(path, body) {
  const response = await fetch(base + path, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  return result
}
function change(i, closed = true) {
  const id = `${run}-${i}`
  const at = new Date().toISOString()
  const payload = {
    order: { id, orderUuid:id, version:1, outletId:'out_ten_1', orderNo:`TEST-${run}-${i}`, businessDate:at.slice(0,10), type:'takeaway', status:closed?'paid':'running', isClosed:closed, subtotalPaise:100, totalPaise:100, paidPaise:closed?100:0, paymentStatus:closed?'paid':'unpaid', createdAt:at, updatedAt:at, ...(closed?{closedAt:at}:{}) },
    orderItems:[{ id:`item-${id}`, orderId:id, menuItemId:'test-menu', nameSnapshot:'Tea', itemType:'veg', quantity:1, unitPricePaise:100, totalPaise:100, status:'served', createdAt:at }],
    kots:[{id:`kot-${id}`,orderId:id,kotNo:`K-${i}`,createdByUserId:'usr_admin',createdAt:at,status:'served',items:[{id:`ki-${id}`,orderItemId:`item-${id}`,quantity:1,name:'Tea',status:'served'}]}],
    payments:closed?[{id:`pay-${id}`,orderId:id,method:'cash',amountPaise:100,collectedByUserId:'usr_admin',createdAt:at}]:[],
  }
  return {entityType:'order_aggregate',entityId:id,orderUuid:id,baseVersion:0,version:1,operation:'upsert',updatedAt:at,isClosed:closed,payloadHash:hash(payload),payload}
}
const changes=Array.from({length:150},(_,i)=>change(i))
for(let i=0;i<3;i++) {
  const push={protocolVersion:2,deviceId:`integration-${run}`,batchId:`batch-${i}`,baseCursor:0,changes:changes.slice(i*50,(i+1)*50)}
  const result=await request('/api/v2/outlets/out_ten_1/sync/push',push)
  assert.equal(result.accepted.length,50)
  assert.equal(result.conflicts.length,0)
  assert.deepEqual(await request('/api/v2/outlets/out_ten_1/sync/push',push),result)
}
const state=await request('/api/v1/outlets/out_ten_1/state')
assert.equal(state.payload.snapshotKind,'operational')
assert.equal(state.payload.orders.filter(o=>o.id.startsWith(run)).length,0)
let cursor=0, hasMore=true, restored=[]
while(hasMore) {
  const page=await request(`/api/v1/state/out_ten_1/history?cursor=${cursor}&limit=100`)
  restored.push(...page.orders.filter(o=>o.id.startsWith(run)))
  cursor=page.cursor; hasMore=page.hasMore
}
assert.equal(restored.length,150)
const payload={...state.payload,snapshotKind:'full',outlet:{id:'out_ten_1',tenantId:'ten_1'},orders:changes.map(c=>c.payload.order),orderItems:changes.flatMap(c=>c.payload.orderItems),kots:changes.flatMap(c=>c.payload.kots),payments:changes.flatMap(c=>c.payload.payments)}
const backup=await request('/api/v1/outlets/out_ten_1/backups/daily',{tenantId:'ten_1',payload,clientId:`integration-${run}`})
assert.ok(backup.compressedBytes>0)
const download=await fetch(`${base}/api/v1/outlets/out_ten_1/backups/${backup.backupId}/download`,{headers})
assert.equal(download.status,200)
const bytes=Buffer.from(await download.arrayBuffer())
const decoded=bytes[0]===31?gunzipSync(bytes):bytes
const doc=JSON.parse(decoded.toString())
assert.equal(doc.payload.orders.length,150)
assert.equal(createHash('sha256').update(decoded).digest('hex'),backup.sha256)
console.log('PASS: 150 orders / 3 pushes, idempotent retries, active-only snapshot, paginated relational restore, gzip backup download + checksum')

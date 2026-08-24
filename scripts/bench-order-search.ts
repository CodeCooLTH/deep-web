/**
 * bench-order-search — วัดต้นทุนการค้นหาฝั่ง client ของหน้า /seller/orders (feature 00058 · D-9)
 *
 * รัน: `npx tsx scripts/bench-order-search.ts`
 *
 * 🛑 มีอยู่เพราะ D-9 บังคับว่า "ห้ามเขียนลอย ๆ ว่าถ้าเยอะค่อยย้ายไป server" — ต้องมีตัวเลขจริง
 * และตัวเลขที่ derive ซ้ำไม่ได้คือตัวเลขที่จะค้างล้าสมัยเงียบ ๆ สคริปต์นี้จึงอยู่ในรีโป
 * ไม่ใช่แค่ผลลัพธ์ในเอกสาร
 *
 * 🛑 วัดเฉพาะ `searchOrders()` ซึ่งเป็นฟังก์ชันบริสุทธิ์ — **ไม่ได้รวมต้นทุนการ re-render
 * ของ React** ที่เกิดตามมาทุกตัวอักษร ต้นทุนจริงที่ผู้ใช้รู้สึกจึงสูงกว่านี้เสมอ
 * ใช้เลขนี้เป็น "พื้น" ไม่ใช่ "เพดาน"
 *
 * ไม่แตะฐานข้อมูล ไม่แตะเครือข่าย — สร้างข้อมูลสังเคราะห์ในหน่วยความจำล้วน
 */
import { searchOrders } from '../src/lib/order-search'

function make(n: number) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({
      id: `tok${String(i).padStart(5, '0')}`,
      publicToken: `tok${String(i).padStart(5, '0')}-aaaa-bbbb-cccc-${String(i).padStart(12, '0')}`,
      shortCode: `SC${String(i).padStart(6, '0')}`,
      createdAtISO: new Date(Date.UTC(2026, 7, 1 + (i % 28), 5)).toISOString(),
      buyerName: `ลูกค้า หมายเลข ${i}`,
      buyerUsername: null,
      buyerPhone: `08${String(10000000 + i).slice(0, 8)}`,
      shipment: i % 3 === 0 ? { trackingNo: `TH${String(600000000 + i)}` } : null,
      items: [{ name: `สินค้าตัวอย่างชื่อยาวพอสมควร ${i}` }, { name: `ของแถม ${i % 7}` }],
    })
  }
  return out
}

for (const n of [421, 1000, 5000]) {
  const rows = make(n)
  const queries = ['สมชาย', '0812345678', 'TH600', 'สินค้า ตัวอย่าง', 'ของแถม 3', 'DP2569']
  // warm-up
  for (const q of queries) searchOrders(rows, q)
  const t0 = performance.now()
  const ROUNDS = 50
  for (let r = 0; r < ROUNDS; r++) for (const q of queries) searchOrders(rows, q)
  const t1 = performance.now()
  const per = (t1 - t0) / (ROUNDS * queries.length)
  console.log(`${String(n).padStart(5)} แถว  ->  ${per.toFixed(2)} ms ต่อการค้นหา 1 ครั้ง`)
}

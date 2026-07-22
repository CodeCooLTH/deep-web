/**
 * SPIKE TD-002 — พิสูจน์ EXCLUDE constraint + การดัก error ผ่าน Prisma
 *
 * ทุกอย่างอยู่ใน transaction ที่ ROLLBACK เสมอ + TEMP TABLE (ON COMMIT DROP)
 * → ไม่เหลือร่องรอยบน prod DB แม้แต่บรรทัดเดียว (รวมถึง CREATE EXTENSION)
 *
 * ตอบ 3 คำถาม:
 *   Q1 daterange '[)' ให้พฤติกรรมวันเช็คเอาท์ตาม D-02 จริงไหม
 *   Q2 WHERE status <> 'CANCELLED' ปล่อยคิวคืนจริงไหม (BR-LODG-13)
 *   Q3 Prisma โยน error หน้าตายังไง — ดักเป็น 409 ได้สะอาดไหม (TFR-005)
 */
// require ด้วย absolute path เพราะสคริปต์อยู่นอกโปรเจกต์ (scratchpad) จึง resolve node_modules เองไม่ได้
const { PrismaClient } = require('/Users/craftman/Projects/safepay/node_modules/@prisma/client')
const p = new PrismaClient()

class Rollback extends Error {}
const results = []
function log(q, pass, detail) {
  results.push({ q, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${q}  ${detail}`)
}

/** ดัก error ให้ได้รูปร่างจริง ไม่เดา */
function describeError(e) {
  return {
    ctor: e?.constructor?.name,
    code: e?.code,
    meta: e?.meta,
    msgHead: String(e?.message || '').split('\n').slice(0, 3).join(' | ').slice(0, 300),
    has23P01: /23P01|exclusion/i.test(String(e?.message || '') + JSON.stringify(e?.meta || {})),
  }
}

async function insert(tx, id, roomId, checkIn, checkOut, status = 'PENDING') {
  await tx.$executeRawUnsafe(
    `INSERT INTO spike_booking (id,"roomId","checkIn","checkOut",status) VALUES ($1,$2,$3::date,$4::date,$5)`,
    id, roomId, checkIn, checkOut, status,
  )
}

/**
 * 🛑 บทเรียนจากรอบแรก: Postgres poison ทั้ง transaction เมื่อ statement ใด ๆ ล้ม
 * (25P02 current transaction is aborted) — จะ catch แล้วทำต่อในธุรกรรมเดิมไม่ได้
 * ต้องครอบด้วย SAVEPOINT แล้ว ROLLBACK TO SAVEPOINT จึงจะทำงานต่อได้
 */
let spCounter = 0
async function attempt(tx, fn) {
  const sp = `sp${++spCounter}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${sp}`)
  try {
    await fn()
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`)
    return { ok: true }
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`)
    return { ok: false, err: e }
  }
}

;(async () => {
  let errorShape = null
  try {
    await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist`)
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE spike_booking (
          id text PRIMARY KEY,
          "roomId" text,
          "checkIn" date,
          "checkOut" date,
          status text NOT NULL DEFAULT 'PENDING'
        ) ON COMMIT DROP`)
      await tx.$executeRawUnsafe(`
        ALTER TABLE spike_booking ADD CONSTRAINT spike_no_overlap
        EXCLUDE USING gist (
          "roomId" WITH =,
          daterange("checkIn","checkOut",'[)') WITH &&
        ) WHERE ("roomId" IS NOT NULL AND status <> 'CANCELLED')`)

      // ---------- ฐาน: การจอง A = 5–8 ก.ย. (กัน 5,6,7 ไม่กัน 8) ----------
      await insert(tx, 'A', 'room1', '2026-09-05', '2026-09-08')

      // Q1a: B เช็คอิน 8 = วันเดียวกับที่ A เช็คเอาท์ → ต้องสำเร็จ (D-02)
      let r = await attempt(tx, () => insert(tx, 'B', 'room1', '2026-09-08', '2026-09-10'))
      log('Q1a เช็คอินวันเดียวกับเช็คเอาท์', r.ok,
          r.ok ? 'INSERT สำเร็จ = วันเช็คเอาท์ไม่ถูกกันคิว' : describeError(r.err).msgHead)

      // Q1b: C = 7–9 ทับวันที่ 7 ของ A → ต้องถูกปฏิเสธ + เก็บรูปร่าง error
      r = await attempt(tx, () => insert(tx, 'C', 'room1', '2026-09-07', '2026-09-09'))
      if (!r.ok) errorShape = describeError(r.err)
      log('Q1b จองทับต้องถูกปฏิเสธ', !r.ok, r.ok ? 'INSERT ผ่าน = constraint ไม่ทำงาน' : 'ถูกปฏิเสธตามคาด')

      // Q1c: ห้องอื่น ช่วงวันเดียวกัน → ต้องสำเร็จ (constraint ผูกกับ roomId)
      r = await attempt(tx, () => insert(tx, 'D', 'room2', '2026-09-05', '2026-09-08'))
      log('Q1c ห้องอื่นช่วงเดียวกัน', r.ok, r.ok ? 'INSERT สำเร็จ' : describeError(r.err).msgHead)

      // Q1d: roomId NULL (ออเดอร์สินค้าปกติ) ซ้ำได้ไม่จำกัด → zero-regression
      r = await attempt(tx, async () => { await insert(tx, 'E1', null, null, null); await insert(tx, 'E2', null, null, null) })
      log('Q1d ออเดอร์สินค้า (roomId NULL)', r.ok, r.ok ? 'INSERT 2 แถวสำเร็จ = ไม่ถูกแตะ' : describeError(r.err).msgHead)

      // Q2: ยกเลิก A แล้วจองทับช่วงเดิมได้ (BR-LODG-13)
      await tx.$executeRawUnsafe(`UPDATE spike_booking SET status='CANCELLED' WHERE id='A'`)
      r = await attempt(tx, () => insert(tx, 'F', 'room1', '2026-09-05', '2026-09-08'))
      log('Q2 ยกเลิกแล้วคิวถูกปล่อยคืน', r.ok, r.ok ? 'จองทับช่วงเดิมสำเร็จ' : describeError(r.err).msgHead)

      // Q2b: การจองที่ CANCELLED ต้องไม่กันกันเอง (ยกเลิกซ้อนช่วงเดียวกันได้)
      r = await attempt(tx, () => insert(tx, 'G', 'room1', '2026-09-05', '2026-09-08', 'CANCELLED'))
      log('Q2b CANCELLED ซ้อนกันเองได้', r.ok, r.ok ? 'INSERT สำเร็จ' : describeError(r.err).msgHead)

      throw new Rollback()
    }, { timeout: 30000, maxWait: 10000 })
  } catch (e) {
    if (!(e instanceof Rollback)) {
      console.error('SPIKE ล้มเหลวนอกเหนือคาด:', e)
      await p.$disconnect()
      process.exit(1)
    }
  }

  console.log('\n===== Q3: รูปร่าง error ที่ Prisma โยนตอนชน EXCLUDE =====')
  console.log(JSON.stringify(errorShape, null, 2))

  // ยืนยันว่า rollback สะอาด — ตารางต้องไม่มีอยู่จริง
  const leftover = await p.$queryRaw`
    SELECT COUNT(*)::int AS n FROM pg_tables WHERE tablename = 'spike_booking'`
  const ext = await p.$queryRaw`
    SELECT COUNT(*)::int AS n FROM pg_extension WHERE extname = 'btree_gist'`
  console.log(`\nrollback สะอาด: ตารางเหลือ ${leftover[0].n} แถว, btree_gist ติดตั้ง ${ext[0].n} (คาดหวัง 0 ทั้งคู่)`)

  const failed = results.filter(r => !r.pass)
  console.log(`\nสรุป: ผ่าน ${results.length - failed.length}/${results.length}`)
  await p.$disconnect()
  process.exit(failed.length ? 1 : 0)
})()

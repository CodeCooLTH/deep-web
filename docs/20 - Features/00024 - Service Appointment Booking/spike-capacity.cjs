/**
 * SPIKE 00024 — พิสูจน์กลไกกันจองเกินความจุ (capacity > 1) ผ่าน "ที่นั่งลำดับที่ n" + EXCLUDE
 *
 * ต่อยอดจาก spike ของ feature 00017 (daterange + roomId) — ของใหม่คือ **มิติที่นั่ง**
 * ที่ทำให้ทรัพยากรหนึ่งหน่วยรับได้หลายคิวพร้อมกันโดยยังได้การรับประกันระดับฐานข้อมูล
 *
 * ทุกอย่างอยู่ใน transaction ที่ ROLLBACK เสมอ + TEMP TABLE (ON COMMIT DROP)
 * → ไม่เหลือร่องรอยบนฐานข้อมูลแม้แต่บรรทัดเดียว (รวมถึง CREATE EXTENSION)
 *
 * ตอบคำถาม:
 *   Q1 ที่นั่งต่างกัน เวลาทับกัน จองได้พร้อมกันจริงไหม (= ความจุ > 1 ใช้ได้)
 *   Q2 ที่นั่งเดียวกัน เวลาทับกัน ถูกปฏิเสธจริงไหม (= กันเกินความจุ)
 *   Q3 '[)' บน tstzrange ให้พฤติกรรม "ต่อกันพอดีไม่ถือว่าทับ" ตาม BR-RSV-14 ไหม
 *   Q4 ทรัพยากรอื่น ที่นั่งเลขเดียวกัน เวลาเดียวกัน ไม่กวนกันใช่ไหม
 *   Q5 resourceId NULL (ออเดอร์สินค้าปกติ) ซ้ำได้ไม่จำกัด = zero-regression (BR-RSV-04)
 *   Q6 ยกเลิกแล้วคืนที่ว่างจริงไหม (BR-RSV-17)
 *   Q7 ข้ามเขตเวลา — เก็บ timestamptz แล้วช่วงเวลาเทียบถูกไหม (BR-RSV-40)
 *   Q8 รูปร่าง error ที่ Prisma โยน — ดักเป็น 409 ได้สะอาดไหม
 */
const fs = require('fs')

// worktree นี้ไม่มี node_modules/.env ของตัวเอง — ยืมจากโปรเจกต์หลัก (แบบเดียวกับ spike 00017)
const MAIN = '/Users/craftman/Projects/safepay'
const envFile = fs.readFileSync(`${MAIN}/.env.local`, 'utf8')
const dbUrl = envFile.split('\n').find((l) => l.startsWith('DATABASE_URL='))
if (!dbUrl) {
  console.error('ไม่พบ DATABASE_URL ใน .env.local')
  process.exit(1)
}
process.env.DATABASE_URL = dbUrl.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')

const { PrismaClient } = require(`${MAIN}/node_modules/@prisma/client`)
const p = new PrismaClient()

class Rollback extends Error {}
const results = []
function log(q, pass, detail) {
  results.push({ q, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${q}  —  ${detail}`)
}

function describeError(e) {
  return {
    ctor: e?.constructor?.name,
    code: e?.code,
    meta: e?.meta,
    msgHead: String(e?.message || '').split('\n').slice(0, 3).join(' | ').slice(0, 400),
    has23P01: /23P01|exclusion/i.test(String(e?.message || '') + JSON.stringify(e?.meta || {})),
  }
}

async function insert(tx, id, resourceId, seatIndex, start, end, status = 'PENDING') {
  await tx.$executeRawUnsafe(
    `INSERT INTO spike_appt (id,"resourceId","seatIndex","serviceStart","serviceEnd",status)
     VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6)`,
    id, resourceId, seatIndex, start, end, status,
  )
}

/**
 * 🛑 บทเรียนจาก 00017: Postgres poison ทั้ง transaction เมื่อ statement ใด ๆ ล้ม (25P02)
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

/**
 * จำลอง service layer จริง: ลองที่นั่ง 1..capacity ตามลำดับ
 * ที่นั่งไหนว่างก็ได้ที่นั่งนั้น — ครบทุกที่นั่งแล้วยังไม่ได้ = เต็ม
 * นี่คือสิ่งที่ SDS จะระบุให้ developer implement
 */
async function bookWithCapacity(tx, id, resourceId, capacity, start, end) {
  for (let seat = 1; seat <= capacity; seat++) {
    const r = await attempt(tx, () => insert(tx, id, resourceId, seat, start, end))
    if (r.ok) return { ok: true, seat }
  }
  return { ok: false, reason: 'FULL' }
}

;(async () => {
  let errorShape = null
  try {
    await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist`)
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE spike_appt (
          id text PRIMARY KEY,
          "resourceId" text,
          "seatIndex" int,
          "serviceStart" timestamptz,
          "serviceEnd" timestamptz,
          status text NOT NULL DEFAULT 'PENDING'
        ) ON COMMIT DROP`)
      await tx.$executeRawUnsafe(`
        ALTER TABLE spike_appt ADD CONSTRAINT spike_appt_no_overlap
        EXCLUDE USING gist (
          "resourceId" WITH =,
          "seatIndex" WITH =,
          tstzrange("serviceStart","serviceEnd",'[)') WITH &&
        ) WHERE ("resourceId" IS NOT NULL AND status <> 'CANCELLED')`)

      // ---------- ฐาน: ทรัพยากร r1 ความจุ 2, นัด A ที่นั่ง 1 เวลา 10:00-11:00 (เวลาไทย) ----------
      await insert(tx, 'A', 'r1', 1, '2026-08-03T10:00:00+07', '2026-08-03T11:00:00+07')

      // Q1: ที่นั่ง 2 เวลาทับกันสนิท → ต้องสำเร็จ (ความจุ > 1 ทำงาน)
      let r = await attempt(tx, () => insert(tx, 'B', 'r1', 2, '2026-08-03T10:00:00+07', '2026-08-03T11:00:00+07'))
      log('Q1 ที่นั่งต่างกัน เวลาทับกัน', r.ok,
          r.ok ? 'สำเร็จ = ความจุมากกว่า 1 ใช้ได้จริง' : describeError(r.err).msgHead)

      // Q2: ที่นั่ง 1 ซ้ำ เวลาทับบางส่วน → ต้องถูกปฏิเสธ + เก็บรูปร่าง error
      r = await attempt(tx, () => insert(tx, 'C', 'r1', 1, '2026-08-03T10:30:00+07', '2026-08-03T11:30:00+07'))
      if (!r.ok) errorShape = describeError(r.err)
      log('Q2 ที่นั่งเดียวกัน เวลาทับ', !r.ok, r.ok ? 'INSERT ผ่าน = constraint ไม่ทำงาน' : 'ถูกปฏิเสธตามคาด')

      // Q2b: ความจุเต็มทั้ง 2 ที่นั่ง → service ต้องสรุปว่า FULL
      let b = await bookWithCapacity(tx, 'D', 'r1', 2, '2026-08-03T10:30:00+07', '2026-08-03T11:30:00+07')
      log('Q2b เต็มทุกที่นั่ง → รายงานว่าเต็ม', !b.ok && b.reason === 'FULL',
          !b.ok ? 'ลองครบ 2 ที่นั่งแล้วเต็ม = ตรงตาม BR-RSV-16' : `หลุดไปได้ที่นั่ง ${b.seat}`)

      // Q2c: ความจุ 3 ช่วงเวลาเดียวกัน → ต้องได้ที่นั่ง 3 (ยังไม่เต็ม)
      b = await bookWithCapacity(tx, 'D2', 'r1', 3, '2026-08-03T10:30:00+07', '2026-08-03T11:30:00+07')
      log('Q2c เพิ่มความจุเป็น 3 → รับเพิ่มได้', b.ok && b.seat === 3,
          b.ok ? `ได้ที่นั่ง ${b.seat}` : 'ถูกปฏิเสธทั้งที่ยังมีที่ว่าง')

      // Q3: ต่อกันพอดี 11:00-12:00 ที่นั่ง 1 → ต้องสำเร็จ (BR-RSV-14)
      r = await attempt(tx, () => insert(tx, 'E', 'r1', 1, '2026-08-03T11:00:00+07', '2026-08-03T12:00:00+07'))
      log('Q3 ช่วงต่อกันพอดี ไม่ถือว่าทับ', r.ok,
          r.ok ? "สำเร็จ = '[)' ให้พฤติกรรมตาม BR-RSV-14" : describeError(r.err).msgHead)

      // Q4: ทรัพยากรอื่น ที่นั่งเลขเดียวกัน เวลาเดียวกัน → ต้องสำเร็จ
      r = await attempt(tx, () => insert(tx, 'F', 'r2', 1, '2026-08-03T10:00:00+07', '2026-08-03T11:00:00+07'))
      log('Q4 ทรัพยากรอื่น ที่นั่งเลขเดียวกัน', r.ok, r.ok ? 'สำเร็จ = constraint ผูกกับ resourceId จริง' : describeError(r.err).msgHead)

      // Q5: resourceId NULL (ออเดอร์สินค้าปกติ) ซ้ำได้ไม่จำกัด → zero-regression
      r = await attempt(tx, async () => {
        await insert(tx, 'G1', null, null, null, null)
        await insert(tx, 'G2', null, null, null, null)
      })
      log('Q5 ออเดอร์สินค้า (resourceId NULL)', r.ok, r.ok ? 'INSERT 2 แถวสำเร็จ = ไม่ถูกแตะ' : describeError(r.err).msgHead)

      // Q6: ยกเลิก A แล้วจองที่นั่ง 1 ช่วงเดิม → ต้องสำเร็จ (BR-RSV-17)
      await tx.$executeRawUnsafe(`UPDATE spike_appt SET status='CANCELLED' WHERE id='A'`)
      r = await attempt(tx, () => insert(tx, 'H', 'r1', 1, '2026-08-03T10:00:00+07', '2026-08-03T10:45:00+07'))
      log('Q6 ยกเลิกแล้วคืนที่ว่าง', r.ok, r.ok ? 'จองช่วงเดิมสำเร็จ = ตรงตาม BR-RSV-17' : describeError(r.err).msgHead)

      // Q7: เขตเวลา — 03:00Z = 10:00+07 ต้องถือว่าทับกับ 10:00-11:00 เวลาไทย
      r = await attempt(tx, () => insert(tx, 'I', 'r2', 1, '2026-08-03T03:30:00Z', '2026-08-03T04:00:00Z'))
      log('Q7 ข้ามเขตเวลาเทียบถูก', !r.ok,
          !r.ok ? 'ถูกปฏิเสธตามคาด = timestamptz เทียบเป็นเวลาสัมบูรณ์ ไม่เพี้ยนตาม offset' : 'ผ่านทั้งที่ควรทับ')

      throw new Rollback()
    }, { timeout: 30000, maxWait: 10000 })
  } catch (e) {
    if (!(e instanceof Rollback)) {
      console.error('SPIKE ล้มเหลวนอกเหนือคาด:', e)
      await p.$disconnect()
      process.exit(1)
    }
  }

  console.log('\n===== Q8: รูปร่าง error ที่ Prisma โยนตอนชน EXCLUDE =====')
  console.log(JSON.stringify(errorShape, null, 2))

  // ยืนยันว่า rollback สะอาด
  const leftover = await p.$queryRaw`SELECT COUNT(*)::int AS n FROM pg_tables WHERE tablename = 'spike_appt'`
  const ext = await p.$queryRaw`SELECT COUNT(*)::int AS n FROM pg_extension WHERE extname = 'btree_gist'`
  // หมายเหตุ: ต่างจาก spike 00017 ตรงที่ btree_gist ตอนนี้ "ติดตั้งอยู่แล้ว" (= 1) เพราะ migration
  // 20260722000100_booking_fields_and_overlap ของ feature 00017 ขึ้น prod ไปแล้ว
  // → CREATE EXTENSION IF NOT EXISTS ใน spike นี้เป็น no-op ไม่ใช่ร่องรอยที่ spike ทิ้งไว้
  console.log(`\nrollback สะอาด: ตารางเหลือ ${leftover[0].n} (คาดหวัง 0), btree_gist ติดตั้ง ${ext[0].n} (คาดหวัง 1 — มาจาก feature 00017)`)

  const failed = results.filter((r) => !r.pass)
  console.log(`\nสรุป: ผ่าน ${results.length - failed.length}/${results.length}`)
  await p.$disconnect()
  process.exit(failed.length ? 1 : 0)
})()

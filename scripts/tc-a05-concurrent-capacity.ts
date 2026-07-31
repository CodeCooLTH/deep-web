/**
 * TC-A05 — กดพร้อมกันจริง: ความจุ 8 ยิง 12 request พร้อมกัน ต้องสำเร็จพอดี 8 (feature 00024)
 *
 * TestCase.md §2.1: "เทสเดียวที่จับได้ว่า developer implement ด้วย count() แทนการวนที่นั่ง
 * ถ้า implement ผิด เทสนี้จะได้ผลสำเร็จ > 8" — blocker ห้าม merge ถ้าไม่ผ่าน
 *
 * IMPORTANT: ต้องยิงผ่าน **เส้นทาง production จริง** (createOrder() ซึ่งเรียก
 * attachAppointmentInTx → allocateSeat) ไม่ใช่ $executeRaw ตรง — spike ที่ใช้ raw SQL
 * ไม่พิสูจน์ว่า Prisma model call เจอ error รูปเดียวกัน (บทเรียน
 * feedback_spike_must_match_production_path)
 *
 * IMPORTANT: รันได้เฉพาะ Postgres บนเครื่องตัวเอง (Hard Rule 13) — สคริปต์นี้สร้างและลบ
 * ข้อมูลจริง ห้ามชี้ไป DB ที่แชร์กับ prod เด็ดขาด guard ด้านล่างเป็น allowlist ไม่ใช่ denylist
 *
 * วิธีรัน:
 *   DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *   DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *   npx tsx scripts/tc-a05-concurrent-capacity.ts
 */
import { PrismaClient } from '@prisma/client'
import { createOrder } from '../src/services/order.service'
import { AppointmentSlotFullError } from '../src/lib/appointments'

const dbUrl = process.env.DATABASE_URL ?? ''
const isLocal =
  /^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(dbUrl)
if (!isLocal) {
  console.error(
    '[TC-A05] DATABASE_URL ต้องชี้ Postgres บนเครื่องตัวเองเท่านั้น — สคริปต์นี้สร้าง/ลบข้อมูลจริง\n' +
      'ดู CLAUDE.md Hard Rule 13 + docs/conventions/test-db-safety.md',
  )
  process.exit(1)
}

const prisma = new PrismaClient()

// ค่ามาตรฐานตาม TestCase.md; ปรับผ่าน env เพื่อทดสอบภาระที่หนักกว่าได้
// (advisory lock ทำให้การจัดสรรเรียงคิว — ต้องพิสูจน์ว่าคนเยอะแล้วไม่ไปชน transaction timeout)
const CAPACITY = Number(process.env.TC_A05_CAPACITY ?? 8)
const ATTEMPTS = Number(process.env.TC_A05_ATTEMPTS ?? 12)
const STAMP = `tc-a05-${process.pid}`

async function main() {
  // ── seed ──────────────────────────────────────────────────────────────────
  const user = await prisma.user.create({
    data: {
      username: `${STAMP}-owner`,
      displayName: 'TC-A05 เจ้าของร้าน',
    },
  })
  const shop = await prisma.shop.create({
    data: {
      userId: user.id,
      kind: 'BUSINESS',
      vertical: 'GENERAL',
      shopName: 'TC-A05 ร้านทดสอบ',
      businessType: 'COMPANY',
    },
  })
  const resource = await prisma.serviceResource.create({
    data: { shopId: shop.id, name: 'คลาสเช้า', capacity: CAPACITY },
  })

  // ทุก request ขอช่วงเวลาเดียวกันเป๊ะ — บังคับให้ชนกันทุกคู่
  const start = new Date('2026-09-01T09:00:00+07:00')
  const end = new Date('2026-09-01T10:00:00+07:00')

  console.log(`[TC-A05] ความจุ ${CAPACITY} · ยิง ${ATTEMPTS} request พร้อมกัน · ช่วง 09:00-10:00`)

  const testPhones = Array.from({ length: ATTEMPTS }, (_, i) => `09000000${`${i}`.padStart(2, '0')}`)

  // ── ยิงพร้อมกันจริง ────────────────────────────────────────────────────────
  // Promise.all เริ่มทุกตัวก่อน await — ไม่ใช่ลูป await ทีละตัวซึ่งจะกลายเป็นเรียงลำดับ
  // และผ่านเทสได้แม้ implement ผิด
  const results = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, (_, i) =>
      createOrder(shop.id, {
        type: 'SERVICE',
        items: [{ name: `คลาสโยคะ #${i + 1}`, qty: 1, price: 500 }],
        buyerName: `ลูกค้า ${i + 1}`,
        buyerContact: testPhones[i],
        appointment: { resourceId: resource.id, start, end },
      }),
    ),
  )

  const ok = results.filter((r) => r.status === 'fulfilled').length
  const slotFull = results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof AppointmentSlotFullError,
  ).length
  const otherErrors = results.filter(
    (r) => r.status === 'rejected' && !(r.reason instanceof AppointmentSlotFullError),
  )

  // ── ตรวจจาก DB จริง ไม่เชื่อผลลัพธ์ของแอปอย่างเดียว ─────────────────────────
  const rows = await prisma.order.findMany({
    where: {
      serviceResourceId: resource.id,
      status: { not: 'CANCELLED' },
      serviceStart: { lt: end },
      serviceEnd: { gt: start },
    },
    select: { serviceSeat: true },
  })
  const seats = rows.map((r) => r.serviceSeat)
  const uniqueSeats = new Set(seats)

  console.log(`[TC-A05] สำเร็จ ${ok} · เต็มคิว (409) ${slotFull} · error อื่น ${otherErrors.length}`)
  console.log(`[TC-A05] แถวจริงใน DB ที่ทับช่วงนี้: ${rows.length}`)
  console.log(`[TC-A05] ที่นั่งที่ถูกใช้: ${[...uniqueSeats].sort((a, b) => (a ?? 0) - (b ?? 0)).join(', ')}`)

  const checks = [
    [`สำเร็จพอดี ${CAPACITY}`, ok === CAPACITY],
    [`ถูกปฏิเสธด้วย 409 พอดี ${ATTEMPTS - CAPACITY}`, slotFull === ATTEMPTS - CAPACITY],
    ['ไม่มี error ชนิดอื่น', otherErrors.length === 0],
    [`แถวจริงใน DB ไม่เกินความจุ (${rows.length} <= ${CAPACITY})`, rows.length <= CAPACITY],
    ['ไม่มีที่นั่งซ้ำกัน', uniqueSeats.size === rows.length],
    [
      `ทุกที่นั่งอยู่ในช่วง 1..${CAPACITY}`,
      seats.every((s) => s != null && s >= 1 && s <= CAPACITY),
    ],
  ] as const

  let failed = false
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${label}`)
    if (!pass) failed = true
  }
  if (otherErrors.length > 0) {
    console.log('  error อื่นที่เจอ:')
    for (const e of otherErrors.slice(0, 3)) {
      console.log(`    ${(e as PromiseRejectedResult).reason}`)
    }
  }

  // ── ล้างข้อมูลที่สคริปต์นี้สร้างเอง (scope ด้วย id เสมอ — Hard Rule 13) ──────
  const orderIds = (
    await prisma.order.findMany({ where: { shopId: shop.id }, select: { id: true } })
  ).map((o) => o.id)
  if (orderIds.length > 0) {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
  }
  // Customer เป็นตารางระดับ global (ผูกเบอร์ ไม่ผูกร้าน) — ลบด้วยเบอร์ที่สคริปต์นี้สร้างเองเท่านั้น
  await prisma.customer.deleteMany({ where: { phone: { in: testPhones } } })
  await prisma.serviceResource.deleteMany({ where: { shopId: shop.id } })
  await prisma.shop.deleteMany({ where: { id: shop.id } })
  await prisma.user.deleteMany({ where: { id: user.id } })
  console.log('[TC-A05] ล้างข้อมูลทดสอบแล้ว')

  process.exit(failed ? 1 : 0)
}

main()
  .catch(async (e) => {
    console.error('[TC-A05] ล้มเหลว:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

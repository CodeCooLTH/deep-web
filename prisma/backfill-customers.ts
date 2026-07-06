/**
 * Backfill — feat 00014 Customer Directory (idempotent, non-destructive)
 * order เก่าที่ customerId=null + buyerContact เป็นเบอร์ไทย → findOrCreate Customer by phone → set customerId.
 * email-only/เบอร์ผิด → ข้าม (คง buyerContact เดิม). set customerId เท่านั้น ไม่แก้ field อื่น.
 *
 * รัน (หลัง apply migration; shared dev/prod DB):
 *   npx dotenv -e .env.local -- npx tsx prisma/backfill-customers.ts
 */
import { PrismaClient } from '@prisma/client'
import { normalizePhone } from '../src/lib/phone'

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
})

async function run() {
  const orders = await prisma.order.findMany({
    where: { customerId: null, buyerContact: { not: null } },
    select: { id: true, buyerContact: true },
  })
  let linked = 0
  for (const o of orders) {
    const phone = normalizePhone(o.buyerContact!)
    if (!phone) continue
    const existing = await prisma.customer.findUnique({ where: { phone }, select: { id: true } })
    const customerId =
      existing?.id ?? (await prisma.customer.create({ data: { phone }, select: { id: true } })).id
    await prisma.order.update({ where: { id: o.id }, data: { customerId } })
    linked++
  }
  const customers = await prisma.customer.count()
  console.log(`[backfill-customers] linked ${linked}/${orders.length} orders • customers ทั้งหมด = ${customers}`)
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })

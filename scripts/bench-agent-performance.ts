/**
 * bench-agent-performance — วัดของจริงว่ารายงานผลงานแอดมิน (feature 00059) เร็วแค่ไหน
 *
 * 🛑 อ่านก่อนรัน
 * - สคริปต์นี้ **เขียนข้อมูลลงฐาน** (ข้อมูลสังเคราะห์ล้วน ทุกแถวขึ้นต้นด้วย `perf59-`)
 * - fail-closed: ปฏิเสธทันทีถ้า DATABASE_URL ไม่ได้ชี้ localhost (HR13/HR14)
 * - **ไม่ลบอะไรเลย** — ล้างของเก่าต้องสั่ง `--purge` เอง และมันลบเฉพาะแถวที่ขึ้นต้น `perf59-`
 *   (ไม่มี DELETE ที่ไม่มี WHERE ในไฟล์นี้ทั้งไฟล์)
 *
 * ทำไมต้องมี: ฐาน dev มีข้อความ 29 แถว — `EXPLAIN ANALYZE` บนนั้นไม่มีความหมาย
 * คำถามที่ต้องตอบคือ "ช้าตอนไหน" ไม่ใช่ "น่าจะเร็วไหม"
 *
 * ใช้:
 *   DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" npx tsx scripts/bench-agent-performance.ts
 *   ... --convs=20000 --msgs=20 --admins=5
 *   ... --purge     (ลบเฉพาะแถว perf59-* แล้วจบ)
 */
import { PrismaClient } from '@prisma/client'

const DB_URL = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL)) {
  console.error('ปฏิเสธการรัน: DATABASE_URL ต้องชี้ localhost เท่านั้น (HR13/HR14)')
  process.exit(1)
}

const prisma = new PrismaClient()
const arg = (name: string, def: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : def
}
const PURGE = process.argv.includes('--purge')
const CONVS = arg('convs', 20_000)
const MSGS = arg('msgs', 20)
const ADMINS = arg('admins', 5)

const SHOP_ID = 'perf59-shop'
const OWNER_ID = 'perf59-owner'
const agentId = (n: number) => `perf59-agent-${n}`

async function purge() {
  // ทุกคำสั่งมี WHERE ที่ผูกกับ prefix ของข้อมูลสังเคราะห์เท่านั้น
  const steps: [string, string][] = [
    ['ChatMessage', `DELETE FROM "ChatMessage" WHERE "id" LIKE 'perf59-%'`],
    ['Order', `DELETE FROM "Order" WHERE "id" LIKE 'perf59-%'`],
    ['Conversation', `DELETE FROM "Conversation" WHERE "id" LIKE 'perf59-%'`],
    ['ShopMember', `DELETE FROM "ShopMember" WHERE "id" LIKE 'perf59-%'`],
    ['Shop', `DELETE FROM "Shop" WHERE "id" LIKE 'perf59-%'`],
    ['User', `DELETE FROM "User" WHERE "id" LIKE 'perf59-%'`],
  ]
  for (const [label, sql] of steps) {
    const n = await prisma.$executeRawUnsafe(sql)
    console.log(`  ล้าง ${label}: ${n} แถว`)
  }
}

async function seed() {
  console.log(`seed: ${CONVS.toLocaleString()} เธรด × ${MSGS} ข้อความ · แอดมิน ${ADMINS} คน`)

  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" ("id","displayName","username","updatedAt")
    SELECT 'perf59-agent-'||i, 'แอดมิน '||i, 'perf59_agent_'||i, now()
    FROM generate_series(0, ${ADMINS - 1}) AS i
    ON CONFLICT ("id") DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "User" ("id","displayName","username","updatedAt")
    VALUES ('${OWNER_ID}','เจ้าของร้าน (bench)','perf59_owner', now())
    ON CONFLICT ("id") DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Shop" ("id","userId","shopName","updatedAt","kind","vertical")
    VALUES ('${SHOP_ID}','${OWNER_ID}','ร้านทดสอบประสิทธิภาพ', now(), 'BUSINESS','ONLINE_SALES')
    ON CONFLICT ("id") DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ShopMember" ("id","shopId","userId","role","updatedAt")
    SELECT 'perf59-sm-'||i, '${SHOP_ID}', 'perf59-agent-'||i, 'ADMIN', now()
    FROM generate_series(0, ${ADMINS - 1}) AS i
    ON CONFLICT ("id") DO NOTHING`)
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ShopMember" ("id","shopId","userId","role","updatedAt")
    VALUES ('perf59-sm-owner','${SHOP_ID}','${OWNER_ID}','OWNER', now())
    ON CONFLICT ("id") DO NOTHING`)

  // เธรดกระจาย 120 วันย้อนหลัง — ครอบทั้งช่วงตั้งต้น 7 วันและเพดาน 92 วัน
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Conversation" ("id","shopId","channel","createdAt","lastMessageAt","isSpam","referralSource")
    SELECT
      'perf59-c-'||i,
      '${SHOP_ID}',
      (ARRAY['MESSENGER','INSTAGRAM','LINE','DEEP'])[1+(i%4)],
      now() - ((i % 120) * INTERVAL '1 day') - ((i % 19) * INTERVAL '1 hour'),
      now() - ((i % 120) * INTERVAL '1 day') - ((i % 19) * INTERVAL '1 hour') + INTERVAL '3 hour',
      (i % 50 = 0),
      CASE WHEN i % 5 = 0 THEN 'ADS' WHEN i % 5 = 1 THEN 'SHORTLINK' ELSE NULL END
    FROM generate_series(1, ${CONVS}) AS i`)

  /* ข้อความ: รอบละ 4 ใบ (ลูกค้า 2 → ร้าน 2) ⇒ ใบที่สองของร้านต้องไม่ถูกนับเป็นอีกรอบ
     - จังหวะห่างต่างกันตามเธรด ⇒ เวลาตอบคร่อมเส้น SLA 300 วิ ทั้งสองฝั่ง
     - แอดมินเปลี่ยนมือกลางเธรด ⇒ มีเคสส่งต่องานจริง
     - ทุกใบที่ 17 ของร้านเป็นบอท · ทุกใบที่ 23 เป็นคำตอบจาก Business Suite (ไม่รู้ว่าใครตอบ)
     - ทุกใบที่ 31 ถูกลบ */
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ChatMessage" ("id","conversationId","senderRole","senderUserId","autoReplyKind","isDeleted","type","body","createdAt")
    SELECT
      'perf59-m-'||i||'-'||j,
      'perf59-c-'||i,
      role,
      CASE WHEN role = 'SHOP' AND NOT is_bot AND NOT is_anon
           THEN 'perf59-agent-'||(((i + CASE WHEN j > ${MSGS} / 2 THEN 1 ELSE 0 END) % ${ADMINS}))
           ELSE NULL END,
      CASE WHEN is_bot THEN 'AUTO' ELSE NULL END,
      (j % 31 = 30),
      'TEXT',
      'bench message',
      conv_created
        + (j * ((30 + (i % 7) * 40) * INTERVAL '1 second'))
        + CASE WHEN role = 'SHOP' THEN ((i % ${ADMINS}) * INTERVAL '40 second') ELSE INTERVAL '0' END
    FROM generate_series(1, ${CONVS}) AS i
    CROSS JOIN generate_series(0, ${MSGS - 1}) AS j
    CROSS JOIN LATERAL (SELECT
      CASE WHEN j % 4 < 2 THEN 'BUYER' ELSE 'SHOP' END AS role,
      (j % 17 = 16) AS is_bot,
      (j % 23 = 22) AS is_anon,
      now() - ((i % 120) * INTERVAL '1 day') - ((i % 19) * INTERVAL '1 hour') AS conv_created
    ) v
    ORDER BY i, j`)

  /* ออเดอร์: 1 ใน 3 ของเธรด · บางเธรดมี 2 ใบ · 30% ไม่มีคนกดสร้าง (บังคับให้ตกไปใช้เจ้าของเธรด) */
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Order" ("id","publicToken","shopId","totalAmount","updatedAt","createdAt","conversationId","createdByUserId","status","orderNo")
    SELECT
      'perf59-o-'||i||'-'||k,
      'perf59-tok-'||i||'-'||k,
      '${SHOP_ID}',
      500 + (i % 40) * 75,
      now(),
      now() - ((i % 120) * INTERVAL '1 day') + INTERVAL '90 minute',
      'perf59-c-'||i,
      CASE WHEN i % 10 < 7 THEN 'perf59-agent-'||((i + 1) % ${ADMINS}) ELSE NULL END,
      (ARRAY['CONFIRMED','CONFIRMED','CONFIRMED','PENDING','CANCELLED','SHIPPED'])[1+(i%6)],
      'DP-BENCH-'||i||'-'||k
    FROM generate_series(1, ${CONVS}) AS i
    CROSS JOIN generate_series(0, CASE WHEN i % 9 = 0 THEN 1 ELSE 0 END) AS k
    WHERE i % 3 = 0`)

  await prisma.$executeRawUnsafe(`ANALYZE "Conversation"`)
  await prisma.$executeRawUnsafe(`ANALYZE "ChatMessage"`)
  await prisma.$executeRawUnsafe(`ANALYZE "Order"`)
}

async function counts() {
  const r = await prisma.$queryRawUnsafe<
    { convs: number; msgs: number; orders: number; human: number }[]
  >(`SELECT
      (SELECT COUNT(*) FROM "Conversation" WHERE "shopId"='${SHOP_ID}')::int AS convs,
      (SELECT COUNT(*) FROM "ChatMessage" WHERE "id" LIKE 'perf59-%')::int AS msgs,
      (SELECT COUNT(*) FROM "Order" WHERE "shopId"='${SHOP_ID}')::int AS orders,
      (SELECT COUNT(*) FROM "ChatMessage" WHERE "id" LIKE 'perf59-%'
         AND "senderRole"='SHOP' AND "senderUserId" IS NOT NULL AND "autoReplyKind" IS NULL)::int AS human`)
  return r[0]
}

async function main() {
  if (PURGE) {
    console.log('ล้างข้อมูลสังเคราะห์ (เฉพาะแถวที่ขึ้นต้น perf59-)')
    await purge()
    await prisma.$disconnect()
    return
  }
  const t0 = Date.now()
  await seed()
  console.log(`seed เสร็จใน ${((Date.now() - t0) / 1000).toFixed(1)} วิ`)
  const c = await counts()
  console.log(
    `ในฐานตอนนี้: เธรด ${c.convs.toLocaleString()} · ข้อความ ${c.msgs.toLocaleString()} ` +
      `(คำตอบที่ระบุตัวคนได้ ${c.human.toLocaleString()}) · ออเดอร์ ${c.orders.toLocaleString()}`,
  )
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})

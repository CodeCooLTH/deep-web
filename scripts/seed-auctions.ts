/**
 * Seed ข้อมูลประมูลตัวอย่างสำหรับ Buyer App (รันหลัง `npm run migrate`).
 *
 *   npx dotenv -e .env -- npx tsx scripts/seed-auctions.ts
 *
 * idempotent ราย-ส่วน (รันซ้ำได้ ไม่ทับ):
 *  1) ร้าน demo (ถ้าไม่มีร้านเลย)
 *  2) auction live 6 รายการ (ถ้ายังไม่มี live)
 *  3) Phase 2 demo: auction ที่ "ปิดแล้ว" + ผู้ชนะ = test user 0000000001
 *     → พอเปิดแอป (browse/orders) ระบบ settle อัตโนมัติ → สร้าง Order ให้ 0000000001
 *       เห็นใน "ออเดอร์ / ที่ฉันชนะ"
 *
 * ⚠️ เขียนลง DB ที่ตั้งใน .env (local docker) เท่านั้น.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const HOUR = 3600 * 1000

const SAMPLE = [
  { title: 'พระเครื่องหลวงพ่อรวย รุ่นเสาร์ห้า', startPrice: 1500, bidIncrement: 100, category: 'พระเครื่อง', endInHours: 6 },
  { title: 'นาฬิกา Seiko Vintage 1970', startPrice: 3200, bidIncrement: 200, category: 'นาฬิกา', endInHours: 12 },
  { title: 'เหรียญกษาปณ์เก่า สะสม', startPrice: 800, bidIncrement: 50, category: 'ของสะสม', endInHours: 3 },
  { title: 'กล้องฟิล์ม Canon AE-1', startPrice: 2500, bidIncrement: 150, category: 'กล้อง', endInHours: 24 },
  { title: 'พระสมเด็จวัดระฆัง', startPrice: 5000, bidIncrement: 300, category: 'พระเครื่อง', endInHours: 48 },
  { title: 'แสตมป์หายาก ชุดรัชกาลที่ 9', startPrice: 1200, bidIncrement: 100, category: 'ของสะสม', endInHours: 8 },
]

const ENDED_TITLE = 'นาฬิกา Rolex โบราณ (ประมูลปิดแล้ว)'
const TEST_PHONE = '0000000001' // ตรงกับ TEST_ACCOUNTS ใน lib/otp (dev login)

// รูป demo ให้ตรงหมวด (loremflickr ตามคีย์เวิร์ด) — lock=ความยาวชื่อ ให้ภาพคงที่/ต่างกันต่อรายการ
function img(title: string) {
  const kw = /นาฬิกา|Rolex|Seiko/.test(title)
    ? 'watch'
    : /พระ/.test(title)
      ? 'amulet'
      : /กล้อง|Canon/.test(title)
        ? 'camera'
        : /เหรียญ/.test(title)
          ? 'coin'
          : /แสตมป์/.test(title)
            ? 'stamp'
            : 'antique'
  return `https://loremflickr.com/600/600/${kw}?lock=${title.length}`
}

async function main() {
  // 1) ร้าน
  let shop = await prisma.shop.findFirst({ select: { id: true, shopName: true } })
  if (!shop) {
    const user = await prisma.user.create({
      data: {
        displayName: 'ร้านประมูลตัวอย่าง',
        username: `demo_seller_${Date.now()}`,
        isShop: true,
        shop: { create: { shopName: 'ร้านประมูลตัวอย่าง', businessType: 'INDIVIDUAL' } },
      },
      include: { shop: { select: { id: true, shopName: true } } },
    })
    shop = user.shop!
    console.log(`[seed] สร้างร้าน "${shop.shopName}"`)
  }

  // 2) auction live
  const liveCount = await prisma.auction.count({ where: { status: 'live' } })
  if (liveCount === 0) {
    const now = Date.now()
    await prisma.auction.createMany({
      data: SAMPLE.map((s) => ({
        shopId: shop!.id,
        title: s.title,
        imageUrl: img(s.title),
        startPrice: s.startPrice,
        currentPrice: s.startPrice,
        bidIncrement: s.bidIncrement,
        endTime: new Date(now + s.endInHours * HOUR),
        status: 'live',
        category: s.category,
      })),
    })
    console.log(`[seed] สร้าง auction live ${SAMPLE.length} รายการ`)
  } else {
    console.log(`[seed] มี auction live อยู่แล้ว ${liveCount} — ข้าม`)
  }

  // 3) Phase 2 demo — ended auction ที่ test user ชนะ
  const test = await prisma.user.upsert({
    where: { phone: TEST_PHONE },
    update: {},
    create: {
      phone: TEST_PHONE,
      displayName: 'ผู้ซื้อตัวอย่าง',
      username: `buyer_demo_${Date.now()}`,
      verifications: { create: { type: 'PHONE_OTP', level: 1, status: 'APPROVED', reviewedAt: new Date() } },
    },
    select: { id: true },
  })

  const already = await prisma.auction.findFirst({ where: { title: ENDED_TITLE }, select: { id: true } })
  if (!already) {
    const ended = await prisma.auction.create({
      data: {
        shopId: shop.id,
        title: ENDED_TITLE,
        imageUrl: img(ENDED_TITLE),
        startPrice: 8000,
        currentPrice: 12000, // = ราคาบิดสูงสุด
        bidIncrement: 500,
        endTime: new Date(Date.now() - 1 * HOUR), // หมดเวลาแล้ว 1 ชม.
        status: 'live', // ยัง live → settleEndedAuctions จะปิด + ออก order
        category: 'นาฬิกา',
      },
    })
    await prisma.bid.create({ data: { auctionId: ended.id, bidderId: test.id, amount: 12000 } })
    console.log(`[seed] สร้าง ended auction (ผู้ชนะ = ${TEST_PHONE}) → เปิดแอปแล้วจะกลายเป็น order`)
  } else {
    console.log('[seed] ended-demo มีอยู่แล้ว — ข้าม')
  }

  // refresh รูปของ sample ที่มีอยู่ ให้ตรงหมวด (idempotent — รันซ้ำอัปเดตรูปได้)
  for (const s of SAMPLE) {
    await prisma.auction.updateMany({ where: { title: s.title }, data: { imageUrl: img(s.title) } })
  }
  await prisma.auction.updateMany({ where: { title: ENDED_TITLE }, data: { imageUrl: img(ENDED_TITLE) } })
  console.log('[seed] refresh รูปตามหมวดแล้ว')

  const total = await prisma.auction.count()
  console.log(`[seed] เสร็จ — auction รวม ${total} รายการ`)
}

main()
  .catch((e) => {
    console.error('[seed] ล้มเหลว', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

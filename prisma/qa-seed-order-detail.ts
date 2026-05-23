/**
 * QA seed — Order Detail V1 (8 scenarios) — TEST DATA ONLY (ไม่ใช่ production)
 *
 * สร้าง order ครบ lifecycle ให้ QA เปิด /o/{token} เทียบ mockup
 * docs/mockups/order-detail-scenarios.html ได้ทุก state.
 *
 * วิธีรัน (Supabase = dev DB ที่ dev server ใช้):
 *   npx dotenv -e .env.local -- npx tsx prisma/qa-seed-order-detail.ts
 *
 * idempotent: ลบ order ชุดนี้ (โดย publicToken คงที่) แล้วสร้างใหม่ทุกครั้ง.
 * ต้องมี base seller/shop อยู่ก่อน (รัน `npm run seed:supabase` ถ้ายังไม่มี).
 * รูปสินค้า + avatar ใช้ picsum (DEV/TEST เท่านั้น — next.config allowlist).
 * buyer ทุก order ใช้เบอร์เดียว 0812345678 → QA unlock ด้วยเบอร์นี้.
 */
import { PrismaClient } from '@prisma/client'

const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
const prisma = new PrismaClient({ datasources: { db: { url: connectionUrl } } })

const SELLER_ID = 'e7e8d500-600a-4484-a741-3a6475a6b969'
const SHOP_ID = '9226d13a-8b25-4ab6-8c50-d77bce4086af'
const ADMIN_ID = 'f0eb0238-a37a-4aea-b125-a78b7c4e7b61'
const BUYER_CONTACT = '0812345678'

// publicToken คงที่ (valid UUID v4 — ต้องผ่าน UUID_V4_RE ใน page.tsx)
const TOK = {
  pendingTransfer: 'aa000001-1111-4111-8111-111111111111',
  pendingCOD: 'aa000002-2222-4222-8222-222222222222',
  shipped: 'aa000003-3333-4333-8333-333333333333',
  confirmedNoReview: 'aa000004-4444-4444-8444-444444444444',
  confirmedReviewed: 'aa000005-5555-4555-8555-555555555555',
  cancelledSeller: 'aa000006-6666-4666-8666-666666666666',
  cancelledBuyer: 'aa000007-7777-4777-8777-777777777777',
  digitalPending: 'aa000008-8888-4888-8888-888888888888',
}

async function seed() {
  // 0. guard: ต้องมี shop/seller ก่อน
  const shop = await prisma.shop.findUnique({ where: { id: SHOP_ID } })
  if (!shop) {
    throw new Error(
      `ไม่พบ SHOP_ID ${SHOP_ID} ใน DB — รัน "npm run seed:supabase" ก่อนเพื่อสร้าง base seller/shop`,
    )
  }

  // 1. seller user: ตั้ง avatar (picsum) + trustScore=65 (= Deep Silver, ตรง mockup)
  await prisma.user.update({
    where: { id: SELLER_ID },
    data: { avatar: 'https://picsum.photos/seed/btshop/200/200', trustScore: 65 },
  })

  // 2. L2 DOCUMENT APPROVED → maxVerifyLevel>=1 → verify badge ขึ้น
  const existingL2 = await prisma.verificationRecord.findFirst({
    where: { userId: SELLER_ID, type: 'DOCUMENT', level: 2 },
  })
  if (!existingL2) {
    await prisma.verificationRecord.create({
      data: {
        userId: SELLER_ID,
        type: 'DOCUMENT',
        level: 2,
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedById: ADMIN_ID,
      },
    })
  } else if (existingL2.status !== 'APPROVED') {
    await prisma.verificationRecord.update({
      where: { id: existingL2.id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: ADMIN_ID },
    })
  }

  // 3. products (idempotent by fixed id) — มีรูป picsum เพื่อทดสอบ thumbnail
  const PROD = {
    led: 'bb000001-0001-4001-8001-000000000001',
    install: 'bb000002-0002-4002-8002-000000000002',
    course: 'bb000003-0003-4003-8003-000000000003',
  }
  await prisma.product.upsert({
    where: { id: PROD.led },
    update: { images: ['https://picsum.photos/seed/carled/300/300'] },
    create: {
      id: PROD.led,
      shopId: SHOP_ID,
      name: 'ชุดไฟหน้า LED Premium',
      price: 2500,
      images: ['https://picsum.photos/seed/carled/300/300'],
      type: 'PHYSICAL',
      fulfillmentMode: 'SHIPPED',
    },
  })
  await prisma.product.upsert({
    where: { id: PROD.install },
    update: { images: ['https://picsum.photos/seed/garage/300/300'] },
    create: {
      id: PROD.install,
      shopId: SHOP_ID,
      name: 'ค่าติดตั้ง',
      price: 1000,
      images: ['https://picsum.photos/seed/garage/300/300'],
      type: 'SERVICE',
      fulfillmentMode: 'NO_SHIPPING',
    },
  })
  await prisma.product.upsert({
    where: { id: PROD.course },
    update: { images: ['https://picsum.photos/seed/ecourse/300/300'] },
    create: {
      id: PROD.course,
      shopId: SHOP_ID,
      name: 'คอร์สแต่งรถออนไลน์ (Pro)',
      price: 3500,
      images: ['https://picsum.photos/seed/ecourse/300/300'],
      type: 'DIGITAL',
      fulfillmentMode: 'NO_SHIPPING',
    },
  })

  // 4. ลบ order ชุด QA เดิม (cascade ลบ items/review/tracking)
  const allTokens = Object.values(TOK)
  await prisma.order.deleteMany({ where: { publicToken: { in: allTokens } } })

  // helper สร้าง order physical 2 items (LED + ติดตั้ง) รวม 3,500
  const physicalItems = {
    create: [
      { productId: PROD.led, name: 'ชุดไฟหน้า LED Premium', qty: 1, price: 2500 },
      { productId: PROD.install, name: 'ค่าติดตั้ง', qty: 1, price: 1000 },
    ],
  }

  // 1) PENDING · โอนเงิน · physical (scenario 1&2 — slip = OOS-1 deferred, render เหมือนกัน)
  await prisma.order.create({
    data: {
      publicToken: TOK.pendingTransfer,
      shopId: SHOP_ID,
      type: 'PHYSICAL',
      totalAmount: 3500,
      status: 'PENDING',
      fulfillmentMode: 'SHIPPED',
      paymentMethod: 'พร้อมเพย์ 081-234-5678',
      buyerContact: BUYER_CONTACT,
      items: physicalItems,
    },
  })

  // 2) PENDING · COD · physical (scenario 3)
  await prisma.order.create({
    data: {
      publicToken: TOK.pendingCOD,
      shopId: SHOP_ID,
      type: 'PHYSICAL',
      totalAmount: 3500,
      status: 'PENDING',
      fulfillmentMode: 'SHIPPED',
      paymentMethod: 'เก็บเงินปลายทาง (COD)',
      buyerContact: BUYER_CONTACT,
      items: physicalItems,
    },
  })

  // 3) SHIPPED · physical + tracking (scenario 4)
  const shipped = await prisma.order.create({
    data: {
      publicToken: TOK.shipped,
      shopId: SHOP_ID,
      type: 'PHYSICAL',
      totalAmount: 3500,
      status: 'SHIPPED',
      fulfillmentMode: 'SHIPPED',
      paymentMethod: 'พร้อมเพย์ 081-234-5678',
      buyerContact: BUYER_CONTACT,
      items: physicalItems,
    },
  })
  await prisma.shipmentTracking.create({
    data: { orderId: shipped.id, provider: 'Flash Express', trackingNo: 'TH29384756XK' },
  })

  // 4) CONFIRMED · ยังไม่รีวิว (scenario 5)
  await prisma.order.create({
    data: {
      publicToken: TOK.confirmedNoReview,
      shopId: SHOP_ID,
      type: 'PHYSICAL',
      totalAmount: 3500,
      status: 'CONFIRMED',
      fulfillmentMode: 'SHIPPED',
      paymentMethod: 'พร้อมเพย์ 081-234-5678',
      buyerContact: BUYER_CONTACT,
      items: physicalItems,
    },
  })

  // 5) CONFIRMED · รีวิวแล้ว (scenario 6)
  const reviewed = await prisma.order.create({
    data: {
      publicToken: TOK.confirmedReviewed,
      shopId: SHOP_ID,
      type: 'PHYSICAL',
      totalAmount: 3500,
      status: 'CONFIRMED',
      fulfillmentMode: 'SHIPPED',
      paymentMethod: 'พร้อมเพย์ 081-234-5678',
      buyerContact: BUYER_CONTACT,
      items: physicalItems,
    },
  })
  await prisma.review.create({
    data: {
      orderId: reviewed.id,
      reviewerContact: BUYER_CONTACT,
      rating: 5,
      comment: 'ของแท้ ส่งไว ติดตั้งให้เรียบร้อย ไฟสว่างมากครับ ประทับใจการบริการ แนะนำเลย',
    },
  })

  // 6) CANCELLED · seller ยกเลิก (scenario 7a)
  await prisma.order.create({
    data: {
      publicToken: TOK.cancelledSeller,
      shopId: SHOP_ID,
      type: 'PHYSICAL',
      totalAmount: 3500,
      status: 'CANCELLED',
      fulfillmentMode: 'SHIPPED',
      paymentMethod: 'พร้อมเพย์ 081-234-5678',
      buyerContact: BUYER_CONTACT,
      cancelInitiator: 'seller',
      items: physicalItems,
    },
  })

  // 7) CANCELLED · buyer ยกเลิก (scenario 7b — ทดสอบ cancelInitiator copy อีกแบบ)
  await prisma.order.create({
    data: {
      publicToken: TOK.cancelledBuyer,
      shopId: SHOP_ID,
      type: 'PHYSICAL',
      totalAmount: 3500,
      status: 'CANCELLED',
      fulfillmentMode: 'SHIPPED',
      paymentMethod: 'เก็บเงินปลายทาง (COD)',
      buyerContact: BUYER_CONTACT,
      cancelInitiator: 'buyer',
      items: physicalItems,
    },
  })

  // 8) DIGITAL · PENDING (scenario 8 — NO_SHIPPING → pill "ส่งมอบแล้ว")
  await prisma.order.create({
    data: {
      publicToken: TOK.digitalPending,
      shopId: SHOP_ID,
      type: 'DIGITAL',
      totalAmount: 3500,
      status: 'PENDING',
      fulfillmentMode: 'NO_SHIPPING',
      paymentMethod: 'พร้อมเพย์ 081-234-5678',
      buyerContact: BUYER_CONTACT,
      // Phase 2 S-10: seed accessUrl เพื่อทดสอบ buyer "เปิด" link + seller view
      accessUrl: 'https://example.com/course-access/bt-premium-pro',
      items: {
        create: [
          { productId: PROD.course, name: 'คอร์สแต่งรถออนไลน์ (Pro)', qty: 1, price: 3500 },
        ],
      },
    },
  })

  console.log('\n✅ Seeded 8 Order Detail V1 scenarios (buyer phone = ' + BUYER_CONTACT + ')\n')
  const labels: Record<string, string> = {
    pendingTransfer: '1+2 PENDING โอนเงิน (slip=Phase2)',
    pendingCOD: '3   PENDING COD',
    shipped: '4   SHIPPED + tracking',
    confirmedNoReview: '5   CONFIRMED ยังไม่รีวิว',
    confirmedReviewed: '6   CONFIRMED รีวิวแล้ว',
    cancelledSeller: '7a  CANCELLED (seller)',
    cancelledBuyer: '7b  CANCELLED (buyer)',
    digitalPending: '8   DIGITAL ส่งมอบแล้ว',
  }
  for (const [k, tok] of Object.entries(TOK)) {
    console.log(`  ${labels[k].padEnd(34)} /o/${tok}`)
  }
  console.log('')

  await prisma.$disconnect()
}

seed().catch((e) => {
  console.error(e.message)
  console.error(e.stack)
  process.exit(1)
})

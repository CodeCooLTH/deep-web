/**
 * สร้างบัญชีผู้ขายทดสอบสำหรับ Apple App Review (Deep Seller iOS 1.0)
 *
 * Base: scripts/create-review-account.ts (บัญชีของ Meta App Review) — เพิ่ม "ข้อมูลให้เห็น"
 * ซึ่งเป็นส่วนที่ Apple ต้องการแต่ Meta ไม่ต้องการ: คนตรวจของ Apple จะเปิดแอปแล้วมองหา
 * ฟีเจอร์ที่ประกาศไว้ตาม Guideline 4.2 ถ้าล็อกอินเข้าไปเจอร้านเปล่าจะถูกตีกลับด้วยเหตุ
 * "ดูฟีเจอร์ที่อ้างถึงไม่ได้"
 *
 * 🛑 เขียนลงฐาน prod — ทุกคำสั่งเป็น create/update เท่านั้น ไม่มี delete/deleteMany ใด ๆ
 * idempotent: รันซ้ำได้ ถ้ามีอยู่แล้วจะอัปเดตค่าที่จำเป็นและ "ไม่สร้างซ้ำ"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 4 ด่านที่ต้องผ่านครบ ถึงจะล็อกอินแล้วใช้งานได้ทันที (อ่านจากโค้ดจริง ไม่ได้เดา):
 *
 *   1. lib/auth.ts `seller-credentials`
 *      username + passwordHash + isShop=true + !isAdmin + deletedAt=null
 *   2. lib/auth.ts `jwt` → needsRegistration
 *      true เมื่อมี Personal shop แต่ user ไม่มี phone → proxy เด้งเข้า /register ทุกหน้า
 *   3. lib/auth.ts `jwt` → needsOnboarding
 *      true เมื่อมี Personal shop แต่ shop ไม่มี slug → proxy เด้งเข้า /onboarding ทุกหน้า
 *   4. Guideline 4.2 — ต้องมีสินค้า/ออเดอร์/แชท ให้คนตรวจเห็นของจริง
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ความเป็นส่วนตัว: ชื่อ/เบอร์/ที่อยู่ของ "ผู้ซื้อ" ในสคริปต์นี้เป็นข้อมูลสมมติทั้งหมด
 * ห้ามใช้บัญชีลูกค้าจริงเป็นบัญชีรีวิวเด็ดขาด — คนตรวจของ Apple จะเห็น PII ของลูกค้าทั้งร้าน
 *
 * เบอร์ที่ใช้ขึ้นต้น 00000000 ซึ่งเป็นไปไม่ได้ในชีวิตจริง — กันชนกับลูกค้าจริง และกัน
 * linkBuyerHistory (user.service) จับคู่ประวัติผู้ซื้อผิดคน
 *
 * รัน: npx tsx scripts/create-appstore-review-account.ts
 */
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'

// ─── ค่าคงที่ของบัญชีรีวิว ────────────────────────────────────────────────────
const USERNAME = 'appreview'
const DISPLAY_NAME = 'Deep App Review'
const SHOP_NAME = 'ร้านตัวอย่าง Deep'
const SLUG = 'app-review-demo'
const PHONE = '0000000018' // เบอร์ที่เป็นไปไม่ได้จริง (ดู comment หัวไฟล์)

/** ผู้ซื้อสมมติ — ต้องเป็น User จริงเพื่อให้เธรดแชท DEEP แสดงชื่อคู่สนทนาได้ถูก */
const BUYERS = [
  { username: 'demo_buyer_a', displayName: 'ลูกค้าตัวอย่าง ก', phone: '0000000101' },
  { username: 'demo_buyer_b', displayName: 'ลูกค้าตัวอย่าง ข', phone: '0000000102' },
] as const

const PRODUCTS = [
  { name: 'เสื้อยืดคอกลม สีขาว', price: 290, sku: 'DEMO-TS-WH', stockQty: 25, cost: 120,
    shortDescription: 'ผ้าฝ้าย 100% ใส่สบาย ระบายอากาศดี' },
  { name: 'กระเป๋าผ้าแคนวาส', price: 450, sku: 'DEMO-BAG-CV', stockQty: 12, cost: 200,
    shortDescription: 'ผ้าแคนวาสหนา ใส่ของได้เยอะ' },
  { name: 'หมวกบักเก็ต สีดำ', price: 350, sku: 'DEMO-HAT-BK', stockQty: 8, cost: 150,
    shortDescription: 'ปีกกว้าง กันแดดได้ดี' },
  { name: 'ถุงเท้าลายทาง (แพ็ก 3 คู่)', price: 190, sku: 'DEMO-SOCK-3', stockQty: 40, cost: 75,
    shortDescription: 'ผ้านุ่ม ไม่รัดข้อเท้า' },
] as const

/**
 * ออเดอร์ตัวอย่าง 3 สถานะ — ให้คนตรวจเห็นว่าระบบติดตามสถานะได้จริง
 *
 * 🛑 ห้ามใส่สถานะที่บล็อกการลบบัญชี (PENDING/SHIPPED) เกินจำเป็น: ถ้าคนตรวจกดลองลบบัญชี
 * ตามที่เราเขียนไว้ใน Review Notes แล้วเจอ "ลบไม่ได้เพราะมีออเดอร์ค้าง" จะดูเหมือนเราโกหก
 * → ให้มี PENDING/SHIPPED อย่างละ 1 ใบพอเป็นตัวอย่าง แล้วอธิบายใน Notes ว่าเป็นพฤติกรรม
 *   ที่ตั้งใจ (ดู README ท้ายไฟล์)
 */
const ORDERS = [
  {
    status: 'PENDING',
    buyerName: 'สมชาย ใจดี',
    buyerContact: '0000000201',
    items: [{ idx: 0, qty: 2 }, { idx: 3, qty: 1 }],
    salesChannel: 'FACEBOOK',
    paymentMethod: 'TRANSFER',
    daysAgo: 1,
  },
  {
    status: 'SHIPPED',
    buyerName: 'สมหญิง รักดี',
    buyerContact: '0000000202',
    items: [{ idx: 1, qty: 1 }],
    salesChannel: 'STOREFRONT',
    paymentMethod: 'TRANSFER',
    daysAgo: 4,
  },
  {
    status: 'CONFIRMED',
    buyerName: 'อนันต์ มั่นคง',
    buyerContact: '0000000203',
    items: [{ idx: 2, qty: 1 }, { idx: 0, qty: 1 }],
    salesChannel: 'LINE',
    paymentMethod: 'COD',
    daysAgo: 9,
  },
] as const

const DEMO_ADDRESS = {
  line1: '99/1 หมู่บ้านตัวอย่าง ซอยสาธิต 5',
  subdistrict: 'บางรัก',
  district: 'บางรัก',
  province: 'กรุงเทพมหานคร',
  postcode: '10500',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * รหัสผ่านสุ่มด้วย crypto — ห้ามใช้ Math.random
 * นี่คือบัญชีที่เปิดให้คนนอก (Apple) ล็อกอินบน prod ต้องเดาไม่ได้
 * รูปแบบผ่าน isStrongPassword แน่นอน (พิมพ์ใหญ่ + พิมพ์เล็ก + ตัวเลข + ยาวพอ)
 * ตัดตัวที่อ่านสับสน (0/O/1/l/I) ออกจาก alphabet — คนตรวจต้องพิมพ์ตามได้ไม่ผิด
 */
function makePassword(): string {
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto')
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const raw = randomBytes(18)
  const body = Array.from(raw, (b: number) => alphabet[b % alphabet.length]).join('')
  return `Dp${body}9!`
}

/** shortCode 8 ตัว — มิเรอร์ genShortCode ใน order.service (a-z0-9 ไม่มีตัวสับสน) */
function genShortCode(): string {
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto')
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(randomBytes(8), (b: number) => alphabet[b % alphabet.length]).join('')
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const password = makePassword()
  const passwordHash = await hashPassword(password)

  // ── 1. บัญชีผู้ขาย ─────────────────────────────────────────────────────────
  const existing = await prisma.user.findUnique({
    where: { username: USERNAME },
    select: { id: true, phone: true, deletedAt: true },
  })

  // ถ้าเคยถูกลบไปแล้ว (ทดสอบปุ่มลบบัญชี) ต้องปลุกกลับมา ไม่งั้นล็อกอินไม่ได้
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          isShop: true,
          phone: existing.phone ?? PHONE,
          deletedAt: null,
          deletedReason: null,
          purgedAt: null,
        },
        select: { id: true, username: true, phone: true, isShop: true, isAdmin: true },
      })
    : await prisma.user.create({
        data: {
          username: USERNAME,
          displayName: DISPLAY_NAME,
          phone: PHONE,
          passwordHash,
          isShop: true,
          // L1 อัตโนมัติเหมือน signup ปกติ — ให้หน้า "ยืนยันตน" มีอะไรให้ดู
          verifications: {
            create: { type: 'PHONE_OTP', level: 1, status: 'APPROVED', reviewedAt: new Date() },
          },
        },
        select: { id: true, username: true, phone: true, isShop: true, isAdmin: true },
      })

  // ── 2. ร้าน (PERSONAL + slug) ──────────────────────────────────────────────
  const personal = await prisma.shop.findFirst({
    where: { userId: user.id, kind: 'PERSONAL' },
    select: { id: true, slug: true, shopName: true },
  })

  const shop = personal
    ? await prisma.shop.update({
        where: { id: personal.id },
        // ซ่อมค่าที่ทำให้ proxy เด้ง + ปลด soft-delete ถ้าเคยทดสอบลบบัญชีไป
        data: { slug: personal.slug ?? SLUG, deletedAt: null, deletedReason: null, purgedAt: null },
        select: { id: true, slug: true, shopName: true },
      })
    : await prisma.shop.create({
        data: {
          userId: user.id,
          shopName: SHOP_NAME,
          slug: SLUG,
          kind: 'PERSONAL',
          categories: ['fashion'],
          category: 'fashion',
          description: 'ร้านตัวอย่างสำหรับการตรวจสอบแอป ข้อมูลทั้งหมดเป็นข้อมูลสมมติ',
        },
        select: { id: true, slug: true, shopName: true },
      })

  // กระเป๋าเครดิต SMS — หน้า /wallet ต้องมีแถวนี้ถึงจะไม่ error
  await prisma.sellerWallet.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id, balance: 50 },
  })

  // ── 3. สินค้า ──────────────────────────────────────────────────────────────
  const productIds: string[] = []
  for (const p of PRODUCTS) {
    const found = await prisma.product.findFirst({
      where: { shopId: shop.id, sku: p.sku },
      select: { id: true },
    })
    if (found) {
      productIds.push(found.id)
      continue
    }
    const created = await prisma.product.create({
      data: {
        shopId: shop.id,
        name: p.name,
        sku: p.sku,
        shortDescription: p.shortDescription,
        description: `${p.shortDescription} — สินค้าตัวอย่างสำหรับการตรวจสอบแอป`,
        price: p.price,
        cost: p.cost,
        stockQty: p.stockQty,
        lowStockThreshold: 5,
        type: 'PHYSICAL',
        fulfillmentMode: 'SHIPPED',
        isActive: true,
      },
      select: { id: true },
    })
    productIds.push(created.id)
  }

  // ── 4. ออเดอร์ 3 สถานะ ─────────────────────────────────────────────────────
  // กันสร้างซ้ำด้วย internalNote marker — ไม่มี field ที่ unique ให้ยึด จึงใช้ note เป็นหมุด
  const ORDER_MARKER = '[APP_REVIEW_DEMO]'
  const existingOrders = await prisma.order.count({
    where: { shopId: shop.id, internalNote: { startsWith: ORDER_MARKER } },
  })

  const orderSummaries: { orderNo: string; status: string; total: number }[] = []

  if (existingOrders === 0) {
    for (const [i, o] of ORDERS.entries()) {
      const items = o.items.map((it) => {
        const p = PRODUCTS[it.idx]
        return {
          productId: productIds[it.idx],
          name: p.name,
          qty: it.qty,
          price: p.price,
          cost: p.cost,
        }
      })
      const total = items.reduce((s, it) => s + it.price * it.qty, 0)
      const created = await prisma.order.create({
        data: {
          shopId: shop.id,
          orderNo: `DEMO-${String(i + 1).padStart(4, '0')}`,
          shortCode: genShortCode(),
          status: o.status,
          type: 'PHYSICAL',
          fulfillmentMode: 'SHIPPED',
          totalAmount: total,
          buyerName: o.buyerName,
          buyerContact: o.buyerContact,
          salesChannel: o.salesChannel,
          paymentMethod: o.paymentMethod,
          shippingAddress: DEMO_ADDRESS,
          internalNote: `${ORDER_MARKER} ออเดอร์ตัวอย่างสำหรับการตรวจสอบแอป`,
          createdAt: daysAgo(o.daysAgo),
          items: { create: items },
        },
        select: { orderNo: true, status: true, totalAmount: true },
      })
      orderSummaries.push({
        orderNo: created.orderNo ?? '-',
        status: created.status,
        total: Number(created.totalAmount),
      })
    }
  }

  // ── 5. ผู้ซื้อสมมติ + บทสนทนา ──────────────────────────────────────────────
  const buyerIds: string[] = []
  for (const b of BUYERS) {
    const found = await prisma.user.findUnique({ where: { username: b.username }, select: { id: true } })
    if (found) {
      buyerIds.push(found.id)
      continue
    }
    const created = await prisma.user.create({
      data: { username: b.username, displayName: b.displayName, phone: b.phone },
      select: { id: true },
    })
    buyerIds.push(created.id)
  }

  const CONVERSATIONS = [
    {
      buyerIdx: 0,
      messages: [
        { role: 'BUYER', body: 'สวัสดีค่ะ เสื้อยืดสีขาวมีไซซ์ L ไหมคะ' },
        { role: 'SHOP', body: 'สวัสดีค่ะ มีค่า ไซซ์ L พร้อมส่งเลยค่ะ' },
        { role: 'BUYER', body: 'เอา 2 ตัวค่ะ ส่งเข้ากรุงเทพกี่วันคะ' },
        { role: 'SHOP', body: 'ส่งพรุ่งนี้ ถึงภายใน 2 วันค่ะ' },
      ],
    },
    {
      buyerIdx: 1,
      messages: [
        { role: 'BUYER', body: 'กระเป๋าผ้าใบยังมีของไหมครับ' },
        { role: 'SHOP', body: 'ยังมีครับ เหลือ 12 ใบ' },
      ],
    },
  ] as const

  for (const conv of CONVERSATIONS) {
    const buyerUserId = buyerIds[conv.buyerIdx]
    const found = await prisma.conversation.findFirst({
      where: { shopId: shop.id, buyerUserId },
      select: { id: true },
    })
    if (found) continue

    const last = conv.messages[conv.messages.length - 1]
    const created = await prisma.conversation.create({
      data: {
        shopId: shop.id,
        buyerUserId,
        channel: 'DEEP',
        lastMessageAt: daysAgo(1),
        lastMessagePreview: last.body,
        lastSenderRole: last.role,
      },
      select: { id: true },
    })

    // ไล่เวลาให้ข้อความเรียงถูกลำดับ (ห่างกันครั้งละ 2 นาที ย้อนจากเมื่อวาน)
    for (const [i, m] of conv.messages.entries()) {
      await prisma.chatMessage.create({
        data: {
          conversationId: created.id,
          senderRole: m.role,
          senderUserId: m.role === 'BUYER' ? buyerUserId : user.id,
          type: 'TEXT',
          body: m.body,
          createdAt: new Date(daysAgo(1).getTime() + i * 120_000),
        },
      })
    }
  }

  // ── สรุปผล ────────────────────────────────────────────────────────────────
  // ตรวจซ้ำว่า flag ที่ proxy ใช้ตัดสินเป็น false ทั้งคู่จริง (ถ้า true = ล็อกอินแล้วเด้งวน)
  const needsRegistration = !user.phone
  const needsOnboarding = !shop.slug

  const counts = {
    products: await prisma.product.count({ where: { shopId: shop.id } }),
    orders: await prisma.order.count({ where: { shopId: shop.id } }),
    conversations: await prisma.conversation.count({ where: { shopId: shop.id } }),
  }

  console.log(
    JSON.stringify(
      {
        action: existing ? 'อัปเดตบัญชีเดิม' : 'สร้างบัญชีใหม่',
        '── ใส่ใน App Store Connect ──': '',
        username: USERNAME,
        password,
        '── ตรวจสอบ ──': '',
        login_ok: user.isShop && !user.isAdmin,
        needsRegistration,
        needsOnboarding,
        shopName: shop.shopName,
        publicUrl: `https://deepthailand.app/b/${shop.slug}`,
        counts,
        newOrders: orderSummaries,
      },
      null,
      2,
    ),
  )

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})

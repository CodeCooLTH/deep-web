/**
 * seed-chat-room-demo — กล่องแชทตัวอย่างสำหรับดู UI บนเครื่องตัวเอง
 *
 * ทำไมต้องมี: ฐาน local มี `conversation = 0` ⇒ ล็อกอินได้ก็ไม่มีอะไรให้ดู
 * สคริปต์นี้สร้าง **9 เธรด** ครอบสถานะที่ UI ต้องรับมือจริง เพื่อให้เปิดดูได้เลยโดยไม่ต้อง
 * ไปนั่งส่งข้อความเอง
 *
 * ทุกแถวใช้ id ตายตัว prefix `seed-crd-` ⇒ รันซ้ำได้ไม่สร้างซ้ำ · ลบด้วย `--clean`
 * (allowlist localhost ตาม HR13/14 — ชี้ปลายทางอื่น = throw ทันที)
 *
 * 🛑 ต้องโหลด .env.local ด้วย — CHANNEL_TOKEN_KEY อยู่ในนั้น (ทั้งสองไฟล์ชี้ฐาน localhost)
 * รัน:  npx dotenv -e .env.local -e .env -- npx tsx scripts/seed-chat-room-demo.ts
 * ลบ:   npx dotenv -e .env.local -e .env -- npx tsx scripts/seed-chat-room-demo.ts --clean
 */

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password'
// 🛑 ต้องเข้ารหัสด้วยฟังก์ชันจริง — `decryptToken` ต้องการรูปแบบ `iv.tag.data` เท่านั้น
// ใส่สตริงมั่ว ๆ ลงไป = เปิดห้องแชทแล้ว 500 ทั้งหน้า (เจอเอง 2026-08-16)
import { encryptToken } from '../src/lib/token-crypto'

const prisma = new PrismaClient()

const SHOP_SLUG = 'qa-online'
const DEMO_PASSWORD = 'Deep@1234'
const ID = (s: string) => `seed-crd-${s}`

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('ไม่พบ DATABASE_URL')
  const host = new URL(url).hostname
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`ปฏิเสธการเขียน: DATABASE_URL ชี้ host="${host}" ซึ่งไม่ใช่เครื่องตัวเอง`)
  }
  console.log(`✓ ปลายทาง localhost ยืนยันแล้ว (${host})`)
}

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000
const now = Date.now()

/** พัสดุ 1 ใบ — carrierStatus ตัดสินว่าแถบพัสดุจะอ่านว่าอะไร (lib/iship/status.ts) */
type Ship = {
  carrierStatus: string
  trackingNo: string
  /** ข้อความ+เวลาที่ขนส่งแจ้งล่าสุด — โผล่ในแผงตอนกาง (เฉพาะพัสดุที่ผ่าน iShip) */
  statusText?: string
  statusAgoMin?: number
} | null

type Thread = {
  key: string
  name: string
  /** 'MESSENGER' | 'INSTAGRAM' | 'LINE' | 'DEEP' */
  channel: string
  /**
   * บังคับให้ใช้ ShopChannel ใบนี้แทนใบแรกของ provider
   * (ใช้กับ LINE ใบที่ 2 — ต้องมี 2 ใบขึ้นไป InboxList ถึงจะแสดงบรรทัดชื่อเพจ ดู `duplicatedProviders`)
   */
  channelId?: string
  /** นาทีที่แล้วของข้อความล่าสุด */
  agoMin: number
  unread: number
  msgs: Array<[role: 'BUYER' | 'SHOP', body: string]>
  origin?: { kind: 'ad'; body: string } | { kind: 'comment' }
  /** ออเดอร์ของลูกค้ารายนี้ — ตัวจุดให้ "แถบพัสดุ" โผล่ */
  order?: { no: string; total: number; item: string; status: string; ship: Ship }
  botPaused?: boolean
  /** ลูกค้าทักล่าสุดเกิน 24 ชม. ⇒ คำเตือนหน้าต่าง Meta */
  staleInbound?: boolean
  pinned?: boolean
  resolved?: boolean
  spam?: boolean
}

const THREADS: Thread[] = [
  {
    key: 'conv', // คงคีย์เดิมไว้ เผื่อเปิดลิงก์เก่าค้างอยู่
    name: 'Sekson Oonnom',
    channel: 'MESSENGER',
    agoMin: 120,
    unread: 0,
    origin: { kind: 'ad', body: 'โรงงานล้างสต๊อก! โช๊คหลังเวฟ ลด 80% ส่งฟรีทั่วประเทศ ทักแชทรับส่วนลดเพิ่ม' },
    order: {
      no: 'DP25690847A68A18',
      total: 360,
      item: 'โช้คหลัง 110 สีแดง',
      status: 'SHIPPED',
      ship: {
        carrierStatus: 'in_transit',
        trackingNo: 'TH1601924VZF4J0',
        statusText: 'พัสดุออกจากศูนย์คัดแยกบางนา กำลังนำส่งปลายทาง',
        statusAgoMin: 95,
      },
    },
    botPaused: true,
    staleInbound: true,
    msgs: [
      ['BUYER', 'สนใจโช้คหลัง 110 สีแดงครับ ยังมีของไหม'],
      ['SHOP', 'มีครับ ราคา 360 บาท ส่งฟรีครับ'],
      ['BUYER', 'เอา 1 ตัวครับ ส่งพรุ่งนี้ทันไหม'],
      ['SHOP', 'ทันครับ ตัดรอบส่ง 17:00 น. เดี๋ยวเปิดบิลให้เลยนะครับ'],
      ['BUYER', 'โอเคครับ เก็บเงินปลายทางนะ'],
      ['SHOP', 'ส่งของออกแล้วนะครับ เลขพัสดุ TH1601924VZF4J0'],
    ],
  },
  {
    key: 'c2',
    name: 'สมชาย ถมยาแก้ว',
    channel: 'MESSENGER',
    agoMin: 13,
    unread: 1,
    origin: { kind: 'comment' },
    msgs: [
      ['SHOP', 'สวัสดีค่ะ สนใจสินค้าตัวไหนดีคะ'],
      ['BUYER', 'สอบถามรายละเอียดครับ ตัวนี้ใส่กับ Wave 125 ได้ไหม'],
    ],
  },
  {
    key: 'c3',
    name: 'Songkeart Phattarapattamawong',
    channel: 'MESSENGER',
    agoMin: 21,
    unread: 1,
    origin: { kind: 'ad', body: 'ชุดแต่งมอเตอร์ไซค์ ราคาโรงงาน ส่งไว 1-2 วัน' },
    order: {
      no: 'DP25690847B10C22',
      total: 1290,
      item: 'ชุดสีเวฟ 110i',
      status: 'PENDING',
      ship: null, // ยังไม่มีพัสดุ ⇒ "รอเลขพัสดุ"
    },
    msgs: [
      ['BUYER', 'เปลี่ยนกระจกหน้านิสสันอัลเมร่าปี2014 เท่าไหร่ครับ'],
      ['SHOP', 'รุ่นนี้ 1,290 บาทครับ มีของพร้อมส่ง'],
      ['BUYER', 'เอาครับ'],
    ],
  },
  {
    key: 'c4',
    name: 'Thaichanit Chongcharoen',
    channel: 'INSTAGRAM',
    agoMin: 25,
    unread: 2,
    order: {
      no: 'DP25690846C0FA9B',
      total: 890,
      item: 'ยางนอก 90/80-17',
      status: 'COMPLETED',
      ship: {
        carrierStatus: 'delivered',
        trackingNo: 'TH1601900AAB12',
        statusText: 'จัดส่งสำเร็จ ผู้รับเซ็นรับเรียบร้อย',
        statusAgoMin: 400,
      },
    },
    msgs: [
      ['BUYER', 'ของถึงแล้วครับ ขอบคุณมาก'],
      ['SHOP', 'ขอบคุณที่อุดหนุนครับ'],
      ['BUYER', 'มีตัวอื่นแนะนำไหมครับ'],
    ],
  },
  {
    key: 'c5',
    name: 'Banklao Saoyai',
    channel: 'LINE',
    agoMin: 46,
    unread: 1,
    order: {
      no: 'DP25690845D77E10',
      total: 2500,
      item: 'ชุดโช้คอัพหน้า',
      status: 'SHIPPED',
      ship: {
        carrierStatus: 'issue',
        trackingNo: 'TH1601899ZZ001',
        statusText: 'นำจ่ายไม่สำเร็จ — ไม่มีผู้รับ ณ ที่อยู่ปลายทาง จะนำจ่ายอีกครั้งวันถัดไป',
        statusAgoMin: 180,
      }, // ⇒ "พัสดุมีปัญหา"
    },
    msgs: [
      ['BUYER', 'ใช้เวลาทำนานไหมครับ'],
      ['SHOP', 'ประมาณ 2-3 วันทำการครับ'],
      ['BUYER', 'พัสดุยังไม่ถึงเลยครับ ตรวจสอบให้หน่อย'],
    ],
  },
  {
    // LINE ใบที่ 2 — ใส่ไว้เพื่อให้ LINE เข้าเงื่อนไข `duplicatedProviders` (>= 2 บัญชี)
    // ⇒ เธรด LINE ทั้งสองใบจะเริ่มแสดง "บรรทัดชื่อเพจ" ในรายการแชท
    key: 'c5b',
    name: 'ปรีชา ศรีสุข',
    channel: 'LINE',
    channelId: ID('line2'),
    agoMin: 52,
    unread: 1,
    msgs: [
      ['BUYER', 'สาขาลาดพร้าวเปิดกี่โมงครับ'],
      ['SHOP', 'เปิด 9:00–18:00 ทุกวันครับ'],
      ['BUYER', 'ขอบคุณครับ'],
    ],
  },
  {
    key: 'c6',
    name: 'Baek Hui',
    channel: 'MESSENGER',
    agoMin: 59,
    unread: 3,
    staleInbound: false,
    msgs: [
      ['BUYER', 'สอบถามโปรโมชั่นครับ'],
      ['BUYER', 'มีส่วนลดไหม'],
      ['BUYER', 'ตอบด้วยนะครับ'],
    ],
  },
  {
    key: 'c7',
    name: 'ธีระวุฒิ ชุมสุข',
    channel: 'MESSENGER',
    agoMin: 60 * 3,
    unread: 0,
    resolved: true,
    msgs: [
      ['BUYER', 'แบบนี้ครับ'],
      ['SHOP', 'รับทราบครับ ดำเนินการให้แล้วนะครับ'],
    ],
  },
  {
    key: 'c8',
    name: 'สิทธิโชค ธนาวัฒน์พงษ์',
    channel: 'MESSENGER',
    agoMin: 60 * 8,
    unread: 0,
    pinned: true,
    msgs: [
      ['BUYER', 'ขอบคุณที่เป็นเพื่อนกับเรานะครับ'],
      ['SHOP', 'ยินดีครับ มีอะไรทักได้เลย'],
    ],
  },
  {
    key: 'c9',
    name: 'ลูกค้า (ยังไม่ระบุชื่อ)',
    channel: 'DEEP',
    agoMin: 60 * 26,
    unread: 0,
    staleInbound: true,
    msgs: [
      ['BUYER', 'สนใจบรรทุกหนักครับ'],
      ['SHOP', 'รับได้ครับ แจ้งรุ่นรถมาได้เลย'],
    ],
  },
]

/**
 * ข้อความสำเร็จรูปตัวอย่าง — ให้แผง "ข้อความสำเร็จรูป" มีของจริงให้กดดู
 * (ฐาน local ไม่เคยมีสักแถว แผงจึงขึ้นสถานะ "ยังไม่ได้ตั้งค่า" ตลอด)
 * เนื้อหาเลียนแบบที่ร้านอะไหล่มอเตอร์ไซค์ใช้จริง — มีทั้งแบบสั้นและแบบยาวหลายบรรทัด
 * เพื่อให้เห็นว่าแผงตัดคำ/เลื่อนยังไงเมื่อข้อความยาว
 */
const QUICK_MESSAGES: Array<{ key: string; title: string; category: string; body: string }> = [
  {
    key: 'greet',
    title: 'ทักทาย',
    category: 'ทั่วไป',
    body: 'สวัสดีครับ ร้านธนภัทร์ อะไหล่มอเตอร์ไซค์ยินดีให้บริการครับ สนใจสินค้าตัวไหนแจ้งรุ่นรถได้เลยครับ',
  },
  {
    key: 'stock',
    title: 'ของพร้อมส่ง',
    category: 'ทั่วไป',
    body: 'ตัวนี้มีของพร้อมส่งครับ สั่งก่อน 17:00 น. ส่งออกวันนี้เลยครับ',
  },
  {
    key: 'address',
    title: 'ขอที่อยู่จัดส่ง',
    category: 'สั่งซื้อ',
    body: 'รบกวนขอข้อมูลจัดส่งครับ\n\n1. ชื่อ-นามสกุล\n2. เบอร์โทร\n3. ที่อยู่ + รหัสไปรษณีย์\n\nพิมพ์ต่อกันมาได้เลยครับ เดี๋ยวผมกรอกให้',
  },
  {
    key: 'transfer',
    title: 'แจ้งเลขบัญชี',
    category: 'สั่งซื้อ',
    body: 'โอนได้ที่บัญชีนี้ครับ\nกสิกรไทย 123-4-56789-0\nชื่อบัญชี ธนภัทร์ อะไหล่มอเตอร์ไซค์\n\nโอนแล้วรบกวนส่งสลิปมาในแชทนี้ได้เลยครับ',
  },
  {
    key: 'tracking',
    title: 'แจ้งเลขพัสดุ',
    category: 'จัดส่ง',
    body: 'ส่งของออกแล้วนะครับ ตรวจสอบสถานะได้จากเลขพัสดุที่แจ้งไว้ ปกติถึงภายใน 2-3 วันทำการครับ',
  },
  {
    key: 'cod',
    title: 'ยืนยันเก็บเงินปลายทาง',
    category: 'จัดส่ง',
    body: 'รับทราบครับ ออเดอร์นี้เก็บเงินปลายทาง รบกวนเตรียมเงินสดให้พอดีตอนรับของนะครับ',
  },
  {
    key: 'thanks',
    title: 'ขอบคุณหลังปิดการขาย',
    category: 'ทั่วไป',
    body: 'ขอบคุณที่อุดหนุนครับ ถ้าของมีปัญหาหรืออยากได้อะไหล่ตัวอื่นทักมาได้ตลอดเลยครับ',
  },
]

async function clean() {
  const convIds = THREADS.map((t) => ID(t.key))
  await prisma.chatMessage.deleteMany({ where: { conversationId: { in: convIds } } })
  await prisma.conversation.deleteMany({ where: { id: { in: convIds } } })
  await prisma.externalContact.deleteMany({ where: { id: { in: THREADS.map((t) => ID(`ct-${t.key}`)) } } })
  await prisma.orderShipment.deleteMany({ where: { id: { in: THREADS.map((t) => ID(`sh-${t.key}`)) } } })
  await prisma.orderItem.deleteMany({ where: { orderId: { in: THREADS.map((t) => ID(`or-${t.key}`)) } } })
  await prisma.order.deleteMany({ where: { id: { in: THREADS.map((t) => ID(`or-${t.key}`)) } } })
  await prisma.customer.deleteMany({ where: { id: { in: THREADS.map((t) => ID(`cu-${t.key}`)) } } })
  // ช่องทาง LINE ใบที่ 2 ที่สคริปต์นี้สร้าง — ลบทีหลังสุด (conversation/contact อ้างถึงมัน)
  await prisma.shopChannel.deleteMany({ where: { id: ID('line2') } })
  await prisma.quickMessage.deleteMany({ where: { id: { in: QUICK_MESSAGES.map((q) => ID(`qm-${q.key}`)) } } })
  console.log('✓ ลบข้อมูลตัวอย่างของสคริปต์นี้เรียบร้อย (ไม่แตะแถวอื่น)')
}

async function main() {
  assertLocalDatabase()
  if (process.argv.includes('--clean')) return clean()

  const shop = await prisma.shop.findFirst({
    where: { slug: SHOP_SLUG },
    select: { id: true, shopName: true, userId: true },
  })
  if (!shop) throw new Error(`ไม่พบร้าน slug="${SHOP_SLUG}"`)

  /**
   * LINE ใบที่ 2 — ร้านนี้มี LINE อยู่แล้ว 1 ใบ ซึ่งทำให้ `duplicatedProviders` ใน
   * InboxList.tsx:954 ไม่นับ LINE (เกณฑ์คือ >= 2 บัญชีต่อแพลตฟอร์ม) ⇒ เธรด LINE
   * จึงไม่มีบรรทัดชื่อเพจ ต่างจาก FB (3 ใบ) และ IG (2 ใบ)
   * ใส่ใบที่ 2 เพื่อให้เห็นบรรทัดนั้นทำงานจริงบนเครื่อง
   */
  await prisma.shopChannel.upsert({
    where: { id: ID('line2') },
    update: {},
    create: {
      id: ID('line2'),
      shopId: shop.id,
      provider: 'LINE',
      externalId: 'U0000000000000000000000000000002',
      name: 'ธนภัทร์ อะไหล่ฯ สาขาลาดพร้าว',
      accessTokenEnc: encryptToken('seed-dummy-line-token'),
      connectedByUserId: shop.userId,
      status: 'ACTIVE',
      basicId: '@tanapat-ladprao',
    },
  })

  /**
   * 🛑 ซ่อม token ของ channel ทุกใบในร้านนี้ที่ยัง **ไม่ใช่รูปแบบ `iv.tag.data`**
   * (seed ชุดก่อนหน้าใส่สตริงเปล่าไว้ ซึ่งไม่เคยมีใครเจอเพราะฐานนี้ไม่มีเธรดให้เปิดเลย)
   * `decryptToken` จะ throw CHANNEL_TOKEN_MALFORMED แล้ว `syncInboundWindowFromMeta`
   * ใน page.tsx ไม่ได้ดักไว้ ⇒ **เปิดห้องแชทแล้ว 500 ทั้งหน้า**
   * token นี้ถอดรหัสได้แต่ใช้ยิง Meta/LINE จริงไม่ได้ — ซึ่งพอสำหรับดู UI (คำขอที่ล้มถูกดักไว้แล้ว)
   */
  const broken = await prisma.shopChannel.findMany({
    where: { shopId: shop.id },
    select: { id: true, accessTokenEnc: true },
  })
  for (const c of broken) {
    if ((c.accessTokenEnc ?? '').split('.').length === 3) continue
    await prisma.shopChannel.update({
      where: { id: c.id },
      data: { accessTokenEnc: encryptToken('seed-dummy-token') },
    })
    console.log(`  ~ ซ่อม token ของ channel ${c.id}`)
  }

  const channels = await prisma.shopChannel.findMany({
    where: { shopId: shop.id },
    select: { id: true, provider: true, name: true },
  })
  const chanOf = (p: string) => channels.find((c) => c.provider === p) ?? null

  const owner = await prisma.user.findUnique({ where: { id: shop.userId }, select: { username: true } })
  await prisma.user.update({
    where: { id: shop.userId },
    data: { passwordHash: await hashPassword(DEMO_PASSWORD) },
  })

  // ข้อความสำเร็จรูป — ผูกกับร้าน ไม่ใช่กับเธรด จึงสร้างครั้งเดียวนอกลูป
  for (const [i, q] of QUICK_MESSAGES.entries()) {
    await prisma.quickMessage.upsert({
      where: { id: ID(`qm-${q.key}`) },
      update: {},
      create: {
        id: ID(`qm-${q.key}`),
        shopId: shop.id,
        title: q.title,
        category: q.category,
        body: q.body,
        createdByUserId: shop.userId,
        sortOrder: i,
      },
    })
  }
  console.log(`  ✓ ข้อความสำเร็จรูป ${QUICK_MESSAGES.length} รายการ`)

  let phoneSeq = 810000000
  for (const t of THREADS) {
    const ch =
      t.channel === 'DEEP'
        ? null
        : t.channelId
          ? (channels.find((c) => c.id === t.channelId) ?? null)
          : chanOf(t.channel)
    if (t.channel !== 'DEEP' && !ch) {
      console.log(`  – ข้าม "${t.name}" (ร้านนี้ไม่มีช่องทาง ${t.channel})`)
      continue
    }

    const lastAt = new Date(now - t.agoMin * MIN)
    const lastRole = t.msgs[t.msgs.length - 1][0]

    /* ลูกค้า + ออเดอร์ — ออเดอร์ผูกเธรดผ่าน ExternalContact.customerId → Customer
       (page.tsx query ด้วย customerId ไม่ได้ผูกกับ conversation ตรง ๆ) */
    let customerId: string | null = null
    if (t.order) {
      const phone = `0${++phoneSeq}`
      const cu = await prisma.customer.upsert({
        where: { id: ID(`cu-${t.key}`) },
        update: {},
        create: { id: ID(`cu-${t.key}`), phone },
      })
      customerId = cu.id

      await prisma.order.upsert({
        where: { id: ID(`or-${t.key}`) },
        update: {},
        create: {
          id: ID(`or-${t.key}`),
          publicToken: ID(`tk-${t.key}`),
          orderNo: t.order.no,
          shopId: shop.id,
          customerId: cu.id,
          type: 'PHYSICAL',
          status: t.order.status,
          fulfillmentMode: 'SHIPPED',
          totalAmount: t.order.total,
          paymentMethod: 'เก็บเงินปลายทาง',
          createdAt: new Date(now - (t.agoMin + 600) * MIN),
        },
      })
      await prisma.orderItem.upsert({
        where: { id: ID(`oi-${t.key}`) },
        update: {},
        create: {
          id: ID(`oi-${t.key}`),
          orderId: ID(`or-${t.key}`),
          name: t.order.item,
          qty: 1,
          price: t.order.total,
        },
      })
      if (t.order.ship) {
        await prisma.orderShipment.upsert({
          where: { id: ID(`sh-${t.key}`) },
          update: {
            carrierStatus: t.order.ship.carrierStatus,
            carrierStatusText: t.order.ship.statusText ?? null,
            carrierStatusAt: t.order.ship.statusAgoMin
              ? new Date(now - t.order.ship.statusAgoMin * MIN)
              : null,
          },
          create: {
            id: ID(`sh-${t.key}`),
            orderId: ID(`or-${t.key}`),
            shopId: shop.id,
            status: 'CREATED',
            source: 'CREATED',
            idempotencyKey: ID(`idem-${t.key}`),
            courierCode: 'FLE',
            courierName: 'Flash Thunder',
            trackingNo: t.order.ship.trackingNo,
            carrierStatus: t.order.ship.carrierStatus,
            carrierStatusText: t.order.ship.statusText ?? null,
            carrierStatusAt: t.order.ship.statusAgoMin
              ? new Date(now - t.order.ship.statusAgoMin * MIN)
              : null,
            codAmount: t.order.total,
          },
        })
      }
    }

    if (ch) {
      await prisma.externalContact.upsert({
        where: { id: ID(`ct-${t.key}`) },
        update: { customerId },
        create: {
          id: ID(`ct-${t.key}`),
          shopChannelId: ch.id,
          externalUserId: `PSID-${t.key.toUpperCase()}`,
          name: t.name,
          customerId,
          salesStatus: 'UNSPECIFIED',
        },
      })
    }

    await prisma.conversation.upsert({
      where: { id: ID(t.key) },
      update: {},
      create: {
        id: ID(t.key),
        shopId: shop.id,
        channel: t.channel,
        shopChannelId: ch?.id ?? null,
        externalContactId: ch ? ID(`ct-${t.key}`) : null,
        alias: ch ? null : t.name, // เธรด DEEP ไม่มี ExternalContact → ใช้ alias เป็นชื่อ
        lastMessageAt: lastAt,
        lastMessagePreview: t.msgs[t.msgs.length - 1][1].slice(0, 60),
        lastSenderRole: lastRole,
        // ยังไม่อ่าน = shopLastReadAt เก่ากว่า lastMessageAt (InboxList.tsx:218)
        shopLastReadAt: t.unread > 0 ? new Date(lastAt.getTime() - 60 * MIN) : new Date(lastAt.getTime() + MIN),
        lastInboundAt: new Date(now - (t.staleInbound ? 30 * HOUR : t.agoMin * MIN)),
        autoReplyPausedUntil: t.botPaused ? new Date(now + 2 * HOUR) : null,
        isPinned: !!t.pinned,
        isSpam: !!t.spam,
        resolvedAt: t.resolved ? new Date(now - 30 * MIN) : null,
        ...(t.origin?.kind === 'ad'
          ? {
              referralSource: 'ADS',
              referralAdTitle: 'video v3',
              referralAdBody: t.origin.body,
              referralAdPermalink: 'https://www.facebook.com/',
              referralAdId: '120200000000000001',
            }
          : {}),
      },
    })

    for (const [i, [role, body]] of t.msgs.entries()) {
      // ไล่เวลาถอยหลังจากข้อความล่าสุด ให้เรียงถูกลำดับในเธรด
      const at = new Date(lastAt.getTime() - (t.msgs.length - 1 - i) * 7 * MIN)
      await prisma.chatMessage.upsert({
        where: { id: ID(`m-${t.key}-${i}`) },
        update: {},
        create: {
          id: ID(`m-${t.key}-${i}`),
          conversationId: ID(t.key),
          senderRole: role,
          type: 'TEXT',
          body,
          createdAt: at,
          ...(role === 'SHOP' ? { deliveryStatus: 'SENT' } : {}),
        },
      })
    }
    console.log(`  ✓ ${t.name.padEnd(32)} ${t.channel.padEnd(10)} ${t.unread ? `ยังไม่อ่าน ${t.unread}` : ''}`)
  }

  console.log('\n──────────────────────────────────────────────')
  console.log(`ร้าน     : ${shop.shopName} (${SHOP_SLUG})`)
  console.log(`ล็อกอิน  : ${owner?.username} / ${DEMO_PASSWORD}`)
  console.log('เปิดที่  : http://seller.deepth.local:3000/auth/sign-in  แล้วไป /inbox')
  console.log('ลบทิ้ง   : เติม --clean ท้ายคำสั่งเดิม')
  console.log('──────────────────────────────────────────────\n')
}

main()
  .catch((e) => {
    console.error('ERR', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

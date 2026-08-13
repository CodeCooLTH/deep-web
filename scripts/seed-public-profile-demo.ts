/**
 * seed-public-profile-demo — เติมข้อมูลให้หน้าโปรไฟล์สาธารณะแสดงผลได้ครบทุกบล็อกบนเครื่อง dev
 *
 * ทำไมต้องมี: ฐาน dev มี **0 คลิป 0 รีวิวทั้งฐาน** และร้านที่มีของเยอะสุดมีสินค้า 1 ชิ้น
 * ⇒ แถวโชว์สินค้า / แท็บปักหมุด / แท็บรีวิว ไม่เคยถูกเรนเดอร์จริงเลยสักครั้ง ทุกอย่างที่แก้ไป
 * พิสูจน์ได้แค่ระดับ tsc
 *
 * ── ความปลอดภัย (HR13/HR14) ──────────────────────────────────────────
 * 🛑 **ไม่มีคำสั่งลบใด ๆ ในไฟล์นี้** — ไม่มี `deleteMany`, ไม่มี `TRUNCATE`, ไม่มี migrate/db push
 * ทุกการเขียนเป็น `upsert` ด้วย id ที่ตายตัว ⇒ รันซ้ำได้ไม่สร้างของซ้ำ และไม่แตะแถวอื่นในฐาน
 *
 * 🛑 ตรวจปลายทางก่อนเขียนเสมอ — ถ้า `DATABASE_URL` ไม่ได้ชี้ localhost/127.0.0.1 จะ **หยุดทันที**
 * (fail-closed: allowlist ไม่ใช่ denylist) เพราะเคยมีเหตุการณ์ฐาน prod ถูกล้างทั้งฐานมาแล้ว
 *
 * รัน: npx dotenv -e .env.local -- npx tsx scripts/seed-public-profile-demo.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** ร้านเป้าหมาย — ใช้ร้านที่มีอยู่แล้ว ไม่สร้างร้าน/ผู้ใช้ใหม่ */
const SHOP_SLUG = 'qa-online'

/** id ตายตัวเพื่อให้ upsert ซ้ำได้ — prefix ชัดเจนว่าเป็นของ seed */
const ID = (suffix: string) => `seed-ppd-${suffix}`

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('ไม่พบ DATABASE_URL — รันผ่าน `npx dotenv -e .env.local --` หรือยัง?')
  const host = new URL(url).hostname
  // allowlist: ผ่านเฉพาะเครื่องตัวเอง — ปลายทางอื่นถือว่าเป็น prod ทั้งหมด
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`ปฏิเสธการเขียน: DATABASE_URL ชี้ host="${host}" ซึ่งไม่ใช่เครื่องตัวเอง`)
  }
  console.log(`✓ ปลายทาง localhost ยืนยันแล้ว (${host})`)
}

/** รูปตัวอย่างจากบริการภายนอก — `toFileUrl()` ปล่อย URL เต็มผ่านตรง ๆ
 *  ถ้าเครื่องออฟไลน์รูปจะโหลดไม่ขึ้น ซึ่ง **ก็เป็นเคสที่ควรเห็น** (fallback ไอคอน photo-off) */
const img = (seed: string, w = 800) => `https://picsum.photos/seed/${seed}/${w}/${w}`

const PRODUCTS = [
  { n: 'โช๊คหลัง WAVE 110i แท้ศูนย์ พร้อมสปริงเหลือง', price: 1250, sold: 46, likes: 41, pin: true },
  { n: 'ชุดโซ่สเตอร์ DREAM ครบชุด 428H', price: 680, sold: 31, likes: 28, pin: true },
  { n: 'ผ้าเบรคหน้า-หลัง รถสามล้อ', price: 320, sold: 24, likes: 12, pin: true },
  { n: 'ล้อแม็ก WAVE ลายใหม่ 1.4x17', price: 2400, sold: 8, likes: 9, pin: false },
  { n: 'จานดิสเบรคหน้า WAVE 125i', price: 890, sold: 19, likes: 6, pin: false },
  { n: 'ยางนอก 70/90-17 ลายดอก', price: 450, sold: 33, likes: 15, pin: false },
  { n: 'กระจกมองข้าง ทรงสั้น ชุบโครเมียม', price: 180, sold: 27, likes: 4, pin: false },
  { n: 'หัวเทียน NGK แท้ สำหรับ WAVE/DREAM', price: 120, sold: 52, likes: 7, pin: false },
  { n: 'ชุดสีเดิม WAVE 110i สีน้ำเงิน', price: 1850, sold: 5, likes: 11, pin: false },
]

const REVIEW_TEXTS = [
  'ของแท้ตรงปก ส่งไวมาก แพ็คดี ไม่มีบุบเลยครับ',
  'สั่งประจำ ไม่เคยผิดหวัง ราคาถูกกว่าร้านแถวบ้านเยอะ',
  'ใส่ได้พอดี ไม่ต้องดัดแปลง ขอบคุณครับ',
  'ของถึงเร็วกว่าที่คิด ทักไปถามตอบเร็วมาก',
  'คุณภาพดีเกินราคา จะสั่งเพิ่มอีกแน่นอน',
  'ร้านนี้ตอบไวมาก ให้คำแนะนำดีด้วยว่าต้องใช้รุ่นไหน',
  'ได้รับของครบ สภาพเรียบร้อย',
  'ราคาส่งจริง สั่งเยอะได้ลดอีก',
]

async function main() {
  assertLocalDatabase()

  const shop = await prisma.shop.findFirst({
    where: { slug: SHOP_SLUG },
    select: { id: true, userId: true, shopName: true },
  })
  if (!shop) throw new Error(`ไม่พบร้าน slug="${SHOP_SLUG}" — แก้ SHOP_SLUG ให้ตรงกับฐานของคุณ`)
  console.log(`✓ ร้านเป้าหมาย: ${shop.shopName} (${shop.id})`)

  // ── ข้อมูลร้าน: คำอธิบายยาวพอให้ clamp 2 บรรทัดทำงาน + ปก/โลโก้ ──
  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      description:
        'ศูนย์รวมอะไหล่มอเตอร์ไซค์ Honda WAVE, DREAM และรถสามล้อ ครบทั้งโช๊คหน้า-หลัง ชุดโซ่สเตอร์ ผ้าเบรคหน้า หลัง จานดิส ล้อแม็ก คัดคุณภาพ ราคาส่ง พร้อมส่งทั่วไทย เก็บเงินปลายทางได้ ทักถามรุ่นรถได้เลยครับ ยินดีให้คำแนะนำ',
      logo: img('tanapat-logo', 400),
      coverImage: img('tanapat-cover', 1200),
      address: '199/4 ถนนพระราม 2 แขวงบางมด เขตจอมทอง กรุงเทพมหานคร 10150',
      category: 'automotive',
      chatResponseRate: 92,
      chatMedianResponseSec: 780,
      chatResponseSampleSize: 47,
    },
  })

  /* trustScore 41 = Deep Classic ช่วง C — เคสที่พบมากที่สุดบน prod (ไม่ใช่เคสสวย)
     🛑 ต้องตั้ง **ทั้งสองที่**: `/u/[username]` อ่าน `user.trustScore` ส่วน `/b/[slug]` อ่าน
     `shop.trustScore` ซึ่งเป็นคอลัมน์ของร้านเอง — ตั้งข้างเดียวแล้วสองหน้าจะโชว์คนละเลข */
  await prisma.user.update({ where: { id: shop.userId }, data: { trustScore: 41 } })
  await prisma.shop.update({ where: { id: shop.id }, data: { trustScore: 41 } })

  // ── สินค้า ──
  for (const [i, p] of PRODUCTS.entries()) {
    const id = ID(`product-${i}`)
    const data = {
      shopId: shop.id,
      name: p.n,
      price: p.price,
      images: [img(`prod-${i}-a`), img(`prod-${i}-b`), img(`prod-${i}-c`)],
      shortDescription: 'ของแท้ พร้อมส่งจากคลังกรุงเทพ เก็บเงินปลายทางได้',
      isActive: true,
      likeCount: p.likes,
      pinnedAt: p.pin ? new Date(Date.now() - (i + 1) * 864e5) : null,
    }
    await prisma.product.upsert({ where: { id }, create: { id, ...data }, update: data })
  }
  console.log(`✓ สินค้า ${PRODUCTS.length} ชิ้น (ปักหมุด ${PRODUCTS.filter((p) => p.pin).length})`)

  // ── ลูกค้า + ออเดอร์ ──
  // 30 ลูกค้า · 8 คนซื้อซ้ำ ⇒ 38 ใบ CONFIRMED · +2 ใบ CANCELLED ⇒ อัตราสำเร็จ 38/40 = 95%
  const CUSTOMERS = 30
  const REPEATERS = 8
  const customerIds: string[] = []
  for (let i = 0; i < CUSTOMERS; i++) {
    const id = ID(`cust-${i}`)
    const phone = `09${String(90000000 + i).slice(0, 8)}`
    await prisma.customer.upsert({
      where: { id },
      create: { id, phone },
      update: {},
    })
    customerIds.push(id)
  }

  const orderPlan: { customerId: string; status: string; idx: number }[] = []
  customerIds.forEach((cid, i) => orderPlan.push({ customerId: cid, status: 'CONFIRMED', idx: i }))
  for (let i = 0; i < REPEATERS; i++) {
    orderPlan.push({ customerId: customerIds[i], status: 'CONFIRMED', idx: CUSTOMERS + i })
  }
  orderPlan.push({ customerId: customerIds[0], status: 'CANCELLED', idx: 900 })
  orderPlan.push({ customerId: customerIds[1], status: 'CANCELLED', idx: 901 })

  for (const o of orderPlan) {
    const id = ID(`order-${o.idx}`)
    const created = new Date(Date.now() - (o.idx % 60) * 864e5)
    const data = {
      shopId: shop.id,
      customerId: o.customerId,
      status: o.status,
      totalAmount: 320 + (o.idx % 9) * 210,
      buyerContact: `09${String(90000000 + (o.idx % CUSTOMERS)).slice(0, 8)}`,
      buyerName: `ลูกค้า ${o.idx + 1}`,
      salesChannel: 'MESSENGER',
      createdAt: created,
      // ยกเลิกโดยผู้ซื้อ ⇒ ไม่ถูกหักออกจากตัวหาร (BR-OSM-04) เพื่อให้เห็น 95% จริง ๆ
      cancelInitiator: o.status === 'CANCELLED' ? 'BUYER' : null,
    }
    await prisma.order.upsert({
      where: { id },
      create: { id, publicToken: id, ...data },
      update: data,
    })
  }
  console.log(`✓ ออเดอร์ ${orderPlan.length} ใบ (สำเร็จ ${orderPlan.filter((o) => o.status === 'CONFIRMED').length})`)

  // ── รีวิว (ผูกกับออเดอร์ที่ CONFIRMED เท่านั้น — กติกาเดียวกับของจริง) ──
  const RATINGS = [5, 5, 5, 5, 4, 5, 5, 4, 5, 5, 3, 5]
  for (const [i, rating] of RATINGS.entries()) {
    const id = ID(`review-${i}`)
    const data = {
      orderId: ID(`order-${i}`),
      rating,
      comment: REVIEW_TEXTS[i % REVIEW_TEXTS.length],
      reviewerContact: `09${String(90000000 + i).slice(0, 8)}`,
      images: i % 4 === 0 ? [img(`rev-${i}-a`, 600), img(`rev-${i}-b`, 600)] : [],
      shopReplyComment: i === 0 ? 'ขอบคุณมากครับ รอบหน้าแจ้งรุ่นรถมาได้เลย เดี๋ยวจัดให้ครับ' : null,
      shopRepliedAt: i === 0 ? new Date() : null,
      createdAt: new Date(Date.now() - i * 3 * 864e5),
    }
    await prisma.review.upsert({ where: { id }, create: { id, ...data }, update: data })
  }
  console.log(`✓ รีวิว ${RATINGS.length} ใบ`)

  // ── คลิปปักหมุด ──
  const CLIPS = [
    { v: 1_040_000, l: 6800, c: 399 },
    { v: 43_000, l: 172, c: 22 },
    { v: 34_000, l: 271, c: 19 },
    { v: 26_000, l: 205, c: 21 },
    { v: 7_500, l: 80, c: 10 },
    { v: 6_700, l: 65, c: 7 },
  ]
  for (const [i, c] of CLIPS.entries()) {
    const id = ID(`video-${i}`)
    const data = {
      shopId: shop.id,
      provider: 'FACEBOOK',
      videoId: `seed-clip-${i}`,
      caption: 'รีวิวอะไหล่ WAVE ของแท้ ราคาส่ง ส่งทั่วไทย',
      thumbnailUrl: img(`clip-${i}`, 720),
      accountName: 'ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง',
      viewCount: c.v,
      likeCount: c.l,
      commentCount: c.c,
      sortOrder: i,
    }
    await prisma.shopVideo.upsert({ where: { id }, create: { id, ...data }, update: data })
  }
  console.log(`✓ คลิป ${CLIPS.length} รายการ`)

  // ── ช่องทางทางการ 4 เพจ (เทสเคส "อีก N" + ชื่อเพจยาว 34 ตัวอักษร) ──
  const CHANNELS = [
    { p: 'MESSENGER', ext: '100011122233344', name: 'ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง', f: 6100, basic: null },
    { p: 'INSTAGRAM', ext: '17841400000000001', name: '@tanapat.hardware', f: 307, basic: null },
    { p: 'MESSENGER', ext: '100011122233355', name: 'ธนภัทร์ อะไหล่ฯ สาขาสอง พระราม 2', f: 1400, basic: null },
    { p: 'LINE', ext: 'U0000000000000000000000000000001', name: 'ธนภัทร์ อะไหล่มอเตอร์ไซค์', f: 892, basic: '@tanapat' },
  ]
  for (const [i, c] of CHANNELS.entries()) {
    const id = ID(`channel-${i}`)
    const data = {
      shopId: shop.id,
      provider: c.p,
      externalId: c.ext,
      name: c.name,
      avatarUrl: img(`ch-${i}`, 200),
      followerCount: c.f,
      basicId: c.basic,
      status: 'ACTIVE',
      accessTokenEnc: 'seed-not-a-real-token',
      connectedByUserId: shop.userId,
    }
    await prisma.shopChannel.upsert({ where: { id }, create: { id, ...data }, update: data })
  }
  console.log(`✓ ช่องทาง ${CHANNELS.length} เพจ`)

  // ── เหรียญ (ใช้ badge ที่มีอยู่ในแค็ตตาล็อกแล้ว ไม่สร้างชนิดใหม่) ──
  const badges = await prisma.badge.findMany({
    where: { audience: { in: ['SELLER', 'ANY'] } },
    select: { id: true, nameEN: true },
    take: 6,
  })
  for (const [i, b] of badges.entries()) {
    /* 🛑 ตารางนี้ใช้ **partial unique index** ที่สร้างด้วย raw SQL (เพราะ shopId เป็น nullable)
       ⇒ Prisma ไม่ได้ export compound key ให้ใช้ใน `where` ของ upsert — ต้องเช็คก่อนแล้วค่อยสร้าง
       (upsert ด้วย id ที่เราตั้งเองจะชนคอนสเตรนต์ ถ้าแถวนั้นมีอยู่แล้วจากตัวประเมินเหรียญจริง) */
    const earnedAt = new Date(Date.now() - (i + 1) * 12 * 864e5)
    const existing = await prisma.userBadge.findFirst({
      where: { shopId: shop.id, badgeId: b.id },
      select: { id: true },
    })
    if (existing) {
      await prisma.userBadge.update({ where: { id: existing.id }, data: { earnedAt } })
    } else {
      await prisma.userBadge.create({
        data: { id: ID(`userbadge-${i}`), userId: shop.userId, badgeId: b.id, shopId: shop.id, earnedAt },
      })
    }
  }

  console.log(`✓ เหรียญ ${badges.length} ใบ`)

  console.log('\nเสร็จแล้ว — เปิดดูที่:')
  console.log('  /b/qa-online   (ร้านข้อมูลครบ)')
  console.log('  /b/qa-service  (ร้านข้อมูลน้อย — ไว้เทียบ empty state)')
}

main()
  .catch((e) => {
    console.error('ล้มเหลว:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

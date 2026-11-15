/**
 * QA 00091 เฟส 3 — ร้านทดสอบสำหรับหน้า /reports/ad-revenue (ฐาน local ไม่มีข้อมูลโฆษณาเลย)
 * id ทุกตัวขึ้นต้น qa91 · รันซ้ำได้ (ลบของเดิมตาม id ที่สคริปต์นี้สร้างเท่านั้น — HR13)
 * ใช้: DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay npx tsx scripts/qa-00091-ad-revenue-seed.ts [--cleanup]
 */
import { PrismaClient } from '@prisma/client'

if (!/@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? '')) {
  console.error('refuse: DATABASE_URL ต้องชี้ localhost:5434'); process.exit(1)
}
const prisma = new PrismaClient()
const ID = (k: string) => `qa91-${k}`
const OWNER = ID('owner'), SHOP = ID('shop'), CH = ID('ch'), MEM = ID('mem')
const PRODUCTS = [
  { k: 'p1', name: 'โช๊คหลัง เวฟ 125', price: 890, cost: 520 },
  { k: 'p2', name: 'ไฟหน้า LED ทรงโปรเจคเตอร์', price: 1290, cost: 700 },
  { k: 'p3', name: 'ล้อแม็กลายก้านถี่ 17 นิ้ว', price: 3200, cost: null },
  { k: 'p4', name: 'ผ้าเบรกหน้า', price: 250, cost: 120 },
  { k: 'p5', name: 'น้ำมันเครื่องสังเคราะห์ 1 ลิตร', price: 320, cost: 210 },
]
const ADS = [
  { id: '120201000000000001', title: 'โช๊คหลัง เวฟ 125 · วิดีโอ A', weight: 9, product: 0, lost: 0.08 },
  { id: '120201000000000002', title: 'โช๊คหลัง เวฟ 125 · ภาพนิ่ง', weight: 5, product: 0, lost: 0.3 },
  { id: '120201000000000003', title: 'ไฟหน้า LED โปร 11.11', weight: 7, product: 1, lost: 0.1 },
  { id: '120201000000000004', title: 'ล้อแม็ก ลดล้างสต็อก', weight: 3, product: 2, lost: 0.15 },
  { id: '120201000000000005', title: 'ผ้าเบรก + น้ำมันเครื่อง ชุดคุ้ม', weight: 4, product: 3, lost: 0.05 },
  { id: '120201000000000006', title: 'แบรนด์ร้าน · แนะนำร้าน', weight: 2, product: 4, lost: 0.2 },
]

let seed = 91
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

async function cleanup() {
  const orders = await prisma.order.findMany({ where: { shopId: SHOP }, select: { id: true, customerId: true } })
  const ids = orders.map((o) => o.id)
  // ลูกค้าที่ผูกกับออเดอร์ของร้านทดสอบเท่านั้น (+ เบอร์ชุดของสคริปต์) — ฐาน local clone มาจาก prod ห้ามลบด้วย prefix อย่างเดียว
  const custIds = [...new Set(orders.flatMap((o) => (o.customerId ? [o.customerId] : [])))]
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } })
  await prisma.order.deleteMany({ where: { id: { in: ids } } })
  await prisma.conversationAdReferral.deleteMany({ where: { conversation: { shopId: SHOP } } })
  await prisma.conversation.deleteMany({ where: { shopId: SHOP } })
  await prisma.externalContact.deleteMany({ where: { shopChannelId: CH } })
  await prisma.shopChannel.deleteMany({ where: { id: CH } })
  await prisma.product.deleteMany({ where: { id: { in: PRODUCTS.map((p) => ID(p.k)) } } })
  await prisma.customer.deleteMany({ where: { id: { in: custIds }, phone: { startsWith: '0998910' }, orders: { none: { shopId: { not: SHOP } } } } })
  await prisma.shopMember.deleteMany({ where: { id: MEM } })
  await prisma.shop.deleteMany({ where: { id: SHOP } })
  await prisma.user.deleteMany({ where: { id: OWNER } })
  return ids.length
}

async function main() {
  console.log('cleanup orders:', await cleanup())
  if (process.argv.includes('--cleanup')) return
  await prisma.user.create({ data: { id: OWNER, displayName: 'เจ้าของร้าน QA91', username: 'qa91_owner', phone: '0998919999', isShop: true } })
  await prisma.shop.create({ data: { id: SHOP, userId: OWNER, shopName: 'ร้านอะไหล่เจริญยนต์ (QA91)', kind: 'BUSINESS', slug: 'qa91-shop' } as never })
  await prisma.shopMember.create({ data: { id: MEM, shopId: SHOP, userId: OWNER, role: 'OWNER', roles: [] } })
  await prisma.shopChannel.create({ data: { id: CH, shopId: SHOP, provider: 'MESSENGER', externalId: 'qa91-page', name: 'เพจเจริญยนต์', accessTokenEnc: 'x', connectedByUserId: OWNER } })
  for (const p of PRODUCTS) await prisma.product.create({ data: { id: ID(p.k), shopId: SHOP, name: p.name, price: p.price, cost: p.cost, fulfillmentMode: 'SHIPPED' } as never })

  const customers: string[] = []
  for (let i = 0; i < 70; i++) customers.push((await prisma.customer.create({ data: { phone: `0998910${String(i).padStart(3, '0')}` }, select: { id: true } })).id)

  const now = Date.now(), DAY = 86_400_000
  const totalW = ADS.reduce((s, a) => s + a.weight, 0)
  let n = 0
  // 60 วันย้อนหลัง (ครอบช่วงก่อนหน้าของค่าตั้งต้น 30 วัน)
  for (let d = 59; d >= 0; d--) {
    const perDay = 3 + Math.floor(rnd() * 5) + (d < 30 ? 2 : 0)
    for (let j = 0; j < perDay; j++) {
      n++
      const at = new Date(now - d * DAY - Math.floor(rnd() * 14) * 3_600_000 - 2 * 3_600_000)
      let r = rnd() * (totalW + 4), ad: (typeof ADS)[number] | null = null
      for (const a of ADS) { if ((r -= a.weight) < 0) { ad = a; break } }
      const fromChat = ad !== null || rnd() < 0.6
      let convId: string | null = null
      if (fromChat) {
        const ec = await prisma.externalContact.create({ data: { id: ID(`ec${n}`), shopChannelId: CH, externalUserId: `qa91-psid-${n}`, name: `ลูกค้า ${n}` } })
        convId = (await prisma.conversation.create({ data: { id: ID(`cv${n}`), shopId: SHOP, channel: 'MESSENGER', shopChannelId: CH, externalContactId: ec.id, createdAt: new Date(at.getTime() - 2 * DAY) } })).id
      }
      // คลิกโฆษณา: ทุกห้องจากโฆษณา + ห้องที่คลิกแต่ไม่ซื้อ (แชทเยอะกว่าออเดอร์)
      const clickedAt = new Date(at.getTime() - Math.floor(rnd() * 3) * DAY - 3_600_000)
      if (ad && convId) await prisma.conversationAdReferral.create({ data: { conversationId: convId, source: 'ADS', adId: ad.id, adTitle: ad.title, receivedAt: clickedAt } })
      const st = ad && rnd() < ad.lost ? pick(['CANCELLED', 'CANCELLED', 'RETURNED']) : pick(['PENDING', 'SHIPPED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED'])
      const prod = PRODUCTS[ad ? (rnd() < 0.75 ? ad.product : Math.floor(rnd() * PRODUCTS.length)) : Math.floor(rnd() * PRODUCTS.length)]
      const qty = 1 + (rnd() < 0.25 ? 1 : 0)
      const extra = rnd() < 0.2 ? PRODUCTS[4] : null
      const total = prod.price * qty + (extra ? extra.price : 0)
      const cod = rnd() < 0.5
      const paid = st === 'CONFIRMED' || (st === 'SHIPPED' && rnd() < 0.4)
      await prisma.order.create({
        data: {
          id: ID(`o${n}`), shopId: SHOP, conversationId: convId, type: 'PHYSICAL', status: st, createdAt: at, totalAmount: total,
          shopChannelId: fromChat ? CH : null, customerId: rnd() < 0.85 ? pick(customers) : null, paymentMethod: cod ? 'COD' : 'TRANSFER',
          codReceivedAt: paid && cod ? at : null, paymentConfirmedAt: paid && !cod ? at : null,
          adId: ad?.id ?? null, adTitle: ad?.title ?? null, adClickedAt: ad ? clickedAt : null,
          shippingAddress: { province: pick(['กรุงเทพมหานคร', 'เชียงใหม่', 'ขอนแก่น', 'ชลบุรี', 'สงขลา']) },
          items: { create: [
            { name: prod.name, qty, price: prod.price, cost: prod.cost, productId: ID(prod.k) },
            ...(extra ? [{ name: extra.name, qty: 1, price: extra.price, cost: extra.cost, productId: ID(extra.k) }] : []),
          ] },
        } as never,
      })
    }
  }
  // แชทจากโฆษณาที่ไม่ได้ซื้อ
  for (let i = 0; i < 120; i++) {
    n++
    const ad = ADS[i % 2 === 0 ? 1 : Math.floor(rnd() * ADS.length)]
    const ec = await prisma.externalContact.create({ data: { id: ID(`ec${n}`), shopChannelId: CH, externalUserId: `qa91-psid-${n}`, name: `ผู้สนใจ ${n}` } })
    const cv = await prisma.conversation.create({ data: { id: ID(`cv${n}`), shopId: SHOP, channel: 'MESSENGER', shopChannelId: CH, externalContactId: ec.id } })
    await prisma.conversationAdReferral.create({ data: { conversationId: cv.id, source: 'ADS', adId: ad.id, adTitle: ad.title, receivedAt: new Date(now - Math.floor(rnd() * 30) * DAY) } })
  }
  console.log(JSON.stringify({ ownerId: OWNER, shopId: SHOP, orders: n }))
}

main().finally(() => prisma.$disconnect())

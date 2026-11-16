/**
 * 00095 QA seed — ข้อมูลให้ดูแผงบอทติดตามยอดขายบนฐาน local (ร้าน ONLINE_SALES + แชท 3 ช่องทาง + บอท + run + ประวัติ)
 *
 *   DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay npx tsx scripts/sales-follow-bot-qa-seed.ts            # (ล้างของเดิมของตัวเองก่อน แล้วสร้างใหม่)
 *   DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay npx tsx scripts/sales-follow-bot-qa-seed.ts --cleanup  # ลบแล้วจบ
 *
 * 🛑 local เท่านั้น: ปฏิเสธถ้า DATABASE_URL ไม่ใช่ localhost:5434 (HR13/14)
 * 🛑 ทุกแถวที่สร้างมี id ขึ้นต้น 95950000- และชื่อขึ้นต้น [QA00095] — cleanup scope ด้วย id prefix เท่านั้น (ไม่แตะ user/ออเดอร์/แถวอื่น)
 * ผูกร้านกับบัญชีผู้ขายเทส phone 0000000001 (prisma/seed.ts) ที่ต้องมีอยู่แล้ว — ไม่สร้าง/ลบ user
 * เวลาทุกแถวสัมพัทธ์กับ "ตอนรัน" — รันใหม่เมื่อข้อมูลเก่าเกินไปสำหรับการดูแผง
 */
import { PrismaClient } from '@prisma/client'
import { assertLocal5434 } from './sales-follow-bot-lib'
import { tagNameKey } from '../src/lib/shop-tag-match'

try {
  assertLocal5434(process.env.DATABASE_URL)
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
const prisma = new PrismaClient()

const PFX = '95950000-'
const TAG = '[QA00095]'
const SELLER_PHONE = '0000000001'
// kind (2 หลัก hex) + ลำดับ → uuid ที่ validate ผ่าน route (UUID) และขึ้นต้น PFX เสมอ
const K = { shop: 1, chan: 2, contact: 3, room: 4, msg: 5, tag: 6, quick: 7, bot: 8, run: 9, send: 10, member: 11 } as const
const id = (kind: keyof typeof K, n: number) => `${PFX}0000-4000-8000-${K[kind].toString(16).padStart(2, '0')}${String(n).padStart(10, '0')}`

const NOW = Date.now()
const ago = (min: number) => new Date(NOW - min * 60_000)
const ahead = (min: number) => new Date(NOW + min * 60_000)

export async function cleanup(): Promise<Record<string, number>> {
  if (PFX.length < 9) throw new Error('prefix สั้นเกินไป')
  const p = { startsWith: PFX }
  const out: Record<string, number> = {}
  // ลูกก่อนแม่ · ทุกคำสั่ง scope ด้วย id/shopId/conversationId ที่ขึ้นต้น PFX
  out.sends = (await prisma.salesFollowSend.deleteMany({ where: { shopId: p } })).count
  out.runs = (await prisma.salesFollowRun.deleteMany({ where: { shopId: p } })).count
  out.bots = (await prisma.salesFollowBot.deleteMany({ where: { shopId: p } })).count
  out.messages = (await prisma.chatMessage.deleteMany({ where: { conversationId: p } })).count
  out.conversations = (await prisma.conversation.deleteMany({ where: { id: p } })).count
  out.contacts = (await prisma.externalContact.deleteMany({ where: { id: p } })).count
  out.channels = (await prisma.shopChannel.deleteMany({ where: { id: p } })).count
  out.tags = (await prisma.shopTag.deleteMany({ where: { shopId: p } })).count
  out.quickMessages = (await prisma.quickMessage.deleteMany({ where: { shopId: p } })).count
  out.members = (await prisma.shopMember.deleteMany({ where: { shopId: p } })).count
  out.shops = (await prisma.shop.deleteMany({ where: { id: p } })).count
  return out
}

const step = (delayMin: number, parts: object[]) => ({ delayMin, parts })
const text = (t: string) => ({ kind: 'TEXT', text: t })

async function seed() {
  const seller = await prisma.user.findUnique({ where: { phone: SELLER_PHONE }, select: { id: true, username: true } })
  if (!seller) throw new Error(`ไม่พบบัญชีผู้ขายเทส phone ${SELLER_PHONE} — รัน npm run seed:local ก่อน`)

  const shopId = id('shop', 1)
  await prisma.shop.create({
    data: { id: shopId, userId: seller.id, shopName: `${TAG} ร้านทดสอบบอทติดตาม`, kind: 'BUSINESS', businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES', slug: 'qa00095' },
  })
  await prisma.shopMember.create({ data: { id: id('member', 1), shopId, userId: seller.id, role: 'OWNER', roles: [] } })

  const chan = { msg: id('chan', 1), ig: id('chan', 2), line: id('chan', 3) }
  const mkChan = (cid: string, provider: string, name: string, ext: string) =>
    prisma.shopChannel.create({ data: { id: cid, shopId, provider, externalId: ext, name: `${TAG} ${name}`, accessTokenEnc: 'x', connectedByUserId: seller.id } })
  await mkChan(chan.msg, 'MESSENGER', 'เพจร้านนุ่น', 'qa00095-page')
  await mkChan(chan.ig, 'INSTAGRAM', 'ร้านนุ่นไอจี', 'qa00095-ig')
  await mkChan(chan.line, 'LINE', 'ร้านนุ่น OA', 'qa00095-line')

  // แท็ก 3 ตัว + ข้อความสำเร็จรูป 2 รายการ
  const tags = { price: `${TAG} ถามราคา`, promo: `${TAG} สนใจโปร`, ship: `${TAG} ถามค่าส่ง` }
  let t = 0
  for (const name of Object.values(tags)) await prisma.shopTag.create({ data: { id: id('tag', ++t), shopId, name, nameKey: tagNameKey(name), createdByUserId: seller.id } })
  const q = { hello: id('quick', 1), promo: id('quick', 2) }
  await prisma.quickMessage.create({ data: { id: q.hello, shopId, title: `${TAG} ทักทาย`, body: 'ถ้าสนใจทักมาได้เลยนะคะ ยินดีให้คำแนะนำค่ะ', createdByUserId: seller.id, sortOrder: 1 } })
  await prisma.quickMessage.create({ data: { id: q.promo, shopId, title: `${TAG} โปรโมชัน`, body: 'โปรส่งฟรีเมื่อซื้อครบ 2 ชิ้น วันนี้วันสุดท้ายค่ะ', createdByUserId: seller.id, sortOrder: 2 } })

  // ผู้ติดต่อ 5 ราย → ห้อง 5 ห้อง (1 ห้อง/ราย)
  const people = [
    { n: 1, name: 'คุณสมชาย', ch: chan.msg, channel: 'MESSENGER', tags: [tags.price] },
    { n: 2, name: 'คุณมะลิ', ch: chan.ig, channel: 'INSTAGRAM', tags: [tags.promo] },
    { n: 3, name: 'คุณวิภา', ch: chan.msg, channel: 'MESSENGER', tags: [tags.price, tags.promo] },
    { n: 4, name: 'คุณนุ่น', ch: chan.line, channel: 'LINE', tags: [tags.ship] },
    { n: 5, name: 'คุณต้อม', ch: chan.line, channel: 'LINE', tags: [tags.ship] },
  ]
  const room = (n: number) => id('room', n)
  for (const p of people) {
    await prisma.externalContact.create({ data: { id: id('contact', p.n), shopChannelId: p.ch, externalUserId: `qa00095-psid-${p.n}`, name: `${TAG} ${p.name}`, tags: p.tags } })
  }

  // ข้อความ: [ห้อง, ใคร, กี่นาทีก่อน, เนื้อหา, ตัวเลือก]
  type Msg = { room: number; role: 'BUYER' | 'SHOP'; min: number; body: string; o?: Record<string, unknown> }
  const botBubble = { autoReplyKind: 'AUTO_FOLLOW', deliveryStatus: 'SENT' }
  const msgs: Msg[] = [
    // ห้อง 1 — ปกติ ส่งไปแล้ว 1 รอบ (2 ชิ้น: ข้อความ + ข้อความสำเร็จรูป)
    { room: 1, role: 'BUYER', min: 180, body: 'สอบถามราคาหน่อยค่ะ' },
    { room: 1, role: 'SHOP', min: 170, body: 'ราคา 590 บาทค่ะ', o: { senderUserId: seller.id } },
    { room: 1, role: 'SHOP', min: 120, body: `สวัสดีค่ะ คุณ${TAG} คุณสมชาย ยังสนใจสินค้าที่ถามไว้อยู่ไหมคะ`, o: botBubble },
    { room: 1, role: 'SHOP', min: 120, body: 'ถ้าสนใจทักมาได้เลยนะคะ ยินดีให้คำแนะนำค่ะ', o: botBubble },
    // ห้อง 2 — ร้านค้างตอบ (ลูกค้าทักล่าสุด ร้านยังไม่ตอบ)
    { room: 2, role: 'BUYER', min: 20, body: 'โปรนี้หมดเมื่อไหร่คะ' },
    // ห้อง 3 — พัก (Meta AI) + ข้ามรอบ + ส่งล้ม
    { room: 3, role: 'BUYER', min: 300, body: 'ขอทราบราคาส่งค่ะ' },
    { room: 3, role: 'SHOP', min: 280, body: 'ตอบอัตโนมัติ: เดี๋ยวแอดมินตอบนะคะ', o: { autoReplyKind: 'AUTO' } },
    // ห้อง 4 — บอทถูกลบ
    { room: 4, role: 'BUYER', min: 2880, body: 'ค่าส่งเท่าไหร่คะ' },
    { room: 4, role: 'SHOP', min: 2870, body: 'เริ่มต้น 40 บาทค่ะ', o: { senderUserId: seller.id } },
    { room: 4, role: 'SHOP', min: 1440, body: 'ยังสนใจอยู่ไหมคะ', o: botBubble },
    { room: 4, role: 'SHOP', min: 600, body: 'บอท “' + TAG + ' บอทเก่าที่ลบแล้ว” หยุดทักแล้ว เพราะบอทถูกลบ', o: { type: 'FOLLOW_BOT_NOTE' } },
    // ห้อง 5 — ลูกค้าตอบหลังบอทส่งไม่แน่ใจ → บอทหยุด
    { room: 5, role: 'BUYER', min: 360, body: 'ค่าส่งไปเชียงใหม่เท่าไหร่คะ' },
    { room: 5, role: 'SHOP', min: 350, body: '60 บาทค่ะ', o: { senderUserId: seller.id } },
    { room: 5, role: 'BUYER', min: 240, body: 'ขอบคุณค่ะ ขอคิดดูก่อน' },
    { room: 5, role: 'SHOP', min: 239, body: 'บอท “' + TAG + ' ตามคนลังเลเรื่องค่าส่ง” หยุดทักแล้ว เพราะลูกค้าตอบกลับ', o: { type: 'FOLLOW_BOT_NOTE' } },
  ]
  // ห้อง: lastInbound/lastMessage คิดจากข้อความจริง (ไม่นับบรรทัดระบบ)
  for (const p of people) {
    const mine = msgs.filter((m) => m.room === p.n && m.o?.type !== 'FOLLOW_BOT_NOTE')
    const lastBuyer = mine.filter((m) => m.role === 'BUYER').sort((a, b) => a.min - b.min)[0]
    const last = mine.sort((a, b) => a.min - b.min)[0]
    await prisma.conversation.create({
      data: {
        id: room(p.n), shopId, channel: p.channel, shopChannelId: p.ch, externalContactId: id('contact', p.n),
        lastInboundAt: ago(lastBuyer.min), lastMessageAt: ago(last.min), lastMessagePreview: last.body, lastSenderRole: last.role,
        createdAt: ago(10_000),
      },
    })
  }
  let mn = 0
  const botIds: Record<number, string[]> = {}
  for (const m of msgs) {
    const mid = id('msg', ++mn)
    await prisma.chatMessage.create({
      data: {
        id: mid, conversationId: room(m.room), senderRole: m.role, type: 'TEXT', body: m.body, createdAt: ago(m.min),
        ...(m.role === 'SHOP' && m.o?.type !== 'FOLLOW_BOT_NOTE' ? { externalMessageId: `qa00095-mid-${mn}` } : {}),
        ...m.o,
      } as never,
    })
    if (m.o?.autoReplyKind === 'AUTO_FOLLOW') (botIds[m.room] ??= []).push(mid)
  }

  // บอท 3 ตัว + บอทที่ถูกลบ 1 ตัว (ให้แถวประวัติ "บอทถูกลบ")
  const bot = { price: id('bot', 1), ship: id('bot', 2), quiet: id('bot', 3), old: id('bot', 4) }
  const mkBot = (b: string, name: string, status: string, salesStatuses: string[], tagKeys: string[], channels: string[], steps: object[], extra: object = {}) =>
    prisma.salesFollowBot.create({
      data: {
        id: b, shopId, name: `${TAG} ${name}`, status, salesStatuses, tagKeys, tagMatch: 'ANY', steps: steps as never,
        createdByUserId: seller.id, updatedByUserId: seller.id,
        channels: { create: channels.map((shopChannelId) => ({ shopChannelId })) }, ...extra,
      },
    })
  await mkBot(bot.price, 'ตามคนถามราคา', 'ACTIVE', ['NOT_BOUGHT'], [tagNameKey(tags.price), tagNameKey(tags.promo), tagNameKey(`${TAG} vip`)], [chan.msg, chan.ig], [
    step(30, [text('สวัสดีค่ะ คุณ{ชื่อ} ยังสนใจสินค้าที่ถามไว้อยู่ไหมคะ'), { kind: 'QUICK_MESSAGE', quickMessageId: q.hello }]),
    step(180, [text('วันนี้มีโปรพิเศษสำหรับคุณ{ชื่อ} นะคะ')]),
    step(1440, [text('ใกล้หมดโปรแล้วค่ะ สนใจสั่งได้เลย'), { kind: 'QUICK_MESSAGE', quickMessageId: q.promo }]),
  ]) // tag "vip" ไม่มีใน ShopTag = โชว์เตือน "แท็กถูกลบ" ตาม mockup
  await mkBot(bot.ship, 'ตามคนลังเลเรื่องค่าส่ง', 'TESTING', ['BILLED'], [tagNameKey(tags.ship)], [chan.line], [
    step(120, [text('คุณ{ชื่อ}คะ ตอนนี้ส่งฟรีเมื่อซื้อครบ 2 ชิ้นนะคะ')]),
    step(180, [text('ยังสนใจอยู่ไหมคะ')]),
  ], { testRooms: { create: [room(4), room(5)].map((conversationId) => ({ conversationId, createdByUserId: seller.id })) } })
  await mkBot(bot.quiet, 'ตามคนซื้อแล้วเงียบ', 'CLOSED', ['SHIPPED', 'COMPLETED'], [], [chan.msg, chan.ig, chan.line], [
    step(1440, [text('ขอบคุณที่อุดหนุนนะคะ คุณ{ชื่อ} ได้รับของแล้วใช้เป็นอย่างไรบ้างคะ')]),
    step(1440, [text('ถ้ามีข้อสงสัยทักมาได้เลยนะคะ')]),
  ])
  await mkBot(bot.old, 'บอทเก่าที่ลบแล้ว', 'CLOSED', ['NOT_BOUGHT'], [], [chan.line], [step(60, [text('ยังสนใจอยู่ไหมคะ')])], { deletedAt: ago(600) })

  // run: ห้อง 1-3 ACTIVE (3 กรณีของแผง) · ห้อง 4-5 จบแล้ว (ให้ประวัติ)
  const stamp = (min: number) => ago(min)
  const run = (n: number, botId: string, conv: number, stageMin: number, d: Record<string, unknown>) =>
    prisma.salesFollowRun.create({
      data: { id: id('run', n), shopId, botId, conversationId: room(conv), stageKey: 'NOT_BOUGHT', stageStamp: stamp(stageMin), structureRev: 1, ...d } as never,
    })
  await run(1, bot.price, 1, 180, { nextStep: 1, lastSentAt: ago(120), nextDueAt: ahead(360) })
  await run(2, bot.price, 2, 20, { nextStep: 0, nextDueAt: ahead(360) })
  await run(3, bot.price, 3, 300, { nextStep: 2, lastSentAt: ago(60), nextDueAt: ahead(1200), holdReason: 'META_AI_HOLDING' })
  await run(4, bot.old, 4, 2880, { nextStep: 1, lastSentAt: ago(1440), status: 'STOPPED', stopReason: 'BOT_DELETED', finishedAt: ago(600) })
  await run(5, bot.ship, 5, 360, { nextStep: 1, lastSentAt: ago(300), status: 'STOPPED', stopReason: 'CUSTOMER_REPLIED', finishedAt: ago(240) })

  // ประวัติการส่ง 5 แถว: ส่งแล้ว · ไม่ได้ส่ง · ส่งไม่สำเร็จ · ไม่แน่ใจ · บอทถูกลบ
  const send = (n: number, runN: number, botId: string, conv: number, step: number, stepCount: number, min: number, d: Record<string, unknown>) =>
    prisma.salesFollowSend.create({
      data: { id: id('send', n), shopId, runId: id('run', runN), conversationId: room(conv), botId, step, stepCount, createdAt: ago(min), settledAt: ago(min), ...d } as never,
    })
  const b1 = botIds[1], b4 = botIds[4]
  await send(1, 1, bot.price, 1, 0, 3, 120, { status: 'SENT', chatMessageId: b1[0], messageIds: b1 })
  await send(2, 3, bot.price, 3, 0, 3, 240, { status: 'SKIPPED', reason: 'EMPTY_MESSAGE' })
  await send(3, 3, bot.price, 3, 1, 3, 60, { status: 'FAILED', reason: 'PLATFORM_REJECTED' })
  await send(4, 5, bot.ship, 5, 0, 2, 300, { status: 'FAILED', reason: 'UNCERTAIN_SEND' })
  await send(5, 4, bot.old, 4, 0, 1, 1440, { status: 'SENT', chatMessageId: b4[0], messageIds: b4 })

  const counts = {
    contacts: await prisma.externalContact.count({ where: { id: { startsWith: PFX } } }),
    rooms: await prisma.conversation.count({ where: { id: { startsWith: PFX } } }),
    bots: await prisma.salesFollowBot.count({ where: { shopId } }),
    runs: await prisma.salesFollowRun.count({ where: { shopId } }),
    sends: await prisma.salesFollowSend.count({ where: { shopId } }),
  }
  console.log(JSON.stringify({ shopId, counts }, null, 1))
  console.log(`\nSALES_FOLLOW_BOT_SHOP_IDS=${shopId}`)
  console.log(`ล็อกอินเป็น: userId=${seller.id} username=${seller.username} (phone ${SELLER_PHONE}) — เลือกร้านนี้ด้วย activeShopId`)
  console.log(`cookie: npx tsx scripts/qa-00077-login.ts ${seller.id} ${shopId}`)
}

async function main() {
  console.log('cleanup:', JSON.stringify(await cleanup()))
  if (!process.argv.includes('--cleanup')) await seed()
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

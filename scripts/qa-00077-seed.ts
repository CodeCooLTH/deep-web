/**
 * QA 00077 seed — ร้าน BUSINESS + สมาชิก + เพจ + ห้องแชทครบสถานะ (id ทุกตัวขึ้นต้น qa77-)
 * รันซ้ำได้ (ลบของเดิมตาม prefix แล้วสร้างใหม่ → เวลาสดเสมอ · ห้อง "ร้านเพิ่งตอบ" หมดอายุใน 180 วิ)
 * ใช้: DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay npx tsx scripts/qa-00077-seed.ts
 * พิมพ์ JSON { ownerId, adminAId, adminBId, shopId, otherOwnerId, otherRoomId, ... } ให้ผู้เทส
 */
import { PrismaClient } from '@prisma/client'
import { cleanupQa77 } from './qa-00077-cleanup'

if (!/localhost:5434/.test(process.env.DATABASE_URL ?? '')) {
  console.error('refuse: DATABASE_URL ต้องชี้ localhost:5434'); process.exit(1)
}
const prisma = new PrismaClient()
export const CID = (k: string) => '77770000-0000-4000-8000-' + Buffer.from(k.padEnd(6, '_')).toString('hex')
const SHOP = CID('shop')
const U = { owner: CID('uown'), a: CID('uadma'), b: CID('uadmb'), buyer: CID('ubuy'), other: CID('uothr') }
const CH = { msg: CID('chmsg'), line: CID('chline'), ig: CID('chig') }
const SHOP2 = CID('shop2')
const CH2 = CID('chot')
const ago = (sec: number) => new Date(Date.now() - sec * 1000)

type Room = {
  key: string; name: string; channel: 'MESSENGER' | 'LINE' | 'INSTAGRAM' | 'DEEP'; ch?: keyof typeof CH
  kind: 'WAIT' | 'DESK_A' | 'DESK_B' | 'EXT' | 'STANDBY' | 'AUTO' | 'CLOSED'
  waitSec?: number; replySec?: number; extra?: 'LONG' | 'DELETED' | 'IMAGE'
}
const rooms: Room[] = [
  { key: 'w1', name: 'คุณสมหญิง ใจดีมากมาย', channel: 'MESSENGER', ch: 'msg', kind: 'WAIT', waitSec: 12 * 60 },
  { key: 'w2', name: 'พี่ต้อม', channel: 'LINE', ch: 'line', kind: 'WAIT', waitSec: 8 * 60, extra: 'DELETED' },
  { key: 'w3', name: 'Nattapong K.', channel: 'MESSENGER', ch: 'msg', kind: 'WAIT', waitSec: 150 },
  { key: 'w4', name: 'ลูกค้า IG ชื่อยาวมากๆๆๆ ทดสอบตัดข้อความ', channel: 'INSTAGRAM', ch: 'ig', kind: 'WAIT', waitSec: 90 },
  { key: 'w5', name: 'น้องบี', channel: 'LINE', ch: 'line', kind: 'WAIT', waitSec: 45 },
  { key: 'w6', name: 'คุณวิภา', channel: 'MESSENGER', ch: 'msg', kind: 'WAIT', waitSec: 20 },
  { key: 'w7', name: 'ผู้ซื้อ Deep (ในแอป)', channel: 'DEEP', kind: 'WAIT', waitSec: 60 },
  { key: 'a1', name: 'คุณมานี (โต๊ะ A-1)', channel: 'MESSENGER', ch: 'msg', kind: 'DESK_A', replySec: 20, extra: 'LONG' },
  { key: 'a2', name: 'คุณปราณี', channel: 'LINE', ch: 'line', kind: 'DESK_A', replySec: 30 },
  { key: 'a3', name: 'คุณสุรชัย', channel: 'INSTAGRAM', ch: 'ig', kind: 'DESK_A', replySec: 40, extra: 'IMAGE' },
  { key: 'a4', name: 'คุณอรุณ', channel: 'MESSENGER', ch: 'msg', kind: 'DESK_A', replySec: 50 },
  { key: 'a5', name: 'คุณจันทร์', channel: 'LINE', ch: 'line', kind: 'DESK_A', replySec: 60 },
  { key: 'b1', name: 'คุณพรชัย', channel: 'MESSENGER', ch: 'msg', kind: 'DESK_B', replySec: 25 },
  { key: 'x1', name: 'ลูกค้านอกระบบ 1', channel: 'MESSENGER', ch: 'msg', kind: 'EXT', replySec: 35 },
  { key: 'x2', name: 'ลูกค้านอกระบบ 2', channel: 'LINE', ch: 'line', kind: 'EXT', replySec: 45 },
  { key: 'x3', name: 'ลูกค้านอกระบบ 3', channel: 'INSTAGRAM', ch: 'ig', kind: 'EXT', replySec: 55 },
  { key: 'x4', name: 'ลูกค้านอกระบบ 4', channel: 'MESSENGER', ch: 'msg', kind: 'EXT', replySec: 65 },
  { key: 's1', name: 'ลูกค้า Meta AI', channel: 'MESSENGER', ch: 'msg', kind: 'STANDBY', replySec: 70 },
  { key: 'o1', name: 'ลูกค้าบอท', channel: 'LINE', ch: 'line', kind: 'AUTO', replySec: 75 },
  { key: 'c1', name: 'ลูกค้าปิดงาน 1', channel: 'MESSENGER', ch: 'msg', kind: 'CLOSED' },
  { key: 'c2', name: 'ลูกค้าปิดงาน 2', channel: 'LINE', ch: 'line', kind: 'CLOSED' },
]

async function main() {
  console.log('cleanup old:', await cleanupQa77(prisma))
  const phone = (n: number) => `0999${String(770000 + n)}`
  const mkUser = (id: string, displayName: string, n: number) =>
    prisma.user.create({ data: { id, displayName, username: 'qa77_' + displayName.length + '_' + id.slice(-12), phone: phone(n) } })
  await mkUser(U.owner, 'เจ้าของร้านทดสอบ QA77', 1)
  await mkUser(U.a, 'แอดมินสุทธิพงษ์ศรีสวัสดิ์ก', 2) // ชื่อยาวสุด
  await mkUser(U.b, 'แอดมินบี', 3)
  await mkUser(U.buyer, 'ผู้ซื้อ Deep QA77', 4)
  await mkUser(U.other, 'เจ้าของร้านอื่น QA77', 5)

  const shopName = 'ร้านอะไหล่มอเตอร์ไซค์เจริญทรัพย์ครบ' // ~34+
  await prisma.shop.create({ data: { id: SHOP, userId: U.owner, shopName, kind: 'BUSINESS', businessType: 'INDIVIDUAL', slug: 'qa77-shop' } })
  await prisma.shop.create({ data: { id: SHOP2, userId: U.other, shopName: 'ร้านอื่น QA77', kind: 'BUSINESS', businessType: 'INDIVIDUAL', slug: SHOP2 } })
  await prisma.user.updateMany({ where: { id: { in: [U.owner, U.other] } }, data: { isShop: true } })
  const mem = (id: string, shopId: string, userId: string, role: 'OWNER' | 'ADMIN', roles: string[]) =>
    prisma.shopMember.create({ data: { id, shopId, userId, role, roles } })
  await mem('qa77-mem-owner', SHOP, U.owner, 'OWNER', [])
  await mem('qa77-mem-a', SHOP, U.a, 'ADMIN', ['CHAT'])
  await mem('qa77-mem-b', SHOP, U.b, 'ADMIN', ['CHAT'])
  await mem('qa77-mem-other', SHOP2, U.other, 'OWNER', [])

  const chan = (id: string, provider: string, name: string, ext: string) =>
    prisma.shopChannel.create({ data: { id, shopId: SHOP, provider, externalId: ext, name, accessTokenEnc: 'x', connectedByUserId: U.owner } })
  await chan(CH.msg, 'MESSENGER', 'เพจร้านมอเตอร์ไซค์เจริญทรัพย์สาขาใหญ่', 'qa77-ext-msg') // ~37
  await chan(CH.line, 'LINE', 'LINE OA เจริญทรัพย์', 'qa77-ext-line')
  await chan(CH.ig, 'INSTAGRAM', 'ig_charoensap', 'qa77-ext-ig')
  await prisma.shopChannel.create({ data: { id: CH2, shopId: SHOP2, provider: 'MESSENGER', externalId: 'qa77-ext-o', name: 'เพจร้านอื่น', accessTokenEnc: 'x', connectedByUserId: U.other } })

  const msgs: Parameters<typeof prisma.chatMessage.create>[0]['data'][] = []
  let n = 0
  const M = (conversationId: string, senderRole: 'BUYER' | 'SHOP', createdAt: Date, body: string, o: Record<string, unknown> = {}) =>
    msgs.push({ id: `qa77-m-${++n}`, conversationId, senderRole, createdAt, body, type: 'TEXT', ...o } as never)

  for (const r of rooms) {
    const id = CID(r.key)
    const isDeep = r.channel === 'DEEP'
    if (!isDeep) await prisma.externalContact.create({ data: { id: `qa77-ec-${r.key}`, shopChannelId: CH[r.ch!], externalUserId: `qa77-psid-${r.key}`, name: r.name } })
    const base = {
      id, shopId: SHOP, channel: r.channel,
      ...(isDeep ? { buyerUserId: U.buyer } : { shopChannelId: CH[r.ch!], externalContactId: `qa77-ec-${r.key}` }),
    }
    if (r.kind === 'WAIT') {
      const at = ago(r.waitSec!)
      await prisma.conversation.create({ data: { ...base, lastSenderRole: 'BUYER', lastInboundAt: at, lastMessageAt: at, lastMessagePreview: 'สนใจสินค้าครับ', createdAt: ago(10800) } })
      if (r.extra === 'DELETED') { M(id, 'BUYER', ago(r.waitSec! + 600), 'ข้อความที่ถูกลบ ห้ามโชว์เนื้อหานี้', { isDeleted: true }); }
      M(id, 'BUYER', at, `สอบถามราคาหน่อยค่ะ (${r.name})`)
    } else if (r.kind === 'CLOSED') {
      const at = ago(30)
      await prisma.conversation.create({ data: { ...base, lastSenderRole: 'SHOP', lastMessageAt: at, resolvedAt: at, lastInboundAt: ago(900), createdAt: ago(10800) } })
      M(id, 'BUYER', ago(900), 'ขอบคุณครับ'); M(id, 'SHOP', at, 'ยินดีค่ะ')
    } else {
      const rep = ago(r.replySec!)
      const asked = new Date(rep.getTime() - 40_000)
      await prisma.conversation.create({ data: { ...base, lastSenderRole: 'SHOP', lastInboundAt: asked, lastMessageAt: rep, lastMessagePreview: 'ตอบแล้วค่ะ', createdAt: ago(10800) } })
      if (r.extra === 'LONG') {
        // 34 ข้อความก่อนหน้า + ข้อความล่าสุด 2 ใบ = 36 → truncated; มีใบที่ถูกลบ 1 ใบ
        for (let i = 0; i < 34; i++) {
          const t = new Date(asked.getTime() - (40 - i) * 60_000)
          M(id, i % 2 ? 'SHOP' : 'BUYER', t, `ข้อความเก่าลำดับ ${i + 1}`, i === 10 ? { isDeleted: true, body: 'SECRET-DELETED-BODY' } : i % 2 ? { senderUserId: U.a } : {})
        }
      }
      if (r.extra === 'IMAGE') M(id, 'BUYER', new Date(asked.getTime() - 5000), '', { type: 'IMAGE', imageUrl: 'qa77/secret-image-id' })
      M(id, 'BUYER', asked, `ขอถามเรื่องสินค้าหน่อย (${r.name})`)
      const o: Record<string, unknown> =
        r.kind === 'DESK_A' ? { senderUserId: U.a } : r.kind === 'DESK_B' ? { senderUserId: U.b }
        : r.kind === 'STANDBY' ? { viaStandby: true } : r.kind === 'AUTO' ? { autoReplyKind: 'AUTO' } : {}
      M(id, 'SHOP', rep, `ตอบโดย ${r.kind}`, o)
    }
  }
  // ห้องร้านอื่น (สำหรับ preview 404)
  await prisma.externalContact.create({ data: { id: 'qa77-ec-other', shopChannelId: CH2, externalUserId: 'qa77-psid-other', name: 'ลูกค้าร้านอื่น' } })
  await prisma.conversation.create({ data: { id: CID('other'), shopId: SHOP2, channel: 'MESSENGER', shopChannelId: CH2, externalContactId: 'qa77-ec-other', lastSenderRole: 'BUYER', lastInboundAt: ago(60), lastMessageAt: ago(60) } })
  M(CID('other'), 'BUYER', ago(60), 'ความลับร้านอื่น')

  for (const d of msgs) await prisma.chatMessage.create({ data: d })
  const shopLastReadAt = ago(3600)
  await prisma.conversation.updateMany({ where: { id: { startsWith: '77770000-' } }, data: { shopLastReadAt } })
  console.log(JSON.stringify({
    shopId: SHOP, ownerId: U.owner, adminAId: U.a, adminBId: U.b, otherOwnerId: U.other, otherRoomId: CID('other'),
    longRoomId: CID('a1'), shopLastReadAt: shopLastReadAt.toISOString(), shopNameLen: [...shopName].length, messages: msgs.length,
  }, null, 1))
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })

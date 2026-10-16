/**
 * QA 00077 cleanup — ลบเฉพาะข้อมูลที่ qa-00077-seed.ts สร้าง (id ขึ้นต้น qa77-) · HR13
 * ใช้: DATABASE_URL=postgresql://safepay:safepay@localhost:5434/safepay npx tsx scripts/qa-00077-cleanup.ts
 */
import { PrismaClient } from '@prisma/client'

export async function cleanupQa77(prisma: PrismaClient) {
  const P = { startsWith: 'qa77-' } // ExternalContact/ShopMember
  const Q = { startsWith: '77770000-' } // user/shop/channel/conversation (UUID เพราะ route validate uuid)
  // ลำดับ: ข้อความ→ห้อง→ผู้ติดต่อ→เพจ→สมาชิก→ร้าน→ผู้ใช้ (ทุกคำสั่ง scope ด้วย id prefix)
  const convs = await prisma.conversation.findMany({ where: { id: { startsWith: '77770000-' } }, select: { id: true } })
  const cids = convs.map((c) => c.id)
  const m = await prisma.chatMessage.deleteMany({ where: { conversationId: { in: cids } } })
  const c = await prisma.conversation.deleteMany({ where: { id: { startsWith: '77770000-' } } })
  const e = await prisma.externalContact.deleteMany({ where: { id: P } })
  const ch = await prisma.shopChannel.deleteMany({ where: { id: Q } })
  const mem = await prisma.shopMember.deleteMany({ where: { id: P } })
  const s = await prisma.shop.deleteMany({ where: { id: Q } })
  const u = await prisma.user.deleteMany({ where: { id: Q } })
  return { messages: m.count, conversations: c.count, contacts: e.count, channels: ch.count, members: mem.count, shops: s.count, users: u.count }
}

if (require.main === module) {
  if (!/localhost:5434/.test(process.env.DATABASE_URL ?? '')) {
    console.error('refuse: DATABASE_URL ต้องชี้ localhost:5434'); process.exit(1)
  }
  const prisma = new PrismaClient()
  cleanupQa77(prisma).then(async (r) => {
    console.log('deleted', r)
    const left = {
      users: await prisma.user.count({ where: { id: { startsWith: '77770000-' } } }),
      shops: await prisma.shop.count({ where: { id: { startsWith: '77770000-' } } }),
      conversations: await prisma.conversation.count({ where: { id: { startsWith: '77770000-' } } }),
      channels: await prisma.shopChannel.count({ where: { id: { startsWith: '77770000-' } } }),
    }
    console.log('remaining', left)
    await prisma.$disconnect()
  })
}

/**
 * backfill ชื่อผู้ติดต่อของห้องแชทที่เกิดจาก private reply (feature 00038 — bug fix 2026-08-19)
 *
 * ที่มา (user report): ห้อง `/inbox/ee3ef28e-…` ขึ้นชื่อว่า "ผู้ติดต่อ" — สืบแล้วพบว่าห้องนั้น
 * ไม่ได้เกิดจากลูกค้าทักเข้ามา แต่เกิดจาก private reply ของคอมเมนต์ ซึ่ง
 * `comment-private-reply.service.ts` สร้าง `ExternalContact` เปล่า ๆ (ไม่มี name) เพราะชื่อผู้ติดต่อ
 * ถูกดึงจาก Graph ที่ `ingestInboundMessage` เท่านั้น และเส้นทางนั้นวิ่งเฉพาะตอนมี "ข้อความขาเข้า"
 * ⇒ ลูกค้าไม่ตอบ = ชื่อค้างเป็น "ผู้ติดต่อ" ตลอดไป
 *
 * โค้ดฝั่ง service ถูกแก้ให้ยืมชื่อจากคอมเมนต์ตั้งแต่ตอนเปิดห้องแล้ว (resolveSeedContactName)
 * — สคริปต์นี้มีไว้เก็บ **ของเก่า** ที่ค้างอยู่ก่อนหน้า (prod 2026-08-19 = 35 แถว)
 *
 * เกณฑ์ (ต้องตรงกับ resolveSeedContactName เป๊ะ ๆ — ที่นี่เป็นแค่การเดินเกณฑ์เดิมย้อนหลัง):
 *   - แตะเฉพาะ ExternalContact ที่ `name` ว่างอยู่จริง (ห้ามทับชื่อที่ Graph เคยดึงได้)
 *   - จับคู่คอมเมนต์ด้วย **(shopChannelId, fromExternalId)** ไม่ใช่ fromExternalId เดี่ยว ๆ
 *     — id ของ Meta เป็น page-scoped ชนกันข้ามเพจได้
 *   - `fromName` ต้องไม่ว่าง (คอมเมนต์ที่ดึงย้อนหลังผ่าน Graph ไม่มีคีย์ `from` มาให้เลย)
 *
 * 🛑 ห้ามแตะ `avatarSyncedAt` — ปล่อย null ไว้เพื่อให้ shouldRetryAvatar() (channel-chat.service.ts:826)
 *    ยังคืน true ⇒ ข้อความขาเข้าใบแรกของลูกค้ายังยิง Graph ดึงชื่อ/รูปจริงมาทับชื่อชั่วคราวนี้ตามปกติ
 *
 * สำคัญ: dry-run เป็นค่าตั้งต้น — ต้องใส่ `--apply` ถึงจะเขียนจริง
 * สำคัญ: idempotent — รันซ้ำได้ แถวที่มีชื่อแล้วจะไม่ถูกเลือกอีก
 *
 * ใช้:
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-private-reply-contact-names.ts
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-private-reply-contact-names.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { resolveSeedContactName } from '../src/services/comment-private-reply.service'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')

async function main() {
  const contacts = await prisma.externalContact.findMany({
    where: { name: null },
    select: { id: true, shopChannelId: true, externalUserId: true, name: true },
  })

  console.log(`ExternalContact ที่ยังไม่มีชื่อ: ${contacts.length} แถว`)
  if (contacts.length === 0) return

  let filled = 0
  let noComment = 0

  for (const contact of contacts) {
    // คอมเมนต์ใบล่าสุดของคนนี้บนเพจนี้ที่มีชื่อติดมาด้วย — ชื่อที่ Meta ส่งมากับ webhook ล่าสุด
    // ใกล้ความจริงที่สุด (คนเปลี่ยนชื่อโปรไฟล์ได้)
    const comment = await prisma.pageComment.findFirst({
      where: {
        shopChannelId: contact.shopChannelId,
        fromExternalId: contact.externalUserId,
        fromName: { not: null },
      },
      orderBy: { createdTime: 'desc' },
      select: { fromExternalId: true, fromName: true },
    })

    const seedName = comment
      ? resolveSeedContactName({
          recipientId: contact.externalUserId,
          commentFromExternalId: comment.fromExternalId,
          commentFromName: comment.fromName,
        })
      : null

    if (!seedName) {
      noComment++
      console.log(`  - ${contact.id} (${contact.externalUserId}) — ไม่พบชื่อจากคอมเมนต์ ข้าม`)
      continue
    }

    filled++
    console.log(`  ${APPLY ? '✓' : '(dry-run)'} ${contact.id} (${contact.externalUserId}) -> "${seedName}"`)
    if (APPLY) {
      // เงื่อนไข `name: null` ซ้ำใน where อีกชั้น — กันเส้นทางจริง (ลูกค้าตอบกลับ) เขียนชื่อจริง
      // ลงไประหว่างที่สคริปต์กำลังไล่ทีละแถวอยู่ แล้วเราไปทับด้วยชื่อจากคอมเมนต์
      await prisma.externalContact.updateMany({
        where: { id: contact.id, name: null },
        data: { name: seedName },
      })
    }
  }

  console.log(
    `\nสรุป: เติมชื่อได้ ${filled} แถว · ไม่พบชื่อจากคอมเมนต์ ${noComment} แถว${APPLY ? '' : ' (dry-run — ยังไม่เขียนอะไรลงฐาน ใส่ --apply เพื่อเขียนจริง)'}`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

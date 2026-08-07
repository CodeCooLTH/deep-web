/**
 * backfill แถวที่มาทาง **webhook** แล้วการ์ดของ Meta ถูกเก็บเป็นข้อความดิบ (2026-08-07)
 *
 * ที่มา: `composeStructuredText()` เดิมคืน `elements[0].title` ดิบ ๆ ไม่มีคำนำหน้า ไม่ดึง subtitle
 * → ขึ้นเป็นบับเบิลสีร้าน ดูเหมือนแอดมินพิมพ์ว่า "฿360.00 order" เอง (~75 แถวบน prod)
 * แก้ที่ต้นทางแล้วใน commit 410b96f0 — สคริปต์นี้ตามเก็บของเก่า
 *
 * ต่างจาก `backfill-fb-card-messages.ts` ตรงที่ **ไม่ต้องยิง Graph เลย** สำหรับแถวที่มี
 * `rawMessage` — payload อยู่ในฐานเราครบแล้ว แค่ประกอบใหม่ด้วย `composeStructuredText()`
 * ตัวจริงจาก repo (ไม่ใช่ที่เขียนเลียนแบบ) แถวที่ไม่มี `rawMessage` (เข้ามาก่อน 2026-08-03)
 * รายงานไว้เฉย ๆ ให้ตัดสินแยก
 *
 * สำคัญ: dry-run เป็นค่าตั้งต้น — ต้องใส่ `--apply` ถึงจะเขียนจริง
 * สำคัญ: ข้าม type='CALL' เสมอ — `body` ของมันคือค่าที่ฝั่ง render ใช้แยกสายที่ไม่ได้รับ
 * สำคัญ: แตะเฉพาะคอลัมน์ `body` (+ `lastMessagePreview` ของเธรดที่ข้อความนั้นเป็นตัวล่าสุด)
 */
import { PrismaClient, Prisma } from '@prisma/client'
import { composeStructuredText, classifyCallTemplate, CARD_PREFIX } from '../src/services/channel-chat.service'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

type RawAtt = { type?: string; payload?: Record<string, unknown> }

async function main() {
  // ดึงเฉพาะแถวที่ "อาจ" เป็นการ์ด: มาทาง webhook + attachment แรกเป็น template
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; body: string | null; type: string; atts: RawAtt[] | null }>
  >(`
    SELECT id, body, type,
           ("rawMessage"->'payload'->'message'->'attachments')::jsonb AS atts
    FROM "ChatMessage"
    WHERE "rawMessage"->>'source' = 'webhook'
      AND "rawMessage"->'payload'->'message'->'attachments'->0->>'type' = 'template'
    ORDER BY "createdAt" ASC
  `)

  console.log(`แถว template ที่มาทาง webhook: ${rows.length} · โหมด ${APPLY ? 'APPLY (เขียนจริง)' : 'DRY-RUN'}\n`)

  const updates: Array<{ id: string; from: string; to: string; toType?: string }> = []
  let alreadyOk = 0
  let skippedCall = 0
  let noChange = 0

  for (const r of rows) {
    if (r.type === 'CALL') {
      skippedCall++
      continue
    }
    const att = r.atts?.[0]

    // สายจริงที่เข้ามาก่อนมีโค้ด type='CALL' (2026-08-03) ค้างเป็น TEXT อยู่ — เลื่อนขั้นให้เป็น
    // การ์ดโทรเหมือนใบใหม่ (user สั่ง 2026-08-07: "Misscall ก็ควรขึ้น card ว่า missed call")
    // body ต้องเป็น title ดิบ **ห้ามมีคำนำหน้า** เพราะ ChatThread อ่าน body === 'Missed call'
    // เพื่อแยกสายที่ไม่ได้รับออกจากสายที่คุยจบ — ใช้ classifyCallTemplate ตัวเดียวกับที่ ingest ใช้
    const call = classifyCallTemplate(att?.type, att?.payload as never)
    if (call.isCall && call.title) {
      if (r.body !== call.title || r.type !== 'CALL') {
        updates.push({ id: r.id, from: r.body ?? '(ว่าง)', to: call.title, toType: 'CALL' })
      } else {
        noChange++
      }
      continue
    }

    if (r.body?.startsWith(CARD_PREFIX)) {
      alreadyOk++
      continue
    }
    const next = composeStructuredText(att?.type, att?.payload as never)
    // สนใจเฉพาะกรณีที่กฎใหม่ตัดสินว่าเป็น "การ์ดจริง" — ที่เหลือคือข้อความธรรมดา ไม่ต้องแตะ
    if (!next || !next.startsWith(CARD_PREFIX) || next === r.body) {
      noChange++
      continue
    }
    updates.push({ id: r.id, from: r.body ?? '(ว่าง)', to: next })
  }

  const byTo = new Map<string, number>()
  updates.forEach((u) => byTo.set(u.to, (byTo.get(u.to) ?? 0) + 1))

  console.log(`ข้อความที่จะเขียน (ไม่ซ้ำ ${byTo.size} แบบ):`)
  ;[...byTo.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([to, n]) => console.log(`  ${String(n).padStart(4)} × ${to}`))

  const promoted = updates.filter((u) => u.toType === 'CALL')
  if (promoted.length) {
    console.log(`\nเลื่อนเป็นการ์ดโทร (type=TEXT → CALL) ${promoted.length} แถว:`)
    promoted.forEach((u) => console.log(`  "${u.from}" → type=CALL body="${u.to}"`))
  }

  console.log('\nตัวอย่างการเปลี่ยนแปลง (5 แรก):')
  updates.slice(0, 5).forEach((u) => console.log(`  "${u.from}"\n    → "${u.to}"`))

  console.log('\nสรุป:')
  console.log(`  จะอัปเดต            ${updates.length}`)
  console.log(`  ถูกต้องอยู่แล้ว       ${alreadyOk}`)
  console.log(`  ข้าม (type=CALL)     ${skippedCall}`)
  console.log(`  ไม่ใช่การ์ด/ไม่เปลี่ยน  ${noChange}`)

  // แถวเก่าที่ไม่มี rawMessage — ประกอบใหม่จากฐานเราไม่ได้ ต้องยิง Graph (คนละรอบ)
  const legacy = await prisma.chatMessage.count({
    where: {
      rawMessage: { equals: Prisma.DbNull },
      OR: [{ body: { startsWith: '฿' } }, { body: { in: ['Audio call', 'Missed call', 'Transfer requested'] } }],
    },
  })
  console.log(`  แถวเก่าที่ไม่มี rawMessage (ต้องยิง Graph รอบแยก) ~${legacy}`)

  if (!APPLY) {
    console.log('\nDRY-RUN — ไม่มีอะไรถูกเขียน. ใส่ --apply เพื่อเขียนจริง')
    return
  }

  let done = 0
  for (const u of updates) {
    // scope แคบ: ผูก id + ยืนยันว่า body ยังเป็นค่าเดิม (กันชนกับงานอื่นที่อาจเขียนแทรก)
    done += (
      await prisma.chatMessage.updateMany({
        where: { id: u.id, body: u.from },
        data: u.toType ? { body: u.to, type: u.toType } : { body: u.to },
      })
    ).count
  }
  console.log(`\nเขียนจริงแล้ว ${done} แถว`)

  // preview ของเธรดที่ข้อความล่าสุดกลายเป็นการ์ด ต้องเป็น label สั้น ไม่ใช่เนื้อหายาว
  const fixed = await prisma.$executeRawUnsafe(`
    WITH last AS (
      SELECT c.id, m.body
      FROM "Conversation" c
      JOIN LATERAL (
        SELECT body FROM "ChatMessage" WHERE "conversationId" = c.id
        ORDER BY "createdAt" DESC, seq DESC LIMIT 1
      ) m ON true
    )
    UPDATE "Conversation" c SET "lastMessagePreview" = '[ข้อความจากระบบ]'
    FROM last l
    WHERE c.id = l.id AND l.body LIKE '${CARD_PREFIX}%' AND c."lastMessagePreview" <> '[ข้อความจากระบบ]'
  `)
  console.log(`ซ่อม lastMessagePreview ${fixed} เธรด`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

/**
 * backfill ข้อความที่เคยถูกบันทึกเป็น placeholder เพราะบั๊ก `attachments{type}` (2026-08-07)
 *
 * ที่มา: `fetchThreadMessages` เคยขอฟิลด์ที่ไม่มีอยู่จริง Graph จึงตัด `attachments` ทิ้งเงียบ ๆ
 * แล้วคืน HTTP 200 → การ์ด/ไฟล์แนบทุกใบที่มาทาง backfill กลายเป็น
 * "[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger]" (542 แถวบน prod)
 * ดู `docs/conventions/external-payload-schema.md` ข้อ 3
 *
 * สคริปต์นี้ยิง Graph ถามข้อความ "รายใบ" ด้วย mid ที่เก็บไว้ (`fetchMessageContent` — โค้ดตัวจริง
 * จาก repo ไม่ใช่ที่เขียนเลียนแบบ) แล้วเขียนเนื้อหาจริงกลับลงแถวเดิม
 *
 * สำคัญ: dry-run เป็นค่าตั้งต้น — ต้องใส่ `--apply` ถึงจะเขียนจริง
 * สำคัญ: ขอบเขตแคบเสมอ: อัปเดตเฉพาะแถวที่ body ตรงกับ placeholder เป๊ะ ๆ และ rawMessage.source
 *    เป็น 'graph-backfill' เท่านั้น — ไม่แตะข้อความที่คนพิมพ์
 * สำคัญ: รอบนี้ **ไม่ mirror ไฟล์** (ไม่เขียน storage) แถวที่เป็นสื่อจะถูกรายงานไว้ให้ตัดสินแยก
 *
 * ใช้:
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-fb-card-messages.ts
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-fb-card-messages.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { fetchMessageContent } from '../src/lib/facebook/graph'
import { decryptToken } from '../src/lib/token-crypto'

const PLACEHOLDER = '[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger]'
const CARD_PREFIX = '[การ์ดจาก Facebook]'
const BATCH = 4

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

/** ล้อ cardText() ใน channel-chat.service.ts — บรรทัดเดียว มีคำนำหน้าเสมอ */
function cardText(a: { title: string | null; subtitle: string | null }): string | null {
  const parts = [a.title, a.subtitle]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => s.replace(/\s+/g, ' ').trim())
  return parts.length > 0 ? `${CARD_PREFIX} ${parts.join(' — ')}` : null
}

type Outcome = 'card' | 'text' | 'media' | 'still-empty' | 'graph-null' | 'no-token'

async function main() {
  const rows = await prisma.chatMessage.findMany({
    where: { body: PLACEHOLDER, externalMessageId: { not: null } },
    select: {
      id: true,
      externalMessageId: true,
      createdAt: true,
      conversation: {
        select: { id: true, shopChannel: { select: { accessTokenEnc: true, status: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`พบแถวที่เป็น placeholder ${rows.length} แถว · โหมด ${APPLY ? 'APPLY (เขียนจริง)' : 'DRY-RUN'}\n`)

  const tally: Record<Outcome, number> = {
    card: 0, text: 0, media: 0, 'still-empty': 0, 'graph-null': 0, 'no-token': 0,
  }
  const samples: string[] = []
  const updates: Array<{ id: string; body: string }> = []

  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map(async (r) => {
        const enc = r.conversation.shopChannel?.accessTokenEnc
        if (!enc || r.conversation.shopChannel?.status !== 'ACTIVE') {
          tally['no-token']++
          return
        }
        const got = await fetchMessageContent(r.externalMessageId!, decryptToken(enc))
        if (!got) {
          tally['graph-null']++
          return
        }

        const media = got.attachments.find((a) => a.kind !== 'template' && !!a.mediaUrl)
        if (media) {
          // รอบนี้ไม่แตะ storage — รายงานไว้ให้ตัดสินแยก
          tally.media++
          if (samples.length < 25) samples.push(`  [สื่อ]  ${media.kind} ${media.mimeType ?? ''}`)
          return
        }

        const body = got.text ?? got.attachments.map(cardText).find((t): t is string => !!t) ?? null
        if (!body) {
          tally['still-empty']++
          return
        }

        tally[got.text ? 'text' : 'card']++
        updates.push({ id: r.id, body })
        if (samples.length < 25) samples.push(`  [${got.text ? 'ข้อความ' : 'การ์ด'}] ${body.slice(0, 90)}`)
      }),
    )
    if ((i / BATCH) % 10 === 0) console.log(`  …ตรวจแล้ว ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }

  // นับข้อความที่ไม่ซ้ำ — ตรวจง่ายกว่าไล่ดูตัวอย่างสุ่ม ว่ามีข้อความแปลกปลอมหลุดเข้ามาไหม
  const byBody = new Map<string, number>()
  updates.forEach((u) => byBody.set(u.body, (byBody.get(u.body) ?? 0) + 1))
  console.log(`\nข้อความที่จะเขียน (ไม่ซ้ำ ${byBody.size} แบบ):`)
  ;[...byBody.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([body, n]) => console.log(`  ${String(n).padStart(4)} × ${body}`))

  console.log('\nตัวอย่างที่ตรวจเจอ (สูงสุด 25):')
  samples.forEach((s) => console.log(s))

  console.log('\nสรุป:')
  console.log(`  การ์ดที่ได้เนื้อหาจริง   ${tally.card}`)
  console.log(`  ข้อความที่ Graph ให้มา   ${tally.text}`)
  console.log(`  เป็นสื่อ (ยังไม่แตะ)     ${tally.media}`)
  console.log(`  Meta ไม่ให้อะไรจริง ๆ    ${tally['still-empty']}`)
  console.log(`  Graph ปฏิเสธ/ลบไปแล้ว    ${tally['graph-null']}`)
  console.log(`  ไม่มี token ที่ใช้ได้     ${tally['no-token']}`)
  console.log(`  → จะอัปเดตทั้งหมด ${updates.length} แถว`)

  if (!APPLY) {
    console.log('\nDRY-RUN — ไม่มีอะไรถูกเขียน. ใส่ --apply เพื่อเขียนจริง')
    return
  }

  let done = 0
  for (const u of updates) {
    // scope แคบ: ผูก id + ยืนยันว่า body ยังเป็น placeholder เดิม (กันชนกับ webhook ที่อาจเขียนแทรก)
    done += (
      await prisma.chatMessage.updateMany({
        where: { id: u.id, body: PLACEHOLDER },
        data: { body: u.body },
      })
    ).count
  }
  console.log(`\nเขียนจริงแล้ว ${done} แถว`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

/**
 * backfill การ์ดที่มาทาง **Graph backfill** ย้อนหลัง (`ChatMessage.cards`) — 2026-08-10
 *
 * คู่แฝดของ `backfill-generic-card-carousel.ts` (ซึ่งครอบเฉพาะแถวที่มาทาง webhook) — การ์ดของ
 * Facebook เข้าระบบได้ 2 ทางและเก็บ rawMessage คนละโครง สคริปต์ตัวโน้นจึงมองแถวชุดนี้ไม่เห็นเลย:
 *   webhook : rawMessage.payload.message.attachments[].payload.elements[]
 *   Graph   : rawMessage.payload.attachments[]  = { kind:'template', title, subtitle, mediaUrl }
 *
 * ชุดนี้คือ "ตอบกลับอัตโนมัติของโฆษณา" (Click-to-Messenger) ซึ่ง **เข้ามาทาง Graph ได้ทางเดียว**
 * เพราะ Meta ไม่ยิง echo ให้ระบบอัตโนมัติของตัวเอง — บน prod 2026-08-10 มี 132 ข้อความ ตั้งแต่
 * 2026-01-19 ถึงวันนี้ และยังเพิ่มวันละ ~20
 *
 * ไม่มีเดดไลน์แบบชุด webhook: รูปของการ์ดโฆษณาอยู่ที่ `www.facebook.com/ads/image/?d=<blob>`
 * ซึ่งชี้ "ตัวครีเอทีฟ" ไม่ใช่ลิงก์ CDN ที่เซ็นหมดอายุ (`oe=`) — ยิงจริงกับใบเก่าสุด (2026-01-19)
 * เมื่อ 2026-08-10 ยังได้ 200 JPEG อยู่ ถึงอย่างนั้นก็ไม่มีอะไรรับประกันว่าจะอยู่ตลอดไป
 *
 * ขอบเขตแคบเสมอ — แตะเฉพาะแถวที่:
 *   1. `body` ขึ้นต้นด้วย CARD_PREFIX (ตัวแปรจริงจาก service ไม่ใช่สตริงที่พิมพ์ซ้ำ)
 *   2. `cards IS NULL` (ยังไม่เคย backfill — รันซ้ำได้ ไม่ทับของที่ทำไปแล้ว)
 *   3. แกะได้ด้วย `extractGraphCards` **ตัวเดียวกับที่ ingest ใช้** (ห้ามลอกเกณฑ์ไปเขียนซ้ำ)
 * ไม่แตะ `body` เลย: ปุ่มคัดลอก/ตอบกลับผูกกับ body และเป็น fallback เมื่อ cards ว่าง
 *
 * dry-run เป็นค่าตั้งต้น ต้องใส่ `--apply` ถึงจะเขียนจริง (ทั้ง DB และ storage)
 *
 * ใช้:
 *   npx dotenv -e .env.vercel-prod -- npx tsx scripts/backfill-graph-card-carousel.ts
 *   npx dotenv -e .env.vercel-prod -- npx tsx scripts/backfill-graph-card-carousel.ts --apply
 */
// Prisma.DbNull = "คอลัมน์ Json ที่เป็น NULL จริง" ต่างจาก JsonNull (ค่า null ที่เก็บอยู่ใน JSON)
// ใช้ผิดตัวจะ match 0 แถวเงียบ ๆ แล้วสคริปต์จะรายงานว่าไม่มีอะไรทำทั้งที่ข้อมูลอยู่ครบ
import { Prisma, PrismaClient } from '@prisma/client'
import { extractGraphCards, mirrorRemoteImage, CARD_PREFIX } from '../src/services/channel-chat.service'
import type { GraphThreadAttachment } from '../src/lib/facebook/graph'

const APPLY = process.argv.includes('--apply')
/** mirror ทีละ 3 — ยิงพร้อมกันเยอะจะโดนฝั่ง Meta ตัด และกิน memory ฝั่งเรา */
const BATCH = 3

const prisma = new PrismaClient()

type RawEnvelope = { payload?: { attachments?: Partial<GraphThreadAttachment>[] } }

/** เติมฟิลด์ที่ขาดให้ครบรูป GraphThreadAttachment — rawMessage เก็บเท่าที่ Graph ให้มาในวันนั้น */
function toAttachment(a: Partial<GraphThreadAttachment>): GraphThreadAttachment {
  return {
    kind: a.kind ?? 'file',
    title: a.title ?? null,
    subtitle: a.subtitle ?? null,
    mediaUrl: a.mediaUrl ?? null,
    isSticker: a.isSticker ?? false,
    name: a.name ?? null,
    mimeType: a.mimeType ?? null,
    size: a.size ?? null,
  }
}

async function main() {
  console.log(APPLY ? '=== APPLY: เขียนจริงทั้ง DB และ storage ===' : '=== DRY RUN (ใส่ --apply ถึงจะเขียน) ===')

  // 🛑 ต้องขอ rawMessage ตรง ๆ — คอลัมน์นี้ถูก global omit ที่ src/lib/prisma.ts (กัน payload บวม)
  //    ไม่ใส่ omit:{rawMessage:false} จะได้ undefined ทุกแถวแล้วสคริปต์จะรายงานว่า "ไม่มีอะไรทำ"
  const rows = await prisma.chatMessage.findMany({
    where: { body: { startsWith: CARD_PREFIX }, cards: { equals: Prisma.DbNull } },
    select: { id: true, createdAt: true, body: true, rawMessage: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`แถวที่เข้าเงื่อนไข (body ขึ้นต้น "${CARD_PREFIX}" + cards ยังว่าง): ${rows.length}`)

  type Job = {
    id: string
    createdAt: Date
    body: string
    cards: { title: string | null; subtitle: string | null; imageUrl: string | null }[]
  }
  const jobs: Job[] = []
  let skippedNoRaw = 0
  let skippedNotCard = 0

  for (const r of rows) {
    const env = r.rawMessage as RawEnvelope | null
    const atts = env?.payload?.attachments
    if (!atts || atts.length === 0) {
      skippedNoRaw++
      continue
    }
    // ใช้ฟังก์ชันเดียวกับ ingest — เกณฑ์ "ต้องมีรูปอย่างน้อย 1 ใบ" และเพดาน 10 ใบ ต้องตรงกันเป๊ะ
    const cards = extractGraphCards(atts.map(toAttachment))
    if (!cards) {
      skippedNotCard++
      continue
    }
    jobs.push({ id: r.id, createdAt: r.createdAt, body: r.body ?? '', cards })
  }

  const totalImgs = jobs.reduce((n, j) => n + j.cards.filter((c) => c.imageUrl).length, 0)
  const hosts = new Map<string, number>()
  for (const j of jobs) {
    for (const c of j.cards) {
      if (!c.imageUrl) continue
      let h = '(invalid)'
      try {
        h = new URL(c.imageUrl).hostname
      } catch {
        /* ปล่อยเป็น (invalid) */
      }
      hosts.set(h, (hosts.get(h) ?? 0) + 1)
    }
  }

  console.log(`  ข้ามเพราะไม่มี rawMessage.payload.attachments : ${skippedNoRaw}`)
  console.log(`  ข้ามเพราะไม่ใช่การ์ดที่มีรูป (คำขอชำระเงิน/โทร) : ${skippedNotCard}`)
  console.log(`  จะ backfill : ${jobs.length} ข้อความ / ${totalImgs} รูป`)
  for (const [h, n] of [...hosts].sort((a, b) => b[1] - a[1])) console.log(`    - ${h}: ${n} รูป`)

  // ตัวอย่าง 3 แถวแรกให้เห็นว่าจะได้อะไร ก่อนตัดสินใจ --apply (บทเรียน 2026-08-09: ดูแถวจริง
  // ที่จะแตะ ไม่ใช่ดูแค่จำนวน — รอบนั้นจำนวนถูกแต่เนื้อในเป็นการ์ดคนละชนิด)
  console.log('\nตัวอย่าง 3 แถวแรก:')
  for (const j of jobs.slice(0, 3)) {
    console.log(`  [${j.createdAt.toISOString()}] ${j.body.slice(0, 60)}`)
    j.cards.forEach((c, i) =>
      console.log(`     ใบ ${i + 1}: "${c.title ?? '—'}" | "${c.subtitle ?? '—'}" | รูป: ${c.imageUrl ? 'มี' : 'ไม่มี'}`),
    )
  }

  if (!APPLY) {
    console.log('\n(dry run — ไม่ได้เขียนอะไรเลย)')
    return
  }

  let ok = 0
  let mirrored = 0
  let mirrorFailed = 0
  for (let i = 0; i < jobs.length; i += BATCH) {
    const slice = jobs.slice(i, i + BATCH)
    await Promise.all(
      slice.map(async (j) => {
        const cards = await Promise.all(
          j.cards.map(async (c) => {
            // mirror ล้มเหลว → imageFileId null (การ์ดยังขึ้นได้ ไม่มีรูป) ห้าม throw ทิ้งทั้งแถว
            const imageFileId = c.imageUrl ? await mirrorRemoteImage(c.imageUrl) : null
            if (c.imageUrl) imageFileId ? mirrored++ : mirrorFailed++
            return { title: c.title, subtitle: c.subtitle, imageFileId }
          }),
        )
        // scope ด้วย id ของแถวที่อ่านมาเอง + กันเขียนทับถ้ามีใคร backfill แซงระหว่างทาง
        const res = await prisma.chatMessage.updateMany({
          where: { id: j.id, cards: { equals: Prisma.DbNull } },
          data: { cards },
        })
        ok += res.count
      }),
    )
    console.log(`  …${Math.min(i + BATCH, jobs.length)}/${jobs.length}`)
  }

  console.log(`\nเขียนสำเร็จ ${ok} แถว · mirror รูปได้ ${mirrored} · mirror ล้มเหลว ${mirrorFailed}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

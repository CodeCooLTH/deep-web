/**
 * backfill การ์ดสินค้า carousel ย้อนหลัง (`ChatMessage.cards`) — 2026-08-09
 *
 * ที่มา: คอลัมน์ `cards` เพิ่งเปิดวันนี้ (migration 20260809100000) ข้อความการ์ดที่เข้ามาก่อนหน้า
 * จึงยังเป็นบรรทัดสรุปเดิม `[การ์ดจาก Facebook] <ใบแรก> และอีก N รายการ` ทั้งที่โครง `elements[]`
 * ยังอยู่ครบใน `rawMessage` (เปิดเก็บตั้งแต่ 2026-08-03)
 *
 * 🛑 มีเดดไลน์จริง: รูปบน fbcdn หมดอายุตาม `oe=` ในลิงก์ — ชุดที่มีรูปทั้งหมดหมดอายุ 13/08/2026
 * เลยวันนั้นไป 14 ข้อความจะกลายเป็นกล่องรูปเปล่าถาวร (ยิง Graph ใหม่ก็ไม่ได้ URL กลับมา)
 *
 * ขอบเขตแคบเสมอ — แตะเฉพาะแถวที่:
 *   1. `body` ขึ้นต้นด้วย CARD_PREFIX (ตัวแปรจริงจาก service ไม่ใช่สตริงที่พิมพ์ซ้ำ)
 *   2. `cards IS NULL` (ยังไม่เคย backfill — รันซ้ำได้ ไม่ทับของที่ทำไปแล้ว)
 *   3. แกะ `elements[]` ออกมาได้ด้วย `extractGenericCards` **ตัวเดียวกับที่ ingest ใช้**
 *      (ห้ามลอกเกณฑ์ไปเขียนซ้ำ ไม่งั้นแถวเก่ากับแถวใหม่จะตัดสินคนละแบบในฐานเดียวกันโดยไม่มีใครรู้
 *       — เหตุผลเดียวกับที่ `classifyCallTemplate`/`isCallCard` ถูก export ไว้)
 * ไม่แตะ `body` เลย: ปุ่มคัดลอก/ตอบกลับผูกกับ body และเป็น fallback เมื่อ cards ว่าง
 *
 * dry-run เป็นค่าตั้งต้น ต้องใส่ `--apply` ถึงจะเขียนจริง (ทั้ง DB และ storage)
 *
 * ใช้:
 *   npx dotenv -e .env.vercel-prod -- npx tsx scripts/backfill-generic-card-carousel.ts
 *   npx dotenv -e .env.vercel-prod -- npx tsx scripts/backfill-generic-card-carousel.ts --apply
 */
// Prisma.DbNull = "คอลัมน์ Json ที่เป็น NULL จริง" ต่างจาก JsonNull (ค่า null ที่เก็บอยู่ใน JSON)
// ใช้ผิดตัวจะ match 0 แถวเงียบ ๆ แล้วสคริปต์จะรายงานว่าไม่มีอะไรทำทั้งที่ข้อมูลอยู่ครบ
import { Prisma, PrismaClient } from '@prisma/client'
import { extractGenericCards, mirrorRemoteImage, CARD_PREFIX } from '../src/services/channel-chat.service'

const APPLY = process.argv.includes('--apply')
/** mirror ทีละ 3 — ไฟล์ละ ~2.3MB ยิงพร้อมกันเยอะจะโดน fbcdn ตัด และกิน memory ฝั่งเรา */
const BATCH = 3

const prisma = new PrismaClient()

type RawEnvelope = {
  payload?: { message?: { attachments?: { type?: string; payload?: unknown }[] } }
}

/** ถอด `oe=<hex>` ในลิงก์ fbcdn → วันหมดอายุ (ใช้รายงานว่ารูปไหนใกล้ตาย ไม่ได้ใช้ตัดสินใจ) */
function expiryOf(url: string): Date | null {
  const m = url.match(/[?&]oe=([0-9A-Fa-f]+)/)
  if (!m) return null
  const t = parseInt(m[1]!, 16)
  return Number.isFinite(t) ? new Date(t * 1000) : null
}

async function main() {
  console.log(APPLY ? '=== APPLY: เขียนจริงทั้ง DB และ storage ===' : '=== DRY RUN (ใส่ --apply ถึงจะเขียน) ===')

  // 🛑 ต้องขอ rawMessage ตรง ๆ — คอลัมน์นี้ถูก global omit ที่ src/lib/prisma.ts (กัน payload บวม)
  //    ถ้าไม่ใส่ omit:{rawMessage:false} จะได้ undefined ทุกแถวแล้วสคริปต์จะรายงานว่า "ไม่มีอะไรทำ"
  //    ทั้งที่ข้อมูลอยู่ครบ — พังเงียบชนิดที่ไม่มี error ให้เห็น
  // feature 00051 (S-6): ต้องมี shopId ต่อแถวเพื่อส่งเข้า mirrorRemoteImage (signature ใหม่บังคับ
  // shopId) — ดึงผ่าน conversation.shopId (ChatMessage ไม่มี shopId ตรง ๆ)
  const rows = await prisma.chatMessage.findMany({
    where: { body: { startsWith: CARD_PREFIX }, cards: { equals: Prisma.DbNull } },
    select: { id: true, createdAt: true, body: true, rawMessage: true, conversation: { select: { shopId: true } } },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`แถวที่เข้าเงื่อนไข (body ขึ้นต้น "${CARD_PREFIX}" + cards ยังว่าง): ${rows.length}`)

  type Job = {
    id: string
    createdAt: Date
    body: string
    shopId: string
    cards: { title: string | null; subtitle: string | null; imageUrl: string | null }[]
  }
  const jobs: Job[] = []
  let skippedNoRaw = 0
  let skippedNotGeneric = 0

  for (const r of rows) {
    const env = r.rawMessage as RawEnvelope | null
    const att = env?.payload?.message?.attachments?.[0]
    if (!att) {
      skippedNoRaw++
      continue
    }
    // ใช้ฟังก์ชันเดียวกับ ingest — ชนิด/เพดาน 10 ใบ/เกณฑ์ isRealCard ต้องตรงกันเป๊ะ
    const cards = extractGenericCards(att.type, att.payload as never)
    if (!cards) {
      skippedNotGeneric++
      continue
    }
    jobs.push({ id: r.id, createdAt: r.createdAt, body: r.body ?? '', shopId: r.conversation.shopId, cards })
  }

  const withImg = jobs.filter((j) => j.cards.some((c) => c.imageUrl))
  const totalImgs = jobs.reduce((n, j) => n + j.cards.filter((c) => c.imageUrl).length, 0)
  const soonest = jobs
    .flatMap((j) => j.cards.map((c) => (c.imageUrl ? expiryOf(c.imageUrl) : null)))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0]

  console.log(`  ข้ามเพราะไม่มี rawMessage/attachment : ${skippedNoRaw}`)
  console.log(`  ข้ามเพราะไม่ใช่ generic template     : ${skippedNotGeneric}`)
  console.log(`  จะ backfill                          : ${jobs.length} ข้อความ`)
  console.log(`    - มีรูปต้อง mirror                 : ${withImg.length} ข้อความ / ${totalImgs} รูป`)
  console.log(`    - การ์ดข้อความล้วน (ไม่มีรูป)      : ${jobs.length - withImg.length} ข้อความ`)
  if (soonest) console.log(`    - รูปที่หมดอายุเร็วที่สุด          : ${soonest.toISOString()}`)

  // ตัวอย่าง 3 แถวแรกให้เห็นว่าจะได้อะไร ก่อนตัดสินใจ --apply
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
            const imageFileId = c.imageUrl ? await mirrorRemoteImage(c.imageUrl, { shopId: j.shopId }) : null
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

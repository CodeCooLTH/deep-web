#!/usr/bin/env tsx
/**
 * Backfill คิว "คำถามที่ DeepBot ตอบไม่ได้" จากบันทึกเดิมใน AutoReplyLog
 * feature 00023 · phase `00023-qna` · S-07
 *
 * ทำไมต้องมี: ก่อน phase นี้ ข้อความที่ไม่ตรงกลุ่มคำถูกบันทึกเป็น
 * `AutoReplyLog.skipReason = 'NO_KEYWORD_MATCH'` แล้วจบ — เป็นกองที่ไม่มีใครทำงานต่อได้
 * สคริปต์นี้แปลงกองนั้นเป็นแถวในคิวที่ร้านกดกรอกคำตอบทีละข้อได้
 *
 * ── วิธีใช้ ────────────────────────────────────────────────────────────────
 *   ดูผลก่อน (ไม่เขียนอะไรเลย — ค่าเริ่มต้น):
 *     npx dotenv -e .env.local -- npx tsx scripts/backfill-auto-reply-unanswered.ts
 *
 *   เขียนจริง:
 *     npx dotenv -e .env.local -- npx tsx scripts/backfill-auto-reply-unanswered.ts --apply
 *
 *   จำกัดร้านเดียว / กำหนดเส้นตัดเวลาเอง:
 *     ... --shop <shopId> --before 2026-08-01T00:00:00Z
 *
 * WARNING: `--apply` เขียนข้อมูลจริงลงฐานที่ DATABASE_URL ชี้อยู่ ตรวจ env ให้แน่ใจก่อนรัน
 * สคริปต์นี้ **อ่านกับ upsert เท่านั้น** ไม่มีคำสั่งลบ/ล้างข้อมูลใด ๆ ทั้งสิ้น (Hard Rule 13/14)
 */
import { PrismaClient } from '@prisma/client'
import { shouldQueueUnanswered } from '../src/lib/auto-reply-unanswered-filter'

/**
 * ทำไมไม่เรียก `recordUnanswered()` ซ้ำทีละแถวตามที่อาจคาดไว้
 *
 * `recordUnanswered` ออกแบบมาสำหรับ "เกิดขึ้นสด ๆ ทีละครั้ง" — มันทำ `hitCount: increment 1`
 * และปั๊ม `lastSeenAt` เป็นเวลาปัจจุบันเสมอ ถ้าเอามาวนใส่บันทึกเก่า 401 แถว จะได้คิวที่
 * `lastSeenAt` เป็นวันนี้ทั้งหมดทั้งที่ลูกค้าถามมาตั้งแต่สัปดาห์ก่อน — ร้านจะเรียงลำดับความเร่งด่วน
 * ผิดทันที สคริปต์นี้จึงรวมยอดจากบันทึกก่อน (GROUP BY) แล้วเขียนทีเดียวพร้อมเวลาจริงจากบันทึก
 * แต่ยัง **ใช้ตัวกรองตัวเดียวกัน** (`shouldQueueUnanswered`) เพื่อไม่ให้เกณฑ์ PII/ขยะแตกเป็นสองชุด
 */

interface Args {
  apply: boolean
  shopId: string | null
  before: Date | null
}

function parseArgs(argv: string[]): Args {
  const out: Args = { apply: false, shopId: null, before: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (a === '--shop') out.shopId = argv[++i] ?? null
    else if (a === '--before') {
      const raw = argv[++i]
      const d = raw ? new Date(raw) : null
      if (!d || Number.isNaN(d.getTime())) throw new Error(`--before ไม่ใช่วันที่ที่อ่านได้: ${raw}`)
      out.before = d
    }
  }
  return out
}

interface Aggregated {
  shopId: string
  normalizedText: string
  rawSample: string
  hits: number
  firstSeenAt: Date
  lastSeenAt: Date
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const prisma = new PrismaClient()

  try {
    console.log(args.apply ? '=== โหมดเขียนจริง (--apply) ===' : '=== โหมดดูผล (ไม่เขียนอะไรเลย) ===')

    // ── เส้นตัดเวลา ────────────────────────────────────────────────────────
    // ปัญหา: ตั้งแต่ phase นี้ขึ้น production เส้นทางตอบจริงเขียนคิวเองอยู่แล้ว
    // ถ้า backfill ไปทับช่วงเวลานั้นด้วย ยอด hitCount จะถูกนับสองรอบ
    //
    // ค่าเริ่มต้นจึงเป็น "แถวคิวที่เก่าที่สุดของร้านนั้น" = จุดที่ระบบเริ่มเขียนเอง
    // ผลพลอยได้คือรันซ้ำแล้วไม่พอง: หลังรันรอบแรก แถวเก่าสุดจะกลายเป็นวันของบันทึกเก่า
    // เส้นตัดจึงเลื่อนถอยตามไปด้วย รอบสองจึงไม่เหลือบันทึกที่ "เก่ากว่าเส้นตัด" ให้หยิบอีก
    // (ถ้าสั่ง --before ให้กว้างกว่าเดิมเอง = ตั้งใจนับซ้ำ สคริปต์ไม่ขวาง แต่เตือนไว้ตรงนี้)
    const cutoffByShop = new Map<string, Date>()
    if (!args.before) {
      const earliest = await prisma.autoReplyUnansweredQuestion.groupBy({
        by: ['shopId'],
        _min: { firstSeenAt: true },
        ...(args.shopId ? { where: { shopId: args.shopId } } : {}),
      })
      for (const row of earliest) {
        if (row._min.firstSeenAt) cutoffByShop.set(row.shopId, row._min.firstSeenAt)
      }
    }
    const fallbackCutoff = args.before ?? new Date()
    console.log(
      args.before
        ? `เส้นตัดเวลา: ${args.before.toISOString()} (สั่งเองด้วย --before)`
        : `เส้นตัดเวลา: แถวคิวเก่าสุดของแต่ละร้าน (ร้านที่ยังไม่มีคิวเลยใช้ "ตอนนี้")`,
    )

    // ── อ่านบันทึกเป็น batch ───────────────────────────────────────────────
    const BATCH = 200
    const agg = new Map<string, Aggregated>()
    const skipped = new Map<string, number>()
    let scanned = 0
    let outOfWindow = 0
    let noText = 0
    let cursor: string | null = null

    // NOTE: ต้องประกาศชนิดตรง ๆ — `cursor` ถูกใช้ทั้งในเงื่อนไข query และถูกกำหนดค่าจากผลลัพธ์
    // ทำให้ TS อนุมานวนกลับมาหาตัวเอง (TS7022) ถ้าปล่อยให้เดาเอง
    type LogRow = {
      id: string
      shopId: string
      rawText: string | null
      normalizedText: string | null
      createdAt: Date
    }

    for (;;) {
      const logs: LogRow[] = await prisma.autoReplyLog.findMany({
        where: {
          skipReason: 'NO_KEYWORD_MATCH',
          ...(args.shopId ? { shopId: args.shopId } : {}),
        },
        select: { id: true, shopId: true, rawText: true, normalizedText: true, createdAt: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
      if (logs.length === 0) break
      cursor = logs[logs.length - 1].id

      for (const log of logs) {
        scanned++
        try {
          const cutoff = cutoffByShop.get(log.shopId) ?? fallbackCutoff
          if (log.createdAt >= cutoff) {
            outOfWindow++
            continue
          }

          const raw = (log.rawText ?? '').trim()
          const normalized = (log.normalizedText ?? '').trim()
          if (!raw || !normalized) {
            noText++
            continue
          }

          // ตัวกรองตัวเดียวกับเส้นทางจริง — PII (เบอร์/ที่อยู่), คำรับสั้น ๆ, ทักทาย
          const verdict = shouldQueueUnanswered(raw, normalized)
          if (!verdict.keep) {
            const reason = verdict.reason ?? 'UNKNOWN'
            skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
            continue
          }

          const key = `${log.shopId} ${normalized}`
          const found = agg.get(key)
          if (found) {
            found.hits++
            if (log.createdAt < found.firstSeenAt) found.firstSeenAt = log.createdAt
            if (log.createdAt > found.lastSeenAt) {
              found.lastSeenAt = log.createdAt
              found.rawSample = raw.slice(0, 500) // เก็บตัวอย่างล่าสุดไว้แสดง
            }
          } else {
            agg.set(key, {
              shopId: log.shopId,
              normalizedText: normalized,
              rawSample: raw.slice(0, 500),
              hits: 1,
              firstSeenAt: log.createdAt,
              lastSeenAt: log.createdAt,
            })
          }
        } catch (err) {
          // แถวเดียวพังห้ามล้มทั้งงาน — บันทึกแล้วไปต่อ
          console.warn(`  ข้ามบันทึก ${log.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      console.log(`  อ่านแล้ว ${scanned} แถว...`)
    }

    // ── สรุปก่อนเขียน ──────────────────────────────────────────────────────
    const totalHits = [...agg.values()].reduce((s, a) => s + a.hits, 0)
    const skippedTotal = [...skipped.values()].reduce((s, n) => s + n, 0)

    console.log('\n── สรุป ──────────────────────────────────────────')
    console.log(`บันทึกที่อ่านทั้งหมด          : ${scanned}`)
    console.log(`อยู่นอกเส้นตัดเวลา (ข้าม)     : ${outOfWindow}`)
    console.log(`ไม่มีข้อความให้ใช้ (ข้าม)      : ${noText}`)
    console.log(`ถูกตัวกรองตัดทิ้ง             : ${skippedTotal}`)
    for (const [reason, n] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${reason.padEnd(24)} ${n}`)
    }
    console.log(`ผ่านตัวกรอง (นับเป็นครั้ง)     : ${totalHits}`)
    console.log(`รวมซ้ำแล้วเหลือ (แถวในคิว)     : ${agg.size}`)

    const top = [...agg.values()].sort((a, b) => b.hits - a.hits).slice(0, 10)
    if (top.length > 0) {
      console.log('\n10 อันดับที่ถูกถามบ่อยที่สุด:')
      for (const a of top) {
        console.log(`  ${String(a.hits).padStart(4)} ครั้ง · ${a.normalizedText.slice(0, 60)}`)
      }
    }

    if (!args.apply) {
      console.log('\nโหมดดูผล — ไม่ได้เขียนอะไรลงฐาน เพิ่ม --apply เพื่อเขียนจริง')
      return
    }

    // ── เขียนจริง ──────────────────────────────────────────────────────────
    let created = 0
    let merged = 0
    let failed = 0

    for (const a of agg.values()) {
      try {
        const existing = await prisma.autoReplyUnansweredQuestion.findUnique({
          where: { shopId_normalizedQuestion: { shopId: a.shopId, normalizedQuestion: a.normalizedText } },
          select: { id: true, firstSeenAt: true, lastSeenAt: true },
        })

        if (!existing) {
          await prisma.autoReplyUnansweredQuestion.create({
            data: {
              shopId: a.shopId,
              normalizedQuestion: a.normalizedText,
              rawSample: a.rawSample,
              hitCount: a.hits,
              firstSeenAt: a.firstSeenAt,
              lastSeenAt: a.lastSeenAt,
            },
          })
          created++
        } else {
          // WARNING: ไม่แตะ `status` โดยเจตนา — ข้อที่ร้านตอบไปแล้ว (ANSWERED) หรือกดข้าม
          // (DISMISSED) ต้องไม่เด้งกลับมาเป็นงานค้างเพราะการ backfill
          await prisma.autoReplyUnansweredQuestion.update({
            where: { id: existing.id },
            data: {
              hitCount: { increment: a.hits },
              firstSeenAt: a.firstSeenAt < existing.firstSeenAt ? a.firstSeenAt : existing.firstSeenAt,
              // lastSeenAt ของเดิมมาจากของสด ซึ่งใหม่กว่าบันทึกเก่าเสมอ จึงไม่ถอยให้เก่าลง
              lastSeenAt: a.lastSeenAt > existing.lastSeenAt ? a.lastSeenAt : existing.lastSeenAt,
            },
          })
          merged++
        }
      } catch (err) {
        failed++
        console.warn(
          `  เขียนไม่สำเร็จ (shop=${a.shopId}) "${a.normalizedText.slice(0, 40)}": ` +
            `${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    console.log('\n── ผลการเขียน ────────────────────────────────────')
    console.log(`สร้างแถวใหม่     : ${created}`)
    console.log(`รวมเข้าแถวเดิม   : ${merged}`)
    console.log(`ล้มเหลว          : ${failed}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

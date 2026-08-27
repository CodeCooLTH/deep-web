/**
 * bench-agent-performance-run — วัดเวลาจริงของรายงานผลงานแอดมิน (feature 00059)
 *
 * 🛑 อ่านอย่างเดียว — ไม่เขียนอะไรลงฐานเลย (ต้องรัน `bench-agent-performance.ts` seed ก่อน)
 * fail-closed: ปฏิเสธถ้า DATABASE_URL ไม่ได้ชี้ localhost
 *
 * ต้องรันด้วย `--conditions=react-server` เพราะ service มี `import 'server-only'`
 *   DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     npx tsx --conditions=react-server scripts/bench-agent-performance-run.ts
 */
import { PrismaClient } from '@prisma/client'
import {
  getAgentDetailBundle,
  getAgentPerformanceOverview,
} from '../src/services/agent-performance.service'

const DB_URL = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL)) {
  console.error('ปฏิเสธการรัน: DATABASE_URL ต้องชี้ localhost เท่านั้น')
  process.exit(1)
}

const prisma = new PrismaClient()
const SHOP_ID = 'perf59-shop'
const DAY = 24 * 60 * 60 * 1000

const rangeOf = (days: number) => {
  const to = new Date()
  return {
    from: new Date(to.getTime() - days * DAY),
    to,
    channel: null,
    source: null,
    shopChannelId: null,
  }
}

/** วัดหลายรอบแล้วรายงานค่ากลาง — รอบแรกมักโดน cold cache ของ Postgres */
async function timeIt<T>(label: string, runs: number, fn: () => Promise<T>): Promise<T> {
  const times: number[] = []
  let last!: T
  for (let i = 0; i < runs; i++) {
    const t = process.hrtime.bigint()
    last = await fn()
    times.push(Number(process.hrtime.bigint() - t) / 1e6)
  }
  const sorted = [...times].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  console.log(
    `  ${label.padEnd(34)} กลาง ${median.toFixed(0).padStart(6)} ms   ` +
      `(ต่ำสุด ${sorted[0].toFixed(0)} / สูงสุด ${sorted[sorted.length - 1].toFixed(0)})`,
  )
  return last
}

async function main() {
  const c = await prisma.$queryRawUnsafe<{ convs: number; msgs: number }[]>(
    `SELECT (SELECT COUNT(*) FROM "Conversation" WHERE "shopId"='${SHOP_ID}')::int AS convs,
            (SELECT COUNT(*) FROM "ChatMessage" WHERE "id" LIKE 'perf59-%')::int AS msgs`,
  )
  console.log(
    `ข้อมูลในฐาน: เธรด ${c[0].convs.toLocaleString()} · ข้อความ ${c[0].msgs.toLocaleString()}\n`,
  )

  for (const days of [7, 30, 92]) {
    const r = rangeOf(days)
    console.log(`── ช่วง ${days} วัน ──────────────────────────────────────`)
    const overview = await timeIt(`หน้าภาพรวม (9 query)`, 5, () =>
      getAgentPerformanceOverview(SHOP_ID, r),
    )
    console.log(
      `     → เธรด ${overview.overview.conversations.toLocaleString()} · ` +
        `เข้าเกณฑ์ ${overview.overview.qualifiedConversations.toLocaleString()} · ` +
        `ปิดได้ ${overview.overview.convertedConversations.toLocaleString()} · ` +
        `แอดมิน ${overview.leaderboard.length} คน · ` +
        `ตอบครั้งแรกเฉลี่ย ${overview.overview.firstResponseAvgSec} วิ · ` +
        `SLA ${overview.overview.slaPct}%`,
    )

    const agentId = overview.leaderboard[0]?.agentUserId
    if (agentId) {
      await timeIt(`หน้ารายละเอียด (8 query)`, 5, () =>
        getAgentDetailBundle(SHOP_ID, agentId, r, { limit: 100, offset: 0 }),
      )
    }
    console.log()
  }

  // แผนของ query ที่หนักที่สุด — ดูว่าใช้ index ที่เพิ่งเพิ่มจริงไหม
  const r = rangeOf(92)
  const plan = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(`
    EXPLAIN (ANALYZE, BUFFERS)
    WITH conv AS (
      SELECT c."id" FROM "Conversation" c
      WHERE c."shopId" = '${SHOP_ID}' AND c."createdAt" >= '${r.from.toISOString()}'
        AND c."createdAt" < '${r.to.toISOString()}'
    ),
    ev AS (
      SELECT m."conversationId", m."createdAt", m."seq", m."senderUserId",
        (m."senderRole" = 'BUYER' AND m."isDeleted" = false) AS is_in,
        (m."senderRole" = 'SHOP' AND m."autoReplyKind" IS NULL AND m."senderUserId" IS NOT NULL AND m."isDeleted" = false) AS is_out
      FROM "ChatMessage" m JOIN conv ON conv."id" = m."conversationId"
      WHERE (m."senderRole" = 'BUYER' AND m."isDeleted" = false)
         OR (m."senderRole" = 'SHOP' AND m."autoReplyKind" IS NULL AND m."senderUserId" IS NOT NULL AND m."isDeleted" = false)
    ),
    ev_grp AS (
      SELECT ev.*, SUM(CASE WHEN ev.is_out THEN 1 ELSE 0 END)
        OVER (PARTITION BY ev."conversationId" ORDER BY ev."createdAt", ev."seq"
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS grp
      FROM ev
    ),
    waits AS (SELECT "conversationId", grp, MIN("createdAt") AS asked_at FROM ev_grp WHERE is_in GROUP BY 1,2),
    replies AS (SELECT "conversationId", grp, "createdAt" AS replied_at, "senderUserId" AS a FROM ev_grp WHERE is_out)
    SELECT COUNT(*) FROM waits w JOIN replies rp ON rp."conversationId" = w."conversationId" AND rp.grp = w.grp + 1`)

  console.log('── EXPLAIN ANALYZE ของ query จับคู่รอบการรอ (ช่วง 92 วัน) ──')
  for (const row of plan) console.log('  ' + row['QUERY PLAN'])

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})

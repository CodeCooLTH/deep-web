import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { buildResponsePairsSql } from '@/lib/agent-performance-sql'
import { computeResponsePairs, type AgentChatEvent } from '@/lib/agent-performance'
import {
  getAgentPerformance,
  getAgentPerformanceOverview,
  getConversationBreakdown,
} from '@/services/agent-performance.service'

/**
 * เทสยืนยันว่า "จับคู่รอบการรอที่ SQL" ให้ผลตรงกับ "จับคู่ด้วย TypeScript" (feature 00059)
 *
 * ── ทำไมต้องมี ──────────────────────────────────────────────────────────────
 * สูตรมีสองฉบับโดยตั้งใจ (ฉบับ TS = ข้อกำหนดที่พิสูจน์ได้ · ฉบับ SQL = ตัวที่ทำงานจริงเพื่อ
 * ไม่ต้องขนข้อความขึ้นมาที่แอป) — สองฉบับที่ไม่มีด่านผูกไว้จะเพี้ยนจากกันวันไหนก็ได้
 * โดยที่ `tsc`/build/lint ไม่มีทางเห็น เพราะทั้งคู่ "ถูก" ในตัวเอง
 * แพตเทิร์นนี้ยกมาจาก `order-stage.ts` ↔ `order-stage-sql.ts` ↔ `__tests__/order-stage-sql.test.ts`
 *
 * ── ไม่แตะข้อมูลจริง ────────────────────────────────────────────────────────
 * 🛑 ป้อนชุดค่าสังเคราะห์ผ่าน CTE (`VALUES`) แล้ว SELECT ล้วน — **ไม่อ่านและไม่เขียนตารางไหนเลย**
 * fail-closed: ไม่ยอมรันถ้า connection ไม่ได้ชี้ localhost (HR13/14)
 */

const DB_URL = process.env.DATABASE_URL ?? ''
const CAN_RUN = Boolean(DB_URL) && /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL)

const prisma = CAN_RUN ? new PrismaClient() : null
afterAll(async () => {
  await prisma?.$disconnect()
})

const T0 = Date.parse('2026-08-18T03:00:00.000Z')

type Fixture = {
  conversationId: string
  offsetSec: number
  senderRole: 'BUYER' | 'SHOP'
  senderUserId: string | null
  autoReplyKind: string | null
  isDeleted: boolean
}

/**
 * ชุดข้อมูลทดสอบ — ครอบทุกรูปแบบที่เคยทำให้สูตรผิดจริง
 *
 * 🛑 ห้ามลบแถวที่ "ดูซ้ำกับเคสอื่น" โดยไม่รัน mutation ซ้ำ — แต่ละกลุ่มมีไว้จับคนละอย่าง
 * (docs/conventions/mutation-silence-means-weak-corpus.md)
 */
const FIXTURES: Fixture[] = [
  // c1 — ถาม-ตอบธรรมดา 2 รอบ + ตอบต่อเนื่อง 2 ใบ (ใบที่สองต้องไม่นับเป็นอีกรอบ)
  { conversationId: 'c1', offsetSec: 0, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c1', offsetSec: 30, senderRole: 'SHOP', senderUserId: 'a1', autoReplyKind: null, isDeleted: false },
  { conversationId: 'c1', offsetSec: 45, senderRole: 'SHOP', senderUserId: 'a1', autoReplyKind: null, isDeleted: false },
  { conversationId: 'c1', offsetSec: 600, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c1', offsetSec: 660, senderRole: 'SHOP', senderUserId: 'a1', autoReplyKind: null, isDeleted: false },

  // c2 — ลูกค้าพิมพ์รัว 3 ใบก่อนมีคนตอบ (ต้องได้รอบเดียว นับจากใบแรก)
  { conversationId: 'c2', offsetSec: 0, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c2', offsetSec: 10, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c2', offsetSec: 25, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c2', offsetSec: 100, senderRole: 'SHOP', senderUserId: 'a2', autoReplyKind: null, isDeleted: false },

  // c3 — บอทตอบก่อน แล้วคนตอบทีหลัง (เวลาต้องเป็นของคน) + คำตอบที่ระบุตัวไม่ได้ (Business Suite)
  { conversationId: 'c3', offsetSec: 0, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c3', offsetSec: 2, senderRole: 'SHOP', senderUserId: null, autoReplyKind: 'AUTO', isDeleted: false },
  { conversationId: 'c3', offsetSec: 5, senderRole: 'SHOP', senderUserId: 'a1', autoReplyKind: 'AUTO', isDeleted: false },
  { conversationId: 'c3', offsetSec: 20, senderRole: 'SHOP', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c3', offsetSec: 300, senderRole: 'SHOP', senderUserId: 'a1', autoReplyKind: null, isDeleted: false },

  // c4 — ไม่มีใครตอบเลย (ต้องไม่มีคู่ ไม่ใช่คู่ที่ waitSec = 0)
  { conversationId: 'c4', offsetSec: 0, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c4', offsetSec: 90, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },

  // c5 — ส่งต่อระหว่างคน + ข้อความที่ถูกลบต้องไม่เปิดรอบ + ร้านทักก่อนโดยไม่มีใครถาม
  { conversationId: 'c5', offsetSec: 0, senderRole: 'SHOP', senderUserId: 'a1', autoReplyKind: null, isDeleted: false },
  { conversationId: 'c5', offsetSec: 10, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: true },
  { conversationId: 'c5', offsetSec: 60, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c5', offsetSec: 120, senderRole: 'SHOP', senderUserId: 'a1', autoReplyKind: null, isDeleted: false },
  { conversationId: 'c5', offsetSec: 1000, senderRole: 'BUYER', senderUserId: null, autoReplyKind: null, isDeleted: false },
  { conversationId: 'c5', offsetSec: 1100, senderRole: 'SHOP', senderUserId: 'a2', autoReplyKind: null, isDeleted: false },
]

const lit = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`)

describe('agent-performance — สูตรฉบับ SQL ต้องให้ผลเท่ากับฉบับ TypeScript', () => {
  it('[blocker] จับคู่ (คำถาม→คำตอบ) ได้ชุดเดียวกันทุกแถว', async () => {
    if (!CAN_RUN) {
      console.warn(
        '[agent-performance] ข้ามการเทียบ SQL↔TS: ต้องมี DATABASE_URL ที่ชี้ localhost — ' +
          'เทสนี้เป็นด่านของ feature 00059 อย่าปล่อยให้ข้ามถาวร',
      )
      expect(CAN_RUN).toBe(false)
      return
    }

    const values = FIXTURES.map(
      (f, i) =>
        `(${lit(f.conversationId)}, TIMESTAMPTZ '${new Date(T0 + f.offsetSec * 1000).toISOString()}', ${i + 1}, ` +
        `'${f.senderRole}', ${lit(f.senderUserId)}, ${lit(f.autoReplyKind)}, ${f.isDeleted})`,
    ).join(',\n        ')

    const convIds = [...new Set(FIXTURES.map((f) => f.conversationId))]

    const rows = await prisma!.$queryRawUnsafe<
      { conversationId: string; agent_user_id: string; wait_sec: number; pair_no: number }[]
    >(`
      WITH conv AS (SELECT unnest(ARRAY[${convIds.map(lit).join(', ')}]) AS "id"),
      msg_fixture ("conversationId", "createdAt", "seq", "senderRole", "senderUserId", "autoReplyKind", "isDeleted") AS (
        VALUES
        ${values}
      ),
      ${buildResponsePairsSql({ messageSource: 'msg_fixture' })}
      SELECT "conversationId", agent_user_id, wait_sec, pair_no FROM pairs
    `)

    const events: AgentChatEvent[] = FIXTURES.map((f, i) => ({
      conversationId: f.conversationId,
      createdAt: new Date(T0 + f.offsetSec * 1000),
      seq: i + 1,
      senderRole: f.senderRole,
      senderUserId: f.senderUserId,
      autoReplyKind: f.autoReplyKind,
      isDeleted: f.isDeleted,
    }))

    const key = (p: {
      conversationId: string
      agentUserId: string
      waitSec: number
      pairNo: number
    }) => `${p.conversationId}|${p.pairNo}|${p.agentUserId}|${p.waitSec}`

    const fromSql = rows
      .map((r) =>
        key({
          conversationId: r.conversationId,
          agentUserId: r.agent_user_id,
          waitSec: Number(r.wait_sec),
          pairNo: Number(r.pair_no),
        }),
      )
      .sort()
    const fromTs = computeResponsePairs(events).map(key).sort()

    expect(fromSql).toEqual(fromTs)

    /* กัน "ตรงกันเพราะว่างทั้งคู่" ซึ่งเป็นความสำเร็จปลอมที่หน้าตาเหมือนความสำเร็จจริง
       และปักหมุดคำตอบที่รู้ว่าถูกไว้ตรง ๆ — ถ้าวันหนึ่งทั้งสองฝั่งเพี้ยน *พร้อมกัน*
       การเทียบกันเองจะยังเขียว ลิสต์นี้คือด่านที่สอง */
    expect(fromTs).toEqual(
      [
        'c1|1|a1|30',
        'c1|2|a1|60',
        'c2|1|a2|100',
        'c3|1|a1|300',
        'c5|1|a1|60',
        'c5|2|a2|100',
      ].sort(),
    )
  })
})

/**
 * ── ด่านที่สอง: query ของ service ต้องรันได้จริงกับสคีมาจริง ──────────────────
 *
 * 🛑 เทสเทียบสูตรข้างบนครอบเฉพาะ `buildResponsePairsSql()` — อีกสอง query ของ service
 * (`fetchConversations` ที่มี LATERAL 3 ก้อน · `fetchOrders` ที่มี `revenueOrderSql`)
 * ไม่มีอะไรแตะเลย ⇒ พิมพ์ชื่อคอลัมน์ผิดตัวเดียวจะพังตอน**ผู้ใช้เปิดหน้าบน prod**
 * ไม่ใช่ตอนรันเทส (`tsc` มองไม่เห็นข้างในสตริง SQL)
 *
 * เทสนี้ไม่ตรวจ *ค่า* — ตรวจแค่ว่า "รันผ่านและคืนโครงที่ถูก" ซึ่งเป็นสิ่งเดียวที่ยืนยันได้
 * โดยไม่ต้องพึ่งข้อมูลในฐาน dev (ซึ่งวันนี้ไม่มีคำตอบของคนเลยสักแถว)
 */
describe('agent-performance.service — query ทั้ง 3 ก้อนต้องรันได้กับสคีมาจริง', () => {
  it('[blocker] เรียก service ด้วยร้านจริงแล้วไม่ throw และได้โครงที่ถูก', async () => {
    if (!CAN_RUN) {
      console.warn('[agent-performance] ข้าม smoke test: ต้องมี DATABASE_URL ที่ชี้ localhost')
      expect(CAN_RUN).toBe(false)
      return
    }

    const shops = await prisma!.$queryRawUnsafe<{ id: string; userId: string }[]>(
      'SELECT "id", "userId" FROM "Shop" WHERE "deletedAt" IS NULL LIMIT 1',
    )
    if (shops.length === 0) {
      console.warn('[agent-performance] ฐาน dev ไม่มีร้าน — ไม่มีอะไรให้ยิง')
      expect(shops.length).toBe(0)
      return
    }

    // ช่วงกว้างพอให้ครอบข้อมูลเท่าที่มีในฐาน dev — เทสนี้สนใจว่า "รันผ่านไหม" ไม่ใช่ได้เลขเท่าไร
    const filters = {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2027-01-01T00:00:00.000Z'),
      channel: null,
      source: null,
      shopChannelId: null,
    }

    const overview = await getAgentPerformanceOverview(shops[0].id, filters)
    expect(overview.overview.conversations).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(overview.leaderboard)).toBe(true)
    expect(overview.sla.firstResponseSec).toBe(300)

    const breakdown = await getConversationBreakdown(shops[0].id, null, filters, {
      limit: 5,
      offset: 0,
    })
    expect(breakdown.total).toBeGreaterThanOrEqual(0)
    expect(breakdown.rows.length).toBeLessThanOrEqual(5)

    // ตัวกรองทุกแกนต้องรันผ่านด้วย — `source: 'DIRECT'` มี predicate พิเศษ (IS NULL OR NOT IN)
    const filtered = await getAgentPerformanceOverview(shops[0].id, {
      ...filters,
      channel: 'MESSENGER',
      source: 'DIRECT',
    })
    expect(filtered.overview.conversations).toBeLessThanOrEqual(overview.overview.conversations)

    // หน้ารายละเอียด: เจ้าของร้านอยู่ในรายชื่อเสมอ ⇒ ต้องไม่คืน null และต้องมีจุดกราฟครบทุกวัน
    const detail = await getAgentPerformance(shops[0].id, shops[0].userId, {
      ...filters,
      from: new Date('2026-08-19T17:00:00.000Z'),
      to: new Date('2026-08-26T17:00:00.000Z'),
    })
    expect(detail).not.toBeNull()
    expect(detail!.trend).toHaveLength(7)
    expect(detail!.trend.every((p) => typeof p.day === 'string')).toBe(true)
  })
})

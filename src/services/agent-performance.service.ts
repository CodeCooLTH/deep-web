import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { thaiDayKey } from '@/lib/format-date'
import {
  buildResponsePairsSql,
  humanAgentReplySql,
  revenueOrderSql,
  unattributedShopReplySql,
  customerMessageSql,
} from '@/lib/agent-performance-sql'
import {
  attributeOrder,
  normalizeSource,
  summarizeByAgent,
  summarizeShop,
  type AgentPerformanceRow,
  type ConversationFact,
  type PerformanceMetrics,
  type ReportFilters,
} from '@/lib/agent-performance'
import { resolveSlaConfig } from '@/lib/agent-sla'
import { MAX_RANGE_DAYS } from '@/lib/agent-report-query'

// อ้างถึงเพื่อให้คอมเมนต์เรื่องเพดานข้างบนมีของจริงรองรับ และให้ `tsc` จับถ้าค่าถูกลบทิ้ง
export { MAX_RANGE_DAYS }

/**
 * agent-performance.service — รายงานผลงานแอดมิน (feature 00059)
 *
 * ── สถาปัตยกรรม: SQL ย่อย · TypeScript ตัดสิน ───────────────────────────────
 * ฐานข้อมูลรับผิดชอบเฉพาะงานที่ต้องทำที่นั่นจริง ๆ คือ **ย่อยข้อความเป็น "รอบการรอ"**
 * ด้วย window function (ดู `agent-performance-sql.ts`) — ตารางที่ใหญ่ที่สุดในระบบจึงไม่เคย
 * ถูกขนขึ้นมาที่แอปเลย สิ่งที่ข้ามมาคือ 3 ก้อนที่ย่อยแล้ว:
 *   1 แถวต่อเธรด · 1 แถวต่อรอบการรอที่ถูกตอบ · 1 แถวต่อออเดอร์
 *
 * ส่วน *ความหมาย* (ใครเข้าเกณฑ์ · ยกเครดิตให้ใคร · หารด้วยอะไร) คำนวณด้วยฟังก์ชันบริสุทธิ์ใน
 * `agent-performance.ts` ซึ่งมีเทสพิสูจน์ทีละเคส — ไม่เขียนสูตรชุดที่สองลงใน SQL
 *
 * 🛑 ทำไมไม่ทำ aggregate ทั้งหมดใน SQL: สูตรอย่าง "อัตราการปิดการขาย" มีนิยามของตัวหารที่
 * ต้องอธิบายและทดสอบได้ (ข้อ 2 ของโจทย์ห้ามใช้เธรดทั้งหมดเป็นตัวหาร) การเขียนมันเป็น
 * `COUNT(*) FILTER (WHERE ...)` ทำให้ไม่มีที่ให้เทสจับ และเป็นคลาสบั๊กที่โปรเจกต์นี้เจอซ้ำ ๆ
 * (docs/conventions/ui-boolean-needs-a-testable-home.md)
 *
 * ── ปริมาณข้อมูล (ประเมินก่อนเลือกวิธี ตามข้อ 8 ของโจทย์) ────────────────────
 * ตัวเลข prod ที่บันทึกไว้ 2026-08-20: `ChatMessage` ทั้งระบบ ~40,700 แถว (SHOP 28,093 /
 * BUYER 12,593) — ทั้งฐาน ไม่ใช่ต่อร้าน. ช่วงตั้งต้นของรายงานคือ 7 วันของ *ร้านเดียว*
 * ⇒ คำนวณสดทุกครั้งเพียงพอมาก **ยังไม่ต้องมีตารางสรุป/คิว/cron/Redis ใด ๆ**
 * เพดานกันเคสสุดโต่งอยู่ที่ `MAX_RANGE_DAYS` ข้างล่าง — วันที่ชนเพดานนั้นบ่อย ๆ ค่อยคุยเรื่อง
 * ตารางสรุปรายวัน (ข้อเสนออยู่ใน SDS §9) ไม่ใช่ตอนนี้
 */

export type AgentDirectoryEntry = {
  userId: string
  displayName: string
  avatar: string | null
  /** ยังเป็นสมาชิกร้านอยู่ไหม — คนที่ลาออกแล้วยังมีผลงานเก่าค้างอยู่ในช่วงเวลาที่เลือก */
  isCurrentMember: boolean
}

export type ConversationBreakdownRow = {
  conversationId: string
  customerName: string
  channel: string
  source: 'ADS' | 'SHORTLINK' | 'DIRECT'
  /** แอดมินที่ระบบถือว่าเป็นเจ้าของเธรดนี้ (คนที่ตอบครั้งแรก) — null = ไม่มีคนตอบเลย */
  assignedAgentUserId: string | null
  startedAt: Date
  firstResponseSec: number | null
  /** ความยาวของเธรด: ข้อความล่าสุด − เวลาที่เปิดเธรด (วินาที) */
  durationSec: number
  orderNo: string | null
  orderValue: number | null
  result: 'CONVERTED' | 'PENDING' | 'NOT_CONVERTED'
}

export type AgentReportResult = {
  range: { from: Date; to: Date }
  sla: { firstResponseSec: number; source: string }
  overview: PerformanceMetrics
  /** ช่วงก่อนหน้าที่ยาวเท่ากันและต่อกันพอดี — `null` = ไม่มีเธรดเลยในช่วงนั้น (ไม่มีอะไรให้เทียบ) */
  previous: PerformanceMetrics | null
  leaderboard: (AgentPerformanceRow & AgentDirectoryEntry)[]
  agents: AgentDirectoryEntry[]
  channels: { id: string; name: string; provider: string }[]
  /**
   * ออเดอร์ของร้านในช่วงนี้ที่ **ไม่ได้ผูกกับเธรดแชท** ⇒ ไม่ปรากฏในรายงานนี้เลย
   *
   * 🛑 ต้องส่งออกไปติดป้ายเสมอ — ข้อมูลจริงบน prod 2026-08-27 (BT Premium คลอง 4 ธัญบุรี):
   * ออเดอร์ 30 วัน 110 ใบ **ผูกกับเธรดแค่ 52 ใบ** ⇒ การ์ด "คำสั่งซื้อ" จะโชว์ 52 ซึ่งหน้าตา
   * เหมือนตัวเลขที่ครบแล้วทุกประการ ผู้จัดการไม่มีทางรู้ว่าอีกครึ่งหายไปไหน
   * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
   */
  unlinkedOrderCount: number
}

/* ────────────────────────────────────────────────────────────────────────────
 * ชั้นดึงข้อมูล
 * ──────────────────────────────────────────────────────────────────────────── */

type ConversationRow = {
  id: string
  startedAt: Date
  lastMessageAt: Date
  isSpam: boolean
  channel: string
  referralSource: string | null
  hasInbound: boolean
  firstInboundAt: Date | null
  unattributedReplies: number
  repliedAgents: string[] | null
  customerName: string | null
}

type PairRow = { conversationId: string; agentUserId: string; waitSec: number; pairNo: number }

type OrderRow = {
  conversationId: string
  orderId: string
  orderNo: string | null
  createdAt: Date
  createdByUserId: string | null
  amount: Prisma.Decimal
  isRevenue: boolean
  isCancelled: boolean
  ownerUserId: string | null
}

const MSG = {
  senderRole: 'm."senderRole"',
  senderUserId: 'm."senderUserId"',
  autoReplyKind: 'm."autoReplyKind"',
  isDeleted: 'm."isDeleted"',
}

/**
 * `WITH conv AS (…)` — ชุดเธรดที่อยู่ในขอบเขตของรายงาน
 *
 * 🛑 ตัวกรองทุกแกนถูกใส่ไว้ **ที่นี่ที่เดียว** แล้ว query ก้อนอื่น JOIN ต่อจาก `conv` เสมอ
 * ไม่ใช่ต่างคนต่างเขียน WHERE ของตัวเอง — ไม่งั้นวันหนึ่งการ์ดสรุปกับตารางจะกรองคนละชุด
 * แล้วผู้ใช้กดเลข 12 เข้าไปเจอ 9 (บทเรียน Command Center 2026-08-04)
 *
 * ขอบเขตเวลาเทียบกับ `Conversation.createdAt` = "เธรดถูกเปิดในช่วงนี้" (cohort)
 * เหตุผลเต็มอยู่ใน SDS §4.1 — สรุป: ถ้าตัดที่ "ข้อความในช่วง" เวลาตอบครั้งแรกของเธรดที่คร่อม
 * ขอบจะถูกตัดหัวทิ้งแล้วได้ค่าที่ต่ำกว่าความจริงโดยไม่มีอะไรฟ้อง
 */
function convCte(shopId: string, f: ReportFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`c."shopId" = ${shopId}`,
    Prisma.sql`c."createdAt" >= ${f.from}`,
    Prisma.sql`c."createdAt" < ${f.to}`,
  ]
  if (f.channel) parts.push(Prisma.sql`c."channel" = ${f.channel}`)
  if (f.shopChannelId) parts.push(Prisma.sql`c."shopChannelId" = ${f.shopChannelId}`)
  if (f.source === 'DIRECT') {
    // "ทักเข้ามาเอง" = ไม่มี referral — ต้องเขียนเป็น NOT IN + IS NULL ให้ครบทั้งสองรูป
    // (ค่า null ใน SQL ไม่เท่ากับอะไรเลย รวมทั้งไม่เท่ากับตัวมันเอง)
    parts.push(Prisma.sql`(c."referralSource" IS NULL OR c."referralSource" NOT IN ('ADS', 'SHORTLINK'))`)
  } else if (f.source === 'ADS' || f.source === 'SHORTLINK') {
    parts.push(Prisma.sql`c."referralSource" = ${f.source}`)
  }
  const where = parts.reduce((acc, p, i) => (i === 0 ? p : Prisma.sql`${acc} AND ${p}`))
  return Prisma.sql`conv AS (SELECT c."id" FROM "Conversation" c WHERE ${where})`
}

async function fetchConversations(shopId: string, f: ReportFilters): Promise<ConversationRow[]> {
  return prisma.$queryRaw<ConversationRow[]>(Prisma.sql`
    WITH ${convCte(shopId, f)}
    SELECT
      c."id"                                            AS "id",
      c."createdAt"                                     AS "startedAt",
      c."lastMessageAt"                                 AS "lastMessageAt",
      c."isSpam"                                        AS "isSpam",
      c."channel"                                       AS "channel",
      c."referralSource"                                AS "referralSource",
      (inb.first_inbound_at IS NOT NULL)                AS "hasInbound",
      inb.first_inbound_at                              AS "firstInboundAt",
      COALESCE(un.n, 0)::int                            AS "unattributedReplies",
      rep.agents                                        AS "repliedAgents",
      COALESCE(c."alias", ec."name", u."displayName")   AS "customerName"
    FROM "Conversation" c
    JOIN conv ON conv."id" = c."id"
    LEFT JOIN "ExternalContact" ec ON ec."id" = c."externalContactId"
    LEFT JOIN "User" u ON u."id" = c."buyerUserId"
    LEFT JOIN LATERAL (
      SELECT MIN(m."createdAt") AS first_inbound_at
      FROM "ChatMessage" m
      WHERE m."conversationId" = c."id" AND ${Prisma.raw(customerMessageSql(MSG))}
    ) inb ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n
      FROM "ChatMessage" m
      WHERE m."conversationId" = c."id" AND ${Prisma.raw(unattributedShopReplySql(MSG))}
    ) un ON true
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(DISTINCT m."senderUserId") AS agents
      FROM "ChatMessage" m
      WHERE m."conversationId" = c."id" AND ${Prisma.raw(humanAgentReplySql(MSG))}
    ) rep ON true
  `)
}

async function fetchResponsePairs(shopId: string, f: ReportFilters): Promise<PairRow[]> {
  return prisma.$queryRaw<PairRow[]>(Prisma.sql`
    WITH ${convCte(shopId, f)},
    ${Prisma.raw(buildResponsePairsSql())}
    SELECT
      "conversationId" AS "conversationId",
      agent_user_id    AS "agentUserId",
      wait_sec         AS "waitSec",
      pair_no          AS "pairNo"
    FROM pairs
  `)
}

async function fetchOrders(shopId: string, f: ReportFilters): Promise<OrderRow[]> {
  return prisma.$queryRaw<OrderRow[]>(Prisma.sql`
    WITH ${convCte(shopId, f)}
    SELECT
      o."conversationId"    AS "conversationId",
      o."id"                AS "orderId",
      o."orderNo"           AS "orderNo",
      o."createdAt"         AS "createdAt",
      o."createdByUserId"   AS "createdByUserId",
      o."totalAmount"       AS "amount",
      ${Prisma.raw(revenueOrderSql('o'))} AS "isRevenue",
      (o."status" = 'CANCELLED') AS "isCancelled",
      own.owner_user_id     AS "ownerUserId"
    FROM "Order" o
    JOIN conv ON conv."id" = o."conversationId"
    LEFT JOIN LATERAL (
      -- เจ้าของเธรด ณ เวลาที่ออเดอร์ถูกสร้าง = คำตอบของคน "ใบล่าสุดก่อนหน้านั้น"
      -- (ไม่ใช่ข้อความล่าสุด และไม่ใช่สถานะปัจจุบันของเธรด — ดู attributeOrder)
      SELECT m."senderUserId" AS owner_user_id
      FROM "ChatMessage" m
      WHERE m."conversationId" = o."conversationId"
        AND ${Prisma.raw(humanAgentReplySql(MSG))}
        AND m."createdAt" <= o."createdAt"
      ORDER BY m."createdAt" DESC, m."seq" DESC
      LIMIT 1
    ) own ON true
  `)
}

/* ────────────────────────────────────────────────────────────────────────────
 * ประกอบร่าง
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * รวม 3 ก้อนที่ย่อยมาจากฐานข้อมูลให้เป็น `ConversationFact[]`
 *
 * ⚠️ คีย์ที่ต้องระวัง: `responseSamples` ต้องเรียงตาม `pairNo` เพราะฝั่งฟังก์ชันบริสุทธิ์
 * ถือว่าใบแรกของลิสต์คือรอบแรกของเธรด (SQL คืนมาไม่รับประกันลำดับถ้าไม่มี ORDER BY)
 */
function assembleFacts(
  conversations: ConversationRow[],
  pairs: PairRow[],
  orders: OrderRow[],
): ConversationFact[] {
  const pairsByConv = new Map<string, PairRow[]>()
  for (const p of pairs) {
    const bucket = pairsByConv.get(p.conversationId)
    if (bucket) bucket.push(p)
    else pairsByConv.set(p.conversationId, [p])
  }
  for (const bucket of pairsByConv.values()) bucket.sort((a, b) => a.pairNo - b.pairNo)

  const ordersByConv = new Map<string, OrderRow[]>()
  for (const o of orders) {
    const bucket = ordersByConv.get(o.conversationId)
    if (bucket) bucket.push(o)
    else ordersByConv.set(o.conversationId, [o])
  }

  return conversations.map((c) => {
    const convPairs = pairsByConv.get(c.id) ?? []
    const first = convPairs[0]
    const convOrders = (ordersByConv.get(c.id) ?? []).map((o) => ({
      orderId: o.orderId,
      createdAt: o.createdAt,
      createdByUserId: o.createdByUserId,
      countsAsRevenue: o.isRevenue,
      amount: Number(o.amount),
      attribution: attributeOrder({
        createdByUserId: o.createdByUserId,
        conversationOwnerUserId: o.ownerUserId,
      }),
    }))

    const firstRevenue = convOrders
      .filter((o) => o.countsAsRevenue)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]

    return {
      conversationId: c.id,
      startedAt: c.startedAt,
      lastMessageAt: c.lastMessageAt,
      isSpam: c.isSpam,
      channel: c.channel,
      referralSource: c.referralSource,
      firstResponseSec: first ? first.waitSec : null,
      firstResponderUserId: first ? first.agentUserId : null,
      responseSamples: convPairs.map((p) => ({ agentUserId: p.agentUserId, waitSec: p.waitSec })),
      // ARRAY_AGG คืน `[null]` เมื่อไม่มีแถวเข้าเงื่อนไขในบางเวอร์ชันของ plan — กรอง null ทิ้งเสมอ
      repliedAgentUserIds: (c.repliedAgents ?? []).filter((x): x is string => Boolean(x)),
      hasInbound: c.hasInbound,
      unattributedReplyCount: c.unattributedReplies,
      orders: convOrders,
      timeToCloseSec:
        firstRevenue && c.firstInboundAt
          ? Math.max(
              0,
              Math.round((firstRevenue.createdAt.getTime() - c.firstInboundAt.getTime()) / 1000),
            )
          : null,
    }
  })
}

/** ผลดิบของ 3 query — เก็บไว้ทั้งก้อนเพื่อให้ผู้เรียกหลายรายใช้ชุดเดียวกันได้โดยไม่ยิงซ้ำ */
export type RawReportBundle = {
  conversations: ConversationRow[]
  pairs: PairRow[]
  orders: OrderRow[]
}

/**
 * 3 คำสั่ง ยิงพร้อมกัน ไม่ขึ้นกับจำนวนเธรด/ข้อความ (ไม่มี N+1 ตามข้อ 8 ของโจทย์)
 *
 * 🛑 ผู้เรียกที่ต้องใช้ข้อมูลช่วงเดียวกันมากกว่าหนึ่งมุมมอง ต้องโหลดตรงนี้ครั้งเดียวแล้วส่งต่อ
 * ห้ามเรียกซ้ำ — วัดจริงแล้วที่ 92 วัน (2 หมื่นเธรด / 4 แสนข้อความ) ชุดนี้กินราว 600 ms
 * การยิงซ้ำหน้าเดียวจึงเป็นการเพิ่มเวลาโหลดเท่าตัวโดยไม่ได้อะไรกลับมาเลย
 */
async function loadRaw(shopId: string, f: ReportFilters): Promise<RawReportBundle> {
  const [conversations, pairs, orders] = await Promise.all([
    fetchConversations(shopId, f),
    fetchResponsePairs(shopId, f),
    fetchOrders(shopId, f),
  ])
  return { conversations, pairs, orders }
}

async function loadFacts(shopId: string, f: ReportFilters): Promise<ConversationFact[]> {
  const raw = await loadRaw(shopId, f)
  return assembleFacts(raw.conversations, raw.pairs, raw.orders)
}

/** รายชื่อคนของร้าน (เจ้าของ + พนักงาน) + คนที่เคยมีผลงานแต่ออกไปแล้ว */
async function loadAgentDirectory(
  shopId: string,
  extraUserIds: string[],
): Promise<Map<string, AgentDirectoryEntry>> {
  const [shop, members] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { userId: true, user: { select: { id: true, displayName: true, avatar: true } } },
    }),
    prisma.shopMember.findMany({
      where: { shopId },
      select: { user: { select: { id: true, displayName: true, avatar: true } } },
    }),
  ])

  const map = new Map<string, AgentDirectoryEntry>()
  const add = (
    u: { id: string; displayName: string | null; avatar: string | null },
    isCurrentMember: boolean,
  ) => {
    if (map.has(u.id) && map.get(u.id)!.isCurrentMember) return
    map.set(u.id, {
      userId: u.id,
      displayName: u.displayName ?? 'ไม่ทราบชื่อ',
      avatar: u.avatar,
      isCurrentMember,
    })
  }
  if (shop?.user) add(shop.user, true)
  for (const m of members) add(m.user, true)

  // คนที่ออกจากร้านไปแล้วแต่ยังมีผลงานอยู่ในช่วงที่เลือก — ต้องแสดงชื่อ ห้ามขึ้นเป็น uuid
  // และห้ามซ่อนแถว (ยอดขายจะหายจากผลรวมโดยไม่มีคำอธิบาย)
  const missing = extraUserIds.filter((id) => !map.has(id))
  if (missing.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, displayName: true, avatar: true },
    })
    for (const u of users) add(u, false)
  }
  return map
}

/* ────────────────────────────────────────────────────────────────────────────
 * API ของ service
 * ──────────────────────────────────────────────────────────────────────────── */

/** ช่วงก่อนหน้า "ยาวเท่ากัน ต่อกันพอดี" — นิยามเดียวกับ `date-range.ts::shiftBack` */
export function previousRange(f: ReportFilters): { from: Date; to: Date } {
  const span = f.to.getTime() - f.from.getTime()
  return { from: new Date(f.from.getTime() - span), to: f.from }
}

/**
 * ภาพรวม + ตารางจัดอันดับ ของทั้งร้าน (หน้าแรกของรายงาน)
 *
 * `scopeToAgentUserId` — ผู้ใช้ที่มีสิทธิ์ดูเฉพาะของตัวเอง (ดู `agent-report-access.service`)
 * ต้องถูกจำกัดที่นี่ ไม่ใช่ให้หน้าจอกรองทีหลัง
 */
export async function getAgentPerformanceOverview(
  shopId: string,
  filters: ReportFilters,
  opts?: { scopeToAgentUserId?: string | null },
): Promise<AgentReportResult> {
  const sla = resolveSlaConfig({ id: shopId })
  const prev = previousRange(filters)

  const [facts, prevFacts, channels, unlinkedOrderCount] = await Promise.all([
    loadFacts(shopId, filters),
    loadFacts(shopId, { ...filters, ...prev }),
    prisma.shopChannel.findMany({
      where: { shopId, status: { not: 'DISCONNECTED' } },
      select: { id: true, name: true, provider: true },
      orderBy: { name: 'asc' },
    }),
    // ออเดอร์ที่เกิดนอกแชท — นับด้วยขอบเขตเวลาชุดเดียวกับเธรด เพื่อให้เทียบกันได้ตรง ๆ
    prisma.order.count({
      where: {
        shopId,
        conversationId: null,
        createdAt: { gte: filters.from, lt: filters.to },
      },
    }),
  ])

  const rows = summarizeByAgent(facts, sla.firstResponseSec)
  const directory = await loadAgentDirectory(
    shopId,
    rows.map((r) => r.agentUserId),
  )

  const scoped = opts?.scopeToAgentUserId
    ? rows.filter((r) => r.agentUserId === opts.scopeToAgentUserId)
    : rows

  return {
    range: { from: filters.from, to: filters.to },
    sla: { firstResponseSec: sla.firstResponseSec, source: sla.source },
    overview: opts?.scopeToAgentUserId
      ? // ผู้ใช้ที่ดูได้เฉพาะของตัวเอง ต้องไม่เห็นภาพรวมของทั้งร้าน — ใช้แถวของตัวเองแทน
        (scoped[0] ?? summarizeShop([], sla.firstResponseSec))
      : summarizeShop(facts, sla.firstResponseSec),
    previous:
      prevFacts.length === 0
        ? null
        : opts?.scopeToAgentUserId
          ? (summarizeByAgent(prevFacts, sla.firstResponseSec).find(
              (r) => r.agentUserId === opts.scopeToAgentUserId,
            ) ?? null)
          : summarizeShop(prevFacts, sla.firstResponseSec),
    leaderboard: scoped.map((r) => ({
      ...r,
      ...(directory.get(r.agentUserId) ?? {
        userId: r.agentUserId,
        displayName: 'ไม่ทราบชื่อ',
        avatar: null,
        isCurrentMember: false,
      }),
    })),
    agents: [...directory.values()],
    channels,
    unlinkedOrderCount,
  }
}

export type AgentTrendPoint = {
  day: string
  conversations: number
  responseAvgSec: number | null
  orders: number
  conversionRatePct: number | null
  revenue: number
}

export type AgentDetail = {
  agent: AgentDirectoryEntry
  metrics: PerformanceMetrics
  previous: PerformanceMetrics | null
  trend: AgentTrendPoint[]
  sla: { firstResponseSec: number; source: string }
}

/**
 * รายละเอียดของแอดมินคนเดียว + แนวโน้มรายวัน
 *
 * แนวโน้มคำนวณจาก `facts` ชุดเดิมที่โหลดมาแล้ว — ไม่มี query เพิ่มต่อวัน
 * (แพตเทิร์นเดียวกับที่ `/sales` ทำ: ดึงครั้งเดียวแล้ว bucket ในหน่วยความจำ)
 *
 * 🛑 หั่นวันด้วย `thaiDayKey()` เท่านั้น — server บน Vercel เป็น UTC การใช้ `getDate()`
 * ทำให้เส้นแบ่งวันเลื่อนไป 7 ชั่วโมง แล้วยอดของวันหนึ่งไปโผล่อีกวัน (บทเรียน 00033)
 */
export async function getAgentPerformance(
  shopId: string,
  agentUserId: string,
  filters: ReportFilters,
  opts?: { raw?: RawReportBundle; prevFacts?: ConversationFact[] },
): Promise<AgentDetail | null> {
  const sla = resolveSlaConfig({ id: shopId })
  const prev = previousRange(filters)
  const [facts, prevFacts] = await Promise.all([
    opts?.raw
      ? Promise.resolve(assembleFacts(opts.raw.conversations, opts.raw.pairs, opts.raw.orders))
      : loadFacts(shopId, filters),
    opts?.prevFacts ? Promise.resolve(opts.prevFacts) : loadFacts(shopId, { ...filters, ...prev }),
  ])

  const directory = await loadAgentDirectory(shopId, [agentUserId])
  const agent = directory.get(agentUserId)
  if (!agent) return null

  const rowOf = (source: ConversationFact[]) =>
    summarizeByAgent(source, sla.firstResponseSec).find((r) => r.agentUserId === agentUserId) ?? null

  const metrics = rowOf(facts) ?? summarizeShop([], sla.firstResponseSec)

  // จัดกลุ่มเธรดตามวันที่เธรดถูกเปิด แล้วคิดตัวชี้วัดของวันนั้นด้วยฟังก์ชันตัวเดียวกับภาพรวม
  const byDay = new Map<string, ConversationFact[]>()
  for (const f of facts) {
    const key = thaiDayKey(f.startedAt)
    const bucket = byDay.get(key)
    if (bucket) bucket.push(f)
    else byDay.set(key, [f])
  }

  const trend: AgentTrendPoint[] = eachThaiDay(filters.from, filters.to).map((day) => {
    const dayFacts = byDay.get(day) ?? []
    const row = summarizeByAgent(dayFacts, sla.firstResponseSec).find(
      (r) => r.agentUserId === agentUserId,
    )
    return {
      day,
      conversations: row?.conversations ?? 0,
      responseAvgSec: row?.responseAvgSec ?? null,
      orders: row?.ordersCreated ?? 0,
      conversionRatePct: row?.conversionRatePct ?? null,
      revenue: row?.revenue ?? 0,
    }
  })

  return {
    agent,
    metrics,
    previous: prevFacts.length === 0 ? null : rowOf(prevFacts),
    trend,
    sla: { firstResponseSec: sla.firstResponseSec, source: sla.source },
  }
}

/**
 * เธรดที่ประกอบเป็นตัวเลขของแอดมินคนนั้น — ให้ผู้จัดการกดดูของจริงได้ว่าเลขมาจากไหน
 *
 * `agentUserId = null` = ดูทุกเธรดในขอบเขต (ใช้กับผู้จัดการที่กดจากหน้าภาพรวม)
 */
export async function getConversationBreakdown(
  shopId: string,
  agentUserId: string | null,
  filters: ReportFilters,
  page: { limit: number; offset: number },
  opts?: { raw?: RawReportBundle },
): Promise<{ rows: ConversationBreakdownRow[]; total: number }> {
  const { conversations, pairs, orders } = opts?.raw ?? (await loadRaw(shopId, filters))
  const facts = assembleFacts(conversations, pairs, orders)
  const nameOf = new Map(conversations.map((c) => [c.id, c.customerName]))
  const orderNoOf = new Map(orders.map((o) => [o.orderId, o.orderNo]))

  const scoped = agentUserId
    ? facts.filter(
        (f) =>
          f.repliedAgentUserIds.includes(agentUserId) ||
          f.orders.some((o) => o.attribution.agentUserId === agentUserId),
      )
    : facts

  const rows: ConversationBreakdownRow[] = scoped
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .map((f) => {
      // ใบที่ยกให้แอดมินคนนี้ก่อน แล้วค่อยถอยไปใบแรกของเธรด — คอลัมน์นี้ตอบว่า "ผลงานใบไหน"
      const mine = agentUserId
        ? f.orders.filter((o) => o.attribution.agentUserId === agentUserId)
        : f.orders
      const shown =
        mine.find((o) => o.countsAsRevenue) ??
        mine.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ??
        null
      return {
        conversationId: f.conversationId,
        customerName: nameOf.get(f.conversationId) ?? 'ลูกค้าไม่ระบุชื่อ',
        channel: f.channel,
        source: normalizeSource(f.referralSource),
        assignedAgentUserId: f.firstResponderUserId,
        startedAt: f.startedAt,
        firstResponseSec: f.firstResponseSec,
        durationSec: Math.max(
          0,
          Math.round((f.lastMessageAt.getTime() - f.startedAt.getTime()) / 1000),
        ),
        orderNo: shown ? (orderNoOf.get(shown.orderId) ?? null) : null,
        orderValue: shown ? shown.amount : null,
        result: shown ? (shown.countsAsRevenue ? 'CONVERTED' : 'PENDING') : 'NOT_CONVERTED',
      }
    })

  return { rows: rows.slice(page.offset, page.offset + page.limit), total: rows.length }
}

/** รายชื่อวันตามปฏิทินไทยใน `[from, to)` — เดินทีละ 24 ชม.บน UTC instant (เหมือน `/sales`) */
function eachThaiDay(from: Date, toExcl: Date): string[] {
  const DAY_MS = 24 * 60 * 60 * 1000
  const days: string[] = []
  for (let t = from.getTime(); t < toExcl.getTime(); t += DAY_MS) days.push(thaiDayKey(new Date(t)))
  return days
}

/**
 * ทุกอย่างที่หน้ารายละเอียดของแอดมินหนึ่งคนต้องใช้ — **โหลดข้อมูลช่วงปัจจุบันครั้งเดียว**
 *
 * ทำไมต้องมีตัวนี้ ทั้งที่เรียกสองฟังก์ชันแยกกันก็ได้: หน้านั้นเคยยิง 11 query โดยที่ 3 ใน 11
 * เป็นชุดเดียวกันเป๊ะ (`getAgentPerformance` กับ `getConversationBreakdown` ต่างคนต่างโหลด
 * ช่วงปัจจุบันของตัวเอง) — วัดจริงที่ 92 วัน หน้ารายละเอียดใช้ 813 ms ขณะที่หน้าภาพรวมซึ่ง
 * ทำงานหนักกว่าใช้ 652 ms ⇒ ส่วนต่างคือของที่ทำซ้ำล้วน ๆ
 *
 * 🛑 การรวมไว้ในฟังก์ชันเดียวสำคัญกว่าการ "จำไว้ว่าอย่าเรียกซ้ำ" — คนถัดไปที่เพิ่มบล็อกใหม่
 * ในหน้านั้นจะได้ข้อมูลชุดเดิมโดยอัตโนมัติ ไม่ต้องรู้กติกานี้เลย
 */
export async function getAgentDetailBundle(
  shopId: string,
  agentUserId: string,
  filters: ReportFilters,
  page: { limit: number; offset: number },
): Promise<{
  detail: AgentDetail | null
  breakdown: { rows: ConversationBreakdownRow[]; total: number }
}> {
  /* 🛑 ยิงช่วงปัจจุบันกับช่วงก่อนหน้า **พร้อมกัน** — วัดจริงแล้วว่าถ้าโหลดช่วงปัจจุบันให้เสร็จก่อน
     แล้วค่อยเริ่มช่วงก่อนหน้า จะช้ากว่าเดิมที่ยิงซ้ำด้วยซ้ำ (30 วัน: 504 → 589 ms) เพราะของเดิม
     ที่ "ซ้ำ" นั้นวิ่งขนานกันบนคนละ connection ⇒ มันกิน CPU ของฐานเพิ่ม แต่ไม่ได้กินเวลาผู้ใช้
     บทเรียน: ตัดจำนวน query ลงอย่างเดียวไม่ได้แปลว่าเร็วขึ้น ต้องไม่ทิ้งการทำงานขนานไปด้วย */
  const [raw, prevFacts] = await Promise.all([
    loadRaw(shopId, filters),
    loadFacts(shopId, { ...filters, ...previousRange(filters) }),
  ])
  const [detail, breakdown] = await Promise.all([
    getAgentPerformance(shopId, agentUserId, filters, { raw, prevFacts }),
    getConversationBreakdown(shopId, agentUserId, filters, page, { raw }),
  ])
  return { detail, breakdown }
}

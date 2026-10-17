import 'server-only'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { INTERNAL_MESSAGE_TYPES } from '@/lib/auto-order-message-type'
import { thaiTodayBounds } from '@/lib/date-range'
import { resolveSlaConfig } from '@/lib/agent-sla'
import { can, effectiveRoles } from '@/lib/shop-permissions'
import { presenceKeyFor } from '@/lib/chat-desk/presence-key'
import { getShopResponseSummary } from '@/services/agent-performance.service'
import {
  AWAITING_CAP,
  AWAITING_WINDOW_DAYS,
  DAILY_CACHE_TTL_MS,
  PLATFORMS,
  PREVIEW_LIMIT,
  RECENT_REPLY_WINDOW_SEC,
} from '@/lib/chat-desk/constants'
import { roomMatchesFilters, sanitizeDeskFilters } from '@/lib/chat-desk/filters'
import { isSystemNoticeKind } from '@/lib/auto-reply-constants'
import { classifyRoom, pickDesk, startOfBangkokDay } from '@/lib/chat-desk/rules'
import type {
  DeskDaily,
  DeskFilters,
  DeskMember,
  DeskPlatform,
  DeskRoom,
  DeskSnapshot,
} from '@/lib/chat-desk/types'

/**
 * chat-desk.service — ข้อมูลโต๊ะแชท 3D (feature 00077) · อ่านอย่างเดียวทุกเส้น
 *
 * 🛑 ไม่คำนวณสูตรเวลาตอบเอง: ตัวเลขรายวันมาจาก `getShopResponseSummary` (นิยามเดียวกับ /reports/agents)
 * และเกณฑ์เกินเวลามาจาก `resolveSlaConfig` — ห้ามใส่เลข 300 ที่นี่ (chat-desk-sources.test.ts บังคับ)
 * 🛑 ห้ามเขียน `shopLastReadAt` / เรียก markRead / ส่ง sender action (AC-CD-40)
 * ผู้เรียกต้องตรวจสิทธิ์ X7 มาแล้ว (route) — service รับ shopId ที่ผ่านด่านแล้วเท่านั้น
 */

const CUSTOMER_FALLBACK_NAME = 'ลูกค้า'
const BODY_MAX = 2000
const DAY_MS = 86_400_000

/* ── ร้าน + สมาชิก ────────────────────────────────────────────────────────── */

const SHOP_SELECT = {
  shopName: true,
  kind: true,
  vertical: true,
  userId: true,
  user: { select: { displayName: true } },
  members: { select: { userId: true, role: true, roles: true, user: { select: { displayName: true } } } },
  // เพจที่ตัดการเชื่อมต่อแล้วไม่เป็นตัวเลือกตัวกรอง (เหมือนรายงานผลงานแอดมิน)
  channels: {
    where: { status: { not: 'DISCONNECTED' } },
    select: { id: true, name: true, provider: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.ShopSelect

export type DeskShopRow = Prisma.ShopGetPayload<{ select: typeof SHOP_SELECT }>

async function fetchDeskShop(shopId: string): Promise<DeskShopRow | null> {
  return prisma.shop.findUnique({ where: { id: shopId }, select: SHOP_SELECT })
}

/**
 * สมาชิกทุกคนรวมเจ้าของ — เจ้าของนับคนเดียว (BUSINESS ที่มีแถว ShopMember ของเจ้าของเองด้วยต้องไม่ซ้ำ)
 * `canChat` = ถือ H1 จริง (ผู้ดูแลที่ไม่มี H1 ออนไลน์ไม่ได้เลย จึงไม่นับเป็นกำลังคนรับแชท)
 */
export function loadDeskMembers(
  shopId: string,
  shop: Pick<DeskShopRow, 'kind' | 'vertical' | 'userId' | 'user' | 'members'>,
): DeskMember[] {
  const facts = { kind: shop.kind, vertical: shop.vertical, userId: shop.userId }
  const make = (userId: string, name: string | null, role: 'OWNER' | 'ADMIN', roles: readonly string[]): DeskMember => ({
    userId,
    name: name ?? 'ไม่ทราบชื่อ',
    role,
    canChat: can(effectiveRoles(facts, role, roles), 'H1'),
    presenceKey: presenceKeyFor(shopId, userId),
  })
  const seen = new Set<string>([shop.userId])
  const rest: DeskMember[] = []
  for (const m of shop.members) {
    if (seen.has(m.userId)) continue
    seen.add(m.userId)
    rest.push(make(m.userId, m.user.displayName, m.role === 'OWNER' ? 'OWNER' : 'ADMIN', m.roles))
  }
  rest.sort((a, b) => a.name.localeCompare(b.name, 'th'))
  return [make(shop.userId, shop.user.displayName, 'OWNER', []), ...rest]
}

/* ── ห้อง (raw SQL ก้อนเดียว · SDS §7.2) ──────────────────────────────────── */

type RoomRow = {
  state: 'WAITING' | 'AT_DESK'
  id: string
  channel: string
  shopChannelId: string | null
  name: string | null
  lastInboundAt: Date | null
  askedAt: Date | null
  repliedAt: Date | null
  senderUserId: string | null
  autoReplyKind: string | null
  viaStandby: boolean
}

const isPlatform = (v: string): v is DeskPlatform => (PLATFORMS as readonly string[]).includes(v)

async function fetchRoomRows(shopId: string, f: DeskFilters, now: Date): Promise<RoomRow[]> {
  const internal = Prisma.join([...INTERNAL_MESSAGE_TYPES])
  const platformSql = f.platforms.length ? Prisma.sql`AND c."channel" IN (${Prisma.join(f.platforms)})` : Prisma.empty
  const pageSql = f.pages.length ? Prisma.sql`AND c."shopChannelId" IN (${Prisma.join(f.pages)})` : Prisma.empty
  const awaitingSince = new Date(now.getTime() - AWAITING_WINDOW_DAYS * DAY_MS)
  const recentSince = new Date(now.getTime() - RECENT_REPLY_WINDOW_SEC * 1000)
  const nameSql = Prisma.sql`COALESCE(NULLIF(btrim(c."alias"),''), NULLIF(btrim(ec."name"),''), NULLIF(btrim(u."displayName"),''))`
  // ห้อง "ซ่อน/สแปม/ปิดงาน" อยู่นอกฉากเสมอ (BR-CD-01) — เงื่อนไขชุดเดียวกันทั้งสองสาขา
  const base = Prisma.sql`c."shopId" = ${shopId} AND c."resolvedAt" IS NULL AND c."isHidden" = false AND c."isSpam" = false ${platformSql} ${pageSql}`

  // 🛑 ระบุคอลัมน์ทุกที่ ห้าม m.* (global omit ของ prisma ไม่ครอบ raw SQL — rawMessage จะหลุดมา)
  return prisma.$queryRaw<RoomRow[]>(Prisma.sql`
    WITH awaiting AS (
      SELECT c."id", c."channel", c."shopChannelId", c."lastInboundAt", ${nameSql} AS "name"
      FROM "Conversation" c
      LEFT JOIN "ExternalContact" ec ON ec."id" = c."externalContactId"
      LEFT JOIN "User" u ON u."id" = c."buyerUserId"
      WHERE ${base} AND c."lastSenderRole" = 'BUYER' AND c."lastInboundAt" >= ${awaitingSince}
      ORDER BY c."lastInboundAt" ASC
      LIMIT ${AWAITING_CAP + 1}
    ), recent AS (
      SELECT c."id", c."channel", c."shopChannelId", c."lastInboundAt", ${nameSql} AS "name"
      FROM "Conversation" c
      LEFT JOIN "ExternalContact" ec ON ec."id" = c."externalContactId"
      LEFT JOIN "User" u ON u."id" = c."buyerUserId"
      WHERE ${base} AND c."lastSenderRole" = 'SHOP' AND c."lastMessageAt" >= ${recentSince}
      ORDER BY c."lastMessageAt" DESC
      LIMIT ${AWAITING_CAP}
    )
    SELECT 'WAITING'::text AS "state", a."id", a."channel", a."shopChannelId", a."name", a."lastInboundAt",
           COALESCE(fa."at", a."lastInboundAt") AS "askedAt",
           NULL::timestamp(3) AS "repliedAt", NULL::text AS "senderUserId", NULL::text AS "autoReplyKind",
           false AS "viaStandby"
    FROM awaiting a
    LEFT JOIN LATERAL (
      SELECT m."createdAt" AS "at" FROM "ChatMessage" m
      WHERE m."conversationId" = a."id" AND m."senderRole" = 'SHOP' AND m."isDeleted" = false
        AND m."type" NOT IN (${internal})
        AND m."autoReplyKind" IS DISTINCT FROM 'AUTO_NOTICE'
      ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1
    ) ls ON true
    LEFT JOIN LATERAL (
      SELECT m."createdAt" AS "at" FROM "ChatMessage" m
      WHERE m."conversationId" = a."id" AND m."senderRole" = 'BUYER' AND m."isDeleted" = false
        AND m."type" NOT IN (${internal}) AND (ls."at" IS NULL OR m."createdAt" > ls."at")
      ORDER BY m."createdAt" ASC, m."seq" ASC LIMIT 1
    ) fa ON true
    UNION ALL
    SELECT 'AT_DESK'::text, r."id", r."channel", r."shopChannelId", r."name", r."lastInboundAt",
           NULL::timestamp(3), lr."createdAt", lr."senderUserId", lr."autoReplyKind", lr."viaStandby"
    FROM recent r
    JOIN LATERAL (
      SELECT m."createdAt", m."senderUserId", m."autoReplyKind", m."viaStandby" FROM "ChatMessage" m
      WHERE m."conversationId" = r."id" AND m."senderRole" = 'SHOP' AND m."isDeleted" = false
        AND m."type" NOT IN (${internal})
        AND m."autoReplyKind" IS DISTINCT FROM 'AUTO_NOTICE'
      ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1
    ) lr ON true
  `)
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** แปลงแถว SQL → DeskRoom · classifyRoom เป็นด่านสุดท้าย (กฎอยู่ rules.ts ที่เดียว) */
function toRooms(rows: RoomRow[], memberIds: ReadonlySet<string>, now: Date): { waiting: DeskRoom[]; atDesk: DeskRoom[] } {
  const waiting: DeskRoom[] = []
  const atDesk: DeskRoom[] = []
  for (const r of rows) {
    if (!isPlatform(r.channel)) continue
    const cls = classifyRoom(
      {
        resolvedAt: null,
        isHidden: false,
        isSpam: false,
        lastSenderRole: r.state === 'WAITING' ? 'BUYER' : 'SHOP',
        lastInboundAt: r.lastInboundAt,
        lastShopMessageAt: r.repliedAt,
      },
      now,
    )
    if (cls !== r.state) continue
    const room: DeskRoom = {
      id: r.id,
      name: r.name ?? CUSTOMER_FALLBACK_NAME,
      platform: r.channel,
      pageId: r.shopChannelId,
      state: r.state,
      askedAt: iso(r.askedAt),
      lastInboundAt: iso(r.lastInboundAt),
      repliedAt: iso(r.repliedAt),
      desk: r.state === 'WAITING' ? null : pickDesk(r, memberIds),
    }
    ;(r.state === 'WAITING' ? waiting : atDesk).push(room)
  }
  waiting.sort((a, b) => (a.lastInboundAt ?? '').localeCompare(b.lastInboundAt ?? '') || a.id.localeCompare(b.id))
  atDesk.sort((a, b) => (b.repliedAt ?? '').localeCompare(a.repliedAt ?? '') || a.id.localeCompare(b.id))
  return { waiting, atDesk }
}

/* ── ตัวเลขรายวัน (ทั้งร้าน · แคช 60 วินาที) ──────────────────────────────── */

/** ห้องที่ปิดงานวันนี้ (เวลาไทย) และยังปิดอยู่ — ลูกค้าทักกลับแล้ว resolvedAt ถูกล้างจึงไม่นับ */
export async function countResolvedToday(shopId: string, now: Date = new Date()): Promise<number> {
  return prisma.conversation.count({ where: { shopId, resolvedAt: { gte: startOfBangkokDay(now) } } })
}

type DailyCache = Map<string, { at: number; p: Promise<DeskDaily> }>
const DAILY_KEY = Symbol.for('safepay.chatDesk.daily')
const DAILY_CACHE_MAX = 2000

function dailyCache(): DailyCache {
  const g = globalThis as unknown as Record<symbol, DailyCache | undefined>
  return (g[DAILY_KEY] ??= new Map())
}

/** เทสใช้ล้างแคชระหว่างเคส */
export function __resetDailyCacheForTests() {
  dailyCache().clear()
}

async function computeDaily(shopId: string, now: Date): Promise<DeskDaily> {
  const { from, to } = thaiTodayBounds(now)
  const [summary, resolvedToday] = await Promise.all([
    getShopResponseSummary(shopId, { from, to }),
    countResolvedToday(shopId, now),
  ])
  return { status: 'OK', asOf: now.toISOString(), ...summary, resolvedToday }
}

const unavailableDaily = (now: Date): DeskDaily => ({
  status: 'UNAVAILABLE',
  asOf: now.toISOString(),
  firstResponseAvgSec: null,
  responseAvgSec: null,
  responseSampleCount: 0,
  unattributedReplyCount: 0,
  answeredOutsideSystemConversations: 0,
  resolvedToday: 0,
})

/**
 * แคชเก็บ "promise" (กันหลายคำขอพร้อมกันยิงซ้ำ) · ล้ม = ไม่จำ แล้วตอบ UNAVAILABLE ไม่ใช่ throw
 * ตัวเลขนี้เป็นของทั้งร้านไม่ตามตัวกรอง (TD-13) · ต่ออินสแตนซ์ ค่าอาจต่างกัน ≤ 60 วินาที (แสดง asOf)
 */
export function getDailyMetrics(shopId: string, now: Date = new Date()): Promise<DeskDaily> {
  const cache = dailyCache()
  const key = `${shopId}|${startOfBangkokDay(now).toISOString()}`
  const hit = cache.get(key)
  if (hit && now.getTime() - hit.at < DAILY_CACHE_TTL_MS) return hit.p
  if (cache.size > DAILY_CACHE_MAX) cache.clear()
  const p = computeDaily(shopId, now).catch((e) => {
    console.error('[chat-desk] daily metrics failed', e instanceof Error ? e.message : e)
    if (cache.get(key)?.p === p) cache.delete(key)
    return unavailableDaily(now)
  })
  cache.set(key, { at: now.getTime(), p })
  return p
}

/* ── snapshot ─────────────────────────────────────────────────────────────── */

export type DeskSnapshotTimings = { directory: number; rooms: number; daily: number }

/**
 * คืน null เมื่อไม่พบร้าน (ถูกลบระหว่างทาง) — route ตอบ 403 · service ไม่ throw error ใหม่
 * จังหวะ 1: ร้าน+สมาชิก+เพจ (ต้องใช้ sanitize ตัวกรอง) · จังหวะ 2: ห้องกับรายวันขนานกัน (TD-15)
 */
export async function getDeskSnapshot(
  shopId: string,
  requested: DeskFilters,
  opts: { now?: Date } = {},
): Promise<{ snapshot: DeskSnapshot; timings: DeskSnapshotTimings } | null> {
  const now = opts.now ?? new Date()
  const t0 = performance.now()
  const shop = await fetchDeskShop(shopId)
  if (!shop) return null
  const members = loadDeskMembers(shopId, shop)
  const filters = sanitizeDeskFilters(requested, {
    channelIds: shop.channels.map((c) => c.id),
    memberIds: members.map((m) => m.userId),
  })
  const t1 = performance.now()

  let tRooms = 0
  let tDaily = 0
  const [rows, daily] = await Promise.all([
    fetchRoomRows(shopId, filters, now).then((r) => ((tRooms = performance.now() - t1), r)),
    getDailyMetrics(shopId, now).then((d) => ((tDaily = performance.now() - t1), d)),
  ])

  const { waiting, atDesk } = toRooms(rows, new Set(members.map((m) => m.userId)), now)
  const capped = waiting.length > AWAITING_CAP
  const rooms = [...waiting.slice(0, AWAITING_CAP), ...atDesk].filter((r) => roomMatchesFilters(r, filters))
  const sla = resolveSlaConfig({ id: shopId })

  return {
    snapshot: {
      v: 1,
      serverNow: now.getTime(),
      shop: { id: shopId, name: shop.shopName, kind: shop.kind === 'PERSONAL' ? 'PERSONAL' : 'BUSINESS' },
      sla: { firstResponseSec: sla.firstResponseSec, source: sla.source },
      filters,
      awaiting: { capped },
      rooms,
      members,
      channels: shop.channels,
      daily,
    },
    timings: { directory: t1 - t0, rooms: tRooms, daily: tDaily },
  }
}

/* ── พรีวิวห้อง (อ่านอย่างเดียว) ──────────────────────────────────────────── */

export type RoomPreviewBy = { kind: 'ADMIN'; name: string } | { kind: 'EXTERNAL' } | { kind: 'META_AI' } | { kind: 'BOT' } | null

export type RoomPreview = {
  room: { id: string; name: string; platform: DeskPlatform; pageName: string | null }
  messages: {
    id: string
    senderRole: 'BUYER' | 'SHOP'
    by: RoomPreviewBy
    type: string
    body: string | null
    isDeleted: boolean
    createdAt: string
  }[]
  truncated: boolean
}

/**
 * 30 ข้อความล่าสุด เรียงเก่า→ใหม่ · คืน null = ไม่พบห้องในร้านนี้ (route ตอบ 404 เหมือนห้องร้านอื่น)
 * 🛑 ไม่แตะ shopLastReadAt · ไม่ส่ง seen/sender action · ไม่มี URL ไฟล์/รูป · body เฉพาะ TEXT ที่ยังไม่ถูกลบ
 */
export async function getRoomPreview(shopIds: readonly string[], conversationId: string): Promise<RoomPreview | null> {
  // ห้องต้องอยู่ในร้านที่ผู้เรียกถือ X7 เท่านั้น — scope ใน WHERE ตั้งแต่คำสั่งแรก (ห้องร้านอื่น = ไม่พบ)
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId: { in: [...shopIds] } },
    select: {
      id: true,
      shopId: true,
      channel: true,
      alias: true,
      shopChannel: { select: { name: true } },
      externalContact: { select: { name: true } },
      buyer: { select: { displayName: true } },
    },
  })
  if (!conv || !isPlatform(conv.channel)) return null
  const shopId = conv.shopId
  const [shop, rows] = await Promise.all([
    fetchDeskShop(shopId),
    prisma.chatMessage.findMany({
      where: { conversationId, type: { notIn: [...INTERNAL_MESSAGE_TYPES] } },
      orderBy: [{ createdAt: 'desc' }, { seq: 'desc' }],
      take: PREVIEW_LIMIT + 1,
      select: {
        id: true, senderRole: true, senderUserId: true, type: true, body: true, isDeleted: true,
        createdAt: true, autoReplyKind: true, viaStandby: true,
      },
    }),
  ])
  if (!shop) return null

  const names = new Map(loadDeskMembers(shopId, shop).map((m) => [m.userId, m.name]))
  const ids = new Set(names.keys())
  const messages = rows.slice(0, PREVIEW_LIMIT).reverse().map((m) => {
    const isShop = m.senderRole === 'SHOP'
    // ข้อความระบบแจ้ง (AUTO_NOTICE) ไม่มีโต๊ะ — ไม่ใช่บอท/คน/Meta AI (00078 S-10)
    const t = isShop && !isSystemNoticeKind(m.autoReplyKind) ? pickDesk(m, ids) : null
    const by: RoomPreviewBy = !t ? null : t.kind === 'ADMIN' ? { kind: 'ADMIN', name: names.get(t.userId) ?? 'ไม่ทราบชื่อ' } : t
    return {
      id: m.id,
      senderRole: isShop ? ('SHOP' as const) : ('BUYER' as const),
      by,
      type: m.type,
      body: m.isDeleted || m.type !== 'TEXT' ? null : (m.body ?? '').slice(0, BODY_MAX),
      isDeleted: m.isDeleted,
      createdAt: m.createdAt.toISOString(),
    }
  })
  const name =
    conv.alias?.trim() || conv.externalContact?.name?.trim() || conv.buyer?.displayName?.trim() || CUSTOMER_FALLBACK_NAME
  return {
    room: { id: conv.id, name, platform: conv.channel, pageName: conv.shopChannel?.name ?? null },
    messages,
    truncated: rows.length > PREVIEW_LIMIT,
  }
}

/** เรียงรหัสร้านตามชื่อ — ใช้เลือกร้านตั้งต้นเมื่อไม่ได้ขอร้านและร้านที่ active ไม่ใช่ร้านของเจ้าของ */
export async function sortShopIdsByName(shopIds: readonly string[]): Promise<string[]> {
  const rows = await prisma.shop.findMany({
    where: { id: { in: [...shopIds] } },
    select: { id: true },
    orderBy: [{ shopName: 'asc' }, { id: 'asc' }],
  })
  return rows.map((r) => r.id)
}

/** รายชื่อร้านที่ใช้ในตัวสลับร้านของหน้าโต๊ะแชท — เรียงตามชื่อ · ผู้เรียกต้องส่งเฉพาะร้านที่ผ่าน listAccessibleShopIds(userId,'X7') แล้ว */
export async function listDeskShopOptions(shopIds: readonly string[]): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.shop.findMany({
    where: { id: { in: [...shopIds] } },
    select: { id: true, shopName: true },
    orderBy: [{ shopName: 'asc' }, { id: 'asc' }],
  })
  return rows.map((r) => ({ id: r.id, name: r.shopName }))
}

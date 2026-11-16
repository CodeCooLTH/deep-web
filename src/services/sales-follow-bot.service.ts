// 00095 S-3 — CRUD บอทติดตามยอดขาย · สถานะ · ลบ · หยุดรายห้อง · ประวัติ · มุมมองแผงห้อง/แถวกล่องแชท (TFR-FB-04..07/19/20)
// 🛑 ไม่มี RLS: ทุก query ใส่ shopId เป็นเงื่อนไขแรก · id ของร้านอื่น = NotFound (ไม่เปิดเผยว่ามีในร้านอื่น)
// 🛑 ทุกการเขียนที่ตัดสินเรื่องช่องทางชนใช้ advisory lock ต่อร้านใน tx เดียวกับที่เขียน (AC-FB-21)
// ฟังก์ชันที่ throw: ดูรายการที่ src/lib/sales-follow-bot/errors.ts · route-errors.ts แปลงเป็น HTTP แล้ว
import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { toFileUrl, variantUrlOf } from '@/lib/file-url'
import { tagNameKey } from '@/lib/shop-tag-match'
import { countCodePoints } from '@/lib/auto-notify/variables'
import {
  FOLLOW_PROVIDERS,
  HOLD_REASON_TEXT,
  SALES_FOLLOW_LIMITS,
  SALES_STAGE_KEYS,
  SALES_STAGE_LABEL,
  SEND_REASON_TEXT,
  ALLOWED_VARIABLES,
  MIN_MS,
  type BotStatus,
  type HoldReason,
  type SalesStageKey,
  type FinalAction,
  type ReplyHandoff,
  type SendReason,
  type SendStatus,
  type TagMatch,
} from '@/lib/sales-follow-bot/constants'
import { aggregateBotStats, STATS_WINDOW_DAYS, type BotStatsResult } from '@/lib/sales-follow-bot/stats'
import { findChannelConflicts, type ConflictBot, type ConflictOther } from '@/lib/sales-follow-bot/conflicts'
import { computeDueAt } from '@/lib/sales-follow-bot/decide'
import {
  SalesFollowBotChannelConflictError,
  SalesFollowBotChannelNotFoundError,
  SalesFollowBotNotAvailableError,
  SalesFollowBotNotFoundError,
  SalesFollowBotStaleError,
  SalesFollowBotTagNotFoundError,
  SalesFollowBotTestRoomsError,
  SalesFollowBotValidationError,
} from '@/lib/sales-follow-bot/errors'
import { isSalesFollowBotEnabled } from '@/lib/sales-follow-bot/gate'
import { isAwaitingShop } from '@/lib/sales-follow-bot/message-defs'
import {
  normalizeBotFields,
  stepStructureKey,
  stepTimeline,
  testRoomsProblem,
  validateBotFields,
  type BotFields,
  type BotIssue,
  type BotStep,
} from '@/lib/sales-follow-bot/schemas'
import { countedShopReplySql, messageLookbackSince, realBuyerMsgSql } from '@/lib/sales-follow-bot/message-defs'
import { loadBots, decideRunNow, type DecideRunInput } from '@/services/sales-follow-facts.service'
import { stopRunsWithNote } from '@/services/sales-follow-note.service'
import { assertOwnedImages } from '@/services/sales-follow-images.service'

type Tx = Prisma.TransactionClient

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v))
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

/** ล็อกต่อร้าน — บันทึก/เปลี่ยนสถานะ/ลบ ของบอททุกตัวในร้านเดียวกันเรียงคิวกัน (ถึง COMMIT) */
const lockShop = (tx: Tx, shopId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'sales-follow-bot:' + shopId}, 0))`

// ───────────────────────── DTO ─────────────────────────

export interface BotChannelBrief {
  id: string
  provider: string
  name: string
  avatarUrl: string | null
  /** IG: @handle · LINE: @basicId · Messenger: null */
  handle: string | null
}

export interface BotStepDto extends BotStep {
  /** คำนวณ ไม่เก็บ: เวลาสะสม > 23 ชม. = ส่งได้เฉพาะลูกค้า Meta ที่ทักจากโฆษณา */
  adOnly: boolean
}

export interface BotDto {
  id: string
  name: string
  status: BotStatus
  salesStatuses: SalesStageKey[]
  tags: { key: string; name: string; missing: boolean }[]
  tagMatch: TagMatch
  channelIds: string[]
  channels: BotChannelBrief[]
  testRoomIds: string[]
  steps: BotStepDto[]
  finalAction: FinalAction
  finalDelayMin: number
  replyHandoff: ReplyHandoff
  totalDelayMin: number
  structureRev: number
  updatedAt: string
  warnings: { code: 'TAG_MISSING'; keys: string[] }[]
  activeRunCount: number
}

type BotRow = {
  id: string
  name: string
  status: string
  salesStatuses: string[]
  tagKeys: string[]
  tagMatch: string
  steps: Prisma.JsonValue
  finalAction: string
  finalDelayMin: number
  replyHandoff: string
  structureRev: number
  updatedAt: Date
  channels: { shopChannelId: string }[]
  testRooms: { conversationId: string }[]
}

const BOT_SELECT = {
  id: true, name: true, status: true, salesStatuses: true, tagKeys: true, tagMatch: true, steps: true,
  finalAction: true, finalDelayMin: true, replyHandoff: true, structureRev: true, updatedAt: true,
  channels: { select: { shopChannelId: true } },
  testRooms: { select: { conversationId: true } },
} as const

function channelHandle(c: { provider: string; name: string; basicId: string | null }): string | null {
  if (c.provider === 'INSTAGRAM') return c.name.trim().startsWith('@') ? c.name.trim() : null
  if (c.provider === 'LINE') {
    const id = c.basicId?.trim().replace(/^@/, '')
    return id ? `@${id}` : null
  }
  return null
}

async function loadChannelBriefs(shopId: string, ids: string[]): Promise<Map<string, BotChannelBrief>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.shopChannel.findMany({
    where: { shopId, id: { in: ids } },
    select: { id: true, provider: true, name: true, avatarUrl: true, basicId: true },
  })
  return new Map(
    rows.map((c) => [c.id, { id: c.id, provider: c.provider, name: c.name, avatarUrl: toFileUrl(c.avatarUrl), handle: channelHandle(c) }]),
  )
}

function toDto(
  b: BotRow,
  ctx: { tagNameByKey: Map<string, string>; channels: Map<string, BotChannelBrief>; activeRunCount: number },
): BotDto {
  const steps = b.steps as unknown as BotStep[]
  const tl = stepTimeline(steps.map((s) => s.delayMin))
  const missing = b.tagKeys.filter((k) => !ctx.tagNameByKey.has(k))
  const channelIds = b.channels.map((c) => c.shopChannelId)
  return {
    id: b.id,
    name: b.name,
    status: b.status as BotStatus,
    salesStatuses: b.salesStatuses as SalesStageKey[],
    tags: b.tagKeys.map((k) => ({ key: k, name: ctx.tagNameByKey.get(k) ?? k, missing: !ctx.tagNameByKey.has(k) })),
    tagMatch: b.tagMatch as TagMatch,
    channelIds,
    channels: channelIds.map((id) => ctx.channels.get(id)).filter((c): c is BotChannelBrief => !!c),
    testRoomIds: b.testRooms.map((t) => t.conversationId),
    steps: steps.map((s, i) => ({ ...s, adOnly: tl.adOnly[i] })),
    finalAction: b.finalAction as FinalAction,
    finalDelayMin: b.finalDelayMin,
    replyHandoff: b.replyHandoff as ReplyHandoff,
    totalDelayMin: tl.totalDelayMin,
    structureRev: b.structureRev,
    updatedAt: b.updatedAt.toISOString(),
    warnings: missing.length > 0 ? [{ code: 'TAG_MISSING', keys: missing }] : [],
    activeRunCount: ctx.activeRunCount,
  }
}

async function dtoCtx(shopId: string, rows: BotRow[]) {
  const [tags, channels, counts] = await Promise.all([
    prisma.shopTag.findMany({ where: { shopId }, select: { nameKey: true, name: true } }),
    loadChannelBriefs(shopId, [...new Set(rows.flatMap((r) => r.channels.map((c) => c.shopChannelId)))]),
    prisma.salesFollowRun.groupBy({
      by: ['botId'],
      where: { shopId, status: 'ACTIVE', botId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    }),
  ])
  return {
    tagNameByKey: new Map(tags.map((t) => [t.nameKey, t.name])),
    channels,
    countByBot: new Map(counts.map((c) => [c.botId, c._count._all])),
  }
}

async function dtosOf(shopId: string, rows: BotRow[]): Promise<BotDto[]> {
  const c = await dtoCtx(shopId, rows)
  return rows.map((r) => toDto(r, { tagNameByKey: c.tagNameByKey, channels: c.channels, activeRunCount: c.countByBot.get(r.id) ?? 0 }))
}

// ───────────────────────── ตรวจข้อมูลที่อ้างถึงของร้าน ─────────────────────────

async function assertChannels(tx: Tx, shopId: string, channelIds: string[]) {
  const uniq = [...new Set(channelIds)]
  const n = await tx.shopChannel.count({ where: { shopId, id: { in: uniq }, provider: { in: [...FOLLOW_PROVIDERS] } } })
  // ตอบเหมือนกันทุกกรณี (ไม่มี/ของร้านอื่น/DEEP) — ไม่เปิดเผยว่ามีในร้านอื่น
  if (n !== uniq.length) throw new SalesFollowBotChannelNotFoundError()
}

/** ชื่อแท็ก → tagKeys (tagNameKey ตัวเดียวกับ UI) · ชื่อที่ร้านไม่มี = TagNotFound */
async function resolveTagKeys(tx: Tx, shopId: string, names: string[]): Promise<string[]> {
  const pairs = names.map((n) => ({ name: n, key: tagNameKey(n) }))
  const keys = [...new Set(pairs.map((p) => p.key))]
  if (keys.length === 0) return []
  const have = new Set((await tx.shopTag.findMany({ where: { shopId, nameKey: { in: keys } }, select: { nameKey: true } })).map((t) => t.nameKey))
  const missing = [...new Set(pairs.filter((p) => !have.has(p.key)).map((p) => p.name))]
  if (missing.length > 0) throw new SalesFollowBotTagNotFoundError(missing)
  return keys
}

/**
 * quick message ของทุกชิ้นต้องเป็นของร้าน — ไม่ใช่ = issue 400 (ใช้รหัส QUICK_MESSAGE_REQUIRED ที่ path ของชิ้นนั้น: "เลือกใหม่")
 * `allowIds` = id ที่บอทเดิมถืออยู่แล้ว (PATCH) — ถูกลบไปแล้วยังบันทึกได้ (UX §19: การ์ดเตือน "รอบนี้จะข้ามชิ้นนี้")
 * ตรวจเฉพาะ id ที่ **เพิ่งเลือกใหม่** เท่านั้น
 */
async function assertQuickMessages(tx: Tx, shopId: string, steps: BotStep[], allowIds: ReadonlySet<string> = new Set()) {
  const wanted = steps.flatMap((s) => s.parts.flatMap((p) => (p.kind === 'QUICK_MESSAGE' && !allowIds.has(p.quickMessageId) ? [p.quickMessageId] : [])))
  if (wanted.length === 0) return
  const own = new Set((await tx.quickMessage.findMany({ where: { shopId, id: { in: [...new Set(wanted)] } }, select: { id: true } })).map((q) => q.id))
  const issues: BotIssue[] = []
  steps.forEach((s, i) =>
    s.parts.forEach((p, j) => {
      if (p.kind === 'QUICK_MESSAGE' && !allowIds.has(p.quickMessageId) && !own.has(p.quickMessageId))
        issues.push({ code: 'QUICK_MESSAGE_REQUIRED', path: `steps.${i}.parts.${j}.quickMessageId`, stepIndex: i, partIndex: j })
    }),
  )
  if (issues.length > 0) throw new SalesFollowBotValidationError(issues)
}

async function assertNoConflicts(tx: Tx, shopId: string, cand: ConflictBot) {
  const [others, shopTags] = await Promise.all([
    tx.salesFollowBot.findMany({
      where: { shopId, deletedAt: null, status: { not: 'CLOSED' }, ...(cand.id ? { id: { not: cand.id } } : {}) },
      select: { id: true, name: true, status: true, deletedAt: true, salesStatuses: true, tagKeys: true, channels: { select: { shopChannelId: true } } },
    }),
    tx.shopTag.findMany({ where: { shopId }, select: { nameKey: true } }),
  ])
  const live = new Set(shopTags.map((t) => t.nameKey))
  const conflicts = findChannelConflicts(
    cand,
    others.map(
      (o): ConflictOther => ({
        id: o.id, name: o.name, status: o.status, deletedAt: o.deletedAt, salesStatuses: o.salesStatuses,
        channelIds: o.channels.map((c) => c.shopChannelId), usableTagCount: o.tagKeys.filter((k) => live.has(k)).length,
      }),
    ),
  )
  if (conflicts.length > 0) throw new SalesFollowBotChannelConflictError(conflicts)
}

async function usableTagCount(tx: Tx, shopId: string, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0
  return tx.shopTag.count({ where: { shopId, nameKey: { in: keys } } })
}

function throwIfInvalid(f: BotFields) {
  const issues = validateBotFields(f)
  if (issues.length > 0) throw new SalesFollowBotValidationError(issues)
}

/** อ่านบอทของร้านใน tx (ไม่ลบ) · stale ต้องเทียบ ms กับ updatedAt */
async function loadForWrite(tx: Tx, shopId: string, botId: string, expected: Date | string) {
  const cur = await tx.salesFollowBot.findFirst({ where: { shopId, id: botId, deletedAt: null }, select: { ...BOT_SELECT, deletedAt: true } })
  if (!cur) throw new SalesFollowBotNotFoundError()
  if (cur.updatedAt.getTime() !== toDate(expected).getTime()) throw new SalesFollowBotStaleError(cur.updatedAt)
  return cur
}

// ───────────────────────── CRUD ─────────────────────────

/**
 * ชั้นที่สองต่อจากด่านของ route (security LOW): ฟังก์ชันที่ "เขียน" เช็คเองว่าร้านอยู่ในรายชื่อนำร่องและเป็น ONLINE_SALES
 * กัน route ใหม่ที่ลืมด่าน · stopRunForConversation ไม่เช็คโดยตั้งใจ — ร้านที่ถูกถอดต้องยังหยุดบอทที่ค้างได้
 */
async function assertAvailable(shopId: string): Promise<void> {
  if (!isSalesFollowBotEnabled(shopId)) throw new SalesFollowBotNotAvailableError('FEATURE_NOT_ENABLED')
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } })
  if (shop?.vertical !== 'ONLINE_SALES') throw new SalesFollowBotNotAvailableError('NOT_AVAILABLE_FOR_SHOP')
}

const imageIdsOf = (steps: BotStep[]): Set<string> =>
  new Set(steps.flatMap((s) => s.parts.flatMap((p) => (p.kind === 'IMAGES' ? p.fileIds : []))))

export async function getBot(shopId: string, botId: string): Promise<BotDto> {
  const row = await prisma.salesFollowBot.findFirst({ where: { shopId, id: botId, deletedAt: null }, select: BOT_SELECT })
  if (!row) throw new SalesFollowBotNotFoundError()
  return (await dtosOf(shopId, [row]))[0]
}

export async function listBots(shopId: string): Promise<BotDto[]> {
  const rows = await prisma.salesFollowBot.findMany({
    where: { shopId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: BOT_SELECT,
  })
  return dtosOf(shopId, rows)
}

/** ตัวเลข 7 วันล่าสุดของทุกบอทในร้าน (00095 redesign) — ผูก shopId ทุก query · นิยามอยู่ที่ lib/sales-follow-bot/stats.ts */
export async function getBotStats7d(shopId: string, now: Date = new Date()): Promise<BotStatsResult> {
  const since = new Date(now.getTime() - STATS_WINDOW_DAYS * 86_400_000)
  const sends = await prisma.salesFollowSend.findMany({
    where: { shopId, createdAt: { gte: since }, status: { in: ['SENT', 'FAILED'] } },
    select: { botId: true, runId: true, status: true },
  })
  const runIds = [...new Set(sends.filter((s) => s.status === 'SENT').map((s) => s.runId))]
  const runs = runIds.length ? await prisma.salesFollowRun.findMany({ where: { shopId, id: { in: runIds } }, select: { id: true, stopReason: true } }) : []
  return aggregateBotStats(sends, runs)
}

/** สร้างบอท — CLOSED เสมอ (AC-FB-04) · ตรวจชนช่องทางกับบอทที่ไม่ปิดของร้านแม้ตัวเองจะ CLOSED (ล็อกช่องใน UI ตรงกัน AC-FB-20) */
export async function createBot(shopId: string, userId: string, input: BotFields): Promise<BotDto> {
  await assertAvailable(shopId)
  const f = normalizeBotFields(input)
  throwIfInvalid(f)
  const id = await prisma.$transaction(async (tx) => {
    await lockShop(tx, shopId)
    await assertChannels(tx, shopId, f.channelIds)
    const tagKeys = await resolveTagKeys(tx, shopId, f.tags)
    await assertQuickMessages(tx, shopId, f.steps)
    await assertOwnedImages(tx, shopId, f.steps)
    await assertNoConflicts(tx, shopId, {
      id: '', name: f.name, channelIds: [...new Set(f.channelIds)], salesStatuses: f.salesStatuses, usableTagCount: tagKeys.length,
    })
    const created = await tx.salesFollowBot.create({
      data: {
        shopId, name: f.name, status: 'CLOSED', salesStatuses: f.salesStatuses, tagKeys, tagMatch: f.tagMatch,
        steps: f.steps as unknown as Prisma.InputJsonValue, createdByUserId: userId,
        ...(f.finalAction !== undefined ? { finalAction: f.finalAction } : {}), ...(f.finalDelayMin !== undefined ? { finalDelayMin: f.finalDelayMin } : {}), ...(f.replyHandoff !== undefined ? { replyHandoff: f.replyHandoff } : {}), updatedByUserId: userId,
        channels: { create: [...new Set(f.channelIds)].map((shopChannelId) => ({ shopChannelId })) },
      },
      select: { id: true },
    })
    return created.id
  })
  return getBot(shopId, id)
}

export type UpdateBotInput = Partial<BotFields> & { expectedUpdatedAt: Date | string }

/**
 * แก้บอท: ส่งเฉพาะที่แก้ (steps ส่งทั้งชุด) · expectedUpdatedAt ไม่ตรง = Stale
 * โครงรอบเปลี่ยน (stepStructureKey) → structureRev+1 + หยุด run ที่ตามอยู่ BOT_EDITED + บรรทัดระบบ ใน tx เดียวกับการบันทึก
 * แก้เฉพาะถ้อยคำ/รูป/delayMin/ชื่อ = ไม่หยุด (due คิดใหม่ทุก tick) · บันทึกซ้ำไม่เปลี่ยนอะไร = ไม่หยุด
 */
export async function updateBot(shopId: string, userId: string, botId: string, input: UpdateBotInput): Promise<BotDto & { stoppedRuns: number }> {
  await assertAvailable(shopId)
  const stopped = await prisma.$transaction(async (tx) => {
    await lockShop(tx, shopId)
    const cur = await loadForWrite(tx, shopId, botId, input.expectedUpdatedAt)
    const curSteps = cur.steps as unknown as BotStep[]
    const curChannelIds = cur.channels.map((c) => c.shopChannelId)

    // ผลรวมกับบอทเดิมต้องผ่าน validate อีกรอบ (NO_CONDITION ข้ามฟิลด์) — แท็กเดิมนับเป็นจำนวน
    const f = normalizeBotFields({
      name: input.name ?? cur.name,
      salesStatuses: input.salesStatuses ?? cur.salesStatuses,
      tags: input.tags ?? cur.tagKeys,
      tagMatch: input.tagMatch ?? (cur.tagMatch as TagMatch),
      channelIds: input.channelIds ?? curChannelIds,
      steps: input.steps ?? curSteps,
      finalAction: input.finalAction ?? (cur.finalAction as FinalAction),
      finalDelayMin: input.finalDelayMin ?? cur.finalDelayMin,
      replyHandoff: input.replyHandoff ?? (cur.replyHandoff as ReplyHandoff),
    })
    throwIfInvalid(f)

    const channelIds = [...new Set(f.channelIds)]
    if (input.channelIds) await assertChannels(tx, shopId, channelIds)
    const tagKeys = input.tags ? await resolveTagKeys(tx, shopId, f.tags) : cur.tagKeys
    if (input.steps) {
      const had = new Set(curSteps.flatMap((s) => s.parts.flatMap((p) => (p.kind === 'QUICK_MESSAGE' ? [p.quickMessageId] : []))))
      await assertQuickMessages(tx, shopId, f.steps, had)
      await assertOwnedImages(tx, shopId, f.steps, imageIdsOf(curSteps))
    }
    await assertNoConflicts(tx, shopId, {
      id: cur.id, name: f.name, channelIds, salesStatuses: f.salesStatuses,
      usableTagCount: input.tags ? tagKeys.length : await usableTagCount(tx, shopId, tagKeys),
    })

    const structureChanged = stepStructureKey(f.steps) !== stepStructureKey(curSteps)
    await tx.salesFollowBot.update({
      where: { id: cur.id },
      data: {
        name: f.name, salesStatuses: f.salesStatuses, tagKeys, tagMatch: f.tagMatch,
        steps: f.steps as unknown as Prisma.InputJsonValue, updatedByUserId: userId,
        // ไม่ใช่โครงรอบ → ไม่ขยับ structureRev/ไม่หยุด run (BR-FA-6)
        finalAction: f.finalAction, finalDelayMin: f.finalDelayMin, replyHandoff: f.replyHandoff,
        ...(structureChanged ? { structureRev: { increment: 1 } } : {}),
        ...(input.channelIds ? { channels: { deleteMany: {}, create: channelIds.map((shopChannelId) => ({ shopChannelId })) } } : {}),
      },
    })
    if (!structureChanged) return 0
    // ชื่อใหม่ (ถ้าแก้พร้อมกัน) เป็น snapshot ของบรรทัดระบบ
    return (await stopRunsWithNote(tx, { shopId, botId: cur.id }, 'BOT_EDITED', { stoppedByUserId: userId, botName: f.name })).length
  })
  return { ...(await getBot(shopId, botId)), stoppedRuns: stopped }
}

export interface ChangeStatusInput {
  status: BotStatus
  /** เฉพาะ TESTING — แทนที่ชุดเดิม */
  testRoomIds?: string[]
  expectedUpdatedAt: Date | string
}

/**
 * เปลี่ยน ปิด/ทดสอบ/เปิดใช้ · TESTING ต้องมีห้องทดสอบ 1..20 บนช่องทางของบอทและเป็นของร้าน
 * ตั้งเป็น TESTING/ACTIVE ตรวจชนช่องทางซ้ำ · run ที่อยู่ก่อนถูกประเมินรอบ tick ถัดไป (BOT_DISABLED / OUT_OF_SCOPE) — ไม่หยุดทันที
 */
export async function changeBotStatus(shopId: string, userId: string, botId: string, input: ChangeStatusInput): Promise<BotDto> {
  await assertAvailable(shopId)
  const problem = testRoomsProblem(input.status, input.testRoomIds)
  if (problem) throw new SalesFollowBotTestRoomsError(problem)
  await prisma.$transaction(async (tx) => {
    await lockShop(tx, shopId)
    const cur = await loadForWrite(tx, shopId, botId, input.expectedUpdatedAt)
    const channelIds = cur.channels.map((c) => c.shopChannelId)

    if (input.status === 'TESTING') {
      const roomIds = [...new Set(input.testRoomIds ?? [])]
      const n = await tx.conversation.count({ where: { shopId, id: { in: roomIds }, shopChannelId: { in: channelIds } } })
      if (n !== roomIds.length) throw new SalesFollowBotTestRoomsError('TEST_ROOM_NOT_FOUND')
      await tx.salesFollowBotTestRoom.deleteMany({ where: { botId: cur.id } })
      await tx.salesFollowBotTestRoom.createMany({ data: roomIds.map((conversationId) => ({ botId: cur.id, conversationId, createdByUserId: userId })) })
    }
    if (input.status !== 'CLOSED') {
      await assertNoConflicts(tx, shopId, {
        id: cur.id, name: cur.name, channelIds, salesStatuses: cur.salesStatuses, usableTagCount: await usableTagCount(tx, shopId, cur.tagKeys),
      })
    }
    await tx.salesFollowBot.update({ where: { id: cur.id }, data: { status: input.status, updatedByUserId: userId } })
  })
  return getBot(shopId, botId)
}

/** ลบ = soft delete + หยุดทุก run BOT_DELETED + บรรทัดระบบ ในทรานแซกชันเดียว · ประวัติ SalesFollowSend ยังอยู่ */
export async function deleteBot(shopId: string, userId: string, botId: string, expectedUpdatedAt: Date | string): Promise<{ deleted: true; stoppedRuns: number }> {
  const stoppedRuns = await prisma.$transaction(async (tx) => {
    await lockShop(tx, shopId)
    const cur = await loadForWrite(tx, shopId, botId, expectedUpdatedAt)
    await tx.salesFollowBot.update({ where: { id: cur.id }, data: { deletedAt: new Date(), updatedByUserId: userId } })
    return (await stopRunsWithNote(tx, { shopId, botId: cur.id }, 'BOT_DELETED', { stoppedByUserId: userId, botName: cur.name })).length
  })
  return { deleted: true, stoppedRuns }
}

// ───────────────────────── ตัวเลือกฟอร์ม · ห้องทดสอบ ─────────────────────────

const preview = (s: string, n = 80): string => (countCodePoints(s) > n ? `${Array.from(s).slice(0, n).join('')}…` : s)

export interface BotOptions {
  channels: (BotChannelBrief & { status: string })[]
  tags: { key: string; name: string }[]
  stages: { key: SalesStageKey; label: string }[]
  limits: typeof SALES_FOLLOW_LIMITS
  variables: readonly string[]
  /** ข้อความที่ใช้บ่อยของร้าน (ชิ้นชนิด QUICK_MESSAGE) — เรียงตามที่ร้านจัดเอง */
  quickMessages: { id: string; title: string; bodyPreview: string; thumbUrl: string | null; imageCount: number }[]
}

export async function getBotOptions(shopId: string): Promise<BotOptions> {
  const [channels, tags, quick] = await Promise.all([
    prisma.shopChannel.findMany({
      where: { shopId, provider: { in: [...FOLLOW_PROVIDERS] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, provider: true, name: true, avatarUrl: true, basicId: true, status: true },
    }),
    prisma.shopTag.findMany({ where: { shopId }, orderBy: { name: 'asc' }, select: { nameKey: true, name: true } }),
    prisma.quickMessage.findMany({
      where: { shopId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, title: true, body: true, imageFileId: true, imageFileIds: true },
    }),
  ])
  return {
    channels: channels.map((c) => ({
      id: c.id, provider: c.provider, name: c.name, avatarUrl: toFileUrl(c.avatarUrl), handle: channelHandle(c), status: c.status,
    })),
    tags: tags.map((t) => ({ key: t.nameKey, name: t.name })),
    stages: SALES_STAGE_KEYS.map((key) => ({ key, label: SALES_STAGE_LABEL[key] })),
    limits: SALES_FOLLOW_LIMITS,
    variables: ALLOWED_VARIABLES,
    quickMessages: quick.map((q) => {
      const files = q.imageFileIds.length > 0 ? q.imageFileIds : q.imageFileId ? [q.imageFileId] : []
      return {
        id: q.id, title: q.title, bodyPreview: preview(q.body), imageCount: files.length,
        thumbUrl: files[0] ? (variantUrlOf(files[0], 'thumb') ?? toFileUrl(files[0])) : null,
      }
    }),
  }
}

const roomName = (c: { alias: string | null; externalContact: { name: string | null } | null }): string =>
  c.alias?.trim() || c.externalContact?.name?.trim() || 'ลูกค้า'

export interface TestRoomItem {
  conversationId: string
  contactName: string
  channel: string
  shopChannelId: string | null
  lastInboundAt: string | null
}

/** ค้นแชทเลือกเป็นห้องทดสอบ — ≤20 เรียง lastInboundAt ล่าสุดก่อน · channelId ของร้านอื่นไม่ปรากฏในผล (ไม่ error) */
export async function searchTestRooms(shopId: string, channelIds: string[], q?: string): Promise<TestRoomItem[]> {
  // escape % _ \\ — ไม่งั้น q='_' หรือ '%' กลายเป็น wildcard จับทุกห้อง (contains ของ Prisma ไม่ escape ให้)
  const term = q?.trim().slice(0, SALES_FOLLOW_LIMITS.maxName).replace(/[\\%_]/g, '\\$&')
  if (channelIds.length === 0) return []
  const rows = await prisma.conversation.findMany({
    where: {
      shopId,
      shopChannelId: { in: channelIds },
      channel: { in: [...FOLLOW_PROVIDERS] },
      externalContactId: { not: null },
      isSpam: false,
      isHidden: false,
      ...(term
        ? { OR: [{ alias: { contains: term, mode: 'insensitive' } }, { externalContact: { name: { contains: term, mode: 'insensitive' } } }] }
        : {}),
    },
    orderBy: [{ lastInboundAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: SALES_FOLLOW_LIMITS.maxTestRooms,
    select: { id: true, alias: true, channel: true, shopChannelId: true, lastInboundAt: true, externalContact: { select: { name: true } } },
  })
  return rows.map((r) => ({
    conversationId: r.id, contactName: roomName(r), channel: r.channel, shopChannelId: r.shopChannelId, lastInboundAt: iso(r.lastInboundAt),
  }))
}

/** ชื่อ/ช่องทางของแชททดสอบที่เลือกไว้แล้ว (ฟอร์มแก้บอทต้องโชว์ชื่อ ไม่ใช่ id) — scope ด้วย shopId · id ของร้านอื่น/ที่หายไม่ปรากฏในผล */
export async function getTestRoomLabels(shopId: string, conversationIds: string[]): Promise<TestRoomItem[]> {
  if (conversationIds.length === 0) return []
  const rows = await prisma.conversation.findMany({
    where: { shopId, id: { in: conversationIds.slice(0, SALES_FOLLOW_LIMITS.maxTestRooms) } },
    select: { id: true, alias: true, channel: true, shopChannelId: true, lastInboundAt: true, externalContact: { select: { name: true } } },
  })
  return rows.map((r) => ({
    conversationId: r.id, contactName: roomName(r), channel: r.channel, shopChannelId: r.shopChannelId, lastInboundAt: iso(r.lastInboundAt),
  }))
}

// ───────────────────────── ประวัติการส่ง ─────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const encodeSendsCursor = (createdAt: Date, id: string): string => Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url')

/** cursor พัง/ปลอม = null (ผู้เรียกตอบหน้าว่าง ไม่ใช่ 400/500 — AC-FB-81) */
export function decodeSendsCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const [at, id, ...rest] = Buffer.from(raw, 'base64url').toString('utf8').split('|')
    const d = new Date(at ?? '')
    if (rest.length > 0 || !id || !UUID_RE.test(id) || Number.isNaN(d.getTime()) || d.toISOString() !== at) return null
    return { createdAt: d, id }
  } catch {
    return null
  }
}

export interface SendHistoryItem {
  id: string
  conversationId: string
  contactName: string
  contactAvatarUrl: string | null
  channel: string
  channelName: string | null
  channelHandle: string | null
  botName: string
  botDeleted: boolean
  /** เริ่ม 1 (DB เริ่ม 0) */
  step: number
  stepCount: number
  status: SendStatus
  reason: SendReason | null
  reasonText: string | null
  /** FR-FA-5: ส่งได้หลังบอทดึงสิทธิ์คุมเธรดคืนจาก Business Suite */
  controlReclaimed: boolean
  /** SENT = เวลาฟองจริง (ChatMessage.createdAt) ไม่งั้น settledAt ?? createdAt */
  at: string
}

export async function listSends(shopId: string, o: { cursor?: string | null; limit?: number } = {}): Promise<{ items: SendHistoryItem[]; nextCursor: string | null }> {
  const empty = { items: [], nextCursor: null }
  let after: { createdAt: Date; id: string } | null = null
  if (o.cursor) {
    after = decodeSendsCursor(o.cursor)
    if (!after) return empty
  }
  const limit = Math.min(Math.max(Math.trunc(o.limit ?? 50) || 50, 1), 50)
  const rows = await prisma.salesFollowSend.findMany({
    where: {
      shopId,
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: { id: true, conversationId: true, botId: true, step: true, stepCount: true, status: true, reason: true, controlReclaimed: true, chatMessageId: true, settledAt: true, createdAt: true },
  })
  const page = rows.slice(0, limit)
  if (page.length === 0) return empty

  const [convs, bots, msgs] = await Promise.all([
    prisma.conversation.findMany({
      where: { shopId, id: { in: [...new Set(page.map((r) => r.conversationId))] } },
      select: {
        id: true, alias: true, channel: true,
        externalContact: { select: { name: true, avatarUrl: true } },
        shopChannel: { select: { name: true, provider: true, basicId: true } },
      },
    }),
    prisma.salesFollowBot.findMany({ where: { shopId, id: { in: [...new Set(page.map((r) => r.botId))] } }, select: { id: true, name: true, deletedAt: true } }),
    prisma.chatMessage.findMany({
      where: { id: { in: page.flatMap((r) => (r.chatMessageId ? [r.chatMessageId] : [])) }, conversation: { shopId } },
      select: { id: true, createdAt: true },
    }),
  ])
  const convBy = new Map(convs.map((c) => [c.id, c]))
  const botBy = new Map(bots.map((b) => [b.id, b]))
  const msgAt = new Map(msgs.map((m) => [m.id, m.createdAt]))

  const items = page.map((r): SendHistoryItem => {
    const c = convBy.get(r.conversationId)
    const b = botBy.get(r.botId)
    const real = r.status === 'SENT' && r.chatMessageId ? msgAt.get(r.chatMessageId) : undefined
    return {
      id: r.id,
      conversationId: r.conversationId,
      contactName: c ? roomName(c) : 'ลูกค้า',
      contactAvatarUrl: toFileUrl(c?.externalContact?.avatarUrl),
      channel: c?.channel ?? '',
      channelName: c?.shopChannel?.name ?? null,
      channelHandle: c?.shopChannel ? channelHandle({ provider: c.shopChannel.provider, name: c.shopChannel.name, basicId: c.shopChannel.basicId }) : null,
      botName: b?.name ?? 'บอทที่ถูกลบแล้ว',
      botDeleted: !b || b.deletedAt !== null,
      step: r.step + 1,
      stepCount: r.stepCount,
      status: r.status as SendStatus,
      reason: r.reason as SendReason | null,
      reasonText: r.reason ? (SEND_REASON_TEXT[r.reason as SendReason] ?? null) : null,
      controlReclaimed: r.controlReclaimed,
      at: (real ?? r.settledAt ?? r.createdAt).toISOString(),
    }
  })
  const last = page[page.length - 1]
  return { items, nextCursor: rows.length > limit ? encodeSendsCursor(last.createdAt, last.id) : null }
}

// ───────────────────────── หยุดรายห้อง · แผงในห้อง · แถวกล่องแชท ─────────────────────────

/** หยุดบอทของห้องนี้ (ADMIN_STOPPED) — idempotent: ไม่มี run/กดซ้ำ = stopped:false ไม่ error ไม่เขียนบรรทัดซ้ำ · ห้องของร้านอื่น = NotFound */
export async function stopRunForConversation(shopId: string, conversationId: string, userId: string): Promise<{ stopped: boolean }> {
  const room = await prisma.conversation.findFirst({ where: { shopId, id: conversationId }, select: { id: true } })
  if (!room) throw new SalesFollowBotNotFoundError()
  const stopped = await prisma.$transaction((tx) =>
    stopRunsWithNote(tx, { shopId, conversationId: room.id }, 'ADMIN_STOPPED', { stoppedByUserId: userId }),
  )
  return { stopped: stopped.length > 0 }
}

export interface PanelStep {
  index: number
  state: 'SENT' | 'PENDING' | 'SENDING' | 'SKIPPED' | 'FAILED'
  delayMin: number
  sentAt: string | null
  dueAt: string | null
  reasonText: string | null
}
export interface PanelRun {
  runId: string
  botName: string
  stageLabel: string
  holdReason: HoldReason | null
  holdText: string | null
  awaitingShop: boolean
  canStop: boolean
  steps: PanelStep[]
}
export type ConversationPanel = { available: false } | { available: true; run: PanelRun | null }

/**
 * แผงในห้อง (TFR-FB-20) · ห้องของร้านอื่น = NotFound · DEEP/ร้านไม่ผ่านด่าน/ไม่ใช่ ONLINE_SALES = available:false
 * ซ่อน run ที่ decideRun (ตัวเดียวกับ engine) บอกว่าจะหยุดด้วย CUSTOMER_REPLIED/TAG_REMOVED ทันที ไม่รอ tick (AC-FB-74)
 */
export async function getConversationPanel(shopId: string, conversationId: string, now: Date = new Date()): Promise<ConversationPanel> {
  const [room, shop] = await Promise.all([
    prisma.conversation.findFirst({ where: { shopId, id: conversationId }, select: { id: true, channel: true } }),
    prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } }),
  ])
  if (!room) throw new SalesFollowBotNotFoundError()
  if (room.channel === 'DEEP' || !isSalesFollowBotEnabled(shopId) || shop?.vertical !== 'ONLINE_SALES') return { available: false }

  const run = await prisma.salesFollowRun.findFirst({
    where: { shopId, conversationId, status: 'ACTIVE' },
    select: {
      id: true, shopId: true, botId: true, conversationId: true, stageKey: true, stageStamp: true, structureRev: true, nextStep: true,
      lastSentAt: true,
      sends: { select: { step: true, status: true, reason: true, chatMessageId: true, settledAt: true, createdAt: true } },
    },
  })
  if (!run) return { available: true, run: null }

  const input: DecideRunInput = { ...run, stageKey: run.stageKey as SalesStageKey }
  const [decided, bots] = await Promise.all([decideRunNow(input, now), loadBots(shopId, [run.botId])])
  const bot = bots.get(run.botId)
  if (!decided || !bot) return { available: true, run: null }
  const { facts, decision } = decided
  if (decision.action === 'STOP' && (decision.reason === 'CUSTOMER_REPLIED' || decision.reason === 'TAG_REMOVED')) return { available: true, run: null }

  const msgs = await prisma.chatMessage.findMany({
    where: { id: { in: run.sends.flatMap((s) => (s.chatMessageId ? [s.chatMessageId] : [])) }, conversationId },
    select: { id: true, createdAt: true },
  })
  const msgAt = new Map(msgs.map((m) => [m.id, m.createdAt]))
  const sendBy = new Map(run.sends.map((s) => [s.step, s]))
  const awaitingShop = isAwaitingShop(facts.latestBuyerMsg, facts.latestShopReply)

  // dueAt ของรอบถัดไปจาก computeDueAt (สูตรเดียวกับ decide) · รอบหลังจากนั้น = ประมาณการต่อท้ายด้วย delayMin ของแต่ละรอบ
  let due: number | null = awaitingShop ? null : (computeDueAt(facts)?.getTime() ?? null)
  const steps = bot.steps.map((st, i): PanelStep => {
    const send = sendBy.get(i)
    if (send && send.status !== 'SENDING') {
      const sentAt = send.status === 'SENT' && send.chatMessageId ? msgAt.get(send.chatMessageId) : undefined
      return {
        index: i + 1, state: send.status as PanelStep['state'], delayMin: st.delayMin,
        sentAt: iso(sentAt ?? (send.status === 'SENT' ? (send.settledAt ?? send.createdAt) : null)),
        dueAt: null, reasonText: send.reason ? (SEND_REASON_TEXT[send.reason as SendReason] ?? null) : null,
      }
    }
    if (send) return { index: i + 1, state: 'SENDING', delayMin: st.delayMin, sentAt: null, dueAt: null, reasonText: null }
    if (i < run.nextStep) return { index: i + 1, state: 'SKIPPED', delayMin: st.delayMin, sentAt: null, dueAt: null, reasonText: null }
    if (i > run.nextStep && due !== null) due += st.delayMin * MIN_MS
    const dueAt = due !== null ? new Date(due) : null
    return { index: i + 1, state: 'PENDING', delayMin: st.delayMin, sentAt: null, dueAt: iso(dueAt), reasonText: null }
  })

  const hold = decision.action === 'HOLD' ? decision.reason : null
  return {
    available: true,
    run: {
      runId: run.id, botName: bot.name, stageLabel: SALES_STAGE_LABEL[run.stageKey as SalesStageKey] ?? run.stageKey,
      holdReason: hold, holdText: hold ? HOLD_REASON_TEXT[hold] : null, awaitingShop, canStop: true, steps,
    },
  }
}

export interface FollowBotRowSummary {
  /** จำนวนรอบที่ส่งสำเร็จแล้ว (นับแถว Send ที่ SENT) — ไม่รวมรอบที่ข้าม/ล้ม */
  sentRounds: number
  totalRounds: number
  awaitingShop: boolean
}

/**
 * สรุปบอทต่อแถวกล่องแชท (UX §21) — 1 query ชุด · คีย์ครบทุก id ที่ขอ (ไม่มี run = null)
 * ร้านที่ไม่ผ่านด่านนำร่อง = null ทุกห้อง (กล่องแชทเรียกตรง ไม่ผ่าน route ที่มีด่าน)
 * ไม่เรียก decideRun (แพงเกินสำหรับรายการ): ลูกค้าเพิ่งตอบหลังฟองบอทจะยังเห็นแคปซูลจน tick ถัดไปหยุด (≤1 นาที)
 */
export async function getFollowBotRowSummaries(shopId: string, conversationIds: string[], now: Date = new Date()): Promise<Map<string, FollowBotRowSummary | null>> {
  const out = new Map<string, FollowBotRowSummary | null>(conversationIds.map((id) => [id, null]))
  const ids = [...new Set(conversationIds)]
  if (ids.length === 0 || !isSalesFollowBotEnabled(shopId)) return out
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } })
  if (shop?.vertical !== 'ONLINE_SALES') return out

  const sinceExpr = `'${messageLookbackSince(now).toISOString()}'::timestamp`
  const RB = Prisma.raw(realBuyerMsgSql('m', sinceExpr))
  const CS = Prisma.raw(countedShopReplySql('m', sinceExpr))
  const rows = await prisma.$queryRaw<
    { conversationId: string; total: number; sent: number; lbAt: Date | null; lbSeq: number | null; lsAt: Date | null; lsSeq: number | null }[]
  >`
    SELECT r."conversationId", jsonb_array_length(b."steps")::int AS "total",
           (SELECT count(*)::int FROM "SalesFollowSend" s WHERE s."runId" = r."id" AND s."status" = 'SENT') AS "sent",
           lb."createdAt" AS "lbAt", lb."seq" AS "lbSeq", ls."createdAt" AS "lsAt", ls."seq" AS "lsSeq"
    FROM "SalesFollowRun" r
    JOIN "SalesFollowBot" b ON b."id" = r."botId" AND b."shopId" = r."shopId" AND b."deletedAt" IS NULL
    LEFT JOIN LATERAL (SELECT m."createdAt", m."seq" FROM "ChatMessage" m WHERE m."conversationId" = r."conversationId" AND ${RB}
                       ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1) lb ON true
    LEFT JOIN LATERAL (SELECT m."createdAt", m."seq" FROM "ChatMessage" m WHERE m."conversationId" = r."conversationId" AND ${CS}
                       ORDER BY m."createdAt" DESC, m."seq" DESC LIMIT 1) ls ON true
    WHERE r."shopId" = ${shopId} AND r."status" = 'ACTIVE' AND r."conversationId" = ANY(${ids}::text[])`
  for (const r of rows) {
    out.set(r.conversationId, {
      sentRounds: r.sent,
      totalRounds: r.total,
      awaitingShop: isAwaitingShop(
        r.lbAt && r.lbSeq !== null ? { createdAt: r.lbAt, seq: r.lbSeq } : null,
        r.lsAt && r.lsSeq !== null ? { createdAt: r.lsAt, seq: r.lsSeq } : null,
      ),
    })
  }
  return out
}

// ───────────────────────── แนบ run (ให้ engine S-4 เรียก) ─────────────────────────

/**
 * INSERT … ON CONFLICT DO NOTHING (ห้าม create + catch P2002 — ก่อ ERROR ใน log Postgres)
 * กันซ้ำด้วย unique 2 ตัว: หนึ่ง ACTIVE ต่อห้อง · (บอท,ห้อง,stageStamp) · คืน id ที่สร้าง หรือ null เมื่อชน
 */
export async function attachRun(p: {
  shopId: string
  botId: string
  conversationId: string
  stageKey: SalesStageKey
  stageStamp: Date
  structureRev: number
  now?: Date
}): Promise<string | null> {
  const now = (p.now ?? new Date()).toISOString()
  // SELECT จาก bot ⨝ conversation ที่ shopId ตรงกัน — id ข้ามร้านไม่ได้แถว (ไม่ได้พึ่ง FK อย่างเดียวซึ่งไม่ตรวจร้าน)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "SalesFollowRun" ("id","shopId","botId","conversationId","stageKey","stageStamp","structureRev","nextStep","status","createdAt","updatedAt")
    SELECT gen_random_uuid()::text, b."shopId", b."id", c."id", ${p.stageKey}, ${p.stageStamp.toISOString()}::timestamptz,
           ${p.structureRev}, 0, 'ACTIVE', ${now}::timestamptz, ${now}::timestamptz
    FROM "SalesFollowBot" b JOIN "Conversation" c ON c."shopId" = b."shopId"
    WHERE b."shopId" = ${p.shopId} AND b."id" = ${p.botId} AND c."id" = ${p.conversationId}
    ON CONFLICT DO NOTHING
    RETURNING "id"`
  return rows[0]?.id ?? null
}
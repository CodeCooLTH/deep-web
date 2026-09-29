// 00066 ติดตามลูกค้า — service ชั้นเดียวของทุกพื้นผิว (แผงห้อง/bubble/กระดาน/ปฏิทิน/โปรไฟล์/ป้ายแถว/ตัวกรอง)
//
// กติกาที่ไฟล์นี้ต้องรักษา (มีเทส [blocker] สแกนซอร์สอยู่ที่ __tests__/customer-follow-up.service.test.ts):
//  1. ทุก prisma.customerFollowUp.* มี shopId ใน where/data ตั้งแต่ query แรก — Deep ไม่มี RLS
//     ห้อง/รายการของร้านอื่น = FollowUpNotFoundError (ไม่แยก "ไม่มี" กับ "ไม่มีสิทธิ์" — ไม่รั่วว่ามีอยู่)
//  2. "เลยกำหนด/bucket" ตัดสินด้วย isOverdue/bucketOf (follow-up-rules) เท่านั้น — SQL มีได้แค่ pre-filter
//     แบบ superset (dueAt < สิ้นวันนี้ไทย) ที่ TS ตรวจซ้ำเสมอ (มติ S-3, TD-FU-2)
//  3. ไม่ import ตัวส่งข้อความขาออกเด็ดขาด (BR-ACT-14) — ฟีเจอร์นี้ไม่ส่งอะไรหาลูกค้า
//  4. ไม่ gate activeLocked (มติ S-1) — ข้อมูลภายในร้าน
import type { CustomerFollowUp } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { thaiMidnightUtc, thaiTodayBounds } from '@/lib/date-range'
import { getChannelLabel } from '@/lib/chat-channel'
import {
  CAL_MAX,
  DONE_IN_PANEL,
  LIST_MAX,
  OPEN_SCAN_MAX,
  type FollowUpOutcome,
  type FollowUpStatus,
  type FollowUpType,
  type SnoozePreset,
} from '@/lib/follow-up-constants'
import {
  bubbleModel,
  bubbleRows,
  bucketOf,
  countOpenAndLate,
  filterStateOf,
  initialRemindedFor,
  isOverdue,
  isUnassigned,
  panelModel,
  type Bucket,
  type FilterState,
} from '@/lib/follow-up-rules'
import { FollowUpDueError, quickSnooze, resolveDue } from '@/lib/follow-up-time'
import {
  clusterKeysOf,
  conversationIdsByClusterTags,
  conversationsByClusterKeys,
  expandClusters,
  openRowsByAnchor,
} from './follow-up-scope'

// ---------- error classes (mapper ที่ api/follow-ups/_shared.ts ต้องครอบทุกตัว — SRS §11) ----------
export class FollowUpNotFoundError extends Error {
  constructor(message = 'NOT_FOUND') {
    super(message)
    this.name = 'FollowUpNotFoundError'
  }
}
export class AssigneeNotMemberError extends Error {
  constructor(message = 'ASSIGNEE_NOT_MEMBER') {
    super(message)
    this.name = 'AssigneeNotMemberError'
  }
}
export class FollowUpStateError extends Error {
  constructor(message = 'INVALID_STATE') {
    super(message)
    this.name = 'FollowUpStateError'
  }
}
// re-export เพื่อให้ mapper enumerate จากโมดูลเดียว
export { FollowUpDueError }

// ---------- DTO (สัญญากับ API.md §4.0) ----------
export interface PersonDto {
  userId: string
  name: string
  avatar: string | null
}
export interface FollowUpDto {
  id: string
  conversationId: string
  shopId: string
  /** ส่วนขยายจาก API.md: ชื่อร้าน — โหมดหลายร้านต้องบอกว่าแถวนี้ของร้านไหน (Q-10) */
  shopName: string
  type: FollowUpType
  title: string
  note: string | null
  dueAt: string
  allDay: boolean
  status: FollowUpStatus
  outcome: FollowUpOutcome | null
  doneAt: string | null
  doneBy: PersonDto | null
  snoozeCount: number
  assignee: PersonDto | null
  assigneeRemoved: boolean
  createdBy: PersonDto | null
  bucket: Bucket
  overdue: boolean
  room: { id: string; label: string; channel: string } | null
  customerName: string | null
  customerAvatar: string | null
}

// ---------- ข้อมูลประกอบ (ร้าน/สมาชิก/คน/ห้อง) ----------
interface ShopInfo {
  id: string
  name: string
  kind: string
  ownerId: string
  /** เจ้าของ ∪ ShopMember (PERSONAL = เจ้าของคนเดียว — BR-ACT-04) */
  memberIds: Set<string>
}
interface ConvInfo {
  id: string
  channel: string
  roomLabel: string
  name: string | null
  avatar: string | null
}
interface Ctx {
  shops: Map<string, ShopInfo>
  users: Map<string, PersonDto>
  convs: Map<string, ConvInfo>
}

async function loadShops(shopIds: string[]): Promise<Map<string, ShopInfo>> {
  const out = new Map<string, ShopInfo>()
  if (shopIds.length === 0) return out
  const rows = await prisma.shop.findMany({
    where: { id: { in: shopIds } },
    select: { id: true, shopName: true, kind: true, userId: true, members: { select: { userId: true } } },
  })
  for (const s of rows) {
    const memberIds = new Set<string>([s.userId])
    if (s.kind !== 'PERSONAL') for (const m of s.members) memberIds.add(m.userId)
    out.set(s.id, { id: s.id, name: s.shopName, kind: s.kind, ownerId: s.userId, memberIds })
  }
  return out
}

async function loadUsers(ids: string[]): Promise<Map<string, PersonDto>> {
  const out = new Map<string, PersonDto>()
  if (ids.length === 0) return out
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true, avatar: true },
  })
  for (const u of rows) out.set(u.id, { userId: u.id, name: u.displayName, avatar: u.avatar })
  return out
}

async function loadConvs(convIds: string[], shopIds: string[]): Promise<Map<string, ConvInfo>> {
  const out = new Map<string, ConvInfo>()
  if (convIds.length === 0) return out
  const rows = await prisma.conversation.findMany({
    where: { id: { in: convIds }, shopId: { in: shopIds } },
    select: {
      id: true,
      channel: true,
      alias: true,
      buyer: { select: { displayName: true, avatar: true } },
      externalContact: { select: { name: true, avatarUrl: true } },
      shopChannel: { select: { name: true } },
    },
  })
  for (const c of rows) {
    out.set(c.id, {
      id: c.id,
      channel: c.channel,
      roomLabel: c.shopChannel?.name?.trim() || getChannelLabel(c.channel),
      // alias ที่ร้านตั้งเองชนะชื่อจริงเสมอ (ตรงกับ InboxList/toast)
      name: c.alias ?? c.externalContact?.name ?? c.buyer?.displayName ?? null,
      avatar: c.externalContact?.avatarUrl ?? c.buyer?.avatar ?? null,
    })
  }
  return out
}

async function buildCtx(rows: CustomerFollowUp[], shops: Map<string, ShopInfo>, shopIds: string[]): Promise<Ctx> {
  const userIds = new Set<string>()
  for (const r of rows) {
    if (r.assigneeUserId) userIds.add(r.assigneeUserId)
    if (r.doneByUserId) userIds.add(r.doneByUserId)
    if (r.createdByUserId) userIds.add(r.createdByUserId)
  }
  const [users, convs] = await Promise.all([
    loadUsers([...userIds]),
    loadConvs([...new Set(rows.map((r) => r.conversationId))], shopIds),
  ])
  return { shops, users, convs }
}

function toDto(row: CustomerFollowUp, ctx: Ctx, now: Date, homeConversationId?: string): FollowUpDto {
  const shop = ctx.shops.get(row.shopId)
  const conv = ctx.convs.get(row.conversationId)
  return {
    id: row.id,
    conversationId: row.conversationId,
    shopId: row.shopId,
    shopName: shop?.name ?? '',
    type: row.type as FollowUpType,
    title: row.title,
    note: row.note,
    dueAt: row.dueAt.toISOString(),
    allDay: row.allDay,
    status: row.status as FollowUpStatus,
    outcome: (row.outcome as FollowUpOutcome | null) ?? null,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
    doneBy: row.doneByUserId ? (ctx.users.get(row.doneByUserId) ?? null) : null,
    snoozeCount: row.snoozeCount,
    assignee: row.assigneeUserId ? (ctx.users.get(row.assigneeUserId) ?? null) : null,
    assigneeRemoved:
      row.assigneeUserId !== null && !(shop?.memberIds.has(row.assigneeUserId) ?? false),
    createdBy: row.createdByUserId ? (ctx.users.get(row.createdByUserId) ?? null) : null,
    bucket: bucketOf(row, now),
    overdue: isOverdue(row, now),
    room:
      homeConversationId && row.conversationId !== homeConversationId && conv
        ? { id: conv.id, label: conv.roomLabel, channel: conv.channel }
        : null,
    customerName: conv?.name ?? null,
    customerAvatar: conv?.avatar ?? null,
  }
}

async function toDtos(
  rows: CustomerFollowUp[],
  shopIds: string[],
  now: Date,
  homeConversationId?: string,
  shops?: Map<string, ShopInfo>,
): Promise<FollowUpDto[]> {
  if (rows.length === 0) return []
  const ctx = await buildCtx(rows, shops ?? (await loadShops(shopIds)), shopIds)
  return rows.map((r) => toDto(r, ctx, now, homeConversationId))
}

/** ผู้รับผิดชอบที่เลือกได้ — null เมื่อไม่มีร้าน BUSINESS ในขอบเขต (PERSONAL ไม่มีตัวเลือกคน) */
export async function listAssignees(shopIds: string[]): Promise<PersonDto[] | null> {
  const shops = await loadShops(shopIds)
  const business = [...shops.values()].filter((s) => s.kind !== 'PERSONAL')
  if (business.length === 0) return null
  const ids = new Set<string>()
  for (const s of business) for (const id of s.memberIds) ids.add(id)
  const users = await loadUsers([...ids])
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

// ---------- ผู้รับผิดชอบต้องเป็นสมาชิก (BR-ACT-04) ----------
async function assertAssignable(shopId: string, userId: string): Promise<void> {
  const shop = (await loadShops([shopId])).get(shopId)
  if (!shop || !shop.memberIds.has(userId)) throw new AssigneeNotMemberError()
}

function isFkViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2003'
}

const normNote = (n: string | null | undefined): string | null => {
  const t = n?.trim()
  return t ? t : null
}

// ---------- CRUD ----------
export interface CreateFollowUpInput {
  title: string
  type?: FollowUpType
  /** YYYY-MM-DD เวลาไทย */
  date: string
  /** HH:mm เวลาไทย · null = ทั้งวัน */
  time: string | null
  note?: string | null
  assigneeUserId?: string
}

/** shopId มาจากห้อง (route resolve) — service ตรวจซ้ำว่าห้องเป็นของร้านนี้จริง */
export async function createFollowUp(
  actorUserId: string,
  shopId: string,
  conversationId: string,
  input: CreateFollowUpInput,
  now: Date = new Date(),
): Promise<FollowUpDto> {
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, shopId },
    select: { id: true },
  })
  if (!conv) throw new FollowUpNotFoundError()
  const assigneeUserId = input.assigneeUserId ?? actorUserId
  await assertAssignable(shopId, assigneeUserId)
  const due = resolveDue({ date: input.date, time: input.time }, now)
  let row: CustomerFollowUp
  try {
    row = await prisma.customerFollowUp.create({
      data: {
        shopId,
        conversationId,
        type: input.type ?? 'FOLLOW_UP',
        title: input.title.trim(),
        note: normNote(input.note),
        dueAt: due.dueAt,
        allDay: due.allDay,
        assigneeUserId,
        createdByUserId: actorUserId,
        // ตั้งเวลาย้อนหลัง = จองไว้กันเตือนทันที (AC-ACT-39)
        remindedFor: initialRemindedFor(due, now),
      },
    })
  } catch (e) {
    if (isFkViolation(e)) throw new AssigneeNotMemberError()
    throw e
  }
  return (await toDtos([row], [shopId], now, conversationId))[0]
}

async function reload(shopIds: string[], id: string, now: Date): Promise<FollowUpDto> {
  const row = await prisma.customerFollowUp.findFirst({ where: { id, shopId: { in: shopIds } } })
  if (!row) throw new FollowUpNotFoundError()
  return (await toDtos([row], shopIds, now))[0]
}

export interface UpdateFollowUpPatch {
  title?: string
  type?: FollowUpType
  note?: string | null
  date?: string
  time?: string | null
  assigneeUserId?: string
}

export async function updateFollowUp(
  shopIds: string[],
  id: string,
  patch: UpdateFollowUpPatch,
  now: Date = new Date(),
): Promise<FollowUpDto> {
  const row = await prisma.customerFollowUp.findFirst({ where: { id, shopId: { in: shopIds } } })
  if (!row) throw new FollowUpNotFoundError()
  const touchesDue = patch.date !== undefined || patch.time !== undefined
  // ปิดแล้วแก้ได้แค่หัวข้อ/โน้ต (A6)
  if (
    row.status === 'DONE' &&
    (patch.type !== undefined || touchesDue || patch.assigneeUserId !== undefined)
  ) {
    throw new FollowUpStateError()
  }
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) data.title = patch.title.trim()
  if (patch.type !== undefined) data.type = patch.type
  if (patch.note !== undefined) data.note = normNote(patch.note)
  if (patch.assigneeUserId !== undefined) {
    await assertAssignable(row.shopId, patch.assigneeUserId)
    data.assigneeUserId = patch.assigneeUserId
  }
  if (touchesDue) {
    if (patch.date === undefined) throw new FollowUpDueError()
    const due = resolveDue({ date: patch.date, time: patch.time ?? null }, now)
    data.dueAt = due.dueAt
    data.allDay = due.allDay
    // แก้เวลา = re-arm เตือนด้วยกติกาเดียวกับตอนสร้าง · ไม่แตะ snoozeCount (AC-ACT-13)
    data.remindedFor = initialRemindedFor(due, now)
  }
  if (Object.keys(data).length === 0) return (await toDtos([row], shopIds, now))[0]
  let count: number
  try {
    ;({ count } = await prisma.customerFollowUp.updateMany({
      where: { id, shopId: { in: shopIds }, status: row.status },
      data,
    }))
  } catch (e) {
    if (isFkViolation(e)) throw new AssigneeNotMemberError()
    throw e
  }
  if (count === 0) {
    // สถานะเปลี่ยนระหว่างทาง (มีคนปิด/เปิดกลับ) — ไม่เขียนทับ
    const still = await prisma.customerFollowUp.findFirst({
      where: { id, shopId: { in: shopIds } },
      select: { id: true },
    })
    throw still ? new FollowUpStateError() : new FollowUpNotFoundError()
  }
  return reload(shopIds, id, now)
}

/** ปิดงาน — ซ้ำ = คืนแถวเดิม ไม่เขียนผู้ปิดทับ (เงื่อนไข status ใน where ของ updateMany) */
export async function completeFollowUp(
  actorUserId: string,
  shopIds: string[],
  id: string,
  outcome: FollowUpOutcome | null,
  now: Date = new Date(),
): Promise<FollowUpDto> {
  // count=0 ไม่ต้องอ่าน: reload ตัดสินเอง — มีแถว (DONE แล้ว) = คืนเดิม · ไม่มีแถว = NotFound
  await prisma.customerFollowUp.updateMany({
    where: { id, shopId: { in: shopIds }, status: 'OPEN' },
    data: { status: 'DONE', outcome, doneAt: now, doneByUserId: actorUserId },
  })
  return reload(shopIds, id, now)
}

/**
 * ตั้งผลของรายการที่ "ปิดแล้ว" (ปิดทันทีก่อน ผลใส่ทีหลังได้ — 00066 critique P1)
 * เขียนเฉพาะ outcome: ห้ามแตะ doneAt/doneByUserId (ผู้ปิดจริงต้องไม่ถูกทับโดยคนที่มาใส่ผล)
 */
export async function setFollowUpOutcome(
  shopIds: string[],
  id: string,
  outcome: FollowUpOutcome,
  now: Date = new Date(),
): Promise<FollowUpDto> {
  const { count } = await prisma.customerFollowUp.updateMany({
    where: { id, shopId: { in: shopIds }, status: 'DONE' },
    data: { outcome },
  })
  if (count === 0) {
    const row = await prisma.customerFollowUp.findFirst({ where: { id, shopId: { in: shopIds } }, select: { status: true } })
    throw row ? new FollowUpStateError() : new FollowUpNotFoundError()
  }
  return reload(shopIds, id, now)
}

export async function reopenFollowUp(
  shopIds: string[],
  id: string,
  now: Date = new Date(),
): Promise<FollowUpDto> {
  const row = await prisma.customerFollowUp.findFirst({ where: { id, shopId: { in: shopIds } } })
  if (!row) throw new FollowUpNotFoundError()
  if (row.status === 'OPEN') return (await toDtos([row], shopIds, now))[0]
  await prisma.customerFollowUp.updateMany({
    where: { id, shopId: { in: shopIds }, status: 'DONE' },
    data: {
      status: 'OPEN',
      outcome: null,
      doneAt: null,
      doneByUserId: null,
      // dueAt แก้ไม่ได้ตอน DONE จึงใช้ค่าที่อ่านมาได้ — เปิดกลับแล้วเลยเวลาเตือนไม่ยิงทันที
      remindedFor: initialRemindedFor(row, now),
    },
  })
  return reload(shopIds, id, now)
}

export type SnoozeInput = { preset: SnoozePreset } | { date: string; time: string | null }

export async function snoozeFollowUp(
  shopIds: string[],
  id: string,
  input: SnoozeInput,
  now: Date = new Date(),
): Promise<FollowUpDto> {
  const due =
    'preset' in input ? quickSnooze(input.preset, now) : resolveDue({ date: input.date, time: input.time }, now)
  const { count } = await prisma.customerFollowUp.updateMany({
    where: { id, shopId: { in: shopIds }, status: 'OPEN' },
    data: {
      dueAt: due.dueAt,
      allDay: due.allDay,
      snoozeCount: { increment: 1 },
      remindedFor: initialRemindedFor(due, now),
    },
  })
  if (count === 0) {
    const row = await prisma.customerFollowUp.findFirst({
      where: { id, shopId: { in: shopIds } },
      select: { status: true },
    })
    throw row ? new FollowUpStateError() : new FollowUpNotFoundError()
  }
  return reload(shopIds, id, now)
}

/** ลบ — ไม่พบ = NotFound (client ถือ 404 ของ DELETE เป็นสำเร็จ — E18) */
export async function deleteFollowUp(shopIds: string[], id: string): Promise<void> {
  const { count } = await prisma.customerFollowUp.deleteMany({
    where: { id, shopId: { in: shopIds } },
  })
  if (count === 0) throw new FollowUpNotFoundError()
}

// ---------- อ่าน: แผงห้อง / โปรไฟล์ลูกค้า ----------
export interface PanelResult {
  open: FollowUpDto[]
  recentDone: FollowUpDto[]
  openCount: number
  lateCount: number
  expanded: boolean
  truncated: boolean
  assignees: PersonDto[] | null
}

async function panelFor(
  shopId: string,
  conversationIds: string[],
  now: Date,
  homeConversationId?: string,
): Promise<PanelResult> {
  const [openRaw, doneRows] = await Promise.all([
    prisma.customerFollowUp.findMany({
      where: { shopId, conversationId: { in: conversationIds }, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
      take: LIST_MAX + 1,
    }),
    prisma.customerFollowUp.findMany({
      where: { shopId, conversationId: { in: conversationIds }, status: 'DONE' },
      orderBy: { doneAt: 'desc' },
      take: DONE_IN_PANEL,
    }),
  ])
  const truncated = openRaw.length > LIST_MAX
  const openRows = truncated ? openRaw.slice(0, LIST_MAX) : openRaw
  const shops = await loadShops([shopId])
  const [open, recentDone, assignees] = await Promise.all([
    toDtos(openRows, [shopId], now, homeConversationId, shops),
    toDtos(doneRows, [shopId], now, homeConversationId, shops),
    listAssignees([shopId]),
  ])
  const m = panelModel(openRows, now)
  return { open, recentDone, ...m, truncated, assignees }
}

/** แผงห้อง: รายการของ cluster "ลูกค้าเดียวกัน" · ห้องไม่ใช่ของร้านนี้ = NotFound */
export async function listForConversation(
  conversationId: string,
  shopId: string,
  now: Date = new Date(),
): Promise<PanelResult> {
  const ids = (await expandClusters([conversationId], shopId)).get(conversationId)
  if (!ids || ids.length === 0) throw new FollowUpNotFoundError()
  return panelFor(shopId, ids, now, conversationId)
}

/** โปรไฟล์ลูกค้า: seed = ห้องของประวัติออเดอร์ ∪ ห้องของ customerId (คีย์ c-) แล้วขยาย cluster */
export async function listForCustomerProfile(
  shopId: string,
  entry: { conversationIds: string[]; customerId?: string | null },
  now: Date = new Date(),
): Promise<PanelResult> {
  const seeds = new Set(entry.conversationIds)
  if (entry.customerId) {
    const rooms = await prisma.conversation.findMany({
      where: { shopId, externalContact: { customerId: entry.customerId } },
      select: { id: true },
    })
    for (const r of rooms) seeds.add(r.id)
  }
  const expanded = await expandClusters([...seeds], shopId)
  const ids = [...new Set([...expanded.values()].flat())]
  if (ids.length === 0) {
    return {
      open: [],
      recentDone: [],
      openCount: 0,
      lateCount: 0,
      expanded: false,
      truncated: false,
      assignees: await listAssignees([shopId]),
    }
  }
  return panelFor(shopId, ids, now)
}

// ---------- อ่าน: bubble "ของฉัน" (หลายร้านได้ — มติ Q5) ----------
export async function listMine(shopIds: string[], userId: string, now: Date = new Date()) {
  // pre-filter superset: ยังไม่เลย "สิ้นวันนี้ไทย" — TS (bubbleRows → bucketOf) ตรวจซ้ำเสมอ
  const endOfTodayThai = thaiTodayBounds(now).to
  const scanned = await prisma.customerFollowUp.findMany({
    where: {
      shopId: { in: shopIds },
      status: 'OPEN',
      assigneeUserId: userId,
      dueAt: { lt: endOfTodayThai },
    },
    orderBy: { dueAt: 'asc' },
    take: OPEN_SCAN_MAX,
  })
  const b = bubbleRows(scanned, now)
  const rows = await toDtos(b.rows, shopIds, now)
  const tone = bubbleModel({ total: b.total, lateCount: b.lateCount, isMobile: false, inThread: false }).tone
  return { rows, total: b.total, lateCount: b.lateCount, tone, href: '/follow-ups?mine=1' as const }
}

// ---------- อ่าน: กระดาน / ปฏิทิน ----------
export interface BoardParams {
  shopIds: string[]
  /** ผู้ใช้ที่ถามอยู่ (ใช้กับ mine) */
  userId: string
  mine?: boolean
  /** userId | 'unassigned' */
  assignee?: string
  tags?: string[]
  q?: string
}

interface Filters {
  assignee: (row: CustomerFollowUp) => boolean
  conversationIds: Set<string> | null
}

/** ตัวกรองผู้รับผิดชอบตัวเดียวของกระดานและปฏิทิน — "ยังไม่มีคนรับ" ตัดสินที่ isUnassigned เท่านั้น */
function assigneePredicate(p: BoardParams, shops: Map<string, ShopInfo>) {
  const want = p.mine ? p.userId : p.assignee
  if (!want) return () => true
  if (want === 'unassigned') {
    return (r: CustomerFollowUp) => isUnassigned(r, shops.get(r.shopId)?.memberIds ?? new Set())
  }
  return (r: CustomerFollowUp) => r.assigneeUserId === want
}

/** id ห้องที่ผ่านตัวกรองแท็ก (cluster) + ค้นชื่อ · null = ไม่มีตัวกรองกลุ่มนี้ */
async function conversationFilter(p: BoardParams): Promise<Set<string> | null> {
  let set: Set<string> | null = null
  if (p.tags && p.tags.length > 0) {
    set = await conversationIdsByClusterTags(p.tags, p.shopIds)
  }
  const q = p.q?.trim()
  if (q) {
    const hit = await prisma.conversation.findMany({
      where: {
        shopId: { in: p.shopIds },
        OR: [
          { alias: { contains: q, mode: 'insensitive' } },
          { externalContact: { name: { contains: q, mode: 'insensitive' } } },
          { buyer: { displayName: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: { id: true },
    })
    const byName = new Set(hit.map((h) => h.id))
    set = set ? new Set([...set].filter((id) => byName.has(id))) : byName
  }
  return set
}

async function makeFilters(p: BoardParams, shops: Map<string, ShopInfo>): Promise<Filters> {
  return { assignee: assigneePredicate(p, shops), conversationIds: await conversationFilter(p) }
}

/** ตัวกรองผู้รับผิดชอบในรูป where — เพื่อให้ take ตัดหลังกรอง (ไม่ใช่กรองหลังตัด) · "ยังไม่มีคนรับ" สร้างจาก memberIds ชุดเดียวกับ isUnassigned */
function assigneeWhere(p: BoardParams, shops: Map<string, ShopInfo>): Record<string, unknown> {
  const want = p.mine ? p.userId : p.assignee
  if (!want) return {}
  if (want !== 'unassigned') return { assigneeUserId: want }
  return {
    OR: p.shopIds.map((shopId) => ({
      shopId,
      OR: [{ assigneeUserId: null }, { assigneeUserId: { notIn: [...(shops.get(shopId)?.memberIds ?? [])] } }],
    })),
  }
}

const passes = (f: Filters, r: CustomerFollowUp) =>
  f.assignee(r) && (f.conversationIds === null || f.conversationIds.has(r.conversationId))

/** ตัวเลขกระดาน — จาก OPEN scan "ก่อน" ใช้ตัวกรอง (AC-ACT-26) ฟังก์ชันเดียวกับ countOpenAndLate ในแผง/ป้ายแถว */
export function tallyBoard(
  openRows: CustomerFollowUp[],
  doneCount: number,
  shops: Map<string, ShopInfo>,
  now: Date,
) {
  const counts = { late: 0, today: 0, week: 0, later: 0, done7d: doneCount, byUser: {} as Record<string, number>, unassigned: 0 }
  for (const r of openRows) {
    const b = bucketOf(r, now)
    if (b !== 'done') counts[b]++
    if (isUnassigned(r, shops.get(r.shopId)?.memberIds ?? new Set())) counts.unassigned++
    else if (r.assigneeUserId) counts.byUser[r.assigneeUserId] = (counts.byUser[r.assigneeUserId] ?? 0) + 1
  }
  return counts
}

export async function listBoard(p: BoardParams, now: Date = new Date()) {
  const since = new Date(now.getTime() - 7 * 24 * 3600_000)
  const [openRaw, doneRows, doneCount, shops] = await Promise.all([
    prisma.customerFollowUp.findMany({
      where: { shopId: { in: p.shopIds }, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
      take: OPEN_SCAN_MAX + 1,
    }),
    prisma.customerFollowUp.findMany({
      where: { shopId: { in: p.shopIds }, status: 'DONE', doneAt: { gte: since } },
      orderBy: { doneAt: 'desc' },
      take: LIST_MAX,
    }),
    prisma.customerFollowUp.count({
      where: { shopId: { in: p.shopIds }, status: 'DONE', doneAt: { gte: since } },
    }),
    loadShops(p.shopIds),
  ])
  const truncated = openRaw.length > OPEN_SCAN_MAX
  const openRows = truncated ? openRaw.slice(0, OPEN_SCAN_MAX) : openRaw
  const counts = tallyBoard(openRows, doneCount, shops, now)
  const f = await makeFilters(p, shops)
  const keptOpen = openRows.filter((r) => passes(f, r))
  const keptDone = doneRows.filter((r) => passes(f, r))
  const dtos = await toDtos([...keptOpen, ...keptDone], p.shopIds, now, undefined, shops)
  const columns: Record<'late' | 'today' | 'week' | 'later' | 'done7d', FollowUpDto[]> = {
    late: [],
    today: [],
    week: [],
    later: [],
    done7d: [],
  }
  for (const d of dtos) columns[d.bucket === 'done' ? 'done7d' : d.bucket].push(d)
  return { columns, counts, truncated, assignees: await listAssignees(p.shopIds) }
}

/** ตัวเลขกระดานอย่างเดียว (ไม่ขึ้นกับตัวกรองใด ๆ) — ใช้แสดงจำนวนค้างต่อคน */
export async function getBoardCounts(shopIds: string[], now: Date = new Date()) {
  const since = new Date(now.getTime() - 7 * 24 * 3600_000)
  const [openRows, doneCount, shops] = await Promise.all([
    prisma.customerFollowUp.findMany({
      where: { shopId: { in: shopIds }, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
      take: OPEN_SCAN_MAX,
    }),
    prisma.customerFollowUp.count({ where: { shopId: { in: shopIds }, status: 'DONE', doneAt: { gte: since } } }),
    loadShops(shopIds),
  ])
  return tallyBoard(openRows, doneCount, shops, now)
}

/** ปฏิทินรายเดือน (ทุกสถานะ) · month = YYYY-MM · เกิน CAL_MAX = คืน CAL_MAX + truncated (AC-ACT-23) */
export async function listCalendarMonth(p: BoardParams & { month: string }, now: Date = new Date()) {
  const mm = /^(\d{4})-(\d{2})$/.exec(p.month)
  if (!mm || Number(mm[2]) < 1 || Number(mm[2]) > 12) throw new FollowUpDueError()
  const y = Number(mm[1])
  const m0 = Number(mm[2]) - 1
  const from = thaiMidnightUtc(y, m0, 1)
  const to = thaiMidnightUtc(y, m0 + 1, 1)
  const shops = await loadShops(p.shopIds)
  const f = await makeFilters(p, shops)
  // ทุกตัวกรองอยู่ใน where เพื่อให้เพดาน CAL_MAX ตัดหลังกรอง — ของคนที่กรองอยู่จะไม่หายเพราะใบอื่นเต็มเพดานก่อน
  const raw = await prisma.customerFollowUp.findMany({
    where: {
      shopId: { in: p.shopIds },
      dueAt: { gte: from, lt: to },
      ...assigneeWhere(p, shops),
      ...(f.conversationIds ? { conversationId: { in: [...f.conversationIds] } } : {}),
    },
    orderBy: { dueAt: 'asc' },
    take: CAL_MAX + 1,
  })
  const truncated = raw.length > CAL_MAX
  const rows = truncated ? raw.slice(0, CAL_MAX) : raw
  // ตรวจซ้ำด้วยตัวกรอง TS (isUnassigned) — ต้องได้ผลเท่า where เสมอ
  const items = await toDtos(rows.filter((r) => passes(f, r)), p.shopIds, now, undefined, shops)
  return { items, truncated, month: p.month }
}

// ---------- ป้ายแถวรายการแชท + ตัวกรอง (ก้อนเดียว ไม่ N+1) ----------
export async function countsForConversations(
  conversationIds: string[],
  shopIds: string[],
  now: Date = new Date(),
): Promise<Map<string, { open: number; late: number }>> {
  const out = new Map<string, { open: number; late: number }>()
  for (const id of conversationIds) out.set(id, { open: 0, late: 0 })
  const rows = await openRowsByAnchor(conversationIds, shopIds)
  const by = new Map<string, { status: string; dueAt: Date; allDay: boolean }[]>()
  for (const r of rows) {
    const list = by.get(r.anchor) ?? []
    list.push(r)
    by.set(r.anchor, list)
  }
  for (const [anchor, list] of by) out.set(anchor, countOpenAndLate(list, now))
  return out
}

export async function enrichWithFollowUpCounts<T extends { id: string }>(
  items: T[],
  shopIds: string[],
  now: Date = new Date(),
): Promise<(T & { followUp: { open: number; late: number } })[]> {
  const counts = await countsForConversations(items.map((i) => i.id), shopIds, now)
  return items.map((i) => ({ ...i, followUp: counts.get(i.id) ?? { open: 0, late: 0 } }))
}

/** คีย์ cluster → สถานะ (late/upcoming/done) ทั้งขอบเขตร้านที่เห็น — ไม่ขึ้นกับตัวกรองอื่น */
async function stateByClusterKey(shopIds: string[], now: Date): Promise<Map<string, FilterState>> {
  const [openRows, doneRows] = await Promise.all([
    prisma.customerFollowUp.findMany({
      where: { shopId: { in: shopIds }, status: 'OPEN' },
      select: { conversationId: true, status: true, dueAt: true, allDay: true },
      take: OPEN_SCAN_MAX,
    }),
    prisma.customerFollowUp.findMany({
      where: { shopId: { in: shopIds }, status: 'DONE' },
      distinct: ['conversationId'],
      select: { conversationId: true },
      take: OPEN_SCAN_MAX,
    }),
  ])
  const keys = await clusterKeysOf(
    [...new Set([...openRows.map((r) => r.conversationId), ...doneRows.map((r) => r.conversationId)])],
    shopIds,
  )
  const agg = new Map<string, { open: number; late: number; done: number }>()
  const slot = (convId: string) => {
    const k = keys.get(convId)
    if (!k) return null
    const s = agg.get(k) ?? { open: 0, late: 0, done: 0 }
    agg.set(k, s)
    return s
  }
  for (const r of openRows) {
    const s = slot(r.conversationId)
    if (!s) continue
    s.open++
    if (isOverdue(r, now)) s.late++
  }
  for (const r of doneRows) {
    const s = slot(r.conversationId)
    if (s) s.done++
  }
  const out = new Map<string, FilterState>()
  for (const [k, s] of agg) {
    const st = filterStateOf(s)
    if (st) out.set(k, st)
  }
  return out
}

/** id ห้องที่ cluster ของมันอยู่ในสถานะที่เลือก (OR ในหมวด) — เอาไปต่อ `id IN (…)` ใน listConversationsForShops */
export async function conversationIdsByFollowUpState(
  shopIds: string[],
  states: FilterState[],
  now: Date = new Date(),
): Promise<string[]> {
  if (states.length === 0) return []
  const idx = await stateByClusterKey(shopIds, now)
  const want = [...idx].filter(([, s]) => states.includes(s)).map(([k]) => k)
  return (await conversationsByClusterKeys(want, shopIds)).map((r) => r.id)
}

/** ตัวเลขต่อค่าของตัวกรอง (นับห้อง) — นับทั้งขอบเขตร้านที่เห็น ไม่ขึ้นกับตัวกรองอื่น (Q-6) */
export async function followUpStateCounts(
  shopIds: string[],
  now: Date = new Date(),
): Promise<Record<FilterState, number>> {
  const idx = await stateByClusterKey(shopIds, now)
  const out: Record<FilterState, number> = { late: 0, upcoming: 0, done: 0 }
  for (const r of await conversationsByClusterKeys([...idx.keys()], shopIds)) {
    const s = idx.get(r.k)
    if (s) out[s]++
  }
  return out
}

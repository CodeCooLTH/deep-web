/**
 * line-report-bind.service.ts — โค้ดผูกกลุ่ม + ตัวนับกันเดา (00070 · SRS TFR-04/06/07 · SDS §3.2/§4.2)
 *
 * 🛑 ลำดับล็อกทุกเส้นทาง: แถว User ก่อน แล้วค่อยแถว Group (removeGroup ล็อกแค่ Group จึงไม่ deadlock)
 * 🛑 ห้ามดัก P2002 ตอนสร้างโค้ด — ใช้ createMany({skipDuplicates}) (insert-then-catch เขียน ERROR ลง log Postgres ทุกใบ)
 * ไม่เก็บ/ไม่ log โค้ดดิบ — เก็บเฉพาะ HMAC (bind-code.ts)
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { LineReportError } from '@/lib/line-report/errors'
import { addFriendUrl, isReportBotReady } from '@/lib/line-report/config'
import { BIND_CODE_TTL_MS, formatBindCode, generateBindCode, hashBindCode } from '@/lib/line-report/bind-code'
import { fetchGroupSummary } from '@/lib/line-report/line-client'
import type { LineReportRateKind } from '@/lib/line-report/types'
import { assertReportable, assertReportableIds, lockOwnedGroup } from '@/services/line-report-shop.service'
import { isOwnerPaidForReports } from '@/services/line-report-access.service'
import { MAX_GROUPS, revokeLiveCodes } from '@/services/line-report-group.service'

type Tx = Prisma.TransactionClient

export const BIND_ATTEMPT_LIMIT = 5
export const RATE_WINDOW_MS = 10 * 60 * 1000
const CODE_RETRIES = 5

export type BindOutcome = 'OK' | 'INVALID' | 'RATE_LIMITED' | 'ALREADY_BOUND_SELF' | 'NOT_PAID'

// ─── ตัวนับ ─────────────────────────────────────────────────────────────────────

export function countRecent(lineGroupId: string, kind: LineReportRateKind, now: Date, db: Tx | typeof prisma = prisma): Promise<number> {
  return db.lineReportRateEvent.count({
    where: { lineGroupId, kind, createdAt: { gte: new Date(now.getTime() - RATE_WINDOW_MS) } },
  })
}

/**
 * บันทึก + นับในก้อนเดียวใต้ advisory lock ต่อ lineGroupId (security M-2) — ไม่ล็อก = คำขอขนานอ่านนับก่อนใครเขียน
 * แล้วผ่านด่านเกินเพดาน · คืนจำนวนครั้งรวมตัวนี้ (= นับเดิม + 1)
 * เกินเพดาน `cap` แล้วไม่ insert อีก (L-1: ไม่ให้ผู้โจมตีบวมตาราง) — ค่าที่คืนยัง > cap เสมอ
 * createdAt = `now` ของผู้เรียก (ไม่ใช่ DB clock) เพื่อให้เทสสลับนาฬิกาได้
 */
export function recordAndCountRate(lineGroupId: string, kind: LineReportRateKind, now: Date, cap: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lineGroupId}))`
    const before = await countRecent(lineGroupId, kind, now, tx)
    if (before < cap) await tx.lineReportRateEvent.create({ data: { lineGroupId, kind, createdAt: now } })
    return before + 1
  })
}

// ─── สร้าง/ออกโค้ดใหม่ ──────────────────────────────────────────────────────────

const lockUser = (tx: Tx, userId: string) => tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`

/** revoke โค้ดสดของเจ้าของแล้วออกโค้ดใหม่ (ต้องอยู่ใน tx ที่ล็อก User แล้ว) — คืนโค้ดดิบครั้งเดียว */
async function issueCode(tx: Tx, ownerId: string, groupId: string, now: Date): Promise<{ code: string; expiresAt: Date }> {
  await revokeLiveCodes(tx, { ownerId }, now)
  const expiresAt = new Date(now.getTime() + BIND_CODE_TTL_MS)
  for (let i = 0; i < CODE_RETRIES; i++) {
    const code = generateBindCode()
    // partial unique (codeHash live) ชนกับโค้ดสดของเจ้าของอื่น → skipDuplicates ได้ count 0 → สุ่มใหม่
    const r = await tx.lineReportBindCode.createMany({ data: [{ ownerId, groupId, codeHash: hashBindCode(code), expiresAt }], skipDuplicates: true })
    if (r.count === 1) return { code, expiresAt }
  }
  throw new LineReportError('INTERNAL')
}

export async function createBindCode(ownerId: string, input: { shopIds: string[] }) {
  if (!isReportBotReady()) throw new LineReportError('BOT_NOT_CONFIGURED')
  // service เป็นด่านเอง ไม่พึ่งแค่ route (security M-3)
  if (!(await isOwnerPaidForReports(ownerId))) throw new LineReportError('PACKAGE_REQUIRED')
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, ownerId)
    await assertReportable(ownerId, input.shopIds, tx)
    const count = await tx.lineReportGroup.count({ where: { ownerId, status: { not: 'REMOVED' } } })
    if (count >= MAX_GROUPS) throw new LineReportError('GROUP_LIMIT_REACHED')
    const g = await tx.lineReportGroup.create({
      data: { ownerId, status: 'PENDING', shops: { create: input.shopIds.map((shopId) => ({ shopId })) } },
      select: { id: true },
    })
    const { code, expiresAt } = await issueCode(tx, ownerId, g.id, now)
    return { groupId: g.id, code: formatBindCode(code), expiresAt: expiresAt.toISOString(), addFriendUrl: addFriendUrl(), groupCount: count + 1 }
  })
}

/** PENDING = ออกโค้ดใหม่ · INACTIVE → PENDING คงค่าตั้ง/ร้าน/lineGroupId เดิม (ผูกใหม่/ย้ายกลุ่ม) · ACTIVE = INVALID_STATE */
export async function reissueBindCode(ownerId: string, groupId: string) {
  if (!isReportBotReady()) throw new LineReportError('BOT_NOT_CONFIGURED')
  if (!(await isOwnerPaidForReports(ownerId))) throw new LineReportError('PACKAGE_REQUIRED')
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, ownerId)
    await lockOwnedGroup(tx, ownerId, groupId) // 404 ถ้าไม่ใช่ของตน/REMOVED
    const g = await tx.lineReportGroup.findUniqueOrThrow({
      where: { id: groupId },
      select: { status: true, shops: { select: { shopId: true } } },
    })
    if (g.status === 'ACTIVE') throw new LineReportError('INVALID_STATE')
    const shopIds = g.shops.map((s) => s.shopId)
    try {
      if (shopIds.length === 0) throw new LineReportError('SHOP_NOT_ALLOWED')
      await assertReportableIds(ownerId, shopIds, tx)
    } catch (e) {
      throw e instanceof LineReportError && e.code === 'SHOP_NOT_ALLOWED' ? new LineReportError('SHOPS_INVALID') : e
    }
    if (g.status === 'INACTIVE') await tx.lineReportGroup.update({ where: { id: groupId }, data: { status: 'PENDING' } })
    const { code, expiresAt } = await issueCode(tx, ownerId, groupId, now)
    return { groupId, status: 'PENDING' as const, code: formatBindCode(code), expiresAt: expiresAt.toISOString(), addFriendUrl: addFriendUrl() }
  })
}

// ─── ใช้โค้ดในกลุ่ม LINE (TFR-06) ───────────────────────────────────────────────

/** ผลที่ต้อง rollback ทั้ง tx (รวมการเผาโค้ด) — ใช้ throw เพื่อให้ $transaction ย้อนให้ */
class Rollback extends Error {
  constructor(readonly outcome: BindOutcome) {
    super(outcome)
  }
}

const isUniqueViolation = (e: unknown) => {
  const x = e as { code?: string; meta?: { code?: string } } | null
  return x?.code === 'P2002' || x?.meta?.code === '23505'
}

export async function consumeBindCode(i: {
  lineGroupId: string
  code: string
  now: Date
}): Promise<{ outcome: BindOutcome; groupName?: string; shopNames?: string[] }> {
  const { lineGroupId, code, now } = i

  // 1) ตัวนับก่อนทุกอย่าง — นับตัวเองด้วย; เกิน 5 = ไม่ตรวจโค้ด (แม้โค้ดจะถูก)
  if ((await recordAndCountRate(lineGroupId, 'BIND_ATTEMPT', now, BIND_ATTEMPT_LIMIT)) > BIND_ATTEMPT_LIMIT) return { outcome: 'RATE_LIMITED' }

  // 2) หาโค้ดสด — ผิด/หมดอายุ/ใช้แล้ว/ถูกเพิกถอน เหมือนกันหมด
  const live = await prisma.lineReportBindCode.findFirst({
    where: { codeHash: hashBindCode(code), usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: { id: true, ownerId: true, groupId: true, group: { select: { status: true } } },
  })
  if (!live || live.group.status !== 'PENDING') return { outcome: 'INVALID' }

  // 3) กลุ่ม LINE นี้ผูก ACTIVE อยู่แล้ว — ไม่เผาโค้ด ไม่เปิดเผยเจ้าของ
  const bound = await prisma.lineReportGroup.findFirst({ where: { lineGroupId, status: 'ACTIVE' }, select: { ownerId: true } })
  // 🛑 M-1: ต่างเจ้าของ = ผลเดียวกับ "โค้ดผิด" (INVALID) — ถ้าตอบ "ผูกอยู่แล้ว" ผู้โจมตีใช้เป็น oracle ว่าโค้ดนี้มีจริง
  // ไม่เผาโค้ดทั้งสองกรณี · SELF บอกได้เพราะผู้พิมพ์ถือโค้ดของเจ้าของเดียวกับกลุ่มอยู่แล้ว
  if (bound) return { outcome: bound.ownerId === live.ownerId ? 'ALREADY_BOUND_SELF' : 'INVALID' }

  // 4) ตรวจซ้ำ ณ ตอนใช้ (ข้อความผิดเหมือนข้อ 2 — ไม่รั่วเหตุ)
  if (!(await isOwnerPaidForReports(live.ownerId))) return { outcome: 'NOT_PAID' }
  if (!(await bindPreconditionsHold(prisma, live.ownerId, live.groupId))) return { outcome: 'INVALID' }

  // 5) ชื่อกลุ่ม — นอก tx; ล้ม/ไม่เจอ = ชื่อว่าง (ผูกต่อได้)
  const groupName = await fetchGroupSummary(lineGroupId).then((r) => r?.groupName ?? '', () => '')

  // 6–7) tx: User → Group → เผาโค้ด → conditional update
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, live.ownerId)
      const rows = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "LineReportGroup" WHERE "id" = ${live.groupId} FOR UPDATE`
      if (rows[0]?.status !== 'PENDING') throw new Rollback('INVALID') // ถูกลบ/เปลี่ยนสถานะระหว่างทาง
      if (!(await bindPreconditionsHold(tx, live.ownerId, live.groupId))) throw new Rollback('INVALID')
      const burned = await tx.lineReportBindCode.updateMany({
        where: { id: live.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      })
      if (burned.count !== 1) throw new Rollback('INVALID')
      let updated: number
      try {
        updated = await tx.$executeRaw`
          UPDATE "LineReportGroup"
          SET "status" = 'ACTIVE', "lineGroupId" = ${lineGroupId}, "groupName" = ${groupName}, "boundAt" = ${now}, "leftAt" = NULL,
              "alertKind" = NULL, "alertAt" = NULL, "alertAckAt" = NULL, "finalNoticeSentAt" = NULL, "updatedAt" = ${now}
          WHERE "id" = ${live.groupId} AND "status" = 'PENDING'
            AND NOT EXISTS (SELECT 1 FROM "LineReportGroup" o WHERE o."lineGroupId" = ${lineGroupId} AND o."status" = 'ACTIVE')`
      } catch (e) {
        if (isUniqueViolation(e)) throw new Rollback('INVALID') // ตาข่ายชั้นสอง (partial unique)
        throw e
      }
      if (updated === 0) throw new Rollback('INVALID') // แข่งกับเจ้าของอื่น: ผลเดียวกับโค้ดผิด (M-1)
      // ไม่แตะ dailyEnabled/monthlyEnabled/dailyTimes/ร้าน (AC-07-4)
      const shops = await tx.lineReportGroupShop.findMany({
        where: { groupId: live.groupId },
        select: { shop: { select: { shopName: true } } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      })
      return { outcome: 'OK' as const, groupName, shopNames: shops.map((s) => s.shop.shopName) }
    })
  } catch (e) {
    if (e instanceof Rollback) return { outcome: e.outcome }
    throw e
  }
}

/** ทุกร้านของกลุ่มยัง userId=owner ∧ ¬deleted ∧ ¬purged (ร้านถูกล็อกตอนนี้ยังผูกได้ — ส่งจริงตัดตอนรายงาน) · ไม่มีร้านเลย = ไม่ผ่าน · นับกลุ่ม ≤ 10 */
async function bindPreconditionsHold(db: Tx | typeof prisma, ownerId: string, groupId: string): Promise<boolean> {
  const links = await db.lineReportGroupShop.findMany({ where: { groupId }, select: { shopId: true } })
  if (links.length === 0) return false
  const ok = await db.shop.count({
    where: { id: { in: links.map((l) => l.shopId) }, userId: ownerId, deletedAt: null, purgedAt: null },
  })
  if (ok !== links.length) return false
  return (await db.lineReportGroup.count({ where: { ownerId, status: { not: 'REMOVED' } } })) <= MAX_GROUPS
}

/**
 * line-report-group.service.ts — กลุ่มรายงาน LINE: รายการ/รายละเอียด/ตั้งค่า/ลบ/แจ้งเตือน (00068 · SRS TFR-07/09/11/22 · API §4.1/4.4/4.5/4.8/4.9)
 *
 * 🛑 ทุก query ที่รับ id จากภายนอก scope `ownerId` ตั้งแต่ query แรก → ไม่ใช่ของตน/REMOVED = GROUP_NOT_FOUND (404 ไม่ใช่ 403)
 * service นี้ไม่เรียก LINE — `removeGroup` คืน lineGroupId ให้ผู้เรียกทำ leave best-effort หลัง commit
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { shiftIsoDate, thaiTodayBounds, todayThaiIsoDate } from '@/lib/date-range'
import { LineReportError, type InvalidSettingsRule } from '@/lib/line-report/errors'
import { isReportBotReady } from '@/lib/line-report/config'
import { nextSendAt } from '@/lib/line-report/schedule'
import { cycleContaining } from '@/lib/line-report/cycle'
import { describeReason, MISSED_STATUS_LABEL } from '@/lib/line-report/delivery-reasons'
import type { LineReportAlertKind } from '@/lib/line-report/types'
import type { UpdateSettingsInput } from '@/lib/line-report/validations'
import { isOwnerPaidForReports } from '@/services/line-report-access.service'
import { lockOwnedGroup, readGroupShops, type GroupShopDto } from '@/services/line-report-shop.service'

type Db = Prisma.TransactionClient
export const MAX_GROUPS = 10
export const TEST_LIMIT_PER_DAY = 5

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const alertDto = (g: { alertKind: LineReportAlertKind | null; alertAt: Date | null; alertAckAt: Date | null }) =>
  g.alertKind ? { kind: g.alertKind, at: iso(g.alertAt), acked: g.alertAckAt !== null } : null
const reasonFields = (status: string, reason: string | null) => ({
  reason,
  reasonLabel: reason ? describeReason(reason) : status === 'MISSED' ? MISSED_STATUS_LABEL : null,
})

// ─── รายการ (API §4.1) ──────────────────────────────────────────────────────────

export async function listGroups(ownerId: string) {
  const now = new Date()
  const rows = await prisma.lineReportGroup.findMany({
    where: { ownerId, status: { not: 'REMOVED' } },
    select: {
      id: true, groupName: true, status: true, dailyEnabled: true, dailyTimes: true, monthlyEnabled: true, cutoffDay: true,
      alertKind: true, alertAt: true, alertAckAt: true, boundAt: true, leftAt: true, createdAt: true,
      shops: { select: { shop: { select: { id: true, shopName: true, vertical: true } } }, orderBy: { createdAt: 'asc' } },
      bindCodes: { where: { usedAt: null, revokedAt: null, expiresAt: { gt: now } }, select: { expiresAt: true }, take: 1 },
      deliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, sentAt: true, kind: true, status: true, reason: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  // paused คำนวณสดต่อเจ้าของ (ไม่ใช่ค่าที่เก็บ) — fail-closed ผ่าน isOwnerPaidForReports
  const paused = !(await isOwnerPaidForReports(ownerId))
  const rank = (g: { status: string; alertKind: unknown; alertAckAt: Date | null }) =>
    g.status === 'INACTIVE' || (g.alertKind && !g.alertAckAt) ? 0 : g.status === 'PENDING' ? 1 : 2
  const groups = rows
    .map((g) => {
      const verticals = new Set(g.shops.map((s) => s.shop.vertical))
      const next = g.status === 'ACTIVE' && !paused ? nextSendAt(g, now) : null
      const last = g.deliveries[0]
      return {
        _rank: rank(g),
        id: g.id,
        groupName: g.groupName,
        status: g.status as 'PENDING' | 'ACTIVE' | 'INACTIVE',
        paused,
        shopCount: g.shops.length,
        mixedVertical: verticals.size > 1,
        shops: g.shops.slice(0, 2).map((s) => ({ id: s.shop.id, name: s.shop.shopName, vertical: s.shop.vertical })),
        schedule: { dailyEnabled: g.dailyEnabled, dailyTimes: g.dailyTimes, monthlyEnabled: g.monthlyEnabled, cutoffDay: g.cutoffDay },
        nextSendAt: next === null ? null : new Date(next).toISOString(),
        lastDelivery: last
          ? { at: (last.sentAt ?? last.createdAt).toISOString(), kind: last.kind, status: last.status, ...reasonFields(last.status, last.reason) }
          : null,
        alert: alertDto(g),
        bind: { codeExpiresAt: iso(g.bindCodes[0]?.expiresAt) },
        boundAt: iso(g.boundAt),
        leftAt: iso(g.leftAt),
      }
    })
    .sort((a, b) => a._rank - b._rank) // sort เสถียร: ภายในชั้นเดียวกันคงลำดับ createdAt desc
    .map(({ _rank, ...g }) => g)
  const botReady = isReportBotReady()
  return {
    groups,
    meta: {
      count: groups.length,
      limit: MAX_GROUPS,
      canCreate: groups.length < MAX_GROUPS && botReady && !paused,
      paused,
      botReady,
      unackedAlerts: rows.filter((g) => g.alertKind && !g.alertAckAt).length,
    },
  }
}

// ─── รายละเอียด (API §4.4) ──────────────────────────────────────────────────────

export async function getGroupDetail(ownerId: string, groupId: string, db: Db | typeof prisma = prisma) {
  const now = new Date()
  // 🛑 ไม่ select pendingPayload — ทั้งตรงนี้และใน deliveries (payload มีตัวเลขเต็มของกลุ่ม ไม่ควรออกนอก service)
  const g = await db.lineReportGroup.findFirst({
    where: { id: groupId, ownerId, status: { not: 'REMOVED' } },
    select: {
      id: true, status: true, groupName: true, boundAt: true, leftAt: true,
      dailyEnabled: true, dailyTimes: true, monthlyEnabled: true, cutoffDay: true,
      showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: true,
      skipWhenNoOrders: true, attachCycleToDaily: true, profitEnabledAt: true,
      alertKind: true, alertAt: true, alertAckAt: true,
      deliveries: {
        orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, createdAt: true, sentAt: true, kind: true, status: true, reason: true, pushMessageCount: true },
      },
    },
  })
  if (!g) throw new LineReportError('GROUP_NOT_FOUND')

  const { from, to } = thaiTodayBounds(now)
  const [shops, liveCode, usedToday, paused] = await Promise.all([
    readGroupShops(db, g.id),
    db.lineReportBindCode.findFirst({ where: { groupId: g.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, select: { expiresAt: true } }),
    // นับวันไทย + สถานะที่กินโควตา (CLAIMED/RETRY_PENDING/SENT) ตรงกับ sendTest
    db.lineReportDelivery.count({
      where: { groupId: g.id, kind: 'TEST', status: { in: ['CLAIMED', 'RETRY_PENDING', 'SENT'] }, createdAt: { gte: from, lt: to } },
    }),
    isOwnerPaidForReports(ownerId).then((p) => !p),
  ])
  const next = g.status === 'ACTIVE' && !paused ? nextSendAt(g, now) : null
  const cycle = g.monthlyEnabled
    ? (() => {
        const c = cycleContaining(todayThaiIsoDate(now), g.cutoffDay)
        return { ...c, nextFireDate: shiftIsoDate(c.endIso, 1) }
      })()
    : null
  return {
    group: {
      id: g.id, status: g.status as 'PENDING' | 'ACTIVE' | 'INACTIVE', groupName: g.groupName, paused,
      boundAt: iso(g.boundAt), leftAt: iso(g.leftAt),
      settings: {
        dailyEnabled: g.dailyEnabled, dailyTimes: g.dailyTimes, monthlyEnabled: g.monthlyEnabled, cutoffDay: g.cutoffDay,
        showOrders: g.showOrders, showSales: g.showSales, showCancelled: g.showCancelled, showTopProducts: g.showTopProducts,
        showProfit: g.showProfit, skipWhenNoOrders: g.skipWhenNoOrders, attachCycleToDaily: g.attachCycleToDaily,
        profitEnabledAt: iso(g.profitEnabledAt),
      },
      // API §4.4: state มีแค่ OK|LOCKED|DELETED — PURGED แสดงเป็น DELETED
      shops: shops.map((s) => ({ ...s, state: s.state === 'PURGED' ? ('DELETED' as const) : s.state })),
      nextSendAt: next === null ? null : new Date(next).toISOString(),
      cycle,
      bind: { hasLiveCode: liveCode !== null, expiresAt: iso(liveCode?.expiresAt) },
      alert: alertDto(g),
      test: { limit: TEST_LIMIT_PER_DAY, usedToday, remaining: Math.max(0, TEST_LIMIT_PER_DAY - usedToday) },
      deliveries: g.deliveries.map((d) => ({
        id: d.id, at: (d.sentAt ?? d.createdAt).toISOString(), kind: d.kind, status: d.status,
        ...reasonFields(d.status, d.reason), pushMessageCount: d.pushMessageCount,
      })),
    },
  }
}
export type GroupDetailDto = Awaited<ReturnType<typeof getGroupDetail>>['group']
export type { GroupShopDto }

// ─── ตั้งค่า (API §4.5) ─────────────────────────────────────────────────────────

type SettingsState = {
  dailyEnabled: boolean; dailyTimes: number[]; monthlyEnabled: boolean; cutoffDay: number | null
  showOrders: boolean; showSales: boolean; showCancelled: boolean; showTopProducts: boolean; showProfit: boolean
  skipWhenNoOrders: boolean; attachCycleToDaily: boolean; profitEnabledAt: Date | null
}

const invalid = (rule: InvalidSettingsRule) => new LineReportError('INVALID_SETTINGS', { rule })

/**
 * รวม patch เข้า state เดิมแล้วตรวจกฎข้ามฟิลด์บน state รวม (pure — เทสได้ไม่แตะ DB)
 * ไม่ผ่าน → INVALID_SETTINGS{rule} / PROFIT_CONFIRM_REQUIRED
 */
export function mergeSettings(current: SettingsState, patch: UpdateSettingsInput, now: Date): SettingsState {
  const { confirmProfit, ...fields } = patch
  const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
  const next: SettingsState = { ...current, ...defined }
  next.dailyTimes = [...new Set(next.dailyTimes)].sort((a, b) => a - b)

  if (next.showProfit && !current.showProfit && confirmProfit !== true) throw new LineReportError('PROFIT_CONFIRM_REQUIRED')
  // ปิดรายเดือน → ส่วนแนบรอบในรายวันหมดความหมาย ล้างเงียบ ๆ (ไม่ error)
  if (!next.monthlyEnabled) next.attachCycleToDaily = false
  if ((next.dailyEnabled || next.monthlyEnabled) && next.dailyTimes.length < 1) throw invalid('NEEDS_TIME')
  if (!(next.showOrders || next.showSales || next.showCancelled || next.showTopProducts || next.showProfit)) throw invalid('METRIC_REQUIRED')

  next.profitEnabledAt = !next.showProfit ? null : current.showProfit ? current.profitEnabledAt : now
  return next
}

export async function updateSettings(ownerId: string, groupId: string, patch: UpdateSettingsInput): Promise<GroupDetailDto> {
  await prisma.$transaction(async (tx) => {
    await lockOwnedGroup(tx, ownerId, groupId) // 404 + กัน autosave ซ้อน (state รวมต้องอ่านหลังล็อก)
    const cur = await tx.lineReportGroup.findFirstOrThrow({
      where: { id: groupId, ownerId },
      select: {
        dailyEnabled: true, dailyTimes: true, monthlyEnabled: true, cutoffDay: true, showOrders: true, showSales: true,
        showCancelled: true, showTopProducts: true, showProfit: true, skipWhenNoOrders: true, attachCycleToDaily: true, profitEnabledAt: true,
      },
    })
    const next = mergeSettings(cur, patch, new Date())
    await tx.lineReportGroup.update({ where: { id: groupId }, data: next })
  })
  return (await getGroupDetail(ownerId, groupId)).group
}

// ─── ลบ (API §4.8 · TFR-07) ─────────────────────────────────────────────────────

/** เพิกถอนโค้ดที่ยังใช้ได้ทั้งหมดของกลุ่ม/เจ้าของ */
export async function revokeLiveCodes(tx: Db, where: { groupId?: string; ownerId?: string }, now = new Date()): Promise<number> {
  const r = await tx.lineReportBindCode.updateMany({ where: { ...where, usedAt: null, revokedAt: null }, data: { revokedAt: now } })
  return r.count
}

/**
 * ยกเลิกการผูก → REMOVED (L1 — ไม่ต้องมีแพ็กเกจ) · log ไม่ถูกลบ (Delivery = Restrict)
 * คืน `leaveLineGroupId` ให้ผู้เรียกสั่งบอทออกจากกลุ่มหลัง commit (best-effort) — เฉพาะกลุ่มที่เคย ACTIVE;
 * INACTIVE = บอทออกไปแล้ว, PENDING = ไม่เคยเข้า ⇒ null
 */
export async function removeGroup(ownerId: string, groupId: string): Promise<{ removed: true; leaveLineGroupId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const g = await tx.lineReportGroup.findFirst({
      where: { id: groupId, ownerId, status: { not: 'REMOVED' } },
      select: { status: true, lineGroupId: true },
    })
    if (!g) throw new LineReportError('GROUP_NOT_FOUND')
    const now = new Date()
    const upd = await tx.lineReportGroup.updateMany({
      where: { id: groupId, ownerId, status: { not: 'REMOVED' } },
      data: { status: 'REMOVED', removedAt: now },
    })
    if (upd.count === 0) throw new LineReportError('GROUP_NOT_FOUND') // แข่งกับคำขอลบซ้อน
    await revokeLiveCodes(tx, { groupId }, now)
    return { removed: true as const, leaveLineGroupId: g.status === 'ACTIVE' ? g.lineGroupId : null }
  })
}

// ─── แจ้งเตือน (TFR-22) ─────────────────────────────────────────────────────────

/** เหตุเดิมที่ตั้งอยู่แล้ว = no-op (ไม่แจ้งซ้ำแม้เจ้าของรับทราบแล้ว) · คืน true เมื่อตั้งใหม่จริง */
export async function raiseAlert(groupId: string, kind: LineReportAlertKind, db: Db | typeof prisma = prisma): Promise<boolean> {
  const r = await db.lineReportGroup.updateMany({
    // `not: kind` ไม่จับ NULL ใน SQL ⇒ ต้องมีแขน alertKind:null แยก
    where: { id: groupId, status: { not: 'REMOVED' }, OR: [{ alertKind: null }, { alertKind: { not: kind } }] },
    data: { alertKind: kind, alertAt: new Date(), alertAckAt: null },
  })
  return r.count > 0
}

/** idempotent — ไม่มีแจ้งเตือน/รับทราบแล้ว = no-op · alertKind คงเดิมจนเหตุถูกแก้ */
export async function ackAlert(ownerId: string, groupId: string): Promise<{ acked: true }> {
  const g = await prisma.lineReportGroup.findFirst({ where: { id: groupId, ownerId, status: { not: 'REMOVED' } }, select: { id: true } })
  if (!g) throw new LineReportError('GROUP_NOT_FOUND')
  await prisma.lineReportGroup.updateMany({
    where: { id: groupId, ownerId, alertKind: { not: null }, alertAckAt: null },
    data: { alertAckAt: new Date() },
  })
  return { acked: true }
}

/** เหตุถูกแก้แล้ว → ล้างทั้งสามฟิลด์ · `kinds` ระบุเมื่อแก้ได้เฉพาะบางเหตุ (ส่งสำเร็จ resolve SEND_FAILED/NO_SENDABLE_SHOPS ไม่ใช่ BOT_REMOVED) */
export async function resolveAlert(groupId: string, kinds?: LineReportAlertKind[], db: Db | typeof prisma = prisma): Promise<boolean> {
  const r = await db.lineReportGroup.updateMany({
    where: { id: groupId, alertKind: kinds ? { in: kinds } : { not: null } },
    data: { alertKind: null, alertAt: null, alertAckAt: null },
  })
  return r.count > 0
}

/**
 * บอทออกจากกลุ่ม (event leave / push 400 + summary 404) — ACTIVE → INACTIVE + BOT_REMOVED ในคำขอเดียว
 * ไม่เจอ/ไม่ใช่ ACTIVE (รวม REMOVED) = false เมินเงียบ (AC-07-5)
 */
export async function markInactive(lineGroupId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // partial unique index รับประกัน ACTIVE ได้ 1 แถวต่อ lineGroupId
    const g = await tx.lineReportGroup.findFirst({ where: { lineGroupId, status: 'ACTIVE' }, select: { id: true } })
    if (!g) return false
    const r = await tx.lineReportGroup.updateMany({ where: { id: g.id, status: 'ACTIVE' }, data: { status: 'INACTIVE', leftAt: new Date() } })
    if (r.count === 0) return false
    await raiseAlert(g.id, 'BOT_REMOVED', tx)
    return true
  })
}

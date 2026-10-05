/**
 * line-report-group.service.ts — กลุ่มรายงาน LINE: รายการ/รายละเอียด/ตั้งค่า/ลบ/แจ้งเตือน (00070 · SRS TFR-07/09/11/22 · API §4.1/4.4/4.5/4.8/4.9)
 *
 * 🛑 ทุก query ที่รับ id จากภายนอก scope `ownerId` ตั้งแต่ query แรก → ไม่ใช่ของตน/REMOVED = GROUP_NOT_FOUND (404 ไม่ใช่ 403)
 * service นี้ไม่เรียก LINE — `removeGroup` คืน lineGroupId ให้ผู้เรียกทำ leave best-effort หลัง commit
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { shiftIsoDate, todayThaiIsoDate } from '@/lib/date-range'
import { LineReportError, type InvalidSettingsRule } from '@/lib/line-report/errors'
import { isReportBotReady } from '@/lib/line-report/config'
import { resolveReportConfig } from '@/lib/line-report/report-config'
import { deriveFlags, type TemplateV1 } from '@/lib/line-report/template'
import { measureTemplate, type TemplateMeasure } from '@/lib/line-report/template-size'
import { nextSendAt } from '@/lib/line-report/schedule'
import { cycleContaining, nextMonthlyFireAt } from '@/lib/line-report/cycle'
import { describeReason, MISSED_STATUS_LABEL } from '@/lib/line-report/delivery-reasons'
import type { LineReportAlertKind } from '@/lib/line-report/types'
import * as v from 'valibot'
import { CutoffDaySchema, DailyTimesSchema, validateTemplate, type UpdateSettingsInput } from '@/lib/line-report/validations'
import { isOwnerPaidForReports } from '@/services/line-report-access.service'
import { testQuotaWhere } from '@/services/line-report-delivery.service'
import { lockOwnedGroup, readGroupShops, type GroupShopDto } from '@/services/line-report-shop.service'

type Db = Prisma.TransactionClient

/** รอบส่งถัดไป = ที่เร็วกว่าระหว่างรายวันกับรายเดือน (กลุ่มที่เปิดแต่รายเดือนต้องไม่ได้ null) */
type ScheduleFields = { dailyEnabled: boolean; dailyTimes: readonly number[]; monthlyEnabled: boolean; cutoffDay: number | null }
export function nextSendAtOf(g: ScheduleFields, now: Date): number | null {
  const c = [nextSendAt(g, now), nextMonthlyFireAt(g, now)].filter((x): x is number => x !== null)
  return c.length ? Math.min(...c) : null
}
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
      const next = g.status === 'ACTIVE' && !paused ? nextSendAtOf(g, now) : null
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
      template: true, templateVersion: true,
      alertKind: true, alertAt: true, alertAckAt: true,
      deliveries: {
        orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, createdAt: true, sentAt: true, kind: true, status: true, reason: true, pushMessageCount: true, summary: true },
      },
    },
  })
  if (!g) throw new LineReportError('GROUP_NOT_FOUND')

  const [shops, liveCode, usedToday, paused] = await Promise.all([
    readGroupShops(db, g.id, ownerId),
    db.lineReportBindCode.findFirst({ where: { groupId: g.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, select: { expiresAt: true } }),
    // predicate เดียวกับ sendTest (testQuotaWhere) — ทุกแถว TEST ของวันไทยนี้
    db.lineReportDelivery.count({ where: testQuotaWhere(g.id, now) }),
    isOwnerPaidForReports(ownerId).then((p) => !p),
  ])
  const next = g.status === 'ACTIVE' && !paused ? nextSendAtOf(g, now) : null
  const cfg = resolveReportConfig(g) // เทมเพลตเสียในฐาน → แบบมาตรฐาน (template ที่คืนเป็น null ด้วย)
  const storedTemplate = g.template === null ? null : validateTemplate(g.template).ok ? (g.template as unknown as TemplateV1) : null
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
      template: storedTemplate, templateVersion: g.templateVersion, effectiveTemplate: cfg.template,
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
        ...reasonFields(d.status, d.reason), pushMessageCount: d.pushMessageCount, summary: d.summary,
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
  const defined = Object.fromEntries(Object.entries(fields).filter(([, val]) => val !== undefined))
  const next: SettingsState = { ...current, ...defined }
  next.dailyTimes = [...new Set(next.dailyTimes)].sort((a, b) => a - b)
  // ตรวจซ้ำที่ service (ไม่พึ่งแค่ route) — ไม่งั้นค่านอกชุดไปชน CHECK ของ DB แล้วได้ raw error แทน VALIDATION
  if (!v.safeParse(DailyTimesSchema, next.dailyTimes).success || !v.safeParse(CutoffDaySchema, next.cutoffDay).success) {
    throw new LineReportError('VALIDATION')
  }

  if (next.showProfit && !current.showProfit && confirmProfit !== true) throw new LineReportError('PROFIT_CONFIRM_REQUIRED')
  // ปิดรายเดือน → ส่วนแนบรอบในรายวันหมดความหมาย ล้างเงียบ ๆ (ไม่ error)
  if (!next.monthlyEnabled) next.attachCycleToDaily = false
  if ((next.dailyEnabled || next.monthlyEnabled) && next.dailyTimes.length < 1) throw invalid('NEEDS_TIME')
  if (!(next.showOrders || next.showSales || next.showCancelled || next.showTopProducts || next.showProfit)) throw invalid('METRIC_REQUIRED')

  next.profitEnabledAt = !next.showProfit ? null : current.showProfit ? current.profitEnabledAt : now
  return next
}

export async function updateSettings(ownerId: string, groupId: string, patch: UpdateSettingsInput): Promise<GroupDetailDto> {
  // service เป็นด่านเอง ไม่พึ่งแค่ route (security LOW-3)
  if (!(await isOwnerPaidForReports(ownerId))) throw new LineReportError('PACKAGE_REQUIRED')
  await prisma.$transaction(async (tx) => {
    await lockOwnedGroup(tx, ownerId, groupId) // 404 + กัน autosave ซ้อน (state รวมต้องอ่านหลังล็อก)
    const cur = await tx.lineReportGroup.findFirstOrThrow({
      where: { id: groupId, ownerId },
      select: {
        dailyEnabled: true, dailyTimes: true, monthlyEnabled: true, cutoffDay: true, showOrders: true, showSales: true,
        showCancelled: true, showTopProducts: true, showProfit: true, skipWhenNoOrders: true, attachCycleToDaily: true, profitEnabledAt: true,
        template: true,
      },
    })
    const { template, ...state } = cur
    // มีเทมเพลต = flag derive จากเทมเพลตเท่านั้น — ปล่อยให้ PATCH แก้ได้จะเกิดสองแหล่งความจริงที่ขัดกัน (AC-EXT-07-2)
    if (template !== null && FLAG_KEYS.some((k) => patch[k] !== undefined)) throw new LineReportError('FLAGS_DERIVED_FROM_TEMPLATE')
    const next = mergeSettings(state, patch, new Date())
    // เปิดรายเดือนกลับมาหลังปิด (E-8): cache attachCycleToDaily ตามที่เทมเพลตขอ — ปิดแล้ว mergeSettings ล้างไปแล้ว
    const parsed = template !== null ? validateTemplate(template) : null
    if (parsed?.ok && patch.monthlyEnabled !== undefined) next.attachCycleToDaily = next.monthlyEnabled && deriveFlags(parsed.template).attachCycleToDaily
    await tx.lineReportGroup.update({ where: { id: groupId }, data: next })
  })
  return (await getGroupDetail(ownerId, groupId)).group
}

const FLAG_KEYS = ['showOrders', 'showSales', 'showCancelled', 'showTopProducts', 'showProfit', 'attachCycleToDaily'] as const

// ─── เทมเพลตข้อความ (EXT-10) ────────────────────────────────────────────────────

/** เพดานคอลัมน์ (DB CHECK octet_length ≤ 16384) — ตรวจก่อนถึงฐานจะได้ error ที่ UI อ่านรู้เรื่อง ไม่ใช่ raw constraint */
const TEMPLATE_MAX_BYTES = 16384
/**
 * ด่านขนาดจุดเดียว: octet ของคอลัมน์ (16 KB) ก่อน แล้ววัด "ทั้ง message" ระดับ 3 ด้วย measureTemplate (FR-EXT-08)
 * — เกิน limit = TEMPLATE_TOO_LARGE · เกินแค่ระดับ 0 = ผ่านพร้อม warnings
 */
function assertTemplateSize(template: TemplateV1): TemplateMeasure {
  if (Buffer.byteLength(JSON.stringify(template), 'utf8') > TEMPLATE_MAX_BYTES) throw new LineReportError('TEMPLATE_TOO_LARGE')
  const m = measureTemplate(template)
  if (m.bytes > m.limit) throw new LineReportError('TEMPLATE_TOO_LARGE', { bytes: m.bytes, limit: m.limit })
  return m
}

export type UpdateTemplateInput = { template: unknown; expectedVersion: number; confirmProfit?: boolean }

/**
 * บันทึกเทมเพลต (PUT) — validate → ล็อกกลุ่ม → เทียบ version → derive flag → mergeSettings เดิม → เขียนทั้งก้อนใน tx เดียว
 * ผลต่อข้อความที่ส่งไปแล้ว/รอ retry = ไม่มี (retry ใช้ pendingPayload แช่แข็ง)
 */
export async function updateTemplate(ownerId: string, groupId: string, input: UpdateTemplateInput): Promise<GroupDetailDto & { measure: TemplateMeasure }> {
  if (!(await isOwnerPaidForReports(ownerId))) throw new LineReportError('PACKAGE_REQUIRED')
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new LineReportError('VALIDATION')
  const parsed = validateTemplate(input.template)
  if (!parsed.ok) throw new LineReportError('TEMPLATE_INVALID', { rule: parsed.rule, ...(parsed.blockId ? { blockId: parsed.blockId } : {}) })
  const template = parsed.template
  const measure = assertTemplateSize(template)
  await prisma.$transaction(async (tx) => {
    await lockOwnedGroup(tx, ownerId, groupId)
    const cur = await tx.lineReportGroup.findFirstOrThrow({
      where: { id: groupId, ownerId },
      select: {
        dailyEnabled: true, dailyTimes: true, monthlyEnabled: true, cutoffDay: true, showOrders: true, showSales: true,
        showCancelled: true, showTopProducts: true, showProfit: true, skipWhenNoOrders: true, attachCycleToDaily: true, profitEnabledAt: true,
        templateVersion: true,
      },
    })
    const { templateVersion, ...state } = cur
    if (templateVersion !== input.expectedVersion) throw new LineReportError('TEMPLATE_STALE', { currentVersion: templateVersion })
    // กำไร/ไม่มีตัวเลขเลย/ล้าง attachCycle เมื่อปิดรายเดือน = กฎเดียวกับ PATCH (ไม่เขียนซ้ำ)
    const next = mergeSettings(state, { ...deriveFlags(template), confirmProfit: input.confirmProfit }, new Date())
    await tx.lineReportGroup.update({
      where: { id: groupId },
      data: { ...next, template: template as unknown as Prisma.InputJsonObject, templateVersion: { increment: 1 } },
    })
  })
  return { ...(await getGroupDetail(ownerId, groupId)).group, measure }
}

/** คืนแบบมาตรฐาน (DELETE) — flag กลับค่าตั้งต้นคอลัมน์ (A-6) · attachCycleToDaily คงเดิมถ้ายังเปิดรายเดือน */
export async function resetTemplate(ownerId: string, groupId: string): Promise<GroupDetailDto> {
  if (!(await isOwnerPaidForReports(ownerId))) throw new LineReportError('PACKAGE_REQUIRED')
  await prisma.$transaction(async (tx) => {
    await lockOwnedGroup(tx, ownerId, groupId)
    const cur = await tx.lineReportGroup.findFirstOrThrow({ where: { id: groupId, ownerId }, select: { monthlyEnabled: true, attachCycleToDaily: true } })
    await tx.lineReportGroup.update({
      where: { id: groupId },
      data: {
        template: Prisma.DbNull, templateVersion: { increment: 1 },
        showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false, profitEnabledAt: null,
        attachCycleToDaily: cur.monthlyEnabled && cur.attachCycleToDaily,
      },
    })
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
    // ล็อกแถวก่อนอ่าน status — ไม่งั้นแข่งกับ consumeBindCode (PENDING→ACTIVE) แล้วอ่านเห็น PENDING ทั้งที่กลายเป็น ACTIVE
    // (ผลคือบอทไม่ถูกสั่งออกจากกลุ่ม) · ลำดับล็อกของ bind = User แล้วค่อย Group; ที่นี่ล็อกแค่ Group จึงไม่ deadlock
    await lockOwnedGroup(tx, ownerId, groupId)
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

/** มีแถว ACTIVE ถือ lineGroupId นี้อยู่ไหม — DELETE ใช้กันสั่งบอทออกจากกลุ่มที่มีคนผูกใหม่ไปแล้วระหว่างนั้น (security LOW-2) */
export async function hasActiveBinding(lineGroupId: string): Promise<boolean> {
  return (await prisma.lineReportGroup.count({ where: { lineGroupId, status: 'ACTIVE' } })) > 0
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

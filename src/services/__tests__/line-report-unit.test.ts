/**
 * line-report-unit.test.ts — unit (mock) ของ access + กฎ settings ของ 00068 (U4)
 * ไม่แตะ DB: prisma + business-package.service ถูก mock ทั้ง module (HR13)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { shop: { findFirst: vi.fn() }, lineReportGroup: { count: vi.fn() } } }))
vi.mock('@/services/business-package.service', () => ({ getSubscriptionStatus: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getSubscriptionStatus } from '@/services/business-package.service'
import {
  isOwnerPaidForReports, resolveReportAccess, assertReportAccess, countUnackedAlerts,
} from '@/services/line-report-access.service'
import { mergeSettings } from '@/services/line-report-group.service'
import { shopState, assertShopCount } from '@/services/line-report-shop.service'

const sub = vi.mocked(getSubscriptionStatus)
const shopFindFirst = vi.mocked(prisma.shop.findFirst)
beforeEach(() => vi.resetAllMocks())

describe('isOwnerPaidForReports (fail-closed)', () => {
  it('ACTIVE = true', async () => {
    sub.mockResolvedValue({ status: 'ACTIVE' } as never)
    expect(await isOwnerPaidForReports('u')).toBe(true)
  })
  it('LOCKED_RENEWAL_FAILED = false', async () => {
    sub.mockResolvedValue({ status: 'LOCKED_RENEWAL_FAILED' } as never)
    expect(await isOwnerPaidForReports('u')).toBe(false)
  })
  it('ไม่มีแถว (null) = false', async () => {
    sub.mockResolvedValue(null)
    expect(await isOwnerPaidForReports('u')).toBe(false)
  })
  it('อ่านแพ็กเกจ throw = false ไม่ throw ต่อ', async () => {
    sub.mockRejectedValue(new Error('db down'))
    await expect(isOwnerPaidForReports('u')).resolves.toBe(false)
  })
})

describe('resolveReportAccess', () => {
  const session = { user: { id: 'u1' } }
  it('ANON: ไม่มี session / session ไม่มี id', async () => {
    expect(await resolveReportAccess(null)).toEqual({ kind: 'ANON' })
    expect(await resolveReportAccess({ user: {} })).toEqual({ kind: 'ANON' })
    expect(shopFindFirst).not.toHaveBeenCalled()
  })
  it('NOT_OWNER: ไม่มีร้านที่ userId ตรง (ADMIN ล้วน)', async () => {
    shopFindFirst.mockResolvedValue(null)
    expect(await resolveReportAccess(session)).toEqual({ kind: 'NOT_OWNER', userId: 'u1' })
    expect(shopFindFirst).toHaveBeenCalledWith({ where: { userId: 'u1', deletedAt: null, purgedAt: null }, select: { id: true } })
    expect(sub).not.toHaveBeenCalled()
  })
  it('LOCKED NEVER (ไม่มีแถว) / RENEWAL_FAILED / throw -> LOCKED (fail-closed)', async () => {
    shopFindFirst.mockResolvedValue({ id: 's' } as never)
    sub.mockResolvedValueOnce(null)
    expect(await resolveReportAccess(session)).toEqual({ kind: 'LOCKED', userId: 'u1', reason: 'NEVER' })
    sub.mockResolvedValueOnce({ status: 'LOCKED_RENEWAL_FAILED' } as never)
    expect(await resolveReportAccess(session)).toEqual({ kind: 'LOCKED', userId: 'u1', reason: 'RENEWAL_FAILED' })
    sub.mockRejectedValueOnce(new Error('x'))
    expect((await resolveReportAccess(session)).kind).toBe('LOCKED')
  })
  it('OK', async () => {
    shopFindFirst.mockResolvedValue({ id: 's' } as never)
    sub.mockResolvedValue({ status: 'ACTIVE' } as never)
    expect(await resolveReportAccess(session)).toEqual({ kind: 'OK', userId: 'u1' })
  })
})

describe('assertReportAccess ตามระดับ L1/L2', () => {
  const code = (fn: () => unknown) => { try { fn(); return null } catch (e) { return (e as { code: string }).code } }
  it('ตารางสิทธิ์ SRS §7', () => {
    expect(code(() => assertReportAccess({ kind: 'ANON' }, 'READ'))).toBe('UNAUTHORIZED')
    expect(code(() => assertReportAccess({ kind: 'NOT_OWNER', userId: 'u' }, 'READ'))).toBe('NOT_OWNER')
    expect(code(() => assertReportAccess({ kind: 'NOT_OWNER', userId: 'u' }, 'PAID'))).toBe('NOT_OWNER')
    expect(assertReportAccess({ kind: 'LOCKED', userId: 'u', reason: 'NEVER' }, 'READ')).toBe('u') // L1 อ่าน/ลบได้
    expect(code(() => assertReportAccess({ kind: 'LOCKED', userId: 'u', reason: 'NEVER' }, 'PAID'))).toBe('PACKAGE_REQUIRED')
    expect(assertReportAccess({ kind: 'OK', userId: 'u' }, 'PAID')).toBe('u')
  })
})

describe('countUnackedAlerts', () => {
  it('นับเฉพาะกลุ่มของเจ้าของที่มี alertKind และยังไม่ ack ไม่รวม REMOVED', async () => {
    vi.mocked(prisma.lineReportGroup.count).mockResolvedValue(2)
    expect(await countUnackedAlerts('o')).toBe(2)
    expect(prisma.lineReportGroup.count).toHaveBeenCalledWith({
      where: { ownerId: 'o', status: { not: 'REMOVED' }, alertKind: { not: null }, alertAckAt: null },
    })
  })
})

describe('mergeSettings — กฎข้ามฟิลด์บน state รวม', () => {
  const base = {
    dailyEnabled: false, dailyTimes: [] as number[], monthlyEnabled: false, cutoffDay: null as number | null,
    showOrders: true, showSales: true, showCancelled: true, showTopProducts: true, showProfit: false,
    skipWhenNoOrders: false, attachCycleToDaily: false, profitEnabledAt: null as Date | null,
  }
  const now = new Date('2026-10-05T03:00:00Z')
  const rule = (fn: () => unknown) => { try { fn(); return null } catch (e) { const x = e as { code: string; details: { rule?: string } }; return `${x.code}${x.details.rule ? ':' + x.details.rule : ''}` } }

  it('NEEDS_TIME: เปิดรายวันโดยไม่มีเวลา (รวมจาก state เดิม)', () => {
    expect(rule(() => mergeSettings(base, { dailyEnabled: true }, now))).toBe('INVALID_SETTINGS:NEEDS_TIME')
    expect(rule(() => mergeSettings(base, { monthlyEnabled: true }, now))).toBe('INVALID_SETTINGS:NEEDS_TIME')
  })
  it('NEEDS_TIME: ลบเวลาสุดท้ายตอนรายวันเปิดอยู่ = ปฏิเสธ · ปิดรายวันพร้อมลบเวลา = ผ่าน', () => {
    const on = { ...base, dailyEnabled: true, dailyTimes: [540] }
    expect(rule(() => mergeSettings(on, { dailyTimes: [] }, now))).toBe('INVALID_SETTINGS:NEEDS_TIME')
    expect(mergeSettings(on, { dailyEnabled: false, dailyTimes: [] }, now).dailyTimes).toEqual([])
  })
  it('METRIC_REQUIRED: ปิดตัวเลขสุดท้าย', () => {
    const one = { ...base, showSales: false, showCancelled: false, showTopProducts: false }
    expect(rule(() => mergeSettings(one, { showOrders: false }, now))).toBe('INVALID_SETTINGS:METRIC_REQUIRED')
    expect(mergeSettings(one, { showOrders: false, showProfit: true, confirmProfit: true }, now).showProfit).toBe(true)
  })
  it('sort dailyTimes asc', () => {
    expect(mergeSettings(base, { dailyEnabled: true, dailyTimes: [1440, 540, 60] }, now).dailyTimes).toEqual([60, 540, 1440])
  })
  it('ปิดรายเดือน -> ล้าง attachCycleToDaily (ไม่ error) · เปิดรายเดือนอยู่ -> คงไว้', () => {
    const m = { ...base, dailyTimes: [540], monthlyEnabled: true, attachCycleToDaily: true }
    expect(mergeSettings(m, { monthlyEnabled: false }, now).attachCycleToDaily).toBe(false)
    expect(mergeSettings(m, { showOrders: false }, now).attachCycleToDaily).toBe(true)
  })
  it('showProfit false→true ต้อง confirmProfit:true · ตั้ง profitEnabledAt · ปิด -> null', () => {
    expect(rule(() => mergeSettings(base, { showProfit: true }, now))).toBe('PROFIT_CONFIRM_REQUIRED')
    expect(rule(() => mergeSettings(base, { showProfit: true, confirmProfit: false }, now))).toBe('PROFIT_CONFIRM_REQUIRED')
    const on = mergeSettings(base, { showProfit: true, confirmProfit: true }, now)
    expect(on.profitEnabledAt).toEqual(now)
    // true→true ไม่ต้องยืนยันซ้ำ และไม่ขยับเวลา
    const later = new Date('2026-10-06T00:00:00Z')
    expect(mergeSettings(on, { showOrders: false }, later).profitEnabledAt).toEqual(now)
    expect(mergeSettings(on, { showProfit: false }, later).profitEnabledAt).toBeNull()
  })
  it('cutoffDay null (สิ้นเดือน) ตั้งได้ · ค่าที่ไม่ส่งคงเดิม', () => {
    const c = { ...base, cutoffDay: 5 }
    expect(mergeSettings(c, { cutoffDay: null }, now).cutoffDay).toBeNull()
    expect(mergeSettings(c, { showOrders: false }, now).cutoffDay).toBe(5)
  })
})

describe('shop helpers', () => {
  it('shopState: terminal ก่อน (PURGED > DELETED > LOCKED)', () => {
    const d = new Date()
    expect(shopState({ packageLockedAt: null, deletedAt: null, purgedAt: null })).toBe('OK')
    expect(shopState({ packageLockedAt: d, deletedAt: null, purgedAt: null })).toBe('LOCKED')
    expect(shopState({ packageLockedAt: d, deletedAt: d, purgedAt: null })).toBe('DELETED')
    expect(shopState({ packageLockedAt: d, deletedAt: d, purgedAt: d })).toBe('PURGED')
  })
  it('assertShopCount: 0 / 11 = SHOP_COUNT_OUT_OF_RANGE · ซ้ำ = VALIDATION', () => {
    const code = (ids: string[]) => { try { assertShopCount(ids); return null } catch (e) { return (e as { code: string }).code } }
    expect(code([])).toBe('SHOP_COUNT_OUT_OF_RANGE')
    expect(code(Array.from({ length: 11 }, (_, i) => `s${i}`))).toBe('SHOP_COUNT_OUT_OF_RANGE')
    expect(code(['a', 'a'])).toBe('VALIDATION')
    expect(code(Array.from({ length: 10 }, (_, i) => `s${i}`))).toBeNull()
  })
})

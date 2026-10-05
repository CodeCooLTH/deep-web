import { describe, expect, it } from 'vitest'
import {
  bannerFor,
  canEdit,
  canTest,
  groupBadge,
  lockedCta,
  TEST_SEND_DAILY_LIMIT,
  testsLeft,
  type PresenterGroup,
} from '../presenter'
import type { LineReportGroupStatus } from '../types'

const g = (status: LineReportGroupStatus, o: Partial<PresenterGroup> = {}): PresenterGroup => ({ status, ...o })

describe('groupBadge', () => {
  it.each([
    ['ACTIVE', 'BOUND', 'ผูกแล้ว', 'success'],
    ['PENDING', 'PENDING', 'รอผูก', 'warning'],
    ['INACTIVE', 'BOT_REMOVED', 'บอทถูกนำออก', 'danger'],
    ['REMOVED', 'REMOVED', 'ยกเลิกการผูกแล้ว', 'neutral'],
  ] as const)('%s ไม่หยุด → %s', (st, key, label, tone) => {
    expect(groupBadge(g(st), false)).toMatchObject({ key, label, tone })
  })
  it('แพ็กเกจหยุดชนะทุกสถานะ (warning ไม่ใช่เขียว) ยกเว้น REMOVED', () => {
    for (const st of ['ACTIVE', 'PENDING', 'INACTIVE'] as const) {
      expect(groupBadge(g(st), true)).toMatchObject({ key: 'PACKAGE_PAUSED', label: 'หยุดส่งเพราะแพ็กเกจ', tone: 'warning' })
    }
    expect(groupBadge(g('REMOVED'), true).key).toBe('REMOVED')
  })
})

describe('canTest / testsLeft', () => {
  it('ได้เฉพาะ ACTIVE + ไม่หยุด + มีร้านส่งได้ + ใต้โควตา', () => {
    expect(canTest(g('ACTIVE'), false, 0)).toBe(true)
    expect(canTest(g('ACTIVE'), false, TEST_SEND_DAILY_LIMIT - 1)).toBe(true)
  })
  it('แต่ละเงื่อนไขปิดได้ลำพัง', () => {
    expect(canTest(g('ACTIVE'), false, TEST_SEND_DAILY_LIMIT)).toBe(false)
    expect(canTest(g('ACTIVE'), true, 0)).toBe(false)
    expect(canTest(g('ACTIVE', { allShopsLocked: true }), false, 0)).toBe(false)
    for (const st of ['PENDING', 'INACTIVE', 'REMOVED'] as const) expect(canTest(g(st), false, 0)).toBe(false)
  })
  it('testsLeft ไม่ติดลบ', () => {
    expect(testsLeft(2)).toBe(3)
    expect(testsLeft(9)).toBe(0)
  })
})

describe('canEdit', () => {
  it('ได้เมื่อไม่หยุด และไม่ใช่ REMOVED', () => {
    for (const st of ['ACTIVE', 'PENDING', 'INACTIVE'] as const) {
      expect(canEdit(g(st), false)).toBe(true)
      expect(canEdit(g(st), true)).toBe(false)
    }
    expect(canEdit(g('REMOVED'), false)).toBe(false)
  })
})

describe('lockedCta — 3 เปลือก (TFR-LGS-02)', () => {
  it('เว็บ → /business ป้ายตามเหตุ', () => {
    expect(lockedCta('web')).toEqual({ label: 'ดูแพ็กเกจธุรกิจ', href: '/business' })
    expect(lockedCta('web', 'RENEWAL_FAILED')).toEqual({ label: 'ต่ออายุแพ็กเกจ', href: '/business' })
  })
  it('iOS → หน้าซื้อ IAP ป้ายเดียว', () => {
    expect(lockedCta('ios')).toEqual({ label: 'ดูแพ็กเกจธุรกิจ', href: '/business/subscribe' })
    expect(lockedCta('ios', 'RENEWAL_FAILED')?.href).toBe('/business/subscribe')
  })
  it('Android → null (ไม่มีปุ่ม/ลิงก์/ราคา)', () => {
    expect(lockedCta('android')).toBeNull()
    expect(lockedCta('android', 'RENEWAL_FAILED')).toBeNull()
  })
})

describe('bannerFor', () => {
  it('ปกติ ผูกอยู่ → ไม่มีแบนเนอร์', () => {
    expect(bannerFor(g('ACTIVE'), false, 'web')).toBeNull()
    expect(bannerFor(g('PENDING'), false, 'web')).toBeNull()
    expect(bannerFor(g('REMOVED'), true, 'web')).toBeNull()
  })
  it('บอทถูกนำออก → danger + ผูกใหม่', () => {
    expect(bannerFor(g('INACTIVE'), false, 'web')).toMatchObject({
      key: 'BOT_REMOVED',
      tone: 'danger',
      action: { kind: 'REBIND', label: 'ผูกใหม่' },
    })
  })
  it('ร้านถูกล็อกหมด → warning ไม่มีปุ่ม', () => {
    expect(bannerFor(g('ACTIVE', { allShopsLocked: true }), false, 'web')).toMatchObject({
      key: 'ALL_SHOPS_LOCKED',
      tone: 'warning',
      action: null,
      message: 'ทุกร้านในกลุ่มนี้ถูกล็อก รายงานจึงยังไม่ถูกส่ง',
    })
  })
  it('แพ็กเกจหยุดชนะบอทถูกนำออก · เว็บ = ข้อความปกติ + ต่ออายุ → /business', () => {
    const b = bannerFor(g('INACTIVE'), true, 'web')
    expect(b).toMatchObject({ key: 'PACKAGE_PAUSED', tone: 'warning', action: { kind: 'LINK', label: 'ต่ออายุแพ็กเกจ', href: '/business' } })
    expect(b?.message).toContain('ต่อแพ็กเกจแล้วรายงานจะกลับมาส่งเอง')
  })
  it('iOS = ข้อความแอป + CTA ไป /business/subscribe', () => {
    const b = bannerFor(g('ACTIVE'), true, 'ios')
    expect(b?.message).toContain('ยังไม่ได้เปิดใช้แพ็กเกจธุรกิจ')
    expect(b?.action).toMatchObject({ kind: 'LINK', href: '/business/subscribe' })
  })
  it('Android = ข้อความแอป ไม่มีปุ่ม ไม่มี ฿/สมัคร/อัปเกรด/ราคา', () => {
    const b = bannerFor(g('ACTIVE'), true, 'android')
    expect(b?.action).toBeNull()
    expect(b?.message).not.toMatch(/฿|สมัคร|อัปเกรด|ราคา|ต่อแพ็กเกจ/)
  })
})

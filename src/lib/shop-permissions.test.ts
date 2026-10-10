import { describe, expect, it } from 'vitest'
import { can, moneyLevel, rolesFromMembership, type Capability, type ShopRole } from './shop-permissions'

// ตารางคาดหวังเขียนมือตรงจาก BRD 00071 §8.3 (คอลัมน์: OWNER MANAGER CHAT BILLING TECHNICIAN)
// ห้าม derive จาก shop-permissions.ts — ไม่งั้นเทสกลายเป็นกระจกสะท้อนตัวเอง
const ROLES: ShopRole[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']
const EXPECTED: Record<Capability, string> = {
  H1: 'YYY--',
  H2: 'YYY--',
  H3: 'YY---',
  O1: 'YYYYY',
  O2: 'YYY--',
  O2s: 'YYYY-',
  O3: 'YYYY-',
  O4: 'YYY-Y',
  O5: 'YYYY-',
  O6: 'YY---',
  O7: 'YYYY-',
  D1: 'YYYY-',
  S1: 'YYY--',
  S2: 'Y----',
  P1: 'YYYY-',
  P2: 'YY---',
  P3: 'Y----',
  Q1: 'YYYYY',
  Q2: 'YY---',
  C1: 'YYYY-',
  C2: 'YYYY-',
  C3: 'YY---',
  F1: 'Y----',
  F2: 'Y----',
  F3: 'Y----',
  T1: 'YY---',
  T2: 'Y----',
  T3: 'Y----',
  T4: 'Y----',
}

describe('can() — ตารางสิทธิ์ครบทุกคู่ (บทบาท × capability)', () => {
  for (const [cap, mask] of Object.entries(EXPECTED)) {
    ROLES.forEach((role, i) => {
      it(`${cap} × ${role} = ${mask[i] === 'Y'}`, () => {
        expect(can([role], cap as Capability)).toBe(mask[i] === 'Y')
      })
    })
  }
  it('ตารางคาดหวังครอบทุก capability (29 รหัส)', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(29)
  })
})

describe('can() — union ของหลายบทบาท', () => {
  it('CHAT+BILLING ได้ทั้ง H2 และ O2s · ยังไม่ได้ F1', () => {
    expect(can(['CHAT', 'BILLING'], 'H2')).toBe(true)
    expect(can(['CHAT', 'BILLING'], 'O2s')).toBe(true)
    expect(can(['CHAT', 'BILLING'], 'F1')).toBe(false)
  })
  it('TECHNICIAN+CHAT ได้ O4 จากทั้งคู่ และ H1 จาก CHAT', () => {
    expect(can(['TECHNICIAN', 'CHAT'], 'H1')).toBe(true)
    expect(can(['TECHNICIAN', 'CHAT'], 'F3')).toBe(false)
  })
  it('ชุดว่างไม่ได้อะไรเลย', () => {
    expect(can([], 'O1')).toBe(false)
  })
})

describe('can() — capability ที่ไม่รู้จัก = เจ้าของเท่านั้น (BR-RP-11)', () => {
  it('OWNER ผ่าน · ทุกบทบาทอื่นไม่ผ่าน', () => {
    expect(can(['OWNER'], 'X9')).toBe(true)
    for (const r of ROLES.slice(1)) expect(can([r], 'X9'), r).toBe(false)
    expect(can(['MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN'], 'X9')).toBe(false)
  })
})

describe('moneyLevel() — สูงสุดของทุกบทบาท', () => {
  it('รายบทบาท', () => {
    expect(moneyLevel(['OWNER'])).toBe('FULL')
    for (const r of ['MANAGER', 'CHAT', 'BILLING'] as ShopRole[]) expect(moneyLevel([r]), r).toBe('PER_ORDER')
    expect(moneyLevel(['TECHNICIAN'])).toBe('NONE')
  })
  it('CHAT+TECHNICIAN = PER_ORDER (ไม่ใช่ NONE)', () => {
    expect(moneyLevel(['CHAT', 'TECHNICIAN'])).toBe('PER_ORDER')
    expect(moneyLevel(['TECHNICIAN', 'CHAT'])).toBe('PER_ORDER')
  })
  it('ชุดว่าง = NONE', () => {
    expect(moneyLevel([])).toBe('NONE')
  })
})

describe('rolesFromMembership()', () => {
  it('OWNER → [OWNER] ไม่สน roles', () => {
    expect(rolesFromMembership('OWNER', [])).toEqual(['OWNER'])
    expect(rolesFromMembership('OWNER', ['CHAT', 'BILLING'])).toEqual(['OWNER'])
  })
  it('ADMIN → roles ที่อยู่ใน STAFF_ROLES', () => {
    expect(rolesFromMembership('ADMIN', ['MANAGER'])).toEqual(['MANAGER'])
    expect(rolesFromMembership('ADMIN', ['CHAT', 'BILLING'])).toEqual(['CHAT', 'BILLING'])
  })
  it('ADMIN roles ว่าง = [] (ห้ามตกเป็น MANAGER)', () => {
    expect(rolesFromMembership('ADMIN', [])).toEqual([])
  })
  it('ADMIN: ตัด OWNER/ค่าแปลก/ค่าซ้ำ', () => {
    expect(rolesFromMembership('ADMIN', ['OWNER', 'WEIRD', 'CHAT', 'CHAT'])).toEqual(['CHAT'])
  })
  it('role แปลกจากฐาน → [] (ไม่ใช่ MANAGER)', () => {
    expect(rolesFromMembership('WEIRD' as 'ADMIN', ['MANAGER'])).toEqual([])
  })
  it('parity P1: ADMIN+[MANAGER] ได้ผลเท่าคอลัมน์ MANAGER ของตารางทุก capability', () => {
    for (const [cap, mask] of Object.entries(EXPECTED)) {
      expect(can(rolesFromMembership('ADMIN', ['MANAGER']), cap as Capability), cap).toBe(mask[1] === 'Y')
    }
  })
})

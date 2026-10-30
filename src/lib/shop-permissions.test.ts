import { describe, expect, it } from 'vitest'
import {
  can, canAssignServiceJob, canClaimServiceJob, closeJobFlagState, effectiveRoles, isTechnicianOnly, memberCanCloseJob,
  memberCanRecordStaffExpense, moneyLevel, PRIMARY_OWNER_ONLY, rolesFromMembership, serviceJobActorBlock,
  type Capability, type ShopRole,
} from './shop-permissions'

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
  S2: 'YY---',
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
  F4: 'YY---',
  T1: 'YY---',
  T2: 'Y----',
  T3: 'Y----',
  T4: 'Y----',
  X1: 'YY---',
  X2: 'YYY--',
  X3: 'YY---',
  X4: 'YYY--',
  X5: 'YY---',
  X6: 'YY---',
  X7: 'Y----',
  X8: 'YY---',
}

describe('can() — ตารางสิทธิ์ครบทุกคู่ (บทบาท × capability)', () => {
  for (const [cap, mask] of Object.entries(EXPECTED)) {
    ROLES.forEach((role, i) => {
      it(`${cap} × ${role} = ${mask[i] === 'Y'}`, () => {
        expect(can([role], cap as Capability)).toBe(mask[i] === 'Y')
      })
    })
  }
  it('ตารางคาดหวังครอบทุก capability (38 รหัส)', () => {
    expect(Object.keys(EXPECTED)).toHaveLength(38)
  })
})

describe('X6 (ดูแผนตรวจสอบ · มติ C-13) vs T4 (จัดการแผน)', () => {
  it('MANAGER ผ่าน X6 แต่ไม่ผ่าน T4', () => {
    expect(can(['MANAGER'], 'X6')).toBe(true)
    expect(can(['MANAGER'], 'T4')).toBe(false)
  })
  it.each(['BILLING', 'CHAT', 'TECHNICIAN'] as ShopRole[])('%s ไม่ผ่าน X6', (r) => {
    expect(can([r], 'X6')).toBe(false)
  })
  it('X6 ไม่ใช่เจ้าของหลักเท่านั้น (T4 ตัวเดียวที่เป็น)', () => {
    expect(PRIMARY_OWNER_ONLY.has('X6')).toBe(false)
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

describe('PRIMARY_OWNER_ONLY', () => {
  it('มี T4 ตัวเดียว (BRD §8.3: เจ้าของหลักเท่านั้น)', () => {
    expect([...PRIMARY_OWNER_ONLY]).toEqual(['T4'])
  })
})

// ─── 00086 — สิทธิ์ปิดงาน / บันทึกค่าใช้จ่ายรายคน ───────────────────────────────────────────────
// ผลคาดหวังของร้านบริการเขียนมือ (PRD 00086 S-5) ไม่ derive จากโค้ด

/** ทุกชุดย่อยของ 5 บทบาท (32 ชุด รวมชุดว่าง) */
const ROLE_SETS: ShopRole[][] = Array.from({ length: 1 << ROLES.length }, (_, mask) =>
  ROLES.filter((_, i) => mask & (1 << i)))
const FLAG_CASES: ({ canCloseJob?: boolean; canRecordExpense?: boolean } | undefined)[] = [
  undefined, {}, { canCloseJob: false }, { canCloseJob: true }, { canCloseJob: true, canRecordExpense: true },
]
const svcShop = { kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' }
const NON_SERVICE = [
  { kind: 'BUSINESS', vertical: 'ONLINE_SALES' },
  { kind: 'BUSINESS', vertical: 'LODGING' },
  { kind: 'PERSONAL', vertical: 'ONLINE_SALES' },
  { kind: 'PERSONAL', vertical: 'LODGING' },
]

describe('memberCanCloseJob — ร้านที่ไม่ใช่บริการ = can(roles, O4) ทุกชุด × ทุกธง [blocker]', () => {
  for (const shop of NON_SERVICE) {
    it(`${shop.kind}/${shop.vertical}: 32 ชุดบทบาท × 5 แบบธง`, () => {
      for (const roles of ROLE_SETS) for (const f of FLAG_CASES) {
        expect(memberCanCloseJob(shop, roles, f), `${roles.join('+')} ${JSON.stringify(f)}`).toBe(can(roles, 'O4'))
      }
    })
  }
  it('ธงติ๊กค้างจากตอนเป็นร้านบริการ ไม่ทำให้ BILLING ร้านขายของปิดงานได้ (stored-flag-vs-owner-truth)', () => {
    expect(memberCanCloseJob({ vertical: 'ONLINE_SALES' }, ['BILLING'], { canCloseJob: true })).toBe(false)
  })
})

describe('memberCanCloseJob — ร้านบริการ [blocker]', () => {
  // OWNER ∨ MANAGER ∨ (ธง ∧ (CHAT ∨ TECHNICIAN))
  const expected = (roles: ShopRole[], f?: { canCloseJob?: boolean }) =>
    roles.includes('OWNER') || roles.includes('MANAGER') ||
    (f?.canCloseJob === true && (roles.includes('CHAT') || roles.includes('TECHNICIAN')))
  it('ทุกชุดบทบาท × ทุกแบบธง', () => {
    for (const roles of ROLE_SETS) for (const f of FLAG_CASES) {
      expect(memberCanCloseJob(svcShop, roles, f), `${roles.join('+')} ${JSON.stringify(f)}`).toBe(expected(roles, f))
    }
  })
  it.each([
    [['CHAT'], undefined, false],
    [['CHAT'], { canCloseJob: false }, false],
    [['CHAT'], { canCloseJob: true }, true],
    [['TECHNICIAN'], {}, false],
    [['TECHNICIAN'], { canCloseJob: true }, true],
    [['BILLING'], { canCloseJob: true }, false],
    [['MANAGER'], undefined, true],
    [['OWNER'], undefined, true],
    [[], { canCloseJob: true }, false],
  ] as [ShopRole[], { canCloseJob?: boolean } | undefined, boolean][])('%j ธง %j = %s', (roles, f, want) => {
    expect(memberCanCloseJob(svcShop, roles, f)).toBe(want)
  })
  it('kind ไม่ส่งมาก็ตัดสินด้วย vertical', () => {
    expect(memberCanCloseJob({ vertical: 'SERVICE_QUEUE' }, ['CHAT'])).toBe(false)
    expect(memberCanCloseJob({ vertical: 'SERVICE_QUEUE' }, ['CHAT'], { canCloseJob: true })).toBe(true)
  })
  it('PERSONAL ร้านบริการ: ผ่าน effectiveRoles = เจ้าของ ⇒ ปิดงานได้แม้ไม่มีธง', () => {
    const p = { kind: 'PERSONAL', vertical: 'SERVICE_QUEUE' }
    expect(memberCanCloseJob(p, effectiveRoles(p, 'ADMIN', ['BILLING']))).toBe(true)
  })
  it('ร้านบริการแคบกว่า O4 เดิม: CHAT/TECHNICIAN ไม่มีธง = ปิดไม่ได้ (O4 ให้ผ่าน)', () => {
    expect(can(['CHAT'], 'O4')).toBe(true)
    expect(memberCanCloseJob(svcShop, ['CHAT'])).toBe(false)
  })
})

describe('memberCanRecordStaffExpense [blocker]', () => {
  it('ร้านบริการ ∧ ADMIN ∧ ธง = true เท่านั้น', () => {
    expect(memberCanRecordStaffExpense(svcShop, 'ADMIN', { canRecordExpense: true })).toBe(true)
  })
  it.each([
    ['ADMIN', undefined],
    ['ADMIN', {}],
    ['ADMIN', { canRecordExpense: false }],
    ['ADMIN', { canCloseJob: true }],
    ['OWNER', { canRecordExpense: true }],
    ['WEIRD', { canRecordExpense: true }],
  ] as [string, { canRecordExpense?: boolean; canCloseJob?: boolean } | undefined][])('ร้านบริการ role %s ธง %j = false', (role, f) => {
    expect(memberCanRecordStaffExpense(svcShop, role, f)).toBe(false)
  })
  it.each(NON_SERVICE)('ร้านไม่ใช่บริการ ($kind/$vertical) = false แม้ ADMIN+ธง', (shop) => {
    expect(memberCanRecordStaffExpense(shop, 'ADMIN', { canRecordExpense: true })).toBe(false)
  })
})

describe('closeJobFlagState [blocker]', () => {
  it.each([
    [['MANAGER'], 'LOCKED_ON'],
    [['MANAGER', 'CHAT'], 'LOCKED_ON'],
    [['BILLING', 'MANAGER'], 'LOCKED_ON'],
    [['CHAT'], 'EDITABLE'],
    [['TECHNICIAN'], 'EDITABLE'],
    [['CHAT', 'BILLING'], 'EDITABLE'],
    [['BILLING'], 'DISABLED'],
    [[], 'DISABLED'],
    [['OWNER'], 'DISABLED'],
  ] as [string[], string][])('%j → %s', (roles, want) => {
    expect(closeJobFlagState(roles)).toBe(want)
  })
})

// ─── 00086 P3 — ช่างล้วน · ผู้รับผิดชอบ (BRD §8.1/§8.2 · API §4.8 · SDS TD-009) ─────────────────────
// mutation ที่ต้องแดง: ถอดเงื่อนไข every TECHNICIAN ออกจาก isTechnicianOnly → แถว CHAT+TECHNICIAN แดง
describe('00086 isTechnicianOnly', () => {
  it.each([
    [['TECHNICIAN'], true],
    [['TECHNICIAN', 'TECHNICIAN'], true],
    [['CHAT', 'TECHNICIAN'], false],
    [['BILLING', 'TECHNICIAN'], false],
    [['MANAGER', 'TECHNICIAN'], false],
    [['OWNER'], false],
    [['CHAT'], false],
    [[], false],
  ] as [ShopRole[], boolean][])('%j → %s', (roles, want) => {
    expect(isTechnicianOnly(roles)).toBe(want)
  })
})

describe('00086 serviceJobActorBlock — บทบาท × มีคนรับ/ไม่มี/ของคนอื่น', () => {
  const ME = 'u-me'
  const job = (assignedUserId: string | null) => ({ assignedUserId })
  it.each([
    // [roles, assignedUserId, ผล]
    [['TECHNICIAN'], ME, null],
    [['TECHNICIAN'], null, 'UNASSIGNED'],
    [['TECHNICIAN'], 'u-other', 'NOT_ASSIGNEE'],
    // ไม่ใช่ช่างล้วน = ทำแทนได้ทุกใบ (BRD §8.2)
    [['CHAT', 'TECHNICIAN'], 'u-other', null],
    [['CHAT', 'TECHNICIAN'], null, null],
    [['CHAT'], 'u-other', null],
    [['MANAGER'], null, null],
    [['OWNER'], 'u-other', null],
    [['BILLING'], 'u-other', null],
    // ชุดว่าง: ไม่ใช่ช่างล้วน — ด่าน O4 ของผู้เรียกปฏิเสธเองอยู่แล้ว (ฟังก์ชันนี้ตอบแค่ "ของใคร")
    [[], 'u-other', null],
  ] as [ShopRole[], string | null, string | null][])('%j · assigned=%s → %s', (roles, assigned, want) => {
    expect(serviceJobActorBlock(roles, job(assigned), ME)).toBe(want)
  })
})

describe('00086 canAssignServiceJob (O2s) / canClaimServiceJob (O4 ∧ TECHNICIAN)', () => {
  it.each([
    [['OWNER'], true, false],
    [['MANAGER'], true, false],
    [['CHAT'], true, false],
    [['BILLING'], true, false],
    [['TECHNICIAN'], false, true],
    [['CHAT', 'TECHNICIAN'], true, true],
    [['BILLING', 'TECHNICIAN'], true, true],
    [[], false, false],
  ] as [ShopRole[], boolean, boolean][])('%j → assign=%s claim=%s', (roles, assign, claim) => {
    expect(canAssignServiceJob(roles)).toBe(assign)
    expect(canClaimServiceJob(roles)).toBe(claim)
  })
})

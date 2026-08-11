import { describe, expect, it } from 'vitest'
import {
  approvedVerificationWhere,
  businessScope,
  verificationRecordWhere,
  type VerificationReadScope,
} from '../verification-scope'

/**
 * เทสชุดนี้ยืนยัน "ความหมาย" ไม่ใช่ "รูปร่างของ object" — เพราะบั๊กต้นทาง (2026-08-11: ร้าน BUSINESS
 * ทุกร้านขึ้น Level 0 ทั้งที่เจ้าของยืนยันเบอร์แล้ว) เกิดจาก where ที่ **ถูกต้องตามชนิดทุกตัวอักษร**
 * แต่ตีความผิด — เทสที่ assert รูปร่างอย่างเดียวจะเขียวกับทั้งเวอร์ชันที่ผิดและถูก
 *
 * จึงจำลอง semantics ของ Prisma เฉพาะรูปแบบที่ไฟล์นี้ผลิต (equality + OR) แล้วยิงแถวจริงใส่
 */
type Row = { userId: string; shopId: string | null; level: number; status: string }

function matches(where: Record<string, unknown>, row: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') {
      return (value as Record<string, unknown>[]).some((branch) => matches(branch, row))
    }
    return (row as unknown as Record<string, unknown>)[key] === value
  })
}

/** แถวจริงบน prod: L1 ของเจ้าของร้านเขียน shopId=null เสมอ (ทุกทางเข้าใน CLAUDE.md) */
const OWNER_L1: Row = { userId: 'owner-1', shopId: null, level: 1, status: 'APPROVED' }
const SHOP_L2: Row = { userId: 'owner-1', shopId: 'shop-1', level: 2, status: 'APPROVED' }
const SHOP_L2_PENDING: Row = { userId: 'owner-1', shopId: 'shop-1', level: 2, status: 'PENDING' }
const STAFF_L1: Row = { userId: 'staff-9', shopId: null, level: 1, status: 'APPROVED' }
const OTHER_SHOP_L2: Row = { userId: 'owner-2', shopId: 'shop-2', level: 2, status: 'APPROVED' }

describe('verificationRecordWhere — business scope', () => {
  const scope = businessScope('shop-1', 'owner-1')

  // [blocker] นี่คือบั๊กตัวต้นเรื่องโดยตรง — ถ้าเทสนี้แดง ร้าน BUSINESS จะกลับไปขึ้น
  // "Level 0 · ยังไม่ได้ยืนยัน" ทั้งที่เจ้าของยืนยันเบอร์แล้ว + เสีย 10 คะแนน trust score
  // + เหรียญ Fully Verified เป็นไปไม่ได้ ห้าม merge เด็ดขาด
  it('[blocker] นับ L1 ของเจ้าของร้านที่เขียน shopId=null', () => {
    expect(matches(verificationRecordWhere(scope), OWNER_L1)).toBe(true)
  })

  it('[blocker] ยังนับเอกสารของร้านเองตามเดิม', () => {
    expect(matches(verificationRecordWhere(scope), SHOP_L2)).toBe(true)
  })

  // [blocker] พนักงานที่ถูกเชิญเข้าร้านยืนยันเบอร์ตัวเอง ≠ ร้านยืนยันแล้ว
  it('[blocker] ไม่นับ L1 ของคนอื่นที่ไม่ใช่เจ้าของร้าน', () => {
    expect(matches(verificationRecordWhere(scope), STAFF_L1)).toBe(false)
  })

  it('ไม่นับเอกสารของร้านอื่น', () => {
    expect(matches(verificationRecordWhere(scope), OTHER_SHOP_L2)).toBe(false)
  })

  // ระดับที่สูงกว่า 1 เป็นของ "ร้าน" ไม่ใช่ของ "คน" — เอกสาร personal ของเจ้าของไม่ควรไหลเข้าร้าน
  it('[blocker] ไม่ดูด L2/L3 ที่เป็น personal ของเจ้าของเข้ามาเป็นของร้าน', () => {
    const ownerPersonalL2: Row = { userId: 'owner-1', shopId: null, level: 2, status: 'APPROVED' }
    expect(matches(verificationRecordWhere(scope), ownerPersonalL2)).toBe(false)
  })

  // [blocker] หาเจ้าของไม่เจอ ต้องถอยไป `{ shopId }` ล้วน ห้ามถอยไป personal ของผู้ที่เปิดหน้าอยู่
  it('[blocker] ownerUserId = null → เห็นเฉพาะแถวของร้าน ไม่มี OR', () => {
    const w = verificationRecordWhere(businessScope('shop-1', null))
    expect(w).toEqual({ shopId: 'shop-1' })
    expect(matches(w, OWNER_L1)).toBe(false)
    expect(matches(w, SHOP_L2)).toBe(true)
  })
})

describe('verificationRecordWhere — personal scope (zero-regression)', () => {
  const scope: VerificationReadScope = { kind: 'personal', userId: 'owner-1' }

  it('[blocker] คงพฤติกรรมเดิมเป๊ะ: userId ตรง + shopId เป็น null เท่านั้น', () => {
    expect(verificationRecordWhere(scope)).toEqual({ userId: 'owner-1', shopId: null })
    expect(matches(verificationRecordWhere(scope), OWNER_L1)).toBe(true)
    expect(matches(verificationRecordWhere(scope), SHOP_L2)).toBe(false)
    expect(matches(verificationRecordWhere(scope), STAFF_L1)).toBe(false)
  })
})

describe('approvedVerificationWhere', () => {
  // [blocker] status ต้องเป็น AND ครอบทั้งก้อน ไม่ใช่ซ่อนอยู่ใน branch ใด branch หนึ่งของ OR
  // ถ้าย้ายเข้าไปใน OR แล้วมีคนเพิ่ม branch ที่สามโดยลืมใส่ status เอกสารที่ยัง PENDING
  // จะถูกนับเป็น "ยืนยันแล้ว" เงียบ ๆ
  it('[blocker] ตัดแถวที่ยังไม่ APPROVED ออกทุก branch ของ OR', () => {
    const w = approvedVerificationWhere(businessScope('shop-1', 'owner-1'))
    expect(matches(w, SHOP_L2_PENDING)).toBe(false)
    // 🛑 ต้องเช็ค branch ของ "L1 เจ้าของ" ด้วย ไม่ใช่แค่ branch ของร้าน — ถ้า status ถูกย้ายเข้าไป
    // ใน OR ทีละ branch แล้วตกไปหนึ่งอัน เทสที่ยิงแต่ SHOP_L2_PENDING จะยังเขียว (แถวนั้นตกที่
    // เงื่อนไข shopId อยู่แล้ว ไม่ได้ตกเพราะ status) = เทสที่ยืนยันสิ่งที่ตัวเองไม่ได้ตรวจ
    const ownerL1Pending: Row = { userId: 'owner-1', shopId: null, level: 1, status: 'PENDING' }
    expect(matches(w, ownerL1Pending)).toBe(false)
    expect(matches(w, SHOP_L2)).toBe(true)
    expect(matches(w, OWNER_L1)).toBe(true)
  })

  it('[blocker] personal ก็กรอง APPROVED เหมือนเดิม', () => {
    const w = approvedVerificationWhere({ kind: 'personal', userId: 'owner-1' })
    expect(matches(w, { ...OWNER_L1, status: 'REJECTED' })).toBe(false)
    expect(matches(w, OWNER_L1)).toBe(true)
  })
})

describe('ระดับสูงสุดที่ scope แต่ละแบบมองเห็น (สิ่งที่หน้าจอกับ trust score อ่านจริง)', () => {
  const rows = [OWNER_L1, SHOP_L2, STAFF_L1, OTHER_SHOP_L2, SHOP_L2_PENDING]
  const maxLevel = (w: Record<string, unknown>) => {
    const seen = rows.filter((r) => matches(w, r)).map((r) => r.level)
    return seen.length ? Math.max(...seen) : 0
  }

  // เคสจริงของร้าน tanapathardware: มีแค่ OWNER_L1 แถวเดียว — ก่อนแก้ได้ 0 หลังแก้ต้องได้ 1
  it('[blocker] ร้านที่มีเพียง L1 ของเจ้าของ → maxLevel = 1 ไม่ใช่ 0', () => {
    const w = approvedVerificationWhere(businessScope('shop-1', 'owner-1'))
    const onlyOwnerL1 = [OWNER_L1].filter((r) => matches(w, r)).map((r) => r.level)
    expect(Math.max(0, ...onlyOwnerL1)).toBe(1)
  })

  it('ร้านที่มีเอกสาร L2 ด้วย → maxLevel = 2', () => {
    expect(maxLevel(approvedVerificationWhere(businessScope('shop-1', 'owner-1')))).toBe(2)
  })
})

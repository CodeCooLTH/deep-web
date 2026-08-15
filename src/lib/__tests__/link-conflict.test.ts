import { describe, expect, it } from 'vitest'

import {
  classifyLinkConflict,
  shouldCloseHolder,
  type LinkConflictHolder,
} from '@/lib/link-conflict'

/**
 * ตรรกะนี้ตัดสินว่า "ลบบัญชีของคนอื่นได้ไหม" — การกลับด้านผิดฝั่งเดียวแปลว่า
 * ร้านที่มีออเดอร์จริงถูกยึดไป เทสชุดนี้จึงต้องพิสูจน์ด้วย mutation ทุกเงื่อนไข
 * ไม่ใช่แค่เขียนให้เขียว
 */

/** บัญชีค้างจริง ๆ — สมัครผ่าน OAuth แล้วไม่เคยกรอกอะไรต่อเลย */
const ABANDONED: LinkConflictHolder = {
  deletedAt: null,
  phone: null,
  passwordHash: null,
  completedShopCount: 0,
  orderCount: 0,
  shopMemberCount: 0,
  otherAuthAccountCount: 0,
}

describe('classifyLinkConflict', () => {
  it('[blocker] บัญชีค้างที่ไม่มีอะไรเลย → ยึดคืนได้', () => {
    expect(classifyLinkConflict(ABANDONED)).toBe('RECLAIM')
  })

  it('[blocker] บัญชีที่ถูกลบแล้ว → ยึดคืนได้ และไม่ปิดซ้ำ', () => {
    const v = classifyLinkConflict({ ...ABANDONED, deletedAt: new Date('2026-08-01') })
    expect(v).toBe('RECLAIM_DELETED')
    // ปิดซ้ำ = เขียน deletedAt ทับ = รีเซ็ตนาฬิกา retention ย้อนหลัง
    expect(shouldCloseHolder(v)).toBe(false)
  })

  it('[blocker] บัญชีที่ถูกลบแล้ว ยึดคืนได้แม้เคยมีตัวตนครบทุกอย่าง', () => {
    // เจ้าของเดิมล็อกอินกลับเข้าไม่ได้อยู่แล้ว — ไม่มีเหตุผลให้ถือตัวตนไว้ต่อ
    expect(
      classifyLinkConflict({
        deletedAt: new Date('2026-08-01'),
        phone: '0812345678',
        passwordHash: 'x',
        completedShopCount: 3,
        orderCount: 204,
        shopMemberCount: 2,
        otherAuthAccountCount: 2,
      }),
    ).toBe('RECLAIM_DELETED')
  })

  /**
   * 🛑 หัวใจของไฟล์นี้ — สัญญาณ "มีตัวตนจริง" **ตัวเดียว** ต้องบล็อกได้
   *
   * เขียนเป็น it.each เพื่อให้เพิ่ม field ใหม่ใน LinkConflictHolder แล้วลืมเพิ่มเคสไม่ได้ง่าย ๆ
   * (เคสจะยังเขียวถ้าลืม แต่ตัวเทส `ครบทุก field` ด้านล่างจะแดงแทน)
   */
  it.each([
    ['ยืนยันเบอร์แล้ว', { phone: '0812345678' }],
    ['ตั้งรหัสผ่านแล้ว', { passwordHash: '$2a$10$abc' }],
    ['มีร้านที่ตั้ง slug แล้ว', { completedShopCount: 1 }],
    ['มีออเดอร์', { orderCount: 1 }],
    ['เป็นพนักงานร้านคนอื่น', { shopMemberCount: 1 }],
    ['ผูก OAuth เจ้าอื่นไว้ด้วย', { otherAuthAccountCount: 1 }],
  ] as const)('[blocker] %s → ห้ามยึด', (_label, patch) => {
    expect(classifyLinkConflict({ ...ABANDONED, ...patch })).toBe('BLOCKED')
  })

  it('[blocker] ทุก field ที่บ่งชี้ตัวตนต้องถูกตรวจจริง ไม่ใช่ประกาศไว้เฉย ๆ', () => {
    /**
     * กันเคสที่เพิ่ม field เข้า interface แล้วลืมใส่ใน `hasIdentity` — field ที่ประกาศไว้
     * แต่ไม่มีใครอ่านคือ "type ที่ตายแล้วยังโกหกได้" (บทเรียน 2026-08-12 `ProviderConfig`)
     *
     * วิธี: ไล่ทุกคีย์ที่ไม่ใช่ `deletedAt` แล้วตั้งค่าที่บ่งชี้ตัวตน — ต้องได้ BLOCKED ทุกตัว
     */
    const keys = Object.keys(ABANDONED).filter((k) => k !== 'deletedAt') as (keyof LinkConflictHolder)[]
    expect(keys.length, 'ถ้า interface เปลี่ยน ให้ทบทวนเทสชุดนี้ด้วย').toBe(6)

    for (const k of keys) {
      const value = typeof ABANDONED[k] === 'number' ? 1 : 'x'
      const verdict = classifyLinkConflict({ ...ABANDONED, [k]: value } as LinkConflictHolder)
      expect(verdict, `field "${k}" ไม่ถูกนำไปตรวจใน classifyLinkConflict`).toBe('BLOCKED')
    }
  })

  it('[blocker] หลายสัญญาณพร้อมกันก็ยังบล็อก (ไม่ใช่ AND)', () => {
    expect(
      classifyLinkConflict({ ...ABANDONED, phone: '0812345678', orderCount: 5 }),
    ).toBe('BLOCKED')
  })

  it('shouldCloseHolder — ปิดเฉพาะบัญชีค้างที่ยังไม่ถูกลบ', () => {
    expect(shouldCloseHolder('RECLAIM')).toBe(true)
    expect(shouldCloseHolder('RECLAIM_DELETED')).toBe(false)
    expect(shouldCloseHolder('BLOCKED')).toBe(false)
  })
})

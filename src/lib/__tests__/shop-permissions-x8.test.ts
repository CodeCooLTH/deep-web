/**
 * 00078 T11 — X8 (เขียนตั้งค่าแจ้งลูกค้าอัตโนมัติ) = OWNER+MANAGER · อ่านหน้า/snapshot ใช้ H1 (OWNER+MANAGER+CHAT)
 * [blocker] ใส่ CHAT ใน X8 ต้องแดง — ข้อความนี้ส่งในนามร้านถึงลูกค้าทุกคน
 */
import { describe, expect, it } from 'vitest'
import { can, type ShopRole } from '@/lib/shop-permissions'

const ALL: ShopRole[] = ['OWNER', 'MANAGER', 'CHAT', 'BILLING', 'TECHNICIAN']
const H1 = new Set<ShopRole>(['OWNER', 'MANAGER', 'CHAT'])
const X8 = new Set<ShopRole>(['OWNER', 'MANAGER'])

describe('00078 X8 / H1 ทุกบทบาท', () => {
  it.each(ALL)('%s: H1 (GET) ตรงตาราง', (r) => expect(can([r], 'H1')).toBe(H1.has(r)))
  it.each(ALL)('%s: X8 (เขียน) ตรงตาราง [blocker]', (r) => expect(can([r], 'X8')).toBe(X8.has(r)))
  it('CHAT อ่านได้แต่เขียนไม่ได้ [blocker]', () => {
    expect(can(['CHAT'], 'H1')).toBe(true)
    expect(can(['CHAT'], 'X8')).toBe(false)
  })
  it('บทบาทรวม: CHAT+MANAGER เขียนได้, BILLING+TECHNICIAN เขียนไม่ได้', () => {
    expect(can(['CHAT', 'MANAGER'], 'X8')).toBe(true)
    expect(can(['BILLING', 'TECHNICIAN'], 'X8')).toBe(false)
    expect(can([], 'X8')).toBe(false)
  })
})

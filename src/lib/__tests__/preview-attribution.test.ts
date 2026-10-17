import { describe, it, expect } from 'vitest'
import { previewPrefix } from '@/lib/preview-attribution'

describe('previewPrefix (00078 S-10)', () => {
  const has = { hasPreview: true }
  it('ข้อความระบบแจ้ง: ผู้ซื้อไม่เห็น "คุณ:" · ร้านเห็นป้าย SYSTEM (ไม่ใช่เหมือนลูกค้าพิมพ์)', () => {
    expect(previewPrefix('BUYER', { ...has, lastSenderRole: 'BUYER', lastMessageIsSystem: true })).toBeNull()
    expect(previewPrefix('SELLER', { ...has, lastSenderRole: 'BUYER', lastMessageIsSystem: true })).toBe('SYSTEM')
  })
  it('ข้อความปกติเหมือนเดิม', () => {
    expect(previewPrefix('BUYER', { ...has, lastSenderRole: 'BUYER' })).toBe('YOU')
    expect(previewPrefix('BUYER', { ...has, lastSenderRole: 'SHOP' })).toBeNull()
    expect(previewPrefix('SELLER', { ...has, lastSenderRole: 'SHOP' })).toBe('YOU')
    expect(previewPrefix('SELLER', { ...has, lastSenderRole: 'BUYER' })).toBeNull()
    expect(previewPrefix('SELLER', { ...has, lastSenderRole: null })).toBeNull()
  })
  it('ไม่มีพรีวิว → ไม่มีคำนำหน้า', () => {
    expect(previewPrefix('SELLER', { hasPreview: false, lastSenderRole: 'SHOP', lastMessageIsSystem: true })).toBeNull()
  })
  it('mutation: ถ้าไม่ส่งธงระบบ (undefined) ผู้ซื้อจะเห็น "คุณ:" ทันที — เทสข้างบนจึงไวต่อธง', () => {
    expect(previewPrefix('BUYER', { ...has, lastSenderRole: 'BUYER' })).toBe('YOU')
  })
})

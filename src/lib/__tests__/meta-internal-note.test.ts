import { describe, expect, it } from 'vitest'
import { isMetaInternalNote } from '../meta-system-notice'

// ประโยคคัดจากฐาน prod จริง (2026-10-10)
describe('isMetaInternalNote', () => {
  it.each([
    'Lead stage set to Qualified',
    'Auto-label added: Lead stage set to intake.',
    'สมชาย ใจดี replied to an ad.',
    'สมชาย replied to your automated welcome message. To change or remove this greeting, visit Messaging settings.',
    'This message was automatically moved to spam.',
    'You requested ฿400.00. สมชาย can review and confirm this order.',
  ])('ข้อความภายใน: %s', (t) => expect(isMetaInternalNote(t)).toBe(true))

  it.each([
    null,
    '',
    'ส่งของแล้วค่ะ',
    // การ์ด/ไฟล์ที่ส่งถึงลูกค้าจริง — ต้องยังเป็นข้อความร้าน
    '[การ์ดจาก Facebook] Video call — Call again',
    '[การ์ดปุ่มจาก Facebook เช่น ปุ่มโทร — เปิดดูใน Messenger]',
  ])('ไม่ใช่: %s', (t) => expect(isMetaInternalNote(t)).toBe(false))
})

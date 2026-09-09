import { describe, it, expect } from 'vitest'
import {
  DEFAULT_INBOX_PREFERENCE,
  isSameInboxPreference,
  parseInboxFilterPreference,
  serializeInboxFilterPreference,
  type InboxPreference,
} from '@/lib/inbox-filter-pref'
import { DEFAULT_CHAT_FILTER } from '@/app/(paces)/seller/(chat)/inbox/components/chat-list-query'

/**
 * 00018 ส่วนขยาย 2026-09-09 รอบสอง — ปุ่ม "บันทึกเป็นค่าเริ่มต้น"
 *
 * [blocker] ค่านี้เก็บเป็น JSONB ⇒ ฐานข้อมูลบังคับรูปร่างไม่ได้เลย ด่านทั้งหมดอยู่ที่ parser
 * ตัวนี้ตัวเดียว ถ้ามันตกทั้งก้อนเมื่อเจอคีย์แปลก ผู้ใช้จะเสียค่าที่ตั้งไว้ทั้งชุดเงียบ ๆ
 * ถ้ามันปล่อยของแปลกผ่าน ค่านั้นจะเดินทางกลับเข้า query string ทุกครั้งที่โหลดหน้า
 */

const full: InboxPreference = {
  sort: 'LAST_CUSTOMER_MESSAGE',
  filter: {
    status: 'resolved',
    spam: true,
    customerLinked: 'linked',
    hidden: true,
    readState: 'unread',
    tags: ['VIP', 'ค้างชำระ'],
    shipment: 'problem',
  },
  channelTab: 'MESSENGER',
  pageFilter: 'ch-123',
}

describe('parseInboxFilterPreference — ยังไม่เคยบันทึก', () => {
  it('[blocker] inboxFilter = null → ค่าตั้งต้นทั้งชุด แต่ยังเคารพ inboxSort ที่อยู่คนละคอลัมน์', () => {
    const p = parseInboxFilterPreference(null, 'LAST_CUSTOMER_MESSAGE')
    expect(p.filter).toEqual(DEFAULT_CHAT_FILTER)
    expect(p.channelTab).toBe('ALL')
    expect(p.pageFilter).toBe('')
    // 🛑 โหมดเรียงมาจากคอลัมน์ของตัวเอง (บันทึกไว้ตั้งแต่รอบแรก) ห้ามถูกล้างไปด้วย
    expect(p.sort).toBe('LAST_CUSTOMER_MESSAGE')
  })

  it('ค่าเสียหายทั้งก้อน (string / array / number) → ค่าตั้งต้น ไม่ throw', () => {
    for (const bad of ['เละ', [1, 2], 42, undefined]) {
      expect(parseInboxFilterPreference(bad, 'LAST_MESSAGE')).toEqual(DEFAULT_INBOX_PREFERENCE)
    }
  })
})

describe('parseInboxFilterPreference — fail-closed รายฟิลด์ ไม่ใช่ทั้งก้อน', () => {
  it('[blocker] คีย์เดียวพัง ที่เหลือต้องรอด (ค่าที่บันทึกไว้ข้ามเวอร์ชันต้องไม่หายทั้งชุด)', () => {
    const p = parseInboxFilterPreference(
      {
        filter: { ...full.filter, shipment: 'ตัวกรองที่ถูกถอดออกไปแล้ว', status: 'resolved' },
        channelTab: 'MESSENGER',
        pageFilter: 'ch-123',
      },
      'LAST_CUSTOMER_MESSAGE',
    )
    expect(p.filter.shipment).toBe(DEFAULT_CHAT_FILTER.shipment) // ตัวที่พังตกไปค่าตั้งต้น
    expect(p.filter.status).toBe('resolved') // ตัวอื่นรอด
    expect(p.channelTab).toBe('MESSENGER')
    expect(p.pageFilter).toBe('ch-123')
  })

  it('[blocker] คีย์ที่ยังไม่มีในค่าที่บันทึกไว้ (ตัวกรองที่เพิ่งเพิ่มทีหลัง) → ค่าตั้งต้นของคีย์นั้น', () => {
    const p = parseInboxFilterPreference({ filter: { status: 'all' } }, 'LAST_MESSAGE')
    expect(p.filter.status).toBe('all')
    expect(p.filter.tags).toEqual([])
    expect(p.filter.readState).toBe(DEFAULT_CHAT_FILTER.readState)
    expect(p.filter.shipment).toBe(DEFAULT_CHAT_FILTER.shipment)
  })

  it('ค่าที่ชนิดผิด (boolean เป็น string) ตกไปค่าตั้งต้น ไม่ถูกแปลงเป็น truthy', () => {
    const p = parseInboxFilterPreference({ filter: { spam: 'true', hidden: 1 } }, 'LAST_MESSAGE')
    expect(p.filter.spam).toBe(false)
    expect(p.filter.hidden).toBe(false)
  })
})

describe('parseInboxFilterPreference — แท็ก (ค่านี้เดินทางกลับเข้า query string ทุกครั้งที่โหลดหน้า)', () => {
  it('[blocker] จำกัด 20 อัน และตัดอันที่ยาวเกิน 40 ตัวอักษรทิ้ง', () => {
    const p = parseInboxFilterPreference(
      { filter: { tags: [...Array(30).keys()].map((i) => `t${i}`).concat(['x'.repeat(41)]) } },
      'LAST_MESSAGE',
    )
    expect(p.filter.tags).toHaveLength(20)
    expect(p.filter.tags.some((t) => t.length > 40)).toBe(false)
  })

  it('ตัดค่าว่าง/ช่องว่างล้วน/ค่าที่ไม่ใช่สตริงออก', () => {
    const p = parseInboxFilterPreference({ filter: { tags: ['  VIP  ', '', '   ', 5, null] } }, 'LAST_MESSAGE')
    expect(p.filter.tags).toEqual(['VIP'])
  })
})

describe('serialize → parse ไป-กลับ', () => {
  it('[blocker] ค่าที่บันทึกแล้วอ่านกลับต้องได้ของเดิมเป๊ะ', () => {
    expect(parseInboxFilterPreference(serializeInboxFilterPreference(full), full.sort)).toEqual(full)
  })

  it('serialize ไม่เก็บ sort ลง JSON (มันอยู่คอลัมน์ของตัวเอง — เก็บสองที่แล้ววันหนึ่งจะไม่ตรงกัน)', () => {
    expect(serializeInboxFilterPreference(full)).not.toHaveProperty('sort')
  })
})

describe('isSameInboxPreference — ตัวตัดสินว่าปุ่ม "บันทึก" ควรกดได้ไหม', () => {
  it('เหมือนกันทุกฟิลด์ → true', () => {
    expect(isSameInboxPreference(full, { ...full, filter: { ...full.filter } })).toBe(true)
  })

  it('[blocker] ต่างที่ sort อย่างเดียวก็ต้องรู้ (ไม่งั้นสลับโหมดแล้วกดบันทึกไม่ได้)', () => {
    expect(isSameInboxPreference(full, { ...full, sort: 'LAST_MESSAGE' })).toBe(false)
  })

  it('แท็กชุดเดียวกันแต่สลับลำดับ → ถือว่าเหมือนกัน', () => {
    const swapped = { ...full, filter: { ...full.filter, tags: ['ค้างชำระ', 'VIP'] } }
    expect(isSameInboxPreference(full, swapped)).toBe(true)
  })

  it('[blocker] แท็กต่างกันจริง → ต้องรู้ (จำนวนเท่ากันแต่คนละตัว)', () => {
    const other = { ...full, filter: { ...full.filter, tags: ['VIP', 'รอโอน'] } }
    expect(isSameInboxPreference(full, other)).toBe(false)
  })

  it('ต่างที่ตัวกรองแต่ละตัว → รู้ครบทุกตัว', () => {
    const fields: Partial<InboxPreference['filter']>[] = [
      { status: 'all' },
      { spam: false },
      { customerLinked: 'all' },
      { hidden: false },
      { readState: 'all' },
      { shipment: 'all' },
    ]
    for (const patch of fields) {
      expect(isSameInboxPreference(full, { ...full, filter: { ...full.filter, ...patch } })).toBe(false)
    }
    expect(isSameInboxPreference(full, { ...full, channelTab: 'ALL' })).toBe(false)
    expect(isSameInboxPreference(full, { ...full, pageFilter: '' })).toBe(false)
  })
})

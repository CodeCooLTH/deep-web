/**
 * feature 00048 — เทสของ SSOT/ตรรกะคลังไฟล์
 *
 * ทุกเคส [blocker] พิสูจน์ด้วย mutation แล้ว (คืนตรรกะผิดกลับไปแล้วต้องแดง) — ดู TestCase.md §1
 * เหตุผลที่ต้องมีไฟล์นี้: ตรรกะพวกนี้ตัดสินว่า "ปุ่มโผล่ไหม" ซึ่งถ้าเขียนกลับด้าน
 * tsc/build/detector/grep จะผ่านหมดเพราะชนิดถูกทุกตัวอักษร — สิ่งที่ผิดคือความหมาย
 */
import { describe, it, expect } from 'vitest'
import {
  LIBRARY_COPY,
  LIBRARY_ICONS,
  isLibraryEligible,
  toLibraryKind,
  resolveLibraryOwner,
  libraryTileAriaLabel,
  librarySenderLabel,
  normalizeLibraryText,
} from './customer-file-library'

const img = { type: 'IMAGE', hasFile: true }

describe('isLibraryEligible', () => {
  it('[blocker] TC-01: รูปปกติเก็บได้', () => {
    expect(isLibraryEligible(img)).toBe(true)
  })

  it('[blocker] TC-02: สติกเกอร์เก็บไม่ได้ แม้ type จะเป็น IMAGE เหมือนรูปทุกประการ', () => {
    expect(isLibraryEligible({ ...img, isSticker: true })).toBe(false)
    // isSticker ที่เป็น null/undefined = ไม่ใช่สติกเกอร์ (ข้อความเก่าก่อนมีธงนี้)
    expect(isLibraryEligible({ ...img, isSticker: null })).toBe(true)
  })

  it('[blocker] TC-03: รูปในการ์ด carousel เก็บไม่ได้ แม้จะเป็นรูปจริง', () => {
    expect(isLibraryEligible({ ...img, fromCard: true })).toBe(false)
  })

  it('[blocker] TC-04: AUDIO / PRODUCT / ORDER / TEXT เก็บไม่ได้', () => {
    for (const type of ['AUDIO', 'PRODUCT', 'ORDER', 'TEXT']) {
      expect(isLibraryEligible({ type, hasFile: true })).toBe(false)
    }
  })

  it('[blocker] TC-05: ชนิดที่ยังไม่รู้จัก ต้อง fail-closed (ไม่ใช่หลุดเข้ามาเงียบ ๆ)', () => {
    expect(isLibraryEligible({ type: 'SOMETHING_NEW_IN_2027', hasFile: true })).toBe(false)
  })

  it('[blocker] TC-06: ไม่มีไฟล์แนบ = เก็บไม่ได้ ไม่ว่า type จะเป็นอะไร', () => {
    expect(isLibraryEligible({ type: 'IMAGE', hasFile: false })).toBe(false)
    expect(isLibraryEligible({ type: 'FILE', hasFile: false })).toBe(false)
  })

  it('VIDEO และ FILE เก็บได้', () => {
    expect(isLibraryEligible({ type: 'VIDEO', hasFile: true })).toBe(true)
    expect(isLibraryEligible({ type: 'FILE', hasFile: true })).toBe(true)
  })
})

describe('toLibraryKind', () => {
  it('TC-10: ชนิดนอก allow-list คืน null ไม่ throw', () => {
    expect(toLibraryKind('AUDIO')).toBeNull()
    expect(toLibraryKind('')).toBeNull()
    expect(toLibraryKind('image')).toBeNull() // case-sensitive โดยตั้งใจ
  })

  it('คืนชนิดเดิมเมื่ออยู่ใน allow-list', () => {
    expect(toLibraryKind('IMAGE')).toBe('IMAGE')
    expect(toLibraryKind('VIDEO')).toBe('VIDEO')
    expect(toLibraryKind('FILE')).toBe('FILE')
  })
})

describe('resolveLibraryOwner', () => {
  it('[blocker] TC-07: มี externalContactId → ผูกกับ "คน" และต้องไม่มี conversationId ติดมาด้วย', () => {
    const owner = resolveLibraryOwner({ id: 'conv-1', externalContactId: 'ec-9' })
    expect(owner).toEqual({ externalContactId: 'ec-9' })
    // ถ้าเผลอส่งทั้งคู่ CHECK ของ DB จะปฏิเสธทั้งแถว — ต้องกันตั้งแต่ตรงนี้
    expect(owner.conversationId).toBeUndefined()
  })

  it('[blocker] TC-08: เธรด DEEP (ไม่มี ExternalContact) → ผูกกับเธรด', () => {
    const owner = resolveLibraryOwner({ id: 'conv-1', externalContactId: null })
    expect(owner).toEqual({ conversationId: 'conv-1' })
    expect(owner.externalContactId).toBeUndefined()
  })
})

describe('libraryTileAriaLabel', () => {
  const base = { senderName: 'ณัฐธิดา ศรีสุวรรณวัฒนกุล', senderRole: 'BUYER', sentAt: '2026-08-08T07:32:11.000Z' }

  it('TC-09: ผันตามชนิดจริง ไม่ hardcode "รูปจาก"', () => {
    expect(libraryTileAriaLabel({ ...base, kind: 'IMAGE', fileName: null })).toContain('รูปจาก ณัฐธิดา')
    expect(libraryTileAriaLabel({ ...base, kind: 'VIDEO', fileName: null })).toContain('วิดีโอจาก ณัฐธิดา')
    expect(libraryTileAriaLabel({ ...base, kind: 'FILE', fileName: 'ใบเสนอราคา.pdf' })).toContain(
      'ใบเสนอราคา.pdf จาก ณัฐธิดา',
    )
  })

  it('ไฟล์เอกสารที่ไม่มีชื่อ ต้องไม่อ่านออกมาเป็นชื่อว่าง', () => {
    expect(libraryTileAriaLabel({ ...base, kind: 'FILE', fileName: '   ' })).toContain('ไฟล์แนบ จาก')
  })

  it('ทุกชนิดต้องมีวันที่ต่อท้ายเสมอ', () => {
    for (const kind of ['IMAGE', 'VIDEO', 'FILE'] as const) {
      expect(libraryTileAriaLabel({ ...base, kind, fileName: 'x.pdf' })).toMatch(/ · \d+ .+ 2569$/)
    }
  })
})

describe('librarySenderLabel', () => {
  it('ไม่มีชื่อ → ใช้ฝั่งผู้ส่งแทน ไม่ใช่คำว่า "ไม่ทราบ"', () => {
    expect(librarySenderLabel({ senderName: null, senderRole: 'BUYER' })).toBe('ลูกค้า')
    expect(librarySenderLabel({ senderName: '  ', senderRole: 'SHOP' })).toBe('ร้าน')
  })
})

describe('normalizeLibraryText', () => {
  it('TC-28: ช่องว่างล้วน → null (ไม่ใช่สตริงว่างที่กลายเป็นชื่อว่าง ๆ บนจอ)', () => {
    expect(normalizeLibraryText('   ', 120)).toBeNull()
    expect(normalizeLibraryText('', 120)).toBeNull()
    expect(normalizeLibraryText(null, 120)).toBeNull()
    expect(normalizeLibraryText(undefined, 120)).toBeNull()
  })

  it('ตัดตามเพดานความยาว และ trim ก่อนเสมอ', () => {
    expect(normalizeLibraryText('  สลิปมัดจำ  ', 120)).toBe('สลิปมัดจำ')
    expect(normalizeLibraryText('ก'.repeat(200), 120)).toHaveLength(120)
  })
})

describe('LIBRARY_COPY (Hard Rule 16)', () => {
  it('[blocker] TC-11: คำสั่งเก็บ/เอาออก ห้ามมีคำว่า "บันทึก" — ชนกับ "บันทึกวิดีโอ" ที่แปลว่าโหลดลงเครื่อง', () => {
    const actionCopy = [
      LIBRARY_COPY.save,
      LIBRARY_COPY.unsave,
      LIBRARY_COPY.savedToast,
      LIBRARY_COPY.removedToast,
      LIBRARY_COPY.saveFailed,
      LIBRARY_COPY.removeFailed,
      LIBRARY_COPY.sectionTitle,
      LIBRARY_COPY.emptyTitle,
      LIBRARY_COPY.emptyBody,
    ]
    for (const s of actionCopy) expect(s).not.toContain('บันทึก')
  })

  it('คำว่า "บันทึก" ใช้ได้เฉพาะปุ่มยืนยันฟอร์มแก้ไข (คนละบริบท)', () => {
    expect(LIBRARY_COPY.editSubmit).toBe('บันทึก')
  })

  it('[blocker] สถานะ "เก็บแล้ว" ต้องใช้ bookmark-filled ไม่ใช่ bookmark-off', () => {
    // -off สื่อว่า "ปิดใช้งาน" ไม่ใช่ "อยู่ในคลังแล้ว" (ผู้ใช้เคาะ 2026-08-13)
    expect(LIBRARY_ICONS.saved).toBe('bookmark-filled')
    expect(LIBRARY_ICONS.saved).not.toBe(LIBRARY_ICONS.remove)
  })
})

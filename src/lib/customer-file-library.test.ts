/**
 * feature 00048 — เทสของ SSOT/ตรรกะคลังไฟล์
 *
 * ทุกเคส [blocker] พิสูจน์ด้วย mutation แล้ว (คืนตรรกะผิดกลับไปแล้วต้องแดง) — ดู TestCase.md §1
 * เหตุผลที่ต้องมีไฟล์นี้: ตรรกะพวกนี้ตัดสินว่า "ปุ่มโผล่ไหม" ซึ่งถ้าเขียนกลับด้าน
 * tsc/build/detector/grep จะผ่านหมดเพราะชนิดถูกทุกตัวอักษร — สิ่งที่ผิดคือความหมาย
 */
import { describe, it, expect } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import { en } from '@/i18n/dictionaries/en'
import {
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
  // ป้อน dictionary จริง ไม่ใช่ค่าปลอม — เทสจึงพังทันทีถ้ามีคนลบคีย์ออกจาก th.ts

  it('TC-09: ผันตามชนิดจริง ไม่ hardcode "รูปจาก"', () => {
    expect(libraryTileAriaLabel({ ...base, kind: 'IMAGE', fileName: null }, th.inbox)).toContain('รูปจาก ณัฐธิดา')
    expect(libraryTileAriaLabel({ ...base, kind: 'VIDEO', fileName: null }, th.inbox)).toContain('วิดีโอจาก ณัฐธิดา')
    expect(libraryTileAriaLabel({ ...base, kind: 'FILE', fileName: 'ใบเสนอราคา.pdf' }, th.inbox)).toContain(
      'ใบเสนอราคา.pdf จาก ณัฐธิดา',
    )
  })

  it('ไฟล์เอกสารที่ไม่มีชื่อ ต้องไม่อ่านออกมาเป็นชื่อว่าง', () => {
    expect(libraryTileAriaLabel({ ...base, kind: 'FILE', fileName: '   ' }, th.inbox)).toContain('ไฟล์แนบ จาก')
  })

  it('ทุกชนิดต้องมีวันที่ต่อท้ายเสมอ', () => {
    for (const kind of ['IMAGE', 'VIDEO', 'FILE'] as const) {
      expect(libraryTileAriaLabel({ ...base, kind, fileName: 'x.pdf' }, th.inbox)).toMatch(/ · \d+ .+ 2569$/)
    }
  })
})

describe('librarySenderLabel', () => {
  it('ไม่มีชื่อ → ใช้ฝั่งผู้ส่งแทน ไม่ใช่คำว่า "ไม่ทราบ"', () => {
    expect(librarySenderLabel({ senderName: null, senderRole: 'BUYER' }, th.inbox)).toBe('ลูกค้า')
    expect(librarySenderLabel({ senderName: '  ', senderRole: 'SHOP' }, th.inbox)).toBe('ร้าน')
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

describe('คำในคลังไฟล์ (Hard Rule 16 + i18n 00047)', () => {
  it('[blocker] TC-11: คำสั่งเก็บ/เอาออก ห้ามมีคำว่า "บันทึก" — ชนกับ "บันทึกวิดีโอ"/"บันทึกรูป" ที่แปลว่าโหลดลงเครื่อง', () => {
    const actionCopy = [
      th.inbox.librarySave,
      th.inbox.libraryUnsave,
      th.inbox.librarySavedToast,
      th.inbox.libraryRemovedToast,
      th.inbox.librarySaveFailed,
      th.inbox.libraryRemoveFailed,
      th.inbox.librarySectionTitle,
      th.inbox.libraryEmptyTitle,
      th.inbox.libraryEmptyBody,
    ]
    for (const s of actionCopy) expect(s).not.toContain('บันทึก')
  })

  it('คำว่า "บันทึก" ใช้ได้เฉพาะปุ่มยืนยันฟอร์มแก้ไข (คนละบริบท)', () => {
    expect(th.inbox.libraryEditSubmit).toBe('บันทึก')
  })

  it('[blocker] สถานะ "เก็บแล้ว" ต้องใช้ bookmark-filled ไม่ใช่ bookmark-off', () => {
    // -off สื่อว่า "ปิดใช้งาน" ไม่ใช่ "อยู่ในคลังแล้ว" (ผู้ใช้เคาะ 2026-08-13)
    expect(LIBRARY_ICONS.saved).toBe('bookmark-filled')
    expect(LIBRARY_ICONS.saved).not.toBe(LIBRARY_ICONS.remove)
  })

  it('[blocker] ทุกคีย์ของคลังไฟล์ต้องมีครบทั้ง th และ en และห้ามเป็นค่าว่าง', () => {
    // 00047 บันทึกไว้เองว่า "ค่าคงที่ระดับ module ฝังข้อความไทย = ค้างเป็นไทยตลอดไป"
    // เทสนี้คือด่านที่กันไม่ให้คีย์ใหม่ของฟีเจอร์นี้ตกกลับไปเป็นแบบนั้น
    const keys = Object.keys(th.inbox).filter((k) => k.startsWith('library'))
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) {
      const thv = (th.inbox as unknown as Record<string, string>)[k]
      const env = (en.inbox as unknown as Record<string, string>)[k]
      expect(typeof env, `en ขาดคีย์ ${k}`).toBe('string')
      expect(env.trim(), `en.${k} ว่าง`).not.toBe('')
      // en ที่ลอกไทยมาทั้งดุ้น = ยังไม่ได้แปล (ยกเว้นคีย์ที่เป็น placeholder ล้วน)
      expect(env, `en.${k} ยังเป็นข้อความไทยเดิม`).not.toBe(thv)
    }
  })

  it('[blocker] เทมเพลตที่มี placeholder ต้องมี placeholder ครบทั้งสองภาษา', () => {
    const templated = ['librarySeeAll', 'libraryModalTitle', 'libraryAriaImage', 'libraryAriaVideo', 'libraryAriaFile', 'librarySentBy', 'librarySavedBy'] as const
    for (const k of templated) {
      const thv = (th.inbox as unknown as Record<string, string>)[k]
      const env = (en.inbox as unknown as Record<string, string>)[k]
      const slots = (v: string) => (v.match(/\{(\w+)\}/g) ?? []).sort().join(',')
      // ลืม placeholder ในภาษาใดภาษาหนึ่ง = ค่าหายไปจากประโยคเงียบ ๆ เฉพาะภาษานั้น
      expect(slots(env), `${k}: placeholder ของ en ไม่ตรงกับ th`).toBe(slots(thv))
      expect(slots(thv), `${k}: ไม่มี placeholder เลย`).not.toBe('')
    }
  })
})

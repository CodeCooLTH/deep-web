// [blocker] กติกา "ใครก็อปใคร" ของ duplicate_listing (feature 00060 · OQ-13)

import { describe, expect, it } from 'vitest'
import { countCopiedImages } from './fingerprint-match'

const EARLY = new Date('2026-01-01T00:00:00Z')
const LATE = new Date('2026-06-01T00:00:00Z')

describe('countCopiedImages', () => {
  it('รูปที่ร้านอื่นประกาศไว้ก่อน → นับว่าก็อปมา', () => {
    expect(
      countCopiedImages({
        imageFileIds: ['a.jpg'],
        own: [{ fileId: 'a.jpg', sha256: 'H', firstListedAt: LATE }],
        foreign: [{ sha256: 'H', firstListedAt: EARLY }],
      }),
    ).toEqual({ hashedImageCount: 1, copiedFromOtherShopCount: 1 })
  })

  it('🛑 mutation: เหยื่อที่ถูกก็อป (เราประกาศก่อน) ต้อง **ไม่** ถูกนับ — เปลี่ยนเป็น "มีร้านอื่นถืออยู่" เคสนี้ต้องแดง', () => {
    // นี่คือเคสที่แยก "ตัวตรวจจับที่ใช้ได้" ออกจาก "ตัวตรวจจับที่ลงโทษคนถูกกระทำ"
    // ร้านสุจริตอัปรูปตัวเองไว้ตั้งแต่ ม.ค. แล้วมิจฉาชีพก็อปไปลงเดือน มิ.ย.
    expect(
      countCopiedImages({
        imageFileIds: ['a.jpg'],
        own: [{ fileId: 'a.jpg', sha256: 'H', firstListedAt: EARLY }],
        foreign: [{ sha256: 'H', firstListedAt: LATE }],
      }),
    ).toEqual({ hashedImageCount: 1, copiedFromOtherShopCount: 0 })
  })

  it('🛑 mutation: เวลาประกาศเท่ากันเป๊ะ ต้องไม่ถูกนับ — เปลี่ยน < เป็น <= เคสนี้ต้องแดง', () => {
    // บอกไม่ได้ว่าใครก่อน ⇒ ห้ามกล่าวหา
    expect(
      countCopiedImages({
        imageFileIds: ['a.jpg'],
        own: [{ fileId: 'a.jpg', sha256: 'H', firstListedAt: EARLY }],
        foreign: [{ sha256: 'H', firstListedAt: new Date(EARLY) }],
      }),
    ).toEqual({ hashedImageCount: 1, copiedFromOtherShopCount: 0 })
  })

  it('🛑 mutation: รูปคนละเนื้อไฟล์ต้องไม่ชนกัน — เทียบด้วยอย่างอื่นแทน sha256 เคสนี้ต้องแดง', () => {
    expect(
      countCopiedImages({
        imageFileIds: ['a.jpg'],
        own: [{ fileId: 'a.jpg', sha256: 'H1', firstListedAt: LATE }],
        foreign: [{ sha256: 'H2', firstListedAt: EARLY }],
      }),
    ).toEqual({ hashedImageCount: 1, copiedFromOtherShopCount: 0 })
  })

  it('🛑 mutation: รูปที่ยังแฮชไม่สำเร็จต้องไม่ถูกนับเป็น "แฮชแล้ว" — เคสนี้ต้องแดง', () => {
    // ถ้านับ null เป็นแฮชแล้ว ห้องที่แฮชไม่ผ่านสักใบจะได้ "ผ่าน" ทันทีเพราะครบตามจำนวน
    expect(
      countCopiedImages({
        imageFileIds: ['a.jpg', 'b.jpg'],
        own: [
          { fileId: 'a.jpg', sha256: 'H', firstListedAt: LATE },
          { fileId: 'b.jpg', sha256: null, firstListedAt: LATE },
        ],
        foreign: [],
      }),
    ).toEqual({ hashedImageCount: 1, copiedFromOtherShopCount: 0 })
  })

  it('รูปที่ยังไม่มีแถวลายนิ้วมือเลย ไม่ถูกนับทั้งสองฝั่ง', () => {
    expect(
      countCopiedImages({ imageFileIds: ['ghost.jpg'], own: [], foreign: [] }),
    ).toEqual({ hashedImageCount: 0, copiedFromOtherShopCount: 0 })
  })

  it('นับหลายใบพร้อมกันได้ถูกต้อง', () => {
    expect(
      countCopiedImages({
        imageFileIds: ['a.jpg', 'b.jpg', 'c.jpg'],
        own: [
          { fileId: 'a.jpg', sha256: 'H1', firstListedAt: LATE },
          { fileId: 'b.jpg', sha256: 'H2', firstListedAt: LATE },
          { fileId: 'c.jpg', sha256: 'H3', firstListedAt: LATE },
        ],
        foreign: [
          { sha256: 'H1', firstListedAt: EARLY },
          { sha256: 'H3', firstListedAt: EARLY },
        ],
      }),
    ).toEqual({ hashedImageCount: 3, copiedFromOtherShopCount: 2 })
  })
})

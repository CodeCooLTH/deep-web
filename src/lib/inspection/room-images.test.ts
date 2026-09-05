// [blocker] เกณฑ์ "ร้านเปลี่ยนภาพประกาศ" (feature 00060 · T15 · FR-INS-028)

import { describe, expect, it } from 'vitest'
import { roomListingImagesChanged } from './room-images'

describe('roomListingImagesChanged', () => {
  it('🛑 mutation: ตีว่า "ส่ง images มา = เปลี่ยน" → เคสนี้ต้องแดง', () => {
    // RoomForm ส่ง images กลับมาทุกครั้งที่กดบันทึกแม้แก้แค่ราคา ⇒ เกณฑ์แบบมีคีย์จะทำให้
    // ป้ายรูปตกเป็น "รอตรวจซ้ำ" ทุกครั้งที่ร้านแตะฟอร์ม แล้วไม่มีวันขึ้นเขียวอีกเลย
    expect(roomListingImagesChanged(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(false)
  })

  it('เพิ่มรูปใหม่ = เปลี่ยน (รูปที่ไม่เคยถูกตรวจโผล่เข้ามา)', () => {
    expect(roomListingImagesChanged(['a', 'b'], ['a', 'b', 'c'])).toBe(true)
  })

  it('ลบรูปออก = เปลี่ยน', () => {
    expect(roomListingImagesChanged(['a', 'b'], ['a'])).toBe(true)
  })

  it('สลับรูปเป็นคนละใบทั้งที่จำนวนเท่ากัน = เปลี่ยน', () => {
    expect(roomListingImagesChanged(['a', 'b'], ['a', 'z'])).toBe(true)
  })

  it('🛑 เปลี่ยนรูปปกทั้งที่ชุดเดิม = เปลี่ยน (ผู้ซื้อเห็นคนละใบเป็นอย่างแรก)', () => {
    expect(roomListingImagesChanged(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(true)
  })

  it('สลับลำดับรูปที่ไม่ใช่ปก = ไม่นับ (ไม่มีรูปใหม่ ปกยังใบเดิม)', () => {
    expect(roomListingImagesChanged(['a', 'b', 'c'], ['a', 'c', 'b'])).toBe(false)
  })

  it('ห้องที่ยังไม่มีรูปเลยแล้วเพิ่มรูปแรก = เปลี่ยน', () => {
    expect(roomListingImagesChanged([], ['a'])).toBe(true)
  })
})

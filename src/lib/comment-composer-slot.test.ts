import { describe, expect, it } from 'vitest'
import { isReplyTargetVisible, resolveComposerSlot } from './comment-composer-slot'

const node = (id: string, replies: string[] = []) => ({
  comment: { id },
  replies: replies.map((r) => ({ id: r })),
})

/**
 * ถ้าเงื่อนไขนี้ผิด ผู้ใช้จะติดในจอที่ **ไม่มีช่องพิมพ์และไม่มีปุ่มยกเลิก** — ทางตันจริงที่
 * impeccable critique 2026-08-20 จับได้ (P1-A) และไม่มี tsc/build/theme-guard ตัวไหนเห็น
 * เพราะ JSX ถูกชนิดทุกตัวอักษร สิ่งที่ผิดคือความหมาย
 */
describe('[blocker] resolveComposerSlot — ช่องพิมพ์ต้องมีที่ยืนเสมอ', () => {
  it('ยังไม่ได้เลือกจะตอบใคร = แถบล่าง', () => {
    expect(resolveComposerSlot(null, false)).toBe('bottom')
  })

  it('กำลังตอบใครอยู่ และเป้าหมายยังมองเห็น = แทรกใต้บับเบิลนั้น', () => {
    expect(resolveComposerSlot('c1', true)).toBe('inline')
  })

  it('🛑 กำลังตอบอยู่ แต่เป้าหมายหลุดจากรายการที่มองเห็น = ตกกลับไปแถบล่าง ไม่ใช่หายไปทั้งคู่', () => {
    // นี่คือเคสที่พัง: กด "ตอบ" บนคอมเมนต์ที่ตอบแล้ว → กดชิป "ยังไม่ตอบ" → เป้าหมายหลุด
    expect(resolveComposerSlot('c1', false)).toBe('bottom')
  })

  it('ไม่มีทางคืนค่าที่แปลว่า "ไม่มีช่องพิมพ์" — ทุก input คืน inline หรือ bottom เท่านั้น', () => {
    for (const id of [null, 'c1']) {
      for (const visible of [true, false]) {
        expect(['inline', 'bottom']).toContain(resolveComposerSlot(id, visible))
      }
    }
  })
})

describe('[blocker] isReplyTargetVisible', () => {
  const tree = [node('p1', ['r1', 'r2']), node('p2')]

  it('เจอคอมเมนต์ระดับบน', () => {
    expect(isReplyTargetVisible('p2', tree)).toBe(true)
  })

  it('เจอคอมเมนต์ลูก (ตอบใต้คอมเมนต์อื่น)', () => {
    expect(isReplyTargetVisible('r2', tree)).toBe(true)
  })

  it('เป้าหมายถูกกรองออกไปแล้ว = false', () => {
    expect(isReplyTargetVisible('gone', tree)).toBe(false)
  })

  it('ยังไม่ได้เลือกใคร = false (ไม่ throw)', () => {
    expect(isReplyTargetVisible(null, tree)).toBe(false)
  })

  it('รายการว่าง (กรองจนไม่เหลืออะไร) = false ไม่พัง', () => {
    expect(isReplyTargetVisible('p1', [])).toBe(false)
  })
})

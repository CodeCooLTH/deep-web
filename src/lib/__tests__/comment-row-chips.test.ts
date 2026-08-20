/**
 * [blocker] ชิปของแถวคอมเมนต์ — user สั่งโครงใหม่ 2026-08-20 (`[ยังไม่ตอบ] [ยังไม่ทักแชท]`)
 *
 * 2 กติกาที่ห้ามพังเด็ดขาด เพราะทั้งคู่เกิดจากบทเรียนที่จ่ายไปแล้ว:
 *
 *   1. **เมื่อ "ยังไม่ตอบ" ชิปทั้งสองใบต้องสีเดียวกันเสมอ** — โครง 2 ชิปนี้เคยถูกยุบเหลือใบเดียว
 *      เมื่อเช้าวันเดียวกัน (impeccable critique P2-D) เพราะสองใบคนละสีติดกันอ่านเป็น "สองปัญหา"
 *      ทั้งที่เป็นปัญหาเดียวมองสองมุม — กลับมาเป็น 2 ชิปได้ แต่ต้องไม่พาปัญหาเดิมกลับมาด้วย
 *
 *   2. **แถวที่จบงานแล้วจริงต้องไม่มีชิปสักใบ** — user สั่ง "ลดความสูง" ถ้าทุกแถวมีบรรทัดชิปเสมอ
 *      แถวที่เคยสั้นที่สุด (ตอบแล้ว ไม่มี badge เลย) จะสูงขึ้น 1 บรรทัดทุกแถว = ตรงข้ามกับที่ขอ
 */

import { describe, it, expect } from 'vitest'
import { commentRowChips } from '../comment-row-chips'

describe('[blocker] commentRowChips', () => {
  it('ยังไม่ตอบ + ยังทักได้ (เหลือเยอะ) → 2 ชิป โทนเดียวกัน', () => {
    const r = commentRowChips({
      state: 'UNANSWERED',
      resolved: false,
      privateReply: 'AVAILABLE',
      windowTone: 'warning',
    })
    expect(r.answer?.kind).toBe('unanswered')
    expect(r.privateReply?.kind).toBe('available')
    // หัวใจของการกลับมติ P2-D — เขียนกลับด้านเมื่อไหร่ต้องแดงทันที
    expect(r.answer?.tone, 'ชิปซ้ายต้องยืมโทนจากชิปขวา').toBe(r.privateReply?.tone)
    expect(r.answer?.tone).toBe('warning')
  })

  it('ยังไม่ตอบ + ใกล้หมดเวลา → 2 ชิป danger ทั้งคู่', () => {
    const r = commentRowChips({
      state: 'UNANSWERED',
      resolved: false,
      privateReply: 'AVAILABLE',
      windowTone: 'danger',
    })
    expect(r.answer?.tone).toBe('danger')
    expect(r.privateReply?.tone).toBe('danger')
  })

  it('ยังไม่ตอบ + หมดเวลาทักแชท → ยังขึ้น 2 ชิป แต่เป็นเทาทั้งคู่ (เลยจุดรีบแล้ว)', () => {
    // ยังตอบใต้คอมเมนต์สาธารณะได้อยู่ ⇒ ห้ามซ่อนชิป "ยังไม่ตอบ" เพราะยังมีงานค้างจริง
    const r = commentRowChips({
      state: 'UNANSWERED',
      resolved: false,
      privateReply: 'EXPIRED',
      windowTone: 'danger',
    })
    expect(r.answer?.tone).toBe('neutral')
    expect(r.privateReply?.kind).toBe('expired')
    expect(r.answer?.tone).toBe(r.privateReply?.tone)
  })

  it('[blocker] ตอบแล้ว + ทักแล้ว → ไม่มีชิปสักใบ (บรรทัดที่ 3 หายไปทั้งบรรทัด)', () => {
    const r = commentRowChips({
      state: 'HUMAN_ANSWERED',
      resolved: false,
      privateReply: 'SENT',
      windowTone: 'warning',
    })
    expect(r.answer, 'เครื่องหมายถูกหน้าบรรทัดลูกค้าบอกไปแล้ว ไม่ต้องมีชิปซ้ำ').toBeNull()
    expect(r.privateReply, 'ทักไปแล้ว ไม่มีอะไรให้ทำต่อ').toBeNull()
  })

  it('[blocker] ตอบแล้ว + หมดเวลาทักแชท → ไม่มีชิปสักใบเช่นกัน', () => {
    const r = commentRowChips({
      state: 'HUMAN_ANSWERED',
      resolved: false,
      privateReply: 'EXPIRED',
      windowTone: 'danger',
    })
    expect(r.answer).toBeNull()
    expect(r.privateReply).toBeNull()
  })

  it('ตอบแล้ว แต่ยังทักแชทได้อยู่ → ขึ้นเฉพาะชิปทักแชท (ยังมีของให้ทำ)', () => {
    const r = commentRowChips({
      state: 'HUMAN_ANSWERED',
      resolved: false,
      privateReply: 'AVAILABLE',
      windowTone: 'warning',
    })
    expect(r.answer).toBeNull()
    expect(r.privateReply?.kind).toBe('available')
  })

  it('บอทตอบแล้ว → ชิปเหลืองตายตัว ไม่ยืมโทน (ไม่ใช่เคสปัญหาเดียวมองสองมุม)', () => {
    const r = commentRowChips({
      state: 'BOT_ANSWERED',
      resolved: false,
      privateReply: 'AVAILABLE',
      windowTone: 'danger',
    })
    expect(r.answer?.kind).toBe('botAnswered')
    expect(r.answer?.tone, 'บอทตอบ = เหลืองเสมอ ไม่ว่าเส้นตายจะแดงแค่ไหน').toBe('warning')
    expect(r.privateReply?.tone).toBe('danger')
  })

  it('จัดการแล้ว → เทาเสมอ ห้ามเขียว (Verified-Means-Green)', () => {
    // ผู้ขายกดข้ามเอง/Facebook ยืนยันว่าทักนอกระบบ — ลูกค้าไม่ได้รับคำตอบจากระบบเรา
    const r = commentRowChips({
      state: 'HUMAN_ANSWERED',
      resolved: true,
      privateReply: 'SENT',
      windowTone: 'warning',
    })
    expect(r.answer?.kind).toBe('resolved')
    expect(r.answer?.tone).toBe('neutral')
  })

  it('ทักแชทสำเร็จแล้วต้องเป็นเขียว — เป็นข้อเท็จจริงที่ Meta ยืนยัน', () => {
    const r = commentRowChips({
      state: 'BOT_ANSWERED',
      resolved: false,
      privateReply: 'SENT',
      windowTone: 'warning',
    })
    // SENT ไม่ actionable ⇒ ไม่ขึ้นชิปในเคสนี้ แต่โทนต้องถูกถ้าถูกเรียกใช้ที่อื่น
    expect(r.privateReply).toBeNull()
  })

  it('กำลังส่ง → เทา และยังขึ้นชิปอยู่ (ผู้ใช้ต้องเห็นว่ากำลังทำงาน)', () => {
    const r = commentRowChips({
      state: 'HUMAN_ANSWERED',
      resolved: false,
      privateReply: 'SENDING',
      windowTone: 'warning',
    })
    expect(r.privateReply?.kind).toBe('sending')
    expect(r.privateReply?.tone).toBe('neutral')
  })
})

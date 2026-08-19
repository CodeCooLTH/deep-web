import { describe, expect, it } from 'vitest'
import { commentDoneMark } from './comment-done-mark'

describe('[blocker] commentDoneMark — เขียวต้องแปลว่า "ลูกค้าได้คำตอบจริง" เท่านั้น', () => {
  it('ยังไม่ตอบ = ไม่มีเครื่องหมาย', () => {
    expect(commentDoneMark({ state: 'UNANSWERED', answeredForReal: false })).toBeNull()
    // เคสที่เป็นไปไม่ได้ในทางปฏิบัติ แต่ถ้ามาถึงต้องไม่ขึ้นเครื่องหมาย (UNANSWERED ชนะเสมอ)
    expect(commentDoneMark({ state: 'UNANSWERED', answeredForReal: true })).toBeNull()
  })

  it('มีคำตอบจริง (คนหรือบอท) = เขียว', () => {
    expect(commentDoneMark({ state: 'HUMAN_ANSWERED', answeredForReal: true })).toBe('verified')
    expect(commentDoneMark({ state: 'BOT_ANSWERED', answeredForReal: true })).toBe('verified')
  })

  it('จบเพราะถูกกดข้าม/Facebook บอกว่าเคยทักไปแล้ว = เทา ไม่ใช่เขียว', () => {
    // ลูกค้าไม่ได้รับอะไรจากเราเลย — ทาเขียวคือจอโกหกว่าเขาได้คำตอบแล้ว
    expect(commentDoneMark({ state: 'HUMAN_ANSWERED', answeredForReal: false })).toBe('skipped')
  })

  it('แถวที่เป็นทั้งสองอย่าง (ตอบแล้ว + ถูกกดข้ามด้วย) ต้องอ่านว่าตอบแล้ว', () => {
    // นี่คือเหตุผลที่ answeredForReal ต้องมาจาก server — เดาจาก resolvedReason จะได้คำตอบผิด
    expect(commentDoneMark({ state: 'HUMAN_ANSWERED', answeredForReal: true })).toBe('verified')
  })
})

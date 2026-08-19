import { describe, expect, it } from 'vitest'
import { GraphApiError } from './graph'
import { isAlreadyRepliedGraphError } from './private-reply-error'

/**
 * ปักหมุดการแยก "ทักไปแล้ว" (ถาวร กดซ้ำไม่มีวันผ่าน) ออกจาก error ที่ลองใหม่ได้จริง
 *
 * ถ้าด่านนี้พลาด ผู้ขายจะได้ toast "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" กับสิ่งที่ Facebook ปฏิเสธถาวร
 * — ไม่มี tsc/build/grep ตัวไหนจับได้ เพราะทั้งสองทางเป็น error ที่ถูกชนิดเหมือนกันทุกประการ
 */
describe('[blocker] isAlreadyRepliedGraphError', () => {
  it('จับด้วยรหัส 10900 เป็นหลัก (สัญญาที่ Meta คงไว้ ไม่ใช่ข้อความ)', () => {
    const err = new GraphApiError('(#10900) Activity already replied to', 10900, null, 400)
    expect(isAlreadyRepliedGraphError(err)).toBe(true)
  })

  it('รหัสถูกแต่ข้อความเป็นอย่างอื่น ก็ยังต้องจับได้ (Meta แก้คำเมื่อไหร่ก็ได้)', () => {
    expect(isAlreadyRepliedGraphError(new GraphApiError('anything else', 10900, null, 400))).toBe(true)
  })

  it('error ที่ถูก wrap จนเหลือแต่ข้อความ ยังจับจากรูปแบบ (#10900) ได้', () => {
    expect(isAlreadyRepliedGraphError(new Error('(#10900) Activity already replied to'))).toBe(true)
    expect(isAlreadyRepliedGraphError('(#10900) Activity already replied to')).toBe(true)
  })

  it('error อื่นของ Meta ต้องไม่ถูกเหมารวม — พวกนี้ยังลองใหม่ได้/ต้องแก้คนละทาง', () => {
    const others = [
      new GraphApiError('Invalid parameter', 100, null, 400),
      new GraphApiError('This user cant reply to this activity', 200, null, 403),
      new GraphApiError("Please reduce the amount of data you're asking for", 1, null, 500),
      new GraphApiError('(#10) Message failed to send because another app is controlling this thread', 10, null, 403),
      new GraphApiError('Error validating access token', 190, null, 401),
    ]
    for (const err of others) expect(isAlreadyRepliedGraphError(err)).toBe(false)
  })

  it('ห้ามจับคำว่า already replied เปล่า ๆ ที่ไม่มีรหัสกำกับ (เดาความหมายจากภาษาคนอื่น)', () => {
    expect(isAlreadyRepliedGraphError(new Error('already replied'))).toBe(false)
    // รหัสอื่นที่บังเอิญมีเลข 10900 อยู่ในข้อความคนละบริบท ต้องไม่ถูกเหมา
    expect(isAlreadyRepliedGraphError(new Error('quota 10900 exceeded'))).toBe(false)
  })

  it('ค่าที่ไม่ใช่ error ไม่พัง', () => {
    expect(isAlreadyRepliedGraphError(null)).toBe(false)
    expect(isAlreadyRepliedGraphError(undefined)).toBe(false)
    expect(isAlreadyRepliedGraphError({ code: 10900 })).toBe(false)
  })
})

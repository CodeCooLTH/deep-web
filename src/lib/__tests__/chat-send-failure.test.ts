import { describe, it, expect } from 'vitest'
import { describeSendFailure, stripSendFailurePrefix } from '../chat-send-failure'

describe('describeSendFailure', () => {
  it('แปลง #551 (ผู้รับไม่พร้อมรับข้อความ) เป็นไทย พร้อมบอกว่าต้องทำอะไรต่อ', () => {
    const out = describeSendFailure("(#551) This person isn't available right now.")
    expect(out.text).toContain('ลูกค้า')
    expect(out.text).toContain('รอ')
    expect(out.text).not.toMatch(/[A-Za-z]{4,}/) // ไม่มีประโยคอังกฤษหลงเหลือ
    expect(out.metaCode).toBe(551)
    expect(out.known).toBe(true)
  })

  it('แปลง #190 (token เพจหมดอายุ) เป็น "เชื่อม Page ใหม่"', () => {
    const out = describeSendFailure('Error validating access token: Session has expired. (#190)')
    expect(out.text).toContain('เชื่อม Facebook Page ใหม่')
    expect(out.metaCode).toBe(190)
    expect(out.known).toBe(true)
  })

  it('จับหน้าต่าง 24 ชม. จากถ้อยคำ ไม่ใช่จากเลข code อย่างเดียว', () => {
    const out = describeSendFailure(
      '(#10) This message is sent outside of allowed window.',
    )
    // ย่อถ้อยคำลง 2026-08-03 ("24 ชั่วโมง" → "24 ชม.") เพราะข้อความนี้ไปอยู่บนบับเบิลจอมือถือ —
    // ที่ต้องคงไว้คือ "บอกกรอบเวลา" ไม่ใช่รูปคำที่สะกดเต็ม
    expect(out.text).toContain('24 ชม.')
    expect(out.known).toBe(true)
  })

  it('stripSendFailurePrefix — เหลือแต่เหตุผล เพราะ UI มีป้าย "ส่งไม่สำเร็จ" ของตัวเองแล้ว', () => {
    // ข้อความจาก route ที่เติมคำนำหน้ามาแล้ว (SEND_FAILED ผ่าน describeSendFailure)
    expect(stripSendFailurePrefix('ส่งไม่สำเร็จ — ลูกค้าไม่พร้อมรับข้อความ')).toBe(
      'ลูกค้าไม่พร้อมรับข้อความ',
    )
    // ข้อความจาก route ที่ไม่มีคำนำหน้า (WINDOW_CLOSED/CHANNEL_NOT_ACTIVE/429) — ปล่อยผ่านทั้งดุ้น
    expect(stripSendFailurePrefix('การเชื่อมต่อหมดอายุ')).toBe('การเชื่อมต่อหมดอายุ')
    // ไม่มีข้อมูล → null เพื่อให้ UI ซ่อนปุ่ม (i) ไปเลย ไม่ใช่เปิดมาแล้วว่างเปล่า
    expect(stripSendFailurePrefix(null)).toBeNull()
    expect(stripSendFailurePrefix('   ')).toBeNull()
    expect(stripSendFailurePrefix('ส่งไม่สำเร็จ')).toBeNull()
  })

  it('message = ประโยคเต็ม ขึ้นต้นเหมือนกันทุกกรณี (badge กับ toast ต้องพูดตรงกัน)', () => {
    for (const raw of [null, '(#551) x', '(#99999) y', 'ส่งข้อความไม่สำเร็จ']) {
      const out = describeSendFailure(raw)
      expect(out.message).toBe(`ส่งไม่สำเร็จ — ${out.text}`)
    }
  })

  it('จับ rate limit', () => {
    const out = describeSendFailure('(#613) Calls to this api have exceeded the rate limit.')
    expect(out.text).toContain('ลองใหม่')
    expect(out.known).toBe(true)
  })

  it('error ที่ยังไม่รู้จัก — คงข้อความดิบไว้ให้ซัพพอร์ตอ่าน ไม่กลืนหาย', () => {
    const raw = '(#12345) Something nobody has seen before.'
    const out = describeSendFailure(raw)
    expect(out.known).toBe(false)
    expect(out.text).toContain(raw)
    expect(out.metaCode).toBe(12345)
  })

  it('ข้อความไทยที่ระบบเราสร้างเอง — ส่งผ่านตามเดิม ไม่ต้องแปลซ้ำ', () => {
    const out = describeSendFailure('ส่งข้อความไม่สำเร็จ')
    expect(out.text).toBe('ส่งข้อความไม่สำเร็จ')
    expect(out.known).toBe(false)
    expect(out.metaCode).toBeNull()
  })

  it('ไม่มีเหตุผลติดมาเลย', () => {
    expect(describeSendFailure(null).text).toBe('ไม่ทราบสาเหตุ')
    expect(describeSendFailure('   ').text).toBe('ไม่ทราบสาเหตุ')
  })
})

describe('describeSendFailure — บริบทเธรดที่มาจากการตอบคอมเมนต์', () => {
  // 🛑 เพดานของ Meta ในเธรดแบบนี้คือ "ตอบกลับคอมเมนต์ได้ข้อความเดียว" ไม่ใช่หน้าต่าง 24 ชม.
  // ถ้ากฎ 24 ชม. ตอบแทน ผู้ขายจะได้อ่านว่า "นับจากลูกค้าทักล่าสุด" ในเธรดที่ลูกค้าไม่เคยพิมพ์
  // อะไรเลย = คำอธิบายที่ผิด และชี้ให้ไปรอสิ่งที่ไม่มีวันเกิด (impeccable critique 2026-08-09 P0)
  const WINDOW_RAW = '(#10) This message is sent outside of allowed window.'

  it('[blocker] comment-origin + ลูกค้าไม่เคยตอบ → ห้ามพูดถึง "24 ชม." หรือ "ทักล่าสุด"', () => {
    const d = describeSendFailure(WINDOW_RAW, { commentOriginNoInbound: true })
    expect(d.known).toBe(true)
    expect(d.text).not.toContain('24 ชม.')
    expect(d.text).not.toContain('ทักล่าสุด')
    expect(d.text).toContain('ตอบกลับคอมเมนต์ได้ข้อความเดียว')
  })

  it('[blocker] เธรดปกติยังได้คำอธิบาย 24 ชม. เหมือนเดิม — บริบทใหม่ต้องไม่รั่วไปทับของเดิม', () => {
    const d = describeSendFailure(WINDOW_RAW)
    expect(d.text).toContain('24 ชม.')
    expect(describeSendFailure(WINDOW_RAW, { commentOriginNoInbound: false }).text).toContain('24 ชม.')
  })

  it('[blocker] #551 ต้องไม่ถูกเขียนทับ — "ลูกค้าปิดรับข้อความ" เป็นคนละสาเหตุกับเพดานคอมเมนต์', () => {
    // เดาว่าทุก error ในเธรดคอมเมนต์เกิดจากเพดาน = ชี้ร้านไปผิดทางเหมือนเดิม แค่คนละทาง
    const d = describeSendFailure("(#551) This person isn't available right now.", {
      commentOriginNoInbound: true,
    })
    expect(d.text).toContain('ลูกค้าไม่พร้อมรับข้อความ')
    expect(d.text).not.toContain('ตอบกลับคอมเมนต์ได้ข้อความเดียว')
  })

  it('error ที่ไม่รู้จัก ยังคงข้อความดิบไว้ ไม่เดาว่าเป็นเพดานคอมเมนต์', () => {
    const raw = '(#12345) Something nobody has seen before'
    expect(describeSendFailure(raw, { commentOriginNoInbound: true }).text).toBe(raw)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
    // (clarify 2026-08-23 P1-2) "ไม่ทราบสาเหตุ" เดิมเป็นทางตัน — ต้องชวนให้กดลองใหม่ ซึ่งกิ่งนี้
    // ส่ง retryable=true อยู่แล้ว (ปุ่ม "ลองใหม่" ขึ้นจริงบนบับเบิล)
    expect(describeSendFailure(null).text).toBe('ยังไม่รู้สาเหตุที่ส่งไม่ผ่าน — ลองส่งอีกครั้ง ถ้ายังไม่ได้ให้ติดต่อทีมงาน')
    expect(describeSendFailure('   ').text).toBe('ยังไม่รู้สาเหตุที่ส่งไม่ผ่าน — ลองส่งอีกครั้ง ถ้ายังไม่ได้ให้ติดต่อทีมงาน')
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

// (2026-08-11) feature 00043 follow-up — "(#100) Cannot tag messages with 'HUMAN_AGENT'
// without prior approval." เกิดตอน Deep ยังไม่ได้รับสิทธิ์ human_agent จาก App Review (กอง 3)
// สังเกตว่า code #100 ถูกใช้ซ้ำกับ error อื่นของ Meta (thread-control ใน 00018) — regex ต้องแม็ตช์
// ที่ถ้อยคำ ไม่ใช่ code เฉย ๆ ไม่งั้นจะกลืน error อื่นที่ไม่เกี่ยวกันไปด้วย
describe('[blocker] describeSendFailure — human_agent tag ปฏิเสธ (feature 00043 follow-up)', () => {
  const RAW = "(#100) Cannot tag messages with 'HUMAN_AGENT' without prior approval."

  it('[blocker] แปลเป็นไทยตามสเปก ux + metaCode=100 + known=true', () => {
    const out = describeSendFailure(RAW)
    expect(out.known).toBe(true)
    expect(out.metaCode).toBe(100)
    expect(out.text).toBe(
      'เกิน 24 ชม. จากข้อความล่าสุดของลูกค้า และ Deep ยังไม่ได้รับอนุญาตจาก Meta ให้ตอบข้อความช้ากว่านั้น — เป็นแบบนี้ทุกครั้งจนกว่า Meta จะอนุญาต ตอนนี้ตอบได้ทันทีที่ลูกค้าทักเข้ามาใหม่',
    )
  })

  it('[blocker] retryable=false — พิสูจน์ด้วย mutation (ดู mutation log ในรายงาน)', () => {
    // เคสนี้ยืนยันพฤติกรรมปัจจุบันของโค้ดจริง (retryable: false ตามสเปก) — การพิสูจน์ด้วย mutation
    // (สลับ rule เป็น retryable: true แล้วรันเทียบ) ทำนอกไฟล์นี้ชั่วคราว ไม่ commit ดู mutation
    // log ในรายงานผลของ agent
    expect(describeSendFailure(RAW).retryable).toBe(false)
  })

  it('[blocker] comment-origin → ได้ whenCommentOrigin ไม่ใช่ text ปกติ', () => {
    const d = describeSendFailure(RAW, { commentOriginNoInbound: true })
    expect(d.known).toBe(true)
    expect(d.text).toBe(
      'Meta ให้ตอบกลับคอมเมนต์นี้ได้ข้อความเดียว และ Deep ยังไม่ได้รับอนุญาตจาก Meta ให้ตอบเพิ่ม — ข้อความถัดไปจะส่งได้ก็ต่อเมื่อลูกค้าทักกลับเข้ามาก่อน',
    )
    expect(d.text).not.toContain('24 ชม.')
  })

  it('regression: raw ที่มี (#100) แต่เป็น error คนละเรื่อง (thread-control 00018) ต้องไม่ถูกกฎนี้แย่ง', () => {
    // ตัวอย่างจริงจากตระกูล thread-control error ของ 00018 — โค้ด #100 เดียวกัน แต่ถ้อยคำคนละเรื่อง
    const raw = '(#100) calling app is not the thread owner'
    const out = describeSendFailure(raw)
    expect(out.known).toBe(false) // ไม่มีกฎไหน match — คงข้อความดิบไว้
    expect(out.text).toContain(raw)
    expect(out.retryable).toBe(true) // ค่าเดิมของ "ไม่รู้จัก" ต้องไม่เปลี่ยน
  })

  it('regression: กฎ 24 ชม. เดิม (raw "outside the allowed window") ยังทำงานเหมือนเดิม ไม่ถูกกฎใหม่แย่ง', () => {
    const out = describeSendFailure('(#10) This message is sent outside of allowed window.')
    expect(out.text).toContain('24 ชม.')
    expect(out.retryable).toBe(true)
  })
})

// (2026-08-10) LINE — 4 รหัสธุรกิจของ S-8 + retryable ("กดลองใหม่มีผลไหม")
//
// 🛑 กันไม่ให้ Meta เปลี่ยนพฤติกรรม: rule เดิมทุกตัว (ก่อน 2026-08-10) ต้องยัง retryable=true
// เป๊ะ — ถ้าใครแก้ default หรือลืมใส่ retryable ให้ rule ใหม่จนกระทบ rule เก่า เทสกลุ่มนี้ต้องแดง
describe('[blocker] describeSendFailure — retryable ของกฎ Meta เดิมต้องยัง true ทุกตัว (ไม่แตะพฤติกรรม Meta)', () => {
  it('[blocker] #551 (ลูกค้าไม่พร้อมรับข้อความ) — retryable=true', () => {
    expect(describeSendFailure("(#551) This person isn't available right now.").retryable).toBe(true)
  })

  it('[blocker] #190 (token Facebook หมดอายุ) — retryable=true', () => {
    expect(describeSendFailure('Error validating access token: Session has expired. (#190)').retryable).toBe(true)
  })

  it('[blocker] หน้าต่าง 24 ชม. — retryable=true (ทั้งเธรดปกติและ comment-origin override)', () => {
    const raw = '(#10) This message is sent outside of allowed window.'
    expect(describeSendFailure(raw).retryable).toBe(true)
    expect(describeSendFailure(raw, { commentOriginNoInbound: true }).retryable).toBe(true)
  })

  it('[blocker] rate limit — retryable=true', () => {
    expect(
      describeSendFailure('(#613) Calls to this api have exceeded the rate limit.').retryable,
    ).toBe(true)
  })

  it('[blocker] no matching user found — retryable=true', () => {
    expect(describeSendFailure('No matching user found').retryable).toBe(true)
  })

  it('[blocker] ไม่รู้จัก/ไม่มีเหตุผลเลย — retryable=true (ค่าเดิม ไม่ใช่การเดาว่ากดซ้ำไม่ได้)', () => {
    expect(describeSendFailure('(#12345) Something nobody has seen before.').retryable).toBe(true)
    expect(describeSendFailure(null).retryable).toBe(true)
    expect(describeSendFailure('   ').retryable).toBe(true)
  })
})

// (2026-08-14) 2 สาเหตุที่ prod เจอจริงแต่ยังไม่มีกฎ — ร้านจึงอ่านภาษาอังกฤษดิบมาตลอด
// raw ทั้งสองสตริงคัดมาจากคอลัมน์ `ChatMessage.failureReason` บนฐาน prod ตรง ๆ ห้ามแก้ตัวอักษร
describe('[blocker] describeSendFailure — เอเจนต์ AI ของ Meta ถือสิทธิ์คุมเธรด (#10 thread control)', () => {
  const RAW = '(#10) Message failed to send because another app is controlling this thread now.'
  const WINDOW_RAW =
    '(#10) This message is sent outside of allowed window. Learn more about the new policy here: https://developers.facebook.com/docs/messenger-platform/policy-overview'

  it('[blocker] แปลเป็นไทยตามสเปก ux + metaCode=10 + known=true', () => {
    const out = describeSendFailure(RAW)
    expect(out.known).toBe(true)
    expect(out.metaCode).toBe(10)
    expect(out.text).toBe(
      'เอเจนต์ AI ของ Meta กำลังดูแลแชทนี้อยู่ — เข้าไปดูแลแชทนี้เองที่ Business Suite ของเพจนี้ก่อน จึงจะส่งข้อความได้',
    )
  })

  it('[blocker] retryable=false — ข้อมูล prod: ไม่มีสักเคสที่ "กดซ้ำเฉย ๆ แล้วผ่าน"', () => {
    // 31 เคส (08-08→08-14) ทุกเคสมี viaStandby นำหน้า และทุกครั้งที่แอปเราส่งสำเร็จตามมา
    // มีข้อความ "took over/ดูแลแชทนี้" คั่นเสมอ (4/4) ⇒ ต้องให้สิทธิ์ย้ายมาก่อน กดซ้ำอย่างเดียวไม่พอ
    expect(describeSendFailure(RAW).retryable).toBe(false)
  })

  it('[blocker] ห้ามสัญญาสิ่งที่แอปเราทำไม่ได้ — สั่ง Meta AI หยุดตอบ/รับเรื่องต่อแทนผู้ขายไม่ได้', () => {
    // พิสูจน์กับ Graph แล้ว 2026-08-08: take_thread_control ไม่ผ่าน + ไม่รู้ app id ของ Meta AI
    const { text } = describeSendFailure(RAW)
    expect(text).not.toContain('หยุดตอบ')
    expect(text).not.toContain('ระบบจะ')
    // ต้องชี้ที่ Business Suite เท่านั้น — ห้ามแนะนำ Messenger แข่งกับ confirmTakeOverFromAi()
    expect(text).toContain('Business Suite')
    expect(text).not.toContain('Messenger')
  })

  it('[blocker] ไม่แย่งกฎหน้าต่าง 24 ชม. ที่เป็น code #10 เหมือนกัน (ทั้งสองทิศ)', () => {
    // ทิศ 1 — window ต้องไม่ตกไปเป็น thread-control
    expect(describeSendFailure(WINDOW_RAW).text).toContain('24 ชม.')
    expect(describeSendFailure(WINDOW_RAW).retryable).toBe(true)
    // ทิศ 2 — thread-control ต้องไม่ถูก window rule (ที่อยู่เหนือกว่า) แย่งไปก่อน
    expect(describeSendFailure(RAW).text).not.toContain('24 ชม.')
    // ทิศ 3 (ตัวที่จับ mutation ได้จริง) — #10 ถ้อยคำที่สาม ต้องตกเป็น "ไม่รู้จัก" ไม่ใช่ถูกกฎนี้
    // กลืน. สองทิศแรกจับ `code === 10` ไม่ได้เพราะ window rule อยู่เหนือกว่าและชนะไปก่อนอยู่แล้ว
    const out = describeSendFailure('(#10) Some other policy problem we have never seen.')
    expect(out.known).toBe(false)
    expect(out.text).not.toContain('เอเจนต์ AI')
  })

  it('[blocker] comment-origin ต้องได้ข้อความเดิม — สาเหตุนี้ไม่ได้อ้างหน้าต่างเวลาของลูกค้า', () => {
    const a = describeSendFailure(RAW)
    const b = describeSendFailure(RAW, { commentOriginNoInbound: true })
    expect(b.text).toBe(a.text)
    expect(b.retryable).toBe(false)
  })

  it('regression: "(#100) calling app is not the thread owner" (thread-control อีกตัว) ต้องไม่ถูกกฎนี้กลืน', () => {
    // ถ้อยคำคนละชุด แม้เป็นเรื่องสิทธิ์คุมเธรดเหมือนกัน — เราไม่รู้ทางแก้ของตัวนี้ จึงห้ามแปะคำแนะนำ
    const raw = '(#100) calling app is not the thread owner'
    const out = describeSendFailure(raw)
    expect(out.known).toBe(false)
    expect(out.text).toContain(raw)
    expect(out.retryable).toBe(true)
  })
})

describe('[blocker] describeSendFailure — Meta ขัดข้องชั่วคราว (#-1 unexpected internal error)', () => {
  const RAW = '(#-1) Unexpected internal error'

  it('[blocker] แปลเป็นไทย + known=true + retryable=true (หลักฐาน: ส่งซ้ำผ่านใน 25 วินาที)', () => {
    const out = describeSendFailure(RAW)
    expect(out.known).toBe(true)
    expect(out.retryable).toBe(true)
    expect(out.text).toBe('ระบบฝั่ง Meta ขัดข้องชั่วคราว — ลองส่งข้อความอีกครั้ง')
  })

  it('[blocker] META_CODE ต้องแกะเลขติดลบได้ — ไม่งั้นกฎที่ผูกกับ code จะไม่มีวันยิง', () => {
    // 🛑 regex เดิม `\(#(\d+)\)` คืน null ให้ทั้งตระกูลนี้ โดยไม่มี gate ไหนฟ้อง
    expect(describeSendFailure(RAW).metaCode).toBe(-1)
    // เลขบวกของกฎเดิมต้องไม่เปลี่ยนความหมายจากการเติม `-?`
    expect(describeSendFailure("(#551) This person isn't available right now.").metaCode).toBe(551)
    expect(describeSendFailure('(#12345) Something nobody has seen before.').metaCode).toBe(12345)
  })

  it('[blocker] ห้ามสั่งให้ "รอ" — หลักฐานคือส่งซ้ำได้ทันที ไม่ใช่ต้องรอรอบเวลาแบบ rate limit', () => {
    const { text } = describeSendFailure(RAW)
    expect(text).not.toContain('รอ')
    // และต้องไม่เดาสาเหตุที่ไม่ได้พิสูจน์ (token/โควตา/หน้าต่างเวลา ปกติหมดตอนเกิด)
    expect(text).not.toContain('หมดอายุ')
    expect(text).not.toContain('24 ชม.')
  })

  it('regression: ไม่ไปแย่ง rate limit ที่อยู่เหนือกว่า และไม่ถูก rate limit แย่ง', () => {
    expect(describeSendFailure('(#613) Calls to this api have exceeded the rate limit.').text).toContain(
      'ส่งถี่เกิน',
    )
    expect(describeSendFailure(RAW).text).not.toContain('ส่งถี่เกิน')
  })
})

describe('[blocker] describeSendFailure — LINE (S-8 feature 00025) 4 รหัสธุรกิจ', () => {
  // raw ของ LINE คือรหัส literal ตรง ๆ (route ส่ง e.message เข้ามาตรง ๆ — ดู channel-chat.service.ts
  // ::sendOutboundLineMessage ที่ throw new Error(<รหัส>))
  it('[blocker] LINE_UNAVAILABLE — known + retryable=true (ล่มชั่วคราว กดซ้ำมีโอกาสผ่าน)', () => {
    const out = describeSendFailure('LINE_UNAVAILABLE')
    expect(out.known).toBe(true)
    expect(out.retryable).toBe(true)
    expect(out.text).toContain('LINE')
  })

  it('[blocker] TOKEN_INVALID — known + retryable=false (token ตายทุกครั้งที่ยิงซ้ำ)', () => {
    const out = describeSendFailure('TOKEN_INVALID')
    expect(out.known).toBe(true)
    expect(out.retryable).toBe(false)
    expect(out.text).toContain('เชื่อมต่อ')
    // มีผลกับ "ทุกห้อง" ของช่องทางนี้ ไม่ใช่แค่ห้องนี้ — ux spec 2026-08-10 ห้ามหาย
    expect(out.text).toContain('ทุกห้อง')
  })

  it('[blocker] QUOTA_EXCEEDED — known + retryable=false (โควตาหมดจนกว่าจะขึ้นเดือนใหม่)', () => {
    const out = describeSendFailure('QUOTA_EXCEEDED')
    expect(out.known).toBe(true)
    expect(out.retryable).toBe(false)
    expect(out.text).toContain('เดือนนี้เต็มแล้ว')
    expect(out.text).toContain('ทุกห้อง')
  })

  it('[blocker] CONTACT_BLOCKED — known + retryable=false (ลูกค้าปิดรับข้อความ)', () => {
    const out = describeSendFailure('CONTACT_BLOCKED')
    expect(out.known).toBe(true)
    expect(out.retryable).toBe(false)
    // น้ำเสียงกลาง — ห้ามเขียนว่า "บล็อกคุณ" ตรง ๆ (ux spec: กริยากลาง)
    expect(out.text).not.toContain('บล็อกคุณ')
    expect(out.text).toContain('ครั้งล่าสุด')
  })

  it('[blocker] 4 รหัสของ LINE ไม่ชนกับกฎ Meta ที่มีมาก่อน (จับคำนามตรง ๆ ไม่ใช่ regex กว้าง)', () => {
    // กัน regression ชนิด "regex กว้างเกินจนกลืนรหัสของอีกฝั่ง" — LINE ใช้ raw === <รหัส> ตรง ๆ
    // ไม่ใช่ .test() จึงต้องพิสูจน์ว่าไม่ไปตรงกับ #190/#551/rate-limit/window โดยบังเอิญ
    expect(describeSendFailure('TOKEN_INVALID').text).not.toContain('Facebook Page')
    expect(describeSendFailure('QUOTA_EXCEEDED').text).not.toContain('Meta')
    expect(describeSendFailure('CONTACT_BLOCKED').text).not.toContain('Meta')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// (R-21, CR คิวส่งข้อความ 2026-08-23) รหัสภายในต้องไม่มีทางโผล่เป็นอังกฤษดิบบนหน้าจอผู้ขาย
//
// ที่มา: การยิงจริงย้ายไปหลังบ้าน ⇒ รหัสพวกนี้กลายเป็นค่าใน `ChatMessage.failureReason` ที่บับเบิล
// และ push อ่านผ่าน `describeSendFailure` แทนที่จะถูก route แปลให้เหมือนเดิม
// ══════════════════════════════════════════════════════════════════════════
describe('[blocker] รหัสภายในทุกตัวที่ยิงจากหลังบ้านได้ ต้องได้ข้อความภาษาไทย', () => {
  // ครบทั้ง 6 ตัวที่ `transmit*` โยนได้ + 2 ตัวที่ `enqueueOutbound` ตรวจล่วงหน้า (ซ้ำกันบางตัว)
  const CODES = [
    'CHANNEL_NOT_ACTIVE',
    'WINDOW_CLOSED',
    'CONTACT_BLOCKED',
    'QUOTA_EXCEEDED',
    'TOKEN_INVALID',
    'LINE_UNAVAILABLE',
    // (F-1 รอบแก้ 2) `deliverHead` เรียก resolveOutboundContext ซ้ำตอนยิงจริง ⇒ สิทธิ์ที่เปลี่ยน
    // ระหว่างแถวรอคิว (พนักงานถูกถอดสิทธิ์ / เพจย้ายร้าน) ทำให้รหัสนี้ลง failureReason ได้จริง
    'FORBIDDEN',
  ]

  it.each(CODES)('%s → ภาษาไทย ไม่ใช่รหัสดิบ', (code) => {
    const out = describeSendFailure(code)
    expect(out.text).not.toBe(code)
    expect(out.text).not.toContain(code)
    // ต้องมีอักษรไทยจริง ไม่ใช่แค่ "ไม่ใช่รหัส"
    expect(/[\u0E00-\u0E7F]/.test(out.text)).toBe(true)
    // และ message ที่ประกอบเสร็จก็ต้องไม่พารหัสติดไปด้วย
    expect(out.message).not.toContain(code)
  })

  it('ทั้ง 6 ตัวมีกฎรองรับจริง (known=true) ไม่ใช่รอดเพราะตกตาข่าย', () => {
    // แยกจากเทสข้างบนโดยตั้งใจ: ตาข่าย `INTERNAL_CODE_SHAPE` ทำให้ "ได้ภาษาไทย" ผ่านได้ทั้งที่ไม่มีกฎ
    // ⇒ ถ้าไม่ยืนยัน known=true ตรงนี้ การลบกฎออกจะไม่มีอะไรแดง (ตาข่ายกลืน mutation ไปหมด)
    for (const code of CODES) expect(describeSendFailure(code).known).toBe(true)
  })

  it('[blocker] ตาข่าย: รหัสรูปแบบเดียวกันที่ยังไม่มีกฎ ต้องไม่หลุดออกหน้าจอ', () => {
    const out = describeSendFailure('SOME_FUTURE_INTERNAL_CODE')
    expect(out.text).toBe('ยังไม่รู้สาเหตุที่ส่งไม่ผ่าน — ลองส่งอีกครั้ง ถ้ายังไม่ได้ให้ติดต่อทีมงาน')
    expect(out.known).toBe(false)
  })

  it.each(['TIMEOUT', 'ECONNRESET', 'ABORTED'])(
    '[blocker] ตาข่ายต้องครอบรหัส **คำเดียว** ที่ไม่มีขีดล่างด้วย — %s',
    (code) => {
      // 🛑 regex รูปแรกบังคับว่าต้องมี `_` อย่างน้อยหนึ่งตัว ⇒ รหัสคำเดียวหลุดออกดิบทั้งหมด
      // เคสนี้แยกจากเทส `known=true` ของ FORBIDDEN โดยตั้งใจ: ถ้ารวมกัน กฎของ FORBIDDEN จะกลบ
      // ความพังของ regex ไว้ (mutation ข้อหนึ่งจะกลบอีกข้อ)
      const out = describeSendFailure(code)
      expect(out.text).toBe('ยังไม่รู้สาเหตุที่ส่งไม่ผ่าน — ลองส่งอีกครั้ง ถ้ายังไม่ได้ให้ติดต่อทีมงาน')
      expect(out.known).toBe(false)
    },
  )

  it('ตาข่ายต้องไม่กลืนข้อความที่อ่านออกอยู่แล้ว', () => {
    // ประโยคอังกฤษของ Meta และข้อความไทยของเราต้องผ่านไปเหมือนเดิมทุกประการ
    expect(describeSendFailure('Something unexpected happened').text).toBe('Something unexpected happened')
    // ตัวย่ออังกฤษสั้น ๆ ที่ไม่ใช่รหัส (ยาว < 3) ยังผ่านเหมือนเดิม
    expect(describeSendFailure('OK').text).toBe('OK')
    expect(describeSendFailure('ส่งข้อความไม่สำเร็จ').text).toBe('ส่งข้อความไม่สำเร็จ')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// (impeccable clarify 2026-08-23) ถ้อยคำฉบับย่อสำหรับ surface ที่ตัดข้อความทิ้งเอง
//
// 🛑 ทำไมเป็น blocker: `seller-push.service.ts` เอาถ้อยคำชุดนี้ไปเป็น body ของ push โดยตรง และ
// iOS ย่อ body เหลือราว 2 บรรทัด (~100 ตัวอักษร) แล้ว **ตัดหางทิ้ง** — หางคือส่วนหลัง `—` ซึ่ง
// เป็นส่วนที่บอกว่าต้องทำอะไรต่อ. ถ้อยคำที่ยาวที่สุดในตารางคือ 189 ตัวอักษร ⇒ ผู้ขายที่กำลังคุยกับ
// ลูกค้าที่รออยู่ จะได้อ่านแต่คำบรรยายปัญหา โดยไม่มีทางออกติดมาเลย
// ══════════════════════════════════════════════════════════════════════════
describe('[blocker] describeSendFailure — ถ้อยคำฉบับย่อ (short)', () => {
  /** เพดานจริงของ body บน iOS อยู่ราว 100 ตัวอักษร; หัก "ส่งไม่สำเร็จ — " (15) แล้วเผื่อไว้ที่ 60 */
  const SHORT_MAX = 60

  /**
   * สแกน **ซอร์สจริง** ไม่ใช่รายการที่เขียนมือ — กฎที่ถูกเพิ่มวันหน้าต้องถูกตรวจด้วยโดยไม่มีใครต้อง
   * มาเติมชื่อที่นี่ (บทเรียน `rule-must-be-enforced-not-described.md`)
   *
   * 🛑 ตัดคอมเมนต์ทิ้งก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย
   * (คลาสเดียวกับ grep gate ของ HR9 ที่เคยแดงค้างจากคำเตือนของตัวเอง 2026-08-02→03)
   */
  function shortLiterals(): string[] {
    const src = readFileSync(new URL('../chat-send-failure.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    return [...src.matchAll(/\bshort:\s*'([^']+)'/g)].map((m) => m[1]!)
  }

  it('[blocker] ทุกถ้อยคำ short ต้องไม่เกิน 60 ตัวอักษร', () => {
    const all = shortLiterals()
    // ถ้าสแกนไม่เจออะไรเลย แปลว่า regex พัง ไม่ใช่ว่าไม่มีกฎไหนมี short (เทสเปล่า = อันตรายกว่าแดง)
    expect(all.length).toBeGreaterThanOrEqual(10)
    for (const s of all) expect(`${s} (${s.length})`).toBe(`${s} (${Math.min(s.length, SHORT_MAX)})`)
  })

  it('[blocker] short ต้องมีทางออกอยู่ในตัว ไม่ใช่แค่บอกว่าพัง — ทุกตัวต้องมีตัวคั่น —', () => {
    for (const s of shortLiterals()) expect(s).toContain('—')
  })

  it('[blocker] กฎที่ text ยาวเกิน 70 ตัวอักษร ต้องมี short ทุกตัว (ไม่งั้นทางออกถูกตัดทิ้ง)', () => {
    const cases: string[] = [
      "(#551) This person isn't available right now.",
      'Error validating access token: Session has expired. (#190)',
      '(#10) This message is sent outside of allowed window.',
      '(#10) Message failed to send because another app is controlling this thread now.',
      "(#100) Cannot tag messages with 'HUMAN_AGENT' without prior approval.",
      'TOKEN_INVALID',
      'QUOTA_EXCEEDED',
      'CONTACT_BLOCKED',
      'FORBIDDEN',
      'WINDOW_CLOSED',
      'CHANNEL_NOT_ACTIVE',
    ]
    for (const raw of cases) {
      const d = describeSendFailure(raw)
      if (d.text.length > 70) expect(`${raw}: ${d.short ?? 'MISSING'}`).not.toContain('MISSING')
    }
  })

  it('[blocker] shortMessage = คำนำหน้าเดิม + short (ถ้ามี) — ผู้เรียกต้องไม่ประกอบสตริงเอง', () => {
    const d = describeSendFailure('QUOTA_EXCEEDED')
    expect(d.short).not.toBeNull()
    expect(d.shortMessage).toBe(`ส่งไม่สำเร็จ — ${d.short}`)
    // ประโยคเต็มยังอยู่ครบสำหรับบับเบิลในเธรด (มีที่ให้ยาว + กางดูรายละเอียดได้)
    expect(d.message).toBe(`ส่งไม่สำเร็จ — ${d.text}`)
    expect(d.message.length).toBeGreaterThan(d.shortMessage.length)
  })

  it('[blocker] กฎที่ text สั้นอยู่แล้ว → short = null และ shortMessage ต้องเท่ากับ message', () => {
    const d = describeSendFailure('(#613) Calls to this api have exceeded the rate limit.')
    expect(d.short).toBeNull()
    expect(d.shortMessage).toBe(d.message)
  })

  it('[blocker] เธรดคอมเมนต์ที่ override text แล้ว ต้องล้าง short ทิ้ง ห้ามพา short เก่าไปด้วย', () => {
    // short ของกฎ 24 ชม. พูดถึง "รอลูกค้าทักเข้ามาใหม่" ซึ่งเป็นคนละเรื่องกับเพดาน
    // "ตอบคอมเมนต์ได้ข้อความเดียว" — พาไปด้วย = noti ขัดกับบับเบิลของข้อความใบเดียวกัน
    const raw = '(#10) This message is sent outside of allowed window.'
    expect(describeSendFailure(raw).short).not.toBeNull()

    const d = describeSendFailure(raw, { commentOriginNoInbound: true })
    expect(d.short).toBeNull()
    expect(d.shortMessage).toBe(d.message)
    expect(d.text).toContain('คอมเมนต์')
  })
})

// ══════════════════════════════════════════════════════════════════════════
// (impeccable clarify 2026-08-23 P0-2) CHANNEL_NOT_ACTIVE ถูกโยนจากกิ่ง LINE ด้วย
// (`channel-chat.service.ts` เส้นทาง LINE เช็ค `shopChannel.status !== 'ACTIVE'`) — ถ้อยคำเดิม
// สั่งให้ผู้ขาย LINE ไป "เชื่อม Facebook Page ใหม่" ซึ่งไม่มีอยู่ในบัญชีของเขาเลย
// ══════════════════════════════════════════════════════════════════════════
describe('[blocker] describeSendFailure — CHANNEL_NOT_ACTIVE ต้องรู้ช่องทาง', () => {
  it('[blocker] LINE ต้องไม่ถูกสั่งให้ไปเชื่อม Facebook Page', () => {
    const d = describeSendFailure('CHANNEL_NOT_ACTIVE', { channel: 'LINE' })
    expect(d.text).not.toContain('Facebook')
    expect(d.short ?? '').not.toContain('Facebook')
    // ต้องชี้ไปที่หน้าเดียวกับที่กฎ TOKEN_INVALID ของ LINE ชี้ (คำเดียวกัน ไม่พิมพ์ใหม่ — HR16)
    expect(d.text).toContain('ตั้งค่าช่องทาง')
    expect(describeSendFailure('TOKEN_INVALID').text).toContain('ไปที่ตั้งค่าช่องทางเพื่อเชื่อมต่อใหม่')
    expect(d.text).toContain('ไปที่ตั้งค่าช่องทางเพื่อเชื่อมต่อใหม่')
  })

  it.each(['MESSENGER', 'INSTAGRAM'] as const)('[blocker] %s ยังชี้ไปที่เพจ Facebook เหมือนเดิม', (ch) => {
    const d = describeSendFailure('CHANNEL_NOT_ACTIVE', { channel: ch })
    expect(d.text).toContain('Facebook Page')
    expect(d.short ?? '').toContain('Facebook Page')
  })

  it('[blocker] ไม่รู้ช่องทาง → ห้ามเอ่ยชื่อแพลตฟอร์มใดเลย (เดาผิดแย่กว่าไม่เดา)', () => {
    for (const d of [
      describeSendFailure('CHANNEL_NOT_ACTIVE'),
      describeSendFailure('CHANNEL_NOT_ACTIVE', { channel: 'DEEP' }),
    ]) {
      for (const s of [d.text, d.short ?? '']) {
        expect(s).not.toContain('Facebook')
        expect(s).not.toContain('LINE')
        expect(s).not.toContain('Instagram')
      }
      expect(d.text).toContain('ตั้งค่าช่องทาง')
    }
  })

  it('ช่องทางไม่มีผลกับกฎอื่น — บริบทใหม่ต้องไม่รั่วไปทับของเดิม', () => {
    const withCh = describeSendFailure('WINDOW_CLOSED', { channel: 'LINE' })
    expect(withCh.text).toBe(describeSendFailure('WINDOW_CLOSED').text)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// (impeccable clarify 2026-08-23 P1-1 / P1-2) ถ้อยคำต้องสอดคล้องกับ `retryable` ที่ส่งจริง —
// ไม่งั้นจอจะขึ้นปุ่ม/ข้อความคนละอย่างกับที่ประโยคสั่งให้ทำ = ถ้อยคำโกหก
// ══════════════════════════════════════════════════════════════════════════
describe('[blocker] describeSendFailure — ถ้อยคำต้องตรงกับ retryable', () => {
  it('[blocker] FORBIDDEN: ไม่แปล 403 ตรงตัว · ไม่ขัดกับหน้าจอ · บอกทางออก · ยัง retryable=false', () => {
    const d = describeSendFailure('FORBIDDEN')
    expect(d.retryable).toBe(false)
    // ของเดิมบอกว่า "เข้าถึงไม่ได้" ทั้งที่ผู้ขายกำลังเปิดเธรดนั้นค้างอยู่และอ่านได้ตามปกติ
    expect(d.text).not.toContain('เข้าถึง')
    expect(d.text).toContain('ส่งข้อความ')
    // ทางออกจริงมีทางเดียว: ให้เจ้าของร้านคืนสิทธิ์
    expect(d.text).toContain('เจ้าของร้าน')
    // retryable=false ⇒ ห้ามชวนให้กดส่งซ้ำเป็นทางออก (จอจะขึ้นข้อความนิ่ง ไม่ใช่ปุ่ม)
    expect(d.text).not.toContain('ลองส่งอีกครั้ง')
  })

  it('[blocker] ตาข่าย "ไม่รู้สาเหตุ": retryable=true ⇒ ถ้อยคำต้องชวนให้กดลองใหม่', () => {
    for (const d of [describeSendFailure(null), describeSendFailure('SOME_FUTURE_INTERNAL_CODE')]) {
      expect(d.retryable).toBe(true)
      expect(d.text).toContain('ลองส่งอีกครั้ง')
      // และต้องมีทางไปต่อเมื่อลองแล้วยังไม่ได้ ไม่ใช่ทางตันเหมือนถ้อยคำเดิม
      expect(d.text).toContain('ติดต่อทีมงาน')
      expect(d.short).not.toBeNull()
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════
// (impeccable clarify 2026-08-23) ด่านฝั่ง **ผู้เรียก** — ถ้อยคำที่เลือกได้ถูก ไม่มีค่าถ้าไม่มีใคร
// ส่งบริบทเข้ามาให้เลือก (`rule-must-be-enforced-not-described.md`)
//
// สแกนซอร์สเพราะรีโปนี้ไม่มี jsdom/testing-library และ route ไม่มี harness ให้เรียก — เทียบกับ
// **สิ่งที่โค้ดทำ** (ส่ง `channel` เข้าไปไหม) ไม่ใช่แค่ว่ามีคำนั้นอยู่ในไฟล์
// ══════════════════════════════════════════════════════════════════════════
describe('[blocker] ผู้เรียก describeSendFailure ต้องส่งช่องทางเข้ามา', () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  const ROUTE = '../../app/api/chat/conversations/[id]/messages/route.ts'
  const THREAD = '../../app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx'
  const PUSH = '../../services/seller-push.service.ts'

  it('[blocker] route: ทุกการแปล error ต้องผ่าน helper ที่พก channel ไปด้วย', () => {
    const src = read(ROUTE)
    // ในตัว mapChatServiceError ห้ามเรียก describeSendFailure ตรง ๆ (จะได้ถ้อยคำกลางทุกครั้ง)
    const body = src.slice(src.indexOf('function mapChatServiceError'))
    expect(body).toContain('const fail = (raw: string) => describeSendFailure(raw, { channel })')
    // นับการเรียกดิบที่เหลือ: ต้องมีแค่บรรทัดนิยาม `fail` เท่านั้น
    expect([...body.matchAll(/describeSendFailure\(/g)]).toHaveLength(1)
    // และ POST ต้องส่งช่องทางของเธรดเข้าไปจริง ไม่ใช่ประกาศพารามิเตอร์ทิ้งไว้เฉย ๆ
    expect(src).toContain('convChannel = resolveChatChannel(conv.channel)')
    expect(src).toMatch(/mapChatServiceError\(\s*e,\s*"POST[^"]*",\s*convChannel\s*\)/)
  })

  it('[blocker] บับเบิลในเธรด: ส่ง channel ของห้องเข้าไปด้วย', () => {
    const src = read(THREAD)
    const call = src.slice(src.indexOf('describeSendFailure(mExt.failureReason'))
    expect(call.slice(0, 260)).toContain('channel: resolveChatChannel(channel)')
  })

  it('[blocker] push: ส่ง channel ของเธรด + ใช้ฉบับย่อ ไม่ใช่ประโยคเต็ม', () => {
    const src = read(PUSH)
    expect(src).toContain('channel: resolveChatChannel(preview.channel)')
    expect(src).toContain('.shortMessage')
    // `.message` ของ describeSendFailure ห้ามกลับมาเป็น body ของ push อีก
    expect(src).not.toMatch(/describeSendFailure\([^)]*\)\s*\.message/)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// (impeccable clarify 2026-08-23 P2-1) ข้อความ 207 ของการ์ดสินค้าหลายชุด
// ══════════════════════════════════════════════════════════════════════════
describe('[blocker] ข้อความ 207 ต้องบอกแค่ "เกิดอะไร + ทำอะไรต่อ"', () => {
  it('[blocker] ห้ามมีวรรคที่บรรยายสิ่งที่ระบบทำกับสถานะของตัวเอง', () => {
    const src = readFileSync(
      new URL('../../app/api/chat/conversations/[id]/messages/route.ts', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')
    const line = src.split('\n').find((l) => l.includes('error: `เข้าคิวส่งแล้ว'))
    expect(line).toBeDefined()
    expect(line!).not.toContain('เอารายการที่ส่งแล้วออกให้แล้ว')
    // ยังต้องบอกจำนวนที่เข้าคิวได้ และบอกว่าต้องกดอะไรต่อ
    expect(line!).toContain('${i} จาก ${batches.length}')
    expect(line!).toContain('กดส่งอีกครั้งเพื่อส่งส่วนที่เหลือ')
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canRetryFailedMessage,
  needsUncertainSendConfirm,
  UNCERTAIN_RESEND_CONFIRM,
} from '../chat-retry-eligibility'
import { UNCERTAIN_SEND_REASON } from '../chat-send-queue'

// ── persisted (deliveryStatus='FAILED') ──────────────────────────────────────────────
describe('[blocker] canRetryFailedMessage — เส้นทาง persisted (deliveryStatus=FAILED)', () => {
  it('[blocker] TEXT ที่มี body + retryable=true → ลองใหม่ได้', () => {
    expect(
      canRetryFailedMessage({
        failedPersisted: true,
        messageType: 'TEXT',
        hasTextBody: true,
        hasRetryableAttachment: false,
        hasOptimisticRetryPayload: false,
        retryable: true,
      }),
    ).toBe(true)
  })

  it('[blocker] TEXT ที่ไม่มี body (เช่น ORDER card) + retryable=true → ลองใหม่ไม่ได้ (ประกอบ payload กลับไม่ได้)', () => {
    expect(
      canRetryFailedMessage({
        failedPersisted: true,
        messageType: 'ORDER',
        hasTextBody: false,
        hasRetryableAttachment: false,
        hasOptimisticRetryPayload: false,
        retryable: true,
      }),
    ).toBe(false)
  })

  it('[blocker] ไฟล์แนบที่ประกอบกลับได้ + retryable=true → ลองใหม่ได้', () => {
    expect(
      canRetryFailedMessage({
        failedPersisted: true,
        messageType: 'IMAGE',
        hasTextBody: false,
        hasRetryableAttachment: true,
        hasOptimisticRetryPayload: false,
        retryable: true,
      }),
    ).toBe(true)
  })

  it('[blocker] หัวใจของฟีเจอร์นี้: TEXT ที่มี body ครบ แต่ retryable=false (LINE TOKEN_INVALID/QUOTA_EXCEEDED/CONTACT_BLOCKED) → ห้ามลองใหม่ แม้ payload ประกอบกลับได้', () => {
    // ก่อนรอบนี้ (2026-08-10) เงื่อนไขนี้ไม่เคยถูกเช็คเลย — ทุก error ที่มี body ให้กดลองใหม่ได้หมด
    // รวมถึง error ที่กดซ้ำด้วยเงื่อนไขเดิมไม่มีทางผ่าน (ux gate: "UI โกหก")
    expect(
      canRetryFailedMessage({
        failedPersisted: true,
        messageType: 'TEXT',
        hasTextBody: true,
        hasRetryableAttachment: true,
        hasOptimisticRetryPayload: true,
        retryable: false,
      }),
    ).toBe(false)
  })
})

// ── optimistic (client-only, ยังไม่เคยถึง server) ─────────────────────────────────────
describe('[blocker] canRetryFailedMessage — เส้นทาง optimistic (_status="failed")', () => {
  it('[blocker] มี payload เดิม (_retry) + retryable=true → ลองใหม่ได้', () => {
    expect(
      canRetryFailedMessage({
        failedPersisted: false,
        messageType: 'TEXT',
        hasTextBody: false, // ไม่ถูกใช้ในเส้นทาง optimistic — ต้องไม่มีผล
        hasRetryableAttachment: false,
        hasOptimisticRetryPayload: true,
        retryable: true,
      }),
    ).toBe(true)
  })

  it('[blocker] ไม่มี payload เดิม → ลองใหม่ไม่ได้ ไม่ว่า retryable จะเป็นอะไร', () => {
    expect(
      canRetryFailedMessage({
        failedPersisted: false,
        messageType: 'TEXT',
        hasTextBody: true,
        hasRetryableAttachment: true,
        hasOptimisticRetryPayload: false,
        retryable: true,
      }),
    ).toBe(false)
  })

  it('[blocker] มี payload เดิมครบ แต่ retryable=false (เช่น TOKEN_INVALID ที่ตอบกลับมาก่อนสร้างแถว DB) → ห้ามลองใหม่', () => {
    expect(
      canRetryFailedMessage({
        failedPersisted: false,
        messageType: 'TEXT',
        hasTextBody: true,
        hasRetryableAttachment: false,
        hasOptimisticRetryPayload: true,
        retryable: false,
      }),
    ).toBe(false)
  })
})

describe('[blocker] canRetryFailedMessage — retryable=false ชนะทุกเงื่อนไขเสมอ (short-circuit)', () => {
  it('[blocker] ทุกเงื่อนไขอื่นเป็น true หมด แต่ retryable=false → ต้องได้ false ทั้ง persisted และ optimistic', () => {
    const base = {
      messageType: 'TEXT',
      hasTextBody: true,
      hasRetryableAttachment: true,
      hasOptimisticRetryPayload: true,
      retryable: false,
    }
    expect(canRetryFailedMessage({ ...base, failedPersisted: true })).toBe(false)
    expect(canRetryFailedMessage({ ...base, failedPersisted: false })).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// (fix round 2 ของ /impeccable clarify) ด่านความตั้งใจก่อนส่งซ้ำ — เฉพาะเคส "ยิงไปแล้วแต่ไม่รู้ผล"
//
// 🛑 แกนของปัญหา: บนบับเบิลมีปุ่ม "↻ ลองใหม่" กดได้ทันที ส่วนคำเตือน "ไม่แน่ใจ… เปิดดูก่อน" ซ่อนอยู่
// หลังปุ่ม (i) ที่ต้องกดอีกทีถึงจะเห็น ⇒ **คำเตือนไม่ได้อยู่ในเส้นทางของการกระทำ** = คำเชิญให้ทำสิ่งที่
// ถ้อยคำห้าม โดยที่ถ้อยคำนั้นมองไม่เห็น
// ══════════════════════════════════════════════════════════════════════════
describe('[blocker] needsUncertainSendConfirm — ด่านต้องแยกเคสได้ ไม่ใช่แค่ "มี confirm"', () => {
  it('[blocker] แถวที่ยิงไปแล้วแต่ไม่รู้ผล → ต้องผ่าน confirm ก่อน', () => {
    expect(needsUncertainSendConfirm(UNCERTAIN_SEND_REASON)).toBe(true)
  })

  /**
   * 🛑 เทสข้อนี้คือตัวที่ทำให้ mutation "ให้ confirm ครอบทุกเคส FAILED" แดง — แยกจากข้อบนโดยตั้งใจ
   * ถ้ารวมเป็นข้อเดียว การขยาย confirm ให้ครอบทุกเคสจะแดงที่เทสเดียวกัน แล้วเราจะแยกไม่ออกว่า
   * "ด่านหาย" กับ "ด่านกว้างเกิน" ต่างกันอย่างไร
   */
  it.each([
    'WINDOW_CLOSED',
    'CHANNEL_NOT_ACTIVE',
    'QUOTA_EXCEEDED',
    'CONTACT_BLOCKED',
    'TOKEN_INVALID',
    'LINE_UNAVAILABLE',
    'FORBIDDEN',
    "(#551) This person isn't available right now.",
    '(#613) Calls to this api have exceeded the rate limit.',
  ])('[blocker] เหตุผลที่ปลายทางปฏิเสธ (%s) → ห้ามมี confirm มาขวาง', (reason) => {
    // เรารู้แน่ว่าข้อความไม่ถึงลูกค้า ⇒ ส่งซ้ำไม่มีทางทำให้ได้ 2 ข้อความ
    // การเพิ่มขั้นตอนคือแรงเสียดทานเปล่า ๆ กับงานที่ผู้ขายตั้งใจกดมาแล้ว
    expect(needsUncertainSendConfirm(reason)).toBe(false)
  })

  it('[blocker] ไม่มีเหตุผลติดมา (บับเบิล optimistic / แถวเก่า) → ห้ามมี confirm', () => {
    expect(needsUncertainSendConfirm(null)).toBe(false)
    expect(needsUncertainSendConfirm(undefined)).toBe(false)
    expect(needsUncertainSendConfirm('')).toBe(false)
  })

  it('[blocker] ต้องเทียบทั้งสตริง ไม่ใช่ substring — ข้อความอื่นที่มีคำคล้ายกันต้องไม่ติดด่าน', () => {
    expect(needsUncertainSendConfirm('ไม่แน่ใจว่าข้อความออกไปหรือยัง')).toBe(false)
    expect(needsUncertainSendConfirm(`${UNCERTAIN_SEND_REASON} (เพิ่มเติม)`)).toBe(false)
  })
})

describe('[blocker] UNCERTAIN_RESEND_CONFIRM — ถ้อยคำของ confirm', () => {
  it('[blocker] คำอธิบายต้องเป็นประโยคเดียวกับที่บับเบิล/noti ใช้ ห้ามมีสำนวนที่สอง (HR16)', () => {
    expect(UNCERTAIN_RESEND_CONFIRM.text).toBe(UNCERTAIN_SEND_REASON)
  })

  it('[blocker] ปุ่มยืนยันต้องบอกสิ่งที่จะเกิด ไม่ใช่ "ตกลง"', () => {
    const c = UNCERTAIN_RESEND_CONFIRM.confirmButtonText
    expect(c).not.toBe('ตกลง')
    expect(c).not.toBe('ยืนยัน')
    // ผลที่ผู้ขายต้องรับรู้ก่อนกด = ลูกค้าอาจได้ข้อความซ้ำ (ความเสียหายจริงเพียงอย่างเดียวของเคสนี้)
    expect(c).toContain('2 ข้อความ')
  })

  it('[blocker] ปุ่มยกเลิกต้องเป็นทางที่ปลอดภัย — กดพลาดแล้วไม่มีอะไรถูกส่ง', () => {
    expect(UNCERTAIN_RESEND_CONFIRM.cancelButtonText).toContain('ยังไม่ส่ง')
    // ห้ามเป็นคำที่อ่านแล้วเข้าใจว่าเป็นการทิ้งข้อความ (ปุ่ม "ยกเลิกการส่ง" ของอีกปุ่มหนึ่งลบแถวจริง)
    expect(UNCERTAIN_RESEND_CONFIRM.cancelButtonText).not.toContain('ยกเลิกการส่ง')
  })

  it('title เป็นคำถามถึงการกระทำ ไม่ใช่การอธิบายสถานการณ์ซ้ำ', () => {
    expect(UNCERTAIN_RESEND_CONFIRM.title).toContain('?')
    expect(UNCERTAIN_RESEND_CONFIRM.title).not.toContain('ไม่แน่ใจ')
  })
})

// ── ด่านฝั่งผู้เรียก: เกณฑ์ที่ถูกไม่มีค่าถ้าไม่มีใครเรียกมันก่อนยิงคำขอ ──────────────────────
// (rule-must-be-enforced-not-described.md) — สแกนซอร์สเพราะรีโปนี้ไม่มี jsdom ให้ render ปุ่มจริง
describe('[blocker] ChatThread ต้องเรียกด่านนี้ก่อนส่งซ้ำจริง', () => {
  const src = readFileSync(
    new URL(
      '../../app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx',
      import.meta.url,
    ),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

  /** ตัว handler ที่ปุ่ม "ลองใหม่" เรียก — ตัดมาเฉพาะก้อนของมัน ไม่ใช่ทั้งไฟล์ */
  const handler = () => {
    const start = src.indexOf('const retryFailed =')
    expect(start).toBeGreaterThan(-1)
    return src.slice(start, src.indexOf('const cancelFailed =', start))
  }

  it('[blocker] เรียก needsUncertainSendConfirm และ return ออกเมื่อผู้ใช้ไม่ยืนยัน', () => {
    const h = handler()
    expect(h).toContain('needsUncertainSendConfirm(mExt.failureReason)')
    expect(h).toContain('pacesConfirm.warning(')
    expect(h).toContain('if (!ok) return')
  })

  it('[blocker] ด่านต้องอยู่ **ก่อน** การยิงคำขอ ไม่ใช่หลัง', () => {
    const h = handler()
    // ทั้งสองเส้นทางของปุ่มเดียวกัน (persisted → resendMessage · optimistic → retryMessage)
    expect(h.indexOf('needsUncertainSendConfirm')).toBeLessThan(h.indexOf('resendMessage('))
    expect(h.indexOf('needsUncertainSendConfirm')).toBeLessThan(h.indexOf('retryMessage('))
  })

  it('[blocker] ถ้อยคำในโมดัลต้องมาจาก UNCERTAIN_RESEND_CONFIRM ห้ามพิมพ์สตริงสดในหน้าจอ', () => {
    const h = handler()
    expect(h).toContain('UNCERTAIN_RESEND_CONFIRM.title')
    expect(h).toContain('UNCERTAIN_RESEND_CONFIRM.text')
    expect(h).toContain('UNCERTAIN_RESEND_CONFIRM.confirmButtonText')
    expect(h).toContain('UNCERTAIN_RESEND_CONFIRM.cancelButtonText')
    // ปุ่มยกเลิกต้องเป็น default ที่กดพลาดแล้วไม่เสียหาย
    expect(h).toContain('focusCancel: true')
  })
})

import { describe, expect, it } from 'vitest'
import { canRetryFailedMessage } from '../chat-retry-eligibility'

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

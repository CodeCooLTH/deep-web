/**
 * comment-reply-reason.test — ล็อกกติกา "ป้าย 'ไม่สำเร็จ' ต้องบอกได้ว่าเพราะอะไร"
 *
 * ที่มา: user report 2026-08-09 — หน้าประวัติ `/settings/comment-reply` ขึ้นป้าย "ไม่สำเร็จ"
 * ลอย ๆ ทั้งที่ `CommentReplyLog.errorMessage` ถูกเก็บมาตลอด แต่ไม่เคยถูกส่งออกไปหน้าจอเลย
 * ร้านจึงรู้แค่ว่าพลาด ไม่รู้ว่าต้องทำอะไรต่อ และไม่รู้ด้วยซ้ำว่าแก้ได้เองไหม
 *
 * [blocker] ข้อสำคัญคือ **ห้ามกลืนข้อความที่ไม่รู้จัก** — ค่าที่ลงคอลัมน์นี้มีทั้งโค้ดของเราเอง
 * และข้อความดิบของ Meta ถ้าตัวแปลคืน null/สตริงว่างเมื่อไม่รู้จัก ป้ายจะกลับไปเป็นทางตันเหมือนเดิม
 * โดยที่เทสอื่นทั้งหมดยังเขียว
 */

import { describe, expect, it } from 'vitest'
import {
  describeCommentReplyFailure,
  describeSkipReason,
  FAIL_REASON_TEXT,
  SKIP_REASON_TEXT,
} from '../comment-reply-reason'

describe('describeCommentReplyFailure', () => {
  it('แปลโค้ดที่เรารู้จักเป็นไทย', () => {
    expect(describeCommentReplyFailure('WINDOW_EXPIRED')).toBe(FAIL_REASON_TEXT.WINDOW_EXPIRED)
    expect(describeCommentReplyFailure('CHANNEL_TOKEN_UNAVAILABLE')).toBe(
      FAIL_REASON_TEXT.CHANNEL_TOKEN_UNAVAILABLE,
    )
  })

  it('[blocker] ข้อความที่ไม่รู้จัก ต้องไม่ถูกกลืน — ป้ายต้องมีอะไรให้อ่านเสมอ', () => {
    const weird = 'Some brand new Graph error nobody mapped yet'
    const out = describeCommentReplyFailure(weird)
    expect(out).toBeTruthy()
    expect(out).toContain(weird)
  })

  it('[blocker] error ของ Meta ที่ตัวแปลกลางรู้จักแล้ว ต้องได้คำไทยชุดเดียวกับที่บับเบิลในแชทใช้', () => {
    // ห้ามมีตารางแปล error ของ Meta ชุดที่สอง (HR16) — ตัวนี้ต้องเด้งไปหา describeSendFailure
    const out = describeCommentReplyFailure("(#551) This person isn't available right now.")
    expect(out).toContain('ลูกค้าไม่พร้อมรับข้อความ')
    // และต้องเป็น "เหตุผลล้วน" ไม่มีคำนำหน้า ไม่งั้นอ่านได้ว่า "ไม่สำเร็จ ส่งไม่สำเร็จ — …"
    expect(out).not.toContain('ส่งไม่สำเร็จ —')
  })

  it('ค่าว่าง/null → null (ไม่มีอะไรเก็บไว้ ก็ไม่ต้องแสดงบรรทัดเปล่า)', () => {
    expect(describeCommentReplyFailure(null)).toBeNull()
    expect(describeCommentReplyFailure('   ')).toBeNull()
  })
})

describe('describeSkipReason', () => {
  it('แปลโค้ดที่รู้จัก และคืนโค้ดดิบเมื่อไม่รู้จัก (ไม่กลืนเหมือนกัน)', () => {
    expect(describeSkipReason('HUMAN_ANSWERED')).toBe(SKIP_REASON_TEXT.HUMAN_ANSWERED)
    expect(describeSkipReason('BRAND_NEW_REASON')).toBe('BRAND_NEW_REASON')
    expect(describeSkipReason(null)).toBeNull()
  })
})

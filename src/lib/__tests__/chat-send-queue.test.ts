// chat-send-queue.test.ts — [blocker] กฎของคิวส่งข้อความขาออก
//
// 🛑 เทส `isClaimable` คือเทสที่สำคัญที่สุดของฟีเจอร์นี้: การผ่อนเงื่อนไข `sendLockedAt === null`
// แม้บรรทัดเดียวแปลว่า **ลูกค้าได้ข้อความซ้ำ** ซึ่งผู้ขายแก้ไม่ได้และเห็นได้จากฝั่งลูกค้า
// (ดู spec §8 E-1) — ไม่มี tsc/build/grep ตัวไหนจับได้ เพราะโค้ดที่ผิดยังถูกชนิดทุกตัวอักษร

import { describe, expect, it } from 'vitest'
import {
  STALE_CLAIM_MS,
  UNCERTAIN_SEND_REASON,
  headOfRoom,
  isClaimable,
  isStaleClaim,
  type QueueRow,
} from '../chat-send-queue'

const row = (o: Partial<QueueRow> = {}): QueueRow => ({
  id: 'm1',
  conversationId: 'c1',
  createdAt: new Date('2026-08-23T10:00:00Z'),
  deliveryStatus: 'QUEUED',
  sendLockedAt: null,
  ...o,
})

describe('isClaimable', () => {
  it('[blocker] QUEUED + ยังไม่เคย claim → หยิบได้', () => {
    expect(isClaimable(row())).toBe(true)
  })

  it('[blocker] QUEUED แต่เคย claim แล้ว → หยิบไม่ได้ แม้ผ่านมานานแค่ไหน', () => {
    // นี่คือแถวที่ "เริ่มยิงไปแล้วแต่ไม่รู้ผล" — ยิงซ้ำ = ลูกค้าได้ 2 ข้อความ
    expect(isClaimable(row({ sendLockedAt: new Date('2020-01-01T00:00:00Z') }))).toBe(false)
  })

  it('[blocker] SENT แล้ว → หยิบไม่ได้', () => {
    expect(isClaimable(row({ deliveryStatus: 'SENT' }))).toBe(false)
  })

  it('[blocker] FAILED แล้ว → หยิบไม่ได้ (ผู้ขายต้องกดลองใหม่เอง = POST ใบใหม่)', () => {
    expect(isClaimable(row({ deliveryStatus: 'FAILED' }))).toBe(false)
  })

  it('[blocker] แถวแชท DEEP (deliveryStatus=null) → ไม่ใช่ของคิวนี้ หยิบไม่ได้', () => {
    expect(isClaimable(row({ deliveryStatus: null }))).toBe(false)
  })
})

describe('isStaleClaim', () => {
  const lockedAt = new Date('2026-08-23T10:00:00Z')

  it('claim เมื่อครู่ → ยังไม่ค้าง (worker อาจกำลังทำอยู่จริง)', () => {
    expect(isStaleClaim(row({ sendLockedAt: lockedAt }), new Date(lockedAt.getTime() + 1_000))).toBe(false)
  })

  it('[blocker] claim เกินเพดาน → ค้าง ต้องปิดเป็น FAILED', () => {
    expect(isStaleClaim(row({ sendLockedAt: lockedAt }), new Date(lockedAt.getTime() + STALE_CLAIM_MS + 1))).toBe(true)
  })

  it('ยังไม่เคย claim → ไม่ใช่ claim ค้าง (มันแค่รอคิว)', () => {
    expect(isStaleClaim(row(), new Date(lockedAt.getTime() + STALE_CLAIM_MS + 1))).toBe(false)
  })

  it('SENT แล้วแม้ lock ยังอยู่ → ไม่ใช่ claim ค้าง', () => {
    expect(
      isStaleClaim(row({ deliveryStatus: 'SENT', sendLockedAt: lockedAt }), new Date(lockedAt.getTime() + STALE_CLAIM_MS + 1)),
    ).toBe(false)
  })
})

describe('headOfRoom', () => {
  it('[blocker] คืนใบเก่าสุดเสมอ — ลำดับในห้องคือสิ่งที่ลูกค้าอ่าน', () => {
    const older = row({ id: 'old', createdAt: new Date('2026-08-23T10:00:00Z') })
    const newer = row({ id: 'new', createdAt: new Date('2026-08-23T10:00:05Z') })
    expect(headOfRoom([newer, older])?.id).toBe('old')
  })

  it('[blocker] ใบเก่าสุดยังไม่ถึงปลายทางและถูก claim ไปแล้ว → คืน null ห้ามข้ามไปทำใบหลัง', () => {
    // ถ้าข้ามไปส่งใบที่ 2 ลูกค้าจะได้ "300 บาทครับ" ก่อน "ตัวนี้มีสีดำครับ"
    const head = row({ id: 'old', createdAt: new Date('2026-08-23T10:00:00Z'), sendLockedAt: new Date() })
    const next = row({ id: 'new', createdAt: new Date('2026-08-23T10:00:05Z') })
    expect(headOfRoom([head, next])).toBeNull()
  })

  it('ไม่มีแถวที่รออยู่ → null', () => {
    expect(headOfRoom([])).toBeNull()
  })
})

describe('UNCERTAIN_SEND_REASON', () => {
  it('[blocker] ต้องบอกว่า "ไม่แน่ใจ" และสั่งให้ไปตรวจก่อน — ห้ามเป็นข้อความกลาง ๆ', () => {
    // ข้อความกลาง ๆ อย่าง "ส่งไม่สำเร็จ" ชวนให้กดซ้ำทันทีโดยไม่ตรวจ ซึ่งเป็นทางเดียวที่เหลืออยู่
    // ที่จะทำให้ลูกค้าได้ข้อความซ้ำในดีไซน์นี้ (spec §8 E-1)
    expect(UNCERTAIN_SEND_REASON).toMatch(/ไม่แน่ใจ/)
    expect(UNCERTAIN_SEND_REASON).toMatch(/ตรวจ|เปิดดู/)
  })
})

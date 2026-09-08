/**
 * TC-IAP-29 — ช่วงผ่อนผัน (grace period) ของ Apple
 *
 * BR-IAP-14 / FR-IAP-23: `DID_FAIL_TO_RENEW` + subtype `GRACE_PERIOD` = Apple ยังตามเก็บเงินอยู่
 * ⇒ **ห้ามล็อกร้านทันทีที่ `expiresDate` ผ่านไป** ต้องรอจนพ้น `gracePeriodExpiresDate` ก่อน
 *
 * 🛑 `gracePeriodExpiresDate` ไม่ได้อยู่ใน signedTransactionInfo — อยู่ใน **signedRenewalInfo**
 * ซึ่งเป็นคนละ JWS กัน (บั๊กเดิม: อ่านแต่ธุรกรรม เลยไม่เคยเห็นช่วงผ่อนผันเลย)
 */
import { describe, it, expect } from 'vitest'

import { readAppleGracePeriod, isEntitlementActive } from '../entitlement'

const NOW = new Date('2026-09-05T00:00:00.000Z')
const ms = (d: string) => new Date(d).getTime()

describe('readAppleGracePeriod — สกัดวันสิ้นสุดช่วงผ่อนผันจาก renewal info', () => {
  it('มี gracePeriodExpiresDate → คืนเป็น Date', () => {
    const got = readAppleGracePeriod({ gracePeriodExpiresDate: ms('2026-09-20T00:00:00.000Z') })
    expect(got).toEqual(new Date('2026-09-20T00:00:00.000Z'))
  })

  it('อ่านเป็น **epoch ms** ไม่ใช่วินาที — ตีความผิดหน่วยแล้วช่วงผ่อนผันจะกลายเป็นปี 1970', () => {
    const got = readAppleGracePeriod({ gracePeriodExpiresDate: ms('2026-09-20T00:00:00.000Z') })
    expect(got!.getUTCFullYear()).toBe(2026)
  })

  it('ไม่มีฟิลด์ → null (การต่ออายุปกติไม่มีช่วงผ่อนผัน ไม่ใช่ error)', () => {
    expect(readAppleGracePeriod({})).toBeNull()
  })

  it('ค่าที่ไม่ใช่ตัวเลขบวก → null ทุกตัว ไม่เดา', () => {
    for (const bad of ['2026-09-20', null, undefined, 0, -1, NaN, Infinity, {}, []]) {
      expect(readAppleGracePeriod({ gracePeriodExpiresDate: bad })).toBeNull()
    }
  })
})

describe('isEntitlementActive — ยังมีสิทธิ์ใช้งานอยู่ไหม', () => {
  const base = { expiresAt: new Date('2026-09-01T00:00:00.000Z'), revokedAt: null, gracePeriodExpiresAt: null }

  it('ยังไม่ถึงวันหมดอายุ → ใช้ได้', () => {
    expect(isEntitlementActive({ ...base, expiresAt: new Date('2026-10-01T00:00:00.000Z') }, NOW)).toBe(true)
  })

  it('หมดอายุแล้ว ไม่มีช่วงผ่อนผัน → ใช้ไม่ได้', () => {
    expect(isEntitlementActive(base, NOW)).toBe(false)
  })

  it('🛑 หมดอายุแล้วแต่ยังอยู่ในช่วงผ่อนผัน → **ยังใช้ได้** (หัวใจของ TC-IAP-29)', () => {
    const inGrace = { ...base, gracePeriodExpiresAt: new Date('2026-09-20T00:00:00.000Z') }
    expect(isEntitlementActive(inGrace, NOW)).toBe(true)
  })

  it('พ้นช่วงผ่อนผันแล้ว → ใช้ไม่ได้', () => {
    const past = { ...base, gracePeriodExpiresAt: new Date('2026-09-02T00:00:00.000Z') }
    expect(isEntitlementActive(past, NOW)).toBe(false)
  })

  it('🛑 ถูกเพิกถอน/คืนเงิน → ใช้ไม่ได้ **แม้ยังอยู่ในช่วงผ่อนผัน** (การคืนเงินชนะทุกอย่าง)', () => {
    const revokedInGrace = {
      expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      revokedAt: new Date('2026-09-03T00:00:00.000Z'),
      gracePeriodExpiresAt: new Date('2026-09-20T00:00:00.000Z'),
    }
    expect(isEntitlementActive(revokedInGrace, NOW)).toBe(false)
  })

  it('ช่วงผ่อนผันสิ้นสุดพอดีวินาทีนี้ → ถือว่าหมดแล้ว (ใช้ > ไม่ใช่ >= เหมือน expiresAt เดิม)', () => {
    expect(isEntitlementActive({ ...base, gracePeriodExpiresAt: NOW }, NOW)).toBe(false)
  })
})

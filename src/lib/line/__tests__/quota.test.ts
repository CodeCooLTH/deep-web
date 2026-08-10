import { describe, it, expect } from 'vitest'
import {
  classifyLineQuota,
  computeLineQuotaRemaining,
  isLineQuotaCacheFresh,
  shouldBlockLinePush,
} from '@/lib/line/quota'
import { QUOTA_LOW_RATIO, QUOTA_TTL_MS } from '@/lib/line/constants'

// (S-9, feature 00025 TFR-LINE-07/TD-006)
//
// เทสชุดนี้พิสูจน์ด้วย mutation แล้วทุกข้อที่ติด [blocker] — คืนตรรกะผิดกลับไปแล้วต้องแดง
// (เขียนวิธีพิสูจน์ไว้ที่แต่ละข้อ เพื่อให้คนถัดไปทำซ้ำได้โดยไม่ต้องเดา)

describe('computeLineQuotaRemaining', () => {
  it('คงเหลือ = เพดาน − ที่ใช้ไป', () => {
    expect(computeLineQuotaRemaining(300, 52)).toBe(248)
  })

  it('ใช้เกินเพดาน (ลดแพ็กเกจกลางเดือน) → 0 ไม่ใช่เลขติดลบ', () => {
    expect(computeLineQuotaRemaining(200, 260)).toBe(0)
  })
})

describe('classifyLineQuota', () => {
  it('[blocker] อ่านไม่ได้ (UNKNOWN) ต้องไม่ถูกจัดเป็นโควตาหมด — TD-006', () => {
    // mutation: ให้ UNKNOWN คืน 'EXHAUSTED' → ข้อนี้แดง (และ shouldBlockLinePush ข้างล่างแดงตาม)
    expect(classifyLineQuota({ kind: 'UNKNOWN' })).toBe('UNKNOWN')
    expect(shouldBlockLinePush(classifyLineQuota({ kind: 'UNKNOWN' }))).toBe(false)
  })

  it('แพ็กเกจไม่จำกัด → UNLIMITED', () => {
    expect(classifyLineQuota({ kind: 'UNLIMITED' })).toBe('UNLIMITED')
  })

  it('เหลือเยอะ → OK', () => {
    expect(classifyLineQuota({ kind: 'LIMITED', total: 1000, used: 100 })).toBe('OK')
  })

  it('[blocker] เกณฑ์ "เหลือน้อย" = เหลือ ≤ 20% ของเพดาน (ขอบเขตพอดี = LOW แล้ว)', () => {
    // mutation: เปลี่ยน `<=` เป็น `<` ใน classifyLineQuota → เคสพอดี 20% ข้างล่างแดง
    expect(classifyLineQuota({ kind: 'LIMITED', total: 1000, used: 800 })).toBe('LOW') // เหลือ 200 = 20% พอดี
    expect(classifyLineQuota({ kind: 'LIMITED', total: 1000, used: 799 })).toBe('OK') // เหลือ 201 = 20.1%
    expect(classifyLineQuota({ kind: 'LIMITED', total: 1000, used: 990 })).toBe('LOW')
  })

  it('เกณฑ์ผูกกับค่าคงที่ QUOTA_LOW_RATIO จริง ไม่ใช่เลข 0.2 ที่บังเอิญเท่ากัน', () => {
    const total = 500
    const atThreshold = total - Math.round(total * QUOTA_LOW_RATIO) // used ที่ทำให้เหลือพอดีเกณฑ์
    expect(classifyLineQuota({ kind: 'LIMITED', total, used: atThreshold })).toBe('LOW')
  })

  it('[blocker] เหลือ 0 (และใช้เกิน) → EXHAUSTED', () => {
    expect(classifyLineQuota({ kind: 'LIMITED', total: 300, used: 300 })).toBe('EXHAUSTED')
    expect(classifyLineQuota({ kind: 'LIMITED', total: 300, used: 999 })).toBe('EXHAUSTED')
  })
})

describe('shouldBlockLinePush', () => {
  it('[blocker] บล็อกเฉพาะ EXHAUSTED เท่านั้น', () => {
    // mutation: เขียน `level !== 'OK'` แทน → LOW/UNLIMITED/UNKNOWN แดงทันที
    expect(shouldBlockLinePush('EXHAUSTED')).toBe(true)
    expect(shouldBlockLinePush('LOW')).toBe(false)
    expect(shouldBlockLinePush('OK')).toBe(false)
    expect(shouldBlockLinePush('UNLIMITED')).toBe(false)
    expect(shouldBlockLinePush('UNKNOWN')).toBe(false)
  })
})

describe('isLineQuotaCacheFresh', () => {
  const now = 1_800_000_000_000

  it('ยังไม่เคยอ่าน (null/undefined) = ไม่สด', () => {
    expect(isLineQuotaCacheFresh(null, now)).toBe(false)
    expect(isLineQuotaCacheFresh(undefined, now)).toBe(false)
  })

  it('[blocker] อายุน้อยกว่า TTL = สด, ครบ TTL พอดี = ไม่สด (ต้องยิงใหม่)', () => {
    // mutation: สลับเป็น `<=` หรือใช้ค่าคงที่อื่น → ข้อนี้แดง
    expect(isLineQuotaCacheFresh(new Date(now - QUOTA_TTL_MS + 1), now)).toBe(true)
    expect(isLineQuotaCacheFresh(new Date(now - QUOTA_TTL_MS), now)).toBe(false)
    expect(isLineQuotaCacheFresh(new Date(now - QUOTA_TTL_MS - 1), now)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  baseHasPii,
  canUseProducts,
  normalizeMemoryText,
  shouldAttemptMemoryUpdate,
  validateAiMemory,
} from '../chat-memory-rules'
import { createPiiVault, normalizeForPii, redactPii, restorePii } from '../pii-redact'

const rejectedPii = { ok: false, outcome: 'REJECTED_PII' }

// กลุ่มที่ redactPii เท่านั้นที่จับได้ (ข้อความดิบ)
const RAW_PII = [
  'โทร 0812345678',
  'โทร 081-234-5678',
  'โทร 081 234 5678',
  'โทร +66812345678',
  'โทร +66 81 234 5678',
  'โทร 02-123-4567',
  'โทร 081.234.5678',
  'โทร 0812345678 ค่ะ',
  'ติดต่อ 089-999-1234',
  'บัตร 1234567890123',
  'บัตร 1-2345-67890-12-3',
  'เมล a.b@example.com',
  'บัญชี 1234567890',
  'บัญชี 123456789012345',
]
// กลุ่มที่ restorePii จับได้เท่านั้น (ป้ายล้วน redactPii มองไม่เห็น)
const TOKEN_ONLY = ['ส่งที่ [ที่อยู่#1]', 'โทร [เบอร์โทร]', 'อีเมล [อีเมล#2]', 'บัญชี [เลขบัญชี#1]', 'คุณ [ชื่อ#1]']
// กลุ่มป้าย scrub
const SCRUB_ONLY = ['ลูกค้า [ข้อมูลลูกค้า] สนใจรุ่นนี้']

describe('validateAiMemory — PII', () => {
  it.each(RAW_PII)('ข้อความดิบ %s → REJECTED_PII', (t) => {
    expect(validateAiMemory(t, '')).toMatchObject(rejectedPii)
  })
  it.each(TOKEN_ONLY)('ป้าย %s → REJECTED_PII', (t) => {
    expect(validateAiMemory(t, '')).toMatchObject(rejectedPii)
  })
  it.each(SCRUB_ONLY)('%s → REJECTED_PII', (t) => {
    expect(validateAiMemory(t, '')).toMatchObject(rejectedPii)
  })

  // mutation: แต่ละกลไกต้องมีตัวอย่างที่จับได้เฉพาะมัน — ถ้ากลไกนั้นถูกข้าม corpus ต้องแดง
  it('redactPii จับกลุ่ม RAW เท่านั้น (restorePii/scrub มองไม่เห็น) → ข้าม redactPii แล้วกลุ่มนี้แดง', () => {
    for (const t of RAW_PII) {
      expect(restorePii(t, createPiiVault()).unresolved).toEqual([])
      expect(t.includes('[ข้อมูลลูกค้า]')).toBe(false)
      expect(redactPii(normalizeForPii(t)).found.length).toBeGreaterThan(0)
    }
  })
  it('restorePii จับกลุ่ม TOKEN เท่านั้น → ข้าม restorePii แล้วกลุ่มนี้แดง', () => {
    for (const t of TOKEN_ONLY) {
      expect(redactPii(t).found).toEqual([])
      expect(t.includes('[ข้อมูลลูกค้า]')).toBe(false)
      expect(restorePii(t, createPiiVault()).unresolved.length).toBeGreaterThan(0)
    }
  })
  it('[ข้อมูลลูกค้า] จับด้วยการเช็กข้อความตรงตัวเท่านั้น → ข้ามเช็กนี้แล้วแดง', () => {
    for (const t of SCRUB_ONLY) {
      expect(redactPii(t).found).toEqual([])
      expect(restorePii(t, createPiiVault()).unresolved).toEqual([])
    }
  })

  it('ข้อความปกติผ่าน (ไม่ใช่เบอร์/ที่อยู่เต็ม)', () => {
    const t = 'ใส่ไซส์ L ส่งที่บางขุนเทียน กทม.'
    expect(validateAiMemory(t, '')).toEqual({ ok: true, text: t })
  })
})

describe('validateAiMemory — format / shrink', () => {
  it('ว่าง / ยาวเกิน 800 / หลายบรรทัด → FORMAT', () => {
    const f = { ok: false, outcome: 'REJECTED_FORMAT' }
    expect(validateAiMemory('   ', '')).toEqual(f)
    expect(validateAiMemory('ก'.repeat(801), '')).toEqual(f)
    expect(validateAiMemory('ก'.repeat(800), '')).toMatchObject({ ok: true })
    expect(validateAiMemory('บรรทัด 1\n\nบรรทัด 2', '')).toEqual(f)
    expect(validateAiMemory('บรรทัด 1\nบรรทัด 2', '')).toEqual(f)
  })
  it('FORMAT มาก่อน PII', () => {
    expect(validateAiMemory('0812345678\n\nx', '')).toMatchObject({ outcome: 'REJECTED_FORMAT' })
  })
  it('base>=100 และสั้นกว่าครึ่ง → SHRINK · ขอบเขต 50% และ base<100 ผ่าน', () => {
    const base = 'ก'.repeat(100)
    expect(validateAiMemory('ก'.repeat(49), base)).toEqual({ ok: false, outcome: 'REJECTED_SHRINK' })
    expect(validateAiMemory('ก'.repeat(50), base)).toMatchObject({ ok: true })
    expect(validateAiMemory('ก', 'ก'.repeat(99))).toMatchObject({ ok: true })
  })
  it('PII มาก่อน SHRINK', () => {
    expect(validateAiMemory('0812345678', 'ก'.repeat(200))).toMatchObject(rejectedPii)
  })
})

describe('helpers', () => {
  it('normalizeMemoryText', () => {
    expect(normalizeMemoryText('  a\r\n\r\nb\nc  ')).toBe('a b c')
    expect(normalizeMemoryText('a  b')).toBe('a  b')
  })
  it('canUseProducts', () => {
    expect(canUseProducts({ productCount: 0, interestedCount: 0 })).toBe(false)
    expect(canUseProducts({ productCount: 1, interestedCount: 0 })).toBe(true)
    expect(canUseProducts({ productCount: 0, interestedCount: 1 })).toBe(true)
  })
  it('baseHasPii', () => {
    expect(baseHasPii('โทร 0812345678')).toBe(true)
    expect(baseHasPii('ชอบสีครีม')).toBe(false)
  })
})

describe('shouldAttemptMemoryUpdate', () => {
  const base = { newMessageCount: 0, totalMessages: 0, buyerMessages: 0, hasText: false, msSinceLastAiRun: null, force: false }
  const FEW = { ok: false, outcome: 'SKIPPED_FEW_MESSAGES' }
  const COOL = { ok: false, outcome: 'SKIPPED_COOLDOWN' }
  it('ยังไม่มีความจำ: ต้อง >=4 ข้อความ และลูกค้า >=2', () => {
    expect(shouldAttemptMemoryUpdate({ ...base, totalMessages: 3, buyerMessages: 2 })).toEqual(FEW)
    expect(shouldAttemptMemoryUpdate({ ...base, totalMessages: 4, buyerMessages: 1 })).toEqual(FEW)
    expect(shouldAttemptMemoryUpdate({ ...base, totalMessages: 4, buyerMessages: 2 })).toEqual({ ok: true })
  })
  it('มีความจำแล้ว: ต้องมีข้อความใหม่ >=3', () => {
    expect(shouldAttemptMemoryUpdate({ ...base, hasText: true, newMessageCount: 2 })).toEqual(FEW)
    expect(shouldAttemptMemoryUpdate({ ...base, hasText: true, newMessageCount: 3 })).toEqual({ ok: true })
  })
  it('cooldown 120 วิ', () => {
    const ok = { ...base, hasText: true, newMessageCount: 3 }
    expect(shouldAttemptMemoryUpdate({ ...ok, msSinceLastAiRun: 119_999 })).toEqual(COOL)
    expect(shouldAttemptMemoryUpdate({ ...ok, msSinceLastAiRun: 120_000 })).toEqual({ ok: true })
  })
  it('few มาก่อน cooldown', () => {
    expect(shouldAttemptMemoryUpdate({ ...base, hasText: true, newMessageCount: 1, msSinceLastAiRun: 1 })).toEqual(FEW)
  })
  it('force ข้ามจำนวนและ cooldown', () => {
    expect(shouldAttemptMemoryUpdate({ ...base, force: true, msSinceLastAiRun: 1 })).toEqual({ ok: true })
  })
})

describe('validateAiMemory — รูปแบบที่ตัวจับแบบ reversible เท่านั้นที่จับได้', () => {
  it.each(['โทร 0-2123-4567 ได้', 'ไลน์ LINE id: somchai99', 'พัสดุ EX123456789TH'])('%s → REJECTED_PII', (s) => {
    expect(validateAiMemory(`ลูกค้าใส่ไซส์ L ${s}`, '')).toEqual({ ok: false, outcome: 'REJECTED_PII' })
  })
  it('ระดับเขต/จังหวัด และชื่อเรียก ยังบันทึกได้', () => {
    expect(validateAiMemory('คุณมุกใส่ไซส์ L (อก 36) ชอบสีครีม ส่งที่บางขุนเทียน กทม.', '').ok).toBe(true)
  })
})

it('ไลน์ id: xxx ถูกจับเป็นช่องทางติดต่อ', () => {
  expect(validateAiMemory('ใส่ไซส์ L ไลน์ id: mook99', '')).toEqual({ ok: false, outcome: 'REJECTED_PII' })
})

describe('security batch B1: validateAiMemory', () => {
  it.each(['โทร 081 - 234 - 5678'])('H1 reject: %s', (t) => expect(validateAiMemory(t, '')).toMatchObject(rejectedPii))
  it.each(['ig: somchai_k', 'IG somchai_k', 'tiktok @x_y'])('M2 reject: %s', (t) => expect(validateAiMemory(t, '')).toMatchObject(rejectedPii))
  it.each([
    'ส่งที่ 99/9 หมู่ 3 ซอยสุขุมวิท 5 บางนา',
    'ที่อยู่ 12 ถนนสุขุมวิท แขวงบางนา เขตบางนา กรุงเทพ',
    'อยู่คอนโดไลฟ์ ลาดพร้าว ห้อง 1204 ชั้น 12 ตึก B',
  ])('M1 ที่อยู่เต็มไม่มี zip reject: %s', (t) => expect(validateAiMemory(t, '')).toMatchObject(rejectedPii))
  it.each(['ส่งที่บางขุนเทียน กทม.', 'อยู่เขตบางนา กรุงเทพ', 'ใส่ไซส์ 42 อก 36', 'ชอบสีดำ อก 36 เอว 28 ส่ง 2 ชิ้น'])('M1 ok: %s', (t) =>
    expect(validateAiMemory(t, '')).toMatchObject({ ok: true }),
  )
})

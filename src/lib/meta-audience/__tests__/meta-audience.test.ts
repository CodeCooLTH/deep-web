import { describe, it, expect, afterEach, vi } from 'vitest'
import { isMetaAudienceEnabled } from '../gate'
import { phoneHash, buildUsersPayload, UID_SCHEMA } from '../identity'
import { isCountedOrder } from '../counted'
import { classifyAudienceResult, termsUrl, adsManagerUrl, audienceName } from '../classify'

afterEach(() => vi.unstubAllEnvs())

describe('gate (FR-001)', () => {
  it('ไม่ตั้ง env = ปิด', () => expect(isMetaAudienceEnabled('s1')).toBe(false))
  it('เปิด ไม่มีรายชื่อ = ทุกร้าน', () => {
    vi.stubEnv('OPEN_META_AUDIENCE', '1')
    expect(isMetaAudienceEnabled('s1')).toBe(true)
  })
  it('มีรายชื่อ = เฉพาะร้านในรายชื่อ', () => {
    vi.stubEnv('OPEN_META_AUDIENCE', '1')
    vi.stubEnv('META_AUDIENCE_PILOT_SHOP_IDS', 'a, b')
    expect(isMetaAudienceEnabled('b')).toBe(true)
    expect(isMetaAudienceEnabled('c')).toBe(false)
    expect(isMetaAudienceEnabled(null)).toBe(false)
  })
  it('ค่าอื่นที่ไม่ใช่ 1 = ปิด', () => {
    vi.stubEnv('OPEN_META_AUDIENCE', 'true')
    expect(isMetaAudienceEnabled('s1')).toBe(false)
  })
})

describe('phoneHash (BR-CA-01)', () => {
  // คำนวณมือ: printf 66812345678 | shasum -a 256
  it('0812345678 -> sha256("66812345678")', () => {
    expect(phoneHash('0812345678')).toBe('9b82e4d000c636040b7b53ec8e3c3b90bdf0d4a5874073ce91f61420c04f05ed')
  })
  it('ตัดสัญลักษณ์ก่อนแฮช', () => {
    expect(phoneHash('092-079 1649')).toBe('e9877782caeb64afb5c4e4c1b9e710d53434aa7bde292ccff12ecdf2c5f1997c')
  })
  it('ไม่ใช่เบอร์ไทย = null', () => {
    expect(phoneHash('12345')).toBeNull()
    expect(phoneHash(null)).toBeNull()
  })
})

describe('buildUsersPayload', () => {
  it('PSID = schema UID + page_ids', () => {
    expect(buildUsersPayload('PSID', ['p1', 'p2'], 'PAGE1')).toEqual({ schema: UID_SCHEMA, data: ['p1', 'p2'], page_ids: ['PAGE1'] })
  })
  it('PHONE = schema PHONE ไม่มี page_ids', () => {
    expect(buildUsersPayload('PHONE', ['h'])).toEqual({ schema: 'PHONE', data: ['h'] })
  })
})

describe('isCountedOrder (BR-CA-02/03 · ใช้จังหวะเดียวกับ 00089)', () => {
  const base = { status: 'PENDING', isDryRun: false, fullyPaid: false }
  it.each([
    ['CREATE', base, true],
    ['CREATE', { ...base, status: 'DRAFTED' }, false],
    ['CREATE', { ...base, isDryRun: true }, false],
    ['CREATE', { ...base, status: 'CANCELLED' }, false],
    ['CREATE', { ...base, status: 'RETURNED' }, false],
    ['CONFIRM', base, false],
    ['CONFIRM', { ...base, status: 'CONFIRMED' }, true],
    ['CONFIRM', { ...base, fullyPaid: true }, true],
    ['PAYMENT', { ...base, status: 'CONFIRMED' }, false],
    ['PAYMENT', { ...base, fullyPaid: true }, true],
    ['PAYMENT', { ...base, fullyPaid: true, status: 'CANCELLED' }, false],
  ] as const)('%s %j -> %s', (purchaseAt, o, want) => {
    expect(isCountedOrder(o, purchaseAt)).toBe(want)
  })
})

describe('classifyAudienceResult', () => {
  it('2xx = OK', () => expect(classifyAudienceResult(200, { num_received: 1 })).toBe('OK'))
  it('token เสีย = STOP', () => expect(classifyAudienceResult(400, { error: { code: 190 } })).toBe('STOP'))
  it('ข้อตกลงยังไม่ยอมรับ = TERMS', () => {
    expect(classifyAudienceResult(400, { error: { code: 100, error_subcode: 1870090, message: 'x' } })).toBe('TERMS')
    expect(classifyAudienceResult(400, { error: { code: 100, message: 'Custom Audience Terms Not Accepted' } })).toBe('TERMS')
  })
  it('audience หาย = GONE', () => {
    expect(classifyAudienceResult(400, { error: { code: 100, error_subcode: 33, message: 'Object does not exist' } })).toBe('GONE')
  })
  it('rate limit/5xx/ต่อไม่ติด = RETRY', () => {
    expect(classifyAudienceResult(400, { error: { code: 17 } })).toBe('RETRY')
    expect(classifyAudienceResult(503, null)).toBe('RETRY')
    expect(classifyAudienceResult(0, null)).toBe('RETRY')
  })
  it('param ผิด = FAIL', () => expect(classifyAudienceResult(400, { error: { code: 100, message: 'bad' } })).toBe('FAIL'))
})

describe('urls/names', () => {
  it('termsUrl', () => expect(termsUrl('123')).toBe('https://business.facebook.com/ads/manage/customaudiences/tos/?act=123'))
  it('adsManagerUrl', () => expect(adsManagerUrl('123', 'aud9')).toContain('act=123'))
  it('audienceName', () => expect(audienceName('ร้านก')).toBe('Deep · ลูกค้าที่ซื้อแล้ว · ร้านก'))
})

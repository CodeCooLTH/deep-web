import { afterEach, describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { BIND_CODE_TTL_MS, BIND_CODE_PATTERN, formatBindCode, generateBindCode, hashBindCode, normalizeBindCode } from '../bind-code'
import { addFriendUrl, getReportBotConfig, isReportBotReady, sellerDashboardUrl } from '../config'
import { describeReason, FIXED_DELIVERY_REASONS, httpReason } from '../delivery-reasons'
import {
  INVALID_SETTINGS_RULE_MESSAGE,
  LINE_REPORT_ERROR_CODES,
  LINE_REPORT_ERROR_MESSAGE,
  LINE_REPORT_ERROR_STATUS,
  LineReportError,
} from '../errors'
import * as messages from '../messages'
import { LINE_REPORT_NS, retryKeyFor } from '../retry-key'
import {
  CreateBindCodeSchema,
  CutoffDaySchema,
  DailyTimesSchema,
  GroupIdParam,
  ReplaceShopsSchema,
  ShopIdsSchema,
  SlotMinutesSchema,
  UpdateSettingsSchema,
} from '../validations'

const ok = (s: v.GenericSchema, x: unknown) => v.safeParse(s, x).success

describe('errors — exhaustive', () => {
  it('ทุกโค้ดมี status (4xx/5xx) + ข้อความไทย', () => {
    for (const c of LINE_REPORT_ERROR_CODES) {
      expect(LINE_REPORT_ERROR_STATUS[c], c).toBeGreaterThanOrEqual(400)
      expect(LINE_REPORT_ERROR_MESSAGE[c], c).toMatch(/\S/)
      expect(new LineReportError(c).status).toBe(LINE_REPORT_ERROR_STATUS[c])
    }
    expect(Object.keys(LINE_REPORT_ERROR_STATUS).sort()).toEqual([...LINE_REPORT_ERROR_CODES].sort())
    expect(new Set(LINE_REPORT_ERROR_CODES).size).toBe(LINE_REPORT_ERROR_CODES.length)
  })
  it('ตรงตาราง SRS §4.3', () => {
    expect(LINE_REPORT_ERROR_STATUS).toMatchObject({
      UNAUTHORIZED: 401, NOT_OWNER: 403, PACKAGE_REQUIRED: 403, VALIDATION: 400, SHOP_NOT_ALLOWED: 400,
      SHOP_COUNT_OUT_OF_RANGE: 400, INVALID_SETTINGS: 400, PROFIT_CONFIRM_REQUIRED: 400, GROUP_NOT_FOUND: 404,
      GROUP_LIMIT_REACHED: 409, INVALID_STATE: 409, SHOPS_INVALID: 409, GROUP_NOT_ACTIVE: 409,
      NO_SENDABLE_SHOPS: 409, BOT_NOT_IN_GROUP: 409, TEST_QUOTA_EXCEEDED: 429, LINE_UNAVAILABLE: 502,
      BOT_UNAVAILABLE: 502, BOT_NOT_CONFIGURED: 503, INTERNAL: 500, INVALID_SIGNATURE: 401,
    })
  })
  it('LineReportError พก code/details/ข้อความ', () => {
    const e = new LineReportError('INVALID_SETTINGS', { rule: 'NEEDS_TIME' })
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('INVALID_SETTINGS')
    expect(e.details).toEqual({ rule: 'NEEDS_TIME' })
    expect(Object.keys(INVALID_SETTINGS_RULE_MESSAGE)).toEqual(['NEEDS_TIME', 'METRIC_REQUIRED'])
  })
})

describe('bind-code', () => {
  const prev = process.env.NEXTAUTH_SECRET
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = prev
  })
  it('generateBindCode = 8 ตัว Crockford base32 เสมอ · format = XXXX-XXXX · normalize คืนค่าเดิม', () => {
    for (let i = 0; i < 300; i++) {
      const c = generateBindCode()
      expect(c).toMatch(BIND_CODE_PATTERN)
      expect(formatBindCode(c)).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
      expect(normalizeBindCode(formatBindCode(c).toLowerCase())).toBe(c)
    }
    expect(BIND_CODE_TTL_MS).toBe(600_000)
  })
  it('normalizeBindCode: ตัดขีด/ช่องว่าง · พิมพ์ใหญ่ · O→0 I/L→1', () => {
    expect(normalizeBindCode(' ab cd-oilz ')).toBe('ABCD01' + '1Z')
  })
  it('hash ของรูปต่างกันที่ normalize แล้วเหมือนกัน = ค่าเดียวกัน', () => {
    process.env.NEXTAUTH_SECRET = 's1'
    expect(hashBindCode('abcd-2345')).toBe(hashBindCode('ABCD2345'))
    expect(hashBindCode('0000-0000')).toBe(hashBindCode('OOOO-OOOO'))
  })
  it('hash ไม่คืนค่าดิบ · คงที่ · ต่างกันตามโค้ด/secret', () => {
    process.env.NEXTAUTH_SECRET = 's1'
    const h = hashBindCode('ABCD2345')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('ABCD2345')
    expect(hashBindCode('ABCD2345')).toBe(h)
    expect(hashBindCode('ABCD2346')).not.toBe(h)
    process.env.NEXTAUTH_SECRET = 's2'
    expect(hashBindCode('ABCD2345')).not.toBe(h)
  })
  it('fail-closed เมื่อไม่มี NEXTAUTH_SECRET', () => {
    delete process.env.NEXTAUTH_SECRET
    expect(() => hashBindCode('ABCD2345')).toThrow(/NEXTAUTH_SECRET/)
    process.env.NEXTAUTH_SECRET = ''
    expect(() => hashBindCode('ABCD2345')).toThrow()
  })
})

describe('retryKeyFor', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  it('คงที่ + เป็น UUIDv5 + ต่างกันตาม group/slot', () => {
    const k = retryKeyFor('g1', 'D:2026-10-05@18:00')
    expect(k).toMatch(UUID)
    expect(retryKeyFor('g1', 'D:2026-10-05@18:00')).toBe(k)
    expect(retryKeyFor('g2', 'D:2026-10-05@18:00')).not.toBe(k)
    expect(retryKeyFor('g1', 'D:2026-10-05@18:30')).not.toBe(k)
    expect(LINE_REPORT_NS).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('ค่านิ่ง — เปลี่ยน namespace/สูตร = key ของ slot ที่ค้างอยู่เปลี่ยนจากที่ส่งไปแล้ว', () => {
    expect(retryKeyFor('g1', 'M:2026-10-05')).toBe('3b5d4b42-d4b3-5386-b2fe-d2ce9b68e294')
  })
})

describe('config', () => {
  const keys = ['LINE_REPORT_BOT_CHANNEL_SECRET', 'LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN', 'LINE_REPORT_BOT_BASIC_ID', 'NEXT_PUBLIC_SELLER_URL']
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  afterEach(() => keys.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))))
  it('พร้อมเมื่อ secret ∧ token มีค่า', () => {
    keys.forEach((k) => delete process.env[k])
    expect(isReportBotReady()).toBe(false)
    process.env.LINE_REPORT_BOT_CHANNEL_SECRET = 's'
    expect(isReportBotReady()).toBe(false)
    process.env.LINE_REPORT_BOT_CHANNEL_ACCESS_TOKEN = 't'
    expect(isReportBotReady()).toBe(true)
    expect(getReportBotConfig()?.basicId).toBeNull()
    expect(addFriendUrl()).toBeNull()
    process.env.LINE_REPORT_BOT_BASIC_ID = '@abc123'
    expect(addFriendUrl()).toBe('https://line.me/R/ti/p/@abc123')
  })
  it('sellerDashboardUrl เฉพาะ https', () => {
    process.env.NEXT_PUBLIC_SELLER_URL = 'http://seller.deepth.local:4000'
    expect(sellerDashboardUrl()).toBeNull()
    process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.deepthailand.app/'
    expect(sellerDashboardUrl()).toBe('https://seller.deepthailand.app/dashboard?openExternalBrowser=1')
  })
})

describe('messages / reasons', () => {
  it('ข้อความบอททุกตัว: ไม่มีราคา ฿ SafePay emoji', () => {
    const all: string[] = [
      messages.GREETING_MESSAGE, messages.BIND_FAILED_MESSAGE, messages.ALREADY_BOUND_SELF_MESSAGE,
      messages.ALREADY_BOUND_OTHER_MESSAGE, messages.NOT_BOUND_MESSAGE, messages.COMMAND_RATE_LIMITED_MESSAGE,
      messages.PACKAGE_PAUSED_MESSAGE, messages.FINAL_NOTICE_MESSAGE, messages.SINGLE_CHAT_HELP_MESSAGE,
      messages.bindSuccessMessage('กลุ่มร้าน', ['ร้าน ก', 'ร้าน ข']),
    ]
    for (const m of all) {
      expect(m).not.toMatch(/฿|ราคา|บาท|SafePay|https?:/i)
      expect(m).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(m).toMatch(/[฀-๿]/)
    }
    expect(messages.bindSuccessMessage('กลุ่มร้าน', ['ร้าน ก'])).toContain('กลุ่มร้าน')
  })
  it('ป้ายสาเหตุ: ทุกค่าในชุดมีป้าย + HTTP_*', () => {
    for (const r of FIXED_DELIVERY_REASONS) expect(describeReason(r), r).not.toBe('ไม่ทราบสาเหตุ')
    expect(describeReason(httpReason(503))).toBe(describeReason('TIMEOUT'))
    expect(describeReason('HTTP_429')).toBe(describeReason('NETWORK'))
    expect(describeReason('HTTP_400')).toBe('LINE ปฏิเสธข้อความ')
    expect(describeReason('TOKEN_INVALID')).toBe('ระบบส่งข้อความขัดข้อง ทีมงานกำลังตรวจสอบ')
    expect(describeReason('???')).toBe('ไม่ทราบสาเหตุ')
    expect(describeReason(null)).toBe('-')
  })
})

describe('validations (SRS §8)', () => {
  it('ShopIds 1..10 ไม่ซ้ำ', () => {
    expect(ok(ShopIdsSchema, ['a'])).toBe(true)
    expect(ok(ShopIdsSchema, Array.from({ length: 10 }, (_, i) => `s${i}`))).toBe(true)
    expect(ok(ShopIdsSchema, [])).toBe(false)
    expect(ok(ShopIdsSchema, Array.from({ length: 11 }, (_, i) => `s${i}`))).toBe(false)
    expect(ok(ShopIdsSchema, ['a', 'a'])).toBe(false)
    expect(ok(ShopIdsSchema, [''])).toBe(false)
    expect(ok(ShopIdsSchema, ['x'.repeat(65)])).toBe(false)
  })
  it('SlotMinutes 30..1440 ก้าว 30', () => {
    for (const n of [30, 60, 1110, 1440]) expect(ok(SlotMinutesSchema, n), String(n)).toBe(true)
    for (const n of [0, 15, 45, 1470, 1500, 30.5, '30']) expect(ok(SlotMinutesSchema, n), String(n)).toBe(false)
  })
  it('DailyTimes ≤4 ไม่ซ้ำ (AC-10-2)', () => {
    expect(ok(DailyTimesSchema, [30, 60, 90, 120])).toBe(true)
    expect(ok(DailyTimesSchema, [])).toBe(true)
    expect(ok(DailyTimesSchema, [30, 60, 90, 120, 150])).toBe(false)
    expect(ok(DailyTimesSchema, [30, 30])).toBe(false)
  })
  it('CutoffDay 1..31 หรือ null', () => {
    for (const x of [1, 31, null]) expect(ok(CutoffDaySchema, x)).toBe(true)
    for (const x of [0, 32, 1.5, '5', undefined]) expect(ok(CutoffDaySchema, x)).toBe(false)
  })
  it('CreateBindCode ต้อง acknowledged:true', () => {
    expect(ok(CreateBindCodeSchema, { shopIds: ['a'], acknowledged: true })).toBe(true)
    expect(ok(CreateBindCodeSchema, { shopIds: ['a'], acknowledged: false })).toBe(false)
    expect(ok(CreateBindCodeSchema, { shopIds: ['a'] })).toBe(false)
  })
  it('UpdateSettings: strict + ≥1 คีย์', () => {
    expect(ok(UpdateSettingsSchema, { showProfit: true, confirmProfit: true })).toBe(true)
    expect(ok(UpdateSettingsSchema, { cutoffDay: null })).toBe(true)
    expect(ok(UpdateSettingsSchema, {})).toBe(false)
    expect(ok(UpdateSettingsSchema, { dailyEnabled: undefined })).toBe(false)
    expect(ok(UpdateSettingsSchema, { status: 'ACTIVE' })).toBe(false)
    expect(ok(UpdateSettingsSchema, { dailyTimes: [30, 30] })).toBe(false)
    expect(ok(UpdateSettingsSchema, { showOrders: 'yes' })).toBe(false)
  })
  it('ReplaceShops / GroupIdParam', () => {
    expect(ok(ReplaceShopsSchema, { shopIds: ['a', 'b'] })).toBe(true)
    expect(ok(ReplaceShopsSchema, { shopIds: [] })).toBe(false)
    expect(ok(GroupIdParam, 'clx1')).toBe(true)
    expect(ok(GroupIdParam, '')).toBe(false)
  })
})

// 00095 TC-061, 065..067, 045, 107, 108 — ด่านร้านนำร่อง · สแกนโค้ด (static) · ค่าคงที่ครบ
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  HOLD_REASONS,
  HOLD_REASON_TEXT,
  SEND_REASONS,
  SEND_REASON_TEXT,
  STOP_REASONS,
  STOP_REASON_TEXT,
} from '../constants'
import { isSalesFollowBotEnabled, SALES_FOLLOW_BOT_ENV } from '../gate'

const DIR = fileURLToPath(new URL('..', import.meta.url))
const SERVICES = join(DIR, '../../services')
const src = (p: string) => readFileSync(p, 'utf8')
const libFiles = () => readdirSync(DIR).filter((f) => f.endsWith('.ts')).map((f) => join(DIR, f))
const serviceFiles = () =>
  readdirSync(SERVICES).filter((f) => /^sales-follow-.*\.service\.ts$/.test(f)).map((f) => join(SERVICES, f))

describe('TC-065/066 isSalesFollowBotEnabled', () => {
  const orig = process.env[SALES_FOLLOW_BOT_ENV]
  afterEach(() => {
    if (orig === undefined) delete process.env[SALES_FOLLOW_BOT_ENV]
    else process.env[SALES_FOLLOW_BOT_ENV] = orig
  })
  const set = (v: string | undefined) => (v === undefined ? delete process.env[SALES_FOLLOW_BOT_ENV] : (process.env[SALES_FOLLOW_BOT_ENV] = v))

  it.each([[undefined], [''], ['  '], [','], [' , ,']])('env=%j → ปิดทุกร้าน (fail-closed, M-24)', (v) => {
    set(v)
    expect(isSalesFollowBotEnabled('a')).toBe(false)
    expect(isSalesFollowBotEnabled('')).toBe(false)
  })
  it('รายการ: ตรง = เปิด · ไม่ตรง = ปิด · เว้นวรรค/ตัวพิมพ์ต่างไม่เป็นไร', () => {
    set('shop-a, SHOP-B ,shop-c')
    expect(isSalesFollowBotEnabled('shop-a')).toBe(true)
    expect(isSalesFollowBotEnabled('shop-b')).toBe(true)
    expect(isSalesFollowBotEnabled(' shop-c ')).toBe(true)
    expect(isSalesFollowBotEnabled('shop-d')).toBe(false)
    expect(isSalesFollowBotEnabled('shop')).toBe(false) // ไม่ใช่ prefix match
    expect(isSalesFollowBotEnabled(null)).toBe(false)
    expect(isSalesFollowBotEnabled(undefined)).toBe(false)
  })
  it('`*` = ทุกร้าน (แต่ไม่มี shopId ยังปิด)', () => {
    set('*')
    expect(isSalesFollowBotEnabled('any')).toBe(true)
    expect(isSalesFollowBotEnabled('')).toBe(false)
  })
  it('TC-066 อ่าน env ทุกครั้ง ไม่ cache', () => {
    set('x')
    expect(isSalesFollowBotEnabled('x')).toBe(true)
    set('y')
    expect(isSalesFollowBotEnabled('x')).toBe(false)
    set(undefined)
    expect(isSalesFollowBotEnabled('y')).toBe(false)
  })
})

describe('TC-061 ห้ามอ้าง humanAgent / HUMAN_AGENT / tag: (M-23)', () => {
  const FORBIDDEN = /humanAgent|HUMAN_AGENT|\btag:/
  it('ไฟล์ใน src/lib/sales-follow-bot และ services/sales-follow-*.service.ts', () => {
    const files = [...libFiles(), ...serviceFiles()]
    expect(files.length).toBeGreaterThanOrEqual(8)
    for (const f of files) expect(src(f), f).not.toMatch(FORBIDDEN)
  })
})

describe('TC-067 ไม่ฝัง shopId ในโค้ด', () => {
  it('ไม่มี UUID literal ในไฟล์ lib ของบอท', () => {
    for (const f of libFiles()) expect(src(f), f).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})

describe('TC-045 ฟังก์ชันตัดสินเป็น pure', () => {
  const PURE = ['decide.ts', 'sales-stage.ts', 'message-defs.ts', 'conflicts.ts', 'schemas.ts', 'constants.ts']
  it.each(PURE)('%s ไม่แตะ DB/เวลาจริง', (f) => {
    const s = src(join(DIR, f))
    // import type ลบทิ้งตอน build ไม่ลาก prisma เข้า bundle — ยอมได้
    expect(s.replace(/import type[^\n]*\n/g, '')).not.toMatch(/from ['"](@\/lib\/prisma|@prisma\/client)['"]/)
    expect(s).not.toMatch(/Date\.now\(|new Date\(\)/)
  })
})

describe('TC-108 ข้อความไทยครบทุกรหัสใน CHECK (11 stop + 4 hold + 9 send)', () => {
  it('จำนวนและไม่มีค่าว่าง', () => {
    expect(STOP_REASONS).toHaveLength(11)
    expect(HOLD_REASONS).toHaveLength(4)
    expect(SEND_REASONS).toHaveLength(9)
    for (const [k, t] of [...Object.entries(STOP_REASON_TEXT), ...Object.entries(HOLD_REASON_TEXT), ...Object.entries(SEND_REASON_TEXT)]) {
      expect(t.trim(), k).not.toBe('')
      expect(t, k).not.toBe(k) // ไม่ใช่รหัสดิบ
      expect(t, k).toMatch(/[฀-๿]/) // เป็นภาษาไทย
    }
    expect(Object.keys(STOP_REASON_TEXT).sort()).toEqual([...STOP_REASONS].sort())
    expect(Object.keys(HOLD_REASON_TEXT).sort()).toEqual([...HOLD_REASONS].sort())
    expect(Object.keys(SEND_REASON_TEXT).sort()).toEqual([...SEND_REASONS].sort())
  })
})

// 00095 S-9 — guard ของสคริปต์ปฏิบัติการ: URL ที่ไม่ใช่ localhost ต้องถูกปฏิเสธ · preflight ต้องไม่มีคำสั่งเขียน (TC-500/506)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CLOSE_URL_ENV,
  assertLocal5434,
  assertReadOnlySql,
  buildPreflightQueries,
  isLocal5434Url,
  isReadOnlySql,
} from '../../scripts/sales-follow-bot-lib'

describe('qa-seed URL guard', () => {
  it.each([
    ['postgresql://safepay:safepay@localhost:5434/safepay', true],
    ['postgresql://u:p@127.0.0.1:5434/db', true],
    ['postgresql://u:p@localhost:5432/safepay', false], // พอร์ตอื่น = ไม่ใช่ฐาน dev
    ['postgresql://u:p@db.abcdefgh.supabase.co:5434/postgres', false],
    ['postgresql://u:p@aws-0-ap.pooler.supabase.com:6543/postgres', false],
    ['postgresql://u:p@localhost.evil.com:5434/x', false],
    ['', false],
    [undefined, false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => {
    expect(isLocal5434Url(url)).toBe(ok)
    if (ok) expect(() => assertLocal5434(url)).not.toThrow()
    else expect(() => assertLocal5434(url)).toThrow('ปฏิเสธ')
  })
})

describe('preflight เป็นอ่านอย่างเดียว', () => {
  const sqls = [...buildPreflightQueries([]), ...buildPreflightQueries(['95950000-0000-4000-8000-010000000001'])].map((q) => q.sql)

  it('ทุก SQL ผ่าน guard', () => {
    for (const s of sqls) expect(isReadOnlySql(s), s.slice(0, 60)).toBe(true)
  })

  it.each([
    'UPDATE "Shop" SET "shopName" = \'x\'',
    'DELETE FROM "Order"',
    'INSERT INTO "Shop" SELECT 1',
    'WITH x AS (DELETE FROM "Order" RETURNING 1) SELECT * FROM x',
    'SELECT 1; DROP TABLE "Shop"',
    'SELECT 1 FOR UPDATE',
    'TRUNCATE "Order"',
    'SELECT pg_sleep(1); UPDATE "Shop" SET x=1',
  ])('guard ปฏิเสธ: %s', (s) => {
    expect(isReadOnlySql(s)).toBe(false)
    expect(() => assertReadOnlySql(s)).toThrow()
  })

  it('คำว่า UPDATE ในค่า literal / ชื่อคอลัมน์ ไม่ทำให้ guard ลั่น', () => {
    expect(isReadOnlySql(`SELECT "updatedAt", 'UPDATE me' FROM "Shop"`)).toBe(true)
  })

  it('--shop ที่ไม่ใช่ uuid ถูกปฏิเสธ (กัน SQL injection ผ่านอาร์กิวเมนต์)', () => {
    expect(() => buildPreflightQueries(["x'; DROP TABLE \"Shop\"; --"])).toThrow('uuid')
  })

  it('ซอร์สของ preflight ไม่มีการเขียนผ่าน Prisma และไม่มี flag --apply', () => {
    const src = readFileSync('scripts/sales-follow-bot-preflight.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//, '')
    expect(src).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/)
    expect(src).not.toMatch(/--apply/)
  })
})

describe('close-shop อ่าน URL จาก env แยกเท่านั้น', () => {
  const src = readFileSync('scripts/sales-follow-bot-close-shop.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//, '')
  it('ไม่อ่าน process.env.DATABASE_URL', () => {
    expect(src).not.toMatch(/process\.env(\.|\[\s*['"])DATABASE_URL/)
    expect(CLOSE_URL_ENV).toBe('SALES_FOLLOW_CLOSE_DATABASE_URL')
  })
  it('เขียนฐานเฉพาะ updateMany ที่ scope ด้วย shopId', () => {
    expect(src.match(/\.(update|updateMany|delete|deleteMany|create|upsert)\(/g)).toEqual(['.updateMany('])
    expect(src).toMatch(/const where = \{ shopId,/)
  })
})

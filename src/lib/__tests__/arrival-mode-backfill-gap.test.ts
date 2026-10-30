/**
 * arrival-mode-backfill-gap.test.ts — migration 20261027100220 (review P2 MINOR-3 · source เท่านั้น)
 * ไฟล์นี้รัน backfill ของ 20261027100200 ซ้ำ เพื่อเติมใบร้านบริการที่โค้ดเก่าบน prod สร้างระหว่าง
 * migration ที่ขึ้นไปก่อน (เหตุการณ์ 2026-10-27) กับ deploy 00086 จริง
 * ⇒ คำสั่ง UPDATE ต้องตรงกับ 100200 ทุกตัวอักษร (กติกาเดียวกัน = ผลบนจอไม่เปลี่ยน) · ตัวคำสั่งรันกับ DB จริงแล้ว
 *   ใน arrival-mode-backfill.db.test.ts (อ่านจาก 100200)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const code = (dir: string) =>
  readFileSync(join(process.cwd(), `prisma/migrations/${dir}/migration.sql`), 'utf8').replace(/^\s*--.*$/gm, '')
const updateOf = (sql: string) => {
  const m = sql.match(/UPDATE "Order"[\s\S]*?;/g)
  expect(m, 'ต้องมี UPDATE "Order" ตัวเดียว').toHaveLength(1)
  return m![0]
}

const gap = code('20261027100220_00086_arrival_mode_backfill_gap')
const original = code('20261027100200_00086_order_arrival_mode')

describe('migration 20261027100220_00086_arrival_mode_backfill_gap (source)', () => {
  it('lock_timeout เป็นคำสั่งแรก', () => expect(gap.trimStart()).toMatch(/^SET LOCAL lock_timeout = '5s';/))

  it('UPDATE ตรงกับ backfill ของ 100200 ทุกตัวอักษร', () => expect(updateOf(gap)).toBe(updateOf(original)))

  it('กั้นด้วยร้านบริการ + มี serviceStart + ยังไม่มีค่า (ไม่ทับค่าที่ร้านเลือกเอง)', () => {
    const u = updateOf(gap)
    expect(u).toContain(`s."vertical" = 'SERVICE_QUEUE'`)
    expect(u).toContain(`o."serviceStart" IS NOT NULL`)
    expect(u).toContain(`o."arrivalMode" IS NULL`)
  })

  it('มีแค่ SET + UPDATE — ไม่มี DELETE/DROP/TRUNCATE/ALTER', () => {
    expect(gap).not.toMatch(/\b(DELETE|DROP|TRUNCATE|ALTER)\b/i)
    const statements = gap.split(';').map((x) => x.trim()).filter(Boolean)
    expect(statements).toHaveLength(2)
  })
})

/**
 * FR-FA-8 — backfill ของ migration 20261118130000: สถานะเดิม → แถว stage is · แท็กเดิม → แถว tag has_all/has_any ตาม tagMatch · ALL
 * รัน UPDATE ตัวจริงจากไฟล์ migration บน "ตารางชั่วคราว" ในทรานแซกชันที่ rollback เสมอ — ไม่แตะแถวจริง (HR13)
 * 🛑 HR14: รันเฉพาะ DATABASE_URL = localhost:5434 (ไม่ใช่ = skip)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const MIG = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../prisma/migrations/20261118130000_00095_ext_condition_rules/migration.sql')
const UPDATE_SQL = readFileSync(MIG, 'utf8').match(/UPDATE "SalesFollowBot"[\s\S]*?;\n/)![0]

afterAll(async () => {
  if (isLocal) await db.$disconnect()
})

describe.skipIf(!isLocal)('backfill conditionRules', () => {
  it('แปลงทุกรูปแบบของบอทเดิม', async () => {
    const out = await db
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `CREATE TEMP TABLE "SalesFollowBot" ("id" text, "salesStatuses" text[], "tagKeys" text[], "tagMatch" text, "conditionRules" jsonb NOT NULL DEFAULT '[]'::jsonb) ON COMMIT DROP`,
        )
        await tx.$executeRawUnsafe(`INSERT INTO "SalesFollowBot" ("id","salesStatuses","tagKeys","tagMatch") VALUES
          ('st', ARRAY['NOT_BOUGHT','BILLED'], '{}', 'ANY'),
          ('tg-any', '{}', ARRAY['a','b'], 'ANY'),
          ('tg-all', '{}', ARRAY['a','b'], 'ALL'),
          ('both', ARRAY['SHIPPED'], ARRAY['v'], 'ALL'),
          ('none', '{}', '{}', 'ANY')`)
        await tx.$executeRawUnsafe(UPDATE_SQL)
        const rows = await tx.$queryRawUnsafe<{ id: string; conditionRules: unknown }[]>(`SELECT "id","conditionRules" FROM "SalesFollowBot" ORDER BY "id"`)
        throw Object.assign(new Error('rollback'), { rows })
      })
      .catch((e: { rows?: { id: string; conditionRules: unknown }[] }) => {
        if (!e.rows) throw e
        return e.rows
      })
    const by = Object.fromEntries(out.map((r) => [r.id, r.conditionRules]))
    expect(by['st']).toEqual([{ field: 'stage', op: 'is', values: ['NOT_BOUGHT', 'BILLED'] }])
    expect(by['tg-any']).toEqual([{ field: 'tag', op: 'has_any', values: ['a', 'b'] }])
    expect(by['tg-all']).toEqual([{ field: 'tag', op: 'has_all', values: ['a', 'b'] }])
    // ทั้งสถานะและแท็ก: สถานะมาก่อน แล้วแท็ก (เดิม = "สถานะ และ แท็ก")
    expect(by['both']).toEqual([
      { field: 'stage', op: 'is', values: ['SHIPPED'] },
      { field: 'tag', op: 'has_all', values: ['v'] },
    ])
    expect(by['none']).toEqual([])
  })
})

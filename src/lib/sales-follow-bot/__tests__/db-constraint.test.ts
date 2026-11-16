// 00095 TC-120 / M-32 — ค่าใน constants.ts ต้องตรง CHECK ของ migration (อ่านไฟล์ SQL ไม่ใช้ DB)
// ลบค่าหนึ่งฝั่งใดฝั่งหนึ่ง = แดง · ขยายเพดานขั้นต้องไล่ CHECK ทุกตัวพร้อมกัน (บทเรียน #4)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BOT_STATUSES,
  HOLD_REASONS,
  RUN_STATUSES,
  SALES_FOLLOW_LIMITS as L,
  SALES_STAGE_KEYS,
  SEND_REASONS,
  SEND_STATUSES,
  STOP_REASONS,
  TAG_MATCHES,
} from '../constants'

const SQL = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '../../../../prisma/migrations/20261117100000_00095_sales_follow_bot/migration.sql'),
  'utf8',
)

/** ตัวบรรทัด ADD CONSTRAINT "<name>" ... ; (อาจหลายบรรทัด) */
function check(name: string): string {
  const m = SQL.match(new RegExp(`ADD CONSTRAINT "${name}" CHECK \\(([\\s\\S]*?)\\);\\s*(?:\\n|$)`))
  if (!m) throw new Error(`ไม่พบ CHECK ${name} ใน migration`)
  return m[1]
}
const listOf = (sql: string): string[] => [...sql.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])
const sorted = (xs: readonly string[]) => [...xs].sort()
/** BETWEEN ตัวแรกในนิพจน์ (แต่ละ CHECK ที่ใช้มี BETWEEN ของคอลัมน์เป้าหมายเป็นตัวแรก) */
const between = (sql: string) => {
  const m = sql.match(/BETWEEN (\d+) AND (\d+)/)
  if (!m) throw new Error('ไม่พบ BETWEEN')
  return [Number(m[1]), Number(m[2])]
}

describe('TC-120 ลิสต์ใน CHECK = constants.ts', () => {
  const LISTS: [string, readonly string[], string][] = [
    ['SalesFollowBot_status_check', BOT_STATUSES, 'สถานะบอท'],
    ['SalesFollowBot_tagMatch_check', TAG_MATCHES, 'tagMatch'],
    ['SalesFollowBot_salesStatuses_check', SALES_STAGE_KEYS, 'salesStatuses'],
    ['SalesFollowRun_stageKey_check', SALES_STAGE_KEYS, 'stageKey'],
    ['SalesFollowRun_status_check', RUN_STATUSES, 'สถานะ run'],
    ['SalesFollowRun_stopReason_check', STOP_REASONS, 'stopReason'],
    ['SalesFollowRun_holdReason_check', HOLD_REASONS, 'holdReason'],
    ['SalesFollowSend_status_check', SEND_STATUSES, 'สถานะ send'],
    ['SalesFollowSend_reason_check', SEND_REASONS, 'reason'],
  ]
  it.each(LISTS)('%s ↔ %s', (name, want) => {
    expect(sorted(listOf(check(name)))).toEqual(sorted(want))
  })
})

describe('TC-120 ตัวเลขใน CHECK = constants.ts (SALES_FOLLOW_LIMITS)', () => {
  it('ชื่อ ≤ maxName · แท็ก ≤ maxTags', () => {
    expect(check('SalesFollowBot_name_check')).toContain(`char_length("name") <= ${L.maxName}`)
    expect(check('SalesFollowBot_tagKeys_check')).toContain(`cardinality("tagKeys") <= ${L.maxTags}`)
  })
  it('steps: 1..maxSteps', () => {
    expect(between(check('SalesFollowBot_steps_check'))).toEqual([1, L.maxSteps])
  })
  it('nextStep: 0..maxSteps · step: 0..maxSteps-1', () => {
    expect(between(check('SalesFollowRun_nextStep_check'))).toEqual([0, L.maxSteps])
    expect(between(check('SalesFollowSend_step_check'))).toEqual([0, L.maxSteps - 1])
  })
  it('stepCount: 1..maxSteps และ step < stepCount', () => {
    const c = check('SalesFollowSend_stepCount_check')
    expect(between(c)).toEqual([1, L.maxSteps])
    expect(c).toContain('"step" < "stepCount"')
  })
})

describe('TFR-FB-25 คอลัมน์ฟองของรอบ', () => {
  it('SalesFollowSend มี messageIds TEXT[] NOT NULL และไม่เหลือ imageMessageId (ทั้ง FK/index)', () => {
    expect(SQL).toMatch(/"messageIds" TEXT\[\]/)
    expect(SQL).toContain('ALTER TABLE "SalesFollowSend" ALTER COLUMN "messageIds" SET NOT NULL')
    expect(SQL).not.toContain('imageMessageId')
  })
})

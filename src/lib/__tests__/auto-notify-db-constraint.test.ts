/**
 * [blocker] 00078 — ค่าใน TS ต้องมีที่ยืนใน CHECK ของฐาน + CHECK ต้องบังคับจริง
 * (โครงจาก cancel-reason-db-constraint.test.ts) · ส่วน INSERT ต้องมีฐาน localhost:5434
 * แถวที่เทสสร้างทุกแถวลบด้วย id ของตัวเอง (HR13) — ไม่มี deleteMany เปล่า
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AUTO_NOTIFY_KINDS,
  AUTO_NOTIFY_LEDGER_REASONS,
  AUTO_NOTIFY_LEDGER_STATUSES,
} from '../auto-notify/ledger-constants'
import { ORDER_EVENT_TYPES } from '../order-event'

const MIGRATIONS_DIR = join(process.cwd(), 'prisma/migrations')

function sqlMentioning(needle: string): string {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => {
      try {
        return readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
      } catch {
        return ''
      }
    })
    .filter((sql) => sql.includes(needle))
    .join('\n')
}

describe('00078 — TS ↔ migration', () => {
  const orderEventSql = sqlMentioning('OrderEvent_type_check')
  it.each([...ORDER_EVENT_TYPES])('OrderEvent.type %s อยู่ใน migration', (v) => {
    expect(orderEventSql).toContain(`'${v}'`)
  })

  const settingsSql = sqlMentioning('AutoNotifySwitch_kind_check')
  const ledgerSql = sqlMentioning('AutoNotifyLedger_reason_check')
  it.each([...AUTO_NOTIFY_KINDS])('kind %s อยู่ใน CHECK ของ Switch/Template/Ledger', (v) => {
    expect(settingsSql.split(`'${v}'`).length - 1).toBeGreaterThanOrEqual(2)
    expect(ledgerSql).toContain(`'${v}'`)
  })
  it.each([...AUTO_NOTIFY_LEDGER_STATUSES])('status %s อยู่ใน ledger CHECK', (v) => {
    expect(ledgerSql).toContain(`'${v}'`)
  })
  it.each([...AUTO_NOTIFY_LEDGER_REASONS])('reason %s อยู่ใน ledger CHECK', (v) => {
    expect(ledgerSql).toContain(`'${v}'`)
  })
  it('ledger CHECK ไม่มีค่าที่ TS ไม่รู้จัก (reason)', () => {
    const m = ledgerSql.match(/"AutoNotifyLedger_reason_check" CHECK \(([\s\S]*?)\),\n/)
    const inSql = [...(m?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort()
    expect(inSql).toEqual([...AUTO_NOTIFY_LEDGER_REASONS].sort())
  })
})

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)

describe.skipIf(!isLocal)('00078 — CHECK บังคับจริงบน localhost', () => {
  const db = new PrismaClient()
  const tag = `t03-${Date.now()}`
  const ids = { user: '', shop: '' }

  beforeAll(async () => {
    const u = await db.user.create({ data: { username: tag, displayName: tag } as never })
    ids.user = u.id
    const s = await db.shop.create({ data: { userId: u.id, shopName: tag } as never })
    ids.shop = s.id
  })
  afterAll(async () => {
    // scope ด้วย id ที่เทสสร้างเท่านั้น (HR13)
    if (ids.shop) await db.shop.delete({ where: { id: ids.shop } }).catch(() => {})
    if (ids.user) await db.user.delete({ where: { id: ids.user } }).catch(() => {})
    await db.$disconnect()
  })

  const body = (n: number, ch = 'ก') => ch.repeat(n)
  const tpl = (b: string, kind = 'ORDER_SUMMARY') =>
    db.autoNotifyTemplate.create({ data: { shopId: ids.shop, kind, body: b } })

  it('เทมเพลต 500 code point ผ่าน · 501 ไม่ผ่าน · ว่างไม่ผ่าน', async () => {
    await expect(tpl(body(500), 'ORDER_SUMMARY')).resolves.toBeTruthy()
    await expect(tpl(body(501), 'TRACKING')).rejects.toThrow()
    await expect(tpl('  \n', 'TRACKING')).rejects.toThrow()
  })

  it('อีโมจิ (นอก BMP) นับเป็น 1 code point', async () => {
    await expect(tpl('😀'.repeat(500), 'SERVICE_BOOKED')).resolves.toBeTruthy()
    await expect(tpl('😀'.repeat(501), 'SERVICE_STARTED')).rejects.toThrow()
  })

  it('เพดานต่อวัน 0/21 ไม่ผ่าน · 1/20 ผ่าน', async () => {
    await expect(db.autoNotifyConfig.create({ data: { shopId: ids.shop, dailyCapPerRoom: 0 } })).rejects.toThrow()
    await expect(db.autoNotifyConfig.create({ data: { shopId: ids.shop, dailyCapPerRoom: 21 } })).rejects.toThrow()
    await expect(db.autoNotifyConfig.create({ data: { shopId: ids.shop, dailyCapPerRoom: 20 } })).resolves.toBeTruthy()
  })

  it('สวิตช์เปิดโดยไม่มี enabledAt ไม่ผ่าน · kind แปลกไม่ผ่าน', async () => {
    await expect(
      db.autoNotifySwitch.create({ data: { shopId: ids.shop, kind: 'TRACKING', enabled: true } }),
    ).rejects.toThrow()
    await expect(
      db.autoNotifySwitch.create({ data: { shopId: ids.shop, kind: 'BOGUS', enabled: false } }),
    ).rejects.toThrow()
    await expect(
      db.autoNotifySwitch.create({ data: { shopId: ids.shop, kind: 'TRACKING', enabled: true, enabledAt: new Date() } }),
    ).resolves.toBeTruthy()
  })

  it('outboundShippingCost ติดลบไม่ผ่าน (เช็คที่ CHECK โดยตรง ไม่ต้องสร้างออเดอร์)', async () => {
    const r = await db.$queryRaw<{ def: string }[]>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname = 'ShipmentTracking_outboundShippingCost_nonneg'`
    expect(r[0]?.def).toContain('>= (0)::numeric')
  })
})

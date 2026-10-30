/**
 * service-job-p3.db.test.ts — migration P3 ของ 00086 (20261027100300..100700) · S-1 ส่วน P3
 *
 * ส่วนที่ 1 (ไม่ต้องมีฐาน): ตรวจตัวไฟล์ migration — additive ล้วน · lock_timeout · NOT VALID คู่ VALIDATE
 *   mutation ที่ต้องแดง: ถอด NOT VALID หรือ VALIDATE ตัวใดตัวหนึ่งในไฟล์ Order/Shop
 * ส่วนที่ 2 (localhost:5434 เท่านั้น): CHECK/FK/unique บังคับจริงบน Postgres + รัน SQL ซ้ำได้
 *   mutation ที่ต้องแดง: ลบ 'SERVICE_FINISHED' ออกจาก CHECK ของ ledger → เคส ledger ล้ม
 * 🛑 HR13/HR14: ลบเฉพาะแถวที่เทสสร้าง (scope ด้วย id) · ไม่ใช่ 5434 = ข้ามทั้งส่วน
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AUTO_NOTIFY_KINDS } from '../auto-notify/ledger-constants'
import { ORDER_EVENT_TYPES } from '../order-event'

const DIR = join(process.cwd(), 'prisma/migrations')
const P3 = [
  '20261027100300_00086_service_job_assignee_finish',
  '20261027100400_00086_service_job_record',
  '20261027100500_00086_shop_service_photo_settings',
  '20261027100600_00086_order_event_staff_types',
  '20261027100700_00086_auto_notify_service_finished',
] as const
const sqlOf = (name: string) => readFileSync(join(DIR, name, 'migration.sql'), 'utf8')
/** ตัดคอมเมนต์ทั้งบรรทัด/ท้ายบรรทัด — ข้อความอธิบายในหัวไฟล์ (เช่น "rollback: DROP COLUMN") ไม่ใช่คำสั่งจริง */
const codeOf = (sql: string) => sql.replace(/--.*$/gm, '')

/** แยกคำสั่งตาม ; ท้ายบรรทัด โดยไม่ตัดกลาง DO $$ … $$ */
function statements(sql: string): string[] {
  const out: string[] = []
  let buf = ''
  let inDollar = false
  for (const line of codeOf(sql).split('\n')) {
    buf += line + '\n'
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar
    if (!inDollar && /;\s*$/.test(line)) {
      if (buf.trim()) out.push(buf.trim().replace(/;$/, ''))
      buf = ''
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

describe('00086 P3 migration — ตัวไฟล์ (additive · lock · NOT VALID/VALIDATE)', () => {
  it.each(P3)('%s: ไม่มี DROP TABLE/COLUMN · TRUNCATE · DELETE · UPDATE (additive ล้วน · ไม่มี backfill)', (name) => {
    const code = codeOf(sqlOf(name))
    expect(code).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i)
    expect(code).not.toMatch(/\bTRUNCATE\b/i)
    expect(code).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(code).not.toMatch(/\bUPDATE\s+"/i)
  })

  it.each(P3)('%s: SET LOCAL lock_timeout ก่อนคำสั่งแรก', (name) => {
    const first = statements(sqlOf(name))[0]
    expect(first).toMatch(/^SET LOCAL lock_timeout = '5s'$/)
  })

  // Order/Shop เป็นตารางที่มีแถวจริงบน prod — ทุก constraint ใหม่ต้อง NOT VALID แล้ว VALIDATE ชื่อเดียวกัน (DATABASE §5.1)
  it.each([P3[0], P3[2]])('%s: ทุก ADD CONSTRAINT บนตารางเดิมเป็น NOT VALID และมี VALIDATE คู่กัน', (name) => {
    const code = codeOf(sqlOf(name))
    const added = [...code.matchAll(/ADD CONSTRAINT "([^"]+)"([\s\S]*?);/g)]
    expect(added.length).toBeGreaterThan(0)
    for (const [, cname, rest] of added) {
      expect(rest, `${cname} ต้องเป็น NOT VALID`).toMatch(/NOT VALID\s*$/)
      expect(code, `${cname} ต้องมี VALIDATE`).toContain(`VALIDATE CONSTRAINT "${cname}"`)
    }
    const validated = [...code.matchAll(/VALIDATE CONSTRAINT "([^"]+)"/g)].map((m) => m[1])
    expect(validated.sort()).toEqual(added.map((m) => m[1]).sort())
  })

  it('index ใหม่บน "Order" มีคำเตือนให้นับแถว prod ก่อน merge', () => {
    const sql = sqlOf(P3[0])
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "Order_assignedUserId_serviceStart_idx"/)
    expect(sql).toMatch(/count\(\*\) FROM "Order" บน prod/)
  })

  it('ชนิดเหตุการณ์ 4 ตัวใหม่ + ตัวกัน regex ของแบบแผน 00085 อยู่ครบ', () => {
    const code = codeOf(sqlOf(P3[3]))
    for (const t of ['SERVICE_ASSIGNED', 'SERVICE_CLAIMED', 'SERVICE_UNASSIGNED', 'SERVICE_FINISHED']) expect(code).toContain(`''${t}''`)
    expect(code).toContain("position('SERVICE_FINISHED' IN def) = 0")
    expect(code).toContain('RAISE EXCEPTION')
  })
})

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)

const ids = { users: [] as string[], shops: [] as string[], orders: [] as string[] }

/** error จาก CHECK ของ Postgres (23514) — Prisma ห่อเป็นข้อความที่มีชื่อ constraint */
async function expectCheck(p: Promise<unknown>, constraint: string) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  )
  expect(e, `ต้องชน ${constraint}`).toBeTruthy()
  expect(String((e as Error).message)).toContain(constraint)
}

d('00086 P3 migration — บังคับจริงบน localhost:5434', () => {
  let shop = ''
  let tech = ''

  const mkUser = async (t: string) => {
    const u = await db.user.create({ data: { displayName: `p3-${run}-${t}`, username: `p3_${run}_${t}` }, select: { id: true } })
    ids.users.push(u.id)
    return u.id
  }
  const mkOrder = async (data: Record<string, unknown> = {}) => {
    const o = await db.order.create({
      data: { shopId: shop, type: 'SERVICE', status: 'PENDING', totalAmount: 100, ...data } as never,
      select: { id: true },
    })
    ids.orders.push(o.id)
    return o.id
  }

  beforeAll(async () => {
    const owner = await mkUser('own')
    tech = await mkUser('tech')
    const s = await db.shop.create({
      data: { userId: owner, shopName: `p3-${run}`, kind: 'BUSINESS', vertical: 'SERVICE_QUEUE' } as never,
      select: { id: true },
    })
    ids.shops.push(s.id)
    shop = s.id
  })

  afterAll(async () => {
    // HR13: ลบด้วย id ที่เทสสร้างเท่านั้น (ServiceJobRecord/OrderEvent/Ledger หายตาม Cascade ของ Order)
    if (ids.orders.length) await db.order.deleteMany({ where: { id: { in: ids.orders } } })
    if (ids.shops.length) await db.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.users.length) await db.user.deleteMany({ where: { id: { in: ids.users } } })
    await db.$disconnect()
  })

  it('ฐาน local มี migration P3 ครบ (ไม่งั้นเทสข้างล่างผ่านหลอก)', async () => {
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND migration_name = ANY(${[...P3]})`
    expect(rows.map((r) => r.migration_name).sort()).toEqual([...P3].sort())
  })

  describe('Order — assignedUserId / serviceFinishedAt', () => {
    it('ทำเสร็จโดยยังไม่เริ่ม = ชน Order_serviceFinished_requires_started · เริ่มแล้วทำเสร็จได้', async () => {
      await expectCheck(mkOrder({ serviceFinishedAt: new Date() }), 'Order_serviceFinished_requires_started')
      const ok = await mkOrder({ serviceStartedAt: new Date(), serviceFinishedAt: new Date() })
      expect(ok).toBeTruthy()
    })

    it('ลบบัญชีผู้รับผิดชอบ → assignedUserId เป็น NULL (SetNull) ใบงานยังอยู่', async () => {
      const gone = await mkUser('gone')
      const oid = await mkOrder({ assignedUserId: gone })
      await db.user.delete({ where: { id: gone } })
      ids.users = ids.users.filter((x) => x !== gone)
      const row = await db.order.findUniqueOrThrow({ where: { id: oid }, select: { assignedUserId: true } })
      expect(row.assignedUserId).toBeNull()
    })

    it('assignedUserId ที่ไม่มีผู้ใช้จริง = ชน FK', async () => {
      await expect(mkOrder({ assignedUserId: `nope-${run}` })).rejects.toThrow(/Order_assignedUserId_fkey|Foreign key/i)
    })

    it('index (assignedUserId, serviceStart) มีอยู่จริง', async () => {
      const r = await db.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'Order' AND indexname = 'Order_assignedUserId_serviceStart_idx'`
      expect(r).toHaveLength(1)
    })
  })

  describe('Shop — serviceJobPhotoMode / serviceJobPhotosBuyerVisible', () => {
    it('ร้านใหม่ได้ค่าเริ่ม OPTIONAL + ลูกค้าไม่เห็น', async () => {
      const s = await db.shop.findUniqueOrThrow({ where: { id: shop }, select: { serviceJobPhotoMode: true, serviceJobPhotosBuyerVisible: true } })
      expect(s).toEqual({ serviceJobPhotoMode: 'OPTIONAL', serviceJobPhotosBuyerVisible: false })
    })

    it('ค่าแปลก = ชน CHECK · NONE + ลูกค้าเห็น = ชน CHECK · REQUIRED + เห็น / NONE + ไม่เห็น ผ่าน', async () => {
      await expectCheck(db.shop.update({ where: { id: shop }, data: { serviceJobPhotoMode: 'ALWAYS' } }), 'Shop_serviceJobPhoto_check')
      await expectCheck(
        db.shop.update({ where: { id: shop }, data: { serviceJobPhotoMode: 'NONE', serviceJobPhotosBuyerVisible: true } }),
        'Shop_serviceJobPhoto_check',
      )
      await db.shop.update({ where: { id: shop }, data: { serviceJobPhotoMode: 'REQUIRED', serviceJobPhotosBuyerVisible: true } })
      await db.shop.update({ where: { id: shop }, data: { serviceJobPhotoMode: 'NONE', serviceJobPhotosBuyerVisible: false } })
      await db.shop.update({ where: { id: shop }, data: { serviceJobPhotoMode: 'OPTIONAL', serviceJobPhotosBuyerVisible: false } })
    })
  })

  describe('ServiceJobRecord', () => {
    const rec = (orderId: string, data: Partial<Prisma.ServiceJobRecordUncheckedCreateInput> = {}) =>
      db.serviceJobRecord.create({ data: { orderId, shopId: shop, phase: 'BEFORE', createdByUserId: tech, ...data } })

    it('(orderId, phase) ซ้ำ = P2002 · คนละ phase ได้', async () => {
      const oid = await mkOrder()
      await rec(oid, { fileIds: ['a'] })
      const e = await rec(oid).catch((x: unknown) => x)
      expect((e as Prisma.PrismaClientKnownRequestError).code).toBe('P2002')
      await expect(rec(oid, { phase: 'AFTER' })).resolves.toBeTruthy()
    })

    it('phase แปลก = ชน CHECK', async () => {
      await expectCheck(rec(await mkOrder(), { phase: 'DURING' }), 'ServiceJobRecord_phase_check')
    })

    it('10 รูปผ่าน · 11 รูป = ชน CHECK', async () => {
      const ten = Array.from({ length: 10 }, (_, i) => `f${i}`)
      await expect(rec(await mkOrder(), { fileIds: ten })).resolves.toBeTruthy()
      await expectCheck(rec(await mkOrder(), { fileIds: [...ten, 'f10'] }), 'ServiceJobRecord_fileIds_max')
    })

    it("note '' / 1001 ตัว = ชน CHECK · 1000 ตัว / NULL ผ่าน", async () => {
      await expectCheck(rec(await mkOrder(), { note: '' }), 'ServiceJobRecord_note_len')
      await expectCheck(rec(await mkOrder(), { note: 'ก'.repeat(1001) }), 'ServiceJobRecord_note_len')
      await expect(rec(await mkOrder(), { note: 'ก'.repeat(1000) })).resolves.toBeTruthy()
      await expect(rec(await mkOrder(), { note: null })).resolves.toBeTruthy()
    })

    it('ลบใบงาน → บันทึกหายตาม (Cascade) · ลบคนกด → createdByUserId NULL (SetNull)', async () => {
      const writer = await mkUser('writer')
      const oid = await mkOrder()
      const keep = await mkOrder()
      const r1 = await rec(oid)
      const r2 = await rec(keep, { createdByUserId: writer })
      await db.order.delete({ where: { id: oid } })
      ids.orders = ids.orders.filter((x) => x !== oid)
      expect(await db.serviceJobRecord.findUnique({ where: { id: r1.id } })).toBeNull()
      await db.user.delete({ where: { id: writer } })
      ids.users = ids.users.filter((x) => x !== writer)
      expect((await db.serviceJobRecord.findUniqueOrThrow({ where: { id: r2.id } })).createdByUserId).toBeNull()
    })
  })

  describe('CHECK ที่ขยาย — OrderEvent.type / AutoNotify*.kind', () => {
    it('OrderEvent 4 ชนิดใหม่ insert ได้ · ทั้ง 39 ค่าใน ORDER_EVENT_TYPES ยังผ่าน', async () => {
      expect(ORDER_EVENT_TYPES).toHaveLength(39)
      const oid = await mkOrder()
      await db.orderEvent.createMany({ data: ORDER_EVENT_TYPES.map((type) => ({ orderId: oid, type, occurredAt: new Date() })) })
      expect(await db.orderEvent.count({ where: { orderId: oid } })).toBe(39)
      await expectCheck(db.orderEvent.create({ data: { orderId: oid, type: 'SERVICE_TELEPORTED', occurredAt: new Date() } }), 'OrderEvent_type_check')
    })

    it('AutoNotifyLedger kind SERVICE_FINISHED ผ่าน · ทุก kind ใน AUTO_NOTIFY_KINDS ผ่าน', async () => {
      const oid = await mkOrder()
      for (const kind of AUTO_NOTIFY_KINDS) {
        await db.autoNotifyLedger.create({ data: { shopId: shop, orderId: oid, kind, valueKey: '-' } })
      }
      expect(await db.autoNotifyLedger.count({ where: { orderId: oid, kind: 'SERVICE_FINISHED' } })).toBe(1)
      await expectCheck(
        db.autoNotifyLedger.create({ data: { shopId: shop, orderId: oid, kind: 'BOGUS', valueKey: '-' } }),
        'AutoNotifyLedger_kind_check',
      )
    })

    it('AutoNotifySwitch / Template รับ SERVICE_FINISHED (ชุดค่าตรงกันทั้ง 3 ตาราง)', async () => {
      await db.autoNotifySwitch.create({ data: { shopId: shop, kind: 'SERVICE_FINISHED', enabled: false } })
      await db.autoNotifyTemplate.create({ data: { shopId: shop, kind: 'SERVICE_FINISHED', body: 'ทำเสร็จแล้ว' } })
      // แถวเหล่านี้หายตาม Cascade ของ Shop ใน afterAll
    })
  })

  it('รัน SQL ทั้ง 5 ไฟล์ซ้ำอีกรอบได้ (ใน transaction แล้วย้อนทิ้ง)', async () => {
    const ROLLBACK = new Error('rollback-on-purpose')
    const res = await db
      .$transaction(
        async (tx) => {
          for (const name of P3) for (const st of statements(sqlOf(name))) await tx.$executeRawUnsafe(st)
          throw ROLLBACK
        },
        { timeout: 30_000 },
      )
      .catch((e: unknown) => e)
    expect(res).toBe(ROLLBACK)
  })
})

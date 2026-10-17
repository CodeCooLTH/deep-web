/**
 * 00078 T13 — เครื่องยนต์ส่งอัตโนมัติ (reserve / dispatch / sweep / compose) บน Postgres จริง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง (ห้าม deleteMany เปล่า)
 *
 * Mutation (บังคับ — ดู report):
 *   M-cap    `used >= cap` → `used > cap`           → TC-137 แดง
 *   M-dedupe ถอด `ON CONFLICT DO NOTHING`            → "ซ้ำ = ไม่มี error log" แดง
 *   M-norm   ไม่ normalize เลขพัสดุ                   → TC-131 แดง
 *   M-sp     ถอด ROLLBACK TO SAVEPOINT               → "งานหลักรอด" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))

const { transmit, push } = vi.hoisted(() => ({
  transmit: { impl: null as null | ((...a: unknown[]) => Promise<unknown>), calls: 0 },
  push: vi.fn(async () => {}),
}))
// ตัวยิงจริงของ Meta ล้มที่ด่าน 24 ชม. ก่อนแตะเครือข่าย (WINDOW_CLOSED) — ข้อที่ต้องการ "ส่งสำเร็จ/ล้ม" สั่งผ่าน transmit.impl
vi.mock('@/services/channel-chat.service', async (orig) => {
  const real = await orig<typeof import('@/services/channel-chat.service')>()
  return {
    ...real,
    transmitOutbound: (...a: Parameters<typeof real.transmitOutbound>) => {
      transmit.calls += 1
      return transmit.impl ? transmit.impl(...a) : real.transmitOutbound(...a)
    },
  }
})
vi.mock('@/services/seller-push.service', async (orig) => ({
  ...(await orig<typeof import('@/services/seller-push.service')>()),
  pushChatSendFailed: push,
}))
vi.mock('@/services/auto-order-detect.service', async (orig) => ({
  ...(await orig<typeof import('@/services/auto-order-detect.service')>()),
  detectAutoOrderTrigger: vi.fn(async () => ({ outcome: 'SKIPPED' })),
}))

import { prisma as appPrisma } from '@/lib/prisma'
import { UNCERTAIN_SEND_REASON } from '@/lib/chat-send-queue'
import { DEFAULT_TEMPLATES } from '@/lib/auto-notify/defaults'
import { dispatchAutoNotify, reserveAutoNotifyIntent, sweepAutoNotify, type ReserveInput } from '@/services/auto-notify.service'
import { composeNotice, externalCardParts, TRACKING_UPDATE_PREFIX } from '@/services/auto-notify-message.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000)
const minAgo = (m: number) => new Date(Date.now() - m * 60_000)

const S = { user: '', shop: '', otherShop: '', ch: '' }
const ids = { convs: [] as string[], orders: [] as string[], contacts: [] as string[] }

async function mkConv(o: { channel?: 'DEEP' | 'MESSENGER'; inboundH?: number; shopId?: string } = {}) {
  const channel = o.channel ?? 'DEEP'
  // (shopChannelId, externalContactId) unique → ผู้ติดต่อใหม่ต่อห้อง
  let contactId: string | null = null
  if (channel === 'MESSENGER') {
    const ec = await db.externalContact.create({ data: { shopChannelId: S.ch, externalUserId: `psid-${randomUUID().slice(0, 8)}` } as never, select: { id: true } })
    ids.contacts.push(ec.id)
    contactId = ec.id
  }
  const c = await db.conversation.create({
    data: {
      shopId: o.shopId ?? S.shop, channel, alias: `en-${run}`, lastSenderRole: 'BUYER',
      lastInboundAt: hoursAgo(o.inboundH ?? 1), lastMessageAt: hoursAgo(o.inboundH ?? 1),
      ...(contactId ? { shopChannelId: S.ch, externalContactId: contactId } : {}),
    },
    select: { id: true },
  })
  ids.convs.push(c.id)
  return c.id
}
async function mkOrder(conversationId: string | null, o: { isDryRun?: boolean; shopId?: string; buyerName?: string } = {}) {
  const ord = await db.order.create({
    data: {
      shopId: o.shopId ?? S.shop, conversationId, type: 'PHYSICAL', totalAmount: 100, buyerContact: `08${run}`,
      buyerName: o.buyerName ?? 'คุณสมชาย', isDryRun: o.isDryRun ?? false,
      items: { create: { name: 'เสื้อยืด', qty: 1, price: 100 } },
    },
    select: { id: true, publicToken: true },
  })
  ids.orders.push(ord.id)
  return ord
}
async function setSwitch(kind: string, enabled: boolean, enabledAt: Date | null = hoursAgo(1)) {
  await db.autoNotifySwitch.upsert({
    where: { shopId_kind: { shopId: S.shop, kind } },
    create: { shopId: S.shop, kind, enabled, enabledAt },
    update: { enabled, enabledAt },
  })
}
async function setCap(n: number) {
  await db.autoNotifyConfig.upsert({ where: { shopId: S.shop }, create: { shopId: S.shop, dailyCapPerRoom: n }, update: { dailyCapPerRoom: n } })
}
const input = (orderId: string, conversationId: string | null, o: Partial<ReserveInput> = {}): ReserveInput => ({
  shopId: S.shop, orderId, conversationId, kind: 'ORDER_SUMMARY', isDryRun: false, keyedInAt: new Date(), ...o,
})
const reserve = (i: ReserveInput) => appPrisma.$transaction((tx) => reserveAutoNotifyIntent(tx, i))
const ledgerOf = (orderId: string) => db.autoNotifyLedger.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } })
/** จอง + ส่ง ในรอบเดียว — คืน ledger row หลังส่ง */
async function reserveAndDispatch(i: ReserveInput) {
  const id = await reserve(i)
  expect(id).not.toBeNull()
  await dispatchAutoNotify(id!)
  return db.autoNotifyLedger.findUniqueOrThrow({ where: { id: id! } })
}

describe.skipIf(!isLocal)('auto-notify engine (DB จริง)', () => {
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `en-${run}`, username: `en_${run}` }, select: { id: true } })
    const mk = (name: string) => db.shop.create({ data: { userId: u.id, shopName: `en-${name}-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never, select: { id: true } })
    const [shop, other] = await Promise.all([mk('a'), mk('b')])
    const ch = await db.shopChannel.create({
      data: { shopId: shop.id, provider: 'MESSENGER', externalId: `en-ch-${run}`, name: 'เพจ', accessTokenEnc: 'x', connectedByUserId: u.id } as never,
      select: { id: true },
    })
    Object.assign(S, { user: u.id, shop: shop.id, otherShop: other.id, ch: ch.id })
  })

  afterAll(async () => {
    // เฉพาะ id ที่เทสสร้าง (HR13) — ledger/event/message ลบตาม cascade ของ order/conversation/shop
    await db.order.deleteMany({ where: { id: { in: ids.orders } } })
    await db.conversation.deleteMany({ where: { id: { in: ids.convs } } })
    await db.externalContact.deleteMany({ where: { id: { in: ids.contacts } } })
    await db.shopChannel.deleteMany({ where: { id: S.ch } })
    await db.shop.deleteMany({ where: { id: { in: [S.shop, S.otherShop] } } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })

  beforeEach(async () => {
    // ค่าเริ่มต้น: ห้ามยิงจริงในเทส — ข้อที่ต้องการผลส่งต้องตั้ง transmit.impl เอง
    transmit.impl = async () => { throw new Error('real transmit called in test') }
    transmit.calls = 0
    push.mockClear()
    await setSwitch('ORDER_SUMMARY', true)
    await setSwitch('TRACKING', true)
    await db.autoNotifyConfig.deleteMany({ where: { shopId: S.shop } })
    await db.autoNotifyTemplate.deleteMany({ where: { shopId: S.shop } })
  })

  // ───────────────────────── reserve ─────────────────────────
  describe('reserve', () => {
    it('จองได้ → INTENT ยังไม่ claim · valueKey "-"', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const id = await reserve(input(o.id, conv))
      expect(id).toBeTruthy()
      const [row] = await ledgerOf(o.id)
      expect(row).toMatchObject({ id, status: 'INTENT', reason: null, claimedAt: null, valueKey: '-', kind: 'ORDER_SUMMARY', conversationId: conv, shopId: S.shop })
    })

    it('ซ้ำ → null · แถวเดียว · ไม่มี error log (ON CONFLICT ไม่ใช่ catch P2002) [M-dedupe]', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      expect(await reserve(input(o.id, conv))).toBeTruthy()
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        expect(await reserve(input(o.id, conv))).toBeNull()
        expect(spy).not.toHaveBeenCalled()
      } finally {
        spy.mockRestore()
      }
      expect(await ledgerOf(o.id)).toHaveLength(1)
    })

    it('ไม่ผ่านเงื่อนไข → null และไม่มีแถว: สวิตช์ปิด · ก่อน enabledAt · ไม่มีห้อง · dry-run · ห้องร้านอื่น', async () => {
      const conv = await mkConv()
      const foreign = await mkConv({ shopId: S.otherShop })
      const cases: [string, () => Promise<ReserveInput>][] = [
        ['switch off', async () => { await setSwitch('ORDER_SUMMARY', false); const o = await mkOrder(conv); return input(o.id, conv) }],
        ['before enabledAt', async () => { await setSwitch('ORDER_SUMMARY', true, new Date(Date.now() + 3600_000)); const o = await mkOrder(conv); return input(o.id, conv) }],
        ['no conversation', async () => { await setSwitch('ORDER_SUMMARY', true); const o = await mkOrder(null); return input(o.id, null) }],
        ['dry run', async () => { const o = await mkOrder(conv, { isDryRun: true }); return input(o.id, conv, { isDryRun: true }) }],
        ['foreign room', async () => { const o = await mkOrder(conv); return input(o.id, foreign) }],
      ]
      for (const [name, build] of cases) {
        const i = await build()
        expect(await reserve(i), name).toBeNull()
        expect(await ledgerOf(i.orderId), name).toHaveLength(0)
        await setSwitch('ORDER_SUMMARY', true)
      }
    })

    it('D-13 ย้อนหลัง: คนละวันไทย → ไม่จอง · วันเดียวกัน (ต่างแค่เวลา) → จอง', async () => {
      const conv = await mkConv()
      const keyed = new Date('2026-10-17T12:00:00+07:00')
      const back = await mkOrder(conv)
      expect(await reserve(input(back.id, conv, { keyedInAt: keyed, createdAtInput: new Date('2026-10-16T18:00:00+07:00') }))).toBeNull()
      const same = await mkOrder(conv)
      expect(await reserve(input(same.id, conv, { keyedInAt: keyed, createdAtInput: new Date('2026-10-17T00:05:00+07:00') }))).toBeTruthy()
    })

    it('TC-137 เพดาน: ใบที่ cap จองได้ · ใบที่ cap+1 → SKIPPED/DAILY_CAP · อีกห้องไม่ถูกกระทบ [M-cap]', async () => {
      await setCap(2)
      const conv = await mkConv()
      const [o1, o2, o3] = [await mkOrder(conv), await mkOrder(conv), await mkOrder(conv)]
      expect(await reserve(input(o1.id, conv))).toBeTruthy()
      expect(await reserve(input(o2.id, conv))).toBeTruthy() // ขอบ: ใบที่ cap
      expect(await reserve(input(o3.id, conv))).toBeNull() // cap+1
      const [row] = await ledgerOf(o3.id)
      expect(row).toMatchObject({ status: 'SKIPPED', reason: 'DAILY_CAP', claimedAt: null })
      expect(row.settledAt).not.toBeNull()
      expect(await reserve(input(o3.id, conv))).toBeNull() // จองซ้ำไม่ซ้อนแถว
      expect(await ledgerOf(o3.id)).toHaveLength(1)
      const other = await mkConv()
      const o4 = await mkOrder(other)
      expect(await reserve(input(o4.id, other))).toBeTruthy()
    })

    it('TC-138 พร้อมกัน 10 คำขอ เหลือโควตา 1 → ผ่านเพียง 1 (advisory lock)', async () => {
      await setCap(3)
      const conv = await mkConv()
      const first = await mkOrder(conv)
      const second = await mkOrder(conv)
      expect(await reserve(input(first.id, conv))).toBeTruthy()
      expect(await reserve(input(second.id, conv))).toBeTruthy() // ใช้ไป 2 จาก 3
      const orders = await Promise.all(Array.from({ length: 10 }, () => mkOrder(conv)))
      // ถือ tx ต่ออีกนิดหลัง reserve เพื่อให้ช่อง race กว้างพอ — ไม่มีล็อก คำขอที่นับพร้อมกันจะผ่านหมด [M-lock]
      const slow = (i: ReserveInput) =>
        appPrisma.$transaction(
          async (tx) => {
            const r = await reserveAutoNotifyIntent(tx, i)
            await tx.$executeRaw`SELECT pg_sleep(0.15)`
            return r
          },
          { timeout: 30_000, maxWait: 30_000 },
        )
      const results = await Promise.all(orders.map((o) => slow(input(o.id, conv))))
      expect(results.filter(Boolean)).toHaveLength(1)
    })

    it('TC-131 เลขพัสดุ normalize: "th123" กับ " TH123 " = กุญแจเดียว [M-norm]', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const a = await reserve(input(o.id, conv, { kind: 'TRACKING', valueKey: 'th123' }))
      expect(a).toBeTruthy()
      expect(await reserve(input(o.id, conv, { kind: 'TRACKING', valueKey: ' TH123 ' }))).toBeNull()
      const rows = await ledgerOf(o.id)
      expect(rows).toHaveLength(1)
      expect(rows[0].valueKey).toBe('TH123')
    })

    it('TC-133 แก้เลข A→B→A→C→D: ส่ง A,B,C · กลับ A ไม่ซ้ำ · D = SKIPPED/RESEND_LIMIT', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const t = (no: string) => reserve(input(o.id, conv, { kind: 'TRACKING', valueKey: no }))
      expect(await t('AAA')).toBeTruthy()
      expect(await t('BBB')).toBeTruthy()
      expect(await t('AAA')).toBeNull()
      expect(await t('CCC')).toBeTruthy()
      expect(await t('DDD')).toBeNull()
      const rows = await ledgerOf(o.id)
      expect(rows.map((r) => `${r.valueKey}:${r.status}:${r.reason ?? ''}`)).toEqual(['AAA:INTENT:', 'BBB:INTENT:', 'CCC:INTENT:', 'DDD:SKIPPED:RESEND_LIMIT'])
    })

    it('BR-CS-C15 ส่งการ์ดมือไปแล้ว → ไม่จอง · การ์ดมือที่ล้ม/ข้อความระบบเอง ไม่นับ', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      await db.chatMessage.create({ data: { conversationId: conv, senderRole: 'SHOP', type: 'ORDER', orderRefToken: o.publicToken, deliveryStatus: 'FAILED' } })
      await db.chatMessage.create({ data: { conversationId: conv, senderRole: 'SHOP', type: 'ORDER', orderRefToken: o.publicToken, autoReplyKind: 'AUTO_NOTICE' } })
      expect(await reserve(input(o.id, conv))).toBeTruthy()
      const o2 = await mkOrder(conv)
      await db.chatMessage.create({ data: { conversationId: conv, senderRole: 'SHOP', type: 'ORDER', orderRefToken: o2.publicToken } })
      expect(await reserve(input(o2.id, conv))).toBeNull()
      expect(await ledgerOf(o2.id)).toHaveLength(0)
    })

    it('TC-142 reserve ล้ม → ROLLBACK TO SAVEPOINT · งานหลักใน tx เดียวกันรอด [M-sp]', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      let result: string | null | undefined
      try {
        await appPrisma.$transaction(async (tx) => {
          await tx.order.update({ where: { id: o.id }, data: { buyerName: 'เขียนในtx' } })
          // valueKey ยาว > 120 → ชน CHECK ตอน INSERT (เลียนแบบ DB ล้มกลางทาง)
          result = await reserveAutoNotifyIntent(tx, input(o.id, conv, { kind: 'TRACKING', valueKey: 'X'.repeat(200) }))
          // tx ต้องยังใช้ได้หลัง reserve ล้ม
          await tx.order.update({ where: { id: o.id }, data: { buyerName: 'เขียนหลัง reserve ล้ม' } })
        })
        expect(spy).toHaveBeenCalled()
        expect(JSON.stringify(spy.mock.calls)).not.toContain('XXXXXXXX') // ไม่ log ค่า
      } finally {
        spy.mockRestore()
      }
      expect(result).toBeNull()
      expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).buyerName).toBe('เขียนหลัง reserve ล้ม')
      expect(await ledgerOf(o.id)).toHaveLength(0)
    })
  })

  // ───────────────────────── dispatch ─────────────────────────
  describe('dispatch', () => {
    it('DEEP · ค่าตั้งต้น: การ์ด ORDER ในนามระบบ · ledger SENT ผูกข้อความ · OrderEvent · idempotent', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const row = await reserveAndDispatch(input(o.id, conv))
      expect(row).toMatchObject({ status: 'SENT', reason: null })
      expect(row.claimedAt).not.toBeNull()
      expect(row.chatMessageId).toBeTruthy()
      const msg = await db.chatMessage.findUniqueOrThrow({ where: { id: row.chatMessageId! } })
      expect(msg).toMatchObject({ type: 'ORDER', autoReplyKind: 'AUTO_NOTICE', senderUserId: null, senderRole: 'SHOP', orderRefToken: o.publicToken })
      expect(await db.orderEvent.count({ where: { orderId: o.id, type: 'AUTO_NOTICE_SENT' } })).toBe(1)
      await dispatchAutoNotify(row.id) // ซ้ำ
      await dispatchAutoNotify(row.id)
      expect(await db.chatMessage.count({ where: { conversationId: conv, autoReplyKind: 'AUTO_NOTICE' } })).toBe(1)
      expect(await db.orderEvent.count({ where: { orderId: o.id, type: 'AUTO_NOTICE_SENT' } })).toBe(1)
    })

    it('ส่งซ้อนกัน 5 ครั้งพร้อมกัน → ข้อความเดียว (claim)', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const id = (await reserve(input(o.id, conv)))!
      await Promise.all(Array.from({ length: 5 }, () => dispatchAutoNotify(id)))
      expect(await db.chatMessage.count({ where: { conversationId: conv, autoReplyKind: 'AUTO_NOTICE' } })).toBe(1)
    })

    it('เทมเพลตที่ร้านแก้ → ข้อความล้วนจากเทมเพลต (ไม่ใช่การ์ด)', async () => {
      await db.autoNotifyTemplate.create({ data: { shopId: S.shop, kind: 'ORDER_SUMMARY', body: 'สวัสดีคุณ{ชื่อลูกค้า} ยอด {ยอดสุทธิ}' } })
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const row = await reserveAndDispatch(input(o.id, conv))
      const msg = await db.chatMessage.findUniqueOrThrow({ where: { id: row.chatMessageId! } })
      expect(msg).toMatchObject({ type: 'TEXT', body: 'สวัสดีคุณสมชาย ยอด ฿100', autoReplyKind: 'AUTO_NOTICE' })
    })

    it('ข้อความว่างทั้งก้อน → SKIPPED/EMPTY_MESSAGE ไม่ส่ง', async () => {
      await db.autoNotifyTemplate.create({ data: { shopId: S.shop, kind: 'ORDER_SUMMARY', body: '{เลขพัสดุ}' } })
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const row = await reserveAndDispatch(input(o.id, conv))
      expect(row).toMatchObject({ status: 'SKIPPED', reason: 'EMPTY_MESSAGE', chatMessageId: null })
      expect(await db.chatMessage.count({ where: { conversationId: conv } })).toBe(0)
    })

    it('สวิตช์ปิดระหว่างจองกับส่ง → SKIPPED/NOT_ELIGIBLE_ANYMORE ไม่ส่ง', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const id = (await reserve(input(o.id, conv)))!
      await setSwitch('ORDER_SUMMARY', false)
      await dispatchAutoNotify(id)
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'SKIPPED', reason: 'NOT_ELIGIBLE_ANYMORE', chatMessageId: null })
      expect(await db.chatMessage.count({ where: { conversationId: conv } })).toBe(0)
    })

    it('TC-139 ปิดแล้วเปิดใหม่ (enabledAt ใหม่กว่าเจตนา) → ไม่ส่งของเก่า', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const id = (await reserve(input(o.id, conv)))!
      await setSwitch('ORDER_SUMMARY', true, new Date(Date.now() + 60_000))
      await dispatchAutoNotify(id)
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'SKIPPED', reason: 'NOT_ELIGIBLE_ANYMORE' })
    })

    it('ออเดอร์ถูกยกเลิกก่อนส่ง → ไม่ส่ง', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const id = (await reserve(input(o.id, conv)))!
      await db.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } })
      await dispatchAutoNotify(id)
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'SKIPPED', reason: 'NOT_ELIGIBLE_ANYMORE' })
    })

    it('Messenger นอก 24 ชม. → FAILED/WINDOW_CLOSED · ข้อความ FAILED ในห้อง (บับเบิล) · ไม่แตะเครือข่าย · OrderEvent', async () => {
      transmit.impl = null // opt-out: ตัวยิงจริงล้มที่ด่าน 24 ชม. ก่อนแตะเครือข่าย (fetchSpy ยืนยัน)
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      try {
        const conv = await mkConv({ channel: 'MESSENGER', inboundH: 30 })
        const o = await mkOrder(conv)
        const row = await reserveAndDispatch(input(o.id, conv))
        expect(row).toMatchObject({ status: 'FAILED', reason: 'WINDOW_CLOSED' })
        expect(row.chatMessageId).toBeTruthy()
        const msg = await db.chatMessage.findUniqueOrThrow({ where: { id: row.chatMessageId! } })
        expect(msg).toMatchObject({ deliveryStatus: 'FAILED', failureReason: 'WINDOW_CLOSED', autoReplyKind: 'AUTO_NOTICE', senderUserId: null })
        expect(fetchSpy).not.toHaveBeenCalled()
        expect(await db.orderEvent.count({ where: { orderId: o.id, type: 'AUTO_NOTICE_FAILED' } })).toBe(1)
        // ห้องไม่ถูกเปลี่ยนเป็น "ร้านตอบแล้ว" (S-10)
        expect((await db.conversation.findUniqueOrThrow({ where: { id: conv } })).lastSenderRole).toBe('BUYER')
      } finally {
        fetchSpy.mockRestore()
      }
    })

    it('Messenger ในหน้าต่าง · ตัวยิงสำเร็จ → SENT (ยิงครั้งเดียว) · Meta ได้ข้อความลิงก์ (ไม่มี flex)', async () => {
      transmit.impl = async () => ({ externalMessageId: `mid.${run}`, outboundResponse: { ok: true }, failureReason: null, sendMethod: null, sendBatchId: null })
      const conv = await mkConv({ channel: 'MESSENGER', inboundH: 1 })
      const o = await mkOrder(conv)
      const row = await reserveAndDispatch(input(o.id, conv))
      expect(row).toMatchObject({ status: 'SENT', reason: null })
      expect(transmit.calls).toBe(1)
      const msg = await db.chatMessage.findUniqueOrThrow({ where: { id: row.chatMessageId! } })
      expect(msg).toMatchObject({ deliveryStatus: 'SENT', externalMessageId: `mid.${run}`, type: 'ORDER' })
      await db.chatMessage.update({ where: { id: msg.id }, data: { externalMessageId: null } }) // คืน unique ไม่ให้ชนรอบเทสอื่น
    })

    it('ตัวยิงล้ม → FAILED/REJECTED_BY_PLATFORM + OrderEvent AUTO_NOTICE_FAILED · ไม่ยิงซ้ำ', async () => {
      transmit.impl = async () => ({ externalMessageId: null, outboundResponse: { ok: false }, failureReason: 'CONTACT_BLOCKED', sendMethod: null, sendBatchId: null })
      const conv = await mkConv({ channel: 'MESSENGER', inboundH: 1 })
      const o = await mkOrder(conv)
      const row = await reserveAndDispatch(input(o.id, conv))
      expect(row).toMatchObject({ status: 'FAILED', reason: 'REJECTED_BY_PLATFORM' })
      expect(await db.orderEvent.count({ where: { orderId: o.id, type: 'AUTO_NOTICE_FAILED' } })).toBe(1)
      await dispatchAutoNotify(row.id)
      expect(transmit.calls).toBe(1)
    })

    it('TRACKING: ส่งเลขแรกไม่มีคำนำ · เลขใหม่ขึ้นต้น "อัปเดตเลขติดตามพัสดุ" · ledger เลขเก่าที่เลขเปลี่ยนไปแล้ว → ไม่ส่ง', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const tr = await db.shipmentTracking.create({ data: { orderId: o.id, provider: 'Flash Express', trackingNo: 'th111' } })
      const a = await reserveAndDispatch(input(o.id, conv, { kind: 'TRACKING', valueKey: 'th111' }))
      const textA = (await db.chatMessage.findUniqueOrThrow({ where: { id: a.chatMessageId! } })).body!
      expect(a.status).toBe('SENT')
      expect(textA).toContain('th111')
      expect(textA.startsWith(TRACKING_UPDATE_PREFIX)).toBe(false)

      await db.shipmentTracking.update({ where: { id: tr.id }, data: { trackingNo: 'th222' } })
      const staleId = (await reserve(input(o.id, conv, { kind: 'TRACKING', valueKey: 'th222' })))!
      await db.shipmentTracking.update({ where: { id: tr.id }, data: { trackingNo: 'th333' } }) // เปลี่ยนซ้ำก่อนส่ง
      await dispatchAutoNotify(staleId)
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: staleId } })).toMatchObject({ status: 'SKIPPED', reason: 'NOT_ELIGIBLE_ANYMORE' })

      const c = await reserveAndDispatch(input(o.id, conv, { kind: 'TRACKING', valueKey: 'th333' }))
      const textC = (await db.chatMessage.findUniqueOrThrow({ where: { id: c.chatMessageId! } })).body!
      expect(textC.startsWith(`${TRACKING_UPDATE_PREFIX}\n`)).toBe(true)
      expect(textC).toContain('th333')
    })
  })

  // ───────────────────────── sweep ─────────────────────────
  describe('sweep', () => {
    async function intent(o: { id: string }, conv: string, patch: Record<string, unknown> = {}) {
      const id = (await reserve(input(o.id, conv)))!
      if (Object.keys(patch).length) await db.autoNotifyLedger.update({ where: { id }, data: patch })
      return id
    }

    it('INTENT ที่ไม่มีใคร claim เกิน 60 วิ → ส่ง · ที่ยังสด → ไม่แตะ', async () => {
      const conv = await mkConv()
      const stuck = await intent(await mkOrder(conv), conv, { createdAt: minAgo(5) })
      const conv2 = await mkConv()
      const fresh = await intent(await mkOrder(conv2), conv2)
      await sweepAutoNotify(new Date(), { shopIds: [S.shop] })
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: stuck } })).toMatchObject({ status: 'SENT' })
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: fresh } })).toMatchObject({ status: 'INTENT', claimedAt: null })
    })

    it('กวาดแบบ scope ร้าน: แถวของร้านอื่นไม่ถูกแตะ (HR13)', async () => {
      const conv = await mkConv({ shopId: S.otherShop })
      const o = await mkOrder(conv, { shopId: S.otherShop })
      await db.autoNotifyLedger.create({ data: { shopId: S.otherShop, orderId: o.id, conversationId: conv, kind: 'ORDER_SUMMARY', valueKey: '-', createdAt: minAgo(10) } })
      await db.autoNotifyLedger.create({ data: { shopId: S.otherShop, orderId: o.id, conversationId: conv, kind: 'TRACKING', valueKey: 'X1', claimedAt: minAgo(10), createdAt: minAgo(10) } })
      await sweepAutoNotify(new Date(), { shopIds: [S.shop] })
      const rows = await ledgerOf(o.id)
      expect(rows).toHaveLength(2)
      expect(rows.every((r) => r.status === 'INTENT')).toBe(true)
      expect(await db.chatMessage.count({ where: { conversationId: conv } })).toBe(0)
      expect(transmit.calls).toBe(0)
    })

    it('claim ค้างเกิน 3 นาที ไม่มีข้อความ → FAILED/UNCERTAIN_SEND + OrderEvent · ไม่ส่งซ้ำ · ที่ยังสด → ไม่แตะ', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const stale = await intent(o, conv, { claimedAt: minAgo(5) })
      const conv2 = await mkConv()
      const freshClaim = await intent(await mkOrder(conv2), conv2, { claimedAt: minAgo(1) })
      await sweepAutoNotify(new Date(), { shopIds: [S.shop] })
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: stale } })).toMatchObject({ status: 'FAILED', reason: 'UNCERTAIN_SEND', chatMessageId: null })
      expect(await db.chatMessage.count({ where: { conversationId: conv } })).toBe(0)
      expect(await db.orderEvent.count({ where: { orderId: o.id, type: 'AUTO_NOTICE_FAILED' } })).toBe(1)
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: freshClaim } })).toMatchObject({ status: 'INTENT' })
    })

    it('INTENT ที่มีข้อความแล้ว → ตามสถานะข้อความ: SENT / FAILED(UNCERTAIN) / QUEUED ยังไม่ปิด', async () => {
      const mk = async (deliveryStatus: string, failureReason: string | null) => {
        const conv = await mkConv()
        const o = await mkOrder(conv)
        const m = await db.chatMessage.create({ data: { conversationId: conv, senderRole: 'SHOP', type: 'TEXT', body: 'x', autoReplyKind: 'AUTO_NOTICE', deliveryStatus, failureReason } })
        return intent(o, conv, { claimedAt: minAgo(1), chatMessageId: m.id })
      }
      const [sent, uncertain, queued] = [await mk('SENT', null), await mk('FAILED', UNCERTAIN_SEND_REASON), await mk('QUEUED', null)]
      await sweepAutoNotify(new Date(), { shopIds: [S.shop] })
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: sent } })).toMatchObject({ status: 'SENT' })
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: uncertain } })).toMatchObject({ status: 'FAILED', reason: 'UNCERTAIN_SEND' })
      expect(await db.autoNotifyLedger.findUniqueOrThrow({ where: { id: queued } })).toMatchObject({ status: 'INTENT' })
    })
  })

  // ───────────────────────── compose ─────────────────────────
  describe('compose', () => {
    it('ORDER_SUMMARY ค่าตั้งต้นรายการเดียว = ข้อความเดิมของปุ่มมือทุกตัวอักษร · มีการ์ด · LINE https ได้ Flex · Meta ไม่มี', async () => {
      const conv = await mkConv()
      const o = await mkOrder(conv)
      const r = await composeNotice('ORDER_SUMMARY', { shopId: S.shop, orderId: o.id, channel: 'LINE' })
      expect(r.ok && r.text).toBe(`คำสั่งซื้อ: เสื้อยืด\nยอดสุทธิ ฿100\nhttps://deepthailand.app/o/${o.publicToken}`)
      if (!r.ok) throw new Error('unreachable')
      expect(r.isCustom).toBe(false)
      expect(externalCardParts(r.card, 'LINE').flex).toBeTruthy()
      expect(externalCardParts(r.card, 'MESSENGER').flex).toBeUndefined()
    })

    it('แถวเทมเพลตที่ซ้ำค่าตั้งต้นเป๊ะ ยังนับเป็นค่าตั้งต้น (การ์ดไม่หาย)', async () => {
      await db.autoNotifyTemplate.create({ data: { shopId: S.shop, kind: 'ORDER_SUMMARY', body: DEFAULT_TEMPLATES.ORDER_SUMMARY } })
      const o = await mkOrder(null)
      const r = await composeNotice('ORDER_SUMMARY', { shopId: S.shop, orderId: o.id, channel: 'DEEP' })
      expect(r.ok && r.isCustom).toBe(false)
    })

    it('ออเดอร์ของร้านอื่น → ORDER_NOT_FOUND', async () => {
      const o = await mkOrder(null)
      expect(await composeNotice('ORDER_SUMMARY', { shopId: S.otherShop, orderId: o.id, channel: 'DEEP' })).toEqual({ ok: false, reason: 'ORDER_NOT_FOUND' })
    })
  })
})

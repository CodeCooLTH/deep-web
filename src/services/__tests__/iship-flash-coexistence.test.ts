/**
 * 00084 T4 — ร้านเดียวมีบัญชี ISHIP + FLASH: การเชื่อมต่อ/ถอด/ทดสอบ/ตั้งค่าของ iShip ต้องไม่แตะแถว FLASH
 * (และการแก้แถว FLASH ตรง ๆ ต้องไม่เปลี่ยนแถว ISHIP) — เทียบ "ทุกคอลัมน์" ก่อน-หลัง
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 * mutation ที่ต้องแดง: ถอด provider ออกจาก disconnect/markTokenInvalid (iship.service.ts) ⇒ เทส disconnect / verify 401 แดง
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'tok', encryptToken: (t: string) => `enc:${t}` }))

const { listCouriers } = vi.hoisted(() => ({ listCouriers: vi.fn() }))
vi.mock('@/lib/iship/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/iship/client')>()),
  listCouriers,
}))

import { connect, disconnect, verifyConnection, updateSettings, getSettings, getConnection } from '@/services/iship.service'
import { IShipError } from '@/lib/iship/errors'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const db = isLocal ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient)
const run = randomUUID().slice(0, 8)
const S = { user: '', shop: '' }

const flashRow = () => db.shopShippingAccount.findUniqueOrThrow({ where: { shopId_provider: { shopId: S.shop, provider: 'FLASH' } } })
const ishipRow = () => db.shopShippingAccount.findUniqueOrThrow({ where: { shopId_provider: { shopId: S.shop, provider: 'ISHIP' } } })

describe.skipIf(!isLocal)('iShip × Flash อยู่ร่วมกันในร้านเดียว (DB จริง)', () => {
  beforeAll(async () => {
    const u = await db.user.create({ data: { displayName: `co-${run}`, username: `co_${run}` }, select: { id: true } })
    const shop = await db.shop.create({
      data: { userId: u.id, shopName: `co-${run}`, kind: 'BUSINESS', vertical: 'ONLINE_SALES' } as never,
      select: { id: true },
    })
    Object.assign(S, { user: u.id, shop: shop.id })
  })

  afterAll(async () => {
    await db.shopShippingAccount.deleteMany({ where: { shopId: S.shop } })
    await db.shop.deleteMany({ where: { id: S.shop } })
    await db.user.deleteMany({ where: { id: S.user } })
    await db.$disconnect()
  })

  it('connect iShip สร้างแถว ISHIP ได้ทั้งที่มีแถว FLASH อยู่ก่อน และไม่แตะ FLASH', async () => {
    await db.shopShippingAccount.create({
      data: {
        shopId: S.shop, provider: 'FLASH', accessTokenEnc: 'flash-envelope', tokenLast4: 'abcd',
        status: 'ACTIVE', createMode: 'ASK', connectedByUserId: S.user, senderName: 'ผู้ส่ง Flash',
        defaultWeight: 1.5, lastVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      },
    })
    const before = await flashRow()
    listCouriers.mockResolvedValue([])
    const view = await connect(S.shop, S.user, 'ishiptoken1234')
    expect(view.connected).toBe(true)
    expect(await flashRow()).toEqual(before)
    const i = await ishipRow()
    expect(i.provider).toBe('ISHIP')
    expect(i.createMode).toBe('OFF')
  })

  it('updateSettings / getSettings ของ iShip ไม่เปลี่ยนแถว FLASH และอ่านค่าของ ISHIP (ไม่ใช่ FLASH)', async () => {
    const before = await flashRow()
    await updateSettings(S.shop, { senderName: 'ผู้ส่ง iShip', createMode: 'AUTO' })
    expect(await flashRow()).toEqual(before)
    const s = await getSettings(S.shop)
    expect(s.senderName).toBe('ผู้ส่ง iShip')
    expect(s.createMode).toBe('AUTO')
  })

  it('verifyConnection สำเร็จ: แก้เฉพาะ ISHIP · 401 จาก iShip: mark TOKEN_INVALID เฉพาะ ISHIP (FLASH ยัง ACTIVE)', async () => {
    const before = await flashRow()
    listCouriers.mockResolvedValue([])
    await verifyConnection(S.shop)
    expect(await flashRow()).toEqual(before)

    listCouriers.mockRejectedValue(new IShipError('TOKEN_INVALID' as never))
    const v = await verifyConnection(S.shop)
    expect(v.status).toBe('TOKEN_INVALID')
    expect((await ishipRow()).status).toBe('TOKEN_INVALID')
    expect(await flashRow()).toEqual(before)
  })

  it('disconnect iShip ล้าง key เฉพาะ ISHIP — แถว FLASH (key/ค่าตั้งต้น) ไม่เปลี่ยนสักคอลัมน์', async () => {
    const before = await flashRow()
    await disconnect(S.shop)
    const i = await ishipRow()
    expect(i.status).toBe('DISCONNECTED')
    expect(i.accessTokenEnc).toBe('')
    expect(await flashRow()).toEqual(before)
    expect((await getConnection(S.shop)).connected).toBe(false)
  })

  it('กลับทาง: แก้แถว FLASH ตรง ๆ ไม่เปลี่ยนแถว ISHIP', async () => {
    const before = await ishipRow()
    await db.shopShippingAccount.update({
      where: { shopId_provider: { shopId: S.shop, provider: 'FLASH' } },
      data: { status: 'TOKEN_INVALID', accessTokenEnc: '', senderName: 'x' },
    })
    expect(await ishipRow()).toEqual(before)
  })
})

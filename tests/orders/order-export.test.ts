/**
 * 00086 — loadOrderExport บน Postgres จริง (ขอบเขตร้าน · ลำดับ · เพดาน)
 *
 * ต้องรันกับ local Docker Postgres เท่านั้น (Hard Rule 13/14) — ปักหมุด URL ในคำสั่งตรง ๆ:
 *   DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" npx vitest run tests/orders/order-export.test.ts
 * ไม่ใช่ฐาน local ⇒ ทั้งไฟล์ skip · ข้อมูลที่เทสสร้างลบด้วย id ที่บันทึกไว้ (deleteTestData)
 */
import { describe, it, expect, afterEach } from 'vitest'
import { prisma, deleteTestData } from '../setup'
import { loadOrderExport } from '@/services/order-export.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /^postgres(ql)?:\/\/[^@]*@?(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url)
const d = isLocal ? describe : describe.skip

const userIds: string[] = []
const shopIds: string[] = []
let seq = 0

afterEach(async () => {
  await deleteTestData({ userIds: [...userIds], shopIds: [...shopIds] })
  userIds.length = 0
  shopIds.length = 0
})

async function seedShop() {
  const n = `${Date.now()}${seq++}`.slice(-9)
  const user = await prisma.user.create({ data: { phone: `09${n}`, displayName: `ex ${n}`, username: `extest${n}` } })
  userIds.push(user.id)
  const shop = await prisma.shop.create({
    data: { userId: user.id, shopName: `EX ${n}`, businessType: 'INDIVIDUAL', vertical: 'ONLINE_SALES' },
  })
  shopIds.push(shop.id)
  return shop
}

async function seedOrder(shopId: string, name: string, createdAt: Date) {
  return prisma.order.create({
    data: {
      shopId, type: 'PHYSICAL', status: 'CONFIRMED', totalAmount: 100, buyerName: name, buyerContact: '0812345678', createdAt,
      items: { create: [{ name: 'a', qty: 1, price: 100, cost: 60 }] },
    },
  })
}

d('loadOrderExport (integration)', () => {
  it('token ของร้านอื่นที่ปนมาถูกทิ้ง — ไฟล์มีเฉพาะร้าน active', async () => {
    const mine = await seedShop()
    const other = await seedShop()
    const a = await seedOrder(mine.id, 'mine', new Date('2026-10-01'))
    const x = await seedOrder(other.id, 'other', new Date('2026-10-02'))
    const res = await loadOrderExport(mine.id, 'ONLINE_SALES', [a.publicToken, x.publicToken])
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.rows.map((r) => r.buyerName)).toEqual(['mine'])
  })

  it('โหมดตามตัวกรองเรียงตามลำดับ token ที่ส่งมา (ลำดับบนจอ) · ทั้งหมดเรียงใหม่→เก่า', async () => {
    const s = await seedShop()
    const o1 = await seedOrder(s.id, 'o1', new Date('2026-10-01'))
    const o2 = await seedOrder(s.id, 'o2', new Date('2026-10-02'))
    const o3 = await seedOrder(s.id, 'o3', new Date('2026-10-03'))
    const f = await loadOrderExport(s.id, 'ONLINE_SALES', [o1.publicToken, o3.publicToken])
    expect(f.kind === 'ok' && f.rows.map((r) => r.buyerName)).toEqual(['o1', 'o3'])
    const all = await loadOrderExport(s.id, 'ONLINE_SALES', null)
    expect(all.kind === 'ok' && all.rows.map((r) => r.buyerName)).toEqual(['o3', 'o2', 'o1'])
    void o2
  })

  it('ร้านไม่มีออเดอร์ / token ไม่ตรงร้าน → empty', async () => {
    const s = await seedShop()
    expect((await loadOrderExport(s.id, 'ONLINE_SALES', null)).kind).toBe('empty')
  })
})

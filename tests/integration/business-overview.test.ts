/**
 * 00069 — ภาพรวมทุกธุรกิจ บน Postgres จริง (TestCase TC-002 · TC-003 · TC-005)
 *
 * ต้องรันกับ local Docker Postgres เท่านั้น (Hard Rule 13/14) — ปักหมุด URL ในคำสั่งตรง ๆ:
 *   npx dotenv -e .env -- env DATABASE_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     DIRECT_URL="postgresql://safepay:safepay@localhost:5434/safepay" \
 *     npx vitest run tests/integration/business-overview.test.ts
 * ไม่ใช่ฐาน local ⇒ ทั้งไฟล์ skip
 *
 * ข้อมูลที่เทสสร้างเองทั้งหมด ลบด้วย id ที่บันทึกไว้ (deleteTestData) — subscription/ShopMember cascade ตาม user/shop
 */
import { describe, it, expect, afterEach } from 'vitest'
import { prisma, deleteTestData } from '../setup'
import { getBusinessOverview } from '@/services/business-overview.service'
import { getPnlReport } from '@/services/pnl.service'
import { resolveDateRange } from '@/lib/date-range'

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

async function seedUser(sub: 'ACTIVE' | 'LOCKED_RENEWAL_FAILED' | null) {
  const n = `${Date.now()}${seq++}`.slice(-9)
  const user = await prisma.user.create({ data: { phone: `09${n}`, displayName: `bo ${n}`, username: `botest${n}` } })
  userIds.push(user.id)
  if (sub) {
    const now = new Date()
    await prisma.businessPackageSubscription.create({
      data: { ownerId: user.id, tier: 'GROWTH', status: sub, activatedAt: now, currentPeriodStart: now, nextRenewalAt: new Date(now.getTime() + 30 * 864e5) },
    })
  }
  return user
}

async function seedShop(ownerId: string, opts: { kind?: 'PERSONAL' | 'BUSINESS'; locked?: boolean; name?: string } = {}) {
  const shop = await prisma.shop.create({
    data: {
      userId: ownerId,
      shopName: opts.name ?? `BO ${seq++}`,
      businessType: 'INDIVIDUAL',
      kind: opts.kind ?? 'BUSINESS',
      packageLockedAt: opts.locked ? new Date() : null,
    },
  })
  shopIds.push(shop.id)
  return shop
}

const addMember = (shopId: string, userId: string, role: 'OWNER' | 'ADMIN') =>
  prisma.shopMember.create({ data: { shopId, userId, role } })

const month = () => {
  const range = resolveDateRange('month')
  return { range, qs: 'range=month' }
}

d('getBusinessOverview (integration)', () => {
  it('TC-002 ไม่มีร้าน BUSINESS ที่จ่ายแล้ว → null', async () => {
    const me = await seedUser(null)
    await seedShop(me.id, { kind: 'PERSONAL' })
    await seedShop(me.id) // BUSINESS แต่ไม่มีแพ็กเกจ
    const { range, qs } = month()
    expect(await getBusinessOverview(me.id, range, qs)).toBeNull()
  })

  it('TC-003 นับเฉพาะ OWNER ของร้าน BUSINESS ที่เจ้าของหลักจ่าย ACTIVE และไม่ล็อก', async () => {
    const me = await seedUser('ACTIVE')
    const partner = await seedUser('ACTIVE')
    const lapsed = await seedUser('LOCKED_RENEWAL_FAILED')
    const free = await seedUser(null)

    await seedShop(me.id, { kind: 'PERSONAL', name: 'personal' })
    const x = await seedShop(me.id, { name: 'X' }) // เจ้าของหลัก ✔
    const y = await seedShop(partner.id, { name: 'Y' }) // เจ้าของร่วม ✔
    await addMember(y.id, me.id, 'OWNER')
    const z = await seedShop(partner.id, { name: 'Z' }) // ADMIN ✘
    await addMember(z.id, me.id, 'ADMIN')
    await seedShop(me.id, { name: 'W', locked: true }) // ล็อก ✘
    const v = await seedShop(lapsed.id, { name: 'V' }) // แพ็กเกจเจ้าของหลักไม่ ACTIVE ✘
    await addMember(v.id, me.id, 'OWNER')
    const u = await seedShop(free.id, { name: 'U' }) // เจ้าของหลักไม่มีแพ็กเกจ ✘
    await addMember(u.id, me.id, 'OWNER')

    const { range, qs } = month()
    const res = await getBusinessOverview(me.id, range, qs)
    expect(res?.cards.map((c) => c.shopId).sort()).toEqual([x.id, y.id].sort())
  })

  it('TC-005 ตัวเลขการ์ดเท่ากับ getPnlReport ของร้านเดียวกันทุกบาท', async () => {
    const me = await seedUser('ACTIVE')
    const x = await seedShop(me.id, { name: 'X' })
    await prisma.order.create({ data: { shopId: x.id, totalAmount: 1234.5, status: 'CONFIRMED' } })
    await prisma.order.create({ data: { shopId: x.id, totalAmount: 100, status: 'CONFIRMED' } })

    const { range, qs } = month()
    const res = await getBusinessOverview(me.id, range, qs)
    const pnl = await getPnlReport(x.id, range, x.vertical)
    const card = res!.cards[0]
    expect(card.status).toBe('OK')
    expect(card.revenue).toBe(pnl.revenue)
    expect(card.netProfit).toBe(pnl.netProfit)
    expect(card.orderCount).toBe(pnl.orderCount)
    expect(pnl.revenue).toBe(1334.5) // กันกรณีทั้งคู่เป็น 0 แล้วเขียวแบบว่างเปล่า
    expect(res!.totals.revenue).toBe(pnl.revenue)
    expect(card.href).toBe('/expenses?range=month')
  })
})

/**
 * 00069 — ภาพรวมทุกธุรกิจ บน Postgres จริง (TestCase TC-002 · TC-003 · v1.1 TC-005/TC-013)
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
import { getPortfolioSeries, listOverviewShops } from '@/services/business-overview.service'
import { getSalesSeries } from '@/services/dashboard.service'
import { periodRange } from '@/lib/business-overview'
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
  prisma.shopMember.create({ data: { shopId, userId, role, roles: role === 'ADMIN' ? ['MANAGER'] : [] } })

d('listOverviewShops / getPortfolioSeries (integration)', () => {
  it('TC-002 ไม่มีร้าน BUSINESS ที่จ่ายแล้ว → ว่าง', async () => {
    const me = await seedUser(null)
    await seedShop(me.id, { kind: 'PERSONAL' })
    await seedShop(me.id) // BUSINESS แต่ไม่มีแพ็กเกจ
    expect(await listOverviewShops(me.id)).toEqual([])
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

    const res = await listOverviewShops(me.id)
    expect(res.map((c) => c.id).sort()).toEqual([x.id, y.id].sort())
  })

  it('v1.1 TC-005/TC-013 getPortfolioSeries: ยอดขาย = getSalesSeries.total · กำไร = getPnlReport · Personal ไม่นับ · ADMIN ไม่อยู่', async () => {
    const me = await seedUser('ACTIVE')
    const partner = await seedUser('ACTIVE')
    const personal = await seedShop(me.id, { kind: 'PERSONAL', name: 'ส่วนตัว' })
    const x = await seedShop(me.id, { name: 'X' })
    const z = await seedShop(partner.id, { name: 'Z' })
    await addMember(z.id, me.id, 'ADMIN')
    await prisma.order.create({ data: { shopId: x.id, totalAmount: 500, status: 'CONFIRMED' } })
    await prisma.order.create({ data: { shopId: personal.id, totalAmount: 9000, status: 'CONFIRMED' } })

    const now = new Date(Date.now() + 7 * 3600e3) // เวลาไทย
    const year = now.getUTCFullYear()
    const month = now.getUTCMonth() + 1
    const shops = await listOverviewShops(me.id)
    const res = (await getPortfolioSeries(shops, personal, 'daily', year, month))!

    const p = periodRange('daily', year, month)
    const series = await getSalesSeries(x.id, 'daily', { year, month }, false, x.vertical)
    const pnl = await getPnlReport(x.id, resolveDateRange('custom', p.start, p.end), x.vertical)
    const rowX = res.rows.find((r) => r.shopId === x.id)!
    expect(series.total).toBeGreaterThan(0) // กันเขียวว่าง
    expect(rowX.sales).toBe(series.total)
    expect(rowX.netProfit).toBe(pnl.netProfit)
    expect(res.totals.sales).toBe(series.total) // Personal 9000 ไม่ถูกนับ
    expect(res.aggregate.total).toBe(series.total)
    expect(res.rows.at(-1)).toMatchObject({ shopId: personal.id, isPersonal: true, sharePct: null })
    expect(res.rows.some((r) => r.shopId === z.id)).toBe(false)
    expect(res.stack.map((st) => st.key)).toEqual([x.id])
    expect(rowX.href).toBe(`/expenses?range=custom&start=${p.start}&end=${p.end}`)
  })
})

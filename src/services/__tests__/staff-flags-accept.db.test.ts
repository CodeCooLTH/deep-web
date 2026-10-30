/**
 * staff-flags-accept.db.test.ts — 00086 S-4: ธงสิทธิ์รายคน (ปิดงานได้ / บันทึกค่าใช้จ่ายได้) ตลอดเส้นทางเชิญ → รับ → โอนเจ้าของ บน Postgres จริง
 * - รับคำเชิญ (เบอร์โทร) / รับลิงก์ คัดลอกธงลงแถวสมาชิก · ลิงก์ที่ไม่ส่งธง = false
 * - ร้านขายของ + ธง = STAFF_FLAGS_NOT_AVAILABLE · เปิดบิลล้วน + ปิดงาน = CLOSE_JOB_NEEDS_START_ROLE (ไม่มีแถวถูกเขียน)
 * - [blocker] โอนเจ้าของหลักให้สมาชิกที่มีธง ต้องสำเร็จและล้างธง — ไม่ล้าง = CHECK ShopMember_flags_admin_only_check (23514) → 500
 * 🛑 HR13/HR14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้าง
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import {
  acceptShopInvite, changeMemberRole, inviteShopMember, transferShopOwnership,
} from '@/services/shop-member.service'
import { acceptInviteLink, createInviteLink } from '@/services/invite-link.service'

const url = process.env.DATABASE_URL ?? ''
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url)
const d = isLocal ? describe : describe.skip
const run = randomUUID().slice(0, 8)
const phoneOf = (n: number) => `09${run.replace(/\D/g, '').padEnd(4, '7').slice(0, 4)}${String(n).padStart(4, '0')}`

const ids = { users: [] as string[], shops: [] as string[], subs: [] as string[] }
const f: Record<string, string> = {}

d('00086 ธงสิทธิ์ตอนเชิญ/รับ/โอนเจ้าของ (DB local)', () => {
  let phoneSeq = 0
  const mkUser = async (t: string, phone?: string) => {
    const u = await prisma.user.create({
      data: { displayName: `sfa-${run}-${t}`, username: `sfa_${run}_${t}`, ...(phone ? { phone } : {}) },
      select: { id: true },
    })
    ids.users.push(u.id)
    return u.id
  }
  const mkSub = async (ownerId: string) => {
    const now = new Date()
    const s = await prisma.businessPackageSubscription.create({
      data: { ownerId, tier: 'BUSINESS', status: 'ACTIVE', activatedAt: now, currentPeriodStart: now, nextRenewalAt: new Date(now.getTime() + 30 * 864e5) },
      select: { id: true },
    })
    ids.subs.push(s.id)
  }
  const mkShop = async (t: string, vertical: string) => {
    const owner = await mkUser(`${t}-own`)
    await mkSub(owner)
    const s = await prisma.shop.create({
      data: { userId: owner, shopName: `sfa-${run}-${t}`, kind: 'BUSINESS', vertical } as never, select: { id: true },
    })
    ids.shops.push(s.id)
    await prisma.shopMember.create({ data: { shopId: s.id, userId: owner, role: 'OWNER', roles: [] } })
    f[`${t}Shop`] = s.id
    f[`${t}Owner`] = owner
  }
  const memberOf = (shopId: string, userId: string) =>
    prisma.shopMember.findUnique({
      where: { shopId_userId: { shopId, userId } },
      select: { id: true, role: true, roles: true, canCloseJob: true, canRecordExpense: true },
    })

  beforeAll(async () => {
    await mkShop('svc', 'SERVICE_QUEUE')
    await mkShop('onl', 'ONLINE_SALES')
  })

  afterAll(async () => {
    // ลิงก์ผูก createdBy แบบไม่ cascade → ลบก่อน user · ที่เหลือ scope ด้วยร้าน/ผู้ใช้ที่เทสสร้าง
    if (ids.shops.length) {
      await prisma.shopInviteLink.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shopInvite.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.shopMember.deleteMany({ where: { shopId: { in: ids.shops } } })
      await prisma.trustScoreHistory.deleteMany({ where: { shopId: { in: ids.shops } } })
    }
    if (ids.subs.length) await prisma.businessPackageSubscription.deleteMany({ where: { id: { in: ids.subs } } })
    if (ids.shops.length) await prisma.shop.deleteMany({ where: { id: { in: ids.shops } } })
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
    await prisma.$disconnect()
  })

  it('รับคำเชิญทางเบอร์ คัดลอกธงลงแถวสมาชิก', async () => {
    const phone = phoneOf(++phoneSeq)
    const uid = await mkUser('inv', phone)
    const inv = await inviteShopMember(f.svcOwner, f.svcShop, phone, 'PHONE', ['CHAT'], { canCloseJob: true, canRecordExpense: true })
    expect(inv).toMatchObject({ canCloseJob: true, canRecordExpense: true })
    await acceptShopInvite(inv.id, uid)
    expect(await memberOf(f.svcShop, uid)).toMatchObject({ role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, canRecordExpense: true })
  })

  it('รับลิงก์ คัดลอกธง · ลิงก์ที่ไม่ส่งธง = false ทั้งสอง', async () => {
    const flagged = await createInviteLink(f.svcOwner, f.svcShop, '7d', ['TECHNICIAN'], { canCloseJob: true })
    const plain = await createInviteLink(f.svcOwner, f.svcShop, '7d', ['CHAT'])
    expect(await prisma.shopInviteLink.findUnique({ where: { slug: plain.slug }, select: { canCloseJob: true, canRecordExpense: true } }))
      .toEqual({ canCloseJob: false, canRecordExpense: false })

    const a = await mkUser('lnkA')
    const b = await mkUser('lnkB')
    await acceptInviteLink(flagged.slug, a)
    await acceptInviteLink(plain.slug, b)
    expect(await memberOf(f.svcShop, a)).toMatchObject({ roles: ['TECHNICIAN'], canCloseJob: true, canRecordExpense: false })
    expect(await memberOf(f.svcShop, b)).toMatchObject({ roles: ['CHAT'], canCloseJob: false, canRecordExpense: false })
  })

  it('ร้านขายของ + ธง = STAFF_FLAGS_NOT_AVAILABLE ทุกทาง (เชิญ · ลิงก์ · เปลี่ยนบทบาท) ไม่มีแถวถูกเขียน', async () => {
    const phone = phoneOf(++phoneSeq)
    await expect(inviteShopMember(f.onlOwner, f.onlShop, phone, 'PHONE', ['CHAT'], { canRecordExpense: true }))
      .rejects.toThrow('STAFF_FLAGS_NOT_AVAILABLE')
    await expect(createInviteLink(f.onlOwner, f.onlShop, '7d', ['CHAT'], { canCloseJob: true }))
      .rejects.toThrow('STAFF_FLAGS_NOT_AVAILABLE')
    expect(await prisma.shopInvite.count({ where: { shopId: f.onlShop } })).toBe(0)
    expect(await prisma.shopInviteLink.count({ where: { shopId: f.onlShop } })).toBe(0)

    const uid = await mkUser('onlChat')
    const m = await prisma.shopMember.create({ data: { shopId: f.onlShop, userId: uid, role: 'ADMIN', roles: ['CHAT'] }, select: { id: true } })
    await expect(changeMemberRole(f.onlOwner, f.onlShop, m.id, { canCloseJob: true })).rejects.toThrow('STAFF_FLAGS_NOT_AVAILABLE')
    expect(await memberOf(f.onlShop, uid)).toMatchObject({ canCloseJob: false, canRecordExpense: false })
  })

  it('เปิดบิลล้วน + ปิดงาน = CLOSE_JOB_NEEDS_START_ROLE · เปิดบิลล้วน + บันทึกค่าใช้จ่าย = ได้', async () => {
    await expect(createInviteLink(f.svcOwner, f.svcShop, '7d', ['BILLING'], { canCloseJob: true }))
      .rejects.toThrow('CLOSE_JOB_NEEDS_START_ROLE')
    const uid = await mkUser('bill')
    const m = await prisma.shopMember.create({ data: { shopId: f.svcShop, userId: uid, role: 'ADMIN', roles: ['BILLING'] }, select: { id: true } })
    await expect(changeMemberRole(f.svcOwner, f.svcShop, m.id, { canCloseJob: true })).rejects.toThrow('CLOSE_JOB_NEEDS_START_ROLE')
    expect(await changeMemberRole(f.svcOwner, f.svcShop, m.id, { canRecordExpense: true }))
      .toEqual({ role: 'ADMIN', roles: ['BILLING'], canCloseJob: false, canRecordExpense: true, unassignedJobCount: 0 })
    expect(await memberOf(f.svcShop, uid)).toMatchObject({ canCloseJob: false, canRecordExpense: true })
  })

  it('เลื่อนสมาชิกที่มีธงเป็นเจ้าของร่วม = สำเร็จ + ล้างธง (ไม่ชน CHECK)', async () => {
    const uid = await mkUser('promo')
    const m = await prisma.shopMember.create({
      data: { shopId: f.svcShop, userId: uid, role: 'ADMIN', roles: ['CHAT'], canCloseJob: true, canRecordExpense: true }, select: { id: true },
    })
    await changeMemberRole(f.svcOwner, f.svcShop, m.id, { role: 'OWNER' })
    expect(await memberOf(f.svcShop, uid)).toMatchObject({ role: 'OWNER', roles: [], canCloseJob: false, canRecordExpense: false })
  })

  it('[blocker] โอนเจ้าของหลักให้สมาชิกที่มีธง = สำเร็จ + ธงของผู้รับเป็น false', async () => {
    const recipient = await mkUser('heir')
    await mkSub(recipient) // ผู้รับต้องมีแพ็กเกจ (checkTransfer)
    const m = await prisma.shopMember.create({
      data: { shopId: f.svcShop, userId: recipient, role: 'ADMIN', roles: ['TECHNICIAN'], canCloseJob: true, canRecordExpense: true },
      select: { id: true },
    })
    await expect(transferShopOwnership(f.svcOwner, f.svcShop, m.id)).resolves.toEqual({ transferred: true, unassignedJobCount: 0 })
    expect(await memberOf(f.svcShop, recipient)).toMatchObject({ role: 'OWNER', roles: [], canCloseJob: false, canRecordExpense: false })
    expect((await prisma.shop.findUnique({ where: { id: f.svcShop }, select: { userId: true } }))?.userId).toBe(recipient)
  })
})

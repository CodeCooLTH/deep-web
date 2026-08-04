/**
 * account-deletion.service.test.ts — unit tests สำหรับการลบบัญชี (App Store 5.1.1(v))
 *
 * ทำไม mock แทน integration test: test env ไม่มี DB จริง (vitest node) และ 🛑 Hard Rule 13
 * ห้ามให้ไฟล์เทสแตะข้อมูลจริงเลย — dev DB = prod DB ตัวเดียวกัน ไฟล์นี้จึง mock prisma ทั้ง module
 * ไม่มีคำสั่งลบข้อมูลที่ชี้ฐานจริงแม้แต่คำสั่งเดียว (ทุกอย่างวิ่งเข้า vi.fn())
 *
 * Pattern: vi.mock module-level + vi.mocked ตาม activity.service.test.ts
 * Spec: docs/superpowers/specs/2026-08-04-account-deletion-design.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── mock prisma ──────────────────────────────────────────────────────────────
// $transaction ส่ง tx object ที่มีเมธอดชุดเดียวกันเข้า callback — service เรียกผ่าน tx ไม่ใช่ prisma ตรง
const tx = {
  user: { updateMany: vi.fn(), update: vi.fn() },
  shop: { updateMany: vi.fn() },
  pushToken: { deleteMany: vi.fn() },
  shopMember: { deleteMany: vi.fn() },
  authAccount: { deleteMany: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    shop: { findMany: vi.fn() },
    order: { count: vi.fn() },
    shopMember: { count: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import {
  checkAccountDeletable,
  deleteAccount,
  purgeExpiredAccounts,
  AccountDeletionError,
} from '@/services/account-deletion.service'
import { PURGED_DISPLAY_NAME, purgedUsername } from '@/lib/account-deletion'

const USER_ID = '11111111-2222-3333-4444-555555555555'

/** ตั้งค่า mock ให้เป็น "บัญชีปกติ ไม่มีอะไรค้าง" แล้วให้แต่ละเทส override เฉพาะที่สนใจ */
function arrangeHealthyAccount(overrides?: {
  shops?: Array<{ id: string; shopName: string; kind: string; wallet: { balance: number } | null }>
  pendingOrders?: number
  memberCount?: number
  deletedAt?: Date | null
}) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: USER_ID,
    displayName: 'สมชาย ใจดี',
    deletedAt: overrides?.deletedAt ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  vi.mocked(prisma.shop.findMany).mockResolvedValue(
    (overrides?.shops ?? [
      { id: 'shop-1', shopName: 'ร้านลุงหนวด', kind: 'PERSONAL', wallet: { balance: 0 } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]) as any,
  )
  vi.mocked(prisma.order.count).mockResolvedValue(overrides?.pendingOrders ?? 0)
  vi.mocked(prisma.shopMember.count).mockResolvedValue(overrides?.memberCount ?? 0)
}

beforeEach(() => {
  vi.clearAllMocks()
  // $transaction เรียก callback ด้วย tx mock — เลียนแบบ interactive transaction ของ Prisma
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx))
  tx.user.updateMany.mockResolvedValue({ count: 1 })
  tx.shop.updateMany.mockResolvedValue({ count: 1 })
  tx.pushToken.deleteMany.mockResolvedValue({ count: 0 })
  tx.shopMember.deleteMany.mockResolvedValue({ count: 0 })
  tx.authAccount.deleteMany.mockResolvedValue({ count: 0 })
  tx.user.update.mockResolvedValue({})
})

// ─── checkAccountDeletable ────────────────────────────────────────────────────
describe('checkAccountDeletable', () => {
  it('บัญชีสะอาด → ลบได้ ไม่มี blocker/warning', async () => {
    arrangeHealthyAccount()
    const result = await checkAccountDeletable(USER_ID)
    expect(result.canDelete).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('มีออเดอร์ PENDING/SHIPPED ค้าง → บล็อก พร้อมจำนวนจริงในข้อความ', async () => {
    arrangeHealthyAccount({ pendingOrders: 3 })
    const result = await checkAccountDeletable(USER_ID)
    expect(result.canDelete).toBe(false)
    expect(result.blockers).toHaveLength(1)
    expect(result.blockers[0].code).toBe('PENDING_ORDERS')
    expect(result.blockers[0].count).toBe(3)
    // ข้อความต้องบอกตัวเลขจริง — Apple ยอมรับการบล็อกก็ต่อเมื่อบอกชัดว่าต้องทำอะไรก่อน
    expect(result.blockers[0].message).toContain('3')
  })

  it('นับเฉพาะสถานะ PENDING และ SHIPPED เท่านั้น (CONFIRMED/CANCELLED ไม่บล็อก)', async () => {
    arrangeHealthyAccount()
    await checkAccountDeletable(USER_ID)
    const where = vi.mocked(prisma.order.count).mock.calls[0][0]?.where as {
      status: { in: string[] }
    }
    expect(where.status.in).toEqual(['PENDING', 'SHIPPED'])
    expect(where.status.in).not.toContain('CONFIRMED')
    expect(where.status.in).not.toContain('CANCELLED')
  })

  it('มีเครดิตเหลือ → เป็น warning ไม่ใช่ blocker (ยังลบได้)', async () => {
    arrangeHealthyAccount({
      shops: [{ id: 'shop-1', shopName: 'ร้านลุงหนวด', kind: 'PERSONAL', wallet: { balance: 250 } }],
    })
    const result = await checkAccountDeletable(USER_ID)
    expect(result.canDelete).toBe(true)
    expect(result.warnings.map((w) => w.code)).toContain('WALLET_BALANCE')
    expect(result.warnings[0].message).toContain('250')
  })

  it('รวมยอดเครดิตจากทุกร้านที่เป็นเจ้าของ', async () => {
    arrangeHealthyAccount({
      shops: [
        { id: 'a', shopName: 'ร้าน A', kind: 'PERSONAL', wallet: { balance: 100 } },
        { id: 'b', shopName: 'ร้าน B', kind: 'BUSINESS', wallet: { balance: 50 } },
        { id: 'c', shopName: 'ร้าน C', kind: 'BUSINESS', wallet: null },
      ],
    })
    const result = await checkAccountDeletable(USER_ID)
    expect(result.warnings.find((w) => w.code === 'WALLET_BALANCE')?.message).toContain('150')
  })

  it('ร้าน Business มีพนักงาน → warning (ไม่นับตัวเอง)', async () => {
    arrangeHealthyAccount({
      shops: [{ id: 'b1', shopName: 'บริษัทลุง', kind: 'BUSINESS', wallet: { balance: 0 } }],
      memberCount: 4,
    })
    const result = await checkAccountDeletable(USER_ID)
    expect(result.warnings.map((w) => w.code)).toContain('BUSINESS_MEMBERS')
    const where = vi.mocked(prisma.shopMember.count).mock.calls[0][0]?.where as {
      userId: { not: string }
    }
    expect(where.userId).toEqual({ not: USER_ID })
  })

  it('ข้อความยืนยัน = ชื่อที่แสดง เสมอ ไม่ว่าจะมีร้านหรือไม่', async () => {
    // ทั้งสอง surface (ผู้ขาย /account, ผู้ซื้อ /settings/profile) เป็นหน้าของ "ตัวคน"
    // จึงใช้เกณฑ์เดียว — ห้ามกลับไปใช้ชื่อร้าน หน้า /account ห้ามแสดงชื่อร้านอยู่แล้ว
    arrangeHealthyAccount()
    expect((await checkAccountDeletable(USER_ID)).confirmLabel).toBe('สมชาย ใจดี')

    arrangeHealthyAccount({ shops: [] })
    expect((await checkAccountDeletable(USER_ID)).confirmLabel).toBe('สมชาย ใจดี')
  })

  it('บัญชีถูกลบไปแล้ว → ALREADY_DELETED', async () => {
    arrangeHealthyAccount({ deletedAt: new Date() })
    await expect(checkAccountDeletable(USER_ID)).rejects.toThrow(AccountDeletionError)
  })

  it('ไม่พบผู้ใช้ → NOT_FOUND', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    await expect(checkAccountDeletable(USER_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

// ─── deleteAccount ────────────────────────────────────────────────────────────
describe('deleteAccount', () => {
  it('ข้อความยืนยันไม่ตรง → CONFIRM_MISMATCH และไม่แตะฐานเลย', async () => {
    arrangeHealthyAccount()
    await expect(deleteAccount(USER_ID, 'พิมพ์มั่ว')).rejects.toMatchObject({
      code: 'CONFIRM_MISMATCH',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('ยืนยันตรงแบบ trim + ไม่สนตัวพิมพ์ใหญ่เล็ก', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: USER_ID,
      displayName: 'Somchai Shop',
      deletedAt: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.shop.findMany).mockResolvedValue([] as any)
    vi.mocked(prisma.order.count).mockResolvedValue(0)
    vi.mocked(prisma.shopMember.count).mockResolvedValue(0)

    await expect(deleteAccount(USER_ID, '  somchai shop  ')).resolves.toBeTruthy()
  })

  it('มี blocker → HAS_BLOCKERS แม้ข้อความยืนยันจะตรง (ตรวจซ้ำฝั่ง server เสมอ)', async () => {
    arrangeHealthyAccount({ pendingOrders: 1 })
    await expect(deleteAccount(USER_ID, 'สมชาย ใจดี')).rejects.toMatchObject({
      code: 'HAS_BLOCKERS',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('สำเร็จ → ปิดบัญชี + soft-delete ร้าน + ถอน push token + ออกจากร้านที่ถูกเชิญ', async () => {
    arrangeHealthyAccount()
    const result = await deleteAccount(USER_ID, 'สมชาย ใจดี')

    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // where ต้องมี deletedAt:null — optimistic guard กันกดซ้ำสองแท็บพร้อมกัน
        where: { id: USER_ID, deletedAt: null },
      }),
    )
    expect(tx.shop.updateMany).toHaveBeenCalled()
    expect(tx.pushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } })
    expect(tx.shopMember.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } })
    // purgeAt = 30 วันหลัง deletedAt
    const days = (result.purgeAt.getTime() - result.deletedAt.getTime()) / 86_400_000
    expect(days).toBe(30)
  })

  it('มีคนกดลบไปก่อนแล้วในอีกแท็บ (updateMany นับได้ 0) → ALREADY_DELETED', async () => {
    arrangeHealthyAccount()
    tx.user.updateMany.mockResolvedValue({ count: 0 })
    await expect(deleteAccount(USER_ID, 'สมชาย ใจดี')).rejects.toMatchObject({
      code: 'ALREADY_DELETED',
    })
  })

  it('ห้ามเรียก prisma.user.delete — schema มี Cascade 85 จุด', async () => {
    arrangeHealthyAccount()
    await deleteAccount(USER_ID, 'สมชาย ใจดี')
    expect((prisma.user as unknown as { delete?: unknown }).delete).toBeUndefined()
  })
})

// ─── purgeExpiredAccounts ─────────────────────────────────────────────────────
describe('purgeExpiredAccounts', () => {
  it('ล้าง PII และตั้ง purgedAt ให้แถวที่พ้น 30 วัน', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: USER_ID }] as any)

    const result = await purgeExpiredAccounts()

    expect(result).toEqual({ processed: 1, purged: 1, errors: 0 })
    expect(tx.authAccount.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } })

    const data = tx.user.update.mock.calls[0][0].data
    expect(data.displayName).toBe(PURGED_DISPLAY_NAME)
    expect(data.username).toBe(purgedUsername(USER_ID))
    // ทั้งสามเป็น @unique — ต้องคืนค่าว่างไม่งั้นเบอร์เดิมสมัครใหม่ไม่ได้ตลอดกาล
    expect(data.phone).toBeNull()
    expect(data.email).toBeNull()
    expect(data.avatar).toBeNull()
    expect(data.passwordHash).toBeNull()
    expect(data.purgedAt).toBeInstanceOf(Date)
  })

  it('เลือกเฉพาะแถวที่ถูกลบแล้วและยังไม่ถูกล้าง (ไม่ล้างซ้ำ)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    await purgeExpiredAccounts()
    const where = vi.mocked(prisma.user.findMany).mock.calls[0][0]?.where as {
      purgedAt: null
      deletedAt: { not: null; lte: Date }
    }
    expect(where.purgedAt).toBeNull()
    expect(where.deletedAt.lte).toBeInstanceOf(Date)
  })

  it('แถวเดียวล้ม ไม่ทำให้ทั้ง batch ล้ม', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)
    vi.mocked(prisma.$transaction)
      .mockRejectedValueOnce(new Error('db down'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(async (fn: any) => fn(tx))

    const result = await purgeExpiredAccounts()
    expect(result).toEqual({ processed: 2, purged: 1, errors: 1 })
  })

  it('username หลังล้างขึ้นต้น deleted_ และต่างกันตาม id', () => {
    expect(purgedUsername('abcdefgh-1111')).toBe('deleted_abcdefgh')
    expect(purgedUsername('zyxwvuts-2222')).not.toBe(purgedUsername('abcdefgh-1111'))
  })

  it('username ชนกัน (P2002) → retry ด้วย id เต็ม ไม่ปล่อยให้ค้างทุกคืน', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: USER_ID }] as any)
    vi.mocked(prisma.$transaction)
      // รอบแรกชน unique
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(async (fn: any) => fn(tx))

    const result = await purgeExpiredAccounts()

    expect(result).toEqual({ processed: 1, purged: 1, errors: 0 })
    expect(tx.user.update.mock.calls[0][0].data.username).toBe(`deleted_${USER_ID}`)
  })

  it('จำกัดจำนวนต่อรอบ + เรียงเก่าก่อน (กัน cron timeout และกันแถวไหนอดตลอดกาล)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
    await purgeExpiredAccounts()
    const args = vi.mocked(prisma.user.findMany).mock.calls[0][0] as {
      take: number
      orderBy: { deletedAt: string }
    }
    expect(args.take).toBeGreaterThan(0)
    expect(args.orderBy).toEqual({ deletedAt: 'asc' })
  })
})

// ─── perf: จำนวน query ที่ยิงจริง ─────────────────────────────────────────────
describe('checkAccountDeletable — จำนวน query', () => {
  it('ผู้ซื้อที่ไม่มีร้าน → นับเฉพาะของที่สั่งซื้อ ไม่ยิงนับพนักงาน', async () => {
    arrangeHealthyAccount({ shops: [] })
    await checkAccountDeletable(USER_ID)
    // เหลือ query เดียว = ของที่สั่งซื้อไว้ (ไม่มีร้านให้นับออเดอร์ฝั่งขาย)
    expect(prisma.order.count).toHaveBeenCalledTimes(1)
    expect(prisma.shopMember.count).not.toHaveBeenCalled()
  })

  it('ร้าน PERSONAL อย่างเดียว → ไม่ยิงนับพนักงาน (ไม่มี business ให้นับ)', async () => {
    arrangeHealthyAccount()
    await checkAccountDeletable(USER_ID)
    expect(prisma.shopMember.count).not.toHaveBeenCalled()
  })
})

// ─── ผู้ซื้อ: ของที่สั่งไว้ยังไม่ได้รับ ───────────────────────────────────────
describe('checkAccountDeletable — ฝั่งผู้ซื้อ', () => {
  it('มีของที่สั่งไว้ยังไม่ได้รับ → warning ไม่ใช่ blocker (ยังลบได้)', async () => {
    arrangeHealthyAccount({ shops: [] })
    // ไม่มีร้าน → order.count ถูกเรียกครั้งเดียวคือฝั่งผู้ซื้อ
    vi.mocked(prisma.order.count).mockResolvedValue(2)

    const result = await checkAccountDeletable(USER_ID)

    expect(result.canDelete).toBe(true)
    expect(result.blockers).toHaveLength(0)
    expect(result.warnings.map(w => w.code)).toContain('PENDING_PURCHASES')
    expect(result.warnings.find(w => w.code === 'PENDING_PURCHASES')?.message).toContain('2')
  })

  it('นับของที่สั่งซื้อด้วย buyerUserId ไม่ใช่ shopId', async () => {
    arrangeHealthyAccount({ shops: [] })
    await checkAccountDeletable(USER_ID)
    const where = vi.mocked(prisma.order.count).mock.calls[0][0]?.where as { buyerUserId: string }
    expect(where.buyerUserId).toBe(USER_ID)
  })
})

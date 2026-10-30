/**
 * staff-expense-notify.service.test.ts — 00086 FR-020 (unit · mock prisma + push)
 *
 * - ผู้รับ = เจ้าของเท่านั้น (Shop.userId ∪ ShopMember OWNER · ไม่ซ้ำ) และตัดผู้กระทำออก
 * - ถ้อยคำ 3 แบบ (บันทึก/แก้ไข/ลบ) · หมวดเป็นภาษาไทย · ยอดผ่าน formatBaht
 * - push ล้ม / DB ล้ม = ไม่ throw (ผู้เรียกยิงใน after())
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  createMany: vi.fn(),
  pushToUsers: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findUnique: m.shopFindUnique },
    user: { findUnique: m.userFindUnique },
    notification: { createMany: m.createMany },
  },
}))
vi.mock('@/services/app-push.service', () => ({ pushToUsers: m.pushToUsers }))

import { notifyOwnerOfStaffExpense, staffExpenseMessage } from '@/services/staff-expense-notify.service'

const base = { shopId: 'shop-1', actorUserId: 'staff-1', expenseId: 'exp-1', amount: 1250, category: 'UTILITIES' }

beforeEach(() => {
  vi.clearAllMocks()
  m.shopFindUnique.mockResolvedValue({
    userId: 'owner-1',
    shopName: 'ร้านล้างแอร์ สาขา 2',
    // owner-1 มีแถว OWNER ด้วย (ร้าน BUSINESS) — ต้องได้ใบเดียว · owner-2 = เจ้าของร่วม
    members: [{ userId: 'owner-1' }, { userId: 'owner-2' }],
  })
  m.userFindUnique.mockResolvedValue({ displayName: 'สมชาย' })
  m.createMany.mockResolvedValue({ count: 2 })
  m.pushToUsers.mockResolvedValue(undefined)
})

describe('staffExpenseMessage', () => {
  it.each([
    ['create', 'สมชาย บันทึกค่าใช้จ่าย ฿1,250 · ค่าน้ำ-ค่าไฟ'],
    ['update', 'สมชาย แก้ไขค่าใช้จ่าย ฿1,250 · ค่าน้ำ-ค่าไฟ'],
    ['delete', 'สมชาย ลบค่าใช้จ่าย ฿1,250 · ค่าน้ำ-ค่าไฟ'],
  ] as const)('%s → %s', (action, sentence) => {
    expect(staffExpenseMessage({ actorName: 'สมชาย', action, amount: 1250, category: 'UTILITIES' }).sentence).toBe(sentence)
  })

  it('สตางค์โผล่เมื่อมีจริง · หมวดไม่รู้จักแสดงรหัสดิบ', () => {
    expect(staffExpenseMessage({ actorName: 'ก', action: 'create', amount: 99.5, category: 'X' }).detail).toBe('฿99.50 · X')
  })
})

describe('notifyOwnerOfStaffExpense', () => {
  it('ผู้รับ = เจ้าของเท่านั้น ไม่ซ้ำ · แถวผูก shopId/kind/refId · ข้อความแยก headline/detail', async () => {
    await notifyOwnerOfStaffExpense({ ...base, action: 'create' })

    // ค้นเฉพาะ member role OWNER — ไม่ใช่สมาชิกทุกคน (MANAGER/CHAT ไม่ได้รับ)
    expect(m.shopFindUnique.mock.calls[0][0].select.members.where).toEqual({ role: 'OWNER' })
    const rows = m.createMany.mock.calls[0][0].data
    expect(rows.map((r: { userId: string }) => r.userId).sort()).toEqual(['owner-1', 'owner-2'])
    expect(rows[0]).toEqual({
      userId: 'owner-1',
      shopId: 'shop-1',
      kind: 'staff_expense',
      title: 'สมชาย บันทึกค่าใช้จ่าย',
      body: '฿1,250 · ค่าน้ำ-ค่าไฟ',
      refId: 'exp-1',
    })
    const [audience, title, body, data] = m.pushToUsers.mock.calls[0]
    expect([...audience].sort()).toEqual(['owner-1', 'owner-2'])
    expect(title).toBe('ร้านล้างแอร์ สาขา 2')
    expect(body).toBe('สมชาย บันทึกค่าใช้จ่าย ฿1,250 · ค่าน้ำ-ค่าไฟ')
    expect(data).toMatchObject({ url: '/expenses', shopId: 'shop-1' })
  })

  it('ตัดผู้กระทำออก — เจ้าของที่ทำเองไม่ได้แจ้งเตือนตัวเอง', async () => {
    await notifyOwnerOfStaffExpense({ ...base, actorUserId: 'owner-2', action: 'update' })
    const rows = m.createMany.mock.calls[0][0].data
    expect(rows.map((r: { userId: string }) => r.userId)).toEqual(['owner-1'])
    expect(m.pushToUsers.mock.calls[0][0]).toEqual(['owner-1'])
  })

  it('ผู้รับเหลือศูนย์ → ไม่เขียน ไม่ push', async () => {
    m.shopFindUnique.mockResolvedValue({ userId: 'owner-1', shopName: 'x', members: [] })
    await notifyOwnerOfStaffExpense({ ...base, actorUserId: 'owner-1', action: 'delete' })
    expect(m.createMany).not.toHaveBeenCalled()
    expect(m.pushToUsers).not.toHaveBeenCalled()
  })

  it('ถ้อยคำลบ/แก้ไขไปถึงแถวและ push', async () => {
    await notifyOwnerOfStaffExpense({ ...base, action: 'delete' })
    expect(m.createMany.mock.calls[0][0].data[0].title).toBe('สมชาย ลบค่าใช้จ่าย')
    await notifyOwnerOfStaffExpense({ ...base, action: 'update' })
    expect(m.pushToUsers.mock.calls[1][2]).toBe('สมชาย แก้ไขค่าใช้จ่าย ฿1,250 · ค่าน้ำ-ค่าไฟ')
  })

  it('push ล้ม → ไม่ throw และแถวในกระดิ่งเขียนไปแล้ว', async () => {
    m.pushToUsers.mockRejectedValue(new Error('expo down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyOwnerOfStaffExpense({ ...base, action: 'create' })).resolves.toBeUndefined()
    expect(m.createMany).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it('DB ล้ม → ไม่ throw ไม่ push', async () => {
    m.createMany.mockRejectedValue(new Error('db down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyOwnerOfStaffExpense({ ...base, action: 'create' })).resolves.toBeUndefined()
    expect(m.pushToUsers).not.toHaveBeenCalled()
    err.mockRestore()
  })
})

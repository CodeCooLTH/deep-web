import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 00071 T10 — ด่านของ POST /api/business/shops/[shopId]/restore อยู่ใน service (ร้านที่ถูก soft-delete ด่านกลางมองไม่เห็น)
 * ทะเบียนจัดเป็น SELF พร้อมเหตุผลว่า "บังคับ T4 เทียบเท่าใน restoreBusinessShop" — เทสนี้คือหลักฐานของประโยคนั้น:
 * เฉพาะ shop.userId === ผู้ใช้ (เจ้าของหลัก) กู้ได้ · เจ้าของร่วม/ผู้ดูแล/คนนอก = NOT_OWNER และไม่เขียนอะไร
 * mock prisma ทั้งก้อน — ไม่ต่อฐาน (Hard Rule 13)
 */
const tx = vi.hoisted(() => ({
  shop: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
  businessPackageSubscription: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }))

import { restoreBusinessShop } from '@/services/business-shop.service'

const shop = (over: object = {}) => ({ id: 's1', userId: 'owner', kind: 'BUSINESS', deletedAt: new Date(), purgedAt: null, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  tx.shop.findUnique.mockResolvedValue(shop())
  tx.businessPackageSubscription.findUnique.mockResolvedValue(null)
  tx.shop.count.mockResolvedValue(0)
  tx.shop.update.mockResolvedValue({ id: 's1' })
})

describe('restoreBusinessShop — T4 เทียบเท่าใน service', () => {
  it('เจ้าของหลัก (shop.userId) กู้ได้', async () => {
    await restoreBusinessShop('owner', 's1')
    expect(tx.shop.update).toHaveBeenCalledOnce()
  })

  it.each(['co-owner', 'admin-member', 'stranger'])('%s (ไม่ใช่ shop.userId) → NOT_OWNER และไม่เขียนอะไร', async (uid) => {
    await expect(restoreBusinessShop(uid, 's1')).rejects.toThrow('NOT_OWNER')
    expect(tx.shop.update).not.toHaveBeenCalled()
  })

  it('ร้านไม่มีจริง / ไม่ใช่ BUSINESS → NOT_OWNER (ไม่ยืนยันว่ามีอยู่)', async () => {
    tx.shop.findUnique.mockResolvedValue(null)
    await expect(restoreBusinessShop('owner', 'nope')).rejects.toThrow('NOT_OWNER')
    tx.shop.findUnique.mockResolvedValue(shop({ kind: 'PERSONAL' }))
    await expect(restoreBusinessShop('owner', 's1')).rejects.toThrow('NOT_OWNER')
    expect(tx.shop.update).not.toHaveBeenCalled()
  })

  it('ยังไม่ถูกลบ → NOT_DELETED · purge แล้ว → RESTORE_WINDOW_EXPIRED', async () => {
    tx.shop.findUnique.mockResolvedValue(shop({ deletedAt: null }))
    await expect(restoreBusinessShop('owner', 's1')).rejects.toThrow('NOT_DELETED')
    tx.shop.findUnique.mockResolvedValue(shop({ purgedAt: new Date() }))
    await expect(restoreBusinessShop('owner', 's1')).rejects.toThrow('RESTORE_WINDOW_EXPIRED')
  })
})

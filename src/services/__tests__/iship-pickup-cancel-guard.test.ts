/**
 * 00087 BR-5 — iShip ยกเลิกคำขอเรียกรถได้เฉพาะ REQUESTED/ACCEPTED (เดิมกันแค่ CANCELLED
 * คำขอที่เข้ารับเสร็จ/ล้มเหลวจึงถูกยิงยกเลิกไป iShip และถูกเขียนทับเป็น CANCELLED)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shopShippingAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
    shipmentPickup: { findFirst: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: () => 'token-plain', encryptToken: (t: string) => t }))
vi.mock('@/lib/iship/client', () => ({ cancelPickup: vi.fn(async () => ({})) }))

import { prisma } from '@/lib/prisma'
import * as iship from '@/lib/iship/client'
import { cancelPickup } from '@/services/iship.service'

const p = prisma as unknown as {
  shopShippingAccount: { findUnique: ReturnType<typeof vi.fn> }
  shipmentPickup: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.shopShippingAccount.findUnique.mockResolvedValue({ status: 'CONNECTED', accessTokenEnc: 'x' })
  p.shipmentPickup.update.mockImplementation(async ({ data }: { data: object }) => ({ id: 'pk', ...data }))
})

describe('iShip cancelPickup guard', () => {
  for (const status of ['CLOSED', 'FAILED', 'CANCELLED']) {
    it(`${status} → INVALID_STATE ไม่ยิง iShip ไม่เขียนแถว`, async () => {
      p.shipmentPickup.findFirst.mockResolvedValue({ id: 'pk', ticketPickupId: 'T1', status })
      await expect(cancelPickup('shop', 'pk')).rejects.toMatchObject({ code: 'INVALID_STATE' })
      expect(iship.cancelPickup).not.toHaveBeenCalled()
      expect(p.shipmentPickup.update).not.toHaveBeenCalled()
    })
  }

  it('ACCEPTED → ยิง iShip แล้วเป็น CANCELLED', async () => {
    p.shipmentPickup.findFirst.mockResolvedValue({ id: 'pk', ticketPickupId: 'T1', status: 'ACCEPTED' })
    const r = await cancelPickup('shop', 'pk')
    expect(iship.cancelPickup).toHaveBeenCalledWith('token-plain', 'T1')
    expect(r).toMatchObject({ status: 'CANCELLED' })
  })
})

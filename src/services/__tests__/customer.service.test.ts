import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { findOrCreateCustomer } from '@/services/customer.service'

describe('findOrCreateCustomer', () => {
  it('เจอ customer เดิม → คืน id เดิม (dedup/cross-shop) ไม่ create', async () => {
    const tx: any = { customer: { findUnique: vi.fn().mockResolvedValue({ id: 'exist' }), create: vi.fn() } }
    expect(await findOrCreateCustomer(tx, '0812345678')).toBe('exist')
    expect(tx.customer.create).not.toHaveBeenCalled()
  })
  it('ไม่เจอ → สร้างใหม่', async () => {
    const tx: any = { customer: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'new' }) } }
    expect(await findOrCreateCustomer(tx, '0812345678')).toBe('new')
  })
  it('P2002 race → re-find คืน id เดิม', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' })
    const tx: any = {
      customer: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'raced' }),
        create: vi.fn().mockRejectedValue(err),
      },
    }
    expect(await findOrCreateCustomer(tx, '0812345678')).toBe('raced')
  })
})

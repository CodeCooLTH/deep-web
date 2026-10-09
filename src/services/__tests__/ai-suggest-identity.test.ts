import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany } } }))

import { buildSuggestIdentity } from '../ai-suggest-identity'

beforeEach(() => {
  vi.clearAllMocks()
  findMany.mockResolvedValue([{ displayName: 'แอดมินบี' }, { displayName: null }])
})

describe('buildSuggestIdentity', () => {
  it('ประกอบชื่อลูกค้า/แอดมิน/literal และกรองค่าว่าง', async () => {
    const r = await buildSuggestIdentity({
      crm: { alias: 'ลูกค้าเอ', realName: ' ', phones: ['0891112222'], address: '99/9' },
      rows: [
        { senderRole: 'SHOP', senderUserId: 'u1' },
        { senderRole: 'SHOP', senderUserId: 'u1' },
        { senderRole: 'BUYER', senderUserId: 'u2' },
      ],
      sessionName: 'แอดมินเอ',
    })
    expect(r).toEqual({
      knownCustomerNames: ['ลูกค้าเอ'],
      adminNames: ['แอดมินบี', 'แอดมินเอ'],
      knownLiterals: ['0891112222', '99/9'],
    })
    // dedupe + นับเฉพาะ SHOP
    expect(findMany).toHaveBeenCalledWith({ where: { id: { in: ['u1'] } }, select: { displayName: true } })
  })

  it('ไม่มีผู้ส่งฝั่งร้าน/ไม่มี crm → ไม่ query และคืนลิสต์ว่าง', async () => {
    const r = await buildSuggestIdentity({ crm: null, rows: [{ senderRole: 'BUYER', senderUserId: null }], sessionName: null })
    expect(findMany).not.toHaveBeenCalled()
    expect(r).toEqual({ knownCustomerNames: [], adminNames: [], knownLiterals: [] })
  })
})

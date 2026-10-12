/**
 * feature 00073 (BRD FR-009) — บัญชีใหม่จาก OTP ได้ชื่อที่ร้านบริการกรอกในงาน · ไม่ทับชื่อที่ผู้ใช้ตั้ง · ร้านอื่นไม่ใช้
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteTestData, prisma } from '../setup'
import { nameAccountFromServiceJob } from '@/services/account-name.service'

let userIds: string[] = []
let shopIds: string[] = []
const tag = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

beforeEach(() => {
  userIds = []
  shopIds = []
})
afterEach(async () => {
  await deleteTestData({ userIds, shopIds })
})

async function setup(vertical: 'SERVICE_QUEUE' | 'ONLINE_SALES', buyerDisplayName: string, buyerName: string | null) {
  const owner = await prisma.user.create({ data: { displayName: 'เจ้าของ', username: `an_o_${tag()}`, isShop: true } })
  const buyer = await prisma.user.create({ data: { displayName: buyerDisplayName, username: `an_b_${tag()}` } })
  userIds.push(owner.id, buyer.id)
  const shop = await prisma.shop.create({ data: { userId: owner.id, shopName: 'ร้าน', businessType: 'INDIVIDUAL', vertical } })
  shopIds.push(shop.id)
  await prisma.order.create({ data: { shopId: shop.id, totalAmount: 100, buyerUserId: buyer.id, buyerName } })
  return buyer
}

describe('nameAccountFromServiceJob', () => {
  it('บัญชีชื่อระบบ + งานร้านบริการมีชื่อ → ใช้ชื่อจากงาน', async () => {
    const b = await setup('SERVICE_QUEUE', 'User_1234', '  สมหญิง   ใจดี ')
    expect(await nameAccountFromServiceJob(b.id)).toBe('สมหญิง ใจดี')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).displayName).toBe('สมหญิง ใจดี')
  })
  it('ชื่อที่ผู้ใช้ตั้งเองไม่ถูกทับ', async () => {
    const b = await setup('SERVICE_QUEUE', 'นิดหน่อย', 'สมหญิง')
    expect(await nameAccountFromServiceJob(b.id)).toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).displayName).toBe('นิดหน่อย')
  })
  it('[blocker] ร้านขายของไม่ใช้ (แก้เฉพาะร้านบริการ)', async () => {
    const b = await setup('ONLINE_SALES', 'User_1234', 'สมหญิง')
    expect(await nameAccountFromServiceJob(b.id)).toBeNull()
  })
  it('งานไม่มีชื่อลูกค้า → คงชื่อเดิม', async () => {
    const b = await setup('SERVICE_QUEUE', 'User_1234', null)
    expect(await nameAccountFromServiceJob(b.id)).toBeNull()
  })
})

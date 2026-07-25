/**
 * Unit tests — src/lib/account-merge-ticket.ts (feature 00015 S-5 เชื่อมบัญชี)
 *
 * ticket ตัวนี้เป็นตัวส่งต่อผลการพิสูจน์ OTP ข้ามคำขอ ถ้าปลอมได้ = ยึดบัญชีคนอื่นได้
 * เทสจึงเน้นทุกทางที่ควรถูกปฏิเสธ ไม่ใช่แค่ happy path
 *
 * pattern เดียวกับ link-intent.test.ts: pure Node crypto → ไม่ต้อง dev server / DB
 */
import { describe, it, expect, beforeAll } from 'vitest'

const TEST_SECRET = 'test-secret-for-account-merge-ticket-unit-tests!!'

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = TEST_SECRET
})

async function getModule() {
  return await import('./account-merge-ticket')
}

const base = { fromUserId: 'user-new-fb', toUserId: 'user-existing', orderId: 'order-1' }

describe('signAccountMergeTicket + verifyAccountMergeTicket', () => {
  it('sign แล้ว verify คืนค่าเดิมครบทุก field', async () => {
    const { signAccountMergeTicket, verifyAccountMergeTicket } = await getModule()
    expect(verifyAccountMergeTicket(signAccountMergeTicket(base))).toEqual(base)
  })

  it('แก้ payload แล้วลายเซ็นไม่ตรง → null (ยึดบัญชีคนอื่นด้วยการสลับ toUserId ไม่ได้)', async () => {
    const { signAccountMergeTicket, verifyAccountMergeTicket } = await getModule()
    const token = signAccountMergeTicket(base)
    const [, sig] = token.split('.')

    const forged = Buffer.from(
      JSON.stringify({ ...base, toUserId: 'victim-user', exp: Date.now() + 60_000 }),
    ).toString('base64url')

    expect(verifyAccountMergeTicket(`${forged}.${sig}`)).toBeNull()
  })

  it('แก้ signature → null', async () => {
    const { signAccountMergeTicket, verifyAccountMergeTicket } = await getModule()
    const [payload] = signAccountMergeTicket(base).split('.')
    expect(verifyAccountMergeTicket(`${payload}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)).toBeNull()
  })

  it('หมดอายุแล้ว → null', async () => {
    const { verifyAccountMergeTicket } = await getModule()
    const crypto = await import('crypto')
    const payload = Buffer.from(
      JSON.stringify({ ...base, exp: Date.now() - 1 }),
    ).toString('base64url')
    // เซ็นด้วย secret+domain ที่ถูกต้อง — ตกเพราะ exp ล้วน ๆ ไม่ใช่เพราะลายเซ็น
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(`acct-merge.v1.${payload}`)
      .digest('base64url')
    expect(verifyAccountMergeTicket(`${payload}.${sig}`)).toBeNull()
  })

  it('fromUserId เท่ากับ toUserId → null (ไม่มีอะไรให้ย้าย)', async () => {
    const { signAccountMergeTicket, verifyAccountMergeTicket } = await getModule()
    const token = signAccountMergeTicket({ ...base, toUserId: base.fromUserId })
    expect(verifyAccountMergeTicket(token)).toBeNull()
  })

  it('token จาก signLinkIntent ใช้กับ verifyAccountMergeTicket ไม่ได้ (domain แยกกัน)', async () => {
    const { verifyAccountMergeTicket } = await getModule()
    const { signLinkIntent } = await import('./link-intent')
    expect(verifyAccountMergeTicket(signLinkIntent({ userId: 'u1', provider: 'FACEBOOK' }))).toBeNull()
  })

  it('input ขยะ → null ไม่ throw', async () => {
    const { verifyAccountMergeTicket } = await getModule()
    for (const bad of ['', 'no-dot', '.', 'a.b', 'x'.repeat(500)]) {
      expect(verifyAccountMergeTicket(bad)).toBeNull()
    }
  })
})

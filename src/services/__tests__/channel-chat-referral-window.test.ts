import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// referral (คลิกโฆษณา / ปุ่ม CTA / ลิงก์ m.me ที่มี ref) เปิดหน้าต่าง 24 ชม. ตามนโยบาย Meta
// เท่ากับการส่งข้อความ — user report 2026-08-02 (ดู comment ที่ ingestAdReferral)
//
// vi.hoisted: เหตุผลเดียวกับ channel-chat-ingest.test.ts (vi.mock ถูก hoist ก่อน const ปกติ)
const db = vi.hoisted(() => ({
  externalContact: { findUnique: vi.fn() },
  conversation: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  conversationAdReferral: { create: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn() }))
vi.mock('@/lib/facebook/graph', () => ({
  fetchAdPostContent: vi.fn().mockResolvedValue({ message: null, fullPicture: null, permalink: null }),
}))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'c'.repeat(64)
})

import { ingestAdReferral } from '@/services/channel-chat.service'
import { getChannelByExternalId } from '@/services/shop-channel.service'

const CLICK_MS = 1_750_000_000_000
const base = {
  provider: 'MESSENGER',
  pageExternalId: 'PAGE1',
  contactExternalId: 'PSID_1',
  referral: { source: 'ADS', ad_id: 'ad_9' } as never,
}

/** คืน argument ที่ถูกส่งเข้า $transaction (array ของ prisma operation) */
function txOps() {
  return db.$transaction.mock.calls[0]?.[0] as unknown[]
}

describe('ingestAdReferral — หน้าต่าง 24 ชม.', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.$transaction.mockResolvedValue([])
    ;(getChannelByExternalId as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ch1',
      shopId: 'shop1',
      provider: 'MESSENGER',
      accessToken: 'tok',
    })
    db.externalContact.findUnique.mockResolvedValue({ id: 'contact1' })
    db.conversation.findUnique.mockResolvedValue({ id: 'conv1' })
    db.conversation.updateMany.mockReturnValue({ __op: 'updateMany' })
    db.conversation.update.mockReturnValue({ __op: 'update' })
    db.conversationAdReferral.create.mockReturnValue({ __op: 'create' })
  })

  it('ลูกค้าคลิกโฆษณา → เขียน lastInboundAt เป็นเวลาที่คลิก', async () => {
    await ingestAdReferral({ ...base, customerActionAt: CLICK_MS })

    expect(db.conversation.updateMany).toHaveBeenCalledTimes(1)
    const arg = db.conversation.updateMany.mock.calls[0][0]
    expect(arg.data).toEqual({ lastInboundAt: new Date(CLICK_MS) })
    expect(arg.where.id).toBe('conv1')
    // เขียนทั้ง 3 อย่างในทรานแซกชันเดียว — ประวัติ referral / ค่าล่าสุด / หน้าต่าง
    expect(txOps()).toHaveLength(3)
  })

  it('เขียนเฉพาะเมื่อใหม่กว่าของเดิม — กัน event สลับลำดับดันหน้าต่างถอยหลัง', async () => {
    await ingestAdReferral({ ...base, customerActionAt: CLICK_MS })

    const where = db.conversation.updateMany.mock.calls[0][0].where
    expect(where.OR).toEqual([{ lastInboundAt: null }, { lastInboundAt: { lt: new Date(CLICK_MS) } }])
  })

  it('ไม่ใช่ action ของลูกค้า (echo ของเพจ) → ห้ามแตะหน้าต่าง', async () => {
    await ingestAdReferral({ ...base }) // ไม่ส่ง customerActionAt

    expect(db.conversation.updateMany).not.toHaveBeenCalled()
    // แต่ข้อมูล referral ยังต้องถูกบันทึกตามเดิม (รายงาน "ads ตัวไหนพาลูกค้ามา" ต้องไม่หาย)
    expect(db.conversationAdReferral.create).toHaveBeenCalledTimes(1)
    expect(db.conversation.update).toHaveBeenCalledTimes(1)
    expect(txOps()).toHaveLength(2)
  })

  it('ไม่มีเธรด/ผู้ติดต่อ → เงียบ ไม่เขียนอะไรเลย (ห้าม throw ตามสัญญาของฟังก์ชัน)', async () => {
    db.conversation.findUnique.mockResolvedValue(null)

    await expect(ingestAdReferral({ ...base, customerActionAt: CLICK_MS })).resolves.toBeUndefined()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })
})

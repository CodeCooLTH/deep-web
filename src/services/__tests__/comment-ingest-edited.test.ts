import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * feature 00038 หนี้ #3 (minor) — `ingestFeedComment` เดิมคืน id เสมอไม่ว่า verb จะเป็นอะไร (ตราบใด
 * ที่ไม่ใช่ remove) → webhook เรียก `processCommentAutoReply` ทุกครั้งที่ลูกค้าแก้คอมเมนต์ที่เคยตอบ
 * ไปแล้ว ปลอดภัยเพราะด่าน ALREADY_HANDLED กันไว้อีกชั้น แต่เสีย DB round-trip เปล่า ๆ ทุกครั้ง
 *
 * เทสนี้พิสูจน์ 2 อย่างพร้อมกัน: (1) verb=edited/edit ยังบันทึก/อัปเดตคอมเนต์ตามปกติ (upsert ถูกเรียก
 * จริง ไม่ใช่ early-return ก่อนบันทึก) (2) แต่คืน null ไม่ trigger auto-reply — ต่างจาก verb=add ที่คืน
 * id จริงเพื่อให้ caller (webhook route) คิวไปตอบอัตโนมัติ
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pageComment: { updateMany: vi.fn(), upsert: vi.fn() },
    facebookPost: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/services/shop-channel.service', () => ({
  getChannelByExternalId: vi.fn(),
}))
vi.mock('@/lib/facebook/graph', () => ({
  createCommentReply: vi.fn(),
  fetchPagePosts: vi.fn(),
  fetchPostComments: vi.fn(),
  fetchPostMeta: vi.fn(),
}))
vi.mock('@/lib/token-crypto', () => ({ decryptToken: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getFileUrl: vi.fn() }))
vi.mock('@/lib/shop-context', () => ({
  assertShopsAccessible: vi.fn().mockResolvedValue(undefined),
  canAccessShop: vi.fn().mockResolvedValue(true),
}))

import { prisma } from '@/lib/prisma'
import { getChannelByExternalId } from '@/services/shop-channel.service'
import { ingestFeedComment } from '@/services/page-comment.service'
import type { FeedChange } from '@/lib/facebook/webhook-types'

const channel = { id: 'ch-1', shopId: 'shop-1', provider: 'MESSENGER', accessToken: 'enc-token' }
const existingPost = { id: 'post-1', externalPostId: '123' }

function feedChange(overrides: Partial<NonNullable<FeedChange['value']>> = {}): FeedChange {
  return {
    field: 'feed',
    value: {
      item: 'comment',
      verb: 'add',
      comment_id: '123_456',
      post_id: '123',
      created_time: 1_700_000_000,
      from: { id: 'psid-1', name: 'ลูกค้า' },
      message: 'สวัสดีครับ สนใจสินค้านี้',
      ...overrides,
    },
  }
}

describe('ingestFeedComment — verb=edited ไม่ trigger auto-reply ซ้ำ (หนี้ #3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getChannelByExternalId).mockResolvedValue(channel)
    vi.mocked(prisma.facebookPost.findUnique).mockResolvedValue(existingPost as never)
    vi.mocked(prisma.facebookPost.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.pageComment.upsert).mockResolvedValue({ id: 'cmt-1' } as never)
  })

  it('verb=add (คอมเมนต์ใหม่) คืน id จริง — caller ต้องเอาไป trigger auto-reply', async () => {
    const id = await ingestFeedComment({ pageExternalId: 'page-1', change: feedChange({ verb: 'add' }) })
    expect(id).toBe('cmt-1')
    expect(prisma.pageComment.upsert).toHaveBeenCalledTimes(1)
  })

  it('verb=edited — ยัง upsert (บันทึก/อัปเดตข้อความ) แต่คืน null (ไม่ trigger auto-reply ซ้ำ)', async () => {
    const id = await ingestFeedComment({ pageExternalId: 'page-1', change: feedChange({ verb: 'edited' }) })
    expect(id).toBeNull()
    expect(prisma.pageComment.upsert).toHaveBeenCalledTimes(1)
  })

  it('verb=edit (รูปสั้นที่ Meta ใช้บางเวอร์ชัน) — คืน null เช่นเดียวกับ edited', async () => {
    const id = await ingestFeedComment({ pageExternalId: 'page-1', change: feedChange({ verb: 'edit' }) })
    expect(id).toBeNull()
    expect(prisma.pageComment.upsert).toHaveBeenCalledTimes(1)
  })

  it('verb=remove — ยังคืน null เหมือนเดิม (ทำเครื่องหมายลบ ไม่ upsert)', async () => {
    const id = await ingestFeedComment({ pageExternalId: 'page-1', change: feedChange({ verb: 'remove' }) })
    expect(id).toBeNull()
    expect(prisma.pageComment.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.pageComment.upsert).not.toHaveBeenCalled()
  })
})

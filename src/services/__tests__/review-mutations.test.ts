/**
 * [blocker] แก้/ลบรีวิว + คำตอบร้าน — feature 00041 (TFR-007/008/009)
 *
 * เคสที่สำคัญที่สุดของไฟล์นี้คือ **ลำดับ guard**: ownership ต้องถูกเช็คก่อน expiry เสมอ
 * ถ้าสลับ คนที่ไม่ใช่เจ้าของรีวิวจะรู้จาก status code ว่ารีวิวใบนั้นหมดเวลาแก้ไขหรือยัง
 * ซึ่งเป็นข้อมูลที่เขาไม่ควรได้ (oracle leak) — เป็นความผิดที่ tsc/build/grep มองไม่เห็นเลย
 * เพราะโค้ดถูกต้องทุกบรรทัด แค่เรียงผิดลำดับ
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const canAccessShop = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findUnique: (...a: unknown[]) => findUnique(...a) },
    review: { update: (...a: unknown[]) => update(...a) },
  },
}))
vi.mock('@/lib/shop-context', () => ({
  canAccessShop: (...a: unknown[]) => canAccessShop(...a),
}))
vi.mock('@/services/badge.service', () => ({
  evaluateBadges: vi.fn(),
  evaluateSellerBadgesForShop: vi.fn(),
}))

import {
  updateReview,
  deleteReview,
  replyToReview,
  deleteReviewReply,
  ReviewNotFoundError,
  ReviewForbiddenError,
  ReviewEditWindowExpiredError,
  ReviewReplyForbiddenError,
  ReviewReplyNotFoundError,
  REVIEW_EDIT_WINDOW_MS,
} from '@/services/review.service'

const TOKEN = 'tok_1'
const OWNER = 'usr_owner'
const OTHER = 'usr_other'

function review(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rev_1',
    reviewerUserId: OWNER,
    createdAt: new Date(),
    deletedAt: null,
    shopReplyComment: null,
    ...over,
  }
}
function order(rev: unknown) {
  return { id: 'ord_1', shopId: 'shop_1', review: rev }
}

beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue({})
  canAccessShop.mockResolvedValue(true)
})

describe('updateReview / deleteReview', () => {
  it('เจ้าของแก้ได้ภายในเวลา', async () => {
    findUnique.mockResolvedValue(order(review()))
    await updateReview(TOKEN, OWNER, { rating: 4 })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0].data).toMatchObject({ rating: 4 })
  })

  it('ส่งเฉพาะฟิลด์ที่จะแก้ — ฟิลด์ที่ไม่ส่งต้องไม่ถูกเขียนทับด้วย undefined', async () => {
    findUnique.mockResolvedValue(order(review()))
    await updateReview(TOKEN, OWNER, { comment: 'แก้ข้อความ' })
    const data = update.mock.calls[0][0].data
    expect(data).toMatchObject({ comment: 'แก้ข้อความ' })
    expect('rating' in data).toBe(false)
    expect('images' in data).toBe(false)
  })

  it('ไม่มีรีวิว → ReviewNotFoundError', async () => {
    findUnique.mockResolvedValue(order(null))
    await expect(updateReview(TOKEN, OWNER, { rating: 4 })).rejects.toBeInstanceOf(ReviewNotFoundError)
  })

  it('รีวิวถูก soft-delete ไปแล้ว → ReviewNotFoundError (ไม่ใช่แก้ของที่ลบแล้วได้)', async () => {
    findUnique.mockResolvedValue(order(review({ deletedAt: new Date() })))
    await expect(updateReview(TOKEN, OWNER, { rating: 4 })).rejects.toBeInstanceOf(ReviewNotFoundError)
  })

  it('หมดเวลา → ReviewEditWindowExpiredError', async () => {
    findUnique.mockResolvedValue(
      order(review({ createdAt: new Date(Date.now() - REVIEW_EDIT_WINDOW_MS - 1000) })),
    )
    await expect(updateReview(TOKEN, OWNER, { rating: 4 })).rejects.toBeInstanceOf(
      ReviewEditWindowExpiredError,
    )
  })

  // 🛑 เคสหลัก — ต้องได้ Forbidden ไม่ใช่ Expired
  it('คนที่ไม่ใช่เจ้าของ + รีวิวหมดเวลาแล้ว → Forbidden (ห้ามบอกว่าหมดเวลา = oracle leak)', async () => {
    findUnique.mockResolvedValue(
      order(review({ createdAt: new Date(Date.now() - REVIEW_EDIT_WINDOW_MS - 1000) })),
    )
    await expect(updateReview(TOKEN, OTHER, { rating: 4 })).rejects.toBeInstanceOf(ReviewForbiddenError)
  })

  it('คนที่ไม่ใช่เจ้าของ + รีวิวยังไม่หมดเวลา → Forbidden เหมือนกันเป๊ะ', async () => {
    findUnique.mockResolvedValue(order(review()))
    await expect(updateReview(TOKEN, OTHER, { rating: 4 })).rejects.toBeInstanceOf(ReviewForbiddenError)
  })

  it('ลบ = soft delete + ล้างรูปและคำตอบร้านพร้อมกัน (BR-BOE-23)', async () => {
    findUnique.mockResolvedValue(order(review({ shopReplyComment: 'ขอบคุณครับ' })))
    await deleteReview(TOKEN, OWNER)

    const data = update.mock.calls[0][0].data
    expect(data.deletedAt).toBeInstanceOf(Date)
    expect(data.images).toEqual([])
    expect(data.shopReplyComment).toBeNull()
    expect(data.shopRepliedAt).toBeNull()
    expect(data.shopRepliedByUserId).toBeNull()
  })
})

describe('replyToReview / deleteReviewReply', () => {
  it('คนที่เข้าถึงร้านได้ → ตอบกลับสำเร็จ', async () => {
    findUnique.mockResolvedValue(order(review()))
    await replyToReview(TOKEN, 'usr_shop', 'ขอบคุณครับ')

    expect(canAccessShop).toHaveBeenCalledWith('shop_1', 'usr_shop')
    expect(update.mock.calls[0][0].data).toMatchObject({
      shopReplyComment: 'ขอบคุณครับ',
      shopRepliedByUserId: 'usr_shop',
    })
  })

  it('ไม่มีสิทธิ์ในร้าน → ReviewReplyForbiddenError', async () => {
    findUnique.mockResolvedValue(order(review()))
    canAccessShop.mockResolvedValue(false)
    await expect(replyToReview(TOKEN, OTHER, 'x')).rejects.toBeInstanceOf(ReviewReplyForbiddenError)
    expect(update).not.toHaveBeenCalled()
  })

  it('ตอบซ้ำ = เขียนทับคำตอบเดิม ไม่สร้างใหม่', async () => {
    findUnique.mockResolvedValue(order(review({ shopReplyComment: 'คำตอบแรก' })))
    await replyToReview(TOKEN, 'usr_shop', 'คำตอบที่สอง')
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0].data.shopReplyComment).toBe('คำตอบที่สอง')
  })

  it('ร้านตอบกลับได้ไม่จำกัดเวลา (ต่างจากผู้ซื้อ) — รีวิวเก่า 30 วันก็ยังตอบได้', async () => {
    findUnique.mockResolvedValue(
      order(review({ createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })),
    )
    await expect(replyToReview(TOKEN, 'usr_shop', 'ตอบช้าหน่อย')).resolves.toBeDefined()
  })

  it('ลบคำตอบที่ไม่มีอยู่ → ReviewReplyNotFoundError', async () => {
    findUnique.mockResolvedValue(order(review({ shopReplyComment: null })))
    await expect(deleteReviewReply(TOKEN, 'usr_shop')).rejects.toBeInstanceOf(ReviewReplyNotFoundError)
  })

  it('ลบคำตอบสำเร็จ → ไม่แตะรีวิวต้นทาง', async () => {
    findUnique.mockResolvedValue(order(review({ shopReplyComment: 'ขอบคุณครับ' })))
    await deleteReviewReply(TOKEN, 'usr_shop')

    const data = update.mock.calls[0][0].data
    expect(data).toEqual({ shopReplyComment: null, shopRepliedAt: null, shopRepliedByUserId: null })
    expect('deletedAt' in data).toBe(false)
    expect('rating' in data).toBe(false)
  })
})

/**
 * page-comment-refresh-post-stats.test.ts — feature 00051 (S-3, TD-06) TC-SHOPID-02
 *
 * refreshPostStats() รับแค่ postId (public signature เดิมคงไว้ — TD-06) แต่ภายในต้อง derive
 * shopId ผ่าน post.channel.shopId ให้ dedup logic (mirrorPostThumbnail → mirrorRemoteImage)
 * ก่อนหน้านี้ shopId ไม่เคยอยู่ใน scope ของฟังก์ชันนี้เลย (gap ที่ยืนยันจากโค้ดจริงตาม TestCase.md
 * §2.8) — เทสนี้จับว่า shopId ที่ไหลเข้า mirrorRemoteImage ตรงกับ post.channel.shopId จริง
 *
 * mock เฉพาะจุดที่ทำ network/DB จริง (prisma, fetchPostMeta, mirrorRemoteImage) — ไม่ยิงเครือข่าย
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const db = vi.hoisted(() => ({
  facebookPost: { findUnique: vi.fn(), update: vi.fn() },
  shopChannel: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/token-crypto', () => ({
  decryptToken: vi.fn((s: string) => s), // identity — ไม่ต้องพึ่ง CHANNEL_TOKEN_KEY จริงในเทสนี้
  encryptToken: vi.fn((s: string) => s),
}))
vi.mock('@/lib/facebook/graph', () => ({
  fetchPostMeta: vi.fn(),
  createCommentReply: vi.fn(),
  fetchPagePosts: vi.fn(),
  fetchPostComments: vi.fn(),
}))
vi.mock('@/services/shop-channel.service', () => ({ getChannelByExternalId: vi.fn() }))
vi.mock('@/services/channel-chat.service', () => ({ mirrorRemoteImage: vi.fn().mockResolvedValue(null) }))

beforeAll(() => {
  process.env.CHANNEL_TOKEN_KEY = 'd'.repeat(64)
})

import { refreshPostStats } from '@/services/page-comment.service'
import { fetchPostMeta } from '@/lib/facebook/graph'
import { mirrorRemoteImage } from '@/services/channel-chat.service'

const REAL_SHOP_ID = 'shop-real-post-owner'

function basePost(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'post-1',
    shopChannelId: 'ch-1',
    externalPostId: 'PAGE1_100',
    message: null,
    permalink: null,
    thumbnailUrl: null,
    mirroredFileId: null,
    mirroredAt: null,
    statsSyncedAt: null,
    channel: { shopId: REAL_SHOP_ID },
    ...overrides,
  }
}

describe('refreshPostStats — TC-SHOPID-02 (blocker): shopId ต้อง derive จาก post.channel.shopId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.shopChannel.findUnique.mockResolvedValue({
      accessTokenEnc: 'token-plain',
      externalId: 'PAGE1',
      status: 'ACTIVE',
    })
    db.facebookPost.update.mockResolvedValue({})
    vi.mocked(fetchPostMeta).mockResolvedValue({
      id: 'PAGE1_100',
      message: 'ข้อความโพสต์',
      permalink: 'https://facebook.com/PAGE1_100',
      picture: 'https://scontent.fbcdn.net/cover.jpg',
      createdTime: null,
      mediaType: 'photo',
      reactionCount: 1,
      commentCount: 2,
      shareCount: 0,
    })
  })

  it('โพสต์ยังไม่เคย mirror (mirroredFileId=null) → mirrorRemoteImage ถูกเรียกด้วย shopId ของเจ้าของโพสต์จริง', async () => {
    db.facebookPost.findUnique.mockResolvedValue(basePost())

    await refreshPostStats('post-1')

    expect(mirrorRemoteImage).toHaveBeenCalledTimes(1)
    const [url, opts] = vi.mocked(mirrorRemoteImage).mock.calls[0]!
    expect(url).toBe('https://scontent.fbcdn.net/cover.jpg')
    // 🛑 การพิสูจน์หลักของเคสนี้: shopId ต้องมาจาก post.channel.shopId จริง ไม่ใช่ hardcode/undefined
    expect(opts.shopId).toBe(REAL_SHOP_ID)
  })

  it('โพสต์นี้เป็นของร้านอื่น (shopId ต่างกัน) → mirrorRemoteImage ต้องได้ shopId ของร้านนั้นตาม (regression กันข้ามร้าน)', async () => {
    db.facebookPost.findUnique.mockResolvedValue(basePost({ channel: { shopId: 'shop-other-post-owner' } }))

    await refreshPostStats('post-1')

    const [, opts] = vi.mocked(mirrorRemoteImage).mock.calls[0]!
    expect(opts.shopId).toBe('shop-other-post-owner')
  })

  it('โพสต์ mirror ไปแล้ว (มี mirroredFileId) → ไม่เรียก mirrorRemoteImage ซ้ำ (idempotent)', async () => {
    db.facebookPost.findUnique.mockResolvedValue(basePost({ mirroredFileId: '2026/08/19/existing.jpg' }))

    await refreshPostStats('post-1')

    expect(mirrorRemoteImage).not.toHaveBeenCalled()
    expect(db.facebookPost.update).toHaveBeenCalledTimes(1)
    expect(db.facebookPost.update.mock.calls[0]![0].data.mirroredFileId).toBe('2026/08/19/existing.jpg')
  })
})

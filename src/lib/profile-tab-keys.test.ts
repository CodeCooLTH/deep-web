import { describe, expect, it } from 'vitest'

import { computeVisibleTabKeys, type VisibleTabInput } from './profile-tab-keys'

// ร้านที่มีของครบทุกแท็บที่ร้านประเภทบริการมีได้
const SERVICE_SHOP: VisibleTabInput = {
  hasVideos: true,
  isLodging: false,
  hasRooms: false,
  hasAvailability: false,
  isServiceQueue: true,
  hasServices: true,
  hasItems: true,
  hasReviews: true,
}

describe('computeVisibleTabKeys — hiddenTabs (CR 00053 2026-10-10)', () => {
  it('ไม่ส่ง hiddenTabs = แท็บครบเหมือนเดิม', () => {
    expect(computeVisibleTabKeys(SERVICE_SHOP)).toEqual(['pinned', 'services', 'items', 'reviews', 'about'])
  })

  it('ซ่อนบริการแล้วแท็บบริการหาย ที่เหลืออยู่ครบ', () => {
    expect(computeVisibleTabKeys({ ...SERVICE_SHOP, hiddenTabs: ['services'] })).toEqual([
      'pinned',
      'items',
      'reviews',
      'about',
    ])
  })

  it('[D-9] สั่งซ่อนรีวิว/เกี่ยวกับร้าน (payload ดัดแปลง) → ยังอยู่', () => {
    const keys = computeVisibleTabKeys({
      ...SERVICE_SHOP,
      hiddenTabs: ['reviews', 'about', 'pinned', 'services', 'items'],
    })
    expect(keys).toEqual(['reviews', 'about'])
  })

  it('คีย์แปลกปลอมถูกเมิน', () => {
    expect(computeVisibleTabKeys({ ...SERVICE_SHOP, hiddenTabs: ['bogus'] })).toHaveLength(5)
  })
})

import { describe, expect, it } from 'vitest'
import { buildMetaProductCard } from '../product-card'

const base = { name: 'โช๊คหลัง', priceText: '฿1,290.00', imageUrl: 'https://x/img.jpg', isActive: true }
const element = (card: Record<string, unknown>) =>
  ((card.payload as { elements: Record<string, unknown>[] }).elements)[0]!

describe('การ์ด Meta — กดดูรูป', () => {
  it('tapUrl → default_action web_url โดยยังไม่มีปุ่ม', () => {
    const el = element(buildMetaProductCard({ ...base, tapUrl: 'https://deepthailand.app/api/files/f1' }))
    expect(el.default_action).toEqual({ type: 'web_url', url: 'https://deepthailand.app/api/files/f1' })
    expect('buttons' in el).toBe(false)
  })
  it('ไม่ส่ง tapUrl → ไม่มี default_action', () => {
    expect('default_action' in element(buildMetaProductCard(base))).toBe(false)
  })
})

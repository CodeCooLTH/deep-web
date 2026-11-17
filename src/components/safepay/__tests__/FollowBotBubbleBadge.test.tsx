/** FollowBotBubbleBadge + FollowBotNoteLine (00095) — vitest เป็น node ⇒ renderToStaticMarkup */
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import FollowBotBubbleBadge from '../FollowBotBubbleBadge'
import FollowBotNoteLine from '../FollowBotNoteLine'

vi.mock('@/components/wrappers/Icon', () => ({ default: () => null }))
vi.mock('@/i18n/LocaleProvider', async () => {
  const { th } = await import('@/i18n/dictionaries/th')
  return { useT: () => th }
})

describe('FollowBotBubbleBadge', () => {
  it('มีรอบ: followStep เป็น 1-based จาก server → แสดงตรงตัว ไม่บวกซ้ำ', () => {
    const h = renderToStaticMarkup(<FollowBotBubbleBadge followStep={1} followStepCount={3} />)
    expect(h).toContain('tabular-nums')
    expect(h).toContain('>1/3<')
    expect(h).toContain('title="ส่งโดยบอทติดตาม รอบที่ 1 จาก 3"')
  })
  it('ไม่มีรอบ: แสดงแค่ "บอทติดตาม" ไม่เดาเลข (ควบคุม)', () => {
    const h = renderToStaticMarkup(<FollowBotBubbleBadge />)
    expect(h).not.toContain('tabular-nums')
    expect(h).toContain('title="ส่งโดยบอทติดตาม"')
  })
  it('ThreadMessageList ใช้ป้ายนี้ทั้งฟองเดี่ยวและอัลบั้ม (ถอดสาขาใดสาขาหนึ่งแล้วแดง)', () => {
    const src = readFileSync('src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ThreadMessageList.tsx', 'utf8')
    expect((src.match(/<FollowBotBubbleBadge/g) ?? []).length).toBe(2)
    expect(src).toMatch(/ms\.find\(\(x\) => followBadgeIds\.has\(x\.id\)\)/)
  })
})

describe('FollowBotNoteLine', () => {
  it('บรรทัดกลางห้อง: เนื้อหาตรง body · ไม่มีปุ่ม/ลิงก์', () => {
    const h = renderToStaticMarkup(<FollowBotNoteLine body="บอท “ตามคนถามราคา” หยุดติดตามแล้ว เพราะลูกค้าตอบกลับ" />)
    expect(h).toContain('text-center')
    expect(h).toContain('บอท “ตามคนถามราคา” หยุดติดตามแล้ว เพราะลูกค้าตอบกลับ')
    expect(h).not.toMatch(/<(a|button)[ >]/)
  })
})

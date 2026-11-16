/** FollowBotCapsule (00095 UX §21) — vitest เป็น node ⇒ ใช้ renderToStaticMarkup */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import FollowBotCapsule from '../FollowBotCapsule'

vi.mock('@/components/wrappers/Icon', () => ({ default: () => null }))
vi.mock('@/i18n/LocaleProvider', async () => {
  const { th: dict } = await import('@/i18n/dictionaries/th')
  return { useT: () => dict }
})

const html = (p: Parameters<typeof FollowBotCapsule>[0]) => renderToStaticMarkup(<FollowBotCapsule {...p} />)

describe('FollowBotCapsule', () => {
  it('progressbar + aria ครบ และจำนวนช่อง = totalRounds', () => {
    const h = html({ sentRounds: 1, totalRounds: 3, awaitingShop: false })
    expect(h).toContain('role="progressbar"')
    expect(h).toContain('aria-valuenow="1"')
    expect(h).toContain('aria-valuemax="3"')
    expect(h).toContain('aria-label="บอทติดตาม ส่งแล้ว 1 จาก 3 รอบ"')
    expect((h.match(/<i /g) ?? []).length).toBe(3)
  })
  it('ปกติ: ไม่มีตัวเลข/คำ "รอคุณตอบ" บนจอ และใช้โทน primary', () => {
    const h = html({ sentRounds: 1, totalRounds: 3, awaitingShop: false })
    expect(h).not.toContain(th.autoNotify.followBotAwaiting)
    expect(h).toContain('bg-primary')
    expect(h).not.toContain('bg-warning')
    expect(h.replace(/<[^>]+>/g, '')).toBe('')
  })
  it('ร้านค้างตอบ: โทน warning + คำ "รอคุณตอบ" + aria บอกด้วย (ควบคุมของข้อบน)', () => {
    const h = html({ sentRounds: 1, totalRounds: 2, awaitingShop: true })
    expect(h).toContain('รอคุณตอบ</span>')
    expect(h).toContain('bg-warning')
    expect(h).toContain('รอคุณตอบลูกค้าก่อน')
  })
  it('totalRounds 0 = ไม่ render', () => expect(html({ sentRounds: 0, totalRounds: 0, awaitingShop: false })).toBe(''))
})

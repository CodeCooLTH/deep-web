/** FollowBotRowChip (00095 แบบ 2) — vitest เป็น node ⇒ renderToStaticMarkup */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import { rowChipOverflow } from '@/lib/inbox-row-chips'
import FollowBotRowChip, { followBotRowChipName } from '../FollowBotRowChip'

vi.mock('@/components/wrappers/Icon', () => ({ default: () => null }))
vi.mock('@/i18n/LocaleProvider', async () => {
  const { th: dict } = await import('@/i18n/dictionaries/th')
  return { useT: () => dict }
})

const html = (p: Parameters<typeof FollowBotRowChip>[0]) => renderToStaticMarkup(<FollowBotRowChip {...p} />)

describe('FollowBotRowChip', () => {
  it('ปกติ: "บอทติดตาม 1/4" โทน primary + aria ประโยคเต็ม', () => {
    const h = html({ sentRounds: 1, totalRounds: 4, awaitingShop: false })
    expect(h).toContain('บอทติดตาม 1/4')
    expect(h).toContain('bg-primary/15 text-primary-ink')
    expect(h).toContain('aria-label="บอทติดตาม ส่งแล้ว 1 จาก 4 รอบ"')
  })
  it('ร้านค้างตอบ: ชิป warning "รอคุณตอบ" + aria บอกด้วย', () => {
    const h = html({ sentRounds: 1, totalRounds: 4, awaitingShop: true })
    expect(h).toContain('bg-warning/15 text-warning-ink')
    expect(h).toContain('รอคุณตอบ')
    expect(h).not.toContain('1/4')
    expect(h).toContain('รอคุณตอบลูกค้าก่อน')
  })
  it('ไม่มีรอบ = ไม่ render', () => {
    expect(html({ sentRounds: 0, totalRounds: 0, awaitingShop: false })).toBe('')
    expect(followBotRowChipName(th.autoNotify, { sentRounds: 0, totalRounds: 0, awaitingShop: false })).toBeNull()
  })
  it('ชิปบอทเป็นใบแรก: เกิน 2 ใบ → บอท+ใบถัดไปโชว์ ที่เหลือยุบ +N', () => {
    const bot = followBotRowChipName(th.autoNotify, { sentRounds: 1, totalRounds: 4, awaitingShop: false })!
    const o = rowChipOverflow([bot, 'ติดตาม 2', 'DeepBot', 'สนใจ'])
    expect(o).toEqual({ visible: 2, more: { text: '+2', names: ['DeepBot', 'สนใจ'] } })
  })
})

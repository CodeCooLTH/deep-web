/** FollowBotChipDetail (00095) — รอคุณตอบ: ปุ่มหลัก "ตอบลูกค้าตอนนี้" + หยุดบอทเป็นปุ่มรอง (มติผู้ใช้ 2026-11-16) */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import type { PanelRun } from '@/services/sales-follow-bot.service'
import type { FollowBotRoomValue } from '../../../../_components/FollowBotRoomProvider'
import FollowBotChipDetail from '../FollowBotChipDetail'

vi.mock('@/components/wrappers/Icon', () => ({ default: ({ icon }: { icon: string }) => <i data-icon={icon} /> }))
vi.mock('@/i18n/LocaleProvider', async () => {
  const { th: dict } = await import('@/i18n/dictionaries/th')
  return { useT: () => dict }
})
let room: FollowBotRoomValue
vi.mock('../../../../_components/FollowBotRoomProvider', () => ({ useFollowBotRoom: () => room }))

const mkRun = (over: Partial<PanelRun> = {}): PanelRun => ({
  runId: 'r', botName: 'ตามคนถามราคา', stageLabel: '', holdReason: null, holdText: null,
  awaitingShop: false, canStop: true, steps: [{ index: 1, state: 'PENDING', delayMin: 60, sentAt: null, dueAt: null, reasonText: null }], ...over,
})
const html = (run: PanelRun, onReply?: () => void) => {
  room = { status: 'ready', run, stopping: false, reload: async () => {}, reloadSoon: () => {}, stop: async () => {} }
  return renderToStaticMarkup(<FollowBotChipDetail onReply={onReply} />)
}
const noop = () => {}

describe('FollowBotChipDetail', () => {
  it('รอคุณตอบ: ปุ่มตอบลูกค้ามาก่อน (primary) · หยุดบอทไม่มีกรอบ', () => {
    const h = html(mkRun({ awaitingShop: true }), noop)
    expect(h).toContain(th.autoNotify.followBotReplyNow)
    expect(h.indexOf(th.autoNotify.followBotReplyNow)).toBeLessThan(h.indexOf(th.autoNotify.followBotStop))
    expect(h).toContain('bg-primary')
    expect(h).not.toContain('border-default-300')
  })
  it('บอทกำลังตามปกติ: ไม่มีปุ่มตอบ · หยุดบอทเป็นปุ่มมีกรอบเหมือนเดิม', () => {
    const h = html(mkRun(), noop)
    expect(h).not.toContain(th.autoNotify.followBotReplyNow)
    expect(h).toContain('border-default-300')
  })
  it('ไม่ส่ง onReply มา = ไม่มีปุ่มตอบแม้รอคุณตอบ (ไม่โชว์ปุ่มที่กดแล้วไม่มีผล)', () => {
    expect(html(mkRun({ awaitingShop: true }))).not.toContain(th.autoNotify.followBotReplyNow)
  })
})

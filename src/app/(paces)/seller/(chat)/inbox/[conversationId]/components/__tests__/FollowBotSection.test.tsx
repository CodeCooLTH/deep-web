/** FollowBotSection (00095 S-8b · UX §3) — vitest เป็น node ⇒ ใช้ renderToStaticMarkup + mock context ของห้อง */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import type { PanelRun, PanelStep } from '@/services/sales-follow-bot.service'
import type { FollowBotRoomValue } from '../../../../_components/FollowBotRoomProvider'
import FollowBotSection from '../FollowBotSection'

vi.mock('@/components/wrappers/Icon', () => ({ default: ({ icon }: { icon: string }) => <i data-icon={icon} /> }))
vi.mock('@/i18n/LocaleProvider', async () => {
  const { th: dict } = await import('@/i18n/dictionaries/th')
  return { useT: () => dict }
})

let room: FollowBotRoomValue
vi.mock('../../../../_components/FollowBotRoomProvider', () => ({ useFollowBotRoom: () => room }))

const FUTURE = new Date(Date.now() + 130 * 60_000).toISOString()
const step = (index: number, state: PanelStep['state'], extra: Partial<PanelStep> = {}): PanelStep => ({
  index, state, delayMin: 60, sentAt: null, dueAt: null, reasonText: null, ...extra,
})
const mkRun = (over: Partial<PanelRun> = {}): PanelRun => ({
  runId: 'r', botName: 'ตามคนถามราคา', stageLabel: 'ยังไม่ซื้อ', holdReason: null, holdText: null,
  awaitingShop: false, canStop: true, steps: [], ...over,
})
const set = (run: PanelRun | null, over: Partial<FollowBotRoomValue> = {}) => {
  room = { status: 'ready', run, stopping: false, reload: async () => {}, reloadSoon: () => {}, stop: async () => {}, ...over }
}
const html = () => renderToStaticMarkup(<FollowBotSection />)

beforeEach(() => set(null))

describe('FollowBotSection', () => {
  it('ไม่มี run (โหลดแล้ว/ปิดด่าน) = ไม่ render อะไรเลย รวมเส้นคั่น', () => {
    expect(html()).toBe('')
    set(null, { status: 'idle' })
    expect(html()).toBe('')
  })

  it('โหลดครั้งแรก = skeleton · ล้ม = ข้อความ + ลองใหม่ (ไม่ว่างเงียบ)', () => {
    set(null, { status: 'loading' })
    expect(html()).toContain('animate-pulse')
    set(null, { status: 'error' })
    const h = html()
    expect(h).toContain(th.autoNotify.followBotLoadError)
    expect(h).toContain(th.autoNotify.followBotRetry)
  })

  it('กรณีปกติ: ส่งแล้ว · อีก … ราว HH:MM (เด่น) · รอส่ง · ปุ่มหยุดใช้ได้', () => {
    set(mkRun({ steps: [step(1, 'SENT', { sentAt: '2026-11-16T07:32:00.000Z' }), step(2, 'PENDING', { dueAt: FUTURE }), step(3, 'PENDING')] }))
    const h = html()
    expect(h).toContain('ส่งแล้ว 14:32')
    expect(h).toMatch(/อีก 2 ชม\. (9|10) นาที/)
    expect(h).toContain('ราว ')
    expect(h).toContain('text-primary-ink font-medium')
    expect(h).toContain(th.autoNotify.followBotStepWaiting)
    expect(h).toContain('ตามคนถามราคา · ยังไม่ซื้อ')
    expect(h).not.toContain('disabled')
  })

  it('กรณีร้านค้างตอบ: กล่อง warning + ทุกรอบ "รอส่ง" ไม่มีเวลาที่ไม่จริง', () => {
    set(mkRun({ awaitingShop: true, steps: [step(1, 'PENDING'), step(2, 'PENDING')] }))
    const h = html()
    expect(h).toContain(th.autoNotify.followBotOweTitle)
    expect(h).toContain(th.autoNotify.followBotAfterReply)
    expect(h).toContain('bg-warning/15')
    expect(h).not.toContain('อีก ')
    expect((h.match(new RegExp(th.autoNotify.followBotStepWaiting, 'g')) ?? []).length).toBe(2)
  })

  it('กรณีพัก/ไม่ได้ส่ง/ล้ม: กล่องเทา holdText + แถว warning/danger พร้อมเหตุผล', () => {
    set(mkRun({
      holdText: 'หยุดชั่วคราว · Meta AI กำลังตอบแชทนี้อยู่',
      steps: [step(1, 'SENT', { sentAt: '2026-11-16T07:32:00.000Z' }), step(2, 'SKIPPED', { reasonText: 'เกินเวลาที่ Messenger/IG ให้ส่ง' }), step(3, 'FAILED')],
    }))
    const h = html()
    expect(h).toContain('หยุดชั่วคราว · Meta AI กำลังตอบแชทนี้อยู่')
    expect(h).toContain('bg-default-100')
    expect(h).toContain('ไม่ได้ส่ง · เกินเวลาที่ Messenger/IG ให้ส่ง')
    expect(h).toContain('text-warning-ink')
    expect(h).toContain(th.autoNotify.followBotStepFailed)
    expect(h).toContain('text-danger-ink')
  })

  it('canStop=false: ปุ่มล็อก + เหตุผลเป็นข้อความ (ไม่ซ่อนปุ่ม)', () => {
    set(mkRun({ canStop: false, steps: [step(1, 'PENDING')] }))
    const h = html()
    expect(h).toContain('disabled')
    expect(h).toContain(th.autoNotify.followBotCannotStop)
    expect(h).toContain(th.autoNotify.followBotStop)
  })

  it('กำลังหยุด: aria-busy + disabled', () => {
    set(mkRun({ steps: [step(1, 'PENDING')] }), { stopping: true })
    const h = html()
    expect(h).toContain('aria-busy="true"')
    expect(h).toContain('disabled')
  })
})

/** 00095 S-7 — รายการบอท + ประวัติการส่ง: สถานะว่าง/ไม่มีช่องทาง/แถว/ผลการส่ง (vitest เป็น node ⇒ renderToStaticMarkup + mock context) */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import type { BotDto, SendHistoryItem } from '@/services/sales-follow-bot.service'
import BotListClient from '../BotListClient'
import SendHistoryClient from '../SendHistoryClient'

vi.mock('@/components/wrappers/Icon', () => ({ default: ({ icon }: { icon: string }) => <i data-icon={icon} /> }))
vi.mock('@/i18n/LocaleProvider', async () => {
  const { th: dict } = await import('@/i18n/dictionaries/th')
  return { useT: () => dict, useLocale: () => 'th' }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))

const t = th.salesFollowBot
const bot = (o: Partial<BotDto> = {}): BotDto => ({
  id: 'b1',
  name: 'ตามคนถามราคา',
  status: 'ACTIVE',
  salesStatuses: ['NOT_BOUGHT'],
  tags: [{ key: 'a', name: 'ถามราคา', missing: false }],
  tagMatch: 'ANY',
  channelIds: ['c1'],
  channels: [{ id: 'c1', provider: 'MESSENGER', name: 'เพจร้านนุ่น', avatarUrl: null, handle: null }],
  testRoomIds: [],
  steps: [
    { delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดีค่ะ คุณ{ชื่อ}' }], adOnly: false },
    { delayMin: 1500, parts: [{ kind: 'TEXT', text: 'ยังสนใจไหมคะ' }], adOnly: true },
  ],
  totalDelayMin: 1530,
  structureRev: 1,
  updatedAt: '2026-11-16T09:00:00.000Z',
  warnings: [],
  activeRunCount: 12,
  ...o,
})
const send = (o: Partial<SendHistoryItem> = {}): SendHistoryItem => ({
  id: 's1',
  conversationId: 'conv1',
  contactName: 'สมชาย ใจดี',
  contactAvatarUrl: null,
  channel: 'MESSENGER',
  channelName: 'เพจร้านนุ่น',
  channelHandle: null,
  botName: 'ตามคนถามราคา',
  botDeleted: false,
  step: 2,
  stepCount: 3,
  status: 'SENT',
  reason: null,
  reasonText: null,
  at: '2026-11-16T07:32:00.000Z',
  ...o,
})

describe('BotListClient', () => {
  it('ไม่มีบอท + มีช่องทาง = สถานะว่างพร้อมปุ่มสร้างกลางการ์ด (ลิงก์ไป /new)', () => {
    const h = renderToStaticMarkup(<BotListClient bots={[]} hasChannel />)
    expect(h).toContain(t.emptyTitle)
    expect(h).toContain('href="/settings/sales-follow-bot/new"')
    expect(h).not.toContain(t.noChannelBanner)
  })
  it('ไม่มีช่องทาง = แบนเนอร์ + ปุ่มสร้าง disabled ชี้แบนเนอร์ด้วย aria-describedby', () => {
    const h = renderToStaticMarkup(<BotListClient bots={[]} hasChannel={false} />)
    expect(h).toContain(t.noChannelBanner)
    expect(h).toContain('href="/settings/channels"')
    expect(h).toMatch(/<button[^>]*disabled[^>]*aria-describedby="sfb-no-channel"|<button[^>]*aria-describedby="sfb-no-channel"[^>]*disabled/)
    expect(h).not.toContain('href="/settings/sales-follow-bot/new"')
  })
  it('แถวบอท: ชื่อเป็นลิงก์ · ตัวอย่างข้อความแทน {ชื่อ} · จำนวนแชทที่ตามอยู่ · รอบ + ระยะรวม · ชิปรอบโฆษณา', () => {
    const h = renderToStaticMarkup(<BotListClient bots={[bot()]} hasChannel />)
    expect(h).toContain('href="/settings/sales-follow-bot/b1"')
    expect(h).toContain('สวัสดีค่ะ คุณสมชาย')
    expect(h).not.toContain('{ชื่อ}')
    expect(h).toContain('>12<')
    expect(h).toContain(t.followingChats)
    expect(h).toContain('2 รอบ')
    expect(h).toContain('1 วัน 1 ชม. 30 นาที')
    expect(h).toContain('(รอบที่ 2 ส่งได้เฉพาะลูกค้าที่ทักมาจากโฆษณา)')
  })
  it('ตามอยู่ 0 แชท = ไม่แสดงเลข · ทดสอบ = จำนวนแชททดสอบ', () => {
    expect(renderToStaticMarkup(<BotListClient bots={[bot({ activeRunCount: 0 })]} hasChannel />)).not.toContain(t.followingChats)
    const h = renderToStaticMarkup(<BotListClient bots={[bot({ status: 'TESTING', testRoomIds: ['x', 'y'], activeRunCount: 7 })]} hasChannel />)
    expect(h).toContain(t.testChats)
    expect(h).not.toContain(t.followingChats)
  })
  it('แท็กถูกลบ: ANY = ยังใช้แท็กที่เหลือ · ALL = ไม่ตามแชทใหม่ · ไม่โชว์แท็กที่ถูกลบในรายการแท็ก', () => {
    const tags = [{ key: 'v', name: 'vip', missing: true }, { key: 'a', name: 'ถามราคา', missing: false }]
    const any = renderToStaticMarkup(<BotListClient bots={[bot({ tags })]} hasChannel />)
    expect(any).toContain('แท็ก “vip” ถูกลบไปแล้ว บอทยังใช้แท็กที่เหลือต่อ')
    expect(any).not.toContain('ถามราคา · vip')
    expect(renderToStaticMarkup(<BotListClient bots={[bot({ tags, tagMatch: 'ALL' })]} hasChannel />)).toContain('บอทนี้ยังไม่ตามแชทใหม่')
  })
  it('ไม่เลือกสถานะการขาย = "ทุกสถานะ"', () => {
    expect(renderToStaticMarkup(<BotListClient bots={[bot({ salesStatuses: [] })]} hasChannel />)).toContain(t.allStatuses)
  })
})

describe('SendHistoryClient', () => {
  it('ว่าง = ข้อความ "ยังไม่มีการส่ง"', () => {
    expect(renderToStaticMarkup(<SendHistoryClient initial={[]} initialCursor={null} />)).toContain(t.logEmptyTitle)
  })
  it('เขียวเฉพาะ "ส่งแล้ว" · ข้าม/ไม่แน่ใจ = warning · ล้ม = danger · เหตุผลเป็นถ้อยคำของเรา', () => {
    const h = renderToStaticMarkup(
      <SendHistoryClient
        initialCursor={null}
        initial={[
          send({ id: '1' }),
          send({ id: '2', status: 'SKIPPED', reason: 'LINE_QUOTA_FULL' }),
          send({ id: '3', status: 'FAILED', reason: 'META_WINDOW_REJECTED' }),
          send({ id: '4', status: 'FAILED', reason: 'UNCERTAIN_SEND' }),
        ]}
      />,
    )
    expect(h.match(/bg-success\/15/g)?.length).toBeGreaterThan(0)
    expect(h).toContain(t.resultSkipped)
    expect(h).toContain(t.sendReason.LINE_QUOTA_FULL)
    expect(h).toContain(t.sendReason.META_WINDOW_REJECTED)
    expect(h).toContain(t.resultUncertain)
    // UNCERTAIN_SEND สถานะ FAILED แต่ต้องเป็น warning ไม่ใช่ danger — มี danger แค่ใบเดียว (META_WINDOW_REJECTED) ต่อมุมมอง (ตาราง + การ์ด = 2)
    expect(h.match(/bg-danger\/15/g)?.length).toBe(2)
  })
  it('บอทที่ถูกลบ = ตัวเอียงเทา ไม่เป็นลิงก์ · ลูกค้าลิงก์ไปแชท · "โหลดเพิ่ม" มีเฉพาะเมื่อมี cursor', () => {
    const h = renderToStaticMarkup(<SendHistoryClient initialCursor={null} initial={[send({ botDeleted: true, botName: 'บอทที่ถูกลบแล้ว' })]} />)
    expect(h).toContain('italic')
    expect(h).toContain('href="/inbox/conv1"')
    expect(h).not.toContain(t.loadMore)
    expect(renderToStaticMarkup(<SendHistoryClient initialCursor="abc" initial={[send()]} />)).toContain(t.loadMore)
  })
})

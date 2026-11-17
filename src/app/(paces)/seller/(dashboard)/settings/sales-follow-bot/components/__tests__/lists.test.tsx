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
  conditionMatch: 'ALL',
  rules: [
    { field: 'stage', op: 'is', values: ['NOT_BOUGHT'] },
    { field: 'tag', op: 'has_any', values: [{ key: 'a', name: 'ถามราคา', missing: false }] },
  ],
  channelIds: ['c1'],
  channels: [{ id: 'c1', provider: 'MESSENGER', name: 'เพจร้านนุ่น', avatarUrl: null, handle: null }],
  testRoomIds: [],
  steps: [
    { delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดีค่ะ คุณ{ชื่อ}' }], adOnly: false },
    { delayMin: 1500, parts: [{ kind: 'TEXT', text: 'ยังสนใจไหมคะ' }], adOnly: true },
  ],
  finalAction: 'NONE',
  finalDelayMin: 1440,
  replyHandoff: 'ADMIN',
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
  controlReclaimed: false,
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
  it('แถวบอท: ชื่อเป็นลิงก์ · เงื่อนไขเป็นประโยคเดียว · ลูกค้าตอบ → แอดมิน · รอบ + ระยะรวม · ผล 7 วัน', () => {
    const h = renderToStaticMarkup(<BotListClient bots={[bot()]} hasChannel stats={{ b1: { sent: 30, failed: 1, reached: 10, replied: 3 } }} />)
    expect(h).toContain('href="/settings/sales-follow-bot/b1"')
    expect(h).toContain('ยังไม่ซื้อ และ มีแท็ก ถามราคา')
    expect(h).toContain('ลูกค้าตอบ → แอดมิน')
    expect(h).not.toContain('สวัสดีค่ะ') // ข้อความรอบแรกไม่อยู่ในรายการแล้ว (อยู่ในฟอร์ม/ตัวอย่าง)
    expect(h).toContain('2 รอบ')
    expect(h).toContain('1 วัน 1 ชม. 30 นาที')
    expect(h).toContain('>12<') // กำลังตาม
    expect(h).toContain('>30<') // ส่งแล้ว
    expect(h).toContain('>30%<') // 3 จาก 10
  })
  it('ไม่มีสถิติ (โหลดไม่ได้) = "–" ไม่ใช่ 0% · ปิดอยู่ที่ไม่เคยส่ง = "ปิดอยู่" ตัวเดียว · ทดสอบ = สรุปแชททดสอบ', () => {
    expect(renderToStaticMarkup(<BotListClient bots={[bot()]} hasChannel stats={null} />)).toContain('>–<')
    expect(renderToStaticMarkup(<BotListClient bots={[bot()]} hasChannel stats={null} />)).not.toContain('>0%<')
    const closed = renderToStaticMarkup(<BotListClient bots={[bot({ status: 'CLOSED', activeRunCount: 0 })]} hasChannel stats={{}} />)
    expect(closed).toContain(t.closedOff)
    expect(closed).not.toContain(t.statFollowing)
    const test = renderToStaticMarkup(<BotListClient bots={[bot({ status: 'TESTING', testRoomIds: ['x', 'y'] })]} hasChannel stats={{ b1: { sent: 5, failed: 0, reached: 2, replied: 0 } }} />)
    expect(test).toContain('2 แชททดสอบ · ส่งแล้ว 5')
  })
  it('สวิตช์ในแถว: เปิดใช้ = checked role=switch · ปิด = ไม่ checked · ทดสอบ = ไม่มีสวิตช์ แต่มีลิงก์ "เปิดใช้จริง…"', () => {
    const on = renderToStaticMarkup(<BotListClient bots={[bot()]} hasChannel />)
    expect(on).toMatch(/role="switch"[^>]*checked=""|checked=""[^>]*role="switch"/)
    expect(on).toContain('aria-label="เปิดหรือปิดบอท ตามคนถามราคา"')
    expect(renderToStaticMarkup(<BotListClient bots={[bot({ status: 'CLOSED' })]} hasChannel />)).not.toMatch(/role="switch"[^>]*checked=""|checked=""[^>]*role="switch"/)
    const testing = renderToStaticMarkup(<BotListClient bots={[bot({ status: 'TESTING' })]} hasChannel />)
    expect(testing).not.toContain('role="switch"')
    expect(testing).toContain(t.goLive)
  })
  it('แท็กถูกลบ: ชิป warning ในแถวเดียวกับเงื่อนไข (ข้อความสั้น + ประโยคเต็มใน aria-label) ลิงก์ไป #sfb-who · has_all = ป้าย "ไม่ติดตามแชทใหม่" · has_any ไม่มี · ไม่มีบรรทัดส้มแยก', () => {
    const rules = (op: 'has_any' | 'has_all'): BotDto['rules'] => [{ field: 'tag', op, values: [{ key: 'v', name: 'vip', missing: true }, { key: 'a', name: 'ถามราคา', missing: false }] }]
    const any = renderToStaticMarkup(<BotListClient bots={[bot({ rules: rules('has_any') })]} hasChannel />)
    expect(any).toContain('href="/settings/sales-follow-bot/b1#sfb-who"')
    expect(any).toContain('vip (ถูกลบแล้ว)')
    expect(any).toContain('aria-label="แท็ก “vip” ถูกลบไปแล้ว บอทยังใช้แท็กที่เหลือต่อ"')
    expect(any).toContain('data-icon="alert-triangle"')
    expect(any).not.toContain(t.tagGoneNoNew)
    expect(any).not.toContain('<p class="text-warning-ink')
    const all = renderToStaticMarkup(<BotListClient bots={[bot({ rules: rules('has_all') })]} hasChannel />)
    expect(all).toContain('aria-label="แท็ก “vip” ถูกลบไปแล้ว บอทนี้ยังไม่ติดตามแชทใหม่"')
    expect(all).toContain(t.tagGoneNoNew)
  })
  it('ช่องทาง: Messenger + IG ของเพจเดียวกัน = ชื่อเพจครั้งเดียว + "Messenger · Instagram" · LINE คนละกลุ่ม = "อีก 1 เพจ"', () => {
    const channels = [
      { id: 'c1', provider: 'MESSENGER', name: 'เพจร้านนุ่น', avatarUrl: null, handle: null },
      { id: 'c2', provider: 'INSTAGRAM', name: 'เพจร้านนุ่น', avatarUrl: null, handle: null },
      { id: 'c3', provider: 'LINE', name: 'OA ร้านนุ่น', avatarUrl: null, handle: null },
    ]
    const h = renderToStaticMarkup(<BotListClient bots={[bot({ channels })]} hasChannel />)
    expect(h.match(/>เพจร้านนุ่น</g)?.length).toBe(2) // ตาราง + การ์ด อย่างละครั้ง ไม่ซ้ำในแถวเดียว
    expect(h).toContain('Messenger · Instagram')
    expect(h).toContain('อีก 1 เพจ')
  })
  it('รอบโฆษณา: ชิป warning + ไอคอน speakerphone + คำอธิบายใน aria (ไม่พึ่งสีอย่างเดียว) · ไม่มีบรรทัดส้มแยก · รอบแรกเป็นรอบโฆษณา = ทั้งบอท', () => {
    const h = renderToStaticMarkup(<BotListClient bots={[bot()]} hasChannel />)
    expect(h).toContain('รอบที่ 2 ส่งได้เฉพาะลูกค้าที่ทักมาจากโฆษณา')
    expect(h).toContain('data-icon="speakerphone"')
    expect(h).toContain(`title="${t.rhythmAdChipTitle}"`)
    expect(h).not.toContain('<p class="text-warning-ink')
    const all = bot({ steps: [{ delayMin: 1500, parts: [{ kind: 'TEXT', text: 'x' }], adOnly: true }] })
    expect(renderToStaticMarkup(<BotListClient bots={[all]} hasChannel />)).toContain(t.rhythmAdAll)
    const none = bot({ steps: [{ delayMin: 30, parts: [{ kind: 'TEXT', text: 'x' }], adOnly: false }] })
    expect(renderToStaticMarkup(<BotListClient bots={[none]} hasChannel />)).not.toContain('เฉพาะลูกค้าที่ทักมาจากโฆษณา')
  })
  it('จบแล้วทำอะไร: ปลายรางมีธง "1 วัน → ปิดงาน" · NONE ไม่มี', () => {
    expect(renderToStaticMarkup(<BotListClient bots={[bot({ finalAction: 'RESOLVE', finalDelayMin: 1440 })]} hasChannel />)).toContain('1 วัน → ปิดงาน')
    expect(renderToStaticMarkup(<BotListClient bots={[bot()]} hasChannel />)).not.toContain('→ ปิดงาน')
  })
  it('เงื่อนไข has_none / is_not ออกเสียงเป็น "ไม่มีแท็ก" / "ไม่ใช่" ในประโยคเดียวกัน', () => {
    const rules: BotDto['rules'] = [
      { field: 'stage', op: 'is_not', values: ['BILLED'] },
      { field: 'tag', op: 'has_none', values: [{ key: 'k', name: 'รอคีย์ออเดอร์', missing: false }] },
      { field: 'tag', op: 'has_any', values: [{ key: 'a', name: 'สนใจ', missing: false }] },
    ]
    expect(renderToStaticMarkup(<BotListClient bots={[bot({ rules })]} hasChannel />)).toContain('ไม่ใช่ เปิดบิล และ ไม่มีแท็ก รอคีย์ออเดอร์ และ มีแท็ก สนใจ')
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

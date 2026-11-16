/** 00095 S-7 — BotForm: เรนเดอร์ครบทุกส่วนตาม mockup + สถานะล็อก/ช่องชน/ข้อความผิด (vitest เป็น node ⇒ renderToStaticMarkup + mock context) */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/dictionaries/th'
import { SALES_FOLLOW_LIMITS, SALES_STAGE_KEYS, SALES_STAGE_LABEL } from '@/lib/sales-follow-bot/constants'
import type { BotDto, BotOptions } from '@/services/sales-follow-bot.service'
import BotForm from '../BotForm'

vi.mock('@/components/wrappers/Icon', () => ({ default: ({ icon }: { icon: string }) => <i data-icon={icon} /> }))
vi.mock('@/components/wrappers/Select', () => ({ default: () => <div data-select /> }))
vi.mock('@/i18n/LocaleProvider', async () => {
  const { th: dict } = await import('@/i18n/dictionaries/th')
  return { useT: () => dict, useLocale: () => 'th' }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }))

const t = th.salesFollowBot
const options: BotOptions = {
  channels: [
    { id: 'c1', provider: 'MESSENGER', name: 'เพจร้านนุ่น', avatarUrl: null, handle: null, status: 'ACTIVE' },
    { id: 'c2', provider: 'INSTAGRAM', name: 'ร้านนุ่นไอจี', avatarUrl: null, handle: '@nunshop', status: 'EXPIRED' },
    { id: 'c3', provider: 'LINE', name: 'ร้านนุ่น OA', avatarUrl: null, handle: '@nunoa', status: 'ACTIVE' },
  ],
  tags: [{ key: 'a', name: 'ถามราคา' }],
  stages: SALES_STAGE_KEYS.map((key) => ({ key, label: SALES_STAGE_LABEL[key] })),
  limits: SALES_FOLLOW_LIMITS,
  variables: ['ชื่อ'],
  quickMessages: [],
}
const mk = (o: Partial<BotDto> = {}): BotDto => ({
  id: 'b1',
  name: 'ตามคนถามราคา',
  status: 'CLOSED',
  salesStatuses: ['NOT_BOUGHT'],
  tags: [{ key: 'a', name: 'ถามราคา', missing: false }],
  tagMatch: 'ANY',
  channelIds: ['c1'],
  channels: [],
  testRoomIds: [],
  steps: [
    { delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดีค่ะ คุณ{ชื่อ}' }], adOnly: false },
    { delayMin: 1500, parts: [{ kind: 'IMAGES', fileIds: ['2026/11/16/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'] }, { kind: 'QUICK_MESSAGE', quickMessageId: 'gone' }], adOnly: true },
  ],
  finalAction: 'NONE',
  finalDelayMin: 1440,
  replyHandoff: 'ADMIN',
  totalDelayMin: 1530,
  structureRev: 1,
  updatedAt: '2026-11-16T09:00:00.000Z',
  warnings: [],
  activeRunCount: 0,
  ...o,
})
const html = (bot: BotDto | null, bots: BotDto[] = []) => renderToStaticMarkup(<BotForm bot={bot} bots={bots} options={options} testRooms={[]} />)

describe('BotForm', () => {
  it('บอทใหม่: สถานะล็อกที่ปิด + เหตุผล · ไม่มีเมนูลบ · มีทั้ง 3 ส่วน + แถบสรุป + ตัวอย่าง', () => {
    const h = html(null)
    expect(h).toContain(t.statusLockedNew)
    expect(h).not.toContain(t.botMenuAria)
    for (const s of [t.sectionWho, t.sectionVia, t.sectionWhat, t.previewTitle, t.stopTitle]) expect(h).toContain(s)
    expect(h).toContain(t.sumEmpty)
    expect(h).toContain(t.statusDescClosed)
  })
  it('บอทเดิม: ชื่ออยู่ในช่อง · มีเมนูลบ · แถบสรุปเป็นประโยค · เวลารอแยกจำนวน/หน่วย · เวลาสะสมของแต่ละรอบ', () => {
    const h = html(mk())
    expect(h).toContain('value="ตามคนถามราคา"')
    expect(h).toContain(t.botMenuAria)
    expect(h).toContain('ลูกค้าที่')
    expect(h).toContain('ยังไม่ซื้อ')
    expect(h).toContain('เพจร้านนุ่น')
    expect(h).toContain('2 รอบ') // "{n} รอบ" ในประโยคสรุป
    expect(h).toContain('รวม 1 วัน 1 ชม. 30 นาที')
    expect(h).toContain('value="25"') // 1500 นาที = 25 ชม. (หน่วยใหญ่สุดที่หารลงตัวคือชั่วโมง ไม่ใช่วัน)
  })
  it('รอบที่เวลาสะสม >23 ชม. ขึ้นหมายเหตุ "ส่งได้เฉพาะลูกค้าจากโฆษณา" ที่ชิปเวลา + ตัวอย่างมีป้ายเฉพาะลูกค้าโฆษณา', () => {
    const h = html(mk())
    expect(h).toContain(t.adOnlyNote)
    expect(h).toContain(t.previewAdOnly)
  })
  it('ช่องทาง: ช่องที่ชนบอทอื่นถูกล็อกพร้อมลิงก์ไปบอทนั้น · ช่องหลุดมีป้าย · เลือก LINE มีหมายเหตุโควตา', () => {
    const other = mk({ id: 'b2', name: 'ตามคนซื้อ', status: 'ACTIVE', channelIds: ['c3'], salesStatuses: ['NOT_BOUGHT'] })
    const h = html(mk({ channelIds: ['c1'] }), [mk(), other])
    expect(h).toContain('href="/settings/sales-follow-bot/b2"')
    expect(h).toContain(t.channelTakenBySuffix)
    expect(h).toContain(t.channelDisconnected)
    expect(h).not.toContain(t.lineQuotaNote)
    const withLine = html(mk({ channelIds: ['c1', 'c3'] }), [mk()])
    expect(withLine).toContain(t.lineQuotaNote)
  })
  it('ช่องที่ติ๊กไว้แล้วชนบอทอื่น (เปลี่ยนสถานะภายหลัง) = ข้อความแดงบอกทางออก', () => {
    const other = mk({ id: 'b2', name: 'ตามคนซื้อ', status: 'ACTIVE', channelIds: ['c1'], salesStatuses: ['NOT_BOUGHT'] })
    const h = html(mk({ channelIds: ['c1'] }), [other])
    expect(h).toContain('ชนกับบอท')
    expect(h).toContain('ตามคนซื้อ')
  })
  it('ข้อความสำเร็จรูปที่ถูกลบ: แจ้งในการ์ดรอบ (พับ) ว่ารอบนี้จะข้ามชิ้นนี้ · ตัวอย่างบอกว่าข้าม', () => {
    const h = html(mk())
    expect(h).toContain(t.quickGone)
    expect(h).toContain(t.previewSkipped)
  })
  it('สถานะทดสอบ = โผล่การ์ดแชทสำหรับทดสอบ · สถานะอื่นไม่โผล่', () => {
    expect(html(mk({ status: 'TESTING', testRoomIds: ['r1'] }))).toContain(t.testTitle)
    expect(html(mk())).not.toContain(t.testTitle)
  })
  it('ไม่มีไอคอน/ข้อความที่ห้ามขึ้น UI: ไม่มีคำ "Deep" · ไม่มี emoji', () => {
    const h = html(mk())
    expect(h).not.toMatch(/Deep/)
    expect(h).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})

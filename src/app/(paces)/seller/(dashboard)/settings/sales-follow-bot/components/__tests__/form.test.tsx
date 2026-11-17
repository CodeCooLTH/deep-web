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
  conditionMatch: 'ALL',
  rules: [
    { field: 'stage', op: 'is', values: ['NOT_BOUGHT'] },
    { field: 'tag', op: 'has_any', values: [{ key: 'a', name: 'ถามราคา', missing: false }] },
  ],
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
  it('บอทใหม่: สถานะล็อกที่ปิด + เหตุผล · ไม่มีเมนูลบ · มีทั้ง 4 ส่วน + การ์ดสรุป + ตัวอย่าง', () => {
    const h = html(null)
    expect(h).toContain(t.statusLockedNew)
    expect(h).not.toContain(t.botMenuAria)
    for (const s of [t.sectionWho, t.sectionVia, t.sectionWhat, t.sectionEnd, t.summaryTitle, t.previewTitle, t.stopTitle]) expect(h).toContain(s)
    for (const id of ['sfb-who', 'sfb-via', 'sfb-what', 'sfb-end']) expect(h).toContain(`id="${id}"`)
    expect(h).toContain(t.statusDescClosed)
  })
  it('บอทเดิม: ชื่ออยู่ในช่อง · มีเมนูลบ · การ์ดสรุป key-value · เวลารอแยกจำนวน/หน่วย · เวลาสะสมของแต่ละรอบ', () => {
    const h = html(mk())
    expect(h).toContain('value="ตามคนถามราคา"')
    expect(h).toContain(t.botMenuAria)
    expect(h).toContain('ยังไม่ซื้อ')
    expect(h).toContain('เพจร้านนุ่น')
    expect(h).toContain('2 รอบ ใน 1 วัน 1 ชม. 30 นาที') // แถว "ส่ง" ในการ์ดสรุป
    expect(h).toContain('ส่งต่อแอดมิน') // หัวส่วน 4
    expect(h).toContain('รวม 1 วัน 1 ชม. 30 นาที')
    expect(h).toContain('value="25"') // 1500 นาที = 25 ชม. (หน่วยใหญ่สุดที่หารลงตัวคือชั่วโมง ไม่ใช่วัน)
  })
  it('รอบที่เวลาสะสม >23 ชม. ขึ้นหมายเหตุ "ส่งได้เฉพาะลูกค้าจากโฆษณา" ที่ชิปเวลา + ตัวอย่างมีป้ายเฉพาะลูกค้าโฆษณา', () => {
    const h = html(mk())
    expect(h).toContain(t.adOnlyNote)
    expect(h).toContain(t.previewAdOnly)
  })
  it('ช่องทาง: ช่องที่ชนบอทอื่นถูกล็อกพร้อมลิงก์ไปบอทนั้น · ช่องหลุดมีป้าย · เลือก LINE มีหมายเหตุโควตา', () => {
    const other = mk({ id: 'b2', name: 'ตามคนซื้อ', status: 'ACTIVE', channelIds: ['c3'] })
    const h = html(mk({ channelIds: ['c1'] }), [mk(), other])
    expect(h).toContain('href="/settings/sales-follow-bot/b2"')
    expect(h).toContain(t.channelTakenBySuffix)
    expect(h).toContain(t.channelDisconnected)
    expect(h).not.toContain(t.lineQuotaNote)
    const withLine = html(mk({ channelIds: ['c1', 'c3'] }), [mk()])
    expect(withLine).toContain(t.lineQuotaNote)
  })
  it('ช่องที่ติ๊กไว้แล้วชนบอทอื่น (เปลี่ยนสถานะภายหลัง) = ข้อความแดงบอกทางออก', () => {
    const other = mk({ id: 'b2', name: 'ตามคนซื้อ', status: 'ACTIVE', channelIds: ['c1'] })
    const h = html(mk({ channelIds: ['c1'] }), [other])
    expect(h).toContain('ชนกับบอท')
    expect(h).toContain('ตามคนซื้อ')
  })
  it('ข้อความสำเร็จรูปที่ถูกลบ: แจ้งในการ์ดรอบ (พับ) ว่ารอบนี้จะข้ามชิ้นนี้ · ตัวอย่างบอกว่าข้าม', () => {
    const h = html(mk())
    expect(h).toContain(t.quickGone)
    expect(h).toContain(t.previewSkipped)
  })
  it('ส่วน 4 "เงื่อนไขการหยุดติดตาม": ประโยคเติมคำ 2 แถว (ส่งต่อให้ใคร · ตามครบแล้วรอเท่าไรแล้วทำอะไร) ยังผูกกับช่องเดิม · หัวสรุป "ส่งต่อแอดมิน · 1 วัน → ปิดงาน"', () => {
    const h = html(mk({ finalAction: 'RESOLVE', finalDelayMin: 1440, replyHandoff: 'META_AI' }))
    for (const k of [t.replyHandoffLabel, t.finalPrefix, t.finalThen, t.replyHandoffHint, t.finalHint]) expect(h).toContain(k)
    for (const id of ['sfb-reply-handoff', 'sfb-final-wait']) expect(h).toContain(id) // Select2 ถูก mock — ผูกด้วย label/ช่องตัวเลขแทน
    expect(html(mk({ finalAction: 'RESOLVE', finalDelayMin: 1440 }))).toContain('ส่งต่อแอดมิน · 1 วัน → ปิดงาน')
  })
  it('แท็กถูกลบ: วงกลมเลขส่วน 1 เป็น warning (ไม่ใช่เครื่องหมายถูก) + หัว "แท็กถูกลบ 1" + บรรทัด/ปุ่ม "เอาออกจากบอท"', () => {
    const rules: BotDto['rules'] = [{ field: 'tag', op: 'has_any', values: [{ key: 'v', name: 'vip', missing: true }, { key: 'a', name: 'ถามราคา', missing: false }] }]
    const h = html(mk({ rules }))
    expect(h).toContain('แท็กถูกลบ 1')
    expect(h).toContain('แท็ก “vip” ถูกลบไปแล้ว')
    expect(h).toContain(t.tagRemoveGone)
    expect(h).toContain(t.stepWarnSr)
    const ok = html(mk())
    expect(ok).not.toContain(t.tagRemoveGone)
    expect(ok).not.toContain(t.stepWarnSr)
    expect(ok).toContain(t.stepDoneSr)
  })
  it('บอทใหม่ว่าง: ส่วนที่ยังไม่ครบไม่ติ๊กถูก (todo) · บอทครบ = ติ๊กถูกทั้ง 4', () => {
    expect(html(null)).toContain(t.stepTodoSr)
    expect(html(mk()).split(`>${t.stepDoneSr}<`).length - 1).toBe(4)
  })
  it('ช่องทางรวมตามเพจ: Messenger + IG ชื่อเดียวกัน = ชื่อเพจครั้งเดียวในส่วน 2', () => {
    const o = { ...options, channels: [{ ...options.channels[0], id: 'c1' }, { ...options.channels[1], id: 'c2', name: 'เพจร้านนุ่น', status: 'ACTIVE' as const }] }
    const h = renderToStaticMarkup(<BotForm bot={mk()} bots={[]} options={o} testRooms={[]} />)
    expect(h.match(/<p class="text-default-900 truncate text-sm font-medium">เพจร้านนุ่น<\/p>/g)?.length).toBe(1)
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

describe('FR-FA-8 ตัวสร้างเงื่อนไขการเริ่มติดตาม + เงื่อนไขการหยุดติดตาม', () => {
  const rules: BotDto['rules'] = [
    { field: 'stage', op: 'is', values: ['NOT_BOUGHT'] },
    { field: 'tag', op: 'has_none', values: [{ key: 'k', name: 'รอคีย์ออเดอร์', missing: false }] },
    { field: 'tag', op: 'has_any', values: [{ key: 'a', name: 'สนใจ', missing: false }, { key: 'b', name: 'ถามราคา', missing: false }] },
  ]
  it('หัวการ์ด/หัวกฎ/ปุ่มเพิ่ม + แถวละ 3 ช่อง (Select2) + ปุ่มลบแถวที่มีชื่อบอกลำดับ', () => {
    const h = html(mk({ rules }))
    for (const k of [t.sectionWho, t.ruleHead, t.addRule]) expect(h).toContain(k)
    expect(h).toContain('id="sfb-rule-add"') // Select2 ถูก mock — ช่องโหมด/แถวตรวจจากจำนวน select ด้านล่าง
    expect(h.match(/<div data-select/g)?.length).toBeGreaterThanOrEqual(1 + 3 * 3) // ตัวเลือกโหมด + 3 แถว × (ชนิด · เงื่อนไข · ค่า)
    for (const n of [1, 2, 3]) expect(h).toContain(`aria-label="${t.ruleRemoveAria.replace('{n}', String(n))}"`)
  })
  it('ประโยคสรุปในการ์ด + หัวสรุป: ยังไม่ซื้อ และ ไม่มีแท็ก รอคีย์ออเดอร์ และ มีแท็ก สนใจ หรือ ถามราคา', () => {
    const h = html(mk({ rules }))
    expect(h).toContain('ยังไม่ซื้อ และ ไม่มีแท็ก รอคีย์ออเดอร์ และ มีแท็ก สนใจ หรือ ถามราคา')
  })
  it('ไม่มีแถวเลย: ไม่มีประโยคสรุป · ส่วน 1 ยังไม่ครบ', () => {
    const h = html(mk({ rules: [] }))
    expect(h).not.toContain('data-icon="list-check"') // ไอคอนของกล่องประโยคสรุป
    expect(h).toContain(t.stepTodoSr)
  })
  it('การ์ด 4: ไม่มีบล็อก "หยุดเมื่อ" แบบเลือกหลายข้อ · มีบรรทัดห้องไม่ตรงเงื่อนไข · พับ "เหตุหยุดอื่น" ไม่ซ้ำแถวบน', () => {
    const h = html(mk())
    expect(h).toContain(t.stopUnmatched)
    expect(h).toContain(t.stopTitle)
    for (const k of [t.stopWindow, t.stopEdited, t.stopClosed, t.stopAdmin]) expect(h).toContain(k)
    expect(h).not.toContain('เลือกได้หลายข้อ') // ไม่มีบล็อก "บอทหยุดเมื่อ (เลือกได้หลายข้อ)" (สเปกเดิม stopTagKeys ถูกแทนที่)
  })
  it('ครบ 10 แถว: ปุ่มเพิ่มปิด + บอกเพดาน', () => {
    const many: BotDto['rules'] = Array.from({ length: 10 }, () => ({ field: 'stage' as const, op: 'is' as const, values: ['BILLED' as const] }))
    const h = html(mk({ rules: many }))
    expect(h).toMatch(/id="sfb-rule-add"[^>]*disabled|disabled[^>]*id="sfb-rule-add"/)
    expect(h).toContain(t.rulesFull.replace('{max}', '10'))
  })
})

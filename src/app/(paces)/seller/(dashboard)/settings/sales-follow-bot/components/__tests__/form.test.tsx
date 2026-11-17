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
    expect(h).not.toContain(t.statusLockedNew) // ผู้ใช้ 2026-11-17: ไม่ต้องมีบรรทัดอธิบายใต้ปุ่มสถานะ
    expect(h).not.toContain(t.botMenuAria)
    for (const s of [t.sectionWho, t.sectionVia, t.sectionWhat, t.sectionEnd, t.summaryTitle, t.previewTitle, t.stopTitle]) expect(h).toContain(s)
    for (const id of ['sfb-who', 'sfb-via', 'sfb-what', 'sfb-end']) expect(h).toContain(`id="${id}"`)
    expect(h).not.toContain(t.statusDescClosed)
  })
  it('บอทเดิม: ชื่ออยู่ในช่อง · มีเมนูลบ · การ์ดสรุป key-value · เวลารอแยกจำนวน/หน่วย · เวลาสะสมของแต่ละรอบ', () => {
    const h = html(mk())
    expect(h).toContain('value="ตามคนถามราคา"')
    expect(h).toContain(t.botMenuAria)
    expect(h).toContain('ยังไม่ซื้อ')
    expect(h).toContain('เพจร้านนุ่น')
    expect(h).toContain('2 รอบ') // แถว "รอบ" ในการ์ดสรุป
    expect(h).toContain('>1 วัน 1 ชม. 30 นาที</a>') // แถว "ระยะเวลา" แยกจากจำนวนรอบ
    expect(h).toContain('ส่งต่อแอดมิน') // หัวส่วน 4
    expect(h).toContain('รวม 1 วัน 1 ชม. 30 นาที')
    expect(h).toContain('value="25"') // 1500 นาที = 25 ชม. (หน่วยใหญ่สุดที่หารลงตัวคือชั่วโมง ไม่ใช่วัน)
  })
  it('รอบที่เวลาสะสม >23 ชม. ขึ้นหมายเหตุ "ส่งได้เฉพาะลูกค้าจากโฆษณา" ที่ชิปเวลา + ตัวอย่างมีป้ายเฉพาะลูกค้าโฆษณา', () => {
    const h = html(mk())
    expect(h).toContain(t.adOnlyNote)
    expect(h).toContain(t.previewAdOnly)
  })
  it('ส่วน 3 แบบ timeline: ไม่มีแถบเวลา/หัวสรุป · ปุ่มลบรอบแทนเมนูเลื่อน · ที่จับลาก · หมายเหตุโฆษณาครั้งเดียว · ตัวอย่างเป็น card เดียวมีท้ายการ์ด', () => {
    const h = html(mk())
    expect(h).not.toContain('h-2 w-full overflow-hidden') // แถบเวลาสะสมเดิม
    expect(h).toContain('aria-label="ลบรอบที่ 1"')
    expect(h).not.toContain('เลื่อนขึ้น')
    expect(h).toContain(t.dragAria)
    expect(h).toContain('border-dashed')
    expect(h.split(t.adOnlyNote).length - 1).toBe(1)
    expect(h).toContain('card-footer')
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
  it('ส่วน 4: ไทล์ส่งต่อ 2 + ไทล์ตามครบแล้ว 4 เป็น radio จริง · เลือกอันไหนติด checked ตามร่าง · หัวสรุป "ส่งต่อแอดมิน · 1 วัน → ปิดงาน"', () => {
    const h = html(mk({ finalAction: 'RESOLVE', finalDelayMin: 1440, replyHandoff: 'META_AI' }))
    for (const k of [t.stopWhenHead, t.stopReplyTitle, t.handoffThen, t.finalHead, t.finalResolveDesc, t.finalSpamDesc, t.finalHideDesc, t.finalNoneDesc, t.stopStageUnmatched]) expect(h).toContain(k)
    expect(h.match(/type="radio"[^>]*name="sfb-handoff"|name="sfb-handoff"[^>]*type="radio"/g)?.length).toBe(2)
    expect(h.match(/name="sfb-final-action"/g)?.length).toBe(4)
    expect(h).toContain('id="sfb-reply-handoff"')
    expect(h).toContain('id="sfb-final-wait"')
    expect(html(mk({ finalAction: 'RESOLVE', finalDelayMin: 1440 }))).toContain('ส่งต่อแอดมิน · 1 วัน → ปิดงาน')
  })
  it('Meta AI + บอทมีช่อง LINE = โน้ตส่งต่อแอดมินแทน · ไม่มี LINE = ไม่มีโน้ต', () => {
    expect(html(mk({ replyHandoff: 'META_AI', channelIds: ['c1', 'c3'] }))).toContain(t.handoffLineNote)
    expect(html(mk({ replyHandoff: 'META_AI', channelIds: ['c1'] }))).not.toContain(t.handoffLineNote)
  })
  it('"ไม่ทำอะไร" = ช่องรอปิด + บอกเหตุผล · อย่างอื่นเปิด', () => {
    const off = html(mk({ finalAction: 'NONE' }))
    expect(off).toMatch(/id="sfb-final-wait"[^>]*disabled/)
    expect(off).toContain(t.finalWaitOff)
    expect(html(mk({ finalAction: 'SPAM' }))).not.toContain(t.finalWaitOff)
  })
  it('โหมดง่าย (กฎ สถานะ-เป็น + แท็ก-ไม่มี): ช่องสถานะแถวเดียว + ช่องแท็กหยุด · ปุ่มไปขั้นสูง · ไม่มีตัวสร้างกฎ', () => {
    const simpleRules: BotDto['rules'] = [
      { field: 'stage', op: 'is', values: ['NOT_BOUGHT'] },
      { field: 'tag', op: 'has_none', values: [{ key: 'v', name: 'vip', missing: false }] },
    ]
    const h = html(mk({ rules: simpleRules }))
    expect(h).toContain('for="sfb-simple-stage"') // Select2 ถูก mock — ผูกด้วย label
    expect(h).toContain('for="sfb-stop-tags"')
    expect(h).toContain(t.simpleToAdvanced)
    expect(h).not.toContain('id="sfb-rule-add"')
    expect(h).toContain(`${t.sumStopReply} · ${t.sumStopTags.replace('{tags}', 'vip')}`)
  })
  it('กฎซับซ้อน (has_any) = ขั้นสูงตั้งแต่เปิด · แท็กหยุดเป็นข้อความเทา · กลับไปแบบง่ายไม่ได้', () => {
    const h = html(mk())
    expect(h).toContain('id="sfb-rule-add"')
    expect(h).toContain(t.stopTagAdvancedNote)
    expect(h).toContain(t.advancedToSimpleNo)
  })
  it('การ์ด 4: กล่องเทา "เหตุหยุดอื่น" แสดงเปิดไว้ครบ ไม่พับ', () => {
    const h = html(mk())
    expect(h).toContain(t.stopTitle)
    for (const k of [t.stopWindow, t.stopEdited, t.stopClosed, t.stopAdmin]) expect(h).toContain(k)
    expect(h).not.toContain('<details')
  })
  it('แท็กถูกลบ: วงกลมเลขส่วน 1 เป็น warning (ไม่ใช่เครื่องหมายถูก) + ชื่อแท็กในประโยคสรุปเป็นสีเทา + sr-only "(ถูกลบแล้ว)" (ไม่มีท้ายประโยค " · แท็กถูกลบ n") + บรรทัด/ปุ่ม "เอาออกจากบอท"', () => {
    const rules: BotDto['rules'] = [{ field: 'tag', op: 'has_any', values: [{ key: 'v', name: 'vip', missing: true }, { key: 'a', name: 'ถามราคา', missing: false }] }]
    const h = html(mk({ rules }))
    expect(h).not.toContain('แท็กถูกลบ 1')
    expect(h).toContain(`<span class="text-default-600">vip<span class="sr-only"> ${t.tagGoneSr}</span></span>`)
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
  it('ช่องทาง: จัดกลุ่มตามเพจ — ชื่อเพจครั้งเดียว · IG หลุดชื่อเดียวกันเป็นอีกแถวในกลุ่มเดิม มีลิงก์เชื่อมใหม่ · แต่ละแถวเป็นสวิตช์', () => {
    const o = { ...options, channels: [{ ...options.channels[0], id: 'c1' }, { ...options.channels[1], id: 'c2', name: 'เพจร้านนุ่น' }] }
    const h = renderToStaticMarkup(<BotForm bot={mk()} bots={[]} options={o} testRooms={[]} />)
    expect(h.match(/text-default-900 min-w-0 flex-1 truncate text-sm font-semibold">เพจร้านนุ่น</g)?.length).toBe(1)
    expect(h.match(/role="switch"/g)?.length).toBe(2)
    expect(h).toContain(t.channelReconnect)
    expect(h).toContain(t.channelDisconnected)
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
  it('ครบ 10 แถว: ปุ่มเพิ่มปิด + บอกเพดาน', () => {
    const many: BotDto['rules'] = Array.from({ length: 10 }, () => ({ field: 'stage' as const, op: 'is' as const, values: ['BILLED' as const] }))
    const h = html(mk({ rules: many }))
    expect(h).toMatch(/id="sfb-rule-add"[^>]*disabled|disabled[^>]*id="sfb-rule-add"/)
    expect(h).toContain(t.rulesFull.replace('{max}', '10'))
  })
})

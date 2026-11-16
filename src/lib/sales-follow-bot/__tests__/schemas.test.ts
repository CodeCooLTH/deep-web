// 00095 TC-070..077, 078, 082, 075, 109 — ฟอร์มบอท: ชื่อ/เงื่อนไข/ขั้น/ตัวแปร/เวลา
import { describe, expect, it } from 'vitest'
import { SALES_FOLLOW_LIMITS as L } from '../constants'
import {
  buildStepBubbles,
  parseCreateBot,
  stepStructureKey,
  renderStepText,
  stepTimeline,
  testRoomsProblem,
  validateBotFields,
  validateSteps,
  type BotFields,
  type BotIssue,
  type BotPart,
  type BotStep,
} from '../schemas'

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const text = (t: string): BotPart => ({ kind: 'TEXT', text: t })
const step = (o: Partial<BotStep> = {}): BotStep => ({ delayMin: 30, parts: [text('สวัสดีค่ะ คุณ{ชื่อ}')], ...o })
const stepText = (t: string) => step({ parts: [text(t)] })
const raw = (parts: unknown[], delayMin: unknown = 30) => body({ steps: [{ delayMin, parts }] })
const fields = (o: Partial<BotFields> = {}): BotFields => ({
  name: 'ตามคนถามราคา',
  salesStatuses: ['NOT_BOUGHT'],
  tags: [],
  tagMatch: 'ANY',
  channelIds: [U(1)],
  steps: [step()],
  ...o,
})
const codes = (xs: BotIssue[]) => xs.map((i) => i.code)
const body = (o: Record<string, unknown> = {}) => ({ ...fields(), ...o })

describe('TC-070 ชื่อ', () => {
  it.each([
    ['', ['NAME_REQUIRED']],
    ['   ', ['NAME_REQUIRED']],
    ['ก'.repeat(60), []],
    ['ก'.repeat(61), ['NAME_TOO_LONG']],
    // สระซ้อน/วรรณยุกต์นับเป็น code point แต่ละตัว (ตรง char_length ของ DB)
    ['กิ'.repeat(30), []],
    ['กิ'.repeat(31), ['NAME_TOO_LONG']],
    ['😀'.repeat(60), []],
    ['😀'.repeat(61), ['NAME_TOO_LONG']],
  ])('%j', (name, want) => {
    expect(codes(validateBotFields(fields({ name })))).toEqual(want)
  })
})

describe('TC-071/072 เงื่อนไข · เพดานจำนวน', () => {
  it('NO_CONDITION: ไม่มีทั้งสถานะและแท็ก (แท็กว่างล้วนก็นับว่าไม่มี)', () => {
    expect(codes(validateBotFields(fields({ salesStatuses: [], tags: [] })))).toEqual(['NO_CONDITION'])
    expect(codes(validateBotFields(fields({ salesStatuses: [], tags: ['  '] })))).toEqual(['NO_CONDITION'])
    expect(validateBotFields(fields({ salesStatuses: ['BILLED'], tags: [] }))).toEqual([])
    expect(validateBotFields(fields({ salesStatuses: [], tags: ['ถามราคา'] }))).toEqual([])
  })
  it('จำนวนขั้น 0 · 1 · 10 · 11', () => {
    expect(codes(validateBotFields(fields({ steps: [] })))).toEqual(['STEPS_COUNT'])
    expect(validateBotFields(fields({ steps: [step()] }))).toEqual([])
    expect(validateBotFields(fields({ steps: Array.from({ length: 10 }, () => step({ delayMin: 60 })) }))).toEqual([])
    expect(codes(validateBotFields(fields({ steps: Array.from({ length: 11 }, () => step({ delayMin: 60 })) })))).toEqual(['STEPS_COUNT'])
  })
  it('แท็ก 20 / 21 · ช่องทาง 0 / 1 / 50 / 51', () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`)
    expect(validateBotFields(fields({ tags: tags(20) }))).toEqual([])
    expect(codes(validateBotFields(fields({ tags: tags(21) })))).toEqual(['TOO_MANY_TAGS'])
    const ch = (n: number) => Array.from({ length: n }, (_, i) => U(i + 1))
    expect(codes(validateBotFields(fields({ channelIds: [] })))).toEqual(['CHANNELS_REQUIRED'])
    expect(validateBotFields(fields({ channelIds: ch(1) }))).toEqual([])
    expect(validateBotFields(fields({ channelIds: ch(50) }))).toEqual([])
    expect(codes(validateBotFields(fields({ channelIds: ch(51) })))).toEqual(['TOO_MANY_CHANNELS'])
  })
})

describe('TC-073 ชิ้นข้อความ (TEXT)', () => {
  const one = (text: string) => validateSteps([stepText(text)])
  it.each([
    ['ว่าง', '', ['PART_TEXT_REQUIRED']],
    ['ช่องว่างล้วน', '  \n ', ['PART_TEXT_REQUIRED']],
    ['1,000 ตัว', 'ก'.repeat(1000), []],
    ['1,001 ตัว', 'ก'.repeat(1001), ['PART_TEXT_TOO_LONG']],
    ['NUL', 'a\u0000b', ['PART_TEXT_INVALID']],
    ['surrogate เดี่ยว', 'a\uD800b', ['PART_TEXT_INVALID']],
  ])('%s', (_n, t, want) => {
    expect(codes(one(t))).toEqual(want)
  })
  it('issue ระดับชิ้นบอก stepIndex + partIndex', () => {
    const issues = validateSteps([step(), step({ parts: [text('ok'), text('')] })])
    expect(issues).toEqual([{ code: 'PART_TEXT_REQUIRED', path: 'steps.1.parts.1.text', stepIndex: 1, partIndex: 1 }])
  })
})

describe('TFR-FB-25 รอบละหลายชิ้น', () => {
  const parts = (n: number) => Array.from({ length: n }, (_, i) => text(`ข้อความ ${i}`))
  it('PARTS_COUNT: 0 · 1 · 5 · 6 ชิ้น', () => {
    expect(validateSteps([step({ parts: [] })])).toEqual([{ code: 'PARTS_COUNT', path: 'steps.0.parts', stepIndex: 0 }])
    expect(validateSteps([step({ parts: parts(1) })])).toEqual([])
    expect(validateSteps([step({ parts: parts(5) })])).toEqual([])
    expect(codes(validateSteps([step({ parts: parts(6) })]))).toEqual(['PARTS_COUNT'])
  })
  it('IMAGES: 1..5 รูป · 0 / 6 / id ว่าง = PART_IMAGES_COUNT', () => {
    const img = (n: number) => step({ parts: [{ kind: 'IMAGES', fileIds: Array.from({ length: n }, (_, i) => `f${i}`) }] })
    expect(validateSteps([img(1)])).toEqual([])
    expect(validateSteps([img(5)])).toEqual([])
    expect(validateSteps([img(0)])).toEqual([{ code: 'PART_IMAGES_COUNT', path: 'steps.0.parts.0.fileIds', stepIndex: 0, partIndex: 0 }])
    expect(codes(validateSteps([img(6)]))).toEqual(['PART_IMAGES_COUNT'])
    expect(codes(validateSteps([step({ parts: [{ kind: 'IMAGES', fileIds: ['a', ' '] }] })]))).toEqual(['PART_IMAGES_COUNT'])
  })
  it('QUICK_MESSAGE ไม่มี id → QUICK_MESSAGE_REQUIRED · มี id ผ่าน', () => {
    expect(validateSteps([step({ parts: [{ kind: 'QUICK_MESSAGE', quickMessageId: 'q1' }] })])).toEqual([])
    expect(validateSteps([step({ parts: [{ kind: 'QUICK_MESSAGE', quickMessageId: '  ' }] })])).toEqual([
      { code: 'QUICK_MESSAGE_REQUIRED', path: 'steps.0.parts.0.quickMessageId', stepIndex: 0, partIndex: 0 },
    ])
  })
  it('ผสมชนิดในรอบเดียวได้ · issue ชี้ชิ้นที่ผิดเท่านั้น', () => {
    const s = step({ parts: [text('ok'), { kind: 'IMAGES', fileIds: ['f'] }, { kind: 'QUICK_MESSAGE', quickMessageId: '' }, text('{ราคา}')] })
    expect(validateSteps([s]).map((i) => [i.code, i.partIndex])).toEqual([['QUICK_MESSAGE_REQUIRED', 2], ['UNKNOWN_VARIABLE', 3]])
  })
  it('ชั้นชนิด (Valibot): kind นอกชุด/TEXT_IMAGE เดิม → PART_KIND_INVALID พร้อมตำแหน่ง', () => {
    for (const kind of ['TEXT_IMAGE', 'PRODUCT_CARD', undefined]) {
      expect(parseCreateBot(raw([{ kind, text: 'x' }]))).toEqual({
        ok: false,
        issues: [expect.objectContaining({ code: 'PART_KIND_INVALID', stepIndex: 0, partIndex: 0 })],
      })
    }
  })
  it('ชั้นชนิด: parts ไม่ใช่อาร์เรย์ → PARTS_COUNT · text/fileIds/quickMessageId ผิดชนิด → โค้ดของชิ้นนั้น', () => {
    expect(parseCreateBot(raw('x' as never))).toMatchObject({ ok: false, issues: [{ code: 'PARTS_COUNT', stepIndex: 0 }] })
    expect(parseCreateBot(raw([{ kind: 'TEXT', text: 5 }]))).toMatchObject({ ok: false, issues: [{ code: 'PART_TEXT_REQUIRED', partIndex: 0 }] })
    expect(parseCreateBot(raw([{ kind: 'IMAGES', fileIds: 'a' }]))).toMatchObject({ ok: false, issues: [{ code: 'PART_IMAGES_COUNT', partIndex: 0 }] })
    expect(parseCreateBot(raw([{ kind: 'QUICK_MESSAGE' }]))).toMatchObject({ ok: false, issues: [{ code: 'QUICK_MESSAGE_REQUIRED', partIndex: 0 }] })
  })
  it('normalize: trim ข้อความ · quick id · ทิ้งคีย์เกินของชิ้น', () => {
    const r = parseCreateBot(raw([{ kind: 'TEXT', text: ' สวัสดี ', extra: 1 }, { kind: 'QUICK_MESSAGE', quickMessageId: ' q1 ' }]))
    expect(r).toMatchObject({ ok: true, value: { steps: [{ parts: [{ kind: 'TEXT', text: 'สวัสดี' }, { kind: 'QUICK_MESSAGE', quickMessageId: 'q1' }] }] } })
    expect(r.ok && JSON.stringify(r.value.steps[0].parts[0])).toBe('{"kind":"TEXT","text":"สวัสดี"}')
  })
  it('stepStructureKey: จำนวนรอบ + ลำดับชนิด — แก้เนื้อหา/delay ไม่เปลี่ยน · เพิ่มชิ้น/สลับชนิด/เพิ่มรอบ เปลี่ยน', () => {
    const q = (id: string): BotPart => ({ kind: 'QUICK_MESSAGE', quickMessageId: id })
    const img = (...f: string[]): BotPart => ({ kind: 'IMAGES', fileIds: f })
    const base = [step({ parts: [text('a'), img('f1')] }), step({ parts: [q('q1')] })]
    expect(stepStructureKey(base)).toBe('TEXT,IMAGES|QUICK_MESSAGE')
    const same = [step({ delayMin: 999, parts: [text('ใหม่'), img('f9', 'f8')] }), step({ parts: [q('q2')] })]
    expect(stepStructureKey(same)).toBe(stepStructureKey(base))
    expect(stepStructureKey([step({ parts: [img('f1'), text('a')] }), base[1]])).not.toBe(stepStructureKey(base))
    expect(stepStructureKey([step({ parts: [text('a')] }), base[1]])).not.toBe(stepStructureKey(base))
    expect(stepStructureKey([...base, step()])).not.toBe(stepStructureKey(base))
    expect(stepStructureKey([])).toBe('')
  })
})

describe('TC-074 ตัวแปร (ต่อชิ้น TEXT)', () => {
  const vars = (t: string) => validateSteps([stepText(t)]).map((i) => [i.code, i.name])
  it('{ชื่อ} ผ่าน', () => expect(vars('คุณ{ชื่อ}')).toEqual([]))
  it.each([['{สินค้า}', 'สินค้า'], ['{ราคา}', 'ราคา'], ['{ชื่อลูกค้า}', 'ชื่อลูกค้า'], ['{}', ''], ['{ ชื่อ }', ' ชื่อ ']])('%s → UNKNOWN_VARIABLE', (t, name) => {
    expect(vars(t)).toEqual([['UNKNOWN_VARIABLE', name]])
  })
  it('ตัวแปรเดียวกันซ้ำ แจ้งครั้งเดียว · วงเล็บไม่มีคู่ถือเป็นข้อความ', () => {
    expect(vars('{ราคา} {ราคา}')).toEqual([['UNKNOWN_VARIABLE', 'ราคา']])
    expect(vars('ราคา {ไม่ปิด')).toEqual([])
  })
})

describe('TC-076 delayMin', () => {
  it.each([[0], [-5], [1.5], [Number.NaN]])('%s → STEP_DELAY_MIN', (d) => {
    expect(codes(validateSteps([step({ delayMin: d })]))).toEqual(['STEP_DELAY_MIN'])
  })
  it('1 ผ่าน', () => expect(validateSteps([step({ delayMin: 1 })])).toEqual([]))
  it('ชนิดผิด "30" → STEP_DELAY_MIN (ชั้น Valibot)', () => {
    const r = parseCreateBot(raw([{ kind: 'TEXT', text: 'x' }], '30'))
    expect(r).toEqual({ ok: false, issues: [{ code: 'STEP_DELAY_MIN', path: 'steps.0.delayMin', stepIndex: 0 }] })
  })
})

describe('TC-077 Σ delayMin ≤ 10,020 + ชี้ขั้นที่ทำให้เกิน', () => {
  it('10,020 พอดี ผ่าน', () => {
    expect(validateSteps([step({ delayMin: 5000 }), step({ delayMin: 5020 })])).toEqual([])
  })
  it('10,021 → STEPS_TOTAL_TOO_LONG stepIndex ที่ถูก', () => {
    expect(validateSteps([step({ delayMin: 5000 }), step({ delayMin: 5021 })])).toEqual([{ code: 'STEPS_TOTAL_TOO_LONG', path: 'steps', stepIndex: 1 }])
    expect(validateSteps([step({ delayMin: 10_021 }), step()])).toEqual([{ code: 'STEPS_TOTAL_TOO_LONG', path: 'steps', stepIndex: 0 }])
  })
  it('มีขั้นที่ delay ใช้ไม่ได้ → ไม่รายงาน Σ (ไม่มีความหมาย)', () => {
    expect(codes(validateSteps([step({ delayMin: 0 }), step({ delayMin: 99_999 })]))).toEqual(['STEP_DELAY_MIN'])
  })
  it('ตัวเลขเพดานตรง constants (TC-107)', () => {
    expect(L).toMatchObject({ maxSteps: 10, maxParts: 5, maxImagesPerPart: 5, maxText: 1000, maxName: 60, maxTestRooms: 20, maxChannels: 50, maxTags: 20, minDelayMin: 1, maxTotalDelayMin: 10_020, adOnlyAfterMin: 1_380 })
  })
})

describe('TC-078 adOnly คำนวณ ไม่เก็บ ไม่รับจาก client', () => {
  it('สะสม 1,380 = false · 1,381 = true · ขั้นหลังของ 1,381 true ทุกขั้น', () => {
    expect(stepTimeline([1380]).adOnly).toEqual([false])
    expect(stepTimeline([1381]).adOnly).toEqual([true])
    expect(stepTimeline([1000, 381, 5]).adOnly).toEqual([false, true, true])
    expect(stepTimeline([2000]).adOnly).toEqual([true])
    expect(stepTimeline([30, 120]).totalDelayMin).toBe(150)
  })
  it('client ส่ง adOnly มา → ถูกทิ้งจากผลลัพธ์', () => {
    const r = parseCreateBot(body({ steps: [{ ...step(), adOnly: true }] }))
    expect(r.ok && 'adOnly' in r.value.steps[0]).toBe(false)
  })
})

describe('parseCreateBot ภาพรวม', () => {
  it('ผ่าน: ค่าตั้งต้น tagMatch=ANY, trim ชื่อ/แท็ก', () => {
    const r = parseCreateBot({ name: ' บอท ', tags: [' a '], channelIds: [U(1)], steps: [{ delayMin: 30, parts: [{ kind: 'TEXT', text: 'x' }] }] })
    expect(r).toMatchObject({ ok: true, value: { name: 'บอท', tags: ['a'], tagMatch: 'ANY', salesStatuses: [] } })
  })
  it('สถานะการขายนอกชุด / channelId ไม่ใช่ uuid → INVALID_BODY', () => {
    expect(parseCreateBot(body({ salesStatuses: ['CONFIRMED'] }))).toMatchObject({ ok: false, issues: [{ code: 'INVALID_BODY' }] })
    expect(parseCreateBot(body({ channelIds: ['x'] }))).toMatchObject({ ok: false, issues: [{ code: 'INVALID_BODY' }] })
  })
  it('ไม่ส่งชื่อ → NAME_REQUIRED · steps ไม่ใช่อาร์เรย์ → STEPS_COUNT · body ไม่ใช่ object ไม่ crash', () => {
    expect(parseCreateBot(body({ name: undefined }))).toMatchObject({ ok: false, issues: [{ code: 'NAME_REQUIRED' }] })
    expect(parseCreateBot(body({ steps: 'x' }))).toMatchObject({ ok: false, issues: [{ code: 'STEPS_COUNT' }] })
    expect(parseCreateBot(null).ok).toBe(false)
  })
  it('รวมหลาย issue ในครั้งเดียว', () => {
    const r = parseCreateBot(body({ name: '', salesStatuses: [], steps: [stepText('')] }))
    expect(r.ok === false && codes(r.issues)).toEqual(['NAME_REQUIRED', 'NO_CONDITION', 'PART_TEXT_REQUIRED'])
  })
  it('status ที่ client ส่งมาถูกทิ้ง (บอทใหม่ CLOSED เสมอ AC-FB-04)', () => {
    const r = parseCreateBot(body({ status: 'ACTIVE' }))
    expect(r.ok && 'status' in r.value).toBe(false)
  })
})

describe('testRoomsProblem — ห้องทดสอบ 1..20 (TEST_ROOMS_TOO_MANY)', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => U(i + 1))
  it.each([
    ['TESTING', ids(0), 'TEST_ROOMS_REQUIRED'],
    ['TESTING', undefined, 'TEST_ROOMS_REQUIRED'],
    ['TESTING', ids(1), null],
    ['TESTING', ids(20), null],
    ['TESTING', ids(21), 'TEST_ROOMS_TOO_MANY'],
    ['ACTIVE', ids(0), null],
    ['CLOSED', ids(99), null],
  ] as const)('%s × %j', (status, rooms, want) => {
    expect(testRoomsProblem(status, rooms)).toBe(want)
  })
  it('นับหลัง dedupe', () => {
    expect(testRoomsProblem('TESTING', [U(1), U(1)])).toBeNull()
  })
})

describe('TC-075 renderStepText — {ชื่อ} ไม่มีชื่อ = ตัดพร้อมช่องว่างซ้อน', () => {
  it('มีชื่อ', () => expect(renderStepText('สวัสดีคุณ{ชื่อ} ค่ะ', 'สมชาย')).toBe('สวัสดีคุณสมชาย ค่ะ'))
  it.each([[null], [undefined], [''], ['   ']])('ไม่มีชื่อ %j', (n) => {
    expect(renderStepText('สวัสดีคุณ{ชื่อ} ค่ะ', n)).toBe('สวัสดีคุณ ค่ะ')
    expect(renderStepText('{ชื่อ} สวัสดีค่ะ', n)).toBe('สวัสดีค่ะ')
    expect(renderStepText('สวัสดีค่ะ {ชื่อ}', n)).toBe('สวัสดีค่ะ')
    expect(renderStepText('สวัสดี {ชื่อ} ค่ะ', n)).toBe('สวัสดี ค่ะ')
    expect(renderStepText('สวัสดี{ชื่อ}', n)).toBe('สวัสดี')
  })
  it('ไม่แทนด้วย "ลูกค้า" (ห้ามใช้ customerDisplayName)', () => {
    expect(renderStepText('คุณ{ชื่อ}', null)).not.toContain('ลูกค้า')
  })
  it('ชื่อที่มี { } ไม่ถูกแทนซ้ำ · ตัวแปรไม่รู้จักคงเดิม · ชื่อถูก trim', () => {
    expect(renderStepText('คุณ{ชื่อ}', '{ชื่อ}')).toBe('คุณ{ชื่อ}')
    expect(renderStepText('{ราคา} {ชื่อ}', ' ก ')).toBe('{ราคา} ก')
  })
  it('คงช่องว่าง/บรรทัดใหม่ที่ผู้ใช้ตั้งใจ', () => {
    expect(renderStepText('สวัสดี\n\nขอบคุณ', 'ก')).toBe('สวัสดี\n\nขอบคุณ')
  })
})

describe('TC-082/109 buildStepBubbles — ตัวเดียวกับตัวอย่างในแชท (ต่อชิ้น)', () => {
  it('เรียงตามชิ้น · ตัวแปรแทนเหมือนกัน · IMAGES = ฟองเดียวหลายรูป · quick message = placeholder', () => {
    const r = buildStepBubbles(
      { parts: [text('สวัสดี{ชื่อ}'), { kind: 'IMAGES', fileIds: ['f1', 'f2'] }, { kind: 'QUICK_MESSAGE', quickMessageId: 'q1' }] },
      'ก',
    )
    expect(r).toEqual({
      ok: true,
      bubbles: [
        { type: 'TEXT', partIndex: 0, text: 'สวัสดีก' },
        { type: 'IMAGES', partIndex: 1, fileIds: ['f1', 'f2'] },
        { type: 'QUICK_MESSAGE', partIndex: 2, quickMessageId: 'q1' },
      ],
    })
  })
  it('ชิ้นข้อความที่ว่างหลังแทนตัวแปรถูกข้าม ชิ้นอื่นยังส่ง', () => {
    expect(buildStepBubbles({ parts: [text('{ชื่อ}'), { kind: 'IMAGES', fileIds: ['f'] }] }, null)).toEqual({
      ok: true,
      bubbles: [{ type: 'IMAGES', partIndex: 1, fileIds: ['f'] }],
    })
  })
  it('TC-109 ไม่เหลือชิ้นที่ส่งได้ → EMPTY_MESSAGE', () => {
    expect(buildStepBubbles({ parts: [text('{ชื่อ}')] }, null)).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' })
    expect(buildStepBubbles({ parts: [text('{ชื่อ}'), text(' ')] }, ' ')).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' })
    expect(buildStepBubbles({ parts: [] }, 'ก')).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' })
  })
})

describe('00095-ext ตามครบแล้วไม่ตอบ — finalAction/finalDelayMin', () => {
  it('ไม่ส่งสองฟิลด์ = ผ่าน (ค่าตั้งต้นฝั่ง service) · ค่าถูกต้องผ่านและคงค่า', () => {
    expect(parseCreateBot(body()).ok).toBe(true)
    const r = parseCreateBot(body({ finalAction: 'SPAM', finalDelayMin: 240 }))
    expect(r.ok && r.value.finalAction).toBe('SPAM')
    expect(r.ok && r.value.finalDelayMin).toBe(240)
  })
  it.each([0, 1, 10_080])('finalDelayMin %i ผ่าน (0 และ 7 วันพอดีใช้ได้)', (n) => {
    expect(codes(validateBotFields(fields({ finalDelayMin: n })))).toEqual([])
  })
  it.each([-1, 10_081, 1.5])('finalDelayMin %s → FINAL_DELAY_INVALID', (n) => {
    expect(codes(validateBotFields(fields({ finalDelayMin: n })))).toEqual(['FINAL_DELAY_INVALID'])
  })
  it('ชนิดผิดที่ระดับ Valibot: delay เป็นสตริง → FINAL_DELAY_INVALID · action นอกชุด → INVALID_BODY', () => {
    const a = parseCreateBot(body({ finalDelayMin: '60' }))
    expect(!a.ok && codes(a.issues)).toEqual(['FINAL_DELAY_INVALID'])
    const b = parseCreateBot(body({ finalAction: 'DELETE' }))
    expect(!b.ok && codes(b.issues)).toEqual(['INVALID_BODY'])
  })
  it('ไม่นับเป็นโครงรอบ (BR-FA-6): stepStructureKey ไม่เปลี่ยนเมื่อแก้ค่านี้', () => {
    expect(stepStructureKey(fields({ finalAction: 'NONE' }).steps)).toBe(stepStructureKey(fields({ finalAction: 'SPAM', finalDelayMin: 5 }).steps))
  })
})

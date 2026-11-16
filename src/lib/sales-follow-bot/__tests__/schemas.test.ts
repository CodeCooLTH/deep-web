// 00095 TC-070..077, 078, 082, 075, 109 — ฟอร์มบอท: ชื่อ/เงื่อนไข/ขั้น/ตัวแปร/เวลา
import { describe, expect, it } from 'vitest'
import { SALES_FOLLOW_LIMITS as L } from '../constants'
import {
  buildStepBubbles,
  parseCreateBot,
  renderStepText,
  stepTimeline,
  testRoomsProblem,
  validateBotFields,
  validateSteps,
  type BotFields,
  type BotIssue,
  type BotStep,
} from '../schemas'

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const step = (o: Partial<BotStep> = {}): BotStep => ({ delayMin: 30, kind: 'TEXT', text: 'สวัสดีค่ะ คุณ{ชื่อ}', imageFileId: null, ...o })
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

describe('TC-073 ข้อความขั้น', () => {
  const one = (o: Partial<BotStep>) => validateSteps([step(o)])
  it.each([
    ['ว่าง', '', ['STEP_TEXT_REQUIRED']],
    ['ช่องว่างล้วน', '  \n ', ['STEP_TEXT_REQUIRED']],
    ['1,000 ตัว', 'ก'.repeat(1000), []],
    ['1,001 ตัว', 'ก'.repeat(1001), ['STEP_TEXT_TOO_LONG']],
    ['NUL', 'a\u0000b', ['STEP_TEXT_INVALID']],
    ['surrogate เดี่ยว', 'a\uD800b', ['STEP_TEXT_INVALID']],
  ])('%s', (_n, text, want) => {
    expect(codes(one({ text }))).toEqual(want)
  })
  it('TEXT_IMAGE ไม่มีรูป → STEP_IMAGE_REQUIRED · มีรูป ผ่าน', () => {
    expect(codes(one({ kind: 'TEXT_IMAGE', imageFileId: null }))).toEqual(['STEP_IMAGE_REQUIRED'])
    expect(one({ kind: 'TEXT_IMAGE', imageFileId: 'f1' })).toEqual([])
  })
  it('kind นอก {TEXT, TEXT_IMAGE} ถูกปฏิเสธที่ชั้นชนิด (การ์ดสินค้าเป็น P2)', () => {
    const r = parseCreateBot(body({ steps: [{ delayMin: 30, kind: 'PRODUCT_CARD', text: 'x' }] }))
    expect(r).toEqual({ ok: false, issues: [{ code: 'STEP_KIND_INVALID', path: 'steps.0.kind', stepIndex: 0 }] })
  })
  it('TEXT ที่แนบ imageFileId มา ไม่ error — ทิ้งรูป', () => {
    const r = parseCreateBot(body({ steps: [{ delayMin: 30, kind: 'TEXT', text: ' สวัสดี ', imageFileId: 'f1' }] }))
    expect(r).toMatchObject({ ok: true, value: { steps: [{ text: 'สวัสดี', imageFileId: null }] } })
  })
})

describe('TC-074 ตัวแปร', () => {
  const vars = (text: string) => validateSteps([step({ text })]).map((i) => [i.code, i.name])
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
    const r = parseCreateBot(body({ steps: [{ delayMin: '30', kind: 'TEXT', text: 'x' }] }))
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
    expect(L).toMatchObject({ maxSteps: 10, maxText: 1000, maxName: 60, maxTestRooms: 20, maxChannels: 50, maxTags: 20, minDelayMin: 1, maxTotalDelayMin: 10_020, adOnlyAfterMin: 1_380 })
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
    const r = parseCreateBot({ name: ' บอท ', tags: [' a '], channelIds: [U(1)], steps: [{ delayMin: 30, kind: 'TEXT', text: 'x' }] })
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
    const r = parseCreateBot(body({ name: '', salesStatuses: [], steps: [step({ text: '' })] }))
    expect(r.ok === false && codes(r.issues)).toEqual(['NAME_REQUIRED', 'NO_CONDITION', 'STEP_TEXT_REQUIRED'])
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

describe('TC-082/109 buildStepBubbles — ตัวเดียวกับตัวอย่างในแชท', () => {
  it('TEXT_IMAGE = ข้อความก่อน แล้วรูป · ตัวแปรแทนเหมือนกัน', () => {
    expect(buildStepBubbles({ kind: 'TEXT_IMAGE', text: 'สวัสดี{ชื่อ}', imageFileId: 'f1' }, 'ก')).toEqual({
      ok: true,
      bubbles: [{ type: 'TEXT', text: 'สวัสดีก' }, { type: 'IMAGE', fileId: 'f1' }],
    })
    expect(buildStepBubbles({ kind: 'TEXT', text: 'x', imageFileId: 'f1' }, null)).toEqual({ ok: true, bubbles: [{ type: 'TEXT', text: 'x' }] })
  })
  it('TC-109 มีแต่ {ชื่อ} แล้วไม่มีชื่อ → EMPTY_MESSAGE (แม้เป็น TEXT_IMAGE)', () => {
    expect(buildStepBubbles({ kind: 'TEXT', text: '{ชื่อ}', imageFileId: null }, null)).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' })
    expect(buildStepBubbles({ kind: 'TEXT_IMAGE', text: '{ชื่อ}', imageFileId: 'f' }, ' ')).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' })
  })
  it('TEXT_IMAGE ไม่มี fileId → IMAGE_MISSING', () => {
    expect(buildStepBubbles({ kind: 'TEXT_IMAGE', text: 'x', imageFileId: null }, null)).toEqual({ ok: false, reason: 'IMAGE_MISSING' })
  })
})

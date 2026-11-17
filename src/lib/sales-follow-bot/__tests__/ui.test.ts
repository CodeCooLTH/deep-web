// 00095 S-7 — ตรรกะ UI ของหน้าตั้งค่าบอท (ui.ts) · ทุกข้อต้องแดงเมื่อเอาเงื่อนไขในไฟล์จริงออก
import { describe, expect, it } from 'vitest'
import {
  addPartBlocker,
  appendFileIds,
  addRoundBlocker,
  buildPatch,
  channelConflictMap,
  emptyPart,
  firstIssueTarget,
  firstTextPreview,
  formatDuration,
  isDirty,
  isLiveIssue,
  issueTarget,
  joinDelay,
  limitList,
  moveBlocker,
  moveItem,
  needsActivateConfirm,
  needsStopConfirm,
  newDraft,
  previewRounds,
  sendOutcome,
  splitDelay,
  statusLock,
  structureChanged,
  timelineOf,
  toDraft,
  type BotLike,
  type Draft,
  type OtherBotLike,
} from '../ui'

const W = { day: 'วัน', hour: 'ชม.', minute: 'นาที' }
const bot = (o: Partial<BotLike> = {}): BotLike => ({
  name: 'ตามคนถามราคา',
  status: 'CLOSED',
  testRoomIds: [],
  conditionMatch: 'ALL',
  rules: [
    { field: 'stage', op: 'is', values: ['NOT_BOUGHT'] },
    { field: 'tag', op: 'has_any', values: [{ key: 'a', name: 'ถามราคา', missing: false }] },
  ],
  channelIds: ['ch1'],
  steps: [{ delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดีค่ะ คุณ{ชื่อ}' }] }],
  ...o,
})
const draftOf = (o: Partial<BotLike> = {}): Draft => toDraft(bot(o))

describe('เวลา', () => {
  it('splitDelay เลือกหน่วยใหญ่สุดที่หารลงตัว และ joinDelay กลับค่าเดิม', () => {
    expect(splitDelay(30)).toEqual({ value: 30, unit: 'MIN' })
    expect(splitDelay(180)).toEqual({ value: 3, unit: 'HOUR' })
    expect(splitDelay(1440)).toEqual({ value: 1, unit: 'DAY' })
    expect(splitDelay(1500)).toEqual({ value: 25, unit: 'HOUR' })
    expect(splitDelay(90)).toEqual({ value: 90, unit: 'MIN' })
    for (const m of [30, 180, 1440, 1500, 90, 10020]) {
      const s = splitDelay(m)
      expect(joinDelay(String(s.value), s.unit)).toBe(m)
    }
  })
  it('joinDelay: ว่าง/ทศนิยม/ลบ/ศูนย์ = 0 (ตกด่าน STEP_DELAY_MIN)', () => {
    for (const v of ['', ' ', '0', '-3', '1.5', 'abc']) expect(joinDelay(v, 'MIN')).toBe(0)
  })
  it('formatDuration ข้ามหน่วยที่เป็นศูนย์', () => {
    expect(formatDuration(1650, W)).toBe('1 วัน 3 ชม. 30 นาที')
    expect(formatDuration(300, W)).toBe('5 ชม.')
    expect(formatDuration(2880, W)).toBe('2 วัน')
    expect(formatDuration(0, W)).toBe('0 นาที')
  })
})

describe('uid (กัน hydration mismatch)', () => {
  it('รอบ/ชิ้นจาก toDraft และ newDraft ใช้ uid จากตำแหน่ง — เรียกกี่ครั้งก็ได้ค่าเดิม (ตัวนับ module ห้ามใช้)', () => {
    const a = toDraft(bot({ steps: [{ delayMin: 30, parts: [{ kind: 'TEXT', text: 'a' }, { kind: 'IMAGES', fileIds: ['f'] }] }, { delayMin: 5, parts: [{ kind: 'TEXT', text: 'b' }] }] }))
    expect(a.steps.map((s) => s.uid)).toEqual(['r0', 'r1'])
    expect(a.steps[0].parts.map((p) => p.uid)).toEqual(['r0p0', 'r0p1'])
    expect(JSON.stringify(toDraft(bot()))).toBe(JSON.stringify(toDraft(bot())))
    expect(JSON.stringify(newDraft())).toBe(JSON.stringify(newDraft()))
  })
})

describe('epoch ของ uid (ตัวแก้ข้อความ uncontrolled ต้อง remount เมื่อร่างถูกแทนทั้งก้อน)', () => {
  it('ร่างใหม่ต่าง epoch ไม่มี uid ซ้ำกับร่างเก่า — key ของตัวแก้เปลี่ยนแม้ตำแหน่งเดิม', () => {
    const b = bot({ steps: [{ delayMin: 5, parts: [{ kind: 'TEXT', text: 'a' }, { kind: 'TEXT', text: 'b' }] }] })
    const uids = (e: number) => toDraft(b, e).steps.flatMap((s) => [s.uid, ...s.parts.map((p) => p.uid)])
    const a = uids(0)
    const c = uids(1)
    expect(a.some((u) => c.includes(u))).toBe(false)
    expect(uids(1)).toEqual(uids(1))
    expect(newDraft(2).steps[0].parts[0].uid).not.toBe(newDraft(0).steps[0].parts[0].uid)
  })
})

describe('appendFileIds (อัปโหลดรูประหว่างผู้ใช้แก้ร่าง)', () => {
  const base = (): Draft => {
    const d = draftOf({ steps: [{ delayMin: 5, parts: [{ kind: 'IMAGES', fileIds: ['x'] }, { kind: 'TEXT', text: 'a' }] }] })
    return d
  }
  it('สองอัปโหลดต่อเนื่องบนร่างล่าสุดได้ครบทั้งคู่ (ไม่ใช่เหลือชิ้นเดียว)', () => {
    const d0 = base()
    const s = d0.steps[0].uid
    const p = d0.steps[0].parts[0].uid
    expect(appendFileIds(appendFileIds(d0, s, p, ['a']), s, p, ['b']).steps[0].parts[0].fileIds).toEqual(['x', 'a', 'b'])
  })
  it('ผู้ใช้แก้ข้อความ/ลบรูประหว่างรอ — ผลอัปโหลดต่อบนร่างใหม่ ไม่ทับการแก้', () => {
    const d0 = base()
    const s = d0.steps[0].uid
    const p = d0.steps[0].parts[0].uid
    const edited: Draft = { ...d0, steps: [{ ...d0.steps[0], parts: [{ ...d0.steps[0].parts[0], fileIds: [] }, { ...d0.steps[0].parts[1], text: 'แก้แล้ว' }] }] }
    const r = appendFileIds(edited, s, p, ['new'])
    expect(r.steps[0].parts[0].fileIds).toEqual(['new'])
    expect(r.steps[0].parts[1].text).toBe('แก้แล้ว')
  })
  it('ชิ้นถูกลบไปแล้ว = ไม่เปลี่ยนร่าง · เกิน 5 รูปตัดทิ้ง', () => {
    const d0 = base()
    expect(appendFileIds(d0, d0.steps[0].uid, 'gone', ['a'])).toEqual(d0)
    const many = appendFileIds(d0, d0.steps[0].uid, d0.steps[0].parts[0].uid, ['1', '2', '3', '4', '5', '6'])
    expect(many.steps[0].parts[0].fileIds).toHaveLength(5)
  })
})

describe('dirty / patch', () => {
  it('ไม่แก้อะไร = ไม่ dirty · PATCH ว่าง', () => {
    expect(isDirty(draftOf(), draftOf())).toBe(false)
    expect(buildPatch(draftOf(), draftOf())).toEqual({})
  })
  it('PATCH ส่งเฉพาะฟิลด์ที่เปลี่ยน — แท็กที่ถูกลบไม่ถูกส่งซ้ำถ้าไม่ได้แตะกฎ', () => {
    const base = bot({ rules: [{ field: 'tag', op: 'has_any', values: [{ key: 'v', name: 'vip', missing: true }, { key: 'a', name: 'ถามราคา', missing: false }] }] })
    const cur = toDraft(base)
    cur.name = 'ชื่อใหม่'
    expect(buildPatch(toDraft(base), cur)).toEqual({ name: 'ชื่อใหม่' })
  })
  it('แก้ข้อความของรอบ = steps เปลี่ยน', () => {
    const cur = draftOf()
    cur.steps[0].parts[0].text = 'ข้อความใหม่'
    expect(Object.keys(buildPatch(draftOf(), cur))).toEqual(['steps'])
  })
  it('เปลี่ยนสถานะ/ห้องทดสอบ = dirty แม้ฟิลด์ไม่เปลี่ยน', () => {
    const cur = draftOf()
    cur.status = 'TESTING'
    expect(isDirty(draftOf(), cur)).toBe(true)
    expect(buildPatch(draftOf(), cur)).toEqual({})
    const t1 = draftOf({ status: 'TESTING', testRoomIds: ['r1'] })
    const t2 = draftOf({ status: 'TESTING', testRoomIds: ['r2'] })
    expect(isDirty(t1, t2)).toBe(true)
  })
})

describe('statusLock / ยืนยัน', () => {
  it('บอทใหม่ล็อกเสมอ · มีฟิลด์ค้างและยังไม่แตะสถานะ = ล็อก · แตะสถานะก่อนแล้วไม่ล็อก', () => {
    expect(statusLock({ isNew: true, original: newDraft(), current: newDraft() })).toBe('NEW')
    const cur = draftOf()
    cur.name = 'x'
    expect(statusLock({ isNew: false, original: draftOf(), current: cur })).toBe('DIRTY')
    expect(statusLock({ isNew: false, original: draftOf(), current: draftOf() })).toBeNull()
    cur.status = 'ACTIVE'
    expect(statusLock({ isNew: false, original: draftOf(), current: cur })).toBeNull()
  })
  it('ถามก่อนเปิดใช้เฉพาะตอนเปลี่ยนเข้า ACTIVE', () => {
    expect(needsActivateConfirm('CLOSED', 'ACTIVE')).toBe(true)
    expect(needsActivateConfirm('TESTING', 'ACTIVE')).toBe(true)
    expect(needsActivateConfirm('ACTIVE', 'ACTIVE')).toBe(false)
    expect(needsActivateConfirm('CLOSED', 'TESTING')).toBe(false)
  })
  it('ถามก่อนหยุดแชทเมื่อแก้โครงรอบ + มีแชทที่ตามอยู่ · แก้แค่ถ้อยคำ/เวลา/ชื่อรูป = ไม่ถาม', () => {
    const wording = draftOf()
    wording.steps[0].parts[0].text = 'ถ้อยคำใหม่'
    wording.steps[0].value = '45'
    expect(structureChanged(draftOf(), wording)).toBe(false)
    expect(needsStopConfirm({ original: draftOf(), current: wording, activeRunCount: 5 })).toBe(false)

    const shape = draftOf()
    shape.steps[0].parts.push(emptyPart('IMAGES'))
    expect(structureChanged(draftOf(), shape)).toBe(true)
    expect(needsStopConfirm({ original: draftOf(), current: shape, activeRunCount: 5 })).toBe(true)
    expect(needsStopConfirm({ original: draftOf(), current: shape, activeRunCount: 0 })).toBe(false)
  })
})

describe('เพิ่มรอบ/ชิ้น · เลื่อน', () => {
  it('ครบ 10 รอบ = MAX_ROUNDS · เวลาสะสมเต็ม = MAX_TOTAL · ปกติ = null', () => {
    const d = draftOf()
    expect(addRoundBlocker(d)).toBeNull()
    const full = draftOf({ steps: Array.from({ length: 10 }, () => ({ delayMin: 30, parts: [{ kind: 'TEXT' as const, text: 'a' }] })) })
    expect(addRoundBlocker(full)).toBe('MAX_ROUNDS')
    const maxed = draftOf({ steps: [{ delayMin: 10020, parts: [{ kind: 'TEXT', text: 'a' }] }] })
    expect(addRoundBlocker(maxed)).toBe('MAX_TOTAL')
    const almost = draftOf({ steps: [{ delayMin: 10019, parts: [{ kind: 'TEXT', text: 'a' }] }] })
    expect(addRoundBlocker(almost)).toBeNull()
  })
  it('ครบ 5 ชิ้น = MAX_PARTS', () => {
    const s = draftOf().steps[0]
    expect(addPartBlocker(s)).toBeNull()
    s.parts = Array.from({ length: 5 }, () => emptyPart('TEXT'))
    expect(addPartBlocker(s)).toBe('MAX_PARTS')
  })
  it('moveBlocker + moveItem', () => {
    expect(moveBlocker(0, 3)).toEqual({ up: 'FIRST', down: null, remove: null })
    expect(moveBlocker(2, 3)).toEqual({ up: null, down: 'LAST', remove: null })
    expect(moveBlocker(0, 1)).toEqual({ up: 'FIRST', down: 'LAST', remove: 'ONLY' })
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })
  it('timelineOf: สะสม + adOnly เมื่อ >1,380 นาที (ตัวเดียวกับ server)', () => {
    const d = draftOf({
      steps: [
        { delayMin: 30, parts: [{ kind: 'TEXT', text: 'a' }] },
        { delayMin: 1350, parts: [{ kind: 'TEXT', text: 'b' }] },
        { delayMin: 1, parts: [{ kind: 'TEXT', text: 'c' }] },
      ],
    })
    const t = timelineOf(d)
    expect(t.cumulative).toEqual([30, 1380, 1381])
    expect(t.adOnly).toEqual([false, false, true])
    expect(t.total).toBe(1381)
  })
})

describe('ช่องทางชน (AC-FB-20)', () => {
  const others: OtherBotLike[] = [
    { id: 'b1', name: 'ตามคนซื้อ', status: 'ACTIVE', channelIds: ['ch1', 'ch2'], conditionMatch: 'ALL', rules: [{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }] },
    { id: 'b2', name: 'ปิดอยู่', status: 'CLOSED', channelIds: ['ch3'], conditionMatch: 'ALL', rules: [{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }] },
  ]
  it('ล็อกช่องของบอทอื่นที่สถานะซ้อน · บอทปิดไม่ล็อก · สถานะไม่ซ้อนไม่ล็อก', () => {
    const d = draftOf()
    const m = channelConflictMap(d, null, ['ch1', 'ch2', 'ch3'], others)
    expect([...m.keys()].sort()).toEqual(['ch1', 'ch2'])
    expect(m.get('ch1')).toEqual({ botId: 'b1', botName: 'ตามคนซื้อ' })
    d.rules = [{ uid: 'q0', field: 'stage', op: 'is', values: ['BILLED'] }]
    expect(channelConflictMap(d, null, ['ch1'], others).size).toBe(0)
  })
  it('ไม่นับบอทตัวเอง', () => {
    expect(channelConflictMap(draftOf(), 'b1', ['ch1'], others).size).toBe(0)
  })
})

describe('issue → จุดที่ชี้', () => {
  it('จัดกลุ่มตาม code/stepIndex/partIndex', () => {
    expect(issueTarget({ code: 'NAME_REQUIRED', path: 'name' })).toEqual({ kind: 'name' })
    expect(issueTarget({ code: 'NO_CONDITION', path: 'salesStatuses' })).toEqual({ kind: 'condition' })
    expect(issueTarget({ code: 'CHANNELS_REQUIRED', path: 'channelIds' })).toEqual({ kind: 'channels' })
    expect(issueTarget({ code: 'STEP_DELAY_MIN', path: 'x', stepIndex: 2 })).toEqual({ kind: 'step', stepIndex: 2 })
    expect(issueTarget({ code: 'PART_TEXT_REQUIRED', path: 'x', stepIndex: 1, partIndex: 0 })).toEqual({ kind: 'part', stepIndex: 1, partIndex: 0 })
    expect(issueTarget({ code: 'STEPS_COUNT', path: 'steps' })).toEqual({ kind: 'steps' })
  })
  it('เลื่อนไปจุดผิดแรกตามลำดับหน้า (ชื่อ → เงื่อนไข → ช่อง → รอบ/ชิ้น)', () => {
    expect(
      firstIssueTarget([
        { code: 'PART_TEXT_REQUIRED', path: '', stepIndex: 1, partIndex: 0 },
        { code: 'PART_TEXT_REQUIRED', path: '', stepIndex: 0, partIndex: 2 },
        { code: 'CHANNELS_REQUIRED', path: '' },
      ]),
    ).toEqual({ kind: 'channels' })
    expect(
      firstIssueTarget([
        { code: 'PART_TEXT_REQUIRED', path: '', stepIndex: 1, partIndex: 0 },
        { code: 'PART_TEXT_REQUIRED', path: '', stepIndex: 0, partIndex: 2 },
      ]),
    ).toEqual({ kind: 'part', stepIndex: 0, partIndex: 2 })
    expect(firstIssueTarget([])).toBeNull()
  })
  it('ตัวแปรที่ไม่รองรับ/ยาวเกิน/ชื่อยาวเกิน โชว์ทันที · อย่างอื่นรอกดบันทึก', () => {
    expect(isLiveIssue({ code: 'UNKNOWN_VARIABLE', path: '' })).toBe(true)
    expect(isLiveIssue({ code: 'PART_TEXT_TOO_LONG', path: '' })).toBe(true)
    expect(isLiveIssue({ code: 'PART_TEXT_REQUIRED', path: '' })).toBe(false)
    expect(isLiveIssue({ code: 'NAME_REQUIRED', path: '' })).toBe(false)
  })
})

describe('รายการ/ประวัติ', () => {
  it('limitList', () => {
    expect(limitList([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2, 3], rest: 1 })
    expect(limitList([1], 3)).toEqual({ shown: [1], rest: 0 })
  })
  it('firstTextPreview แทน {ชื่อ} · ข้ามชิ้นที่ไม่ใช่ข้อความ · ไม่มีข้อความ = null', () => {
    expect(firstTextPreview(bot().steps, 'สมชาย')).toBe('สวัสดีค่ะ คุณสมชาย')
    expect(firstTextPreview([{ delayMin: 1, parts: [{ kind: 'IMAGES', fileIds: ['a'] }, { kind: 'TEXT', text: 'ตามนะคะ' }] }], 'สมชาย')).toBe('ตามนะคะ')
    expect(firstTextPreview([{ delayMin: 1, parts: [{ kind: 'IMAGES', fileIds: ['a'] }] }], 'สมชาย')).toBeNull()
    expect(firstTextPreview([], 'สมชาย')).toBeNull()
  })
  it('sendOutcome: เขียวเฉพาะส่งแล้ว · ไม่แน่ใจ = warn ไม่ใช่ err', () => {
    expect(sendOutcome('SENT', null)).toEqual({ tone: 'ok', key: 'sent' })
    expect(sendOutcome('SKIPPED', 'LINE_QUOTA_FULL')).toEqual({ tone: 'warn', key: 'skipped' })
    expect(sendOutcome('FAILED', 'PLATFORM_REJECTED')).toEqual({ tone: 'err', key: 'failed' })
    expect(sendOutcome('FAILED', 'UNCERTAIN_SEND')).toEqual({ tone: 'warn', key: 'uncertain' })
    expect(sendOutcome('SENDING', null)).toEqual({ tone: 'idle', key: 'sending' })
  })
})

describe('ตัวอย่างในแชท', () => {
  it('ทุกรอบมีโครงเวลา · รอบว่าง = empty · QM ที่ถูกลบ = GONE และไม่นับเป็นฟอง', () => {
    const d = draftOf({
      steps: [
        { delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดี {ชื่อ}' }, { kind: 'IMAGES', fileIds: ['f1'] }] },
        { delayMin: 60, parts: [{ kind: 'QUICK_MESSAGE', quickMessageId: 'gone' }] },
        { delayMin: 60, parts: [{ kind: 'TEXT', text: '' }] },
      ],
    })
    const r = previewRounds(d, new Map(), 'สมชาย')
    expect(r).toHaveLength(3)
    expect(r[0].bubbles).toEqual([{ type: 'TEXT', text: 'สวัสดี สมชาย' }, { type: 'IMAGES', fileIds: ['f1'] }])
    expect(r[0].empty).toBe(false)
    expect(r[1].empty).toBe(true)
    expect(r[2].empty).toBe(true)
    expect(r.map((x) => x.cumulativeMin)).toEqual([30, 90, 150])
  })
  it('QM ที่ยังอยู่ = ฟองข้อความของ QM', () => {
    const d = draftOf({ steps: [{ delayMin: 5, parts: [{ kind: 'QUICK_MESSAGE', quickMessageId: 'q1' }] }] })
    const r = previewRounds(d, new Map([['q1', { id: 'q1', title: 'โปร', bodyPreview: 'ส่งฟรี', thumbUrl: null, imageCount: 1 }]]), 'สมชาย')
    expect(r[0].bubbles).toEqual([{ type: 'QUICK', text: 'ส่งฟรี', thumbUrl: null, imageCount: 1 }])
  })
})

// ───────────────────────── redesign A ─────────────────────────
import { avatarInitial, ruleSentenceSegments, groupChannelsByPage, neverMatches, removeGoneTags, ruleSentence, sectionStates, firstAdOnlyIndex, draftStepPreview, emptyStep, stepDelayMin } from '../ui'

describe('sectionStates', () => {
  const ok = (): ReturnType<typeof toDraft> =>
    toDraft({ name: 'x', status: 'CLOSED', testRoomIds: [], conditionMatch: 'ALL', rules: [{ field: 'stage', op: 'is', values: ['NOT_BOUGHT'] }], channelIds: ['c1'], steps: [{ delayMin: 30, parts: [{ kind: 'TEXT', text: 'สวัสดี' }] }] })
  it('ครบ = done ทั้ง 4 · แท็กถูกลบ = ส่วน 1 warn · ช่องชน = ส่วน 2 todo', () => {
    expect(sectionStates(ok(), false)).toEqual({ who: 'done', via: 'done', what: 'done', end: 'done' })
    expect(sectionStates({ ...ok(), rules: [...ok().rules, { uid: 'q9', field: 'tag', op: 'has_any', values: [{ key: 'v', name: 'vip', missing: true }] }] }, false).who).toBe('warn')
    expect(sectionStates(ok(), true).via).toBe('todo')
  })
  it('ผิดตามส่วน: ไม่มีเงื่อนไข · ไม่มีช่อง · ข้อความว่าง · เวลารอหลังตามครบผิด', () => {
    expect(sectionStates({ ...ok(), rules: [] }, false).who).toBe('todo')
    expect(sectionStates({ ...ok(), channelIds: [] }, false).via).toBe('todo')
    const d = ok()
    expect(sectionStates({ ...d, steps: [{ ...d.steps[0], parts: [{ ...d.steps[0].parts[0], text: '' }] }] }, false).what).toBe('todo')
    expect(sectionStates({ ...d, finalValue: '' }, false).end).toBe('todo')
  })
})
describe('removeGoneTags', () => {
  it('เอาเฉพาะแท็กที่ missing ออก · แถวที่ไม่เหลือแท็กเลยถูกตัดทิ้ง · แถวสถานะอยู่ครบ', () => {
    const d = {
      ...newDraft(),
      rules: [
        { uid: 'q0', field: 'stage' as const, op: 'is' as const, values: ['BILLED' as const] },
        { uid: 'q1', field: 'tag' as const, op: 'has_any' as const, values: [{ key: 'a', name: 'a', missing: false }, { key: 'v', name: 'v', missing: true }] },
        { uid: 'q2', field: 'tag' as const, op: 'has_none' as const, values: [{ key: 'w', name: 'w', missing: true }] },
      ],
    }
    const r = removeGoneTags(d).rules
    expect(r.map((x) => x.uid)).toEqual(['q0', 'q1'])
    expect(r[1].values).toEqual([{ key: 'a', name: 'a', missing: false }])
  })
})
describe('groupChannelsByPage', () => {
  it('Messenger+IG ชื่อเดียวกัน = กลุ่มเดียว · LINE ชื่อเดียวกันก็แยก · คงลำดับ · เอารูปแรกที่มี', () => {
    const g = groupChannelsByPage([
      { id: '1', provider: 'MESSENGER', name: 'ร้านนุ่น', avatarUrl: null },
      { id: '2', provider: 'LINE', name: 'ร้านนุ่น', avatarUrl: 'l.png' },
      { id: '3', provider: 'INSTAGRAM', name: 'ร้านนุ่น ', avatarUrl: 'i.png' },
    ])
    expect(g.map((x) => x.channels.map((c) => c.id))).toEqual([['1', '3'], ['2']])
    expect(g[0].avatarUrl).toBe('i.png')
  })
})
describe('firstAdOnlyIndex · draftStepPreview', () => {
  it('หมายเหตุโฆษณาโชว์ที่รอบแรกที่เป็น adOnly เท่านั้น', () => {
    expect(firstAdOnlyIndex([false, false, true, true])).toBe(2)
    expect(firstAdOnlyIndex([false, false])).toBe(-1)
  })
  it('ข้อความแรกที่ไม่ว่าง · ไม่มี = null', () => {
    const st = (parts: Array<{ kind: string; text?: string }>) => ({ ...emptyStep(), parts: parts.map((p) => ({ ...emptyPart('TEXT'), ...p })) }) as never
    expect(draftStepPreview(st([{ kind: 'TEXT', text: '  ' }, { kind: 'TEXT', text: ' สวัสดี ' }]))).toBe('สวัสดี')
    expect(draftStepPreview(st([{ kind: 'IMAGES' }]))).toBeNull()
  })
  it('สลับรอบ: เวลารอเดินตามรอบ (delay อยู่ในรอบ) · รอบแรกเป็นรอบที่ย้ายขึ้นมา', () => {
    const a = { ...emptyStep(), value: '1', unit: 'HOUR' as const }
    const b = { ...emptyStep(), value: '2', unit: 'DAY' as const }
    const out = moveItem([a, b], 1, 0)
    expect(out.map((x) => stepDelayMin(x))).toEqual([2880, 60])
  })
})

describe('FR-FA-8 ruleSentence · neverMatches', () => {
  const w = { and: 'และ', or: 'หรือ', not: 'ไม่ใช่', hasTag: 'มีแท็ก', noTag: 'ไม่มีแท็ก' }
  const lab = (k: string) => ({ NOT_BOUGHT: 'ยังไม่ซื้อ', BILLED: 'เปิดบิล' })[k as 'BILLED'] ?? k
  const tg = (name: string, missing = false) => ({ key: name, name, missing })
  it('ประโยคตามตัวอย่างที่ผู้ใช้เลือก: ยังไม่ซื้อ และ ไม่มีแท็ก รอคีย์ออเดอร์ และ มีแท็ก สนใจ หรือ ถามราคา', () => {
    const s = ruleSentence(
      [
        { field: 'stage', op: 'is', values: ['NOT_BOUGHT'] },
        { field: 'tag', op: 'has_none', values: [tg('รอคีย์ออเดอร์')] },
        { field: 'tag', op: 'has_any', values: [tg('สนใจ'), tg('ถามราคา')] },
      ],
      'ALL',
      w,
      lab,
    )
    expect(s).toBe('ยังไม่ซื้อ และ ไม่มีแท็ก รอคีย์ออเดอร์ และ มีแท็ก สนใจ หรือ ถามราคา')
  })
  it('ANY ใช้ "หรือ" · has_all ใช้ "และ" ในแถว · is_not ใส่ "ไม่ใช่" · แถวไม่มีค่าไม่ออกเสียง', () => {
    expect(ruleSentence([{ field: 'stage', op: 'is_not', values: ['BILLED'] }, { field: 'tag', op: 'has_all', values: [tg('a'), tg('b')] }, { field: 'tag', op: 'has_any', values: [] }], 'ANY', w, lab)).toBe('ไม่ใช่ เปิดบิล หรือ มีแท็ก a และ b')
  })
  it('neverMatches: has_all ที่แท็กหาย / has_any ที่หายหมด · ALL = แถวใดแถวหนึ่ง · ANY = ทุกแถว', () => {
    const dead = { field: 'tag' as const, op: 'has_all' as const, values: [tg('a'), tg('g', true)] }
    const alive = { field: 'stage' as const, op: 'is' as const, values: ['BILLED' as const] }
    expect(neverMatches([alive, dead], 'ALL')).toBe(true)
    expect(neverMatches([alive, dead], 'ANY')).toBe(false)
    expect(neverMatches([dead], 'ANY')).toBe(true)
    expect(neverMatches([{ field: 'tag', op: 'has_none', values: [tg('g', true)] }], 'ALL')).toBe(false)
  })
})

describe('avatarInitial · ruleSentenceSegments', () => {
  it('ข้ามเครื่องหมาย/ตัวเลขนำหน้า · อักษรไทยนับ · ไม่มีตัวอักษร = ?', () => {
    expect(avatarInitial('[QA00095] ร้าน')).toBe('Q')
    expect(avatarInitial('  ร้านนุ่น')).toBe('ร')
    expect(avatarInitial('123 !!')).toBe('?')
  })
  it('ชื่อแท็กที่ถูกลบมี gone=true และต่อชิ้นกลับได้เท่า ruleSentence', () => {
    const w = { and: 'และ', or: 'หรือ', not: 'ไม่ใช่', hasTag: 'มีแท็ก', noTag: 'ไม่มีแท็ก' }
    const rules = [{ field: 'tag' as const, op: 'has_any' as const, values: [{ key: 'a', name: 'a', missing: false }, { key: 'b', name: 'b', missing: true }] }]
    const segs = ruleSentenceSegments(rules, 'ALL', w, (k) => k)
    expect(segs.filter((x) => x.gone).map((x) => x.text)).toEqual(['b'])
    expect(segs.map((x) => x.text).join('')).toBe(ruleSentence(rules, 'ALL', w, (k) => k))
  })
})

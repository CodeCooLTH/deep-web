/**
 * เทสของ product-sales-month (feature 00063 — รายงานยอดขายรายสินค้า)
 *
 * 🛑 [blocker] — ป้ายสรุปบนแถวสินค้าคือ "โค้ดที่ตีความข้อมูลแทนผู้ขาย" ถ้าเกณฑ์เพี้ยน
 * มันจะไม่พังเสียงดัง มันจะพูดคำที่ฟังดูมั่นใจแล้วผิด (เช่นบอกว่า "ขายกระจุก" จากข้อมูล 2 ใบ)
 * ซึ่งไม่มี tsc/build/theme-guard/grep ตัวไหนจับได้เลยเพราะทุกบรรทัดถูกต้องตามชนิด
 *
 * ทุก describe ที่ติด [blocker] ถูกพิสูจน์ด้วย mutation แล้ว — คืนตรรกะผิดกลับไปต้องแดง
 * (docs/conventions/mutation-silence-means-weak-corpus.md: "เขียวหลัง mutation" แปลว่า
 *  ชุด input อ่อน ไม่ใช่ mutation ไม่เกี่ยว)
 */
import { describe, expect, it } from 'vitest'

import {
  CHART_COLOR_TOKENS,
  CHART_SERIES_CAP,
  CONCENTRATED_TOP_DAYS,
  DORMANT_DAY_THRESHOLD,
  MIN_EVENTS_FOR_PATTERN,
  RUNOUT_MAX_DAYS,
  RUNOUT_WARN_DAYS,
  bestDay,
  classifySalesPattern,
  dayIntensity,
  daysInMonth,
  estimateRunoutDays,
  futureFromDayIndex,
  isCurrentThaiMonth,
  lastSoldIndex,
  monthThirds,
  monthThirdsAriaLabel,
  parseMonthParam,
  referenceDayIndex,
  salesPatternLabel,
  shareOfTotalPct,
  shiftMonthIso,
  sortProductRows,
  toDense,
  toSparse,
} from '../product-sales-month'

/** สร้าง array ยอดรายวันความยาว n โดยระบุเฉพาะวันที่มียอด */
function daily(n: number, entries: Record<number, number>): number[] {
  const out = new Array<number>(n).fill(0)
  for (const [k, v] of Object.entries(entries)) out[Number(k)] = v
  return out
}

describe('[blocker] classifySalesPattern — ด่านกันการติดป้ายจากข้อมูลที่น้อยเกินไป', () => {
  it('ขายได้ 2 ครั้ง = ไม่ติดป้าย แม้รูปร่างจะกระจุกชัดเจน', () => {
    // ยอดทั้งเดือนอยู่วันเดียว = กระจุกที่สุดเท่าที่เป็นไปได้ แต่ข้อมูลน้อยเกินจะสรุป
    const d = daily(31, { 0: 50 })
    expect(classifySalesPattern(d, 2, 30)).toEqual({ kind: 'NONE' })
  })

  it('ขายได้ครบ 3 ครั้งแล้วรูปร่างเดิมเป๊ะ = ติดป้ายได้', () => {
    const d = daily(31, { 0: 50 })
    // เงียบตั้งแต่วันที่ 2 ถึงวันที่ 31 = 30 วัน ⇒ DORMANT ชนะ (ดู describe ถัดไป)
    expect(classifySalesPattern(d, 3, 30).kind).toBe('DORMANT')
  })

  it('ขอบเขตพอดี: MIN_EVENTS_FOR_PATTERN - 1 เงียบ, พอดีเกณฑ์ติดป้าย', () => {
    // วันที่ 29,30,31 มียอด (index 28,29,30) → ไม่เงียบ, ยอดกระจุก 3 วัน
    const d = daily(31, { 28: 5, 29: 5, 30: 5 })
    expect(classifySalesPattern(d, MIN_EVENTS_FOR_PATTERN - 1, 30)).toEqual({ kind: 'NONE' })
    expect(classifySalesPattern(d, MIN_EVENTS_FOR_PATTERN, 30).kind).toBe('CONCENTRATED')
  })

  it('ยอดรวมเป็น 0 ทั้งที่นับครั้งได้ (ของแถม/ยกเลิกรายการ) = ไม่ติดป้าย ไม่ระเบิด', () => {
    expect(classifySalesPattern(daily(31, {}), 9, 30)).toEqual({ kind: 'NONE' })
  })
})

describe('[blocker] classifySalesPattern — ลำดับความสำคัญของป้ายเมื่อเข้าหลายเกณฑ์', () => {
  it('เงียบ ≥14 วัน ชนะ "ขายกระจุก" — ของที่หายไปสองสัปดาห์คือสิ่งที่ต้องไปดู', () => {
    // ขายวันที่ 1-3 แล้วเงียบยาว: เข้าทั้ง CONCENTRATED และ DORMANT
    const d = daily(31, { 0: 10, 1: 10, 2: 10 })
    const r = classifySalesPattern(d, 6, 30)
    expect(r).toEqual({ kind: 'DORMANT', days: 28, toMonthEnd: false })
  })

  it('เงียบ 13 วัน (ต่ำกว่าเกณฑ์ 1 วัน) ยังไม่ใช่ DORMANT → ตกไป CONCENTRATED', () => {
    // ยอดอยู่ที่ index 17 ล้วน, อ้างอิงวันที่ index 30 ⇒ เงียบ 13 วัน
    const d = daily(31, { 16: 4, 17: 30 })
    expect(classifySalesPattern(d, 5, 30 - (DORMANT_DAY_THRESHOLD - 13)).kind).not.toBe('DORMANT')
  })

  it('ขอบเขตพอดีของ DORMANT: เงียบเท่าเกณฑ์เป๊ะ = เข้า DORMANT', () => {
    const last = 10
    const d = daily(31, { 0: 3, 5: 3, [last]: 3 })
    const r = classifySalesPattern(d, 5, last + DORMANT_DAY_THRESHOLD)
    expect(r).toEqual({ kind: 'DORMANT', days: DORMANT_DAY_THRESHOLD, toMonthEnd: false })

    const r2 = classifySalesPattern(d, 5, last + DORMANT_DAY_THRESHOLD - 1)
    expect(r2.kind).not.toBe('DORMANT')
  })

  it('"ขายกระจุก" ชนะ "ขายสม่ำเสมอ" เมื่อเข้าทั้งคู่ (user เคาะ 2026-08-29)', () => {
    // ขายทุกวัน 30 วัน (เข้า STEADY) แต่วันที่ 30 มีออเดอร์ก้อนใหญ่จนกินเกินครึ่ง (เข้า CONCENTRATED)
    const d = daily(30, {})
    for (let i = 0; i < 30; i++) d[i] = 1
    d[29] = 100
    expect(classifySalesPattern(d, 40, 29)).toEqual({ kind: 'CONCENTRATED' })
  })

  it('ขายสม่ำเสมอจริง ๆ (ไม่มีวันไหนโดด) = STEADY', () => {
    const d = daily(30, {})
    for (let i = 0; i < 30; i++) d[i] = 2
    expect(classifySalesPattern(d, 40, 29)).toEqual({ kind: 'STEADY' })
  })

  it('กระจุกพอดี 50% เป๊ะ = ไม่ใช่ "กระจุก" (ต้องมากกว่าครึ่ง ไม่ใช่เท่าครึ่ง)', () => {
    // 6 วันมียอดเท่ากันหมด → 3 วันแรกรวมกันได้ 50% พอดี
    const d = daily(10, { 0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 })
    const r = classifySalesPattern(d, 6, 5)
    expect(r.kind).not.toBe('CONCENTRATED')
    // 6 จาก 10 วัน > ครึ่ง ⇒ STEADY
    expect(r.kind).toBe('STEADY')
  })

  it('ขายกระจายแต่ไม่ถึงครึ่งเดือน และไม่กระจุก = ไม่ติดป้าย', () => {
    // 4 วันจาก 31 วัน, ยอดเท่ากัน ⇒ top3 = 3/4 ของยอด > ครึ่ง ⇒ กระจุก
    // ปรับให้ยอดกระจายพอไม่กระจุก: 8 วัน ยอดเท่ากัน ⇒ top3 = 3/8 < ครึ่ง, 8 < 31/2
    const d = daily(31, { 0: 1, 3: 1, 6: 1, 9: 1, 12: 1, 15: 1, 18: 1, 21: 1 })
    expect(classifySalesPattern(d, 8, 22)).toEqual({ kind: 'NONE' })
  })
})

describe('[blocker] คำของ DORMANT ต้องบอกว่านับถึงเมื่อไร', () => {
  /**
   * 🛑 "เงียบมาแล้ว N วัน" อ่านว่า "นับถึงวันนี้" เสมอ — แต่ในเดือนย้อนหลัง วันอ้างอิงคือ
   * สิ้นเดือนนั้น ⇒ สินค้าที่ขายครั้งสุดท้าย 11 มิ.ย. 2568 จะถูกป้ายว่า "เงียบมาแล้ว 19 วัน"
   * ซึ่งผู้อ่านเข้าใจว่าเงียบมา 19 วันนับถึงตอนนี้ ทั้งที่ความจริงคือเงียบ 19 วันท้ายเดือนนั้น
   * (พบโดย /impeccable critique 2026-08-29)
   */
  const d = daily(31, { 0: 10, 1: 10, 2: 10 })

  it('เดือนปัจจุบัน (refIsMonthEnd=false) → "เงียบมาแล้ว N วัน"', () => {
    const p = classifySalesPattern(d, 6, 30, false)
    expect(p).toEqual({ kind: 'DORMANT', days: 28, toMonthEnd: false })
    expect(salesPatternLabel(p)).toBe('เงียบมาแล้ว 28 วัน')
  })

  it('เดือนย้อนหลัง (refIsMonthEnd=true) → "เงียบ N วันท้ายเดือน" ไม่ใช่ "มาแล้ว"', () => {
    const p = classifySalesPattern(d, 6, 30, true)
    expect(p).toEqual({ kind: 'DORMANT', days: 28, toMonthEnd: true })
    expect(salesPatternLabel(p)).toBe('เงียบ 28 วันท้ายเดือน')
  })

  it('ธงมีผลกับ *คำ* เท่านั้น ห้ามเปลี่ยนการตัดสิน', () => {
    const a = classifySalesPattern(d, 6, 30, false)
    const b = classifySalesPattern(d, 6, 30, true)
    expect(a.kind).toBe(b.kind)
    expect(a.kind === 'DORMANT' && b.kind === 'DORMANT' && a.days === b.days).toBe(true)
  })

  it('ป้ายอื่นไม่ได้รับผลจากธงนี้', () => {
    const steady = daily(30, {})
    for (let i = 0; i < 30; i++) steady[i] = 2
    expect(salesPatternLabel(classifySalesPattern(steady, 40, 29, true))).toBe('ขายสม่ำเสมอ')
  })
})

describe('salesPatternLabel — คำต้องผูกกับชนิดของป้าย ไม่ใช่พิมพ์ซ้ำที่ component', () => {
  it('DORMANT ใส่จำนวนวันจริงลงในคำ', () => {
    expect(salesPatternLabel({ kind: 'DORMANT', days: 21 })).toBe('เงียบมาแล้ว 21 วัน')
  })
  it('NONE ไม่มีคำ — ไม่ใช่สตริงว่าง (หน้าจอต้องแยก "ไม่มีป้าย" ออกจาก "ป้ายว่าง")', () => {
    expect(salesPatternLabel({ kind: 'NONE' })).toBeNull()
  })
})

describe('[blocker] parseMonthParam — ลิงก์ที่ผิดรูปต้องไม่พาไปหน้าพัง', () => {
  const now = new Date('2026-08-29T03:00:00.000Z') // 10:00 น. เวลาไทย

  it('ไม่ส่งค่ามา = เดือนปัจจุบันตามเวลาไทย', () => {
    expect(parseMonthParam(undefined, now)).toEqual({
      year: 2026, month0: 7, iso: '2026-08', clamped: false,
    })
  })

  it('เวลาไทยข้ามวันข้ามเดือนก่อน UTC — 31 ส.ค. 20:00 UTC = 1 ก.ย. ที่ไทย', () => {
    const edge = new Date('2026-08-31T20:00:00.000Z')
    expect(parseMonthParam(undefined, edge).iso).toBe('2026-09')
  })

  it('รูปแบบผิด = ถอยไปเดือนปัจจุบัน + ติดธง clamped (ไม่ throw)', () => {
    for (const bad of ['2026-13', '26-08', 'สิงหาคม', '2026/08', '2026-00', '']) {
      const r = parseMonthParam(bad, now)
      expect(r.iso).toBe('2026-08')
      if (bad !== '') expect(r.clamped).toBe(true)
    }
  })

  it('เกินเพดานบน (เดือนปัจจุบัน +2) = clamped', () => {
    expect(parseMonthParam('2026-10', now).clamped).toBe(true)
  })

  it('เดือนถัดไปพอดี = ใช้ได้ ไม่ clamp (ออเดอร์คีย์ล่วงหน้า 7 วันตกไปเดือนหน้าได้จริง)', () => {
    expect(parseMonthParam('2026-09', now)).toEqual({
      year: 2026, month0: 8, iso: '2026-09', clamped: false,
    })
  })

  it('ต่ำกว่าเพดานล่าง = clamped', () => {
    expect(parseMonthParam('2019-05', now).clamped).toBe(true)
  })

  it('เดือนย้อนหลังปกติ = ผ่าน', () => {
    expect(parseMonthParam('2026-02', now)).toEqual({
      year: 2026, month0: 1, iso: '2026-02', clamped: false,
    })
  })
})

describe('shiftMonthIso — ปุ่ม ‹ › ต้องข้ามปีได้ถูก', () => {
  it('ถอยข้ามปี', () => expect(shiftMonthIso('2026-01', -1)).toBe('2025-12'))
  it('เดินหน้าข้ามปี', () => expect(shiftMonthIso('2026-12', 1)).toBe('2027-01'))
  it('ถอยหลายเดือนข้ามปี', () => expect(shiftMonthIso('2026-02', -14)).toBe('2024-12'))
})

describe('daysInMonth — จำนวนช่องของแถบต้องตรงปฏิทินจริง ไม่ใช่ 31 ตายตัว', () => {
  it('กุมภาพันธ์ปีอธิกสุรทิน', () => expect(daysInMonth(2024, 1)).toBe(29))
  it('กุมภาพันธ์ปีปกติ', () => expect(daysInMonth(2026, 1)).toBe(28))
  it('เมษายน', () => expect(daysInMonth(2026, 3)).toBe(30))
  it('ธันวาคม', () => expect(daysInMonth(2026, 11)).toBe(31))
})

describe('[blocker] futureFromDayIndex — วันที่ยังไม่ถึงต้องเทา ไม่ใช่แสดงเป็นยอด 0', () => {
  const now = new Date('2026-08-29T03:00:00.000Z') // 29 ส.ค. เวลาไทย

  it('เดือนปัจจุบัน = เทาตั้งแต่วันพรุ่งนี้ (วันนี้ยังนับว่าถึงแล้ว)', () => {
    // 29 ส.ค. → index 28 คือวันนี้ ⇒ เทาเริ่มที่ index 29
    expect(futureFromDayIndex(2026, 7, now)).toBe(29)
  })

  it('เดือนที่ผ่านไปแล้ว = null (ไม่ใช่ความยาวเดือน — เดือนที่จบแล้วต้องไม่มีแถบเทาเลย)', () => {
    expect(futureFromDayIndex(2026, 6, now)).toBeNull()
  })

  it('เดือนอนาคต = 0 (เทาทั้งแถบ)', () => {
    expect(futureFromDayIndex(2026, 8, now)).toBe(0)
  })

  it('ข้ามปี: ธ.ค. ปีก่อน = null, ม.ค. ปีหน้า = 0', () => {
    expect(futureFromDayIndex(2025, 11, now)).toBeNull()
    expect(futureFromDayIndex(2027, 0, now)).toBe(0)
  })
})

describe('[blocker] referenceDayIndex — เกณฑ์ "เงียบมากี่วัน" ต้องไม่นับวันที่ยังไม่มาถึง', () => {
  const now = new Date('2026-08-29T03:00:00.000Z')

  it('เดือนปัจจุบัน = วันนี้ (index 28) ไม่ใช่วันสุดท้ายของเดือน (30)', () => {
    // ถ้าใช้ 30 สินค้าที่ขายเมื่อวานจะถูกอ่านว่าเงียบมา 2 วันทั้งที่เพิ่งขายไป
    expect(referenceDayIndex(2026, 7, now)).toBe(28)
  })

  it('เดือนที่ผ่านไปแล้ว = วันสุดท้ายของเดือนนั้น', () => {
    expect(referenceDayIndex(2026, 6, now)).toBe(30) // ก.ค. มี 31 วัน
    expect(referenceDayIndex(2026, 1, now)).toBe(27) // ก.พ. 2569 มี 28 วัน
  })
})

describe('isCurrentThaiMonth', () => {
  const now = new Date('2026-08-29T03:00:00.000Z')
  it('ตรงเดือน', () => expect(isCurrentThaiMonth(2026, 7, now)).toBe(true))
  it('คนละเดือน', () => expect(isCurrentThaiMonth(2026, 6, now)).toBe(false))
  it('เดือนเดียวกันคนละปี', () => expect(isCurrentThaiMonth(2025, 7, now)).toBe(false))
})

describe('[blocker] toSparse/toDense — payload ที่ย่อแล้วต้องคืนค่าเดิมได้เป๊ะ', () => {
  it('ไป-กลับแล้วได้ค่าเดิม', () => {
    const dense = daily(31, { 0: 3, 15: 7, 30: 1 })
    expect(toDense(toSparse(dense), 31)).toEqual(dense)
  })

  it('ย่อแล้วเก็บเฉพาะวันที่มียอดจริง', () => {
    expect(toSparse(daily(31, { 2: 5, 9: 1 }))).toEqual([[2, 5], [9, 1]])
  })

  it('ทุกวันเป็นศูนย์ = ไม่ส่งอะไรเลย (นี่คือเหตุผลที่ฟังก์ชันนี้มีอยู่)', () => {
    expect(toSparse(daily(31, {}))).toEqual([])
    expect(toDense([], 31)).toEqual(daily(31, {}))
  })

  it('ค่าติดลบ (คืนของ/ปรับยอด) ต้องไม่ถูกตัดทิ้งเหมือนศูนย์', () => {
    expect(toSparse([0, -2, 0])).toEqual([[1, -2]])
  })

  it('index เกินความยาวถูกทิ้ง ไม่ระเบิด (ข้อมูลเก่าจากเดือน 31 วันเปิดในเดือน 28 วัน)', () => {
    expect(toDense([[30, 9]], 28)).toEqual(new Array(28).fill(0))
  })
})

describe('dayIntensity — ความเข้มเทียบกับวันที่ดีที่สุดของสินค้าตัวเอง', () => {
  it('ไม่มียอด = 0', () => expect(dayIntensity(0, 10)).toBe(0))
  it('วันที่ดีที่สุด = เข้มสุด', () => expect(dayIntensity(10, 10)).toBe(4))
  it('ครึ่งหนึ่งพอดีตกระดับ 2 ไม่ใช่ 3', () => expect(dayIntensity(5, 10)).toBe(2))
  it('ยอดน้อยมากยังต้องเห็น (ระดับ 1) ไม่ใช่หายไปเป็น 0', () => {
    expect(dayIntensity(1, 1000)).toBe(1)
  })
  it('maxValue เป็น 0 ไม่ทำให้หาร 0', () => expect(dayIntensity(0, 0)).toBe(0))
})

describe('[blocker] เพดานเส้นกราฟต้องผูกกับจำนวนโทเคนสีที่มีจริง', () => {
  it('CHART_SERIES_CAP เท่ากับจำนวนโทเคนพอดี — เกินกว่านี้ต้อง hardcode hex (ขัด HR10)', () => {
    expect(CHART_COLOR_TOKENS.length).toBe(CHART_SERIES_CAP)
  })

  it('ไม่มีโทเคนซ้ำ — สีซ้ำ = สองสินค้าแยกกันไม่ออกบนกราฟ', () => {
    expect(new Set(CHART_COLOR_TOKENS).size).toBe(CHART_COLOR_TOKENS.length)
  })

  it('ทุกโทเคนขึ้นต้นด้วย chart- (ต้องเป็นตระกูล data-viz ไม่ใช่สี semantic)', () => {
    for (const t of CHART_COLOR_TOKENS) expect(t.startsWith('chart-')).toBe(true)
  })

  /**
   * 🛑 เทสข้อนี้เคยล็อกมติตรงข้าม ("ห้ามใช้ chart-gamma") — user กลับมติ 2026-08-29
   * โดยชี้ภาพกราฟ Command Center ที่ใช้มิ้นต์+เหลืองเป็นแท่งอยู่แล้ว
   * เปลี่ยนเทสให้ล็อก **มติใหม่** ไม่ใช่ลบทิ้งเฉย ๆ — สองสีแรกต้องเป็นคู่ของ Command Center
   * ไม่งั้นวันหนึ่งมีคนเรียงใหม่แล้วโทนที่ user เลือกหายไปเงียบ ๆ
   */
  it('สองสีแรกต้องเป็นคู่ของ Command Center (มิ้นต์ + เหลืองอำพัน)', () => {
    expect(CHART_COLOR_TOKENS[0]).toBe('chart-alpha')
    expect(CHART_COLOR_TOKENS[1]).toBe('chart-gamma')
  })

  it('chart-delta อยู่ท้ายสุด — ฟ้าอ่อนใกล้เส้น primary ที่สุด ถ้าอยู่ต้น ๆ แท่งจะกลืนกับเส้น', () => {
    expect(CHART_COLOR_TOKENS[CHART_COLOR_TOKENS.length - 1]).toBe('chart-delta')
  })
})

describe('CONCENTRATED_TOP_DAYS ถูกใช้จริงในการคำนวณ ไม่ใช่ค่าคงที่ที่ไม่มีใครอ่าน', () => {
  it('เปลี่ยนจำนวนวันที่นับ = ผลลัพธ์ต้องเปลี่ยน', () => {
    // 4 วันยอดเท่ากัน: top3 = 75% > ครึ่ง ⇒ กระจุก (ถ้าเกณฑ์เป็น top1 = 25% จะไม่กระจุก)
    const d = daily(31, { 0: 5, 1: 5, 2: 5, 3: 5 })
    expect(CONCENTRATED_TOP_DAYS).toBe(3)
    expect(classifySalesPattern(d, 4, 3).kind).toBe('CONCENTRATED')
  })
})

describe('[blocker] estimateRunoutDays — "พอขายอีกกี่วัน" คือคำแนะนำที่ผู้ขายเอาไปสั่งของจริง', () => {
  /**
   * 🛑 ตัวเลขนี้ทำให้ผู้ขังตัดสินใจใช้เงิน — ผิดทางไหนก็เสียหายคนละแบบ:
   * ยาวเกินจริง = ของขาดกลางเดือน · สั้นเกินจริง = สั่งของมาจมทุน
   */
  it('หารด้วยจำนวนวันที่ผ่านไปแล้ว ไม่ใช่จำนวนวันทั้งเดือน', () => {
    // ขายไป 30 ชิ้นใน 10 วัน = 3/วัน · เหลือ 30 ⇒ 10 วัน
    expect(estimateRunoutDays(30, 30, 10)).toEqual({ kind: 'OK', stock: 30, days: 10, low: true })
    // ถ้าเผลอหารด้วย 31 จะได้ ~31 วัน ซึ่งยาวเกินจริงสามเท่า
    expect(estimateRunoutDays(30, 30, 31)).not.toEqual(
      expect.objectContaining({ days: 10 }),
    )
  })

  it('ไม่ได้เปิดนับสต็อก (null) = บอกตรง ๆ ไม่ใช่เดาว่าเป็น 0', () => {
    expect(estimateRunoutDays(null, 50, 10)).toEqual({ kind: 'UNTRACKED' })
  })

  it('มีสต็อกแต่เดือนนี้ขายไม่ได้เลย = คำนวณอัตราไม่ได้ ต้องไม่หารด้วยศูนย์', () => {
    expect(estimateRunoutDays(12, 0, 10)).toEqual({ kind: 'NO_RATE', stock: 12 })
  })

  it('วันที่ผ่านไป 0 (วันแรกของเดือนก่อนมีข้อมูล) ต้องไม่ระเบิด', () => {
    expect(estimateRunoutDays(12, 5, 0)).toEqual({ kind: 'NO_RATE', stock: 12 })
  })

  it('สต็อก 0 = หมดแล้ว ไม่ใช่ "ไม่ได้นับ"', () => {
    expect(estimateRunoutDays(0, 20, 10)).toEqual({ kind: 'OK', stock: 0, days: 0, low: true })
  })

  it(`เกิน ${RUNOUT_MAX_DAYS} วัน = บอกว่าเหลือเยอะ ไม่ต้องยัดตัวเลขที่ไม่มีความหมาย`, () => {
    // ขาย 1 ชิ้นใน 10 วัน เหลือ 1000 ⇒ 10,000 วัน
    expect(estimateRunoutDays(1000, 1, 10)).toEqual({ kind: 'PLENTY', stock: 1000 })
  })

  it('ขอบเขตพอดีของ PLENTY', () => {
    // perDay = 1 ⇒ days = stock
    expect(estimateRunoutDays(RUNOUT_MAX_DAYS, 10, 10).kind).toBe('OK')
    expect(estimateRunoutDays(RUNOUT_MAX_DAYS + 1, 10, 10).kind).toBe('PLENTY')
  })

  it(`ธง low ติดเมื่อ ≤${RUNOUT_WARN_DAYS} วัน — ขอบเขตพอดีทั้งสองฝั่ง`, () => {
    const at = estimateRunoutDays(RUNOUT_WARN_DAYS, 10, 10)
    const over = estimateRunoutDays(RUNOUT_WARN_DAYS + 1, 10, 10)
    expect(at).toEqual(expect.objectContaining({ low: true }))
    expect(over).toEqual(expect.objectContaining({ low: false }))
  })

  it('ปัดลงเสมอ — 9.9 วันต้องอ่านว่า 9 ไม่ใช่ 10 (บอกน้อยกว่าจริงปลอดภัยกว่าบอกเกิน)', () => {
    // ขาย 10 ใน 10 วัน = 1/วัน · เหลือ 9 ⇒ 9 วันพอดี; เหลือ 9 กับอัตรา 0.91 ⇒ 9.89 → 9
    const r = estimateRunoutDays(9, 91, 100)
    expect(r).toEqual(expect.objectContaining({ days: 9 }))
  })
})

describe('[blocker] shareOfTotalPct — 0% ที่ไม่ควรมี', () => {
  it('ยอดรวมทั้งร้านเป็น 0 = คืน null ไม่ใช่ 0% ("0% ของ 0" ไม่มีความหมาย)', () => {
    expect(shareOfTotalPct(0, 0)).toBeNull()
    expect(shareOfTotalPct(5, 0)).toBeNull()
  })

  it('มียอดจริงแต่น้อยมาก ต้องไม่แสดง 0% ซึ่งอ่านว่า "ไม่ได้ขาย"', () => {
    expect(shareOfTotalPct(1, 500)).toBe(1)
    expect(shareOfTotalPct(2, 10000)).toBe(1)
  })

  it('ไม่มียอดเลย = 0% จริง ๆ (ต่างจากกรณีข้างบน)', () => {
    expect(shareOfTotalPct(0, 500)).toBe(0)
  })

  it('ปัดเป็นจำนวนเต็ม', () => {
    expect(shareOfTotalPct(33, 100)).toBe(33)
    expect(shareOfTotalPct(1, 3)).toBe(33)
  })
})

describe('bestDay — วันที่ขายได้มากที่สุด', () => {
  it('คืน index 0-based กับจำนวน', () => {
    expect(bestDay([1, 0, 5, 2])).toEqual({ index: 2, value: 5 })
  })
  it('เสมอกัน = เอาวันแรก (อ่านซ้ายไปขวาเหมือนบนกราฟ)', () => {
    expect(bestDay([4, 1, 4])).toEqual({ index: 0, value: 4 })
  })
  it('ไม่มียอดเลย = null ไม่ใช่ index 0', () => {
    expect(bestDay([0, 0, 0])).toBeNull()
    expect(bestDay([])).toBeNull()
  })
})

/* ═══════════════ ต้นเดือน / กลางเดือน / ปลายเดือน (แทนแถบ 31 ช่องบนมือถือ) ═══════════════ */

describe('[blocker] monthThirds — ขอบเขตช่วงตามที่คนไทยพูดจริง (1–10 · 11–20 · 21–สิ้นเดือน)', () => {
  const ones = (n: number) => Array.from({ length: n }, () => 1)

  it('เดือน 31 วัน: ช่วงท้ายยาว 11 วัน ไม่ใช่ 10', () => {
    const t = monthThirds(ones(31), 31, 31)
    expect(t.map((x) => [x.fromDay, x.toDay])).toEqual([
      [1, 10],
      [11, 20],
      [21, 31],
    ])
    expect(t.map((x) => x.totalDays)).toEqual([10, 10, 11])
  })

  it('เดือน 28 วัน: ช่วงท้ายหดเหลือ 8 วัน ไม่ใช่หายไป', () => {
    const t = monthThirds(ones(28), 28, 28)
    expect(t).toHaveLength(3)
    expect([t[2].fromDay, t[2].toDay, t[2].totalDays]).toEqual([21, 28, 8])
  })

  it('บวกยอดเข้าช่วงถูกต้อง — ค่าที่ขอบ (วันที่ 10/11/20/21) ต้องไม่หล่นข้ามช่วง', () => {
    const v = Array.from({ length: 31 }, () => 0)
    v[9] = 5 // วันที่ 10 → EARLY
    v[10] = 7 // วันที่ 11 → MID
    v[19] = 3 // วันที่ 20 → MID
    v[20] = 9 // วันที่ 21 → LATE
    const t = monthThirds(v, 31, 31)
    expect(t.map((x) => x.sum)).toEqual([5, 10, 9])
  })

  /**
   * 🛑 เคสที่ทำให้ตัวเลขโกหกได้เงียบที่สุด — `partial-data-must-be-labeled-or-filled.md`
   * 30 ส.ค. ช่วง "ปลายเดือน" มีข้อมูลจริงแค่ 10 จาก 11 วัน ถ้า `complete` ไม่เป็น false
   * UI จะวาดแท่งเทียบกับช่วงอื่นตรง ๆ แล้วผู้ขายอ่านว่า "ปลายเดือนขายตก" ทั้งที่ยังไม่เกิด
   */
  it('เดือนปัจจุบันที่ยังไม่จบ: ช่วงท้ายต้องรายงานว่ายังไม่ครบ', () => {
    const t = monthThirds(ones(31), 31, 30)
    expect(t[0].complete).toBe(true)
    expect(t[1].complete).toBe(true)
    expect(t[2].complete).toBe(false)
    expect(t[2].elapsedDays).toBe(10)
    expect(t[2].totalDays).toBe(11)
  })

  it('ช่วงที่ยังไม่เริ่มเลย ต้องแยกจาก "ผ่านแล้วแต่ขายไม่ได้" — ทั้งคู่ sum เป็น 0 เหมือนกัน', () => {
    const t = monthThirds(Array.from({ length: 31 }, () => 0), 31, 15)
    expect(t[1].notStarted).toBe(false) // ผ่านมาแล้ว 5 วัน ขายไม่ได้จริง
    expect(t[2].notStarted).toBe(true) // ยังไม่ถึงวันที่ 21
    expect(t[2].sum).toBe(0)
  })

  it('วันแรกของเดือน (ยังไม่ผ่านไปสักวัน): ทุกช่วง notStarted', () => {
    const t = monthThirds(ones(31), 31, 0)
    expect(t.every((x) => x.notStarted)).toBe(true)
    expect(t.every((x) => !x.complete)).toBe(true)
  })

  it('elapsedDays เกินจำนวนวันในเดือน ต้องไม่ทำให้ elapsed ของช่วงล้น', () => {
    const t = monthThirds(ones(30), 30, 99)
    expect(t.every((x) => x.elapsedDays === x.totalDays)).toBe(true)
  })
})

describe('[blocker] monthThirdsAriaLabel — ต้องบอกทั้ง "วันไหน" และ "ยังไม่ครบ"', () => {
  it('ช่วงที่ยังไม่จบต้องมีคำบอกว่าผ่านไปกี่วัน', () => {
    const s = monthThirdsAriaLabel(monthThirds([1, 1, 1], 31, 30), 'ชิ้น')
    expect(s).toMatch(/ผ่านไป 10 จาก 11 วัน/)
  })

  it('ช่วงที่ยังไม่ถึงต้องพูดว่า "ยังไม่ถึง" ไม่ใช่รายงานเป็น 0', () => {
    const s = monthThirdsAriaLabel(monthThirds([], 31, 5), 'ชิ้น')
    expect(s).toMatch(/ยังไม่ถึง/)
  })

  /** หนี้เดิมของ DayStrip คือบอกจำนวนแต่ไม่บอกว่าวันไหน — อันใหม่ต้องไม่รับมา */
  it('ต้องมีเลขวันที่เสมอ ไม่ใช่แค่ชื่อช่วง', () => {
    const s = monthThirdsAriaLabel(monthThirds([1], 31, 31), 'ชิ้น')
    expect(s).toMatch(/วันที่ 1 ถึง 10/)
    expect(s).toMatch(/วันที่ 21 ถึง 31/)
  })
})

describe('[blocker] sortProductRows — null ต้องไปคนละทางของสองการเรียงที่ดูกลับด้านกัน', () => {
  const R = (name: string, total: number, lastSold: number | null) => ({ name, total, lastSold })
  const rows = [R('ก', 10, 3), R('ข', 30, null), R('ค', 20, 9)]

  it('TOP / BOTTOM เรียงตามยอด', () => {
    expect(sortProductRows(rows, 'TOP').map((r) => r.name)).toEqual(['ข', 'ค', 'ก'])
    expect(sortProductRows(rows, 'BOTTOM').map((r) => r.name)).toEqual(['ก', 'ค', 'ข'])
  })

  it('RECENT: ตัวที่ไม่เคยขายเลยไปอยู่ท้ายสุด (ไม่มีวันที่ให้เรียง)', () => {
    expect(sortProductRows(rows, 'RECENT').map((r) => r.name)).toEqual(['ค', 'ก', 'ข'])
  })

  it('DORMANT: ตัวที่ไม่เคยขายเลยไปอยู่บนสุด (เงียบที่สุดเท่าที่เป็นไปได้)', () => {
    expect(sortProductRows(rows, 'DORMANT').map((r) => r.name)).toEqual(['ข', 'ก', 'ค'])
  })

  it('ค่าที่เท่ากันตัดสินด้วยชื่อเสมอ — ไม่งั้นลำดับสลับเองทุก re-render', () => {
    const tie = [R('ผ', 5, 1), R('ก', 5, 1), R('ม', 5, 1)]
    expect(sortProductRows(tie, 'TOP').map((r) => r.name)).toEqual(['ก', 'ผ', 'ม'])
    expect(sortProductRows(tie, 'DORMANT').map((r) => r.name)).toEqual(['ก', 'ผ', 'ม'])
  })

  it('ไม่แก้อาร์เรย์เดิม', () => {
    const src = [R('ก', 1, 0), R('ข', 9, 0)]
    sortProductRows(src, 'TOP')
    expect(src.map((r) => r.name)).toEqual(['ก', 'ข'])
  })
})

describe('[blocker] lastSoldIndex', () => {
  it('คืนวันสุดท้ายที่มียอด ไม่ใช่วันแรก', () => {
    expect(lastSoldIndex([2, 0, 5, 0, 0])).toBe(2)
  })
  it('ไม่เคยขายเลย = null ไม่ใช่ 0 หรือ -1', () => {
    expect(lastSoldIndex([0, 0, 0])).toBeNull()
    expect(lastSoldIndex([])).toBeNull()
  })
})

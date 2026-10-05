import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPlainNotice, buildSummaryReportFlex, fitToLimits, type SummaryReportInput } from '../flex-summary-report'
import { canSumProfit, combineTotals, isMixedFinanceRules } from '@/lib/line-report/aggregate'
import type { GroupSummary, ShopSummary } from '@/lib/line-report/types'

const win = { startIso: '2026-10-05', endIso: '2026-10-05', computedAt: '2026-10-05T14:02:00.000Z' } // 21:02 ไทย
const shop = (i: number, o: Partial<ShopSummary> = {}, vertical = 'ONLINE_SALES'): ShopSummary => ({
  shop: { id: `s${i}`, name: `ร้าน ${i}`, vertical },
  state: 'OK',
  orders: 10 + i,
  confirmed: 1000 * (i + 1),
  unconfirmed: 50 * i,
  cancelled: i,
  top3: [{ name: `สินค้า ${i}`, qty: 5, amount: 500 }],
  profit: { netProfit: 100 * (i + 1), capped: false },
  ...o,
})
const summary = (shops: ShopSummary[], o: Partial<GroupSummary> = {}): GroupSummary => ({
  window: win,
  shops,
  total: combineTotals(shops),
  profitSummable: canSumProfit(shops.map((s) => s.shop)),
  mixedFinanceRules: isMixedFinanceRules(shops.map((s) => s.shop)),
  ...o,
})
const mk = (shops: ShopSummary[], o: Partial<SummaryReportInput> = {}, so: Partial<GroupSummary> = {}) =>
  buildSummaryReportFlex({ summary: summary(shops, so), kind: 'DAILY', showProfit: false, ...o })
const json = (m: unknown) => JSON.stringify(m)

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SELLER_URL
})

describe('buildSummaryReportFlex', () => {
  it('top3Truncated -> มีหมายเหตุใต้ Top 3 · ไม่ตั้ง -> ไม่มี', () => {
    const NOTE = 'อันดับคำนวณจากข้อมูลบางส่วน (ข้อมูลเดือนนี้มากเกินกำหนด)'
    expect(json(mk([shop(1, { top3Truncated: true })]))).toContain(NOTE)
    expect(json(mk([shop(1)]))).not.toContain(NOTE)
  })

  it('altText ≤1500 มีชื่อรายงาน ช่วง ออเดอร์ ยอดขาย กำไรตามธง', () => {
    const shops = [shop(1), shop(2)]
    const [m] = mk(shops, { showProfit: true })
    expect(m.altText.length).toBeLessThanOrEqual(1500)
    for (const s of ['รายงานยอดรายวัน', '5 ต.ค. 2569', 'ออเดอร์ 23 รายการ', 'ยอดขาย ฿5,000', 'กำไรสุทธิ ฿500', '21:02']) {
      expect(m.altText).toContain(s)
    }
    expect(mk(shops)[0].altText).not.toContain('กำไร')
  })

  it('โครงเนื้อหา: ป้ายวันที่ + ข้อมูล ณ + รวม N ร้าน + ยังไม่นับ + ยกเลิก', () => {
    const j = json(mk([shop(1), shop(2)])[0])
    for (const s of ['ข้อมูล ณ 21:02 น.', 'รวม 2 ร้าน', 'ยังไม่นับเป็นยอดขาย ฿150', 'ยกเลิก', 'แยกรายร้าน', 'สินค้าขายดี 3 อันดับ']) {
      expect(j).toContain(s)
    }
  })

  it('showProfit=false → ไม่มีคำว่า กำไร ใน JSON เลย', () => {
    expect(json(mk([shop(1), shop(2)], { showProfit: false }))).not.toContain('กำไร')
  })

  it('mixed vertical → ไม่มีกำไรรวม + มีหมายเหตุ', () => {
    const j = json(mk([shop(1), shop(2, {}, 'SERVICE_QUEUE')], { showProfit: true }))
    expect(j).toContain('กำไรแต่ละร้านคิดตามกติกาของประเภทธุรกิจ จึงไม่รวมเป็นยอดเดียว')
    expect(j).toContain('ยอดแต่ละร้านคิดตามกติกาของประเภทธุรกิจ')
    expect((j.match(/กำไรสุทธิ"/g) ?? []).length).toBe(2) // รายร้านเท่านั้น
  })

  it('vertical เดียวกัน → มีกำไรรวม + ป้ายเพดานเมื่อ capped', () => {
    const j = json(mk([shop(1), shop(2, { profit: { netProfit: 40, capped: true } })], { showProfit: true }))
    expect(j).toContain('กำไรสุทธิไม่เกิน')
    expect(j).toContain('ค่าใช้จ่ายลงตามวันที่บันทึก ไม่เฉลี่ยรายวัน')
  })

  it('ร้าน ERROR → "ดึงข้อมูลไม่สำเร็จ" + หมายเหตุยอดรวมไม่ครบ ไม่ใช่ 0', () => {
    const j = json(mk([shop(1), shop(2, { state: 'ERROR', orders: 0, confirmed: 0 })])[0])
    expect(j).toContain('ดึงข้อมูลไม่สำเร็จ')
    expect(j).toContain('ยอดรวมยังไม่ครบ')
  })

  it('LODGING ไม่มี Top3 · Top3 ว่าง → ข้อความว่าง', () => {
    expect(json(mk([shop(1, {}, 'LODGING'), shop(2, {}, 'LODGING')]))).not.toContain('3 อันดับ')
    expect(json(mk([shop(1, { top3: [] })]))).toContain('ยังไม่มีรายการสินค้าที่ระบุในช่วงนี้')
    expect(json(mk([shop(1, {}, 'SERVICE_QUEUE')]))).toContain('บริการยอดนิยม 3 อันดับ')
  })

  it('กลุ่มร้านเดียว ไม่มีบล็อกรายร้านซ้ำยอด', () => {
    const j = json(mk([shop(1)]))
    expect(j).not.toContain('แยกรายร้าน')
    expect(j).not.toContain('รวม 1 ร้าน')
  })

  it('TEST มีป้าย ทดสอบ · 24:00 title · titleOverride', () => {
    expect(json(mk([shop(1)], { kind: 'TEST' }))).toContain('"ทดสอบ"')
    const full = mk([shop(1)], {}, { window: { ...win, fullDay: true } })[0]
    expect(json(full)).toContain('สรุปวันที่ 5 ต.ค. 2569 (ครบทั้งวัน)')
    expect(json(mk([shop(1)], { titleOverride: 'ชื่อพิเศษ' }))).toContain('ชื่อพิเศษ')
  })

  it('ช่วงหลายวัน + ยอดสะสมรอบ + push รายวัน+รายเดือน = 2 ข้อความ', () => {
    const msgs = mk([shop(1)], {
      cycleToDate: { startIso: '2026-09-06', endIso: '2026-10-05', totals: { orders: 1, confirmed: 777, unconfirmed: 0, cancelled: 0 } },
      monthly: summary([shop(1)], { window: { ...win, startIso: '2026-09-06' } }),
    })
    expect(msgs).toHaveLength(2)
    expect(json(msgs[0])).toContain('ยอดสะสมรอบนี้ 6 ก.ย. – 5 ต.ค. 2569')
    expect(json(msgs[1])).toContain('รายงานยอดรายเดือน')
    expect(json(msgs[1])).toContain('6 ก.ย. – 5 ต.ค. 2569')
  })

  it('ร้านถูกตัด → หมายเหตุ ไม่รวมร้าน X (ถูกล็อก) และไม่อยู่ในยอดรวม', () => {
    const j = json(mk([shop(1), shop(2, { state: 'EXCLUDED', excludedReason: 'LOCKED' })])[0])
    expect(j).toContain('ไม่รวมร้าน ร้าน 2 (ถูกล็อก)')
    expect(j).toContain('ยอดขาย (นับแล้ว)')
    expect(j).not.toContain('รวม 2 ร้าน')
  })

  it('ปุ่ม เปิด Deep เฉพาะเมื่อมี https URL', () => {
    expect(json(mk([shop(1)]))).not.toContain('เปิด Deep')
    process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.deepthailand.app'
    const j = json(mk([shop(1)]))
    expect(j).toContain('เปิด Deep')
    expect(j).toContain('https://seller.deepthailand.app/dashboard')
    expect(j).not.toContain('#7367F0')
  })

  it('ไม่มี SafePay / emoji', () => {
    process.env.NEXT_PUBLIC_SELLER_URL = 'https://seller.deepthailand.app'
    const j = json([...mk([shop(1), shop(2)], { showProfit: true, kind: 'TEST' }), buildPlainNotice('ข้อความ')])
    expect(j).not.toMatch(/safepay/i)
    expect(j).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('total ที่ไม่ตรงผลบวกรายร้านถูกเมิน (AC-15-2)', () => {
    const shops = [shop(1), shop(2)]
    const m = mk(shops, {}, { total: { orders: 999, confirmed: 987654, unconfirmed: 1, cancelled: 1 } })[0]
    expect(json(m)).toContain('฿5,000')
    expect(json(m)).not.toContain('987,654')
    expect(m.altText).not.toContain('987,654')
  })

  it('เรียงร้าน: ยอดขายมาก→น้อย แล้วชื่อ ERROR ท้ายสุด (AC-15-5)', () => {
    const shops = [
      shop(1, { shop: { id: 'e', name: 'ERR', vertical: 'ONLINE_SALES' }, state: 'ERROR', confirmed: 99999 }),
      shop(2, { shop: { id: 'b', name: 'บบ', vertical: 'ONLINE_SALES' }, confirmed: 500 }),
      shop(3, { shop: { id: 'c', name: 'ลล', vertical: 'ONLINE_SALES' }, confirmed: 9000 }),
      shop(4, { shop: { id: 'a', name: 'กก', vertical: 'ONLINE_SALES' }, confirmed: 500 }),
    ]
    const j = json(mk(shops)[0])
    const at = (n: string) => j.indexOf(`"${n}"`)
    expect(at('ลล')).toBeGreaterThan(-1)
    expect(at('ลล')).toBeLessThan(at('กก'))
    expect(at('กก')).toBeLessThan(at('บบ'))
    expect(at('บบ')).toBeLessThan(at('ERR'))
  })

  it('ข้อมูล ณ อยู่ในข้อความรายเดือน (msgs[1]) · ครบทั้งวันไม่มียอดสะสมรอบ', () => {
    const cycleToDate = { startIso: '2026-09-06', endIso: '2026-10-05', totals: { orders: 1, confirmed: 777, unconfirmed: 0, cancelled: 0 } }
    const msgs = mk([shop(1)], { cycleToDate, monthly: summary([shop(1)]) })
    expect(json(msgs[1])).toContain('ข้อมูล ณ 21:02 น.')
    const full = mk([shop(1)], { cycleToDate }, { window: { ...win, fullDay: true } })[0]
    expect(json(full)).not.toContain('ยอดสะสมรอบนี้')
    expect(json(mk([shop(1)], { cycleToDate })[0])).toContain('ยอดสะสมรอบนี้')
  })

  it('text ว่างไม่ถูกส่งให้ LINE (ชื่อร้านว่าง · notice ว่าง)', () => {
    const j = json(mk([shop(1, { shop: { id: 'x', name: '', vertical: null } }), shop(2)])[0])
    expect(j).not.toContain('"text":""')
    expect(json(buildPlainNotice(''))).not.toContain('"text":""')
    expect(buildPlainNotice('').altText).toBe('-')
  })
})

describe('fitToLimits', () => {
  const long = (n: number, c: string) => c.repeat(n)
  const big = () =>
    Array.from({ length: 10 }, (_, i) =>
      shop(i, {
        shop: { id: `s${i}`, name: long(300, 'ก'), vertical: 'ONLINE_SALES' },
        top3: [0, 1, 2].map((k) => ({ name: long(300, 'ข'), qty: 9 - k, amount: 1 })),
      }),
    )

  it('10 ร้านใหญ่ → ≤30KB, altText ≤1500, ยอดรวม/ป้ายเวลา/ข้อมูล ณ ยังอยู่', () => {
    const raw = mk(big(), { showProfit: true })
    expect(Buffer.byteLength(json(raw[0].contents))).toBeGreaterThan(30_000)
    const [m] = fitToLimits(raw)
    expect(Buffer.byteLength(json(m.contents))).toBeLessThanOrEqual(30_000)
    expect(m.altText.length).toBeLessThanOrEqual(1500)
    const j = json(m)
    for (const s of ['ยอดขาย (นับแล้ว)', 'ยังไม่นับเป็นยอดขาย', 'ยกเลิก', '5 ต.ค. 2569', 'ข้อมูล ณ 21:02 น.', 'รวม 10 ร้าน']) {
      expect(j).toContain(s)
    }
    expect(j).not.toContain('3 อันดับ') // Top3 ถูกตัดก่อน
    expect(m.altText).toContain('ยอดขาย ฿')
  })

  it('30 ร้านชื่อยาว + ร้านถูกตัด/ERROR เยอะ → ถึงระดับ 2/3 ยังอยู่ใน 30KB', () => {
    const name = (i: number, c: string) => `${c}${i}${'ก'.repeat(300)}`
    const shops = [
      ...Array.from({ length: 30 }, (_, i) => shop(i, { shop: { id: `s${i}`, name: name(i, 'ร'), vertical: 'ONLINE_SALES' } })),
      ...Array.from({ length: 40 }, (_, i) => shop(100 + i, { state: 'ERROR', shop: { id: `e${i}`, name: name(i, 'ผ'), vertical: 'ONLINE_SALES' } })),
      ...Array.from({ length: 60 }, (_, i) => shop(200 + i, { state: 'EXCLUDED', excludedReason: 'LOCKED', shop: { id: `x${i}`, name: name(i, 'ล'), vertical: 'ONLINE_SALES' } })),
    ]
    const raw = mk(shops, { showProfit: true })
    const [m] = fitToLimits(raw)
    const j = json(m)
    expect(Buffer.byteLength(json(m.contents), 'utf8')).toBeLessThanOrEqual(30_000)
    expect(j).toMatch(/…และอีก \d+ ร้าน/)
    expect(json(m.contents)).not.toContain('ก'.repeat(100)) // ชื่อถูกตัด (altText ไม่นับ)
    for (const s of ['ยอดขาย (นับแล้ว)', 'ยังไม่นับเป็นยอดขาย', '5 ต.ค. 2569', 'ข้อมูล ณ 21:02 น.', 'ยอดรวมยังไม่ครบ']) expect(j).toContain(s)
    expect(m.altText.length).toBeLessThanOrEqual(1500)
  })

  it('ข้อความที่ไม่เกิน → ไม่ถูกแตะ · เกิน 5 ข้อความถูกตัด', () => {
    const [m] = mk([shop(1)])
    expect(fitToLimits([m])[0]).toBe(m)
    expect(fitToLimits(Array(7).fill(m))).toHaveLength(5)
  })

  it('buildPlainNotice altText ถูกตัดที่ 1500', () => {
    expect(buildPlainNotice('ก'.repeat(2000)).altText.length).toBe(1500)
  })
})

describe('ซอร์ส', () => {
  it('ไม่เขียนรูปแบบเงิน/วันที่เอง', () => {
    const src = readFileSync(new URL('../flex-summary-report.ts', import.meta.url), 'utf8')
    expect(src).not.toContain('toFixed(')
    expect(src).not.toContain("toLocaleString('th")
    expect(src).not.toMatch(/safepay/i)
  })
})

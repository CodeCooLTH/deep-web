/**
 * 00070 FR-LGS-12 — ธงตัวชี้วัดของกลุ่มต้องไปถึง builder ในทุกทางส่ง (scheduled · test · command-reply)
 * ตรวจที่ซอร์ส: ทุกการเรียก buildSummaryReportFlex ต้องส่ง `flags` ที่มาจาก group และห้ามเหลือ `showProfit:` เดี่ยว ๆ
 * (บั๊กเดิม: ส่งแค่ showProfit → ปิดออเดอร์/ยอดขาย/ยกเลิก/Top3 ไม่มีผลกับข้อความที่ส่งจริง)
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(`src/services/${f}`, 'utf8')
const callsOf = (src: string) => src.split('\n').filter((l) => l.includes('buildSummaryReportFlex({'))

describe('flags wiring → buildSummaryReportFlex', () => {
  it.each([
    ['line-report-send.service.ts', 2],
    ['line-report-command.service.ts', 1],
  ])('%s ส่ง flags ของกลุ่มครบทุกจุดเรียก', (file, n) => {
    const calls = callsOf(read(file))
    expect(calls).toHaveLength(n)
    for (const c of calls) {
      expect(c).toMatch(/flags(: flagsOf\(group\))?[,\s}]/)
      expect(c).not.toMatch(/showProfit:/)
    }
  })
  it('flagsOf ของทั้งสอง service ครอบทั้ง 5 ธง', () => {
    for (const f of ['line-report-send.service.ts', 'line-report-command.service.ts'])
      for (const k of ['showOrders', 'showSales', 'showCancelled', 'showTopProducts', 'showProfit'])
        expect(read(f)).toMatch(new RegExp(`${k}: g\\.${k}`))
  })
})

/**
 * 00070 FR-LGS-12 + EXT AC-EXT-06-1/07-5 — ทุกทางส่ง (scheduled · test · command-reply) ต้องอ่านค่าที่ตัดสินข้อความ
 * ผ่าน `resolveReportConfig(group)` เท่านั้น แล้วส่ง `template` เข้า builder
 * ตรวจที่ซอร์ส: ทุก buildSummaryReportFlex({ ต้องมี template (ไม่ใช่ flags ล้วน — บั๊กเดิม: ส่งแค่ showProfit → ตัวชี้วัดอื่นไม่มีผล)
 * และห้ามเหลือการอ่านคอลัมน์ show* ตรงในเส้นทางส่ง (stored flag = cache ไม่ใช่ตัวตัดสินเมื่อมีเทมเพลต)
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(`src/services/${f}`, 'utf8')
const callsOf = (src: string) => src.split('\n').filter((l) => l.includes('buildSummaryReportFlex({'))
const SEND = ['line-report-send.service.ts', 'line-report-command.service.ts'] as const

describe('template/flags wiring → buildSummaryReportFlex', () => {
  it.each([
    ['line-report-send.service.ts', 2],
    ['line-report-command.service.ts', 1],
  ])('%s ส่ง template ที่ resolve แล้วครบทุกจุดเรียก', (file, n) => {
    const calls = callsOf(read(file))
    expect(calls).toHaveLength(n)
    for (const c of calls) {
      expect(c).toMatch(/\btemplate[,\s}]/)
      expect(c).not.toMatch(/\bflags\b/)
      expect(c).not.toMatch(/showProfit:/)
    }
  })

  it.each(SEND)('%s: template/flags/needs มาจาก resolveReportConfig และ flags+needs ถึง buildGroupSummary', (f) => {
    const src = read(f)
    expect(src).toMatch(/const \{ template, flags, needs \} = resolveReportConfig\(group\)/)
    const at = [...src.matchAll(/buildGroupSummary\(\{/g)].map((m) => src.slice(m.index, m.index! + 300)) // เรียกหลายบรรทัดได้
    expect(at.length).toBeGreaterThan(0)
    for (const call of at) expect(call).toMatch(/\bflags, needs\b/)
  })

  it.each(SEND)('%s: ไม่อ่านคอลัมน์ show*/attachCycleToDaily ตรงในเส้นทางส่ง', (f) => {
    const src = read(f)
    expect(src).not.toMatch(/\bflagsOf\b/)
    expect(src).not.toMatch(/\b(g|group)\.(showOrders|showSales|showCancelled|showTopProducts|showProfit|attachCycleToDaily)\b/)
  })
})

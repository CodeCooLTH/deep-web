import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_REPORT_SETTINGS, resolveReportSettings, serviceReportChart, serviceReportPatch, serviceReportView } from '@/lib/report-settings'

/** [blocker] ตั้งค่า 2 ข้อ + คำกลาง (feature 00078 · FR-002/FR-012) */
describe('[blocker] ตั้งค่า 2 ข้อ — แปลงค่าเก่า', () => {
  const v = (raw: unknown) => serviceReportView(resolveReportSettings(raw, 'SERVICE_QUEUE'))
  const c = (raw: unknown) => serviceReportChart(resolveReportSettings(raw, 'SERVICE_QUEUE'))
  it('ตัวเลขที่อยากเห็นก่อน: NET_PROFIT = กำไร · SALES/RECEIVED/ไม่มี/เพี้ยน = ยอดขาย', () => {
    expect(v({ headline: 'NET_PROFIT' })).toBe('profit')
    expect(v({ headline: 'RECEIVED' })).toBe('sales')
    expect(v({ headline: 'SALES' })).toBe('sales')
    expect(v(null)).toBe('sales')
    expect(v({ headline: 42 })).toBe('sales')
  })
  it('รูปแบบกราฟ: LINE/AREA = เส้น · STACKED/GROUPED/เพี้ยน = แท่ง', () => {
    expect(c({ chartStyle: 'LINE' })).toBe('line')
    expect(c({ chartStyle: 'AREA' })).toBe('line')
    expect(c({ chartStyle: 'GROUPED' })).toBe('bar')
    expect(c({ chartStyle: 'PIE' })).toBe('bar')
  })
  it('สวิตช์ที่เลิกใช้ = ค่าตั้งต้นเสมอ (การ์ดกำไรหน้าบิล · เมนูค่าใช้จ่าย กลับมาแสดง)', () => {
    const s = resolveReportSettings({ pnl: false, partCost: false, shopExpense: false, receivables: false, jobCount: false, advanceDeposit: true }, 'SERVICE_QUEUE')
    expect(s).toEqual({ ...DEFAULT_REPORT_SETTINGS })
  })
  it('ร้านอื่นได้ค่าตั้งต้นเสมอ', () => {
    expect(resolveReportSettings({ headline: 'NET_PROFIT', chartStyle: 'LINE' }, 'ONLINE_SALES')).toEqual({ ...DEFAULT_REPORT_SETTINGS })
  })
  it('PATCH ที่ฟอร์มส่ง', () => {
    expect(serviceReportPatch({ view: 'profit' })).toEqual({ headline: 'NET_PROFIT' })
    expect(serviceReportPatch({ chart: 'line' })).toEqual({ chartStyle: 'LINE' })
    expect(serviceReportPatch({ view: 'sales', chart: 'bar' })).toEqual({ headline: 'SALES', chartStyle: 'STACKED' })
  })
})

describe('[blocker] คำกลาง — ไฟล์จอรายงานร้านบริการไม่มีคำเก่า/คำเขียนเอง', () => {
  const root = 'src/app/(paces)/seller/(dashboard)'
  const screens = [
    `${root}/_shared/service-report/ServiceReportCard.tsx`,
    `${root}/_shared/service-report/ServiceReportPanel.tsx`,
    `${root}/_shared/service-report/ServiceReportSheet.tsx`,
    `${root}/settings/reports/components/ReportSettingsForm.tsx`,
  ]
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  it.each(screens)('%s', (f) => {
    const src = strip(readFileSync(join(process.cwd(), f), 'utf8'))
    for (const old of ['รับจริง', 'ค้างรับ', 'บิลยังไม่ปิด', 'ยืนยันแล้ว', 'รอยืนยัน', 'การเงินร้าน', 'ตัวเลขใหญ่'])
      expect(src, `${f} มีคำเก่า "${old}"`).not.toContain(old)
    // "ยังไม่ปิด" ลอย ๆ (ไม่ตามด้วย "งาน") ห้ามมี
    expect(src).not.toMatch(/ยังไม่ปิด(?!งาน)/)
    expect(src).toContain('SERVICE_REPORT_WORDS')
  })
})

/**
 * portfolio-display.ts — ข้อความ/boolean ที่ตัดสินหน้าตาของส่วน "ภาพรวมทุกธุรกิจ" (00069)
 *
 * แยกจาก JSX เพื่อให้เทสจับได้ (docs/conventions/ui-boolean-needs-a-testable-home.md)
 * ไม่มีสูตรเงินใหม่ — รับตัวเลขจาก business-overview.ts อย่างเดียว
 */
import { DATE_RANGE_OPTIONS, type DateRangePreset } from '@/lib/date-range'
import { formatDate, formatMonthYearTH } from '@/lib/format-date'

/** % margin บนการ์ด: ยอดขาย 0 → "—" · ข้อมูลไม่ครบ (เพดานบน) → "ไม่เกิน x%" ตาม precedent 00067 */
export function marginText(marginPct: number | null, incomplete: boolean): string {
  if (marginPct === null) return '—'
  // ติดลบ = ขาดทุนแน่นอนแล้ว ไม่ใช่เพดาน จึงไม่ใส่ "ไม่เกิน"
  if (incomplete && marginPct >= 0) return `ไม่เกิน ${marginPct.toFixed(1)}%`
  return `อัตรากำไร ${marginPct.toFixed(1)}%`
}

/** ป้ายข้อมูลไม่ครบบนการ์ดร้าน — ขาดทั้งคู่ = 2 ป้าย */
export function shopIncompleteBadges(
  c: { missingCost: boolean; missingExpense: boolean },
  costNoun: string,
): string[] {
  const out: string[] = []
  if (c.missingCost) out.push(`ยังไม่ตั้ง${costNoun}`)
  if (c.missingExpense) out.push('ยังไม่บันทึกค่าใช้จ่าย')
  return out
}

/** ขาดทุน → แดง · ข้อมูลไม่ครบ → warning · ปกติ → กลาง (ห้ามเขียว: Verified-Means-Green) */
export function profitToneClass(netProfit: number, incomplete: boolean): string {
  if (netProfit < 0) return 'text-danger-ink'
  return incomplete ? 'text-warning-ink' : 'text-default-800'
}

export function profitHeading(netProfit: number, scope: 'total' | 'shop'): string {
  const word = netProfit < 0 ? 'ขาดทุนสุทธิ' : 'กำไรสุทธิ'
  return scope === 'total' ? `${word}รวม` : word
}

/** หมายเหตุฐานค่าส่ง — เฉพาะเมื่อมีร้านต่างกติกาการเงิน */
export function financeBasisNote(mixedFinanceRules: boolean): string | null {
  return mixedFinanceRules
    ? 'ร้านบริการหักค่าส่งเป็นค่าใช้จ่ายแล้ว ส่วนร้านขายของไม่หัก ใช้ดูภาพรวมได้ แต่เทียบกำไรข้ามร้านแบบเป๊ะ ๆ ไม่ได้'
    : null
}

/** ยอดรวมไม่รวมร้านที่คำนวณล้ม */
export function excludedShopsNote(failedShopNames: string[]): string | null {
  return failedShopNames.length > 0 ? `ยอดรวมยังไม่รวมร้าน ${failedShopNames.join(', ')}` : null
}

/** "เดือนนี้ · 01-10-2569 – 05-10-2569" */
export function rangeSubtitle(preset: DateRangePreset, label: { start: string; end: string }): string {
  const name = DATE_RANGE_OPTIONS.find((o) => o.value === preset)?.label ?? ''
  return `${name} · ${formatDate(label.start)} – ${formatDate(label.end)}`
}

/** กราฟแสดงทั้งเดือนที่ช่วงจบเสมอ — ถ้าช่วงที่เลือกไม่ใช่ "เดือนนี้" ต้องบอก */
export function chartMonthNote(preset: DateRangePreset, seriesMonth: string): string | null {
  return preset === 'month' ? null : `กราฟแสดงทั้งเดือน ${formatMonthYearTH(`${seriesMonth}-01`)} ไม่ได้ตามช่วงที่เลือก`
}

/** มีกราฟให้วาดไหม — ยอดขาย 0 ทุกวัน = empty state (การ์ดร้านยังแสดงตามปกติ) */
export function hasChartData(series: { revenue: number[] } | null): boolean {
  return !!series && series.revenue.some((v) => v > 0)
}

/** label ของ getSalesSeries daily คือ "1".."31" → ISO "YYYY-MM-DD" เพื่อให้ formatDate/formatDayMonth ใช้ต่อได้ */
export function chartDates(seriesMonth: string, labels: string[]): string[] {
  return labels.map((l) => `${seriesMonth}-${l.padStart(2, '0')}`)
}

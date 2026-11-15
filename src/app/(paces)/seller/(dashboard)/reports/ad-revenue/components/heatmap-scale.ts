/**
 * heatmap-scale — สเกลสีของ heatmap ทั้งหน้า: chart-primary สีเดียว 4 ระดับความเข้ม + chart-gray ช่องไม่มีค่า
 * Base: theme/paces/Admin/TS/src/app/(admin)/charts/apex/heatmap/components/data.ts → colorScale.ranges
 * 🛑 ถอดสีเขียว/ชมพูของธีมออกโดยตั้งใจ: ความเข้ม = จำนวนเงิน ไม่ใช่ดี/ร้าย (ผ่าน Impeccable) · ห้าม chart-secondary (ม่วง = buyer)
 * ช่วงของ Apex ต้องมี from/to เป็นตัวเลขจริงเสมอ (ห้าม undefined)
 */
import { getColor } from '@/utils/helpers'

type Names = { none: string; l1: string; l2: string; l3: string; l4: string }

export function heatmapRanges(max: number, n: Names, fmtVal: (v: number) => string) {
  const m = max > 0 ? max : 1
  const q = (x: number) => Math.round(m * x * 100) / 100
  // ป้าย legend บอกช่วงค่าของแต่ละระดับ (ชื่อ + ค่าต่ำ–สูง) ให้อ่านสีเป็นตัวเลขได้
  const nm = (label: string, lo: number, hi: number) => `${label} ${fmtVal(lo)}–${fmtVal(hi)}`
  return [
    { from: 0, to: 0, name: n.none, color: getColor('chart-gray') },
    { from: 0.01, to: q(0.25), name: nm(n.l1, 0, q(0.25)), color: getColor('chart-primary', 0.3) },
    { from: q(0.25) + 0.01, to: q(0.5), name: nm(n.l2, q(0.25), q(0.5)), color: getColor('chart-primary', 0.55) },
    { from: q(0.5) + 0.01, to: q(0.75), name: nm(n.l3, q(0.5), q(0.75)), color: getColor('chart-primary', 0.8) },
    { from: q(0.75) + 0.01, to: m, name: nm(n.l4, q(0.75), m), color: getColor('chart-primary') },
  ]
}

/** กันชื่อแกนซ้ำหลังตัดคำ (Apex รวมช่องที่ x ซ้ำกัน) */
export function uniqueLabels(names: string[], max: number): string[] {
  const cut = (n: string, len: number) => (n.length > len ? `${n.slice(0, len)}…` : n)
  const lens = names.map(() => max)
  // ชื่อที่ตัดแล้วซ้ำกัน → ขยายความยาวของชื่อที่ซ้ำจนต่างกัน (ไม่เติมเลขต่อท้าย) · ซ้ำจริงทั้งชื่อเต็ม = ปล่อยซ้ำ
  for (let guard = 0; guard < 60; guard++) {
    let changed = false
    names.forEach((n, i) => {
      const dup = names.some((m, j) => j !== i && m !== n && cut(m, lens[j]) === cut(n, lens[i]))
      if (dup && lens[i] < n.length) { lens[i] += 3; changed = true }
    })
    if (!changed) break
  }
  return names.map((n, i) => cut(n, lens[i]))
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

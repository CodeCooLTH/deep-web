import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// [blocker] ห้ามมี hook ใต้ early return ของใบ FAILED ใน ShipmentStatusView
// prod 2026-09-21: useMemo อยู่ใต้ return นั้น ⇒ FAILED → "ลองใหม่" สำเร็จ → CREATED ในคอมโพเนนต์
// ตัวเดิม = hook เพิ่ม 1 ตัว ⇒ React #310 จอขาวทั้งหน้า (รีโปไม่มี jsdom จึงสแกนซอร์สแทน render)
describe('ShipmentStatusView — ลำดับ hook', () => {
  it('[blocker] hook ทุกตัวอยู่เหนือ early return ของ FAILED', () => {
    // ตัดคอมเมนต์ก่อนสแกน — คำเตือนในคอมเมนต์เอ่ยชื่อ hook ได้ (บทเรียน HR9 grep gate)
    const src = readFileSync('src/components/safepay/iship/ShipmentStatusView.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    const earlyReturn = src.indexOf("if (shipment.status === 'FAILED') {")
    expect(earlyReturn).toBeGreaterThan(0)
    const after = src.slice(earlyReturn)
    expect(after.match(/\buse[A-Z]\w*\(/g) ?? []).toEqual([])
  })
})

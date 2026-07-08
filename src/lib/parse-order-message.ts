/**
 * parseOrderMessage — heuristic แยกข้อมูลลูกค้า/ที่อยู่จากข้อความแชท (paste-parse, feature Quick Create Order)
 *
 * ครอบฟอร์แมตที่ seller ได้จริงจากแชท (ดูตัวอย่างใน docs/superpowers/specs/2026-07-06-quick-create-order-design.md §1):
 * - ชื่อ: หลัง "ชื่อผู้รับ:"/"ผู้รับ:"/"ชื่อ:" หรือ "ถึง(คุณ)" หรือบรรทัดแรกที่ไม่ใช่ที่อยู่/เบอร์
 * - เบอร์: 0xxxxxxxxx (มี -/space คั่นได้; หลายเบอร์ = เอาตัวแรก)
 * - ที่อยู่: ต./ตำบล/แขวง · อ./อำเภอ/เขต · จ./จังหวัด · รหัส 5 หลัก (รองรับกรณีไม่เว้นวรรค เช่น ต.Xอ.Yจ.Z12345)
 *
 * pure function, unit-testable. field ที่จับไม่ได้ = undefined (ไม่ทับ ให้ seller กรอกเอง)
 * แม่นยำ ~80% — เคส typo (จ ไม่มี . / สลับลำดับ) จะพลาดบางฟิลด์ = ยอมรับได้ (seller ตรวจ/แก้)
 */

export interface ParsedOrderMessage {
  name?: string
  phone?: string
  addressLine?: string
  subdistrict?: string
  district?: string
  province?: string
  postcode?: string
}

// จับ Thai token หลัง marker จนถึงตัวถัดไป (marker อื่น / เว้นวรรค / เลข / จบ) — รองรับกรณีไม่เว้นวรรค
function grabAfter(text: string, markers: string, stops: string): string | undefined {
  // stops ว่าง → ต้องไม่ใส่ empty-alternation (`(?=|...)` จะ match ทันที เหลือ 1 ตัวอักษร)
  const lookahead = stops ? `${stops}|[\\s\\d]|$` : `[\\s\\d]|$`
  const re = new RegExp(`(?:${markers})\\s*([\\u0E00-\\u0E7F]+?)(?=${lookahead})`, 'u')
  const m = text.match(re)
  return m?.[1]?.trim() || undefined
}

export function parseOrderMessage(text: string): ParsedOrderMessage {
  const out: ParsedOrderMessage = {}
  if (!text || !text.trim()) return out

  // ── เบอร์โทร: 0 + อีก 9 หลัก (คั่น -/space ได้) เอาตัวแรก ──
  const phoneMatch = text.match(/0\d(?:[ \-.]?\d){8}/)
  if (phoneMatch) out.phone = phoneMatch[0].replace(/\D/g, '')

  // ── รหัสไปรษณีย์: เลข 5 หลักที่ไม่ติดกับเลขอื่น (กันจับกลางเบอร์ 10 หลัก) ──
  const zip = text.match(/(?<!\d)\d{5}(?!\d)/)
  if (zip) out.postcode = zip[0]

  // ── ตำบล / อำเภอ / จังหวัด ──
  // [._] = รับทั้งจุดและ underscore หลังตัวย่อ (บาง source ส่งมาเป็น ต_/อ_/จ_ แทน ต./อ./จ.)
  out.subdistrict = grabAfter(text, 'ตำบล|ต[._]|แขวง', 'อำเภอ|อ[._]|เขต|จังหวัด|จ[._]')
  out.district = grabAfter(text, 'อำเภอ|อ[._]|เขต', 'จังหวัด|จ[._]')
  out.province = grabAfter(text, 'จังหวัด|จ[._]', '')

  // ── ชื่อ ──
  const named = text.match(/(?:ชื่อผู้รับ|ผู้รับ|ชื่อ)\s*[:：]\s*(.+)/)
  if (named) {
    out.name = named[1].trim()
  } else {
    const tho = text.match(/ถึง(?:คุณ)?\s*(.+)/)
    if (tho) {
      out.name = tho[1].trim()
    } else {
      // บรรทัดแรกที่ไม่มีเลข + ไม่มี marker ที่อยู่/เบอร์ = ชื่อ
      const firstLine = text
        .split('\n')
        .map((l) => l.trim())
        .find(
          (l) =>
            l &&
            !/\d/.test(l) &&
            !/ตำบล|ต[._]|แขวง|อำเภอ|อ[._]|เขต|จังหวัด|จ[._]|โทร|เบอร์|หมู่|ม[._]|เลขที่|สรุป|ยอด/.test(l),
        )
      if (firstLine) out.name = firstLine
    }
  }

  // ── addressLine: บรรทัดที่มี บ้านเลข/หมู่/ถนน — ตัด label "ที่อยู่:" + ตัดก่อน ต./ตำบล ──
  for (const raw of text.split('\n')) {
    let l = raw.trim()
    if (!l || /โทร|เบอร์|ชื่อผู้รับ|สรุป|ยอด/.test(l)) continue
    l = l.replace(/^(?:ที่อยู่|บ้านเลขที่)\s*[:：]?\s*/u, '')
    if (/หมู่|ม\.?\s?\d|เลขที่|บ้าน|^\d/.test(l)) {
      const cut = l.search(/ตำบล|ต[._]|แขวง/)
      out.addressLine = (cut > 0 ? l.slice(0, cut) : l).trim()
      break
    }
  }

  return out
}

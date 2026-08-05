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

/**
 * รายชื่อจังหวัด — สะกดตามชุดข้อมูลที่อยู่ของ iShip (public/data/iship-address.json) เป๊ะ ๆ
 *
 * มีไว้เพื่อจับจังหวัดที่ "ไม่มี จ. นำหน้า" ซึ่งเป็นรูปแบบปกติของที่อยู่ กทม.
 * ("… แขวงคลองตัน เขตคลองเตย กรุงเทพ 10110") เดิมกรณีนี้ได้ตำบล/อำเภอครบแต่จังหวัดว่าง
 * ปุ่มที่อยู่จึงขึ้นเหมือนเลือกสำเร็จ (บรรทัดเด่นคือ ต./อ.) แต่บันทึกไม่ผ่านเพราะจังหวัด
 * เป็นช่องบังคับ (FR-6.5) — user report 2026-08-02
 *
 * ห้ามแก้การสะกดให้ต่างจากชุดข้อมูลนั้น: ค่าที่ได้ตรงนี้ถูกส่งต่อไปเปิดพัสดุจริง
 * (กทม. ในชุดข้อมูลคือ "กรุงเทพ" แล้ว normalizeProvince ใน lib/iship/mapping.ts
 * เป็นคนแปลงเป็น "กรุงเทพมหานคร" ตอนยิงออก)
 */
const PROVINCES = [
  'กระบี่', 'กรุงเทพ', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี',
  'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'ตรัง', 'ตราด', 'ตาก',
  'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี',
  'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี',
  'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'ยะลา', 'ยโสธร', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ร้อยเอ็ด',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระบุรี', 'สระแก้ว', 'สิงห์บุรี', 'สุพรรณบุรี', 'สุราษฎร์ธานี',
  'สุรินทร์', 'สุโขทัย', 'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์',
  'อุทัยธานี', 'อุบลราชธานี', 'อ่างทอง', 'เชียงราย', 'เชียงใหม่', 'เพชรบุรี', 'เพชรบูรณ์',
  'เลย', 'แพร่', 'แม่ฮ่องสอน',
]

const BANGKOK = 'กรุงเทพ'

/**
 * ชื่อนี้อยู่ในชุดข้อมูล 77 จังหวัดจริงไหม (เทียบหลัง canonicalProvince แล้ว)
 *
 * มีไว้ให้ฝั่งที่ต้อง "จับคู่กับข้อมูลอื่นที่คีย์ด้วยชื่อจังหวัด" — เช่นแผนที่บนแดชบอร์ดที่ระบายสี
 * จาก public/data/thailand-provinces.json (ไฟล์นั้นสะกดชื่อตาม PROVINCES ชุดนี้เป๊ะ)
 * ชื่อที่สะกดเพี้ยนต้องถูกตีเป็น "ไม่ระบุ" ตั้งแต่ต้นทาง ไม่ใช่ปล่อยให้ไปโผล่ในรายการ
 * แล้วแผนที่ไม่ระบายสีให้ ซึ่งอ่านเหมือนระบบพัง
 */
export function isKnownProvince(name: string | undefined): boolean {
  return !!name && PROVINCES.includes(name)
}

/**
 * เบอร์โทรพร้อม label — ใช้ "ตัดออกจากบรรทัด" ก่อนมองหาที่อยู่
 *
 * เดิมบรรทัดที่มีคำว่า โทร/เบอร์ ถูกข้ามทั้งบรรทัด ทำให้ข้อความที่ร้านได้จริงบ่อยที่สุด
 * (ชื่อ + ที่อยู่ + เบอร์ อยู่บรรทัดเดียวกัน) ไม่ได้ "ที่อยู่" เลยทั้งที่มีอยู่ในข้อความ
 */
const PHONE_WITH_LABEL = /(?:โทร(?:ศัพท์)?|เบอร์(?:โทร)?|tel\.?)?\s*[:：]?\s*0\d(?:[ \-.]?\d){8}\/?/giu

/** คำที่บอกว่าส่วนนำหน้าเป็น "ส่วนหนึ่งของที่อยู่" ไม่ใช่ชื่อคน — ห้ามตัดทิ้ง */
const ADDRESS_WORDS = /หมู่|บ้าน|เลขที่|ซอย|ซ\.|ถนน|ถ\.|ที่อยู่|ห้อง|อาคาร|ตึก|ชั้น|คอนโด|หมู่บ้าน/

/** ตัดเบอร์โทรออกแล้วบีบช่องว่าง — คืนบรรทัดที่พร้อมเอาไปหาที่อยู่ */
function stripPhone(line: string): string {
  return line.replace(PHONE_WITH_LABEL, ' ').replace(/\s{2,}/g, ' ').trim()
}

/**
 * หาชื่อจังหวัดในข้อความตรง ๆ (กรณีไม่มี marker "จ.")
 *
 * เลือกตัวที่อยู่ "ท้ายสุด" เพราะที่อยู่ไทยวางจังหวัดไว้ก่อนรหัสไปรษณีย์เสมอ และชื่อจังหวัด
 * หลายชื่อไปโผล่ในชื่ออำเภอด้วย (อ.เมืองน่าน, อ.เมืองเลย) — ตัวท้ายสุดจึงตรงเจตนากว่า
 */
function findProvinceByName(text: string): string | undefined {
  let best: { idx: number; name: string } | undefined
  for (const p of PROVINCES) {
    const idx = text.lastIndexOf(p)
    if (idx === -1) continue
    if (!best || idx > best.idx || (idx === best.idx && p.length > best.name.length)) {
      best = { idx, name: p }
    }
  }
  return best?.name
}

/**
 * ชื่อจังหวัดที่ร้านพิมพ์เอง → สะกดแบบชุดข้อมูล (กรุงเทพมหานคร / กทม. → กรุงเทพ)
 *
 * export ตั้งแต่ 2026-08-05: การ์ด "ยอดขายตามจังหวัด" บนแดชบอร์ดอ่าน Order.shippingAddress
 * ซึ่งเป็น Json ที่คนกรอกเอง จึงต้อง normalize ด้วยตัวเดียวกับตอนแยกข้อความเข้ามา ไม่งั้น
 * "กรุงเทพมหานคร" กับ "กรุงเทพ" จะกลายเป็นคนละจังหวัดบนแผนที่เดียวกัน
 */
export function canonicalProvince(v: string | undefined): string | undefined {
  if (!v) return undefined
  const s = v.trim()
  if (!s) return undefined
  if (s.startsWith('กรุงเทพ') || /^กทม\.?$/.test(s)) return BANGKOK
  return s
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
  out.province = canonicalProvince(grabAfter(text, 'จังหวัด|จ[._]', ''))

  // ไม่มี marker "จ." — ที่อยู่ กทม. เขียนแบบนี้เป็นปกติ ("แขวง… เขต… กรุงเทพ 10110")
  // และต่างจังหวัดก็มีคนพิมพ์ชื่อจังหวัดลอย ๆ ท้ายบรรทัด. จังหวัดเป็นช่องบังคับตอนบันทึก
  // จึงต้องพยายามหาให้เจอ ไม่ใช่ปล่อยว่างแล้วให้ไปติดตอนกดบันทึก (user report 2026-08-02)
  if (!out.province) {
    const byName = findProvinceByName(text)
    // แขวง+เขต คู่กันมีแต่ใน กทม. — ใช้เป็นตัวชี้ขั้นสุดท้ายเมื่อไม่มีชื่อจังหวัดในข้อความเลย
    if (byName) out.province = byName
    else if (/กทม/.test(text) || (/แขวง/.test(text) && /เขต/.test(text))) out.province = BANGKOK
  }

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

  // normalize ชื่อ: _ → เว้นวรรค (บาง source ใช้ _ แทนช่องว่างระหว่างชื่อ-นามสกุล เช่น "เกรียงศักดิ์_ชุมภูธิมา")
  if (out.name) out.name = out.name.replace(/_/g, ' ').replace(/\s{2,}/g, ' ').trim()

  // ── addressLine: บรรทัดที่มี บ้านเลข/หมู่/ถนน — ตัดเบอร์ออกก่อน + ตัด label "ที่อยู่:" + ตัดก่อน ต./ตำบล ──
  for (const raw of text.split('\n')) {
    // ตัดเบอร์ทิ้งแทนการข้ามทั้งบรรทัด — ไม่งั้นข้อความบรรทัดเดียว (ชื่อ+ที่อยู่+เบอร์)
    // จะไม่ได้ที่อยู่เลย ทั้งที่ ต./อ./จ. จับได้ครบ → ปุ่มดูเหมือนเลือกสำเร็จแต่บันทึกไม่ผ่าน
    let l = stripPhone(raw)
    if (!l || /ชื่อผู้รับ|สรุป|ยอด/.test(l)) continue
    l = l.replace(/^(?:ที่อยู่|บ้านเลขที่)\s*[:：]?\s*/u, '')
    if (/หมู่|ม\.?\s?\d|เลขที่|บ้าน|^\d/.test(l)) {
      const cut = l.search(/ตำบล|ต[._]|แขวง/)
      let candidate = (cut > 0 ? l.slice(0, cut) : l).trim()
      // "สมชาย ใจดี 99/9 ม.5" → ตัดชื่อคนที่นำหน้าบ้านเลขที่ออก (และเก็บเป็นชื่อถ้ายังไม่มี)
      const lead = candidate.match(/^([\u0E00-\u0E7F]+(?:\s+[\u0E00-\u0E7F]+)*)\s+(?=\d)/u)
      if (lead && !ADDRESS_WORDS.test(lead[1])) {
        candidate = candidate.slice(lead[0].length).trim()
        if (!out.name) out.name = lead[1].trim()
      }
      if (candidate) {
        out.addressLine = candidate
        break
      }
    }
  }

  // สำรอง: ไม่มีบรรทัดไหนเข้าเกณฑ์ "บ้านเลขที่/หมู่" เลย (คอนโด/อาคาร/ห้อง) — หยิบบรรทัดที่
  // ยังมีตัวเลขและไม่ใช่ชื่อ/ตำบล-อำเภอ-จังหวัด/รหัสไปรษณีย์ล้วน ๆ มาแทน ดีกว่าปล่อยว่าง
  // แล้วให้ร้านไปเจอตอนกดบันทึก (ร้านตรวจ/แก้ในฟอร์มได้อยู่แล้ว)
  if (!out.addressLine) {
    for (const raw of text.split('\n')) {
      const l = stripPhone(raw)
      if (!l || l === out.name) continue
      if (/ตำบล|ต[._]|แขวง|อำเภอ|อ[._]|เขต|จังหวัด|จ[._]|สรุป|ยอด|ชื่อผู้รับ/.test(l)) continue
      if (!/\d/.test(l) || /^\d{5}$/.test(l)) continue
      out.addressLine = l
      break
    }
  }

  return out
}

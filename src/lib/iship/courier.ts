/**
 * courier — ตัวแทนสายตาของ "ขนส่งเจ้าไหน" ในแถวออเดอร์ (user สั่ง 2026-08-04)
 *
 * user ขอโลโก้ขนส่ง แต่ทั้งโปรเจกต์มีไฟล์โลโก้ขนส่งอยู่ไฟล์เดียวคือ Flash (user ส่งมาเอง) ส่วน
 * `logos/iship.jpeg` เป็นโลโก้ *แพลตฟอร์ม* คนละอัน และ API ของ iShip ก็ไม่ส่งโลโก้มาด้วย
 * (`IShipCourier` มีแค่ `code` กับ `name`) — เจ้าที่ยังไม่มีไฟล์จึงตกไปใช้ตัวย่อ
 *
 * สำคัญ: จับคู่ที่ระดับ **แบรนด์** ไม่ใช่ courierCode รายตัว เพราะบัญชี iShip จริงของร้าน (ภาพจาก
 * prod 2026-08-04) มีตัวเลือกถึง 17 รายการ แต่ส่วนใหญ่เป็น "แพ็กเกจ" ของแบรนด์เดียวกัน:
 *   Flash Thunder / Flash100CM / Flash Pro OK / Flash Pro DD / Flash Pro DD BULKY / Flash Live ผลไม้
 *   KEX Express / KEX Jumbo · ไปรษณีย์ไทย (EMS) X / (EMS) Bulky · DHL eCommerce / DHL Next day
 * แมปทีละรหัสแปลว่าต้องมานั่งเติมทุกครั้งที่ iShip ออกแพ็กเกจใหม่ แล้วของใหม่จะเงียบ ๆ ตกไปเป็น
 * ตัวย่อโดยไม่มีใครรู้ — จับที่ชื่อแบรนด์ทีเดียวจบและครอบของที่ยังไม่เกิดด้วย
 *
 * เทียบกับทั้ง code และ name เพราะสองทางเก็บคนละอย่าง:
 *   iShip  → courierCode "FlashExpressA" + courierName "Flash Thunder"
 *   ส่งเอง → ShipmentTracking.provider เก็บชื่อที่ผู้ขายเลือก ("Kerry Express") ไม่มีรหัส
 */

type CourierBrand = {
  /**
   * รหัสแบรนด์ที่ **ระบบเก็บลงฐาน** เมื่อร้านเลือกขนส่งจาก dropdown (feature 00056 · D-2)
   *
   * 🛑 ต้องเป็นรหัส ไม่ใช่ข้อความอิสระ — ร้านพิมพ์เองได้ "เคอรี่/Kerry/KEX/kerry express"
   * ซึ่งเป็นแบรนด์เดียวกันทั้งหมดแต่จับคู่โลโก้/สรุปยอดได้ไม่ตรงกันสักครั้ง
   */
  code: string
  /** ชื่อที่ผู้ใช้เห็นใน dropdown — SSOT เดียว ห้ามพิมพ์รายชื่อขนส่งซ้ำในคอมโพเนนต์ (HR16) */
  label: string
  /** จับกับ `${courierCode} ${courierName}` — ครอบทุกแพ็กเกจของแบรนด์เดียว */
  match: RegExp
  /** path ใน public/ — null = ยังไม่มีไฟล์ ให้ตกไปใช้ตัวย่อ */
  logo: string | null
  /**
   * โผล่ใน dropdown "ขนส่งขากลับ" ไหม — `false` สำหรับแพ็กเกจของ iShip เอง ซึ่งไม่ใช่
   * "ขนส่งเจ้าอื่นที่ร้านไปเปิดพัสดุเอง" แต่เป็น *วิธีคืน* ข้อแรก (radio ไม่ใช่ dropdown)
   */
  selectable?: boolean
}

/**
 * สำคัญ: ลำดับมีความหมาย: ตัวแรกที่ match ชนะ — วางตัวที่จำเพาะกว่าไว้ก่อนเสมอ
 * ("iShip Exclusive" ต้องไม่ถูกกฎอื่นดักไปก่อน)
 */
const COURIER_BRANDS: CourierBrand[] = [
  // แพ็กเกจของ iShip เอง — ใช้โลโก้แพลตฟอร์มที่มีอยู่แล้ว
  { code: 'ISHIP', label: 'iShip', match: /iship/i, logo: '/images/logos/iship.jpeg', selectable: false },
  // user ส่งไฟล์มาเอง 2026-08-04 — 447x447 พื้นเหลืองเต็มกรอบ ไม่โปร่งใส (ดู object-cover ที่ OrderCard)
  { code: 'FLASH', label: 'Flash Express', match: /flash/i, logo: '/images/logos/flash-express.jpeg' },
  // user อัปโหลดมาครบทุกแบรนด์ 2026-08-04
  { code: 'KERRY', label: 'Kerry Express', match: /kerry|kex/i, logo: '/images/logos/kerry-express.jpeg' },
  { code: 'THAIPOST', label: 'ไปรษณีย์ไทย', match: /thailand\s*post|ไปรษณีย์|\bthp\b|\bems\b/i, logo: '/images/logos/thaipost.png' },
  { code: 'DHL', label: 'DHL', match: /dhl/i, logo: '/images/logos/dhl.webp' },
  { code: 'BEST', label: 'BEST Express', match: /best/i, logo: '/images/logos/best-express.jpeg' },
  { code: 'SPX', label: 'SPX Express', match: /spx|shopee/i, logo: '/images/logos/spx-express.webp' },
  { code: 'FUZE', label: 'Fuze Post', match: /fuze/i, logo: '/images/logos/fuze-post.png' },
  // ชื่อไฟล์สะกด "jandt" (& ในชื่อไฟล์ทำให้ URL ต้อง escape) — คนละสะกดกับชื่อแบรนด์ "J&T"
  { code: 'JANDT', label: 'J&T Express', match: /j\s*&\s*t|jnt|jandt/i, logo: '/images/logos/jandt-express.png' },
]

/**
 * แบรนด์ของขนส่งเจ้านี้ — `null` = ไม่รู้จัก (รวมกรณี `OTHER` ที่ร้านเลือก "อื่น ๆ")
 *
 * 🛑 เทียบ **รหัสแบรนด์แบบตรงตัวก่อน** แล้วค่อยตกไปที่ regex: ตั้งแต่ 00056 ระบบเก็บ
 * `OrderReturn.returnCourierCode` เป็นรหัสของเราเอง ('THAIPOST', 'JANDT') ซึ่ง regex เดิม
 * ที่เขียนไว้จับชื่อจริงของ iShip **จับไม่ได้** ('THAIPOST' ไม่ match /thailand\s*post/)
 * ⇒ ถ้าไม่เทียบรหัสก่อน โลโก้จะหายเงียบ ๆ เฉพาะเจ้าที่ร้านเลือกเอง
 */
export function courierBrandCode(courierCode?: string | null, courierName?: string | null): string | null {
  const code = (courierCode ?? '').trim().toUpperCase()
  if (code) {
    const exact = COURIER_BRANDS.find((b) => b.code === code)
    if (exact) return exact.code
  }
  const hay = `${courierCode ?? ''} ${courierName ?? ''}`.trim()
  if (!hay) return null
  return COURIER_BRANDS.find((b) => b.match.test(hay))?.code ?? null
}

/** path โลโก้ของขนส่งเจ้านี้ — null = ยังไม่มีไฟล์ ให้ผู้เรียกตกไปใช้ตัวย่อแทน */
export function courierLogoUrl(courierCode?: string | null, courierName?: string | null): string | null {
  const brand = courierBrandCode(courierCode, courierName)
  if (!brand) return null
  return COURIER_BRANDS.find((b) => b.code === brand)?.logo ?? null
}

// ─── รายชื่อขนส่งสำหรับ dropdown (feature 00056 · D-2) ────────────────────────

export const OTHER_COURIER_CODE = 'OTHER'

export type CourierOption = {
  code: string
  label: string
  /** null = ไม่มีไฟล์โลโก้ ให้ผู้เรียกใช้ `courierInitials(label)` แทน */
  logo: string | null
}

/**
 * COURIER_OPTIONS — **SSOT เดียวของ "ขนส่งมีเจ้าไหนให้เลือกบ้าง"** (HR16)
 *
 * 🛑 ห้ามพิมพ์รายชื่อขนส่งซ้ำในคอมโพเนนต์ไหนทั้งสิ้น — รายชื่อที่พิมพ์ซ้ำจะเลื่อนออกจากกัน
 * แน่นอน (จอหนึ่งมี J&T อีกจอไม่มี) และรหัสที่บันทึกลงฐานจะจับคู่โลโก้ไม่ได้
 *
 * "อื่น ๆ" อยู่ **ท้ายลิสต์เสมอ** และไม่มีโลโก้ — เป็นทางออกสำหรับขนส่งท้องถิ่น/ไรเดอร์
 * ที่เราไม่มีในรายชื่อ ไม่ใช่ตัวเลือกที่อยากให้กดเป็นอันดับแรก
 */
export const COURIER_OPTIONS: CourierOption[] = [
  ...COURIER_BRANDS.filter((b) => b.selectable !== false).map(({ code, label, logo }) => ({
    code,
    label,
    logo,
  })),
  { code: OTHER_COURIER_CODE, label: 'อื่น ๆ', logo: null },
]

/**
 * courierLabel — คำที่แสดงแทนรหัสขนส่งที่บันทึกไว้
 *
 * รับ `name` มาด้วยเพราะพัสดุที่ระบบเปิดผ่าน iShip เก็บ **ชื่อแพ็กเกจจริง** ('ไปรษณีย์ไทย (EMS) X')
 * ซึ่งจำเพาะกว่าชื่อแบรนด์และเป็นสิ่งที่ร้านเห็นตอนเลือก — ชื่อจริงจึงชนะเสมอเมื่อมี
 */
export function courierLabel(courierCode?: string | null, courierName?: string | null): string | null {
  const name = (courierName ?? '').trim()
  if (name) return name
  const code = (courierCode ?? '').trim().toUpperCase()
  if (!code) return null
  return COURIER_OPTIONS.find((o) => o.code === code)?.label ?? courierCode!.trim()
}

/**
 * ตัวย่อ 2 ตัวอักษรของชื่อขนส่ง — ตัวแทนชั่วคราวระหว่างยังไม่มีโลโก้
 *
 * กติกา: มีตั้งแต่ 2 คำขึ้นไป → อักษรแรกของสองคำแรก ("Kerry Express" → KE)
 * คำเดียว → สองตัวอักษรแรก ("DHL" → DH) ตัดอักขระที่ไม่ใช่ตัวอักษร/ตัวเลขทิ้งก่อนเสมอ
 * ("J&T Express" → JE ไม่ใช่ J&) ไม่มีชื่อเลยก็ยังต้องได้อะไรสักอย่าง จึงถอยไปใช้ code
 */
export function courierInitials(courierName?: string | null, courierCode?: string | null): string {
  const source = (courierName ?? courierCode ?? '').trim()
  if (!source) return '?'
  const words = source
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (words.length === 0) return '?'
  // ชื่อไทยห้ามหยิบข้ามคำ — "ไปรษณีย์ไทย (EMS) X" จะได้ "ไE" ไทยปนอังกฤษ อ่านไม่ออกและดูพัง
  // ใช้สองอักขระแรกของคำแรกแทน ("ไปรษณีย์ไทย" → "ไป") ชื่ออังกฤษยังใช้กติกาข้ามคำเหมือนเดิม
  if (/[\u0E00-\u0E7F]/.test(words[0])) return words[0].slice(0, 2)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return words[0].slice(0, 2).toUpperCase()
}

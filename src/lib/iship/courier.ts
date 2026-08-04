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
  /** จับกับ `${courierCode} ${courierName}` — ครอบทุกแพ็กเกจของแบรนด์เดียว */
  match: RegExp
  /** path ใน public/ — null = ยังไม่มีไฟล์ ให้ตกไปใช้ตัวย่อ */
  logo: string | null
}

/**
 * สำคัญ: ลำดับมีความหมาย: ตัวแรกที่ match ชนะ — วางตัวที่จำเพาะกว่าไว้ก่อนเสมอ
 * ("iShip Exclusive" ต้องไม่ถูกกฎอื่นดักไปก่อน)
 */
const COURIER_BRANDS: CourierBrand[] = [
  // แพ็กเกจของ iShip เอง — ใช้โลโก้แพลตฟอร์มที่มีอยู่แล้ว
  { match: /iship/i, logo: '/images/logos/iship.jpeg' },
  // user ส่งไฟล์มาเอง 2026-08-04 — 447x447 พื้นเหลืองเต็มกรอบ ไม่โปร่งใส (ดู object-cover ที่ OrderCard)
  { match: /flash/i, logo: '/images/logos/flash-express.jpeg' },
  // user อัปโหลดมาครบทุกแบรนด์ 2026-08-04
  { match: /kerry|kex/i, logo: '/images/logos/kerry-express.jpeg' },
  { match: /thailand\s*post|ไปรษณีย์|\bthp\b|\bems\b/i, logo: '/images/logos/thaipost.png' },
  { match: /dhl/i, logo: '/images/logos/dhl.webp' },
  { match: /best/i, logo: '/images/logos/best-express.jpeg' },
  { match: /spx|shopee/i, logo: '/images/logos/spx-express.webp' },
  { match: /fuze/i, logo: '/images/logos/fuze-post.png' },
  // ชื่อไฟล์สะกด "jandt" (& ในชื่อไฟล์ทำให้ URL ต้อง escape) — คนละสะกดกับชื่อแบรนด์ "J&T"
  { match: /j\s*&\s*t|jnt|jandt/i, logo: '/images/logos/jandt-express.png' },
]

/** path โลโก้ของขนส่งเจ้านี้ — null = ยังไม่มีไฟล์ ให้ผู้เรียกตกไปใช้ตัวย่อแทน */
export function courierLogoUrl(courierCode?: string | null, courierName?: string | null): string | null {
  const hay = `${courierCode ?? ''} ${courierName ?? ''}`.trim()
  if (!hay) return null
  return COURIER_BRANDS.find((b) => b.match.test(hay))?.logo ?? null
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

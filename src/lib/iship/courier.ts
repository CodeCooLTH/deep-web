/**
 * courier — ตัวแทนสายตาของ "ขนส่งเจ้าไหน" ในแถวออเดอร์ (user สั่ง 2026-08-04)
 *
 * user ขอโลโก้ขนส่ง แต่ทั้งโปรเจกต์ยังไม่มีไฟล์โลโก้แบรนด์ขนส่งสักไฟล์ (ค้น public/ ทั้งต้นไม้แล้ว
 * มีแต่ `logos/iship.jpeg` ซึ่งเป็นโลโก้ *แพลตฟอร์ม* คนละอันกับ Flash/Kerry/J&T) และ API ของ
 * iShip ก็ไม่ส่งโลโก้มาด้วย — `IShipCourier` มีแค่ `code` กับ `name`
 * user ตัดสิน: ใช้ตัวย่อไปก่อน แล้วจะหาไฟล์มาให้
 *
 * ไฟล์นี้จึงเป็น "ช่องเสียบ" ไว้แล้ว: วันที่ได้ไฟล์มา เติมแค่ COURIER_LOGO ที่เดียว UI ไม่ต้องแก้เลย
 */

/**
 * courierCode → path โลโก้ใน public/
 *
 * ตั้งใจปล่อยว่างไว้ ไม่ใส่ลิงก์โลโก้จากอินเทอร์เน็ต — ทั้งเรื่องสิทธิ์ในภาพและเรื่องที่หน้าจอ
 * ต้องไม่พึ่งโฮสต์นอกที่เราคุมไม่ได้ (ล่มเมื่อไหร่แถวออเดอร์แหว่งทันที)
 *
 * รหัสจริงที่เจอบนฐาน prod แล้ว: "FlashExpressA" (Flash Thunder)
 */
const COURIER_LOGO: Record<string, string> = {
  // user ส่งไฟล์มาเอง 2026-08-04 — โลโก้พื้นเหลืองเต็มกรอบ 447x447 (ไม่โปร่งใส) จึงเรนเดอร์ด้วย
  // object-cover + rounded ให้เป็นชิปสี่เหลี่ยมมุมมน เหมือนโลโก้ iShip ข้าง ๆ ไม่ใช่ปล่อยลอย
  // 🛑 คีย์คือ courierCode จาก iShip ไม่ใช่ชื่อที่แสดง — บนฐาน prod ค่าจริงคือ "FlashExpressA"
  //    (ชื่อแสดง "Flash Thunder") ส่วนเอกสาร API.md ยกตัวอย่างเป็น "FlashExpress" เฉย ๆ
  //    ทั้งคู่จึงต้องแมป ไม่งั้นบัญชีที่ใช้รหัสอีกแบบจะตกไปเป็นตัวย่อโดยไม่มีใครรู้
  FlashExpress: '/images/logos/flash-express.jpeg',
  FlashExpressA: '/images/logos/flash-express.jpeg',
}

/** path โลโก้ของขนส่งเจ้านี้ — null = ยังไม่มีไฟล์ ให้ผู้เรียกตกไปใช้ตัวย่อแทน */
export function courierLogoUrl(courierCode?: string | null): string | null {
  if (!courierCode) return null
  return COURIER_LOGO[courierCode] ?? null
}

/**
 * ตัวย่อ 2 ตัวอักษรของชื่อขนส่ง — ตัวแทนชั่วคราวระหว่างยังไม่มีโลโก้
 *
 * กติกา: มีตั้งแต่ 2 คำขึ้นไป → อักษรแรกของสองคำแรก ("Flash Thunder" → FT, "Kerry Express" → KE)
 * คำเดียว → สองตัวอักษรแรก ("Flash" → FL) ตัดอักขระที่ไม่ใช่ตัวอักษร/ตัวเลขทิ้งก่อนเสมอ
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
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return words[0].slice(0, 2).toUpperCase()
}

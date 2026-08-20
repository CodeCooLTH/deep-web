/**
 * resolveDisplayedPin — ตัดสินว่า "หมุดที่ควรแสดงบนจอตอนนี้คืออะไร" จาก 2 แหล่งที่ไม่ตรงกันชั่วคราว
 *
 * 🛑 ทำไมต้องเป็นฟังก์ชันแยกที่มีเทส ไม่ใช่ `initialLat != null` กลาง component:
 * บั๊กที่ `/impeccable critique` จับได้ 2026-08-14 — `ShopLocationField` บันทึกเสร็จแล้วสั่ง
 * `router.refresh()` ซึ่งเป็น round trip ไปหา server ⇒ ในช่วงที่ยังรอ RSC payload ใหม่ ค่าที่มา
 * ทาง props **ยังเป็น null อยู่** การ์ดจึงเด้งกลับไปเป็นสถานะ "ยังไม่มีหมุด" พร้อมกับ toast เขียว
 * ที่เพิ่งบอกว่าบันทึกสำเร็จ — จอสองอย่างขัดกันในเสี้ยววินาทีเดียว
 *
 * เกิดกับ **การปักหมุดครั้งแรกทุกใบ** = 100% ของร้านบน prod ณ ตอนที่เขียน (ไม่มีร้านไหนมีพิกัดเลย)
 * และมันโจมตีตรงจุดที่ product นี้ขายอยู่พอดี: ความเชื่อมั่นว่าระบบเก็บของให้จริง
 *
 * ⇒ กติกา: **ค่าที่ผู้ใช้เพิ่งทำ ชนะค่าที่มาจาก server เสมอ** จนกว่า server จะตามมาทัน
 * (เขียนกลับด้านเมื่อไรก็ได้บั๊กเดิมคืน และไม่มี gate ไหนจับได้ เพราะชนิดถูกทุกตัวอักษร —
 * ดู docs/conventions/ui-boolean-needs-a-testable-home.md)
 */

export interface PinCoordinates {
  lat: number | null;
  lng: number | null;
}

export interface DisplayedPin extends PinCoordinates {
  /** มีหมุดให้แสดงไหม — ตัวตัดสินว่าการ์ดขึ้นสถานะ "มีพิกัดแล้ว" หรือ "ยังไม่มี" */
  hasPin: boolean;
}

/**
 * @param draft   ค่าที่ผู้ใช้เพิ่งทำในหน้าจอนี้ (client state) — null = ยังไม่ได้แตะ
 * @param fromServer ค่าที่มาทาง props จาก RSC — อาจเป็นค่าเก่าชั่วคราวระหว่างรอ refresh
 */
export function resolveDisplayedPin(draft: PinCoordinates, fromServer: PinCoordinates): DisplayedPin {
  const lat = draft.lat ?? fromServer.lat;
  const lng = draft.lng ?? fromServer.lng;

  // ต้องครบคู่ถึงจะแสดงได้ — หมุดที่มีแต่ละติจูดวางบนแผนที่ไม่ได้ และลิงก์ Google Maps
  // ที่ประกอบจากค่าครึ่งเดียวจะพาไปผิดที่ (กติกาเดียวกับด่าน GEO_PAIR_REQUIRED ฝั่ง service)
  const hasPin = lat != null && lng != null;

  return { lat, lng, hasPin };
}

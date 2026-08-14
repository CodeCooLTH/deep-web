/**
 * ขอบเขตพิกัดประเทศไทย — SSOT ของเลข 4 ตัวนี้ทั้งระบบ (HR16)
 *
 * เดิมตัวเลขเดียวกันถูกเขียนซ้ำเป็น literal ใน `src/lib/validations.ts` 2 schema
 * (`ShopUpdateWithGeoSchema` และ `CreateBusinessShopSchema`) — พอมีที่เขียนที่สาม
 * (ด่านฝั่ง service ที่เพิ่มเมื่อ 2026-08-14) จะกลายเป็นสามชุดที่เลื่อนออกจากกันได้
 * โดยไม่มี `tsc` ตัวไหนฟ้อง เพราะทุกชุด "ถูก" ในตัวเอง
 *
 * ที่มาของเลข: กรอบสี่เหลี่ยมที่ครอบแผ่นดินไทยทั้งประเทศแบบหลวม ๆ (ใต้สุด อ.เบตง ~5.6N
 * เหนือสุด อ.แม่สาย ~20.5N · ตะวันตกสุด อ.แม่ฮ่องสอน ~97.3E ตะวันออกสุด อ.โขงเจียม ~105.6E)
 * เจตนาคือกัน "ค่าที่ผิดชนิดของความจริง" เช่น 0,0 (กลางอ่าวกินี) หรือพิกัดสลับ lat/lng
 * ไม่ใช่การตรวจว่าจุดนั้นอยู่ในเขตแดนจริงหรือไม่
 */
export const THAILAND_LAT_MIN = 5;
export const THAILAND_LAT_MAX = 21;
export const THAILAND_LNG_MIN = 97;
export const THAILAND_LNG_MAX = 106;

/** พิกัดคู่นี้เป็นตัวเลขจริงและอยู่ในกรอบประเทศไทยไหม
 *
 *  🛑 ต้องเป็น "คู่" เสมอ — ค่าที่มาตัวเดียวคือข้อมูลที่ใช้ไม่ได้ ไม่ใช่ข้อมูลบางส่วน
 *  (หมุดที่มีแต่ละติจูดวางบนแผนที่ไม่ได้) กติกาเดียวกับ XOR check ใน POST /api/shops/update
 */
export function isThaiCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= THAILAND_LAT_MIN &&
    lat <= THAILAND_LAT_MAX &&
    lng >= THAILAND_LNG_MIN &&
    lng <= THAILAND_LNG_MAX
  );
}

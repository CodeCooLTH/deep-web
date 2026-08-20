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
export type ParsedCoordinate =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "EMPTY" | "SHORT_LINK" | "UNPARSEABLE" | "OUT_OF_RANGE" };

/**
 * แกะพิกัดจากสิ่งที่ผู้ใช้พิมพ์/วางลงช่อง "กรอกพิกัดเอง"
 *
 * ทำไมต้องมี: นี่คือ **เส้นทางเดียวที่ผู้ใช้คีย์บอร์ด/screen reader ปักหมุดได้จริง** — canvas ของ
 * Leaflet ไม่มีปุ่มไหนวาง marker ได้เลย ปุ่ม "บันทึกตำแหน่ง" จึง disabled ค้างตลอดกาลสำหรับคนกลุ่มนี้
 * (WCAG 2.1.1) ⇒ ฟังก์ชันนี้ไม่ใช่ของอำนวยความสะดวก แต่เป็น accessible equivalent ที่ต้องเชื่อถือได้
 *
 * รับ 3 รูป: `13.7563, 100.5018` (คั่น comma หรือช่องว่าง) · ลิงก์ Google Maps ที่มี `@lat,lng,zoom`
 * · ลิงก์ที่มี `?q=lat,lng`
 *
 * 🛑 ปฏิเสธลิงก์ย่อ (`maps.app.goo.gl`) แยกเป็น reason ของตัวเอง ไม่ยุบรวมกับ "แกะไม่ออก" —
 * เพราะสองอันนี้บอกผู้ใช้ให้ทำคนละอย่าง (อันหนึ่ง "เปิดแล้วคัดลอกลิงก์เต็ม" อีกอัน "ตรวจรูปแบบ")
 * การให้ข้อความเดียวกันคือการสั่งให้เขาลองสิ่งที่ไม่มีทางสำเร็จซ้ำ ๆ
 *
 * 🛑 **สถานะวันที่ commit (2026-08-20): ยังไม่มีผู้เรียก** — ช่อง "กรอกพิกัดเอง" ใน
 * `ShopLocationField.tsx` ยังไม่ถูกสร้าง ⇒ ช่องโหว่ WCAG 2.1.1 ที่ย่อหน้าบนอธิบายไว้
 * **ยังเปิดอยู่จริง** อย่าอ่านฟังก์ชันนี้ว่าปิดไปแล้ว (docs/conventions/known-limitation-vs-unfinished.md)
 */
export function parseCoordinateInput(raw: string): ParsedCoordinate {
  const s = (raw ?? "").trim();
  if (!s) return { ok: false, reason: "EMPTY" };

  // ลิงก์ย่อต้องดักก่อนทุกอย่าง — ตัวเลขใน hash ของมันอาจหลุดเข้า regex ตัวเลขด้านล่างได้
  if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s)) return { ok: false, reason: "SHORT_LINK" };

  const pair = extractPair(s);
  if (!pair) return { ok: false, reason: "UNPARSEABLE" };
  if (!isThaiCoordinate(pair.lat, pair.lng)) return { ok: false, reason: "OUT_OF_RANGE" };
  return { ok: true, lat: pair.lat, lng: pair.lng };
}

function extractPair(s: string): { lat: number; lng: number } | null {
  // รูปลิงก์ Google Maps: /@13.7563,100.5018,17z — ต้องลองก่อนรูปตัวเลขเปล่า เพราะ URL
  // มีตัวเลขอื่นปนอยู่เยอะ (zoom, id) ที่ regex ตัวเลขเปล่าจะคว้าผิดคู่
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };

  // รูป ?q=13.7563,100.5018 (รองรับ %2C ที่เบราว์เซอร์ encode ให้)
  const q = s.match(/[?&]q=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i);
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) };

  // ตัวเลขคู่ล้วน — บังคับว่าทั้งสตริงต้องเป็นคู่นี้เท่านั้น (anchor ^...$) ไม่งั้นข้อความยาว ๆ
  // ที่บังเอิญมีตัวเลข 2 ตัวจะถูกตีเป็นพิกัด
  const plain = s.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]) };

  return null;
}

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

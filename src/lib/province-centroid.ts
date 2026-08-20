/**
 * หา "จุดกึ่งกลางจังหวัด" จาก GeoJSON ที่โปรเจกต์มีอยู่แล้ว (`public/data/thailand-provinces.json`)
 *
 * ทำไมต้องมี: แผนที่ปักหมุดร้านเปิดมาที่ `[13.0, 101.0]` zoom 6 (ประเทศไทยทั้งประเทศ) เสมอ และ
 * ไม่ขยับเลยแม้ผู้ใช้เพิ่งเลือกที่อยู่ไปเมื่อ 3 วินาทีก่อน ⇒ ทางเดียวคือ pinch-zoom ไล่หาเอง ~7 ระดับ
 * บนกระเบื้อง OSM ที่ไทยแทบไม่มีป้ายชื่อร้าน ผลจริงคือหมุดหยาบระดับอำเภอที่หน้าตาเหมือนหมุดถูกต้อง
 *
 * 🛑 **ระดับจังหวัดคือเพดานของวิธีนี้ ไม่ใช่ทางเลือกในการออกแบบ** — ตรวจแล้วว่าในเครื่องไม่มี
 * centroid ระดับตำบล/อำเภอเลย: `thai-address-database` และ `public/data/iship-address.json`
 * คืนแค่ชื่อ ไม่มีพิกัด · ไฟล์เดียวที่มีพิกัดจริงคือ geojson ชุดนี้ซึ่งเป็น polygon ราย 77 จังหวัด
 * ⇒ ตัวนี้ทำหน้าที่ "จังหวะแรกที่ทำงานได้เสมอแบบ offline" ส่วนความละเอียดระดับตำบลต้องพึ่ง
 * forward geocode ซึ่งล้มได้ (rate limit/timeout) จึงเป็นจังหวะที่สองแบบ best-effort
 *
 * 🛑 **สถานะวันที่ commit (2026-08-20): ยังไม่มีผู้เรียก** — `MapPicker` ยังเปิดที่
 * `[13.0, 101.0]` zoom 6 เหมือนเดิมทุกครั้ง อาการที่ย่อหน้าบนบรรยายไว้**ยังเกิดอยู่บน prod**
 */

import { canonicalProvince } from "@/lib/parse-order-message";

export interface LatLng {
  lat: number;
  lng: number;
}

/** รูปร่างเท่าที่ฟังก์ชันนี้ต้องใช้ — ไม่ผูกกับ type ของ GeoJSON ทั้งสเปก */
export interface ProvinceFeatureCollection {
  features: Array<{
    properties?: { name?: string } | null;
    geometry?: { type?: string; coordinates?: unknown } | null;
  }>;
}

/**
 * @param name ชื่อจังหวัดจากที่ผู้ใช้เลือก/กรอก (สะกดแบบไหนก็ได้)
 *
 * 🛑 ต้อง normalize ด้วย `canonicalProvince` เสมอ — ชุดข้อมูล 2 ฝั่งตรงกัน 76/77 จังหวัด
 * ตัวที่ต่างคือ **กรุงเทพฯ** (`thai-address-database` เขียน "กรุงเทพมหานคร" ส่วน geojson เขียน
 * "กรุงเทพ") ซึ่งบังเอิญเป็นจังหวัดที่มีร้านมากที่สุด ⇒ ถ้าเทียบสตริงตรง ๆ จะพลาดเฉพาะจังหวัดที่
 * กระทบคนเยอะที่สุด โดยที่อีก 76 จังหวัดทำงานถูกต้อง = บั๊กที่ทดสอบผ่านเกือบหมดแล้วไม่มีใครเอะใจ
 * (ห้ามเขียน normalize ตัวใหม่ที่นี่ — `canonicalProvince` เป็น SSOT ของกฎนี้อยู่แล้ว ดู HR16)
 */
export function findProvinceCentroid(
  geo: ProvinceFeatureCollection | null | undefined,
  name: string | null | undefined,
): LatLng | null {
  const target = canonicalProvince(name ?? undefined);
  if (!geo?.features || !target) return null;

  const feature = geo.features.find((f) => f?.properties?.name === target);
  if (!feature?.geometry) return null;

  const rings = collectRings(feature.geometry.type, feature.geometry.coordinates);
  if (!rings.length) return null;

  // 🛑 ใช้วงที่ "จุดเยอะที่สุด" ไม่ใช่เฉลี่ยทุกวงรวมกัน — จังหวัดที่มีเกาะหรือรูปทรงยาว
  // (ภูเก็ต สุราษฎร์ธานี ชุมพร ตราด) จะได้ centroid ลอยกลางทะเลถ้าเฉลี่ยเกาะเล็ก ๆ เข้าไปด้วย
  // จำนวนจุดเป็นตัวแทนของ "วงหลัก" ที่ดีพอโดยไม่ต้องคำนวณพื้นที่จริง
  const main = rings.reduce((a, b) => (b.length > a.length ? b : a));
  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of main) {
    sumLng += lng;
    sumLat += lat;
  }
  return { lat: sumLat / main.length, lng: sumLng / main.length };
}

/** คลี่ Polygon / MultiPolygon ให้เป็นรายการวง (ring) ของคู่ [lng, lat] */
function collectRings(type: string | undefined, coords: unknown): Array<Array<[number, number]>> {
  if (!Array.isArray(coords)) return [];
  // GeoJSON เก็บเป็น [lng, lat] ไม่ใช่ [lat, lng] — สลับตรงนี้ที่เดียวตอนบวก (ดู loop ข้างบน)
  if (type === "Polygon") return coords.filter(isRing);
  if (type === "MultiPolygon") return coords.flatMap((poly) => (Array.isArray(poly) ? poly.filter(isRing) : []));
  return [];
}

function isRing(v: unknown): v is Array<[number, number]> {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    Array.isArray(v[0]) &&
    typeof v[0][0] === "number" &&
    typeof v[0][1] === "number"
  );
}

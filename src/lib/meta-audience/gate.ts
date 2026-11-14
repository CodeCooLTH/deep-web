// feature 00092 — สวิตช์ระบบ + ร้านทดลอง (FR-001) semantics เดียวกับ src/lib/meta-capi/gate.ts

/** META_AUDIENCE_PILOT_SHOP_IDS (คั่น comma) — ตั้งไว้ = เฉพาะร้านในรายชื่อ · ไม่ตั้ง = ทุกร้าน */
const pilotShopIds = (): string[] =>
  (process.env.META_AUDIENCE_PILOT_SHOP_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** OPEN_META_AUDIENCE=1 เท่านั้นที่เปิด — ไม่ตั้ง = ปิดทุกร้าน (deploy โดยไม่ตั้ง env ต้องไม่ส่งข้อมูลลูกค้าออกเอง) */
export function isMetaAudienceEnabled(shopId?: string | null): boolean {
  if ((process.env.OPEN_META_AUDIENCE || "").trim() !== "1") return false;
  const pilots = pilotShopIds();
  return pilots.length === 0 || (!!shopId && pilots.includes(shopId));
}

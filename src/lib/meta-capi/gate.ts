// feature 00089 — สวิตช์ระบบ + ร้านทดลอง (FR-001 · BR-CAPI-08) แบบเดียวกับ src/lib/flash/gate.ts

/** META_CAPI_PILOT_SHOP_IDS (คั่น comma) — ตั้งไว้ = เฉพาะร้านในรายชื่อ · ไม่ตั้ง = ทุกร้าน */
const pilotShopIds = (): string[] =>
  (process.env.META_CAPI_PILOT_SHOP_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** OPEN_META_CAPI=1 เท่านั้นที่เปิด — ไม่ตั้ง = ปิดทุกร้าน (deploy โดยไม่ตั้ง env ต้องไม่เปิดเอง) */
export function isMetaCapiEnabled(shopId?: string | null): boolean {
  if ((process.env.OPEN_META_CAPI || "").trim() !== "1") return false;
  const pilots = pilotShopIds();
  return pilots.length === 0 || (!!shopId && pilots.includes(shopId));
}

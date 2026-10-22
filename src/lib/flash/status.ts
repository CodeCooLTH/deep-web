// feature 00084 — สถานะ/ตัวอ่านข้อมูลขาเข้าของ Flash (TFR-FLASH-017/019) pure ทั้งไฟล์
//
// 🛑 ไฟล์นี้ห้ามผลิต `payment_success` (BR-FLASH-40/44) — เงินเก็บปลายทางของ Flash ไม่มีสัญญาณยืนยัน
// ตารางด้านล่างไม่มีค่านั้น และเทส property บังคับ

import { FLASH_COST_COMPONENTS, FLASH_LIMITS } from "./constants";
import { gramToKg, parseSatangStrict, satangToBaht } from "./units";

/** ไม่มี route เลย = ยังไม่ถูกรับ */
export const FLASH_NO_ROUTE_STATUS = "order_success";

const STATE_TO_CARRIER: Record<number, string> = {
  1: "picked_up", 2: "in_transit", 3: "progress", 4: "issue",
  5: "delivered", 6: "issue", 7: "return", 8: "close", 9: "cancelled",
};

/** state ของ Flash (เลขหรือสตริงเลข) → carrierStatus; ค่าอื่น/parse ไม่ได้ = null (ไม่เปลี่ยนสถานะ) */
export function mapFlashState(state: unknown): string | null {
  const n = typeof state === "number" ? state : typeof state === "string" && /^\d{1,2}$/.test(state.trim()) ? Number(state) : NaN;
  return Number.isInteger(n) ? (STATE_TO_CARRIER[n] ?? null) : null;
}

/** Flash COD ถึงมือผู้รับแล้วจบ — ไม่รอ payment_success ที่ไม่มีวันมา */
export function isFlashTrackingSettled(code?: string | null): boolean {
  return code === "delivered" || code === "close" || code === "cancelled" || code === "return_success";
}

const MARKER_TEXT: Record<string, string> = {
  "14": "ผู้รับเลื่อนวันรับ", "40": "ไม่อยู่หรือไม่รับสาย", "17": "ปฏิเสธรับ", "23": "ที่อยู่ผิด",
  "25": "เบอร์ผิด", "26": "ยอด COD ไม่ถูก", "29": "เบอร์ไม่มีอยู่จริง",
};
export const FLASH_MARKER_FALLBACK = "พัสดุมีปัญหา (สาเหตุตามที่ Flash แจ้ง)";

/** markerCategory → ข้อความไทย; ไม่มีค่า = null */
export function describeMarker(code: unknown): string | null {
  if (code == null || String(code).trim() === "") return null;
  return MARKER_TEXT[String(code).trim()] ?? FLASH_MARKER_FALLBACK;
}

/** webhook courier state → ShipmentPickup.status; ค่านอกชุดไม่มีคีย์ (= คงสถานะ) */
export const FLASH_PICKUP_STATE: Readonly<Record<number, "REQUESTED" | "ACCEPTED" | "CLOSED" | "CANCELLED">> = {
  0: "REQUESTED", 1: "ACCEPTED", 2: "CLOSED", 3: "ACCEPTED", 4: "CANCELLED",
};

const EPOCH_MIN = 1e9; // 2001 — ต่ำกว่านี้ไม่ใช่ epoch วินาทีที่สมเหตุสมผล
const EPOCH_MAX = 4.1e9; // ~2100 — ค่ามิลลิวินาทีจะเกินเพดานนี้ → null ดีกว่าเดา

/** epoch วินาที (เลข/สตริง/ทศนิยม) หรือ 'YYYY-MM-DD HH:mm:ss' (ตีเป็น Asia/Bangkok); ไม่ได้ = null ไม่เดา */
export function parseFlashTime(raw: unknown): Date | null {
  if (typeof raw === "number" || (typeof raw === "string" && /^\d+(\.\d+)?$/.test(raw.trim()))) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= EPOCH_MIN && n <= EPOCH_MAX ? new Date(Math.round(n * 1000)) : null;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number);
  // new Date ปัดวันล้น (30 ก.พ. → มี.ค.) เงียบ ๆ → เทียบกลับ
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59 || se > 59) return null;
  const zone = m[7] ? (m[7] === "Z" ? "Z" : m[7].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "+07:00";
  const t = new Date(`${s.slice(0, 10)}T${s.slice(11, 19)}${zone}`);
  return Number.isNaN(t.getTime()) ? null : t;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * ราคาจาก webhook price (สตางค์ → บาท). null = ทิ้งทั้งก้อน (องค์ประกอบใดติดลบ/ไม่ใช่เลข/เกินเพดาน)
 * carrierPrice null แต่ codFee มีค่าได้ เมื่อ freightPrice ไม่ >0
 */
export function readFlashPrice(data: unknown): { carrierPrice: number | null; codFee: number | null } | null {
  if (!isRec(data)) return null;
  let sum = 0;
  for (const k of FLASH_COST_COMPONENTS) {
    const v = data[k];
    if (v == null) continue; // ไม่มีองค์ประกอบนั้น = 0
    const n = parseSatangStrict(v);
    if (n === null) return null;
    sum += n;
  }
  let codFee: number | null = null;
  if (data.codFee != null) {
    const n = parseSatangStrict(data.codFee);
    if (n === null || n / 100 > FLASH_LIMITS.codFeeMaxBaht) return null;
    codFee = n / 100;
  }
  const freight = parseSatangStrict(data.freightPrice);
  if (sum / 100 > FLASH_LIMITS.carrierPriceMaxBaht) return null;
  const carrierPrice = freight !== null && freight > 0 ? satangToBaht(sum) : null;
  return carrierPrice === null && codFee === null ? null : { carrierPrice, codFee };
}

const posNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** น้ำหนักจริง (กรัม 1..100000 จำนวนเต็ม) + ธงเกินน้ำหนัก/เกินขนาดเทียบที่ร้านแจ้ง; ไม่ผ่าน = null */
export function readFlashWeight(
  data: unknown,
  declared: { weightKg?: number | null; width?: number | null; length?: number | null; height?: number | null },
): { actualWeightKg: number; isOverWeight: boolean; isOverSize: boolean } | null {
  if (!isRec(data)) return null;
  const g = parseSatangStrict(data.weight);
  if (g === null || g < 1 || g > 100_000) return null;
  const decl = declared.weightKg;
  const isOverWeight = decl != null && decl > 0 && g > Math.round(decl * 1000);
  const isOverSize = (["width", "length", "height"] as const).some((k) => {
    const meas = posNum(data[k]);
    const d = declared[k];
    return meas !== null && d != null && d > 0 && meas > d;
  });
  return { actualWeightKg: gramToKg(g), isOverWeight, isOverSize };
}

export interface FlashRoute { routedAt: Date | null; action: string | null; message: string | null; state: number | null }
export interface FlashRoutes {
  pno: string | null;
  state: number | null;
  stateChangeAt: Date | null;
  returnedPno: string | null;
  customaryPno: string | null;
  routes: FlashRoute[];
}

const str = (v: unknown): string | null => (typeof v === "string" || typeof v === "number") && String(v).trim() !== "" ? String(v).trim() : null;
const stateNum = (v: unknown): number | null => { const x = str(v); return x !== null && /^\d{1,2}$/.test(x) ? Number(x) : null; };

/** คำตอบ routes รายใบ (ทนรูป: routes เป็น array หรือ map, routeAction/routedAction); ไม่ใช่ object = null */
export function normalizeRoutes(data: unknown): FlashRoutes | null {
  if (!isRec(data)) return null;
  const raw = Array.isArray(data.routes) ? data.routes : isRec(data.routes) ? Object.values(data.routes) : [];
  return {
    pno: str(data.pno),
    state: stateNum(data.state),
    stateChangeAt: parseFlashTime(data.stateChangeAt),
    returnedPno: str(data.returnedPno),
    customaryPno: str(data.customaryPno),
    routes: raw.filter(isRec).map((r) => ({
      routedAt: parseFlashTime(r.routedAt),
      action: str(r.routeAction) ?? str(r.routedAction),
      message: str(r.message),
      state: stateNum(r.state),
    })),
  };
}

/** routesBatch → Map<pno, FlashRoutes> (รับ array, map ตาม pno หรือห่อใน list/items); item ไม่มี pno ถูกข้าม */
export function normalizeBatchRoutes(data: unknown): Map<string, FlashRoutes> {
  const out = new Map<string, FlashRoutes>();
  let entries: [string | null, unknown][];
  if (Array.isArray(data)) entries = data.map((v) => [null, v]);
  else if (isRec(data) && (Array.isArray(data.list) || Array.isArray(data.items))) entries = ((data.list ?? data.items) as unknown[]).map((v) => [null, v]);
  else if (isRec(data)) entries = Object.entries(data);
  else return out;
  for (const [key, v] of entries) {
    const r = normalizeRoutes(v);
    const pno = r?.pno ?? key;
    if (r && pno) out.set(pno, { ...r, pno });
  }
  return out;
}

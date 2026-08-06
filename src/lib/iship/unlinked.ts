// feature 00022 (ส่วนขยาย) — ผูกพัสดุที่ร้านสร้างไว้บน iShip อยู่แล้วเข้ากับคำสั่งซื้อ
//
// ที่มา: ร้านจำนวนหนึ่งเปิดพัสดุบนเว็บ iShip ก่อน แล้วค่อยมาบันทึกคำสั่งซื้อในระบบเรา
// ทีหลัง ของเดิมรองรับแค่ "สร้างพัสดุใหม่" จึงบังคับให้ร้านกลุ่มนี้เปิดพัสดุซ้ำใบที่สอง
//
// ==========================================================================
// ระวังที่สุดในไฟล์นี้ — คู่ ตำบล/อำเภอ ของ "ฝั่ง response" พิสูจน์จากเอกสารไม่ได้
// (ต่อยอด BR-ISHIP-31)
// --------------------------------------------------------------------------
// ขาออก (create_order) เรารู้แน่แล้วว่า dst_district=ตำบล, dst_amphure=อำเภอ
// แต่ขาเข้า (query_orders/get_order) iShip ส่งกลับมาเป็น dst_district + `dst_area`
// ซึ่งเป็นชื่อที่ไม่เคยปรากฏฝั่งขาออกเลย
//
// ตัวอย่างในเอกสารของ iShip ใส่ค่า "สายไหม" ไว้ทั้งสองช่อง จึงบอกไม่ได้ว่าช่องไหน
// เป็นระดับไหน — เป็นกับดักตัวเดียวกับที่ unit test ของเราเคยเกือบพลาด (ค่าเท่ากัน
// = หลอกให้ผ่านได้ทั้งที่จับคู่กลับหัว)
//
// ที่นี่จึงเลือก: ตำบล ← dst_district (สมมาตรกับขาออก)
//                อำเภอ ← dst_amphure ถ้ามี ไม่งั้นค่อยใช้ dst_area
// เหตุผลที่ยอมรับความไม่แน่นอนนี้ได้: การผูกพัสดุมีขั้น "เทียบที่อยู่สองคอลัมน์" ให้ร้าน
// ตรวจด้วยตาเสมอ ถ้าจับคู่กลับหัวจริง ร้านจะเห็นตำบลกับอำเภอสลับที่กันทันทีในตาราง
// เทียบ ก่อนกดยืนยัน — ต่างจากขาออกที่ส่งผิดแล้วเงียบสนิท
// ==========================================================================

import { normalizePhone } from "@/lib/phone";
import { normalizeProvince, type DeepAddress } from "./mapping";

/** พัสดุ 1 ใบบน iShip ที่แกะจาก query_orders/get_order แล้ว */
export interface IShipParcel {
  trackNo: string;
  refCode: string | null;
  externalId: number | null;
  courierCode: string | null;
  courierLogo: string | null;
  /** custom_order_id ที่ร้าน/ระบบใส่ไว้ตอนสร้าง — ของที่ Deep สร้างจะเป็นรูป idempotencyKey */
  customOrderId: string | null;
  statusId: number | null;
  statusName: string | null;
  codAmount: number;
  weight: number | null;
  width: number | null;
  length: number | null;
  height: number | null;
  categoryId: number | null;
  receiver: ParcelReceiver;
  /** เวลาที่สร้างพัสดุฝั่ง iShip — normalize เป็น ISO แล้วโดย normalizeIShipDate() (null = แปลงไม่ได้) */
  createdAtRaw: string | null;
  /**
   * เวลาที่สถานะพัสดุเปลี่ยนล่าสุดฝั่ง iShip — normalize เป็น ISO แล้วเช่นกัน
   *
   * ใช้เป็น `OrderShipment.carrierStatusAt` ตอนอ่านสถานะจาก get_order (getTraces) —
   * ต้องเป็นเวลาที่ iShip บอกว่าสถานะเปลี่ยน ไม่ใช่เวลาที่เราไปดึงมา ไม่งั้นทุกใบจะได้เวลา
   * เท่ากับตอนที่ร้านเผลอเอาเมาส์ไปวาง แล้วเรียงลำดับเหตุการณ์ไม่ได้อีกเลย
   * (เกณฑ์เดียวกับที่ syncShipmentStatuses ใช้ `row.updated_at`)
   */
  updatedAtRaw: string | null;
  /** ไม่ว่าง = ใบนี้ถูกยกเลิกไปแล้ว ผูกไปก็ใช้ไม่ได้ */
  cancelledAtRaw: string | null;
}

export interface ParcelReceiver {
  name: string | null;
  phone: string | null;
  line1: string | null;
  /** ตำบล/แขวง */
  subdistrict: string | null;
  /** อำเภอ/เขต */
  district: string | null;
  province: string | null;
  postcode: string | null;
}

// ─── การแกะข้อมูล ───────────────────────────────────────────────────────────

/**
 * ทำไมต้องแกะแบบ "รับได้หลายสะกด" แทนที่จะประกาศ interface ตรง ๆ
 *
 * เอกสารของ iShip (ตัวอย่างปี 2022) กับสิ่งที่ prod ส่งจริงไม่ตรงกันมาแล้วอย่างน้อย
 * หนึ่งจุด — เวลาอัปเดตเอกสารเขียน `updated` แต่ของจริงที่เคยยิงเจอเป็น `updated_at`
 * การผูกกับสะกดเดียวแล้วผิดคือได้ค่า undefined เงียบ ๆ ซึ่งในหน้าจอนี้จะกลายเป็น
 * "ที่อยู่ว่าง" แล้วร้านเข้าใจว่าพัสดุไม่มีที่อยู่ ทั้งที่มีครบ
 */
function str(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * แปลงเวลาที่ iShip ส่งมาเป็น ISO รูปเดียว — normalize ที่นี่ที่เดียว ไม่ใช่ให้หน้าจอเดาเอง
 *
 * ที่มา: `shortThaiDate()` ใน ShipmentLinkPanel เคยแกะสตริงเองด้วยการ split(' ') แล้ว split('-')
 * ซึ่งใช้ได้เฉพาะรูป "YYYY-MM-DD HH:mm:ss" ตามเอกสารปี 2022 — พอ prod ส่ง ISO ที่ใช้ตัว T คั่น
 * ส่วนวันจะกลายเป็น "01T09:00:00" แล้ว Number() ได้ NaN ขณะที่เดือนยังแปลงถูก ผลคือหน้าจอขึ้น
 * **"NaN ส.ค."** ทุกแถว บนหน้าที่มีหน้าที่ช่วยร้านแยกว่าพัสดุใบไหนของลูกค้าคนไหนพอดี
 * (ยืนยันด้วยสคริปต์ repro แล้ว — Impeccable critique 2026-08-04)
 *
 * **timezone สำคัญ:** รูปที่ไม่มี timezone ติดมาถือเป็นเวลาไทย (iShip เป็นบริการไทย) ถ้าปล่อยให้
 * `new Date()` เดาเอง จะกลายเป็นเวลาของเครื่องที่รัน ซึ่งบน Vercel คือ UTC = เพี้ยนไป 7 ชั่วโมง
 *
 * รูปที่ไม่รู้จักคืน null ไปเลย (หน้าจอขึ้น "—") ดีกว่าเดาแล้วแสดงวันที่ผิดแบบเงียบ ๆ —
 * โดยเฉพาะ dd/mm/yyyy ที่ `new Date()` จะอ่านสลับเป็น mm/dd โดยไม่มีอะไรฟ้อง
 */
export function normalizeIShipDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s === "") return null;

  const iso = (v: string): string | null => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  // epoch วินาที (10 หลัก) หรือมิลลิวินาที (13 หลัก) — str() แปลง number เป็นสตริงมาให้แล้ว
  if (/^\d{10}$|^\d{13}$/.test(s)) {
    return iso(new Date(s.length === 10 ? Number(s) * 1000 : Number(s)).toISOString());
  }
  // "YYYY-MM-DD HH:mm[:ss]" หรือ "YYYY-MM-DDTHH:mm[:ss]" ที่ไม่มี timezone = เวลาไทย
  const dt = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dt) return iso(`${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6] ?? "00"}+07:00`);
  // วันที่ล้วน = เที่ยงคืนเวลาไทย
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso(`${s}T00:00:00+07:00`);
  // มี timezone ติดมาเอง (Z หรือ ±hh:mm) → เชื่อค่านั้นตรง ๆ
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) return iso(s);

  return null;
}

function num(o: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    // cod_amount มาเป็นสตริง "100.00" — ไม่ใช่ตัวเลข
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * parseParcelRow — แกะ 1 แถวจาก query_orders (หรือ data ของ get_order ซึ่งรูปเดียวกัน)
 *
 * คืน null เมื่อไม่มีเลขติดตาม — แถวที่ไม่มี track_no ผูกกับคำสั่งซื้อไม่ได้อยู่แล้ว
 * ทิ้งตั้งแต่ตรงนี้ดีกว่าปล่อยให้เป็น null ไหลไปโผล่เป็นแถวว่างในหน้าจอ
 */
export function parseParcelRow(raw: unknown): IShipParcel | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const trackNo = str(o, "track_no", "trackNo");
  if (!trackNo) return null;

  return {
    trackNo,
    refCode: str(o, "ref_code", "refCode"),
    externalId: num(o, "id"),
    courierCode: str(o, "courier_code", "courierCode"),
    courierLogo: str(o, "logo", "logo_mobile"),
    customOrderId: str(o, "custom_order_id", "customOrderId"),
    statusId: num(o, "status"),
    statusName: str(o, "status_name", "statusName"),
    codAmount: num(o, "cod_amount", "codAmount") ?? 0,
    weight: num(o, "weight"),
    width: num(o, "width"),
    length: num(o, "length"),
    height: num(o, "height"),
    categoryId: num(o, "category_id", "categoryId"),
    receiver: {
      name: str(o, "dst_name"),
      phone: str(o, "dst_phone"),
      line1: str(o, "dst_address"),
      // ห้ามแก้สองบรรทัดนี้ก่อนอ่านหมายเหตุหัวไฟล์
      subdistrict: str(o, "dst_district"),
      district: str(o, "dst_amphure", "dst_area"),
      province: str(o, "dst_province"),
      postcode: str(o, "dst_zipcode", "dst_postcode"),
    },
    createdAtRaw: normalizeIShipDate(str(o, "created", "created_at", "createdAt")),
    // "updated" คือสะกดในเอกสาร ส่วนของจริงเคยเจอเป็น "updated_at" — รับทั้งคู่ตามหมายเหตุที่ str()
    updatedAtRaw: normalizeIShipDate(str(o, "updated", "updated_at", "updatedAt")),
    cancelledAtRaw: str(o, "cancel_at", "cancelled_at", "cancelAt"),
  };
}

/** แกะทั้งชุด ทิ้งแถวที่แกะไม่ได้ — 1 แถวเสียต้องไม่ทำให้ทั้งหน้าจอว่าง */
export function parseParcelRows(rows: unknown): IShipParcel[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(parseParcelRow).filter((p): p is IShipParcel => p !== null);
}

/**
 * รูปที่ส่งออกไปให้หน้าจอ — วางไว้ในไฟล์ pure ตัวนี้ ไม่ใช่ใน service โดยเจตนา
 * client component ต้อง import type ชุดนี้ได้โดยไม่ลาก prisma/token ติดไปด้วย
 * (การ import type ถูกลบตอน compile ก็จริง แต่ไม่ควรวางระเบิดไว้ให้คนหลังเผลอ
 * เปลี่ยนเป็น import ค่าจริง — feedback_verify_import_safety)
 */
export interface UnlinkedParcelView {
  trackNo: string;
  courierCode: string | null;
  courierName: string | null;
  courierLogo: string | null;
  /** รหัสสถานะฝั่งเรา (แปลงจากตัวเลขของ iShip แล้ว) */
  carrierStatus: string | null;
  carrierStatusText: string;
  codAmount: number;
  receiver: ParcelReceiver;
  createdAtRaw: string | null;
  /**
   * ใบที่ "Deep เคยยิงสำเร็จแต่ response หายกลางทาง"
   *
   * custom_order_id เป็นรูป idempotencyKey ของเราแต่ไม่มีแถวคู่กันในฐานข้อมูล =
   * คำขอถึง iShip แล้วและพัสดุถูกเปิดจริง แต่คำตอบไม่กลับมาถึงเรา ก่อนหน้านี้ใบพวกนี้
   * กู้คืนไม่ได้เลย ต้องปล่อยทิ้งแล้วเปิดใหม่ (เสียเงินซ้ำ) — ผูกกลับได้ตรงนี้
   */
  fromDeepOrphan: boolean;
}

/** ผลการเทียบที่อยู่ก่อนผูก — ให้หน้าจอโชว์ตารางสองคอลัมน์ */
export interface ParcelPreview {
  parcel: UnlinkedParcelView;
  diff: AddressDiffRow[];
  hasConflict: boolean;
}

// ─── การเทียบที่อยู่ ────────────────────────────────────────────────────────

export type AddressField =
  | "name"
  | "phone"
  | "line1"
  | "subdistrict"
  | "district"
  | "province"
  | "postcode";

export interface AddressDiffRow {
  field: AddressField;
  /** คำที่เอาไปโชว์ตรง ๆ ได้ */
  label: string;
  /** ค่าฝั่งคำสั่งซื้อของเรา */
  order: string | null;
  /** ค่าฝั่งพัสดุบน iShip */
  parcel: string | null;
  same: boolean;
}

const FIELD_LABEL: Record<AddressField, string> = {
  name: "ผู้รับ",
  phone: "เบอร์โทร",
  line1: "ที่อยู่",
  subdistrict: "ตำบล",
  district: "อำเภอ",
  province: "จังหวัด",
  postcode: "รหัสไปรษณีย์",
};

/**
 * เทียบแบบ "ใจกว้างพอที่จะไม่ฟ้องเรื่องไร้สาระ"
 *
 * ที่อยู่ชุดเดียวกันเขียนต่างกันได้หลายแบบโดยหมายถึงที่เดียวกันเป๊ะ ("ต.สีลม" กับ "สีลม",
 * เว้นวรรคเกิน, "กรุงเทพ" กับ "กรุงเทพมหานคร") ถ้าฟ้องว่าต่างทุกกรณี ร้านจะเจอตาราง
 * แดงทั้งตารางในเกือบทุกใบ แล้วเลิกอ่านมันไปเลย — ซึ่งทำให้ขั้นตรวจสอบนี้ไร้ความหมาย
 * ทั้งที่มันคือหัวใจของฟีเจอร์
 */
function canon(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(ต\.|ตำบล|แขวง)\s*/, "")
    .replace(/^(อ\.|อำเภอ|เขต)\s*/, "")
    .replace(/^(จ\.|จังหวัด)\s*/, "");
}

function sameValue(field: AddressField, a: string | null, b: string | null): boolean {
  if (field === "phone") {
    const pa = normalizePhone(a ?? "") ?? (a ?? "").replace(/\D/g, "");
    const pb = normalizePhone(b ?? "") ?? (b ?? "").replace(/\D/g, "");
    return pa === pb;
  }
  if (field === "province") {
    return normalizeProvince(canon(a)) === normalizeProvince(canon(b));
  }
  return canon(a) === canon(b);
}

/**
 * diffReceiverAddress — ตารางเทียบที่อยู่ผู้รับ 2 ฝั่ง ทีละแถว
 *
 * คืนครบทุกแถวเสมอ (ไม่ใช่เฉพาะแถวที่ต่าง) เพราะหน้าจอต้องแสดงทั้งชุดให้ร้านกวาดตา
 * ได้ว่า "ใบนี้คือใบที่ใช่จริง" ไม่ใช่แค่รู้ว่ามีอะไรไม่ตรง
 */
export function diffReceiverAddress(
  order: {
    name?: string | null;
    phone?: string | null;
    address?: DeepAddress | null;
  },
  parcel: ParcelReceiver,
): AddressDiffRow[] {
  const addr = order.address ?? {};
  const pairs: [AddressField, string | null, string | null][] = [
    ["name", order.name ?? null, parcel.name],
    ["phone", order.phone ?? null, parcel.phone],
    ["line1", addr.line1 ?? null, parcel.line1],
    ["subdistrict", addr.subdistrict ?? null, parcel.subdistrict],
    ["district", addr.district ?? null, parcel.district],
    ["province", addr.province ?? null, parcel.province],
    ["postcode", addr.postcode ?? null, parcel.postcode],
  ];

  return pairs.map(([field, o, p]) => ({
    field,
    label: FIELD_LABEL[field],
    order: o,
    parcel: p,
    same: sameValue(field, o, p),
  }));
}

/** มีอย่างน้อย 1 แถวที่ต่าง = ต้องให้ร้านเลือกว่าจะยึดฝั่งไหนก่อนผูก */
export function hasAddressConflict(rows: AddressDiffRow[]): boolean {
  return rows.some((r) => !r.same);
}

// ─── ตัวช่วยฝั่งรายการ ──────────────────────────────────────────────────────

/**
 * matchesQuery — ตัวกรองของช่องค้นหา (เลขติดตาม / ชื่อผู้รับ / เบอร์)
 *
 * กรองในหน่วยความจำ ไม่ยิงถาม iShip ใหม่: ชุดข้อมูลคือพัสดุ 7 วันของร้านเดียว
 * ซึ่งหลักสิบถึงร้อยแถว การไปกลับเซิร์ฟเวอร์ทุกตัวอักษรแพงกว่าประโยชน์ที่ได้
 */
export function matchesQuery(
  // รับแค่ส่วนที่ใช้จริง ไม่ผูกกับ type เต็ม — ฝั่งเซิร์ฟเวอร์ส่ง IShipParcel มา
  // ส่วนหน้าจอถือ UnlinkedParcelView ซึ่งตัดฟิลด์ดิบออกไปแล้ว ทั้งคู่ต้องกรองได้เหมือนกัน
  p: { trackNo: string; receiver: ParcelReceiver },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;

  const digits = q.replace(/\D/g, "");
  const phone = (p.receiver.phone ?? "").replace(/\D/g, "");

  return (
    p.trackNo.toLowerCase().includes(q) ||
    (p.receiver.name ?? "").toLowerCase().includes(q) ||
    (digits !== "" && phone.includes(digits))
  );
}

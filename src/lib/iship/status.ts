// feature 00022 — ตารางแปลสถานะพัสดุของ iShip เป็นข้อความ/สีที่ UI ใช้
//
// ที่มา: GET /api/order_statuses ของ iShip (15 สถานะ ณ วันที่จัดทำ)
// เก็บเป็นตารางในโค้ดแทนการยิงถามทุกครั้ง เพราะเป็นชุดค่าคงที่ที่แทบไม่เปลี่ยน
// และ UI ต้องแปลได้ทันทีโดยไม่ต้องรอเครือข่าย
//
// ข้อควรระวัง: สถานะพัสดุคนละชุดกับ Order.status ของเรา (BR-ISHIP-40)
// ห้ามเอามาปนกัน และห้ามให้สถานะพัสดุไปเปลี่ยนสถานะคำสั่งซื้อเอง (BR-ISHIP-41)

/** โทนสีตาม semantic token ของ Paces — ไม่ hardcode hex */
export type ShipmentTone = "primary" | "info" | "success" | "warning" | "danger" | "secondary";

interface CarrierStatusMeta {
  /** ข้อความไทยที่แสดงต่อผู้ใช้ */
  text: string;
  tone: ShipmentTone;
  /** ถึงปลายทางแล้ว (สำเร็จหรือคืนสำเร็จ) — ใช้ตัดสินว่ายังต้องติดตามต่อไหม */
  terminal: boolean;
  /**
   * ไอคอน tabler ของสถานะนี้ — ใช้ในไทม์ไลน์ที่แสดงเหตุการณ์รายแถว
   *
   * อยู่ในตารางเดียวกับ text/tone เพราะทั้งสามอย่างคือ "หน้าตาของสถานะนี้" ชุดเดียวกัน
   * แยกไปเป็นตารางที่สองเมื่อไร รหัสใหม่ที่เพิ่มเข้ามาจะได้ข้อความแต่ไม่มีไอคอน
   * (หรือกลับกัน) โดยไม่มีอะไรฟ้อง — ทุกชื่อตรวจกับ @iconify/json/tabler แล้วว่ามีจริง
   */
  icon: string;
}

const CARRIER_STATUS: Record<string, CarrierStatusMeta> = {
  order_success: { text: "รอเข้ารับพัสดุ", tone: "primary", terminal: false, icon: "package" },
  picked_up: { text: "พัสดุเข้าระบบ", tone: "info", terminal: false, icon: "package-import" },
  with_branch: { text: "พัสดุถึงสถานีคัดแยก", tone: "info", terminal: false, icon: "building-warehouse" },
  in_transit: { text: "อยู่ระหว่างขนส่ง", tone: "info", terminal: false, icon: "truck-delivery" },
  progress: { text: "อยู่ระหว่างจัดส่ง", tone: "info", terminal: false, icon: "truck-delivery" },
  delivered: { text: "จัดส่งแล้ว", tone: "success", terminal: true, icon: "circle-check" },
  /**
   * terminal: true (แก้ 2026-08-06) — `payment_success` (id 12) คือ "เงินเก็บปลายทางเข้าร้านแล้ว"
   * ซึ่งเกิด *หลัง* `delivered` เสมอ (ของจริงห่างกัน ~33 ชม.) มันจึงเป็นปลายทางที่ไกลกว่า
   * `delivered` ไม่ใช่สถานะระหว่างทาง
   *
   * ค่า false เดิมทำให้พัสดุที่ส่งถึงและได้เงินแล้วตกไปเข้าเงื่อนไข "ยังไม่ถึงปลายทาง" ทุกที่:
   * `deriveShippingStage` คืน AWAITING_PICKUP → ไทม์ไลน์ถอยไปจุดแรก "สร้างพัสดุ" ทั้งที่
   * รายการเดินทางข้าง ๆ มันขึ้นครบถึง "อยู่ระหว่างขนส่ง" (user เจอบน prod: TH069306110878
   * ออเดอร์ CONFIRMED + ได้เงินแล้ว แต่แถบอยู่จุดที่ 1)
   */
  payment_success: { text: "ชำระเงินสำเร็จ", tone: "success", terminal: true, icon: "cash-banknote" },
  return_success: { text: "ส่งคืนสำเร็จ", tone: "secondary", terminal: true, icon: "arrow-back-up" },
  return: { text: "พัสดุตีกลับ", tone: "warning", terminal: false, icon: "arrow-back-up" },
  issue: { text: "พัสดุมีปัญหา", tone: "danger", terminal: false, icon: "alert-triangle" },
  cannot_pickup: { text: "ไม่สามารถเข้ารับพัสดุ", tone: "danger", terminal: false, icon: "truck-off" },
  no_courier: { text: "รอเลือกขนส่ง", tone: "warning", terminal: false, icon: "help" },
  cod_refund: { text: "รายการขอเงินคืน", tone: "warning", terminal: false, icon: "cash-banknote-move-back" },
  is_expired: { text: "หมดอายุ", tone: "secondary", terminal: true, icon: "clock-exclamation" },
  cancelled: { text: "ยกเลิก", tone: "secondary", terminal: true, icon: "circle-x" },
  /**
   * id 99 "ปิดงาน" — มีในตาราง STATUS_ID_TO_CODE มาตั้งแต่แรกแต่ไม่เคยมีที่นี่ แปลว่าถ้ามันมาจริง
   * describeCarrierStatus จะคืน "อยู่ระหว่างดำเนินการ" = พัสดุที่จบงานแล้วขึ้นว่ายังเดินอยู่
   *
   * terminal: true (เลิกตามต่อ — ตรงกับที่ syncShipmentStatuses ตัด `close` ออกจากชุดติดตาม
   * อยู่แล้ว) แต่ **ไม่นับเป็น "ส่งถึงแล้ว"** เพราะยังพิสูจน์ไม่ได้ว่า "ปิดงาน" แปลว่าสำเร็จ —
   * ยังไม่เคยเจอค่านี้ในข้อมูลจริงสักแถว (ตรวจ prod 2026-08-06) จึงห้ามเดาให้เป็นสีเขียว
   */
  close: { text: "ปิดงานแล้ว", tone: "secondary", terminal: true, icon: "flag" },
};

/**
 * isTerminalCarrierStatus — จบเส้นทางแล้ว ไม่ต้องตามต่อ
 *
 * อ่านจาก `terminal` ในตารางข้างบนโดยตรง ไม่ประกาศรายชื่อซ้ำ — เดิม `order-stage.ts` มี
 * const TERMINAL_CARRIER เขียนรายชื่อไว้เอง แล้วตอนที่ payment_success ควรเป็นปลายทาง
 * ต้องไปแก้สองที่ ซึ่งแก้ไม่ครบทั้งคู่มาแล้ว
 *
 * รหัสที่ไม่รู้จัก = ไม่ terminal (ยังตามต่อ) — เดาว่า "จบแล้ว" กับพัสดุที่ยังเดินอยู่
 * แปลว่าเราเลิกอัปเดตสถานะให้ร้านเงียบ ๆ ซึ่งแย่กว่าการถามซ้ำโดยไม่จำเป็น
 */
export function isTerminalCarrierStatus(code?: string | null): boolean {
  if (!code) return false;
  return CARRIER_STATUS[code]?.terminal === true;
}

/**
 * สถานะที่แปลว่า "ของถึงมือผู้รับแล้ว" — คนละชุดกับ terminal
 *
 * terminal รวมปลายทางที่ *ไม่สำเร็จ* ด้วย (ตีกลับ/หมดอายุ/ยกเลิก/ปิดงาน) ชุดนี้คือปลายทาง
 * ที่ยืนยันได้ว่าของถึงผู้รับจริง จึงเป็นชุดเดียวที่มีสิทธิ์ทำให้แถบเป็นสีเขียว (Verified-Means-Green)
 */
export const DELIVERED_CARRIER_STATUSES = ["delivered", "payment_success"] as const;

export function isDeliveredCarrierStatus(code?: string | null): boolean {
  if (!code) return false;
  return (DELIVERED_CARRIER_STATUSES as readonly string[]).includes(code);
}

/**
 * ปลายทางแบบ "ของกลับมาหาร้าน" — ผู้รับไม่รับ / ติดต่อไม่ได้ / ที่อยู่ใช้ไม่ได้
 *
 * feature 00039 ใช้ชุดนี้เป็น *หลักฐาน* ว่าการยกเลิกใบนั้นไม่ใช่ความผิดของร้าน
 * (BR-OSM-04) — เป็นหนึ่งใน 2 เส้นทางที่ร้านสร้างขึ้นเองไม่ได้ ต่างจากเหตุผล
 * ที่ร้านเลือกในโมดัลยกเลิกซึ่งไม่มีอำนาจตัดสินตัวเลข (BR-OSM-05)
 *
 * "return" = กำลังตีกลับ · "return_success" = ตีกลับถึงร้านแล้ว — นับทั้งคู่
 * เพราะทั้งสองยืนยันเหมือนกันว่าของไปไม่ถึงมือผู้รับเพราะฝั่งผู้รับ
 *
 * 🛑 ชุดนี้เป็น "กองงาน" ของตัวเองแล้วตั้งแต่ 2026-08-24 (`ShippingStageKey = 'RETURNED'`)
 * ไม่ใช่ส่วนหนึ่งของ `PROBLEM_CARRIER_STATUSES` อีกต่อไป — user เจอบน prod ว่าใบที่ iShip
 * บอก "ส่งคืนสำเร็จ" ไปแล้ว ยังค้างอยู่ในไทล์/ชิป **"พัสดุมีปัญหา"** ซึ่งอ่านว่า "ยังไม่รู้ว่า
 * เกิดอะไรขึ้น ต้องไปตามขนส่ง" ทั้งที่ความจริงคือ *จบเส้นทางแล้ว ของอยู่ในมือร้าน* และงานที่
 * เหลือคือการตัดสินใจเชิงธุรกิจ (คืนเงิน/ส่งใหม่/ปิดงาน) ล้วน ๆ — คนละงานคนละความเร่งด่วน
 *
 * `return` (กำลังตีกลับ) ย้ายมาอยู่ชุดนี้ด้วย ไม่ได้ค้างไว้ฝั่ง PROBLEM: มันคือ *ขั้นก่อนหน้า*
 * ของเรื่องเดียวกัน ถ้าแยกกันคนละกอง พัสดุใบเดิมจะกระโดดจากกอง "พัสดุมีปัญหา" ไปกอง "ตีกลับ"
 * ตอนที่ของมาถึงร้าน ทั้งที่ไม่มีอะไรเปลี่ยนในสายตาร้านนอกจาก "ของถึงแล้ว"
 */
export const RETURNED_CARRIER_STATUSES = ["return", "return_success"] as const;

export function isReturnedCarrierStatus(code?: string | null): boolean {
  if (!code) return false;
  return (RETURNED_CARRIER_STATUSES as readonly string[]).includes(code);
}

/**
 * ปลายทางที่ **ไม่มีอะไรตามมาได้อีก** — ถามขนส่งซ้ำก็ได้คำตอบเดิมตลอดกาล
 *
 * 🛑 ต่างจาก `isTerminalCarrierStatus()` ตรง `delivered`: ตัวนั้น terminal ก็จริง แต่ใบ
 * เก็บเงินปลายทางยังมี `payment_success` ตามมาทีหลัง (ของจริงห่างกัน ~33 ชม. —
 * TH160390J7DJ1I) ⇒ ใช้ terminal ตัดสินว่า "เลิกถาม" จะทำให้ COD ค้างที่ "ส่งถึงแล้ว"
 * ตลอดไปและฟีเจอร์ปิดงานอัตโนมัติตายทั้งฟีเจอร์ (BR-ISHIP-49)
 *
 * รายชื่อนี้ยกมาจาก `where` ของ `syncShipmentStatuses` ที่ตัดสินเรื่องเดียวกันอยู่แล้ว —
 * ตัวนั้นเป็น SQL จึงเรียกฟังก์ชันนี้ไม่ได้ มีเทส [blocker] เทียบสองที่ให้ตรงกันแทน
 */
export const FINAL_CARRIER_STATUSES = [
  "return_success",
  "is_expired",
  "close",
  "cancelled",
] as const;

export function isFinalCarrierStatus(code?: string | null): boolean {
  if (!code) return false;
  return (FINAL_CARRIER_STATUSES as readonly string[]).includes(code);
}

/**
 * carrierTrackingSettled — "ยิงถาม iShip อีกก็ไม่ได้อะไรใหม่แล้ว"
 *
 * ใช้ตัดสินว่าจะข้ามการยิง upstream ตอนเปิดดูไทม์ไลน์ (user เสนอเอง 2026-08-24:
 * "ถ้าสถานะมันสิ้นสุดแล้ว ไม่ต้องยิง API ให้เสียเวลา") — การเปิด hover 1 ครั้งเดิมยิง
 * 2 คำขอ (`/api/traces` + `get_order`) ต่อพัสดุ 1 ใบ
 *
 * เกณฑ์เดียวกับชุดที่ poller ใช้ตัดออกจากรายการติดตามเป๊ะ ๆ:
 *   - ปลายทางที่ไม่มีอะไรตามมา (FINAL_CARRIER_STATUSES) = จบ
 *   - `delivered` = จบ **เว้นแต่** เป็นใบ COD ที่ยังไม่ได้รับแจ้งว่าโอนเงิน
 *   - `payment_success` = เงินเข้าแล้ว จบสุดทาง
 */
export function carrierTrackingSettled(row: {
  carrierStatus?: string | null;
  codAmount?: number | null;
  codSettledAt?: Date | string | null;
}): boolean {
  const code = row.carrierStatus;
  if (!code) return false;
  if (isFinalCarrierStatus(code)) return true;
  const codPending = (row.codAmount ?? 0) > 0 && !row.codSettledAt;
  if (code === "payment_success") return true;
  if (code === "delivered") return !codPending;
  return false;
}

/**
 * describeCarrierStatus — แปลรหัสสถานะเป็นข้อความ/สี
 *
 * รหัสที่ไม่รู้จัก (ผู้ให้บริการเพิ่มสถานะใหม่) ต้องไม่ทำให้หน้าจอพัง —
 * คืนข้อความกลาง ๆ ที่ยังบอกผู้ใช้ได้ว่ากำลังเกิดอะไรอยู่ ดีกว่าโชว์รหัสดิบ
 */
export function describeCarrierStatus(code?: string | null): CarrierStatusMeta {
  if (!code)
    return { text: "ยังไม่มีข้อมูลสถานะ", tone: "secondary", terminal: false, icon: "help" };
  return (
    CARRIER_STATUS[code] ?? {
      text: "อยู่ระหว่างดำเนินการ",
      tone: "info",
      terminal: false,
      icon: "refresh",
    }
  );
}

/**
 * suggestsShipped — สถานะนี้แปลว่า "ขนส่งรับของไปแล้ว" หรือยัง
 *
 * ใช้เพื่อ **เสนอ** ให้ร้านเปลี่ยนคำสั่งซื้อเป็น "จัดส่งแล้ว" (FR-ISHIP-041)
 * ข้อควรระวัง: เป็นแค่ข้อเสนอ — ระบบห้ามเปลี่ยนสถานะคำสั่งซื้อเอง (BR-ISHIP-41)
 * การยืนยันรับของโดยผู้ซื้อยังเป็นเงื่อนไขเดียวที่ทำให้ออเดอร์สำเร็จและมีผลต่อ Trust Score
 */
export function suggestsShipped(code?: string | null): boolean {
  if (!code) return false;
  return ["picked_up", "with_branch", "in_transit", "progress"].includes(code);
}

/**
 * impliesDispatched — พัสดุ "ออกจากมือร้านไปแล้ว" หรือยัง (นับรวมที่ถึงปลายทางแล้ว)
 *
 * ต่างจาก suggestsShipped ตรงที่รวมสถานะปลายทางด้วย: delivered/return* แปลว่าของเดินทาง
 * ไปแล้วแน่นอน ส่วน suggestsShipped ตั้งใจให้ครอบเฉพาะช่วง "กำลังเดินทาง" เพราะมันถูกใช้
 * เพื่อ *เสนอ* ให้ร้านกดเปลี่ยนสถานะระหว่างที่พัสดุยังวิ่งอยู่
 *
 * ตัวนี้ใช้ตอนผูกพัสดุย้อนหลัง ซึ่งใบที่ผูกอาจส่งถึงผู้ซื้อไปแล้วตั้งแต่เมื่อวาน —
 * ถ้าใช้ suggestsShipped ใบที่ส่งถึงแล้วจะไม่เข้าเงื่อนไข แล้วออเดอร์ค้าง "รอจัดส่ง"
 * ทั้งที่ของถึงมือคนซื้อแล้ว ซึ่งเป็นอาการที่แย่กว่าเดิม
 */
export function impliesDispatched(code?: string | null): boolean {
  if (!code) return false;
  return (
    suggestsShipped(code) ||
    ["delivered", "payment_success", "return", "return_success"].includes(code)
  );
}

/** สถานะพัสดุฝั่งเรา (OrderShipment.status) → ข้อความ/สีสำหรับ UI */
export function describeShipmentStatus(
  status: string,
): { text: string; tone: ShipmentTone } {
  switch (status) {
    case "PENDING":
      return { text: "กำลังสร้างพัสดุ", tone: "warning" };
    case "CREATED":
      return { text: "สร้างพัสดุแล้ว", tone: "success" };
    case "FAILED":
      return { text: "สร้างพัสดุไม่สำเร็จ", tone: "danger" };
    case "CANCELLED":
      return { text: "ยกเลิกพัสดุแล้ว", tone: "secondary" };
    default:
      return { text: status, tone: "secondary" };
  }
}

// ─── ความคืบหน้าแบบ 4 ขั้น ──────────────────────────────────────────────────

/**
 * แถบความคืบหน้าที่ร้านเห็น — ยุบ 15 สถานะของ iShip เหลือ 4 ขั้นที่คนอ่านเข้าใจทันที
 * (user request 2026-07-29: "แสดงแค่ timeline ของสถานะ ไม่ต้องโชว์ข้อความดิบ")
 *
 * รายละเอียดดิบยังอยู่ครบใต้ปุ่ม "ดูรายละเอียดการเดินทาง" — ยุบเพื่อให้กวาดตาง่าย
 * ไม่ใช่เพื่อตัดข้อมูลทิ้ง (เวลา/สถานที่จำเป็นตอนตามของหาย)
 */
export const SHIPMENT_STAGES = [
  { label: "สร้างพัสดุ", icon: "tabler:package" },
  { label: "รับเข้าระบบแล้ว", icon: "tabler:package-import" },
  { label: "กำลังจัดส่ง", icon: "tabler:truck-delivery" },
  { label: "จัดส่งสำเร็จ", icon: "tabler:circle-check" },
] as const;

/**
 * โทนของทั้งแถบ — ไม่ไล่สีทีละช่วง เพราะสีผสมกลางทางอ่านกำกวม
 *   progress  = กำลังเดินทาง (น้ำเงินถึงจุดที่ไปถึง, เทาที่เหลือ)
 *   delivered = ถึงมือผู้รับแล้ว (เขียวทั้งแถบ)
 *   diverted  = ส่งคืนต้นทางสำเร็จ (เทาทั้งแถบ — จบแล้วแต่ไม่ใช่ผลที่ต้องการ)
 *   stopped   = ยกเลิก/หมดอายุ (เทาทั้งแถบ ไม่มีจุดไหนนับว่าถึง)
 */
export type ShipmentBarTone = "progress" | "delivered" | "diverted" | "stopped";

export interface ShipmentProgress {
  /** ขั้นที่ไปถึงแล้ว 0-3 */
  stage: number;
  tone: ShipmentBarTone;
  /** ป้ายขั้นสุดท้ายที่ override (return_success ไม่ใช่ "จัดส่งสำเร็จ") */
  lastLabel?: string;
  /**
   * ไอคอนขั้นสุดท้ายที่ override — คู่กับ `lastLabel` เสมอ
   *
   * 🛑 จำเป็นตั้งแต่ 2026-08-24 ที่ user เคาะให้จุด "ส่งคืนสำเร็จ" เป็น **เขียวเท่ากับ
   * "จัดส่งสำเร็จ"**: พอสีเท่ากันและตำแหน่งเท่ากัน (จุดที่ 4 ทั้งคู่) สิ่งเดียวที่เหลือให้
   * แยกสองเคสนี้คือ *คำ* — ซึ่งแถบจิ๋วในตาราง `/orders` ไม่มีคำเลย มีแต่จุด 4 จุด
   * ⇒ ต้องแยกด้วย **รูปร่าง** ด้วย (ลูกศรย้อนกลับ ไม่ใช่เครื่องหมายถูก) ไม่งั้นพัสดุที่กอง
   * อยู่ที่ร้านจะอ่านเป็น "ส่งถึงลูกค้าแล้ว" บนแถวตาราง ซึ่งเป็นอาการเดิมที่เพิ่งแก้ไป
   * (WCAG 1.4.1 ก็ห้ามใช้สีเป็นตัวสื่อความหมายตัวเดียวอยู่แล้ว)
   */
  lastIcon?: string;
  /** เตือนเมื่อออกนอกเส้นทางปกติ — ห้ามแกล้งทำเป็นว่ายังเดินหน้าอยู่ */
  notice?: { tone: ShipmentTone; text: string };
}

/** รหัสสถานะ → ขั้นบนแถบ. รหัสที่ไม่มีในนี้ = ยังไม่ขยับจากขั้นแรก */
const STAGE_OF: Record<string, number> = {
  order_success: 0,
  no_courier: 0,
  cannot_pickup: 0,
  picked_up: 1,
  with_branch: 1,
  in_transit: 2,
  progress: 2,
  issue: 2,
  return: 2,
  cod_refund: 2,
  delivered: 3,
  return_success: 3,
  // ปลายทางที่ไกลกว่า delivered (เงิน COD เข้าแล้ว) — ขาดไปตั้งแต่แรก จึงตกไป ?? 0 = ถอย
  // กลับไปจุด "สร้างพัสดุ" ทั้งที่จบงานแล้ว (user เจอ TH069306110878 บน prod 2026-08-06)
  payment_success: 3,
  close: 3,
};

const NOTICE_OF: Record<string, { tone: ShipmentTone; text: string }> = {
  no_courier: { tone: "warning", text: "รอเลือกขนส่ง — พัสดุนี้ยังไม่ได้กำหนดขนส่ง" },
  cannot_pickup: {
    tone: "danger",
    text: "ขนส่งเข้ารับพัสดุไม่ได้ — นัดรับใหม่หรือติดต่อขนส่งโดยตรง",
  },
  issue: {
    tone: "danger",
    text: "พัสดุมีปัญหาระหว่างทาง — ติดต่อขนส่งเพื่อตรวจสอบรายละเอียด",
  },
  return: { tone: "warning", text: "พัสดุกำลังตีกลับไปยังต้นทาง" },
  cod_refund: { tone: "warning", text: "มีรายการขอเงินคืนค่าเก็บปลายทาง" },
  return_success: { tone: "secondary", text: "พัสดุถูกส่งคืนต้นทางสำเร็จแล้ว" },
  is_expired: {
    tone: "secondary",
    text: "พัสดุหมดอายุ — ขนส่งไม่ได้เข้ารับภายในเวลาที่กำหนด เปิดใบใหม่ได้",
  },
};

/**
 * describeProgress — สถานะพัสดุ (ของเรา + ของขนส่ง) → แถบ 4 ขั้น
 *
 * อ่านจากค่าที่มีอยู่ในมือทันที ไม่พึ่ง trace ที่ต้องรอเครือข่าย — แถบคือสิ่งแรกที่ร้านมอง
 * ถ้าต้องรอโหลดก่อนถึงจะเห็น ก็เสียเจตนาของมันไป
 */
export function describeProgress(
  shipmentStatus: string,
  carrierStatus?: string | null,
): ShipmentProgress {
  if (shipmentStatus === "CANCELLED") {
    return {
      stage: -1,
      tone: "stopped",
      notice: {
        tone: "secondary",
        text: "ยกเลิกพัสดุแล้ว — เปิดพัสดุใบใหม่สำหรับคำสั่งซื้อนี้ได้",
      },
    };
  }

  const code = carrierStatus ?? undefined;
  if (code === "cancelled" || code === "is_expired") {
    return { stage: -1, tone: "stopped", notice: NOTICE_OF[code] };
  }

  const stage = code ? (STAGE_OF[code] ?? 0) : 0;
  const tone: ShipmentBarTone = isDeliveredCarrierStatus(code)
    ? "delivered"
    : code === "return_success" || code === "close"
      ? "diverted"
      : "progress";

  return {
    stage,
    tone,
    lastLabel:
      code === "return_success"
        ? "ส่งคืนสำเร็จ"
        : // ปิดงานโดยไม่รู้ว่าสำเร็จหรือไม่ — ห้ามเขียน "จัดส่งสำเร็จ" ทับจุดสุดท้าย
          code === "close"
          ? "ปิดงานแล้ว"
          : undefined,
    // ไอคอนยกจากตาราง CARRIER_STATUS ของรหัสนั้นตรง ๆ ไม่เลือกใหม่ (ที่นั่นคือ SSOT ของ
    // "หน้าตาของสถานะนี้" อยู่แล้ว) — return_success = arrow-back-up · close = flag
    lastIcon:
      code === "return_success" || code === "close"
        ? `tabler:${CARRIER_STATUS[code].icon}`
        : undefined,
    notice: code ? NOTICE_OF[code] : undefined,
  };
}

// ─── รหัสตัวเลขจาก query_orders ────────────────────────────────────────────

/**
 * id ตัวเลข → status_code ที่เราเก็บใน OrderShipment.carrierStatus
 *
 * query_orders (endpoint แบบยกชุด) คืน status เป็นตัวเลข ส่วน traces/webhook คืนเป็น
 * status_code ตัวหนังสือ — ต้องแปลงให้เป็นชุดเดียวกันก่อนเขียนลงฐานข้อมูล ไม่งั้นจะมี
 * carrierStatus สองภาษาปนกันในคอลัมน์เดียว แล้ว UI ที่แมปด้วย status_code จะอ่านไม่ออก
 *
 * ที่มา: GET /api/order_statuses ของบัญชีจริง (2026-07-31) — id 99 = ปิดงาน
 */
const STATUS_ID_TO_CODE: Record<number, string> = {
  1: "order_success",
  2: "picked_up",
  3: "delivered",
  4: "issue",
  5: "cancelled",
  6: "progress",
  7: "cannot_pickup",
  8: "no_courier",
  9: "with_branch",
  10: "return",
  11: "return_success",
  12: "payment_success",
  13: "in_transit",
  14: "cod_refund",
  15: "is_expired",
  99: "close",
};

export function carrierStatusCodeFromId(id: number | null | undefined): string | null {
  if (id == null) return null;
  return STATUS_ID_TO_CODE[id] ?? null;
}

/**
 * สถานะที่ร้านต้องรู้ทันที — ของไม่ได้เดินหน้าตามปกติและมีคนต้องลงมือทำอะไรสักอย่าง
 *
 * แยกออกมาเป็นชุดเดียวใช้ร่วมกันทั้งป้ายในรายการแชทและตัวกรอง เพื่อไม่ให้สองที่นิยาม
 * คำว่า "มีปัญหา" ไม่ตรงกัน (ซึ่งจะทำให้ตัวกรองกรองแล้วได้ผลไม่ตรงกับป้ายที่เห็น)
 */
/**
 * สถานะที่แปลว่า "ขนส่งรับของไปแล้วและกำลังเดินทาง" — คู่กับ PROBLEM_CARRIER_STATUSES
 *
 * ย้ายมาจาก const IN_TRANSIT ที่เคยเขียนไว้เฉพาะใน lib/order-stage.ts (คอมเมนต์ตรงนั้นบอกเองว่า
 * "ชุดเดียวกับ isInTransit ใน status.ts") — พอมีที่ใช้ที่สองคือตัวนับบน Command Center จึงต้อง
 * ยกขึ้นมาเป็นของกลาง ไม่งั้นวันที่ iShip เพิ่มสถานะใหม่ ป้ายกับตัวเลขจะนับคนละชุดเงียบ ๆ
 */
export const IN_TRANSIT_CARRIER_STATUSES = [
  "picked_up",
  "with_branch",
  "in_transit",
  "progress",
] as const;

export function isInTransitCarrierStatus(code?: string | null): boolean {
  if (!code) return false;
  return (IN_TRANSIT_CARRIER_STATUSES as readonly string[]).includes(code);
}

/**
 * "ของไม่ได้เดินหน้าตามปกติ และยังไม่รู้ว่าจะจบยังไง" — ร้านต้องเข้าไปแก้ที่ต้นเรื่อง
 *
 * 🛑 ชุดนี้ **ไม่รวมสายตีกลับ** (`return`/`return_success`) ตั้งแต่ 2026-08-24 — ดูเหตุผลเต็ม
 * ที่ RETURNED_CARRIER_STATUSES ด้านบน. สองชุดนี้ต้อง **ไม่ทับกันเลย** (มีเทส [blocker]
 * ปักหมุดไว้) เพราะออเดอร์ใบหนึ่งต้องตกกองเดียว ไม่งั้นตัวเลขบนไทล์รวมกันเกินจำนวนใบจริง
 */
export const PROBLEM_CARRIER_STATUSES = [
  "issue",
  "cannot_pickup",
  "is_expired",
  "cod_refund",
] as const;

export function isProblemCarrierStatus(code?: string | null): boolean {
  if (!code) return false;
  return (PROBLEM_CARRIER_STATUSES as readonly string[]).includes(code);
}


// ─── เวลาและการโอนเงิน COD (ส่วนขยาย 2026-08-06) ─────────────────────────────

/**
 * parseCarrierTimestamp — เวลาจาก iShip เป็น "เวลาไทย" ที่ไม่มีโซนเวลาติดมา
 *
 * รูปแบบที่ได้จริงคือ `"2026-08-04 15:36:18"` เดิมโค้ดทำ `new Date(s.replace(" ", "T"))`
 * ซึ่ง JS ตีความสตริงแบบไม่มีโซนว่าเป็น "เวลาท้องถิ่นของเครื่อง" — บน Vercel เครื่องเป็น UTC
 * ผลคือเวลาไทยถูกบันทึกเป็น UTC ตรง ๆ = **ทุกเหตุการณ์เลื่อนไปข้างหน้า 7 ชั่วโมง**
 *
 * หลักฐานจากฐาน prod (พัสดุ TH460290DA197B, 2026-08-04): แถวสุดท้ายมี `occurredAt`
 * 15:36:18Z แต่ `createdAt` (เวลาที่เราบันทึกเอง) เป็น 13:10:57Z — เท่ากับบันทึกเหตุการณ์
 * ที่ "ยังไม่เกิด" ล่วงหน้า 2 ชั่วโมงครึ่ง และเวลาเดียวกันนี้ฝั่ง query_orders (ซึ่งส่ง ISO
 * พร้อมโซนมา จึงถูกต้อง) เก็บไว้เป็น 08:36:18Z — ห่างกัน 7 ชั่วโมงพอดี
 *
 * ตรึง +07:00 ตรง ๆ (ไม่ใช่ timezone ของเครื่อง) เพราะ iShip เป็นผู้ให้บริการไทยที่ส่งเวลาไทยเสมอ
 * — ค่าที่ขึ้นกับเครื่องจะทำให้ dev กับ prod ได้ผลไม่ตรงกันอีก ซึ่งคือรากของบั๊กนี้พอดี
 *
 * ย้ายมาจาก iship.service.ts (2026-08-06) เพราะ payload เดียวกันปนสองรูปแบบอยู่:
 * `settlement_at`/`delivered_at` ไม่มีโซน ส่วน `created_at`/`updated_at` เป็น ISO UTC
 * ตัวแปลงจึงต้องอยู่ที่เดียวและเทสได้โดยไม่ต้องมีฐานข้อมูล
 */
export function parseCarrierTimestamp(raw: string): Date | null {
  if (!raw) return null;
  // มีโซนเวลาติดมาแล้ว (Z หรือ ±hh:mm) → เชื่อตามนั้น ไม่ยัด +07 ทับ
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw.trim());
  const iso = raw.trim().replace(" ", "T");
  const d = new Date(hasZone ? iso : `${iso}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * readCodSettlement — อ่าน "เงินเก็บปลายทางเข้าร้านแล้ว" ออกจากแถวของ iShip
 *
 * null = ยังไม่ควรบันทึกอะไร (ไม่ใช่ความผิดพลาด) — แยกการ *ตัดสินใจ* ออกจากการ *เขียนฐาน*
 * เพื่อให้เงื่อนไขทั้งชุดเทสได้โดยไม่ต้องมี Prisma
 *
 * ─── ทำไมต้องดู "สถานะ" ไม่ใช่แค่ "มีวันที่โอน" ──────────────────────────────
 *
 * [สำคัญ] `settlement_at` เพียงลำพัง **ไม่ได้แปลว่าเงินเข้าแล้ว** — iShip เติมค่านี้ตั้งแต่ตอน
 * พัสดุส่งถึงในฐานะ *วันนัดโอน* (= `delivered_at` + 24 ชม. เป๊ะ ๆ) แล้วค่อยเปลี่ยนเป็น
 * เวลารอบโอนจริงเมื่อโอนเสร็จ
 *
 * วัดจากบัญชีจริงบน prod (2026-08-06, 115 แถวใน 6 วัน):
 *   - 20 แถวมี `settlement_at` ทั้งที่สถานะยังเป็น 3 "จัดส่งแล้ว" = เงินยังไม่เข้า
 *   - 11 แถวในนั้นมีวันนัดโอนเป็น **วันพรุ่งนี้**
 *   - แถวที่สถานะ 12 แล้วมี `settlement_at` ครบทุกแถว (ไม่มีข้อยกเว้น)
 * เกณฑ์ที่ใช้ `settlement_at` อย่างเดียวจึงยืนยันคำสั่งซื้อ 9 ใบทั้งที่ยังไม่ได้เงินสักบาท
 * (จับได้ตอน dry-run ก่อนขึ้น prod — ถ้าปล่อยไป ร้านจะเห็นออเดอร์ปิดเองโดยเงินยังไม่เข้า)
 *
 * `payment_success` จึงเป็นตัวตัดสิน ส่วน `settlement_at` เป็นตัวบอก *เวลา* ที่จะบันทึก
 * ทั้งคู่ต้องมาด้วยกัน
 *
 * เงื่อนไขที่ต้องผ่านครบ (BR-ISHIP-45 ข้อ ค):
 *   - สถานะพัสดุ = `payment_success` (id 12)
 *   - `settlement_at` แปลงเป็นเวลาได้
 *   - `cod_amount` มากกว่าศูนย์ — ยอด 0 แปลว่าใบนี้ไม่ได้เก็บเงินปลายทาง ต่อให้มีวันที่มา
 *     ก็ไม่ใช่เงินของคำสั่งซื้อนี้ (ห้ามตีความว่า "ได้เงินแล้ว ฿0")
 *
 * ความเสี่ยงที่ยอมรับ: ใบที่เดินต่อไปเป็น `cod_refund` (id 14) หลังจากโอนแล้วจะถูก
 * ยืนยันไปก่อนหน้านั้น — เป็นการคืนเงินภายหลัง ไม่ใช่การที่เงินไม่เคยเข้า
 */
/**
 * readCarrierCharges — อ่าน "เงินที่ขนส่งคิดจริง" ออกจากแถวของ iShip
 *
 * แยกการ *ตัดสิน* ออกจากการ *เขียนฐาน* ด้วยเหตุผลเดียวกับ readCodSettlement — เงื่อนไข
 * ทั้งชุดเทสได้โดยไม่ต้องมี Prisma
 *
 * ─── ทำไมต้องอ่านจาก `discount_price` ───────────────────────────────────────
 *
 * 🛑 **`discount_price` ไม่ใช่ส่วนลด — มันคือค่าส่งที่ถูกหักจากเครดิตร้านจริง** และเป็นฟิลด์เดียว
 * ในทั้ง payload ขาเข้าที่บอกค่าส่งได้ (`price`/`total_price` ไม่มีทั้งใน query_orders และ
 * get_order — มีเฉพาะใน payload ของ webhook ที่ไม่เคยเปิดใช้บน prod)
 *
 * พิสูจน์กับบัญชีจริง 2026-08-09: ยิง check-price ที่ `actual_weight` + ขนาดจริงรายใบแล้วเทียบกับ
 * ค่านี้ → ตรงกัน 55/56 ใบ ส่วนใบที่ 56 (`TH066536981258`) ค่านี้ = 38 ขณะที่ quote ที่ 4.13 กก.
 * ได้ 41 แต่ quote ที่ 4.0 กก. ได้ 38 พอดี = iShip คิดตามน้ำหนักที่บันทึกไว้ ณ ตอนนั้น
 * ⇒ ห้ามคำนวณย้อนหลังด้วย check-price เด็ดขาด จะได้ราคาวันที่ยิง ไม่ใช่เงินที่ถูกหักจริง
 *
 * ─── กติกาของ 0 ต่างกันในสองฟิลด์ โดยตั้งใจ ─────────────────────────────────
 *
 * `carrierPrice` / `actualWeight`: ค่า ≤ 0 = **"ยังไม่รู้"** คืน null ไม่ใช่บันทึกเลข 0 — พัสดุที่มีอยู่จริง
 * ไม่มีทางค่าส่ง 0 บาทหรือหนัก 0 กก. การบันทึก 0 ลงไปจะกลายเป็น "ต้นทุนค่าส่งฟรี" ในสูตรกำไร
 * (คลาสเดียวกับที่ `total_price <= 0` ของ check-price เคยทำให้ Fuze Post ชนะ "ถูกที่สุด" ด้วยราคา ฿0)
 *
 * `codFee`: 0 = **ค่าจริง** ไม่ใช่ "ไม่รู้" — พัสดุที่ไม่ใช่ COD มีค่าธรรมเนียม 0 บาทจริง ๆ
 * แยกจากกรณีที่ iShip ไม่ส่งฟิลด์นี้มาเลย (undefined → null)
 */
export function readCarrierCharges(row: {
  discount_price?: string | number | null;
  actual_weight?: string | number | null;
  cod_fee?: string | number | null;
}): { carrierPrice: number | null; actualWeight: number | null; codFee: number | null } {
  const positive = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const nonNegative = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    carrierPrice: positive(row.discount_price),
    actualWeight: positive(row.actual_weight),
    codFee: nonNegative(row.cod_fee),
  };
}

/**
 * readCarrierChargesFromGetOrder — ตัวเดียวกับข้างบน แต่สำหรับ payload ของ `get_order`
 *
 * 🛑 **ทำไมต้องแยกฟังก์ชัน ห้ามให้ readCarrierCharges fallback `actual_weight ?? weight` เอง:**
 * ชื่อ `weight` แปล **คนละอย่าง** ในสอง endpoint ของ iShip — คลาสเดียวกับ `dst_district` ที่
 * ขาออกแปลว่าตำบล ขาเข้าแปลว่าอำเภอ แล้วทำให้ 23 ออเดอร์บน prod เก็บที่อยู่สลับกัน
 *
 *   `query_orders` → `weight` = น้ำหนักที่ **ร้านแจ้ง** · `actual_weight` = ที่ **ชั่งจริง** (มีทั้งคู่)
 *   `get_order`    → `weight` = ที่ **ชั่งจริง** · ไม่มี `actual_weight` เลย
 *
 * ยืนยันกับพัสดุจริง 12 ใบ (2026-08-09): `get_order.weight` เท่ากับ `query_orders.actual_weight`
 * ทุกใบ ขณะที่ `query_orders.weight` ต่างออกไป (เช่น TH27108UYHZ37H แจ้ง 2 ชั่งได้ 2.05)
 *
 * ถ้าปล่อยให้ตัวเดียวกัน fallback: แถวจาก `query_orders` ของพัสดุที่ **ยังไม่ถูกชั่ง** จะเอา
 * น้ำหนักที่ร้านแจ้งไปบันทึกเป็น "น้ำหนักจริง" — ต่ำกว่าความจริงใน 92 จาก 151 ใบ และไม่มีอะไรฟ้อง
 */
export function readCarrierChargesFromGetOrder(row: {
  discount_price?: string | number | null;
  weight?: string | number | null;
  cod_fee?: string | number | null;
}): { carrierPrice: number | null; actualWeight: number | null; codFee: number | null } {
  return readCarrierCharges({
    discount_price: row.discount_price,
    actual_weight: row.weight,
    cod_fee: row.cod_fee,
  });
}

export function readCodSettlement(row: {
  status?: number | null;
  settlement_at?: string | null;
  cod_amount?: string | number | null;
}): { settledAt: Date; codAmount: number } | null {
  if (carrierStatusCodeFromId(row.status ?? -1) !== "payment_success") return null;
  if (!row.settlement_at) return null;
  const codAmount = Number(row.cod_amount ?? 0);
  if (!Number.isFinite(codAmount) || codAmount <= 0) return null;
  const settledAt = parseCarrierTimestamp(row.settlement_at);
  if (!settledAt) return null;
  return { settledAt, codAmount };
}

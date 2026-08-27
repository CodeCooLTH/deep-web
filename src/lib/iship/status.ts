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
 * รายชื่อรหัสที่ `terminal: true` — **derive จากตารางข้างบน ไม่ได้พิมพ์ซ้ำ**
 *
 * 🛑 มีไว้เพื่อส่งเข้า SQL เท่านั้น (CR 2026-08-25: ตัวกรองกองพัสดุย้ายไปทำที่ฐานข้อมูล)
 * ฝั่ง TypeScript ให้ใช้ `isTerminalCarrierStatus()` เหมือนเดิม — อย่าเอาลิสต์นี้ไปเทียบเอง
 * เพราะถ้าวันหนึ่งเกณฑ์ terminal ซับซ้อนกว่า "ค่าในคอลัมน์ terminal" ลิสต์จะตามไม่ทัน
 *
 * เหตุผลที่ derive แทนการเขียนลิสต์ใหม่: คอมเมนต์ที่ `FINAL_CARRIER_STATUSES` บันทึกไว้แล้วว่า
 * การเขียนรายชื่อซ้ำสองที่ "แก้ไม่ครบทั้งคู่มาแล้ว" — บทเรียนเดียวกันเป๊ะ
 */
export const TERMINAL_CARRIER_STATUSES: readonly string[] = Object.entries(CARRIER_STATUS)
  .filter(([, meta]) => meta.terminal === true)
  .map(([code]) => code);

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
 * returnLegStampOf — รหัสสถานะขนส่ง → คอลัมน์เวลา "ขากลับ" ที่ต้องประทับบน OrderShipment
 *
 * คืน `null` = ไม่ใช่สายตีกลับ ไม่ต้องประทับอะไร
 *
 * 🛑 อยู่ที่นี่ ไม่ใช่ในตัว service เพราะมี **ผู้เขียน carrierStatus 3 ทาง** ที่ต้องประทับ
 * ให้ตรงกันทุกทาง (webhook · รอบ poll `syncShipmentStatuses` · การรีเฟรชตอนเปิดดู traces)
 * ถ้ากระจายเงื่อนไขไปเขียนเองทั้ง 3 ที่ วันหนึ่งจะมีทางใดทางหนึ่งไม่ประทับ แล้วพัสดุที่ตีกลับ
 * ผ่านทางนั้นจะไม่มีวันเวลาบนไทม์ไลน์ **โดยไม่มี error ให้เห็น** — คลาสเดียวกับที่
 * `deliveredAt` เคยพลาด (docs/conventions/value-fate-decided-at-write-site.md)
 *
 * 🛑 `return_success` ประทับเฉพาะ `returnedAt` **ห้ามเติม `returnStartedAt` ให้ด้วย** —
 * ใบที่โผล่มาเป็น `return_success` เลยโดยไม่เคยผ่าน `return` (รอบ poll เห็นแค่สถานะล่าสุด
 * เกิดจริง 6 จาก 12 ใบบน prod) คือใบที่ *ไม่รู้ว่าเริ่มตีกลับเมื่อไร* ไม่ใช่ใบที่เริ่มตอนนั้น
 */
/**
 * วลีที่ขนส่งใช้บอกว่า "กำลังนำพัสดุมาส่งคืนที่ร้าน" — ขั้นสุดท้ายก่อนถึงร้าน
 *
 * 🛑 นี่คือ **ข้อความอิสระของขนส่ง ไม่ใช่รหัสสถานะ** — เก็บไว้ที่เดียวเพราะมันเปราะ
 * วันที่ขนส่งเปลี่ยนคำ ต้องมีที่เดียวให้แก้ และมีเทส `[blocker]` ตรึงไว้
 *
 * ทำไมไม่ใช้ "ถึงศูนย์คัดแยก" ซึ่งพบบ่อยกว่า: มันวนสลับกับ "อยู่ระหว่างการขนส่ง"
 * หลายรอบต่อพัสดุใบเดียว (TH065880509388 เกิด 4 ครั้ง) = บันทึกเส้นทาง ไม่ใช่ขั้นตอน
 * ⇒ เอามาทำจุดบนแถบไม่ได้ เพราะแถบต้องเดินหน้าอย่างเดียว
 */
export const RETURN_DISPATCH_PHRASE = "กำลังนำส่งพัสดุคืนผู้ส่ง";

/** สถานะสายตีกลับที่บอกว่า "ขนส่งกำลังเอาของมาคืนร้านแล้ว" — อ่านจาก statusDesc */
export function isReturnDispatchEvent(
  code?: string | null,
  statusDesc?: string | null,
): boolean {
  if (!code?.startsWith("return") || !statusDesc) return false;
  return statusDesc.includes(RETURN_DISPATCH_PHRASE);
}

export function returnLegStampOf(
  code?: string | null,
): "returnStartedAt" | "returnedAt" | null {
  if (code === "return") return "returnStartedAt";
  if (code === "return_success") return "returnedAt";
  return null;
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
/**
 * จุดผลลัพธ์ของแถว 1 — **SSOT ของคำ 2 คำนี้** ทั้ง `SHIPMENT_STAGES[3]` และ
 * `describeProgress().lastLabel` ต้องอ่านจากที่นี่ ห้ามพิมพ์สตริงซ้ำ (HR16)
 *
 * 🛑 มีเฉพาะ 2 หน้า ไม่ใช่ 3 — "พัสดุมีปัญหา" (`issue`/`cannot_pickup`) **ไม่ได้อยู่ที่จุดนี้**
 * มันยังปักที่ตำแหน่งจริงของมันตาม `STAGE_OF` แล้วบอกด้วยจุดสีแดง + กล่องเตือนเหมือนเดิม
 * เหตุผล: `cannot_pickup` มี `STAGE_OF = 0` (ขนส่งยังไม่เคยมารับของด้วยซ้ำ) การเอาไปแสดง
 * ที่จุดสุดท้ายจะอ้างว่าพัสดุเดินทางครบเส้นทางแล้ว ซึ่งไม่จริงเลย · ส่วน `issue` เป็น
 * non-terminal (อาจจบด้วยส่งสำเร็จ) การวางที่จุดผลลัพธ์อ่านว่า "จบแล้ว ผลคือมีปัญหา"
 */
export const FORWARD_OUTCOME = {
  delivered: { label: "ส่งสำเร็จ", icon: "circle-check" },
  failed: { label: "ส่งไม่สำเร็จ", icon: "package-off" },
} as const;

export const SHIPMENT_STAGES = [
  // "รอส่งของ" ไม่ใช่ "สร้างพัสดุ" (2026-08-25) — คำเดิมบอกสิ่งที่ *ระบบ* ทำ
  // คำใหม่บอกสิ่งที่ *ของ* เป็น ซึ่งเข้าชุดกับอีก 3 จุดที่เหลือ
  { label: "รอส่งของ", icon: "tabler:package" },
  { label: "รับเข้าระบบแล้ว", icon: "tabler:package-import" },
  { label: "กำลังจัดส่ง", icon: "tabler:truck-delivery" },
  // จุดที่ 4 = **จุดผลลัพธ์** ของขาไป สลับได้ 2 หน้าผ่าน lastLabel/lastIcon:
  // "ส่งสำเร็จ" (เขียว) / "ส่งไม่สำเร็จ" (ส้ม — แล้วแถว 2 งอกออกจากตรงนี้)
  // 🛑 "พัสดุมีปัญหา" **ไม่ได้อยู่ที่จุดนี้** ดูเหตุผลที่ FORWARD_OUTCOME ใน return-timeline.ts
  { label: FORWARD_OUTCOME.delivered.label, icon: `tabler:${FORWARD_OUTCOME.delivered.icon}` },
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
  notice?: ShipmentNotice;
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
  /**
   * 2026-08-25: ย้ายจากจุด 2 (รถ) → จุด 3 (จุดผลลัพธ์)
   *
   * `return` = ขนส่งตัดสินแล้วว่าส่งไม่สำเร็จและกำลังเอาของกลับ ⇒ **ขาไปจบแล้ว**
   * เดิมปักที่จุดรถซึ่งเป็นตำแหน่งเดียวกับ "กำลังจัดส่ง" เป๊ะ ⇒ แยกสองเรื่องนี้ไม่ออกเลย
   * เรื่องที่เหลือ (กำลังกลับ / ถึงร้านหรือยัง) ไปอยู่บนแถวที่ 2 ดู return-timeline.ts
   */
  return: 3,
  cod_refund: 2,
  delivered: 3,
  return_success: 3,
  // ปลายทางที่ไกลกว่า delivered (เงิน COD เข้าแล้ว) — ขาดไปตั้งแต่แรก จึงตกไป ?? 0 = ถอย
  // กลับไปจุด "สร้างพัสดุ" ทั้งที่จบงานแล้ว (user เจอ TH069306110878 บน prod 2026-08-06)
  payment_success: 3,
  close: 3,
};

/**
 * มุมมองของคนอ่านแถบ — คำที่ *สั่งให้ทำอะไรต่อ* แปลคนละอย่างจากสองฝั่ง
 *
 * 🛑 ประกาศที่นี่ (ไม่ใช่ที่ `return-timeline.ts`) เพื่อเลี่ยง import วน — ไฟล์นั้น import
 * `returnLegStampOf` จากไฟล์นี้อยู่แล้ว แล้ว re-export ชนิดนี้ต่อให้ผู้เรียก
 */
export type TimelineAudience = "seller" | "buyer";

export interface ShipmentNotice {
  tone: ShipmentTone;
  text: string;
}

/**
 * กล่องเตือนใต้แถบ — **แยกตามมุมมองคนอ่าน** (แก้ 2026-08-25)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 บั๊กที่แก้: ผู้ซื้อถูกสั่งให้ทำสิ่งที่ทำไม่ได้เลยสักข้อ
 *
 * `ParcelTimeline` (หน้า `/o/[token]` ที่ผู้ซื้อเปิด) เรนเดอร์ `progress.notice.text`
 * **คำต่อคำ** ⇒ ผู้ซื้อเห็นประโยคที่เขียนสำหรับผู้ขายทั้งชุด:
 *   "นัดรับใหม่หรือติดต่อขนส่งโดยตรง" · "เปิดใบใหม่ได้" · "รอเลือกขนส่ง"
 * ทั้งหมดนี้ผู้ซื้อทำไม่ได้ — เขาไม่ใช่ผู้ส่ง ไม่มีบัญชีขนส่ง ไม่มีสิทธิ์สั่งอะไร
 * แถบครึ่งบนอุตส่าห์แยก `audience` ให้แล้ว (ดู `describeReturnLeg`) แต่ครึ่งล่างยังพูด
 * กับคนละคนอยู่ (impeccable clarify จับได้ 2026-08-25)
 *
 * `buyer: null` = **ไม่ต้องแสดงให้ผู้ซื้อเห็นเลย** — บางเรื่องเป็นเรื่องระหว่างร้านกับขนส่ง
 * ล้วน ๆ (เช่นการขอคืนเงินค่าเก็บปลายทาง) การแสดงมีแต่ทำให้ผู้ซื้อกลัวว่าตัวเองถูกเรียกเก็บ
 *
 * 🛑 คำฝั่งผู้ซื้อจบด้วย "ติดต่อร้าน…" เสมอ ไม่ใช่ "ติดต่อขนส่ง" — ร้านคือคู่สัญญาของเขา
 */
const NOTICE_OF: Record<string, { seller: ShipmentNotice; buyer: ShipmentNotice | null }> = {
  no_courier: {
    seller: { tone: "warning", text: "รอเลือกขนส่ง — พัสดุนี้ยังไม่ได้กำหนดขนส่ง" },
    // ผู้ซื้อทำอะไรกับเรื่องนี้ไม่ได้ แต่ควรรู้ว่าทำไมของยังไม่ขยับ
    buyer: { tone: "warning", text: "ร้านยังไม่ได้เลือกขนส่ง — ของยังไม่ออกจากร้าน" },
  },
  cannot_pickup: {
    seller: {
      tone: "danger",
      text: "ขนส่งเข้ารับพัสดุไม่ได้ — นัดรับใหม่หรือติดต่อขนส่งโดยตรง",
    },
    buyer: { tone: "danger", text: "ขนส่งยังเข้ารับของจากร้านไม่ได้ — ติดต่อร้านเพื่อสอบถาม" },
  },
  issue: {
    seller: {
      tone: "danger",
      text: "พัสดุมีปัญหาระหว่างทาง — ติดต่อขนส่งเพื่อตรวจสอบรายละเอียด",
    },
    buyer: { tone: "danger", text: "พัสดุมีปัญหาระหว่างทาง — ติดต่อร้านเพื่อตรวจสอบ" },
  },
  return: {
    seller: { tone: "warning", text: "พัสดุกำลังตีกลับไปยังต้นทาง" },
    buyer: { tone: "warning", text: "ส่งไม่สำเร็จ พัสดุกำลังเดินทางกลับไปที่ร้าน" },
  },
  cod_refund: {
    seller: {
      tone: "warning",
      text: "ขนส่งแจ้งขอคืนเงินเก็บปลายทางของพัสดุนี้ — ตรวจยอดกับ iShip ก่อนปิดงาน",
    },
    // เรื่องระหว่างร้านกับขนส่งล้วน ๆ — แสดงแล้วผู้ซื้อจะนึกว่าตัวเองถูกเรียกเก็บเพิ่ม
    buyer: null,
  },
  /**
   * 🛑 ห้ามใช้คำว่า "สำเร็จ" ที่นี่ — จุดที่ 4 ของแถบเขียน **"ส่งไม่สำเร็จ"** อยู่ห่างไป ~20px
   * ประโยคที่เขียนว่า "สำเร็จแล้ว" ใต้มันจึงอ่านขัดกันเองบนจอเดียว · และคำว่า "สำเร็จ"
   * ถูกจองไว้แล้วให้ "ส่งสำเร็จ" ซึ่งเป็นผลลัพธ์ตรงข้าม
   *
   * ต้องบอก **สิ่งที่ต้องทำต่อ** ด้วย — ของกองอยู่ที่ร้านและออเดอร์ยังเปิดค้าง
   */
  return_success: {
    seller: {
      tone: "secondary",
      text: "พัสดุกลับมาถึงร้านแล้ว — ตรวจรับของ แล้วยกเลิกคำสั่งซื้อหรือนัดส่งใหม่กับลูกค้า",
    },
    buyer: {
      tone: "secondary",
      text: "พัสดุถูกส่งกลับไปที่ร้านแล้ว — ติดต่อร้านเพื่อนัดส่งใหม่หรือขอเงินคืน",
    },
  },
  is_expired: {
    seller: {
      tone: "secondary",
      text: "พัสดุหมดอายุ — ขนส่งไม่ได้เข้ารับภายในเวลาที่กำหนด เปิดใบใหม่ได้",
    },
    buyer: { tone: "secondary", text: "พัสดุหมดอายุก่อนขนส่งเข้ารับ — ติดต่อร้านเพื่อส่งใหม่" },
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
  carrierStatus: string | null | undefined,
  /**
   * 🛑 **บังคับ ไม่มีค่าตั้งต้น** — ค่าตั้งต้นคือสิ่งที่ทำให้บั๊กนี้เกิดตั้งแต่แรก
   *
   * เดิมไม่มีพารามิเตอร์นี้เลย ⇒ ทุกจอได้คำที่เขียนสำหรับผู้ขาย รวมหน้าที่ผู้ซื้อเปิด
   * ถ้าใส่ default เป็น `'seller'` จอใหม่ที่ลืมส่งค่าจะกลับไปพังแบบเดิมเงียบ ๆ
   * ทำให้เป็นพารามิเตอร์บังคับ = `tsc` ไล่ให้ครบทุกจุดแทนเรา
   */
  audience: TimelineAudience,
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
    return { stage: -1, tone: "stopped", notice: NOTICE_OF[code]?.[audience] ?? undefined };
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
    /**
     * ป้ายจุดที่ 4 = **ผลลัพธ์ของขาไป** (2026-08-25)
     *
     * 🛑 สายตีกลับทั้งคู่ (`return`/`return_success`) ได้คำเดียวกันคือ **"ส่งไม่สำเร็จ"**
     * เพราะจุดนี้ตอบแค่ว่า *ขาไปจบยังไง* — เรื่องที่เหลือ ("กำลังตีกลับ" / "ถึงร้านค้า")
     * ไปอยู่บนแถวที่ 2 ซึ่งงอกออกจากจุดนี้ (`describeReturnLeg` ใน return-timeline.ts)
     *
     * เดิม `return_success` เขียนว่า "ส่งคืนสำเร็จ" ทับช่องของ "จัดส่งสำเร็จ" ⇒ แถบอ่านว่า
     * "เดินหน้าครบ 4 ขั้น จบสวย" ทั้งที่ของกลับมากองที่ร้าน (user เจอบน prod TH6504915C3K3F)
     */
    lastLabel: isReturnedCarrierStatus(code)
      ? FORWARD_OUTCOME.failed.label
      : // ปิดงานโดยไม่รู้ว่าสำเร็จหรือไม่ — ห้ามเขียน "ส่งสำเร็จ" ทับจุดสุดท้าย
        code === "close"
        ? "ปิดงานแล้ว"
        : undefined,
    /**
     * `package-off` = *พัสดุ* ที่ส่งไม่ได้ — ไม่ใช่ `truck-off` ซึ่งแปลว่าขนส่งเข้ารับไม่ได้
     * (นั่นคือสถานะ `cannot_pickup` ที่มีอยู่จริงแล้วคนละตัว)
     *
     * 🛑 `arrow-back-up` ถูกถอดออกจากจุดนี้แล้ว — ทุกจอวาดแถว 2 จริงหมด (รวมแถวในตาราง
     * ตั้งแต่ 2026-08-26) จึงไม่มีที่ไหนต้องยุบ 2 แถวเหลือสัญลักษณ์เดียวอีก
     */
    lastIcon: isReturnedCarrierStatus(code)
      ? `tabler:${FORWARD_OUTCOME.failed.icon}`
      : code === "close"
        ? `tabler:${CARRIER_STATUS[code].icon}`
        : undefined,
    // `null` ของฝั่ง buyer = จงใจไม่แสดง (เรื่องระหว่างร้านกับขนส่ง) ไม่ใช่ "ไม่มีข้อมูล"
    notice: code ? (NOTICE_OF[code]?.[audience] ?? undefined) : undefined,
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

/**
 * ─── หลักฐานสำหรับข้อพิพาท (feature 00055 · หัวหน้าสั่ง 2026-08-24) ─────────────
 *
 * สถานะที่ควร "หยุดภาพ" หลักฐานจากขนส่งไว้ทันทีที่เกิด — **เฉพาะกรณีมีปัญหา/ตีกลับ**
 * ไม่ใช่ทุกใบ: พัสดุที่ส่งถึงตามปกติไม่มีใครโต้แย้ง การเก็บทุกใบคือค่าใช้จ่ายและ PII
 * ที่ไม่มีใครได้ประโยชน์
 *
 * 🛑 ทำไมต้องเก็บตอน *เกิดเหตุ* ไม่ใช่ตอนมีคนเปิดดู (วัดจาก prod 2026-08-24):
 * `ShipmentEvent` 1,015 แถวมี payload ดิบ **0 แถว** (webhook ของ iShip ไม่เคยยิงเลย
 * ทุกแถวเป็น POLL ซึ่งไม่บันทึก payload) และพัสดุที่ยัง active 399 ใบ **ไม่มี event เลย
 * 255 ใบ (64%)** เพราะไทม์ไลน์ถูกเขียนเฉพาะตอนคนเอาเมาส์ไปวาง ⇒ วันที่ลูกค้าโต้แย้งว่า
 * "ไม่เคยมีใครเอาของมาส่ง" เราไม่มีอะไรยืนยันเลยในกรณีส่วนใหญ่
 *
 * `is_expired`/`cancelled` อยู่ในชุดนี้ด้วย: ทั้งคู่แปลว่าของไม่ถึงมือผู้รับและมีเงิน/ของ
 * ค้างอยู่ที่ใดที่หนึ่ง ซึ่งเป็นเงื่อนไขของข้อพิพาทเหมือนกัน
 */
export const EVIDENCE_CARRIER_STATUSES = [
  ...PROBLEM_CARRIER_STATUSES,
  ...RETURNED_CARRIER_STATUSES,
  "cancelled",
] as const;

/** ควรหยุดภาพหลักฐานของสถานะนี้ไหม — allow-list, ไม่รู้จัก = ไม่เก็บ */
export function shouldCaptureEvidence(code?: string | null): boolean {
  if (!code) return false;
  return (EVIDENCE_CARRIER_STATUSES as readonly string[]).includes(code);
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

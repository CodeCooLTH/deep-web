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
}

const CARRIER_STATUS: Record<string, CarrierStatusMeta> = {
  order_success: { text: "รอเข้ารับพัสดุ", tone: "primary", terminal: false },
  picked_up: { text: "พัสดุเข้าระบบ", tone: "info", terminal: false },
  with_branch: { text: "พัสดุถึงสถานีคัดแยก", tone: "info", terminal: false },
  in_transit: { text: "อยู่ระหว่างขนส่ง", tone: "info", terminal: false },
  progress: { text: "อยู่ระหว่างจัดส่ง", tone: "info", terminal: false },
  delivered: { text: "จัดส่งแล้ว", tone: "success", terminal: true },
  payment_success: { text: "ชำระเงินสำเร็จ", tone: "success", terminal: false },
  return_success: { text: "ส่งคืนสำเร็จ", tone: "secondary", terminal: true },
  return: { text: "พัสดุตีกลับ", tone: "warning", terminal: false },
  issue: { text: "พัสดุมีปัญหา", tone: "danger", terminal: false },
  cannot_pickup: { text: "ไม่สามารถเข้ารับพัสดุ", tone: "danger", terminal: false },
  no_courier: { text: "รอเลือกขนส่ง", tone: "warning", terminal: false },
  cod_refund: { text: "รายการขอเงินคืน", tone: "warning", terminal: false },
  is_expired: { text: "หมดอายุ", tone: "secondary", terminal: true },
  cancelled: { text: "ยกเลิก", tone: "secondary", terminal: true },
};

/**
 * describeCarrierStatus — แปลรหัสสถานะเป็นข้อความ/สี
 *
 * รหัสที่ไม่รู้จัก (ผู้ให้บริการเพิ่มสถานะใหม่) ต้องไม่ทำให้หน้าจอพัง —
 * คืนข้อความกลาง ๆ ที่ยังบอกผู้ใช้ได้ว่ากำลังเกิดอะไรอยู่ ดีกว่าโชว์รหัสดิบ
 */
export function describeCarrierStatus(code?: string | null): CarrierStatusMeta {
  if (!code) return { text: "ยังไม่มีข้อมูลสถานะ", tone: "secondary", terminal: false };
  return (
    CARRIER_STATUS[code] ?? {
      text: "อยู่ระหว่างดำเนินการ",
      tone: "info",
      terminal: false,
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

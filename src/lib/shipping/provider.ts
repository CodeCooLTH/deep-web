// feature 00084 — helper ข้ามผู้ให้บริการขนส่ง (pure: ไม่แตะ DB/เครือข่าย เพื่อให้เทสได้ตรง ๆ)
import { courierBrandCode } from "@/lib/iship/courier";

export type ShipmentProvider = "ISHIP" | "FLASH";

/** ชื่อบริการ (ไม่ใช่ชื่อขนส่ง) — ใช้ในข้อความที่พูดถึงการเชื่อมต่อ */
export function providerLabel(provider: string | null | undefined): string {
  return provider === "FLASH" ? "Flash Express" : "iShip";
}

/**
 * ป้ายที่มาของพัสดุ (HR16 — SSOT เดียว): Flash ตรง / Flash ผ่าน iShip / ชื่อขนส่งเดิม
 * แยก "Flash ตรง" กับ "Flash ผ่าน iShip" เพราะคนละบัญชี คนละที่ตามเรื่อง
 */
export function shipmentSourceLabel(s: {
  provider?: string | null;
  courierCode?: string | null;
  courierName?: string | null;
}): string {
  if (s.provider === "FLASH") return "Flash (บัญชีของร้านเอง)";
  if (courierBrandCode(s.courierCode, s.courierName) === "FLASH") return "Flash ผ่าน iShip";
  return s.courierName || s.courierCode || "iShip";
}

/** base path ของ route ต่อผู้ให้บริการ (ไม่ใส่ ?shopId= — ผู้เรียกต่อผ่าน useIShipUrl) */
export function shipmentApiBase(provider: string | null | undefined): string {
  return provider === "FLASH" ? "/api/seller/flash" : "/api/seller/iship";
}

/**
 * พัสดุที่ "ใช้ได้จริง" = ไม่ใช่ใบที่สร้างไม่สำเร็จ
 * NEEDS_REVIEW (Flash ตอบ 1003 โดยเราไม่มี pno) ยังไม่มีเลขพัสดุที่ถูกต้อง → ปฏิบัติเหมือน FAILED
 */
export function hasUsableShipment(status: string | null | undefined): boolean {
  return status !== "FAILED" && status !== "NEEDS_REVIEW";
}

/** Flash ไม่แจ้งการโอนเงิน COD → ใบ COD ต้องมีป้ายให้ร้านยืนยันรับเงินเอง */
export function isCodManualConfirmNotice(
  provider: string | null | undefined,
  codAmount: number | null | undefined,
): boolean {
  return provider === "FLASH" && (codAmount ?? 0) > 0;
}

// feature 00084 — แปลง error ของ Flash เป็น HTTP response (API.md §5 Error Code Table)
// รวมไว้ที่เดียวเพื่อไม่ให้แต่ละ route แมปเอง (บทเรียน feedback_service_error_mapping)

import { NextResponse } from "next/server";
import { IShipServiceError } from "@/services/iship.service";
import { mapIShipError } from "@/lib/iship/route-helpers";
import { FlashError, FlashServiceError, redactFlash, type FlashErrorCode, type FlashServiceErrorCode } from "./errors";
import { FlashUnitError } from "./units";

const NO_STORE = { "cache-control": "private, no-store" } as const;

export function flashJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function flashError(code: string, message: string, status: number) {
  return flashJson({ error: { code, message } }, status);
}

const FLASH_STATUS: Record<FlashErrorCode, number> = {
  MERCHANT_NOT_FOUND: 409, // 422 เมื่อ context=connection
  SIGN_INVALID: 409,
  DUPLICATE_ORDER: 409,
  SENDER_ADDRESS_INVALID: 422,
  RECEIVER_ADDRESS_INVALID: 422,
  PARCEL_NOT_FOUND: 404,
  INVALID_REQUEST: 422,
  COD_NOT_ENABLED: 422,
  PICKUP_PENDING: 409,
  PICKUP_NOT_CANCELLABLE: 409,
  NOT_CANCELLABLE: 409,
  NOT_MERCHANT_PARCEL: 422,
  POSTCODE_INVALID: 422,
  SENDER_OUT_OF_AREA: 422,
  UPSTREAM_ERROR: 502,
  UPSTREAM_TIMEOUT: 504,
  UNKNOWN_CODE: 502,
};

const SERVICE_STATUS: Record<FlashServiceErrorCode, number> = {
  NOT_CONNECTED: 409,
  FEATURE_DISABLED: 404,
  SHIPMENT_EXISTS: 409,
  NEEDS_REVIEW: 409,
  INCOMPLETE_DATA: 422,
  NOT_ELIGIBLE: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  MERCHANT_IN_USE: 409,
  MERCHANT_CHANGE_NOT_ALLOWED: 409,
  PNO_TAKEN: 409,
  INVALID_INPUT: 400,
};

/**
 * ส่งออกเฉพาะ userMessage (ไทยของเรา) — ไม่ส่ง upstreamMessage/key/sign/URL เต็ม
 * context="connection": เส้น /connection* ตอบ 1001/1002 เป็น 422 (อื่น ๆ 409)
 */
export function mapFlashError(err: unknown, opts?: { context?: "connection" | string }): NextResponse {
  if (err instanceof IShipServiceError) return mapIShipError(err);

  if (err instanceof FlashServiceError) {
    return flashJson(
      { error: { code: err.code, message: err.userMessage, ...(err.missing ? { missing: err.missing } : {}) } },
      SERVICE_STATUS[err.code] ?? 400,
    );
  }

  if (err instanceof FlashError) {
    const conn = opts?.context === "connection" && err.invalidatesConnection;
    return flashJson(
      { error: { code: err.code, message: err.userMessage, retryable: err.retryable } },
      conn ? 422 : FLASH_STATUS[err.code] ?? 502,
    );
  }

  // หน่วยเงิน/น้ำหนักผิดก่อนส่ง = ข้อมูลพัสดุไม่ครบ/ไม่ตรงหน่วย
  if (err instanceof FlashUnitError) return flashError("INCOMPLETE_DATA", "ข้อมูลเงินหรือน้ำหนักไม่ถูกต้อง ตรวจแล้วลองใหม่", 422);

  // ไม่รู้จัก — log เฉพาะข้อความที่ redact แล้ว ไม่ส่งรายละเอียดออก
  console.error("[flash] unhandled error", redactFlash(err instanceof Error ? err.message : String(err)));
  return flashError("UPSTREAM_ERROR", "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง", 500);
}

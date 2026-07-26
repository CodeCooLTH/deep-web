// feature 00022 — ตัวช่วยของ API route ฝั่งขนส่ง
//
// รวมการแปลง error → HTTP ไว้ที่เดียว เพราะถ้าปล่อยให้แต่ละ route แมปเอง
// รหัส/สถานะจะเพี้ยนกันคนละที่ แล้ว UI จะเดาไม่ถูกว่าเจอเคสไหน
// (บทเรียน feedback_service_error_mapping: error type ใหม่ต้องมีที่รองรับใน route เสมอ)

import { NextResponse } from "next/server";
import { IShipError } from "./errors";
import { IShipServiceError } from "@/services/iship.service";

/** per-user data — กัน shared/carrier cache ส่งคำตอบข้ามผู้ใช้ */
export const NO_STORE = { "cache-control": "private, no-store" } as const;

export function ishipJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function ishipError(code: string, message: string, status: number) {
  return ishipJson({ error: { code, message } }, status);
}

/** HTTP status ต่อ error ของ iShip — แยก timeout (504) ออกจาก error อื่น (502) */
const UPSTREAM_STATUS: Record<string, number> = {
  UPSTREAM_TIMEOUT: 504,
};

const SERVICE_STATUS: Record<string, number> = {
  NOT_CONNECTED: 409,
  SHIPMENT_EXISTS: 409,
  INCOMPLETE_DATA: 422,
  NOT_ELIGIBLE: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
};

/**
 * mapIShipError — แปลง error ทุกชนิดเป็น response
 *
 * ข้อควรระวัง: ส่งออกเฉพาะ `userMessage` (ข้อความไทยของเรา) ไม่ใช่ `upstreamMessage`
 * ที่เป็นข้อความดิบจากผู้ให้บริการ — ข้อความดิบอาจมีข้อมูลอ่อนไหวและอ่านไม่รู้เรื่อง
 * สำหรับร้าน ส่วนตัวดิบเก็บไว้ใน DB ให้ทีมงานตรวจสอบแล้ว
 */
export function mapIShipError(err: unknown): NextResponse {
  if (err instanceof IShipServiceError) {
    const status = SERVICE_STATUS[err.code] ?? 400;
    return ishipJson(
      {
        error: {
          code: err.code,
          message: err.userMessage,
          ...(err.missing ? { missing: err.missing } : {}),
        },
      },
      status,
    );
  }

  if (err instanceof IShipError) {
    return ishipJson(
      { error: { code: err.code, message: err.userMessage, retryable: err.retryable } },
      UPSTREAM_STATUS[err.code] ?? 502,
    );
  }

  // error ที่ไม่รู้จัก — ไม่ส่งรายละเอียดออกไป (อาจมี stack/ข้อมูลภายใน)
  console.error("[iship] unhandled error", err);
  return ishipError(
    "UPSTREAM_ERROR",
    "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง",
    500,
  );
}

/** อ่าน JSON body แบบไม่โยน — body ว่าง/ไม่ใช่ JSON คืน null ให้ caller ตัดสินใจเอง */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

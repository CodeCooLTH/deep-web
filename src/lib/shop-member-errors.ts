import { NextResponse } from "next/server";
import { STAFF_FLAGS_ERROR_TEXT, isStaffFlagsError } from "@/lib/shop-role-assignment";

/** error code จาก shop-member.service → HTTP (EXT 2026-10-05) · ไม่รู้จัก = null ให้ผู้เรียก 500 */
const STATUS: Record<string, number> = {
  NOT_OWNER: 403, NOT_PRIMARY_OWNER: 403, NOT_A_MEMBER: 404,
  PRIMARY_OWNER_LOCKED: 409, CANNOT_REMOVE_SELF: 409, SHOP_LOCKED: 409,
  RECIPIENT_NO_PACKAGE: 409, RECIPIENT_BUSINESS_QUOTA: 409, RECIPIENT_ADMIN_QUOTA: 409,
  INVALID_ROLES: 400, BILLING_NOT_AVAILABLE: 400,
  // 00086: ธงสิทธิ์รายคน — ไม่ map = 500 ทั้งที่เป็นข้อผิดของผู้ใช้
  STAFF_FLAGS_NOT_AVAILABLE: 400, CLOSE_JOB_NEEDS_START_ROLE: 400,
};

export function memberErrorResponse(e: unknown): NextResponse | null {
  const code = e instanceof Error ? e.message : "";
  if (!STATUS[code]) return null;
  return NextResponse.json(staffFlagsErrorBody(code) ?? { error: code }, { status: STATUS[code] });
}

/** 00086: ข้อผิดธงสิทธิ์ = { error, message ไทย } · รหัสอื่น = null (ใช้ร่วมกับ route สร้างคำเชิญ/ลิงก์ที่มีตาราง status ของตัวเอง) */
export function staffFlagsErrorBody(code: string): { error: string; message: string } | null {
  return isStaffFlagsError(code) ? { error: code, message: STAFF_FLAGS_ERROR_TEXT[code] } : null;
}

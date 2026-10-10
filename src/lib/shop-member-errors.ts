import { NextResponse } from "next/server";

/** error code จาก shop-member.service → HTTP (EXT 2026-10-05) · ไม่รู้จัก = null ให้ผู้เรียก 500 */
const STATUS: Record<string, number> = {
  NOT_OWNER: 403, NOT_PRIMARY_OWNER: 403, NOT_A_MEMBER: 404,
  PRIMARY_OWNER_LOCKED: 409, CANNOT_REMOVE_SELF: 409, SHOP_LOCKED: 409,
  RECIPIENT_NO_PACKAGE: 409, RECIPIENT_BUSINESS_QUOTA: 409, RECIPIENT_ADMIN_QUOTA: 409,
  INVALID_ROLES: 400, BILLING_NOT_AVAILABLE: 400,
};

export function memberErrorResponse(e: unknown): NextResponse | null {
  const code = e instanceof Error ? e.message : "";
  return STATUS[code] ? NextResponse.json({ error: code }, { status: STATUS[code] }) : null;
}

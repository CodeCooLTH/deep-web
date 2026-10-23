// feature 00084 — OWNER-only ของ route Flash (TFR-FLASH-023)
// ทำไมแยกจาก cap: S2 = เจ้าของ+ผู้ดูแล แต่ key/เชื่อม/ถอน/ตั้งค่า ต้องเจ้าของเท่านั้น → ตัดสินที่ server จาก effRoles
import type { NextResponse } from "next/server";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";

/** คืน 403 FORBIDDEN_ROLE ถ้า effRoles ไม่มี OWNER · ผ่านแล้วคืน null */
export function requireFlashOwner(guard: { effRoles: readonly string[] }): NextResponse | null {
  return guard.effRoles.includes("OWNER") ? null : forbiddenRoleResponse();
}

export const isFlashOwner = (guard: { effRoles: readonly string[] }) => guard.effRoles.includes("OWNER");

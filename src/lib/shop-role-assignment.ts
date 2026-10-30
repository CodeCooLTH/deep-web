import { canUseAppointments } from "@/lib/appointments";
import { STAFF_ROLES, effectiveRoles } from "@/lib/shop-permissions";

/** กติกามอบบทบาทย่อยให้ ADMIN (00071 P2) — pure ไม่แตะ DB */
export type RoleAssignError = "INVALID_ROLES" | "BILLING_NOT_AVAILABLE";
type StaffRole = (typeof STAFF_ROLES)[number];

/** null = ใช้ได้ · BILLING ใช้ได้เฉพาะร้านที่ใช้คิวงานได้ (canUseAppointments) */
export function validateAssignableRoles(
  roles: readonly string[],
  shop: { kind: string; vertical: string },
): RoleAssignError | null {
  const ok =
    roles.length >= 1 && roles.length <= STAFF_ROLES.length &&
    new Set(roles).size === roles.length &&
    roles.every((r) => (STAFF_ROLES as readonly string[]).includes(r));
  if (!ok) return "INVALID_ROLES";
  if (roles.includes("BILLING") && !canUseAppointments(shop)) return "BILLING_NOT_AVAILABLE";
  return null;
}

/** 00086 — ข้อผิดของธงสิทธิ์รายคน (ปิดงาน / บันทึกค่าใช้จ่าย) */
export type StaffFlagsError = "STAFF_FLAGS_NOT_AVAILABLE" | "CLOSE_JOB_NEEDS_START_ROLE";

/** ข้อความไทยของรหัสข้างบน — route แนบไปกับ 400 (ฝั่ง UI ใช้รหัส `error` เป็นหลัก ข้อความนี้เป็นค่าสำรองที่อ่านรู้เรื่อง) */
export const STAFF_FLAGS_ERROR_TEXT: Record<StaffFlagsError, string> = {
  CLOSE_JOB_NEEDS_START_ROLE: "ปิดงานได้ ต้องใช้คู่กับ ตอบแชท หรือ ฝ่ายช่าง",
  STAFF_FLAGS_NOT_AVAILABLE: "ร้านนี้ไม่ได้ขายบริการ จึงตั้งปิดงานได้/บันทึกค่าใช้จ่ายได้ไม่ได้",
};

export function isStaffFlagsError(code: string): code is StaffFlagsError {
  return code in STAFF_FLAGS_ERROR_TEXT;
}

/**
 * null = ใช้ได้
 *  - STAFF_FLAGS_NOT_AVAILABLE: ร้านไม่ใช่บริการ แต่ติ๊กธงใดธงหนึ่ง (ธงมีผลเฉพาะร้านบริการ — กันไม่ให้เก็บค่าที่ไม่มีความหมาย)
 *  - CLOSE_JOB_NEEDS_START_ROLE: ติ๊ก "ปิดงานได้" แต่ไม่มีบทบาทที่เริ่มงานได้ (CHAT/TECHNICIAN/MANAGER)
 * ธงที่ไม่ได้ส่งมา = false
 */
export function validateStaffFlags(
  roles: readonly string[],
  flags: { canCloseJob?: boolean; canRecordExpense?: boolean },
  shop: { kind: string; vertical: string },
): StaffFlagsError | null {
  const close = flags.canCloseJob === true;
  const expense = flags.canRecordExpense === true;
  if ((close || expense) && !canUseAppointments(shop)) return "STAFF_FLAGS_NOT_AVAILABLE";
  if (close && !roles.some((r) => (CLOSE_JOB_START_ROLES as readonly string[]).includes(r))) return "CLOSE_JOB_NEEDS_START_ROLE";
  return null;
}

/**
 * acceptedStaffFlags — ธงที่จะเขียนลงสมาชิกใหม่ตอนรับคำเชิญ/ลิงก์ (00086)
 * ธงในคำเชิญเป็นภาพนิ่งตอนสร้าง (stored-flag-vs-owner-truth): ถ้าร้านเลิกเป็นร้านบริการระหว่างรอรับ
 * ห้ามพาธงที่ไม่มีความหมายเข้าแถวสมาชิก — เช็คประเภทร้านปัจจุบันอีกรอบ · ปิดงานต้องมีบทบาทเริ่มงานด้วย
 */
export function acceptedStaffFlags(
  src: { roles: readonly string[]; canCloseJob: boolean; canRecordExpense: boolean },
  shop: { kind: string; vertical: string },
): { canCloseJob: boolean; canRecordExpense: boolean } {
  if (!canUseAppointments(shop)) return { canCloseJob: false, canRecordExpense: false };
  const close = src.canCloseJob === true && validateStaffFlags(src.roles, { canCloseJob: true }, shop) === null;
  return { canCloseJob: close, canRecordExpense: src.canRecordExpense === true };
}

/** บทบาทที่ "เริ่มงานได้" — ธงปิดงานมีความหมายเฉพาะคนที่ถือหนึ่งในนี้ */
const CLOSE_JOB_START_ROLES = ["MANAGER", "CHAT", "TECHNICIAN"] as const;

type StaffFlagValues = { canCloseJob: boolean; canRecordExpense: boolean };
type Plan = ({ role: "OWNER" | "ADMIN"; roles: StaffRole[] } & StaffFlagValues) | { error: RoleAssignError };

/**
 * คำนวณ (role, roles, ธง) ใหม่ของสมาชิก — ผลเป็น OWNER ⇒ roles [] และธงทั้งสอง false เสมอ
 * (ตรง CHECK ShopMember_roles_check + ShopMember_flags_admin_only_check)
 * ธงของ current บังคับส่ง (ไม่ optional): ผลถูกเขียนลงแถวตรง ๆ — ถ้า caller ลืมอ่านธงเดิมแล้วเราถือว่า false
 * จะล้างธงที่เจ้าของตั้งไว้เงียบ ๆ ทุกครั้งที่เปลี่ยนบทบาท
 * roles ใหม่ไม่มี MANAGER/CHAT/TECHNICIAN ⇒ canCloseJob false (ไม่มีงานให้ปิด)
 */
export function planMemberRoleChange(p: {
  current: { role: string; roles: readonly string[] } & StaffFlagValues;
  input: { role?: "OWNER" | "ADMIN"; roles?: StaffRole[]; canCloseJob?: boolean; canRecordExpense?: boolean };
}): Plan {
  const role = p.input.role ?? (p.current.role === "OWNER" ? "OWNER" : "ADMIN");
  const given = p.input.roles;
  if (role === "OWNER") {
    if (given && given.length > 0) return { error: "INVALID_ROLES" };
    return { role, roles: [], canCloseJob: false, canRecordExpense: false };
  }
  const roles: StaffRole[] = given
    ? given
    : p.current.role === "OWNER"
      ? ["MANAGER"] // OWNER→ADMIN ไม่ระบุ = ค่าตั้งต้น
      : (p.current.roles as StaffRole[]); // ไม่มีอะไรเปลี่ยน (idempotent)
  // เพิ่งลดจากเจ้าของ: ธงเดิมของเจ้าของเป็น false ตาม CHECK อยู่แล้ว — ใช้ค่าที่ส่งมาหรือ false
  const canStart = roles.some((r) => (CLOSE_JOB_START_ROLES as readonly string[]).includes(r));
  const canCloseJob = canStart && (p.input.canCloseJob ?? p.current.canCloseJob) === true;
  const canRecordExpense = (p.input.canRecordExpense ?? p.current.canRecordExpense) === true;
  return { role, roles, canCloseJob, canRecordExpense };
}

/**
 * 00086 P3 — หลังเปลี่ยนแถวสมาชิกเป็น `next` แล้ว ต้องปลดเขาออกจากงานบริการที่ยังเปิดอยู่ไหม (user อนุมัติ 2026-10-29)
 *
 * = ร้านบริการ ∧ ชุดบทบาทที่ "มีผลจริง" หลังเปลี่ยนไม่มี TECHNICIAN
 *  - ใช้ effectiveRoles ตัวเดียวกับด่านมอบงาน (assignServiceJob/listServiceStaff) — ผู้รับผิดชอบต้องเป็นคนที่ระบบยัง "มอบให้ได้"
 *    ถ้าปล่อยชื่อค้าง จะได้งานที่ผู้รับผิดชอบไม่อยู่ในรายชื่อช่าง และช่างล้วนคนอื่นเริ่ม/ปิดงานนั้นไม่ได้
 *  - เลื่อนเป็นเจ้าของ (OWNER = ['OWNER'] ไม่มี TECHNICIAN) ก็นับ: เจ้าของถูกมอบงานไม่ได้ (AssigneeNotTechnician)
 *    และยังเริ่ม/ปิดงานได้ทุกใบอยู่แล้วในฐานะเจ้าของ จึงไม่เสียความสามารถ — เสียแค่ชื่อบนงาน
 *  - ยังถือ TECHNICIAN (เช่น เพิ่ม/ถอด CHAT · แก้ธง) = ไม่แตะงาน
 *  - ร้านไม่ใช่บริการ = false เสมอ (ไม่มีระบบผู้รับผิดชอบ)
 * ไม่ดูว่า "ก่อนหน้าถือ TECHNICIAN ไหม": ถ้าไม่เคยถือก็ไม่มีงานให้ปลด (query ว่าง) — กติกาข้อเดียวพิสูจน์ง่ายกว่า
 */
export function mustUnassignOpenJobs(
  shop: { kind: string; vertical: string },
  next: { role: string; roles: readonly string[] },
): boolean {
  if (!canUseAppointments(shop)) return false;
  return !effectiveRoles(shop, next.role, next.roles).includes("TECHNICIAN");
}

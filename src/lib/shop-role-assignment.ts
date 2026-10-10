import { canUseAppointments } from "@/lib/appointments";
import { STAFF_ROLES } from "@/lib/shop-permissions";

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

type Plan = { role: "OWNER" | "ADMIN"; roles: StaffRole[] } | { error: RoleAssignError };

/** คำนวณ (role, roles) ใหม่ของสมาชิก — ผลเป็น OWNER ⇒ roles [] เสมอ (ตรง CHECK ShopMember_roles_check) */
export function planMemberRoleChange(p: {
  current: { role: string; roles: readonly string[] };
  input: { role?: "OWNER" | "ADMIN"; roles?: StaffRole[] };
}): Plan {
  const role = p.input.role ?? (p.current.role === "OWNER" ? "OWNER" : "ADMIN");
  const given = p.input.roles;
  if (role === "OWNER") {
    if (given && given.length > 0) return { error: "INVALID_ROLES" };
    return { role, roles: [] };
  }
  if (given) return { role, roles: given };
  if (p.current.role === "OWNER") return { role, roles: ["MANAGER"] }; // OWNER→ADMIN ไม่ระบุ = ค่าตั้งต้น
  return { role, roles: p.current.roles as StaffRole[] }; // ไม่มีอะไรเปลี่ยน (idempotent)
}

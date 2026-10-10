import { can, rolesFromMembership } from '@/lib/shop-permissions'
import { requireActiveShop, type ActiveShop } from '@/lib/shop-context'

/**
 * agent-report-access.service — จุดตัดสินสิทธิ์เดียวของรายงานผลงานแอดมิน (feature 00059)
 *
 * โครงเดียวกับ `expense-access.service.ts` โดยตั้งใจ — ตัดสินด้วย `can()` ตัวกลางเท่านั้น
 *
 * ── กฎสิทธิ์ (00071 BR-RP-08/09/10) ─────────────────────────────────────────
 * ยอดขายรายคนคือ "การเงินเต็ม" = capability F1 = เจ้าของเท่านั้น · ยกเลิกสวิตช์
 * `staffCanViewFinance` แล้ว (ไม่อ่านธงนี้อีก) ⇒ ใครไม่มี F1 ได้ SELF
 *
 * ── ระดับสิทธิ์ ─────────────────────────────────────────────────────────────
 *   FULL — มี F1 (เจ้าของ/เจ้าของร่วม): เห็นทุกคน ทุกคอลัมน์
 *   SELF — ไม่มี F1: เห็น **เฉพาะผลงานของตัวเอง** และ **ไม่มีคอลัมน์ยอดขาย**
 *   NO_SHOP — ยังไม่มีร้าน
 *
 * 🛑 `SELF` ไม่ใช่ "ปิดหน้า" — ผลงานของตัวเองคือข้อมูลของเจ้าตัวเอง การซ่อนทั้งหน้าไม่ได้
 * เพิ่มความปลอดภัยอะไรเลย แต่ทำให้พนักงานไม่มีทางรู้ว่าตัวเองตอบช้าหรือเร็ว
 */
export type AgentReportAccess =
  | {
      kind: 'FULL'
      shop: ActiveShop['shop']
      role: 'OWNER' | 'ADMIN'
      userId: string
      /** null = ดูได้ทุกคน */
      scopeToAgentUserId: null
      canSeeRevenue: true
    }
  | {
      kind: 'SELF'
      shop: ActiveShop['shop']
      role: 'ADMIN'
      userId: string
      scopeToAgentUserId: string
      canSeeRevenue: false
    }
  | { kind: 'NO_SHOP' }

export async function resolveAgentReportAccess(
  session: { user?: { id?: string | null; activeShopId?: string | null } | null } | null,
): Promise<AgentReportAccess> {
  const userId = session?.user?.id
  const active = await requireActiveShop(session)
  if (!active || !userId) return { kind: 'NO_SHOP' }

  if (can(rolesFromMembership(active.role), 'F1')) {
    return {
      kind: 'FULL', shop: active.shop, role: active.role, userId,
      scopeToAgentUserId: null, canSeeRevenue: true,
    }
  }

  return {
    kind: 'SELF', shop: active.shop, role: 'ADMIN', userId,
    scopeToAgentUserId: userId, canSeeRevenue: false,
  }
}

/**
 * ตัดตัวเลขเงินออกเมื่อผู้ใช้ไม่มีสิทธิ์เห็น
 *
 * 🛑 ตัดที่ **ขอบของ response** ไม่ใช่ที่หน้าจอ — หน้า `(paces)` ทั้งหมดอยู่ใต้ client layout
 * ทุก field ที่ส่งลงไปจะอยู่ใน flight payload ที่เปิดดูได้ การ "ไม่ render คอลัมน์"
 * ไม่ได้แปลว่าข้อมูลไม่ถูกส่งไป (feedback_rsc_pii_neutralize_at_source)
 *
 * 🛑 คืน `null` ไม่ใช่ `0` — 0 บาทแปลว่า "ขายไม่ได้เลย" ซึ่งเป็นคำโกหก ส่วน null
 * ให้หน้าจอซ่อนทั้งคอลัมน์ได้อย่างซื่อสัตย์
 */
export function redactRevenue<T extends { revenue: number }>(
  rows: T[],
  access: AgentReportAccess,
): (Omit<T, 'revenue'> & { revenue: number | null })[] {
  const allowed = access.kind === 'FULL'
  return rows.map((r) => ({ ...r, revenue: allowed ? r.revenue : null }))
}

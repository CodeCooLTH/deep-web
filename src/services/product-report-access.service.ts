/**
 * product-report-access.service — จุดตัดสินสิทธิ์เดียวของรายงาน "ยอดขายรายสินค้า" (feature 00063)
 *
 * โครงเดียวกับ `agent-report-access.service.ts` และ `expense-access.service.ts` โดยตั้งใจ
 *
 * ── กฎสิทธิ์ (00071 BR-RP-08/09/10 · มติ D-5) ───────────────────────────────
 * รายงานยอดขายรายสินค้า = "การเงินเต็ม" = capability F1 = เจ้าของ (รวมเจ้าของร่วม) เท่านั้น
 * ยกเลิกสวิตช์ `staffCanViewFinance` แล้ว (ไม่อ่านธงนี้อีก — ผู้ดูแลเปิดธงก็ไม่ได้ผล)
 * เดิมผู้ถูกเชิญทุกคนเป็น ADMIN และธง default true ⇒ ทุกคนเห็นรายงานนี้ ซึ่งผิดเจตนา
 * ("ยอดขายรวมทั้งร้านเป็นข้อมูลระดับเจ้าของ")
 */
import { can, rolesFromMembership } from '@/lib/shop-permissions'
import { requireActiveShop, type ActiveShop } from '@/lib/shop-context'

/** vertical เดียวที่รายงานนี้ให้ความหมายถูกต้อง */
export const PRODUCT_REPORT_VERTICAL = 'ONLINE_SALES'

export type ProductReportAccess =
  | { kind: 'OK'; shop: ActiveShop['shop']; role: 'OWNER' | 'ADMIN' }
  | { kind: 'NO_SHOP' }
  /**
   * ร้านคนละประเภท — `LODGING` ขายเป็น "คืน/ห้อง" ที่คร่อมหลายวัน การพล็อตลงแกน
   * "วันที่สั่ง" ให้ความหมายผิด (จองวันที่ 1 เข้าพักวันที่ 20 จะไปโผล่ที่วันที่ 1)
   * ส่วน `SERVICE_QUEUE` ยังไม่อยู่ในขอบเขตรอบนี้ตามมติ
   */
  | { kind: 'WRONG_VERTICAL' }
  /** เป็นสมาชิกร้านจริง แต่ไม่มี capability F1 */
  | { kind: 'FORBIDDEN' }

export async function resolveProductReportAccess(
  session: { user?: { id?: string | null; activeShopId?: string | null } | null } | null,
): Promise<ProductReportAccess> {
  const userId = session?.user?.id
  const active = await requireActiveShop(session)
  if (!active || !userId) return { kind: 'NO_SHOP' }

  // 🛑 ตรวจ vertical ก่อนสิทธิ์โดยตั้งใจ — ทั้งสองฝ่ายเป็นคนในร้านอยู่แล้ว (รู้ประเภทร้านตัวเอง)
  // การบอกว่า "รายงานนี้ใช้กับร้านประเภทนี้ไม่ได้" จึงไม่ใช่การรั่วข้อมูล และเป็นคำตอบที่
  // ตรงกับสิ่งที่ผู้ใช้กำลังงงมากกว่า "คุณไม่มีสิทธิ์"
  if ((active.shop.vertical ?? PRODUCT_REPORT_VERTICAL) !== PRODUCT_REPORT_VERTICAL) {
    return { kind: 'WRONG_VERTICAL' }
  }

  if (can(rolesFromMembership(active.role, active.roles), 'F1')) {
    return { kind: 'OK', shop: active.shop, role: active.role }
  }

  return { kind: 'FORBIDDEN' }
}

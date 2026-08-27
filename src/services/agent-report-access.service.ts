import { requireActiveShop, type ActiveShop } from '@/lib/shop-context'

/**
 * agent-report-access.service — จุดตัดสินสิทธิ์เดียวของรายงานผลงานแอดมิน (feature 00059)
 *
 * โครงเดียวกับ `expense-access.service.ts` โดยตั้งใจ (โจทย์ข้อ 12: "ห้ามสร้างระบบสิทธิ์แยก
 * ของตัวเอง ให้ใช้กลไกที่มีอยู่") — และใช้ **ธงตัวเดียวกัน** ไม่ได้ตั้งธงใหม่
 *
 * ── ทำไม `Shop.staffCanViewFinance` ถึงเป็นธงที่ถูกต้องสำหรับรายงานนี้ ──────────
 * รายงานนี้แสดง **ยอดขายรายคน** ซึ่งเป็นข้อมูลการเงินระดับร้านชนิดเดียวกับที่ธงนั้นคุมอยู่แล้ว
 * (`/expenses` และกำไร-ขาดทุนใน `/sales`) การตั้งธงที่สองมาคุมของประเภทเดียวกันแปลว่าเจ้าของร้าน
 * ต้องไปปิดสองที่ถึงจะปิดได้จริง ซึ่งเป็นรูปร่างของช่องโหว่ที่ค้นเจอยากที่สุด
 *
 * ── ระดับสิทธิ์ ─────────────────────────────────────────────────────────────
 *   FULL — เจ้าของร้าน หรือ พนักงานที่เจ้าของเปิดสิทธิ์การเงินให้: เห็นทุกคน ทุกคอลัมน์
 *   SELF — พนักงานที่ยังไม่ได้เปิดสิทธิ์การเงิน: เห็น **เฉพาะผลงานของตัวเอง** และ
 *          **ไม่มีคอลัมน์ยอดขาย** (ตัวเลขของเพื่อนร่วมงานไม่ใช่ของที่ทุกคนควรเห็นโดยอัตโนมัติ)
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

  if (active.role === 'OWNER') {
    return {
      kind: 'FULL', shop: active.shop, role: 'OWNER', userId,
      scopeToAgentUserId: null, canSeeRevenue: true,
    }
  }

  // 🛑 fail-closed: ธงต้องเป็น true จริง ๆ เท่านั้น — ห้ามลัดด้วย `!== false`
  // (ค่า default ของคอลัมน์คือ true อยู่แล้ว แต่กลไกต้องอ่านธงเสมอ ไม่งั้นสวิตช์บนหน้าจอ
  //  ของเจ้าของร้านจะกลายเป็นของหลอก — เหตุผลเดียวกับที่เขียนไว้ใน expense-access.service)
  if (active.shop.staffCanViewFinance === true) {
    return {
      kind: 'FULL', shop: active.shop, role: 'ADMIN', userId,
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

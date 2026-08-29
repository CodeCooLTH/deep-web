/**
 * product-report-access.service — จุดตัดสินสิทธิ์เดียวของรายงาน "ยอดขายรายสินค้า" (feature 00063)
 *
 * โครงเดียวกับ `agent-report-access.service.ts` และ `expense-access.service.ts` โดยตั้งใจ —
 * **ใช้ธงเดิม ไม่ตั้งธงใหม่**
 *
 * ── ทำไมถึงเป็น `Shop.staffCanViewFinance` ──────────────────────────────────
 * 🛑 บันทึกไว้เพราะมันขัดกับถ้อยคำของมติเดิม: user เคาะว่า "เจ้าของร้าน + ADMIN เท่านั้น
 * staff ไม่เห็น" โดยเข้าใจว่า ADMIN กับ staff เป็นคนละ role — **แต่ในสคีมาจริงไม่ใช่**
 * `ShopMember.role` มีแค่ `'OWNER' | 'ADMIN'` (schema.prisma:1188) ⇒ ทุกคนที่ถูกเชิญเข้าร้าน
 * คือ ADMIN ทั้งหมด ไม่มี role ที่ต่ำกว่านั้นให้กันออก ถ้าทำตามถ้อยคำตรง ๆ จะแปลว่า
 * "ทุกคนที่เข้าถึงร้านได้" ซึ่งตรงข้ามกับ *เจตนา* ที่ user อธิบายไว้ ("ยอดขายรวมทั้งร้าน
 * เป็นข้อมูลระดับเจ้าของ")
 *
 * ธงที่มีอยู่แล้วและคุมข้อมูลประเภทเดียวกันเป๊ะ (ตัวเลขการเงินระดับร้าน) คือ
 * `staffCanViewFinance` ซึ่ง `/expenses` และ `/reports/agents` ใช้อยู่ — การตั้งธงที่สอง
 * มาคุมของประเภทเดียวกันแปลว่าเจ้าของร้านต้องไปปิดสองที่ถึงจะปิดได้จริง ซึ่งเป็นรูปร่างของ
 * ช่องโหว่ที่ค้นเจอยากที่สุด (เหตุผลเดียวกับที่เขียนไว้ใน agent-report-access.service.ts)
 *
 * ⚠️ ผลข้างเคียงที่ต้องรู้: คอลัมน์นี้ `@default(true)` ⇒ ADMIN เห็นรายงานนี้เป็นค่าตั้งต้น
 * เจ้าของร้านปิดได้จากสวิตช์เดิมที่หน้าตั้งค่าร้าน
 */
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
  /** เป็นสมาชิกร้านจริง แต่เจ้าของปิดสิทธิ์ดูตัวเลขการเงินไว้ */
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

  if (active.role === 'OWNER') {
    return { kind: 'OK', shop: active.shop, role: 'OWNER' }
  }

  // 🛑 fail-closed: ต้องเป็น true จริง ๆ ห้ามลัดด้วย `!== false`
  // (ค่า default เป็น true อยู่แล้ว แต่กลไกต้องอ่านธงเสมอ ไม่งั้นสวิตช์ของเจ้าของร้าน
  //  จะกลายเป็นของหลอก — เหตุผลเดียวกับ expense-access.service)
  if (active.shop.staffCanViewFinance === true) {
    return { kind: 'OK', shop: active.shop, role: 'ADMIN' }
  }

  return { kind: 'FORBIDDEN' }
}

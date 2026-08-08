/**
 * OrderProfitInline — กำไรรายออเดอร์แบบบรรทัดเดียว ใต้ยอดในหน้ารายการ (user สั่ง 2026-08-08)
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx คอลัมน์ `status`
 *   (แถวเช็กลิสต์ `<Icon className="shrink-0 text-sm" /> + ข้อความ + text-{semantic}-ink`)
 *   — ยกทรง icon+ข้อความ inline จากคอลัมน์ข้างเคียงในตารางเดียวกัน ไม่ยกการ์ดเต็มใบของหน้า detail
 * Base (คำ/ไอคอน/โทนสี): src/lib/order-profit-presentation.ts — ตัวเดียวกับ OrderProfitCard
 *
 * [สำคัญ] prop `profit` ที่เป็น `undefined` แปลว่า **ผู้ใช้คนนี้ไม่มีสิทธิ์เห็นตัวเลขการเงิน**
 * และ server ต้อง omit key นี้ทิ้งไปเลยตั้งแต่ตอนประกอบ OrderRow ไม่ใช่ส่ง undefined มาให้
 * component เลือกไม่ render — หน้ารายการอยู่ใต้ client layout ทุกค่าที่ข้ามเส้น RSC ถูก
 * serialize ลง HTML เสมอ (feedback_rsc_pii_neutralize_at_source) การเช็คตรงนี้เป็นแค่ด่านสุดท้าย
 */

import Icon from '@/components/wrappers/Icon'
import type { OrderProfit } from '@/lib/order-profit'
import { presentOrderProfit, PROFIT_TONE } from '@/lib/order-profit-presentation'

type Props = {
  /**
   * undefined = ไม่มีสิทธิ์เห็น (ไม่ render อะไรเลย) · null = ใบนี้ยังไม่นับเป็นยอดขาย
   * · object = มีตัวเลข
   */
  profit?: OrderProfit | null
  /** ORDER_VOCAB.noun ของร้าน — "คำสั่งซื้อ"/"งาน"/"การเข้าพัก" */
  orderNoun: string
}

export default function OrderProfitInline({ profit, orderNoun }: Props) {
  if (profit === undefined) return null

  // ── หน้ารายการโชว์เฉพาะตัวเลขที่ "เชื่อได้จริง" — 2 สถานะข้างล่างถูกถอดออก (user สั่ง
  //    2026-08-08 หลังเห็นของจริงบนมือถือ: "ไม่ต้องขึ้นได้ไหม เอาออกก่อน สร้างความสับสน")
  //
  //    [สำคัญ] จงใจให้ไม่ตรงกับการ์ดในหน้า detail ซึ่งยังโชว์ทั้ง 2 สถานะอยู่ — ไม่ใช่บั๊ก
  //    ที่นั่นคำเตือน "ต้นทุนไม่ครบ" เป็น badge ที่ **กดไป /products?cost=missing ได้จริง**
  //    คำเตือนที่มีทางออกให้กดคุ้มที่จะขึ้น ส่วนในแถวรายการไม่มีทางออกให้ เหลือแต่คำที่
  //    อ่านแล้วงงว่าตกลงกำไรเท่าไหร่กันแน่ (ดู docs/conventions/sibling-surface-parity.md —
  //    ความต่างระหว่างพี่น้องต้องมีเหตุผลเขียนกำกับ ไม่ใช่ปล่อยให้คนถัดไปเดา)

  // ยังไม่นับเป็นยอดขาย (PENDING/CANCELLED) — สถานะของใบมี badge บอกบนหัวการ์ด/แถวอยู่แล้ว
  if (profit === null) return null

  // ต้นทุนไม่ครบ = ตัวเลขเป็นเพดานบน ไม่ใช่กำไรจริง
  //
  // [สำคัญ] ต้องอ่าน `profit.hasMissingCost` ดิบ ๆ ห้าม gate ด้วย `p.tone`/`p.icon` —
  // `presentOrderProfit()` คืน tone 'danger' ให้ทั้ง "ขาดทุนอย่างน้อย" (ต้นทุนไม่ครบ → ซ่อน)
  // และ "ขาดทุนจากใบนี้" (ต้นทุนครบ → ต้องโชว์) แยกสองอันนี้จาก tone ไม่ได้
  if (profit.hasMissingCost) return null

  const p = presentOrderProfit(profit, orderNoun)
  const tone = PROFIT_TONE[p.tone]

  // เท่าทุนพอดี: ไม่ซ้ำ "฿0" ต่อท้าย — คำว่า "เท่าทุน" สื่อครบแล้ว และตัวเลขที่ไม่เพิ่มข้อมูล
  // ในพื้นที่ระดับเซลล์คือของที่ต้องตัด (การ์ดในหน้า detail มีที่ว่างพอจึงยังโชว์ ฿0 ตามเดิม)
  const showAmount = p.amount !== null && p.tone !== 'neutral'

  return (
    <p
      // role="img" ไม่ใช่ <p> เปล่า — aria-label ใช้ได้เฉพาะกับ role ที่รองรับ "ชื่อจากผู้เขียน"
      // ซึ่ง role=paragraph (ค่าปริยายของ <p>) ไม่รองรับ ถ้าไม่ประกาศ role ที่นี่ screen reader
      // ที่ทำตามสเปกจะทิ้ง aria-label แล้วอ่านเนื้อในแทน ซึ่ง aria-hidden ไว้หมด = เงียบสนิท
      // (ทรงเดียวกับ MiniShipmentTimeline.tsx ในโฟลเดอร์นี้ที่ทำถูกอยู่แล้ว)
      role="img"
      className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${tone.text}`}
      // note = ประโยคเต็มที่บอกว่าตัวเลขนี้เชื่อได้แค่ไหน — ในเซลล์แคบ ๆ ไม่มีที่ให้พิมพ์เต็ม
      // title ใช้ได้เฉพาะคนที่มีเมาส์ (มือถือไม่มี hover) จึงต้องมี aria-label คู่เสมอ ไม่ใช่แทนกัน
      title={p.note}
      aria-label={`${p.label}${showAmount ? ` ${p.amount}` : ''} · ${p.note}`}
    >
      <Icon icon={p.icon} className="shrink-0 text-xs" aria-hidden="true" />
      {/* aria-hidden ที่ข้อความ: aria-label ของ <p> พูดครบแล้ว ปล่อยไว้จะได้ยินซ้ำสองรอบ */}
      <span aria-hidden="true">
        {p.label}
        {showAmount ? ` ${p.amount}` : ''}
      </span>
    </p>
  )
}

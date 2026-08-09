/**
 * OrderProfitInline — กำไรรายออเดอร์ใต้ยอดในหน้ารายการ: ไอคอน + ตัวเลข ไม่มีคำ
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx คอลัมน์ `status`
 *   (แถวเช็กลิสต์ `<Icon className="shrink-0 text-sm" /> + text-{semantic}-ink`) — ยกทรง
 *   icon+เนื้อหา inline จากคอลัมน์ข้างเคียงในตารางเดียวกัน ไม่ยกการ์ดเต็มใบของหน้า detail
 * Base (ไอคอน/โทนสี/คำใน aria): src/lib/order-profit-presentation.ts — SSOT ตัวเดียวกับ
 *   OrderProfitCard ในหน้า detail
 *
 * ประวัติที่ต้องรู้ก่อนแก้ไฟล์นี้ (user ไล่ปรับ 3 รอบในวันเดียว 2026-08-08):
 *   1. รอบแรกมีคำเต็ม 6 สถานะ ("กำไรขั้นต้นไม่เกิน ฿360" / "ยังไม่นับเป็นยอดขาย")
 *   2. user เห็นบนมือถือแล้วสั่ง "เอาออกก่อน สร้างความสับสน" → ถอด 2 สถานะที่ hedge
 *   3. user สั่งเอากลับมาในรูป "[icon] ฿150 เขียว / -150 แดง" และเคาะว่าใบที่ตั้งต้นทุน
 *      ไม่ครบให้ "โชว์เลขเหมือนกันหมด" → ไฟล์นี้
 *
 * [สำคัญ] prop `profit` ที่เป็น `undefined` แปลว่า **ผู้ใช้คนนี้ไม่มีสิทธิ์เห็นตัวเลขการเงิน**
 * และ server ต้อง omit key นี้ทิ้งไปเลยตั้งแต่ตอนประกอบ OrderRow ไม่ใช่ส่ง undefined มาให้
 * component เลือกไม่ render — หน้ารายการอยู่ใต้ client layout ทุกค่าที่ข้ามเส้น RSC ถูก
 * serialize ลง HTML เสมอ (feedback_rsc_pii_neutralize_at_source) การเช็คตรงนี้เป็นแค่ด่านสุดท้าย
 *
 * [สำคัญ] คำว่า "กำไร" ที่หน้านี้หมายถึง **กำไรขั้นต้น** ซึ่งคนละตัวกับกำไรสุทธิที่ /sales
 * (Hard Rule 16) — พอไม่มีคำต่อแถวแล้ว ตัวที่บอกผู้ใช้คือ `profitColumnCaption()` ที่หัว
 * คอลัมน์เดสก์ท็อปและแคปชั่นเหนือการ์ดมือถือ **ห้ามถอดออกทั้งสองที่พร้อมกัน**
 */

import Icon from '@/components/wrappers/Icon'
import type { OrderProfit } from '@/lib/order-profit'
import { presentOrderProfitCompact, PROFIT_TONE } from '@/lib/order-profit-presentation'

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

  // ยังไม่นับเป็นยอดขาย (PENDING/CANCELLED) — สถานะของใบมี badge บอกบนหัวการ์ด/แถวอยู่แล้ว
  // นี่เป็นสถานะเดียวที่ยัง "ไม่มีบรรทัด" (ใบต้นทุนไม่ครบกลับมาโชว์แล้วตามที่ user เคาะ)
  if (profit === null) return null

  // Compact = บังคับ hasMissingCost:false ให้ใบต้นทุนไม่ครบหน้าตาเหมือนใบปกติเป๊ะ
  // เหตุผลเต็ม + ความเสี่ยงที่ user รับไปแล้ว อยู่ที่ presentOrderProfitCompact
  const p = presentOrderProfitCompact(profit, orderNoun)
  const tone = PROFIT_TONE[p.tone]

  /**
   * เครื่องหมายลบวางไว้ **หน้า ฿** ไม่ใช่หลัง
   *
   * `formatBaht` ตัดเครื่องหมายทิ้งเสมอตามนโยบายใน format-money.ts ที่ห้าม `฿-150`
   * (ลบชนสัญลักษณ์เงิน ผู้อ่านต้องถอดรหัสก่อนเข้าใจ) โดยยกหน้าที่บอกทิศทางให้ "คำ + สี"
   * — แต่รอบนี้ **คำถูกถอดออกตามคำสั่ง user** เหลือแค่สีกับไอคอน
   *
   * `-฿150` จึงไม่ขัดเหตุผลเดิม (ไม่มีอักขระติดกันให้สับสน) และได้ตัวบอกทิศทางตัวที่สาม
   * ที่ไม่พึ่งสี ซึ่งจำเป็นขึ้นมากเมื่อคำหายไป — คนตาบอดสีแยกเขียว/แดงไม่ออก
   */
  const signed = p.amount === null ? null : profit.amount < 0 ? `-${p.amount}` : p.amount

  return (
    <p
      // role="img" ไม่ใช่ <p> เปล่า — aria-label ใช้ได้เฉพาะกับ role ที่รองรับ "ชื่อจากผู้เขียน"
      // ซึ่ง role=paragraph (ค่าปริยายของ <p>) ไม่รองรับ ถ้าไม่ประกาศ role ที่นี่ screen reader
      // ที่ทำตามสเปกจะทิ้ง aria-label แล้วอ่านเนื้อในแทน ซึ่ง aria-hidden ไว้หมด = เงียบสนิท
      // (ทรงเดียวกับ MiniShipmentTimeline.tsx ในโฟลเดอร์นี้ที่ทำถูกอยู่แล้ว)
      role="img"
      className={`mt-0.5 flex items-center gap-1 text-xs font-semibold tabular-nums ${tone.text}`}
      // บนจอไม่มีคำแล้ว คำเต็มกับสูตรจึงต้องอยู่ครบใน aria-label ไม่งั้น screen reader ได้ยิน
      // แค่ "150" ลอย ๆ ไม่รู้ว่าเลขอะไร · title เป็นของแถมสำหรับคนที่มีเมาส์เท่านั้น
      title={p.note}
      aria-label={`${p.label}${p.amount !== null ? ` ${p.amount}` : ''} · ${p.note}`}
    >
      {/* text-sm ไม่ใช่ text-xs — ไอคอนรับหน้าที่ "บอกทิศทาง" แทนคำที่ถอดออกไป จึงต้องมี
          น้ำหนักภาพมากกว่าตอนที่มันเป็นแค่ของประดับหน้าข้อความ */}
      <Icon icon={p.icon} className="shrink-0 text-sm" aria-hidden="true" />
      <span aria-hidden="true">{signed}</span>
    </p>
  )
}

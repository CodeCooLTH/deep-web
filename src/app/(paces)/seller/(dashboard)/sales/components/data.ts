/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(reports)/sales/components/data.ts
 *
 * ไฟล์นี้มีเฉพาะ type definitions — ไม่มี demo saleData จาก theme.
 * DailyRow สร้างจาก real COMPLETED orders ที่ RSC aggregate บน page.tsx.
 */

export type DailyRow = {
  date: string      // ISO YYYY-MM-DD
  label: string     // formatted th-TH e.g. "1 เม.ย. 2569"
  orders: number    // count (all statuses)
  completed: number // count of COMPLETED
  revenue: number   // sum of completed order totals
  /** ยอดจากออเดอร์ที่ลูกค้ายังไม่กดยืนยัน (ไม่นับที่ยกเลิก) — แยกให้ตรงกับชีตยอดขายบนมือถือ */
  unconfirmedRevenue: number
  avgOrder: number  // revenue / completed (or 0)
  /** จำนวนบิลที่ไม่ถูกยกเลิก (ไม่นับร่าง) — "งาน" ของร้านบริการ ชุดเดียวกับยอดบิล revenue + unconfirmedRevenue */
  billCount: number
  /** เงินที่บันทึกรับจริงของบิลที่เปิดวันนั้น (ร้านบริการ · จาก receivable.service.daily) — undefined = ไม่ใช่แกนเงิน
   *  ค้างรับของวัน = (revenue + unconfirmedRevenue) − received */
  received?: number
  /** ค่าส่งจริง + ค่าธรรมเนียม COD ที่ขนส่งคิดของวันนั้น (D-EXT-10, 2026-08-09)
   *
   *  undefined = ร้านนี้ไม่มีสิทธิ์ดูข้อมูลการเงิน ทั้งคอลัมน์จะไม่ถูก render เลย
   *  ไม่ใช่แสดง ฿0 ซึ่งจะโกหกว่า "วันนี้ไม่มีค่าส่ง"
   *
   *  🛑 **ไม่รวมค่าใช้จ่ายอื่นของร้านที่บันทึกในหน้า /expenses** (ค่าเช่า/เงินเดือน/โฆษณา) —
   *  มติ user 2026-08-09 ให้หน้านี้เหลือ ยอดขาย − (ต้นทุนสินค้า + ค่าส่ง) เท่านั้น */
  shippingCost?: number
  /** กำไรของวันนั้น = revenue − COGS − shippingCost
   *
   *  🛑 **ไม่ใช่ "กำไรสุทธิ" แบบเดียวกับหน้า /expenses** ซึ่งหักค่าใช้จ่ายร้านด้วย —
   *  ดู `SALES_PROFIT_FORMULA` ใน src/lib/format-money.ts ที่อธิบายว่าทำไมสองหน้าไม่เท่ากัน */
  netProfit?: number
  /** จำนวนพัสดุของวันนั้นที่ยังไม่รู้ค่าส่งจริง (ขนส่งยังไม่เข้ารับ iShip จึงยังไม่คิดเงิน)
   *
   *  > 0 = ตัวเลขกำไรของแถวนี้เป็น **เพดานบน** ต้องมีป้ายกำกับ ห้ามแสดงเงียบ ๆ
   *  และห้ามแสดงค่าใช้จ่ายเป็น ฿0.00 เพราะ 0 อ่านว่า "ส่งฟรี" ไม่ใช่ "ยังไม่รู้" */
  pendingShipmentCount?: number
}

export type SummaryData = {
  totalOrders: number
  totalCompleted: number
  totalRevenue: number
  /** รวมยอดที่รอลูกค้ายืนยันทั้งช่วง */
  totalUnconfirmed: number
  avgOrderValue: number
  /* นับออเดอร์แยกสถานะ + จำนวนวันในช่วง — ใช้เป็นแถวล่าง (metric) ของการ์ดสถิติตามโครงธีม */
  unconfirmedCount: number
  cancelledCount: number
  days: number
  /* ค่าช่วงก่อนหน้า (ยาวเท่ากัน ต่อเนื่องกัน) — ใช้ทำ badge %เปลี่ยนแปลง
     null = ช่วงก่อนหน้าไม่มีออเดอร์เลย → ไม่มีฐานให้เทียบ UI ต้องซ่อน badge */
  prevRevenue: number | null
  prevUnconfirmed: number | null
  prevOrders: number | null
  prevAvgOrder: number | null
  /** undefined = ไม่มีสิทธิ์ดูข้อมูลการเงิน (ดู DailyRow.shippingCost) */
  totalShippingCost?: number
  /** ส่วนที่เป็น "ค่าธรรมเนียมเก็บเงินปลายทาง" ในยอดค่าส่งข้างบน — ส่วนย่อย ไม่ใช่ยอดที่ต้องบวกเพิ่ม */
  totalCodFee?: number
  netProfit?: number
  /** ค่าส่งของช่วงก่อนหน้า (ยาวเท่ากัน ต่อเนื่องกัน) — ต้องนับด้วยเกณฑ์เดียวกันเป๊ะ ไม่งั้น
   *  badge %เปลี่ยนแปลงจะเทียบของคนละชนิดกัน */
  prevShippingCost?: number
  /** จำนวนพัสดุทั้งช่วงที่ยังไม่รู้ค่าส่งจริง — > 0 = ต้องขึ้นแถบเตือนว่ากำไรอาจสูงกว่าจริง */
  pendingShipmentCount?: number
  /** มีรายการที่ยืนยันแล้วแต่ยังไม่ได้ตั้งต้นทุน (cost = null) ในช่วงนี้
   *  true = กำไรเป็น **เพดานบน** (ต้นทุนที่ขาดถูกข้าม ไม่ใช่นับ 0) · อัตรากำไรห้ามแสดงเป็นตัวเลข
   *  (เดิมขึ้น "100%" ให้ร้านที่ยังไม่เคยตั้งต้นทุนเลย — user ทัก 2026-10-01) */
  hasMissingCost?: boolean
}

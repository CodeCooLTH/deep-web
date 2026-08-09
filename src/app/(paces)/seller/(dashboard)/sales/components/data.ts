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
  /** ค่าใช้จ่ายที่บันทึกในวันนั้น (feature 00016) — undefined = ร้านนี้ไม่มีสิทธิ์ดูข้อมูลการเงิน
   *  ทั้งคอลัมน์จะไม่ถูก render เลย ไม่ใช่แสดง ฿0 ซึ่งจะโกหกว่า "วันนี้ไม่มีค่าใช้จ่าย" */
  expense?: number
  /** กำไรสุทธิของวันนั้น = revenue − COGS − expense (สูตรเดียวกับการ์ด P&L ใน /expenses) */
  netProfit?: number
  /** ส่วนของ `expense` ที่มาจากค่าส่งจริง+ค่าธรรมเนียม COD ของ iShip (D-EXT-10/11, 2026-08-09)
   *
   *  🛑 เป็น **ส่วนย่อยของ `expense` ไม่ใช่ยอดที่ต้องเอาไปบวกเพิ่ม** — `expense` รวมมันไว้แล้ว
   *  ถ้าใครเผลอบวกซ้ำจะได้ค่าใช้จ่ายเกินจริงโดยที่ tsc ไม่ฟ้อง (ตัวเลขถูกชนิดทั้งคู่) */
  shippingCost?: number
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
  /** undefined = ไม่มีสิทธิ์ดูข้อมูลการเงิน (ดู DailyRow.expense) */
  totalExpense?: number
  netProfit?: number
  prevExpense?: number
  /** หมวดที่จ่ายมากสุดในช่วง — undefined = ไม่มีสิทธิ์ดู หรือไม่มีรายการ */
  topExpenseCategory?: string
  /** ส่วนของ `totalExpense` ที่เป็นค่าส่งจริง+ค่าธรรมเนียม COD จาก iShip — ดู DailyRow.shippingCost */
  totalShippingCost?: number
  /** จำนวนพัสดุทั้งช่วงที่ยังไม่รู้ค่าส่งจริง — > 0 = ต้องขึ้นแถบเตือนว่ากำไรอาจสูงกว่าจริง */
  pendingShipmentCount?: number
}

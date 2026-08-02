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
}

export type SummaryData = {
  totalOrders: number
  totalCompleted: number
  totalRevenue: number
  /** รวมยอดที่รอลูกค้ายืนยันทั้งช่วง */
  totalUnconfirmed: number
  avgOrderValue: number
  /** undefined = ไม่มีสิทธิ์ดูข้อมูลการเงิน (ดู DailyRow.expense) */
  totalExpense?: number
  netProfit?: number
}

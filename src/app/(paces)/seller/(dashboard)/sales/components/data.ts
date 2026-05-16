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
  avgOrder: number  // revenue / completed (or 0)
}

export type SummaryData = {
  totalOrders: number
  totalCompleted: number
  totalRevenue: number
  avgOrderValue: number
}

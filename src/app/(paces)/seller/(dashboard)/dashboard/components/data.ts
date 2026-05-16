// ─── data.ts ─────────────────────────────────────────────────────────────────
// OrderType สำหรับ RecentOrder widget — ใช้ข้อมูลจริงจาก SafePay domain
// ไม่มี mock orderData อีกต่อไป (ลบออกหลัง S5-rework-2: ป้องกัน fake order บน dashboard)

/** Shape ที่ RecentOrder widget ใช้ — map มาจาก Prisma Order ที่ server side */
export type OrderType = {
  /** publicToken — ใช้แสดงเป็น order reference (ตัดให้สั้น) */
  token: string
  /** ป้ายผู้ซื้อ: buyerContact (เบอร์) หรือ "ไม่ระบุ" ถ้ายังไม่มี */
  buyerLabel: string
  /** createdAt ISO string — ส่งผ่าน RSC boundary แบบ string เพื่อป้องกัน Date serialization error */
  createdAtISO: string
  /** ยอดรวมในหน่วย number (บาท) — format ด้วย Intl ที่ client */
  totalAmount: number
  /** ประเภทออเดอร์ PHYSICAL / DIGITAL / SERVICE */
  type: string
  /** สถานะออเดอร์ (ตรงกับ Prisma enum ที่ใช้ใน schema) */
  status: 'PENDING' | 'SHIPPED' | 'CONFIRMED' | 'CANCELLED'
}

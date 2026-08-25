/**
 * Customer row type — ใช้ร่วมกันระหว่าง RSC (page.tsx) และ client component (CustomerTable.tsx)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/data.ts
 *
 * เปลี่ยน: แทน CustomerType (demo) ด้วย CustomerRow จากข้อมูลจริง (derived from orders)
 *
 * 🛑 นี่คือ **ฝั่ง masked** ของ `CustomerDirectoryEntry` (`@/lib/customer-directory`) —
 * entry ตัวเต็มมี `contactFull` (เบอร์ดิบ) อยู่ ห้ามส่งข้ามมาที่นี่ทั้งก้อนเด็ดขาด
 * page.tsx ต้อง map ทีละ field เสมอ (`feedback_rsc_pii_neutralize_at_source`)
 */
import type { CustomerBadge } from '@/lib/customer-behavior'
import type { BuyerReputation } from '@/lib/buyer-reputation'

export type CustomerRow = {
  /**
   * Opaque row identity — ไม่ใช่ raw contact, ไม่มี PII (สร้างโดย makeCustomerRowKey, @/lib/customer-row-key)
   * priority: "c-" + customerId (Customer กลาง feature 00014, ชนะเสมอ) | "u-" + buyerUserId (สมาชิก
   * ที่ยังไม่ถูกผูก Customer) | "g-" + sha256(contact).slice(0,16) (guest, ย้อนกลับเป็น raw contact ไม่ได้)
   *
   * ใช้ 3 อย่าง: Map grouping (server), React list key, และ **URL ของหน้าโปรไฟล์** `/customers/{key}`
   * (feature 00057 — ตัวสุดท้ายคือเหตุผลที่ key ต้องไม่มี PII เลย มันไปโผล่ใน address bar/ประวัติ)
   */
  key: string
  displayName: string
  initial: string
  contact: string // masked (PDPA) — แสดงแค่ 4 ตัวท้าย ห้ามใส่ raw contact ที่นี่
  /**
   * ลูกค้ารายนี้มีข้อมูลติดต่อให้เปิดเผยไหม — ใช้ตัดสินว่าจะ render ปุ่ม "แสดงเบอร์เต็ม" หรือไม่
   * (ต้องเป็นธงแยก ไม่ใช่เดาจาก `contact === '—'` ซึ่งเป็นการอ่านความหมายจากข้อความบนหน้าจอ)
   */
  hasContact: boolean
  isRegistered: boolean
  username: string | null // สำหรับ link /u/@username ถ้าเป็นสมาชิก
  totalOrders: number
  totalSpent: number // THB — ผลรวม totalAmount (รวม VAT/discount/shipping) ของออเดอร์ที่ countsAsRevenue() (@/lib/order-revenue) เท่านั้น — SSOT เดียวกับ dashboard/รายงานยอดขาย
  lastOrderISO: string // ISO 8601 — ปลอดภัยส่ง RSC→client (ไม่ใช่ Date object)
  /**
   * ป้ายพฤติกรรมลูกค้า คำนวณที่ server ด้วย `customerBadges()` (SSOT เดียวกับตาราง /orders
   * และแผงลูกค้าในแชท) — ส่งมาเป็นข้อมูลสำเร็จรูปเพราะ client ไม่มี dictionary/vocab ครบ
   * และการคำนวณซ้ำที่ client คือช่องให้เกณฑ์ drift
   */
  badges: CustomerBadge[]
  /**
   * ความน่าเชื่อถือ **ทั้งระบบ** (ข้ามร้าน) — แกนหลักของหน้านี้ตามที่ user สั่ง 2026-08-25
   *
   * 🛑 `null` = ลูกค้ายังไม่ผูก `Customer` กลาง (ไม่มีประวัติข้ามร้าน) **คนละความหมายกับ
   * "เปิดพัสดุ 0 ใบ"** — บน prod เคสนี้หายากมาก (`Order.customerId` null แค่ 3/533 แถว)
   *
   * 🛑 ตัวเลขนี้ **ข้ามร้าน** ส่วนชิปกรอง "เคยตีกลับกับร้านนี้" และการ์ดสถิติหัวหน้าเป็น
   * **ระดับร้าน** — ทุกจุดบนหน้าจอต้องมีป้ายกำกับขอบเขต ห้ามปล่อยให้ผู้ใช้เดา (HR16)
   */
  trust: BuyerReputation | null
}

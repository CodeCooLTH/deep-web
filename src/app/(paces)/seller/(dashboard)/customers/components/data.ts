/**
 * Customer row type — ใช้ร่วมกันระหว่าง RSC (page.tsx) และ client component (CustomerTable.tsx)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/customers/components/data.ts
 *
 * เปลี่ยน: แทน CustomerType (demo) ด้วย CustomerRow จากข้อมูลจริง (derived from orders)
 */
export type CustomerRow = {
  /**
   * Opaque row identity — ไม่ใช่ raw contact, ไม่มี PII
   * registered: buyerUserId | guest: "g-" + sha256(contact).slice(0,16)
   * ใช้สำหรับ Map grouping (server) และ React list key เท่านั้น
   */
  key: string
  displayName: string
  initial: string
  contact: string          // masked (PDPA) — แสดงแค่ 4 ตัวท้าย ห้ามใส่ raw contact ที่นี่
  isRegistered: boolean
  username: string | null  // สำหรับ link /u/@username ถ้าเป็นสมาชิก
  totalOrders: number
  totalSpent: number       // THB (เฉพาะ COMPLETED orders)
  lastOrderISO: string     // ISO 8601 — ปลอดภัยส่ง RSC→client (ไม่ใช่ Date object)
  lastOrderRaw: number     // timestamp สำหรับ sort ใน RSC (ไม่ส่ง client)
}

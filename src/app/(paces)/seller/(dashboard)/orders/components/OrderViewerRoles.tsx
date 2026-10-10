'use client'

/**
 * OrderViewerRoles — บทบาทที่มีผลจริงของผู้ดูหน้ารายการออเดอร์ (00071 P3 · S-14)
 *
 * ทำไมเป็น context ไม่ใช่ prop: ปุ่มต่อแถว (แก้ไข/ส่ง SMS/ยกเลิก/พิมพ์ใบปะหน้า) อยู่ลึก 3-4 ชั้นใต้ OrdersList → OrdersTable →
 * OrderActions → OrderCardMenu และวาดทั้งตาราง+การ์ด การไล่ prop ทีละชั้นคือจุดที่ "ลืมส่งแล้วปุ่มโผล่" เกิดง่าย
 * ค่าตั้งต้น = ไม่มีบทบาท ⇒ ไม่เห็นปุ่มเปลี่ยนข้อมูลเลย (ปิดเป็นค่าตั้งต้น — permission-gate-follows-the-row)
 * ตัวบังคับจริงอยู่ที่ route ทุกเส้น ที่นี่แค่ไม่ให้ปุ่มโผล่แล้วกดแล้ว 403
 */
import { createContext, useContext, type ReactNode } from 'react'
import { can, type Capability, type ShopRole } from '@/lib/shop-permissions'

const OrderViewerRolesContext = createContext<readonly ShopRole[]>([])

export function OrderViewerRolesProvider({ roles, children }: { roles: readonly ShopRole[]; children: ReactNode }) {
  return <OrderViewerRolesContext.Provider value={roles}>{children}</OrderViewerRolesContext.Provider>
}

/** ผู้ดูมี capability นี้ไหม */
export function useViewerCan(cap: Capability): boolean {
  return can(useContext(OrderViewerRolesContext), cap)
}

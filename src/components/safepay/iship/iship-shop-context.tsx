'use client'

/**
 * IShipShopContext — "ร้านที่แผงพัสดุใบนี้ทำงานด้วย" (feature 00022 × 00037)
 *
 * 🛑 ทำไมเป็น context ไม่ใช่ prop: component ของ iShip ซ้อนกันหลายชั้น
 * (`ShipmentDraftPanel` → `ShipmentCreateForm`/`ShipmentStatusView`/`ShipmentLinkPanel`
 * → `useIShipCouriers`) และแต่ละชั้นยิง API เอง — ไล่ส่ง `shopId` ทีละตัวแปลว่า
 * **จุดที่เพิ่มใหม่ทีหลังจะลืมส่งแล้วตกกลับไปใช้ร้านที่ active เงียบ ๆ** ซึ่งเป็นรูปร่างเดียว
 * กับบั๊กที่เพิ่งปิดไปทั้งชุดในรอบนี้ (เหตุผลเดียวกับที่ `useDraftOrders` ฉีด `shopId`
 * ให้ `openDraft` อัตโนมัติแทนการให้ call site ส่งเอง)
 *
 * ไม่มี provider = `null` = ไม่ต่อท้าย query อะไรเลย ⇒ **หน้า order detail ที่เรียก
 * component ชุดเดียวกันนี้ทำงานเหมือนเดิมทุกประการ** (ร้านที่ active ถูกต้องอยู่แล้วที่นั่น)
 */

import { createContext, useCallback, useContext } from 'react'

const IShipShopContext = createContext<string | null>(null)

export function IShipShopProvider({
  shopId,
  children,
}: {
  shopId: string | null
  children: React.ReactNode
}) {
  return <IShipShopContext.Provider value={shopId}>{children}</IShipShopContext.Provider>
}

/** ร้านของแผงนี้ — null = ใช้ร้านที่ active (พฤติกรรมเดิม) */
export function useIShipShopId(): string | null {
  return useContext(IShipShopContext)
}

/**
 * ต่อ `?shopId=` ให้ URL ของ iShip — รองรับทั้ง path เปล่าและ path ที่มี query อยู่แล้ว
 *
 * ใช้ query ทุก method (รวม POST) โดยตั้งใจ: ฝั่ง server อ่านที่เดียวด้วย
 * `readIShipShopIdFromQuery()` จึงไม่มีเส้นไหนต้องจำว่า "ของฉันอ่านจาก body นะ"
 */
export function useIShipUrl(): (path: string) => string {
  const shopId = useIShipShopId()
  return useCallback(
    (path: string) => {
      if (!shopId) return path
      return `${path}${path.includes('?') ? '&' : '?'}shopId=${encodeURIComponent(shopId)}`
    },
    [shopId],
  )
}

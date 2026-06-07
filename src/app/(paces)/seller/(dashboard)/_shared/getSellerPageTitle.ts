/**
 * getSellerPageTitle — map pathname → ชื่อหน้าภาษาไทย
 *
 * ทำไม: SellerMobileHeader ต้องแสดงชื่อหน้าปัจจุบันบน back-mode topbar
 * แทนการ hardcode — ใช้ sellerMenuItems เป็น SSOT เพื่อไม่ต้องซิงค์ 2 ที่
 *
 * วิธี: flatten menu items (รวม isTitle groups ที่ไม่มี url) ทั้งหมดเป็น
 * list ของ { url, label } แล้วทำ longest-prefix match กับ pathname
 * → รองรับ detail route เช่น /orders/abc123 → match /orders → "คำสั่งซื้อ"
 *
 * หมายเหตุ: url ใน sellerMenuItems เป็น short path (ไม่มี /seller prefix)
 * ตรง pathname ที่ Next.js ส่งมาใน seller route group
 */

import { sellerMenuItems } from '../_seller-menu'
import type { MenuItemType } from '@/types'

type FlatItem = { url: string; label: string }

/** flatten MenuItemType[] แบบ recursive → FlatItem[] (เฉพาะ item ที่มี url) */
function flattenItems(items: MenuItemType[]): FlatItem[] {
  const result: FlatItem[] = []
  for (const item of items) {
    if (item.url) {
      result.push({ url: item.url, label: item.label })
    }
    if (item.children && item.children.length > 0) {
      result.push(...flattenItems(item.children))
    }
  }
  return result
}

// คำนวณ once ตอน module load (pure — ไม่มี side effect)
const FLAT_ITEMS: FlatItem[] = flattenItems(sellerMenuItems)

// เรียง url ยาวสุดก่อน → longest-prefix match ถูกต้อง
const SORTED_ITEMS = [...FLAT_ITEMS].sort((a, b) => b.url.length - a.url.length)

const FALLBACK = 'Deep ผู้ขาย'

/**
 * คืนชื่อหน้าภาษาไทยสำหรับ pathname ที่รับมา
 *
 * - Exact match: /dashboard → "ภาพรวมร้านค้า"
 * - Prefix match: /orders/abc123 → "คำสั่งซื้อ"  (detail route)
 * - ไม่ match: คืน FALLBACK
 *
 * @param pathname - pathname จาก usePathname() ของ Next.js (short path เช่น /orders)
 */
export function getSellerPageTitle(pathname: string): string {
  for (const item of SORTED_ITEMS) {
    // match ถ้า pathname ขึ้นต้นด้วย url นั้น
    // guard กรณี url="/dashboard" ไม่ match "/dashboard-extra" → ตรวจ char ถัดไป
    if (
      pathname === item.url ||
      pathname.startsWith(item.url + '/')
    ) {
      return item.label
    }
  }
  return FALLBACK
}

import { type MenuItemType } from '@/types'
import type { EntitlementStatus } from '@/lib/inventory-addon'

export const sellerMenuItems: MenuItemType[] = [
  {
    icon: 'chart-bar',
    slug: 'seller-analytics',
    label: 'ANALYTICS',
    isTitle: true,
    children: [
      { url: '/dashboard', slug: 'seller:dashboard', label: 'ภาพรวมร้านค้า', icon: 'dashboard' },
      { url: '/sales', slug: 'seller:sales', label: 'ภาพรวมยอดขาย', icon: 'chart-line' },
    ],
  },
  {
    icon: 'receipt-2',
    slug: 'seller-orders',
    label: 'ORDERS',
    isTitle: true,
    children: [
      { url: '/orders', slug: 'seller:orders', label: 'คำสั่งซื้อ', icon: 'receipt-2' },
      { url: '/auctions', slug: 'seller:auctions', label: 'การประมูล', icon: 'gavel' },
    ],
  },
  {
    icon: 'package',
    slug: 'seller-products',
    label: 'PRODUCTS',
    isTitle: true,
    children: [
      { url: '/products', slug: 'seller:products', label: 'สินค้า', icon: 'package' },
      // ซ่อนเมนู "หมวดหมู่สินค้า" ชั่วคราว — route /categories ยังอยู่ (เข้าตรงผ่าน URL ได้)
      // { url: '/categories', slug: 'seller:categories', label: 'หมวดหมู่สินค้า', icon: 'category' },
      { url: '/reviews', slug: 'seller:reviews', label: 'รีวิว', icon: 'star' },
    ],
  },
  {
    icon: 'users',
    slug: 'seller-customers',
    label: 'CUSTOMERS',
    isTitle: true,
    children: [
      { url: '/customers', slug: 'seller:customers', label: 'ลูกค้า', icon: 'user-circle' },
    ],
  },
  {
    icon: 'building-store',
    slug: 'seller-shops',
    label: 'SHOPS',
    isTitle: true,
    children: [
      { url: '/verification', slug: 'seller:verification', label: 'ยืนยันตน', icon: 'shield-check' },
      { url: '/badges', slug: 'seller:badges', label: 'ความสำเร็จ', icon: 'award' },
    ],
  },
  {
    icon: 'settings',
    slug: 'seller-store',
    label: 'STORE',
    isTitle: true,
    children: [
      { url: '/shop', slug: 'seller:shop', label: 'ตั้งค่าร้านค้า', icon: 'building-store' },
      // "แพ็กเกจธุรกิจ" ย้ายไป topbar profile dropdown แล้ว (feat 00008 P4-6 — user ปฏิเสธตำแหน่ง sidebar)
      // ดู src/layouts/components/TopBar/components/UserDropdownDetailed.tsx
      // icon 'boxes' ไม่มีใน tabler icon set (verify: api.iconify.design/tabler.json?icons=boxes → not_found)
      // ใช้ 'archive' แทน (verified มีจริง) — ห้ามใช้ 'box'/'package' เพราะชนกับเมนู Products
      { url: '/inventory', slug: 'seller:inventory', label: 'จัดการสต็อก', icon: 'archive' },
      { url: '/wallet', slug: 'seller:wallet', label: 'เครดิต SMS', icon: 'wallet' },
      { url: '/settings', slug: 'seller:settings', label: 'บัญชีที่เชื่อมต่อ', icon: 'link' },
    ],
  },
]

/**
 * applyInventoryGate — runtime transform ของ sellerMenuItems ตาม entitlement status
 *
 * ทำไม: sellerMenuItems ต้องคงเป็น static array (SSOT ให้ getSellerPageTitle.ts /
 * SellerMobileHeader.tsx import ตรง ๆ — ห้าม breaking) แต่เมนู "จัดการสต็อก" ต้องแสดง
 * badge/disable ตามสถานะ subscription แบบ dynamic ต่อ request — จึงแยกเป็น pure
 * transform function ไม่แก้ sellerMenuItems ต้นฉบับ
 *
 * ACTIVE → ไม่แตะ (enabled by default)
 * NOT_SUBSCRIBED → badge "฿199/ด." (bg-primary) + isDisabled
 * LOCKED → badge "ถูกล็อก" (bg-danger) + isDisabled
 *
 * หมายเหตุ: นี่คือ UX hint เท่านั้น — enforcement จริงอยู่ที่ server-side gate
 * ใน InventoryPage (SDS §3.8) เพราะ AppMenu.tsx render isDisabled เป็นแค่ CSS class
 * ไม่มี preventDefault guard ใน onClick
 */
export function applyInventoryGate(items: MenuItemType[], status: EntitlementStatus): MenuItemType[] {
  if (status === 'ACTIVE') return items

  const badge = status === 'LOCKED'
    ? { className: 'bg-danger', text: 'ถูกล็อก' }
    : { className: 'bg-primary', text: '฿199/ด.' }

  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.map((child) =>
      child.slug === 'seller:inventory' ? { ...child, isDisabled: true, badge } : child,
    ),
  })
}

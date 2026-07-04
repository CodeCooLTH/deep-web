import { type MenuItemType } from '@/types'
import type { EntitlementStatus, InventoryPackage } from '@/lib/inventory-addon'

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
      // S-13 (feat 00011 Deep Chat) — เมนู "ข้อความ" กลุ่ม CUSTOMERS (UX-Design-Spec.md S1)
      { url: '/inbox', slug: 'seller:inbox', label: 'ข้อความ', icon: 'message-circle' },
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
      // "แพ็กเกจของฉัน" — หน้ารวมศูนย์ Business Package + Stock Pro รายร้าน (2026-07-04 subscription overview)
      // icon 'crown' verified มีจริงใน tabler (ใช้ซ้ำกับ UpgradeToProCard)
      { url: '/subscriptions', slug: 'seller:subscriptions', label: 'แพ็กเกจของฉัน', icon: 'crown' },
      // icon 'boxes' ไม่มีใน tabler icon set (verify: api.iconify.design/tabler.json?icons=boxes → not_found)
      // ใช้ 'archive' แทน (verified มีจริง) — ห้ามใช้ 'box'/'package' เพราะชนกับเมนู Products
      { url: '/inventory', slug: 'seller:inventory', label: 'จัดการสต็อก', icon: 'archive' },
      { url: '/wallet', slug: 'seller:wallet', label: 'เครดิต SMS', icon: 'wallet' },
      { url: '/settings', slug: 'seller:settings', label: 'บัญชีที่เชื่อมต่อ', icon: 'link' },
    ],
  },
]

/**
 * applyInventoryGate — runtime transform ของ sellerMenuItems ตาม entitlement (status+package)
 *
 * ทำไม: sellerMenuItems ต้องคงเป็น static array (SSOT ให้ getSellerPageTitle.ts /
 * SellerMobileHeader.tsx import ตรง ๆ — ห้าม breaking) แต่เมนู "จัดการสต็อก" ต้องแสดง
 * badge/disable ตามสถานะ subscription + package แบบ dynamic ต่อ request — จึงแยกเป็น pure
 * transform function ไม่แก้ sellerMenuItems ต้นฉบับ
 *
 * ACTIVE → ไม่ disabled; badge = PRO → {bg-primary,'Pro'} / BASIC → undefined (ไม่มี upsell hint)
 * LOCKED → disabled + badge {bg-danger,'ถูกล็อก'}
 * NOT_SUBSCRIBED → disabled + badge {bg-primary,'เลือกแพ็กเกจ'} (เปลี่ยนจาก "฿199/ด." เดิม
 *   เพราะตอนนี้มี 2 แพ็กเกจให้เลือก — SDS §3.9)
 *
 * หมายเหตุ: นี่คือ UX hint เท่านั้น — enforcement จริงอยู่ที่ server-side gate
 * ใน InventoryPage (SDS §3.8) เพราะ AppMenu.tsx render isDisabled เป็นแค่ CSS class
 * ไม่มี preventDefault guard ใน onClick
 */
export function applyInventoryGate(
  items: MenuItemType[],
  entitlement: { status: EntitlementStatus; package: InventoryPackage | null },
): MenuItemType[] {
  if (entitlement.status === 'ACTIVE') {
    const badge = entitlement.package === 'PRO' ? { className: 'bg-primary', text: 'Pro' } : undefined
    // BASIC ACTIVE: ไม่ disabled, badge เป็น undefined (ไม่ upsell hint ตาม SDS §3.9)
    return items.map((group) => !group.children ? group : {
      ...group,
      children: group.children.map((child) =>
        child.slug === 'seller:inventory' ? { ...child, badge } : child,
      ),
    })
  }

  const badge = entitlement.status === 'LOCKED'
    ? { className: 'bg-danger', text: 'ถูกล็อก' }
    : { className: 'bg-primary', text: 'เลือกแพ็กเกจ' } // NOT_SUBSCRIBED

  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.map((child) =>
      child.slug === 'seller:inventory' ? { ...child, isDisabled: true, badge } : child,
    ),
  })
}

/**
 * applyChatBadge — S-13 (feat 00011 Deep Chat), pattern เดียวกับ applyInventoryGate
 *
 * unreadCount>0 → badge {className:'bg-danger', text} ที่เมนู "ข้อความ" (slug 'seller:inbox')
 * unreadCount===0 → ไม่แก้ item (ไม่มี badge) — สี bg-danger ตาม UX-Design-Spec.md S2
 * (match SellerBottomNav/NotificationDropdown precedent), cap ตัวเลขที่ '99+' กัน badge ยาวเกิน
 */
export function applyChatBadge(items: MenuItemType[], unreadCount: number): MenuItemType[] {
  if (unreadCount <= 0) return items

  const badge = { className: 'bg-danger', text: unreadCount >= 100 ? '99+' : String(unreadCount) }

  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.map((child) =>
      child.slug === 'seller:inbox' ? { ...child, badge } : child,
    ),
  })
}

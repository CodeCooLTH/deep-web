import { type MenuItemType } from '@/types'
import type { EntitlementStatus, InventoryPackage } from '@/lib/inventory-addon'
import type { ExpenseAccessDecision } from '@/services/expense-access.service'
// feature 00024 — ใช้ตัวกั้นเดียวกับ API/หน้า เพื่อไม่ให้กติกาแตกเป็นสองชุด
import { canUseAppointments } from '@/lib/appointments'

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
      // feature 00024 — เห็นเฉพาะร้าน kind=BUSINESS และ vertical=GENERAL พร้อมกัน
      // (กรองด้วย applyAppointmentMenu ด้านล่าง — applyVerticalMenu ดูแค่ vertical จึงไม่พอ)
      // icon 'armchair' user เลือกเอง 2026-07-31 (verified มีจริง — ใช้อยู่แล้วในโปรเจกต์)
      // ป้าย "คิวงาน" มาจาก user โดยตรง — คำเดิม "ทรัพยากร" อ่านแล้วไม่เข้าใจ
      // ลูกค้ากลุ่มแรกคือร้านตกแต่งไฟหน้ารถ ซึ่งเรียกหน่วยที่รับงานพร้อมกันว่า "คิวงาน" 
      {
        url: '/queues',
        slug: 'seller:queues',
        label: 'คิวงาน',
        icon: 'armchair',
      },
      // feature 00017 — เห็นเฉพาะร้าน vertical=LODGING (กรองด้วย applyVerticalMenu ด้านล่าง)
      // icon 'building-cottage' verified มีจริงใน tabler (api.iconify.design/tabler.json → found);
      // เลือกแทน 'bed' เพราะ "ห้องพัก" = หน่วยที่ให้จอง ซึ่งอาจเป็นทั้งหลัง ไม่ใช่แค่ห้องนอน
      { url: '/rooms', slug: 'seller:rooms', label: 'ห้องพัก', icon: 'building-cottage' },
      // feature 00017 P2 — icon 'calendar-event' verified มีจริงใน tabler
      { url: '/calendar', slug: 'seller:calendar', label: 'ปฏิทินการจอง', icon: 'calendar-event' },
      // feature 00017 P2 — รายการจอง (icon 'calendar-check' verified มีจริงใน tabler)
      { url: '/bookings', slug: 'seller:bookings', label: 'การจอง', icon: 'calendar-check' },
      // feature 00017 P3 — icon 'users' verified มีจริงใน tabler
      { url: '/housekeepers', slug: 'seller:housekeepers', label: 'แม่บ้าน', icon: 'users' },
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
      { url: '/public-profile', slug: 'seller:public-profile', label: 'โปรไฟล์สาธารณะ', icon: 'world' },
      // feature 00012 (Shop Staff Invite Links, Task 4.3) — เมนู "พนักงาน" จัดการลิงก์เชิญ + สมาชิก Business
      // แสดงเฉพาะ owner ของ Business shop (ซ่อน runtime ด้วย applyStaffMenu ด้านล่าง — mirror applyInventoryGate)
      // icon 'users-group' verified มีจริงใน tabler set (api.iconify.design/tabler.json?icons=users-group → found)
      { url: '/admins', slug: 'seller:admins', label: 'พนักงาน', icon: 'users-group' },
      // "แพ็กเกจธุรกิจ" ย้ายไป topbar profile dropdown แล้ว (feat 00008 P4-6 — user ปฏิเสธตำแหน่ง sidebar)
      // ดู src/layouts/components/TopBar/components/UserDropdownDetailed.tsx
      // "แพ็กเกจของฉัน" — หน้ารวมศูนย์ Business Package + Stock Pro รายร้าน (2026-07-04 subscription overview)
      // icon 'crown' verified มีจริงใน tabler (ใช้ซ้ำกับ UpgradeToProCard)
      { url: '/subscriptions', slug: 'seller:subscriptions', label: 'แพ็กเกจของฉัน', icon: 'crown' },
      // icon 'boxes' ไม่มีใน tabler icon set (verify: api.iconify.design/tabler.json?icons=boxes → not_found)
      // ใช้ 'archive' แทน (verified มีจริง) — ห้ามใช้ 'box'/'package' เพราะชนกับเมนู Products
      { url: '/inventory', slug: 'seller:inventory', label: 'จัดการสต็อก', icon: 'archive' },
      { url: '/wallet', slug: 'seller:wallet', label: 'เครดิต SMS', icon: 'wallet' },
      // feature 00016 (Expense & Cost Tracking, Unit 5A) — conditional render ด้วย applyExpenseMenu ด้านล่าง
      // icon 'report-money' ยืนยันแล้วใน UX-Design-Spec.md §Resolved Decisions #1 (tabler set มีจริง)
      { url: '/expenses', slug: 'seller:expenses', label: 'ค่าใช้จ่าย', icon: 'report-money' },
      { url: '/settings', slug: 'seller:settings', label: 'บัญชีที่เชื่อมต่อ', icon: 'link' },
      // feature 00019 — ตั้งค่าผู้ช่วยร่างคำตอบ AI (คำสั่งประจำร้าน + สวิตช์บริบทสินค้า/ลูกค้า)
      { url: '/settings/ai', slug: 'seller:settings-ai', label: 'ผู้ช่วยร่างคำตอบ AI', icon: 'sparkles' },
      // feature 00023 Deep Chat-Bot Assistant — บอทตอบเองจาก keyword (คนละเรื่องกับ AI ด้านบน: อันนั้นร่างให้คนกดส่ง
      // อันนี้ระบบส่งเอง) วางต่อกันเพราะผู้ใช้จะเทียบสองอันนี้เสมอตอนเลือกว่าจะใช้อะไร
      { url: '/settings/auto-reply', slug: 'seller:settings-auto-reply', label: 'ผู้ช่วยอัตโนมัติ', icon: 'message-bolt' },
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

/**
 * applyStaffMenu — runtime transform ของ sellerMenuItems ตาม active shop context (feature 00012, Task 4.3)
 *
 * ทำไม: เมนู "พนักงาน" (`/admins`) เป็นสิทธิ์ owner ของ Business shop เท่านั้น (mirror guard
 * ของหน้า /admins เอง + API /api/shops/current/invite-links) — ผู้ถูกเชิญ (ADMIN) และ Personal
 * shop ต้อง "ซ่อน" ไม่ใช่แค่ disable (ต่างจาก applyInventoryGate ที่ badge/disable แต่ยังโชว์เมนู)
 * เพราะไม่มี use-case ให้ role อื่นเห็นเมนูนี้เลย
 *
 * !(kind==='BUSINESS' && role==='OWNER') → กรอง child slug 'seller:admins' ออกจาก items ทั้งหมด
 */
export function applyStaffMenu(
  items: MenuItemType[],
  ctx: { kind: 'PERSONAL' | 'BUSINESS'; role: 'OWNER' | 'ADMIN' },
): MenuItemType[] {
  if (ctx.kind === 'BUSINESS' && ctx.role === 'OWNER') return items

  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.filter((child) => child.slug !== 'seller:admins'),
  })
}

/**
 * applyExpenseMenu — runtime transform ของ sellerMenuItems ตาม ExpenseAccessDecision (feature 00016
 * Expense & Cost Tracking, Unit 5A) — pattern ผสมระหว่าง applyStaffMenu (ซ่อนทั้งเมนู) กับ
 * applyInventoryGate (badge upsell) ตาม UX-Design-Spec.md §A "เมนู sidebar ... conditional render"
 *
 * - GRANTED → แสดงปกติ ไม่มี badge
 * - PACKAGE_LOCKED → แสดงพร้อม badge "อัปเกรด" (ไม่ disabled — คลิกได้ เข้าไปเห็น upsell card เอง)
 * - STAFF_NOT_ALLOWED หรือ NO_SHOP → กรอง child ออกจาก items ทั้งหมด (ซ่อนสนิท — AC-04 "มองไม่เห็นเมนูเลย")
 *
 * หมายเหตุ: นี่คือ UX hint เท่านั้น — enforcement จริงอยู่ที่ resolveExpenseAccess() ใน ExpensesPage (fail-closed)
 */
export function applyExpenseMenu(
  items: MenuItemType[],
  decision: ExpenseAccessDecision,
): MenuItemType[] {
  if (decision.kind === 'STAFF_NOT_ALLOWED' || decision.kind === 'NO_SHOP') {
    return items.map((group) => !group.children ? group : {
      ...group,
      children: group.children.filter((child) => child.slug !== 'seller:expenses'),
    })
  }

  if (decision.kind === 'PACKAGE_LOCKED') {
    const badge = { className: 'bg-primary', text: 'อัปเกรด' }
    return items.map((group) => !group.children ? group : {
      ...group,
      children: group.children.map((child) =>
        child.slug === 'seller:expenses' ? { ...child, badge } : child,
      ),
    })
  }

  // GRANTED — ไม่มี badge, แสดงปกติ
  return items
}

/**
 * applyVerticalMenu — runtime transform ตามประเภทกิจการของร้าน (feature 00017 Phase 1, FR-LODG-02)
 *
 * ทำไมต้องกรองสองทาง ไม่ใช่แค่ซ่อนเมนูห้องพักจากร้าน GENERAL:
 *   - ร้าน LODGING ไม่ได้ขายสินค้า → เมนูสินค้า/สต็อก/ประมูล ไม่มีความหมายและทำให้กรอกข้อมูลผิดวิธี
 *   - ร้าน GENERAL ไม่มีห้องพัก → เมนูห้องพักไม่มีความหมาย
 * (BR-LODG-02: 1 ธุรกิจ = 1 ประเภท ต้องไม่เห็นเมนูของอีกฝั่งเลย)
 *
 * IMPORTANT: การซ่อนเมนู "ไม่ใช่" การควบคุมสิทธิ์ (BR-LODG-03) — ทุก route ของโดเมนบ้านพักต้องมี
 * assertLodgingShop() ที่ทั้ง API route และ page-level server component ด้วยเสมอ
 * ฟังก์ชันนี้ทำหน้าที่แค่ "ไม่รกตา" ไม่ได้ทำหน้าที่ป้องกัน
 *
 * pattern เดียวกับ applyStaffMenu (กรอง child ออกจาก group) — ไม่ disable แต่ซ่อน
 * เพราะไม่มี use-case ให้ประเภทหนึ่งเห็นเมนูของอีกประเภท
 */
const LODGING_ONLY_SLUGS = ['seller:rooms', 'seller:calendar', 'seller:bookings', 'seller:housekeepers']
const GENERAL_ONLY_SLUGS = ['seller:products', 'seller:inventory', 'seller:auctions']

export function applyVerticalMenu(
  items: MenuItemType[],
  vertical: string,
): MenuItemType[] {
  const hidden = vertical === 'LODGING' ? GENERAL_ONLY_SLUGS : LODGING_ONLY_SLUGS
  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.filter((child) => !hidden.includes(child.slug ?? '')),
  })
}

/**
 * applyAppointmentMenu — ซ่อนเมนูของระบบนัดหมาย (feature 00024, BR-RSV-01/02)
 *
 * ทำไมต้องมีตัวนี้แยกจาก applyVerticalMenu: ระบบนัดหมายต้องเข้าเงื่อนไข **สองอย่าง
 * พร้อมกัน** (`kind = BUSINESS` และ `vertical = GENERAL`) ส่วน applyVerticalMenu รับมาแต่
 * vertical จึงกรองร้านบุคคลธรรมดาที่เป็น GENERAL ออกไม่ได้ — ซึ่งเป็นเคสที่ BR-RSV-02
 * ระบุชัดว่าต้องไม่เห็นเมนู
 *
 * IMPORTANT: การซ่อนเมนู "ไม่ใช่" การควบคุมสิทธิ์ (BR-RSV-02 เหมือน BR-LODG-03) — ทุก
 * route ของโดเมนนี้ต้องเรียก canUseAppointments() ที่ทั้ง API route และ page-level server
 * component ด้วยเสมอ ฟังก์ชันนี้ทำหน้าที่แค่ "ไม่รกตา"
 *
 * pattern เดียวกับ applyStaffMenu/applyVerticalMenu (กรอง child ออกจาก group)
 */
const APPOINTMENT_ONLY_SLUGS = ['seller:queues']

export function applyAppointmentMenu(
  items: MenuItemType[],
  shop: { kind: string; vertical: string },
): MenuItemType[] {
  if (canUseAppointments(shop)) return items
  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.filter(
      (child) => !APPOINTMENT_ONLY_SLUGS.includes(child.slug ?? ''),
    ),
  })
}

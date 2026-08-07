/**
 * seller-menu — SSOT ของเมนูฝั่งร้าน + ตัวกรองสิทธิ์ทั้งหมด
 *
 * ย้ายมาจาก `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` (feature 00027 TFR-001)
 * โดยไม่แก้ logic แม้บรรทัดเดียว — ไฟล์เดิมเหลือเป็น re-export กัน import path เก่าพัง
 *
 * ทำไมต้องย้าย: `shortcut.service.ts` ต้องใช้ตัวกรองชุดเดียวกันนี้เพื่อคำนวณ "เมนูที่ผู้ใช้
 * คนนี้เลือกปักหมุดได้" — service layer import จาก `src/app/**` ไม่ได้ (ผิดทิศทาง layering)
 * ถ้าปล่อยให้ service เขียนกฎสิทธิ์ชุดที่สองขึ้นมาเอง วันที่กฎหนึ่งเปลี่ยนแล้วอีกชุดไม่เปลี่ยน
 * = เมนูลัดพาผู้ใช้ไปหน้าที่เขาไม่มีสิทธิ์ (permission drift — ความเสี่ยงอันดับ 1 ของฟีเจอร์นี้)
 */
import { type MenuItemType } from '@/types'
import type { EntitlementStatus, InventoryPackage } from '@/lib/inventory-addon'
import type { ExpenseAccessDecision } from '@/services/expense-access.service'

/**
 * โครงกลุ่ม 5 กลุ่ม (user เคาะ 2026-08-04 — spec `docs/superpowers/specs/2026-08-04-seller-menu-ia-design.md`)
 *
 * เดิมมี 8 กลุ่มที่โตตามลำดับที่ feature ถูกสร้าง ไม่ใช่ตามวิธีที่ผู้ขายคิด — กลุ่ม STORE
 * กลายเป็นถังรวมของ 8 อย่างที่ไม่เกี่ยวกัน (ตั้งค่าร้าน + สต็อก + กระเป๋าเงิน + ค่าใช้จ่าย +
 * พนักงาน + แพ็กเกจ + การจัดส่ง + โปรไฟล์สาธารณะ) จัดใหม่เป็น:
 *   ANALYTICS = ดูตัวเลข · MANAGE = งานประจำวัน · CHAT = คุยกับลูกค้า
 *   SHOPS = ตัวตน/ความน่าเชื่อถือ/เงินของร้าน · SETTING = ตั้งค่า
 *
 * IMPORTANT: slug ของ "รายการ" ห้ามเปลี่ยนเด็ดขาด — คอลัมน์ `SellerShortcutPreference.slugs`
 * เก็บ slug พวกนี้ไว้ในฐานข้อมูล
 * (feature 00027 เมนูลัดปักหมุด) ถ้าเปลี่ยนแล้วเมนูลัดที่ผู้ใช้ปักไว้จะหลุดเงียบ ๆ กลายเป็น
 * unavailable ทั้งหมด. slug ของ "กลุ่ม" เปลี่ยนได้ (grep แล้วไม่มีใครอ้างถึงนอกไฟล์นี้)
 *
 * NOTE: field `icon` ระดับกลุ่มไม่เคย render — AppMenu.tsx render กลุ่มเป็น
 * `<li className="menu-title"><span>{label}</span></li>` เท่านั้น เก็บไว้เพื่อความหมายในโค้ด
 */
export const sellerMenuItems: MenuItemType[] = [
  {
    icon: 'chart-bar',
    slug: 'seller-analytics',
    label: 'ANALYTICS',
    isTitle: true,
    children: [
      { url: '/dashboard', slug: 'seller:dashboard', label: 'ภาพรวมร้านค้า', icon: 'dashboard' },
      // ป้ายเดิม "ภาพรวมยอดขาย" บอกไม่ครบ — หน้านี้คำนวณ netProfit (revenue − COGS − expense)
      // รายวันอยู่แล้วตั้งแต่ feature 00016 (ดู sales/components/data.ts::DailyRow)
      { url: '/sales', slug: 'seller:sales', label: 'ภาพรวมกำไร/ขาดทุน', icon: 'chart-line' },
    ],
  },
  /**
   * MANAGE — ของที่ผู้ขายแตะทุกวัน รวมงานที่เคยกระจายอยู่ 4 กลุ่ม (ORDERS/PRODUCTS/CUSTOMERS/STORE)
   *
   * "ลูกค้า" อยู่ที่นี่ไม่ใช่ CHAT โดยตั้งใจ — เป็นทะเบียนลูกค้าที่ใช้ตอนเปิดบิล (POS /orders/new
   * ดึงจากที่นี่) ไม่ใช่กล่องสนทนา
   */
  {
    icon: 'receipt-2',
    slug: 'seller-manage',
    label: 'MANAGE',
    isTitle: true,
    children: [
      // ป้ายผันตามประเภทกิจการด้วย applyOrderLabel ด้านล่าง — ค่าในอาเรย์นี้คือของ ONLINE_SALES
      { url: '/orders', slug: 'seller:orders', label: 'คำสั่งซื้อ', icon: 'receipt-2' },
      { url: '/auctions', slug: 'seller:auctions', label: 'การประมูล', icon: 'gavel' },
      { url: '/products', slug: 'seller:products', label: 'สินค้า', icon: 'package' },
      // icon 'boxes' ไม่มีใน tabler icon set (verify: api.iconify.design/tabler.json?icons=boxes → not_found)
      // ใช้ 'archive' แทน (verified มีจริง) — ห้ามใช้ 'box'/'package' เพราะชนกับเมนู "สินค้า"
      { url: '/inventory', slug: 'seller:inventory', label: 'จัดการสต็อก', icon: 'archive' },
      // feature 00024/00028 — เห็นเฉพาะร้าน vertical=SERVICE_QUEUE (กรองด้วย applyVerticalMenu
      // ด้านล่าง — เดิมต้องเช็ค kind คู่กันด้วย ตอนนี้เหลือเงื่อนไข vertical เดียวพอ)
      // icon 'armchair' user เลือกเอง 2026-07-31 (verified มีจริง — ใช้อยู่แล้วในโปรเจกต์)
      // ป้าย "คิวงาน" มาจาก user โดยตรง — คำเดิม "ทรัพยากร" อ่านแล้วไม่เข้าใจ
      // ลูกค้ากลุ่มแรกคือร้านตกแต่งไฟหน้ารถ ซึ่งเรียกหน่วยที่รับงานพร้อมกันว่า "คิวงาน"
      { url: '/queues', slug: 'seller:queues', label: 'คิวงาน', icon: 'armchair' },
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
      { url: '/customers', slug: 'seller:customers', label: 'ลูกค้า', icon: 'user-circle' },
      // feature 00016 (Expense & Cost Tracking, Unit 5A) — conditional render ด้วย applyExpenseMenu ด้านล่าง
      // icon 'report-money' ยืนยันแล้วใน UX-Design-Spec.md §Resolved Decisions #1 (tabler set มีจริง)
      { url: '/expenses', slug: 'seller:expenses', label: 'ค่าใช้จ่าย', icon: 'report-money' },
      // ซ่อนเมนู "หมวดหมู่สินค้า" ชั่วคราว — route /categories ยังอยู่ (เข้าตรงผ่าน URL ได้)
      // { url: '/categories', slug: 'seller:categories', label: 'หมวดหมู่สินค้า', icon: 'category' },
    ],
  },
  /**
   * CHAT — ทุกอย่างที่เกี่ยวกับการคุยกับลูกค้า ทั้งที่คนตอบเองและที่ระบบตอบแทน
   *
   * เดิมแยกเป็น CUSTOMERS (ข้อความ) กับ "ผู้ช่วยอัตโนมัติ" (Auto Reply/ChatBot) ซึ่งบังคับให้
   * ผู้ใช้กระโดดข้ามกลุ่มไปมาระหว่างตั้งค่าบอทกับอ่านผลที่บอทตอบไป
   *
   * ป้าย "Auto Reply"/"ChatBot" เปลี่ยนเป็นไทยตาม PRODUCT.md "ภาษาไทยเรียบง่าย ลด jargon"
   * (user เคาะ 2026-08-04) — ของสองอันนี้ยังเป็นคนละความคิดกัน ไม่ใช่ระดับความสามารถของของเดียวกัน:
   *   ตอบกลับอัตโนมัติ — ตอบเป๊ะตามเงื่อนไขที่ร้านตั้ง ไม่มีค่าใช้จ่าย ไม่ตรงก็เงียบ
   *   ผู้ช่วยอัตโนมัติ  — ส่วนเสริม AI ที่ครอบทุกข้อความ มีค่าใช้จ่ายต่อครั้ง
   * เรียงของฟรีก่อนโดยเจตนา — ทุกร้านควรตั้งให้ครบก่อนพิจารณาเปิดของที่มีค่าใช้จ่าย
   *
   * NOTE: "บุคลิก AI" (/settings/ai) เป็นแท็บในหน้าผู้ช่วยอัตโนมัติ ห้ามเพิ่มกลับเป็นเมนูแยก
   * จะกลายเป็นสองทางเข้าไปที่เดียวกัน
   */
  {
    icon: 'message-circle',
    slug: 'seller-chat',
    label: 'CHAT',
    isTitle: true,
    children: [
      { url: '/inbox', slug: 'seller:inbox', label: 'ข้อความ', icon: 'message-circle' },
      { url: '/settings/auto-reply', slug: 'seller:settings-auto-reply', label: 'ตอบกลับอัตโนมัติ', icon: 'message-bolt' },
      { url: '/settings/chatbot', slug: 'seller:settings-chatbot', label: 'ผู้ช่วยอัตโนมัติ', icon: 'robot' },
    ],
  },
  /**
   * SHOPS — ตัวตน ความน่าเชื่อถือ และเงินของร้าน (ของที่เข้าไปนาน ๆ ครั้ง ไม่ใช่งานประจำวัน)
   */
  {
    icon: 'building-store',
    slug: 'seller-shops',
    label: 'SHOPS',
    isTitle: true,
    children: [
      { url: '/reviews', slug: 'seller:reviews', label: 'รีวิว', icon: 'star' },
      // ป้ายเดิม "ยืนยันตน" อธิบายวิธีการ ไม่ได้อธิบายผลลัพธ์ — หน้านี้คือที่ที่ร้านไต่ระดับ
      // L1 OTP → L2 บัตรประชาชน → L3 จดทะเบียน ซึ่งผู้ขายเรียกกันว่า "ระดับร้าน"
      { url: '/verification', slug: 'seller:verification', label: 'ระดับร้าน', icon: 'shield-check' },
      { url: '/badges', slug: 'seller:badges', label: 'ความสำเร็จ', icon: 'award' },
      { url: '/wallet', slug: 'seller:wallet', label: 'กระเป๋าเงิน', icon: 'wallet' },
      // "แพ็กเกจของฉัน" — หน้ารวมศูนย์ Business Package + Stock Pro รายร้าน (2026-07-04 subscription overview)
      // คนละหน้ากับ /business ที่การ์ดแพ็กเกจเหนือเมนูพาไป (นั่นคือหน้าเลือก/จัดการแพ็กเกจธุรกิจ)
      // icon 'crown' verified มีจริงใน tabler (ใช้ซ้ำกับ UpgradeToProCard)
      { url: '/subscriptions', slug: 'seller:subscriptions', label: 'แพ็กเกจของฉัน', icon: 'crown' },
      // feature 00012 (Shop Staff Invite Links, Task 4.3) — เมนู "พนักงาน" จัดการลิงก์เชิญ + สมาชิก Business
      // แสดงเฉพาะ owner ของ Business shop (ซ่อน runtime ด้วย applyStaffMenu ด้านล่าง — mirror applyInventoryGate)
      // icon 'users-group' verified มีจริงใน tabler set (api.iconify.design/tabler.json?icons=users-group → found)
      { url: '/admins', slug: 'seller:admins', label: 'พนักงาน', icon: 'users-group' },
    ],
  },
  {
    icon: 'settings',
    slug: 'seller-setting',
    label: 'SETTING',
    isTitle: true,
    children: [
      { url: '/shop', slug: 'seller:shop', label: 'ร้านค้า', icon: 'building-store' },
      // ป้ายเดิม "โปรไฟล์สาธารณะ" ชนกับรายการ "โปรไฟล์" (ลิงก์ออกไปหน้าร้านจริง) ที่อยู่กลุ่มเดียวกัน
      // อันนี้คือที่ "ตั้งว่าหน้าร้านจะโชว์อะไร" อีกอันคือ "ไปดูของจริง"
      { url: '/public-profile', slug: 'seller:public-profile', label: 'ตั้งค่าหน้าร้าน', icon: 'world' },
      // เดิม label "บัญชีที่เชื่อมต่อ" ครอบ 2 เรื่องที่คนละเจ้าของ (การจัดส่งของร้าน + วิธี login
      // ของ user) ทำให้ผู้ใช้หาการตั้งค่าของตัวเองไม่เจอ — วิธี login ย้ายไป /account แล้ว
      // (feature 00026, user เคาะ 2026-08-02) เหลือเฉพาะการจัดส่ง จึงเปลี่ยนชื่อให้ตรงเนื้อใน
      { url: '/settings', slug: 'seller:settings', label: 'การจัดส่ง', icon: 'truck-delivery' },
      // หน้านี้มีมาตั้งแต่ feature 00018 แต่ไม่เคยมีลิงก์ใน sidebar เลย — เข้าได้จากหน้าแชท
      // และจาก callback ของ Facebook เท่านั้น. icon 'plug-connected' ใช้อยู่แล้วในโปรเจกต์
      // สำหรับความหมายเดียวกัน (เชื่อมเพจ FB / เชื่อมขนส่ง iShip) ผู้ใช้จำสัญลักษณ์นี้ได้แล้ว
      { url: '/settings/channels', slug: 'seller:settings-channels', label: 'ช่องทางการขาย', icon: 'plug-connected' },
      // เคยมีรายการ "โปรไฟล์" (ลิงก์ออกไปหน้าร้านจริงบนโดเมนผู้ซื้อ) ต่อจากนี้ — user ให้เอาออก
      // 2026-08-04 ทางเข้าหน้าร้านจริงเหลือที่ dropdown มุมขวาบน (desktop) กับแผงบัญชีในหน้าแรก
      // (มือถือ) ซึ่งเป็นที่ของ "ตัวคน" อยู่แล้ว ไม่ใช่เมนูตั้งค่าร้าน
      // ห้ามใส่กลับโดยไม่ถาม — ตอนถอดออกได้ลบ route /go/profile ทิ้งไปด้วย
    ],
  },
  // กลุ่ม "บัญชีของฉัน" (/account) ถูกยุบ 2026-08-04 — ย้ายไปอยู่ใน dropdown มุมขวาบน
  // (desktop) และ AccountSwitcherSheet (มือถือ) ที่เดียว เพราะเป็นของ "ตัวคน" ไม่ใช่ของร้าน
  // route /account ยังอยู่ครบ ไม่ได้ถูกลบ
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
 * applyVerticalMenu — runtime transform ตามประเภทกิจการของร้าน (feature 00017 Phase 1, FR-LODG-02;
 * ขยาย 2→3 ทางที่ feature 00028 BR-SBT-15/16 — ยุบ applyAppointmentMenu เดิมเข้ามารวมที่นี่
 * เพราะเงื่อนไขเปิดคิวงานเหลือเช็คแค่ vertical เงื่อนไขเดียวแล้ว (canUseAppointments เปลี่ยนไปตาม
 * BR-SBT-11) ไม่ต้องเช็ค kind คู่กันอีกต่อไป จึงไม่จำเป็นต้องมีฟังก์ชันแยก)
 *
 * ทำไมต้องกรองเป็นกลุ่ม ไม่ใช่แค่ซ่อนเมนูของประเภทอื่นทีละคู่ (BRD §8.1 matrix คือ SSOT):
 *   - ONLINE_SALES: เห็นสินค้า + สต็อก + ประมูล — ไม่เห็นคิวงาน/ห้องพัก
 *   - SERVICE_QUEUE: เห็นสินค้า + คิวงาน — ไม่เห็นสต็อก/ประมูล/ห้องพัก (ไม่มีจัดส่ง)
 *   - LODGING: เห็นห้องพัก/ปฏิทิน/การจอง/แม่บ้าน — ไม่เห็นสินค้า/สต็อก/ประมูล/คิวงานเลย
 * (BR-LODG-02/BR-SBT-06: 1 ธุรกิจ = 1 ประเภท ต้องไม่เห็นเมนูของประเภทอื่นเลย)
 *
 * IMPORTANT: การซ่อนเมนู "ไม่ใช่" การควบคุมสิทธิ์ (BR-LODG-03/BR-RSV-02/BR-SBT-10) — ทุก route
 * ของแต่ละโดเมนต้องมี server-side guard ของตัวเอง (requireLodgingShop/requireGeneralShop/
 * canUseAppointments/requireSellerShop) ที่ทั้ง API route และ page-level server component ด้วยเสมอ
 * ฟังก์ชันนี้ทำหน้าที่แค่ "ไม่รกตา" ไม่ได้ทำหน้าที่ป้องกัน
 *
 * pattern เดียวกับ applyStaffMenu (กรอง child ออกจาก group) — ไม่ disable แต่ซ่อน
 */
const LODGING_ONLY_SLUGS = ['seller:rooms', 'seller:calendar', 'seller:bookings', 'seller:housekeepers']
const ONLINE_SALES_ONLY_SLUGS = ['seller:inventory', 'seller:auctions']
const SERVICE_QUEUE_ONLY_SLUGS = ['seller:queues']
// seller:products ใช้ร่วมกันของ ONLINE_SALES และ SERVICE_QUEUE (matrix §8.1 แถว "สินค้า")
const SHARED_PRODUCT_SLUGS = ['seller:products']

const VERTICAL_VISIBLE_SLUGS: Record<string, string[]> = {
  ONLINE_SALES: [...SHARED_PRODUCT_SLUGS, ...ONLINE_SALES_ONLY_SLUGS],
  SERVICE_QUEUE: [...SHARED_PRODUCT_SLUGS, ...SERVICE_QUEUE_ONLY_SLUGS],
  LODGING: LODGING_ONLY_SLUGS,
}

// slug ทั้งหมดที่ผูกกับ vertical ใด vertical หนึ่งโดยเฉพาะ — ใช้คำนวณว่าต้องซ่อนอะไรบ้าง
const ALL_VERTICAL_SCOPED_SLUGS = [
  ...LODGING_ONLY_SLUGS,
  ...ONLINE_SALES_ONLY_SLUGS,
  ...SERVICE_QUEUE_ONLY_SLUGS,
  ...SHARED_PRODUCT_SLUGS,
]

export function applyVerticalMenu(
  items: MenuItemType[],
  vertical: string,
): MenuItemType[] {
  // vertical ที่ไม่รู้จัก (ข้อมูลเพี้ยน) → fail-closed ตาม default เดิม (ONLINE_SALES)
  const visible = VERTICAL_VISIBLE_SLUGS[vertical] ?? VERTICAL_VISIBLE_SLUGS.ONLINE_SALES
  const hidden = ALL_VERTICAL_SCOPED_SLUGS.filter((slug) => !visible.includes(slug))
  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.filter((child) => !hidden.includes(child.slug ?? '')),
  })
}

/**
 * ORDER_VOCAB — คลังคำของ order lifecycle ผันตามประเภทกิจการ (feature 00030 BR-BKU-10)
 *
 * ทำไม 4 ช่องไม่ใช่ noun เดี่ยวแล้วให้ call site ต่อสตริงเอง: ภาษาไทยผันไม่เท่ากันทุกช่อง —
 * `"สร้าง" + noun` ได้ "สร้างบิลเข้าพัก" ซึ่งไม่ใช่ภาษาที่คนพูด (ของจริงคือ "เปิดบิลเข้าพัก")
 * และช่องแคบอย่างแท็บล่าง/FAB รับคำเต็มไม่ไหว จึงต้องมีคู่สั้นแยกไว้ต่างหาก
 *
 * เลี่ยงคำว่า "การจอง" สำหรับ LODGING โดยตั้งใจ — ชนกับเมนู /bookings ที่มีอยู่แล้วตรงตัว
 * (ทั้งสองอย่างมีจริงพร้อมกันในร้านบ้านพัก: การจอง = วันเข้าพัก+ห้องที่กันไว้, บิลเข้าพัก =
 * ยอดเงินและการชำระ — ดู docs/20 - Features/00030 .../UX-Copy.md §6)
 *
 * ค่าที่ไม่รู้จัก → ชุดของ ONLINE_SALES (fail-safe เดียวกับ applyVerticalMenu)
 *
 * IMPORTANT: นี่คือ SSOT เดียวของคำเหล่านี้ — ห้ามประกาศคำชุดคู่ขนานที่ไฟล์อื่น. VERTICAL_CTA ใน
 * (chat)/inbox/[conversationId]/components/CustomerPanel.tsx เคยประกาศคำของตัวเองจนขัดกัน
 * (LODGING = "บิลเข้าพัก" ที่นี่ vs "การจอง" ที่นั่น) แก้แล้วให้อ่านจากไฟล์นี้ เหลือแค่ href/icon
 */
export type OrderVocab = {
  /** ชื่อของสิ่งนั้น — เมนู, breadcrumb, page title, หัวข้อ, แท็บ */
  noun: string
  /** คู่สั้นสำหรับที่แคบ (<120px) — แท็บล่าง, chip */
  nounShort: string
  /** ปุ่มหลัก/หัวฟอร์ม/title ของ /orders/new */
  createLabel: string
  /** ปุ่ม FAB + ปุ่มในแถบเครื่องมือแชท */
  createLabelShort: string
  /**
   * ป้ายช่อง "วันที่ที่รายการนี้เกิดขึ้น" ใน OrderDateRow (feature 00033)
   *
   * [สำคัญ] ห้ามผันเป็น `"วันที่" + noun` เด็ดขาด — LODGING จะได้ "วันที่บิลเข้าพัก" ซึ่งผู้ใช้อ่านเป็น
   * "วันเข้าพัก" ทั้งที่นั่นคือคอลัมน์ `Order.checkIn` คนละตัวกัน (SERVICE_QUEUE ก็มี
   * `serviceStart` แยกอยู่เหมือนกัน) ป้ายนี้หมายถึง **วันที่ธุรกรรมเกิด** เท่านั้น
   * จึงต้องเป็นคำที่ผูกกับ "การเปิดบิล/รับงาน" ไม่ใช่กับ "การใช้บริการ"
   */
  dateLabel: string
  /**
   * ขั้น "ร้านลงมือทำตามที่รับงานมาแล้ว" ในเช็กลิสต์สถานะของตารางรายการ (feature 00036 FR-SOV-003)
   *
   * [สำคัญ] ห้ามใช้คำเดียวกับ APPOINTMENT_STATUS_LABEL.COMPLETED ("ให้บริการแล้ว") เด็ดขาด —
   * สองอย่างนี้ผูกกับคนละคอลัมน์และตัดสินคนละเรื่อง (ช่องนี้ = Order.status, ป้ายนั้น =
   * Order.appointmentStatus) ถ้าใช้คำเดียวกันเป๊ะ ผู้ใช้จะอ่านเป็นสิ่งเดียวกันแล้วงงว่าทำไม
   * จอเดียวบอก "ให้บริการแล้ว" ที่หนึ่งติ๊กถูก อีกที่ยังไม่ติ๊ก
   */
  fulfillLabel: string
}

export const ORDER_VOCAB: Record<string, OrderVocab> = {
  ONLINE_SALES: {
    noun: 'คำสั่งซื้อ',
    nounShort: 'คำสั่งซื้อ',
    createLabel: 'สร้างคำสั่งซื้อ',
    createLabelShort: 'สร้างคำสั่งซื้อ',
    dateLabel: 'วันที่สั่งซื้อ',
    fulfillLabel: 'ยืนยันการจัดส่ง',
  },
  SERVICE_QUEUE: {
    noun: 'การเข้ารับบริการ',
    // 'เข้ารับบริการ' → 'บริการ' (user เคาะ 2026-08-05: "การเข้ารับบริการใหม่ ... ยาวไป")
    // ช่องนี้มีไว้สำหรับที่แคบโดยเฉพาะ — แท็บล่างมือถือและหัวหน้าต่างโมดัลในแชทที่มี avatar
    // ชื่อลูกค้า และปุ่มย่อ/ปิด เบียดกันอยู่แล้ว คำเต็มอยู่ที่ noun ตามเดิมไม่ได้หายไปไหน
    nounShort: 'บริการ',
    createLabel: 'สร้างการเข้ารับบริการ',
    // 'เข้ารับบริการใหม่' → 'งานใหม่' (user สั่ง 2026-08-07: "ปุ่มเข้ารับบริการใหม่ ควรเปลี่ยนชื่อ
    // ที่กระชับกว่านี้") ช่องนี้ลงในที่แคบทั้งหมด: ปุ่มท้ายแถบเครื่องมือแชท (ถูกตัดหายครึ่งคำบนจอ
    // 390px จริง), FAB pill ลอย, เมนูกดค้างข้อความ — คำเต็มยังอยู่ที่ createLabel ตามเดิม
    // เลี่ยง 'จองคิวใหม่': ชนกับ 'คิวงาน' ที่หมายถึงทรัพยากรผู้รับงาน และสื่อว่าต้องมีนัดเสมอ
    // ทั้งที่วันนัดเป็นของไม่บังคับ
    createLabelShort: 'งานใหม่',
    /**
     * ไม่ใช่ "วันที่เข้ารับบริการ" — นั่นคือ Order.serviceStart คนละคอลัมน์
     *
     * user เคาะ 2026-08-07 ให้เปลี่ยนจาก "วันที่รับงาน" → "วันที่สร้าง": ร้านคิวงานเปิดบิลตอนที่
     * ลูกค้ามาถึงหน้าร้าน วันที่ตรงนี้จึงเป็น "ตอนที่คีย์บิล" ซึ่งเป็นข้อเท็จจริง ไม่ใช่สิ่งที่ต้อง
     * ตัดสินใจ — ต่างจากร้านขายออนไลน์ที่ "วันที่สั่งซื้อ" คือวันที่ลูกค้าทัก ซึ่งมักไม่ใช่วันที่คีย์
     */
    dateLabel: 'วันที่สร้าง',
    /**
     * "เริ่ม" นำหน้าโดยตั้งใจ เพื่อไม่ให้ชนกับ APPOINTMENT_STATUS_LABEL.COMPLETED ที่เป็น
     * "ให้บริการแล้ว" เป๊ะ ๆ — ป้ายนั้นผูกกับ Order.appointmentStatus (ผู้ขายกดปิดผลนัด)
     * ส่วนช่องนี้ผูกกับ Order.status ซึ่งเดินคนละเส้น ใบหนึ่งติ๊กถูกได้โดยที่อีกอันยังไม่ติ๊ก
     */
    fulfillLabel: 'เริ่มให้บริการแล้ว',
  },
  LODGING: {
    noun: 'บิลเข้าพัก',
    nounShort: 'บิลเข้าพัก',
    createLabel: 'เปิดบิลเข้าพัก',
    createLabelShort: 'เปิดบิลเข้าพัก',
    // ไม่ใช่ "วันที่เข้าพัก" — นั่นคือ Order.checkIn คนละคอลัมน์
    dateLabel: 'วันที่เปิดบิล',
    // เลี่ยงคำว่า "เช็คอินแล้ว" ด้วยเหตุผลเดียวกับ dateLabel ข้างบน — ผู้ใช้จะอ่านว่าหมายถึง
    // คอลัมน์ Order.checkIn ทั้งที่ช่องนี้คือขั้นตอนบนเช็กลิสต์ที่ผูกกับ Order.status
    fulfillLabel: 'รับเข้าพักแล้ว',
  },
}

export function resolveOrderVocab(vertical: string): OrderVocab {
  return ORDER_VOCAB[vertical] ?? ORDER_VOCAB.ONLINE_SALES
}

/**
 * PRODUCT_VOCAB — คลังคำของ "ของที่ร้านขาย" ผันตามประเภทกิจการ (user เคาะ 2026-08-07)
 *
 * ทำไมต้องมีชุดที่สองแยกจาก ORDER_VOCAB: ORDER_VOCAB ครอบเฉพาะคำฝั่ง order lifecycle
 * (คำสั่งซื้อ/บิลเข้าพัก) ส่วนบล็อก "สินค้าขายดี" พูดถึงตัวสินค้าและ**หน่วยนับการขาย** ซึ่งเป็น
 * คนละแกน — ร้านคิวงานขาย "บริการ" ที่นับเป็น "ครั้ง" ไม่ใช่ "ชิ้น". เอาไปยัดเป็นช่องเพิ่มใน
 * OrderVocab ไม่ได้เพราะ call site ส่วนใหญ่ของ ORDER_VOCAB ไม่รู้จักสินค้าเลย
 *
 * ทำไม soldLine เป็นฟังก์ชันไม่ใช่ verb+unit ให้ call site ต่อเอง: บทเรียน
 * docs/conventions/... (feature 00030) — ประโยคไทยผันไม่เท่ากันทุกช่อง การต่อสตริงที่ call site
 * ทำให้ได้ประโยคที่ไม่มีคนพูด แล้วไม่มีใครเห็นจนกว่าจะเปิดร้าน vertical นั้นดูเอง
 *
 * ค่าที่ไม่รู้จัก → ชุดของ ONLINE_SALES (fail-safe เดียวกับ resolveOrderVocab)
 *
 * IMPORTANT: SSOT เดียวของคำเหล่านี้ — ห้ามประกาศคำชุดคู่ขนานที่ไฟล์อื่น (เหตุผลเดียวกับ
 * ORDER_VOCAB ด้านบน)
 */
export type ProductVocab = {
  /** หัวข้อบล็อก "ขายดี" — BestSellerStrip (มือถือ) + TopSellingProducts (เดสก์ท็อป) */
  bestSellerTitle: string
  /** ลิงก์ท้ายหัวข้อ → /products */
  viewAllLabel: string
  /** ไอคอนหน้าบรรทัดยอดขายบนการ์ด (ชื่อเปล่า = tabler ตาม Icon wrapper) */
  soldIcon: string
  /** ประโยคยอดขายเต็มบรรทัด — รับจำนวนที่ format แล้ว */
  soldLine: (formattedCount: string) => string
  /** empty state ของบล็อกขายดี (เดสก์ท็อป) — หัวข้อ + บรรทัดบอกเกณฑ์ */
  emptyTitle: string
  /**
   * บรรทัดบอกเกณฑ์ใน empty state — เก็บเป็นประโยคเต็มต่อ vertical ไม่ใช่ต่อ `ORDER_VOCAB.noun` เข้าไป
   * เพราะประโยคนี้มีทั้งกริยาและตัวเชื่อม ("...ที่มี{X}เข้ามา") ซึ่งอ่านไม่เหมือนกันทุกคำ
   */
  emptyHint: string
  /**
   * หน่วยนับต่อ 1 บรรทัดในบิล — ใช้กับราคาต่อหน่วย ("฿400/ชิ้น" vs "฿400/ครั้ง")
   * คนละช่องกับ soldLine ซึ่งเป็นประโยคสรุปยอดสะสม: ช่องนี้ต่อท้าย "/" ตรง ๆ จึงต้องเป็นคำนาม
   * ลักษณนามล้วน ห้ามใส่กริยา
   */
  unitLabel: string
  /** หัวคอลัมน์ตารางเดสก์ท็อป — ชื่อสิ่งของ / จำนวน / ยอดเงินรวมของจำนวนนั้น */
  itemColLabel: string
  countColLabel: string
  amountColLabel: string
}

export const PRODUCT_VOCAB: Record<string, ProductVocab> = {
  ONLINE_SALES: {
    bestSellerTitle: 'สินค้าขายดี',
    viewAllLabel: 'ดูสินค้าทั้งหมด',
    soldIcon: 'package',
    soldLine: (n) => `สั่งซื้อแล้ว ${n} ชิ้น`,
    unitLabel: 'ชิ้น',
    emptyTitle: 'ยังไม่มีสินค้าขายดี',
    emptyHint: 'อันดับจะขึ้นทันทีที่มีคำสั่งซื้อเข้ามา ไม่ต้องรอยืนยัน',
    itemColLabel: 'สินค้า',
    countColLabel: 'สั่งซื้อ',
    amountColLabel: 'ยอดสั่งซื้อ',
  },
  SERVICE_QUEUE: {
    // "ขายดี" ใช้กับงานบริการแล้วฟังเป็นของที่ขายเป็นชิ้น — "ยอดนิยม" ตรงกว่า
    bestSellerTitle: 'บริการยอดนิยม',
    viewAllLabel: 'ดูบริการทั้งหมด',
    soldIcon: 'tool',
    // หน่วยเป็น "ครั้ง" ไม่ใช่ "ชิ้น" — งานบริการนับเป็นครั้งที่เข้ารับ
    soldLine: (n) => `ใช้บริการแล้ว ${n} ครั้ง`,
    unitLabel: 'ครั้ง',
    emptyTitle: 'ยังไม่มีบริการยอดนิยม',
    emptyHint: 'อันดับจะขึ้นทันทีที่มีการเข้ารับบริการเข้ามา ไม่ต้องรอยืนยัน',
    itemColLabel: 'บริการ',
    countColLabel: 'ใช้บริการ',
    amountColLabel: 'ยอดใช้บริการ',
  },
  LODGING: {
    bestSellerTitle: 'ห้องพักยอดนิยม',
    viewAllLabel: 'ดูห้องพักทั้งหมด',
    soldIcon: 'bed',
    soldLine: (n) => `เข้าพักแล้ว ${n} ครั้ง`,
    // บรรทัดในบิลของบ้านพักนับเป็น "คืน" (จำนวน = จำนวนคืนที่พัก) ไม่ใช่ "ครั้ง" แบบยอดสะสม
    unitLabel: 'คืน',
    emptyTitle: 'ยังไม่มีห้องพักยอดนิยม',
    emptyHint: 'อันดับจะขึ้นทันทีที่มีบิลเข้าพักเข้ามา ไม่ต้องรอยืนยัน',
    itemColLabel: 'ห้องพัก',
    countColLabel: 'เข้าพัก',
    amountColLabel: 'ยอดเข้าพัก',
  },
}

export function resolveProductVocab(vertical: string): ProductVocab {
  return PRODUCT_VOCAB[vertical] ?? PRODUCT_VOCAB.ONLINE_SALES
}

/** ป้ายเมนู /orders — wrapper บาง ๆ ของ resolveOrderVocab().noun ที่ call site เดิมยังใช้อยู่ */
export function resolveOrderMenuLabel(vertical: string): string {
  return resolveOrderVocab(vertical).noun
}

/**
 * applyOrderLabel — ป้ายเมนู /orders ผันตามประเภทกิจการ (user เคาะ 2026-08-04)
 *
 * ทำไมเป็น transform ไม่ใช่แก้ค่าใน sellerMenuItems: อาเรย์ต้นฉบับเป็น module-level constant
 * ที่ getSellerPageTitle.ts import ตรง ๆ ตอน module load — ไม่รู้จัก vertical ของ request นั้น
 * (pattern เดียวกับ applyInventoryGate)
 */

export function applyOrderLabel(items: MenuItemType[], vertical: string): MenuItemType[] {
  const label = resolveOrderMenuLabel(vertical)

  return items.map((group) => !group.children ? group : {
    ...group,
    children: group.children.map((child) =>
      child.slug === 'seller:orders' ? { ...child, label } : child,
    ),
  })
}

/**
 * resolveVisibleSellerMenu — compose ตัวกรอง "ที่กรองจริง" ทั้ง 4 ตัวไว้ที่เดียว (feature 00027 TFR-001;
 * เดิม 5 ตัว — applyAppointmentMenu ถูกยุบเข้า applyVerticalMenu แล้วที่ feature 00028 BR-SBT-16)
 *
 * ลำดับเดียวกับที่ layout.tsx compose อยู่เดิมเป๊ะ ๆ:
 *   applyInventoryGate → applyStaffMenu → applyExpenseMenu → applyVerticalMenu
 * (applyVerticalMenu อยู่ชั้นนอกสุดโดยตั้งใจ — กรองหลัง gate อื่นทุกตัว เพื่อไม่ให้ badge/disable
 *  ที่ gate ชั้นในติดไว้ ไปโผล่บนเมนูที่ควรถูกซ่อนไปแล้ว)
 *
 * IMPORTANT: ไม่รวม applyChatBadge โดยตั้งใจ — ตัวนั้นไม่กรองอะไรเลย มีแค่แปะจำนวนข้อความยังไม่อ่าน
 * บนเมนู "ข้อความ" ซึ่งเป็นเรื่องของ sidebar อย่างเดียว การเอามาไว้ในนี้จะบังคับให้ทุกคนที่อยาก
 * รู้ว่า "เมนูไหนมองเห็นได้บ้าง" ต้องไปนับข้อความยังไม่อ่านมาก่อน ทั้งที่ไม่เกี่ยวกัน
 */
export function resolveVisibleSellerMenu(
  items: MenuItemType[],
  ctx: {
    entitlement: { status: EntitlementStatus; package: InventoryPackage | null }
    staff: { kind: 'PERSONAL' | 'BUSINESS'; role: 'OWNER' | 'ADMIN' }
    expense: ExpenseAccessDecision
    shop: { kind: string; vertical: string }
  },
): MenuItemType[] {
  // applyOrderLabel อยู่นอกสุด — แค่เปลี่ยนป้าย ไม่กรองอะไร วางหลังตัวกรองทุกตัวจึงไม่ต่างกัน
  // เชิงผลลัพธ์ แต่อ่านง่ายกว่าเมื่อวางคู่กับ applyVerticalMenu ซึ่งใช้ vertical ตัวเดียวกัน
  return applyOrderLabel(
    applyVerticalMenu(
      applyExpenseMenu(
        applyStaffMenu(applyInventoryGate(items, ctx.entitlement), ctx.staff),
        ctx.expense,
      ),
      ctx.shop.vertical,
    ),
    ctx.shop.vertical,
  )
}

/**
 * flattenSellerMenu — คลี่กลุ่มหัวข้อ (isTitle + children) ให้เหลือเฉพาะรายการที่กดไปไหนได้จริง
 *
 * mirror ของ flattenItems ใน getSellerPageTitle.ts โดยตั้งใจ — ไม่ไปแก้ไฟล์นั้นเพื่อลดขนาด diff
 * ของฟีเจอร์นี้ (ถ้าจะรวมเป็นตัวเดียว ควรทำแยกรอบพร้อม regression test ของ page title)
 */
export function flattenSellerMenu(items: MenuItemType[]): MenuItemType[] {
  const out: MenuItemType[] = []
  for (const item of items) {
    if (item.url) out.push(item)
    if (item.children?.length) out.push(...flattenSellerMenu(item.children))
  }
  return out
}

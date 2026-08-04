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
      /**
       * โปรไฟล์ — ลิงก์ออกไปหน้าร้านจริงบนโดเมนผู้ซื้อ (เปิดแท็บใหม่)
       *
       * ทำไม url เป็น /go/profile ไม่ใช่ /b/{slug} ตรง ๆ: อาเรย์นี้เป็น module-level constant
       * ที่ getSellerPageTitle.ts import ตรง ๆ ตอน module load — ไม่รู้จัก session ปลายทางจึง
       * ต้อง resolve ต่อ request. route handler `(paces)/seller/go/profile/route.ts` ทำหน้าที่นั้น
       * แล้ว 302 ต่อ (ที่นั่นยังต้องตัด `seller.` ออกจาก host ไม่งั้น proxy จะ rewrite เป็น
       * /seller/b/{slug} → 404 ซึ่งเป็นบั๊กจริงที่เคยเจอกับปุ่มเดียวกันนี้)
       *
       * `target: '_blank'` เป็น field ที่มีใน MenuItemType อยู่แล้วแต่ไม่เคยถูกอ่าน —
       * AppMenu.tsx เพิ่งเดินสายให้รอบนี้ (render <a> + icon external-link แทน <Link>)
       */
      { url: '/go/profile', slug: 'seller:profile-external', label: 'โปรไฟล์', icon: 'building-store', target: '_blank' },
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
 * applyOrderLabel — ป้ายเมนู /orders ผันตามประเภทกิจการ (user เคาะ 2026-08-04)
 *
 * ทำไมเป็น transform ไม่ใช่แก้ค่าใน sellerMenuItems: อาเรย์ต้นฉบับเป็น module-level constant
 * ที่ getSellerPageTitle.ts import ตรง ๆ ตอน module load — ไม่รู้จัก vertical ของ request นั้น
 * (pattern เดียวกับ applyInventoryGate)
 *
 * เลี่ยงคำว่า "การจอง" สำหรับ LODGING โดยตั้งใจ — ชนกับเมนู /bookings ที่มีอยู่แล้วตรงตัว
 * ค่าที่ไม่รู้จัก → คงป้ายเดิม "คำสั่งซื้อ" (fail-safe เดียวกับ applyVerticalMenu)
 */
export const ORDER_MENU_LABELS: Record<string, string> = {
  ONLINE_SALES: 'คำสั่งซื้อ',
  SERVICE_QUEUE: 'ใบสั่งงาน',
  LODGING: 'บิลเข้าพัก',
}

export function resolveOrderMenuLabel(vertical: string): string {
  return ORDER_MENU_LABELS[vertical] ?? ORDER_MENU_LABELS.ONLINE_SALES
}

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

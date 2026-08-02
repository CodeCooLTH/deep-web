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
  /**
   * ผู้ช่วยอัตโนมัติ — รวมทุกอย่างที่ "ระบบคุยกับลูกค้าแทนร้าน" ไว้กลุ่มเดียว (user สั่ง 2026-08-01)
   *
   * ทำไมต้องรวม: ของสามชิ้นนี้เคยกระจายอยู่ใน STORE ปนกับตั้งค่าร้าน/สต็อก/ยอดเงิน ทั้งที่
   * ผู้ใช้คิดถึงมันเป็นเรื่องเดียวกัน ("ใครตอบลูกค้าแทนฉัน") และต้องสลับไปมาระหว่างสามหน้านี้
   * ตลอดตอนตั้งค่า — วางไว้ต่อจากกลุ่ม CUSTOMERS เพราะเป็นเรื่องของแชทเหมือนกัน
   *
   * คำที่ใช้ (Impeccable clarify + PRODUCT.md "ภาษาไทยเรียบง่าย ลด jargon"):
   *   - "บุคลิกและคำสั่ง AI" — หน้านี้คือที่ตั้งคำสั่งประจำร้าน + น้ำเสียงของ AI ที่ร่างคำตอบให้คนกดส่ง
   *     ไม่ใช้คำเดิม "ผู้ช่วยร่างคำตอบ AI" เพราะขึ้นต้นด้วย "ผู้ช่วย" ซ้ำกับชื่อกลุ่ม
   *   - "คำตอบของ DeepBot" — DeepBot เป็นชื่อที่ลูกค้าเห็นในแชทจริงอยู่แล้ว (ป้ายในเธรด + รายการแชท)
   *     จึงไม่ใช่ jargon และต้องใช้คำเดียวกันทั้งระบบ
   *   - (ล้าสมัยตั้งแต่ feature 00026) เคยมีบันทึกเรื่องคำว่า "บัญชีที่เชื่อมต่อ" ไว้ตรงนี้ —
   *     ป้ายนั้นถูกเลิกใช้แล้ว: /settings เปลี่ยนเป็น "การจัดส่ง" และวิธี login ของ user
   *     ย้ายไป /account "ข้อมูลส่วนตัว"  ดูเหตุผลที่รายการเมนูทั้งสองในกลุ่ม STORE
   */
  {
    icon: 'robot',
    slug: 'seller-assistant',
    label: 'ผู้ช่วยอัตโนมัติ',
    isTitle: true,
    children: [
      // NOTE: "บุคลิก AI" (/settings/ai) ย้ายไปเป็นแท็บในเมนู ChatBot แล้ว (user สั่ง 2026-08-01
      // "เพื่อเป็นการตั้งค่าตัวบอท") — route ยังอยู่ที่เดิม เข้าถึงผ่านแท็บ ห้ามเพิ่มกลับเป็นเมนู
      // แยกอีก จะกลายเป็นสองทางเข้าไปที่เดียวกัน
      // feature 00023 Deep Chat-Bot Assistant — บอทตอบเองจากกลุ่มคำ + คลังคำถาม-คำตอบ
      /**
       * แยก Auto Reply กับ ChatBot เป็นคนละเมนู (user ตัดสิน 2026-08-01)
       *
       * เพราะเป็นคนละความคิดกันจริง ๆ ไม่ใช่ระดับความสามารถของของเดียวกัน:
       *   Auto Reply — ตอบเป๊ะตามเงื่อนไขที่ร้านตั้ง ไม่มีค่าใช้จ่าย ไม่ตรงก็เงียบ
       *   ChatBot    — ส่วนเสริม AI ที่ครอบทุกข้อความ ตอบแทน/เสริมคนตามช่วงเวลาที่ตั้ง
       *                มีค่าใช้จ่ายต่อครั้ง และเป็นที่อยู่ของ option "ขัดเกลาคำตอบ Auto Reply"
       *
       * เรียง Auto Reply ก่อนโดยเจตนา — เป็นของฟรีที่ทุกร้านควรตั้งให้ครบก่อน
       * แล้วค่อยพิจารณาเปิดของที่มีค่าใช้จ่าย
       */
      { url: '/settings/auto-reply', slug: 'seller:settings-auto-reply', label: 'Auto Reply', icon: 'message-bolt' },
      { url: '/settings/chatbot', slug: 'seller:settings-chatbot', label: 'ChatBot', icon: 'robot' },
      // NOTE: /settings เคยถูกย้ายมาไว้ที่นี่ชั่วคราว 2026-08-01 แล้วย้ายกลับในวันเดียวกัน —
      // ของที่อยู่ในหน้านั้นถูก "ทั้งระบบแชทใช้ร่วมกัน" (กล่องข้อความปกติก็ต้องใช้) ไม่ใช่ของ
      // ผู้ช่วยอัตโนมัติ การเอามาไว้ในกลุ่มนี้ทำให้ผู้ใช้เข้าใจผิดว่าต้องเปิดผู้ช่วยก่อนถึงจะ
      // เชื่อมช่องทางได้ ห้ามย้ายกลับมาอีก
      // (feature 00026: หน้านั้นเหลือเฉพาะ "การจัดส่ง" แล้ว ข้อห้ามยังใช้เหมือนเดิม)
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
      { url: '/wallet', slug: 'seller:wallet', label: 'กระเป๋าเงิน', icon: 'wallet' },
      // feature 00016 (Expense & Cost Tracking, Unit 5A) — conditional render ด้วย applyExpenseMenu ด้านล่าง
      // icon 'report-money' ยืนยันแล้วใน UX-Design-Spec.md §Resolved Decisions #1 (tabler set มีจริง)
      { url: '/expenses', slug: 'seller:expenses', label: 'ค่าใช้จ่าย', icon: 'report-money' },
      // เดิม label "บัญชีที่เชื่อมต่อ" ครอบ 2 เรื่องที่คนละเจ้าของ (การจัดส่งของร้าน + วิธี login
      // ของ user) ทำให้ผู้ใช้หาการตั้งค่าของตัวเองไม่เจอ — วิธี login ย้ายไป /account แล้ว
      // (feature 00026, user เคาะ 2026-08-02) เหลือเฉพาะการจัดส่ง จึงเปลี่ยนชื่อให้ตรงเนื้อใน
      { url: '/settings', slug: 'seller:settings', label: 'การจัดส่ง', icon: 'truck-delivery' },
      // ย้ายออกไปกลุ่ม "ผู้ช่วยอัตโนมัติ" แล้ว (user สั่ง 2026-08-01):
      //   /settings/ai (บุคลิกและคำสั่ง AI) · /settings/auto-reply (คำตอบของ DeepBot)
    ],
  },
  /**
   * บัญชีของฉัน — กลุ่มของ "ตัวคน" ไม่ใช่ของร้าน (feature 00026)
   *
   * ทำไมต้องเป็นกลุ่มแยก ไม่ใช่รายการหนึ่งในกลุ่ม STORE: รอบแรกวางไว้ในกลุ่ม STORE
   * ลำดับที่ 8 จาก 9 ซึ่งกลายเป็นการบอกผู้ใช้ว่าตัวเขาเป็นทรัพย์สินชิ้นหนึ่งของร้าน — และเป็น
   * อาการเดียวกับบั๊กต้นเรื่องเป๊ะ ๆ (user หา "การตั้งค่าของตัวเอง" ไม่เจอเพราะถูกวางปนกับของร้าน)
   * กลุ่มเมนูคือคำตอบว่า "อะไรเป็นของใคร" จึงต้องแยกให้ขาดตั้งแต่ระดับกลุ่ม
   *
   * วางล่างสุด (user สั่ง 2026-08-02): เมนูที่ใช้ทุกวันคืองานร้าน — ของส่วนตัวเป็นของที่เข้าไป
   * นาน ๆ ครั้ง วางท้ายจึงตรงกับความถี่การใช้จริง และยังแยกขาดจากกลุ่มร้านเหมือนเดิม
   *
   * ยังไม่ย้าย /verification กับ /badges เข้ามาที่นี่ ทั้งที่ทั้งคู่ผูกกับ User เหมือนกัน —
   * เป็นการจัดเมนูใหม่ที่กระทบคนที่ใช้อยู่แล้ว ควรตัดสินแยกต่างหาก ไม่ใช่พ่วงมากับฟีเจอร์นี้
   */
  {
    icon: 'user-circle',
    slug: 'seller-me',
    label: 'บัญชีของฉัน',
    isTitle: true,
    children: [
      { url: '/account', slug: 'seller:account', label: 'ข้อมูลส่วนตัว', icon: 'user-circle' },
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

/**
 * resolveVisibleSellerMenu — compose ตัวกรอง "ที่กรองจริง" ทั้ง 5 ตัวไว้ที่เดียว (feature 00027 TFR-001)
 *
 * ลำดับเดียวกับที่ layout.tsx compose อยู่เดิมเป๊ะ ๆ:
 *   applyInventoryGate → applyStaffMenu → applyExpenseMenu → applyAppointmentMenu → applyVerticalMenu
 * (applyVerticalMenu อยู่ชั้นนอกสุดโดยตั้งใจ — กรองหลัง gate อื่นทุกตัว เพื่อไม่ให้ badge/disable
 *  ที่ gate ชั้นในติดไว้ ไปโผล่บนเมนูที่ควรถูกซ่อนไปแล้ว)
 *
 * 🛑 **ไม่รวม applyChatBadge โดยตั้งใจ** — ตัวนั้นไม่กรองอะไรเลย มีแค่แปะจำนวนข้อความยังไม่อ่าน
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
  return applyVerticalMenu(
    applyAppointmentMenu(
      applyExpenseMenu(
        applyStaffMenu(applyInventoryGate(items, ctx.entitlement), ctx.staff),
        ctx.expense,
      ),
      { kind: ctx.shop.kind, vertical: ctx.shop.vertical },
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

# Design Spec — Seller Mobile Command Center

วันที่: 2026-06-07 · phase: seller-mobile-responsive · branch: `feat/seller-mobile-responsive`
สถานะ: **V3 APPROVED (visual)** — user อนุมัติ mockup V3 + เคาะ open items ครบ; **หยุดไว้ ทำต่อ session ใหม่**
mockup ล่าสุด: `docs/mockups/home/command-center-v3.html` (ops hub) ← ตัวที่เอา
mockup เก่า (superseded): `command-center-v2.html` (FAB+hero), `command-center-v1.html` (CTA)

> ⚠️ **RESUME NOTE:** spec นี้ APPROVED แค่ระดับ visual/structure. ยัง **ไม่ได้ build** component ใด ๆ. ขั้นถัดไป = planner ตรวจ feasibility (blacklist, activity feed, Deep promo) → แตก task → safepay-ux refresh theme-source mapping (mapping เดิมอิง V2 — ต้องอัปเดตให้ตรง V3) → developer. ดู §Next Steps ท้ายไฟล์.

---

## Goal

seller เปิดบนมือถือ/แท็บเล็ต (≤1024px) เข้ามาเจอ **command center / operations hub** เป็นหน้าแรก — เห็นภาพรวมงานร้าน + เข้าถึงทุกเมนูใน tap เดียว + ทำ action สร้างได้เร็ว — แทน desktop dashboard ยัดลงจอ. Desktop (≥1024px) เห็น dashboard เดิมไม่เปลี่ยน.

## Architecture & Routing (คงเดิมจาก V2 — ไม่เปลี่ยน)

- **ไม่สร้าง route ใหม่** — ใช้ landing เดิม `/dashboard` เป็นจุดเดียว
- `dashboard/page.tsx` (RSC) fetch ข้อมูลครั้งเดียว render 2 ฝั่งด้วย Tailwind breakpoint `lg` (1024px):
  - `<div className="lg:hidden">` → `<CommandCenter data={...} />` (mobile + tablet ≤1024px)
  - `<div className="hidden lg:block">` → dashboard เดิม (desktop ≥1024px, ไม่แตะ)
- **ไม่มี viewport redirect** — CSS breakpoint toggle, render ถูกตั้งแต่ paint แรก ไม่ flash
- กราฟ ApexCharts desktop ใช้ `next/dynamic` (มีอยู่) ไม่ถ่วง mobile

## Layout V3 (บนลงล่าง) — ตาม mockup ที่อนุมัติ

```
[ TOP MENU ]      hamburger · ชื่อร้าน (center) · bell(badge) · avatar
[ SHORTCUT PANEL ] กริด 4-col × 2-row = 8 tile (ไอคอน chip + label)
[ MINI BANNER ]    แถบ "Deep แนะนำ" — ข่าว/โปรโมจาก Deep (admin จัดการ)
[ ORDER STATUS ]   timeline แนวนอน: นับออเดอร์ต่อสถานะ (รอ→จัดส่ง→สำเร็จ→ยกเลิก)
[ RECENT ACTIVITY ] feed timeline แนวตั้ง: เหตุการณ์ล่าสุดรวมทุกชนิด + "ดูทั้งหมด"
[ FAB ]            speed-dial มุมขวาล่าง (สร้างออเดอร์/สินค้า/หมวดหมู่)
```

### 1. TOP MENU
hamburger (เปิด offcanvas sidebar เดิม) · ชื่อร้าน truncate กลาง · bell + badge · avatar. เป็น static bar ภายใน `lg:hidden` ไม่ดึง `useLayoutContext` ของ Paces global TopBar.

### 2. SHORTCUT PANEL — 8 tiles (เคาะแล้ว)
กริด `grid-cols-4 gap-3` (mobile + tablet เท่ากัน 4-col). แต่ละ tile = icon chip 56px (`w-14 h-14 rounded-2xl`) + label 12px + `next/link`:

| # | label | route | badge/หมายเหตุ | tabler icon |
|---|-------|-------|----------------|-------------|
| 1 | คำสั่งซื้อ | `/orders` | badge = pending count (มุมไอคอน) | `shopping-cart` |
| 2 | สินค้า | `/products` | — | `package` |
| 3 | รีวิว | `/reviews` | — | `star` |
| 4 | เติมเงิน | `/wallet` | — | `wallet` |
| 5 | เช็ก Blacklist | *TBD (ดู feasibility)* | **feature ใหม่ — อาจยังไม่มีหน้า** | `shield-x` |
| 6 | ความสำเร็จ | `/badges` | — | `trophy` |
| 7 | **ลูกค้า** ← tile 8 เคาะแล้ว | `/customers` | — | `users` |
| 8 | ตั้งค่า | `/shop` | — | `settings` |

### 3. MINI BANNER — ข่าว/โปรโมจาก Deep (เคาะแล้ว)
แถบการ์ดแนวนอน border-left accent: icon + หัวข้อ "DEEP แนะนำ"/"ข่าวสาร" + ข้อความ + chevron → ลิงก์.
**เนื้อหา = ข่าว/โปรโมจาก Deep ที่ admin จัดการได้** (ไม่ใช่ nudge อัตโนมัติ).
→ **Feasibility:** ต้องมีแหล่งเนื้อหา admin-managed = **model ใหม่ (เช่น `Promo`/`Announcement`) + admin CRUD page**. MVP ทางเลือก: (ก) static 1 อันก่อน, (ข) ตาราง promo ง่าย ๆ + admin page. planner ตัดสิน scope.

### 4. ORDER STATUS TIMELINE
การ์ดเดียว แถวแนวนอน 4 สถานะ คั่นด้วย chevron: icon วงกลม + ตัวเลขนับ + label.
สถานะ (ยึด enum จริงใน schema — planner/dev ยืนยัน): รอดำเนินการ · จัดส่งแล้ว · สำเร็จ · ยกเลิก.
data = `groupBy status` ของ order ในร้าน (count). ตัวเลข 0 ได้ ไม่ซ่อน.

### 5. RECENT ACTIVITY FEED
การ์ดเดียว vertical timeline (เส้น + node ไอคอน) แต่ละ item = ไอคอนตามชนิด + ข้อความไทย + เวลา relative ("5 นาทีที่แล้ว"). ท้ายมี "ดูทั้งหมด".
ชนิดเหตุการณ์ (รวมทุกอย่างเป็น timeline เดียว): สร้างคำสั่งซื้อ · ผู้ซื้อยืนยันคำสั่งซื้อ · ส่ง SMS ลิงก์ออเดอร์ · ได้รับรีวิว · เติมเครดิต SMS · (ขยายได้)
→ **Feasibility:** **ไม่มี activity-log table**. ต้อง aggregate: union recent rows จาก `Order` (created/confirmed), `WalletTransaction` (topup), `Review` (created), sms-send log → sort by time → take N. งาน backend ปานกลาง (service ใหม่ `getRecentActivity(shopId, take)`). planner กำหนด.

### 6. FAB SPEED-DIAL (คงจาก V2)
`'use client'` `CreateFab` มุมขวาล่าง `fixed right-5 bottom-6 z-30`. main FAB 60px น้ำเงิน. open → backdrop dim + 3 ปุ่ม: สร้างออเดอร์(`/orders/new`), สร้างสินค้า(`/products/new-v2`*), สร้างหมวดหมู่(`/categories`*). ปิดด้วย ×/backdrop/ESC. a11y: aria-expanded + focus trap. (*route ยืนยันกับ planner)

## Data — `CommandCenterData` (V3 ขยายจาก V2)

```ts
type CommandCenterData = {
  shopName: string
  pendingOrderCount: number          // badge tile คำสั่งซื้อ
  orderStatusCounts: Record<OrderStatus, number>  // §4 timeline
  recentActivity: ActivityItem[]     // §5 feed (service ใหม่)
  promoBanner: PromoBanner | null    // §3 (admin-managed; null = ซ่อน banner)
  // walletBalance ฯลฯ เอาออกจาก hero (V3 ไม่มี hero tile แล้ว) — เหลือเฉพาะที่ใช้
}
type ActivityItem = { type: 'ORDER_CREATED'|'ORDER_CONFIRMED'|'SMS_SENT'|'REVIEW_RECEIVED'|'TOPUP'; label: string; at: Date; href?: string }
```
- count ส่วนใหญ่ = service read-only (ไม่แตะ schema)
- `recentActivity` + `promoBanner` = งานใหม่ (ดู feasibility §3, §5) — **อาจต้อง safepay-database** ถ้าทำ Promo model

## Error Handling
- badge/count query พลาด → tile/section แสดงโครงเฉย ๆ ไม่ throw ไม่ block
- `promoBanner = null` → ซ่อนทั้ง section (ไม่เว้นช่องว่าง)
- `recentActivity = []` → แสดง empty state "ยังไม่มีกิจกรรม"

## Accessibility & Touch
- ทุก tile/FAB ≥44px; FAB focus trap + ESC + backdrop ปิด; Anuphan; contrast ผ่าน

## Tablet (768–1024px)
- เห็น command center เหมือน mobile (≤1024px = `lg:hidden`); shortcut ยัง 4-col; ไม่มี sidebar (offcanvas) → command center คือ navigation หลัก

## Out of Scope / Deferred
- bottom-nav bar, PWA/manifest, desktop dashboard (ไม่แตะ)
- redesign หน้าปลายทาง (orders/products list) = งาน responsive-fix แยก (S-3/S-4/S-5)
- global FAB ทุกหน้า (FAB อยู่เฉพาะ command center home)
- **เช็ก Blacklist** = อาจเป็น feature ใหม่ทั้งก้อน → ถ้าใหญ่เกิน ให้แยก phase (tile แสดงไว้ แต่ link/หน้าอาจ Phase 2)

## Theme Sourcing
mapping เดิม (จาก safepay-ux รอบ V2) อยู่ใน agent transcript — **อิง V2 ต้อง refresh ให้ตรง V3**. หลัก ๆ ที่ re-use ได้:
- CommandTile/grid ← `theme/paces/.../dashboard/ecommerce/components/StatisticCard.tsx`
- banner/card shell ← `UserCard.tsx`
- FAB ← `theme/paces/.../ui/buttons/page.tsx` (btn-icon rounded-full) + `MenuToggler.tsx` + `Customizer/index.tsx` (fixed overlay)
- timeline/activity ← หา Paces "activity/timeline" widget (safepay-ux รอบใหม่ระบุ)
- order-status stepper ← หา Paces stepper/stat-row
- Icon wrapper ← `src/components/wrappers/Icon.tsx` (มีแล้ว)
ทุก commit UI ต้องมี `Base:` line.

## Next Steps (session ใหม่เริ่มตรงนี้)
1. **planner feasibility pass** — เคาะ 3 จุด: (a) Blacklist มี/ไม่มีใน codebase → scope หรือ defer, (b) activity feed = service aggregate (union) หรือ table ใหม่, (c) Deep promo banner = static / Promo model + admin CRUD
2. **safepay-ux refresh** — theme-source mapping + ASCII wireframe ให้ตรง V3 (5 section ใหม่)
3. แตก task ตาม agent-team (S-7..S-13 ใน scope baseline) → developer → reviewer → QA (port 4000)
4. ยังเหลือ responsive-fix Batch 2 เดิม (S-3/S-4/S-5/S-6) ที่ยังไม่ทำ — ตัดสินว่าทำคู่หรือหลัง command center
```

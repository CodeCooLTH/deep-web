# แผน Build — Command Center V6 Rebuild

> Branch: `feat/seller-mobile-responsive` | 2026-06-10
> Visual SoT: `docs/mockups/home/command-center-v6.html` (APPROVED 2026-06-10)
> เหตุ rebuild: user ปฏิเสธ V4 ("ดูเก่า/ไม่เข้า theme/spacing เปลือง"). V4 ใช้ blue#2563eb + radius 20px + bg เทา = ไม่ใช่ Deep. v6 อิง DESIGN.md (ม่วง #7367F0, mist #F8F7FA, radius 14, เงาหมึกพลัม)
> ขอบเขต: restructure ตาม v6 — ไม่เพิ่ม feature นอก mockup

---

## 1. สรุปสถานะและเหตุผล Rebuild

| token | V4 (ผิด) | V6 (ถูก) |
|---|---|---|
| accent/CTA | `blue-600` `#2563eb` | `#7367F0` (Confident Violet) |
| bg | `#eef1f6` (Paces) | `#F8F7FA` (Cool Mist) |
| card radius | `rounded-[20px]` | `rounded-[14px]` |
| card shadow | `0 1px 2px…,0 6px 16px…` | `0 2px 8px rgba(47,43,61,.07)` (ink-tinted) |
| order CTA | blue-tint bar | violet solid (white text) |
| shortcut tile | 52px `rounded-2xl` | 46px `rounded-[13px]` |
| tile count | 8 tile `grid-cols-4` | 6 tile `grid-cols-3` (คำสั่งซื้อ/สินค้า ย้าย→bottom nav) |
| bottom nav | ไม่มี (FAB ลอย) | 5-slot fixed nav + raised center create |
| top bar | card rounded-20 + Paces bg | flat บน mist (~58px) |

---

## 2. Feasibility

### 2.1 Bottom Nav render location → `(dashboard)/layout.tsx` (เหมือน SellerMobileHeader)
- `VerticalLayout.tsx` มี `topbarSlot` แล้ว → เพิ่ม `bottomNavSlot?: ReactNode` (optional, admin ไม่ส่ง=ไม่กระทบ), render ครอบ `lg:hidden`
- ขึ้นทุกหน้า seller mobile (ไม่ใช่แค่ /dashboard) — สอดคล้อง v6 ที่ tab เชื่อมทุก section
- `'use client'` + `usePathname()` สำหรับ active state. PII: รับแค่ `pendingCount: number`

### 2.2 CreateFab → center button
- ย้าย trigger speed-dial (useState/ESC/backdrop/3 pills) เข้า center button ของ bottom nav. ลบ `CreateFab.tsx`

### 2.3 Tab routes (verified จาก filesystem, short path ไม่มี /seller prefix)
| Tab | icon | route |
|---|---|---|
| หน้าหลัก | home-2 | /dashboard |
| คำสั่งซื้อ | clipboard-list | /orders |
| [+]สร้าง | plus | (speed-dial) |
| สินค้า | box | /products |
| ร้านค้า | building-store | /shop |

### 2.4 Active state: `pathname === href || pathname.startsWith(href+'/')`; /dashboard exact-only
### 2.5 Content padding-bottom: ลบ `pb-28` จาก CommandCenter → CSS global `.seller-mobile-shell .page-content main { padding-bottom: calc(5rem + env(safe-area-inset-bottom)) }` @media <1023
### 2.6 Safe area: bottom nav `pb-[env(safe-area-inset-bottom)]`; `viewport-fit=cover` มีใน meta แล้ว
### 2.7 Top bar flat: IdentityBar ลบ card wrapper → flex row บน mist solid (กัน scroll bleed)

---

## 3. Task Breakdown (atomic, 1 task = 1 commit)

| # | target | scope | unit | dep |
|---|---|---|---|---|
| **T1a** | `src/layouts/VerticalLayout.tsx` | เพิ่ม `bottomNavSlot?: ReactNode` optional; render ครอบ `lg:hidden` (pattern เดียวกับ topbarSlot) | U1 | foundation |
| **T1b** | `src/assets/css/safepay-overrides.css` | เพิ่ม `padding-bottom: calc(5rem + env(safe-area-inset-bottom)) !important` ใน `.seller-mobile-shell .page-content main` @media <1023 | U1 | — |
| **T2** | `dashboard/_constants/command-center.ts` | SHORTCUT_TILES 8→6 (ตัด คำสั่งซื้อ/สินค้า); ลำดับ ลูกค้า/เติมเงิน/รีวิว/ความสำเร็จ/ตั้งค่า/Blacklist(disabled); color V6 | U2 | independent |
| **T3a** | `_shared/IdentityBar.tsx` | ลบ card `bg-white rounded-[20px]` → flat บน mist; avatar ring V6 | U3 | independent |
| **T3b** | `_shared/SellerMobileHeader.tsx` | sub-page mode bg #eef1f6→mist; ลบ card wrapper | U3 | independent |
| **T4** | `dashboard/components/OrderStatusTimeline.tsx` | violet solid CTA `bg-[#7367F0]` + 3-stat inline ใต้ divider; card V6 radius/shadow | U4 | independent |
| **T5** | `dashboard/components/ShortcutPanel.tsx` | อ่าน 6 tile; `grid-cols-3`; tile-box 46px `rounded-[13px]` `bg-[#F2F1F6]`; เติมเงิน=green; card V6 | U5 | รอ T2 |
| **T6** | `dashboard/components/RecentActivityFeed.tsx` | node 26→28px; tint V6 (amber/green/cyan/violet); card V6 | U6 | independent |
| **T7** | `_shared/SellerBottomNav.tsx` (ใหม่) | 5-slot fixed nav 64px+safe-area; raised center create 54px violet `top:-26px` + speed-dial; usePathname active; pendingCount badge | U7 | independent (wire รอ T1) |
| **T8** | `(dashboard)/layout.tsx` | เพิ่ม `getOrderStatusCounts(shop.id)` try/catch; ส่ง `bottomNavSlot={<SellerBottomNav pendingCount={…}/>}` | U8 | รอ T1+T7 |
| **T9** | `dashboard/components/CommandCenter.tsx` | ลบ `<CreateFab/>` + `pb-28` + `<MiniBanner>`; ลำดับ OrderStatus→Shortcuts→Activity | U9 | รอ T4+T5+T6+T8 |
| **T10** | ลบ `dashboard/components/CreateFab.tsx` | grep 0 import ก่อนลบ | U9 | bundle T9 |

---

## 4. Theme Source Mapping

| # | Base: |
|---|---|
| T1a | `theme/paces/Admin/TS/src/layouts/VerticalLayout.tsx` (carry over) |
| T1b/T2/T8 | N/A (no UI / constants / RSC wire) |
| T3a/T3b | `theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx` (carry over) |
| T4 | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx` (carry over) |
| T5 | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` (carry over) |
| T6 | `theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx` (carry over) |
| **T7** | **multi-source (compose-from-primitive exception):** `theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx` (nav tab) + `theme/paces/Admin/TS/src/layouts/components/Customizer/index.tsx` (fixed overlay/speed-dial) — Paces ไม่มี bottom nav ตรง; ระบุ 2 ไฟล์ใน commit body |
| T9 | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx` (carry over) |

---

## 5. Sequencing

```
T1 (foundation: prop + CSS)
  → Batch A parallel: T2 + T3 + T4
  → Batch B parallel: T5 (รอ T2) + T6 + T7
  → T8 (รอ T1+T7) wire layout
  → T9+T10 (รอ T4+T5+T6+T8) CommandCenter cleanup + ลบ CreateFab
  → Reviewer ทุก task → QA L2 @360/768/1024 → QA L3 walk → Retro
```

---

## 6. QA Checklist (เทียบ v6)

**L1 per-task:** tsc 0 + grep token (violet/mist/radius-14/grid-cols-3/6-tile/usePathname)

**L2 integration @360/768/1024:**
- [ ] @360 no h-scroll; bottom nav 5-slot + raised center โผล่
- [ ] center button → backdrop + 3 pills (ออเดอร์/สินค้า/หมวดหมู่)
- [ ] content ไม่ถูก nav ทับ (padding-bottom พอ + safe-area)
- [ ] @1024 desktop widgets ปกติ, bottom nav + IdentityBar ไม่โผล่
- [ ] token: violet CTA+center (ไม่ใช่ blue), bg mist (ไม่ใช่ #eef1f6), card radius-14 shadow ink
- [ ] 6 tile 3×2 (ลูกค้า/เติมเงิน/รีวิว/ความสำเร็จ/ตั้งค่า/Blacklist-disabled); เติมเงิน green; Blacklist opacity-40
- [ ] topbar flat + avatar ring + "Deep Classic"+check เขียว + bell dot
- [ ] order CTA "รอคุณดำเนินการ N รายการ" คลิก→/orders
- [ ] active state: /dashboard→หน้าหลัก, /orders→คำสั่งซื้อ
- [ ] badge pending บน tab คำสั่งซื้อ
- [ ] Anuphan ทุก element; touch ≥44px; PII masked (activity ไม่โชว์ raw phone)
- [ ] desktop ≥1024 ไม่ regress (UserCard/StatCards/SalesReport/RecentOrder ครบ)

---

## 7. Data Flow

```
layout.tsx (RSC)
  ├── session → shop.id, shopName, logo
  ├── getOrderStatusCounts(shop.id) → pendingCount  [เพิ่ม, try/catch fallback 0]
  ├── getTierLabel(trustScore) → tierName
  ├── SellerMobileHeader (topbarSlot) → IdentityBar (flat on mist)
  └── SellerBottomNav (bottomNavSlot) → usePathname active + speed-dial  [ใหม่]
dashboard/page.tsx (RSC, ไม่เปลี่ยน data)
  └── CommandCenter (lg:hidden) → OrderStatus(violet CTA) → Shortcuts(6) → Activity
```

ไม่แตะ schema, ไม่มี API route ใหม่, ไม่ dispatch safepay-database.

---

## 8. Risk / Gap Flags

- **R1 (สำคัญ):** Paces ไม่มี bottom nav template → T7 multi-source Base: (compose-from-primitive exception, flag ใน commit)
- **R2:** double `getOrderStatusCounts` (layout+page) — acceptable MVP; Phase 2 cache ด้วย React `cache()`
- **R3:** safe-area — ใช้ `calc(5rem + env(safe-area-inset-bottom))` ไม่ใช่ fixed 5rem
- **R4:** IdentityBar flat — `<header>` ต้อง solid `bg-[#F8F7FA]` กัน scroll bleed
- **R5:** ลบ CreateFab — grep `CreateFab` ทุกไฟล์ก่อนลบ
- **R6:** MiniBanner — ไม่ลบไฟล์ (Phase 2) แค่ไม่ render ใน CommandCenter; PROMO_BANNER คง null

---

## 9. Convention / Guardrails

- Paces no-MUI; Tailwind arbitrary เท่านั้น; Anuphan; sentence-case ไทย; short path
- Base: line ทุก UI commit (T7 = multi-source)
- RSC PII: bottom nav client ใช้ usePathname แต่ไม่ดึง raw PII
- **ห้าม developer commit เอง** — Controller commit (บทเรียน: dev ชอบ commit เอง ต้อง soft-reset re-gate)
- Icon wrapper เติม `tabler:` เอง — ส่ง icon name ไม่มี prefix
- ไม่เพิ่ม scope เกิน v6 baseline

## 10. Out of Scope
notifications จริง (bell dot คงที่), Blacklist feature, promo banner (Phase 2), redesign orders/products list pages

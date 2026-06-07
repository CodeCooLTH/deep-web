# แผน Implementation — Seller Mobile Shell

> Branch: `feat/seller-mobile-responsive` | 2026-06-07
> เป้าหมาย (user เคาะ): mobile (<lg 1024px) ของ seller — ไม่มี sidebar/hamburger, topbar เดียวทุกหน้า, fix padding dead-zone
> nav model: dashboard = hub (8 tiles) → tap → sub-page → back กลับ home

## Root cause (เช็คแล้ว)
- breakpoint 3 ชุดไม่ตรงกัน: JS resize (`useLayoutContext`) ≤768=offcanvas, **769-1140=condensed (margin ค้าง)**, vs command center/header <1024 (lg). → **dead zone 769-1023px** padding เพี้ยน
- double padding: `.page-content main { px-5 }` + section `px-4`
- topbar ไม่ครบทุกหน้า เพราะ CommandTopBar อยู่ page-level (ใน CommandCenter) ไม่ใช่ layout

## กลยุทธ์: CSS-only scoped (ไม่แตะ JS resize)
ใช้ marker class `.seller-mobile-shell` ที่ `.wrapper` ของ VerticalLayout (เฉพาะ seller) + `@media (max-width:1023px)` override → breakpoint เส้นเดียว = lg, SSR-safe, ไม่ regress buyer/admin (เพราะ scoped). ไม่แก้ JS resize global.

## Tasks (atomic, agent-team)

### T1 — IdentityBar extraction + route→title helper
- refactor `CommandTopBar.tsx` → `_shared/IdentityBar.tsx` (ลบ hamburger slot; props shopName/avatarUrl/tierName)
- create `_shared/getSellerPageTitle.ts` — flatten `_seller-menu` sellerMenuItems → longest-prefix match (ไม่ hardcode title; detail route → parent label)
- Base: theme/paces/.../TopBar/components/MenuToggler.tsx (IdentityBar carry จาก CommandTopBar)

### T2 — SellerMobileHeader (client, depends T1)
- create `_shared/SellerMobileHeader.tsx` — `usePathname()`: `/dashboard`=identity mode (IdentityBar), อื่น=back+title mode
- back: `history.length>1 ? router.back() : router.push('/dashboard')` (deep-link safe)
- bell คงสไตล์เดิมทั้ง 2 mode

### T3 — Wire layout + marker (depends T2)
- `VerticalLayout.tsx`: เพิ่ม prop `shellClassName?` (ใส่ที่ .wrapper) + `topbarSlot?: ReactNode` (render หลัง TopBar, **นอก** page-content main, sticky lg:hidden) — optional ไม่กระทบ admin
- `layout.tsx` (seller): ขยาย shop query (shopName, logo) + tierName=getTierLabel(trustScore); ส่ง shellClassName='seller-mobile-shell' + topbarSlot=`<SellerMobileHeader .../>`

### T4 — CSS shell + padding (ขนาน T2/T3, ประสาน marker naming)
- `safepay-overrides.css` `@media (max-width:1023px)` scoped `.seller-mobile-shell`:
  - `.app-menu { display:none !important }` (ซ่อน sidebar)
  - `.page-content { margin-inline-start:0 !important }` (เอา margin)
  - `.app-header { display:none !important }` (ซ่อน Paces header ทุกหน้า — แทน HideAppHeaderMobile hack)
  - `.page-content main { padding-inline:1rem }` (16px สม่ำเสมอทุกหน้า; desktop ≥lg คง px-5)
- ตรวจ line 75 rule เดิม (`main padding-right:0`) ไม่ขัด

### T5 — ถอด hack + ปรับ sections (depends T3, T4)
- `CommandCenter.tsx`: ลบ render `HideAppHeaderMobile` + `CommandTopBar` (header ขึ้น layout แล้ว); เหลือ body
- delete `HideAppHeaderMobile.tsx`; delete `CommandTopBar.tsx` (แตกเป็น IdentityBar แล้ว)
- `dashboard/page.tsx` + `command-center.ts`: เอา field topbar (shopName/avatarUrl/tierName) ออกจาก CommandCenterData ถ้า body ไม่ใช้ (tier ใช้แค่ topbar → ลบได้)
- `ShortcutPanel/MiniBanner/OrderStatusTimeline/RecentActivityFeed`: ถอด `px-4` (พึ่ง main padding 16px)

### T6 — QA
Chrome DevTools MCP @ seller.deepth.local:4000 (port 4000), widths 360/768/1023/1024/1280:
- mobile: ไม่มี sidebar/hamburger/app-header, `.page-content` margin-inline-start=0 (โดยเฉพาะ @1023 = จุด dead-zone เดิม), padding เนื้อหา 16px สม่ำเสมอ, SellerMobileHeader ทุกหน้า, dashboard=identity, sub-page=back+title (ตรง menu label), tap tile→sub→back→/dashboard, deep-link back→/dashboard, detail route title=parent
- desktop ≥1024: sidebar+app-header กลับมา, header หาย, margin ปกติ, MenuToggler ได้, desktop widgets ครบ — **ไม่ regress**
- buyer/admin ไม่กระทบ (CSS scoped)

## Convention
Paces no-MUI, Base: line, Anuphan, short path, RSC PII (layout ส่ง serializable), tier ใช้ getTierLabel SSOT (ห้าม hardcode), VerticalLayout prop optional (admin ไม่กระทบ)

## ความเสี่ยง
- VerticalLayout shared admin → prop ต้อง optional default-safe
- `!important` ชนะ html[data-sidenav-size] specificity
- sub-page บางหน้าคาด px-5 → QA ทุก sub-page
- back history-guard กรณี deep-link

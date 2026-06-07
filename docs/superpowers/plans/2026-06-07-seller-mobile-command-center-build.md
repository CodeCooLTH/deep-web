# แผน Implementation — Seller Mobile Command Center V3

> วันที่: 2026-06-07
> Branch: `feat/seller-mobile-responsive`
> Scope IDs: S-7, S-8, S-9, S-10, S-11, S-12, S-13
> สถานะ: ACTIVE — เริ่ม implement (V3 APPROVED visual, feasibility pass เสร็จ)
> อ้างอิง spec: `docs/superpowers/specs/2026-06-07-seller-mobile-command-center-design.md`
> อ้างอิง mockup: `docs/mockups/home/command-center-v3.html`
> อ้างอิง scope: `docs/scope/2026-06-07-seller-mobile-responsive-scope-baseline.md`

---

## 1. Prerequisite Gate (ก่อน T1)

**Gate ก่อน build:** `safepay-ux` ต้อง refresh theme-source mapping ให้ตรง V3 layout ใหม่ทั้ง 5 section (mapping เดิมอิง V2 — outdated). Output = Design Spec อัปเดต + ASCII wireframe ระบุชัดว่าแต่ละ section copy จาก Paces source ไหน + Tailwind class หลัก. Planner ได้ verify path ทุกตัวแล้ว (ดูตาราง §3) — ux refresh นี้เป็น visual/layout decision layer ไม่ใช่ path discovery อีกรอบ.

**ห้าม dispatch developer** จนกว่า ux gate ผ่าน (ป้องกัน retro ปัญหา developer build layout ผิดโครง — retro #33 2026-05-23).

---

## 2. Feasibility Decisions

| # | คำถาม | การตัดสิน | เหตุผล | Defer item |
|---|-------|-----------|--------|-----------|
| Q1 | tile #5 "เช็ก Blacklist" — มี feature ใน codebase ไหม | **DEFER** — render tile แบบ disabled "เร็ว ๆ นี้" ไม่มี href | grep ทั้ง repo = 0 ไฟล์/model/route ที่เกี่ยวกับ blacklist; feature ใหม่ทั้งก้อน ต้องผ่าน product → design → database → developer เต็มรูป; ไม่ใช่ scope phase นี้ | Phase 2: Blacklist feature — model + admin CRUD + seller check page + tile link |
| Q2 | Recent Activity (S-12) — ต้องสร้าง table ใหม่ไหม | **BUILD** service aggregate — `getRecentActivity(shopId, take)` UNION 4 source, ไม่สร้าง table | ทุก source มี service + createdAt + shopId reachability: Order(`getOrdersByShop`), Review(`getReviewsByShopUser`), WalletTransaction(`getTransactions` type=TOPUP), SmsCode(prisma direct). normalize → ActivityItem. mask PII (buyerPhone) ที่ service ก่อนคืน | Phase 2: ActivityLog table เมื่อ source เพิ่มมากขึ้น |
| Q3 | Mini Banner (S-10) — static หรือ Promo model | **STATIC STUB เฟสนี้** — prop `promoBanner: PromoBanner\|null`, null=ซ่อน; ค่าจาก `_constants/command-center.ts` hardcode | Promo model ต้องการ safepay-database + admin CRUD page = งานใหญ่แยก phase; phase นี้โฟกัส command center shell และ real data sections | Phase 2: Promo model + admin CRUD + API; upgrade banner จาก static → dynamic |

---

## 3. Theme-Source Mapping Table (V3 Section → Paces source — path verified)

| V3 Section | Paces source file (verified) | หมายเหตุ |
|-----------|----------------------------------------|---------|
| TOP MENU bar (S-8) | `theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx` | hamburger reuse `showBackdrop()` จาก `src/context/useLayoutContext.tsx` — ต้องเป็น `'use client'` island เล็ก; bell+avatar = Tailwind primitive |
| SHORTCUT tile (S-9) | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` | ใช้ card shell + icon slot; adapt เป็น 4-col grid tile 56px; badge = absolute positioned span |
| MINI BANNER shell (S-10) | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` | ใช้ card shell เหมือน tile แต่ horizontal layout + border-l-4 accent; เนื้อหา static จาก _constants |
| ORDER STATUS timeline (S-11) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx` | adapt จาก vertical timeline → horizontal row 4 status node + chevron separator |
| RECENT ACTIVITY feed (S-12) | `theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx` | vertical timeline เส้น + node icon; ตัด form/post ส่วนบน; เก็บ item structure; ไม่มี image |
| FAB speed-dial (S-13) | `theme/paces/Admin/TS/src/layouts/components/Customizer/index.tsx` | fixed overlay pattern + Paces btn-icon rounded-full; adapt เป็น FAB blue 60px + 3 action items |
| Icon wrapper | `src/components/wrappers/Icon.tsx` | มีแล้ว — auto-prefix tabler:; ใช้ทุก component |

---

## 4. Task Breakdown (T1–T9)

### Gate: safepay-ux Refresh (ก่อน T1)
- **Input:** spec V3 + mockup V3 + mapping table ข้างต้น
- **Output:** Design Spec อัปเดต: ASCII wireframe แต่ละ section, Tailwind class หลัก, spacing, color token
- **Dispatch:** `safepay-ux` (read-only Design Spec — ห้ามแตะโค้ด)

---

### T1 — CommandCenter Shell + breakpoint routing + _constants
**Scope ID:** S-7
**ไฟล์ create/modify:**
- CREATE: `src/app/(paces)/seller/(dashboard)/dashboard/components/CommandCenter.tsx` (RSC)
- CREATE: `src/app/(paces)/seller/(dashboard)/dashboard/_constants/command-center.ts`
- MODIFY: `src/app/(paces)/seller/(dashboard)/dashboard/page.tsx`

**Base theme file (cite ใน commit):** `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx`

**Scope:**
- `dashboard/page.tsx`: fetch data ครั้งเดียว (`orderStatusCounts`, `recentActivity`, `promoBanner`) → render `<div className="lg:hidden"><CommandCenter data={...}/></div>` + wrap existing desktop markup ด้วย `<div className="hidden lg:block">`. ไม่แตะ desktop widget ใด.
- **[UX Q2 resolved] single source:** `pendingOrderCount = orderStatusCounts.PENDING` — ไม่ derive แยกจาก JS filter. ดังนั้น **ย้าย `getOrderStatusCounts(shopId)` มาสร้างใน T1** (service function ใน order.service.ts) เพื่อให้ทั้ง tile badge + timeline ใช้ผลร่วม query เดียว. T5 เหลือแค่สร้าง UI component (consume counts จาก data).
- `CommandCenter.tsx`: RSC shell รับ `CommandCenterData` props, layout stack บนลงล่าง (TOP MENU, SHORTCUT, BANNER, ORDER STATUS, RECENT ACTIVITY) — เป็น slot สำหรับ T2-T8.
- `_constants/command-center.ts`: define `SHORTCUT_TILES` array (8 tile: label/icon/href/color), `PROMO_BANNER` stub `PromoBanner|null`.

**Type definitions (freeze ก่อน T2 ขึ้นไป — shared contract rule):**
```ts
// _constants/command-center.ts
export type PromoBanner = { icon: string; label: string; body: string; href?: string }
export type CommandCenterData = {
  shopName: string
  pendingOrderCount: number
  orderStatusCounts: { PENDING: number; SHIPPED: number; CONFIRMED: number; CANCELLED: number }
  recentActivity: ActivityItem[]
  promoBanner: PromoBanner | null
}
```

**Acceptance:** ที่ ≤1024px เปิด `/dashboard` เจอ `<CommandCenter>` ไม่ flash; ≥1024px เจอ dashboard เดิม (tsc ผ่าน)
**Atomic-commit unit:** Unit A

---

### T2 — TOP MENU bar + hamburger client island
**Scope ID:** S-8
**ไฟล์ create:** CREATE `src/app/(paces)/seller/(dashboard)/dashboard/components/CommandTopBar.tsx` (`'use client'`)
**Base theme file:** `theme/paces/Admin/TS/src/layouts/components/TopBar/components/MenuToggler.tsx`

**Scope:** client island รับ `shopName: string` + `avatarUrl: string|null`. hamburger 44px+ กด `showBackdrop()` จาก `src/context/useLayoutContext.tsx`. bell + badge (hardcode 0 ตอนนี้ — notification Phase 2). avatar img fallback placeholder. sticky top-3 z-10 ตาม mockup.

**หมายเหตุ spec correction:** spec V3 เขียนว่า "static bar ไม่ดึง useLayoutContext" แต่ hamburger ต้องเรียก `showBackdrop()` ซึ่ง export จาก useLayoutContext.tsx (plain function ไม่ใช่ hook) — ถูกต้องที่ต้องเป็น client island.

**Acceptance:** hamburger กด → offcanvas sidebar เปิด (sidenav-enable class ติด html); touch target ≥44px
**Atomic-commit unit:** Unit B (standalone)

---

### T3 — SHORTCUT PANEL 8-tile grid
**Scope ID:** S-9
**ไฟล์ create:** CREATE `src/app/(paces)/seller/(dashboard)/dashboard/components/ShortcutPanel.tsx`
**Base theme file:** `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx`

**Scope:** รับ `pendingOrderCount: number` prop. grid-cols-4 gap-3. 8 tile จาก `SHORTCUT_TILES` constant (T1). tile#1 "คำสั่งซื้อ" badge = pendingOrderCount (ซ่อนถ้า 0). tile#5 "เช็ก Blacklist" = disabled (cursor-not-allowed + opacity-50 + ไม่มี href + title="เร็ว ๆ นี้"). ทุก tile ≥44px touch target. ใช้ `<Link href>` short path ไม่มี `/seller` prefix.

**Routes:** /orders /products /reviews /wallet /badges(="ความสำเร็จ") /customers /shop(="ตั้งค่า"); tile#5 ไม่มี href
**Acceptance:** tile link ถูก route; tile#1 badge แสดง pending count; tile#5 ไม่ navigate; touch ≥44px
**Atomic-commit unit:** Unit C

---

### T4 — MINI BANNER static stub
**Scope ID:** S-10
**ไฟล์ create:** CREATE `src/app/(paces)/seller/(dashboard)/dashboard/components/MiniBanner.tsx`
**Base theme file:** `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx` (card shell)

**Scope:** รับ `banner: PromoBanner|null`. null → return null (ไม่ render ไม่เว้นช่องว่าง). มี → card border-l-4 border-primary flex icon + title + body + chevron → href หรือไม่มี link. เนื้อหา default ใน `_constants/command-center.ts` → PROMO_BANNER = null (ซ่อน) หรือ stub content.

**Acceptance:** PROMO_BANNER=null → section หายไปจาก DOM; มีค่า → แสดง banner card
**Atomic-commit unit:** Unit C (parallel กับ T3 — คนละไฟล์)

---

### T5 — ORDER STATUS timeline + getOrderStatusCounts
**Scope ID:** S-11
**ไฟล์ create/modify:**
- CREATE: `src/app/(paces)/seller/(dashboard)/dashboard/components/OrderStatusTimeline.tsx`
- MODIFY: `src/services/order.service.ts` (เพิ่ม `getOrderStatusCounts`)

**Base theme file:** `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/components/ShippingActivity.tsx`

**Scope:** *(หมายเหตุ: `getOrderStatusCounts` ย้ายไปสร้างใน T1 แล้วตาม UX Q2 — T5 เหลือแค่ UI)*
- `OrderStatusTimeline`: horizontal row 4 node (icon วงกลม + count + label) คั่น chevron. รับ `counts` prop. ตัวเลข 0 แสดง ไม่ซ่อน. icon/color: PENDING=amber/clock, SHIPPED=blue/truck, CONFIRMED=emerald/circle-check, CANCELLED=gray/circle-x. ⚠️ 3-digit count อาจ squeeze @360 → shrink font ถ้าจำเป็น (UX Q1).

**Acceptance:** count ตรงกับ DB `groupBy status`; 4 node ครบ; count=0 แสดง "0" ไม่ซ่อน
**Atomic-commit unit:** Unit D

---

### T6 — getRecentActivity service (backend, TDD)
**Scope ID:** S-12 (backend)
**ไฟล์ create:** CREATE `src/services/activity.service.ts`
**Base theme file:** N/A (no UI)

**Scope:**
```ts
export type ActivityItem = {
  type: 'ORDER_CREATED' | 'ORDER_CONFIRMED' | 'SMS_SENT' | 'REVIEW_RECEIVED' | 'TOPUP'
  label: string  // Thai copy, PII masked
  at: Date
  href?: string  // short path (/orders/[token]) ถ้ามี
}
export async function getRecentActivity(shopId: string, take = 10): Promise<ActivityItem[]>
```
**Implementation:** UNION 4 source (Prisma ไม่รองรับ SQL UNION → query แยกแล้ว merge):
1. `order.findMany({ where:{shopId}, orderBy:{createdAt:'desc'}, take, select:{publicToken,status,createdAt} })` → ORDER_CREATED + ORDER_CONFIRMED
2. `prisma.smsCode.findMany({ where:{order:{shopId}}, orderBy:{createdAt:'desc'}, take, select:{createdAt,buyerPhone} })` → SMS_SENT; **mask buyerPhone** (reuse `maskContact` จาก dashboard/page.tsx)
3. `getReviewsByShopUser` (มีแล้ว) → REVIEW_RECEIVED พร้อม rating
4. `getTransactions(shopId, take)` filter type='TOPUP' → TOPUP

merge → sort `at` desc → slice `take`. wrap try/catch → return [] ถ้า error (ไม่ throw ไม่ block render).

**PII:** buyerPhone ต้อง mask ก่อนใส่ label เสมอ — ห้ามส่ง raw phone เข้า ActivityItem
**Acceptance:** tsc ผ่าน; unit test mapper แต่ละ type; empty shopId → []
**Atomic-commit unit:** Unit E

---

### T7 — RecentActivity UI component
**Scope ID:** S-12 (frontend)
**ไฟล์ create:** CREATE `src/app/(paces)/seller/(dashboard)/dashboard/components/RecentActivityFeed.tsx`
**Base theme file:** `theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/TimeLine.tsx`

**Scope:** รับ `items: ActivityItem[]`. vertical timeline (เส้น + node icon 24px). relative Thai time ด้วย `date-fns` (`formatDistanceToNow` + `th` locale — มีใน deps แล้ว). icon ต่อ type: ORDER_CREATED=shopping-cart-plus, ORDER_CONFIRMED=user-check, SMS_SENT=message-2, REVIEW_RECEIVED=star, TOPUP=coin. empty state "ยังไม่มีกิจกรรม". "ดูทั้งหมด" link → `/orders`.

**Dependency:** ต้อง T6 เสร็จก่อน (type `ActivityItem` มาจาก activity.service.ts)
**Acceptance:** feed sort ถูก; relative time ภาษาไทย ("5 นาทีที่แล้ว"); empty state ถ้า items=[]; PII ไม่โผล่ใน RSC flight
**Atomic-commit unit:** Unit F

---

### T8 — CreateFab speed-dial
**Scope ID:** S-13
**ไฟล์ create:** CREATE `src/app/(paces)/seller/(dashboard)/dashboard/components/CreateFab.tsx` (`'use client'`)
**Base theme file:** `theme/paces/Admin/TS/src/layouts/components/Customizer/index.tsx`

**Scope:** fixed right-5 bottom-6 z-30. main FAB 60px blue rounded-full. กด → setState(open) + backdrop dim. 3 action button stack: สร้างออเดอร์(`/orders/new`), สร้างสินค้า(`/products/new-v2`), สร้างหมวดหมู่(`/categories`). ปิด ×/backdrop click/ESC keydown. a11y: `aria-expanded`, `aria-label` ทุกปุ่ม, focus trap, ≥44px touch. short path ไม่มี /seller prefix.

**Routes ยืนยันแล้ว:** `/orders/new` = `(paces)/seller/(fullscreen)/orders/new/page.tsx`; `/products/new-v2` = `(paces)/seller/(fullscreen)/products/new-v2/page.tsx`; `/categories` = `(paces)/seller/(dashboard)/categories/`
**Acceptance:** FAB กด → 3 ปุ่ม + backdrop; ปิด ×/backdrop/ESC; route ถูก; touch ≥44px; aria-expanded toggle
**Atomic-commit unit:** Unit G (parallel กับ Unit F)

---

### T9 — Polish + a11y sweep
**Scope ID:** S-7 (final acceptance)
**ไฟล์ modify:** ทุก component T1-T8 ที่ยังมีช่องโหว่

**Scope:** ≥44px ทุก touch target; Anuphan font (ไม่ hardcode font อื่น); no horizontal scroll @360px; no flash ตอน paint แรก; focus visible outline; contrast pass. แก้ตาม findings ของ reviewer gate T1-T8.
**Atomic-commit unit:** Unit H

---

## 5. Sequencing + Batch Grouping

### Command Center (S-7..S-13) — ทำก่อน

```
Gate: safepay-ux refresh (docs only)
     ↓
T1 CommandCenter shell + _constants + page.tsx breakpoint   [Unit A]
     ↓ (T1 freeze type CommandCenterData)
Batch 1 (parallel ≤3): T2 TopMenu[B]  T3 Shortcut[C]  T4 MiniBanner[C]
     ↓
T5 OrderStatus timeline + getOrderStatusCounts [D]
T6 activity.service getRecentActivity + mask PII [E]   ← parallel กับ T5
     ↓
Batch 2 (parallel ≤3): T7 RecentActivityFeed[F] (depend T6)  T8 CreateFab[G]
     ↓
T9 Polish + a11y sweep [H]
```

**parallelism:** T3+T4 (คนละไฟล์, props จาก frozen CommandCenterData); T5+T6 (order.service vs new activity.service — ไม่ shared file); T7+T8 (T8 independent).

### Batch 2: Responsive Fix (S-3..S-6) — ทำหลัง Command Center sign-off (ไม่สลับ)

| ID | งาน | ไฟล์ | หมายเหตุ |
|----|-----|------|---------|
| S-3 | DataTable horizontal scroll | `src/components/DataTable.tsx` + CSS | min-width; ทดสอบ Products/Customers/Wallet/TopUp |
| S-4 | OrderCard mobile-friendly | `(paces)/seller/(dashboard)/orders/components/OrderCard*.tsx` | header wrap; buttons ≥44px |
| S-5 | OrdersList toolbar wrap | `(paces)/seller/(dashboard)/orders/components/OrdersList.tsx` | search+selects wrap; ปุ่มสร้างไม่ overflow |
| S-6 | dashboard StatCard 2-col md | `dashboard/page.tsx` | ตรวจ `md:grid-cols-2` computed จริงก่อน; อาจ no-op |

---

## 6. Technical Design

### Data Flow
```
SellerDashboardPage (RSC, page.tsx)
  ├── getServerSession() → user.id
  ├── prisma.shop.findUnique(userId) → shopId, shopName
  ├── getOrdersByShop(shopId) → reuse → pendingOrderCount = filter(PENDING).length
  ├── getOrderStatusCounts(shopId) [NEW] → orderStatusCounts
  ├── getRecentActivity(shopId, 8) [NEW] → recentActivity (masked)
  └── promoBanner = _constants PROMO_BANNER (static)
       ↓
<div className="lg:hidden"><CommandCenter data={...}>
   CommandTopBar(client) / ShortcutPanel / MiniBanner / OrderStatusTimeline / RecentActivityFeed / CreateFab(client)
</div>
<div className="hidden lg:block"> ...desktop เดิม (ไม่แตะ)... </div>
```

### Auth/Permission
- ทุก fetch อยู่ใน `SellerDashboardPage` ภายใต้ DashboardLayout (ตรวจ session + redirect แล้ว)
- shopId resolve จาก `prisma.shop.findUnique({ where:{ userId: session.user.id } })` — ไม่รับจาก user input (กัน IDOR)
- SmsCode query ต้อง `where:{ order:{ shopId } }` — scoped ด้วย shopId

### Database Impact
ไม่มี schema change. `getOrderStatusCounts` = `prisma.order.groupBy` (shopId index มีแล้ว). ไม่ต้อง safepay-database.

### Error Handling
- `getOrderStatusCounts` throw → page try/catch → ส่ง 0 ทุก status (timeline แสดง 0)
- `getRecentActivity` → service try/catch → [] → feed empty state
- `promoBanner=null` → MiniBanner return null → ไม่มี DOM node

### Risks
| ความเสี่ยง | ระดับ | mitigation |
|-----------|-------|-----------|
| RSC flight PII leak (raw phone ใน ActivityItem) | HIGH | mask ที่ service ก่อน return; reviewer ตรวจ RSC payload network |
| getRecentActivity ช้า (4 queries) | MEDIUM | take limit (10); Promise.all ถ้า profiling บอกช้า; accept MVP |
| showBackdrop import break ถ้า Paces refactor | LOW | plain function stable; fallback copy function ใน CommandTopBar |
| T3+T4 parallel edit _constants | LOW | T1 freeze _constants ก่อน → T3/T4 read-only |

---

## 7. QA Approach

**เครื่องมือ:** Chrome DevTools MCP @ `seller.deepth.local:4000` (user รัน dev server เอง ห้าม start)
**Viewport:** 360 / 768 / 1024 (lg boundary) / 1280

- **Per-task smoke:** navigate `/dashboard`; take_snapshot; ยืนยัน section ที่เพิ่งทำใน DOM; `list_console_messages` 0 errors
- **Batch integration (หลัง T5+T6):** 360px เห็น 5 section ครบ; 1280px เห็น desktop, CommandCenter ซ่อน; hamburger เปิด sidebar; network RSC payload ไม่มี raw phone; tile#5 ไม่ navigate, tile#1 → /orders
- **End-of-phase (T9):** 360px no h-scroll (`body.scrollWidth===clientWidth`); 768 command center; 1024+ desktop; FAB เปิด/ปิด ×/ESC/backdrop + tab trap; touch ≥44px audit; PII RSC check
- **screenshots path:** `docs/qa-screenshots/` (ห้าม repo root)

---

## 8. Conventions Recap (developer prompt ต้องระบุ)

1. **Paces stack: no MUI** — Preline 4 + Tailwind 4; `className` ไม่ใช่ `sx`; ห้าม import `@mui/*`
2. **Base: line ใน commit** — ทุก commit แตะ UI ต้องมี `Base: theme/paces/...` (Hard Rule 3)
3. **RSC PII neutralize-at-source** — mask/null raw contact/phone ก่อน RSC boundary; ห้าม rely client-side hide
4. **Font Anuphan เท่านั้น** — ห้าม hardcode font อื่น (Hard Rule 5)
5. **Short path ไม่มี /seller prefix** — `<Link>`, `router.push`, `redirect()` ใน `(paces)/seller/**` ใช้ `/orders`, `/products`, ...
6. **Client island เล็ก** — RSC default; `'use client'` เฉพาะ CommandTopBar, CreateFab
7. **No force-dynamic** — Paces route ไม่ใช้ `export const dynamic = 'force-dynamic'`
8. **ไม่แตะ desktop dashboard** — block `hidden lg:block` ห้าม modify

---

## 9. Backlog / Deferred (ไม่นับ GAP phase นี้)

| Item | เหตุผล defer | Phase |
|------|-------------|-------|
| Blacklist feature (model, admin CRUD, seller check page, tile#5 link) | 0 codebase; feature ใหม่ทั้งก้อน | Phase 2 |
| Promo model + admin CRUD + dynamic banner | ต้อง safepay-database + admin page ใหม่ | Phase 2 |
| Notification bell badge (real count) | ไม่มี notification system ใน schema | Phase 2 |
| ActivityLog table (persistent event store) | aggregate พอสำหรับ MVP | Phase 2+ |
| "ดูทั้งหมด" activity page | ไม่มี route; Phase 1 fallback → /orders | Phase 2 |

---

## 10. Change Log

| วันที่ | การเปลี่ยน | เหตุผล | อนุมัติ |
|--------|-----------|--------|--------|
| 2026-06-07 | เพิ่ม T1-T9 + `getOrderStatusCounts` + `getRecentActivity` | feasibility pass เคาะ build vs defer | Planner |
| 2026-06-07 | Blacklist defer → "เร็ว ๆ นี้" tile | 0 codebase | Planner (Q1) |
| 2026-06-07 | Promo banner = static stub | Promo model+admin = scope ใหญ่แยก | Planner (Q3) |

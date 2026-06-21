# Seller Command Center v10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **โปรเจกต์นี้ใช้ agent-team workflow (Hard Rule 4)** — Controller = main session, dispatch `safepay-developer` ต่อ task → `safepay-reviewer` (8-gate) → `safepay-qa` (Chrome DevTools MCP). ดู `docs/conventions/agent-team-workflow.md`.

**Goal:** Rebuild seller mobile Command Center 4 หน้า (`/dashboard`, `/notifications`, `/orders`, `/products`) ให้ premium + actionable + flat Paces ด้วย Solar Duotone icon, compact hero, carousel shortcut, real data — ไม่สร้าง model ใหม่

**Architecture:** component ใหม่ทั้งหมดใน `dashboard/components/`; `CommandCenter.tsx` = RSC orchestrator; `CompactHero` แทน SellerHeader+WalletCard; `CarouselGrid` client scroll-snap; orders/products = re-skin mobile header เท่านั้น (ไม่แตะ desktop table/action logic); notifications = real data จาก `getRecentActivity`

**Tech Stack:** Next.js 16 App Router · TS strict · Paces (Preline 4 + Tailwind 4) · `@iconify/react` (`solar:*-bold-duotone`) · services เดิม · ห้ามเพิ่ม library

**Design SoT:** `docs/superpowers/specs/2026-06-21-seller-command-center-v10-design.md` + mockup `...-v10-mockup.html`

## Global Constraints
1. Paces primitive เท่านั้น (HR7) — arbitrary ต้องมี comment. อนุมัติแล้ว: SVG hero bg+overlay, trust ring SVG, carousel `[&::-webkit-scrollbar]:hidden`+`scroll-snap-*`, edge-to-edge negative gutter, raised FAB/safe-area
2. สี `bg-primary` #236dc9 — ห้ามม่วง #7367F0 / hardcode hex
3. Icon = Solar Duotone `<Icon icon="solar:XXX-bold-duotone" />` from `@iconify/react` (`-linear` สำหรับ utility) — ห้าม Tabler webfont ใน CC
4. Anuphan; ห้าม font-mono บนข้อความไทย
5. Toast = `pacesToast` (ห้าม react-toastify ใน (paces))
6. ห้าม `component={Link}` ใน server component
7. วันที่ = `formatDate`/`formatDateTime` from `src/lib/format-date.ts`
8. ทุก commit UI มี `Base:` line
9. short path ห้าม `/seller` prefix ใน nav/redirect
10. ข้อมูลจริงเท่านั้น — honest-zero/empty-state ตาม spec §12

---

> **หมายเหตุ:** รายละเอียดเต็ม (File Structure, Theme Source Mapping table, Tasks T1–T10 พร้อม Files/Interfaces/Steps/atomic-commit/QA, Sequencing+Batch, Data flow, Risk log, Pre-dispatch checklist) — ดูฉบับเต็มจาก safepay-planner ด้านล่าง

## File Structure (สรุป)

**Create:** `CompactHero.tsx`, `ShopLinkButtons.tsx`, `CarouselGrid.tsx`, `OrderStatusBand.tsx`, `ActivityTimeline.tsx` (ใน `dashboard/components/`) + `notifications/components/NotificationFeed.tsx`
**Modify:** `dashboard/_constants/command-center.ts`, `dashboard/components/CommandCenter.tsx`, `dashboard/page.tsx`, `notifications/page.tsx`, `orders/components/OrdersList.tsx`, `products/components/ProductsListing.tsx`
**Deprecate (ไม่ลบทันที):** SellerHeader, WalletCard, ShortcutGrid, OrderStatusRow, RecentActivityFeed, NotificationTimeline, notification-data.ts

## Theme Source Mapping

| Element | Theme source | Paces primitive |
|---|---|---|
| CompactHero shell | `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/UserCard.tsx` | `.card`+`card-body`+`bg-light/50` |
| SVG hero bg / overlay / trust ring | ไม่มี token — arbitrary (approved) | inline SVG + comment |
| เติมเงิน pill / shop link btn | `theme/.../ui/buttons/page.tsx` | `btn btn-sm` / icon btn |
| Stats row | `theme/.../ecommerce/components/Stat.tsx` | text-sm/xs token |
| CarouselGrid | adapt `ShortcutGrid.tsx` | `overflow-x-auto`+`scroll-snap-*` (approved) |
| OrderStatusBand | `src/app/(paces)/seller/(dashboard)/dashboard/components/OrderStatusRow.tsx` | `.card`+`grid-cols-4`+solar |
| ActivityTimeline / NotificationFeed | `theme/.../ecommerce/components/RecentActivity.tsx` + `theme/.../apps/crm/activities/page.tsx` + `theme/.../TopBar/components/NotificationDropdownPeople.tsx` | `after:border-dashed`; `bg-primary/5` unread |
| Orders/Products mobile header | `theme/.../apps/ecommerce/(orders)/orders/components/OrdersList.tsx` + `.../(products)/products/components/ProductsListing.tsx` | tab/chip `badge bg-primary/15` |
| Solar icons | `theme/.../icons/solar-duotone/page.tsx` | `<Icon icon="solar:*-bold-duotone"/>` |
| SellerBottomNav | `_shared/SellerBottomNav.tsx` (ไม่เปลี่ยน) | raised FAB |

## Tasks (atomic-commit 1 task = 1 commit + Base: line)

- [ ] **T1 — Contract freeze:** ขยาย `CommandCenterData` (+`shopSlug`,`orderCount`,`reviewCount`,`avgRating` optional) + `SHORTCUT_TILES` 7 tiles solar names (`bar-chart-square`/`star`/`cup-star`/`box`/`users-group-rounded`/`tag-price`(disabled)/`settings` — ไม่มี prefix `solar:`, CarouselGrid เติมเอง). tsc 0. Base: ecommerce/page.tsx
- [ ] **T2 — CompactHero + ShopLinkButtons:** RSC hero (SVG bg+overlay+trust ring+chip+ชื่อ+stats+bell→/notifications; row2 wallet+เติมเงิน→/wallet+ShopLinkButtons). ShopLinkButtons client = copy `navigator.clipboard`+`pacesToast.success`, share `navigator.share` fallback; URL `resolveBuyerBaseUrl()/{slug}`, slug null→ซ่อน. Base: UserCard.tsx
- [ ] **T3 — CarouselGrid:** client scroll-snap 4×2/หน้า (8/page) + dot sync IntersectionObserver + `[&::-webkit-scrollbar]:hidden`; icon `<Icon icon={`solar:${tile.icon}`}/>`. Base: StatisticCard/ShortcutGrid
- [ ] **T4 — OrderStatusBand:** RSC 4-col solar icon (clock-circle/delivery/check-circle/close-circle) + badge เฉพาะ PENDING/SHIPPED; link `/orders?status=`. Base: OrderStatusRow.tsx
- [ ] **T5 — ActivityTimeline:** RSC timeline `after:border-dashed` + solar icon per type + `formatDateTime`; empty CTA; "ดูทั้งหมด"→/notifications. Base: RecentActivity.tsx
- [ ] **T6 — CommandCenter.tsx wire:** swap import → CompactHero/CarouselGrid/OrderStatusBand/ActivityTimeline; ตัด SellerHeader+WalletCard; ส่ง prop ใหม่ + `tiles`. tsc 0 หลังรวม T1–T6. Base: ecommerce/page.tsx
- [ ] **T7 — dashboard/page.tsx wire:** fetch `shopSlug` (+slug ใน select), `reviewCount`/`avgRating` (explore review.service ก่อน — ไม่มี→สร้าง 2 query หรือ honest-zero), ส่งเข้า CommandCenterData ใน `Promise.allSettled`. Base: ecommerce/page.tsx
- [ ] **T8 — Notifications:** NotificationFeed client (รับ `ActivityItem[]`, group วันนี้/เมื่อวาน/ก่อนหน้า, solar icon, unread `bg-primary/5`, lazy-load, "อ่านทั้งหมด" UI-only) + page.tsx fetch `getRecentActivity(shop.id,20)` + auth guard. Base: crm/activities + NotificationDropdownPeople
- [ ] **T9 — Orders mobile re-skin:** `OrdersList.tsx` mobile header — search pill + solar `magnifer`, filter chips `overflow-x-auto` (active `badge bg-primary/15 text-primary`); ไม่แตะ OrderCard/desktop. Base: ecommerce orders OrdersList
- [ ] **T10 — Products mobile re-skin:** `ProductsListing.tsx` mobile — ปุ่มเพิ่มสินค้า solar `add-square` solid primary, filter chips, product row รูป 62px+ชื่อ+ราคา primary+badge สถานะ; ไม่แตะ DataTable desktop. Base: ecommerce products ProductsListing

## Sequencing + Batch
```
T1 (freeze, tsc gate)
 → Batch A ∥: T2, T3, T4   → Reviewer A → QA A
 → Batch B ∥: T5, T9, T10  → Reviewer B → QA B
 → T6 (wire, รอ T2–T5) → Reviewer+QA integration /dashboard
 → T7 (page wire, รอ T6) → Reviewer+QA data จริง
 → T8 (notifications, รอ T7 pattern) → Reviewer+QA
 → End-of-phase QA 4 หน้า @360/390 → sign-off → retro
```
**Frozen contract (ฝังใน developer prompt Batch A):** `CommandCenterData` shape ข้างบน + `ShortcutTile{label,href,icon(no prefix),color,disabled?}` + icon import `{ Icon } from '@iconify/react'` `solar:*-bold-duotone` + short-path + `formatDateTime` + `pacesToast`. ดู [[feedback_lock_contract_before_parallel]]
**Batch parallel ≤3, ไฟล์อิสระ 100%.** developer **ห้าม commit** — ส่ง diff ให้ Controller verify+commit (ดู [[feedback_parallel_dev_agents_no_commit]] / [[feedback_subagent_git_scope_violation]])

## Data flow
`dashboard/page.tsx` RSC: getServerSession → shop.findUnique({id,shopName,logo,slug,user.avatar}) → `Promise.allSettled([getOrderStatusCounts, getBalance, getRecentActivity(8), getOrdersByShop(→orderCount), reviewCount?, avgRating?])` → CommandCenter → CompactHero/OrderStatusBand/CarouselGrid/ActivityTimeline. `notifications/page.tsx`: session+shop → getRecentActivity(20) → NotificationFeed. ไม่มี API route ใหม่ ไม่มี migration. shopId resolve ที่ server (กัน IDOR, [[feedback_rsc_dal_authz]]).

## Risk / Decision Log
- **R1** review.service อาจไม่มี `getReviewCountByShopId`/`getAvgRatingByShopId` → Controller grep ก่อน T7; ไม่มี→สร้าง 2 query หรือ honest-zero
- **R3** solar icon name อาจไม่ตรง → verify จาก `theme/.../icons/solar-duotone/page.tsx` + `@iconify/react` ก่อนฝัง prompt
- **R5/R10** orders/products แตะเฉพาะ mobile path — อ่านไฟล์ก่อน, ไม่แตะ DataTable desktop
- **R7** edge-to-edge negative margin อาจชน `.seller-mobile-shell main` (safepay-overrides.css) — measure จริงใน browser
- **R8** `SellerMobileHeader` คืน null บน /dashboard — ไม่แตะ, CompactHero อยู่ใน page content
- **Decisions เคาะแล้ว:** Q1 shop link=`/{slug}`; Q2 notification=derive จาก activity.service (ไม่สร้าง model, real model=Phase 2); Q4 สร้าง CompactHero ใหม่; Q5 dots=client IntersectionObserver

## Carry Debt (Phase 2)
dead-code cleanup (6 ไฟล์ deprecated หลัง verify ไม่มี import) · real Notification model (unread persist/bell count/push) · mark-as-read API · desktop `lg:` variant v10

## Pre-Dispatch Checklist (Controller ก่อน T1)
- [ ] `git status` clean
- [ ] probe `curl seller.deepth.local:4000`
- [ ] Chrome DevTools MCP connected (ไม่พร้อม→QA deferred ไม่ skip; ดู [[feedback_qa_domains]])
- [ ] grep `review.service.ts` หา reviewCount/avgRating-by-shopId
- [ ] verify solar icon names จาก theme icons page
- [ ] git scope: developer ห้าม checkout/pull/push/commit ([[feedback_subagent_git_scope_violation]]); Controller git-status เช็ค schema หลัง QA ([[feedback_qa_agent_no_prisma_pull]])

---
_แผนนี้ร่างโดย safepay-planner (read-only) — Controller เป็นผู้ execute + commit ตาม agent-team workflow_

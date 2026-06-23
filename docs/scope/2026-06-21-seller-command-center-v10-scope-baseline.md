# Scope Baseline — Seller Command Center v10 redesign build

สถานะ: SIGNED-OFF (2026-06-21 — Gate 2 condition ปิดแล้ว: visual QA done, Playwright 15/15 PASS, 2 bug แก้)
อ้างอิง PRD: FR-5, S-3, S-4, S-6 (seller dashboard/orders/products/reviews) · spec: `docs/superpowers/specs/2026-06-21-seller-command-center-v10-design.md` · plan: `docs/superpowers/plans/2026-06-21-seller-command-center-v10-build.md` · mockup: `docs/superpowers/specs/2026-06-21-seller-command-center-v10-mockup.html`

---

## Goal

Rebuild 4 หน้า seller mobile (`/dashboard`, `/notifications`, `/orders`, `/products`) ให้ premium, flat, actionable ด้วย Solar Duotone icon + compact hero + real data — ไม่เพิ่ม model/migration/API ใหม่

Phase ID: `seller-command-center-v10`

---

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | Task | สถานะ |
|----|--------|----------------------|------|-------|
| S-1 | Contract freeze: ขยาย `CommandCenterData` + `SHORTCUT_TILES` 7 ชิ้น | `tsc --noEmit` คืน 0 หลัง T1; type `shopSlug`, `orderCount`, `reviewCount`, `avgRating` ปรากฏใน interface; tile icon ไม่มี prefix `solar:` | T1 | TODO |
| S-2 | `CompactHero` RSC — compact hero เต็มกว้าง | render ที่ 360px ไม่มี overflow x; มี SVG hero bg + overlay; trust ring SVG รอบ avatar (คะแนน% ไม่ใช่ hardcode); stats row แสดง orderCount/reviewCount/avgRating จาก real DB; bell icon → `/notifications`; avatar null → initials `bg-primary/15` | T2 | TODO |
| S-3 | `ShopLinkButtons` client component — คัดลอก/แชร์ลิงก์ร้าน | กด copy → `pacesToast.success` + clipboard ถูก; URL = `resolveBuyerBaseUrl()/{slug}`; slug null → ซ่อน component; กด share → `navigator.share` (fallback pacesToast ถ้า API ไม่รองรับ) | T2 | TODO |
| S-4 | `CarouselGrid` client scroll-snap | 4×2/หน้า = 8 ชิ้น/หน้า; เลื่อนครบ 7 tiles ได้; tiles ≤8 → ไม่มี dot; dot sync กับ scroll (IntersectionObserver); `[&::-webkit-scrollbar]:hidden` มี comment HR7 กำกับ | T3 | TODO |
| S-5 | `OrderStatusBand` RSC — 4 status col + badge | 4 คอลัมน์ grid (PENDING/SHIPPED/CONFIRMED/CANCELLED); badge count เฉพาะ PENDING และ SHIPPED; count = 0 → ไม่มี badge; กด → `/orders?status=<STATUS>`; ข้อมูลจาก `getOrderStatusCounts` real DB | T4 | TODO |
| S-6 | `ActivityTimeline` RSC — กิจกรรมล่าสุด | แสดงจาก `getRecentActivity` real DB (≤8); solar duotone icon ตามชนิด; วันที่ `formatDateTime` (พ.ศ.); ว่าง → empty state + CTA; "ดูทั้งหมด" → `/notifications` | T5 | TODO |
| S-7 | `CommandCenter.tsx` wire รวม T2–T5 | ไม่มี import `SellerHeader`/`WalletCard` หลัง T6; `tsc` 0 หลังรวม T1–T6; `/dashboard` render 360/390px ไม่มี JS error | T6 | TODO |
| S-8 | `dashboard/page.tsx` wire ข้อมูลจริง | fetch `shopSlug`, `reviewCount`, `avgRating`, `orderCount`, `walletBalance`, `trustScore`, `recentActivity(8)`, `orderStatusCounts` ผ่าน `Promise.allSettled`; shopId resolve ที่ server; ไม่มี fake (honest-zero ถ้า count=0) | T7 | TODO |
| S-9 | `NotificationFeed` + `/notifications` page | แสดง activity จาก `getRecentActivity(shop.id, 20)` กลุ่ม วันนี้/เมื่อวาน/ก่อนหน้า; solar icon; unread `bg-primary/5` + dot (UI-only); "อ่านทั้งหมด" คลิกได้ (UI-only); auth guard session หมด → redirect `/auth/sign-in`; ว่าง → empty state | T8 | TODO |
| S-10 | `/orders` mobile re-skin header | mobile: search pill (solar `magnifer`), filter chips `overflow-x-auto` (active `badge bg-primary/15 text-primary`); ไม่แตะ `OrderCard`/desktop; render 360px ไม่แตก | T9 | TODO |
| S-11 | `/products` mobile re-skin header | mobile: ปุ่ม "เพิ่มสินค้า" solar `add-square` solid primary; filter chips **3 ตัว (ทั้งหมด/เปิดขาย/ปิดการขาย)** — ตัด "สินค้าหมด" ตาม CR-1 (ProductRow ไม่มี stockQty); product row รูป 62px + ชื่อ + ราคา primary + badge สถานะ; ไม่แตะ DataTable desktop; render 360px ไม่แตก | T10 | TODO |
| S-12 | Paces compliance ทุกหน้าที่แตะ | grep gate: (1) `#7367F0` = 0; (2) ไม่มี Tabler webfont ใน dashboard/notifications (solar แทน); (3) `react-toastify` ใน (paces) = 0; (4) ไม่มี `font-mono` บน element ข้อความไทย | T1–T10 | TODO |
| S-13 | Arbitrary ทุกจุดมี comment HR7 | comment กำกับ: SVG hero bg/overlay, trust ring SVG, `[&::-webkit-scrollbar]:hidden`, `scroll-snap-*`, edge-to-edge negative gutter | T2–T5 | TODO |
| S-14 | ทุก commit UI มี `Base:` line | `git log` ไม่มี commit UI ที่ไม่มี `Base:` | T1–T10 | TODO |
| S-15 | redesign OrderCard ตรง mockup v10 .ord (CR-2) | status badge 4 สถานะ + solar duotone icons + customer/item/foot layout; คง feature เดิม (expandable/payment/PII mask/OrderActions); ไม่แตะ desktop/shared deps; tsc 0 | T11 | DONE |

**S↔T map:** S-1=T1 · S-2/S-3=T2 · S-4=T3 · S-5=T4 · S-6=T5 · S-7=T6 · S-8=T7 · S-9=T8 · S-10=T9 · S-11=T10 · S-12/S-14=T1–T10 · S-13=T2–T5

---

## Out-of-Scope

> แตะ = CREEP (hard block). จำเป็น → Controller ตัดสิน + ย้ายขึ้น In-Scope + จด Change Log.

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-1 | Desktop `lg:` variant ทุกหน้า | Phase 2 |
| OOS-2 | `Notification` model จริง (migration, unread column, persist) | Phase 2 — phase นี้ derive จาก activity |
| OOS-3 | Mark-as-read API | Phase 2 |
| OOS-4 | Push notification / bell count จาก DB | Phase 2 |
| OOS-5 | Dead-code cleanup (SellerHeader/WalletCard/ShortcutGrid/OrderStatusRow/RecentActivityFeed/NotificationTimeline/notification-data.ts) | deprecate in-place; ลบหลัง verify |
| OOS-6 | Username 30-day cooldown | Phase 2 |
| OOS-7 | Charts/analytics หน้า "รายงาน" | Phase แยก |
| OOS-8 | SVG hero asset จริง (designer) | ไม่ block (inline SVG ลำแสงพอ) |
| OOS-9 | API route ใหม่ทุกชนิด | ไม่มีใน phase นี้ |
| OOS-10 | OrderCard / desktop DataTable (orders+products) | เฉพาะ mobile header re-skin |

**⚠️ Gate 1 ต้องเฝ้า OOS-2 + OOS-5 เป็นพิเศษ (creep prone).**

---

## Assumptions

- Dev server user รันเอง port 4000 — Controller probe ก่อน QA (ไม่ start เอง)
- `review.service.getAvgRatingByUsername(username)` คืน `{avgRating, reviewCount}` (มีอยู่แล้ว) → ใช้ username เจ้าของร้าน; **ไม่สร้าง service ใหม่** (R1 resolved)
- `activity.service.getRecentActivity(shopId, limit)` มีอยู่ (v8) — Controller grep ยืนยันก่อน T5/T7/T8
- `resolveBuyerBaseUrl()` มีอยู่; shop link = `resolveBuyerBaseUrl()/{shop.slug}`
- Solar icon names verified จาก `theme/paces/Admin/TS/src/app/(admin)/icons/solar-duotone/page.tsx` ก่อน Batch A
- Chrome DevTools MCP พร้อมก่อน QA; ไม่พร้อม → QA deferred ไม่ skip ([[feedback_qa_domains]])
- ไม่แตะ `schema.prisma`; Controller ตรวจ `git diff prisma/schema.prisma` หลังทุก batch
- Developer ห้าม commit/push/checkout/pull — ส่ง diff ให้ Controller verify+commit

---

## Acceptance (phase-level)

1. `tsc --noEmit` คืน 0 หลัง merge ทุก task
2. 4 หน้า render 360/390px ไม่มี overflow-x, console ไม่มี JS error (Chrome DevTools MCP)
3. Paces grep gate คืน 0: `#7367F0` / `react-toastify` ใน (paces) / `font-mono` บนข้อความไทย; ไม่มี Tabler webfont ใน CC ใหม่
4. ข้อมูลจริงจาก DB ใน `/dashboard` (trust/wallet/order counts/stats — ไม่มี fake)
5. arbitrary ทุกจุดมี comment HR7
6. ทุก commit UI มี `Base:` line

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | อนุมัติ |
|--------|-----------|--------|--------|
| 2026-06-21 | baseline สร้าง | Gate 0 — Scope Baseline | safepay-product |
| 2026-06-21 | **CR-1:** S-11 filter chips 4→3 (ตัด "สินค้าหมด") | ProductRow ไม่มี `stockQty`; สินค้า SERVICE/DIGITAL ไม่มีสต็อก; เพิ่ม field = scope creep (ขัด OOS-9 no migration). chip สถานะใช้ `isActive` (เปิดขาย/ปิดการขาย) | Controller (Gate 1 decision B) |
| 2026-06-21 | chip active style = solid `bg-primary text-white` (ทั้ง orders+products) ตาม mockup `.chip.on` (baseline S-10 text เดิม `bg-primary/15` คลาดจาก mockup) | สอดคล้องกับ visual SoT (mockup) + ข้ามหน้า | Controller |
| 2026-06-21 | **Gate 2 CONDITIONAL SIGNED-OFF** — S-1..S-14 ครบ, no CREEP/GAP, tsc 0, reviewer+grep ผ่าน. carry: visual QA mobile (server down), pre-existing react-toastify ใน settings, OOS-5 dead-code cleanup | safepay-product sign-off | Controller |
| 2026-06-21 | **CR-2:** ขยาย scope — redesign OrderCard (orders list) ให้ตรง mockup v10 .ord (status badge + solar duotone icons + visual) คงข้อมูล/logic/OrderActions. เดิม OOS-10 (orders เฉพาะ header) → ย้ายขึ้น In-Scope S-15. products row = T10 ตรง mockup แล้ว | user request "redesign card ให้ตรง mockup" | Controller |
| 2026-06-21 | **Gate 2 → SIGNED-OFF เต็ม** — user เปิด dev server, QA visual เสร็จ: Playwright 15/15 PASS + แก้ 2 bug (BUG-2 dashboard overflow/edge-to-edge ตรง user feedback "มี padding ซ้ายขวา" → CC -mx-4; BUG-1 ปุ่มเพิ่มสินค้า tap≥44px). condition ปิด | Controller (QA + fix) |

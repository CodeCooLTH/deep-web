# Scope Baseline — Seller Mobile Command Center v8 (Paces Re-source)

> สถานะ: ✅ SIGNED-OFF (2026-06-10, Gate 2 product)
> Carried-debt (Phase 2 polish): /notifications sub-page title fallback (getSellerPageTitle ไม่ map); activity feed ~8 รายการ (spec 3-5)
> spec: `docs/superpowers/specs/2026-06-10-seller-mobile-cc-v8-paces-resource-design.md` · mockup: `docs/mockups/home/command-center-v8.html`

## Goal

Rebuild seller mobile command center (`/dashboard` `lg:hidden`) + route ใหม่ `/notifications` จาก Paces primitive จริง — กำจัด arbitrary CSS ทั้งหมด (Hard Rule 7), IA แบบ Shopee "ฉัน" (sectioned cards + icon grid), token น้ำเงิน `#236dc9` ตลอด (ห้ามม่วง).

## In-Scope

> ทุก commit ต้อง map ≥1 S-id. ไม่ map = CREEP.

| ID | รายการ | Acceptance | สถานะ |
|----|--------|-----------|-------|
| S-1 | Header น้ำเงินทึบ + trust progress | `bg-primary` ทึบ; ชื่อร้าน + tier chip `bg-white/20`; bell touch ≥44px + `bg-danger` badge; trust bar ขาวบนน้ำเงิน fill=trustScore%; ขาวบนน้ำเงิน opacity ≥.9; ไม่ hardcode hex | ✅ DONE |
| S-2 | ShortcutGrid grid-4 8-tile | `.card .card-header` "เมนูลัด" + `grid-cols-4`; 8 tile (รีวิว/เติมเงิน/ลูกค้า/สินค้า/ความสำเร็จ/หมวดหมู่/การยืนยัน/ตั้งค่าร้าน) สีตาม Q4; chip `size-12 rounded-lg bg-{semantic}/15`; touch ≥44px | ✅ DONE |
| S-3 | OrderStatusRow 4-status + badge | `.card .card-header` "คำสั่งซื้อ" + "ดูทั้งหมด ›"→/orders; `grid-cols-4`; icon-circle `size-11 rounded-full bg-{semantic}/15`; badge `bg-danger` แสดงเมื่อ >0; data `orderStatusCounts` | ✅ DONE |
| S-4 | WalletCard | `.card` row: icon `bg-success/15`; "เครดิตคงเหลือ" `text-default-500`; ยอด `text-default-900 text-lg tabular-nums`; `btn btn-primary btn-sm` "เติมเงิน"→/wallet; data SellerWallet | ✅ DONE |
| S-5 | RecentActivityFeed compact (3-5) | `.card .card-header` "กิจกรรมล่าสุด" + "ดูทั้งหมด ›"→/notifications; node `size-7.5 rounded-full border border-dashed`; `after:border-dashed last:after:hidden`; data `recentActivity`; source RecentActivity.tsx | ✅ DONE |
| S-6 | `dashboard/page.tsx` ดึงข้อมูล + props | ดึง shopName/avatar/tierName/trustScore + wallet balance + orderStatusCounts + recentActivity; ส่ง props เดียวเข้า CommandCenter; tsc 0 | ✅ DONE |
| S-7 | CommandCenter wrapper + ลำดับ | ประกอบ SellerHeader→ShortcutGrid→OrderStatusRow→WalletCard→RecentActivityFeed (ลำดับนี้เสมอ); `lg:hidden`; ไม่ใส่ padding ซ้ำ shell (safepay-overrides.css L98/L101) | ✅ DONE |
| S-8 | `SHORTCUT_TILES` 8-tile semantic | constants ส่งออก array 8 (key/label/icon/href/color semantic); ไม่ hardcode hex | ✅ DONE |
| S-9 | `/notifications` route + mock data | `(dashboard)/notifications/page.tsx` render; `notification-data.ts` mock ≥8 รายการ 4 ประเภท; type `Notification`; tsc 0 | ✅ DONE |
| S-10 | NotificationTimeline (CRM Activities + lazy-load) | source `apps/crm/activities/page.tsx`; tab filter ทั้งหมด/คำสั่งซื้อ/รีวิว/การเงิน/ระบบ (`border-b` active=primary); date group; row node `size-7.5` + dashed connector + content (title `<strong>`/desc `text-default-700`/badge `bg-*/15`/time); lazy-load client IntersectionObserver + spinner `animate-spin`; mock slice จำลอง | ✅ DONE |
| S-11 | SellerBottomNav clean arbitrary | grep arbitrary (`text-[`/`bg-[`/`rounded-[`/hex) → Paces token; center button arbitrary จำเป็น = comment กำกับ; touch ≥44px | ✅ DONE |
| S-12 | A11y sweep | `text-default-400` ใน text สำคัญ = 0 (≥default-500); touch ≥44px @360px; ขาวบนน้ำเงิน ≥.9; focus state ชัด; ไม่มี `#7367F0`/`rgba(115,103,240` | ✅ DONE |

## Out-of-Scope

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-1 | Real notification data (Notification model / activity paginated) | Phase 2 — v8 mock |
| OOS-2 | Unread/read persistence + last-seen | Phase 2 — ต้อง schema |
| OOS-3 | Bell count wiring จริง | Phase 2 — count static/derived mock |
| OOS-4 | Lazy-load จริง (paginated API cursor) | Phase 2 — S-10 = IntersectionObserver + mock slice |
| OOS-5 | Desktop `lg:` | command center `lg:hidden` เท่านั้น |
| OOS-6 | Charts (donut/line) | ไม่อยู่ใน IA |
| OOS-7 | Admin | คนละ domain |
| OOS-8 | Schema/API ใหม่ | noti mock; ไม่มี DB change |
| OOS-9 | Buyer/landing (Vuexy) | คนละ domain |

## Assumptions
- `CommandCenterData`, `activity.service`, `SellerWallet` query มีอยู่แล้ว — S-6 เรียกได้ไม่ต้องสร้าง service ใหม่
- `trustScore`/`tierName`/`shopName` ดึงจาก session+shop ที่ page.tsx เข้าถึงอยู่
- Paces token `--color-primary=#236dc9` define แล้ว — ใช้ `bg-primary` ได้ทันที
- `(dashboard)/notifications/` อยู่ใต้ seller route group เดิม — ใช้ layout เดิม
- notification = mock array (ยังไม่มี Notification model)
- Hard Rule 7 บังคับทุกไฟล์ใหม่ — grep ยืนยันก่อน commit

## Deferred → Phase 2
real noti source (activity paginated + Notification model + unread persistence) · bell count จริง · lazy-load cursor จริง · push/realtime · desktop redesign

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-06-10 | baseline สร้าง | Gate 0 phase cc-v8 | Controller |
| 2026-06-10 | Gate 2 SIGNED-OFF | S-1..S-12 ผ่าน Review 8-gate + QA mobile 360px (Paces blue, ม่วง 0, console clean) | product |
| 2026-06-11 | **v8.1 premium-craft pass (post-sign-off)** | user: v8 ดิบ "ดูไม่เป็น modern mobile 2026" → ref Shopee "ฉัน" | **user เคาะ "Modern mobile craft"** |

---

## 🎨 v8.1 Premium-craft Addendum (post-sign-off, 2026-06-11)

> **⚠️ Hard Rule 7 latitude (เฉพาะ seller command center mobile) — user อนุมัติ:** หน้านี้ **ได้รับอนุญาตให้ใช้ arbitrary value เพื่อ premium craft** (gradient, custom shadow/radius) — เก็บ **สี/token Paces** (`var(--color-primary)` = saas skin น้ำเงิน `#0a74ff`, semantic) แต่ execution เป็น modern app 2026 (ref Shopee). **ห้าม reviewer/agent "แก้กลับ" เป็น Paces ดิบ** โดยอ้าง Hard Rule 7 — นี่คือ documented exception. เหตุผล: Paces = admin dashboard theme มีเพดานความ "premium consumer app"; user ยอมหลุดกฎเพื่อ look ที่ต้องการ.

**สิ่งที่เปลี่ยน (7 commit `b508deb`..`5a08bf4`):**
- **mobile-density:** kill wrapper margin 20px + side padding 16→8px (การ์ดเต็มจอ 94%) + ตัด card-header divider (safepay-overrides.css `.seller-mobile-shell`)
- **card depth:** flat border → rounded-18 + soft shadow tinted ink + พื้นเย็นนวล (scoped CSS)
- **header:** Paces-light card → **gradient น้ำเงินเต็มขอบ** (`-mx-2 -mt-2` full-bleed, `linear-gradient(var(--color-primary)→#0a5fd9)`, rounded-b-28, shadow-primary) + avatar ring + tier chip + **Trust Score ใน frosted banner** (แนว Shopee VIP banner)
- **wallet:** balance ฿ เป็น hero number (text-2xl) + fix `btn-primary` ไม่ render filled → explicit `bg-primary text-white`
- **icons:** chip rounded-2xl size-12 semantic; order circle size-12
- **notification:** เหลือหัวข้อเดียว (getSellerPageTitle EXTRA map /notifications)
- **perf:** dashboard queries sequential → `Promise.allSettled` (parallel)
- a11y/touch/Paces-token discipline คงไว้; ม่วง #7367F0 = 0

**เปิดค้าง (optional, ยังไม่ทำ):** promo/VIP banner ใต้ header (รอ promo data), wallet number สีน้ำเงิน, page-load micro-animation. **ค้าง infra:** branch ahead origin 54 commit (ยังไม่ push).

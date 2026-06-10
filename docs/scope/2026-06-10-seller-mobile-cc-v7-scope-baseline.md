# Scope Baseline — Seller Mobile Command Center v7 Redesign

> สถานะ: ✅ SIGNED-OFF (2026-06-10, Gate 2 — product)
> Carried-debt: S-6 empty-state E2E ยังไม่ verify live (DB dev มี seed ครบ → ทำ empty-path ไม่ได้); code ถูกตาม acceptance — เก็บเป็น Phase 2 QA item
> อ้างอิง PRD: FR-5.x (seller dashboard UX) · spec: `docs/superpowers/specs/2026-06-10-seller-mobile-command-center-DESIGN-SPEC-v7.md`

## Goal

Redesign UI ของ seller mobile command center (viewport `lg:hidden`, หน้า `/dashboard`) ให้ตาม Design Spec v7 ที่ user อนุมัติแล้ว — เป็นการเปลี่ยน styling/layout ล้วน ๆ โดยแก้ไฟล์ที่มีอยู่เท่านั้น ไม่มี feature ใหม่ ไม่มี data/schema/API ใหม่

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | **IdentityBar: avatar ขยาย 36→44px** | inspect DOM: `img`/fallback div มี class `w-11 h-11` (44px); touch-target ≥44px ผ่าน | ✅ DONE |
| S-2 | **IdentityBar: trust progress bar** | มี `div` 2 ชั้น (`h-1 rounded-full`): outer = bg muted, inner `style.width = trustScore%` ใช้ token `#7367F0`; ถ้า trustScore=0 bar width=0% (ไม่ซ่อน element) | ✅ DONE |
| S-3 | **prop chain trustScore** (`layout.tsx → SellerMobileHeader → IdentityBar`) | `layout.tsx` ส่ง `trustScore={user.trustScore ?? 0}`; `SellerMobileHeader` ส่งต่อ `IdentityBar`; `IdentityBar` Props type มี `trustScore: number`; `tsc --noEmit` 0 error | ✅ DONE |
| S-4 | **OrderStatusTimeline: 3-stat แนวนอน → stacked icon-chip** | แต่ละ stat มี chip `w-8 h-8 rounded-[9px]` + count `text-[17px] font-bold tabular-nums` + label `text-[11px]`; สี SHIPPED=`#00BAD1`, CONFIRMED=`#28C76F`, CANCELLED=`rgba(47,43,61,0.40)`; label opacity 0.65; ≥100 แสดง "99+" | ✅ DONE |
| S-5 | **RecentActivityFeed: แก้ contrast time text** | time element ใช้ `rgba(47,43,61,0.55)` (เดิม 0.40); contrast ≥4.5:1 บน bg ขาว | ✅ DONE |
| S-6 | **RecentActivityFeed: empty state onboarding** | items=[] แสดง icon `shopping-cart-plus` สี `#7367F0` มัว 32px + "สร้างออเดอร์แรกเลย" + sub "กิจกรรมจะปรากฏที่นี่เมื่อคุณเริ่มใช้งาน" + ปุ่ม `btn btn-sm bg-primary text-white h-11` link `/orders/new` | ✅ DONE |
| S-7 | **ShortcutPanel: tile set ใหม่ 6 tiles** | `command-center.ts` (edit ไฟล์ที่มีอยู่) มี SHORTCUT_TILES ครบ 6: รีวิว/เติมเงิน/ลูกค้า/ตั้งค่าร้าน/ความสำเร็จ/การยืนยัน พร้อม href, icon, color (`amber|green|cyan|violet|gray`); ไม่มี tile คำสั่งซื้อ/สินค้า/Blacklist | ✅ DONE |
| S-8 | **ShortcutPanel: color class literal 5-way + tile size** | tile-box `w-[50px] h-[50px]`, icon `text-[24px]`; color mapping literal class (ไม่ template-concat): amber=`bg-[rgba(255,159,67,0.14)] text-[#FF9F43]`, green=`bg-[rgba(40,199,111,0.14)] text-[#28C76F]`, cyan=`bg-[rgba(0,186,209,0.13)] text-[#00BAD1]`, violet=`bg-[rgba(115,103,240,0.12)] text-[#7367F0]`, gray=`bg-[#F2F1F6] text-[rgba(47,43,61,0.60)]`; ทุก token ใน DESIGN.md | ✅ DONE |
| S-9 | **ShortcutPanel: grid layout 4+2** | แถว 1 `grid-cols-4` (tile 0-3); แถว 2 `grid-cols-2 max-w-[200px] mx-auto` centered (tile 4-5); render ถูกต้องบน 360px | ✅ DONE |
| S-10 | **CommandCenter: reorder section** | ลำดับ render `OrderStatusTimeline → RecentActivityFeed → ShortcutPanel`. ~~wrapper px-4 pb-28~~ **แก้ไข:** wrapper คง `lg:hidden relative` ไม่ใส่ px/pb — `.seller-mobile-shell main` มี `padding-inline:1rem` + `padding-bottom:5rem` ครอบแล้ว (safepay-overrides.css L98/L101) | ✅ DONE |

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). จำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope + จด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | Bell notification system (wire จริง) | Phase 2 — bell dot คง static placeholder |
| OOS-2 | Blacklist feature (UI + logic) | Phase 2 — tile ถูกตัดออกจาก shortcut |
| OOS-3 | Promo banner / promotional section | Phase 2 — ไม่อยู่ใน spec v7 |
| OOS-4 | หน้า seller อื่นนอก `/dashboard` (`/orders`, `/products`, `/reviews`...) | scope เฉพาะ `/dashboard` + shared component |
| OOS-5 | Desktop layout (`lg:` ขึ้นไป) | `lg:hidden` เท่านั้น — ห้ามแตะ class `lg:` |
| OOS-6 | Data/schema/API ใหม่ | redesign ล้วน — ใช้ข้อมูลที่มีอยู่ |
| OOS-7 | `SellerBottomNav.tsx` แก้ layout/เพิ่ม item | bottom nav อยู่นอก scope v7 |
| OOS-8 | Cross-platform stats / on-time / response rate | คนละหน้า คนละ phase |

## Assumptions

- **A-1:** `user.trustScore` เป็น `number` (ยืนยัน layout.tsx:23); guard `?? 0` ไว้แล้ว
- **A-2:** ไฟล์ `dashboard/_constants/command-center.ts` **มีอยู่จริง** (Controller อ่านยืนยันแล้ว — product agent Glob ผิด path) มี `SHORTCUT_TILES` + type `ShortcutTile { color: string }`. S-7 = **edit ไฟล์ที่มีอยู่** ไม่ใช่ create. `color: string` เป็น free string → 5-way ไม่ต้องแก้ type
- **A-3:** tile "การยืนยัน" (`/verification`) = link ปกติเสมอ ไม่ disabled แม้ L3 — safe default (spec Q4)
- **A-4:** fallback grid ถ้าแถว 2 ดูโหว่บน 360px → `grid-cols-4` เต็มสองแถว (spec Q3); default = `max-w-[200px] mx-auto` centered
- **A-5:** SellerMobileHeader sub-page mode (pathname ≠ `/dashboard`) IdentityBar ไม่ render → prop chain S-3 มีผลเฉพาะ dashboard path (แต่ต้องส่ง prop ผ่านเพื่อ TS ครบ)
- **A-6:** token สีทุกตัว (`#7367F0`,`#FF9F43`,`#28C76F`,`#00BAD1`,`#FF4C51`) ต้อง grep DESIGN.md ยืนยันก่อน commit (กัน CC V4 reject ซ้ำ)
- **A-7:** ไม่มีไฟล์ใหม่ — งานทั้งหมดเป็น edit 8 ไฟล์ที่มีอยู่

## Non-Functional Constraints

- **NF-1 Theme-copy:** commit ที่แตะ UI ต้องมี `Base:` line ชี้ theme file (§5 spec)
- **NF-2 DESIGN.md token only:** สี/radius ทุกค่าอยู่ใน DESIGN.md — ห้ามสีนอก palette (CC V4 reject เรื่อง blue/radius20)
- **NF-3 Font Anuphan only**
- **NF-4 Touch target ≥44px** ทุก interactive element
- **NF-5 Tailwind v4 literal class:** ห้าม template-concat color class — full literal ในไฟล์
- **NF-6 RSC pattern:** `next/link` ตรงใน client component ได้
- **NF-7 TypeScript strict:** `tsc --noEmit` 0 error ก่อน commit
- **NF-8 Mobile-only:** ห้ามแตะ class `lg:` ขึ้นไป

## Deferred → Phase 2

- Bell notification system · Blacklist feature · Promo banner · Cross-platform stats · Activity feed pagination · Redis rate limit · Desktop command center

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-06-10 | baseline สร้าง (แก้ A-2/A-7: command-center.ts มีอยู่จริง) | Gate 0 — phase เริ่ม | Controller |
| 2026-06-10 | S-10 ตัด `px-4 pb-28` ออก (เก็บแค่ section reorder) | verify พบ `.seller-mobile-shell main` มี padding-inline:1rem + padding-bottom:5rem แล้ว (css L98/L101) — spec ตั้งบนสมมุติฐานผิด, ใส่ซ้ำ = เยื้อง/ห่างเกิน | Controller (U-E dev flag) |
| 2026-06-10 | Gate 2 SIGNED-OFF | S-1..S-10 ผ่าน Review (8-gate ×2 batch) + QA (mobile 360px PASS, console clean) | product |

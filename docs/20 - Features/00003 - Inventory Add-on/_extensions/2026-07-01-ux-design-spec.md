---
title: "UX Design Spec — Inventory Add-on UI"
owner: shinobu22
status: approved-gate
module: M00003-InventoryAddon
created: 2026-07-01
gate: "Hard Rule 8 (safepay-ux) — mandatory ก่อน implement frontend S-11/S-12/S-13"
related: ["[[SDS]]", "[[BRD]]", "[[PRD]]"]
---

> Design Spec (read-only) จาก safepay-ux — Paces theme, primary `#236dc9` น้ำเงิน, font Anuphan.
> Scope: `(paces)/seller/**`. ครอบ S-11 (menu gate) / S-12 (inventory page + components) / S-13 (product stock card) + S-15 admin sidebar.

# หน้า `/inventory` — 3 states

## State 1: NOT_SUBSCRIBED (InventoryGate)
```
┌─────────────────────────────────────────────────────────┐
│ จัดการสต็อก                              (PageBreadcrumb)│
├─────────────────────────────────────────────────────────┤
│              ┌───────────────────────────┐              │
│              │  card (single, max-w-md,   │              │
│              │  centered mx-auto)         │              │
│              │  Inventory Add-on          │              │
│              │  จัดการสต็อกสินค้าอัตโนมัติ │              │
│              │       ฿199 /เดือน           │              │
│              │  ✓ ตัดสต็อกอัตโนมัติทุก order│              │
│              │  ✓ คืนสต็อกอัตโนมัติเมื่อยกเลิก│             │
│              │  ✓ ป้องกันขายเกินสต็อกที่มี  │              │
│              │  ✓ เก็บข้อมูลสต็อกไว้ตลอด    │              │
│              │   [   สมัครใช้งาน   ]        │ ← btn full-w │
│              └───────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

## State 2: LOCKED
```
│              ┌───────────────────────────┐
│              │ ┌───────────────────────┐ │
│              │ │⚠ ถูกล็อกเพราะเครดิตไม่พอ │ │ ← danger banner
│              │ │  ล็อกเมื่อ 15 มิ.ย. 2569  │ │  border-danger/20
│              │ │  10:32                 │ │  bg-danger/10
│              │ └───────────────────────┘ │
│              │  (feature list เดิม)        │
│              │  ข้อมูลสต็อกเดิมยังอยู่ครบ    │
│              │   [ เปิดใช้งานอีกครั้ง ]      │
│              └───────────────────────────┘
```

## State 3: ACTIVE (management UI)
```
│ ┌───────────────────────────────────────────────────┐   │ (ถ้า warn)
│ │⚠ เครดิตอาจไม่พอสำหรับรอบต่ออายุวันที่ 5 ก.ค. 2569    │   │ warning banner
│ │  (ขาดอีก ฿149) — เติมเครดิต →                        │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────┐   │
│ │ card-header: [search] ... [page-size ▾]           │   │
│ │ สินค้า | สถานะติดตาม | คงเหลือ | สถานะ | อัปเดต | ⋯  │   │
│ │ [img] เสื้อ  | ติดตาม  |  3  | ปกติ | ... |✏️│        │
│ │ [img] กระเป๋า| ติดตาม  |  0  | หมด  | ... |✏️│        │
│ │ [img] แก้ว   | ไม่ติดตาม|  —  |  —   | ... |✏️│        │
│ │ card-footer: pagination                             │   │
│ └───────────────────────────────────────────────────┘   │
```
Empty state (ACTIVE, ไม่มี PHYSICAL): card + icon `tabler:package` + "ยังไม่มีสินค้าประเภทจับต้องได้ — เพิ่มสินค้าก่อนเพื่อเริ่มจัดการสต็อก" + ปุ่ม "+ เพิ่มสินค้า" → `/products/new-v2`

# Admin `topups/[id]` sidebar (S-15/FR-INV-13)
```
┌─────────────────────────────┐
│ card: รายการเครดิตล่าสุด (ใหม่)│
│ [badge: ล็อกจากเครดิตไม่พอ    │ ← เฉพาะ LOCKED, bg-danger/10
│  เมื่อ 15 มิ.ย. 2569 10:32]   │
│ ─────────────────────────    │
│ Inventory Add-on    -฿199    │ ← WALLET_REASON_LABEL_TH
│ 1 ก.ค. 2569 09:00            │
│ SMS Order Link      -฿1      │
└─────────────────────────────┘
```
read-only ledger (admin แก้ entitlement ไม่ได้ — FR-INV-13-AC-3)

# Theme Source Mapping (verified มีจริงทั้งหมด)

| Component | Base (theme/in-project) | adapt |
|---|---|---|
| InventoryGate NOT_SUBSCRIBED | `theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx` | **1 card mx-auto max-w-md** ไม่ใช่ grid-4; ตัด `!bg-primary` เต็มการ์ด (primary แค่ CTA); ตัด `text-[40px]` arbitrary → token heading |
| InventoryGate LOCKED banner | `src/app/(paces)/seller/(dashboard)/wallet/components/WalletCard.tsx:42-52` | error-banner `border-danger/20 bg-danger/10` + `tabler-alert-triangle`; ข้อความ locked + lockedAt |
| Subscribe/ReactivateButton | `src/app/(paces)/seller/(dashboard)/orders/[token]/components/SendSmsButton.tsx` (ทั้งไฟล์) | Swal preConfirm+showValidationMessage+showLoaderOnConfirm; เปลี่ยน endpoint/ข้อความ ฿199; **ตัด showSuccess local-state timer** (ทำครั้งเดียวจบ) → pacesToast.success + router.refresh() |
| AdvanceWarningBanner | `WalletCard.tsx:91-102` low-balance chip → full banner | `bg-warning/15 text-warning` ขยายเป็น full-width block เหนือตาราง + ลิงก์ "เติมเครดิต →" `/wallet` |
| InventoryManagementTable | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(inventory)/product-stocks/components/ProductStockTable.tsx` **+** `src/app/(paces)/seller/(dashboard)/wallet/components/WalletTransactionTable.tsx` (DataTable/TanStack wiring จริง) | ตัด sku/category/price/lowStock/checkbox/bulk-delete; Actions = ปุ่มเดียว `btn btn-icon` → `/products/{id}/edit`; ตัด filter dropdown เหลือ search; **ต้องมี mobileCard prop เหมือน WalletTransactionTable** (responsive) |
| ProductStockCardV2 | `src/app/(paces)/seller/(dashboard)/products/components/ProductPriceCardV2.tsx` (shell `px-3 py-2.5`) **+** `.form-switch` (`src/assets/css/custom/_forms.css`, ใช้จริงที่ Customizer/SidenavUser.tsx) | ตัด quick-pick chip; toggle คุม null↔0 + number input `form-input` |
| Admin ledger | `.card`/`.card-header`/`dl.divide-default-200 divide-y` (Paces primitive) ในไฟล์ `topups/[id]/page.tsx` | badge `bg-danger/10 text-danger` เฉพาะ LOCKED |
| Menu badge | `_seller-menu.ts` group `seller-store`/STORE (children `/shop`,`/wallet`,`/settings` verified) | `MenuItemType.badge:{className,text}` — bg-primary "฿199/ด." / bg-danger "ถูกล็อก" / ไม่มี (ACTIVE) |
| Empty state | `src/app/(paces)/seller/(fullscreen)/products/new-v2/page.tsx:40-60` (NoShopCard) | icon `tabler:package`, CTA `/products/new-v2` |

# ⚠️ Developer TODOs (บังคับ verify ก่อน commit)
1. **Icon เมนู "จัดการสต็อก"** — SDS เสนอ `boxes` แต่ยังไม่ verify. developer verify `tabler:boxes` ผ่าน `https://api.iconify.design/tabler.json?icons=boxes` ก่อน; ไม่มี → fallback `tabler:archive` (verify อีกครั้ง). **ห้ามใช้ `box`/`package`** (ชนกับเมนู Products → sidebar สื่อผิด)
2. **`MenuItemType` ต้องรองรับ `badge`/`isDisabled`** — grep `type MenuItemType` (src/types) ก่อน implement `applyInventoryGate()`; ไม่มี field → ขยาย type ก่อน (breaking-additive)
3. **InventoryManagementTable ต้องมี `mobileCard` prop** — consistency กับ WalletTransactionTable (SDS ไม่ระบุชัด)

# Content (ไทย) — key strings
| Key | ข้อความ |
|---|---|
| Gate title / subtitle | "Inventory Add-on" / "จัดการสต็อกสินค้าอัตโนมัติ" |
| Price | "฿199 /เดือน" |
| Feature list | "ตัดสต็อกอัตโนมัติทุกครั้งที่มี order ใหม่" / "คืนสต็อกอัตโนมัติเมื่อยกเลิก" / "ป้องกันขายเกินสต็อกที่มีจริง" / "เก็บข้อมูลสต็อกไว้แม้ถูกล็อก" |
| CTA | "สมัครใช้งาน" (NOT_SUBSCRIBED) / "เปิดใช้งานอีกครั้ง" (LOCKED) |
| Locked banner | "ถูกล็อกเพราะเครดิตไม่พอ" + "ล็อกเมื่อ {formatDateTime(lockedAt)}" |
| Subscribe dialog | title "สมัคร Inventory Add-on?" / text "ระบบจะหักเครดิต ฿199 จากกระเป๋าเงินของคุณทันที และเริ่มรอบใช้งาน 30 วัน" / confirm "สมัคร ฿199" / cancel "ยกเลิก" |
| Reactivate dialog | title "เปิดใช้งานอีกครั้ง?" / text "ระบบจะหักเครดิต ฿199 และเปิดใช้งานทันที ข้อมูลสต็อกเดิมของคุณยังอยู่ครบ" / confirm "เปิดใช้งาน ฿199" |
| 402 | "เครดิตไม่พอ — เติมเครดิตก่อนสมัคร" (link /wallet) / "...ก่อนเปิดใช้อีกครั้ง" |
| 409 | "สมัครใช้งานอยู่แล้ว" (subscribe) / "บัญชีนี้ไม่ได้ถูกล็อก" (reactivate) |
| Success toast | "สมัคร Inventory Add-on สำเร็จ" / "เปิดใช้งานอีกครั้งสำเร็จ" |
| Advance warning | "เครดิตอาจไม่พอสำหรับรอบต่ออายุวันที่ {nextRenewalAt} (ขาดอีก ฿{shortfall}) — เติมเครดิต →" |
| Menu badge | "฿199/ด." (NOT_SUBSCRIBED) / "ถูกล็อก" (LOCKED) |
| Table columns | "สินค้า" / "สถานะติดตาม" / "จำนวนคงเหลือ" / "สถานะสต็อก" / "อัปเดตล่าสุด" / (Actions icon) |
| Track badge | "ติดตาม" (bg-primary/15) / "ไม่ติดตาม" (bg-default) |
| Stock status | "หมด" (bg-danger/15 text-danger, เมื่อ =0) / ไม่มี badge (>0 หรือ untracked) |
| Table empty | "ยังไม่มีสินค้าประเภทจับต้องได้ — เพิ่มสินค้าก่อนเพื่อเริ่มจัดการสต็อก" + "+ เพิ่มสินค้า" |
| StockCard toggle / input | "ติดตามจำนวนสต็อก" / "จำนวนสต็อก*" |
| StockCard helper (tracked/untracked) | "ระบบจะตัดสต็อกอัตโนมัติทุกครั้งที่มี order ใหม่ และคืนอัตโนมัติเมื่อยกเลิก" / "ยังไม่ติดตามสต็อกสินค้านี้ — order จะสร้างได้ไม่จำกัดจำนวน" |
| Out-of-stock toast | "สินค้าหมดสต็อก: {ชื่อสินค้า, ...}" |
| Admin | header "รายการเครดิตล่าสุด" / locked badge "ล็อกจากเครดิตไม่พอ เมื่อ {formatDateTime(lockedAt)}" / empty "ยังไม่มีรายการ" |

# Design decisions
1. Pricing card 1 ใบไม่ใช่ grid 4 (feature มีแผนเดียว flat ฿199, BR-INV-01)
2. ไม่ทำ inline stock-edit ในตาราง (TD-005) — แก้ที่ product form เท่านั้น
3. AdvanceWarningBanner (warning) แยกจาก LOCKED banner (danger) — คนละ severity/context
4. Confirm = Sweet Alerts (การเงิน blocking, Hard Rule 9) ไม่ใช่ pacesToast
5. เมนูแสดงเสมอไม่ซ่อน (FR-INV-07-AC-01 conversion) — server-side gate ที่ InventoryPage = enforcement จริง

# Chrome DevTools visual QA (end-of-phase)
(a) pricing card เดี่ยว — เช็คไม่มี arbitrary value หลุด (Hard Rule 7)
(b) badge สี/ตำแหน่ง sidebar 3 สถานะ (mobile + desktop)
(c) `.form-switch` tap-target ≥44px mobile
(d) InventoryManagementTable responsive mobile-card fallback

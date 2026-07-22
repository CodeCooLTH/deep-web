# Scope Baseline — Impeccable Remediation: Backoffice (Paces)

> สถานะ: **DRAFT**
> อ้างอิง: `docs/conventions/impeccable-design.md`, `.impeccable/design.json`, `DESIGN.md` (ไม่ใช่ FR ใหม่ — เป็น remediation ของงาน UI ที่มีอยู่แล้วให้ตรง design system; ไม่มี business rule ใหม่)
> ขอบเขต: `src/app/(paces)/**` (seller + admin) — งาน class/token/สี-level เกือบทั้งหมด ยกเว้น S-A1 ที่แตะ logic การคำนวณสีจริง
> ที่มา: Impeccable audit 3 รอบ (backoffice, coverage-completion) — finding BO-01..BO-06 + BO2-01..BO2-04
> วันที่ตั้ง baseline: 2026-07-22

---

## Goal

แก้ finding ที่ audit เจอใน backoffice (Paces) ให้ตรง Impeccable design system (token, Verified-Means-Green, Ink Plum, ไม่มี Vuexy mood bleed) — โดยไม่แตะ business logic ยกเว้นบั๊กสีสถานะการ์ด CANCELLED ที่ audit พบและ user สั่งแก้เป็นกรณีพิเศษ

---

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ S-id ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | Priority | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|----|--------|----------------------|-------|
| S-A1 | P1 | (BO-01) แก้ตรรกะสี badge `OrdersStatCard.tsx:59-68` ให้แยกตามสถานะการ์ด — `CANCELLED` เพิ่ม→danger / ลด→success (invert) หรือ neutral เสมอ ไม่ใช้กฎ `changePct>0→success` แบบเดียวกับการ์ดอื่น | Vitest ใหม่: การ์ด `CANCELLED` + `changePct>0` → คืนคลาส `danger`; การ์ดอื่น `changePct>0` → ยังคง `success` (ไม่รีเกรส); `tsc` = 0; `npm run test` ผ่าน | TODO |
| S-A2 | P1 | (BO-02) `badges/BadgeDetailModal.tsx:276,285,314` — แทน gradient/hex indigo-violet นอก token ด้วย Paces token | `rg '#7c3aed\|#a855f7\|#6366f1\|rgba\(139,\s*92,\s*246' BadgeDetailModal.tsx` = 0; แทนด้วย `bg-primary` / `bg-{semantic}/15` | TODO |
| S-A3 | P1 | (BO-03+BO2-02) ตัด `uppercase` / `tracking-wide(st)` บนข้อความไทย **13 จุด / 10 ไฟล์** (ดูตารางเต็มด้านล่าง) | `rg 'uppercase\|tracking-wide' <13 จุดที่ระบุ>` = 0; ข้อความไทย render normal case; visual diff ไม่มี layout แตก | TODO |
| S-A4 | P1 | (BO-04) ลบไฟล์ `seller/(dashboard)/_shared/IdentityBar.tsx` (dead code พก Vuexy mood: `#F8F7FA` Cool Mist, `text-[#28C76F]`, hex ลอย 5 จุด) **+ อัปเดต comment กำพร้าใน `SellerMobileHeader.tsx:10,15,16,39`** ที่อ้างถึงไฟล์นี้ | ก่อนลบ re-verify `rg -n "from.*IdentityBar\|import IdentityBar" src` = 0; หลังลบ `tsc` = 0 ไม่มี broken import; `rg -n "IdentityBar" SellerMobileHeader.tsx` = 0 (comment อัปเดตแล้ว) | TODO |
| S-A5 | P1 | (BO2-01) `not-found.tsx:28` gradient text ม่วง→แดงบนเลข 404 → solid color | `rg 'bg-clip-text\|text-transparent' not-found.tsx` = 0; ใช้ class สี solid เดียว | TODO |
| S-A6 | P1 | (BO2-03) `AuctionConsoleClient.tsx:110-114` Sweet Alert hardcode hex → `getColor()` token | `rg '#ff9f43\|#1e293b\|#5b6678\|#94a3b8' AuctionConsoleClient.tsx` = 0; `getColor(` ปรากฏแทน; `#236dc9` (Paces primary จริง) ยังอยู่ไม่ถูกแตะ | TODO |
| S-A7 | P2 | (BO2-04) `ProductDetails.tsx:29-33` badge `SERVICE` ใช้ `bg-success/15 text-success` (หมวดหมู่ ไม่ใช่สถานะ) → เปลี่ยนเป็นสีที่ไม่ใช่ success/verified-green | บรรทัด badge `SERVICE` ไม่มี token `success`; ใช้ semantic token อื่น (ดู Assumption A-2) | TODO |
| S-A8 | P2 | (BO-05) เติม comment `HR7:` กำกับ arbitrary value ที่ขาด 6 จุด | `HR7:` ปรากฏติดกับทุก arbitrary value ที่ระบุ (6 จุด) | TODO |
| S-A9 | P2 | (BO-06) `admin/auth/verify-otp/page.tsx:48` literal `#313a46` → `var(--color-dark)` (ค่าเดียวกันเป๊ะ — hygiene ไม่ใช่ mood bleed) | `rg '#313a46' verify-otp/page.tsx` = 0 | TODO |
| S-A10 | P2 | **(doc-only)** เขียนข้อยกเว้น `border-s-3 border-{color}` ลง `DESIGN.md` ให้เอกสาร 2 ชั้นเลิกขัดกัน | `rg -n "border-s-3" DESIGN.md` มี entry อธิบายเหตุผล exception + ระบุว่ายังใช้ในโค้ดต่อ | TODO |

### S-A3 — 13 จุดเต็ม (10 ไฟล์)

| # | ไฟล์ | บรรทัด |
|---|------|--------|
| 1-3 | `seller/(dashboard)/badges/BadgeDetailModal.tsx` | 334, 367, 420 |
| 4-5 | `seller/(dashboard)/badges/BadgeGrid.tsx` | 139, 191 |
| 6 | `src/views/dashboards/ecommerce/StatisticCard.tsx` | 37 |
| 7 | `seller/(dashboard)/dashboard/components/StatisticCard.tsx` | 30 |
| 8-12 | `seller/(dashboard)/products/[id]/components/ProductDetails.tsx` | 70, 74, 78, 82, 95 |
| 13 | `seller/(dashboard)/settings/page.tsx` | 51 |
| 14 | `seller/(dashboard)/not-found.tsx` | 29 |
| 15 | `seller/(dashboard)/wallet/components/WalletCard.tsx` | 87 |
| 16 | `seller/(dashboard)/verification/components/LevelCard.tsx` | 122 |
| 17-18 | `admin/(dashboard)/scam-reports/[id]/page.tsx` | 47, 119 |

> **หมายเหตุ StatisticCard — Controller verify แล้ว (2026-07-22):** มี **สองไฟล์คนละตัว** class string เหมือนกันเป๊ะ (`text-default-400 text-sm uppercase mb-2 font-medium`) แต่ audit จับได้แค่ไฟล์เดียว
> - `src/views/dashboards/ecommerce/StatisticCard.tsx:37` → consumer เดียว = `admin/(dashboard)/dashboard/page.tsx:115`
> - `seller/(dashboard)/dashboard/components/StatisticCard.tsx:30` → consumer เดียว = `seller/(dashboard)/dashboard/page.tsx:349`
>
> grep ยืนยันแล้วว่า **ไม่มีหน้านอกสโคปใช้ร่วม** → open question ปิดแล้ว แก้ได้เลย **ต้องแก้ทั้ง 2 ไฟล์ใน S-id เดียวกัน** ไม่งั้น admin กับ seller hierarchy ไม่ตรงกัน

### S-A8 — 6 จุด

`admin/(dashboard)/orders/components/OrdersTable.tsx:108,133,163` · `seller/(dashboard)/customers/components/CustomerTable.tsx:199` · `seller/(dashboard)/reviews/components/ProductReviews.tsx:275` · `seller/(dashboard)/products/[id]/components/ProductReviews.tsx:177`

---

## ไฟล์ที่แตะ / Base guidance (Hard Rule 3)

| ID | ไฟล์ที่แตะ | Base: |
|----|-----------|-------|
| S-A1 | `OrdersStatCard.tsx` (+ test ใหม่) | ไฟล์เดิม — แก้ logic ตาม audit finding ไม่ใช่หน้าใหม่ |
| S-A2 | `BadgeDetailModal.tsx` | ไฟล์เดิม — token normalization ตาม `.impeccable/design.json` |
| S-A3 | 10 ไฟล์ตามตารางด้านบน | ไฟล์เดิม — ลบ uppercase/tracking ตาม `docs/conventions/impeccable-design.md` |
| S-A4 | `_shared/IdentityBar.tsx` (ลบ) + `_shared/SellerMobileHeader.tsx` (comment) | N/A (deletion) — dead code cleanup, 0 importer confirmed |
| S-A5 | `not-found.tsx` | ไฟล์เดิม |
| S-A6 | `AuctionConsoleClient.tsx` | ไฟล์เดิม — pattern จาก `AuctionPriceChart.tsx`/`ExpectedPriceGauge.tsx` (โฟลเดอร์เดียวกัน) |
| S-A7 | `ProductDetails.tsx` | ไฟล์เดิม |
| S-A8 | `OrdersTable.tsx`(admin), `CustomerTable.tsx`, `ProductReviews.tsx`×2 | ไฟล์เดิม — เติม comment เท่านั้น ไม่เปลี่ยน visual |
| S-A9 | `admin/auth/verify-otp/page.tsx` | ไฟล์เดิม |
| S-A10 | `DESIGN.md` | doc — ไม่บังคับ Base: line |

### Overlap map — ต้อง serialize ห้าม dispatch ขนาน

- **S-A2 ↔ S-A3** — ทั้งคู่แตะ `BadgeDetailModal.tsx` (คนละบรรทัด: 276/285/314 vs 334/367/420)
- **S-A3 ↔ S-A5** — ทั้งคู่แตะ `not-found.tsx` (29 vs 28)
- **S-A3 ↔ S-A7** — ทั้งคู่แตะ `ProductDetails.tsx` (70-95 vs 29-33)

S-A3 เป็น hub ที่เชื่อม S-A2/S-A5/S-A7 → **ทำเป็นลำดับเดียว developer เดียวกัน**

### Parallel plan (ceiling 3 concurrent developer)

| สาย | S-id | หมายเหตุ |
|-----|------|----------|
| dev 1 (chain) | S-A2 → S-A3 → S-A5 → S-A7 | ไฟล์ทับกัน ต้องเรียง |
| dev 2 | S-A1, S-A4 | ไฟล์ไม่ทับใคร |
| dev 3 | S-A6, S-A8, S-A9, S-A10 | ไฟล์ไม่ทับใครและไม่ทับกันเอง |

---

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-A1 | `uppercase` บน `<th>` ของตาราง | theme-inherited จาก Paces baseline เอง (ยืนยันจาก `theme/paces/Admin/TS/.../tables/datatables/*/components/Table.tsx`) — **user ตัดสินแล้วว่านอกขอบเขต** ไม่นับเป็น finding ทั้งรอบนี้และรอบหน้า |
| OOS-A2 | `border-s-3 border-{color}` ตัวโค้ด | **user ตัดสินแล้วว่ารับเป็น Paces exception** เก็บไว้ไม่แก้ (เอกสารข้อยกเว้น = S-A10) |
| OOS-A3 | Coverage ที่ audit ยังไม่ลงลึก: `inventory/**`, `products/**` ส่วนใหญ่, `customers/`, `notifications/`, `reviews/`, seller auth ทั้งชุด, `business/[shopId]/**` | known-gap — audit ลงลึกจริง ~28/281 ไฟล์ (grep ครอบ 100%) รอบถัดไปค่อยเก็บ |
| OOS-A4 | ทุกอย่างใน `(marketing)/**` | มี baseline แยก (public profile) |
| OOS-A5 | `ProfileIdentityBar` ใน `src/views/pages/user-profile/UserProfileHeader.tsx` | **คนละ component กับ `_shared/IdentityBar.tsx` ที่ถูกลบใน S-A4** — ตัวนี้ถูกใช้งานจริง (`user-profile/index.tsx:66`) และอยู่ใน baseline ของ Phase B. ห้ามแตะ ห้าม auto-rename/sed พลาดตัว |

---

## Assumptions

- **A-1 (S-A3):** `StatisticCard` ทั้ง 2 ไฟล์ verify แล้วว่ามี consumer เดียวต่อไฟล์ ไม่ share ข้ามสโคป — แก้ได้โดยไม่ต้องถามใคร (Controller grep ยืนยัน 2026-07-22)
- **A-2 (S-A7):** user บอกแค่ "ไม่ใช่ success/verified-green" ยังไม่ระบุสีปลายทาง — สมมติเป็น `info` (cyan) เพราะเป็นหมวดหมู่ ไม่ใช่สถานะยืนยัน/สำเร็จ และไม่ใช่ `primary` (สงวนไว้ action). ถ้า user ปฏิเสธ เปลี่ยนได้ที่ class เดียว
- **A-3:** backoffice ทั้งหมดอยู่ใต้ `data-skin="default"` (Paces แท้) อยู่แล้ว — verified ที่ `src/app/(paces)/layout.tsx:56` ไม่ต้อง re-verify
- **A-4:** ไม่มี business rule ใหม่ ยกเว้น S-A1 ที่เป็นการแก้บั๊กสีให้ตรงความหมายเดิม ไม่ใช่กฎใหม่

---

## Deferred → Phase 2

- OOS-A3 coverage areas (audit เต็มรูปแบบรอบถัดไป)
- Retire `border-s-3` exception ถาวร ถ้า design system เปลี่ยนใจในอนาคต

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-22 | baseline สร้าง (DRAFT) | kick-off Impeccable remediation — backoffice phase | shinobu22 |
| 2026-07-22 | S-A3 12 → 13 จุด (+ `seller/.../dashboard/components/StatisticCard.tsx:30`) และปิด open question เรื่อง shared component | Controller grep verify เอง พบ `StatisticCard` 2 ไฟล์คนละตัวมีปัญหาเดียวกัน audit จับได้แค่ไฟล์เดียว | Controller |
| 2026-07-22 | S-A4 เพิ่มงานอัปเดต comment กำพร้าใน `SellerMobileHeader.tsx:10,15,16,39` | ลบ `IdentityBar.tsx` แล้วจะทิ้ง comment ที่อ้างถึงไฟล์ที่ไม่มีอยู่ | Controller |

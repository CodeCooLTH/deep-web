# Scope Baseline — Auction Responsive Layout (Group A)

> สถานะ: ACTIVE
> อ้างอิง: `docs/mockups/auction/seller-auction-v1.html` (SSOT ภาพ — ทุก frame D1-D6/T1-T3), feature 00002 Seller Auction (`docs/20 - Features/00002 - Seller Auction/`), feature 00004 Buyer Web Auction (spec `docs/superpowers/specs/2026-07-01-buyer-web-auction-design.md`)
> Build-source SSOT: Paces (`theme/paces/`, docs `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`) สำหรับ seller; Vuexy (`theme/vuexy/`) สำหรับ buyer — mockup บอก "หน้าตาควรเป็นยังไง" ต่อ breakpoint เท่านั้น ไม่ใช่แหล่งให้ copy DOM/CSS ดิบ (Hard Rule 1/6/8 ยังบังคับ)
> ที่มา: static audit ของ auction UI เทียบ mockup → พบ 3 gap responsive-layout ("group A"), user เคาะ maximal-fidelity option ต่อทุกข้อ (2026-07-02)

---

## Goal

ปิด 3 ช่องว่าง responsive-layout fidelity ของ auction UI ให้ตรง mockup ทุก breakpoint — desktop create-form เป็น 2-column, seller list/detail มี tablet content layout ของตัวเอง (ไม่ fallback เป็น mobile), buyer web `/a/[id]` เรนเดอร์ wide layout จริงที่ desktop/tablet แทน mobile-frame 420px — โดยไม่เพิ่มข้อมูล/ฟีเจอร์ใหม่ (layout เท่านั้น) และไม่ลาม scope เข้าไปแก้ shared seller layout (`VerticalLayout`) ที่กระทบทุกหน้า seller

---

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

### กลุ่ม 1 — Seller: Create-form desktop 2-column (gap #1)

| ID | รายการ | Mockup frame | Component | Acceptance (ทดสอบได้) |
|----|--------|--------------|-----------|------------------------|
| S-A1 | `AuctionForm` responsive ladder เต็ม 3 breakpoint: **mobile (< md, ไม่เปลี่ยน)** = single-column + fixed bottom action bar (พฤติกรรมเดิม); **tablet (md–lg, ตาม T2)** = single-column, การ์ด "รูปภาพ" + การ์ด "เผยแพร่" (ปุ่มเผยแพร่+บันทึกร่าง) ต่อท้ายในลำดับ flow เดียวกัน (ไม่ fixed bottom bar ที่ breakpoint นี้); **desktop (≥lg, ตาม D2)** = 2-column grid — ซ้าย stack (ข้อมูลพื้นฐาน/ราคา/เวลา), ขวา sticky rail (การ์ดรูปภาพ + การ์ด "เผยแพร่" แยก, ปุ่ม publish/draft ในการ์ดนั้น, ไม่ใช้ fixed bottom bar ที่ breakpoint นี้) | D2 (L975-1041), T2 (L1424-1466) | `src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionForm.tsx` | วัดที่ 3 viewport จริง (375/834/1440) ด้วย Chrome DevTools MCP: <lg เห็น fixed bottom bar เดิม + single col; md–lg เห็น single col + การ์ดรูปภาพ/เผยแพร่ inline ท้าย form (ไม่มี fixed bar); ≥lg เห็น 2-column grid ตรง D2 (sticky right rail ไม่เลื่อนตามพร้อม scroll ซ้าย); ทุก breakpoint ยังใช้ `.card`/`.f-*`/Paces primitive เดิม ไม่มี arbitrary value ใหม่ (Hard Rule 7); ฟังก์ชัน submit/draft เดิมไม่ regress (Playwright create-auction spec ผ่าน) |

### กลุ่ม 2 — Seller: Tablet content layout สำหรับ list + detail (gap #2)

> **Scope-bound decision (ดู Assumptions #1 + OQ#1):** ทำเฉพาะ **content area** ให้ปรับตาม tablet width ผ่าน `md:` breakpoint ของตัวเอง — **ไม่แตะ sidebar/topbar ที่มาจาก `VerticalLayout`** (icon-rail ใน T1/T3 = **OUT-OF-SCOPE**, ดู OOS-1). ที่ tablet width หน้าเหล่านี้จะยังเห็น chrome แบบ mobile (bottom-nav + mobile header) ต่อไปจนกว่าจะมี phase แยกสำหรับ shared layout. **[รอ Controller/user ยืนยัน OQ#1]**

| ID | รายการ | Mockup frame | Component | Acceptance (ทดสอบได้) |
|----|--------|--------------|-----------|------------------------|
| S-A2 | List page tablet content layout: stat แถวบน → 2×2 grid, chip filter แบบ 5-chip แถวเดียวกระชับ, ตาราง `AuctionDataTable` แสดงเต็มความกว้างแทน card-list มือถือ ที่ `md:` breakpoint | T1 (L1379-1422, ตัด sidebar/topbar ออก) | `src/app/(paces)/seller/(dashboard)/auctions/components/AuctionListClient.tsx`, `AuctionDataTable.tsx`, `AuctionStatStrip.tsx` | วัดที่ 834px: stat = `grid-cols-2`; chip filter row เดียวไม่ wrap ผิด; `AuctionDataTable` render (ไม่ใช่ mobile card list); Paces primitive เท่านั้น (grep arbitrary = 0) |
| S-A3 | Detail console tablet content layout: stat cards + แผงควบคุม + bid monitor + รายชื่อผู้บิด เรียง single-column เต็มความกว้าง ที่ `md:` breakpoint | T3 (L1468+, ตัด sidebar/topbar ออก) | `src/app/(paces)/seller/(dashboard)/auctions/[id]/components/AuctionConsoleClient.tsx`, `AuctionControlPanel.tsx`, `AuctionBidFeed.tsx`, `AuctionInfoCard.tsx`, `AuctionStatCards.tsx`, `ConsoleHead.tsx`, `ExpectedPriceGauge.tsx` | วัดที่ 834px: console เรียง single-column เต็มกว้าง; action buttons wrap-friendly ตาม T3; Paces primitive เท่านั้น |

### กลุ่ม 3 — Buyer: `/a/[id]` web layout (gap #3)

| ID | รายการ | Mockup frame | Component | Acceptance (ทดสอบได้) |
|----|--------|--------------|-----------|------------------------|
| S-A4 | Buyer top navbar ใหม่ (โลโก้ Deep + ลิงก์ "หน้าแรก/ประมูล/หมวดหมู่" + icon ติดตาม/แจ้งเตือน/avatar) — **สร้างและ wire เฉพาะที่ `/a/[id]` เท่านั้น** | D6 navbar block (L1324-1331) | ไฟล์ใหม่ใต้ `src/app/(marketing)/a/[id]/` (เช่น `AuctionNavbar.tsx`) — MUI/Vuexy | navbar render เฉพาะ `≥sm` บน `/a/[id]`; ไม่กระทบ `/o/[token]`/หน้า buyer อื่น; font Anuphan, primary ม่วง Vuexy `#7367F0` |
| S-A5 | `AuctionDetailClient` แตกสาขา breakpoint: `xs` ใช้ `MobileFrame` เดิม; `≥sm` เรนเดอร์ wide layout ~840px centered ใต้ navbar ตรง D6 | D6 (L1320-1375) | `src/app/(marketing)/a/[id]/AuctionDetailClient.tsx` + `AuctionHero/AuctionPriceChart/AuctionBidHistory/AuctionResultCard` (spacing/width adapt) | 375px = `MobileFrame` เดิม 420px เป๊ะ; 900/1440px = wide centered ~840px ใต้ navbar, ไม่มี phone-frame chrome; `MobileFrame.tsx` **ไม่ถูกแก้** (git diff = 0); realtime ไม่ regress |
| S-A6 | `AuctionBidPanel` เพิ่ม variant `≥sm`: quick-bid + "เสนอราคา" + "ซื้อทันที" แถวเดียว (inline) ตาม D6; `xs` คง sticky-bottom เดิม | D6 bid panel (L1352-1359) | `src/app/(marketing)/a/[id]/AuctionBidPanel.tsx` | 900px: "ซื้อทันที" inline แถวเดียวกับ "เสนอราคา"; 375px: sticky-bottom เดิม; bid/buy-now/watch ไม่ regress ทั้ง 2 breakpoint |

**รวม 6 S-id** — S-A1 (gap #1), S-A2+S-A3 (gap #2, content-only bound), S-A4+S-A5+S-A6 (gap #3)

---

## Out-of-Scope (freeze — แตะ = CREEP)

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-1 | **Shared seller sidebar/topbar icon-rail tablet redesign** (`src/layouts/VerticalLayout.tsx`) ตาม T1/T3 sidebar | ไฟล์ shared ของ**ทุกหน้า seller** — กระทบ orders/products/shop/verification ทั้งหมด ต้องมี verification ของตัวเอง → deferred เป็น phase แยก "Seller Shared Layout Tablet Redesign". **[รอ OQ#1 — user อาจ override เข้า scope]** |
| OOS-2 | Global buyer navbar rollout ทุกหน้า `(marketing)/**` | S-A4 scope เฉพาะ `/a/[id]` |
| OOS-3 | "impossible-data" (group B): viewer count, forecast/momentum, per-bidder level badge, block-bidder, FB reactions | Group A = layout เท่านั้น |
| OOS-4 | "available-but-omitted quick-win" (group C) ที่ user ไม่ได้เคาะ | ต้องกลับมาที่ product ก่อน |
| OOS-5 | เปลี่ยน business logic/validation/data-fetch/bid logic | phase นี้ layout-only; ถ้าจำเป็นต้องแก้ logic = report GAP |
| OOS-6 | เปลี่ยนพฤติกรรมปุ่ม publish/draft (validation/confirm ใหม่) | S-A1 ย้ายตำแหน่งปุ่มเท่านั้น |
| OOS-7 | `MobileFrame.tsx` (shared กับ `/o/[token]`) | S-A5 ต้อง import/branch จากภายนอก ห้ามแก้ไฟล์นี้ |

---

## Assumptions & Open Questions

1. **[OQ#1 — ต้อง Controller/user confirm]** Bound ของ gap #2: product แนะนำ **OUT-OF-SCOPE ฝั่งปลอดภัย** (OOS-1: ไม่แตะ `VerticalLayout`) → S-A2/S-A3 จะ**ไม่ตรง T1/T3 100%** ที่ tablet (sidebar ยังเป็น mobile chrome). user เลือก "build tablet design เฉพาะตาม mockup" (รวม icon-rail) โดยรู้ risk แล้ว → **Controller ต้องยืนยันว่าจะ (A) content-only ตาม product / (B) รวม shared sidebar เข้า scope ด้วย**
2. **[OQ#2 — verify แล้ว]** ยืนยัน buyer top navbar ยังไม่มีใน `(marketing)/**` → S-A4 ต้องสร้างใหม่; safepay-ux double-check ว่าไม่มี Vuexy `@layouts`/`@core` component ที่ควร reuse ก่อนสร้างศูนย์
3. `MobileFrame.tsx` shared → S-A5 import/branch จากภายนอกเท่านั้น (OOS-7)
4. Breakpoint: Paces (S-A1-A3) `md` 768=tablet, `lg` 1024=desktop; Vuexy (S-A4-A6) `xs`=มือถือ, `≥sm`=wide
5. AuctionForm มือถือ (< md) ไม่เปลี่ยน (audit ไม่ flag mobile create-form)
6. S-A2/S-A3 restyle ผ่าน `md:` class บน component เดิม ไม่สร้าง component tablet แยกสาย — ถ้าโครงเดิมไม่รองรับ (ต้อง refactor ใหญ่) = report GAP

---

## Definition of Done (DoD)

1. S-A1~S-A6 DONE ตาม acceptance — มีหลักฐาน QA จริง (screenshot/DOM measurement) ไม่ใช่ self-report
2. Chrome DevTools MCP visual QA ทุก S-id ที่ breakpoint จริง (Paces 375/834/1440; Buyer 375/900/1440) เทียบ mockup frame side-by-side
3. `tsc` = ไม่เพิ่ม error เกิน baseline (85 TS2307 asset-import pre-existing, 0 ในไฟล์ auction) — งานนี้ต้อง 0 error ใหม่
4. Hard Rule 7 grep gate: ไม่มี arbitrary Tailwind value ใหม่ใน `(paces)/**` (เว้นมี comment กำกับ)
5. Hard Rule 3: ทุก commit UI มี `Base:` line (Paces/Vuexy primitive) + `Ref-mockup:` frame ID
6. Hard Rule 8: ทุก S-id ผ่าน `safepay-ux` Design Spec ก่อน dev
7. `safepay-reviewer` PASS — grep `react-toastify` ใน `(paces)/**`=0, font Anuphan, ม่วง `#7367F0`=0 ใน `(paces)/**`
8. Playwright E2E auction เดิมเขียวหมด — ไม่ regress
9. ไม่มี CREEP — ทุก commit map S-id; ไม่แตะ OOS-1(`VerticalLayout`)/OOS-7(`MobileFrame.tsx`) เว้น OQ#1 override
10. OQ#1/OQ#2 ตอบก่อนเริ่ม batch ที่เกี่ยว (S-A2/S-A3 รอ OQ#1)

---

## Suggested Build Order / Batching

| Batch | S-id | Mode | dependency |
|---|---|---|---|
| Prereq | Controller ยืนยัน OQ#1 + OQ#2 | — | ไม่บล็อก S-A1 |
| Batch 1 (Paces, parallel ×3) | S-A1, S-A2, S-A3 | parallel | ไฟล์คนละชุด — แต่ละตัวผ่าน `safepay-ux` แยกก่อน dev |
| Batch 2 (Buyer/Vuexy, serial) | S-A4 → S-A5 → S-A6 | serial | S-A5 ต้องมี navbar(S-A4); S-A6 ต้องมี wide container(S-A5) |

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-02 | baseline สร้าง (S-A1~S-A6 In-Scope, OOS-1~7 freeze, OQ#1/OQ#2 เปิดรอ confirm) | ปิด 3 gap responsive-layout จาก static audit; user เคาะ maximal-fidelity + ขอ bound shared sidebar risk | shinobu22 |

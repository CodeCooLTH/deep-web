# Plan — Seller Order Detail Option D (Action-Prominent Lean)

> วันที่: 2026-06-16 · Phase: `seller-order-detail-optionD`
> Design source: `docs/superpowers/specs/2026-06-16-seller-order-detail-improve-options.md` (Option D)
> Baseline page: `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx` (post-redesign v1, merged 2026-06-16)
> Theme: Paces (น้ำเงิน #236dc9) · Retro อ่านแล้ว: `docs/retro/2026-06-16-seller-order-detail-redesign.md`

## Context
Option D เปลี่ยนสถาปัตยกรรม:
- **StatusHeroV2** — เพิ่ม action zone กลับ: ONE primary CTA (state-derived) + overflow `⋮ เพิ่มเติม` (hs-dropdown static — safe เพราะ card ไม่ re-render) สำหรับ secondary (คัดลอกลิงก์, ส่ง SMS). ShipForm expand inline ใต้ CTA. ต้องรับ `fulfillmentMode` กลับ
- **CancelZone** — component ใหม่ "โซนอันตราย" (card dashed danger) แสดงเฉพาะ PENDING/SHIPPED
- **ลบ OrderActionPanel** — logic ย้ายไป StatusHeroV2 + CancelZone
- Desktop 2-col grid คงเดิม; CancelZone sidebar ล่างสุด / mobile ล่างสุดหน้า

## Task List
| # | Path | Theme Base | Scope | Commit Unit |
|---|------|-----------|-------|-------------|
| T1 | components/StatusHero.tsx (modify) | theme/.../order-details/components/OrderSummary.tsx + ui/dropdowns/page.tsx | +fulfillmentMode prop; primary CTA per state; ⋮ hs-dropdown overflow | A |
| T2 | components/CancelZone.tsx (create) | theme/.../order-details/components/CustomerDetails.tsx | card dashed danger + CancelOrderButton reuse; PENDING/SHIPPED only | A |
| T3 | components/OrderActionPanel.tsx (delete) | N/A | ลบไฟล์ + import | B (bundle w/ T4) |
| T4 | page.tsx (modify) | N/A | wire StatusHeroV2 (+fulfillmentMode) + CancelZone; ห้ามแตะ PII mask (S-C1) | B (bundle w/ T3) |

**Bundle:** Unit A (T1,T2) commit แยกได้ (ไม่ depend กัน). Unit B (T3+T4) ต้อง commit พร้อมกัน (ลบไฟล์โดยไม่ wire = tsc break).
**Batch:** Batch1 = T1+T2 parallel → reviewer pass → Batch2 = T3+T4 serial bundle.

## Theme-Source Mapping
| Component | Paces Theme File | Primitives |
|---|---|---|
| StatusHeroV2 shell | order-details/components/OrderSummary.tsx | .card .card-body badge badge-label md:flex md:justify-between gap-base |
| primary CTA | _buttons.css | btn bg-primary text-white hover:bg-primary-hover w-full |
| ⋮ dropdown | ui/dropdowns/page.tsx | hs-dropdown, hs-dropdown-toggle btn bg-light, hs-dropdown-menu, dropdown-item, [--placement:bottom-right] |
| SHIPPED callout | existing pattern | bg-info/15 text-info rounded p-3 |
| CONFIRMED/CANCELLED badge | STATUS_META | badge bg-success/15 / bg-danger/15 |
| CancelZone card | order-details/components/CustomerDetails.tsx | card border border-dashed border-danger, card-header, card-body |
| CancelZone button | CancelOrderButton.tsx (reuse) | btn border-danger text-danger hover:bg-danger/10 w-full |

**hs-dropdown safety:** ปลอดภัยเพราะ StatusHeroV2 static. Reviewer ต้อง verify parent ไม่มี re-render trigger (polling/interval/streaming). ถ้าเสี่ยง → ใช้ `src/components/safepay/FilterDropdown.tsx` แทน.

## Commit Boundaries
1. `feat(seller/order-detail): StatusHeroV2 — primary CTA + overflow dropdown per state`
   Base: theme/.../order-details/components/OrderSummary.tsx + theme/.../ui/dropdowns/page.tsx · S-D1 · HR 3,7,9
2. `feat(seller/order-detail): CancelZone — danger card แยกโซนยกเลิก`
   Base: theme/.../order-details/components/CustomerDetails.tsx · S-D2 · HR 3,7,9
3. `refactor(seller/order-detail): ลบ OrderActionPanel → wire StatusHeroV2 + CancelZone`
   (no UI — wiring) · ห้ามแตะ PII mask (S-C1) · S-D3+S-D4 · tsc 0 ก่อน commit

## Gate Checklist (greps)
- HR3 `Base:` ใน StatusHero + CancelZone
- HR7 `rg "text-\[|bg-\[|rounded-\[|shadow-\[|w-\["` ใน 2 ไฟล์ = 0 (ยกเว้น comment)
- HR7 violet `rg "#7367F0"` = 0
- HR9 `rg "react-toastify" src/app/(paces)/` = 0
- font-mono `rg "font-mono"` ใน StatusHero/CancelZone = 0
- HR2 `rg 'component=\{Link\}'` page.tsx = 0
- deletion `rg "OrderActionPanel" src/` = 0 หลัง Unit B
- hs-dropdown re-render safety (manual code review)

## QA Plan (Chrome DevTools MCP @ seller.deepth.local:4000)
Per state: PENDING+PHYSICAL (primary "บันทึกการจัดส่ง" → ShipForm toggle → submit → toast → SHIPPED), PENDING+NO_SHIPPING (primary SendSms + ⋮ overflow → คัดลอกลิงก์ toast), SHIPPED (callout bg-info/15 no button + CancelZone shown), CONFIRMED (badge success + CancelZone hidden), CANCELLED (badge danger + CancelZone hidden).
Visual: computed font = Anuphan (ไม่มี Courier/mono), primary = #236dc9 (ไม่ใช่ม่วง), CancelZone separated, dropdown opens/closes, ShipForm toggle ไม่ jump layout, desktop 2-col คงเดิม.
L3: cancel flow end-to-end + SMS deduct ฿1 untouched + PII flight payload ไม่มี raw phone/email + console 0 error.

## Risks
- **S-C1 PII regression** (HIGH) — page.tsx ห้ามแตะ mask/neutralize; reviewer verify buyerContact=null ยังอยู่
- **fulfillmentMode prop missing** (HIGH, retro P2) — dev ต้องเพิ่ม prop กลับ; reviewer verify interface + call site
- **hs-dropdown re-render** (MED) — fallback FilterDropdown
- **font-mono บน Thai** (MED, retro P1) — grep=0 + QA วัด computed font
- **OrderActionPanel import ค้าง** (LOW) — Unit B bundle จับด้วย tsc
- **git index.lock** (LOW, retro P3) — Controller `rm -f .git/index.lock` ก่อน commit

## Pre-build Gates (workflow)
1. **safepay-product** Gate-0 → scope baseline `docs/scope/2026-06-16-seller-order-detail-optionD-scope-baseline.md`
2. **safepay-ux** Gate (HR8) → Design Spec ย่อย StatusHeroV2 (hs-dropdown markup exact + ShipForm container + CancelZone layout) อ้าง Paces docs — ก่อน T1 developer

## Developer prompt ต้องฝัง
(a) type-drift บังคับแตะไฟล์นอก task → หยุด+รายงาน ห้ามข้าม boundary (retro #3); (b) ห้ามลบ field ที่ไม่รู้ว่า render ที่ไหน (retro P2); (c) ห้าม font-mono บน Thai; (d) hs-dropdown ใส่ `[--placement:bottom-right]`; (e) ห้าม commit เอง — Controller verify+commit (memory feedback_parallel_dev_agents_no_commit)

## Scope IDs
S-D1 StatusHeroV2 · S-D2 CancelZone · S-D3 ลบ OrderActionPanel · S-D4 page.tsx wiring

# Scope Baseline — feat 00009 Deep Stock Pro (Implementation Phase)

สถานะ: ACTIVE
อ้างอิง: `docs/20 - Features/00009 - Deep Stock Pro/{PRD,BRD,SRS,SDS,API,DATABASE,Tests}.md` — BRD FR-DSP-01..12 · SRS TFR-DSP-01..12 · SDS TD-DSP-01..05 · Tests TC-DSP-01..109 (+ regression TC-INV-01..73 จาก 00003)
เจ้าของ scope: `safepay-product` · commit/สถานะ: Controller

## Sign-off ที่ล็อกแล้ว (ข้อเท็จจริง)

| ประเด็น | ค่าที่ล็อก | doc-debt (ยังโชว์ provisional — sync ทีหลัง ไม่ block) |
|---|---|---|
| OD-A (renewal เครดิตไม่พอ) | **Lock ทั้งก้อน** ไม่ auto-downgrade | PRD Decisions Log, SRS TFR-DSP-06 |
| `WalletTransaction.reason` | **machine-key** + `WALLET_REASON_LABEL_TH` map ไทย | DATABASE §3.4, API §8 |
| OD-B (Variant) | **ไม่มีใน 00009** → 00010 | resolved |
| OD-E (Alert channel) | **reuse `activity.service` timeline** (source 5) | resolved |
| OD-C (audit log) | **record-always ทุก package, gate เฉพาะการแสดงผล PRO** | user confirm ผ่าน Controller |
| OD-D (free trial) | **ไม่มีใน MVP** | user confirm ผ่าน Controller |

## Goal

ส่ง Deep Stock Pro (2 แพ็กเกจ stack: Deep Stock ฿199 / Deep Stock Pro ฿599, ไม่มี proration) ขึ้นใช้จริง — Manual Stock Adjustment (grandfather ทุก package), Low-Stock Alert, Stock Movement/Audit Log (record-always), CSV Import/Export (Pro-only), Admin label แยกแพ็กเกจ — **โดยไม่ regress 00003 (live prod) และ core Order/Product flow**

---

## Batch Plan (ลำดับบังคับ — ≤3 concurrent, independent=คนละไฟล์)

| Batch | S-id | เหตุผล |
|---|---|---|
| **0 — Foundation (blocking, solo)** | S-1 | ทุก batch ถัดไปพึ่ง type/schema/lib |
| **1 — Service core** | S-2, S-3, S-4 | 3 service คนละไฟล์ พึ่ง S-1 — parallel ได้ |
| **2 — Service HIGH-RISK + independent** | S-5, S-6 | S-5 พึ่ง S-3; S-6 พึ่ง S-1 |
| **3 — Routes (entitlement)** | S-7, S-8, S-9 | พึ่ง batch 1/2, คนละ route |
| **4 — Routes (Pro)** | S-10, S-11, S-12 | คนละไฟล์ |
| **5 — Gate/style-map** | S-13, S-14 | ต้องเสร็จก่อน UI |
| **6 — UI ชุด 1 (ux ก่อน)** | S-15, S-17 | ไม่พึ่งกัน |
| **7 — UI ชุด 2 (ux ก่อน)** | S-16, S-18, S-19 | คนละไฟล์ |
| **8 — UI ชุด 3 (ux ก่อน)** | S-20, S-21 | คนละไฟล์ |
| **9 — Tests + Regression (blocking)** | S-22, S-23, S-24 | S-24 ต้อง PASS ก่อน merge |

🛑 **CHECKPOINT (ไม่ใช่ S-id) — APPLY migration ลง DB:** S-1 เขียน migration file ได้ทันที (ไม่แตะ DB) แต่ `prisma migrate deploy` จริง (Supabase dev=prod แชร์) **ต้องขอ user ยืนยันก่อนเสมอ**. Batch 1 เขียนโค้ด+tsc ได้หลัง `prisma generate` แต่ QA/runtime กับ DB ต้องรอ apply.

---

## In-Scope — ไฟล์ / Dependency

| ID | รายการ | ไฟล์ | ประเภท | Dep |
|----|--------|------|--------|-----|
| **S-1** | Schema + Migration file + Foundation libs | `prisma/schema.prisma` (enum `InventoryPackage`, model `StockMovement`, enum `StockMovementSource`, `Product.lowStockThreshold` + back-relations); `prisma/migrations/<ts>_add_deep_stock_pro_schema/migration.sql` (DATABASE §5.2 additive-only, NOT VALID+VALIDATE); `src/lib/inventory-addon.ts` (breaking `WALLET_DESC`→function + PACKAGE_PRICE/LABEL/WALLET_REASON/LABEL_TH); `src/lib/csv.ts` (ใหม่ pure); `src/lib/validations.ts` (Subscribe/Reactivate breaking + ManualStockAdjust/MovementHistoryQuery/CsvImport + lowStockThreshold) | schema+lib | — |
| **S-2** | Entitlement service package-aware | `src/services/inventory-entitlement.service.ts` | service | S-1 |
| **S-3** | Stock service manual/movement/CSV | `src/services/inventory-stock.service.ts` | service | S-1 |
| **S-4** | Product service lowStockThreshold | `src/services/product.service.ts` | service | S-1 |
| **S-5** | ⚠️ Order service StockMovement insert (HIGH RISK, live prod) | `src/services/order.service.ts` | service | S-3 (hard) |
| **S-6** | Activity service Low-stock source 5 | `src/services/activity.service.ts` | service | S-1 |
| **S-7** | Subscribe/Reactivate route breaking body | `src/app/api/inventory/subscribe/route.ts`, `.../reactivate/route.ts` | route | S-2 (hard) |
| **S-8** | Upgrade route (ใหม่) | `src/app/api/inventory/upgrade/route.ts` | route | S-2 |
| **S-9** | Manual adjust route (ใหม่) | `src/app/api/inventory/stock/adjust/route.ts` | route | S-2,S-3 |
| **S-10** | Movement history route (PRO-gate) | `src/app/api/inventory/movements/route.ts` | route | S-2,S-3 |
| **S-11** | CSV export/import route (PRO-gate) | `src/app/api/inventory/csv/export/route.ts`, `.../csv/import/route.ts` | route | S-2,S-3 |
| **S-12** | Products route lowStockThreshold guard | `src/app/api/products/route.ts`, `.../products/[id]/route.ts` | route | S-2,S-4 |
| **S-13** | Menu gate package-aware | `.../seller/(dashboard)/_seller-menu.ts`, `.../layout.tsx` | route/layout | S-2 |
| **S-14** | Activity style-map LOW_STOCK_ALERT | `.../notifications/components/NotificationFeed.tsx`, `.../dashboard/components/RecentActivityFeed.tsx` | ui-additive | S-6 |
| **S-15** [UI] | `PackageSelector` (ใหม่) | `.../inventory/components/PackageSelector.tsx` | ui | S-7,S-8 · ux ก่อน |
| **S-16** [UI] | `/inventory` page 2-package gate + Pro section | `.../inventory/page.tsx` | ui | S-15,S-2 (hard) · ux ก่อน |
| **S-17** [UI] | `ManualAdjustModal` (ใหม่) | `.../inventory/components/ManualAdjustModal.tsx` | ui | S-9 · ux ก่อน |
| **S-18** [UI] | `CsvImportModal` (ใหม่) | `.../inventory/components/CsvImportModal.tsx` | ui | S-11 · ux ก่อน |
| **S-19** [UI] | Movement history page (ใหม่) | `.../inventory/movements/[productId]/page.tsx` + component | ui | S-10 · ux ก่อน |
| **S-20** [UI] | Product edit lowStockThreshold field | `.../products/[id]/edit/page.tsx`, `ProductStockCardV2.tsx` | ui | S-12 · ux ก่อน |
| **S-21** [UI] | Admin topup detail package badge | `.../admin/(dashboard)/topups/[id]/page.tsx` | ui | S-1,S-2 · ux ก่อน |
| **S-22** | Unit + service-integration test specs | Vitest specs ใหม่ | test | S-1..S-6 |
| **S-23** | Playwright E2E specs | `e2e/*.spec.ts` ใหม่ | test | S-15..S-21 |
| **S-24** | 🛑 Regression Gate (BLOCKING) | TC-INV-01..73 (00003) + `npm run e2e` เต็ม | test | ทุก S-id |

TC/TFR mapping ต่อ S-id: ดู SDS §1.2 + Tests.md §3 Traceability (ไม่ duplicate ที่นี่).

---

## Breaking-Signature Sync Map (5 จุด — commit ติดกันเสมอ กัน tsc พัง)

| # | จุด | Definer | Consumer (sync บังคับ) |
|---|---|---|---|
| 1 | subscribe/reactivate +param `pkg` | S-2 | S-7 |
| 2 | `shouldWarnAdvance` +field `package` | S-2 | S-16 (`inventory/page.tsx:108-143`) |
| 3 | `WALLET_DESC` object→function | **S-1** | S-2 (S-1 ทำ service เดิม compile พัง — S-1→S-2 ต้องติดกัน) |
| 4 | `deductStockForOrderItems` `Set→Map` | S-3 | S-5 |
| 5 | `restockFromCancelledOrder` +param `shopId` | S-3 | S-5 |

**dispatch:** developer คนเดียวรับคู่ (S-1→S-2) และ (S-3→S-5) ต่อเนื่อง ไม่ split ขนาน.

---

## 🛑 Regression Gate (Blocking ก่อน merge/sign-off)

S-5 แก้ `order.service.ts` (live prod, 00003 SIGNED-OFF) = HIGH RISK. ก่อน merge S-24 ต้องรัน TC-INV-01..73 เต็มชุด (เน้นหมวด L backward-compat) + `npm run e2e` เต็ม — PASS 100%. FAIL แม้ 1 = BLOCKED. Gate 1 audit ของ batch ที่แตะ S-5 ต้องแนบหลักฐาน regression.

## UI Gate (Hard Rule 8 — mandatory)

S-15,S-16,S-17,S-18,S-19,S-20,S-21 ต้องผ่าน `safepay-ux` Design Spec **ก่อน** developer เสมอ (แม้ field เดียว) — Paces docs + `paces-component-reference.md`; ห้าม arbitrary value (HR7); toast=pacesToast (HR9); confirm=Sweet Alerts.

---

## Out-of-Scope (แตะ = CREEP)

OOS-1 Variant→00010 · OOS-2 downgrade self-service · OOS-3 proration · OOS-4 package ที่ 3+ · OOS-5 free trial · OOS-6 SKU cap · OOS-7 reorder/analytics · OOS-8 barcode · OOS-9 supplier mgmt · OOS-10 admin แก้ entitlement/stock ตรง · OOS-11 stock DIGITAL/SERVICE/SUB · OOS-12 relabel legacy reason ย้อนหลัง · OOS-13 StockMovement retention job · OOS-14 alert dedup persisted-state · OOS-15 CSV async queue/import-history table

## Assumptions

- Migration apply = checkpoint แยก ต้องขอ user ยืนยันก่อน (dev=prod แชร์)
- OD-C/OD-D resolved ตาม docs build ทั้งชุด
- reason machine-key adopt แล้ว; PRD/BRD literal string = doc-debt (safepay-docs sync หลัง phase)
- ไม่มี HTML mockup แยก — UI ใหม่ยังผ่าน safepay-ux ตามปกติ

## Deferred → Phase 2 (ไม่นับ GAP)

Variant→00010 · Reorder/analytics · StockMovement retention job

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | อนุมัติ |
|--------|-----------|--------|---------|
| 2026-07-02 | baseline สร้าง | - | - |

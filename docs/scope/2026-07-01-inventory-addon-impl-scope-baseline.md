# Scope Baseline — Inventory Add-on Implementation Phase

สถานะ: SIGNED-OFF (2026-07-01)
อ้างอิง PRD: `docs/20 - Features/00003 - Inventory Add-on/PRD.md` §4-5, FR-INV-01..13 (BRD) · SRS TFR-001..013 · spec: `docs/20 - Features/00003 - Inventory Add-on/SDS.md`
phase-id: `inventory-addon-impl`

## Goal

Implement Inventory Add-on (feature 00003) ตาม SDS §11 ให้ครบ Task 0-15 — seller ที่สมัคร ฿199/เดือน ใช้ตัดสต็อกอัตโนมัติ (order create/cancel), renew/lock/reactivate ผ่าน wallet เดิม และ shop ที่ไม่สมัคร (majority) ต้อง**ไม่มี behavior เปลี่ยนแม้แต่น้อย** (zero regression บน core Order/Product flow ที่รันบน prod อยู่แล้ว)

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP. S-id = เลข Task ใน SDS §11 (Task 0..15) เพื่อ trace ตรงกัน

| ID | Task (SDS §11) | ไฟล์ | FR-INV / TFR ที่ตอบ | Acceptance (ทดสอบได้) | Risk | สถานะ |
|----|----|------|----|----|----|----|
| S-0 | Task 0 — Apply migration (prerequisite, ต้อง user ยืนยันก่อน touch prod-shared Supabase) | `prisma/schema.prisma` + migration file (safepay-database ทำ, ดู `DATABASE.md` §5) | รองรับ TFR-001..013 ทั้งหมด | `prisma migrate deploy -e .env.local` สำเร็จไม่มี error; `InventoryEntitlement` table + `Product.stockQty` + `OrderItem.stockDeducted` + `WalletTransaction.reason` มีจริงใน DB; ทุก field ใหม่เป็น optional/nullable ไม่ทำ existing row พัง | **สูง** — touch prod-shared Supabase (dev=prod DB เดียวกัน) | TODO |
| S-1 | Task 1 — Constants | `src/lib/inventory-addon.ts` (ใหม่) | ฐานของทุก FR-INV | ไฟล์ export `EntitlementStatus`, `INVENTORY_ADDON_PRICE=199`, `INVENTORY_RENEWAL_PERIOD_DAYS=30`, `INVENTORY_ADVANCE_WARNING_DAYS=3`, `WALLET_REASON`, `WALLET_DESC`, `WALLET_REASON_LABEL_TH`, `addDays()`; ไม่มี import อื่น (pure module); tsc 0 | ต่ำ | TODO |
| S-2 | Task 2 — Wallet reason (breaking bundle, **บังคับคอมมิตเดียวกัน**) | `src/services/wallet.service.ts` (`deductCredit` +param `reason`, `getTransactions` +select `reason`) + `src/app/api/orders/[token]/send-sms/route.ts` (call-site fix) | FR-INV-13, รองรับ TFR-001/002/006 | `deductCredit` signature ใหม่ compile ผ่านทุก call-site (grep 0 call-site เก่าที่ขาด `reason`); SMS order-link flow เดิมยังทำงานได้ 100% หลังแก้ (regression) | **สูง** — signature ที่มีอยู่แล้วกระทบ SMS Wallet subsystem (feature เดิม, prod live) | TODO |
| S-3 | Task 3 — Entitlement service | `src/services/inventory-entitlement.service.ts` (ใหม่) | FR-INV-01,02,03,04,05,06; TFR-001..004,006 | `subscribeInventoryEntitlement`/`reactivateInventoryEntitlement`/`renewOrLockEntitlement`/`getEntitlementStatus`/`isEntitlementActive`/`shouldWarnAdvance` ผ่าน unit test ตาม Tests.md | กลาง | TODO |
| S-4 | Task 4 — Stock service | `src/services/inventory-stock.service.ts` (ใหม่) | FR-INV-09,10,11; TFR-009,010,011 | `deductStockForOrderItems` all-or-nothing; `restockFromCancelledOrder` คืนตาม `stockDeducted` จริง ไม่สนสถานะ entitlement ปัจจุบัน (BR-INV-12); untracked product (`stockQty=null`) ไม่ถูกนับเป็นหมดสต็อก | กลาง | TODO |
| S-5 | Task 5 — Order service rewrite (**highest risk**) | `src/services/order.service.ts` (`createOrder`/`cancelOrder` → transactional) | FR-INV-09,10,12; TFR-009,010,012; TD-001 | retry loop ครอบ `$transaction` ทั้งก้อน (ไม่ retry-inside-tx); shop `entitlementStatus!==ACTIVE` → behavior **เหมือนเดิมทุกประการ** (regression suite ผ่าน 100%, FR-INV-12-AC-04); external contract ไม่เปลี่ยน | **สูงสุด** — จุดเดียวที่แก้ core order flow ที่รันบน prod จริงทุกวัน | TODO |
| S-6 | Task 6 — Proxy CSRF fix (TD-002) | `src/proxy.ts` | TFR-013 (cron ต้องยิงได้จริง) | `pathname.startsWith('/api/cron/')` ถูก exclude จาก Origin-check เท่านั้น (rate-limit ยัง apply); path อื่นยังถูกคุ้มครองเหมือนเดิม | **สูง** — แก้ security middleware ที่ครอบทุก mutation route ของทั้งระบบ | TODO |
| S-7 | Task 7 — Cron route | `src/app/api/cron/inventory-renewal/route.ts` (ใหม่) | FR-INV-02,04; TFR-002,004,013 | `Authorization` ไม่ตรง `CRON_SECRET` → 401 ไม่แตะ DB; ตรง → loop shop ACTIVE+`nextRenewalAt<=now`, per-shop try/catch, คืน `{processed, renewed, locked, errors}` | กลาง | TODO |
| S-8 | Task 8 — Cron config | `vercel.json` (`crons` array) | รองรับ S-7 | valid JSON, schedule `"0 19 * * *"` (1 ครั้ง/วัน — Hobby), deploy ไม่ fail | ต่ำ | TODO |
| S-9 | Task 9 — Subscribe/Reactivate API | `src/app/api/inventory/subscribe/route.ts` + `.../reactivate/route.ts` (ใหม่) | FR-INV-01,06 | 200+ACTIVE เมื่อสำเร็จ; 402 เครดิตไม่พอ; 409 subscribe ซ้ำ/reactivate ตอนไม่ locked; session-auth บังคับ | กลาง | TODO |
| S-10 | Task 10 — Product stockQty wiring (bundle บังคับ 4 ไฟล์) | `src/lib/validations.ts` + `src/services/product.service.ts` + `src/app/api/products/route.ts` + `src/app/api/products/[id]/route.ts` | FR-INV-08,11; TFR-008 | `stockQty` ผ่านเฉพาะ `type=PHYSICAL` (อื่น=400) + `isEntitlementActive` (ไม่งั้น 403); shop ไม่ active สร้าง/แก้สินค้าแบบเดิมได้ | กลาง | TODO |
| S-11 | Task 11 — Menu gate | `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` + `layout.tsx` | FR-INV-07; TFR-007; TD-004 | เมนู "จัดการสต็อก" แสดงเสมอ; badge "฿199/ด." (NOT_SUBSCRIBED) / "ถูกล็อก" (LOCKED) / ไม่มี (ACTIVE); title resolver ไม่ breaking | ต่ำ | TODO |
| S-12 | Task 12a+12b+12c — Inventory UI (gate/buttons/banner/table/page) | `inventory/page.tsx`, `InventoryGate.tsx`, `SubscribeButton.tsx`, `ReactivateButton.tsx`, `AdvanceWarningBanner.tsx`, `InventoryManagementTable.tsx` (ใหม่ทั้งหมด) | FR-INV-01,03,04,05,06,07; TFR-003,007 | ผ่าน `safepay-ux` Design Spec ก่อน implement (Hard Rule 8 — pre-step บังคับใน S-12); server-side gate = enforcement จริง; Subscribe/Reactivate = Sweet Alerts (Hard Rule 9); gate ไม่ leak stock data | กลาง | TODO |
| S-13 | Task 13 — Product form stock field (bundle บังคับ 3 ไฟล์) | `ProductFormV2.types.ts` + `ProductStockCardV2.tsx` (ใหม่) + `ProductFormV2.tsx` | FR-INV-08; TFR-008 | field แสดงเฉพาะ `type===PHYSICAL && entitlementActive`; toggle null↔0; Yup integer ≥0; shop ไม่ active ไม่เห็น field | กลาง | TODO |
| S-14 | Task 14 — Product page wiring | `new-v2/page.tsx` + `[id]/edit/page.tsx` | รองรับ S-13 | `entitlementActive` ส่งเข้า `ProductFormV2` ถูกต้อง (`isEntitlementActive(shop.id).catch(()=>false)` fail-closed) | ต่ำ | TODO |
| S-15 | Task 15 — Admin extension | `src/app/(paces)/admin/(dashboard)/topups/[id]/page.tsx` | FR-INV-13; TFR-013 | sidebar "รายการเครดิตล่าสุด" 10 รายการล่าสุด + label ไทย `WALLET_REASON_LABEL_TH`; badge "ล็อกจากเครดิตไม่พอ" เมื่อ LOCKED | ต่ำ | TODO |

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). จำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | Low-stock Alert / Notification | PRD §5 — Phase 2 |
| OOS-2 | Stock Movement History / Audit Log | PRD §5 — Phase 2 |
| OOS-3 | SKU-level Variant (สต็อกแยกไซส์/สี) | PRD §5 — Phase 2 |
| OOS-4 | Manual Stock Adjustment หน้าแยก | PRD §5 — Phase 2 |
| OOS-5 | Bulk Import/Export CSV ของสต็อก | PRD §5 — Phase 2 |
| OOS-6 | Voluntary Unsubscribe / Downgrade UI | PRD §5 — Phase 2 (MVP มีแค่ปล่อยเครดิตหมด→ล็อก) |
| OOS-7 | Admin Inventory Dashboard เต็มรูป | PRD §5 — Phase 2 (มีแค่ S-15 sidebar) |
| OOS-8 | Grace Period / Proration / ราคาแบบ tier | PRD §5 — business decision ถาวร, ห้ามเพิ่มโดยไม่ผ่าน Controller+user |
| OOS-9 | เปลี่ยน external contract ของ `POST /api/orders` หรือ `.../cancel` | SDS §9 "ไม่แตะ" — S-5 แก้เฉพาะ internal; เปลี่ยน contract กระทบ buyer-app API + frontend caller นอก scope |
| OOS-10 | inline stock-edit ใน `InventoryManagementTable` | SDS TD-005 — ตาราง = overview เท่านั้น แก้จริงที่ product form (S-13) |
| OOS-11 | ปรับ `creditWallet()` ให้รับ `reason` | SDS §9 ระบุไม่ต้อง (TOPUP ไม่แยก reason) |

**หมายเหตุ scope ของ UI gate (ไม่ใช่ creep):** dispatch `safepay-ux` Design Spec ก่อน implement S-12/S-13 (Hard Rule 8) = ขั้นบังคับภายใน S-12/S-13 เอง ไม่ใช่งานนอก scope. แต่ผล pixel-level ที่ ux เสนอเกิน theme-source mapping ใน SDS §5 (เพิ่ม animation/section ที่ไม่มีใน BRD AC) = creep ต้อง flag

## Assumptions

- Task 0 (migration) ต้องได้รับยืนยันจาก user ก่อน apply — **ได้รับยืนยันแล้ว 2026-07-01 (apply now)** ตาม memory `project_prisma_migration_env_targets`
- S-12 ครอบ sub-task 12a/12b/12c ของ SDS §11 (คง S-id = SDS task number 0..15)
- `CRON_SECRET` ต้องตั้งใน Vercel env (Production) ก่อน S-7/S-8 ทำงานจริงบน prod — ยังไม่ตั้ง = config gap ที่ block เฉพาะ prod cron ไม่ block merge (dev ทดสอบ manual curl + header ตาม SDS §8)
- icon slug `boxes` (S-11) + ตำแหน่งเมนู "STORE" = open question SDS (OTQ §12) — ปรับได้โดยไม่ต้องกลับ scope baseline ตราบใดที่อยู่ในกลุ่ม "STORE"

## Deferred → Phase 2

> จงใจไม่ทำใน phase นี้ — ไม่นับเป็น GAP ตอน audit/sign-off (ตรงกับ OOS-1..8)

Low-stock alert, stock movement history, SKU variant, manual stock-adjustment page, bulk CSV, voluntary unsubscribe UI, admin inventory analytics dashboard เต็มรูป

## Definition of Done (phase นี้)

1. Feature docs 7/7 ผ่าน user review (done ณ วันออก baseline)
2. ทุก S-id (S-0..S-15) สถานะ DONE + acceptance ผ่านตามตาราง
3. `safepay-reviewer` pass ทุก batch (รวม grep gate: `react-toastify` ใน `(paces)/**` = 0, Sweet Alerts กับ confirm การเงิน S-9/S-12, Paces primitive เท่านั้น, `Base:` comment ครบทุก UI commit)
4. `safepay-qa` เขียว **รวม regression suite backward-compat สำหรับ shop `entitlementStatus!==ACTIVE`** (create/edit/cancel order+product เทียบ behavior ก่อน-หลัง 100% ตาม FR-INV-12-AC-04) — **blocking**, ห้าม sign-off ถ้ายังไม่ผ่าน
5. Migration (S-0) applied บน .env.local (prod-shared Supabase) แล้ว — ไม่มี schema drift
6. `tsc` = 0 error ทั้ง repo (signature เปลี่ยนของ S-2/S-5 กระทบ call-site ข้ามไฟล์)
7. ไม่มี CREEP ค้าง (ทุกไฟล์ที่แตะ map S-id ได้, ไม่มี OOS-id ถูกแตะ)
8. `vercel.json` cron config (S-8) deploy ได้จริงโดยไม่ fail จาก Hobby frequency

## Risk Register

| # | Risk | S-id | Mitigation ที่ SDS วางไว้ |
|---|------|------|---------------------------|
| 1 | **Order service regression** (สูงสุด) — core flow prod live ทุกวัน | S-5 | TD-001 (retry ครอบ tx กัน Postgres abort), short-circuit เมื่อไม่ ACTIVE (1 indexed lookup), regression suite blocking ก่อน merge ต่อ |
| 2 | **Migration prod-touch** — dev DB = prod Supabase | S-0 | user ยืนยันแล้ว; field ใหม่ optional/nullable (ไม่ breaking) |
| 3 | **deductCredit signature กระทบ SMS** (prod live, paid) | S-2 | bundle บังคับคอมมิตเดียว; regression test SMS flow ก่อน merge |
| 4 | **3 TD corrections จาก SRS pseudocode ที่มีบั๊ก** | S-5(TD-001), S-3(TD-003), S-4/S-5(TD-006) | SDS §6 ระบุ TD ชัด — dev อ่าน SDS ไม่ใช่ SRS pseudocode ตรง ๆ |
| 5 | **proxy.ts CSRF exclusion กว้างเกิน** | S-6 | exclude เฉพาะ `pathname.startsWith('/api/cron/')`; rate-limit เป็น defense ชั้น 2 |
| 6 | **menu `isDisabled` ไม่ block คลิกจริง** | S-11, S-12 | `InventoryPage` server-side guard = enforcement จริง; route guard S-10 ชั้น 2 |
| 7 | **Cron auth ผิด → deduct โดยไม่ควร** | S-7 | Bearer-only, ตรวจ header ก่อนแตะ DB; per-shop atomic claim (RC-3) กัน double-deduct |

## Change Log

> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-01 | baseline สร้าง (Gate 0); migration apply-now ยืนยัน | เริ่ม implementation phase | user |
| 2026-07-01 | **SIGNED-OFF** — 16/16 S-id DONE, Gate 1 scope-audit PASS, QA 9/9 PASS (regression+happy+gate+admin), DoD 8/8. carries: CRON_SECRET prod env, push, QA nice-to-have | Gate 2 sign-off | safepay-product |

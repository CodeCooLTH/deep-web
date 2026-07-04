---
title: "Tests — Pin Products (ปักหมุดสินค้าเด่น)"
owner: shinobu22
status: draft
module: M00012-PinProducts
version: "1.0"
created: 2026-07-04
tags: [feature, profile, monetization, seller, wallet, tests, qa]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]", "[[DATABASE]]"]
---

> **โมดูล:** M00012-PinProducts · **ประเภทเอกสาร:** Test Plan (Tests.md) · **สถานะ:** Draft
> **เจ้าของเอกสาร:** safepay-qa (ดู [[Feature-Docs-Ownership]])
> **หมายเหตุสำคัญ:** เอกสารนี้เป็น **test plan ล่วงหน้าก่อนมีโค้ด** — ยังไม่มี implementation ให้รัน จึง **ไม่รัน test จริงในรอบนี้**
> เมื่อ developer implement เสร็จแล้ว ให้ QA รอบถัดไปใช้เอกสารนี้เป็น checklist รัน `vitest` + `npm run e2e` จริง แล้วอัปเดตผล PASS/FAIL

---

# Tests: Pin Products — Test Plan

## 0. Traceability Map (ภาพรวม)

| Layer | ครอบ FR | ครอบ S-id | ครอบ TFR/TD |
|-------|---------|-----------|-------------|
| Unit (Vitest) — `pin.service` | FR-PIN-01, 02, 03, 04, 05, 08 | S-1, S-2, S-3, S-4, S-5, S-8 | TFR-01..05, TFR-08, TD-001, TD-002, TD-003 |
| Race condition (Vitest, integration-style) | FR-PIN-03-AC-04, FR-PIN-04-AC-02 | S-3, S-4 | TFR-03, TFR-04, TD-001 |
| API/Integration (Vitest หรือ Playwright API request) | FR-PIN-01..04 | S-1..S-4 | API.md §4, §5 (error code table) |
| E2E (Playwright, mandatory) | FR-PIN-03, 04, 05, 06, 07, 08 | S-3..S-8 | ทุก user journey ใน PRD §10 |
| Regression | FR-PIN-06-AC-02, FR-PIN-07-AC-02 | S-6, S-7 | Zero Regression NFR |
| DB Verify | FR-PIN-01-AC-02 | S-1 | DATABASE.md §9, §6 monitoring query |

**Error-route mapping guard (memory `feedback_service_error_route_mapping`):** ทุก test-case ของ error ต้องยืนยันว่า error ชนิดนั้น throw ได้จริงจาก route ที่ทดสอบเท่านั้น — `NoPinSlotError` ห้ามทดสอบใน `/pin-slots/buy`, `INSUFFICIENT_CREDIT` ห้ามทดสอบใน `/pin` หรือ `/unpin` (ดู API.md §5 บรรทัดเตือน)

---

## 1. Pre-flight Setup (ก่อนรัน suite ใด ๆ)

- [ ] **PRE-01** Migration `add_pin_products_schema` apply แล้วบน dev DB (Supabase `.env.local`) — `npx prisma validate` ผ่าน, `Shop.pinSlots`/`Product.pinnedAt` มีจริงใน DB
- [ ] **PRE-02** Restart dev server หลัง migration (Prisma client เก่าไม่รู้จัก field ใหม่ → session/500 — บทเรียน 2026-06-16)
- [ ] **PRE-03** `WALLET_REASON.PIN_SLOT` + `WALLET_REASON_LABEL_TH.PIN_SLOT` เพิ่มใน `src/lib/inventory-addon.ts` แล้ว (`grep PIN_SLOT src/lib/inventory-addon.ts`)
- [ ] **PRE-04** Seed script พร้อม: แนะนำสร้าง `prisma/qa-seed-pin-products.ts` (pattern เดียวกับ `prisma/qa-seed-inventory-addon.ts`) — สร้าง shop เทส 3 สถานะ: (a) slot ว่าง (pinSlots=1, pinned=0), (b) slot เต็ม เครดิตพอ (pinSlots=1, pinned=1, wallet balance ≥99), (c) slot เต็ม เครดิตไม่พอ (pinSlots=1, pinned=1, wallet balance <99) — username prefix `qa_pin_*` ทั้งหมดเพื่อ cleanup ง่าย
- [ ] **PRE-05** `.env.local` source ก่อนรัน tsx/vitest ที่แตะ DB จริง (`node_modules/.bin/dotenv -e .env.local -- <cmd>`)
- [ ] **PRE-06** ยืนยัน dev server รันจริงก่อน E2E: `curl -s http://seller.deepth.local:4000/ -o /dev/null -w "%{http_code}"` ต้องเป็น 2xx/3xx — **ไม่ start เอง**

---

## 2. Unit Tests (Vitest) — `pin.service.ts`

**File:** `src/services/__tests__/pin.service.test.ts`

### 2.1 `pinProduct(shopId, productId)`

- [ ] **U-01** [FR-PIN-03-AC-01, S-3] slot ว่าง (pinnedCount < pinSlots) → pin สำเร็จ, `pinnedAt` ตั้งเป็นเวลาปัจจุบัน, คืน `{product, pinState}` ที่ `pinnedCount` เพิ่ม 1
- [ ] **U-02** [FR-PIN-04-AC-01, S-4] slot เต็ม (pinnedCount === pinSlots) → throw `NoPinSlotError` (ไม่แก้ DB, `pinnedAt` ยังเป็น null)
- [ ] **U-03** [SDS §pin.service contract, idempotent] pin สินค้าที่ปักหมุดอยู่แล้วซ้ำ → คืน state เดิม **ไม่ error ไม่นับซ้ำ** (`pinnedCount` ไม่เปลี่ยน)
- [ ] **U-04** [FR-PIN-03-AC-03, S-3] productId ไม่ใช่ของ shopId ที่ระบุ (คนละร้าน) → throw `PinProductNotFoundError` (404) — ต้องไม่ leak ว่าสินค้ามีอยู่จริงในร้านอื่น
- [ ] **U-05** productId ไม่มีอยู่จริงเลย → throw `PinProductNotFoundError`
- [ ] **U-06** [TFR-03 postcondition] สินค้า `isActive=false` → throw `PinProductInactiveError` (400) แม้ slot ว่าง
- [ ] **U-07** [TD-001] เรียก `pinProduct` ต้องมีการ row-lock Shop (`SELECT ... FOR UPDATE`) ก่อนนับ pinnedCount — ตรวจผ่าน spy/mock บน `tx.$queryRaw` หรือ integration test §3 (ไม่ mock ก็ได้ถ้า cover ด้วย race test)

### 2.2 `unpinProduct(shopId, productId)`

- [ ] **U-08** [FR-PIN-03-AC-02, S-3] สินค้าปักหมุดอยู่ → unpin สำเร็จ, `pinnedAt=null`, ไม่มีค่าใช้จ่าย, ไม่สร้าง `WalletTransaction`
- [ ] **U-09** [Idempotent] unpin สินค้าที่ไม่ได้ปักหมุดอยู่แล้ว (`pinnedAt` เป็น null อยู่แล้ว) → คืน `200`/state เดิม ไม่ error
- [ ] **U-10** unpin productId ที่ไม่ใช่ของ shop → throw `PinProductNotFoundError`

### 2.3 `buyPinSlotAndPin(shopId, productId)`

- [ ] **U-11** [FR-PIN-02-AC-01, FR-PIN-04-AC-02, S-2, S-4] เครดิต ≥ ฿99 + slot เต็ม → atomic: หัก ฿99 (`WalletTransaction` DEDUCT, `reason=PIN_SLOT`, `amount=99`) + `pinSlots+1` (ถาวร) + `pinnedAt=now()` สินค้าเป้าหมาย — ทุกอย่างสำเร็จพร้อมกันใน 1 tx
- [ ] **U-12** [FR-PIN-02-AC-02, FR-PIN-04-AC-03, S-2] เครดิต < ฿99 → throw จาก `deductCredit` (INSUFFICIENT_CREDIT) → **rollback ทั้งหมด**: ไม่หักเงิน (ตรวจ balance ไม่เปลี่ยน), `pinSlots` ไม่เพิ่ม, `pinnedAt` ยังเป็น null, ไม่มี `WalletTransaction` ใหม่
- [ ] **U-13** [SDS Flow 4.2 "idempotent กัน double-charge"] เรียก `buyPinSlotAndPin` ซ้ำกับ productId ที่ปักหมุดสำเร็จไปแล้ว (retry จาก client) → คืน state ปัจจุบัน **ไม่หักซ้ำ ไม่เพิ่ม slot ซ้ำ** (ตรวจ `WalletTransaction` count ไม่เพิ่ม, `pinSlots` ไม่เพิ่มซ้ำ)
- [ ] **U-14** [FR-PIN-02-AC-04] ยืนยันไม่มี exported function ใดใน `pin.service.ts` ที่ลด `pinSlots` (no-downgrade) — code review assertion / grep, ไม่ใช่ runtime test
- [ ] **U-15** productId ไม่ใช่ของ shop หรือ `isActive=false` → throw error เดียวกับ `pinProduct` (`PinProductNotFoundError`/`PinProductInactiveError`) ก่อนแตะ wallet เลย (ตรวจ balance ไม่เปลี่ยนแม้ error)

### 2.4 `getPinnedProducts(shopId)` / `getPinState(shopId)`

- [ ] **U-16** [FR-PIN-06-AC-01, TFR-06] คืนเฉพาะ `pinnedAt not null` + `isActive:true`, เรียง `pinnedAt` **desc** (ล่าสุดก่อน) — seed 3 สินค้าปักหมุดคนละเวลา ตรวจลำดับ
- [ ] **U-17** ร้านไม่มีสินค้าปักหมุดเลย → คืน `[]` (ไม่ throw, ไม่ fallback)
- [ ] **U-18** [BR-PIN-11 interaction] สินค้าปักหมุดที่ `isActive=false` (ควรถูก auto-unpin ไปแล้ว) ต้องไม่โผล่ในผลลัพธ์แม้ hypothetically `pinnedAt` หลงเหลือ (defense-in-depth check ที่ query filter `isActive:true`)
- [ ] **U-19** `getPinState(shopId)` คืน `{pinSlots, pinnedCount}` ตรงกับข้อมูลจริงใน DB

### 2.5 Auto-unpin ใน `product.service.ts`

**File:** `src/services/__tests__/product.service.test.ts` (เพิ่ม describe block ใหม่ ถ้ายังไม่มีไฟล์ให้สร้างใหม่)

- [ ] **U-20** [FR-PIN-08-AC-01, S-8] `updateProduct(id, {isActive:false})` บนสินค้าที่ปักหมุดอยู่ → `pinnedAt` เป็น `null` ในผลลัพธ์เดียวกับ update `isActive` (single UPDATE statement — ตรวจด้วย mock/spy Prisma call หรือ integration read-back)
- [ ] **U-21** [FR-PIN-08-AC-02, S-8] `deleteProduct(id)` (soft-delete) บนสินค้าปักหมุด → ผลเดียวกับ U-20 (`isActive=false`, `pinnedAt=null`)
- [ ] **U-22** [FR-PIN-08-AC-03] หลัง auto-unpin → `Shop.pinSlots` **ไม่เปลี่ยน** (คงเดิม) — ตรวจ query Shop ก่อน/หลัง
- [ ] **U-23** [FR-PIN-08-AC-04] หลัง auto-unpin → ไม่มี `WalletTransaction` แถวใหม่ถูกสร้าง
- [ ] **U-24** [TFR-08 "reactivate ไม่ auto re-pin"] `updateProduct(id, {isActive:true})` บนสินค้าที่เพิ่ง auto-unpin (เดิม active=false, pinnedAt=null) → เปิดขายกลับมา `isActive=true` แต่ `pinnedAt` **ยังเป็น null** (ไม่ auto re-pin)
- [ ] **U-25** `updateProduct(id, {name:'...'})` (ไม่แตะ `isActive`) บนสินค้าปักหมุดอยู่ → `pinnedAt` **ไม่ถูกแตะ** (ยังปักหมุดอยู่เหมือนเดิม) — กัน regression เผลอ clear ทุกครั้งที่ update

---

## 3. Race Condition Test (สำคัญ — TD-001, ต้องมีก่อน merge)

**File:** `src/services/__tests__/pin.service.race.test.ts` (แยกไฟล์จาก unit ปกติ — ต้องต่อ DB จริง ไม่ mock, รันช้ากว่า unit ทั่วไป)

> ⚠️ ต้องรันกับ DB จริง (dev Supabase ผ่าน `.env.local`) เพราะทดสอบ row-lock `SELECT ... FOR UPDATE` จริง — mock Prisma ไม่จับ race ได้

- [ ] **RACE-01** [FR-PIN-03-AC-04, TD-001, S-3] Seed shop `pinSlots=1`, 2 สินค้า A, B (ยังไม่ปักหมุด, ทั้งคู่ active) → ยิง `Promise.all([pinProduct(shopId,A), pinProduct(shopId,B)])` พร้อมกัน → **ต้องมีแค่ 1 คำสั่งสำเร็จ** (resolve), อีกอันต้อง reject ด้วย `NoPinSlotError` → assert หลังจบ: `pinnedCount` (นับจาก DB จริง) **= 1** (ไม่ใช่ 2) และ `pinnedCount ≤ pinSlots` เสมอ
- [ ] **RACE-02** [FR-PIN-04-AC-02, TD-001, S-4] Seed shop `pinSlots=1`, สินค้า A ปักหมุดอยู่แล้ว (เต็ม), เครดิต wallet = ฿99 (พอซื้อได้ 1 ครั้งเท่านั้น), สินค้า B, C (ยังไม่ปักหมุด) → ยิง `Promise.all([buyPinSlotAndPin(shopId,B), buyPinSlotAndPin(shopId,C)])` พร้อมกัน → **ต้องมีแค่ 1 คำสั่งสำเร็จ** (หัก ฿99 ครั้งเดียว, `pinSlots` เพิ่มแค่ 1), อีกอันต้อง reject ด้วย `INSUFFICIENT_CREDIT` (เพราะ balance เหลือ 0 หลังคำสั่งแรก commit) → assert: `WalletTransaction` (`reason=PIN_SLOT`) มีแค่ 1 แถวใหม่, `pinSlots` เพิ่มแค่ 1, `pinnedCount ≤ pinSlots`
- [ ] **RACE-03** [DB monitoring invariant, DATABASE.md §6] รันคำสั่ง monitoring SQL หลัง RACE-01/RACE-02 ทุกครั้ง:
  ```sql
  SELECT s.id, s."pinSlots", count(p.id) AS pinned_count
  FROM "Shop" s JOIN "Product" p ON p."shopId"=s.id AND p."pinnedAt" IS NOT NULL
  GROUP BY s.id, s."pinSlots" HAVING count(p.id) > s."pinSlots";
  ```
  ต้องคืน **0 แถว** เสมอ (ไม่มี shop ไหนปักหมุดเกิน quota)
- [ ] **RACE-04** [ทางเลือกเสริม stress] ยิง `Promise.all` 5 request `pinProduct` พร้อมกันบน shop ที่มี `pinSlots=2` และสินค้า 5 ชิ้น → ต้องสำเร็จพอดี 2 รายการ, ที่เหลือ reject `NoPinSlotError`, `pinnedCount` สุดท้าย = 2

---

## 4. API / Integration Tests

**File:** `src/app/api/seller/__tests__/pin-routes.test.ts` (หรือ Playwright API request ใน `e2e/pin-products.spec.ts` §5.2 — เลือกอย่างใดอย่างหนึ่ง ไม่ต้องซ้ำ 2 ที่)

### 4.1 `POST /api/seller/products/{id}/pin`

- [ ] **API-01** [401] ไม่มี session → `401 UNAUTHORIZED`
- [ ] **API-02** [404] session ไม่มีร้าน (`requireActiveShop`=null) → `404 SHOP_NOT_FOUND`
- [ ] **API-03** [404] `id` ไม่ใช่ของร้าน session นี้ → `404 PRODUCT_NOT_FOUND` (ownership ที่ WHERE — ต้องยืนยันไม่ leak ว่าสินค้ามีอยู่จริงในร้านอื่น เช่น response message ต้อง generic)
- [ ] **API-04** [400] สินค้า `isActive=false` → `400 PRODUCT_NOT_ACTIVE`
- [ ] **API-05** [409] slot เต็ม → `409 NO_PIN_SLOT` พร้อม error message ภาษาไทยตาม API.md §4.1
- [ ] **API-06** [200 happy] slot ว่าง → `200 {productId, pinnedAt, pinSlots, pinnedCount}` ตรง schema
- [ ] **API-07** [200 idempotent] เรียกซ้ำกับสินค้าที่ปักหมุดอยู่แล้ว → `200` state เดิม ไม่ error
- [ ] **API-08** [CSRF] request ไม่มี valid Origin header (จำลอง cross-site) → block โดย `guardApi`/proxy (ทดสอบผ่าน `page.evaluate fetch` ปกติจะผ่าน เพราะ browser แนบ Origin ให้ — ทดสอบ negative ด้วย raw `page.request` ที่ไม่แนบ Origin ให้เห็น 403)

### 4.2 `POST /api/seller/products/{id}/unpin`

- [ ] **API-09** [200 happy] unpin สำเร็จ → `{productId, pinnedAt: null, pinSlots, pinnedCount}`
- [ ] **API-10** [200 idempotent] unpin ซ้ำ (ไม่ได้ปักหมุดอยู่) → `200` เหมือนกัน
- [ ] **API-11** [401/404] เหมือน API-01/API-03 (คนละเจ้าของ)
- [ ] **API-12** [ไม่มี 409/402] ยืนยัน unpin **ไม่มีทาง** คืน `409 NO_PIN_SLOT` หรือ `402 INSUFFICIENT_CREDIT` (error-route mapping guard)

### 4.3 `POST /api/seller/pin-slots/buy`

- [ ] **API-13** [400] body ไม่มี `productId` หรือไม่ใช่ uuid → `400 VALIDATION_ERROR` (Valibot `BuyPinSlotSchema`)
- [ ] **API-14** [401/404 SHOP_NOT_FOUND/404 PRODUCT_NOT_FOUND/400 PRODUCT_NOT_ACTIVE] เหมือนชุด API-01..04
- [ ] **API-15** [402] เครดิต < ฿99 → `402 INSUFFICIENT_CREDIT` พร้อม error message ตาม API.md §4.3 — ตรวจ DB **ไม่มีการเปลี่ยนแปลง** (`pinSlots`, `pinnedAt`, wallet balance คงเดิม)
- [ ] **API-16** [200 happy] เครดิตพอ → `200 {productId, pinnedAt, pinSlots (+1), pinnedCount}`; ตรวจ DB: `WalletTransaction` ใหม่ (`DEDUCT`, `reason=PIN_SLOT`, `amount=99`), `Shop.pinSlots` +1, `Product.pinnedAt` ตั้งค่า
- [ ] **API-17** [200 idempotent] เรียกซ้ำกับ productId ที่ buy สำเร็จไปแล้ว → `200` ไม่หักซ้ำ (ตรวจ `WalletTransaction` count ไม่เพิ่ม)
- [ ] **API-18** [ไม่มี 409] ยืนยัน `/pin-slots/buy` **ไม่มีทาง** คืน `409 NO_PIN_SLOT` (error-route mapping guard — endpoint นี้ไม่ throw `NoPinSlotError`)

---

## 5. E2E Tests (Playwright — mandatory ตาม memory `feedback_qa_playwright_e2e_mandatory`)

**File:** `e2e/pin-products.spec.ts`
**bypass login:** ใช้ `e2e/helpers/auth.ts` (`createSeller('complete')` + `loginAs`) หรือสร้าง helper เพิ่มเติมเฉพาะ pin (seed shop พร้อม pinSlots/wallet ตามต้องการ ผ่าน Prisma ตรงในไฟล์ spec — pattern เดียวกับ `inventory-addon.spec.ts`)
**cleanup:** ลบ user/shop/product/wallet ที่ seed (`username` prefix `qa_pin_e2e_*`) ใน `test.afterAll`

### 5.1 Seller Products List — Pin/Unpin Toggle

- [ ] **E2E-01** [FR-PIN-03-AC-01, S-3, happy path] Login seller ที่มี slot ว่าง → เปิดหน้า products list → เห็น toggle ปักหมุดที่แต่ละสินค้า → กด toggle สินค้า A → เห็น indicator "ปักหมุดสำเร็จ" (pacesToast) ทันที (optimistic UI) → reload หน้า → toggle ยังแสดงสถานะปักหมุด (persist DB จริง)
- [ ] **E2E-02** [FR-PIN-03-AC-02, S-3] กด toggle unpin สินค้าที่ปักหมุดอยู่ → pacesToast success → toggle กลับสถานะ unpin → reload ยืนยัน persist
- [ ] **E2E-03** [FR-PIN-05, S-5, swap] Slot เต็ม (pinSlots=1, A ปักหมุดอยู่) → unpin A ก่อน (ฟรี) → pin C แทน → ยืนยัน **ไม่มี** Sweet Alert ซื้อ slot ปรากฏขึ้น (เพราะ slot ว่างแล้วหลัง unpin) → DB: A.pinnedAt=null, C.pinnedAt=ตั้งค่าใหม่, ไม่มี `WalletTransaction` ใหม่

### 5.2 Slot-Full → Buy-Slot Dialog

- [ ] **E2E-04** [FR-PIN-04-AC-01/02, S-4, happy path] Seller slot เต็ม (pinSlots=1, A ปักหมุด) เครดิต wallet ≥ ฿99 → กด toggle pin สินค้า B → **Sweet Alert** ปรากฏ "ซื้อ slot เพิ่ม ฿99?" ระบุชัด "ถาวร ไม่มีการคืนเงิน" → กดยืนยัน → pacesToast success → B ปักหมุดสำเร็จ (indicator เปลี่ยน) → reload: `pinSlots` หน้า UI แสดง 2, A และ B ปักหมุดทั้งคู่
- [ ] **E2E-05** [FR-PIN-04-AC-03, S-4, negative — เครดิตไม่พอ] Seller slot เต็ม เครดิต < ฿99 → กด toggle pin B → Sweet Alert ปรากฏ → กดยืนยัน → เห็น validation message "เครดิตไม่พอ กรุณาเติมเครดิต" ใน dialog (ไม่ปิด dialog ทันที ตาม SDS Flow 4.2 `showValidationMessage`) → ปิด dialog เอง → reload: B **ไม่** ปักหมุด, `pinSlots` ไม่เปลี่ยน, wallet balance ไม่เปลี่ยน
- [ ] **E2E-06** [FR-PIN-04-AC-04, negative — ยกเลิก] Seller slot เต็ม → กด toggle pin B → Sweet Alert ปรากฏ → กด "ยกเลิก" → dialog ปิด → ไม่มีการเปลี่ยนแปลงใด ๆ (B ไม่ปักหมุด, ไม่มี network call ไปที่ `/pin-slots/buy`)

### 5.3 Public Profile — Pinned Zone Rendering

- [ ] **E2E-07** [FR-PIN-06-AC-01, S-6, happy path] ร้านมีสินค้าปักหมุด ≥1 (2 ชิ้นขึ้นไปคนละเวลา) → เปิด `/u/{username}` (buyer subdomain) → เห็นโซน "สินค้าปักหมุด" → สินค้าที่ปักหมุดล่าสุดอยู่**ก่อน** สินค้าที่ปักหมุดก่อนหน้า (เรียง `pinnedAt` desc)
- [ ] **E2E-08** [FR-PIN-06-AC-01, S-6] เปิด `/b/{slug}` (ถ้า route นี้ใช้งานได้แล้ว) → ผลเดียวกับ E2E-07 (regression ให้ครอบทั้ง 2 entry point ตาม SRS scope)
- [ ] **E2E-09** [FR-PIN-07-AC-01, S-7, negative] ร้านไม่เคยปักหมุดอะไรเลย (`pinnedCount=0`) → เปิด `/u/{username}` → **ไม่เห็น** โซน "สินค้าปักหมุด" เลย (ตรวจด้วย `take_snapshot`/selector ไม่พบ heading โซนนี้ — ไม่ใช่การ์ดว่าง)
- [ ] **E2E-10** [FR-PIN-07-AC-02] ตรวจ tab/anchor navigation อื่นบนโปรไฟล์ (เช่น tab สินค้าทั่วไป, รีวิว) ยังทำงานปกติแม้ไม่มี tab ปักหมุด — ไม่มี broken anchor/tab ค้าง

### 5.4 Auto-Unpin Lifecycle (cross-surface: seller action → buyer profile)

- [ ] **E2E-11** [FR-PIN-08-AC-01/02, S-8, สำคัญ] Seller ปิดการขาย (`isActive→false`) สินค้าที่ปักหมุดอยู่ จากหน้า products list → pacesToast/สถานะแจ้งชัดว่า auto-unpin เกิดขึ้น (ตาม PRD risk mitigation) → เปิด `/u/{username}` ทันที (คนละ subdomain) → สินค้านั้น **หายจากโซนปักหมุด** ทันที
- [ ] **E2E-12** [FR-PIN-08-AC-01/02, S-8] Seller "ลบ" สินค้าที่ปักหมุดอยู่ (soft-delete ผ่าน `deleteProduct`) → ผลเดียวกับ E2E-11
- [ ] **E2E-13** [FR-PIN-08-AC-03] หลัง auto-unpin (E2E-11) → seller เปิด products list ใหม่ → toggle pin สินค้าอื่นได้ทันที **โดยไม่ต้องซื้อ slot** (ยืนยัน slot คืนแล้ว ไม่ผ่าน Sweet Alert ซื้อ slot)

---

## 6. Regression Tests — Profile Redesign (commit `7d5d247`)

**File:** ผนวกใน `e2e/pin-products.spec.ts` หรือ regression suite เดิมของ profile redesign (ถ้ามี — เช็คก่อนว่าซ้ำหรือไม่)

- [ ] **REG-01** [FR-PIN-06-AC-02, Zero Regression] เปิด `/u/{username}` ของร้านที่**ไม่เคยปักหมุด** (เดิมเคยเห็น "3 ชิ้นแรก" จาก interim logic) → ต้อง**ไม่เห็น**สินค้าใด ๆ ในโซนที่เคยเป็น "3 ชิ้นแรก" อีก (โซนหายไปทั้งหมด ไม่ fallback) — เทียบพฤติกรรมก่อน/หลัง feature
- [ ] **REG-02** ส่วนอื่นของหน้าโปรไฟล์ (trust banner, avatar, badge, avg rating, order count, shop identity) **ไม่เปลี่ยนแปลง** หลัง deploy feature นี้ — screenshot diff หรือ manual compare กับ scope baseline เดิม
- [ ] **REG-03** [`otherProducts` grid] สินค้าที่ไม่ได้ปักหมุด (excludePinned=true) ยังแสดงในกริดสินค้าทั่วไปตามปกติ ไม่หายไปจากระบบ ไม่ซ้ำกับโซนปักหมุด (สินค้าที่ปักหมุดต้อง**ไม่ปรากฏซ้ำ**ทั้ง 2 โซน)
- [ ] **REG-04** [6 call-site เดิมของ `getProductsByShop`] grep หา call-site ทั้งหมดของ `getProductsByShop` นอกเหนือหน้าโปรไฟล์ (เช่น seller dashboard, admin) → ยืนยันยังทำงานปกติ ไม่พังจาก `opts?` param ใหม่ (TD-002 backward-compat)
- [ ] **REG-05** หน้า seller products list เดิม (filter, search, pagination, การแก้ไขสินค้าอื่น ๆ) ไม่เพี้ยนหลังเพิ่ม toggle ปักหมุด — smoke ผ่านทุกฟังก์ชันเดิม

---

## 7. Admin Visibility (FR-PIN-09)

- [ ] **ADM-01** [FR-PIN-09-AC-01, S-9] Admin เปิดหน้า WalletTransaction (`admin/(dashboard)/topups/[id]/page.tsx` หรือหน้ารายการ transaction ที่เกี่ยวข้อง) หลังมีการซื้อ pin slot → เห็น label ภาษาไทย "ปักหมุดสินค้า" (หรือข้อความที่กำหนดจริงใน `WALLET_REASON_LABEL_TH`) แยกชัดจาก SMS/Inventory/Business Package
- [ ] **ADM-02** [FR-PIN-09-AC-02] Transaction เก่าก่อน launch feature (reason=null หรือ reason อื่น) **ไม่ถูก relabel** ย้อนหลัง — ตรวจ transaction เก่ายังแสดง label เดิม

---

## 8. Security / Ownership Guard (cross-cutting)

- [ ] **SEC-01** [BR-PIN-08, TD-005] เรียก `/pin`, `/unpin`, `/pin-slots/buy` ด้วย session ของ seller ร้าน X แต่ระบุ `productId` ของร้าน Y → ทุก endpoint คืน `404 PRODUCT_NOT_FOUND` (ไม่ leak, ไม่มีทาง pin ข้ามร้าน)
- [ ] **SEC-02** [BR-PIN-12] ยืนยันว่าไม่มี endpoint pin/unpin ใน `/api/app/*` (buyer app API) — grep `src/app/api/app/` ต้องไม่มี route เกี่ยวกับ pin
- [ ] **SEC-03** ยืนยัน 3 route ใหม่ไม่รับ `shopId` จาก client body/query (derive จาก session เท่านั้น) — code review + ยิง request แนบ `shopId` ปลอมใน body แล้วดูว่าระบบเพิกเฉย (ยังใช้ shop จาก session)

---

## 9. DB Verify (หลัง migration apply)

**คำสั่ง (safepay-database รันจริงตอน apply — QA verify ซ้ำได้)**

- [ ] **DB-01** [DATABASE.md §9, FR-PIN-01-AC-02] `SELECT count(*) FROM "Shop" WHERE "pinSlots" IS NULL OR "pinSlots" < 1;` → ต้อง **= 0**
- [ ] **DB-02** [DATABASE.md §9] `SELECT count(*) FROM "Product" WHERE "pinnedAt" IS NOT NULL;` → ต้อง **= 0** ทันทีหลัง migration (ยังไม่มีใครปักหมุด)
- [ ] **DB-03** [DATABASE.md §6, monitoring — รันซ้ำเป็นระยะหลัง launch] `SELECT s.id, s."pinSlots", count(p.id) pinned_count FROM "Shop" s JOIN "Product" p ON p."shopId"=s.id AND p."pinnedAt" IS NOT NULL GROUP BY s.id, s."pinSlots" HAVING count(p.id) > s."pinSlots";` → ต้องคืน **0 แถวเสมอ** (ทั้งช่วง QA และหลัง production ใช้งานจริง)
- [ ] **DB-04** ยืนยัน index `Product_shopId_pinnedAt_idx` มีอยู่จริง (`\d "Product"` หรือ query `pg_indexes`)
- [ ] **DB-05** ยืนยัน constraint `Shop_pinSlots_min1` เป็น `VALID` (ไม่ใช่ `NOT VALID` ค้าง) — `SELECT convalidated FROM pg_constraint WHERE conname='Shop_pinSlots_min1';` ต้อง `true`

---

## 10. Manual/Visual QA Checklist (Chrome DevTools MCP — เสริม Playwright)

- [ ] **VIS-01** Sweet Alert dialog "ซื้อ slot เพิ่ม ฿99?" ใช้ Paces Sweet Alerts (ไม่ใช่ `window.confirm`/`alert()`) ตาม memory `feedback_sweet_alerts_modal`
- [ ] **VIS-02** pacesToast (ไม่ใช่ react-toastify) แสดงผลลัพธ์ pin/unpin/buy สำเร็จ/ล้มเหลว — top-right (action) ตาม Hard Rule 9
- [ ] **VIS-03** ไม่มี emoji ใน UI ทุกจุดที่แตะ (toggle icon, indicator "ปักหมุด N/M", dialog, toast) — icon จริงผ่าน `@iconify/react` เท่านั้น (Hard Rule 12)
- [ ] **VIS-04** หน้า seller products list (`(paces)/**`) toggle/indicator ใช้ Paces primitive เท่านั้น (`.card`/`.btn`/token) ไม่มี arbitrary Tailwind value (Hard Rule 7)
- [ ] **VIS-05** โซน "สินค้าปักหมุด" บนโปรไฟล์ (`(marketing)/**`) ใช้ Vuexy component ต่อเนื่องจาก profile redesign เดิม ไม่ใช่ layout ใหม่แปลกแยก
- [ ] **VIS-06** Font Anuphan คงเดิมทุกจุดที่แตะ (ไม่มี font-mono/font อื่นหลุดมา)
- [ ] **VIS-07** mobile viewport (375px) — toggle ปักหมุดในหน้า products list มี tap target ≥44px, Sweet Alert dialog responsive

---

## 11. ยังไม่ได้เทส (Carry — สำหรับ QA รอบถัดไป)

> ณ วันที่เขียนเอกสารนี้ (2026-07-04) **ยังไม่มีโค้ด implement** — รายการทั้งหมดข้างต้นเป็น plan ที่ต้องรันจริงหลัง developer ส่งงาน ไม่มีรายการใดถูก mark PASS ในรอบนี้

**ลำดับที่แนะนำให้ QA รอบถัดไปทำ:**
1. รัน Pre-flight (§1) ยืนยัน migration + dev server + registry key พร้อม
2. รัน Unit tests (§2) + Race condition (§3) ด้วย `npx vitest run src/services/__tests__/pin.service.test.ts src/services/__tests__/pin.service.race.test.ts src/services/__tests__/product.service.test.ts`
3. รัน API/Integration (§4)
4. เขียน + รัน E2E (§5) ด้วย `npm run e2e -- pin-products` (หรือ `npx playwright test e2e/pin-products.spec.ts`)
5. Regression (§6) — เทียบกับ scope baseline ของ profile redesign 2026-07-04
6. Admin (§7), Security (§8), DB verify (§9)
7. Manual/Visual (§10) ผ่าน Chrome DevTools MCP บน `seller.deepth.local:4000` + `deepth.local:4000`
8. อัปเดตเอกสารนี้ให้ทุก checkbox เป็น `[x]` พร้อม evidence (screenshot path `.screenshots/...`, assertion output, console excerpt) ก่อนสรุป VERDICT

**Known risk areas ที่ QA ควรเน้นเป็นพิเศษ** (จาก PRD §6.2 / SDS §6 / DATABASE §10):
- Race condition จริง (ไม่ใช่แค่ unit mock) — ต้องยิง concurrent request จริงผ่าน DB จริง (§3)
- Auto-unpin ครบทั้ง 2 entry point (`updateProduct` + `deleteProduct`) — ลืมจุดใดจุดหนึ่ง = สินค้า inactive ค้างปักหมุด (§2.5, §5.4)
- Breaking type change ข้าม 4 ไฟล์พร้อมกัน (2 page.tsx + profile/index.tsx + views/pages/user-profile/index.tsx) — ต้อง atomic commit เดียว, tsc ต้อง 0 error ก่อน merge
- Idempotency กัน double-charge เมื่อ UI retry (network flaky) — §2.3 U-13, §4.3 API-17

---

**หมายเหตุ:** เมื่อ implement เสร็จและรัน suite จริงแล้ว ให้ QA สร้าง/อัปเดต `docs/qa/pin-products-qa-checklist.md` (reusable regression checklist ตาม pattern `docs/qa/seller-auth-qa-checklist.md`) แยกจากเอกสารนี้ — เอกสารนี้ (`Tests.md`) เป็น test-plan ระดับ feature-doc (SSOT ของ traceability), ส่วน `docs/qa/*.md` เป็น operational checklist สำหรับ QA รันซ้ำทุกรอบ regression

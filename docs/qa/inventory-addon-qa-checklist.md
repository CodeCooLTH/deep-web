# QA Checklist — Inventory Add-on (feature 00003)

> reusable regression checklist · end-of-phase QA รันวันที่ 2026-07-01 (branch `shinobu22/feature-addon-inventory`)
> docs: `docs/20 - Features/00003 - Inventory Add-on/{PRD,BRD,SRS,SDS,DATABASE,API,Tests}.md`
> รันที่ `seller.deepth.local:4000` (seller) + `admin.deepth.local:4000` (admin) — user รัน dev server เอง
> seed: `prisma/qa-seed-inventory-addon.ts` (สร้าง 3 seller + 1 admin, username `qa_inv_*`, password `QaInv@1234!`)
> E2E: `e2e/inventory-addon.spec.ts` (Playwright, 9 tests, bypass login ด้วย NextAuth cookie encode)

## ⚠️ ก่อนเทสทุกครั้ง (pre-flight)
- [ ] dev server รันที่ port 4000 (`curl -s http://seller.deepth.local:4000/ -o /dev/null -w '%{http_code}'` = 3xx ไม่ error)
- [ ] seed ข้อมูลทดสอบ (idempotent — reset สถานะกลับ NOT_SUBSCRIBED/balance เต็มทุกครั้ง):
      `node_modules/.bin/dotenv -e /Users/craftman/Projects/safepay/.env.local -- npx tsx prisma/qa-seed-inventory-addon.ts`
- [ ] รัน E2E: `node_modules/.bin/dotenv -e /Users/craftman/Projects/safepay/.env.local -- npx playwright test e2e/inventory-addon.spec.ts`
      (worktree นี้ไม่มี `.env.local` ของตัวเอง — ใช้ env จาก `/Users/craftman/Projects/safepay/.env.local` แทน `npm run e2e`)
- [ ] cleanup ท้ายรัน: เพิ่ม `-- --cleanup` ต่อท้าย tsx command เดิม (ลบ user/shop/product/order/wallet/entitlement ของ QA ทั้งหมด)
- [ ] `npx tsc --noEmit` → exit 0

## A. 🔴 Regression — shop ไม่มี InventoryEntitlement (NOT_SUBSCRIBED) — **สำคัญสุด, block sign-off ถ้า FAIL**
- [x] สร้าง order PHYSICAL สำเร็จ (201), `OrderItem.stockDeducted = null`, ไม่มี stock check ใด ๆ — PASS (E2E test #1)
- [x] cancel order สำเร็จ (200) ไม่มี error — PASS (E2E test #1)
- [x] product edit form **ไม่มี** field "ติดตามจำนวนสต็อก" โผล่ (entitlementActive=false → `ProductStockCardV2` ไม่ render) — PASS (E2E test #2)
- [x] เมนู "จัดการสต็อก" แสดง badge "฿199/ด." (bg-primary) — PASS (E2E test #3, screenshot)
- [x] `/inventory` เห็น `InventoryGate` pricing card ฿199 + ปุ่ม "สมัครใช้งาน" (aria-label "สมัคร Inventory Add-on") — PASS (E2E test #3, screenshot `.screenshots/2026/7/1/inventory-gate-not-subscribed-153000.png`)
- [ ] (carry) สร้าง product ใหม่ (ไม่ใช่แก้ของเดิม) ด้วยฟอร์มเดิม → ไม่มี field stockQty โผล่ (เทสเฉพาะ edit form รอบนี้ ยังไม่ครอบ create form)

## B. Happy path — subscribe shop
- [x] `/inventory` (NOT_SUBSCRIBED) → เห็น pricing card + ปุ่มสมัคร — PASS
- [x] subscribe (Sweet Alerts confirm → "สมัคร ฿199") → หัก ฿199 จาก `SellerWallet.balance`, สร้าง `WalletTransaction(reason=INVENTORY_SUBSCRIPTION)` — PASS (DB verify)
- [x] entitlement เปลี่ยนเป็น `ACTIVE` (`activatedAt`/`currentPeriodStart`/`nextRenewalAt` set) — PASS (DB verify)
- [x] หน้าเปลี่ยนเป็น `InventoryManagementTable` อัตโนมัติหลัง `router.refresh()` — PASS (E2E test #4)
- [x] ตั้ง stockQty ผ่าน product edit form (toggle "ติดตามจำนวนสต็อก" → กรอกจำนวน → บันทึก) → DB `Product.stockQty` อัปเดตถูกต้อง — PASS (E2E test #5)
- [x] สร้าง order → stock ลดถูกต้อง (`Product.stockQty` decrement, `OrderItem.stockDeducted = qty`) — PASS (E2E test #6)
- [x] cancel order → stock คืนถูกต้อง (`Product.stockQty` กลับค่าเดิม) — PASS (E2E test #6)
- [ ] 🔴 **FAIL** — stock = 0 → สร้าง order → คาดหวัง hard-stop **400 "สินค้าหมดสต็อก"** แต่ระบบตอบ **500 "Order creation failed"**
      (money-safety **ไม่เสียหาย**: order ไม่ถูกสร้างจริง + stock ไม่ถูกตัด — all-or-nothing rollback ทำงานถูกต้อง; ปัญหาคือ error mapping เท่านั้น)
      → root cause: `src/app/api/orders/route.ts` POST handler catch เฉพาะ `ShippingAddressRequiredError` ไม่มี branch สำหรับ `OutOfStockError`
      (`src/services/inventory-stock.service.ts`) → ตกไป generic catch (500). **ต้องแก้ก่อน sign-off ของ scope item นี้**
      — see REWORK section ท้ายรายงาน

## C. Gate states + menu
- [x] NOT_SUBSCRIBED: เมนู "จัดการสต็อก" badge "฿199/ด." — PASS
- [x] LOCKED (seed entitlement LOCKED โดยตรง): เมนู badge "ถูกล็อก" (bg-danger) — PASS (E2E test #8, screenshot)
- [x] LOCKED: `/inventory` เห็น danger banner "ถูกล็อกเพราะเครดิตไม่พอ" + `lockedAt` + ปุ่ม "เปิดใช้งานอีกครั้ง" — PASS (screenshot `.screenshots/2026/7/1/inventory-gate-locked-state-153200.png`)
- [x] LOCKED: ข้อมูล stock เดิมยังอยู่ใน DB (gate ไม่ query/แสดง table แต่ data ไม่หาย, TFR-007) — PASS (DB verify `stockQty=7` คงอยู่)
- [x] ACTIVE: เมนูไม่มี badge — PASS (implicit, verified ผ่าน `applyInventoryGate` code + happy-path screenshot หลัง subscribe)
- [ ] (carry) reactivate flow จริง (LOCKED → click "เปิดใช้งานอีกครั้ง" → หัก ฿199 → ACTIVE) — ยังไม่ได้เทส end-to-end รอบนี้ (locked-shop wallet ตั้งใจให้ balance ไม่พอ ฿50 เพื่อเทส banner เท่านั้น; ควรเพิ่ม test balance พอ+กด reactivate จริงรอบหน้า)
- [ ] (carry) reactivate ตอนเครดิตไม่พอ → 402 "เครดิตไม่พอ" (SweetAlert showValidationMessage) — ยังไม่ได้เทส

## D. Admin
- [x] `admin.deepth.local:4000` เข้า `/topups/[id]` ของ shop ที่มี Inventory transaction → sidebar "รายการเครดิตล่าสุด" แสดง label **"Inventory Add-on"** แยกจาก **"SMS Order Link"** — PASS (E2E test #9, screenshot `.screenshots/2026/7/1/admin-topup-detail-inventory-label-153800.png`)
- [ ] (carry) admin ไม่มีปุ่มแก้ไข/ยกเลิก entitlement จาก sidebar นี้ (read-only ตาม AC-3) — verified โดย code review (ไม่มี action element ใน sidebar) แต่ยังไม่ได้ negative-test คลิก/inspect DOM หา action ที่หลุดมา

## E. Cross-cutting / code-review findings (ไม่ได้ครอบใน E2E แต่ verified ผ่านอ่านโค้ด)
- [x] `order.service.createOrder`: entitlement lookup เป็น short-circuit (findUnique 1 query) สำหรับ shop ที่ไม่ ACTIVE — ไม่กระทบ perf ของ regression path
- [x] `deductStockForOrderItems`: กรอง `type==='PHYSICAL' && stockQty!==null` ก่อนเข้า `updateMany` เสมอ (กัน NULL>=n = unknown bug) — verified ผ่าน code read
- [x] `restockFromCancelledOrder`: skip + log ถ้า `productId` เป็น null (product ถูกลบ) ไม่ throw — cancel ต้องสำเร็จเสมอ (accepted gap)
- [x] `cancelOrder`: restock ไม่เช็คสถานะ entitlement ปัจจุบัน (BR-INV-12) — ใช้ประวัติจริงจาก `OrderItem.stockDeducted` เท่านั้น — ตรงตาม spec
- [x] `ProductFormV2`: `entitlementActive` ผูกถูกทั้ง `new-v2/page.tsx` และ `[id]/edit/page.tsx` (`isEntitlementActive(shop.id).catch(() => false)` fail-closed) — verified

## ยังไม่ได้เทส (carry ไปรอบถัดไป)
- [ ] cron renewal route (`/api/cron/inventory-renewal`) — `renewOrLockEntitlement` claim-before-deduct + revert-on-fail (TD-003) ยังไม่ได้ integration-test จริง (unit-level เท่านั้นตาม commit log)
- [ ] `shouldWarnAdvance` banner (AdvanceWarningBanner) — ต้อง seed `nextRenewalAt` ใกล้ครบ (≤3 วัน) + balance < 199 เพื่อเห็น banner จริงบนหน้า — ยังไม่ได้เทสรอบนี้
- [ ] reactivate happy-path (หัก ฿199 จริงจนสำเร็จ) + reactivate 402 insufficient-credit
- [ ] product **create** form (new-v2) กรณี NOT_SUBSCRIBED ไม่มี field stockQty (เทสแค่ edit form รอบนี้)
- [ ] mobile viewport (375px) สำหรับ `/inventory` gate + management table + product stock toggle
- [ ] concurrent order creation กับ stock เดียวกัน (race — `updateMany` conditional WHERE ควร atomic ถูก แต่ยังไม่มี load test)

## Known defect (ต้องแก้ก่อน sign-off scope item "hard-stop 400")
1. **`OutOfStockError` ไม่ถูก map เป็น 400** ใน `src/app/api/orders/route.ts` POST handler
   - อาการ: สร้าง order ตอน stock=0 → ตอบ **500** `{"error":"Order creation failed"}` แทนที่จะเป็น **400** `"สินค้าหมดสต็อก"`
   - Impact: **ไม่กระทบ data-integrity** (order ไม่ถูกสร้าง, stock ไม่ถูกตัด — all-or-nothing rollback ถูกต้อง) แต่ seller เห็น generic error แทนข้อความที่บอกสาเหตุจริง (UX regression ต่อ spec)
   - Fix แนะนำ: เพิ่ม `catch` branch สำหรับ `OutOfStockError` (import จาก `@/services/inventory-stock.service`) ก่อน generic catch ใน `POST /api/orders`:
     ```ts
     if (e instanceof OutOfStockError) {
       return NextResponse.json(
         { error: `สินค้าหมดสต็อก: ${e.productNames.join(', ')}` },
         { status: 400 },
       );
     }
     ```
   - Reproduced by: `e2e/inventory-addon.spec.ts` test "stock = 0 → สร้าง order → hard-stop" (deterministic FAIL)

# 00014 — Customer Directory · Tests

## Unit (Vitest — ผ่านแล้ว)
- `src/lib/__tests__/phone.test.ts` (4): valid / strip / ผิด→null / email-ว่าง→null
- `src/services/__tests__/customer.service.test.ts` (3): เจอ→id เดิม / ไม่เจอ→สร้าง / P2002 race→re-find

## E2E (Playwright + Chrome MCP — Task 8)
1. คีย์ชื่อ/เบอร์ → สร้าง order → DB: Customer + order.customerId
2. เบอร์เดิม order ที่ 2 → customer id เดียว
3. 2 ร้านเบอร์เดียว → customer เดียว (cross-shop) + ร้าน B ไม่เห็นชื่อร้าน A (privacy)
4. เบอร์ผิดรูปแบบ → ไม่สร้าง Customer
5. email-only → customerId null
6. search ลูกค้าตัวเองเจอ
7. backfill: order เก่า → customerId set

## หน้ารายการลูกค้า /customers (00014-ext, 2026-08-05)

อ้าง FR-7 (dedupe ด้วย `makeCustomerRowKey`), FR-8 (คอลัมน์ยอดซื้อสะสม + label), FR-9
(totalOrders นับทุกสถานะ), FR-10 (ค้นหา/เรียง/แบ่งหน้า — คงพฤติกรรมเดิม ไม่ regress) และ
BR-CUST-07 (นิยามยอดซื้อสะสม = `countsAsRevenue`), BR-CUST-08 (soft-deleted user →
guest-like) ใน `PRD.md`/`BRD.md` ของฟีเจอร์นี้

| TC | ระดับ | เคส | Expected | สถานะ |
|---|---|---|---|---|
| TC-CRK-01 | unit | มี `customerId` → key ชนะแม้มี `buyerUserId`/`contact` ด้วย | `c-{customerId}` | **PASS** (`npx vitest run src/lib/__tests__/customer-row-key.test.ts`) |
| TC-CRK-02 | unit | ไม่มี `customerId` มี `buyerUserId` | `u-{buyerUserId}` | **PASS** |
| TC-CRK-03 | unit | guest มี `contact` | `g-` + sha256(contact) 16 hex แรก | **PASS** |
| TC-CRK-04 | unit | `contact` ต่างกัน → key ต่างกัน | key ไม่เท่ากัน | **PASS** |
| TC-CRK-05 | unit | `contact` เดียวกัน (เรียกซ้ำ) → key เดียวกัน (deterministic) | key เท่ากัน | **PASS** |
| TC-CRK-06 | unit | ไม่มีอะไรเลย (null/undefined/`''`) | `'guest-unknown'` | **PASS** |
| TC-CUST-01 | E2E | FR-7: ลูกค้า `customerId` เดียวกัน 2 ออเดอร์ `buyerContact` คนละ format (`089-900-xxxx` vs `0899000xxx`), ใบหนึ่ง `buyerUserId: null` → เปิด `/customers` | เห็น **1 แถว** รวม `totalOrders=2` และยอดซื้อสะสมรวมถูกต้อง | **PENDING-dev-server** (`e2e/customers-dedupe.spec.ts` §S-1) |
| TC-CUST-02 | E2E | BR-CUST-07/FR-8: ลูกค้ามีออเดอร์ `CANCELLED` อย่างเดียว (ไม่ `countsAsRevenue`) | ยอดซื้อสะสม = `฿0` และ label `(นับเป็นยอดขายแล้ว)` กำกับหัวคอลัมน์อยู่เสมอ | **PENDING-dev-server** (§S-2) |
| TC-CUST-03 | E2E | BR-CUST-07/FR-8: ลูกค้ามีออเดอร์ `CONFIRMED` ยอด `totalAmount` ชัดเจน | ยอดซื้อสะสมตรงกับ `formatBaht(totalAmount)` เป๊ะ | **PENDING-dev-server** (§S-3) |

### ยังไม่ได้เทส (carry)
- BR-CUST-07 กรณี `SHIPPED` + `carrierStatus` อยู่ใน `REVENUE_CARRIER_STATUSES` (isDryRun=false) ต้องนับเข้ายอดซื้อสะสมด้วย — สคริปต์นี้ครอบเฉพาะ CANCELLED/CONFIRMED
- BR-CUST-08 soft-deleted user (`User.deletedAt` ตั้งแล้ว) → แถวแสดง guest-like ไม่มีลิงก์ `/u/{username}` แต่ยังนับเป็น 1 แถว
- FR-9 (`totalOrders` รวม CANCELLED/PENDING) — ยังไม่มีเคสแยกยืนยันตัวเลขรวมข้ามสถานะบนหน้า `/customers` โดยตรง
- FR-10 ค้นหา/เรียง/แบ่งหน้าบนข้อมูลจำนวนมาก (>1 หน้า) — ยังไม่มี E2E
- E2E ทั้ง 3 เคสข้างต้นยังไม่เคยรันจริง — dev server ไม่ได้รันตอน QA round นี้ (probe `curl -s http://deepth.local:4000/ -o /dev/null -w "%{http_code}"` → `000`) รันด้วย:
  ```
  npm run e2e -- e2e/customers-dedupe.spec.ts
  ```

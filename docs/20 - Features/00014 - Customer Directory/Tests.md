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

---

## chip แนะนำเบอร์ + บีบรูปแบบมือถือ (ext, 2026-08-21)

อ้าง `EXTENSIONS-2026-08-21-phone-format.md` (FR-CUS-E1-01..07, E2, E3, E4)

### Unit — ผ่านแล้ว (รันจริง)

| ไฟล์ | จำนวน | ล็อกอะไร |
|---|---|---|
| `src/lib/phone-suggest.test.ts` | 45 | **[blocker]** เบอร์ที่ chip เสนอ ต้องผ่าน `CreateOrderSchema` **ตัวจริง** เสมอ (import schema มาใช้ ไม่ใช่ regex ที่เทสเขียนเอง) · 5 รูปแบบจริงจากหน้างาน · ห้ามเลื่อนหน้าต่าง · `normalizePhone` ต้องคงเกณฑ์หลวมไว้ |
| `src/lib/phone-hint.test.ts` | 49 | **[blocker]** จะพูดหรือเงียบตอนไหน · dedupe chip ที่ตรงกับค่าที่พิมพ์ · threshold 9 หลัก · "ไม่ใช่มือถือ" ต้องเป็นคนละข้อความกับ "หลักไม่ครบ" · `emptyStateMessage` ห้ามโกหก · ขีดคั่นไม่เกิน 1 อันต่อประโยค |
| `src/lib/parse-order-message.test.ts` | 19 | **[blocker]** `_` และ `+66` ต้องดึงเบอร์ได้ **และ** ต้องไม่ค้างอยู่ในที่อยู่ |
| `src/services/__tests__/iship-import-phone-guard.test.ts` | 4 | **[blocker]** `importParcelAsOrder` ต้องตรวจรูปแบบเบอร์ **ก่อน** `createOrder(` และต้อง `throw` ไม่ใช่แก้ค่าให้ |
| `orders/new/__tests__/phone-hint-wiring.test.ts` | 9 | **[blocker]** ผู้เรียกต้องส่ง `errorMessage` เข้า component · ห้ามครอบด้วยเทอร์นารี · ต้องใส่ `is-invalid` · เดสก์ท็อปต้องมีด่านกัน dropdown ทับ chip |

**พิสูจน์ด้วย mutation 18 แบบ แดงครบทุกตัว** — 🛑 2 ครั้งแรกเทสเขียวทั้งที่ควรแดง
(ไม่มี input ไหนผลิตเบอร์ 9 หลักได้เลย · เบอร์ในเทสอยู่คนละบรรทัดกับที่อยู่) ต้องแก้เทสก่อนถึงจับได้

### Browser QA — 🛑 ยังไม่เคยรันสักเคส

| TC | จอ | เคส | Expected | สถานะ |
|---|---|---|---|---|
| TC-PH-01 | มือถือ `/orders/new` | พิมพ์ `0 8 6 5 3 5 2960` | chip `0865352960` ขึ้น · **ชีตค้นหาต้องไม่เด้งทับ** | **PENDING** |
| TC-PH-02 | มือถือ | กด chip จาก TC-PH-01 | ค่าในช่องเปลี่ยนเป็นเบอร์สะอาด → ค้นใหม่ทันที → ชีตเด้งพร้อมผลที่ถูก | **PENDING** |
| TC-PH-03 | มือถือ | กรอกเบอร์เพี้ยนแล้ว**กดบันทึกเลย** | ช่องได้ **ขอบแดง** + บรรทัด "ยังบันทึกไม่ได้ — กดเบอร์ด้านล่างเพื่อแก้" (ก่อนแก้: toast เด้งแล้วหาสีแดงไม่เจอ) | **PENDING** |
| TC-PH-04 | เดสก์ท็อป POS | พิมพ์เบอร์เพี้ยนในช่องเบอร์ | dropdown ผลค้นหา **ต้องไม่เด้งทับ chip** | **PENDING** |
| TC-PH-05 | ชีตค้นหา | พิมพ์ `0 920791649` | ปุ่ม "ใช้ … เป็นลูกค้าใหม่" **ต้องไม่โผล่** · empty state = "ยังไม่ได้ค้นด้วยเบอร์ …" ไม่ใช่ "ไม่พบลูกค้าเดิม" | **PENDING** |
| TC-PH-06 | ชีตค้นหา | พิมพ์ `09207916` (8 หลัก) แล้วรอค้นจบ | "ไม่พบลูกค้าเดิม — เบอร์ที่พิมพ์มี 8 หลัก เบอร์มือถือต้องมี 10 หลัก" (จอต้องไม่เป็นทางตัน) | **PENDING** |
| TC-PH-07 | ชีตค้นหา | พิมพ์ชื่อคน `สมชาย` | **เงียบสนิท** ไม่มีข้อความเรื่องเบอร์ใด ๆ | **PENDING** |
| TC-PH-08 | มือถือ | กดที่ **ขอบบน/ล่างของก้อนสี** ห่างออกไป ~8px | ยังกดติด (กล่องแตะ 44px ที่มองไม่เห็น) | **PENDING** |
| TC-PH-09 | ทุกจอ | "วางจากแชท" ข้อความที่มี `0_9_2_0791649` หรือ `(+66)920791649` | ช่องเบอร์ถูกเติม **และที่อยู่ต้องไม่มีเบอร์ค้างอยู่ข้างใน** | **PENDING** |
| TC-PH-10 | iShip | ผูกพัสดุที่เบอร์ผู้รับไม่ใช่มือถือ 10 หลัก | ถูกปฏิเสธพร้อมข้อความที่บอกว่าเป็นเรื่องเบอร์ | **PENDING** |
| TC-PH-11 | auth | สมัคร/ล็อกอิน/OTP/ตั้งเบอร์/เชิญพนักงาน/เบอร์ผู้ส่ง | ยังใช้ได้ปกติ · ข้อความบอกกฎว่า "ขึ้นต้นด้วย 06, 08 หรือ 09" เหมือนกันทุกจุด | **PENDING** |

### หนี้ที่เปิดไว้โดยตั้งใจ

- `text-danger` `#f7577e` บนขาว = **3.17:1** ตก AA — เป็นหนี้ทั้งรีโป 76 ไฟล์ ไม่แตะเพราะ
  `docs/conventions/contrast-fix-keeps-hue.md` บันทึกว่าการสลับ danger→ink เมื่อ 2026-08-03
  ทำให้ปุ่มกลายเป็นสีเลือดหมูจนต้องย้อนทั้งชุด — ต้องตัดสินระดับ design system
- `bg-primary/15 + text-primary` อีก 76 ไฟล์ใน `(paces)` ตกเกณฑ์เดียวกัน (มีอยู่ก่อนรอบนี้)
- ปุ่มบนมือถือถ้าอยากเตี้ยกว่า 44px — ต้องแตะเกณฑ์ที่ `PRODUCT.md §Accessibility` ประกาศเอง
- 🛑 ไฟล์นี้ชื่อ `Tests.md` แต่ template คือ `TestCase.md` — drift ที่มีมาก่อน ทำให้
  `diff <(ls template) <(ls feature)` แดงตลอด (HR11 เตือนกับดักนี้ไว้ตรงตัว) ยังไม่เปลี่ยนชื่อ
  เพราะจะทำให้ประวัติ git ของไฟล์ขาด — ต้องตัดสินแยก

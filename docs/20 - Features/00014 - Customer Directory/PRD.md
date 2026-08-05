# 00014 — Customer Directory · PRD

> SSOT ของ requirement: `docs/superpowers/specs/2026-07-04-customer-directory-design.md` (approved). เอกสารนี้สรุประดับ product.

## Goal
ให้ seller คีย์ชื่อ/เบอร์ลูกค้าตอนสร้างออเดอร์ → ระบบจดจำลูกค้าเป็น **ตัวตนกลาง (Customer)** ผูกด้วยเบอร์ ไม่ให้เบอร์ซ้ำ และเบอร์เดียวกัน = ลูกค้าเดียวกันแม้ต่างร้าน — เพื่อประวัติลูกค้าที่ถูกต้อง + ต่อยอด CRM

## Personas
- **Seller** (Paces) — สร้างออเดอร์, จดลูกค้า, ค้นลูกค้าเดิมของร้าน

## User stories / FR
- FR-1: seller คีย์ชื่อ+เบอร์ลูกค้าตอนสร้างออเดอร์ (มีอยู่แล้ว — คงไว้)
- FR-2: ค้นหาลูกค้าที่เคยสั่งกับร้านตัวเอง (ชื่อ/เบอร์) — autocomplete (มีอยู่แล้ว)
- FR-3: ระบบผูกออเดอร์กับ Customer กลางด้วยเบอร์ (normalize) อัตโนมัติ — เจอเบอร์เดิม = ลูกค้าเดิม
- FR-4: เบอร์ unique global — ห้ามมี Customer 2 record เบอร์เดียวกัน
- FR-5: เบอร์เดียวกันข้ามร้าน = customer id เดียว (cross-shop)
- FR-6: privacy — seller เห็นเฉพาะลูกค้าที่เคยสั่งกับร้านตัวเอง (ไม่เห็นข้อมูลร้านอื่น)

### หน้ารายการลูกค้า `/customers` (ต่อขยาย 2026-08-05 — phase `00014-ext-customers`)

- **FR-7 (dedupe ด้วย customerId เป็น key หลักเสมอ):** หน้า `/customers` ต้อง group แถวด้วยฟังก์ชันบริสุทธิ์ `makeCustomerRowKey(customerId, buyerUserId, contact)` (`src/lib/customer-row-key.ts`) แทนการ hash raw contact ตรง ๆ — ลำดับความสำคัญ: `customerId` ชนะเสมอ (`c-{customerId}`) → ถ้าไม่มี ใช้ `buyerUserId` (`u-{buyerUserId}`) → ถ้าไม่มี ใช้ hash ของ contact (`g-{hash}`)
  - **AC:** 2 ออเดอร์เบอร์เดียวกัน format ต่างกัน (มี/ไม่มี `-`) → แสดง 1 แถว (ไม่ใช่ 2) เพราะ `customerId` ที่ resolve จาก `normalizePhone` ตรงกัน
  - **AC:** ลูกค้าคนเดียวสั่งทั้งแบบ login (มี `buyerUserId`) และ guest (เบอร์เดียวกัน มี `customerId`) → รวมเป็น 1 แถว โดย `customerId` เป็นตัวตัดสิน ไม่ใช่ `buyerUserId`
  - **AC:** guest ไม่มีเบอร์ที่ normalize ได้ (email-only/ว่าง) → ยังโผล่เป็นแถว fallback (`g-` key) ไม่ crash ไม่หาย
  - **AC:** ลูกค้าที่เป็นสมาชิกแต่ `User.deletedAt` ถูกตั้งแล้ว (soft-deleted) → แสดงเป็น guest-like (ไม่มีลิงก์ไปหน้าโปรไฟล์ `/u/{username}`) ตาม BR-CUST-08
- **FR-8 (คอลัมน์ยอดซื้อสะสม + label):** แสดงคอลัมน์ "ยอดซื้อสะสม" = ผลรวม `Order.totalAmount` เฉพาะออเดอร์ที่ `countsAsRevenue(order)` เป็นจริง (SSOT `src/lib/order-revenue.ts` — ตาม BR-CUST-07) พร้อม label กำกับ **"(นับเป็นยอดขายแล้ว)"** ติดกับตัวเลขหรือหัวคอลัมน์เสมอ — **ห้ามใช้คำว่า "ยืนยันแล้ว"** (คำนั้นผูกกับ CONFIRMED-only ที่หน้า `/sales` อยู่แล้ว จะสื่อผิดเกณฑ์)
  - **AC:** คอลัมน์แสดงทั้ง desktop table และ mobile card
  - **AC:** ลูกค้าที่มีแต่ออเดอร์ยกเลิก/PENDING (ไม่เข้า `countsAsRevenue`) → ยอดซื้อสะสม = 0 พร้อม label เดียวกัน
  - **AC:** ลูกค้าที่มีออเดอร์ `SHIPPED` และ shipment `carrierStatus` อยู่ใน `REVENUE_CARRIER_STATUSES` (เช่น `delivered`) → นับเข้ายอดซื้อสะสมแม้ buyer ยังไม่กดยืนยันรับของ (`status` ยังไม่เป็น `CONFIRMED`)
- **FR-9 (totalOrders — คงพฤติกรรมเดิม):** `totalOrders` นับทุกสถานะ (รวม CANCELLED/PENDING) ไม่เปลี่ยนจากพฤติกรรมปัจจุบัน — ต่างเกณฑ์กับ `totalSpent` โดยเจตนา (ดู BR-CUST-07)
- **FR-10 (ค้นหา + เรียง + แบ่งหน้า):** ค้นหาด้วยชื่อ/เบอร์ (client-side filter), เรียงลำดับได้ (ล่าสุด/จำนวนออเดอร์/ยอดซื้อ), แบ่งหน้า — คงพฤติกรรมเดิมของ `CustomerTable.tsx` (ไม่มี server-side pagination ใน phase นี้ — known gap NFR-2 ยังไม่แก้)

## NFR
- ไม่กระทบ flow/perf createOrder เดิม (เพิ่ม 1-2 query ต่อ order ที่มีเบอร์); dedup ปลอดภัยต่อ race (P2002-safe)

## Scope
- **MVP:** Customer model + phone unique/normalize + ผูก order.customerId + backfill + search ลูกค้าตัวเอง + **หน้ารายการลูกค้า `/customers` (read-only list)** — dedupe ด้วย customerId, คอลัมน์ยอดซื้อสะสม, ค้นหา/เรียง/แบ่งหน้า (FR-7..FR-10, ปิดหนี้ Phase 2 เดิมบางส่วนใน phase `00014-ext-customers` 2026-08-05)
- **Phase 2 (out):** แก้ไข/รวม (merge) record ลูกค้าด้วยมือ, customer detail/drill-down (ดูประวัติออเดอร์รายลูกค้า), auto-link Customer↔User ตอนสมัคร, customer analytics, ผสาน ExternalContact (chat lead) เข้าลิสต์นี้, ประวัติข้ามร้าน (ขัด BR-CUST-03 — hard block ถาวรไม่ใช่แค่เลื่อน)

## Metrics
- % ออเดอร์ที่มี customerId (หลัง backfill), จำนวน Customer distinct, ลูกค้า cross-shop

## Assumptions
- เบอร์ไทย `0xxxxxxxxx`; ลูกค้าที่มีแต่ email → ไม่มี Customer (คง buyerContact เดิม)

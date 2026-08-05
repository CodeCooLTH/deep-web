# Scope Baseline — 00014-ext-customers (ปิดหนี้ Phase 2 ของ Customer Directory + แก้ correctness หน้า `/customers`)

phase-id: `00014-ext-customers`
วันที่: 2026-08-05
feature: `docs/20 - Features/00014 - Customer Directory/`
สถานะ: ACTIVE

อ้างอิง PRD: `docs/PRD.md` §2.2 (S-9), §8 (MVP scope — `/customers` shipped) · feature 00014 PRD.md/BRD.md (FR-1..FR-6, BR-CUST-01..06) · ส่วนต่อขยาย FR-7..FR-10 (ยังไม่ back-fill เข้า PRD.md ของ 00014 — เป็นงานของ S-4 ใน baseline นี้เอง) · spec ต้นทาง `docs/superpowers/specs/2026-07-04-customer-directory-design.md`

## Goal
แก้ hidden bug ของการ dedupe ลูกค้าในหน้า `/customers` ให้ยึด `Customer.id` (SSOT ของ 00014) แทน raw-contact hash, เติมคอลัมน์ยอดซื้อสะสมที่หายไป, ทำนิยาม totalOrders/totalSpent ให้สมมาตรและมีคำอธิบายบนจอ, แล้ว back-fill เอกสาร 00014 ให้ตรง Hard Rule 11

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | Dedupe ด้วย `customerId` เป็น key หลักเสมอ (`customerId ?? buyerUserId ?? hash(contact)`, OQ-3) แทน `makeRowKey(buyerUserId, buyerContact)` เดิม | (1) 2 ออเดอร์เบอร์เดียวกัน format ต่างกัน (มี/ไม่มี `-`) → แสดง **1 แถว** ไม่ใช่ 2 · (2) ลูกค้าคนเดียวสั่งทั้งแบบ login และ guest เบอร์เดียวกัน → รวมเป็น 1 แถว โดย `customerId` เป็นตัวตัดสิน (ไม่ใช่ `buyerUserId`) · (3) guest ไม่มีเบอร์ที่ normalize ได้ (email-only/ว่าง) → ยังโผล่เป็นแถว fallback ไม่ crash ไม่หาย · (4) ตรวจ query ปัจจุบัน (`include: { buyer: {...} }`) ว่ากรอง/handle `User.deletedAt` ถูกต้องหรือไม่ — ถ้าลูกค้าที่เป็นสมาชิกถูกลบบัญชีแล้ว ต้องไม่ลิงก์ไปหน้าโปรไฟล์ที่ไม่มีอยู่จริง (แสดงเป็น guest-like แทน) · (5) regression: ร้านยังไม่มีออเดอร์เลย → empty state เดิมยังทำงานถูกต้อง | TODO |
| S-2 | เติมคอลัมน์ "ยอดซื้อสะสม" (`totalSpent`) ใน `CustomerTable.tsx` ที่คำนวณไว้แล้วแต่ไม่เคย render + label กำกับชัดว่า "ไม่รวมออเดอร์ที่ยกเลิก" | (1) คอลัมน์ยอดซื้อสะสมแสดงในทั้ง desktop table และ mobile card · (2) มี label/tooltip ข้อความบอกว่าไม่รวมออเดอร์ที่ยกเลิก อยู่ติดกับหัวคอลัมน์หรือใต้ตัวเลข ไม่ปล่อยให้ผู้ใช้เดา · (3) ลูกค้าที่ออเดอร์ถูกยกเลิกทั้งหมด → ยอดซื้อสะสม = 0 พร้อม label เดียวกัน ไม่ใช่ค่าว่าง | TODO |
| S-3 | ทำนิยาม `totalOrders`/`totalSpent` ให้สมมาตรและมี SSOT เดียว — "สำเร็จ" ต้องอ้างอิงนิยามเดียวกับที่ใช้ในหน้า sales/dashboard อื่นของระบบ (ห้าม hardcode `status === 'CONFIRMED'` ซ้ำแยกจุด) | (1) `totalOrders` นับทุกสถานะ (คงพฤติกรรมเดิม), `totalSpent` นับเฉพาะสถานะที่ระบบถือว่า "สำเร็จ" ตาม SSOT ที่มีอยู่แล้ว (grep หาให้เจอก่อนแก้ ห้าม reinvent) · (2) ผลลัพธ์ตัวเลขต้องตรงกับที่หน้าอื่น (เช่น dashboard/sales) นับด้วยนิยามเดียวกันสำหรับร้าน/ช่วงเวลาเดียวกัน | TODO |
| S-4 | Back-fill เอกสาร 00014 ให้ตรง Hard Rule 11 (ปิดหนี้ doc-first ที่หน้า list เคยข้ามมา) — แตะไฟล์ตาม structure จริงของโฟลเดอร์ `docs/20 - Features/00014 - Customer Directory/`: **PRD.md** (ย้ายหัวข้อ "หน้าจัดการลูกค้า" ออกจาก Phase 2/out ในหัวข้อ Scope, เพิ่ม FR-7..FR-10 ตาม requirement draft, อัปเดต Scope: MVP), **BRD.md** (เพิ่ม BR-CUST-07 = นิยาม "ยอดซื้อสะสมไม่รวมออเดอร์ที่ยกเลิก" ให้เป็น business rule ที่มี SSOT ชัดเจน, ผูกกับ S-3), **Tests.md** (เพิ่ม section เคสของหน้า list — ดู S-5) | (1) `docs/20 - Features/00014 - Customer Directory/PRD.md` มี FR-7..FR-10 และ Scope ไม่ขัดกับโค้ดที่มีจริงอีกต่อไป · (2) `BRD.md` มี BR-CUST-07 · (3) `Tests.md` มี section ใหม่ของหน้า list ที่ไม่ใช่แค่ dedupe ตอนสร้างออเดอร์เหมือนเดิม · (4) ไม่แก้ `DATABASE.md`/`API.md`/`SDS.md` เว้นแต่พบว่าจำเป็นระหว่างทำจริง (ไม่มี schema change ใหม่ — `customerId` มีอยู่แล้ว, ไม่มี API route ใหม่ — หน้าเป็น RSC query ตรง) | TODO |
| S-5 | Tests: unit ของ dedupe-key priority logic (`customerId ?? buyerUserId ?? hash`) + Playwright E2E ของหน้า list ตามเคสใน S-1/S-2/S-3 | (1) unit test ครอบ 3 ลำดับความสำคัญของ key + P2002/race-safe เดิมไม่พัง · (2) E2E: สร้าง 2 ออเดอร์เบอร์เดียวกันต่าง format → เห็น 1 แถวใน `/customers` · (3) E2E: ยอดซื้อสะสมกับ label ปรากฏถูกต้องกรณีมี/ไม่มีออเดอร์ยกเลิก · (4) test ทั้งหมดผ่านด้วย `deleteTestData()`/scoped cleanup ตาม Hard Rule 13 (ห้าม unscoped delete ใน tests) | TODO |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | FR-11 — customer detail/drill-down (ดูประวัติออเดอร์ทั้งหมดของลูกค้าคนนี้ในร้าน) | ตัดตาม OQ-2 — ไม่ทำ phase นี้ |
| OOS-2 | Merge/แก้ไข `Customer` record ด้วยมือ (merge tool) | 00014 Phase 2 เดิม — ยังไม่เปลี่ยน |
| OOS-3 | ผสาน `ExternalContact` (chat lead ที่ยังไม่เคยสั่งซื้อ) เข้าในลิสต์ลูกค้านี้ | คนละ domain/วัตถุประสงค์ (CRM lead vs. ลูกค้าซื้อจริง) — ไม่มี FR รองรับ |
| OOS-4 | ประวัติลูกค้าข้ามร้าน (cross-shop history/analytics) | ขัด BR-CUST-03 (privacy) โดยตรง — hard block ถาวร ไม่ใช่แค่เลื่อน |
| OOS-5 | แก้ NFR-2 (query `Order.findMany` ทั้งหมดไม่มี limit แล้ว group ใน memory — ปัญหา scale ร้านออเดอร์เยอะ) | known gap ที่ยอมรับความเสี่ยงไว้ก่อน — ไม่ fix ใน phase นี้ เว้นแต่ Controller ยืนยันว่าต้องรองรับร้านใหญ่ตอนนี้ |

## Assumptions
- นิยาม "ออเดอร์สำเร็จ" (สำหรับ `totalSpent`) มี SSOT อยู่แล้วในระบบ (ใช้กับหน้า sales/dashboard อื่น) — dev ต้อง grep หาให้เจอก่อนแก้ ห้าม hardcode สถานะซ้ำใหม่ที่จุดนี้ (ผูกกับ S-3)
- ไม่มี schema/migration ใหม่ในงานนี้ — `Order.customerId` มีอยู่แล้วจาก feature 00014 เดิม
- `docs/deferred-backlog.md` item #2 (`maskContact` shared util) ไม่ใช่ scope ของ baseline นี้ — เป็นหนี้แยกที่ไม่ได้ block งานนี้ ไม่นับ CREEP ถ้าไม่ถูกแตะ

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off

- FR-11 customer detail/drill-down (OOS-1)
- Merge/แก้ไข `Customer` record (OOS-2)
- Server-side pagination/query optimization สำหรับร้านออเดอร์จำนวนมาก (OOS-5, NFR-2)
- `docs/deferred-backlog.md` #2 `maskContact` shared util extraction (หนี้เดิมที่ยังไม่ถูกหยิบมาทำรอบนี้)

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-08-05 | S-2/S-3: label หน้าจอเปลี่ยนจาก "ไม่รวมออเดอร์ที่ยกเลิก" → `(นับเป็นยอดขายแล้ว)` และนิยาม totalSpent = `countsAsRevenue()` + `Order.totalAmount` (ไม่ใช่ CONFIRMED-only + sum items) | planner พบ SSOT จริงคือ `src/lib/order-revenue.ts` (dashboard ใช้) — เกณฑ์กว้างกว่า "ไม่รวมยกเลิก"; ux ยืนยันคำ "ยืนยันแล้ว" ถูก `/sales` ผูกกับ CONFIRMED-only แล้ว ใช้ซ้ำจะทำคำเดียวกันมี 2 ความหมาย. หมายเหตุ known gap: `/sales` ยังใช้ CONFIRMED-only ต่างจาก dashboard — ไม่แก้ในรอบนี้ | Controller (ตีความในกรอบ S-3 ที่ user เคาะ: ยึด SSOT เดียวกับ dashboard) |

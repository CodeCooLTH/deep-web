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

## NFR
- ไม่กระทบ flow/perf createOrder เดิม (เพิ่ม 1-2 query ต่อ order ที่มีเบอร์); dedup ปลอดภัยต่อ race (P2002-safe)

## Scope
- **MVP:** Customer model + phone unique/normalize + ผูก order.customerId + backfill + search ลูกค้าตัวเอง
- **Phase 2 (out):** หน้าจัดการลูกค้า (list/แก้/รวม), auto-link Customer↔User ตอนสมัคร, customer analytics

## Metrics
- % ออเดอร์ที่มี customerId (หลัง backfill), จำนวน Customer distinct, ลูกค้า cross-shop

## Assumptions
- เบอร์ไทย `0xxxxxxxxx`; ลูกค้าที่มีแต่ email → ไม่มี Customer (คง buyerContact เดิม)

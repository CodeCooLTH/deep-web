---
title: "API — 00082 ลูกค้ายืนยันรับบริการ = ปิดงาน + ชำระครบ (ร้านบริการ)"
owner: shinobu22
status: draft
created: 2026-10-23
tags: [feature, service, api]
related: ["[[SRS]]", "[[TestCase]]"]
---

> **โมดูล:** 00082 — Service Buyer Confirm Closes Job
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-10-23
> **สถานะ:** Draft

# API Contract: ลูกค้ายืนยันรับบริการ = ปิดงาน + ชำระครบ

## 1. Overview
**ไม่มี endpoint ใหม่ และสัญญาเดิมไม่เปลี่ยน** (request/response/error เหมือนเดิมทุกตัว) — เปลี่ยนเฉพาะ "ผลข้างเคียงในฐาน" ของ endpoint ยืนยันเมื่อร้านเป็นร้านบริการ

| รายการ | ค่า |
|---|---|
| Endpoint ใหม่ | ไม่มี |
| Response เปลี่ยน | ไม่มี (เว็บยังคืนแถว Order · แอปยังคืน `{ ok: true }`) |

## 2. Authentication
เดิม: เว็บ = NextAuth session + เจ้าของบิล (`order.buyerUserId`) · แอป = Bearer (`requireAppUser`) + `getOrderTokenForBuyer`

## 3. Endpoint List
| Method | Path | ผลข้างเคียงใหม่ (ร้านบริการเท่านั้น) |
|---|---|---|
| POST | `/api/orders/[token]/confirm` | ปิดงาน (ถ้ายัง) + รายการรับเงินยอดค้าง + `SERVICE_CLOSED closedBy BUYER` |
| POST | `/api/app/orders/[id]/confirm` | เหมือนข้างบน |
| POST | `/api/orders/[token]/review` · `/api/app/orders/[id]/review` | ส่งคะแนนที่ยืนยันให้ด้วย (ร้านปิดแล้ว) ⇒ รายการรับเงินยอดค้าง |

## 4. Endpoint Detail

### 4.1 `POST /api/orders/[token]/confirm`
- Request/Response: เดิม
- ผลในฐานเพิ่มเติม (ร้านบริการ):
  - `Order.serviceClosedAt` = เวลายืนยัน (ถ้ายังว่าง) · `appointmentStatus = COMPLETED` (ถ้ามีนัด)
  - `OrderPayment` ใหม่ เมื่อยอดค้าง > 0: `kind BALANCE · method OTHER · note "ลูกค้ายืนยันรับบริการและชำระแล้ว" · receivedByUserId = ลูกค้า`
  - `OrderEvent SERVICE_CLOSED` (เมื่อปิดในคำขอนี้): `meta { outcome: "SERVED", closedBy: "BUYER", amount? }`
- ไม่จองข้อความแจ้งเตือน "ร้านให้บริการแล้ว"

## 5. Error Code Table
ไม่เปลี่ยน — 401 ไม่ได้เข้าสู่ระบบ · 403 ไม่ใช่เจ้าของ/การจอง · 409 ไม่มาตามนัด (`SERVICE_JOB_NO_SHOW_CONFIRM`) · 400 สถานะผิด · ส่วนใหม่ล้ม ⇒ ทั้งคำขอย้อนกลับ (ตอบ 400 แบบเดิม)

## 6. Sequence (ถ้า flow ซับซ้อน)
ดู [[SDS]] §4.1

## 7. Traceability
| Endpoint | BRD | เทส |
|---|---|---|
| confirm (เว็บ/แอป) | FR-001..005 | `tests/services/service-buyer-confirm-00082.test.ts` (ผ่าน `confirmOrder`) |
| review | FR-006 | เคส "ทางส่งคะแนน" |

## 8. สรุป (Summary)
สัญญา API คงเดิม 100% · ผลข้างเคียงใหม่เฉพาะร้านบริการ

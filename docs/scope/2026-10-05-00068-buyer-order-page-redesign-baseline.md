# Scope Baseline — 00068 หน้าคำสั่งซื้อฝั่งผู้ซื้อ ฉบับปรับใหม่

สถานะ: ACTIVE
อ้างอิง: `docs/20 - Features/00068 - Buyer Order Page Redesign/` (PRD · BRD §10 D-1..D-11 + R-1..R-10 · SRS + ภาคผนวก · SDS · UX-Design-Spec + Addendum A · TestCase)

## Goal
หน้า `/o/[token]` ของผู้ซื้อที่ล็อกอิน เห็นร้าน (โลโก้+ชื่อ+ปก) · สิ่งที่ต้องทำต่อ · สลิปคำสั่งซื้อ ชัดในจอแรก โดยตรรกะตัดสินอยู่ในฟังก์ชันบริสุทธิ์ที่เทสจับได้

## In-Scope
> ทุก commit ต้อง map กับ ID อย่างน้อย 1 ตัว ไม่ map = CREEP

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | helper อ่านซอร์สหลายไฟล์ + meta-test fail-closed (TD-006) | เทส 20 ไฟล์อ่านผ่าน helper · ไฟล์ .tsx ใหม่ที่ไม่ลงทะเบียน = แดง | DONE (09dbc5bb) |
| S-2 | `resolveBuyerNextAction` + `transferNoAccount` (TFR-003, D-4, D-5, R-7, R-8) | 14 กิ่ง + ขอบ mutation แดง | DONE (c191660b, e7884f01) |
| S-3 | `buildShopSummaryLine` / `buildSlipMoneyView` (TFR-001/009, D-11, R-4, R-5, R-9) | null≠0 · 0 ไม่เขียน · paidChip ไม่ขึ้น COD/CANCELLED | DONE (0af5bc3e, e7884f01) |
| S-4 | `getOrderByToken` ใช้ `ACTIVE_FORWARD_SHIPMENT` (TFR-014) | ด่านสแกน `status:'CREATED'` ไม่มี direction = แดง | DONE (7bd78e98) |
| S-5 | `buildBuyerShipmentView` + ฟิลด์ payload ใหม่ (TD-003, TFR-012) | ไม่มีคีย์นอก allow-list · guest-order-data เขียวไม่แก้ | DONE (2b719132) |
| S-6 | `PayoutAccountCard.amountDue` บังคับ + `variant` (TD-004, D-4) | QR ใช้ amountDue · ผู้เรียกผ่าน resolveTransferAmount | DONE (74a60e2d) |
| S-7 | การ์ดย่อยใหม่: OrderSlip · ShopHeaderBar(+ปก D-10) · ShopInfoCard · NextAction* · useSlipUpload | tsc 0 · ยังไม่ต่อสาย | DONE (f99d2f7d) · rework ตาม reviewer |
| S-8 | W1 ต่อสาย OrderSlip | inventory + mutation ที่ไฟล์ใหม่ | TODO |
| S-9 | W2 ต่อสาย NextActionCard · ถอด showSlipZone | guardrails สลิป · rail-single-source | TODO |
| S-10 | W3 ต่อสาย ShopHeaderBar/ShopInfoCard · ถอดปก/hero เดิมของจอล็อกอิน | inventory #1-8 มีเทส | TODO |
| S-11 | W4 ConfirmBar + กล่องกันพลาดใกล้ปุ่ม | cta-bar-clearance · tap-target | TODO |
| S-12 | W5 ลบ dead code · sync `docs/SRS.md` | เทสทั้งชุด | TODO |
| S-13 | เอกสาร feature + baseline นี้ | template ครบ (`diff` ชื่อไฟล์) | DONE |

## Out-of-Scope

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | จอ guest `GuestOrderView` (ยกเว้น 1 บรรทัด amountDue ใน S-6) | D-3 ทำทีหลัง |
| OOS-2 | LODGING | D-7 |
| OOS-3 | schema/migration | ไม่จำเป็น |
| OOS-4 | รูปปกบน `SmsAutoEnter` | รอ user (Q-A1) |
| OOS-5 | ลิงก์เปิดสินค้าดิจิทัลย้ายเข้า NextActionStatus | SDS §3.2 คงใน shell (TestCase TC-072 ขัด — รอมติ) |

## Assumptions
- รูปปก variant lg ยังไม่มีไฟล์สำหรับปกเก่า ⇒ onError ถอยไปต้นฉบับ แล้วซ่อน

## Deferred → Phase 2
- ใช้ `buildBuyerShipmentView` ใน `buildGuestOrderData` (O-5 commit แยก)

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-10-05 | baseline สร้าง (ก่อน B2) | - | Controller |
| 2026-10-05 | เติม S-id ตาม `_TEMPLATE` + map commit B0–B4 ย้อนหลัง | reviewer Gate 6 | Controller |
| 2026-10-05 | D-10 (ปกยังแสดง) เข้า S-7/S-10 | user เคาะ | user |

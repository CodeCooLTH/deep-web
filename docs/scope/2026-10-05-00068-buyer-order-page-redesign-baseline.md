# Scope Baseline — 00068 หน้าคำสั่งซื้อฝั่งผู้ซื้อ ฉบับปรับใหม่

> ล็อก 2026-10-05 ก่อนเริ่ม B2 · แหล่ง: `docs/20 - Features/00068 - Buyer Order Page Redesign/` (PRD/BRD §10 D-1..D-11 + R-1..R-10/SRS/SDS/UX-Design-Spec + Addendum A)

## ในขอบเขต
- หน้า `/o/[token]` จอผู้ซื้อที่ล็อกอิน (`OrderDetailMobile` แตกเป็น ShopHeaderBar · ShopInfoCard · OrderSlip · NextActionCard · ConfirmBar)
- หัวแบบสลิป โลโก้+ชื่อร้านเด่น + รูปปกที่ร้านอัปโหลด (D-10) · ร้านไม่มีรูป = ไม่มีปก
- กล่อง "ขั้นถัดไป" จาก `resolveBuyerNextAction` ที่เดียว
- `getOrderByToken` ใช้ `ACTIVE_FORWARD_SHIPMENT` (ทำแล้ว B1-U3)
- `PayoutAccountCard.amountDue` บังคับ (D-4 ยอดค้างร้านบริการ) · CASH ไม่มีโซนสลิป (D-5)
- ย้ายเทสสแกนซอร์สผ่าน helper (ทำแล้ว B0)

## นอกขอบเขต
- จอ guest `GuestOrderView` (D-3) — แก้ได้เฉพาะ 1 บรรทัด `amountDue` (B3)
- LODGING (D-7) · การเรียงรายการ/การแจ้งเตือน · schema/migration (ไม่มี)
- `SmsAutoEnter` รับรูปปก — รอ user (Q-A1)

## ห้าม deploy ก่อนจบ W3

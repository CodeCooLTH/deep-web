---
title: "BRD — 00087 Courier Pickup List"
owner: shinobu22
status: draft
created: 2026-10-29
tags: [feature, brd, shipping, pickup]
related: ["[[PRD]]", "[[00084 - Flash Express Direct Integration]]"]
---

> **โมดูล:** 00087 - Courier Pickup List · **ประเภทเอกสาร:** Business Rules Document (BRD) · **เวอร์ชัน:** 0.1 · **สถานะ:** Draft — รอ user อนุมัติ

# BRD: เมนูเรียกรถ

## BR-1 ใครเห็นเมนู/หน้า
- ร้าน vertical `ONLINE_SALES` ทุกร้านเห็นเมนู (มติ 2026-10-29: เมนูอ่านจาก vertical อย่างเดียวเหมือน "การจัดส่ง" — ไม่ query บัญชีขนส่งทุกครั้งที่วาดเมนู) · ร้านที่ไม่เชื่อมขนส่งและไม่มีประวัติเห็น empty state พาไปตั้งค่า · ถอนการเชื่อมแล้วยังดูประวัติได้
- ร้านที่ไม่ใช่ `ONLINE_SALES` เปิด `/pickups` ตรง ๆ = 404 (ด่านจริงอยู่ที่ page ไม่ใช่เมนู)
- Flash ต้องผ่าน `isFlashDirectEnabled(shopId)` ด้วย (ร้านนำร่อง) จึงจะเรียกรถ Flash ได้ — ดูประวัติได้เสมอ
- สิทธิ์: capability `S1` (เท่ากับ API `POST /api/seller/flash/pickups` เดิม) ประกาศใน `route-capabilities.ts`

## BR-2 ข้อมูลที่แสดง
- แหล่งเดียว: ตาราง `ShipmentPickup` กรอง `shopId` เสมอ · ไม่ยิงขนส่งตอนเปิดหน้า (อ่านจากฐานเท่านั้น)
- "ผู้เรียก" = ชื่อผู้ใช้จาก `createdByUserId`
- เบอร์พนักงานแสดงเต็ม (เป็นเบอร์ขนส่ง ไม่ใช่ข้อมูลลูกค้า)
- คำขอ dry-run (`isDryRun`) ติดป้าย "ทดสอบ"

## BR-3 สถานะ (ตัวแปลงกลาง `pickupStatusView`)
| ค่าในฐาน | ข้อความ | โทน | ยกเลิกได้ |
|---|---|---|---|
| REQUESTED | รอขนส่งรับงาน | info | ✓ |
| ACCEPTED | พนักงานรับงานแล้ว | primary | ✓ |
| CLOSED | เข้ารับเสร็จแล้ว | success | ✗ |
| CANCELLED | ยกเลิกแล้ว | secondary | ✗ |
| FAILED | เรียกรถไม่สำเร็จ + `lastErrorMessage` | danger | ✗ |
| อื่น ๆ | ไม่ทราบสถานะ | secondary | ✗ |

สถานะเปลี่ยนจาก webhook ของขนส่งเท่านั้น (Flash courier webhook / iShip pickup webhook) — หน้านี้ไม่เดาสถานะจากเวลา

## BR-4 เรียกรถ
- ใช้ service เดิม `requestFlashPickup` / `requestPickup` (iShip) ไม่เขียนทางใหม่ — กฎเดิมคงอยู่: จำนวน 1–100, ที่อยู่ผู้ส่งต้องครบ, timeout ห้ามแนะนำให้กดซ้ำ
- เชื่อมไว้สองเจ้า → ต้องเลือกขนส่งก่อน · เจ้าเดียว → ข้ามขั้นเลือก
- Flash มีคำขอค้างที่ที่อยู่เดียวกัน → Flash ตอบ 1010 → แสดงข้อความเดิม "มีคำขอเรียกรถที่ยังค้างอยู่…"

## BR-5 ยกเลิก
- ยกเลิกได้เฉพาะสถานะในคอลัมน์ "ยกเลิกได้" · ตรวจซ้ำที่ service (ไม่เชื่อปุ่ม)
  - Flash: `cancelFlashPickup` กันไว้แล้ว (REQUESTED/ACCEPTED เท่านั้น)
  - iShip: `cancelPickup` (`iship.service.ts:2203`) วันนี้กันแค่ CANCELLED → **เพิ่มด่านให้เท่า Flash** (CLOSED/FAILED ยกเลิกไม่ได้)
- ต้องยืนยันก่อน (Swal danger) · สำเร็จ = สถานะ CANCELLED + `cancelledAt`
- ขนส่งปฏิเสธ (เช่น Flash 1011 รถรับงานแล้ว) → แสดงข้อความเดิมของ service สถานะไม่เปลี่ยน

## BR-6 ไม่มี migration · ไม่แตะ API เรียก/ยกเลิกเดิม
เพิ่มเฉพาะ: หน้า `/pickups` (RSC อ่านฐาน) + เมนู + route-capabilities + ตัวแปลงสถานะใน `src/lib` (มีเทส)

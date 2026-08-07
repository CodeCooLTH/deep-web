---
title: "DATABASE — 00036 Service Order Surface"
owner: shinobu22
status: implemented
module: M00036-ServiceOrderSurface
version: "1.0"
created: 2026-08-07
tags: [feature, database, service-queue]
related: ["[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M00036-ServiceOrderSurface · **วันที่:** 2026-08-07

# DATABASE: หน้าการเข้ารับบริการสำหรับร้านคิวงาน

---

## 1. สรุป: ไม่มีการเปลี่ยนแปลงฐานข้อมูล

**ไม่มี migration · ไม่มีคอลัมน์ใหม่ · ไม่มี index ใหม่ · ไม่มี CHECK constraint ใหม่ · ไม่มี enum ใหม่**

ฟีเจอร์นี้เป็น presentation layer ล้วน — ข้อมูลทุกตัวที่ใช้มีอยู่ในฐานตั้งแต่ feature 00024 แล้ว สิ่งที่งานนี้ทำคือ **เอามาแสดง** ในที่ที่ผู้ขายทำงานจริง

> ถ้ารอบถัดไปพบว่าต้องเพิ่มคอลัมน์ ให้หยุดแล้วทบทวน scope ก่อน — นั่นแปลว่าโจทย์เปลี่ยนจากที่ PRD เขียนไว้

---

## 2. คอลัมน์ที่ฟีเจอร์นี้อ่าน (มีอยู่แล้วทั้งหมด)

`model Order` (`prisma/schema.prisma`)

| คอลัมน์ | ชนิด | บรรทัด | ใช้ทำอะไรในฟีเจอร์นี้ |
|---------|------|--------|---------------------|
| `serviceResourceId` | `String?` | 680 | ตัวชี้ว่าใบนี้ผูกกับคิวงานไหน (FK, `onDelete: Restrict`) |
| `serviceStart` | `DateTime? @db.Timestamptz(3)` | 690 | **ตัวตัดสินว่า "ใบนี้เป็นนัด"** + วันเวลาที่แสดง + เกณฑ์ปลดล็อกปุ่มปิดผล |
| `serviceEnd` | `DateTime? @db.Timestamptz(3)` | 691 | ใช้คู่กับ `serviceStart` ตัดสิน `isAllDayAppointment()` เท่านั้น |
| `appointmentStatus` | `String?` | 696 | 5 ค่า — ป้ายสถานะ + แกนกรอง |
| `type` | `String` | — | คู่กับ `serviceStart` ตัดสิน `isServiceOrder` (การ์ดส่งมอบ) |
| `fulfillmentMode` | `String` | — | ตัดสินว่าต้องแสดงการ์ดที่อยู่จัดส่งไหม (พฤติกรรมเดิม) |
| `status` | `String` | — | แกนหลักของตัวกรอง (ไม่ถูกแทนที่ด้วยแกนนัด) |

`model ServiceResource` — อ่านแค่ `id`, `name`

---

## 3. Query ที่เปลี่ยน

ทั้งสองตัวใช้ `include` อยู่แล้ว จึงได้ scalar ของ `Order` ครบทุกคอลัมน์มาตั้งแต่ต้น — ที่ขาดคือ relation ชื่อคิวงานเท่านั้น

```ts
// order.service.ts — getOrdersByShop() และ getOrderForShop()
+ serviceResource: { select: { id: true, name: true } },
```

**ต้นทุน:** join เพิ่ม 1 relation ต่อ query (ไม่ใช่ต่อแถว) · `select` แคบเฉพาะ 2 คอลัมน์ · ไม่มี N+1

**index ที่รองรับอยู่แล้ว** (feature 00024 สร้างไว้ ไม่ต้องเพิ่ม):

| index | map | ใช้เมื่อ |
|-------|-----|---------|
| `Order_serviceResourceId_start_idx` | `[serviceResourceId, serviceStart]` | ปฏิทินของคิวงาน |
| `Order_shopId_type_serviceStart_idx` | `[shopId, type, serviceStart]` | ปฏิทินคิวรวมของร้าน |
| `Order_shopId_appointmentStatus_idx` | `[shopId, appointmentStatus]` | นัดที่รอร้านตัดสิน |

หน้า `/orders` ยังดึงด้วย `where { shopId }` + `orderBy createdAt desc` เหมือนเดิม การกรองตามสถานะนัดทำที่ **หน่วยความจำฝั่ง client** (แพตเทิร์นเดียวกับตัวกรองพัสดุ) จึงไม่มี query pattern ใหม่ที่ต้องการ index เพิ่ม

---

## 4. ผลข้างเคียงที่ต้องไม่เกิด

| กฎ | ที่มา |
|----|------|
| การปิดผลนัด **ห้ามเขียน `Order.status`** | BR-RSV-33 — `setAppointmentOutcome` เขียนเฉพาะ `appointmentStatus` |
| การปิดผลนัด **ห้ามกระทบ Trust Score** | BR-RSV-35 — `NO_SHOW` บันทึกไว้เฉย ๆ ไม่หักคะแนนใคร |
| ห้ามลบ `ServiceResource` ที่ยังมีนัดผูกอยู่ | `onDelete: Restrict` (BR-RSV-08) — เป็นเหตุผลที่ `resourceName` เป็น null ได้ยากมากในทางปฏิบัติ |

---

## 5. ข้อมูลจริงที่ยังไม่ได้ยืนยัน (carry)

| # | สมมติฐาน | วิธีพิสูจน์ |
|---|----------|-----------|
| A-3 | ร้าน walk-in ล้วนมี `appointmentStatus = null` ทุกใบ | `SELECT "appointmentStatus", count(*) FROM "Order" WHERE "shopId"=$1 GROUP BY 1` |
| — | สัดส่วนใบมีนัด vs walk-in ในร้าน `SERVICE_QUEUE` จริง | ใช้ตัดสินว่าเกณฑ์ `hasAppointmentAxis` ควรเป็น `> 0` ใบหรือสัดส่วน |
| — | มีออเดอร์เก่าที่ `fulfillmentMode='SHIPPED'` ค้างในร้าน `SERVICE_QUEUE` กี่ใบ | ใช้ยืนยันว่า BR-SOV-10 มีของจริงให้ทดสอบ |

> ทั้งสามข้อเป็น **SELECT อย่างเดียว** — ปลอดภัยตาม Hard Rule 14 แต่ยังไม่ได้รัน

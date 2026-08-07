---
title: "API — 00036 Service Order Surface"
owner: shinobu22
status: implemented
module: M00036-ServiceOrderSurface
version: "1.0"
created: 2026-08-07
tags: [feature, api, service-queue, appointment]
related: ["[[SRS]]", "[[SDS]]", "[[TestCase]]"]
---

> **โมดูล:** M00036-ServiceOrderSurface · **วันที่:** 2026-08-07

# API: หน้าการเข้ารับบริการสำหรับร้านคิวงาน

---

## 1. สรุป: ไม่มี endpoint ใหม่

ฟีเจอร์นี้ **ไม่สร้าง route ใหม่ ไม่แก้ contract เดิม ไม่แก้ validation schema ใด ๆ**

สิ่งที่มันทำคือ **เรียก endpoint ที่มีอยู่แล้วเป็นครั้งแรกนับตั้งแต่สร้างมา** — นี่คือแก่นของฟีเจอร์ ไม่ใช่หมายเหตุประกอบ

---

## 2. `POST /api/orders/{token}/appointment/outcome`

**สถานะก่อนงานนี้:** มีอยู่จริงตั้งแต่ feature 00024 ขึ้น prod และทำงานได้ถูกต้องทุกอย่าง — แต่ `grep "appointment/outcome"` ทั้ง `src/` เจอเพียง route กับ log ของตัวมันเอง **ไม่มีผู้เรียกฝั่ง UI เลยสักราย** ปฏิทินคิวงานยิงแค่ `GET /api/shops/current/appointments`

ผลคือค่า `COMPLETED` และ `NO_SHOW` **เกิดขึ้นจริงในฐานข้อมูลไม่ได้เลย** นัดทุกใบค้างที่ `SCHEDULED`/`CONFIRMED_BY_BUYER` ตลอดกาล

**ผู้เรียกใหม่:** `orders/[token]/components/AppointmentCard.tsx`

### Request

```http
POST /api/orders/{publicToken}/appointment/outcome
Content-Type: application/json

{ "outcome": "COMPLETED" | "NO_SHOW" }
```

- auth: `requireShopMember()` (session cookie ของ subdomain `seller.*`)
- validation: `AppointmentOutcomeSchema` (Valibot) — ค่าอื่นตอบ 400 `VALIDATION_ERROR`
- ผ่าน `guardApi` (CSRF Origin-check + rate-limit) ตามปกติของทุก mutation

### Response

| status | body | เมื่อไร | UI ทำอะไร |
|--------|------|--------|-----------|
| 200 | `{ "appointmentStatus": "COMPLETED" \| "NO_SHOW" }` | สำเร็จ | toast + `router.refresh()` → ปุ่มหายเอง (terminal) |
| 400 | `{ "error": "VALIDATION_ERROR" }` | outcome ไม่ใช่ 2 ค่านั้น | ไม่มีทางเกิดจากหน้านี้ → ข้อความกลาง |
| 403 | `{ "error": "FEATURE_NOT_AVAILABLE", "message": "..." }` | ร้านไม่ใช่ `SERVICE_QUEUE` | ไม่มีทางเกิด (การ์ดไม่ render) → ข้อความกลาง |
| 404 | `{ "error": "APPOINTMENT_NOT_FOUND" }` | ใบนี้ไม่มี `serviceStart` | ไม่มีทางเกิด (การ์ดไม่ render) → ข้อความกลาง |
| 409 | `{ "error": "APPOINTMENT_TERMINAL" }` | ปิดผลไปแล้ว (เช่นอีกแท็บกดพร้อมกัน) | "นัดนี้ถูกปิดผลไปแล้ว" |
| 409 | `{ "error": "APPOINTMENT_NOT_STARTED" }` | ยังไม่ถึง `serviceStart` | "ยังไม่ถึงเวลานัด — ปิดผลได้ตั้งแต่ {เวลา}" |

**กฎการแปล error (BR-SOV-05):** ห้ามโยน error code ดิบขึ้นจอ · ข้อความต้องบอก **ทางออกที่ทำได้จริง** — `403/404` กดซ้ำก็ไม่ผ่าน จึงไม่บอกว่า "ลองใหม่" แต่บอกว่า "รีเฟรชหน้าแล้วลองอีกครั้ง"

**สิ่งที่ endpoint นี้ต้องไม่ทำ** (บังคับที่ service, ไม่ใช่ที่ UI): ห้ามแตะ `Order.status` (BR-RSV-33) · ห้ามกระทบ Trust Score (BR-RSV-35)

---

## 2b. `PATCH /api/orders/{token}/appointment` (รอบ 2 — user สั่ง 2026-08-07)

**สถานะก่อนงานนี้:** เหมือน `outcome` ทุกประการ — endpoint รองรับการเลื่อนนัดมาตั้งแต่ 00024 และ **ลูกค้ากด "ขอเลื่อน" ได้จริง** จากหน้า `/o/{token}` แต่ไม่มี UI ฝั่งร้านเรียกมันเลย สถานะ `RESCHEDULE_REQUESTED` จึงเป็นทางตัน: ลูกค้าขอมาแล้วผู้ขายตอบไม่ได้

**ผู้เรียกใหม่:** `orders/[token]/components/RescheduleAppointmentSheet.tsx`

### Request

```http
PATCH /api/orders/{publicToken}/appointment
Content-Type: application/json

{
  "resourceId": "<cuid>",        // บังคับ — เปลี่ยนคิวงานพร้อมกับเลื่อนเวลาได้
  "start": "2026-08-09T09:00:00+07:00",
  "end":   "2026-08-09T10:30:00+07:00",
  "reason": "ลูกค้าขอเลื่อน"      // ไม่บังคับ ≤500 ตัวอักษร
}
```

- validation: `SetAppointmentSchema` · auth: `requireShopMember()`
- นัดทั้งวันส่ง `00:00` ถึง `00:00` ของวันถัดไป — ตรงกับนิยามที่ `isAllDayAppointment()` ใช้ตัดสิน (ส่ง `23:59` แล้วนัดจะเลิกเป็น "ทั้งวัน" เงียบ ๆ)

### Response

| status | error | ข้อความที่ UI แสดง | UI ทำอะไรต่อ |
|--------|-------|-------------------|-------------|
| 200 | — | "เลื่อนนัดแล้ว · ลูกค้าต้องยืนยันนัดใหม่อีกครั้ง" | ปิดแผง + `router.refresh()` |
| 409 | `APPOINTMENT_SLOT_FULL` | `{message} — เลือกเวลาอื่นหรือคิวงานอื่น` | เปิดแผงค้างให้แก้ต่อ |
| 409 | `APPOINTMENT_TERMINAL` | "นัดนี้ถูกปิดผลไปแล้ว จึงเลื่อนไม่ได้" | **ปิดแผง + refresh** (แผงไม่มีประโยชน์อีก) |
| 409 | `RESOURCE_INACTIVE` | "คิวงานนี้ถูกปิดใช้งานแล้ว — เลือกคิวงานอื่น" | เปิดแผงค้าง |
| 404 | `RESOURCE_NOT_FOUND` | "ไม่พบคิวงานนี้แล้ว — เลือกคิวงานอื่น" | เปิดแผงค้าง |
| 404 | `APPOINTMENT_NOT_FOUND` | "ไม่พบนัดนี้แล้ว — รีเฟรชหน้าเพื่อดูข้อมูลล่าสุด" | เปิดแผงค้าง |
| 400 | `INVALID_APPOINTMENT_RANGE` | ใช้ `message` จาก server ตรง ๆ | เปิดแผงค้าง |

🛑 **`APPOINTMENT_PAST` ไม่ถูกโยนจาก endpoint นี้** — ตรวจ `setOrRescheduleAppointment` แล้วไม่มีการเช็คว่าเวลาที่เลื่อนไปเป็นอดีตหรือไม่เลย error class ตัวนั้นมาจาก `requestAppointmentReschedule` ซึ่งเป็น endpoint **ฝั่งลูกค้า** คนละเส้น — ดังนั้นปุ่มเลื่อนนัดฝั่งร้าน**ไม่ผูกกับ `notStarted`** (ต่างจากปุ่มปิดผล) ถ้าธุรกิจอยากห้ามเลื่อนไปอดีต ต้องเพิ่ม guard ที่ service ก่อน ไม่ใช่กันที่ UI

**ผลข้างเคียงที่ต้องบอกผู้ใช้:** `setOrRescheduleAppointment` ล้าง `buyerConfirmedAt` เป็น null ทุกครั้งที่เลื่อนนัดที่มีอยู่แล้ว → ป้ายถอยกลับจาก "ลูกค้ายืนยันแล้ว" เป็น "นัดแล้ว" ถ้าไม่เขียนบอกใน toast ผู้ขายจะอ่านว่าระบบพัง

### Endpoint ที่แผงนี้เรียกอ่านเพิ่ม

| endpoint | ใช้ทำอะไร |
|----------|----------|
| `GET /api/shops/current/service-resources?activeOnly=1` | รายชื่อคิวงานให้เลือก (โหลดล้ม → toast error เพราะเลือกไม่ได้ = บันทึกไม่ได้อยู่ดี) |
| `GET /api/shops/current/appointments` | ผ่าน `AppointmentDateSheet` ที่ใช้ซ้ำ — เพิ่ม prop `excludeOrderToken` กรองนัดของใบที่กำลังเลื่อนออกจากตัวนับความว่าง ไม่งั้นวันเดิมขึ้นเต็มปลอม ๆ |

---

## 3. Endpoint ที่ **ไม่ได้** ถูกเรียกในรอบนี้ (ตั้งใจ)

| endpoint | ทำไมไม่เรียก |
|----------|-------------|
| `POST .../appointment/confirm` | เป็นการกระทำของ **ผู้ซื้อ** — มี UI อยู่แล้วที่ `(marketing)/o/[token]/AppointmentCard.tsx` |
| `POST .../appointment/reschedule-request` | เป็นการกระทำของ **ผู้ซื้อ** เช่นกัน |
| `GET /api/shops/current/appointments` | ของปฏิทินคิวงาน — หน้า orders ได้ข้อมูลนัดมากับ RSC อยู่แล้ว ไม่ต้องยิงซ้ำ |

---

## 4. สิ่งที่ frontend ดึงเพิ่มผ่าน RSC (ไม่ใช่ HTTP)

| service | เพิ่มอะไร |
|---------|----------|
| `getOrdersByShop(shopId)` | `serviceResource: { select: { id, name } }` |
| `getOrderForShop(token, shopId)` | เหมือนกัน |

scalar ของนัด (`serviceStart` / `serviceEnd` / `appointmentStatus` / `serviceResourceId`) มากับ `include` เดิมอยู่แล้ว ไม่ต้องเพิ่ม

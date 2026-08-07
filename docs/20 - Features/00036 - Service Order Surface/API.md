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

## 3. Endpoint ที่ **ไม่ได้** ถูกเรียกในรอบนี้ (ตั้งใจ)

| endpoint | ทำไมไม่เรียก |
|----------|-------------|
| `PATCH /api/orders/{token}/appointment` (เลื่อนนัด) | ต้องมี date picker + ตรวจ capacity → PRD Out-of-scope #5 · **ผลข้างเคียง: ผู้ขายยังเลื่อนนัดไม่ได้จากที่ไหนเลยทั้งระบบ** สถานะ `RESCHEDULE_REQUESTED` จึงยังเป็นทางตัน |
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

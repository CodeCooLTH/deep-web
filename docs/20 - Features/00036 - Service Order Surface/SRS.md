---
title: "SRS — 00036 Service Order Surface"
owner: shinobu22
status: implemented
module: M00036-ServiceOrderSurface
version: "1.0"
created: 2026-08-07
tags: [feature, srs, service-queue, orders, appointment]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]", "[[API]]", "[[DATABASE]]", "[[TestCase]]"]
---

> **โมดูล:** M00036-ServiceOrderSurface · **เวอร์ชัน:** 1.0 · **วันที่:** 2026-08-07
> **สถานะ:** Implemented (`0c1aa001` + `2f50f6ba`) — ยังไม่ merge main

# SRS: หน้าการเข้ารับบริการสำหรับร้านคิวงาน

---

## 1. ขอบเขตทางเทคนิค

ฟีเจอร์นี้เป็น **presentation layer ล้วน** — ไม่มี migration, ไม่มี endpoint ใหม่, ไม่มี enum ใหม่, ไม่แตะ validation schema ใด ๆ

ผลที่ตามมา: **ไม่ต้อง sync `docs/SRS.md` (เอกสารระบบ)** เพราะไม่มี data model / API / enum / authorization rule ใดเปลี่ยน (ตรวจตามเกณฑ์ Hard Rule 11)

สิ่งที่เปลี่ยนจริงมี 3 ชั้น:

| ชั้น | เปลี่ยนอะไร |
|------|------------|
| Domain lib (ใหม่) | `src/lib/appointment-stage.ts` — SSOT ของป้าย/สี/ไอคอน/การจัดกองสถานะนัด |
| Vocabulary | `OrderVocab` เพิ่มช่องที่ 6 `fulfillLabel` |
| Query select | `getOrdersByShop` / `getOrderForShop` เพิ่ม relation `serviceResource { id, name }` |

---

## 2. Data flow

```mermaid
flowchart TD
  A["orders/page.tsx (RSC)"] -->|"canUseAppointments(shop)"| B{"isServiceQueue?"}
  B -->|ไม่ใช่| C["appointment = undefined<br/>(ไม่มีแกนนี้เลย)"]
  B -->|ใช่| D["deriveAppointmentStage()<br/>ต่อแถว"]
  D -->|"ไม่มี serviceStart"| E["appointment = null<br/>(walk-in)"]
  D -->|"มี"| F["appointment = { startISO, allDay, resourceName, stage }"]
  C --> G["OrdersList"]
  E --> G
  F --> G
  G -->|"countAppointmentStages()"| H["apptCounts"]
  H --> I{"hasAppointmentAxis"}
  I -->|true| J["ชิปมือถือ + ดรอปดาวน์เดสก์ท็อป + คอลัมน์นัดหมาย"]
  I -->|false| K["ไม่มีองค์ประกอบนัดหมายเลย"]
  G -->|"กรองด้วย o.appointment?.stage"| L["stageFiltered"]
```

**กฎที่โครงนี้บังคับ (BR-SOV-06):** `apptCounts` รับ **stage ที่ derive มาแล้ว** ไม่ใช่ row ดิบ — ผู้เรียกจึงไม่มีทางนับด้วยเกณฑ์อื่นนอกจากเกณฑ์เดียวกับที่ใช้กรอง ตัวเลขบนชิปกับจำนวนแถวจึงเพี้ยนจากกันไม่ได้เชิงโครงสร้าง ไม่ใช่เพราะ "เขียนถูก"

---

## 3. สัญญาของ `src/lib/appointment-stage.ts`

```ts
APPOINTMENT_STAGE_META: Record<AppointmentStatus, { label; cls; icon }>
APPOINTMENT_STAGE_KEYS: readonly AppointmentStatus[]   // ลำดับที่ใช้เรียงชิป/ดรอปดาวน์
isAppointmentStatus(v): v is AppointmentStatus          // ใช้ validate ?appt= จาก URL
deriveAppointmentStage({ serviceStart, appointmentStatus }): AppointmentStatus | null
countAppointmentStages(stages): Record<AppointmentStatus, number>
```

| กฎ | รายละเอียด |
|----|-----------|
| SRS-SOV-01 | `label` **ต้อง** อ่านจาก `APPOINTMENT_STATUS_LABEL` (00024) ห้ามพิมพ์คำใหม่ในไฟล์นี้ |
| SRS-SOV-02 | `deriveAppointmentStage` ตัดสิน "ใบนี้เป็นนัดไหม" จาก **`serviceStart`** ไม่ใช่ `appointmentStatus` — เงื่อนไขเดียวกับที่ `setAppointmentOutcome` ใช้ตอบ 404 (`appointment.service.ts:319`) |
| SRS-SOV-03 | ใบที่มี `serviceStart` แต่ `appointmentStatus` เป็น null/ค่าเพี้ยน = `SCHEDULED` (default เดียวกับปฏิทิน `AppointmentCalendar.tsx:273`) |
| SRS-SOV-04 | `cls` ใช้ `bg-{semantic}/15 text-{semantic}-ink` เท่านั้น (คู่ `-ink` วัดคอนทราสต์แล้ว 6.56–8.47:1) |
| SRS-SOV-05 | สีชุดนี้เป็น SSOT ร่วมกับปฏิทินคิวงาน — แก้ที่นี่แล้วต้องแก้ `_calendar.css` + `AppointmentCalendar.tsx` `STATUS_DOT` ให้ตรงกัน |

### ตารางสถานะ

| สถานะ | ป้าย | สี | ไอคอน | terminal |
|-------|------|-----|-------|---------|
| `SCHEDULED` | นัดแล้ว | warning | `calendar-event` | ไม่ |
| `CONFIRMED_BY_BUYER` | ลูกค้ายืนยันแล้ว | **primary** | `calendar-check` | ไม่ |
| `RESCHEDULE_REQUESTED` | ลูกค้าขอเลื่อน | info | `repeat` | ไม่ |
| `COMPLETED` | ให้บริการแล้ว | **success** | `circle-check-filled` | ใช่ |
| `NO_SHOW` | ไม่มาตามนัด | danger | `clock-off` | ใช่ |

`CONFIRMED_BY_BUYER` ไม่ใช่เขียวโดยเจตนา (BR-SOV-07) — เป็นคำยืนยันของผู้ซื้อว่า *จะมา* ไม่ใช่สิ่งที่ *เกิดขึ้นแล้ว*

### 3.1 ป้ายในแถวกล่องแชท (ส่วนขยาย 2026-08-08 — user request)

แถวรายการแชท (`InboxList.tsx`) แสดงป้าย "ขั้นตอนล่าสุดของออเดอร์" จาก `deriveOrderStage()` มาตั้งแต่ 2026-07-29 ซึ่งขึ้น **"สั่งซื้อแล้ว"** กับทุกออเดอร์ที่ยังไม่มีพัสดุ — รวมออเดอร์นัดของร้านคิวงานที่ไม่มีวันมีพัสดุเลย ป้ายจึงไม่ได้บอกสิ่งที่ร้านต้องรู้ระหว่างคุยแชท (นัดวันไหน / นัดนี้ยังอยู่ไหม)

| กฎ | รายละเอียด |
|----|-----------|
| SRS-SOV-14 | ออเดอร์ที่มี `serviceStart` → ป้ายในแถวแชทพูดเรื่องนัด **แทน** "สั่งซื้อแล้ว" · เกณฑ์ "ใบนี้เป็นนัด" ใช้ `deriveAppointmentStage()` ตัวเดียวกับหน้า `/orders` (SRS-SOV-02) ไม่ได้ดูจาก `Shop.vertical` — ธงของร้านเป็นภาพนิ่งที่เปลี่ยนทีหลังได้ ส่วนช่วงเวลาที่นัดไว้เป็นของตัวออเดอร์เอง |
| SRS-SOV-15 | แทนที่เฉพาะขั้น `ORDERED` ขั้นเดียว — `CANCELLED`/`COMPLETED`(ระดับออเดอร์) และขั้นพัสดุทั้งชุดคงคำเดิม ด้วยเหตุผลเดียวกับที่ `resolveOrderStatusBadge` ไม่ override CANCELLED/CONFIRMED (ความจริงระดับออเดอร์อยู่เหนือรายละเอียดของนัด) |
| SRS-SOV-16 | `OrderStageKey` **ยังเป็น `'ORDERED'`** — เปลี่ยนแค่ `label`/`cls`/`icon` ไม่ใช่ตัวตนที่โค้ดอื่น switch อยู่ (เพิ่ม key ใหม่ = ทุกที่ที่รับ `OrderStageKey` ต้องแก้ตามโดยไม่จำเป็น) |
| SRS-SOV-17 | นัดที่ยังเดินตามแผน (`SCHEDULED`/`CONFIRMED_BY_BUYER`) → **`นัด 16 ส.ค. 69`** (สถานะสื่อผ่านสีของชิปแทน) · นัดที่ไม่ได้เดินตามแผน (`RESCHEDULE_REQUESTED`/`NO_SHOW`/`COMPLETED`) → **คำสถานะจาก `APPOINTMENT_STATUS_LABEL`** เพราะ `setAppointmentOutcome` ไม่แตะ `Order.status` (SRS-SOV-09) ป้ายจึงค้างที่ `ORDERED` ตลอด ถ้าโชว์วันที่อย่างเดียว นัดที่จบ/ถูกขอเลื่อนไปแล้วจะอ่านเหมือนนัดที่ยังรออยู่ตลอดไป |
| SRS-SOV-18 | ปี พ.ศ. **2 หลัก** ผ่าน `formatDayMonthShortYearTH()` (`src/lib/format-date.ts` — ห้าม format เองใน component ตาม `docs/conventions/date-format.md`) · ตัดปีทิ้งไม่ได้เพราะจองข้ามปีเกิดจริง แต่ปีเต็มกินที่บน rail 320px โดยไม่เพิ่มข้อมูล |
| SRS-SOV-19 | ยอด **มัดจำ ไม่แสดง** บนป้ายนี้ (user เคาะ 2026-08-08) — อ่านได้จากแผงออเดอร์ที่กดป้ายแล้วเปิดขึ้นมา |
| SRS-SOV-20 | ชิปมี `max-w-52` + `truncate` + `title` ข้อความเต็ม · `aria-label` รับค่าเต็มเสมอ (ไม่ใช่ค่าที่ถูก CSS ตัด) |
| SRS-SOV-21 | ข้อมูลนัดมาจากคิวรีเดิมของ `enrichWithOrderStage()` (`o."serviceStart"`, `o."appointmentStatus"` เป็นคอลัมน์ตรงของ `Order`) — **ไม่เพิ่ม query/round-trip** ต่อแถว (NFR-SOV-3) |

---

## 4. State machine ของปุ่มปิดผล

```mermaid
stateDiagram-v2
  [*] --> ไม่แสดงการ์ด: serviceStart = null
  [*] --> รอถึงเวลา: now < serviceStart
  [*] --> กดได้: now >= serviceStart
  รอถึงเวลา --> กดได้: timer ถึงขอบเวลา (ไม่ต้องรีเฟรช)
  กดได้ --> COMPLETED: กด + ยืนยัน
  กดได้ --> NO_SHOW: กด + ยืนยัน
  COMPLETED --> [*]: ปุ่มหาย เหลือป้าย
  NO_SHOW --> [*]: ปุ่มหาย เหลือป้าย
```

| กฎ | รายละเอียด |
|----|-----------|
| SRS-SOV-06 | ปุ่มต้องปลดล็อกเองเมื่อถึง `serviceStart` — ห้ามคำนวณครั้งเดียวตอน render (พฤติกรรมจริงคือเปิดใบค้างไว้รอลูกค้า) |
| SRS-SOV-07 | `setTimeout` clamp ที่ 24 ชม. — เกิน int32 ms จะ overflow แล้วยิงทันที |
| SRS-SOV-08 | UI เป็นชั้นความสะดวก **ไม่ใช่ชั้นความปลอดภัย** — guard 3 ชั้นของ 00024 ที่ server ต้องยังทำงานครบ |
| SRS-SOV-09 | การปิดผล **ห้ามแตะ `Order.status` และห้ามกระทบ Trust Score** (BR-RSV-33/35) — UI ต้องไม่ "ช่วย" อัปเดตสถานะออเดอร์ตามไปด้วย |
| SRS-SOV-10 | ปุ่ม **เลื่อนนัด** ผูกกับ `!terminal` เท่านั้น **ไม่ผูกกับ `notStarted`** — service ไม่ได้ห้ามเลื่อนไปเวลาที่เป็นอดีต (`AppointmentPastError` มาจากเส้นของลูกค้า คนละ endpoint) |
| SRS-SOV-11 | โหมด "ทั้งวัน vs ระบุช่วงเวลา" ของแผงเลื่อนนัด ตัดสินจาก **นัดใบนั้น** (`allDay`) ไม่ใช่จากตั้งค่าปัจจุบันของร้าน (BR-RSV-57) |
| SRS-SOV-12 | นัดทั้งวันส่ง `00:00` → `00:00` ของวันถัดไป — ส่ง `23:59` แล้วนัดจะเลิกเป็น "ทั้งวัน" เงียบ ๆ |
| SRS-SOV-13 | ตัวนับความว่างของแผงเลื่อนนัดต้องกรองนัดของใบที่กำลังเลื่อนออก (`excludeOrderToken`) |

---

## 5. เงื่อนไขการแสดงผลรวม

| องค์ประกอบ | เงื่อนไข |
|-----------|---------|
| คอลัมน์ "ที่อยู่จัดส่ง" + ดรอปดาวน์ "ขนส่ง" | `hasShippingAxis` (= `vertical === 'ONLINE_SALES'`) |
| ปุ่ม "ดึงจาก iShip" | `ishipEnabled` (vertical + เชื่อม iShip แล้ว) |
| คอลัมน์ "นัดหมาย" + ดรอปดาวน์ "สถานะนัด" | `appointmentFilter !== undefined` (= `hasAppointmentAxis`) |
| ชิปมือถือ | นัดหมาย > พัสดุ > สถานะการขาย (ร้านหนึ่งเข้าเงื่อนไขได้ทางเดียว) |
| ชิป/ตัวเลือก "ไม่มีนัด" (`?appt=NONE`) | อยู่ในแกนนัดหมาย ถัดจาก "ทั้งหมด" — กรองด้วย `!o.appointment` เงื่อนไขเดียวกับที่ `noAppointmentCount` นับ |
| ปุ่ม "เลื่อนนัด" | `!terminal` (เงื่อนไขเดียวกับปุ่มปิดผล แต่ไม่ผูก `notStarted`) |
| ช่วงเวลาเต็ม (`09:00–10:30`) | ตารางเดสก์ท็อป + การ์ดรายละเอียด · การ์ดมือถือแสดงเวลาเริ่มอย่างเดียว · นัดทั้งวันไม่แสดงช่วงทุก surface |
| "สถานะการขาย" ในโมดัลตัวกรอง | `hasStageAxis \|\| hasAppointmentAxis` |
| จุดแดงบนปุ่มตัวกรอง | ต้องตรงกับเงื่อนไขบรรทัดบนเป๊ะ |
| บล็อกนัดหมายบนการ์ดมือถือ | `order.appointment != null` |
| การ์ด "การนัดหมาย" (detail) | `order.serviceStart != null` |
| การ์ด "การส่งมอบ" (ลิงก์ดาวน์โหลด) | `fulfillmentMode === 'NO_SHIPPING' && !isServiceOrder` |
| `isServiceOrder` | `type === 'SERVICE' \|\| serviceStart != null` |

---

## 6. NFR ที่บังคับในโค้ด

| รหัส | ข้อกำหนด | ที่บังคับ |
|------|---------|----------|
| NFR-SOV-1 | ตัวนับ = ตัวกรอง (symbol เดียว) | `countAppointmentStages` รับ stage ไม่ใช่ row |
| NFR-SOV-2 | ไม่มี regression ต่อ ONLINE_SALES/LODGING | ทุกจุดเป็น conditional เพิ่ม ไม่แก้ทางเดิม |
| NFR-SOV-3 | ไม่เพิ่ม query ต่อแถว | ข้อมูลนัดเป็น scalar บน `Order` + relation เดียว |
| NFR-SOV-4 | prop ข้าม RSC ต้อง serializable | ส่ง ISO string ไม่ส่ง `Date` |
| NFR-SOV-5 | ไม่ส่ง PII ที่ไม่ได้ใช้ข้าม RSC | `shipTo`/`shipment` = null ที่ server เมื่อไม่มีแกนพัสดุ |
| NFR-SOV-6 | tap target ≥44px สำหรับ action ที่ย้อนไม่ได้ | `min-h-11` + `gap-3` บนปุ่มปิดผล |
| NFR-SOV-7 | ตัวกรองห้ามตายเงียบ | ซ่อนดรอปดาวน์คู่กับคอลัมน์ที่มันเกาะเสมอ |

---
title: "DATABASE — Backdated Order Date"
owner: shinobu22
status: draft
module: M00033-BackdatedOrderDate
version: "1.0"
created: 2026-08-06
tags: [feature, database, prisma, postgres, order, order-event, unmanaged-sql, check-constraint]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00033-BackdatedOrderDate
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-06
> **สถานะ:** Draft — รอ user review คู่กับ PRD/BRD (Hard Rule 11)
> **เจ้าของเอกสาร:** safepay-database (ดู [[Feature-Docs-Ownership]])

# DATABASE: เลือกวันที่/เวลาของคำสั่งซื้อได้ย้อนหลัง (Backdated Order Date)

---

## 1. Overview

feature 00033 ให้ผู้ขายระบุ "วันที่ลูกค้าสั่ง" เองได้ (ย้อนหลังได้ถึง 90 วัน ล่วงหน้าได้ถึง 7 วัน)
แทนที่จะถูกบังคับเป็นเวลาที่แอดมินกดคีย์เข้าระบบ — สถาปัตยกรรมที่ user ล็อกไว้ (D-1 ใน design spec)
คือ **ทับ `Order.createdAt` ตรง ๆ** ไม่เพิ่มคอลัมน์ `orderedAt` แยก เพราะ `createdAt` ผูกกับ 3 อย่าง
พร้อมกันอยู่แล้ว (เลขออเดอร์ · ลำดับในรายการ · ยอดขายตามช่วงวันที่) และ user ต้องการให้ทั้ง 3 อย่าง
เคลื่อนไปด้วยกันเป็นชุดเดียว

**ผลคือ schema ของ `Order` ไม่มีการเปลี่ยนแปลงแม้แต่คอลัมน์เดียว** — คอลัมน์ `createdAt DateTime @default(now())`
เดิมยังอยู่ครบ เปลี่ยนแค่ "ความหมาย" (จาก "เวลาที่แถวถูกสร้าง" เป็น "วันที่ลูกค้าสั่ง") และ "ผู้ที่ set ค่านี้ได้"
(จากเดิมมีแต่ Postgres `@default(now())` เท่านั้น → ตอนนี้ผู้ขายกำหนดเองได้ผ่าน service layer)

งาน database จริงของฟีเจอร์นี้อยู่ที่ตารางประวัติกิจกรรม `OrderEvent` (feature 00031) เพียงตารางเดียว
— ต้องเพิ่มชนิดเหตุการณ์ใหม่ `ORDER_DATE_CHANGED` เข้าไปในรายการค่าที่ CHECK constraint
`OrderEvent_type_check` ยอมรับ (constraint นี้เป็น **unmanaged SQL**, Prisma DSL ประกาศ CHECK ไม่ได้)

- **เอกสารออกแบบต้นทาง:** `docs/superpowers/specs/2026-08-06-backdated-order-date-design.md` (design approved) + `docs/superpowers/plans/2026-08-06-backdated-order-date.md` Task 5 (SQL ต้นฉบับของ migration นี้)
- **Store ที่เกี่ยวข้อง:** PostgreSQL 16 (Supabase) ตัวเดียวกับทั้งระบบ — ผ่าน Prisma Client ที่มีอยู่แล้ว ไม่มี store ใหม่
- **Engine / Charset:** ไม่เปลี่ยนจากที่มีอยู่ (ไม่มีการสร้างตารางใหม่)

---

## 2. ERD

ไม่มีตารางใหม่ — ERD ด้านล่างแสดงเฉพาะ **field ที่มีอยู่แล้วและถูกอ่าน/เขียนโดยฟีเจอร์นี้** เพื่อให้เห็นว่า
`Order.createdAt` (ไม่เปลี่ยน schema) กับ `OrderEvent.type`/`OrderEvent.meta` (ขยาย CHECK + คีย์ใหม่ใน `meta`)
เกี่ยวข้องกันอย่างไร

```mermaid
erDiagram
    Order ||--o{ OrderEvent : "มีไทม์ไลน์เหตุการณ์ (feature 00031)"
    Order ||--o{ OrderItem : "มีรายการสินค้า (ไม่แตะ)"

    Order {
        string id PK
        string publicToken "ใช้คำนวณ orderNo ร่วมกับ createdAt — ไม่แตะ"
        string orderNo "เก็บ snapshot ของ formatOrderNo(publicToken, createdAt) — ต้อง recompute เมื่อ createdAt เปลี่ยน (ดู §4)"
        string shopId FK
        datetime createdAt "ไม่เปลี่ยน schema — เปลี่ยนความหมายเป็น วันที่ลูกค้าสั่ง (feature 00033 D-1); ยังมี @default(now())"
        string status "ไม่แตะ — PENDING เท่านั้นที่แก้ createdAt ได้ทีหลัง"
    }

    OrderEvent {
        string id PK
        string orderId FK
        string type "CHECK OrderEvent_type_check (unmanaged SQL) — เพิ่มค่าที่ 10: ORDER_DATE_CHANGED"
        string actorUserId FK "nullable — คนที่กดสร้าง/แก้"
        json meta "เพิ่ม 3 คีย์ใหม่: orderedAt, orderedAtFrom, orderedAtTo (ISO string, ไม่ใช่ PII)"
        datetime occurredAt "เวลาจริงที่กด (now) เสมอ — ไม่ย้อนตาม createdAt ที่ผู้ขายกรอก (มติ user 2026-08-06)"
    }
```

---

## 3. Tables

ไม่มีตารางใหม่ — หัวข้อนี้ระบุตารางที่มีอยู่แล้วซึ่งฟีเจอร์นี้พึ่งพาโดยตรง พร้อมระบุว่าส่วนใด "แตะ" และส่วนใด "ไม่แตะ"

### 3.1 `Order` (มีอยู่แล้ว — schema.prisma:616-777) — **ไม่มีการเปลี่ยนแปลงคอลัมน์ใด ๆ**

| ฟิลด์ | ชนิด | Default | สถานะสำหรับ 00033 |
|-------|------|---------|---------------------|
| `createdAt` | `DateTime` | `@default(now())` | **โครงสร้างไม่เปลี่ยน** — ยังเป็นคอลัมน์เดิมเป๊ะ (schema.prisma:633). สิ่งที่เปลี่ยนคือชั้นแอปพลิเคชัน: `createOrder`/`updateOrder` (`src/services/order.service.ts`) รับพารามิเตอร์ `createdAt?: Date` ใหม่แล้วส่งเข้า Prisma `data.createdAt`/`update({ createdAt })` ตรง ๆ — ไม่ส่งมา = `undefined` → Postgres `DEFAULT now()` ทำงานเหมือนเดิมทุกประการ (zero-regression) |
| `orderNo` | `String?` | `null` | **โครงสร้างไม่เปลี่ยน** — แต่ **ค่าที่เก็บต้อง recompute** ทุกครั้งที่ `createdAt` เปลี่ยนจากการแก้ไข (`formatOrderNo(publicToken, createdAt)` คิดปี/เดือนจาก `createdAt`) ดูรายละเอียดผลกระทบต่อ `@@index([orderNo])` ใน §4 |
| `publicToken` | `String` | `@default(uuid())` | ไม่แตะ — เป็นส่วน 8 หลักท้ายของ `orderNo` ที่ไม่เปลี่ยนตามวันที่ |
| `status` | `String` | `@default("PENDING")` | ไม่แตะ schema — ใช้เป็นเงื่อนไข *ที่มีอยู่แล้ว* ว่าแก้ `createdAt` ทีหลังได้เฉพาะออเดอร์ `PENDING` (`updateOrder` โยน `OrderNotEditableError` อยู่แล้วที่ `order.service.ts:466` — ฟีเจอร์นี้ไม่เพิ่มเงื่อนไขใหม่ ใช้ gate เดิม) |

🛑 **ไม่มี CHECK constraint ใหม่บน `Order.createdAt`** — ช่วงเวลาที่ยอมรับ (`now − 90 วัน` ถึง `now + 7 วัน`)
เป็น **business rule ที่ผูกกับเวลา ณ ขณะบันทึก (`now` เคลื่อนที่ตลอดเวลา)** ไม่ใช่ค่าคงที่แบบ enum —
Postgres CHECK constraint ตรวจกับค่าคงที่/ฟังก์ชัน immutable เท่านั้น จะเขียน `CHECK (createdAt >= now() - interval '90 days')`
ไม่ได้ (Postgres ปฏิเสธเพราะ `now()` ไม่ใช่ immutable function) ต้องบังคับที่ application layer
(`src/lib/order-date-window.ts` เป็น SSOT, เรียกซ้ำทั้งใน Valibot และ service — ดู SDS/SRS) การไม่มี DB
constraint ตรงนี้จึงเป็นข้อจำกัดของ Postgres เอง ไม่ใช่การละเว้น defense-in-depth โดยพลการ

### 3.2 `OrderEvent` (มีอยู่แล้ว — feature 00031, schema.prisma:2707-2750) — **ขยาย CHECK constraint + คีย์ใหม่ใน `meta`**

| ฟิลด์ | ชนิด | เปลี่ยนอย่างไรสำหรับ 00033 |
|-------|------|------------------------------|
| `type` | `String` | **ค่าที่ยอมรับขยายจาก 9 → 10 ค่า** (เพิ่ม `'ORDER_DATE_CHANGED'`) — บังคับที่ 2 ชั้น: (1) TypeScript union `OrderEventType` ใน `src/lib/order-event.ts` (2) DB CHECK `OrderEvent_type_check` (**unmanaged SQL** — ต้องแก้ด้วย migration เขียนมือ ดู §5) |
| `meta` | `Json @default("{}")` | โครงสร้างคอลัมน์ไม่เปลี่ยน (ยังเป็น `Json` เสรี) — เพิ่ม **3 คีย์ใหม่ตามธรรมเนียมเดิมของตาราง** (โครงต่างกันตาม `type`): |
| | | • `orderedAt?: string` (ISO) — แนบใน event `ORDER_CREATED` เฉพาะตอนวันที่ที่เลือก ≠ เวลาที่กดสร้างจริง (ออเดอร์ปกติไม่มีคีย์นี้เลย) |
| | | • `orderedAtFrom?: string` / `orderedAtTo?: string` (ISO ทั้งคู่) — แนบใน event `ORDER_DATE_CHANGED` เท่านั้น |
| `occurredAt` | `DateTime` (ไม่มี default) | **ไม่เปลี่ยน schema แต่ต้องระวังผู้เรียก** — คอลัมน์นี้นิยามไว้แล้วว่า "เวลาที่เหตุการณ์เกิดจริง" (schema.prisma:2731-2733) มติ user 2026-08-06 ย้ำว่าสำหรับฟีเจอร์นี้ `occurredAt` ต้องเป็น **เวลาจริงที่มีคนกด (`now`) เสมอ** ไม่ใช่ค่า `createdAt` ที่ผู้ขายกรอกย้อนหลัง — เดิม `order.service.ts:329` ส่ง `occurredAt: order.createdAt` ซึ่ง "บังเอิญถูก" เพราะสองค่านี้เท่ากันมาตลอด (ก่อนฟีเจอร์นี้ไม่มีทางกรอก `createdAt` เองได้) พอย้อนหลังได้แล้วค่านี้จะผิดทันทีถ้าไม่แก้ (จุดนี้ TypeScript ไม่ฟ้อง ไม่มี type error — เป็นความรับผิดชอบของ service layer ไม่ใช่ database) |

🛑 **`OrderEvent_type_check` เป็น unmanaged SQL** — Prisma DSL ไม่มีวิธีประกาศ CHECK constraint บน
`String` field ได้ (จึงไม่ปรากฏใน `schema.prisma` แม้จะมีอยู่จริงในฐาน) **ห้าม `prisma db pull`** เด็ดขาด
เพราะ introspection มองไม่เห็น constraint ประเภทนี้ แล้วจะสร้าง migration ถัดไปที่ `DROP` constraint ทิ้งโดยไม่ตั้งใจ
(precedent เดียวกับ `Shop_vertical_check` ของ feature 00028, `Order_room_no_overlap`/`Order_service_seat_no_overlap`
ของ feature 00017/00024) — ทุกครั้งที่ต้องเพิ่มค่าใน `OrderEventType` union **ต้องเขียน migration เขียนมือคู่กันเสมอ**

**PII:** ทั้ง 3 คีย์ใหม่เป็นค่าเวลา (ISO datetime string) ล้วน ไม่ใช่ PII ของผู้ซื้อ — เก็บค่าจริงได้โดยไม่ขัด
กติกาเดิมของตาราง (schema.prisma:2726-2728 ห้าม PII ผู้ซื้อดิบใน `meta` เพราะร้านมีพนักงานหลายคนเปิดดูได้และ
หน้า `(paces)` อยู่ใต้ client layout ที่ serialize ทุก field ลง flight payload) กติกานั้นยังมีผลเต็มที่กับคีย์อื่น
ของ `meta` ต่อไป — ไม่ได้ถูกยกเลิกหรือผ่อนโดยฟีเจอร์นี้

---

## 4. Indexes

**ไม่มี index ใหม่** — งานนี้ไม่เพิ่ม query pattern ใหม่ที่ต้องมี index รองรับต่างหาก แต่ต้องอธิบายผลกระทบต่อ
2 index ที่มีอยู่แล้วบน `Order` ให้ชัด เพราะ "ความหมาย" ของคอลัมน์ที่ index อ้างถึงเปลี่ยนไป (ไม่ใช่ตัว index เอง)

| Table | Columns | Type | ผลกระทบจากฟีเจอร์ 00033 |
|-------|---------|------|---------------------------|
| `Order` | `@@index([shopId, status, createdAt])` (schema.prisma:768 — เดิมรองรับ P&L Revenue query FR-EXP-06-AC-01: `WHERE shopId=X AND status='CONFIRMED' AND createdAt BETWEEN start,end`) | BTREE composite | **ไม่ต้องแก้ index** — query pattern เดิมเหมือนเดิมทุกประการ (กรองตามช่วง `createdAt`) สิ่งที่เปลี่ยนคือ **ค่าที่อยู่ในคอลัมน์** ไม่ใช่ query. ผลลัพธ์ทางธุรกิจคือยอดขายของแต่ละงวดจะขยับตามวันที่ที่ผู้ขายเลือก (นี่คือ*จุดประสงค์*ของฟีเจอร์นี้ — ดู design spec §3 ผลลัพธ์ที่ต้องได้ข้อ 3) — index ตัวเดิมพอเพียง ไม่ต้อง rebuild หรือเพิ่ม column |
| `Order` | `@@index([orderNo])` (schema.prisma:764 — "ค้นหา/อ้างอิงด้วยเลขคำสั่งซื้อ ไม่ unique เป็นป้าย ไม่ใช่ identity") | BTREE | 🛑 **ต้องดูแลที่ application layer ทุกครั้งที่ `createdAt` ถูกแก้** — `orderNo` เป็นคอลัมน์ที่ **เก็บ snapshot** ของ `formatOrderNo(publicToken, createdAt)` ไม่ใช่ generated column ที่ Postgres คำนวณสดให้ ดังนั้นถ้า `updateOrder` เปลี่ยน `createdAt` แต่ไม่ `UPDATE orderNo` ตามในทรานแซกชันเดียวกัน แถวใน index นี้จะ **ค้างเลขเดือนเก่า** ขณะที่หน้าจอทุกจุด (`OrderCard.tsx:124`, `OrdersTable.tsx:129,184`, `OrderQrSheet.tsx:40`, `(marketing)/o/[token]/OrderDetailMobile.tsx:49`) คำนวณเลขสดจาก `createdAt` เสมอ (ไม่เคยอ่านคอลัมน์ `orderNo`) — ผลคือผู้ใช้เห็นเลขหนึ่งบนจอ แต่ค้นหาด้วยเลขนั้นผ่าน `@@index([orderNo])` แล้ว **ไม่เจอแถวตัวเอง** เพราะคอลัมน์จริงยังเป็นเลขเดือนเก่า **นี่ไม่ใช่ index bug — เป็นภาระของ service layer ที่ต้อง `UPDATE` ทั้งสองคอลัมน์ (`createdAt` + `orderNo`) ในทรานแซกชันเดียวกันเสมอ** (ระบุไว้แล้วใน design spec §5.1 และ plan Task 7 Step 3) เอกสารนี้บันทึกไว้เป็นข้อผูกพันระดับ data-integrity ที่ทีม DB ต้องยืนยันร่วมกับ service layer ก่อน sign-off |

**สรุปสำหรับ query planner:** ไม่มี index ต้องสร้าง/แก้/ลบ — คำเตือนข้างต้นเป็นเรื่อง **ความสอดคล้องของข้อมูล (consistency)**
ระหว่าง 2 คอลัมน์ที่ derive จากกันและกัน ไม่ใช่เรื่องประสิทธิภาพของ index

---

## 5. Migration Plan

### 5.1 ลำดับการ Migrate

มี **migration เดียว** สำหรับฟีเจอร์นี้ — ไม่มีการเปลี่ยนแปลงใด ๆ กับตาราง `Order`

| ลำดับ | การเปลี่ยนแปลง | Submodule / Store | หมายเหตุ (dependency) |
|-------|----------------|--------------------|------------------------|
| 1 | ขยาย CHECK `OrderEvent_type_check` บนตาราง `OrderEvent` ให้ยอมรับค่าที่ 10 คือ `'ORDER_DATE_CHANGED'` (จากเดิม 9 ค่า) | PostgreSQL 16 (Supabase) — ตารางเดียวกับทั้งระบบ | ไม่มี dependency กับ migration อื่น — ตาราง `OrderEvent` มีอยู่แล้วจาก feature 00031 (migration `20260805000000_order_event_activity_log`) ต้อง apply ก่อนหน้านี้แล้วเท่านั้น (เป็นจริงอยู่แล้วเพราะ deploy ตามลำดับเวลา) |

**ไฟล์ migration:** `prisma/migrations/20260806120000_order_event_date_changed/migration.sql`

```sql
-- prisma/migrations/20260806120000_order_event_date_changed/migration.sql
-- feature 00033 — เพิ่มชนิดเหตุการณ์ ORDER_DATE_CHANGED (เลื่อนวันที่คำสั่งซื้อ)
--
-- CHECK นี้เป็น unmanaged SQL: Prisma DSL ประกาศไม่ได้ จึงต้องเขียนมือทุกครั้งที่รายชื่อเปลี่ยน
-- และห้าม `prisma db pull` เด็ดขาด (introspect ไม่เห็น แล้วจะสร้าง migration ที่ DROP ทิ้ง)
--
-- ตารางนี้มีข้อมูลแล้ว จึงใช้ NOT VALID + VALIDATE ตามแบบเดียวกับ Shop_vertical_check:
-- ADD ... NOT VALID จับล็อกสั้น ๆ, VALIDATE สแกนแถวเดิมโดยไม่บล็อกการเขียน
-- (แถวเดิมทุกแถวผ่านอยู่แล้วเพราะรายชื่อใหม่เป็น superset ของเดิม)

ALTER TABLE "OrderEvent" DROP CONSTRAINT IF EXISTS "OrderEvent_type_check";

ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
    'ORDER_CREATED',
    'ORDER_EDITED',
    'ORDER_CANCELLED',
    'TRACKING_ADDED',
    'SHIPMENT_CREATED',
    'SHIPMENT_CANCELLED',
    'SHIPMENT_LINKED',
    'SMS_LINK_SENT',
    'BUYER_CONFIRMED',
    'ORDER_DATE_CHANGED'
)) NOT VALID;

ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
```

**ทำไมต้อง `DROP` แล้ว `ADD` แทนการ `ALTER`:** Postgres ไม่มีคำสั่งแก้รายชื่อค่าใน CHECK ตรง ๆ
(ต่าง จาก `ALTER TYPE ... ADD VALUE` ของ native enum) ต้องลบ constraint เดิมทิ้งแล้วสร้างใหม่ทั้งก้อนเสมอ
— รูปแบบนี้ตรงกับ pattern เดียวกับที่ใช้ตอนสร้าง `OrderEvent_type_check` ครั้งแรก (feature 00031) และ
ตอนขยาย `Shop_vertical_check` (feature 00028)

**ทำไมต้อง `NOT VALID` + `VALIDATE CONSTRAINT` แยกคำสั่ง (ไม่ใช่ `ADD CONSTRAINT` ตรง ๆ):**
`OrderEvent` เป็นตารางที่มีข้อมูลจริงอยู่แล้ว (สร้าง 2026-08-05 พร้อม backfill ประวัติย้อนหลัง) การ
`ADD CONSTRAINT ... CHECK (...)` แบบไม่มี `NOT VALID` จะสแกนทั้งตารางพร้อมถือ `ACCESS EXCLUSIVE LOCK`
ตลอดการสแกน (บล็อกทั้งอ่านและเขียนตาราง `OrderEvent` ซึ่งถูก insert ทุกครั้งที่มีการกระทำกับออเดอร์)
`NOT VALID` ทำให้ `ADD CONSTRAINT` เป็น metadata-only (ล็อกสั้น) แล้ว `VALIDATE CONSTRAINT` แยกคำสั่ง
สแกนตรวจแถวเดิมโดยใช้ lock ที่เบากว่า (ไม่บล็อกการเขียนระหว่างสแกน) — ปลอดภัยกว่าสำหรับตารางที่มี insert
ต่อเนื่องบน prod ที่ใช้ dev DB ร่วมกัน (Hard Rule 14/15)

**ทำไมไม่ต้องกลัวว่าแถวเดิมจะไม่ผ่าน:** รายชื่อค่าใหม่ (10 ค่า) เป็น **superset** ของรายชื่อเดิม (9 ค่า)
— ไม่มีการเปลี่ยนชื่อหรือลบค่าใดออก ทุกแถวที่มีอยู่แล้วผ่าน constraint เดิมมาแล้วจึงผ่าน constraint ใหม่
โดยอัตโนมัติ 100% `VALIDATE CONSTRAINT` จะไม่พบแถวที่ล้มเหลวแม้แต่แถวเดียว **ไม่ต้องมี data migration/backfill
ใด ๆ ประกอบ** (ต่างจากกรณี rename enum เช่น feature 00028 ที่ต้อง backfill `GENERAL → ONLINE_SALES` ก่อน
เพิ่ม CHECK เพราะเป็นการ *แทนที่* ค่า ไม่ใช่ *เพิ่ม* ค่า)

**การ apply กับฐาน local (Hard Rule 14 — ปักหมุด URL localhost ในคำสั่งตรง ๆ ห้าม `$(...)`/`.env.local`):**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
DIRECT_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
npx prisma migrate deploy
```

🛑 **Hard Rule 15 — push `main` = migrate ขึ้น prod อัตโนมัติ:** `vercel.json` รัน `prisma migrate deploy`
ตอน build ทุกครั้ง ไม่มีใครต้องสั่ง migrate ชี้ prod ด้วยมือ **ต้องแจ้ง user ก่อน push ทุกครั้ง** ครบ 3 ข้อ:
(1) prod ไม่ต้องสั่งเอง (2) ฐาน local ต้อง apply เอง — คำสั่งด้านบน (3) migrate ล้ม = build ล้ม = deploy ไม่ขึ้น

### 5.2 Rollback

**Rollback SQL** (ย้อนกลับไปเหลือ 9 ค่าเดิม — ต้องมั่นใจก่อนว่าไม่มีแถวใช้ค่าใหม่ค้างอยู่):

```sql
-- Rollback ของ 20260806120000_order_event_date_changed
-- 🛑 ก่อนรัน: ต้องยืนยันว่าไม่มีแถว OrderEvent.type = 'ORDER_DATE_CHANGED' ค้างอยู่ในฐาน
-- SELECT COUNT(*) FROM "OrderEvent" WHERE "type" = 'ORDER_DATE_CHANGED'; -- ต้องได้ 0

ALTER TABLE "OrderEvent" DROP CONSTRAINT IF EXISTS "OrderEvent_type_check";

ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_type_check" CHECK ("type" IN (
    'ORDER_CREATED',
    'ORDER_EDITED',
    'ORDER_CANCELLED',
    'TRACKING_ADDED',
    'SHIPMENT_CREATED',
    'SHIPMENT_CANCELLED',
    'SHIPMENT_LINKED',
    'SMS_LINK_SENT',
    'BUYER_CONFIRMED'
)) NOT VALID;

ALTER TABLE "OrderEvent" VALIDATE CONSTRAINT "OrderEvent_type_check";
```

🛑 **ข้อจำกัดของ rollback นี้ — ต้องอ่านก่อนรัน:**

- ถ้ามีแถว `OrderEvent.type = 'ORDER_DATE_CHANGED'` ค้างอยู่แล้ว (เกิดขึ้นจริงตั้งแต่ผู้ขายคนแรกกดแก้วันที่
  หลัง deploy) การรัน `VALIDATE CONSTRAINT` ของรายชื่อ 9 ค่าเดิมจะ **ล้มทันที** (error 23514) เพราะแถวเหล่านั้น
  ไม่ผ่านรายชื่อที่แคบลง — Postgres จะไม่ยอมให้ constraint ที่ invalid ค้างอยู่แบบเงียบ ๆ
- **ห้ามแก้ปัญหานี้ด้วยการลบแถว `ORDER_DATE_CHANGED` ทิ้ง** — `OrderEvent` เป็นตาราง audit log
  แบบ insert-only ตามเจตนาเดิมของ feature 00031 (schema.prisma:2705 "insert-only — ไม่มี UPDATE/DELETE
  ผ่าน application code") การลบแถวประวัติเพื่อให้ rollback ผ่านขัดกับจุดประสงค์ทั้งหมดของตาราง
  (หลักฐานเมื่อเกิดข้อพิพาท) และเป็นการทำลายข้อมูลที่ไม่มี CLAUDE.md rule ใดอนุญาตให้ทำโดยไม่ได้รับคำสั่งชัดเจน
- **แผนจริงถ้าต้องถอย feature นี้หลัง deploy:** revert เฉพาะโค้ดชั้นแอปพลิเคชัน (service/API/UI ที่เขียน
  `ORDER_DATE_CHANGED`) ให้เลิกสร้างแถวชนิดนี้ **ต่อไป** แต่ **คง CHECK constraint 10 ค่าไว้ในฐานถาวร**
  เพื่อไม่ให้แถวเก่าที่มีอยู่แล้วกลายเป็นข้อมูลที่ผิด constraint ปัจจุบัน — นี่คือ rollback ที่ปลอดภัยจริง
  ไม่ใช่การ DROP constraint กลับ
- SQL rollback ด้านบนมีไว้สำหรับกรณีเดียวเท่านั้น: **ย้อนก่อนแถวแรกถูกสร้าง** (เช่น พบบั๊กในโค้ดตั้งแต่
  ช่วง staging/ก่อน user คนแรกใช้งานจริง) — ใช้ query ตรวจ `COUNT(*)` ด้านบนก่อนรันเสมอ

### 5.3 ผลกระทบ (Impact)

- **Downtime:** ไม่มี — `NOT VALID` + `VALIDATE CONSTRAINT` ออกแบบมาเพื่อไม่บล็อกการอ่าน/เขียนตารางระหว่าง
  migration (ต่างจาก `ADD CONSTRAINT` ตรง ๆ ที่ล็อกยาวตลอดการสแกน)
- **Lock ตารางใหญ่:** `OrderEvent` โตเร็วกว่า `Order` หลายเท่า (1 การกระทำ = 1 แถว ตามคอมเมนต์ใน schema)
  แต่ด้วย `NOT VALID` ล็อกที่ `ADD CONSTRAINT` เป็น metadata-only (สั้นมาก ไม่ขึ้นกับขนาดตาราง) ส่วน
  `VALIDATE CONSTRAINT` สแกนทั้งตารางจริงแต่ใช้ lock ระดับที่ยอมให้ insert ใหม่แทรกได้ระหว่างสแกน
- **ข้อมูลเดิม:** ไม่มีแถวใดถูกแก้ไข/ลบ — เป็น DDL-only ไม่มี DML ในไฟล์ migration นี้ (ต่างจาก
  migration ของ feature 00031 ที่มีทั้ง DDL สร้างตารางและ DML backfill ในไฟล์เดียว) รายชื่อค่าที่ยอมรับ
  ขยาย ไม่ตัดค่าเดิมออกแม้ค่าเดียว
- **Backward compatibility:** สมบูรณ์ 100% — แอปเวอร์ชันเก่า (ก่อน deploy โค้ดที่รู้จัก `ORDER_DATE_CHANGED`)
  ยัง insert ค่าเดิม 9 ค่าได้ปกติเพราะเป็น superset; แอปเวอร์ชันใหม่ insert ค่าที่ 10 ได้เพิ่มเติม
- **ผลต่อ service layer ที่อ่านตารางนี้:** `describeOrderEvent` (`src/lib/order-event.ts`) และหน้า Activity
  Log ต้องรู้จัก case `ORDER_DATE_CHANGED` ก่อน deploy migration นี้จริง มิฉะนั้นแถวใหม่จะ render เป็น
  ค่า `default` ที่ไม่มีคำอธิบาย — เป็นความรับผิดชอบของ Task 5 Step 1-2 (`safepay-developer`) ไม่ใช่ของ
  migration แต่บันทึกไว้ที่นี่เพื่อยืนยันว่าไม่มี field ฝั่ง DB ที่ตกหล่นจาก TypeScript union
- **Consistency ข้าม store:** ไม่เกี่ยวข้อง — ฟีเจอร์นี้ใช้ store เดียว (PostgreSQL) ไม่มีการ sync ข้าม store

---

## 6. Retention / ข้อควรระวัง

| หัวข้อ | รายละเอียด |
|--------|-----------|
| **ห้าม `prisma db pull`** | ไม่เปลี่ยนจากคำเตือนเดิมของ feature 00028/00024/00017/00031 — ฐานข้อมูลมี unmanaged SQL สะสมหลายชั้น (`Shop_vertical_check`, `OrderEvent_type_check` ที่ตอนนี้มี 10 ค่า, EXCLUDE constraint การจองซ้อนของ 00017/00024) ที่ introspection มองไม่เห็นแล้วจะสร้าง migration ที่ `DROP` ทิ้ง ฟีเจอร์นี้ไม่เพิ่มความเสี่ยงใหม่แต่ก็ไม่ลดความเสี่ยงเดิม — ยังต้องระวังเหมือนเดิมทุกประการ |
| **ห้าม `prisma migrate dev`** | Hard Rule 14 — เขียน migration SQL ด้วยมือแล้ว apply ด้วย `prisma migrate deploy` ปักหมุด URL localhost ตรง ๆ เท่านั้น (§5.1) ห้ามใช้ `migrate dev` เพราะจะพยายาม diff schema จาก `schema.prisma` ซึ่งไม่รู้จัก CHECK constraint นี้อยู่แล้ว (unmanaged) |
| **`Order.orderNo` เป็น derived/denormalized column ที่ไม่ sync อัตโนมัติ** | ผู้พัฒนาที่อ่าน schema เพียงอย่างเดียวจะเห็นแค่ `orderNo String?` และเข้าใจผิดว่า Postgres ดูแลความถูกต้องให้เอง — ความจริงคือ **ต้องมี application code (`updateOrder`) `UPDATE` คอลัมน์นี้พร้อมกับ `createdAt` ในทรานแซกชันเดียวกันเสมอ** ไม่งั้น `@@index([orderNo])` จะมีแถวที่ไม่ตรงกับสิ่งที่ผู้ใช้เห็นบนจอ (รายละเอียดเต็มใน §4) |
| **PII** | ไม่มีตาราง/ฟิลด์ใหม่ที่เก็บ PII — คีย์ใหม่ทั้ง 3 ตัวใน `OrderEvent.meta` (`orderedAt`/`orderedAtFrom`/`orderedAtTo`) เป็นค่าเวลาล้วน ไม่ใช่ PII ของผู้ซื้อ กติกาเดิมของตาราง (ห้าม PII ผู้ซื้อดิบใน `meta` ทุก type) ยังมีผลเต็มที่กับคีย์อื่นที่มีอยู่ก่อนแล้ว |
| **Performance** | ไม่มีผลกระทบเชิงลบ — ไม่มี query pattern ใหม่, ไม่มีตารางโตเร็วขึ้นผิดปกติ (อัตราการ insert `OrderEvent` เพิ่มขึ้นเล็กน้อยเฉพาะตอนมีคนแก้วันที่ออเดอร์ ซึ่งเป็นเหตุการณ์ที่ไม่บ่อยเทียบกับ `ORDER_CREATED`) `NOT VALID` + `VALIDATE CONSTRAINT` เลือกมาเพื่อลดผลกระทบต่อ lock บนตารางที่มี insert ต่อเนื่องอยู่แล้ว (§5.3) |
| **Data Retention** | ไม่เปลี่ยนจากเดิม — `OrderEvent` เป็น insert-only ไม่มี auto-purge (จุดประสงค์คือหลักฐานเมื่อเกิดข้อพิพาท) แถว `ORDER_DATE_CHANGED` ก็อยู่ภายใต้กติกาเดียวกันนี้ ไม่มีการลบทิ้งเอง |

---

## 7. Traceability

| Table / Field | Design Spec §/Decision | สถานะ |
|--------------------|--------------------------|-------|
| `Order.createdAt` (ไม่เปลี่ยน schema) | design spec §3 D-1 "ทับ `Order.createdAt` ไปเลย", §6 "ไม่มีการเปลี่ยน schema ของ `Order`" | Draft |
| `Order.orderNo` (ต้อง recompute — ผลต่อ §4 index) | design spec §5.1 "เลขออเดอร์ขยับตามวันที่" | Draft |
| `OrderEvent.type` (ขยาย CHECK เป็น 10 ค่า) | design spec §7 "งานที่ต้องทำเพิ่ม: … migration เขียนมือแก้ DB CHECK `OrderEvent_type_check`" / plan Task 5 | Draft — SQL ระบุไว้ครบใน §5.1 ของเอกสารนี้ |
| `OrderEvent.meta.orderedAt` / `.orderedAtFrom` / `.orderedAtTo` | design spec §7 ตารางเหตุการณ์ `ORDER_CREATED`/`ORDER_DATE_CHANGED` | Draft |
| `OrderEvent.occurredAt` (ไม่เปลี่ยน schema — เตือนผู้เรียกเท่านั้น) | design spec §7 "🛑 `occurredAt` ของทุก event = เวลาจริงที่การกระทำเกิดขึ้น (`now`) เสมอ" | Draft |

---

## 8. สรุป (Summary)

- **`Order` ไม่มีการเปลี่ยนแปลง schema แม้แต่คอลัมน์เดียว** — `createdAt DateTime @default(now())` เดิมยังอยู่
  ครบ เปลี่ยนแค่ความหมายและผู้กำหนดค่า (D-1: ทับตรง ๆ ไม่เพิ่มคอลัมน์ `orderedAt` แยก)
- **Migration เดียว** (`20260806120000_order_event_date_changed`) ขยาย CHECK constraint `OrderEvent_type_check`
  จาก 9 → 10 ค่า (เพิ่ม `ORDER_DATE_CHANGED`) ด้วย `NOT VALID` + `VALIDATE CONSTRAINT` เพราะตารางมีข้อมูลแล้ว
  และรายชื่อใหม่เป็น superset ของเดิม 100% — ไม่ต้องมี data migration/backfill ประกอบ
- **ไม่มี index ใหม่** แต่ต้องบันทึกผลกระทบต่อ `@@index([orderNo])` ให้ชัด: `orderNo` เป็นค่าที่เก็บ (ไม่ใช่
  generated column) ต้อง `UPDATE` คู่กับ `createdAt` ในทุกทรานแซกชันที่แก้วันที่ ไม่งั้นค้นด้วยเลขที่หน้าจอ
  แสดงแล้วไม่เจอ
- **CHECK นี้เป็น unmanaged SQL** — ห้าม `prisma db pull`/`migrate dev` เด็ดขาด (Hard Rule 14) เหมือนทุก
  feature ก่อนหน้าที่แตะ constraint ประเภทนี้ (00017/00024/00028/00031)
- **Rollback มีข้อจำกัดสำคัญ:** ย้อน CHECK กลับ 9 ค่าทำได้จริงเฉพาะตอนยังไม่มีแถว `ORDER_DATE_CHANGED`
  ในฐาน — หลัง deploy จริงแล้ว ทางถอยที่ปลอดภัยคือ revert โค้ดแอปพลิเคชันเท่านั้น คง constraint 10 ค่า
  ไว้ถาวร (ห้ามลบแถวประวัติเพื่อให้ rollback ผ่าน — ขัดกับจุดประสงค์ insert-only ของตาราง)
- **PII:** คีย์ใหม่ทั้งหมดใน `meta` เป็นค่าเวลา ไม่ใช่ PII — กติกาห้าม PII ผู้ซื้อดิบใน `OrderEvent.meta`
  เดิมยังมีผลเต็มที่

**Open Questions:** ไม่มี — ขอบเขต database ของฟีเจอร์นี้ชัดเจนตั้งแต่ design spec (D-1 ล็อกแล้วโดย user
2026-08-06) เหลือเพียงรอ PRD/BRD review ตาม Hard Rule 11 ก่อนเริ่ม implementation

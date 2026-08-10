---
title: "DATABASE — Customer Multi-Phone & Merge"
owner: shinobu22
status: draft
module: M00042-CustomerMultiPhoneMerge
version: "1.0"
created: 2026-08-10
tags: [feature, database, prisma, postgres, customer, identity, merge, unmanaged-sql, trigger]
related: ["[[PRD]]", "[[BRD]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00042-CustomerMultiPhoneMerge
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-10
> **สถานะ:** Draft — Open Decisions §4.3 ของ PRD เคาะครบแล้ว (2026-08-10) แต่ SRS/SDS ของโมดูลนี้ยังไม่เขียน
> (ownership ปกติคือ PRD→BRD→SRS→SDS→DATABASE — เอกสารนี้เขียนตรงจาก PRD+BRD ตามคำสั่ง Controller
> เพื่อใช้เป็น contract ให้ SRS/SDS เขียนต่อ ไม่ใช่การข้ามลำดับโดยพลการ)
> **เจ้าของเอกสาร:** safepay-database (ดู [[Feature-Docs-Ownership]])

# DATABASE: ลูกค้าหลายเบอร์และการรวมลูกค้า (Customer Multi-Phone & Merge)

---

## 1. Overview

feature 00042 แก้ข้อจำกัดเดิมของ `Customer` (feature 00014) ที่ผูกกับ **เบอร์เดียว** (`phone @unique`)
ให้รองรับ 2 กลไก: **เพิ่มเบอร์** (ผูกเบอร์ที่สองเข้ากับลูกค้าที่มีอยู่แล้วโดยตรง — เชิงป้องกัน) และ
**รวมลูกค้า** (รวม `Customer` 2 แถวที่เกิดแยกกันไปแล้วเข้าเป็นแถวเดียว พร้อมย้ายประวัติทั้งหมด — เชิงแก้ไข,
**ย้อนกลับไม่ได้ด้วยตัวผู้ขายเอง** ตาม PRD OD-2)

**การตัดสินใจหลักที่ผูกกับ schema (สรุปสั้น — รายละเอียด/เหตุผลอยู่ใน §3/§5):**

| # | คำถาม | คำตอบที่ล็อก |
|---|--------|--------------|
| DB-1 | `Customer.phone` อยู่ต่อไหม | **อยู่ต่อ ไม่เปลี่ยน schema แม้แต่คอลัมน์เดียว** — ยังเป็น "เบอร์หลัก" เหมือนเดิมทุกประการ (backward-compat 100% กับ 20+ จุดที่อ่าน `customer.phone` ตรง ๆ — ดู §9) |
| DB-2 | เบอร์รองเก็บที่ไหน | ตารางใหม่ `CustomerPhone` — เก็บ **เฉพาะเบอร์รอง** (ไม่ปนกับเบอร์หลัก ไม่มี `isPrimary` flag เพราะไม่จำเป็น) |
| DB-3 | กันเบอร์ซ้ำข้าม 2 ตารางยังไง | **DB trigger คู่** (`Customer.phone` ↔ `CustomerPhone.phone`) เป็นด่านสุดท้าย + app-level check-then-insert เป็นด่านแรก (UX 400 ที่อ่านง่าย) — Postgres ไม่มี unique constraint ข้ามตารางตรง ๆ (ดู §5.1 ข้อ 4) |
| DB-4 | แถวที่ถูกรวมถูกลบไหม | **ไม่ลบ — ตั้งธง `mergedIntoId`/`mergedAt`** (soft-pointer) เหตุผลด้านความปลอดภัย (กัน FK ในอนาคตที่ merge function ไม่รู้จัก, กัน Ops กู้ไม่ได้) อยู่ใน §3.1 |
| DB-5 | audit เก็บอะไร | ตารางใหม่ `CustomerMergeLog` — สแนปช็อต + **รายการ id ที่ถูกย้ายจริง** (ไม่ใช่แค่ id คู่) เพื่อให้ Ops เขียน SQL ย้อนกลับได้จริง (ดู §3.3) |

- **เอกสารต้นทาง:** `docs/20 - Features/00042 - Customer Multi-Phone & Merge/PRD.md` (Open Decisions §4.3, เคาะครบ 2026-08-10) + `BRD.md` (FR-CM-001..008, BR-CM-01..41) — **ยังไม่มี SDS** (จะเขียนหลังเอกสารนี้ โดยอ้าง contract ที่นี่)
- **Store ที่เกี่ยวข้อง:** PostgreSQL 16 (Supabase) ตัวเดียวกับทั้งระบบ ผ่าน Prisma Client — ไม่มี store ใหม่
- **Engine / Charset:** ไม่เปลี่ยนจากที่มีอยู่

🛑 **ข้อบังคับของโปรเจกต์ (ย้ำ):** เอกสารนี้เขียน **แค่ SQL ที่เสนอ** เท่านั้น — ไม่มีการรัน
`prisma migrate dev`/`db push`/`db pull`/shadow DB ใด ๆ และ **ไม่แตะ `prisma/schema.prisma`**
(Hard Rule 14 — คำสั่ง Prisma ที่ชี้ผิดที่เคยล้างฐาน prod ทั้ง 64 ตารางมาแล้ว) migration จริงเป็นงานของ
`safepay-developer` ใน implementation phase โดยใช้ SQL ในเอกสารนี้เป็นต้นแบบ

---

## 2. ERD

```mermaid
erDiagram
    Customer ||--o{ CustomerPhone : "มีเบอร์รอง (secondary phones)"
    Customer ||--o{ Order : "มีออเดอร์ (ทุกร้าน — ไม่เปลี่ยน)"
    Customer ||--o{ ExternalContact : "ผูกกับผู้ติดต่อในแชท (ไม่เปลี่ยน)"
    Customer ||--o| User : "ยืนยันตัวตนแล้ว (nullable, ไม่เปลี่ยน)"
    Customer }o--o| Customer : "mergedIntoId — แถวที่ถูกรวมชี้กลับมาแถวหลัก (NEW, self-relation)"
    Customer ||--o| CustomerMergeLog : "เป็นแถวที่ถูกรวม (merged, 1:1)"
    Customer ||--o{ CustomerMergeLog : "เป็นแถวหลัก (survivor) ของการรวมได้หลายครั้ง"
    CustomerPhone }o--o| User : "ผู้เพิ่ม (nullable)"
    CustomerPhone }o--o| Shop : "ร้านที่เพิ่ม (nullable)"
    CustomerMergeLog }o--o| User : "ผู้กดรวม (nullable)"
    CustomerMergeLog }o--o| Shop : "ร้านที่กดรวม (nullable)"

    Customer {
        string id PK
        string phone UK "เบอร์หลัก — ไม่เปลี่ยน schema เดิม (DB-1)"
        string email "optional, ไม่เปลี่ยน"
        string userId UK FK "nullable — บัญชีที่ยืนยันแล้ว, ไม่เปลี่ยน"
        string mergedIntoId FK "NEW — ชี้แถวหลักถ้าถูกรวมไปแล้ว (null = ยังเป็นตัวตนอิสระ)"
        datetime mergedAt "NEW — เวลาที่ถูกรวม (null = ยังไม่ถูกรวม)"
        datetime createdAt
        datetime updatedAt
    }
    CustomerPhone {
        string id PK
        string customerId FK "เจ้าของเบอร์นี้"
        string phone UK "เบอร์รอง — unique ทั้งระบบ (คู่กับ Customer.phone ผ่าน trigger)"
        string createdByUserId FK "nullable — ผู้ขาย/staff ที่กดเพิ่ม"
        string addedByShopId FK "nullable — ร้านที่กดเพิ่ม (provenance ข้ามร้าน)"
        datetime createdAt
    }
    CustomerMergeLog {
        string id PK
        string survivorCustomerId FK "แถวหลักหลังรวม"
        string mergedCustomerId UK FK "แถวที่ถูกรวม — 1 แถวรวมได้ครั้งเดียวตลอดกาล"
        string performedByUserId FK "nullable — ผู้กดยืนยันรวม"
        string performedByShopId FK "nullable — ร้านที่กดรวม"
        json survivorSnapshot "สแนปช็อตแถวหลักก่อนรวม"
        json mergedSnapshot "สแนปช็อตแถวที่ถูกรวมก่อนรวม"
        string_array movedOrderIds "Order.id ทั้งหมดที่ถูกย้าย"
        string_array movedContactIds "ExternalContact.id ทั้งหมดที่ถูกย้าย"
        string_array movedPhones "เบอร์รอง (CustomerPhone.phone) ทั้งหมดที่ถูกย้าย"
        datetime createdAt
    }
    Order {
        string id PK
        string customerId FK "ไม่เปลี่ยน schema — แค่ค่าที่เก็บย้ายเจ้าของตอนรวม"
    }
    ExternalContact {
        string id PK
        string customerId FK "ไม่เปลี่ยน schema — แค่ค่าที่เก็บย้ายเจ้าของตอนรวม"
    }
```

---

## 3. Tables

### 3.1 `Customer` (มีอยู่แล้ว — `schema.prisma:838-849`) — **เพิ่ม 2 คอลัมน์ nullable เท่านั้น**

ไม่แตะคอลัมน์เดิมแม้แต่ตัวเดียว (`phone`/`email`/`userId`/`createdAt`/`updatedAt` เหมือนเดิมทุกประการ)
— เหตุผลคือ 20+ จุดในโค้ดอ่าน `customer.phone`/`customer.userId` ตรง ๆ (ดู §9 "จุดที่ได้รับผลกระทบ")
การเปลี่ยน schema ของคอลัมน์เดิมจะบังคับให้แก้ทุกจุดพร้อมกัน ซึ่งไม่จำเป็นเมื่อออกแบบส่วนเพิ่มให้ additive ได้

| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| `mergedIntoId` | `TEXT` | `YES` | `NULL` | `FK → Customer.id` (self, nullable) |
| `mergedAt` | `TIMESTAMP(3)` | `YES` | `NULL` | `-` |

**ทำไมเป็น "ตั้งธง" ไม่ใช่ "ลบ" (DB-4 — คำถามที่สำคัญที่สุดของเอกสารนี้):**

FR-CM-006 AC บอกว่า "แถวที่ถูกรวม ไม่สามารถใช้งานต่อในฐานะตัวตนอิสระได้อีก" แต่ **ไม่ได้บอกว่าต้องลบแถวทิ้ง**
— PRD §6.2 (ความเสี่ยงทางเทคนิค) เตือนเองว่า "ย้าย FK ไม่ครบทุกจุด (**จุดใหม่ที่จะเพิ่มในอนาคตด้วย**)" คือความเสี่ยง
ที่ต้องรับมือ ถ้าเลือก **hard DELETE** แถวที่ถูกรวม จะเกิด 2 สถานการณ์ที่แย่พอ ๆ กัน ขึ้นกับว่ามีตารางในอนาคต
ที่อ้าง `customerId` แล้ว merge function (ที่เขียนตอนนี้) ไม่รู้จัก:
1. ตารางนั้นตั้ง `onDelete: Cascade` → ข้อมูลของตารางใหม่ถูกลบหายไปด้วยเงียบ ๆ ตอนรวมลูกค้า (ความเสียหายที่ไม่มีใครคาดคิด)
2. ตารางนั้นตั้ง `onDelete: Restrict` (ค่าเริ่มต้นของ Prisma เมื่อไม่ระบุ) → การรวมทั้งก้อน **ล้มเงียบ ๆ** ด้วย FK violation ที่ผู้ขายอ่านไม่รู้เรื่อง

**Soft-pointer (`mergedIntoId`) ตัดความเสี่ยงทั้งสองข้อทิ้งไปเลย** เพราะแถว `Customer` ที่ถูกรวมยังมีอยู่จริง —
FK ใด ๆ ที่ยังไม่ถูกย้าย (ทั้งที่รู้จักวันนี้และที่จะเพิ่มในอนาคต) ยังชี้ไปหาแถวที่มีอยู่จริงเสมอ ไม่มีทาง orphan
และ **ตอบโจทย์ "กู้มือ" ที่ทั้ง PRD/BRD ใช้เป็นเหตุผลเดียวที่ยอมรับ OD-2 (irreversible)** — ถ้า Ops พบว่ารวมผิดคน
แถวเดิมยังอยู่ครบ (id เดิม, phone เดิม, ทุกอย่างเดิม) สิ่งที่ต้องทำแค่ (1) ย้าย FK ที่ merge เคยย้ายไปกลับคืน โดยอ้าง
`CustomerMergeLog.movedOrderIds`/`movedContactIds`/`movedPhones` ตรง ๆ ไม่ต้องเดา (2) เคลียร์ `mergedIntoId`/`mergedAt`
กลับเป็น `NULL` — เป็นงานที่ทำได้จริงด้วยมือ ต่างจาก hard DELETE ที่ไม่มีทาง "คืนแถวเดิม" กลับมาได้เลยแม้จะมี snapshot
(สร้างแถวใหม่ที่ id ต่างจากเดิม → ทุกจุดที่เคย bookmark/cache id เดิมพังหมด)

**ผลคือ: `Customer.phone` ของแถวที่ถูกรวมยังคง "ถูกครอบครอง" อยู่ตลอดไป (ไม่ถูกปลดปล่อยให้คนอื่นใช้)**
— สอดคล้องกับพฤติกรรมเดิมของระบบอยู่แล้ว (ระบบไม่เคยมีกลไก "ปลดปล่อยเบอร์" แม้ในกรณีปกติที่ไม่เกี่ยวกับ merge
เลย เบอร์ที่เคยผูก `Customer` ไม่เคยว่างให้คนอื่นจองซ้ำได้) การ merge ไม่ได้เปลี่ยนพฤติกรรมนี้ แค่ทำให้เบอร์นั้น
**resolve ไปยัง `customerId` ของแถวหลักแทน** ผ่านการเดินตาม `mergedIntoId` ที่ทุกจุดที่ resolve ลูกค้าด้วยเบอร์ต้อง
implement (ดู §9 แถว `findOrCreateCustomer`)

**Chain flattening (กันรวมซ้อนหลายชั้น):** แถวหลัก (survivor) ของการรวมครั้งหนึ่ง สามารถถูกเลือกเป็น "แถวที่ถูกรวม"
ของการรวมครั้งถัดไปได้ปกติ (เป็นตัวตนอิสระเต็มรูปแบบ ไม่ได้ถูกบล็อกอะไร) — เพื่อไม่ให้ `mergedIntoId` กลายเป็น
chain หลายชั้น (ต้องเดินตามหลาย hop ทุกจุดที่ resolve) **transaction ของการรวมต้อง flatten**: ถ้าแถวที่กำลังจะถูกรวม
(`X`) มีแถวอื่นที่ `mergedIntoId = X.id` อยู่ก่อนแล้ว (คือ `X` เป็น survivor ของการรวมเก่า) ให้ปรับแถวเหล่านั้นทั้งหมด
ให้ชี้ไปที่แถวหลักใหม่ (`Y`) โดยตรงในทรานแซกชันเดียวกัน — รับประกันว่า `mergedIntoId` เดินตามได้ไม่เกิน 1 hop เสมอ
(SDS/dev ต้อง implement เป็นส่วนหนึ่งของ merge function — ไม่ใช่ schema constraint แต่บันทึกไว้ที่นี่เพราะเป็น
invariant ของข้อมูลที่ schema ต้องรองรับได้ [`mergedIntoId` เป็น nullable self-FK ธรรมดา ไม่จำกัดจำนวน hop ที่ DB level
— การจำกัดเป็น business logic])

**onDelete ของ `mergedIntoId` self-FK: `SetNull`** — ในทางปฏิบัติ `Customer` แทบไม่เคยถูก hard-delete เลย
(grep ทั้ง repo ไม่พบ `prisma.customer.delete`/`deleteMany` แม้แต่จุดเดียว รวมถึง `account-deletion.service.ts`
ที่จัดการลบบัญชีผู้ใช้ก็ไม่แตะตาราง `Customer` — `Customer.userId` เป็น `onDelete: SetNull` อยู่แล้วตั้งแต่ feature
00014 ทำให้แถว `Customer` อยู่รอดแม้ `User` ที่ผูกไว้ถูกลบ) แต่ยังตั้ง `SetNull` ไว้เป็น safety net ไม่ใช่ `Restrict`
เพราะการบล็อกไม่ให้ hard-delete เป็นเรื่องที่ไม่มี use case รองรับในระบบนี้เลย

### 3.2 `CustomerPhone` (ใหม่) — เบอร์รองของลูกค้า (FR-CM-001/002/003)

เก็บ **เฉพาะเบอร์รอง** — เบอร์หลักยังอยู่ที่ `Customer.phone` เหมือนเดิม (DB-1/DB-2) ตารางนี้ไม่มี flag
`isPrimary` เพราะไม่มีสถานการณ์ที่ต้องแยก (เบอร์หลักไม่เคยอยู่ในตารางนี้) — สอดคล้องกับ BR-CM-04
("เบอร์แรกที่ `Customer` ถูกสร้างด้วยเป็นเบอร์หลักเสมอ ไม่มี UI สลับเบอร์หลักในเฟสนี้") 1:1 ตรงตัว: ไม่มีข้อมูล
ในตารางนี้ที่ "เป็นเบอร์หลัก" ได้เลยแม้แต่แถวเดียว จึงไม่ต้องมีฟิลด์เพื่อแยกกรณีนั้น

| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| `id` | `TEXT` | `NO` | `uuid()` | `PK` |
| `customerId` | `TEXT` | `NO` | `-` | `FK → Customer.id (Cascade)` |
| `phone` | `TEXT` | `NO` | `-` | `UNIQUE` (ทั้งระบบ — คู่กับ trigger ตรวจข้าม `Customer.phone`, ดู §5.1 ข้อ 4) |
| `createdByUserId` | `TEXT` | `YES` | `NULL` | `FK → User.id (SetNull)` |
| `addedByShopId` | `TEXT` | `YES` | `NULL` | `FK → Shop.id (SetNull)` |
| `createdAt` | `TIMESTAMP(3)` | `NO` | `CURRENT_TIMESTAMP` | `-` |

**ทำไม `phone` เป็น `NOT NULL UNIQUE` แบบธรรมดา ไม่ต้องมี partial/composite:** เบอร์รองไม่มีทางซ้ำกับเบอร์รอง
ของลูกค้าคนอื่นได้เลย (BR-CM-02) — unique เดี่ยวพอ ไม่ต้องผูกกับ `customerId` (การผูกกับ `customerId` จะกลาย
เป็น "เบอร์เดียวกันเป็นเบอร์รองของลูกค้าคนเดียวกันซ้ำได้" ซึ่งไม่มีประโยชน์และขัดเจตนา — unique เดี่ยวถูกกว่า
และครอบคลุมกฎธุรกิจได้ตรงกว่า)

**ทำไมมี `createdByUserId`/`addedByShopId` ทั้งที่ BRD ไม่ได้ขอ audit สำหรับ FR-CM-001 โดยตรง:** ต้นทุนต่ำมาก
(2 คอลัมน์ nullable, FK `SetNull` ที่มีอยู่ทุกตารางในโปรเจกต์นี้อยู่แล้ว เช่น `Order.createdByUserId`) และ
`CustomerPhone` เป็นข้อมูล **ข้ามร้าน** ที่ร้านหนึ่งเขียนแล้วร้านอื่นเห็นผลด้วย (เหมือน merge) — การรู้ว่า
"ร้านไหน/ใครเป็นคนเพิ่มเบอร์นี้" มีประโยชน์เวลาต้องสืบสวนกรณีเพิ่มเบอร์ผิด (แม้ FR-CM-001 จะไม่ irreversible
เท่า merge — ผู้ขายเพิ่มเบอร์ผิดได้ ถอนได้ยากเพราะ PRD §5 บอกว่า "แก้ไข/ลบเบอร์ที่ผูกอยู่แล้วไม่อยู่ใน scope"
ของ MVP นี้ — มีแต่ path เดิม `customer-phone-edit.ts` สำหรับกรณี "คีย์เบอร์ผิด" ซึ่งใช้ `Customer.phone` ไม่ใช่
`CustomerPhone` — ดู §9 แถวที่เกี่ยวข้อง) สอดคล้องกับ convention ของโปรเจกต์นี้ (attribution ทุกจุดที่แก้ไข
ข้อมูลข้ามขอบเขต ownership ปกติ)

**onDelete ของ `customerId`: `Cascade`** — `CustomerPhone` ไม่มีความหมายอิสระจาก `Customer` เจ้าของ (ต่างจาก
`Order`/`ExternalContact` ที่เป็นข้อมูลธุรกิจของตัวเอง) ถ้า `Customer` แม่ถูกลบ (ในทางปฏิบัติแทบไม่เกิดขึ้นเลย —
ดู §3.1) เบอร์รองที่ผูกกับมันก็ไม่มีเหตุผลให้อยู่ต่อ

### 3.3 `CustomerMergeLog` (ใหม่) — audit ของการรวมลูกค้า (FR-CM-007, BR-CM-15)

| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| `id` | `TEXT` | `NO` | `uuid()` | `PK` |
| `survivorCustomerId` | `TEXT` | `NO` | `-` | `FK → Customer.id (Restrict)` |
| `mergedCustomerId` | `TEXT` | `NO` | `-` | `FK → Customer.id (Restrict)`, `UNIQUE` |
| `performedByUserId` | `TEXT` | `YES` | `NULL` | `FK → User.id (SetNull)` |
| `performedByShopId` | `TEXT` | `YES` | `NULL` | `FK → Shop.id (SetNull)` |
| `survivorSnapshot` | `JSONB` | `NO` | `-` | `-` |
| `mergedSnapshot` | `JSONB` | `NO` | `-` | `-` |
| `movedOrderIds` | `TEXT[]` | `NO` | `'{}'` | `-` |
| `movedContactIds` | `TEXT[]` | `NO` | `'{}'` | `-` |
| `movedPhones` | `TEXT[]` | `NO` | `'{}'` | `-` |
| `createdAt` | `TIMESTAMP(3)` | `NO` | `CURRENT_TIMESTAMP` | `-` |

**ทำไม "รายการ id ที่ถูกย้ายจริง" ไม่ใช่แค่ id คู่ (DB-5 — คำถามที่ 2 ของเอกสารนี้ที่กระทบว่า OD-2 ปลอดภัยจริงไหม):**

ถ้าเก็บแค่ `survivorCustomerId`/`mergedCustomerId` (id คู่) — **หลังรวมสำเร็จแล้ว ไม่มีทางแยกได้อีกเลยว่า
`Order`/`ExternalContact` แถวไหน "เดิมเป็นของแถวที่ถูกรวม" กับแถวไหน "เดิมเป็นของแถวหลักอยู่แล้ว"** เพราะทุกแถว
ชี้ `customerId` เดียวกันหมดหลัง merge (ไม่มี marker เหลือทิ้งไว้) การกู้คืนด้วยมือจะกลายเป็น "เดา" จากข้อมูลอื่น
(เช่น เทียบ `createdAt`/`shopId` ว่าฝั่งไหนน่าจะเป็นของแถวไหน) ซึ่งเป็นสิ่งที่ project convention (`docs/conventions/
external-payload-schema.md` §"ห้ามอ้าง 'ให้ผู้ใช้ตรวจด้วยตา' เป็นด่านกันข้อมูลเพี้ยน") เตือนไว้ชัดเจนว่าอันตราย
— **ถ้า audit log กู้ไม่ได้จริง มติ OD-2 (irreversible) จะกลายเป็นการรับความเสี่ยงเปล่า ๆ โดยไม่มีอะไรแลกกลับมา**
ตามที่ prompt ของงานนี้เตือนไว้ตรง ๆ

การเก็บ `movedOrderIds`/`movedContactIds`/`movedPhones` (รายการ id/ค่าจริงที่ถูกย้ายในทรานแซกชันนั้น — เขียน
พร้อมกับ `UPDATE` จริงในทรานแซกชันเดียวกัน ไม่ใช่คำนวณย้อนหลัง) ทำให้ Ops เขียน SQL ย้อนกลับได้ตรง ๆ โดยไม่ต้องเดา:

```sql
-- ตัวอย่าง SQL กู้คืนด้วยมือ (Ops เท่านั้น — อ้าง CustomerMergeLog.id ที่ต้องการย้อน)
UPDATE "Order" SET "customerId" = <mergedCustomerId>
  WHERE "id" = ANY(<movedOrderIds จาก log>);
UPDATE "ExternalContact" SET "customerId" = <mergedCustomerId>
  WHERE "id" = ANY(<movedContactIds จาก log>);
UPDATE "CustomerPhone" SET "customerId" = <mergedCustomerId>
  WHERE "phone" = ANY(<movedPhones จาก log>);
UPDATE "Customer" SET "mergedIntoId" = NULL, "mergedAt" = NULL
  WHERE "id" = <mergedCustomerId>;
```

(หมายเหตุ: SQL ตัวอย่างนี้เพื่ออธิบายว่าทำไม schema ต้องเก็บฟิลด์เหล่านี้ — **ไม่ใช่ migration** และไม่ครอบคลุม
เคส chain-flatten ที่อาจต้องย้อนหลายชั้น ทีม Ops ต้องอ่าน `CustomerMergeLog` ที่เกี่ยวข้องทั้งหมดก่อนย้อนจริง)

**เนื้อหาสแนปช็อต (`survivorSnapshot`/`mergedSnapshot`)** — โครงสร้างเดียวกันทั้งสองฝั่ง:
```json
{
  "id": "uuid",
  "phone": "0812345678",
  "secondaryPhones": ["0898765432"],
  "userId": "uuid หรือ null",
  "email": "หรือ null",
  "createdAt": "ISO string"
}
```
เก็บ "หน้าตาก่อนรวม" ไว้เผื่อ movedXxxIds ไม่พอ (เช่น อยากรู้ว่าตอนรวม แถวที่ถูกรวมมี `userId` หรือไม่ —
สำคัญเวลาสืบสวนว่า merge นั้นผ่านเงื่อนไข BR-CM-11/12 ถูกต้องหรือเปล่า)

**ทำไม `mergedCustomerId` เป็น `UNIQUE`:** 1 แถวรวมได้ครั้งเดียวตลอดกาล (สอดคล้องกับ FR-CM-006 AC "แถวที่ถูกรวม
ไม่สามารถใช้งานต่อในฐานะตัวตนอิสระได้อีก" — ตีความรวมถึง "ถูกเลือกเป็นแถวที่ถูกรวมซ้ำ" ด้วย) เป็น DB-level
backstop กันบั๊กที่ app logic เผลอเรียก merge function ซ้ำกับแถวเดิม — ถ้าเกิดขึ้นจริง DB จะปฏิเสธด้วย unique
violation แทนที่จะสร้าง log ซ้อนที่ทำให้ประวัติสับสน

**ทำไม `performedByShopId` เป็น `SetNull` ไม่ใช่ `Restrict`:** `Shop` ในระบบนี้ใช้ soft-delete
(`deletedAt`/`purgedAt`) เป็นหลัก — ถ้าร้านถูก purge จริง (data lifecycle/PDPA request) ไม่ควรมีตารางไหนบล็อก
การ purge นั้นไว้เพื่อรักษา audit log ที่ "ไม่จำเป็นต้องรู้ต้นทางร้านแล้วก็ยังมีค่า" (สแนปช็อต + id คู่ + ผู้กระทำ
ยังอยู่ครบ แค่ไม่รู้ว่าเป็นร้านไหน) — เทียบกับ `Order.shopChannelId`/`createdByUserId` ที่ใช้ `SetNull` ด้วยเหตุผล
เดียวกัน (ห้าม `Restrict`/`Cascade` เด็ดขาดสำหรับความสัมพันธ์ที่ไม่ควรบล็อกหรือทำลายข้อมูลอื่น)

---

## 4. Indexes

| Table | Columns | Type | Rationale (query pattern ที่รองรับ) |
|-------|---------|------|--------------------------------------|
| `Customer` | `(mergedIntoId)` | BTREE | รองรับ chain-flatten ตอน merge (`UPDATE Customer SET mergedIntoId = Y WHERE mergedIntoId = X`) + query เชิงบริหาร "แถวไหนถูกรวมเข้า X บ้าง" — ความถี่ต่ำ (merge ไม่ใช่ hot path ตาม BRD §6.2) แต่ต้นทุนของ index ต่ำมากเช่นกัน (คอลัมน์ nullable, ส่วนใหญ่เป็น NULL) |
| `CustomerPhone` | `(phone)` | `UNIQUE` (BTREE) | บังคับ BR-CM-02 ฝั่งเบอร์รอง + **เป็น query path หลักของ `findOrCreateCustomer` เวอร์ชันใหม่** (`WHERE phone = ?` ทุกครั้งที่สร้างออเดอร์ด้วยเบอร์ที่อาจเป็นเบอร์รอง — hot-ish path เพราะ order creation เกิดบ่อย) index นี้จำเป็นทั้งเพื่อ correctness และ performance |
| `CustomerPhone` | `(customerId)` | BTREE | รองรับ FR-CM-002 ("แสดงรายการเบอร์ทั้งหมดที่ผูกกับลูกค้าคนนั้น") + เป็นเป้าหมายของ `UPDATE CustomerPhone SET customerId = ? WHERE customerId = ?` ตอน merge |
| `CustomerMergeLog` | `(mergedCustomerId)` | `UNIQUE` (BTREE) | บังคับ "1 แถวรวมได้ครั้งเดียว" (ดู §3.3) + เป็น query path หลักตอนต้องดูว่าแถวนี้เคยถูกรวมหรือยัง/รวมไปไหน (ทางเลือกที่เร็วกว่าอ่านผ่าน `Customer.mergedIntoId` เมื่อต้องการรายละเอียด audit เต็ม) |
| `CustomerMergeLog` | `(survivorCustomerId)` | BTREE | รองรับ Ops query "ร้านนี้/ลูกค้าคนนี้เคยถูกรวมเข้ามากี่ครั้ง" — ใช้เมื่อสืบสวนกรณี "รวมผิดคน" |
| `CustomerMergeLog` | `(performedByShopId)` | BTREE | รองรับ Ops query "ร้านนี้เคยกดรวมกี่ครั้ง" (เชิงบริหาร/ตรวจสอบการใช้งานผิดปกติ) — ต้นทุนต่ำ ความถี่ query ต่ำ แต่ตารางนี้ไม่มี index อื่นให้ scope ตามร้านเลยถ้าไม่มีตัวนี้ |

**ไม่เพิ่ม index บน `Order`/`ExternalContact`** — `@@index([customerId])` บน `Order` มีอยู่แล้ว (feat 00014,
`schema.prisma:817`) และ `ExternalContact` lookup ด้วย `customerId` เป็น point query ผ่าน relation ที่มีอยู่
(ไม่ใช่ query pattern ใหม่) — การ merge แค่เปลี่ยน**ค่า**ในคอลัมน์ที่มี index อยู่แล้ว ไม่ใช่เพิ่ม query pattern ใหม่
(เหมือน precedent ของ feature 00033 §4 ที่ไม่ต้องแก้ index เมื่อความหมายของคอลัมน์เปลี่ยนแต่ query เดิม)

---

## 5. Migration Plan

### 5.1 ลำดับการ Migrate

มี **migration เดียว** — additive ล้วน (ตารางใหม่ 2 ตัว + คอลัมน์ nullable ใหม่ 2 ตัวบน `Customer` +
trigger ใหม่ 3 ตัว) ไม่แตะ/ลบ/เปลี่ยนชนิดคอลัมน์เดิมแม้แต่จุดเดียว

| ลำดับ | การเปลี่ยนแปลง | Store | หมายเหตุ (dependency) |
|-------|----------------|-------|------------------------|
| 1 | เพิ่มคอลัมน์ `Customer.mergedIntoId` (nullable) + `Customer.mergedAt` (nullable) + FK self-reference + index | PostgreSQL 16 | metadata-only (คอลัมน์ nullable ไม่มี default ที่ต้อง backfill) — ล็อกสั้น แม้ `Customer` จะมีแถวจริงบน prod แล้ว |
| 2 | สร้างตาราง `CustomerPhone` + FK 3 ตัว (`customerId`/`createdByUserId`/`addedByShopId`) + index | PostgreSQL 16 | ต้องมี `Customer`/`User`/`Shop` อยู่ก่อนแล้ว (มีอยู่แล้วทั้งหมด) |
| 3 | สร้างตาราง `CustomerMergeLog` + FK 4 ตัว + index | PostgreSQL 16 | ต้องมีลำดับ 1-2 ก่อน (`survivorCustomerId`/`mergedCustomerId` อ้าง `Customer`, ไม่อ้าง `CustomerPhone` โดยตรง แต่แนวคิดเดียวกัน) |
| 4 | สร้าง trigger คู่ `customer_phone_cross_table_unique` บน `Customer`/`CustomerPhone` (บังคับ BR-CM-02 ข้ามตาราง — **REQUIRED**) | PostgreSQL 16 | ต้องมีลำดับ 2 ก่อน (ตาราง `CustomerPhone` ต้องมีอยู่แล้วให้ trigger function query ได้) |
| 5 | สร้าง trigger `customer_merge_userid_guard` บน `Customer` (บังคับ BR-CM-11 ที่ระดับ DB — **MANDATORY** ตามมติ 2026-08-10) | PostgreSQL 16 | ต้องมีลำดับ 1 ก่อน (ต้องมีคอลัมน์ `mergedIntoId`) |

**ไม่มี backfill/data migration ใด ๆ ในไฟล์นี้** — ทั้งสองตารางใหม่เริ่มต้นว่างเปล่า (0 แถว) และคอลัมน์ใหม่บน
`Customer` เป็น `NULL` สำหรับทุกแถวเดิมโดยอัตโนมัติ (nullable ไม่มี default ที่ไม่ใช่ NULL) — สถานะข้อมูลเดิม
หลัง migration คือ **"ทุก `Customer` ที่มีอยู่แล้วยังเป็นตัวตนอิสระเหมือนเดิมทุกแถว ไม่มีแถวไหนถูกรวมไปเอง"**
ซึ่งถูกต้องตาม PRD OD-6 ("ไม่ทำ backfill/auto-detect ลูกค้าซ้ำ — ผู้ขายต้องสังเกตเห็นเองแล้วกดรวมเอง") 🛑
**ข้อควรระวัง:** backfill ที่ OD-6 ปฏิเสธคือ **"auto-merge ลูกค้าซ้ำที่มีอยู่แล้ว"** (business-level dedup ที่เสี่ยง
false positive สูงจากชื่อไทยซ้ำกันได้บ่อย) **ไม่ใช่เรื่องเดียวกับ** การที่ migration นี้ไม่ต้องมี data migration ใด ๆ
เลย (เพราะตารางใหม่ว่างเปล่าโดยธรรมชาติ ไม่มีอะไรต้อง populate ย้อนหลัง) — สองเรื่องนี้เป็นคนละคำถามที่บังเอิญ
ตอบเหมือนกันว่า "ไม่ทำ"

**ไฟล์ migration (ชื่อที่แนะนำ):** `prisma/migrations/20260810120000_customer_multiphone_merge/migration.sql`

```sql
-- prisma/migrations/20260810120000_customer_multiphone_merge/migration.sql
-- feature 00042 — ลูกค้าหลายเบอร์และการรวมลูกค้า
--
-- SAFETY: additive only — ตารางใหม่ 2 ตัว (CustomerPhone, CustomerMergeLog) + คอลัมน์ nullable ใหม่ 2 ตัว
-- บน Customer (mergedIntoId, mergedAt) + trigger ใหม่ 3 ตัว — ไม่แตะ/ลบ/เปลี่ยนชนิดคอลัมน์เดิมแม้แต่จุดเดียว
-- ไม่มี backfill/data migration (ตารางใหม่เริ่มว่างเปล่า, คอลัมน์ใหม่เป็น NULL ทุกแถวเดิมโดยอัตโนมัติ)
--
-- 🛑 ห้าม `prisma db pull` เด็ดขาด — trigger เป็น unmanaged SQL, introspection มองไม่เห็นแล้วจะไม่สร้าง
-- migration ที่ DROP ทิ้ง (precedent เดียวกับ Shop_vertical_check/OrderEvent_type_check/EXCLUDE constraints)

-- ============================================================
-- 1) Customer.mergedIntoId / mergedAt (nullable, metadata-only)
-- ============================================================
ALTER TABLE "Customer" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "mergedAt" TIMESTAMP(3);

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedIntoId_fkey"
    FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Customer_mergedIntoId_idx" ON "Customer"("mergedIntoId");

-- ============================================================
-- 2) CustomerPhone (เบอร์รอง — DB-2)
-- ============================================================
CREATE TABLE "CustomerPhone" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "addedByShopId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPhone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerPhone_phone_key" ON "CustomerPhone"("phone");
CREATE INDEX "CustomerPhone_customerId_idx" ON "CustomerPhone"("customerId");

ALTER TABLE "CustomerPhone" ADD CONSTRAINT "CustomerPhone_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPhone" ADD CONSTRAINT "CustomerPhone_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerPhone" ADD CONSTRAINT "CustomerPhone_addedByShopId_fkey"
    FOREIGN KEY ("addedByShopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 3) CustomerMergeLog (audit ของการรวม — DB-5)
-- ============================================================
CREATE TABLE "CustomerMergeLog" (
    "id" TEXT NOT NULL,
    "survivorCustomerId" TEXT NOT NULL,
    "mergedCustomerId" TEXT NOT NULL,
    "performedByUserId" TEXT,
    "performedByShopId" TEXT,
    "survivorSnapshot" JSONB NOT NULL,
    "mergedSnapshot" JSONB NOT NULL,
    "movedOrderIds" TEXT[] NOT NULL DEFAULT '{}',
    "movedContactIds" TEXT[] NOT NULL DEFAULT '{}',
    "movedPhones" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerMergeLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerMergeLog_mergedCustomerId_key" ON "CustomerMergeLog"("mergedCustomerId");
CREATE INDEX "CustomerMergeLog_survivorCustomerId_idx" ON "CustomerMergeLog"("survivorCustomerId");
CREATE INDEX "CustomerMergeLog_performedByShopId_idx" ON "CustomerMergeLog"("performedByShopId");

ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_survivorCustomerId_fkey"
    FOREIGN KEY ("survivorCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_mergedCustomerId_fkey"
    FOREIGN KEY ("mergedCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_performedByUserId_fkey"
    FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerMergeLog" ADD CONSTRAINT "CustomerMergeLog_performedByShopId_fkey"
    FOREIGN KEY ("performedByShopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 4) Trigger: "1 เบอร์ = 1 ลูกค้าเสมอ" ข้ามตาราง Customer.phone <-> CustomerPhone.phone (BR-CM-02)
--    REQUIRED — Postgres ไม่มี UNIQUE constraint ข้ามตารางตรง ๆ, ตัวนี้คือด่านสุดท้าย (app-level
--    check-then-insert เป็นด่านแรกสำหรับ UX 400 ที่อ่านง่าย — มีช่องว่างระหว่างตรวจกับเขียนเสมอ
--    เหมือน EXCLUDE constraint ของ feature 00017/00024, pattern เดียวกัน)
-- ============================================================
CREATE OR REPLACE FUNCTION customer_phone_cross_table_unique() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'Customer' THEN
    IF EXISTS (SELECT 1 FROM "CustomerPhone" WHERE "phone" = NEW."phone") THEN
      RAISE EXCEPTION 'CUSTOMER_PHONE_ALREADY_SECONDARY: % is already linked as a secondary phone', NEW."phone"
        USING ERRCODE = '23505';
    END IF;
  ELSIF TG_TABLE_NAME = 'CustomerPhone' THEN
    IF EXISTS (SELECT 1 FROM "Customer" WHERE "phone" = NEW."phone") THEN
      RAISE EXCEPTION 'CUSTOMER_PHONE_ALREADY_PRIMARY: % is already another customer''s primary phone', NEW."phone"
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_customer_phone_unique"
    BEFORE INSERT OR UPDATE OF "phone" ON "Customer"
    FOR EACH ROW EXECUTE FUNCTION customer_phone_cross_table_unique();

CREATE TRIGGER "trg_customer_phone_secondary_unique"
    BEFORE INSERT OR UPDATE OF "phone" ON "CustomerPhone"
    FOR EACH ROW EXECUTE FUNCTION customer_phone_cross_table_unique();

-- ============================================================
-- 5) Trigger (RECOMMENDED — defense-in-depth): ห้าม merge ที่ทั้งสองแถวมี userId ต่างกัน (BR-CM-11)
--    เงื่อนไขนี้ควรถูก enforce ที่ app layer เป็นหลัก (ให้ error message ที่อ่านง่าย) — ตัวนี้เป็นด่านสำรอง
--    เผื่อ app logic มีบั๊ก เพราะ BR-CM-11 คือความเสี่ยงระดับ "สูง" ตาม PRD §6.1 (รวมผิดคน)
-- ============================================================
CREATE OR REPLACE FUNCTION customer_merge_userid_guard() RETURNS TRIGGER AS $$
DECLARE
  survivor_user_id TEXT;
BEGIN
  IF NEW."mergedIntoId" IS NOT NULL AND NEW."userId" IS NOT NULL THEN
    SELECT "userId" INTO survivor_user_id FROM "Customer" WHERE "id" = NEW."mergedIntoId";
    IF survivor_user_id IS NOT NULL AND survivor_user_id <> NEW."userId" THEN
      RAISE EXCEPTION 'CUSTOMER_MERGE_USERID_CONFLICT: cannot merge two customers with different linked userId'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_customer_merge_userid_guard"
    BEFORE UPDATE OF "mergedIntoId" ON "Customer"
    FOR EACH ROW EXECUTE FUNCTION customer_merge_userid_guard();
```

**ทำไม `phone`/`mergedIntoId` ไม่ต้อง `NOT VALID` + `VALIDATE CONSTRAINT`:** pattern นั้น (ดู feature 00016/00028/00033)
ใช้เมื่อเพิ่ม CHECK/FK บนคอลัมน์ที่ **มีข้อมูลอยู่แล้ว** และต้องสแกนแถวเดิมทั้งหมดว่าผ่านเงื่อนไขไหม — ที่นี่
`mergedIntoId` เป็นคอลัมน์**ใหม่**ที่ทุกแถวเดิมได้ค่า `NULL` โดยอัตโนมัติ (ผ่าน FK constraint เสมอ เพราะ `NULL`
ไม่ต้องอ้างถึงแถวไหนเลย) ไม่มีอะไรให้ตรวจสอบย้อนหลัง — `ADD CONSTRAINT ... FOREIGN KEY` บนคอลัมน์ nullable ที่
เพิ่งสร้างเป็น metadata-only ทันที ไม่ต้องแยกขั้นตอน

**ทำไม trigger ไม่ต้องกังวลเรื่อง "ข้อมูลเดิมที่มีอยู่แล้วขัดกฎ":** trigger ทำงานเฉพาะตอน `INSERT`/`UPDATE OF phone`
(ข้อ 4) และ `UPDATE OF mergedIntoId` (ข้อ 5) เท่านั้น — ไม่ใช่ constraint ที่ต้อง validate แถวเดิมทั้งหมดแบบ CHECK
แถวที่มีอยู่แล้วบน prod ไม่ถูกแตะเลยจนกว่าจะมีการ `INSERT`/`UPDATE` ครั้งใหม่บนคอลัมน์นั้น ๆ (ซึ่ง ณ วันที่ apply
migration นี้ ยังไม่มีทางเกิดขึ้นเพราะ feature layer ที่เรียกยังไม่ถูก deploy)

**การ apply กับฐาน local (Hard Rule 14 — ปักหมุด URL localhost ตรง ๆ ห้าม `$(...)`/`.env.local`):**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
DIRECT_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
npx prisma migrate deploy
```

🛑 **Hard Rule 15 — push `main` = migrate ขึ้น prod อัตโนมัติ:** `vercel.json` รัน `prisma migrate deploy`
ตอน build ทุกครั้ง **ต้องแจ้ง user ก่อน push ทุกครั้ง** ครบ 3 ข้อ: (1) prod ไม่ต้องสั่งเอง (2) ฐาน local ต้อง
apply เอง — คำสั่งด้านบน (3) migrate ล้ม = build ล้ม = deploy ไม่ขึ้น (ของเก่ายังเสิร์ฟอยู่ ไม่มีสถานะครึ่ง ๆ กลาง ๆ)

### 5.2 Rollback

**Rollback SQL** (ย้อนกลับทั้งหมด — ปลอดภัยตราบใดที่ยังไม่มีแถวใช้งานฟีเจอร์นี้จริง):

```sql
-- Rollback ของ 20260810120000_customer_multiphone_merge
-- 🛑 ก่อนรัน: ต้องยืนยันว่ายังไม่มีข้อมูลจริงที่พึ่งพาฟีเจอร์นี้ — ดูเงื่อนไขแยกตามตารางด้านล่าง

-- ตรวจก่อน (ต้องได้ 0 ทั้งคู่ ถ้าจะ rollback แบบเต็ม):
-- SELECT COUNT(*) FROM "Customer" WHERE "mergedIntoId" IS NOT NULL;
-- SELECT COUNT(*) FROM "CustomerPhone";

DROP TRIGGER IF EXISTS "trg_customer_merge_userid_guard" ON "Customer";
DROP FUNCTION IF EXISTS customer_merge_userid_guard();

DROP TRIGGER IF EXISTS "trg_customer_phone_secondary_unique" ON "CustomerPhone";
DROP TRIGGER IF EXISTS "trg_customer_phone_unique" ON "Customer";
DROP FUNCTION IF EXISTS customer_phone_cross_table_unique();

DROP TABLE IF EXISTS "CustomerMergeLog";
DROP TABLE IF EXISTS "CustomerPhone";

ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_mergedIntoId_fkey";
DROP INDEX IF EXISTS "Customer_mergedIntoId_idx";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "mergedIntoId";
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "mergedAt";
```

🛑 **ข้อจำกัดของ rollback นี้ — ต้องอ่านก่อนรัน:**

- **`DROP TABLE "CustomerMergeLog"` คือ data loss ถาวรของ audit log** — ตาม BR-CM-15 ("ร่องรอยนี้อยู่ถาวร
  ไม่ถูกลบ") การ rollback แบบเต็มนี้ **ใช้ได้เฉพาะตอนยังไม่มี merge เกิดขึ้นจริงสักครั้ง** (เช่น พบบั๊กระหว่าง
  staging/ก่อน user คนแรกใช้งานจริง — เหมือน precedent ของ feature 00033 §5.2) ต้องเช็ค
  `SELECT COUNT(*) FROM "CustomerMergeLog"` ต้องได้ 0 ก่อนเสมอ ถ้าไม่ใช่ 0 ห้ามรัน DROP TABLE นี้เด็ดขาด
- **ถ้ามี `Customer.mergedIntoId IS NOT NULL` อยู่แล้วจริง** (มีคน merge ไปแล้วหลัง deploy) การ `DROP COLUMN`
  จะทำให้ **แถวที่ถูกรวมกลับมาดูเหมือน "ตัวตนอิสระ" อีกครั้งทันที** ทั้งที่ `Order`/`ExternalContact`/`CustomerPhone`
  ของมันถูกย้ายไปแถวหลักไปแล้ว (ไม่ rollback ตาม) — ผลคือมีลูกค้า "ตัวเปล่า" (ไม่มีออเดอร์/เธรดผูกเลย) โผล่ขึ้นมา
  ในระบบ ซึ่งสับสนกว่าเดิมแต่ **ไม่ทำลายข้อมูลธุรกิจ** (Order/ExternalContact ทุกแถวยังชี้ไปหา `customerId`
  ที่ถูกต้องตามที่ merge ทำไว้ล่าสุด — ไม่มี FK ตกหล่น เพราะ soft-pointer ออกแบบมาเพื่อสถานการณ์นี้พอดี)
- **แผนจริงถ้าต้องถอย feature นี้หลัง deploy (มี merge เกิดขึ้นแล้ว):** revert เฉพาะโค้ดชั้นแอปพลิเคชัน
  (API/UI ที่เปิดให้กด "เพิ่มเบอร์"/"รวมลูกค้า") ให้เลิกสร้างข้อมูลใหม่ **ต่อไป** แต่ **คงตาราง/trigger ทั้งหมดไว้ถาวร**
  เพื่อไม่ให้ข้อมูลเดิมที่มีอยู่แล้วกลายเป็นสถานะที่ไม่มี schema รองรับ (มิเรอร์แนวทางเดียวกับ feature 00033 §5.2)
- **`CustomerPhone`** ปลอดภัยกว่า — ถ้ามีแถวอยู่จริงแต่ยังไม่เกิด merge ใด ๆ การ `DROP TABLE` แค่ทำให้เบอร์รอง
  หายไป (เบอร์หลักยังอยู่ครบ ไม่กระทบ `Order.customerId` เพราะ `CustomerPhone` ไม่เคยเป็น FK เป้าหมายของตารางอื่น)
  — ยัง**ควร**เช็คว่ามีแถวจริงก่อนเสมอเพื่อแจ้งผู้ขายที่เคยเพิ่มเบอร์ไว้ ไม่ใช่เพราะ data-integrity risk

### 5.3 ผลกระทบ (Impact)

- **Downtime:** ไม่มี — ทุกคำสั่งเป็น metadata-only (คอลัมน์ nullable ใหม่, ตารางใหม่ว่างเปล่า, trigger ผูกกับ
  event ในอนาคตเท่านั้น) ไม่มีคำสั่งไหนสแกนตารางที่มีข้อมูลอยู่แล้ว
- **Lock ตารางใหญ่:** `Customer` มีแถวจริงบน prod (ตัวเลขระดับ "หลักสิบต่อร้าน" ตาม comment ใน
  `customer.service.ts` — ไม่ใช่ตารางใหญ่มาก) การเพิ่มคอลัมน์ nullable + FK self-reference ใช้ `ACCESS EXCLUSIVE
  LOCK` สั้นมาก (ไม่ต้อง rewrite ตาราง เพราะไม่มี default ที่ไม่ใช่ NULL — Postgres 11+ เพิ่มคอลัมน์ nullable โดย
  ไม่ rewrite) การสร้าง trigger ก็เป็น metadata-only เช่นกัน
- **ข้อมูลเดิม:** ไม่มีแถวใดถูกแก้ไข/ลบ — เป็น DDL-only ไม่มี DML ในไฟล์ migration นี้
- **Backward compatibility:** สมบูรณ์ 100% — 20+ จุดที่อ่าน `customer.phone`/`customer.userId` ตรง ๆ (ดู §9)
  ทำงานเหมือนเดิมทุกประการ **จนกว่าจะมีการแก้โค้ด service layer ตามที่ระบุใน §9** (การแก้โค้ดนั้นเป็นงานของ
  SDS/dev — schema เพียงอย่างเดียวไม่เปลี่ยนพฤติกรรมของระบบเลยแม้แต่จุดเดียว)
- **ผลต่อ service layer ที่ต้องแก้ก่อนฟีเจอร์นี้ "ใช้งานได้จริง":** ดู §9 ตาราง "จุดที่ได้รับผลกระทบ" — สำคัญที่สุดคือ
  `findOrCreateCustomer` (ต้องเช็ค `CustomerPhone` + เดินตาม `mergedIntoId`) และ `resolveCustomerForEditedOrder`
  (feature ที่เพิ่ง ship วันเดียวกัน 2026-08-10 — ต้องเช็ค `CustomerPhone` ด้วยไม่งั้นปล่อยให้ rename ไปชนเบอร์รองได้)
- **Consistency ข้าม store:** ไม่เกี่ยวข้อง — ใช้ store เดียว (PostgreSQL) ไม่มีการ sync ข้าม store

---

## 6. Retention / ข้อควรระวัง

| หัวข้อ | รายละเอียด |
|--------|-----------|
| **ห้าม `prisma db pull`** | ตารางนี้เพิ่ม unmanaged SQL ใหม่ 2 กลุ่ม (trigger คู่บังคับ BR-CM-02 ข้ามตาราง + trigger บังคับ BR-CM-11) นอกเหนือจาก unmanaged SQL เดิมที่มีอยู่แล้ว (`Shop_vertical_check`, `OrderEvent_type_check`, EXCLUDE constraints ของ 00017/00024) — introspection มองไม่เห็น trigger เหล่านี้แล้วจะไม่สร้างใน schema.prisma (Prisma ไม่ generate trigger จาก `db pull` เป็นปกติอยู่แล้ว) แต่ที่อันตรายกว่าคือ **ไม่มีใครรู้ว่ามี trigger นี้อยู่ถ้าไม่เปิดเอกสารนี้หรือ query `pg_trigger` เอง** — เขียนกำกับไว้ในคอมเมนต์ท้าย migration SQL ด้วย |
| **ห้าม `prisma migrate dev`** | Hard Rule 14 — เขียน migration SQL ด้วยมือแล้ว apply ด้วย `prisma migrate deploy` ปักหมุด URL localhost ตรง ๆ เท่านั้น (§5.1) |
| **PII — `Customer.phone`/`CustomerPhone.phone`** | เบอร์โทรเป็น PII เหมือนเดิม (ไม่ใช่ข้อมูลใหม่ที่เปิดเผยเพิ่ม) — การแสดงผลต้อง mask ตามกฎเดิมของระบบ (`maskContact`/`maskPhone`) ทุกจุดที่แสดงเบอร์รอง เหมือนที่ใช้กับเบอร์หลักอยู่แล้ว (FR-CM-002 AC ระบุไว้ตรง ๆ) |
| **PII — `CustomerMergeLog.survivorSnapshot`/`mergedSnapshot`** | 🛑 **มี PII ดิบ (เบอร์โทรทั้งหมดของทั้งสองแถว) ฝังอยู่ใน JSON โดยตั้งใจ** — เป็นเงื่อนไขที่ทำให้ audit log "กู้มือได้จริง" ตามที่ PRD ต้องการ ตารางนี้**ไม่มี UI ฝั่งผู้ขายให้เข้าถึงเลยใน scope ของ MVP** (BRD ไม่มี FR ที่พูดถึงหน้าจอแสดง merge log — Ops เข้าถึงผ่าน DB โดยตรงเท่านั้น ตามที่ PRD KPI ระบุ "ทีม Ops ต้องเข้าไปแก้ข้อมูลด้วย SQL") **ถ้าอนาคตมีการสร้างหน้า admin ให้ดู log นี้ ต้อง mask เบอร์ในสแนปช็อตก่อนส่งออกนอก server เสมอ** (เหมือนกฎ RSC PII neutralize-at-source ของโปรเจกต์นี้) — บันทึกเป็นคำเตือนล่วงหน้าไว้ตรงนี้ |
| **Performance — `findOrCreateCustomer` หนักขึ้นเล็กน้อย** | เดิม 1 query (`Customer.findUnique({phone})`) หลังฟีเจอร์นี้อาจต้อง 2 query แบบ point-lookup (`Customer.phone` ไม่เจอ → เช็ค `CustomerPhone.phone`) ทั้งสอง query เป็น unique index lookup (O(log n), เร็วมาก) — คำนวณ worst-case แล้วเพิ่ม latency ระดับ sub-millisecond ต่อครั้ง เทียบกับ order creation ที่มี query อื่นอีกหลายตัวอยู่แล้ว ถือว่า negligible แต่บันทึกไว้เพราะเป็น hot-ish path (ทุกครั้งที่สร้างออเดอร์ใหม่) |
| **Data Retention — `CustomerMergeLog`** | **ไม่มี purge job — เก็บถาวรตาม BR-CM-15** ตารางนี้โตช้ามาก (merge เป็น action ที่ไม่บ่อยตาม BRD §6.2 "ไม่ใช่ hot path") ไม่มีความเสี่ยงเรื่องขนาดตารางในอนาคตอันใกล้ |
| **Data Retention — `CustomerPhone`** | ไม่มี purge job เพิ่มเติม — วงจรชีวิตเดียวกับ `Customer` แม่ (ลบตาม Cascade ถ้า `Customer` แม่ถูกลบ ซึ่งในทางปฏิบัติแทบไม่เกิดขึ้น — ดู §3.1) |
| **Consistency ข้าม store** | ไม่เกี่ยวข้อง — store เดียว |

---

## 7. Traceability

🛑 **หมายเหตุ:** เอกสารนี้เขียนก่อน SDS (ตามคำสั่ง Controller เพื่อใช้เป็น contract) จึง trace กลับ **BRD**
โดยตรง (ไม่ใช่ SDS component ตามที่ template คาดหวัง) — เมื่อ SDS ของโมดูลนี้เขียนเสร็จ ต้องอัปเดตคอลัมน์ขวา
ให้ชี้ SDS component/decision ID แทน

| Table / Field | BRD FR/BR ที่เกี่ยวข้อง | สถานะ |
|--------------------|--------------------------|-------|
| `Customer.mergedIntoId` / `mergedAt` | FR-CM-006 (ยืนยันรวมแล้วรวมประวัติทันที), BR-CM-13/14/15, PRD OD-2/OD-4.3 §DB-4 | Draft |
| `CustomerPhone` (ทั้งตาราง) | FR-CM-001 (เพิ่มเบอร์), FR-CM-002 (มองเห็นเบอร์ทั้งหมด), BR-CM-01/02/03/04 | Draft |
| `CustomerMergeLog` (ทั้งตาราง) | FR-CM-007 (บันทึกร่องรอยการรวม), BR-CM-15 | Draft |
| trigger `customer_phone_cross_table_unique` | BR-CM-02 ("เบอร์หนึ่งเบอร์ผูกกับลูกค้ากลางได้สูงสุด 1 คนในระบบเสมอ") | Draft |
| trigger `customer_merge_userid_guard` | BR-CM-11 ("ห้ามรวม ถ้าทั้งสองแถวมี `userId` ที่ไม่ null และไม่เท่ากัน") | **MANDATORY** (มติ 2026-08-10 — ดู §5.1 ข้อ 5 และ §8 ข้อ 2) |

---

## 8. สรุป (Summary)

- **`Customer` ไม่มีคอลัมน์เดิมเปลี่ยนแปลงแม้แต่ตัวเดียว** — เพิ่ม `mergedIntoId`/`mergedAt` (nullable) เท่านั้น
  ทำให้ backward-compat กับ 20+ จุดที่อ่าน `customer.phone`/`userId` ตรง ๆ สมบูรณ์ 100% (DB-1)
- **เบอร์รองแยกตาราง `CustomerPhone`** ไม่ปนกับเบอร์หลัก ไม่มี `isPrimary` flag เพราะไม่จำเป็น (DB-2)
- **กันเบอร์ซ้ำข้าม 2 ตารางด้วย DB trigger คู่** (`Customer.phone` ↔ `CustomerPhone.phone`) เพราะ Postgres
  ไม่มี unique constraint ข้ามตารางตรง ๆ — เป็น unmanaged SQL แบบเดียวกับ EXCLUDE constraint/CHECK ที่มีอยู่แล้ว
  หลายจุดในโปรเจกต์นี้ (DB-3)
- **การรวมลูกค้าไม่ hard-delete แถวที่ถูกรวม — ตั้งธง `mergedIntoId`/`mergedAt` แทน (soft-pointer)** เพื่อกัน
  FK ในอนาคตที่ merge function ยังไม่รู้จัก และทำให้ Ops กู้คืนด้วยมือได้จริง (DB-4) — พร้อม chain-flatten
  logic (business rule ที่ schema ต้องรองรับ ไม่ใช่ DB constraint) กันการ merge ซ้อนหลายชั้น
- **`CustomerMergeLog` เก็บรายการ id ที่ถูกย้ายจริง ไม่ใช่แค่ id คู่** — เป็นเงื่อนไขที่ทำให้มติ OD-2
  (irreversible self-service) ของ PRD ไม่ใช่การรับความเสี่ยงเปล่า ๆ (DB-5)
- **Migration เดียว, additive ล้วน, ไม่มี backfill** — ตารางใหม่ 2 ตัว + คอลัมน์ nullable ใหม่ 2 ตัว + trigger
  ใหม่ 3 ตัว (2 REQUIRED, 1 RECOMMENDED) ไม่มี downtime ไม่มี lock ยาว
- **PII สแนปช็อตใน `CustomerMergeLog` ไม่มี UI เข้าถึงใน MVP นี้** — Ops เข้าถึงผ่าน DB โดยตรง ต้อง mask ถ้า
  สร้าง UI ในอนาคต

**Open Questions (ต้องให้ Controller/user เคาะเพิ่ม — ไม่ใช่คำถามระดับ schema แต่กระทบว่า schema จะถูกใช้ยังไง):**

1. ~~**OD-8 (สิทธิ์กดรวม) อาจไม่ได้ผลตามที่ตั้งใจ**~~ — **ปิดแล้ว 2026-08-10:** ข้อสังเกตนี้ถูกต้อง และ
   Controller ยืนยันกับโค้ดซ้ำแล้ว (`prisma/schema.prisma:1062` `ShopMember.role` = `"OWNER" | "ADMIN"`,
   `src/lib/shop-context.ts:76` `ActiveShop.role` ชนิดเดียวกัน) — **ไม่มี role `STAFF` อยู่จริงในระบบ**
   ตัวเลือกที่ PRD ตั้งไว้รอบแรกจึงเทียบของที่ไม่มีอยู่. user เคาะใหม่: **"ตอนนี้ให้ทุกคนทำได้ก่อนครับ
   ผมจะทำ Role Permission ตามมาทีหลัง"** ⇒ **ไม่ต้องเพิ่ม authorization check ใหม่** สำหรับการรวมลูกค้า
   ใครที่เข้าหน้า `/customers` ได้ (ผ่าน `requireActiveShop`) กดรวมได้ — ด่านกันรวมผิดคนในเฟสนี้อยู่ที่
   **หน้าจอเปรียบเทียบ+ยืนยัน** และ **`CustomerMergeLog`** เท่านั้น ไม่มีชั้นสิทธิ์มาช่วยกรอง
   (PRD §4.3 OD-8 + §2.2 แก้ตรงกันแล้ว)

2. ~~**Trigger `customer_merge_userid_guard` เป็น RECOMMENDED**~~ — 🛑 **มติ 2026-08-10 (ปิด Open Question หลัง QA ตั้งคำถาม): MANDATORY**
   เหตุผล: (ก) มันเขียนอยู่ใน **ไฟล์ migration** จึงเป็น managed SQL ที่ `migrate deploy` สร้างซ้ำได้เอง
   ไม่ใช่ SQL ที่รันมือบน console (หนี้ชนิดที่โปรเจกต์นี้เคยเจ็บมาแล้ว) ต้นทุนส่วนเพิ่มจึงเกือบเป็นศูนย์
   (ข) สิ่งที่มันกันคือ **การรวมบัญชีผู้ซื้อจริง 2 คนเข้าด้วยกัน ซึ่งย้อนกลับไม่ได้ตามมติ OD-2** — ข้อโต้แย้ง
   ที่ว่า "merge มีทางเข้าเดียว" เป็นจริง *วันนี้* แต่เป็นสัญญาที่ฝากไว้กับความจำของคนเขียนโค้ดคนถัดไป
   ซึ่งเป็นแพตเทิร์นที่ทำให้เกิดบั๊กมาแล้วหลายรอบในโปรเจกต์นี้ (`stored-flag-vs-owner-truth`)
   (ค) หลักที่เอกสารนี้ใช้กับ trigger เบอร์ซ้ำอยู่แล้ว: **app-level = UX, DB = ความถูกต้อง** ต้องใช้กับที่นี่ด้วย
   ⇒ ผลต่อ TestCase: **TC-D-005 เป็นเคสบังคับ ไม่ใช่เคสมีเงื่อนไข** และ route ต้องแมป error ของ trigger
   ตัวนี้เป็นข้อความไทยเหมือน error อื่น (ห้ามปล่อยเป็น 500 ดิบ)
3. **`linkBuyerHistory` (`user.service.ts`) ต้องเปลี่ยน logic จาก string-match เป็น customer-based match**
   เพื่อให้ FR-CM-008 AC ("ผูกออเดอร์เก่าที่ใช้เบอร์ทุกเบอร์ในชุด ไม่ใช่แค่เบอร์ที่สมัคร") เป็นจริง — ไม่ใช่คำถาม
   ระดับ schema (ไม่มีตารางไหนต้องแก้เพิ่ม) แต่เป็น service-level change ที่ SDS ต้องระบุไว้ชัด ไม่งั้นจะถูกมองข้าม
   เพราะไฟล์นี้ไม่ได้อยู่ในรายชื่อไฟล์ที่ "ดูเกี่ยวกับ Customer" โดยตรง (ดู §9)

---

## 9. ภาคผนวก: จุดที่ได้รับผลกระทบ (grep ทั้ง repo — `customer.phone`/`customerId`/`findOrCreateCustomer`)

ตารางนี้ตอบข้อบังคับ "grep หาทุกจุดที่อ่าน/เขียน `customer.phone` และ `customerId`" — คอลัมน์ "ต้องแก้ไหม"
คือสิ่งที่ SDS/dev ต้องรับช่วงต่อ ไม่ใช่งานของเอกสารนี้ (เอกสารนี้แค่ระบุให้ครบเพื่อไม่ให้ตกหล่นเหมือนที่ PRD
§6.2 เตือนไว้)

| ไฟล์ | ทำอะไรกับ Customer วันนี้ | ต้องแก้ไหม (หลังมีตาราง/tríger ใหม่) | เหตุผล |
|------|---------------------------|----------------------------------------|--------|
| `src/services/customer.service.ts::findOrCreateCustomer` | `Customer.findUnique({phone})` → สร้างถ้าไม่เจอ | 🛑 **ต้องแก้ (critical)** | ต้องเช็ค `CustomerPhone.phone` ด้วยก่อนสร้างใหม่ (FR-CM-003) + เดินตาม `mergedIntoId` ถ้าเจอแถวที่ถูกรวมแล้ว (DB-4) — เป็นจุดเดียวที่ order creation ทั้งระบบเรียกผ่าน (`createOrder`/`booking.service.ts`/`order-access.service.ts::guaranteeOrderLink` เรียกต่อจากนี่ทั้งหมด — แก้ที่นี่จุดเดียว ที่อื่น "auto-correct") |
| `src/services/order.service.ts::resolveCustomerForEditedOrder` (feature ที่เพิ่ง ship 2026-08-10) | เช็ค `newPhoneTaken` ด้วย `Customer.findUnique({phone: newPhone})` อย่างเดียว ก่อนอนุญาต rename เบอร์ในแถวเดิม | 🛑 **ต้องแก้ (critical, cross-feature gap)** | ถ้าไม่แก้ แอดมินจะ rename เบอร์บนออเดอร์ไปชนเบอร์ที่เป็น **เบอร์รอง** ของลูกค้าอีกคนได้สำเร็จ (ตอนนี้เช็คแค่ `Customer.phone` ไม่เช็ค `CustomerPhone.phone`) ซึ่งขัด BR-CM-02 ตรง ๆ — เป็นจุดตัดระหว่างฟีเจอร์ 00042 กับกลไก `customer-phone-edit.ts` ที่ ship ไปแล้วก่อนหน้า ต้อง sync กัน |
| `src/services/order-access.service.ts::guaranteeOrderLink` | เรียก `findOrCreateCustomer` แล้ว `tx.customer.update({userId})` | ไม่ต้องแก้เพิ่ม (auto-correct) | `customerId` ที่ได้จะ resolve ผ่าน `mergedIntoId` แล้วจากจุดบน — `update({where:{id: customerId}})` จะ target แถวหลักถูกต้องเองโดยอัตโนมัติ |
| `src/app/api/shops/current/customers/lookup/route.ts` | `Customer.findUnique({phone})` → `getCancellationSummary(customer.id)` | 🛑 **ต้องแก้** | ถ้าเบอร์ที่ค้นเป็นเบอร์ของแถวที่ถูกรวมไปแล้ว ต้อง resolve ผ่าน `mergedIntoId` ก่อนเรียก `getCancellationSummary` ไม่งั้น BR-LODG-38/39 จะนับจากแถวที่ไม่ใช้งานแล้ว (ประวัติไม่ครบตาม FR-CM-008 AC3) |
| `src/services/customer.service.ts::getCancellationSummary(customerId)` | `Order.groupBy({customerId})` | ไม่ต้องแก้ (auto-correct) | รับ `customerId` ที่ resolve แล้วจากผู้เรียก — ถ้าผู้เรียกส่ง survivor id มาถูกต้อง (ตามแถวบน) ฟังก์ชันนี้ทำงานถูกทันที เพราะ `Order.customerId` ทุกแถวถูกย้ายไปแถวหลักแล้วตอน merge |
| `src/services/customer.service.ts::getCustomerSummary(customerId, shopId)` | `Order.count({customerId, shopId})` | ไม่ต้องแก้ (auto-correct) | เหมือนแถวบน |
| `src/app/(paces)/seller/(dashboard)/customers/page.tsx` + `src/lib/customer-row-key.ts::makeCustomerRowKey` | group `Order` ด้วย `customerId` (ไม่ query ตาราง `Customer` เลย) | ไม่ต้องแก้ (auto-correct) | หลัง merge, `Order.customerId` ทุกแถวชี้ survivor เดียวกันหมด → หน้านี้เห็น 1 แถวอัตโนมัติ (FR-CM-008 AC1) เพราะ list นี้ derive จาก `Order` ไม่ใช่จาก `Customer` โดยตรง |
| `src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx` (`linkedCustomer`) + `CustomerPanel.tsx` | resolve customer ผ่าน `ExternalContact.customerId` (non-DEEP) หรือ `Customer.findUnique({userId})` (DEEP) | ไม่ต้องแก้ (auto-correct) | `ExternalContact.customerId` ถูกย้ายไปแถวหลักตอน merge อยู่แล้ว (BR-CM-13) ส่วน `userId` lookup resolve ไปแถวที่มี `userId` เสมอ ซึ่ง BR-CM-12 บังคับให้เป็นแถวหลักอยู่แล้วโดยดีไซน์ — ปลอดภัยโดยโครงสร้าง ไม่ต้องเช็ค `mergedIntoId` เพิ่ม |
| `src/services/ai-context.service.ts::buildCustomerBlock` | เหมือนแถวบน (`ExternalContact.customerId` หรือ `Customer.userId`) | ไม่ต้องแก้ (auto-correct) | เหตุผลเดียวกับแถวบน — ตอบ FR-CM-008 AC5 ("บริบท AI เห็นประวัติที่รวมแล้ว") โดยไม่ต้องแก้โค้ดไฟล์นี้เลย |
| `src/services/user.service.ts::linkBuyerHistory` | `Order.updateMany({buyerContact: phone})` — match ด้วย **string เบอร์ดิบ** ไม่ผ่าน `Customer`/`customerId` เลย | 🛑 **ต้องแก้ (service-level, ไม่ใช่ schema)** | เพื่อให้ FR-CM-008 AC4 เป็นจริง ต้องเปลี่ยนจาก "match `buyerContact` ตรงกับเบอร์เดียวที่สมัคร" เป็น "resolve `customerId` จากเบอร์ที่สมัคร แล้ว match `Order.customerId`" — ครอบคลุมทุกเบอร์ในชุด (หลัก+รอง+เบอร์ของแถวที่เคยถูกรวมมาก่อน) ระบุไว้ที่นี่เพราะเป็นจุดที่ไม่มีใครนึกถึงถ้าไม่ grep (ไฟล์นี้ไม่มีคำว่า "Customer" ในโค้ดเลยสักตัว) |
| `src/services/chat.service.ts` (DISTINCT ON query, บรรทัด ~215) + `src/services/order-stage.service.ts` (บรรทัด ~138) | SQL ดิบ `DISTINCT ON (shopId, customerId)` บน `Order` | ไม่ต้องแก้ (auto-correct) | อ่านจาก `Order.customerId` ที่ถูก migrate แล้วโดยตรง — ไม่มี logic แยกที่ต้อง sync กับ `mergedIntoId` |
| `src/lib/customer-phone-edit.ts::canRenameCustomerPhone` | pure function รับ input ที่ resolve มาแล้ว (ไม่ query DB เอง) | ไม่ต้องแก้ตัวฟังก์ชัน แต่ **ผู้เรียกต้องส่ง input ที่ถูกต้อง** | ตัวฟังก์ชันเองไม่แตะ DB — ความถูกต้องขึ้นกับ `resolveCustomerForEditedOrder` (แถวที่ 2 ของตารางนี้) ที่เรียกมันด้วย input ที่ query มา |
| `src/lib/thread-customer-link.ts::shouldRelinkThreadCustomer` | pure function เช่นกัน | ไม่ต้องแก้ | รับ `newCustomerId` ที่ resolve มาแล้วจาก caller — ถ้า caller (`resolveCustomerForEditedOrder`/`findOrCreateCustomer`) คืนค่าที่ resolve ผ่าน `mergedIntoId` ถูกต้อง ฟังก์ชันนี้ทำงานถูกทันทีโดยไม่ต้องแก้ |

**สรุปพื้นที่แก้ไขที่ SDS/dev ต้องรับช่วง:** 3 จุด critical (`findOrCreateCustomer`, `resolveCustomerForEditedOrder`,
`customers/lookup/route.ts`) + 1 จุด service-level ที่ไม่ชัดเจนจากชื่อไฟล์ (`linkBuyerHistory`) — ที่เหลือทั้งหมด
"auto-correct" ได้ฟรีจากการที่ merge migration ย้าย FK จริงในทรานแซกชันเดียว (สอดคล้องกับเจตนาของ PRD §3.5:
"แก้ที่ระดับ `Customer` จุดเดียว ทุกจุดที่อ่าน `customerId` ถูกไปด้วยพร้อมกันโดยอัตโนมัติ")

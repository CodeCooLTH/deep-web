---
title: "DATABASE — Deep Stock Pro"
owner: shinobu22
status: draft
module: M00009-DeepStockPro
version: "1.0"
created: 2026-07-02
tags: [feature, inventory, stock, subscription, seller, add-on, tiered-pricing, database, schema]
related: ["[[PRD]]", "[[BRD]]", "[[00003 - Inventory Add-on/DATABASE]]"]
---

> **โมดูล:** M00009-DeepStockPro
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-02
> **สถานะ:** Draft — รอ SRS/SDS ยืนยัน contract ก่อน implement
> **เจ้าของเอกสาร:** SA/Database Agent (ดู [[Feature-Docs-Ownership]])

# DATABASE: Deep Stock Pro

---

## 0. 🛑 Docs-stage disclaimer

**เอกสารนี้เป็นการออกแบบเท่านั้น** — ยังไม่มีการแก้ `prisma/schema.prisma` จริง, ยังไม่รัน `prisma migrate dev`/`migrate deploy`, ยังไม่รัน `prisma db pull` (บทเรียน [[feedback_qa_agent_no_prisma_pull]] + [[project_shared_db_drift_no_migrate_dev]] — Supabase dev=prod แชร์กัน มี orphaned migration นอก git). Apply จริงเป็นงาน implementation stage หลัง SRS/SDS sync ครบ และ **ต้องขอ user ยืนยันก่อนทุกครั้ง** (touch prod DB) ตาม `docs/conventions/prisma-shared-db-drift.md`.

---

## 1. Overview

Deep Stock Pro (M00009) ขยาย Inventory Add-on (M00003, live บน prod) จาก 1 ราคาคงที่ให้เป็น 2 แพ็กเกจ (BASIC ฿199 / PRO ฿599) ที่ stack กัน บวกฟีเจอร์ใหม่ 3 ตัวสำหรับ PRO (Low-stock Alert, Stock Movement/Audit Log, CSV Import/Export) และ 1 ฟีเจอร์ grandfather สำหรับทั้ง 2 package (Manual Stock Adjustment)

- **เอกสารออกแบบต้นทาง:** [[PRD]] §3-4, §6, §9 + [[BRD]] FR-DSP-01..12, BR-DSP-01..12. SRS/SDS ของโมดูลนี้ยังไม่เริ่ม (รอ PRD/BRD sign-off ตาม Hard Rule 11) — เอกสารนี้ตั้ง **FROZEN CONTRACT** ให้ SRS ยึดตาม (ชื่อ model/enum/field ห้ามเปลี่ยนโดยไม่ sync กลับมาที่นี่)
- **Store ที่เกี่ยวข้อง:** PostgreSQL 16 host บน Supabase (DB เดียวสำหรับ dev + prod — memory `project_prisma_migration_env_targets`)
- **ORM:** Prisma (`prisma/schema.prisma`); migration tool = `prisma migrate deploy` + hand-written migration file (**ห้าม `migrate dev`** — ดู `docs/conventions/prisma-shared-db-drift.md`)
- **ไม่ใช้ RLS:** authorization อยู่ที่ `src/services/` (NextAuth session + service guard scope-by-shopId) ไม่ใช้ policy ใน DB

### สิ่งที่ต้องเปลี่ยนแปลง (สรุปภาพรวม)

| Model | การเปลี่ยนแปลง | ประเภท |
|-------|----------------|--------|
| `InventoryEntitlement` (มีอยู่แล้ว — M00003) | เพิ่ม enum `InventoryPackage { BASIC, PRO }` + field `package InventoryPackage @default(BASIC)` | Additive |
| `StockMovement` (ใหม่) | table ใหม่ — audit log ทุก event ที่กระทบ `Product.stockQty` (record-always ทุก package ตาม OD-C) | New |
| `Product` (มีอยู่แล้ว — M00003) | เพิ่ม `lowStockThreshold Int?` (nullable, PRO-only gate ที่ app layer) | Additive |
| `WalletTransaction` (มีอยู่แล้ว — M00003) | **ไม่แก้ schema** — reuse `reason`/`description` (TEXT, nullable) เดิม เพิ่มแค่ *ค่า* ใหม่ในระดับ app constant | No DDL change |

### สิ่งที่ตรวจสอบแล้วว่าไม่ต้องสร้าง table ใหม่/ไม่ต้องแก้เพิ่ม

| ความต้องการ | Derivation |
|-------------|-----------|
| Manual Stock Adjustment (§3 ของ prompt) | reuse `Product.stockQty` (atomic conditional update pattern เดิมจาก M00003) + insert `StockMovement` (source=`MANUAL_ADJUST`) ในธุรกรรมเดียวกัน — ไม่ต้องมี "adjustment request" table แยก เพราะเป็น action สำเร็จทันที (synchronous, ไม่มี approval workflow) และทุก adjustment ถูกบันทึกครบใน `StockMovement` row เดียวอยู่แล้ว (ดู §3.2, §6) |
| WalletTransaction label แยก package | reuse `reason`(TEXT, nullable, มีอยู่แล้วจาก M00003) + `description`(TEXT, มีอยู่แล้ว) — ไม่ต้องเพิ่ม column ใหม่ (ดู §3.4) |
| Low-stock threshold | field เดี่ยวบน `Product` (`lowStockThreshold Int?`) พอ — ไม่ต้องมี table แยก 1:1 (เหตุผลเดียวกับที่ `stockQty` ไม่ต้องมี boolean flag แยกใน M00003 — nullable Int เดี่ยวคือ tri-state ที่ต้องการอยู่แล้ว: `NULL`=ไม่ตั้ง, `N>=0`=ตั้ง) |
| PHYSICAL-only / package gate | เช็คที่ app layer (`Product.type`, `InventoryEntitlement.status`+`package`) — ไม่มี DB constraint ผูก type/package (สืบทอด pattern M00003) |

---

## 2. ERD (ส่วนที่เพิ่ม/แก้เท่านั้น)

```mermaid
erDiagram
    Shop ||--o| InventoryEntitlement : "subscribes (nullable 1:1)"
    Shop ||--o{ Product : "lists"
    Shop ||--o{ StockMovement : "owns (denormalized scope)"
    Product ||--o{ StockMovement : "tracked by (nullable FK, SetNull on delete)"
    Order ||--o{ StockMovement : "referenced by refId (ORDER_DEDUCT/ORDER_RESTOCK, ไม่ใช่ DB FK)"
    User ||--o{ StockMovement : "actor (nullable, MANUAL_ADJUST เท่านั้น)"
    SellerWallet ||--o{ WalletTransaction : "records (schema เดิม ไม่แก้)"

    InventoryEntitlement {
        string id PK "uuid — มีอยู่แล้ว M00003"
        string shopId FK_UK
        enum status "ACTIVE | LOCKED — มีอยู่แล้ว"
        enum package "NEW: BASIC | PRO — default BASIC"
        datetime activatedAt
        datetime currentPeriodStart
        datetime nextRenewalAt
        datetime lastRenewalAt
        datetime lockedAt
    }
    Product {
        string id PK "uuid — มีอยู่แล้ว"
        string shopId FK
        int stockQty "nullable — มีอยู่แล้ว M00003"
        int lowStockThreshold "NEW nullable; NULL=ไม่ตั้ง alert; PRO-only gate ที่ app layer; CHECK>=0"
    }
    StockMovement {
        string id PK "uuid"
        string shopId FK "denormalized scope — CASCADE on Shop delete"
        string productId FK "nullable — SetNull on Product delete (audit ต้องรอดแม้ product ถูกลบ)"
        string productName "snapshot ชื่อสินค้า ณ เวลาบันทึก (กัน audit อ่านไม่รู้เรื่องถ้า product ถูกลบ/เปลี่ยนชื่อ)"
        int delta "จำนวนที่เปลี่ยน; + = เพิ่ม (restock/manual-รับเข้า), - = ลด (deduct/manual-ตัด)"
        int resultingQty "stockQty ของ product หลัง apply movement นี้ — snapshot สำหรับ reconcile"
        enum source "ORDER_DEDUCT | ORDER_RESTOCK | MANUAL_ADJUST"
        string refId "nullable; Order.id สำหรับ ORDER_DEDUCT/RESTOCK, NULL สำหรับ MANUAL_ADJUST"
        string note "nullable free text; required ที่ app layer สำหรับ MANUAL_ADJUST"
        string actorUserId FK "nullable — ผู้ทำ manual adjustment เท่านั้น (ORDER_* = NULL, system-derived)"
        datetime createdAt
    }
    WalletTransaction {
        string id PK "uuid — schema ไม่แก้ (M00003)"
        string walletId FK
        string type "TOPUP | DEDUCT"
        string reason "TEXT nullable — ค่าใหม่ 3 ค่าสำหรับ M00009 (ดู §3.4)"
        string description "TEXT — ค่าใหม่ Thai label สำหรับ M00009 (ดู §3.4)"
        int amount
    }
```

---

## 3. Tables

### 3.1 `InventoryEntitlement` — เพิ่มมิติ package (extend M00003)

| Column | Type | Null | Default | Key | หมายเหตุ |
|--------|------|------|---------|-----|---------|
| `package` | `InventoryPackage` (enum, ใหม่) | NO | `'BASIC'` | INDEX (composite) | **NEW.** BASIC=฿199 (M00003 เดิม + Manual Adjustment), PRO=฿599 (BASIC+Alert+Audit+CSV) |

```prisma
// เพิ่มเข้า enum block เดิมของ M00003 (ไม่แตะ InventoryEntitlementStatus)
enum InventoryPackage {
  BASIC
  PRO
}

model InventoryEntitlement {
  id                 String                     @id @default(uuid())
  shopId             String                     @unique
  status             InventoryEntitlementStatus @default(ACTIVE)
  package            InventoryPackage           @default(BASIC) // NEW
  activatedAt        DateTime
  currentPeriodStart DateTime
  nextRenewalAt      DateTime
  lastRenewalAt      DateTime?
  lockedAt           DateTime?
  createdAt          DateTime                   @default(now())
  updatedAt          DateTime                   @updatedAt

  shop            Shop            @relation(fields: [shopId], references: [id], onDelete: Cascade)
  stockMovements  StockMovement[] // back-relation ของ Shop ไม่ใช่ entitlement โดยตรง — ดู §3.2 (ไม่มี FK ตรงจาก StockMovement)

  @@index([status, nextRenewalAt])
  @@index([status, package]) // NEW — reporting/KPI (Pro MRR, Basic→Pro upgrade rate, PRD §1.2)
}
```

> หมายเหตุ: `stockMovements` ใน block ข้างบนเป็น**ตัวอย่างผิด** ที่แก้ไขแล้ว — `StockMovement` ไม่มี FK ตรงไปที่ `InventoryEntitlement` (ดูเหตุผล §3.2 "ทำไมไม่ผูก entitlement โดยตรง") back-relation ที่แท้จริงอยู่ที่ `Shop.stockMovements`

**ทำไม `InventoryPackage` เป็น Prisma enum จริง ไม่ใช่ `String` (ต่างจาก `Product.type`/`Order.status`):** เดินตาม precedent ของ `InventoryEntitlementStatus` เองใน M00003 — ทั้งสอง field เป็นค่าที่ **ควบคุมโดย domain logic ของ inventory feature เท่านั้น** (ไม่ใช่ user-input แบบ `Order.status`/`Product.type` ที่ legacy field อื่นเป็น String ตาม convention เดิม) ใช้ enum จริงได้ type-safety ที่ compile-time โดยไม่เสี่ยง drift กับ generic string field อื่นในระบบ

**Semantics ที่ SRS ต้องยึดตาม (state-machine, ต่อจาก M00003 §3.1):**
- Subscribe ครั้งแรก (NOT_SUBSCRIBED → ACTIVE) → `package` = ตามที่ seller เลือก (BASIC หรือ PRO — FR-DSP-03)
- Upgrade (BASIC ACTIVE → PRO ACTIVE) → `package` เปลี่ยนเป็น `PRO`; `currentPeriodStart`/`nextRenewalAt` reset ใหม่เหมือน reactivate (BR-DSP-06 no-proration)
- Renewal สำเร็จ → `package` **ไม่เปลี่ยน** (renew ที่ package ปัจจุบัน, หักราคาตาม package — BR-DSP-09)
- Renewal ล้มเหลว → LOCKED → `package` **ไม่เปลี่ยน** (คงค่าล่าสุดไว้ "จำ" — ตรง BRD §4.3 "LOCKED จำค่า package ล่าสุดไว้เพื่อแสดงข้อความ")
- Reactivate → `package` = ตามที่ seller **เลือกใหม่ตอนนั้น** (explicit choice, อาจต่างจากค่าก่อนล็อก — FR-DSP-07-AC-01/04) ไม่ auto-restore

**Backfill correctness (ตอบ requirement §1 ของ prompt):** ใช้ `ADD COLUMN "package" ... NOT NULL DEFAULT 'BASIC'` แบบ statement เดียว — PostgreSQL 16 (≥11) ประมวลผล `ADD COLUMN` ที่มี non-volatile `DEFAULT` เป็น **metadata-only operation** (ไม่ rewrite table, ไม่ scan แถวทีละแถว) และ **ใส่ค่า default ให้ทุกแถวเดิมทันทีในสาย DDL เดียวกัน** — ครอบคลุมทั้ง entitlement ที่ `status=ACTIVE` และ `status=LOCKED` เดิมของ M00003 โดยไม่มีแถวไหนตกหล่น (ไม่ต้องมี `UPDATE` แยกเหมือน `WalletTransaction.reason` ของ M00003 ที่เป็น nullable-no-default) — ปลอดภัยกว่าและ atomic กว่า

### 3.2 `StockMovement` (ใหม่)

Audit log ทุก event ที่กระทบ `Product.stockQty` — **record-always ทุก package เสมอ (OD-C)**, gate เฉพาะการ query/แสดงผลที่ service layer ด้วย `package=PRO` (ไม่ใช่ gate ที่ตาราง)

| Column | Type | Null | Default | Key | หมายเหตุ |
|--------|------|------|---------|-----|---------|
| `id` | `TEXT` | NO | `gen_random_uuid()` | PK | uuid ตาม convention |
| `shopId` | `TEXT` | NO | — | FK, INDEX (composite) | denormalized scope (ตรง project convention "scope ownership ใน WHERE clause" — memory `feedback_rsc_dal_authz`); `ON DELETE CASCADE` (ลบพร้อม Shop) |
| `productId` | `TEXT` | YES | NULL | FK, INDEX (composite) | `ON DELETE SET NULL` — audit log ต้องรอดแม้ product ถูกลบ (defensive; ปัจจุบัน `deleteProduct()` เป็น soft-delete `isActive=false` เท่านั้น ไม่ hard-delete จริง — แต่ตั้ง SetNull ไว้ตาม pattern เดียวกับ `OrderItem.productId` เผื่ออนาคต/admin hard-delete) |
| `productName` | `TEXT` | NO | — | — | snapshot ชื่อสินค้า ณ เวลาบันทึก movement (เหมือน `OrderItem.name` snapshot) — กัน audit log อ่านไม่รู้เรื่องถ้า product ถูกลบ/เปลี่ยนชื่อภายหลัง |
| `delta` | `INTEGER` | NO | — | — | จำนวนที่เปลี่ยน: บวก = เพิ่ม (order-restock, manual รับเข้า), ลบ = ลด (order-deduct, manual ของเสียหาย/สูญหาย). ห้าม `0` (ไม่มี movement จริง — validate ที่ app layer/CHECK) |
| `resultingQty` | `INTEGER` | NO | — | — | ค่า `Product.stockQty` **หลัง** apply movement นี้ — อ่านจาก tx เดียวกันตอนบันทึก (ไม่ query แยก กัน race) ใช้ reconcile "ตัวเลขตรงไหม" (FR-DSP-09 pain point) |
| `source` | `StockMovementSource` (enum, ใหม่) | NO | — | INDEX (composite) | `ORDER_DEDUCT` \| `ORDER_RESTOCK` \| `MANUAL_ADJUST` |
| `refId` | `TEXT` | YES | NULL | — | `Order.id` สำหรับ `ORDER_DEDUCT`/`ORDER_RESTOCK`; `NULL` สำหรับ `MANUAL_ADJUST` (ไม่มี order เกี่ยวข้อง). **ไม่ใช่ DB FK จริง** (ตั้งใจ — เหมือน `WalletTransaction.refId` เดิม; Order ถูกลบไม่ได้ในระบบนี้อยู่แล้วจึงไม่มีความเสี่ยง orphan) |
| `note` | `TEXT` | YES | NULL | — | free text; required เฉพาะ `MANUAL_ADJUST` ที่ app layer (FR-DSP-01-AC-01 "พร้อมระบุเหตุผล") — DB เก็บ nullable เพื่อไม่บล็อก `ORDER_*` ที่ไม่มี note |
| `actorUserId` | `TEXT` | YES | NULL | FK | `ON DELETE SET NULL` — ผู้ทำ manual adjustment (seller user); `NULL` เสมอสำหรับ `ORDER_DEDUCT`/`ORDER_RESTOCK` (system/job-triggered — ผู้ก่อเหตุจริงหาได้จาก `Order.buyerUserId`/`Order.cancelInitiator` อยู่แล้ว ไม่ต้อง duplicate ที่นี่) |
| `createdAt` | `TIMESTAMP(3)` | NO | `now()` | INDEX (composite) | append-only log — **ไม่มี `updatedAt`** (movement เป็น immutable fact ห้ามแก้ย้อนหลัง) |

**ทำไมไม่ผูก FK ตรงกับ `InventoryEntitlement`:** `StockMovement` ต้อง record-always ไม่ว่า entitlement จะ ACTIVE/LOCKED/package ไหนในขณะนั้น (OD-C) — การผูก FK ตรงจะสื่อความหมายผิดว่า movement "เป็นของ package X ตอนบันทึก" ทั้งที่ business rule ต้องการให้ **gate การมองเห็นที่ query-time ด้วยสถานะปัจจุบันของ entitlement** (ไม่ใช่ snapshot ตอนบันทึก) — เก็บ scope ผ่าน `shopId`/`productId` พอ แล้ว join ไป `InventoryEntitlement` (ผ่าน `shopId`) ที่ service layer ตอน query/display เท่านั้น

**ทำไม `source` เป็น Prisma enum จริง:** เหตุผลเดียวกับ `InventoryPackage` (§3.1) — ค่าที่ domain logic ควบคุมเอง ไม่ใช่ user input

```prisma
enum StockMovementSource {
  ORDER_DEDUCT
  ORDER_RESTOCK
  MANUAL_ADJUST
}

model StockMovement {
  id            String              @id @default(uuid())
  shopId        String
  productId     String?
  productName   String
  delta         Int
  resultingQty  Int
  source        StockMovementSource
  refId         String?
  note          String?
  actorUserId   String?
  createdAt     DateTime            @default(now())

  shop    Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)
  product Product? @relation(fields: [productId], references: [id], onDelete: SetNull)
  actor   User?    @relation("StockMovementActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([productId, createdAt]) // hot path: movement history ต่อสินค้า เรียงเวลาล่าสุดก่อน (FR-DSP-09-AC-02)
  @@index([shopId, createdAt])    // admin/reporting: all movements ของ shop
  @@index([shopId, source])       // filter ตาม source (เช่น manual adjustment log แยก)
}
```

> **หมายเหตุ back-relation ที่ต้องเพิ่มด้วย (ไม่ใช่ table ใหม่ แต่เป็น relation field เพิ่มบน model เดิม):** `Shop.stockMovements StockMovement[]`, `Product.stockMovements StockMovement[]`, `User.stockMovementsActedOn StockMovement[] @relation("StockMovementActor")` — SDS/developer ต้องเพิ่มตอนแก้ schema.prisma จริง

### 3.3 `Product` — field ใหม่ (extend M00003)

| Column | Type | Null | Default | Key | เหตุผล |
|--------|------|------|---------|-----|--------|
| `lowStockThreshold` | `INTEGER` | YES | NULL | CHECK | **NEW.** จำนวนที่ต่ำกว่า/เท่ากับนี้ = แจ้งเตือน; `NULL` = ยังไม่ตั้ง (ไม่มี alert). PRO-only ที่ app layer (entitlement `package=PRO, status=ACTIVE`) — DB ไม่ผูก constraint กับ package (สืบทอด pattern "PHYSICAL-only ไม่ผูก DB constraint" ของ M00003) |

**ทำไม nullable Int เดี่ยวพอ (ไม่ต้องมี table แยก 1:1 หรือ boolean flag คู่):** เหตุผลเดียวกับที่ `stockQty` ไม่ต้องมี `stockTracked` boolean ใน M00003 (DATABASE.md §3.2 ของ M00003) — `NULL`=ยังไม่ตั้ง threshold, `N>=0`=ตั้งแล้ว เป็น tri-state ที่ตรงกับ business rule พอดี ไม่มี ambiguity, ไม่มีความเสี่ยง inconsistency ระหว่าง flag คู่กัน. ค่า threshold เป็น attribute ของสินค้าโดยตรง (1:1 ธรรมชาติกับ Product) ไม่มีเหตุผลด้าน normalization ที่ต้องแยกตาราง

```prisma
model Product {
  // ...fields เดิมทั้งหมดไม่เปลี่ยน...
  stockQty          Int? // มีอยู่แล้ว M00003
  lowStockThreshold Int? // NEW — nullable; NULL=ไม่ตั้ง alert; PRO-only gate ที่ app layer; CHECK>=0

  stockMovements StockMovement[] // back-relation ใหม่
}
```

### 3.4 `WalletTransaction` — **ไม่แก้ schema**, เพิ่มเฉพาะค่า (app-layer contract)

ไม่มี column ใหม่ — reuse `reason`(TEXT?, nullable, index อยู่แล้ว) + `description`(TEXT, required) ที่ M00003 สร้างไว้แล้ว. สิ่งที่เพิ่มคือ **ค่าคงที่ใหม่ระดับ application** ใน `src/lib/inventory-addon.ts` (ไม่ใช่ DB migration):

| `reason` (machine key, ใหม่) | ใช้เมื่อ | `description` (Thai label, ใหม่ — ตัวอย่าง) |
|---|---|---|
| `INVENTORY_SUBSCRIPTION_BASIC` | Subscribe/Renew/Reactivate ที่ package=BASIC | "สมัคร Deep Stock" / "ต่ออายุ Deep Stock (รายเดือน)" / "เปิดใช้ Deep Stock อีกครั้ง" |
| `INVENTORY_SUBSCRIPTION_PRO` | Subscribe/Renew/Reactivate ที่ package=PRO (**ไม่ใช่** upgrade) | "สมัคร Deep Stock Pro" / "ต่ออายุ Deep Stock Pro (รายเดือน)" / "เปิดใช้ Deep Stock Pro อีกครั้ง" |
| `INVENTORY_SUBSCRIPTION_PRO_UPGRADE` | Upgrade BASIC→PRO กลางรอบเท่านั้น | "อัพเกรดเป็น Deep Stock Pro" |
| `INVENTORY_SUBSCRIPTION` (เดิม, ไม่ต้องเปลี่ยน) | **Legacy เท่านั้น** — row จาก M00003 ก่อน deploy M00009 | ไม่ relabel ย้อนหลัง (FR-DSP-11-AC-03) |

**⚠️ Reconciliation note สำหรับ SRS/planner (สำคัญ ต้องอ่าน):** BRD FR-DSP-03-AC-01/FR-DSP-04-AC-01 เขียน AC ด้วยตัวอย่าง `reason="Inventory Subscription - Deep Stock Pro"` (ข้อความอังกฤษเต็ม) — เอกสารนี้ตีความ **เจตนา** ของ AC (Admin ต้องแยกเห็นได้ว่า transaction เป็นของ package ไหน + แยก upgrade event ได้ สำหรับ KPI "Basic→Pro Upgrade Rate" vs "Direct-to-Pro Conversion Rate" ใน PRD §1.2) ผ่าน**กลไกที่มีอยู่แล้วจริงในโค้ด** ไม่ใช่ยกข้อความ AC มาใส่ตรง ๆ เพราะ:
1. หน้า Admin (`admin/(dashboard)/topups/[id]/page.tsx`) แสดงผลด้วย `WALLET_REASON_LABEL_TH[reason] ?? description` — `reason` เป็น **machine key** (`UPPER_SNAKE_CASE`) ที่ map ไปเป็น label ผ่าน dictionary เดิมอยู่แล้ว (`SMS_ORDER_LINK`, `INVENTORY_SUBSCRIPTION`) ไม่ใช่ raw display string
2. UI copy ทั้งระบบเป็นภาษาไทย (CLAUDE.md convention) — ข้อความอังกฤษเต็มใน `reason` จะขัด convention ถ้าไปโผล่ fallback ที่ไหนโดยไม่ผ่าน mapping
3. เก็บ machine key 3 ค่า (BASIC/PRO/PRO_UPGRADE) ให้ query ได้ตรง ๆ (KPI aggregation) แม่นกว่าการ string-match ข้อความยาว

**ต้อง confirm กับ Controller/user ก่อนเข้า SRS:** ยึดตามแนวทางนี้ (reuse `reason` machine-key + ขยาย `WALLET_REASON_LABEL_TH` map) หรือ user ต้องการ literal string ตาม BRD เป๊ะ ๆ ใน `reason` จริง ๆ (ถ้าใช่ ต้อง sync BRD ให้ระบุว่าเป็น *display value* ไม่ใช่ machine key และปรับ label-lookup component ที่ admin page ด้วย)

**`refId` guidance:** `refId = InventoryEntitlement.id` (เหมือนเดิมจาก M00003)

---

## 4. Indexes

| Table | Columns | Type | Rationale (query pattern ที่รองรับ) |
|-------|---------|------|--------------------------------------|
| `InventoryEntitlement` | `(status, package)` | BTREE composite | **NEW.** Reporting/KPI: "Pro MRR" (count `package=PRO, status=ACTIVE`), "Basic→Pro Upgrade Rate" denominator (count `package=BASIC, status=ACTIVE` ใน cohort) — PRD §1.2 |
| `StockMovement` | `(productId, createdAt)` | BTREE composite | **NEW — hot path.** หน้า movement history ต่อสินค้า (FR-DSP-09-AC-02) เรียงเวลาล่าสุดก่อน; `productId` nullable แต่ query จริงกรอง `productId IS NOT NULL` เสมอ (movement ที่ query จากหน้า product detail ต้องมี productId) |
| `StockMovement` | `(shopId, createdAt)` | BTREE composite | **NEW.** Cross-product movement list ต่อ shop (อนาคต — admin/dashboard aggregate) |
| `StockMovement` | `(shopId, source)` | BTREE composite | **NEW.** แยก log ตาม source (เช่น ดูเฉพาะ manual adjustment history) |
| `Product` | ไม่มี index ใหม่สำหรับ `lowStockThreshold` | — | Low-stock check เกิด **inline ตอน deduct event** (เทียบ `resultingQty <= lowStockThreshold` บน row ที่โหลดอยู่แล้วใน tx เดียวกัน — ไม่ scan ตารางแยก) ไม่ต้อง batch/cron scan ข้าม product ใน MVP นี้ (ดู Open Question §8) |

**หมายเหตุ — ไม่ใช้ GIN:** ไม่มี array/JSON field ใหม่ในฟีเจอร์นี้ — ทุก index เป็น BTREE ปกติ (สืบทอด pattern M00003)

---

## 5. Migration Plan

### 5.1 ลำดับ (additive ก่อน → backfill (รวมอยู่ใน DDL เดียว) → ค่อย constraint) — แนะนำรวมเป็น migration เดียว `add_deep_stock_pro_schema`

| ลำดับ | การเปลี่ยนแปลง | หมายเหตุ |
|-------|----------------|---------|
| 1 | `CREATE TYPE "InventoryPackage" AS ENUM ('BASIC', 'PRO')` | new enum, ไม่กระทบ table เดิม |
| 2 | `ALTER TABLE "InventoryEntitlement" ADD COLUMN "package" "InventoryPackage" NOT NULL DEFAULT 'BASIC'` | **additive+backfill รวมสเต็ปเดียว** — metadata-only บน PG16 (≥11), ครอบคลุมทุกแถวเดิม (ACTIVE+LOCKED) เป็น BASIC อัตโนมัติ ไม่มีแถวตกหล่น ไม่ต้อง UPDATE แยก |
| 3 | `CREATE INDEX` `(status, package)` บน `InventoryEntitlement` | table มี row จริงแต่ index สร้างได้โดยไม่ lock เขียนนาน (base เล็ก — เหมือน M00003 pattern) |
| 4 | `CREATE TYPE "StockMovementSource" AS ENUM ('ORDER_DEDUCT', 'ORDER_RESTOCK', 'MANUAL_ADJUST')` | new enum |
| 5 | `CREATE TABLE "StockMovement"` (ทุก column ตาม §3.2) | new table ว่าง — ไม่กระทบใคร |
| 6 | `CREATE INDEX` x3 บน `StockMovement` (productId+createdAt, shopId+createdAt, shopId+source) | บน table ใหม่ (ว่าง) — ไม่ lock อะไร |
| 7 | `ALTER TABLE "StockMovement" ADD CONSTRAINT ... FK` (shopId→Shop CASCADE, productId→Product SET NULL, actorUserId→User SET NULL) | |
| 8 | `ALTER TABLE "Product" ADD COLUMN "lowStockThreshold" INTEGER` (nullable, ไม่มี default = NULL อัตโนมัติ) | additive, metadata-only, row เดิมได้ NULL = ไม่ตั้ง alert |
| 9 | `ALTER TABLE "Product" ADD CONSTRAINT "Product_lowStockThreshold_nonneg" CHECK (...) NOT VALID` แล้ว `VALIDATE CONSTRAINT` แยก statement | Product มี row จริงบน prod แล้ว (เหมือน `stockQty` เดิม) — ใช้ NOT VALID+VALIDATE กัน ACCESS EXCLUSIVE lock ยาว (pattern เดียวกับ M00003 §5.2) |
| 10 | **ไม่มี DDL สำหรับ `WalletTransaction`** | reuse column เดิม 100% — เปลี่ยนแค่ app constant (`src/lib/inventory-addon.ts`) นอก migration นี้ |

### 5.2 Migration SQL (ร่าง)

```sql
-- Migration: add_deep_stock_pro_schema | Feature: M00009-DeepStockPro | drafted 2026-07-02
-- SAFETY: additive only ทุก column ใหม่ nullable หรือมี DEFAULT ที่ backfill แถวเดิมในตัว
-- InventoryEntitlement/Product มี row จริงบน prod แล้ว → package ใช้ DEFAULT (metadata-only),
-- lowStockThreshold ใช้ NOT VALID + VALIDATE (เหมือน stockQty ของ M00003)
-- ROLLBACK: ดูตาราง §5.4 — StockMovement/lowStockThreshold rollback = DATA LOSS ถ้ามี data จริงแล้ว

-- 1) InventoryEntitlement.package (enum + column พร้อม default = backfill ในตัว)
CREATE TYPE "InventoryPackage" AS ENUM ('BASIC', 'PRO');

ALTER TABLE "InventoryEntitlement"
    ADD COLUMN "package" "InventoryPackage" NOT NULL DEFAULT 'BASIC';

CREATE INDEX "InventoryEntitlement_status_package_idx"
    ON "InventoryEntitlement"("status", "package");

-- 2) StockMovement (table ใหม่)
CREATE TYPE "StockMovementSource" AS ENUM ('ORDER_DEDUCT', 'ORDER_RESTOCK', 'MANUAL_ADJUST');

CREATE TABLE "StockMovement" (
    "id"            TEXT NOT NULL,
    "shopId"        TEXT NOT NULL,
    "productId"     TEXT,
    "productName"   TEXT NOT NULL,
    "delta"         INTEGER NOT NULL,
    "resultingQty"  INTEGER NOT NULL,
    "source"        "StockMovementSource" NOT NULL,
    "refId"         TEXT,
    "note"          TEXT,
    "actorUserId"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");
CREATE INDEX "StockMovement_shopId_createdAt_idx" ON "StockMovement"("shopId", "createdAt");
CREATE INDEX "StockMovement_shopId_source_idx" ON "StockMovement"("shopId", "source");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- (ทางเลือก, แนะนำ) กัน delta=0 สร้าง log ปลอม (ไม่มี movement จริง)
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_delta_nonzero" CHECK ("delta" <> 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_resultingQty_nonneg" CHECK ("resultingQty" >= 0);
-- table ใหม่ว่าง → ไม่ต้อง NOT VALID/VALIDATE แยก (ต่างจาก Product/InventoryEntitlement ที่มี row จริง)

-- 3) Product.lowStockThreshold
ALTER TABLE "Product" ADD COLUMN "lowStockThreshold" INTEGER;

ALTER TABLE "Product" ADD CONSTRAINT "Product_lowStockThreshold_nonneg"
    CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_lowStockThreshold_nonneg";

-- 4) WalletTransaction: ไม่มี DDL — reuse reason/description เดิม (ดู §3.4)
```

### 5.3 วิธี Apply (ยังไม่รัน — รอ Controller/user ยืนยัน)

```bash
# 1) แก้ prisma/schema.prisma จริง (implementation stage เท่านั้น — ไม่ใช่ตอนนี้)
# 2) เขียน migration.sql เองที่ prisma/migrations/<TIMESTAMP>_add_deep_stock_pro_schema/migration.sql
#    TIMESTAMP = 14-digit UTC (เช่น `date -u +%Y%m%d%H%M%S`) ให้ตรง Prisma convention
npx prisma generate
npx prisma validate
# 🛑 prod = dev Supabase แชร์กัน — ขอ user ยืนยันก่อนทุกครั้ง
npx dotenv -e .env.local -- npx prisma migrate deploy
# generate ใหม่ + restart dev server (client เก่าไม่มี model/field ใหม่ → session 500)
npx prisma generate
```

ดู `docs/conventions/prisma-shared-db-drift.md` — **ห้าม `prisma migrate dev`** (จะเสนอ `migrate reset` เพราะ DB มี orphaned migration นอก git — ลบข้อมูลทั้ง DB); ใช้ `migrate deploy` + hand-written migration file เท่านั้น

**🛑 งานออกแบบนี้ยังไม่ apply จริง / ยังไม่รัน `prisma migrate dev`/`db pull` / ยังไม่แก้ `prisma/schema.prisma`** — apply เมื่อ Controller/user ยืนยันในขั้น implement เท่านั้น

### 5.4 Rollback

| Migration step | Rollback | ผลกระทบ |
|-----------------|----------|---------|
| `InventoryEntitlement.package` + enum | `ALTER TABLE "InventoryEntitlement" DROP COLUMN "package"; DROP TYPE "InventoryPackage";` | ปลอดภัยถ้า rollback ก่อนมี shop upgrade/subscribe-Pro จริง (ทุก entitlement เดิมเป็น BASIC อยู่แล้วโดย default — ไม่มี "Pro state" ให้เสีย); ถ้า rollback หลังมี shop upgrade เป็น PRO แล้ว จะ**เสียข้อมูลว่า shop ไหนเป็น Pro** (กลับไปดูไม่ออกจาก schema แล้ว — ต้อง export ก่อน rollback) |
| `CREATE TABLE StockMovement` + enum | `DROP TABLE "StockMovement"; DROP TYPE "StockMovementSource";` | ⚠️ **data loss จริง** — audit log/movement history ทั้งหมดหาย (กระทบคุณค่าหลักของ PRO tier "ตรวจสอบย้อนหลัง") ปลอดภัยเฉพาะ rollback ก่อนมี seller ใช้งานจริง |
| `Product.lowStockThreshold` ADD COLUMN | `DROP COLUMN "lowStockThreshold"` | ⚠️ data loss — threshold ที่ seller ตั้งไว้หายหมด; ปลอดภัยเฉพาะ rollback ทันทีหลัง apply |
| CHECK constraints | `DROP CONSTRAINT ...` | ไม่มี data loss |
| Indexes | `DROP INDEX ...` | ไม่มี data loss, กระทบ performance เท่านั้น |
| `WalletTransaction` ค่า `reason`/`description` ใหม่ | ไม่มี DDL ให้ rollback — ถ้าต้องการ "เลิกใช้" ค่าใหม่ ก็แค่หยุดเขียนค่าใหม่ที่ app layer (row เก่าที่เขียนไปแล้วจะค้างค่าใหม่ไว้ ซึ่งเป็น**ประวัติจริง** ไม่ควร/ไม่จำเป็นต้อง revert) | ต่ำสุด — ไม่กระทบ balance/ledger integrity |

Rollback ทันทีหลัง apply (ก่อนมี seller subscribe Pro/ใช้ manual adjustment/ตั้ง threshold จริง) = ปลอดภัยเกือบสมบูรณ์ทุก step; rollback หลัง launch (มี data จริง) ต้อง export `StockMovement`/`lowStockThreshold`/entitlement `package=PRO` ก่อนเสมอ

### 5.5 ผลกระทบ

- **Downtime:** ไม่มี — `ADD COLUMN` (nullable หรือมี DEFAULT) = metadata-only ใน PG16; `CREATE TABLE` บน table ใหม่ไม่กระทบใคร
- **`InventoryEntitlement.package` NOT NULL + DEFAULT บน table ที่มี row จริง:** ปลอดภัย metadata-only (PG≥11 ไม่ rewrite table สำหรับ constant default) — **ต่างจาก** CHECK constraint (ที่ยังต้องใช้ NOT VALID+VALIDATE เพราะ Postgres ตรวจ CHECK ทุกแถวจริงถ้าจะ VALIDATE, ส่วน default ไม่ต้อง scan)
- **CHECK constraint บน `Product`:** ใช้ NOT VALID+VALIDATE แยก 2 statement เหมือน M00003 (Product มี row จริง)
- **`StockMovement` table ใหม่:** ว่างตอนสร้าง — CHECK constraints ใส่แบบปกติได้เลย ไม่ต้อง NOT VALID
- **CREATE INDEX:** plain (ไม่ CONCURRENTLY) — base ยังเล็ก (ตาม pattern M00003/00001); ถ้า `StockMovement` โตเร็วหลัง launch (เพราะ record-always ทุก order deduct/restock) ต้องพิจารณา partition/archive ในอนาคต (ดู §6)
- **Backward compat:** `Product`/`InventoryEntitlement` ที่ไม่แตะ column ใหม่ ทำงานเหมือนเดิมทุกประการ; shop ที่ไม่มี `InventoryEntitlement` row (`NOT_SUBSCRIBED`) ไม่ถูกกระทบเลย (ดู §7 backward-compat note)

---

## 6. Retention / ข้อควรระวัง

- **Retention — `StockMovement` โตเร็ว:** ต่างจาก `InventoryEntitlement` (1 row/shop) `StockMovement` เป็น **append-only ทุก order deduct/restock/manual-adjust ของทุก shop ที่มี entitlement ACTIVE ไม่ว่า package ใด** (record-always ตาม OD-C) — โตเร็วกว่าตารางอื่นในฟีเจอร์นี้มาก ไม่มี retention/archive job ใน MVP นี้ (Out of Scope ตาม PRD) — **flag เป็น future risk** ถ้า order volume สูงขึ้นมาก (ดู Open Question §8)
- **PII:** ไม่มี PII ใหม่ — `productName`/`note` เป็นข้อมูลธุรกิจ (ชื่อสินค้า/เหตุผลปรับสต็อก) ไม่ใช่ PII; `actorUserId` ชี้ไปที่ seller user เอง (ข้อมูลภายในร้านตัวเอง ไม่ใช่ buyer PII)
- **Performance:** `InventoryEntitlement.package` เช็คพร้อมกับ `status` ในทุก query เดิมที่มีอยู่แล้ว (`select: { status: true, package: true }`) — ไม่เพิ่ม round-trip ใหม่; `StockMovement` insert ต้องอยู่ใน **transaction เดียวกัน** กับ `Product.stockQty` update เสมอ (ทั้ง order-deduct/restock/manual-adjust) เพื่อให้ `resultingQty` ถูกต้อง 100% (ไม่ query แยกหลัง commit — เสี่ยง race กับ concurrent order)
- **Consistency — record-always ต้องไม่มี gap:** ถ้า Basic subscriber (ยังไม่เคยเป็น Pro) มี order deduct เกิดขึ้นระหว่างเป็น Basic แล้วค่อย upgrade เป็น Pro ทีหลัง — `StockMovement` row เหล่านั้น**ต้องมีอยู่ครบ**และโผล่ในหน้า movement history ทันทีที่ upgrade สำเร็จ (ไม่มี "ช่วงที่ขาดหาย") — นี่คือเหตุผลที่ §3.2 ออกแบบไม่ผูก FK กับ entitlement/package ตรง ๆ (gate ที่ query-time ด้วย entitlement ปัจจุบัน ไม่ใช่ snapshot ตอนบันทึก)
- **Untrack ระหว่างมี pending order (สืบทอด M00003):** ถ้า seller เคลียร์ `stockQty` กลับเป็น `NULL` ระหว่างมี order เก่ายังไม่ cancel แล้ว cancel ภายหลัง → `restockFromCancelledOrder` เดิม increment บน NULL = no-op — `StockMovement` **ไม่ควรสร้าง row `ORDER_RESTOCK`** ถ้า no-op จริง (delta=0 ต้องไม่เกิดจาก constraint `delta<>0` ข้างบน) — SRS ต้องระบุชัดว่า service layer skip การ insert `StockMovement` กรณีนี้ (ไม่ใช่ insert row `delta=0` ที่จะชน CHECK constraint)

---

## 7. Backward-compat note (ตอบ requirement §8 ของ prompt)

- **Product ที่ไม่มี inventory (`stockQty IS NULL`, untracked):** ไม่ได้รับผลกระทบใด ๆ — `lowStockThreshold` เป็น nullable แยกอิสระจาก `stockQty`, ไม่มี `StockMovement` row เกิดขึ้นสำหรับสินค้ากลุ่มนี้เลย (`deductStockForOrderItems`/`restockFromCancelledOrder` เดิมกรอง `type==='PHYSICAL' && stockQty!==null` อยู่แล้วก่อนเข้า loop deduct/restock — logic เดิมไม่เปลี่ยน แค่เพิ่ม `StockMovement` insert เข้าไปในสาขาที่ trackable เท่านั้น)
- **Entitlement ที่ไม่ ACTIVE (`NOT_SUBSCRIBED`/`LOCKED`):** ไม่มี Manual Adjustment, ไม่มี Alert, ไม่มี movement-history query ที่ยอมให้ผ่าน (gate ที่ service layer เดิม, สืบทอด `FR-INV-12`/`BR-INV-14` ของ M00003 ทุกประการ) — schema เปลี่ยนไม่กระทบ short-circuit path เดิมเลย
- **Entitlement ACTIVE เดิม (Basic subscriber ก่อน M00009 deploy):** ได้ `package=BASIC` อัตโนมัติทันทีที่ migration apply (backfill-by-default, §3.1/§5.1 step 2) — ไม่มี `WalletTransaction` ใหม่เกิดขึ้นจาก migration เอง (backfill เป็น DDL-level ไม่ผ่าน `deductCredit`) ตรง requirement grandfather (PRD §3.1, BRD FR-DSP-02-AC-01) 100%
- **`WalletTransaction` เดิมของ M00003:** row ที่มี `reason='INVENTORY_SUBSCRIPTION'` (ไม่มี suffix) **ไม่ถูกแตะต้องเลย** — ไม่มี migration UPDATE ใด ๆ ในแผนนี้ (ต่างจาก M00003 ที่มี backfill `reason='SMS_ORDER_LINK'` ให้ row เก่า — รอบนี้ไม่มี backfill สำหรับ `WalletTransaction` เพราะไม่ต้อง "แก้ประวัติ" อะไร ตรง FR-DSP-11-AC-03)

---

## 8. Open Questions สำหรับ SRS

1. **Low-stock alert dedup:** ถ้า stock ยังต่ำกว่า threshold ต่อเนื่องหลายครั้ง (deduct ซ้ำ ๆ) ควรแจ้งเตือนทุกครั้งหรือครั้งเดียวจนกว่าจะกลับมาเกิน threshold? เอกสารนี้**ไม่เพิ่ม field ใหม่** (เช่น `lastLowStockAlertAt`) เพราะ dedup logic ยังไม่ถูกล็อก (OD-E ช่องทางแจ้งเตือนก็ยัง TBD) — ถ้า SRS ตัดสินว่าต้อง dedup แบบ persisted-state จะต้องกลับมาเพิ่ม field ที่ `Product` หรือ table แยก (ไม่ใช่ scope ของรอบนี้)
2. **`StockMovement` retention/archive:** ไม่มี policy ใน MVP — ถ้า order volume โตเร็วมากหลัง launch ต้องพิจารณา partition by `createdAt` หรือ archive job ภายหลัง (ไม่บล็อก MVP)
3. **CSV Import validation:** ไม่มี table ใหม่สำหรับ CSV import job (design ว่าเป็น synchronous batch update ผ่าน `Product.stockQty` + `StockMovement` insert ต่อแถวเหมือน manual adjustment) — ถ้า SRS ต้องการ async job queue/import-history table (เช่น track ว่า import ไหนสำเร็จ/ล้มเหลวกี่แถว) ต้องกลับมาออกแบบ table เพิ่ม (นอก scope ที่ prompt ระบุ #4 "ไม่ต้องมี table ใหม่")
4. **`WalletTransaction.reason` reconciliation** — ดู §3.4 กล่องคำเตือนสีแดง ต้อง confirm ก่อนเข้า SRS

---

## 9. Traceability

| Table / Field | BRD | PRD | สถานะ |
|--------------|-----|-----|-------|
| `InventoryEntitlement.package` + `InventoryPackage` enum | FR-DSP-02, 03, 04, 06, 07, BR-DSP-01, 02, 06, 07, 08, 09 | §4.3, §6.5 Risk | Draft — **FROZEN CONTRACT** |
| `InventoryEntitlement (status, package)` index | KPI Pro MRR/Upgrade Rate | §1.2 | Draft — index design |
| `StockMovement` (ทั้ง table) | FR-DSP-01 (manual adj.), FR-DSP-09 (audit log), OD-C | §3.1, §3.8, §6.5 Risk | Draft — **FROZEN CONTRACT** |
| `Product.lowStockThreshold` | FR-DSP-08 | §3.7 | Draft — **FROZEN CONTRACT** |
| `WalletTransaction.reason`/`description` ค่าใหม่ | FR-DSP-11 | §3.11, §2.4 persona Admin | Draft — **ต้อง confirm reconciliation (§3.4)** ก่อนเข้า SRS |
| Manual Adjustment = reuse `stockQty`+`StockMovement`, ไม่มี table ใหม่ | FR-DSP-01 | §3.1 | Draft |

---

## 10. สรุป (Summary)

Migration หลัก = 1 table ใหม่ (`StockMovement`, append-only audit log) + 1 enum ใหม่บน table เดิม (`InventoryEntitlement.package`, backfill อัตโนมัติผ่าน DEFAULT — ไม่มีแถวตกหล่น) + 1 nullable column ใหม่ (`Product.lowStockThreshold`) + 2 enum ใหม่ (`InventoryPackage`, `StockMovementSource`) + 6 index ใหม่ + CHECK constraints (NOT VALID/VALIDATE pattern บน table ที่มี row จริง) — **ไม่มี DDL change ใด ๆ กับ `WalletTransaction`** (reuse column เดิม 100%, เปลี่ยนแค่ app constant). ทั้งหมด additive — ไม่มี table ใดถูก drop/rename, ไม่มี column เดิมถูกแก้ type/ลบ

**FROZEN CONTRACT สำหรับ SRS/planner (ชื่อห้ามเปลี่ยนไม่ sync กลับมาที่นี่):**
- Enum `InventoryPackage { BASIC, PRO }`, field `InventoryEntitlement.package`
- Model `StockMovement` ทั้งชื่อ table และชื่อ field ทุกตัว (`shopId`, `productId`, `productName`, `delta`, `resultingQty`, `source`, `refId`, `note`, `actorUserId`, `createdAt`), enum `StockMovementSource { ORDER_DEDUCT, ORDER_RESTOCK, MANUAL_ADJUST }`
- Field `Product.lowStockThreshold`
- **ยังไม่ freeze:** ค่า `WalletTransaction.reason`/`description` ใหม่ (§3.4) — รอ Controller/user confirm reconciliation ก่อน

**Open Questions ที่ flag ให้ SRS:** dedup low-stock alert (#1), StockMovement retention (#2), CSV import table (#3), WalletTransaction reason reconciliation (#4) — ดู §8

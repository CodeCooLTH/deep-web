---
title: "DATABASE — Inventory Add-on"
owner: shinobu22
status: draft
module: M00002-InventoryAddon
version: "1.0"
created: 2026-07-01
tags: [feature, inventory, stock, subscription, seller, add-on, database, schema]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]"]
---

> **โมดูล:** M00002-InventoryAddon
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-01
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA/Database Agent (ดู [[Feature-Docs-Ownership]])

# DATABASE: Inventory Add-on

---

## 1. Overview

โมดูล Inventory Add-on (M00002) ต้องการเปลี่ยนแปลง schema ใน **PostgreSQL 16** (Supabase, dev/prod แชร์ตัวเดียวกัน) ผ่าน **Prisma Migrate** เพื่อรองรับ subscription lifecycle (NOT_SUBSCRIBED/ACTIVE/LOCKED) และ stock lifecycle (opt-in track/deduct/restock/hard-stop) ตาม PRD §3-4 + BRD BR-INV-01..14

- **เอกสารออกแบบต้นทาง:** [[PRD]] §3.5-3.9, §9.2 (OD-2) + [[BRD]] FR-INV-01..13, BR-INV-01..14. **หมายเหตุลำดับ:** SRS/SDS ของโมดูลนี้เขียนขนานกับเอกสารนี้ — Controller ส่ง FROZEN CONTRACT (ชื่อ model/field ที่ต้องตรงกับ SRS) มาให้ยึด; `WalletTransaction.reason` เป็น field ใหม่ที่ user ยืนยันเลือกใช้ (2026-07-01) sync กับ SRS แล้ว
- **Store ที่เกี่ยวข้อง:** PostgreSQL 16 host บน Supabase (DB เดียวสำหรับ dev + prod ในปัจจุบัน — ดู memory `project_prisma_migration_env_targets`)
- **ORM:** Prisma (`prisma/schema.prisma`); migration tool = `prisma migrate deploy` (ไม่ใช่ Supabase migration tool)
- **ไม่ใช้ RLS:** authorization อยู่ที่ `src/services/` (NextAuth session + service guard scope-by-shopId) ไม่ใช้ policy ใน DB

### สิ่งที่ต้องเปลี่ยนแปลง (สรุปภาพรวม)

| Model | การเปลี่ยนแปลง | ประเภท |
|-------|----------------|--------|
| `InventoryEntitlement` (ใหม่) | table ใหม่ 1:1 Shop + enum `InventoryEntitlementStatus { ACTIVE, LOCKED }` | New |
| `Shop` | relation field `inventoryEntitlement InventoryEntitlement?` (virtual — ไม่มี DDL, FK อยู่ฝั่ง InventoryEntitlement) | Additive (metadata) |
| `Product` | เพิ่ม `stockQty Int?` (nullable = untracked; ≥0 = tracked) | Additive |
| `OrderItem` | เพิ่ม `stockDeducted Int?` (nullable = ไม่เคยตัด; บันทึกจำนวนที่ตัดจริงเพื่อคืนถูกต้อง) | Additive |
| `WalletTransaction` | เพิ่ม `reason String?` (nullable — label แยกฟีเจอร์ที่หักเครดิต; user ยืนยันเลือกใช้ 2026-07-01) | Additive |

### สิ่งที่ตรวจสอบแล้วว่าไม่ต้องสร้าง table ใหม่/ไม่ต้องแก้เพิ่ม

| ความต้องการ | Derivation |
|-------------|-----------|
| หักเครดิต ฿199/subscribe/renew/reactivate | reuse `SellerWallet` + `wallet.service.deductCredit()` เดิม (มี `tx` param รองรับ compose transaction อยู่แล้ว) — ไม่ต้องสร้าง payment table ใหม่ |
| PHYSICAL-only stock field | เช็คที่ app layer จาก `Product.type === "PHYSICAL"` (field มีอยู่แล้ว) ก่อนแสดง/ยอมรับ `stockQty` — ไม่ต้องมี DB constraint ผูกกับ type (Product.type เป็น String ไม่ใช่ Prisma enum ตาม convention เดิม) |
| Menu gate 3 สถานะ (NOT_SUBSCRIBED/ACTIVE/LOCKED) | derive จาก "มี/ไม่มี row `InventoryEntitlement`" + `status` — ไม่ต้องมี field พิเศษแยก |

---

## 2. ERD

```mermaid
erDiagram
    Shop ||--o| InventoryEntitlement : "subscribes (nullable 1:1)"
    Shop ||--o| SellerWallet : "has"
    Shop ||--o{ Product : "lists"
    Shop ||--o{ Order : "receives"
    SellerWallet ||--o{ WalletTransaction : "records"
    Order ||--o{ OrderItem : "contains"
    Product ||--o{ OrderItem : "referenced by (nullable FK)"

    InventoryEntitlement {
        string id PK "uuid"
        string shopId FK_UK "1 Shop = 1 entitlement; NOT_SUBSCRIBED = ไม่มี row นี้เลย"
        enum status "ACTIVE | LOCKED (default ACTIVE ตอนสร้าง)"
        datetime activatedAt "ครั้งแรกที่ subscribe สำเร็จ — ไม่เปลี่ยนอีก"
        datetime currentPeriodStart "จุดเริ่มรอบปัจจุบัน (subscribe/renew/reactivate ล่าสุด)"
        datetime nextRenewalAt "currentPeriodStart + 30 วัน rolling — renewal job query target"
        datetime lastRenewalAt "nullable; renew/reactivate สำเร็จครั้งล่าสุดหลัง activate แรก"
        datetime lockedAt "nullable; เวลาที่ถูกล็อกครั้งล่าสุด — reset null เมื่อ reactivate"
        datetime createdAt
        datetime updatedAt
    }
    Product {
        string id PK "uuid"
        string shopId FK
        string name
        string type "PHYSICAL default — stock ใช้ได้เฉพาะ type นี้ (app-layer check)"
        int stockQty "NEW nullable; null=untracked(opt-in), >=0=tracked; CHECK>=0"
        decimal price "Decimal(12,2)"
        boolean isActive
    }
    OrderItem {
        string id PK "uuid"
        string orderId FK
        string productId FK "nullable; SetNull ถ้า product ถูกลบ"
        int qty "จำนวนที่สั่งซื้อ"
        int stockDeducted "NEW nullable; จำนวนที่ตัดสต็อกจริงตอนสร้าง order; null=ไม่เคยตัด; CHECK>=0"
    }
    SellerWallet {
        string id PK "uuid"
        string shopId FK_UK
        int balance "CHECK>=0 (RC-3 existing)"
    }
    WalletTransaction {
        string id PK "uuid"
        string walletId FK
        string type "TOPUP | DEDUCT"
        string reason "NEW nullable; SMS_ORDER_LINK | INVENTORY_SUBSCRIPTION — แยก label ให้ Admin (FR-INV-13)"
        int amount
        string refId "nullable; แนะนำ = InventoryEntitlement.id สำหรับ reason=INVENTORY_SUBSCRIPTION"
    }
    Order {
        string id PK "uuid"
        string shopId FK
        string status "PENDING/CANCELLED/... (ไม่เปลี่ยน)"
    }
```

---

## 3. Tables

### 3.1 `InventoryEntitlement` (ใหม่ — PostgreSQL, Supabase)

สิทธิ์การใช้งาน Inventory Add-on ของ 1 Shop (1:1). **NOT_SUBSCRIBED ไม่ใช่ enum value — คือ "ไม่มี row นี้เลย"** ตาม FROZEN CONTRACT ของ Controller/SRS

| Column | Type | Null | Default | Key | หมายเหตุ |
|--------|------|------|---------|-----|---------|
| `id` | `TEXT` | NO | `gen_random_uuid()` | PK | uuid ตาม convention |
| `shopId` | `TEXT` | NO | — | FK, UNIQUE | อ้าง `Shop.id`, `ON DELETE CASCADE` |
| `status` | `InventoryEntitlementStatus` (enum) | NO | `'ACTIVE'` | — | subscribe สำเร็จ = สร้าง row นี้ด้วย status=ACTIVE เสมอ (ไม่มี state เริ่มต้นอื่น) |
| `activatedAt` | `TIMESTAMP(3)` | NO | — | — | ตั้งครั้งเดียวตอน subscribe ครั้งแรก ไม่เปลี่ยนอีกแม้ renew/lock/reactivate |
| `currentPeriodStart` | `TIMESTAMP(3)` | NO | — | — | subscribe/renew สำเร็จ/reactivate สำเร็จ ล่าสุด — ไม่มี proration (BR-INV-01) |
| `nextRenewalAt` | `TIMESTAMP(3)` | NO | — | — | `currentPeriodStart + 30 วัน` — renewal job query target (BR-INV-03: rolling ไม่ใช่ calendar month) |
| `lastRenewalAt` | `TIMESTAMP(3)` | YES | NULL | — | เวลา renew/reactivate สำเร็จ **ครั้งล่าสุดหลัง activate แรก**; NULL = ยังไม่เคย renew/reactivate เลยนับจาก subscribe ครั้งแรก |
| `lockedAt` | `TIMESTAMP(3)` | YES | NULL | — | เวลาที่เปลี่ยนเป็น LOCKED ล่าสุด; **reset เป็น NULL ทันทีที่ reactivate สำเร็จ** (ไม่ใช่ log สะสม — single-slot เหมือน `VerificationRecord.reviewedAt`) |
| `createdAt` | `TIMESTAMP(3)` | NO | `now()` | — | |
| `updatedAt` | `TIMESTAMP(3)` | NO | (auto) | — | `@updatedAt` |

**Semantics สำคัญที่ SRS ต้องยึดตาม (สำหรับ job/service logic):**
- Subscribe ครั้งแรก → **สร้าง row ใหม่**: `activatedAt = currentPeriodStart = now()`, `nextRenewalAt = now() + 30d`, `lastRenewalAt = NULL`, `lockedAt = NULL`, `status = ACTIVE`
- Renewal job สำเร็จ → `currentPeriodStart = now()` (หรือ = เดิม `nextRenewalAt` ถ้าต้องการรอบตรงเป๊ะ — SRS ตัดสินใจ), `nextRenewalAt += 30d`, `lastRenewalAt = now()`, `status` คง ACTIVE
- Renewal job ล้มเหลว (เครดิตไม่พอ) → `status = LOCKED`, `lockedAt = now()`, **ไม่แตะ** `currentPeriodStart`/`nextRenewalAt` (เก็บไว้เป็นหลักฐานว่ารอบไหนที่ fail — SRS อาจใช้ debug/analytics)
- Reactivate สำเร็จ → `status = ACTIVE`, `lockedAt = NULL`, `currentPeriodStart = now()`, `nextRenewalAt = now() + 30d` (รอบใหม่ทันที ไม่ต่อจากรอบเดิม — ตรง FR-INV-06-AC-01), `lastRenewalAt = now()`

### 3.2 `Product` — field ใหม่

| Column | Type | Null | Default | Key | เหตุผล |
|--------|------|------|---------|-----|--------|
| `stockQty` | `INTEGER` | YES | NULL | CHECK, INDEX (composite) | จำนวนสต็อก; **NULL = untracked (opt-in, BR-INV-10), non-NULL ≥0 = tracked**. Backward-compat: row เดิมทุกตัวได้ NULL อัตโนมัติ = untracked = ไม่กระทบ flow เดิมเลย (ตรง BR-INV-14) |

**Design note — ตอบข้อสงสัย PRD §9.2 OD-2 (nullable Int พอไหม หรือต้องมี `stockTracked` boolean แยก):**

PRD assumption เขียนไว้ว่า "กระทบ schema: ต้องมี field แยก 'มีการตั้ง stock หรือยัง' ไม่ใช่แค่ nullable quantity" — ตรวจสอบแล้วสรุปว่า **`stockQty Int?` เพียงพอ ไม่ต้องเพิ่ม `stockTracked Boolean`** เพราะ:
- Nullable Int สร้าง tri-state ที่ตรงกับ business rule เป๊ะอยู่แล้ว: `NULL` = untracked, `0` = tracked-แต่หมด (hard-stop), `N>0` = tracked-มีของ — ไม่มี ambiguity ระหว่าง "ไม่เคยตั้ง" กับ "ตั้งเป็น 0"
- Opt-out (จาก tracked กลับเป็น untracked) ทำได้ตรงไปตรงมาโดย set `stockQty = NULL` กลับ — ไม่มี state ที่ boolean+quantity คู่กันจะแยกแยะได้มากกว่านี้ (isomorphic กับ nullable Int)
- เพิ่ม boolean แยกจะสร้างความเสี่ยง **data inconsistency ใหม่** (เช่น `stockTracked=true` แต่ `stockQty=NULL`, หรือ `stockTracked=false` แต่ `stockQty=5`) ที่ nullable Int เดี่ยวไม่มีทางเกิดโดยธรรมชาติ (single source of truth)
- ตรง FROZEN CONTRACT ที่ SRS ล็อกไว้แล้ว (`Product.stockQty Int?`) — ไม่ต้องเปลี่ยน ไม่ต้อง sync SRS ใหม่

**สรุป: ยืนยัน nullable Int ตามที่ Controller/SRS ล็อกไว้ถูกต้องแล้ว** (user รับทราบ 2026-07-01)

### 3.3 `OrderItem` — field ใหม่

| Column | Type | Null | Default | Key | เหตุผล |
|--------|------|------|---------|-----|--------|
| `stockDeducted` | `INTEGER` | YES | NULL | CHECK | จำนวนที่ตัดสต็อกจริงตอนสร้าง order (เท่ากับ `qty` เสมอเพราะ all-or-nothing BR-INV-11 — ไม่มี partial); **NULL = ไม่เคยตัด** (สินค้า untracked หรือ entitlement ไม่ ACTIVE ตอนสร้าง order นั้น). ใช้คืนสต็อกถูกต้องตอน cancel (BR-INV-12) — คืนตาม "ประวัติจริงของ order นี้" ไม่ใช่ตาม entitlement ปัจจุบัน |

### 3.4 `WalletTransaction` — field ใหม่ (user ยืนยัน 2026-07-01)

| Column | Type | Null | Default | Key | เหตุผล |
|--------|------|------|---------|-----|--------|
| `reason` | `TEXT` | YES | NULL | INDEX | String ตาม convention เดิมของ project (`type`/`Order.status` เป็น String ไม่ใช่ Prisma enum — คงความเหมือนกัน) ค่า: `"SMS_ORDER_LINK"` (SMS Order Link feature เดิม), `"INVENTORY_SUBSCRIPTION"` (feature นี้). Nullable กัน break row เก่า |

**เหตุผลที่เพิ่ม field นี้แทนใช้ `description` (free text) ที่มีอยู่แล้ว:** `description` เป็น human-readable text (เช่น `"ส่ง SMS order XYZ"`) ไม่เหมาะให้ Admin filter แบบ structured/reliable (เสี่ยง string-parse พังถ้า copy เปลี่ยน, ไม่รองรับ i18n ในอนาคต) — `reason` เป็น machine-filterable key แยกจาก `description` ที่ยังคงไว้สำหรับแสดงผล มนุษย์อ่าน ตรง FR-INV-13-AC-01 (Admin เห็น label ชัดเจนแยกจาก SMS) แบบยั่งยืนกว่า

**ผลกระทบต่อ `wallet.service.deductCredit()` (sync กับ SRS):** signature ปัจจุบัน `deductCredit(shopId, amount, refId, description, tx)` **ไม่มี parameter `reason`** — ต้องเพิ่ม parameter ใหม่ + แก้ SMS call-site เดิม (`send-sms/route.ts`) ให้ส่ง `reason: "SMS_ORDER_LINK"` ด้วยเพื่อความสม่ำเสมอ. SRS §7.2 + TFR-013 ปรับให้สอดคล้องแล้ว (developer ต้องแก้ `wallet.service.ts` ใน Phase implement — breaking เล็กน้อยต่อ SMS)

**`refId` guidance (ไม่ใช่ DB requirement แค่ convention แนะนำสำหรับ service layer):** สำหรับ `reason="INVENTORY_SUBSCRIPTION"` แนะนำ `refId = InventoryEntitlement.id` (เหมือนที่ SMS ใช้ `refId = orderId`/`SmsCode.id`) เพื่อ trace กลับ entitlement ที่เกี่ยวข้องได้

---

## 4. Indexes

| Table | Columns | Type | Rationale (query pattern ที่รองรับ) |
|-------|---------|------|--------------------------------------|
| `InventoryEntitlement` | `shopId` | UNIQUE | 1:1 Shop + PK lookup ทุกครั้งที่เช็ค entitlement (hot path — ทุก order/product mutation ของ shop ที่มี entitlement) |
| `InventoryEntitlement` | `(status, nextRenewalAt)` | BTREE composite | renewal job (`status='ACTIVE' AND nextRenewalAt<=now()`) + advance-warning job (`status='ACTIVE' AND nextRenewalAt BETWEEN now() AND now()+interval '3 days'`) — leading equality column `status` ทำให้ทั้งสอง query pattern ใช้ index เดียวกันได้ |
| `Product` | `(shopId, stockQty)` | BTREE composite | หน้า Inventory list (FR-INV-08) — filter/sort สินค้า tracked ของ shop |
| `WalletTransaction` | `reason` | BTREE | Admin filter รายการ Inventory แยกจาก SMS (FR-INV-13); ใช้คู่กับ `(walletId, createdAt)` เดิมสำหรับ per-shop history |

**หมายเหตุ — ไม่ใช้ GIN:** ไม่มี array/JSON field ใหม่ในฟีเจอร์นี้ (ต่างจาก 00001 ที่ต้อง GIN สำหรับ `categories`/`salesChannels`) — ทุก index เป็น BTREE ปกติ

---

## 5. Migration Plan

### 5.1 ลำดับ (รวมเป็น migration เดียว `add_inventory_addon_schema`)

| ลำดับ | การเปลี่ยนแปลง | หมายเหตุ |
|-------|----------------|---------|
| 1 | `CREATE TYPE "InventoryEntitlementStatus" AS ENUM ('ACTIVE', 'LOCKED')` | new enum |
| 2 | `CREATE TABLE "InventoryEntitlement"` (ทุก column ตาม §3.1) | new table, ไม่กระทบ row เดิม |
| 3 | `CREATE UNIQUE INDEX` shopId + `CREATE INDEX` (status, nextRenewalAt) | บน table ใหม่ (ว่าง) — ไม่ lock อะไร |
| 4 | `ALTER TABLE "InventoryEntitlement" ADD CONSTRAINT ... FOREIGN KEY (shopId) REFERENCES "Shop"(id) ON DELETE CASCADE` | |
| 5 | `ALTER TABLE "Product" ADD COLUMN "stockQty" INTEGER` (nullable, ไม่มี default = NULL อัตโนมัติ) | additive, metadata-only, row เดิมได้ NULL = untracked |
| 6 | `CREATE INDEX "Product_shopId_stockQty_idx"` | Product มี row จริงบน prod — plain `CREATE INDEX` (ไม่ CONCURRENTLY เพราะ base ยังเล็ก ตามที่ 00001 ทำ) |
| 7 | `ALTER TABLE "Product" ADD CONSTRAINT "Product_stockQty_nonneg" CHECK (...) NOT VALID` แล้ว `VALIDATE CONSTRAINT` แยก statement | **สำคัญ:** ต่างจาก `SellerWallet_balance_nonneg` เดิม (table ว่างตอนสร้าง) — Product มี row จริงแล้ว ใช้ NOT VALID+VALIDATE กัน ACCESS EXCLUSIVE lock ยาว |
| 8 | `ALTER TABLE "OrderItem" ADD COLUMN "stockDeducted" INTEGER` (nullable) | additive |
| 9 | `ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_stockDeducted_nonneg" CHECK (...) NOT VALID` + `VALIDATE CONSTRAINT` | เหตุผลเดียวกับข้อ 7 |
| 10 | `ALTER TABLE "WalletTransaction" ADD COLUMN "reason" TEXT` (nullable) | additive |
| 11 | `CREATE INDEX "WalletTransaction_reason_idx"` | |
| 12 | Backfill (optional แต่แนะนำ): `UPDATE "WalletTransaction" SET "reason"='SMS_ORDER_LINK' WHERE "type"='DEDUCT' AND "reason" IS NULL` | ปลอดภัย 100% เพราะก่อน M00002 ไม่มี DEDUCT reason อื่นในระบบเลย (SMS Order Link เป็น paid-deduct feature เดียวที่มีอยู่ก่อนหน้า) |

### 5.2 Migration SQL (ร่าง)

```sql
-- Migration: add_inventory_addon_schema | Feature: M00002-InventoryAddon | 2026-07-01
-- SAFETY: additive only ทุก column ใหม่ nullable, table ใหม่ไม่กระทบ table เดิม
-- Product/OrderItem มี row จริงบน prod แล้ว (ต่างจาก SellerWallet ตอนสร้าง) → ใช้ NOT VALID + VALIDATE CONSTRAINT
-- ROLLBACK: ดูตาราง §5.4 ของ DATABASE.md — Product.stockQty/OrderItem.stockDeducted rollback = DATA LOSS

-- 1) Enum + table ใหม่
CREATE TYPE "InventoryEntitlementStatus" AS ENUM ('ACTIVE', 'LOCKED');

CREATE TABLE "InventoryEntitlement" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "InventoryEntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "nextRenewalAt" TIMESTAMP(3) NOT NULL,
    "lastRenewalAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryEntitlement_shopId_key" ON "InventoryEntitlement"("shopId");
CREATE INDEX "InventoryEntitlement_status_nextRenewalAt_idx" ON "InventoryEntitlement"("status", "nextRenewalAt");

ALTER TABLE "InventoryEntitlement" ADD CONSTRAINT "InventoryEntitlement_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Product.stockQty
ALTER TABLE "Product" ADD COLUMN "stockQty" INTEGER;
CREATE INDEX "Product_shopId_stockQty_idx" ON "Product"("shopId", "stockQty");

-- NOT VALID ก่อน (fast, ไม่สแกน) แล้ว VALIDATE แยก (SHARE UPDATE EXCLUSIVE, ไม่บล็อก write) — Product มี row จริงบน prod
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockQty_nonneg"
    CHECK ("stockQty" IS NULL OR "stockQty" >= 0) NOT VALID;
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_stockQty_nonneg";

-- 3) OrderItem.stockDeducted
ALTER TABLE "OrderItem" ADD COLUMN "stockDeducted" INTEGER;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_stockDeducted_nonneg"
    CHECK ("stockDeducted" IS NULL OR "stockDeducted" >= 0) NOT VALID;
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_stockDeducted_nonneg";

-- 4) WalletTransaction.reason
ALTER TABLE "WalletTransaction" ADD COLUMN "reason" TEXT;
CREATE INDEX "WalletTransaction_reason_idx" ON "WalletTransaction"("reason");

-- 5) Backfill (optional แต่แนะนำ — ปลอดภัยเพราะก่อนหน้านี้ DEDUCT มาจาก SMS Order Link เท่านั้น)
UPDATE "WalletTransaction" SET "reason" = 'SMS_ORDER_LINK' WHERE "type" = 'DEDUCT' AND "reason" IS NULL;
```

### 5.3 วิธี Apply (ยังไม่รัน — รอ Controller ยืนยัน)

```bash
npx prisma generate
npx prisma validate
# prod = dev Supabase แชร์กัน — ขอ user ยืนยันก่อนทุกครั้ง (.env.local = Supabase)
npx prisma migrate deploy --schema prisma/schema.prisma
```
ดู memory `project_prisma_migration_env_targets` (.env.local = Supabase dev/prod แชร์; .env = Docker ไม่มี DIRECT_URL ใช้ migrate ไม่ได้)

**🛑 งานออกแบบนี้ยังไม่ apply จริง / ยังไม่รัน `prisma migrate dev` / ยังไม่แก้ `prisma/schema.prisma`** — apply เมื่อ Controller/user ยืนยันในขั้น implement

### 5.4 Rollback

| Migration step | Rollback | ผลกระทบ |
|-----------------|----------|---------|
| `CREATE TABLE InventoryEntitlement` + enum | `DROP TABLE "InventoryEntitlement"; DROP TYPE "InventoryEntitlementStatus";` | ปลอดภัยถ้า rollback ก่อนมี shop subscribe จริง — ถ้ามีแล้ว shop ทุกร้านสูญสถานะ entitlement (กลับเป็น NOT_SUBSCRIBED โดยไม่ได้ตั้งใจ) แต่ `Product.stockQty`/`OrderItem.stockDeducted` **ไม่หาย** (คนละ column) |
| `Product.stockQty` ADD COLUMN | `DROP COLUMN "stockQty"` | ⚠️ **data loss จริง** — จำนวนสต็อกทุกตัวที่ seller กรอกไว้หายทั้งหมด ปลอดภัยเฉพาะ rollback ทันทีหลัง apply (ก่อนมี data จริง) |
| `OrderItem.stockDeducted` ADD COLUMN | `DROP COLUMN "stockDeducted"` | ⚠️ เสีย record ว่า order-item ไหนเคยตัดสต็อกไปเท่าไร — order ที่ pending cancel จะคืนสต็อกไม่ถูกต้องถ้า field หายไป |
| `WalletTransaction.reason` ADD COLUMN | `DROP COLUMN "reason"` | ต่ำสุด — เสียแค่ label ไม่กระทบ balance/ledger integrity |
| CHECK constraints | `DROP CONSTRAINT ...` | ไม่มี data loss |
| Indexes | `DROP INDEX ...` | ไม่มี data loss, กระทบ performance เท่านั้น |

Rollback ทันทีหลัง apply (ก่อนมี data ใหม่) = ปลอดภัยสมบูรณ์ทุก step; rollback หลัง launch (มี seller subscribe/ตั้งสต็อกจริง) ต้องพิจารณา data export ก่อน โดยเฉพาะ `Product.stockQty`/`OrderItem.stockDeducted`

### 5.5 ผลกระทบ

- **Downtime:** ไม่มี — `ADD COLUMN` nullable = metadata-only ใน PG16; `CREATE TABLE` บน table ใหม่ไม่กระทบใคร
- **CHECK constraint บน table ที่มี row จริง:** ใช้ `NOT VALID` + `VALIDATE CONSTRAINT` แยก 2 statement (ดู §5.2) เพื่อลด lock — ต่างจาก `SellerWallet_balance_nonneg` เดิมที่ apply ตอน table ว่าง (ไม่ต้องระวังจุดนี้)
- **CREATE INDEX:** plain (ไม่ CONCURRENTLY) — base เล็ก (prod เพิ่ง live ตั้งแต่ 2026-06-07) ตาม pattern เดียวกับ 00001; ถ้า base โตมากก่อนฟีเจอร์นี้ deploy ต้องพิจารณา CONCURRENTLY (แยก transaction, Prisma ไม่ wrap ให้อัตโนมัติ — ต้องรันแยกนอก `migrate deploy` ปกติ)
- **Backfill UPDATE (WalletTransaction.reason):** เร็ว (base เล็ก) และปลอดภัย (SMS Order Link เป็น DEDUCT source เดียวก่อนหน้า)
- **Backward compat:** `Product`/`OrderItem`/`WalletTransaction` ที่ไม่แตะ column ใหม่ ทำงานเหมือนเดิมทุกประการ; shop ที่ไม่มี `InventoryEntitlement` row = ไม่มีการ query stock check ใด ๆ (ตาม design ที่ SRS ต้องเช็ค `findUnique` ก่อนเสมอ แล้ว short-circuit ถ้าไม่มี row)

---

## 6. Retention / ข้อควรระวัง

- **Retention:** `InventoryEntitlement` เป็น core subscription record ไม่มี retention/archive job — คงอยู่ตลอดอายุ Shop (CASCADE ลบพร้อม Shop ถ้า Shop ถูกลบ)
- **PII:** ไม่มี field PII ใหม่ในฟีเจอร์นี้ — `Product.stockQty`/`OrderItem.stockDeducted` เป็นตัวเลขธุรกิจ ไม่ใช่ข้อมูลส่วนบุคคล; `WalletTransaction.reason` เป็น enum-like label ไม่ใช่ PII
- **Performance:** `InventoryEntitlement` เช็คทุกครั้งที่สร้าง/แก้ order-product ของทุก shop — ต้อง `select: { status: true }` เท่านั้น ห้ามดึงทั้ง row โดยไม่จำเป็น (hot path); `Product.stockQty` update เป็น atomic conditional (RC-3) ต้องอยู่ใน transaction เดียวกับการสร้าง order/OrderItem เสมอ (ไม่ใช่ query แยก)
- **Consistency ข้าม transaction:** stock deduction (Product) + order/orderItem creation + wallet entitlement check ต้องอยู่ใน **`prisma.$transaction` เดียวกัน** เพื่อ all-or-nothing (BR-INV-11) — reuse `deductCredit(..., tx)` ที่มี `tx` param รองรับอยู่แล้วสำหรับ renewal job (deduct + entitlement advance ต้องเป็น atomic คู่กัน ไม่ใช่แค่ deduct ฝั่งเดียว — ดู Risk #1 ด้านล่าง)
- **Race — renewal job:** `deductCredit` มี conditional-update guard (RC-3) ที่ `SellerWallet.balance` แต่การ advance `InventoryEntitlement.nextRenewalAt`/`currentPeriodStart` **ไม่มี guard เดียวกัน** โดยธรรมชาติ — ถ้า job รันซ้ำ/overlap (serverless retry) สำหรับ shop เดียวกันในช่วงเวลาเดียวกัน อาจหักเครดิตซ้ำก่อนที่ `nextRenewalAt` จะขยับพ้นช่วงที่ query — **SRS ออกแบบ entitlement-advance step ด้วย conditional `updateMany` (guard บน snapshot `nextRenewalAt` เดิม) ในธุรกรรมเดียวกับ `deductCredit` แล้ว** (SRS TFR-002) เพื่อให้ idempotent จริง (ตรง FR-INV-02-AC-04)
- **Untrack ระหว่างมี pending order:** ถ้า seller เคลียร์ `stockQty` กลับเป็น `NULL` ระหว่างที่มี order เก่ายังไม่ cancel แล้ว order นั้นถูก cancel ภายหลัง → `increment` บน NULL column ให้ผล NULL (ไม่ error, ไม่ restock อะไร) — behavior ที่ยอมรับได้แต่ควรระบุใน SRS ชัดเจนว่าเป็น expected behavior ไม่ใช่ bug

---

## 7. Traceability

| Table / Field | BRD | PRD | สถานะ |
|--------------|-----|-----|-------|
| `InventoryEntitlement` (ทั้ง table) | FR-INV-01, 02, 04, 05, 06, BR-INV-01..08 | §3.1-3.4, §4.3 | Draft — **FROZEN CONTRACT ตรง Controller/SRS** |
| `InventoryEntitlement.status` enum | FR-INV-07 (menu gate) | §4.3 | Draft |
| `InventoryEntitlement.(status, nextRenewalAt)` index | FR-INV-02 (renewal job), FR-INV-03 (advance warning) | §3.3 | Draft — index design |
| `Product.stockQty` | FR-INV-08, BR-INV-09, BR-INV-10 | §3.5, §9.2 OD-2 | Draft — **FROZEN CONTRACT** ยืนยันไม่ต้องเพิ่ม boolean flag (ดู §3.2 design note) |
| `OrderItem.stockDeducted` | FR-INV-09-AC-05, FR-INV-10, BR-INV-11, BR-INV-12 | §3.6, §3.7, §6.2 (risk) | Draft — **FROZEN CONTRACT** |
| `WalletTransaction.reason` | FR-INV-13 | §2.3 persona Admin | Draft — user ยืนยันเลือกใช้ field ใหม่ 2026-07-01; sync SRS (deductCredit signature) แล้ว |
| Atomic conditional-update (RC-3 pattern reuse) | BR-INV-11 (all-or-nothing), FR-INV-09-AC-03 (concurrent) | §3.6, §6.2 | Draft — reuse `wallet.service.deductCredit` `tx` param pattern; SRS ออกแบบ entitlement-advance guard เพิ่ม (SRS TFR-002) |

---

## 8. สรุป (Summary)

Migration หลัก = สร้าง table ใหม่ `InventoryEntitlement` (1:1 Shop, enum status ACTIVE/LOCKED) + เพิ่ม 3 nullable column (`Product.stockQty`, `OrderItem.stockDeducted`, `WalletTransaction.reason`) + CHECK constraints (RC-3 pattern, ใช้ NOT VALID/VALIDATE เพราะ table มีข้อมูลจริงแล้ว) + 4 index ใหม่ (1 unique, 3 btree). ทั้งหมด additive/nullable — ไม่กระทบ row เดิมบน prod แม้แต่ตัวเดียว. ไม่มี table ใดถูก drop/rename

**Sync กับ SRS (ยืนยัน 2026-07-01):**
- `WalletTransaction.reason` = field ใหม่ (user เลือก structured field แทน description reuse) → SRS TFR-013 + `deductCredit()` signature ปรับให้รับ `reason` param แล้ว (แก้ SMS call-site เดิมด้วยใน Phase implement)
- Renewal-job atomicity: SRS TFR-002 wrap `deductCredit` + `InventoryEntitlement` advance ในธุรกรรมเดียว + conditional guard ที่ entitlement เอง (ตอบ Risk #1)

**Risks ที่ flag ให้ SRS แล้ว (SRS จัดการครบ):**
1. Renewal race (advance guard) → SRS TFR-002 ✅
2. Untrack ระหว่าง pending order → increment บน NULL = no-op (expected behavior, SRS ระบุ)
3. Product ถูกลบก่อน cancel (`OrderItem.productId` SetNull) → SRS TFR-010 skip+log ✅
4. `stockDeducted = qty` เสมอ (all-or-nothing, ไม่มี partial ใน MVP)

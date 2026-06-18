---
title: "DATABASE — Login & Onboarding"
owner: shinobu22
status: draft
module: M00001-LoginOnboarding
version: "1.0"
created: 2026-06-18
tags: [feature, login, onboarding, seller, auth, database, schema]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]"]
---

> **โมดูล:** M00001-LoginOnboarding
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-06-18
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA/Database Agent (ดู [[Feature-Docs-Ownership]])

# DATABASE: Login & Onboarding

---

## 1. Overview

โมดูล Login & Onboarding (M00001) ต้องการเปลี่ยนแปลง schema ใน **PostgreSQL 16** (Supabase) ผ่าน **Prisma Migrate** เพื่อรองรับความสามารถใหม่ที่ BRD กำหนด ได้แก่ multi-category ≤5, ช่องทางการขาย (salesChannels), และพิกัดแผนที่ (latitude/longitude)

- **เอกสารออกแบบต้นทาง:** [[PRD]] §3, §10.3 (Resolved Decisions) + [[BRD]] FR-LO-07 ถึง FR-LO-13 + [[SRS]] §5
- **Store ที่เกี่ยวข้อง:** PostgreSQL 16 ที่ host บน Supabase (DB เดียวสำหรับ dev + prod ในปัจจุบัน)
- **ORM:** Prisma (schema อยู่ที่ `prisma/schema.prisma`); migration tool = `prisma migrate deploy`
- **ไม่ใช้ RLS:** authorization อยู่ที่ `src/services/` (NextAuth session + service guard) ไม่ใช้ policy ใน DB

### สิ่งที่ต้องเปลี่ยนแปลง (สรุปภาพรวม)

| Model | การเปลี่ยนแปลง | ประเภท |
|-------|---------------|--------|
| `Shop` | `category String?` → เพิ่ม `categories String[]` (multi-category ≤5) | Additive + Backfill |
| `Shop` | เพิ่ม `salesChannels String[]` | Additive |
| `Shop` | เพิ่ม `latitude Float?` + `longitude Float?` | Additive |
| `Badge` | ยืนยันว่า row "ปี 2026" (SIGNUP_YEAR) มีอยู่แล้วใน seed — **ไม่ต้อง migrate schema** (พิจารณา rename) | Seed-only |
| `Product` | `description`/`images`/`type`/`price` มีครบ — ขาดแค่ `sku` (Open Q) | Optional Additive |

### สิ่งที่ตรวจสอบแล้วว่าไม่ต้องสร้าง table ใหม่

Checklist item ทุกข้อใน BRD FR-LO-13 derive ได้จาก field ที่มีอยู่หรือที่เพิ่มในการ migrate นี้:

| Checklist Item | Derivation |
|---------------|-----------|
| URL ร้าน (Slug) | `Shop.slug IS NOT NULL` — มีอยู่แล้ว (migration `20260616...`) |
| ช่องทางการขาย | `array_length(Shop.salesChannels) >= 1` — **field ใหม่** |
| หมวดหมู่ | `array_length(Shop.categories) >= 1` — **field ใหม่** |
| ที่อยู่ | `Shop.address IS NOT NULL AND address != ''` — มีอยู่แล้ว |
| ปักพิกัด | `Shop.latitude IS NOT NULL` — **field ใหม่** |
| สร้างสินค้าแรก | `COUNT(Product WHERE shopId = shop.id) >= 1` — relation ที่มีอยู่ |

---

## 2. ERD

```mermaid
erDiagram
    User ||--o{ AuthAccount : "has"
    User ||--o| Shop : "owns"
    User ||--o{ VerificationRecord : "has"
    User ||--o{ UserBadge : "earns"
    Shop ||--o{ Product : "lists"
    Badge ||--o{ UserBadge : "awarded via"

    User {
        string id PK "uuid"
        string username UK
        string phone UK "nullable; immutable after set"
        string email UK "nullable"
        boolean isShop
        boolean isAdmin
        string passwordHash "nullable; bcrypt"
        datetime createdAt
    }
    Shop {
        string id PK "uuid"
        string userId FK_UK
        string shopName
        string category "nullable; LEGACY single — ไม่ drop"
        string_array categories "NEW: multi ≤5; GIN index"
        string_array salesChannels "NEW: enum-like; GIN index"
        string slug UK "nullable จนกว่า onboarding ผ่าน"
        string address "nullable"
        float latitude "NEW: nullable"
        float longitude "NEW: nullable"
        string businessType
    }
    VerificationRecord {
        string id PK "uuid"
        string userId FK
        string type "PHONE_OTP / DOCUMENT / BUSINESS"
        int level "1/2/3"
        string status "PENDING/APPROVED/REJECTED"
    }
    Product {
        string id PK "uuid"
        string shopId FK
        string name
        string description "nullable; TEXT"
        decimal price "Decimal(12,2)"
        json images "default []; ≤5 enforce app layer"
        string sku "NEW nullable (Open Q)"
        string type "PHYSICAL default"
        boolean isActive
    }
    Badge {
        string id PK "uuid"
        string name "ชื่อไทย"
        string nameEN UK
        string type "ACHIEVEMENT/VERIFICATION"
        json criteria "{ type SIGNUP_YEAR, year 2026 }"
        string audience "SELLER/BUYER/ANY"
    }
    UserBadge {
        string id PK "uuid"
        string userId FK
        string badgeId FK
        datetime earnedAt
    }
```

---

## 3. Tables

### 3.1 `Shop` — Field ที่มีอยู่แล้ว (ไม่เปลี่ยน)

| Column | Type | Null | Default | Key | หมายเหตุ |
|--------|------|------|---------|-----|---------|
| `id` | `TEXT` | NO | `gen_random_uuid()` | PK | uuid |
| `userId` | `TEXT` | NO | — | FK, UNIQUE | อ้าง `User.id` |
| `shopName` | `TEXT` | NO | — | — | |
| `category` | `TEXT` | YES | NULL | — | **LEGACY** single-value; คงไว้ตลอด migration นี้ |
| `slug` | `TEXT` | YES | NULL | UNIQUE | proxy gate ตรวจ |
| `address` | `TEXT` | YES | NULL | — | |
| `businessType` | `TEXT` | NO | `'INDIVIDUAL'` | — | |

### 3.2 `Shop` — Field ใหม่ (migration นี้)

| Column | Type | Null | Default | Key | เหตุผล |
|--------|------|------|---------|-----|--------|
| `categories` | `TEXT[]` | NO | `'{}'` | GIN | Multi-category ≤5 (OD-4, FR-LO-08); `category` เดิมคงไว้ (backfill ก่อน drop เฟสถัดไป) |
| `salesChannels` | `TEXT[]` | NO | `'{}'` | GIN | ช่องทางการขาย (FR-LO-07); enum-like `facebook/offline/line/tiktok_shop/lazada/shopee`; validate app layer |
| `latitude` | `DOUBLE PRECISION` | YES | NULL | — | พิกัด (FR-LO-09, OD-1); validate range app layer (ไทย 5-21) |
| `longitude` | `DOUBLE PRECISION` | YES | NULL | — | พิกัด (FR-LO-09); validate range app layer (ไทย 97-106) |

### 3.3 `Badge` — ไม่เปลี่ยน schema (พิจารณา rename seed)

ตรวจแล้ว `prisma/badge-seed-data.ts` มี row SIGNUP_YEAR 2026 อยู่แล้ว:
`{ name: "ปี 2026", nameEN: "2026_BADGE", type: ACHIEVEMENT, audience: ANY, criteria: { type: "SIGNUP_YEAR", year: 2026 }, imageUrl: "/images/badges/deep-2026.svg" }`

ชื่อ "ปี 2026" ไม่ตรง PRD §10.3 OD-3 ("สมาชิกผู้ก่อตั้ง 2026"):
- **ตัวเลือก A (แนะนำ):** อัปเดต `name` = "สมาชิกผู้ก่อตั้ง 2026" ใน seed + upsert (ไม่ migrate schema)
- **ตัวเลือก B:** คง "ปี 2026", แก้เฉพาะ UI copy ใน Summary

`evaluateSignupYearBadge` ดึง `criteria.year` จาก DB ไม่ใช่ชื่อ — ทั้งสองตัวเลือก evaluate ถูก (UX copy เท่านั้น). field ที่ engine ต้องการ: `User.createdAt` (มีอยู่; engine ดึงเอง ไม่รับ argument จาก caller = กัน inject year ปลอม)

### 3.4 `Product` — field มีครบ ยกเว้น SKU

| Field BRD ต้องการ | สถานะ schema ปัจจุบัน |
|----------------|------------------------|
| `name` | มี — `String NOT NULL` |
| `description` | มี — `String? @db.Text` |
| `price` | มี — `Decimal @db.Decimal(12,2)` |
| `images` | มี — `Json @default("[]")` |
| `type` default PHYSICAL | มี — `String @default("PHYSICAL")` |
| **SKU** | **ไม่มี** — Open Question |

**Open Q SKU:** เพิ่ม `sku String?` (recommend — query/filter ได้) หรือเก็บใน `attributes Json` (ไม่มี index). ถ้าอนุมัติ → include ใน migration เดียวกัน (additive nullable ไม่ต้อง backfill)

---

## 4. Indexes

| Table | Columns | Type | Rationale |
|-------|---------|------|-----------|
| `Shop` | `categories` | GIN | `@> ARRAY['fashion']` filter ร้านตามหมวด (analytics/search) |
| `Shop` | `salesChannels` | GIN | `@> ARRAY['facebook']` analytics ช่องทาง |
| `Shop` | `latitude, longitude` | BTREE composite | geo-proximity Phase 2 — **ยังไม่สร้างเฟสนี้** |
| `Shop` | `slug` | UNIQUE | มีอยู่แล้ว |
| `Shop` | `userId` | UNIQUE | มีอยู่แล้ว |

**GIN + Prisma:** Prisma ไม่ generate GIN ผ่าน `@@index` สำหรับ `String[]` — ต้องเพิ่ม SQL ในไฟล์ migration ด้วยมือ:
```sql
CREATE INDEX "Shop_categories_gin_idx" ON "Shop" USING GIN ("categories");
CREATE INDEX "Shop_salesChannels_gin_idx" ON "Shop" USING GIN ("salesChannels");
```

---

## 5. Migration Plan

### 5.1 ลำดับ (รวมเป็น migration เดียว `add_shop_onboarding_fields`)

| ลำดับ | การเปลี่ยนแปลง | หมายเหตุ |
|-------|---------------|---------|
| 1 | `Shop.categories TEXT[] NOT NULL DEFAULT '{}'` | additive; default ทำให้ row เดิมได้ empty array |
| 2 | `Shop.salesChannels TEXT[] NOT NULL DEFAULT '{}'` | additive |
| 3 | `Shop.latitude DOUBLE PRECISION` nullable | additive |
| 4 | `Shop.longitude DOUBLE PRECISION` nullable | additive |
| 5 | GIN index บน categories + salesChannels | SQL ด้วยมือ; PostgreSQL 16 |
| 6 | Backfill `categories` จาก `category` | `UPDATE "Shop" SET categories = ARRAY[category] WHERE category IS NOT NULL`; ไม่แตะ `category` |
| 7 | (Optional) `Product.sku TEXT` nullable | ถ้า Controller อนุมัติ; additive |

### 5.2 Migration SQL (ร่าง)

```sql
-- Migration: add_shop_onboarding_fields | Feature: M00001-LoginOnboarding | 2026-06-18
-- SAFETY: additive only (ไม่มี DROP / ALTER column เดิม)
--   categories/salesChannels DEFAULT '{}' → row เดิมได้ empty array ทันที
--   latitude/longitude nullable → row เดิมได้ NULL
-- ROLLBACK: DROP COLUMN ทีละตัว (data loss เฉพาะข้อมูลใหม่หลัง apply); category เดิมยังอยู่

ALTER TABLE "Shop" ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Shop" ADD COLUMN "salesChannels" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Shop" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Shop" ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE INDEX "Shop_categories_gin_idx" ON "Shop" USING GIN ("categories");
CREATE INDEX "Shop_salesChannels_gin_idx" ON "Shop" USING GIN ("salesChannels");

-- Backfill: category (string เดี่ยว) → categories array; ไม่ DROP category ในเฟสนี้
UPDATE "Shop" SET "categories" = ARRAY["category"] WHERE "category" IS NOT NULL;
```

### 5.3 วิธี Apply

```bash
npx prisma generate
npx prisma validate
# prod = dev Supabase แชร์กัน — ขอ user ยืนยันก่อนทุกครั้ง (.env.local = Supabase)
npx prisma migrate deploy --schema prisma/schema.prisma
```
ดู memory `project_prisma_migration_env_targets` (.env.local = Supabase dev/prod แชร์; .env = Docker ไม่มี DIRECT_URL)

### 5.4 Rollback

| Migration | Rollback | ผลกระทบ |
|-----------|----------|---------|
| ADD COLUMN categories | `DROP COLUMN "categories"` | สูญข้อมูล multi-category ที่กรอกหลัง migrate |
| ADD COLUMN salesChannels | `DROP COLUMN "salesChannels"` | สูญข้อมูล channels |
| ADD lat/lng | `DROP COLUMN "latitude"/"longitude"` | สูญพิกัด |
| GIN index | `DROP INDEX ...` | ไม่กระทบ data |
| Backfill | กู้ไม่ได้ แต่ `category` เดิมยังอยู่ → re-derive ได้ | — |

Rollback ทันทีหลัง apply (ก่อนมี data ใหม่) = ปลอดภัยสมบูรณ์

### 5.5 ผลกระทบ

- **Downtime:** ไม่มี — `ADD COLUMN` PostgreSQL 16 = metadata change ไม่ lock
- **GIN build:** `CREATE INDEX` อาจ lock สั้นถ้า Shop ใหญ่ → ใช้ `CREATE INDEX CONCURRENTLY` (outside transaction) ถ้า base ใหญ่; ปัจจุบัน base เล็ก
- **Backfill UPDATE:** เร็ว (base เล็ก)
- **Backward compat:** code ที่อ่าน `Shop.category` ยังทำงาน; code ใหม่อ่าน `categories`

---

## 6. Retention / ข้อควรระวัง

- **Retention:** `Shop` เป็น core record ไม่มี retention; `latitude/longitude` = business location (public ได้ ไม่ใช่ PII ตาม PDPA)
- **PII:** lat/lng ระบุตำแหน่งร้าน — แสดง Buyer ได้ แต่ API ไม่ควรรั่วพิกัดแม่นเกินไป (round 4 ทศนิยม ~10m พอ)
- **Performance:** `categories`/`salesChannels` ใช้ GIN + `@>` query; หลีกเลี่ยง `= ANY` ไม่มี index; ห้าม `SELECT *` ในหน้า list
- **Consistency:** `category` (legacy) vs `categories` (ใหม่) อาจ drift — audit code path ที่ write `category` → migrate ไป `categories` ก่อน DROP เฟสถัดไป; SSOT = `categories` หลัง migration นี้
- **salesChannels enum:** ไม่มี DB constraint — validate app layer (Valibot picklist)
- **lat/lng range:** ไม่เพิ่ม DB CHECK (Prisma ไม่รองรับ) — validate app layer (ไทย 5-21N, 97-106E)

---

## 7. Traceability

| Table / Field | BRD | PRD | สถานะ |
|--------------|-----|-----|-------|
| `Shop.categories` | FR-LO-08 | §3.4 + OD-4 | Draft |
| `Shop.salesChannels` | FR-LO-07 | §3.3 | Draft |
| `Shop.latitude/longitude` | FR-LO-09 | §3.5 + OD-1 | Draft |
| `Shop.slug` | FR-LO-05 | §4.3 | Done (migration 20260616) |
| `Shop.address` | FR-LO-09/13 | §3.5 | Done (มีอยู่) |
| `Shop.category` (legacy) | FR-LO-08 backward-compat | §4.2 | คงไว้ — drop เฟสถัดไป |
| `Badge` "ปี 2026" SIGNUP_YEAR | FR-LO-11 + BR-14 | §3.7 + OD-3 | Done (มีใน seed; พิจารณา rename) |
| `Product.images/description` | FR-LO-10 | §3.6 + OD-5 | Done (มีอยู่) |
| `Product.sku` | FR-LO-10 | §3.6 | **Open — รอ Controller** |
| Checklist derivation | FR-LO-13 | §3.8 + OD-6 | ดู §1 |

---

## 8. สรุป + Open Questions

Migration หลัก = เพิ่ม 4 column ใน `Shop` (`categories`/`salesChannels` String[], `latitude`/`longitude` Float?) + GIN index + backfill `categories` จาก `category`. ไม่สร้าง table ใหม่ — checklist derive จาก fields. Badge SIGNUP_YEAR 2026 มีใน seed แล้ว. Product field ครบ ยกเว้น SKU

**Resolved + Applied (2026-06-18):**
1. ✅ **Product.sku:** เพิ่ม `sku String?` (column) — applied migration `20260618035221_add_shop_onboarding_fields`
2. ✅ **Badge name:** rename "ปี 2026" → "สมาชิกผู้ก่อตั้ง 2026" — แก้ `badge-seed-data.ts` + `updateMany` ใน DB แล้ว (1 row)
3. ✅ **GIN:** ใช้ `CREATE INDEX` ปกติ (Shop base เล็ก ไม่ lock นาน) — applied
4. **Backfill SIGNUP_YEAR:** lazy evaluate — `auth.ts` เรียก `evaluateSignupYearBadge` ทุก sign-in ถ้ายังไม่มี badge → Seller ปี 2026 ได้ badge ตอน login ครั้งถัดไป (ไม่ต้อง migration script)

**Migration applied:** `20260618035221_add_shop_onboarding_fields` (Supabase, verified columns + backfill `categories` จาก `category`)

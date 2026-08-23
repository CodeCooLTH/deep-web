---
title: "DATABASE — Public Profile Display Controls"
owner: shinobu22
status: draft
created: 2026-08-23
tags: [database, feature, public-profile]
related: ["[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M53-PublicProfileDisplayControls
> **ประเภทเอกสาร:** Database Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-23

# DATABASE: ตัวควบคุมการแสดงผลหน้าร้านสาธารณะ

---

## 1. Overview

- **Store:** PostgreSQL 16 (Supabase บน prod, Docker localhost:5434 บนเครื่อง dev)
- **ORM:** Prisma
- **ลักษณะการเปลี่ยนแปลง:** additive ล้วน — 4 คอลัมน์ boolean ไม่มีตารางใหม่ ไม่มี FK ใหม่ ไม่มีการลบ/เปลี่ยนชนิดข้อมูล
- **ไม่มี backfill script** — `ADD COLUMN ... NOT NULL DEFAULT <ค่า>` ทำให้แถวเดิมทั้งหมดได้ค่าตั้งต้นทันทีในคำสั่งเดียว

---

## 2. ERD

```mermaid
erDiagram
    Shop ||--o| ShopPageLayout : has
    Shop ||--o{ Product : owns
    Shop ||--o{ Room : owns
    Shop ||--o{ ServiceResource : owns

    ShopPageLayout {
        string  shopId PK_FK "unique"
        boolean isPublished "default true (เดิม)"
        boolean showPrices  "default false (ใหม่)"
        string  tabOrder    "String[] (เดิม)"
    }
    Product {
        string  id PK
        string  shopId FK
        boolean isActive       "เดิม — ขายอยู่ไหม"
        datetime pinnedAt      "เดิม — ปักหมุดไหม"
        boolean showOnProfile  "default true (ใหม่) — โชว์หน้าร้านไหม"
    }
    Room {
        string  id PK
        string  shopId FK
        boolean isActive
        boolean showOnProfile "default true (ใหม่)"
    }
    ServiceResource {
        string  id PK
        string  shopId FK
        boolean isActive
        boolean showOnProfile "default true (ใหม่)"
    }
```

---

## 3. Tables

### 3.1 `ShopPageLayout` (แก้ไข)

| คอลัมน์ | ชนิด | Null | Default | คำอธิบาย |
|---------|------|------|---------|----------|
| `showPrices` | boolean | NOT NULL | `false` | แสดงราคาบนหน้าร้านสาธารณะหรือไม่ — ค่าเดียวทั้งร้าน |

🛑 **กับดักที่ต้องเขียนคอมเมนต์กำกับใน schema:** ตารางนี้มี boolean สองตัวที่ fallback คนละทางเมื่อ **ไม่มีแถว**
- `isPublished` → อ่านเป็น `true` (ร้านที่ไม่เคยเปิดตัวจัดหน้าร้าน = เผยแพร่อยู่)
- `showPrices` → อ่านเป็น `false` (ร้านที่ไม่เคยเปิดตัวจัดหน้าร้าน = ซ่อนราคา)

ทั้งสองบรรทัดอยู่ในฟังก์ชัน `getShopPageLayout()` เดียวกัน คนที่มาอ่านทีหลังจะเห็นเป็นความไม่สม่ำเสมอและอยากแก้ให้เหมือนกัน — ต้องมีคอมเมนต์บอกว่าตั้งใจ

### 3.2 `Product` (แก้ไข)

| คอลัมน์ | ชนิด | Null | Default | คำอธิบาย |
|---------|------|------|---------|----------|
| `showOnProfile` | boolean | NOT NULL | `true` | แสดงสินค้าชิ้นนี้บนหน้าร้านสาธารณะหรือไม่ |

🛑 คอลัมน์นี้ตอบคนละคำถามกับอีกสองคอลัมน์ที่หน้าตาคล้ายกัน — เขียนกำกับไว้ในสคีมา:
- `isActive` = "ยังขายอยู่ไหม" (false = ขายไม่ได้ทุกช่องทาง)
- `pinnedAt` = "ปักหมุดบนหน้าร้านไหม"
- `showOnProfile` = "โชว์บนหน้าร้านไหม" — false แล้วยัง**ขายได้ปกติ**ผ่านแชท/POS/ออเดอร์

### 3.3 `Room` (แก้ไข)

| คอลัมน์ | ชนิด | Null | Default | คำอธิบาย |
|---------|------|------|---------|----------|
| `showOnProfile` | boolean | NOT NULL | `true` | แสดงห้องพักนี้บนหน้าร้านสาธารณะหรือไม่ |

### 3.4 `ServiceResource` (แก้ไข)

| คอลัมน์ | ชนิด | Null | Default | คำอธิบาย |
|---------|------|------|---------|----------|
| `showOnProfile` | boolean | NOT NULL | `true` | แสดงบริการนี้บนหน้าร้านสาธารณะหรือไม่ |

---

## 4. Indexes

**ไม่เพิ่ม index ใหม่ในเฟสนี้**

เหตุผล: ตัวกรอง `showOnProfile = true` ถูกต่อท้ายเงื่อนไขที่มี index รองรับอยู่แล้วเสมอ
- `Product` — `@@index([shopId, pinnedAt])` และการ scan ต่อร้านซึ่งมีขนาดหลักสิบถึงหลักร้อยแถว
- `Room` — `Room_shopId_isActive_idx`
- `ServiceResource` — `ServiceResource_shopId_isActive_idx`

จำนวนแถวต่อร้านเล็กเกินกว่าที่ index เพิ่มเติมจะให้ผลต่างที่วัดได้ และ index ที่ไม่มีใครใช้คือค่าเขียนที่จ่ายทุกครั้งที่แก้สินค้า — ถ้าวันหนึ่งมีร้านที่สินค้าหลักพัน ค่อยวัดแล้วเพิ่ม

---

## 5. Migration Plan

### 5.1 ลำดับการ Migrate

migration เดียว `prisma/migrations/<ts>_public_profile_display_controls/migration.sql`:

```sql
ALTER TABLE "ShopPageLayout"  ADD COLUMN "showPrices"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product"         ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Room"            ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ServiceResource" ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
```

- ไม่แตะ CHECK constraint ใด ๆ (ไม่มีข้อ additive ให้พลาดแบบ 2026-08-06)
- PostgreSQL 11+ เพิ่มคอลัมน์ที่มี default โดยไม่ rewrite ตาราง → ไม่ล็อกยาวแม้ `Product` จะมีแถวจริงบน prod
- **prod:** ไม่ต้องสั่งอะไรเอง — `vercel.json` รัน `prisma migrate deploy` ตอน build (Hard Rule 15) push ขึ้น `main` = migrate ขึ้น prod ในตัว
- **local:** ต้อง apply เองด้วยคำสั่งที่ปักหมุด URL localhost ตรง ๆ (Hard Rule 14)

### 5.2 Rollback

```sql
ALTER TABLE "ShopPageLayout"  DROP COLUMN "showPrices";
ALTER TABLE "Product"         DROP COLUMN "showOnProfile";
ALTER TABLE "Room"            DROP COLUMN "showOnProfile";
ALTER TABLE "ServiceResource" DROP COLUMN "showOnProfile";
```

สิ่งที่หายคือ "ค่าที่ร้านตั้งไว้เอง" ไม่ใช่ข้อมูลธุรกิจ — ไม่มีออเดอร์/เงิน/ประวัติใดผูกกับคอลัมน์เหล่านี้

### 5.3 ผลกระทบ (Impact)

| ด้าน | ผล |
|------|-----|
| ข้อมูลเดิม | ไม่มีแถวใดถูกแก้เนื้อหา — ได้ค่าตั้งต้นจาก DDL |
| พฤติกรรมที่ผู้ใช้เห็นทันทีหลัง deploy | **ราคาหายจากหน้าร้านทุกร้าน** (ตั้งใจ — มติผู้ใช้) · รายการที่แสดงไม่เปลี่ยน |
| Prisma client | ต้อง `prisma generate` ใหม่ในทุกเวิร์กทรีที่ค้างอยู่ (Hard Rule 17) |
| ขนาดตาราง | +1 byte/แถว ต่อคอลัมน์ |

---

## 6. Retention / ข้อควรระวัง

- ไม่มีนโยบายลบข้อมูลเพิ่มเติม — คอลัมน์เหล่านี้ตายไปกับแถวเจ้าของ (`onDelete: Cascade` เดิม)
- 🛑 **ห้าม `prisma db pull`** ตามกฎเดิมของรีโป — สคีมาบน prod มี CHECK ที่รันด้วยมือซึ่ง introspect ไม่เห็น
- 🛑 การซ่อนรายการ **ไม่ใช่** การลบ — ห้ามมีสคริปต์ใดตีความ `showOnProfile = false` เป็นสัญญาณให้เก็บกวาด/ลบข้อมูล

---

## 7. Traceability

| TFR | คอลัมน์ |
|-----|---------|
| TFR-001 | `ShopPageLayout.showPrices` |
| TFR-002 | `Product.showOnProfile`, `Room.showOnProfile`, `ServiceResource.showOnProfile` |

---

## 8. สรุป

4 บรรทัด DDL ไม่มี rewrite ไม่มี backfill ไม่มี index ใหม่ ความเสี่ยงทั้งหมดอยู่ที่ **ความหมาย** ไม่ใช่โครงสร้าง: ค่าตั้งต้นที่กลับทิศกันสองแบบ และคอลัมน์ที่หน้าตาเหมือน `isActive` แต่ตอบคนละคำถาม

---
title: "DATABASE — Business Account & Packages"
owner: shinobu22
status: draft
module: M00008-BusinessAccountPackages
version: "1.0"
created: 2026-07-02
tags: [feature, business-account, subscription, package, rbac, multi-shop, seller, database, schema]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]"]
---

> **โมดูล:** M00008-BusinessAccountPackages
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-02
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA/Database Agent (ดู [[Feature-Docs-Ownership]])

# DATABASE: Business Account & Packages

---

## 1. Overview

โมดูล Business Account & Packages (M00008) เป็นการเปลี่ยนแปลง **core relation ระดับรากฐาน** ของระบบครั้งแรก — จาก `Shop.userId @unique` (1 User = 1 Shop) เป็นความสัมพันธ์แบบ **membership** (1 User เป็นสมาชิกได้หลาย Shop, 1 Shop มีสมาชิกได้หลายคน) — บวกกับ subscription entitlement ระดับ **Owner** (ไม่ใช่ระดับ Shop เหมือน Inventory Add-on) ที่ควบคุมโควตาการสร้าง Business + invite admin

เอกสารนี้ทำ**ก่อน** SRS ตาม Hard Rule 11 (Documentation-First) เพื่อ lock data-model contract ให้ SRS/SDS ยึดตาม — ทุก field/model ในเอกสารนี้ถือเป็น **FROZEN CONTRACT** จนกว่า SRS จะขอเปลี่ยนอย่างชัดเจน (sync กลับมาที่เอกสารนี้เหมือนที่ 00003 เคยทำกับ `WalletTransaction.reason`)

- **เอกสารออกแบบต้นทาง:** [[PRD]] §Executive Summary, §3.1-3.11, §4.3 (Entitlement/Lock Matrix), §10.3 Decisions D-1→D-6 + [[BRD]] FR-BIZ-01..24, BR-BIZ-01..25
- **Store ที่เกี่ยวข้อง:** PostgreSQL 16 host บน Supabase — **DB เดียวกันสำหรับ dev + prod** (ดู memory `project_prisma_migration_env_targets`, `project_shared_db_drift_no_migrate_dev`)
- **ORM:** Prisma (`prisma/schema.prisma`); migration tool = **`prisma migrate deploy` + hand-written migration SQL เท่านั้น — ห้าม `prisma migrate dev` (shared DB มี drift อยู่แล้ว จะโดนเสนอ `migrate reset` ลบข้อมูลทั้ง DB)**
- **ไม่ใช้ RLS:** authorization อยู่ที่ `src/services/` (NextAuth session + service guard scope-by-membership) ไม่ใช้ policy ใน DB

### สิ่งที่ต้องเปลี่ยนแปลง (สรุปภาพรวม)

| Model | การเปลี่ยนแปลง | ประเภท |
|-------|----------------|--------|
| `ShopMember` (ใหม่) | membership table — แทนที่ FK ตรง `Shop.userId` 1:1 เดิม เป็น SSOT ของ "ใครเป็นสมาชิก shop ไหน บทบาทอะไร" | New |
| `Shop` | เพิ่ม `kind` (PERSONAL/BUSINESS), `packageLockedAt`/`packageLockReason` (read-only lock state) | Additive |
| `Shop` | **relax `userId` จาก `@unique` เป็น non-unique + partial-unique guard** (คนละ migration, gated แยก — ดู §4) | **Constraint change (phased)** |
| `BusinessPackageSubscription` (ใหม่) | subscription entitlement ระดับ **Owner** (1:1 User) + enum `BusinessPackageStatus` | New |
| `ShopInvite` (ใหม่) | invite admin เข้า Business ผ่านเบอร์โทร/อีเมล | New |
| `WalletTransaction` | เพิ่มค่าใหม่ของ `reason` (column มีอยู่แล้วจาก feature 00003) — **ไม่มี DDL** | Additive (value-only) |
| `User` | relation ใหม่ (`shopMemberships`, `businessPackageSubscription`, invite relations) + **breaking**: `shop Shop?` → `shops Shop[]` (Phase คนละ migration — ดู §4) | Additive + Breaking (phased) |

### สิ่งที่ตรวจสอบแล้วว่าไม่ต้องสร้าง table ใหม่/ไม่ต้องแก้เพิ่ม (จาก spike)

| ความต้องการ | Derivation |
|-------------|-----------|
| Product/Order/Auction/SellerWallet/TopUpRequest ของ Business shop | ผูก `shopId` เดิมทั้งหมด — Business shop คือ `Shop` record ปกติ (kind=BUSINESS) ไม่มี table คู่ขนาน |
| `SellerWallet`/`InventoryEntitlement`/`slug` เป็น 1:1 ต่อ shop อยู่แล้ว | ไม่ต้อง migrate — Business shop ใหม่ได้ `SellerWallet` แยกของตัวเอง (เครดิต ฿0 เริ่มต้น) ผ่าน flow สร้าง shop เดิม (FR-BIZ-08-AC-02) |
| ราคา/โควตาต่อ tier (Growth ฿159/1/1, Pro ฿599/3/3, Business ฿1,299/∞/∞) | **hardcode ที่ app layer** (constant map) เหมือน Inventory Add-on ฿199 — ไม่สร้าง `PackageTierConfig` table เพราะเปลี่ยนราคาไม่บ่อย และ PRD เองระบุว่าจะ "ปรับราคา/quota หลัง launch" (§1.2) ซึ่งทำผ่าน code deploy ได้เร็วกว่ารอ data migration; พิจารณา config table ใหม่เป็น Phase 2 ถ้าธุรกิจต้องการปรับราคาบ่อยแบบ self-serve |
| Business Package deduction | reuse `SellerWallet` + `wallet.service.deductCredit()` เดิม ผ่าน wallet ของ **Personal shop ของ owner** (resolve ผ่าน `ShopMember`/`Shop.kind='PERSONAL'` lookup) — ไม่สร้าง payment table ใหม่ |
| Inventory Add-on entitlement (feature 00003) | **แยกขาดสมบูรณ์ตาม D-2** — ไม่มี FK/field ใดเชื่อม `BusinessPackageSubscription` กับ `InventoryEntitlement` เลย |

---

## 2. ERD

```mermaid
erDiagram
    User ||--o{ Shop : "owns (created-by, immutable; 1 PERSONAL + N BUSINESS หลัง Phase cutover)"
    User ||--o{ ShopMember : "is member of"
    Shop ||--o{ ShopMember : "has members"
    User ||--o| BusinessPackageSubscription : "subscribes (owner-level, 0..1)"
    Shop ||--o{ ShopInvite : "has invites"
    User ||--o{ ShopInvite : "sent invites (as owner)"
    User ||--o{ ShopInvite : "accepted invites (as invitee)"
    Shop ||--o{ Product : "lists (unchanged)"
    Shop ||--o{ Order : "receives (unchanged)"
    Shop ||--o| SellerWallet : "has (unchanged, 1:1)"
    SellerWallet ||--o{ WalletTransaction : "records"

    User {
        string id PK
        string username UK
        string phone UK "nullable"
        string email UK "nullable"
    }
    Shop {
        string id PK
        string userId FK "owner-at-creation (immutable); unique เฉพาะ kind=PERSONAL หลัง Phase cutover (raw partial index, unmanaged by Prisma DSL)"
        string kind "NEW default PERSONAL — PERSONAL | BUSINESS"
        string businessType "เดิม — L3 legal-entity label, คนละเรื่องกับ kind (PRD Glossary warning)"
        datetime packageLockedAt "NEW nullable — เวลาเริ่ม read-only lock (เฉพาะ BUSINESS, NULL เสมอสำหรับ PERSONAL)"
        string packageLockReason "NEW nullable — RENEWAL_FAILED | QUOTA_EXCEEDED_BUSINESS_COUNT | QUOTA_EXCEEDED_ADMIN_COUNT"
    }
    ShopMember {
        string id PK
        string shopId FK
        string userId FK
        string role "OWNER (1 แถวต่อ shop, app-layer invariant) | ADMIN"
        datetime createdAt
        datetime updatedAt
    }
    BusinessPackageSubscription {
        string id PK
        string ownerId FK_UK "1 subscription ต่อ owner; row ไม่มี = FREE (มิเรอร์ NOT_SUBSCRIBED ของ InventoryEntitlement)"
        string tier "GROWTH | PRO | BUSINESS (ชื่อ tier สูงสุดชนกับคำว่า Shop.kind=BUSINESS โดยตั้งใจ — คนละแกน ระวังสับสน)"
        enum status "ACTIVE | LOCKED_RENEWAL_FAILED"
        datetime activatedAt "cohort marker — ห้ามแตะตอน renew/upgrade/downgrade/reactivate"
        datetime currentPeriodStart
        datetime nextRenewalAt "cron query target"
        datetime lastRenewalAt "nullable"
        datetime lockedAt "nullable — reset null ตอน reactivate"
    }
    ShopInvite {
        string id PK
        string shopId FK
        string invitedContact "PII — phone/email ดิบ"
        string contactType "PHONE | EMAIL"
        string role "ADMIN (default; future-proof field)"
        string status "PENDING | ACCEPTED | CANCELLED"
        string invitedByUserId FK
        string acceptedByUserId FK "nullable"
        datetime acceptedAt "nullable"
        datetime cancelledAt "nullable"
    }
    WalletTransaction {
        string id PK
        string walletId FK
        string type "TOPUP | DEDUCT (unchanged)"
        string reason "NEW value: BUSINESS_PACKAGE_SUBSCRIPTION (column มีอยู่แล้ว)"
    }
```

---

## 3. Tables / Models

### 3.1 `ShopMember` (ใหม่)

Membership table ที่แทนที่ FK ตรง `Shop.userId` 1:1 เดิม — SSOT ใหม่ของ "ใครเป็นสมาชิกร้านไหน บทบาทอะไร" **ทุก Shop (ทั้ง PERSONAL และ BUSINESS) มี `ShopMember(role=OWNER)` เสมอ 1 แถว** (backfill สำหรับ shop เดิม + สร้างพร้อมกันตอน shop ใหม่ถูกสร้าง)

```prisma
// ShopMember: membership User↔Shop (role: OWNER | ADMIN) — feature 00008
// แทนที่ FK ตรง Shop.userId 1:1 เดิม เป็น SSOT ใหม่ของ "สมาชิกร้านไหน บทบาทอะไร"
// ทุก Shop (PERSONAL/BUSINESS) มี ShopMember(role=OWNER) เสมอ 1 แถว
// invariant "1 OWNER ต่อ shop" enforce ที่ app layer เท่านั้น (ไม่มี DB constraint —
// ไม่มี ownership-transfer/co-ownership ใน MVP, PRD §5 out-of-scope, risk ต่ำ)
model ShopMember {
  id        String   @id @default(uuid())
  shopId    String
  userId    String
  // role: "OWNER" | "ADMIN" — String ตาม convention project (เทียบ Order.status/VerificationRecord.status)
  role      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([shopId, userId])
  @@index([userId])       // switcher query: shop ทั้งหมดที่ user คนนี้เป็นสมาชิก (FR-BIZ-14)
  @@index([shopId, role]) // list/count admin ต่อ shop (quota enforcement FR-BIZ-12) + lookup owner
}
```

**Delete semantics:** Remove-admin (FR-BIZ-11) = **hard delete** ของแถว `ShopMember` (ไม่ใช่ soft-revoke) — ตรงคำ BRD "membership...ถูกลบออกจาก Business นั้นทันที" การลบนี้**ไม่กระทบ** `Product`/`Order` ที่ admin คนนั้นเคยสร้าง (ไม่มี FK จาก `Product`/`OrderItem` มาที่ `ShopMember` — ประวัติอ้างอิงผ่าน `shopId` ของ record นั้นเองเสมอ ไม่ใช่ผ่านผู้สร้าง) ตรง FR-BIZ-11-AC-02

### 3.2 `Shop` — field ใหม่

| Column | Type | Null | Default | Key | เหตุผล |
|--------|------|------|---------|-----|--------|
| `kind` | `TEXT` | NO | `'PERSONAL'` | INDEX (composite) | `"PERSONAL"` \| `"BUSINESS"` — String ตาม convention (มิเรอร์ `Product.type`/`Order.type`/`Order.fulfillmentMode` ที่เป็น "type discriminator" ไม่ใช่ lifecycle-state) DEFAULT `'PERSONAL'` = ทุก Shop เดิมก่อน feature นี้ backward-compat อัตโนมัติ 100% (BR-BIZ-25) |
| `packageLockedAt` | `TIMESTAMP(3)` | YES | NULL | INDEX (composite) | เวลาที่ shop นี้เข้าสถานะ read-only lock ล่าสุด; **NULL เสมอสำหรับ PERSONAL shop** (personal ไม่มีทางถูกล็อกจาก feature นี้ — BR-BIZ-25); reset NULL ทันทีที่ปลดล็อก (single-slot เหมือน `InventoryEntitlement.lockedAt`) |
| `packageLockReason` | `TEXT` | YES | NULL | — | `"RENEWAL_FAILED"` (BR-BIZ-05/FR-BIZ-04) \| `"QUOTA_EXCEEDED_BUSINESS_COUNT"` (BR-BIZ-18/FR-BIZ-18) \| `"QUOTA_EXCEEDED_ADMIN_COUNT"` (BR-BIZ-19/FR-BIZ-19) — ให้ UI แสดงข้อความล็อกถูกสาเหตุ (BRD §6.5) |

```prisma
model Shop {
  id            String   @id @default(uuid())
  userId        String   @unique // ดู §4 — Phase cutover จะตัด @unique นี้ออก (แยก migration, gated)
  shopName      String
  // ... (field เดิมไม่เปลี่ยน — category, categories, salesChannels, slug, address, lat/lng, businessType) ...

  // --- feature 00008: Business Account & Packages ---
  // kind: "PERSONAL" | "BUSINESS" — String (มิเรอร์ Product.type/Order.type pattern)
  // default PERSONAL = ทุก Shop เดิมก่อน feature นี้ถือเป็น PERSONAL อัตโนมัติ (BR-BIZ-25 zero-regression)
  kind          String   @default("PERSONAL")
  // packageLockedAt/packageLockReason: read-only lock state ของ BUSINESS shop
  // NULL เสมอสำหรับ PERSONAL shop — ตั้งค่าเมื่อ owner's BusinessPackageSubscription = LOCKED_RENEWAL_FAILED
  // (ทุก business ของ owner) หรือ downgrade แล้ว shop นี้ไม่ถูกเลือกให้ active / admin เกินโควตาต่อธุรกิจ
  packageLockedAt   DateTime?
  packageLockReason String?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user                 User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  products             Product[]
  orders               Order[]
  wallet               SellerWallet?
  topUpRequests        TopUpRequest[]
  auctions             Auction[]
  inventoryEntitlement InventoryEntitlement?
  members              ShopMember[]          // NEW (feature 00008)
  invites              ShopInvite[]          // NEW (feature 00008)

  @@index([categories], type: Gin, map: "Shop_categories_gin_idx")
  @@index([salesChannels], type: Gin, map: "Shop_salesChannels_gin_idx")
  @@index([userId, kind], map: "Shop_userId_kind_idx")             // NEW — switcher/owner lookup, ครอบคลุมทั้ง 2 kind
  @@index([kind, packageLockedAt], map: "Shop_kind_packageLockedAt_idx") // NEW — Admin/Ops list locked business (FR-BIZ-24)
}
```

**⚠️ หมายเหตุสำคัญ:** field `businessType` (บรรทัด 74 เดิม) **ไม่ใช่**สิ่งเดียวกับ `kind` ใหม่นี้ — `businessType` = label ประเภทนิติบุคคลสำหรับ L3 verification (`"INDIVIDUAL"` ฯลฯ, มีอยู่ก่อนแล้ว), `kind` = PERSONAL/BUSINESS ของ feature นี้ (ตรง PRD Glossary warning ชัดเจน — ห้ามสับสนหรือ reuse field เดิม)

### 3.3 `BusinessPackageSubscription` (ใหม่) — Owner-level entitlement

**สำคัญ: entitlement นี้อยู่ที่ระดับ `User` (Owner) ไม่ใช่ระดับ `Shop`** — ต่างจาก `InventoryEntitlement` (1:1 Shop) เพราะ 1 Owner ควบคุมโควตาของ Business หลายอันพร้อมกัน (D-1, Billing source note) **NOT_SUBSCRIBED ไม่ใช่ enum value — "ไม่มี row นี้เลย" = FREE** (มิเรอร์ pattern `InventoryEntitlement` เป๊ะ)

| Column | Type | Null | Default | Key | หมายเหตุ |
|--------|------|------|---------|-----|---------|
| `id` | `TEXT` | NO | — | PK | uuid (app-generated) |
| `ownerId` | `TEXT` | NO | — | FK, UNIQUE | อ้าง `User.id`, `ON DELETE CASCADE` — 1 subscription ต่อ owner เสมอ |
| `tier` | `TEXT` | NO | — | — | `"GROWTH"` \| `"PRO"` \| `"BUSINESS"` — String (ราคา/โควตา hardcode app-layer, ดู §1) **ระวังสับสนกับ `Shop.kind="BUSINESS"`** — คนละแกนความหมาย ชื่อชนกันโดยธุรกิจตั้งชื่อ tier สูงสุดว่า "Business" |
| `status` | `BusinessPackageStatus` (enum) | NO | `'ACTIVE'` | — | `ACTIVE` \| `LOCKED_RENEWAL_FAILED` |
| `activatedAt` | `TIMESTAMP(3)` | NO | — | — | subscribe ครั้งแรกเท่านั้น — **ห้ามแตะ**ตอน renew/upgrade/downgrade/reactivate (cohort marker, มิเรอร์ `InventoryEntitlement.activatedAt`) |
| `currentPeriodStart` | `TIMESTAMP(3)` | NO | — | — | subscribe/renew/upgrade/downgrade/reactivate สำเร็จล่าสุด (BR-BIZ-04 rolling cycle) |
| `nextRenewalAt` | `TIMESTAMP(3)` | NO | — | — | `currentPeriodStart + 30 วัน` — renewal cron query target |
| `lastRenewalAt` | `TIMESTAMP(3)` | YES | NULL | — | renew/reactivate สำเร็จครั้งล่าสุดหลัง activate แรก; NULL = ยังไม่เคย |
| `lockedAt` | `TIMESTAMP(3)` | YES | NULL | — | เวลาเปลี่ยนเป็น LOCKED_RENEWAL_FAILED ล่าสุด — reset NULL ทันทีที่ reactivate สำเร็จ |
| `createdAt`/`updatedAt` | `TIMESTAMP(3)` | NO | — | — | ปกติ |

```prisma
enum BusinessPackageStatus {
  ACTIVE
  LOCKED_RENEWAL_FAILED
}

// BusinessPackageSubscription: สิทธิ์ subscription ระดับ Owner (1:1 User) — feature 00008
// ต่าง InventoryEntitlement (1:1 Shop) เพราะ 1 owner คุมโควตา Business หลายอัน (D-1)
// ไม่มี FREE เป็น status/value — "ไม่มี row นี้เลย" = FREE (มิเรอร์ NOT_SUBSCRIBED ของ InventoryEntitlement)
// ตั้งชื่อแยกจาก Shop.businessType เดิม (label นิติบุคคล L3 — คนละเรื่อง, ดู PRD Glossary)
model BusinessPackageSubscription {
  id                 String                @id @default(uuid())
  ownerId            String                @unique
  // tier: "GROWTH" | "PRO" | "BUSINESS" — String (ราคา/โควตาต่อ tier hardcode app-layer เหมือน
  // Inventory Add-on ฿199 — กัน ALTER TYPE ทุกครั้งที่ปรับราคา, PRD §1.2 คาดว่าจะปรับหลัง launch)
  tier               String
  status             BusinessPackageStatus @default(ACTIVE)
  activatedAt        DateTime // subscribe ครั้งแรกเท่านั้น ห้ามแตะตอน renew/upgrade/downgrade/reactivate
  currentPeriodStart DateTime
  nextRenewalAt      DateTime
  lastRenewalAt      DateTime?
  lockedAt           DateTime?
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt

  owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@index([status, nextRenewalAt]) // renewal cron: status='ACTIVE' AND nextRenewalAt<=now() + advance-warning 3 วัน
}
```

**Open item (ดู §9):** ยังไม่ยืนยันว่า "downgrade กลับเป็น Free เต็มรูป" (ยกเลิก package ทั้งหมด ไม่ใช่แค่ downgrade tier สูง→ต่ำ) ทำโดย DELETE row นี้ (กลับเป็น NOT_SUBSCRIBED) หรือเก็บ row ไว้พร้อม `tier` value ใหม่ — ออกแบบเลือก **DELETE row** เป็น default (คง single-representation ของ "FREE" ไว้ที่เดียว คือ "ไม่มี row" เท่านั้น กัน ambiguity แบบเดียวกับที่ 00003 เลี่ยงตอนออกแบบ `stockQty`) — ต้อง confirm ตอน SRS เพราะ PRD/BRD ไม่ได้ระบุ flow นี้ชัดเจน (FR-BIZ-17 พูดถึงแต่ downgrade tier→tier ที่ยังเป็น paid)

### 3.4 `ShopInvite` (ใหม่)

Invite admin เข้า 1 Business ผ่านเบอร์โทร/อีเมล (FR-BIZ-09/10/11)

| Column | Type | Null | Default | Key | หมายเหตุ |
|--------|------|------|---------|-----|---------|
| `id` | `TEXT` | NO | — | PK | uuid |
| `shopId` | `TEXT` | NO | — | FK | อ้าง `Shop.id`, `ON DELETE CASCADE` |
| `invitedContact` | `TEXT` | NO | — | INDEX (composite) | เบอร์โทร/อีเมล ดิบ — **PII** (ดู §8) |
| `contactType` | `TEXT` | NO | — | — | `"PHONE"` \| `"EMAIL"` — บอก accept-flow ว่า match กับ `User.phone`/`User.email` field ไหน |
| `role` | `TEXT` | NO | `'ADMIN'` | — | ปัจจุบันมีแค่ `"ADMIN"` (owner ตั้งตอนสร้าง shop อยู่แล้ว ไม่ผ่าน invite) — เก็บ field ไว้ future-proof เผื่อ role ย่อยเพิ่ม (Phase 2) |
| `status` | `TEXT` | NO | `'PENDING'` | INDEX (composite) | `"PENDING"` \| `"ACCEPTED"` \| `"CANCELLED"` — String มิเรอร์ `TopUpRequest.status` shape |
| `invitedByUserId` | `TEXT` | NO | — | FK | ผู้ invite (ต้องเป็น Owner เสมอ — enforce ที่ app layer ตาม FR-BIZ-09-AC-03) |
| `acceptedByUserId` | `TEXT` | YES | NULL | FK | ผู้ accept จริง (`SET NULL` ถ้า user ถูกลบ — ไม่ cascade ลบ invite record เพื่อ audit trail) |
| `acceptedAt`/`cancelledAt` | `TIMESTAMP(3)` | YES | NULL | — | single-slot timestamp |
| `createdAt`/`updatedAt` | `TIMESTAMP(3)` | NO | — | — | ปกติ |

```prisma
// ShopInvite: คำเชิญ admin เข้า Business ผ่านเบอร์โทร/อีเมล — feature 00008
model ShopInvite {
  id               String    @id @default(uuid())
  shopId           String
  // invitedContact: เบอร์โทร/อีเมล — จับคู่ User.phone/User.email ตอน accept (FR-BIZ-10)
  invitedContact   String
  // contactType: "PHONE" | "EMAIL"
  contactType      String
  // role: ปัจจุบันมีแค่ "ADMIN" — เก็บไว้ future-proof (Phase 2 RBAC granularity)
  role             String    @default("ADMIN")
  // status: "PENDING" | "ACCEPTED" | "CANCELLED" — String มิเรอร์ TopUpRequest.status
  status           String    @default("PENDING")
  invitedByUserId  String
  acceptedByUserId String?
  acceptedAt       DateTime?
  cancelledAt      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  shop       Shop  @relation(fields: [shopId], references: [id], onDelete: Cascade)
  invitedBy  User  @relation("ShopInviteInvitedBy", fields: [invitedByUserId], references: [id], onDelete: Cascade)
  acceptedBy User? @relation("ShopInviteAcceptedBy", fields: [acceptedByUserId], references: [id], onDelete: SetNull)

  @@index([shopId, status])          // list pending invite ของ shop (owner invite management page)
  @@index([invitedContact, status])  // ตอน user สมัคร/login เช็คว่ามี invite PENDING ค้างรอไหม (FR-BIZ-10-AC-02)
}
```

**Design note — ไม่มี DB-level duplicate-guard:** ไม่ใส่ `@@unique([shopId, invitedContact])` เพราะจะบล็อกการ invite ซ้ำหลัง `CANCELLED` (ควร invite ใหม่ได้) — duplicate-pending check (กันมี PENDING ซ้ำสำหรับ contact เดียวกันใน shop เดียวกัน) เป็น app-layer responsibility (`findFirst` ก่อน insert) เหมือน pattern เบาที่โปรเจกต์ใช้อยู่แล้ว (ไม่ over-constrain ที่ DB)

### 3.5 `WalletTransaction` — ค่าใหม่ของ `reason` (ไม่มี DDL)

Column `reason` มีอยู่แล้วจาก feature 00003 (`String?` nullable) — feature นี้เพิ่มแค่**ค่าที่ยอมรับ** ไม่มีการเปลี่ยน schema:

```prisma
model WalletTransaction {
  // ...
  // reason: label แยก DEDUCT source — nullable = row เก่าก่อนฟีเจอร์ที่ใช้ field นี้
  // ("SMS_ORDER_LINK" | "INVENTORY_SUBSCRIPTION" [feature 00003] | "BUSINESS_PACKAGE_SUBSCRIPTION" [feature 00008, NEW])
  reason String?
  // ...
}
```

**ค่าใหม่ที่ตกลง:** `"BUSINESS_PACKAGE_SUBSCRIPTION"` (ต่อ suffix `_SUBSCRIPTION` ให้เข้าชุดกับ `INVENTORY_SUBSCRIPTION` เดิม — สื่อความหมายชัดกว่ารูปย่อ `"BUSINESS_PACKAGE"` ที่ Controller เสนอไว้ในตอนแรก, เลือกใช้รูปเต็มเพื่อ pattern สม่ำเสมอ — ถ้า SRS อยากใช้รูปย่อ แจ้งกลับมา sync ที่นี่)

**`refId` guidance (convention แนะนำ ไม่ใช่ DB requirement):** สำหรับ `reason="BUSINESS_PACKAGE_SUBSCRIPTION"` แนะนำ `refId = BusinessPackageSubscription.id` (มิเรอร์ pattern `refId = InventoryEntitlement.id` ของ 00003)

**Wallet ที่ถูกหัก:** `WalletTransaction` นี้ผูกกับ `SellerWallet` ของ **Personal shop ของ Owner** (resolve ด้วย `ShopMember`/`Shop.kind='PERSONAL'` — ไม่ใช่ wallet ของ Business shop ที่กำลังจะถูกสร้าง) ตาม D-Billing source — ไม่มี schema change เพิ่มเติมสำหรับจุดนี้ เพราะ `SellerWallet` ผูก `shopId` อยู่แล้ว แค่ resolve shopId ให้ถูกที่ service layer

### 3.6 `User` — relation ใหม่

```prisma
model User {
  // ... field เดิมไม่เปลี่ยน ...

  shop                  Shop?     // เดิม — คงอยู่จนกว่า Phase cutover (ดู §4)
  // --- feature 00008 (additive, Phase 1) ---
  shopMemberships             ShopMember[]
  businessPackageSubscription BusinessPackageSubscription?
  sentShopInvites             ShopInvite[] @relation("ShopInviteInvitedBy")
  acceptedShopInvites         ShopInvite[] @relation("ShopInviteAcceptedBy")
}
```

**⚠️ Breaking change ที่รอ Phase คนละ migration (ดู §4 เต็ม):** `shop Shop?` (singular) จะต้องเปลี่ยนเป็น `shops Shop[]` เมื่อ `Shop.userId` ตัด `@unique` — Prisma **บังคับ** ให้ back-relation เป็น array ทันทีที่ FK ฝั่ง one-side ไม่ unique จริงใน DB (ไม่ใช่แค่ทางเลือกออกแบบ) — กระทบ**ทุก call site** ที่ใช้ `user.shop`/`session.user.shop`/`include: { shop: true }` แบบ singular ทั่วทั้ง `(paces)/seller/**` และ auth callback — **ไม่ใช่ schema-only change, ต้อง grep audit เต็มก่อน apply** (ดู §4, §9)

---

## 4. การเปลี่ยน `Shop.userId` (Relax 1:1 → 1:N) — Phased Plan

นี่คือ**ความเสี่ยงสูงสุดของ feature นี้** (PRD §6.2, BRD §7.2) — ออกแบบเป็น 3 phase แยก migration/deploy เพื่อลด blast radius

### Phase 1 — Additive (บังคับต้องทำก่อน Business creation feature จะทำงานได้เลย)

- เพิ่ม `ShopMember`, `Shop.kind`/`packageLockedAt`/`packageLockReason`, `BusinessPackageSubscription`, `ShopInvite` — **ไม่แตะ `Shop.userId @unique` เดิม**
- **สำคัญ:** แม้ Phase นี้ยังไม่ตัด `@unique` ก็ตาม ระบบยัง**สร้าง Business shop ตัวที่ 2 ของ owner คนเดียวกันไม่ได้** เพราะ `userId` unique เดิมจะ reject การ insert Shop แถวที่ 2 ที่มี `userId` ซ้ำทันที (Personal shop ครองสิทธิ์อยู่แล้ว) — ดังนั้น **Phase 2 (constraint cutover) ไม่ใช่ optional/เลื่อนได้ยาว ๆ แต่ต้องเกิดก่อนหรือพร้อมกับ launch ของ FR-BIZ-06 (สร้าง Business)**
- `user.shop`/`User.shop Shop?` **ยังใช้งานได้ปกติ 100%** ในช่วงนี้ — ไม่มี breaking change ใด ๆ ต่อ TypeScript
- Backfill `ShopMember(role=OWNER)` จาก `Shop` เดิมทุกแถว (idempotent — ดู §6.2 SQL ข้อ 5) — เตรียมข้อมูลให้ RBAC/switcher ใหม่อ่านได้ถูกต้องตั้งแต่วันแรกที่ Phase 2 apply

### Phase 2 — Constraint Cutover (gated, ต้อง confirm แยกจาก Phase 1)

- `DROP` unique index เดิมบน `Shop.userId`
- `CREATE UNIQUE INDEX ... ON "Shop"("userId") WHERE "kind" = 'PERSONAL'` (partial unique — คง invariant "1 Personal shop ต่อ user" เป๊ะเหมือนเดิม แต่ปลดล็อกให้ 1 owner มี Business shop ได้หลายแถว)
- **⚠️ ข้อจำกัดสำคัญของ Prisma:** schema.prisma **ไม่รองรับ partial/filtered unique index** (ไม่มี syntax `where:` ใน `@@unique`/`@@index` — ต่างจาก GIN type index ที่ project เคย declare ได้ในบรรทัด 86-89) ดังนั้น constraint นี้จะ**มีอยู่จริงใน DB แต่ Prisma schema มองไม่เห็น/ประกาศไม่ได้** — ผลคือ:
  - `Shop.userId` field ใน schema.prisma ต้องเอา `@unique` ออก (ไม่มีวิธีประกาศ "unique แบบมีเงื่อนไข" ใน DSL) แล้วปล่อยให้ constraint จริงอยู่แค่ใน migration SQL เท่านั้น
  - **ห้าม `prisma db pull`/`prisma migrate dev` เด็ดขาดตลอดไปหลังจุดนี้** (ไม่ใช่แค่ตอน migrate) — คำสั่งเหล่านี้จะไม่เห็น partial index และพยายาม "แก้ไขให้ตรง schema" ซึ่งอาจ DROP มันทิ้ง (เหมือนที่เคยเกิดกับ GIN index ก่อนจะแก้ด้วย `type: Gin`) — กฎนี้ทับซ้อนกับกฎเดิมของโปรเจกต์อยู่แล้ว (shared-DB-drift) แต่ยิ่งสำคัญขึ้นสำหรับ table นี้โดยเฉพาะ ต้องเขียน comment กำกับไว้ใน schema.prisma ให้ dev คนถัดไปเห็นชัด
- **ต้อง apply DDL นี้พร้อมกับแก้ `prisma/schema.prisma`** (`Shop.userId` ตัด `@unique`, `User.shop Shop?` → `User.shops Shop[]`) **ในดีพลอยเดียวกันเท่านั้น** — ถ้าแยก deploy กัน จะเกิดสภาวะที่ schema.prisma ยังประกาศ `@unique` อยู่ทั้งที่ DB ไม่มี constraint แล้ว (lie) หรือ Prisma client ยัง generate type `Shop?` singular ทั้งที่ DB อนุญาตหลายแถวแล้ว (data-integrity gap ที่ TypeScript ไม่เตือน)
- **Pre-check บังคับก่อน apply:** ทุก `Shop` row ต้องมี `ShopMember(role=OWNER)` ตรงกันครบ (จาก backfill Phase 1) มิฉะนั้น shop เก่าที่ backfill พลาดจะมี RBAC/switcher gap ทันทีที่ code เปลี่ยนไปอ่าน `ShopMember` เป็นหลัก
- **Breaking change:** `user.shop`/`session.user.shop`/`include: { shop: true }` (singular) ทุกจุดใน `(paces)/seller/**`, auth callback, proxy.ts ต้องถูก grep + แก้เป็น pattern ใหม่ (เช่น helper `getPersonalShop(user)` ที่ filter `shops.find(s => s.kind === 'PERSONAL')`) — **แนะนำให้ SDS ออกแบบ helper กลางตัวนี้ 1 จุด** เพื่อจำกัด blast radius แทนที่จะแก้ทุก call site เป็น inline filter กระจัดกระจาย (ตรง memory `feedback_verify_dont_assume` — 2-pass grep ก่อน sign-off)

### Phase 3 — App cutover (SRS/SDS/Developer scope, ไม่ใช่ DB scope แล้ว)

- Service layer เปลี่ยนไปอ่าน `ShopMember` เป็นหลักสำหรับทุก flow ใหม่ (switcher, RBAC, Business creation/invite)
- Personal-shop flow เดิม (Product/Order create-edit-list) **ยังคง query ตรงผ่าน `shopId` เดิมได้เหมือนเดิมทุกประการ** (ไม่ต้อง join ผ่าน `ShopMember` เลย) — เพราะ `shopId` เป็น scalar FK บน `Product`/`Order` อยู่แล้ว ไม่ผ่าน `user.shop` เสมอไป (BRD §6.2 latency concern แก้ที่จุดนี้)

**สรุปสถานะ:** เอกสารนี้ (DATABASE.md) ออกแบบ Phase 1+2 ครบ (schema + migration SQL) — Phase 3 เป็นงาน SDS/Developer implement ต่อ แต่ DATABASE.md ต้อง flag ให้ SRS ทราบว่า Phase 2 ผูกมัดกับ Phase 3 แน่นมาก (deploy พร้อมกันในทางปฏิบัติ แม้จะแยก "concept" เป็น DB-change vs app-change)

---

## 5. Indexes & Constraints

| Table | Columns | Type | Rationale (query pattern ที่รองรับ) |
|-------|---------|------|--------------------------------------|
| `ShopMember` | `(shopId, userId)` | UNIQUE | 1 membership row ต่อ shop-user pair; กันสมัครซ้ำ |
| `ShopMember` | `userId` | BTREE | switcher: "shop ทั้งหมดที่ user คนนี้เป็นสมาชิก" (FR-BIZ-14) — hot path ทุก seller page load |
| `ShopMember` | `(shopId, role)` | BTREE composite | list/count admin ต่อ shop สำหรับ quota check (FR-BIZ-12) + lookup owner ของ shop |
| `BusinessPackageSubscription` | `ownerId` | UNIQUE | 1 subscription ต่อ owner; PK lookup ทุกครั้งที่เช็ค entitlement |
| `BusinessPackageSubscription` | `(status, nextRenewalAt)` | BTREE composite | renewal cron (`status='ACTIVE' AND nextRenewalAt<=now()`) + advance-warning cron (`nextRenewalAt BETWEEN now() AND now()+interval '3 days'`) — มิเรอร์ index pattern `InventoryEntitlement` เป๊ะ |
| `ShopInvite` | `(shopId, status)` | BTREE composite | owner ดู pending invite ของ shop ตน |
| `ShopInvite` | `(invitedContact, status)` | BTREE composite | เช็ค PENDING invite ค้างตอน user สมัคร/login (FR-BIZ-10-AC-02) |
| `Shop` | `(userId, kind)` | BTREE composite | switcher/owner lookup ครอบคลุมทั้ง personal+business ของ owner คนเดียว |
| `Shop` | `(kind, packageLockedAt)` | BTREE composite | Admin/Ops list Business shop ที่ locked (FR-BIZ-24) |
| `Shop` | `userId` **partial UNIQUE** `WHERE kind='PERSONAL'` | UNIQUE (raw SQL, unmanaged by Prisma) | คง invariant "1 Personal shop ต่อ user" — **Phase 2 เท่านั้น, ไม่มีใน schema.prisma DSL** (ดู §4) |
| `WalletTransaction` | `reason` | BTREE | มีอยู่แล้ว (feature 00003) — ครอบคลุมค่าใหม่ `BUSINESS_PACKAGE_SUBSCRIPTION` โดยอัตโนมัติ ไม่ต้องสร้างเพิ่ม |

**Constraints ที่ไม่ทำ (ตั้งใจ, เหตุผล):**
- ไม่มี CHECK `kind IN ('PERSONAL','BUSINESS')` / `role IN (...)` / `status IN (...)` — ตรง convention เดิมของโปรเจกต์ที่ String status/type field ทุกตัว (`Order.status`, `Auction.status` ฯลฯ) ไม่มี DB-level enum CHECK เลย validate ที่ Valibot (app layer) เท่านั้น
- ไม่มี unique guard "1 OWNER ต่อ shop" ใน `ShopMember` — app-layer invariant (ไม่มี ownership-transfer ใน MVP, PRD §5 out-of-scope) — ถือเป็น optional hardening ในอนาคตถ้า co-ownership ถูกเพิ่ม (ดู §9)

---

## 6. Migration Plan (hand-written SQL — ห้ามใช้ `prisma migrate dev`)

### 6.1 ลำดับการ Migrate

| ลำดับ | การเปลี่ยนแปลง | Phase | หมายเหตุ (dependency) |
|-------|----------------|-------|------------------------|
| 1 | `Shop` เพิ่ม `kind`/`packageLockedAt`/`packageLockReason` + index | 1 | additive, DEFAULT กัน row เดิมพัง |
| 2 | สร้าง `ShopMember` + index + FK | 1 | ไม่ dependency กับใคร |
| 3 | สร้าง enum `BusinessPackageStatus` + table `BusinessPackageSubscription` + index + FK | 1 | ไม่ dependency |
| 4 | สร้าง `ShopInvite` + index + FK (อ้าง `Shop`, `User` x2) | 1 | ต้องมี `Shop`/`User` อยู่แล้ว (มีอยู่แล้ว) |
| 5 | Backfill `ShopMember(role=OWNER)` จาก `Shop` เดิมทุกแถว (idempotent) | 1 | ต้องมีลำดับ 2 ก่อน |
| — | *(ไม่มี DDL — `WalletTransaction.reason` ใช้ column เดิมจาก 00003)* | 1 | — |
| 6 | `DROP` unique เดิม + `CREATE` partial unique `Shop.userId` | **2 (gated แยก)** | ต้อง pre-check ทุก Shop มี `ShopMember(OWNER)` ครบจากลำดับ 5 + ต้อง sync พร้อม schema.prisma/`User.shops` deploy เดียวกัน |

### 6.2 Migration SQL — Phase 1 (`add_business_account_packages`)

```sql
-- Migration: add_business_account_packages | Feature: M00008-BusinessAccountPackages | 2026-07-02
-- SAFETY: additive only — table ใหม่ 3 ตัว + column ใหม่ (DEFAULT/nullable) บน Shop เท่านั้น
-- ไม่แตะ Shop.userId @unique เดิม (แยก migration Phase 2 — ดู business_account_packages_owner_cutover)
-- WalletTransaction.reason มีอยู่แล้ว (feature 00003) — ไม่มี DDL เพิ่ม แค่ value ใหม่ระดับ app

-- 1) Shop: kind + lock fields
ALTER TABLE "Shop" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PERSONAL';
ALTER TABLE "Shop" ADD COLUMN "packageLockedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "packageLockReason" TEXT;
CREATE INDEX "Shop_userId_kind_idx" ON "Shop"("userId", "kind");
CREATE INDEX "Shop_kind_packageLockedAt_idx" ON "Shop"("kind", "packageLockedAt");

-- 2) ShopMember (ใหม่)
CREATE TABLE "ShopMember" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopMember_shopId_userId_key" ON "ShopMember"("shopId", "userId");
CREATE INDEX "ShopMember_userId_idx" ON "ShopMember"("userId");
CREATE INDEX "ShopMember_shopId_role_idx" ON "ShopMember"("shopId", "role");

ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) BusinessPackageSubscription (ใหม่) + enum
CREATE TYPE "BusinessPackageStatus" AS ENUM ('ACTIVE', 'LOCKED_RENEWAL_FAILED');

CREATE TABLE "BusinessPackageSubscription" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" "BusinessPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "nextRenewalAt" TIMESTAMP(3) NOT NULL,
    "lastRenewalAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPackageSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessPackageSubscription_ownerId_key" ON "BusinessPackageSubscription"("ownerId");
CREATE INDEX "BusinessPackageSubscription_status_nextRenewalAt_idx" ON "BusinessPackageSubscription"("status", "nextRenewalAt");

ALTER TABLE "BusinessPackageSubscription" ADD CONSTRAINT "BusinessPackageSubscription_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) ShopInvite (ใหม่)
CREATE TABLE "ShopInvite" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "invitedContact" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShopInvite_shopId_status_idx" ON "ShopInvite"("shopId", "status");
CREATE INDEX "ShopInvite_invitedContact_status_idx" ON "ShopInvite"("invitedContact", "status");

ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopInvite" ADD CONSTRAINT "ShopInvite_acceptedByUserId_fkey"
    FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Backfill ShopMember(OWNER) จาก Shop เดิมทุกแถว (idempotent — unique(shopId,userId) กันซ้ำ)
INSERT INTO "ShopMember" ("id", "shopId", "userId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "userId", 'OWNER', now(), now()
FROM "Shop"
ON CONFLICT ("shopId", "userId") DO NOTHING;
```

### 6.3 Migration SQL — Phase 2 (`business_account_packages_owner_cutover`) — 🛑 GATED, ห้าม apply พร้อม Phase 1

```sql
-- Migration: business_account_packages_owner_cutover | Feature: M00008-BusinessAccountPackages
-- 🛑 ห้าม apply จนกว่า: (a) Phase 1 ผ่าน burn-in + backfill ตรวจครบ 100%,
--    (b) grep audit `user.shop`/`session.user.shop`/`include:{shop:true}` (singular) ทุกจุดใน
--        src/app/(paces)/seller/**, src/lib/auth.ts, src/proxy.ts เสร็จและแก้ไว้พร้อม deploy คู่กัน
-- ต้อง apply DDL นี้ + แก้ prisma/schema.prisma (Shop.userId ตัด @unique, User.shop→User.shops Shop[])
-- ในดีพลอยเดียวกันเท่านั้น (ห้ามแยก — ดู §4 เหตุผล lie-state)

-- ตรวจชื่อ index unique จริงก่อน apply: \d "Shop" บน DB จริง (Prisma อาจตั้งชื่อ "Shop_userId_key" ตาม convention เดิม)
DROP INDEX "Shop_userId_key";
CREATE UNIQUE INDEX "Shop_userId_personal_key" ON "Shop"("userId") WHERE "kind" = 'PERSONAL';
```

### 6.4 วิธี Apply (ยังไม่รัน — รอ Controller/user ยืนยัน)

```bash
npx prisma generate
npx prisma validate
# prod = dev Supabase แชร์กัน — ขอ user ยืนยันก่อนทุกครั้ง (.env.local = Supabase)
npx dotenv -e .env.local -- npx prisma migrate deploy
```

ดู memory `project_prisma_migration_env_targets` (.env.local = Supabase dev/prod แชร์; .env = Docker ไม่มี DIRECT_URL ใช้ migrate ไม่ได้), `project_shared_db_drift_no_migrate_dev` (ห้าม `migrate dev`/`db pull` เด็ดขาด)

**🛑 งานออกแบบนี้ยังไม่ apply จริง / ยังไม่แก้ `prisma/schema.prisma` / ยังไม่รันคำสั่งใด ๆ ต่อ DB** — apply เมื่อ Controller/user ยืนยันในขั้น implement เท่านั้น (Phase 1 ก่อน, Phase 2 แยกรอบ)

### 6.5 Rollback

| Migration step | Rollback | ผลกระทบ |
|-----------------|----------|---------|
| `Shop.kind`/`packageLockedAt`/`packageLockReason` ADD COLUMN | `DROP COLUMN` x3 | ปลอดภัยถ้า rollback ก่อนมี Business shop จริง; หลังมีแล้ว = เสีย lock-state history (ไม่กระทบ Product/Order) |
| `ShopMember` table | `DROP TABLE "ShopMember"` | ปลอดภัยก่อนมี admin ถูก invite จริง; หลังจากนั้น = เสีย membership ทั้งหมด (ต้อง backfill ใหม่จาก `Shop.userId` ได้บางส่วน — เฉพาะ OWNER, ส่วน ADMIN หายถาวรถ้าไม่มี backup) |
| `BusinessPackageSubscription` table + enum | `DROP TABLE ...; DROP TYPE "BusinessPackageStatus";` | ปลอดภัยก่อนมี owner subscribe จริง; หลังจากนั้น = **เสียสถานะ subscription ทุก owner** (กลับเป็น FREE โดยไม่ได้ตั้งใจ — ผลเดียวกับ `InventoryEntitlement` rollback risk เดิม) |
| `ShopInvite` table | `DROP TABLE "ShopInvite"` | เสีย invite history/audit trail — ไม่กระทบ membership ที่ accept ไปแล้ว (อยู่ใน `ShopMember` แยกต่างหาก) |
| Indexes (Phase 1 ทั้งหมด) | `DROP INDEX ...` | ไม่มี data loss, กระทบ performance เท่านั้น |
| **Phase 2 (partial unique cutover)** | `DROP INDEX "Shop_userId_personal_key"; CREATE UNIQUE INDEX "Shop_userId_key" ON "Shop"("userId");` | **⚠️ ใช้ได้เฉพาะถ้ายังไม่มี owner คนไหนมี Business shop เกิน 1 แถว ณ ตอน rollback** — ถ้ามีแล้ว การสร้าง unique เต็มรูปแบบกลับคืนจะ fail ทันที (มี duplicate userId) ต้อง manual data-fix ก่อน (ย้าย/ลบ Business shop ส่วนเกินออกก่อน) |

Rollback Phase 1 ทันทีหลัง apply (ก่อนมี data จริง) = ปลอดภัยสมบูรณ์เกือบทุก step ยกเว้น `BusinessPackageSubscription`/`ShopMember` ที่ควรระวังตั้งแต่มี test data เข้าไปแล้วก็ตาม (dev = prod DB เดียวกัน — QA data บน DB นี้ก็ถือเป็น "ข้อมูลจริง" ระดับหนึ่ง)

### 6.6 ผลกระทบ (Impact)

- **Downtime:** ไม่มีสำหรับ Phase 1 — `ADD COLUMN` ที่มี DEFAULT/nullable = metadata-only ใน PG16; `CREATE TABLE` บน table ใหม่ไม่กระทบใคร
- **Phase 2 (`DROP INDEX` + `CREATE UNIQUE INDEX ... WHERE ...`):** `DROP INDEX` เร็ว/ไม่ lock; `CREATE UNIQUE INDEX` (partial) ต้องสแกน table เพื่อ validate ความ unique ของ subset — เป็น plain (ไม่ `CONCURRENTLY`) ตาม pattern 00003/00001 เพราะ `Shop` ยังเป็น table เล็ก (prod live ตั้งแต่ 2026-06-07) — ถ้า `Shop` โตมากก่อนถึง Phase 2 จริง ต้องพิจารณา `CREATE INDEX CONCURRENTLY` (รันนอก `migrate deploy` แยก transaction)
- **CREATE INDEX (Phase 1 composite/btree ทั้งหมด):** plain, ไม่ CONCURRENTLY — base เล็กเหมือนเหตุผลเดียวกับ 00003
- **Backfill (`ShopMember` จาก `Shop`):** เร็ว (จำนวน Shop ปัจจุบันเล็ก), ปลอดภัย 100% (idempotent ด้วย `ON CONFLICT DO NOTHING`, ไม่มี business logic เสี่ยงในนี้ — pure copy)
- **Backward compat:** `Shop`/`Product`/`Order` ที่ไม่แตะ column ใหม่ทำงานเหมือนเดิมทุกประการหลัง Phase 1; **Phase 2 มีผลกระทบ TypeScript build โดยตรง** (breaking relation type) — ต้องผ่าน `tsc` เต็ม repo ก่อน merge เสมอ ไม่ใช่แค่ migration สำเร็จ

---

## 7. Backward-Compat Guarantees

รับประกันตาม BR-BIZ-23/25 (Zero Regression) แยกตาม phase:

| ช่วง | Personal shop เดิม (query/flow ที่มีอยู่) | ผลกระทบ |
|------|---------------------------------------|---------|
| **หลัง Phase 1 apply** | `user.shop` (singular), `Shop.userId` unique, ทุก endpoint Product/Order/Review เดิม | **ไม่กระทบเลย** — column ใหม่ nullable/DEFAULT ทั้งหมด, ไม่มีการเปลี่ยน type/cardinality ใด ๆ ที่ TypeScript เห็น |
| **หลัง Phase 2 apply (พร้อม app cutover)** | `user.shop` (singular) **ใช้ไม่ได้แล้ว** ต้องเปลี่ยนเป็น `user.shops.find(s => s.kind==='PERSONAL')` หรือ helper กลาง | **Breaking ที่ตั้งใจ** — ครอบคลุมด้วย grep audit + regression test เต็ม (BR-BIZ-23-AC-03) ก่อน merge เท่านั้น |
| **ตลอดทุก phase** | `Product`/`Order` query ผ่าน `shopId` ตรง (ไม่ผ่าน `user.shop`) เช่น `prisma.product.findMany({ where: { shopId } })` | **ไม่กระทบเลยแม้แต่ Phase 2** — `shopId` เป็น scalar FK อยู่แล้ว ไม่เคย join ผ่าน `User.shop` ตอบโจทย์ latency concern BRD §6.2 โดยธรรมชาติของ schema design (ไม่ต้อง optimize เพิ่ม) |
| **ตลอดทุก phase** | Personal shop ที่มีอยู่ก่อน feature นี้ (isShop=true) | `kind` ได้ค่า `'PERSONAL'` อัตโนมัติจาก DEFAULT — query ผลลัพธ์เดิมทุกกรณี (ตรง FR-BIZ-23-AC-02) |

**สิ่งที่ยังต้องทำนอกเหนือ DATABASE.md (SRS/SDS/Developer scope):** สร้าง regression test suite ครอบคลุม endpoint/flow เดิมของ Personal shop/Order/Product (create, edit, cancel, list, public profile) เทียบ behavior ก่อน/หลัง Phase 2 — บังคับตาม FR-BIZ-23-AC-03

---

## 8. Data Retention & ข้อควรระวัง

- **Data Retention:**
  - Business ที่ถูก `packageLockedAt`/`packageLockReason` ตั้งค่า (LOCKED) — **ไม่ลบ/reset ข้อมูลใด ๆ** ตรง BR-BIZ-20 — `Product`/`Order`/`ShopMember`/`ShopInvite` ของ shop นั้นคงอยู่ครบ อ่านได้ปกติ เพียงแค่สร้าง/แก้ใหม่ถูก block ที่ service layer (ไม่ใช่ DB constraint — DB ยัง INSERT/UPDATE ได้ทางเทคนิค ต้อง enforce ที่ app layer ตาม FR-BIZ-20-AC-01)
  - `ShopMember` row ถูก **hard delete จริง** เมื่อ remove-admin (ไม่ใช่ retention concern เพราะเป็นแค่ access-grant record ไม่ใช่ business data — Order/Product ที่ admin เคยสร้างไม่ผูก FK กับ `ShopMember` เลยจึงไม่หายตาม)
  - `ShopInvite` (CANCELLED/ACCEPTED) เก็บถาวรไม่มี purge job — volume คาดว่าต่ำ (manual invite ไม่ใช่ high-frequency event) ไม่ต้อง partition/archive ใน MVP
  - **Open item:** ความหมายของปุ่ม "ลบ Business" (PRD §3.4 Owner-only action) ยังไม่ชัดว่าเป็น hard-delete cascade (ลบ `Shop`+`Product`+`Order` จริง) หรือเทียบเท่า permanent-lock (soft) — ต้อง confirm ตอน SRS ก่อน implement เพราะ FK ปัจจุบันบางเส้น (`Product→Shop`) เป็น `onDelete: Cascade` อยู่แล้ว (จะลบ Product ตามจริงถ้า hard-delete Shop) แต่บางเส้น (`Order→Shop`) **ไม่ระบุ onDelete** (default Restrict — จะลบ Shop ไม่ได้ถ้ามี Order ค้างอยู่) ความไม่สอดคล้องนี้มีอยู่ก่อน feature นี้แล้ว ไม่ใช่สิ่งที่ 00008 สร้างขึ้นใหม่ แต่ "ลบ Business" ทำให้ประเด็นนี้ต้องถูกตัดสินใจจริงจัง — **แนะนำ default: ปฏิบัติเหมือน permanent lock (ไม่ hard-delete)** สอดคล้อง Hard Rule "ห้าม drop ข้อมูลเว้นแต่สั่งชัด" จนกว่า SRS จะยืนยันเป็นอย่างอื่น

- **PII / ข้อมูลอ่อนไหว:**
  - `ShopInvite.invitedContact` = เบอร์โทร/อีเมล **ดิบ** — PII เทียบเท่า `Order.buyerContact`/`Review.reviewerContact` ที่มีอยู่แล้วในระบบ
  - **สำคัญ:** หน้า "จัดการ invite" ของ Owner จะอยู่ใต้ `(paces)/seller/**` ซึ่งใช้ client `VerticalLayout` — เข้าเงื่อนไขเดียวกับ memory `feedback_rsc_pii_neutralize_at_source` (Next serialize ทุก server data เข้า flight payload โดยไม่รู้ตัว) — **ต้อง mask/neutralize `invitedContact` ที่ server boundary** ก่อนส่งลง client component เหมือนที่เคย fix กับ `buyerContact`/`reviewerContact` ไปแล้ว — flag ให้ SDS/Developer ออกแบบตั้งแต่แรก อย่ารอให้เป็น incident แบบ S-C1 ซ้ำ

- **Performance:**
  - `ShopMember`/`BusinessPackageSubscription` ถูกเช็คทุกครั้งที่ request เข้า Business context (RBAC/authz gate) — ต้อง `select` เฉพาะ field ที่ใช้ (เช่น `{ role: true }`, `{ status: true }`) ห้ามดึงทั้ง row โดยไม่จำเป็น (hot path เดียวกับคำแนะนำของ `InventoryEntitlement` ใน 00003)
  - `BusinessPackageSubscription.(status, nextRenewalAt)` index มิเรอร์ pattern cron ของ `InventoryEntitlement` เป๊ะ — ใช้ query เดียวกันได้ทั้ง renewal job + advance-warning job (leading equality column `status`)
  - Personal-only user (ไม่มี Business เกี่ยวข้องเลย) — query ของ flow เดิมไม่ผ่าน `ShopMember` เลย (ดู §7) จึงไม่มี join เพิ่มที่กระทบ latency ตรง BRD §6.2

- **Consistency ข้าม store:** ไม่มี — PostgreSQL 16 (Supabase) เป็น store เดียวของทั้งฟีเจอร์ ไม่มี cross-store sync

---

## 9. Open Items (รอ confirm ตอน SRS ก่อน implement)

| # | หัวข้อ | สถานะ default ที่ใช้ในเอกสารนี้ | ทำไมต้อง confirm |
|---|--------|--------------------------------|-------------------|
| 1 | **Timing ของ Phase 2 constraint cutover** — bundle พร้อม Phase 1 ในดีพลอยเดียว หรือแยกรอบหลัง burn-in | แยกรอบ (ตาม spike guidance) | ต้องมี grep audit `user.shop` singular ทุกจุดเสร็จก่อน — ขนาดงานจริงกำหนด timeline ได้หลัง SDS สำรวจ call site ครบ |
| 2 | ~~**Downgrade-to-FREE เต็มรูป**~~ | **✅ RESOLVED 2026-07-02 (ดู §12):** cancel = lock ALL business (grace-eligible, 30 วัน) + DELETE subscription row ทันที; business ที่ไม่กลับมาใน 30 วัน → auto soft-delete → retention 30 วัน → purge | — |
| 3 | ~~**ความหมาย "ลบ Business"**~~ | **✅ RESOLVED 2026-07-02 (ดู §12):** soft-delete + 30-day retention + restore ได้; พ้น 30 วัน → purge (tombstone `purgedAt`, ไม่ physical DELETE — ดู RD-11) | — |
| 4 | **`ShopMember` 1-OWNER-ต่อ-shop invariant** — enforce ที่ DB (partial unique เพิ่มอีกตัว) หรือ app layer เท่านั้น | app layer เท่านั้น | ไม่มี ownership-transfer/co-ownership ใน MVP (out-of-scope) risk ต่ำ พิจารณาเพิ่มถ้า Phase 2 ของ feature (co-ownership) ถูกอนุมัติ |
| 5 | **`WalletTransaction.reason` ค่าใหม่** — ใช้รูปเต็ม `"BUSINESS_PACKAGE_SUBSCRIPTION"` หรือรูปย่อ `"BUSINESS_PACKAGE"` ตามที่ Controller เสนอไว้ตอนแรก | รูปเต็ม (เข้าชุดกับ `INVENTORY_SUBSCRIPTION`) | ต้อง sync SRS/`wallet.service.deductCredit()` call-site ให้ตรงกัน — ห้ามแก้ทีหลังโดยไม่ sync กลับมาที่เอกสารนี้ (เหมือน 00003 บทเรียน) |
| 6 | **Grace/burn-in period ก่อน Phase 2** — ควรมี regression-test window นานเท่าไรก่อนอนุญาต cutover | ไม่ได้กำหนดตัวเลข | เป็น process decision ของทีม ไม่ใช่ data-model decision |

---

## 10. Traceability

| Table / Field | BRD | PRD | สถานะ |
|--------------|-----|-----|-------|
| `ShopMember` (ทั้ง table) | FR-BIZ-06-AC-01, FR-BIZ-09..14, BR-BIZ-12..15 | D-1, §3.2-3.5, §9.1 | Draft — **FROZEN CONTRACT** ตรง D-1 literal (`ShopMember{shopId, userId, role}`) |
| `Shop.kind` | FR-BIZ-06-AC-03, BR-BIZ-09 | D-1, D-3, §3.2 | Draft — FROZEN CONTRACT |
| `Shop.packageLockedAt`/`packageLockReason` | FR-BIZ-18..21, BR-BIZ-18..21 | §3.7-3.9, §4.3 | Draft |
| `BusinessPackageSubscription` (ทั้ง table) + enum | FR-BIZ-01..05, BR-BIZ-01..07 | §3.1, §4.3, Billing source note | Draft — **FROZEN CONTRACT** |
| `BusinessPackageSubscription.(status, nextRenewalAt)` index | FR-BIZ-02 (renewal cron), FR-BIZ-03 (advance warning) | §3.1 | Draft |
| `ShopInvite` (ทั้ง table) | FR-BIZ-09..11, BR-BIZ-15 | §3.3 | Draft — **FROZEN CONTRACT** |
| `WalletTransaction.reason` ค่าใหม่ | FR-BIZ-22-AC-04, BR-BIZ-24 | §3.1, §3.10 | Draft — sync SRS (deductCredit call-site) ก่อน implement |
| `Shop.userId` relax (Phase 2 partial unique) | FR-BIZ-06-AC-01/03, BR-BIZ-09 | D-1, §6.2 Risk #1 (Executive Summary) | Draft — **gated migration, ดู §4/§9-1** |
| Backward-compat guarantee (§7) | FR-BIZ-23-AC-01..03, BR-BIZ-25 | §3.11 | Draft |

---

## 11. สรุป (Summary)

Migration หลักแบ่งเป็น **2 phase ที่ต้องแยก apply**:

- **Phase 1 (additive, ปลอดภัยสมบูรณ์):** สร้าง table ใหม่ 3 ตัว (`ShopMember`, `BusinessPackageSubscription` + enum `BusinessPackageStatus`, `ShopInvite`) + เพิ่ม 3 nullable/DEFAULT column บน `Shop` (`kind`, `packageLockedAt`, `packageLockReason`) + 8 index ใหม่ + backfill idempotent — **ไม่กระทบ row เดิมบน prod แม้แต่ตัวเดียว ไม่มี breaking TypeScript change**
- **Phase 2 (constraint cutover, gated แยกรอบ):** ตัด `Shop.userId @unique` เดิม เปลี่ยนเป็น partial unique `WHERE kind='PERSONAL'` (raw SQL, Prisma DSL ไม่รองรับ partial index — ต้องเขียน comment กำกับถาวรกัน `db pull`/`migrate dev` ทำลายทิ้ง) — **breaking change ที่ตั้งใจ** ต่อ `User.shop Shop?` → `User.shops Shop[]` ต้อง grep audit ทุก call site ก่อน apply และ apply DDL+schema.prisma change พร้อมกันเดียวเสมอ

`WalletTransaction` ไม่มี DDL เพิ่ม — reuse `reason` column จาก feature 00003 บวกค่าใหม่ `"BUSINESS_PACKAGE_SUBSCRIPTION"` เท่านั้น Business Package subscription/Inventory Add-on entitlement **แยกขาดสมบูรณ์ตาม D-2** ไม่มี FK เชื่อมกันเลย

**Sync กับ SRS (ต้องทำก่อน implement):**
- Confirm §9 ข้อ 1-6 ทั้งหมด โดยเฉพาะ timing Phase 2 cutover + downgrade-to-FREE semantics + "ลบ Business" semantics
- SDS ต้องออกแบบ helper กลาง (`getPersonalShop(user)` หรือเทียบเท่า) เพื่อจำกัด blast radius ของ `User.shop`→`User.shops` breaking change
- Grep audit เต็ม repo (`user.shop`, `session.user.shop`, `include: { shop: true }` singular pattern) ก่อน Phase 2 apply — ส่งรายการกลับมาให้ Controller ตรวจ scope ก่อน sign-off Gate 1

**Risks ที่ flag ให้ SRS แล้ว:**
1. Core relation change (`Shop.userId` 1:1→1:N) = ความเสี่ยงสูงสุดของ feature — จัดการด้วย 3-phase plan (§4)

---

## 12. Lifecycle Extension Delta (2026-07-02 — sync จาก SRS/SDS decision)

> เกิดจาก user decision 3 ข้อ (soft-delete+restore, cancel→lock→purge, RBAC defer) ที่ override §9 open item #2/#3 เดิม — sync เข้า schema แล้ว. **Additive ทั้งหมด (Phase 1)** — รวมเข้า migration `add_business_account_packages` เดิมได้

### 12.1 `Shop` — field lifecycle เพิ่ม (Phase 1, additive)

| Column | Type | Null | Default | เหตุผล |
|--------|------|------|---------|--------|
| `deletedAt` | `TIMESTAMP(3)` | YES | NULL | Soft-delete marker — NULL เสมอสำหรับ PERSONAL; ตั้งเมื่อ manual delete (FR-BIZ-25) หรือ auto หลัง grace lapse (FR-BIZ-28); restore ได้ภายใน 30 วัน |
| `deletedReason` | `TEXT` | YES | NULL | `"OWNER_DELETED"` \| `"PACKAGE_LAPSED"` — String ตาม convention |
| `purgedAt` | `TIMESTAMP(3)` | YES | NULL | Tombstone marker หลัง retention 30 วัน — **🛑 ไม่ใช่ physical DELETE** (ดู RD-11) — row ยังอยู่ครบ แค่ exclude จากทุก list/quota ถาวร |

```prisma
model Shop {
  // ...field เดิม (kind, packageLockedAt, packageLockReason จาก §3.2)...
  // --- feature 00008 lifecycle extension (decision 2026-07-02) ---
  deletedAt     DateTime? // soft-delete — NULL เสมอสำหรับ PERSONAL
  deletedReason String?   // "OWNER_DELETED" | "PACKAGE_LAPSED"
  purgedAt      DateTime? // tombstone หลัง 30-day retention — ไม่ลบ row จริง (FK Order restrict + Hard Rule)

  @@index([kind, packageLockReason, packageLockedAt], map: "Shop_kind_lockReason_lockedAt_idx") // cron: auto-soft-delete lapsed grace
  @@index([deletedAt, purgedAt], map: "Shop_deletedAt_purgedAt_idx") // cron: purge expired retention
}
```

**Migration SQL (เพิ่มใน Phase 1 `add_business_account_packages`):**
```sql
ALTER TABLE "Shop" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "deletedReason" TEXT;
ALTER TABLE "Shop" ADD COLUMN "purgedAt" TIMESTAMP(3);
CREATE INDEX "Shop_kind_lockReason_lockedAt_idx" ON "Shop"("kind", "packageLockReason", "packageLockedAt");
CREATE INDEX "Shop_deletedAt_purgedAt_idx" ON "Shop"("deletedAt", "purgedAt");
```

### 12.2 `packageLockReason` — ค่าใหม่ (additive value, ไม่มี DDL)

เพิ่ม `"OWNER_CANCELLED_PACKAGE"` — รวมเป็น 4 ค่า: `RENEWAL_FAILED` \| `OWNER_CANCELLED_PACKAGE` \| `QUOTA_EXCEEDED_BUSINESS_COUNT` \| `QUOTA_EXCEEDED_ADMIN_COUNT`
- **2 ค่าแรก = grace-eligible** (นับ 30 วัน → auto soft-delete)
- **2 ค่าหลัง = ไม่มี grace** (ค้างจนกว่า owner แก้เอง — upgrade/ลบ admin/ลบ business)

### 12.3 Lifecycle Cron (`business-package-lifecycle`) — 3 phase ใน endpoint เดียว

รวม renewal (Phase 1) + auto-soft-delete-lapsed (Phase 2) + purge-tombstone (Phase 3) เป็น cron เดียว (ลดความเสี่ยง Vercel Hobby cron-count limit) — reuse `CRON_SECRET` + pattern `/api/cron/inventory-renewal`. Query ใช้ index ใหม่ §12.1

### 12.4 Query semantics ที่เปลี่ยน (documented, ไม่มี schema เพิ่ม)

- **Business-count quota** (create/restore) ต้องกรอง `deletedAt: null` — soft-deleted ไม่กินโควตา
- **`BusinessPackageSubscription` cancel** = DELETE row ทันที (grace timer อยู่ที่ `Shop.packageLockedAt` ต่อ shop ไม่ใช่ที่ subscription row) — ไม่ต้องเพิ่ม field

### 12.5 🛑 RD-11 — Purge = tombstone (ต้อง user ยืนยันชั้นสุดท้าย)

**คำว่า "ลบ (purge)" ในเอกสารนี้ = ตั้ง `purgedAt` marker ไม่ใช่ `DELETE FROM Shop` จริง** เพราะ:
- FK `Order.shopId` = Restrict → physical DELETE จะ fail ถ้ามี Order ค้าง (แทบทุกกรณีจริง)
- FK `Product.shopId` = Cascade → ถ้าลบสำเร็จจะพา Product หายด้วย = ขัด Hard Rule "ห้าม drop ข้อมูลเว้นแต่สั่งชัด"

**ผลลัพธ์เชิงพฤติกรรม:** business หายจากทุก list/quota/switcher ถาวร (เหมือนถูกลบ 100% จากมุมผู้ใช้) แต่ข้อมูลดิบยังอยู่ใน DB. **ถ้า user ต้องการลบข้อมูลจริง (physical/privacy)** ต้อง sign-off แยก + ออกแบบ compensating step เพิ่ม (anonymize Order ก่อน หรือยอมรับ Product loss)
2. Prisma ไม่รองรับ partial unique index ใน DSL — ต้อง raw SQL ถาวร + ห้าม `db pull`/`migrate dev` ตลอดไปสำหรับ table นี้ (ทับซ้อนกับกฎ shared-DB-drift เดิม แต่ย้ำเฉพาะจุด)
3. PII (`ShopInvite.invitedContact`) ต้อง neutralize-at-source ที่ RSC boundary ตั้งแต่ design แรก ไม่ใช่ patch ทีหลัง
4. "ลบ Business" semantics ที่ยังไม่ชัด อาจชนกับ FK `Order→Shop` restrict ที่มีอยู่ก่อนแล้ว — ต้อง SRS ตัดสินใจก่อน implement ปุ่มนี้

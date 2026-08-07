---
title: "DATABASE — ตัวจัดหน้าร้าน (Shop Page Builder)"
owner: shinobu22
status: draft
module: M00035-ShopPageBuilder
version: "1.0"
created: 2026-08-07
tags: [feature, database, prisma, postgres, shop, facebook-post, badge, public-profile, unmanaged-sql, check-constraint]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00035-ShopPageBuilder
> **ประเภทเอกสาร:** DATABASE Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-07
> **สถานะ:** Draft — รอ user review คู่กับ PRD/BRD (Hard Rule 11) ก่อนส่งต่อ SRS/SDS
> **เจ้าของเอกสาร:** safepay-database (ดู [[Feature-Docs-Ownership]])

# DATABASE: ตัวจัดหน้าร้าน (Shop Page Builder)

---

> 🛑 **ถ้าใครเห็น mockup แล้วสับสน ให้ยึดมติ + schema ในไฟล์นี้เป็นหลัก**
>
> `docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html` วาดพื้นที่จัดหน้าเป็นบล็อกไล่ลง
> มาต่อเนื่องไม่มีแท็บคั่น (ทรง single-column feed) — นั่นคือ **ข้อเสนอเดิมของทีมที่ user ปฏิเสธแล้ว**
> ในมติปิดข้อเปิด #1 (ดู §7 และท้าย BRD "มติที่ user ยืนยันแล้ว 2026-08-07")
>
> **มติจริงที่ schema นี้ยึดคือ:** คงโครงแท็บเดิม (`ProfileTabs` ไม่ถูกรื้อ) — สิ่งที่ร้านจัดลำดับได้มี
> แค่ 2 อย่าง: **ลำดับแท็บ** (`ShopPageLayout.tabOrder`, 7 คีย์คงที่) และ **บล็อกเหนือแถบแท็บ**
> (`ShopPageBlock` — เหรียญตราเด่น 1 บล็อก + โพสต์ Facebook รายโพสต์) เท่านั้น "บล็อกโครงหน้า"
> (ห้องพัก/ปฏิทิน/บริการ/สินค้า) ที่ mockup วาดเป็นการ์ดกดบวกเพิ่มได้ **ไม่มีตัวแทนในฐานข้อมูลนี้เลย**
> เพราะหลังมติ มันยังเป็นแท็บอัตโนมัติเหมือนวันนี้ทุกประการ ปรับได้แค่ตำแหน่งผ่าน `tabOrder`

---

## 1. Overview

ตัวจัดหน้าร้านให้ร้านเลือก/จัดลำดับสิ่งที่แสดง **เหนือแถบแท็บ** ของหน้าร้านสาธารณะ (`/u/[username]`,
`/b/[slug]`) บวกลำดับของ **แท็บเอง** โดยไม่แตะโครงแท็บเดิม (`ProfileTabs.tsx`) — ขอบเขตนี้ถูกล็อกโดยมติ
user 2026-08-07 ข้อ 1 ซึ่งปฏิเสธข้อเสนอเดิม "แปลงเป็น single-column feed" เพื่อไม่รื้อ IA ที่ผ่าน
sign-off ไปแล้ว 2026-07-26 (ดู callout ด้านบน)

งานฐานข้อมูลจริงของฟีเจอร์นี้มี 3 ส่วน:

1. **`ShopPageLayout`** (ตารางใหม่ 1:1 กับ `Shop`) — สวิตช์เผยแพร่ทั้งหน้า (FR-PGB-14) + ลำดับแท็บ
   (มติข้อ 1)
2. **`ShopPageBlock`** (ตารางใหม่ หลายแถวต่อ `Shop`) — บล็อกเหนือแถบแท็บ 2 ชนิด: เหรียญตราเด่น
   (BR-PGB-06, มติข้อ 3 สูงสุด 4 ใบ) และโพสต์ Facebook รายโพสต์ (BR-PGB-05)
3. **`FacebookPost`** (ตารางเดิม feature 00029) — เพิ่ม 2 คอลัมน์ nullable สำหรับสำเนารูปปกที่ mirror
   ลง storage ของเราแล้ว (มติข้อ 2 — mirror ตอนกดเพิ่มเท่านั้น ไม่ mirror ทั้งคลัง)

ไม่มีตารางสำหรับสถานะ "ร่าง" — พิจารณาแล้วว่าไม่ต้องมีที่เก็บฝั่ง DB (เหตุผลเต็มดู §6)

- **เอกสารออกแบบต้นทาง:** `docs/20 - Features/00035 - Shop Page Builder/{PRD,BRD}.md` (ดูบล็อก
  "มติที่ user ยืนยันแล้ว 2026-08-07" ท้ายทั้งสองไฟล์) + มติของ database agent ในไฟล์นี้สำหรับ 4
  จุดที่ BRD เปิดไว้ให้ตัดสินระดับ schema (§7)
- **Store ที่เกี่ยวข้อง:** PostgreSQL 16 (Supabase) ตัวเดียวกับทั้งระบบ ผ่าน Prisma Client — ไม่มี store ใหม่
- **Engine / Charset:** ไม่เปลี่ยนจากที่มีอยู่ (`InnoDB`/`utf8mb4` ไม่เกี่ยวข้อง — โปรเจกต์นี้ใช้ Postgres ล้วน)

---

## 2. ERD

```mermaid
erDiagram
    Shop ||--o| ShopPageLayout : "1:1 สวิตช์เผยแพร่ + ลำดับแท็บ"
    Shop ||--o{ ShopPageBlock : "บล็อกเหนือแถบแท็บของร้านนี้"
    FacebookPost ||--o{ ShopPageBlock : "type=FACEBOOK_POST อ้างถึง (Cascade)"
    ShopPageBlock }o..o{ UserBadge : "type=BADGE_HIGHLIGHT เก็บ id ใน badgeIds[] (ไม่มี FK จริง)"
    UserBadge }o--|| Badge : "earned (Badge.type ตัดสิน ACHIEVEMENT/VERIFICATION)"

    Shop {
        string id PK
        string slug "public URL /b/{slug}"
        string vertical "ONLINE_SALES|SERVICE_QUEUE|LODGING — ไม่แตะ"
    }
    ShopPageLayout {
        string id PK
        string shopId FK "unique — 1:1 Shop, lazily created ตอนกดบันทึกครั้งแรก"
        boolean isPublished "default true (zero-regression) — fallback ที่ service เมื่อไม่มีแถว"
        text_array tabOrder "ลำดับ 7 tab key ที่ร้านจัด; ว่าง = default เดิม"
        datetime createdAt
        datetime updatedAt
    }
    ShopPageBlock {
        string id PK
        string shopId FK
        string type "BADGE_HIGHLIGHT|FACEBOOK_POST — CHECK"
        int sortOrder "ตำแหน่งในกลุ่มบล็อกเหนือแถบแท็บ"
        text_array badgeIds "UserBadge.id ที่เลือก — เฉพาะ BADGE_HIGHLIGHT, สูงสุด 4 (CHECK)"
        string facebookPostId FK "เฉพาะ FACEBOOK_POST — Cascade เมื่อโพสต์ต้นทางหาย"
        datetime createdAt
        datetime updatedAt
    }
    FacebookPost {
        string id PK
        string shopChannelId FK "ไม่แตะ"
        string thumbnailUrl "URL ของ Meta ตรง ๆ (หมดอายุได้) — ไม่แตะ"
        string mirroredFileId "NEW — storage fileId ของสำเนารูปปก (มติข้อ 2)"
        datetime mirroredAt "NEW"
    }
    UserBadge {
        string id PK
        string userId FK
        string shopId FK "nullable — NULL=personal badge"
        string badgeId FK
    }
    Badge {
        string id PK
        string type "ACHIEVEMENT|VERIFICATION"
    }
```

---

## 3. Tables

### 3.1 `ShopPageLayout` (PostgreSQL 16, Supabase — ตารางใหม่)

การตั้งค่าระดับหน้าร้าน 1 แถวต่อ 1 ร้าน — สวิตช์เผยแพร่ทั้งหน้า (FR-PGB-14) และลำดับแท็บ (มติ user
2026-08-07 ข้อ 1) แยกออกจาก `Shop` model ตามเหตุผลเดียวกับ `AutoReplyConfig`/`ShopAiSetting`: `Shop`
ถูกอ่านแทบทุก request ในระบบ พกค่าที่ใช้เฉพาะตอนเปิดหน้าร้าน/ตัวจัดหน้าร้านไปด้วยทุก query เป็นการเปลืองเปล่า

| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| `id` | `text` | `NO` | `-` (Prisma generate ที่ client) | `PK` |
| `shopId` | `text` | `NO` | `-` | `FK Shop.id, UNIQUE` |
| `isPublished` | `boolean` | `NO` | `true` | `-` |
| `tabOrder` | `text[]` | `NO` | `'{}'` | `-` |
| `createdAt` | `timestamp(3)` | `NO` | `CURRENT_TIMESTAMP` | `-` |
| `updatedAt` | `timestamp(3)` | `NO` | `-` (Prisma `@updatedAt`) | `-` |

หมายเหตุสำคัญ:
- `isPublished` default `true` มีผล **เฉพาะตอน INSERT แถวใหม่** — ร้านที่ยังไม่เคยเปิดตัวจัดหน้าร้านเลย
  **ไม่มีแถวนี้อยู่** จนกว่าจะกดบันทึกครั้งแรก ฝั่ง service ต้อง fallback เป็น `true`
  เมื่อ `findUnique` คืน `null` ห้ามพึ่ง DB default อย่างเดียว (ไม่งั้นร้านเดิมทุกร้านจะถูกตีความว่า
  "ไม่เผยแพร่" เพราะไม่มีแถว ไม่ใช่เพราะตั้งใจปิด)
- `tabOrder` ค่าที่ถูกต้อง 7 ตัวเท่านั้น (SSOT: `TAB_ICON` keys ใน
  `src/views/pages/user-profile/v2/ProfileTabs.tsx`): `pinned`, `rooms`, `calendar`, `services`,
  `items`, `about`, `reviews` — validate ที่ Valibot ชั้นเดียว ไม่มี CHECK ที่ DB (มิเรอร์
  `Shop.categories`/`Shop.salesChannels` ที่ pattern เดียวกัน) เพราะ key แปลกปลอมไม่ทำอันตราย —
  `ProfileTabs` ยังตัดสินเองว่าแท็บไหน render จริงจากข้อมูลที่มี ไม่ใช่จาก `tabOrder`

### 3.2 `ShopPageBlock` (PostgreSQL 16, Supabase — ตารางใหม่)

บล็อกที่ร้านเพิ่มเข้า "พื้นที่เหนือแถบแท็บ" — หลายแถวต่อร้าน มี 2 ชนิดเท่านั้นในเฟสนี้ (ดู callout
ด้านบนของไฟล์นี้เรื่องขอบเขตที่ถูกตัดจาก mockup ฉบับร่าง)

| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| `id` | `text` | `NO` | `-` | `PK` |
| `shopId` | `text` | `NO` | `-` | `FK Shop.id` |
| `type` | `text` | `NO` | `-` | CHECK IN `('BADGE_HIGHLIGHT','FACEBOOK_POST')` |
| `sortOrder` | `integer` | `NO` | `0` | `-` |
| `badgeIds` | `text[]` | `NO` | `'{}'` | เฉพาะ `type='BADGE_HIGHLIGHT'`, CHECK `cardinality<=4` |
| `facebookPostId` | `text` | `YES` | `NULL` | `FK FacebookPost.id`, เฉพาะ `type='FACEBOOK_POST'` |
| `createdAt` | `timestamp(3)` | `NO` | `CURRENT_TIMESTAMP` | `-` |
| `updatedAt` | `timestamp(3)` | `NO` | `-` | `-` |

หมายเหตุสำคัญ:
- **หัวโปรไฟล์ (`ProfileHero`) ไม่มีแถวของตัวเองในตารางนี้เลย** — ตรึงบนสุดตายตัวเสมอ (BR-PGB-01, D-9)
  ไม่ใช่ "ค่าเริ่มต้น" ที่ปรับ/ลบได้ จึงไม่มี "ประเภทบล็อก" สำหรับหัวโปรไฟล์
- `badgeIds` เก็บ **`UserBadge.id`** (เหรียญที่ร้าน/ผู้ใช้นี้ **ได้รับจริง**) ไม่ใช่ `Badge.id` (ประเภท
  เหรียญเฉย ๆ) — ทำงานถูกทั้ง PERSONAL shop (`UserBadge.shopId=null`) และ BUSINESS shop
  (`UserBadge.shopId=<shop นี้>`) ที่ query เดียวกัน ฝั่งอ่านต้อง filter `Badge.type='ACHIEVEMENT'`
  ซ้ำเสมอ (VERIFICATION ห้ามเลือกได้แม้ id จะหลุดเข้ามาในอนาคต, D-10)
- `facebookPostId` FK เป็น **`ON DELETE CASCADE`**: โพสต์ต้นทางหายไป (channel ถูกลบ/sync ใหม่แล้ว
  โพสต์หายจริงบน Meta) → แถวบล็อกนี้หายไปด้วยเงียบ ๆ ไม่ error ไม่เหลือ orphan ให้เจ้าของร้านต้องมา
  ล้างเอง ("หน้าร้านไม่พัง" ตาม BRD §3.6 mindset)
- `badgeIds` **ไม่มี FK จริง** เพราะ MVP badge ไม่เคยถูกถอด (Core System 2: "MVP มีแต่ขึ้น (no
  penalties)") และโปรเจกต์นี้ไม่มี trigger ที่ไหนเลย แต่ออกแบบให้ทนล่วงหน้า: ฝั่งอ่านต้อง query
  `UserBadge` ที่ id ตรงกับ array นี้จริง + ยังเป็นของร้าน/ผู้ใช้นี้ แล้ว render เฉพาะที่ match — id
  ที่หายไปเงียบ ๆ หลุดออกจากผลลัพธ์ ไม่ทำให้ query พัง

### 3.3 `FacebookPost` (PostgreSQL 16, Supabase — ตารางเดิม feature 00029, เพิ่มคอลัมน์)

เพิ่ม 2 คอลัมน์ nullable เท่านั้น ไม่แตะคอลัมน์เดิมสักจุดเดียว (`id`/`shopChannelId`/`externalPostId`/
`message`/`permalink`/`thumbnailUrl`/`createdTime`/`lastCommentAt`/`mediaType`/`reactionCount`/
`fbCommentCount`/`shareCount`/`statsSyncedAt`/`createdAt`/`updatedAt` — ดู `prisma/schema.prisma:2646`)

| Column | Type | Null | Default | Key |
|--------|------|------|---------|-----|
| `mirroredFileId` | `text` | `YES` | `NULL` | `-` (**NEW**) |
| `mirroredAt` | `timestamp(3)` | `YES` | `NULL` | `-` (**NEW**) |

หมายเหตุสำคัญ:
- **เก็บเป็น "fileId ของ storage" ไม่ใช่ URL ดิบ** — pattern เดียวกับ `ChatMessage.imageUrl` เดิม
  (ชื่อคอลัมน์ตั้งชัดกว่านั้นเพื่อไม่ให้สับสนซ้ำ) ต้อง resolve ผ่าน `getFileUrl(fileId)`
  (`src/lib/storage/index.ts`) ตอน render
- **ทำไมเก็บที่ `FacebookPost` ไม่ใช่ที่ `ShopPageBlock`:** เป็นคุณสมบัติของ "โพสต์นี้มีสำเนาถาวรแล้ว"
  ไม่ใช่ "การจัดวางครั้งนี้บนหน้านี้" — ถ้าร้านเอาบล็อกออกแล้วเพิ่มโพสต์เดิมกลับมาใหม่ (`ShopPageBlock`
  แถวเก่าถูกลบไปแล้วตามปกติของการ remove block) ไม่ต้อง mirror ซ้ำ (เช็ค `mirroredFileId IS NULL`
  ก่อนเรียก mirror ทุกครั้ง) และ cleanup ผูกกับวงจรชีวิตของ `FacebookPost` เอง ไม่ใช่ของ
  `ShopPageBlock` ที่มาจากคนละฟีเจอร์ (00035) กับตารางที่ถูกแก้ (00029)
- **ต้องเรียก `mirrorRemoteImage()` ที่มีอยู่แล้ว** (`src/services/channel-chat.service.ts:381`,
  feature 00018) — มี allow-list host ของ Meta CDN + SSRF guard + streaming size cap (25MB) พร้อม
  ใช้งานอยู่แล้ว **ห้ามเขียน mirror logic ใหม่ซ้ำ**
- `mirroredFileId IS NULL` มีสองความหมายที่แยกไม่ออกจากคอลัมน์นี้อย่างเดียว: "ไม่เคยถูกเพิ่มลงหน้าร้าน
  เลย" (ปกติ, กรณีส่วนใหญ่) กับ "เพิ่มแล้วแต่ mirror ล้ม" (ต้อง retry) — ถ้า SDS ต้องแยกสองกรณีนี้ ให้
  เพิ่ม field สถานะแยกตอนนั้น ไม่ใช่เดาจากคอลัมน์นี้อย่างเดียว (ปัจจุบันไม่มี FR ที่ต้องแยก)

---

## 4. Indexes

| Table | Columns | Type | Rationale (query pattern ที่รองรับ) |
|-------|---------|------|--------------------------------------|
| `ShopPageLayout` | `(shopId)` | `UNIQUE` | 1:1 lookup — public profile render + builder load อ่านทุกครั้งที่เปิดหน้าร้าน |
| `ShopPageBlock` | `(shopId, sortOrder)` | `BTREE composite` | query หลัก: "บล็อกของร้านนี้ เรียงตามตำแหน่ง" ใช้ทั้ง public profile render และ builder canvas load |
| `ShopPageBlock` | `(facebookPostId)` | `BTREE` | join efficiency ตอน render + lookup ย้อนกลับตอนแก้/ตรวจ `FacebookPost` |
| `ShopPageBlock` | `(shopId)` WHERE `type='BADGE_HIGHLIGHT'` | `UNIQUE (partial, unmanaged SQL)` | เหรียญตราเด่นมีได้แถวเดียวต่อร้าน (BR-PGB-06) — Prisma DSL ประกาศ partial index ไม่ได้ |
| `ShopPageBlock` | `(shopId, facebookPostId)` WHERE `type='FACEBOOK_POST' AND facebookPostId IS NOT NULL` | `UNIQUE (partial, unmanaged SQL)` | กันเพิ่มโพสต์เดิมซ้ำในร้านเดียวกัน (FR-PGB-05 "ไม่แสดงปุ่มเพิ่มซ้ำ") |

🛑 ทั้งสอง partial unique index เป็น **unmanaged SQL** ที่ Prisma DSL ประกาศไม่ได้ (เหมือน
`UserBadge_shopId_badgeId_key`, `Shop_userId_personal_key`) — ห้าม `prisma db pull`/`migrate dev`
หลัง apply migration นี้เด็ดขาด เพราะ introspection จะไม่เห็นแล้วพยายาม DROP ทิ้ง

---

## 5. Migration Plan

### 5.1 ลำดับการ Migrate

| ลำดับ | การเปลี่ยนแปลง | Submodule / Store | หมายเหตุ (dependency) |
|-------|----------------|--------------------|------------------------|
| 1 | สร้างตาราง `ShopPageLayout` + FK → `Shop` | Prisma → PostgreSQL (Supabase) | ไม่มี dependency |
| 2 | สร้างตาราง `ShopPageBlock` + FK → `Shop`, `FacebookPost` + index + CHECK | Prisma → PostgreSQL (Supabase) | ต้องมีลำดับ 1 ก่อน (ไฟล์เดียวกัน รันตามลำดับในไฟล์อยู่แล้ว) |
| 3 | เพิ่ม `FacebookPost.mirroredFileId` / `mirroredAt` | Prisma → PostgreSQL (Supabase) | ไม่มี dependency ข้ามกับ 1-2 |

ทั้งหมดอยู่ในไฟล์เดียว: `prisma/migrations/20260807090000_shop_page_builder/migration.sql`
(เขียนมือ — **ไม่ผ่าน `prisma migrate dev`** ตาม Hard Rule 14/15) ตาราง 2 ตารางที่สร้างใหม่ไม่มีข้อมูล
อยู่ก่อน จึงเพิ่ม CHECK ตอน `CREATE TABLE` ได้ตรง ๆ โดยไม่ต้อง `NOT VALID`+`VALIDATE` — กฎ additive-CHECK
ใน `docs/conventions/migration-check-constraint-additive.md` ครอบเฉพาะ CHECK บนตาราง/คอลัมน์ที่มี
ข้อมูลอยู่แล้วและเสี่ยงชนกับ branch อื่นที่แก้ CHECK เดิมพร้อมกัน (เช่น `Shop_vertical_check`,
`OrderEvent_type_check`) ไม่ครอบตารางที่เพิ่งถูกสร้างในไฟล์เดียวกันนี้

**สคริปต์ตรวจก่อน migrate จริง (รันบนฐานเป้าหมายก่อนทุกครั้ง):**

```sql
-- 1) ไม่ชนชื่อกับ branch อื่นที่ยัง migrate ไม่ merge
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('ShopPageLayout','ShopPageBlock');
-- คาดหวัง: 0 แถว

SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='FacebookPost'
   AND column_name IN ('mirroredFileId','mirroredAt');
-- คาดหวัง: 0 แถว

-- 2) baseline จำนวนร้าน (ทุกร้านต้องเห็นเป็น "เผยแพร่" หลัง migrate แม้ยังไม่มีแถว ShopPageLayout เลย)
SELECT count(*) FROM "Shop" WHERE "deletedAt" IS NULL;

-- 3) ปริมาณ FacebookPost ปัจจุบัน (บริบทประเมินต้นทุน mirror ในอนาคต)
SELECT count(*) FROM "FacebookPost";
```

**การรันจริง — แยกให้ชัดระหว่าง prod กับ local ตาม Hard Rule 15:**

🛑 **prod ไม่ต้องสั่ง migrate เอง** — `vercel.json` → `buildCommand: "prisma migrate deploy && prisma
generate && next build"` ทำให้ **push branch นี้เข้า `main` = migrate ขึ้น prod ทันทีในตัว deploy**
ห้ามมีใครสั่ง `migrate deploy` ชี้ prod จากเครื่อง dev ด้วยมือไม่ว่ากรณีใด (ความเสี่ยงล้วน ๆ ไม่ได้แลก
อะไรกลับมา — ดู Hard Rule 14 เรื่องฐาน prod เคยถูกล้างทั้งฐานมาแล้วจากคำสั่ง Prisma ที่ชี้ผิดที่)

🛑 **ฐาน local ยังต้อง apply เอง** — Vercel เห็นเฉพาะฐานที่ deployment ชี้ ไม่เห็น Docker บนเครื่องผู้ใช้
คำสั่งต้อง**ปักหมุด URL localhost ไว้ในคำสั่งเอง** ห้ามใช้ `$(...)`/ตัวแปรที่อ่านจาก `.env.local` (Hard
Rule 14 — guard พิสูจน์ปลายทางจากตัวคำสั่งไม่ได้ถ้าใช้ตัวแปร) พอร์ต/user/password ตามค่าเริ่มต้นใน
`docker-compose.yml`/`.env.example` ของโปรเจกต์นี้คือ `safepay:safepay@localhost:5432/safepay` —
**ตรวจพอร์ตจริงของ worktree ตัวเองก่อนรัน** (บาง worktree รีแมปพอร์ตกันชนกับ worktree อื่นที่รันขนาน
อยู่) แล้วเขียนเลขนั้นลงในคำสั่งตรง ๆ:

```bash
DATABASE_URL="postgresql://safepay:safepay@localhost:5432/safepay" \
DIRECT_URL="postgresql://safepay:safepay@localhost:5432/safepay" \
  npx prisma migrate deploy
```

คำสั่งนี้ผ่าน `prod-db-guard.sh` เพราะเห็น `localhost` ตรง ๆ ในคำสั่ง — **ไม่ใช้ `prisma migrate dev`**
(ฐาน dev/prod เดิมเคยแชร์กัน แม้ worktree นี้จะแยก local DB แล้ว `migrate dev` ยังเสี่ยงเสนอ reset ทั้ง
ฐานเมื่อเจอ drift ตาม Hard Rule 14) migrate ล้ม = ต้องแก้ไฟล์ migration แล้วรันซ้ำ ไม่ใช่ข้ามไปสร้าง
migration ใหม่ทับ

### 5.2 Rollback

ปลอดภัยเต็มที่เฉพาะ **ก่อน** มีร้านไหนกดบันทึกตัวจัดหน้าร้านจริงบนฐานนั้น (เช่น ทันทีหลัง merge ก่อนมี
การใช้งาน) — หลังจากนั้น rollback จะทำให้ร้านที่จัดหน้าไปแล้วเสียการตั้งค่านั้น แต่**ไม่กระทบข้อมูล
ต้นทาง** (`Shop`/`FacebookPost` คอลัมน์เดิม/`Badge`/`UserBadge` ไม่ถูกแตะเลย) ไฟล์ `mirroredFileId` ที่
mirror ไปแล้วจะค้างเป็น orphan ใน storage bucket (ไม่เป็นอันตราย เก็บกวาดทีหลังได้ ไม่บล็อก rollback)

```sql
ALTER TABLE "FacebookPost" DROP COLUMN "mirroredAt";
ALTER TABLE "FacebookPost" DROP COLUMN "mirroredFileId";
DROP TABLE "ShopPageBlock";
DROP TABLE "ShopPageLayout";
```

### 5.3 ผลกระทบ (Impact)

- **Downtime:** ไม่มี — `CREATE TABLE` ตารางใหม่ 2 ตัว + `ADD COLUMN` nullable บน `FacebookPost` เดิม
  ทั้งหมดเป็น metadata-only operation บน PostgreSQL 11+ ไม่ rewrite ตาราง ไม่ล็อกนาน
- **Lock ตารางใหญ่:** ไม่มี — `FacebookPost` มีขนาดเล็ก (feature 00029 ยังใหม่) และ `ADD COLUMN`
  nullable ไม่ต้อง rewrite แถวเดิม
- **ข้อมูลเดิม:** ไม่ถูกแตะ — zero-regression ทั้ง `isPublished` (fallback `true` ที่ service เมื่อไม่มี
  แถว) และ `tabOrder`/`ShopPageBlock` (ว่างเปล่า = หน้าร้านหน้าตาเหมือนวันนี้ทุกประการ เพราะบล็อกพวกนี้
  เป็น pure add-on ไม่มีอยู่มาก่อน)
- **Backward compatibility:** โค้ดเวอร์ชันก่อนฟีเจอร์นี้ (ถ้า deploy ผิดจังหวะ) ยัง query `Shop`/
  `FacebookPost` คอลัมน์เดิมได้ตามปกติ — ไม่มีคอลัมน์ไหนถูก rename/drop ที่จะทำโค้ดเก่าพัง
- **Consistency ข้าม store:** ไม่มี — Postgres (Supabase) ตัวเดียวทั้งระบบ ไม่มี store อื่นเกี่ยวข้อง

---

## 6. Retention / ข้อควรระวัง

- **Data Retention:** `ShopPageLayout` 1 แถวต่อร้าน ไม่โต — ไม่ต้อง archive `ShopPageBlock` โตช้า
  (ผูกกับการกดปุ่ม "เพิ่ม" ของร้านเอง ไม่ใช่ ingest อัตโนมัติแบบ `PageComment`/`ChatMessage` — คาดว่า
  หลักสิบแถวต่อร้านเป็นอย่างมาก ไม่ต้อง partition/archive)
- **PII / ข้อมูลอ่อนไหว:** ไม่มีคอลัมน์ใหม่เป็น PII โดยตรง `mirroredFileId` เป็นสำเนารูปปกโพสต์ที่ร้าน
  โพสต์ต์เองแล้วเลือกเผยแพร่ซ้ำบนหน้าร้าน (ความเสี่ยงเดียวกับ `thumbnailUrl` เดิม ไม่ใช่ความเสี่ยงใหม่)
  `badgeIds`/`tabOrder` เป็นค่าที่ร้าน/ทีมงานของร้านตั้งเอง ไม่มีข้อมูลของบุคคลที่สาม
- **Performance:** ไม่มีความเสี่ยง hot row/lock contention — query หลักทั้งหมด scoped ด้วย `shopId`
  ผ่าน index ที่มีอยู่ (§4) ปริมาณข้อมูลต่อร้านเล็กมาก
- **Consistency ข้าม store:** ไม่มี — Postgres เดียวทั้งระบบ
- **การตัดสินใจ "ร่างเก็บที่ client เท่านั้น ไม่มีตาราง DB":** ทุก AC ที่เกี่ยวกับ draft
  (FR-PGB-11/12/13) อธิบายพฤติกรรมที่ทำได้ด้วย state ฝั่ง browser ล้วน ๆ — พรีวิวแยกจากของจริงจนกว่าจะ
  กดบันทึก (React state ไม่ query ใหม่), แถบเตือน + `beforeunload` prompt (client-side UX ปกติ),
  "บันทึกล้มเหลวร่างไม่หาย" (แค่ไม่ reload หน้า, ไม่ใช่ persistence ข้ามเซสชัน) ไม่มี FR ไหนขอ "เปิดจาก
  เครื่องอื่นแล้วร่างยังอยู่" หรือ "auto-save ทุก n วินาที" — การเพิ่มตาราง shadow (`*Draft`) คู่ทุกตาราง
  จะเป็นต้นทุนที่ไม่มี requirement รองรับ (YAGNI) ถ้าในอนาคตมี FR ต้องการ cross-device draft recovery
  ต้องกลับมาออกแบบใหม่เป็นงานแยก ไม่ใช่ default ของฟีเจอร์นี้
- **Mirror storage failure:** `mirrorRemoteImage()` คืน `null` เมื่อ mirror ไม่สำเร็จ (host ไม่อยู่ใน
  allow-list/ไฟล์ใหญ่เกิน/network error) — service ต้องตัดสินใจว่าจะ block การเพิ่มบล็อกหรือเพิ่มแบบ
  fallback ไปใช้ `thumbnailUrl` ของ Meta ชั่วคราว (เสี่ยงรูปแตกภายหลังตามที่ BRD เตือนไว้) — เป็นการ
  ตัดสินใจของ SDS ไม่ใช่ของ DATABASE.md แต่ schema รองรับทั้งสองทางเพราะ `mirroredFileId` nullable

---

## 7. Traceability

| Table / Column | SDS Component / Decision | สถานะ |
|--------|--------------------------|-------|
| `ShopPageLayout.isPublished` | BRD FR-PGB-14, BR-PGB (§2.5) | Draft |
| `ShopPageLayout.tabOrder` | BRD "คำถามที่ต้องยืนยันก่อน implement" #2 → **มติ user 2026-08-07 ข้อ 1** (คงโครงแท็บเดิม) | Draft |
| `ShopPageBlock` (type=BADGE_HIGHLIGHT, badgeIds) | BRD FR-PGB-06, BR-PGB-06 + **มติ user 2026-08-07 ข้อ 3** (สูงสุด 4 ใบ) | Draft |
| `ShopPageBlock` (type=FACEBOOK_POST, facebookPostId) | BRD FR-PGB-05, BR-PGB-05 | Draft |
| `ShopPageBlock` guardrail (ไม่มีแถวสำหรับหัวโปรไฟล์/รีวิว/สถิติ) | BRD §3.6 D-9/D-10, BR-PGB-01/02/07 | Draft |
| `FacebookPost.mirroredFileId` / `mirroredAt` | BRD "คำถามที่ต้องยืนยันก่อน implement" #1 → **มติ user 2026-08-07 ข้อ 2** | Draft |
| การเข้าถึง (ไม่มีคอลัมน์ใหม่ — ใช้ `ShopMember.role` เดิม) | BRD FR-PGB-16 → **มติ user 2026-08-07 ข้อ 4** (OWNER + ShopMember role=ADMIN) — enforce ที่ API/service ไม่ใช่ DB | ไม่ต้องแก้ schema |
| **ขอบเขต mockup vs มติจริง** (ดู callout ต้นไฟล์) | PRD §3.1 "มติที่ user ยืนยันแล้ว" ข้อ 1, BRD §7.1 ข้อ 1 | **ต้องยืนยันซ้ำตอนเขียน SRS/SDS** |

---

## 8. สรุป (Summary)

เอกสาร DATABASE นี้กำหนดโครงสร้างข้อมูลของ **ตัวจัดหน้าร้าน (Shop Page Builder)**: 2 ตารางใหม่
(`ShopPageLayout`, `ShopPageBlock`) + 2 คอลัมน์เพิ่มบน `FacebookPost` เดิม ทั้งหมด additive ล้วน
ไม่แตะ/ไม่ลบข้อมูลเดิมสักจุดเดียว migration พร้อมใช้ที่
`prisma/migrations/20260807090000_shop_page_builder/migration.sql` และ `prisma/schema.prisma`
ถูกแก้แล้ว (validate ผ่านด้วย `npx prisma validate`)

**Open Questions:**
- **ขอบเขต "บล็อกโครงหน้า" (ห้องพัก/ปฏิทิน/บริการ/สินค้า):** BRD ฉบับร่าง (ก่อนมติปิดข้อ 1) เขียน
  acceptance criteria แบบ "กดปุ่มเพิ่ม" (FR-PGB-04) ไว้เต็มรูป แต่มติปิดข้อ 1 ลดขอบเขตเหลือแค่ "ปรับ
  ลำดับแท็บ" schema นี้ยึดตามมติปิด (ไม่มีตัวแทนสำหรับ "เพิ่ม/ลบ" บล็อกโครงหน้าเลย) — **safepay-planner
  ต้องยืนยันการตีความนี้ชัดเจนอีกครั้งตอนเขียน SRS/SDS** ก่อนส่งต่อให้ developer เพราะ FR-PGB-04 ฉบับ
  เดิมยังไม่ถูกแก้ไขคำในตัว BRD
- **`docs/SRS.md` ยังไม่มี entry ของ `FacebookPost`/`ShopChannel`/`PageComment` เลย** (หนี้เดิมจาก
  feature 00029) — งานนี้แตะ `FacebookPost` โดยตรง จึงต้องอย่างน้อยเพิ่ม entry ของ `FacebookPost` เข้า
  §6 Data Model ของ `docs/SRS.md` พร้อมกับ `ShopPageLayout`/`ShopPageBlock` ตอนเขียน SRS/SDS (Hard
  Rule 11 — ครบ 7 ไฟล์ ≠ เอกสารเสร็จ ถ้า `docs/SRS.md` ยังไม่ sync)
- **Mirror failure UX:** `mirrorRemoteImage()` คืน `null` ได้ — SDS ต้องตัดสินว่าการเพิ่มบล็อกยัง
  สำเร็จโดย fallback ไปใช้ `thumbnailUrl` ของ Meta ชั่วคราวหรือปฏิเสธการเพิ่มเลย (schema รองรับทั้งสองทาง)

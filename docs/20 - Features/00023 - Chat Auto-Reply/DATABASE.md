---
title: "DATABASE — Chat Auto-Reply"
owner: shinobu22
status: draft
module: M00023-ChatAutoReply
version: "1.0"
created: 2026-07-29
tags: [feature, database, prisma, postgres, auto-reply, chat]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]"]
---

> **โมดูล:** M00023-ChatAutoReply
> **ประเภทเอกสาร:** Database Design
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-29
> **สถานะ:** Draft — 🛑 **FROZEN CONTRACT** สำหรับ SRS/SDS/API/TestCase
> **เจ้าของเอกสาร:** safepay-database (ดู [[Feature-Docs-Ownership]])

# DATABASE: ตอบแชทอัตโนมัติจาก Keyword

---

## 🛑 FROZEN CONTRACT

ชื่อ model, ชื่อ field, ชนิดข้อมูล และค่าคงที่ในเอกสารนี้คือ **สัญญาที่ตกลงแล้ว** — เอกสาร SRS / SDS / API / TestCase และโค้ดทุกไฟล์ต้องอ้างชื่อเหล่านี้ตรงตัว ห้ามตั้งชื่อใหม่เอง ถ้าต้องเปลี่ยนต้องกลับมาแก้ที่นี่ก่อนแล้วแจ้งทุกฝ่าย (บทเรียน `feedback_lock_contract_before_parallel`)

---

## 1. Overview

เพิ่ม **6 ตารางใหม่** และ **เพิ่มคอลัมน์ในตารางเดิม 2 ตาราง** — ทั้งหมดเป็น **additive อย่างเดียว** ไม่แก้และไม่ลบโครงสร้างเดิมแม้แต่คอลัมน์เดียว เพราะ DB ของ dev และ prod เป็นตัวเดียวกัน (memory `project_shared_db_drift_no_migrate_dev`)

| ตาราง | ประเภท | หน้าที่ |
|---|---|---|
| `AutoReplyConfig` | ใหม่ | การตั้งค่าระดับร้าน (1:1 กับ Shop) รวมสวิตช์เปิดปิดและโหมดทดสอบ |
| `AutoReplyKeyword` | ใหม่ | กลุ่มคำ |
| `AutoReplyPhrase` | ใหม่ | คำตรวจจับภายในกลุ่ม |
| `AutoReplyRule` | ใหม่ | กฎคำตอบทุกระดับในตารางเดียว (เงื่อนไขเป็นคอลัมน์ nullable) |
| `AutoReplyJob` | ใหม่ | คิวงานตอบอัตโนมัติ — **แกนกลางของการกันตอบซ้ำ** |
| `AutoReplyLog` | ใหม่ | บันทึกการตัดสินใจทุกครั้ง ทั้งตอบและไม่ตอบ |
| `Conversation` | เพิ่มคอลัมน์ | สถานะ auto-reply ระดับเธรด + บริบทสินค้า |
| `ChatMessage` | เพิ่มคอลัมน์ | ระบุว่าข้อความนี้ระบบตอบหรือคนตอบ |

**ตารางที่ไม่แตะเลย:** `ShopChannel`, `ExternalContact`, `ConversationAdReferral`, `Product`, `Order`, `Customer` — บริบทโฆษณาใช้ของเดิมที่ feature 00018 เก็บไว้แล้วครบ ไม่สร้างซ้ำ

---

## 2. ERD

```mermaid
erDiagram
    Shop ||--o| AutoReplyConfig : "1:1 ตั้งค่า"
    Shop ||--o{ AutoReplyKeyword : "มีกลุ่มคำ"
    Shop ||--o{ AutoReplyRule : "มีกฎคำตอบ"
    Shop ||--o{ AutoReplyJob : "scope"
    Shop ||--o{ AutoReplyLog : "scope"

    AutoReplyKeyword ||--o{ AutoReplyPhrase : "มีคำตรวจจับ"
    AutoReplyKeyword ||--o{ AutoReplyRule : "กฎของกลุ่มนี้"

    ShopChannel ||--o{ AutoReplyRule : "เงื่อนไขเพจ (nullable)"
    Product ||--o{ AutoReplyRule : "เงื่อนไขสินค้า (nullable)"

    Conversation ||--o{ AutoReplyJob : "งานของเธรด"
    Conversation ||--o{ AutoReplyLog : "บันทึกของเธรด"
    Conversation ||--o{ ChatMessage : "ข้อความ"
    Product ||--o{ Conversation : "บริบทสินค้า (nullable)"

    ChatMessage ||--o| AutoReplyJob : "1 ข้อความ 1 งาน"
    AutoReplyRule ||--o{ AutoReplyLog : "กฎที่ถูกเลือก"
```

---

## 3. Tables

### 3.1 `AutoReplyConfig` (PostgreSQL — Supabase)

การตั้งค่าระดับร้าน 1:1 กับ Shop — แยกตารางแทนเพิ่มคอลัมน์ใน `Shop` ด้วยเหตุผลเดียวกับ `ShopAiSetting` (SDS TD-001 ของ 00019): `Shop` ถูกอ่านแทบทุก request การพกค่าที่ใช้เฉพาะตอนตอบแชทไปด้วยทุก query เป็นการเปลืองเปล่า

```prisma
model AutoReplyConfig {
  id     String @id @default(uuid())
  // shopId @unique = 1 ร้าน 1 ชุดตั้งค่า บังคับที่ DB ไม่พึ่งวินัยโค้ด และเป็น index ของ query หลักไปในตัว
  shopId String @unique

  // 🛑 default false ตั้งใจ (BR-AR ระดับ 0): ระบบส่งข้อความถึงลูกค้าเองโดยไม่มีคนตรวจ
  // ต้องไม่ทำงานจนกว่าร้านจะสั่งเปิดเอง — มิเรอร์ ShopShippingAccount.createMode = "ASK" ของ 00022
  isEnabled Boolean @default(false)

  // --- โหมดทดสอบ (FR-021) ---
  // testMode = true → ตอบเฉพาะ Conversation ที่ autoReplyTestEnabled = true (allowlist)
  testMode          Boolean   @default(false)
  // หมดอายุเองกันร้านลืมปิด (AC-021-08) — null ทั้งที่ testMode=true ถือว่าไม่หมดอายุ (ไม่แนะนำ)
  testModeExpiresAt DateTime?
  testModeEnabledByUserId String?

  // --- การหยุดเมื่อพนักงานตอบ (FR-016) ---
  // "30M" | "2H" | "MANUAL" (จนกว่าจะเปิดเอง) | "UNTIL_RESOLVED" (จนกว่าเธรดจะถูกปิด)
  // String ไม่ใช่ Prisma enum ตาม convention เดิมทั้งโปรเจกต์ (Order.status/Shop.kind/Product.type)
  // เลี่ยง ALTER TYPE ทุกครั้งที่เพิ่มตัวเลือก — validate ที่ Valibot เท่านั้น ไม่มี DB CHECK
  humanTakeoverPauseMode String @default("2H")

  // --- การจำกัดการตอบ (FR-018) ---
  keywordCooldownSec        Int @default(300)  // กลุ่มคำเดิมห้ามตอบซ้ำในเธรดเดิมภายในกี่วินาที
  maxRepliesPerConversation Int @default(10)   // ครบแล้วหยุดและส่งต่อพนักงาน

  // --- อายุบริบทโฆษณา (FR-013) ---
  // "UNTIL_RESOLVED" | "HOURS" | "UNTIL_NEW_PRODUCT"
  adsContextMode  String @default("UNTIL_RESOLVED")
  adsContextHours Int?   // ใช้เมื่อ adsContextMode = "HOURS" เท่านั้น

  // --- สัญญาณส่งต่อพนักงาน (FR-019 / AC-019-02) ---
  // TEXT[] คอลัมน์เดียว ไม่ทำ table แยก — ลำดับไม่มีความหมาย ไม่มี query ที่ต้อง join/aggregate รายคำ
  // (แบบเดียวกับ ExternalContact.tags/phones และ QuickMessage.imageFileIds)
  handoffPhrases String[] @default([])

  updatedByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  shop      Shop  @relation(fields: [shopId], references: [id], onDelete: Cascade)
  updatedBy User? @relation("AutoReplyConfigUpdatedBy", fields: [updatedByUserId], references: [id], onDelete: SetNull)
}
```

### 3.2 `AutoReplyKeyword`

```prisma
model AutoReplyKeyword {
  id     String @id @default(uuid())
  shopId String
  name   String // ชื่อกลุ่มที่ร้านตั้งเอง เช่น "สนใจสินค้า"

  // "EXACT" | "CONTAINS" | "STARTS_WITH"
  // FUZZY เลื่อนไปเฟส 2 (PRD §5) — ค่าใหม่เพิ่มได้โดยไม่ต้อง migrate เพราะเป็น String
  matchType String @default("CONTAINS")

  // มากกว่า = ถูกเลือกก่อน (AC-003-02, เกณฑ์ที่ 1 ของ BR-AR-04)
  priority Int @default(100)

  isActive Boolean @default(true)

  createdByUserId String?
  updatedByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  shop    Shop               @relation(fields: [shopId], references: [id], onDelete: Cascade)
  phrases AutoReplyPhrase[]
  // onDelete Cascade — ลบกลุ่มคำ ลบกฎของกลุ่มนั้นด้วย (กฎที่ไม่มีกลุ่มไม่มีความหมาย)
  rules   AutoReplyRule[]
  logs    AutoReplyLog[]

  @@unique([shopId, name]) // AC-001-04 ชื่อกลุ่มห้ามซ้ำในร้านเดียวกัน
  @@index([shopId, isActive, priority]) // query หลัก: โหลดกลุ่มที่เปิดใช้ของร้านเรียงตามลำดับความสำคัญ
}
```

### 3.3 `AutoReplyPhrase`

```prisma
model AutoReplyPhrase {
  id        String @id @default(uuid())
  keywordId String

  phrase String // คำที่ร้านพิมพ์ (เก็บของเดิมไว้แสดงใน UI)

  // normalizedPhrase: ผ่าน normalize ตัวเดียวกับที่ใช้กับข้อความลูกค้า (SRS — normalizeMessage)
  // 🛑 เก็บที่ DB ไม่ normalize ตอน match: ถ้า normalize ทุกครั้งที่เทียบ จะเสียเวลาซ้ำทุกข้อความ
  // และที่สำคัญกว่าคือใช้บังคับ unique กันคำซ้ำที่ "ต่างกันแค่รูปแบบ" ได้ (AC-002-03)
  normalizedPhrase String

  createdAt DateTime @default(now())

  keyword AutoReplyKeyword @relation(fields: [keywordId], references: [id], onDelete: Cascade)

  @@unique([keywordId, normalizedPhrase]) // AC-002-03 คำซ้ำในกลุ่มเดียวกันต้องถูกปฏิเสธ
  @@index([keywordId])
}
```

### 3.4 `AutoReplyRule`

กฎคำตอบ **ทุกระดับอยู่ตารางเดียว** โดยเงื่อนไขเป็นคอลัมน์ nullable — ตอบโจทย์ PRD §20 ที่ห้ามทั้ง "คอลัมน์ตายตัวเกินไป" และ "JSON จน query/index ไม่ได้"

```prisma
model AutoReplyRule {
  id     String @id @default(uuid())
  shopId String

  // keywordId = null → กฎคำตอบกลาง (ระดับ 7 = ของเพจ ถ้า shopChannelId ไม่ null, ระดับ 8 = ของร้าน ถ้า null)
  keywordId String?

  // --- เงื่อนไข 3 มิติ (null = ไม่จำกัดมิตินั้น) ---
  shopChannelId String? // เงื่อนไขเพจ
  adId          String? // เงื่อนไขโฆษณา — String ดิบ ไม่ FK เพราะโฆษณาไม่ใช่ entity ในระบบเรา
  adLabel       String? // ชื่อกำกับที่ร้านตั้งเอง (AC-007-01) — Meta ไม่ให้ชื่อแคมเปญ/AdSet
  productId     String? // เงื่อนไขสินค้า

  replyText String @db.Text // 🛑 ข้อความที่ส่งถึงลูกค้าตรงตัวทุกอักษร ห้ามระบบดัดแปลง (BR-AR หลัก)

  // specificity: คะแนนความเฉพาะเจาะจง คำนวณตอนเขียนเสมอ (service layer, invariant)
  //   = (shopChannelId != null ? 4 : 0) + (adId != null ? 2 : 0) + (productId != null ? 1 : 0)
  // bitmask นี้เรียงลำดับตรงกับ AC-009-01 พอดีทุกระดับ:
  //   7=K+เพจ+โฆษณา+สินค้า  6=K+เพจ+โฆษณา  5=K+เพจ+สินค้า  4=K+เพจ  1=K+สินค้า  0=K กลาง
  // (2=K+โฆษณาไม่ระบุเพจ และ 3=K+โฆษณา+สินค้า ไม่อยู่ในลิสต์ของ PRD แต่เรียงลงตัวเองระหว่าง 4 กับ 1)
  // 🛑 เก็บเป็นคอลัมน์ไม่คำนวณตอน query — ต้องใช้ ORDER BY ที่ index ได้ และต้องได้ผลเดิมทุกครั้ง (AC-011-03)
  specificity Int

  isActive    Boolean   @default(true)
  activeFrom  DateTime? // ตารางเวลาเปิดใช้ (null = ไม่จำกัด)
  activeUntil DateTime?

  createdByUserId String?
  updatedByUserId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  shop        Shop              @relation(fields: [shopId], references: [id], onDelete: Cascade)
  keyword     AutoReplyKeyword? @relation(fields: [keywordId], references: [id], onDelete: Cascade)
  // SetNull ทั้งคู่: ถอดเพจ/ลบสินค้า ต้องไม่ลบกฎทิ้ง (AC-006-05, AC-008-03) — กฎกลายเป็นกว้างขึ้น
  // แล้ว service ตัดสินเองว่ายังใช้ได้ไหม ดีกว่าข้อมูลที่ร้านตั้งไว้หายเงียบ ๆ
  shopChannel ShopChannel?      @relation(fields: [shopChannelId], references: [id], onDelete: SetNull)
  product     Product?          @relation(fields: [productId], references: [id], onDelete: SetNull)
  logs        AutoReplyLog[]

  // query หลักของ rule resolution: กฎที่เปิดใช้ของกลุ่มคำนี้ เรียงเฉพาะเจาะจงมากก่อน
  @@index([shopId, keywordId, isActive, specificity])
  @@index([shopId, shopChannelId, adId])
  @@index([productId])
}
```

**🛑 unique constraint ต้องเขียน SQL มือ** — Prisma ประกาศ `@@unique([shopId, keywordId, shopChannelId, adId, productId])` ได้ แต่ **Postgres ถือว่า NULL ต่างกันเสมอ** จึงยอมให้มีแถวซ้ำที่มี NULL ได้ ทำให้กฎ "1 กลุ่มคำ 1 คำตอบต่อ 1 เพจ" (AC-006-02) บังคับไม่ได้จริง — ต้องใช้ `UNIQUE NULLS NOT DISTINCT` (Postgres 15+; Supabase รัน PG16) ในไฟล์ migration ที่เขียนเอง แบบเดียวกับ partial unique index ของ `ShopChannel` (`prisma/migrations/20260722000200_shopchannel_active_partial_unique/`)

### 3.5 `AutoReplyJob`

**ตารางที่สำคัญที่สุดของฟีเจอร์นี้** — เป็นทั้งคิวงานและกลไกกันตอบซ้ำในตัวเดียว

```prisma
model AutoReplyJob {
  id String @id @default(uuid())

  // 🛑 chatMessageId @unique = หัวใจของ BR-AR-21 / AC-017-01 "หนึ่งข้อความ หนึ่งคำตอบ"
  // ข้อความลูกค้า 1 แถว สร้างงานได้ครั้งเดียวตลอดกาล — Meta redeliver / cron ทำซ้ำ / after() ทำงาน
  // พร้อมกับ sweeper ล้วนชนที่ constraint นี้แล้วจบ ไม่ต้องพึ่งวินัยของโค้ดหรือ distributed lock
  // (ใช้หลักการเดียวกับ ChatMessage.externalMessageId @unique ที่พิสูจน์แล้วใน feature 00018)
  chatMessageId String @unique

  conversationId String
  shopId         String

  // "PENDING" | "PROCESSING" | "DONE" | "FAILED" | "SKIPPED"
  status String @default("PENDING")

  attempts   Int       @default(0)
  // lockedAt/lockedBy: กัน worker 2 ตัวหยิบงานเดียวกัน (after() กับ cron sweeper)
  // claim ด้วย conditional updateMany (WHERE status='PENDING') แบบเดียวกับ wallet.service deduct
  lockedAt   DateTime?
  lockedBy   String?
  lastError  String?   @db.Text

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  message      ChatMessage  @relation(fields: [chatMessageId], references: [id], onDelete: Cascade)
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  shop         Shop         @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@index([status, createdAt]) // cron sweeper: หางานค้างเรียงเก่าสุดก่อน
  @@index([conversationId, createdAt])
}
```

### 3.6 `AutoReplyLog`

```prisma
model AutoReplyLog {
  id             String  @id @default(uuid())
  shopId         String
  conversationId String
  chatMessageId  String? // ข้อความขาเข้าที่เป็นต้นเหตุ (SetNull — ลบข้อความไม่ลบบันทึก)

  // --- สิ่งที่เห็นและตีความ ---
  rawText        String? @db.Text // ข้อความต้นฉบับ
  normalizedText String? @db.Text // หลัง normalize (AC-010-06 — ใช้ debug ว่าทำไมไม่ match)

  // --- ผลการจับคู่ ---
  keywordId     String?
  matchedPhrase String?
  matchType     String?
  // เกณฑ์ที่ทำให้ชนะ + กลุ่มที่แพ้ (AC-011-04) — Json เพราะเป็นข้อมูลวินิจฉัย
  // ไม่มี query ไหนกรองด้วยเนื้อในของมัน (มิเรอร์ ChatMessage.scamMatchedRules)
  matchTrace Json?

  // --- กฎที่ถูกเลือก ---
  ruleId          String?
  resolutionLevel String? // เช่น "KEYWORD_PAGE_AD" — ค่าคงที่ดู §3.8

  // --- บริบท ณ เวลาตัดสินใจ (snapshot ไม่ join ย้อนหลัง) ---
  shopChannelId String?
  adId          String?
  productId     String?

  // --- ผลลัพธ์ ---
  // "REPLIED" | "SKIPPED" | "HANDOFF" | "FAILED"
  decision String
  // 🛑 บังคับมีค่าเมื่อ decision != "REPLIED" (AC-024-02) — บันทึกเฉพาะตอนตอบทำให้ debug
  // คำถามที่ร้านถามบ่อยที่สุด ("ทำไมไม่ตอบ") ไม่ได้เลย. ค่าคงที่ดู §3.8
  skipReason String?

  replyText         String? @db.Text // ข้อความที่ส่งจริง
  outboundMessageId String? // ChatMessage ฝั่งขาออกที่เกิดจากการตอบครั้งนี้

  isTest       Boolean @default(false) // ตอบในโหมดทดสอบ (AC-021-05 กรองแยกได้)
  durationMs   Int?
  errorMessage String? @db.Text

  createdAt DateTime @default(now())

  shop         Shop              @relation(fields: [shopId], references: [id], onDelete: Cascade)
  conversation Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  keyword      AutoReplyKeyword? @relation(fields: [keywordId], references: [id], onDelete: SetNull)
  rule         AutoReplyRule?    @relation(fields: [ruleId], references: [id], onDelete: SetNull)

  @@index([shopId, createdAt])            // หน้ารายการบันทึกของร้าน
  @@index([conversationId, createdAt])    // ดูประวัติของเธรดเดียว
  @@index([shopId, decision, createdAt])  // กรอง "ที่ไม่ตอบ" / "ที่พัง"
  @@index([shopId, keywordId, createdAt]) // กลุ่มคำไหนถูกใช้บ่อย
  @@index([shopId, adId, createdAt])      // โฆษณาไหนสร้างบทสนทนาสูง
}
```

### 3.7 คอลัมน์ที่เพิ่มในตารางเดิม

**`Conversation` (เพิ่ม 9 คอลัมน์ — additive ทั้งหมด มี default ครบ backfill ปลอดภัยเอง)**

```prisma
  // --- feature 00023 Chat Auto-Reply (additive) ---
  // null = ตามค่าระดับร้าน (AutoReplyConfig.isEnabled); true/false = ร้านตั้งค่าเธรดนี้ไว้ชัดเจน
  // nullable ตั้งใจ: ต้องแยก "ยังไม่เคยตั้ง" ออกจาก "ตั้งเป็นปิด" ไม่งั้นปิดระดับร้านแล้วเปิดกลับ
  // จะปลุกเธรดที่ร้านตั้งใจปิดไว้ขึ้นมาด้วย (AC-015-03)
  autoReplyEnabled     Boolean?
  // allowlist ของโหมดทดสอบ (AC-021-02/03) — มีผลเฉพาะตอน AutoReplyConfig.testMode = true
  autoReplyTestEnabled Boolean   @default(false)
  // หยุดชั่วคราวถึงเมื่อไหร่ (FR-016) — null = ไม่ถูกหยุด
  autoReplyPausedUntil DateTime?
  autoReplyCount       Int       @default(0) // นับคำตอบอัตโนมัติสะสม (AC-018-02)
  lastAutoReplyAt      DateTime?
  handoffAt            DateTime? // null = ยังไม่ถูกส่งต่อ
  handoffReason        String?
  // --- บริบทสินค้าของเธรด (FR-014) ---
  contextProductId     String?
  // "ADS_MAPPING" | "MANUAL" | "REFERRAL" — MANUAL ชนะเสมอ (BR-AR-12 / AC-014-02)
  contextProductSource String?
  contextProductAt     DateTime? // ใหม่กว่าชนะเมื่อที่มาระดับเดียวกัน (AC-014-03)

  autoReplyJobs AutoReplyJob[]
  autoReplyLogs AutoReplyLog[]
  contextProduct Product? @relation("ConversationContextProduct", fields: [contextProductId], references: [id], onDelete: SetNull)

  @@index([shopId, autoReplyTestEnabled]) // หา allowlist ของโหมดทดสอบ
```

**`ChatMessage` (เพิ่ม 1 คอลัมน์)**

```prisma
  // --- feature 00023 (additive) ---
  // null = คนส่ง | "AUTO" = ระบบตอบ | "AUTO_TEST" = ระบบตอบขณะอยู่ในโหมดทดสอบ
  // 🛑 คอลัมน์นี้คือสิ่งที่ทำให้ BR-AR-22 บังคับได้: "พนักงานตอบ" = senderRole='SHOP' AND autoReplyKind IS NULL
  // ถ้าไม่มีคอลัมน์นี้ คำตอบของระบบเองจะถูกนับเป็น "พนักงานตอบ" แล้วระบบจะหยุดตัวเองทุกครั้งที่ตอบ
  autoReplyKind String?

  autoReplyJob AutoReplyJob?

  @@index([conversationId, autoReplyKind, createdAt]) // หา "ข้อความคนล่าสุด" ของเธรด
```

### 3.8 ค่าคงที่ (String constants — FROZEN)

| กลุ่ม | ค่าที่อนุญาต |
|---|---|
| `AutoReplyKeyword.matchType` | `EXACT` · `CONTAINS` · `STARTS_WITH` |
| `AutoReplyConfig.humanTakeoverPauseMode` | `30M` · `2H` · `MANUAL` · `UNTIL_RESOLVED` |
| `AutoReplyConfig.adsContextMode` | `UNTIL_RESOLVED` · `HOURS` · `UNTIL_NEW_PRODUCT` |
| `AutoReplyJob.status` | `PENDING` · `PROCESSING` · `DONE` · `FAILED` · `SKIPPED` |
| `AutoReplyLog.decision` | `REPLIED` · `SKIPPED` · `HANDOFF` · `FAILED` |
| `AutoReplyLog.resolutionLevel` | `KEYWORD_PAGE_AD_PRODUCT` · `KEYWORD_PAGE_AD` · `KEYWORD_PAGE_PRODUCT` · `KEYWORD_PAGE` · `KEYWORD_PRODUCT` · `KEYWORD_DEFAULT` · `PAGE_DEFAULT` · `SHOP_DEFAULT` · `NONE` |
| `AutoReplyLog.skipReason` | `SHOP_DISABLED` · `CONVERSATION_DISABLED` · `NOT_IN_TEST_ALLOWLIST` · `SPAM` · `HANDED_OFF` · `PAUSED_HUMAN_TAKEOVER` · `OUTBOUND_MESSAGE` · `KEYWORD_COOLDOWN` · `MAX_REPLIES_REACHED` · `NO_KEYWORD_MATCH` · `NO_RULE_MATCH` · `EMPTY_REPLY` · `WINDOW_CLOSED` · `CHANNEL_INACTIVE` · `DUPLICATE_JOB` |
| `ChatMessage.autoReplyKind` | `null` · `AUTO` · `AUTO_TEST` |
| `Conversation.contextProductSource` | `ADS_MAPPING` · `MANUAL` · `REFERRAL` |

ทั้งหมดเป็น `String` ไม่ใช่ Prisma enum ตาม convention ของโปรเจกต์ (`Order.status`, `Shop.kind`, `Product.type`, `Expense.category`) — เลี่ยง `ALTER TYPE` ทุกครั้งที่เพิ่มตัวเลือก และ **ไม่มี DB CHECK** validate ที่ Valibot ชั้นเดียว

---

## 4. Indexes

| ตาราง | Index | รองรับ query |
|---|---|---|
| `AutoReplyKeyword` | `[shopId, isActive, priority]` | โหลดกลุ่มคำที่เปิดใช้ของร้าน เรียงตามลำดับความสำคัญ (ทุกข้อความขาเข้า) |
| `AutoReplyPhrase` | `[keywordId]` | โหลดคำตรวจจับของกลุ่ม |
| `AutoReplyRule` | `[shopId, keywordId, isActive, specificity]` | **query หลักของ rule resolution** — เฉพาะเจาะจงมากก่อน |
| `AutoReplyRule` | `[shopId, shopChannelId, adId]` | หน้าตั้งค่า: ดูกฎของเพจ/โฆษณาหนึ่ง ๆ |
| `AutoReplyJob` | `[status, createdAt]` | cron sweeper หางานค้าง |
| `AutoReplyLog` | 5 index (ดู §3.6) | ครอบทุกเงื่อนไขค้นหาใน AC-024-03 |
| `Conversation` | `[shopId, autoReplyTestEnabled]` | หา allowlist โหมดทดสอบ |
| `ChatMessage` | `[conversationId, autoReplyKind, createdAt]` | หาข้อความ "คนส่ง" ล่าสุด เพื่อเช็ค human takeover |

**ผลต่อ write performance และ storage:**
- `ChatMessage` เป็นตารางที่เขียนถี่ที่สุดในระบบ — เพิ่ม 1 คอลัมน์ nullable + 1 index สามคอลัมน์ ต้นทุนเขียนเพิ่มเล็กน้อยแต่ยอมรับได้ เพราะ index นี้แทนที่การ scan เธรดทุกครั้งที่ตัดสินใจตอบ
- `AutoReplyLog` เขียน **ทุกข้อความขาเข้าของร้านที่เปิดใช้** (รวมกรณีไม่ตอบ) — เป็นตารางที่โตเร็วที่สุด มี 5 index ซึ่งเป็นราคาที่ต้องจ่ายเพื่อ AC-024-03 → ต้องมีนโยบายลบย้อนหลัง (§6)
- `AutoReplyJob` มีอายุสั้น (DONE แล้วลบได้) จึงไม่โตสะสม
- ตารางตั้งค่า (`Config`/`Keyword`/`Phrase`/`Rule`) เล็กมากตาม A-4 (หลักสิบกลุ่มต่อร้าน) — อ่านบ่อยเขียนน้อย เหมาะกับการ cache ในหน่วยความจำ (ดู SDS)

---

## 5. Migration Plan

### 5.1 ลำดับการ Migrate

**ไฟล์เดียว** `prisma/migrations/20260729000000_auto_reply/migration.sql` — รวมทุกอย่างในไฟล์เดียวเพราะ DB dev=prod แชร์กัน การ `ALTER` หลายรอบมีต้นทุนความเสี่ยงมากกว่าการเพิ่มทีเดียวจบ (เหตุผลเดียวกับ S-7 ของ feature 00018)

1. `CREATE TABLE` 6 ตารางใหม่
2. `ALTER TABLE "Conversation" ADD COLUMN` × 9 (มี DEFAULT ครบ → ไม่ต้อง backfill)
3. `ALTER TABLE "ChatMessage" ADD COLUMN "autoReplyKind" TEXT` (nullable → ไม่ต้อง backfill)
4. `CREATE INDEX` ทั้งหมด
5. `CREATE UNIQUE INDEX ... NULLS NOT DISTINCT` บน `AutoReplyRule` (เขียนมือ — Prisma ประกาศไม่ได้)
6. `CREATE UNIQUE INDEX` บน `AutoReplyJob(chatMessageId)` และ `AutoReplyConfig(shopId)`

🛑 **apply ด้วย `npx prisma migrate deploy -e .env.local` เท่านั้น และต้องขอ user ยืนยันก่อนทุกครั้ง** — `.env.local` ชี้ Supabase ที่ dev และ prod ใช้ร่วมกัน ห้าม `migrate dev` เด็ดขาด (จะ reset ลบข้อมูลจริง — memory `project_shared_db_drift_no_migrate_dev`)

⚠️ หลัง migrate **ต้อง restart dev server** — stale Prisma client ทำให้ session 500 (บทเรียน seller auth 2026-06-16)

### 5.2 Rollback

ปลอดภัยเต็มที่เพราะเป็น additive ล้วน:

1. **ระดับแอป (แนะนำ):** `AutoReplyConfig.isEnabled = false` ทุกร้าน → ระบบหยุดตอบทันทีโดยไม่แตะ DB และแชทเดิมทำงานปกติ 100%
2. **ระดับ schema:** `DROP TABLE` 6 ตารางใหม่ + `DROP COLUMN` ที่เพิ่ม — ไม่มีตารางเดิมใดพึ่งพาคอลัมน์เหล่านี้ ข้อมูลเดิมไม่ถูกแตะเลย

**ไม่มีขั้นตอนใดที่ย้อนกลับไม่ได้** — ไม่มีการแก้ชนิดข้อมูล ไม่มีการลบคอลัมน์เดิม ไม่มีการเขียนทับข้อมูลเดิม

### 5.3 ผลกระทบ (Impact)

| ด้าน | ผลกระทบ |
|---|---|
| **ข้อมูลเดิม** | ไม่มี — additive ล้วน ทุกคอลัมน์ใหม่มี default หรือ nullable |
| **โค้ดเดิม** | ไม่มี — ไม่มี field เดิมถูกเปลี่ยนชื่อ/ชนิด/ลบ query เดิมทั้งหมดยังทำงานเหมือนเดิม |
| **เธรดที่มีอยู่แล้ว** | `autoReplyEnabled = null` (ตามค่าร้าน), `autoReplyTestEnabled = false`, `autoReplyCount = 0` — ปลอดภัยโดยปริยาย |
| **ข้อความที่มีอยู่แล้ว** | `autoReplyKind = null` = ถือว่าคนส่ง ซึ่งถูกต้องเพราะก่อนหน้านี้ระบบไม่เคยตอบเอง |
| **เวลา migrate** | `ALTER TABLE ADD COLUMN` ที่มี default บน Postgres 11+ ไม่ rewrite ตาราง — เร็วแม้ `ChatMessage` จะใหญ่ |

---

## 6. Retention / ข้อควรระวัง

**Retention**
- `AutoReplyLog` — เก็บ 90 วัน แล้วลบด้วย cron (ตารางที่โตเร็วที่สุด เขียนทุกข้อความขาเข้ารวมกรณีไม่ตอบ)
- `AutoReplyJob` — สถานะ `DONE` เก็บ 7 วันแล้วลบ; `FAILED` เก็บ 30 วันเพื่อวินิจฉัย

**🛑 ข้อควรระวังที่สำคัญที่สุด — echo ของคำตอบตัวเองมาถึงก่อน**

เมื่อระบบส่งคำตอบ Meta จะส่ง echo ของข้อความนั้นกลับมาทาง webhook พร้อม `mid` เดิม ถ้า echo มาถึงและถูก `ingestInboundMessage` เขียนลง DB **ก่อน** ที่เราจะเขียนแถวของตัวเอง แถวนั้นจะมี `autoReplyKind = null` → ระบบจะอ่านว่า "พนักงานตอบ" แล้ว **หยุดตัวเอง** ทั้งที่เป็นข้อความของตัวเอง

ทางแก้ที่ต้องบังคับใน SDS: หลังส่งสำเร็จ ถ้าเขียนแถวแล้วชน `externalMessageId` unique ต้อง **`UPDATE` แถวที่มีอยู่ให้ `autoReplyKind` ถูกต้อง** ไม่ใช่แค่คืนแถวเดิมเฉย ๆ อย่างที่ `sendOutboundMessage:879-885` ทำอยู่ตอนนี้

**ข้อควรระวังอื่น**
- `AutoReplyRule.specificity` เป็น invariant ที่โค้ดต้องรักษา — ทุกจุดที่เขียน rule ต้องคำนวณใหม่ ห้ามให้ client ส่งค่านี้มา
- `AutoReplyPhrase.normalizedPhrase` ต้องใช้ฟังก์ชัน normalize **ตัวเดียวกัน** กับที่ใช้กับข้อความลูกค้า ถ้าแยกกันเมื่อไหร่ระบบจะ match ไม่ตรงแบบหาสาเหตุยากมาก
- ทุก query ต้องมี `shopId` ใน `WHERE` ห้าม post-filter ใน JS (NFR-Sec เดิมของโปรเจกต์)
- `AutoReplyLog` เก็บข้อความลูกค้าดิบ → เป็น PII ต้องปกปิดตามมาตรฐานเดิมและห้ามหลุดเข้า RSC flight (memory `feedback_rsc_pii_neutralize_at_source`)

---

## 7. Traceability

| Requirement | ตาราง/คอลัมน์ที่รองรับ |
|---|---|
| FR-001/002/003 กลุ่มคำ + คำตรวจจับ | `AutoReplyKeyword`, `AutoReplyPhrase` |
| FR-005..009 คำตอบทุกระดับ + ถอยระดับ | `AutoReplyRule.specificity` + `[shopId, keywordId, isActive, specificity]` |
| FR-010 normalize | `AutoReplyPhrase.normalizedPhrase`, `AutoReplyLog.normalizedText` |
| FR-011 ตัดสินเมื่อตรงหลายกลุ่ม | `AutoReplyKeyword.priority` + `specificity` + `AutoReplyLog.matchTrace` |
| FR-012 แสดงผลในเธรด | `ChatMessage.autoReplyKind` |
| FR-013 อายุบริบทโฆษณา | `AutoReplyConfig.adsContextMode/adsContextHours` + `ConversationAdReferral` (ของเดิม) |
| FR-014 บริบทสินค้า + ข้อขัดแย้ง | `Conversation.contextProductId/Source/At` |
| FR-015 เปิดปิดร้าน/เธรด | `AutoReplyConfig.isEnabled`, `Conversation.autoReplyEnabled` |
| FR-016 หยุดเมื่อพนักงานตอบ | `Conversation.autoReplyPausedUntil` + `ChatMessage.autoReplyKind` |
| FR-017 กันตอบซ้ำ | **`AutoReplyJob.chatMessageId @unique`** |
| FR-018 จำกัดจำนวน/ระยะพัก | `AutoReplyConfig.keywordCooldownSec/maxRepliesPerConversation`, `Conversation.autoReplyCount/lastAutoReplyAt` |
| FR-019 ส่งต่อพนักงาน | `Conversation.handoffAt/handoffReason`, `AutoReplyConfig.handoffPhrases` |
| FR-020/021 โหมดทดสอบ | `AutoReplyConfig.testMode/testModeExpiresAt`, `Conversation.autoReplyTestEnabled`, `AutoReplyLog.isTest` |
| FR-022/023 คิวงาน + งานค้างไม่หาย | `AutoReplyJob` ทั้งตาราง |
| FR-024 บันทึก + ค้นหา | `AutoReplyLog` ทั้งตาราง + 5 index |

---

## 8. สรุป (Summary)

6 ตารางใหม่ + 10 คอลัมน์ในตารางเดิม **additive 100%** rollback ได้ทุกขั้น และปิดฟีเจอร์ได้ด้วยการพลิกสวิตช์เดียวโดยไม่แตะ DB

การตัดสินใจที่สำคัญที่สุด 3 ข้อ:

1. **`AutoReplyJob.chatMessageId @unique`** — ยกภาระ "หนึ่งข้อความ หนึ่งคำตอบ" ไปไว้ที่ DB constraint แทนที่จะพึ่งวินัยของโค้ด ใช้หลักการเดียวกับ `externalMessageId @unique` ที่พิสูจน์ตัวเองแล้วใน feature 00018 ว่าทนต่อทั้ง redelivery และ race
2. **`specificity` เป็นคอลัมน์เก็บจริง ไม่คำนวณตอน query** — ทำให้ `ORDER BY` ใช้ index ได้และผลลัพธ์เหมือนเดิมทุกครั้ง ซึ่ง AC-011-03 บังคับไว้
3. **`ChatMessage.autoReplyKind`** — คอลัมน์เล็กที่สุดแต่ขาดไม่ได้ ถ้าไม่มี ระบบจะนับคำตอบของตัวเองเป็น "พนักงานตอบ" แล้วหยุดตัวเองทุกครั้งที่ตอบ

---

**หมายเหตุ:** สำหรับ logic การตัดสินใจและการออกแบบ service ดู [[SDS]] · สำหรับ API contract ดู [[API]] · สำหรับ acceptance criteria ต้นทาง ดู [[BRD]]

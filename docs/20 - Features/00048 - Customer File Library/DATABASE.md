<!-- Feature 00048 - Customer File Library -->

---
title: "DATABASE — คลังไฟล์ต่อลูกค้า"
owner: shinobu22
status: draft
created: 2026-08-13
tags: [database, prisma, migration, feature, 00048]
related: ["[[SRS]]", "[[SDS]]", "[[BRD]]"]
---

# DATABASE: คลังไฟล์ต่อลูกค้า (00048)

## 1. ภาพรวม

**ตารางใหม่ 1 ตาราง · ไม่แก้ตารางเดิมสักตาราง · ไม่มี backfill**

migration: `prisma/migrations/20260813120000_customer_file_library/migration.sql`

> 🛑 **ก่อนรัน migrate ต้องรู้ (Hard Rule 15):** prod ไม่ต้องสั่งเอง — `vercel.json` รัน `prisma migrate deploy`
> ตอน build ให้อยู่แล้ว push ขึ้น `main` = migrate ขึ้น prod ในตัว · **ฐาน local ต้อง apply เอง**
> ด้วยคำสั่งที่ปักหมุด `localhost` ตรง ๆ (Hard Rule 14) · migrate ล้ม = build ล้ม = deploy ไม่ขึ้น
> (ของเก่ายังเสิร์ฟอยู่ ไม่มีสถานะครึ่ง ๆ กลาง ๆ)

---

## 2. โมเดล `CustomerFile`

```prisma
/// feature 00048 — คลังไฟล์ต่อลูกค้า: แถวที่ผู้ขาย "คัดเข้ามาเอง" ทีละใบจากเธรดแชท
/// (ไม่ใช่ index อัตโนมัติของทุกไฟล์ในห้อง — มติ D-1)
model CustomerFile {
  id     String @id @default(uuid())
  /// ร้านเจ้าของเธรด (ไม่ใช่ร้านที่ active) — scope ทุก query ชั้นแรกเสมอ
  shopId String

  /// เจ้าของคลัง: มีค่า "อย่างใดอย่างหนึ่ง" เท่านั้น บังคับด้วย CHECK ใน migration
  /// externalContactId = เธรดช่องทางนอก (Messenger/IG/LINE) — ตามคนข้ามเธรดได้
  /// conversationId    = เธรด DEEP ที่ไม่มี ExternalContact เลย
  externalContactId String?
  conversationId    String?

  /// fileId ของ storage (ค่าเดียวกับ ChatMessage.imageUrl) — คลังเป็น "การอ้างอิง"
  /// ไม่ copy ไฟล์ (ไฟล์ขาเข้าจาก Meta ถูก mirror เข้า storage เราตั้งแต่ ingest แล้ว)
  fileId String
  /// "IMAGE" | "VIDEO" | "FILE" — String ไม่ใช่ enum ตาม convention ของ ChatMessage.type
  kind   String

  /// snapshot ณ เวลาที่เก็บ — ต้องอ่านได้แม้ข้อความต้นทางถูกลบ (BR-CFL-15)
  /// fileName แก้ไขได้ทีหลังโดยผู้ใช้ (FR-CFL-14) จึงไม่ใช่ snapshot บริสุทธิ์
  fileName String?
  fileSize Int?
  note     String?

  /// sourceMessageId: **ไม่ใช่ FK โดยตั้งใจ** — ข้อความถูกลบต้องไม่ลบแถวนี้ (นี่คือเหตุผล
  /// ทั้งหมดที่คลังมีอยู่). ใช้กับปุ่ม "ดูในแชท" ซึ่งซ่อนทั้งปุ่มเมื่อหาข้อความไม่เจอ
  sourceMessageId String?
  senderRole      String   // "BUYER" | "SHOP"
  senderName      String?
  /// เวลาที่ไฟล์ถูกส่งจริงในเธรด — **คีย์เรียงลำดับของคลัง** (BR-CFL-12) ไม่ใช่ savedAt
  sentAt          DateTime

  /// ผู้เก็บ: เก็บทั้ง id (อ้างอิง) และชื่อ (snapshot) — ชื่อต้องยังแสดงได้แม้คนนั้น
  /// ออกจากทีมร้านไปแล้ว (BR-CFL-11) จึงไม่ join เอาตอนอ่าน
  savedByUserId String?
  savedByName   String?
  savedAt       DateTime @default(now())

  shop            Shop             @relation(fields: [shopId], references: [id], onDelete: Cascade)
  externalContact ExternalContact? @relation(fields: [externalContactId], references: [id], onDelete: Cascade)
  conversation    Conversation?    @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  /// กันเก็บซ้ำที่ชั้น DB (BR-CFL-03) — NULL ใน Postgres ไม่ชนกันเอง ⇒ แถวที่เจ้าของเป็น
  /// conversation จะมี (NULL, fileId) ซึ่งไม่มีวันชน unique ตัวแรก และกลับกัน
  /// ⇒ ได้ผลเป็น partial-unique ต่อเจ้าของโดยไม่ต้องเขียน partial index เอง
  @@unique([externalContactId, fileId])
  @@unique([conversationId, fileId])
  /// keyset pagination: เรียง sentAt DESC, id DESC
  @@index([externalContactId, sentAt(sort: Desc)])
  @@index([conversationId, sentAt(sort: Desc)])
  @@index([shopId])
}
```

### เพิ่ม back-relation ในโมเดลเดิม (3 บรรทัด ไม่แตะคอลัมน์)

| โมเดล | บรรทัดที่เพิ่ม |
|---|---|
| `Shop` | `customerFiles CustomerFile[]` |
| `ExternalContact` | `customerFiles CustomerFile[]` |
| `Conversation` | `customerFiles CustomerFile[]` |

---

## 3. CHECK constraint (unmanaged SQL — เขียนมือใน migration)

```sql
ALTER TABLE "CustomerFile"
  ADD CONSTRAINT "CustomerFile_owner_exactly_one_check"
  CHECK (("externalContactId" IS NOT NULL)::int + ("conversationId" IS NOT NULL)::int = 1);

ALTER TABLE "CustomerFile"
  ADD CONSTRAINT "CustomerFile_kind_check"
  CHECK ("kind" IN ('IMAGE', 'VIDEO', 'FILE'));
```

> 🛑 **`CustomerFile_kind_check` เป็น CHECK แบบรายชื่อค่า** — วันที่เพิ่มชนิดที่ 4 ต้องเขียน
> migration แบบ **additive: อ่านนิยามเดิมมาต่อท้าย ห้าม hardcode รายชื่อใหม่ทั้งชุด**
> (`docs/conventions/migration-check-constraint-additive.md` — บทเรียน 00033 ที่สอง branch
> แก้ CHECK พร้อมกันแล้วลบค่าของกันเองเงียบ ๆ โดย migrate สำเร็จทุกไฟล์)

> 🛑 **CHECK ทั้งสองตัวเป็น unmanaged SQL** ⇒ `prisma db pull` จะมองไม่เห็นแล้วพยายามลบทิ้ง
> — ห้ามรัน (Hard Rule 14 ห้ามอยู่แล้ว ย้ำไว้เพราะตารางนี้พึ่ง CHECK เป็นด่านความถูกต้อง)

---

## 4. ทำไมไม่เลือกทางอื่น

| ทางเลือกที่ตัดทิ้ง | เหตุผล |
|---|---|
| คอลัมน์ `savedToLibrary Boolean` บน `ChatMessage` | ข้อความถูกลบ/unsend แล้วธงหายไปด้วย ⇒ ขัด BR-CFL-15 ซึ่งเป็นแก่นของฟีเจอร์ · และเก็บ metadata ของ "การเก็บ" (ใครเก็บ/เมื่อไร/โน้ต) ไม่ได้ |
| FK `sourceMessageId → ChatMessage` | `onDelete: Cascade` = แถวหายตามข้อความ (ผิด) · `SetNull` ก็ใช้ได้แต่ผูก schema กับตารางที่ลบได้โดยไม่จำเป็น — เราไม่เคย join กลับ ใช้แค่ตอนกด "ดูในแชท" ซึ่ง resolve ฝั่ง client อยู่แล้ว |
| ผูกเจ้าของกับ `Customer` (คนที่มีเบอร์) | ลูกค้าส่วนใหญ่ในเธรดช่องทางนอก **ยังไม่มี `Customer`** (ผูกเมื่อได้เบอร์เท่านั้น) ⇒ คลังจะใช้ไม่ได้กับคนส่วนใหญ่ |
| คอลัมน์เดียว `ownerKey String` (polymorphic) | เสีย FK/cascade และ Postgres ตรวจอะไรให้ไม่ได้เลย — ต้องมาไล่ลบแถวกำพร้าเองภายหลัง |
| hash เนื้อหาไฟล์เพื่อ dedup ข้ามข้อความ | Known Gap ที่ user รับทราบแล้ว (PRD §4.3) — คนละระดับความซับซ้อน |

---

## 5. ผลกระทบต่อข้อมูลเดิม

- **ไม่มี** — ตารางใหม่ล้วน ไม่ ALTER ตารางเดิม ไม่ backfill
- ไม่มีการเขียนไฟล์ใหม่ลง storage ⇒ ไม่กระทบโควตา/บิล storage
- `onDelete: Cascade` ทั้ง 3 relation: ร้าน/ผู้ติดต่อ/เธรดถูกลบ → แถวคลังหายตาม **แต่ไฟล์ใน storage ไม่ถูกลบ** (BR-CFL-17 — ไฟล์เดียวกันยังถูกอ้างจาก `ChatMessage`)

---

## 6. คำสั่ง apply บนฐาน local (ปักหมุด localhost ตรง ๆ ตาม Hard Rule 14)

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
DIRECT_URL="postgresql://postgres:postgres@localhost:5434/safepay" \
npx prisma migrate deploy
```

ห้ามใช้ `$(grep ... .env.local)` หรือ `migrate dev`/`db push --force-reset`/`db pull` เด็ดขาด

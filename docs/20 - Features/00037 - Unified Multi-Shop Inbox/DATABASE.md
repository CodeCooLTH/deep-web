---
title: "DATABASE — กล่องแชทรวมหลายร้าน"
owner: shinobu22
status: implemented
created: 2026-08-08
tags: [database, feature, chat, multi-shop]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M37-UnifiedInbox · **เวอร์ชัน:** 1.0 · **สถานะ:** Implemented (apply local แล้ว, prod ขึ้นตอน deploy)

# DATABASE: กล่องแชทรวมหลายร้าน

## 1. สรุปการเปลี่ยนแปลง

| ตาราง | การเปลี่ยนแปลง | ชนิด |
|-------|----------------|------|
| `User` | เพิ่มคอลัมน์ `chatScopeMode` | additive (ไม่ทำลายข้อมูล) |

**ไม่มีตารางใหม่ ไม่มี index ใหม่ ไม่มีการแก้ constraint เดิม**

## 2. คอลัมน์ใหม่

```prisma
model User {
  // ...
  chatScopeMode String @default("SINGLE") // "SINGLE" | "UNIFIED"
}
```

| คุณสมบัติ | ค่า | เหตุผล |
|-----------|-----|--------|
| ชนิด | `TEXT NOT NULL` | ตาม convention เดิมของโปรเจกต์ (`Order.status`, `Product.type`, `ShopMember.role`) — ค่าที่ผู้ใช้เห็นไม่ใช้ enum ของ Postgres เพื่อเลี่ยง `ALTER TYPE` ทุกครั้งที่เพิ่มค่า |
| ค่าเริ่มต้น | `'SINGLE'` | ผู้ใช้เดิมทุกแถวได้ค่าที่แปลว่า "เหมือนเดิม" ทันที — **ไม่ต้องมีสคริปต์ backfill** และไม่มีช่วงเวลาที่ใครเห็นพฤติกรรมใหม่โดยไม่ได้เลือกเอง |
| CHECK constraint | **ไม่มีโดยตั้งใจ** | `docs/conventions/migration-check-constraint-additive.md` — migration ที่แก้ CHECK แบบรายชื่อค่าเคยลบค่าของกันเองเงียบ ๆ เมื่อสอง branch แก้พร้อมกัน (เหตุการณ์ 2026-08-06). ด่านของค่านี้อยู่ที่ **Valibot ขาเขียน** (`UpdateProfileSchema.chatScopeMode` = `v.picklist`) และ **`normalizeChatScopeMode()` ขาอ่าน** (ค่าที่ไม่รู้จัก → `SINGLE`, fail-closed) |
| index | ไม่มี | อ่านด้วย PK lookup (`user.findUnique({ where: { id } })`) เท่านั้น ไม่มี query ที่กรองด้วยคอลัมน์นี้ |

## 3. Migration

`prisma/migrations/20260808100000_user_chat_scope_mode/migration.sql`

```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatScopeMode" TEXT NOT NULL DEFAULT 'SINGLE';
```

- `IF NOT EXISTS` — idempotent ปลอดภัยเมื่อ apply ซ้ำ
- ขึ้น prod อัตโนมัติตอน deploy (`vercel.json` → `prisma migrate deploy && …`) **ไม่ต้องสั่งเอง** (HR15)
- ฐาน local ต้อง apply เอง ด้วยคำสั่งที่ปักหมุด `localhost` ตรง ๆ (HR14)

## 4. ข้อมูลที่ query ข้ามร้านและผลต่อความถูกต้อง

การรวมร้านไม่ได้เพิ่มตาราง แต่เปลี่ยน **ขอบเขตของ WHERE** ในหลาย query — จุดที่ต้องระวังคือ query ที่ใช้ `DISTINCT ON`:

> 🛑 `Customer` เป็นตารางระดับ **ทั้งระบบ** (`phone @unique` ไม่ได้ unique ต่อร้าน) ลูกค้าคนเดียวจึงมีออเดอร์ในหลายร้านพร้อมกันได้

| query | คีย์เดิม | คีย์ใหม่ | ถ้าไม่แก้จะเกิดอะไร |
|-------|---------|---------|---------------------|
| `enrichWithOrderStage` (ป้ายสถานะในแถว) | `DISTINCT ON (customerId)` | `DISTINCT ON (shopId, customerId)` | เธรดร้าน B ได้ป้ายจากออเดอร์ล่าสุดของร้าน A — ป้ายขึ้นสวยงามและอัปเดตจริง แค่เป็นออเดอร์คนละร้าน |
| `conversationIdsByShipmentState` (ตัวกรองพัสดุ) | `DISTINCT ON (customerId)` + join ด้วย `customerId` | `DISTINCT ON (shopId, customerId)` + join ด้วย `customerId AND shopId` | ตัวกรองพัสดุของร้าน B ตัดสินจากออเดอร์ของร้าน A |

query อื่นที่เปลี่ยนเป็น `IN (...)` เฉย ๆ (`Conversation`, `ChatMessage`, `ShopChannel`, `PageComment`) ไม่มีปัญหานี้ เพราะคีย์ของมันคือ `shopId`/`shopChannelId` อยู่แล้ว

## 5. Rollback

ถอยได้ด้วยการลบคอลัมน์ (`ALTER TABLE "User" DROP COLUMN "chatScopeMode"`) — ไม่มีตารางอื่นอ้างถึง และโค้ดที่อ่านค่านี้ตกไป `SINGLE` เองเมื่ออ่านไม่ได้ (`normalizeChatScopeMode`) แต่ **ในทางปฏิบัติไม่ต้อง rollback**: ค่าเริ่มต้นทำให้ระบบทำงานเหมือนก่อนมีฟีเจอร์อยู่แล้ว การถอยโค้ดอย่างเดียวก็พอ

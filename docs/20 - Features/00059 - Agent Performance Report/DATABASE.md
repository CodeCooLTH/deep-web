---
title: "DATABASE — รายงานผลงานแอดมิน"
owner: shinobu22
status: draft
created: 2026-08-26
tags: [feature, 00059, database]
related: ["[[SDS]]", "[[SRS]]"]
---

> **โมดูล:** M59-AgentPerformance
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-26

# DATABASE: รายงานผลงานแอดมิน

---

## 1. สรุป

**ไม่มีตารางใหม่ · ไม่มีคอลัมน์ใหม่ · ไม่มีการเปลี่ยนความหมายของคอลัมน์เดิม**

การเปลี่ยนแปลงทั้งหมดคือ **index หนึ่งตัว**:

```sql
CREATE INDEX IF NOT EXISTS "Conversation_shopId_createdAt_idx"
  ON "Conversation" ("shopId", "createdAt");
```

migration: `prisma/migrations/20260826090000_agent_performance_report_indexes/`

---

## 2. ทำไมต้องมี index ตัวนี้

รายงานเริ่มจากคำถามเดียว: *"เธรดของร้านนี้ที่ถูกเปิดใน [from, to) มีอะไรบ้าง"*
แล้ว query ที่เหลือทั้งหมด JOIN ต่อจากชุดนั้น

`Conversation` มี index ของ `lastMessageAt` และ `lastInboundAt` อยู่แล้ว แต่ **ไม่มีของ `createdAt` เลย**
⇒ ทุกคำขอต้องอ่านเธรดทั้งร้านแล้วค่อยทิ้งที่อยู่นอกช่วง ซึ่งโตตาม *อายุร้าน* ไม่ใช่ตาม *ช่วงที่ขอ*

🛑 **ทำไมไม่ใช้ `lastMessageAt` ที่มี index อยู่แล้ว:** มันคือ "ข้อความล่าสุด" ซึ่งขยับทุกครั้งที่มีใครพิมพ์
เธรดจากเดือนที่แล้วที่ลูกค้าเพิ่งทักวันนี้จะกระโดดเข้ามาอยู่ในช่วงของวันนี้ แล้วเวลาตอบครั้งแรกของมัน
(ซึ่งเกิดเดือนที่แล้ว) จะถูกนับเป็นผลงานของสัปดาห์นี้

---

## 3. ความปลอดภัยของ migration

- คำสั่งเดียว เป็น `CREATE INDEX IF NOT EXISTS` — **ไม่มี DROP / ALTER / DELETE**
- ไม่เปลี่ยนผลลัพธ์ของ query ใดที่มีอยู่ เพิ่มความเร็วอย่างเดียว
- ไม่ใช้ `CONCURRENTLY` เพราะ `prisma migrate deploy` ห่อทุกไฟล์ไว้ในทรานแซกชัน
  (และตารางบน prod เล็กพอ — `ChatMessage` ทั้งฐาน ~40,700 แถว ณ 2026-08-20)

🛑 **ตาม Hard Rule 15** — การ deploy รัน `prisma migrate deploy` ให้อยู่แล้ว:
1. **prod ไม่ต้องสั่งเอง** push ขึ้น `main` แล้ว migration ขึ้นเอง
2. **ฐาน local ต้อง apply เอง** — `npm run db:local:migrate` (ปักหมุด localhost ตาม HR14)
3. **migrate ล้ม = build ล้ม = deploy ไม่ขึ้น** ของเก่ายังเสิร์ฟอยู่ ไม่มีสถานะครึ่งกลาง

---

## 4. index ที่ใช้อยู่แล้วและมีผลกับรายงานนี้

| index | ใช้ตอนไหน |
|---|---|
| `ChatMessage(conversationId, senderRole, createdAt)` | CTE `ev` กรองข้อความ + LATERAL หาเจ้าของเธรด |
| `ChatMessage(conversationId, createdAt)` | เดินลำดับข้อความใน window function |
| `Order(conversationId)` | ดึงออเดอร์ที่ผูกกับเธรดในขอบเขต |
| `OrderShipment` (partial unique + orderId) | `revenueOrderSql` เช็คว่าขนส่งรับของแล้ว |
| `ShopMember(shopId, role)` | รายชื่อแอดมินของร้าน |

---

## 5. คอลัมน์ที่รายงานนี้พึ่งพา (และข้อควรระวังของแต่ละตัว)

| คอลัมน์ | ข้อควรระวัง |
|---|---|
| `ChatMessage.senderUserId` | `NULL` = ไม่รู้ว่าใครส่ง (webhook echo / บอท / Business Suite) **ไม่ใช่ "ระบบส่ง" เสมอไป** |
| `ChatMessage.autoReplyKind` | `NULL` = คนส่ง · `AUTO`/`AUTO_TEST` = ระบบส่ง (ถูกติดป้ายย้อนหลังได้ ดู `channel-chat.service.ts:3791`) |
| `ChatMessage.seq` | `@unique` — ตัวตัดสินลำดับเมื่อ `createdAt` เท่ากัน (Meta ส่งเวลาระดับวินาทีสำหรับบางชนิด) |
| `Order.conversationId` | **ไม่ backfill โดยตั้งใจ** — ออเดอร์ก่อน 2026-08-12 เป็น `NULL` ทั้งหมด |
| `Order.createdByUserId` | `NULL` ได้ 2 ความหมาย: ออเดอร์เก่า หรือระบบออกให้เอง (ปิดประมูล) |
| `Conversation.referralSource` | `NULL` = ทักเข้ามาเอง — ตัวกรองต้องเขียนให้รับ `NULL` ไม่งั้นทิ้งกลุ่มนี้ทั้งกลุ่ม |
| `Shop.staffCanViewFinance` | default `true` แต่ต้องอ่านธงเสมอ ห้ามลัด (สวิตช์ของเจ้าของร้านจะกลายเป็นของหลอก) |

---

## 6. ผลกระทบต่อข้อมูลเดิม

ไม่มี — รายงานนี้ **อ่านอย่างเดียว** ไม่มี write path ใด ๆ ทั้งสิ้น

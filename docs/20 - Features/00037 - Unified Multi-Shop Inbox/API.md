---
title: "API — กล่องแชทรวมหลายร้าน"
owner: shinobu22
status: implemented
created: 2026-08-08
tags: [api, feature, chat, multi-shop]
related: ["[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M37-UnifiedInbox · **เวอร์ชัน:** 1.0 · **สถานะ:** Implemented

# API: กล่องแชทรวมหลายร้าน

ทุก endpoint ต้องมี session (`getServerSession`) — ไม่มี = 401 · header `Cache-Control: private, no-store` เสมอ (ข้อมูลรายผู้ใช้)

## 1. Endpoint ใหม่

### `GET /api/chat/shop-context`

ข้อมูลประกอบฟอร์มสร้างรายการของร้านหนึ่ง (ใช้ตอนเปิดร่างในเธรดของร้านที่ไม่ใช่ร้าน active)

| ส่วน | รายละเอียด |
|------|-----------|
| query | `shopId` (optional) — ไม่ส่ง = ร้านที่ active |
| 200 | `{ shopId, catalog[], bestSellers[], inventoryEnabled, vocab, shopVertical, serviceResourcesEnabled, serviceResources[], appointmentGranularity, hasShipping }` |
| 403 | `shopId` อยู่นอก `scope.shopIds` |
| 404 | resolve ขอบเขตไม่ได้ / ไม่พบร้าน |
| 500 | โหลดข้อมูลไม่สำเร็จ (client แสดงปุ่มลองใหม่) |

> ทำไมคืนทั้งชุดใน request เดียว: กฎ "ร้านนี้ต้องกรอกที่อยู่จัดส่งไหม" ตัดสินจาก `shopVertical` ร่วมกับธง `fulfillmentMode` ของสินค้าใน `catalog` — ถ้าสองอย่างมาคนละจังหวะจะมีช่วงที่ฟอร์มถือ vertical ของร้านหนึ่งกับสินค้าของอีกร้าน (คลาสเดียวกับบั๊กร้านบริการถูกบังคับที่อยู่ 2026-08-07)

> ทำไมที่นี่ตอบ 403 ได้ (ต่างจากตัวกรองรายการที่ต้องคืนผลว่าง): ผู้เรียกรู้อยู่แล้วว่าร้านนี้มีตัวตน — มันมาจากเธรดที่เพิ่งเปิด จึงไม่ใช่การรั่วข้อมูลใหม่

## 2. Endpoint เดิมที่เปลี่ยนพฤติกรรม

| Endpoint | เปลี่ยนอะไร |
|----------|------------|
| `GET /api/chat/conversations` | ขอบเขต = `scope.shopIds`; รับ query **`shopId`** ใหม่เป็นตัวกรอง (intersect กับขอบเขต — นอกขอบเขต = รายการว่าง ไม่ใช่ 403); `sweepStuckJobs`/`syncShipmentStatuses` ใน `after()` วนทุกร้านในขอบเขต |
| `GET /api/chat/inbox-tab-counts` | นับ 2 แท็บข้ามร้าน |
| `GET /api/chat/spam-unread` | นับข้ามร้าน |
| `GET /api/chat/problem-count` | นับข้ามร้าน |
| `GET /api/chat/comments/posts` | โพสต์ของทุกเพจในขอบเขต; แต่ละแถวมี `shop: { id, name }` |
| `GET /api/chat/tags` | union แท็กข้ามร้านในขอบเขต (รับ `?shopId=` เพื่อจำกัดร้านเดียวได้) |
| `PATCH /api/chat/conversations/[id]` | ร้านมาจาก **เธรด** (`resolveConversationShopId`) ไม่ใช่ร้าน active; เธรดนอกขอบเขต = 404 ก่อนแตะ service |
| `GET/PATCH /api/chat/conversations/[id]/crm` | เหมือนข้างบน |
| `GET /api/chat/conversations/[id]/orders` | เหมือนข้างบน |
| `GET /api/chat/conversations/[id]/preview` | เหมือนข้างบน |
| `POST /api/chat/conversations/[id]/ai-suggest` | เหมือนข้างบน — สำคัญเป็นพิเศษเพราะ route นี้อ่านสินค้า/น้ำเสียง/โควตาของร้านไปสร้างคำตอบ |
| `GET /api/chat/conversations/[id]/customer-prefill` | เหมือนข้างบน |
| `GET/POST /api/chat/groups`, `PATCH/DELETE /api/chat/groups/[id]` | รับ `?shopId=` (intersect); ไม่ส่ง = ร้าน active |
| `GET/POST/PATCH /api/chat/quick-messages`, `PATCH/DELETE /api/chat/quick-messages/[id]` | เหมือนข้างบน |
| `GET /api/chat/ai-quota` | เหมือนข้างบน |
| `PATCH /api/users/me` | allow-list เพิ่ม **`chatScopeMode`** (`v.picklist(['SINGLE','UNIFIED'])`); response `select` เพิ่มคอลัมน์เดียวกัน |

## 3. Endpoint ที่ **ไม่** เปลี่ยนโดยตั้งใจ

`/api/channels/**` (เชื่อม/ถอด/รายการเพจสำหรับหน้าตั้งค่า) — เป็นการตั้งค่าของร้าน ต้องอยู่ในบริบทร้านเดียวเสมอ · หน้าแชทเลิกเรียก `/api/channels` แล้ว (รับเพจจาก layout ผ่าน prop แทน)

## 4. สัญญาความปลอดภัยที่ทุก endpoint ต้องรักษา

1. **ขอบเขตร้านคำนวณฝั่ง server จาก session เท่านั้น** — ห้ามรับ `shopIds` จาก client
2. `?shopId=` เป็น "ตัวกรองภายในขอบเขต" ไม่ใช่ขอบเขต — ต้องผ่าน `intersectScopedShopIds`/`resolveScopedShopId` เสมอ
3. นอกขอบเขต → ผลว่างหรือ 404 **ไม่ใช่ 403** (403 ยืนยันการมีอยู่ของทรัพยากร) ยกเว้น `shop-context` ตามเหตุผลใน §1
4. ownership อยู่ใน `WHERE` ตั้งแต่คำสั่งแรก ไม่ใช่ดึงมาแล้วค่อยเช็ค

<!-- Feature 00048 - Customer File Library -->

---
title: "API — คลังไฟล์ต่อลูกค้า"
owner: shinobu22
status: draft
created: 2026-08-13
tags: [api, feature, 00048]
related: ["[[SRS]]", "[[SDS]]", "[[DATABASE]]"]
---

# API: คลังไฟล์ต่อลูกค้า (00048)

**Base:** `/api/chat/conversations/[id]/library`
**Auth:** session ผู้ขาย + `resolveConversationShopId()` (scope สิทธิ์ใน `WHERE` — คืน `null` เหมือนกันทั้ง "ไม่มีเธรด" และ "ไม่มีสิทธิ์")
**Headers:** ทุก response `Cache-Control: private, no-store, max-age=0, must-revalidate`
**Runtime:** `export const dynamic = "force-dynamic"`

---

## 1. `GET /api/chat/conversations/{id}/library`

อ่านรายการไฟล์ในคลังของเธรดนี้ (keyset pagination)

**Query params**

| ชื่อ | ชนิด | ค่าตั้งต้น | หมายเหตุ |
|---|---|---|---|
| `take` | int 1–60 | 9 | พรีวิวในแผงใช้ 9 · โมดัลใช้ 60 |
| `cursorSentAt` | ISO datetime | — | ต้องส่งคู่กับ `cursorId` เสมอ |
| `cursorId` | uuid | — | ส่งมาตัวเดียวโดยไม่มีอีกตัว → 400 |

**200**
```jsonc
{
  "items": [
    {
      "id": "3f0c…",
      "fileId": "2026/08/08/9a1b….jpg",
      "kind": "IMAGE",                 // "IMAGE" | "VIDEO" | "FILE"
      "fileName": "สลิปมัดจำ 5,000 บาท",
      "fileSize": 284213,
      "note": null,
      "sourceMessageId": "b71e…",      // null = ไม่ทราบต้นทาง → ซ่อนปุ่ม "ดูในแชท"
      "senderRole": "BUYER",
      "senderName": "ณัฐธิดา ศรีสุวรรณวัฒนกุล",
      "sentAt": "2026-08-08T07:32:11.000Z",
      "savedByName": "ร้านค้าดี",
      "savedAt": "2026-08-12T02:15:40.000Z"
    }
  ],
  "total": 12,                          // ยอดรวมจริงในคลัง — ใช้กับ "ดูไฟล์ทั้งหมด (N)"
  "nextCursor": { "sentAt": "…", "id": "…" }  // null = หมดแล้ว
}
```

**ข้อผิดพลาด:** `400` รหัสไม่ถูกต้อง/cursor ไม่ครบคู่ · `401` unauthorized · `404` ไม่พบบทสนทนานี้

> `total` คือ `count()` จริงเสมอ ไม่ใช่ `items.length` — ไม่งั้น "ดูไฟล์ทั้งหมด (9)" จะโกหกทุกครั้งที่คลังมีเกิน 9

---

## 2. `POST /api/chat/conversations/{id}/library`

เก็บไฟล์เข้าคลัง (idempotent)

**Body** — `LibrarySaveSchema` (Valibot)
```jsonc
{
  "messageId": "b71e…"   // uuid ของ ChatMessage ที่เป็นเจ้าของไฟล์
}
```

**ทำไมรับแค่ `messageId` ไม่รับ `fileId`/`kind`/`sentAt` จาก client:** ค่าที่ตัดสิน "เก็บอะไร"
ต้อง**อ่านจากฐานฝั่ง server เสมอ** — ถ้ารับจาก client จะเปิดช่องให้ยัด fileId ของร้านอื่นเข้าคลังตัวเอง
และทำให้ snapshot (ผู้ส่ง/เวลา) เป็นค่าที่ client แต่งมาได้

**201 / 200**
```jsonc
{ "item": { /* รูปเดียวกับ items[] ของ GET */ }, "created": true }
```
`created: false` = ไฟล์นี้อยู่ในคลังอยู่แล้ว (ชน `@@unique` แล้วถูกดัก) — **ไม่ใช่ error**

**ข้อผิดพลาด**

| status | เมื่อไร | body |
|---|---|---|
| `400` | body ไม่ผ่าน schema | `{ "error": "<ข้อความแรกจาก Valibot>" }` |
| `401` | ไม่มี session / ไม่รู้ว่าเป็นใคร | `{ "error": "unauthorized" }` |
| `404` | ไม่มีสิทธิ์เธรด **หรือ** ไม่พบข้อความนี้ในเธรดนี้ | `{ "error": "ไม่พบบทสนทนานี้" }` / `{ "error": "ไม่พบข้อความนี้" }` |
| `422` | ข้อความนี้เก็บเข้าคลังไม่ได้ (สติกเกอร์/เสียง/การ์ด/ไม่มีไฟล์แนบ) | `{ "error": "ไฟล์ชนิดนี้เก็บเข้าคลังไม่ได้" }` |

> `404` ครอบทั้ง "ข้อความไม่อยู่ในเธรดนี้" ด้วย — ไม่ตอบต่างกันเพื่อไม่ให้ probe ได้ว่า id ไหนมีอยู่จริง

---

## 3. `DELETE /api/chat/conversations/{id}/library?fileId=…`

เอาไฟล์ออกจากคลัง (hard delete)

**Query:** `fileId` (string, บังคับ) — ใช้ `fileId` ไม่ใช่ row id เพราะฝั่งเธรดรู้แค่ `fileId` ของข้อความ

**200** `{ "removed": true }` — `removed: false` เมื่อไม่มีแถวนั้นอยู่แล้ว (idempotent ไม่ใช่ 404)

**ข้อผิดพลาด:** `400` ไม่มี `fileId` · `401` · `404` ไม่พบบทสนทนานี้

---

## 4. `PATCH /api/chat/conversations/{id}/library`

แก้ชื่อไฟล์/โน้ต

**Body** — `LibraryPatchSchema`
```jsonc
{
  "fileId": "2026/08/08/9a1b….jpg",
  "fileName": "สลิปมัดจำ 5,000 บาท",   // optional, 1–120 ตัวอักษร, trim แล้วว่าง = null
  "note": "ลูกค้าขอใบเสร็จย้อนหลัง"      // optional, ≤500 ตัวอักษร, trim แล้วว่าง = null
}
```
ต้องมีอย่างน้อย 1 field นอกจาก `fileId` ไม่งั้น 400

**200** `{ "item": { /* แถวหลังแก้ */ } }`
**ข้อผิดพลาด:** `400` · `401` · `404` ไม่พบบทสนทนานี้/ไม่พบไฟล์นี้ในคลัง

---

## 5. สิ่งที่ **ไม่มี** ใน API นี้ (โดยตั้งใจ)

| ไม่มี | เหตุผล |
|---|---|
| endpoint สาธารณะสำหรับลูกค้า | BR-CFL-10 — ลูกค้าไม่มีสิทธิ์เข้าถึงคลังในทุกกรณี |
| bulk save (array ของ messageId) | รอบแรกเก็บทีละใบ (BRD §4.2) — เพิ่มทีหลังได้โดยไม่ทำลาย contract เดิม |
| filter ชนิดไฟล์ใน `GET` | มติ D-16 ไม่มีตัวกรองรอบแรก |
| ตัวส่งไฟล์เข้าคลังโดยตรง (อัปโหลดใหม่) | คลังคือ "ของที่คัดจากเธรด" — ทางเข้าเดียวคือ `messageId` (มติ D-1) |

---

## 6. Rate limit

ใช้ bucket เดิมของ `guardApi` (mutation 30/นาที/ผู้ใช้) — **ไม่ต้องเพิ่ม bucket ใหม่**
ต่างจาก `/api/uploads/*` ที่ต้องมี bucket แยกเพราะยิง 2 request ต่อไฟล์และแนบกริดได้ 24 ใบพร้อมกัน
ส่วนคลังนี้ผู้ใช้กดทีละใบด้วยมือ ⇒ 30/นาทีเกินพอ

---
title: "API Contract — Deep Chat"
owner: shinobu22
status: draft
module: M00011-DeepChat
version: "1.0"
created: 2026-07-03
tags: [feature, chat, messaging, buyer, seller, realtime, api]
related: ["[[SRS]]", "[[SDS]]", "[[DATABASE]]"]
---

> **โมดูล:** M00011-DeepChat
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-03
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: Deep Chat

---

## 1. Overview

API ชุดนี้เป็นของใหม่ทั้งหมด (`/api/chat/**`) ไม่แก้ contract เดิมใด ๆ — เดินตาม pattern เดียวกับ 00009 (session-derived identity, ไม่รับ `shopId`/`buyerUserId` จาก client body, Valibot validate, error `{error: "<message>"}`)

**Provider:** Next.js 16 App Router Route Handlers (nodejs runtime)
**ผู้บริโภค:** buyer `/messages`+`/messages/[shopId]` (Vuexy client component), seller `/inbox`+`/inbox/[conversationId]` (Paces client component), `UserProfileHeader.tsx` (login-gate navigate เท่านั้น ไม่เรียก API โดยตรง)
**Base URL:** `https://deepthailand.app` (buyer, prod) / `https://seller.deepthailand.app` (seller, prod) — dev: `https://deepth.local:4000` / `https://seller.deepth.local:4000`
**ต้นทาง:** [[SDS]] §3-4; schema → [[DATABASE]] (**migration ต้อง apply ก่อน — รวมทั้ง migration ตารางเดิมและ trigger ใหม่ที่ยังไม่มี ดู SDS §9 FLAG-1**)

---

## 2. Authentication

- ทุก endpoint ต้องมี NextAuth session (`getServerSession(authOptions)`) — ไม่มี session → 401 `{error: "unauthorized"}`
- CSRF Origin-check + rate-limit ทั่วไป (per-IP, auth 30 mutation/min) ผ่าน `guardApi` ใน `src/proxy.ts` — apply อัตโนมัติกับ `/api/chat/*` (ไม่ได้อยู่ใน exclusion list `/api/auth/*`/`/api/app/*`/`/api/cron/*`) ไม่ต้องเพิ่มโค้ดอะไรเพื่อได้ชั้นนี้
- **เพิ่มเติมเฉพาะ `POST .../messages`:** per-user rate-limit เฉพาะ chat-send (30/min, key `` `chat-send:${userId}` ``) — ชั้นที่ 2 แยกจาก global per-IP ข้างบน
- Ownership: buyer เห็นเฉพาะ conversation ที่ `buyerUserId === session.user.id`; seller เห็นเฉพาะ conversation ที่ `shop.userId === session.user.id` (shop = personal shop ของ session user, `getShopByUserId`) — enforce ที่ service layer (`chat.service.ts`) ทุกจุด (ดู [[SRS]] §10 Authorization Matrix)
- ไม่มี auth mechanism ใหม่ในฟีเจอร์นี้ (ไม่มี Bearer token, ไม่มี API key)

---

## 3. Endpoint List

| Method | Path | คำอธิบาย | Auth | สถานะ |
|--------|------|----------|------|-------|
| `POST` | `/api/chat/conversations` | Start/get conversation by `shopId` | buyer session | ใหม่ |
| `GET` | `/api/chat/conversations` | Inbox list — role จาก subdomain | buyer/seller session | ใหม่ |
| `GET` | `/api/chat/conversations/[id]/messages` | Thread history, cursor pagination | participant session | ใหม่ |
| `POST` | `/api/chat/conversations/[id]/messages` | ส่งข้อความ TEXT/IMAGE | participant session | ใหม่ |
| `POST` | `/api/chat/conversations/[id]/read` | Mark-read (แยกฝั่ง buyer/shop) | participant session | ใหม่ |

---

## 4. Endpoint Detail

### 4.1 `POST /api/chat/conversations` (ใหม่)

Start หรือ get conversation ที่มีอยู่แล้ว โดย `shopId` — เฉพาะ buyer surface (main subdomain) Trace: SDS §3.3 → SRS TFR-CHAT-01 → BRD FR-CHAT-01

**Request Body:**
```json
{ "shopId": "uuid" }
```
| field | type | req | คำอธิบาย |
|-------|------|-----|----------|
| `shopId` | `string (uuid)` | yes | ร้านที่ต้องการเริ่ม/เปิดบทสนทนาด้วย |

**Valibot:** `StartConversationSchema`

**Success 200:**
```json
{
  "id": "uuid",
  "buyerUserId": "uuid",
  "shopId": "uuid",
  "lastMessageAt": "2026-07-03T10:00:00.000Z",
  "lastMessagePreview": null,
  "lastSenderRole": null,
  "buyerLastReadAt": null,
  "shopLastReadAt": null,
  "createdAt": "2026-07-03T10:00:00.000Z"
}
```
(ถ้ามี conversation อยู่แล้ว — คืนแถวเดิม พร้อม field ที่มีค่าจริงตามประวัติ)

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `shopId` ไม่ใช่ uuid หรือขาดหาย | `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | ไม่พบ `shopId` | `{ "error": "ไม่พบร้านค้า" }` |
| 429 | rate-limit (global per-IP) | `{ "error": "Rate limit exceeded" }` |

**Idempotency:** idempotent จริง — เรียกซ้ำกี่ครั้งด้วย `shopId` เดิมคืนแถวเดิมเสมอ (ไม่ throw 409)

---

### 4.2 `GET /api/chat/conversations` (ใหม่)

Inbox list — role กำหนดจาก subdomain (`getSubdomain(host)`) Trace: SDS §3.3 → SRS TFR-CHAT-07/09 → BRD FR-CHAT-07/09

**Query params:**
| param | type | req | default | คำอธิบาย |
|-------|------|-----|---------|----------|
| `cursor` | `string` (ISO datetime) | no | — | `lastMessageAt` ของแถวสุดท้ายที่เห็นแล้ว |
| `take` | `number` | no | `20` | 1-50 |

**Valibot:** `ChatConversationsQuerySchema`

**Success 200:**
```json
{
  "items": [
    {
      "id": "uuid", "buyerUserId": "uuid", "shopId": "uuid",
      "lastMessageAt": "2026-07-03T10:05:00.000Z",
      "lastMessagePreview": "มีไซส์ M ไหมคะ", "lastSenderRole": "BUYER",
      "buyerLastReadAt": "2026-07-03T10:00:00.000Z", "shopLastReadAt": null,
      "createdAt": "2026-07-03T09:00:00.000Z",
      "counterparty": { "shopName": "ร้านนกน้อย", "logo": "abc123.jpg" }
    }
  ],
  "nextCursor": "2026-07-03T09:00:00.000Z"
}
```

**Behavior ตาม subdomain:**
- `seller.*` → `shopId = getShopByUserId(session.user.id).id` (ไม่พบ shop → 404); `counterparty` = buyer identity `{ displayName, avatar }` (route enrich, B1)
- อื่น (main) → `buyerUserId = session.user.id`; `counterparty` = shop identity `{ shopName, logo }` (route enrich, B1)

**B1 (route enrich, additive):** `counterparty` เป็น field เสริมที่ query แยกจาก `chat.service.ts` (ไม่แตะ `ConversationSummary` FROZEN CONTRACT) — buyer role คืน `{shopName, logo}` จาก `conversation.shopId`; seller role คืน `{displayName, avatar}` จาก `conversation.buyerUserId`; ไม่พบแถวต้นทาง (กำพร้า) → `null`, UI ต้อง handle fallback

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | query param ไม่ผ่าน Valibot | `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | (seller เท่านั้น) ไม่มี personal shop | `{ "error": "ไม่พบร้านค้า" }` |
| 429 | rate-limit | `{ "error": "Rate limit exceeded" }` |

---

### 4.3 `GET /api/chat/conversations/[id]/messages` (ใหม่)

ประวัติข้อความ cursor-paginated เรียง**ใหม่→เก่า** (client reverse ก่อน render) Trace: SDS §3.3 → SRS TFR-CHAT-08/10 → BRD FR-CHAT-08/10

**Path param:** `id` = `conversationId`

**Query params:**
| param | type | req | default | คำอธิบาย |
|-------|------|-----|---------|----------|
| `cursor` | `string` (ISO datetime) | no | — | `createdAt` ของข้อความเก่าสุดที่เห็นแล้ว |
| `take` | `number` | no | `30` | 1-100 |

**Valibot:** `ChatMessagesQuerySchema`

**Success 200:**
```json
{
  "items": [
    {
      "id": "uuid", "conversationId": "uuid", "senderUserId": "uuid",
      "senderRole": "BUYER", "type": "TEXT", "body": "มีไซส์ M ไหมคะ",
      "imageUrl": null, "createdAt": "2026-07-03T10:05:00.000Z"
    }
  ],
  "nextCursor": "2026-07-03T09:00:00.000Z"
}
```
`imageUrl` (ถ้า `type=IMAGE`) เป็น `fileId` ดิบ — client render ด้วย `` `/api/files/${imageUrl}` `` (ดู [[SDS]] §5 FROZEN CONTRACT)

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | query ไม่ผ่าน Valibot | `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 403 | `session.user.id` ไม่ใช่ buyer หรือ shop-owner ของ conversation นี้ | `{ "error": "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }` |
| 404 | ไม่พบ `conversationId` | `{ "error": "ไม่พบบทสนทนา" }` |
| 429 | rate-limit | `{ "error": "Rate limit exceeded" }` |

---

### 4.4 `POST /api/chat/conversations/[id]/messages` (ใหม่)

ส่งข้อความ TEXT หรือ IMAGE Trace: SDS §3.3 → SRS TFR-CHAT-04/05/06 → BRD FR-CHAT-04/05/06

**Path param:** `id` = `conversationId`

**Request Body (TEXT):**
```json
{ "type": "TEXT", "body": "มีไซส์ M ไหมคะ" }
```

**Request Body (IMAGE):**
```json
{ "type": "IMAGE", "imageUrl": "<fileId จาก POST /api/upload>", "body": null }
```
| field | type | req | คำอธิบาย |
|-------|------|-----|----------|
| `type` | `"TEXT" \| "IMAGE"` | yes | |
| `body` | `string` (≤2000) | required ถ้า `type=TEXT` (min 1), optional caption ถ้า `type=IMAGE` | |
| `imageUrl` | `string` | required ถ้า `type=IMAGE` (= `fileId` จาก `POST /api/upload` ที่ผ่าน type-check `image/jpeg`\|`image/png`\|`image/webp` และ ≤5MB แล้ว) | |

**Valibot:** `SendChatMessageSchema`

**Upload flow (แยก request, ก่อนเรียก endpoint นี้):**
1. client `POST /api/upload` (multipart, `file`) → `{fileId}` — reuse เดิม 100% ไม่มี endpoint chat-specific
2. client validate MIME ก่อนอัปโหลด (accept `image/jpeg,image/png,image/webp` — **ไม่ใช่** `application/pdf` แม้ `lib/storage` เดิมจะรับได้) — server-side ต้อง reject เช่นกันถ้าหลุดผ่านมา (ดู [[SRS]] TFR-CHAT-05)
3. client `POST .../messages` ด้วย `fileId` ที่ได้เป็น `imageUrl`

**Success 200:**
```json
{
  "id": "uuid", "conversationId": "uuid", "senderUserId": "uuid",
  "senderRole": "BUYER", "type": "TEXT", "body": "มีไซส์ M ไหมคะ",
  "imageUrl": null, "createdAt": "2026-07-03T10:05:00.000Z"
}
```

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `body` ว่าง/เกิน 2000 ตัวอักษร, `type=IMAGE` ไม่มี `imageUrl` | `{ "error": "<validation message>" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 403 | ไม่ใช่คู่สนทนาของ conversation นี้ | `{ "error": "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }` |
| 404 | ไม่พบ `conversationId` | `{ "error": "ไม่พบบทสนทนา" }` |
| 429 | เกิน 30 ข้อความ/นาที/user **หรือ** global per-IP limit | `{ "error": "Rate limit exceeded" }` (header `Retry-After: 60`) |

**Side-effects:** insert `ChatMessage`, update `Conversation.{lastMessageAt,lastMessagePreview,lastSenderRole}`, insert `Notification(kind='chat_message')` ให้ผู้รับ, trigger broadcast `chat:{conversationId}` (+ `chat:shop:{shopId}` ถ้า `senderRole=BUYER`) — ทั้งหมดใน tx เดียว (ยกเว้น broadcast ที่เป็น DB trigger แยก, fail-safe ไม่ rollback insert)

---

### 4.5 `POST /api/chat/conversations/[id]/read` (ใหม่)

Mark-read — อัปเดต `buyerLastReadAt`/`shopLastReadAt` ตาม role ของผู้เรียก + เคลียร์ `Notification` ค้างของ conversation นี้ Trace: SDS §3.3/§3.5 → SRS TFR-CHAT-08/10/11 → BRD FR-CHAT-08/10/11

**Path param:** `id` = `conversationId`

**Request Body:** `{}` (empty — role derive จาก subdomain, ไม่รับจาก client)

**Success 200:**
```json
{ "ok": true }
```

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 403 | ไม่ใช่คู่สนทนาของ conversation นี้ | `{ "error": "ไม่มีสิทธิ์เข้าถึงบทสนทนานี้" }` |
| 404 | ไม่พบ `conversationId` | `{ "error": "ไม่พบบทสนทนา" }` |
| 429 | rate-limit (global per-IP) | `{ "error": "Rate limit exceeded" }` |

**Idempotency:** idempotent — เรียกซ้ำไม่มีผลข้างเคียงเพิ่ม (update `lastReadAt` = now() ซ้ำได้เรื่อย ๆ, `updateMany` บน `Notification` ที่ไม่มีแถวเหลือ = no-op)

---

## 5. Error Code Summary

| Status | ความหมาย | ใช้ที่ endpoint |
|--------|----------|-----------------|
| 400 | Validation fail (Valibot) | ทุก endpoint ที่มี body/query |
| 401 | ไม่มี session | ทุก endpoint |
| 403 | ไม่ใช่คู่สนทนา (ownership fail) | messages (GET/POST), read |
| 404 | ไม่พบ shop/conversation | conversations (POST/GET-seller), messages, read |
| 429 | rate-limit (global per-IP หรือ chat-send per-user) | ทุก endpoint (global) + messages POST (เพิ่มชั้น per-user) |

---

## 6. Rate-limit Detail

| Layer | Key | Max | Window | Endpoint ที่ apply |
|-------|-----|-----|--------|---------------------|
| Global per-IP (มีอยู่แล้ว, `src/proxy.ts`) | `${ip}:auth:mut` | 30/min | 60s | ทุก mutation ใน `/api/chat/*` |
| Global per-IP read (มีอยู่แล้ว) | `${ip}:auth:get` | 120/min | 60s | ทุก GET ใน `/api/chat/*` |
| Chat-send per-user (ใหม่) | `chat-send:{userId}` | 30/min | 60s | `POST .../messages` เท่านั้น |

Known-gap: in-memory per-instance (Vercel serverless) — เหมือนระบบเดิมทั้งหมด, Redis = Phase 2 (ไม่ใช่ scope feature นี้)

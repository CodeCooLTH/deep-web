---
title: "API Contract — Facebook Chat Integration"
owner: shinobu22
status: draft
module: M00018-FacebookChatIntegration
version: "1.0"
created: 2026-07-22
tags: [feature, chat, messaging, facebook, instagram, seller, integration, api]
related: ["[[SRS]]", "[[SDS]]", "[[DATABASE]]"]
---

> **โมดูล:** M00018-FacebookChatIntegration
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-22
> **สถานะ:** Draft — เอกสารตรงกับ route ที่มีอยู่จริงในโค้ดเท่านั้น ไม่มี endpoint ใดใน PRD/BRD ที่ยังไม่มี route จริง (เช่น list/disconnect channel) ถูกรวมไว้ที่นี่
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: Facebook Chat Integration

---

## 1. Overview

API ชุดนี้แบ่งเป็น 2 กลุ่ม: (1) endpoint ใหม่ทั้งหมดที่ `/api/channels/facebook/**` สำหรับ webhook + OAuth เชื่อม Page และ (2) การแก้เพิ่มของ endpoint เดิม `POST /api/chat/conversations/[id]/messages` (feature 00011) ให้ dispatch ไปทาง Graph API เมื่อเธรดไม่ใช่ `channel="DEEP"`

**Provider:** Next.js 16 App Router Route Handlers (nodejs runtime)
**ผู้บริโภค:** Meta (webhook, server-to-server), seller session (OAuth connect/callback — ปัจจุบันเรียกได้ตรงผ่าน URL เท่านั้น ยังไม่มีปุ่ม UI ให้กด), client เดิมของ `/inbox` (feature 00011 — ยังไม่มี UI แยกสำหรับเธรดช่องทางนอก)
**Base URL:** `https://deepthailand.app` (buyer/webhook endpoint อยู่ domain หลัก ไม่ใช่ `seller.*`) — dev: `https://deepth.local:4000` (webhook ต้องผ่าน ngrok หรือยิงตรงด้วย `scripts/fake-fb-webhook.ts`)
**ต้นทาง:** [[SDS]] §3-4; schema → [[DATABASE]]

---

## 2. Authentication

| Endpoint | วิธี Auth | หมายเหตุ |
|---|---|---|
| `GET/POST /api/channels/facebook/webhook` | **ไม่มี NextAuth session** — `GET`: เทียบ `hub.verify_token` กับ env `FB_WEBHOOK_VERIFY_TOKEN`; `POST`: HMAC-SHA256 `X-Hub-Signature-256` timing-safe compare (env `FB_CHAT_APP_SECRET`) | ยกเว้นจาก CSRF Origin-check ของ `guardApi` (`src/proxy.ts`) เพราะ Meta ไม่ส่ง header `Origin` — **ยัง apply rate-limit ปกติ** |
| `GET /api/channels/facebook/connect` | NextAuth session (`getServerSession`) — ต้อง login เป็น seller | ไม่มี session → `401` |
| `GET /api/channels/facebook/callback` | NextAuth session + OAuth `state` cookie (`fb_channel_oauth_state`, httpOnly) ต้องตรงกับ query param `state` | ป้องกัน CSRF ของ OAuth flow เอง — แยกจาก `guardApi` |
| `POST /api/chat/conversations/[id]/messages` (ส่วนที่แก้เพิ่ม) | เหมือนเดิม (feature 00011) — NextAuth session + ownership check ที่ service | ดู [[../00011 - Deep Chat/API]] สำหรับ contract เดิมของ endpoint นี้ |

ไม่มี auth mechanism ใหม่ (ไม่มี Bearer token/API key) — endpoint ใหม่ทั้งหมดใช้ NextAuth session (routes ที่ seller เรียก) หรือ signature ของ Meta เอง (webhook)

---

## 3. Endpoint List

| Method | Path | คำอธิบาย | Auth | สถานะ |
|--------|------|----------|------|-------|
| `GET` | `/api/channels/facebook/webhook` | Webhook handshake (subscribe verification) | `hub.verify_token` | ใหม่ |
| `POST` | `/api/channels/facebook/webhook` | รับ event ข้อความจาก Meta | `X-Hub-Signature-256` | ใหม่ |
| `GET` | `/api/channels/facebook/connect` | เริ่ม OAuth เชื่อม Facebook Page (redirect) | seller session | ใหม่ |
| `GET` | `/api/channels/facebook/callback` | รับ code จาก Facebook → เชื่อม Page ทั้งหมดที่มีสิทธิ์ | seller session + OAuth state | ใหม่ |
| `POST` | `/api/chat/conversations/[id]/messages` | ส่งข้อความ — dispatch ไป Send API เมื่อ `channel != "DEEP"` | participant session | แก้ไข (feature 00011) |

**ยังไม่มี route (documented เป็น gap ชัดเจน — ห้ามถือว่ามีจริง):**

| Method ที่ควรมี | Path ที่ควรมี | FR ที่รองรับ | เหตุผลที่ยังไม่มี |
|---|---|---|---|
| `GET` | `/api/channels/facebook` (หรือเทียบเท่า) — list ช่องทางที่เชื่อมแล้ว | FR-FBC-11 | service function `listChannels()` เขียนไว้แล้ว แต่ไม่มี route เรียก — รอ UI (SDS TD-005) |
| `DELETE`/`PATCH` | disconnect ช่องทาง | FR-FBC-11 | ไม่มีทั้ง route และ service function สำหรับ disconnect |
| — | สร้างออเดอร์จาก prefill เธรด FB | FR-FBC-07 | `/orders/new` เดิมยังไม่รับ prefill จากเธรดช่องทางนอก |
| — | ผูก `ExternalContact.customerId` | FR-FBC-08 | ไม่มี code path เขียนค่านี้เลย |

---

## 4. Endpoint Detail

### 4.1 `GET /api/channels/facebook/webhook` (ใหม่)

Webhook handshake ตอน subscribe callback URL ในหน้า Facebook App Dashboard — Meta เรียกครั้งเดียวตอนตั้งค่า/เปลี่ยน callback URL Trace: SDS §4.1 → SRS TFR-FBC-01/02 → PRD FR-FBC-09

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Query | `hub.mode` | `string` | yes | ต้องเป็น `"subscribe"` |
| Query | `hub.verify_token` | `string` | yes | ต้องตรงกับ env `FB_WEBHOOK_VERIFY_TOKEN` |
| Query | `hub.challenge` | `string` | yes | ค่าที่ต้อง echo กลับ |

**Response — Success (200)**

Body เป็น **plain text** (ไม่ใช่ JSON) — คืนค่า `hub.challenge` ตรง ๆ, header `content-type: text/plain`

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 403 | `hub.mode != "subscribe"` หรือ `hub.verify_token` ไม่ตรง | `{ "error": "forbidden" }` |

---

### 4.2 `POST /api/channels/facebook/webhook` (ใหม่)

รับ event ข้อความจริงจาก Messenger/Instagram — route เดียวรองรับทั้ง 2 ช่องทาง แยกด้วย `body.object` Trace: SDS §4.1 → SRS TFR-FBC-01..05 → BRD BR-FBC-06/07/09/10/13/22

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Header | `X-Hub-Signature-256` | `string` | yes | `sha256=<hex HMAC-SHA256 ของ raw body ด้วย FB_CHAT_APP_SECRET>` |
| Body | `object` | `"page" \| "instagram"` | yes | ช่องทางต้นทาง — `"page"` = Messenger |
| Body | `entry[].id` | `string` | yes | Page ID (`object=page`) หรือ IG Business Account ID (`object=instagram`) |
| Body | `entry[].messaging[].sender.id` | `string` | yes | PSID/IGSID ของผู้ส่ง (ฝั่งลูกค้าหรือฝั่งเพจถ้า `is_echo`) |
| Body | `entry[].messaging[].recipient.id` | `string` | yes | ฝั่งตรงข้าม sender |
| Body | `entry[].messaging[].message.mid` | `string` | yes | message id จาก Meta — ใช้เป็น `externalMessageId` |
| Body | `entry[].messaging[].message.text` | `string` | no | ข้อความตัวอักษร |
| Body | `entry[].messaging[].message.is_echo` | `boolean` | no | `true` = ข้อความจากฝั่งเพจ (seller ตอบจากแอปมือถือ หรือ echo ของข้อความที่เราส่งเอง) |
| Body | `entry[].messaging[].message.attachments[].type` | `string` | no | `"image"` = รูปภาพ (ประเภทอื่นถูก parse ผ่านแต่ handler ไม่ใช้) |
| Body | `entry[].messaging[].message.attachments[].payload.url` | `string` | no | URL รูปของ Meta (หมดอายุ — ระบบ mirror เข้า storage ของตัวเองทันที) |

**Valibot:** `WebhookBodySchema` (`src/lib/facebook/webhook-types.ts`)

**Response — Success (200)**

```json
{ "ok": true }
```

คืน `200 {ok:true}` แม้ signature ผ่านแต่ payload parse ไม่ผ่าน (shape ไม่รู้จัก) หรือ event เป็น `NO_CHANNEL`/`DUPLICATE`/`IGNORED` — **เจตนา** กัน Meta ยิง retry ไม่จบ

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | `X-Hub-Signature-256` ไม่ผ่านการ verify | `{ "error": "invalid signature" }` |

**Side-effects (ต่อ 1 messaging event ที่ประมวลผลสำเร็จ):** upsert `ExternalContact`, get-or-create `Conversation`, insert `ChatMessage`, update `Conversation` snapshot (`lastMessageAt`/`lastMessagePreview`/`lastSenderRole` + `lastInboundAt` ถ้าไม่ใช่ echo), insert `Notification` (เฉพาะไม่ใช่ echo) — ทั้งหมดใน `$transaction` เดียว ต่อ 1 event (หลาย event ใน batch เดียวกันคนละ transaction — event หนึ่งพังไม่กระทบ event อื่น)

**Idempotency:** unique constraint บน `ChatMessage.externalMessageId` — event ที่มี `mid` ซ้ำ (Meta redeliver หรือ echo ของข้อความที่เราส่งเอง) จะ `P2002` แล้วถูก catch เป็น `DUPLICATE` (ไม่สร้างแถวซ้ำ, ไม่ throw ให้ webhook fail)

---

### 4.3 `GET /api/channels/facebook/connect` (ใหม่)

เริ่ม OAuth flow เชื่อม Facebook Page — แยกจาก `FacebookProvider` ของ NextAuth login เดิมโดยเจตนา (ไม่ขอ scope จัดการเพจตอน login) Trace: SDS §6 TD (ดูสถาปัตยกรรม) → SRS TFR-FBC-07 → BRD BR-FBC-03

**Request**

ไม่มี query param — endpoint นี้อ่านแค่ NextAuth session

**Response — Success**

`302 Redirect` ไป `https://www.facebook.com/v21.0/dialog/oauth?client_id=...&redirect_uri=...&scope=...&response_type=code&state=...` พร้อม `Set-Cookie: fb_channel_oauth_state=<random hex>` (httpOnly, `sameSite=lax`, `path=/api/channels/facebook`, `maxAge=600`)

**scope ที่ขอ:** `pages_show_list, pages_messaging, pages_manage_metadata, pages_read_engagement, business_management, instagram_basic, instagram_manage_messages`

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 500 | ไม่ได้ตั้ง env `FB_CHAT_APP_ID` | `{ "error": "ยังไม่ได้ตั้งค่า FB_CHAT_APP_ID" }` |

---

### 4.4 `GET /api/channels/facebook/callback` (ใหม่)

รับ `code` จาก Facebook หลัง user อนุมัติ → แลก token → ดึงรายการ Page → เชื่อมทั้งหมดที่มีสิทธิ์ `MESSAGING`+`MODERATE` Trace: SRS TFR-FBC-07/08 → BRD BR-FBC-01/02/04/20

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Query | `code` | `string` | yes (ถ้าไม่ error) | authorization code จาก Facebook |
| Query | `state` | `string` | yes | ต้องตรงกับ cookie `fb_channel_oauth_state` |
| Query | `error` | `string` | no | มีค่าเมื่อ user กด "ยกเลิก" ที่หน้า Facebook |

**Response — Success**

`302 Redirect` ไป `/settings/channels?status=connected&connected=<N>&skipped=<ชื่อPageที่ข้าม,คั่นด้วยจุลภาค>` (path `/settings/channels` **ยังไม่มีหน้าจริง** — เป็น redirect target ที่รอ UI แผนถัดไป) — cookie `fb_channel_oauth_state` ถูกลบหลัง sync สำเร็จ

**Response — Error (ทั้งหมด redirect กลับ ไม่ throw HTTP error code ยกเว้น 401)**

| Status | เงื่อนไข | redirect query |
|--------|----------|-----------------|
| 401 | ไม่มี session | (ไม่ redirect — คืน `{error:"unauthorized"}` ตรง ๆ) |
| 302 | user กด "ยกเลิก" (`?error=`) | `status=cancelled` |
| 302 | `state` ไม่ตรงกับ cookie | `status=state_mismatch` |
| 302 | ไม่มี `code` | `status=no_code` |
| 302 | ไม่พบ `Shop` ของ user (`findFirst({userId})`) | `status=no_shop` |
| 302 | ไม่มี Page ที่ผ่านเงื่อนไขสิทธิ์ `MESSAGING`+`MODERATE` เลย | `status=no_eligible_page` |
| 302 | exception ระหว่าง exchange token / list pages / connect (network, Graph API error) | `status=error` (log เฉพาะ `message`, **ไม่ log token**) |

**Side-effects:** สร้าง `ShopChannel` (provider `MESSENGER` และ `INSTAGRAM` ถ้ามี IG ผูก Page นั้นอยู่) ต่อ Page ที่ผ่านเงื่อนไข, เรียก `subscribePageToApp` (Graph API) หลังสร้าง DB สำเร็จ, token เข้ารหัสก่อนเก็บเสมอ

---

### 4.5 `POST /api/chat/conversations/[id]/messages` (แก้เพิ่มจาก feature 00011)

Contract เดิม (`type`, `body`, `imageUrl`, `productRefId`, response shape, error 400/401/403/404/429) **ไม่เปลี่ยน** — ดู [[../00011 - Deep Chat/API]] §4.4 สำหรับ contract เต็มของเธรด `channel="DEEP"` ส่วนนี้ document **เฉพาะ branch ใหม่** ที่เพิ่มเมื่อ `conversation.channel != "DEEP"` Trace: SRS TFR-FBC-09/10 → BRD BR-FBC-05/11/12

**Request:** เหมือนเดิมทุกประการ (`{type: "TEXT", body: "..."}`)

**Behavior เพิ่มเติม (เฉพาะเธรดช่องทางนอก):**
1. Route query `conversation.channel` ก่อนเรียก `sendMessage()` เดิม
2. `channel != "DEEP"` และ `type != "TEXT"` → คืน `400` ทันที (ยังไม่รองรับส่งรูป/สินค้าออกช่องทางนอก)
3. `channel != "DEEP"` และ `type == "TEXT"` → เรียก `sendOutboundMessage()` แทน `sendMessage()`

**Response — Success (200):** เหมือนเดิม (`ChatMessage` object)

**Response — Error (เพิ่มใหม่จาก branch นี้เท่านั้น):**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `channel != "DEEP"` และ `type != "TEXT"` | `{ "error": "ช่องทางนี้รองรับเฉพาะข้อความตัวอักษรในตอนนี้" }` |
| 400 | service throw `NOT_EXTERNAL_CHANNEL` (defense — ไม่ควรเกิดถ้า route query ถูกต้อง) | `{ "error": "ช่องทางของบทสนทนานี้ไม่ถูกต้อง" }` |
| 409 | service throw `WINDOW_CLOSED` (เกิน 24 ชม. นับจากข้อความล่าสุดของลูกค้า) | `{ "error": "เกิน 24 ชั่วโมงนับจากข้อความล่าสุดของลูกค้า — ส่งข้อความไม่ได้จนกว่าลูกค้าจะทักมาใหม่" }` |
| 502 | service throw `SEND_FAILED:*` (Graph API ปฏิเสธ — token ตาย, ลูกค้าบล็อกร้าน, เหตุอื่น) | `{ "error": "ส่งข้อความไปยังช่องทางภายนอกไม่สำเร็จ กรุณาลองใหม่" }` |

Error 401/403/404/429/500 เดิมของ endpoint นี้ (unauthorized, forbidden, conversation not found, rate-limit, generic) **ยังใช้ mapping เดิมทุกประการ** — ไม่มีการเปลี่ยนแปลง

---

## 5. Error Code Summary

| Error String (จาก service) | HTTP Status | Endpoint | ความหมาย |
|---|---|---|---|
| (signature verify fail) | 401 | `POST .../webhook` | ลายเซ็นไม่ตรง — payload อาจถูกปลอม |
| `unauthorized` | 401 | `connect`, `callback` | ไม่มี NextAuth session |
| `forbidden` (hub handshake) | 403 | `GET .../webhook` | `hub.verify_token` ไม่ตรง |
| `WINDOW_CLOSED` | 409 | `POST .../messages` (เธรดช่องทางนอก) | เกิน 24h นับจากข้อความล่าสุดของลูกค้า |
| `NOT_EXTERNAL_CHANNEL` | 400 | `POST .../messages` | defense — conversation ไม่ใช่ช่องทางนอกจริง |
| ชนิดข้อความไม่รองรับ | 400 | `POST .../messages` (เธรดช่องทางนอก) | `type != "TEXT"` บนเธรดช่องทางนอก |
| `SEND_FAILED:*` | 502 | `POST .../messages` (เธรดช่องทางนอก) | Graph API ปฏิเสธการส่ง (ลูกค้าบล็อก/token ตาย/เหตุอื่น) |
| `FORBIDDEN` (ownership) | 403 | `POST .../messages` (เดิม, สืบทอด) | ไม่ใช่เจ้าของร้าน |
| `CONVERSATION_NOT_FOUND` | 404 | `POST .../messages` (เดิม, สืบทอด) | ไม่พบ conversation |

---

## 6. Sequence (flow ซับซ้อน — ดู [[SDS]] §4 สำหรับ diagram ครบ)

flow ของ webhook ingest และ outbound send ถูกวาดครบแล้วใน [[SDS]] §4.1/4.2 (Mermaid sequenceDiagram) — ไม่วาดซ้ำที่นี่เพื่อกัน drift ระหว่าง 2 เอกสาร

---

## 7. Traceability

| Endpoint | SDS Component / Decision | BRD FR |
|----------|--------------------------|--------|
| `GET/POST /api/channels/facebook/webhook` | Component `signature.ts`/`webhook-types.ts`, Flow 4.1 | FR-FBC-01/02/03 |
| `GET /api/channels/facebook/connect` | Flow (SDS §2.1) | FR-FBC-09 |
| `GET /api/channels/facebook/callback` | Component `shop-channel.service.ts`, TD-005 | FR-FBC-09/10 |
| `POST /api/chat/conversations/[id]/messages` (branch ใหม่) | Flow 4.2, TD-003 | FR-FBC-04/05/06 |
| (ยังไม่มี) list/disconnect channel | TD-005 | FR-FBC-11 |

---

## 8. สรุป (Summary)

เอกสาร API Contract นี้กำหนดสัญญาของ 4 endpoint ที่มีอยู่จริงในโค้ด (webhook ×2 methods, connect, callback) บวกกับ error mapping ใหม่ 3 แบบที่เพิ่มเข้า endpoint เดิม (`WINDOW_CLOSED` → 409, `NOT_EXTERNAL_CHANNEL` → 400, `SEND_FAILED` → 502) — ทุก endpoint trace กลับ [[SDS]] และ [[SRS]] ได้ครบ

**Open Questions:**
- FR-FBC-11 (จัดการ/ถอด Page) ยังไม่มี route ให้เรียก — ต้องออกแบบ contract ใหม่เมื่อเริ่มแผน UI (list response shape ควรอิง `ChannelView` ที่ `shop-channel.service.ts` มีอยู่แล้ว: `{id, provider, externalId, name, avatarUrl, status}`)
- ส่งรูปภาพออกช่องทางนอก (FR-FBC-04 ฝั่งรูป) ยังไม่มี contract — ต้องตัดสินใจว่าจะ reuse `imageUrl` (fileId) เดิมหรือให้ Graph API ต้องการ URL สาธารณะ (ต่างจาก TEXT ที่ไม่มีความซับซ้อนนี้)

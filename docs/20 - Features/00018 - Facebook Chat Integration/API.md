---
title: "API Contract — Facebook Chat Integration"
owner: shinobu22
status: draft
module: M00018-FacebookChatIntegration
version: "1.2"
created: 2026-07-22
tags: [feature, chat, messaging, facebook, instagram, seller, integration, api]
related: ["[[SRS]]", "[[SDS]]", "[[DATABASE]]", "[[EXTENSIONS-2026-07-25]]"]
---

> **โมดูล:** M00018-FacebookChatIntegration
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.2
> **วันที่จัดทำ:** 2026-07-22
> **สถานะ:** Draft — เอกสารตรงกับ route ที่มีอยู่จริงในโค้ดเท่านั้น ไม่มี endpoint ใดใน PRD/BRD ที่ยังไม่มี route จริง (เช่น list/disconnect channel) ถูกรวมไว้ที่นี่
>
> 🔄 **v1.2 (2026-07-25) — doc-sync ตามของจริงบน prod (Phase 2/3 extensions):** เพิ่ม `GET/POST /api/chat/groups`,
> `PATCH/DELETE /api/chat/groups/[id]`, `PATCH /api/chat/conversations/[id]` (pin/unpin/hide/unhide/resolve/
> reopen/spam/unspam/set-group — เดิมไม่เคยมีใน API.md เลยแม้ implement แล้วตั้งแต่ 2026-07-23), `GET /api/chat/conversations/[id]/orders`
> (lazy-load ประวัติออเดอร์ลูกค้าในแชท), query filter ใหม่ของ `GET /api/chat/conversations` (`chatGroupId`,
> `readState`, `spam`), และ webhook event type ใหม่ที่รับจริง (`message_reads`, `message_reactions`,
> `messaging_referrals`/`message.referral`, `message.reply_to`, `message.is_deleted`) — รายละเอียด
> requirement/business rule เต็มอยู่ที่ [[EXTENSIONS-2026-07-25]] (E1, E5-E9)
>
> 🔄 **v1.1 (2026-07-23) — doc-sync ตามของจริงบน prod:** เพิ่ม FR-FBC-15/16/17 (ข้อความสำเร็จรูป, AI ช่วยร่างคำตอบ, เครื่องมือ composer + ไฟล์แนบวิดีโอ/เสียง/ไฟล์), BR-FBC-23..27, TFR-FBC-12..14, table `QuickMessage` + คอลัมน์ CRM, endpoint quick-messages/ai-suggest/crm และปรับสถานะรายการที่ implement ไปแล้ว (S-7/S-8/หน้า channels). **โค้ดขึ้น prod ก่อนเอกสาร = หนี้ Hard Rule 11 ที่ back-fill ในรอบนี้**
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: Facebook Chat Integration

---

## 1. Overview

API ชุดนี้แบ่งเป็น 2 กลุ่ม: (1) endpoint ใหม่ทั้งหมดที่ `/api/channels/facebook/**` สำหรับ webhook + OAuth เชื่อม Page และ (2) การแก้เพิ่มของ endpoint เดิม `POST /api/chat/conversations/[id]/messages` (feature 00011) ให้ dispatch ไปทาง Graph API เมื่อเธรดไม่ใช่ `channel="DEEP"`

**Provider:** Next.js 16 App Router Route Handlers (nodejs runtime)
**ผู้บริโภค:** Meta (webhook, server-to-server), seller session (OAuth connect/callback — **มีปุ่มใน `/seller/settings/channels` แล้วตั้งแต่ 2026-07-23**; **2026-07-24 เพิ่มหน้าเลือกเพจ `/settings/channels/select` คั่นก่อนเชื่อม** — เรียก `GET /pages` + `POST /confirm`), client ของหน้าแชท `/inbox*` (เธรดช่องทางนอกมี UI เต็ม: badge ช่องทาง, แบนเนอร์ 24h, ตัวกรอง, แผงข้อมูลลูกค้า, เครื่องมือ composer)
**Base URL:** `https://deepthailand.app` (buyer/webhook endpoint อยู่ domain หลัก ไม่ใช่ `seller.*`) — dev: `https://deepth.local:4000` (webhook ต้องผ่าน ngrok หรือยิงตรงด้วย `scripts/fake-fb-webhook.ts`)
**ต้นทาง:** [[SDS]] §3-4; schema → [[DATABASE]]

---

## 2. Authentication

| Endpoint | วิธี Auth | หมายเหตุ |
|---|---|---|
| `GET/POST /api/channels/facebook/webhook` | **ไม่มี NextAuth session** — `GET`: เทียบ `hub.verify_token` กับ env `FB_WEBHOOK_VERIFY_TOKEN`; `POST`: HMAC-SHA256 `X-Hub-Signature-256` timing-safe compare (env `FB_CHAT_APP_SECRET`) | ยกเว้นจาก CSRF Origin-check ของ `guardApi` (`src/proxy.ts`) เพราะ Meta ไม่ส่ง header `Origin` — **ยัง apply rate-limit ปกติ** |
| `GET /api/channels/facebook/connect` | NextAuth session (`getServerSession`) — ต้อง login เป็น seller | ไม่มี session → `401` |
| `GET /api/channels/facebook/callback` | NextAuth session + OAuth `state` cookie (`fb_channel_oauth_state`, httpOnly) ต้องตรงกับ query param `state` | ป้องกัน CSRF ของ OAuth flow เอง — แยกจาก `guardApi` |
| `GET /api/channels/facebook/pages` (ใหม่ 2026-07-24) | NextAuth session + cookie `fb_channel_user_token` (user access token ที่เข้ารหัสไว้ตอน callback) | ไม่มี cookie/หมดอายุ → `410 session_expired` |
| `POST /api/channels/facebook/confirm` (ใหม่ 2026-07-24) | NextAuth session + cookie `fb_channel_user_token` | โดน CSRF Origin-check ของ `guardApi` ตามปกติ (mutation); ไม่มี cookie → `410` |
| `POST /api/chat/conversations/[id]/messages` (ส่วนที่แก้เพิ่ม) | เหมือนเดิม (feature 00011) — NextAuth session + ownership check ที่ service | ดู [[../00011 - Deep Chat/API]] สำหรับ contract เดิมของ endpoint นี้ |
| `PATCH /api/chat/conversations/[id]`, `GET/POST /api/chat/groups`, `PATCH/DELETE /api/chat/groups/[id]`, `GET /api/chat/conversations/[id]/orders` | NextAuth session + `resolveActiveShopContext` (re-verify membership เสมอ) | ownership atomic ที่ `WHERE {id, shopId}` ใน `updateMany`/`deleteMany` (ไม่ query แยกก่อน — กัน IDOR/TOCTOU); `Cache-Control: private, no-store` ทุก response |

ไม่มี auth mechanism ใหม่ (ไม่มี Bearer token/API key) — endpoint ใหม่ทั้งหมดใช้ NextAuth session (routes ที่ seller เรียก) หรือ signature ของ Meta เอง (webhook)

---

## 3. Endpoint List

| Method | Path | คำอธิบาย | Auth | สถานะ |
|--------|------|----------|------|-------|
| `GET` | `/api/channels/facebook/webhook` | Webhook handshake (subscribe verification) | `hub.verify_token` | ใหม่ |
| `POST` | `/api/channels/facebook/webhook` | รับ event ข้อความจาก Meta | `X-Hub-Signature-256` | ใหม่ |
| `GET` | `/api/channels/facebook/connect` | เริ่ม OAuth เชื่อม Facebook Page (redirect) | seller session | ใหม่ |
| `GET` | `/api/channels/facebook/callback` | รับ code จาก Facebook → **พา user ไปหน้าเลือกเพจ** (ไม่เชื่อมทันที) | seller session + OAuth state | ใหม่ (แก้พฤติกรรม 2026-07-24) |
| `GET` | `/api/channels/facebook/pages` | รายการ Page + สถานะ (ว่าง/เชื่อมร้านนี้/ติดร้านอื่น) ให้หน้าเลือกเพจ | seller session + user-token cookie | ใหม่ 2026-07-24 |
| `POST` | `/api/channels/facebook/confirm` | เชื่อมเฉพาะ Page ที่ user ติ๊กเลือก + ย้ายรายเพจ | seller session + user-token cookie | ใหม่ 2026-07-24 |
| `POST` | `/api/chat/conversations/[id]/messages` | ส่งข้อความ — dispatch ไป Send API เมื่อ `channel != "DEEP"` | participant session | แก้ไข (feature 00011) |
| `GET` | `/api/chat/quick-messages` | list ข้อความสำเร็จรูปของร้านที่ active | seller session | ใหม่ (2026-07-23) |
| `POST` | `/api/chat/quick-messages` | สร้างข้อความสำเร็จรูป | seller session | ใหม่ (2026-07-23) |
| `PATCH` | `/api/chat/quick-messages/[id]` | แก้ข้อความสำเร็จรูป (scope `{id, shopId}`) | seller session | ใหม่ (2026-07-23) |
| `DELETE` | `/api/chat/quick-messages/[id]` | ลบข้อความสำเร็จรูป (scope `{id, shopId}`) | seller session | ใหม่ (2026-07-23) |
| `POST` | `/api/chat/conversations/[id]/ai-suggest` | ขอร่างคำตอบ 3 แบบจาก AI | seller session + ownership เธรด | ใหม่ (2026-07-23) |
| `GET`/`PATCH` | `/api/chat/conversations/[id]/crm` | อ่าน/แก้ ชื่อเรียก·โน้ต·แท็ก·สถานะการขาย·เบอร์ ของผู้ติดต่อ | seller session + ownership เธรด | ใหม่ (2026-07-23) |
| `PATCH` | `/api/chat/conversations/[id]` | pin/unpin/hide/unhide/resolve/reopen/spam/unspam/set-group | seller session + ownership (atomic `updateMany`) | ใหม่ (2026-07-23 — ไม่เคยอยู่ใน API.md มาก่อนแม้ implement แล้ว) |
| `GET` | `/api/chat/conversations/[id]/orders` | ประวัติออเดอร์ของลูกค้าที่ผูกกับเธรดนี้ (lazy load, cursor pagination) | seller session + ownership เธรด | ใหม่ (2026-07-24) |
| `GET` | `/api/chat/groups` | list กลุ่ม/แท็บจัดหมวดแชทของร้าน active | seller session | ใหม่ (2026-07-23) |
| `POST` | `/api/chat/groups` | สร้างกลุ่มใหม่ `{name}` | seller session | ใหม่ (2026-07-23) |
| `PATCH` | `/api/chat/groups/[id]` | เปลี่ยนชื่อกลุ่ม (scope `{id, shopId}`) | seller session | ใหม่ (2026-07-23) |
| `DELETE` | `/api/chat/groups/[id]` | ลบกลุ่ม (เธรดในกลุ่ม → `chatGroupId=null` อัตโนมัติ) | seller session | ใหม่ (2026-07-23) |

**ยังไม่มี route (documented เป็น gap ชัดเจน — ห้ามถือว่ามีจริง):**

| Method ที่ควรมี | Path ที่ควรมี | FR ที่รองรับ | เหตุผลที่ยังไม่มี |
|---|---|---|---|
| ~~`GET` list ช่องทาง~~ | ~~`/api/channels/facebook`~~ | FR-FBC-11 | **มีแล้ว (2026-07-23):** `GET /api/channels` + หน้า `/seller/settings/channels` |
| ~~`DELETE`/`PATCH` disconnect~~ | ~~—~~ | FR-FBC-11 | **มีแล้ว (2026-07-23):** `/api/channels/[id]` + `disconnectChannel()` (soft — ตั้ง `status='DISCONNECTED'`) |
| ~~สร้างออเดอร์จาก prefill เธรด FB~~ | ~~—~~ | FR-FBC-07 | **มีแล้ว (2026-07-24):** สร้างออเดอร์จากโมดัลในแชท reuse POS/`CreateOrderSchema` (`conversationId` optional field) |
| ~~ผูก `ExternalContact.customerId`~~ | ~~—~~ | FR-FBC-08 | **มีแล้ว (2026-07-24):** `createOrder({conversationId})` ผูก atomically ในทรานแซกชันเดียวกับสร้างออเดอร์ ([[EXTENSIONS-2026-07-25]] E3) |
| — | ส่ง วิดีโอ/เสียง/ไฟล์/ตอบทับ/react ออกไป Messenger/IG | FR-FBC-17, E7, E9 | ขาเข้ารองรับครบแล้ว; **TEXT/IMAGE ส่งออกได้แล้ว** (`sendOutboundMessage` รองรับ `imageFileId`) แต่ `POST .../messages` ยังปฏิเสธ `type=PRODUCT` บนเธรดช่องทางนอก และ `sendOutboundMessage` ไม่มี parameter ให้ส่ง VIDEO/AUDIO/FILE/reply/reaction ออก (inbound-only เฉพาะกลุ่มนี้) |

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
| Body | `entry[].messaging[].message.attachments[].type` | `string` | no | ทุกชนิดที่ Meta ส่ง — `image`/`sticker`→IMAGE, `video`/`reel`/`ig_reel`→VIDEO, `audio`→AUDIO, `file`→FILE, `location`→ข้อความลิงก์ Google Maps, `fallback`/`post`/`ig_post`→ข้อความลิงก์, `template`→ข้อความสรุปที่ประกอบจาก payload, `story_mention`→IMAGE (best-effort) (ดู [[EXTENSIONS-2026-07-25]] E2) |
| Body | `entry[].messaging[].message.attachments[].payload.url` / `.title` / `.template_type` / `.text` / `.summary` / `.elements[]` / `.coordinates` | mixed | no | URL/เนื้อหาของ attachment (รูป/template/location) — parse เต็มโดย `AttachmentPayloadSchema` (ดู [[EXTENSIONS-2026-07-25]] E2.5) |
| Body | `entry[].messaging[].message.reply_to.mid` | `string` | no | mid ของข้อความที่ "ตอบทับ" (E9) |
| Body | `entry[].messaging[].message.is_deleted` | `boolean` | no | `true` = ผู้ส่ง unsend ข้อความ (mid นี้) (E9) |
| Body | `entry[].messaging[].message.referral` / `entry[].messaging[].referral` | `object` | no | `{ref, source, type, ad_id, ads_context_data{ad_title}}` — ลูกค้าคลิกโฆษณา/ลิงก์แล้วทัก (E8) |
| Body | `entry[].messaging[].read.watermark` | `number` | no | `message_reads` — ลูกค้าอ่านข้อความของเพจถึง timestamp นี้ (E6) |
| Body | `entry[].messaging[].reaction.{mid,action,emoji,reaction}` | mixed | no | `message_reactions` — `action`: `"react"`\|`"unreact"`, `emoji` = Unicode จริง (E7) |

**Valibot:** `WebhookBodySchema` (`src/lib/facebook/webhook-types.ts`)

**Event dispatch (route แยกตาม field ที่มาก่อน):** `event.read` → `ingestReadEvent` (E6) · `event.reaction` →
`ingestReactionEvent` (E7) · อื่น ๆ (มี `event.message`) → `ingestInboundMessage` (ครอบคลุมทั้งข้อความปกติ,
`is_deleted`=unsend ที่เช็คก่อนสุดแล้ว `return` ทันทีไม่ insert ข้อความใหม่, และ `reply_to`/`referral` ที่แนบมากับข้อความปกติ)

**Response — Success (200)**

```json
{ "ok": true }
```

คืน `200 {ok:true}` แม้ signature ผ่านแต่ payload parse ไม่ผ่าน (shape ไม่รู้จัก) หรือ event เป็น `NO_CHANNEL`/`DUPLICATE`/`IGNORED` — **เจตนา** กัน Meta ยิง retry ไม่จบ

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | `X-Hub-Signature-256` ไม่ผ่านการ verify | `{ "error": "invalid signature" }` |

**Side-effects (ต่อ 1 messaging event ที่ประมวลผลสำเร็จ):**
- **ข้อความปกติ:** upsert `ExternalContact`, get-or-create `Conversation` (เซ็ต `referralSource`/`referralAdTitle` ถ้ามี — เฉพาะตอนสร้างเธรดใหม่, E8), insert `ChatMessage` (แนบ `replyToMid` ถ้ามี, E9) + `ChatMessage` เพิ่มต่อรูปถ้ามีหลายรูปในข้อความเดียว (E2.5), update `Conversation` snapshot (`lastMessageAt`/`lastMessagePreview`/`lastSenderRole` + `lastInboundAt` ถ้าไม่ใช่ echo — เธรดสแปมอัปเดต `lastMessageAt`/`lastInboundAt` แต่ไม่รีเซ็ต `isHidden`/`resolvedAt`), insert `Notification` (เฉพาะไม่ใช่ echo **และไม่ใช่เธรดสแปม**) — ทั้งหมดใน `$transaction` เดียว
- **`message.is_deleted=true` (unsend, E9):** `updateMany` บนแถวเดิม (`isDeleted=true`, ล้าง `body`/`imageUrl`/`reactionEmoji`) แล้ว return ทันที — ไม่เข้า flow ข้อความปกติด้านบน
- **`event.read` (E6):** `updateMany` บน `Conversation.externalReadAt` เฉพาะเมื่อ watermark ใหม่กว่าเดิม — ไม่มี `ChatMessage`/`Notification` ใหม่
- **`event.reaction` (E7):** `updateMany` บน `ChatMessage.reactionEmoji` (scope ด้วย `externalMessageId` + `shopChannelId`) — ไม่มี `ChatMessage`/`Notification` ใหม่

หลาย event ใน batch เดียวกันคนละ transaction — event หนึ่งพังไม่กระทบ event อื่น

**Idempotency:** unique constraint บน `ChatMessage.externalMessageId` — event ที่มี `mid` ซ้ำ (Meta redeliver หรือ echo ของข้อความที่เราส่งเอง) จะ `P2002` แล้วถูก catch เป็น `DUPLICATE` (ไม่สร้างแถวซ้ำ, ไม่ throw ให้ webhook fail) — หลายรูปในข้อความเดียว ต่อท้าย `externalMessageId` ด้วย `#{i}` (เช่น `mid#1`) กันชน unique ของรูปแรก

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

### 4.4 `GET /api/channels/facebook/callback` (ใหม่ — แก้พฤติกรรม 2026-07-24)

รับ `code` จาก Facebook หลัง user อนุมัติ → แลก long-lived user token → **ไม่เชื่อม Page ทันทีอีกต่อไป** แต่เก็บ user token (เข้ารหัส) ไว้ใน cookie แล้วพา user ไปหน้าเลือกเพจ Trace: SRS TFR-FBC-07/08 → BRD BR-FBC-01/02/04/20

> **เหตุที่แก้ (2026-07-24):** ของเดิมเชื่อม "ทุก Page ที่มีสิทธิ์" เข้าร้านที่ active ทันที — บั๊กเชิงพฤติกรรม: admin มักดูแลเพจของตัวเองหลายเพจ พอเข้ามาเชื่อมเพจของร้าน เพจส่วนตัวที่เหลือถูกลากเข้าร้านนั้นทั้งหมด (subscribe webhook + ข้อความไหลเข้า inbox ที่พนักงานคนอื่นเห็น) การเลือกเพจ + การยืนยันย้ายจึงถูกยกไปทำที่หน้า `/settings/channels/select` (§4.4a/4.4b)

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Query | `code` | `string` | yes (ถ้าไม่ error) | authorization code จาก Facebook |
| Query | `state` | `string` | yes | ต้องตรงกับ cookie `fb_channel_oauth_state` |
| Query | `error` | `string` | no | มีค่าเมื่อ user กด "ยกเลิก" ที่หน้า Facebook |

**Response — Success**

`302 Redirect` ไป `/settings/channels/select` พร้อม `Set-Cookie: fb_channel_user_token=<AES-256-GCM ciphertext>` (httpOnly, `secure` prod, `sameSite=lax`, `path=/api/channels/facebook`, `maxAge=600`) — cookie `fb_channel_oauth_state` ถูกลบ. **ยังไม่แตะ DB / ไม่ subscribe อะไร**

**Response — Error (ทั้งหมด redirect กลับ ไม่ throw HTTP error code ยกเว้น 401)**

| Status | เงื่อนไข | redirect query |
|--------|----------|-----------------|
| 401 | ไม่มี session | (ไม่ redirect — คืน `{error:"unauthorized"}` ตรง ๆ) |
| 302 | user กด "ยกเลิก" (`?error=`) | `status=cancelled` |
| 302 | `state` ไม่ตรงกับ cookie | `status=state_mismatch` |
| 302 | ไม่มี `code` | `status=no_code` |
| 302 | resolve active shop ไม่ได้ (ร้านถูกลบ/หลุดสิทธิ์) | `status=no_shop` |
| 302 | ไม่มี Page ที่ผ่านเงื่อนไขสิทธิ์ `MESSAGING`+`MODERATE` เลย | `status=no_eligible_page` |
| 302 | exception ระหว่าง exchange token / list pages (network, Graph API error) | `status=error` (log เฉพาะ `message`, **ไม่ log token**) |

**Side-effects:** ไม่มีการเขียน DB — เก็บแค่ user token ใน cookie เข้ารหัส (`src/lib/facebook/pending-connect.ts`) อายุ 10 นาที

---

### 4.4a `GET /api/channels/facebook/pages` (ใหม่ 2026-07-24)

รายการ Page ที่ user จัดการได้ + สถานะเทียบกับร้านที่กำลังเชื่อม — ให้หน้า `/settings/channels/select` แสดง Trace: SRS TFR-FBC-07 → BRD BR-FBC-02/20

**Request** — ไม่มี body/param; อ่าน NextAuth session + cookie `fb_channel_user_token`

**Response — Success** `200` (header `cache-control: private, no-store` — ผูกกับ user+ร้าน ห้าม shared cache)

```json
{
  "shopName": "ร้านธนภัทร",
  "pages": [
    { "id": "1029...", "name": "เพจร้าน", "avatarUrl": "https://graph.facebook.com/1029.../picture?type=large",
      "hasInstagram": true, "state": "available", "occupiedBy": null },
    { "id": "2288...", "name": "เพจส่วนตัว", "avatarUrl": "...",
      "hasInstagram": false, "state": "other-shop", "occupiedBy": "ร้านอื่น" }
  ]
}
```

`state` = `available` (ว่าง) | `connected-here` (เชื่อมกับร้านนี้อยู่แล้ว) | `other-shop` (ติดร้านอื่น — `occupiedBy` = ชื่อร้าน). คำนวณจาก `describePageStates()` (นับเฉพาะแถว `status <> DISCONNECTED`, ระดับ Page). **ไม่คืน access token**

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 400 | resolve active shop ไม่ได้ | `{ "error": "no_shop" }` |
| 410 | ไม่มี cookie `fb_channel_user_token` / หมดอายุ / ถอดรหัสไม่ผ่าน | `{ "error": "session_expired" }` |
| 502 | Graph API error | `{ "error": "graph_error" }` |

---

### 4.4b `POST /api/channels/facebook/confirm` (ใหม่ 2026-07-24)

เชื่อมเฉพาะ Page ที่ user ติ๊กเลือก + ย้ายเพจข้ามร้าน "รายเพจ" Trace: SRS TFR-FBC-07/08 → BRD BR-FBC-01/02/04/20

**Request** — `Content-Type: application/json` (Valibot `ConfirmChannelPagesSchema`)

| ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|-------|------|--------|----------|
| `pageIds` | `string[]` | yes | Page ที่เลือก (1–50 ตัว, แต่ละตัว string 1–64 อักขระ) |
| `forceIds` | `string[]` | no | subset ของ `pageIds` ที่ user ยืนยัน "ย้ายข้ามร้าน" (ตัดร้านเดิมออก) |

**Authorization:** re-verify กับ Meta ทุกครั้ง — ดึงรายการ Page ใหม่จาก user token แล้วรับเฉพาะ id ที่อยู่ในรายการนั้น (`listManageablePages`); id ที่ยัดมาเองเกินสิทธิ์ถูกทิ้งเงียบ. `forceIds` ถูกกรองให้เป็น subset ของที่เลือกจริงอีกชั้น (กัน IDOR)

**Response — Success** `200`

```json
{ "connected": 2, "skipped": [{ "pageName": "เพจส่วนตัว", "occupiedBy": "ร้านอื่น" }], "subscribeFailed": [] }
```

`skipped` = เพจติดร้านอื่นที่ user ไม่ได้ยืนยันย้าย; `subscribeFailed` = เพจที่เชื่อมสำเร็จแต่ subscribe webhook ล้มเหลว. cookie `fb_channel_user_token` ถูกลบทันทีหลังยืนยัน (กดซ้ำต้องเริ่ม OAuth ใหม่)

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 400 | resolve active shop ไม่ได้ / body ไม่ผ่าน schema / ไม่พบเพจที่เลือกในรายการ Meta | `{ "error": "<ข้อความ>" }` |
| 410 | cookie token หมดอายุ | `{ "error": "session_expired" }` |
| 502 | Graph API error | `{ "error": "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่" }` |

**Side-effects:** `connectPages(shopId, userId, selected, { forceIds })` — สร้าง/reactivate `ShopChannel` (MESSENGER + INSTAGRAM ถ้ามี IG) เฉพาะเพจที่เลือก, `forceIds` ตัดแถว active ของร้านเดิม (soft — `DISCONNECTED` เก็บประวัติ) เป็น**รายเพจ**, เรียก `subscribePageToApp` ทุกเพจที่ผ่าน, token เข้ารหัสก่อนเก็บเสมอ

---

### 4.5 `POST /api/chat/conversations/[id]/messages` (แก้เพิ่มจาก feature 00011)

Contract เดิม (`type`, `body`, `imageUrl`, `productRefId`, response shape, error 400/401/403/404/429) **ไม่เปลี่ยน** — ดู [[../00011 - Deep Chat/API]] §4.4 สำหรับ contract เต็มของเธรด `channel="DEEP"` ส่วนนี้ document **เฉพาะ branch ใหม่** ที่เพิ่มเมื่อ `conversation.channel != "DEEP"` Trace: SRS TFR-FBC-09/10 → BRD BR-FBC-05/11/12

**Request:** เหมือนเดิมทุกประการ (`{type: "TEXT"|"IMAGE"|"PRODUCT"|"ORDER", body?, imageUrl?, productRefId?, orderRefToken?}`)

> 🔄 **แก้ไข 2026-07-25 — พฤติกรรมจริงกว้างกว่าที่ v1.1 เคยบันทึกไว้:** v1.1 เขียนว่าเธรดช่องทางนอก "รองรับเฉพาะ `type=TEXT`" — **ไม่ตรงกับโค้ดจริง** ตอนนี้ `sendOutboundMessage` (`channel-chat.service.ts`) รับ `imageFileId` และเรียก `sendImageMessage` (Graph API) ได้แล้ว route จึงส่ง **TEXT และ IMAGE** ออกช่องทางนอกได้ทั้งคู่ เหลือแค่ `PRODUCT` ที่ยังบล็อก (การ์ดสินค้ายังไม่มี representation ฝั่ง Meta) ส่วน `ORDER` มี branch พิเศษ (ดูด้านล่าง)

**Behavior เพิ่มเติม (เฉพาะเธรดช่องทางนอก, `conversation.channel != "DEEP"`):**
1. Route query `conversation.channel`/`shopId` ก่อนตัดสินใจ branch
2. `type === "PRODUCT"` → คืน `400` ทันที (`"ช่องทางนี้ยังไม่รองรับการ์ดสินค้า"` — การ์ดสินค้ายังไม่มี representation ที่ส่งออกไป Meta ได้)
3. `type === "ORDER"` → verify `Order.publicToken` เป็นของร้านนี้จริง (`prisma.order.findFirst({publicToken, shopId})`, ไม่พบ → `400`) แล้วประกอบข้อความลิงก์ (`คำสั่งซื้อ: {ชื่อสินค้ารายการแรก}\nยอดสุทธิ ฿{totalAmount}\n{buyerBaseUrl}/o/{token}`) → เรียก `sendOutboundMessage({text: linkText, orderRefToken})` — **ลูกค้าได้ข้อความลิงก์ (Meta ไม่ render การ์ด)** แต่ฝั่งเราเก็บเป็น `type=ORDER` ให้ seller เห็นเป็นการ์ดในเธรดของตัวเอง (ดู [[EXTENSIONS-2026-07-25]] E1 BR-ORD-01)
4. `type === "TEXT"` หรือ `"IMAGE"` → เรียก `sendOutboundMessage({text, imageFileId})` แทน `sendMessage()` เดิม (IMAGE: `imageFileId = imageUrl` ที่ผ่าน validate นามสกุลแล้วจากขั้นตอนก่อนหน้า; caption ส่งเป็นข้อความ echo แยกตามหลัง — ไม่ได้อยู่ใน response เดียวกัน)

**Response — Success (200):** เหมือนเดิม (`ChatMessage` object)

**Response — Error (เพิ่มใหม่จาก branch นี้เท่านั้น):**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `channel != "DEEP"` และ `type === "PRODUCT"` | `{ "error": "ช่องทางนี้ยังไม่รองรับการ์ดสินค้า" }` |
| 400 | `channel != "DEEP"` และ `type === "ORDER"` แต่ `orderRefToken` ไม่ใช่ของร้านนี้ | `{ "error": "ไม่พบคำสั่งซื้อนี้ในร้าน" }` |
| 400 | service throw `NOT_EXTERNAL_CHANNEL` (defense — ไม่ควรเกิดถ้า route query ถูกต้อง) | `{ "error": "ช่องทางของบทสนทนานี้ไม่ถูกต้อง" }` |
| 409 | service throw `WINDOW_CLOSED` (เกิน 24 ชม. นับจากข้อความล่าสุดของลูกค้า) | `{ "error": "เกิน 24 ชั่วโมงนับจากข้อความล่าสุดของลูกค้า — ส่งข้อความไม่ได้จนกว่าลูกค้าจะทักมาใหม่" }` |
| 409 | service throw `CHANNEL_NOT_ACTIVE` (token ตาย/ถอดการเชื่อมต่อ) | `{ "error": "การเชื่อมต่อกับช่องทางนี้หมดอายุ กรุณาเชื่อม Facebook Page ใหม่อีกครั้ง" }` |
| 502 | service throw `SEND_FAILED:*` (Graph API ปฏิเสธ — token ตาย, ลูกค้าบล็อกร้าน, เหตุอื่น) | `{ "error": "ส่งข้อความไปยังช่องทางภายนอกไม่สำเร็จ กรุณาลองใหม่" }` |

Error 401/403/404/429/500 เดิมของ endpoint นี้ (unauthorized, forbidden, conversation not found, rate-limit, generic) **ยังใช้ mapping เดิมทุกประการ** — ไม่มีการเปลี่ยนแปลง

---

### 4.6 `GET /api/chat/quick-messages` (ใหม่ 2026-07-23)

list ข้อความสำเร็จรูปทั้งหมดของ **ร้านที่ active** Trace: SRS TFR-FBC-12 → BRD BR-FBC-23 → PRD FR-FBC-15

**Request:** ไม่มี query/body — ร้านมาจาก session (`resolveActiveShopContext`) ไม่ใช่จาก client

**Response — Success (200)**

```json
{ "items": [
  { "id": "uuid", "title": "รีวิวลูกค้าเก่า", "category": null,
    "body": "ตัวนี้ใช้ดีมากค่ะ …", "imageFileId": "abc123", "createdAt": "2026-07-23T08:00:00.000Z" }
] }
```

เรียง `category` ขึ้น แล้ว `createdAt` ใหม่→เก่าในแต่ละหมวด; `imageFileId` ใช้ต่อกับ `GET /api/files/{fileId}` เพื่อแสดงรูป

**Response — Error:** `401` ไม่มี session · `404` `{"error": "ไม่พบร้านที่กำลังใช้งาน"}` (resolve ร้าน active ไม่ได้)

---

### 4.7 `POST /api/chat/quick-messages` (ใหม่ 2026-07-23)

**Request Body** (Valibot `QuickMessageCreateSchema`)

| ฟิลด์ | ชนิด | บังคับ | กติกา |
|-------|------|--------|------|
| `title` | `string` | yes | trim แล้ว 1–80 ตัวอักษร |
| `category` | `string \| null` | no | trim, ≤40 |
| `body` | `string` | no (default `""`) | ≤2000 |
| `imageFileId` | `string \| null` | no | ≤200 (storage fileId ที่อัปโหลดไว้แล้ว) |

**เงื่อนไขข้ามฟิลด์:** ต้องมี `body` ที่ไม่ว่าง **หรือ** `imageFileId` อย่างน้อยหนึ่งอย่าง (BR-FBC-24)

**Response — Success (201):** object เดียวรูปแบบเดียวกับ item ใน §4.6

**Response — Error:** `400` body ไม่ใช่ JSON / validation ไม่ผ่าน (คืนข้อความ issue แรกเป็นภาษาไทย เช่น `{"error": "ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง"}`) · `401` · `404` ไม่พบร้าน active

---

### 4.8 `PATCH` / `DELETE /api/chat/quick-messages/[id]` (ใหม่ 2026-07-23)

`PATCH` รับ body ชุดเดียวกับ §4.7 (แทนที่ทั้งรายการ ไม่ใช่ partial) · `DELETE` ไม่มี body

**Ownership:** service ใช้ `updateMany`/`deleteMany` ที่มี `where: { id, shopId }` แล้วเช็ค `count === 0` — ร้านอื่นยิงด้วย `id` ที่ถูกต้องก็ได้ `404` เท่านั้น ไม่มีทางแก้/ลบข้ามร้าน และไม่ leak ว่ารายการนั้นมีอยู่จริง (BR-FBC-23)

**Response:** `200` (PATCH — object ที่อัปเดตแล้ว) / `200` (DELETE — `{"ok": true}`) · `400` validation · `401` · `404` ไม่พบร้าน active หรือไม่พบรายการในร้านนี้

---

### 4.9 `POST /api/chat/conversations/[id]/ai-suggest` (ใหม่ 2026-07-23)

ขอร่างคำตอบ 3 แบบสำหรับเธรดนั้น Trace: SRS TFR-FBC-13 → BRD BR-FBC-25/26/27 → PRD FR-FBC-16

**Request:** ไม่มี body — **transcript อ่านจาก DB ฝั่งเซิร์ฟเวอร์เท่านั้น** (client ส่งบทสนทนาเข้ามาเองไม่ได้ตาม BR-FBC-27)

**ลำดับการตรวจ:** session → rate-limit ต่อ user (15 ครั้ง/นาที) → resolve ร้าน active → `id` ต้องเป็น UUID → เธรดต้องเป็นของร้านนั้น

**Response — Success (200)**

```json
{ "suggestions": ["ร่างที่ 1 …", "ร่างที่ 2 …", "ร่างที่ 3 …"] }
```

header: `Cache-Control: private, no-store, max-age=0, must-revalidate` (คำตอบเป็นข้อมูลต่อผู้ใช้ — ห้าม cache ร่วม; บทเรียนเดิม `feedback_auth_api_cache_control`)

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `id` ไม่ใช่ UUID | `{ "error": "รหัสบทสนทนาไม่ถูกต้อง" }` |
| 400 | เธรดยังไม่มีข้อความให้ร่าง | `{ "error": "ยังไม่มีข้อความให้ AI ช่วยร่าง" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | resolve ร้าน active ไม่ได้ / เธรดไม่ใช่ของร้านนี้ | `{ "error": "ไม่พบบทสนทนานี้" }` |
| 429 | เกิน 15 ครั้ง/นาที ต่อผู้ใช้ | `{ "error": "ใช้ AI ถี่เกินไป กรุณารอสักครู่" }` + header `Retry-After: 60` |
| 502 | Gemini ตอบผิดพลาด/parse ไม่ได้ | `{ "error": "AI ไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง", "detail": "…" }` |
| 503 | ไม่ได้ตั้ง `GEMINI_API_KEY` | `{ "error": "ระบบ AI ยังไม่พร้อมใช้งาน (ยังไม่ตั้งค่า)" }` |

> `detail` ใน 502 เป็นข้อความ error จาก Gemini เพื่อ diagnose — ไม่มี secret ปนแต่ **เป็นข้อมูลเชิงระบบ**
> ควรตัดออกเมื่อฟีเจอร์นิ่งแล้ว

---

### 4.10 `GET` / `PATCH /api/chat/conversations/[id]/crm` (ใหม่ 2026-07-23)

อ่าน/แก้ข้อมูลภายในของผู้ติดต่อในเธรด (FR-FBC-14) — `alias` เก็บที่ `Conversation`, ที่เหลือ (`note`/`address`/`salesStatus`/`tags`/`phones`) เก็บที่ `ExternalContact` ดู [[DATABASE]] §3.6

`PATCH` เป็น **partial** ตาม `ChatCrmPatchSchema` — ฟิลด์ที่ไม่ส่งมา = ไม่แตะ; ownership scope ด้วย `{conversationId, shopId}` เหมือน endpoint อื่นของเธรด

> 🛑 ข้อมูลชุดนี้เป็น **ข้อมูลภายในร้าน** — ห้ามมี code path ใดส่งออกไปหาลูกค้าผ่าน Send API (BR-FBC-18)

---

### 4.11 `PATCH /api/chat/conversations/[id]` (ใหม่ 2026-07-23 — ไม่เคยอยู่ใน API.md มาก่อน)

ปักหมุด/ซ่อน/ปิดงาน/สแปม/ย้ายกลุ่ม เธรดแชท (S-7 + E5, [[EXTENSIONS-2026-07-25]]) Trace: DATABASE §3.3 → chat.service.ts `updateConversationState`/`setConversationGroup`

**Request Body** (Valibot `ConversationPatchSchema`)

| ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|-------|------|--------|----------|
| `action` | `"pin"\|"unpin"\|"hide"\|"unhide"\|"resolve"\|"reopen"\|"spam"\|"unspam"\|"set-group"` | yes | การกระทำ |
| `chatGroupId` | `string (uuid) \| null` | เฉพาะ `action="set-group"` | `string` = ย้ายเข้ากลุ่มนั้น, `null`/omit = เอาออก (กลับแท็บ "ทั้งหมด") |

**Ownership:** `updateConversationState`/`setConversationGroup` ใช้ `updateMany({where:{id, shopId}})` atomic — ไม่ query แยกก่อน (กัน TOCTOU/IDOR) เหมือน `disconnectChannel`

**Response — Success (200):** `{ "ok": true }` (header `Cache-Control: private, no-store`)

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `id` ไม่ใช่ UUID / body ไม่ผ่าน `ConversationPatchSchema` | `{ "error": "รหัสบทสนทนาไม่ถูกต้อง" }` / `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | resolve ร้าน active ไม่ได้ / เธรดไม่ใช่ของร้านนี้ / `action="set-group"` แล้วกลุ่มไม่ใช่ของร้านนี้ | `{ "error": "ไม่พบร้านที่กำลังใช้งาน" }` / `{ "error": "ไม่พบบทสนทนาหรือกลุ่มนี้" }` |

**Business rules สำคัญ:** `action="spam"` เคลียร์ `isPinned=false` พร้อมกัน; เธรดสแปมไม่ auto-unhide/auto-reopen เมื่อลูกค้าทักใหม่และไม่ส่ง Notification (ต่างจาก hide/resolve ที่ auto-unhide/auto-reopen ปกติ, ดู [[EXTENSIONS-2026-07-25]] E5)

---

### 4.12 `GET/POST /api/chat/groups`, `PATCH/DELETE /api/chat/groups/[id]` (ใหม่ 2026-07-23)

CRUD กลุ่ม/แท็บจัดหมวดแชทระดับร้าน (E5) Trace: DATABASE §3.7 → `chat-group.service.ts`

| Method | Path | Body | Response สำเร็จ |
|---|---|---|---|
| `GET` | `/api/chat/groups` | — | `{ "items": [{id, name, sortOrder}] }` เรียง `sortOrder` |
| `POST` | `/api/chat/groups` | `{ "name": "ร้านอะไหล่" }` (Valibot `ChatGroupCreateSchema`, trim 1–40 ตัวอักษร) | `201` object เดียว |
| `PATCH` | `/api/chat/groups/{id}` | `{ "name": "..." }` (`ChatGroupRenameSchema`) | `200 {ok:true}` |
| `DELETE` | `/api/chat/groups/{id}` | — | `200 {ok:true}` |

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | ชื่อว่าง/ยาวเกิน 40 ตัวอักษร | `{ "error": "ชื่อกลุ่มไม่ถูกต้อง" }` |
| 400 | เกิน 30 กลุ่ม/ร้าน (`POST` เท่านั้น) | `{ "error": "จำนวนกลุ่มถึงขีดจำกัดแล้ว" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | resolve ร้าน active ไม่ได้ (ทุก method) / ไม่พบกลุ่มในร้านนี้ (`PATCH`/`DELETE`) | `{ "error": "ไม่พบร้านที่กำลังใช้งาน" }` / `{ "error": "ไม่พบกลุ่มนี้" }` |
| 409 | ชื่อซ้ำในร้านเดียวกัน (`@@unique[shopId,name]`) | `{ "error": "มีกลุ่มชื่อนี้อยู่แล้ว" }` |

**Side-effects ของ `DELETE`:** เธรดที่เคยอยู่กลุ่มนี้ `chatGroupId` กลับเป็น `null` อัตโนมัติ (FK `ON DELETE SET NULL`) — กลับไปแท็บ "ทั้งหมด" ไม่ต้อง cleanup แยก

---

### 4.13 `GET /api/chat/conversations/[id]/orders` (ใหม่ 2026-07-24)

ประวัติออเดอร์ของลูกค้าที่ผูกกับเธรดนี้ — lazy load (cursor pagination) สำหรับแท็บคำสั่งซื้อในแผงลูกค้าขวา

**Request:** query `cursor` (optional) — ไม่มี body

**ลำดับ resolve customer:**
1. ownership: `conversation.findFirst({id, shopId: activeCtx.shopId})` — ไม่พบ → `404`
2. เธรดช่องทางนอก (`channel != "DEEP"`) → `customerId` จาก `externalContact.customer.id`
3. เธรด DEEP → `customerId` จาก `Customer.findUnique({userId: conversation.buyerUserId})`
4. ยังไม่ผูก `Customer` เลย (ทั้ง 2 กรณี) → **ไม่ใช่ error** คืน `{items: [], nextCursor: null}`

**Response — Success (200)** — reuse `getOrdersByCustomer(shopId, customerId, {cursor, take:20, bookingOnly})` (`bookingOnly=true` เมื่อร้าน `vertical="LODGING"`)

```json
{ "items": [ /* Order summary */ ], "nextCursor": "..." }
```

**Response — Error**

| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `id` ไม่ใช่ UUID | `{ "error": "รหัสบทสนทนาไม่ถูกต้อง" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | resolve ร้าน active ไม่ได้ / เธรดไม่ใช่ของร้านนี้ | `{ "error": "ไม่พบร้านที่กำลังใช้งาน" }` / `{ "error": "ไม่พบบทสนทนานี้" }` |

---

### 4.14 `GET /api/chat/conversations` — query filter เพิ่ม (ฝั่ง seller เท่านั้น)

นอกจาก `channel`/`shopChannelId`/`q`/`status`/`customerLinked`/`hidden` เดิม (feature 00011/T1) เพิ่ม 3 query param (Valibot `ChatConversationsQuerySchema`):

| Query | ชนิด | คำอธิบาย |
|---|---|---|
| `chatGroupId` | `string (uuid)` | กรองเฉพาะกลุ่มนั้น (E5) — omit = ทุกกลุ่ม (แท็บ "ทั้งหมด") |
| `readState` | `"unread"\|"read"` | กรองยังไม่อ่าน/อ่านแล้ว — เกณฑ์เดียวกับ badge unread (JOIN `ChatMessage` จริง, `senderRole='BUYER'` ใหม่กว่า `shopLastReadAt`) |
| `spam` | `"true"` (query string) | `true` = ดูเฉพาะถังสแปม (มุมมองปกติตัด `isSpam=true` ออกอัตโนมัติ) |

**Response item เพิ่ม field** (buyer surface ไม่มี): `contactTags: string[]`, `contactSalesStatus: string` (จาก `ExternalContact`, สำหรับแสดง badge ใน inbox list)

---

## 5. Error Code Summary

| Error String (จาก service) | HTTP Status | Endpoint | ความหมาย |
|---|---|---|---|
| (signature verify fail) | 401 | `POST .../webhook` | ลายเซ็นไม่ตรง — payload อาจถูกปลอม |
| `unauthorized` | 401 | `connect`, `callback`, `pages`, `confirm` | ไม่มี NextAuth session |
| `session_expired` | 410 | `pages`, `confirm` | cookie `fb_channel_user_token` หมดอายุ/ไม่มี/ถอดรหัสไม่ผ่าน — ให้เริ่มเชื่อมใหม่ |
| `no_shop` | 400 | `pages`, `confirm` | resolve active shop ไม่ได้ |
| `graph_error` | 502 | `pages` | Graph API error ตอนดึงรายการ Page |
| `forbidden` (hub handshake) | 403 | `GET .../webhook` | `hub.verify_token` ไม่ตรง |
| `WINDOW_CLOSED` | 409 | `POST .../messages` (เธรดช่องทางนอก) | เกิน 24h นับจากข้อความล่าสุดของลูกค้า |
| `NOT_EXTERNAL_CHANNEL` | 400 | `POST .../messages` | defense — conversation ไม่ใช่ช่องทางนอกจริง |
| ชนิดข้อความไม่รองรับ | 400 | `POST .../messages` (เธรดช่องทางนอก) | `type != "TEXT"` บนเธรดช่องทางนอก |
| `SEND_FAILED:*` | 502 | `POST .../messages` (เธรดช่องทางนอก) | Graph API ปฏิเสธการส่ง (ลูกค้าบล็อก/token ตาย/เหตุอื่น) |
| `FORBIDDEN` (ownership) | 403 | `POST .../messages` (เดิม, สืบทอด) | ไม่ใช่เจ้าของร้าน |
| `CONVERSATION_NOT_FOUND` | 404 | `POST .../messages` (เดิม, สืบทอด) | ไม่พบ conversation |
| `QUICK_MESSAGE_NOT_FOUND` | 404 | `PATCH`/`DELETE .../quick-messages/[id]` | ไม่พบรายการ **ในร้านนี้** (รวมกรณีเป็นของร้านอื่น — ตั้งใจไม่แยกเพื่อไม่ leak) |
| (validation issue แรกจาก Valibot) | 400 | `POST .../quick-messages`, `PATCH .../quick-messages/[id]` | เช่น "กรุณากรอกหัวข้อ" / "ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง" |
| `GeminiNotConfiguredError` | 503 | `POST .../ai-suggest` | ไม่ได้ตั้ง `GEMINI_API_KEY` |
| `GeminiApiError` | 502 | `POST .../ai-suggest` | Gemini ปฏิเสธ/ตอบ parse ไม่ได้ |
| (rate-limit ต่อผู้ใช้) | 429 | `POST .../ai-suggest` | เกิน 15 ครั้ง/นาที ต่อ 1 user |
| `CONVERSATION_NOT_FOUND_OR_FORBIDDEN` | 404 | `PATCH .../conversations/[id]` | ไม่พบเธรดในร้านนี้ (ownership atomic `updateMany` count=0) |
| `GROUP_NOT_FOUND` | 404 | `PATCH .../conversations/[id]` (`action=set-group`), `PATCH`/`DELETE .../groups/[id]` | ไม่พบกลุ่มในร้านนี้ |
| `GROUP_NAME_TAKEN` | 409 | `POST .../groups`, `PATCH .../groups/[id]` | ชื่อกลุ่มซ้ำในร้านเดียวกัน (`@@unique[shopId,name]`) |
| `GROUP_LIMIT_REACHED` | 400 | `POST .../groups` | เกิน 30 กลุ่ม/ร้าน |
| `GROUP_NAME_EMPTY`/`GROUP_NAME_TOO_LONG` | 400 | `POST`/`PATCH .../groups*` | ชื่อว่าง/ยาวเกิน 40 ตัวอักษร |

---

## 6. Sequence (flow ซับซ้อน — ดู [[SDS]] §4 สำหรับ diagram ครบ)

flow ของ webhook ingest และ outbound send ถูกวาดครบแล้วใน [[SDS]] §4.1/4.2 (Mermaid sequenceDiagram) — ไม่วาดซ้ำที่นี่เพื่อกัน drift ระหว่าง 2 เอกสาร

---

## 7. Traceability

| Endpoint | SDS Component / Decision | BRD FR |
|----------|--------------------------|--------|
| `GET/POST /api/channels/facebook/webhook` | Component `signature.ts`/`webhook-types.ts`, Flow 4.1 | FR-FBC-01/02/03 |
| `GET /api/channels/facebook/connect` | Flow (SDS §2.1) | FR-FBC-09 |
| `GET /api/channels/facebook/callback` | Component `pending-connect.ts`, `shop-channel.service.ts`, TD-005 | FR-FBC-09/10 |
| `GET /api/channels/facebook/pages` | Component `describePageStates()` (`shop-channel.service.ts`) | FR-FBC-09/10 |
| `POST /api/channels/facebook/confirm` | Component `connectPages(forceIds)` (`shop-channel.service.ts`), TD-005 | FR-FBC-09/10 |
| `POST /api/chat/conversations/[id]/messages` (branch ใหม่) | Flow 4.2, TD-003 | FR-FBC-04/05/06 |
| `PATCH /api/chat/conversations/[id]` | `chat.service.ts` (`updateConversationState`/`setConversationGroup`) | BR-FBC-14/15/16, E5 |
| `GET/POST /api/chat/groups`, `PATCH/DELETE /api/chat/groups/[id]` | `chat-group.service.ts` | E5 |
| `GET /api/chat/conversations/[id]/orders` | `order.service.ts` (`getOrdersByCustomer`) | FR-FBC-07/08, E3 |
| webhook event ใหม่ (`message_reads`/`message_reactions`/`referral`/`reply_to`/`is_deleted`) | `channel-chat.service.ts` (`ingestReadEvent`/`ingestReactionEvent`/`ingestInboundMessage`) | E6/E7/E8/E9 |
| `GET/POST /api/channels/facebook` (list), `DELETE /api/channels/[id]` (disconnect) | `shop-channel.service.ts` | FR-FBC-11 — **implemented 2026-07-23** (ไม่ได้เขียน detail section แยกในเอกสารนี้เพราะไม่ใช่ path ใต้ `/api/channels/facebook/**` โดยตรง แต่ยืนยันแล้วว่ามีจริงจากโค้ด — ดู §3 "ยังไม่มี route" ที่ขีดฆ่ารายการนี้ออกแล้ว) |

---

## 8. สรุป (Summary)

เอกสาร API Contract นี้กำหนดสัญญาของ endpoint ที่มีอยู่จริงในโค้ด: webhook (×2 methods, รับ event ครบ 5
ชนิด: ข้อความปกติ/read/reaction/referral/unsend), OAuth `connect`/`callback`, หน้าเลือกเพจ `pages`/`confirm`,
list/disconnect channel, ข้อความสำเร็จรูป, AI ช่วยร่าง, CRM ผู้ติดต่อ, **ปักหมุด/ซ่อน/ปิดงาน/สแปม/กลุ่มแชท
(§4.11-4.12, ใหม่ในรอบ v1.2)**, และ **ประวัติออเดอร์ในแชท (§4.13)** บวกกับ error mapping ใหม่ที่เพิ่มเข้า
endpoint เดิม (`WINDOW_CLOSED` → 409, `NOT_EXTERNAL_CHANNEL` → 400, `SEND_FAILED` → 502) — ทุก endpoint
trace กลับ [[SDS]] และ [[SRS]] ได้ครบ

**2026-07-24 — เปลี่ยนพฤติกรรมเชื่อมเพจ:** `callback` เลิกเชื่อม "ทุกเพจ" ทันที → พาไปหน้าเลือกเพจ (`select`) ให้ติ๊กเลือกเอง + ย้ายเพจข้ามร้าน "รายเพจ" (`forceIds`) ป้องกันเพจส่วนตัวของ admin ถูกลากเข้าร้านโดยไม่ตั้งใจ. cookie `fb_channel_force` (force ทั้งชุด) ถูกถอด แทนด้วย cookie `fb_channel_user_token` (พก user token เข้ารหัสไปหน้าเลือกเพจ)

**Open Questions (คงเหลือหลัง v1.2):**
- ส่งวิดีโอ/เสียง/ไฟล์/reply/reaction ออกช่องทางนอก (E7/E9 ขาออก) ยังไม่มี contract — TEXT/IMAGE ส่งออกได้แล้ว แต่ `sendOutboundMessage` ไม่มี parameter สำหรับชนิดอื่น (ดู §4.5)
- `messaging_referrals` subscribe field ขาดใน `MESSENGER_SUBSCRIBED_FIELDS` — เพจที่เชื่อมก่อน 2026-07-25 ต้อง reconnect ถึงจะได้ pure-referral event เต็มรูป (ดู [[EXTENSIONS-2026-07-25]] E8.3)
- migration ต้นทางของ `Conversation.isSpam`/`externalReadAt` ยังไม่ยืนยันชื่อไฟล์ (ดู [[DATABASE]] §5.1 ลำดับ 18) — ไม่กระทบ contract ของ API แต่ควรปิด gap เอกสาร

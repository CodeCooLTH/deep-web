---
title: "API Contract — Facebook Human Agent"
owner: shinobu22
status: draft
module: M00043-FacebookHumanAgent
version: "1.0"
created: 2026-08-10
tags: [feature, chat, messaging, facebook, instagram, seller, human-agent, api]
related: ["[[SRS]]", "[[SDS]]", "[[../00018 - Facebook Chat Integration/API]]"]
---

> **โมดูล:** M00043-FacebookHumanAgent
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-10
> **สถานะ:** Draft — **ไม่มี endpoint ใหม่** เอกสารนี้ครอบเฉพาะสัญญาที่เปลี่ยนของ endpoint เดิม
> (feature 00018) + webhook contract ขาเข้าของ `postback` + การเรียก Graph ขาออกที่มี tag
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: Facebook Human Agent

---

## 1. Overview

ฟีเจอร์นี้ **ไม่เพิ่ม REST endpoint ใหม่** — เอกสารนี้ครอบ 3 เรื่อง:

1. **สัญญาที่เปลี่ยน** ของ `POST /api/chat/conversations/[id]/messages` (feature 00018) — พฤติกรรม/error
   ที่ client เห็นเมื่อ `type=IMAGE_GRID` และหน้าต่างปิด (§4.1)
2. **webhook contract ขาเข้า** ของ event `postback` — โครง payload จริงของ Meta ที่ต้อง parse ให้ถูก (§4.2)
3. **การเรียก Graph ขาออกที่มี `messaging_type`/`tag`** — ไม่เปลี่ยนจาก 00018 แต่ระบุจุดที่ใช้จริง (§4.3)

- **เอกสารออกแบบต้นทาง:** [[SDS]] ของโมดูลนี้
- **Base URL:** `https://deepthailand.app` (เดียวกับ 00018 — ไม่เปลี่ยน)
- **Content-Type:** `application/json` (webhook) / ไม่เปลี่ยนจาก 00018 สำหรับ endpoint เดิม
- **Convention:** สืบทอด convention ของ [[../00018 - Facebook Chat Integration/API]] ทั้งหมด

---

## 2. Authentication

ไม่มี authentication mechanism ใหม่ — endpoint ที่ถูกแก้พฤติกรรมทั้งสองยังใช้กลไกเดิมของ 00018 ทุกประการ:

| Endpoint/Contract | วิธี Auth | หมายเหตุ |
|---|---|---|
| `POST /api/channels/facebook/webhook` | `X-Hub-Signature-256` (ไม่เปลี่ยน) | field `postback` ใหม่ผ่าน Valibot schema เดียวกัน ไม่มี auth เพิ่ม |
| `POST /api/chat/conversations/[id]/messages` | NextAuth session + ownership (`canAccessShop`, ไม่เปลี่ยน) | สิทธิ์ใช้ Human Agent ไม่ใช่สิทธิ์ระดับใหม่ — ครอบด้วย `canAccessShop` เดิม (PRD §4.1: "ทุกกลุ่ม `ShopMember` ใช้สิทธิ์นี้ได้เท่ากัน") |

---

## 3. Endpoint List

**ไม่มี endpoint ใหม่ในตารางนี้** — รายการด้านล่างคือ endpoint เดิมของ 00018 ที่พฤติกรรม **บางส่วน** เปลี่ยน

| Method | Path | สิ่งที่เปลี่ยนในฟีเจอร์นี้ |
|--------|------|---------------------------|
| `POST` | `/api/channels/facebook/webhook` | รับ+ประมวลผล field `event.postback` ที่เคยถูกละเลย (ตกเป็น `IGNORED` เงียบ ๆ) |
| `POST` | `/api/chat/conversations/[id]/messages` | เมื่อ `type=IMAGE_GRID` และหน้าต่างปิด+ไม่มีสิทธิ์ Human Agent: จาก `409` ทันที → พยายามส่งก่อนเสมอ (อาจได้ `502` แทนถ้า Meta ปฏิเสธ) |

---

## 4. รายละเอียด

### 4.1 `POST /api/chat/conversations/[id]/messages` — สัญญาที่เปลี่ยน (เฉพาะ `type=IMAGE_GRID`)

Contract เดิมทั้งหมดของ endpoint นี้ (`type`, auth, response shape, error mapping ที่เหลือ) **ไม่เปลี่ยน**
— ดู [[../00018 - Facebook Chat Integration/API]] §4.5 สำหรับ contract เต็ม ส่วนนี้ document **เฉพาะ
พฤติกรรมที่เปลี่ยนของ branch `type=IMAGE_GRID`** เมื่อเธรดเป็นช่องทางนอก (`channel != "DEEP"`)
Trace: [[SDS]] TD-HA-04, TFR-HA-04

**ก่อนฟีเจอร์นี้:**

หน้าต่าง 24 ชม. ปิด และ (สวิตช์ใหญ่ปิด **หรือ** หน้าต่าง 7 วันหมดแล้ว) → service throw `WINDOW_CLOSED`
**ทันที ไม่มีการเรียก Meta เลย** → route ตอบ `409` พร้อม
`{ "error": "หมดเวลาที่ Meta อนุญาตให้ส่งข้อความในเธรดนี้ — ต้องรอให้ลูกค้าทักเข้ามาใหม่" }`

**หลังฟีเจอร์นี้:**

ในเงื่อนไขเดียวกัน — service **ไม่ throw ก่อนลอง** อีกต่อไป จะยิงไปยัง Meta แบบไม่ติด tag
(`messaging_type: 'RESPONSE'`) เสมอ (BR-HA-14: "พยายามส่งแล้วให้ Meta ตัดสิน") ผลลัพธ์ที่เป็นไปได้:

| กรณี | ผลลัพธ์ |
|---|---|
| Meta ยอมรับ (เกิดขึ้นได้จริงถ้าโมเดลหน้าต่างของเราคลาดกับความจริง — ดู 00018 SRS "ข้อควรระวัง" เรื่อง `lastInboundAt` ไม่ใช่ความจริงเสมอไป) | `200` — ข้อความส่งสำเร็จ (เดิมไม่มีทางเกิดขึ้นได้เลยเพราะถูก block ไว้ก่อน) |
| Meta ปฏิเสธ (กรณีปกติ) | `502` พร้อม `describeSendFailure()` (เหมือนเส้นทาง `TEXT`/`IMAGE` เดี่ยวที่ทำถูกอยู่แล้วตั้งแต่ 2026-08-03) — **savedMessage แนบมาด้วยเสมอ** (บันทึกเป็น `deliveryStatus=FAILED` แล้ว ไม่ใช่ error ที่ไม่มีร่องรอย) |

**ยังคงเดิม (ไม่เปลี่ยน):** ownership (`403`), `NOT_EXTERNAL_CHANNEL` (`400`), `CHANNEL_NOT_ACTIVE` (`409`)

> 🛑 **แก้ 2026-08-23 (CR คิวส่งข้อความขาออก R-8/R-20):** เดิมบรรทัดนี้ยังนับ
> `IMAGE_GRID_COUNT_OUT_OF_RANGE` (`400`) และ fallback "ตกไปส่งทีละใบเมื่อ Meta ปฏิเสธ template
> `image_grid`" ว่ายังมีอยู่ — **ทั้งคู่ไม่มีแล้ว** (`rg IMAGE_GRID_COUNT_OUT_OF_RANGE src/` = 0 จุด)
> เพราะเลิกใช้ image_grid template: รูปหลายใบกลายเป็นหลายแถวคิวที่ยิงทีละใบตั้งแต่ต้น จึงไม่มีทั้ง
> เพดานจำนวนรูปต่อก้อนและ fallback ที่ต้องมีไว้รองรับการที่ก้อนถูกปฏิเสธ

---

### 4.2 `POST /api/channels/facebook/webhook` — field `postback` (ใหม่)

รับ event `messaging_postbacks` จาก Meta — โครงตามเอกสาร Messenger Platform: ปุ่ม Get Started/
persistent menu/button template Trace: [[SDS]] TD-HA-01, TD-HA-03, TFR-HA-03 → BRD FR-HA-08/09

**Request (ส่วนที่เพิ่มจาก `MessagingEventSchema` เดิม)**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Body | `entry[].messaging[].sender.id` | `string` | yes (เดิม, ไม่เปลี่ยน) | PSID/IGSID ของลูกค้าที่กดปุ่ม |
| Body | `entry[].messaging[].timestamp` | `number` | no (เดิม, ไม่เปลี่ยน) | เวลาที่ Meta บันทึก event (ms) — ใช้เป็นเวลาที่ยืดหน้าต่าง ถ้าไม่มีใช้เวลา webhook รับแทน |
| Body | `entry[].messaging[].postback.title` | `string` | **no (ใหม่)** | ข้อความบนปุ่มที่กด — **ไม่ได้ใช้จริงในฟีเจอร์นี้** (สงวนไว้เผื่ออนาคต) |
| Body | `entry[].messaging[].postback.payload` | `string` | **no (ใหม่)** | ค่าที่ผูกไว้กับปุ่มตอน setup — **ไม่ได้ใช้จริงในฟีเจอร์นี้** — 🛑 **ไม่ใช่ field ที่ตัดสินความหมายของ event นี้** (ตัวตัดสินคือ "มี `event.postback` object หรือไม่" ไม่ใช่ค่าข้างในมัน — ตาม `external-payload-schema.md`) |
| Body | `entry[].messaging[].postback.referral` | `object` | **no (ใหม่)** | โครงเดียวกับ `ReferralSchema` เดิม — ติดมาเมื่อลูกค้ากด Get Started ผ่านลิงก์ m.me ที่มี ref — **ไม่ได้ประมวลผลเพิ่มในฟีเจอร์นี้** (การยืด `lastInboundAt` ทำผ่าน `event.postback` เองอยู่แล้ว ไม่ต้องพึ่ง referral ซ้อน) |

**Valibot:** `MessagingEventSchema` (`src/lib/facebook/webhook-types.ts`) — field `postback` ทุก
sub-field เป็น `v.optional(...)` ทั้งหมด (**ไม่มี field ไหนบังคับ** — เหตุผลตาม TD-HA-03 ของ [[SDS]])

**Event dispatch (route แยกตาม field ที่มาก่อน — เพิ่ม branch ใหม่ 1 บรรทัดในลำดับ if/else เดิม):**
`event.postback` → `ingestPostbackEvent` — วางก่อน `event.pass_thread_control || event.take_thread_control
|| event.request_thread_control` และหลัง `event.reaction` (ลำดับไม่มีผลเชิงฟังก์ชัน เพราะ field เหล่านี้
มาแยกกันเสมอในทางปฏิบัติ — จัดกลุ่มเพื่อความอ่านง่ายเท่านั้น)

**Response — Success (200)**

```json
{ "ok": true }
```

เหมือนเดิมทุกประการ — `postback` event ที่ประมวลผลสำเร็จหรือถูกข้าม (ไม่พบ channel/contact/conversation)
ล้วนตอบ `200` เหมือนกัน (BR-HA-12: "ต้องไม่ทำให้ระบบล้ม")

**Response — Error**

ไม่มี error path ใหม่จาก branch นี้ — `401` (signature ไม่ผ่าน) และ `503` (infra error ระดับ Prisma
P1xxx) ใช้กลไกเดิมของ route ทั้งหมด (ดู [[../00018 - Facebook Chat Integration/API]] §4.2)

**Side-effects (ต่อ 1 event `postback` ที่มี channel+contact+conversation อยู่แล้ว):**
- `Conversation.lastInboundAt` ขยับเป็นเวลาของ event **เฉพาะเมื่อใหม่กว่าค่าเดิม** (`updateMany` กับ
  `WHERE ... OR lastInboundAt IS NULL OR lastInboundAt < :at`)
- **ไม่สร้าง** `ChatMessage`/`Notification`/`ExternalContact`/`Conversation` ใหม่ใด ๆ (TD-HA-01)

**Idempotency:** ไม่มี unique constraint ผูกกับ event นี้โดยเฉพาะ (ไม่เหมือน `ChatMessage.externalMessageId`)
— แต่ปลอดภัยโดยธรรมชาติเพราะ `updateMany` แบบ conditional-write เป็น idempotent อยู่แล้ว (event ซ้ำ/
Meta redeliver ยิง `lastInboundAt` เดิมซ้ำ ๆ ไม่ทำให้ค่าผิดเพี้ยน)

---

### 4.3 Graph API ขาออก — `messaging_type`/`tag` (ไม่เปลี่ยนจาก 00018 — ระบุจุดที่ใช้จริง)

`sendTextMessage`/`sendAttachmentMessage` (`src/lib/facebook/graph.ts`) **ไม่ถูกแก้ไขแม้แต่บรรทัดเดียว**
ในฟีเจอร์นี้ — ทั้งสองฟังก์ชันรับพารามิเตอร์ `tag?: string` อยู่แล้วและประกอบ body ตามรูปแบบนี้
เหมือนกันทุกฟังก์ชัน:

> 🛑 **แก้ 2026-08-23 (CR คิวส่งข้อความขาออก R-8/R-20):** เดิมย่อหน้านี้ระบุ `sendImageGridMessage`
> เป็นตัวที่สาม — **ฟังก์ชันนั้นถูกลบไปแล้ว** (ไม่มีผู้เรียกเหลือ) เพราะรูปหลายใบกลายเป็นหลายแถวคิว
> ที่ยิงทีละใบแทนการยิง image_grid template ก้อนเดียว ตัวที่ยังรับ `tag` และมีผู้เรียกจริงคือ 2 ตัว
> ข้างต้น (+ `sendTemplateMessage` สำหรับการ์ดสินค้า ซึ่งประกอบ body ด้วยรูปแบบเดียวกัน)

```json
{
  "recipient": { "id": "<PSID>" },
  "messaging_type": "MESSAGE_TAG",
  "tag": "HUMAN_AGENT",
  "message": { "text": "..." }
}
```

หรือเมื่อไม่มี tag (หน้าต่างปกติเปิดอยู่ หรือไม่มีสิทธิ์และกำลัง "พยายามส่งให้ Meta ตัดสิน"):

```json
{
  "recipient": { "id": "<PSID>" },
  "messaging_type": "RESPONSE",
  "message": { "text": "..." }
}
```

**สิ่งที่ฟีเจอร์นี้เปลี่ยน คือ *ค่าที่ถูกส่งเข้าพารามิเตอร์ `tag`*** — เดิมมาจาก `isHumanAgentEnabled()`
(สวิตช์ใหญ่อย่างเดียว) ตอนนี้มาจาก `shouldTagHumanAgent(...)` ซึ่งพิจารณา allow-list ต่อ PSID เพิ่มด้วย
(TFR-HA-01/02 ของ [[SRS]]) — **โครง request ที่ยิงไป Meta ไม่เปลี่ยนรูปแบบ**

**Response ของ Meta (ไม่เปลี่ยน):** สำเร็จคืน `{ "message_id": "<mid>" }`, ปฏิเสธคืน error object ที่
`graphFetch` แปลงเป็น `GraphApiError` — การแปลข้อความปฏิเสธเป็นภาษาไทยยังคงผ่าน `describeSendFailure()`
(`src/lib/chat-send-failure.ts`) เดิมทั้งหมด

🛑 **ห้ามเดา error code ของ Meta ที่เฉพาะเจาะจงกับ `HUMAN_AGENT` tag ที่ยังไม่เคยเห็นจริง** — ระบบยังไม่เคย
ส่งข้อความติด tag นี้ไปหา Meta จริงเลยสักครั้ง (สวิตช์ปิดอยู่ตลอดมา) เมื่อเริ่ม Test Plan (PRD §11.3)
และเจอ error ที่ `describeSendFailure()` ไม่รู้จัก (ไม่ตรง RULES ที่มีอยู่) **ให้ปล่อยเป็นข้อความดิบของ Meta
ไว้ก่อนตามพฤติกรรมเดิมของฟังก์ชันนี้** (`known: false`, คงข้อความอังกฤษทั้งดุ้น) **ห้ามเพิ่ม rule ใหม่ในไฟล์
นั้นโดยเดาความหมายจากชื่อ error code** — ต้อง reproduce กับเพจจริงก่อนเหมือนที่ `#551` เคยทำ (ดู comment
ในไฟล์นั้น) ค่อยเพิ่ม rule เป็นงานแยกหลัง Test Plan เท่านั้น

---

## 5. Error Code Table (สรุป — ไม่มี error ใหม่ ดู [[SDS]] §7 สำหรับ enumeration เต็ม)

| Error Code | HTTP Status | เงื่อนไข | เปลี่ยนจาก 00018 ไหม |
|------------|-------------|----------|----------------------|
| `WINDOW_CLOSED` | `409` | `sendOutboundMessage` เมื่อ `!sentByHuman` และหน้าต่างปิด | ไม่เปลี่ยน — ยังคง throw เหมือนเดิม |
| `SEND_FAILED:*` | `502` | Meta ปฏิเสธ (ทั้ง `TEXT`/`IMAGE`/`IMAGE_GRID` ตอนนี้ผ่านเส้นทางเดียวกัน) | **ขอบเขตกว้างขึ้น** — `IMAGE_GRID` ที่หน้าต่างปิดตอนนี้ก็ไปโผล่ที่นี่ได้ (เดิมไปโผล่ที่ `WINDOW_CLOSED` แทน) |
| (ไม่มี — webhook ตอบ 200 เสมอ) | `200` | event `postback` ทุกกรณี (สำเร็จ/ข้าม) | field ใหม่ที่เข้าเส้นทางนี้ — สถานะ HTTP ไม่เปลี่ยน |

**โครง error response มาตรฐาน (ไม่เปลี่ยนจาก 00018):**

```json
{ "error": "<ข้อความภาษาไทย>", "savedMessage": null }
```

---

## 6. Sequence

ดู [[SDS]] §4.1/4.2 สำหรับ Mermaid sequence diagram ครบทั้ง 2 flow (ส่งข้อความนอกหน้าต่าง + postback
เข้า webhook) — ไม่วาดซ้ำที่นี่เพื่อกัน drift ระหว่างเอกสาร

---

## 7. Traceability

| Endpoint/Contract | SDS Component / Decision | BRD FR |
|----------|--------------------------|--------|
| `POST /api/chat/conversations/[id]/messages` (branch `IMAGE_GRID`) | Component `sendOutboundImageGrid`, TD-HA-04 | FR-HA-10/11 |
| `POST /api/channels/facebook/webhook` (field `postback`) | Component `ingestPostbackEvent`, TD-HA-01/TD-HA-03, Flow 4.2 | FR-HA-08/09 |
| Graph API ขาออก (`tag` parameter) | Component `canUseHumanAgent`/`shouldTagHumanAgent` | FR-HA-03/04/05/06/07/10 |

---

## 8. สรุป (Summary)

เอกสาร API Contract นี้ครอบสัญญาที่เปลี่ยนของฟีเจอร์ Human Agent — **ไม่มี endpoint ใหม่** เปลี่ยนแค่
(1) ขอบเขตของ error `502 SEND_FAILED` ที่กว้างขึ้นครอบ `IMAGE_GRID` เมื่อหน้าต่างปิด (เดิมไปทาง `409
WINDOW_CLOSED` ทันที) (2) webhook รับ field `postback` ใหม่ที่ optional ทุก sub-field (3) ค่าที่ป้อนเข้า
`tag` parameter ของ Graph API เปลี่ยนแหล่งที่มา (จากสวิตช์ใหญ่อย่างเดียว → SSOT ที่พิจารณา allow-list
ต่อ PSID ด้วย) โดยรูปแบบ request/response ที่ยิงไป Meta ไม่เปลี่ยน

**Open Questions:**
- ยังไม่เคยเห็น error response จริงของ Meta เมื่อส่งข้อความติด tag `HUMAN_AGENT` (ระบบไม่เคยส่งจริงเลย
  สักครั้ง — สวิตช์ปิดมาตลอด) — ต้องเก็บตัวอย่างจริงระหว่าง Test Plan (PRD §11.3) ก่อนเพิ่ม rule ใหม่ใน
  `chat-send-failure.ts`

---
title: "API — สร้างออเดอร์อัตโนมัติจากคำสั่งในแชท (Auto Create Order from Chat Keyword)"
owner: shinobu22
status: draft
created: 2026-08-30
tags: [api, feature, 00061, chat, order, automation]
related: ["[[SDS]]", "[[SRS]]", "[[BRD]]"]
---

> **โมดูล:** 00061-AutoCreateOrder · **ประเภท:** API Contract · **เวอร์ชัน:** 1.0
> **วันที่:** 2026-08-30 · **สถานะ:** Draft — รอ user review · **เจ้าของ:** SA (`safepay-planner`)

# API Contract: สร้างออเดอร์อัตโนมัติจากคำสั่งในแชท

---

## 1. Overview

รองรับ SDS §2 กลุ่ม **A10** (7 route ใหม่) + **A11** (cron) + กลุ่ม **B** ที่แก้ route เดิม (B2/B5) + route ที่ **reuse ตรงไม่แก้เลย** แต่ต้องมีสัญญากำกับ (`/api/orders/[token]/cancel`)
**Provider:** Next.js 16 App Router route handler ทั้งหมด — เดียวกับทั้งระบบ **ไม่มี stack อื่น**
**ผู้บริโภค:** หน้า A/B/C/D (`(paces)/seller/**`) ผ่าน `fetch()` ฝั่ง client · Meta webhook (entry 2) · Vercel Cron (A11)

- **Base URL:** `https://{shop-subdomain}.deepthailand.app/api` — **ไม่มี prefix ใหม่**
- **Content-Type:** `application/json` ทุก endpoint (**ไม่มี multipart** — ไม่เกี่ยวกับ upload ตาม SRS §6)
- 🛑 **Envelope — ยึด convention เดิมของระบบ ไม่ยึด template:**
  - สำเร็จ = **แบน ไม่มี `{data:…}` wrapper** (ยืนยันจาก `cancel/route.ts:63` → `NextResponse.json(updated)`)
  - ผิดพลาด = **`{"error": "ข้อความสำหรับผู้ใช้"}`** (ยืนยัน `:68`,`:71`,`:79`) **ไม่ใช่ `{error:{code,message,details}}`**

---

## 2. Authentication

| รายการ | ค่า |
|--------|-----|
| **วิธี** | NextAuth v4 session cookie — `getServerSession(authOptions)` (เดียวกับทั้งระบบ) |
| **สิทธิ์ระดับร้าน** | `canAccessShop(shopId, sessionUserId)` (ของเดิม) |
| **สิทธิ์แก้ไขการตั้งค่า** | เฉพาะ OWNER/ADMIN — ⚠️ **syntax เป๊ะยังไม่ระบุ** (AC-ACO-07 ยังค้าง ตาม SDS §3.7) |
| **cron** | `Authorization: Bearer ${CRON_SECRET}` (pattern เดียวกับ `auto-reply-sweeper` ✅ ยืนยันโค้ดแล้ว) |
| **webhook entry 2** | ของเดิม (Meta signature verification) — **ไม่เปลี่ยน** |
| **ไม่ผ่าน** | `401` ไม่มี session · `403` มี session แต่ไม่ใช่สมาชิกร้าน **หรือ vertical ไม่ใช่ `ONLINE_SALES`** (AC-ACO-09) |

---

## 3. Endpoint List

| Method | Path | คำอธิบาย | สถานะ |
|--------|------|----------|---|
| `GET`/`PUT` | `/api/seller/auto-order/config` | อ่าน/บันทึกชุดตั้งค่า | ใหม่ |
| `POST`/`DELETE` | `/api/seller/auto-order/config/test-threads` | เพิ่ม/ลบห้องแชททดสอบ | ใหม่ |
| `POST` | `/api/seller/auto-order/dry-test` | "ลองพิมพ์ดู" — dry-run ตัวแกะ | ใหม่ |
| `GET` | `/api/seller/auto-order/channels/health` | สถานะสิทธิ์ `message_echoes` | ใหม่ |
| `POST` | `/api/seller/auto-order/channels/{id}/repair` | ปุ่ม "ซ่อมให้" | ใหม่ |
| `POST` | `/api/orders/{token}/auto-order/retry` | "ลองอ่านข้อความนี้อีกครั้ง" | ใหม่ |
| `POST` | `/api/orders/{token}/auto-order/discard` | "ทิ้งร่างนี้" | ใหม่ |
| `POST` | `/api/orders/{token}/cancel` | "ยกเลิกใบเก่า" | 🛑 **reuse ตรง — ไม่แก้เลย** |
| `GET` | `/api/chat/conversations/{id}/messages` | ชั้นอ่าน | แก้เพิ่ม (B2) |
| `POST` | `/api/channels/facebook/webhook` | รับ echo (entry 2) | แก้เพิ่ม (B5) |
| `GET` | `/api/cron/auto-order-sweeper` | Watchdog + Reaper | ใหม่ |

---

## 4. Endpoint Detail

### 4.1 `POST /api/orders/{token}/cancel` — 🛑 reuse ตรง ไม่แก้แม้บรรทัดเดียว

**สถานะ: ไม่มีการเปลี่ยนแปลงใด ๆ ต่อไฟล์นี้** — บันทึกสัญญาที่มีอยู่แล้วไว้เพื่อให้ปุ่ม "ยกเลิกใบเก่า" เรียกได้ถูกโดยไม่ต้องเดา และเพื่อให้ชัดว่า **ตั้งใจไม่แตะ ไม่ใช่ลืมทำ**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | ค่าที่ฟีเจอร์นี้ส่ง |
|---|---|---|---|---|
| Path | `token` | `string` | ✅ | `publicToken` ของ **ใบเก่า** (ไม่ใช่ใบใหม่ที่เพิ่งสร้าง) |
| Body | `reason` | `string` | ✅ (seller) | `"DUPLICATE_ORDER"` — ค่าคงที่ตายตัว (OD-ACO-01) |

**สำเร็จ (200):** `Order` object เต็ม (ของเดิม ไม่มีฟิลด์ใหม่)

**Error — ของเดิมทั้งหมด ไม่มี error code ใหม่จากฟีเจอร์นี้** (ข้อความคัดจากซอร์สจริง):

| เงื่อนไข | HTTP | `error` (ตรงตามซอร์ส) |
|---|---|---|
| ไม่ใช่สมาชิกร้าน/เจ้าของออเดอร์ | `403` | `"ไม่มีสิทธิ์ยกเลิกคำสั่งซื้อนี้"` (`:50`) |
| ไม่ส่ง `reason` | `400` | `"เลือกเหตุผลก่อนยกเลิก"` (`:68`) |
| `reason` ไม่อยู่ใน allow-list | `400` | `"เหตุผลที่เลือกไม่อยู่ในรายการ"` (`:71`) |
| สถานะยกเลิกไม่ได้ (`assertTransition` throw) | `400` | `"คำสั่งซื้อนี้อยู่ในสถานะที่ยกเลิกไม่ได้แล้ว"` (`:79`) |
| ไม่พบออเดอร์ | `404` | ⚠️ **มี 2 ข้อความต่างกันตามเส้นทาง** — ดูกล่องด้านล่าง |

> 🛑 **ข้อสังเกตที่ Controller ตรวจเจอในซอร์ส (2026-08-30) — ของเดิม ไม่ใช่ของที่ฟีเจอร์นี้ทำ:**
> **404 มี 2 เส้นทางที่คืนคนละข้อความ** — `:31` (เช็คก่อนเข้า try) คืน **`"Order not found"` ภาษาอังกฤษ** · `:82` (`cancelOrder` throw) คืน **`"ไม่พบคำสั่งซื้อนี้"` ภาษาไทย**
> ⇒ **client ที่แสดงค่า `error` ตรง ๆ จะโชว์ภาษาอังกฤษให้ผู้ใช้เห็นในบางเส้นทาง** · ฟีเจอร์นี้ **ไม่แก้** (นอกขอบเขต + คงหลัก "reuse ตรง") แต่ **หน้า B ต้องไม่แสดง `error` ดิบสำหรับ 404** ให้ใช้ข้อความของตัวเองแทน

🛑 **ลำดับ deploy ที่ผิดแล้วพังทันที:** ถ้า `DUPLICATE_ORDER` ยังไม่ถูกเพิ่มเข้า `CANCEL_REASONS_BY_VERTICAL` (SDS **B6**) ปุ่มนี้จะได้ **400 `"เหตุผลที่เลือกไม่อยู่ในรายการ"` ทุกครั้ง**
⇒ **B6 ต้องขึ้นก่อนปุ่มถูกเปิดใช้เสมอ ไม่ใช่ deploy พร้อมกันแล้วหวังว่าลำดับถูก**

🛑 **ช่องว่าง AC-ACO-52 ยังไม่ปิด:** route นี้ **ไม่เคยตรวจ `OrderShipment.status='CREATED'` เลย** ⇒ กล่องเตือน iShip ต้อง query **ที่ฝั่ง client ก่อนเปิด Swal** (⚠️ ยังไม่ระบุว่าใช้ endpoint ไหน — Explore ตอน implement) **ไม่ใช่การเปลี่ยน route นี้**

---

> 🛑 **4.2–4.8 ยังไม่มีซอร์สจริงให้คัด — ข้อความ error เป็น *ข้อเสนอ* ทั้งหมด** ยกเว้นจุดที่ระบุว่า **ยึดจาก `UX-Design-Spec.md`** หรือ **ยึด pattern เดิมของระบบ** (กำกับทุกจุด)

### 4.2 `GET`/`PUT /api/seller/auto-order/config`
**Auth:** session + `canAccessShop()` · `PUT` เพิ่ม OWNER/ADMIN (⚠️ syntax ยังไม่ยืนยัน)

**GET → 200**
```json
{ "status": "OFFLINE",
  "phrases": [{ "id": "uuid", "phrase": "สรุปคำสั่งซื้อ" }],
  "channels": [{ "shopChannelId": "uuid", "provider": "MESSENGER", "pageName": "ร้านดอกไม้บางนา",
                 "selected": true, "messageEchoesStatus": "GRANTED" }],
  "testThreads": [{ "conversationId": "uuid", "label": "ลูกค้า A · Messenger" }] }
```

**PUT — Request** (Valibot `UpdateAutoOrderConfigSchema`)

| ฟิลด์ | ชนิด | บังคับ | หมายเหตุ |
|---|---|---|---|
| `status` | `'OFFLINE'\|'TEST'\|'LIVE'` | ✅ | |
| `phrases` | `string[]` | ✅ `minLength(1)` | trim ที่ server ก่อน `normalizeTriggerPhrase()` |
| `channelIds` | `string[]` | ✅ (ว่างได้) | `shopChannelId[]` ที่เลือก |

| เงื่อนไข | HTTP | `error` | ที่มาของคำ |
|---|---|---|---|
| ไม่มี session | `401` | `"unauthorized"` | ✅ **pattern เดิมของระบบ — ใช้ 129 จุดทั่ว `src/app/api`** |
| ไม่ใช่สมาชิกร้าน | `403` | `"ไม่มีสิทธิ์เข้าถึงร้านนี้"` | เสนอ — ตรวจกับ ux |
| `vertical !== 'ONLINE_SALES'` (AC-09) | `403` | `"ฟีเจอร์นี้ใช้ได้เฉพาะร้านขายออนไลน์"` | เสนอ — ตรวจกับ ux |
| `phrases` ว่างหลัง trim | `400` | `"ต้องมีวลีจุดชนวนอย่างน้อย 1 วลีเสมอ"` | **ยึดจาก UX spec** (paraphrase ของ tooltip — ⚠️ ต้องยืนยันว่าใช้คำเดียวกันเป๊ะหรือแยก) |
| `status IN (TEST,LIVE)` แต่มีเพจที่เลือก `messageEchoesStatus !== 'GRANTED'` (AC-10) | `409` | `"\"{ชื่อเพจ}\" ยังไม่ได้เปิดสิทธิ์ที่จำเป็น ระบบจะอ่านข้อความที่คุณพิมพ์จากเพจนี้ไม่ได้"` | **ยึดจาก UX spec เป๊ะ** |

🛑 **409 เป็นด่านสุดท้าย ไม่ใช่ทางที่ผู้ใช้ควรเจอ** — หน้า A เช็คผ่านตัวตรวจสุขภาพ (§4.5) ก่อนส่ง `PUT` อยู่แล้ว · endpoint บล็อกไว้เป็น defense-in-depth

### 4.3 `POST`/`DELETE /api/seller/auto-order/config/test-threads/{conversationId}`
**Auth:** เดียวกับ `PUT` §4.2 · **ไม่มี body** (path param พอ)
🛑 **idempotent ทั้งสองทิศ** — เพิ่มเธรดที่มีอยู่แล้ว → `200` เฉย ๆ **ไม่ error** (`@@unique([configId,conversationId])` กันซ้ำที่ DB อยู่แล้ว ⇒ **service ต้อง catch P2002 แล้วคืนสำเร็จ ไม่ throw ทับ**) · ลบเธรดที่ไม่เคยเพิ่ม → `200` no-op

| เงื่อนไข | HTTP | `error` |
|---|---|---|
| `conversationId` ไม่ใช่ของร้านนี้ | `404` | `"ไม่พบห้องแชทนี้"` (เสนอ) — 🛑 **scope ownership ที่ `WHERE` ไม่ใช่ดึงมาเทียบทีหลัง** |

⚠️ **UX spec ไม่ได้ระบุ error copy ของชุดนี้เลย** (มีแค่หัวข้อ "แชทสำหรับทดสอบ (2) [+เพิ่มแชท]") — ข้อความข้างบนเป็นข้อเสนอทั้งหมด **ต้องผ่าน ux ก่อน implement**

### 4.4 `POST /api/seller/auto-order/dry-test` — 🛑 ต้องไม่เขียน DB แม้บรรทัดเดียว
**Auth:** GET-level พอ — **ไม่ต้องมีสิทธิ์แก้ไข เพราะไม่เขียนอะไรเลย** (STAFF ที่ดูอย่างเดียวก็กด "ลองพิมพ์ดู" ได้)

| ฟิลด์ | ชนิด | บังคับ | หมายเหตุ |
|---|---|---|---|
| `rawBody` | `string` | ✅ `minLength(1)` | ข้อความดิบทั้งก้อน **รวมวลีจุดชนวนด้วย** |

🛑 **กันการเขียน DB ที่ระดับโครงสร้าง ไม่ใช่ที่ระดับ convention:**
route นี้ **import ได้เฉพาะ `parseAutoOrderMessage()` (A2) และ `validateAutoOrderCompleteness()` (A6)** — **ไม่ import `detectAutoOrderTrigger`/`promoteDraftToOrder`/`writeAutoOrderResultMessage` (A7/A8) เลยแม้แต่ type**
เพราะ **A7/A8 คือที่เดียวในทั้งฟีเจอร์ที่มี `.create()`/`.update()` บน `Order`/`ChatMessage`** ⇒ **ไม่ import = ไม่มีทางเรียกได้จริง** (หลักการเดียวกับ closed-caller-set ของ TFR-021 ประยุกต์กับขอบเขตใหม่)
✅ **A6 มี query 2 ครั้งแต่เป็น `findUnique`/`findMany` ล้วน** — เสนอเทส `[blocker]` เพิ่มอีกชั้น: `grep -c '\.(create|update|upsert|delete)\(' src/services/auto-order-validate.service.ts` ต้อง `=== 0` (**ต้นทุนถูกมาก เป็น grep ธรรมดา ไม่ต้องพึ่ง semantic**)

**200 — ครบทุกอย่างที่หน้า A ต้องใช้ในรอบเดียว ไม่ยิงซ้ำ:**
```json
{ "matchedPhrase": "สรุปคำสั่งซื้อ", "complete": false,
  "reasons": ["ADDRESS_INCOMPLETE", "TOTAL_MISMATCH"], "preview": null,
  "detail": { "invalidPhone": null, "addressMissingParts": ["รหัสไปรษณีย์"],
              "itemsNotMatched": false,
              "totalMismatch": { "stated": 790, "computed": 840, "diff": 50 },
              "dateOutOfWindowLabel": null } }
```
`complete:true` → `preview: {customerName, phone, items[], totalAmount}` แทน (`detail: null`) — โครงนี้ครอบ **ทั้ง 9 เหตุผลตกร่าง** โดยไม่ต้อง round-trip ที่สอง

| เงื่อนไข | HTTP | ผลลัพธ์ |
|---|---|---|
| `rawBody` ว่าง | `400` | `"กรอกข้อความก่อนทดสอบ"` (เสนอ) |
| **ไม่ตรงวลีจุดชนวนเลย** | `200` | `{"matchedPhrase": null, "complete": false, "reasons": [], "detail": null}` — 🛑 **ไม่ใช่ error 4xx** เพราะเป็น**ผลลัพธ์ปกติของการทดสอบ** ("ข้อความนี้จะไม่ถูกดักจับ" มีประโยชน์เท่ากับผลอื่น) · ⚠️ **หน้าตา UI ของเคสนี้ยังไม่มีใน `UX-Design-Spec.md` — ต้องออกแบบเพิ่ม** |

### 4.5 `GET /api/seller/auto-order/channels/health`
**200:** `{ "channels":[{ "shopChannelId","pageName","provider","messageEchoesStatus","messageEchoesCheckedAt" }] }`
🛑 **อ่านค่าที่ cache ไว้ ไม่เรียก Graph สด** — การเรียกสดเกิดที่ §4.6 เท่านั้น (TFR-004) · ไม่มี error พิเศษนอกจาก 401/403 เดิม

### 4.6 `POST /api/seller/auto-order/channels/{shopChannelId}/repair`

🛑 **กติกาที่ต่อรองไม่ได้: GET ล้มหรือ field ไม่ครบ = ห้ามยิง POST เด็ดขาด**
`subscribed_fields` เป็น **replace ทั้งชุด** ⇒ ยิงด้วยชุดที่ไม่ครบ = **ถอด subscription ของฟีเจอร์อื่นทิ้งทั้งระบบ (ตอบกลับอัตโนมัติ/ตอบคอมเมนต์/แชตบอต) แบบเงียบ ไม่มี error ใด ๆ** — **ความเสียหายใหญ่กว่าปัญหาเดิมมาก**

**ลำดับภายใน — ห้ามมีทางลัด:**
1. `GET subscribed_apps?fields=subscribed_fields` → ต้องได้ 200 **และ** `subscribed_fields` เป็น array (ไม่ใช่ `undefined`/`null`)
2. ข้อ 1 ล้มไม่ว่ากรณีใด (network/timeout/shape ผิด) → 🛑 **หยุดทันที ไม่เรียก POST**
3. `newFields = dedupe([...existing, 'message_echoes'])`
4. `POST subscribed_apps?subscribed_fields={newFields.join(',')}`
5. เรียก `checkMessageEchoesHealth()` ซ้ำยืนยันผล → เขียนลง `ShopChannel`

**200:** `{ "shopChannelId", "messageEchoesStatus":"GRANTED", "messageEchoesCheckedAt" }`

| เงื่อนไข | HTTP | `error` |
|---|---|---|
| ข้อ 1 (GET) ล้ม | `502` | `"ตรวจสอบสิทธิ์ปัจจุบันของเพจไม่สำเร็จ — ลองใหม่อีกครั้ง"` — 🛑 **จงใจไม่บอกว่า "ซ่อมไม่สำเร็จ" เพราะยังไม่ถึงขั้นซ่อม คนละสาเหตุ** (เสนอ) |
| ข้อ 4 (POST) ล้มหลังข้อ 1 สำเร็จ | `502` | `"ซ่อมให้ \"{ชื่อเพจ}\" ไม่สำเร็จ"` — **ยึดจาก UX spec เป๊ะ** → client แสดง 2 ปุ่ม `ลองอีกครั้ง`/`ไปเชื่อมเพจใหม่` |
| `shopChannelId` ไม่ใช่ของร้านนี้ | `404` | `"ไม่พบเพจนี้"` (เสนอ) |

### 4.7 `POST /api/orders/{token}/auto-order/retry`
**Auth:** `canAccessShop` (ระดับดูก็กดได้ — **ไม่ใช่การแก้การตั้งค่าระดับร้าน**) · **ไม่มี body**

🛑 **Race ที่ต้องกันเสมอ — ห้ามมี 500 ดิบ** (คลาสเดียวกับที่ SRS TFR-024 เตือนเรื่องช่วงเวลาที่ผู้ใช้อ่านคำถามค้างอยู่):

| สถานะจริง ณ ขณะเรียก | HTTP | `error` / พฤติกรรม client |
|---|---|---|
| ไม่พบ `token` | `404` | `"ไม่พบคำสั่งซื้อนี้"` (**ยึดคำจาก `cancel/route.ts:84` ที่ระบบมีอยู่แล้ว**) |
| `status==='PENDING'` — **ถูกกู้เป็นออเดอร์จริงไปแล้ว** (อีกแท็บ/อีกคนกดก่อน) | `409` | `"รายการนี้ถูกดำเนินการไปแล้ว"` — 🛑 client ต้อง **redirect ไป `/orders/{token}` ทันที ไม่ใช่โชว์ error เฉย ๆ** (`token` เดิมใช้ได้ทั้ง 2 สถานะ) |
| `status==='CANCELLED'` — หมดอายุ/ถูกทิ้งแล้ว | `409` | `"ร่างนี้หมดอายุหรือถูกจัดการไปแล้ว"` → พาไป `/orders?stage=drafted` |
| กดถี่เกิน (cooldown ตาม `updatedAt`) | `429` | `"กำลังประมวลผลอยู่ — กรุณารอสักครู่"` |
| `DRAFTED` แต่เหตุผลไม่ใช่ `PROCESSING_FAILED` | `400` | `"ร่างนี้ไม่ได้อยู่ในสถานะที่ลองใหม่ได้"` |

**200:** `Order` ปัจจุบัน (อาจยัง `DRAFTED` ด้วยเหตุผลใหม่ หรือ `PENDING` ถ้ารอบนี้อ่านสำเร็จ)

> 🛑 **ช่องว่างที่พบระหว่างเขียน API — ยังไม่มีใน SDS §2/§3:**
> retry เดินเส้นทาง **automated pipeline** (🛑 **ห้าม Quick-Create** ตาม TFR-008) ⇒ **คนละกติกากับ `promoteDraftToOrder()`** ซึ่ง**อนุญาต** Quick-Create เพราะมนุษย์กรอกฟอร์มเอง (SDS §3.9 ขั้น 6)
> ⇒ ฟังก์ชันที่ retry เรียกตอน "อ่านสำเร็จรอบนี้" **ไม่ใช่ `promoteDraftToOrder()`** — ต้องเป็นเส้นทางที่ **ยึด `sourceChatMessageId` เดิม (UPDATE ไม่ใช่ INSERT)** แต่ **ตรวจสินค้าแบบ automated**
> **⇒ ต้องเพิ่มฟังก์ชันนี้เข้า SDS ก่อน implement — ยังไม่มีชื่อ ยังไม่มีที่อยู่**

### 4.8 `POST /api/orders/{token}/auto-order/discard`
reuse `cancelOrder(token, 'seller', DRAFT_DISCARD_REASON, actorUserId)` ตรง (ใช้ได้เพราะ `assertTransition` เพิ่ม `DRAFTED→CANCELLED` แล้ว TFR-019)
🛑 **`DRAFT_DISCARD_REASON` เป็น open question ใหม่** — **คนละค่ากับ `{{DRAFT_EXPIRE_REASON}}` ของ reaper** (*"ผู้ขายกดเอง" ≠ "ระบบหมดอายุ"*) · ต้องเพิ่มเข้า `CANCEL_REASONS_BY_VERTICAL` ก่อนใช้งานได้ (**ลำดับ deploy เดียวกับ §4.1**)
**Error:** โครงเดียวกับตาราง §4.7 เป๊ะ (404/409×2) ต่างแค่ 400: `"ร่างนี้ไม่ได้อยู่ในสถานะที่ทิ้งได้"` — **ไม่เขียนตารางซ้ำ**
**200:** `Order` (`status:'CANCELLED'`) + toast `"ทิ้งร่างแล้ว"` (Swal ยืนยันก่อนเรียก)

### 4.9 `GET /api/chat/conversations/{id}/messages` — แก้เพิ่ม (B2)
กรอง `type:{not:'AUTO_ORDER_RESULT'}` เมื่อผู้เรียกเป็น `BUYER` (TFR-022)
✅ **contract ภายนอกไม่เปลี่ยนแม้แต่ฟิลด์เดียว** — buyer เห็น `items.length` น้อยลงเมื่อห้องมีการ์ด **ไม่มี error ใหม่ ไม่มี field ใหม่**

### 4.10 `POST /api/channels/facebook/webhook` — แก้เพิ่ม (B5)
หลัง `ingestInboundMessage()` คืน `STORED` + `SHOP` → `after(detectAutoOrderTrigger(id))` (entry 2)
✅ **contract กับ Meta ไม่เปลี่ยนเลย** — ยังคืน `200` เสมอไม่ว่า detection สำเร็จ/ล้ม (**`after()` ทำงานหลังตอบ response แล้ว Meta ไม่รับรู้**)

### 4.11 `GET /api/cron/auto-order-sweeper`
**Auth:** `Authorization: Bearer ${CRON_SECRET}`
🛑 **Response ต้องสังเกตการณ์ได้จาก body เอง — Vercel plan นี้ query runtime log ย้อนหลังไม่ได้ ⇒ `console.log` ที่อ่านย้อนหลังไม่ได้มีค่าเท่ากับไม่มี**
```json
{ "ok": true, "watchdog": { "scanned": 42, "recovered": 1 }, "reaper": { "expired": 3 } }
```
`scanned` = แถวที่ผ่านเกณฑ์หน้าต่างเวลา (**สัญญาณว่า query แพงแค่ไหนต่อรอบ**) · `recovered` = ที่เขียน `PROCESSING_FAILED` จริง (**ควรน้อยมาก — สูงผิดปกติ = มีบั๊กที่ pipeline หลัก**) · `expired` = ร่างที่ reaper ปิด
⇒ **ตัวเลขเหล่านี้คือหลักฐานเดียวที่ตรวจสอบได้หลัง deploy** (curl ตรงด้วย `CRON_SECRET` เพื่อ debug ได้เสมอ)

---

## 5. Error Code Table (รวม)

> ระบบนี้ **ไม่มี error code ตัวอักษรแบบ template** — ใช้ข้อความไทยตรง ๆ ใน `{"error": …}`

| HTTP | ความหมายทั่วทั้งโมดูล |
|---|---|
| `400` | validation ล้ม / สถานะไม่ถูกต้องสำหรับ action นี้ |
| `401` | ไม่มี session — `"unauthorized"` (✅ 129 จุดทั่วระบบ) |
| `403` | ไม่มีสิทธิ์ (ไม่ใช่สมาชิกร้าน / ไม่ใช่ OWNER-ADMIN / vertical ผิด) |
| `404` | ไม่พบ resource |
| `409` | ชนกับสถานะปัจจุบัน (ร่างถูกกู้/หมดอายุไปแล้ว · สิทธิ์เพจยังไม่ผ่าน) |
| `429` | cooldown ของ retry |
| `502` | Meta Graph ล้ม (เฉพาะ §4.6) |

## 6. Sequence
ดู SDS §3.4 — ครอบ entry 1/2 → detect → เขียนผล/READING/reconcile แล้ว **ไม่วาดซ้ำ (HR16)**

## 7. Traceability

| Endpoint | SDS | BRD FR |
|---|---|---|
| 4.1 (reuse) | A7 §3.4 | FR-ACO-19 |
| 4.2–4.3 | A5 | FR-ACO-01/02 |
| 4.4 | A2, A6 | FR-ACO-09/10/13 |
| 4.5–4.6 | A9 | FR-ACO-05/27 |
| 4.7 | ⚠️ **A7 ส่วนที่ยังไม่ปิด** | FR-ACO-17 |
| 4.8 | `cancelOrder()` (กลุ่ม C) | FR-ACO-17 |
| 4.9 | B2 | FR-ACO-22 |
| 4.10 | B5 | FR-ACO-07 |
| 4.11 | A11 | FR-ACO-17/24 |

## 8. สรุป

**11 endpoint** (7 ใหม่ + cron + 3 ของเดิมที่ reuse/แก้เพิ่ม) — 🛑 **ยึด envelope แบนของระบบเดิมตลอดทั้งเอกสาร ไม่ใช้ template `{error:{code,…}}` เพื่อไม่ให้เอกสารโกหกตั้งแต่บรรทัดแรก**

**ช่องว่างที่เปิดอยู่ ต้องปิดก่อน implement:**
1. 🛑 **ฟังก์ชัน "retry ที่อ่านสำเร็จ" (§4.7) ยังไม่มีชื่อ/ที่อยู่ใน SDS** — คนละตัวจาก `promoteDraftToOrder()` เพราะกติกา Quick-Create ต่างกัน
2. **`DRAFT_DISCARD_REASON` (§4.8) = open question ใหม่** ต้องเพิ่มเข้า `CANCEL_REASONS_BY_VERTICAL` ก่อนใช้งาน
3. **UX copy ที่ยังไม่มี:** เคส "ไม่ตรงวลีเลย" ใน dry-test (§4.4) · error ของ test-threads (§4.3)
4. 🛑 **ลำดับ deploy บังคับ:** B6 (enum `DUPLICATE_ORDER` + `DRAFT_DISCARD_REASON`) **ต้องขึ้นก่อน**ปุ่มที่เรียก §4.1/§4.8 เสมอ

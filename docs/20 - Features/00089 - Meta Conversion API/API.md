---
title: "API — 00089 ส่งยอดขายและเหตุการณ์จากแชท Messenger กลับไปให้ Meta (Conversions API)"
owner: shinobu22
status: draft
created: 2026-11-11
tags: [feature, api, meta, capi]
related: ["[[SDS]]", "[[SRS]]", "[[BRD]]", "[[DATABASE]]"]
---

> **โมดูล:** 00089 - Meta Conversion API
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-11-11
> **สถานะ:** Draft — เขียนจาก route handlers ที่ implement แล้วบน working tree (ยังไม่ commit · ยังไม่ merge)
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: ส่งยอดขายและเหตุการณ์จากแชท Messenger กลับไปให้ Meta

---

## 1. Overview

API ชุดนี้มี 2 กลุ่ม — provider คือ Next.js route handlers ของ repo นี้ (Node/TypeScript · Prisma · PostgreSQL)

1. **API ตั้งค่า** `/api/shops/meta-capi/**` (9 เมธอด ใน 6 ไฟล์) — ผู้บริโภค = หน้า `settings/capis` (client component ผ่าน `capiApi()` ใน `components/shared.tsx`) · เจ้าของร้านเท่านั้น (capability `X9`)
2. **Cron** `/api/cron/meta-capi` — ผู้บริโภค = Vercel Cron (ทุก 1 นาที)

นอกจากนี้ระบบเรียก **Meta Graph API** (ขาออก) 3 แบบ — บันทึกไว้ในข้อ 6 เพื่อให้เห็นสัญญาปลายทาง

- **เอกสารออกแบบต้นทาง:** [[SDS]] (C-API · C-SET · C-CRON)
- **Base URL:** `https://seller.deepthailand.app` (dev `seller.deepth.local`) — path ขึ้นต้น `/api/shops/meta-capi`
- **Content-Type:** `application/json` (UTF-8)
- **Cache:** ทุก response ของกลุ่ม 1 ใส่ `Cache-Control: private, no-store, max-age=0, must-revalidate` (guard ใส่ `private, no-store`) · ทุก route `dynamic = "force-dynamic"`
- **Convention:** ใช้ `requireShopCapability(session, 'X9')` (ด่านกลาง `src/lib/shop-capability.ts`) · Valibot (`Capi*Schema` ใน `src/lib/validations.ts`) ตรวจรูปร่าง · service ตรวจความหมายซ้ำ · error ของฟีเจอร์เป็น `{ error: string, code: CapiErrorCode }` (ไม่ใช่โครง `error.{code,message}` ของ template)
- **ร้านที่ใช้:** ร้าน active ของ session เสมอ — ไม่มี `?shopId=` ใน API กลุ่มนี้

---

## 2. Authentication

| รายการ | ค่า |
|---|---|
| **วิธี (กลุ่ม 1)** | NextAuth session cookie ของโดเมน `seller.*` (JWT) |
| **Capability** | `X9` — `CAPABILITY_ROLES.X9 = [OWNER]` (เจ้าของเท่านั้น · PRD Q1) · ทะเบียนใน `src/lib/route-capabilities.ts` (`status: 'DECLARED'` ทุกไฟล์) |
| **การตรวจร้าน** | ทุกฟังก์ชัน service รับ `shopId` จาก session แล้วตรวจว่าเพจ/dataset เป็นของร้านนั้นจริง (query ใส่ `shopId` ใน `where` แรก) — ของร้านอื่น/ไม่ใช่ Messenger/เพจไม่ ACTIVE = `404 NOT_FOUND` (ไม่บอกว่ามีอยู่) |
| **ฟีเจอร์ปิด** | `isMetaCapiEnabled(shopId)` เป็นเท็จ = `404 FEATURE_DISABLED` ("ไม่พบหน้านี้") — ตรวจ **หลัง** ด่านสิทธิ์ (ผู้ที่ไม่ใช่เจ้าของจะได้ 403 ก่อน) |
| **วิธี (cron)** | `Authorization: Bearer ${CRON_SECRET}` — env ว่าง = `401` ทันที (ไม่เทียบกับ `Bearer undefined`) |
| **กรณีไม่ผ่าน** | `401 {error:"unauthorized"}` · `404 {error:"NO_SHOP"}` · `403 {error:"FORBIDDEN"}` (ไม่ใช่สมาชิก) · `403 {error:"FORBIDDEN_ROLE"}` (สมาชิกแต่ไม่ใช่เจ้าของ) |

---

## 3. Endpoint List

| Method | Path | คำอธิบาย |
|---|---|---|
| `GET` | `/api/shops/meta-capi` | รายการเพจ Messenger ที่ ACTIVE ของร้าน + สถานะส่ง + จำนวนส่งสำเร็จ 7 วัน |
| `GET` | `/api/shops/meta-capi/{channelId}` | ตั้งค่าเพจ + ตัวเลือกเหตุการณ์ + dataset (ไม่มี token) |
| `PUT` | `/api/shops/meta-capi/{channelId}` | บันทึกตั้งค่าเพจ (เปิด/ปิด · จังหวะ Purchase · นับร่าง · `eventOptions` แทนทั้งก้อน) |
| `POST` | `/api/shops/meta-capi/{channelId}/datasets` | เพิ่ม dataset (`PAGE` = ขอจาก Meta · `MANUAL` = กรอกเอง) |
| `PATCH` | `/api/shops/meta-capi/{channelId}/datasets/{datasetRowId}` | แก้ชื่อ / เหตุการณ์ที่เปิด / token (MANUAL) |
| `DELETE` | `/api/shops/meta-capi/{channelId}/datasets/{datasetRowId}` | ลบ dataset (แถวคิวหายตาม) |
| `POST` | `/api/shops/meta-capi/{channelId}/datasets/{datasetRowId}/test` | ปุ่มทดสอบ (ไม่เข้าคิว) |
| `POST` | `/api/shops/meta-capi/{channelId}/datasets/{datasetRowId}/resume` | ปลุก dataset แบบ `PAGE` ที่ `STOPPED` (ไม่เรียก Meta) |
| `GET` | `/api/shops/meta-capi/{channelId}/log` | บันทึกการส่ง ใหม่→เก่า แบ่งหน้าด้วย cursor |
| `GET` | `/api/cron/meta-capi` | ตัวส่งคิว + กวาด CartAbandoned + purge 180 วัน (ยกเลิกแล้ว 2026-11-14 — บันทึกการส่งเก็บถาวร ไม่ลบ) (Vercel Cron) |

---

## 4. Endpoint Detail

### 4.1 `GET /api/shops/meta-capi`

**Request:** ไม่มี param

**Response — 200**

| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `pages[]` | array | เพจ Messenger ที่ `status='ACTIVE'` ของร้าน เรียง `createdAt` ขึ้น |
| `pages[].channelId` | string | `ShopChannel.id` |
| `pages[].name` · `avatarUrl` | string · string\|null | |
| `pages[].setting` | object | `{ enabled, enabledAt: ISO\|null, purchaseAt, countPromotedDraft }` (ไม่มีแถว = `{false, null, "CREATE", true}`) |
| `pages[].datasets` | number | จำนวน dataset |
| `pages[].anyStopped` | boolean | มี dataset `STOPPED` อย่างน้อย 1 |
| `pages[].sent7d` | number | แถวคิว `SENT` ที่ `createdAt` ใน 7 วันล่าสุด |

**Error:** 401/403/404 (guard) · 404 `FEATURE_DISABLED` · 500

---

### 4.2 `GET /api/shops/meta-capi/{channelId}`

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|---|---|---|---|---|
| Path | `channelId` | string | yes | `ShopChannel.id` ของเพจ Messenger ที่ ACTIVE ของร้านนี้ |

**Response — 200**

| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `channelId` · `name` · `avatarUrl` | | |
| `setting` | object | `{ enabled, enabledAt, purchaseAt, countPromotedDraft }` |
| `eventOptions` | object | `{ [CapiEventKey]: { valueMode?, sendContents?, rules?: [{tagId, valueBaht?}] } }` |
| `datasets[]` | array | `{ id, datasetId, source: "PAGE"\|"MANUAL", label, events: string[], status: "ACTIVE"\|"STOPPED", stoppedReason, stoppedAt, hasToken }` · เรียง `createdAt` ขึ้น · 🛑 **ไม่มี `tokenEnc`** |

**Error:** 404 `NOT_FOUND` (เพจไม่ใช่ของร้าน/ไม่ใช่ Messenger/ไม่ ACTIVE) · 404 `FEATURE_DISABLED`

---

### 4.3 `PUT /api/shops/meta-capi/{channelId}`

บันทึกตั้งค่าเพจ (upsert แถว `MetaCapiPageSetting`) — ทุกฟิลด์ optional · **`eventOptions` แทนที่ทั้งก้อน** (ไม่ merge) · เปิดจากปิด (false→true) ตั้ง `enabledAt = now` ใหม่ (เหตุการณ์ก่อนหน้านั้นไม่ถูกส่ง) · บันทึกซ้ำขณะเปิดอยู่ไม่ขยับ `enabledAt`

**Request (Body)**

| ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|---|---|---|---|
| `enabled` | boolean | no | เปิด/ปิดการส่งของเพจ |
| `purchaseAt` | `"CREATE"\|"CONFIRM"\|"PAYMENT"` | no | จังหวะ Purchase |
| `countPromotedDraft` | boolean | no | นับออเดอร์ร่างที่ยืนยันเป็น "สร้างคำสั่งซื้อ" |
| `eventOptions` | record | no | คีย์ = `CapiEventKey` 1 ใน 12 (ไม่รู้จัก = 400) · ค่า = `{valueMode?: "NET"\|"NO_VAT", sendContents?: boolean, rules?: [{tagId: string ≤64, valueBaht?: number}]}` |

**กฎความหมาย (service — `sanitizeEventOptions`):** `rules` ใช้ได้เฉพาะ `LEAD_SUBMITTED`/`QUALIFIED_LEAD` · ≤20 กฎต่อเหตุการณ์ · `tagId` ต้องไม่ว่างและเป็นแท็กของร้านนี้ทุกตัว (`ShopTag` นับตรงกัน) · `valueBaht` จำนวนจำกัด 0–10,000,000 · ฟิลด์ที่ไม่รู้จักถูกตัดทิ้ง · ไม่ตรวจ `tagId` ซ้ำภายในเหตุการณ์เดียวกัน (UI กันให้)

**Response — 200:** `{ "setting": { enabled, enabledAt, purchaseAt, countPromotedDraft, eventOptions } }` (`eventOptions` = ค่าที่ล้างแล้วจากฐาน)

**Error:** 400 `INVALID_INPUT` (Valibot ไม่ผ่าน / `purchaseAt` ผิด / ไม่รู้จักเหตุการณ์ / กฎเกิน 20 / มูลค่านอกช่วง / **แท็กไม่ใช่ของร้านนี้**) · 404 `NOT_FOUND` · 404 `FEATURE_DISABLED`

**ตัวอย่าง**

```json
// Request
{ "enabled": true, "purchaseAt": "PAYMENT",
  "eventOptions": { "PURCHASE": { "valueMode": "NO_VAT", "sendContents": true },
                    "QUALIFIED_LEAD": { "rules": [{ "tagId": "<ShopTag.id>", "valueBaht": 200 }] } } }

// Response 200
{ "setting": { "enabled": true, "enabledAt": "2026-11-11T05:00:00.000Z", "purchaseAt": "PAYMENT",
               "countPromotedDraft": true,
               "eventOptions": { "PURCHASE": { "valueMode": "NO_VAT", "sendContents": true },
                                 "QUALIFIED_LEAD": { "rules": [{ "tagId": "<ShopTag.id>", "valueBaht": 200 }] } } } }
```

---

### 4.4 `POST /api/shops/meta-capi/{channelId}/datasets`

เพิ่ม dataset (สูงสุด 3 ต่อเพจ · นับแล้วค่อยสร้างโดยไม่ล็อก — กดพร้อมกันสองคำขออาจเกิน 3 ได้ในเสี้ยววินาที ยอมรับเพราะเจ้าของคนเดียว)

**Request (Body)**

| ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|---|---|---|---|
| `source` | `"PAGE"\|"MANUAL"` | yes | |
| `datasetId` | string ≤32 | MANUAL | ต้องตรง `^\d{1,32}$` |
| `token` | string ≤512 | MANUAL | ไม่ว่าง · ไม่มีช่องว่าง · เก็บเข้ารหัส · ไม่ส่งกลับ |
| `label` | string ≤60 \| null | no | ชื่อเรียก |
| `events` | string[] | no | รายการ `CapiEventKey` · ไม่ส่ง = `["PURCHASE"]` · คีย์นอกรายการ = 400 |

**พฤติกรรม `source:"PAGE"`:** ถอดรหัส token เพจ → `POST {GRAPH_BASE}/{pageId}/dataset` body `{}` → ต้องได้ `id` เป็นตัวเลข → สร้างแถว · เพจมี dataset อยู่แล้ว Meta คืน id เดิม → ถ้าเพจนี้ในระบบมี id นั้นแล้ว = `DATASET_DUPLICATE`

**Response — 201:** `{ "dataset": { id, datasetId, source, label, events, status, stoppedReason, stoppedAt, hasToken } }`

**Error:** 400 `INVALID_INPUT` · 400 `TOKEN_REQUIRED` · 400 `PAGE_EVENTS_PERMISSION` (token เพจถอดไม่ได้ หรือ Meta ตอบกลุ่ม STOP — ยังไม่มีสิทธิ์ `page_events`) · 400 `META_ERROR` (Meta error อื่น/ไม่ตอบ/id ผิดรูป) · 404 `NOT_FOUND` · 409 `DATASET_LIMIT` · 409 `DATASET_DUPLICATE` (`(shopChannelId, datasetId)` ซ้ำ — P2002)

---

### 4.5 `PATCH /api/shops/meta-capi/{channelId}/datasets/{datasetRowId}`

**Request (Body — ทุกฟิลด์ optional)**

| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `label` | string ≤60 \| null | ว่าง = null |
| `events` | string[] | **แทนที่ทั้งชุด** · คีย์นอก 12 ค่า = 400 · ซ้ำถูกยุบ |
| `token` | string ≤512 | เฉพาะ `source=MANUAL` (PAGE = 400 `INVALID_INPUT`) · ไม่ว่าง ไม่มีช่องว่าง · **ตั้ง `status=ACTIVE`, ล้าง `stoppedReason`/`stoppedAt`** (ลองส่งต่อทันที) · ไม่ตรวจ token กับ Meta ตอนบันทึก |

**Response — 200:** `{ "dataset": {…} }` · **Error:** 400 `INVALID_INPUT` · 404 `NOT_FOUND` (เพจหรือ dataset ไม่ใช่ของร้าน/เพจนี้) · 404 `FEATURE_DISABLED`

---

### 4.6 `DELETE /api/shops/meta-capi/{channelId}/datasets/{datasetRowId}`

ลบ dataset — แถว `MetaCapiEvent` ของมันหายตาม (Cascade) · dataset อื่นไม่กระทบ (คีย์กันซ้ำเป็นต่อ dataset)

**Response — 200:** `{ "ok": true }` · **Error:** 404 `NOT_FOUND` · 404 `FEATURE_DISABLED`

---

### 4.7 `POST /api/shops/meta-capi/{channelId}/datasets/{datasetRowId}/test`

ปุ่มทดสอบ — **ไม่เข้าคิว ไม่เขียน `MetaCapiEvent` ไม่ใช้คีย์กันซ้ำของเหตุการณ์จริง** · Test Event Code ไม่ถูกเก็บ (TD-010)

**Request (Body)**

| ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|---|---|---|---|
| `testEventCode` | string 1–64 | no | มี = ส่ง Purchase ฿1 ไป Test Events · ไม่มี = ตรวจ token อย่างเดียว (ส่ง `{}` ได้) |

**พฤติกรรม**
- **มี code:** หา `ExternalContact` ของห้อง Messenger ล่าสุด (`lastMessageAt`) ของเพจนั้น → ส่ง `Purchase` `value=1` THB ด้วย `page_id` + PSID ห้องนั้น + `test_event_code` ไปที่ `POST {GRAPH_BASE}/{datasetId}/events` · สำเร็จเมื่อ `classifySendResult = OK` (`events_received ≥ 1`)
- **ไม่มี code:** `GET {GRAPH_BASE}/{datasetId}?fields=id` · 2xx = `ok:true` · รหัส 190/102 = `ok:false` · รหัสสิทธิ์อื่นกลุ่ม STOP = `ok:true, unverified:true` ("ตรวจ token ไม่ได้…แต่อาจส่งเหตุการณ์ได้") · อื่น ๆ = `ok:false`

**Response — 200** (แม้ `ok:false` ก็ตอบ 200)

| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `ok` | boolean | |
| `unverified` | boolean? | เฉพาะกรณีอ่านโหนดไม่ได้เพราะสิทธิ์ |
| `eventsReceived` | number? | เฉพาะส่งเหตุการณ์ทดสอบสำเร็จ |
| `message` | string | ข้อความไทยแสดงผู้ใช้ |

**Error:** 400 `NO_CONVERSATION` (มี code แต่เพจไม่มีห้อง Messenger) · 400 `META_ERROR` (ถอดรหัส token ไม่ได้) · 400 `INVALID_INPUT` (code ว่าง/ยาวเกิน) · 404 `NOT_FOUND`

```json
// Request
{ "testEventCode": "TEST12345" }
// Response 200
{ "ok": true, "eventsReceived": 1, "message": "ส่งสำเร็จ — ดูผลในแท็บ Test Events ของ Events Manager" }
```

---

### 4.8 `POST /api/shops/meta-capi/{channelId}/datasets/{datasetRowId}/resume`

ปลุก dataset แบบ `PAGE` ที่ `STOPPED` → `ACTIVE` (ล้าง `stoppedReason`/`stoppedAt`) **โดยไม่เรียก Meta** — ถ้ายังไม่มีสิทธิ์จริง ตัวส่งจะหยุดอีกครั้งเอง · dataset `MANUAL` ใช้ไม่ได้ (ต้อง `PATCH` token ใหม่) · ⚠ UI ปัจจุบันไม่มีปุ่มเรียก endpoint นี้ (ทางที่ UI ใช้คือ "เชื่อมเพจใหม่" ซึ่ง `upsertChannel` ปลุกให้เอง)

**Response — 200:** `{ "dataset": {…} }` · **Error:** 400 `INVALID_INPUT` ("dataset แบบกรอกเองต้องใส่ token ใหม่") · 404 `NOT_FOUND`

---

### 4.9 `GET /api/shops/meta-capi/{channelId}/log`

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|---|---|---|---|---|
| Query | `status` | `PENDING\|SENT\|FAILED\|SKIPPED` | no | ตัวกรอง |
| Query | `eventKey` | `CapiEventKey` | no | ตัวกรอง (หน้า UI ใช้พารามิเตอร์ `?event=` ที่ URL หน้า แต่เรียก API ด้วย `eventKey`) |
| Query | `cursor` | string ≤64 | no | `nextCursor` ของหน้าก่อน (id แถวสุดท้าย) |
| Query | `take` | string `^\d{1,3}$` | no | ค่าเริ่มต้น 20 · บีบให้อยู่ 1–50 |

**Response — 200**

| ฟิลด์ | ชนิด | คำอธิบาย |
|---|---|---|
| `rows[]` | array | `{ id, createdAt, eventKey, datasetLabel, datasetId, value: number\|null, status, reason, attempts }` เรียง `createdAt desc, id desc` |
| `nextCursor` | string\|null | null = หมดแล้ว |

🛑 ไม่ส่ง `psid` · `lastRequest` · `lastResponse` ออกมา (ข้อมูลลูกค้า/ดิบ)

**Error:** 400 `INVALID_INPUT` (query ผิด) · 404 `NOT_FOUND` · 404 `FEATURE_DISABLED`

---

### 4.10 `GET /api/cron/meta-capi`

เรียกโดย Vercel Cron ทุก 1 นาที · `maxDuration = 60` · ลำดับ: `sweepMetaCapi()` → `sweepCartAbandoned()` (try/catch แยก) → `purgeOldMetaCapiEvents()`

**Response — 200:** `{ "ok": true, "sent": n, "failed": n, "retried": n, "stopped": n, "skipped": n, "cartAbandoned": n | "error", "purged": n }` · **Error:** 401 `{error:"unauthorized"}` (ไม่มี/ผิด `CRON_SECRET` หรือ env ว่าง)

> export เฉพาะ `GET` (ไม่มี `POST` สำหรับ trigger มือ — ต่างจากข้อแนะนำใน SRS 7.20 ของ cron อื่นบางตัว)

---

## 5. Error Code Table

| Error Code | HTTP | ความหมาย / เงื่อนไข |
|---|---|---|
| `INVALID_INPUT` | 400 | รูปร่าง/ค่าผิด (Valibot หรือ service) · ข้อความไทยอยู่ใน `error` |
| `TOKEN_REQUIRED` | 400 | `source=MANUAL` แต่ token ว่าง |
| `NO_CONVERSATION` | 400 | ปุ่มทดสอบแบบมี code แต่เพจไม่มีห้อง Messenger |
| `PAGE_EVENTS_PERMISSION` | 400 | token เพจถอดไม่ได้ / Meta ตอบกลุ่ม STOP ตอนขอ dataset (ยังไม่มีสิทธิ์ `page_events`) |
| `META_ERROR` | 400 | Meta error อื่น · ไม่ตอบ · Dataset ID ผิดรูป · ถอดรหัส token ไม่ได้ |
| `NOT_FOUND` | 404 | เพจ/dataset ไม่ใช่ของร้านนี้ · ไม่ใช่ Messenger · เพจไม่ ACTIVE |
| `FEATURE_DISABLED` | 404 | `OPEN_META_CAPI` ไม่เปิด / ร้านนอกรายชื่อทดลอง (ข้อความ "ไม่พบหน้านี้") |
| `DATASET_LIMIT` | 409 | มี dataset ครบ 3 ตัวแล้ว |
| `DATASET_DUPLICATE` | 409 | เพจนี้มี Dataset ID นี้แล้ว |
| *(guard)* `unauthorized` | 401 | ไม่มี session |
| *(guard)* `NO_SHOP` | 404 | ไม่มีร้านที่ active |
| *(guard)* `FORBIDDEN` | 403 | ไม่ใช่สมาชิกร้าน |
| *(guard)* `FORBIDDEN_ROLE` | 403 | สมาชิกแต่ไม่ใช่เจ้าของ (ไม่มี X9) |
| *(ไม่มี code)* | 500 | `{ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }` · `console.error("[meta-capi api]", message)` ไม่ log body/token |

**โครง error response ของฟีเจอร์นี้**

```json
{ "error": "เพิ่ม dataset ได้สูงสุด 3 ตัวต่อเพจ", "code": "DATASET_LIMIT" }
```

(แมป code→HTTP อยู่ใน `STATUS: Record<CapiErrorCode, number>` ของ `route-helpers.ts` — เพิ่ม code ใหม่แล้วลืมแมป = tsc แดง)

---

## 6. Sequence — ปลายทาง Meta (ขาออก)

| # | เรียกเมื่อ | Request | ผลที่ใช้ |
|---|---|---|---|
| 1 | ตัวส่ง (cron) · ปุ่มทดสอบแบบมี code | `POST {GRAPH_BASE}/{datasetId}/events` · `Authorization: Bearer <token>` · body ด้านล่าง | `2xx ∧ events_received ≥ 1` = สำเร็จ |
| 2 | เพิ่ม dataset `PAGE` | `POST {GRAPH_BASE}/{pageId}/dataset` · Bearer token เพจ · body `{}` | `{ id }` |
| 3 | ปุ่มทดสอบแบบไม่มี code | `GET {GRAPH_BASE}/{datasetId}?fields=id` · Bearer token | 2xx = token ใช้ได้ |

`GRAPH_BASE = https://graph.facebook.com/v21.0` · token ส่งผ่าน header เท่านั้น (ไม่อยู่ใน body/URL/log)

**Body ของ (1) — `buildCapiBody`** (ตัวตนลูกค้า = `page_id` + PSID เท่านั้น ไม่ส่งเบอร์/อีเมล/ชื่อ)

```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1794372000,
    "event_id": "purchase:<orderId>",
    "action_source": "business_messaging",
    "messaging_channel": "messenger",
    "user_data": { "page_id": "<pageId>", "page_scoped_user_id": "<psid>" },
    "custom_data": {
      "currency": "THB", "value": 1000.00, "order_id": "<orderId>",
      "num_items": 2,
      "contents": [{ "id": "<productId|itemId>", "quantity": 2, "item_price": 500.00 }]
    }
  }],
  "test_event_code": "TEST12345"
}
```

- `event_id` = `dedupeKey` ของแถว (เฉพาะตัวส่งจริง · ปุ่มทดสอบไม่ใส่) · `test_event_code` มีเฉพาะปุ่มทดสอบ
- `custom_data` ไม่มีเมื่อเหตุการณ์ไม่มียอด (เช่น InitiateCheckout · Lead ที่ไม่ระบุมูลค่า)
- `contents`/`num_items` มีเมื่อ payload มี `items` · เกิน 100 รายการ = ไม่แนบ `contents` (ยังแนบ `num_items`/`order_id`)
- ยอดปัด 2 ตำแหน่ง · `event_time` = วินาทีของเวลาที่เกิดเหตุการณ์

**การจัดประเภทผล (`classifySendResult`)**

| ผล | เงื่อนไข |
|---|---|
| `OK` | 2xx ∧ `events_received ≥ 1` |
| `FAIL` | 2xx แต่ `events_received < 1`/ไม่มี · หรือ 4xx อื่นที่ไม่เข้ากลุ่มข้างล่าง (รวม `code 100` ที่ไม่ใช่ Missing Permission) |
| `STOP` | `error.code` ∈ {190, 102, 10} หรือ 200–299 หรือ (100 ∧ message ตรง `/missing permission/i`) |
| `RETRY` | `error.code` ∈ {1, 2, 4, 17, 32, 341, 613, 80004} หรือ HTTP 429 / ≥500 / 0 (ต่อไม่ติด) |

(ลำดับตัดสิน: 2xx → STOP → Missing-Permission → RETRY-code → HTTP-retry → FAIL)

---

## 7. Traceability

| Endpoint | SDS Component / Decision | BRD FR |
|---|---|---|
| `GET /api/shops/meta-capi` | C-API · C-SET (`listCapiPages`) | FR-002 · FR-013 |
| `GET/PUT …/{channelId}` | C-SET (`getCapiPage`/`updateCapiPage`) · TD-003 | FR-002 · FR-005 · FR-006 · FR-007 · FR-010 |
| `POST …/datasets` | C-SET (`addCapiDataset`) · TD-002 · Flow 4.4 | FR-003 |
| `PATCH/DELETE …/datasets/{id}` | C-SET · TD-004 | FR-003 · FR-005 · FR-012 |
| `POST …/test` | C-SET (`testCapiDataset`) · TD-010 | FR-004 |
| `POST …/resume` | C-SET (`resumeCapiDataset`) · C-RESUME · TD-004 | FR-012 |
| `GET …/log` | C-SET (`listCapiLog`) | FR-013 |
| `GET /api/cron/meta-capi` | C-CRON · C-SWEEP · TD-007 · Flow 4.1 | FR-009 (CartAbandoned) · FR-011 · FR-012 |
| *(ขาออก)* Meta Graph ×3 | C-SWEEP · C-SET · TD-011 | FR-003 · FR-004 · FR-011 |

---

## 8. สรุป (Summary)

API Contract นี้กำหนดสัญญาของ **9 เมธอดตั้งค่า + 1 cron** และปลายทาง Meta 3 แบบ โดย error ของฟีเจอร์ใช้โครง `{error, code}` ที่ map code→HTTP ใน `route-helpers.ts` และสิทธิ์ทั้งหมดเป็น `X9` (เจ้าของเท่านั้น)

**Open Questions:**
- ควรเพิ่ม `POST` ให้ cron (manual trigger) ตามแนวทางที่ SRS 7.20 บันทึกไว้หรือไม่ — ปัจจุบันมีเฉพาะ `GET`
- UI ยังไม่เรียก `…/resume` — จะเพิ่มปุ่ม "ให้ส่งต่อ" หรือถอด endpoint

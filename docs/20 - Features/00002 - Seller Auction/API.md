---
title: "API Contract — Seller Auction + Realtime Bidding"
owner: safepay-planner
status: draft
version: "1.0"
created: 2026-07-01
module: M00002-SellerAuction
tags: [feature, auction, api, realtime, bidding]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[DATABASE]]", "[[UI-DESIGN-SPEC]]"]
---

> **โมดูล:** M00002-SellerAuction
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-01
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA (safepay-planner) — ดู [[Feature-Docs-Ownership]]

# API Contract: Seller Auction + Realtime Bidding (M00002)

---

## 1. Overview

API ชุดนี้รองรับฟีเจอร์ **Seller Auction + Realtime Bidding** ตาม [[SRS]] §4 — ประกอบด้วย 2 กลุ่ม provider ที่ auth คนละแบบแต่ใช้ service layer ร่วมกัน (`src/services/auction.service.ts`):

1. **Seller Auction API** (`/api/seller/auctions/**`) — **ใหม่ทั้งหมด** ยังไม่มีไฟล์อยู่จริงในโค้ด (ยืนยันแล้วว่าไม่มี `src/app/api/seller/auctions/` — Glob คืนค่าว่าง) ให้บริการ Paces seller web (`src/app/(paces)/seller/auctions/**`), auth ด้วย NextAuth session (httpOnly cookie)
2. **Buyer Auction API** (`/api/app/auctions/**`) — **มีอยู่แล้ว ต้องขยาย** (`browse`/`top`/`[id]`/`bid`/`settle`) + เพิ่มใหม่ (`buy-now`, `watch`) ให้บริการ Deep-App (Expo mobile), auth ด้วย HMAC Bearer token
3. **เอกสารออกแบบต้นทาง:** [[SRS]] §3 (TFR-001~017) และ §4 (Interface/API Specification) — ทุก endpoint ในเอกสารนี้ trace กลับ TFR ได้ (ดู §10 Traceability)

- **Base URL (seller):** `https://{seller subdomain}/api/seller` (dev: `https://seller.deepth.local/api/seller`, prod: `https://seller.deepthailand.app/api/seller`)
- **Base URL (buyer app):** `https://deepthailand.app/api/app` (unified — ไม่แยก subdomain ตาม `docs/buyer-app-api.md`)
- **Content-Type:** `application/json` (ยกเว้น upload endpoint เดิมที่ไม่เกี่ยวกับ auction)
- **Convention:** ตาม `docs/buyer-app-api.md` — error shape `{ error: string }` เดียวกันทั้งฝั่ง seller และ buyer (ไม่ใช้ envelope `{ data, meta }` แบบ template ทั่วไป — ยึด convention จริงของโปรเจกต์)

---

## 2. Authentication

โปรเจกต์นี้มี auth 2 scheme คนละ mechanism สำหรับ 2 กลุ่ม endpoint — **ห้ามผสม pattern ข้ามกลุ่ม**

### 2.1 Seller Auction API (`/api/seller/auctions/**`)

| รายการ | ค่า |
|--------|-----|
| **วิธี (Auth Method)** | NextAuth.js v4 session (seller subdomain cookie) |
| **วิธีตรวจใน route** | `getServerSession(authOptions)` (pattern เดียวกับ `src/app/api/orders/[token]/send-sms/route.ts`) |
| **Ownership guard** | scope ที่ WHERE clause เสมอ — `prisma.auction.findFirst({ where: { id, shop: { userId: session.user.id } } })` ไม่ใช่ `findUnique` + post-check (กัน RSC/API PII leak ตาม `feedback_rsc_dal_authz`) |
| **L2 guard (เฉพาะ create)** | `getMaxVerificationLevel(userId) >= 2` (reuse `verification.service.ts` ตรง ๆ) |
| **CSRF** | ผ่าน `guardApi` ใน `src/proxy.ts` — Origin-check ทุก mutation (POST/PATCH), allowlist `*.deepthailand.app` / dev `*.deepth.local` |
| **Rate-limit** | `guardApi` per-IP: auth 30 req/min (known-gap: per-instance บน Vercel — ดู [[SRS]] §7.1 R-SRS-7) |
| **กรณีไม่ผ่าน session** | `401 { "error": "ไม่ได้เข้าสู่ระบบ" }` |
| **กรณีไม่ผ่าน ownership** | `403` (ส่วนใหญ่) หรือ `404` (เฉพาะ `GET /[id]` — ดูหมายเหตุ §4.3) |
| **กรณีไม่ผ่าน L2** | `403 { "error": "ต้องยืนยันตัวตนระดับ L2 ก่อนเปิดประมูล" }` |

### 2.2 Buyer Auction API (`/api/app/auctions/**`)

| รายการ | ค่า |
|--------|-----|
| **วิธี (Auth Method)** | HMAC Bearer token (คนละ mechanism จาก NextAuth) |
| **Header** | `Authorization: Bearer <token>` |
| **Token ที่มา** | `signAppToken(userId)` เซ็นด้วย `NEXTAUTH_SECRET` (`src/lib/app-token.ts`) — ออกตอน `POST /api/app/auth/verify-otp` |
| **วิธีตรวจใน route** | `requireAppUser(request)` (`src/lib/app-auth.ts`) — คืน `{ user }` หรือ `{ response: 401 }` |
| **Endpoint ที่ไม่ต้อง auth** | `browse`, `top`, `GET [id]`, `settle` (public by design — ดู §6 หมายเหตุ idempotency) |
| **CSRF** | `/api/app/*` exempt จาก Origin-check ทั้งหมด (มือถือไม่มี Origin header) — auth พึ่ง Bearer แทน |
| **Rate-limit** | unauth 100 req/min ต่อ IP, auth 30 req/min (เหมือนฝั่ง seller) |
| **กรณีไม่ผ่าน** | `401 { "error": "ไม่ได้เข้าสู่ระบบ" }` (`appError()` helper) |

---

## 3. Endpoint List

### Seller (ใหม่ทั้งหมด — NextAuth session)

| Method | Path | คำอธิบาย | สถานะ |
|--------|------|----------|-------|
| POST | `/api/seller/auctions` | สร้าง auction (draft / publish now / schedule) | ใหม่ |
| GET | `/api/seller/auctions` | รายการ auction ของร้านตัวเอง (`?status=&page=`) | ใหม่ |
| GET | `/api/seller/auctions/[id]` | รายละเอียด + bid history + `reservePrice`/`expectedPrice` | ใหม่ |
| PATCH | `/api/seller/auctions/[id]` | แก้ไข (เฉพาะ draft/scheduled) | ใหม่ |
| POST | `/api/seller/auctions/[id]/publish` | เปลี่ยน draft → live/scheduled | ใหม่ |
| POST | `/api/seller/auctions/[id]/cancel` | ยกเลิก | ใหม่ |
| POST | `/api/seller/auctions/[id]/end-early` | จบประมูลก่อนเวลา (FR-AUC-12) | ใหม่ |

### Buyer (`/api/app/*` — HMAC Bearer)

| Method | Path | คำอธิบาย | สถานะ |
|--------|------|----------|-------|
| GET | `/api/app/auctions/browse` | เพิ่ม lazy `flipScheduledToLive` + field ใหม่ใน DTO | ขยาย |
| GET | `/api/app/auctions/top` | เหมือนเดิม (status='live' เท่านั้น) | คงเดิม |
| GET | `/api/app/auctions/[id]` | เพิ่ม `hasReserve`/`buyNowPrice`/`antiSnipeCount`/`description` | ขยาย |
| POST | `/api/app/auctions/[id]/bid` | เพิ่ม self-bid block, anti-snipe hook, conditional-update fix | ขยาย (bug fix) |
| POST | `/api/app/auctions/[id]/buy-now` | ซื้อทันที (FR-AUC-07) | ใหม่ |
| POST | `/api/app/auctions/[id]/settle` | เหมือนเดิม (idempotent, ไม่ auth) | คงเดิม |

### Supporting (นอกขอบเขต FR-AUC เลขตรง — ดู §11 pending)

| Method | Path | คำอธิบาย | สถานะ |
|--------|------|----------|-------|
| POST | `/api/app/auctions/[id]/watch` | เพิ่ม/สลับ watchlist (upsert `WatchList`) | ใหม่ (pending scope confirm) |
| DELETE | `/api/app/auctions/[id]/watch` | เอาออกจาก watchlist | ใหม่ (pending scope confirm) |

---

## 4. Endpoint Detail

### 4.1 `POST /api/seller/auctions`

สร้าง auction ใหม่ — สถานะเริ่มต้นขึ้นกับ `mode` ([[SRS]] TFR-001)

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Body | `title` | `string` | ✅ | |
| Body | `description` | `string?` | – | |
| Body | `images` | `string[]` | ✅ | อย่างน้อย 1 URL |
| Body | `category` | `string?` | – | |
| Body | `productId` | `string?` | – | |
| Body | `startPrice` | `number` | ✅ | `> 0` |
| Body | `reservePrice` | `number?` | – | ถ้ามีต้อง `>= startPrice` |
| Body | `buyNowPrice` | `number?` | – | ถ้ามีต้อง `> reservePrice ?? startPrice` |
| Body | `expectedPrice` | `number?` | – | ถ้ามีต้อง `> 0` (seller-only indicator, ไม่มีผลต่อ logic) |
| Body | `bidIncrement` | `number` | ✅ | `> 0` |
| Body | `mode` | `'draft' \| 'publishNow' \| 'schedule'` | ✅ | กำหนด `status` เริ่มต้น |
| Body | `startTime` | `ISO datetime?` | เงื่อนไข | บังคับถ้า `mode==='schedule'`; ต้อง `> now()` และ `< endTime` |
| Body | `endTime` | `ISO datetime` | ✅ | `>= now() + 30 min` |

**ห้ามรับ `shopId` จาก body** — derive จาก session เสมอ (FR-AUC-01-AC-09, กัน seller สร้าง auction ให้ shop อื่น)

**Response — Success (201)**

`SellerAuctionDTO` (ดู §9)

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `400` | validation fail ตาม [[SRS]] §5.4 (ดูตาราง) |
| `401` | ไม่มี session |
| `403` | ไม่มี Shop (ยัง onboarding ไม่เสร็จ) หรือ L2 < 2 (`"ต้องยืนยันตัวตนระดับ L2 ก่อนเปิดประมูล"`) |
| `404` | shop ไม่พบ (edge case — session valid แต่ shop ถูกลบ) |

> **Pending decision ([[SRS]] §11 Q7):** ถ้า `mode==='schedule'` แต่ `startTime` เป็นอดีต/ปัจจุบัน — SRS แนะนำ `400` ชัดเจน (ไม่ auto-fallback) แต่ยังไม่ sign-off — ต้อง confirm ก่อน implement

**ตัวอย่าง**

```bash
curl -X POST https://seller.deepthailand.app/api/seller/auctions \
  -H "Content-Type: application/json" -H "Cookie: <session-cookie>" \
  -d '{
    "title": "พระสมเด็จวัดระฆัง",
    "images": ["https://.../1.jpg"],
    "startPrice": 5000,
    "reservePrice": 8000,
    "buyNowPrice": 20000,
    "expectedPrice": 12000,
    "bidIncrement": 500,
    "mode": "publishNow",
    "endTime": "2026-07-05T12:00:00+07:00"
  }'
```

```json
// 201
{
  "id": "auc_01H...",
  "title": "พระสมเด็จวัดระฆัง",
  "description": null,
  "currentPrice": 5000,
  "bidIncrement": 500,
  "startTimeMs": null,
  "endTimeMs": 1783483200000,
  "bidCount": 0,
  "antiSnipeCount": 0,
  "hasReserve": true,
  "buyNowPrice": 20000,
  "shopId": "shop_01H...",
  "category": null,
  "status": "live",
  "reservePrice": 8000,
  "expectedPrice": 12000,
  "cancelledAt": null,
  "bidHistory": []
}
```

---

### 4.2 `GET /api/seller/auctions`

รายการ auction ของร้านตัวเอง (TFR-004)

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Query | `status` | `Auction.status?` | – | ค่าเดียว, ไม่ระบุ = ทั้งหมด |
| Query | `page` | `int?` | – | default 1, offset pagination, `take=20` |

Query scope: `WHERE shopId = <derived from session>` เสมอ (ไม่ post-filter) เรียก `flipScheduledToLive()` lazy ก่อน query

**Response — Success (200)**

```ts
{ items: SellerAuctionListItemDTO[]; hasNext: boolean }
```

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `401` | ไม่มี session |

---

### 4.3 `GET /api/seller/auctions/[id]`

รายละเอียด + bid history + `reservePrice`/`expectedPrice` (TFR-011)

**Request** — Path Param `id: string` (required)

**Response — Success (200)**: `SellerAuctionDTO` (`bidHistory` top 20, `displayName` เท่านั้น — ไม่มี phone/email)

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `401` | ไม่มี session |
| `404` | ไม่พบ auction **หรือ** auction ไม่ใช่ของร้านตัวเอง — **ตั้งใจคืน 404 ไม่ใช่ 403** เพื่อไม่บอกว่า id นั้นมีอยู่จริงไหม (TFR-011 ระบุชัด) |

> ⚠️ ต่างจาก endpoint อื่น (`PATCH`/`cancel`/`end-early`) ที่คืน `403` เมื่อไม่ใช่เจ้าของ — ความไม่สม่ำเสมอนี้เป็นไปตาม [[SRS]] ตรงตัว ไม่ใช่ typo

---

### 4.4 `PATCH /api/seller/auctions/[id]`

แก้ไข auction (TFR-002) — เฉพาะ `status IN ('draft','scheduled')`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path | `id` | `string` | ✅ | |
| Body | `title` | `string?` | – | ยืนยันแล้วแก้ได้ |
| Body | `description` | `string?` | – | ยืนยันแล้วแก้ได้ |
| Body | `images` | `string[]?` | – | ยืนยันแล้วแก้ได้ |
| Body | `bidIncrement` | `number?` | – | ยืนยันแล้วแก้ได้, `> 0` |
| Body | `endTime` | `ISO datetime?` | – | ยืนยันแล้วแก้ได้ — revalidate `>= now+30min` และ `startTime < endTime` ถ้ามี |
| Body | `category` | `string?` | – | ยืนยันแล้วแก้ได้ |
| Body | `productId` | `string?` | – | ยืนยันแล้วแก้ได้ |
| Body | `startPrice`/`reservePrice`/`buyNowPrice`/`expectedPrice` | `number?` | – | **⚠️ pending confirm** — [[SRS]] §11 Q1: BRD AC ไม่ระบุชัดว่าแก้ได้ SRS สมมติว่าแก้ได้ (validation เดิมซ้ำ) — **ต้อง user/product confirm ก่อน implement** |

**Response — Success (200)**: `SellerAuctionDTO` (updated)

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `400` | validation fail (field ที่ส่งมาไม่ผ่านกฎ §5.4 เดิม) |
| `401` | ไม่มี session |
| `403` | ไม่ใช่เจ้าของ |
| `409` | `status NOT IN ('draft','scheduled')` (`"ไม่สามารถแก้ไข auction ที่เปิดรับ bid แล้ว"`) — re-check ที่ DB จริง ไม่เชื่อ client state |

---

### 4.5 `POST /api/seller/auctions/[id]/publish`

เปลี่ยน draft → live/scheduled (TFR-001 ต่อเนื่อง — [[SRS]] §4.1 ระบุ path เท่านั้น ไม่มี body schema)

**Request** (⚠️ **pending confirm** — schema ด้านล่างเสนอโดย planner ให้สอดคล้องกับ `mode` logic ของ create/TFR-001 เดิม ยังไม่ sign-off ใน SRS)

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path | `id` | `string` | ✅ | |
| Body | `mode` | `'publishNow' \| 'schedule'` | ✅ (เสนอ) | |
| Body | `startTime` | `ISO datetime?` | เงื่อนไข (เสนอ) | บังคับถ้า `mode==='schedule'` |

**Response — Success (200)**: `SellerAuctionDTO` (updated status)

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `401` | ไม่มี session |
| `403` | ไม่ใช่เจ้าของ |
| `404` | ไม่พบ |
| `409` | `status !== 'draft'` (เสนอ — pending confirm) |

---

### 4.6 `POST /api/seller/auctions/[id]/cancel`

ยกเลิก auction (TFR-003)

**Request** — Path Param `id` เท่านั้น ไม่รับ body

**Response — Success (200)**: `SellerAuctionDTO` (`status='cancelled'`, `cancelledAt` set)

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `401` | ไม่มี session |
| `403` | ไม่ใช่เจ้าของ |
| `409` | `live` และ `bidCount>=1` (`"ไม่สามารถยกเลิก auction ที่มีผู้เสนอราคาแล้ว"`) หรือ `status IN ('ended','unsold','cancelled')` |

**Concurrency:** conditional update สองรูปแบบ (`{status:{in:['draft','scheduled']}}` OR `{status:'live', bidCount:0}`) — ถ้า `count===0` แปลว่า state เปลี่ยนไปแล้วระหว่างเช็ค → คืน `409`

---

### 4.7 `POST /api/seller/auctions/[id]/end-early`

จบประมูลก่อนเวลา (TFR-012, FR-AUC-12)

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path | `id` | `string` | ✅ | |
| Body | `confirmBelowReserve` | `boolean?` | – | ต้องส่ง `true` เมื่อได้รับ `409 BELOW_RESERVE_CONFIRM_REQUIRED` มาก่อน |

**Response — Success (200)**

```ts
{ status: 'ended' | 'unsold'; orderId: string | null }
```

**Response — Error**

| Code / error body | เงื่อนไข |
|---|---|
| `401` | ไม่มี session |
| `403` | ไม่ใช่เจ้าของ |
| `409` `{ "error": "status ต้องเป็น live" }` | `status !== 'live'` |
| `409` `{ "error": "BELOW_RESERVE_CONFIRM_REQUIRED", "currentPrice": number, "hasReserve": true }` | `bidCount>=1 AND currentPrice<reservePrice AND !confirmBelowReserve` — client ต้องเด้ง Sweet Alerts confirm แล้วเรียกซ้ำพร้อม `confirmBelowReserve:true` |

**ตัวอย่าง**

```bash
# ครั้งแรก — ยังไม่ confirm
curl -X POST .../api/seller/auctions/auc_01H.../end-early \
  -H "Content-Type: application/json" -H "Cookie: <session-cookie>" -d '{}'
```
```json
// 409
{ "error": "BELOW_RESERVE_CONFIRM_REQUIRED", "currentPrice": 6000, "hasReserve": true }
```
```bash
# ครั้งที่สอง — confirm แล้ว
curl -X POST .../api/seller/auctions/auc_01H.../end-early \
  -H "Content-Type: application/json" -H "Cookie: <session-cookie>" \
  -d '{ "confirmBelowReserve": true }'
```
```json
// 200
{ "status": "unsold", "orderId": null }
```

**ไม่มี branch พิเศษ:** logic เหมือน `settleEndedAuctions` ทุกประการ (reuse `settleAuctionCore(tx, id, { force: true })`) ต่างแค่ข้าม check `endTime > now()`

---

### 4.8 `GET /api/app/auctions/browse`

**สถานะ: ขยาย** จากของเดิม (`src/app/api/app/auctions/browse/route.ts`)

**Request** — Query: `sort?: 'bidders'|'ending'|'priceHigh'|'priceLow'`, `category?: string`, `page?: int` (ไม่เปลี่ยนจากเดิม)

**สิ่งที่ขยาย:**
1. เรียก `flipScheduledToLive()` lazy ก่อน `settleEndedAuctions()` เดิม (TFR-015)
2. item DTO เปลี่ยนจาก `AuctionDTO & {bidderCount}` → `PublicAuctionDTO & {bidderCount}` (เพิ่ม `description`/`buyNowPrice`/`antiSnipeCount`/`hasReserve`)

**Response — Success (200)**

```ts
{ items: (PublicAuctionDTO & { bidderCount: number })[]; nextCursor: number | null }
```

**Response — Error:** ไม่มี (public, ไม่ auth) — ยกเว้น `500` unexpected

---

### 4.9 `GET /api/app/auctions/top`

**สถานะ: คงเดิม 100%** — ไม่มี field ใหม่ตาม [[SRS]] §4.1 ("เหมือนเดิม (status='live' เท่านั้น)")

**Response — Success (200)**: `AuctionDTO[]` (ชนิดเดิม — **ไม่** ขยายเป็น `PublicAuctionDTO[]`, ยึดตาม SRS ที่บอกชัดว่าคงเดิม; ถ้าต้องการให้ตรงกับ browse ต้อง confirm เพิ่มก่อน — ดู §11)

---

### 4.10 `GET /api/app/auctions/[id]`

**สถานะ: ขยาย (PII rule)** — จาก `src/app/api/app/auctions/[id]/route.ts`

**Request** — Path Param `id: string`, ไม่ auth

**Response — Success (200)**

```ts
PublicAuctionDTO & { bidHistory: BidDTO[]; seller: SellerTrust }
```

**ห้ามมีเด็ดขาด:** `reservePrice`, `expectedPrice` — grep-gate บังคับ (§7)

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `404` | `"ไม่พบรายการประมูล"` |

`seller: SellerTrust` มาจาก `getSellerTrust(auction.shopId)` เดิม (`app-shop.service.ts`) — ไม่แก้

---

### 4.11 `POST /api/app/auctions/[id]/bid`

**สถานะ: ขยาย (bug fix concurrency)** — TFR-005/006

**Request**: `{ "amount": number }`

**Response — Success (200)**: `PublicAuctionDTO` (currentPrice ใหม่ — **ไม่มี** reservePrice/expectedPrice)

**Response — Error**

| Code | เงื่อนไข | Message |
|---|---|---|
| `400` | `amount < currentPrice + bidIncrement` | `"ต้องบิดอย่างน้อย {minNext} บาท"` |
| `401` | ไม่มี Bearer | `"ไม่ได้เข้าสู่ระบบ"` |
| `403` | self-bid (`bidderId === auction.shop.userId`) | `"ไม่สามารถเสนอราคา auction ของตัวเองได้"` (**ใหม่ — ของเดิมไม่มี guard นี้**) |
| `404` | ไม่พบ auction | `"ไม่พบรายการประมูล"` |
| `409` | ปิดแล้ว หรือ conditional-update ชนกัน | `"การประมูลปิดแล้ว"` / `"มีคนเสนอราคาก่อนคุณ กรุณาลองใหม่"` — client ควร retry ด้วย `currentPrice` ล่าสุด |

**Concurrency fix (สำคัญ — R-SRS-1, prerequisite ของทุก TFR ที่แตะ placeBid):** ต้องเปลี่ยนจาก `findUnique` + `update` (โค้ดเดิม, race-vulnerable) เป็น conditional `updateMany({ where: { id, status:'live', currentPrice: <snapshot> } })` แล้วเช็ค `res.count===0` → 409 (pattern เดียวกับ `wallet.service.ts::deductCredit`)

**ตัวอย่าง**

```bash
curl -X POST https://deepthailand.app/api/app/auctions/auc_01H.../bid \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{ "amount": 5500 }'
```
```json
// 200
{ "id": "auc_01H...", "title": "...", "currentPrice": 5500, "bidIncrement": 500,
  "endTimeMs": 1783483260000, "bidCount": 3, "antiSnipeCount": 1, "hasReserve": true,
  "buyNowPrice": 20000, "shopId": "shop_01H...", "category": null, "status": "live",
  "description": null, "startTimeMs": null }
```
```json
// 409 (แข่งกับคนอื่น)
{ "error": "มีคนเสนอราคาก่อนคุณ กรุณาลองใหม่" }
```

---

### 4.12 `POST /api/app/auctions/[id]/buy-now`

**สถานะ: ใหม่** (TFR-007, FR-AUC-07)

**Request** — ไม่รับ body (amount = `auction.buyNowPrice` เสมอ, **ห้าม client ส่ง amount เอง**)

**Response — Success (200)** — ⚠️ **pending confirm** (SRS ไม่ระบุ response shape ชัด — เสนอตามความจำเป็น functional ที่ buyer ต้องได้ `orderId` ไปหน้าชำระเงินทันที):

```ts
{ auction: PublicAuctionDTO; orderId: string }
```

**Response — Error**

| Code | เงื่อนไข | Message |
|---|---|---|
| `400` | `auction.buyNowPrice == null` | `"auction นี้ไม่มีตัวเลือกซื้อทันที"` |
| `401` | ไม่มี Bearer | `"ไม่ได้เข้าสู่ระบบ"` |
| `403` | self-bid (guard เดียวกับ bid) | `"ไม่สามารถเสนอราคา auction ของตัวเองได้"` |
| `404` | ไม่พบ auction | `"ไม่พบรายการประมูล"` |
| `409` | ปิดไปแล้ว หรือมีคนกด buy-now ไปก่อน หรือ bid ปกติดันราคาเกิน buyNowPrice ไปแล้ว | `"การประมูลปิดแล้ว"` / `"ราคาสูงเกินระดับซื้อทันทีแล้ว"` |

**Concurrency (R-SRS-4):** conditional update `WHERE currentPrice < buyNowPrice` ร่วมกับ guard ของ `bid` → `count===0` → 409 + `Order.auctionId @unique` เป็น backstop ชั้นสอง กันสร้าง 2 Order

**ตัวอย่าง**

```bash
curl -X POST https://deepthailand.app/api/app/auctions/auc_01H.../buy-now \
  -H "Authorization: Bearer <token>"
```
```json
// 200
{ "auction": { "id": "auc_01H...", "status": "ended", "currentPrice": 20000, "...": "..." }, "orderId": "ord_01H..." }
```

---

### 4.13 `POST /api/app/auctions/[id]/settle`

**สถานะ: คงเดิม 100%** — `src/app/api/app/auctions/[id]/settle/route.ts` ไม่แก้เลย

**Request** — Path Param `id`, ไม่ auth, ไม่รับ body

**ห้ามเพิ่ม parameter ใด ๆ ที่ทำให้ caller กำหนดผลลัพธ์ได้** (เช่น ห้ามรับ `winnerId`) — ตั้งใจเปิดไม่มี auth เพราะ idempotent และไม่รับ input ที่บิดผลได้ ([[SRS]] §7.1)

**Response — Success (200)**: `{ ended: boolean; orderId: string | null }`

**Idempotency:** เรียกซ้ำกี่ครั้งผลลัพธ์เหมือนเดิม (เช็ค `Order.auctionId @unique` ก่อนสร้างเสมอ)

---

### 4.14 `POST /api/app/auctions/[id]/watch`

**สถานะ: ใหม่ (pending scope confirm — [[SRS]] §11 Q5)** — schema `WatchList` มีอยู่แล้ว, `GET /me/watching` ใช้งานได้แล้ว แต่ไม่มี toggle endpoint

**Request** — Path Param `id`, Bearer required, ไม่รับ body

**Response — Success (200)** (เสนอ — pending confirm): `{ watching: true }`

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `401` | ไม่มี Bearer |
| `404` | auction ไม่พบ |

Upsert `WatchList` (`@@unique([userId, auctionId])`) — ไม่กระทบ auction core logic

---

### 4.15 `DELETE /api/app/auctions/[id]/watch`

**สถานะ: ใหม่ (pending scope confirm)**

**Request** — Path Param `id`, Bearer required

**Response — Success (200)** (เสนอ): `{ watching: false }`

**Response — Error**

| Code | เงื่อนไข |
|---|---|
| `401` | ไม่มี Bearer |
| `404` | auction ไม่พบ **หรือ** ไม่เคย watch อยู่ (เสนอ — pending: จะ 404 หรือ no-op 200 ต้อง confirm) |

---

## 5. Authorization Matrix

(คัดจาก [[SRS]] §4.5 ตรงตัว)

| Endpoint | Seller (owner) | Seller (ไม่ใช่เจ้าของ auction นั้น) | Buyer (Deep-App, authed) | Guest/Anonymous |
|---|---|---|---|---|
| `POST /api/seller/auctions` | ✅ (ต้อง L2+) | — | ❌ | ❌ |
| `GET/PATCH /api/seller/auctions/[id]` | ✅ | ❌ 403/404 (ดูหมายเหตุ §4.3) | ❌ | ❌ |
| `POST .../cancel`, `.../end-early`, `.../publish` | ✅ | ❌ 403 | ❌ | ❌ |
| `GET /api/app/auctions/browse\|top\|[id]` | ✅ (เห็นเหมือน buyer ทั่วไป) | ✅ | ✅ | ✅ (ไม่ auth ก็ดูได้) |
| `POST /api/app/auctions/[id]/bid\|buy-now` | ❌ self-bid block 403 (auction ตัวเอง) / ✅ (auction คนอื่น) | ✅ | ✅ | ❌ 401 |
| `POST/DELETE /api/app/auctions/[id]/watch` | ✅/❌ (เหมือน buyer, self ก็ทำได้ไม่มีข้อห้าม) | ✅ | ✅ | ❌ 401 |
| `POST /api/app/auctions/[id]/settle` | ✅ (ทุกคนเรียกได้ — idempotent) | ✅ | ✅ | ✅ (by design) |

---

## 6. Realtime Channel Spec

**Channel:** `auction:{id}` — Broadcast from Database (Supabase Realtime `realtime.send()`), **ไม่ใช่** `postgres_changes` ตรง ๆ (ดูเหตุผล R-SRS-2 ใน [[SRS]] §2.4 — `postgres_changes` broadcast แถวเต็มและไม่มี RLS → `reservePrice`/`expectedPrice` จะรั่ว)

**Producer:** Postgres trigger `AFTER UPDATE ON "Auction"` → function `auction_realtime_broadcast()` (migration ใหม่ — **ยังไม่มีใน [[DATABASE]] §9 ปัจจุบัน ต้อง sync กับ `safepay-database` ก่อน apply**, ต้อง user approve เพราะแตะ prod Supabase เดียวกับ dev)

**Event:** `update`

**Payload (sanitized — ไม่มี reservePrice/expectedPrice):**

```json
{
  "id": "auc_01H...",
  "currentPrice": 5500,
  "bidCount": 3,
  "endTimeMs": 1783483260000,
  "status": "live",
  "antiSnipeCount": 1,
  "hasReserve": true
}
```

**Consumer:** Seller console (subscribe เฉพาะ auction ที่กำลังดู) + Deep-App buyer client

**Subscribe example (client):**

```ts
supabase
  .channel('auction:' + id)
  .on('broadcast', { event: 'update' }, (payload) => {
    // payload.payload = { id, currentPrice, bidCount, endTimeMs, status, antiSnipeCount, hasReserve }
  })
  .subscribe()
```

**Fail-safe:** trigger function ห่อด้วย `EXCEPTION WHEN OTHERS THEN NULL;` — ต้องไม่ throw จน rollback UPDATE หลัก (write path ต้องสำเร็จแม้ Realtime ล่ม, FR-AUC-10-AC-03) — latency target ≤1s p95

---

## 7. Common Error Format + Enums

**โครง error response มาตรฐาน (ตรงกับ convention จริงของโปรเจกต์ — ไม่ใช่ template `{error:{code,message,details}}`):**

```json
{ "error": "ข้อความภาษาไทยที่ frontend/toast โชว์ตรง ๆ ได้เลย" }
```

**Error Code Table**

| HTTP Status | ความหมาย / เงื่อนไขทั่วไป |
|---|---|
| `400` | validation ไม่ผ่าน (field format, bid amount ต่ำกว่า minNext, buy-now ไม่มี buyNowPrice) |
| `401` | ไม่มี session (seller) หรือไม่มี/token ผิด Bearer (buyer) |
| `403` | ownership fail, L2 < 2 (create), self-bid |
| `404` | resource ไม่พบ (auction/shop) — สำหรับ seller `GET /[id]` ใช้แทน 403 ด้วย (ดู §4.3) |
| `409` | state conflict (status ไม่ตรงเงื่อนไข transition, conditional-update race, `BELOW_RESERVE_CONFIRM_REQUIRED`) |
| `500` | unexpected server error (`console.error` log pattern `[route] ... failed`) |

**Special error body (409):** `end-early` เท่านั้นที่คืน error body ที่มี field เพิ่มนอกจาก `error`:

```json
{ "error": "BELOW_RESERVE_CONFIRM_REQUIRED", "currentPrice": 6000, "hasReserve": true }
```

**Enums (อ้าง [[SRS]] §5.6 — SSOT):**

| ชื่อ | ค่า |
|---|---|
| `Auction.status` | `draft \| scheduled \| live \| ended \| unsold \| cancelled` (String, ไม่ใช่ Prisma enum) |
| `Notification.kind` | `outbid \| won \| system` |
| Anti-snipe window | `60_000` ms, max `5` ครั้ง/auction |
| Min endTime lead time | `now + 30 นาที` |
| Seller L2 threshold | `VerificationRecord.level >= 2 AND status === 'APPROVED'` |

---

## 8. Sequence: Bid + Anti-Snipe + Conditional Update

(อ้างจาก [[SRS]] §4.4 ตรงตัว)

```mermaid
sequenceDiagram
    participant B as Buyer App
    participant API as POST /bid
    participant DB as Postgres (tx)
    participant RT as Supabase Realtime (trigger)

    B->>API: { amount }
    API->>DB: BEGIN tx; SELECT Auction (+ shop.userId)
    DB-->>API: auction row
    API->>API: ตรวจ live/time/self-bid/minAmount
    API->>DB: updateMany WHERE id, status='live', currentPrice=<snapshot>
    alt count = 0 (มีคนแซงระหว่างนี้)
        DB-->>API: count 0
        API-->>B: 409 "มีคนเสนอราคาก่อนคุณ"
    else count = 1
        API->>DB: INSERT Bid
        API->>API: amount >= buyNowPrice?
        alt buy-now triggered
            API->>DB: settleAuctionCore(tx, force=true)
        else ปกติ
            API->>API: endTime - now <= 60s AND antiSnipeCount<5?
            opt anti-snipe
                API->>DB: UPDATE endTime+=60s, antiSnipeCount+=1
            end
        end
        API->>DB: INSERT Notification (outbid)
        API->>DB: COMMIT
        DB->>RT: trigger fires → realtime.send(sanitized payload)
        RT-->>B: broadcast (ทุก client ที่ subscribe)
        API-->>B: 200 PublicAuctionDTO
        API->>API: pushToUser outbid (best-effort, post-commit)
    end
```

---

## 9. Appendix — DTO Definitions

```ts
/** Buyer-facing — ไม่มี reservePrice/expectedPrice เด็ดขาด (grep-gate บังคับ) */
interface PublicAuctionDTO {
  id: string
  title: string
  description: string | null
  imageUrl: string
  images: string[]             // gallery (schema Auction.images Json มีอยู่เดิม)
  currentPrice: number
  bidIncrement: number
  startTimeMs: number | null
  endTimeMs: number
  bidCount: number
  antiSnipeCount: number
  hasReserve: boolean          // แทน reservePrice จริง
  buyNowPrice: number | null
  shopId: string
  category: string | null
  status: 'draft' | 'scheduled' | 'live' | 'ended' | 'unsold' | 'cancelled'
  // หมายเหตุ: buyer ปกติเจอแค่ live/ended/unsold ผ่าน flow จริง
  // (draft/scheduled/cancelled ไม่ถูก query ใน browse/top อยู่แล้ว)
}

/** Seller-facing เท่านั้น — 2 type แยกจริงตาม TFR-013 (ไม่ใช่ optional field เดียวที่ conditionally populate) */
interface SellerAuctionDTO extends PublicAuctionDTO {
  reservePrice: number | null
  expectedPrice: number | null   // pure display indicator, ไม่กระทบ settle logic ใด ๆ
  cancelledAt: string | null     // ISO string (RSC-safe — ตรงกับ impl toSellerAuctionDTO, SDS §7.2)
  bidHistory: BidDTO[]           // top 20
}

/** สำหรับ GET /api/seller/auctions (list) — เบากว่า SellerAuctionDTO เต็ม */
interface SellerAuctionListItemDTO {
  id: string
  title: string
  imageUrl: string      // (impl ใช้ imageUrl ตรง SDS §6 — ไม่ใช่ thumbnail)
  status: 'draft' | 'scheduled' | 'live' | 'ended' | 'unsold' | 'cancelled'
  currentPrice: number
  bidCount: number
  endTimeMs: number
  startTimeMs: number | null
}

/** ไม่มี field ใหม่ — reuse ของเดิม 100% */
interface BidDTO {
  id: string
  amount: number
  bidder: string   // displayName เท่านั้น — ไม่มี phone/email/userId
  atMs: number
}
```

---

## 10. Traceability

| Endpoint | SRS TFR / Component | BRD FR |
|----------|----------------------|--------|
| `POST /api/seller/auctions` | TFR-001, `auction.service.ts` | FR-AUC-01 |
| `GET /api/seller/auctions` | TFR-004 | FR-AUC-04, FR-AUC-11 |
| `GET /api/seller/auctions/[id]` | TFR-011 | FR-AUC-11 |
| `PATCH /api/seller/auctions/[id]` | TFR-002 | FR-AUC-02 (pending confirm §11 Q1) |
| `POST .../publish` | TFR-001 (ต่อเนื่อง) | FR-AUC-01 (request shape pending §11) |
| `POST .../cancel` | TFR-003 | FR-AUC-03 |
| `POST .../end-early` | TFR-012 | FR-AUC-12 |
| `GET /api/app/auctions/browse` | TFR-004, TFR-015 | FR-AUC-04 |
| `GET /api/app/auctions/top` | (คงเดิม) | — |
| `GET /api/app/auctions/[id]` | TFR-011 (buyer variant), §5.5 | FR-AUC-13-AC-04 (PII rule) |
| `POST .../bid` | TFR-005, TFR-006 | FR-AUC-05, FR-AUC-06 |
| `POST .../buy-now` | TFR-007 | FR-AUC-07 (response shape pending §11) |
| `POST .../settle` | TFR-008, TFR-009 | FR-AUC-08, FR-AUC-09 |
| `POST/DELETE .../watch` | — (utility) | ไม่มี FR-AUC เลขตรง (pending scope §11 Q5) |
| Realtime `auction:{id}` | TFR-010, §2.4 | FR-AUC-10 |
| DTO split (Public/Seller) | TFR-013 | FR-AUC-13 |

---

## 11. Summary

เอกสารนี้กำหนดสัญญาการเชื่อมต่อของ **Seller Auction + Realtime Bidding (M00002)** ครบทั้ง 15 endpoint (7 seller ใหม่ + 6 buyer ขยาย/คงเดิม + 2 supporting) พร้อม authorization matrix, error table, DTO ที่แยก public/seller ชัดเจนตาม PII-equivalent rule ของ `reservePrice`/`expectedPrice`, และ Realtime channel spec ที่แก้ gap การรั่วไหลจาก [[DATABASE]] เดิม ให้ DEV implement ได้ตรงกับ [[SRS]] โดยไม่ต้องเดารูปร่าง request/response ของ endpoint ที่ SRS ยืนยันแล้ว

**Open Questions / Pending confirm:**

> **✅ อัปเดต 2026-07-01:** ข้อ scope/business เคาะแล้ว — ดู [[BRD]] §2.7 Decisions Log (SSOT): edit price = แก้ได้ (ข้อ 1), watch = รวม M00002 (ข้อ 6), schedule past = reject 400 (ข้อ 9), buyer bid = ไม่ gate MVP (ข้อ 10), Realtime = Broadcast-from-DB (ข้อ 8). ข้อ response-shape (2/3/4/5/7) = Controller technical default (BRD §2.7 Group A: publish `{mode,startTime?}`, cancel/buy-now คืน DTO+orderId, top คง `AuctionDTO`, เพิ่ม `images[]`). รายการด้านล่างคง original เพื่อ traceability.

1. **`PATCH /api/seller/auctions/[id]`** — price fields (`startPrice`/`reservePrice`/`buyNowPrice`/`expectedPrice`) แก้ได้ระหว่าง draft/scheduled หรือไม่ ([[SRS]] §11 Q1 — carry-over, ยังไม่ sign-off)
2. **`POST .../publish` request body** — [[SRS]] §4.1 ระบุแค่ path ไม่มี schema; เอกสารนี้เสนอ `{mode, startTime?}` ตาม pattern create — **ต้อง confirm ก่อน dev**
3. **`POST .../cancel` response shape** — เสนอ `SellerAuctionDTO` เต็ม (ไม่ minimal `{status}`) — ต้อง confirm ว่า overkill หรือไม่
4. **`POST .../buy-now` response shape** — เสนอ `{auction, orderId}` เพื่อให้ buyer ไป pay ต่อได้ทันที — SRS ไม่ได้ระบุ ต้อง confirm
5. **`GET /api/app/auctions/top` — คง `AuctionDTO` เดิมหรือขยายเป็น `PublicAuctionDTO`** — SRS บอก "เหมือนเดิม" ตรงตัว แต่ทำให้ type ไม่ sync กับ `browse`/`[id]` (frontend อาจงงว่าทำไม top ไม่มี `hasReserve`) — ควร confirm ว่าตั้งใจจริงหรือ SRS พลาดพิมพ์
6. **`POST/DELETE .../watch` — scope ทั้งคู่อยู่ใน M00002 หรือแยก feature** ([[SRS]] §11 Q5 — carry-over) รวมถึง response shape (`{watching:boolean}`) และ DELETE ที่ auction ไม่เคย watch ควร 404 หรือ no-op 200
7. **`images[]` ใน DTO** — request ตอน create รับ `images: string[]` แต่ [[SRS]] §5.1 ไม่ได้ระบุให้ `PublicAuctionDTO`/`SellerAuctionDTO` มี field `images` (มีแต่ `imageUrl` เดี่ยว) — ถ้าหน้า detail buyer ต้องการ gallery หลายรูป ต้องเพิ่ม field นี้ให้ชัดก่อน dev (ไม่ invent เองในเอกสารนี้)
8. **Realtime trigger migration** — ต้อง sync กับ `safepay-database` ก่อน apply เพราะ [[DATABASE]] §9 ปัจจุบันยังเขียนเป็น `ALTER PUBLICATION ... postgres_changes` ไม่ใช่ Broadcast-from-DB ที่เอกสารนี้ใช้ ([[SRS]] §11 Q2 — carry-over, ต้อง user approve เพราะแตะ prod Supabase)
9. **`mode==='schedule'` กับ `startTime` อดีต/ปัจจุบัน** ([[SRS]] §11 Q7 — carry-over) — reject 400 หรือ auto-fallback publishNow
10. **Buyer verification level ก่อน bid** ([[SRS]] §11 Q3 — carry-over) — ปัจจุบันไม่มี gate ใน MVP

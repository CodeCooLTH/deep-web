---
title: "API Contract — Pin Products (ปักหมุดสินค้าเด่น)"
owner: shinobu22
status: draft
module: M00013-PinProducts
version: "1.0"
created: 2026-07-04
tags: [feature, profile, monetization, seller, wallet, api]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M00013-PinProducts · **ประเภท:** API Contract · **สถานะ:** Draft

# API Contract: Pin Products

## 1. Overview
API ให้ seller ปักหมุด/ยกเลิกปักหมุดสินค้า + ซื้อ pin slot (฿99 ถาวร ผ่าน `SellerWallet`) — provider = Next.js 16 Route Handler (`src/app/api/seller/**`), consumer = Seller Products List (Paces).
- **Base URL:** `https://seller.deepthailand.app` (prod) / `https://seller.deepth.local:4000` (dev)
- **Content-Type:** `application/json` · response = flat object; error envelope `{ error: string, code?: string }`

## 2. Authentication
| รายการ | ค่า |
|--------|-----|
| วิธี | NextAuth session cookie (seller subdomain) — ไม่ใช่ Bearer |
| resolve shop | `getServerSession(authOptions)` → `requireActiveShop(session)` — **ไม่รับ `shopId` จาก client** (DAL ownership) |
| CSRF/Rate-limit | `guardApi` ใน `src/proxy.ts` อัตโนมัติ (POST = Origin-check + per-IP limit) — ไม่ต้องแก้ proxy |
| ไม่ผ่าน | ไม่มี session → `401`; ไม่มีร้าน → `404` |

## 3. Endpoint List
| Method | Path | คำอธิบาย |
|--------|------|----------|
| `POST` | `/api/seller/products/{id}/pin` | ปักหมุดสินค้า (ต้องมี slot ว่าง) |
| `POST` | `/api/seller/products/{id}/unpin` | ยกเลิกปักหมุด (ฟรีเสมอ) |
| `POST` | `/api/seller/pin-slots/buy` | ซื้อ slot ฿99 + ปักหมุดสินค้าเป้าหมาย ในธุรกรรมเดียว |

## 4. Endpoint Detail

### 4.1 `POST /api/seller/products/{id}/pin`
ปักหมุดสินค้า `{id}` ต้องมี slot ว่าง (`pinnedCount < pinSlots`) ไม่งั้น `409 NO_PIN_SLOT` (client เปิด dialog ซื้อ slot → §4.3). **idempotent**: ปักหมุดซ้ำ → `200` state ปัจจุบัน

**Request:** Path `id` (uuid, required); ไม่มี body
**Response 200:** `{ productId, pinnedAt (ISO), pinSlots, pinnedCount }`
**Errors:** `401 UNAUTHORIZED` · `404 SHOP_NOT_FOUND` · `404 PRODUCT_NOT_FOUND` (ownership ที่ WHERE — ไม่ leak สินค้าร้านอื่น) · `400 PRODUCT_NOT_ACTIVE` · `409 NO_PIN_SLOT` · `500 INTERNAL_ERROR`
```json
{ "productId": "a1b2...", "pinnedAt": "2026-07-04T10:15:00.000Z", "pinSlots": 1, "pinnedCount": 1 }
{ "error": "สล็อตปักหมุดเต็ม ต้องซื้อสล็อตเพิ่มหรือยกเลิกปักหมุดอื่นก่อน", "code": "NO_PIN_SLOT" }
```

### 4.2 `POST /api/seller/products/{id}/unpin`
ยกเลิกปักหมุด — ฟรีเสมอ ไม่มีเงื่อนไข slot. **idempotent**: ยกเลิกซ้ำ → `200` (`pinnedAt: null`)
**Request:** Path `id` (uuid); ไม่มี body
**Response 200:** `{ productId, pinnedAt: null, pinSlots, pinnedCount }`
**Errors:** `401` · `404 SHOP_NOT_FOUND` · `404 PRODUCT_NOT_FOUND` · `500`

### 4.3 `POST /api/seller/pin-slots/buy`
ซื้อ slot ฿99 (หัก `SellerWallet`) **และ**ปักหมุด `productId` ในธุรกรรมเดียว (atomic). เรียกจาก dialog ยืนยัน (Sweet Alert) หลังกด pin ขณะ slot เต็ม. **idempotent ต่อ double-charge**: `productId` ปักหมุดอยู่แล้ว → คืน state ไม่หักซ้ำ ไม่เพิ่ม slot ซ้ำ
**Request body:** `{ productId: string(uuid) }` — Valibot `BuyPinSlotSchema = v.object({ productId: v.pipe(v.string(), v.uuid()) })`
**Response 200:** `{ productId, pinnedAt (ISO), pinSlots (+1), pinnedCount }`
**Errors:** `401` · `404 SHOP_NOT_FOUND` · `400 VALIDATION_ERROR` · `404 PRODUCT_NOT_FOUND` · `400 PRODUCT_NOT_ACTIVE` · `402 INSUFFICIENT_CREDIT` (balance < 99 → rollback ทั้งหมด ไม่หัก/ไม่เพิ่ม/ไม่ปักหมุด) · `500`
```json
// Request
{ "productId": "a1b2..." }
// Response 200
{ "productId": "a1b2...", "pinnedAt": "2026-07-04T10:20:00.000Z", "pinSlots": 2, "pinnedCount": 2 }
// Response 402
{ "error": "เครดิตไม่พอ กรุณาเติมเครดิตก่อนซื้อสล็อต", "code": "INSUFFICIENT_CREDIT" }
```

## 5. Error Code Table
| Code | Status | ความหมาย |
|------|--------|----------|
| `UNAUTHORIZED` | 401 | session หาย/หมดอายุ |
| `SHOP_NOT_FOUND` | 404 | seller ยังไม่มีร้าน (`requireActiveShop`=null) |
| `PRODUCT_NOT_FOUND` | 404 | productId ไม่มี/ไม่ใช่ของร้าน session นี้ (`PinProductNotFoundError`) |
| `PRODUCT_NOT_ACTIVE` | 400 | `isActive=false` (`PinProductInactiveError`) |
| `VALIDATION_ERROR` | 400 | body ไม่ผ่าน Valibot (§4.3 เท่านั้น) |
| `NO_PIN_SLOT` | 409 | `pinnedCount===pinSlots` (§4.1 เท่านั้น — `NoPinSlotError`) |
| `INSUFFICIENT_CREDIT` | 402 | `balance<99` (§4.3 เท่านั้น — จาก `wallet.service::deductCredit`) |
| `INTERNAL_ERROR` | 500 | unhandled — log + generic message |

🛑 **error-route mapping** (memory `feedback_service_error_route_mapping`): `NoPinSlotError` throw เฉพาะจาก `pinProduct()` → catch เฉพาะ §4.1; `INSUFFICIENT_CREDIT` throw เฉพาะจาก `buyPinSlotAndPin()` → catch เฉพาะ §4.3. ห้าม copy catch-block ข้าม route โดยไม่เช็คว่า error เกิดได้จริงใน route นั้น

## 6. Sequence — ซื้อ slot + ปักหมุด (atomic)
```mermaid
sequenceDiagram
    participant C as Seller (Paces UI)
    participant Swal as Sweet Alert
    participant R as POST /api/seller/pin-slots/buy
    participant S as pin.service
    participant W as wallet.service
    participant DB as PostgreSQL
    C->>Swal: กด pin ขณะ pinnedCount==pinSlots
    Swal->>R: preConfirm → POST {productId} (Origin + cookie)
    R->>R: getServerSession + requireActiveShop + Valibot
    R->>S: buyPinSlotAndPin(shop.id, productId)
    S->>DB: BEGIN; SELECT Shop FOR UPDATE; findFirst Product
    S->>W: deductCredit(shopId, 99, productId, desc, 'PIN_SLOT', tx)
    W->>DB: UPDATE SellerWallet SET balance=balance-99 WHERE balance>=99
    alt count=0 (เครดิตไม่พอ)
        W-->>S: throw INSUFFICIENT_CREDIT
        S->>DB: ROLLBACK
        R-->>Swal: 402 {error, code}
        Swal-->>C: showValidationMessage (dialog ค้าง)
    else count=1 (สำเร็จ)
        S->>DB: UPDATE Shop pinSlots+1; UPDATE Product pinnedAt=now(); COMMIT
        R-->>Swal: 200 JSON
        Swal-->>C: pacesToast.success + router.refresh()
    end
```

## 7. Traceability
| Endpoint | SDS Component | BRD FR |
|----------|---------------|--------|
| `/pin` | `pinProduct`, TD-001/TD-005 | FR-PIN-03 |
| `/unpin` | `unpinProduct` | FR-PIN-03, FR-PIN-05 |
| `/pin-slots/buy` | `buyPinSlotAndPin`, TD-001/TD-004 | FR-PIN-02, FR-PIN-04 |

**Open Questions:** ไม่มี

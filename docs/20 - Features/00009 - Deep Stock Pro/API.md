---
title: "API Contract — Deep Stock Pro"
owner: shinobu22
status: draft
module: M00009-DeepStockPro
version: "1.0"
created: 2026-07-02
tags: [feature, inventory, stock, subscription, seller, add-on, tiered-pricing, api]
related: ["[[SRS]]", "[[SDS]]", "[[DATABASE]]"]
---

> **โมดูล:** M00009-DeepStockPro
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-02
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: Deep Stock Pro

---

## 1. Overview

API ชุดนี้ขยาย Inventory Add-on (M00003) เป็น 2 แพ็กเกจ + ฟีเจอร์ Pro (Manual Adjustment ทุก package, Alert/Audit/CSV เฉพาะ Pro) — ทุก endpoint เดินตาม pattern เดิมของ M00003 (session-derived shopId, ไม่รับ shopId จาก client, Valibot validate, error `{error: "<code/message>"}`)

**Provider:** Next.js 16 App Router Route Handlers (nodejs runtime)
**ผู้บริโภค:** `PackageSelector`/`ManualAdjustModal`/`CsvImportModal` (seller UI ใหม่), `ProductStockCardV2` (ขยาย)
**Base URL:** `https://seller.deepthailand.app` (prod) / `https://seller.deepth.local:4000` (dev)
**ต้นทาง:** [[SDS]] §3-4; schema → [[DATABASE]] (**migration ต้อง apply ก่อน**)

---

## 2. Authentication

เหมือน 00003 ทุกประการ — `getServerSession(authOptions)` + `getShopByUserId` (session-derived shopId เท่านั้น), CSRF Origin-check ทุก mutation ผ่าน `guardApi`, rate-limit auth 30/min ต่อ IP. ไม่มี auth mechanism ใหม่ในฟีเจอร์นี้ (cron endpoint ยังใช้ `CRON_SECRET` เดิม ไม่เปลี่ยน)

---

## 3. Endpoint List

| Method | Path | คำอธิบาย | Auth | Gate | สถานะ |
|--------|------|----------|------|------|--------|
| `POST` | `/api/inventory/subscribe` | Subscribe เลือก package | seller session | — | **แก้ (breaking body)** |
| `POST` | `/api/inventory/upgrade` | Upgrade BASIC→PRO | seller session | ACTIVE required | **ใหม่** |
| `POST` | `/api/inventory/reactivate` | Reactivate เลือก package | seller session | LOCKED required | **แก้ (breaking body)** |
| `POST` | `/api/inventory/stock/adjust` | Manual Stock Adjustment | seller session | ACTIVE (ไม่ใช่ PRO-gate) | **ใหม่** |
| `GET` | `/api/inventory/movements` | Movement history ต่อสินค้า | seller session | PRO-gate | **ใหม่** |
| `GET` | `/api/inventory/csv/export` | Export CSV | seller session | PRO-gate | **ใหม่** |
| `POST` | `/api/inventory/csv/import` | Import CSV (rows) | seller session | PRO-gate | **ใหม่** |
| `POST` | `/api/products` | สร้างสินค้า (ขยายรับ `lowStockThreshold`) | seller session | PRO-gate (เฉพาะ field นี้) | **ขยาย** |
| `PATCH` | `/api/products/[id]` | แก้สินค้า (ขยายรับ `lowStockThreshold`) | seller session (owner) | PRO-gate (เฉพาะ field นี้) | **ขยาย** |
| `POST` | `/api/orders` | สร้าง order (external contract ไม่เปลี่ยน) | seller session | — | **internal เปลี่ยน (StockMovement insert)** |
| `POST` | `/api/orders/[token]/cancel` | ยกเลิก order (external contract ไม่เปลี่ยน) | seller/buyer | — | **internal เปลี่ยน (StockMovement insert)** |
| `POST` | `/api/cron/inventory-renewal` | Renewal batch รายวัน | `CRON_SECRET` | — | **internal เปลี่ยน (ราคาตาม package)** |

---

## 4. Endpoint Detail

### 4.1 `POST /api/inventory/subscribe` (แก้ — breaking body)

Subscribe ครั้งแรก เลือก package เอง. Trace: SDS §3.2 → SRS TFR-DSP-03 → BRD FR-DSP-03

**Request Body:**
```json
{ "package": "PRO" }
```
| field | type | req | คำอธิบาย |
|-------|------|-----|----------|
| `package` | `"BASIC" \| "PRO"` | yes | **ใหม่ — บังคับ** (เดิม 00003 เป็น `{}` ว่าง) |

**Valibot:** `SubscribeInventorySchema` (`src/lib/validations.ts`)

**Success 200:**
```json
{ "status": "ACTIVE", "package": "PRO", "nextRenewalAt": "2026-08-01T19:00:00.000Z" }
```

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `package` ไม่ใช่ `BASIC`/`PRO` หรือขาดหาย | `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | ไม่พบ shop | `{ "error": "ไม่พบร้านค้า" }` |
| 409 | มี entitlement อยู่แล้ว | `{ "error": "สมัครใช้งานอยู่แล้ว" }` |
| 402 | เครดิต < ราคาของ package ที่เลือก (199 หรือ 599) | `{ "error": "เครดิตไม่พอ กรุณาเติมเครดิตก่อนสมัคร" }` |
| 429 | rate-limit | `{ "error": "Rate limit exceeded" }` |

**Side-effects:** `WalletTransaction` DEDUCT 1 รายการ `reason` ตาม package (`INVENTORY_SUBSCRIPTION_BASIC`/`_PRO`)

---

### 4.2 `POST /api/inventory/upgrade` (ใหม่)

Upgrade จาก BASIC ACTIVE เป็น PRO กลางรอบ — จ่ายเต็ม ไม่มี proration. Trace: SDS §3.2 → SRS TFR-DSP-04 → BRD FR-DSP-04

**Request Body:** `{}` (empty — shopId จาก session)

**Success 200:**
```json
{ "status": "ACTIVE", "package": "PRO", "nextRenewalAt": "2026-08-01T19:00:00.000Z" }
```

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 404 | ไม่พบ shop | `{ "error": "ไม่พบร้านค้า" }` |
| 409 | entitlement ไม่ ACTIVE (NOT_SUBSCRIBED/LOCKED) | `{ "error": "ยังไม่ได้สมัครใช้งาน หรือถูกล็อกอยู่" }` |
| 409 | package เป็น PRO อยู่แล้ว | `{ "error": "ใช้งาน Deep Stock Pro อยู่แล้ว" }` |
| 402 | เครดิต < ฿599 | `{ "error": "เครดิตไม่พอ กรุณาเติมเครดิตก่อนอัพเกรด" }` |
| 429 | rate-limit | `{ "error": "Rate limit exceeded" }` |

**Idempotency:** ไม่ idempotent — upgrade สำเร็จแล้วเรียกซ้ำเจอ 409 `ALREADY_PRO`

**Side-effects:** `WalletTransaction` DEDUCT `reason="INVENTORY_SUBSCRIPTION_PRO_UPGRADE"` (แยกจาก subscribe ตรง — สำหรับ KPI); `currentPeriodStart`/`nextRenewalAt` reset ใหม่จากวันนี้; `activatedAt` **ไม่เปลี่ยน**

---

### 4.3 `POST /api/inventory/reactivate` (แก้ — breaking body)

Reactivate จาก LOCKED เลือก package เอง. Trace: SDS §3.2 → SRS TFR-DSP-07 → BRD FR-DSP-07

**Request Body:**
```json
{ "package": "BASIC" }
```

**Valibot:** `ReactivateInventorySchema`

**Success 200:**
```json
{ "status": "ACTIVE", "package": "BASIC", "nextRenewalAt": "2026-08-01T19:00:00.000Z" }
```

**Errors:** เหมือน §4.1 แต่ 409 คือ `ENTITLEMENT_NOT_LOCKED` (`"บัญชีนี้ไม่ได้ถูกล็อก"`) และ 402 message `"เครดิตไม่พอ กรุณาเติมเครดิตก่อนเปิดใช้อีกครั้ง"`

**Side-effects:** เลือก BASIC ได้แม้ก่อนล็อกเป็น PRO — `stockQty`/`StockMovement`/`lowStockThreshold` **ไม่เปลี่ยน** (data retention); ฟีเจอร์ Pro หยุดทำงานทันทีถ้าเลือก BASIC (gate ที่ query-time)

---

### 4.4 `POST /api/inventory/stock/adjust` (ใหม่)

Manual Stock Adjustment — ACTIVE-gate (**ไม่ใช่** PRO-gate — ใช้ได้ทั้ง BASIC/PRO). Trace: SDS §3.3 → SRS TFR-DSP-01 → BRD FR-DSP-01

**Request Body:**
```json
{ "productId": "uuid", "delta": -3, "note": "ของเสียหายจากขนส่ง" }
```
| field | type | req | คำอธิบาย |
|-------|------|-----|----------|
| `productId` | `string (uuid)` | yes | ต้องเป็นสินค้าของ shop ตัวเอง |
| `delta` | `integer, !=0` | yes | บวก=รับเข้า, ลบ=ตัดออก |
| `note` | `string, 1-200 chars` | yes | เหตุผล (บังคับ) |

**Valibot:** `ManualStockAdjustSchema`

**Success 200:**
```json
{ "resultingQty": 12 }
```

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | Valibot ผิด (delta=0, note ว่าง ฯลฯ) | `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 403 | entitlement ไม่ ACTIVE | `{ "error": "INVENTORY_NOT_ACTIVE" }` |
| 404 | product ไม่พบ/ไม่ใช่ของ shop นี้ | `{ "error": "PRODUCT_NOT_FOUND" }` |
| 400 | product ไม่ track (type≠PHYSICAL หรือ stockQty=null) | `{ "error": "PRODUCT_NOT_TRACKED" }` |
| 400 | delta ทำให้ stockQty ติดลบ | `{ "error": "สต็อกไม่พอ: {productName}" }` |
| 429 | rate-limit | `{ "error": "Rate limit exceeded" }` |

**Side-effects:** `Product.stockQty` เปลี่ยนตาม delta (atomic RC-3); `StockMovement` insert (source=`MANUAL_ADJUST`, refId=null, actorUserId=session userId)

---

### 4.5 `GET /api/inventory/movements` (ใหม่, PRO-gate)

Movement history ต่อสินค้า, cursor-paginated. Trace: SDS §3.3 → SRS TFR-DSP-09 → BRD FR-DSP-09

**Query params:** `?productId={uuid}&cursor={ISO datetime}&take={1-100, default 20}`

**Valibot:** `MovementHistoryQuerySchema` (validate จาก `searchParams`)

**Success 200:**
```json
{
  "items": [
    { "id": "uuid", "delta": -2, "resultingQty": 8, "source": "ORDER_DEDUCT", "refId": "order-uuid", "note": null, "actorUserId": null, "createdAt": "2026-07-02T10:00:00.000Z" },
    { "id": "uuid", "delta": 10, "resultingQty": 10, "source": "MANUAL_ADJUST", "refId": null, "note": "รับของเข้า", "actorUserId": "user-uuid", "createdAt": "2026-07-01T09:00:00.000Z" }
  ],
  "nextCursor": "2026-07-01T09:00:00.000Z"
}
```
`nextCursor: null` = ไม่มีหน้าต่อไป

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `productId` ไม่ใช่ uuid | `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 403 | entitlement ไม่ใช่ `ACTIVE+PRO` | `{ "error": "INVENTORY_NOT_PRO" }` |
| 429 | rate-limit | `{ "error": "Rate limit exceeded" }` |

**หมายเหตุ:** ถ้า `productId` ไม่ใช่ของ shop นี้ (หรือถูกลบไปแล้ว) → คืน `{items:[], nextCursor:null}` (empty, ไม่ leak ข้อมูล — WHERE compound `shopId+productId` กรองที่ query อยู่แล้ว, ไม่ 404 แยก)

---

### 4.6 `GET /api/inventory/csv/export` (ใหม่, PRO-gate)

Export รายการสินค้า PHYSICAL ทั้งหมดพร้อม stockQty เป็นไฟล์ CSV. Trace: SDS §3.3 → SRS TFR-DSP-10 → BRD FR-DSP-10

**Request:** ไม่มี query param

**Success 200:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="deep-stock-export-{shopId}-{YYYYMMDD}.csv"`
- Body (ตัวอย่าง):
```csv
productId,sku,name,stockQty
a1b2c3d4-...,SKU001,กระเป๋าถักมือ,12
e5f6g7h8-...,,เสื้อยืด,
```
(แถวว่าง `stockQty` = สินค้าที่ยังไม่ track — เปิดทางให้ import กลับเพื่อเริ่ม track)

**Errors:**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 403 | entitlement ไม่ใช่ `ACTIVE+PRO` | `{ "error": "INVENTORY_NOT_PRO" }` |

---

### 4.7 `POST /api/inventory/csv/import` (ใหม่, PRO-gate)

Import stockQty เป็น batch จาก rows ที่ client parse แล้ว (ดู SDS TD-DSP-05 เหตุผล client-parse). Trace: SDS §3.3 → SRS TFR-DSP-10 → BRD FR-DSP-10

**Request Body:**
```json
{ "rows": [{ "productId": "uuid", "stockQty": 15 }, { "productId": "uuid", "stockQty": 0 }] }
```
| field | type | req | คำอธิบาย |
|-------|------|-----|----------|
| `rows` | `array, 1-500 items` | yes | แต่ละแถว = `{productId: uuid, stockQty: integer>=0}` |

**Valibot:** `CsvImportSchema`

**Success 200:**
```json
{
  "totalRows": 2,
  "successCount": 1,
  "errorCount": 1,
  "results": [
    { "row": 1, "productId": "uuid-1", "status": "OK", "resultingQty": 15 },
    { "row": 2, "productId": "uuid-2", "status": "ERROR", "error": "PRODUCT_NOT_FOUND" }
  ]
}
```
**หมายเหตุสำคัญ:** HTTP 200 เสมอถ้า request ผ่าน validation ระดับ body (ไม่ใช่ per-row) — ความล้มเหลวรายแถวอยู่ใน `results[]` ไม่ใช่ HTTP error code (ตรง FR-DSP-10-AC-03 "รายงานว่าแถวไหนล้มเหลว ไม่ทำให้ทั้งไฟล์ fail เงียบ ๆ")

**Errors (level request ทั้งก้อน เท่านั้น):**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `rows` ว่าง/เกิน 500/schema ผิด | `{ "error": "นำเข้าได้สูงสุด 500 แถวต่อครั้ง" }` หรือ `{ "error": "Invalid input" }` |
| 401 | ไม่มี session | `{ "error": "unauthorized" }` |
| 403 | entitlement ไม่ใช่ `ACTIVE+PRO` | `{ "error": "INVENTORY_NOT_PRO" }` |
| 429 | rate-limit | `{ "error": "Rate limit exceeded" }` |

**Per-row error codes (ใน `results[].error`):**
| Code | ความหมาย |
|------|----------|
| `PRODUCT_NOT_FOUND` | `productId` ไม่พบ หรือไม่ใช่ของ shop นี้ |
| `PRODUCT_NOT_PHYSICAL` | product `type !== 'PHYSICAL'` |
| `CONCURRENT_MODIFICATION` | stockQty เปลี่ยนไปแล้วระหว่าง import (compare-and-swap ชน) — แนะนำลองใหม่ |

**maxDuration:** แนะนำ `export const maxDuration = 30` (วินาที) — 500 sequential per-row transaction อาจใช้เวลานาน (ดู SDS §7.1 ความเสี่ยง)

---

### 4.8 `POST /api/products` / `PATCH /api/products/[id]` (ขยาย — `lowStockThreshold`)

**Request Body (เพิ่ม field):**
| field | type | req | คำอธิบาย |
|-------|------|-----|----------|
| `lowStockThreshold` | `number \| null` | no | undefined=ไม่แตะ, `null`=ปิด alert explicit, `number>=0`=ตั้งค่า |

**Valibot:** เพิ่มเข้า `CreateProductSchema`/`UpdateProductSchema`

**Response:** เดิม (`serializeProduct()`) — เพิ่ม `lowStockThreshold: number | null`

**Errors (เพิ่ม):**
| Status | เงื่อนไข | body |
|--------|----------|------|
| 400 | `lowStockThreshold` ส่งมาแต่ `type !== 'PHYSICAL'` | `{ "error": "STOCK_QTY_INVALID_PRODUCT_TYPE" }` |
| 400 | `lowStockThreshold` ส่งมาแต่สินค้ายังไม่ track (`stockQty` effective = null) | `{ "error": "PRODUCT_NOT_TRACKED" }` |
| 403 | `lowStockThreshold` ส่งมาแต่ entitlement ไม่ใช่ `ACTIVE+PRO` | `{ "error": "INVENTORY_NOT_PRO" }` |

**Side-effects:** ไม่มี extra query เมื่อ `lowStockThreshold===undefined` (backward-compat — เหมือน TFR-DSP-12)

---

### 4.9 `POST /api/orders` (ไม่เปลี่ยน request/response contract)

**Behavior เปลี่ยน (internal, ไม่ใช่ contract):** เมื่อ entitlement ACTIVE และมีสินค้า tracked ถูกตัด → นอกจาก `stockQty` ที่ตัดแล้ว (เหมือน 00003) ตอนนี้ยัง insert `StockMovement` (source=`ORDER_DEDUCT`, refId=order.id) เสมอ — record-always ไม่ว่า package ไหน ไม่มี field ใหม่ใน response (StockMovement เป็น internal, ไม่ serialize ออก)

**Error case เดิม (00003) ยังคงอยู่:** `400 { "error": "สินค้าหมดสต็อก: ..." }`

---

### 4.10 `POST /api/orders/[token]/cancel` (ไม่เปลี่ยน request/response contract)

**Behavior เปลี่ยน (internal):** restock เดิม (00003) บวก insert `StockMovement` (source=`ORDER_RESTOCK`, refId=order.id) เสมอเมื่อ restock เกิดขึ้นจริง (skip ถ้า product ถูก untrack ไปแล้วระหว่างทาง — ไม่ insert delta=0)

---

### 4.11 `POST /api/cron/inventory-renewal` (external contract ไม่เปลี่ยน)

Auth/response shape เหมือน 00003 เป๊ะ (`{processed, renewed, locked, errors}`, `CRON_SECRET` bearer) — **เปลี่ยนเฉพาะ internal**: ราคาที่หักคือ `PACKAGE_PRICE[entitlement.package]` แทน ฿199 คงที่; renew ล้มเหลวของ shop package=PRO → LOCKED ทันที **ไม่มี fallback หัก BASIC** (OD-A)

---

## 5. Error Code Table (รวม)

| Status | ความหมาย | เงื่อนไข |
|--------|----------|----------|
| 400 | Validation/business rule ผิด | Valibot ผิด, `STOCK_QTY_INVALID_PRODUCT_TYPE`, `PRODUCT_NOT_TRACKED`, `INSUFFICIENT_STOCK`, `OutOfStockError`, CSV row cap เกิน |
| 401 | ไม่มี session (seller) / `CRON_SECRET` ผิด (cron) | เหมือน 00003 |
| 402 | เครดิตไม่พอ | `INSUFFICIENT_CREDIT` (subscribe/upgrade/reactivate — เทียบราคาตาม package) |
| 403 | Permission/CSRF/Package-gate | `INVENTORY_NOT_ACTIVE` (status!=ACTIVE), `INVENTORY_NOT_PRO` (**ใหม่** — ACTIVE แต่ package≠PRO), CSRF Origin ผิด |
| 404 | Not Found | ไม่พบ shop, `PRODUCT_NOT_FOUND` |
| 409 | Conflict | `ENTITLEMENT_ALREADY_EXISTS`, `ENTITLEMENT_NOT_LOCKED`, `ENTITLEMENT_NOT_ACTIVE` (**ใหม่** — upgrade ที่ไม่ ACTIVE), `ALREADY_PRO` (**ใหม่**) |
| 429 | Too Many Requests | rate-limit เกิน |

| กรณี | message/code |
|------|--------------|
| subscribe/upgrade/reactivate เครดิตไม่พอ | ข้อความต่างกันตาม endpoint (ดู §4.1-4.3) |
| upgrade ทั้งที่ไม่ ACTIVE | `"ยังไม่ได้สมัครใช้งาน หรือถูกล็อกอยู่"` |
| upgrade ทั้งที่เป็น PRO อยู่แล้ว | `"ใช้งาน Deep Stock Pro อยู่แล้ว"` |
| manual adjust สต็อกไม่พอ | `"สต็อกไม่พอ: {productName}"` |
| manual adjust สินค้าไม่ track | `"PRODUCT_NOT_TRACKED"` |
| PRO-only action แต่ package=BASIC | `"INVENTORY_NOT_PRO"` |
| CSV แถวเกิน 500 | `"นำเข้าได้สูงสุด 500 แถวต่อครั้ง"` |
| CSV แถว concurrent modification | `"CONCURRENT_MODIFICATION"` (ใน `results[].error`, ไม่ใช่ HTTP-level) |

---

## 6. Sequence Diagrams

ดู [[SRS]] §4.2-4.6 (Upgrade, Renewal package-aware, Manual Adjustment, Low-stock query-time, CSV import per-row) — ไม่ duplicate ที่นี่เพื่อกัน drift ระหว่างเอกสาร

---

## 7. Traceability

| Endpoint | SDS Component | SRS TFR | BRD FR |
|----------|----------------|---------|--------|
| `POST /api/inventory/subscribe` | §3.2 `subscribeInventoryEntitlement(shopId, pkg)` | TFR-DSP-03 | FR-DSP-03 |
| `POST /api/inventory/upgrade` | §3.2 `upgradeToProEntitlement` | TFR-DSP-04 | FR-DSP-04 |
| `POST /api/inventory/reactivate` | §3.2 `reactivateInventoryEntitlement(shopId, pkg)` | TFR-DSP-07 | FR-DSP-07 |
| `POST /api/inventory/stock/adjust` | §3.3 `manualAdjustStock` | TFR-DSP-01 | FR-DSP-01 |
| `GET /api/inventory/movements` | §3.3 `getStockMovementHistory` | TFR-DSP-09 | FR-DSP-09 |
| `GET /api/inventory/csv/export` | §3.3 `exportStockToCsv` | TFR-DSP-10 | FR-DSP-10 |
| `POST /api/inventory/csv/import` | §3.3 `importStockFromCsvRows` | TFR-DSP-10 | FR-DSP-10 |
| `POST/PATCH /api/products*` (`lowStockThreshold`) | §3.5-3.6 | TFR-DSP-08b | FR-DSP-08 |
| `POST /api/orders` (StockMovement insert) | §3.4 `order.service.createOrder` + TD-DSP-01/02 | TFR-DSP-09 | FR-DSP-09 |
| `POST /api/orders/[token]/cancel` (StockMovement insert) | §3.4 `order.service.cancelOrder` | TFR-DSP-09 | FR-DSP-09 |
| `POST /api/cron/inventory-renewal` (internal) | §3.2 `renewOrLockEntitlement` (package-aware) | TFR-DSP-06 | FR-DSP-06 |
| `/notifications` (ไม่ใช่ API แยก — RSC query ผ่าน `activity.service`) | §3.7 source 5 | TFR-DSP-08 | FR-DSP-08 (OD-E) |
| Admin `topups/[id]` badge (ไม่ใช่ API แยก) | — | TFR-DSP-11 | FR-DSP-11 |

---

## 8. สรุป + Open Questions

API contract ครบสำหรับ DEV implement + QA วางแผน negative case ทุก endpoint ใหม่/ขยาย 12 endpoint (3 แก้ breaking, 6 ใหม่, 2 ขยาย additive, 1 internal-only unchanged-contract)

**Prerequisite บังคับ (ไม่ใช่ open question):** migration ของ [[DATABASE]] ต้อง apply ก่อน implement ใด ๆ ที่แตะ `InventoryEntitlement.package`/`StockMovement`/`Product.lowStockThreshold`

**Breaking signature ที่กระทบ caller เดิม (internal, ไม่ใช่ public API แต่ dev ต้อง sync ในคอมมิตเดียว):**
```typescript
// subscribeInventoryEntitlement/reactivateInventoryEntitlement: เพิ่ม param pkg
// shouldWarnAdvance: entitlement param เพิ่ม field package
// WALLET_DESC: object ของ string → object ของ function
// deductStockForOrderItems: return Set<string> → Map<string, {qty, resultingQty, name}>
// restockFromCancelledOrder: เพิ่ม param shopId
```

**Open Questions:**
1. `INVENTORY_NOT_PRO` vs อาจใช้ `INVENTORY_NOT_ACTIVE` ผสมกันสำหรับกรณี "status ACTIVE แต่ package ผิด" — เอกสารนี้แยก error code ชัดเจน (403 ต่างข้อความ) เพื่อ UX ที่ชี้ทาง "อัพเกรดเป็น Pro" ได้ตรงจุด แทนที่จะบอกกำกวมว่า "ไม่ ACTIVE" ทั้งที่จริง ACTIVE อยู่แล้ว — ไม่ block implement, Controller ยืนยันได้
2. CSV import `maxDuration=30` เป็นค่าประมาณ — ถ้า QA พบ 500-row import ใช้เวลาเกิน ต้องปรับ (ไม่ block MVP)
3. `WalletTransaction.reason` reconciliation (DATABASE.md §3.4) — endpoint นี้ implement ตามที่ SRS §16 adopt ไว้ (machine-key) แต่รอ user confirm final

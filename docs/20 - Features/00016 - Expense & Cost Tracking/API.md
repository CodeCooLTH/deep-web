---
title: "API — Expense & Cost Tracking"
owner: shinobu22
status: draft
module: M00016-ExpenseCostTracking
version: "1.0"
created: 2026-07-08
tags: [feature, expense, cost, profit, pnl, seller, api]
related: ["[[SDS]]", "[[SRS]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00016-ExpenseCostTracking
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-08
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA (ดู [[Feature-Docs-Ownership]])

# API Contract: Expense & Cost Tracking

---

## 1. Overview

API ชุดนี้รองรับการออกแบบใน [[SDS]] §3-6 — เพิ่ม 4 endpoint ใหม่ (CRUD expense + report + toggle) และแก้ 2 endpoint เดิม (product create/update — เพิ่ม field `cost` + gate) provider คือ Next.js 16 Route Handler (nodejs runtime) ทั้งหมด, ผู้บริโภคคือ seller browser (`(paces)/seller/**`)

- **เอกสารออกแบบต้นทาง:** [[SDS]] ของโมดูลนี้
- **Base URL:** `https://seller.deepthailand.app` (prod), `https://seller.deepth.local` (dev)
- **Content-Type:** `application/json` (ทุก endpoint ของโมดูลนี้)
- **Convention:** response envelope ตรง (ไม่มี wrapper `{data, meta}`) — ตรง convention เดิมของ `src/app/api/**` ทั้งหมด

---

## 2. Authentication

| รายการ | ค่า |
|--------|-----|
| **วิธี (Auth Method)** | NextAuth v4 session cookie (JWT strategy) |
| **Header** | cookie อัตโนมัติจาก browser |
| **Token/Scope** | Session ผูกกับ `User.id` — ทุก endpoint ต้องการ "login แล้ว" + ผ่าน `resolveExpenseAccess()` (ยกเว้น finance-visibility toggle ที่เช็ค owner ตรง ไม่ผ่าน `resolveExpenseAccess`) |
| **กรณีไม่ผ่าน** | `401 { "error": "unauthorized" }` |
| **CSRF/Rate-limit** | ทุก mutation route (`POST`/`PATCH`/`DELETE`) ผ่าน `guardApi()` ใน `src/proxy.ts` อัตโนมัติ (Origin-check + rate-limit ต่อ IP, auth 30/min) — ไม่ต้องแก้ `proxy.ts` |

---

## 3. Endpoint List

| Method | Path | คำอธิบาย | สถานะ |
|--------|------|----------|-------|
| `POST` | `/api/expenses` | สร้าง Expense | **ใหม่** |
| `GET` | `/api/expenses` | รายการ Expense | **ใหม่** |
| `PATCH` | `/api/expenses/{id}` | แก้ไข Expense | **ใหม่** |
| `DELETE` | `/api/expenses/{id}` | ลบ Expense | **ใหม่** |
| `GET` | `/api/expenses/report` | รายงาน P&L | **ใหม่** |
| `PATCH` | `/api/business/shops/{shopId}/finance-visibility` | Toggle `staffCanViewFinance` | **ใหม่** |
| `POST` | `/api/products` | สร้างสินค้า | แก้ไข (เพิ่ม field `cost`) |
| `PATCH` | `/api/products/{id}` | แก้สินค้า | แก้ไข (เพิ่ม field `cost`) |

---

## 4. Endpoint Detail

### 4.1 `POST /api/expenses`

**Auth:** Session required + `resolveExpenseAccess()` ต้อง `GRANTED`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Body | `category` | `string` (1 ใน 7 ค่า) | yes | `RENT`/`PACKAGING`/`ADVERTISING`/`SHIPPING`/`SALARY`/`UTILITIES`/`OTHER` |
| Body | `amount` | `number` | yes | `> 0` |
| Body | `expenseDate` | `string` ("YYYY-MM-DD") | no | ไม่ส่ง = default วันนี้ (Thai calendar date) |
| Body | `note` | `string` (≤500 chars) | no | — |

Valibot schema (`src/lib/validations.ts`):
```ts
export const CreateExpenseSchema = v.object({
  category: v.picklist(EXPENSE_CATEGORIES),
  amount: v.pipe(v.number(), v.minValue(0.01)),
  expenseDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  note: v.optional(v.pipe(v.string(), v.maxLength(500))),
});
```

**Response — Success (201)**

```json
{
  "id": "...",
  "shopId": "...",
  "category": "ADVERTISING",
  "amount": 1500,
  "expenseDate": "2569-07-08",
  "note": "ค่า boost โพสต์ FB",
  "createdByUserId": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 400 | body invalid (Valibot parse fail) |
| 401 | ไม่มี session |
| 403 | `resolveExpenseAccess` = `PACKAGE_LOCKED`/`STAFF_NOT_ALLOWED` |
| 404 | `resolveExpenseAccess` = `NO_SHOP` |

---

### 4.2 `GET /api/expenses`

**Auth:** Session required + `resolveExpenseAccess()` ต้อง `GRANTED`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Query | `start` | `string` ("YYYY-MM-DD") | no | ช่วง `expenseDate` เริ่ม — ไม่ส่ง = ไม่กรอง |
| Query | `end` | `string` ("YYYY-MM-DD") | no | ช่วง `expenseDate` สิ้นสุด (inclusive) — ต้องมาคู่กับ `start` |

**Response — Success (200)**

```json
[
  { "id": "...", "shopId": "...", "category": "RENT", "amount": 8000, "expenseDate": "2569-07-01", "note": null, "createdByUserId": "...", "createdAt": "...", "updatedAt": "..." }
]
```

เรียงจาก `expenseDate` ล่าสุดก่อน (`orderBy: { expenseDate: 'desc' }`)

**Error contract:** เหมือน §4.1 (401/403/404) — ไม่มี 400 เพราะ query param เป็น optional ทั้งคู่ (ถ้าส่งมาแค่ตัวเดียว → ignore ทั้งคู่ ปฏิบัติเหมือนไม่กรอง — defensive, ไม่ error)

---

### 4.3 `PATCH /api/expenses/{id}`

**Auth:** Session required + `resolveExpenseAccess()` ต้อง `GRANTED` + record ต้องเป็นของ active shop เดียวกัน

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `id` | `string` (uuid) | yes | `Expense.id` |
| Body | `category`/`amount`/`expenseDate`/`note` | ตาม §4.1 | no (ทั้งหมด optional — partial update) | omit = ไม่แตะ field นั้น |

**Response — Success (200):** shape เดียวกับ §4.1

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 400 | body invalid |
| 401 | ไม่มี session |
| 403 | `PACKAGE_LOCKED`/`STAFF_NOT_ALLOWED` |
| 404 | `NO_SHOP`, หรือ `id` ไม่พบ, หรือ `expense.shopId !== active.shop.id` (**คืน 404 เดียวกัน — ไม่ leak** ตาม BRD FR-EXP-04-AC-03) |

---

### 4.4 `DELETE /api/expenses/{id}`

**Auth:** เหมือน §4.3

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `id` | `string` (uuid) | yes | — |

**Response — Success (200)**

```json
{ "deleted": true }
```

**Error contract:** เหมือน §4.3 (ไม่มี 400 เพราะไม่มี body)

---

### 4.5 `GET /api/expenses/report`

**Auth:** Session required + `resolveExpenseAccess()` ต้อง `GRANTED`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Query | `range` | `string` (`today`/`7d`/`30d`/`month`/`custom`) | no | default `today` |
| Query | `start` | `string` ("YYYY-MM-DD") | เมื่อ `range=custom` | — |
| Query | `end` | `string` ("YYYY-MM-DD") | เมื่อ `range=custom` | — |

Valibot schema (manual parse — query params ไม่ใช่ JSON body):
```ts
export const PnlReportQuerySchema = v.object({
  range: v.optional(v.picklist(['today', '7d', '30d', 'month', 'custom']), 'today'),
  start: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  end: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
});
```

**Response — Success (200)**

```json
{
  "range": { "start": "2569-07-01", "end": "2569-07-08" },
  "revenue": 50000,
  "cogs": 28000,
  "grossProfit": 22000,
  "totalExpense": 5000,
  "netProfit": 17000,
  "orderCount": 20,
  "hasMissingCost": true
}
```

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 400 | `range=custom` แต่ไม่ส่ง `start`/`end` (หรือ format ผิด) |
| 401 | ไม่มี session |
| 403 | `PACKAGE_LOCKED`/`STAFF_NOT_ALLOWED` |
| 404 | `NO_SHOP` |

---

### 4.6 `PATCH /api/business/shops/{shopId}/finance-visibility`

Owner-only — **ไม่ผ่าน `resolveExpenseAccess()`** (มิเรอร์ guard ของ `api/business/shops/[shopId]/onboarding/route.ts` — สงวนสิทธิ์เจ้าของเท่านั้น ไม่ใช่ admin member)

**Auth:** Session required + `shop.userId === session.user.id`

**Request**

| ส่วน | ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|------|-------|------|--------|----------|
| Path Param | `shopId` | `string` (uuid) | yes | ต้องเป็น `kind=BUSINESS` |
| Body | `staffCanViewFinance` | `boolean` | yes | — |

**Response — Success (200)**

```json
{ "ok": true, "staffCanViewFinance": true }
```

**Error contract:**

| Status | เงื่อนไข |
|--------|----------|
| 400 | body invalid |
| 401 | ไม่มี session |
| 403 | `NOT_OWNER` (`shop.userId !== session.user.id`) |
| 404 | ไม่พบ shop, หรือ `kind !== 'BUSINESS'` |

---

### 4.7 `POST /api/products` (แก้ไข — เพิ่ม field `cost`)

ไม่เปลี่ยน method/path/auth เดิม — เปลี่ยนเฉพาะ validation + logic เพิ่ม

**Request (เฉพาะ field ที่เพิ่ม)**

| ฟิลด์ | ชนิด | บังคับ | คำอธิบาย |
|-------|------|--------|----------|
| `cost` | `number` (≥0) | no | ราคาทุน — omit = ไม่ตั้ง (`null`) |

Valibot schema เพิ่ม (`CreateProductSchema`):
```ts
cost: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
```

**Logic เพิ่ม:** ถ้า `parsed.output.cost !== undefined` → เรียก `isCostEditAllowed(shop)` (`expense-access.service.ts`) ก่อน — ไม่ผ่าน → `403`

**Error contract เพิ่ม:**

| Status | เงื่อนไข |
|--------|----------|
| 403 | `COST_REQUIRES_BUSINESS_PACKAGE` — ส่ง `cost` มาโดยที่ owner ของร้านไม่มี Business Package ACTIVE |

**ไม่กระทบ:** สินค้าที่สร้างโดยไม่ส่ง `cost` เลย — behavior เหมือนเดิม 100%

---

### 4.8 `PATCH /api/products/{id}` (แก้ไข — เพิ่ม field `cost`)

เหมือน §4.7 — เพิ่ม guard เดียวกัน (`isCostEditAllowed(product.shop)`) ต่อจาก guard `stockQty`/`lowStockThreshold` เดิมในไฟล์เดียวกัน

**Request/Response/Error:** เหมือน §4.7 (partial — `cost` omit = ไม่แตะ, `null` = ล้างค่า, ตัวเลข = ตั้งค่าใหม่)

---

## 5. Error Code Table

| Error Code | HTTP Status | ความหมาย/เงื่อนไข |
|------------|-------------|----------------------|
| `COST_REQUIRES_BUSINESS_PACKAGE` | `403` | (ใหม่) พยายามตั้ง/แก้ `Product.cost` โดยไม่มี Business Package ACTIVE |
| `NOT_OWNER` | `403` | (finance-visibility เท่านั้น) ผู้เรียกไม่ใช่ `Shop.userId` |
| *(generic, ไม่มี code field)* `unauthorized` | `401` | ไม่มี session |
| *(generic)* — | `403` | `resolveExpenseAccess` = `PACKAGE_LOCKED`/`STAFF_NOT_ALLOWED` (ทุก endpoint ของ Expense/report) |
| *(generic)* `Invalid input` | `400` | Valibot parse fail (ทุก endpoint ที่มี body/query schema) |
| *(generic)* — | `404` | `resolveExpenseAccess` = `NO_SHOP`, หรือ Expense record ไม่พบ/ไม่ตรง shop, หรือ shop ไม่พบ/ไม่ใช่ BUSINESS (finance-visibility) |

**โครง error response มาตรฐาน (คงเดิมจากทั้งระบบ):**

```json
{ "error": "ข้อความ/error code สำหรับ debug" }
```

---

## 6. Sequence (flow ซับซ้อน)

ดู [[SDS]] §4.1-4.6 สำหรับ sequence diagram เต็มของทุก flow (access resolve, สร้าง expense, ดูรายงาน, cost snapshot, toggle) — ไม่ duplicate ที่นี่เพื่อไม่ให้ diagram สอง version drift กัน

---

## 7. Traceability

| Endpoint | SDS Component/Decision | BRD FR |
|----------|--------------------------|--------|
| `POST /api/expenses` | §4.3 Flow, TD-004 | FR-EXP-03 |
| `GET /api/expenses` | `expense.service.ts::listExpenses` | FR-EXP-03/09/10/11 |
| `PATCH /api/expenses/{id}` | TD-004 | FR-EXP-04 |
| `DELETE /api/expenses/{id}` | TD-004 | FR-EXP-04 |
| `GET /api/expenses/report` | §4.2, §4.4 Flow | FR-EXP-06, FR-EXP-07, FR-EXP-08 |
| `PATCH /api/business/shops/{shopId}/finance-visibility` | §4.6 Flow | FR-EXP-10 |
| `POST /api/products` | §4.1 (`isCostEditAllowed`) | FR-EXP-01 |
| `PATCH /api/products/{id}` | §4.1 (`isCostEditAllowed`) | FR-EXP-01 |

---

## 8. สรุป (Summary)

API Contract นี้ครอบคลุมทุก endpoint ของ Expense & Cost Tracking: 6 endpoint ใหม่ (CRUD expense × 4, report, toggle) และ 2 endpoint แก้ไข (product create/update เพิ่ม field `cost` + gate ด้วย `isCostEditAllowed`) — ทุก endpoint reuse CSRF/rate-limit เดิมของ `proxy.ts` โดยไม่ต้องแก้ proxy, gate สิทธิ์ทั้งหมดผ่านจุดเดียว (`resolveExpenseAccess()`) ยกเว้น finance-visibility toggle ที่สงวนสิทธิ์ owner ตรง

**Open Questions:**
- UI ของ date-range switcher/ExpenseForm/PnlReportCard/locked-upsell state — ต้องผ่าน `safepay-ux` ก่อน (endpoint ที่ต้องเรียกชัดเจนแล้วทั้งหมดในเอกสารนี้)

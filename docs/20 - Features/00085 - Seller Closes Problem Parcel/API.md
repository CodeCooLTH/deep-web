---
title: "API — 00085 ปิดพัสดุมีปัญหาโดยร้าน"
owner: shinobu22
status: draft
created: 2026-10-26
tags: [feature, api, shipment]
related: ["[[SRS]]", "[[SDS]]", "[[TestCase]]"]
---

> **โมดูล:** 00085 · **เวอร์ชัน:** 1.0 · **วันที่:** 2026-10-26

# API: ปิด/เลิกปิดพัสดุมีปัญหา

## 1. Endpoints
ไฟล์: `src/app/api/seller/shipments/[id]/problem-close/route.ts` (`export const dynamic = "force-dynamic"`; ทุกคำตอบ `cache-control: private, no-store` ผ่าน `ishipJson`)

| Method | Path | ทำอะไร | สิทธิ์ |
|---|---|---|---|
| GET | `/api/seller/shipments/{id}/problem-close?shopId=` | preview ผลตัดสิน (ไม่เขียนอะไร) | S1 |
| POST | `…/problem-close?shopId=` | ปิด | S1 |
| DELETE | `…/problem-close?shopId=` | เลิกปิด | S1 |

Auth: `requireGeneralShop({cap:'S1', shopId: readIShipShopIdFromQuery(request)})` → 401 ไม่ล็อกอิน · 403 `FORBIDDEN` ไม่ใช่สมาชิก/ไม่มี S1 · 403 `NOT_ELIGIBLE` ร้านไม่ใช่ ONLINE_SALES (รวมร้านบริการ — F3) · แล้ว service เทียบ `shipment.shopId` กับ `guard.shopId` ไม่ตรง ⇒ 404

## 2. Schema (Valibot — `src/lib/validations.ts`)
```ts
export const ParcelCloseBodySchema = v.pipe(
  v.object({
    reason: v.picklist(['FIRE', 'LOST', 'DAMAGED', 'OTHER']),
    note: v.optional(v.pipe(v.string(), v.trim(), v.minLength(5), v.maxLength(200))),
    expectedOutcome: v.picklist(['DELIVERY_FAILED', 'LOST_ON_RETURN']),
    refunded: v.optional(v.boolean()),
  }),
  v.forward(v.check((b) => b.reason !== 'OTHER' || !!b.note, 'OTHER ต้องมีข้อความ 5–200 ตัวอักษร'), ['note']),
)
```
`note` ของเหตุผลที่ไม่ใช่ OTHER ถูกทิ้ง (เก็บ null) · `refunded` เมื่อไม่จำเป็นถูกทิ้ง

## 3. รายละเอียด
### GET
```json
{
  "eligible": true, "blockedBy": null,
  "outcome": "LOST_ON_RETURN", "basis": "DELIVERED_AT",
  "deliveredAt": "2026-10-20T03:00:00.000Z",
  "eventCount": 0,
  "paymentIsCod": false, "needsRefundAnswer": true,
  "effect": { "countsAsSale": null, "outboundShippingCostKept": true }
}
```
`countsAsSale`: A → false · B+COD → false · B+โอน → null (ขึ้นกับคำตอบ) · `eligible:false` ⇒ `blockedBy` เป็นรหัสจาก `canCloseParcelProblem` (GET ตอบ 200 ได้เสมอ เพื่อให้ UI ซ่อนปุ่ม)
### POST
Request ตาม §2 · Response 200: `{ "closed": true, "outcome": "...", "basis": "...", "excludesRevenue": true, "shipment": <ShipmentViewJson> }`
### DELETE
Response 200: `{ "reopened": true, "shipment": <ShipmentViewJson> }`

## 4. Error → HTTP (ตาราง "service throw → route catch" บังคับ)
Service โยน `ParcelCloseError` (ใหม่ใน `parcel-close.service.ts`, มี `code`). Route มี `mapParcelCloseError()` ในไฟล์ route เองแล้ว fallback `mapIShipError` (`lib/iship/route-helpers.ts:43`) สำหรับ error อื่น — **ถ้าไม่มี branch นี้ คลาสใหม่จะตกเป็น 500** (บทเรียน 00003 `OutOfStockError`)

| code | HTTP | เมื่อ |
|---|---|---|
| `VALIDATION` | 400 | body ไม่ผ่าน Valibot (รวม OTHER ไม่มีข้อความ / ข้อความนอก 5–200) |
| `REFUND_ANSWER_REQUIRED` | 400 | B + ไม่ใช่ COD + ไม่ส่ง `refunded` |
| `UNAUTHORIZED` | 401 | จาก guard |
| `FORBIDDEN` / `NOT_ELIGIBLE` | 403 | จาก guard (ไม่มี S1 / ไม่ใช่ ONLINE_SALES) |
| `NOT_FOUND` | 404 | ไม่มีพัสดุ หรือ `shipment.shopId` ไม่ตรงร้าน |
| `ALREADY_CLOSED` | 409 | ปิดซ้ำ / แพ้ conditional update |
| `NOT_IN_PROBLEM` | 409 | ไม่อยู่กอง PROBLEM (รวมสถานะเปลี่ยนระหว่างอ่านกับเขียน) |
| `NOT_FORWARD` | 409 | พัสดุขากลับ (RETURN) |
| `NOT_ACTIVE` | 409 | status ≠ CREATED หรือ dry-run |
| `ORDER_FINISHED` | 409 | CANCELLED/RETURNED/DRAFTED (ทั้งปิดและเลิกปิด) |
| `NOT_SHIPPED_MODE` | 409 | `fulfillmentMode ≠ SHIPPED` |
| `SERVICE_SHOP_UNSUPPORTED` | 409 | ด่านสำรองที่ service (route ปกติได้ 403 ก่อน) |
| `OUTCOME_CHANGED` | 409 | `expectedOutcome` ≠ ผลที่ server คำนวณ (ตัว body มี preview ใหม่) |
| `NOT_CLOSED` | 409 | DELETE ใบที่ไม่ได้ปิด |
| อื่น ๆ | 500 | `console.error` + ข้อความทั่วไป ไม่รั่ว stack |

UI ต้องมี toast/Swal ต่อ 409 ทุกรหัส (`ALREADY_CLOSED` → โหลดแผงใหม่; `OUTCOME_CHANGED` → เปิด modal ด้วยผลใหม่)

## 5. Idempotency / ความพร้อมกัน
- POST: conditional `updateMany` (TFR-003) ⇒ N คำขอพร้อมกันได้ผู้ชนะ 1 ที่เหลือ 409 `ALREADY_CLOSED` · `OrderEvent` 1 แถว
- DELETE: conditional `WHERE problemClosedAt IS NOT NULL` ⇒ คำขอซ้ำ 409 `NOT_CLOSED`
- ไม่มี rate limit เพิ่ม

## 6. Capability
`src/lib/route-capabilities.ts`: เพิ่มบรรทัดหลัง `:419` ตาม SRS TFR-010 (เทส declare-all-routes จะแดงถ้าลืม)

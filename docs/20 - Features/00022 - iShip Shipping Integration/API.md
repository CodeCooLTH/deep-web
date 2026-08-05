---
title: "API — iShip Shipping Integration"
owner: shinobu22
status: draft
created: 2026-07-26
tags: [api, feature, 00022, iship]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[DATABASE]]"]
---

> **โมดูล:** 00022 — iShip Shipping Integration
> **ประเภทเอกสาร:** API Reference
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-26
> **เจ้าของเอกสาร:** safepay-planner

# API: เชื่อมระบบขนส่ง iShip

เอกสารนี้แยกเป็น 2 ฝั่ง — **ฝั่ง A** คือ API ที่เราสร้าง, **ฝั่ง B** คือ API ของ iShip ที่เราไปเรียก

---

## กติกาที่ใช้กับทุก endpoint ฝั่ง A

**Guard 3 ชั้น (ตามลำดับ):**

1. session มีอยู่ + เป็นสมาชิกของร้านนั้น → ไม่ผ่าน = `401` / `403`
2. `Shop.vertical === "GENERAL"` → ไม่ผ่าน = **`403 NOT_ELIGIBLE`** (BR-ISHIP-02 — ซ่อน UI ไม่ใช่การบังคับสิทธิ์)
3. กลุ่มตั้งค่า/token ต้องเป็นเจ้าของร้าน → พนักงานร้าน = `403 OWNER_ONLY`

**Cache:** ทุก route ผูกกับผู้ใช้ → `export const dynamic = "force-dynamic"` + `cache-control: private, no-store`
(บทเรียนจริง: API auth ที่ default เป็น `public` เคยทำให้ตัวกลาง/เครือข่ายมือถือ cache ข้อมูลข้ามผู้ใช้)

**Token:** 🛑 ไม่มี response ใดคืนค่า token ไม่ว่าเต็มหรือบางส่วนเกิน 4 ตัวท้าย

**รูป error มาตรฐาน:**

```json
{ "error": { "code": "ADDRESS_INVALID", "message": "ข้อความไทยที่แสดงต่อร้านได้เลย" } }
```

| code | HTTP | ความหมาย |
|------|------|----------|
| `UNAUTHORIZED` | 401 | ไม่มี session |
| `FORBIDDEN` | 403 | ไม่ใช่สมาชิกร้านนี้ |
| `NOT_ELIGIBLE` | 403 | ร้านเป็น LODGING |
| `OWNER_ONLY` | 403 | ต้องเป็นเจ้าของร้าน |
| `NOT_CONNECTED` | 409 | ยังไม่ได้เชื่อมต่อ iShip |
| `SHIPMENT_EXISTS` | 409 | ออเดอร์นี้มีพัสดุที่ยังใช้งานอยู่ |
| `INCOMPLETE_DATA` | 422 | ข้อมูลไม่ครบ (มี `missing[]` บอกช่องที่ขาด) |
| `TOKEN_INVALID` | 502 | token ใช้ไม่ได้ (พร้อมตั้งสถานะการเชื่อมต่อ) |
| `INSUFFICIENT_BALANCE` / `ADDRESS_INVALID` / `COURIER_UNAVAILABLE` / `SHIPMENT_NOT_CANCELLABLE` | 502 | จาก iShip |
| `UPSTREAM_TIMEOUT` / `UPSTREAM_ERROR` | 504 / 502 | ติดต่อไม่ได้ |

---

## ฝั่ง A — API ของเรา

### A1. การเชื่อมต่อ

#### `GET /api/seller/iship/connection`
ดูสถานะการเชื่อมต่อ — **เจ้าของร้าน + พนักงาน**

```json
{
  "connected": true,
  "status": "ACTIVE",
  "tokenLast4": "0JeLG",
  "lastVerifiedAt": "2026-07-26T06:00:00.000Z",
  "senderComplete": true,
  "createMode": "ASK"
}
```
รองรับ: FR-ISHIP-002 · ไม่เชื่อมต่อ → `{ "connected": false }` (ไม่ใช่ 404)

#### `POST /api/seller/iship/connection`
วาง token + ทดสอบ + บันทึก — **เจ้าของร้านเท่านั้น**

```json
{ "token": "n2vGGmNIugg...0JeLG" }
```

ขั้นตอน: ทดสอบด้วย `GET /api/courier_code` ของ iShip → ผ่านจึงเข้ารหัสแล้วบันทึก (BR-ISHIP-11)
ตอบ `200` เหมือน `GET` · ทดสอบไม่ผ่าน = `502 TOKEN_INVALID` และ **ไม่บันทึก**
รองรับ: FR-ISHIP-001, BR-ISHIP-11/12/13

#### `POST /api/seller/iship/connection/verify`
ทดสอบการเชื่อมต่อซ้ำ — **เจ้าของร้านเท่านั้น** · ผลลบ → ตั้ง `status = TOKEN_INVALID` (BR-ISHIP-14)

#### `DELETE /api/seller/iship/connection`
ยกเลิกการเชื่อมต่อ — **เจ้าของร้านเท่านั้น**
ลบ token จริง, `status = DISCONNECTED`, **ประวัติพัสดุยังอยู่ครบ** (BR-ISHIP-15)

---

### A2. ค่าตั้งต้นของร้าน

#### `GET /api/seller/iship/settings`
คืนที่อยู่ผู้ส่ง + ค่าตั้งต้น + `createMode` — **เจ้าของร้าน + พนักงาน (อ่าน)**

#### `PUT /api/seller/iship/settings`
**เจ้าของร้านเท่านั้น**

```json
{
  "senderName": "ร้านของฝากแม่ปุ๊ก",
  "senderPhone": "0875405557",
  "senderAddress": "44/247 ซอยอ่อนนุช",
  "senderSubdistrict": "ประเวศ",
  "senderDistrict": "ประเวศ",
  "senderProvince": "กรุงเทพมหานคร",
  "senderPostcode": "10250",
  "defaultCourierCode": "FlashExpress",
  "defaultWeight": 1,
  "defaultWidth": 17, "defaultLength": 25, "defaultHeight": 9,
  "defaultCategoryId": 4,
  "defaultCodEnabled": false,
  "optOnTime": false, "optBoxShield": false,
  "optIsInsured": false, "optProductValue": null,
  "optServiceType": 1,
  "defaultRemark": "ห้ามโยน",
  "createMode": "ASK"
}
```

> `senderSubdistrict` = **ตำบล**, `senderDistrict` = **อำเภอ** (BR-ISHIP-31)

validation ดู SRS §10 · รองรับ: FR-ISHIP-010/011/012

---

### A3. ข้อมูลอ้างอิง (proxy ผ่านเรา — token ไม่ถึงเบราว์เซอร์)

| Endpoint | สิทธิ์ | คืน |
|----------|-------|-----|
| `GET /api/seller/iship/couriers` | เจ้าของ + พนักงาน | `[{ code, name }]` จาก iShip จริง (ไม่ใช่รายการที่เขียนตายในโค้ด) |
| `GET /api/seller/iship/boxes` | เจ้าของ + พนักงาน | `[{ id, name, width, length, height, unit }]` |

#### `POST /api/seller/iship/quote`
ราคาโดยประมาณ — รับ `orderId` + ค่าที่ override → คืน `{ price, totalPrice, weight, remoteArea }`
พร้อมหมายเหตุว่าเป็นค่าประมาณ (BR-ISHIP-34)

---

### A4. พัสดุ

#### `POST /api/seller/iship/shipments`
สร้างพัสดุจากคำสั่งซื้อ — **เจ้าของร้าน + พนักงาน**

```json
{
  "orderId": "uuid",
  "override": {
    "courierCode": "FlashExpress",
    "weight": 0.6, "width": 17, "length": 25, "height": 9,
    "categoryId": 4,
    "codAmount": 0,
    "remark": "ห้ามโยน",
    "options": { "onTime": false, "boxShield": false, "isInsured": false, "serviceType": 1 }
  }
}
```

ตอบ `201`:
```json
{
  "shipmentId": "uuid",
  "status": "CREATED",
  "trackingNo": "TH01479JWN6B",
  "courierCode": "FlashExpress",
  "courierName": "Flash Express",
  "isDryRun": false
}
```

- `409 SHIPMENT_EXISTS` เมื่อมีใบที่ยังใช้งานอยู่ (คืน `shipmentId` เดิมมาด้วย)
- `422 INCOMPLETE_DATA` พร้อม `missing: ["ตำบล","รหัสไปรษณีย์"]`
- `403 NOT_ELIGIBLE` ร้าน LODGING หรือออเดอร์ไม่เข้าเงื่อนไข

รองรับ: FR-ISHIP-020/021/022/023/024 · BR-ISHIP-22/25/26

#### `POST /api/seller/iship/shipments/[id]/retry`
ลองใหม่จากใบ `FAILED` — **ใช้ `idempotencyKey` เดิม ไม่สร้างแถวใหม่**

#### `POST /api/seller/iship/shipments/[id]/cancel`
ยกเลิกพัสดุ · สำเร็จ → `status = CANCELLED` + บันทึกผู้ยกเลิก
ยกเลิกไม่ได้ → `502 SHIPMENT_NOT_CANCELLABLE` พร้อมข้อความบอกให้ไปจัดการที่ iShip

#### `GET /api/seller/iship/shipments/[id]/traces`
ประวัติการเดินทาง — โหลดเมื่อผู้ใช้เปิดดูเท่านั้น (ไม่ prefetch)

---

### A5. ใบปะหน้า

#### `GET /api/seller/iship/shipments/[id]/label`
คืน `application/pdf` ขนาด A6 — **เจ้าของร้าน + พนักงานของร้านนั้นเท่านั้น**

🛑 **ต้อง proxy ผ่านเซิร์ฟเวอร์** — เบราว์เซอร์ห้ามยิงไปที่ iShip เอง เพราะจะต้องถือ token ไปด้วย
`Content-Disposition: inline` · อัปเดต `labelPrintedAt` + `labelPrintCount++`
พัสดุที่ `CANCELLED` → `409` · คนนอกร้าน → `403` แม้รู้ tracking

#### `POST /api/seller/iship/labels/bulk`
พิมพ์หลายใบ — `{ "shipmentIds": ["...", "..."] }` (สูงสุด 50)

คืน PDF รวม + header `X-Skipped-Count` และ body รายงานรายการที่ข้าม **เมื่อขอแบบ JSON**
(FR-ISHIP-031 บังคับว่าต้องบอกว่ารายการไหนถูกข้ามเพราะอะไร ห้ามเงียบ)

---

### A6. เรียกรถเข้ารับ

#### `POST /api/seller/iship/pickups`
`{ "courierCode": "FlashExpress", "parcelCount": 12, "remark": "พัสดุใหญ่ 2 กล่อง" }`
ที่อยู่ใช้ที่อยู่ผู้ส่งของร้าน · คืน `ticketPickupId` + ข้อมูลพนักงาน/ช่วงเวลา (ถ้ามี)

#### `POST /api/seller/iship/pickups/[id]/cancel`
ยกเลิกคำขอที่ยังไม่ถูกดำเนินการ

---

### A7. Webhook (จากภายนอกเข้ามา)

> 🛑 **ยังไม่เปิดใช้ในเวอร์ชันแรก** — `ISHIP_WEBHOOK_SECRET` ไม่ถูกตั้งบน production
> ทุกคำขอจึงได้ 404. สเปกด้านล่างคือสิ่งที่จะทำงานเมื่อเปิดใช้

#### `POST /api/webhooks/iship/[secret]`

- **ยกเว้นการตรวจ origin** ของ `guardApi` — คำขอมาจากผู้ให้บริการ ไม่ใช่จากเบราว์เซอร์เรา
- `secret` ไม่ตรง → `404` (ไม่ใช่ 403 — ไม่บอกว่ามี endpoint นี้อยู่)
- **ตอบ 200 ทันที** แล้วค่อยประมวลผล — ตอบช้าจะโดนยิงซ้ำรัว
- จับคู่ด้วย `ref_code` ก่อน แล้วค่อย `tracking` · จับคู่ไม่ได้ = ทิ้ง + บันทึกไว้ตรวจสอบ
- dedupe ด้วย `dedupeKey` (`<status>:<epoch>`)
- 🛑 **ห้ามเปลี่ยน `Order.status`** ไม่ว่ากรณีใด (BR-ISHIP-41)

payload สถานะพัสดุ:
```json
{
  "courier_code": "THP_eParcel", "ref_code": "APIS19613...", "tracking": "EA666581364TH",
  "status": "delivered", "status_desc": "จัดส่งสำเร็จ",
  "price": 24, "weight": 0.16, "width": 0, "length": 0, "height": 0,
  "is_over_size": false, "is_over_weight": false, "timestamp": 1671251342
}
```

payload สถานะรถเข้ารับ: `ticketPickupId`, `staffInfoName`, `staffInfoPhone`, `timeoutAtText`, `ticketMessage`, `status`, `status_text`, `accepted_at`, `closed_at`

---

## ฝั่ง B — API ของ iShip (ที่เราไปเรียก)

**Base URL:** `https://app.iship.cloud` (production) · ตั้งค่าได้ผ่าน `ISHIP_BASE_URL`
**Auth:** `Authorization: Bearer <token>` ทุกคำขอ
**Envelope:** `{ status: true|1, code: "0000", message|msg: "...", data: ... }` — บาง endpoint คืน array ตรง ๆ

| Endpoint | Method | ใช้ทำอะไร | ข้อควรระวัง |
|----------|--------|-----------|-------------|
| `/api/courier_code` | GET | รายชื่อขนส่งของบัญชี | **ใช้เป็นตัวทดสอบ token** — เบา ไม่ก่อค่าใช้จ่าย |
| `/api/boxes` | GET | กล่องมาตรฐาน | คืน array ตรง ๆ ไม่มี envelope |
| `/api/v2/check-price` | POST | ราคาโดยประมาณ | ต้องส่ง src/dst ครบทั้ง 4 ระดับ + ขนาด/น้ำหนัก |
| `/api/create_order` | POST | **เปิดพัสดุจริง** | 🛑 เสียเงินจริง · คืน `data.tracking_number` + `data.ref` |
| `/api/download/pdf?tracks=` | GET | ใบปะหน้า A6 | คืน PDF ดิบ ไม่ใช่ JSON · หลาย tracking คั่นด้วย comma · ตรวจ magic bytes `%PDF` |
| `/api/cancel_order` | POST | ยกเลิกพัสดุ | ทำได้ก่อนขนส่งรับของเท่านั้น |
| `/api/traces` | POST | ประวัติการเดินทาง | body `{ track_no }` → `data.trace_routes[]` |
| `/api/get_order/{track}` | GET | รายละเอียดพัสดุ | ใช้ยืนยันสถานะกลับ ไม่เชื่อ webhook อย่างเดียว |
| `/api/order_statuses` | GET | รายการสถานะทั้ง 15 | ใช้ทำตารางแปลสถานะ |
| `/api/request_courier` | POST | **เรียกรถเข้ารับ** | 🛑 เรียกคนจริงมาที่หน้าร้าน |
| `/api/cancel-notify/{id}` | GET | ยกเลิกคำขอเข้ารับ | |
| `/api/auth/requestToken` | POST | ขอ token ด้วย phone+password | **เราไม่ใช้** — ร้านวาง token เอง เราจึงไม่ต้องเก็บรหัสผ่าน |

### สถานะพัสดุทั้ง 15 (จาก `/api/order_statuses`)

| id | code | ไทย |
|----|------|-----|
| 1 | `order_success` | รอเข้ารับพัสดุ |
| 2 | `picked_up` | พัสดุเข้าระบบ |
| 3 | `delivered` | จัดส่งแล้ว |
| 4 | `issue` | พัสดุมีปัญหา |
| 5 | `cancelled` | ยกเลิก |
| 6 | `progress` | อยู่ระหว่างจัดส่ง |
| 7 | `cannot_pickup` | ไม่สามารถเข้ารับพัสดุ |
| 8 | `no_courier` | รอเลือกขนส่ง |
| 9 | `with_branch` | พัสดุถึงสถานีคัดแยก |
| 10 | `return` | พัสดุตีกลับ |
| 11 | `return_success` | ส่งคืนสำเร็จ |
| 12 | `payment_success` | ชำระเงินสำเร็จ |
| 13 | `in_transit` | อยู่ระหว่างขนส่ง |
| 14 | `cod_refund` | รายการขอเงินคืน |
| 15 | `is_expired` | หมดอายุ |

### หมวดพัสดุ (`category_id`)

`0` เอกสาร · `1` อาหารแห้ง · `2` ของใช้ · `3` อุปกรณ์ไอที · `4` เสื้อผ้า · `5` สื่อบันเทิง · `6` อะไหล่รถยนต์ · `7` รองเท้า/กระเป๋า · `8` อุปกรณ์กีฬา · `9` เครื่องสำอาง · `10` เฟอร์นิเจอร์ · `11` ผลไม้ · `99` อื่น ๆ

### นอกขอบเขตเวอร์ชันนี้

`/api/inter/*` (ส่งต่างประเทศ) และ `/api/v2/express/*` (Lalamove, MakeSend — ส่งด่วนภายในวัน) มีอยู่จริงในผู้ให้บริการ แต่ user ตัดออกจากเวอร์ชันแรก — **ห้าม implement**

---

## Traceability

| Endpoint ฝั่ง A | รองรับ |
|-----------------|--------|
| `connection` (GET/POST/DELETE/verify) | FR-ISHIP-001, FR-ISHIP-002, BR-ISHIP-10/11/12/13/14/15 |
| `settings` (GET/PUT) | FR-ISHIP-010/011/012, BR-ISHIP-27/30/31 |
| `couriers` / `boxes` / `quote` | FR-ISHIP-011, BR-ISHIP-34 |
| `shipments` (POST/retry/cancel) | FR-ISHIP-020–024, FR-ISHIP-050, BR-ISHIP-21/22/25/26/28 |
| `label` / `labels/bulk` | FR-ISHIP-030/031 |
| `pickups` | FR-ISHIP-051 |
| `traces` | FR-ISHIP-040 |
| `webhooks/iship/[secret]` | FR-ISHIP-041, BR-ISHIP-40/41 |
| ทุก endpoint | FR-ISHIP-003, BR-ISHIP-01/02/03/05 |

---

## ส่วนขยาย 2026-08-01 — ผูกพัสดุที่มีอยู่แล้วบน iShip

> รองรับ FR-ISHIP-025/026/027/028 · BR-ISHIP-29/45
> ทุก endpoint อยู่ใต้กติกาเดียวกับหัวข้อบนสุด (`private, no-store` + `requireGeneralShop`)

### `GET /api/seller/iship/unlinked`
รายการพัสดุของร้านบน iShip ในช่วง 7 วันล่าสุดที่ยังไม่ถูกผูกกับคำสั่งซื้อใด

ตอบ `200`:
```json
{
  "parcels": [
    {
      "trackNo": "TH0205901RX26E0",
      "courierCode": "FlashExpress",
      "courierName": "Flash Express",
      "courierLogo": "https://app.iship.cloud/express/flash-express.png",
      "carrierStatus": "order_success",
      "carrierStatusText": "รอเข้ารับพัสดุ",
      "codAmount": 1250,
      "receiver": {
        "name": "สมชาย ใจดี", "phone": "0812345678",
        "line1": "99/1 ถ.สุขุมวิท",
        "subdistrict": "สีลม", "district": "บางรัก",
        "province": "กรุงเทพ", "postcode": "10500"
      },
      "createdAtRaw": "2026-07-31 09:12:34",
      "fromDeepOrphan": false
    }
  ]
}
```

- ใช้ `query_orders` **คำขอเดียว** (payload จริงมีที่อยู่ครบ ไม่ต้องวน `get_order` รายใบ)
- กรองออก: ใบที่ยกเลิกแล้ว + ใบที่ `trackingNo` ถูกใช้แล้ว (เทียบทั้งตาราง ไม่ใช่แค่ร้านนี้ เพราะ partial unique เป็นระดับตาราง)
- `fromDeepOrphan: true` = `custom_order_id` เป็นรูป `idempotencyKey` ของเราแต่ไม่มีแถวคู่กันใน DB
  → ใบที่เรายิงสำเร็จแต่ response หายกลางทาง (เดิมกู้คืนไม่ได้เลย)
- 🛑 คำตอบมี PII ผู้รับของพัสดุทุกใบ — ห้าม cache ร่วม

### `GET /api/seller/iship/unlinked/preview`
`?trackingNo=<เลข>&orderId=<uuid>` หรือ `?trackingNo=<เลข>&orderToken=<token>`

ตอบ `200`: `{ "parcel": {…}, "diff": [{ "field","label","order","parcel","same" } × 7], "hasConflict": bool }`

อ่านพัสดุจาก iShip ใหม่ **ไม่ใช้ค่าจากรายการก่อนหน้า** — ตารางที่ร้านใช้ตัดสินใจต้องเป็น
ข้อมูลชุดเดียวกับที่จะถูกเขียนลงคำสั่งซื้อจริง ไม่งั้นร้านยืนยันสิ่งหนึ่งแต่ระบบเขียนอีกสิ่งหนึ่ง

การเทียบเป็นแบบ canonical: ตัดคำนำหน้า ต./อ./จ. ยุบช่องว่าง `กรุงเทพ`=`กรุงเทพมหานคร`
เบอร์เทียบเฉพาะตัวเลข — ไม่งั้นจะฟ้องว่าต่างในเกือบทุกใบจนร้านเลิกอ่าน

### `POST /api/seller/iship/shipments/link`
```json
{ "orderToken": "…", "trackingNo": "TH0205901RX26E0", "addressResolution": "KEEP_ORDER" }
```
`addressResolution`: `"KEEP_ORDER"` (ไม่แตะออเดอร์) | `"USE_ISHIP"` (เขียนที่อยู่จากพัสดุทับ
ผ่าน `applyReceiverPatch` — แตะแค่ 3 คอลัมน์ ห้ามใช้ `updateOrder()`) · **บังคับส่ง ไม่มีค่าปริยาย**

ตอบ `201`: รูปเดียวกับ `POST /shipments` (`ShipmentView`) เพิ่ม `source: "LINKED"`

- `409 SHIPMENT_EXISTS` — คำสั่งซื้อมีพัสดุที่ใช้งานอยู่แล้ว **หรือ** เลขนี้ผูกกับคำสั่งซื้ออื่นไปแล้ว (ข้อความต่างกัน)
- `409 INVALID_STATE` — พัสดุถูกยกเลิกไปแล้ว
- `404 NOT_FOUND` — ไม่พบเลขนี้ในบัญชี iShip ของร้าน
- `403 NOT_ELIGIBLE` — คำสั่งซื้อไม่ใช่แบบจัดส่ง
- **ไม่เรียก `create_order`** → ไม่เกิดค่าใช้จ่ายใหม่ของร้าน
- หลังสร้างแถวจะเรียก `getTraces()` เติมไทม์ไลน์ทันที — ล้มแล้ว **ไม่ rollback** การผูก
  (เคสที่พบบ่อยที่สุดคือขนส่งยังไม่สแกน ซึ่ง iShip ตอบ 500 ไม่มีข้อความ)

### `POST /api/seller/iship/shipments/[id]/unlink`
เลิกผูก — **คนละเรื่องกับ `/cancel`** ตัวนี้ไม่แจ้งขนส่ง พัสดุจริงยังอยู่ครบและยังส่งของตามปกติ

- ลบแถว `OrderShipment` ทิ้ง (ไม่ mark `CANCELLED` — ดู BR-ISHIP-29)
- คืน `Order.status` เป็น `PENDING` และลบ `ShipmentTracking` ที่ตัวเองสร้างไว้ตอนผูก (BR-ISHIP-45)
- `409 INVALID_STATE` ถ้าใบนั้น `source = CREATED` (Deep เปิดเอง) — ใบพวกนั้นต้องยกเลิกกับขนส่งจริง

---

## ส่วนขยาย 2026-08-05 — เปรียบเทียบราคาทุกขนส่งในคำขอเดียว

> รองรับ FR-ISHIP-032 · BR-ISHIP-35/36 — สเปกเต็ม `docs/superpowers/specs/2026-08-05-iship-price-compare-design.md`
> อยู่ใต้กติกาเดียวกับหัวข้อบนสุด (`private, no-store`, guard 3 ชั้น — **ไม่บังคับเจ้าของร้าน** เหมือน `quote`)

### `POST /api/seller/iship/price/compare`
เทียบราคาทุกขนส่งของร้านในคำขอเดียว (ปุ่ม "เทียบราคา" ในฟอร์มสร้างพัสดุ) — server เป็นคน fan-out
ให้ client ไม่ต้องวนยิง `/price` ทีละขนส่งจนชน rate-limit ของเราเอง

```json
{
  "receiver": { "subdistrict": "ควนรู", "district": "รัตภูมิ", "province": "สงขลา", "postcode": "90220" },
  "weight": 1.25, "width": 14, "length": 20, "height": 6
}
```
ไม่มี `courierCode` (ตัดออกจาก schema ของ `POST /price` เดิม) · ที่อยู่ผู้ส่งอ่านจากการตั้งค่าร้านเสมอ

ตอบ `200`:
```json
{
  "rows": [
    { "courierCode": "ThailandPost", "courierName": "ไปรษณีย์ไทย EMS", "totalPrice": 45,
      "basePrice": 40, "fuelFee": 5, "remoteFee": null, "estimateDays": 3 }
  ],
  "failed": [{ "courierCode": "SomeCourier", "courierName": "..." }]
}
```
`rows` เรียง `totalPrice` น้อย→มากแล้ว · `failed` = ขนส่งที่ยิงไม่สำเร็จ/ราคาไม่ใช่เลข (ไม่ทำให้ทั้งชุดล้ม)
ทุกขนส่งพังพร้อมกัน (ไม่มี `rows` เลย) → รหัส error เดิมของ iShip (`502`/`504`) ไม่ใช่ error ใหม่

- `422 INCOMPLETE_DATA` — ที่อยู่ผู้ส่ง**หรือ**ผู้รับไม่ครบ (พร้อม `missing[]` เมื่อขาดที่อยู่ผู้ส่ง)
- `409 NOT_CONNECTED` — ยังไม่ได้เชื่อมต่อ iShip

รองรับ: FR-ISHIP-032 · BR-ISHIP-34/35/36

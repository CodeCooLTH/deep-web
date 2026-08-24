---
title: "API — 00058 ค้นหาในหน้ารายการคำสั่งซื้อ (Order List Search)"
owner: shinobu22
status: draft
module: M00058-OrderListSearch
version: "1.0"
created: 2026-08-24
tags: [feature, api, order, search, seller]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M00058-OrderListSearch
> **ประเภทเอกสาร:** API Contract
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-08-24
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** SA

# API Contract: ค้นหาในหน้ารายการคำสั่งซื้อ

---

## 1. Overview

🛑 **ฟีเจอร์นี้ไม่มี API endpoint ใหม่แม้แต่ตัวเดียว** — เอกสารนี้มีอยู่เพื่อบันทึกข้อเท็จจริงนี้อย่างชัดเจน (ตาม Hard Rule 11: ความครบของเอกสารนับจาก "ชื่อไฟล์ตาม template" ไม่ใช่จำนวนไฟล์ — ไฟล์นี้ต้องมีแม้เนื้อหาจะเป็น "ไม่มี" เพื่อให้คนถัดไปรู้ว่า **ตรวจแล้วว่าไม่ต้องมี API** ไม่ใช่ "ยังไม่ได้เขียน")

**การค้นหาทั้งหมดเกิดขึ้นบนเครื่องผู้ใช้ (client-side, ฟังก์ชันบริสุทธิ์ใน `src/lib/order-search.ts`)** โดยทำงานกับข้อมูล `OrderRow[]` ที่ถูกส่งมาจาก Server Component (`src/app/(paces)/seller/(dashboard)/orders/page.tsx`) อยู่แล้ว **ตั้งแต่ก่อนฟีเจอร์นี้** ผ่านฟังก์ชัน `getOrdersByShop()` (`src/services/order.service.ts:1488`) ซึ่งดึงออเดอร์ **ทั้งร้าน** มาในครั้งเดียวโดยไม่มีการแบ่งหน้า (pagination)

**สิ่งเดียวที่ "ใหม่" ในแง่ contract คือ contract ภายในของ 2 โมดูล client-side** (ดู §3):
- `searchOrders(orders, query)` — internal function contract ใน `src/lib/order-search.ts` ที่ `OrdersList.tsx` และ `OrdersTable.tsx` เรียกใช้ร่วมกัน
- `sellerContactDisplay(contact, fallback?)` / `sellerContactOrNull(contact)` — internal function contract ใน `src/lib/seller-contact-display.ts` ที่ 7 RSC page files เรียกใช้ร่วมกัน

ทั้งสองไม่ใช่ REST API — เป็น TypeScript function ที่ import ตรง ไม่มี HTTP round-trip

- **เอกสารออกแบบต้นทาง:** [[SDS]] ของโมดูลนี้ §3 (Component Design), §6 TD-001/TD-005
- **Base URL:** N/A — ไม่มี HTTP endpoint
- **Content-Type:** N/A
- **Convention:** N/A (ไม่มี API layer ให้ต้องยึด convention ของ `src/app/api/`)

---

## 2. Authentication

**ไม่มี auth layer ใหม่** — การอ่านข้อมูลผ่าน session/`requireActiveShop` เดิมของหน้า `/seller/orders` (RSC, มีอยู่ก่อนฟีเจอร์นี้) ยังทำงานเหมือนเดิมทุกประการ ไม่มีการเปลี่ยนสิทธิ์การเข้าถึงหน้าใด ๆ จากฟีเจอร์นี้ (BR-OLS-23)

| รายการ | ค่า |
|--------|-----|
| **วิธี (Auth Method)** | ไม่เกี่ยวข้องกับฟีเจอร์นี้โดยตรง — ใช้ NextAuth session ของหน้า `/seller/orders` เดิม |
| **Header** | N/A |
| **Token / Scope** | N/A |
| **กรณีไม่ผ่าน** | N/A |

---

## 3. Endpoint List

**ไม่มี endpoint ใหม่**

| Method | Path | คำอธิบาย |
|--------|------|----------|
| — | — | ไม่มี endpoint ใหม่จากฟีเจอร์นี้ |

*(สำหรับอ้างอิง — endpoint ที่มีอยู่ก่อนแล้วและฟีเจอร์นี้พึ่งพาแบบไม่แก้ไข คือ `GET /api/orders/customers` ที่ `CustomerSelectBlock.tsx` เรียกใช้ ดู §4)*

---

## 4. Endpoint Detail

ไม่มี endpoint ใหม่ — ไม่มีอะไรให้ระบุในหัวข้อนี้

**หมายเหตุอ้างอิง (ไม่ใช่ contract ใหม่):** `GET /api/orders/customers?q=<term>` (`src/app/api/orders/customers/route.ts`) เป็น route ที่มีอยู่ก่อนฟีเจอร์นี้และ **ไม่ถูกแก้ไขเลย** — ยืนยันแล้วว่า route นี้ไม่เคย mask ค่า `contact` มาตั้งแต่แรก (คืนค่า `buyerContact` ดิบเสมอ, `route.ts:64-67`) จึงเป็นเหตุผลที่จุดที่ 6 ในการถอดมาสก์ (`CustomerSelectBlock.tsx`) ถูกจัดเป็น "เปลี่ยนการแสดงผลอย่างเดียว" ตาม BR-OLS-25 — ไม่มีการแก้ route นี้แม้แต่บรรทัดเดียว

---

## 5. Error Code Table

**ไม่มี error code ใหม่** — `searchOrders()` และ `sellerContactDisplay()`/`sellerContactOrNull()` เป็น pure function ที่ไม่ throw (พิสูจน์ด้วยเทส `[blocker]` "ใบที่ไม่มีเบอร์/พัสดุ/ชื่อ ต้องไม่ทำให้พัง" ใน `order-search.test.ts`) ไม่มีสถานะ error ให้ผู้เรียกจัดการ — input ที่ไม่คาดคิด (`null`, `undefined`, string ว่าง) ถูก normalize เป็นค่าว่าง/fallback แทนการ throw

| Error Code | HTTP Status | ความหมาย / เงื่อนไข |
|------------|-------------|----------------------|
| — | — | ไม่มี — ไม่มี API surface ให้เกิด error code |

---

## 6. Sequence (ถ้า flow ซับซ้อน)

ไม่มี — flow เป็น client-side function call ตรง ไม่ซับซ้อนพอที่จะต้องมี sequence diagram แยกจากที่มีอยู่แล้วใน `SRS.md` §4.4 และ `SDS.md` §4

---

## 7. Traceability

| Endpoint | SDS Component / Decision | BRD FR |
|----------|--------------------------|--------|
| — (ไม่มี endpoint) | `order-search.ts` / TD-001 | FR-OLS-01..07, FR-OLS-10 |
| — (ไม่มี endpoint) | `seller-contact-display.ts` / TD-005 | FR-OLS-11..13 |
| `GET /api/orders/customers` (ไม่แก้ไข, อ้างอิงเท่านั้น) | `CustomerSelectBlock.tsx` / SDS §4.2 | FR-OLS-13 (กลุ่ม "เปลี่ยนการแสดงผลเฉย ๆ") |

---

## 8. สรุป (Summary)

เอกสารนี้ยืนยันว่าฟีเจอร์ 00058 **ไม่มี API contract ใหม่** — การค้นหาและการแสดงข้อมูลติดต่อทำงานทั้งหมดบน client ด้วยข้อมูลที่ RSC ส่งมาให้อยู่แล้วก่อนฟีเจอร์นี้

### สิ่งที่จะต้องเปลี่ยนถ้าวันหนึ่งย้ายไปค้นฝั่ง server (ไม่ทำในรอบนี้ — บันทึกไว้ตาม `DATABASE.md` §4)

หากในอนาคตปริมาณออเดอร์ต่อร้านโตจนต้องย้ายการค้นหาไปฝั่ง server (เกณฑ์ตาม SRS §6 NFR-Performance) จะต้องเพิ่ม:

1. **Endpoint ใหม่** เช่น `GET /api/orders?q=<term>&status=&stage=&...` ที่รับพารามิเตอร์ตัวกรองทุกแกน (ไม่ใช่แค่ `q`) เพราะ AND ระหว่างคำค้นกับตัวกรองอื่นต้องเกิดที่ฝั่งเดียวกัน
2. **Index ใหม่** — ปัจจุบันไม่มี index ใดในระบบรองรับ `contains`/prefix search บน `buyerName`/`buyerContact`/`OrderItem.name` เลย (ไม่มี `pg_trgm`, ไม่มี `tsvector`, ไม่มี GIN index — ทุก index บน `Order` เป็น B-tree ธรรมดา) ต้องเพิ่ม extension/index ก่อน
3. **`Order.orderNo`** มี index อยู่แล้ว (`@@index([orderNo])`) และตั้งใจให้ค้นได้ตั้งแต่แรกตามคอมเมนต์ใน `order-no.ts` แต่ **หน้ารายการปัจจุบันไม่เคย select/ใช้คอลัมน์นี้เลย** (`orderNoOf()` derive สดจาก `publicToken`+`createdAt` แทน) — เป็นฟิลด์แรกที่ควรใช้ถ้าย้ายไป server เพราะได้ index ฟรี **แต่ต้องยืนยันก่อนว่าไม่มีแถวไหน drift** จากการที่ `Order.createdAt` แก้ไขได้ (feature 00033) ซึ่งกระทบเลขคำสั่งซื้อที่ derive จากมัน
4. **`internalNote`** (prod: 38/541 ใบมีค่า) ไม่อยู่ใน `include` ปัจจุบันของ `getOrdersByShop()` — ถ้าจะเปิดให้ค้นได้ ต้องเพิ่มที่ service **และ** ประเมิน PII ใหม่ (เป็นข้อความอิสระที่ร้านพิมพ์เอง อาจมีข้อมูลอ่อนไหวปนอยู่)
5. **Contract การจับคู่/จัดลำดับ (D-5..D-11)** ต้อง reproduce ที่ SQL หรือ service layer ให้ผลตรงกับ `order-search.ts` เป๊ะ — มิฉะนั้นจะเกิดปัญหาเดิม (สองจุดคำนวณคนละที่ ผลไม่ตรงกัน) ที่ฟีเจอร์นี้เพิ่งแก้ไป

**Open Questions:**
- ไม่มี — ขอบเขต "ไม่มี API" ของรอบนี้ชัดเจนและตรวจยืนยันแล้วจากโค้ดจริง

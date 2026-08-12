---
title: "API — กล่องแชทรวมหลายร้าน"
owner: shinobu22
status: implemented
created: 2026-08-08
tags: [api, feature, chat, multi-shop]
related: ["[[SRS]]", "[[SDS]]"]
---

> **โมดูล:** M37-UnifiedInbox · **เวอร์ชัน:** 1.0 · **สถานะ:** Implemented

# API: กล่องแชทรวมหลายร้าน

ทุก endpoint ต้องมี session (`getServerSession`) — ไม่มี = 401 · header `Cache-Control: private, no-store` เสมอ (ข้อมูลรายผู้ใช้)

## 1. Endpoint ใหม่

### `GET /api/chat/shop-context`

ข้อมูลประกอบฟอร์มสร้างรายการของร้านหนึ่ง (ใช้ตอนเปิดร่างในเธรดของร้านที่ไม่ใช่ร้าน active)

| ส่วน | รายละเอียด |
|------|-----------|
| query | `shopId` (optional) — ไม่ส่ง = ร้านที่ active |
| 200 | `{ shopId, catalog[], bestSellers[], inventoryEnabled, vocab, shopVertical, serviceResourcesEnabled, serviceResources[], appointmentGranularity, hasShipping, ishipCreateMode }` |
| 403 | `shopId` อยู่นอก `scope.shopIds` |
| 404 | resolve ขอบเขตไม่ได้ / ไม่พบร้าน |
| 500 | โหลดข้อมูลไม่สำเร็จ (client แสดงปุ่มลองใหม่) |

> ทำไมคืนทั้งชุดใน request เดียว: กฎ "ร้านนี้ต้องกรอกที่อยู่จัดส่งไหม" ตัดสินจาก `shopVertical` ร่วมกับธง `fulfillmentMode` ของสินค้าใน `catalog` — ถ้าสองอย่างมาคนละจังหวะจะมีช่วงที่ฟอร์มถือ vertical ของร้านหนึ่งกับสินค้าของอีกร้าน (คลาสเดียวกับบั๊กร้านบริการถูกบังคับที่อยู่ 2026-08-07)

> ทำไมที่นี่ตอบ 403 ได้ (ต่างจากตัวกรองรายการที่ต้องคืนผลว่าง): ผู้เรียกรู้อยู่แล้วว่าร้านนี้มีตัวตน — มันมาจากเธรดที่เพิ่งเปิด จึงไม่ใช่การรั่วข้อมูลใหม่

> **`ishipCreateMode` (เพิ่ม 2026-08-11)** — โหมดเปิดพัสดุอัตโนมัติหลังสร้างออเดอร์ ของ **ร้านนี้**
> เดิมค่านี้ไม่ได้อยู่ในชุดข้อมูลรายร้านเลย: `DraftOrderProvider` ยิง `GET /api/seller/iship/connection` เองครั้งเดียวตอน mount (= ร้านที่ active) แล้วส่งค่าเดียวกันให้ฟอร์มของ **ทุกร่างไม่ว่าร้านไหน** — ร้าน A เปิด `AUTO` อยู่ ร่างของร้าน B จะพยายามเปิดพัสดุตามไปด้วยทั้งที่ B อาจไม่ได้เชื่อม iShip เลย
> 🛑 เคสนี้ **เพิ่งเข้าถึงได้จริงหลังปิดบั๊กสร้างออเดอร์ข้ามร้าน** (§2.1) — ก่อนหน้านั้นออเดอร์ไม่เคยถูกสร้างสำเร็จ จึงไม่มีใครเดินไปถึงขั้นตอนหลังสร้าง. เป็นตัวอย่างว่าการปิดบั๊กหนึ่งทำให้บั๊กที่หลับอยู่ตื่นขึ้นได้
> ค่าคำนวณด้วย `resolveChatIshipCreateMode()` (`src/lib/iship/chat-create-mode.ts`) **ตัวเดียวกันทั้ง route นี้และ seed ของ layout** — มีเทส `[blocker]` สแกนซอร์สทั้งสองไฟล์กัน drift ตาม SDS §4 (เทสรุ่นแรกเช็คแค่ "มีชื่อฟังก์ชันในไฟล์" ซึ่งเขียวอยู่ทั้งที่โค้ดถูกเปลี่ยนเป็นค่าคงที่ — ต้องจับ *การเรียก* และ *การถูกนำไปใช้*)

## 2. Endpoint เดิมที่เปลี่ยนพฤติกรรม

| Endpoint | เปลี่ยนอะไร |
|----------|------------|
| `GET /api/chat/conversations` | ขอบเขต = `scope.shopIds`; รับ query **`shopId`** ใหม่เป็นตัวกรอง (intersect กับขอบเขต — นอกขอบเขต = รายการว่าง ไม่ใช่ 403); `sweepStuckJobs`/`syncShipmentStatuses` ใน `after()` วนทุกร้านในขอบเขต |
| `GET /api/chat/inbox-tab-counts` | นับ 2 แท็บข้ามร้าน |
| `GET /api/chat/spam-unread` | นับข้ามร้าน |
| `GET /api/chat/problem-count` | นับข้ามร้าน |
| `GET /api/chat/comments/posts` | โพสต์ของทุกเพจในขอบเขต; แต่ละแถวมี `shop: { id, name }` |
| `GET /api/chat/tags` | union แท็กข้ามร้านในขอบเขต (รับ `?shopId=` เพื่อจำกัดร้านเดียวได้) |
| `PATCH /api/chat/conversations/[id]` | ร้านมาจาก **เธรด** (`resolveConversationShopId`) ไม่ใช่ร้าน active; เธรดนอกขอบเขต = 404 ก่อนแตะ service |
| `GET/PATCH /api/chat/conversations/[id]/crm` | เหมือนข้างบน |
| `GET /api/chat/conversations/[id]/orders` | เหมือนข้างบน |
| `GET /api/chat/conversations/[id]/preview` | เหมือนข้างบน |
| `POST /api/chat/conversations/[id]/ai-suggest` | เหมือนข้างบน — สำคัญเป็นพิเศษเพราะ route นี้อ่านสินค้า/น้ำเสียง/โควตาของร้านไปสร้างคำตอบ |
| `GET /api/chat/conversations/[id]/customer-prefill` | เหมือนข้างบน |
| `GET/POST /api/chat/groups`, `PATCH/DELETE /api/chat/groups/[id]` | รับ `?shopId=` (intersect); ไม่ส่ง = ร้าน active |
| `GET/POST/PATCH /api/chat/quick-messages`, `PATCH/DELETE /api/chat/quick-messages/[id]` | เหมือนข้างบน |
| `GET /api/chat/ai-quota` | เหมือนข้างบน |
| `PATCH /api/users/me` | allow-list เพิ่ม **`chatScopeMode`** (`v.picklist(['SINGLE','UNIFIED'])`); response `select` เพิ่มคอลัมน์เดียวกัน |

### 2.1 เส้นทางบันทึกรายการ — เพิ่ม 2026-08-11 (ปิดบั๊ก prod: AC-06-6 ไม่เคยถูก implement)

| Endpoint | รับอะไรเพิ่ม | ปฏิเสธเมื่อไหร่ |
|----------|-------------|----------------|
| `POST /api/orders` | body **`shopId`** (uuid, optional) = ร้านของร่าง | `403 SHOP_FORBIDDEN` (ไม่มีสิทธิ์ร้านนั้น) · `409 DRAFT_SHOP_MISMATCH` (`conversationId` ที่แนบมาเป็นเธรดของอีกร้าน) |
| `GET /api/orders/[token]` | query **`?shopId=`** | 404 (resolve ร้านไม่ได้) — ไม่เคย fallback ไปร้าน active |
| `PATCH /api/orders/[token]` | body **`shopId`** | เหมือน GET |
| `GET /api/products` | query **`?shopId=`** | รูปแบบผิด → 400 · ไม่มีสิทธิ์ → **รายการว่าง** (เป็น "รายการ" ไม่ใช่การขอทรัพยากรที่ระบุ จึงอยู่ใต้กฎข้อ 3 ของ §4 ตามปกติ) |
| `**/api/seller/iship/**` (21 ไฟล์) | query **`?shopId=`** ทุก method รวม POST | ไม่มีสิทธิ์/ร้านไม่ใช่ ONLINE_SALES → `403` (รูปเดิมของ `requireGeneralShop`) |

🛑 **iShip ใช้ query แม้กับ POST โดยตั้งใจ** — ฝั่ง server อ่านที่เดียวด้วย `readIShipShopIdFromQuery()` จึงไม่มีเส้นไหนต้องจำว่า "ของฉันอ่านจาก body นะ" (11 endpoint ที่เข้าถึงได้จากโมดัลพัสดุในแชท + อีก 10 ที่ยังไม่มีทางเข้าจากแชทแต่ใส่ให้เหมือนกันหมด — ความสม่ำเสมอคือสิ่งที่กัน "เส้นที่ลืม")

🛑 **ฝั่ง client ห้ามยิง `/api/seller/iship/*` ตรง ๆ** ต้องผ่าน `useIShipUrl()` (`src/components/safepay/iship/iship-shop-context.tsx`) — component ของ iShip ซ้อนกัน 4 ชั้นและแต่ละชั้นยิงเอง การไล่ส่ง prop แปลว่าจุดที่เพิ่มทีหลังจะลืม. ไม่มี provider = ไม่ต่อ query = **หน้า order detail ที่ใช้ component ชุดเดียวกันทำงานเหมือนเดิมทุกประการ**. เทส `[blocker]` ที่ `src/lib/iship/__tests__/iship-shop-scoping.test.ts` สแกนซอร์สทั้ง 2 ฝั่ง (route ที่ลืม `shopId` + component ที่ยิงตรง) พิสูจน์ด้วย mutation แล้วทั้งคู่

🛑 `GET /api/products` ต้องอยู่ในลิสต์นี้ทั้งที่เป็น **read** เพราะ `ProductPickerPanel`/`ProductMultiSelectSheet` เอาผลไป **ส่งการ์ดสินค้าให้ลูกค้าจริง** — อ่านผิดร้าน = ส่งชื่อ/ราคา/รูปของอีกร้านออกไปหาลูกค้าของร้านนี้ โดยไม่มีอะไรบนจอบอกว่าผิด (helper จึงชื่อ `requireShopForRequest` ไม่ใช่ `...ForWrite`)

🛑 **เติม `?shopId=` อย่างเดียวไม่พอสำหรับแผงที่เปิดค้างได้:** `ChatThread` ไม่ remount ตอนสลับ `conversationId` และ `activePanel` เป็น state ระดับนั้น — เปิดแผงเลือกสินค้าค้างไว้ในเธรดร้าน A แล้วคลิกเธรดร้าน B รายการเดิมจะค้างทับบริบทใหม่ ต้องมี `key={threadShopId}` ที่จุด render ด้วย (แพตเทิร์นเดียวกับ `key={scopeKey}` ที่ `(chat)/layout.tsx` ใช้อยู่แล้ว)

🛑 **3 เส้นนี้เคยรู้จักแต่ "ร้านที่ active" ทั้งที่ฟีเจอร์นี้ทำให้ร้านที่ active ≠ ร้านที่ผู้ใช้กำลังมองอยู่** (BR-UNI-07) — `DraftOrderProvider` ส่ง `shopId` ของร่างเข้า `OrderCreateForm` ถูกต้องมาตลอด แต่ฟอร์มรับมาแล้ว**โยนทิ้ง** (`shopId: _shopId`) และ route ก็ไม่มีที่ให้ใส่ ⇒ ออเดอร์ที่คีย์จากเธรดของร้าน B ลงร้าน A: มีนัด → `404 RESOURCE_NOT_FOUND` · เลือกสินค้าจากแคตตาล็อก → `400` · **รายการพิมพ์เอง → `201` เข้าร้านผิดถาวรเงียบ ๆ**

🛑 ข้อ 3 ของ §4 (นอกขอบเขต → 404 ไม่ใช่ 403) **ไม่ใช้กับ `POST /api/orders`** ด้วยเหตุผลเดียวกับ `shop-context`: `shopId` ที่ส่งมาเป็นร้านที่ผู้เรียกถืออยู่ในมือแล้ว ไม่ใช่การ probe หาร้านที่มีอยู่ — และการตอบกำกวมตรงนี้แลกมาด้วย "บันทึกไม่ผ่านโดยไม่รู้ว่าทำไม" ซึ่งแพงกว่ามาก

## 3. Endpoint ที่ **ไม่** เปลี่ยนโดยตั้งใจ

`/api/channels/**` (เชื่อม/ถอด/รายการเพจสำหรับหน้าตั้งค่า) — เป็นการตั้งค่าของร้าน ต้องอยู่ในบริบทร้านเดียวเสมอ · หน้าแชทเลิกเรียก `/api/channels` แล้ว (รับเพจจาก layout ผ่าน prop แทน)

## 4. สัญญาความปลอดภัยที่ทุก endpoint ต้องรักษา

1. **ขอบเขตร้านคำนวณฝั่ง server จาก session เท่านั้น** — ห้ามรับ `shopIds` จาก client
2. `?shopId=` เป็น "ตัวกรองภายในขอบเขต" ไม่ใช่ขอบเขต — ต้องผ่าน `intersectScopedShopIds`/`resolveScopedShopId` เสมอ
3. นอกขอบเขต → ผลว่างหรือ 404 **ไม่ใช่ 403** (403 ยืนยันการมีอยู่ของทรัพยากร) — **ข้อยกเว้นมี 2 ที่เท่านั้น:** `GET /api/chat/shop-context` (§1) และ `POST /api/orders` (§2.1) ทั้งคู่ด้วยเหตุผลเดียวกันคือ `shopId` ที่ส่งมาเป็นร้านที่ผู้เรียกถืออยู่แล้ว ไม่ใช่การ probe หาร้านที่มีอยู่ 🛑 ใครเพิ่มข้อยกเว้นที่สาม ต้องมาต่อรายการที่บรรทัดนี้ด้วย — ข้อยกเว้นที่เขียนไว้เฉพาะในหัวข้อของตัวเองจะมองไม่เห็นจากกฎแม่
4. ownership อยู่ใน `WHERE` ตั้งแต่คำสั่งแรก ไม่ใช่ดึงมาแล้วค่อยเช็ค

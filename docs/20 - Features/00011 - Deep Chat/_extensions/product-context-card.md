---
title: "Extension — Chat Product Context Card"
owner: shinobu22
status: draft
module: M00011-DeepChat
version: "1.0"
created: 2026-07-03
tags: [feature, chat, product-context, buyer, seller, extension]
related: ["[[../PRD]]", "[[../BRD]]", "[[../SRS]]", "[[../SDS]]", "[[../DATABASE]]", "[[../API]]"]
---

> **โมดูล:** M00011-DeepChat — Phase-2 #1 Extension · safepay-product
> **สถานะ:** locked scope (buyer-initiates) ตาม user approve default 2026-07-03

# Extension: Chat Product Context Card

## Goal
Buyer ดูสินค้าเฉพาะชิ้นบน `/u/[username]` (product grid) → กด "สอบถามสินค้านี้" → เข้าแชทกับร้านทันที พร้อม **product context card (รูป+ชื่อ+ราคา+ลิงก์) แนบเป็นข้อความแรกอัตโนมัติ** — seller เห็นทันทีว่า buyer สนใจสินค้าไหน

## FR (FR-CTX-01..08)
| FR | รายละเอียด |
|----|-----------|
| FR-CTX-01 | ปุ่ม "สอบถามสินค้านี้" บนทุก tile สินค้า active ใน grid — ซ่อนเมื่อ viewer=เจ้าของร้าน (isOwnShop) |
| FR-CTX-02 | Login-gate → redirect sign-in + returnUrl (pattern AuctionBidPanel) |
| FR-CTX-03 | Login แล้ว → `/messages/[shopId]?productId=[id]` → getOrCreateConversation → sendMessage(type=PRODUCT, productRefId) ครั้งเดียว |
| FR-CTX-04 | Idempotent — กดซ้ำ/refresh สินค้าเดิม → ไม่ insert card ซ้ำถ้าข้อความล่าสุดเป็น PRODUCT card สินค้าเดียวกัน |
| FR-CTX-05 | `ChatMessage.type` += "PRODUCT"; `productRefId` (nullable FK Product, onDelete SetNull) |
| FR-CTX-06 | Render card 2 skin (buyer Vuexy + seller Paces) — รูป/ชื่อ/ราคา/ลิงก์กลับ /u/[username] |
| FR-CTX-07 | กัน cross-shop injection — productRefId ต้องเป็นสินค้าของ shop เดียวกับ conversation ไม่งั้น reject 400/403 |
| FR-CTX-08 | Graceful degrade — สินค้า isActive=false → "หยุดขายแล้ว"; ถูกลบ (productRefId=NULL) → "ไม่พบสินค้านี้แล้ว" ไม่ crash thread |

## BR
- BR-CTX-01 shop-scope (product ของ shop เดียวกับ conversation)
- BR-CTX-02 idempotent-send (เช็คข้อความล่าสุด type=PRODUCT + productRefId เดียวกัน → คืนแถวเดิม) — server-side guard ไม่พึ่ง client debounce
- BR-CTX-03 rate-limit เดิมครอบ (ผ่าน sendMessage, 30/min/user)
- BR-CTX-04 ไม่ snapshot — live-join ผ่าน productRefId (การ์ดเก่าแสดงราคา/รูปปัจจุบัน; trade-off accepted)
- BR-CTX-05 buyer-only trigger (seller composer picker = OOS)

## Acceptance (ย่อ — full 11 ข้อใน source)
non-owner เห็นปุ่ม / owner ไม่เห็น / no-login redirect+return / คลิกครั้งแรก card เป็นข้อความแรก / กดซ้ำไม่ dup / สินค้า B คนละ id ไม่ dup / cross-shop reject / seller เห็น card Paces / isActive=false → "หยุดขายแล้ว" / ลบจริง → "ไม่พบสินค้า" / rate-limit 429

## Schema Delta (Option B — base migration applied prod แล้ว, ห้ามแก้ไฟล์เดิม)
```
model ChatMessage {
  ... type String @default("TEXT") // + "PRODUCT"
  productRefId String?  // เฉพาะ type=PRODUCT, FK Product onDelete SetNull
  product Product? @relation(fields:[productRefId], references:[id], onDelete:SetNull)
}
model Product { chatMessageRefs ChatMessage[] } // back-relation
```
migration ใหม่ (timestamp หลัง 20260703000400, collision-check `git log --all`):
`ALTER TABLE "ChatMessage" ADD COLUMN "productRefId" TEXT;`
`ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_productRefId_fkey" FOREIGN KEY ("productRefId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
ไม่เพิ่ม index (lookup by PK enrichment). Valibot: `SendChatMessageSchema` type += "PRODUCT" + `productRefId` optional uuid (conditional-required ที่ route).

## Scope (S-16..S-21)
| S-id | รายการ |
|------|--------|
| S-16 | schema delta + migration (ALTER ADD COLUMN, Option B) + validations extend |
| S-17 | `sendMessage` รับ productRefId เมื่อ type=PRODUCT — verify Product.shopId===conversation.shopId + idempotent-guard (sync SDS §3.1/§5 FROZEN) |
| S-18 | route POST/GET messages — enrich `productCard:{id,name,price,imageFileId,isActive}\|null` ต่อข้อความ PRODUCT (additive, reuse `getProductById`) |
| S-19 [UI] | ProductTile ปุ่ม "สอบถามสินค้านี้" (ซ่อน isOwnShop, login-gate) — safepay-ux ก่อน |
| S-20 [UI] | `/messages/[shopId]` อ่าน ?productId → send PRODUCT ครั้งเดียว (clear query) + render card Vuexy — safepay-ux |
| S-21 [UI] | seller thread render card Paces (HR7/12) — safepay-ux |

## Out-of-Scope
OOS-14 seller-shares-product composer picker · OOS-15 order card · OOS-16 multi-product card
> **แก้ baseline เดิม:** `docs/scope/2026-07-03-00011-deep-chat-scope-baseline.md` OOS-2 (order/product context card) = **partial-closed by this ext (product only)** — กัน Gate 1 ฟ้อง CREEP ผิด

## Reuse
`sendMessage`(extend) · `product.service.getProductById` · `/api/files/{id}`(รูป) · `POST /api/chat/conversations`(idempotent get-or-create) · AuctionBidPanel login-gate · `getProductsByShop`(isActive filter ฟรี)

## Assumptions
ไม่มีหน้า product-detail แยก → ลิงก์การ์ดชี้ `/u/[username]` · ปุ่มเฉพาะ isActive=true · ไม่ snapshot · seller ไม่ initiate รอบนี้

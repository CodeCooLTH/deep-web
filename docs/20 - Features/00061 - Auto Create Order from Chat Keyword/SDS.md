---
title: "SDS — สร้างออเดอร์อัตโนมัติจากคำสั่งในแชท (Auto Create Order from Chat Keyword)"
owner: shinobu22
status: draft
created: 2026-08-30
tags: [sds, feature, 00061, chat, order, automation]
related: ["[[SRS]]", "[[BRD]]", "[[PRD]]", "[[DATABASE]]", "[[API]]"]
---

> **โมดูล:** 00061-AutoCreateOrder · **ประเภท:** System Design Spec · **เวอร์ชัน:** 1.0
> **วันที่:** 2026-08-30 · **สถานะ:** Draft — รอ user review · **เจ้าของ:** SA (`safepay-planner`)

# SDS: สร้างออเดอร์อัตโนมัติจากคำสั่งในแชท

---

## 0. ผลการปิด Open Question ของ SRS §10 (#5 และ #6)

> 🛑 SRS เลื่อน 2 ข้อนี้มาให้ "ตัดสินตอน SDS" — **ปิดจบในเอกสารนี้ ไม่เลื่อนต่อ** (กันคลาส "หนี้ที่ย้ายบ้านไปเรื่อย ๆ")

### #5 — `promoteDraftToOrder()` reuse `updateOrder()` ได้ไหม → **ตอบว่า "ไม่ได้" ต้องเขียนใหม่**
เปิด `order.service.ts:683-945` เต็มฟังก์ชันแล้ว พบ 2 เหตุผลที่ปิดทางไว้:
1. 🛑 **`:758` — `if (existing.status !== "PENDING") throw new OrderNotEditableError();`** เป็นเงื่อนไขแรกสุด บล็อกทุกสถานะที่ไม่ใช่ `PENDING` รวม `DRAFTED` ⇒ เรียกกับแถวร่างได้ 400 ทันที
   **และแก้ guard นี้ไม่ได้** เพราะคอมเมนต์เหนือมัน (`:755-757`) อธิบายว่ามันมีไว้กัน `SHIPPED`/`CONFIRMED` ถูกแก้ย้อนหลัง — **เหตุผลตรงข้ามกับที่เราต้องการพอดี**
2. **ไม่มี code path ใดกำหนด `orderNo` เมื่อค่าเริ่มต้นเป็น `NULL`** — ฟังก์ชันนี้ recompute `orderNo` **เฉพาะตอน `createdAt` เปลี่ยน** (`:860-869`) โดย**สมมติว่ามี `orderNo` เดิมอยู่แล้วเสมอ** (มาจาก `createOrder()`) · ร่างไม่เคยผ่าน `createOrder()` ⇒ `orderNo=NULL` ตลอด และถ้าผู้ขายไม่แก้วันที่ตอนกู้ร่าง branch นี้ไม่ทำงานเลย ⇒ **`orderNo` ยังเป็น `NULL` ต่อไปแม้บันทึกสำเร็จ**

⇒ **เขียน `promoteDraftToOrder()` ใหม่** แต่ **reuse helper ย่อยที่ `createOrder`/`updateOrder` ใช้ร่วมกันอยู่แล้วได้เต็มที่** (`deductStockForOrderItems` · `resolveLineCosts` · `formatOrderNo` · fulfillmentMode derivation · `recordOrderEvent`) — ดู §3.9

### #6 — ไล่ 6 ไฟล์ที่ยัง ⚠️ ครบแล้ว → **เจอจุดรั่วเพิ่มอีก 2 จุด**

| ไฟล์ | ผล | หลักฐาน |
|---|---|---|
| `chat-outbox.service.ts` | ✅ ปลอดภัย | `:417-421`,`:585-590` กรอง `deliveryStatus:'QUEUED'` — ข้อความภายในไม่เคยเข้าคิวส่งออก (ไม่ตั้ง `deliveryStatus`) **จึงไม่ถูก query เจอโดยธรรมชาติ** |
| `auto-reply.service.ts` | 🛑 **1 จุดต้องแก้** | `:666-672` (`autoReplyKind:{not:null}`) ✅ · `:827-833` (`senderRole:'BUYER'`) ✅ · `:993-998` (`type:'TEXT'`) ✅ · 🛑 **`:846-850` (`lastShop`) กรองแค่ `senderRole:'SHOP'` ไม่กรอง `type`** ⇒ การ์ดผลลัพธ์จะถูกนับเป็น "ข้อความร้านล่าสุด" แล้ว**เลื่อนขอบเขตข้อความลูกค้าที่ป้อนเข้า auto-reply ผิดจุด** |
| `customer-file-library.service.ts` | ✅ ปลอดภัย | `:153-159` ดึงทีละ `id` โดย seller กดเอง · ข้อความภายใน `imageUrl:null` เสมอ **ไม่มีอะไรให้บันทึกลงคลังไฟล์** |
| `ai-suggest/route.ts` | 🛑 **ต้องแก้** | `:235-238` `findMany({ where: { conversationId } })` **ไม่มีตัวกรอง `type`/`senderRole` เลยสักตัว** แล้ว feed เข้า AI โดยตรง |
| `appointment-summary/route.ts` | ✅ ปลอดภัย | `:143-148` กรอง `type:"ORDER"` ตรง |
| `files/[...fileId]/route.ts` | ✅ ปลอดภัย | `:245-247` กรอง `type:"FILE"` ตรง |

🛑 **"ชั้นตัวนับ" (PRD §6.3 ชั้นที่ 3) จึงมี 3 จุด ไม่ใช่ 1** — `chat-metrics.service.ts` (เจอตอน SRS) + `auto-reply.service.ts:846` + `ai-suggest/route.ts:235` (เจอตอน SDS)
**ทั้งสามมีรูปร่างเดียวกัน: query `ChatMessage` ตรง ไม่ผ่านเส้นทางเขียน ⇒ ชั้นเขียนกันให้ไม่ได้เลยสักจุด**

---

## 1. บทนำ & References

### 1.1 วัตถุประสงค์
เอกสารนี้ตอบ **"จะสร้างยังไง"** ต่อจาก [[SRS]] ที่ตอบ "ต้องได้อะไร" ครบ 26 TFR แล้ว — **ไม่ทวนเหตุผลเชิงธุรกิจซ้ำ** (อ้าง `TFR-0xx` เสมอ) · เนื้อหาคือ **ไฟล์จริง · ชื่อฟังก์ชันจริง · ลำดับการเรียกภายในแต่ละ transaction · จุดต่อกับไฟล์เดิม** · ผู้อ่านหลักคือ `safepay-developer` ที่จะนำไปตัด task

### 1.2 ขอบเขต
ครอบ TFR-001..026 — **ไม่ออกแบบสคีมาใหม่** (`DATABASE.md` ล็อกแล้ว · index ที่ SRS §5.2 ส่งกลับ `safepay-database` SDS นี้ถือว่า **ยังไม่มี** จนกว่าจะยืนยัน) · ปิด open question #5/#6 ใน §0 · **เหลือ #1/#2/#3/#4/#7/#8 ที่รอ user/database** — ออกแบบเป็น **จุดเสียบค่าทีหลัง** ทั้งหมด ไม่ตัดสินแทน

### 1.3 เอกสารอ้างอิง

| เอกสาร | ความสัมพันธ์ |
|--------|-------------|
| [[SRS]] | TFR-001..026 — ทุกไฟล์ใน §2 ต้อง trace กลับได้ |
| [[BRD]] | AC-ACO-01..79 — SRS §9 เป็นตัวกลางแล้ว **SDS ไม่ทำซ้ำ** |
| [[DATABASE]] | สคีมาที่ล็อก — อ้างคอลัมน์ ไม่ออกแบบใหม่ |
| [[UX-Design-Spec]] | หน้า A/B/C/D — §3.11 อ้าง component/copy **ไม่เขียนซ้ำ** |
| `src/services/order.service.ts` | `createOrder:253` · `updateOrder:683` (เปิดเต็มแล้ว §0) · `cancelOrder:1136` · `VALID_TRANSITIONS:30` |

---

## 2. โครงไฟล์ทั้งหมด — สร้าง/แก้

> 🛑 **ตารางนี้คือของจริงที่จะ diff เมื่อ PR เปิด — ใช้ตัด task ได้ตรง ๆ**
> กลุ่ม B โตจาก **9 → 16 จุด** เพราะ audit เจอ 2 จุดใหม่ (§0 #6) + `order.service.ts` ต้องนับแยกเป็น 3 จุดย่อย (แก้คนละฟังก์ชันในไฟล์เดียวกัน)

### กลุ่ม A — สร้างใหม่ (11 ไฟล์)

| # | ไฟล์ | หน้าที่ | TFR |
|---|---|---|---|
| A1 | `src/lib/auto-order-normalize.ts` | `normalizeTriggerPhrase()` · `computeContentHash()` **(pure)** | 002, 015 |
| A2 | `src/lib/auto-order-parser.ts` | `parseAutoOrderMessage()` · `matchesTriggerPhrase()` **(pure)** | 005–007 |
| A3 | `src/lib/auto-order-reasons.ts` | `deriveDraftReasons()` · `sortDraftReasons()` · type `DraftReasonCode` **(pure)** | 010, 014 |
| A4 | `src/lib/order-visibility.ts` | `excludeDraftedWhere` (SSOT ตาม DATABASE.md §C) | 019 |
| A5 | `src/services/auto-order-config.service.ts` | CRUD ตั้งค่า/วลี/เพจ/ห้องทดสอบ | 001, 003 |
| A6 | `src/services/auto-order-validate.service.ts` | `validateAutoOrderCompleteness()` (I/O wrapper รอบ A2/A3 + product matching) | 008, 010 |
| A7 | `src/services/auto-order-detect.service.ts` | `detectAutoOrderTrigger()` · `promoteDraftToOrder()` · `retryAutoOrderDraft()` · `discardAutoOrderDraft()` | 005, 011, 016, 017, 019 |
| A8 | `src/services/auto-order-internal-message.service.ts` | `writeAutoOrderResultMessage()` | 020 |
| A9 | `src/services/message-echoes-health.service.ts` | `checkMessageEchoesHealth()` · `repairMessageEchoes()` | 004 |
| A10 | `src/app/api/seller/auto-order/**` (7 route) | endpoint ตั้งค่า/dry-test/health/retry/discard | §4 SRS |
| A11 | `src/app/api/cron/auto-order-sweeper/route.ts` | Watchdog + Reaper | 024 |

### กลุ่ม B — แก้ของเดิม (16 จุด / 12 ไฟล์) 🛑 **ความเสี่ยงสูงสุด เพ่งตรงนี้ก่อน**

| # | ไฟล์ | แก้อะไร | TFR | ระบบอื่นที่พึ่งพา |
|---|---|---|---|---|
| B1 | `chat.service.ts::sendMessage()` (`:709`) | เรียก `detectAutoOrderTrigger()` หลังบันทึก SHOP สำเร็จ (**entry 1**) | 005, 021 | ทุกช่องทางส่งข้อความร้าน |
| B2 | `chat.service.ts::getMessages()` (`:599`) | เพิ่ม `viewerRole` + role filter | 022 | **ทุกหน้าที่อ่านแชท ทั้ง seller และ buyer web** |
| B3 | `order.service.ts::VALID_TRANSITIONS` (`:30`) | เพิ่ม `DRAFTED:["PENDING","CANCELLED"]` | 019 | ทุก `assertTransition` call |
| B4 | `order.service.ts::createOrder()` (`:253`) | 🛑 **เพิ่ม param optional 7 ตัว ไม่ใช่ 1** — `createdVia?` + `sourceChatMessageId?` `supersedesOrderId?` `matchedTriggerPhrase?` `contentHash?` `detectionResolvedAt?` `isDryRun?` (ขยายตาม §3.4 ขั้น 5) | 013 | ทุกช่องทางสร้างออเดอร์ (**additive ไม่กระทบ caller เดิม**) |
| B5 | `api/channels/facebook/webhook/route.ts` | เรียก `detectAutoOrderTrigger()` เมื่อ ingest คืน `STORED`+`SHOP` (**entry 2**) | 005, 021 | Ingestion ของทุกข้อความ Messenger/IG |
| B6 | `src/lib/cancel-reasons.ts` | เพิ่ม `DUPLICATE_ORDER` (ตัดสินแล้ว) + placeholder ของ open Q1/Q2 | 017, 024 | ทุก dropdown ยกเลิกออเดอร์ |
| B7 | `src/lib/cancel-reason-buyer-fault.ts` | 🛑 **คอมเมนต์กำกับ — ไม่เพิ่มค่าใหม่เข้า** | 017, 024 | Trust Score |
| B8 | `order-stats.ts::isRateExcludedCancellation()` | เพิ่มค่าหมดอายุ (placeholder) เข้า exclusion | 024 | success-rate ของทุกร้าน |
| B9 | `orders/order-action-set.ts` | เพิ่ม branch ปุ่มสำหรับ `status='DRAFTED'` | UX §C | ปุ่ม action ทุกแถว `/orders` |
| B10 | `StageChips`/`OrdersList.tsx` | เพิ่มชิป "ร่าง" + เรียง `expiresAt ASC` | 023 | ตัวกรอง `/orders` เดิม |
| B11 | `InboxList.tsx` | badge ร่างค้าง | 023 | รายการห้องแชท |
| B12 | `chat-metrics.service.ts` | `type:{not:'AUTO_ORDER_RESULT'}` ที่ query "การตอบครั้งแรก" | 022 | **รายงานผลงานแอดมิน 00059** |
| B13 | `auto-reply.service.ts:846-850` | `type:{not:'AUTO_ORDER_RESULT'}` ที่ `lastShop` | 022 *(เจอตอน SDS)* | ขอบเขตข้อความที่ป้อน auto-reply |
| B14 | `ai-suggest/route.ts:235-238` | `type:{not:'AUTO_ORDER_RESULT'}` | 022 *(เจอตอน SDS)* | AI suggestion ของแอดมิน |
| B16 | `chat.service.ts:12` (+ `:94`, `:713`) | 🛑 **แยก `ChatMessageType` เป็น `SendableMessageType` (แคบ) กับ `StoredMessageType` (กว้าง)** — ถ้าเติมค่าใหม่เข้า union เดิมตรง ๆ **`sendMessage()` จะยอมรับมันทันที = พลิกจากห้ามเป็นอนุญาต** (§3.9) | 020 | `sendMessage` + ทุกจุดที่อ่านรูปร่างข้อความ |
| B15 | `src/lib/money-round.ts` (+ **5** จุดที่ก็อป) | 🛑 **สกัด `round2` เป็น export ที่เดียว** — ปัจจุบันมีสำเนา **5 ชุด** (`order.service.ts:330` + **`:705`** local const · `order-payment.ts:79` · `CartPanel.tsx:39` · `OrderCreateForm.tsx:298`) · `promoteDraftToOrder` ต้องใช้สูตรเดียวกับ `createOrder` **การก็อปชุดที่ 5 = ทำให้ปัญหาแย่ลง (HR16)** | §3.9 | ทุกจุดที่คำนวณเงิน |

### กลุ่ม C — เรียกเฉย ๆ ไม่แตะ

| Component | ใช้ยังไง |
|---|---|
| `cancelOrder()` (`:1136`) | เรียกจากปุ่ม "ยกเลิกใบเก่า" เท่านั้น 🛑 **ห้ามเรียกจาก `detectAutoOrderTrigger()`/`promoteDraftToOrder()`** (TFR-017) |
| `deductStockForOrderItems()` (`inventory-stock.service.ts:32`) | เรียกใน `promoteDraftToOrder()` |
| `resolveLineCosts()` · `formatOrderNo()` | เรียกใน `promoteDraftToOrder()` (pattern เดียวกับ `createOrder`) |
| `isOrderDateInWindow()` (`order-date-window.ts:45`) | เรียกใน A6 |
| `MOBILE_PHONE_RE` (`lib/phone.ts`) | เรียกใน A3 |
| `chat_message_realtime_broadcast_trigger` (DB) | ทำงานเองอัตโนมัติ **ไม่แตะ** |

---

## 3. Component Design

### 3.9 `promoteDraftToOrder()` — กู้ร่างเป็นออเดอร์จริง

> 🛑 **เมื่อพิสูจน์แล้วว่า reuse `updateOrder()` ไม่ได้ (§0 #5) ความเสี่ยงหลักย้ายทันทีจาก "เรียกฟังก์ชันเดิมผิด" เป็น "ฟังก์ชันใหม่ทำน้อยกว่าที่ควร"** — ของที่ `createOrder` เคยแถมให้ฟรี เราเพิ่งสละไปทั้งชุด · `tsc`/build/เทสจะเขียวหมดเพราะโค้ดถูกทุกบรรทัด **มันแค่ทำไม่ครบ**

**(1) Signature**
```ts
export async function promoteDraftToOrder(
  shopId: string,
  publicToken: string,
  data: Parameters<typeof createOrder>[1], // shape เดียวกับ createOrder — ฟอร์มแก้ไขส่งแบบเดียวกัน
  actorUserId: string | null,             // บังคับส่ง (ไม่ optional) — ต่างจาก createOrder เพราะจุดนี้ "มีคนกดฟอร์ม" เสมอ
): Promise<Order>
```
**Throw:** `OrderNotFoundError` · `DraftNotPromotableError` **(ใหม่)** — 🛑 **คนละ error จาก `OrderNotEditableError` ของ `updateOrder` เพราะความหมายกลับด้าน**: อันนั้นบล็อกการแก้ของที่ "เสร็จแล้ว" อันนี้บล็อกการโปรโมตของที่ "ไม่ใช่ร่าง" · `ShippingAddressRequiredError` · `ProductNotInShopError` · `OutOfStockError` — 4 ตัวหลัง **ใช้ class เดิมจาก `order.service.ts` ตรง ๆ ไม่สร้างใหม่** (route ที่ map error → HTTP status เดิมยังใช้ได้)

**(2) ลำดับเรียก**

*ก่อนเปิด tx (read-only — mirror ตำแหน่งเดียวกับ `createOrder`):*
1. `shop.vertical` → `shopShipsGoods()` → `fulfillmentMode` — **ก็อปทั้งบล็อกจาก `:344-401`** (รวมเงื่อนไข `hasManualPhysicalItem` + เช็ค product จริง)
2. FR-6.5 ที่อยู่บังคับเมื่อ `SHIPPED` — **ก็อปจาก `:403-410`**
3. ownership ของ `productId` ทุกตัว — **ก็อปจาก `:412-423`**
4. `assertTransition('DRAFTED','PENDING')` — **ใหม่** (TFR-019)

*ในทรานแซกชัน:*
5. `tx.order.findFirst({ where:{ publicToken, shopId, status:'DRAFTED' } })` lock แถวเดิม — โครงก็อปจาก `updateOrder():740-752`
6. Resolve items **รวม Quick-Create เต็มรูปแบบ** — ก็อปจาก `:519-551` ตรงเป๊ะ ไม่ตัดทอน
   🛑 **ตั้งใจให้ต่างจาก TFR-008** — จุดนี้มาจาก**ฟอร์มที่มนุษย์กรอกเอง** ไม่ใช่ automated pipeline · ข้อห้าม Quick-Create ของ BR-ACO-13 ผูกกับ **TFR-008 เท่านั้น ไม่ครอบการ promote ด้วยมือ**
7. `deductStockForOrderItems()` (entitlement gate) — ก็อปจาก `:553-556`
8. `resolveLineCosts()` + build `itemsCreateData` — ก็อปจาก `:558-566`
9. `findOrCreateCustomer()` + `relinkThreadCustomer()` — ก็อปจาก `:568-570` + `:607-614`
   (ร่างที่ TFR-005 เขียนไว้**ยังไม่เคยผ่านจุดนี้** — `customerId` เป็น `NULL` เสมอบนแถว `DRAFTED`)
10. `tx.order.update({ where:{id}, data:{ status:'PENDING', orderNo: formatOrderNo(publicToken, createdAt), …, items:{create:…} } })`
    ✅ **ง่ายกว่า `createOrder():582-586` จริง** — ยืนยันแล้วว่า `createOrder` ต้อง update รอบสองเพราะ **ต้องรอ `publicToken` ที่ DB สร้าง** (คอมเมนต์ `:583` เขียนไว้เอง) · ร่างมี `publicToken`/`createdAt` อยู่แล้วตั้งแต่ insert แรก ⇒ **คำนวณ `orderNo` ได้ในคำสั่งเดียว**
11. `recordOrderEvent(tx, { orderId, type:'ORDER_CREATED', actorUserId, occurredAt: now })` — ก็อปโครงจาก `:598-605`
    🛑 **ตัดสินใหม่: เขียนตอน promote ไม่ใช่ตอนสร้างร่าง** เพราะร่างไม่นับเป็นออเดอร์จริง (BR-ACO-20e) · `actorUserId` = คนกดฟอร์ม · **`createdByUserId` ของแถวไม่ถูกแตะ** (ยัง `null` — **คนละความหมายกับคนที่มา "เติมให้ครบ" ทีหลัง**)
12. `StockMovement` ต่อ deduction — ก็อปจาก `:616-632`
13. **ไม่มี appointment handling** — ฟีเจอร์นี้จำกัด `ONLINE_SALES` ซึ่งไม่มีแนวคิดนัด ⇒ **ตัดบล็อก `:634-649` ทิ้งโดยตั้งใจ ไม่ใช่ลืม**

⚠️ **ยังไม่ยืนยัน:** `shopChannelId` ถูกเขียนไว้แล้วตอนสร้างร่างหรือต้อง re-resolve ที่นี่เหมือน `createOrder():446-459` — ตัดสินตอนเขียน A7 จริง

**(3) ตาราง — ของที่ `createOrder` ทำให้ฟรี** (🛑 ตอบว่า "เหมือนกัน" ไม่พอ ต้องชี้บรรทัด)

| รายการ | จัดการยังไง | หลักฐาน |
|---|---|---|
| `fulfillmentMode` derivation | ก็อปทั้งบล็อก | `:344-401` (ขั้น 1) |
| VAT/ส่วนลด → `totalAmount` | ก็อปสูตร `round2(subtotal − discount + vat)` เป๊ะ | `:332-334` ✅ ยืนยันแล้ว |
| `OrderEvent` (`ORDER_CREATED`) | ก็อปโครง แต่ **ย้ายจังหวะ** ไปตอน promote | `:598-605` (จังหวะ = ตัดสินใหม่ ไม่ใช่ copy ตรง) |
| `orderNo` | `formatOrderNo()` รวมเข้า update เดียว | `:582-586` (ขั้น 10) |
| `publicToken` | **ไม่ต้องทำอะไร** — มีบนแถวร่างตั้งแต่ insert แรก | คุณสมบัติของ Prisma default ไม่ใช่โค้ดที่ต้อง copy |
| ownership check สินค้า | ก็อปเป๊ะ | `:415-423` (ขั้น 3) |
| `salesChannel` | field ธรรมดาใน object literal | `:487` |
| `Customer` link | ก็อปเป๊ะ 2 ท่อน | `:568-570` + `:607-614` (ขั้น 9) |

> 🛑 **แก้ข้ออ้างของแถว VAT (Controller ตรวจเพิ่ม 2026-08-30):** SDS ร่างแรกเขียนว่า *"ต้องใช้ `round2` ตัวเดียวกัน"* — **ทำไม่ได้ตามตัวอักษร** เพราะ `round2` ใน `createOrder` เป็น **`const` ท้องถิ่นในตัวฟังก์ชัน** (`:330`) ไม่ได้ export
> และทั้งรีโปมี **สำเนาของมัน 4 ชุด** (`order.service.ts:330` · `order-payment.ts:79` · `CartPanel.tsx:39` · `OrderCreateForm.tsx:298`)
> ⇒ **การก็อปชุดที่ 5 คือการทำให้ปัญหาแย่ลง (HR16)** · ทางที่ถูกคือ **สกัด `round2` ขึ้นไปเป็น export ที่เดียว** (เสนอ `src/lib/format-money.ts` ซึ่งเป็นบ้านของ `NET_PROFIT_FORMULA` อยู่แล้ว) แล้วให้ทุกจุดเรียกตัวเดียวกัน — **นับเป็นจุดแก้ B15 ของกลุ่ม B**

**(4) เทสกัน drift** — `src/services/__tests__/auto-order-promote-parity.test.ts`
เทียบผล **2 เส้นทาง** ด้วย input เทียบเท่ากัน: `createOrder()` ปกติ vs `writeDraftedOrderDirect()` → `promoteDraftToOrder()`
- **ต้องเท่ากัน:** `fulfillmentMode` · `totalAmount` (เทียบเป็น string กัน Decimal) · `items[].productId` + `items[].cost` · **มี `OrderEvent(ORDER_CREATED)` ทั้งคู่**
- **ต้องต่างกันโดยตั้งใจ (ระบุเหตุผล ไม่ปล่อยผ่าน):** `createdVia` (`null` vs `'CHAT_AUTO_ORDER'`) · `createdByUserId` (`actorUserId` vs `null` — ดูขั้น 11)
- **mutation:** ลบขั้น 8 (`resolveLineCosts`) ออก → `items[].cost` เป็น `null` ทั้งชุดขณะที่อีกฝั่งมีค่า → **แดงทันที**
  ⇒ พิสูจน์ว่าเทสจับ **"ทำน้อยกว่าที่ควร"** ได้จริง ไม่ใช่ผ่านเพราะ `tsc` เขียว

---

### 3.1 A1 — `src/lib/auto-order-normalize.ts`
```ts
export function normalizeTriggerPhrase(input: string): string  // lowercase + ยุบช่องว่าง เท่านั้น (TFR-002)
export function computeContentHash(rawBody: string): string    // sha256 hex ของข้อความดิบ (TFR-015)
```
**ทำไมอยู่ไฟล์เดียวกันทั้งที่ตัวหนึ่งจงใจ "ไม่" normalize:** ทั้งคู่เป็น text-preprocessing primitive ของ pipeline เดียวกัน แยกไฟล์สำหรับฟังก์ชัน 3–5 บรรทัดเป็นการซอยเกินเหตุ — 🛑 **กันเรียกผิดตัวด้วย 3 ชั้น ไม่ใช่ชั้นเดียว:**
1. **ชื่อพารามิเตอร์ต่างกันโดยจงใจ** — `normalizeTriggerPhrase(phrase)` vs `computeContentHash(rawBody)` · **ชื่อ `rawBody` สื่อ "ห้ามผ่านการ normalize มาก่อน" ในตัวมันเอง**
2. **JSDoc เตือนตรง ๆ:** `🛑 ห้ามส่ง normalizeTriggerPhrase(x) เข้ามา — ต้องเป็น rawBody ดิบเสมอ (TFR-015)`
3. 🛑 **เทส `[blocker]` พิสูจน์ด้วยพฤติกรรม ไม่ใช่แค่คอมเมนต์:**
   `expect(computeContentHash('สรุปคำสั่งซื้อ A')).not.toBe(computeContentHash('สรุปคำสั่งซื้อ  A'))` (ต่างแค่ช่องว่างซ้ำ)
   ⇒ ใครแก้ให้ normalize ก่อน hash **ช่องว่างจะถูกยุบแล้วเทสแดงทันที** — **พิสูจน์ "ไม่ normalize" ด้วยเคสที่ normalize จะทำให้ผลต่างออกไป ไม่ใช่แค่ยืนยันว่า hash เสถียร**

### 3.2 A2 — `src/lib/auto-order-parser.ts`
```ts
export type ParsedAutoOrderItem = { rawName: string; qty: number; price: number | null }
export type ParsedAutoOrderMessage = {
  customerName: string | null; phone: string | null
  addressLine: string | null; subdistrict: string | null; district: string | null
  province: string | null; postcode: string | null
  items: ParsedAutoOrderItem[]
  discount: number | null; statedTotal: number | null
  note: string | null; paymentMethod: string | null
}
export function parseAutoOrderMessage(rawBody: string): ParsedAutoOrderMessage
```
**State machine — ไล่บรรทัดครั้งเดียว O(n):** ตัวแปรสถานะเดียว `currentField: FieldKey | 'ITEMS' | null`
- **เทียบ header ทั้ง 8 ก่อนเสมอ** → เจอ `รายการ` = ตั้ง `currentField='ITEMS'` **ไม่ดึงค่าจากบรรทัดนั้น** · เจอ field สเกลาร์ = ดึงข้อความหลัง `:` **overwrite ทับของเดิม** (TFR-006 ค่าหลังสุดชนะ)
- **ไม่เจอ header:** `ITEMS` → ทดสอบ regex สินค้า ขึ้นต้น `-` = push **สะสมต่อกัน** (TFR-006) · ไม่ขึ้นต้น `-` = **ข้ามเฉย ๆ ไม่นับเป็นทั้ง item และ field ต่อเนื่อง** · field สเกลาร์ → **ต่อท้ายด้วย `\n`** (รองรับที่อยู่/หมายเหตุหลายบรรทัด) · `null` (ยังไม่เจอ header แรก) → ทิ้ง (มักเป็นตัววลีจุดชนวนเอง)

🛑 **ที่อยู่ — ห้ามเขียนตัวแยก ต./อ./จ./รหัสไปรษณีย์ใหม่ ต้อง reuse ของเดิม:**
นำ block ข้อความสะสมของ field `ที่อยู่` ไปเรียก **`parseOrderMessage(addressBlock)`** (`src/lib/parse-order-message.ts:139` ✅ ยืนยันแล้ว) แล้วดึง `.subdistrict/.district/.province/.postcode/.addressLine`
**เหตุผล:** ไฟล์นั้นถือ `PROVINCES` (`:37`) ที่สะกดตรงกับชุดข้อมูล iShip และ**คอมเมนต์ `:33` เขียนไว้เองว่า** *"ห้ามแก้การสะกดให้ต่างจากชุดข้อมูลนั้น: ค่าที่ได้ตรงนี้ถูกส่งต่อไปเปิดพัสดุจริง"* ⇒ เขียนตัวแยกใหม่ = **SSOT ที่สองที่สะกดจังหวัดต่างจากของเดิมได้** (คลาสบั๊กที่ระบบนี้เคยเจอจริงกับ `iship-locality-swap`)
ℹ️ input ที่ป้อนตรงนี้ **สะอาดกว่าที่ `parseOrderMessage` ถูกออกแบบมารองรับด้วยซ้ำ** — ของเดิมต้องเดาเองว่าบรรทัดไหนคือที่อยู่จากข้อความอิสระทั้งก้อน ส่วนที่นี่**รู้ขอบเขตแน่นอนจาก header อยู่แล้ว**

**ตารางหัวข้อ + คำพ้อง** (BR-ACO-11 — ⚠️ **เสนอชุดคำ ต้องตรวจกับ `UX-Design-Spec.md` อีกรอบก่อน implement**):

| Field | บังคับ | คำพ้อง (case-insensitive) |
|---|---|---|
| `customerName` | ✅ | `ชื่อ` · `ชื่อผู้รับ` · `ผู้รับ` |
| `phone` | ✅ | `เบอร์` · `เบอร์โทร` · `โทร` · `เบอร์ติดต่อ` · `Tel` |
| address (4 ฟิลด์) | ✅ | `ที่อยู่` · `ที่อยู่จัดส่ง` · `ที่อยู่จัดส่งสินค้า` |
| `items[]` | ✅ | `รายการ` · `รายการสินค้า` · `สินค้า` |
| `discount` | — | `ส่วนลด` · `discount` |
| `statedTotal` | — | `ยอดรวม` · `ยอด` · `รวม` · `total` |
| `note` | — | `หมายเหตุ` · `note` |
| `paymentMethod` | — | `ชำระโดย` · `ชำระ` · `วิธีชำระ` · `payment` |

### 3.3 A6 — `auto-order-validate.service.ts` (จุดต่อ pure ↔ I/O)

🛑 **จำนวน query ต่อ 1 ข้อความ = คงที่ 2 ครั้ง ไม่ว่ารายการสินค้าจะมีกี่บรรทัด — ไม่ใช่ N+1**
```ts
// query #1 — shop vertical (pattern เดิมของ createOrder :353-357)
const shop = await prisma.shop.findUnique({ where:{id:shopId}, select:{vertical:true} })
const shipsGoods = shopShipsGoods(shop?.vertical)

// query #2 — ดึงแคตตาล็อกทั้งร้านครั้งเดียว ไม่ query ต่อรายการ
const catalog = await prisma.product.findMany({ where:{shopId}, select:{id:true,name:true,sku:true} })
const byName = new Map(catalog.map(p => [p.name.trim().toLowerCase(), p.id]))
const bySku  = new Map(catalog.filter(p => p.sku).map(p => [p.sku!.trim(), p.id]))

// จากนี้ in-memory ล้วน
const matched = parsed.items.map(i => ({ rawName:i.rawName, qty:i.qty, price:i.price,
  matchedProductId: byName.get(i.rawName.trim().toLowerCase()) ?? bySku.get(i.rawName.trim()) ?? null }))
const reasons = deriveDraftReasons({ /* parsed + matched + shipsGoods + messageAt/nowMs */ })
return { complete: reasons.length === 0, reasons, matchedItems: matched, shipsGoods }
```
🛑 **ทำไม batch-fetch แทนการเรียก `matchProductByRawName()` ทีละชื่อในลูป — ต่างจากที่ SRS TFR-008 ร่างไว้:**
เส้นทางนี้อยู่บน **webhook handler** ที่มี **KPI latency 5 วินาที** คุมอยู่ ⇒ ข้อความ 10 บรรทัด × query ต่อบรรทัด = **10 round-trip ไป Postgres ต่อ 1 ข้อความ** สะสมจริงเมื่อร้าน burst หลายข้อความพร้อมกัน
**ยังคงกฎ "ตรงเป๊ะเท่านั้น" ครบ** — เทียบ string เป๊ะหลัง `trim().toLowerCase()` ใน JS ให้ผลเหมือน SQL `mode:'insensitive'` ทุกประการ **ไม่ใช่การผ่อนกฎ**
🛑 **และไม่ใช่ทางเลือกรอง:** Prisma **ไม่รองรับ `mode:'insensitive'` ร่วมกับ `in`** ⇒ ต่อให้อยากยิง query เดียวแบบ `where:{name:{in:[…]}}` ก็ทำ case-insensitive ไม่ได้อยู่ดี
- ⚠️ **ความเสี่ยงที่ยอมรับ:** ร้านที่มีแคตตาล็อกหลักพันรายการโหลดข้อมูลมากกว่าที่จำเป็นต่อ 1 ข้อความ — **ยังไม่มีตัวเลขจริงจาก prod ว่าร้านทั่วไปมีสินค้ากี่รายการ** ⇒ **ไม่ตั้ง threshold ลอย ๆ** พบว่าเป็นปัญหาจริงหลัง deploy ค่อยเติม cache/limit

---

### 3.4 A7 — `detectAutoOrderTrigger(chatMessageId)` orchestration เต็ม

**ก่อนทรานแซกชันใด ๆ (sequential ทำครั้งเดียว):**
1. **Guard** — `senderRole==='SHOP'` · config `status≠OFFLINE` · เพจอยู่ใน effective channel set · `matchesTriggerPhrase()`
   ไม่ผ่านข้อใด → **return เงียบ ไม่เขียนอะไรเลย** (AC-ACO-11)
2. **Dedup** — query `contentHash` ภายใน 2 นาที (TFR-015) → เจอ → **return เงียบ ไม่มีการ์ดด้วย** (*เนื้อหาซ้ำไม่ใช่เหตุการณ์ใหม่*)
3. `parseAutoOrderMessage()` (pure) + `validateAutoOrderCompleteness()` (2 query) → `{complete, reasons, matchedItems}`
4. หา `supersedesOrderId` (TFR-016)

**5. 🛑 `createOrder()` ต้องรับ param เพิ่มอีก 6 ตัว ไม่ใช่แค่ `createdVia` ตัวเดียว**
`sourceChatMessageId?` · `supersedesOrderId?` · `matchedTriggerPhrase?` · `contentHash?` · `detectionResolvedAt?` · `isDryRun?` — เขียนตาม pattern `?? undefined` เดียวกับฟิลด์เดิมใน `orderDataBase` (`:474-497`)
⇒ **B4 ขยายขอบเขตจากที่ประเมินไว้ (1 param → 7 param)**

> 🛑 **แก้เหตุผลที่ SDS ร่างแรกให้ไว้ (Controller ตรวจ 2026-08-30):** ร่างแรกอ้างว่าต้องขยายเพราะ *"ถ้ากิ่งสำเร็จสร้างแถวแยก จะมี 2 แถวแข่งกัน claim `sourceChatMessageId @unique`"* — **เหตุผลนี้ไม่ถูก** เพราะ **กิ่งสำเร็จกับกิ่งร่างเป็น if/else ต่อ 1 ข้อความ มีแถวเดียวถูกสร้างเสมอ ไม่มีการแข่งกัน**
> **เหตุผลที่ถูกและง่ายกว่า:** กิ่งสำเร็จเดินผ่าน `createOrder()` (บังคับโดย TFR-011 เพื่อให้ตัดสต๊อกจริง) และคอลัมน์ใหม่ทั้ง 6 ต้องถูกเขียนบนแถวนั้น ⇒ **ไม่มีทางอื่นนอกจากให้ `createOrder()` รับค่าเหล่านี้** · ข้อสรุปยังคงเดิม แต่ **บันทึกเหตุผลที่ผิดไว้จะทำให้คนถัดไปตัดสินใจผิดตอนคิดเรื่อง race**

6. `writeAutoOrderResultMessage({ conversationId, orderId: null })` **ก่อน** ขั้น 7–8 — การ์ด `READING` ต้องขึ้นเร็วที่สุด **ไม่รอ query อื่น**
7. **ทรานแซกชันเดียว:** ครบเกณฑ์ → `createOrder(...)` (ตัดสต๊อกจริง TFR-011) · ไม่ครบ → `tx.order.create({ status:'DRAFTED', draftReasons, sourceChatMessageId, totalAmount:0, orderNo:null, expiresAt:now+7d })`
8. **นอกทรานแซกชัน (หลังขั้น 7 สำเร็จ):** `chatMessage.update({ data:{ autoOrderId: newOrder.id } })` + set `detectionResolvedAt`
   ⇒ `READING → CREATED/DRAFT` โดย **frontend derive จาก `Order.status` ที่ join มา ไม่มี state column แยกบน `ChatMessage`**

🛑 **ตอบตรง — การ์ดค้าง `READING` ตลอดกาลไหมถ้า crash: ค้างจริง ถ้า crash ระหว่างขั้น 6–8**
(การ์ดเขียนไปแล้ว `autoOrderId=null` และไม่มี `Order` แถวไหนผูกกับ `chatMessageId` นี้)
**ผู้เก็บกวาดคือ Watchdog (§3.6)** — ใช้ query **เดียวกัน**กับที่หาเคส "ตรงวลีแต่ไม่มี Order ผูก" ⇒ **ครอบทั้ง crash-mid-pipeline และ backfill-skip ด้วย query เดียว เพราะสองเคสมีอาการเดียวกันจากมุมนี้**
Watchdog เขียน draft แล้ว **หาการ์ด orphan ด้วย heuristic** (การ์ด `AUTO_ORDER_RESULT` ตัวแรกที่ `autoOrderId=null` ในห้องเดียวกัน เกิดหลัง trigger message นี้) → เจอ = update · ไม่เจอ = สร้างการ์ดใหม่ตรงกิ่ง DRAFT เลย (**ข้าม READING เพราะไม่มีใครรอดูมันแล้ว**)
⚠️ **heuristic นี้ไม่ perfect** — ถ้าห้องเดียวกันมี ≥2 ข้อความค้างพร้อมกัน **อาจจับคู่การ์ดผิดใบ** — ยอมรับเป็นความเสี่ยงขอบของ v1

### 3.5 "ชั้นตัวนับ" — เทสจับรูปร่าง vs allow-list

🛑 **บอกตรง ๆ ก่อน: เทส grep/regex ล้วน แยก "query ที่ผลถูกใช้ตัดสิน/นับ" ออกจาก "query ที่ผลแค่แสดงผลดิบ" ไม่ได้จริง**
สองอย่างนี้**หน้าตาเหมือนกันทุกประการในระดับ syntax** (`prisma.chatMessage.findMany({where:{conversationId}})`) ต่างกันแค่ **สิ่งที่บรรทัดถัดไปเอาผลไปทำ** ซึ่งต้องอ่านความหมาย ไม่ใช่จับรูปแบบตัวอักษร — เครื่องมือที่โปรเจกต์มี (vitest บน node ไม่มี TS compiler API) ทำไม่ได้

**ทางที่ใกล้เคียงที่สุดที่ทำได้จริง — เปลี่ยนจาก "ตรวจความปลอดภัย" เป็น "บังคับให้มีคนตัดสินทุกจุดใหม่":**
```ts
// src/services/__tests__/chat-message-reader-inventory.test.ts
// 🛑 รายการนี้ = "จุดที่ตรวจแล้วและมีเหตุผลบันทึกไว้" ไม่ใช่ "จุดที่ปลอดภัยแน่นอน"
const REVIEWED: Record<string, string> = {
  'src/services/chat.service.ts:599': 'getMessages — TFR-022 กรอง viewerRole',
  'src/services/chat-metrics.service.ts:91': 'lastShop — TFR-022 เพิ่ม type filter',
  'src/services/auto-reply.service.ts:846': 'lastShop boundary — TFR-022 เพิ่ม type filter',
  'src/app/api/chat/conversations/[id]/ai-suggest/route.ts:235': 'AI context — TFR-022 เพิ่ม type filter',
  'src/services/chat-outbox.service.ts:417': 'deliveryStatus=QUEUED — ปลอดภัยโดยธรรมชาติ (ไม่ใช้ type)',
  // … ครบทุกแถวจากตาราง TFR-022 + §0 #6
}
it('ทุกจุดที่เรียก chatMessage.findMany/findFirst ต้องอยู่ใน REVIEWED', () => {
  const unreviewed = grepAllCallSites('chatMessage\\.(findMany|findFirst)\\(')
    .filter((loc) => !(loc in REVIEWED))
  expect(unreviewed).toEqual([])   // แดงพร้อม path:line ที่ยังไม่ผ่านรีวิว
})
```
**ต่างจาก allow-list ธรรมดายังไง:** allow-list บอกว่า *"ไฟล์เหล่านี้ปลอดภัย จบ"* แล้วเงียบตลอดกาล — ตัวนี้บอกว่า *"ไฟล์เหล่านี้**ผ่านการตัดสินใจแล้วพร้อมเหตุผลกำกับ**"* และที่สำคัญกว่าคือ 🛑 **จุดที่ 4 (ยังไม่เกิด) จะทำให้เทสแดงทันทีที่มันถูกเขียน ไม่ว่าจะปลอดภัยหรือไม่** ⇒ บังคับให้คนเขียนต้องเปิดไฟล์นี้มาเพิ่มแถวพร้อมเหตุผล (**ผ่าน code review เห็นแน่นอน**) แทนที่จะหลุดเงียบ
⇒ **นี่คือ "บังคับให้มีคนตัดสิน" ไม่ใช่ "ให้เครื่องตัดสินแทน"** — เป้าหมายที่ทำได้จริงด้วยเครื่องมือที่มี

### 3.6 A11 — Watchdog + Reaper (2 phase, cron เดียว)
**Phase 1:** query `ChatMessage` (bound 30→2 นาที, **ต้องมี index ใหม่ตาม SRS §5.2**) → `matchesTriggerPhrase()` in-memory → `Order.findFirst({sourceChatMessageId})` ไม่พบ → `writeProcessingFailedDraft()` + heuristic reconcile การ์ด (§3.4)

**Phase 2:**
```ts
// src/lib/auto-order-cancel-reasons.ts — ค่าคงที่ของฟีเจอร์นี้อยู่ไฟล์เดียว
export const DRAFT_EXPIRE_REASON = 'DRAFT_EXPIRED' as const   // ✅ ตัดสินแล้ว DATABASE.md §6
export const DRAFT_DISCARD_REASON = '{{PENDING_USER_DECISION}}' as const // 🛑 ยังเป็น open question (ผู้ขายกดทิ้งเอง ≠ ระบบหมดอายุ)
```
`updateMany({ where:{status:'DRAFTED',isDryRun:false,expiresAt:{lte:now}}, data:{status:'CANCELLED', cancelReason: DRAFT_EXPIRE_REASON} })`
🛑 **import ค่าคงที่จุดเดียว ไม่ hardcode สตริงซ้ำ** ⇒ เมื่อ user เคาะ `DRAFT_DISCARD_REASON` **แก้ไฟล์เดียว** (B6/B8 ที่ import ไปใช้ได้ค่าใหม่อัตโนมัติ ไม่ต้องไล่แก้หลายจุด)

---

### 3.7 A5 — `auto-order-config.service.ts` *(ตรงไปตรงมา ไม่มีจุดตัดสิน)*
CRUD ตาม TFR-001/003: `getOrCreateAutoOrderConfig()` · `upsertPhrases()` · `setChannels()` · `setStatus()` (เรียก guard TFR-003 + TFR-004 ก่อนเขียน)
⚠️ **role-check (AC-ACO-07) ยังค้าง** ตามที่ SRS §9 ทิ้งไว้ — reuse pattern สิทธิ์ของ 00023 ตอนเขียนโค้ดจริง

### 3.8 A9 — `message-echoes-health.service.ts` *(ตรงไปตรงมา)*
`checkMessageEchoesHealth()` → `GET subscribed_apps` → เขียนสถานะ · `repairMessageEchoes()` → **GET เดิมก่อน** → `POST subscribed_fields=<เดิมทั้งหมด>,message_echoes` (**replace ทั้งชุด**) → ตรวจซ้ำยืนยัน

### 3.9 A8 — `auto-order-internal-message.service.ts` (ตอบเรื่องค่าคงที่ `type`)

🛑 **แก้ถ้อยคำ TFR-020 ("import แค่ `prisma`") ให้แม่นขึ้น:** เจตนาจริงคือ **ห้าม import สิ่งที่มี runtime behavior ของ `sendMessage`/`sendOutboundMessage`/`detectAutoOrderTrigger`** ไม่ใช่ห้าม import *ทุกอย่าง*
✅ ยืนยันแล้วว่า **ไม่มีค่าคงที่ runtime กลางของ `ChatMessage.type` ในระบบ** — ทุกที่เขียน string literal ตรง ๆ (`auto-reply.service.ts:855` · `comment-private-reply.service.ts:416` ฯลฯ)
```ts
// src/lib/auto-order-message-type.ts — ไฟล์นี้ไม่ import อะไรเลยแม้แต่ prisma
export const AUTO_ORDER_RESULT_TYPE = 'AUTO_ORDER_RESULT' as const
```
⇒ A8 import **2 อย่างเท่านั้น** (`prisma` + ค่าคงที่นี้ ซึ่งไม่มี runtime behavior)
🛑 **และจุดกรองฝั่งอ่านทุกจุด (B2/B12/B13/B14) import ค่าคงที่ตัวเดียวกันนี้ แทนการพิมพ์ `'AUTO_ORDER_RESULT'` ซ้ำ** ⇒ **ปิดความเสี่ยง typo-drift ระหว่างฝั่งเขียนกับฝั่งอ่านตั้งแต่ต้นทาง แทนที่จะต้องมีกลไก sync ทีหลัง**

✅ **ไม่มี DB CHECK บน `ChatMessage.type`** (grep `prisma/migrations/` ไม่พบ `ChatMessage_type*`) ⇒ **ไม่ต้องมี migration สำหรับค่าใหม่**

> 🛑 **Controller ตรวจเพิ่ม 2026-08-30 — พบสิ่งที่ SDS ยังไม่เห็น และมันสำคัญกว่าเรื่องค่าคงที่:**
> **มี type union อยู่จริง** — `ChatMessageType` ที่ `chat.service.ts:12`
> (`'TEXT'|'IMAGE'|'PRODUCT'|'VIDEO'|'AUDIO'|'FILE'|'ORDER'|'CALL'`) และมันถูกใช้ **2 ที่ที่มีความหมายตรงข้ามกัน**:
> - `:94` — **รูปร่างของข้อความที่อ่านออกมา** (สิ่งที่ *เก็บได้*)
> - `:713` — **พารามิเตอร์ของ `sendMessage()`** (สิ่งที่ *ส่งได้*)
>
> ⇒ 🛑 **ถ้าเติม `'AUTO_ORDER_RESULT'` เข้า union ตัวนี้ตรง ๆ `sendMessage()` จะเริ่ม "ยอมรับ" มันทันที** —
> **ระบบชนิดจะพลิกจากที่ห้ามอยู่แล้ว กลายเป็นอนุญาต** ซึ่งตรงข้ามกับ TFR-020/AC-58 ทั้งข้อ
>
> **ทางที่ถูก — แยกเป็น 2 ชนิด:**
> ```ts
> export type SendableMessageType = 'TEXT'|'IMAGE'|'PRODUCT'|'VIDEO'|'AUDIO'|'FILE'|'ORDER'|'CALL'
> export type StoredMessageType   = SendableMessageType | 'AUTO_ORDER_RESULT'
> // :713 sendMessage(params.type: SendableMessageType)   ← แคบ ไม่มีค่าใหม่
> // :94  รูปร่างที่อ่านออกมา: StoredMessageType          ← กว้าง มีค่าใหม่
> ```
> ⇒ **`tsc` เองกลายเป็นด่านที่บังคับว่า "การ์ดภายในส่งผ่าน `sendMessage` ไม่ได้"** — **แข็งแรงกว่าเทสสแกนซอร์สของ AC-58 เพราะมันล้มตั้งแต่ compile ไม่ใช่ตอนรันเทส** (เทสสแกนซอร์สยังควรมีไว้เป็นชั้นสอง กันคนแก้ type กลับ)
> **⇒ เพิ่มเป็นจุดแก้ B16** · หมายเหตุ: `ChatThread.tsx:62` (ฝั่งผู้ซื้อ) **ประกาศ union ของตัวเองแคบกว่า** (`TEXT|IMAGE|PRODUCT|ORDER`) ไม่ได้ import จาก service — ซ้ำซ้อนอยู่ก่อนแล้ว **แต่บังเอิญเป็นผลดีกับฟีเจอร์นี้** (ฝั่งผู้ซื้อไม่รู้จักค่าใหม่เลยแม้แต่ในระดับชนิด)

### 3.10 B15 — สกัด `round2()` เป็น SSOT เดียว
```ts
// src/lib/money-round.ts
export function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }
```
**จุดเดิมที่ต้องแก้ให้ import แทน local `const`: 5 จุด ไม่ใช่ 4** — `order.service.ts:330` (`createOrder`) · **`order.service.ts:705` (`updateOrder` — สำเนาที่ 5 ที่เพิ่งเจอ)** · `order-payment.ts:79` · `CartPanel.tsx:39` · `OrderCreateForm.tsx:298`
⇒ **A6/A7 ของฟีเจอร์นี้ import จากไฟล์นี้ตั้งแต่วันแรก ไม่มีสำเนาที่ 6 เกิดขึ้นเลย** — เป็นการแก้เชิงกล ไม่มีจุดตัดสินเพิ่ม

---

## 4. Integration Points

| จุดเชื่อม | ประเภท | Contract | ความเสี่ยงเมื่อล่ม |
|---|---|---|---|
| **Meta Graph `subscribed_apps`** | external | REST/JSON + page access token | ตรวจสิทธิ์ไม่ได้ → เปิด LIVE ไม่ได้ (**จำกัดเฉพาะการตั้งค่า ไม่กระทบ pipeline ที่ทำงานอยู่**) |
| **`createOrder()`/`cancelOrder()`/`VALID_TRANSITIONS`** | internal (กลุ่ม B) | เรียกตรงในโปรเซสเดียว | แก้ผิด **กระทบทุกช่องทางสร้าง/ยกเลิกออเดอร์ในระบบ** |
| **`getMessages()`/`sendMessage()`** | internal (กลุ่ม B) | เรียกตรง | จุดที่ seller web + buyer web ใช้ร่วมกัน |
| **`parseOrderMessage()`** | internal (เรียกเฉย ๆ) | pure call | ถ้าพฤติกรรมเดิมเปลี่ยนเพื่อฟีเจอร์อื่น **กระทบการแยกที่อยู่ของเราโดยไม่ตั้งใจ — ไม่มี integration test ข้ามฟีเจอร์ที่จับได้ในตอนนี้** |
| **`after()` (Next.js)** | internal (runtime) | deferred execution | ถูกฆ่าก่อนจบได้ ⇒ **นี่คือเหตุผลที่ต้องมี Watchdog เป็น safety net ไม่ใช่กลไกหลักที่พึ่งได้ 100%** |
| **`Order_sourceChatMessageId_key`** | internal (DB) | Postgres constraint | **ด่าน dedup เดียวที่มีจริงเมื่อ entry 1/2 ชนกัน — ต่อรองไม่ได้** |

**Timeout/Retry:** entry 1/2 **ไม่มี retry ของตัวเอง** (throw กลางทาง = ไม่ retry ทันที **Watchdog เก็บกวาดใน 2 นาทีถัดไปแทน**) · `repairMessageEchoes()` idempotent โดยธรรมชาติ (replace ทั้งชุดทุกครั้ง) · สัญญา API เต็มอยู่ที่ `API.md`

---

## 5. Technical Decisions

> 🛑 **ทุกแถวมีคอลัมน์ "ความเสี่ยงที่ยังค้าง" บังคับ — TD ที่อ่านแล้วรู้สึกว่า "ไม่มีข้อเสียเลย" คือ TD ที่เขียนไม่ครบ**

### TD-001 — เขียน `promoteDraftToOrder()` ใหม่ แทน reuse `updateOrder()`
**เหตุผล:** `:758` บล็อกทุกสถานะที่ไม่ใช่ `PENDING` โดยตั้งใจ (คอมเมนต์ `:755-757` ยืนยันว่ากัน `SHIPPED`/`CONFIRMED` ถูกแก้ย้อนหลัง) + ไม่มี path กำหนด `orderNo` จาก `NULL`
**ตัดทิ้ง:** แก้ guard ให้ยอมรับ `DRAFTED` — **guard นั้นปกป้องออเดอร์ที่ผู้ซื้อรับของ/รีวิวไปแล้ว แก้ปนกันเสี่ยงเปิดช่องแก้ออเดอร์ที่ไม่ควรแก้ได้ในเส้นทางอื่นทั้งระบบ**
🛑 **ความเสี่ยงที่ค้าง:** **ฟังก์ชันใหม่ไม่ sync อัตโนมัติกับ `createOrder()`** — วันที่มีคนเพิ่ม field ใหม่ใน `createOrder()` แล้วลืมเพิ่มที่นี่ **จะไม่มี compiler error เตือน** (คนละ signature) · เทส parity เป็นด่านเดียว **และจับได้เฉพาะฟิลด์ที่เทสระบุไว้ล่วงหน้า ไม่ใช่ฟิลด์ใหม่ที่ยังไม่มีใครเขียนเทสรอ**

### TD-002 — Batch-fetch แคตตาล็อก แทน query ต่อรายการ
**เหตุผล:** webhook มี KPI 5 วินาที · N+1 สะสมจริงเมื่อ burst · Prisma ไม่รองรับ `mode:'insensitive'` + `in`
🛑 **ความเสี่ยงที่ค้าง:** ร้านแคตตาล็อกใหญ่โหลดเกินจำเป็นทุกข้อความ — **ไม่มีตัวเลข threshold จาก prod จริง** · ไม่มี cache/limit ใน v1 **และยังไม่ได้ออกแบบไว้ด้วย**

### TD-003 — Reuse `parseOrderMessage()` แยกที่อยู่ แทนเขียนใหม่
**เหตุผล:** `PROVINCES` (`:37-49`) สะกดตรงชุดข้อมูล iShip — เขียนใหม่ = SSOT คู่ขนาน (คลาสบั๊ก locality-swap ที่เคยเกิดจริง)
🛑 **ความเสี่ยงที่ค้าง:** ฟังก์ชันนั้นออกแบบมาสำหรับ input ที่**มี noise รอบข้าง** — พฤติกรรมกับ input ที่**สะอาด** (เฉพาะ address block) **ยังไม่เคยถูกทดสอบจริง** · อาจมี regex ที่พึ่ง context รอบข้าง (บรรทัดว่าง/ตำแหน่งในข้อความ) ⇒ **ต้องมีเทสยิง input จริงหลากแบบก่อนเชื่อ ไม่ใช่สมมติว่าจะทำงานถูก**

### TD-004 — การ์ด `READING` เขียนก่อน + Watchdog reconcile ด้วย heuristic
**เหตุผล:** UX ต้องการ feedback ทันที กันร้านพิมพ์ซ้ำเพราะคิดว่าค้าง
**ตัดทิ้ง:** เขียนครั้งเดียวตอนรู้ผล — ขัด UX spec + **เพิ่มความเสี่ยงพิมพ์ซ้ำซึ่งชนกับ dedup window พอดี**
🛑 **ความเสี่ยงที่ค้าง:** **ไม่มี FK ย้อนกลับจากการ์ดไปยัง trigger message** (schema ล็อกแล้ว) ⇒ Watchdog ใช้ heuristic ที่**จับคู่ผิดได้จริง**ถ้าห้องเดียวมีข้อความค้าง ≥2 ใบ — **ไม่มี mitigation ใน v1** เพราะแก้ให้เป๊ะต้องเพิ่มคอลัมน์ ซึ่งอยู่นอกอำนาจ SDS

### TD-005 — Inventory test แทน semantic shape-detection
**เหตุผล:** แยก "query ที่ใช้ตัดสิน" กับ "query ที่แสดงผลดิบ" เป็น semantic ไม่ใช่ syntax — เครื่องมือที่มีทำไม่ได้จริง
🛑 **ความเสี่ยงที่ค้าง:** ป้องกันได้แค่ **"ลืมแตะไฟล์นี้"** **ไม่ได้ป้องกัน "แตะแล้วคิดผิด"** — dev ที่เติมชื่อเข้า `REVIEWED` เพียงเพื่อให้เทสผ่านโดยไม่พิจารณาจริง **จะหลุดได้เหมือนเดิม** ⇒ เป็นด่าน *"บังคับให้มีคนตัดสิน"* ไม่ใช่ *"รับประกันว่าตัดสินถูก"*

### TD-006 — แยก `SendableMessageType`/`StoredMessageType` (B16)
**เหตุผล:** เติมค่าเข้า union เดียวที่ทั้ง `:94` (อ่าน) และ `:713` (ส่ง) ใช้ร่วมกัน จะทำให้ **`sendMessage()` ยอมรับค่านี้ทันทีในระดับชนิด — พลิกจาก "ห้ามอยู่แล้ว" เป็น "อนุญาต"** ตรงข้ามกับ AC-58 · แยกแล้ว **`tsc` เป็นด่านตั้งแต่ compile แข็งแรงกว่าเทสสแกนซอร์ส**
✅ **ความเสี่ยงที่ค้างเดิม (ยังไม่ grep ผู้ import) — Controller ปิดให้แล้ว:** `ChatMessageType` ถูกใช้ **เฉพาะ `:94` และ `:713` เท่านั้นทั้งระบบ** · `ChatThread.tsx:62` ฝั่งผู้ซื้อ**ประกาศ union ของตัวเองแยก** ไม่ได้ import (ซ้ำซ้อนเดิม **แต่บังเอิญเป็นผลดี** — ไม่รู้จักค่าใหม่แม้ในระดับชนิด) ⇒ **การแยก type กระทบแค่ 2 จุดที่รู้แล้ว ไม่มีจุดที่สาม**

### TD-007 — สกัด `round2()` (B15 — **5 สำเนา ไม่ใช่ 4**)
**เหตุผล:** HR16 — ต้องการสูตรเดียวกันเป๊ะสำหรับ `TOTAL_MISMATCH` และ `totalAmount` ตอน promote · ไม่สกัด = สร้างสำเนาที่ 6
🛑 **ความเสี่ยงที่ค้าง:** แก้ 5 จุดเดิมเป็นงาน**นอกขอบเขต "แค่เพิ่มฟีเจอร์ใหม่"** · `order.service.ts` เป็นไฟล์ที่หลายฟีเจอร์แก้พร้อมกันบ่อย ⇒ **เสี่ยง merge conflict** + ต้องยืนยันพฤติกรรมเชิงตัวเลขของทั้ง 5 จุดเหมือนเดิมทุก edge case (ค่าติดลบ/ทศนิยมยาว) **ไม่ใช่แค่ `tsc` ผ่าน**

### TD-008 — ขยาย `createOrder()` 7 param optional แทนสร้าง wrapper
**ตัดทิ้ง:** เรียก `createOrder()` ปกติแล้ว `update` คอลัมน์เพิ่มเป็นคำสั่งที่สอง — 🛑 **เสีย atomicity: ถ้า update ที่สองล้ม จะได้ออเดอร์ที่ไม่มี `sourceChatMessageId` ผูก ⇒ Watchdog เข้าใจผิดว่ายังไม่ประมวลผล แล้วสร้างซ้ำ ชนกับ `@unique` — แย่กว่าเดิม**
🛑 **ความเสี่ยงที่ค้าง:** `createOrder()` คือฟังก์ชันที่ทุกช่องทางเรียก — เพิ่ม 7 param แม้ optional ทั้งหมด **ก็เพิ่มพื้นที่ผิวของฟังก์ชันที่มีความเสี่ยงสูงสุดในระบบ** กระทบ readability/type-inference ของทุก caller เดิมแม้ไม่ได้ใช้ค่าใหม่

---

## 6. Traceability

| SRS TFR | SDS Element |
|---|---|
| 001, 003, 004 | A5, A9 *(ตรงไปตรงมา ไม่มี TD)* |
| 002, 015 | A1 |
| 005, 006, 007 | A2, TD-003 |
| 008, 010 | A6, TD-002 |
| 009 | ใช้ `order-date-window.ts` เดิมตรง — **ไม่มี component ใหม่** |
| 011 | A7 ขั้น 7, TD-008 |
| 012, 014 | A3 |
| 013 | B4, TD-008 |
| 016, 017 | A7 §3.4 ขั้น 4 + ปุ่มยกเลิก (**เรียก route เดิม**) |
| 018 | negative requirement — ไม่มี component ใหม่ นอกจากการ์ดแจ้งเตือน |
| 019 | A7 ขั้น 5–8, §3.9, TD-001, A4 |
| 020 | A8, TD-006 |
| 021 | A7 (closed caller set — B1/B5 → A7 เท่านั้น) |
| 022 | B2, B12, B13, B14, TD-005 |
| 023 | B9, B10, B11 |
| 024 | A11, §3.6 |
| 025 | A7 ขั้น 1 (guard `isDryRun`) |
| 026 | ไม่มี component ใหม่ — regression เท่านั้น |

---

## 7. สรุป

**11 ไฟล์ใหม่ (A) + 16 จุดแก้ใน 12 ไฟล์เดิม (B) + 7 component ที่เรียกเฉย ๆ (C)** พร้อม **8 Technical Decision ที่ SDS ตัดสินเองนอกเหนือจากที่ SRS สั่ง** — 🛑 **ทุกข้อมีความเสี่ยงที่ยังค้างบันทึกไว้ ไม่มีข้อไหน "ไม่มีข้อเสีย"**

**ลำดับ build ที่แนะนำ:**
1. **A1 → A2 → A3** (pure ทั้งหมด ไม่มี dependency ภายนอก) — เขียน+เทสได้ก่อนสุด
2. **A4 + TD-007 (สกัด `round2`) + TD-006 (แยก type union)** — งานเชิงกลที่ต้องเสร็จก่อนจุดอื่นมาพึ่ง
3. 🛑 **B3, B4 (`order.service.ts`) — ความเสี่ยงสูงสุด ทำเดี่ยว ๆ พร้อมเทส parity ก่อนแตะจุดอื่น**
4. **A6 → A7 → A8** — แกนกลาง pipeline
5. **B1, B2, B5** (entry point + ชั้นอ่าน) → **B12/B13/B14** (ชั้นตัวนับ)
6. **A5, A9 → A10/A11 → B6–B11**

> 🛑 **เพิ่ม 2026-08-30 หลังเขียน `API.md` — ช่องว่างที่เห็นได้เฉพาะจากมุมสัญญาหน้าประตู:**
> 1. **ฟังก์ชันที่ `POST /api/orders/{token}/auto-order/retry` เรียกตอน "อ่านสำเร็จรอบนี้" ยังไม่มีใน §2/§3**
>    — **ไม่ใช่ `promoteDraftToOrder()`** เพราะ retry เดินเส้นทาง **automated (ห้าม Quick-Create ตาม TFR-008)**
>    ขณะที่ `promoteDraftToOrder()` **อนุญาต** Quick-Create (มนุษย์กรอกฟอร์มเอง §3.9 ขั้น 6)
>    ⇒ ต้องเป็นเส้นทางที่ **ยึด `sourceChatMessageId` เดิม (UPDATE ไม่ใช่ INSERT) + ตรวจสินค้าแบบ automated**
> 2. **`DRAFT_DISCARD_REASON`** (ปุ่ม "ทิ้งร่างนี้") = ค่าคงที่ตัวใหม่ **คนละตัวกับ `DRAFT_EXPIRED` ของ reaper (ตัวนั้นตัดสินแล้ว)**
>    (*"ผู้ขายกดเอง" ≠ "ระบบหมดอายุ"*) ⇒ วางไว้ไฟล์เดียวกัน (`auto-order-cancel-reasons.ts`) รอ user เคาะพร้อมกัน

**Open Questions ที่ยังไม่ปิด** (สืบทอดจาก SRS §10 — SDS ไม่ตัดสินแทน): `cancelReason` ของ "ทิ้งร่างนี้" (`DRAFT_DISCARD_REASON` — **A11 มีจุดเสียบค่าเดียวแล้ว §3.6**) · เพดานเวลา `supersedesOrderId` chain · index `ChatMessage(senderRole,createdAt)` → `safepay-database` · **AC-ACO-07/52 ยังไม่มี component รองรับเต็ม — ต้องปิดตอนตัด task จริง ไม่ใช่ปล่อยให้ QA ไปเจอเอง**

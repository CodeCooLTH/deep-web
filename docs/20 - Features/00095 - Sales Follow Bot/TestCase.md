---
title: "TestCase — 00095 บอทติดตามยอดขาย (Sales Follow Bot) P1"
owner: shinobu22
status: draft
module: 00095-SalesFollowBot
version: "0.1"
created: 2026-11-16
tags: [feature, test, 00095, chat, automation, follow-bot]
related: ["[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]", "[[REFERENCE-gochat-v3]]"]
---

> **โมดูล:** 00095 — Sales Follow Bot (P1)
> **ประเภทเอกสาร:** Test Case
> **เวอร์ชัน:** 0.1
> **วันที่จัดทำ:** 2026-11-16
> **สถานะ:** Draft — เขียนจาก BRD §0 + SRS (TFR-FB-01..23, OD-FB-1..7 ใช้ค่าตั้งต้น) + SDS + API ยังไม่มีโค้ด จึงยังไม่ได้รันสักเคส
> **เจ้าของเอกสาร:** QA (ดู [[Feature-Docs-Ownership]])

# Test Case: บอทติดตามยอดขาย (Sales Follow Bot) P1

---

## 1. Overview

ชุดทดสอบนี้ครอบ P1 ทั้งหมดตาม [[BRD]] (AC-FB-01..100 + AC-FB-48a) ผ่านข้อกำหนดเชิงเทคนิคใน [[SRS]] · ทุกเคส trace กลับ AC/BR ได้ในตาราง §3 · เคสที่ครอบจาก "บทเรียน/บั๊ก prod ของต้นแบบ gochat" ทั้ง 17 ข้อ (REFERENCE §8) อยู่ใน §2.10 (ต้องมีเคสกันซ้ำทุกข้อ)

- **เอกสารต้นทาง:** [[BRD]] §0 (Q-2 กรอบโฆษณา 7 วัน · Q-11 ทุกคนที่ตอบแชทได้ทำได้ทุกอย่าง ทับข้อความเดิม) · [[SRS]] · [[SDS]] · [[API]] · [[REFERENCE-gochat-v3]] §8
- **Scope:** ใน = P1 ทั้งหมด (ฟอร์มบอท · สถานะการขายคำนวณ · engine · ด่านก่อนส่ง · หยุดทุกเหตุ · ประวัติ · แผงในห้อง+ชิปหัวห้อง · capability · ร้านนำร่อง · จุดอ่านป้าย `AUTO_FOLLOW`/`FOLLOW_BOT_NOTE`) · นอก = P2 (AC-FB-91, 101..105) และ P3 (FR-FB-70) · ห้อง `channel='DEEP'` ไม่เข้าระบบ จึงมีเฉพาะเคสลบ
- **สภาพแวดล้อม:** dev DB localhost:5434 (ห้ามชี้ Supabase prod) · dev server user รันเองที่ port 4000 · โดเมน `http://seller.deepth.local:4000` (ห้าม localhost) · ข้อมูลเทสสร้างด้วย id ที่เทสตั้งเอง

### 1.1 ระดับเทส

| ระดับ | ความหมาย | ที่อยู่ไฟล์ (ข้อเสนอ) |
|---|---|---|
| **U** | unit — vitest `src/` ฟังก์ชัน pure ไม่ต้องมี DB (เวลารับเป็นพารามิเตอร์ `now`) | `src/lib/sales-follow-bot/__tests__/*.test.ts` |
| **I** | integration DB — vitest `tests/` + Postgres localhost:5434 | `tests/sales-follow-bot-*.test.ts` |
| **C** | component (jsdom) | `src/app/(paces)/.../__tests__` |
| **A** | API — เรียก route handler/HTTP ตรงด้วย session เทส | `tests/sales-follow-bot-api.test.ts` |
| **E** | E2E Playwright `e2e/sales-follow-bot.spec.ts` ที่ `seller.deepth.local:4000` (ใช้ `e2e/helpers/auth.ts` ฉีด NextAuth cookie · `cleanup(userId)` ใน `finally`) | `e2e/sales-follow-bot.spec.ts` |
| **R** | review/grep gate/สคริปต์ | — |
| **M** | mutation — แก้ซอร์ส 1 จุดแล้วต้องแดง (รายการเต็ม §2.9) | — |

### 1.2 ข้อห้ามของชุดเทส (HR13/HR14)

- 🛑 **ทุกคำสั่งเทส DB ต้องปักหมุด URL localhost:5434 ในคำสั่งตรง ๆ** เช่น `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/<db> npm test -- tests/sales-follow-bot` · เครื่อง dev `.env.local` ชี้ Supabase ที่ dev server ใช้ — ห้ามรัน `npm test`/`npm run e2e` เปล่า ๆ · พิสูจน์ URL ไม่ได้ = ถือว่าเป็น prod (prod ถูกล้างมาแล้ว 2026-07-31) · hook `prod-db-guard` จะกั้น
- 🛑 **ห้าม** `deleteMany()` เปล่า · TRUNCATE · DROP · `migrate reset` · `db pull` · `migrate dev` — cleanup ทุกจุด scope ด้วย id ที่เทสสร้างเอง (`shopId`/`conversationId`/`botId` ที่ seed) เรียงลูกก่อนแม่: Send → Run → TestRoom → BotChannel → Bot → ChatMessage → Conversation
- `engine.runSalesFollowTick(now, { shopIds: [seededShopId] })` — ใช้ `opts.shopIds` เสมอในเทส เพื่อไม่แตะห้องของร้านอื่นที่อยู่ในฐานเดียวกัน (TFR-FB-09)
- เวลาในเทส: ส่ง `now` เข้าฟังก์ชัน (ห้าม `vi.useFakeTimers` กับ DB) · ข้อความเทสสร้างด้วย `createdAt` ที่กำหนดเอง
- ตัวยิงจริง (Graph API/LINE) ต้องถูก mock ที่ขอบ `deliverRoom` เท่านั้น — ห้ามยิงจริงจากเทส · ห้ามเทสโดน `dispatch` ของข้อความจริงของร้านอื่น

### 1.3 ระเบียบ mutation ("เขียนแล้วแดงจริง")

เคสที่ติด `[M-xx]` ต้องพิสูจน์ด้วย mutation: แก้ซอร์ส 1 จุดตามตาราง §2.9 → รัน TC ที่ระบุ → **ต้องแดง** → คืนค่า · ถ้ายังเขียว = ชุด input อ่อน ให้แก้เทส (ไม่แก้ข้อกำหนด) ตาม convention `mutation-silence-means-weak-corpus` · ห้ามพิมพ์ marker `[blocker]` ในคอมเมนต์ซอร์ส · เทสที่ต้องแก้ไฟล์เดิมที่มี marker ต้องติดป้าย PR `แตะด่าน` (เช่น `src/lib/seller-menu.test.ts`)

### 1.4 ข้อมูลเทสมาตรฐาน (fixture)

| ชื่อ | ความหมาย |
|---|---|
| `shopP` | ร้านนำร่อง ONLINE_SALES อยู่ใน `SALES_FOLLOW_BOT_SHOP_IDS` |
| `shopX` | ร้าน ONLINE_SALES **ไม่อยู่ใน** รายชื่อนำร่อง |
| `shopO` | ร้านอีกร้านในรายชื่อนำร่อง (ไว้เทสข้ามร้าน) |
| `chM` / `chI` / `chL` | ShopChannel ACTIVE ของ `shopP` provider MESSENGER / INSTAGRAM / LINE |
| `roomM` / `roomI` / `roomL` | Conversation ของ `shopP` ผูก `chM`/`chI`/`chL` มี `ExternalContact` |
| `roomD` | Conversation `channel='DEEP'` ของ `shopP` (ไว้เทสลบ) |
| `bot1` | บอท ACTIVE · สถานะ [NOT_BOUGHT] · ช่อง `chM` · 3 ขั้น (30 นาที / 2 ชม. / 1 วัน) · ข้อความมี `{ชื่อ}` |
| `T0` | เวลาอ้างอิง คงที่ (เช่น 2026-11-20T03:00:00.000Z) ทุกเวลาในเคสคือ `T0 ± …` |

---

## 2. Test Scenarios

### 2.1 Unit — สถานะการขาย `deriveSalesStage` (TFR-FB-01)

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-001 | AC-FB-25 | U `[M-02]` | ห้องไม่มีออเดอร์ · ห้องมีแต่ `status='DRAFTED'` · ห้องมีแต่ `isDryRun=true` · ห้องมีออเดอร์ของห้องอื่น/ร้านอื่น/`conversationId=NULL` | ทุกกรณี `NOT_BOUGHT` |
| TC-002 | AC-FB-27 | U | `E.status='CANCELLED'` | `CANCELLED` |
| TC-003 | AC-FB-27, 28 | U | `E.status='RETURNED'` · `parcelClose='LOST_ON_RETURN'` · `deriveShippingStage(E)` ∈ {PROBLEM, RETURNED, DELIVERY_FAILED} | ทุกกรณี `PARCEL_PROBLEM` |
| TC-004 | AC-FB-27 | U | `E.status='CONFIRMED'` · stage `DONE` · stage `AWAITING_COD` · stage `NOT_SHIPPING` + `handedOverAt≠null` | ทุกกรณี `COMPLETED` |
| TC-005 | AC-FB-27 | U | stage `NOT_SHIPPING` + `handedOverAt=null` (นัดรับ/ดิจิทัลที่ยังไม่มอบ) แล้วแยกตามชำระ (ดู TC-006) | ไม่ใช่ `COMPLETED` |
| TC-006 | AC-FB-27 | U | stage `AWAITING_PARCEL` · `AWAITING_DISPATCH` · `AWAITING_PICKUP` · `NOT_SHIPPING`(ยังไม่มอบ) × {COD · `paymentConfirmedAt≠null` · `codReceivedAt≠null` · ไม่มีสัญญาณชำระ} | มีสัญญาณชำระอย่างใดอย่างหนึ่ง = `ORDER_CONFIRMED` · ไม่มีเลย = `BILLED` |
| TC-007 | AC-FB-27 | U | stage `SHIPPING` (iShip/Flash/ส่งเองกด "จัดส่งแล้ว") ทั้งชำระแล้ว/ยังไม่ชำระ | `SHIPPED` (ไม่ตกเป็น `ORDER_CONFIRMED`) |
| TC-008 | AC-FB-27 | U | `E.status` นอกชุด {PENDING, SHIPPED, CONFIRMED, CANCELLED, RETURNED} (เช่น ค่าใหม่ที่ยังไม่รู้จัก) | คืน `null` · ไม่ใช่ `NOT_BOUGHT` · ผู้เรียก `console.warn` ครั้งเดียวต่อ (orderId,status) |
| TC-009 | AC-FB-27 | U `[M-01]` | **ตารางครบทุกค่า `ShippingStageKey` (11 ค่า: DRAFT, AWAITING_PARCEL, AWAITING_DISPATCH, AWAITING_PICKUP, SHIPPING, AWAITING_COD, PROBLEM, RETURNED, DONE, NOT_SHIPPING, DELIVERY_FAILED) × ทุก `Order.status`** ทำเป็น `Record<ShippingStageKey, …>` | ทุกช่องมีผลตายตัว ไม่ throw · เพิ่มค่า stage ใหม่ใน `order-stage.ts` แล้วตารางไม่ครอบ = tsc/เทสแดง · ค่า `DRAFT` ผลต้องกำหนดชัด (ดู §7 Q-1) |
| TC-010 | AC-FB-27 | U `[M-01]` | ลำดับกฎ: `CANCELLED` + พัสดุมีปัญหา · `RETURNED` + stage `DONE` · `CONFIRMED` + stage `PROBLEM` · `CONFIRMED` + `SHIPPING` | `CANCELLED` · `PARCEL_PROBLEM` · `PARCEL_PROBLEM` · `COMPLETED` — M-01 สลับกฎ 2/3/4 → แดง |
| TC-011 | AC-FB-26 | U | หลายออเดอร์ในห้อง: ใบเก่า COMPLETED + ใบใหม่ BILLED · `createdAt` เท่ากันตัดสินที่ `id DESC` | ยึดใบล่าสุด = `BILLED` (ออเดอร์ใหม่เปลี่ยนสถานะห้องทันที ไม่ผ่านกติกาจบรอบ) · ผลเดียวกันทุกครั้งที่รัน |
| TC-012 | AC-FB-26 | U | ใบล่าสุด `CANCELLED` ส่วนใบก่อนหน้า COMPLETED | `CANCELLED` (SRS ปักให้ E รวมใบที่ยกเลิก — ดู §7 Q-2 ว่า BRD AC-FB-26 ใช้คำว่า "ที่นับได้ล่าสุด") |
| TC-013 | AC-FB-28 | U | parity กับ `countsAsCustomerOrder` (`customer-behavior.ts:112-116`): ชุดออเดอร์ผสมเดียวกัน (CANCELLED, RETURNED, NO_SHOW, DRAFTED, PENDING, CONFIRMED) | ออเดอร์ที่ `countsAsCustomerOrder=false` เพราะยกเลิก/ตีกลับ ไม่เคยให้สถานะ "ซื้อแล้วสำเร็จ" · ผลสอดคล้องกันทุกแถว |
| TC-014 | AC-FB-25 | U | OD-FB-1: ใบ COD เปิดบิลวันนี้ ยังไม่ส่ง | `ORDER_CONFIRMED` (ไม่ใช่ `BILLED`) · มี `slipFileId` แต่ไม่มีสัญญาณชำระอื่น = ยัง `BILLED` (สลิปไม่นับ) |

### 2.2 Unit — ตราประทับ + จบรอบ (TFR-FB-02)

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-020 | AC-FB-33 | U | stamp ต่อสถานะ: BILLED=`ORDER_CREATED.occurredAt` (ไม่มี event → `E.createdAt`) · ORDER_CONFIRMED(โอน/เงินสด)=`paymentConfirmedAt` · ORDER_CONFIRMED(COD)=เหมือน BILLED · SHIPPED=max(MANUAL_DISPATCHED, SHIPMENT_CREATED, SHIPMENT_LINKED, TRACKING_ADDED) · COMPLETED=min(deliveredAt, SELLER_DELIVERED, BUYER_CONFIRMED, SYSTEM_CONFIRMED, COD_SETTLED, HANDED_OVER ที่มีค่า) · PARCEL_PROBLEM=min(problemAt, RETURN_RECEIVED, PARCEL_PROBLEM_CLOSED) · CANCELLED=`ORDER_CANCELLED.occurredAt` | ตรงตาราง · ใช้ `occurredAt` ไม่ใช่เวลาบันทึก/เวลาประมวลผล |
| TC-021 | AC-FB-33 | U `[M-04]` | ผู้สมัคร stamp มีค่า `> now` (อนาคต) ปนกับค่าปกติ · ผู้สมัครมีแต่ค่าอนาคต · ไม่มีผู้สมัครเลย | ค่าอนาคตถูกตัดทิ้ง · มีแต่อนาคต/ไม่มีเลย = `stamp=null` → **รอบไม่จบเอง** + นับ anomaly ใน log |
| TC-022 | AC-FB-30, 32 | U `[M-03]` | COMPLETED stamp=S: ลูกค้าทัก `S+7d` พอดี · `S+7d+1ms` · `S+6d23h` | พอดี = ยัง `COMPLETED` · `+1ms` = รอบใหม่ `NOT_BOUGHT` · ก่อนครบ = `COMPLETED` (เกินจริง `>` ไม่ใช่ `>=`) |
| TC-023 | AC-FB-31 | U | SHIPPED ทักที่ `S+14d` / `S+14d+1ms` · CANCELLED ทักที่ `S+1ms` · BILLED / ORDER_CONFIRMED / PARCEL_PROBLEM ทักที่ `S+365d` | `SHIPPED` / รอบใหม่ · CANCELLED = รอบใหม่ทันที · สามสถานะหลังไม่จบรอบเอง ไม่ว่าจะกี่วัน |
| TC-024 | AC-FB-33 | U | stamp NOT_BOUGHT: ไม่มี E → `createdAt` ของ RealBuyerMsg แรกของห้อง · มี E ที่จบรอบ → RealBuyerMsg แรก `> stamp+HOLD` · ไม่มี RealBuyerMsg เลย | ตามนั้น · กรณีสุดท้าย `NOT_BOUGHT` + `stamp=null` แนบไม่ได้ |
| TC-025 | AC-FB-33, 38 | U | reaction / คลิกโฆษณา / Messenger postback / LINE `pb:` / ข้อความถูกลบ ไม่เปิดรอบใหม่ | ไม่เป็น RealBuyerMsg → stamp ไม่เปลี่ยน |
| TC-026 | AC-FB-32 | U | parity ตัวเปรียบเทียบ: ค่าเกณฑ์ HOLD (7/14/0 วัน) ใน `constants.ts` ที่เดียว · เทสเทียบค่าที่ใช้ใน TS กับค่าที่ใช้ใน SQL candidate query | ตัวเลขเท่ากัน · ไม่มีสำเนาตัวเลขที่สอง |
| TC-027 | AC-FB-30, 31 | U | ออเดอร์ใหม่ในรอบเดียวกับสถานะที่จบรอบ: COMPLETED เมื่อ 3 วันก่อน + สร้างออเดอร์ใหม่วันนี้ | สถานะห้องย้ายตามออเดอร์ใหม่ทันที โดยไม่ผ่านกติกา HOLD |

### 2.3 Unit — นิยามข้อความ `message-defs` (TFR-FB-03)

เทสด้วย corpus เดียวกันทั้งรูป Prisma where (ผ่าน I-level) และ predicate/SQL string · ที่นี่ระบุ corpus

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-030 | AC-FB-67, 46 | U/I `[M-05]` `[M-08]` | **RealBuyerMsg corpus:** BUYER ข้อความปกติ · BUYER `isDeleted=true` · BUYER type ∈ `INTERNAL_MESSAGE_TYPES` · BUYER `externalMessageId='pb:evt123'` (LINE postback) · BUYER `externalMessageId=NULL` · BUYER `externalMessageId='mid.xyz'` · SHOP ข้อความ | นับ: ปกติ · `NULL` · `mid.xyz` · ไม่นับ: ลบ · internal · `pb:%` · SHOP |
| TC-031 | AC-FB-45, 46, 52 | U/I `[M-06]` `[M-07]` `[M-08]` | **CountedShopReply corpus:** SHOP ปกติ (มี senderUserId) · echo Business Suite/Meta AI (`autoReplyKind` null ไม่มี senderUserId) · `AUTO` · `AUTO_TEST` · `AUTO_NOTICE` · `AUTO_FOLLOW` · `deliveryStatus='FAILED'` · `QUEUED` · `SENT` · type internal (การ์ด 00061 · `FOLLOW_BOT_NOTE` · `META_NOTICE`) · `isDeleted=true` | นับ: ปกติ · echo · AUTO · AUTO_TEST · AUTO_NOTICE · QUEUED · SENT · ไม่นับ: AUTO_FOLLOW · FAILED · internal ทั้ง 3 · ลบ |
| TC-032 | AC-FB-32, NFR-FB-06 | I | parity: ทุกแถวใน corpus TC-030/031 ผ่านทั้ง `Prisma.ChatMessageWhereInput` และฉบับ SQL แล้วได้ชุดผลเดียวกัน | เท่ากันทุกแถว (HR16 นิยามเดียว) |
| TC-033 | AC-FB-47 | U/I `[M-09]` | ขอบ 30 วัน: ข้อความที่ `now-30d+1s` นับ · `now-30d-1s` ไม่นับ · static: ทุก query ใน `sales-follow-*` ที่อ่าน `ChatMessage` มี `createdAt: { gte … }` | นับ/ไม่นับตามขอบ · static scan ไม่พบ query ไม่มีขอบเวลา |
| TC-034 | AC-FB-44 | I | ข้อความจริงล่าสุด (เรียง `createdAt DESC, seq DESC`) ของ RealBuyerMsg ∪ CountedShopReply · สองข้อความ `createdAt` เท่ากัน ต่าง `seq` | ตัดสินที่ `seq` · ล่าสุดเป็น BUYER = ร้านค้างตอบ |
| TC-035 | AC-FB-67 | I | "ลูกค้าตอบ (หลังฟองบอท)": มี RealBuyerMsg `(createdAt,seq) >` ฟองบอทล่าสุดที่ SENT · ก่อนบอทส่งขั้นแรก (ไม่มีฟอง SENT) | หลังฟอง = ตอบ · ก่อนขั้นแรก = ไม่ใช่เหตุหยุด (BR-FB-42) |
| TC-036 | AC-FB-67 | I `[M-36]` | ห้อง seed `lastInboundAt` ใหม่กว่าฟองบอท **แต่ไม่มี ChatMessage ของลูกค้าใหม่** (เลียนแบบ reaction/คลิกโฆษณา) · static scan ห้ามใช้ `lastInboundAt` ตัดสินลูกค้าตอบ | run ไม่หยุด `CUSTOMER_REPLIED` · M-36 เปลี่ยนไปใช้ `lastInboundAt` → แดง |
| TC-037 | AC-FB-76 | U | `INTERNAL_MESSAGE_TYPES` มี `FOLLOW_BOT_NOTE` เป็นสมาชิกที่สาม (พร้อม `AUTO_ORDER_RESULT_TYPE`, `META_NOTICE_TYPE`) | มีครบ 3 |

### 2.4 Unit — `decideRun` (TFR-FB-11, 12) ตามลำดับ BR-FB-40

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-040 | AC-FB-64..72 | U | ตารางลำดับ 1..16 อย่างละ 1 เคสบริสุทธิ์ (มีเงื่อนไขนั้นข้อเดียว): stage ต่างจาก `run.stageKey` · stamp ต่าง · stage ∉ รายการของบอท · แท็กไม่ผ่าน ANY · แท็กไม่ผ่าน ALL · ไม่เหลือเงื่อนไข · `status=CLOSED` · `structureRev` ไม่ตรง · ลูกค้าตอบ · `nextStep>=steps.length` · `window.open=false` · `dueAt>=expiresAt` · `NOT_INTERESTED` · ช่องไม่อยู่ในบอท · `isSpam` · `isHidden` · TESTING+ห้องไม่อยู่ใน test rooms · LINE `isBlocked` · `sendAllowed=false` · Meta AI ถือ · `autoReplyEnabled=false` · channel ไม่ ACTIVE · ร้านค้างตอบ · `dueAt>now` · เหลือ | STOP `STAGE_CHANGED` ×3 · STOP `TAG_REMOVED` ×3 · STOP `BOT_DISABLED` · STOP `BOT_EDITED` · STOP `CUSTOMER_REPLIED` · DONE · STOP `WINDOW_CLOSED` ×2 · STOP `NOT_INTERESTED` · STOP `OUT_OF_SCOPE` ×4 · STOP `CONTACT_BLOCKED` · HOLD `SHOP_NOT_ENABLED` · HOLD `META_AI_HOLDING` · HOLD `AUTO_REPLY_OFF` · HOLD `CHANNEL_NOT_ACTIVE` · WAIT null · WAIT dueAt · SEND `run.nextStep` |
| TC-041 | BR-FB-40, AC-FB-64..72 | U `[M-10]` | **ลำดับชนกัน** ทีละคู่ให้เงื่อนไขจริงพร้อมกัน: (stage เปลี่ยน + แท็กหลุด) · (แท็กหลุด + บอทปิด) · (บอทปิด + ลูกค้าตอบ) · (ลูกค้าตอบ + ครบขั้น) · (ครบขั้น + เลยกรอบ) · (เลยกรอบ + ไม่สนใจ) · (ไม่สนใจ + ห้องนอกขอบเขต) · (นอกขอบเขต + ถูกบล็อก) · (ลูกค้าตอบ + Meta AI ถือ) · (Meta AI ถือ + ปิดตอบอัตโนมัติ) · (HOLD + ร้านค้างตอบ) | ผลเป็นเหตุของ **ลำดับแรก** เสมอ · STOP ชนะ HOLD · HOLD ชนะ WAIT · M-10 สลับ 2 ลำดับใดก็ได้ → แดงอย่างน้อย 1 เคส |
| TC-042 | AC-FB-27 | U | `deriveSalesStage` คืน `null` ระหว่าง run | ข้ามข้อ 1 (ไม่ STOP `STAGE_CHANGED`) · ไม่ย้ายสถานะ · ไม่เดาเป็น NOT_BOUGHT |
| TC-043 | AC-FB-54, 56 | U | HOLD ซ้อน: ร้านไม่อยู่นำร่อง + Meta AI + autoReplyEnabled=false + channel หลุด ·`autoReplyEnabled` = `null` / `true` / `false` · `AutoReplyConfig.isEnabled=false` แต่ `autoReplyEnabled` ไม่ใช่ false | เหตุเรียง SHOP_NOT_ENABLED › META_AI_HOLDING › AUTO_REPLY_OFF › CHANNEL_NOT_ACTIVE · พักเฉพาะ `=== false` ตรง ๆ |
| TC-044 | AC-FB-52, BRD §8.4 | U | ห้องที่ `handoffAt≠null` / `autoReplyPausedUntil` ในอนาคต (คนรับช่วง) | **ไม่ STOP ไม่ HOLD** — ส่งต่อตามปกติ (คนรับช่วง = ร้านตอบที่นับ ไม่ใช่เหตุหยุดบอท) |
| TC-045 | NFR-FB-06 | U/R | `decide.ts` ไม่ import `prisma`/ไม่เรียก `Date.now()`/`new Date()` ไม่มีพารามิเตอร์ · ฟังก์ชันเดียวกันถูกเรียกทั้งตอนประเมินและตอนตรวจซ้ำก่อนยิง | static guard ผ่าน · ผลเหมือนกันเมื่อให้ facts+now เดียวกัน (deterministic) |
| TC-046 | AC-FB-48, 69 | U `[M-11]` | `dueAt` เทียบ `window.expiresAt`: `dueAt = expiresAt − 1ms` · `= expiresAt` · `= expiresAt + 1ms` | ก่อนขอบ = WAIT/SEND · ที่ขอบและหลังขอบ = STOP `WINDOW_CLOSED` (`>=`) |
| TC-047 | AC-FB-69 | U | ห้องไม่มี `lastInboundAt` | STOP `WINDOW_CLOSED` (ไม่ throw ไม่ WAIT ค้าง) |
| TC-048 | AC-FB-44 | U `[M-12]` | ร้านค้างตอบ (ข้อความจริงล่าสุดเป็นของลูกค้า) แม้ `dueAt` ผ่านไปนานแล้ว · แล้วแอดมินตอบ | ค้างตอบ = WAIT `dueAt=null` (ไม่หยุด ไม่ส่ง) · แอดมินตอบแล้ว = คำนวณ dueAt ใหม่จากเวลาที่ตอบ |
| TC-049 | AC-FB-42, 43 | U `[M-13]` | `dueAt = max(ร้านตอบล่าสุด, run.lastSentAt) + delayMin·60000`: ขั้นแรก (ไม่มี lastSentAt) · ขั้นสอง (lastSentAt ใหม่กว่า) · ร้านตอบใหม่ระหว่างรอ (ใหม่กว่า lastSentAt) · ไม่พบร้านตอบใน 30 วัน · ไม่พบทั้งร้านตอบและ `lastInboundAt` | ตามสูตร · ร้านตอบใหม่เลื่อน dueAt ไปข้างหน้า · ค่าสำรอง `lastInboundAt` · ไม่มีเลย = STOP `WINDOW_CLOSED` |
| TC-050 | AC-FB-68 | U | `nextStep` = 2 จาก 3 ขั้น · `nextStep` = 3 จาก 3 ขั้น | ขั้นที่ 3 = SEND step 2 · `nextStep>=3` = DONE `COMPLETED` |
| TC-051 | AC-FB-61 | U | `lastSentAt` ใช้เวลา `ChatMessage.createdAt` ของฟองจริง ไม่ใช่เวลาจองคิว (`SalesFollowSend.createdAt`) | `dueAt` คิดจากเวลาฟองจริง |

### 2.5 Unit — กรอบส่ง `getWindowState` + anchor โฆษณา (TFR-FB-13, BR-FB-23, BRD §0.1)

ใช้ตัวช่วยเดิมเท่านั้น (`getWindowState`, `getAdWindowStartAtMany`) — ห้ามคัดลอกตัวคำนวณกรอบ · ค่าคงที่จริง: `MESSAGING_WINDOW_MS`=24 ชม. · `AD_WINDOW_MS`=7 วัน−1 ชม. (167 ชม.) · เปิดเมื่อ `msRemaining>0` (ที่ขอบพอดี = ปิด)

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-055 | AC-FB-48, 69 | U | ห้อง Messenger ไม่มี anchor: `lastInboundAt = T0-23h59m` · `T0-24h` · `T0-24h-1s` | เปิด · ปิด (ขอบพอดี) · ปิด |
| TC-056 | AC-FB-48, BRD §0 Q-2 | U | ห้อง Messenger มี anchor (`adWindowStartAt`): `lastInboundAt = anchor` แล้วเลื่อน `now` ไป anchor+26h · anchor+47h · anchor+166h59m · anchor+167h · anchor+7d | เปิด · เปิด · เปิด · ปิด (หัก 1 ชม. เผื่อคิว) · ปิด · `viaAd=true` เมื่อเปิดเพราะกรอบโฆษณา |
| TC-057 | AC-FB-48 | U | ห้อง Instagram (ใช้กรอบโฆษณาเหมือน Messenger) | ผลเหมือน TC-056 |
| TC-058 | AC-FB-48, BR-FB-23 ก | I | ห้อง LINE ที่มี `ConversationAdReferral` ค้างอยู่ (ข้อมูลผิดช่องก็ตาม) → `getAdWindowStartAtMany` | ข้ามห้อง LINE ไม่ query · ได้ `null` → กรอบ 24 ชม. จาก `lastInboundAt` เท่านั้น |
| TC-059 | AC-FB-48 | I | **anchor จาก DB:** referral `source=ADS` + ข้อความลูกค้าตามมาใน [receivedAt−2 นาที, +24 ชม.] = anchor เป็นเวลาข้อความนั้น · referral ที่ไม่มีข้อความลูกค้าตามมา (echo ของเพจ) = ข้าม · หลาย referral ใช้ตัวล่าสุดที่มีข้อความ · referral เก่ากว่า 8 วัน = ไม่นับ · `source≠ADS` ไม่นับ · ข้อความ `isDeleted=true` ไม่เป็น anchor · ห้อง non-Meta ไม่ query | ตรงตามเงื่อนไข · เขียนด้วย id ห้องที่เทสสร้าง |
| TC-060 | AC-FB-36, 48 | U | คลิกโฆษณาใหม่ + ลูกค้าส่งข้อความแรกหลังคลิก (anchor ขยับ) หลังกรอบเก่าหมดแล้ว | anchor เป็นข้อความใหม่ → กรอบเปิด 167 ชม. ใหม่ |
| TC-061 | AC-FB-58 | R/U `[M-23]` | สแกนไฟล์ `src/lib/sales-follow-bot/**` และ `src/services/sales-follow-*.service.ts` หา `humanAgent` · `HUMAN_AGENT` · `HUMAN_AGENT_WINDOW_MS` · `tag:` | 0 ผลลัพธ์ · M-23 เพิ่มการอ้างถึง → แดง · จำลอง payload ที่ `enqueueOutbound` ได้รับ ต้องไม่มี `humanAgent`/`tag` |

### 2.6 Unit — ด่านร้านนำร่อง, schema, validateSteps, conflicts, attach, mapFollowFailure

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-065 | AC-FB-96, 98 | U `[M-24]` | `isSalesFollowBotEnabled(shopId)`: env ไม่ตั้ง · ว่าง · `"  "` · `"a,b"` ตรง/ไม่ตรง · มีช่องว่าง/ตัวพิมพ์ต่าง · `"*"` | ไม่ตั้ง/ว่าง = false ทุกร้าน (fail-closed) · ตรงรายการ = true · `*` = true ทุกร้าน (ค่าเดียวที่เปิดทั้งหมด) |
| TC-066 | AC-FB-98 | U | อ่าน `process.env` ทุกครั้งที่เรียก ไม่ cache ระดับ module: เปลี่ยน env กลางเทสแล้วเรียกซ้ำ | ผลเปลี่ยนตาม env ทันที |
| TC-067 | AC-FB-98 | R | ไม่มีรายชื่อ shopId ฝังในโค้ด · grep id ร้านจริง/อาร์เรย์ shopId literal ใน `src/lib/sales-follow-bot/**` | 0 ผลลัพธ์ |
| TC-070 | AC-FB-01 | U | schema ชื่อ: ว่าง · ช่องว่างล้วน · 60 ตัว · 61 ตัว · อักษรไทยมีสระซ้อน (นับ code point) | `NAME_REQUIRED` · `NAME_REQUIRED` · ผ่าน · `NAME_TOO_LONG` · นับตาม code point |
| TC-071 | AC-FB-02 | U | `salesStatuses=[]` + `tags=[]` · มีสถานะอย่างเดียว · มีแท็กอย่างเดียว | `NO_CONDITION` · ผ่าน · ผ่าน |
| TC-072 | AC-FB-01 | U | ขั้น 0 · 1 · 10 · 11 ขั้น · `tags` 20 / 21 · `channelIds` 0 / 1 / 50 / 51 | `STEPS_COUNT` · ผ่าน · ผ่าน · `STEPS_COUNT` · ผ่าน / `TOO_MANY_TAGS` · `VALIDATION_ERROR`(ขั้นต่ำ 1) / ผ่าน / ผ่าน / `TOO_MANY_CHANNELS` |
| TC-073 | AC-FB-10 | U | ข้อความขั้น: ว่าง · ช่องว่างล้วน · 1,000 ตัว · 1,001 ตัว · `TEXT_IMAGE` ไม่มี `imageFileId` · `TEXT` มี `imageFileId` · `kind` นอก {TEXT, TEXT_IMAGE} (เช่น การ์ดสินค้า P2) | `STEP_TEXT_REQUIRED` ×2 · ผ่าน · `STEP_TEXT_TOO_LONG` · `STEP_IMAGE_REQUIRED` · ผ่านหรือไม่สนใจรูป (ตามที่ schema ระบุ ต้องไม่ error ผิดชนิด) · ปฏิเสธชนิดที่ P1 ไม่รองรับ |
| TC-074 | AC-FB-11 | U | ตัวแปร: `{ชื่อ}` ผ่าน · `{สินค้า}` · `{ราคา}` · `{ชื่อลูกค้า}` · `{}` · `{ ชื่อ }` | ผ่าน · `UNKNOWN_VARIABLE` พร้อมชื่อ ×3 · กรณีวงเล็บผิดรูปมีผลตายตัว (ไม่ crash) |
| TC-075 | AC-FB-13 | U | แทน `{ชื่อ}`: มีชื่อ "สมชาย" · ไม่มีชื่อ/ว่าง/ช่องว่างล้วน · ตัวแปรอยู่ต้น/กลาง/ท้ายประโยค · "สวัสดีคุณ{ชื่อ} ค่ะ" · ไม่ใช้ `customerDisplayName` ของ 00078 (ไม่แทนด้วย "ลูกค้า") | ไม่มีชื่อ = ตัดตัวแปรพร้อมช่องว่างซ้อน ไม่เหลือ "  " ไม่ขึ้นต้น/ลงท้ายด้วยช่องว่างเกิน · ข้อความไม่ห้วน · ว่างทั้งข้อความ = ผลสำหรับ `EMPTY_MESSAGE` (TC-109) |
| TC-076 | AC-FB-15 | U | `delayMin`: 0 · 1 · -5 · 1.5 · "30" | `STEP_DELAY_MIN` · ผ่าน · `STEP_DELAY_MIN` · `STEP_DELAY_MIN` · ปฏิเสธชนิดผิด |
| TC-077 | AC-FB-16 | U | Σ`delayMin`: 10,020 พอดี · 10,021 · ขั้นที่ทำให้เกินคือขั้นที่เท่าไร | ผ่าน · `STEPS_TOTAL_TOO_LONG` พร้อม `stepIndex` ที่ถูก (ข้อความ "ขั้นที่ x เกินกรอบ 7 วันของช่องทาง") |
| TC-078 | AC-FB-16 | U | ธง `adOnly` คำนวณ: ผลรวมสะสม 1,380 นาทีพอดี · 1,381 · ขั้นเดียวยาว 2,000 นาที · ไม่ส่ง `adOnly` จาก client | 1,380 = `false` · 1,381 = `true` · ขั้นหลังของ 1,381 ทุกขั้น = `true` · client ส่งมาแล้วเซิร์ฟเวอร์เมิน ใช้ค่าที่คำนวณเอง |
| TC-079 | AC-FB-15 | U | แปลงหน่วย นาที/ชั่วโมง/วัน ↔ `delayMin` (เช่น 2 ชม.=120 · 1 วัน=1,440 · 6 วัน 23 ชม.=10,020) | ตรงทั้งสองทิศ ไม่ปัดเศษผิด |
| TC-080 | AC-FB-17 | U | เงื่อนไขล็อก "เพิ่มขั้น": ครบ 10 ขั้น · เวลาสะสมเต็ม (Σ=10,020 ไม่ว่ากี่ขั้น) · ยังเพิ่มได้ | ล็อกพร้อม **เหตุผลเป็นข้อความ** แยก 2 แบบ · ไม่ล็อก = null |
| TC-081 | AC-FB-18 | U | ป้ายขั้น: ขั้นแรก · ขั้นที่ 2..N | "รอ … หลังแอดมินตอบล่าสุด" · "ถ้ายังไม่ตอบ รอต่ออีก …" |
| TC-082 | AC-FB-14 | U/C | ตัวอย่างในแชท (preview) ใช้ฟังก์ชันตัวแปร/รวมข้อความตัวเดียวกับตัวส่ง: ขั้น `TEXT_IMAGE` | ลำดับ "ข้อความก่อน แล้วรูป" ตรงกับที่ตัวส่งสร้างจริง · ตัวแปรแทนเหมือนกัน |
| TC-085 | AC-FB-19 | U | `findChannelConflicts(candidate, others)`: ช่องเดียวกัน + สถานะซ้อน · ช่องเดียวกัน + สถานะไม่ซ้อน · ช่องต่างกัน · ฝ่ายหนึ่งสถานะว่าง (ทุกสถานะ) · ทั้งคู่ว่าง | ชน · ไม่ชน · ไม่ชน · ชน · ชน (บอกทุก `{channelId, botId, botName}` ที่ชน) |
| TC-086 | AC-FB-19 | U `[M-26]` | `others` มีบอท `CLOSED` · บอท `deletedAt≠null` · บอท TESTING · บอท ACTIVE | CLOSED/ลบ = ไม่ชน · TESTING/ACTIVE = ชน · M-26 ถอด "ฝ่ายใดว่าง = ซ้อน" → แดง |
| TC-087 | AC-FB-22 | U | บอทอื่นที่ไม่เหลือเงื่อนไข (แท็กหายหมด ไม่มีสถานะ) | ไม่นับเป็นบอทที่ชน |
| TC-088 | AC-FB-20 | C | หน้าเลือกช่องทางใช้ `findChannelConflicts` ฝั่ง client จาก `GET bots`: ช่องที่ชนเป็นล็อก + ข้อความ "อยู่ในบอท <ชื่อ>" | ล็อกจริง (`aria-disabled`/disabled) พร้อมข้อความ ไม่ใช่แค่จาง · ผลเท่ากับตัวฝั่งเซิร์ฟเวอร์ (ฟังก์ชันเดียว) |
| TC-095 | AC-FB-36, BR-FB-06 | U | `eligibleToAttach` ต่อข้อ (เปลี่ยนทีละอย่างจากห้องที่ผ่านหมด): ไม่มี RealBuyerMsg ในช่วง `delay1` · กรอบส่งปิด · `NOT_INTERESTED` · LINE `isBlocked` · stage=null · stage ไม่อยู่ในบอท · แท็กไม่ตรง · stamp=null · `externalContactId=null` | ไม่แนบทุกข้อ · ห้องที่ผ่านหมด = แนบ |
| TC-096 | AC-FB-36, 09 | U `[M-29]` | กรอบส่ง: ห้อง Messenger ลูกค้าทักล่าสุด 30 ชม. ก่อน (นอก 24 ชม. แต่มี anchor โฆษณาใน 167 ชม.) · ไม่มี anchor | แนบได้ (ใช้ "กรอบส่งเปิด" ไม่ใช่ "24 ชม.") · ไม่แนบ — M-29 ถอดด่านกรอบ → แดง |
| TC-097 | AC-FB-09 | U | บอทเพิ่งเปิดใช้ ห้องที่ RealBuyerMsg ล่าสุดเก่ากว่า `delay1` | ไม่แนบ (ไม่ทักห้องเก่าทั้งร้าน) · ห้องที่ข้อความเข้าใน `delay1` = แนบ |
| TC-098 | AC-FB-39 | U `[M-28]` | บอทไม่เลือกสถานะ: run ล่าสุด `finishedAt=F` · RealBuyerMsg ล่าสุด `<F` / `>F` | `<F` ไม่แนบ · `>F` แนบ — M-28 ถอดด่านนี้ → แดง |
| TC-099 | AC-FB-65, BR-FB-51 | U | แท็ก: ANY ตรงอย่างน้อย 1 · ALL ครบ · ALL ขาด 1 · แท็กหายจาก `ShopTag` (key ไม่มี) แยก ANY/ALL · เทียบด้วย `tagNameKey` ตัวเดียวกับ UI (ตัวพิมพ์/วรรณยุกต์/ช่องว่างต่าง) | ANY ที่แท็กหาย = แนบต่อด้วยแท็กที่เหลือ · **ALL ที่แท็กหาย = ไม่แนบ (OD-FB-7)** · ใช้ `ExternalContact.tags` ปัจจุบัน |
| TC-100 | AC-FB-22, 36 | U | บอทไม่มีทั้งสถานะและแท็กที่ใช้ได้ | ไม่แนบ (A-7) |
| TC-105 | AC-FB-55, 61, 62 | U | `mapFollowFailure(failureReason)`: `WINDOW_CLOSED` · "another app is controlling" · `QUOTA_EXCEEDED` · `UNCERTAIN_SEND_REASON` · รหัสอื่น/ว่าง/ตัวพิมพ์ต่าง | SKIPPED `META_WINDOW_REJECTED`+STOP `WINDOW_CLOSED` · SKIPPED `OTHER_APP_CONTROLS` · SKIPPED `LINE_QUOTA_FULL` · FAILED `UNCERTAIN_SEND` · FAILED `PLATFORM_REJECTED` · ทุกกรณีเดินขั้นต่อ ไม่ลองซ้ำ |
| TC-106 | NFR-FB-06 | U | เทสไล่ registry ของ error class ใน `sales-follow-bot.service.ts` เทียบ switch ใน `route-errors.ts` | เพิ่ม Error class ใหม่แต่ไม่มี branch = แดง |
| TC-107 | NFR-FB-06 | U | ค่าใน `constants.ts` (ขั้น ≤10, ข้อความ ≤1000, ชื่อ ≤60, ห้องทดสอบ ≤20, ช่อง ≤50, แท็ก ≤20, Σ ≤10,020, adOnly >1,380, HOLD 7/14/0) ตรงกับ `options.limits` ใน API | ค่าเดียวกันทุกที่ |
| TC-108 | AC-FB-60 | U | ตารางข้อความไทยของ `reason`/`stopReason`/`holdReason` ครบทุกรหัสใน CHECK (11 stop + 4 hold + 7 send reason) ไม่ใช้รหัสดิบ | ไม่มีรหัสที่ไม่มีข้อความไทย · ไม่มีรหัสนอก CHECK |
| TC-109 | AC-FB-13 | U | ข้อความว่างหลังแทนตัวแปร (เช่น ข้อความมีแต่ `{ชื่อ}` แล้วลูกค้าไม่มีชื่อ) | ผลบอก `EMPTY_MESSAGE` → ขั้น SKIPPED ไม่ส่งฟองว่าง |

### 2.7 Integration DB (I) — ต้องใช้ Postgres localhost:5434

🛑 ทุกเคสในหมวดนี้: ปักหมุด `DATABASE_URL=postgresql://…@localhost:5434/…` ในคำสั่ง · seed ด้วย id ที่เทสสร้าง · cleanup ใน `afterAll`/`finally` ด้วย id เหล่านั้นเท่านั้น (HR13/14) · `runSalesFollowTick(now, { shopIds })` เสมอ

#### 2.7.1 Constraint, unique, ON CONFLICT, CHECK

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-120 | NFR-FB-06, BR-FB-81 | I `[M-32]` | `sales-follow-bot-db-constraint.test.ts`: ค่าใน `constants.ts` เทียบกับ CHECK ในไฟล์ migration (`20261117100000_00095_sales_follow_bot`) — status/stageKey/stopReason/holdReason/reason/จำนวนขั้น | ทุกค่าอยู่ใน CHECK · M-32 ลบค่าหนึ่งจาก migration → แดง |
| TC-121 | BR-FB-81 (บทเรียน #4) | I | CHECK เพดานขั้นสอดคล้องกันทั้ง 3 ตาราง: `SalesFollowBot.steps` 1..10 · `SalesFollowRun.nextStep` 0..10 · `SalesFollowSend.step` 0..9 · INSERT Send ขั้นที่ 10 (step=9) ผ่าน · step=10 ถูกปฏิเสธ | สอดคล้อง · ไม่มีกรณีที่บอท 10 ขั้นแล้ว INSERT Send ขั้นปลายล้ม |
| TC-122 | AC-FB-37 | I `[M-17]` | INSERT run ACTIVE 2 แถวของห้องเดียวกัน (ต่างบอท) ด้วย `INSERT … ON CONFLICT DO NOTHING` | แถวที่สองไม่ถูกสร้าง (rowCount=0) · ไม่มี error ใน log Postgres (ไม่ใช้ create+catch P2002) · M-17 ถอด partial unique → แดง |
| TC-123 | AC-FB-38 | I `[M-18]` | (botId, conversationId, stageStamp) เดียวกัน: run แรก STOPPED `CUSTOMER_REPLIED` แล้วตัวแนบลองแนบซ้ำ · stamp ใหม่ = แนบได้ | ซ้ำ = ไม่แนบ · stamp ใหม่ = แนบ · M-18 ถอด unique → แดง |
| TC-124 | NFR-FB-03 | I | แถว Send: `(status IN ('FAILED','SKIPPED')) = (reason IS NOT NULL)` · `(status='SENDING') = (settledAt IS NULL)` · reason นอกรายการ | INSERT ผิดรูปถูกปฏิเสธโดย CHECK |
| TC-125 | AC-FB-49 | I `[M-16]` | **แข่งกัน 2 tick:** seed run ถึงกำหนดขั้นหนึ่ง แล้วเรียก `runSalesFollowTick` 2 ครั้งพร้อมกัน (`Promise.all`) | มีแถว `SalesFollowSend (runId, step)` 1 แถว · `ChatMessage` AUTO_FOLLOW **1 ฟอง** · ตัวยิงถูกเรียก 1 ครั้ง · M-16 ถอด unique/ON CONFLICT → แดง |
| TC-126 | AC-FB-37 | I | **แข่งกัน 2 ตัวแนบ:** ห้องเดียวเข้าเงื่อนไขบอท 2 ตัว (ช่องเดียวกัน) แนบพร้อมกัน | run ACTIVE ของห้อง = 1 แถว · ตัวที่ INSERT ชนะก่อนได้ · ไม่ throw |
| TC-127 | AC-FB-21 | I | **บันทึกบอทชนกันพร้อมกัน** 2 request (POST บอท A และ B ช่อง `chM` สถานะซ้อนกัน) ใต้ advisory lock | สำเร็จได้อย่างมาก 1 · อีกตัว 409 `CHANNEL_CONFLICT` · ไม่มีแถวบอททั้งสองตัวค้างครึ่งทาง |
| TC-128 | NFR-FB-02 | I | ลบร้าน/ห้องที่ seed (cascade): ลบ Conversation → run/Send/TestRoom หายตาม FK · `SalesFollowSend.botId` ไม่มี FK (ประวัติอยู่หลังลบบอท) | ตาม FK · ประวัติ Send ยังอ่านชื่อบอทที่ลบแล้วได้ |

#### 2.7.2 Engine: ส่ง, ตรวจซ้ำ, ปิดผล, sweep

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-130 | AC-FB-50 | I `[M-14]` | จอง `SENDING` สำเร็จ แล้วแอดมินตอบ (CountedShopReply `createdAt > send.createdAt`) ก่อนยิง | ไม่ยิง · `DELETE` แถว Send (คืนกุญแจ) · run ยัง ACTIVE · dueAt เลื่อน · M-14 ถอดเช็คนี้ → แดง |
| TC-131 | AC-FB-51 | I `[M-15]` | บังคับให้ INSERT Send ล้ม (ละเมิด CHECK) · และกรณีทรานแซกชัน rollback หลังยิง | INSERT ล้ม = ไม่ส่ง · ยิงเกิดหลัง COMMIT เสมอ (spy ลำดับ: commit ก่อน `enqueueOutbound`) · M-15 ย้ายการยิงเข้าใน tx → แดง |
| TC-132 | AC-FB-50 | I | ตรวจซ้ำแต่ละข้อก่อนยิง (เปลี่ยนสถานะระหว่างจองกับยิง ทีละอย่าง): stage เปลี่ยน · stamp เปลี่ยน · แท็กหลุด · บอทปิด · ลูกค้าตอบ · กรอบหมด · `NOT_INTERESTED` · ถูกบล็อก · ร้านถอนจากนำร่อง | ไม่ยิง · คืนกุญแจ (ไม่ทิ้ง SENDING) · run หยุด/พักตามเหตุ |
| TC-133 | AC-FB-53 | I | ส่งผ่าน `enqueueOutbound({ autoReplyKind:'AUTO_FOLLOW', actorUserId:null, systemShopId })` + `deliverRoom` (mock ปลายทาง) | แถว `ChatMessage` `senderRole='SHOP'` `autoReplyKind='AUTO_FOLLOW'` `senderUserId=null` · เข้าคิว `QUEUED` · ไม่มี `humanAgent`/tag ใน payload |
| TC-134 | AC-FB-12 | I | ขั้น `TEXT_IMAGE` | `enqueueOutbound` 2 ครั้ง: ข้อความก่อน แล้วรูป (`attachment.kind='IMAGE'`) · บันทึก `chatMessageId` + `imageMessageId` · ลำดับ `createdAt/seq` ข้อความ<รูป |
| TC-135 | AC-FB-60, 61 | I | ปิดผล: `SENT`/null → `SENT` · `FAILED` → จัดตาม `mapFollowFailure` · `QUEUED` → ปล่อยให้ sweeper · แล้ว `UPDATE Run SET nextStep=step+1 … WHERE status='ACTIVE' AND nextStep=step` | ผลมี 4 ค่า (ส่งแล้ว/ข้าม/ไม่สำเร็จ/กำลังส่ง) พร้อมเหตุผล · conditional update ไม่เดินซ้ำเมื่อชนกัน |
| TC-136 | AC-FB-61 | I | ขั้นกลางล้ม/ข้าม (ทีละเหตุ: `PLATFORM_REJECTED`, `OTHER_APP_CONTROLS`, `LINE_QUOTA_FULL`, `IMAGE_MISSING`, `EMPTY_MESSAGE`) · ขั้นสุดท้ายล้ม | เดินต่อขั้นถัดไป ไม่ลองซ้ำ · ขั้นสุดท้ายล้ม = run `DONE` (จบ ไม่ค้าง) |
| TC-137 | AC-FB-62, 63 | I `[M-30]` | **sweep (ก):** `SENDING` ไม่มี `chatMessageId` อายุ 11 นาที (และ 9 นาที) · **(ข):** `SENDING` มี `chatMessageId` · **(ค):** claim ค้างของ `ChatMessage` ที่ outbox ปิดเป็น FAILED ก่อน | 11 นาที = FAILED `UNCERTAIN_SEND` + เดินขั้นต่อ **ไม่ยิงซ้ำ** (ตัวยิงไม่ถูกเรียก) · 9 นาที = ยังไม่แตะ · (ข) ปิดตามสถานะข้อความ · (ค) เห็นเป็น FAILED · M-30 เปลี่ยน sweep เป็นยิงซ้ำ → แดง |
| TC-138 | AC-FB-63 | I | ช่องทางหลุดชั่วคราว: `ShopChannel.status≠'ACTIVE'` ระหว่างรอ แล้วกลับ ACTIVE · และ `enqueueOutbound` โยน `CHANNEL_NOT_ACTIVE` | HOLD `CHANNEL_NOT_ACTIVE` ไม่ข้ามขั้น (nextStep ไม่ขยับ) · กลับมา = ส่งต่อ · เลยกรอบเอง = STOP `WINDOW_CLOSED` · `NOT_ACTIVE` ตอนยิง = คืนกุญแจ + HOLD |
| TC-139 | AC-FB-72 | I | ตอนยิง `enqueueOutbound` โยน `CONTACT_BLOCKED` (LINE) | คืนกุญแจ · `isBlocked=true` · tick ถัดไป STOP `CONTACT_BLOCKED` |
| TC-140 | AC-FB-75, 76 | I `[M-19]` | **บรรทัดระบบซ้ำ:** สอง tick/สอง request หยุด run เดียวกันพร้อมกัน (`UPDATE … WHERE status='ACTIVE'` count) | มี `FOLLOW_BOT_NOTE` **1 แถว** (ผู้ชนะเท่านั้น) · count=0 ไม่เขียน · M-19 ถอด `status='ACTIVE'` → แดง |
| TC-141 | AC-FB-54 | I | HOLD `META_AI_HOLDING` ซ้ำหลาย tick | `holdReason` เขียนเฉพาะเมื่อค่าเปลี่ยน (บันทึกเหตุผลครั้งเดียวต่อขั้น) · ไม่เกิดแถวซ้ำ |
| TC-142 | NFR-FB-02, 03 | I | ห้องหนึ่งพัง (facts โยน error) ห้องอื่นใน tick เดียวกัน | tick ไม่ throw · ห้องอื่นทำงานต่อ · log เฉพาะ `errTag` ไม่มีข้อความ Prisma/ข้อความลูกค้า |
| TC-143 | NFR-FB-01 | I | `budgetMs` สั้น (เช่น 1ms) กับหลาย run | `timedOut:true` · ไม่ตัดกลางการยิง · งานเหลือไปรอบหน้า · ตัวเลขผลสรุปถูก |
| TC-144 | AC-FB-97 | I | ถอนร้านออกจากรายชื่อนำร่อง (เปลี่ยน env) ขณะมี run ACTIVE ถึงกำหนดแล้ว | **ไม่ยิง** (`sendAllowed=false` → HOLD `SHOP_NOT_ENABLED`) · ยังหยุดตามกรอบ/เหตุอื่นได้ (เลยกรอบ = STOP `WINDOW_CLOSED`) · ไม่ตายค้าง |
| TC-145 | AC-FB-96 | I `[M-31]` | ร้าน `shopX` (ไม่อยู่ในรายชื่อ) มีบอท ACTIVE + ห้องที่เข้าเงื่อนไขครบ | ไม่แนบ ไม่ส่ง ไม่มีแถว run/Send · ตัวยิงไม่ถูกเรียก · env ว่างทั้งหมด = ปิดทุกร้านรวม `shopP` |
| TC-146 | NFR-FB-05 | I | ตรวจ tick ตัวเลขผลสรุป: `{shops, evaluated, stopped, held, sent, skipped, failed, attached, timedOut}` ตรงกับสิ่งที่เกิดจริง · log `[sales-follow-bot]` ทุกรอบแม้เป็นศูนย์ ไม่มี id ร้าน/ห้อง/ข้อความ | ตรง |

#### 2.7.3 การแนบ (attach), สถานะบอท, ห้องทดสอบ

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-150 | AC-FB-36 | I | ห้องที่ผ่านครบทุกข้อ (ช่อง Messenger/IG/LINE · ช่องอยู่ในบอท · ลูกค้าทักจริงใน `delay1` · กรอบเปิด · ไม่ NOT_INTERESTED · ไม่สแปม/ไม่ซ่อน · สถานะตรง · แท็กตรง · ไม่มี run ACTIVE · ช่อง ACTIVE) | แนบ 1 run `stageKey/stageStamp/structureRev/nextStep=0` ถูก |
| TC-151 | AC-FB-36 | I | ละเมิดทีละข้อจากห้องที่ผ่านหมด (11 ข้อ รวม `isSpam`, `isHidden`, `shopChannel.status`, ห้องไม่มี `externalContactId`) · `resolvedAt≠null` | ไม่แนบทุกข้อ ยกเว้น `resolvedAt` ที่ **ไม่กั้น** (A-6) |
| TC-152 | AC-FB-40 | I | ห้อง `channel='DEEP'` (`roomD`) · ห้อง `externalContactId=null` | ไม่ถูกหยิบ ไม่ว่าบอทจะเลือกช่องใด |
| TC-153 | AC-FB-41 | I | บอท `CLOSED` · บอท `TESTING` ห้องนอกห้องทดสอบ · บอทที่ `deletedAt≠null` | ไม่แนบ · บอทเปิดแต่ร้านไม่นำร่อง = ไม่แนบ (TC-145) |
| TC-154 | AC-FB-07 | I | บอท `TESTING` มีห้องทดสอบ 2 ห้อง และมีห้องอื่นที่เข้าเงื่อนไขอีก 3 ห้อง | แนบ+ส่งเฉพาะ 2 ห้องทดสอบ |
| TC-155 | AC-FB-08 | I | บอท `TESTING` ที่มี run ที่ห้องทดสอบและห้องที่ไม่อยู่ทดสอบ → เปลี่ยนเป็น `CLOSED` · และอีกกรณีเปลี่ยนเป็น `ACTIVE` | `CLOSED` → tick ถัดไป STOP `BOT_DISABLED` ทุก run · `TESTING`→`ACTIVE` ห้องทดสอบ ตามต่อ · ห้องที่ไม่อยู่ในขอบเขต (ถ้าย้อนเป็น TESTING) = STOP `OUT_OF_SCOPE` (ตีความตามต้นแบบ — ดู §7 Q-3) |
| TC-156 | AC-FB-09 | I | เปิดบอทใหม่ (CLOSED→ACTIVE) ในร้านที่มี 50 ห้องที่ลูกค้าเงียบไปแล้วเกินเวลาขั้นแรก และ 2 ห้องที่เพิ่งทัก | แนบเพียง 2 ห้อง · ไม่มีห้องเก่าได้รับข้อความ |
| TC-157 | AC-FB-39 | I | บอทไม่เลือกสถานะ: run ลูกค้าตอบแล้ว STOPPED · สถานะการขายเปลี่ยนเป็นจ่ายแล้ว · ลูกค้าไม่ทักใหม่ | ไม่แนบซ้ำ (ไม่ส่งหาคนที่เพิ่งจ่าย) · ลูกค้าทักข้อความจริงใหม่ → แนบได้ |
| TC-158 | AC-FB-38, BR-FB-47 | I | run หยุดเพราะ `CUSTOMER_REPLIED` · บอทเลือก NOT_BOUGHT · ลูกค้าถามต่อ (stamp NOT_BOUGHT เดิม) | **ไม่แนบซ้ำในรอบสถานะเดิม** (OD-FB-3: ครั้งเดียวต่อห้องต่อรอบ) |
| TC-159 | AC-FB-36 | I | ข้ามร้าน: ห้องของ `shopO` เข้าเงื่อนไขของบอท `shopP` (บอทเลือกช่องของตัวเอง) | ไม่แนบ · บอทของ `shopP` เห็นเฉพาะห้อง `shopId=shopP` |
| TC-160 | AC-FB-36 | I | `ATTACH_ROOM_LIMIT`: ห้องผู้สมัคร 250 ห้องต่อบอท | แนบไม่เกิน 200 ต่อ tick ต่อบอท · เรียง `lastInboundAt DESC` · ที่เหลือรอบหน้า |
| TC-161 | AC-FB-48 | I | ลูกค้ากด reaction/คลิกโฆษณา ขยับ `lastInboundAt` แต่ไม่มี RealBuyerMsg ใน `delay1` | ไม่แนบ (`lastInboundAt` เป็นแค่ตัวกรองหยาบ) |

#### 2.7.4 การหยุด, บรรทัดระบบ, แก้/ลบบอท

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-170 | AC-FB-64 | I | ระหว่าง run สถานะการขายเปลี่ยน (สร้างออเดอร์ใหม่/ชำระแล้ว) หรือ stamp ต่าง | STOP `STAGE_CHANGED` + บรรทัดระบบ ไม่ส่งขั้นต่อ |
| TC-171 | AC-FB-65 | I | แท็ก: ANY เหลือ 1 ใน 2 · ALL ลบออก 1 ตัว · แท็กของบอทถูกลบหมดและไม่มีสถานะ | ANY ที่ยังตรง = ตามต่อ · ALL หลุด = STOP `TAG_REMOVED` · ไม่มีเงื่อนไขเหลือ = STOP `TAG_REMOVED` |
| TC-172 | AC-FB-66 | I | ปิดบอทที่มี run | STOP `BOT_DISABLED` ทุก run ในรอบ tick ถัดไป |
| TC-173 | AC-FB-67 | I `[M-05]` `[M-36]` | ลูกค้าตอบข้อความจริงหลังฟองบอทขั้นที่ 1 · แล้วทดสอบแยก: reaction · คลิกโฆษณาใหม่ · LINE unfollow/follow · LINE postback `pb:` · Messenger postback (ไม่สร้างข้อความ) | ข้อความจริง = STOP `CUSTOMER_REPLIED` · ที่เหลือทั้งหมด **ไม่หยุด** |
| TC-174 | AC-FB-68 | I | ส่งครบทุกขั้น | `status='DONE'` `stopReason=null` `finishedAt≠null` · ไม่เขียนบรรทัดระบบ |
| TC-175 | AC-FB-69 | I | เลยกรอบ: ห้อง Messenger ไม่มีโฆษณา ถึงขั้นที่ dueAt > lastInbound+24h · ห้องจากโฆษณา ขั้นที่ dueAt อยู่ในช่วง 24 ชม.–167 ชม. · ห้อง LINE ขั้น >24 ชม. · ห้องไม่มี `lastInboundAt` | ไม่ใช่โฆษณา/LINE = STOP `WINDOW_CLOSED` (ขั้นนั้นไม่ส่ง) · โฆษณา = ส่งได้ (ดู TC-181) · ไม่มี `lastInboundAt` = STOP |
| TC-176 | AC-FB-70 | I | `salesStatus` เปลี่ยนเป็น `NOT_INTERESTED` ระหว่าง run | STOP `NOT_INTERESTED` |
| TC-177 | AC-FB-71 | I | ห้องย้ายช่อง/ช่องหลุดจากบอท · บอทเปลี่ยนเป็น TESTING ห้องนอกทดสอบ · ห้องถูกตั้ง `isSpam`/`isHidden` ระหว่างตาม | STOP `OUT_OF_SCOPE` ทุกกรณี (รวมสแปม/ซ่อน ตาม SRS §7.4 ข้อ 4) |
| TC-178 | AC-FB-72 | I | LINE `isBlocked=true` ระหว่าง run | STOP `CONTACT_BLOCKED` · Messenger/IG ไม่มีทางเขียน `isBlocked` (ไม่หยุดด้วยเหตุนี้) |
| TC-179 | AC-FB-73 | I | หยุดโดยแอดมิน (service `stopRoomRun`) · กดซ้ำ · ห้องที่ไม่มี run | ครั้งแรก STOP `ADMIN_STOPPED` `stoppedByUserId` + บรรทัดระบบ · ซ้ำ/ไม่มี run = สำเร็จ (`stopped:false`) ไม่ error ไม่เขียนบรรทัดซ้ำ |
| TC-180 | AC-FB-75, 76, TFR-FB-17 | I `[M-22]` | ตรวจบรรทัดระบบหลังหยุด: `type='FOLLOW_BOT_NOTE'` `senderRole='SHOP'` `senderUserId=null` `autoReplyKind=null` · `body` "บอทติดตาม “<ชื่อบอท>” หยุด: <เหตุผลไทย>" · `Conversation.lastMessageAt/lastMessagePreview/lastSenderRole` ไม่เปลี่ยน · ไม่ผ่านตัวส่ง (dispatch ไม่ถูกเรียก) | ตรง · ชื่อบอทเป็น snapshot ณ ตอนหยุด |
| TC-181 | AC-FB-48, 48a | I | ห้องจากโฆษณา: ขั้นที่ 3 ตั้ง 30 ชม. หลังร้านตอบ · ตัวยิงตอบกลับ Meta ปฏิเสธนอกกรอบ (`WINDOW_CLOSED`) ทั้งที่ระบบคิดว่าเปิด | ส่งได้ถ้าระบบคำนวณว่าเปิด · เมื่อ Meta ปฏิเสธ: Send `SKIPPED/META_WINDOW_REJECTED` + run `STOPPED/WINDOW_CLOSED` **ไม่ลองซ้ำ** |
| TC-183 | AC-FB-77, BR-FB-43 | I `[M-27]` | แก้โครงขั้น: เพิ่ม/ลบขั้น · เปลี่ยน `kind` ขั้นใดขั้นหนึ่ง · สลับลำดับขั้น | `structureRev+1` · run ACTIVE ทั้งหมดของบอท STOP `BOT_EDITED` ในทรานแซกชันเดียวกับการบันทึก + บรรทัดระบบต่อห้อง · M-27 ไม่เพิ่ม structureRev → แดง · ด่านสำรอง engine เทียบ `run.structureRev≠bot.structureRev` ก็หยุด |
| TC-184 | AC-FB-78, 05 | I | แก้เฉพาะ `text` / `imageFileId` (ภายในชนิดเดิม) / `delayMin` / ชื่อ · บันทึกซ้ำโดยไม่เปลี่ยนอะไร | `structureRev` เท่าเดิม · run ไม่หยุด · dueAt คิดใหม่ใน tick ถัดไป |
| TC-185 | AC-FB-23, 24 | I | ลบบอทที่มี 3 run ACTIVE | `deletedAt≠null` · run ทั้ง 3 STOP `BOT_DELETED` + บรรทัดระบบ ในทรานแซกชันเดียว · `SalesFollowSend` เดิมไม่ถูกลบ · ประวัติแสดง `botDeleted=true` |
| TC-186 | AC-FB-79, BR-FB-51 | I | ลบแท็กร้าน/เปลี่ยนชื่อแท็ก/รวมแท็ก ที่บอทอ้างถึง | `GET bots` คืน `warnings:[{code:'TAG_MISSING', keys}]` + `missing:true` (คำนวณตอนอ่าน ไม่เก็บ) · บอท ALL ไม่แนบห้องใหม่ (ไม่ตายเงียบ) · ANY แนบต่อด้วยแท็กที่เหลือ |
| TC-187 | AC-FB-74 | I | แผงในห้อง: ลูกค้าตอบหลังฟองบอท หรือแท็กไม่ตรง แต่ tick ยังไม่รอบถัดไป | `GET follow-bot` ให้ `run:null` ทันที ก่อนที่ engine จะหยุดจริง |

#### 2.7.5 ผลต่อระบบอื่นของฟอง `AUTO_FOLLOW` (ระดับ DB จริง — ดูหมวด 2.8 ประกอบ)

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-190 | AC-FB-52, 99 | I | ส่งฟอง AUTO_FOLLOW แล้วตรวจ `Conversation.autoReplyPausedUntil` · `handoffAt` | ยังเป็น `null` (ไม่ทำให้บอทตอบ 00023 หยุดจากเหตุ "คนรับช่วง") |
| TC-191 | AC-FB-100 | I `[M-20]` | ลูกค้าเพิ่งพิมพ์ (`lastSenderRole='BUYER'`, ไม่ได้อ่าน=1) แล้วบอทส่งฟอง | `lastSenderRole` ยังเป็น `BUYER` · ตัวนับไม่ได้อ่านของร้านไม่ลด/ไม่หาย (ข้อความลูกค้าไม่หายจาก "ไม่ได้อ่าน") · M-20 ให้ AUTO_FOLLOW ตั้ง `lastSenderRole='SHOP'` → แดง |
| TC-192 | AC-FB-99, 52 | I | ฟองบอทไม่ถูกนับเป็นผลงานพนักงาน (`agent-performance`, `HUMAN_AGENT_REPLY_WHERE`, `thread-agents`) · ไม่ติดแท็กอัตโนมัติ (`shop-tag-auto`) · ไม่สร้างออเดอร์จากฟอง (`auto-order-detect`) | ไม่นับ/ไม่ติด/ไม่สร้าง |

### 2.8 จุดอ่านป้ายผู้ส่ง `AUTO_FOLLOW` / `FOLLOW_BOT_NOTE` (TFR-FB-18 — AC-FB-99, 100)

เทสทีละจุด "ถอดการรองรับจุดเดียวแล้วต้องแดง" ตามที่ AC-FB-99 กำหนด · หมายเลขข้อ = ลำดับในตาราง TFR-FB-18

| TC | อ้างอิง | ระดับ | เคส (ข้อ TFR-FB-18) | ผลที่คาด |
|---|---|---|---|---|
| TC-200 | AC-FB-100 | U `[M-20]` | #1 `shopSendSenderRolePatch('AUTO_FOLLOW')` · `AUTO_NOTICE` · `AUTO` · null · `AutoReplyKind` มี `'AUTO_FOLLOW'` แต่ `AUTO_REPLY_KINDS` ไม่มี · `isFollowBotKind` | AUTO_FOLLOW/AUTO_NOTICE คืน `{}` · ชนิดอื่นคงเดิม · ตัวช่วยตอบถูก |
| TC-201 | AC-FB-52 | I | #2 `chat-outbox.service` ส่งต่อ kind+patch จนถึงแถวที่เขียน | แถวมี `autoReplyKind='AUTO_FOLLOW'` และไม่มี `lastSenderRole` ถูกแก้ |
| TC-202 | AC-FB-52 | I | #3 `pauseForHumanTakeover` เฉพาะ `!autoReplyKind` | ส่ง AUTO_FOLLOW แล้ว `autoReplyPausedUntil` ยัง null |
| TC-203 | AC-FB-52 | I | #4 `shop-tag-auto`, `auto-order-detect` ข้ามข้อความที่ `autoReplyKind != null` | ข้อความบอทมีคำที่ตรงกฎแท็ก/คำสั่งสร้างออเดอร์ → ไม่ติดแท็ก/ไม่สร้างออเดอร์ |
| TC-204 | AC-FB-99 | I | #5 `agent-performance`, `agent-performance-sql`, `HUMAN_AGENT_REPLY_WHERE`, `thread-agents` | ฟอง AUTO_FOLLOW ไม่ถูกนับ ทั้งฉบับ TS และ SQL (parity) |
| TC-205 | AC-FB-99 | U `[M-21]` | #6 `pickDesk` ใน `chat-desk/rules.ts`: ห้องที่ข้อความล่าสุดคือ AUTO_FOLLOW | ไม่เข้าโต๊ะ "BOT ตอบ" · ถอดการข้าม → แดง |
| TC-206 | AC-FB-99 | I `[M-21]` | #7 `chat-desk.service` `IS DISTINCT FROM 'AUTO_NOTICE'` ฉบับ SQL ที่ `:151,168` และ `isSystemNoticeKind` ที่ `:382`: ห้องที่ลูกค้ารอ + ฟองบอทติดตามล่าสุด | ห้องยังนับ "ลูกค้ารอ" · parity SQL↔TS เท่ากัน · ถอดทีละจุด (SQL / TS) → แดงทั้งสอง |
| TC-207 | AC-FB-99 | I | #8 `enrichWithAutoReplyBadge`: ข้อความล่าสุดคือ AUTO_FOLLOW | `lastMessageAutoReplyKind=null` (ไม่ขึ้น DeepBot) · `lastMessageIsFollowBot=true` · คำนำหน้าพรีวิว "บอทติดตาม:" |
| TC-208 | AC-FB-99 | C | #9 `ThreadMessageList`: ฟอง AUTO_FOLLOW | ป้ายเล็ก "บอทติดตาม" (ข้อความ ไม่ใช่สีอย่างเดียว) · ไม่มี popover เหตุผลแบบ DeepBot · ข้อความล้ม = ข้อความเดิม 'ส่งไม่สำเร็จ' |
| TC-209 | AC-FB-99 | I | #10 `notifySendFailed` ข้ามสำหรับ AUTO_FOLLOW | ฟอง AUTO_FOLLOW ล้ม = ไม่ push "ส่งไม่ออก" · ฟองร้านปกติที่ล้มยังถูกแจ้ง (regression) |
| TC-210 | AC-FB-99 | I `[M-22]` | #11 ตัวกรองคู่ 9 จุด (`chat-memory-ai`, `ai-suggest-auto` ×2, `ai-suggest` route ×2, `chat-metrics`, `auto-order-sweeper`, `memory/refresh`, `auto-reply.service:858`): ห้องที่มี `FOLLOW_BOT_NOTE` + ฟอง AUTO_FOLLOW | ไม่ปนเข้าบริบท AI/ความจำ/เมตริก/ตัวกวาด · ทำทีละจุด 9 เคสย่อย |
| TC-211 | AC-FB-99 | R | #11 grep gate: `rg "not: AUTO_ORDER_RESULT_TYPE" src/` | 0 ผลลัพธ์ |
| TC-212 | AC-FB-76 | I | `chat.service` มุมมอง buyer + `channel-chat` ขาออก: ห้องมี `FOLLOW_BOT_NOTE` | ลูกค้า/ช่องทางภายนอกไม่เห็น · ไม่อยู่ในรายการข้อความที่ส่งออก |
| TC-213 | AC-FB-76 | I | ห้องที่มีแต่บรรทัดระบบล่าสุด | ไม่เพิ่ม "ไม่ได้อ่าน" · ไม่กลายเป็น "ลูกค้ารอ" · ไม่ดันห้องขึ้นบน |
| TC-214 | AC-FB-99 | C | #12 `ThreadMessageList` เรนเดอร์ `FOLLOW_BOT_NOTE` เป็นบรรทัดกลางห้องแบบ META_NOTICE | แสดงบรรทัดกลางห้อง · ไม่ใช่ฟองซ้าย/ขวา |
| TC-215 | AC-FB-99 | U `[M-22]` | `FOLLOW_BOT_NOTE` ใน `INTERNAL_MESSAGE_TYPES` ผลต่อ CountedShopReply/RealBuyerMsg (TC-030/031) | บรรทัดระบบไม่เป็น "ร้านตอบ" ไม่เป็น "ลูกค้าตอบ" |
| TC-216 | AC-FB-99 | I | #13 `meta-system-notice` ข้ามข้อความที่มี `autoReplyKind` | ไม่เปลี่ยนพฤติกรรม (regression) |
| TC-217 | AC-FB-99 | R | #15 grep `autoReplyKind` ทั้ง `src/` เทียบรายการในตาราง TFR-FB-18 | ไม่มีจุดอ่านใหม่ที่ไม่อยู่ในตาราง |

### 2.9 รายการ mutation (ต้องแดง)

| M | ไฟล์/จุดที่แก้ | แก้อย่างไร | TC ที่ต้องแดง |
|---|---|---|---|
| M-01 | `sales-stage.ts` ลำดับกฎ 2/3/4 | สลับให้ `CONFIRMED`/`DONE` มาก่อน `RETURNED`/PROBLEM | TC-009, TC-010 |
| M-02 | `sales-stage.ts` ตัวเลือก E | ถอด `status<>'DRAFTED'` หรือ `isDryRun=false` | TC-001 |
| M-03 | `sales-stage.ts` จบรอบ | เปลี่ยน `>` เป็น `>=` ที่ `stamp+HOLD` | TC-022 |
| M-04 | `sales-stage.ts` ตัดอนาคต | ถอดการตัดค่า stamp `> now` | TC-021 |
| M-05 | `message-defs.ts` RealBuyerMsg | ถอด `NOT LIKE 'pb:%'` | TC-030, TC-173 |
| M-06 | `message-defs.ts` CountedShopReply | ถอด `deliveryStatus IS DISTINCT FROM 'FAILED'` | TC-031 |
| M-07 | `message-defs.ts` CountedShopReply | ถอด `autoReplyKind IS DISTINCT FROM 'AUTO_FOLLOW'` | TC-031 |
| M-08 | `message-defs.ts` | ถอด `type NOT IN INTERNAL_MESSAGE_TYPES` (ทั้งสองนิยาม) | TC-030, TC-031 |
| M-09 | `message-defs.ts` / ขอบเวลา | ถอดขอบ 30 วัน ใน 1 query | TC-033 |
| M-36 | `decide`/facts | ใช้ `lastInboundAt` ตัดสินลูกค้าตอบ | TC-036, TC-173 |
| M-10 | `decide.ts` ลำดับ | สลับคู่ลำดับใดก็ได้ใน BR-FB-40 | TC-041 |
| M-11 | `decide.ts` ข้อ 6 | `dueAt >= expiresAt` → `>` | TC-046 |
| M-12 | `decide.ts` ข้อ 14 | ถอด WAIT เมื่อร้านค้างตอบ | TC-048 |
| M-13 | `decide.ts`/dueAt | ถอด `run.lastSentAt` ออกจาก `max(...)` | TC-049 |
| M-14 | engine ตรวจซ้ำ | ถอดเช็ค "แอดมินตอบหลังจอง" | TC-130 |
| M-15 | engine | ย้าย `enqueueOutbound` เข้าไปใน tx ก่อน COMMIT | TC-131 |
| M-16 | engine claim | ถอด `ON CONFLICT ("runId","step") DO NOTHING` หรือ unique | TC-125 |
| M-17 | migration | ถอด partial unique `(conversationId) WHERE status='ACTIVE'` | TC-122, TC-126 |
| M-18 | migration | ถอด unique `(botId, conversationId, stageStamp)` | TC-123 |
| M-19 | `sales-follow-note.service` | ถอด `WHERE status='ACTIVE'` ของ UPDATE ปิด run | TC-140 |
| M-20 | `auto-reply-constants.ts` | ให้ AUTO_FOLLOW ตั้ง `lastSenderRole='SHOP'` | TC-191, TC-200 |
| M-21 | `chat-desk/rules.ts`, `chat-desk.service.ts` | ถอด AUTO_FOLLOW จาก `pickDesk` / SQL `IS DISTINCT FROM` / `isSystemNoticeKind` ทีละจุด | TC-205, TC-206 |
| M-22 | `auto-order-message-type.ts` | ถอด `FOLLOW_BOT_NOTE` ออกจาก `INTERNAL_MESSAGE_TYPES` | TC-215, TC-210, TC-037 |
| M-23 | `src/lib/sales-follow-bot/**` | เพิ่มการอ้าง `humanAgent`/`HUMAN_AGENT`/`tag:` | TC-061 |
| M-24 | `gate.ts` | ให้ env ว่าง = เปิดทุกร้าน | TC-065, TC-145 |
| M-25 | `sales-follow-bot.service.ts` | ถอด `shopId` ใน `where` ของ query ใด query หนึ่ง (ทีละ endpoint) | TC-340..346 (หมวดข้ามร้าน) |
| M-26 | `conflicts.ts` | ถอด "ฝ่ายใดว่าง = ซ้อน" | TC-085, TC-086 |
| M-27 | service แก้บอท | ไม่เพิ่ม `structureRev` เมื่อ `kind` เปลี่ยน | TC-183 |
| M-28 | `eligibleToAttach` | ถอดด่าน `finishedAt` ของบอทไม่เลือกสถานะ | TC-098, TC-157 |
| M-29 | `eligibleToAttach` | ถอดด่านกรอบส่งเปิด | TC-096 |
| M-30 | sweep | ให้ sweep `SENDING` ไม่มี `chatMessageId` ยิงซ้ำแทนปิด `UNCERTAIN_SEND` | TC-137 |
| M-31 | engine/attach | ถอด `isSalesFollowBotEnabled` ที่ตัวแนบ/ตัวส่งอย่างใดอย่างหนึ่ง | TC-145, TC-144 |
| M-32 | migration | ลบค่าหนึ่งออกจาก CHECK | TC-120 |
| M-33 | route `follow-bot/stop` | ใช้ `shopId` จาก body แทน session | TC-342, TC-343 |
| M-34 | route capability | ลบ route ใดออกจาก `route-capabilities.ts` | TC-306 |

> M-09 = ขอบ 30 วัน · M-36 = ใช้ `lastInboundAt` ตัดสินลูกค้าตอบ (ลำดับ M-36 วางท้ายตารางเพื่อไม่เลื่อนเลขที่อ้างไว้แล้ว)

### 2.10 เคสกันซ้ำบั๊ก/บทเรียน prod ของต้นแบบ gochat (REFERENCE §8 — ทุกข้อต้องมีเคส)

| บทเรียน | อ้างอิง | TC กันซ้ำ | สรุปสิ่งที่เทสจับ |
|---|---|---|---|
| #1 บังคับแท็กสถานะ ≥1 / ลูกค้าตอบแล้วบอทยังตาม / สถานะเปลี่ยนแล้วหยิบใหม่ส่งหาคนที่เพิ่งจ่าย / นิยาม "ตอบ" ด้วย last_inbound เดียว / run ที่ลูกค้าตอบในอดีตหยุดพร้อมกันตอน deploy | AC-FB-02, 38, 39, 67, BR-FB-82 | TC-071, TC-098, TC-157, TC-158, TC-173, TC-036, TC-500 | แท็กอย่างเดียวบันทึกได้ · บอทไม่เลือกสถานะไม่หยิบซ้ำจนกว่าลูกค้าทักใหม่ · reaction/pb:/โฆษณาไม่ใช่ตอบ · dry-run นับก่อนเปิด |
| #2 นับจากลูกค้าทัก (ต้องนับจากร้านตอบ) · ฟองล้มต้องไม่นับเป็นร้านตอบ · แอดมินตอบหลัง claim = ไม่ยิง · ตรวจซ้ำต้องมีขอบเวลา · "ส่งแล้ว" ต้องเป็นเวลาฟองจริง | AC-FB-42..45, 50, 87 | TC-049, TC-031, TC-130, TC-033, TC-051, TC-455 | M-06, M-13, M-14 |
| #3 สถานะ "สำเร็จ/ส่งแล้ว" ทักใหม่แล้วตามขายคนที่เพิ่งซื้อ | AC-FB-30, 31 | TC-022, TC-023, TC-027 | จบรอบเมื่อ "เกินจริง" 7/14/0 วัน |
| #4 ขยายเพดานขั้นต้องไล่ทุก CHECK | BR-FB-81, TFR-FB-04 | TC-121, TC-120 | บอท 10 ขั้น INSERT Send ขั้นสุดท้ายได้ ไม่ rollback ทั้งร้าน |
| #5 ไมโครวินาที (Date JS ตัดไมโครวินาที) | AC-FB-32, TFR-FB-02 | TC-026, TC-501 | stamp/เวลาข้อความเทียบฝั่ง JS บนมิลลิวินาทีชุดเดียว · ห้ามเทียบ `now()` ของ Postgres กับ `Date` |
| #6 postgres.js + jsonb stringify ซ้ำ | SDS (Prisma) | TC-502 | เขียน/อ่าน `steps` jsonb ผ่าน Prisma ได้ครบทุก key (`text`,`kind`,`delayMin`,`imageFileId`) ไม่เป็น null |
| #7 ประทับเวลาเหตุการณ์ (ไม่ใช่ `now()`) · เวลาอนาคตห้ามใช้ | AC-FB-33 | TC-020, TC-021 | stamp = `occurredAt` ไม่ใช่เวลาประมวลผล |
| #8 delivered = สำเร็จ · ห้องหลายออเดอร์ยึดใบล่าสุด | AC-FB-26, 27 | TC-004, TC-011, TC-012 | DONE/AWAITING_COD → COMPLETED |
| #9 `tag_removed` ต้องเช็คตลอดรอบ ไม่ใช่แค่ตอนหยิบ | AC-FB-65 | TC-171, TC-040 | แท็กหลุดระหว่าง run = หยุด |
| #10 ลบ/รวมแท็กต้องไม่ทำให้บอท "ครบทุกแท็ก" ตายเงียบ | AC-FB-79 | TC-186, TC-099 | เตือน `TAG_MISSING` · ALL ที่แท็กหาย = ไม่แนบ (เห็นได้ ไม่ตายเงียบ) |
| #11 `'use server'` re-export type ทำทุก action ล้ม | SDS TD-FB-007 | TC-503 | ใช้ route handler · ไม่มีไฟล์ `'use server'` ของฟีเจอร์นี้ · build ผ่าน (exit code) |
| #12 เฟส 1 ห้องละธุรกรรม + แจ้ง SSE ห้องละครั้ง | NFR-FB-01 | TC-143, TC-504 | โหลด facts เป็นชุด ไม่ N+1 · จำนวน query ต่อ tick ไม่โตตามจำนวนห้อง (นับ query) |
| #13 สแกนห้องทั้งร้านทุกนาที / อย่าเพิ่งเพิ่ม index | TFR-FB-22 | TC-505, TC-160 | ไม่เพิ่ม index บน ChatMessage ใน P1 · `EXPLAIN` ก่อนเปิดร้านที่ 2 · `ATTACH_ROOM_LIMIT` |
| #14 ห้อง active ค้างไม่มีกำหนด (ร้านค้างตอบ) | BR-FB-48 | TC-048, TC-175 | ร้านค้างตอบ = WAIT แต่ถูกจำกัดด้วยกรอบส่งเสมอ (ไม่ตายค้าง) |
| #15 รายชื่อร้านกันแค่ทางเข้า · rollout CHECK เพิ่มค่าอย่างเดียว · ห้ามสร้างบอทไม่เลือกสถานะระหว่าง deploy | AC-FB-96, BR-FB-81 | TC-145, TC-144, TC-120, TC-506 | กั้นที่ตัวส่งด้วย ไม่ใช่แค่ซ่อนหน้า |
| #16 ยิงในธุรกรรม = rollback แล้วข้อความออกไปแล้ว | AC-FB-51 | TC-131 | ยิงหลัง COMMIT เสมอ |
| #17 ไฟล์ audit UI (เมนูหัวห้องถูกตัด, action ล้ม, ป้ายล็อกจาง, คอนทราสต์) | UI | TC-416, TC-418, TC-445, TC-446 | เมนู/ชิป/ป้ายล็อกไม่ถูกตัด · เมนูปิดได้ · คอนทราสต์ผ่าน |

### 2.11 API (A) — ทุก error code ใน API §5

ใช้ session เทส (ฉีด cookie ผ่าน `e2e/helpers/auth.ts` หรือ mock `getServerSession`) · ทุก response ต้องมี `Cache-Control: no-store` (`jsonNoStore`)

#### 2.11.1 สิทธิ์ ด่านร้าน ข้ามร้าน

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-300 | API §2, AC-FB-92 | A | ทุก endpoint ไม่มี session | 401 `{error:'unauthorized'}` |
| TC-301 | AC-FB-93, FR-FB-50 | A | บทบาท OWNER · MANAGER · CHAT เรียกทุก endpoint ของ `shops/current/sales-follow-bot/*` | 200/201 (ทุกคนที่ตอบแชทได้ทำได้ทุกอย่าง · มติ Q-11 ข) |
| TC-302 | AC-FB-93 | A | บทบาท BILLING · TECHNICIAN เรียกทุก endpoint (รวม `follow-bot` ของห้อง) | 403 `FORBIDDEN` ทุกตัว |
| TC-303 | AC-FB-96 | A `[M-24]` | ร้านไม่อยู่ในรายชื่อนำร่อง เรียกทุก endpoint ที่ใช้ `requireSalesFollowShop()` | 403 `FEATURE_NOT_ENABLED` · ไม่คืนข้อมูล |
| TC-304 | AC-FB-96 | A | ร้านนำร่องแต่ `vertical≠'ONLINE_SALES'` | 409 `NOT_AVAILABLE_FOR_SHOP` (หรือสถานะจริงของ `requireOnlineSalesVertical` — ตรวจ API Open Q-ก) |
| TC-305 | AC-FB-95 | A/U | พารามิเตอร์สิทธิ์ของ helper ไม่มี default เปิด: เรียก helper ไม่ส่ง capability / ส่ง `undefined` | ปฏิเสธ (ไม่ผ่านเงียบ) |
| TC-306 | AC-FB-92, SDS §9 | U/R `[M-34]` | `route-capabilities.ts` ประกาศครบ: หน้า `settings/sales-follow-bot` + `[id]` (H2) · `bots` (GET/POST H2) · `bots/[id]` (GET/PATCH/DELETE H2) · `status` (PUT H2) · `options`/`test-rooms`/`sends` (GET H2) · `follow-bot` (GET H1) · `follow-bot/stop` (POST H2) · cron อยู่ใต้ prefix `CRON` | ครบ · ลืมประกาศ = เทส route-capabilities แดง |
| TC-307 | API §4.12 | A | `GET /api/cron/sales-follow-bot`: ไม่มี header · Bearer ผิด · `CRON_SECRET` ว่าง (env) · Bearer ถูก | 401 · 401 · 401 ทันที · 200 `{shops,evaluated,stopped,held,sent,skipped,failed,attached,timedOut}` ตัวเลขล้วน ไม่มี id |
| TC-308 | NFR-FB-02 | A | cron เมื่อ engine ภายในโยน error ที่ห้องหนึ่ง | 200 สรุป ไม่ 500 · error สะท้อนเป็นตัวเลข `failed` |

#### 2.11.2 `bots` CRUD, สถานะ, options, test-rooms, sends, ห้อง

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-310 | AC-FB-01, 04 | A | `POST bots` ถูกต้อง · ส่ง `status:'ACTIVE'` มาด้วย | 201 `BotDto` `status='CLOSED'` เสมอ (เมินค่าที่ส่ง) · `adOnly` ถูกคำนวณ · `steps[].text` ครบ |
| TC-311 | AC-FB-01..03, 10, 11, 15, 16 | A | `POST bots` 400 `VALIDATION_ERROR` ทีละ `issues[].code`: `NAME_REQUIRED` · `NAME_TOO_LONG` · `NO_CONDITION` · `STEPS_COUNT` · `STEP_DELAY_MIN` · `STEPS_TOTAL_TOO_LONG`(+`stepIndex`) · `STEP_TEXT_REQUIRED` · `STEP_TEXT_TOO_LONG` · `STEP_IMAGE_REQUIRED` · `UNKNOWN_VARIABLE`(+`name`) · `TOO_MANY_TAGS` · `TOO_MANY_CHANNELS` | ได้ code ตรงทุกตัว พร้อม `path` · ไม่มีแถวถูกสร้าง |
| TC-312 | AC-FB-03 | A | `POST bots` ด้วย `channelIds` ของร้านอื่น · ช่อง DEEP · ช่อง provider อื่น · uuid ไม่มีอยู่จริง · ผสมถูกกับผิด | 400 `CHANNEL_NOT_FOUND` **ข้อความเหมือนกันทุกกรณี** (ไม่เปิดเผยว่ามีในร้านอื่น) |
| TC-313 | AC-FB-01 | A | `POST bots` ด้วย `tags` ที่ไม่มีใน `ShopTag` ของร้าน · แท็กของร้านอื่น | 400 `TAG_NOT_FOUND` `{names:[…]}` |
| TC-314 | AC-FB-19 | A | `POST bots` ชนกับบอทที่ไม่ปิด (ช่อง+สถานะซ้อน) | 409 `CHANNEL_CONFLICT` `{conflicts:[{channelId,botId,botName}]}` · ข้อความบอก "อยู่ในบอท <ชื่อ>" |
| TC-315 | AC-FB-80 | A | `GET bots`: ไม่มีบอท · มีบอทลบแล้ว · มี `activeRunCount` · มี `warnings` | `{bots:[]}` · ไม่รวมที่ลบ · เรียง `createdAt DESC` · `activeRunCount` ตรง · `warnings` ตรง |
| TC-316 | API §4.3 | A | `GET bots/[id]` ของร้านนี้ · ของร้านอื่น · id ที่ถูกลบ · id ไม่ใช่ uuid | 200 · 404 `NOT_FOUND` · 404 (เหมือนกัน) · 404/400 ตายตัว ไม่ 500 |
| TC-317 | AC-FB-05, 77, 78 | A | `PATCH bots/[id]` ด้วย `expectedUpdatedAt` ถูก: แก้ข้อความ · แก้โครง · บันทึกซ้ำไม่เปลี่ยน | 200 `BotDto` + `stoppedRuns` (0 / จำนวน run / 0) · `structureRev` ตาม |
| TC-318 | API §4.4 | A | `PATCH` ด้วย `expectedUpdatedAt` เก่า (สองคนแก้ทับกัน) · ไม่ส่ง `expectedUpdatedAt` | 409 `BOT_STALE` `{currentUpdatedAt}` · 400 `VALIDATION_ERROR` |
| TC-319 | AC-FB-19 | A | `PATCH` ให้ช่องชนกับบอทอื่น | 409 `CHANNEL_CONFLICT` · บอทเดิมไม่เปลี่ยน |
| TC-320 | AC-FB-23, 24 | A | `DELETE bots/[id]?expectedUpdatedAt=…` · stale · ของร้านอื่น | 200 `{deleted:true, stoppedRuns:n}` · 409 `BOT_STALE` · 404 |
| TC-321 | AC-FB-24 | A | `GET bots` / `GET bots/[id]` ให้ `activeRunCount` ก่อนลบ (UI ใช้ยืนยัน) | ตรงกับจำนวน run ACTIVE จริง |
| TC-322 | AC-FB-04, 06, 08 | A | `PUT status`: `CLOSED→TESTING` มี/ไม่มี `testRoomIds` · 21 ห้อง · ห้องไม่ใช่ของร้าน · ห้องอยู่นอกช่องของบอท · `→ACTIVE` · `→CLOSED` | TESTING ไม่มีห้อง = 400 `TEST_ROOMS_REQUIRED` · 21 ห้อง = 400 (`TEST_ROOMS_TOO_MANY` ตาม SDS §7 — ดู §7 Q-4) · ผิดร้าน/ผิดช่อง = 400 `TEST_ROOM_NOT_FOUND` · ผ่าน = 200 |
| TC-323 | AC-FB-19, 21 | A | `PUT status` → TESTING/ACTIVE ที่ชนบอทอื่น · stale | 409 `CHANNEL_CONFLICT` · 409 `BOT_STALE` |
| TC-324 | API §4.7 | A | `GET options` | `channels` เฉพาะ Messenger/IG/LINE ของร้าน (ไม่มี DEEP/ช่องร้านอื่น) · `tags` · `stages` 7 ค่ามีป้ายไทย · `limits` ตรง `constants.ts` · `variables:['ชื่อ']` |
| TC-325 | API §4.8 | A | `GET test-rooms?channelIds=…&q=…`: ช่องของร้าน · ช่องไม่ใช่ของร้าน (ปนมา) · `q` ยาว 61 ตัว · ผล >20 | ≤20 รายการ เรียง `lastInboundAt DESC` · ช่องผิดร้านไม่ปรากฏ ไม่ error · `q` เกินเพดาน = 400 |
| TC-326 | AC-FB-81 | A | `GET sends`: หน้าแรก · ใช้ `nextCursor` · `limit` 1/50/51/0 · ไม่มีข้อมูล | keyset `(createdAt DESC,id DESC)` หน้าละ ≤50 · ไม่ซ้ำ/ไม่ตกหล่นข้ามหน้า · limit ผิดถูก clamp/400 ตายตัว |
| TC-327 | AC-FB-81 | A | **cursor พัง/ปลอม:** base64 ผิด · ไม่มี `|` · วันที่ผิด · cursor ของร้านอื่น · ว่าง | ทุกกรณี 200 `{items:[],nextCursor:null}` (ไม่ 400/500) |
| TC-328 | AC-FB-81, 23 | A | รูปแถว `sends`: `step` เริ่ม 1 (DB เริ่ม 0) · `stepCount` · `at` = เวลาฟองจริงเมื่อ SENT มิฉะนั้น `settledAt ?? createdAt` · `reasonText` เป็นไทย · `botDeleted` | ตรงตามสัญญา · ไม่มีรหัสดิบแสดงแทนข้อความ |
| TC-329 | AC-FB-85, 86 | A | `GET conversations/[id]/follow-bot`: ห้อง Messenger/IG/LINE มี run · ไม่มี run · ห้อง DEEP · ร้านไม่นำร่อง · ไม่ใช่ ONLINE_SALES · ห้องร้านอื่น | `available:true`+`run` · `available:true, run:null` · `available:false` (ไม่มี `run`) · 403 `FEATURE_NOT_ENABLED`/`available:false` ตาม API §4.10 · 409/`available:false` · 404 `NOT_FOUND` |
| TC-330 | AC-FB-86, 87 | A | รูป `run.steps[]`: `SENT` (เวลาฟองจริง) · `PENDING` (dueAt) · `SENDING` · `SKIPPED/FAILED` (+`reasonText`) · `awaitingShop=true` · `holdReason/holdText` · `canStop` | ตรงสัญญา · `sentAt` ไม่ใช่เวลาจอง |
| TC-331 | AC-FB-73, 88 | A | `POST conversations/[id]/follow-bot/stop`: มี run · ซ้ำ · ไม่มี run · ห้องร้านอื่น · BILLING | 200 `{stopped:true}` · 200 `{stopped:false}` · 200 `{stopped:false}` · 404 · 403 |
| TC-332 | NFR-FB-04 | A | ทุก response ไม่มี `shopId` จาก body/query ที่ผู้ใช้ส่งมา (ลองส่ง `shopId` ของร้านอื่นใน body/query ของทุก route) | ถูกเมิน · ใช้ `gate.shopId` เท่านั้น |
| TC-333 | NFR-FB-05 | A | 500: บังคับให้ service โยน error ไม่คาดคิด | 500 `INTERNAL_ERROR` · log แท็กเส้นทาง · ไม่ log body/ข้อความลูกค้า/เบอร์ |
| TC-334 | AC-FB-82 (ดู §7 Q-5) | A | ผู้ใช้บทบาทที่ไม่มี H2 เรียก `POST bots` ตรง · เข้า URL หน้า `/settings/sales-follow-bot/new` ตรง | ปฏิเสธฝั่งเซิร์ฟเวอร์ 403 (ไม่มีหน้าอ่านอย่างเดียวใน P1) |

#### 2.11.3 ข้ามร้านต่อ endpoint (AC-FB-94 / NFR-FB-04) — บังคับครบทุก endpoint

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-340 | AC-FB-94 | A `[M-25]` | ผู้ใช้ `shopP` ใช้ id บอทของ `shopO` กับ `GET/PATCH/DELETE bots/[id]` · `PUT status` | 404 `NOT_FOUND` เหมือนไม่มี (ไม่ใช่ 403) |
| TC-341 | AC-FB-94 | A `[M-25]` | `POST bots` ใช้ `channelIds` ของ `shopO` · `tags` ของ `shopO` · `PUT status` `testRoomIds` ของห้อง `shopO` | 400 `CHANNEL_NOT_FOUND` / `TAG_NOT_FOUND` / `TEST_ROOM_NOT_FOUND` |
| TC-342 | AC-FB-94 | A `[M-25]` `[M-33]` | `GET follow-bot` และ `POST follow-bot/stop` ด้วย `conversationId` ของ `shopO` | 404 `NOT_FOUND` · ห้องของ `shopO` ไม่ถูกหยุด (ตรวจ DB ว่า run ยัง ACTIVE) |
| TC-343 | AC-FB-94 | A `[M-33]` | ส่ง `shopId` ของ `shopO` ใน body/query ของ `stop` | ถูกเมิน · ผลกระทบเฉพาะห้องของ `shopP` |
| TC-344 | AC-FB-94 | A | `GET sends` ของ `shopP` ไม่เห็นแถวของ `shopO` ทั้งหน้าและผ่าน cursor ที่ปลอมจากแถว `shopO` | ไม่มีแถวร้านอื่น |
| TC-345 | AC-FB-94 | A | `GET test-rooms` ไม่คืนห้องของร้านอื่นแม้ส่ง `channelIds` ของร้านอื่น | ไม่ปรากฏ ไม่ error |
| TC-346 | AC-FB-94 | I | แนบ/ส่งของ tick ไม่ข้ามร้าน (TC-159) และ `findChannelConflicts` ใช้เฉพาะบอทร้านเดียวกัน | บอทร้านอื่นไม่ถูกนับเป็นบอทที่ชน |

### 2.12 E2E Playwright (E) — `e2e/sales-follow-bot.spec.ts`

โดเมน `http://seller.deepth.local:4000` (ห้าม localhost) · seed ผู้ขาย `createSeller(state)` สถานะ `complete` ร้าน ONLINE_SALES + ตั้ง `SALES_FOLLOW_BOT_SHOP_IDS` ให้ร้านเทสในสภาพแวดล้อม dev server (ถ้า env ผูกที่ dev server ต้องแจ้งผู้รันก่อน — ไม่ start server เอง) · `loginAs(context, seeded)` · `cleanup(userId)` ใน `finally` · **รัน `npm run e2e` พร้อมปักหมุด DB localhost:5434 ในคำสั่ง** (HR14: playwright เป็นคำสั่งที่ต้องปักหมุด) · แต่ละเคสตรวจ console ไม่มี runtime error · 3 จอ 390 / 834 / 1440 สำหรับเคสที่ระบุ "3 จอ" · light/dark เฉพาะเคส visual

#### 2.12.1 หน้ารายการบอท + ประวัติ + เมนู

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-400 | AC-FB-83, FR-FB-51 | E | ร้านนำร่องเปิด `/settings/sales-follow-bot` · ร้านไม่นำร่องเปิดเมนูและ URL ตรง · ร้านไม่ใช่ ONLINE_SALES | นำร่อง = เห็นเมนู ข้าง `auto-notify` + หน้าโหลด · ไม่นำร่อง = ไม่เห็นเมนู + URL ตรง = หน้า "เร็ว ๆ นี้" (ไม่ใช่ 500 ไม่ใช่ข้อมูล) |
| TC-401 | AC-FB-80 | E | ว่าง · มีบอท 2 ตัว | ว่าง = "ยังไม่มีบอทติดตาม" + ปุ่ม "สร้างบอทติดตาม" · มี = ตารางชื่อ(+ตัวอย่างข้อความขั้นแรก) · ห้องที่ตาม(สถานะ+แท็ก+ช่องทาง) · ขั้นตอน "N ขั้น ภายใน …" · สถานะ ปิด/ทดสอบ/เปิดใช้ · แถวเป็นลิงก์ไปหน้าแก้ (3 จอ) |
| TC-402 | AC-FB-84 | E/R | ข้อความอธิบายหน้า · ไม่มีคำว่า "Deep" · ไม่มี emoji · ใช้ Select2 แทน select/checkbox native (ตามมติ) | หัวข้อบรรทัดเดียว + ปุ่ม ไม่มีย่อหน้ายาว · `rg` emoji/`Deep` ในไฟล์ UI ใหม่ = 0 |
| TC-403 | AC-FB-81 | E | แท็บ "ประวัติการส่ง": แถวมีลูกค้า(ลิงก์เข้าห้อง) · ช่องทาง · บอท "ขั้น n/N" · ผล+เหตุผลไทย · เวลา · เกิน 50 แถว กด "โหลดเพิ่ม" · บอทที่ถูกลบ | แสดงครบ · หน้าละ 50 · โหลดเพิ่มไม่ซ้ำ · "บอทที่ถูกลบแล้ว" (AC-FB-23) · คลิกลูกค้าเข้าห้องถูก |
| TC-404 | AC-FB-81 | E | ใส่ cursor ปลอมใน URL/ผ่าน UI (ถ้ามี) | ว่าง ไม่ล้ม ไม่ error toast |
| TC-405 | AC-FB-24, 79 | E | หน้ารายการ: บอทที่แท็กหาย | ป้ายเตือน "แท็กหาย" (ข้อความ+ไอคอน) บนแถว |
| TC-406 | AC-FB-23, 24 | E | ลบบอทที่มี run ตามอยู่ 3 ห้อง: ปุ่มลบ → Swal ยืนยันบอกจำนวนห้อง → ยกเลิก / ยืนยัน | ยกเลิก = ไม่ลบ · ยืนยัน = หายจากรายการ · ประวัติยังแสดงชื่อ "บอทที่ถูกลบแล้ว" · ห้องหยุด `BOT_DELETED` |

#### 2.12.2 ฟอร์มสร้าง/แก้

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-410 | AC-FB-01, 04 | E | สร้างบอท happy path: ชื่อ · สถานะการขาย 1 รายการ · ช่อง `chM` · 2 ขั้น → บันทึก → รีโหลดหน้า | สถานะ "ปิด" · ข้อมูลครบหลัง reload (persist จริง) · ไม่มีทางเปิดใช้ในคลิกเดียวกัน |
| TC-411 | AC-FB-02 | E | ไม่เลือกสถานะและแท็ก กดบันทึก | ไม่บันทึก · ข้อความ "เลือกสถานะหรือแท็กอย่างน้อยหนึ่งอย่าง" ผูกกับช่อง (`aria-describedby`) |
| TC-412 | AC-FB-10, 11, 13 | E | ขั้น: ข้อความว่าง · >1,000 ตัว (ตัวนับสด) · `TEXT_IMAGE` ไม่เลือกรูป · ใส่ `{สินค้า}` · ใส่ `{ชื่อ}` | แต่ละกรณีมีข้อความ error ระบุเหตุผล · `{สินค้า}` บอกชื่อตัวแปรที่ไม่รองรับ · `{ชื่อ}` ผ่าน |
| TC-413 | AC-FB-14, 12 | E | "ตัวอย่างในแชท" ขั้น `TEXT_IMAGE` มี `{ชื่อ}` | เห็นข้อความก่อนแล้วรูป · ตัวแปรถูกแทนด้วยชื่อตัวอย่าง · ตรงกับที่ส่งจริง (เทียบใน TC-134) |
| TC-414 | AC-FB-15, 16 | E | ตั้งเวลาขั้นหน่วย นาที / ชั่วโมง / วัน · รวม 6 วัน 23 ชม. พอดี · เกิน 1 นาที | รับ · เกิน = บันทึกไม่ได้ "ขั้นที่ x เกินกรอบ 7 วันของช่องทาง" |
| TC-415 | AC-FB-16 | E | ขั้นที่เวลาสะสม >23 ชม. | ป้าย "ส่งเฉพาะลูกค้าที่ทักจากโฆษณา (Messenger/IG)" ทั้งในฟอร์มและตัวอย่าง · ขั้นก่อนหน้าไม่มีป้าย · ไม่สื่อด้วยสีอย่างเดียว |
| TC-416 | AC-FB-17 | E | เพิ่มขั้นจนครบ 10 · เวลาสะสมเต็มที่ขั้นที่ 3 | ปุ่ม "เพิ่มขั้น" ล็อก **พร้อมเหตุผลเป็นข้อความใต้ปุ่ม** (ไม่ใช่จางเฉย ๆ) · ลบขั้นแล้วปลดล็อก |
| TC-417 | AC-FB-18 | E | ป้ายเวลาขั้นแรก/ถัดไป | "รอ … หลังแอดมินตอบล่าสุด" / "ถ้ายังไม่ตอบ รอต่ออีก …" |
| TC-418 | AC-FB-19, 20 | E | เลือกช่องที่ชนกับบอทอื่นที่ไม่ปิด | ช่องล็อกพร้อม "อยู่ในบอท <ชื่อ>" · บันทึกโดยเลี่ยงไม่ได้ (ต่อให้ลบ `disabled` ด้วย devtools = เซิร์ฟเวอร์ 409 แสดง error) |
| TC-419 | AC-FB-21 | E | สองหน้าต่างบราวเซอร์บันทึกบอทสองตัวที่ชนกันพร้อมกัน | สำเร็จอย่างมาก 1 · อีกหน้าขึ้น error ชน ไม่ค้าง spinner |
| TC-420 | AC-FB-06, 07 | E | เปลี่ยนสถานะเป็น "ทดสอบ": ไม่เลือกห้อง · เลือก 1 ห้อง · ค้นห้อง · เลือกเกิน 20 | ไม่เลือก = ไม่บันทึกพร้อมเหตุผล · เลือกได้เฉพาะห้องบนช่องของบอท · ค้นด้วยชื่อทำงาน · เกิน 20 = ปฏิเสธ |
| TC-421 | AC-FB-08, 04 | E | วงจรสถานะ ปิด→ทดสอบ→เปิดใช้→ปิด + toast (`pacesToast`) | แต่ละการเปลี่ยนมีผล persist (reload) · toast เป็น `pacesToast` (ไม่มี `react-toastify` ใน `(paces)/`) |
| TC-422 | API §4.4 | E | สองหน้าต่างแก้บอทเดียวกัน บันทึกทับกัน | ฝั่งหลังเจอ `BOT_STALE` ข้อความชัดเจน ไม่ทับเงียบ |
| TC-423 | AC-FB-05, 77, 78 | E | แก้ข้อความแล้วบันทึก (ห้องตามอยู่ไม่หยุด) vs เพิ่มขั้นแล้วบันทึก (เตือน/ผลหยุด) | ข้อความ = ห้องตามต่อ · เพิ่มขั้น = หยุด `BOT_EDITED` และ UI บอกจำนวนห้องที่จะหยุดก่อนยืนยัน (ถ้ามี) |
| TC-424 | AC-FB-49 (UI) | E | กดบันทึกรัว ๆ (double submit) | สร้างบอท 1 ตัว (ปุ่ม disabled ระหว่างส่ง) |

#### 2.12.3 แผงในห้อง + ชิปหัวห้อง + หยุดรายห้อง

seed ห้อง `roomM` มี run (ขั้น 1 ส่งแล้ว ขั้น 2 รอ) ผ่าน Prisma ด้วย id ที่เทสสร้าง

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-430 | AC-FB-85 | E | เปิดห้อง Messenger/IG/LINE ของร้านนำร่อง · เปิดห้อง DEEP · ร้านไม่นำร่อง | มีแถว "บอทติดตาม" ในแผงข้อมูลลูกค้า · DEEP/ไม่นำร่อง = **ไม่มีแถวเลย** |
| TC-431 | AC-FB-86, 87 | E | ห้องที่มี run: ชื่อบอท + ปุ่ม "หยุด" + รายการขั้น | "ส่งแล้ว HH:MM" (เวลาฟองจริงที่ seed ต่างจากเวลาจอง) · "อีก …" · "รอส่ง" · "กำลังส่ง" · "ข้าม · เหตุผล" ครบ · ใช้ `formatDateTime` |
| TC-432 | AC-FB-86 | E | ร้านค้างตอบ (ข้อความลูกค้าล่าสุด) ขณะอยู่ขั้นปัจจุบัน | ขั้นปัจจุบันแสดง "รอคุณตอบลูกค้า" |
| TC-433 | AC-FB-54 | E | run พัก (Meta AI/ปิดตอบอัตโนมัติ/ช่องหลุด) | แสดง `holdText` ภาษาไทยของเหตุที่พัก |
| TC-434 | AC-FB-88 | E | กด "หยุด" | แถวหายทันที (optimistic) · toast `pacesToast` สำเร็จ · reload แล้วไม่กลับมา · ห้องมีบรรทัดระบบ "บอทติดตาม “…” หยุด: หยุดโดยแอดมิน" |
| TC-435 | AC-FB-88 | E | จำลองคำขอ `stop` ล้ม (route intercept 500) | แถวเด้งกลับ + toast error |
| TC-436 | AC-FB-73 | E | กด "หยุด" ซ้ำ (เปิดสองแท็บ) | แท็บที่สองไม่ error (สำเร็จเงียบ) |
| TC-437 | AC-FB-89 (ดู §7 Q-6) | E | ผู้ที่เปิดห้องไม่ได้ (ห้องล็อกให้คนอื่น/ไม่มีสิทธิ์ตอบ) | ถ้า Deep มีแนวคิดล็อกห้อง: ปุ่มหยุดใช้ไม่ได้พร้อมเหตุผล (ไม่หาย) · ถ้าไม่มี = เคสนี้ N/A (ต้อง Explore ก่อน ux gate) |
| TC-438 | AC-FB-34, 29, 35 | E | หัวห้อง: สถานะการขายปัจจุบัน (ข้อความ+ไอคอน) · ห้อง DEEP · เมนูหัวห้องไม่มีทางแก้สถานะ · รายการห้องไม่มีแท็กสถานะการขาย | ถูกต้อง · DEEP ไม่แสดง · อ่านอย่างเดียว · ไม่ใส่สถานะเป็นแท็กในรายการ |
| TC-439 | AC-FB-90 | E | ชิป "บอทติดตามอยู่" ที่ `ThreadChipStrip` เมื่อมี run ACTIVE · run หยุด/พัก | ขึ้นเมื่อ ACTIVE · หายเมื่อหยุด · ไม่ล้นแถวชิป (เพดาน ≤2+N เดิม) |
| TC-440 | AC-FB-74 | E | ในห้องที่เปิดอยู่ ลูกค้าส่งข้อความจริงหลังฟองบอท (seed + refresh แผง) | แถวบอทหายทันที ก่อนรอบ cron ถัดไป |
| TC-441 | AC-FB-76 | E | ห้องที่มี `FOLLOW_BOT_NOTE` | บรรทัดกลางห้อง (ไม่ใช่ฟอง) · ไม่เพิ่ม badge ไม่ได้อ่านในรายการ · รายการห้องไม่เด้งขึ้นบน |
| TC-442 | AC-FB-52, 99 | E | ฟองบอทในห้อง: ป้าย "บอทติดตาม" · ฟองล้ม · พรีวิวรายการห้อง "บอทติดตาม: …" ไม่ใช่ DeepBot | ตามข้อ #8/#9 TFR-FB-18 |

#### 2.12.4 หลายจอ / การเข้าถึง (a11y) / ดีไซน์

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-445 | AC-FB-84 | E | 3 จอ 390 / 834 / 1440 × light/dark: หน้ารายการ · ฟอร์ม · ประวัติ · แผงในห้อง (บันทึก screenshot ที่ `.screenshots/…`) | ไม่ล้น/ไม่ตัด · เมนูปิดได้ · ป้ายล็อกอ่านออก · ปุ่ม tap ≥44px บนมือถือ |
| TC-446 | AC-FB-16, 34 | E | คอนทราสต์ตัวหนังสือ ≥4.5:1 (ป้าย adOnly, ป้ายแท็กหาย, error, ป้ายล็อก) light/dark · ไม่สื่อด้วยสีอย่างเดียว · `prefers-reduced-motion` | ผ่าน |
| TC-447 | AC-FB-84 | C | label ผูกกับช่องทุกช่อง (ชื่อ, ข้อความขั้น, เวลา, หน่วย) · ปุ่ม icon-only มี `aria-label` ที่มี role รองรับ · ไอคอนตกแต่ง `aria-hidden` | axe/เทส label ผ่าน |
| TC-448 | HR8 | R | `/impeccable critique` + `clarify` ก่อนปิดงาน UI · ux gate | บันทึกผลไว้ใน retro |

### 2.13 เคสลบ (Negative) — "ต้องไม่นับ/ต้องไม่ส่ง" รวมศูนย์

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-450 | AC-FB-67 | I | **reaction** (Messenger/IG/LINE) หลังฟองบอท (ขยับ `lastInboundAt` ไม่สร้างข้อความ) | ไม่ STOP `CUSTOMER_REPLIED` · ไม่เป็นร้านค้างตอบ |
| TC-451 | AC-FB-67 | I | **Messenger/IG postback** (ไม่สร้างข้อความ `channel-chat.service.ts:2741`) | ไม่นับตอบ |
| TC-452 | AC-FB-67, OD-FB-6 | I `[M-05]` | **LINE postback** สร้าง `ChatMessage` `externalMessageId='pb:<eventId>'` (BUYER) | ไม่นับเป็นลูกค้าตอบ · ไม่เปิดรอบ NOT_BOUGHT ใหม่ · ไม่ทำให้ร้านกลายเป็น "ค้างตอบ" |
| TC-453 | AC-FB-67 | I | **คลิกโฆษณา** (referral) หลังฟองบอท | ไม่นับตอบ (แต่ขยับกรอบส่งได้ตาม anchor เมื่อมีข้อความตามมา) |
| TC-454 | AC-FB-67 | I | LINE follow/unfollow | ไม่สร้างข้อความ · ไม่นับตอบ (A-9) |
| TC-455 | AC-FB-45 | I `[M-06]` | ข้อความร้าน `deliveryStatus='FAILED'` (เช่น ร้านลองส่งแล้วล้ม 3 ครั้ง) | **ไม่นับเป็นร้านตอบ** → นาฬิกาไม่ถูกรีเซ็ต · บอทไม่เลื่อน dueAt จนหลุดกรอบ |
| TC-456 | AC-FB-46, 100 | I | ฟองบอทเองและบรรทัดระบบ | ไม่นับเป็นร้านตอบ (ไม่รีเซ็ตนาฬิกาตัวเอง) · **ไม่ทำให้ข้อความลูกค้าหายจาก "ไม่ได้อ่าน"** (TC-191) |
| TC-457 | AC-FB-46 | I | คำตอบอัตโนมัติอื่น (00023 `AUTO`, 00078 `AUTO_NOTICE`) ระหว่างรอ | นับเป็นร้านตอบ → dueAt เลื่อนตาม (Q-7 ก) |
| TC-458 | AC-FB-40, FR-FB-51 | I | ห้อง `channel='DEEP'` ของร้านนำร่องที่ตรงเงื่อนไขอื่นครบ | ไม่แนบ · `GET follow-bot` ตอบ `available:false` · UI ไม่แสดงแถว |
| TC-459 | AC-FB-96 | I/A | ร้านที่ไม่อยู่ในรายชื่อนำร่อง: มีบอท ACTIVE และห้องเข้าเงื่อนไข | ไม่ส่ง · ไม่แนบ · API 403 · ไม่เห็นเมนู |
| TC-460 | AC-FB-58 | I/R | ห้องจากโฆษณา ขั้น >23 ชม.: ส่งผ่านเส้นทางปกติ ไม่ใช้ HUMAN_AGENT | ส่งได้เมื่อกรอบโฆษณาเปิด · payload ไม่มี `humanAgent`/`tag` |
| TC-461 | AC-FB-48, 69 | I | **ห้องที่ไม่ใช่โฆษณา** (Messenger ไม่มี anchor/LINE) ถึงขั้นที่ dueAt เกิน 24 ชม. | STOP `WINDOW_CLOSED` ไม่ส่ง (ไม่ใช้ HUMAN_AGENT ช่วย) |
| TC-462 | AC-FB-48 | I | ห้องจากโฆษณา ขั้นที่ dueAt = anchor+166h (ส่งได้) / anchor+167h (ปิด) | ส่ง / STOP `WINDOW_CLOSED` |
| TC-463 | AC-FB-54, 55 | I | ห้อง Meta AI ถืออยู่ → พัก ไม่หยุด · Meta ปฏิเสธเพราะแอปอื่นคุม | HOLD `META_AI_HOLDING` เมื่อ AI ปล่อยกลับส่งต่อ · "แอปอื่นคุม" = SKIPPED `OTHER_APP_CONTROLS` ไม่ลองซ้ำ |
| TC-464 | AC-FB-57 | I | LINE โควตาเต็ม · LINE โควตาอ่านไม่ได้ (TD-006) | เต็ม = SKIPPED `LINE_QUOTA_FULL` · อ่านไม่ได้ = ไม่บล็อก ให้ตัวยิงตัดสิน |
| TC-465 | AC-FB-59 | I | ห้องที่ 00078 ส่ง AUTO_NOTICE ครบเพดานต่อห้องต่อวันแล้ว | บอทติดตามยังส่งได้ · ไม่เรียก/ไม่เพิ่ม `AutoNotifyLedger` (spy + grep) |
| TC-466 | AC-FB-56 | I | ห้องที่ร้านปิดตอบอัตโนมัติ (`autoReplyEnabled=false`) | HOLD `AUTO_REPLY_OFF` ไม่ส่ง ไม่หยุด |
| TC-467 | AC-FB-63 | I | ช่องทางเพจหลุด (`status≠ACTIVE`) ระหว่างรอ | HOLD ไม่ข้ามขั้น |
| TC-468 | AC-FB-97 | I | ถอนร้านนำร่องระหว่างมี run | ไม่ยิง · หยุดเองเมื่อเลยกรอบ |

---

## 3. Traceability Matrix

AC ทุกข้อของ P1 ใน [[BRD]] (AC-FB-01..100 + 48a) มีอย่างน้อย 1 TC · AC ที่ไม่เกิดใน P1 ระบุ N/A พร้อมเหตุผล

| AC | Test Case | ครอบคลุม |
|---|---|---|
| AC-FB-01 | TC-070, 072, 150, 310, 311, 410 | Yes |
| AC-FB-02 | TC-071, 311, 411 | Yes |
| AC-FB-03 | TC-312, 341 | Yes |
| AC-FB-04 | TC-310, 322, 410, 421 | Yes |
| AC-FB-05 | TC-184, 317, 423 | Yes |
| AC-FB-06 | TC-322, 420 | Yes |
| AC-FB-07 | TC-154, 420 | Yes |
| AC-FB-08 | TC-155, 322, 421 | Yes (ความหมายตามต้นแบบ — §7 Q-3) |
| AC-FB-09 | TC-097, 156 | Yes |
| AC-FB-10 | TC-073, 412 | Yes |
| AC-FB-11 | TC-074, 311, 412 | Yes |
| AC-FB-12 | TC-082, 134, 413 | Yes |
| AC-FB-13 | TC-075, 109, 412 | Yes |
| AC-FB-14 | TC-082, 413 | Yes |
| AC-FB-15 | TC-076, 079, 414 | Yes |
| AC-FB-16 | TC-077, 078, 414, 415, 446 | Yes |
| AC-FB-17 | TC-080, 416 | Yes |
| AC-FB-18 | TC-081, 417 | Yes |
| AC-FB-19 | TC-085, 086, 314, 319, 323, 418 | Yes |
| AC-FB-20 | TC-088, 418 | Yes |
| AC-FB-21 | TC-127, 323, 419 | Yes |
| AC-FB-22 | TC-087, 100 | Yes |
| AC-FB-23 | TC-185, 320, 328, 403, 406 | Yes |
| AC-FB-24 | TC-320, 321, 405, 406 | Yes |
| AC-FB-25 | TC-001, 014 | Yes |
| AC-FB-26 | TC-011, 012 | Yes |
| AC-FB-27 | TC-002..010, 042 | Yes |
| AC-FB-28 | TC-003, 013 | Yes |
| AC-FB-29 | TC-438 | Yes |
| AC-FB-30 | TC-022, 027 | Yes |
| AC-FB-31 | TC-023, 027 | Yes |
| AC-FB-32 | TC-022, 026, 032 | Yes |
| AC-FB-33 | TC-020, 021, 024, 025 | Yes |
| AC-FB-34 | TC-438, 446 | Yes |
| AC-FB-35 | TC-438 | Yes |
| AC-FB-36 | TC-095, 096, 150, 151, 159, 160 | Yes (ขยายเป็น "กรอบส่งเปิด" ตาม SRS §7.4 ข้อ 1) |
| AC-FB-37 | TC-122, 126 | Yes |
| AC-FB-38 | TC-123, 158 | Yes |
| AC-FB-39 | TC-098, 157 | Yes |
| AC-FB-40 | TC-152, 458 | Yes |
| AC-FB-41 | TC-153 | Yes |
| AC-FB-42 | TC-049 | Yes |
| AC-FB-43 | TC-049, 130 | Yes |
| AC-FB-44 | TC-034, 048 | Yes |
| AC-FB-45 | TC-031, 455 | Yes |
| AC-FB-46 | TC-031, 456, 457 | Yes |
| AC-FB-47 | TC-033 | Yes |
| AC-FB-48 | TC-055..060, 175, 181, 462 | Yes |
| AC-FB-48a | TC-105, 181 | Yes |
| AC-FB-49 | TC-125, 424 | Yes |
| AC-FB-50 | TC-130, 132 | Yes |
| AC-FB-51 | TC-131 | Yes |
| AC-FB-52 | TC-190, 192, 201..203, 442 | Yes |
| AC-FB-53 | TC-133 | Yes |
| AC-FB-54 | TC-043, 141, 433, 463 | Yes |
| AC-FB-55 | TC-105, 463 | Yes |
| AC-FB-56 | TC-043, 466 | Yes |
| AC-FB-57 | TC-464 | Yes |
| AC-FB-58 | TC-061, 133, 460 | Yes |
| AC-FB-59 | TC-465 | Yes |
| AC-FB-60 | TC-108, 135 | Yes |
| AC-FB-61 | TC-051, 135, 136 | Yes |
| AC-FB-62 | TC-105, 137 | Yes |
| AC-FB-63 | TC-138, 467 | Yes |
| AC-FB-64 | TC-040, 170 | Yes |
| AC-FB-65 | TC-040, 099, 171 | Yes |
| AC-FB-66 | TC-040, 172 | Yes |
| AC-FB-67 | TC-030, 035, 036, 173, 450..454 | Yes |
| AC-FB-68 | TC-050, 174 | Yes |
| AC-FB-69 | TC-046, 047, 055, 175, 461 | Yes |
| AC-FB-70 | TC-040, 176 | Yes |
| AC-FB-71 | TC-040, 177 | Yes |
| AC-FB-72 | TC-139, 178 | Yes |
| AC-FB-73 | TC-179, 331, 436 | Yes |
| AC-FB-74 | TC-187, 440 | Yes |
| AC-FB-75 | TC-140, 180 | Yes |
| AC-FB-76 | TC-037, 180, 212, 213, 441 | Yes |
| AC-FB-77 | TC-183, 317, 423 | Yes |
| AC-FB-78 | TC-184, 317, 423 | Yes |
| AC-FB-79 | TC-186, 405 | Yes |
| AC-FB-80 | TC-315, 401 | Yes |
| AC-FB-81 | TC-326, 327, 328, 403, 404 | Yes |
| AC-FB-82 | TC-334 | **N/A ในส่วน "หน้าอ่านอย่างเดียว"** — ตาม SRS TFR-FB-19 / §7.4 ข้อ 3 และมติ Q-11 (ข): ผู้มีสิทธิ์ตอบแชทแก้ได้ทุกอย่าง ผู้ไม่มี H2 ไม่เห็นหน้า → ไม่มีผู้ใช้กลุ่ม "เห็นแบบอ่านอย่างเดียว" ใน P1 · ส่วน "เข้า URL สร้าง/แก้ตรง = ปฏิเสธฝั่งเซิร์ฟเวอร์" ครอบด้วย TC-302, 334 |
| AC-FB-83 | TC-303, 304, 400, 459 | Yes |
| AC-FB-84 | TC-402, 445, 447 | Yes |
| AC-FB-85 | TC-329, 430 | Yes |
| AC-FB-86 | TC-329, 330, 431, 432 | Yes |
| AC-FB-87 | TC-051, 330, 431 | Yes |
| AC-FB-88 | TC-331, 434, 435 | Yes |
| AC-FB-89 | TC-437 | **ค้าง/ไม่ชัด** — SRS TFR-FB-20 บอกว่า Deep อาจไม่มีแนวคิด "ล็อกห้องให้คนอื่น" ที่ตรวจได้ ต้อง Explore ก่อน ux gate ถ้าไม่มี AC นี้ว่างเปล่า → ยังเขียนเคสไว้แบบมีเงื่อนไข (§7 Q-6) |
| AC-FB-90 | TC-439 | Yes |
| AC-FB-91 | — | **N/A (P2)** — ป้ายกระพริบในรายการห้อง ไม่ทำใน P1 (SRS TFR-FB-20) |
| AC-FB-92 | TC-300, 306 | Yes |
| AC-FB-93 | TC-301, 302 | Yes |
| AC-FB-94 | TC-340..346 | Yes |
| AC-FB-95 | TC-305 | Yes |
| AC-FB-96 | TC-065, 145, 303, 459 | Yes |
| AC-FB-97 | TC-144, 468 | Yes |
| AC-FB-98 | TC-065, 066, 067 | Yes |
| AC-FB-99 | TC-192, 200..217 | Yes |
| AC-FB-100 | TC-191, 200, 456 | Yes |
| AC-FB-101..105 | — | **N/A (P2)** — การ์ดสินค้า/ข้อความที่ใช้บ่อย/ปุ่ม/บอทเฉพาะกลุ่ม/แนบมือ ไม่อยู่ใน P1 (BRD FR-FB-60/61 · SRS §1.2) · หมายเหตุ AC-FB-103 ต้องมีทางรับ LINE/Meta postback เป็นข้อความจริงก่อน — ความต่างนี้ถูกกันไว้แล้วใน TC-452 |

**ตาราง trace FR/TFR → TC (เสริม)**

| TFR | TC |
|---|---|
| TFR-FB-01 | TC-001..014 |
| TFR-FB-02 | TC-020..027 |
| TFR-FB-03 | TC-030..037 |
| TFR-FB-04 | TC-070..082, 107, 311 |
| TFR-FB-05 | TC-085..088, 127, 314 |
| TFR-FB-06 | TC-154, 155, 322 |
| TFR-FB-07 | TC-183..186 |
| TFR-FB-08 | TC-065..067, 144, 145 |
| TFR-FB-09 | TC-142, 143, 146, 307 |
| TFR-FB-10 | TC-095..100, 150..161 |
| TFR-FB-11, 12 | TC-040..051 |
| TFR-FB-13 | TC-055..061, 181 |
| TFR-FB-14 | TC-125, 130..139 |
| TFR-FB-15 | TC-061, 463..466 |
| TFR-FB-16 | TC-137 |
| TFR-FB-17 | TC-140, 180, 212, 213 |
| TFR-FB-18 | TC-190..192, 200..217 |
| TFR-FB-19 | TC-326..328, 400..406 |
| TFR-FB-20 | TC-329..331, 430..442 |
| TFR-FB-21 | TC-300..306, 340..346 |
| TFR-FB-22 | TC-505 |
| TFR-FB-23 | TC-500, 506 |

---

## 4. Flow (ลำดับตัดสินที่เทสต้องครอบ)

```mermaid
flowchart TD
    S([tick: ต่อ 1 run ACTIVE]) --> D1{1 stage/stamp เปลี่ยน<br/>หรือไม่อยู่ในสถานะของบอท}
    D1 -- ใช่ --> X1[STOP STAGE_CHANGED<br/>TC-040 TC-170]
    D1 -- ไม่ --> D2{2 แท็กไม่ผ่าน ANY/ALL<br/>หรือไม่เหลือเงื่อนไข}
    D2 -- ใช่ --> X2[STOP TAG_REMOVED<br/>TC-171]
    D2 -- ไม่ --> D3{3 บอทปิด หรือ structureRev ไม่ตรง}
    D3 -- ใช่ --> X3[STOP BOT_DISABLED / BOT_EDITED<br/>TC-172 TC-183]
    D3 -- ไม่ --> D4{4 ลูกค้าตอบจริงหลังฟองบอท}
    D4 -- ใช่ --> X4[STOP CUSTOMER_REPLIED<br/>TC-173 TC-450..454]
    D4 -- ไม่ --> D5{5 ครบขั้น}
    D5 -- ใช่ --> X5[DONE<br/>TC-174]
    D5 -- ไม่ --> D6{6 กรอบส่งปิด<br/>หรือ dueAt >= expiresAt}
    D6 -- ใช่ --> X6[STOP WINDOW_CLOSED<br/>TC-046 TC-175 TC-461]
    D6 -- ไม่ --> D7{7-9 ไม่สนใจ / นอกขอบเขต / ถูกบล็อก}
    D7 -- ใช่ --> X7[STOP NOT_INTERESTED / OUT_OF_SCOPE / CONTACT_BLOCKED<br/>TC-176..178]
    D7 -- ไม่ --> D8{10-13 ร้านไม่นำร่อง / Meta AI /<br/>ปิดตอบอัตโนมัติ / ช่องไม่ ACTIVE}
    D8 -- ใช่ --> H1[HOLD ไม่ข้ามขั้น<br/>TC-043 TC-138 TC-463 TC-466]
    D8 -- ไม่ --> D9{14 ร้านค้างตอบ}
    D9 -- ใช่ --> W1[WAIT dueAt=null<br/>TC-048]
    D9 -- ไม่ --> D10{15 dueAt เกิน now}
    D10 -- ใช่ --> W2[WAIT dueAt<br/>TC-049]
    D10 -- ไม่ --> SEND[16 SEND: claim → ตรวจซ้ำ → COMMIT → ยิง → ปิดผล<br/>TC-125 TC-130 TC-131 TC-135]
```

```mermaid
sequenceDiagram
    participant T1 as tick A
    participant T2 as tick B
    participant DB as Postgres localhost:5434
    participant O as outbox (mock)
    T1->>DB: INSERT Send(runId,step) ON CONFLICT DO NOTHING
    T2->>DB: INSERT Send(runId,step) ON CONFLICT DO NOTHING
    DB-->>T1: แถวใหม่
    DB-->>T2: ไม่ได้แถว (ข้าม)
    T1->>DB: COMMIT
    T1->>O: enqueueOutbound AUTO_FOLLOW ครั้งเดียว
    Note over T1,O: TC-125 คาด ChatMessage 1 ฟอง · M-16 ต้องแดง
```

---

## 5. เคสกำกับรอบ rollout/สคริปต์/review (R)

| TC | อ้างอิง | ระดับ | เคส | ผลที่คาด |
|---|---|---|---|---|
| TC-500 | BR-FB-82, TFR-FB-23 | R/I | `scripts/sales-follow-bot-preflight.ts` (dry-run อย่างเดียว ไม่มี `--apply`): นับ (ก) ห้อง/ร้านที่เข้าเงื่อนไขทันที (ข) ห้องที่ลูกค้าตอบไปแล้วในอดีต (ค) ออเดอร์ที่ไม่พบ stamp (ง) ออเดอร์นอกห้องของลูกค้าที่มี Messenger/IG contact (R-FB-3) | ตัวเลขตรงกับ seed บนฐานเทส · สคริปต์ไม่เขียนฐาน (ตรวจด้วยจำนวนแถวก่อน/หลัง) · ไม่มี flag `--apply` |
| TC-501 | บทเรียน #5 | I | stamp ที่เก็บ `timestamptz(3)` · เทียบ stamp ตอนแนบกับตอนตรวจ | ไม่เห็น "stamp เปลี่ยน" เองทุกรอบ (ไม่หยุดผิดด้วย `STAGE_CHANGED`) · ห้ามเทียบ `Date` กับ `now()` ไมโครวินาที |
| TC-502 | บทเรียน #6 | I | เขียน `steps` jsonb ผ่าน Prisma แล้วอ่านกลับด้วย `steps->0->>'text'` | ไม่เป็น NULL · ทุก key ครบ |
| TC-503 | บทเรียน #11, TD-FB-007 | R | `rg "use server"` ในไฟล์ฟีเจอร์ 00095 · `next build` exit code | 0 ผลลัพธ์ · exit 0 (ตัดสินด้วย exit code) |
| TC-504 | บทเรียน #12, NFR-FB-01 | I | นับ query ต่อ tick ที่ 10 / 100 / 200 ห้อง (spy Prisma) | จำนวน query ไม่โตเชิงเส้นตามจำนวนห้อง (โหลดเป็นชุด) |
| TC-505 | TFR-FB-22 | R | ไม่มีดัชนีใหม่บน `ChatMessage` ใน migration · มีบันทึกผล `EXPLAIN (ANALYZE, BUFFERS)` 3 ตัว (Q1 ออเดอร์ล่าสุด · Q2 ข้อเท็จจริงข้อความ · Q3 ผู้สมัครแนบ) บน prod แบบอ่านอย่างเดียว ก่อนเปิดร้านที่ 2 | grep migration ไม่พบ `CREATE INDEX ... "ChatMessage"` · มีเอกสารผลวัด (เกณฑ์ tick เฉลี่ย ≤10 วิ ที่ 200 ห้อง — เป็นเป้า) |
| TC-506 | BR-FB-81, 84, TFR-FB-08 | R/I | `scripts/sales-follow-bot-close-shop.ts`: dry-run เป็นค่าตั้งต้น · `--apply` ต้องยืนยัน · ปิดบอททุกตัวของร้านที่ระบุ | dry-run ไม่เขียน · `--apply` ตั้ง `CLOSED` เฉพาะร้านนั้น (scope ด้วย shopId) · tick ถัดไป STOP `BOT_DISABLED` ทุก run |
| TC-507 | BR-FB-85, HR11 | R | `diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/00095 - Sales Follow Bot/")` เทียบชื่อไฟล์ · `docs/SRS.md` sync (data model, enum `AUTO_FOLLOW`/`FOLLOW_BOT_NOTE`, capability, route, API) | ไม่ขาดชื่อไฟล์ใด (ต้องมี DATABASE.md ก่อนเขียนโค้ด S-3) · SRS หลัก sync ครบ |
| TC-508 | CI gate | R | ด่านครบก่อน push: `.claude/hooks/theme-guard.sh` · `vitest run src/` · `vitest run tests/` (ปักหมุด 5434) · `tsc --incremental false` · `next build` exit 0 · `rg "react-toastify" "src/app/(paces)/"` = 0 · grep emoji = 0 · grep `Base: theme/...` ใน commit UI | เขียวทั้งหมด |

---

## 6. ผลล่าสุด

| Run | วันที่ | ผล (Pass/Fail/Blocked) | ผู้ทดสอบ (Tester) |
|-----|--------|--------------------------|---------------------|
| 1 | — | ยังไม่รัน (เอกสารร่าง ยังไม่มีโค้ด) | — |

---

## 7. สรุป (Summary) และ Open Questions

เอกสาร Test Case นี้กำหนดชุดเคสของบอทติดตามยอดขาย P1 ที่ trace กลับ AC-FB-01..100 + 48a ทุกข้อ (ยกเว้น N/A ที่ระบุเหตุผลในตาราง §3) · ครอบทั้ง unit (ตารางสถานะ/ข้อความ/ลำดับตัดสิน/กรอบส่ง+anchor/ตัวตรวจฟอร์ม/ชนช่อง), integration DB (unique กันซ้ำ, แข่งกัน 2 tick = 1 ฟอง, ON CONFLICT, ข้ามร้าน, CHECK), API (ทุก error code §5), E2E Playwright (หน้าบอท ฟอร์ม ประวัติ แผงในห้อง หยุดรายห้อง) และ mutation 35 รายการที่ต้องแดง

**Open Questions / AC ที่ครอบไม่ได้หรือไม่ชัด:**

- **Q-1 (TC-009)** `ShippingStageKey` มีค่า `DRAFT` (feature 00061) ที่ตาราง SRS TFR-FB-01 ไม่ได้ระบุผลลัพธ์ · ตัวเลือก E กรอง `status<>'DRAFTED'` ออกแล้วจึงน่าจะไม่เกิด แต่ `Record<ShippingStageKey, …>` ต้องมีค่า — ขอให้ SA ระบุว่า `DRAFT` ให้ผลอะไร (เสนอ: ถือไม่เกิด/`BILLED` พร้อม `console.warn`)
- **Q-2 (TC-012)** BRD AC-FB-26 เขียน "ออเดอร์ที่นับได้ล่าสุด" แต่ SRS ปักให้ E รวมใบ `CANCELLED` (ยึดใบล่าสุดที่ไม่ใช่ร่าง/ทดสอบ) และ §7.4 ข้อ 5 ให้ BRD ปรับถ้อยคำ — เทสเขียนตาม SRS · ถ้าผู้ตัดสินเลือกตาม BRD เดิม (ข้ามใบที่ไม่นับ) TC-011/012 ต้องกลับผล
- **Q-3 (TC-155)** AC-FB-08 ข้อความ "เปลี่ยนจากทดสอบเป็น…" กำกวม · เทสตามการตีความของ SRS TFR-FB-06 (CLOSED→`BOT_DISABLED`, TESTING+ห้องไม่อยู่ทดสอบ→`OUT_OF_SCOPE`) — รอยืนยัน
- **Q-4 (TC-322)** 21 ห้องทดสอบ: API §5 ไม่มี `TEST_ROOMS_TOO_MANY` แต่ SDS §7 มี — ต้องให้ SA เลือกรหัสเดียว
- **Q-5 (AC-FB-82)** ส่วน "ผู้ไม่มีสิทธิ์แก้เห็นแบบอ่านอย่างเดียว" **N/A ใน P1** ตาม SRS · BRD ยังไม่ปรับถ้อยคำ AC (ต้องแก้ BRD ให้ตรง ไม่งั้นช่องโหว่ในตาราง trace)
- **Q-6 (AC-FB-89)** ยังไม่พิสูจน์ว่า Deep มีแนวคิด "ห้องล็อกให้คนอื่น" ที่ตรวจได้ (SRS บอกต้อง Explore) — TC-437 มีเงื่อนไข · ถ้าไม่มี AC นี้ควรถอด/ปรับ
- **Q-7 (TC-304)** รหัส/สถานะที่ `requireOnlineSalesVertical` คืนจริง ยังไม่ยืนยัน (API Open Q-ก) · เคสใช้ 409 `NOT_AVAILABLE_FOR_SHOP` ตาม API ฉบับร่าง
- **Q-8 (AC-FB-14, 20, 34, 84–90 ด้านภาพ)** เคส E2E ภาพ/คอนทราสต์/ไอคอนพึ่ง UI ที่ ux gate ยังไม่ออกแบบ — ตัวเคสบอกพฤติกรรมที่ต้องพิสูจน์ ไม่ผูกตำแหน่ง/ชื่อคลาสจนกว่า S-7 เสร็จ
- **Q-9 (TC-137, 138)** ต้องดูตัวจำแนก "another app is controlling" จริงใน `chat-send-failure.ts` (SRS ระบุ "ต้อง Explore") — เคสใช้ข้อความ error ดิบจากตัวยิงเป็นอินพุต
- **Q-10 (TC-058, 059)** ตัวคำนวณ anchor เป็นไฟล์ของงานแก้บั๊กอีกตัว (`ad-window.service.ts`) — ถ้าลายเซ็น/ตัวเลขเปลี่ยน (เช่น `LOOKBACK_MS` 8 วัน, หน้าต่างข้อความ −2 นาที/+24 ชม.) เคส TC-056..060 ต้องปรับตาม

**จำนวนเคส:** ดู §8 (นับจากไฟล์นี้)

---

## 8. สรุปจำนวนเคสต่อระดับ

| ระดับ | ช่วงเลข | จำนวน TC |
|---|---|---|
| Unit / Component (pure: stage, stamp, message-defs, decideRun, window+anchor, gate, schema, conflicts, attach, mapFollowFailure) | TC-001..109 | 80 |
| Integration DB (unique/ON CONFLICT/แข่ง 2 tick/CHECK/engine/attach/หยุด/ข้ามร้าน) — ปักหมุด localhost:5434 | TC-120..192 | 58 |
| จุดอ่านป้าย `AUTO_FOLLOW` / `FOLLOW_BOT_NOTE` (TFR-FB-18) | TC-200..217 | 18 |
| API (ทุก error code API §5 + ข้ามร้านต่อ endpoint) | TC-300..346 | 41 |
| E2E Playwright (`e2e/sales-follow-bot.spec.ts`) | TC-400..448 | 39 |
| เคสลบรวมศูนย์ (reaction/postback/โฆษณา/FAILED/DEEP/ไม่นำร่อง/HUMAN_AGENT/กรอบ) | TC-450..468 | 19 |
| Rollout / script / review gate | TC-500..508 | 9 |
| **รวม** | | **264** |
| Mutation ที่ต้องแดง | M-01..M-34, M-36 | 35 |

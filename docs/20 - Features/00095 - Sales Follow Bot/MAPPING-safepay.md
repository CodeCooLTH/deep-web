# 00095 บอทติดตามยอดขาย — แผนที่ "ของเทียบ" ฝั่ง safepay

> อ่านจากโค้ด origin/main ที่ `8d7eec337` (worktree `safepay-00095`) เมื่อ 2026-11-16 · อ่านอย่างเดียว ไม่ได้รัน DB/เทส
> คู่กับ `REFERENCE-gochat-v3-by-session.md` (ของต้นทาง) — ไฟล์นี้ตอบว่า "ฝั่งเรามีอะไรแล้ว ใช้ต่อได้แค่ไหน ขาดอะไร"
> ชื่อ model/column ทุกตัวเปิดดูจาก `prisma/schema.prisma` แล้ว · path:line อ้างจาก commit ข้างบน

---

## สรุปเร็ว

| เรื่อง | ฝั่ง safepay | ใช้ต่อได้ |
|---|---|---|
| แท็กร้าน | `ExternalContact.tags String[]` + กติกา `ShopTag` | ได้ แต่ผูก **ผู้ติดต่อ** ไม่ใช่ห้อง และห้อง DEEP ไม่มีแท็ก |
| แท็กสถานะ 7 ขั้น | **ไม่มี** · มีแค่ `salesStatus` 3 ค่า + ขั้นออเดอร์ที่ **คำนวณ** (`order-stage.ts`) | ต้องตัดสินใจใหม่ (ข้อ 6) |
| ลูกค้าตอบ / ร้านค้างตอบ | `lastInboundAt` / `lastSenderRole` + `classifyRoom` ของโต๊ะแชท | ได้เป็นด่านถูก ๆ · ต้องระวังค่าที่ขยับจาก reaction/postback |
| ตัวส่ง | `enqueueOutbound` → คิว outbox (กันยิงซ้ำ) + `autoReplyKind` ติดป้ายว่าระบบส่ง | ได้เต็ม — 00078 ใช้แบบนี้อยู่แล้ว |
| เกิน 24 ชม. Meta | บอท **ห้าม** ใช้ HUMAN_AGENT (บังคับในโค้ด) · ไม่มี Utility template | ขั้นเกิน 24 ชม. บน Messenger/IG = ทำไม่ได้ตอนนี้ |
| ตัวรันตามเวลา | Vercel cron 19 ตัว · มีรอบทุกนาที (`chat-outbox`, `meta-capi`) | เกาะ cron ใหม่ทุก 1 นาทีได้ |
| ฐานที่ใกล้ที่สุด | **00078 แจ้งลูกค้าอัตโนมัติ** (ledger + claim + revalidate + outbox) | ยกโครงมาได้เกือบทั้งก้อน |

---

## 1. แท็ก (00083) และ "สถานะการขาย"

**มีอยู่แล้ว**
- แท็กจริงของห้องเก็บเป็นชื่อในอาร์เรย์ `ExternalContact.tags String[]` (`prisma/schema.prisma:2034`) — **ไม่มี FK ไปตารางแท็ก** (คอมเมนต์ `prisma/schema.prisma:5484-5487`)
- `ShopTag` (`prisma/schema.prisma:5488-5501`) = "กติกาต่อชื่อแท็ก": `name`, `nameKey` (unique ต่อร้าน), `keywords String[]`, `removeOnOrderCreate Boolean`
- `ShopTagEvent` (`prisma/schema.prisma:5507-5524`) = ประวัติติด/ถอดแบบ append-only · `action` ADD/REMOVE · `source` KEYWORD/ORDER_CREATED (DB CHECK, คอมเมนต์ `:5504-5506`)
- ติดอัตโนมัติ: `applyKeywordTags` (`src/services/shop-tag-auto.service.ts:22-96`) — **จับคำจากข้อความฝั่งร้าน (`senderRole='SHOP'`) เท่านั้น** (`:31`) ไม่ใช่ข้อความลูกค้า · ข้ามข้อความบอท (`:33`) · ติดด้วย `updateMany(NOT has, push)` อะตอมมิก (`:74-78`)
  - จุดเรียก: echo จาก Meta (`src/app/api/channels/facebook/webhook/route.ts:401` รวม standby), แชท DEEP (`src/services/chat.service.ts:1032`), คิวขาออก (`src/services/chat-outbox.service.ts:368`)
- ถอดเมื่อมีออเดอร์: `removeTagsOnOrderCreated` (`src/services/shop-tag-auto.service.ts:98-144`) — เรียกจาก `createOrder` (`src/services/order.service.ts:891`) และตอนร่างกลายเป็นออเดอร์ (`:1141`)
- แก้แท็กมือ: `updateConversationCrm` (`src/services/chat-crm.service.ts:81-120`) ผ่าน `PATCH /api/chat/conversations/[id]/crm` (H2, `src/lib/route-capabilities.ts:247`)
- "สถานะการขาย" ที่มี = `ExternalContact.salesStatus` 3 ค่า `UNSPECIFIED | INTERESTED | NOT_INTERESTED` (`prisma/schema.prisma:2033`, type `src/services/chat-crm.service.ts:10`) · ตั้งจากเมนูคลิกขวา (`src/app/(paces)/seller/(chat)/inbox/components/ChatContextMenu.tsx:247-255`) และแผงลูกค้า (`.../[conversationId]/components/CustomerCrmSection.tsx:36-43`)
- กลุ่ม/แท็บห้อง `Conversation.chatGroupId` → `ChatGroup` (`prisma/schema.prisma:2111`, `:2240-2252`) — ร้านจัดเอง ไม่ใช่สถานะ

**ใช้ต่อได้แค่ไหน**
- เงื่อนไข "ห้องมีแท็ก X / any / all" → ใช้ `ExternalContact.tags` ได้ทันที (Postgres `@>`/`&&` บน array)
- `NOT_INTERESTED` = ตัวเทียบตรงของ stop reason `not_interested` ใน gochat

**ขาดอะไร**
- แท็กผูก **ผู้ติดต่อต่อเพจ** (`@@unique([shopChannelId, externalUserId])` `prisma/schema.prisma:2050`) ซึ่ง = 1 ห้องต่อผู้ติดต่อ (`:2173`) จึงใช้แทน "แท็กห้อง" ได้ แต่ **ห้อง DEEP ไม่มี `externalContactId` = ไม่มีแท็กเลย**
- แก้แท็กมือเขียน **ทั้งอาร์เรย์ทับ** (`src/services/chat-crm.service.ts:99`) และ **ไม่เขียน `ShopTagEvent`** (ดู `:112-115` ทำแค่ CAPI) ⇒ "แท็กถูกเอาออก" ต้องตัดสินจาก **สถานะปัจจุบันทุกรอบ** ห้ามพึ่ง event log · ไม่มี "เวลาที่ติดแท็ก" ให้เทียบ (gochat ใช้ `stage_tagged_at`)
- ไม่มีแนวคิดแท็กระบบ (`system_key`) / pipeline / lead stage — 7 ขั้นของ gochat ไม่มีตัวเทียบที่เก็บไว้ (ดูข้อ 6)

---

## 2. ห้องแชท / ข้อความ / "ลูกค้าตอบ"

**มีอยู่แล้ว**
- ห้อง: `Conversation` (`prisma/schema.prisma:2055-2211`) · ช่องทาง `channel` DEEP/MESSENGER/INSTAGRAM/LINE (`:2075` + คอมเมนต์ `:2071-2073`)
- คอลัมน์สรุปของห้องที่ใช้เป็นด่านถูก ๆ ได้:
  - `lastInboundAt` = ลูกค้าส่งล่าสุด ฐานของหน้าต่าง 24 ชม. (`:2078`) · มี index `[shopId, lastInboundAt]` (`:2183`)
  - `lastSenderRole` BUYER/SHOP (`:2063`) · `shopLastReadAt` (`:2067`)
  - `resolvedAt` (`:2089`) · `isSpam` (`:2093`) · `isHidden`
- ข้อความ: `ChatMessage` (`prisma/schema.prisma:2257`) · ทิศทาง = `senderRole` BUYER/SHOP (`:2262`) · ชนิด `type` (`:2264`)
- ป้าย "ใครส่ง": `ChatMessage.autoReplyKind` (`:2386`) — `null` = คน · `AUTO`/`AUTO_TEST` = บอทตอบ · `AUTO_NOTICE` = แจ้งเตือน 00078 (type `src/lib/auto-reply-constants.ts:126-129`) · ไม่มี DB CHECK บนคอลัมน์นี้ (คอมเมนต์ schema `:2385`)
- "พนักงานตอบ" นิยามไว้แล้ว = `senderRole='SHOP' AND autoReplyKind IS NULL AND senderUserId IS NOT NULL` (`src/lib/agent-performance.ts:14`, `HUMAN_AGENT_REPLY_WHERE` `:85`)
- "ลูกค้ารอ": `classifyRoom` ของโต๊ะแชท 00077 (`src/lib/chat-desk/rules.ts:24-36`) — WAITING = `lastSenderRole='BUYER'` ภายใน 7 วัน (`AWAITING_WINDOW_DAYS` `src/lib/chat-desk/constants.ts:6`) · ตัด resolved/hidden/spam · SQL จริงที่ `src/services/chat-desk.service.ts:117-203`
- unread: `unreadConversationIdsForShop` (`src/services/chat.service.ts:478-`) นิยามเดียวกับ badge
- ข้อความภายใน (ลูกค้าไม่เห็น ไม่ดันห้อง): การ์ด 00061 `type='AUTO_ORDER_RESULT'` (`src/lib/auto-order-message-type.ts:8`) เขียนตรงด้วย prisma ไม่ผ่านตัวส่ง และ **ไม่แตะ `lastMessageAt`/`lastSenderRole`** (`src/services/auto-order-internal-message.service.ts:1-40`) = ต้นแบบของ "บรรทัดระบบ: บอทหยุดเพราะ…"

**ใช้ต่อได้แค่ไหน**
- "ร้านค้างตอบ" (บอทไม่นับเวลา) → `lastSenderRole='BUYER'` ใช้ได้ทันที
- "ร้านตอบล่าสุด (ไม่นับบอท)" → ต้อง query `ChatMessage` ด้วย `senderRole='SHOP' AND autoReplyKind IS NULL` (ไม่มีคอลัมน์สรุปแบบ `last_agent_reply_at` ของ gochat)

**ขาดอะไร / กับดัก**
- `lastInboundAt` **ขยับจากสิ่งที่ไม่ใช่ข้อความ** ด้วย: reaction ของลูกค้า (`src/services/channel-chat.service.ts:2712-2722`), การคลิกโฆษณา/referral (`:2632-2642`), postback ปุ่ม (`ingestPostbackEvent` `:2745-` ไม่สร้าง ChatMessage) ⇒ ใช้ `lastInboundAt > เวลาฟองบอท` ตัดสิน "ลูกค้าตอบ" จะหยุดบอทเมื่อลูกค้ากดหัวใจ/กดปุ่ม — ถ้าต้องการนิยาม "ข้อความจริง" ต้องนับจาก `ChatMessage.senderRole='BUYER'` แทน
- echo ของข้อความที่ร้านพิมพ์ใน Business Suite / Meta AI เข้ามาเป็น `senderRole='SHOP'`, `autoReplyKind=null` ⇒ นับเป็น "ร้านตอบ" (ถูกต้องสำหรับคนพิมพ์ แต่ข้อความของ Meta AI ต้องแยกด้วย `echoAiGenerated` `prisma/schema.prisma:2391`)
- ไม่มีคอลัมน์ "ระบบ" (sender_type system) สำหรับบรรทัดระบบ — ต้องใช้แนวเดียวกับการ์ด 00061 (type เฉพาะ + insert ตรง)

---

## 3. การส่งข้อความออกแต่ละช่องทาง

**มีอยู่แล้ว**
- ตัวส่งกลาง `sendOutboundMessage(params: SendOutboundParams)` (`src/services/channel-chat.service.ts:4236`) · พารามิเตอร์ `:2941-3030`: `systemShopId` + `autoReplyKind` สำหรับเส้นทางระบบ (`:2943-2955`), `text`, `attachment`, `productRefIds` (การ์ดสินค้าหลายใบ `:2996`), `template` (Generic Template Meta `:2997-2999`), `flex` (LINE), `orderRefToken`, `replyOnly` (`:3023`)
- **คิวขาออก (outbox)** — `enqueueOutbound` (`src/services/chat-outbox.service.ts:201`) เขียนแถว `QUEUED` + `sendPayload` ทั้งก้อน แล้วยิงทีหลัง **ครั้งเดียวต่อแถว ไม่มี auto-retry** (`:5-11`) · เกณฑ์กันซ้ำเดียว = `ChatMessage.sendLockedAt IS NULL` (`prisma/schema.prisma:2310-2316`) · claim ค้างเกิน 3 นาที → FAILED "ไม่แน่ใจว่าส่งไปหรือยัง" · ระบายด้วย `deliverRoom` (`:600`) / `sweepOutbox` (`:613`)
- Meta 24 ชม.: `getWindowState` (`src/lib/messaging-window.ts:15`), `MESSAGING_WINDOW_MS` (`:2`), `HUMAN_AGENT_WINDOW_MS` 7 วัน (`:12`)
- HUMAN_AGENT: `canUseHumanAgent` (`src/services/channel-chat.service.ts:149-160`, env `META_HUMAN_AGENT_ENABLED` / `META_HUMAN_AGENT_TEST_PSIDS`, fail-closed) · `shouldTagHumanAgent` (`:172-182`) — **บอท/ระบบห้ามได้ tag เด็ดขาด** (`:179-180`) · 00078 ยืนยันว่า "ตัวส่งอัตโนมัติใช้ HUMAN_AGENT ไม่ได้ จึงดูเฉพาะ 24 ชม." (`src/lib/auto-notify/eligibility.ts:134`)
- Graph: `sendTextMessage` (`src/lib/facebook/graph.ts:693`), `sendAttachmentMessage` (`:730`), `sendImageMessage` (`:784`), `sendTemplateMessage` (`:1224`) · ปกติ `messaging_type: 'RESPONSE'` (`:708`)
- LINE: `transmitLineMessage` (`src/services/channel-chat.service.ts:3772-`) — เช็ค `isBlocked` (`:3780`) · ใช้ reply token ด้วย CAS ก่อน (`:3825-3842`) ไม่ได้ → PUSH · `replyOnly` ห้ามตกไป push (BR-LINE-18, `:3845-3852`) · PUSH เช็คโควตา `getLineQuota` + `shouldBlockLinePush` (`:3861-3866`, `src/lib/line/quota.ts:62`) · บันทึก `ChatMessage.sendMethod` REPLY/PUSH (`prisma/schema.prisma:2376`)
- การ์ด/รูป: การ์ดสินค้า `chunkProductCards` (`src/lib/chat-product-card-batch.ts:57`) · Flex การ์ด LINE `src/lib/line/flex-*.ts` · `externalCardParts` แปลงการ์ดตามช่องทาง (`src/services/auto-notify-message.service.ts:231-232`)
- ข้อความที่ใช้บ่อย: `QuickMessage` (`prisma/schema.prisma:2477-`, body + `imageFileIds` ≤5) = ตัวเทียบขั้น `quick_reply`

**ขาดอะไร**
- **ไม่มี Utility template / Marketing message ของ Meta** (ค้น `utility` ใน `src/` ไม่เจอตัวส่ง) ⇒ ขั้น `utility` ของ gochat (ส่งเกิน 24 ชม. บน Messenger) ทำไม่ได้โดยไม่มีงาน App Review/เทมเพลตใหม่
- ไม่มี helper "ปุ่ม/quick reply" แยก — ส่งได้ผ่าน `template` (Meta) หรือ `flex` (LINE) แบบประกอบเอง · postback ขาเข้ารับได้แต่ **ไม่สร้างข้อความ** (`src/services/channel-chat.service.ts:2738-2745`)
- LINE ไม่มีกรอบเวลา → push ทุกครั้งที่ reply token หมด (60 วิ) = **ใช้โควตาร้าน** · 00078 ไม่ได้ตั้ง `replyOnly` (`src/services/auto-notify.service.ts:431-437`) จึง push ได้ — บอทติดตามต้องเคาะว่าจะยอมใช้โควตาหรือใช้กติกา "หยุดที่ 24 ชม." เหมือน gochat
- ไม่มี `client_msg_id` คงที่ต่อ (run, ขั้น, ส่วน) — ฝั่งเรากันซ้ำด้วย `sendLockedAt` + ledger แทน (ข้อ 4)

---

## 4. ระบบอัตโนมัติที่มีแล้ว — อันไหนเป็นฐาน

| ระบบ | อยู่ไหน | สิ่งที่ยกมาได้ | ข้อจำกัด |
|---|---|---|---|
| **00078 แจ้งลูกค้าอัตโนมัติ** | models `AutoNotifyConfig/Switch/Template/Ledger` (`prisma/schema.prisma:5404-5482`) · service `src/services/auto-notify.service.ts` · เงื่อนไข `src/lib/auto-notify/eligibility.ts` · ตัวแปร/ตัวแก้ `src/lib/auto-notify/{variables,render,editor-dom,editor-text}.ts` | **ฐานหลัก** — ledger กันซ้ำด้วย unique key + `INSERT … ON CONFLICT DO NOTHING` (`:5459-5482`) · claim แบบเงื่อนไข `status='INTENT' AND claimedAt IS NULL` (`auto-notify.service.ts:368-374`) · **revalidate ก่อนส่ง** (`:327-363`) · ส่งผ่าน outbox ด้วย `autoReplyKind='AUTO_NOTICE'` (`:431-437`) · เพดานต่อห้องต่อวัน `dailyCapPerRoom` (`:183-189`) · `enabledAt` กันส่งย้อนหลัง (`eligibility.ts:78`) · ตัวกวาดต่อท้าย cron chat-outbox | ผูก **ออเดอร์** (`orderId` บังคับใน ledger `:5462`) ไม่ใช่ห้อง · ไม่มีขั้นตามเวลา · ไม่เช็ค Meta AI ถือห้อง |
| **00023 Chat-Bot/Auto Reply** | `src/services/auto-reply.service.ts` (`processJob` `:237`), `auto-reply-send.service.ts`, `auto-reply-takeover.service.ts` | ด่าน takeover ต่อห้อง: `autoReplyEnabled` (`schema:2128`), `autoReplyPausedUntil` (`:2130`), `handoffAt` (`:2133`) · `pauseForHumanTakeover` (`auto-reply-takeover.service.ts:45-83`) ถูกเรียกทุกครั้งที่คนส่ง · `AutoReplyJob.chatMessageId @unique` กันงานซ้ำ (`schema:3642-3672`) · ลำดับด่านใน `sendAutoReply` (`auto-reply-send.service.ts:70-110`) | event-driven (ต่อข้อความขาเข้า) ไม่ใช่ตามเวลา · ยังไม่มีมติว่าบอทติดตามต้องหยุดตาม `handoffAt` ของบอทตอบด้วยไหม |
| **00066 ติดตามลูกค้า** | `CustomerFollowUp` (`schema:5102-5129`) · `src/services/customer-follow-up.service.ts` · cron `src/services/follow-up-reminder.service.ts` | งานตามเวลาต่อห้อง (`conversationId`, `dueAt`, `status`) · จองการเตือนด้วย `updateMany` เทียบ `remindedFor` (`follow-up-reminder.service.ts:56-58`) | **ส่งหา staff (push แอป) ไม่ใช่ลูกค้า** — ห้าม import ตัวส่งขาออกโดยมติ (`:2` AC-ACT-42) · ใช้ต่อได้แค่เป็นแบบโครง/ตำแหน่ง UI |
| **00061 สร้างออเดอร์จากแชท** | `src/services/auto-order-*.service.ts` · cron `auto-order-sweeper` | การ์ดข้อความภายใน (ข้อ 2) · ร่าง `Order.status='DRAFTED'` | ไม่เกี่ยวกับการทักตาม · ร่างไม่นับเป็นการซื้อ |

**คำแนะนำ:** ยกโครง **00078** (ledger + claim + revalidate + outbox + ตัวแปร/ตัวแก้เทมเพลต) แล้วเปลี่ยนคีย์จาก `orderId` เป็น `(runId, step)` · ยืมด่าน takeover ของ **00023** · ยืมนิยาม "รอ" ของ **00077**

---

## 5. ตัวรันตามเวลา (cron)

- นิยามใน `vercel.json:12-32` — **19 ตัว** (ไม่มี `vercel.ts`) · route ใน `src/app/api/cron/*/route.ts`
- รอบถี่: `chat-outbox` ทุก 1 นาที (`vercel.json:24`, รวม `sweepAutoNotify` `src/app/api/cron/chat-outbox/route.ts:45-50`), `meta-capi` ทุก 1 นาที (`vercel.json:30`), `auto-order-sweeper` ทุก 2 นาที (`:27`), `follow-up-reminders` / `iship-status-sync` / `flash-status-sync` / `meta-audience` ทุก 5 นาที (`:28,21,22,31`), `line-report-sweep` ทุก 30 นาที (`:29`) · ที่เหลือรายวัน/6 ชม.
- ทุก route ตรวจ `Authorization: Bearer ${CRON_SECRET}` และ reject เมื่อ env ว่าง (`src/app/api/cron/chat-outbox/route.ts:30-38`) · `maxDuration` 60 (บางตัว 120/300)
- กันซ้ำ: **ไม่มี lock ระดับ cron** — ใช้ claim ระดับแถวด้วย conditional `updateMany` + เช็ค `count` (outbox, `AutoReplyJob.lockedAt` `schema:3655-3658`, ledger 00078) · `FOR UPDATE SKIP LOCKED`/advisory lock มีใน `src/services/auto-notify.service.ts`, `appointment.service.ts`, `line-report-bind.service.ts` (ค้นด้วย grep)
- ขาด: ไม่มีตัวรัน "ต่อร้าน" แบบ `eachTenant` — ต้องกวาดทั้งระบบในรอบเดียวภายใน 60 วิ (ดูงบเวลาแบบ `SWEEP_TIME_BUDGET_MS`/`WEBHOOK_DRAIN_BUDGET_MS` ใน `src/services/chat-outbox.service.ts:86-106`)

---

## 6. ออเดอร์ ↔ "แท็กสถานะการขาย 7 ขั้น"

**มีอยู่แล้ว**
- `Order.status` เป็น String ไม่ใช่ enum (`prisma/schema.prisma:805`) · ค่าที่ผลิตได้จริง `DRAFTED | PENDING | SHIPPED | CONFIRMED | CANCELLED | RETURNED` (`src/lib/order-display.ts:299-305`)
- ผูกห้อง: `Order.conversationId` (`prisma/schema.prisma:1028`) · back-relation `Conversation.orders` · ออเดอร์ทดสอบ `isDryRun` (`:1050`) · ต้นทางข้อความ `sourceChatMessageId` (`:1062`)
- ขั้นที่ **คำนวณ** (ไม่เก็บ): `OrderStageKey` (`src/lib/order-stage.ts:37-51`) = PARCEL_PROBLEM · ORDERED · PARCEL_CREATED · LABEL_PRINTED · SHIPPING · DELIVERED · COMPLETED · CANCELLED · RETURNED · AWAITING_DISPATCH · DELIVERY_FAILED (ป้าย `:65-`) · ตัว SQL คู่กันที่ `src/lib/order-stage-sql.ts`
- จุดเปลี่ยนสถานะ (กระจาย): `confirmOrder` (`src/services/order.service.ts:1633`, เขียน `:1666`), `shipOrder` (`:1696`), `markManualDispatched/Delivered` (`:1903`, `:1975`), `cancelOrder` (`:2068`, `:2111`), `settleCodFromCarrier` (`:2620`), ขนส่งรับของ `advanceOrderOnCarrierMove` (`src/services/iship.service.ts:1708-1717`), ปิดอัตโนมัติ (`src/services/order-auto-confirm.service.ts:104`, `order-pickup-auto-confirm.service.ts:84`), คืนของ (`src/services/order-return.service.ts:520`)
- ประวัติเหตุการณ์ `OrderEvent` (`prisma/schema.prisma:4318-`) 39+ ชนิดใน `ORDER_EVENT_TYPES` (`src/lib/order-event.ts:12`) — insert-only มี DB CHECK
- ซื้อซ้ำ: `countsAsCustomerOrder` (`src/lib/customer-behavior.ts:112-116`) ไม่นับ DRAFTED/CANCELLED/RETURNED/NO_SHOW/ตีกลับ · `summarizeCustomerBehavior` (`:118-`) · ป้ายรูป NEW/REGULAR (`src/lib/customer-signal.ts:16-20`) · ค่าต่อห้อง `customerCounted` (`src/services/chat-thread-state.service.ts:202-222`) **ต้องผูก `Customer` (เบอร์) ก่อน** ไม่งั้นเป็น `null`

**ใช้แทน 7 ขั้นได้ไหม** — ได้บางส่วน แต่ต้องเลือกแนว:
- แนว A (แนะนำ): **คำนวณสถานะการขายของห้องจากออเดอร์ล่าสุดของห้อง** (`Order.conversationId` + `order-stage.ts`) ไม่เก็บแท็กซ้ำ → ตรง convention `stored-flag-vs-owner-truth` · map: ไม่มีออเดอร์ = ยังไม่ซื้อ · PENDING = เปิดบิล · CONFIRMED (ชำระ/ยืนยัน) = ยืนยันแล้ว · SHIPPING = ส่งแล้ว · DELIVERED/COMPLETED = สำเร็จ · PARCEL_PROBLEM/DELIVERY_FAILED/RETURNED = พัสดุมีปัญหา · CANCELLED = ยกเลิก
- แนว B: ทำแท็กระบบที่เก็บจริงแบบ gochat → ต้องไล่แขวนทุกจุดเปลี่ยนสถานะข้างบน (คลาส "guard ที่หายไปหายทั้งคลาส")
- **MKP (Shopee/Lazada) ไม่มีในระบบ** (ค้น `shopee|lazada` เจอแค่ชื่อขนส่ง/ข้อความ) ⇒ ข้ามทั้งชุดได้
- ขาด: `CONFIRMED` ของเราแปลว่า "ปิดงาน/ได้รับของ" ในหลายเส้นทาง (auto-confirm delivered) ไม่ใช่ "ชำระแล้ว" — ความหมาย "ยืนยันแล้ว/paid" ต้องดู `OrderPayment`/`setPaymentConfirmed` (`src/services/order.service.ts:2484`) ⇒ HR16 ต้องเคาะนิยามก่อน · "กติกาจบรอบ N วัน" ไม่มีตัวเทียบ

---

## 7. AI ตอบเอง / Meta AI / standby

**มีอยู่แล้ว**
- ข้อเท็จจริงผู้ถือห้อง Meta (00078 M1) บน `Conversation`: `metaOwnerAppId`, `metaOwnerObservedAt`, `metaForeignEchoAt/AppId/Ai/AdminText` (`prisma/schema.prisma:2198-2203`) · ต่อข้อความ `echoAppId/echoAiGenerated/echoHasAdminText` (`:2390-2392`)
- ตัวตัดสิน pure: `metaAiHoldingUntilMs` / `decideMetaAiHolding` (`src/lib/meta-ai-holder.ts:31-52`) — ถือ 24 ชม. หลัง echo AI (`META_AI_HOLD_MS` `:13`) · ใช้แล้วใน API รายการห้อง (`src/app/api/chat/conversations/route.ts:338`) และ `ChatThread.tsx:75`
- `ChatMessage.viaStandby` (`prisma/schema.prisma:2371`) — **ห้ามใช้ตัดสินผู้ถือห้อง** (คอมเมนต์ `src/lib/meta-system-notice.ts:203-229`)
- ส่งเข้าห้องที่แอปอื่นคุม → Meta ปฏิเสธ "another app is controlling this thread" = `retryable:false` (`src/lib/chat-send-failure.ts:190-215`) · แอปเราสั่ง take_thread_control ไม่ได้
- AI ของเราเอง: ChatBot ใน auto-reply (`tryChatbotAnswer` `src/services/auto-reply.service.ts:884`, สถานะ `AutoReplyConfig.aiChatbotStatus` `prisma/schema.prisma:3334`) · ร่างคำตอบ Typhoon (`src/lib/reply-suggest-provider.ts:9-12`, ไม่ส่งเอง)

**บอทควรส่งได้ไหม** — ไม่ควร: (1) ห้องที่ `decideMetaAiHolding` = true จะล้มที่ Meta อยู่ดีและล้มแบบไม่ retry · (2) ห้องที่ `handoffAt`/`autoReplyPausedUntil` มีผล = คนรับช่วงแล้ว · (3) `autoReplyEnabled=false` = ร้านปิดบอทห้องนี้

**ขาด:** ไม่มีมติ "ใครมีสิทธิ์ก่อน" ระหว่างบอทตอบ (00023) กับบอทติดตาม · 00078 ไม่ได้กั้น Meta AI (ดู `revalidate` `src/services/auto-notify.service.ts:327-363`) — บอทใหม่ต้องเพิ่มเอง

---

## 8. สิทธิ์และแพ็กเกจ

- capability กลาง `src/lib/shop-permissions.ts:24-67` — บทบาท OWNER/MANAGER/CHAT/BILLING/TECHNICIAN (`:15`) · ที่เกี่ยว: `H1` อ่านแชท [O,M,C] (`:25`), `H2` ส่ง [O,M,C] (`:26`), `H3` ตั้งค่าแชท/auto-reply/แท็ก [O,M] (`:27`), `X2` เครื่องมือแชทเสริม [O,M,C] (`:57`), `X8` ตั้งค่าแจ้งลูกค้าอัตโนมัติ [O,M] (`:62`) — **X8 เป็นแบบอย่างตรงของบอทที่ส่งในนามร้าน**
- ทุก route ต้องประกาศใน `src/lib/route-capabilities.ts` (เช่น `settings/tags` H3 `:132`, `settings/auto-notify` H1 `:127`, `crm` H1/H2 `:247`, `shops/current/tags` H3 `:512-513`) · ด่านจริง `requireShopCapability`/`gatePage` (`src/lib/shop-capability.ts:56`, `:79`)
- แพ็กเกจ: `BusinessPackageTier` GROWTH/PRO/BUSINESS (`src/lib/business-package.ts:5-14`) — คุมจำนวนธุรกิจ/ผู้ดูแล **ไม่มีสิทธิ์รายฟีเจอร์** · สิทธิ์ที่จ่ายเงินมีแค่ Deep Stock `InventoryEntitlement` (`prisma/schema.prisma:1386`, cap F4)
- ด่านร้านนำร่อง = env รายชื่อร้าน: `META_CAPI_PILOT_SHOP_IDS` (`src/lib/meta-capi/gate.ts:3-5`), `META_AUDIENCE_PILOT_SHOP_IDS`, `FLASH_PILOT_SHOP_IDS`, `TYPHOON_SUGGEST_SHOP_IDS` (`src/lib/reply-suggest-provider.ts:9-12`) — แบบเดียวกันใช้กับบอทได้
- App Store: `isPaidFeatureRestricted` (`src/lib/app-shell.ts:314`) + เมนู `hidePayments` (`src/lib/seller-menu.ts`, `role-nav.ts`) — มี skill `app-store-surfaces` ต้องไล่ถ้าบอทเป็นฟีเจอร์เสียเงิน

---

## 9. หน้าจอที่เกี่ยว (Paces ทั้งหมด)

- ตั้งค่า: `src/app/(paces)/seller/(dashboard)/settings/` — `auto-reply/` (H3), `chatbot/` (H3), `tags/` (H3), `auto-notify/` (H1 อ่าน · X8 เขียน), `comment-reply/`
- ห้องแชท: `src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/`
  - แผงขวา: `CustomerPanel.tsx` / `CustomerPanelSheet.tsx` (มือถือ) รวม `CustomerCrmSection.tsx` (แท็ก + salesStatus), `FollowUpPanel.tsx` (00066), `ChatMemorySection.tsx`, `InterestedProductsSection.tsx`
  - หัวห้อง/สถานะบอท: `ThreadAutoReplyToggle.tsx`, `BotPausedBanner.tsx`, `ThreadOverflowMenu.tsx`, `ThreadChipStrip.tsx` (แถวชิปเดียวใต้หัวห้อง — จุดวางป้าย "บอทติดตามอยู่"), `OrderProgressBar.tsx`
- รายการห้อง: `src/app/(paces)/seller/(chat)/inbox/components/` — `InboxRow.tsx` (ชิป salesStatus `:90-98`, เพดานชิป `src/lib/inbox-row-chips.ts`), `ChatContextMenu.tsx`, `InboxFilterPanel.tsx`, `TagInput.tsx`
- กฎที่ต้องผ่าน: HR1/5/7/8/9/12 (Paces primitive, `pacesToast`, ไม่มี emoji, safepay-ux gate)

---

## 10. migration

- ล่าสุด: `prisma/migrations/20261114120000_00091_order_ad_attribution` (222 โฟลเดอร์ + `migration_lock.toml`)
- รูปแบบ: `YYYYMMDDHHMMSS_<เลขฟีเจอร์>_<snake_case>` เช่น `20261021100000_00083_shop_tags`, `20261022100000_00083_shop_tag_keywords_max50` · หลายไฟล์ในฟีเจอร์เดียวเพิ่มทีละ `100` (`20261027100210…100700_00086_*`) · ไฟล์เก่าบางตัวไม่มีเลขฟีเจอร์ (`20261017100100_auto_notify_settings`)
- CHECK ทั้งหมดเขียนเป็น unmanaged SQL ใน migration (เช่น ledger 00078 `prisma/schema.prisma:5396-5400`) ⇒ ห้าม `db pull`/`migrate dev` (HR13/14) · push main = migrate deploy บน prod (HR15)

---

## 11. ความเสี่ยง / ช่องว่างใหญ่ที่สุด 5 ข้อ

1. **ส่งเกิน 24 ชม. ไม่ได้เลยบน Messenger/IG** — บอทห้ามใช้ HUMAN_AGENT โดยโค้ด (`src/services/channel-chat.service.ts:179-180`) และไม่มี Utility template ⇒ ขั้นที่ตั้งเวลาเกิน ~23 ชม. ต้องตัดทิ้งหรือรองาน Meta (App Review + เทมเพลต) · LINE ส่งได้แต่ **กินโควตา push ของร้าน** (`:3861-3866`) ต้องเคาะว่ายอมไหม
2. **ไม่มีสถานะการขาย 7 ขั้นที่เก็บไว้** — มีแค่ `salesStatus` 3 ค่าและขั้นออเดอร์ที่คำนวณ · จุดเปลี่ยน `Order.status` กระจาย ≥8 ไฟล์ · `CONFIRMED` ≠ "ชำระแล้ว" ⇒ ถ้าเก็บแท็กเองเสี่ยงค้าง/ไม่ตรง (HR16) — แนะนำคำนวณจากออเดอร์ล่าสุดของห้อง
3. **แท็กผูกผู้ติดต่อ + แก้มือทับทั้งอาร์เรย์โดยไม่มี event** (`src/services/chat-crm.service.ts:99`) — ห้อง DEEP ไม่มีแท็ก, "แท็กถูกเอาออก" ต้องเช็คสถานะทุกรอบ, ไม่มีเวลาติดแท็ก
4. **นิยาม "ลูกค้าตอบ" ด้วย `lastInboundAt` หยาบเกินไป** — ขยับจาก reaction/postback/คลิกโฆษณา (`src/services/channel-chat.service.ts:2632-2642`, `:2712-2722`) ⇒ ต้อง query `ChatMessage` จริง (มี index `[conversationId, …]`?) ภายในงบเวลา cron 60 วิ ซึ่งกวาดทั้งระบบรอบเดียว
5. **ชนกับระบบอัตโนมัติเดิม** — บอทตอบ (00023 `handoffAt/autoReplyPausedUntil`), Meta AI ถือห้อง (ส่งแล้วล้มแบบ retry ไม่ได้ `src/lib/chat-send-failure.ts:190-215`), แจ้งลูกค้า 00078 (เพดาน `dailyCapPerRoom` คนละตัว), และ `pauseForHumanTakeover` ถูกเรียกเฉพาะเมื่อคนส่ง ⇒ ต้องมีมติลำดับสิทธิ์ + `autoReplyKind` ค่าใหม่ (เช่น `AUTO_FOLLOW`) ที่ทุกตัวนับ "พนักงานตอบ" (`HUMAN_AGENT_REPLY_WHERE`, `classifyRoom`, `applyKeywordTags` `:33`) รู้จัก — ลืมจุดเดียว บอทจะถูกนับเป็นคนหรือหยุดตัวเอง

---

## ข้อที่ไม่แน่ใจ / ไม่ได้ตรวจลึก

- ไม่ได้ไล่ว่า LINE follow/unfollow สร้าง `ChatMessage` หรือเขียนแค่ `isBlocked` (`prisma/schema.prisma:2041`) — กระทบนิยาม "ข้อความจริง"
- ไม่ได้ตรวจว่ามี index บน `ChatMessage(conversationId, senderRole, createdAt)` พอสำหรับ query "ลูกค้าตอบหลังฟองบอท" ทุกห้องทุกนาที
- ไม่ได้ไล่ทุกเส้นทางที่เขียน `Order.status` (ค้นด้วย grep pattern `status: "…"` เท่านั้น อาจพลาด raw SQL)
- จำนวนห้อง/ร้านบน prod และปริมาณ cron ที่รับได้ไม่ได้วัด
- `sendTemplateMessage` รับปุ่มแบบไหนได้บ้าง (button/postback) ไม่ได้เปิดอ่านตัวฟังก์ชัน

# รายการที่ต้อง sync เข้า `docs/SRS.md` (HR11) — เมื่อ implement 00095 P1

> เลขหัวข้อถัดไปที่ว่าง (ตรวจจาก `docs/SRS.md` เมื่อ 2026-11-16): §5.7 · §6.82 · §7.37 · §8.22 · §9.19 · §10.26 (ถ้ามีคนเพิ่มก่อน ให้ใช้เลขถัดไป) · เอกสารต้นทาง = `docs/20 - Features/00095 - Sales Follow Bot/{SRS,SDS,API}.md` · ทุกค่าเก็บเป็น String + CHECK ที่ DB

### 5.7 env ของ feature 00095 (บอทติดตามยอดขาย · 2026-11-16)
| env | ใช้ที่ | หมายเหตุ |
|---|---|---|
| `SALES_FOLLOW_BOT_SHOP_IDS` (**ใหม่**) | `src/lib/sales-follow-bot/gate.ts::isSalesFollowBotEnabled` | รายการ `Shop.id` คั่น comma · **ว่าง/ไม่ตั้ง = ปิดทั้งระบบ (fail-closed)** · `*` = ทุกร้าน (ค่าเดียวที่เปิดทั้งหมด) · ตัดสินที่ตัวแนบ ตัวส่ง หน้า และ API · เปลี่ยนค่าต้อง redeploy ทางเร็วกว่า = สคริปต์ปิดบอททั้งร้าน |
| `CRON_SECRET` (มีอยู่แล้ว) | `/api/cron/sales-follow-bot` | Bearer เหมือน cron อื่น · ว่าง = 401 |
| `FB_CHAT_APP_ID` (มีอยู่แล้ว) | `ourMetaAppId()` ใน `decideMetaAiHolding` | ไม่เพิ่ม env อื่น |

และเพิ่มบรรทัด cron `{ "path": "/api/cron/sales-follow-bot", "schedule": "* * * * *" }` ในรายการ cron ของเอกสาร (ถ้ามีตารางรวม cron) — ตัวที่ 20 ใน `vercel.json`

### 6.82 บอทติดตามยอดขาย — `SalesFollowBot` · `SalesFollowBotChannel` · `SalesFollowBotTestRoom` · `SalesFollowRun` · `SalesFollowSend` (feature 00095)
> เอกสารต้นทาง: 00095 SRS §5 · migration `20261117100000_00095_sales_follow_bot` (CHECK/partial unique เป็น SQL — ห้าม `db pull`/`migrate dev`)

ใส่ตารางคอลัมน์/CHECK/unique/index ตาม SRS 00095 §5.1 ทั้งหมด โดยย่อหัวข้อสำคัญดังนี้:
- `SalesFollowBot`: `status ∈ CLOSED|TESTING|ACTIVE` (ใหม่ = CLOSED) · `salesStatuses` ⊆ 7 key · `tagKeys` (=`tagNameKey` ของแท็ก) · `tagMatch ANY|ALL` · `steps` jsonb 1..10 ขั้น `{delayMin, kind TEXT|TEXT_IMAGE, text, imageFileId}` · `structureRev` · soft delete `deletedAt`
- `SalesFollowRun`: `stageKey`+`stageStamp` (ตราประทับ = เวลาเหตุการณ์ออเดอร์) · `nextStep 0..10` · `holdReason` · `status ACTIVE|DONE|STOPPED` + `stopReason` (11 ค่า) · unique `(conversationId) WHERE status='ACTIVE'` และ `(botId, conversationId, stageStamp)`
- `SalesFollowSend`: unique `(runId, step)` = กุญแจกันส่งซ้ำ · `status SENDING|SENT|FAILED|SKIPPED` + `reason` (7 ค่า) · `botId` ไม่มี FK · `chatMessageId`/`imageMessageId`
- **ไม่เก็บ** สถานะการขายเป็นแท็ก/คอลัมน์ (คำนวณจากออเดอร์ล่าสุดของห้อง — `deriveShippingStage`)
- ผลกระทบตารางเดิม: **ไม่มี migration** บน `ChatMessage` (ค่า `autoReplyKind='AUTO_FOLLOW'` และ `type='FOLLOW_BOT_NOTE'` ไม่มี CHECK) — อัปเดตคอมเมนต์ใน `prisma/schema.prisma:2385` ให้ระบุค่าใหม่

### 7.37 บอทติดตามยอดขาย (`/api/shops/current/sales-follow-bot/**`, `/api/chat/conversations/[id]/follow-bot/**`, `/api/cron/sales-follow-bot`) — feature 00095
ตาราง endpoint 12 ตัวตาม API 00095 §3 พร้อม capability (`H2` เขียน/อ่านจอตั้งค่า · `H1` อ่านแผงห้อง · cron = `CRON_SECRET`) และรหัส error §5 (รวม `CHANNEL_CONFLICT` 409 · `BOT_STALE` 409 · `FEATURE_NOT_ENABLED` 403 · `NOT_AVAILABLE_FOR_SHOP` 409 · `TEST_ROOMS_REQUIRED` 400) · cursor ประวัติปลอม = ว่าง ไม่ error

### 8.22 บอทติดตามยอดขาย (feature 00095 — SSOT ฝั่งโค้ด: `src/lib/sales-follow-bot/constants.ts` · ทุกค่าเก็บเป็น String + CHECK ที่ DB)
- `SalesStageKey` (7): `NOT_BOUGHT` ยังไม่ซื้อ · `BILLED` เปิดบิล · `ORDER_CONFIRMED` ยืนยันแล้ว (**ไม่ใช่** `Order.status='CONFIRMED'`) · `SHIPPED` ส่งแล้ว · `COMPLETED` สำเร็จ · `PARCEL_PROBLEM` พัสดุมีปัญหา · `CANCELLED` ยกเลิก — นิยามตามตารางแปลง SRS 00095 TFR-FB-01
- ระยะพักก่อนนับเป็นรอบใหม่: COMPLETED 7 วัน · SHIPPED 14 วัน · CANCELLED 0 วัน
- `SalesFollowBot.status`: `CLOSED|TESTING|ACTIVE` · `tagMatch`: `ANY|ALL` · ชนิดขั้น P1: `TEXT|TEXT_IMAGE` (P2 เพิ่มการ์ดสินค้า/ข้อความที่ใช้บ่อย/ปุ่ม)
- `SalesFollowRun.stopReason` (11): `STAGE_CHANGED, TAG_REMOVED, BOT_DISABLED, BOT_EDITED, BOT_DELETED, CUSTOMER_REPLIED, WINDOW_CLOSED, NOT_INTERESTED, OUT_OF_SCOPE, CONTACT_BLOCKED, ADMIN_STOPPED` · `holdReason` (4): `SHOP_NOT_ENABLED, META_AI_HOLDING, AUTO_REPLY_OFF, CHANNEL_NOT_ACTIVE`
- `SalesFollowSend.status`: `SENDING|SENT|FAILED|SKIPPED` · `reason` (7): `PLATFORM_REJECTED, UNCERTAIN_SEND, OTHER_APP_CONTROLS, LINE_QUOTA_FULL, META_WINDOW_REJECTED, IMAGE_MISSING, EMPTY_MESSAGE`
- ขีดจำกัด: ขั้น ≤10 · ชื่อ ≤60 · ข้อความ ≤1,000 code point · ห้องทดสอบ ≤20 · ช่องทางต่อบอท ≤50 · แท็กต่อบอท ≤20 (ข้อเสนอ) · เวลารอต่อขั้น ≥1 นาที · เวลาสะสม ≤10,020 นาที (6 วัน 23 ชม.) · ขั้นที่สะสม >1,380 นาที = "เฉพาะลูกค้าที่ทักจากโฆษณา"
- **อัปเดตของเดิม:** (ก) `ChatMessage.autoReplyKind` เพิ่ม `'AUTO_FOLLOW'` (ฟองบอทติดตาม — ไม่นับพนักงาน/ไม่ติดแท็ก/ไม่หยุด 00023/ไม่เขียน `lastSenderRole`/ไม่ใช่โต๊ะบอท) · (ข) `ChatMessage.type` เพิ่ม `'FOLLOW_BOT_NOTE'` ใน `INTERNAL_MESSAGE_TYPES` (บรรทัดระบบ ลูกค้าไม่เห็น) · (ค) นิยามร่วม "ข้อความจริงของลูกค้า / ร้านตอบที่นับ / ร้านค้างตอบ" (TFR-FB-03) — LINE postback (`externalMessageId` ขึ้นต้น `pb:`) ไม่นับเป็นข้อความจริง
- ความหมาย env/ด่าน: ดู §5.7

### 9.19 สิทธิ์ของบอทติดตามยอดขาย (feature 00095)
| การกระทำ | OWNER | MANAGER | CHAT | BILLING | TECHNICIAN | หมายเหตุ |
|---|---|---|---|---|---|---|
| ดู/สร้าง/แก้/ลบ/เปลี่ยนสถานะบอท · ดูประวัติ · หยุดบอทในห้อง (`H2`) | ✓ | ✓ | ✓ | – | – | มติ Q-11 (ข) 2026-11-16: ตรงมติ gochat 15 ต.ค. — ไม่มีหน้าแบบอ่านอย่างเดียว |
| อ่านแผงในห้อง (`H1`) | ✓ | ✓ | ✓ | – | – | |
| cron | – | – | – | – | – | `CRON_SECRET` ไม่มีบทบาท |
ทุกคำสั่งกรอง `shopId` จาก session (ไม่มี RLS) · เพิ่มเงื่อนไข: ร้านต้องอยู่ใน `SALES_FOLLOW_BOT_SHOP_IDS` และ `Shop.vertical='ONLINE_SALES'` · ประกาศไฟล์ใหม่ทุกตัวใน `src/lib/route-capabilities.ts` (รายการ SDS 00095 §9)

### §10.26 บอทติดตามยอดขาย — Valibot (feature 00095 — `src/lib/sales-follow-bot/schemas.ts`)
`SalesFollowBotCreateSchema` · `SalesFollowBotPatchSchema` (+`expectedUpdatedAt`) · `SalesFollowBotStatusSchema` (+`testRoomIds` 1..20 เมื่อ TESTING) · `SalesFollowSendsQuerySchema` (cursor ปลอม → ผลว่าง) · `validateSteps(steps)` → issues `{code, stepIndex?}`: `NAME_REQUIRED, NAME_TOO_LONG, NO_CONDITION, STEPS_COUNT, STEP_DELAY_MIN, STEPS_TOTAL_TOO_LONG, STEP_TEXT_REQUIRED, STEP_TEXT_TOO_LONG, STEP_IMAGE_REQUIRED, UNKNOWN_VARIABLE (อนุญาตเฉพาะ {ชื่อ}), TOO_MANY_TAGS, TOO_MANY_CHANNELS` · `adOnly` เป็นผลคำนวณ ไม่รับจาก client

### งานเอกสารระบบอื่นที่ต้องแก้พร้อมกัน
1. ตารางชนิด `ChatMessage.type`/ป้ายผู้ส่งใน `docs/SRS.md` (ที่พูดถึง `AUTO`/`AUTO_TEST`/`AUTO_NOTICE`) — เพิ่ม `AUTO_FOLLOW` และ `FOLLOW_BOT_NOTE`
2. ตาราง capability/เมนูการตั้งค่าผู้ขาย — เพิ่ม `/settings/sales-follow-bot` (`seller:settings-sales-follow-bot` ใน `src/lib/seller-menu.ts`)
3. `docs/SRS.md` §ที่อธิบาย 00078 "ฐานส่งอัตโนมัติ" — เพิ่มบรรทัดอ้าง 00095 เป็นผู้ใช้โครงเดียวกัน แต่ใช้เพดานคนละตัว (ไม่นับรวมเพดานต่อห้องต่อวัน)
4. `CLAUDE.md` snapshot (หลัง implement/merge): บรรทัดเดียว "2026-11-xx (00095): บอทติดตามยอดขาย P1 …" + `docs/claude/state-snapshots`
5. `docs/20 - Features/00095 - Sales Follow Bot/BRD.md`: ปรับตามข้อตีความ SRS §7.4 (AC-FB-36, 08, 82, สแปม/ซ่อนระหว่างตาม, BR-FB-12) — **BA เป็นเจ้าของ** (ห้ามข้ามเจ้าของ) ส่งผ่าน Controller

---

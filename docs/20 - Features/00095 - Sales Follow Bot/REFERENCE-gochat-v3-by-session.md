# บอทติดตามยอดขาย (Sales Follow Bot) — เอกสารอ้างอิงจาก gochat-v3

> เขียนจาก **gochat-v3 `origin/main` @ `cff4a049a` (13 พ.ย. 2569)** อ่านจากโค้ด/เอกสารจริง ไม่ได้เขียนจากความจำ
> `path:line` ทุกตัวในไฟล์นี้หมายถึงไฟล์ใน repo gochat-v3 ที่ commit นั้น — เปิดดูด้วย `git show cff4a049a:<path>`
> ชื่อในระบบ: เมนู "บอทติดตามยอดขาย" · หน้า `/sales-bot` · โค้ด `follow-bot` · ทีมเรียกกันว่า "บอทขุด"
> เอกสารหลักฝั่ง gochat: `doc-library/modules/auto-reply/BRD.md` (BR-AUTOREPLY-049…052, 057, 061, 062, 068, 069) · `doc-library/modules/auto-reply/PRD.md:409` (หัวข้อ "บอทติดตามยอดขาย")

---

## 1. ภาพรวม + ผู้ใช้ทำอะไรได้บ้าง

**ปัญหาที่แก้:** ลูกค้าทักมาแล้วเงียบไป ร้านต้องไล่ทักทีละห้องเอง บอทนี้ทักตามให้เป็นขั้น ๆ ตามเวลาที่ร้านตั้ง และหยุดเองเมื่อซื้อแล้ว ตอบแล้ว หรือเลยกรอบเวลาที่ช่องทางยอมให้ส่ง (BRD BR-AUTOREPLY-050/051)

### บอทสองประเภท (`BotKind` — `src/lib/follow-bot/model.ts:72`)

| | **ตามเงื่อนไข** (`condition`) | **เฉพาะกลุ่ม** (`product` เดิมชื่อ "รายสินค้า") |
|---|---|---|
| ใครแนบเข้าห้อง | engine แนบเองทุกนาที (`engine.ts:129-164`) | แอดมินกดแนบเองในห้องแชท (`store.ts:262-287` `attachBot`) |
| เงื่อนไข | แท็กสถานะ (หลายค่า · ไม่เลือก = ทุกสถานะ) + แท็กของร้าน (any/all) + บัญชีเพจ/OA | ไม่มีเงื่อนไข · ผูกสินค้าหนึ่งชิ้นตอนแนบ |
| ตัวแปร | `{ชื่อ}` เท่านั้น — `{สินค้า}` `{ราคา}` ใช้ไม่ได้ (`model.ts:203`) | `{ชื่อ}` `{สินค้า}` `{ราคา}` (ราคาในคลังตอนส่ง · `engine.ts:200,325`) |
| ขั้นการ์ดสินค้า | เลือกได้ ≤ 10 ชิ้นต่อขั้น (`model.ts:116`) | ใช้สินค้าของ run (`send-deps.ts:209`) |
| แนบได้เมื่อ | ห้องอยู่ในกรอบ 24 ชม. และยังไม่เลยเวลาขั้นแรก (`engine.ts:144`) | ลูกค้าทักภายใน 24 ชม. (`store.ts:271`) |

เปลี่ยนประเภทหลังสร้างไม่ได้ (`store.ts:135`)

### ชนิดขั้น (`StepKind` — `model.ts:77`)

| ชนิด | ส่งอะไร | หมายเหตุ |
|---|---|---|
| `text` | ข้อความ | ≤ 1,000 ตัวอักษร · มีปุ่ม 0–3 ปุ่ม (≤ 20 ตัวอักษร) = ≤ 640 (`model.ts:92-101`) |
| `text_image` | ข้อความ + รูป | ไม่มีปุ่ม = ข้อความก่อนแล้วรูป · มีปุ่ม = รูปก่อน แล้วฟองข้อความ + ปุ่ม (`send-deps.ts:292-320`) |
| `product` | การ์ดสินค้า | หลายชิ้น = การ์ดเลื่อนข้างในข้อความเดียว · ชิ้นที่หมด/ปิดขายข้ามไป · เหลือ 0 = ล้ม (`send-deps.ts:206-247`) |
| `quick_reply` | ข้อความที่ใช้บ่อย ≤ 5 รายการ | ส่งทุกข้อความ + รูปของแต่ละรายการตามลำดับ (`send-deps.ts:263-288`) |
| `utility` | **ข้อความแจ้งเตือนลูกค้า (Utility template ของ Meta)** | ชนิดเดียวที่ส่ง**เกิน 24 ชม.**ได้ · ไม่มีเพดานเวลา · ขั้นที่เลย 23 ชม. ต้องเป็นชนิดนี้ (`model.ts:169-176` · BR-AUTOREPLY-068) |

### ข้อจำกัดของฟอร์ม (`validateBot` — `model.ts:151-206`)
- 1–10 ขั้น (`MAX_STEPS` `model.ts:128`) · แต่ละขั้นรอ ≥ 1 นาที · ≤ 3,650 วัน (กันค่าล้น ไม่ใช่กติกาธุรกิจ `model.ts:103`)
- **เวลาสะสมของขั้นที่ไม่ใช่ utility ≤ 23 ชม.** (`MAX_TOTAL_MIN` `model.ts:129` · เผื่อ 1 ชม. ให้คิวช้า)
- บัญชี 1–50 (`MAX_ACCOUNTS`) · ช่องทางที่ใช้ได้: messenger · instagram · line (`FOLLOW_CHANNELS` `model.ts:79`)
- ตามเงื่อนไขต้องมีแท็กอย่างน้อย 1 ตัว (สถานะหรือของร้าน) ไม่งั้นจะทักทุกห้องของเพจ (`model.ts:160`)
- บอทที่มีแต่ IG ใช้ขั้น utility ไม่ได้ (`model.ts:171`)
- สถานะ 3 แบบ: ปิด · **ทดสอบ** (ใช้ได้เฉพาะแชททดสอบ 1–20 แชท) · เปิดใช้ (`model.ts:119-121` · 0205)

### สิทธิ์
- สร้าง/แก้/ลบ/เปิด-ปิด: **ทุกคน** ตั้งแต่ 15 ต.ค. 2569 (เดิมเจ้าของร้าน + หัวหน้า) ผ่านสวิตช์ `AUTO_REPLY_AGENT_CAN_MANAGE` (`src/lib/follow-bot/access.ts:13-15` · BR-AUTOREPLY-050 AC 6)
- ดูรายการ/ประวัติ: สมาชิกร้านทุกคน (`src/app/(app)/sales-bot/actions.ts:7`)
- แนบ/หยุดบอทในห้อง: ทุกคนที่ตอบห้องนั้นได้ (BR-AUTOREPLY-052 AC 5)
- ด่านแพ็กเกจ: ร้านที่ไม่มีฟีเจอร์ตอบกลับอัตโนมัติจะเห็นหน้าอัปเกรด (`src/app/(app)/sales-bot/plan-locked.tsx`)

---

## 2. Data model

### ตาราง

**`follow_bots`** — ตัวบอท (`db/migrations/0201_follow_bots.sql:17-35`)
- `kind` CHECK `condition|product` · `name` ≤ 60 ไม่ว่าง · `enabled` · `testing` (0205)
- `stage_keys text[]` CHECK ⊆ 7 คีย์ (0220 `:19-21`) · `tag_ids uuid[]` · `tag_match` CHECK `any|all`
- `channels text[]` (คอลัมน์เก่า เก็บไว้ให้โค้ดรุ่นก่อน 0205 อ่านได้ระหว่าง rollout · ของจริงอยู่ที่ `follow_bot_accounts`)
- `steps jsonb` CHECK array 1–10 (0247 `:10-12`) · `deleted_at` (ลบแบบ soft · ทุกคิวรีกรอง `deleted_at IS NULL`)
- CHECK `follow_bots_state_check: NOT (enabled AND testing)` (0205 `:13-15`)
- index `(tenant_id, enabled)` · `UNIQUE (tenant_id, id)` ไว้ให้ FK แบบคู่

**`follow_bot_runs`** — บอทที่ติดอยู่กับห้อง (`0201:37-69`)
- `conversation_id` · `bot_id` · **`stage_tagged_at`** = `created_at` ของแท็กสถานะตอนแนบ ถ้าค่านี้เปลี่ยนแปลว่าสถานะเปลี่ยน → หยุด
- `product_id` / `product jsonb` (บอทเฉพาะกลุ่ม) · `next_step` CHECK 0–10 · `last_sent_at` · `next_due_at` (เอาไว้ทำป้ายกระพริบ)
- `status` CHECK `active|done|stopped` · `stop_reason` CHECK (ดูข้อ 4) · `started_by` · `stopped_by` · `finished_at`
- **`follow_bot_runs_one_active` UNIQUE (tenant_id, conversation_id) WHERE status='active'** → ห้องละหนึ่งบอทที่ทำงาน
- **`follow_bot_runs_once` UNIQUE (tenant_id, conversation_id, bot_id, stage_tagged_at)** → บอทเดิม ห้องเดิม ในรอบสถานะเดิม แนบได้ครั้งเดียว
- index `(tenant_id, bot_id) WHERE active`
- FK `(tenant_id, conversation_id) → conversations` CASCADE · `(tenant_id, bot_id) → follow_bots` CASCADE

**`follow_bot_sends`** — ประวัติการส่ง ขั้นละหนึ่งแถว และใช้เป็นกุญแจกันส่งซ้ำด้วย (`0201:71-95`)
- `step` CHECK 0–9 (0247) · `status` CHECK `sending|sent|failed|skipped` · `reason` · `message_id`
- **`UNIQUE (run_id, step)`** ← ตัวกันส่งซ้ำ (ข้อ 3)
- `bot_id` **ไม่มี FK โดยตั้งใจ** เพื่อให้ประวัติอยู่ได้หลังลบบอท (`0201:93`)
- index `(tenant_id, conversation_id)` · `(tenant_id, created_at DESC)` (ใช้แบ่งหน้าแบบ keyset)

**`follow_bot_accounts`** — บัญชีระดับเพจ/OA ที่บอทใช้ (0205 `:23-37`) PK `(bot_id, channel_account_id)` · index `(tenant_id, channel_account_id)`

**`follow_bot_test_contacts`** — แชททดสอบ (0205 `:40-56`) เก็บเป็น contact เหมือนชุดตอบกลับ

ทุกตารางเปิด `ENABLE + FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` (`tenant_id = app_tenant_id()`) (`0201:97-107` · `0205:58-68`)

### แท็กสถานะ 7 ขั้น
เก็บเป็นแถวใน `tags` ที่มี `system_key` (`0201:11-15`) · ห้องละหนึ่งแท็ก โดยบังคับในโค้ด (`setStage` ใช้ advisory lock ต่อห้อง `stage.ts:56`) เพราะ `conversation_tags` ไม่รู้ว่าแท็กไหนเป็นแท็กสถานะ
- CHECK `tags_system_key_check` ⊆ `not_bought, billed, paid, shipped, done, problem, cancelled` (0220 `:15-17`)
- UNIQUE `tags_one_system_key (tenant_id, system_key) WHERE system_key IS NOT NULL`
- ชื่อ/สีบนจอ (`model.ts:17-25`): ยังไม่ซื้อ · เปิดบิล · **ยืนยันแล้ว** (คีย์ยังเป็น `paid` เพราะไม่ย้ายคีย์ระหว่าง rollout · 0220 `:5-8`) · ส่งแล้ว · สำเร็จ · พัสดุมีปัญหา · ยกเลิก (แดง)
- มีชุดเดิม 5 ตัว (`LEGACY_STAGES` `model.ts:32-38`) ไว้ให้ร้านนอกรายชื่อ `order-tags-allow.ts` ซึ่งตอนนี้ตั้งเป็น `*` ทุกร้านแล้ว
- ร้านมีแท็กชื่อเดียวกันอยู่แล้ว = ยึดแถวเดิมมาเป็นแท็กระบบ ไม่สร้างซ้ำ (`stage.ts:15-29`)
- แท็กสถานะลบ/เปลี่ยนชื่อไม่ได้ (`stage.ts:76-98`) · ลบแท็กของร้าน = ดึงออกจาก `follow_bots.tag_ids` ด้วย (`stage.ts:95`)

### migration ที่เกี่ยว (ตามลำดับ)
| ไฟล์ | ทำอะไร |
|---|---|
| `0201_follow_bots.sql` | 3 ตารางหลัก + `tags.system_key` + index ไลฟ์ (ใช้หาสินค้าแนะนำ) |
| `0205_follow_bot_accounts_test.sql` | บัญชีระดับเพจ · โหมดทดสอบ · `out_of_scope` · เติมบัญชีย้อนหลังทีละร้าน (`set_config` เพราะ FORCE RLS) |
| `0220_order_status_tags.sql` | แท็กสถานะ 5 → 7 (`done`, `problem`) + ตัวนับออเดอร์ GoSaaS บน contacts |
| `0247_follow_bots_steps_max_10.sql` | 5 → 10 ขั้น **ต้องขยาย CHECK ครบ 3 จุด** (ดูกับดักข้อ 8) |
| `0253_mkp_order_status.sql` | `status`/`status_changed_at` บนดัชนีออเดอร์ Shopee/Lazada + `contacts.mkp_order_count` |
| `0335_utility_template_link.sql` | เชื่อมเทมเพลต Utility (ตัวส่งของ follow-bot อ่านคอลัมน์เดิม `:6`) |
| `0371_follow_bot_stop_customer_replied.sql` | stop_reason `customer_replied` (CS-23480) |
| `0375_follow_bot_stop_tag_removed.sql` | stop_reason `tag_removed` |

---

## 3. Engine (`src/lib/follow-bot/engine.ts`)

### รอบรัน
- pg-boss คิว `follow-bots` ตั้ง cron `* * * * *` (ทุกนาที) (`src/worker/index.mts:9016` สร้างคิว · `:11053` ตั้งเวลา)
- worker วนทุกร้าน (`eachTenant`) แล้วเรียก `runFollowBots(sql, tenantId, followSendDeps())` (`index.mts:10535-10542`)
- แต่ละร้านทำงานในธุรกรรมที่ตั้ง `app.tenant_id` ไว้ (`inTenant` `engine.ts:80-81`) เพื่อให้ RLS ทำงาน

### เฟส 1 — ติดแท็ก "ยังไม่ซื้อ" (`engine.ts:89-113`)
- หยิบห้อง DM ที่ `last_inbound_at > now − 24 ชม.` ที่**ยังไม่มีแท็กสถานะ** หรือ**รอบเก่าจบแล้ว** (`since + ROUND_HOLD_DAYS[key] < last_inbound_at`) · หยิบไม่เกิน 200 ห้องต่อรอบ (`ROOM_LIMIT`)
- **ประทับ `created_at` ของแท็ก = เวลาที่ลูกค้าทัก ไม่ใช้ `now()`** (`:91-93`) เพื่อให้เหตุการณ์ออเดอร์ที่เกิดหลังลูกค้าทักแต่มาถึงช้าผ่าน `notBefore` ได้ (BR-AUTOREPLY-049 AC 8)
- ช่องทาง: messenger/ig/line · ร้านที่เชื่อม GoSaaS = ทุกช่องทาง (`:97,105`)
- รวบการปลุกรายการห้องไว้ครั้งเดียวต่อบัญชี (`notifyRoomList` `stage.ts:106-115`)

### ด่านระดับร้าน (`engine.ts:115-120`)
`deps.access` = `botAccessBlock` (`src/lib/auto-reply/bot-bubble.ts:46-51`): ร้านไม่พบ · ส่งออกไม่ได้ (หมดอายุ/ระงับ) · แพ็กเกจไม่มี `autoReply` → **ไม่แนบ ไม่ส่งทั้งร้านในรอบนั้น** แต่เฟส 1 ยังติดแท็กต่อได้ · log ครั้งเดียวต่อเหตุ (`logOnce` `:42-48`)

> **"allow.ts" มีสองตัว อย่าสับสน**
> - `src/lib/follow-bot/allow.ts` = รายชื่อร้านที่ใช้หน้า/action ได้ (`salesBotAllowed`) ตอนนี้ `['*']` คือทุกร้าน (`:10`) · **กันได้แค่ทางเข้า worker ส่งตามบอทใน DB** — จะเอาร้านออกต้องปิดบอทของร้านนั้นก่อน (`:7`)
> - `src/lib/follow-bot/order-tags-allow.ts` = ร้านที่ใช้แท็กสถานะชุด 7 ตัว (`['*']` เหมือนกัน)

### เฟส 2 — แนบบอทตามเงื่อนไข (`engine.ts:122-164`)
INSERT…SELECT คำสั่งเดียวสำหรับทุกบอท + `ON CONFLICT DO NOTHING` (ใช้ unique `one_active` + `once` กันแนบซ้ำ) เงื่อนไขของห้อง:
- DM · ลูกค้าทักภายใน 24 ชม. · อยู่ในบัญชีของบอท · บัญชี `connection_status ∈ (active, expiring)`
- บอทเปิด หรือ (ทดสอบ **และ** contact อยู่ในแชททดสอบ)
- **ยังไม่เลยเวลาขั้นแรก** (`last_inbound_at + delay ขั้น 0 > now`) ← ผู้ใช้เคาะ 8 ต.ค.: เปิดบอทใหม่แล้วต้องไม่ยิงใส่ห้องเก่าทั้งร้านพร้อมกัน (`:124-125,144`)
- `sales_status ≠ not_interested` · **ห้องที่ AI ตอบเองไม่ถูกแนบ** (`autoSendOn() AND ai_room_auto(c.id)` `:147` · Q97)
- แท็กสถานะล่าสุดอยู่ใน `stage_keys` (ว่าง = ทุกสถานะ) · แท็กของร้านตรงตาม any (`&&`) / all (`@>`) โดยนับเฉพาะแท็กที่ยังอยู่ (`:133,148-151`)
- ไม่มี run ที่ active อยู่แล้ว · ไม่เคยแนบบอทนี้ในรอบสถานะนี้
- **บอทที่ไม่เลือกแท็กสถานะ:** ถ้ารอบก่อนจบหลังลูกค้าทักล่าสุด จะไม่หยิบห้องเดิมซ้ำ ต้องรอลูกค้าทักใหม่ (`:154-157` ข้อ 5/5.1)
- บอทที่แท็กของร้านถูกลบหมดและไม่มีแท็กสถานะ = ไม่แนบใคร (`:160`)
- `next_due_at` ตอนแนบเป็นค่าตั้งต้น เฟส 3 จะคำนวณใหม่

### เฟส 3 — เดินขั้น (`engine.ts:166-270`)
1. **claim:** `SELECT … FOR UPDATE SKIP LOCKED LIMIT 50` เรียงจากขั้นที่ถึงเวลาก่อน แล้วตาม `updated_at` · ถ้า batch เต็มจะ touch `updated_at` ให้คิวหมุน (`:168-174`)
2. **ลำดับการตัดสิน (ห้ามสลับ)** (`:230-250`):
   `stage_changed` → `tag_removed` → `bot_disabled` → `customer_replied` → (AI ตอบเอง = ข้ามไม่ทำอะไร) → `done`/`bot_shortened` → ไม่มีขาเข้า = `window` → เลย 24 ชม. และขั้นถัดไปส่งเกิน 24 ชม. ไม่ได้ = `window` → `not_interested` → `out_of_scope` → **ร้านค้างตอบ/ไม่ใช่ DM = รอ (`next_due_at = NULL`)** → ยังไม่ถึงเวลา = เซ็ต `next_due_at` → ยังอยู่ในช่วงพักหลังล้ม = รอ
3. **แถว `sending` ที่ค้างเกิน 10 นาที** (worker ตายกลางยิง) จะถูกปิดเป็น `failed` "ค้างส่ง ไม่ทราบผล" แล้ว**เดินขั้นต่อโดยไม่ยิงซ้ำ** (`:252-261`)
4. **จองกุญแจ:** `INSERT follow_bot_sends (run_id, step, 'sending') ON CONFLICT DO NOTHING` อยู่ในธุรกรรมเดียวกับ claim · ไม่ได้แถว = มีตัวอื่นส่งอยู่ (`:262-266`)

### หลัง COMMIT — ยิงทีละห้อง (`engine.ts:272-371`)
- **ส่งหลัง commit เท่านั้น** และห้าม throw ออกจาก loop เพราะกุญแจ commit ไปแล้ว ห้องอื่นต้องได้ส่งต่อ (`:272`)
- `gate` ไม่ผ่าน:
  - เลย 24 ชม. → `skipped` แล้วหยุดด้วย `window`
  - ติดเรื่องชั่วคราว (เช่นเพจหลุด) → คืนกุญแจ (`DELETE … status='sending'`) รอบหน้าลองใหม่ · ถ้าเป็นขั้น utility ที่ติดด่านเกิน 60 นาที = `failed` แล้วเดินขั้นต่อ (`:284-295`)
- **ตรวจซ้ำก่อนยิง** ด้วย SQL เพราะระหว่าง commit กับตอนยิงอาจมีอะไรเปลี่ยน (`:296-317`): run ยัง active · `next_step` ตรง · แท็กยังตรง · ยังอยู่ในกรอบ (หรือเป็นขั้นที่ส่งเกินกรอบได้) · ไม่ใช่ไม่สนใจ · **ร้านไม่ได้ค้างตอบ** · **แอดมินไม่ได้ตอบหลัง claim** (ถ้าตอบ นาฬิกาเริ่มนับใหม่ จะไม่ยิงต่อท้ายคำตอบแอดมิน) · `stage_tagged_at` ยังเท่าเดิม → ไม่ผ่าน = คืนกุญแจ
- ผลการส่ง (`:323-348`):
  - สำเร็จ → `sent`
  - `skipped` (ห้องนี้ส่งขั้นนี้ไม่ได้ เช่นไม่มีออเดอร์) → เดินขั้นต่อ
  - ล้มแบบลองใหม่ได้ → คืนกุญแจ + พัก 5 นาที (`FOLLOW_RETRY_BACKOFF_MIN`) · ลองมาเกิน 60 นาทีนับจากเวลาถึงกำหนด → `failed` แล้วเดินขั้นต่อ (`FOLLOW_RETRY_MAX_MIN` `:26-28`)
  - **throw = ถือว่าล้มแบบไม่ลองซ้ำ** เพราะ "ส่งไม่ถึงดีกว่าส่งสองรอบ" (`:344-347`)
- บันทึกผล + เดินขั้นแบบมีเงื่อนไข `WHERE status='active' AND next_step=${step}` (ถ้าแอดมินหยุดระหว่างยิง จะไม่เดินขั้น) · ขั้นสุดท้ายแล้ว → หยุดด้วย `done` (`:361-364`)

### นับเวลาแต่ละขั้น (`dueAt` `model.ts:213-218`)
```
due = max(ร้านตอบล่าสุด, ขั้นก่อนส่งเมื่อ) + delayMin
```
- **"ร้านตอบล่าสุด"** = ข้อความขาออกล่าสุดที่ไม่ใช่ฟองที่ล้ม · ไม่ใช่ฟองของบอทติดตามเอง · ไม่ใช่แถวปักหมุด · ไม่ใช่ event (`shopReplySql` `store.ts:18-20`) — เปลี่ยนจาก "นับจากลูกค้าทัก" เมื่อ 14 ต.ค. (PR #828)
- **ร้านค้างตอบ** (ข้อความจริงล่าสุดเป็นขาเข้า) = บอทไม่นับเวลาและไม่ส่ง รอแอดมินก่อน (`engine.ts:190,245`)
- เพดาน 24 ชม. ยังนับจาก**ลูกค้าทักล่าสุด** (`WINDOW_MS` `model.ts:130`)
- ย้อนหาข้อความไม่เกิน 30 วัน (`LOOKBACK_DAYS` `model.ts:111`) เพราะ messages แบ่งพาร์ทิชัน ต้องมีขอบเวลา · ถ้าไม่เจอข้อความจริงใน 30 วันจะตัดสินจากคอลัมน์ของห้อง (`last_agent_reply_at`) (`engine.ts:185-190`)

### กรอบ 24 ชม. / ช่องทาง
| ช่องทาง | ขั้นธรรมดา | ขั้น `utility` เลย 24 ชม. |
|---|---|---|
| Messenger | หยุดด้วย `window` | **ส่งต่อได้** ผ่าน Utility template ของ Meta (`sendUtilityForBot` `src/lib/utility-templates/send.ts:388`) |
| LINE | หยุดด้วย `window` (**กติกาธุรกิจ** เพราะตัว LINE ไม่มีกรอบ `replyWindow:false` `capabilities.ts:45`) | **ส่งต่อได้** เป็น push: ข้อความที่เติมค่าแล้ว + ปุ่ม Flex (`send-deps.ts:191-203`) |
| Instagram | หยุดด้วย `window` | **ส่งไม่ได้ หยุดก่อนขั้นนั้น** (G7) · ภายใน 23 ชม. ส่งเป็นข้อความธรรมดา |

ตัดสินที่ `pastWindowOk` (`engine.ts:39`) + `botSendBlock(…, {ignoreWindow})` (`bot-bubble.ts:71-79`) · ตัวแปรของ utility = **ออเดอร์ล่าสุดของห้อง** · ไม่มีออเดอร์/ค่าขาด/เทมเพลตถูกระงับ = `skipped` (`send-deps.ts:184-196` · BR-AUTOREPLY-068 G6/G8)

### กันส่งซ้ำ (สรุป 4 ชั้น)
1. `follow_bot_sends UNIQUE(run_id, step)` + จองในธุรกรรมเดียวกับ `FOR UPDATE SKIP LOCKED` → หลาย pod หรือ pg-boss ส่งซ้ำ ก็ได้คนส่งคนเดียว (`engine.ts:7-9`)
2. แถว `sending` ค้าง → ปิดเป็น `failed` **ไม่ยิงซ้ำ**
3. `client_msg_id` คงที่ต่อ (run, ขั้น, ส่วน) จาก sha256 (`followClientId` `send-deps.ts:126-129`) → ลองใหม่แล้ว**ใช้ฟองเดิม** และส่วนที่ `sent` แล้วไม่ยิงซ้ำ (`send-deps.ts:173-182`)
4. เดินขั้นด้วย `WHERE next_step = ${step}` (optimistic)

---

## 4. เงื่อนไขหยุด + กติกาจบรอบ + สถานะออเดอร์ → แท็ก

### `stop_reason` ทุกค่า (`StopReason` `store.ts:23` · ข้อความบนจอ `STOP_TEXT` `store.ts:24-38` · CHECK ล่าสุด 0375)
| ค่า | เกิดเมื่อ | ที่ตัดสิน |
|---|---|---|
| `stage_changed` | แท็กสถานะของห้องเปลี่ยน (`stage_tagged_at` ไม่ตรง) หรือออกนอก `stage_keys` | `engine.ts:232` |
| `tag_removed` | ห้องไม่ตรงแท็กของร้านของบอทแล้ว (all = เอาออกตัวเดียวก็หยุด) | `engine.ts:233` · `tagsMatchSql` `store.ts:199-205` |
| `bot_disabled` | บอทถูกปิด | `engine.ts:234` · `store.ts:139` |
| `customer_replied` | **ลูกค้าส่งข้อความขาเข้าจริงหลังฟองที่บอทส่งสำเร็จ** | `engine.ts:236` · `customerRepliedSql` `store.ts:187-193` |
| `done` | ส่งครบทุกขั้น | `engine.ts:238,364` |
| `bot_shortened` | บอทถูกแก้ให้สั้นกว่า `next_step` | `engine.ts:238,248` |
| `window` | เลย 24 ชม. และขั้นถัดไปส่งเกินกรอบไม่ได้ / ไม่มีขาเข้า | `engine.ts:239-241,352` |
| `not_interested` | แอดมินตั้งห้องว่า "ไม่สนใจ" | `engine.ts:242` |
| `out_of_scope` | ห้องหลุดจากบัญชีของบอท / เปลี่ยนเป็นทดสอบ / ไม่ใช่แชททดสอบแล้ว | `engine.ts:243` |
| `admin` | แอดมินกดหยุดในห้อง | `src/app/inbox/follow-bot-actions.ts:111` |
| `bot_deleted` | ลบบอท | `store.ts:158` |
| `replaced` | แนบบอทเฉพาะกลุ่มทับบอทเดิม | `store.ts:278` |
| `bot_edited` | แก้ **โครงขั้น** (จำนวน/ชนิด/ลำดับ) ระหว่างที่ยังตามอยู่ · แก้แค่ถ้อยคำหรือเวลารอ = ตามต่อ | `store.ts:140` · `stepsEdited` `model.ts:279-283` |

ทุกครั้งที่หยุด จะลงบรรทัดระบบ (`sender_type 'system'`) ในห้อง (`stopRun` `store.ts:289-301`)

**"ลูกค้าตอบ"** = ข้อความขาเข้าที่ไม่ใช่ event (`eventLike` — LINE เพิ่มเพื่อน/บล็อก/เลิกบล็อกไม่นับ) และไม่ใช่แถวปักหมุด · นับเฉพาะ**หลังฟองที่ `sent`** · ก่อนขั้นแรกยังเป็น "รอแอดมิน" ตามเดิม (`store.ts:177-193`)
⚠️ ผลข้างเคียงที่รู้: ลูกค้ากดปุ่มในฟองของบอท (เช่น "สนใจ") ก็นับเป็นข้อความขาเข้า บอทจึงหยุดด้วย (`docs/follow-bot/customer-reply-stop-decisions.md:25`)

### กติกาจบรอบ (BR-AUTOREPLY-062 · `model.ts:39-60`)
ถ้าลูกค้าทักหลังจาก (เวลาติดแท็ก + N วัน) → รอบเก่าจบ ห้องกลับเป็น "ยังไม่ซื้อ" (เฟส 1)
- `cancelled` = 0 วัน (ทักใหม่ = ยังไม่ซื้อทันที) · **`shipped` = 14 วัน** · **`done` = 7 วัน** (`ROUND_HOLD_DAYS` `model.ts:55`)
- สถานะอื่น (ยังไม่ซื้อ · เปิดบิล · ยืนยันแล้ว · พัสดุมีปัญหา) ไม่จบรอบเอง
- ต้อง**เลย**กำหนด (`<` ไม่ใช่ `<=`) — `roundOverAt` `model.ts:57-60` ต้องตรงกับ SQL เฟส 1 (`engine.ts:106`)
- ออเดอร์ใหม่ยังย้ายห้องได้ทันทีโดยไม่ต้องผ่านกติกานี้

### เหตุการณ์ออเดอร์ GoSaaS (manual/OMS) → แท็ก (`stageOfEvent` `src/lib/auto-reply/order-events-process.ts:102-118`)
| เหตุการณ์ | แท็ก |
|---|---|
| `order.created` | เปิดบิล |
| `order.confirmed` · `order.payment_confirmed` (ชำระ**ครบ**เท่านั้น · มัดจำไม่ย้าย) | ยืนยันแล้ว (`paid`) |
| `shipment` `picked_up` / `on_delivery` | ส่งแล้ว |
| `shipment delivered` · `order completed` | สำเร็จ (CS-23358 · 17 ต.ค.) |
| `order canceled` | ยกเลิก |
| `shipment problem/on_return/returned` · `order returned` | พัสดุมีปัญหา |
- เหตุการณ์พัสดุ**ไม่ทับ** สำเร็จ/ยกเลิก (`stageKeepOf` `:169`)
- `setStage(…, { notBefore })` จะไม่ถอยสถานะถ้าเหตุการณ์เก่ามาช้า (`stage.ts:64`)
- **ห้องมีหลายออเดอร์ → แท็กยึดใบที่สร้างล่าสุดของห้องเท่านั้น** (`order-events-process.ts:345-346` · BR-AUTOREPLY-049 AC 13 · PR #992)

### สถานะ Marketplace → แท็ก (`src/lib/follow-bot/mkp-status.ts:11-28`)
- **Lazada:** `unpaid/pending`→เปิดบิล · `packed/ready_to_ship/topack/toship/repacked`→ยืนยันแล้ว · `shipped`→ส่งแล้ว · `delivered/confirmed`→สำเร็จ · `canceled`→ยกเลิก · `returned/shipped_back/lost_by_3pl/failed_delivery`→พัสดุมีปัญหา
- **Shopee:** `UNPAID`→เปิดบิล · `READY_TO_SHIP/PROCESSED/RETRY_SHIP`→ยืนยันแล้ว · `SHIPPED/TO_CONFIRM_RECEIVE`→ส่งแล้ว · `COMPLETED`→สำเร็จ · `CANCELLED/IN_CANCEL`→ยกเลิก · `TO_RETURN`→พัสดุมีปัญหา
- ค่าที่ไม่รู้จัก = ไม่ย้ายแท็ก แต่เก็บค่าดิบไว้ในดัชนี (CHECK แค่ความยาว ≤ 64 · `0253:22-26`)
- **ไม่รู้เวลาของสถานะ = ห้ามเดาเป็น now** (`mkp-status.ts:53,65`)
- ตัวรวม: `src/lib/follow-bot/mkp-order.ts` (`applyMkpOrderStatus` · `recountMkpBuyers` · `ensureMkpOrderCount`) · worker `index.mts:1607-1621` (Shopee) · `:1903-1910` (Lazada)
- ⚠️ Shopee ยังไม่ทำงานบน prod จนกว่าจะเปิดตรวจลายเซ็นกลับมา (BRD BR-AUTOREPLY-061 สถานะ)

---

## 5. BR + มติผู้ใช้

### BR ที่เกี่ยว (`doc-library/modules/auto-reply/BRD.md`)
| BR | บรรทัด | เรื่อง |
|---|---|---|
| BR-AUTOREPLY-049 | `:1086` | แท็กสถานะที่ระบบติดให้ (13 AC) |
| BR-AUTOREPLY-050 | `:1106` | ตั้งบอท (15 AC) |
| BR-AUTOREPLY-051 | `:1133` | การส่ง (13 AC) |
| BR-AUTOREPLY-052 | `:1154` | หน้าแชท (11 AC) |
| BR-AUTOREPLY-057 | `:1170` | เปิดเฉพาะบางร้าน → ทุกร้าน 12 ต.ค. |
| BR-AUTOREPLY-061 | `:1380` | Marketplace ย้ายแท็กจาก push |
| BR-AUTOREPLY-062 | `:1394` | กติกาจบรอบ 14/7/0 วัน |
| BR-AUTOREPLY-068 | `:1553` | ขั้น Utility ส่งเกิน 24 ชม. |
| BR-AUTOREPLY-069 | `:1582` | ปุ่มตอบกลับในฟอง |
| (เกี่ยวทางอ้อม) BR-AUTOREPLY-071 | `:1641` | ชุดแจ้งออเดอร์ส่ง Utility เกิน 24 ชม. (ใช้ตัวส่งเดียวกัน) |

### มติที่ผู้ใช้เคาะแล้ว (เรียงตามวัน)
- **8 ต.ค. 2569** — ไม่แนบห้องที่เลยเวลาขั้นแรกไปแล้ว (`engine.ts:124`) · แท็กสถานะเห็นและเปลี่ยนได้ที่ป้ายหัวห้องที่เดียว แบบ ค (`model.ts:63`) · แถวบอทแบบ B + ปุ่มเพิ่มแบบ C (`follow-bot-row.tsx:4`)
- **9 ต.ค.** — เลือกบัญชีระดับเพจแทนการติ๊กทั้งช่องทาง · สถานะ ปิด/ทดสอบ/เปิด (0205) · **1 บัญชีต่อ 1 บอทต่อแท็กสถานะ** (`store.ts:73,102-119`)
- **10 ต.ค.** — แท็กสถานะ 7 ตัว · `paid` แสดงว่า "ยืนยันแล้ว" · เปิดทุกร้านที่ใช้ OMS (`order-tags-allow.ts:3`)
- **12 ต.ค.** — เปิดเมนูบอทให้ทุกร้าน (`allow.ts:2`) · ขั้น "ข้อความที่ใช้บ่อย" · การ์ดสินค้าหลายชิ้น · เปลี่ยนชื่อ "รายสินค้า" เป็น "เฉพาะกลุ่ม"
- **13 ต.ค.** (ทีม) — การ์ดหลายชิ้นเป็นการ์ดเลื่อนข้างในข้อความเดียว ≤ 10 ชิ้น · ร้านไม่เชื่อม GoSaaS ไม่มีชนิดการ์ดสินค้า
- **14 ต.ค.** — ขั้นสูงสุด 5 → 10 · (ทีม) นับเวลาจากแอดมินตอบล่าสุด · ป้าย "บอทติดตาม:" ในรายการห้อง · เวลา "ส่งแล้ว" ใช้เวลาของฟอง
- **15 ต.ค.** — กติกาจบรอบ 14/7/0 · ยกเลิกเป็นสีแดง · ทุกคนแก้บอทได้ · แท็กสถานะ + แท็กร้านอยู่ในช่อง "แท็ก" ช่องเดียว · MKP ใช้เงื่อนไขเดียวกับ manual
- **17 ต.ค.** — พัสดุ delivered = สำเร็จ (CS-23358)
- **19 ต.ค.** — แท็กยึดออเดอร์ที่สร้างล่าสุดของห้อง
- **20–22 ต.ค.** — ขั้น Utility: ไม่มีเพดานเวลา (G3) · ไม่ดูว่าห้องมีออเดอร์ตอนตั้ง (G4) · ตัวแปรใช้ออเดอร์ล่าสุด (G6) · หลายช่องทาง (G7: LINE push + Flex แบบ ข · IG หยุด) · ถูกระงับ = ข้าม (G8) · หน้าต่างเลือกแบบ ข (G12) · ปุ่มอยู่ในฟอง แบบ ข (G14)
- **23 ต.ค.** — ร้านค้างตอบ = บอทรอแอดมินไม่มีกำหนด (แบบ ข) · ห้องที่กด ✓ ปิดงานแล้ว บอทยังส่งต่อ (แบบ ก) — BR-AUTOREPLY-068
- **4 พ.ย.** (`docs/follow-bot/customer-reply-stop-decisions.md`) — ลูกค้าตอบหลังบอทส่ง = **หยุดทั้งรอบ** (ข้อ 1, 2 ก) **ทับมติ 23 ต.ค. เฉพาะช่วงหลังบอทส่งขั้นแรกแล้ว**
- **5 พ.ย.** (ไฟล์เดียวกัน) — ไม่เลือกแท็กสถานะ = ทุกสถานะ (ข้อ 3 ก) · บอทที่ไม่มีแท็กสถานะ = จองทั้งเพจ (ข้อ 4 ก) · หยุดแล้วไม่หยิบห้องเดิมจนลูกค้าทักใหม่ (ข้อ 5 ข) โดยใช้เฉพาะบอทที่ไม่เลือกแท็กสถานะ (ข้อ 5.1 ก) · เอาแท็กออก = หยุด (ข้อ 7 ก)
- **5 พ.ย.** — ❌ ยกเลิก CS-23491 (ให้เริ่มนับวันจากตอนได้แท็กสถานะ เพื่อทักขอรีวิว) (`customer-reply-stop-decisions.md:63`) — **ข้อจำกัดที่ยังอยู่:** เฟส 2 หยิบเฉพาะห้องที่ลูกค้าทักภายใน 24 ชม. จึงทำ "ของถึงแล้ว X วันค่อยทักขอรีวิว" ไม่ได้

### ค่าที่ agent ตั้งเอง และผู้ใช้ยังไม่ได้ยืนยันชัด
- ลูกค้าตอบนับ**เฉพาะหลังบอทส่งขั้นแรก** (`customer-reply-stop-decisions.md:11` "ผมตั้งเอง (ยังไม่ได้ถาม)") · ต่อมาผู้ใช้ตอบ "เอาด้วยกันนี้แหละ" (`:22`) ซึ่งครอบข้อ 17–21 แต่ข้อ 1.1 ไม่ได้ถามตรง ๆ
- บอทตามเงื่อนไขต้องมีแท็กอย่างน้อย 1 ตัว · แท็กร้านถูกลบหมด = ไม่แนบห้องใหม่ (`:43-44` "ค่าที่ผมตั้งเอง")
- กดปุ่มในฟองของบอท = หยุดด้วย — แจ้งเป็นผลข้างเคียงไว้แล้ว ถ้าอยากให้ตามต่อต้องเคาะใหม่ (`:25`)
- ตัวเลขวิศวกรรมที่ไม่มีใน BRD: claim 50 run/รอบ · 200 ห้อง/เฟส · `sending` ค้าง 10 นาที · ลองใหม่ 60 นาที พักทีละ 5 นาที · ย้อนดู 30 วัน · ป้ายกระพริบ 10 นาที (`engine.ts:22-31` · `model.ts:111`)
- เพดาน 23 ชม. (เผื่อ 1 ชม.) มาจากข้อยุติ 8 ต.ค. (`model.ts:4`) ไม่ใช่ข้อจำกัดของ Meta ตรง ๆ

---

## 6. หน้าจอ

| หน้าจอ | ไฟล์ UI | ม็อกอัพ |
|---|---|---|
| รายการบอท + แท็บประวัติการส่ง (`/sales-bot`) | `src/app/(app)/sales-bot/page.tsx` · `list.tsx` (กรองด้วยเม็ด ทั้งหมด/ตามเงื่อนไข/เฉพาะกลุ่ม · สถานะเป็นป้ายอ่านอย่างเดียว · ประวัติแบ่งหน้าแบบ keyset `store.ts:310-338`) | `docs/follow-bot/mockup.html` `listView()` `logView()` |
| ฟอร์มสร้าง/แก้ (`/sales-bot/new` · `/sales-bot/[id]`) | `src/app/(app)/sales-bot/[id]/editor.tsx` (1,172 บรรทัด: step rail · ตัวอย่างในแชท · ตัวเลือกบัญชี/แชททดสอบ · ตัวเลือกสินค้าเป็นตารางการ์ด · ตัวเลือก Utility · ตัวแก้ปุ่ม) · `editor-data.ts` · `new/page.tsx` · `[id]/page.tsx` | `mockup.html` `editView()` `stepCard()` `phone()` · `docs/mockups/fb-utility-templates.html` ส่วน G (`#v=g-edit` …) |
| ด่านแพ็กเกจ / "เร็ว ๆ นี้" | `src/app/(app)/sales-bot/plan-locked.tsx` | — |
| แถวบอทในแผงขวาของห้องแชท (ขั้นล่าสุด·ปัจจุบัน·ถัดไป · "รอคุณตอบลูกค้า" · ✕/– ส่งไม่สำเร็จ/ข้าม · ปุ่มหยุด) | `src/app/inbox/follow-bot-row.tsx` (ข้อมูลจาก `roomBot` `store.ts:206-250`) | `mockup.html` `botRow()` `addRow()` `#v=room-follow-b` … |
| กล่องแนบบอทเฉพาะกลุ่ม + สินค้าแนะนำ | `src/app/inbox/follow-bot-attach.tsx` · สินค้าแนะนำจาก `src/lib/follow-bot/suggest.ts` (การ์ดที่เคยส่ง → ร่างออเดอร์ → CF ไลฟ์ · ≤ 5) | `mockup.html` `attachModal()` |
| เมนูสถานะที่หัวห้อง (ป้ายแท็กสถานะ + เปลี่ยนเอง + ลงประวัติการแก้) | `src/app/inbox/follow-bot-stage.tsx` · `src/lib/follow-bot/stage-manual.ts` | `mockup.html` `header()` `#v=status` · `docs/mockups/order-status-tags.html` |
| ป้าย ◎ บนรูปลูกค้าในรายการห้อง (กระพริบเมื่อจะส่งภายใน 10 นาที) · คำนำหน้า "บอทติดตาม:" | `src/app/inbox/data.ts:2142,2244-2268` (`follow_bot` = on/soon · `last_follow`) · `src/app/inbox/rows.tsx` | — |
| ป้ายล็อก (ห้องล็อกให้คนอื่น/ออฟไลน์ → ปุ่ม `aria-disabled` + tooltip · ป้ายสถานะไม่จาง + ไอคอนกุญแจ) | `follow-bot-row.tsx:15` · `follow-bot-stage.tsx:14` | ผลตรวจ `docs/follow-bot/ui-audit-2026-10-08.md` · `-10-09.md` |
| ฟองบอทในแชท (ป้าย "บอทติดตาม · ขั้น N" · การ์ดน้ำเงินเมื่อมีปุ่ม) | `src/app/inbox/bot-badge.tsx` · `thread.tsx` (`meta_context.botButtons` / `utility`) | `fb-utility-templates.html` `#v=g-chat` |
| คู่มือผู้ใช้ | `help-seed/articles/crm-sales-bot.mjs` · `crm-sales-bot-product.mjs` | — |

---

## 7. API (Next.js server actions — ไม่มี REST)

**หน้า `/sales-bot`** — `src/app/(app)/sales-bot/actions.ts` (ทุกตัวผ่าน `salesBotAllowed` `:31` และใช้ `withTenant` · เขียนต้องผ่าน `canEditFollowBots`)
| ฟังก์ชัน | บรรทัด | ทำอะไร |
|---|---|---|
| `saveFollowBot(slug, form)` | `:35` | สร้าง/แก้ → `saveBot` (`store.ts:76-152`) · คืน `BotRow` |
| `deleteFollowBot(slug, id)` | `:60` | ลบแบบ soft + หยุดทุกห้อง |
| `listFollowSends(slug, cursor)` | `:67` | ประวัติการส่ง แบ่งหน้าแบบ keyset `"<ts>|<id>"` |
| `searchFollowTestChats(slug, accountIds, q)` | `:49` | ค้นแชททดสอบ |
| `browseFollowProducts(slug, {q,page})` | `:74` | ค้นคลังสินค้า GoSaaS |
| `createFollowTag(slug, name)` | `:87` | สร้างแท็กของร้านจากในฟอร์ม |

**แผงในห้องแชท** — `src/app/inbox/follow-bot-actions.ts`
| ฟังก์ชัน | บรรทัด | ทำอะไร |
|---|---|---|
| `loadRoomFollow(slug, conversationId)` | `:47` | แถวบอท + สินค้าแนะนำ |
| `loadProductBots(slug, conversationId)` | `:63` | บอทเฉพาะกลุ่มที่ใช้กับห้องนี้ได้ (`botUsableIn` `store.ts:256-260`) |
| `attachFollowBot(slug, conv, botId, productId)` | `:80` | แนบบอทเฉพาะกลุ่ม |
| `stopFollowBot(slug, conv)` | `:106` | หยุด (`admin`) |
| `setRoomStage(slug, conv, key)` | `:121` | เปลี่ยนแท็กสถานะเอง |

ทุก action **คืนข้อมูลที่เปลี่ยน** ไม่ใช้ `revalidatePath` / `router.refresh` (`follow-bot-actions.ts:8`) · ขาเข้าของปุ่ม: Messenger/IG postback `gcb:<botId>:<ขั้น>:<n>` → worker ลงห้องเป็นข้อความลูกค้า = ชื่อปุ่ม (`button-label.ts` · `index.mts:48`)

---

## 8. บั๊กและบทเรียนหลังขึ้น prod (กับดักที่ safepay ไม่ควรเหยียบซ้ำ)

1. **CHECK ที่ล็อกเลขไว้หลายตาราง (PR #831 · `0247:2-5`)** — ขยายขั้น 5 → 10 แต่ขยายแค่ `steps` จะทำให้ INSERT `follow_bot_sends.step=5` ล้ม แล้ว**ธุรกรรม claim ของทั้งร้านย้อนกลับ บอททุกตัวในร้านหยุด** (db-auditor ตีเป็น P0) → เวลาเปลี่ยนเพดาน ให้ไล่ทุก CHECK ที่อ้างเลขนั้น
2. **ไมโครวินาทีหาย (`engine.ts:10` · `stage.ts:31,68`)** — `Date` ของ JS ตัดไมโครวินาทีทิ้ง ถ้าเทียบ `stage_tagged_at` ฝั่ง JS จะเห็นว่าเปลี่ยนทุกรอบ → **เทียบใน SQL เท่านั้น** ส่งเวลาเป็น `::text::timestamptz` · cursor ของประวัติก็เป็นข้อความด้วย (`store.ts:324`)
3. **postgres.js กับ jsonb (`engine.ts:96`)** — ส่ง JSON เป็นพารามิเตอร์ jsonb ตรง ๆ จะถูก stringify ซ้ำจนได้ scalar แล้ว `->>` คืน NULL ทุกคีย์ → ใช้ `::text::jsonb`
4. **นับเวลาจากร้านตอบล่าสุด ไม่ใช่ลูกค้าทัก (PR #828 · 14–16 ต.ค.)** — นับจากลูกค้าทักทำให้แอดมินที่ตอบช้ากว่าเวลารอ ถูกบอทยิงตามทันที · และ**ฟองแดง (ส่งล้ม) ต้องไม่นับเป็น "ร้านตอบ"** ไม่งั้นการลองใหม่รีเซ็ตนาฬิกาไปเรื่อย ๆ จนหลุดกรอบ 24 ชม. (code-auditor P1-1 `store.ts:15-16`) · ตรวจซ้ำก่อนยิง: ถ้าแอดมินเพิ่งตอบหลัง claim = ไม่ยิง
5. **กติกาจบรอบ (PR #872 · 15 ต.ค.)** — กติกาเดิม (ส่งแล้ว/สำเร็จ ทักใหม่ = ยังไม่ซื้อทันที) **ทำให้บอทตามขายคนที่เพิ่งซื้อ** (เคสจริง: Shopee สำเร็จ 12 ต.ค. ลูกค้าทักถามวันที่ 14 ต.ค.) → คงสถานะไว้ 14/7 วัน · ห้องที่ถูกรีเซ็ตไปแล้วคืนได้ด้วย `scripts/restore-stage-round-hold.ts` (ประทับเวลาเดิม ช่วงคงสถานะจึงไม่ต่ออายุ)
6. **ประทับเวลาแท็กด้วยเวลาที่เหตุการณ์เกิด (#909 · `engine.ts:91`)** — ถ้าประทับ `now()` เหตุการณ์ออเดอร์ที่มาช้าจะแพ้ `notBefore` ห้องที่ซื้อแล้วจะค้าง "ยังไม่ซื้อ" แล้วโดนบอทตาม · ออเดอร์หลายใบในรอบเดียวกันต้องซ่อมด้วย `scripts/repair-stage-same-batch.ts`
7. **delivered → สำเร็จ (CS-23358 · PR #929)** — ร้านส่วนใหญ่ไม่กดปิดออเดอร์ ห้องค้าง "ส่งแล้ว" · สคริปต์ซ่อม `scripts/repair-stage-delivered.ts` ห้ามประทับเวลาอนาคต
8. **ห้องหลายออเดอร์ (PR #992)** — เหตุการณ์ของใบเก่า (เช่นยกเลิกใบเก่า) ทับสถานะของใบใหม่ → แท็กต้องยึดใบที่สร้างล่าสุด · Lazada ส่ง push มาเป็นรายชิ้น ใบที่เห็นครั้งแรกจาก push จึงมีเวลาสร้างแบบประมาณ (`created_at_estimated` 0284) ห้ามใช้ตัดสินว่าใบไหนล่าสุด (`mkp-order.ts:10-13`)
9. **CS-23480 (PR #1265 · 4–5 พ.ย.)** — (ก) บังคับให้เลือกแท็กสถานะ ≥ 1 ทำให้ใส่แท็กของร้านตัวเดียวแล้วบันทึกไม่ได้ ต้นเหตุคือกติกา ไม่ใช่หน้าตา · (ข) ลูกค้าตอบแล้วบอทยังตาม → เพิ่ม `customer_replied` · (ค) **บอททุกสถานะ หยุดเพราะสถานะเปลี่ยน แล้วนาทีถัดไปหยิบห้องเดิมใหม่ในสถานะใหม่ = ส่งหาคนที่เพิ่งจ่าย** (code-auditor P1) → ต้องรอลูกค้าทักใหม่ · (ง) ตอนแรกนิยาม "ตอบ" ด้วย `last_inbound_at` ตัวเดียว ลูกค้าบล็อก OA ก็ขึ้นว่า "ตอบแล้ว" → ต้องตัด event ออก
10. **PR #1268 (5 พ.ย.)** — แต่ก่อนเช็กแท็กของร้านแค่ตอนหยิบห้อง แอดมินเอาแท็กออกแล้วบอทยังตาม → เพิ่ม `tag_removed` + เช็กซ้ำก่อนยิง
11. **ยิงหลัง COMMIT และห้าม throw** — ถ้ายิงในธุรกรรมแล้วธุรกรรม rollback ข้อความออกไปแล้วแต่ไม่มีบันทึก → ส่งซ้ำ
12. **รายชื่อร้านกันแค่ทางเข้า** (`allow.ts:7`) — worker ส่งตามแถวใน DB เสมอ · ปิดฟีเจอร์ = ต้องปิดบอทในข้อมูลด้วย
13. **เปิดบอทใหม่ต้องไม่ยิงห้องเก่า** (`engine.ts:124`) — ถ้าไม่มีด่าน "ยังไม่เลยเวลาขั้นแรก" เปิดบอทครั้งแรกจะทักลูกค้าทั้งร้านพร้อมกัน
14. **ช่วง rollout** — CHECK ใหม่ต้อง "เพิ่มค่าอย่างเดียว" เพราะ worker รุ่นเก่ายังรันอยู่ · `testing` ออกแบบให้ `enabled=false` เสมอ worker รุ่นเก่าจึงไม่ส่งให้บอทที่ทดสอบอยู่ (`0205:11-12`)
15. **ห้องที่ค้าง active นาน** — ขั้น Utility ไม่มีกรอบ 24 ชม. มาหยุดให้ ห้องที่ร้านค้างตอบจึงค้าง run `active` ได้ไม่มีกำหนด (BR-AUTOREPLY-068 · db-auditor P3-3 ให้เฝ้าดูจำนวน)

เทสที่ครอบ: `scripts/test-follow-bot.ts` (engine) · `test-follow-bot-model.ts` · `test-follow-bot-send.ts` · `test-mkp-order-tags.ts` · `test-restore-stage-round-hold.ts` · `test-repair-stage-same-batch.ts`

---

## 9. ส่วนที่ผูกกับระบบเฉพาะของ gochat (ต้องหาตัวเทียบฝั่ง safepay)

| ของ gochat | ใช้ทำอะไรใน follow-bot | ต้องหาตัวเทียบ |
|---|---|---|
| **GoSaaS OMS events** (`order.created/confirmed/payment_confirmed/status_changed` · `shipment.status_changed`) | ตัวย้ายแท็กสถานะ (`stageOfEvent`) | แหล่งสถานะออเดอร์ของ safepay |
| **MKP push** (Shopee code 3 · Lazada message_type 0) + ดัชนี `shopee/lazada_order_index` | แท็กของห้อง Marketplace | ถ้า safepay ไม่มี MKP ให้ข้ามทั้งชุด |
| `eventLike` (`src/lib/inbox-awaiting`) | แยก "ข้อความจริง" ออกจาก event (LINE follow/unfollow ฯลฯ) ใช้ตัดสินลูกค้าตอบ/ร้านค้างตอบ | นิยาม "ข้อความจริง" ของ safepay |
| `meta_context ? 'gcPin'` / `'followBot'` | ตัดแถวปักหมุดและฟองของบอทเองออกจาก "ร้านตอบ" | ป้ายบนข้อความที่บอกว่าใครส่ง |
| `conversations.last_inbound_at` · `last_agent_reply_at` (ไม่นับฟองบอท · 0092) · `sales_status` (`not_interested`) | ใช้เป็นด่านถูก ๆ ก่อนจะเปิดอ่าน messages | คอลัมน์สรุปของห้อง |
| **AI ตอบเอง (Q97 / BR-AI-047)** `autoSendOn()` + SQL `ai_room_auto(c.id)` | ไม่แนบห้องที่ AI ตอบเอง · run ที่ติดอยู่แล้วพักการส่ง (`engine.ts:147,182,237`) | ถ้า safepay มีบอท/AI ตอบเอง ต้องกำหนดว่าใครมีสิทธิ์ก่อน |
| `botAccessBlock` / `featureBlock('autoReply')` / `loadTenantAccess` | ด่านแพ็กเกจ/ระงับระดับร้าน | ระบบแพ็กเกจของ safepay |
| `botSendBlock` + `capsOf(channel).replyWindow` + `replyMode` | ด่านช่องทาง/สิทธิ์ส่ง/24 ชม. | ตัวบอกความสามารถของแต่ละช่องทาง |
| `sendBotBubble` · `senderFor(channel).sendButtons/sendCard/sendAttachments` | ลงฟอง + ส่งจริง + จำ `client_msg_id` | ตัวส่งข้อความของ safepay |
| **Utility template ของ Meta** (`utility_templates` · `sendUtilityForBot` · `botValues` · `utilityPilot`/`META_UTILITY`) | ส่งเกิน 24 ชม. บน Messenger | ต้องมีเทมเพลตที่ Meta อนุมัติ + ตัวเลือก "ออเดอร์ล่าสุดของห้อง" |
| `social_product_snapshots` · `buildSocialProductCard` · คลัง GoSaaS | การ์ดสินค้า + `{ราคา}` ตอนส่ง | แคตตาล็อกสินค้าของ safepay |
| `quick_replies` (`loadQuickReplies` · `qrMessages`) | ขั้นข้อความที่ใช้บ่อย | ถ้าไม่มีให้ตัดชนิดนี้ |
| `live_order_messages` / `live_orders` / `order_command_sessions` | สินค้าแนะนำในกล่องแนบ | ตัดได้ (เป็นแค่ตัวช่วย) |
| `tags` + `conversation_tags` + `runStageChangeSafe` (กฎแท็ก v11) | แท็กสถานะ/แท็กร้าน + กฎแท็กที่ทำงานเมื่อสถานะเปลี่ยน | ระบบแท็กของ safepay |
| `pg_notify('gochat_msg', kind 'contact')` → SSE | ปลุกรายการห้อง (ป้าย ◎ / แถวบอท) | ช่องทาง realtime ของ safepay |
| pg-boss `schedule('* * * * *')` + `eachTenant` | รอบรันทุกนาทีต่อร้าน | ตัวตั้งเวลางานของ safepay |
| RLS `app_tenant_id()` + `set_config('app.tenant_id')` | แยกร้าน | ต้องมีการแยก tenant แบบเดียวกัน |

---

## ข้อที่ไม่ได้ตรวจลึก / ไม่แน่ใจ
- `editor.tsx` (1,172 บรรทัด) อ่านแค่หัวไฟล์ ไม่ได้ไล่ทุก state ของฟอร์ม · พฤติกรรม UI อ้างจาก BRD + หัวไฟล์
- `mkp-order.ts` อ่านแค่ส่วนหัว (กติกา) ไม่ได้ไล่ทุกฟังก์ชัน
- ตัวเลขบน prod (จำนวนบอท/run ที่ active) ไม่ได้ดู เพราะเอกสารนี้อ่านจากโค้ดเท่านั้น
- BRD บอกว่า **Utility กับปุ่มขาเข้ายังไม่เคยลองกับเพจ/OA จริง** (BR-AUTOREPLY-068/069 สถานะ) และ Shopee ยังไม่ทำงานบน prod

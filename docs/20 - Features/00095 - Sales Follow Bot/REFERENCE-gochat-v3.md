# บอทติดตามยอดขาย (follow-bot · `/sales-bot`) — เอกสารอ้างอิงจาก gochat-v3

> แหล่ง: gochat-v3 `origin/main` @ `cff4a049a` (worktree อ่านอย่างเดียว `/Users/craftman/Projects/gosaas/_wt-followbot-ref`)
> ทุก `path:line` = ไฟล์ใน repo gochat-v3 ที่ commit นั้น · เขียนจากโค้ดจริง · เอกสารขัดกับโค้ด = ยึดโค้ด และจดไว้ในกล่อง **[ขัด]**
> ชื่อเรียก: เมนู "บอทติดตามยอดขาย" (`src/components/nav-rail-v2.tsx:189` ไอคอน `ph-target`) · โค้ด `follow-bot` · ทีมเรียก "บอทขุด"
> ฝั่ง safepay: เทียบกับฉบับของอีก session `REFERENCE-gochat-v3-by-session.md` ไว้ท้ายไฟล์ (หัวข้อ "ข้อขัดกับฉบับ session")

---

## 1. ภาพรวม · ผู้ใช้ทำอะไรได้

**ปัญหา:** ลูกค้าทักแล้วเงียบ ร้านต้องไล่ทักเอง → บอททักตามเป็นขั้นตามเวลาที่ตั้ง หยุดเองเมื่อสถานะการขายเปลี่ยน/ลูกค้าตอบ/เลยกรอบช่องทาง (`doc-library/modules/auto-reply/BRD.md:1106-1165`)

### 1.1 บอทสองประเภท (`BotKind` `src/lib/follow-bot/model.ts:72`)

| | ตามเงื่อนไข `condition` | เฉพาะกลุ่ม `product` (เดิม "รายสินค้า") |
|---|---|---|
| ใครแนบเข้าห้อง | engine แนบเองทุกนาที (`src/lib/follow-bot/engine.ts:129-164`) | แอดมินกดแนบในแผงขวาของห้อง (`src/lib/follow-bot/store.ts:262-287` · แนบเองได้เฉพาะชนิดนี้ `store.ts:267`) |
| เงื่อนไข | แท็กสถานะ (หลายค่า · ว่าง = ทุกสถานะ) + แท็กของร้าน (any/all) + บัญชีเพจ/OA | ไม่มีเงื่อนไข · ผูกสินค้า 1 ชิ้นตอนแนบ (`follow_bot_runs.product_id/product`) |
| ตัวแปรข้อความ | `{ชื่อ}` เท่านั้น — ใช้ `{สินค้า}` `{ราคา}` = บันทึกไม่ได้ (`model.ts:203`) | `{ชื่อ}` `{สินค้า}` `{ราคา}` (`fillVars` `model.ts:285-287`) · `{ราคา}` = ราคาในคลังตอนส่ง (`engine.ts:200,325`) |
| ขั้นการ์ดสินค้า | ต้องเลือกสินค้า ≥1 ≤10 ชิ้น (`model.ts:201-202`) | ไม่เลือก = ใช้สินค้าของ run (`send-deps.ts:209`) |
| แนบได้เมื่อ | ลูกค้าทัก < 24 ชม. **และยังไม่เลยเวลาขั้นแรก** (`engine.ts:140,144`) | ลูกค้าทัก < 24 ชม. (`store.ts:271`) · ทับบอทเดิมของห้อง (`replaced` `store.ts:278`) |
| คำอธิบายบนจอ | "หว่านกว้าง ตามทุกห้องที่ตรงแท็กสถานะ แท็ก และบัญชี…" (`src/app/(app)/sales-bot/[id]/editor.tsx:106`) | "แอดมินแนบเองในห้องแชท ตามเฉพาะสินค้าหรือกลุ่มลูกค้า…" (`editor.tsx:107`) |

เปลี่ยนประเภทหลังสร้างไม่ได้ (`store.ts:135`)

### 1.2 ชนิดขั้น (`StepKind` `model.ts:77` · ป้ายบนจอ `editor.tsx:110-116`)

| ชนิด | ป้าย | ส่งอะไร | กติกา |
|---|---|---|---|
| `text` | ข้อความ | ฟองข้อความ (+ปุ่ม 0–3) | ≤1,000 ตัว · มีปุ่ม ≤640 (`model.ts:95-101,195-198`) |
| `text_image` | ข้อความ + รูป | ไม่มีปุ่ม: ข้อความแล้วรูป · มีปุ่ม: **รูปก่อน** แล้วข้อความ+ปุ่ม (`send-deps.ts:293-320`) | ต้องเลือกรูป (`model.ts:200`) |
| `product` | การ์ดสินค้า | ข้อความ (ถ้ามี) แล้ว **การ์ดเลื่อนข้างในข้อความเดียว** (`send-deps.ts:206-247`) · ชิ้นที่หมด/หาไม่เจอข้าม เหลือ 0 = ล้มไม่ลองซ้ำ (`:216-224`) | ≤10 ชิ้น (`MAX_PRODUCT_PICKS` `model.ts:116`) · ซ่อนแท็บถ้าร้านไม่เชื่อม GoSaaS (`editor.tsx:699` · `editor-data.ts:66`) |
| `quick_reply` | ข้อความที่ใช้บ่อย | ส่งทุกรายการตามลำดับ ทีละข้อความ+รูปของมัน (`send-deps.ts:263-288`) · ตัวแปรที่ไม่มีค่าตัดทิ้ง (`:273`) · รายการถูกลบ/ปิดข้าม เหลือ 0 = ล้ม (`:269,286`) | ≤5 รายการ (`MAX_PICKS` `model.ts:90,185`) |
| `utility` | ข้อความแจ้งเตือนลูกค้า (Utility) | Messenger = เทมเพลต Meta (`send-deps.ts:187-190`) · LINE = ข้อความที่เติมค่าแล้ว+ปุ่ม Flex แบบ push · Instagram = ข้อความธรรมดา (`:191-203`) | ต้องเลือก template (`model.ts:174`) · **ไม่มีเพดานเวลา** (`model.ts:175`) · ร้านต้องเปิดสวิตช์ (`model.ts:170`) · บอทมีแต่ IG ใช้ไม่ได้ (`model.ts:171-173`) |

- ขั้นที่เวลาสะสมเกิน 23 ชม. ในฟอร์ม **เปลี่ยนเป็น utility เอง** (`fixPast` `editor.tsx:163-167`) และชนิดอื่นล็อกพร้อมเหตุผล `PAST_WHY` (`editor.tsx:141,700`)
- หน่วยเวลา นาที/ชั่วโมง/วัน (`editor.tsx:130-135`) — "วัน" เฉพาะบอทที่ใช้ utility ได้ (`editor.tsx:671`)

### 1.3 ปุ่มในข้อความ (BR-AUTOREPLY-069 · `BRD.md:1582-1604`)
- ขั้น `text`/`text_image` เท่านั้น (`stepButtons` `model.ts:97-99`) · 0–3 ปุ่ม (`BUTTONS_MAX = GENERIC_BUTTONS_MAX` `model.ts:92`) · ปุ่มละ ≤20 ตัว (`BUTTON_LEN` `model.ts:93` · BRD `:1587`) · ห้ามว่าง/ซ้ำ (`model.ts:192-194`)
- ส่ง: Messenger/IG = button template payload `gcb:<botId>:<ขั้น>` (`send-deps.ts:309-311`) · LINE = Flex; postback เฉพาะร้านนำร่องแท็ก v11 (`tagsPilot` `send-deps.ts:307-310`) ร้านอื่น action แบบ message
- แทน `{ชื่อ}` แล้วเกิน 640 = ตัดชื่อลูกค้าให้พอดี แล้วค่อยตัดท้าย+… (`fitText` `send-deps.ts:139-150`) · LINE ไม่ตัด (`:306`)
- ขาเข้า: LINE ส่งมาแต่รหัส → หาคำบนปุ่มจากฟองบอทในห้อง (`src/lib/follow-bot/button-label.ts:10-20` · ใช้ที่ `src/worker/index.mts:48`)
- ⚠️ ลูกค้ากดปุ่ม = ข้อความขาเข้า ⇒ บอทหยุด `customer_replied` (`docs/follow-bot/customer-reply-stop-decisions.md:25`)

### 1.4 สถานะบอท 3 แบบ
ปิด / ทดสอบ / เปิดใช้ (`MODE_LABEL` `model.ts:119-121`) · เก็บเป็น `enabled`,`testing` + CHECK `NOT (enabled AND testing)` (`db/migrations/0205_follow_bot_accounts_test.sql:13-15`) · ทดสอบ = แนบ/ส่งเฉพาะแชททดสอบ 1–20 (`model.ts:132,157-158` · `engine.ts:142`) · บอทใหม่เริ่ม "ปิด" (`editor.tsx:368`)

---

## 2. Data model

### 2.1 ตาราง (SQL ย่อ — ค่าล่าสุดหลังทุก migration)

```sql
-- แท็กสถานะ = แถวใน tags ที่มี system_key (0201:11-15 · ค่าปัจจุบัน 0220:15-17)
ALTER TABLE tags ADD COLUMN system_key text
  CHECK (system_key IS NULL OR system_key = ANY('{not_bought,billed,paid,shipped,done,problem,cancelled}'));
CREATE UNIQUE INDEX tags_one_system_key ON tags (tenant_id, system_key) WHERE system_key IS NOT NULL;

CREATE TABLE follow_bots (                                   -- 0201:17-35
  id uuid PK, tenant_id uuid NOT NULL → tenants CASCADE,
  name text NOT NULL CHECK (btrim(name)<>'' AND length(name)<=60),
  kind text NOT NULL CHECK (kind IN ('condition','product')),
  enabled boolean NOT NULL DEFAULT false,
  testing boolean NOT NULL DEFAULT false,                    -- 0205:13 · CHECK NOT(enabled AND testing) 0205:15
  stage_keys text[] NOT NULL DEFAULT '{}' CHECK (stage_keys <@ 7 คีย์),   -- 0220:19-21
  tag_ids uuid[] NOT NULL DEFAULT '{}',                       -- ไม่มี FK — ลบแท็กต้อง array_remove เอง
  tag_match text NOT NULL DEFAULT 'any' CHECK (tag_match IN ('any','all')),
  channels text[] DEFAULT '{messenger,instagram,line}',       -- ซากก่อน 0205 · ยังเขียนให้โค้ดเก่า (store.ts:84)
  steps jsonb NOT NULL CHECK (jsonb_typeof='array' AND length BETWEEN 1 AND 10),   -- 0247:10-12
  created_by uuid → users SET NULL, created_at, updated_at,
  deleted_at timestamptz,                                     -- soft delete · ทุกคิวรีกรอง IS NULL
  UNIQUE (tenant_id, id));
CREATE INDEX follow_bots_tenant_id_enabled_idx ON follow_bots (tenant_id, enabled);

CREATE TABLE follow_bot_runs (                               -- 0201:37-69 · "บอทที่ติดกับห้อง"
  id uuid PK, tenant_id, conversation_id uuid, bot_id uuid,
  stage_tagged_at timestamptz NOT NULL,   -- created_at ของแท็กสถานะตอนแนบ · เปลี่ยน = หยุด
  product_id text, product jsonb CHECK (NULL OR object),     -- บอทเฉพาะกลุ่ม {name, price}
  next_step int NOT NULL DEFAULT 0 CHECK (0..10),            -- 0247:13-14
  last_sent_at, next_due_at timestamptz,                     -- next_due_at ใช้ทำป้ายกระพริบ
  status text DEFAULT 'active' CHECK (status IN ('active','done','stopped')),
  stop_reason text CHECK (13 ค่า — ดูข้อ 4),                 -- ล่าสุด 0375:11-14
  started_by, stopped_by → users SET NULL, created_at, updated_at, finished_at,
  UNIQUE (tenant_id, id),
  FK (tenant_id, conversation_id) → conversations CASCADE, FK (tenant_id, bot_id) → follow_bots CASCADE);
CREATE UNIQUE INDEX follow_bot_runs_one_active ON follow_bot_runs (tenant_id, conversation_id) WHERE status='active'; -- ห้องละ 1
CREATE UNIQUE INDEX follow_bot_runs_once ON follow_bot_runs (tenant_id, conversation_id, bot_id, stage_tagged_at);    -- บอทเดิม×ห้อง×รอบสถานะ = ครั้งเดียว
CREATE INDEX follow_bot_runs_tenant_id_bot_id_idx ON follow_bot_runs (tenant_id, bot_id) WHERE status='active';

CREATE TABLE follow_bot_sends (                              -- 0201:71-95 · ประวัติ + กุญแจกันส่งซ้ำ
  id bigserial PK, tenant_id, run_id uuid, conversation_id uuid,
  bot_id uuid,                            -- ไม่มี FK โดยตั้งใจ (ประวัติอยู่หลังลบบอท 0201:93)
  step int CHECK (0..9),                  -- 0247:15-16
  status text CHECK (status IN ('sending','sent','failed','skipped')),
  reason text, message_id uuid, created_at, updated_at,
  UNIQUE (run_id, step),                  -- ★ ตัวกันส่งซ้ำ
  FK (tenant_id, run_id) → runs CASCADE, FK (tenant_id, conversation_id) → conversations CASCADE);
CREATE INDEX ON follow_bot_sends (tenant_id, conversation_id);
CREATE INDEX ON follow_bot_sends (tenant_id, created_at DESC);   -- keyset ของแท็บประวัติ

CREATE TABLE follow_bot_accounts (                           -- 0205:23-37 · บัญชีเพจ/IG/OA ของบอท
  tenant_id, bot_id, channel_account_id, PRIMARY KEY (bot_id, channel_account_id),
  FK → follow_bots CASCADE, FK → channel_accounts CASCADE);
CREATE INDEX ON follow_bot_accounts (tenant_id, channel_account_id);

CREATE TABLE follow_bot_test_contacts (                      -- 0205:40-56 · แชททดสอบเก็บเป็น contact
  tenant_id, bot_id, contact_id, created_by → users SET NULL, created_at,
  PRIMARY KEY (bot_id, contact_id), FK → follow_bots CASCADE, FK → contacts CASCADE);
-- ทุกตาราง ENABLE+FORCE RLS policy tenant_isolation (tenant_id = app_tenant_id()) — 0201:97-107 · 0205:58-68
```

- รูป `steps` jsonb แต่ละขั้น: `{delayMin, kind, text, mediaAssetId?, productId?(เก่า), productIds?, quickReplyIds?, templateId?, buttons?}` (`model.ts:84-88`) · อ่านสินค้าผ่าน `stepProducts()` เสมอ (`model.ts:117`)
- index เสริม `live_order_messages (tenant_id, conversation_id, created_at DESC)` สำหรับสินค้าแนะนำ (`0201:114-115`)
- **ไม่มี retention** ของ runs/sends (db-audit ชี้ไว้ `docs/follow-bot/db-audit-2026-10-08.md:118-121`; ค้นใน `src/lib`/`src/worker` ไม่พบงานลบตามอายุ — มีแค่ `src/lib/tenant-purge.ts:56` ตอนลบร้าน)

### 2.2 migration ที่แตะ follow_bot / แท็กสถานะ
| ไฟล์ | เรื่อง |
|---|---|
| `0201_follow_bots.sql` | `tags.system_key` (5 ค่า) + 3 ตาราง + RLS |
| `0205_follow_bot_accounts_test.sql` | `testing` · `follow_bot_accounts` · `follow_bot_test_contacts` · `out_of_scope` · เติมบัญชีย้อนหลังทีละร้านด้วย `set_config` (`:73-86`) |
| `0220_order_status_tags.sql` | system_key/stage_keys 5→7 (`done`,`problem`) · ไม่ย้ายคีย์ `paid` (`:5-8`) |
| `0247_follow_bots_steps_max_10.sql` | ขั้น 5→10 ขยาย CHECK **3 ตาราง** (`:2-5`) |
| `0371` / `0375` | stop_reason `customer_replied` / `tag_removed` |
| `0263` `0290` `0351` `0391` | ไม่ใช้ `system_key` สำหรับแท็กอื่น เพราะ follow-bot ถือว่า **ทุก** แถวที่มี system_key = สถานะการขาย (`0263:6-7` · `0290:5` · `0351:10`) |
| `0353` `0356` `0391` | trigger ประวัติแท็กจัด system_key เป็นชุด `'status'` (`0356:43`) |

### 2.3 แท็กสถานะการขาย 7 ขั้น
- **เก็บที่ไหน:** แถว `tags.system_key` + ผูกห้องด้วย `conversation_tags` · ห้องละหนึ่งแท็ก บังคับในโค้ด (`setStage` advisory lock ต่อห้อง `src/lib/follow-bot/stage.ts:56`; ลบแถวเดิมแล้ว INSERT `:65-69`) · "สถานะปัจจุบัน" = แถว system_key ที่ `created_at` ล่าสุด (`currentStage` `stage.ts:32-37`)
- **ค่า** (`STAGES` `model.ts:17-25`):

| key | ชื่อ | โทน |
|---|---|---|
| `not_bought` | ยังไม่ซื้อ | none |
| `billed` | เปิดบิล | warn |
| `paid` | **ยืนยันแล้ว** (คีย์ชื่อเดิม "ชำระแล้ว") | pri |
| `shipped` | ส่งแล้ว | info |
| `done` | สำเร็จ | ok |
| `problem` | พัสดุมีปัญหา | bad |
| `cancelled` | ยกเลิก | bad (แดง ตั้งแต่ 15 ต.ค. `model.ts:12`) |

- ชุดเดิม 5 ค่า `LEGACY_STAGES` (`model.ts:32-38`) ใช้กับร้านนอก `order-tags-allow.ts` ซึ่งตอนนี้ `['*']` = ทุกร้าน (`order-tags-allow.ts:17`)
- สร้างแท็กอัตโนมัติ (`ensureStageTags` `stage.ts:15-29`): ร้านมีแท็กชื่อเดียวกัน = ยึดแถวเดิม · sort_order ติดลบ · ล็อกระดับร้าน · ทางเร็วไม่ล็อกถ้าครบแล้ว (`stageTagIds` `stage.ts:40-45`)
- ลบ/เปลี่ยนชื่อไม่ได้ (`stage.ts:76-98`) · ซ่อนจากแท็กที่ผู้ใช้เห็น (`visibleTags` `model.ts:66`) — เห็น/เปลี่ยนได้ที่ป้ายหัวห้องที่เดียว
- **เปลี่ยนเมื่อไร** (ทุกทางผ่าน `setStage(tx, conv, key, {notBefore, at, keep, yieldFrom})` `stage.ts:55-74`):
  1. engine เฟส 1: ลูกค้าทักห้องที่ไม่มีแท็ก/รอบเก่าจบ → `not_bought` ประทับเวลา = เวลาลูกค้าทัก (`engine.ts:98-111`)
  2. เหตุการณ์ออเดอร์ OMS GoSaaS (`stageOfEvent` `src/lib/auto-reply/order-events-process.ts:102-118`): `order.created`→billed · `order.confirmed` / `payment_confirmed` ครบ→paid · shipment `picked_up`/`on_delivery`→shipped · `delivered` / order `completed`→done · `canceled`→cancelled · `problem`/`on_return`/`returned`→problem · เหตุการณ์พัสดุไม่ทับ done/cancelled (`stageKeepOf` `:169`) · ใบเก่าของห้องไม่ย้ายแท็ก (`:345-346`) · ประทับ `at` = เวลาเหตุการณ์เกิด (`:336-351`)
  3. push ออเดอร์ Shopee/Lazada (ข้อ 4.3)
  4. แอดมินเลือกเองที่ป้ายหัวห้อง (`setStageManual` `stage-manual.ts:10-20` ลง `edit_events`)
- กัน "ถอยสถานะ": เหตุการณ์ที่เก่ากว่าแท็กปัจจุบันไม่ทับ (`notBefore` `stage.ts:64`) ยกเว้น `yieldFrom` ภายใน 24 ชม. (`stage.ts:63`)
- `setStage` ยิงกฎแท็กของร้านด้วย (`runStageChangeSafe` `stage.ts:71`)

---

## 3. Engine (`src/lib/follow-bot/engine.ts`)

### 3.1 รอบรัน / ผู้เรียก
- pg-boss คิว `follow-bots` (`src/worker/index.mts:9016`) · cron `* * * * *` (`index.mts:11053`) · งานวนทุกร้าน `eachTenant` แล้ว `runFollowBots(sql, tenantId, followSendDeps())` (`index.mts:10535-10542`)
- ไม่มีผู้เรียกอื่นใน `src/` — scripts เรียกเฉพาะเทส (`scripts/test-follow-bot.ts:182` · `scripts/test-restore-stage-round-hold.ts:190`)
- ทุกคำสั่งรันใน `inTenant` ที่ `set_config('app.tenant_id')` (`engine.ts:80-81`) · engine ไม่ import DB client เอง ตัวส่งมาทาง `deps` (`engine.ts:11`) เทสใส่ตัวปลอมได้

### 3.2 ลำดับการทำงานในหนึ่งรอบ
1. **เฟส 1 staged** (`engine.ts:89-113`) — หาห้อง DM ที่ `last_inbound_at > now−24ชม.` บนช่อง messenger/ig/line (ร้านที่เชื่อม GoSaaS = ทุกช่อง `:97,105`) ที่ **ไม่มีแท็กสถานะ** หรือ **รอบเก่าจบ** (`since + ROUND_HOLD_DAYS[key] < last_inbound_at` `:106`) · ≤200 ห้อง (`ROOM_LIMIT` `:23`) · `setStage(not_bought, notBefore=at=เวลาลูกค้าทัก)` ห้องละธุรกรรม · ปลุกรายการห้องครั้งเดียว (`:113`)
2. **ด่านร้าน** (`:116-120`) — `deps.access` บล็อก = จบรอบ ไม่แนบไม่ส่ง (แต่เฟส 1 ทำไปแล้ว) · log ครั้งเดียวต่อเหตุ (`logOnce` `:42-48`)
3. **เฟส 2 attached** (`:129-164`) — INSERT…SELECT คำสั่งเดียวทุกบอท `ON CONFLICT DO NOTHING`
4. **เฟส 3 steps** (`:167-270`) — claim + ตัดสิน + จองกุญแจในธุรกรรมเดียว
5. **หลัง COMMIT** (`:273-371`) — gate → ตรวจซ้ำ → ยิง → บันทึกผล

### 3.3 วิธีหยิบห้อง (เฟส 2 · เงื่อนไขครบ `engine.ts:130-161`)
- บอท `kind='condition'`, ไม่ลบ, เปิดหรือทดสอบ, และมีแท็กอย่างน้อยหนึ่งแบบที่ยังอยู่ (`:159-160`)
- ห้อง: `kind='dm'` · ลูกค้าทัก < 24 ชม. · บัญชีของห้องอยู่ใน `follow_bot_accounts` · ทดสอบ = contact อยู่ในแชททดสอบ (`:142`) · บัญชี `connection_status IN ('active','expiring')` (`:31,143`)
- **ยังไม่เลยเวลาขั้นแรก** `last_inbound_at + steps[0].delayMin > now` (`:144`) — เปิดบอทใหม่ไม่ยิงห้องเก่าทั้งร้าน (มติ 8 ต.ค. `:124`)
- `sales_status ≠ 'not_interested'` (`:145`) · ไม่ใช่ห้องที่ AI ตอบเอง (`:147`)
- แท็กสถานะล่าสุด ∈ `stage_keys` หรือ `stage_keys` ว่าง (= ทุกสถานะ) (`:139`)
- **แท็กของร้าน**: นับเฉพาะ id ที่ยังมีอยู่ (`bt` `:133`) · `tag_match='all'` → แท็กห้อง `@>` แท็กบอท · `any` → `&&` (`:148-151`)
- ห้องยังไม่มี run active (`:152`) · บอทนี้ยังไม่เคยแนบห้องนี้ใน `stage_tagged_at` เดียวกัน (`:153`)
- บอทไม่เลือกแท็กสถานะ: ถ้ารอบก่อนของบอทนี้จบหลังลูกค้าทักล่าสุด = ไม่หยิบซ้ำ ต้องรอลูกค้าทักใหม่ (`:154-157`)
- `next_due_at` ตอนแนบ = ค่าตั้งต้น เฟส 3 คิดใหม่ (`:131`)

### 3.4 นับเวลาแต่ละขั้น (`dueAt` `model.ts:213-218`)
```
due(step) = max(ร้านตอบล่าสุด, last_sent_at ของขั้นก่อน) + steps[step].delayMin นาที
```
- "ร้านตอบล่าสุด" (`shopReplySql` `store.ts:18-20`) = ข้อความขาออก ที่ไม่ใช่ `failed` · ไม่ใช่ฟองของบอทติดตามเอง (`meta_context ? 'followBot'`) · ไม่ใช่แถวปักหมุด (`gcPin`) · ไม่ใช่ event — **คำตอบอัตโนมัติอื่นนับ**; ไม่เจอใน 30 วัน → `conversations.last_agent_reply_at` (`engine.ts:194`) → `last_inbound_at` (`engine.ts:247`)
- ร้านค้างตอบ (ข้อความจริงล่าสุดเป็นขาเข้า `engine.ts:205-209`) = ไม่นับเวลา `next_due_at=NULL` รอแอดมิน **ไม่มีกำหนด** (`:190,245`)
- เพดาน 24 ชม. ยังนับจาก **ลูกค้าทักล่าสุด** (`WINDOW_MS` `model.ts:130` · `engine.ts:240`)
- ฟอร์ม: เวลาสะสมขั้นธรรมดา ≤ 23 ชม. (`MAX_TOTAL_MIN = 23*60` `model.ts:129` · `:177-181`) · ต่อขั้นต้อง ≥1 นาที, ≤3,650 วัน (กันล้น `model.ts:103,166-168`)
- ป้ายบนจอ: ขั้น 1 "รอ … หลังแอดมินตอบล่าสุด" · ขั้นถัดไป "ถ้ายังไม่ตอบ รอต่ออีก …" (`editor.tsx:688-690`)
- ย้อนดูข้อความ ≤ 30 วัน (`LOOKBACK_DAYS` `model.ts:111`) เพื่อให้ตัดพาร์ทิชันของ `messages` ได้

### 3.5 กรอบ 24 ชม. · ช่องทาง Meta / IG / LINE
| ช่องทาง | ขั้นธรรมดา (`text`/`text_image`/`product`/`quick_reply`) | ขั้น `utility` หลังเลย 24 ชม. |
|---|---|---|
| Messenger | ต้องส่งภายใน 24 ชม. หลังลูกค้าทัก ไม่งั้นหยุด `window` | ส่งต่อได้ — **Utility template ของ Meta ที่อนุมัติบนเพจ** (`sendUtilityForBot` `src/lib/utility-templates/send.ts:388-407`) |
| LINE | หยุด `window` ที่ 24 ชม. — เป็น**กติกาของเรา** (LINE ไม่มีกรอบ `replyWindow:false` `src/lib/channels/capabilities.ts:45`) engine จึงเช็กเวลาเอง (`engine.ts:240-241`) | ส่งต่อได้แบบ push: ข้อความที่เติมค่า + ปุ่ม Flex (`send-deps.ts:191-203`) |
| Instagram | หยุด `window` | **ไม่ได้** — หยุดก่อนขั้นนั้น · ภายใน 23 ชม. utility ส่งเป็นข้อความธรรมดา (`send-deps.ts:198-199`) |

- ตัดสินที่ `pastWindowOk = step.kind==='utility' && channel ∈ {messenger,line}` (`engine.ts:39`) + `botSendBlock(conv,{ignoreWindow})` (`src/lib/auto-reply/bot-bubble.ts:71-79`)
- **ไม่มี message tag** (HUMAN_AGENT ฯลฯ) — ออกแบบไว้ตั้งแต่แผน "ไม่ใช้ HUMAN_AGENT · ไม่นับ initiated_cap" (`docs/superpowers/plans/2026-10-08-follow-bot.md:24`) · ในโค้ด follow-bot/send-deps ไม่มีการตั้ง tag ใด ๆ
- ค่าของ utility = **ออเดอร์ล่าสุดของห้อง** (`botValues` `utility-templates/send.ts:446-449`) · ไม่มีออเดอร์/ขาดค่า/เทมเพลตถูกระงับหรือลบ = `skipped` เดินขั้นต่อ (`send.ts:398-404` · `send-deps.ts:194-196`)
- สวิตช์ Utility ระดับแอป: `utilityPilot = appHasUtility() = env META_UTILITY` (`capabilities.ts:993-999`) — ปิดสวิตช์หลังตั้งบอท = ขั้น utility ล้ม (ไม่ใช่ข้าม) ทุกช่องทาง (`send-deps.ts:192` · `send.ts:393`)

### 3.6 ด่านร้าน / แพ็กเกจ
| ด่าน | ที่ไหน | ผล |
|---|---|---|
| `salesBotAllowed(slug)` | `src/lib/follow-bot/allow.ts:14-17` (`['*']` ทุกร้านตั้งแต่ 12 ต.ค. `:2,10` · override env `NEXT_PUBLIC_SALES_BOT_SHOPS`) | หน้า/action เท่านั้น — ไม่ผ่าน = การ์ด "เร็ว ๆ นี้" (`plan-locked.tsx:21-31`) · **worker ไม่เช็ก** ส่งตามแถวใน DB (`allow.ts:7`) |
| `featureBlock(access,'autoReply')` | หน้า (`sales-bot/page.tsx:21`) · actions (`actions.ts:29`) · แผงห้อง (`follow-bot-actions.ts:33`) | หน้าอัปเกรดแพ็กเกจ `FollowBotPlanLocked` (`plan-locked.tsx:12-18`) |
| `botAccessBlock(tenantId)` | worker ทาง `deps.access` (`send-deps.ts:82,157`) = ไม่พบร้าน / `!canSend` (หมดอายุ/ระงับ) / ไม่มี autoReply (`bot-bubble.ts:46-51`) | ไม่แนบไม่ส่งทั้งร้าน · เฟส 1 ยังติดแท็ก |
| `canEditFollowBots` | `src/lib/follow-bot/access.ts:13-15` = `canManageAutoReply(role)` (owner หรือ agent เมื่อ `AUTO_REPLY_AGENT_CAN_MANAGE=true` `auto-reply/access.ts:15-20`) **หรือ** หัวหน้า | สร้าง/แก้/ลบ/เปลี่ยนสถานะ/สร้างแท็ก/ค้นสินค้า/แชททดสอบ · ไม่ผ่าน = อ่านอย่างเดียว · `/new` = 404 (`new/page.tsx:21`) |
| `assignmentEditBlock` | แนบ/หยุด/เปลี่ยนสถานะในห้อง (`follow-bot-actions.ts:84,109,125`) | ห้องล็อกให้คนอื่น = ทำไม่ได้ |
| `orderTagsOn` | `order-tags-allow.ts:19-30` | ชุดแท็ก 7 vs 5 · ทุกร้าน |

### 3.7 กันส่งซ้ำ · ล็อก · idempotency
1. **claim**: `SELECT id … WHERE status='active' ORDER BY (ถึงเวลา) DESC, updated_at LIMIT 50 FOR UPDATE SKIP LOCKED` (`engine.ts:168-171`) · batch เต็ม → แตะ `updated_at` ให้คิวหมุน (`:174`)
2. **จองกุญแจ** `INSERT follow_bot_sends(run_id,step,'sending') ON CONFLICT (run_id,step) DO NOTHING` ในธุรกรรมเดียวกับ claim (`:262-266`) — ไม่ได้แถว = มีคนส่งแล้ว
3. **ยิงหลัง COMMIT** เท่านั้น ห้าม throw ออกจาก loop (`:272`) · ยังไม่ได้ยิง = `release()` ลบแถว sending (`:276`)
4. **ตรวจซ้ำก่อนยิง** (SQL `:299-316`): run ยัง active · `next_step` เท่าเดิม · แท็กยังตรง · ในกรอบ (หรือ utility) · ไม่ใช่ไม่สนใจ · ร้านไม่ได้ค้างตอบ · **แอดมินไม่ได้ตอบหลัง claim** · `stage_tagged_at` เท่าเดิม → ไม่ผ่าน = คืนกุญแจ
5. **แถว sending ค้าง > 10 นาที** (`STALE_MIN` `:24`) = ปิด `failed` "ค้างส่ง ไม่ทราบผล" แล้วเดินขั้นต่อ **ไม่ยิงซ้ำ** (`:253-261`) — "ส่งไม่ถึงดีกว่าส่งสองรอบ"
6. **client_msg_id คงที่** ต่อ (run, ขั้น, ส่วน) จาก sha256 (`followClientId` `send-deps.ts:126-129`) — ลองใหม่ใช้ฟองเดิม · ส่วนที่ `sent` แล้วไม่ยิงซ้ำ (`send-deps.ts:173-182`)
7. **เดินขั้นแบบมีเงื่อนไข** `UPDATE … WHERE status='active' AND next_step=${step}` (`:361-363`)
8. ล้มลองใหม่ได้ → พัก 5 นาที (`FOLLOW_RETRY_BACKOFF_MIN` `:28,337`) · เกิน 60 นาทีหลังถึงกำหนด (`FOLLOW_RETRY_MAX_MIN` `:26`) = `failed` แล้วเดินต่อ (`:332-341`) · throw = ล้มไม่ลองซ้ำ (`:343-347`)
9. ด่านชั่วคราว (เพจหลุด) = คืนกุญแจไม่ข้ามขั้น · ขั้น utility ติดเกิน 60 นาที = `failed` เดินต่อ (`:286-293`)
10. ล็อกอื่น: `pg_advisory_xact_lock('gc-stage:'||conv)` ต่อห้อง (`stage.ts:56`) · `'gc-stage-tags:'||tenant` (`stage.ts:17`) · `'follow_bot_accounts:'||tenant` ตอนบันทึกบอท (`store.ts:103`)

### 3.8 ข้อจำกัด "1 บัญชี 1 บอทต่อแท็กสถานะ" (มติ 9 ต.ค. `store.ts:73`)
- ตรวจใน `saveBot` เท่านั้น (CHECK ข้ามตารางทำไม่ได้ `0205:22`) · เฉพาะบอทตามเงื่อนไข · ล็อกระดับร้านกันบันทึกชนกัน (`store.ts:102-119`)
- ชนเมื่อ บัญชีเดียวกัน และ (stage_keys ซ้อนกัน **หรือ** ฝ่ายใดไม่เลือกแท็กสถานะ = ทุกสถานะ) · ยกเว้นบอทไม่มีแท็กสถานะที่แท็กร้านถูกลบหมด (`store.ts:110-112`)
- บอทเฉพาะกลุ่มใช้บัญชีร่วมกันได้หลายตัว (`editor.tsx:651`)
- หน้าเลือกบัญชีล็อกบัญชีที่ชนพร้อมบอก "อยู่ใน …" (`editor-data.ts:42-47` · `editor.tsx:504-506`)

---

## 4. เงื่อนไขหยุด · จบรอบ · MKP · หยิบซ้ำ

### 4.1 `stop_reason` ทุกค่า (`StopReason` `store.ts:23` · ข้อความระบบ `STOP_TEXT` `store.ts:24-38`)
ลำดับตัดสินในเฟส 3 (`engine.ts:229-245`) — ลำดับมีผล:

| # | ค่า | เกิดเมื่อ | ที่ |
|---|---|---|---|
| 1 | `stage_changed` | `stage_tagged_at` ≠ แท็กล่าสุด หรือสถานะใหม่ไม่อยู่ใน `stage_keys` | `engine.ts:231-232` |
| 2 | `tag_removed` | ห้องไม่ตรงแท็กของร้านของบอทแล้ว (all = เอาออกตัวเดียวก็หยุด · แท็กบอทถูกลบหมดและไม่มีแท็กสถานะ = หยุด) | `engine.ts:233` · `tagsMatchSql` `store.ts:199-205` |
| 3 | `bot_disabled` | บอทถูกปิด (engine) หรือบันทึกเป็น "ปิด" | `engine.ts:234` · `store.ts:139` |
| 4 | `customer_replied` | ลูกค้าส่งขาเข้าจริงหลังฟองที่บอท `sent` | `engine.ts:236` · `customerRepliedSql` `store.ts:187-193` |
| — | (ห้อง AI ตอบเอง) | ข้าม ไม่ส่ง ไม่หยุด | `engine.ts:237` |
| 5 | `done` / `bot_shortened` | `next_step` = จำนวนขั้น / เกินจำนวนขั้น | `engine.ts:238,248` · ส่งขั้นสุดท้ายแล้ว `:364` |
| 6 | `window` | ไม่มี `last_inbound_at` · หรือเลย 24 ชม. และขั้นถัดไปไม่ใช่ utility ที่ส่งได้ · หรือ gate บอกเลยกรอบตอนจะยิง | `engine.ts:239-241,352-353` |
| 7 | `not_interested` | แอดมินตั้งห้อง "ไม่สนใจ" (`sales_status` CHECK `0016:25`) | `engine.ts:242` |
| 8 | `out_of_scope` | ห้องหลุดจากบัญชีของบอท/เปลี่ยนเป็นทดสอบ/ไม่ใช่แชททดสอบ | `engine.ts:243` |
| 9 | `admin` | กด "หยุด" ในแผงขวา | `src/app/inbox/follow-bot-actions.ts:111` |
| 10 | `bot_deleted` | ลบบอท | `store.ts:158` |
| 11 | `replaced` | แนบบอทเฉพาะกลุ่มทับ | `store.ts:278` |
| 12 | `bot_edited` | แก้ **โครง** ขั้น (จำนวน/ชนิด/ลำดับ) ขณะมีห้องตาม · แก้ถ้อยคำ/เวลารอ = ตามต่อและล้าง `next_due_at` | `store.ts:140-142` · `stepsEdited` `model.ts:279-283` |

- หยุดทุกครั้ง = UPDATE run (`status='stopped'`, `finished_at`) + INSERT ข้อความ `sender_type 'system'` ลงห้อง `meta_context.followBot` (`stopRun` `store.ts:289-301`) — trigger ข้อความปลุกห้องเอง
- ไม่ใช่การหยุด: ร้านค้างตอบ / ห้องไม่ใช่ DM → `next_due_at=NULL` รอ (`engine.ts:245`)
- **"ลูกค้าตอบ"** = ขาเข้าที่ไม่ใช่ event (`eventLike` `src/lib/inbox-awaiting.ts:49-57` — system, LINE follow/unfollow, Shopee system) และไม่ใช่ปักหมุด · เวลาอ้างอิง = `max(updated_at)` ของ sends ที่ `sent` (`store.ts:192`) · ก่อนขั้นแรก = รอแอดมินตามเดิม

### 4.2 กติกาจบรอบ (BR-AUTOREPLY-062 · `model.ts:39-60`)
- ลูกค้าทักหลัง (เวลาติดแท็ก + N วัน) → เฟส 1 ตั้งกลับเป็น `not_bought` (`engine.ts:106`)
- `cancelled` 0 วัน · `done` 7 วัน (`DONE_HOLD_DAYS` `:48`) · `shipped` 14 วัน (`SHIPPED_HOLD_DAYS` `:53` เหตุผล: ร้านไม่กดสำเร็จ ห้องจะค้างถาวร `:49-52`) · สถานะอื่น **ไม่จบรอบเอง**
- ต้อง "เลย" (`<`) — `roundOverAt` (`model.ts:57-60`) ต้องตรงกับ SQL เฟส 1 · ส่ง map เป็น `::text::jsonb` (`engine.ts:96,106`)
- ออเดอร์ใหม่ย้ายห้องได้ทันทีไม่ผ่านกติกานี้ (`model.ts:44`)

### 4.3 สถานะออเดอร์ MKP → แท็ก (`src/lib/follow-bot/mkp-status.ts:11-28`)
- Lazada (lower-case): unpaid/pending→billed · packed/ready_to_ship/topack/toship/repacked→paid · shipped→shipped · delivered/confirmed→done · canceled→cancelled · returned/shipped_back/lost_by_3pl/failed_delivery→problem
- Shopee (upper): UNPAID→billed · READY_TO_SHIP/PROCESSED/RETRY_SHIP→paid · SHIPPED/TO_CONFIRM_RECEIVE→shipped · COMPLETED→done · CANCELLED/IN_CANCEL→cancelled · TO_RETURN→problem
- ค่าไม่รู้จัก = ไม่ย้ายแท็ก (`:31-33`) · ไม่รู้เวลา = ห้ามเดาเป็น now (`:53,65`)
- `applyMkpOrderStatus` (`mkp-order.ts:119-211`): upsert ดัชนีเฉพาะสถานะใหม่กว่า → หา contact (ไม่สร้างให้ผู้ซื้อที่ไม่เคยทัก `:181`) → นับซื้อซ้ำ → ไม่ย้ายแท็กถ้ามีใบใหม่กว่า (`:194-204`) → `setStage(at=เวลาแพลตฟอร์ม, yieldFrom=['not_bought'] ถ้า billed/paid)` ทุกห้อง DM ของผู้ซื้อในบัญชีนั้น (`:205-209`)
- ผู้เรียก: worker Shopee `index.mts:1607-1621` · Lazada `:1903-1910`

### 4.4 การหยิบห้องซ้ำ
- บอทเลือกแท็กสถานะ: แนบได้ครั้งเดียวต่อ (บอท×ห้อง×`stage_tagged_at`) (`follow_bot_runs_once` + `engine.ts:153`) — ห้องย้ายไปสถานะอื่นที่บอทเลือกไว้ = รอบใหม่ตามต่อ
- บอทไม่เลือกแท็กสถานะ: หยุดแล้วไม่หยิบซ้ำจนกว่าลูกค้าทักใหม่ (`engine.ts:157`)
- `customer_replied` แล้วไม่แนบซ้ำในรอบสถานะเดิม (ผลจาก `once` · เทส `scripts/test-follow-bot.ts` "หยุดเพราะลูกค้าตอบแล้ว ไม่แนบบอทซ้ำ…" อ้างใน `BRD.md:1162`)
- แนบเองซ้ำ: บอทเดิมเคยตามห้องนี้ในรอบนี้ = ปฏิเสธ (`store.ts:276-277`)

---

## 5. BR · มติผู้ใช้ · ค่าที่ agent ตั้งเอง

### 5.1 BR ที่เกี่ยว (`doc-library/modules/auto-reply/BRD.md`)
| BR | บรรทัด | เรื่อง |
|---|---|---|
| 049 | `:1086` | แท็กสถานะการขายที่ระบบติดให้ (13 AC) |
| 050 | `:1106` | ตั้งบอท (15 AC) |
| 051 | `:1133` | การส่ง (13 AC) |
| 052 | `:1154` | หน้าแชท (11 AC) |
| 057 (ตัวแรก) | `:1170` | เปิดบางร้าน → ทุกร้าน 12 ต.ค. *(เลข 057 ซ้ำกับ BR อีกตัวที่ `:1273`)* |
| 061 | `:1380` | MKP ย้ายแท็ก + นับซื้อซ้ำ |
| 062 | `:1394` | กติกาจบรอบ |
| 068 | `:1553` | ขั้น Utility ส่งเกิน 24 ชม. |
| 069 | `:1582` | ปุ่มในฟอง |
| 071 (อ้อม) | `:1641` | ชุดแจ้งออเดอร์ใช้ Utility เกิน 24 ชม. |

**[ขัด] เอกสาร vs โค้ด**
- BR-049 บรรทัดหัว "หนึ่งในห้าค่า … ชำระแล้ว" (`BRD.md:1087`) — โค้ด 7 ค่า ชื่อ "ยืนยันแล้ว" (`model.ts:17-25`)
- BR-050 AC 2 "เวลาสะสมเกิน 23 ชม. บันทึกไม่ได้" (`BRD.md:1112`) — โค้ด: ขั้น utility ไม่มีเพดาน (`model.ts:169-176`)
- BR-051 AC 3 "ส่งเฉพาะภายใน 24 ชม. ทุกช่องทาง" (`BRD.md:1139`) — โค้ด: utility บน Messenger/LINE ส่งเกินได้ (`engine.ts:39`) (BR-068 อัปเดตแล้วแต่ AC 3 ไม่ได้แก้)
- BR-050 AC 6 "สร้าง/แก้ได้ทุกคน" — โค้ดผ่าน `canEditFollowBots` (owner/agent/หัวหน้า) ตรงความหมาย แต่ข้อความบนจอยังเขียน "เฉพาะเจ้าของร้านและหัวหน้า" (`list.tsx:44,108` · `editor.tsx:101` · `actions.ts:21`)
- แผนเดิม route `/follow-bot` (`plans/2026-10-08-follow-bot.md:28`) — ของจริง `/sales-bot`

### 5.2 มติผู้ใช้ (ตามวัน · ปี 2569)
- **8 ต.ค.** ไม่แนบห้องที่เลยเวลาขั้นแรก (`engine.ts:124`) · แท็กสถานะไม่แสดงในรายการห้อง เห็นที่หัวห้องที่เดียว แบบ ค (`model.ts:63` · plan `:33`) · ป้าย ◎ กระพริบเฉพาะจะส่งใน 10 นาที (plan `:32`) · แถวบอทแบบ B + ปุ่มเพิ่มแบบ C (`follow-bot-row.tsx:4`)
- **9 ต.ค.** เลือกบัญชีระดับเพจ · สถานะ ปิด/ทดสอบ/เปิด (`0205:1`) · 1 บัญชี 1 บอทต่อแท็กสถานะ (`store.ts:73`) · ช่องแท็กอื่นดึงแท็กที่มี+สร้างใหม่ได้ (`actions.ts:83`)
- **10 ต.ค.** แท็กสถานะ 7 ตัว · เปิดทุกร้าน OMS (`order-tags-allow.ts:3`)
- **12 ต.ค.** เปิดเมนูทุกร้าน (`allow.ts:2`) · ขั้นข้อความที่ใช้บ่อย · การ์ดหลายชิ้น (`model.ts:74-82`)
- **13 ต.ค.** (ทีม) การ์ดเลื่อนข้าง ≤10 (`model.ts:113-116`) · ไม่เชื่อม GoSaaS = ไม่มีการ์ด (`editor-data.ts:65`)
- **14 ต.ค.** ขั้น 5→10 (`0247:1`) · (ทีม) นับจากแอดมินตอบล่าสุด (`model.ts:210`)
- **15 ต.ค.** จบรอบ 14/7/0 (`model.ts:40`) · ยกเลิกสีแดง (`model.ts:12`) · ทุกคนแก้บอทได้ (`access.ts:9`) · ช่องแท็กช่องเดียว (`editor.tsx:224`) · MKP เงื่อนไขเดียวกับ manual (`mkp-status.ts:3`)
- **17 ต.ค.** delivered = สำเร็จ (`order-events-process.ts:97`)
- **19 ต.ค.** แท็กยึดออเดอร์ที่สร้างล่าสุด (`mkp-order.ts:191`)
- **20–22 ต.ค.** Utility: ไม่มีเพดานเวลา G3 · ตัวแปรจากออเดอร์ล่าสุด G6 · หลายช่องทาง G7 · ปุ่มในฟองแบบ ข G14 · LINE Flex แบบ ข (`BRD.md:1555-1561,1584`)
- **23 ต.ค.** ร้านค้างตอบ = รอแอดมินไม่มีกำหนด (แบบ ข) · ห้องปิดงานแล้วบอทยังส่ง (แบบ ก) (`BRD.md:1564-1565`)
- **28 ต.ค.** Utility เปิดทุกร้าน (`capabilities.ts:995`)
- **4 พ.ย.** ลูกค้าตอบหลังบอทส่ง = หยุดทั้งรอบ (`customer-reply-stop-decisions.md:10-12`)
- **5 พ.ย.** ไม่เลือกแท็กสถานะ = ทุกสถานะ (ข้อ 3) · บอททุกสถานะจองทั้งเพจ (ข้อ 4) · ไม่หยิบห้องเดิมจนทักใหม่ เฉพาะบอทไม่เลือกสถานะ (ข้อ 5/5.1) · เอาแท็กออก = หยุด (ข้อ 7) (`customer-reply-stop-decisions.md:37-41`) · ยกเลิก CS-23491 "นับวันจากตอนได้ของเพื่อขอรีวิว" (`:63`)

### 5.3 ค่าที่ agent ตั้งเอง / ยังไม่ยืนยันชัด
- นับ "ลูกค้าตอบ" เฉพาะหลังบอทส่งขั้นแรก — "ผมตั้งเอง (ยังไม่ได้ถาม)" (`customer-reply-stop-decisions.md:11`) · ผู้ใช้ตอบรวม "เอาด้วยกันนี้แหละ" (`:22`)
- ใช้กับทั้งสองประเภท · นิยาม "ตอบ" รวมกดปุ่ม · ข้อความหยุด (`:17-21`) — ได้ "เอาตามนี้" ที่ `:22`
- ต้องมีแท็ก ≥1 ตัว · แท็กร้านถูกลบหมด = ไม่แนบ (`:43-44` "ค่าที่ผมตั้งเอง") — **ไม่พบคำยืนยัน**
- ตัวเลขวิศวกรรม (ไม่มีใน BRD): claim 50 · ห้อง 200/เฟส · stale 10 นาที · retry 60/พัก 5 นาที · กระพริบ 10 นาที (`engine.ts:22-31`) · ย้อน 30 วัน (`model.ts:111`) · ห้องทดสอบ 20 (`model.ts:132`) · บัญชี ≤50 (`model.ts:127`) · ข้อความที่ใช้บ่อย ≤5 (`model.ts:89-90` "ponytail")
- เพดาน 23 ชม. = กรอบ 24 ชม. เผื่อ 1 ชม. ให้คิวช้า (`model.ts:4`)

---

## 6. หน้าจอ

### 6.1 รายการบอท `/sales-bot` (`src/app/(app)/sales-bot/page.tsx` · `list.tsx`)
- หัว "บอทติดตามยอดขาย" + คำอธิบาย 1 บรรทัด (เพิ่มท่อน utility เมื่อเปิด) (`list.tsx:104-105`)
- แท็บ **บอท** / **ประวัติการส่ง** (`?tab=log` · `list.tsx:38,64-69`) · เม็ดกรอง ทั้งหมด/ตามเงื่อนไข/เฉพาะกลุ่ม + จำนวน (`?k=cond|prod` `:39,125-131`)
- ปุ่ม "สร้างบอทติดตาม" · ไม่มีสิทธิ์ = ปุ่ม aria-disabled + tooltip (`:94-96`) · บรรทัดล็อก (`:108`)
- ตาราง 4 คอลัมน์: ชื่อบอท (+ป้ายประเภท + ตัวอย่างข้อความขั้น 1) · ห้องที่บอทตาม (ป้ายแท็กสถานะ + แท็กร้าน + (i) any/all + บัญชี; บอทเฉพาะกลุ่ม "แอดมินแนบในห้อง · ติดตามอยู่ N ห้อง") · ขั้นตอน (N ขั้น · ภายใน …) · สถานะ (ป้ายอ่านอย่างเดียว ปิด/ทดสอบ N แชท/เปิด) (`:135-189`) · แถวทั้งแถวเป็นลิงก์ไปหน้าแก้
- ว่าง: "ยังไม่มีบอทติดตาม" (`:136-140`) · บอทไม่มีแท็ก: "ไม่มีแท็ก · บอทไม่ได้ตามห้องใหม่" (`:160`)

### 6.2 ประวัติการส่ง (แท็บ log · `list.tsx:196-267` · `listSends` `store.ts:310-338`)
- คอลัมน์ ลูกค้า (ลิงก์เข้าห้อง) · ช่องทาง · บอท ("ขั้น n/N" · ลบแล้ว = "บอทที่ถูกลบแล้ว") · ผล (ส่งแล้ว/ข้าม/ไม่สำเร็จ/กำลังส่ง + เหตุผล) · เวลา (`list.tsx:40-42,199-254`)
- หน้าละ 50 · keyset `(created_at,id)` cursor `"<ts ข้อความ>|<id>"` · cursor ปลอม = ว่าง ไม่ล้ม (savepoint `store.ts:327-331`) · "โหลดเพิ่ม" · สถานะโหลด/ว่าง/ล้ม+ลองใหม่ · ไม่มีตัวกรอง (`list.tsx:13`)

### 6.3 ฟอร์มสร้าง/แก้ (`[id]/editor.tsx` 1,172 บรรทัด · ข้อมูล `editor-data.ts`)
ลำดับบนเส้น (rail):
1. แถบหัว: ชื่อบอท · segment สถานะ ปิด/ทดสอบ/เปิดใช้ · ปุ่มลบ (`editor.tsx:515-534`)
2. (โหมดทดสอบ) ขั้น "แชททดสอบ" + ตัวเลือก (`:541-583`)
3. ประเภทบอท radio (ล็อกเมื่อแก้ + (i)) (`:589-603`)
4. **แท็ก** ช่องเดียว (combobox: หัว "แท็กสถานะ"/"แท็กของร้าน" + "สร้างแท็ก …") + เมนู "แท็กใดแท็กหนึ่ง/ครบทุกแท็ก" (`:219-330,619-621` · tip `TAG_TIP` `:138`) — เฉพาะตามเงื่อนไข
5. **บัญชีที่เข้าร่วม** ชิป + หน้าต่างเลือก (บัญชีที่ชนล็อกไว้) (`:632-651`)
6. ขั้น 1…N: เวลา (จำนวน+หน่วย) · ตัวแสดงเวลาสะสม/เตือนเกิน · segment ชนิดเนื้อหา · ตัวแก้ข้อความ+ชิปตัวแปร · รูป/การ์ด/รายการ/เทมเพลต · ตัวแก้ปุ่ม · ปุ่มเลื่อนขึ้น/ลง/ลบ (`:660-766`)
7. ปุ่ม "เพิ่มขั้น" (ล็อกเมื่อครบ 10 ขั้น/เลยเวลา พร้อมเหตุผล) (`:770-777`)
8. "เงื่อนไขหยุด" + (i) (`:778-780` · `STOP_TIP` `:139`)
9. savebar: สถานะบันทึก/ข้อผิด (`:783-790`) · ด้านขวา "ตัวอย่างในแชท" (`:845`)
- หน้าต่าง: เลือกสินค้า (ตารางการ์ด · โหลดหน้าถัดไปเองเมื่อเลื่อน `:1056` · BRD-050 AC14) · เลือกข้อความที่ใช้บ่อย (`:1144`) · เลือก Utility (`[id]/utility-picker.tsx` — แบ่ง "ใช้ได้/ไม่ได้" พร้อมเหตุผลต่อเพจ)

**Validation** (server `normalizeBotForm` → `validateBot` · `model.ts:151-206,228-273`; ฟอร์มใช้ `validateBot` ตัวเดียวกัน):
| ฟิลด์ | กติกา | ข้อความ |
|---|---|---|
| ชื่อ | ไม่ว่าง ≤60 | "ตั้งชื่อบอทก่อน" `:153` |
| บัญชี | 1–50 · ต้องเป็น messenger/ig/line ของร้าน (`store.ts:85-88`) | `:155-156` |
| แชททดสอบ | โหมดทดสอบ ≥1 · ≤20 · ต้องอยู่บนบัญชีของบอท (`store.ts:120-123`) | `:157-158` |
| แท็ก | ตามเงื่อนไข: สถานะ+ร้าน ≥1 · แท็กร้านต้องเป็นแท็กธรรมดาของร้าน (ตัดทิ้งเงียบ `store.ts:81-83`) · ถูกลบระหว่างเปิดฟอร์ม = error (`store.ts:92`) | `:160` |
| ขั้น | 1–10 · delay int ≥1 ≤3,650 วัน · สะสม ≤23 ชม. ยกเว้น utility | `:161-181` |
| ข้อความ | ≤1,000 / มีปุ่ม ≤640 · ไม่ว่าง (ยกเว้น product/quick_reply/utility) | `:188,195-199` |
| ปุ่ม | ≤3 · ไม่ว่าง · ≤20 · ไม่ซ้ำ | `:191-194` |
| ชนิดขั้น | รูปต้องมี · สินค้า 1–10 · quick reply 1–5 · utility ต้องมี template ของร้าน (`store.ts:96-101`) | `:183-202` |
| ตัวแปร | `{สินค้า}` `{ราคา}` เฉพาะบอทเฉพาะกลุ่ม | `:203` |
| ชน 1 บัญชี | ดู 3.8 | `store.ts:116-118` |

### 6.4 แผงในห้องแชท (แผงขวา ใต้แถวแท็ก · `src/app/inbox/follow-bot-row.tsx`)
- เฉพาะห้อง DM ของ messenger/ig/line (`follow-bot-actions.ts:40-44`) · แพ็กเกจ/ร้านไม่ผ่าน = ไม่แสดงแถวเลย (`hidden` `:49-52`)
- มีบอท: ชื่อ + (i) เงื่อนไขหยุด + ปุ่ม "หยุด" (ทรงเม็ดยา) · รายการขั้น: "ส่งแล้ว HH:MM" (เวลาฟองจริง `store.ts:218-221`) / "อีก …" / "ราว HH:MM" / "พรุ่งนี้ HH:MM" / "รอส่ง" / "กำลังส่ง" · ขั้นปัจจุบันก่อนส่งฟองแรกขณะร้านค้างตอบ = "รอคุณตอบลูกค้า" · ขั้นล้ม/ข้าม ✕/– "ส่งไม่สำเร็จ"/"ข้ามขั้นนี้ · เหตุผล (i)" (`follow-bot-row.tsx:43-53,91-130`)
- ไม่มีบอท: ปุ่ม "+ บอทติดตาม" (ทรงปุ่มเพิ่มแท็ก) + "แนะนำ “ชื่อบอท”" ถ้ามีสินค้าแนะนำ (`:142-145`) · บอทตามเงื่อนไขที่มีสินค้าแนะนำ = ลิงก์ "แนะนำ …" ให้แนบบอทเฉพาะกลุ่มแทน (`:76,98`)
- ลูกค้าตอบหลังฟองบอท / ห้องไม่ตรงแท็ก = **ซ่อนแถวทันที** ก่อน engine หยุด (`store.ts:214-217`)
- หยุด = แถวหายทันที (useOptimistic) ล้มเด้งกลับ + toast (`follow-bot-row.tsx:10`)
- กล่องแนบ (`follow-bot-attach.tsx`): เลือกบอทเฉพาะกลุ่ม + สินค้า (แนะนำจาก การ์ดที่เคยส่ง/ร่างออเดอร์/CF ไลฟ์ ≤5 `suggest.ts:4-9`; หรือค้นแคตตาล็อก) + ตัวอย่างขั้นแรก · ชื่อ/ราคาสินค้าอ่านจาก snapshot ฝั่ง server ไม่เชื่อหน้าจอ (`follow-bot-actions.ts:94-97`)
- รายการห้อง: ป้าย ◎ บนรูปลูกค้า `follow_bot = on|soon` (soon = `next_due_at ≤ now+10 นาที` `src/app/inbox/data.ts:2244-2248`) · คำนำหน้า "บอทติดตาม:" ถ้าใบล่าสุดเป็นของบอท (`data.ts:2142`)

### 6.5 เมนูสถานะหัวห้อง (`src/app/inbox/follow-bot-stage.tsx`)
- ป้ายแท็กสถานะปัจจุบัน (ไม่มี = "ตั้งสถานะ" สีเทา `:13`) กดเปิด dropdown 7 ค่า · (i) "ระบบย้ายเองตามออเดอร์ GoSaaS" (`:23,88`) · เลือก = เปลี่ยนทันที (optimistic) ล้มเด้งกลับ + toast (`:39-50`)
- dropdown ต้องอยู่นอกกล่องชื่อที่ overflow:hidden + `data-bs-boundary="viewport"` (`:10`)
- เปลี่ยนเองแล้ว run ที่ตามอยู่หยุด `stage_changed` ในรอบ engine ถัดไป (`follow-bot-actions.ts:119`)

### 6.6 ป้ายล็อก
- ห้องล็อกให้คนอื่น/ออฟไลน์/โหมดดูร้าน: ปุ่ม aria-disabled + tooltip แตะได้ (`follow-bot-row.tsx:14` · `follow-bot-stage.tsx:14-15,25-31`) · ป้ายสถานะตอนล็อก **ไม่จาง** + ไอคอนกุญแจ (`follow-bot-stage.tsx:14`)
- หน้ารายการ/ฟอร์ม: บรรทัด `.gc-arc-lock` "…ดูได้อย่างเดียว" (`list.tsx:108` · `editor.tsx:538`)
- แพ็กเกจ: `FollowBotPlanLocked` (StatePanel quota-reached → `/settings/plan`) · นอกรายชื่อ: `FollowBotSoon` (`plan-locked.tsx:12-31`)

---

## 7. Server actions / API (ไม่มี REST — server actions ล้วน · ไม่ใช้ `revalidatePath`)

**`src/app/(app)/sales-bot/actions.ts`** — `guard`: `assertShop` → `featureBlock('autoReply')` → `salesBotAllowed` (`:26-33`) · เขียนต้อง `canEditFollowBots`
| action | บรรทัด | ทำอะไร |
|---|---|---|
| `saveFollowBot(slug, form)` | `:35-46` | `saveBot` (`store.ts:76-152`) สร้าง/แก้ + สถานะ + บัญชี + แชททดสอบ ในธุรกรรมเดียว → คืน `BotRow` |
| `deleteFollowBot(slug, id)` | `:60-65` | soft delete + หยุดทุกห้อง `bot_deleted` (`store.ts:155-161`) |
| `listFollowSends(slug, cursor)` | `:67-71` | ประวัติ (สมาชิกทุกคน) |
| `searchFollowTestChats(slug, accountIds, q)` | `:49-58` | ค้นห้องเป็นแชททดสอบ |
| `browseFollowProducts(slug, {q,page})` | `:74-80` | ค้นแคตตาล็อก (≤500 หน้า) |
| `createFollowTag(slug, name)` | `:87-111` | สร้างแท็กร้านจากฟอร์ม (≤40 ตัว · ชื่อซ้ำไม่สนตัวพิมพ์ = แท็กเดิม · ชื่อแท็กสถานะ/journey = ปฏิเสธ · นับเพดานแพ็กเกจ) |

**`src/app/inbox/follow-bot-actions.ts`** — `guard` (`:29-37`)
| action | บรรทัด | ทำอะไร |
|---|---|---|
| `loadRoomFollow(slug, conv)` | `:47-60` | `roomBot` + สินค้าแนะนำ + บอทเฉพาะกลุ่มล่าสุดที่ใช้ได้ |
| `loadProductBots(slug, conv)` | `:63-78` | บอทเฉพาะกลุ่มที่ใช้กับห้องนี้ได้ (`botUsableIn` `store.ts:256-260`) |
| `attachFollowBot(slug, conv, botId, productId)` | `:80-104` | แนบ (`attachBot` — ตั้ง not_bought ถ้าห้องยังไม่มีสถานะ `store.ts:272`) |
| `stopFollowBot(slug, conv)` | `:106-114` | `stopRun(admin)` · ไม่เจอ run = ถือว่าสำเร็จ |
| `setRoomStage(slug, conv, key)` | `:121-131` | เปลี่ยนแท็กสถานะเอง |

ทุกเส้นที่ไม่ใช่ action: worker ขาเข้าปุ่ม (`button-label.ts`) · แจ้งเปลี่ยนแปลงผ่าน `pg_notify('gochat_msg', kind 'contact')` ครั้งเดียวต่อบัญชี (`notifyRoomList` `stage.ts:106-115`)

---

## 8. บั๊ก/บทเรียนหลังขึ้น prod — กับดักห้ามเหยียบซ้ำ

1. **CS-23480 (PR #1265 · 4–5 พ.ย.)** (`customer-reply-stop-decisions.md:30-48`)
   - บังคับแท็กสถานะ ≥1 → ใส่แท็กร้านตัวเดียวบันทึกไม่ได้ · "ต้นเหตุคือกติกา ไม่ใช่หน้าตา" (`:33`)
   - ลูกค้าตอบแล้วบอทยังตาม → เพิ่ม `customer_replied` (0371)
   - **บอททุกสถานะ: สถานะเปลี่ยน → หยุด → นาทีถัดไปหยิบใหม่ในสถานะใหม่ = ส่งหาคนที่เพิ่งจ่าย** (code-auditor P1 · `engine.ts:155`) → ต้องรอลูกค้าทักใหม่
   - นิยาม "ตอบ" ด้วย `last_inbound_at` ตัวเดียว → ลูกค้าบล็อก OA ก็ขึ้น "ตอบแล้ว" → ต้องตัด event (`store.ts:182-183`)
   - เปิด deploy: run ที่ลูกค้าตอบไปแล้วในอดีตหยุดพร้อมกันทั้งก้อน — ให้นับจำนวนก่อน deploy (`:27`)
2. **count-from-reply (PR #828 · merge `598a66c27` · 14–15 ต.ค.)** — นับจากลูกค้าทักทำให้แอดมินที่ตอบช้ากว่าเวลารอโดนบอทยิงต่อทันที → นับจากร้านตอบล่าสุด (`model.ts:210-212`) · **ฟองที่ส่งล้มต้องไม่นับเป็น "ร้านตอบ"** ไม่งั้นการลองใหม่รีเซ็ตนาฬิกาไม่จบจนหลุด 24 ชม. (`store.ts:15-16` code-auditor P1-1) · แอดมินตอบหลัง claim = ไม่ยิง (`engine.ts:309-312`) · ตรวจซ้ำต้องมีขอบเวลาเพื่อตัด partition (commit `6312c8a07`) · "ส่งแล้ว" ต้องเป็นเวลาฟอง ไม่ใช่เวลาจองคิว (`store.ts:218`)
3. **stage-round-hold (PR #872 · merge `607ba6728` · 15 ต.ค.)** — กติกาเดิมทักใหม่หลังส่งแล้ว/สำเร็จ = ยังไม่ซื้อทันที → บอทตามขายคนที่เพิ่งซื้อ (Shopee สำเร็จ 12 ต.ค. ทัก 14 ต.ค. `model.ts:42-44`) → คง 14/7 วัน + สคริปต์คืนสถานะ `scripts/restore-stage-round-hold.ts` (ประทับเวลาเดิม ไม่ต่ออายุ · ใช้กับห้องหลัง 19 ต.ค. ไม่ได้ `:10-11`) · ประวัติแท็กไม่มี (setStage ลบแถวเดิม) ต้องสร้างลำดับย้อนหลังจาก `gosaas_order_events` + ดัชนี MKP (`:20-30`) — **บทเรียน: เก็บประวัติแท็กสถานะไว้ตั้งแต่แรก**
4. **ขยายเพดานขั้นต้องไล่ทุก CHECK (PR #831 · `0247:2-5`)** — ขยายแค่ `steps` → INSERT sends ขั้นที่ 6 ล้ม → ธุรกรรม claim ทั้งร้าน rollback = บอททุกตัวของร้านหยุด (db-auditor P0)
5. **ไมโครวินาที** — `Date` ของ JS ตัดไมโครวินาที เทียบ `stage_tagged_at` ฝั่ง JS = เห็นว่าเปลี่ยนทุกครั้ง → เทียบใน SQL + ส่งเวลาเป็น `::text::timestamptz` (`engine.ts:10` · `stage.ts:31,68` · `store.ts:324`)
6. **postgres.js + jsonb** — พารามิเตอร์ jsonb ถูก stringify ซ้ำ → `->>` NULL ทุกคีย์ ใช้ `::text::jsonb` (`engine.ts:96`)
7. **ประทับเวลาแท็ก** — engine ประทับเวลาลูกค้าทัก (`engine.ts:91-93`); เหตุการณ์ OMS เดิมประทับ `now()` → created+confirmed ในรอบเดียวกันค้าง "เปิดบิล" → #909 ประทับเวลาเหตุการณ์ (`order-events-process.ts:336-337`) + `scripts/repair-stage-same-batch.ts` · เวลาอนาคตห้ามใช้ (`:338`)
8. **delivered = สำเร็จ (CS-23358)** + `scripts/repair-stage-delivered.ts` · ห้องหลายออเดอร์ต้องยึดใบล่าสุด (`order-events-process.ts:342-346`) · Lazada push รายชิ้น เวลาสร้างประมาณ (`mkp-order.ts:10-13`)
9. **`tag_removed` (PR #1268)** — เดิมเช็กแท็กร้านแค่ตอนหยิบห้อง เอาแท็กออกแล้วบอทยังตาม (`BRD.md:1160`)
10. **ลบแท็ก/รวมแท็กต้องล้าง `follow_bots.tag_ids`** ไม่งั้นบอท "ครบทุกแท็ก" ตายเงียบถาวร (`db-audit-2026-10-08.md:123-127` · แก้ที่ `stage.ts:95` · `src/lib/tags/store.ts:463-466,527`)
11. **`'use server'` re-export type** ทำทุก action ในไฟล์ล้ม 500 บน Turbopack (`ui-audit-2026-10-08.md:49-55`) — ห้าม `export type {X}` ในไฟล์ action
12. **เฟส 1 ห้องละธุรกรรม + NOTIFY ห้องละครั้ง** = 3.5k คำสั่ง/ร้าน/นาที และ SSE refresh 200 ครั้ง (`db-audit-2026-10-08.md:76-86`) → ทางเร็ว `stageTagIds` + ปลุกครั้งเดียว · หลัง deploy ครั้งแรกทุกห้องทุกร้านต้องติดแท็ก — backlog
13. **เฟส 1/2 สแกนห้องทั้งร้านทุกนาที** (~65 ms/ร้าน 20k ห้อง) — อย่าเพิ่ง index `last_inbound_at` (เสีย HOT) (`db-audit-2026-10-08.md:89-104`)
14. **ห้อง active ค้างไม่มีกำหนด** — ขั้น utility ไม่มีกรอบ 24 ชม. ห้องค้างตอบค้าง run active (`BRD.md:1564` db-auditor P3-3)
15. **รายชื่อร้านกันแค่ทางเข้า** (`allow.ts:7`) · **rollout**: CHECK ต้องเพิ่มค่าอย่างเดียว · `testing` ออกแบบให้ `enabled=false` worker เก่าจึงไม่ส่ง (`0205:11-12`) · ห้ามสร้างบอทไม่เลือกสถานะระหว่าง deploy (`customer-reply-stop-decisions.md:48`)
16. **ยิงในธุรกรรม = rollback แล้วข้อความออกไปแล้ว** → ยิงหลัง COMMIT เสมอ (`engine.ts:7-9,272`)
17. ไฟล์ audit: `docs/follow-bot/audit-2026-10-08.md` (ม็อกอัพ: P0 เมนูหัวห้องถูกตัด `:34`, คอนทราสต์) · `ui-audit-2026-10-08.md` (หน้าจริง: P0 action ล้มทั้งไฟล์, P1-4 เมนูปิดไม่ได้ `:76`, ป้ายล็อกจาง `:70`) · `ui-audit-2026-10-09.md` · `db-audit-2026-10-08.md` (P2-1…10) · `db-audit-2026-10-09.md` (rollout 0205 `:22-45`)

---

## 9. จุดผูกกับระบบเฉพาะของ gochat — หน้าที่ + ต้องหาตัวเทียบ

| ของ gochat | หน้าที่ใน follow-bot | ตัวเทียบที่ต้องหาฝั่ง safepay/Deep |
|---|---|---|
| **MKP** (Shopee push code 3 · Lazada message_type 0 · `shopee/lazada_order_index` · `mkp-order.ts` · `mkp-status.ts`) | ย้ายแท็กสถานะห้อง Marketplace + นับซื้อซ้ำ (`contacts.mkp_order_count`) | ถ้าไม่มีห้อง Marketplace ตัดทั้งชุด · ใช้แค่ OMS ของเรา |
| **GoSaaS OMS events** (`order-events-process.ts:102-118` `stageOfEvent`) | แหล่งหลักของการย้ายแท็ก | สถานะ `Order` ของ safepay (PHYSICAL/SERVICE ฯลฯ) — ต้องทำตาราง map เอง |
| **`eventLike` / "ลูกค้ารอ"** (`inbox-awaiting.ts:49-61` `realMessage`) | แยกข้อความจริงออกจาก event (system, LINE follow/unfollow, Shopee system) — ใช้ตัดสิน ร้านค้างตอบ · ลูกค้าตอบ · ร้านตอบล่าสุด | นิยาม "ข้อความจริง" + ป้ายรอตอบของห้องแชท safepay — ต้องใช้นิยามเดียวทุกที่ |
| `meta_context ? 'gcPin' / 'followBot'` · `sender_type 'system'/'auto'` | ตัดแถวปักหมุดและฟองบอทเองออกจาก "ร้านตอบ" | field ที่บอกผู้ส่ง/ชนิดของข้อความในแชท safepay |
| `conversations.last_inbound_at` / `last_agent_reply_at` (ไม่นับบอท) / `sales_status` | ด่านถูก ๆ ก่อนเปิด `messages` · not_interested | คอลัมน์สรุปห้อง — ถ้าไม่มีต้องเพิ่มหรือคำนวณ |
| **AI ตอบเอง (Q97 · BR-AI-047)** `autoSendOn()` (env `OPENAI_API_KEY` `src/lib/ai/auto-mode.ts:18-21`) + `ai_room_auto(conv)` (`0311_ai_room_auto.sql:85-`) | ไม่แนบห้องที่ AI ตอบ · run ที่ติดอยู่พักส่ง (`engine.ts:147,182,237`) | ระบบ AI ร่าง/ตอบ (Typhoon 00019-ext) — ต้องเคาะว่าใครมีสิทธิ์ก่อน |
| **Utility messages** (`utility_templates` · `sendUtilityForBot` · `botValues` · `META_UTILITY`) | ส่งเกิน 24 ชม. บน Messenger ด้วยเทมเพลตที่ Meta อนุมัติต่อเพจ · ตัวแปรจากออเดอร์ล่าสุด | ต้องมี Utility template ผ่าน Meta + App Review · ถ้าไม่มี ให้คงเพดาน 23 ชม. ทุกขั้น |
| **แพ็กเกจ** (`featureBlock('autoReply')` · `loadTenantAccess.canSend` · `tagLimitBlock`) | ปิดหน้า/ส่ง · เพดานแท็ก | ระบบสิทธิ์/แพ็กเกจ/wallet ร้านของ safepay + capability ใน `route-capabilities.ts` |
| **บัญชีร่วม** (`follow_bot_accounts` → `channel_accounts` เพจ/IG/LINE OA ของร้าน · `connection_status`) | บอทผูกระดับเพจ · ด่าน 1 บัญชี 1 บอทต่อสถานะ | ตารางเพจ/OA ที่เชื่อมของร้าน safepay (ร้านหลายเพจ · กล่องรวมหลายร้าน 00037) |
| `canEditFollowBots` (owner/agent/หัวหน้า) · `assignmentEditBlock` (ห้องล็อกให้คนอื่น) | ใครแก้บอท/แนบ/หยุด | `shop-permissions.ts` + บทบาท 00071 |
| `quick_replies` · `social_product_snapshots` · `buildSocialProductCard` · live/order_command | ขั้นข้อความที่ใช้บ่อย · การ์ดสินค้า · สินค้าแนะนำ | ข้อความสำเร็จรูป/แคตตาล็อก Product ของ safepay · ส่วนแนะนำตัดได้ |
| `tags`/`conversation_tags`/`runStageChangeSafe` | แท็กสถานะ + แท็กร้าน + กฎแท็ก | ระบบแท็กห้องแชท safepay |
| `pg_notify('gochat_msg')` → `/api/stream` SSE | ปลุกรายการห้อง | realtime ของแชท safepay |
| pg-boss + `eachTenant` + RLS `app.tenant_id` | รอบทุกนาทีต่อร้าน + แยกร้าน | safepay **ไม่มี RLS** (auth ที่ service layer) ⇒ ทุกคิวรีต้องกรอง shopId เอง · ตัวตั้งเวลา (Vercel cron?) |

---

## 10. เทส/สคริปต์

| ไฟล์ | ชนิด | ครอบ |
|---|---|---|
| `scripts/test-follow-bot.ts` (940 บรรทัด · 147 `check`) | DB จริง (ปักหมุด localhost `:12-15`) · `pnpm test:follow-bot` (`package.json:462`) | RLS ข้ามร้าน · ยึดแท็กชื่อเดิม · แนบ/หยุด/บรรทัดระบบ · ห้องกลุ่ม/บอทปิด/ลบ แนบไม่ได้ · ยังไม่ถึงเวลา = ไม่ส่ง · claim ซ้ำ/สอง worker พร้อมกันส่งครั้งเดียว (`:210,246`) · stage_changed · ล้มเกิน 60 นาทีเดินต่อ (`:269`) · ช่องหลุดชั่วคราวไม่ข้าม (`:293`) · customer_replied (`:315`) · ไม่เลือกแท็กสถานะ (`:343`) · หลายสถานะตามต่อรอบใหม่ (`:368`) · tag_removed (`:408,436`) · สิทธิ์แก้ (`:489`) · สินค้าแนะนำ (`:511,731`) · bot_edited vs แก้ถ้อยคำ (`:555`) · ร้านถูกบล็อก (`:573`) · stale sending (`:587`) · ร้านค้างตอบ (`:613`) · แนบเอง 24 ชม. (`:625`) · ปักหมุด (`:647`) · ปลุกครั้งเดียว (`:705`) · 1 บัญชี 1 บอท (`:745,760`) · แชททดสอบ (`:769-786`) · จบรอบ 7/14/0 (`:808-811`) · ชุด 7 vs 5 (`:816`) · utility/IG (`:858`) |
| `scripts/test-follow-bot-model.ts` (150 บรรทัด · `eq` ~103) | pure | `validateBot` ทุกข้อ · เพดานสินค้า 10 · ปุ่ม · `roundOverAt` · `stepsEdited` · `dueAt` |
| `scripts/test-follow-bot-send.ts` (325 · ~63) | ports ปลอม | ตัวส่งทุกชนิด · ปุ่ม Messenger/LINE · รูปก่อนปุ่ม · `fitText` · reuse ฟอง · utility LINE |
| `scripts/test-mkp-order-tags.ts` (270 · ~58) | DB | map สถานะ MKP ครบ · เก่ามาช้าไม่ทับ · นับซื้อซ้ำ · ใบล่าสุด |
| `scripts/test-restore-stage-round-hold.ts` (203 · ~40) | pure + DB | สคริปต์คืนสถานะ |
| `scripts/test-repair-stage-same-batch.ts` (106) · `test-backfill-mkp-order-status.ts` (221) | | สคริปต์ซ่อม |
| สคริปต์ซ่อม prod | `restore-stage-round-hold.ts` · `repair-stage-same-batch.ts` · `repair-stage-delivered.ts` · `backfill-mkp-order-status.ts` | dry-run ค่าตั้งต้น · `--apply` ต้อง `BACKFILL_CONFIRM=yes` · ไม่ปลุกบอท |

ไม่มีเทส UI (BRD ระบุ "ไม่มีเทส UI" หลายจุด เช่น `BRD.md:1574,1599`) · ไม่มีเทสของกิ่ง worker MKP (`BRD.md:1392`)

---

## ข้อขัดกับฉบับ session (`REFERENCE-gochat-v3-by-session.md`)

1. **ที่มาของการประทับเวลาลูกค้าทักใน engine** — ฉบับ session ข้อ 8.6 (บรรทัด 330) อ้าง "#909 · `engine.ts:91`" แต่ `git blame` บรรทัด `engine.ts:110` เป็น commit `32b2ca95` 8 ต.ค. (engine ประทับเวลาลูกค้าทักมาตั้งแต่แรก) · #909 (`ec59a5865` 16 ต.ค.) แก้ **`order-events-process.ts:336-351`** ให้เหตุการณ์ OMS ประทับเวลาที่เหตุการณ์เกิด — คนละจุด
2. **สิทธิ์ "ทุกคน"** — ฉบับ session บรรทัด 45 เขียน "ทุกคน" ถูกตามความหมาย (owner/agent + หัวหน้า · `auto-reply/access.ts:15-20`) แต่ไม่ได้จดว่าข้อความบนจอยังบอก "เฉพาะเจ้าของร้านและหัวหน้า" (`list.tsx:44,108` · `editor.tsx:101` · `sales-bot/actions.ts:21`) — ไม่ใช่ขัดตรง ๆ แต่ถ้ายกถ้อยคำไปจะผิด
3. **ลบแท็กล้าง `tag_ids`** — ฉบับ session (บรรทัด 92) อ้างแค่ `stage.ts:95` · ทางหลักของหน้าแท็ก v11 อยู่ที่ `src/lib/tags/store.ts:527` (และรวมแท็ก `:463-466`) ด้วย
4. **ขั้น utility เมื่อปิดสวิตช์ Utility** — ฉบับ session (บรรทัด 176) สรุปว่าไม่มีออเดอร์/ขาดค่า/ถูกระงับ = `skipped` ถูก แต่ปิดสวิตช์/ไม่ใช่ร้านนำร่อง = **failed ไม่ใช่ skipped** (`send-deps.ts:192` · `utility-templates/send.ts:393`)
5. **[ขัด] เอกสาร vs โค้ด ที่ฉบับ session ไม่ได้ชี้** — BR-049 หัว "ห้าค่า/ชำระแล้ว" (`BRD.md:1087`) · BR-050 AC2 / BR-051 AC3 ยังเขียนเพดาน 23/24 ชม. ทุกช่องทาง (`BRD.md:1112,1139`) ขัดกับ utility ที่ส่งเกินได้ (`engine.ts:39`)

ข้ออื่น (ลำดับ stop · กุญแจกันซ้ำ · map MKP · ตาราง · มติ) ตรงกันกับฉบับนี้

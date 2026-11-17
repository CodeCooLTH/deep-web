# 00095 ส่วนต่อขยาย — "ตามครบแล้วไม่ตอบ" ทำอะไรต่อ (PRD + BRD ย่อ)

> สถานะ: อนุมัติ 2026-11-16 (implement แล้ว) · 2026-11-16 · ต่อยอด feature 00095 บนโค้ด main (#259)

## 1. ปัญหา (PRD)
บอทตามครบทุกรอบแล้วลูกค้ายังเงียบ (ไม่สนใจจริง หรือเป็นบัญชีผี) — แอดมินต้องมาไล่กดสแปม/ปิดงานเองทีละห้อง

## 2. สิ่งที่ผู้ใช้ขอ (คำผู้ใช้)
- "ถ้าบอทขุดไปจนครบ ... ให้ตั้งค่าได้ว่าท้ายที่สุดแล้วจะ mark spam, ซ่อน, หรือตั้งค่า complete ไปเลย"
- "พยายามทัก 5 รอบแล้ว ไม่สนใจจริง ๆ อาจจะเป็นบอท ก็ให้ mark spam ไปเลย"
- "ถ้าทักไปแล้ว ไม่ตอบเกิน 4 ชั่วโมง ก็ให้ mark spam ไปเลย (อาจจะเป็นผี)"

## 3. ความต้องการ (FR)
- **FR-FA-1** ฟอร์มบอท ส่วน ③ ต่อจากรอบสุดท้าย: แถว "ถ้าตามครบแล้วลูกค้ายังไม่ตอบ รอ [ตัวเลข][นาที/ชั่วโมง/วัน] แล้ว [ไม่ทำอะไร | ปิดงาน | ซ่อน | ย้ายไปสแปม]" — ค่าตั้งต้น = ไม่ทำอะไร, รอ 1 วัน
- **FR-FA-2** engine: run ที่ส่งครบทุกรอบ (`DONE`) และพ้นเวลารอนับจาก**รอบสุดท้ายที่ส่ง**โดยลูกค้าไม่ตอบ → ทำ action กับห้อง 1 ครั้ง แล้วเขียนบรรทัดระบบ `FOLLOW_BOT_NOTE` ในห้อง เช่น "บอทตามครบ 5 รอบ ลูกค้าไม่ตอบ — ย้ายไปสแปม"
- **FR-FA-3** แสดงในตารางบอท/ตัวอย่าง/ประโยคสรุป: "…ครบแล้วไม่ตอบ 4 ชม. → ย้ายไปสแปม"
- **FR-FA-4** แอปมือถือ: บรรทัดระบบใช้ชนิดเดิม (`FOLLOW_BOT_NOTE`) — ไม่ต้องแก้แอป (ฟอร์มตั้งค่ามีเฉพาะเว็บ)

## 4. กฎธุรกิจ (BRD)
| # | กฎ |
|---|---|
| BR-FA-1 | action ใช้ธงเดิมของห้องเท่านั้น: ปิดงาน = `Conversation.resolvedAt` · ซ่อน = `isHidden` · สแปม = `isSpam` — พฤติกรรมเหมือนแอดมินกดเองทุกอย่าง (มติผู้ใช้: **สแปมจากบอท = สแปมปกติ ลูกค้าทักกลับมาก็ไม่เด้งกลับ ไม่แจ้งเตือน**) |
| BR-FA-2 | เวลารอ 0 นาที – 7 วัน · นับจากเวลาส่งรอบสุดท้ายจริง (ไม่ใช่เวลาที่ตั้ง) · เลือกได้นาที/ชั่วโมง/วัน แบบเดียวกับเวลารอระหว่างรอบ |
| BR-FA-3 | ก่อนทำ ตรวจซ้ำทุกครั้ง: ลูกค้าตอบหลังรอบสุดท้าย / แอดมินตอบหลังรอบสุดท้าย / ห้องถูกปิดงาน-ซ่อน-สแปมไปแล้ว / บอทถูกลบหรือปิด → **ไม่ทำ** |
| BR-FA-4 | ทำครั้งเดียวต่อ run (idempotent — cron รันซ้ำไม่ทำซ้ำ) · run ที่ถูกหยุดก่อนครบ (ลูกค้าตอบ/แอดมินหยุด/สถานะเปลี่ยน) ไม่เข้าเงื่อนไข |
| BR-FA-5 | บอทสถานะ "ทดสอบ" ทำกับแชททดสอบด้วย (ให้ร้านเห็นผลจริงก่อนเปิดใช้) |
| BR-FA-6 | แก้ค่านี้ไม่ถือว่า "โครงรอบเปลี่ยน" (ไม่หยุด run ที่ตามอยู่) · run ที่ครบแล้วใช้ค่าล่าสุดของบอท ณ ตอนถึงเวลา |
| BR-FA-7 | ไม่มีปุ่มย้อนกลับพิเศษ — ย้อนด้วยวิธีเดิมของกล่องแชท (เลิกสแปม/เลิกซ่อน/เปิดงานใหม่) |

- **FR-FA-5** (ผู้ใช้สั่งตรง 2026-11-16) ตอนบอทจะส่งรอบแล้วเจอ "แอปอื่นคุมเธรด" (Business Suite) → บอท `claimThreadControl(..., 'deep-follow-bot')` 1 ครั้ง: TAKEN → ส่งรอบเดิมซ้ำทันทีใต้ Send claim เดิม · REQUESTED → คืนกุญแจ ลองใหม่ tick หน้า (หลังรอ 5 นาที ไม่ข้ามถาวร) · ROUTING_NOT_ENABLED → SKIPPED เหตุผล `ROUTING_NOT_ENABLED` · TOKEN_INVALID → SKIPPED `CHANNEL_TOKEN_INVALID` · อื่น ๆ → `OTHER_APP_CONTROLS` เดิม

| # | กฎเพิ่ม |
|---|---|
| BR-FA-8 | 🛑 ห้ามแย่งจาก Meta AI/Business AI: ไม่ take เมื่อ Meta AI ถือห้อง (`decideMetaAiHolding`) · เจ้าของที่สังเกตได้คือ Business AI (`928891643393937`) · handover ล่าสุดเป็น take metadata `axon_take_thread_control` — แยกไม่ได้ว่าใครถือ = ถือว่า Business Suite (Page Inbox) เมื่อไม่มีหลักฐาน Meta AI · เฉพาะ Messenger/IG (LINE ไม่มีเจ้าของเธรด) · ประวัติ: `SalesFollowSend.controlReclaimed=true` + แถว `ChatHandoverEvent` metadata `deep-follow-bot:<ผล>` |

## 5. ข้อมูล (ต้องมี migration — HR15)
- `SalesFollowBot.finalAction` text default `'NONE'` CHECK in (`NONE`,`RESOLVE`,`HIDE`,`SPAM`) · `SalesFollowBot.finalDelayMin` int default 1440 CHECK 0..10080
- `SalesFollowRun.finalActionAt` timestamptz null (เวลาที่ทำ · กันทำซ้ำ) · `finalActionTaken` text null
- - migration ที่ 2 `20261117100300_00095_ext_reclaim_control`: ขยาย CHECK `SalesFollowSend_reason_check` (+`ROUTING_NOT_ENABLED`,`CHANNEL_TOKEN_INVALID`) · `SalesFollowSend.controlReclaimed` bool default false
- เพิ่มแบบ additive ทั้งหมด (ค่าตั้งต้น = พฤติกรรมเดิม)

## 6. นอกขอบเขต
บล็อก/รายงานลูกค้า · ลบแชท · แจ้งเตือนแอดมิน · ทำ action กลางทาง (ก่อนครบทุกรอบ)

## ภาคผนวก — ยืมห้องจาก Meta AI (FR-FA-6 / BR-FA-9 · ผู้ใช้สั่ง 2026-11-16 "ถ้า Meta AI ถืออยู่ ให้เราดึงมาส่งบอทก่อน แล้วคืนให้ Meta ต่อ")
- **กลับมติเดิม** "บอทพักเมื่อ Meta AI ถือห้อง (HOLD `META_AI_HOLDING`)" — เปลี่ยนเป็น: ถึงเวลาส่งรอบ (ตัดสินด้วย `decideRun` แบบไม่นับ Meta AI) → `take_thread_control` **ก่อน**สร้างฟอง → ได้ (TAKEN) = ส่งรอบตามปกติ → `pass_thread_control` คืนให้ **Business AI เท่านั้น** (ไม่ตกไป Page Inbox) ทันที แม้ส่งไม่สำเร็จก็คืน
- ไม่ได้สิทธิ์ (เพจไม่ได้ตั้ง Conversation Routing / REQUESTED / token ตาย) = พัก `META_AI_HOLDING` เหมือนเดิม ไม่มีฟองล้มโผล่ในห้อง · ลองใหม่ทุก 30 นาที (`BORROW_RETRY_MS`)
- หลักฐาน + ตัวนับ backoff = `ChatHandoverEvent.metadata` `deep-follow-bot-borrow:<TAKEN|REQUESTED|FAILED_*|RETURNED|RETURN_FAILED>` · `newOwnerAppId` ของแถว take/pass ทำให้ `Conversation.metaOwnerAppId` ยังจำว่า Meta AI ถือห้องหลังคืน
- ไม่มี migration · Native ไม่กระทบ
- ⚠️ ยังไม่เคยทดสอบกับเพจจริง — ดูผลที่ `ChatHandoverEvent` ของร้านธนภัทร์หลังขึ้น prod

## ภาคผนวก — ส่งห้องต่อเมื่อลูกค้าตอบกลับ (FR-FA-7 / BR-FA-10 · ผู้ใช้สั่ง 2026-11-16 "ครับ ลุยเลย")
**คำผู้ใช้:** "บางร้านใช้ Meta AI อยากให้เวลาบอทหยุด เพราะลูกค้าพิมพ์ตอบกลับมา ให้มีตั้งได้ว่า จะส่งต่อให้ Admin / หรือ ส่งให้ Facebook Meta AI ได้ด้วย"

- **FR-FA-7** ตั้งค่าต่อบอท `replyHandoff` ∈ `ADMIN` (ค่าตั้งต้น) | `META_AI` — "เมื่อลูกค้าตอบกลับ (บอทหยุด) ให้ส่งต่อให้" · อยู่ในกล่อง "บอทจะหยุดทักเองเมื่อ" ของฟอร์มบอท
- **ADMIN:** ห้องอยู่กับ Deep ให้แอดมินตอบ — ถ้า ณ ตอนนั้นมีหลักฐานว่า Meta AI ถือห้อง (ด่านเดียวกับ `mayReclaim`: `decideMetaAiHolding` / `metaOwnerAppId` = Business AI / handover ล่าสุด `axon_take_thread_control`) → `claimThreadControl` ดึงคืน · ไม่มีหลักฐาน = ไม่ยิง Graph
- **META_AI:** `passThreadControlToMetaAi(..., [Business AI])` เท่านั้น (ไม่ตกไป Page Inbox) · Meta AI ถืออยู่แล้ว = ไม่ยิง
- เขียนบรรทัดระบบ `FOLLOW_BOT_NOTE` ทุกครั้ง: "ลูกค้าตอบแล้ว — ส่งต่อให้แอดมิน" / "… ส่งต่อให้ Meta AI" / ล้มเหลว "… ส่งต่อให้ Meta AI ไม่สำเร็จ (เพจยังไม่ได้ตั้ง Conversation Routing) ห้องอยู่กับแอดมิน" (ADMIN ดึงคืนไม่สำเร็จ: "… แต่ดึงห้องคืนจาก Meta AI ไม่สำเร็จ")

| # | กฎเพิ่ม |
|---|---|
| BR-FA-10 | (ก) เกิดเมื่อ run หยุดด้วยเหตุ `CUSTOMER_REPLIED` เท่านั้น (เหตุอื่น = ไม่แตะ) · (ข) ทำครั้งเดียวต่อ run: ทำต่อเมื่อ `stopRunWithNote` คืนแถวเท่านั้น (ผู้ชนะ `UPDATE…WHERE status='ACTIVE'`) · (ค) Messenger/IG เท่านั้น — LINE เป็น ADMIN เสมอ ไม่ยิง Graph · (ง) ทุกครั้งที่ยิง Graph เขียน `ChatHandoverEvent` metadata `deep-follow-bot-handoff:<TAKEN\|REQUESTED\|FAILED_*\|PASSED\|PASS_FAILED>` พร้อม `newOwnerAppId` จริง (take สำเร็จ = แอปเรา `FB_CHAT_APP_ID` · pass สำเร็จ = Business AI · ล้ม = ไม่ระบุ) เพื่อให้ `Conversation.metaOwnerAppId` ตรงความจริง · (จ) แก้ค่านี้ไม่ใช่โครงรอบ (ไม่หยุด run) |

- **ทำที่ไหน:** ใน cron tick (`evaluateRun` → `handoffAfterCustomerReply`) ไม่ใช่ใน webhook ขาเข้า — webhook ต้องตอบ Meta เร็วและห้องรอ Graph/ล้มแล้วลาก event หาย · ราคา = ช้าได้ ≤ 1 tick · ล้มทุกกรณีแค่ log (run หยุดสำเร็จไปแล้ว) ไม่โยน
- **ข้อจำกัดที่รู้:** Meta อาจไม่ให้ Meta AI ตอบข้อความที่ลูกค้า *ส่งมาแล้ว* ตอนส่งมอบ — AI อาจตอบตั้งแต่ข้อความถัดไป (ข้อความใน UI ฟอร์มบอก) · เพจต้องตั้ง Conversation Routing ไม่งั้น pass/take ล้ม
- **ข้อมูล:** migration `20261118110000_00095_ext_reply_handoff` — `SalesFollowBot.replyHandoff` text NOT NULL default 'ADMIN' CHECK in ('ADMIN','META_AI') · additive · Native ไม่กระทบ
- ⚠️ ยังไม่เคยทดสอบกับเพจจริง — ตรวจ `ChatHandoverEvent` `deep-follow-bot-handoff:*` หลังขึ้น prod

## ภาคผนวก — เงื่อนไขการเริ่มติดตามแบบแถว + เงื่อนไขการหยุดติดตาม (FR-FA-8 / BR-FA-11 · ผู้ใช้สั่ง 2026-11-17)
**หลักฐาน prod (ร้านธนภัทร์):** บอท "ตื้อลูกค้า" (เงื่อนไข "ยังไม่ซื้อ" ไม่มีแท็ก) ตื้อห้องที่ลูกค้าสั่งในแชทแล้วแต่แอดมินยังไม่คีย์ออเดอร์ — ร้านทำเครื่องหมายห้องเหล่านั้นด้วยแท็ก "รอคีย์ออเดอร์" แต่บอทไม่มีทางรู้
**คำผู้ใช้ (4 ข้อความ):**
1. "น่าจะมีตั้งค่าได้ ว่า หยุดเมื่อไหร่ (เลือกได้หลาย) — ลูกค้าตอบกลับ, มี tag รอคีย์ออเดอร์"
2. "ตรงสถานะการขาย ผมคิดว่าไม่ต้องมีนะ (แต่อาจจะเปลี่ยนเป็น เมื่อสถานะเปลี่ยน (ไปเป็นอันอื่น))"
3. (เลือก preview) ตัวสร้างกฎแบบแถว: "ทักคนที่ตรง [ทุกข้อ | ข้อใดข้อหนึ่ง] · สถานะการขาย [เป็น | ไม่ใช่] · แท็ก [ไม่มี | มีข้อใดข้อหนึ่ง | มีครบทุกแท็ก] · + เพิ่มเงื่อนไข" — ให้ AND/OR/NOT ระหว่างสถานะกับแท็ก (**แทนที่** ข้อเสนอ `stopTagKeys` เดิมทั้งหมด)
4. "ปรับคำให้ไปในทิศทางเดียวกัน" — คำกริยาเดียวของบอท = "ติดตาม"

**FR-FA-8** การ์ด 1 เป็นตัวสร้างกฎ: `conditionMatch` ∈ `ALL` (ค่าตั้งต้น) | `ANY` + `conditionRules` 1..10 แถว — `{field:'stage', op:'is'|'is_not', values: SalesStageKey[]}` หรือ `{field:'tag', op:'has_any'|'has_all'|'has_none', values: tagNameKey[]}` · ค่าต่อแถว 1..20 · การ์ด 4 เหลือแถว "ลูกค้าตอบกลับ → ส่งต่อให้" · "ติดตามครบแล้วยังไม่ตอบ" · บรรทัดเดียว "หยุดติดตามเองเมื่อห้องไม่ตรงเงื่อนไขการเริ่มติดตามแล้ว" + พับ "เหตุหยุดอื่น" (เกินเวลาช่องทาง · แก้โครงรอบ · บอทปิด/ลบ · ร้านสั่งหยุด)

| # | กฎ |
|---|---|
| BR-FA-11 | (ก) ตัวประเมินตัวเดียว `evaluateConditions` (`src/lib/sales-follow-bot/conditions.ts`) ใช้ทั้ง `eligibleToAttach` (ไม่ตรง = ไม่แนบ `CONDITION_UNMATCHED`) และ `decideRun` (ไม่ตรง = STOP `CONDITION_UNMATCHED`) · (ข) ไม่มีกฎ = ไม่ตรง (fail-closed) · (ค) **จำกัดวง:** ต้องมีแถวที่ทำให้คนที่ตรงน้อยกว่าทั้งร้าน — ALL ต้องมีอย่างน้อยหนึ่งแถว `is`/`has_any`/`has_all` · ANY ต้องเป็นแบบนั้นทุกแถว (เพราะ ANY ที่มีแถว `is_not`/`has_none` แถวเดียวครอบเกือบทั้งร้าน) ไม่ผ่าน = issue `RULES_TOO_BROAD` · (ง) แท็กที่ร้านลบแล้ว: `has_none` ข้าม · `has_any` ใช้ที่เหลือ (หายหมด = ไม่ตรง) · `has_all` ที่หายแม้ตัวเดียว = ไม่ตรง (fail-closed เหมือนเดิม) · (จ) คง `STAGE_CHANGED` เมื่อ stage key/stamp เปลี่ยน (รอบผูกกับ stage) — เงื่อนไขสถานะในกฎมีผลที่ตัวแนบและเป็น `CONDITION_UNMATCHED` เมื่อ stage เดิมของ run หลุดกฎ · (ฉ) `TAG_REMOVED` เดิมเลิกส่งออก แต่ค่ายังอยู่ใน CHECK/ข้อความ (แถวใน prod) · (ช) บรรทัดระบบ: "บอท “X” หยุดทักแล้ว เพราะห้องไม่ตรงเงื่อนไขการเริ่มติดตามแล้ว (ติดแท็ก “Y”)" — ระบุแท็กเมื่อมาจากกฎ `has_none` · (ซ) การส่งห้องต่อ (FR-FA-7) ผูกกับ `CUSTOMER_REPLIED` เท่านั้น ไม่เกิดกับ `CONDITION_UNMATCHED` · (ฌ) แก้กฎไม่ใช่โครงรอบ (ไม่ขยับ `structureRev` ไม่หยุด run — tick ถัดไปประเมินเอง) · (ญ) ช่องทางชน (`CHANNEL_CONFLICT`): ชุดสถานะที่บอท "อาจ" ตรง = ALL ตัดกันของแถว stage (`is_not` = ส่วนเติมเต็ม) · ANY ที่มีแถวแท็กปน = ทุกสถานะ · ไม่มีแถว stage = ทุกสถานะ · บอทที่ไม่มีแถวจำกัดวงไม่นับเป็นตัวชน |

- **ข้อมูล:** migration `20261118130000_00095_ext_condition_rules` — `SalesFollowBot.conditionMatch` text NOT NULL default 'ALL' CHECK ∈ (ALL,ANY) · `conditionRules` jsonb NOT NULL default '[]' CHECK array ≤10 · backfill: `salesStatuses` → แถว stage `is` · `tagKeys` → แถว tag `has_all`/`has_any` ตาม `tagMatch` · ร้อยกันด้วย ALL · ถอน CHECK `SalesFollowBot_condition_check` (ย้ายไป Valibot) · ขยาย CHECK `SalesFollowRun_stopReason_check` เพิ่ม `CONDITION_UNMATCHED` · ล้างคอลัมน์ `stopTagKeys` ของ migration ก่อนหน้า (`20261118120000_00095_ext_stop_tags` คงไว้ใน branch — prod สร้างแล้ว DROP ทิ้งทันที) · คอลัมน์เก่า `salesStatuses/tagKeys/tagMatch` เก็บไว้ไม่ใช้อ่าน
- **ค่าที่ไม่ได้ทำ:** เทมเพลตกฎสำเร็จรูป · NOT ซ้อนกลุ่ม (กลุ่มย่อยในกฎ) · แอปมือถือยังไม่ตามถ้อยคำ "ติดตาม" (ไม่แตะคำในกล่องแชท/หัวห้อง)

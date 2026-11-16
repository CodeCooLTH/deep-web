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

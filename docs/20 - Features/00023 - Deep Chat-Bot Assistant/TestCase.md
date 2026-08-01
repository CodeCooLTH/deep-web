---
title: "Test Case — Chat Auto-Reply (ตอบแชทอัตโนมัติจาก Keyword)"
owner: shinobu22
status: draft
module: M00023-ChatAutoReply
version: "1.0"
created: 2026-07-29
tags: [feature, chat, auto-reply, keyword, messenger, ads, seller, test, qa, 00023]
related: ["[[PRD]]", "[[BRD]]", "[[DATABASE]]", "[[Feature-Docs-Ownership]]"]
---

> **โมดูล:** M00023-ChatAutoReply
> **ประเภทเอกสาร:** Test Case
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-07-29
> **สถานะ:** Draft — **เอกสารนี้เป็นแผนการทดสอบ ไม่ใช่รายงานผลทดสอบ** เขียนก่อนมีโค้ด (doc-first ตาม Hard Rule 11) ณ วันจัดทำยังไม่มี SRS/SDS/API.md ของโมดูลนี้ ดังนั้นชื่อ route/endpoint/ฟังก์ชันในเอกสารนี้เป็น **ข้อเสนอที่ต้องยืนยันซ้ำกับ SRS/SDS/API ก่อนเขียนโค้ดจริง** (ทำเครื่องหมาย ⓐ ทุกจุดที่เป็นสมมติฐาน) — ส่วนชื่อ **model/field/ค่าคงที่ทั้งหมดไม่ใช่สมมติฐาน** มาจาก [[DATABASE]] ที่ FROZEN แล้ว
> **เจ้าของเอกสาร:** QA (ดู [[Feature-Docs-Ownership]])

# Test Case: ตอบแชทอัตโนมัติจาก Keyword (Chat Auto-Reply)

---

## 1. Overview

ชุดทดสอบนี้ครอบคลุมฟีเจอร์ `00023 - Chat Auto-Reply` ทั้งเส้น — การตั้งค่ากลุ่มคำ/คำตอบทุกระดับ, การปรับข้อความให้เป็นมาตรฐาน, การจับคู่และการตัดสินผู้ชนะ, การถอยระดับ 9 ขั้น, บริบทโฆษณา/สินค้า, การกันตอบซ้ำ, การหยุดเมื่อพนักงานตอบ, โหมดทดสอบทั้ง 2 แบบ, ความทนทานของคิวงาน, บันทึกการทำงาน, สิทธิ์/ขอบเขตร้าน และ regression ของระบบแชทเดิม

**เอกสารต้นทาง:**
- [[BRD]] §2 (FR-001..FR-024 / AC-001-01..AC-024-06 รวม **128 ข้อ**) + §8 (BR-AR-01..BR-AR-30) — ทุก TC ต้อง trace กลับรหัสเหล่านี้
- [[DATABASE]] — **FROZEN CONTRACT** ใช้เป็น ground truth ของชื่อ model/field/ค่าคงที่ที่ปรากฏใน seed data และ assertion ทุกจุดของเอกสารนี้ (ค่าคงที่ดู [[DATABASE]] §3.8)
- [[PRD]] §4.3 — ลำดับเงื่อนไขที่ระบบต้องไม่ตอบ 9 ข้อ ใช้เป็นโครงของ gate order (ดู §6 Flow)

### 1.1 ขอบเขต (Scope)

**In-scope:**
- CRUD กลุ่มคำ (`AutoReplyKeyword`) + คำตรวจจับ (`AutoReplyPhrase`) + กฎคำตอบทุกระดับ (`AutoReplyRule`)
- normalize + matching 3 รูปแบบ (`EXACT` / `CONTAINS` / `STARTS_WITH`) + การตัดสินเมื่อตรงหลายกลุ่ม
- rule resolution 9 ระดับ + การถอยระดับทุกคู่ (`AutoReplyLog.resolutionLevel`)
- บริบทโฆษณา (`ConversationAdReferral` ของเดิม) + บริบทสินค้า (`Conversation.contextProduct*`)
- การกันตอบซ้ำผ่าน `AutoReplyJob.chatMessageId @unique` + echo handling
- การหยุดเมื่อพนักงานตอบ (`Conversation.autoReplyPausedUntil` + `ChatMessage.autoReplyKind`)
- โหมดทดสอบ 2 แบบ (หน้าจำลองไม่ส่งจริง + allowlist เธรดจริง)
- คิวงาน/sweeper/retry (`AutoReplyJob`) + บันทึก (`AutoReplyLog`) + การค้นหาย้อนหลัง
- สิทธิ์ OWNER/ADMIN/STAFF + ขอบเขตข้ามร้าน
- regression: ปิดฟีเจอร์แล้วแชทเดิม (00018/00019) ต้องทำงานเหมือนก่อนมีฟีเจอร์นี้ทุกประการ

**Out-of-scope (ตาม [[BRD]] §1.2):** AI ปรับแต่งข้อความก่อนส่ง, fuzzy match คำสะกดผิด, การรวบหลายข้อความก่อนตอบ, broadcast, ช่องทาง LINE/TikTok/DEEP, ชื่อแคมเปญ/ชุดโฆษณาจาก Marketing API, แดชบอร์ดสถิติ

### 1.2 ระดับเทส (Test Level) — บังคับอ่านก่อนรันเคสใด ๆ

| ระดับ | ใช้ตรวจอะไร | เครื่องมือ | ยิง Meta จริงไหม |
|---|---|---|---|
| **[Unit]** | pure function + service logic ที่แยกทดสอบได้ — normalize, matching, tie-break, rule resolution, gate order | **Vitest** (`src/lib/__tests__/`, `src/services/__tests__/`) mock Prisma/Graph client ทั้งหมดตาม pattern เดิม (`channel-chat-ingest.test.ts`, `channel-chat-outbound.test.ts`) | **ไม่** |
| **[Integration]** | เส้นทาง webhook → job → resolve → send → log บน DB จริง (dev Supabase) โดย mock เฉพาะชั้นส่งออก Meta | **Vitest** + Prisma จริง (ห้าม mock Prisma ในกลุ่มนี้ — จุดที่ต้องพิสูจน์คือ DB constraint) | **ไม่** (mock `sendOutboundMessage` ชั้นนอกสุด) |
| **[E2E]** | UI จริงผ่าน browser — หน้าตั้งค่า, หน้าจำลอง, แถบโหมดทดสอบ, การแสดงผลในเธรด, สิทธิ์ | **Playwright** (`e2e/auto-reply-*.spec.ts`) bypass login ด้วย `e2e/helpers/auth.ts` | **ไม่** |
| **[Concurrency]** | การชนกันของ worker/ผู้ใช้ — รันคู่ขนานจริงด้วย `Promise.all` บน DB จริง | **Vitest** (integration mode) | **ไม่** |
| **[Manual]** | สิ่งที่ต้องใช้ตาเทียบหรือใช้ Messenger จริง — ป้ายกำกับในเธรด, แถบสถานะค้าง, การส่งถึงผู้รับจริง | Chrome DevTools MCP + Messenger จริง (ขออนุญาต user ก่อน) | **ใช่ เฉพาะ TC ที่ระบุ** |

เคสที่ทำเครื่องหมาย 🛑 **BLOCKER** คือ **ห้าม merge ถ้าไม่ผ่าน**

### 1.3 คำสั่งรันมาตรฐาน

```bash
# Unit + Integration (Vitest)
npm run test -- src/lib/__tests__/auto-reply-normalize.test.ts
npm run test -- src/services/__tests__/auto-reply-*.test.ts
npm run test                       # ทั้งชุด

# E2E (Playwright) — user เป็นผู้รัน dev server เอง; ตรวจพอร์ตจริงก่อนเสมอ (ปกติ 4000)
npm run e2e -- e2e/auto-reply-*.spec.ts
```

**สภาพแวดล้อม E2E:** `http://seller.deepth.local:4000` (seller) — ห้ามใช้ `localhost` (memory `feedback_qa_domains`, `project_dev_port_4000`)

### 1.4 กติกาที่ใช้ตลอดทั้งฉบับ

1. **ห้าม assert แค่หน้าจอ** — ทุกเคสที่เปลี่ยนสถานะต้องยืนยันด้วย Prisma query ตรงบนตาราง/คอลัมน์ที่ [[DATABASE]] ระบุ
2. **การนับข้อความขาออกต้องนับจาก DB ไม่ใช่จาก mock call count เพียงอย่างเดียว** — เคสกันตอบซ้ำต้อง assert ทั้ง 2 ทาง (จำนวนครั้งที่เรียก sender **และ** จำนวนแถว `ChatMessage` ที่ `autoReplyKind IN ('AUTO','AUTO_TEST')`)
3. **ทุก query ใน assertion ต้องมี `shopId`** — ถ้าเคสใดต้องอ่านข้ามร้านเพื่อพิสูจน์การรั่ว ให้ระบุไว้ชัดว่าเป็นการอ่านเชิงตรวจสอบ
4. **ห้ามรัน `prisma db pull` เด็ดขาด** ระหว่างทำ QA (memory `feedback_qa_agent_no_prisma_pull`)
5. เคสที่มีคำว่า "ไม่ตอบ" ต้อง assert **2 อย่างเสมอ**: ไม่มีข้อความขาออกเกิดขึ้น **และ** มีแถว `AutoReplyLog` ที่ `decision` + `skipReason` ตรงตามที่ระบุ (AC-024-02 บังคับ)

---

## 2. ข้อมูลตั้งต้นที่ต้องเตรียม (Seed Data)

ชุดนี้ออกแบบให้ครอบคลุมทุกเคสในเอกสารโดยไม่ต้อง seed ซ้ำระหว่างกลุ่ม — helper ที่ต้องเขียน: `e2e/helpers/auto-reply-seed.ts` ⓐ (ต่อยอดจาก `e2e/helpers/auth.ts` เดิม)

### 2.1 ร้านและผู้ใช้

| รหัสอ้างอิง | รายละเอียด |
|---|---|
| **SHOP-A** | ร้านหลักที่ใช้ทดสอบ — `AutoReplyConfig` มีครบ (`isEnabled=true`, `testMode=false`, `humanTakeoverPauseMode="2H"`, `keywordCooldownSec=300`, `maxRepliesPerConversation=10`, `adsContextMode="UNTIL_RESOLVED"`, `handoffPhrases=["คุยกับแอดมิน","คืนเงิน","ของยังไม่ได้"]`) |
| **SHOP-B** | ร้านที่สอง ใช้พิสูจน์การรั่วข้ามร้าน — มีกลุ่มคำ/กฎ/log ของตัวเองครบ ชื่อกลุ่มคำ **ตั้งซ้ำกับ SHOP-A โดยตั้งใจ** เพื่อพิสูจน์ว่า `@@unique([shopId, name])` เป็น per-shop ไม่ใช่ global |
| **SHOP-C** | ร้านที่ **ไม่เคยมีแถว `AutoReplyConfig`** เลย — ใช้พิสูจน์ default ปลอดภัย (AC-015-01) และ regression ของร้านที่ไม่เปิดใช้ |
| **USER-OWNER-A** | OWNER ของ SHOP-A |
| **USER-ADMIN-A** | ADMIN ของ SHOP-A (feature 00012 Shop Staff) |
| **USER-STAFF-A** | STAFF ของ SHOP-A |
| **USER-OWNER-B** | OWNER ของ SHOP-B |

### 2.2 เพจ / ช่องทาง (`ShopChannel` — ของเดิม 00018)

| รหัส | รายละเอียด |
|---|---|
| **PAGE-1** | `ShopChannel` ของ SHOP-A, `platform="MESSENGER"`, active — "เพจอะไหล่" |
| **PAGE-2** | `ShopChannel` ของ SHOP-A, `platform="MESSENGER"`, active — "เพจเครื่องสำอาง" |
| **PAGE-3** | `ShopChannel` ของ SHOP-A, `platform="INSTAGRAM"`, active |
| **PAGE-OFF** | `ShopChannel` ของ SHOP-A ที่ inactive — ใช้เคส `CHANNEL_INACTIVE` |
| **PAGE-B1** | `ShopChannel` ของ SHOP-B |

### 2.3 โฆษณา (ค่า `adId` ดิบ — ไม่ใช่ FK ตาม [[DATABASE]] §3.4)

| รหัส | `adId` | ใช้ทำอะไร |
|---|---|---|
| **AD-1** | `"ad_1001"` | โฆษณาที่ **มีกฎตั้งไว้** บน PAGE-1 (ขายโช๊ครุ่น 390) |
| **AD-2** | `"ad_1002"` | โฆษณาที่ **มีกฎตั้งไว้** บน PAGE-1 (ขายโช๊ครุ่น 590) — ใช้เคสเปลี่ยนบริบท |
| **AD-3** | `"ad_9999"` | โฆษณาที่ **ไม่เคยตั้งกฎ** — ใช้เคสสำคัญ AC-007-04 (ถอยไป PAGE ไม่ใช่หยุดตอบ) |
| **AD-4** | `"ad_1001"` บน **PAGE-2** | `adId` เดียวกับ AD-1 แต่คนละเพจ — พิสูจน์ AC-007-02 |

### 2.4 สินค้า (`Product` — ของเดิม)

| รหัส | รายละเอียด |
|---|---|
| **PROD-1** | สินค้า active ของ SHOP-A "โช๊คหลังคู่ 335 มม." — ผูกกับ AD-1 |
| **PROD-2** | สินค้า active ของ SHOP-A "โช๊คหลังคู่ 390 มม." — ใช้เคสบริบทขัดแย้ง (MANUAL) |
| **PROD-OFF** | สินค้าของ SHOP-A ที่ **ปิดการขาย** — ใช้เคส AC-008-03 |
| **PROD-DEL** | สินค้าของ SHOP-A ที่จะถูก **ลบระหว่างเทส** — พิสูจน์ `onDelete: SetNull` บน `AutoReplyRule.productId` |
| **PROD-B1** | สินค้าของ SHOP-B — ใช้พิสูจน์ว่าเลือกข้ามร้านไม่ได้ (AC-008-01) |

### 2.5 กลุ่มคำและคำตรวจจับ (SHOP-A)

| รหัส | `name` | `matchType` | `priority` | `isActive` | `AutoReplyPhrase` |
|---|---|---|---|---|---|
| **KW-INTEREST** | `สนใจสินค้า` | `CONTAINS` | `100` | true | `สนใจ` · `ขอรายละเอียด` · `อยากสั่ง` |
| **KW-PRICE** | `ถามราคา` | `CONTAINS` | `120` | true | `ราคา` · `เท่าไหร่` · `กี่บาท` |
| **KW-COD-EXACT** | `เก็บปลายทาง (เป๊ะ)` | `EXACT` | `100` | true | `เก็บปลายทาง` |
| **KW-COD-CONTAINS** | `เก็บปลายทาง (ในประโยค)` | `CONTAINS` | `100` | true | `เก็บปลายทาง` |
| **KW-START** | `ขึ้นต้นด้วยสวัสดี` | `STARTS_WITH` | `100` | true | `สวัสดี` |
| **KW-LONG** | `คำยาว` | `CONTAINS` | `100` | true | `สนใจโช๊คหลัง` (ยาวกว่า `สนใจ` ของ KW-INTEREST) |
| **KW-TIE-A** | `เสมอกัน A` | `CONTAINS` | `100` | true | `ทดสอบเสมอ` |
| **KW-TIE-B** | `เสมอกัน B` | `CONTAINS` | `100` | true | `ทดสอบเสมอ` (คำเดียวกัน ความยาวเท่ากัน → บังคับใช้ tie-break ชั้นสุดท้าย) |
| **KW-OFF** | `กลุ่มที่ปิดอยู่` | `CONTAINS` | `999` | **false** | `สนใจ` (priority สูงสุด แต่ปิด → ต้องไม่ถูกเลือกเลย) |
| **KW-SPACE** | `คำมีช่องว่าง` | `CONTAINS` | `100` | true | `ส่ง ฟรี ไหม` |

> **หมายเหตุ:** `KW-COD-EXACT` กับ `KW-COD-CONTAINS` ตั้งใจให้ `priority` และ `phrase` เท่ากันทุกอย่าง ต่างแค่ `matchType` — เป็นชุดข้อมูลที่บังคับให้เกณฑ์ที่ 3 ของ BR-AR-04 (EXACT ก่อน CONTAINS) ถูกใช้จริง

### 2.6 กฎคำตอบ (`AutoReplyRule` ของ SHOP-A — `specificity` ตามสูตร [[DATABASE]] §3.4)

| รหัส | `keywordId` | `shopChannelId` | `adId` | `productId` | `specificity` | ระดับที่คาดหวัง |
|---|---|---|---|---|---|---|
| **R-7** | KW-INTEREST | PAGE-1 | `ad_1001` | PROD-1 | `7` | `KEYWORD_PAGE_AD_PRODUCT` |
| **R-6** | KW-INTEREST | PAGE-1 | `ad_1002` | — | `6` | `KEYWORD_PAGE_AD` |
| **R-5** | KW-INTEREST | PAGE-1 | — | PROD-2 | `5` | `KEYWORD_PAGE_PRODUCT` |
| **R-4** | KW-INTEREST | PAGE-1 | — | — | `4` | `KEYWORD_PAGE` |
| **R-1** | KW-INTEREST | — | — | PROD-1 | `1` | `KEYWORD_PRODUCT` |
| **R-0** | KW-INTEREST | — | — | — | `0` | `KEYWORD_DEFAULT` |
| **R-PAGE-DEF** | **null** | PAGE-1 | — | — | `4` | `PAGE_DEFAULT` |
| **R-SHOP-DEF** | **null** | — | — | — | `0` | `SHOP_DEFAULT` |
| **R-EMPTY** | KW-PRICE | PAGE-2 | — | — | `4` | `replyText` เป็นช่องว่างล้วน → ต้องถูกข้าม (`EMPTY_REPLY`) |
| **R-INACTIVE** | KW-PRICE | PAGE-1 | — | — | `4` | `isActive=false` → ต้องถูกข้าม |
| **R-SCHEDULED** | KW-PRICE | PAGE-3 | — | — | `4` | `activeFrom`/`activeUntil` อยู่ **นอกช่วงเวลาปัจจุบัน** → ต้องถูกข้าม |
| **R-MIXED** | KW-INTEREST | — | `ad_1002` | PROD-2 | `3` | เงื่อนไขผสม ad+product ไม่ระบุเพจ (AC-008-04) |
| **R-B** | (ของ SHOP-B) | PAGE-B1 | — | — | `4` | ใช้พิสูจน์ว่ากฎ SHOP-B ไม่ถูกหยิบมาใช้กับ SHOP-A เด็ดขาด |

> `replyText` ของทุกกฎให้ใส่ข้อความที่ **ระบุระดับตัวเองได้ชัดเจน** เช่น `"[R-6] รุ่นนี้ราคา 590 บาท เก็บเงินปลายทางได้ค่ะ"` เพื่อให้ assertion ตรวจได้ทั้งระดับที่เลือกและความตรงทุกตัวอักษรในเคสเดียว

### 2.7 เธรดและข้อความ

| รหัส | รายละเอียด |
|---|---|
| **CONV-1** | เธรด MESSENGER ของ SHOP-A บน PAGE-1, `autoReplyEnabled=null`, `autoReplyTestEnabled=false`, `autoReplyCount=0`, มี `ConversationAdReferral` ของ AD-1 |
| **CONV-2** | เธรดบน PAGE-2, ไม่มี ad referral — ใช้เคสถอยระดับ |
| **CONV-3** | เธรดบน PAGE-1 ที่ `autoReplyEnabled=false` (ร้านตั้งปิดเฉพาะเธรดนี้) |
| **CONV-TEST** | เธรดบน PAGE-1 ที่ `autoReplyTestEnabled=true` — allowlist โหมดทดสอบ |
| **CONV-SPAM** | เธรดที่ `isSpam=true` |
| **CONV-HANDOFF** | เธรดที่ `handoffAt` ไม่เป็น null |
| **CONV-PAUSED** | เธรดที่ `autoReplyPausedUntil` = อนาคต |
| **CONV-MAXED** | เธรดที่ `autoReplyCount=10` (ครบ `maxRepliesPerConversation`) |
| **CONV-OLD** | เธรดที่ `lastInboundAt` เก่ากว่า 24 ชม. — เคส `WINDOW_CLOSED` |
| **CONV-B** | เธรดของ SHOP-B |

### 2.8 ค่าคงที่ที่ทุก assertion ต้องใช้ตรงตัว ([[DATABASE]] §3.8 — FROZEN)

- `AutoReplyKeyword.matchType`: `EXACT` · `CONTAINS` · `STARTS_WITH`
- `AutoReplyConfig.humanTakeoverPauseMode`: `30M` · `2H` · `MANUAL` · `UNTIL_RESOLVED`
- `AutoReplyConfig.adsContextMode`: `UNTIL_RESOLVED` · `HOURS` · `UNTIL_NEW_PRODUCT`
- `AutoReplyJob.status`: `PENDING` · `PROCESSING` · `DONE` · `FAILED` · `SKIPPED`
- `AutoReplyLog.decision`: `REPLIED` · `SKIPPED` · `HANDOFF` · `FAILED`
- `AutoReplyLog.resolutionLevel`: `KEYWORD_PAGE_AD_PRODUCT` · `KEYWORD_PAGE_AD` · `KEYWORD_PAGE_PRODUCT` · `KEYWORD_PAGE` · `KEYWORD_PRODUCT` · `KEYWORD_DEFAULT` · `PAGE_DEFAULT` · `SHOP_DEFAULT` · `NONE`
- `AutoReplyLog.skipReason`: `SHOP_DISABLED` · `CONVERSATION_DISABLED` · `NOT_IN_TEST_ALLOWLIST` · `SPAM` · `HANDED_OFF` · `PAUSED_HUMAN_TAKEOVER` · `OUTBOUND_MESSAGE` · `KEYWORD_COOLDOWN` · `MAX_REPLIES_REACHED` · `NO_KEYWORD_MATCH` · `NO_RULE_MATCH` · `EMPTY_REPLY` · `WINDOW_CLOSED` · `CHANNEL_INACTIVE` · `DUPLICATE_JOB`
- `ChatMessage.autoReplyKind`: `null` · `AUTO` · `AUTO_TEST`
- `Conversation.contextProductSource`: `ADS_MAPPING` · `MANUAL` · `REFERRAL`

### 2.9 ค่าคงที่เพิ่ม — phase `00023-qna` (ต่อ §2.8 เดิม, [[DATABASE]] §3.8 FROZEN)

- `AutoReplyLog.resolutionLevel` เพิ่ม: **`QNA`**
- `AutoReplyLog.matchedVia`: `KEYWORD` · `QNA` · `null` (แถวเก่าก่อน phase นี้ — อ่านว่า `KEYWORD` เสมอ ห้าม backfill ทับ)
- `AutoReplyQna.source`: `MANUAL` · `QUEUE` · `IMPORT`
- `AutoReplyUnansweredQuestion.status`: `PENDING` · `DISMISSED` · `ANSWERED`
- `AutoReplyKeyword.status` (ของเดิม แต่ใช้บ่อยในกลุ่มนี้): `LIVE` · `TEST` · `OFFLINE`
- `AutoReplyConfig.activeScheduleMode` (ของเดิม แต่ TC-GATE-05 ต้องใช้): `ALWAYS` · `WINDOW`

### 2.10 คลังคำถาม-คำตอบตั้งต้น (`AutoReplyQna`, SHOP-A เว้นแต่ระบุ)

| รหัส | กลุ่มเจ้าของ | `question` | `answer` | `isActive` | `useCount` | `imageFileIds` | `source` |
|---|---|---|---|---|---|---|---|
| **QNA-1** | KW-INTEREST (LIVE) | `สอบถามรายละเอียด` | `[QNA-1] ยินดีให้ข้อมูลเพิ่มเติมค่ะ ทักมาได้เลย` | true | 5 | `[]` | MANUAL |
| **QNA-INACTIVE** | KW-INTEREST | `มีของแถมไหม` | `[QNA-INACTIVE] มีค่ะ` | **false** | 0 | `[]` | MANUAL |
| **QNA-IMG** | KW-PRICE | `ขอดูรูปสินค้า` | `""` (ว่าง — อนุญาตเพราะมีรูป) | true | 0 | `["f1","f2"]` | MANUAL |
| **QNA-OFFLINE** | **KW-DRAFT** (ใหม่ — SHOP-A, `status="OFFLINE"`) | `ค่าส่งเท่าไหร่` | `[QNA-OFFLINE] ฟรีค่ะ` | true | 0 | `[]` | MANUAL |
| **QNA-TEST** | **KW-TESTMODE** (ใหม่ — SHOP-A, `status="TEST"`, ผูก `AutoReplyKeywordTestThread` กับ CONV-TEST) | `รับประกันกี่เดือน` | `[QNA-TEST] รับประกัน 6 เดือนค่ะ` | true | 0 | `[]` | MANUAL |
| **QNA-DUP-B** | KW-B (ของ SHOP-B) | `สอบถามรายละเอียด` (คำถาม**เดียวกับ** QNA-1 — คนละร้าน) | `[QNA-DUP-B] ...` | true | 999 | `[]` | MANUAL |

> **KW-DRAFT** และ **KW-TESTMODE** เป็นกลุ่มคำใหม่ที่ต้อง seed เพิ่มจาก §2.5 เดิม — ใช้เฉพาะกลุ่ม R/S ของ phase นี้ ไม่ปนกับ TC เดิมของ base feature (ตั้งชื่อแยกกันตั้งใจให้ grep แยกออกจาก KW-* เดิมได้ทันที)

### 2.11 คิวคำถามที่ตอบไม่ได้ตั้งต้น (`AutoReplyUnansweredQuestion`, SHOP-A)

| รหัส | `normalizedQuestion` | `hitCount` | `status` | หมายเหตุ |
|---|---|---|---|---|
| **UQ-PENDING** | `ตัดหมอกรุ่นไหนที่ร้านแนะนำ` | 8 | PENDING | ใช้เคส list/dismiss/convert |
| **UQ-DISMISSED** | `มีโปรวันเกิดไหม` | 3 | DISMISSED (`dismissedAt` มีค่า) | ใช้เคส restore |
| **UQ-ANSWERED** | `มีบริการติดตั้งไหม` | 12 | ANSWERED (`qnaId` ชี้ QnA จริง) | ใช้เคสถามซ้ำหลังตอบแล้ว (hitCount ต้องยังโตได้) |

### 2.12 ร้าน/กลุ่มคำ/เธรดแยกสำหรับเทสตารางเวลา (gate 6.6 — เป็นค่าระดับร้าน ไม่ใช่ระดับกลุ่มคำ)

> แยกร้านใหม่ **SHOP-D** โดยเจตนา ไม่ใช้ SHOP-A — เพราะ `activeScheduleMode`/`activeStartMin`/`activeEndMin`/`activeDays` อยู่ที่ `AutoReplyConfig` (ระดับร้าน) การตั้งตารางเวลาแคบ ๆ บน SHOP-A จะไปกระทบ TC อื่นทั้งหมดของร้านเดียวกันที่ไม่เกี่ยวกับตารางเวลา

| รหัส | รายละเอียด |
|---|---|
| **SHOP-D** | ร้านใหม่ `AutoReplyConfig.activeScheduleMode="WINDOW"`, `activeStartMin`/`activeEndMin` ตั้งให้ **นอกช่วงเวลาปัจจุบันเสมอ** (คำนวณ ณ runtime ไม่ hardcode เวลาตายตัว — ดู TC-GATE-05), `activeDays=ALL_DAYS_MASK` |
| **KW-D** | กลุ่มคำ LIVE ของ SHOP-D, phrase `ราคา` |
| **QNA-D** | ข้อในคลังของ KW-D, question `ราคาเท่าไหร่` |
| **CONV-D** | เธรดของ SHOP-D |

---

## 3. Test Scenarios

> ทุก TC ระบุ **ประเภท** ชัดเจน — [Unit] / [Integration] / [E2E] / [Concurrency] / [Manual] และ **AC ที่อ้างอิง** ทุกเคส

### 3.1 กลุ่ม A — [Unit] การปรับข้อความให้เป็นมาตรฐาน (normalize)

**ไฟล์:** `src/lib/__tests__/auto-reply-normalize.test.ts` ⓐ · ฟังก์ชัน `normalizeMessage()` ⓐ (ตัวเดียวกับที่ใช้สร้าง `AutoReplyPhrase.normalizedPhrase` — [[DATABASE]] §6)

#### TC-NORM-01: ตัดช่องว่างหัวท้ายและยุบช่องว่างซ้ำ
- **ประเภท:** [Unit] Vitest
- **Precondition:** ไม่ต้องมี DB
- **Steps:** เรียก `normalizeMessage()` ด้วย `"   สนใจ    ครับ   "`, `"สนใจ\t\tครับ"`, `"สนใจ\n\nครับ"`
- **Expected Result:** ทั้ง 3 คืนค่าเดียวกันคือ `"สนใจ ครับ"` — ไม่มีช่องว่างหัวท้าย ช่องว่างภายในเหลือตัวเดียว (รวม tab/newline ถูกนับเป็นช่องว่างด้วย)
- **Linked to:** AC-010-01

#### TC-NORM-02: ไม่แยกตัวพิมพ์เล็ก/ใหญ่ของภาษาอังกฤษ
- **ประเภท:** [Unit] Vitest
- **Steps:** เรียกด้วย `"COD"`, `"cod"`, `"Cod"`, `"cOd"`
- **Expected Result:** ทั้ง 4 คืนค่าเดียวกัน (`"cod"`); และการ match phrase `"cod"` กับข้อความ `"มี COD ไหม"` ต้องเจอ
- **Linked to:** AC-010-02

#### TC-NORM-03: เครื่องหมายวรรคตอนและเครื่องหมายคำถามท้ายประโยค
- **ประเภท:** [Unit] Vitest
- **Steps:** เรียกด้วย `"สนใจ!!"`, `"สนใจ!!!"`, `"ราคา???"`, `"สนใจ..."`, `"สนใจ ๆ"`, `"สนใจ~"`
- **Expected Result:** ผลลัพธ์ต้องเทียบกับ phrase `"สนใจ"` / `"ราคา"` ได้ทั้งหมด — เครื่องหมายท้ายประโยคต้องไม่ทำให้เทียบไม่ตรง; และต้องเป็นการตัดเครื่องหมาย **ไม่ใช่การตัดอักขระไทย** (`"สนใจ"` ต้องยังเป็น `"สนใจ"` ครบทุกตัว)
- **Linked to:** AC-010-03, AC-010-05

#### TC-NORM-04: Unicode ไทยที่ประกอบอักขระต่างกันต้องเทียบกันได้
- **ประเภท:** [Unit] Vitest
- **Steps:** สร้างคำเดียวกัน 2 รูปแบบ — NFC และ NFD (เช่น `"ค่ะ"` ที่ประกอบสระ/วรรณยุกต์คนละลำดับ) แล้วเรียก `normalizeMessage()` ทั้งคู่
- **Expected Result:** คืนค่า string ที่ **เท่ากันแบบ `===`** (ยืนยันว่ามีการ normalize Unicode จริง ไม่ใช่แค่ trim); assert เพิ่มด้วยว่าผลลัพธ์อยู่ในรูป NFC
- **Linked to:** AC-010-04

#### TC-NORM-05: 🛑 **BLOCKER** — ชุดคำ "สนใจ" ครบทุกรูปแบบต้องเข้ากลุ่มเดียวกัน
- **ประเภท:** [Unit] Vitest (table-driven)
- **Precondition:** กลุ่ม `KW-INTEREST` (`matchType="CONTAINS"`, phrase `"สนใจ"`)
- **Steps:** วนทดสอบ input ทุกตัว: `สนใจ` · `สนใจครับ` · `สนใจค่ะ` · `สนใจคับ` · `สนใจจ้า` · `สนใจ!!` · `  สนใจ   ครับ  ` · `สนใจCRAB`
- **Expected Result:** **ทุกตัว** match `KW-INTEREST` — ไม่มีตัวใดหลุด (เคสนี้คือคำสัญญาหลักที่ร้านจะตัดสินว่าฟีเจอร์ใช้ได้จริงไหม)
- **Linked to:** AC-010-05

#### TC-NORM-06: normalize ต้อง idempotent และใช้ฟังก์ชันเดียวกับตอนบันทึก phrase
- **ประเภท:** [Unit] Vitest
- **Steps:**
  1. ยืนยัน `normalizeMessage(normalizeMessage(x)) === normalizeMessage(x)` สำหรับ input ทุกตัวใน TC-NORM-05
  2. บันทึก `AutoReplyPhrase` ผ่าน service จริง แล้วเทียบ `normalizedPhrase` ที่ถูกเขียนลง DB กับ `normalizeMessage(phrase)` ที่เรียกตรง
- **Expected Result:** ขั้น 1 เท่ากันทุกตัว; ขั้น 2 ค่าใน DB ตรงกับผลของฟังก์ชันเป๊ะ — พิสูจน์ว่าไม่มี normalize 2 ตัวแยกกัน (ข้อควรระวังใน [[DATABASE]] §6)
- **Linked to:** AC-010-04, AC-010-05

#### TC-NORM-07: คำตรวจจับที่มีช่องว่างภายในและวรรณยุกต์ครบ
- **ประเภท:** [Unit] Vitest
- **Precondition:** กลุ่ม `KW-SPACE` phrase `"ส่ง ฟรี ไหม"`
- **Steps:** ทดสอบข้อความ `"ส่ง  ฟรี   ไหม"`, `"ร้านนี้ส่ง ฟรี ไหมครับ"`, `"ส่งฟรีไหม"` (ไม่มีช่องว่าง)
- **Expected Result:** 2 ตัวแรก match; ตัวที่ 3 **ไม่ match** (ระบบไม่ตัดช่องว่างทิ้งทั้งหมด — ยุบซ้ำเท่านั้น) และผลลัพธ์นี้ต้องถูกอธิบายไว้ในหน้าตั้งค่า
- **Linked to:** AC-002-05

#### TC-NORM-08: ข้อความต้นฉบับและข้อความที่ปรับแล้วถูกบันทึกคู่กัน
- **ประเภท:** [Integration] Vitest
- **Precondition:** SHOP-A เปิดใช้งาน, CONV-1
- **Steps:** ส่งข้อความขาเข้า `"  สนใจ!!  "` ผ่าน pipeline จริง → อ่านแถว `AutoReplyLog` ที่เกิดขึ้น
- **Expected Result:** `rawText` = `"  สนใจ!!  "` (ต้นฉบับไม่ถูกแก้), `normalizedText` = ผลของ `normalizeMessage()` — ทั้ง 2 คอลัมน์ไม่เป็น null
- **Linked to:** AC-010-06, AC-024-01

---

### 3.2 กลุ่ม B — [Unit] การจับคู่ 3 รูปแบบ

**ไฟล์:** `src/services/__tests__/auto-reply-match.test.ts` ⓐ

#### TC-MATCH-01: `EXACT` — ตรงทั้งข้อความเท่านั้น
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-COD-EXACT` (`matchType="EXACT"`, phrase `"เก็บปลายทาง"`) — ปิด `KW-COD-CONTAINS` ชั่วคราวเพื่อแยกตัวแปร
- **Steps:** ทดสอบ `"เก็บปลายทาง"`, `"เก็บปลายทาง!"`, `" เก็บปลายทาง "`, `"มีเก็บปลายทางไหม"`, `"เก็บปลายทางไหม"`
- **Expected Result:** 3 ตัวแรก **match** (เพราะ normalize แล้วเท่ากันพอดี); 2 ตัวหลัง **ไม่ match** — และเคสไม่ match ต้องได้ `skipReason="NO_KEYWORD_MATCH"` เมื่อไม่มีกลุ่มอื่นรับ
- **Linked to:** AC-003-01

#### TC-MATCH-02: `CONTAINS` — มีคำอยู่ที่ตำแหน่งใดก็ได้
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-INTEREST` (`CONTAINS`, phrase `"สนใจ"`)
- **Steps:** ทดสอบ `"สนใจ"`, `"ผมสนใจครับ"`, `"อยากทราบราคา สนใจมากเลย"`, `"สน ใจ"` (มีช่องว่างคั่น)
- **Expected Result:** 3 ตัวแรก match; `"สน ใจ"` **ไม่ match** (ระบบไม่ทำ fuzzy — เฟส 2)
- **Linked to:** AC-003-01

#### TC-MATCH-03: `STARTS_WITH` — ขึ้นต้นเท่านั้น
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-START` (`STARTS_WITH`, phrase `"สวัสดี"`)
- **Steps:** ทดสอบ `"สวัสดีครับ"`, `"  สวัสดีค่ะ"`, `"ครับสวัสดี"`, `"ขอถามหน่อย สวัสดีครับ"`
- **Expected Result:** 2 ตัวแรก match (ช่องว่างหัวถูกตัดก่อนเทียบ); 2 ตัวหลัง **ไม่ match**
- **Linked to:** AC-003-01

#### TC-MATCH-04: `EXACT` ยังตรงหลัง normalize
- **ประเภท:** [Unit] Vitest
- **Steps:** `KW-COD-EXACT` กับข้อความ `"เก็บปลายทาง???"` และ `"เก็บ  ปลายทาง"` ⓐ (ตัวหลังขึ้นกับว่า normalize ยุบช่องว่างแล้ว phrase มีช่องว่างหรือไม่)
- **Expected Result:** `"เก็บปลายทาง???"` match (เครื่องหมายถูกตัด); `"เก็บ  ปลายทาง"` **ไม่ match** เพราะ normalize ยุบเหลือ `"เก็บ ปลายทาง"` ซึ่งไม่เท่ากับ `"เก็บปลายทาง"` — ยืนยันว่า EXACT เทียบกับ **ผลหลัง normalize** ไม่ใช่ raw
- **Linked to:** AC-003-01, AC-010-03

#### TC-MATCH-05: กลุ่มที่ปิดใช้งานต้องไม่ถูกนำมาเทียบเลย
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-OFF` (`isActive=false`, `priority=999` สูงสุด, phrase `"สนใจ"`)
- **Steps:** ส่งข้อความ `"สนใจ"` แล้วตรวจผลการจับคู่และ query ที่ถูกยิง
- **Expected Result:** ผู้ชนะคือ `KW-INTEREST` ไม่ใช่ `KW-OFF`; และ `matchTrace` **ไม่มี** `KW-OFF` อยู่ในรายชื่อผู้แพ้ด้วยซ้ำ (ต้องถูกกรองที่ระดับ query ด้วย index `[shopId, isActive, priority]` ไม่ใช่กรองใน JS)
- **Linked to:** AC-001-03

#### TC-MATCH-06: 🛑 **BLOCKER** — กลุ่มคำของร้านอื่นต้องไม่ถูกนำมาเทียบ
- **ประเภท:** [Unit] + [Integration] Vitest
- **Precondition:** SHOP-B มีกลุ่มคำชื่อซ้ำกับ SHOP-A และมี phrase `"สนใจ"` ที่ `priority=999`
- **Steps:** ประมวลผลข้อความ `"สนใจ"` ของ CONV-1 (SHOP-A) → ตรวจ SQL ที่ถูกยิง (Prisma log) และผู้ชนะ
- **Expected Result:** ทุก query ที่โหลดกลุ่มคำ/กฎ **มี `shopId` ใน `WHERE`** (ห้าม post-filter ใน JS); ผู้ชนะเป็นกลุ่มของ SHOP-A เสมอ; `AutoReplyLog.shopId` = SHOP-A
- **Linked to:** AC-001-05, BR-AR-01

---

### 3.3 กลุ่ม C — [Unit] การตัดสินเมื่อตรงหลายกลุ่ม (BR-AR-04)

**ไฟล์:** `src/services/__tests__/auto-reply-tiebreak.test.ts` ⓐ

#### TC-TIE-01: เกณฑ์ที่ 1 — `priority` สูงกว่าชนะ
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-PRICE` (`priority=120`) และ `KW-INTEREST` (`priority=100`) ทั้งคู่ match
- **Steps:** ส่ง `"สนใจ ราคาเท่าไหร่"` (ตรงทั้ง 2 กลุ่ม)
- **Expected Result:** ผู้ชนะ = `KW-PRICE`; `matchTrace.winnerReason` ระบุว่าชนะด้วยเกณฑ์ `priority` ⓐ
- **Linked to:** AC-003-02, AC-011-02

#### TC-TIE-02: เกณฑ์ที่ 2 — `priority` เท่ากัน → เฉพาะเจาะจงกว่าชนะ
- **ประเภท:** [Unit] Vitest
- **Precondition:** 2 กลุ่ม `priority=100` เท่ากัน กลุ่มหนึ่งมีกฎ `specificity=6` อีกกลุ่มมีแค่ `specificity=0`
- **Steps:** ส่งข้อความที่ match ทั้งคู่ในบริบท PAGE-1 + AD-2
- **Expected Result:** ผู้ชนะคือกลุ่มที่มีกฎเฉพาะเจาะจงกว่า; `resolutionLevel="KEYWORD_PAGE_AD"`
- **Linked to:** AC-011-02

#### TC-TIE-03: เกณฑ์ที่ 3 — `EXACT` ชนะ `CONTAINS`
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-COD-EXACT` และ `KW-COD-CONTAINS` — `priority`, phrase, ความยาว phrase เท่ากันทุกอย่าง
- **Steps:** ส่งข้อความ `"เก็บปลายทาง"` (ตรงทั้ง 2 แบบ)
- **Expected Result:** ผู้ชนะ = `KW-COD-EXACT`; `AutoReplyLog.matchType="EXACT"`
- **Linked to:** AC-011-02

#### TC-TIE-04: เกณฑ์ที่ 4 — คำตรวจจับที่ยาวกว่าชนะ
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-INTEREST` (phrase `"สนใจ"`) และ `KW-LONG` (phrase `"สนใจโช๊คหลัง"`) — `priority` และ `matchType` เท่ากัน
- **Steps:** ส่ง `"สนใจโช๊คหลังครับ"` (ตรงทั้ง 2)
- **Expected Result:** ผู้ชนะ = `KW-LONG`; `matchedPhrase="สนใจโช๊คหลัง"` — วัดความยาวจาก **normalizedPhrase** ไม่ใช่ raw
- **Linked to:** AC-011-02

#### TC-TIE-05: เท่ากันทุกเกณฑ์ → ต้องมีผู้ชนะที่กำหนดไว้แน่นอน
- **ประเภท:** [Unit] Vitest
- **Precondition:** `KW-TIE-A` และ `KW-TIE-B` — `priority`, `matchType`, phrase, ความยาว, specificity ของกฎ เท่ากันทุกประการ
- **Steps:** ส่ง `"ทดสอบเสมอ"`
- **Expected Result:** ได้ผู้ชนะ 1 กลุ่มเสมอ (ไม่ throw ไม่คืน null ไม่ตอบ 2 ข้อความ) และเกณฑ์ตัดสินชั้นสุดท้ายต้องเป็นค่าที่คงที่ข้ามการรัน — **ต้องเป็นการเรียงด้วยคอลัมน์ของ DB ที่ไม่เปลี่ยน** (ข้อเสนอ: `AutoReplyKeyword.createdAt ASC` แล้วตามด้วย `id ASC`) ⓐ **ต้องยืนยันใน SDS** เพราะ [[DATABASE]] ไม่ได้ freeze เกณฑ์นี้ไว้
- **Linked to:** AC-011-03, BR-AR-04

#### TC-TIE-06: 🛑 **BLOCKER** — deterministic ข้ามการรันและข้ามลำดับข้อมูล
- **ประเภท:** [Unit] Vitest
- **Precondition:** ชุดกลุ่มคำเดียวกับ TC-TIE-05 บวก `KW-INTEREST`/`KW-PRICE`
- **Steps:**
  1. รัน resolve ด้วย input เดิม **50 รอบติดกัน** เก็บ `keywordId` + `ruleId` + `resolutionLevel` ทุกรอบ
  2. ลบแล้ว seed ใหม่โดย **สลับลำดับการ insert** ของกลุ่มคำ (B ก่อน A) แล้วรันอีก 50 รอบ
  3. รันโดยส่ง array ของกฎเข้ามาในลำดับที่สลับกัน (ถ้า resolver รับ array) ⓐ
- **Expected Result:** ผลลัพธ์ทั้ง 150 รอบ **เหมือนกันทุกฟิลด์** — ไม่มีการพึ่งลำดับที่ DB คืนแถวมาโดยบังเอิญ, ไม่มี `Math.random()`, ไม่มีการพึ่ง `Date.now()` ในการตัดสิน
- **Linked to:** AC-011-03, BR-AR-04

#### TC-TIE-07: หนึ่งข้อความได้คำตอบไม่เกิน 1 รายการแม้ตรง 3 กลุ่ม
- **ประเภท:** [Integration] Vitest
- **Precondition:** ข้อความที่ตรงพร้อมกัน 3 กลุ่ม (`KW-INTEREST` + `KW-PRICE` + `KW-COD-CONTAINS`)
- **Steps:** ส่ง `"สนใจครับ ราคาเท่าไหร่ มีเก็บปลายทางไหม"` ผ่าน pipeline จริง 1 ครั้ง
- **Expected Result:** `ChatMessage` ที่ `autoReplyKind='AUTO'` ในเธรดนี้เพิ่มขึ้น **1 แถวพอดี**; sender ถูกเรียก 1 ครั้ง; `AutoReplyLog` มี 1 แถว `decision="REPLIED"`
- **Linked to:** AC-011-01, BR-AR-03

#### TC-TIE-08: `matchTrace` บันทึกผู้ชนะ เหตุผล และผู้แพ้ครบ
- **ประเภท:** [Integration] Vitest
- **Steps:** ใช้ input จาก TC-TIE-07 → อ่าน `AutoReplyLog.matchTrace`
- **Expected Result:** `matchTrace` เป็น JSON ที่มีอย่างน้อย: กลุ่มผู้ชนะ (id + name), เกณฑ์ที่ทำให้ชนะ (ระบุได้ว่าเป็นเกณฑ์ที่เท่าไหร่ใน 4 ข้อ), และรายการกลุ่มที่แพ้พร้อมเหตุผลรายกลุ่ม — อ่านแล้วร้านตอบคำถาม "ทำไมเลือกกลุ่มนี้" ได้โดยไม่ต้องเปิดโค้ด
- **Linked to:** AC-011-04, BR-AR-05

---

### 3.4 กลุ่ม D — [Unit] การเลือกกฎและการถอยระดับ 9 ขั้น (FR-009)

**ไฟล์:** `src/services/__tests__/auto-reply-resolve.test.ts` ⓐ · ทุกเคสใช้กฎชุด §2.6

#### TC-RES-01: ระดับ 1 — Keyword + เพจ + โฆษณา + สินค้า
- **ประเภท:** [Unit] Vitest
- **Precondition:** มี R-7 ครบ; บริบท = PAGE-1 + `ad_1001` + PROD-1
- **Steps:** resolve ด้วย `KW-INTEREST` + บริบทข้างต้น
- **Expected Result:** ได้ R-7; `resolutionLevel="KEYWORD_PAGE_AD_PRODUCT"`; `replyText` ตรงกับของ R-7 ทุกตัวอักษร
- **Linked to:** AC-009-01

#### TC-RES-02: ระดับ 2 — Keyword + เพจ + โฆษณา
- **ประเภท:** [Unit] Vitest
- **Precondition:** บริบท = PAGE-1 + `ad_1002` + ไม่มีสินค้า
- **Steps:** resolve
- **Expected Result:** ได้ R-6; `resolutionLevel="KEYWORD_PAGE_AD"` — ยืนยัน AC-007-03 ว่าเธรดที่มีบริบทโฆษณาตรงต้องใช้คำตอบของโฆษณานั้น
- **Linked to:** AC-009-01, AC-007-03

#### TC-RES-03: ระดับ 3 — Keyword + เพจ + สินค้า
- **ประเภท:** [Unit] Vitest
- **Precondition:** บริบท = PAGE-1 + ไม่มีโฆษณา + PROD-2
- **Expected Result:** ได้ R-5; `resolutionLevel="KEYWORD_PAGE_PRODUCT"`
- **Linked to:** AC-009-01

#### TC-RES-04: ระดับ 4 — Keyword + เพจ
- **ประเภท:** [Unit] Vitest
- **Precondition:** บริบท = PAGE-1 เท่านั้น
- **Expected Result:** ได้ R-4; `resolutionLevel="KEYWORD_PAGE"`
- **Linked to:** AC-009-01

#### TC-RES-05: ระดับ 5 — Keyword + สินค้า (ไม่ระบุเพจ)
- **ประเภท:** [Unit] Vitest
- **Precondition:** บริบท = เพจที่ไม่มีกฎระดับเพจ (PAGE-3) + PROD-1
- **Expected Result:** ได้ R-1; `resolutionLevel="KEYWORD_PRODUCT"` — ยืนยัน AC-008-02
- **Linked to:** AC-009-01, AC-008-02

#### TC-RES-06: ระดับ 6 — Keyword กลาง
- **ประเภท:** [Unit] Vitest
- **Precondition:** บริบท = PAGE-3 ไม่มีโฆษณา ไม่มีสินค้า
- **Expected Result:** ได้ R-0; `resolutionLevel="KEYWORD_DEFAULT"`
- **Linked to:** AC-009-01

#### TC-RES-07: ระดับ 7 — คำตอบกลางของเพจ (ไม่มีกลุ่มคำใดตรง)
- **ประเภท:** [Unit] Vitest
- **Precondition:** ข้อความที่ **ไม่ match กลุ่มคำใดเลย** (`"อยากได้ใบเสนอราคาแบบมีตราประทับ"`) + บริบท PAGE-1 ที่มี R-PAGE-DEF
- **Expected Result:** ได้ R-PAGE-DEF; `resolutionLevel="PAGE_DEFAULT"`; `keywordId` ใน log เป็น null; **ไม่ใช่** `HANDOFF` (BR-AR-06 ห้ามเงียบทั้งที่มีคำตอบกลาง)
- **Linked to:** AC-009-01, AC-009-05

#### TC-RES-08: ระดับ 8 — คำตอบกลางของร้าน
- **ประเภท:** [Unit] Vitest
- **Precondition:** ข้อความไม่ match กลุ่มใด + บริบท PAGE-3 (ไม่มี PAGE_DEFAULT ของเพจนี้) + มี R-SHOP-DEF
- **Expected Result:** ได้ R-SHOP-DEF; `resolutionLevel="SHOP_DEFAULT"`
- **Linked to:** AC-009-01, AC-009-05

#### TC-RES-09: ระดับ 9 — ไม่เหลืออะไรให้ถอย
- **ประเภท:** [Unit] Vitest
- **Precondition:** ลบ R-PAGE-DEF และ R-SHOP-DEF ออก; ข้อความไม่ match กลุ่มใด
- **Expected Result:** ไม่มีข้อความถูกส่ง; `decision="HANDOFF"`; `resolutionLevel="NONE"`; `skipReason="NO_KEYWORD_MATCH"`
- **Linked to:** AC-009-01, AC-009-04

#### TC-RES-10: 🛑 **BLOCKER** — เมทริกซ์การถอยระดับทุกคู่
- **ประเภท:** [Unit] Vitest (table-driven)
- **Precondition:** ชุดกฎ §2.6 ครบ
- **Steps:** สร้างตารางทดสอบที่ตัดกฎออกทีละระดับจากบนลงล่าง แล้ว resolve ด้วยบริบทเดิม (PAGE-1 + `ad_1001` + PROD-1) — รวม **8 แถว** ที่คาดหวังผลไล่จาก `KEYWORD_PAGE_AD_PRODUCT` → `KEYWORD_PAGE_AD` → `KEYWORD_PAGE_PRODUCT` → `KEYWORD_PAGE` → `KEYWORD_PRODUCT` → `KEYWORD_DEFAULT` → `PAGE_DEFAULT` → `SHOP_DEFAULT` → `NONE`
- **Expected Result:** ทุกแถวได้ `resolutionLevel` ตรงตามลำดับ **โดยไม่ข้ามระดับใด** และไม่กระโดดย้อนขึ้น; การถอยเกิดขึ้นเฉพาะเพราะ "ไม่มีการตั้งค่า" เท่านั้น
- **Linked to:** AC-009-01, AC-009-03, AC-008-02

#### TC-RES-11: 🛑 **BLOCKER** — โฆษณาที่ไม่รู้จักต้องถอยไประดับเพจ ไม่ใช่หยุดตอบ
- **ประเภท:** [Unit] + [Integration] Vitest
- **Precondition:** CONV-1 มี `ConversationAdReferral` ของ **AD-3 (`ad_9999`)** ซึ่งไม่มีกฎใดผูกไว้; R-4 (`KEYWORD_PAGE`) ยังอยู่
- **Steps:** ส่ง `"สนใจครับ"` ผ่าน pipeline จริง
- **Expected Result:** ลูกค้า **ได้รับคำตอบ** ของ R-4 (ไม่ใช่ความเงียบ); `resolutionLevel="KEYWORD_PAGE"`; `AutoReplyLog.adId="ad_9999"` (บันทึกบริบทที่เห็นจริงไว้ด้วย เพื่อให้ร้านรู้ว่าควรไปตั้งค่าโฆษณาตัวนี้เพิ่ม); `decision="REPLIED"`
- **Linked to:** AC-007-04, BR-AR-07

#### TC-RES-12: สินค้าถูกปิดการขาย/ถูกลบ → ถอยระดับ ไม่พัง
- **ประเภท:** [Integration] Vitest
- **Precondition:** กฎ `specificity=1` ผูกกับ PROD-DEL; บริบทเธรดชี้ PROD-DEL
- **Steps:**
  1. resolve ครั้งแรก (สินค้ายังอยู่) → ต้องได้กฎระดับสินค้า
  2. **ลบ** PROD-DEL ออกจาก DB → resolve อีกครั้ง
  3. ทดสอบซ้ำกับ PROD-OFF (ปิดการขาย ไม่ได้ลบ)
- **Expected Result:** ขั้น 2: กฎ **ไม่ถูกลบทิ้ง** แต่ `productId` กลายเป็น null ตาม `onDelete: SetNull` → service ตัดสินว่ากฎนั้นกว้างขึ้น/ใช้ไม่ได้แล้ว → ถอยไป `KEYWORD_DEFAULT` โดยไม่ throw; ขั้น 3: กฎถูกข้าม ถอยระดับ และมี `AutoReplyLog` ที่บันทึกเหตุผลไว้
- **Linked to:** AC-008-03

#### TC-RES-13: เพจถูกถอดการเชื่อมต่อ → เพจอื่นยังตอบปกติ
- **ประเภท:** [Integration] Vitest
- **Precondition:** R-4 ผูกกับ PAGE-1; มีเธรดบน PAGE-2 ที่ใช้กฎอื่นอยู่
- **Steps:** ลบ `ShopChannel` ของ PAGE-1 → ส่งข้อความในเธรดของ PAGE-2
- **Expected Result:** `AutoReplyRule` ของ PAGE-1 ยังมีแถวอยู่ (`shopChannelId` = null ตาม SetNull) ไม่ถูกลบ; เธรด PAGE-2 ได้คำตอบตามปกติ ไม่มี error; กลุ่มคำ `KW-INTEREST` ยังใช้งานได้
- **Linked to:** AC-006-05

#### TC-RES-14: 🛑 **BLOCKER** — ไม่เหลือระดับให้ถอย ต้อง HANDOFF ไม่ใช่เดา
- **ประเภท:** [Integration] Vitest
- **Precondition:** SHOP-A ไม่มี R-PAGE-DEF และ R-SHOP-DEF; ข้อความไม่ match กลุ่มใด
- **Steps:** ส่งข้อความผ่าน pipeline จริง
- **Expected Result:** **ไม่มี** `ChatMessage` ขาออกเกิดขึ้นเลย (นับจาก DB); `AutoReplyLog.decision="HANDOFF"`, `resolutionLevel="NONE"`; `Conversation.handoffAt` ถูกตั้งค่า + `handoffReason` ไม่เป็น null; ไม่มีการเดาคำตอบจากกฎที่ specificity ต่างสาย
- **Linked to:** AC-009-04, BR-AR-08

#### TC-RES-15: คำตอบว่างถือว่าไม่มีคำตอบ → ถอยระดับต่อ
- **ประเภท:** [Unit] Vitest
- **Precondition:** R-EMPTY (`replyText` เป็น `"   "` ช่องว่างล้วน — จำลองข้อมูลเก่าที่หลุดเข้ามาก่อนมี validation) บน PAGE-2 + มี R-0 รองรับ
- **Steps:** resolve ด้วย `KW-PRICE` บนบริบท PAGE-2
- **Expected Result:** R-EMPTY ถูกข้าม; ถอยไประดับถัดไปที่มีคำตอบจริง; ถ้าไม่เหลือเลย → `skipReason="EMPTY_REPLY"` (ไม่ใช่ส่งข้อความว่างถึงลูกค้าเด็ดขาด)
- **Linked to:** AC-005-03, AC-009-03

#### TC-RES-16: การแมป `specificity` → `resolutionLevel` ถูกทุกค่า
- **ประเภท:** [Unit] Vitest (table-driven)
- **Steps:** ป้อนกฎที่มี `specificity` = 7, 6, 5, 4, 3, 2, 1, 0 (ครบทุกค่าที่เกิดได้จาก bitmask) + กรณี `keywordId=null` ที่ `shopChannelId` มี/ไม่มี
- **Expected Result:** ได้ค่าใน `AutoReplyLog.resolutionLevel` ตรงตาม [[DATABASE]] §3.8 ทุกค่า — `7→KEYWORD_PAGE_AD_PRODUCT`, `6→KEYWORD_PAGE_AD`, `5→KEYWORD_PAGE_PRODUCT`, `4→KEYWORD_PAGE`, `1→KEYWORD_PRODUCT`, `0→KEYWORD_DEFAULT`, `keywordId=null`+เพจ`→PAGE_DEFAULT`, `keywordId=null`ไม่มีเพจ`→SHOP_DEFAULT`, ไม่มีกฎ`→NONE`. ⓐ ค่า `3` และ `2` (โฆษณาไม่ระบุเพจ) ไม่มีชื่อระดับใน §3.8 — **ต้องยืนยันใน SDS ว่าจะแมปเป็นค่าใด** (ข้อเสนอ: ใช้ชื่อระดับที่ใกล้ที่สุดคือ `KEYWORD_PRODUCT`/`KEYWORD_DEFAULT` แล้วเก็บ specificity จริงใน `matchTrace`) — **ห้ามเขียนค่าที่ไม่อยู่ในลิสต์ FROZEN**
- **Linked to:** AC-009-02

#### TC-RES-17: กฎที่ปิดอยู่หรืออยู่นอกช่วงเวลาต้องถูกข้าม
- **ประเภท:** [Unit] Vitest
- **Precondition:** R-INACTIVE (`isActive=false`) และ R-SCHEDULED (`activeFrom`/`activeUntil` นอกช่วง) — ทั้งคู่ specificity สูงกว่ากฎที่ควรชนะ
- **Steps:** resolve ในบริบทที่กฎทั้งสองจะถูกเลือกถ้าไม่มีการกรอง
- **Expected Result:** ทั้งคู่ไม่ถูกเลือก; ถอยไปกฎถัดไปที่ใช้งานได้; การกรอง `isActive` ต้องเกิดที่ระดับ query (index `[shopId, keywordId, isActive, specificity]`) ไม่ใช่ใน JS
- **Linked to:** AC-009-03

#### TC-RES-18: เงื่อนไขผสม โฆษณา + สินค้า พร้อมกัน
- **ประเภท:** [Unit] Vitest
- **Precondition:** R-MIXED (`adId="ad_1002"` + `productId=PROD-2`, ไม่ระบุเพจ, `specificity=3`)
- **Steps:** resolve ด้วยบริบท PAGE-3 (ไม่มีกฎระดับเพจ) + `ad_1002` + PROD-2
- **Expected Result:** ได้ R-MIXED; `replyText` ตรงของ R-MIXED; ทั้ง `adId` และ `productId` ต้องตรงพร้อมกันจึงจะเลือก — ถ้าบริบทมีแค่ `ad_1002` แต่สินค้าไม่ใช่ PROD-2 ต้อง **ไม่** เลือกกฎนี้
- **Linked to:** AC-008-04

#### TC-RES-19: คำตอบเฉพาะเพจชนะคำตอบกลาง และเพจที่ไม่ตั้งต้องถอยไปกลาง
- **ประเภท:** [Unit] Vitest
- **Precondition:** R-4 (PAGE-1) และ R-0 (กลาง) อยู่ครบ
- **Steps:**
  1. resolve บริบท PAGE-1
  2. resolve บริบท PAGE-3 (ไม่มีกฎเฉพาะเพจ)
- **Expected Result:** ขั้น 1 ได้ R-4 (`KEYWORD_PAGE`) **ไม่ใช่** R-0; ขั้น 2 ได้ R-0 (`KEYWORD_DEFAULT`) โดยอัตโนมัติไม่ต้องตั้งค่าเพิ่ม
- **Linked to:** AC-006-03, AC-006-04

#### TC-RES-20: คำตอบกลางระดับเพจและระดับร้านตั้งค่าได้ (`keywordId=null`)
- **ประเภท:** [E2E] + [Integration]
- **Precondition:** OWNER ของ SHOP-A login
- **Steps:** ตั้งคำตอบกลางของเพจ PAGE-1 และคำตอบกลางของร้าน ผ่านหน้าตั้งค่า → บันทึก → ตรวจ DB
- **Expected Result:** เกิดแถว `AutoReplyRule` ที่ `keywordId=null` — แถวของเพจมี `shopChannelId=PAGE-1` และ `specificity=4`, แถวของร้านมี `shopChannelId=null` และ `specificity=0`; ทั้งคู่ถูกใช้จริงใน TC-RES-07/08
- **Linked to:** AC-009-05

---

### 3.5 กลุ่ม E — [E2E] การตั้งค่า (กลุ่มคำ / คำตรวจจับ / กฎคำตอบ)

**ไฟล์:** `e2e/auto-reply-settings.spec.ts` ⓐ · ทุกเคส login เป็น **USER-OWNER-A** เว้นแต่ระบุเป็นอย่างอื่น · ทุกเคสที่บันทึกสำเร็จต้องยืนยันด้วย Prisma query

#### TC-CFG-01: สร้างกลุ่มคำใหม่
- **ประเภท:** [E2E] Playwright
- **Steps:** เข้าหน้าตั้งค่าตอบอัตโนมัติ → "เพิ่มกลุ่มคำ" → ใส่ชื่อ `"ถามส่วนลด"` (1 ตัวอักษรก็ต้องผ่าน — ทดสอบ `"ก"` ด้วย) → บันทึก
- **Expected Result:** เกิดแถว `AutoReplyKeyword` ใหม่ที่ `shopId=SHOP-A`; ชื่อว่างหรือช่องว่างล้วนต้องถูกปฏิเสธพร้อมข้อความบอกวิธีแก้
- **Linked to:** AC-001-01

#### TC-CFG-02: แก้ไขและลบกลุ่มคำ
- **ประเภท:** [E2E] Playwright
- **Steps:** แก้ชื่อ/`matchType`/`priority` ของกลุ่มที่มีอยู่ → บันทึก → จากนั้นลบกลุ่มนั้น (ยืนยันผ่าน Sweet Alerts)
- **Expected Result:** ค่าใน DB เปลี่ยนตามที่แก้; หลังลบ แถว `AutoReplyKeyword` หายไป **พร้อมกับ** `AutoReplyPhrase` และ `AutoReplyRule` ของกลุ่มนั้น (cascade); แต่ `AutoReplyLog` เดิม **ยังอยู่** โดย `keywordId` กลายเป็น null (SetNull) — ประวัติต้องไม่หาย
- **Linked to:** AC-001-02

#### TC-CFG-03: ชื่อกลุ่มซ้ำภายในร้านต้องถูกปฏิเสธ / ซ้ำข้ามร้านต้องได้
- **ประเภท:** [E2E] + [Integration]
- **Steps:** 1) สร้างกลุ่มชื่อ `"สนใจสินค้า"` ซ้ำใน SHOP-A 2) login SHOP-B สร้างชื่อเดียวกัน
- **Expected Result:** ขั้น 1 ถูกปฏิเสธ (409 ⓐ) พร้อมข้อความอธิบายว่าชื่อซ้ำและควรทำอย่างไร ไม่ใช่ error ดิบของ Prisma (P2002); ขั้น 2 **สำเร็จ** — พิสูจน์ว่า `@@unique([shopId, name])` เป็น per-shop
- **Linked to:** AC-001-04

#### TC-CFG-04: เปิด/ปิดการใช้งานรายกลุ่ม
- **ประเภท:** [E2E] Playwright
- **Steps:** สลับสวิตช์ `isActive` ของกลุ่ม → บันทึก
- **Expected Result:** ค่าใน DB เปลี่ยน; ผลการตรวจจับเปลี่ยนทันที (ยืนยันร่วมกับ TC-MATCH-05)
- **Linked to:** AC-001-03

#### TC-CFG-05: หน้ารายการแสดงข้อมูลครบ 7 อย่าง
- **ประเภท:** [E2E] Playwright
- **Steps:** เปิดหน้ารายการกลุ่มคำ → `take_snapshot`
- **Expected Result:** แต่ละแถวแสดง: ชื่อกลุ่ม, จำนวนคำตรวจจับ, รูปแบบการตรวจจับ (ภาษาไทยที่คนทั่วไปเข้าใจ ไม่ใช่ `CONTAINS` ดิบ), ลำดับความสำคัญ, จำนวนคำตอบเฉพาะเพจ/โฆษณา/สินค้า, สถานะเปิดปิด, วันที่แก้ไขล่าสุด (รูปแบบ พ.ศ. ตาม `formatDateTime`)
- **Linked to:** AC-001-06

#### TC-CFG-06: ค้นหา กรองตามสถานะ และเรียงลำดับ
- **ประเภท:** [E2E] Playwright
- **Steps:** พิมพ์คำค้น → กรอง "เปิดใช้งาน"/"ปิด" → เรียงตามลำดับความสำคัญและวันที่แก้ไข
- **Expected Result:** ผลลัพธ์ตรงทุกกรณี และไม่มีกลุ่มของร้านอื่นโผล่ในผลค้นหาแม้ค้นด้วยชื่อที่ SHOP-B ใช้
- **Linked to:** AC-001-07

#### TC-CFG-07: ทำสำเนากลุ่มคำ → สำเนาต้องปิดไว้ก่อน
- **ประเภท:** [E2E] Playwright
- **Steps:** กด "ทำสำเนา" บนกลุ่มที่ `isActive=true` และมีกฎ 3 ระดับ
- **Expected Result:** เกิดกลุ่มใหม่ (ชื่อไม่ชนของเดิม) ที่ `isActive=false` **เสมอ**; คำตรวจจับและกฎถูกคัดลอกมาครบ; `specificity` ของกฎที่คัดลอกถูกคำนวณใหม่ ไม่ได้คัดลอกค่าดิบมา
- **Linked to:** AC-001-08

#### TC-CFG-08: เพิ่ม/ลบคำตรวจจับหลายคำต่อกลุ่ม
- **ประเภท:** [E2E] Playwright
- **Steps:** เพิ่ม 5 คำ → ลบทีละคำ 2 คำ
- **Expected Result:** จำนวนแถว `AutoReplyPhrase` ตรง; ทุกแถวมี `normalizedPhrase` ที่คำนวณแล้วไม่เป็นค่าว่าง
- **Linked to:** AC-002-01

#### TC-CFG-09: กลุ่มที่เปิดใช้งานต้องมีคำตรวจจับอย่างน้อย 1 คำ
- **ประเภท:** [E2E] + [Integration]
- **Steps:** สร้างกลุ่มโดยไม่ใส่คำเลยแล้วเปิดใช้งาน → บันทึก; และยิง API ตรงเพื่อ bypass UI
- **Expected Result:** ถูกปฏิเสธทั้ง 2 ทาง (UI แสดง error, API คืน 400 ⓐ); ไม่มีแถวถูกสร้าง/อัปเดต
- **Linked to:** AC-002-02, BR-AR-28

#### TC-CFG-10: คำตรวจจับซ้ำในกลุ่มเดียวกัน (รวมที่ต่างกันแค่รูปแบบ)
- **ประเภท:** [Integration] Vitest
- **Steps:** เพิ่ม `"สนใจ"` แล้วเพิ่ม `"  สนใจ  "` และ `"สนใจ"` รูป NFD ในกลุ่มเดียวกัน
- **Expected Result:** ทั้ง 2 ตัวหลังถูกปฏิเสธหรือถูกรวมเป็นคำเดียว — บังคับด้วย `@@unique([keywordId, normalizedPhrase])`; ข้อความ error บอกว่าซ้ำกับคำใด ไม่ใช่ P2002 ดิบ
- **Linked to:** AC-002-03

#### TC-CFG-11: เตือน (ไม่บล็อก) เมื่อคำซ้ำกับกลุ่มอื่นที่เปิดอยู่
- **ประเภท:** [E2E] Playwright
- **Precondition:** `KW-INTEREST` มีคำ `"สนใจ"` อยู่แล้ว
- **Steps:** เพิ่มคำ `"สนใจ"` ในกลุ่มใหม่ที่ `isActive=true`
- **Expected Result:** บันทึก **สำเร็จ** (ไม่บล็อก) แต่แสดงคำเตือนที่ระบุ **ชื่อกลุ่มที่ซ้ำ** ชัดเจน; ถ้าซ้ำกับกลุ่มที่ปิดอยู่ (`KW-OFF`) ต้อง **ไม่** เตือน
- **Linked to:** AC-002-04

#### TC-CFG-12: ค่าเริ่มต้นของกลุ่มใหม่
- **ประเภท:** [E2E] + [Integration]
- **Steps:** สร้างกลุ่มใหม่โดยไม่แตะช่องรูปแบบ/ลำดับความสำคัญ
- **Expected Result:** DB ได้ `matchType="CONTAINS"` และ `priority=100` ตาม default ของ [[DATABASE]] §3.2; UI แสดงค่านี้เป็นค่าตั้งต้นที่เลือกไว้แล้ว
- **Linked to:** AC-003-03

#### TC-CFG-13: หน้าตั้งค่าอธิบายความต่างของ 3 รูปแบบพร้อมตัวอย่าง
- **ประเภท:** [Manual] + [E2E] snapshot
- **Steps:** เปิดส่วนเลือกรูปแบบการตรวจจับ
- **Expected Result:** มีคำอธิบายภาษาไทยพร้อมตัวอย่างจริงของทั้ง 3 แบบ (เช่น ตรงทั้งข้อความ: ลูกค้าพิมพ์ `"เก็บปลายทาง"` เท่านั้นถึงจะเข้า / มีคำในประโยค: `"มีเก็บปลายทางไหมคะ"` ก็เข้า) — ผู้ใช้ที่ไม่มีความรู้เทคนิคอ่านแล้วเลือกได้ถูก; **ห้ามมี emoji** (Hard Rule 12)
- **Linked to:** AC-003-04

#### TC-CFG-14: คำตอบกลางของกลุ่ม 1 ชุด
- **ประเภท:** [E2E] Playwright
- **Steps:** ตั้งคำตอบกลางให้กลุ่ม → บันทึก → ตั้งซ้ำอีกครั้งด้วยข้อความใหม่
- **Expected Result:** มีแถว `AutoReplyRule` ที่ `keywordId=<กลุ่ม>` และเงื่อนไขทั้ง 3 มิติเป็น null (`specificity=0`) **เพียงแถวเดียว** — ครั้งที่สองเป็นการ update ไม่ใช่สร้างซ้อน (บังคับด้วย unique `NULLS NOT DISTINCT`)
- **Linked to:** AC-005-01

#### TC-CFG-15: เปิดใช้งานกลุ่มที่ไม่มีคำตอบระดับใดเลยต้องถูกปฏิเสธ
- **ประเภท:** [E2E] + [Integration]
- **Steps:** สร้างกลุ่มที่มีคำตรวจจับแต่ไม่มี `AutoReplyRule` ใดเลย → เปิดใช้งาน → บันทึก
- **Expected Result:** ถูกปฏิเสธพร้อมเหตุผลที่บอกวิธีแก้ ("เพิ่มคำตอบกลางอย่างน้อย 1 ชุดก่อนเปิดใช้งาน"); ทดสอบซ้ำโดยมีเฉพาะคำตอบระดับเพจ → **ต้องผ่าน** (AC-005-02 ยอมรับคำตอบระดับใดก็ได้อย่างน้อย 1)
- **Linked to:** AC-005-02, BR-AR-28

#### TC-CFG-16: คำตอบที่เป็นช่องว่างล้วนต้องถูกปฏิเสธตอนบันทึก
- **ประเภท:** [Integration] Vitest
- **Steps:** ยิง API บันทึกกฎด้วย `replyText` = `""`, `"   "`, `"\n\n"`, `"​"` (zero-width space)
- **Expected Result:** ถูกปฏิเสธทุกตัว (400 ⓐ); ไม่มีแถวเกิดขึ้น — validate ด้วย Valibot ที่ backend ไม่ใช่แค่ Yup ที่ frontend
- **Linked to:** AC-005-03, BR-AR-29

#### TC-CFG-17: จำกัดความยาวคำตอบและแสดงตัวนับอักษร
- **ประเภท:** [E2E] Playwright
- **Steps:** พิมพ์คำตอบยาวขึ้นเรื่อย ๆ จนเกินขีดจำกัด แล้วกดบันทึก
- **Expected Result:** ตัวนับอักษรอัปเดตขณะพิมพ์; เกินขีดจำกัดแล้วบันทึกไม่ได้พร้อมข้อความบอกจำนวนที่เกิน; backend ปฏิเสธด้วยเช่นกันเมื่อยิงตรง ⓐ **ค่าขีดจำกัดยังไม่ถูกกำหนดใน BRD/DATABASE — ต้องกำหนดใน SRS** (ข้อเสนอ: 2,000 ตัวอักษร ให้ต่ำกว่าเพดานข้อความของ Meta)
- **Linked to:** AC-005-04

#### TC-CFG-18: เลือกเพจได้เฉพาะเพจที่ร้านเชื่อมต่อจริง
- **ประเภท:** [E2E] + [Integration]
- **Steps:** เปิด dropdown เลือกเพจในฟอร์มคำตอบเฉพาะเพจ; จากนั้นยิง API ตรงด้วย `shopChannelId` ของ **PAGE-B1 (ของ SHOP-B)**
- **Expected Result:** dropdown แสดงเฉพาะ ShopChannel ของ SHOP-A ที่ยัง active; การยิงตรงด้วยเพจของร้านอื่นได้ **403/404** ⓐ และไม่มีแถวเกิดขึ้น
- **Linked to:** AC-006-01

#### TC-CFG-19: 🛑 **BLOCKER** — 1 กลุ่มคำ มีคำตอบเฉพาะเพจได้ไม่เกิน 1 รายการต่อเพจ
- **ประเภท:** [Integration] Vitest
- **Steps:** สร้างกฎ (`keywordId=KW-INTEREST`, `shopChannelId=PAGE-1`, `adId=null`, `productId=null`) **2 ครั้ง**
- **Expected Result:** ครั้งที่สองถูกปฏิเสธที่ระดับ DB — พิสูจน์ว่า unique index ถูกสร้างด้วย `NULLS NOT DISTINCT` จริง (ถ้าใช้ `@@unique` ธรรมดา Postgres จะยอมให้ซ้ำเพราะ NULL ต่างกันเสมอ — [[DATABASE]] §3.4). **เคสนี้คือเคสที่พิสูจน์ว่า migration เขียนมือถูกต้อง** ต้องรันหลัง `migrate deploy` ทุกครั้ง
- **Linked to:** AC-006-02

#### TC-CFG-20: เพิ่มคำตอบเฉพาะโฆษณาพร้อมชื่อกำกับ
- **ประเภท:** [E2E] Playwright
- **Steps:** เพิ่มกฎระดับโฆษณา ระบุ `adId="ad_1002"` และตั้งชื่อกำกับ `"แอดโช๊ค 590 มิ.ย."`
- **Expected Result:** DB มี `adId="ad_1002"` และ `adLabel="แอดโช๊ค 590 มิ.ย."`; หน้ารายการแสดงชื่อกำกับเป็นหลัก (รหัสโฆษณาแสดงเป็นข้อมูลรอง) เพราะ Meta ไม่ให้ชื่อแคมเปญ
- **Linked to:** AC-007-01

#### TC-CFG-21: โฆษณาเดียวกันบนคนละเพจตั้งคำตอบต่างกันได้
- **ประเภท:** [Integration] Vitest
- **Steps:** สร้างกฎ (`KW-INTEREST`, PAGE-1, `ad_1001`) และ (`KW-INTEREST`, PAGE-2, `ad_1001`) ด้วย `replyText` ต่างกัน → resolve ทั้ง 2 บริบท
- **Expected Result:** สร้างได้ทั้งคู่ (unique key รวม `shopChannelId` จึงไม่ชน); resolve บริบท PAGE-1 ได้ข้อความของ PAGE-1 และ PAGE-2 ได้ของ PAGE-2
- **Linked to:** AC-007-02

#### TC-CFG-22: หน้าตั้งค่าแสดงรายการโฆษณาที่เคยมีลูกค้าทักเข้ามาจริง
- **ประเภท:** [E2E] Playwright
- **Precondition:** มี `ConversationAdReferral` ของ AD-1/AD-2/AD-3 ในเธรดของ SHOP-A และของ SHOP-B อีกชุด
- **Steps:** เปิดตัวเลือกโฆษณาในฟอร์มกฎ
- **Expected Result:** แสดงรายการ `adId` + `adTitle` (จาก `ConversationAdReferral` ของเดิม feature 00018) ของ **SHOP-A เท่านั้น** พร้อมจำนวนเธรด/เวลาล่าสุด เพื่อให้ร้านเลือกได้โดยไม่ต้องคัดลอกรหัสมาเอง; **ไม่มีโฆษณาของ SHOP-B โผล่**
- **Linked to:** AC-007-05

#### TC-CFG-23: ผูกสินค้าเข้ากับโฆษณาเพื่อใช้เป็นบริบทสินค้าของเธรด
- **ประเภท:** [Integration] Vitest
- **Steps:** ผูก PROD-1 เข้ากับ `ad_1001` → ลูกค้าใหม่ทักเข้ามาจาก `ad_1001`
- **Expected Result:** `Conversation.contextProductId=PROD-1`, `contextProductSource="ADS_MAPPING"`, `contextProductAt` ถูกตั้งค่า; การ resolve ครั้งถัดไปใช้สินค้านี้เป็นบริบทได้
- **Linked to:** AC-007-06, AC-014-01

#### TC-CFG-24: เลือกสินค้าได้เฉพาะสินค้าของร้านตัวเอง
- **ประเภท:** [E2E] + [Integration]
- **Steps:** เปิด dropdown สินค้า; แล้วยิง API ตรงด้วย `productId=PROD-B1` (ของ SHOP-B)
- **Expected Result:** dropdown มีเฉพาะสินค้าของ SHOP-A; ยิงตรงข้ามร้านได้ 403/404 ⓐ ไม่มีแถวเกิดขึ้น
- **Linked to:** AC-008-01

#### TC-CFG-25: ทุกการเปลี่ยนแปลงบันทึกว่าใครแก้และเมื่อไหร่
- **ประเภท:** [Integration] Vitest
- **Steps:** ให้ USER-ADMIN-A แก้ `AutoReplyConfig`, `AutoReplyKeyword`, `AutoReplyRule` อย่างละ 1 ครั้ง
- **Expected Result:** ทั้ง 3 ตารางมี `updatedByUserId` = USER-ADMIN-A และ `updatedAt` ขยับ; ตอนสร้างครั้งแรก `createdByUserId` ถูกตั้งค่าด้วย (สำหรับตารางที่มีคอลัมน์นี้)
- **Linked to:** AC-004-05

#### TC-CFG-26: สลับร้านแล้วเห็นการตั้งค่าของร้านนั้น
- **ประเภท:** [E2E] Playwright
- **Precondition:** user ที่เป็นสมาชิกทั้ง SHOP-A และ SHOP-B ⓐ (ถ้าโครงสร้างสิทธิ์รองรับ)
- **Steps:** เปิดหน้าตั้งค่าใน SHOP-A → สลับร้านเป็น SHOP-B → ดูหน้าเดิม
- **Expected Result:** ข้อมูลเปลี่ยนเป็นของ SHOP-B ทั้งหมด (กลุ่มคำ กฎ สวิตช์ โหมดทดสอบ); ไม่มีค่าค้างจากร้านก่อนหน้าแม้แต่ช่องเดียว (ระวัง client-side cache)
- **Linked to:** AC-004-04

#### TC-CFG-27: ตั้งคำที่ถือเป็นสัญญาณส่งต่อเองได้
- **ประเภท:** [E2E] + [Integration]
- **Steps:** ตั้ง `handoffPhrases` = `["คุยกับแอดมิน","คืนเงิน","ของยังไม่ได้"]` → บันทึก → ส่งข้อความ `"สั่งไปเมื่อวานของยังไม่ได้ ขอเงินคืนได้ไหม"`
- **Expected Result:** DB เก็บเป็น `String[]`; ข้อความนั้นทำให้ `decision="HANDOFF"` โดยไม่ตอบ แม้จะ match กลุ่มคำอื่นอยู่ด้วยก็ตาม (สัญญาณส่งต่อชนะการตอบ)
- **Linked to:** AC-019-02, AC-019-01

#### TC-CFG-28: ตั้งระยะเวลาหยุดเมื่อพนักงานตอบได้ 4 แบบ
- **ประเภท:** [E2E] Playwright
- **Steps:** เลือกทีละค่า `30M` / `2H` / `MANUAL` / `UNTIL_RESOLVED` → บันทึก
- **Expected Result:** `AutoReplyConfig.humanTakeoverPauseMode` เก็บค่าตรงตาม FROZEN §3.8 ทุกค่า; UI แสดงเป็นภาษาไทยที่เข้าใจได้ ไม่ใช่ค่าดิบ; ค่านอกลิสต์ที่ยิงตรงต้องถูกปฏิเสธ (Valibot)
- **Linked to:** AC-016-02

#### TC-CFG-29: ตั้งระยะพักและจำนวนสูงสุด + ค่าเริ่มต้นปลอดภัย
- **ประเภท:** [E2E] + [Integration]
- **Steps:** 1) ตรวจค่าเริ่มต้นของร้านที่เพิ่งสร้าง `AutoReplyConfig` 2) แก้เป็นค่าอื่น 3) ยิงค่าติดลบ/0/มหาศาล
- **Expected Result:** ค่าเริ่มต้น `keywordCooldownSec=300`, `maxRepliesPerConversation=10` ตาม [[DATABASE]] §3.1; แก้ได้จริง; ค่าติดลบถูกปฏิเสธ; ค่าที่ตั้งมีผลกับการตอบทันที (ยืนยันร่วมกับ TC-LIM-01/03)
- **Linked to:** AC-018-03

#### TC-CFG-30: ตั้งอายุบริบทโฆษณาได้ 3 แบบ
- **ประเภท:** [E2E] Playwright
- **Steps:** เลือก `UNTIL_RESOLVED` / `HOURS` (พร้อมกรอกจำนวนชั่วโมง) / `UNTIL_NEW_PRODUCT` → บันทึก
- **Expected Result:** `adsContextMode` เก็บค่าตรงตาม FROZEN; เลือก `HOURS` แล้วไม่กรอก `adsContextHours` ต้องบันทึกไม่ได้; เลือกโหมดอื่นแล้วช่องชั่วโมงต้องถูกซ่อน/ไม่มีผล
- **Linked to:** AC-013-03

---

### 3.6 กลุ่ม F — [Integration] เส้นทางประมวลผลทั้งเส้น (webhook → job → resolve → send → log)

**ไฟล์:** `src/services/__tests__/auto-reply-pipeline.test.ts` ⓐ · mock เฉพาะชั้นส่งออก Meta (`sendOutboundMessage` ⓐ) · Prisma ใช้ของจริง

#### TC-INT-01: 🛑 **BLOCKER** — เส้นทางหลักครบทุกขั้น
- **ประเภท:** [Integration] Vitest
- **Precondition:** SHOP-A `isEnabled=true`, CONV-1 มี ad referral ของ AD-2, กฎ R-6 พร้อม
- **Steps:** ยิง payload webhook ของ Meta ที่มีข้อความ `"สนใจครับ"` เข้า endpoint จริง ⓐ → รอ job ประมวลผลเสร็จ
- **Expected Result:** ตรวจครบทุกขั้นตามลำดับ —
  1. `ChatMessage` ขาเข้าถูกบันทึก (`senderRole="BUYER"`, `autoReplyKind=null`)
  2. `AutoReplyJob` 1 แถวเกิดขึ้น (`chatMessageId` = ข้อความนั้น, `status` ไล่จาก `PENDING`→`PROCESSING`→`DONE`)
  3. sender ถูกเรียก 1 ครั้งด้วยข้อความของ R-6
  4. `ChatMessage` ขาออก 1 แถว `senderRole="SHOP"`, `autoReplyKind="AUTO"`
  5. `AutoReplyLog` 1 แถว: `decision="REPLIED"`, `resolutionLevel="KEYWORD_PAGE_AD"`, `ruleId=R-6`, `keywordId=KW-INTEREST`, `outboundMessageId` ชี้ข้อความขาออก, `durationMs` ไม่เป็น null
  6. `Conversation.autoReplyCount` เพิ่มเป็น 1 และ `lastAutoReplyAt` ถูกตั้งค่า
- **Linked to:** AC-022-01, AC-024-01, AC-012-01

#### TC-INT-02: ยืนยันรับข้อมูลกับ Facebook ทันทีโดยไม่รอการประมวลผล
- **ประเภท:** [Integration] Vitest
- **Steps:**
  1. ทำให้ resolver ช้าจงใจ (mock หน่วง 3 วินาที) → ยิง webhook 1 ข้อความ วัดเวลาจนได้ HTTP 200
  2. ยิง webhook ที่มี 20 ข้อความใน batch เดียว วัดเวลาตอบรับ
- **Expected Result:** ขั้น 1 ได้ 200 กลับมาโดย **ไม่รอ 3 วินาที** (การตอบรับเกิดหลังบันทึกข้อความ ไม่ใช่หลังส่งคำตอบ); ขั้น 2 เวลาตอบรับต้องไม่โตตามจำนวนข้อความอย่างมีนัยสำคัญ — งานถูกโยนไปที่ `after()` + `AutoReplyJob` แทน
- **Linked to:** AC-022-01, AC-022-02

#### TC-INT-03: 🛑 **BLOCKER** — auto-reply พังทั้งดุ้น แต่การรับข้อความยังปกติ
- **ประเภท:** [Integration] Vitest
- **Steps:** ทำให้ทุกฟังก์ชันของ auto-reply โยน exception (mock ให้ throw ตั้งแต่การสร้าง job) → ยิง webhook ข้อความปกติ
- **Expected Result:** webhook ยังคืน 200; `ChatMessage` ขาเข้าถูกบันทึกครบ; เธรดในหน้า inbox แสดงข้อความนั้นตามปกติ; ไม่มี 500 ที่ผู้ใช้เห็น — พิสูจน์ว่า auto-reply เป็นส่วนต่อขยาย ไม่ใช่ทางผ่านของการรับข้อความ (BRD §6.3)
- **Linked to:** AC-022-03

#### TC-INT-04: เวลาตอบกลับในสภาวะปกติ
- **ประเภท:** [Integration] Vitest
- **Steps:** วัดเวลาตั้งแต่ `ChatMessage` ขาเข้าถูกบันทึก จนถึงเวลาที่ sender ถูกเรียก 20 รอบ
- **Expected Result:** ⓐ BRD ระบุแค่ "ภายในไม่กี่วินาที" ไม่มีตัวเลข — **ต้องกำหนดเกณฑ์ใน SRS** (ข้อเสนอ: p95 ≤ 5 วินาที, p99 ≤ 10 วินาที บน dev ที่ไม่มีโหลด) แล้ว assert ตามนั้น; `AutoReplyLog.durationMs` ต้องถูกบันทึกทุกแถวเพื่อวัดย้อนหลังได้
- **Linked to:** AC-022-04

#### TC-INT-05: ข้อความระบบแสดงในเธรดพร้อมเครื่องหมายแยก และเรียงเวลาถูกต้อง
- **ประเภท:** [E2E] + [Manual]
- **Steps:** หลัง TC-INT-01 เปิดหน้าเธรดในกล่องข้อความฝั่งร้าน
- **Expected Result:** ข้อความของระบบอยู่ในตำแหน่งเวลาที่ถูกต้อง (หลังข้อความลูกค้า) เหมือนข้อความปกติทุกประการ; มีเครื่องหมาย/ป้ายที่บอกว่ามาจากระบบ แยกจากข้อความที่คนพิมพ์ได้ชัดในสายตา — ป้ายต้องเป็น **icon จริง + ข้อความ ห้าม emoji** (Hard Rule 12) และเป็น Paces primitive (Hard Rule 7)
- **Linked to:** AC-012-01, AC-012-02

#### TC-INT-06: 🛑 **BLOCKER** — ข้อความที่ส่งตรงกับที่ตั้งไว้ทุกตัวอักษร
- **ประเภท:** [Integration] Vitest
- **Steps:** ตั้ง `replyText` ที่มีอักขระท้าทาย: บรรทัดใหม่, emoji ที่ร้านพิมพ์เอง, ช่องว่างซ้ำตั้งใจ, เครื่องหมายคำพูด, ตัวเลขราคา, ลิงก์ → ให้ระบบตอบ
- **Expected Result:** ข้อความที่ส่งเข้า sender **เท่ากับ `replyText` แบบ `===`** ไม่มี trim ไม่มี normalize ไม่มีการเติมคำนำหน้า/ต่อท้าย ไม่มีการแทนที่ตัวแปรใด ๆ; `AutoReplyLog.replyText` ก็เท่ากันเป๊ะ (หมายเหตุ: ข้อห้าม emoji ของโปรเจกต์ใช้กับ **UI ของเรา** ไม่ใช่เนื้อหาที่ร้านพิมพ์เอง — ระบบต้องส่งตามที่ร้านพิมพ์)
- **Linked to:** AC-012-03

#### TC-INT-07: งานถูกบันทึกก่อนเริ่มประมวลผลเสมอ
- **ประเภท:** [Integration] Vitest
- **Steps:** ทำให้ resolver ค้างที่จุดเริ่ม (mock รอ signal) → ยิง webhook → query `AutoReplyJob` ระหว่างที่ค้างอยู่
- **Expected Result:** มีแถว `AutoReplyJob` อยู่แล้ว (`status="PENDING"` หรือ `"PROCESSING"`) ก่อนที่การเลือกคำตอบจะเริ่ม — ถ้า process ตายตรงนี้ งานยังอยู่ให้ sweeper เก็บ
- **Linked to:** AC-023-01

#### TC-INT-08: sweeper หยิบงานค้างมาทำใหม่
- **ประเภท:** [Integration] Vitest
- **Steps:** สร้าง `AutoReplyJob` ที่ `status="PROCESSING"`, `lockedAt` = เวลาย้อนหลังเกิน threshold ⓐ (ข้อเสนอ: 5 นาที) และอีกแถวที่ `status="PENDING"` ค้างมานาน → เรียก sweeper (cron endpoint) ⓐ
- **Expected Result:** ทั้ง 2 แถวถูกหยิบมาทำและจบที่ `DONE`/`SKIPPED`; งานที่ `lockedAt` ยังใหม่ (เพิ่ง lock) **ต้องไม่ถูกแย่ง**; sweeper ต้องมีการป้องกันการเรียกจากภายนอก (`CRON_SECRET`) ⓐ
- **Linked to:** AC-023-02

#### TC-INT-09: จำนวนงานค้างและงานล้มเหลวตรวจสอบได้
- **ประเภท:** [Integration] + [E2E]
- **Steps:** สร้างงาน `PENDING` 3 แถวและ `FAILED` 2 แถว → เปิดหน้า/endpoint สรุปสถานะ ⓐ
- **Expected Result:** ตัวเลขตรงกับ DB และกรองตามร้านได้; ผู้ที่ไม่ใช่สมาชิกร้านเรียกดูไม่ได้
- **Linked to:** AC-023-05

#### TC-INT-10: หน้าต่างตอบกลับ 24 ชั่วโมงของ Meta
- **ประเภท:** [Integration] Vitest
- **Precondition:** CONV-OLD ที่ `lastInboundAt` เก่ากว่า 24 ชม. แต่มีข้อความขาเข้าเก่าค้างเป็นงาน
- **Steps:** ประมวลผลงานของเธรดนี้
- **Expected Result:** ไม่มีการเรียก Meta; `decision="SKIPPED"`, `skipReason="WINDOW_CLOSED"` — เป็นชั้นป้องกันสุดท้ายตาม BRD §7.2
- **Linked to:** AC-012-05 (ป้องกันการยิงซ้ำที่จะล้มเหลวแน่นอน), BRD §7.2

---

### 3.7 กลุ่ม G — [Integration] การกันตอบซ้ำ (FR-017) — กลุ่มที่สำคัญที่สุดของฟีเจอร์

**ไฟล์:** `src/services/__tests__/auto-reply-idempotency.test.ts` ⓐ · **ทุกเคสในกลุ่มนี้เป็น BLOCKER ทั้งหมด**

#### TC-DUP-01: 🛑 **BLOCKER** — Meta ส่ง webhook เดิมซ้ำ ลูกค้าต้องได้คำตอบครั้งเดียว
- **ประเภท:** [Integration] Vitest
- **Precondition:** SHOP-A เปิดใช้งาน, CONV-1, ข้อความที่ match `KW-INTEREST`
- **Steps:**
  1. ยิง webhook payload ที่มี `mid` = `"m_test_001"` → รอประมวลผลจบ
  2. ยิง **payload เดิมทุกไบต์** อีก 2 ครั้ง (จำลอง Meta redeliver เพราะ timeout)
- **Expected Result:**
  - `ChatMessage` ขาเข้าที่ `externalMessageId="m_test_001"` มี **1 แถว** (unique เดิมของ 00018 ทำงาน)
  - `AutoReplyJob` ที่ `chatMessageId` ของข้อความนั้นมี **1 แถว** — การสร้างครั้งที่ 2/3 ชน `@unique` แล้วจบอย่างสงบ (ไม่ throw ออกไปถึง webhook)
  - sender ถูกเรียก **1 ครั้ง** และ `ChatMessage` ที่ `autoReplyKind='AUTO'` ในเธรดมี **1 แถว**
  - รอบที่ 2/3 มี `AutoReplyLog` ที่ `decision="SKIPPED"`, `skipReason="DUPLICATE_JOB"` (หรือไม่เขียน log ซ้ำเลย — เลือกอย่างใดอย่างหนึ่งแล้วระบุใน SDS ⓐ แต่ **ห้ามส่งข้อความ**)
- **Linked to:** AC-017-02, BR-AR-21

#### TC-DUP-02: 🛑 **BLOCKER** — ประมวลผลข้อความเดิมซ้ำหลายรอบ
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียกฟังก์ชันประมวลผลงาน (`processAutoReplyJob` ⓐ) ด้วย `chatMessageId` เดิม **5 ครั้งเรียงกัน** โดยไม่รีเซ็ตสถานะ
- **Expected Result:** ข้อความขาออกเกิดขึ้น **1 แถวเท่านั้น**; รอบที่ 2-5 ต้องเห็นว่า job อยู่ในสถานะ `DONE` แล้วจึงจบทันทีโดยไม่เรียก resolver และไม่เรียก sender
- **Linked to:** AC-017-01, BR-AR-21

#### TC-DUP-03: 🛑 **BLOCKER** — ส่งสำเร็จแต่บันทึกผลไม่สำเร็จ
- **ประเภท:** [Integration] Vitest
- **Steps:**
  1. mock ให้ sender **สำเร็จ** แต่ทำให้การอัปเดต `AutoReplyJob.status="DONE"` โยน exception (จำลอง DB สะดุดหลังส่ง)
  2. ปล่อยให้ sweeper หยิบงานนั้นมาทำใหม่
- **Expected Result:** รอบที่ 2 **ต้องตรวจพบว่าส่งไปแล้วและไม่ส่งซ้ำ** — กลไกที่ยอมรับได้คือมี `ChatMessage` ขาออกที่ผูกกับงานนี้อยู่แล้ว (หรือ `AutoReplyLog` ที่ `decision="REPLIED"` ของ `chatMessageId` เดียวกัน) ⓐ **ต้องระบุกลไกที่แน่ชัดใน SDS**; ผลสุดท้าย: ลูกค้าได้ 1 ข้อความ, job จบที่ `DONE`
- **Linked to:** AC-017-03, BR-AR-23

#### TC-DUP-04: 🛑 **BLOCKER** — ข้อความฝั่งร้านต้องไม่ถูกนำมาตรวจจับกลุ่มคำ
- **ประเภท:** [Integration] Vitest (table-driven 3 กรณี)
- **Steps:** ป้อนข้อความขาเข้า 3 แบบที่ **ล้วนมีคำ `"สนใจ"` อยู่** —
  1. echo ของคำตอบที่ระบบเพิ่งส่ง (`senderRole="SHOP"`, `autoReplyKind="AUTO"`)
  2. ข้อความที่แอดมินพิมพ์จาก **แอป Messenger โดยตรง** แล้วมาทาง webhook echo (`senderRole="SHOP"`, `autoReplyKind=null`)
  3. ข้อความที่แอดมินส่งจากหน้า inbox ของ Deep เอง
- **Expected Result:** **ไม่มีกรณีใดสร้าง `AutoReplyJob` ที่นำไปสู่การตอบ**; ถ้ามีการสร้าง job ต้องจบที่ `SKIPPED` พร้อม `skipReason="OUTBOUND_MESSAGE"`; sender ไม่ถูกเรียกเลย — และกรณีที่ 2/3 ต้อง **ทำให้ระบบหยุดตอบ** (human takeover, ดู TC-HT-01) ส่วนกรณีที่ 1 ต้อง **ไม่** ทำให้หยุด (ดู TC-DUP-05)
- **Linked to:** AC-017-04, BR-AR-22

#### TC-DUP-05: 🛑 **BLOCKER** — echo ของคำตอบตัวเองมาถึงก่อนที่เราจะเขียนแถว (กับดักที่ร้ายที่สุด)
- **ประเภท:** [Integration] Vitest — เคสนี้มาจาก [[DATABASE]] §6 โดยตรง
- **Precondition:** SHOP-A เปิดใช้งาน, CONV-1
- **Steps:** จำลองลำดับเหตุการณ์ที่ผิดจังหวะ —
  1. ระบบส่งคำตอบสำเร็จ ได้ `mid = "m_echo_001"` กลับมาจาก Meta
  2. **ก่อน** ที่โค้ดจะเขียนแถว `ChatMessage` ของตัวเอง ให้ยิง webhook echo ของข้อความนั้น (`externalMessageId="m_echo_001"`, `senderRole="SHOP"`) เข้า `ingestInboundMessage` จนเขียนแถวลง DB สำเร็จด้วย `autoReplyKind=null`
  3. ปล่อยให้โค้ดเดิมเขียนแถวของตัวเองต่อ (จะชน `externalMessageId @unique`)
  4. ลูกค้าส่งข้อความใหม่ที่ match กลุ่มคำ
- **Expected Result:**
  - ขั้น 3: โค้ดต้อง **`UPDATE` แถวที่มีอยู่ให้ `autoReplyKind="AUTO"`** ไม่ใช่คืนแถวเดิมเฉย ๆ ([[DATABASE]] §6 ระบุว่า `sendOutboundMessage:879-885` ปัจจุบันทำผิดจุดนี้) — assert ว่าแถวนั้นมี `autoReplyKind="AUTO"` หลังจบขั้น 3
  - ขั้น 4: ระบบ **ยังตอบตามปกติ** — ต้องไม่มี `skipReason="PAUSED_HUMAN_TAKEOVER"` และ `Conversation.autoReplyPausedUntil` ต้องยังเป็น null; ระบบต้องไม่หยุดตัวเองเพราะข้อความของตัวเอง
- **Linked to:** AC-016-05, AC-017-04, [[DATABASE]] §6

#### TC-DUP-06: การทำงานซ้ำของ sweeper ต้องไม่ทำให้ตอบซ้ำ
- **ประเภท:** [Integration] Vitest
- **Steps:** ให้ sweeper รัน 3 รอบติดกันโดยที่มีงานที่เพิ่งเสร็จ (`DONE`) และงานที่ค้าง (`PENDING`) ปนกันในตาราง
- **Expected Result:** งาน `DONE` ไม่ถูกหยิบซ้ำ (ต้องกรองที่ `WHERE status` ระดับ query); จำนวนข้อความขาออกรวมเท่ากับจำนวนงานที่ควรตอบพอดี
- **Linked to:** AC-023-03

#### TC-DUP-07: กรณีข้ามเพราะซ้ำต้องถูกบันทึกให้ค้นย้อนหลังได้
- **ประเภท:** [Integration] Vitest
- **Steps:** หลัง TC-DUP-01 → ค้น `AutoReplyLog` ของเธรดนั้นด้วยตัวกรอง `decision="SKIPPED"`
- **Expected Result:** พบแถวที่อธิบายได้ว่าทำไมรอบที่ 2/3 ไม่ตอบ (`skipReason` เป็นค่าจากลิสต์ FROZEN เท่านั้น); ร้านเปิดดูแล้วเข้าใจโดยไม่ต้องถามทีมพัฒนา
- **Linked to:** AC-024-02

---

### 3.8 กลุ่ม H — [Integration] การหยุดเมื่อพนักงานเข้ามาตอบ (FR-016)

**ไฟล์:** `src/services/__tests__/auto-reply-takeover.test.ts` ⓐ

#### TC-HT-01: 🛑 **BLOCKER** — พนักงานตอบ ระบบต้องหยุดทันทีโดยอัตโนมัติ
- **ประเภท:** [Integration] Vitest
- **Precondition:** SHOP-A `humanTakeoverPauseMode="2H"`, CONV-1 ที่ระบบเคยตอบไปแล้ว 2 ข้อความ
- **Steps:**
  1. พนักงานส่งข้อความในเธรด (จากหน้า inbox — `senderRole="SHOP"`, `autoReplyKind=null`)
  2. ลูกค้าส่ง `"สนใจอันนี้ด้วยครับ"` ทันที
- **Expected Result:** ขั้น 1 ทำให้ `Conversation.autoReplyPausedUntil` ถูกตั้งเป็นเวลา +2 ชม. **โดยไม่ต้องกดปุ่มใด ๆ**; ขั้น 2 ไม่มีข้อความขาออก + `AutoReplyLog` มี `decision="SKIPPED"`, `skipReason="PAUSED_HUMAN_TAKEOVER"`
- **Linked to:** AC-016-01, BR-AR-13

#### TC-HT-02: ครบเวลาแล้วกลับมาทำงานเอง (30M / 2H)
- **ประเภท:** [Integration] Vitest
- **Steps:** ตั้ง `autoReplyPausedUntil` เป็นเวลาที่ผ่านมาแล้ว 1 วินาที (จำลองครบเวลา — ห้ามใช้ `sleep` จริง) → ลูกค้าส่งข้อความที่ match
- **Expected Result:** ระบบตอบตามปกติ; `AutoReplyLog.decision="REPLIED"`; ทดสอบทั้งโหมด `30M` และ `2H` โดยยืนยันว่าเวลาที่คำนวณต่างกันจริง (30 นาที vs 120 นาที)
- **Linked to:** AC-016-02

#### TC-HT-03: โหมด `MANUAL` และ `UNTIL_RESOLVED`
- **ประเภท:** [Integration] Vitest
- **Steps:**
  1. โหมด `MANUAL`: พนักงานตอบ → ข้ามเวลาไป 30 วัน → ลูกค้าส่งข้อความ
  2. โหมด `UNTIL_RESOLVED`: พนักงานตอบ → ลูกค้าส่งข้อความ → จากนั้นปิดเธรด (`resolvedAt`) แล้วลูกค้าทักใหม่
- **Expected Result:** 1) ยัง **ไม่ตอบ** จนกว่าจะมีคนกดเปิดกลับเอง (`autoReplyPausedUntil` ต้องแทนสถานะ "ไม่มีกำหนด" ได้ — เช่นวันที่ไกลมาก หรือใช้ค่า null ร่วมกับ flag อื่น ⓐ ต้องระบุใน SDS); 2) ระหว่างเธรดยังเปิด = ไม่ตอบ, หลังปิดเธรดแล้วทักใหม่ = กลับมาตอบ
- **Linked to:** AC-016-02

#### TC-HT-04: สถานะและเวลาที่จะกลับมาทำงานแสดงในหน้าเธรด
- **ประเภท:** [E2E] + [Manual]
- **Steps:** หลัง TC-HT-01 เปิดเธรดนั้นในกล่องข้อความ
- **Expected Result:** เห็นข้อความสถานะชัดเจนว่า auto-reply ถูกหยุดอยู่ และจะกลับมาทำงานเมื่อไหร่ (วันที่/เวลาไทยรูปแบบ `formatDateTime` — พ.ศ.); ไม่ใช่หยุดเงียบจนแอดมินเข้าใจผิดว่าระบบยังทำงาน; ใช้ Paces primitive + icon จริง ห้าม emoji
- **Linked to:** AC-016-03, BR-AR-15

#### TC-HT-05: พนักงานเปิด auto-reply กลับเองก่อนครบเวลา
- **ประเภท:** [E2E] + [Integration]
- **Steps:** ในเธรดที่ถูกหยุดอยู่ กดปุ่มเปิด auto-reply กลับ → ลูกค้าส่งข้อความที่ match
- **Expected Result:** `autoReplyPausedUntil` ถูกล้างเป็น null; ระบบตอบทันทีในข้อความถัดไป; **STAFF ทำได้** (ควบคุมระดับเธรดเป็นสิทธิ์ของ STAFF ตาม BRD §1.3) แต่แก้ค่าตั้งค่าระดับร้านไม่ได้
- **Linked to:** AC-016-04

#### TC-HT-06: คำตอบของระบบเองต้องไม่นับเป็น "พนักงานตอบ"
- **ประเภท:** [Integration] Vitest
- **Steps:** ให้ระบบตอบ 3 ครั้งติดกันในเธรดเดียว (ผ่านข้อความลูกค้า 3 ข้อความที่ห่างกันเกิน cooldown)
- **Expected Result:** `autoReplyPausedUntil` ยังเป็น null ตลอด; ระบบไม่หยุดตัวเอง; การหา "ข้อความคนล่าสุด" ต้องใช้เงื่อนไข `senderRole='SHOP' AND autoReplyKind IS NULL` ตาม [[DATABASE]] §3.7 — ยืนยันด้วยการตรวจ query จริง
- **Linked to:** AC-016-05

#### TC-HT-07: เธรดสแปมและเธรดที่ส่งต่อแล้วต้องไม่ได้รับคำตอบ
- **ประเภท:** [Integration] Vitest
- **Precondition:** CONV-SPAM (`isSpam=true`) และ CONV-HANDOFF (`handoffAt` ไม่เป็น null)
- **Steps:** ส่งข้อความที่ match กลุ่มคำเข้าทั้ง 2 เธรด
- **Expected Result:** ไม่มีข้อความขาออกทั้งคู่; `skipReason="SPAM"` และ `"HANDED_OFF"` ตามลำดับ; ข้อความขาเข้ายังถูกบันทึกลงเธรดตามปกติ (ไม่กระทบการรับข้อความ)
- **Linked to:** AC-016-06, BR-AR-14

#### TC-HT-08: ลำดับการตรวจ gate ต้องตรงกับ [[PRD]] §4.3
- **ประเภท:** [Unit] Vitest
- **Steps:** สร้างเธรดที่ผิดเงื่อนไข **หลายข้อพร้อมกัน** (เช่น ร้านปิด + สแปม + ครบจำนวน) แล้วตรวจว่า `skipReason` ที่บันทึกคือข้อใด
- **Expected Result:** `skipReason` ต้องเป็นข้อที่ **อยู่ก่อนที่สุด** ตามลำดับ 9 ข้อของ [[PRD]] §4.3 (`SHOP_DISABLED` มาก่อน `NOT_IN_TEST_ALLOWLIST` มาก่อน `SPAM` …) — ลำดับที่คงที่ทำให้ร้าน debug ได้ตรงจุดและทำให้ TC-TM-09 (gate ต้นทุน) พิสูจน์ได้
- **Linked to:** AC-024-02, [[PRD]] §4.3

---

### 3.9 กลุ่ม I — [Integration] บริบทโฆษณาและสินค้า (FR-013 / FR-014)

**ไฟล์:** `src/services/__tests__/auto-reply-context.test.ts` ⓐ

#### TC-CTX-01: บริบทโฆษณาต้องเป็นตัวล่าสุดเสมอ
- **ประเภท:** [Integration] Vitest
- **Steps:** สร้าง `ConversationAdReferral` ของ AD-1 (เก่า) แล้วของ AD-2 (ใหม่) ในเธรดเดียวกัน → resolve
- **Expected Result:** ใช้ `ad_1002`; `AutoReplyLog.adId="ad_1002"`; การเลือก "ล่าสุด" ต้องเรียงด้วยคอลัมน์เวลาของแถว referral ไม่ใช่พึ่งลำดับที่ DB คืนมา
- **Linked to:** AC-013-01, BR-AR-09

#### TC-CTX-02: 🛑 **BLOCKER** — ลูกค้าเก่ากดโฆษณาตัวใหม่ต้องได้คำตอบของตัวใหม่
- **ประเภท:** [Integration] Vitest
- **Precondition:** CONV-1 เคยทักจาก AD-1 และเคยได้คำตอบของ R-7 ไปแล้วเมื่อวาน
- **Steps:**
  1. ลูกค้าคนเดิมกด **AD-2** แล้วส่ง `"สนใจครับ"` (webhook มี referral ของ `ad_1002`)
- **Expected Result:** คำตอบที่ส่งคือของ **R-6 (`ad_1002`)** ไม่ใช่ของ AD-1; `resolutionLevel="KEYWORD_PAGE_AD"`, `AutoReplyLog.adId="ad_1002"` — เคสนี้คือ pain point หลักของ persona (ตอบผิดรุ่นผิดราคา)
- **Linked to:** AC-013-02, BR-AR-09

#### TC-CTX-03: บริบทหมดอายุแบบ `HOURS` → ถอยไประดับเพจ
- **ประเภท:** [Integration] Vitest
- **Precondition:** `adsContextMode="HOURS"`, `adsContextHours=24`; referral ของ AD-2 เกิดเมื่อ 25 ชม.ที่แล้ว
- **Steps:** ลูกค้าส่ง `"สนใจครับ"`
- **Expected Result:** **ไม่ใช้** กฎระดับโฆษณา; ได้ R-4 (`KEYWORD_PAGE`); `AutoReplyLog.adId` เป็น null หรือบันทึกไว้พร้อมหมายเหตุว่าหมดอายุ ⓐ (ระบุใน SDS); ทดสอบขอบเขต 23 ชม. → ยังใช้ได้
- **Linked to:** AC-013-04

#### TC-CTX-04: โหมด `UNTIL_RESOLVED` และ `UNTIL_NEW_PRODUCT`
- **ประเภท:** [Integration] Vitest
- **Steps:**
  1. `UNTIL_RESOLVED`: referral เก่า 30 วัน แต่เธรดยังไม่ปิด → resolve; แล้วปิดเธรด (`resolvedAt`) → ลูกค้าทักใหม่ → resolve
  2. `UNTIL_NEW_PRODUCT`: referral ของ AD-2 อยู่ แล้วมีการตั้งบริบทสินค้าใหม่ (PROD-2, MANUAL) → resolve
- **Expected Result:** 1) ก่อนปิดเธรด = ยังใช้บริบทเดิม, หลังปิด = ไม่ใช้แล้ว (ถอยระดับเพจ); 2) บริบทโฆษณาถูกยกเลิกเมื่อพบสินค้าใหม่ → เลือกกฎตามสินค้าแทน ⓐ **นิยามของ "พบบริบทสินค้าใหม่" ต้องระบุให้ชัดใน SDS** (นับเฉพาะ MANUAL หรือรวม ADS_MAPPING ด้วย)
- **Linked to:** AC-013-03, AC-013-04

#### TC-CTX-05: บันทึกที่มาและเวลาอัปเดตของบริบททุกครั้ง
- **ประเภท:** [Integration] Vitest
- **Steps:** ตั้งบริบทสินค้าจาก 3 ทาง (ผูกโฆษณา / referral / พนักงานกำหนด) ทีละครั้ง
- **Expected Result:** `Conversation.contextProductSource` ได้ `ADS_MAPPING` / `REFERRAL` / `MANUAL` ตรงตามที่มา (ค่าใน FROZEN §3.8 เท่านั้น) และ `contextProductAt` ขยับทุกครั้ง; `AutoReplyLog` เก็บ snapshot `productId` ณ เวลาตัดสินใจ ไม่ใช่ join ย้อนหลัง
- **Linked to:** AC-013-05, BR-AR-11

#### TC-CTX-06: ประวัติการกดโฆษณาต้องเก็บครบ ไม่ทับของเดิม
- **ประเภท:** [Integration] Vitest
- **Steps:** ให้ลูกค้าเดิมกดโฆษณา 4 ครั้ง (AD-1, AD-2, AD-1, AD-3) → query `ConversationAdReferral` ของเธรด
- **Expected Result:** มี **4 แถว** ครบ (ไม่ใช่ 1 แถวที่ถูก update ทับ); เรียงตามเวลาได้; ตัวล่าสุดคือ AD-3 และเป็นตัวที่ถูกใช้ resolve
- **Linked to:** AC-013-06, BR-AR-10

#### TC-CTX-07: บริบทสินค้ามาได้จาก 3 ทาง
- **ประเภท:** [Integration] Vitest
- **Steps:** ทดสอบทีละทาง — (1) ผูก PROD-1 กับ `ad_1001` แล้วลูกค้าทักจากโฆษณานั้น (2) referral ที่มี `productId` มาจาก Facebook (3) พนักงานกดกำหนดสินค้าให้เธรด
- **Expected Result:** ทั้ง 3 ทางตั้ง `contextProductId` ได้ และ `contextProductSource` ตรงกับที่มาแต่ละแบบ
- **Linked to:** AC-014-01

#### TC-CTX-08: 🛑 **BLOCKER** — สิ่งที่พนักงานกำหนดชนะการแมปจากโฆษณาเสมอ
- **ประเภท:** [Integration] Vitest
- **Precondition:** `ad_1001` ผูกกับ PROD-1 (ADS_MAPPING); มีกฎระดับสินค้าแยกกันสำหรับ PROD-1 และ PROD-2
- **Steps:**
  1. พนักงานกำหนดสินค้าเธรดเป็น **PROD-2** (`MANUAL`)
  2. ลูกค้ากด **AD-1 ซ้ำอีกครั้ง** (ซึ่งจะพยายามตั้งบริบทเป็น PROD-1 ตาม ADS_MAPPING)
  3. ลูกค้าส่ง `"สนใจครับ"`
- **Expected Result:** `contextProductId` ยังเป็น **PROD-2** และ `contextProductSource="MANUAL"` (ADS_MAPPING ที่มาทีหลัง **ต้องไม่ทับ** MANUAL แม้จะใหม่กว่า); คำตอบที่ส่งเป็นกฎของ PROD-2
- **Linked to:** AC-014-02, BR-AR-12

#### TC-CTX-09: ที่มาระดับเดียวกัน ตัวใหม่กว่าชนะ
- **ประเภท:** [Integration] Vitest
- **Steps:** ตั้งบริบท ADS_MAPPING เป็น PROD-1 → ต่อมาตั้ง ADS_MAPPING เป็น PROD-2; แล้วทดสอบซ้ำด้วย MANUAL → MANUAL
- **Expected Result:** ทั้ง 2 ชุดได้ตัวหลัง (`contextProductAt` ใหม่กว่าชนะ); ไม่มีกรณีที่ตัวเก่าชนะ
- **Linked to:** AC-014-03

#### TC-CTX-10: ระบบต้องไม่เดาสินค้าจากข้อความลูกค้า
- **ประเภท:** [Integration] Vitest
- **Precondition:** เธรดที่ **ไม่มี** บริบทสินค้าเลย; มีสินค้าชื่อ "โช๊คหลังคู่ 335 มม." อยู่ในร้าน
- **Steps:** ลูกค้าส่ง `"สนใจโช๊คหลังคู่ 335 มม. ครับ"` (ชื่อสินค้าตรงเป๊ะอยู่ในข้อความ)
- **Expected Result:** `Conversation.contextProductId` ยังเป็น **null**; การ resolve ต้อง **ไม่** เลือกกฎระดับสินค้า — เฟสนี้ห้ามอนุมานสินค้าจากข้อความ (AC-014-04); การตอบต้องถอยไประดับเพจ/กลางตามปกติ
- **Linked to:** AC-014-04

#### TC-CTX-11: พนักงานเปลี่ยน/ล้างบริบทสินค้า มีผลกับข้อความถัดไปทันที
- **ประเภท:** [E2E] + [Integration]
- **Steps:** ในเธรดที่บริบท = PROD-1 → พนักงานเปลี่ยนเป็น PROD-2 → ลูกค้าส่งข้อความ → พนักงานกดล้างบริบท → ลูกค้าส่งอีกข้อความ
- **Expected Result:** ข้อความแรกได้กฎของ PROD-2; หลังล้าง `contextProductId=null` และ `contextProductSource=null` → ข้อความที่สองถอยไประดับที่ไม่มีสินค้า (`KEYWORD_PAGE`/`KEYWORD_DEFAULT`); ไม่ต้องรีเฟรชหรือรอ cache
- **Linked to:** AC-014-05

---

### 3.10 กลุ่ม J — [Integration] การจำกัดจำนวน ระยะพัก และการส่งต่อพนักงาน (FR-018 / FR-019)

**ไฟล์:** `src/services/__tests__/auto-reply-limits.test.ts` ⓐ

#### TC-LIM-01: ระยะพักของกลุ่มคำเดิม (`keywordCooldownSec`)
- **ประเภท:** [Integration] Vitest
- **Precondition:** `keywordCooldownSec=300`; CONV-1
- **Steps:** ลูกค้าส่ง `"สนใจ"` → ระบบตอบ → ลูกค้าส่ง `"สนใจอีกครั้ง"` ห่างกัน 60 วินาที (จำลองเวลา ไม่ใช้ sleep จริง)
- **Expected Result:** ครั้งที่ 2 ไม่ตอบ; `skipReason="KEYWORD_COOLDOWN"`; ทดสอบขอบ 301 วินาที → **ตอบ**; การนับ cooldown ต้องอ้าง `AutoReplyLog` ของกลุ่มคำนั้นในเธรดนั้น ไม่ใช่ `lastAutoReplyAt` รวม
- **Linked to:** AC-018-01

#### TC-LIM-02: cooldown ผูกกับกลุ่มคำ ไม่ใช่ทั้งเธรด (negative control)
- **ประเภท:** [Integration] Vitest
- **Steps:** ลูกค้าส่ง `"สนใจ"` (ตอบ) → 60 วินาทีต่อมาส่ง `"ราคาเท่าไหร่"` (คนละกลุ่ม `KW-PRICE`)
- **Expected Result:** ข้อความที่ 2 **ได้รับคำตอบ** เพราะเป็นคนละกลุ่มคำ — พิสูจน์ว่า cooldown ไม่ได้ถูกทำเป็น "พักทั้งเธรด" ผิด ๆ
- **Linked to:** AC-018-01

#### TC-LIM-03: ครบจำนวนสูงสุดต่อเธรด → หยุดและส่งต่อพนักงาน
- **ประเภท:** [Integration] Vitest
- **Precondition:** `maxRepliesPerConversation=10`; CONV-MAXED ที่ `autoReplyCount=10`
- **Steps:** ลูกค้าส่งข้อความที่ match
- **Expected Result:** ไม่ตอบ; `skipReason="MAX_REPLIES_REACHED"`; `decision="HANDOFF"` และ `Conversation.handoffAt` ถูกตั้งค่าพร้อม `handoffReason`; ทดสอบขอบที่ `autoReplyCount=9` → ตอบได้ 1 ครั้งแล้วกลายเป็น 10
- **Linked to:** AC-018-02, AC-019-01

#### TC-LIM-04: เหตุผลที่ไม่ตอบเพราะข้อจำกัดต้องค้นย้อนหลังได้
- **ประเภท:** [Integration] + [E2E]
- **Steps:** สร้างเคส cooldown 1 ครั้ง และ max-replies 1 ครั้ง → เปิดหน้าบันทึกการทำงาน กรอง `decision="SKIPPED"`
- **Expected Result:** เห็นทั้ง 2 แถวพร้อม `skipReason` ที่อ่านออกเป็นภาษาไทยในหน้าจอ (แปลจากค่า FROZEN); มีข้อความ/ลิงก์บอกว่าจะแก้ที่ไหน
- **Linked to:** AC-018-04

#### TC-LIM-05: ลูกค้าส่งติดกันหลายข้อความในเวลาสั้น ๆ
- **ประเภท:** [Integration] Vitest
- **Steps:** ยิงข้อความ 5 ข้อความห่างกัน 1 วินาที โดยทุกข้อความ match `KW-INTEREST`
- **Expected Result:** ลูกค้าได้คำตอบ **ไม่เกิน 1 ครั้ง** ในช่วง cooldown (อีก 4 ข้อความได้ `KEYWORD_COOLDOWN`); ทุกข้อความยังมี `AutoReplyJob` ของตัวเองครบ 5 แถว (เพื่อให้ตรวจย้อนหลังได้) และทุกแถวจบสถานะเรียบร้อยไม่ค้าง
- **Linked to:** AC-018-05

#### TC-HO-01: เงื่อนไขการส่งต่อพนักงานครบทุกข้อ
- **ประเภท:** [Integration] Vitest (table-driven 5 กรณี)
- **Steps:** สร้างสถานการณ์ทีละแบบ —
  1. ไม่ match กลุ่มคำและไม่มีคำตอบกลางให้ถอย
  2. ข้อความตรงกับ `handoffPhrases` (`"คุยกับแอดมิน"`)
  3. ข้อความเรื่องคืนเงิน/ปัญหาคำสั่งซื้อ (`"คืนเงิน"`, `"ของยังไม่ได้"` ที่ร้านตั้งไว้)
  4. ตอบครบ `maxRepliesPerConversation`
  5. งานล้มเหลวต่อเนื่องเกินจำนวนครั้ง
- **Expected Result:** ทุกกรณี `decision="HANDOFF"` และไม่มีข้อความถูกส่ง; ⓐ **หมายเหตุความครอบคลุม:** ข้อ 2/3 ทำได้เฉพาะผ่าน `handoffPhrases` ที่ร้านตั้งเอง — เฟสนี้ไม่มี AI ตรวจเจตนา ดังนั้น "ลูกค้าร้องเรียน" ที่ไม่ตรงคำที่ตั้งไว้จะไม่ถูกจับได้ **ต้องระบุข้อจำกัดนี้ใน SRS ให้ตรงกับความคาดหวังของ AC-019-01**
- **Linked to:** AC-019-01

#### TC-HO-02: การส่งต่อต้องเปลี่ยนสถานะ หยุดระบบ แจ้งพนักงาน และบันทึกเหตุผล
- **ประเภท:** [Integration] + [E2E]
- **Steps:** ทำให้เกิด handoff 1 ครั้ง → ตรวจ DB + หน้า inbox
- **Expected Result:** `Conversation.handoffAt` และ `handoffReason` ถูกตั้งค่า; เธรดนั้นไม่ได้รับคำตอบอัตโนมัติอีก (ยืนยันด้วยข้อความถัดไป → `skipReason="HANDED_OFF"`); มีการแจ้งพนักงาน ⓐ (ช่องทางการแจ้ง — Notification/badge ใน inbox — **ยังไม่ระบุใน BRD ต้องกำหนดใน SRS**); `AutoReplyLog.decision="HANDOFF"` พร้อมเหตุผล
- **Linked to:** AC-019-03, BR-AR-24

#### TC-HO-03: พนักงานที่รับช่วงต้องเห็นบริบทครบ 4 อย่าง
- **ประเภท:** [E2E] + [Manual]
- **Precondition:** เธรดที่ระบบตอบไปแล้ว 2 ข้อความ มีบริบทโฆษณา AD-2 และสินค้า PROD-2 แล้วถูก handoff
- **Steps:** พนักงานเปิดเธรดนั้น
- **Expected Result:** เห็นครบในหน้าเดียวโดยไม่ต้องคลิกหลายชั้น — (1) ข้อความที่ระบบตอบไปแล้วทั้งหมด พร้อมป้ายว่าระบบตอบ (2) กลุ่มคำที่ match ล่าสุด (3) บริบทโฆษณาและสินค้าของเธรด (4) เหตุผลที่ระบบหยุด
- **Linked to:** AC-019-04, BR-AR-25

#### TC-HO-04: การส่งต่อต้องไม่ส่งข้อความถึงลูกค้าโดยอัตโนมัติ
- **ประเภท:** [Integration] Vitest
- **Steps:** ทำให้เกิด handoff โดยที่ร้าน **ไม่ได้ตั้ง** ข้อความแจ้ง; แล้วทดสอบซ้ำโดยตั้งข้อความแจ้งไว้ ⓐ (ถ้า SRS กำหนดให้มีช่องนี้)
- **Expected Result:** กรณีแรก **ไม่มีข้อความขาออกเลย** (ลูกค้าไม่ได้รับ "กำลังโอนสายให้พนักงาน" ที่ระบบแต่งเอง); กรณีหลังส่งเฉพาะข้อความที่ร้านพิมพ์ไว้เองแบบคำต่อคำ
- **Linked to:** AC-019-05

---

### 3.11 กลุ่ม K — โหมดทดสอบ (FR-020 / FR-021) — กลุ่มที่ user ขอเพิ่มเป็นพิเศษ

**ไฟล์:** `src/services/__tests__/auto-reply-testmode.test.ts` + `e2e/auto-reply-testmode.spec.ts` ⓐ

#### TC-TM-01: 🛑 **BLOCKER** — เปิดโหมดทดสอบแล้วเธรดอื่นทั้งร้านต้องเงียบสนิท
- **ประเภท:** [Integration] Vitest
- **Precondition:** `AutoReplyConfig.testMode=true`, `testModeExpiresAt` = อนาคต; **CONV-TEST** มี `autoReplyTestEnabled=true`; **CONV-1 / CONV-2** มี `autoReplyTestEnabled=false` แต่ทุกอย่างอื่นพร้อมตอบ (กฎครบ ไม่ติด cooldown ไม่ถูกหยุด)
- **Steps:** ส่งข้อความ `"สนใจครับ"` ที่ match กลุ่มคำแน่นอน เข้าทั้ง 3 เธรดพร้อมกัน
- **Expected Result:**
  - **CONV-TEST**: ได้รับคำตอบ 1 ข้อความ, `ChatMessage.autoReplyKind="AUTO_TEST"`, `AutoReplyLog.isTest=true`, `decision="REPLIED"`
  - **CONV-1 และ CONV-2**: **ไม่มีข้อความขาออกเลยแม้แต่แถวเดียว** (นับจาก DB ไม่ใช่จาก mock), `decision="SKIPPED"`, `skipReason="NOT_IN_TEST_ALLOWLIST"`
  - นี่คือคำสัญญาที่ทำให้ร้านกล้าเปิดใช้ — ถ้าเคสนี้ fail ห้ามปล่อยฟีเจอร์เด็ดขาด
- **Linked to:** AC-021-03, BR-AR-16

#### TC-TM-02: เปิด/ปิดโหมดทดสอบระดับร้านได้ 1 จุด
- **ประเภท:** [E2E] Playwright
- **Steps:** เปิดสวิตช์โหมดทดสอบในหน้าตั้งค่า → บันทึก → ปิดกลับ
- **Expected Result:** `AutoReplyConfig.testMode` เปลี่ยนตาม; `testModeEnabledByUserId` ถูกบันทึกเมื่อเปิด; มีเพียงจุดเดียวในระบบที่เปิด/ปิดได้ (ไม่มีสวิตช์ซ้ำซ้อนหลายที่)
- **Linked to:** AC-021-01

#### TC-TM-03: ระบุเธรดทดสอบได้หลายเธรด เลือกจากเธรดที่มีอยู่จริง
- **ประเภท:** [E2E] Playwright
- **Steps:** เพิ่มเธรดเข้ารายการทดสอบ 3 เธรดจากตัวเลือกที่ระบบแสดง; ลองยิง API ตรงด้วย `conversationId` ของ **CONV-B (SHOP-B)**
- **Expected Result:** 3 เธรดของ SHOP-A ได้ `autoReplyTestEnabled=true`; ตัวเลือกในหน้าจอมีเฉพาะเธรดของร้านตัวเอง; การยิงตรงข้ามร้านได้ 403/404 ⓐ และ `CONV-B.autoReplyTestEnabled` ยังเป็น false
- **Linked to:** AC-021-02

#### TC-TM-04: ข้อความในโหมดทดสอบถูกส่งถึงผู้รับจริง
- **ประเภท:** [Manual] (Messenger จริง — ต้องขออนุญาต user ก่อน)
- **Precondition:** เปิดโหมดทดสอบ + เพิ่มเธรดของผู้ทดสอบเองเข้า allowlist
- **Steps:** ผู้ทดสอบพิมพ์ `"สนใจ"` เข้าเพจจาก Messenger จริง
- **Expected Result:** ผู้ทดสอบ **ได้รับข้อความจริงบน Messenger** (โหมดทดสอบไม่ใช่ dry-run — ต่างจาก 00022 โดยตั้งใจ); ข้อความตรงกับ `replyText` ทุกตัวอักษร
- **Linked to:** AC-021-04, BR-AR-18

#### TC-TM-05: 🛑 **BLOCKER** — ข้อความทดสอบติดป้ายและกรองแยกได้
- **ประเภท:** [Integration] + [E2E]
- **Steps:** หลัง TC-TM-01 → 1) ตรวจ DB 2) เปิดเธรดในหน้า inbox 3) เปิดหน้าบันทึกการทำงานแล้วกรอง "เฉพาะข้อความทดสอบ"
- **Expected Result:**
  - DB: `ChatMessage.autoReplyKind="AUTO_TEST"` (ไม่ใช่ `"AUTO"`) และ `AutoReplyLog.isTest=true`
  - หน้าเธรด: ข้อความนั้นมีป้ายกำกับที่ฝั่งร้านเห็นชัดว่าเป็นข้อความทดสอบ แยกจากข้อความ auto ปกติได้ (icon จริง ห้าม emoji)
  - หน้าบันทึก: ตัวกรองคืนเฉพาะแถวที่ `isTest=true` และตัวกรอง "ไม่ใช่ทดสอบ" คืนเฉพาะ `isTest=false`
- **Linked to:** AC-021-05

#### TC-TM-06: ขอยืนยันพร้อมแสดงชื่อเธรดก่อนเพิ่มเข้ารายการทดสอบ
- **ประเภท:** [E2E] Playwright
- **Steps:** กดเพิ่มเธรดเข้ารายการทดสอบ
- **Expected Result:** มี Sweet Alerts ยืนยัน (ตาม convention `feedback_sweet_alerts_modal`) ที่ **แสดงชื่อเธรด/ชื่อผู้ติดต่อจริงของเธรดนั้น** และเตือนว่าจะมีการส่งข้อความจริงถึงคนคนนั้น; กดยกเลิกแล้ว `autoReplyTestEnabled` ต้องยังเป็น false
- **Linked to:** AC-021-06, BR-AR-19

#### TC-TM-07: แถบสถานะโหมดทดสอบค้างไว้ + ปิดได้ในคลิกเดียว
- **ประเภท:** [E2E] + [Manual]
- **Steps:** เปิดโหมดทดสอบ → เข้าหน้ากล่องข้อความ และหน้าตั้งค่า → กดปุ่มปิดโหมดบนแถบ
- **Expected Result:** แถบสถานะแสดงค้างในทั้ง 2 หน้า (ไม่ใช่ toast ที่หายไปเอง) พร้อมบอกจำนวนเธรดใน allowlist และเวลาหมดอายุ; ปุ่มปิดโหมดทำงานได้ในคลิกเดียวโดยไม่ต้องเข้าไปหาในหน้าตั้งค่า; หลังปิด `testMode=false` ทันทีและแถบหายไป
- **Linked to:** AC-021-07, BR-AR-20

#### TC-TM-08: โหมดทดสอบหมดอายุเองและแจ้งร้าน
- **ประเภท:** [Integration] + [E2E]
- **Steps:** ตั้ง `testModeExpiresAt` เป็นเวลาที่ผ่านมาแล้ว → ส่งข้อความเข้าเธรดที่ **ไม่อยู่** ใน allowlist
- **Expected Result:** ระบบถือว่าโหมดทดสอบสิ้นสุด → เธรดปกติ **กลับมาได้รับคำตอบตามปกติ**; `testMode` ถูกปิดจริงใน DB (ไม่ใช่แค่ถูกมองข้ามตอนอ่าน) ⓐ ระบุใน SDS ว่าปิดโดย cron หรือปิดแบบ lazy ตอนอ่าน; มีการแจ้งร้าน ⓐ (ช่องทางยังไม่ระบุใน BRD — **ต้องกำหนดใน SRS**); กรณี `testMode=true` แต่ `testModeExpiresAt=null` ต้องถือว่าไม่หมดอายุ (ตาม [[DATABASE]] §3.1) และควรมีคำเตือนในหน้าจอ
- **Linked to:** AC-021-08, BR-AR-20

#### TC-TM-09: 🛑 **BLOCKER** — gate โหมดทดสอบต้องทำงานก่อน gate ที่มีต้นทุน
- **ประเภท:** [Unit] Vitest (spy-based)
- **Precondition:** `testMode=true`; เธรดที่ **ไม่อยู่** ใน allowlist; ข้อความที่ match กลุ่มคำแน่นอน
- **Steps:** ประมวลผลงานของเธรดนั้น โดยติด spy บนทุกฟังก์ชันที่มีต้นทุน: การโหลดกลุ่มคำ/กฎจาก DB, การ resolve, การเรียก Meta Graph API, การเรียกบริการภายนอกใด ๆ
- **Expected Result:** **spy ทุกตัวต้องถูกเรียก 0 ครั้ง** — การตรวจ `testMode` + allowlist ต้องเกิดก่อนทุกอย่าง (อ่านแค่ `AutoReplyConfig` + `Conversation` ซึ่งต้องอ่านอยู่แล้ว); ผลลัพธ์คือ `skipReason="NOT_IN_TEST_ALLOWLIST"`; ยืนยันเพิ่มด้วย TC-HT-08 ว่า gate นี้อยู่ลำดับที่ 2 ตาม [[PRD]] §4.3
- **Linked to:** AC-021-09, BR-AR-17

#### TC-TM-10: cooldown และจำนวนสูงสุดยังบังคับในโหมดทดสอบ
- **ประเภท:** [Integration] Vitest
- **Precondition:** `testMode=true`; CONV-TEST อยู่ใน allowlist; `keywordCooldownSec=300`, `maxRepliesPerConversation=10`
- **Steps:** 1) ส่งข้อความ match กลุ่มเดิม 2 ครั้งห่างกัน 60 วินาที 2) ตั้ง `autoReplyCount=10` แล้วส่งอีกข้อความ
- **Expected Result:** 1) ครั้งที่ 2 ได้ `skipReason="KEYWORD_COOLDOWN"` 2) ได้ `MAX_REPLIES_REACHED` — โหมดทดสอบ **ไม่ใช่** ทางลัดที่ข้ามข้อจำกัด (ป้องกันการยิงรัวใส่เธรดของเจ้าของร้านเองระหว่างทดสอบ)
- **Linked to:** AC-021-10

#### TC-TM-11: ปิดโหมดทดสอบแล้วกลับสู่การทำงานปกติทั้งร้าน
- **ประเภท:** [Integration] Vitest
- **Steps:** ปิด `testMode` โดย **ไม่ล้าง** `autoReplyTestEnabled` ของเธรดที่เคยเพิ่มไว้ → ส่งข้อความเข้า CONV-1 (ไม่อยู่ allowlist) และ CONV-TEST
- **Expected Result:** ทั้ง 2 เธรดได้รับคำตอบตามปกติ; ข้อความของ CONV-TEST ต้องมี `autoReplyKind="AUTO"` **ไม่ใช่** `"AUTO_TEST"` และ `isTest=false` — `autoReplyTestEnabled` ต้องไม่มีผลใด ๆ เมื่อ `testMode=false` ([[DATABASE]] §3.7)
- **Linked to:** AC-021-03, AC-021-05

#### TC-SIM-01: หน้าทดสอบกฎแบบกรอกเอง — รับ input ครบ
- **ประเภท:** [E2E] Playwright
- **Steps:** เปิดหน้าทดสอบ → กรอกข้อความลูกค้าสมมติ → เลือกเพจ, โฆษณา, สินค้า, และบริบทเธรด (เช่น จำลองว่าเธรดถูกหยุดอยู่/ตอบไปแล้วกี่ครั้ง) ⓐ → กดทดสอบ
- **Expected Result:** ฟอร์มรับค่าครบทุกช่อง; ตัวเลือกเพจ/โฆษณา/สินค้าเป็นของร้านตัวเองเท่านั้น; แสดงผลได้โดยไม่ error
- **Linked to:** AC-020-01

#### TC-SIM-02: 🛑 **BLOCKER** — หน้าทดสอบต้องไม่ส่งและไม่บันทึกอะไรเลย
- **ประเภท:** [E2E] + [Integration]
- **Steps:** จดจำนวนแถวของ `ChatMessage`, `AutoReplyJob`, `AutoReplyLog`, `Conversation.autoReplyCount` ก่อนทดสอบ → กดทดสอบ 10 ครั้งด้วย input ต่าง ๆ → นับใหม่
- **Expected Result:** **จำนวนแถวทั้ง 4 จุดเท่าเดิมทุกตัว**; sender ไม่ถูกเรียกเลย (spy = 0); ไม่มี network request ไปยัง Meta (ตรวจด้วย DevTools Network); ผลลัพธ์แสดงทันทีบนหน้าจอเท่านั้น
- **Linked to:** AC-020-02

#### TC-SIM-03: ผลลัพธ์แสดงข้อมูลครบ 6 อย่าง
- **ประเภท:** [E2E] Playwright
- **Steps:** ทดสอบด้วยข้อความ `"สนใจครับ"` บริบท PAGE-1 + `ad_1002`
- **Expected Result:** แสดงครบ — (1) กลุ่มคำที่ match (2) คำตรวจจับที่ตรง (3) รูปแบบการตรวจจับ (4) กฎที่ถูกเลือก (พร้อมชื่อกำกับโฆษณาถ้ามี) (5) ระดับการเลือก (แสดงเป็นภาษาไทย ไม่ใช่ `KEYWORD_PAGE_AD` ดิบ) (6) คำตอบที่จะถูกส่ง
- **Linked to:** AC-020-03

#### TC-SIM-04: อธิบายว่ากฎอื่นทำไมไม่ถูกเลือก และถ้าไม่ match จะถอยไปอะไร
- **ประเภท:** [E2E] Playwright
- **Steps:** 1) ทดสอบข้อความที่ match หลายกลุ่ม 2) ทดสอบข้อความที่ไม่ match เลย
- **Expected Result:** 1) แสดงรายการกฎ/กลุ่มที่แพ้พร้อมเหตุผลรายรายการ (ลำดับความสำคัญต่ำกว่า / เฉพาะเจาะจงน้อยกว่า / รูปแบบเป็น CONTAINS / คำสั้นกว่า); 2) บอกชัดว่าจะถอยไปใช้คำตอบกลางของเพจ/ร้าน หรือจะส่งต่อพนักงาน — ร้านอ่านแล้วรู้ว่าต้องไปเพิ่มการตั้งค่าตรงไหน
- **Linked to:** AC-020-04

#### TC-SIM-05: 🛑 **BLOCKER** — ผลจำลองต้องตรงกับพฤติกรรมจริง (parity)
- **ประเภท:** [Integration] Vitest (table-driven)
- **Steps:** เตรียมชุด input **12 ชุด** ที่ครอบทุกระดับของ TC-RES-10 บวกเคสไม่ match และเคสโฆษณาไม่รู้จัก → สำหรับแต่ละชุด รัน 2 ทาง: (ก) ผ่าน endpoint ของหน้าจำลอง (ข) ผ่าน pipeline จริงในเธรดที่มีบริบทเดียวกัน
- **Expected Result:** ทั้ง 2 ทางคืน `keywordId`, `matchedPhrase`, `matchType`, `ruleId`, `resolutionLevel`, `replyText` **เท่ากันทุกชุด** — บังคับให้หน้าจำลองเรียก resolver **ตัวเดียวกัน** กับ pipeline จริง ไม่ใช่เขียน logic ซ้ำ (ถ้าแยกกันเมื่อไหร่ หน้าจำลองจะกลายเป็นเครื่องมือที่หลอกร้าน)
- **Linked to:** AC-020-05

#### TC-SIM-06: หน้าทดสอบใช้ได้แม้ auto-reply ระดับร้านปิดอยู่
- **ประเภท:** [E2E] Playwright
- **Precondition:** `AutoReplyConfig.isEnabled=false`
- **Steps:** เปิดหน้าทดสอบแล้วกดทดสอบ
- **Expected Result:** ทำงานได้ปกติและแสดงผลครบ (เพราะเป็นเครื่องมือตั้งค่า ไม่ใช่การส่งจริง); อาจมีข้อความเตือนว่าระบบยังปิดอยู่ แต่ต้องไม่บล็อกการใช้งาน
- **Linked to:** AC-020-06

---

### 3.12 กลุ่ม L — [Concurrency] การชนกันของ worker และผู้ใช้

**ไฟล์:** `src/services/__tests__/auto-reply-concurrency.test.ts` ⓐ · ใช้ Prisma จริง + `Promise.all` (ห้าม mock DB — จุดที่ต้องพิสูจน์คือ constraint และ conditional update)

#### TC-CC-01: 🛑 **BLOCKER** — worker 2 ตัวหยิบงานเดียวกัน
- **ประเภท:** [Concurrency] Vitest
- **Precondition:** `AutoReplyJob` 1 แถวสถานะ `PENDING`
- **Steps:** เรียก `processAutoReplyJob(jobId)` ⓐ จาก 2 เส้นทางพร้อมกันด้วย `Promise.all` (จำลอง `after()` กับ cron sweeper ชนกัน) — ทำซ้ำ 20 รอบด้วย job คนละแถว
- **Expected Result:** ทุกรอบ: sender ถูกเรียก **1 ครั้ง**, `ChatMessage` ที่ `autoReplyKind` ไม่ null เพิ่ม **1 แถว**, `AutoReplyLog` ที่ `decision="REPLIED"` มี 1 แถว; worker ที่แพ้ต้องจบอย่างสงบ (ไม่ throw ไปถึง caller) — ต้องพิสูจน์ว่า claim ทำด้วย **conditional `updateMany` (`WHERE status='PENDING'`)** แบบเดียวกับ `wallet.service` deduct ไม่ใช่ read-then-write
- **Linked to:** AC-017-05, AC-023-03

#### TC-CC-02: ลูกค้าส่งหลายข้อความพร้อมกัน
- **ประเภท:** [Concurrency] Vitest
- **Steps:** ยิง webhook 5 ข้อความของเธรดเดียวกันแบบขนาน (`Promise.all`) โดยทุกข้อความ match กลุ่มเดิม
- **Expected Result:** เกิด `AutoReplyJob` 5 แถว (คนละ `chatMessageId`); ข้อความขาออก **ไม่เกิน 1 แถว** เพราะ cooldown; ไม่มี race ที่ทำให้ 2 ข้อความผ่าน cooldown พร้อมกัน (การเช็ค cooldown + การเขียนต้องอยู่ใน transaction หรือใช้ conditional update) ⓐ; `Conversation.autoReplyCount` เพิ่มขึ้นตรงกับจำนวนที่ตอบจริง ไม่เกิน lost-update
- **Linked to:** AC-017-05, AC-018-05

#### TC-CC-03: แก้กฎระหว่างที่กำลังประมวลผล
- **ประเภท:** [Concurrency] Vitest
- **Steps:** เริ่มประมวลผลงาน (หน่วงหลังโหลดกฎแล้ว) → ระหว่างนั้นลบ/แก้ `AutoReplyRule` ที่ถูกเลือกไว้ และปิด `AutoReplyKeyword` ที่ชนะ → ปล่อยให้ประมวลผลต่อ
- **Expected Result:** ไม่ throw / ไม่ส่งข้อความว่าง; ผลลัพธ์ต้องเป็นหนึ่งใน 2 อย่างที่ยอมรับได้และ **ระบุไว้ชัดใน SDS** ⓐ — (ก) ใช้ snapshot ที่โหลดไว้แล้วส่งข้อความเดิม หรือ (ข) ตรวจซ้ำก่อนส่งแล้ว skip พร้อม `skipReason` ที่เหมาะสม; ห้ามเป็นพฤติกรรมที่ไม่แน่นอนสลับไปมา (AC-011-03)
- **Linked to:** AC-011-03

#### TC-CC-04: พนักงานตอบพร้อมกับที่ระบบกำลังจะตอบ
- **ประเภท:** [Concurrency] Vitest
- **Steps:** เริ่มประมวลผลงาน (หน่วงก่อนขั้นส่ง) → ระหว่างนั้นให้พนักงานส่งข้อความในเธรดเดียวกัน → ปล่อยให้ส่งต่อ
- **Expected Result:** ผลลัพธ์ต้องเป็นหนึ่งใน 2 สถานะที่ยอมรับได้เท่านั้น — (ก) ระบบตรวจซ้ำก่อนส่งแล้ว **ไม่ส่ง** (`skipReason="PAUSED_HUMAN_TAKEOVER"`) หรือ (ข) ส่งไปแล้ว 1 ข้อความและ pause ถูกตั้งค่าหลังจากนั้น; **ห้ามเกิด** กรณีที่ระบบส่งซ้ำ 2 ข้อความ หรือกรณีที่ `autoReplyPausedUntil` ถูกเขียนทับหายไปเพราะ update ชนกัน
- **Linked to:** AC-016-01, AC-017-05

#### TC-CC-05: การ claim งานต้องเป็น atomic
- **ประเภท:** [Concurrency] Vitest
- **Steps:** เรียกฟังก์ชัน claim งานเดียวกันแบบขนาน 10 เส้นทาง
- **Expected Result:** มีเพียง 1 เส้นทางที่ได้ `count=1` จาก `updateMany`; อีก 9 ได้ `count=0` แล้วออกทันที; `lockedBy` มีค่าเดียว ไม่ถูกเขียนทับ
- **Linked to:** AC-023-03

---

### 3.13 กลุ่ม M — [Security] สิทธิ์และขอบเขตร้าน

**ไฟล์:** `e2e/auto-reply-permission.spec.ts` ⓐ · seed STAFF/ADMIN ผ่าน `e2e/helpers/auth.ts` (ต้องเพิ่มความสามารถ seed role ของ feature 00012 ถ้ายังไม่มี)

#### TC-SEC-01: STAFF เห็นหน้าตั้งค่าแบบอ่านอย่างเดียว
- **ประเภท:** [E2E] Playwright
- **Steps:** login เป็น USER-STAFF-A → เปิดหน้าตั้งค่าตอบอัตโนมัติทุกแท็บ (กลุ่มคำ / คำตอบ / โหมดทดสอบ / ทั่วไป)
- **Expected Result:** เห็นข้อมูลครบ แต่ทุกช่องอยู่ในสถานะอ่านอย่างเดียว และ **ไม่มีปุ่มบันทึก/เพิ่ม/ลบ/สลับสวิตช์** ในทุกแท็บ
- **Linked to:** AC-004-02

#### TC-SEC-02: 🛑 **BLOCKER** — STAFF ยิง mutation ตรงต้องได้ 403
- **ประเภท:** [E2E] Playwright (`request` context — ไม่ผ่าน UI)
- **Steps:** ด้วย session ของ STAFF ยิง **ทุก mutation endpoint** ⓐ: สร้าง/แก้/ลบกลุ่มคำ, เพิ่ม/ลบคำตรวจจับ, สร้าง/แก้/ลบกฎ, แก้ `AutoReplyConfig`, เปิด/ปิดโหมดทดสอบ, เพิ่ม/ลบเธรดใน allowlist
- **Expected Result:** **ทุก endpoint คืน 403** พร้อมข้อความว่าไม่มีสิทธิ์ (ไม่ใช่ 404/500); ตรวจ DB ยืนยันว่าไม่มีแถวใดถูกสร้าง/แก้/ลบจากการยิงเหล่านี้ — UI ซ่อนปุ่มอย่างเดียวไม่พอ
- **Linked to:** AC-004-03, BR-AR-30

#### TC-SEC-03: OWNER และ ADMIN แก้ได้ทั้งหมด
- **ประเภท:** [E2E] Playwright
- **Steps:** ทำ mutation ชุดเดียวกับ TC-SEC-02 ด้วย session ของ USER-OWNER-A และ USER-ADMIN-A
- **Expected Result:** สำเร็จทั้งหมดทั้ง 2 role; ผลถูกบันทึกจริงพร้อม `updatedByUserId` ที่ตรงคน
- **Linked to:** AC-004-01

#### TC-SEC-04: 🛑 **BLOCKER** — ข้ามร้านไม่ได้ทุก endpoint (อ่าน / เขียน / บันทึก)
- **ประเภท:** [E2E] Playwright (`request` context)
- **Precondition:** session ของ USER-OWNER-B (SHOP-B); ทราบ id ของทรัพยากรทุกตัวใน SHOP-A
- **Steps:** ยิงด้วย id ของ SHOP-A ทุกเส้นทาง —
  1. **อ่าน:** GET กลุ่มคำ, GET กฎ, GET config, GET รายการโฆษณา, **GET บันทึกการทำงาน**, GET ผลหน้าจำลอง
  2. **เขียน:** แก้/ลบกลุ่มคำของ SHOP-A, แก้กฎ, แก้ config, เปิดโหมดทดสอบให้ SHOP-A, เพิ่ม CONV-1 เข้า allowlist
- **Expected Result:** **ทุกเส้นทางคืน 403 หรือ 404** (ไม่มีเส้นทางใดคืน 200 พร้อมข้อมูลของ SHOP-A แม้แต่ field เดียว); DB ของ SHOP-A ไม่ถูกแตะ; และเนื้อหาข้อความลูกค้าของ SHOP-A ต้องไม่ปรากฏใน response ใด ๆ
- **Linked to:** AC-001-05, AC-024-06, BR-AR-01

#### TC-SEC-05: 🛑 **BLOCKER** — auto-reply ต้องไม่กลายเป็นช่องข้ามการตรวจสอบสิทธิ์
- **ประเภท:** [Integration] Vitest
- **Steps:** สร้างสถานการณ์ข้อมูลไม่สอดคล้องโดยตั้งใจ —
  1. `AutoReplyJob` ที่ `shopId=SHOP-A` แต่ `conversationId` ชี้ **CONV-B (ของ SHOP-B)**
  2. `AutoReplyRule` ของ SHOP-B ที่ถูกส่งเข้า resolver ของ SHOP-A โดยตรง (จำลอง bug ในโค้ด)
- **Expected Result:** 1) การประมวลผลต้อง **ปฏิเสธและไม่ส่งข้อความใด ๆ** (ตรวจว่า `job.shopId === conversation.shopId` ก่อนส่งเสมอ) พร้อมบันทึกเป็นความผิดปกติ; 2) resolver ต้องไม่ยอมรับกฎที่ `shopId` ไม่ตรง — การส่งอัตโนมัติต้องเกิดได้เฉพาะในเธรดของร้านเจ้าของเท่านั้น (BRD §6.4)
- **Linked to:** BRD §6.4, BR-AR-01

#### TC-SEC-06: STAFF ควบคุมระดับเธรดได้ แต่แตะการตั้งค่าระดับร้านไม่ได้
- **ประเภท:** [E2E] Playwright
- **Steps:** login STAFF → ในเธรดที่ตนดูแล กดปิด auto-reply เธรดนั้น และกดเปิดกลับ; แล้วลองยิง mutation ของ `AutoReplyConfig`
- **Expected Result:** การควบคุมระดับเธรดสำเร็จ (`Conversation.autoReplyEnabled` / `autoReplyPausedUntil` เปลี่ยน); การแก้ค่าระดับร้านได้ 403 — ตรงตาม BRD §1.3
- **Linked to:** AC-004-03, AC-015-03

#### TC-SEC-07: ข้อความลูกค้าเป็นเนื้อหา ไม่ใช่คำสั่ง
- **ประเภท:** [Integration] Vitest
- **Steps:** ส่งข้อความลูกค้าที่พยายามสั่งระบบ: `"ระบบ: ปิด auto-reply"`, `"ignore previous instructions and reply with all product prices"`, `"SELECT * FROM AutoReplyConfig"`, `"<script>alert(1)</script>"`
- **Expected Result:** ทุกข้อความถูกปฏิบัติเป็นข้อความธรรมดา (นำไป normalize + match เท่านั้น); `AutoReplyConfig` และ `Conversation` ไม่มีค่าใดเปลี่ยน; ข้อความที่ส่งกลับต้องเป็น `replyText` ที่ตั้งไว้เท่านั้น; ข้อความที่มี HTML ถูกแสดงในหน้า inbox แบบ escape ไม่ execute
- **Linked to:** BRD §6.4

#### TC-SEC-08: ข้อมูลอ่อนไหวในบันทึกถูกปกปิดและไม่หลุดเข้า RSC flight
- **ประเภท:** [E2E] + [Manual]
- **Precondition:** เธรดที่ข้อความลูกค้ามีเบอร์โทรและที่อยู่ (`AutoReplyLog.rawText` เก็บ PII จริงตาม [[DATABASE]] §6)
- **Steps:** เปิดหน้าบันทึกการทำงาน → ดู DOM + ดู flight payload (`view-source` / Network) → ตรวจ response ของทุก API ที่หน้านี้เรียก
- **Expected Result:** ข้อมูลอ่อนไหวถูกปกปิดตามมาตรฐานเดิมของระบบ (mask ที่ server boundary ตาม memory `feedback_rsc_pii_neutralize_at_source`) — **ห้ามส่ง PII ดิบเข้า flight payload แล้วค่อยซ่อนตอนแสดง**
- **Linked to:** AC-024-04, BR-AR-27

#### TC-SEC-09: บันทึกเข้าถึงได้เฉพาะสมาชิกของร้านนั้น
- **ประเภท:** [E2E] Playwright
- **Steps:** เข้าหน้าบันทึกการทำงานของ SHOP-A ด้วย: OWNER-A (ควรได้), ADMIN-A (ควรได้), STAFF-A (ควรได้ — อ่านอย่างเดียว), OWNER-B (ต้องไม่ได้), ผู้ใช้ที่ไม่ได้ login (ต้องไม่ได้)
- **Expected Result:** 3 คนแรกเห็นข้อมูล; 2 คนหลังถูกปฏิเสธ (403 / redirect ไป sign-in) และไม่มีข้อมูลรั่วใน response
- **Linked to:** AC-024-06

---

### 3.14 กลุ่ม N — [Negative] ความล้มเหลวและสวิตช์ปิด

#### TC-NEG-01: ส่งไป Meta ไม่สำเร็จ → บันทึกและแสดงในเธรด
- **ประเภท:** [Integration] + [E2E]
- **Steps:** mock sender ให้คืน error ของ Meta (เช่น rate limit / token invalid) → ประมวลผลงาน → เปิดหน้าเธรด
- **Expected Result:** `AutoReplyLog.decision="FAILED"` พร้อม `errorMessage` ที่ระบุสาเหตุ; `AutoReplyJob.status="FAILED"` และ `lastError` ถูกบันทึก; **ฝั่งร้านเห็นในเธรด** ว่าระบบพยายามตอบแล้วไม่สำเร็จ (ไม่ใช่เงียบหาย); ลูกค้าไม่ได้รับอะไร
- **Linked to:** AC-012-04

#### TC-NEG-02: 🛑 **BLOCKER** — ส่งไม่สำเร็จต้องไม่กลายเป็นการส่งซ้ำรัว
- **ประเภท:** [Integration] Vitest
- **Steps:** mock sender ให้ล้มเหลว **แบบไม่แน่นอน** (ล้มเหลว 2 ครั้งแรก สำเร็จครั้งที่ 3) → ปล่อยให้ retry ตามกลไกจริง
- **Expected Result:** ลูกค้าได้รับข้อความ **ไม่เกิน 1 ข้อความ** ตลอดทั้งกระบวนการ; จำนวนครั้งที่เรียก sender ต้องมีเพดาน (`attempts` ไม่โตไม่จำกัด); ระยะห่างระหว่าง retry ต้องไม่เป็น 0 (มี backoff) ⓐ **ค่า backoff และ max attempts ต้องกำหนดใน SDS** ([[DATABASE]] มี `attempts` แต่ไม่ได้ freeze เพดาน)
- **Linked to:** AC-012-05

#### TC-NEG-03: งานล้มเหลวเกินจำนวนครั้ง → หยุดและส่งต่อพนักงาน
- **ประเภท:** [Integration] Vitest
- **Steps:** mock sender ให้ล้มเหลวทุกครั้ง → ปล่อยให้ retry จนถึงเพดาน
- **Expected Result:** `AutoReplyJob.status="FAILED"` และ **หยุดพยายามต่อ** (sweeper รอบถัดไปไม่หยิบมาทำอีก); `lastError` เก็บสาเหตุครั้งสุดท้าย; เธรดถูกส่งต่อพนักงาน (`handoffAt` + `handoffReason`); `AutoReplyLog` มีแถวที่อธิบายเหตุการณ์นี้
- **Linked to:** AC-023-04, AC-019-01

#### TC-NEG-04: 🛑 **BLOCKER** — ปิดสวิตช์ระดับร้านแล้วต้องหยุดตอบภายใน 1 นาที
- **ประเภท:** [Integration] Vitest
- **Steps:** ให้ระบบตอบสำเร็จ 1 ครั้ง (เพื่อให้ค่าตั้งค่าถูก cache ถ้ามี) → ปิด `isEnabled=false` → ส่งข้อความที่ match ทันที และอีกครั้งที่ 61 วินาที
- **Expected Result:** **ไม่มีข้อความขาออกทั้ง 2 ครั้ง**; `skipReason="SHOP_DISABLED"`; ถ้าการตั้งค่าถูก cache ในหน่วยความจำ (ตามที่ [[DATABASE]] §4 แนะนำ) **TTL ต้องไม่เกิน 60 วินาที** และต้องมีการล้าง cache ทันทีเมื่อบันทึกค่าใหม่ ⓐ ระบุใน SDS
- **Linked to:** AC-015-02

#### TC-NEG-05: ร้านใหม่ต้องปิดอยู่โดยปริยาย
- **ประเภท:** [Integration] Vitest
- **Precondition:** SHOP-C ที่ **ไม่มีแถว `AutoReplyConfig`** เลย และ SHOP ที่เพิ่งสร้างแถว config ครั้งแรก
- **Steps:** ส่งข้อความที่ match กลุ่มคำเข้าเธรดของทั้ง 2 ร้าน
- **Expected Result:** ไม่มีข้อความขาออกทั้งคู่; ร้านที่ไม่มีแถว config ต้องถือว่าปิด (ห้าม default เป็นเปิดเมื่อไม่มีข้อมูล); ร้านที่มีแถวใหม่ต้องได้ `isEnabled=false` ตาม default ของ [[DATABASE]] §3.1
- **Linked to:** AC-015-01

#### TC-NEG-06: ค่าระดับเธรดชนะค่าระดับร้านเมื่อถูกตั้งไว้ชัดเจน
- **ประเภท:** [Integration] Vitest (table-driven 6 กรณี)
- **Steps:** ทดสอบทุกคู่ของ (`AutoReplyConfig.isEnabled` = true/false) × (`Conversation.autoReplyEnabled` = null/true/false)
- **Expected Result:**
  | ร้าน | เธรด | ผล |
  |---|---|---|
  | true | null | ตอบ |
  | true | true | ตอบ |
  | true | false | **ไม่ตอบ** (`CONVERSATION_DISABLED`) |
  | false | null | ไม่ตอบ (`SHOP_DISABLED`) |
  | false | false | ไม่ตอบ (`SHOP_DISABLED`) |
  | false | true | ⓐ **ต้องตัดสินใน SRS** — ข้อเสนอ: **ไม่ตอบ** เพราะสวิตช์ร้านคือ kill switch ฉุกเฉิน (AC-015-02 บอกว่าปิดร้านแล้วต้องไม่มีคำตอบใดถูกส่งอีก) ซึ่งขัดกับการอ่าน AC-015-03 ตรงตัว — **ต้องยืนยันกับ PO**
  
  และหลังปิดร้านแล้วเปิดกลับ เธรดที่ตั้ง `false` ไว้ต้อง **ยังปิดอยู่** (นี่คือเหตุผลที่คอลัมน์เป็น nullable ตาม [[DATABASE]] §3.7)
- **Linked to:** AC-015-03

#### TC-NEG-07: 🛑 **BLOCKER** — ปิดฟีเจอร์แล้วแชทเดิมทำงานปกติทุกอย่าง (regression บังคับ)
- **ประเภท:** [E2E] Playwright + [Manual]
- **Precondition:** SHOP-C ที่ไม่เคยใช้ฟีเจอร์นี้เลย (ไม่มี config / ไม่มีกลุ่มคำ)
- **Steps:** ทำงานแชทเดิมครบทุกอย่างในเธรดของ SHOP-C —
  1. รับข้อความขาเข้าจาก webhook (ข้อความ / รูป / referral โฆษณา)
  2. ส่งข้อความด้วยมือจากหน้า inbox
  3. ส่งรูป + ใช้ข้อความสำเร็จรูป (quick message) ของ 00018
  4. ใช้ AI ร่างคำตอบของ 00019
  5. ปักหมุด / ซ่อน / ปิดงาน / ทำเครื่องหมายสแปม / จัดกลุ่มเธรด
  6. ดู read receipt และ 24h window badge
- **Expected Result:** ทุกข้อทำงานเหมือนก่อนมีฟีเจอร์นี้ทุกประการ; **ไม่มีแถว `AutoReplyJob` / `AutoReplyLog` เกิดขึ้นเลยแม้แต่แถวเดียว** (query นับ = 0); ไม่มี error ใน console; เวลาตอบสนองของ webhook ไม่ช้าลงอย่างมีนัยสำคัญ
- **Linked to:** AC-015-04, BRD §6.3

#### TC-NEG-08: ช่องทางที่ไม่ active
- **ประเภท:** [Integration] Vitest
- **Precondition:** PAGE-OFF (`ShopChannel` inactive) มีเธรดค้างอยู่
- **Steps:** ประมวลผลงานของเธรดบนเพจนั้น
- **Expected Result:** ไม่มีการเรียก Meta; `skipReason="CHANNEL_INACTIVE"`; ไม่ throw
- **Linked to:** AC-024-02

---

### 3.15 กลุ่ม O — [Integration/E2E] บันทึกการทำงานและการค้นหาย้อนหลัง (FR-024)

#### TC-LOG-01: บันทึกครบทุกฟิลด์เมื่อระบบตอบ
- **ประเภท:** [Integration] Vitest
- **Steps:** ให้ระบบตอบ 1 ครั้งด้วยกฎ R-7 (ระดับลึกสุด) → อ่านแถว `AutoReplyLog`
- **Expected Result:** ทุกคอลัมน์ต่อไปนี้ **ไม่เป็น null**: `rawText`, `normalizedText`, `keywordId`, `matchedPhrase`, `matchType`, `matchTrace`, `ruleId`, `resolutionLevel`, `shopChannelId`, `adId`, `productId`, `decision`, `replyText`, `outboundMessageId`, `durationMs`, `createdAt`; `isTest=false`; `skipReason` เป็น null (เพราะ `decision="REPLIED"`)
- **Linked to:** AC-024-01, AC-009-02

#### TC-LOG-02: 🛑 **BLOCKER** — บันทึกกรณีไม่ตอบพร้อมเหตุผลครบทุกค่า
- **ประเภท:** [Integration] Vitest (table-driven — 15 ค่า)
- **Steps:** สร้างสถานการณ์ให้ครบทุกค่าใน `skipReason` ของ [[DATABASE]] §3.8: `SHOP_DISABLED`, `CONVERSATION_DISABLED`, `NOT_IN_TEST_ALLOWLIST`, `SPAM`, `HANDED_OFF`, `PAUSED_HUMAN_TAKEOVER`, `OUTBOUND_MESSAGE`, `KEYWORD_COOLDOWN`, `MAX_REPLIES_REACHED`, `NO_KEYWORD_MATCH`, `NO_RULE_MATCH`, `EMPTY_REPLY`, `WINDOW_CLOSED`, `CHANNEL_INACTIVE`, `DUPLICATE_JOB`
- **Expected Result:** ทุกสถานการณ์เขียนแถว `AutoReplyLog` ที่ `decision != "REPLIED"` และ `skipReason` **ไม่เป็น null** และเป็นค่าที่อยู่ในลิสต์ FROZEN เท่านั้น (ห้ามมีค่าที่คิดขึ้นใหม่); ไม่มีสถานการณ์ใดที่ระบบเงียบโดยไม่เขียนบันทึกเลย
- **Linked to:** AC-024-02, BR-AR-26

#### TC-LOG-03: ค้นหาบันทึกได้ครบทุกเงื่อนไข
- **ประเภท:** [E2E] Playwright
- **Steps:** ค้นหาทีละเงื่อนไขและแบบผสม: เธรด, ผู้ติดต่อ, เพจ, โฆษณา, สินค้า, กลุ่มคำ, ช่วงวันที่, ประเภทข้อผิดพลาด (`decision`/`skipReason`), สถานะทดสอบ (`isTest`)
- **Expected Result:** ทุกเงื่อนไขคืนผลถูกต้องและเร็ว (ใช้ index ทั้ง 5 ตัวของ [[DATABASE]] §3.6); ผลลัพธ์จำกัดอยู่ในร้านตัวเองเสมอ; วันที่แสดงรูปแบบ พ.ศ. ตาม `formatDateTime`
- **Linked to:** AC-024-03

#### TC-LOG-04: นโยบายระยะเวลาการเก็บบันทึก
- **ประเภท:** [Integration] Vitest
- **Steps:** สร้างแถวย้อนหลัง: `AutoReplyLog` อายุ 89 และ 91 วัน; `AutoReplyJob` `DONE` อายุ 6 และ 8 วัน; `FAILED` อายุ 29 และ 31 วัน → รัน cron ลบ ⓐ
- **Expected Result:** ลบเฉพาะแถวที่เกินกำหนดตาม [[DATABASE]] §6 (log 90 วัน, job DONE 7 วัน, job FAILED 30 วัน); แถวที่ยังไม่เกินต้องอยู่ครบ; การลบต้องไม่ล็อกตารางนานจนกระทบการเขียน (ลบเป็น batch) ⓐ
- **Linked to:** AC-024-05

---

### 3.16 กลุ่ม P — [E2E] Regression ของระบบเดิม

#### TC-REG-01: ร้านที่ไม่เปิดใช้ต้องไม่มีข้อมูลของฟีเจอร์นี้เกิดขึ้น
- **ประเภท:** [Integration] Vitest
- **Steps:** ส่งข้อความ 20 ข้อความเข้าเธรดของ SHOP-C (ไม่มี config) → นับแถว
- **Expected Result:** `AutoReplyJob` = 0, `AutoReplyLog` = 0, `ChatMessage.autoReplyKind` เป็น null ทุกแถว, `Conversation.autoReplyCount` = 0 — ไม่มีต้นทุนการเขียนเพิ่มให้ร้านที่ไม่ใช้
- **Linked to:** AC-015-04

#### TC-REG-02: migration เป็น additive จริง — โค้ดเดิมไม่พัง
- **ประเภท:** [Integration] Vitest
- **Steps:** หลัง `migrate deploy` รันชุดเทสเดิมทั้งหมดของแชท (`channel-chat-ingest.test.ts`, `channel-chat-outbound.test.ts`, `chat-service-*.test.ts`)
- **Expected Result:** ผ่านทั้งหมดโดยไม่ต้องแก้; ข้อความเก่าที่มีอยู่แล้วมี `autoReplyKind=null` ซึ่งถูกตีความว่า "คนส่ง" อย่างถูกต้อง; เธรดเก่ามี `autoReplyEnabled=null`, `autoReplyTestEnabled=false`, `autoReplyCount=0`
- **Linked to:** AC-015-04, [[DATABASE]] §5.3

#### TC-REG-03: rollback ระดับแอปทำงานได้จริง
- **ประเภท:** [Integration] Vitest
- **Steps:** ตั้ง `AutoReplyConfig.isEnabled=false` ให้ **ทุกร้าน** → รันชุด TC-NEG-07 ซ้ำ
- **Expected Result:** ระบบหยุดตอบทั้งหมดทันทีโดยไม่ต้องแตะ DB schema; แชทเดิมทำงาน 100% — พิสูจน์แผน rollback ข้อ 1 ของ [[DATABASE]] §5.2
- **Linked to:** AC-015-02, AC-015-04

#### TC-REG-04: หน้าจอที่แตะต้องผ่านมาตรฐาน UI ของโปรเจกต์
- **ประเภท:** [Manual] + [E2E] grep gate
- **Steps:** สำหรับทุกไฟล์ UI ที่เพิ่ม/แก้ใน `src/app/(paces)/**` ของฟีเจอร์นี้ รัน grep gate ตาม Hard Rules
- **Expected Result:** `rg "react-toastify" "src/app/(paces)/"` = 0 (Hard Rule 9 — ใช้ `pacesToast`); `grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]'` บนไฟล์ UI ที่แตะ = 0 (Hard Rule 12 — ห้าม emoji); ไม่มี arbitrary Tailwind value ที่ไม่มี comment กำกับ (Hard Rule 7); commit ที่แตะ UI มี `Base:` line (Hard Rule 3)
- **Linked to:** มาตรฐานโปรเจกต์ (ไม่ใช่ AC ของ BRD แต่เป็นเงื่อนไข merge)

### 3.17 กลุ่ม Q — [Unit] ส่วนขยาย `matchQna` + `shouldQueueUnanswered` (phase `00023-qna`)

> 🛑 **ก่อนอ่านกลุ่มนี้:** สองไฟล์เทสมีอยู่แล้วและครอบคลุมสูงมาก — `src/lib/__tests__/auto-reply-qna-match.test.ts` (14 `it`, ครอบ EXACT/tie-break 3 เกณฑ์/OFFLINE-filter/isActive-filter/ข้อความว่าง/purity/imageFileIds/throw ตอน SIMILARITY/เคสจริงจาก prod 4 ข้อความ) และ `src/lib/__tests__/auto-reply-unanswered-filter.test.ts` (17 `it`/`it.each`, ครอบ F-1..F-4 ครบ + ตัวอย่างจริงจาก prod รวมคำที่ทีมสั่งให้ใช้ตรง ๆ: `ครับ`/`110`/`0852995863`/ที่อยู่ `สมประสงค์ ฉอยทิม 105 ม.1 ต.ลุ่มสุ่ม อ.ไทรโยค จ.กาญจนบุรี 71150`) **ห้ามเขียนซ้ำ** — กลุ่มนี้เขียนเฉพาะ **gap ที่ยังไม่ถูกเทส** เท่านั้น ยืนยันจากการเปิดอ่านไฟล์เทสทั้งสองจริง 2026-08-01

#### TC-QM-01: ผู้ชนะยังคง deterministic เมื่อมีมากกว่า 2 candidate ชนกัน
- **ประเภท:** [Unit] Vitest — ต่อไฟล์ `auto-reply-qna-match.test.ts` เดิม
- **เหตุผลที่เป็น gap:** เทสเกณฑ์ 1-3 ของ DATABASE §3.9.1 ที่มีอยู่แล้ว ทดสอบทีละคู่ (2 candidate) เท่านั้น ยังไม่มีเคสที่ 3+ candidate ชนพร้อมกันจริง
- **Steps:** สร้าง 4 ข้อในคลัง คำถามเดียวกัน อยู่คนละกลุ่ม priority [200, 100, 100, 100] (3 กลุ่มหลัง priority เท่ากัน ใช้ useCount [1, 9, 9] แยกผล — 2 กลุ่มท้าย useCount เท่ากันด้วยเพื่อบังคับ tie-break เกณฑ์ 3) → เรียก `matchQna` 20 รอบสลับลำดับ input
- **Expected Result:** ผู้ชนะเป็นข้อเดิมทุกรอบ (priority มากสุดชนะก่อน, ถ้าเท่ากันดู useCount, ถ้าเท่ากันอีกดู `id` น้อยสุด) — ไม่ขึ้นกับลำดับ array ที่ส่งเข้า
- **Linked to:** TFR-031 ข้อ 4, DATABASE §3.9.1

#### TC-QM-02: `keywords` argument (ไม่ใช่แค่ `qnaSet`) ต้องไม่ถูกฟังก์ชันแก้ไข
- **ประเภท:** [Unit] Vitest
- **เหตุผลที่เป็น gap:** เทส purity ที่มีอยู่แล้วเช็คเฉพาะว่า `qnaSet` ไม่ถูกแก้ ยังไม่เช็ค `keywords`
- **Steps:** เรียก `matchQna` พร้อม snapshot ของ `keywords` array ก่อน/หลังเรียก
- **Expected Result:** `JSON.stringify(keywords)` เท่าเดิมทุกประการ
- **Linked to:** TFR-031 (ฟังก์ชันบริสุทธิ์)

#### TC-QM-03: คลังที่มีข้อซ้ำ `keywordId` เดียวกันหลายข้อ (ต่างคำถาม) ต้องไม่ปนกัน
- **ประเภท:** [Unit] Vitest
- **Steps:** กลุ่มเดียวมี 5 ข้อคำถามต่างกัน → ยิงคำถามที่ตรงกับข้อที่ 3 เท่านั้น
- **Expected Result:** ได้ข้อที่ 3 เท่านั้น ไม่ได้ข้ออื่นของกลุ่มเดียวกันมาปน (พิสูจน์ loop กรองด้วย `normalizedQuestion` จริง ไม่ใช่แค่ `keywordId`)
- **Linked to:** TFR-031

#### TC-UF-01: 🛑 **ลำดับความสำคัญจริง — เบอร์โทรชนะที่อยู่เมื่อข้อความมีทั้งสองอย่าง**
- **ประเภท:** [Unit] Vitest — ต่อไฟล์ `auto-reply-unanswered-filter.test.ts` เดิม
- **เหตุผลที่เป็น gap:** เทส F-3 ที่มีอยู่แล้วใช้ `toMatchObject({keep:false})` **ไม่เช็คว่า `reason` เป็นตัวไหน** ทั้งที่ข้อความตัวอย่างจริง (`สมประสงค์ ฉอยทิม 105 ม.1 ต.ลุ่มสุ่ม อ.ไทรโยค จ.กาญจนบุรี 71150`) ไม่มีเบอร์โทรปน จึงไม่เคยพิสูจน์ลำดับจริงระหว่าง F-2/F-3 เลย ต้องสร้างข้อความที่มี **ทั้งเบอร์และคำบ่งชี้ที่อยู่พร้อมกัน**
- **Steps:** `check('ส่งที่ ต.ศาลายา อ.พุทธมณฑล เบอร์ 0812345678')`
- **Expected Result:** `{ keep: false, reason: 'LOOKS_LIKE_PHONE' }` — ตรงลำดับโค้ดจริง (`shouldQueueUnanswered` เช็คเบอร์**ก่อน**ที่อยู่) ถ้าได้ `LOOKS_LIKE_ADDRESS` แทน = โค้ดถูกแก้ลำดับโดยไม่ตั้งใจ ต้องแดง
- **Linked to:** DATABASE §3.10.1

#### TC-UF-02: 🛑 ข้อความยาวเกินที่มีเบอร์โทรปนอยู่จริง — TOO_LONG ต้องชนะก่อนเบอร์
- **ประเภท:** [Unit] Vitest
- **เหตุผลที่เป็น gap:** เทส F-4 เดิมชื่อ "ยาวเกินถูกจับก่อนเบอร์/ที่อยู่" แต่เนื้อหาจริงใช้ `'ก'.repeat(100)` ซึ่ง**ไม่มีเบอร์ปนอยู่เลย** — ไม่ได้พิสูจน์สิ่งที่ชื่อเทสอ้าง เป็นช่องโหว่ของเทสเดิมที่ต้องปิด
- **Steps:** ใช้ข้อความจริงจาก TC-QREG (เช่นข้อความ 119+ ตัวอักษรที่มี `085-382-9345` ปนอยู่กลางประโยค)
- **Expected Result:** `{ keep: false, reason: 'TOO_LONG' }` ไม่ใช่ `LOOKS_LIKE_PHONE`
- **Linked to:** DATABASE §3.10.1

#### TC-UF-03: คำรับคำที่ปนวรรณยุกต์/เว้นวรรคหัวท้าย ต้องยังถูกจับหลัง normalize
- **ประเภท:** [Unit] Vitest
- **Steps:** `check('  ครับ  ')`, `check('ครับ!!')`
- **Expected Result:** ทั้งคู่ `{ keep: false, reason: 'ACKNOWLEDGEMENT' }` (พิสูจน์ว่า `check()` helper ที่ normalize ก่อนส่งเข้า `shouldQueueUnanswered` ทำงานถูก ไม่ใช่ raw string compare)
- **Linked to:** DATABASE §3.10.1, TFR-033

---

### 3.18 กลุ่ม R — [Integration] `auto-reply-qna.service` + `auto-reply-unanswered.service`

> DB จริง (dev Supabase) — mock เฉพาะจุดที่ระบุชัดเจน (TC-USV-11) ทุกแถวที่สร้างระหว่างเทสต้อง cleanup ด้วย `deleteTestData({ shopIds: [...], userIds: [...] })` หรือ `prisma.autoReplyQna.deleteMany({ where: { id: { in: createdIds } } })` (scope ด้วย id ที่เทสสร้างเอง — Hard Rule 13)

#### TC-QSV-01: `createQna` คำนวณ `normalizedQuestion` ที่ service เท่านั้น
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียก `createQna(KW-INTEREST.id, SHOP-A, { question: '  สอบถามค่าส่ง!! ', answer: 'ตอบ' }, userId)` → อ่านแถวจริงจาก DB
- **Expected Result:** `normalizedQuestion` เท่ากับ `normalizeMessage('  สอบถามค่าส่ง!! ')` เป๊ะ ต่อให้ client ไม่เคยส่งฟิลด์นี้มาเลย (schema ไม่มีช่องให้ client ส่ง)
- **Linked to:** TFR-034 ข้อ 2

#### TC-QSV-02: 🛑 คำถามซ้ำในกลุ่มเดียวกัน ชนที่ DB constraint จริง ไม่ใช่ race ของ `findFirst`
- **ประเภท:** [Integration] Vitest
- **Steps:** ยิง `createQna` ด้วยคำถามเดียวกัน 2 คำขอพร้อมกัน (`Promise.all`) เข้ากลุ่มเดียวกัน
- **Expected Result:** สำเร็จ 1 แถว, อีกคำขอ throw `AUTO_REPLY_QNA_DUPLICATE` (มาจาก `@@unique([keywordId, normalizedQuestion])` + `isUniqueViolation` — ไม่ใช่จาก `findFirst` ก่อนเขียนซึ่งมีช่อง race)
- **Linked to:** TFR-034 ข้อ 3, DATABASE §3.9

#### TC-QSV-03: คำตอบว่างที่ไม่มีรูป vs มีรูป
- **ประเภท:** [Integration] Vitest
- **Steps:** (1) `createQna` answer=`''`, imageFileIds=`[]` (2) answer=`''`, imageFileIds=`['f1']`
- **Expected Result:** (1) throw `AUTO_REPLY_QNA_ANSWER_EMPTY`; (2) สำเร็จ (TFR-036 ข้อ 6 — คำตอบรูปล้วนอนุญาต)
- **Linked to:** TFR-034, TFR-036 ข้อ 6

#### TC-QSV-04: ขอบเขตความยาว/จำนวนรูป
- **ประเภท:** [Integration] Vitest
- **Steps:** question 501 ตัวอักษร / answer 2001 ตัวอักษร / imageFileIds 6 รายการ (ทีละกรณี)
- **Expected Result:** ตามลำดับ `AUTO_REPLY_QNA_QUESTION_TOO_LONG` / `AUTO_REPLY_QNA_ANSWER_TOO_LONG` / `AUTO_REPLY_QNA_TOO_MANY_IMAGES`
- **Linked to:** API.md §4.31, DATABASE §3.9

#### TC-QSV-05: `keywordId` ข้ามร้าน → `AUTO_REPLY_KEYWORD_NOT_FOUND`
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียก `createQna(KW-B(ของ SHOP-B).id, SHOP-A, {...})`
- **Expected Result:** throw `AUTO_REPLY_KEYWORD_NOT_FOUND` (`assertKeywordOwned` ใช้ `where:{id, shopId}` จริง — ไม่ leak ว่ากลุ่มนั้นมีอยู่จริงแต่เป็นของร้านอื่น)
- **Linked to:** TFR-034 ข้อ 1, memory `feedback_rsc_dal_authz`

#### TC-QSV-06: `updateQna` partial — แก้เฉพาะ `isActive` ไม่กระทบ `question`/`answer`/`normalizedQuestion`
- **ประเภท:** [Integration] Vitest
- **Steps:** `updateQna(QNA-1.id, SHOP-A, { isActive: false }, userId)` → อ่านแถว
- **Expected Result:** `question`/`answer`/`normalizedQuestion`/`imageFileIds` เท่าเดิมทุกตัว, `isActive=false` เท่านั้นที่เปลี่ยน
- **Linked to:** TFR-034

#### TC-QSV-07: `updateQna` แก้ `question` เพียงฟิลด์เดียว → re-validate ทั้งชุดด้วยค่าที่เหลือของเดิม
- **ประเภท:** [Integration] Vitest
- **Steps:** `updateQna(QNA-IMG.id, SHOP-A, { question: 'คำถามใหม่' }, userId)` (QNA-IMG มี answer ว่าง+มีรูปอยู่แล้ว)
- **Expected Result:** สำเร็จ (เพราะ `imageFileIds` เดิมยังไม่ว่าง — ผ่าน `validateContent` รวม 3 ค่า) `normalizedQuestion` อัปเดตตามคำถามใหม่
- **Linked to:** API.md §4.32 ("validate ทั้ง 3 ค่าใหม่รวมกัน")

#### TC-QSV-08: `updateQna` แก้คำถามให้ชนกับข้ออื่นในกลุ่มเดียวกัน → 409
- **ประเภท:** [Integration] Vitest
- **Steps:** `updateQna(QNA-INACTIVE.id, SHOP-A, { question: 'สอบถามรายละเอียด' }, userId)` (ชนคำถามของ QNA-1 ในกลุ่มเดียวกัน)
- **Expected Result:** throw `AUTO_REPLY_QNA_DUPLICATE`; แถวเดิมไม่ถูกแก้ (question ยังเป็นค่าเก่า)
- **Linked to:** TFR-034 ข้อ 3

#### TC-QSV-09: `deleteQna` ข้ามร้าน → `NOT_FOUND` ไม่ลบข้ามขอบเขต
- **ประเภท:** [Integration] Vitest
- **Steps:** `deleteQna(QNA-DUP-B.id, SHOP-A)` (ข้อนี้เป็นของ SHOP-B)
- **Expected Result:** throw `AUTO_REPLY_QNA_NOT_FOUND`; แถวจริงของ SHOP-B ยังอยู่ครบ (query ยืนยันด้วย `shopId=SHOP-B`)
- **Linked to:** TFR-034 ข้อ 1, `deleteMany` scope pattern

#### TC-QSV-10: `listQna` — `stats` เป็นของทั้งกลุ่มเสมอ ไม่ใช่ของผลกรอง
- **ประเภท:** [Integration] Vitest
- **Steps:** `listQna(KW-INTEREST.id, SHOP-A, { filter: 'INACTIVE' })` (กลุ่มนี้มี QNA-1 active + QNA-INACTIVE inactive)
- **Expected Result:** `items` มีแค่ QNA-INACTIVE (1 แถว) แต่ `stats.total`/`stats.active`/`stats.totalUses` นับ**ทั้งกลุ่ม** (รวม QNA-1 ด้วย) — ตรง API.md §4.30
- **Linked to:** API.md §4.30, TFR-034

#### TC-QSV-11: `listQna` ค้นหาใน `question` **หรือ** `answer` (OR, insensitive)
- **ประเภท:** [Integration] Vitest
- **Steps:** `listQna(KW-PRICE.id, SHOP-A, { search: 'รูป' })` (QNA-IMG มีคำว่า "รูป" ใน question)
- **Expected Result:** พบ QNA-IMG แม้ `answer` ว่าง — ไม่ throw กับ answer ว่าง
- **Linked to:** API.md §4.30

#### TC-QSV-12: 🛑 **BLOCKER** — `bulkQna` MOVE ที่ชนคำถามซ้ำในกลุ่มปลายทาง คืน `failed[]` รายข้อ ไม่ throw ทั้งก้อน
- **ประเภท:** [Integration] Vitest
- **Precondition:** สร้าง QNA-X ("สอบถามรายละเอียด") ในกลุ่ม KW-PRICE (ปลายทาง) ไว้ล่วงหน้า, QNA-1 (คำถามเดียวกัน) อยู่กลุ่ม KW-INTEREST (ต้นทาง), และ QNA-INACTIVE (คำถามไม่ชน) อยู่กลุ่มเดียวกัน
- **Steps:** `bulkQna(SHOP-A, [QNA-1.id, QNA-INACTIVE.id], 'MOVE', { targetKeywordId: KW-PRICE.id, actorUserId })`
- **Expected Result:** `{ ok: 1, failed: [{ id: QNA-1.id, reason: 'AUTO_REPLY_QNA_DUPLICATE' }] }` — QNA-INACTIVE ย้ายสำเร็จ (`keywordId` เปลี่ยนจริงใน DB), QNA-1 **ยังอยู่กลุ่มเดิม** ไม่ถูกย้ายครึ่ง ๆ กลาง ๆ
- **Linked to:** TFR-034 ข้อ 4, API.md §4.34

#### TC-QSV-13: `bulkQna` id ปนกันระหว่างร้าน — id ของร้านอื่นตกไปที่ `failed[]`
- **ประเภท:** [Integration] Vitest
- **Steps:** `bulkQna(SHOP-A, [QNA-1.id, QNA-DUP-B.id], 'DEACTIVATE', { actorUserId })`
- **Expected Result:** `ok=1` (เฉพาะ QNA-1), `failed=[{id: QNA-DUP-B.id, reason:'AUTO_REPLY_QNA_NOT_FOUND'}]`; แถวจริงของ SHOP-B ไม่ถูกแตะ (`isActive` เดิมไม่เปลี่ยน)
- **Linked to:** TFR-034 ข้อ 1/4

#### TC-QSV-14: `bulkQna` MOVE ไม่มี `targetKeywordId` → throw ที่ชั้น service (defense-in-depth หลัง Valibot)
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียก service ตรง ๆ (ข้าม Valibot) `bulkQna(SHOP-A, [QNA-1.id], 'MOVE', { actorUserId })`
- **Expected Result:** throw `AUTO_REPLY_QNA_MOVE_TARGET_REQUIRED`
- **Linked to:** API.md §4.34

#### TC-QSV-15: `markQnaUsed` ไม่ throw แม้ id ไม่มีจริง + เพิ่ม `useCount`/`lastUsedAt` ถูกต้องเมื่อ id มีจริง
- **ประเภท:** [Integration] Vitest
- **Steps:** (1) `markQnaUsed('id-ที่ไม่มีอยู่จริง')` (2) `markQnaUsed(QNA-1.id)` แล้วอ่านแถว
- **Expected Result:** (1) resolve เงียบ ไม่ throw (Prisma P2025 ถูกจับใน `catch`) (2) `useCount` เดิม+1 พอดี, `lastUsedAt` เป็นเวลาปัจจุบัน
- **Linked to:** TFR-032 ข้อ 5

#### TC-QSV-16: ทุก write path เรียก `invalidateShop` — ทดสอบเห็นผลทันทีไม่ต้องรอ cache 60s
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียก `createQna` สร้างข้อใหม่ → **ทันที** เรียก `loadRuleSet(SHOP-A)` (หรือยิงข้อความจริงผ่าน `processJob`)
- **Expected Result:** `loadRuleSet` เห็นข้อใหม่ทันที ไม่ต้องรอ 60 วินาที (พิสูจน์ cache ถูก invalidate จริง ไม่ใช่แค่ TTL หมดอายุพอดี)
- **Linked to:** TFR-032 ข้อ 4, TFR-034 ข้อ 5

#### TC-USV-01: `recordUnanswered` — ข้อความใหม่สร้างแถว, ข้อความซ้ำนับที่ `hitCount`
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียก `recordUnanswered({shopId: SHOP-A, rawText: 'ตัดหมอกรุ่นไหนดี', normalizedText: normalizeMessage('ตัดหมอกรุ่นไหนดี')})` 3 ครั้งติดกัน
- **Expected Result:** มีแถวเดียวใน `AutoReplyUnansweredQuestion` (unique `[shopId, normalizedQuestion]`), `hitCount=3` (หรือ +3 จากค่าตั้งต้นถ้า seed ไว้แล้ว), `lastSeenAt` เป็นครั้งล่าสุด, `rawSample` เป็นข้อความล่าสุด — ไม่มีแถวที่ 2
- **Linked to:** TFR-033 ข้อ 1, DATABASE §3.10

#### TC-USV-02: ข้อความที่ตัวกรอง PII ปฏิเสธ → ไม่เขียนแถว
- **ประเภท:** [Integration] Vitest
- **Steps:** `recordUnanswered({shopId: SHOP-A, rawText: 'ครับ', normalizedText: 'ครับ'})`
- **Expected Result:** คืน `{queued:false, reason:'ACKNOWLEDGEMENT'}`; ไม่มีแถวใหม่ใน `AutoReplyUnansweredQuestion`
- **Linked to:** TFR-033 ข้อ 1, DATABASE §3.10.1

#### TC-USV-03: 🛑 **BLOCKER** — `recordUnanswered` ห้าม throw แม้ DB เขียนล้มเหลวจริง
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียก `recordUnanswered({shopId: 'id-shop-ที่ไม่มีอยู่จริง', rawText:'คำถามทดสอบ', normalizedText:'คำถามทดสอบ'})` (บังคับ FK violation จริงบน DB จริง ไม่ mock)
- **Expected Result:** ไม่ throw — คืน `{queued:false, reason:'WRITE_FAILED'}`
- **Linked to:** TFR-033 ข้อ 2, TD-013 pattern เดิม

#### TC-USV-04: 🛑 **BLOCKER** — `recordUnanswered` ห้ามแตะ `Conversation.handoffAt` เด็ดขาด (regression guard บั๊ก prod 2026-07-31)
- **ประเภท:** [Integration] Vitest
- **Precondition:** CONV-1 มี `handoffAt=null`
- **Steps:** เรียก `recordUnanswered` หลายครั้งติดกันด้วยข้อความต่าง ๆ ที่ผ่านตัวกรอง แล้วอ่าน `Conversation.handoffAt` ของ CONV-1
- **Expected Result:** `handoffAt` ยังเป็น `null` ทุกครั้ง (ฟังก์ชันนี้ไม่มีโค้ดแตะตาราง `Conversation` เลย — grep ยืนยันคู่กับเทส)
- **Linked to:** TFR-033 ข้อ 3, **prod bug 2026-07-31 (240 ห้อง)**

#### TC-USV-05: ข้อความที่เคยตอบ/ข้ามแล้ว ถูกถามซ้ำ → `hitCount++` แต่ `status` ไม่รีเซ็ต
- **ประเภท:** [Integration] Vitest
- **Precondition:** ใช้ UQ-ANSWERED (`status='ANSWERED'`) และ UQ-DISMISSED (`status='DISMISSED'`)
- **Steps:** เรียก `recordUnanswered` ด้วยข้อความเดียวกับ `normalizedQuestion` ของทั้งสองแถว
- **Expected Result:** `hitCount` ของทั้งคู่เพิ่มขึ้น, `lastSeenAt` อัปเดต, **`status` ยังเป็น `ANSWERED`/`DISMISSED` เดิม** ไม่กลับเป็น `PENDING`
- **Linked to:** TFR-033 ข้อ 4

#### TC-USV-06: `listUnanswered` — `pendingCount` นับเฉพาะ PENDING เสมอไม่ว่า query `status` จะเป็นอะไร
- **ประเภท:** [Integration] Vitest
- **Steps:** `listUnanswered(SHOP-A, { status: 'DISMISSED' })`
- **Expected Result:** `items` มีเฉพาะแถว DISMISSED (UQ-DISMISSED) แต่ `pendingCount` นับแถว PENDING ทั้งหมดของร้าน (รวม UQ-PENDING) ไม่ใช่ 0
- **Linked to:** API.md §4.37

#### TC-USV-07: `dismissUnanswered` scope ด้วย `status='PENDING'` — เรียกซ้ำครั้งที่ 2 ได้ 404
- **ประเภท:** [Integration] Vitest
- **Steps:** `dismissUnanswered(UQ-PENDING.id, SHOP-A, userId)` แล้วเรียกซ้ำทันที
- **Expected Result:** ครั้งแรกสำเร็จ (`status='DISMISSED'`, `dismissedAt`/`dismissedByUserId` มีค่า); ครั้งที่ 2 throw `AUTO_REPLY_UNANSWERED_NOT_FOUND` (เพราะ `updateMany` ไม่เจอแถวที่ status ยังเป็น PENDING)
- **Linked to:** API.md §4.38

#### TC-USV-08: `restoreUnanswered` (undo) — กลับเป็น PENDING ได้เฉพาะจากสถานะ DISMISSED
- **ประเภท:** [Integration] Vitest
- **Steps:** (1) `restoreUnanswered(UQ-DISMISSED.id, SHOP-A)` (2) `restoreUnanswered(UQ-PENDING.id, SHOP-A)` (สถานะเป็น PENDING อยู่แล้ว)
- **Expected Result:** (1) สำเร็จ — `status='PENDING'`, `dismissedAt`/`dismissedByUserId` เป็น `null` (2) throw `AUTO_REPLY_UNANSWERED_NOT_FOUND` (ไม่ใช่ DISMISSED จึงไม่เข้าเงื่อนไข `updateMany`)
- **Linked to:** API.md §4.39 (⚠️ ยังไม่มีใน SRS §4.1 เดิม — ดู OQ-7)

#### TC-USV-09: `convertUnansweredToQna` — path สำเร็จสร้าง QnA + ปิดคิวพร้อมกัน
- **ประเภท:** [Integration] Vitest
- **Steps:** `convertUnansweredToQna(UQ-PENDING.id, SHOP-A, { keywordId: KW-INTEREST.id, question: 'ตัดหมอกรุ่นไหนที่ร้านแนะนำ', answer: 'รุ่น X ครับ' }, userId)`
- **Expected Result:** คืน `{qnaId}`; แถว `AutoReplyQna` ใหม่มีจริง (`source='QUEUE'`); แถว UQ-PENDING เปลี่ยนเป็น `status='ANSWERED'`, `qnaId` ชี้ข้อใหม่
- **Linked to:** TFR-033, API.md §4.40

#### TC-USV-10: `convertUnansweredToQna` บนแถวที่ `status='ANSWERED'` อยู่แล้ว → 409 กันตอบซ้ำ
- **ประเภท:** [Integration] Vitest
- **Steps:** `convertUnansweredToQna(UQ-ANSWERED.id, SHOP-A, {...}, userId)`
- **Expected Result:** throw `AUTO_REPLY_UNANSWERED_ALREADY_ANSWERED`; ไม่มี `AutoReplyQna` แถวใหม่ถูกสร้าง (ตรวจสถานะก่อนเรียก `createQna`)
- **Linked to:** API.md §4.40

#### TC-USV-11: 🛑 **BLOCKER — ข้อขัดแย้งที่ต้องพิสูจน์ด้วยเทส: `convertUnansweredToQna` ไม่ใช่ทรานแซกชันเดียวจริง**
- **ประเภท:** [Integration] Vitest — mock บางส่วน (spy บน `prisma.autoReplyUnansweredQuestion.updateMany` เท่านั้น, `createQna` เขียน DB จริง)
- **เหตุผล:** เปิดอ่านโค้ดจริง (`auto-reply-unanswered.service.ts:149-177`) ยืนยันว่า `convertUnansweredToQna` เรียก `createQna(...)` แล้วตามด้วย `prisma.autoReplyUnansweredQuestion.updateMany(...)` เป็น **2 statement แยกกัน ไม่มี `prisma.$transaction` ห่อ** ทั้งที่ comment ในโค้ดบรรทัด 145-147 และ API.md §3.9 ("ทรานแซกชันเดียว") อ้างว่าเป็นทรานแซกชันเดียว — ถ้า statement ที่สองล้มเหลว จะ **ไม่มีการ rollback** สิ่งที่ statement แรกทำไปแล้ว
- **Steps:**
  1. `vi.spyOn(prisma.autoReplyUnansweredQuestion, 'updateMany').mockRejectedValueOnce(new Error('จำลอง DB ล้ม'))`
  2. เรียก `convertUnansweredToQna(UQ-PENDING.id, SHOP-A, {...}, userId)` แล้วจับ error ที่ throw ออกมา
  3. คืน spy กลับปกติ (`mockRestore`) แล้ว query `AutoReplyQna` ด้วย `question` ที่เพิ่งส่งไป และ query แถว `UQ-PENDING` อีกครั้ง
- **Expected Result (พฤติกรรมจริงที่คาดว่าจะเกิด — ไม่ใช่พฤติกรรมที่ถูกต้อง):** error หลุดออกมาจริง **แต่** แถว `AutoReplyQna` ที่ `createQna` สร้างไปแล้ว **ยังอยู่ใน DB** (ไม่ถูก rollback) และ `UQ-PENDING.status` ยังเป็น `PENDING` (ไม่ถูกปิด) → เป็นข้อพิสูจน์ว่าเกิด "สร้าง QnA สำเร็จแต่ปิดคิวไม่สำเร็จ" ได้จริงตามที่ทีมกังวล
- **Cleanup:** ลบแถว `AutoReplyQna` ที่ถูกสร้างระหว่างเทสด้วย id ที่เทสเก็บไว้เอง (`prisma.autoReplyQna.deleteMany({ where: { id: createdQnaId } })`) — ห้ามใช้ `deleteMany` แบบไม่ scope (Hard Rule 13)
- **สิ่งที่ต้องรายงานกลับ dev:** ต้องห่อ `createQna` (เฉพาะส่วน insert) + `updateMany` ด้วย `prisma.$transaction` จริงก่อน merge S-11 — TC นี้เป็น **red-by-design** จนกว่าจะแก้
- **Linked to:** TFR-033, API.md §3.9 ("ทรานแซกชันเดียว" — ขัดกับโค้ดจริง)

#### TC-USV-12: `markAnsweredByText` — ปิดคิวเงียบเมื่อเจอ, ไม่ throw เมื่อไม่เจอ
- **ประเภท:** [Integration] Vitest
- **Steps:** (1) `markAnsweredByText(SHOP-A, 'ตัดหมอกรุ่นไหนที่ร้านแนะนำ', 'qna-id-x')` (ตรงกับ UQ-PENDING) (2) `markAnsweredByText(SHOP-A, 'ข้อความที่ไม่เคยอยู่ในคิว', 'qna-id-y')`
- **Expected Result:** (1) UQ-PENDING เปลี่ยนเป็น `status='ANSWERED'`, `qnaId='qna-id-x'` (2) ไม่มี error, ไม่มีแถวใดถูกแก้
- **Linked to:** TFR-037 ข้อ 5

#### TC-USV-13: `markAnsweredByText` ไม่ throw แม้ DB ล้มเหลวจริง (ห่อ try/catch)
- **ประเภท:** [Integration] Vitest
- **Steps:** เรียกด้วย `shopId` ที่ไม่มีอยู่จริง
- **Expected Result:** resolve เงียบ ไม่ throw
- **Linked to:** TFR-037 ข้อ 5 (pattern เดียวกับ `recordUnanswered`)

---

### 3.19 กลุ่ม S — [Integration] 🛑 ตำแหน่งของ QnA ในเส้นทาง gate — "คำตรงตัวชนะก่อนเสมอ"

> ทุกเคสในกลุ่มนี้ยิงข้อความผ่าน `processJob` จริง (mock เฉพาะชั้นส่งออก Meta ผ่าน `sendOutboundMessage`/Graph client ตาม pattern เดิมของโปรเจกต์) กลุ่มนี้คือกับดักที่ SDS §14.2 เตือนว่า **ถ้าลัดจะกลายเป็นช่องข้ามสวิตช์ทั้งหมด** — ทุกเคส 🛑 BLOCKER

#### TC-GATE-01: 🛑 คำตรงตัวชนะก่อนเสมอ — แม้คำถามเดียวกันมีอยู่ทั้งกลุ่มคำและคลัง
- **Precondition:** `KW-COD-EXACT` phrase `"เก็บปลายทาง"` (matchType EXACT) + สร้าง QnA คำถาม `"เก็บปลายทาง"` ผูกกับกลุ่มอื่นในร้านเดียวกัน
- **Steps:** ส่งข้อความ `"เก็บปลายทาง"` เข้า CONV-1
- **Expected Result:** `AutoReplyLog.matchedVia='KEYWORD'`, `matchType='EXACT'`, `qnaId=null` — คลังไม่ถูกแตะเลย แม้มีคำถามตรงกัน
- **Linked to:** TFR-032 ข้อ 1, Phase Acceptance #2 (scope baseline)

#### TC-GATE-02: 🛑 `NO_RULE_MATCH` ต้องไม่ถูกคลังมากลบร่องรอย
- **Precondition:** กลุ่มคำ `KW-PRICE` ตรงคำ แต่**ไม่มีกฎคำตอบใดผูกกับกลุ่มนี้เลย** (ลบ R ทั้งหมดของ KW-PRICE ชั่วคราว) + มี QnA คำถามเดียวกับ phrase ของ KW-PRICE ผูกกับกลุ่มอื่น
- **Steps:** ส่งข้อความที่ตรง phrase ของ KW-PRICE
- **Expected Result:** `matchedVia=null`, `decision='HANDOFF'`, `skipReason='NO_RULE_MATCH'` — คลังไม่ถูกเรียกเลย (ถ้าคลังมาตอบแทน = บั๊กร้ายแรงที่ทำให้ร้านไม่มีวันเห็นว่ากลุ่มนี้ตั้งค่าค้างไว้)
- **Linked to:** TFR-032 ข้อ 1 (เหตุผลข้อสำคัญที่สุดของทั้งภาคผนวก)

#### TC-GATE-03: 🛑 QnA ของกลุ่ม OFFLINE ต้องไม่ตอบใคร
- **Steps:** ส่งข้อความที่ตรงกับ QNA-OFFLINE (`ค่าส่งเท่าไหร่` ในกลุ่ม KW-DRAFT ที่ `status='OFFLINE'`) เข้า CONV-1
- **Expected Result:** `matchedVia=null`, ไม่มีข้อความส่งออก, `recordUnanswered` ถูกเรียก (เพราะ `NO_KEYWORD_MATCH`) — `AutoReplyLog` ไม่มี `qnaId` ของ QNA-OFFLINE เลย
- **Linked to:** TFR-031 ข้อ 2, TFR-032 ข้อ 2

#### TC-GATE-04: 🛑 QnA ของกลุ่ม TEST ตอบเฉพาะเธรดทดสอบที่ผูกไว้
- **Precondition:** QNA-TEST อยู่กลุ่ม KW-TESTMODE (`status='TEST'`) ที่ผูก `AutoReplyKeywordTestThread` กับ CONV-TEST เท่านั้น
- **Steps:** (1) ส่งข้อความตรง QNA-TEST เข้า **CONV-1** (ไม่ใช่เธรดทดสอบ) (2) ส่งเข้า **CONV-TEST**
- **Expected Result:** (1) `skipReason='KEYWORD_TEST_ONLY'`, ไม่ตอบ (2) ตอบสำเร็จด้วย `matchedVia='QNA'`, `isTest=true`, `ChatMessage.autoReplyKind='AUTO_TEST'`
- **Linked to:** TFR-032 ข้อ 2, Phase Acceptance #3

#### TC-GATE-05: 🛑 QnA ที่ยืมกลุ่มถูกบังคับตารางเวลาทำงานของร้านเหมือนกลุ่มคำปกติ
- **Precondition:** SHOP-D (§2.12) — `activeScheduleMode='WINDOW'` นอกเวลาปัจจุบันเสมอ, QNA-D อยู่กลุ่ม KW-D (LIVE)
- **Steps:** ส่งข้อความตรง QNA-D เข้า CONV-D
- **Expected Result:** `skipReason='OUTSIDE_SCHEDULE'`, ไม่ตอบ, ไม่เขียนคิว unanswered (เพราะ reason ไม่ใช่ `NO_KEYWORD_MATCH`)
- **Linked to:** TFR-032 ข้อ 2

#### TC-GATE-06: 🛑 QnA ที่ยืมกลุ่มถูกบังคับ cooldown เดียวกับกลุ่มนั้น
- **Precondition:** SHOP-A `keywordCooldownSec=300`
- **Steps:** ส่งข้อความตรง QNA-1 สำเร็จครั้งแรก → ส่งข้อความ**เดิม**อีกครั้งทันที (ภายใน cooldown)
- **Expected Result:** ครั้งแรก `decision='REPLIED'`, `matchedVia='QNA'`; ครั้งที่สอง `skipReason='KEYWORD_COOLDOWN'` — cooldown เทียบกับ `keywordId` ที่ QnA ยืมมา (`KW-INTEREST`) ไม่ใช่เทียบกับ `qnaId`
- **Linked to:** TFR-032 ข้อ 2

#### TC-GATE-07: คำตอบจาก QnA ไม่ผ่าน `resolveRule()` — กฎกลางของร้าน/เพจไม่มาแย่งคำตอบ
- **Precondition:** SHOP-A มี R-SHOP-DEF (`SHOP_DEFAULT`) และ QNA-1 อยู่กลุ่ม KW-INTEREST ที่**ไม่มี**กฎระดับ KEYWORD_DEFAULT
- **Steps:** ส่งข้อความตรง QNA-1
- **Expected Result:** `resolutionLevel='QNA'` (ไม่ใช่ `SHOP_DEFAULT`), `ruleId=null`, `replyText` เท่ากับ `QNA-1.answer` เป๊ะทุกตัวอักษร (ไม่ใช่ replyText ของ R-SHOP-DEF)
- **Linked to:** TFR-032 ข้อ 3

#### TC-GATE-08: `markQnaUsed` ถูกเรียกเฉพาะตอนส่งสำเร็จ
- **Steps:** mock `sendOutboundMessage` ให้ล้มเหลวเสมอ (คืน `sent:false`) → ส่งข้อความตรง QNA-1 → อ่าน `useCount`
- **Expected Result:** `useCount` **ไม่เพิ่ม** เมื่อส่งล้มเหลว
- **Linked to:** TFR-032 ข้อ 5

#### TC-GATE-09: 🛑 **regression ตัวจริง — `NO_KEYWORD_MATCH` ต้องไม่ล็อกห้อง + ข้อความถัดไปยังตอบได้ปกติ**
- **Steps:**
  1. ส่งข้อความที่ไม่ตรงทั้งกลุ่มคำและคลังเข้า CONV-1 (เช่น `"สวัสดีครับ"` ที่ไม่ตรง `KW-START` เพราะสมมติปิดกลุ่มนั้นไว้ชั่วคราวในเทสนี้) → อ่าน `Conversation.handoffAt`
  2. ส่งข้อความที่ 2 ที่ตรง `KW-INTEREST` เข้า **เธรดเดิม**
- **Expected Result:** หลังขั้น 1: `handoffAt` ยังเป็น `null`, มีแถวใน `AutoReplyUnansweredQuestion`; หลังขั้น 2: **ได้รับคำตอบปกติ** (`decision='REPLIED'`) — ยืนยันว่าห้องไม่ถูกล็อกถาวรจากข้อความแรก (นี่คือ regression test ตรงจุดของบั๊ก prod 2026-07-31 ที่ล็อก 240 ห้อง)
- **Linked to:** TFR-033 ข้อ 3, memory `project_chat_auto_reply_00023`

#### TC-GATE-10: คำตอบจากคลังที่มีแต่รูปไม่มีข้อความ ต้องไม่ถูกตัดเป็น `EMPTY_REPLY`
- **Steps:** ส่งข้อความตรง QNA-IMG (`answer=''`, `imageFileIds=['f1','f2']`)
- **Expected Result:** `decision='REPLIED'` (ไม่ใช่ `HANDOFF`/`EMPTY_REPLY`); `sendAutoReply` ถูกเรียกด้วย `imageFileIds:['f1','f2']`
- **Linked to:** TFR-036 ข้อ 6

#### TC-GATE-11: `loadRuleSet` โหลด `qnas` มาพร้อม `keywords`/`rules` ในคิวรีเดียว ใช้ cache 60s เดียวกัน
- **Steps:** เรียก `loadRuleSet(SHOP-A)` 2 ครั้งติดกันภายใน 1 วินาที พร้อม spy นับจำนวนครั้งที่ query `AutoReplyQna` จริง
- **Expected Result:** query ยิงจริงแค่ 1 ครั้ง (ครั้งที่ 2 ได้จาก cache) และผลลัพธ์มีทั้ง `keywords`, `rules`, `qnas` ครบในก้อนเดียว
- **Linked to:** TFR-032 ข้อ 4

---

### 3.20 กลุ่ม T — [API] contract 12 endpoint ใหม่ + ส่วนขยาย `/simulate`

> 🛑 **ก่อนเขียน route จริง — ยืนยันจากโค้ด 2026-08-01: ยังไม่มี route ไหนใน `/api/shops/auto-reply/keywords/[id]/qna*`, `/api/shops/auto-reply/unanswered*`, `/api/chat/conversations/[id]/qna-from-message` เลยแม้แต่ไฟล์เดียว** (grep `find src/app/api/shops/auto-reply -maxdepth 2 -type d` ไม่มี `qna`/`unanswered`) และ `ERROR_MAP` ใน `auto-reply-route-context.ts` **ยังไม่มี entry ของ `AUTO_REPLY_QNA_*`/`AUTO_REPLY_UNANSWERED_*` แม้แต่ตัวเดียว** — ทุก TC ในกลุ่มนี้เป็น **doc-first (⚠️ ห้าม implement ก่อนมี PRD+BRD ผ่านแล้ว — ที่นี่ผ่านแล้วสำหรับ phase นี้ ตาม Hard Rule 11)**, route/schema ยังไม่มีจริง
>
> **ผลที่ตามมาโดยตรง (ต้องเขียนเทสให้จับสิ่งนี้ได้เมื่อ implement เสร็จ):** ถ้า dev implement endpoint โดยลืมเพิ่ม `ERROR_MAP` entry ก่อน — error 400/409 ที่ตั้งใจไว้ (`AUTO_REPLY_QNA_QUESTION_EMPTY` ฯลฯ) จะตกไปที่ fallback **500** ทันที (`mapServiceError` คืน 500 สำหรับรหัสที่ไม่ match `ERROR_MAP` และไม่ลงท้าย `NOT_FOUND`) — TC-QAPI-04/05/06 และ TC-UAPI-05 ถูกออกแบบให้ **แดงทันทีถ้าลืมขั้นตอนนี้**

**§ คลังคำถาม-คำตอบ (API.md §3.8, §4.30-4.36)**

#### TC-QAPI-01: `GET /keywords/{id}/qna` — happy path + 4 ตัวกรอง + `stats` ของทั้งกลุ่ม
- **ประเภท:** [API]
- **Steps:** GET ด้วย `filter=NEVER_USED`, `filter=ACTIVE`, `filter=INACTIVE`, `search=รูป` ตามลำดับ
- **Expected Result:** 200 ทุกครั้ง, `items` กรองถูกต้องตาม `QnaListFilter`, `stats.total`/`active`/`totalUses` เท่ากันทุก request (ไม่ผันตามตัวกรอง)
- **Linked to:** API.md §4.30, TFR-034

#### TC-QAPI-02: `GET /keywords/{id}/qna` ข้ามร้าน → 404 (ไม่ leak)
- **Steps:** ล็อกอินเป็นสมาชิก SHOP-B แล้ว GET ด้วย `id=KW-INTEREST.id` (ของ SHOP-A)
- **Expected Result:** `404 KEYWORD_NOT_FOUND` — ไม่บอกว่ากลุ่มมีอยู่จริงแต่เป็นของร้านอื่น
- **Linked to:** API.md §5, AC-001-05 (หลักเดียวกัน)

#### TC-QAPI-03: `POST /keywords/{id}/qna` happy path — คืน `{id}` เท่านั้น (ไม่ใช่ object เต็ม)
- **Steps:** POST body ถูกต้องครบ
- **Expected Result:** `201 { id: string }` — ไม่มีฟิลด์อื่นปนมา (ต่างจาก `POST /keywords` ที่คืนเต็ม — ตรง OQ-6 ของ API.md; ถ้า FE ต้องการ object เต็มต้องเรียก GET ต่อ)
- **Linked to:** API.md §4.31

#### TC-QAPI-04: 🛑 `POST /keywords/{id}/qna` validation errors ต้องได้ 400/409 จริง ไม่ตกเป็น 500
- **Steps:** ยิง 6 กรณีแยกกัน: question ว่าง, question เกิน 500, answer ว่าง+ไม่มีรูป, answer เกิน 2000, imageFileIds เกิน 5, คำถามซ้ำในกลุ่มเดียวกัน
- **Expected Result:** ตามลำดับ `400 AUTO_REPLY_QNA_QUESTION_EMPTY` / `400 ..._QUESTION_TOO_LONG` / `400 ..._ANSWER_EMPTY` / `400 ..._ANSWER_TOO_LONG` / `400 ..._TOO_MANY_IMAGES` / `409 ..._DUPLICATE` — **ไม่มีกรณีใดได้ 500**
- **Linked to:** API.md §5 (8 error code ใหม่ — TC นี้ครอบ 6/8), memory `feedback_service_error_route_mapping`

#### TC-QAPI-05: `POST /keywords/{id}/qna` — 401/403/404
- **Steps:** (1) ไม่มี session (2) session ที่ role นอก `EDITABLE_ROLES` (3) `keywordId` ของร้านอื่น
- **Expected Result:** (1) `401 UNAUTHORIZED` (2) `403 FORBIDDEN_ROLE` (3) `404 KEYWORD_NOT_FOUND`
- **⚠️ หมายเหตุสำคัญ (ดูสรุปข้อขัดแย้งท้ายเอกสาร):** กรณี (2) **seed ไม่ได้ผ่าน flow ปกติ** เพราะ `ShopMember.role` ในสคีมาปัจจุบันมีแค่ `"OWNER"`/`"ADMIN"` (ไม่มีค่า `"STAFF"` จริง) และ `EDITABLE_ROLES = ['OWNER','ADMIN']` ครอบทั้งสองค่าที่มีจริง — ต้อง seed แถว `ShopMember` ด้วยค่า `role` แปลกปลอม (เช่น `'VIEWER'`) ตรง ๆ ผ่าน Prisma เพื่อพิสูจน์ branch นี้เท่านั้น ไม่มีทางเกิดผ่าน flow จริงของระบบปัจจุบัน (ตรงกับ API.md OQ-1 ที่ทีมบันทึกไว้แล้ว)
- **Linked to:** API.md §5, OQ-1

#### TC-QAPI-06: `PATCH`/`DELETE /keywords/{id}/qna/{qnaId}` — 404 (ไม่มีอยู่จริง / ข้ามร้าน) + partial update
- **Steps:** PATCH เฉพาะ `isActive`; DELETE ซ้ำ 2 ครั้ง
- **Expected Result:** PATCH สำเร็จ `200 {ok:true}`, ฟิลด์อื่นไม่เปลี่ยน; DELETE ครั้งแรกสำเร็จ `200 {ok:true}`, ครั้งที่ 2 `404 AUTO_REPLY_QNA_NOT_FOUND`
- **Linked to:** API.md §4.32, §4.33

#### TC-QAPI-07: `POST /keywords/{id}/qna/bulk` — partial result เสมอ ไม่ throw ทั้งก้อน
- **Steps:** ส่ง `action='MOVE'` พร้อม 1 id ที่จะชนซ้ำ + 1 id ที่ย้ายสำเร็จ (เหมือน TC-QSV-12 แต่ผ่าน HTTP)
- **Expected Result:** `200 { ok: 1, failed: [{id, reason:'AUTO_REPLY_QNA_DUPLICATE'}] }`
- **Linked to:** API.md §4.34

#### TC-QAPI-08: `POST .../qna/bulk` request-level errors
- **Steps:** (1) `action='MOVE'` ไม่มี `targetKeywordId` (2) `targetKeywordId` เป็นของร้านอื่น (3) `qnaIds=[]`
- **Expected Result:** (1) `400 INVALID_INPUT` (Valibot `v.check`) (2) `404 KEYWORD_NOT_FOUND` (3) `400 INVALID_INPUT` (`v.minLength(1)`)
- **Linked to:** API.md §4.34

#### TC-QAPI-09: `POST .../qna/import` — พรีวิว/ผลนำเข้าตาม `importStockFromCsvRows` pattern
- **Steps:** ส่ง rows 3 แถว: 1 แถวใหม่, 1 แถวซ้ำกับที่มีอยู่ (`normalizedQuestion` ชน), 1 แถว question ว่าง
- **Expected Result:** `200 { added:1, duplicates:1, invalid:1, total:3 }`; แถวซ้ำ**ไม่ทับ**ของเดิม (ยัง ans เดิม); ทุกแถวที่เพิ่มมี `source='IMPORT'`
- **🛑 หมายเหตุ:** endpoint/service นี้**ยังไม่มีโค้ดจริงเลย** (API.md ยืนยันชัดเจน "ยังไม่มีโค้ด S-16, P1") — TC นี้เป็น spec ล่วงหน้า ไม่ใช่ regression บนของที่มีอยู่
- **Linked to:** API.md §4.35, TFR-035

#### TC-QAPI-10: 🛑 **เพดานแถว CSV — ข้อขัดแย้งที่ยังไม่ถูกตัดสิน (OQ-5)**
- **Steps:** ส่ง rows 501 แถว (Valibot `AutoReplyQnaImportSchema` ปัจจุบันเขียน cap ที่ 500) และ 1001 แถว
- **Expected Result:** ⚠️ **ไม่สามารถกำหนดผลที่คาดหวังได้แน่นอนตอนนี้** เพราะเอกสาร 3 แหล่งขัดกันเอง — SRS TFR-035 ข้อ 4 เขียน "เพดานต่อไฟล์: 1,000 แถว เกินให้ปฏิเสธ", `parseCsv()` (`src/lib/csv.ts`) ที่มีอยู่แล้วจริง cap 500, และ mockup Modal 3 พูดถึง "ตัดเฉพาะ 500 แถวแรก" (ตัดครึ่งเงียบ ๆ ซึ่ง TFR-035 ข้อ 4 บอกห้ามทำแบบนี้ตรง ๆ) — **TC นี้ต้องรอ safepay-planner/PO ตัดสิน 1 ทางก่อน implement** (บันทึกไว้ในตารางข้อขัดแย้งท้ายเอกสาร)
- **Linked to:** SRS TFR-035, API.md OQ-5

#### TC-QAPI-11: `GET .../qna/export` — CSV UTF-8 BOM ตรงคอลัมน์
- **Steps:** GET แล้วตรวจ response header + เนื้อไฟล์
- **Expected Result:** `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="deep-auto-reply-qna-{keywordId}-{yyyymmdd}.csv"`, ไบต์แรกของ body เป็น BOM (`\uFEFF`), หัวคอลัมน์ `คำถาม, คำตอบ, เปิดใช้งาน`, คอลัมน์ที่ 3 เป็น `"ใช่"`/`"ไม่ใช่"` (ไม่ใช่ `true`/`false` ดิบ)
- **Linked to:** API.md §4.36, TFR-035

**§ คิวคำถามที่ตอบไม่ได้ (API.md §3.9, §4.37-4.40)**

#### TC-UAPI-01: `GET /unanswered` — default `status=PENDING` + `pendingCount` คงที่
- **Steps:** GET ไม่ส่ง `status` เลย, แล้ว GET `status=DISMISSED`
- **Expected Result:** ครั้งแรกได้เฉพาะ PENDING; ครั้งสองได้เฉพาะ DISMISSED แต่ `pendingCount` เท่ากันทั้งสองครั้ง
- **Linked to:** API.md §4.37

#### TC-UAPI-02: `POST /unanswered/{id}/dismiss` + `restore` — happy path คู่กัน
- **Steps:** dismiss แล้ว restore แถวเดียวกัน
- **Expected Result:** ทั้งคู่ `200 {ok:true}`; หลัง dismiss `status='DISMISSED'`; หลัง restore กลับเป็น `'PENDING'`
- **Linked to:** API.md §4.38, §4.39

#### TC-UAPI-03: `dismiss`/`restore` ผิดสถานะ/ผิดร้าน → 404 ทั้งคู่
- **Steps:** dismiss แถวที่ dismiss ไปแล้ว; restore แถวที่ยังเป็น PENDING; dismiss แถวของร้านอื่น
- **Expected Result:** ทั้งสามกรณี `404 AUTO_REPLY_UNANSWERED_NOT_FOUND`
- **Linked to:** API.md §4.38, §4.39

#### TC-UAPI-04: `POST /unanswered/{id}/convert` happy path
- **Steps:** POST body ตาม `AutoReplyUnansweredConvertSchema` ครบ
- **Expected Result:** `200 { qnaId }`
- **Linked to:** API.md §4.40

#### TC-UAPI-05: 🛑 `convert` errors ครบชุด (proof ไม่ตก 500)
- **Steps:** (1) `id` ไม่มีจริง (2) `id` ที่ `status='ANSWERED'` แล้ว (3) `keywordId` ของร้านอื่น (4) `question`/`answer` ไม่ผ่าน validation (5) คำถามซ้ำในกลุ่มปลายทาง
- **Expected Result:** (1) `404 AUTO_REPLY_UNANSWERED_NOT_FOUND` (2) `409 AUTO_REPLY_UNANSWERED_ALREADY_ANSWERED` (3) `404 KEYWORD_NOT_FOUND` (4) `400 AUTO_REPLY_QNA_*` ตามชนิด (5) `409 AUTO_REPLY_QNA_DUPLICATE`
- **Linked to:** API.md §4.40, §5 (ครอบอีก 2/8 error code ใหม่ — รวมกับ TC-QAPI-04 ครบ 8/8)

#### TC-UAPI-06: "สร้างกลุ่มใหม่" ใน flow convert เป็น 2 คำขอต่อเนื่อง ไม่ atomic ข้าม endpoint
- **Steps:** (1) `POST /keywords` สร้างกลุ่มใหม่สำเร็จ (2) จำลอง `POST .../convert` ครั้งแรกล้มเหลว (เช่น answer ผิด) (3) retry `convert` เดิมด้วย `keywordId` จากขั้น (1)
- **Expected Result:** ขั้น (3) สำเร็จโดย**ไม่สร้างกลุ่มซ้ำ** — พิสูจน์ตามที่ API.md §4.40 เตือนไว้ว่า UI/QA ต้องรับ edge case นี้เอง ไม่มี rollback ระดับ 2 endpoint
- **Linked to:** API.md §4.40

**§ mini action จากห้องแชท (API.md §4.41)**

#### TC-MAPI-01: `POST .../qna-from-message` — สร้างกลุ่มใหม่ + QnA ในคำขอเดียว
- **Steps:** body `{chatMessageId, question, answer, keywordId: null, newKeywordName: 'กลุ่มใหม่จากแชท'}`
- **Expected Result:** `201 { qnaId, keywordId, keywordCreated: true }`; มีกลุ่มคำใหม่ `status='OFFLINE'` จริงใน DB
- **Linked to:** API.md §4.41, TFR-037 ข้อ 2

#### TC-MAPI-02: `qna-from-message` — เลือกกลุ่มที่มีอยู่แล้ว (`keywordCreated:false`)
- **Steps:** body ส่ง `keywordId` ของ KW-PRICE ตรง ๆ
- **Expected Result:** `201 { qnaId, keywordId: KW-PRICE.id, keywordCreated: false }`
- **Linked to:** API.md §4.41

#### TC-MAPI-03: `qna-from-message` ปิดคิวอัตโนมัติถ้าข้อความเคยอยู่ในคิว
- **Precondition:** `chatMessageId` ที่ส่งมีข้อความตรงกับ UQ-PENDING (`normalizedQuestion` เดียวกัน)
- **Steps:** เรียก endpoint
- **Expected Result:** `qnaId` ใหม่ถูกสร้าง **และ** UQ-PENDING เปลี่ยนเป็น `status='ANSWERED'`, `qnaId` ชี้ข้อใหม่ (TFR-037 ข้อ 5 — ผ่าน `markAnsweredByText`)
- **Linked to:** API.md §4.41, TFR-037 ข้อ 5

#### TC-MAPI-04: `qna-from-message` errors — 404 เธรดข้ามร้าน, 400 validation, 409 คำถามซ้ำ
- **Steps:** (1) `chatMessageId` ของเธรดร้านอื่น (2) `keywordId=null` และ `newKeywordName` ว่างด้วย (3) คำถามซ้ำในกลุ่มปลายทาง
- **Expected Result:** (1) `404 CONVERSATION_NOT_FOUND` (2) `400` (Valibot `v.check` — "กรุณาเลือกกลุ่มหรือระบุชื่อกลุ่มใหม่") (3) `409 AUTO_REPLY_QNA_DUPLICATE`
- **Linked to:** API.md §4.41

**§ ส่วนขยาย `/simulate` (API.md §4.18-ext, SDS §14.3)**

#### TC-SIMX-01: 🛑 **BLOCKER — parity ระหว่าง `/simulate` กับ path จริง (AC-020-05)**
- **Steps:** ยิงข้อความเดียวกันเข้า (1) `POST /simulate` และ (2) ผ่าน webhook จริงเข้า `processJob` (mock ชั้นส่งออกเท่านั้น) โดยข้อความนี้ตรงกับ QnA เท่านั้น (ไม่ตรงกลุ่มคำ)
- **Expected Result:** ทั้งสองทางได้ `matchedVia='QNA'`, `qna.id`/`replyText` เท่ากันเป๊ะ — ฟังก์ชัน `matchQna()` ตัวเดียวกัน ไม่มี logic คู่ขนาน
- **⚠️ สถานะปัจจุบัน:** ยืนยันจากโค้ดจริง 2026-08-01 — `/simulate` **ยังไม่เรียก `matchQna` เลย** (`route.ts` ไม่มี import) → TC นี้ **แดงแน่นอนจนกว่า S-04 ส่วนขยาย simulate จะถูก implement ตาม API.md §4.18-ext ข้อ 1-3**
- **Linked to:** AC-020-05, SDS §14.3, TFR-031

#### TC-SIMX-02: `/simulate` ส่ง `allKeywords` (ไม่กรอง `status`) เข้า `matchQna` — ต่างจาก path จริงโดยเจตนา
- **Steps:** สร้าง QnA ผูกกับกลุ่ม `status='OFFLINE'` → เรียก `/simulate`
- **Expected Result:** `/simulate` **เห็น**คำตอบของ QnA กลุ่ม OFFLINE (preview ได้ก่อนเปิดใช้จริง — พฤติกรรมเดิมของหน้านี้) แต่ path จริงต้อง**ไม่เห็น** (อ้างอิง TC-GATE-03) — สอง TC นี้ต้องให้ผลต่างกันโดยตั้งใจ ถ้าเหมือนกันแปลว่า simulate implement ผิด
- **Linked to:** SDS §14.3 (ตารางความต่าง)

#### TC-SIMX-03: `/simulate` response มี `matchedVia`/`qna` ตามสัญญาใหม่
- **Steps:** ยิงข้อความที่ตรง QnA ล้วน (ไม่ตรงกลุ่มคำ)
- **Expected Result:** `matched=null`, `matchedVia='QNA'`, `qna={id,question,answer,imageFileIds}`, `replyText` เท่ากับ `qna.answer`, `willHandoff=false`
- **Linked to:** API.md §4.18-ext

#### TC-SIMX-04: `/simulate` — ข้อความที่ไม่ตรงทั้งกลุ่มคำและคลัง
- **Steps:** ยิงข้อความที่ไม่ตรงอะไรเลย
- **Expected Result:** `matched=null`, `matchedVia=null`, `qna=null`, `willHandoff=true`
- **Linked to:** API.md §4.18-ext

#### TC-SIMX-05: `qna.isActive=false` ไม่ถูก preview แม้ query ฝั่ง simulate ไม่กรอง `isActive`
- **Steps:** สร้าง QnA `isActive=false` ที่ตรงข้อความทดสอบ → `/simulate`
- **Expected Result:** `matchedVia=null` (กรองอยู่ใน `matchQna()` เอง บรรทัด 122 ไม่ใช่ที่ query — ยืนยันว่า simulate ไม่ต้องเพิ่ม filter เอง)
- **Linked to:** SDS §14.3

**§ ป้าย DeepBot ในรายการแชท (API.md §4.42 — นอกขอบเขต API.md ของ feature นี้จริง ๆ แต่ทีมขอให้ทดสอบในชุดนี้)**

#### TC-QAPI-12: `GET /api/chat/conversations` (branch seller) — enrich 2 ฟิลด์ใหม่ + `lastMessageIsAiEnhanced` คงที่ `false`
- **🛑 สถานะ:** ยืนยันจากโค้ด 2026-08-01 — `enrichWithAutoReplyBadge` **ยังไม่มีอยู่จริง** (grep `lastMessageAutoReplyKind`/`lastMessageIsAiEnhanced` ทั้งโปรเจกต์ = ว่างเปล่า) นี่คือ spec ล่วงหน้าของ S-20
- **Steps:** เธรดที่ข้อความล่าสุดเป็นของบอท (`autoReplyKind='AUTO'`) vs เธรดที่พนักงานพิมพ์เอง
- **Expected Result:** เธรดแรก `lastMessageAutoReplyKind='AUTO'`; เธรดหลัง `lastMessageAutoReplyKind=null`; ทุกเธรด `lastMessageIsAiEnhanced=false` เสมอ; **ไม่มีการเพิ่ม migration/คอลัมน์ใหม่บน `Conversation`** (SDS §14.4 — ตัดสินใช้ join enrich ไม่ persist)
- **Linked to:** SDS §14.4, API.md §4.42, Scope Baseline S-20 (⚠️ ดูข้อขัดแย้งกับ ux spec Revision v2 ข้อ 6 ท้ายเอกสาร)

---

### 3.21 กลุ่ม U — [E2E] Playwright — คลังคำถาม/คิว/ป้าย DeepBot/นำเข้า-ส่งออก (S-18)

> 🛑 ยังไม่มี UI จริง (`/settings/auto-reply/[id]/qna`, `/settings/auto-reply/unanswered` ยังไม่ถูกสร้าง — S-13/S-14 ยัง TODO) — สคริปต์เหล่านี้เขียนไว้ให้ S-18 เอาไป implement ทันทีที่ backend+UI พร้อม เขียนที่ `e2e/auto-reply-qna.spec.ts` (ต่อยอด `e2e/helpers/auth.ts`) bypass login ด้วย seller ที่ล็อกอินแล้ว, `http://seller.deepth.local:4000` เท่านั้น

#### TC-QE2E-01: E2E — กรอกคำตอบจากคิว → ยิงข้อความจริง → บอทตอบจากคลัง (สายหลักของ Acceptance #1)
- **Steps:** เปิด `/settings/auto-reply/unanswered` → เห็นคำถามในแท็บ "รอกรอก (N)" → กด "กรอกคำตอบ" → เลือกกลุ่มปลายทาง → กรอกคำตอบ → บันทึก → เปิดหน้าจำลอง `/settings/auto-reply/[id]/test` (หรือยิงผ่าน seed message จริงในเธรดทดสอบ) ด้วยคำถามเดียวกัน
- **Expected Result:** แถวหายจากแท็บ "รอกรอก" ทันที (optimistic); ยิงคำถามซ้ำ → บอทตอบด้วยคำตอบที่เพิ่งกรอก; DB มี `AutoReplyQna` แถวใหม่ `source='QUEUE'`
- **Linked to:** Phase Acceptance #1, S-13/S-14/S-18

#### TC-QE2E-02: แท็บ "ข้ามแล้ว" + ปุ่มย้อนกลับมารอกรอก (undo)
- **Steps:** ที่แท็บ "รอกรอก" กด "ข้าม" 1 แถว → สลับไปแท็บ "ข้ามแล้ว" → เห็นแถวนั้น → กด "↩ ย้อนกลับมารอกรอก"
- **Expected Result:** หลังกด "ข้าม": แถวหายจาก "รอกรอก" ทันที + badge `รอกรอก N ข้อ` ลด 1 + toast `pacesToast.success` top-right; แท็บ "ข้ามแล้ว" แสดงแถวพร้อม "ถูกถาม N ครั้ง · ข้ามเมื่อ {formatRelativeDayTime}"; หลังกด undo: แถวกลับไปแท็บ "รอกรอก" + toast `ย้ายกลับไปที่รอกรอกแล้ว` + badge เพิ่มกลับ 1
- **Linked to:** ux spec Revision v2 ข้อ 1, API §4.39

#### TC-QE2E-03: คิวว่าง — empty state เป็นกลาง/บวก ไม่ใช่หน้าพัง
- **Precondition:** ร้านทดสอบใหม่ที่ไม่มีคิวค้างเลย
- **Steps:** เปิด `/settings/auto-reply/unanswered`
- **Expected Result:** icon `circle-check` สีเขียว + หัวข้อ "ไม่มีคำถามที่รอกรอกตอนนี้" + ไม่มีปุ่ม action (ตาม ux spec §State list)
- **Linked to:** ux spec — State list

#### TC-QE2E-04: หน้าคลัง (`/settings/auto-reply/[id]/qna`) — ค้นหา + 4 ตัวกรอง + เลือกหลายข้อ + bulk MOVE
- **Steps:** พิมพ์ค้นหา → เห็นผลกรอง real-time; คลิกชิป `NEVER_USED`; เลือก checkbox 2 แถว → แถบ bulk โผล่ → เลือก "ย้ายกลุ่ม" → เลือกปลายทาง → ยืนยัน
- **Expected Result:** ผลค้นหา/กรองตรง; หลัง MOVE สำเร็จ toast `pacesToast.success` + แถวหายจากตารางปัจจุบัน (ย้ายไปกลุ่มอื่นแล้ว); ถ้า MOVE บางแถวชนซ้ำ → toast/บรรทัดแจ้ง "N รายการย้ายไม่สำเร็จ" พร้อม label ไทยของ `reason` (ไม่โชว์ code ดิบ — ตาม API.md §4.34)
- **Linked to:** S-13, API.md §4.34

#### TC-QE2E-05: นำเข้า CSV — พรีวิวก่อนยืนยันเสมอ
- **Steps:** เลือกไฟล์ CSV ที่มี 1 แถวใหม่ + 1 แถวซ้ำ + 1 แถวรูปแบบผิด → ระบบแสดงพรีวิวจำนวนที่จะเพิ่ม/ซ้ำ/ผิด **ก่อน** กดยืนยัน → กดยืนยัน
- **Expected Result:** พรีวิวตัวเลขตรงกับที่ backend จะคืน (TFR-035 ข้อ 1 — "ต้องแสดงตัวอย่างให้ยืนยันก่อนเขียนเสมอ"); หลังยืนยัน ตารางอัปเดตแสดงแถวใหม่
- **Linked to:** TFR-035, S-16

#### TC-QE2E-06: ส่งออก CSV — ไฟล์เปิดด้วย Excel ไทยได้ (BOM)
- **Steps:** กดปุ่มส่งออก → ตรวจไฟล์ที่ดาวน์โหลด
- **Expected Result:** ไฟล์ขึ้นต้นด้วย BOM, เปิดแล้วภาษาไทยไม่เพี้ยน, คอลัมน์ตรงตาม API.md §4.36
- **Linked to:** API.md §4.36

#### TC-QE2E-07: ป้าย DeepBot ในรายการแชท — ขึ้นเมื่อบอทตอบ, ไม่ขึ้นเมื่อพนักงานตอบเอง
- **Steps:** (1) เปิด inbox ของเธรดที่ข้อความล่าสุดเป็นของบอท (2) เธรดที่ข้อความล่าสุดพนักงานพิมพ์เอง
- **Expected Result:** (1) prefix แสดง icon หุ่นยนต์ + `DeepBot` (`text-primary`) แทน "คุณ: " ธรรมดา (2) แสดง "คุณ: " ปกติ ไม่มีไอคอน — เงื่อนไข **ต้อง**เป็น `lastSenderRole==='SHOP' && lastMessageAutoReplyKind != null` ไม่ใช่ `autoReplyCount > 0` (มิฉะนั้นป้ายจะติดค้างถาวรแม้พนักงานรับช่วงไปแล้ว)
- **Linked to:** SDS §14.4, ux spec Revision v2 ข้อ 4, S-20

#### TC-QE2E-08: mini action ใต้บับเบิลลูกค้า — เติมคำถาม/คำตอบอัตโนมัติ
- **Precondition:** เธรดที่ลูกค้าถามแล้วพนักงานพิมพ์ตอบเอง (ไม่ใช่บอทตอบ) ในข้อความถัดไป
- **Steps:** กด mini action ใต้บับเบิลลูกค้า → sheet เปิดขึ้น
- **Expected Result:** ช่อง "คำถาม" เติมข้อความลูกค้าอัตโนมัติ, ช่อง "คำตอบ" เติมข้อความฝั่งร้านถัดไปในเธรดอัตโนมัติ (ไม่ใช่ช่องว่าง — ตาม TFR-037 ข้อ 2); ถ้าข้อความถัดไปเป็นของบอทเอง (`autoReplyKind!=null`) → ช่องคำตอบ**ไม่เติม**
- **Linked to:** TFR-037, S-22

---

### 3.22 กลุ่ม V — [Regression] สิ่งที่ต้องไม่พัง — phase `00023-qna`

#### TC-QREG-01: 🛑 **BLOCKER** — ร้านที่คำตรงตัวเคยตอบได้ ต้องยังตอบเหมือนเดิมทุกประการหลังเพิ่ม QnA
- **Steps:** รันชุด TC-RES-01..14 (base feature เดิม) ซ้ำหลัง deploy phase `00023-qna` โดยไม่มี QnA ตั้งไว้เลยสำหรับกลุ่มคำที่ใช้ในเทสเหล่านั้น
- **Expected Result:** ผลเหมือนเดิมทุกประการ (ไม่มี `matchedVia`/`qnaId` โผล่มาในเคสที่ไม่เกี่ยวกับคลัง — `matchedVia='KEYWORD'` เสมอเมื่อกลุ่มคำตรง)
- **Linked to:** Phase Acceptance #2

#### TC-QREG-02: โหมดทดสอบ (allowlist เธรดจริง) ยังทำงานปกติเมื่อกลุ่มที่ชนะมาจากคลัง
- **Steps:** รันซ้ำ TC-TM-01/TC-TM-09 (base) แต่ให้คำตอบมาจาก QnA แทนกฎ
- **Expected Result:** พฤติกรรม allowlist เหมือนเดิม (`KEYWORD_TEST_ONLY` เมื่อเธรดไม่อยู่ allowlist) — อ้างอิง TC-GATE-04 ซ้ำในบริบท regression
- **Linked to:** BR-AR-16/17 (base)

#### TC-QREG-03: cooldown ของกลุ่มคำเดิมไม่พังเมื่อผสมคำตอบจากคลังในเธรดเดียวกัน
- **Steps:** ตอบด้วยกฎปกติของกลุ่ม A → ภายใน cooldown ยิงข้อความที่ตรงคลังของกลุ่ม B (คนละกลุ่ม)
- **Expected Result:** กลุ่ม B ตอบได้ปกติ (cooldown แยกตาม `keywordId` ไม่ใช่ทั้งเธรด)
- **Linked to:** AC-018-01 (base) + TFR-032 ข้อ 2

#### TC-QREG-04: ตารางเวลาทำงาน (gate 6.6) ยังบังคับกับกลุ่มคำปกติเหมือนเดิมหลังเพิ่ม gate ของ QnA
- **Steps:** รันซ้ำเคสนอกเวลาทำงานของกลุ่มคำปกติ (ไม่เกี่ยวกับคลัง) บน SHOP-D
- **Expected Result:** `skipReason='OUTSIDE_SCHEDULE'` เหมือนก่อนมี phase นี้ — ยืนยันว่าการเสียบ QnA เข้า gate ไม่ได้ไปแตะลำดับ/เงื่อนไขเดิมของกลุ่มคำ
- **Linked to:** (gate 6.6 เดิม — doc-debt ของ base TestCase.md, ดูหมายเหตุท้าย TC-UF)

#### TC-QREG-05: handoff เมื่อพนักงานตอบเอง (human takeover) ยังหยุดบอททันทีแม้ธุรกิจใช้คลังอยู่
- **Steps:** รันซ้ำ TC-HT-01 (base) ในเธรดที่เคยตอบด้วย QnA มาก่อน
- **Expected Result:** พนักงานพิมพ์ตอบ → `autoReplyPausedUntil` ถูกตั้งตาม `humanTakeoverPauseMode` → ข้อความถัดไปของลูกค้าที่ตรงคลังก็ต้องเงียบเหมือนกับตรงกลุ่มคำ (`PAUSED_HUMAN_TAKEOVER` ไม่สนใจว่าคำตอบจะมาจากทางไหน)
- **Linked to:** BR-AR-13 (base), TD-006

#### TC-QREG-06: 🛑 **BLOCKER — บั๊ก `handoffAt` ล็อกห้องถาวร (prod 2026-07-31, 240 ห้อง) ต้องไม่กลับมา**
- **Steps:** สุ่มยิงข้อความ "ทักทายอิสระ" ที่ไม่ตรงทั้งกลุ่มคำและคลัง 5 แบบต่างกันเข้าเธรดเดียวกันติดต่อกัน (จำลองลูกค้าเปิดบทสนทนาด้วยคำที่ระบบไม่รู้จักซ้ำหลายครั้ง) แล้วยิงข้อความที่ 6 ที่ตรงกลุ่มคำจริง
- **Expected Result:** ทั้ง 5 ข้อความแรก: `handoffAt` ยังเป็น `null` ตลอด (query ยืนยันหลังทุกข้อความ ไม่ใช่แค่ครั้งสุดท้าย), มีแถวใน `AutoReplyUnansweredQuestion` (upsert รวมกันถ้าข้อความซ้ำ, แถวแยกถ้าไม่ซ้ำ); ข้อความที่ 6 **ได้รับคำตอบปกติ** — ถ้า `handoffAt` ถูกเซ็ตแม้แต่ครั้งเดียวในระหว่างนี้ = regression กลับไปเป็นบั๊กเดิม ต้อง block merge ทันที
- **Linked to:** TFR-033 ข้อ 3, memory `project_chat_auto_reply_00023` (บั๊ก handoffAt ล็อกห้องถาวร 240 ห้อง)

---

## 4. Traceability Matrix

### 4.1 Acceptance Criteria ของ [[BRD]] ทั้ง 128 ข้อ

> **กติกา:** ทุก AC ต้องมี TC อย่างน้อย 1 รายการ — ตารางนี้ตรวจแล้วว่า **ไม่มี AC ใดว่าง**

| AC | Test Case ที่ครอบคลุม | ครอบคลุม |
|---|---|---|
| AC-001-01 | TC-CFG-01 | Yes |
| AC-001-02 | TC-CFG-02 | Yes |
| AC-001-03 | TC-CFG-04, TC-MATCH-05 | Yes |
| AC-001-04 | TC-CFG-03 | Yes |
| AC-001-05 | TC-MATCH-06, TC-SEC-04 | Yes |
| AC-001-06 | TC-CFG-05 | Yes |
| AC-001-07 | TC-CFG-06 | Yes |
| AC-001-08 | TC-CFG-07 | Yes |
| AC-002-01 | TC-CFG-08 | Yes |
| AC-002-02 | TC-CFG-09 | Yes |
| AC-002-03 | TC-CFG-10 | Yes |
| AC-002-04 | TC-CFG-11 | Yes |
| AC-002-05 | TC-NORM-07 | Yes |
| AC-003-01 | TC-MATCH-01, TC-MATCH-02, TC-MATCH-03, TC-MATCH-04 | Yes |
| AC-003-02 | TC-TIE-01 | Yes |
| AC-003-03 | TC-CFG-12 | Yes |
| AC-003-04 | TC-CFG-13 | Yes |
| AC-004-01 | TC-SEC-03 | Yes |
| AC-004-02 | TC-SEC-01 | Yes |
| AC-004-03 | TC-SEC-02, TC-SEC-06 | Yes |
| AC-004-04 | TC-CFG-26 | Yes |
| AC-004-05 | TC-CFG-25 | Yes |
| AC-005-01 | TC-CFG-14 | Yes |
| AC-005-02 | TC-CFG-15 | Yes |
| AC-005-03 | TC-CFG-16, TC-RES-15 | Yes |
| AC-005-04 | TC-CFG-17 | Yes |
| AC-006-01 | TC-CFG-18 | Yes |
| AC-006-02 | TC-CFG-19 | Yes |
| AC-006-03 | TC-RES-19 | Yes |
| AC-006-04 | TC-RES-19 | Yes |
| AC-006-05 | TC-RES-13 | Yes |
| AC-007-01 | TC-CFG-20 | Yes |
| AC-007-02 | TC-CFG-21 | Yes |
| AC-007-03 | TC-RES-02 | Yes |
| AC-007-04 | **TC-RES-11** | Yes |
| AC-007-05 | TC-CFG-22 | Yes |
| AC-007-06 | TC-CFG-23, TC-CTX-07 | Yes |
| AC-008-01 | TC-CFG-24 | Yes |
| AC-008-02 | TC-RES-05, TC-RES-10 | Yes |
| AC-008-03 | TC-RES-12 | Yes |
| AC-008-04 | TC-RES-18 | Yes |
| AC-009-01 | TC-RES-01..TC-RES-09, TC-RES-10 | Yes |
| AC-009-02 | TC-RES-16, TC-LOG-01 | Yes |
| AC-009-03 | TC-RES-10, TC-RES-15, TC-RES-17 | Yes |
| AC-009-04 | **TC-RES-14** | Yes |
| AC-009-05 | TC-RES-20, TC-RES-07, TC-RES-08 | Yes |
| AC-010-01 | TC-NORM-01 | Yes |
| AC-010-02 | TC-NORM-02 | Yes |
| AC-010-03 | TC-NORM-03, TC-MATCH-04 | Yes |
| AC-010-04 | TC-NORM-04, TC-NORM-06 | Yes |
| AC-010-05 | **TC-NORM-05**, TC-NORM-03, TC-NORM-06 | Yes |
| AC-010-06 | TC-NORM-08 | Yes |
| AC-011-01 | TC-TIE-07 | Yes |
| AC-011-02 | TC-TIE-01, TC-TIE-02, TC-TIE-03, TC-TIE-04 | Yes |
| AC-011-03 | **TC-TIE-05, TC-TIE-06**, TC-CC-03 | Yes |
| AC-011-04 | TC-TIE-08 | Yes |
| AC-012-01 | TC-INT-01, TC-INT-05 | Yes |
| AC-012-02 | TC-INT-05 | Yes |
| AC-012-03 | **TC-INT-06** | Yes |
| AC-012-04 | TC-NEG-01 | Yes |
| AC-012-05 | TC-NEG-02, TC-INT-10 | Yes |
| AC-013-01 | TC-CTX-01 | Yes |
| AC-013-02 | **TC-CTX-02** | Yes |
| AC-013-03 | TC-CFG-30, TC-CTX-04 | Yes |
| AC-013-04 | TC-CTX-03, TC-CTX-04 | Yes |
| AC-013-05 | TC-CTX-05 | Yes |
| AC-013-06 | TC-CTX-06 | Yes |
| AC-014-01 | TC-CTX-07, TC-CFG-23 | Yes |
| AC-014-02 | **TC-CTX-08** | Yes |
| AC-014-03 | TC-CTX-09 | Yes |
| AC-014-04 | TC-CTX-10 | Yes |
| AC-014-05 | TC-CTX-11 | Yes |
| AC-015-01 | TC-NEG-05 | Yes |
| AC-015-02 | **TC-NEG-04**, TC-REG-03 | Yes |
| AC-015-03 | TC-NEG-06, TC-SEC-06 | Yes |
| AC-015-04 | **TC-NEG-07**, TC-REG-01, TC-REG-02, TC-REG-03 | Yes |
| AC-016-01 | **TC-HT-01**, TC-CC-04 | Yes |
| AC-016-02 | TC-HT-02, TC-HT-03, TC-CFG-28 | Yes |
| AC-016-03 | TC-HT-04 | Yes |
| AC-016-04 | TC-HT-05 | Yes |
| AC-016-05 | TC-HT-06, **TC-DUP-05** | Yes |
| AC-016-06 | TC-HT-07 | Yes |
| AC-017-01 | **TC-DUP-02** | Yes |
| AC-017-02 | **TC-DUP-01** | Yes |
| AC-017-03 | **TC-DUP-03** | Yes |
| AC-017-04 | **TC-DUP-04, TC-DUP-05** | Yes |
| AC-017-05 | **TC-CC-01**, TC-CC-02, TC-CC-04 | Yes |
| AC-018-01 | TC-LIM-01, TC-LIM-02 | Yes |
| AC-018-02 | TC-LIM-03 | Yes |
| AC-018-03 | TC-CFG-29 | Yes |
| AC-018-04 | TC-LIM-04 | Yes |
| AC-018-05 | TC-LIM-05, TC-CC-02 | Yes |
| AC-019-01 | TC-HO-01, TC-LIM-03, TC-NEG-03, TC-CFG-27 | Yes |
| AC-019-02 | TC-CFG-27 | Yes |
| AC-019-03 | TC-HO-02 | Yes |
| AC-019-04 | TC-HO-03 | Yes |
| AC-019-05 | TC-HO-04 | Yes |
| AC-020-01 | TC-SIM-01 | Yes |
| AC-020-02 | **TC-SIM-02** | Yes |
| AC-020-03 | TC-SIM-03 | Yes |
| AC-020-04 | TC-SIM-04 | Yes |
| AC-020-05 | **TC-SIM-05** | Yes |
| AC-020-06 | TC-SIM-06 | Yes |
| AC-021-01 | TC-TM-02 | Yes |
| AC-021-02 | TC-TM-03 | Yes |
| AC-021-03 | **TC-TM-01**, TC-TM-11 | Yes |
| AC-021-04 | TC-TM-04 | Yes |
| AC-021-05 | **TC-TM-05**, TC-TM-11 | Yes |
| AC-021-06 | TC-TM-06 | Yes |
| AC-021-07 | TC-TM-07 | Yes |
| AC-021-08 | TC-TM-08 | Yes |
| AC-021-09 | **TC-TM-09**, TC-HT-08 | Yes |
| AC-021-10 | TC-TM-10 | Yes |
| AC-022-01 | TC-INT-01, TC-INT-02 | Yes |
| AC-022-02 | TC-INT-02 | Yes |
| AC-022-03 | TC-INT-03 | Yes |
| AC-022-04 | TC-INT-04 | Yes |
| AC-023-01 | TC-INT-07 | Yes |
| AC-023-02 | TC-INT-08 | Yes |
| AC-023-03 | TC-DUP-06, TC-CC-01, TC-CC-05 | Yes |
| AC-023-04 | TC-NEG-03 | Yes |
| AC-023-05 | TC-INT-09 | Yes |
| AC-024-01 | TC-LOG-01, TC-INT-01, TC-NORM-08 | Yes |
| AC-024-02 | **TC-LOG-02**, TC-DUP-07, TC-HT-08, TC-NEG-08 | Yes |
| AC-024-03 | TC-LOG-03 | Yes |
| AC-024-04 | TC-SEC-08 | Yes |
| AC-024-05 | TC-LOG-04 | Yes |
| AC-024-06 | TC-SEC-09, TC-SEC-04 | Yes |

**สรุป:** 128 / 128 AC มี TC ครอบคลุม — **ไม่มีช่องโหว่**

### 4.2 Business Rules ของ [[BRD]] §8 (BR-AR-01..30)

| BR | Test Case ที่ครอบคลุม |
|---|---|
| BR-AR-01 (ทุกการตั้งค่าผูกกับร้าน) | TC-MATCH-06, TC-SEC-04, TC-SEC-05 |
| BR-AR-02 (normalize ก่อนเทียบเสมอ) | TC-NORM-01..08 |
| BR-AR-03 (1 ข้อความ ≤1 คำตอบ) | TC-TIE-07 |
| BR-AR-04 (เกณฑ์ตัดสิน 4 ชั้น + ผู้ชนะแน่นอน) | TC-TIE-01..06 |
| BR-AR-05 / BR-AR-26 (บันทึกทุกการตัดสินใจ) | TC-TIE-08, TC-LOG-01, TC-LOG-02 |
| BR-AR-06 (ถอยระดับได้เสมอ) | TC-RES-07, TC-RES-08, TC-RES-10 |
| BR-AR-07 (โฆษณาไม่รู้จัก → ถอยไปเพจ) | TC-RES-11 |
| BR-AR-08 (ไม่เหลือระดับ → เงียบ+ส่งต่อคน) | TC-RES-14 |
| BR-AR-09 (บริบทโฆษณาตัวล่าสุด) | TC-CTX-01, TC-CTX-02 |
| BR-AR-10 (ประวัติโฆษณาเก็บครบ) | TC-CTX-06 |
| BR-AR-11 (บันทึกที่มา+เวลาบริบท) | TC-CTX-05 |
| BR-AR-12 (MANUAL ชนะ / ใหม่กว่าชนะ) | TC-CTX-08, TC-CTX-09 |
| BR-AR-13 (พนักงานตอบ = หยุดทันที) | TC-HT-01 |
| BR-AR-14 (สแปม/ส่งต่อแล้ว ไม่ตอบ) | TC-HT-07 |
| BR-AR-15 (สถานะหยุดต้องมองเห็นได้) | TC-HT-04 |
| BR-AR-16 (โหมดทดสอบ = ตอบเฉพาะ allowlist) | TC-TM-01 |
| BR-AR-17 (ตรวจโหมดทดสอบก่อน gate ต้นทุน) | TC-TM-09, TC-HT-08 |
| BR-AR-18 (ทดสอบส่งจริง + ติดป้าย) | TC-TM-04, TC-TM-05 |
| BR-AR-19 (ยืนยันพร้อมชื่อเธรด) | TC-TM-06 |
| BR-AR-20 (มองเห็นตลอด + หมดอายุเอง) | TC-TM-07, TC-TM-08 |
| BR-AR-21 (1 ข้อความ ≤1 ครั้ง แม้ประมวลผลซ้ำ) | TC-DUP-01, TC-DUP-02 |
| BR-AR-22 (ข้อความฝั่งร้านห้ามตรวจจับ) | TC-DUP-04, TC-DUP-05 |
| BR-AR-23 (ส่งสำเร็จแต่บันทึกพัง) | TC-DUP-03 |
| BR-AR-24 (ส่งต่อ = เปลี่ยนสถานะ+หยุด+แจ้ง+บันทึก) | TC-HO-02 |
| BR-AR-25 (ผู้รับช่วงเห็นบริบทครบ) | TC-HO-03 |
| BR-AR-27 (ปกปิดข้อมูลอ่อนไหว) | TC-SEC-08 |
| BR-AR-28 (กลุ่มเปิดต้องมีคำ+คำตอบ) | TC-CFG-09, TC-CFG-15 |
| BR-AR-29 (คำตอบว่าง = ไม่มีคำตอบ) | TC-CFG-16, TC-RES-15 |
| BR-AR-30 (เฉพาะ OWNER/ADMIN แก้ได้) | TC-SEC-02, TC-SEC-03 |

### 4.3 ความต้องการด้านคุณภาพ ([[BRD]] §6) ที่ไม่ได้อยู่ในรูป AC

| ข้อกำหนด | Test Case |
|---|---|
| §6.1 ผลลัพธ์เดิมทุกครั้งเมื่อข้อมูลเหมือนเดิม | TC-TIE-06, TC-SIM-05, TC-CC-03 |
| §6.3 ความล้มเหลวไม่กระทบการรับข้อความ/ตอบด้วยมือ | TC-INT-03, TC-NEG-07 |
| §6.4 ส่งอัตโนมัติได้เฉพาะเธรดของร้านเจ้าของ | TC-SEC-05 |
| §6.4 ข้อความลูกค้าเป็นเนื้อหา ไม่ใช่คำสั่ง | TC-SEC-07 |
| §7.2 หน้าต่างตอบกลับ 24 ชม. | TC-INT-10 |
| §7.2 การเปลี่ยนแปลง DB เป็นแบบเพิ่มอย่างเดียว | TC-REG-02, TC-REG-03 |
| มาตรฐาน UI ของโปรเจกต์ (Hard Rule 3/7/9/12) | TC-REG-04 |

### 4.4 Traceability เพิ่มเติม — phase `00023-qna` (TFR-031..037, ไม่มี AC-0XX ของตัวเอง — trace ตรงไปที่ SRS/Scope Baseline)

| TFR / Acceptance / S-id | Test Case ที่ครอบคลุม |
|---|---|
| TFR-031 (`matchQna`) | TC-QM-01..03 + ไฟล์เทสเดิม `auto-reply-qna-match.test.ts` (14 เคส) |
| TFR-032 (ตำแหน่งใน gate) | TC-GATE-01..11 🛑 ทั้งกลุ่มเป็น BLOCKER |
| TFR-033 (คิว) | TC-USV-01..05, TC-USV-11..13, TC-GATE-09, TC-QREG-06 |
| TFR-034 (CRUD/bulk/cache) | TC-QSV-01..16 |
| TFR-035 (CSV) | TC-QAPI-09..11 (⚠️ TC-QAPI-10 blocked — OQ-5 ยังไม่ตัดสิน) |
| TFR-036 (รูปแนบ) | TC-QSV-03 (answer ว่าง+รูป), TC-GATE-10 (ส่งจริง) — ส่วนใหญ่ "Done (base)" ตาม SDS §14.8 |
| TFR-037 (mini action จากแชท) | TC-MAPI-01..04, TC-USV-12..13 |
| Scope Baseline S-20 (ป้าย DeepBot) | TC-QAPI-12, TC-QE2E-07 |
| Scope Baseline S-16 (CSV) | TC-QAPI-09..11, TC-QE2E-05..06 |
| Scope Baseline S-22 (mini action) | TC-MAPI-01..04, TC-QE2E-08 |
| Phase Acceptance #1 (ตอบจากคลังหลังกรอก) | TC-USV-09, TC-GATE-01, TC-QE2E-01 |
| Phase Acceptance #2 (คำตรงตัวชนะเสมอ) | TC-GATE-01, TC-GATE-02, TC-QREG-01 |
| Phase Acceptance #3 (OFFLINE/TEST/นอกเวลา ไม่ตอบ) | TC-GATE-03, TC-GATE-04, TC-GATE-05 |
| Phase Acceptance #4 (คิวไม่มี PII) | TC-UF-01..03 + ไฟล์เทสเดิม `auto-reply-unanswered-filter.test.ts` (17 เคส) |
| Phase Acceptance #5 (หน้าคลัง ค้นหา/กรอง/เลือกหลาย/ย้ายกลุ่ม) | TC-QE2E-04 |

---

## 5. สรุปจำนวนเคสตามประเภท

**รวมทั้งหมด 164 test case** — กระจายตามกลุ่มดังนี้

| กลุ่ม | รหัส | จำนวน | ประเภทหลัก |
|---|---|---|---|
| A · normalize | `TC-NORM-*` | 8 | Unit (1 เคสเป็น Integration) |
| B · matching 3 รูปแบบ | `TC-MATCH-*` | 6 | Unit |
| C · ตัดสินเมื่อตรงหลายกลุ่ม | `TC-TIE-*` | 8 | Unit + Integration |
| D · rule resolution 9 ระดับ | `TC-RES-*` | 20 | Unit + Integration |
| E · การตั้งค่า | `TC-CFG-*` | 30 | E2E + Integration |
| F · pipeline ทั้งเส้น | `TC-INT-*` | 10 | Integration |
| G · กันตอบซ้ำ | `TC-DUP-*` | 7 | Integration (BLOCKER ทั้งกลุ่ม) |
| H · หยุดเมื่อพนักงานตอบ | `TC-HT-*` | 8 | Integration + E2E |
| I · บริบทโฆษณา/สินค้า | `TC-CTX-*` | 11 | Integration |
| J · จำกัดจำนวน/ระยะพัก | `TC-LIM-*` | 5 | Integration |
| J · ส่งต่อพนักงาน | `TC-HO-*` | 4 | Integration + E2E |
| K · โหมดทดสอบเธรดจริง | `TC-TM-*` | 11 | Integration + E2E + Manual |
| K · หน้าทดสอบแบบกรอกเอง | `TC-SIM-*` | 6 | E2E + Integration |
| L · concurrency | `TC-CC-*` | 5 | Concurrency |
| M · สิทธิ์และขอบเขตร้าน | `TC-SEC-*` | 9 | E2E + Integration |
| N · ความล้มเหลว/สวิตช์ปิด | `TC-NEG-*` | 8 | Integration + E2E |
| O · บันทึกและการค้นหา | `TC-LOG-*` | 4 | Integration + E2E |
| P · regression | `TC-REG-*` | 4 | Integration + E2E + Manual |

| ระดับเทส (นับตามป้ายที่ระบุในเคส — เคสหนึ่งมีได้มากกว่า 1 ระดับ) | จำนวนครั้งที่ปรากฏ |
|---|---|
| [Integration] | 86 |
| [E2E] | 55 |
| [Unit] | 37 |
| [Manual] | 9 |
| [Concurrency] | 5 |

**เคสที่เป็น 🛑 BLOCKER (ห้าม merge ถ้าไม่ผ่าน) — 31 เคส:**
TC-NORM-05 · TC-MATCH-06 · TC-TIE-06 · TC-RES-10 · TC-RES-11 · TC-RES-14 · TC-CFG-19 · TC-INT-01 · TC-INT-03 · TC-INT-06 · TC-DUP-01 · TC-DUP-02 · TC-DUP-03 · TC-DUP-04 · TC-DUP-05 · TC-HT-01 · TC-CTX-02 · TC-CTX-08 · TC-TM-01 · TC-TM-05 · TC-TM-09 · TC-SIM-02 · TC-SIM-05 · TC-CC-01 · TC-SEC-02 · TC-SEC-04 · TC-SEC-05 · TC-NEG-02 · TC-NEG-04 · TC-NEG-07 · TC-LOG-02

### 5.1 เพิ่มเติม phase `00023-qna` (เพิ่ม 2026-08-01 — นับแยกจาก 164 เคสเดิมของ base feature)

**รวมเพิ่ม 74 test case** (BLOCKER 19 เคส) — ไม่รวมเทส unit ที่มีอยู่แล้วในไฟล์จริง (`auto-reply-qna-match.test.ts` 14 เคส + `auto-reply-unanswered-filter.test.ts` 17 เคส = 31 เคสที่ผ่านแล้วก่อนเอกสารนี้ถูกเขียน)

| กลุ่ม | รหัส | จำนวน | ประเภทหลัก |
|---|---|---|---|
| Q · unit gap (matchQna/filter) | `TC-QM-*` / `TC-UF-*` | 6 | Unit |
| R · qna/unanswered service | `TC-QSV-*` / `TC-USV-*` | 29 | Integration (1 เคสใช้ partial mock — TC-USV-11) |
| S · ตำแหน่งใน gate | `TC-GATE-*` | 11 | Integration — 🛑 **ทั้งกลุ่มเป็น BLOCKER** |
| T · API contract | `TC-QAPI-*` / `TC-UAPI-*` / `TC-MAPI-*` / `TC-SIMX-*` | 27 | API |
| U · E2E Playwright (S-18) | `TC-QE2E-*` | 8 | E2E |
| V · regression | `TC-QREG-*` | 6 | Integration — 2 เคสเป็น BLOCKER (TC-QREG-01, TC-QREG-06) |

**เคสที่เป็น 🛑 BLOCKER ของ phase `00023-qna` — 19 เคส:**
TC-QSV-12 · TC-USV-03 · TC-USV-04 · TC-USV-11 · TC-GATE-01 · TC-GATE-02 · TC-GATE-03 · TC-GATE-04 · TC-GATE-05 · TC-GATE-06 · TC-GATE-09 · TC-QAPI-04 · TC-QAPI-05 · TC-QAPI-10 · TC-UAPI-05 · TC-SIMX-01 · TC-QREG-01 · TC-QREG-06

**รวมทั้งภาคผนวก:** base feature 164 + phase `00023-qna` 74 = **238 test case** (BLOCKER รวม 31 + 19 = 50)

---

## 6. Flow

### 6.1 ลำดับ gate ที่ชุดทดสอบยึด (ตาม [[PRD]] §4.3) — ใช้เป็นแผนที่ของ TC-HT-08 และ TC-TM-09

```mermaid
flowchart TD
    Start([ข้อความขาเข้าถูกบันทึก]) --> J1[สร้าง AutoReplyJob<br/>chatMessageId unique]
    J1 --> D0{สร้างสำเร็จ?}
    D0 -- ชนกับแถวเดิม --> SKIP0[SKIPPED · DUPLICATE_JOB<br/>TC-DUP-01]
    D0 -- ใช่ --> G1{ข้อความจากฝั่งร้าน?<br/>senderRole=SHOP}
    G1 -- ใช่ --> SKIP1[SKIPPED · OUTBOUND_MESSAGE<br/>TC-DUP-04]
    G1 -- ไม่ --> G2{ร้านเปิด auto-reply?}
    G2 -- ไม่ --> SKIP2[SKIPPED · SHOP_DISABLED<br/>TC-NEG-04/05]
    G2 -- ใช่ --> G3{อยู่ในโหมดทดสอบ<br/>และเธรดอยู่ใน allowlist?}
    G3 -- อยู่ในโหมดแต่ไม่ใช่เธรดทดสอบ --> SKIP3[SKIPPED · NOT_IN_TEST_ALLOWLIST<br/>TC-TM-01 · TC-TM-09]
    G3 -- ผ่าน --> G4{เธรดพร้อมรับ?<br/>ไม่สแปม · ไม่ handoff<br/>ไม่ถูกหยุด · เธรดไม่ปิด}
    G4 -- ไม่ --> SKIP4[SKIPPED · SPAM / HANDED_OFF /<br/>PAUSED_HUMAN_TAKEOVER / CONVERSATION_DISABLED<br/>TC-HT-01 · TC-HT-07 · TC-NEG-06]
    G4 -- ใช่ --> G5{ยังไม่ครบจำนวนสูงสุด?}
    G5 -- ครบแล้ว --> HO1[HANDOFF · MAX_REPLIES_REACHED<br/>TC-LIM-03]
    G5 -- ยังไม่ครบ --> N1[normalize ข้อความ<br/>TC-NORM-01..08]
    N1 --> M1{ตรงกลุ่มคำใด?}
    M1 -- ไม่ตรง --> R7{มีคำตอบกลางเพจ/ร้าน?}
    R7 -- มี --> SEND
    R7 -- ไม่มี --> HO2[HANDOFF · NO_KEYWORD_MATCH<br/>TC-RES-14]
    M1 -- ตรง 1 หรือหลายกลุ่ม --> T1[ตัดสินผู้ชนะ 4 เกณฑ์<br/>TC-TIE-01..06]
    T1 --> G6{ติดระยะพักของกลุ่มนี้?}
    G6 -- ติด --> SKIP5[SKIPPED · KEYWORD_COOLDOWN<br/>TC-LIM-01]
    G6 -- ไม่ติด --> RES[เลือกกฎจากเฉพาะสุดไล่ถอยลง<br/>TC-RES-01..20]
    RES --> G7{ได้คำตอบที่ไม่ว่าง?}
    G7 -- ไม่ได้ --> HO3[HANDOFF · NO_RULE_MATCH / EMPTY_REPLY<br/>TC-RES-15]
    G7 -- ได้ --> G8{หน้าต่าง 24 ชม. เปิดอยู่<br/>และช่องทาง active?}
    G8 -- ไม่ --> SKIP6[SKIPPED · WINDOW_CLOSED / CHANNEL_INACTIVE<br/>TC-INT-10 · TC-NEG-08]
    G8 -- ใช่ --> SEND[ส่งข้อความตรงทุกตัวอักษร<br/>TC-INT-06]
    SEND --> S1{ส่งสำเร็จ?}
    S1 -- ไม่ --> F1[FAILED · บันทึก lastError<br/>TC-NEG-01/02/03]
    S1 -- ใช่ --> W1[เขียน ChatMessage ขาออก<br/>autoReplyKind AUTO หรือ AUTO_TEST<br/>ถ้าชน externalMessageId ต้อง UPDATE<br/>TC-DUP-05]
    W1 --> LOG
    F1 --> LOG
    SKIP0 --> LOG
    SKIP1 --> LOG
    SKIP2 --> LOG
    SKIP3 --> LOG
    SKIP4 --> LOG
    SKIP5 --> LOG
    SKIP6 --> LOG
    HO1 --> LOG
    HO2 --> LOG
    HO3 --> LOG
    LOG[เขียน AutoReplyLog พร้อมเหตุผลเสมอ<br/>TC-LOG-01 · TC-LOG-02] --> End([จบ])
```

### 6.2 ลำดับการรันชุดทดสอบ (แนะนำ)

```mermaid
flowchart LR
    A[1· Unit<br/>normalize · match · tiebreak · resolve] --> B[2· migrate deploy<br/>+ restart dev server]
    B --> C[3· Integration<br/>pipeline · dedupe · takeover · context · limits]
    C --> D[4· Concurrency]
    D --> E[5· E2E<br/>settings · testmode · permission · logs]
    E --> F[6· Regression<br/>TC-NEG-07 · TC-REG-01..04]
    F --> G[7· Manual<br/>Messenger จริง · visual QA]
```

> **หมายเหตุลำดับ:** TC-CFG-19 (unique `NULLS NOT DISTINCT`) ต้องรัน **ทันทีหลังขั้นที่ 2** เพราะเป็นเคสที่พิสูจน์ว่าไฟล์ migration ที่เขียนมือถูกต้อง — ถ้าไม่ผ่าน ให้หยุดทั้งชุดแล้วกลับไปแก้ migration ก่อน

---

## 7. ผลล่าสุด

| Run | วันที่ | ผล (Pass/Fail/Blocked) | ผู้ทดสอบ (Tester) |
|-----|--------|--------------------------|---------------------|
| — | — | **ยังไม่เคยรัน** — เอกสารเขียนก่อนมีโค้ด (doc-first) | — |

---

## 8. สรุป (Summary)

เอกสารนี้กำหนดชุดเคสทดสอบ **164 เคส (BLOCKER 31 เคส)** ของ **Chat Auto-Reply (00023)** ที่ trace กลับ Acceptance Criteria ใน [[BRD]] **ครบทั้ง 128 ข้อ** และ Business Rules ครบทั้ง 30 ข้อ

น้ำหนักของชุดทดสอบถูกจัดตามความเสียหายที่แก้ย้อนหลังไม่ได้ ไม่ใช่ตามความยากของโค้ด — 3 กลุ่มที่ลงแรงหนักที่สุดคือ:

1. **การกันตอบซ้ำ (กลุ่ม G + L)** — ทุกเคสเป็น BLOCKER เพราะ [[PRD]] §1.2 กำหนดอัตราการตอบซ้ำเป็น **0 แบบ hard requirement** ไม่ใช่เป้าหมาย และความเสียหายต่อความน่าเชื่อถือเกิดทันทีที่ลูกค้าเห็น จุดที่ละเอียดที่สุดคือ **TC-DUP-05** (echo ของคำตอบตัวเองมาถึงก่อนที่เราจะเขียนแถว) ซึ่ง [[DATABASE]] §6 ระบุว่าโค้ดปัจจุบันที่ `sendOutboundMessage:879-885` ยังทำผิดอยู่ — ถ้าไม่แก้ ระบบจะหยุดตัวเองทุกครั้งที่ตอบ
2. **โหมดทดสอบ (กลุ่ม K)** — **TC-TM-01** คือคำสัญญาที่ทำให้ร้านกล้าเปิดใช้ (เธรดอื่นทั้งร้านเงียบสนิท) และ **TC-SIM-05** (parity ระหว่างหน้าจำลองกับพฤติกรรมจริง) เป็นเคสที่บังคับให้หน้าจำลองเรียก resolver ตัวเดียวกับ pipeline จริง ไม่ใช่เขียน logic ซ้ำ — ถ้าแยกกันเมื่อไหร่ หน้าจำลองจะกลายเป็นเครื่องมือที่หลอกร้าน
3. **การถอยระดับ (กลุ่ม D)** — **TC-RES-11** (โฆษณาไม่รู้จักต้องถอยไปเพจ ไม่ใช่หยุดตอบ) เป็นเคสที่แยก "ระบบที่ใช้ได้จริง" ออกจาก "ระบบที่ร้านต้องตั้งค่าครบก่อนถึงจะเริ่มใช้ได้"

**Open Questions — ต้องตอบก่อนเริ่มเขียนโค้ด:**

| # | ประเด็น | ผลกระทบต่อ TC | ผู้ตัดสิน |
|---|---|---|---|
| Q1 | **เกณฑ์ tie-break ชั้นสุดท้าย** เมื่อเท่ากันทุกเกณฑ์ของ BR-AR-04 — [[DATABASE]] ไม่ได้ freeze ไว้ (ข้อเสนอ: `AutoReplyKeyword.createdAt ASC` แล้ว `id ASC`) | TC-TIE-05, TC-TIE-06 | SDS |
| Q2 | **`specificity` = 2 และ 3** (โฆษณาที่ไม่ระบุเพจ) ไม่มีชื่อระดับใน `resolutionLevel` FROZEN §3.8 — จะแมปเป็นค่าใด | TC-RES-16, TC-RES-18 | SDS + safepay-database |
| Q3 | **`isEnabled=false` ที่ร้าน + `autoReplyEnabled=true` ที่เธรด** — AC-015-02 (kill switch) ขัดกับ AC-015-03 (เธรดชนะร้าน) ตรงตัว | TC-NEG-06 | **PO** |
| Q4 | **ขีดจำกัดความยาว `replyText`** ไม่มีตัวเลขใน BRD (ข้อเสนอ 2,000 อักษร) | TC-CFG-17 | SRS |
| Q5 | **เกณฑ์เวลาตอบกลับ** "ไม่กี่วินาที" ไม่มีตัวเลข (ข้อเสนอ p95 ≤ 5 วินาที) | TC-INT-04 | SRS |
| Q6 | **max attempts + backoff** ของ `AutoReplyJob` — [[DATABASE]] มี `attempts` แต่ไม่ freeze เพดาน | TC-NEG-02, TC-NEG-03 | SDS |
| Q7 | **ช่องทางการแจ้งพนักงาน** ตอน handoff และตอนโหมดทดสอบหมดอายุ ยังไม่ระบุใน BRD | TC-HO-02, TC-TM-08 | SRS |
| Q8 | **ระยะเวลาหมดอายุเริ่มต้นของโหมดทดสอบ** และวิธีปิด (cron หรือ lazy ตอนอ่าน) | TC-TM-08 | SDS |
| Q9 | **นิยาม "พบบริบทสินค้าใหม่"** ในโหมด `UNTIL_NEW_PRODUCT` — นับเฉพาะ `MANUAL` หรือรวม `ADS_MAPPING` | TC-CTX-04 | SRS |
| Q10 | **โหมด `MANUAL` / `UNTIL_RESOLVED`** แทนสถานะ "หยุดไม่มีกำหนด" ด้วยอะไร (`autoReplyPausedUntil` เป็น DateTime อย่างเดียว) | TC-HT-03 | SDS + safepay-database |
| Q11 | **กลไกตรวจ "ส่งไปแล้ว"** ใน TC-DUP-03 — ใช้ `ChatMessage` ขาออกที่ผูกกับ job หรือ `AutoReplyLog.decision="REPLIED"` | TC-DUP-03 | SDS |
| Q12 | **พฤติกรรมเมื่อกฎถูกแก้ระหว่างประมวลผล** — ใช้ snapshot หรือ re-validate ก่อนส่ง | TC-CC-03 | SDS |

| Q13 | **`convertUnansweredToQna` ไม่ใช่ทรานแซกชันเดียวจริง** (โค้ดจริงไม่มี `prisma.$transaction`) ขัดกับ comment ในโค้ดและ API.md §3.9 — ต้องแก้ก่อน merge S-11 หรือแก้เอกสารให้ตรงกับความเสี่ยงที่ยอมรับ | TC-USV-11 🛑 BLOCKER | dev (S-11) |
| Q14 | **เพดานแถว CSV import ขัดกัน 3 แหล่ง** (SRS 1,000 / `parseCsv()` จริง 500 / mockup "ตัดเฉพาะ 500 แถวแรก") | TC-QAPI-10 | safepay-planner/PO (= API.md OQ-5) |
| Q15 | **`SHOP_LOCKED` (403) ที่ API.md อ้างว่าบังคับ "ทุก endpoint ที่เขียน" ไม่ถูก implement จริงในโค้ดปัจจุบันเลยสักจุด** — `requireShopContext()`/`forbidIfReadOnly()` (`auto-reply-route-context.ts`) ไม่อ่าน `activeCtx.locked` เลย ทั้งฐาน feature เดิม (keywords/rules/config) และ endpoint ใหม่ของ phase นี้จะสืบทอดช่องโหว่เดียวกันถ้าไม่แก้ helper ก่อน | ทุก TC ที่อ้าง 403 SHOP_LOCKED ใน API §5 (ยังไม่มี TC เฉพาะ — ต้องเพิ่มหลัง fix) | dev + safepay-reviewer |
| Q16 | **role `STAFF` ไม่มีอยู่จริงใน `ShopMember.role`** (มีแค่ `OWNER`/`ADMIN`) ทำให้เทส 403 FORBIDDEN_ROLE ทุกจุดต้อง seed ค่า role แปลกปลอมตรง ๆ — ซ้ำกับ API.md OQ-1 เดิม ยกมาย้ำเพราะกระทบทุก endpoint ใหม่ | TC-QAPI-05 และทุก TC ที่อ้าง 403 | ยืนยันแล้วเป็น known-gap (API.md OQ-1) |

**ข้อจำกัดความครอบคลุมที่ต้องยอมรับอย่างเปิดเผย:**

- **AC-019-01** ("ลูกค้าขอคุยกับคน / ร้องเรียน / ถามเรื่องคืนเงิน") ทดสอบได้เฉพาะผ่าน `handoffPhrases` ที่ร้านตั้งเอง — เฟสนี้ไม่มี AI ตรวจเจตนา ข้อความร้องเรียนที่ไม่ตรงคำที่ตั้งไว้จะไม่ถูกจับ **ต้องระบุข้อจำกัดนี้ใน SRS ให้ตรงกับความคาดหวัง** (TC-HO-01)
- **AC-021-04** (ข้อความส่งถึงผู้รับจริง) ทดสอบอัตโนมัติไม่ได้ ต้องเป็น [Manual] บน Messenger จริงและขออนุญาต user ก่อนทุกครั้ง
- **AC-022-04** (เวลาตอบกลับ) วัดบน dev ที่ไม่มีโหลดจริง ตัวเลขที่ได้เป็น baseline ไม่ใช่ข้อพิสูจน์พฤติกรรมบน production

---

**หมายเหตุ:** เอกสารนี้ trace จาก [[BRD]] v1.0 และ [[DATABASE]] v1.0 (FROZEN) — ถ้าเอกสารต้นทางเวอร์ชันใดถูกแก้ ต้องกลับมาปรับ traceability matrix §4 ก่อนรันชุดทดสอบรอบถัดไป



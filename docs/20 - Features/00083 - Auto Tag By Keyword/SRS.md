---
title: "SRS — 00083 ติด tag อัตโนมัติจากคำที่ร้านพิมพ์ + เมนูจัดการ tag"
owner: shinobu22
status: draft
created: 2026-10-21
tags: [feature, srs, chat, tag, automation]
related: ["[[PRD]]", "[[BRD]]", "[[SDS]]", "[[API]]", "[[DATABASE]]", "[[TestCase]]"]
---

> **โมดูล:** 00083 - Auto Tag By Keyword
> **ประเภทเอกสาร:** Software Requirements Specification (SRS) - TECHNICAL
> **เวอร์ชัน:** 1.0
> **วันที่จัดทำ:** 2026-10-21
> **สถานะ:** Draft — เขียนจาก PRD/BRD (approved) + DATABASE (ล็อก commit 07e343867) + โค้ดจริงใน worktree `safepay-00083` (ยังไม่ implement)
> **เจ้าของเอกสาร:** SA

# SRS: ติด tag อัตโนมัติจากคำที่ร้านพิมพ์ + เมนูจัดการ tag (Technical)

---

## 1. บทนำ

### 1.1 วัตถุประสงค์
กำหนดข้อกำหนดเชิงเทคนิคของ (ก) หน้า+API จัดการ tag ของร้าน (ข) ตัวติด tag อัตโนมัติเมื่อร้านพิมพ์ข้อความที่มีคำ (ค) ตัวถอด tag อัตโนมัติเมื่อสร้างคำสั่งซื้อที่ผูกห้อง (ง) ประวัติขั้นต่ำ สำหรับ DEV/QA

### 1.2 ขอบเขตเชิงระบบ
- **ในขอบเขต:** `src/lib/shop-tag-match.ts` · `src/lib/shop-tag-schemas.ts` · `src/services/shop-tag.service.ts` · `src/services/shop-tag-auto.service.ts` · hook 3 จุด (`chat.service.ts` · `chat-outbox.service.ts` · `api/channels/facebook/webhook/route.ts`) · hook 2 จุดใน `order.service.ts` (`createOrder` · `promoteDraftCore`) · route `/api/shops/current/tags/**` · หน้า `/settings/tags` · เมนู CHAT · `getShopTags` (ตัวช่วยพิมพ์ tag)
- **นอกขอบเขต:** OOS-1..13 ใน scope baseline (ห้อง DEEP · ข้อความลูกค้า · LINE ที่พิมพ์ในแอป LINE OA · regex/AI · ย้อนหลัง · ถอดจากเหตุการณ์อื่น · หน้าดูประวัติ · ไล่แก้ตัวกรองที่บันทึกไว้ · capability ใหม่)
- **ไม่เปลี่ยน schema:** ใช้ `ShopTag` + `ShopTagEvent` ตาม [[DATABASE]] ที่ล็อกแล้วทุกตัวอักษร

### 1.3 เอกสารอ้างอิง
| เอกสาร | ความสัมพันธ์ |
|---|---|
| [[PRD]] · [[BRD]] | FR-001..009 · BR-AT-01..30 · มติ P-1..P-8 · Q-1..Q-7 |
| [[DATABASE]] | โครงตาราง + SQL ที่ service ใช้กับ `ExternalContact.tags` (§4) |
| [[SDS]] | TD-001..012 (โครงโมดูล · sequence · รายการไฟล์+บรรทัด) |
| `docs/scope/2026-10-21-00083-auto-tag-keyword-scope-baseline.md` | S-1..S-8 · OOS-1..13 |
| 00061 `auto-order-normalize.ts` / `auto-order-parser.ts::matchesTriggerPhrase` | ตัวเทียบคำ (P-4) — ใช้ตัวเดิม ห้ามเขียนซ้ำ |
| `docs/SRS.md` | §3.4 · §6.73 · §7.31 · §8.17 · §9.13 · §10.13 (sync แล้วตามหัวข้อ "ข้อความเพิ่มใน SRS.md" ของ phase นี้) |

### 1.4 นิยาม
| คำ | ความหมาย |
|----|----------|
| **ห้อง** | `Conversation` ที่มี `externalContactId` (Messenger/IG/LINE) — ห้อง DEEP (`externalContactId = NULL`) ไม่มีที่เก็บ tag |
| **tag บนห้อง** | สตริงใน `ExternalContact.tags` (ไม่มี FK) — 1 ผู้ติดต่อ = 1 ห้องต่อเพจ (`Conversation @@unique([shopChannelId, externalContactId])`) |
| **tag ที่ลงทะเบียน** | แถว `ShopTag` — `name` คือสะกดมาตรฐาน · `keywords` = คำที่ทำให้ติด · `removeOnOrderCreate` = สวิตช์ถอด |
| **tag ที่ยังไม่ลงทะเบียน** | สตริงที่ติดอยู่ในห้องของร้านแต่ไม่มี `ShopTag` ที่ `nameKey` ตรง |
| **nameKey** | `tagNameKey(s) = s.normalize('NFC').toLowerCase().trim()` — **SSOT ของคำว่า "tag เดียวกัน"** (HR16) |
| **variant** | สตริงบนห้องที่ `tagNameKey` เท่ากับ `nameKey` ของ tag ที่ลงทะเบียน (เช่น `vip` กับ `VIP`) — ถือเป็น tag เดียวกัน |
| **ข้อความร้านพิมพ์** | `ChatMessage` ที่ `senderRole='SHOP'` ∧ `type='TEXT'` ∧ `autoReplyKind IS NULL` — รวมข้อความ standby/Meta AI (เปลี่ยน 2026-10-22: ร้านที่ให้ Meta AI ปิดการขายส่งสรุปทาง standby) |

---

## 2. สถาปัตยกรรมโดยสรุป

```mermaid
flowchart LR
    subgraph เข้า[3 จุดที่ร้านพิมพ์ — เหมือน 00061]
      A1[chat.service.sendMessage] 
      A2[chat-outbox.enqueueOutbound]
      A3[webhook echo Meta]
    end
    A1 --> AP[applyKeywordTags chatMessageId]
    A2 --> AP
    A3 --> AP
    AP --> M[shop-tag-match: matchTagKeywords]
    AP --> DB[(ExternalContact.tags · ShopTagEvent)]
    OC[createOrder / promoteDraftCore] -->|หลัง commit| RM[removeTagsOnOrderCreated]
    RM --> DB
    UI[หน้า /settings/tags] --> API[/api/shops/current/tags/**]
    API --> SV[shop-tag.service]
    SV --> DB
    SV --> ST[(ShopTag)]
    AP --> ST
    RM --> ST
```

หลักออกแบบ (ละเอียดใน [[SDS]]): tag บนห้องยังเป็นสตริงใน `ExternalContact.tags` · **อ่านเพื่อตัดสินด้วย nameKey ใน JS / เขียนด้วยชุดสตริงตรงตัวใน SQL แบบอะตอมมิก** (ไม่อ่านแล้วเขียนทับทั้งอาร์เรย์)

---

## 3. ข้อกำหนดเชิงฟังก์ชันเชิงเทคนิค

### TFR-001: รายการ tag ของร้าน (list) — FR-001
- **ไฟล์:** `src/services/shop-tag.service.ts::listShopTags(shopId)`
- **สูตร:**
  1. `registered` = `ShopTag where shopId order by name` (เรียงไทยด้วย `localeCompare('th')` ใน JS)
  2. `roomStrings` = `SELECT t AS name, count(DISTINCT ec.id)::int AS rooms FROM "ExternalContact" ec JOIN "ShopChannel" sc ON sc.id = ec."shopChannelId", unnest(ec.tags) t WHERE sc."shopId" = $shopId GROUP BY t` (parameterized `$queryRaw`)
  3. ต่อ tag ที่ลงทะเบียน: `variants` = สตริงใน (2) ที่ `tagNameKey(s) === nameKey` · `rooms` = ผลรวมของ variants **ถ้า variants ≤ 1** ; ถ้า variants > 1 ให้ query `count(DISTINCT ec.id) WHERE ec.tags && $variants::text[]` เพื่อไม่นับห้องที่มีหลาย variant ซ้ำ
  4. `unregistered` = สตริงใน (2) ที่ไม่ตรง nameKey ของ tag ที่ลงทะเบียนตัวใดเลย → แถว `{ id:null, registered:false, rooms, keywords:[], removeOnOrderCreate:false }`
  5. คืน `{ tags: [...registered, ...unregistered(เรียงตาม rooms มาก→น้อย แล้วชื่อ)], counts:{registered, withKeywords}, limits }`
- **Edge:** ร้านไม่มีผู้ติดต่อเลย → registered ล้วน `rooms=0` · tag ของร้านอื่นไม่โผล่เพราะ join ผ่าน `ShopChannel.shopId` · ผู้ใช้หลายร้าน → ใช้เฉพาะร้านที่ active (ไม่มีโหมดรวมในหน้านี้)
- **AC:** AC-AT-01, 02, 03, 04

### TFR-002: เพิ่ม tag (create / adopt) — FR-002
- **ไฟล์:** `shop-tag.service.ts::createShopTag(shopId, userId, input)`
- **ลำดับใน `$transaction`:** (1) `SELECT id FROM "Shop" WHERE id=$1 FOR NO KEY UPDATE` (2) ตรวจ nameKey ซ้ำใน `ShopTag` ของร้าน → `TAG_NAME_TAKEN` (3) `count(ShopTag)` ≥ 50 → `TAG_LIMIT_REACHED` (4) ถ้า `keywords.length>0` และ `count(ShopTag มี keywords)` ≥ 20 → `KEYWORD_TAG_LIMIT_REACHED` (5) insert (`name` = cleaned · `nameKey` = `tagNameKey(name)` · `keywords` = deduped · `createdByUserId`)
- **Adopt:** สร้างด้วยชื่อที่ตรงกับ tag ที่ยังไม่ลงทะเบียนได้ตามปกติ — **ไม่แตะห้อง** (ห้องเดิมยังมีสตริงนั้น = กลายเป็น registered ทันทีเพราะ nameKey ตรง)
- **Edge:** P2002 (ชน unique ขณะแข่งกันเกิน lock) → แปลงเป็น `TAG_NAME_TAKEN` · ชื่อซ้ำเฉพาะตัวพิมพ์ (`VIP` vs `vip`) ถือซ้ำ
- **AC:** AC-AT-06..10, 20, 21

### TFR-003: เปลี่ยนชื่อ — FR-003
- **ไฟล์:** `shop-tag.service.ts::updateShopTag` (สาขา `name` เปลี่ยน)
- **ลำดับใน `$transaction` (timeout 30s):** lock `Shop` → โหลด tag (`WHERE id AND shopId` ไม่เจอ → `TAG_NOT_FOUND`) → ถ้า `tagNameKey(newName)` ตรง tag **อื่น** ที่ลงทะเบียน → `TAG_NAME_TAKEN` (ตรงตัวเอง = อนุญาต เช่นเปลี่ยนเฉพาะตัวพิมพ์) → หา `variants` ของ **nameKey เดิม** จากห้องของร้าน → rewrite: ทุกห้องที่ `tags && variants` แทนด้วย `newName` แล้ว dedupe คงลำดับเดิม ([[DATABASE]] §4 รูปแบบ `unnest … WITH ORDINALITY … GROUP BY t ORDER BY min(ord)`) → update แถว `ShopTag` (`name`,`nameKey`) · คืน `renamedRooms` = จำนวนแถวที่ `$executeRaw` แก้
- **Q-6:** ชื่อใหม่ที่มีอยู่แค่ในห้องเก่า (ไม่ลงทะเบียน) = **รวมให้** ด้วย dedupe · ชื่อใหม่ที่เป็น tag ลงทะเบียนอื่น = ปฏิเสธ
- **อะตอมมิก:** rewrite ห้อง + update `ShopTag` อยู่ tx เดียว — ล้มกลางทางไม่มีห้องเปลี่ยนครึ่งเดียว
- **AC:** AC-AT-11..16

### TFR-004: ลบ — FR-004
- **ไฟล์:** `deleteShopTag(shopId, tagId)`
- **ใน `$transaction`:** โหลด tag scoped shop → `variants` ของ nameKey → `UPDATE … SET tags = ARRAY(SELECT t FROM unnest(tags) t WHERE t <> ALL($variants::text[])) WHERE (join ร้าน) AND tags && $variants::text[]` → `DELETE FROM "ShopTag"` (กติกา/keywords/สวิตช์หายพร้อมแถว) · คืน `removedFromRooms`
- **ไม่เขียน `ShopTagEvent`** (ประวัติเก็บเฉพาะการติด/ถอดอัตโนมัติ — S-7)
- **AC:** AC-AT-17..19

### TFR-005: ตั้งคำ + สวิตช์ — FR-005, FR-007
- **ไฟล์:** `updateShopTag` (สาขา `keywords` / `removeOnOrderCreate`)
- **กติกา:** `keywords` ส่งมา = แทนที่ทั้งชุด (ไม่ merge) · clean → dedupe ด้วย `normalizeTriggerPhrase` (รักษาการสะกดของตัวแรก) · ตรวจเพดาน 20 tag ที่มีคำ **เฉพาะเมื่อ tag นี้เปลี่ยนจาก "ไม่มีคำ" เป็น "มีคำ"** (แก้คำของ tag ที่มีคำอยู่แล้วไม่ถูกกัน) · `removeOnOrderCreate` ค่าเริ่มต้น `false`
- **ไม่ย้อนหลัง:** บันทึกแล้วไม่สแกนข้อความเก่า
- **AC:** AC-AT-20..23

### TFR-006: ตัวเทียบคำ (pure) — FR-006
- **ไฟล์:** `src/lib/shop-tag-match.ts::matchTagKeywords(rawBody, tags)` → `{ name: string; keyword: string }[]`
- **สูตร:** ต่อ tag ที่ `keywords.length>0`: `matchesTriggerPhrase(rawBody, tag.keywords)` (จาก `auto-order-parser.ts`) คืนวลีที่ normalize แล้วถ้ามี → `{name: tag.name, keyword}` · tag ที่ไม่มีคำไม่เคย match
- **semantics (P-4):** NFC → lowercase → ยุบช่องว่างทุกชนิดเป็น " " → trim · **ไม่ลบสัญลักษณ์** (`/go` ≠ `go`) · เช็ค substring · วลีว่างหลัง normalize ไม่ match
- **🛑 ห้าม** ใช้ `normalizeMessage()` ของ auto-reply (ตัดวรรคตอน/แทน `/` ด้วยช่องว่าง) — เทสต้องแดงถ้าสลับ
- **AC:** AC-AT-35

### TFR-007: ตัวติดอัตโนมัติ — FR-006
- **ไฟล์:** `src/services/shop-tag-auto.service.ts::applyKeywordTags(chatMessageId): Promise<ApplyOutcome>`
- **ลำดับด่าน (ถูกก่อน แตะ DB น้อยก่อน):**
  1. โหลดข้อความ 1 query (`id senderRole type body autoReplyKind viaStandby echoAiGenerated conversationId conversation{shopId externalContactId}`) — ไม่เจอ → `SKIPPED MESSAGE_NOT_FOUND`
  2. `senderRole !== 'SHOP'` → `NOT_SHOP` · `type !== 'TEXT'` → `NOT_TEXT` · `autoReplyKind != null` (ทุกค่า รวม `AUTO_NOTICE`) → `BOT_MESSAGE` · body ว่างหลัง trim → `EMPTY_BODY` · `conversation.externalContactId == null` → `NO_CONTACT`
  3. `ShopTag where shopId = conversation.shopId AND keywords ไม่ว่าง` → ว่าง = `NO_RULES`
  4. `matchTagKeywords` → ว่าง = `NO_MATCH`
  5. **ข้อความนี้กลายเป็นคำสั่งซื้อจริงแล้วหรือยัง:** `order.findFirst({ where:{ sourceChatMessageId: id, status:{ not:'DRAFTED' }, isDryRun:false } })` → มี = `ORDER_ALREADY_CREATED` (unique index `Order_sourceChatMessageId_key`)
  6. อ่าน `ExternalContact.tags` ของผู้ติดต่อนั้น → ต่อ tag ที่ match: ถ้ามี variant อยู่แล้ว (เทียบ nameKey ใน JS) → ข้าม · ไม่มี → `externalContact.updateMany({ where:{ id, NOT:{ tags:{ has: name } } }, data:{ tags:{ push: name } } })` (อะตอมมิก — count=1 = ติดจริง)
  7. ใน tx เดียวกัน: ต่อ tag ที่ติดจริง insert `ShopTagEvent { action:'ADD', source:'KEYWORD', chatMessageId, matchedKeyword, tagName:name, conversationId, externalContactId, shopId }` · ไม่ติดจริง = ไม่เขียนอะไร
- **ข้อห้าม:** ห้าม `data:{ tags: [...] }` (เขียนทับอาร์เรย์) ในไฟล์นี้ — เทสสแกน
- **ติดซ้ำ/ติดกลับ:** แอดมินถอด tag แล้วร้านพิมพ์คำอีก → ขั้น 6 เห็นว่าไม่มี → ติดกลับ (P-1)
- **คืนค่า:** `{ outcome:'APPLIED', added:string[], alreadyHad:string[] }` หรือ `{ outcome:'SKIPPED', reason }` — **ไม่ throw ออกนอกฟังก์ชันสำหรับกรณีปกติ**; error ฐานข้อมูลปล่อยให้ตัวห่อ (`runAfterResponse` / `.catch` ที่ webhook) กลืนและ log
- **AC:** AC-AT-24..40, 51, 52, 54

### TFR-008: จุดเรียก 3 จุด — FR-006
| # | ไฟล์ | จุด | รูปแบบ |
|---|---|---|---|
| 1 | `src/services/chat.service.ts` | ใน `sendMessage` สาขา `senderRole==='SHOP'` หลัง `pauseForHumanTakeover` | `runAfterResponse(() => applyKeywordTags(sent.id))` — ไม่ await · (ห้อง DEEP จบด้วย `NO_CONTACT` — คงไว้เพื่อให้ชุดจุดเรียกเท่า 00061 และกันช่องทางใหม่หลุด) |
| 2 | `src/services/chat-outbox.service.ts` | ท้าย `enqueueOutbound` ก่อน `return row` | `runAfterResponse(() => applyKeywordTags(row.id))` — ไม่ await · ครอบ Messenger/IG/LINE ที่ส่งจากกล่องแชทของเรา |
| 3 | `src/app/api/channels/facebook/webhook/route.ts` | ในบล็อก echo เดียวกับ 00061 (`!standby && STORED && headMessageId && senderRole==='SHOP'`) | `after(() => applyKeywordTags(headMessageId).catch(log))` |
- **IG** เข้า route เดียวกับ Messenger (`provider = parsed.output.object === 'instagram' ? 'INSTAGRAM' : 'MESSENGER'`) → จุด 3 ครอบทั้งคู่ · **LINE** ไม่มี echo (webhook LINE รับขาเข้าลูกค้าอย่างเดียว) → ครอบเฉพาะจุด 2
- **echo ของข้อความที่ส่งจาก Deep เอง** ชน `externalMessageId` → `DUPLICATE` → ไม่ถึงจุด 3 (ไม่นับซ้ำ)
- **parity กับ 00061:** เซตไฟล์ที่เรียก `applyKeywordTags(` ต้อง = เซตไฟล์ที่เรียก `detectAutoOrderTrigger(` (เทสสแกนทั้งสองฝั่งแล้วเทียบ — เพิ่มจุดที่ 4 ให้ 00061 โดยลืม 00083 = แดง)
- **AC:** AC-AT-39

### TFR-009: ตัวถอดอัตโนมัติ — FR-008
- **ไฟล์:** `shop-tag-auto.service.ts::removeTagsOnOrderCreated(order: {id, shopId, conversationId, isDryRun}): Promise<RemoveOutcome>`
- **ลำดับ:** `isDryRun` → `SKIPPED DRY_RUN` · `conversationId == null` → `NO_CONVERSATION` · `ShopTag where shopId AND removeOnOrderCreate=true` (ว่าง → `NO_RULES`) · `conversation.findFirst({ id, shopId })` (scope ร้านซ้ำ) → ไม่มี contact → `NO_CONTACT` · อ่าน tags ของ contact → ต่อ tag ที่เปิดสวิตช์: variants ที่มีอยู่ (nameKey) ว่าง → ข้าม · มี → `$executeRaw UPDATE "ExternalContact" SET tags = ARRAY(… WHERE t <> ALL($variants)) WHERE id=$1 AND tags && $variants::text[]` (count>0 = ถอดจริง) → insert `ShopTagEvent { action:'REMOVE', source:'ORDER_CREATED', orderId, tagName }`
- **เรียกเมื่อไหร่:** **หลัง commit นอก tx** ของ `createOrder` (ต่อท้าย `dispatchAutoNotifyAfterCommit(ledgerId)` — `order.service.ts` บรรทัด 809) และ `promoteDraftCore` (บรรทัด 1054) · `await` ได้ (ไวพอ) แต่ **ห่อ try/catch ในตัว service และไม่ throw** → คืน `{ outcome:'ERROR' }` พร้อม `console.error` (ถอดล้ม ≠ สร้างล้ม)
- **ไม่เรียก:** `updateOrder` · `cancelOrder` · `booking.service` · `auction.service` (สองตัวหลังไม่เขียน `conversationId` — ตรวจแล้ว grep 0) · ร่าง 00061 (`writeAutoOrderDraft` สร้างด้วย `prisma.order.create` ตรง ๆ ไม่ผ่านสองฟังก์ชันนี้)
- **AC:** AC-AT-41..50, 53

### TFR-010: ประวัติ — FR-009
- เขียน `ShopTagEvent` **เฉพาะเมื่อ tag เปลี่ยนจริง** (count จาก `updateMany`/`$executeRaw` > 0) ใน tx เดียวกับการเปลี่ยน
- ไม่เก็บเนื้อข้อความ — เก็บ `chatMessageId` + `matchedKeyword` (วลีของร้านที่ normalize แล้ว ≤50 ตัว) · `orderId` สำหรับถอด
- ไม่มีหน้าดู ไม่มี retention (OOS-7)
- **AC:** AC-AT-51..54

### TFR-011: ตัวช่วยพิมพ์ tag รวมที่ลงทะเบียน — FR-002 AC
- **ไฟล์:** `chat-crm.service.ts::getShopTags(shopIds)` (บรรทัด 11-22): union ชื่อจากห้อง **และ** `ShopTag.name where shopId in shopIds` · ไม่เปลี่ยน signature · `/api/chat/tags` (X2) ไม่เปลี่ยนรูป response
- ผู้ใช้ที่เรียก `follow-ups/page.tsx` / `inbox/page.tsx` ได้ผลเดียวกัน
- **AC:** AC-AT-09, 57

### TFR-012: สิทธิ์ + เมนู — FR-001
- หน้า `settings/tags/page.tsx` → `{ page:'H3' }` · route → `H3` (ดู §10) · เมนู slug `seller:settings-tags` ในกลุ่ม CHAT ต่อจาก "ส่งอัตโนมัติถึงลูกค้า" · ทุก vertical (ห้ามอยู่ใน `*_ONLY_SLUGS`) · ซ่อนจากบทบาทที่ไม่มี H3 อัตโนมัติผ่าน `canSeePage` (อ่านทะเบียน route)
- **AC:** AC-AT-05, 55, 56

---

## 4. ส่วนต่อประสาน (API)

| Method | Path | คำอธิบาย | Cap |
|--------|------|----------|-----|
| GET | `/api/shops/current/tags` | รายการ (registered + unregistered) | H3 |
| POST | `/api/shops/current/tags` | เพิ่ม/ลงทะเบียน | H3 |
| PATCH | `/api/shops/current/tags/[tagId]` | เปลี่ยนชื่อ / คำ / สวิตช์ | H3 |
| DELETE | `/api/shops/current/tags/[tagId]` | ลบ + ถอดจากทุกห้อง | H3 |
| GET | `/api/chat/tags` | (เดิม) คืน tag รวมที่ลงทะเบียน | X2 |

สัญญาละเอียด: [[API]] · ไม่ชน `/api/tags` (tag สินค้า) และ `/api/shops/[id]` (static `current` ชนะ dynamic)

---

## 5. ข้อมูล
ไม่เปลี่ยน schema — [[DATABASE]] ล็อกแล้ว (migration `20261021100000_00083_shop_tags` อยู่บนดิสก์แล้ว ต้องถูก apply ที่ local ก่อน dev: HR14/15)

| Entity | การใช้ |
|---|---|
| `ShopTag` | CRUD โดย `shop-tag.service` · อ่านโดย `shop-tag-auto.service` (apply/remove) และ `getShopTags` |
| `ShopTagEvent` | append-only เขียนโดย `shop-tag-auto.service` เท่านั้น |
| `ExternalContact.tags` | เขียนโดย (ก) `updateConversationCrm` (มือ — เดิม) (ข) `shop-tag-auto` push/remove (ค) `shop-tag.service` rename/delete — ทั้งหมดผ่านชุดสตริงตรงตัว |

SQL parameterized ทั้งหมด (`$queryRaw` / `$executeRaw` แบบ tagged template) — ห้ามต่อสตริง · ใส่ `::text[]` กับพารามิเตอร์อาร์เรย์

---

## 6. ข้อกำหนดที่ไม่ใช่ฟังก์ชัน

| ด้าน | ข้อกำหนด | เป้าหมายที่วัดได้ |
|------|----------|-------------------|
| **Performance (ส่งข้อความ)** | hook ทั้ง 3 ไม่ await · ข้อความที่ไม่เข้าเงื่อนไขออกก่อนแตะ `ShopTag` | ผู้ส่งไม่เห็นความช้าเพิ่ม · ข้อความร้านปกติของร้านที่ไม่มีกติกา = 2 query (message, ShopTag) |
| **Performance (createOrder)** | ถอดหลัง commit · ร้านที่ไม่มี tag เปิดสวิตช์ = 1 query แล้วจบ | ไม่เพิ่ม query ใน tx |
| **Idempotency** | ส่งซ้ำ/พร้อมกัน N ครั้ง = ผลเท่าครั้งเดียว · event 1 แถวต่อการเปลี่ยนจริง | DB test: `Promise.all` 10 ครั้ง → tag 1 ตัว event 1 แถว |
| **Reliability** | apply/remove ล้ม = ไม่กระทบข้อความ/คำสั่งซื้อ · log ดังพอเห็น | เทส inject ความล้ม |
| **Security** | `shopId` มาจาก DB (ข้อความ→ห้อง · ออเดอร์) หรือ gate ของ route เท่านั้น · `strictObject` · ไม่เชื่อ id จาก client | เทสข้ามร้าน |
| **Cache** | route คืน `Cache-Control: private, no-store` (`jsonNoStore`) | ตรวจ header |
| **Privacy** | ประวัติไม่เก็บเนื้อข้อความ/ชื่อ/เบอร์ลูกค้า | ตรวจแถว |
| **Maintainability** | ศัพท์ UI ผ่าน th/en (00047) · `Record<ShopTagErrorCode,…>` ให้ tsc บังคับ mapping | build exit 0 |

---

## 7. ข้อจำกัดและการพึ่งพา
- ห้อง DEEP ไม่มี tag · LINE ที่พิมพ์ในแอป LINE OA เองมองไม่เห็น · ไม่ย้อนหลัง (PRD §4.2)
- Meta echo ที่ไม่ใช่ `ai_generated` แต่มาจากฟีเจอร์ตอบอัตโนมัติ native ของ Meta (greeting/away/saved reply) แยกจากคนพิมพ์ไม่ได้ → ถ้าข้อความนั้นมีคำ จะติด (ยอมรับ — R-4)
- ต้องอาศัย `ChatMessage.viaStandby` / `echoAiGenerated` (00078 TFR-001) ที่มีอยู่แล้ว
- ห้าม `prisma db pull` / `migrate dev` กับฐานแชร์ (HR13/14) · push `main` = `migrate deploy` บน prod (HR15)

---

## 8. ความเสี่ยง

| # | ความเสี่ยง | ผลกระทบ | แนวทางลด |
|---|-----------|---------|----------|
| R-1 | 00061 กับ 00083 รันขนานกันบนข้อความเดียว: 00061 สร้างออเดอร์+ถอดก่อน 00083 ติด | tag ค้างทั้งที่ออเดอร์เกิดแล้ว | ขั้น 5 ตรวจ "แปลงเป็นออเดอร์จริงแล้ว" + เรียก 00083 **ก่อน** 00061 ในทุกจุด (กำหนดเวลาเริ่มก่อน) · ช่องว่างที่เหลือ (apply ช้ากว่า createOrder ทั้งก้อน) แคบมาก — ยอมรับ + ทดสอบลำดับ |
| R-2 | **การแก้ tag ด้วยมือ (CRM PATCH) เขียนทับอาร์เรย์ทั้งก้อน** (`updateConversationCrm` ใช้ `tags = input.tags`) | แอดมินที่เปิดแผงลูกค้าค้างไว้แล้วกดบันทึก อาจลบ tag ที่ระบบเพิ่งติด | อยู่นอก scope (OOS-11) — เสนอเป็นงานต่อแยก: ให้ PATCH เขียนแบบ diff · บันทึกใน retro |
| R-3 | เปลี่ยนชื่อ/ลบขณะ apply ติดชื่อเก่าพอดี | ชื่อเก่าโผล่เป็น "ยังไม่ลงทะเบียน" | ตั้งใจให้มองเห็น+จัดการได้ (BR-AT-04) ไม่ใช่ข้อมูลหาย |
| R-4 | echo จากการตอบอัตโนมัติ native ของ Meta ที่มีคำ | ติด tag ทั้งที่ไม่ใช่คนพิมพ์ | ยอมรับ — แยกไม่ได้จาก Business Suite ของแอดมิน · หน้าจัดการมีข้อความอธิบาย |
| R-5 | rename/delete สแกนผู้ติดต่อทั้งร้านใน tx เดียว | ล็อกนานในร้านใหญ่ | ไม่มี index บน `tags` (DATABASE §5) · tx timeout 30s · ถ้าช้า → GIN index เป็นงานต่อ |
| R-6 | ศัพท์ "tag" (PRD) vs "แท็ก" (UI เดิม) | HR16 ศัพท์สองชุด | ข้อเสนอ P-A ท้ายเอกสาร — Controller ตัดสินก่อนเขียน dictionary |

---

## 9. Traceability

| BRD FR | TFR | AC | Scope |
|---|---|---|---|
| FR-001 | TFR-001, 012 | AC-AT-01..05 | S-2, S-3 |
| FR-002 | TFR-002, 011 | AC-AT-06..10, 57 | S-1, S-3 |
| FR-003 | TFR-003 | AC-AT-11..16 | S-3 |
| FR-004 | TFR-004 | AC-AT-17..19 | S-3 |
| FR-005 | TFR-005 | AC-AT-20..23 | S-4 |
| FR-006 | TFR-006, 007, 008 | AC-AT-24..40 | S-5 |
| FR-007 | TFR-005 | AC-AT-22 | S-4 |
| FR-008 | TFR-009 | AC-AT-41..50 | S-6 |
| FR-009 | TFR-010 | AC-AT-51..54 | S-7 |
| (เอกสาร) | — | — | S-8 |

---

## 10. สิทธิ์ (Authorization Matrix)

| การกระทำ | cap | บทบาทที่ผ่าน (`shop-permissions.ts`: `H3: [O, M]`) | ที่ตัดสิน |
|---|---|---|---|
| เปิดหน้า `/settings/tags` | `H3` | OWNER · MANAGER (CHAT/TECHNICIAN/BILLING → `NoPermissionCard`) | page `gatePage(session,'H3')` |
| `GET /api/shops/current/tags` | `H3` | เหมือนข้างบน (CHAT = 403 `FORBIDDEN_ROLE` — มติ P-6/Q-4) | route `requireShopCapability(session,'H3')` |
| `POST/PATCH/DELETE …/tags` | `H3` + ร้านไม่ถูกล็อกแพ็กเกจ | OWNER · MANAGER | route (ล็อก → 403 `SHOP_LOCKED`) |
| ติด/ถอด tag ต่อห้องด้วยมือ (CRM) | (เดิม) | ไม่เปลี่ยน | `updateConversationCrm` |
| `GET /api/chat/tags` | `X2` | OWNER · MANAGER · CHAT (เดิม) — คืน tag ที่ลงทะเบียนรวมด้วย | route เดิม |
| ติด tag อัตโนมัติ / ถอดอัตโนมัติ | — (ระบบ) | `shopId` ต้องมาจากแถวข้อความ→ห้าม / `order.shopId` ที่ผ่าน WHERE shopId แล้ว · query ทุกตัวผูก shopId | service |

ทะเบียน `src/lib/route-capabilities.ts`: `settings/tags/page.tsx` `{page:'H3'}` · `shops/current/tags/route.ts` `{GET:'H3', POST:'H3'}` · `shops/current/tags/[tagId]/route.ts` `{PATCH:'H3', DELETE:'H3'}` — ต้องเรียกด่านด้วย literal cap ตรงทะเบียน (`route-capability-inventory.test.ts`) · ต้องเพิ่ม GET ใน MATRIX ของ `tests/integration/role-contract.test.ts`

---

## 11. Validation (Valibot — `src/lib/shop-tag-schemas.ts`)

| ฟิลด์ | กฎ | เพดาน |
|---|---|---|
| `name` | string → NFC → trim → นับ **code point** (`Array.from(s).length`) 1..30 (ตรง DB `char_length`) | **30** |
| ชื่อซ้ำ | `tagNameKey` ซ้ำใน `ShopTag` ของร้าน → 409 | — |
| `keywords` | array ≤ **10** รายการ (นับก่อน dedupe) | **10** |
| `keywords[i]` | `cleanKeyword` = NFC + ยุบ `\s+` เป็น " " + trim · code point **2..50** · `normalizeTriggerPhrase(clean)` ต้องยาว ≥ 2 (กันคำที่เหลือแต่ช่องว่างไร้ความกว้าง) | **2..50** |
| dedupe | key = `normalizeTriggerPhrase` · เก็บสะกดของตัวแรก · คำซ้ำรวมเป็นหนึ่ง | — |
| `removeOnOrderCreate` | boolean (ไม่ส่ง = ไม่แตะ / create = false) | — |
| body | `v.strictObject` — คีย์เกินหรือ `shopId` ที่ client ส่งมา = 400 | — |
| PATCH | ต้องมีอย่างน้อย 1 คีย์ใน `name` / `keywords` / `removeOnOrderCreate` | — |
| `tagId` | uuid · ไม่ใช่ uuid → 404 `TAG_NOT_FOUND` (ไม่ใช่ 400 — ไม่ยืนยันรูปแบบ id) | — |
| เพดานร้าน | ≤ **50** tag · ≤ **20** tag ที่มีคำ (ตรวจใน service ใน tx เดียวกับ insert/update ใต้ lock `Shop`) | **50 / 20** |

ค่าเพดานอยู่ที่ `SHOP_TAG_LIMITS` ใน `src/lib/shop-tag-match.ts` ที่เดียว · หน้า (server component) ส่งเป็น prop ให้ client — **ห้าม** client import ไฟล์นี้ (ลาก `node:crypto` จาก `auto-order-normalize.ts`)

---

## 12. Error codes → HTTP

service throw `ShopTagError(code)` (คลาสเดียว มี `code` union) — route แปลงด้วย `shopTagErrorResponse(e, tag)` ใน `src/lib/shop-tag-route-errors.ts` ที่ใช้ `Record<ShopTagErrorCode, {status, message}>` (tsc บังคับให้ทุก code มีรายการ)

| code | HTTP | throw ที่ | route ที่ต้อง catch |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Valibot ที่ route (+ service เมื่อ dedupe แล้วผิด) | `POST tags` · `PATCH tags/[tagId]` |
| `TAG_NAME_TAKEN` | 409 | `createShopTag` · `updateShopTag` (+ P2002) | `POST` · `PATCH` |
| `TAG_LIMIT_REACHED` | 409 | `createShopTag` | `POST` |
| `KEYWORD_TAG_LIMIT_REACHED` | 409 | `createShopTag` · `updateShopTag` | `POST` · `PATCH` |
| `TAG_NOT_FOUND` | 404 | `updateShopTag` · `deleteShopTag` | `PATCH` · `DELETE` |
| `SHOP_LOCKED` | 403 | route (ไม่ใช่ service) | `POST` · `PATCH` · `DELETE` |
| (ที่เหลือ) | 500 `INTERNAL_ERROR` | — | ทุก handler (log แล้วตอบ) |

`applyKeywordTags` / `removeTagsOnOrderCreated` **ไม่มี error ที่ต้อง map** — กลืนในตัว (ตารางนี้ครบทุก `throw` ใหม่ของ phase)

---

## 13. ข้อเสนอแยก / คำถามเปิดสำหรับ Controller

1. **P-A ศัพท์:** PRD ใช้ "tag" แต่ UI เดิมใช้ "แท็ก" (`th.ts` `tagsLabel: 'แท็ก'`, `TagInput` "เพิ่มแท็ก", `filterTags: 'แท็ก'`) — HR16 ให้คำเดียวทั้งระบบ · **เสนอ** ป้ายเมนู/หน้า/ข้อความใหม่ใช้ "แท็ก" (เมนู "จัดการแท็ก") — ถ้าเลือก "tag" ต้องแก้ของเดิมด้วย (นอก scope)
2. **P-B:** เสนองานต่อแยก — `updateConversationCrm` เขียน tags แบบ diff (แก้ R-2) — ไม่ทำใน phase นี้
3. **ไม่มีข้อเสนอเปลี่ยน model** — DATABASE ครอบทุกการใช้งานแล้ว (ข้อสังเกต: `keywords` ใน SQL เป็น nullable แต่ Prisma `@default([])` เขียนเป็นอาร์เรย์เสมอ — ไม่เป็นปัญหา)
4. ถอดล้มแล้วไม่มี retry (ตาม FR-008) — ผู้ใช้ถอดเองได้; ถ้าต้องการ sweeper ภายหลังให้เปิดเป็น S-id ใหม่

---

## 14. สรุป
tag เป็นของร้านด้วยแถว `ShopTag` · ห้องยังเก็บเป็นสตริง · "tag เดียวกัน" ตัดสินที่ `tagNameKey` ที่เดียว · ติดด้วย push อะตอมมิก ถอดหลัง commit แบบกลืน error · hook ตรงชุดเดียวกับ 00061 และมีเทสเทียบเซต

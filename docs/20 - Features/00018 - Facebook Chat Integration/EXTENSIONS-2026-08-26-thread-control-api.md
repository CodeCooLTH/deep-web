# 00018 EXT — ปุ่ม "ตอบเอง" ยิง Conversation Routing API จริง

> **วันที่:** 2026-08-26 · **สถานะ:** implement แล้ว รอผลทดสอบจากสนามจริง
> **ต่อจาก:** [`EXTENSIONS-2026-08-16-meta-ai-takeover.md`](./EXTENSIONS-2026-08-16-meta-ai-takeover.md) (ผลสืบสวน) และ [`EXTENSIONS-2026-08-08.md`](./EXTENSIONS-2026-08-08.md) (ที่มาของ standby)
> **ต้นเรื่อง:** ผู้ใช้แจ้ง *"ปุ่มตอบเองใน chat มันไม่ take ai จาก meta จริง — กดแล้ว UI เปิดให้พิมพ์ พอพิมพ์แล้วก็เจอ error ว่า AI ยัง take control"*

---

## 1. สิ่งที่ผิด (ยืนยันจากโค้ด)

`confirmTakeOverFromAi()` ใน `ChatThread.tsx` ทำแค่ `setRespondingManually(true)` — **ไม่มีการเรียก API
ใด ๆ ออกไปหา Meta เลยตั้งแต่วันแรก** (2026-08-08) ผลคือช่องพิมพ์ถูกปลดล็อกฝั่งเราอย่างเดียว แล้ว
Meta ปฏิเสธตอนกดส่งด้วย `(#10) another app is controlling this thread now`

จุดที่แย่ที่สุดคือ **copy ในกล่องยืนยันเป็นเท็จเสมอ** ในเคสที่ปุ่มนี้โผล่:

> ~~"หลังจากนี้คุณพิมพ์ข้อความส่งหาลูกค้าได้ตามปกติ"~~

ประโยคที่พูดถูก ("การหยุด AI ให้แน่ใจ 100% ต้องกดที่ Business Suite") ถูกวางเป็น *ข้อควรระวัง*
ทั้งที่มันคือ *เงื่อนไขบังคับ* — ผู้ขายจึงถูกพาไปพิมพ์ทิ้งแล้วเจอ error ทุกครั้ง

---

## 2. ทำไมรอบ 2026-08-08 ถึงสรุปว่า "ทำไม่ได้" แล้วผิด

รอบนั้นทดสอบกับ Graph 3 คำสั่งแล้วได้ error ทั้งหมด:

| คำสั่ง | ผล |
|---|---|
| `take_thread_control` | `(#27) not supported when Conversation Routing is not enabled` |
| `release_thread_control` | `(#100) Only the current thread owner can release` |
| `pass_thread_control` | `(#100) calling app is not the thread owner` |

**แต่ `request_thread_control` ไม่เคยถูกทดสอบเลยสักครั้ง** — และเอกสาร Conversation Routing ของ Meta
เขียนไว้ตรงตัวว่าในโหมด default (ยังไม่ตั้ง Default Application ที่เพจ) มันยังใช้ได้:

> "The Take Thread Control API is **blocked unless a default application is set**."
> "**Request Thread Control API Available:** Any application can request thread control,
> but only the first application to invoke the API will receive control."
>
> — [Conversation Routing](https://developers.facebook.com/docs/messenger-platform/conversation-routing/)

การเจอ error 3 ตัวแล้วสรุปทั้งกระดานว่า "ทำไม่ได้" คือการเหมาจากตัวอย่างที่ยังไม่ครบ —
คลาสเดียวกับที่ `EXTENSIONS-2026-08-09.md` บันทึกไว้เรื่อง "รูปหมดอายุแล้ว backfill ไม่ได้"

---

## 3. สิทธิ์ที่ต้องใช้ — **ไม่ต้องขอเพิ่มเลยสักตัว** (ตรวจ 2026-08-26)

App = `1570859340799126` **Deep Chat & LIVE** (`devtools_app_review privileges`)

| permission | 2026-08-16 (doc เดิม) | **2026-08-26 (วันนี้)** |
|---|---|---|
| `pages_messaging` | REJECTED · none | **DEVOPS_APPROVED · advanced · is_live** ✅ |
| `pages_manage_metadata` | REJECTED | **advanced · is_live** ✅ |
| `instagram_manage_messages` | REJECTED | **advanced · is_live** ✅ |
| `pages_read_engagement` / `instagram_basic` | REJECTED | standard · is_live ✅ |
| Human Agent | REJECTED | REJECTED (ไม่เกี่ยวกับ thread control) |

🛑 **ใบ App Review ที่ 08-16 บันทึกว่า PENDING ผ่านแล้ว** — เอกสาร 08-16 ระบุว่า `pages_messaging`
ถูก REJECTED ซึ่ง **ไม่จริงอีกต่อไป** อย่าใช้ตารางในไฟล์นั้นตัดสินใจ

Webhook ครบตามรายการ "Before You Start" ของ Meta อยู่แล้ว (topic `page`:
`messages` · `messaging_postbacks` · `messaging_referrals` · `messaging_handovers` · **`standby`**)

**สรุป: ตัวที่ขาดไม่ใช่สิทธิ์ แต่เป็น setting ที่เจ้าของเพจต้องกดเอง** (Page Settings →
Conversation Routing → Default Application) ซึ่ง Conversation Routing **ไม่มี endpoint ให้ตั้ง** —
ยืนยันแล้วทั้งรอบ 08-16 และรอบนี้

---

## 4. สิ่งที่ทำในรอบนี้

### 4.1 `src/lib/facebook/graph.ts` — `claimThreadControl()`

ลองตามลำดับ `take_thread_control` → ถ้าไม่ผ่านค่อย `request_thread_control` คืนผล 3 สถานะ:

| outcome | ความหมาย | UI ทำอะไร |
|---|---|---|
| `TAKEN` | Meta ยืนยันแล้วว่าเราเป็นเจ้าของเธรด | ปลดล็อก composer + แถบ **success** |
| `REQUESTED` | ส่งคำขอแล้ว **ยังไม่รู้ว่าจะได้สิทธิ์ไหม** | ปลดล็อก composer + แถบ **warning** ที่บอกตรง ๆ ว่าอาจส่งไม่ผ่าน |
| `FAILED` | ปิดทั้งสองทาง (`ROUTING_NOT_ENABLED` / `TOKEN_INVALID` / `UNKNOWN`) | **ไม่ปลดล็อก** — บล็อกแดง + ปุ่มลองใหม่ + ปุ่มไป Business Suite |

🛑 **สามค่านี้ห้ามยุบเป็น boolean** — `success:true` ของ `request_thread_control` แปลว่า
"คำขอถูกส่ง" ไม่ใช่ "ได้สิทธิ์แล้ว" การเอา `REQUESTED` ไปแสดงเป็น `TAKEN` คือการสร้างบั๊กเดิมขึ้นมาใหม่

🛑 **`TOKEN_INVALID` ไม่ยิง `request` ตาม** — token ตายแล้วทั้งสองทางตายเหมือนกัน และ error ตัวที่สอง
จะกลบตัวแรก ทำให้จอชี้ผู้ขายไป Business Suite ทั้งที่ทางแก้จริงคือเชื่อมเพจใหม่

คัดแยก error ด้วย **ถ้อยคำ** ไม่ใช่ code เปล่า ๆ (Meta ใช้ `#10`/`#100` ซ้ำกับสาเหตุคนละเรื่อง —
กติกาเดียวกับ `RULES` ใน `chat-send-failure.ts`)

### 4.2 `channel-chat.service.ts` — `claimConversationControl()`

- authz ผ่าน `resolveOutboundContext` ตัวเดิม (`canAccessShop`)
- กั้นเฉพาะ `MESSENGER`/`INSTAGRAM` → LINE/DEEP ได้ `CHANNEL_NOT_SUPPORTED` (**"ไม่มีอะไรให้ขอ"
  ต่างจาก "ขอแล้วไม่ได้"** — ถ้าปนกัน จอจะชวนผู้ขายไป Business Suite ของเพจที่ไม่มีอยู่จริง)
- เขียน `ChatHandoverEvent` **ทุกครั้งที่ยิง** ผ่าน `ingestHandoverEvent()` ตัวเดิม
  (`metadata='deep-seller-takeover:<outcome>'`)

  🛑 นี่คือ **หลักฐานชิ้นเดียว**ที่จะตอบได้ว่า `request_thread_control` ใช้ได้จริงไหมในสนาม —
  Vercel plan ที่ใช้อยู่ query runtime log ย้อนหลังไม่ได้ ⇒ `console.log` มีค่าเท่ากับไม่มี
  ตารางนี้ **ว่างเปล่า 100% ณ วันเขียน** (ยืนยัน 2026-08-26) แถวแรกที่โผล่จะเป็นของเรา

### 4.3 `POST /api/chat/conversations/[id]/thread-control`

body ว่าง — เพจ/PSID resolve ฝั่ง server ล้วน · ใช้ `sessionUserId()` (HR `session-exists-is-not-identity`)
· error mapping: 404 / 403 / 400 (`CHANNEL_NOT_SUPPORTED`) / 409 (`CHANNEL_INACTIVE`) / 500

### 4.4 UI (`ChatThread.tsx`) — ผ่าน `safepay-ux` gate

- `respondingManually: boolean` → **`manualOverrideStatus: 'none' | 'taken' | 'requested'`** + `takeoverFailed`
- `pacesConfirmAsync()` (ใหม่ใน `paces-swal.ts`) — `showLoaderOnConfirm` + `preConfirm` ⇒ สปินเนอร์
  บนปุ่มยืนยัน · ปิดปุ่มยกเลิกระหว่างทำงาน · กันกดซ้ำ ทั้งหมดอยู่ในโมดัลเดียว
  🛑 `run()` throw = โมดัลไม่ปิด ขึ้น error ในตัวแล้วกดใหม่ได้ — สงวนให้ "ยิงไม่ถึงปลายทาง" เท่านั้น
  ผลเชิงธุรกิจที่ Meta *ตอบมาแล้วว่าไม่ให้* ต้องคืนค่าปกติ (ขั้นตอนต่อไปคนละทาง)
- แถบ TAKEN เปลี่ยน tone `info` → `success` (เดิมโผล่ตอน "กดปุ่มแล้ว" ตอนนี้โผล่ตอน "Meta ยืนยันแล้ว")
- `META_BUSINESS_SUITE_INBOX_URL` export จาก `meta-system-notice.ts` เป็น SSOT (เดิม ChatThread
  ฮาร์ดโค้ด URL เดียวกันซ้ำอีกที่ — HR16)

### 4.5 Copy ใหม่

| จุด | ข้อความ |
|---|---|
| Modal | ตอบเองแทน AI ของ Meta? / Deep จะขอสิทธิ์ควบคุมแชทนี้จาก Meta ให้ทันที — บางเพจได้สิทธิ์เลย บางเพจต้องรอ Meta อนุมัติก่อน ระหว่างนั้นข้อความอาจส่งไม่ผ่านชั่วคราว |
| แถบ REQUESTED | ส่งคำขอควบคุมแชทนี้แล้ว — ข้อความอาจส่งไม่ผ่านจนกว่า Meta จะอนุมัติ |
| บล็อก FAILED | ส่งข้อความหาลูกค้าไม่ได้ตอนนี้ — Meta ไม่ให้ Deep ควบคุมแชทนี้แทน AI *(ข้อความที่ลูกค้าส่งมายังอ่านได้ตามปกติ)* |

---

## 5. 🛑 ขอบเขตที่ฟีเจอร์นี้ **ไม่** ครอบ (ต้องอ่านก่อนบอกว่าเสร็จ)

สแกน prod 2026-08-26 (14 วันล่าสุด) — การส่งที่ถูก Meta ปฏิเสธด้วย `(#10)`: **33 ครั้ง** ล่าสุด 08-25

| สถานะ marker ตอนถูกบล็อก | จำนวน |
|---|---|
| **ไม่มี marker เลย** | 26 |
| marker = HUMAN (ค้าง/โกหก) | 7 |
| marker = AI | **0** |

**ปุ่ม "ตอบเอง" ผูกกับ `aiAgentActive` (marker = AI) ⇒ ในทั้ง 33 เคสนั้น ปุ่มไม่เคยอยู่บนจอเลย**

สองอาการนี้เป็นคนละเคสกันและจริงทั้งคู่:

| อาการ | ขนาด | รอบนี้แก้ไหม |
|---|---|---|
| **A.** marker = AI → composer ถูกแทนที่ ผู้ขายส่งไม่ได้เลย และปุ่มที่มีก็ไม่ทำอะไร | **158 เธรด** ค้างอยู่ ณ วันนี้ | ✅ แก้แล้ว |
| **B.** ไม่มี marker / marker ค้างเป็น HUMAN → composer เปิด ผู้ขายพิมพ์ แล้ว Meta ปฏิเสธ | 33 ครั้ง/14 วัน | ❌ **ยังไม่แก้** |

เคส A ไม่ผลิตแถว `(#10)` เพราะเราบล็อกไว้ตั้งแต่ฝั่ง client — ตัวเลข 0 ในตารางบนจึงไม่ได้แปลว่า
เคส A ไม่มีอยู่ แต่แปลว่ามันถูกกันไว้ก่อนถึง Meta

**ทางปิดเคส B ที่เสนอ:** ผูกปุ่มขอสิทธิ์เข้ากับ *บับเบิลที่ส่งไม่สำเร็จ* ด้วย
(`chat-send-failure.ts` กฎ `#10` — ตอนนี้บอกให้ไป Business Suite อย่างเดียว) นั่นคือจุดที่เคส B
ทั้ง 100% ไปโผล่ · **ยังไม่ทำในรอบนี้** เพราะเป็นคนละ call site และควรรอผลจริงของ
`request_thread_control` ก่อนว่าคุ้มที่จะเสนอเป็นทางแรกไหม

---

## 5b. 🔬 ผลการทดสอบจริง (2026-08-26 06:17 น., เธรด `4de6ccf1…`, เพจ `207934275730961`)

**คำถามที่งานนี้ตั้งขึ้นมาเพื่อตอบ: `request_thread_control` ใช้ได้จริงไหม → ตอบแล้ว: ไม่ได้**

```
take_thread_control     → (#27) Take thread control is not supported when
                          Conversation Routing is not enabled.        ← ตามที่คาด
request_thread_control  → { "success": true }                          ← Meta "รับคำขอ"
พิมพ์ "สวัสดี" 25 วินาทีต่อมา
                        → (#10) another app is controlling this thread ← ยังส่งไม่ได้
```

`ChatHandoverEvent` มีแถวเดียวคือของเราเอง (`deep-seller-takeover:REQUESTED`) —
**ไม่มี event ตอบกลับจากเจ้าของเธรดเข้ามาเลย**

🛑 **`success: true` ของ `request_thread_control` แปลว่า "คำขอถูกส่ง" ไม่ใช่ "ได้สิทธิ์"** —
คำขอถูกส่งต่อไปยังแอปที่ถือสิทธิ์ (Page Inbox ของ Meta) ซึ่ง**ไม่มีตัวตอบคำขอ** ⇒ เงียบตลอดไป

เอกสาร Meta เขียนว่า *"only the first application to invoke the API will receive control"*
ซึ่งอ่านได้ว่าจะได้สิทธิ์ — ของจริงไม่เป็นอย่างนั้นเมื่อเจ้าของเธรดเป็นแอปของ Meta เอง
**นี่คือเหตุผลที่ต้องทดสอบ ไม่ใช่อ่านเอกสารแล้วสรุป**

### สิ่งที่แก้ตาม (คอมมิตที่สอง)

`REQUESTED` **เดินเส้นเดียวกับ `FAILED` บนหน้าจอ** — ไม่ปลดล็อกช่องพิมพ์อีกต่อไป, ตกไปบล็อกแดง
พร้อมปุ่มไป Business Suite เหมือนกัน ต่างกันแค่ *คำอธิบายว่าเกิดอะไรขึ้น*

เหตุผลเดิมที่ยอมปลดล็อก (*"อาจส่งผ่าน ดีกว่าบล็อกทั้งที่อาจส่งได้"*) ใช้ได้ตอนยังไม่รู้ผล —
พอรู้แล้วว่าไม่มีทางผ่าน การเปิดช่องพิมพ์กลายเป็นการเชิญให้ผู้ขายพิมพ์ทิ้ง **ซึ่งคืออาการเดียวกับ
บั๊กที่ฟีเจอร์นี้ถูกสร้างมาแก้** (ผู้ใช้เจอกับตัวในการทดสอบครั้งนี้พอดี)

ตรรกะย้ายไป `src/lib/thread-control-ui.ts::describeThreadControlOutcome()` (ฟังก์ชันบริสุทธิ์ +
SSOT ของคำที่ผู้ขายเห็น) — เทส `[blocker]` 6 เคส · mutation 4 แบบแดงครบ รวมเคสที่เอา
`if (outcome === 'REQUESTED')` กลับเข้า component (= รูปร่างของบั๊กเดิมเป๊ะ ๆ)

**ยังยิง `request_thread_control` ต่อไป** (เป็นช็อตเดียวที่มีเมื่อ `take` ถูกบล็อก) และยังแยกค่า
`REQUESTED` ไว้ใน `ChatHandoverEvent` — วันที่ Meta เริ่มตอบคำขอจริงจะเห็นจากตารางนั้นก่อน

### ⇒ เหลือทางเดียว: Conversation Routing

ตั้ง **Default Application = Deep Chat & LIVE** ที่ Page Settings ของแต่ละเพจ ซึ่ง:
- **เราตั้งให้ไม่ได้** (ไม่มี endpoint — ยืนยันทั้งรอบ 08-16 และรอบนี้) ⇒ เป็นขั้นตอน onboarding รายเพจ
- **ยังไม่มีใครรู้ว่าตั้งแล้ว Meta AI จะหยุดตอบไปเลยไหม** — เอกสาร Meta ไม่พูดถึง AI agent ของตัวเองเลย

---

## 6. พิสูจน์แล้ว

- `tsc --noEmit` = 0 · `eslint` = 0 error · `next build` สำเร็จ · **4222 เทสเขียว (361 ไฟล์)**
- เทส `[blocker]` 5 เคสใน `graph.test.ts` — **mutation 4 แบบแดงครบ**:
  ยุบ `REQUESTED`→`TAKEN` · ถอด early-return ของ `TOKEN_INVALID` · จัดประเภทจาก error ของ
  `request` แทน `take` · ส่ง `recipient` เป็นสตริงแทน object
- ด่าน `[blocker] R-23` (`chat-queued-ui-gates.test.ts`) จับ `text-success` ใหม่ได้จริง →
  เพิ่ม allow-list พร้อมเหตุผล และ **พิสูจน์ด้วย mutation 2 แบบ** ว่า allow-list ไม่ได้ทำให้ด่านตาบอด
  (แอบใส่ `text-success` ที่ไม่เกี่ยวข้อง = แดง · ลบ entry ออก = แดง)
- `theme-guard.sh` ผ่าน · HR9 grep = 0 · HR12 emoji นอกคอมเมนต์ = 0

---

## 7. งานค้าง

1. 🛑 **ยังไม่เคยกดจริงบนหน้าจอสักครั้ง** — ตัวเลข/ภาพทั้งหมดมาจากโค้ดและ Design Spec
2. ~~ไม่รู้ว่า `request_thread_control` ใช้ได้จริงไหม~~ **ตอบแล้ว 2026-08-26: ใช้ไม่ได้** (ดู §5b)
   งานที่เหลือคือทดสอบทาง Conversation Routing — ต้องให้เจ้าของเพจตั้ง Default Application ก่อน
   แล้วกดปุ่มซ้ำ ถ้าได้ `TAKEN` แปลว่าทางนี้จบ เหลือแค่ทำ flow พาร้านอื่นไปตั้งตาม
3. **เคส B** (§5) ยังเปิดอยู่ — ใหญ่กว่าเคส A ในแง่จำนวนครั้งที่เกิด
4. `TestCase.md` ของ 00018 ยังไม่มีเคสของ flow นี้ (grep `standby` = 0 — หนี้เดิมจาก 08-16 ข้อ 8.4)
5. ปุ่ม "เข้า Business Suite" ยังเป็นลิงก์ generic ไม่ผูกเพจ (ux OQ#1) — **ห้ามเดา `?asset_id=`
   ต้องยืนยันกับเอกสาร Meta ก่อน**
6. บล็อกทั้ง 4 ใบในตระกูลนี้ใช้ `sm:` (viewport) ไม่ใช่ container query ทั้งที่แชทเรนเดอร์ในราง
   384px ได้ — **หนี้เดิม** ควรแก้ทั้ง 4 ใบพร้อมกัน ไม่ใช่เฉพาะใบใหม่ (sibling-surface-parity)

---

## 8. (รอบเดียวกัน) ข้อความเปล่าจาก Meta — ปิดคำถามที่ค้างมาตั้งแต่ 2026-07-26

### ที่มา
ผู้ใช้ชี้บับเบิลในแชทที่ขึ้นว่า
`[ข้อความพิเศษ เช่น คำขอโทรกลับ — ระบบยังไม่รองรับ เปิดดูใน Messenger]`

คำนี้เขียนไว้ตั้งแต่ 26 ก.ค. **ตอนที่ยังไม่รู้สาเหตุ** — คอมเมนต์ในโค้ดยอมรับเองว่า *"ยังไม่รู้ว่ามาทาง
field ไหน"* แล้วฝาก `console.warn` ไว้สืบ ซึ่ง **อ่านย้อนหลังไม่ได้บน Vercel** จึงไม่มีใครกลับมาปิด

### สิ่งที่พบเมื่อเปิด `rawMessage` บน prod (6 ใบ, 08-03 → 08-26)

ตกมาที่ placeholder เดียวกัน แต่เป็น **3 เรื่องคนละอย่าง** และคำเดิมถูกแค่เรื่องเดียว:

| ธงใน payload | ความหมายจริง | ตัวอย่างที่ยืนยันแล้ว |
|---|---|---|
| `is_unsupported: true` | Meta ไม่ส่งเนื้อหาชนิดนี้มาให้เลย | **สติกเกอร์ใน Instagram** — 08-26 17:37 ร้านตอบสติกเกอร์กระต่าย ได้มาแค่ `mid` + ธง (ผู้ใช้ส่งภาพหน้าจอ IG มายืนยัน ไทม์ไลน์ตรงวินาที) |
| `ai_generated: true` + `app_id: 263902037430900` + `metadata: {"source":"axon"}` | **AI ของ Meta เป็นคนเขียนข้อความนั้น** | 08-17 00:46 |
| ไม่มีธงเลย | ยังไม่รู้ (น่าจะเป็นการ์ด "Call me in Messenger" ตามที่เดาไว้เดิม) | 08-12 07:08 |

🛑 **`ai_generated` เป็นสัญญาณ "AI ตอบ" ที่มาจาก payload ตรง ๆ** ซึ่งแม่นกว่า marker ข้อความอังกฤษ
5 สตริงที่ `readMetaAiControlMarker()` ใช้อยู่ (retro 08-16 สรุปเองว่า marker เชื่อไม่ได้ เพราะ Meta
ส่งบ้างไม่ส่งบ้าง) — **ยังไม่ได้เอาไปใช้ตัดสินสถานะ** แค่เก็บเข้า schema + แสดงบนบับเบิลก่อน

### บั๊กที่เจอพ่วง (มีอยู่ก่อน กระทบทุกไฟล์แนบของ IG)

`FAILED_TEXT_BY_TYPE` ฮาร์ดโค้ดคำว่า **"เปิดดูใน Messenger"** ไว้ 11 บรรทัด ขณะที่เส้นทาง ingest
ของ **Instagram ใช้ตารางเดียวกัน** ⇒ ไฟล์แนบ IG ที่ mirror ไม่ผ่านสั่งให้ผู้ขายไปเปิดแอปที่ไม่มี
ข้อความนั้นอยู่ มาตลอด

และ `MIRROR_FAILED_TEXT = '[**ลูกค้าส่ง**รูปภาพ — …]'` ขัดกับเหตุผลที่เขียนไว้เองบรรทัดถัดมา
(ห้ามระบุผู้ส่ง เพราะ path เดียวกันรับทั้งข้อความลูกค้าและ echo ของร้าน) — ถอดทิ้งแล้ว

### สิ่งที่แก้

1. **`webhook-types.ts`** — เพิ่ม `is_unsupported` · `ai_generated` · `app_id` เข้า `MessageSchema`
   (optional ทั้งหมด) เดิม Valibot ตัดทิ้งหมด ⇒ ค่ามีใน `rawMessage` แต่โค้ดใช้ไม่ได้
   (คลาสเดียวกับ `AttachmentSchema.type` ที่ทำรูป 6 ใบหายทั้งชุด 08-04)
2. **`src/lib/chat-placeholder-text.ts` (ใหม่)** = SSOT ของคำแทนเนื้อหาที่แสดงไม่ได้ —
   `metaAppName()` · `attachmentFailedText()` · `emptyMessageText()` · `emptyMessagePreview()`
   ทุกตัวผันตาม `provider`
3. **ถ้อยคำใหม่** — `ai_generated` ชนะ `is_unsupported` เมื่อมาพร้อมกัน (ผู้ขายต้องรู้ก่อนว่า
   *มีคนตอบลูกค้าไปแล้ว* ซึ่งเปลี่ยนการตัดสินใจ ส่วน "ชนิดนี้ไม่รองรับ" ทำอะไรต่อไม่ได้อยู่ดี) ·
   **ไม่มีธง = ไม่พูดชื่อชนิด** ห้ามเดาว่าเป็นการโทรกลับอีก
4. `console.warn` เดิมพ่วงธงทั้งสองไปด้วย (ยังไม่ log ค่าเนื้อหา — กัน PII เหมือนเดิม)

### พิสูจน์
tsc 0 · eslint 0 error · **4237 เทสเขียว (363 ไฟล์)** · เทส `[blocker]` 9 เคส · **mutation 6 แบบแดงครบ**
(คืน `metaAppName` เป็น Messenger เสมอ · เอาคำว่า "โทรกลับ" กลับมา · สลับลำดับธง · ทำ preview ยาว
เท่า body · ถอด `is_unsupported` ออกจาก Valibot · ฮาร์ดโค้ด provider ใน ingest)

### ยังไม่ได้ทำ
- **คอมเมนต์ Instagram ยังไม่รองรับเลย** — `PageComment` บน prod เป็น MESSENGER ล้วน 2,117 แถว
  โค้ดตกทิ้ง 2 ชั้น (`route.ts` รับเฉพาะ `value.item === 'comment'` ซึ่ง IG ส่งคนละรูป · และ
  `ingestFeedComment()` ฮาร์ดโค้ด `getChannelByExternalId('MESSENGER', …)`) — **โครงฐานข้อมูล
  รองรับอยู่แล้ว** (`FacebookPost`/`PageComment` ผูกด้วย `shopChannelId` ไม่ผูกช่องทาง) เหลือแค่
  ต่อตัวรับ + ขอ `instagram_manage_comments` (Standard ใช้ได้ทันทีกับ IG ของทีมเอง)
- ยังไม่เอา `ai_generated` ไปใช้ตัดสิน "AI ถือห้อง" แทน marker

---

## 9. (รอบเดียวกัน) `share` — ชนิดของ Instagram ที่หายไปจากตารางมาตั้งแต่ต้น

เอกสาร IG Messaging ระบุ attachment ไว้ **8 ชนิด**:
`audio` · `file` · `image` · **`share`** · `story_mention` · `video` · `ig_reel` · `reel`

ของเรามีครบทุกตัว **ยกเว้น `share`** — ไม่อยู่ทั้ง `MEDIA_TYPE` และ `LINK_TYPES`
(`{fallback, post, ig_post}`) ⇒ ลูกค้าแชร์โพสต์/รีลเข้ามาถามว่า "มีตัวนี้ไหม"
**ร้านเห็นเป็นกล่อง placeholder เปล่า** ทั้งที่ Meta ส่ง URL มาให้แล้ว

จัดเป็น **ลิงก์ ไม่ใช่สื่อ** เพราะเอกสารเขียนตรงตัว: *"Only the URL for the shared media or post
is included in the notification"* — ไม่มี asset ให้ mirror (เอาไปใส่ `MEDIA_TYPE` จะพยายาม mirror
URL ภายนอกซึ่ง host allow-list บล็อกอยู่แล้ว = ได้กล่องเปล่าเหมือนเดิม)

**ทำไมไม่มีใครเจอ:** prod มี attachment ของ IG เข้ามาแค่ 3 ชนิด (`image` 6 · `template` 1 ·
`story_mention` 1) — **ยังไม่เคยมี `share` เข้ามาเลยสักครั้ง** เพราะบัญชี IG ที่เชื่อมอยู่มีผู้ติดตาม
2 คน (ดู §10)

เทส `[blocker]` 2 เคส · mutation 3 แบบแดงครบ (ถอด `share` ออกจาก `LINK_TYPES` · ย้ายไป
`MEDIA_TYPE` · ให้ใช้คำกลาง `[ไฟล์แนบ]`) · 4239 เทสเขียว

---

## 10. ข้อจำกัดของ Instagram ที่ **แก้ฝั่งเราไม่ได้** (คัดจากเอกสารทางการ)

> *"Messages with **gifs and stickers are not supported**. If a person sends a message with a gif
> or sticker **a webhook will not be triggered** and a webhook notification will not be sent."*

⇒ ลูกค้าส่งสติกเกอร์/GIF เข้ามา **เราไม่ได้รับอะไรเลยแม้แต่บรรทัดเดียว** — ต่างจากตอน *ร้าน* ส่งเอง
ซึ่งได้ echo ติดธง `is_unsupported` (ดู §8)

> *"Disappearing media (view once, allow replay) is not supported"* ⇒ รูป/คลิปดูครั้งเดียว ไม่มีทางเห็น
> *"When a customer reacts to or forwards an image from a carousel … the notification will include
> the **first image** in the carousel which may not be the image the customer reacted to"*
> *"Story Replies webhook currently doesn't support GIF or sticker"*

**ห้ามรับปากผู้ขายว่าจะทำให้เห็นเหมือนในแอป IG ทุกชนิด** — 4 ข้อนี้เป็นกำแพงของแพลตฟอร์ม

---

## 11. ยังไม่ได้ทำ — `reply_to.story` (ตอบสตอรี่)

Meta ส่ง `message.reply_to.story = { url, id }` เมื่อลูกค้า**ตอบสตอรี่ของร้าน** แต่ schema เรา
ประกาศไว้แค่ `reply_to: { mid }` ⇒ Valibot ตัด `story` ทิ้ง ⇒ บนจอเห็นเป็นข้อความลอย ๆ
ไม่รู้ว่าตอบสตอรี่ไหน (ในแอป IG มีรูปสตอรี่ติดอยู่ข้างบนข้อความ)

🛑 **ต้อง migration** — `ChatMessage` ไม่มีคอลัมน์ว่างให้เก็บบริบทสตอรี่ (`replyToMid` ใช้แทนไม่ได้
เพราะ UI เอาไปหาแถว `ChatMessage` ที่ quote ซึ่งสตอรี่ไม่มี) ต้องเพิ่มอย่างน้อย
`replyToStoryId` + `replyToStoryFileId` (mirror รูปสตอรี่ เพราะ CDN URL หมดอายุเมื่อสตอรี่หมด)

**ยังไม่ทำในรอบนี้** — prod ยังไม่เคยมีเคสนี้เลย (0 แถว) และการเพิ่มคอลัมน์ = push ขึ้น main แล้ว
`prisma migrate deploy` รันบน prod ทันที (HR15) จึงควรแจ้งและตัดสินใจแยกรอบ

### อื่น ๆ ที่ schema ตัดทิ้งแต่ยังไม่กระทบใคร
`quick_reply.payload` (Ice Breaker) · `referral.product.id` (IG Shops) — **ไม่ได้เพิ่มเข้า schema
โดยตั้งใจ**: `rawMessage` เก็บ payload ดิบก่อน Valibot อยู่แล้ว ข้อมูลไม่หาย และการเพิ่ม field ที่ยัง
ไม่มีใครอ่านคือโค้ดที่ไม่มีผู้เรียก (บทเรียน `FORWARD_OUTCOME` retro 08-25) — เพิ่มวันที่ทำฟีเจอร์จริง


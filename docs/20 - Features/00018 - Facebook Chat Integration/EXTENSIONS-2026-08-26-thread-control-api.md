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
2. **ไม่รู้ว่า `request_thread_control` ใช้ได้จริงไหม** — นี่คือคำถามที่ทั้งงานนี้ตั้งขึ้นมาเพื่อตอบ
   วิธีอ่านคำตอบ: `select metadata, count(*) from "ChatHandoverEvent" group by 1;`
3. **เคส B** (§5) ยังเปิดอยู่ — ใหญ่กว่าเคส A ในแง่จำนวนครั้งที่เกิด
4. `TestCase.md` ของ 00018 ยังไม่มีเคสของ flow นี้ (grep `standby` = 0 — หนี้เดิมจาก 08-16 ข้อ 8.4)
5. ปุ่ม "เข้า Business Suite" ยังเป็นลิงก์ generic ไม่ผูกเพจ (ux OQ#1) — **ห้ามเดา `?asset_id=`
   ต้องยืนยันกับเอกสาร Meta ก่อน**
6. บล็อกทั้ง 4 ใบในตระกูลนี้ใช้ `sm:` (viewport) ไม่ใช่ container query ทั้งที่แชทเรนเดอร์ในราง
   384px ได้ — **หนี้เดิม** ควรแก้ทั้ง 4 ใบพร้อมกัน ไม่ใช่เฉพาะใบใหม่ (sibling-surface-parity)

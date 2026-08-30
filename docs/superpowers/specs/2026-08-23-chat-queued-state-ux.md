# UX Design Spec — สถานะ `QUEUED` ในห้องแชทผู้ขาย

> ผลของด่าน `safepay-ux` (Hard Rule 8) สำหรับ Task 8 ของแผน `docs/superpowers/plans/2026-08-23-chat-outbound-queue.md`
> CR ของ feature 00018 · Paces (`(paces)/seller/**`) · **ไม่มีหน้าใหม่ ไม่มี route ใหม่ ไม่มี component ใหม่** — แก้ **เงื่อนไขการแสดงผล** ของโค้ดที่มีอยู่ทั้งหมด

🛑 **หมายเหตุที่ต้องแก้ในระดับโปรเจกต์:** CLAUDE.md Hard Rule 8 สั่งให้ ux อ่าน `~/.claude/skills/impeccable/reference/{shape,operate,craft-floor}.md`
โฟลเดอร์นั้น **ไม่มีอยู่จริง** (ย้ายไป `/Users/craftman/.claude/plugins/cache/impeccable/impeccable/3.5.0/skills/impeccable/reference/`) และในโฟลเดอร์จริงมี `shape.md` แต่ **ไม่มี `operate.md` และ `craft-floor.md`** (มี `craft.md`)
⇒ spec ฉบับนี้อิง `DESIGN.md` + `.impeccable/design.json` + `docs/system/ui-guideline/paces-component-reference.md` แทน

---

## Layout (เฉพาะ meta row ที่เปลี่ยน)

```
QUEUED (ใหม่)                    SENT (ไม่เปลี่ยน)              FAILED (ไม่เปลี่ยน)
┌──────────────────┐            ┌──────────────────┐         ┌──────────────────┐
│ 300 บาทครับ       │            │ 300 บาทครับ       │         │ 300 บาทครับ       │
└──────────────────┘            └──────────────────┘         └──────────────────┘
     ⟳ กำลังส่ง                        ✓✓ อ่านแล้ว              ↻ ลองใหม่ (i) | ยกเลิก
  ไม่มีเวลา · ไม่มีเช็คถูก              (หรือ ได้รับแล้ว /            (แถบแดงเดิมทุกประการ)
  ไม่มี avatar ท้ายแถว                   ส่งแล้ว ตามเดิม)

กดค้างบนบับเบิล QUEUED → เหลือ 3 รายการ (สร้างคำสั่งซื้อ / เก็บเข้าคลัง / คัดลอก)
กดค้างบนบับเบิล SENT   → ครบ 6 รายการเหมือนเดิม (เพิ่ม ตอบกลับ / รีแอ็กชัน / สติกเกอร์)
```

## Theme Source Mapping

**ไม่มี element ใหม่เลย** — reuse ของเดิมในไฟล์เดียวกัน 100%

| ส่วน | Source |
|---|---|
| สปินเนอร์ "กำลังส่ง" | `ChatThread.tsx:3462-3467` (ของเดิมของ `_status==='sending'`) |
| icon `loader-2` | `@iconify/react` ผ่าน `Icon` wrapper (ใช้อยู่แล้วบรรทัด 3464) |
| ป้ายบันได 3 ขั้น | `ChatThread.tsx:3477-3493` (ของเดิม) |

---

## รายการเงื่อนไขที่ต้องแก้

### A. `useSellerChatThread.ts:803` — จุดที่จะสร้างบั๊กเดิมซ้ำถ้าไม่แก้

```diff
- return deduped.map((m) => (m.id === localId ? { ...real, _status: 'sent' as const } : m))
+ return deduped.map((m) => (m.id === localId ? { ...real, _status: undefined } : m))
```
ตรงกับ pattern ที่มีอยู่แล้วบรรทัด 786 ของไฟล์เดียวกัน (`{ ...saved, _status: undefined }`)

🛑 **ผลกระทบต่อเนื่องที่ต้องแก้คู่กัน** — หลังแก้ A ค่า `_status === 'sent'` **จะไม่ถูกตั้งอีกเลยตลอดกาล** จุดที่ยังอ่านค่านี้ต้องแก้ตาม: `ChatThread.tsx:1513` (item C) และ `:3492` (item J)

`keepalive: true` ที่ `fetch()` (~754) อยู่ในแผน §11 แต่เป็น network option ไม่ใช่เงื่อนไขแสดงผล — developer เพิ่มตามสัญญา API

### B. `ChatThread.tsx:775-776` — ขยาย type ให้ `tsc` บังคับครบ

```diff
- deliveryStatus?: string | null
+ deliveryStatus?: 'SENT' | 'FAILED' | 'QUEUED' | null
```

### C. `ChatThread.tsx:1892-1894` — `lastShopMsgId` ต้องข้าม QUEUED

```diff
const lastShopMsgId = isExternal
- ? ([...messages].reverse().find((m) => m.senderRole === 'SHOP')?.id ?? null)
+ ? ([...messages].reverse().find(
+     (m) => m.senderRole === 'SHOP' && (m as ChatMessageWithDelivery).deliveryStatus !== 'QUEUED',
+   )?.id ?? null)
  : null
```

และ effect รีเฟรชโควตา LINE ที่ `1510-1518` ต้องเลิกพึ่ง `_status`:

```diff
- for (const m of messages) if (m._status === 'sent') lastSentId = m.id
+ for (const m of messages) {
+   if (m.senderRole === 'SHOP' && (m as ChatMessageWithDelivery).deliveryStatus === 'SENT') lastSentId = m.id
+ }
```

### D. `ChatThread.tsx:2900-2914` — ตัวแปร `queued` / `sentConfirmed`

```diff
const mine = m.senderRole === 'SHOP'
+ const mExt = m as ChatMessageWithDelivery          // ← ย้ายขึ้นมาจากด้านล่าง
+ // 🛑 signal เดียวที่ตัดสินว่าแถวนี้ยังไม่ถึงปลายทาง — ใช้ทุกจุดที่ห้ามขึ้น "ส่งแล้ว"/ห้าม reply-react
+ const queued = mine && mExt.deliveryStatus === 'QUEUED'
  const atBurstEnd = burstEndIds.has(m.id)
- const showTime = atBurstEnd && m._status !== 'sending' && !isLastOld
+ const showTime = atBurstEnd && m._status !== 'sending' && !queued && !isLastOld
  const failedPersisted = mExt.deliveryStatus === 'FAILED'
  const failed = mine && (failedPersisted || m._status === 'failed')
+ // แทน m._status === 'sent' เดิม (จะไม่ถูกตั้งอีกหลังแก้ A) — ครอบทั้ง external ที่ SENT
+ // และแชท DEEP (deliveryStatus=null เสมอ) จึงไม่ผูกกับ === 'SENT' ตรง ๆ
+ const sentConfirmed = mine && !queued && !failedPersisted && m._status !== 'sending' && m._status !== 'failed'
```

### E. `ChatThread.tsx:3015` — `canReply` (ปุ่ม hover เดสก์ท็อป)

```diff
- const canReply = !m.isDeleted && !m._status && !m.id.startsWith('local-')
+ const canReply = !m.isDeleted && !m._status && !m.id.startsWith('local-') && !queued
```
ครอบทั้ง `ReplyMessageButton` (3042) และ `ReactMessageButton` (3047) เพราะ gate ด้วยตัวเดียวกันอยู่แล้ว

**`libEligible` (3021-3030) ไม่แก้โดยตั้งใจ** — เก็บเข้าคลังอ้าง `imageUrl` (fileId ของเรา) ไม่ใช่ mid ของ Meta ⇒ ใช้ได้แม้ยัง QUEUED

### F. `ChatThread.tsx:1649,1671` — เมนูกดค้างมือถือ

```diff
- if (!m.isDeleted && !m._status && !m.id.startsWith('local-')) {
+ if (!m.isDeleted && !m._status && !m.id.startsWith('local-') && (m as ChatMessageWithDelivery).deliveryStatus !== 'QUEUED') {
```
ทำเหมือนกันที่เงื่อนไข `sticker` (1671) — ทั้งคู่ต้องอ้าง mid เพื่อผูก `reply_to`
`order` / `save-to-library` / `record-payment` / `copy` **ไม่แก้** (เหตุผลเดียวกับ E)

### G. `ChatThread.tsx:1771-1773` — รีแอ็กชันในเมนูกดค้าง

```diff
- if (!m || m.isDeleted || m._status || m.id.startsWith('local-')) return []
+ if (!m || m.isDeleted || m._status || m.id.startsWith('local-') || (m as ChatMessageWithDelivery).deliveryStatus === 'QUEUED') return []
```

### H. `ChatThread.tsx:3382-3389` — เงื่อนไขแสดง meta row

```diff
      m._status === 'sending' ||
+     queued ||
      failed ||
      m.id === lastShopMsgId ||
-     m._status === 'sent'))) && (
+     false))) && (
```
**ห้ามแทนด้วย `sentConfirmed`** — `sentConfirmed` เป็นจริงตลอดไปสำหรับทุกข้อความที่ยืนยันแล้ว (ไม่ transient เหมือน `_status`) ⇒ meta row จะโผล่ใต้ **ทุกข้อความ**ในเบิร์สต์ ขัดดีไซน์เดิมที่ให้เวลา/เช็คถูกโชว์เฉพาะท้ายกลุ่ม · `atBurstEnd` + `m.id === lastShopMsgId` ครอบเคสจริงหมดแล้ว

### I. `ChatThread.tsx:3462-3467` — สปินเนอร์

```diff
- {mine && m._status === 'sending' && (
+ {mine && (m._status === 'sending' || queued) && (
    <span className="flex items-center gap-1" title="กำลังส่งอยู่ — ไม่ต้องส่งซ้ำ">
      <Icon icon="loader-2" className="animate-spin" />
      กำลังส่ง
    </span>
  )}
```

### J. `ChatThread.tsx:3477-3493` — บันได 3 ขั้น

```diff
- {mine && m._status !== 'sending' && !failed && m.id === lastShopMsgId ? (
+ {mine && m._status !== 'sending' && !queued && !failed && m.id === lastShopMsgId ? (
      ... อ่านแล้ว / ได้รับแล้ว / ส่งแล้ว (ไม่เปลี่ยน) ...
  ) : (
-   mine && m._status === 'sent' && <Icon icon="check" className="text-success" />
+   sentConfirmed && <Icon icon="check" className="text-success" />
  )}
```
`!queued` เป็นการ์ดชั้นสอง — ตรรกะแล้วไม่จำเป็นเพราะ item C ทำให้แถว QUEUED ไม่มีทางเป็น `lastShopMsgId` แต่คงไว้ตามธรรมเนียมโปรเจกต์ที่ invariant ไม่ explicit เคยพังเงียบมาแล้วหลายครั้ง

### K. 🛑 `ChatThread.tsx:2760-2840` — บล็อกอัลบั้มรูป (นอกช่วงบรรทัดที่แผนระบุ)

บล็อกกลุ่มรูปที่ส่งติดกัน (ใช้กับ `IMAGE_GRID` / edge case E-12 ตรง ๆ) มีตรรกะคู่ขนานแต่ **ไม่มีการ gate ปุ่มตอบกลับ/รีแอ็กชันด้วย mid เลยในปัจจุบัน** (`ReplyMessageButton`/`ReactMessageButton` ที่ 2786, 2794 render แบบไม่มีเงื่อนไขเมื่อ `mine`)

เดิมไม่มีปัญหาเพราะอัลบั้มถูกกรองมาจากข้อความที่ persist แล้วเท่านั้น — **แต่ QUEUED เป็นแถว persist จริงที่มี id จริง จึงหลุดช่องนี้ทันที**

1. เพิ่ม `const queued = mine && (last as ChatMessageWithDelivery).deliveryStatus === 'QUEUED'`
2. ห่อ `ReplyMessageButton` / `ReactMessageButton` (2786, 2794) ด้วย `!queued &&`
3. เพิ่มเงื่อนไข "กำลังส่ง" เทียบเท่า item I ในเมตาไลน์ของอัลบั้ม (2816-2834)
4. `last.id === lastShopMsgId` (2824) ไม่ต้องแก้ — ได้ประโยชน์อัตโนมัติจาก item C

---

## คำตอบ 4 โจทย์ (เจ้าของระบบตัดสิน 1-3 · ux ตัดสิน 4)

**Q1 — ใช้ "กำลังส่ง" + สปินเนอร์ชุดเดิม** ✅ ตรง HR16 (ไม่มีคำใหม่ให้ผู้ขายเรียนรู้)
จุดเสี่ยงสุดคือ item J: ถ้าไม่แก้ `!queued` + `lastShopMsgId` พร้อมกัน แถว QUEUED จะโชว์ "ส่งแล้ว" ทันทีเพราะ `_status` ไม่ใช่ `'sending'` อีกต่อไปหลังแก้ A

**Q2 — ซ่อน ไม่ใช่ disabled + tooltip** ✅
1. มี precedent ในไฟล์นี้เอง (คอมเมนต์ ~3161 เรื่อง quote-jump เขียนตรง ๆ ว่าห้ามสร้าง affordance ปลอมเมื่อยังไม่รู้ปลายทาง — สถานการณ์เดียวกับ QUEUED ที่ยังไม่มี mid)
2. QUEUED ปกติอยู่ 1-2 วินาที — ออกแบบ disabled state ให้ของที่หายไปเองแทบจะทันทีคือความซับซ้อนที่ไม่คุ้ม
3. เมนูกดค้างปรับความยาวตามชนิดข้อความอยู่แล้ว (`m.body?.trim()`, `slipTarget`, `libEligible`) — การไม่ push รายการเข้า array เป็น pattern เดิมของไฟล์นี้

**Q3 — `lastShopMsgId` ถอยไปเกาะใบก่อนหน้าที่ส่งสำเร็จ** ✅ แก้ที่**ต้นทาง** (item C) ไม่ใช่ไล่เติม `!queued` ทีละจุด
- ข้อความ SENT ก่อนหน้าไม่กระพริบ/ไม่ downgrade ระหว่างที่ใบใหม่ QUEUED
- แถว QUEUED ไม่มีวันเป็น `lastShopMsgId` ⇒ กันบั๊กที่ระดับ data flow ไม่ใช่แค่ระดับ render
- พอ QUEUED → SENT บันไดขยับมาเองในรอบ re-render ถัดไป (realtime UPDATE broadcast) ไม่ต้องมี logic พิเศษ
- ทางเลือก "หายไปเลยระหว่างรอ" ถูกปัดตกเพราะทำให้ผู้ขายเสียข้อมูลที่มีอยู่แล้วและถูกต้อง (อ่านแล้ว/ได้รับแล้วของใบก่อน) โดยไม่มีเหตุผลรองรับ

**Q4 — ค้าง ~1 นาทีไม่ต้องเพิ่ม UI ใหม่** (ux ตัดสิน)
1. เป็น worst case ไม่ใช่ทางเดินหลัก · KG-3 แสดงปรัชญาทีมว่ารอดูการใช้งานจริงก่อนสร้างของเพิ่ม
2. ทุกทางที่ทำให้ "ดูเหมือนช้ากว่าปกติ" ชัดขึ้น (ตัวนับ/สีเปลี่ยน/ข้อความยาวขึ้นตามเวลา) ถูก D-2 ห้ามอยู่แล้ว
3. สปินเนอร์ที่หมุนต่อเนื่องคือสัญญาณที่ถูกแล้วว่า "ยังทำงานอยู่ ไม่ใช่ค้าง"

**สิ่งที่ทำแทน (ต้นทุนแทบศูนย์ ไม่ใช่ element ใหม่):** `title="กำลังส่งอยู่ — ไม่ต้องส่งซ้ำ"` บน `<span>` ของ "กำลังส่ง" (item I)
เหตุผลของถ้อยคำ: ความเสี่ยงจริงของหน้าต่าง 1 นาทีคือผู้ขาย**เข้าใจผิดว่าค้างแล้วพิมพ์ส่งซ้ำ** — ประโยคนี้ตัดความเข้าใจผิดนั้นตรง ๆ โดยไม่ใช้คำที่ทำให้ตกใจ

> 🛑 **กลับมติแล้ว 2026-08-27 (เจ้าของระบบสั่งเอง): ถอดประโยค "ไม่ต้องส่งซ้ำ" ออกทั้งหมด** — ตอนกำลังส่งขึ้นแค่ `กำลังส่ง` คำเดียว (สปินเนอร์ที่หมุนอยู่บอกว่างานยังเดินอยู่แล้ว) · ด่าน `[blocker]` ใน `src/lib/__tests__/chat-queued-ui-gates.test.ts` §P2 กลับด้านเป็น "ห้ามมีประโยคนี้" แล้ว — ห้ามเติมกลับตามสเปกย่อหน้าข้างบน

---

## Edge states (ยืนยันว่าครบ ไม่ต้องออกแบบเพิ่ม)

| state | พฤติกรรม |
|---|---|
| QUEUED ปกติ (1-2 วิ) | "กำลังส่ง" + สปินเนอร์ · ไม่มีปุ่ม reply/react · ไม่มีเวลา |
| QUEUED worst case (~1 นาที) | เหมือนข้างบนทุกประการ |
| QUEUED → SENT (realtime UPDATE) | เปลี่ยนเป็นบันได 3 ขั้นทันทีที่ broadcast ถึง (UI อ่าน `deliveryStatus` เป็น SSOT อยู่แล้ว) |
| QUEUED → FAILED | ไม่ต้องแก้อะไรเพิ่ม — `failedPersisted` เดิมจับได้ทันที |
| แชท DEEP (ไม่เคยมี QUEUED) | `deliveryStatus` เป็น `null` เสมอ ⇒ `queued` เป็น `false` เสมอ ⇒ พฤติกรรมเดิม 100% |
| `IMAGE_GRID` หลายแถว QUEUED พร้อมกัน | ดู item K |

---

## Impeccable compliance

**Mode: Operate** — `(paces)/seller/**` งาน backend-status-driven บนหน้าที่ผู้ขายไล่อ่านสถานะหลายสิบบับเบิลต่อวัน ⇒ ความสม่ำเสมอของสถานะสำคัญกว่าความสวยของสปินเนอร์

- **Verified-Means-Green** — สปินเนอร์ "กำลังส่ง" **ไม่ใช้สีเขียวเลย** (inherit `text-default-700` ไม่มี semantic class) นี่คือหัวใจของ CR นี้: กันไม่ให้สถานะที่ยังไม่ยืนยันไปแตะสีเขียวหรือคำว่า "ส่งแล้ว" ที่สงวนไว้ให้สถานะยืนยันแล้ว
- **One Voice** — ไม่เพิ่มการใช้สี primary เลย
- **HR16** — "กำลังส่ง" คือคำเดิมที่มีอยู่แล้ว (บรรทัด 3465) ไม่มีคำใหม่ ยกเว้น tooltip ซึ่งเขียนเป็นประโยคปกติ ไม่กล่าวหาผู้ใช้
- **anti-slop** — ไม่เพิ่มการ์ด/แบดจ์/ปุ่มใหม่แม้แต่ตัวเดียว เป็นการแก้เงื่อนไข boolean ล้วน
- **tap target** — ไม่มี tap target ใหม่ ปุ่มที่ซ่อนไปคือปุ่มที่มีอยู่แล้วและผ่านเกณฑ์ ≥44px การซ่อนไม่กระทบขนาดปุ่มที่เหลือ
- ไม่มีจุดที่ Impeccable ขัดกับ theme (งานนี้ไม่แตะสี/ฟอนต์/spacing/shadow เลย)

---

## Open questions → คำตัดสินของ Controller

| # | คำถาม | ตัดสิน |
|---|---|---|
| 1 | tooltip Q4 รวมรอบนี้ไหม | **รวม** — ต้นทุนแทบศูนย์ และตอบความเสี่ยงจริง (ผู้ขายพิมพ์ส่งซ้ำเพราะคิดว่าค้าง) |
| 2 | item K (บล็อกอัลบั้ม) รวมคอมมิตเดียวกันไหม | **รวม** — E-12 ระบุชัดว่า `IMAGE_GRID` สร้างหลายแถว QUEUED จริง ปล่อยไว้ = บั๊กที่รู้ตัวแล้วยัง ship |
| 3 | ตัด `'sent'` ออกจาก `_status` union | **ทำ** — ค่านั้นไม่ถูก assign อีกแล้ว ปล่อยไว้คือ type ที่โกหก |
| 4 | เทส UI-level ยืนยัน guard | **ทำแบบสแกนซอร์ส** — รีโปไม่มี jsdom/testing-library (`vitest.config.ts` ตั้ง `environment: "node"`) ⇒ เทสต้องอ่านซอร์สยืนยันว่าทุกจุดที่ gate ด้วย mid มี `queued` อยู่ในเงื่อนไข |

---

# รอบแก้ไข (หลังเจ้าของระบบตอบโจทย์ 1-4)

รายการ A–K ด้านบน **ไม่มีข้อไหนถูกแก้** — คำตอบที่ได้มาสอดคล้องกับที่ออกแบบไว้ทั้งหมด ส่วนที่เพิ่มคือ 3 เรื่องนี้

## 1. 🛑 แก้สมมติฐานผิดในแผน: "ปุ่มยกเลิกข้อความ (unsend)" ไม่มีอยู่จริงให้ซ่อน

แผนหลัก (`docs/superpowers/plans/2026-08-23-chat-outbound-queue.md` edge case E-10) เขียนว่าต้องปิด **unsend** สำหรับแถว QUEUED — **ตรวจโค้ดแล้วไม่มีปุ่มนั้นใน UI ของ Deep เลย**

`DELETE /api/chat/conversations/[id]/messages/[messageId]` มีขอบเขตแค่ **"ยกเลิกข้อความที่ยิงไม่สำเร็จ"** — gate ด้วย `deliveryStatus === 'FAILED'` เท่านั้น และปุ่ม "ยกเลิก" ตัวเดียวที่มีอยู่จริงถูก gate ด้วย `failed` ซึ่ง **ไม่ทับกับ `queued` โดยธรรมชาติอยู่แล้ว** (แถวหนึ่งเป็นได้อย่างเดียว)

⇒ **ไม่ต้องแก้อะไรเพิ่มสำหรับ unsend** — สิ่งที่ต้องซ่อนจริงมีแค่ **ตอบกลับ (reply) · รีแอ็กชัน · สติกเกอร์** ตาม item E/F/G

## 2. Q2 "บับเบิลต้องไม่ขยับ" — ได้ฟรีจากโครงเดิม ไม่ต้องเขียนโค้ดกันชน

โครงแถวที่ `ChatThread.tsx:3131-3151`:
```jsx
<div className={`group my-5 flex items-start gap-2.5 ${mine ? 'justify-end' : ''}`}>
  {mine && actionCluster}      {/* item 1 — ความกว้างแปรผันตามจำนวนปุ่ม */}
  <div data-message-bubble>…   {/* item 2 — item สุดท้ายเสมอสำหรับข้อความของร้าน */}
</div>
```

ด้วย `justify-content: flex-end` ตำแหน่งขอบซ้ายของ item สุดท้าย = `containerWidth − bubbleWidth` **ไม่มีพจน์ของ `actionClusterWidth` อยู่ในสมการ** — พื้นที่ว่างส่วนเกินถูกดันไปกองที่จุดเริ่มต้นของ item แรกทั้งหมด

บวกข้อเท็จจริงเสริม 2 ข้อ:
- ปุ่ม hover ทุกตัวมี base class `hidden lg:group-hover:flex` (`ReplyMessageButton`/`ReactMessageButton`/`CreateOrderFromMessageButton` — บรรทัด 209/567/590/604) ⇒ **นอกช่วง hover ปุ่มกิน 0px เสมอ** ไม่ว่า `canReply` จะจริงหรือเท็จ
- ปุ่มเรียงแนวนอน (`flex items-start gap-0.5`) ⇒ จำนวนปุ่มมีผลกับ**ความกว้าง**ของ cluster เท่านั้น ไม่มีผลกับ**ความสูง**ของแถว

⇒ **ไม่ต้อง reserve width ไม่ต้อง `min-w` ไม่ต้อง skeleton**

🛑 **แต่การรับประกันนี้ไม่มี type error คอยเตือน** — ต้องเพิ่มคอมเมนต์กำกับที่บรรทัด **3134** ว่า:
> ห้ามสลับลำดับ flex item (actionCluster ต้องมา**ก่อน**บับเบิลเสมอ) และห้ามถอด `justify-end` — บับเบิลยึดตำแหน่งขวาด้วยกลไกนี้ ถ้ารื้อโครงนี้ (เช่นย้าย avatar เข้ามาปนในแถวระดับนี้) บับเบิลจะขยับตอนปุ่มโผล่/หาย โดยไม่มีอะไรฟ้อง

## 3. Q3 — บับเบิล QUEUED หลายใบโชว์ "กำลังส่ง" พร้อมกันได้ และ**ควร**เป็นแบบนั้น

```
ใบ 1  "สวัสดีครับ"      ✓ ส่งแล้ว        ← lastShopMsgId ชี้ที่ใบนี้ (ใบล่าสุดที่ "ไม่ QUEUED")
ใบ 2  "มีสีดำครับ"      ⟳ กำลังส่ง        ← สปินเนอร์ของตัวเอง
ใบ 3  "300 บาท"        ⟳ กำลังส่ง        ← สปินเนอร์ของตัวเอง ไม่ต้องรอใบ 2
```

`queued` (item D) คำนวณแยกต่อข้อความในลูป render อยู่แล้ว ไม่มี state ระดับห้อง ⇒ **ได้มาฟรี ไม่ต้องเขียนอะไรเพิ่ม** และไม่ควร dedupe ให้เหลือสปินเนอร์เดียว เพราะ:
- ตรงกับความจริง — ทั้ง 3 ใบยังไม่ถึงลูกค้า ถ้าซ่อนสปินเนอร์ของใบ 2-3 ไว้ ใบ 2-3 จะ **ดูเหมือนยังไม่ถูกส่งเลย** ซึ่งแย่กว่า
- D-3 (ล็อกลำดับต่อห้อง) รับประกันว่าใบ 2 ไม่ SENT ก่อนใบ 1 ⇒ สปินเนอร์จะหาย **ไล่จากบนลงล่างตามลำดับที่พิมพ์** อ่านง่ายกว่าสปินเนอร์รวมจุดเดียว

เมื่อใบ 2 กลาย SENT → `lastShopMsgId` ขยับไปใบ 2 อัตโนมัติ → ใบ 1 เหลือเช็คถูกเดี่ยวผ่าน `sentConfirmed` → ใบ 2 ได้บันไดเต็ม → ใบ 3 ยังกำลังส่งของตัวเองต่อ

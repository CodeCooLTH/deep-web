# Design Spec: Facebook/Instagram Chat Integration — Seller Inbox + Channel Settings (feat `00018`)

> Register: **product** (seller/admin surface — DESIGN.md dual-skin override, ดู CLAUDE.md). Primary = Paces `#236dc9` **ห้ามใช้ม่วง Vuexy**.
> Source docs read: `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, `docs/superpowers/specs/2026-07-22-facebook-chat-integration-design.md` §8.1, PRD/BRD/API/DATABASE feat 00018, `theme/paces/Docs/index.html` equivalent (`docs/system/ui-guideline/paces-component-reference.md`), โค้ดจริงทั้งหมดของ `/inbox` ปัจจุบัน + layout shell

---

### Impeccable compliance

| หลักการ | การปฏิบัติในสเปกนี้ |
|---|---|
| Register `product` (ไม่ใช่ `brand`) | ทุกสี/เงา/ขอบโค้งอ้าง **Paces token** ไม่ใช่ `#7367F0`/DESIGN.md ตรงๆ — primary = `bg-primary`/`text-primary` (`#236dc9`), success/warning/danger = Paces semantic tokens |
| The One Voice Rule (ม่วง ≤10%) | N/A โดยตรง (register product ใช้น้ำเงิน Paces แทน) — ปุ่ม primary (สร้างออเดอร์, เชื่อม Page, ส่งข้อความ) เป็น solid `bg-primary` เท่านั้น ที่เหลือเป็น soft/ghost/neutral ตาม Paces convention เดิม (ไม่ใช้ primary เกร่อทั้งจอ) |
| Verified-Means-Green | badge สถานะ `ACTIVE` (channel เชื่อมสำเร็จ) ใช้ `bg-success/15 text-success` เท่านั้น — ไม่ใช้ success กับสถานะที่ยังไม่ยืนยัน (`TOKEN_INVALID`=danger, `DISCONNECTED`=neutral) |
| Ink-Tinted Shadow / Flat-At-Rest | ใช้ shadow ของ `.card` (`0px 1px 4px rgba(130,143,163,.15)`) เท่านั้น ไม่เพิ่ม custom shadow ใหม่ ยกเว้นจุดที่มี precedent (bottom-sheet มือถือ, cite precedent) |
| Sentence-case, ภาษาไทยเรียบง่าย | ทุก label/ปุ่มเป็นประโยคไทยธรรมดา ("เชื่อม Facebook Page", "ปักหมุดแชท") ไม่ใช่ ALL CAPS |
| Tap target ≥44px | ปุ่ม action หลัก (ส่ง, ปิดงาน, สร้างออเดอร์, back) ทุกตัว ≥44px; ปุ่ม secondary ใน row/rail หนาแน่น (pin/hide เดี่ยว) ใช้ pattern `btn btn-icon` + `min-h-11 min-w-11` (precedent `OrderCardMenu.tsx`) — ดูหมายเหตุ Design decisions #7 |
| Anti-slop (ไม่ hero-metric, ไม่ eyebrow) | ไม่มี stat-card เกร่อในหน้านี้ — เนื้อหาทั้งหมดเป็น functional UI (list/thread/panel) ไม่ตกแต่งเกิน |
| No emoji (Hard Rule 12) | icon ทุกตัวเป็น tabler ระบุชื่อและ verify มีจริงแล้ว (grep `generated-icons.css` — ดูตารางท้ายเอกสาร) |

---

## หน้า: Seller Inbox — 3 คอลัมน์ (`/inbox`, `/inbox/[conversationId]`)

### User stories ที่ครอบ
FR-FBC-12 (badge ช่องทาง + filter), FR-FBC-13 (ปักหมุด/ซ่อน/ปิดงาน), FR-FBC-14 (แท็ก/โน้ต/tab ออเดอร์), FR-FBC-05/06 (24h window + fail แสดงในเธรด), FR-FBC-07/08 (สร้างออเดอร์ผูก Customer), Design Spec §8.1 + Q-4 ผลตัดสิน, และคำสั่งเพิ่มวันนี้ #1 (สลับเมนูซ้าย) + #2 (แบ่งช่องทาง/เพจ)

### กลไกหลัก (อ่านก่อนดู wireframe — สำคัญที่สุดของสเปกนี้)

**Desktop (≥1024px) เท่านั้น:** เมื่อ path เริ่มด้วย `/inbox` เมนูซ้าย (`<aside id="app-menu" className="app-menu">` — `src/layouts/components/Sidenav/index.tsx`) จะ **สลับเนื้อหา** จาก `AppMenu` (เมนู Dashboard/คำสั่งซื้อ/สินค้า/…) เป็น **Chat Rail** — เป็นคนละก้อนเนื้อหาที่ render ในตำแหน่ง DOM เดียวกัน (`aside`) ไม่ใช่คอลัมน์ที่ 4 เพิ่มเข้ามา ตรงกับที่ user สั่ง "เมนูซ้ายต้องถูกแทนที่"

- กลไกที่แนะนำ (ตรงไปตรงมาที่สุดกับสถาปัตยกรรมที่มีอยู่): `(dashboard)/layout.tsx` **มี** `headers().get('x-pathname')` อยู่แล้ว (ใช้ทำ onboarding redirect) → เช็ค `pathname.startsWith('/inbox')` แล้วส่ง Chat Rail เข้า prop ใหม่ของ `VerticalLayout`/`Sidenav` (เช่น `sidenavOverride`) แทนที่ `items={menuItems}` — เพราะ `layout.tsx` ไม่ remount ระหว่างเปลี่ยนหน้า `/inbox` → `/inbox/[id]` (Next App Router) **rail จึงค้างอยู่ที่ตำแหน่งเดิม ไม่ต้องสร้าง master-detail component ใหม่** — นี่คือเหตุผลที่คอลัมน์ "รายการแชท" ยังโผล่ตลอดเวลาแม้กำลังเปิดอ่านเธรดอยู่
- **ทางออกจากโหมดแชท (กันหลงทาง):** แถวบนสุดของ Chat Rail มีปุ่ม **"กลับเมนูหลัก"** (icon `arrow-left` + label) เต็มความกว้าง กด → `/dashboard` (Sidenav สลับกลับเป็น `AppMenu` อัตโนมัติเพราะ pathname เปลี่ยน) — เป็นทางออกเดียวที่ต้องมีเสมอ ไม่พึ่ง breadcrumb/back browser
- Chat Rail **ไม่ render** `OnHoverToggle` (ปุ่มย่อเมนูเป็นแถบไอคอน) — list การสนทนาที่ถูกย่อเหลือไอคอนไม่มีประโยชน์ ตัดออกในโหมดนี้
- ความกว้าง rail: token เดิม `--sidenav-width: 245px` แคบเกินจะใส่ search+tabs+filter+preview ข้อความ — ขยายเป็น **320px เฉพาะโหมดแชท** ผ่าน scoped CSS var override (pattern เดียวกับ `.seller-mobile-shell` ที่มีอยู่แล้วใน `src/assets/css/safepay-overrides.css`) ด้วย marker class ใหม่ เช่น `.seller-chat-shell { --sidenav-width: 320px; }` ที่ `@media (min-width: 1024px)` — **นี่ไม่ใช่ arbitrary Tailwind value** (Hard Rule 7 ห้ามเฉพาะ `text-[]`/`bg-[]`/ไวยากรณ์ bracket ใน JSX) แต่เป็นการ override CSS custom property ที่มี token name เดิมของ Paces เอง ผ่านกลไก scoped-shell ที่ project ใช้อยู่แล้ว — ยังต้องมี comment กำกับตามธรรมเนียมไฟล์นั้น

**Tablet (768–1023px) และ Mobile (<768px):** ไม่มีเมนูซ้ายให้สลับอยู่แล้ว (ระบบเดิมซ่อน `.app-menu` ทั้งหมดที่ `max-width:1023px` ผ่าน `.seller-mobile-shell` — เป็น breakpoint เดียวกับที่ทั้งระบบ seller ใช้อยู่ ไม่ใช่ breakpoint ใหม่ที่ผมกำหนดเอง) ดังนั้นสิ่งที่ "ถูกแทนที่" บนจอเล็กคือ **ไม่มีอะไรให้แทนที่** — ยึด drill-down เดิม (list page → thread page) ที่ระบบมีอยู่แล้ว เพิ่มแค่ search/filter/badge เข้าไปในหน้า list ตามปกติของ page content (ดู §Tablet/Mobile ด้านล่าง) นี่คือการตัดสินใจที่ตั้งใจไม่ขยาย breakpoint ของ mobile-shell เพราะจะกระทบทุกหน้า seller อื่นที่ไม่เกี่ยวกับ feature นี้ (ดู Design decisions #1)

---

### Layout (ASCII wireframe)

#### Desktop ≥1024px — `/inbox/[conversationId]` (สถานะเต็มรูป 3 คอลัมน์)

```
┌──────────────────┬───────────────────────────────────────┬───────────────────────┐
│ CHAT RAIL (320px) │ THREAD (flex-1)                        │ CUSTOMER PANEL (340px)│
│ (แทนที่ AppMenu)  │                                         │                       │
│ ←กลับเมนูหลัก     │┌───────────────────────────────────────┐│┌─────────────────────┐│
│                   ││ [👤] คุณสมชาย  [🔵Messenger]   [⋮][ปิดงาน]││ [👤] คุณสมชาย [🔵]   ││
│ 🔍ค้นหา...        ││───────────────────────────────────────││ ─────────────────────││
│                   ││ ⏱ เหลือเวลาตอบ 6 ชม. 20 นาที           ││ [ลูกค้า][ออเดอร์][แท็ก][Note]│
│[ทั้งหมด][Deep][🔵][🟣]││───────────────────────────────────────││                       ││
│ [เพจ▾][สถานะ▾]   ││   ┌──────────────┐                     ││ ยังไม่ผูกลูกค้า        ││
│ (เพจ: ร้าน A ✕)   ││   │ สวัสดีค่ะ มีสินค้า│                     ││ [📱กรอกเบอร์เพื่อสร้าง ││
│ ─────────────────││   │ ชิ้นนี้ไหม     │  10:32              ││  ออเดอร์]             ││
│┌─────────────────┐││   └──────────────┘                     ││                       ││
││[👤🔵] คุณสมชาย   │││                        ┌──────────────┐││ [🛒 สร้างออเดอร์]     ││
││ สวัสดีค่ะ...  10:32│││                        │ มีค่ะ พรุ่งนี้│││ ─────────────────────││
││              [ใหม่]│││                        │ ส่งได้เลย   ││ ...tab content...     ││
│└─────────────────┘││                        │ ✓ 10:35    │││                       ││
│┌─────────────────┐││                        └──────────────┘││                       ││
││[👤🟣][📌] คุณมล.  │││                                       ││                       ││
││ สนใจสินค้า... 09:1│││                                       ││                       ││
│└─────────────────┘││                                       ││                       ││
│  (scroll…)        ││ ─────────────────────────────────────  ││                       ││
│ ดูแชทที่ซ่อนไว้ (2)  ││ [📎ปิด] [พิมพ์ข้อความ...........] [ส่ง➤]││                       ││
│                   ││ * Messenger/Instagram ส่งได้เฉพาะข้อความ ││                       ││
└───────────────────┴───────────────────────────────────────┴───────────────────────┘
```

`/inbox` (ยังไม่เลือกเธรด) — คอลัมน์กลาง+ขวาแทนที่ด้วย empty-state กึ่งกลาง: icon `message-circle` + "เลือกบทสนทนาทางซ้ายมือเพื่อเริ่มอ่าน/ตอบ" (reuse `SellerEmptyState compact`)

#### Tablet 768–1023px — `/inbox` (list) → `/inbox/[id]` (thread) ยังเป็น drill-down เหมือน mobile-shell เดิม

```
┌─────────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│ [≡ Header: "ข้อความ"]              [🔔]  │   │ [← กลับ]  คุณสมชาย  [🔵]      [⋮][ปิดงาน]│
│ 🔍ค้นหาชื่อ/ลูกค้า/เบอร์/ข้อความ           │   │ ⏱ เหลือเวลาตอบ 6 ชม. 20 นาที               │
│ [ทั้งหมด][Deep][🔵Messenger][🟣IG]        │   │ ─────────────────────────────────────────│
│ [เพจ▾][สถานะ▾]                            │   │  ...ข้อความ... (เต็มความกว้างจอ)          │
│ ─────────────────────────────────────────│──▶│                                           │
│ [👤🔵] คุณสมชาย     สวัสดีค่ะ...  10:32 [ใหม่]│   │ ─────────────────────────────────────────│
│ [👤🟣][📌]คุณมล.   สนใจสินค้า...   09:15  │   │ [📎ปิด] [พิมพ์ข้อความ...] [ส่ง➤]  [ℹ️ข้อมูลลูกค้า]│
│ (scroll…)                                │   │ * Messenger/Instagram ส่งได้เฉพาะข้อความ  │
│ ดูแชทที่ซ่อนไว้ (2)                        │   │                                           │
├──[หน้าหลัก][คำสั่งซื้อ][+][แชท][ร้านค้า]──┤   │  (bottom nav ซ่อนในหน้าเธรด — เหมือน /orders)│
└─────────────────────────────────────────┘   └─────────────────────────────────────────┘
```

กด **ℹ️ข้อมูลลูกค้า** → Customer Panel เปิดเป็น **modal กลางจอ** (ไม่ใช่ bottom-sheet เต็มจอ — พื้นที่ tablet พอ) — reuse pattern `OrderQrSheet.tsx` (มือถือ=bottom-sheet, ≥lg... ในที่นี้ทุกจอ <1024 ยังเป็น bottom-sheet ตาม breakpoint เดิมของ component นั้น ยกเว้นถ้า Controller ต้องการแยก sm/lg เพิ่ม — ดู Open Questions #3)

#### Mobile <768px — เหมือน tablet ทุกประการ (breakpoint เดียวกับ mobile-shell 1024px) ต่างแค่ความหนาแน่น

```
┌───────────────────────┐        ┌───────────────────────┐        ┌───────────────────────┐
│ ข้อความ            [🔔]│        │[←] คุณสมชาย [🔵] [⋮][ปิด]│        │ ▬▬ (grip)              │
│ 🔍ค้นหา...             │        │⏱เหลือ 6ชม.20น.         │        │ ข้อมูลลูกค้า        [✕] │
│ [ทั้งหมด][Deep][🔵][🟣] │        │─────────────────────  │        │ [👤] คุณสมชาย  [🔵]    │
│ [เพจ▾][สถานะ▾]         │        │  สวัสดีค่ะ...  10:32   │        │ [ลูกค้า][ออเดอร์][แท็ก][Note]│
│ ────────────────────  │  ──▶   │           มีค่ะ  10:35 │  ──▶   │ ยังไม่ผูกลูกค้า         │
│ [👤🔵]คุณสมชาย  10:32 [ใหม่]│        │                        │        │ [🛒 สร้างออเดอร์]      │
│ [👤🟣📌]คุณมล.   09:15  │        │────────────────────    │        │                        │
│ (scroll…)              │        │[📎][พิมพ์...][ส่ง➤]     │        │                        │
│ ดูแชทที่ซ่อนไว้ (2)      │        │* Messenger/IG ส่งได้เฉพาะ│        │                        │
├─[หน้าหลัก][สั่งซื้อ][+][แชท][ร้าน]┤        │ข้อความตัวอักษร         │        │                        │
└───────────────────────┘        └───────────────────────┘        └───────────────────────┘
```

---

### Section breakdown (prose)

**Chat Rail (desktop, แทนที่ AppMenu):**
1. แถว "กลับเมนูหลัก" (`arrow-left` + label เต็มแถว, ไม่ใช่แค่ไอคอน — ต้องอ่านออกชัดว่ากดแล้วออกจากโหมดแชท)
2. ช่องค้นหา (`input-icon-group` + `Icon icon="search"` + `<input type="search" className="form-input bg-light/30">` — ค้นหาชื่อ/เบอร์/ข้อความ, debounce client-side, query param `?q=`)
3. Channel tabs — 4 tab: **ทั้งหมด** / **Deep** (icon `message-circle`) / **Messenger** (icon `brand-messenger`, สี `#0084FF`\*) / **Instagram** (icon `brand-instagram`, สี `#E1306C`\*) — mimic `nav-tabs`/`nav-link` class ของ Paces แต่ **ขับด้วย React state เอง ไม่ใช้ `data-hs-tab` ของ Preline** (เหตุผลเดียวกับที่ FilterDropdown แทน hs-dropdown — parent re-render จาก fetch/search ทำให้ Preline inline-state พัง)
4. แถวตัวกรอง — 2 ปุ่ม `FilterDropdown` (component `src/components/safepay/FilterDropdown.tsx`, `btn-sm`): "เพจ" (list ของ `ShopChannel` ที่เชื่อมไว้ — แสดงเฉพาะเมื่อ channel tab ≠ Deep, หรือแสดงตลอดแต่ disabled เมื่อ tab=Deep) และ "สถานะ" (ทั้งหมด/เปิดอยู่/ปิดงานแล้ว)
5. Active-filter chip (ถ้ามี filter ≠ default) — `badge bg-primary/15 text-primary` + ปุ่ม `x` เล็กในตัวเดียวกัน กดเพื่อ reset filter นั้น
6. รายชื่อบทสนทนา (scroll, sentinel pagination เหมือนเดิม) — แถวแต่ละอัน: avatar (fallback initials, `BuyerAvatar`/`ChatAvatar` เดิม) + **channel badge** overlay มุมล่างขวาของ avatar (circle 16px, icon ช่องทางสีตามช่องทาง, ring `ring-card`) + ชื่อ + preview + เวลา + badge "ใหม่" (ของเดิม) + icon `pin-filled` เล็กหน้าชื่อถ้า `isPinned` + ปุ่ม kebab (`dots-vertical`, `min-h-11 min-w-11`) เปิดเมนู custom React (pattern `OrderCardMenu.tsx`): ปักหมุด/เลิกปักหมุด, ซ่อนแชท, ปิดงาน/เปิดงานอีกครั้ง
7. ท้าย list: ลิงก์ข้อความ "ดูแชทที่ซ่อนไว้ (N)" — สลับ filter สถานะเป็น "ซ่อนอยู่" ชั่วคราว (ไม่ลบทิ้ง — ตรงกับ BR-FBC-15 ที่ซ่อนไม่ตัดขาดการรับข้อความ)

**Thread (กลาง):**
1. Header: avatar+ชื่อผู้ติดต่อ + channel badge (icon+สี เดียวกับ rail) + ปุ่ม "ปิดงาน"/"เปิดงานอีกครั้ง" (`btn btn-sm bg-light text-dark` ปกติ / `bg-success/15 text-success` เมื่อ toggled resolved) เด่นชัดตาม reference + kebab `⋮` (ปักหมุด/ซ่อน — action รอง)
2. **แบนเนอร์ 24h window** (เฉพาะ `channel != DEEP`) แสดงทันทีใต้ header เสมอเมื่อยังเปิดอยู่ (ไม่ใช่แค่ตอนใกล้หมด) 3 ระดับสี:
   - เหลือ >4 ชม.: `bg-info/15 text-info`, icon `clock`, "ตอบได้ภายใน {X} ชม. นับจากข้อความล่าสุดของลูกค้า"
   - เหลือ ≤4 ชม.: `bg-warning/15 text-warning`, icon `alert-triangle`, "ใกล้หมดเวลาตอบ — เหลือ {X} ชม. {Y} นาที"
   - หมดแล้ว: `bg-danger/15 text-danger`, icon `message-circle-off`, "เกิน 24 ชั่วโมงจากข้อความล่าสุดของลูกค้า — ส่งข้อความใหม่ไม่ได้ รอให้ลูกค้าทักมาใหม่ก่อน"
3. เนื้อหาข้อความ — โครงเดิมของ `ChatThread.tsx` ทุกประการ (bubble, date-divider, avatar) **เพิ่ม**: bubble ที่ `deliveryStatus='FAILED'` แสดง badge เล็กใต้ bubble `bg-danger/15 text-danger text-2xs` + icon `alert-circle` + `failureReason` (ข้อความ error ดิบจาก Meta — แสดงตรงๆ ตาม BR-FBC-12 "ห้าม fail เงียบ"; ไม่มีปุ่ม "ลองใหม่" เพราะยังไม่มี retry endpoint — ดู Open Questions #4)
4. Composer — เดิมทุกประการ **เพิ่ม 2 กรณี**:
   - เมื่อ window หมด: ปุ่มแนบรูป + input + ปุ่มส่ง ทั้งชุด `disabled` (`opacity-50 cursor-not-allowed`), placeholder เปลี่ยนเป็น "ส่งข้อความไม่ได้ในตอนนี้"
   - เมื่อ `channel != DEEP` (ไม่ว่า window จะเปิดหรือปิด): ปุ่มแนบรูป (`paperclip`) เป็น `disabled` เสมอ + `aria-label="ยังไม่รองรับการส่งรูปในช่องทางนี้"` + caption ถาวรใต้ composer `text-2xs text-default-400`: "Messenger และ Instagram ยังส่งได้เฉพาะข้อความตัวอักษรในตอนนี้"

**Customer Panel (ขวา, desktop persistent / mobile-tablet = sheet):**
1. Header: avatar+ชื่อ (จาก `ExternalContact.name` หรือ `Customer` ที่ผูกแล้ว) + channel badge
2. Tab bar (4 tab, custom React-driven เหมือน channel tabs — ไม่ใช้ `data-hs-tab`): **ลูกค้า** / **ออเดอร์** / **แท็ก** / **Note** — **ไม่มี "ใบเสนอราคา"** ตามที่สั่ง (BR-FBC-19 งดไว้)
3. **Tab "ลูกค้า" (default):**
   - ยังไม่ผูก (`customerId=null`): การ์ดอธิบายสั้นๆ "ยังไม่ผูกกับลูกค้าในระบบ — ผูกอัตโนมัติเมื่อสร้างออเดอร์และกรอกเบอร์โทร" + ปุ่ม primary เต็มความกว้าง "สร้างออเดอร์" (icon `shopping-cart-plus`)
   - ผูกแล้ว: การ์ด `Customer` ที่ผูกไว้ (รหัสลูกค้า, ชื่อผู้ติดต่อ, เบอร์โทร [mask ตาม RSC PII rule ที่ server boundary], ลิงก์ "ดูในหน้าลูกค้า" → `/customers/[id]`) — **ไม่มีปุ่ม "ยกเลิกการผูก"** ในสเปกหลัก (ดู Open Questions #2 — เกิน scope BRD ปัจจุบัน)
4. **Tab "ออเดอร์":** ถ้าผูกลูกค้าแล้ว → list ออเดอร์จริงของ `Customer` นั้น (การ์ดย่อ: token, สถานะ badge, ยอดรวม, วันที่ — reuse pattern การ์ดจาก `/customers` หรือ order list ย่อ) ถ้ายังไม่ผูก → empty state "ผูกลูกค้าก่อนเพื่อดูประวัติออเดอร์" + CTA เดียวกับ tab ลูกค้า
5. **Tab "แท็ก":** chip list (`badge bg-default-100 text-default-600` + ปุ่ม `x` ใน chip เพื่อลบ) + input เพิ่มแท็กใหม่ (`form-input` + ปุ่ม `+`) — ไม่ผูกกับข้อความที่ส่งออก (แท็กเป็นข้อมูลภายในเท่านั้น BR-FBC-18)
6. **Tab "Note":** caption เตือนบนสุด `text-2xs text-default-400`: "โน้ตนี้เห็นเฉพาะทีมร้านค้า ไม่ส่งไปหาลูกค้า" (BR-FBC-17 ทำให้ visible เป็น UX signal ด้วย ไม่ใช่แค่ backend guarantee) + list โน้ตเรียงเวลา (ผู้เขียน+เวลา+ข้อความ) + textarea เพิ่มโน้ตใหม่ + ปุ่ม "บันทึกโน้ต"

---

### Theme Source Mapping

| Section | Theme file path (theme/... หรือ SafePay-adapted primitive ที่มีอยู่แล้ว) | Component | หมายเหตุ adapt |
|---|---|---|---|
| VerticalLayout swap mechanism | `src/layouts/VerticalLayout.tsx` (SafePay-adapted, Base เดิม `theme/paces/Admin/TS/src/layouts/VerticalLayout.tsx`) | เพิ่ม prop ใหม่ (เช่น `sidenavOverride`) ส่งต่อ `Sidenav` | ไม่ compose ใหม่ — ต่อเติมของเดิมที่มี Base อยู่แล้ว |
| Sidenav content swap | `src/layouts/components/Sidenav/index.tsx` | เมื่อมี override → render node นั้นแทน `<AppMenu items={items}/>` + ซ่อน `<OnHoverToggle/>` | คง `<AppLogo/>` เดิมไว้บนสุดเสมอ |
| Chat Rail — search box | `theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:19-24` | `input-icon-group` + `Icon icon="search"` | ตัดปุ่ม "เขียนแชทใหม่" (ตัดไปแล้วตั้งแต่ feat 00011) |
| Chat Rail — channel tabs / Customer Panel tabs | `theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx:677-689` (`.nav-tabs`/`.nav-link` class) | ใช้ class เดิม แต่ขับ active state ด้วย React state เอง (ไม่ใช้ `data-hs-tab`) — เหตุผลเดียวกับ FilterDropdown §3b | |
| Chat Rail — Page/สถานะ filter | `src/components/safepay/FilterDropdown.tsx` (มี Base ผูกอยู่แล้ว) | ใช้ตรง 2 instance | align="left", `btn-sm` |
| Chat Rail — conversation row + kebab menu | `src/app/(paces)/seller/(dashboard)/inbox/components/InboxList.tsx` (row markup) + `src/app/(paces)/seller/(dashboard)/orders/components/OrderCardMenu.tsx` (kebab pattern) | ปรับ `Link`→ list item ยังเป็น `Link` ปกติ (ไม่ใช่ panel แบบ ChatWidgetList) + เพิ่ม channel badge overlay + kebab | Base ดั้งเดิมของ row คือ `theme/.../ContactList.tsx:44-57` (cite ต่อ) |
| Thread header/body/composer | `src/app/(paces)/seller/(dashboard)/inbox/[conversationId]/components/ChatThread.tsx` (SafePay-adapted, Base `theme/.../ChatPage.tsx:33-110`) | เพิ่ม 24h banner, disabled composer 2 กรณี, failed-message badge, channel badge ที่ header | โครงเดิมคงทั้งหมด |
| 24h banner | ไม่พบ theme match ตรง (Paces ไม่มี "messaging window countdown" component) — **closest primitive = `.card-header` alert row ด้วย `bg-{semantic}/15` token** (pattern เดียวกับ scam-link warning banner ที่มีอยู่แล้วใน `ChatThread.tsx:246-251`) | custom composition จาก token ที่มีอยู่ | ให้ Controller ยืนยันว่า reuse pattern นี้พอ ไม่ต้องมี component ใหม่ |
| Customer Panel shell (desktop) | `.card` primitive (`theme/paces/Admin/TS/src/assets/css/custom/_card.css`, ดู `docs/system/ui-guideline/paces-component-reference.md` §7) | การ์ดเดี่ยว ความกว้างคงที่ 340px | ไม่พบ theme "contact info sidebar" ตรง — ใกล้สุดคือ `apps/users/profile` card layout (ใช้เป็น reference โครงสร้างเท่านั้น ไม่ copy ตรง) |
| Customer Panel (mobile/tablet sheet) | `src/app/(paces)/seller/(dashboard)/orders/components/OrderQrSheet.tsx` (Base ของมันเอง: `theme/.../ui/offcanvas/page.tsx` + `theme/.../ui/modals/page.tsx`) | reuse โครง responsive bottom-sheet/modal ทั้งชุด แทนที่เนื้อหา QR ด้วย Customer Panel content | |
| Channel badge (avatar overlay) | ไม่พบ theme match ตรง — closest primitive = badge `size-4 rounded-full` (Paces §6 "fixed badge") | custom small circle ด้วย token `size-4 rounded-full ring-2 ring-card` | สี Messenger/Instagram = Hard Rule 6 exception (ดู Design decisions #6) |
| Empty state (ยังไม่เลือกเธรด / ไม่มีข้อความ) | `src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx` (มี Base ผูกแล้ว) | `compact` mode | |

---

### User flow

1. Seller คลิกเมนู "ข้อความ" (หรือ bottom nav "แชท" บนมือถือ) → `/inbox`
2. **Desktop:** เมนูซ้ายเปลี่ยนเป็น Chat Rail ทันที (Sidenav สลับเนื้อหา) → เห็น list การสนทนาทุกช่องทางรวมกัน (ค่าเริ่มต้น "ทั้งหมด") → คอลัมน์กลาง = empty-state "เลือกบทสนทนา"
3. กรอง: แตะ tab "Messenger" → list กรองเหลือเฉพาะ `channel=MESSENGER` → เปิด "เพจ" filter → เลือกเพจใดเพจหนึ่ง → chip active filter โผล่ → list กรองซ้ำ
4. คลิกแถวสนทนา → `/inbox/[id]` → Chat Rail **ยังอยู่ตำแหน่งเดิม** (ไม่กระพริบ/ไม่หาย) แถวที่เลือกไฮไลต์ (active state) → คอลัมน์กลางโหลด thread + คอลัมน์ขวาโหลด Customer Panel
5. ถ้า external channel + window ยังเปิด → แบนเนอร์สีบอกเวลาที่เหลือ → พิมพ์ข้อความ → กด "ส่ง" → ข้อความไปจริงผ่าน Send API → ปรากฏใน thread ทันที (broadcast)
6. ถ้า window หมด → composer ปิดเองตั้งแต่เปิดหน้า (ไม่ต้องกดส่งก่อนถึงจะรู้)
7. ลูกค้าพร้อมซื้อ → seller เปิด tab "ลูกค้า" ใน Customer Panel (หรือกดปุ่ม "สร้างออเดอร์" ที่โผล่อยู่แล้วถ้ายังไม่ผูก) → ไป `/orders/new?conversationId=<id>` → กรอกเบอร์ (บังคับ) → บันทึก → ระบบผูก `Customer` ให้อัตโนมัติ → กลับมาที่เธรด tab "ลูกค้า" แสดงการ์ดลูกค้าที่ผูกแล้ว, tab "ออเดอร์" มีรายการใหม่
8. ปิดงาน: กดปุ่ม "ปิดงาน" ที่ header thread → เธรดออกจาก default list view (ยังหาได้ผ่าน filter "สถานะ: ปิดงานแล้ว") → ถ้าลูกค้าทักใหม่ → auto-reopen กลับมาโชว์ปกติทันที (ไม่ต้องทำอะไร)
9. ออกจากโหมดแชท: กด "กลับเมนูหลัก" บน Chat Rail → `/dashboard` → เมนูซ้ายกลับเป็น `AppMenu` ปกติ
10. **Mobile/Tablet:** ขั้นตอนเดียวกันแต่ทีละหน้า (list → thread → กด "ข้อมูลลูกค้า" เปิด sheet/modal → "สร้างออเดอร์" ในนั้น) — bottom nav "แชท" ทำหน้าที่เป็นทางกลับสู่เมนูหลักอยู่แล้ว (ไม่ต้องมีปุ่มเพิ่ม)

### Content outline (ภาษาไทย)

| จุด | ข้อความ |
|---|---|
| ปุ่มกลับเมนูหลัก | "กลับเมนูหลัก" |
| Search placeholder | "ค้นหาชื่อ ลูกค้า เบอร์ หรือข้อความในแชท" |
| Channel tabs | "ทั้งหมด" / "Deep" / "Messenger" / "Instagram" |
| Filter: เพจ | label ปุ่ม default "เพจ" / option "ทุกเพจ" |
| Filter: สถานะ | label ปุ่ม default "สถานะ" / options "ทั้งหมด" "เปิดอยู่" "ปิดงานแล้ว" |
| ลิงก์ดูซ่อน | "ดูแชทที่ซ่อนไว้ ({N})" |
| Kebab menu items | "ปักหมุดแชทนี้" / "เลิกปักหมุด" · "ซ่อนแชทนี้" · "ปิดงาน" / "เปิดงานอีกครั้ง" |
| ปุ่มปิดงาน (header) | "ปิดงาน" / เมื่อปิดแล้ว: "เปิดงานอีกครั้ง" |
| 24h banner (เหลือเวลา) | "ตอบได้ภายใน {X} ชั่วโมง นับจากข้อความล่าสุดของลูกค้า" |
| 24h banner (ใกล้หมด) | "ใกล้หมดเวลาตอบ — เหลือ {X} ชม. {Y} นาที" |
| 24h banner (หมดแล้ว) | "เกิน 24 ชั่วโมงนับจากข้อความล่าสุดของลูกค้า — ส่งข้อความใหม่ไม่ได้ กรุณารอให้ลูกค้าทักมาใหม่" |
| Composer placeholder (window ปิด) | "ส่งข้อความไม่ได้ในตอนนี้" |
| แนบรูป disabled (external channel) | aria-label: "ยังไม่รองรับการส่งรูปในช่องทางนี้"; caption: "Messenger และ Instagram ยังส่งได้เฉพาะข้อความตัวอักษรในตอนนี้" |
| ข้อความส่งไม่สำเร็จ | badge ใต้ bubble: "ส่งไม่สำเร็จ — {failureReason}" |
| Customer Panel: ยังไม่ผูก | "ยังไม่ผูกกับลูกค้าในระบบ — ผูกอัตโนมัติเมื่อสร้างออเดอร์และกรอกเบอร์โทร" |
| ปุ่มสร้างออเดอร์ | "สร้างออเดอร์" |
| Tab ออเดอร์ (ว่าง) | "ผูกลูกค้าก่อนเพื่อดูประวัติออเดอร์" |
| Tab Note caption | "โน้ตนี้เห็นเฉพาะทีมร้านค้า ไม่ส่งไปหาลูกค้า" |
| Tab Note ปุ่ม | "บันทึกโน้ต" |
| Tab แท็ก placeholder | "เพิ่มแท็ก..." |
| Empty state ไม่เลือกเธรด | "เลือกบทสนทนาทางซ้ายมือเพื่อเริ่มอ่าน/ตอบ" |
| Empty state ไม่มีข้อความ (เดิม) | "ยังไม่มีข้อความ" / "เมื่อลูกค้าทักแชทมาที่ร้าน จะแสดงในหน้านี้" |

### Edge states ที่ต้องออกแบบ

- **ไม่มีเธรดเลย:** `SellerEmptyState` เดิม (ไม่เปลี่ยน) — แต่เพิ่ม CTA รอง "เชื่อม Facebook Page" ลิงก์ไป `/settings/channels` ถ้ายังไม่มี `ShopChannel` เลย (แยกจากกรณี "มีช่องทางแล้วแต่ยังไม่มีคนทัก")
- **filter แล้วไม่มีผลลัพธ์:** empty state ย่อยในตำแหน่ง list "ไม่พบบทสนทนาตามที่กรอง" + ปุ่ม "ล้างตัวกรอง"
- **loading initial:** skeleton เดิม (`SellerCardSkeleton`/`SellerThreadSkeleton`) reuse
- **error โหลด list/thread:** `SellerErrorState` เดิม
- **window หมดอายุ:** composer disabled ทั้งชุด (ไม่ปล่อยให้กดแล้ว error — ตาม FR-FBC-05)
- **ส่งข้อความไม่สำเร็จ (SEND_FAILED 502):** toast `pacesToast.error(...)` ทันที + badge ค้างอยู่ใต้ bubble ถาวร (ไม่หายเมื่อ reload)
- **type≠TEXT บน external channel (400):** ป้องกันที่ UI ก่อนถึง error นี้แล้ว (ปุ่มแนบรูป disabled) — เคส 400 นี้ backend ยังต้อง handle เผื่อ race, แต่ UI ไม่ควรเจอ error นี้ในทางปกติ
- **`ShopChannel.status='TOKEN_INVALID'`:** เธรดของช่องทางนั้นยังอ่านได้ปกติ แต่ composer แสดง banner เพิ่มเติม (แทนที่ 24h banner) `bg-danger/15 text-danger` icon `alert-circle`: "การเชื่อมต่อกับเพจนี้มีปัญหา — ไปที่ตั้งค่าช่องทางเพื่อเชื่อมต่อใหม่" + ลิงก์ `/settings/channels`
- **`ExternalContact.name = null`:** fallback "ผู้ติดต่อ" (ตาม pattern เดิม `'ผู้ซื้อ'`)
- **ไม่มีสิทธิ์/เธรดไม่ใช่ของร้าน:** `SellerErrorState` เดิม (403/404 รวมกัน กัน enumeration — ตาม comment เดิมในโค้ด)
- **แท็ก/โน้ต backend ยังไม่มี table (S-8 gap ตาม DATABASE.md §8 OQ#2):** ถ้า Controller เริ่ม implement UI นี้ก่อน backend พร้อม → tab แสดง `SellerEmptyState compact` "ฟีเจอร์นี้กำลังเปิดใช้งาน" แทน ไม่ mock ข้อมูลปลอม (สอดคล้อง BR-FBC-19 "ห้าม mock ข้อมูล")

### Design decisions + rationale

1. **ไม่ขยาย breakpoint mobile-shell (1024px) ให้ tablet มี 2-col:** ระบบทั้งหมดยึด 1024px เป็นเส้นแบ่งเดียว (design.json `seller-mobile: 1024px`, `.seller-mobile-shell` CSS) — การสร้าง breakpoint ที่ 3 เฉพาะหน้านี้จะทำให้ mental model ของ dev เพี้ยนและเสี่ยง regression หน้าอื่น จึงเลือก "tablet = mobile pattern, ปรับแค่ความหนาแน่น/sheet vs bottom-sheet" แทนการสร้างสถาปัตยกรรม master-detail ใหม่เฉพาะ tablet
2. **Sidenav swap แทน master-detail component ใหม่:** ใช้ประโยชน์จาก Next.js layout persistence (layout.tsx ไม่ remount ข้ามหน้าลูก) แทนการสร้าง client component คุม state ทั้ง list+thread เอง — ลด effort และ regression risk บน layout เดิมที่ทำงานอยู่แล้ว (unread badge, onboarding gate ฯลฯ)
3. **Rail กว้าง 320px ผ่าน scoped CSS var:** เลือกไม่ใช้ arbitrary Tailwind (Hard Rule 7) แต่ override token เดิมแบบ scoped — มี precedent ตรงในโปรเจกต์แล้ว (`.seller-mobile-shell`)
4. **Channel/Customer Panel tabs ไม่ใช้ Preline `hs-tab`:** เหตุผลเดียวกับ FilterDropdown §3b — parent (rail/panel) re-render บ่อยจาก fetch/search จะทำให้ inline-state ของ Preline หาย เหมือนบทเรียน hs-dropdown เดิม
5. **ไม่ทำปุ่ม "ยกเลิกการผูก" ลูกค้า:** PRD/BRD ไม่มี FR ครอบ (การผูกทำทางเดียวผ่านสร้างออเดอร์เท่านั้น) — เพิ่มเองเสี่ยงกำหนด business rule ใหม่นอกเหนือ BRD (นอกขอบเขต ux agent) จึงเสนอเป็น Open Question แทน
6. **สี badge ช่องทาง Messenger/Instagram:** ใช้ Hard Rule 6 exception เดียวกับที่ `ConnectedAccountsClient.tsx` ทำไว้แล้ว (สี brand เป็น asset ใช้ตาม ref ได้ พร้อม comment กำกับ) — Instagram reuse `#E1306C` (มีอยู่แล้วในโค้ด), Messenger เสนอ `#0084FF` (ต้อง verify เป็นทางการ — ดู Open Questions #1)
7. **ปุ่ม pin/hide ในแถว rail เป็น kebab เดียว (ไม่ใช่ 2 ไอคอนแยกเหมือน reference):** rail กว้างแค่ 320px ไม่พอสำหรับ 2 ไอคอนแยก+avatar+เวลา+badge โดยไม่แน่นเกิน — รวมเป็น kebab เดียว `min-h-11 min-w-11` (44px ตาม accessibility) ยังครบ action ทั้งหมดแต่กดครั้งเดียวเพิ่ม (trade-off ที่ยอมรับได้เพราะ pin/hide/resolve เป็น action รอง ไม่ใช่ primary)
8. **แบนเนอร์ 24h แสดงตลอดเวลาที่เปิดอยู่ (ไม่ใช่แค่ใกล้หมด):** ตาม BRD §6.5 "แบนเนอร์เวลาที่เหลือต้องเห็นชัดก่อนหมดเวลา ไม่ใช่แค่ตอนหมดแล้ว" — ตีความว่าต้องเห็นได้ตลอด ไม่ใช่โผล่แค่ warning tier

### Open questions (ให้ Controller/developer)

1. **สี Messenger badge:** เสนอ `#0084FF` (Messenger blue อย่างง่าย ไม่ใช่ gradient ทางการ) — ต้อง verify กับ brand guideline จริงก่อน hardcode ถาวร
2. **ปุ่ม "ยกเลิกการผูกลูกค้า" ใน tab ลูกค้า:** reference มี แต่ BRD ไม่มี FR ครอบ — เอาเข้า scope MVP หรือตัดออก (ต้องมี service function ใหม่ถ้าเอา — ยังไม่มีตาม DATABASE.md)
3. **Customer Panel sheet บน tablet:** ใช้ breakpoint เดียวกับ `OrderQrSheet.tsx` เดิม (bottom-sheet ต่ำกว่า `lg`) หรือ Controller อยากให้ tablet ได้ modal กลางจอเหมือน desktop (ต้องขยาย component นั้นเพิ่ม breakpoint `md`)
4. **ปุ่ม "ลองส่งใหม่" สำหรับข้อความ FAILED:** ยังไม่มี retry endpoint (ดู API.md gap) — เสนอเป็น follow-up ไม่ใช่ MVP นี้ ยืนยันกับ Controller
5. **`/orders/new?conversationId=<id>`:** ชื่อ query param เสนอโดยเทียบ convention เดิม (`?product=<id>`) — API.md ยืนยันว่ายังไม่มี route/contract รองรับ prefill นี้จริง ต้องปิดที่ SRS/API ก่อน implement
6. **tab "ใบเสนอราคา":** ตามคำสั่ง — **ไม่ออกแบบในสเปกนี้** เพราะ OQ-FBC-02 ยังไม่ปิด หาก Controller ต้องการ mockup แยกไว้ล่วงหน้า แจ้งแยกต่างหาก

---

## หน้า: ตั้งค่าช่องทางแชท (`/seller/settings/channels`, short path `/settings/channels`)

### User stories ที่ครอบ
FR-FBC-09/10/11 (เชื่อม/จัดการ/ถอด Page + IG auto-link)

### Layout (ASCII wireframe — responsive เดียวกันทั้ง 3 breakpoint, การ์ดปรับความกว้างเอง)

```
Desktop/Tablet (max-w-2xl การ์ดกึ่งกลางเหมือนหน้า /settings เดิม)
┌──────────────────────────────────────────────────────┐
│ ช่องทางแชท                                             │
│ ─────────────────────────────────────────────────────│
│ เชื่อม Facebook Page เพื่อรับข้อความ Messenger/Instagram│
│ เข้ามาที่ Deep โดยตรง                                   │
│                                    [🔵 เชื่อม Facebook Page]│
│ ─────────────────────────────────────────────────────│
│ [🔵Messenger][👤] ร้านของฉัน          [เชื่อมแล้ว✓]  [ถอด]│
│ [🟣Instagram][👤] ร้านของฉัน (IG)      [เชื่อมแล้ว✓]  [ถอด]│
│ [🔵Messenger][👤] สาขา 2               [โทเคนหมดอายุ⚠]│
│                                        [เชื่อมต่อใหม่][ถอด]│
└──────────────────────────────────────────────────────┘

Mobile <768px — การ์ดเต็มความกว้าง, แถวปุ่ม stack แนวตั้งถ้าจำเป็น
┌───────────────────────┐
│ ช่องทางแชท              │
│ ───────────────────── │
│ เชื่อม Facebook Page... │
│ [🔵 เชื่อม Facebook Page]│
│ ───────────────────── │
│ [🔵][👤]ร้านของฉัน      │
│ [เชื่อมแล้ว✓]           │
│ [ถอด]                  │
│ ───────────────────── │
└───────────────────────┘
```

### Section breakdown (prose)

- **Header card** — pattern เดียวกับ `/settings/page.tsx` (`card-header` + `h5` ชื่อ section) — ชื่อ "ช่องทางแชท"
- **CTA เชื่อม Page** — `<a href="/api/channels/facebook/connect" className="btn bg-primary text-white hover:bg-primary-hover">` (ต้องเป็น `<a>` ธรรมดา ไม่ใช่ `fetch`/`onClick` เพราะ endpoint นี้ตอบ `302 redirect` ไป Facebook OAuth ตรงๆ) icon `brand-facebook`
- **แถวช่องทาง** — reuse โครง `ProviderRow` ของ `ConnectedAccountsClient.tsx` (icon+label+badge สถานะ+ปุ่ม action) แต่เปลี่ยน semantic: นี่คือ 1 แถวต่อ 1 `ShopChannel` (ไม่ใช่ 1 provider ต่อ 1 row เหมือนหน้า login-link) — จึง list ได้หลายแถวต่อ provider เดียวกัน (หลาย Page Messenger ได้)
- **badge สถานะ:** `ACTIVE`=`bg-success/15 text-success` "เชื่อมแล้ว" (icon `check`), `TOKEN_INVALID`=`bg-danger/15 text-danger` "โทเคนหมดอายุ" (icon `alert-triangle`) + ปุ่มเพิ่ม "เชื่อมต่อใหม่" (ไปหน้า connect ซ้ำ), `DISCONNECTED`=`bg-default-100 text-default-500` "ถอดการเชื่อมต่อแล้ว" (ไม่ต้องมีปุ่ม action)
- **ปุ่มถอด** — `btn btn-sm bg-danger/15 text-danger` → Sweet Alert confirm (`icon:'warning'`, `showCancelButton`) "ยกเลิกการเชื่อมต่อ {ชื่อ Page}? ข้อความเก่ายังอยู่ แต่จะไม่ได้รับข้อความใหม่จากเพจนี้อีก" — pattern เดียวกับ `ConnectedAccountsClient.handleDisconnect` (ไม่ต้องมีขั้น OTP เพิ่ม เพราะนี่ไม่ใช่ login-linked account)
- **Toast จาก callback redirect** — client wrapper อ่าน `?status=connected&connected=N&skipped=...` และ error variants (`cancelled`/`state_mismatch`/`no_code`/`no_shop`/`no_eligible_page`/`error`) → `pacesToast.success`/`pacesToast.error` ตาม pattern `useEffect` เดียวกับ `ConnectedAccountsClient.tsx` แล้ว `router.replace('/settings/channels')` ลบ query

### Theme Source Mapping

| Section | Theme file path | Component | หมายเหตุ |
|---|---|---|---|
| Card shell + header | `src/app/(paces)/seller/(dashboard)/settings/page.tsx` (SafePay-adapted, Base `theme/.../apps/users/account-settings/page.tsx`) | คัดลอกโครง card-header | เปลี่ยนชื่อ section |
| Provider/channel row | `src/app/(paces)/seller/(dashboard)/settings/ConnectedAccountsClient.tsx` (`ProviderRow`) | ปรับให้ map 1 แถวต่อ `ShopChannel` แทน 1 ต่อ provider | คง badge/ปุ่ม pattern เดิม |
| Disconnect confirm | Sweet Alerts `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx` (Hard Rule 8) | reuse pattern จาก `ConnectedAccountsClient.handleDisconnect` | ตัดขั้น OTP ออก |
| Toast callback status | `src/lib/paces-toast.ts` (Hard Rule 9) | reuse pattern useEffect เดิม | |
| Empty state | `SellerEmptyState` | icon `brand-facebook`, title "ยังไม่ได้เชื่อมช่องทางแชท" | |

### User flow
1. seller เข้า `/settings/channels` (ผ่านลิงก์จาก Chat Rail settings icon หรือ banner "TOKEN_INVALID" ในเธรด) → เห็น list ช่องทางที่เชื่อมแล้ว (หรือ empty state)
2. กด "เชื่อม Facebook Page" → ไป Facebook OAuth dialog จริง → กลับมาที่ `/settings/channels?status=connected&connected=2` → toast "เชื่อมสำเร็จ 2 ช่องทาง"
3. กด "ถอด" ที่แถวใดแถวหนึ่ง → Swal confirm → สำเร็จ → toast + แถวหายไป/เปลี่ยน badge

### Content outline (ภาษาไทย)
"ช่องทางแชท" / "เชื่อม Facebook Page เพื่อรับข้อความ Messenger และ Instagram เข้ามาที่ Deep โดยตรง" / "เชื่อม Facebook Page" / "เชื่อมแล้ว" / "โทเคนหมดอายุ" / "เชื่อมต่อใหม่" / "ถอด" / "ถอดการเชื่อมต่อแล้ว" / Swal confirm: "ยกเลิกการเชื่อมต่อ {ชื่อ}?" / "ข้อความเก่ายังอยู่ แต่จะไม่ได้รับข้อความใหม่จากเพจนี้อีก" / toast สำเร็จ: "เชื่อมต่อสำเร็จ {N} ช่องทาง" / error ต่างๆ: "ยกเลิกการเชื่อมต่อแล้ว" (cancelled) / "เซสชันหมดอายุ กรุณาลองใหม่" (state_mismatch) / "ไม่พบร้านค้าของคุณ" (no_shop) / "ไม่พบเพจที่คุณมีสิทธิ์จัดการข้อความ" (no_eligible_page) / "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่" (error)

### Edge states
- 0 ช่องทาง: empty state + CTA
- ทุกช่องทาง `TOKEN_INVALID`: banner สรุปด้านบน "มี {N} ช่องทางที่โทเคนหมดอายุ ต้องเชื่อมต่อใหม่"
- callback error ทุก variant → toast ตาม mapping ด้านบน (ไม่ throw หน้า error เต็มจอ — endpoint ออกแบบมาให้ redirect กลับหน้าปกติเสมอยกเว้น 401)

---

## ตารางรวม icon ที่ใช้ (verify มีจริงใน tabler set แล้วทั้งหมด — grep `generated-icons.css`)

`arrow-left` `search` `message-circle` `brand-messenger` `brand-instagram` `brand-facebook` `filter` `pin` `pin-filled` `eye-off` `dots-vertical` `circle-check` `refresh` `clock` `alert-triangle` `message-circle-off` `alert-circle` `paperclip` `send-2` `shopping-cart-plus` `check` `x` `settings` `tag` `note`/`notes` `phone` `external-link` `package-off` `photo`

**ยังไม่มี icon กำกับ (ต้องถาม user ก่อน — Hard Rule 12):** ไม่มี — ทุกจุดในสเปกนี้ระบุ icon ที่ verify แล้วครบ

---

## สรุปสำหรับ Controller

จุดที่ต้องตัดสินใจก่อน developer เริ่ม: Open Questions 6 ข้อข้างบน (สีแบรนด์, ปุ่มยกเลิกผูกลูกค้า, breakpoint ของ Customer Panel sheet, retry ข้อความ, query param prefill, tab ใบเสนอราคา) — ไม่มีข้อไหนบล็อกการเริ่มงานส่วนอื่น (แต่ละจุดมี default ที่เสนอไว้แล้วให้เลือกใช้ชั่วคราวได้) ยกเว้นข้อ 5 (query param) ที่ต้องปิดที่ SRS/API ก่อนแตะ `/orders/new` จริง

**Prerequisite ฝั่ง backend ที่ยังไม่มี (ตาม API.md/DATABASE.md — ไม่ใช่งานของผม แต่ developer ต้องรู้ก่อนหยิบสเปกนี้ไปทำ):** list/disconnect channel endpoint (FR-FBC-11), แท็ก/โน้ต schema (S-8), `ExternalContact.customerId` write path (FR-FBC-08), `isPinned`/`isHidden`/`resolvedAt` service/API (S-7) — คอลัมน์มีแล้วแต่ logic ยังไม่มีทั้งหมด

---

## ภาคผนวก A — ข้อกำหนดเพิ่มจาก user (2026-07-22 บ่าย)

เพิ่มหลัง `safepay-ux` ออกสเปกหลักไปแล้ว — ต้องนำไปรวมก่อน implement

### A-1. แผงขวาต้องสร้างรายการขายได้ และ **เปลี่ยนตามประเภทกิจการ**

> คำสั่ง user: *"right panel ต้องเป็นตามประเภทด้วย — ถ้าเข้าขายของก็ต้องเป็นสร้างออเดอร์ ถ้าห้องพักก็ต้องเป็นเปิดจองได้"*

feature `00017 Lodging Vertical` (merge เข้า main แล้ว) เพิ่ม `Shop.vertical` ซึ่งมี 2 ค่า
(`src/lib/lodging.ts` → `SHOP_VERTICALS`):

| `Shop.vertical` | CTA ในแผงขวา | ปลายทาง |
|---|---|---|
| `GENERAL` (สินค้าและบริการ) | **"สร้างออเดอร์"** | flow สร้างคำสั่งซื้อเดิม |
| `LODGING` (บ้านพักตากอากาศ) | **"เปิดการจอง"** | flow สร้างการจองของ 00017 |

ข้อกำหนด:
- อ่าน `vertical` จาก `Shop` ของเธรดนั้น (`Conversation.shopId`) **ที่ server** แล้วส่งลงมาเป็น prop
  — ห้ามให้ client เดาเองจาก path หรือ session
- tab ที่ 2 ของแผงขวาต้องเปลี่ยนตามด้วย: `GENERAL` → **"ออเดอร์"**, `LODGING` → **"การจอง"**
  (แสดงรายการจองของลูกค้ารายนั้น)
- ค่าที่ไม่รู้จัก → fallback เป็น `GENERAL` (ห้าม crash, ห้ามซ่อน CTA ทั้งอัน)
- ทั้งสอง flow ยังต้องบังคับกรอกเบอร์โทรเพื่อผูก `Customer` เหมือนกัน (BR-FBC-06 ไม่เปลี่ยน)

### A-2. บั๊กการแสดงผลที่พบจาก prod จริง (แก้แล้ว)

- ข้อความแทนไฟล์แนบเขียนตายตัวว่า "ลูกค้าส่งไฟล์แนบ" ทั้งที่ ingest ใช้ path เดียวกันกับ echo
  ของฝั่งร้าน → ขึ้นข้อความผิดฝั่ง แก้เป็น "[ไฟล์แนบ — เปิดดูใน Messenger]" ที่ไม่ระบุผู้ส่ง

### A-3. สิ่งที่ต้องตรวจเพิ่มตอน implement (จากภาพ prod)

- **sticker/thumbs-up** เข้ามาเป็นรูปแล้วแสดงผลถูกต้อง — แต่ขนาดยังเท่ารูปปกติ ควรมีขนาดเล็กลง
  แบบ sticker (ตรวจกับ theme ก่อน อย่าใส่ arbitrary value)
- ข้อความยาวมาก (ข้อความ auto-reply ของร้าน) ดัน bubble เต็มความกว้าง — ต้องมี `max-w`
  ตาม primitive ของ theme ไม่ใช่ปล่อยยาวเต็มบรรทัด

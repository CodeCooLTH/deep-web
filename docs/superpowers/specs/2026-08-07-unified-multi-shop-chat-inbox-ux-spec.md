# UX Design Spec — กล่องแชทรวมหลายร้าน (Unified Multi-Shop Inbox)

- **วันที่:** 2026-08-07
- **ผู้ผลิต:** `safepay-ux` (HR8 mandatory gate)
- **อิง:** `docs/superpowers/specs/2026-08-07-unified-multi-shop-chat-inbox-design.md` (มติ D-1..D-5 ล็อกแล้ว — เอกสารนี้ตอบเฉพาะ "หน้าตา/พื้นที่/flow")
- **สถานะ:** รอ user เคาะ Open questions 3 ข้อ (§12) ก่อนทำ mockup + implement
- **Mode:** Operate (`(paces)/**` = เครื่องมือทำงาน ไม่ใช่ brand surface)

---

## 0. งบพื้นที่ที่ 320px (คำนวณจากโค้ดจริง ไม่ใช่ประมาณ)

| หน้าจอ | Content width @320px | องค์ประกอบเดิมที่กิน fixed width | เหลือ |
|---|---|---|---|
| `ChatHeader.tsx` (มือถือ — `ThemeDropdown`/`TextScaleToggler` ถูกซ่อนด้วย `hidden sm:inline-flex` อยู่แล้ว) | 288px (`px-4`×2) | logo ~32 + sound 44 + shopSwitcher 44 + gaps 28 ≈ **148px** | **~140px ให้ช่องค้นหา** |
| `ChatThread.tsx` header (`.card-header` `flex-nowrap` — เพิ่งแก้ 2026-08-07) | 280px (`px-5`×2) | back 37 + avatar 36 + ปุ่มข้อมูลลูกค้า ~40 + mute 37 + gaps ~40 ≈ **190px** | **~90px ให้ชื่อลูกค้า** |
| `InboxList.tsx` toolbar (กว้างเท่าคอลัมน์ ไม่ใช่ทั้งจอ) | คอลัมน์ (มือถือเต็มจอ / desktop 320–384) | segmented-tabs กินเต็มแถวแยก | แถวถัดไป (`flex-wrap`) ยังว่างพอ |

🛑 **ข้อสรุปที่คุมทั้งสเปก:** หัวแชทเหลือ ~140px ให้ช่องค้นหา — เพิ่มปุ่ม 44px จะเหลือ ~92px (ฝืนแต่ยังไหว); **หัวเธรดเหลือ ~90px ให้ชื่อลูกค้า — เพิ่ม chip 60–80px ที่นั่น = ชื่อลูกค้าเหลือ 0–20px = พังจริง** → สวิตช์โหมดและป้ายร้านต้อง**ไม่แข่งพื้นที่แนวนอน**กับ 2 header นี้

---

## 1. สวิตช์โหมด — อยู่ใน `ChatShopSwitcher` dropdown (ไม่ใช่ปุ่มใหม่ในหัวแชท)

**เหตุผล:** (1) งบพื้นที่ §0 ไม่มีที่ให้ปุ่มใหม่ (2) `hasBusinessMembership` (`ChatShopSwitcher.tsx:64`) เป็นเงื่อนไขเดียวกันเป๊ะกับ "ร้านเดียว = ซ่อนสวิตช์" ผูกกับตัวแปรเดิม ไม่ต้อง query ใหม่ (3) ปุ่ม avatar เป็นจุดรวมเรื่อง context ของบัญชี/ร้านในสายตาผู้ใช้อยู่แล้ว

**ไม่แตะ `switchShop()`/`activeShopId` เลย** — คนละ action คนละ endpoint (D-2)

```
MOBILE 320-767              TABLET 768-1023                DESKTOP ≥1024
┌────────────────────┐     ┌──────────────────────┐      ┌────────────────────────────┐
│[Logo][ค้นหา..][🔊][👤◐]│  │[Logo][ค้นหา....][🔊][🌙][Aa][👤◐]│ │[Logo][ค้นหา........][🔊][🌙][Aa][👤◐]│
└────────────────────┘     └──────────────────────┘      └────────────────────────────┘
                   ↑ badge มุมล่างขวาของ avatar: chevron-down ปกติ → layout-grid เมื่อ UNIFIED
                     (เปลี่ยนไอคอนใน slot เดิม = zero-width-cost)
```

```
┌ dropdown (min-w-72 = 288px, เปิดจากปุ่มเดียวกันทุกจอ) ┐
│ มุมมองกล่องข้อความ                                    │ ← เฉพาะเมื่อ hasBusinessMembership
│ ┌───────────────────────────────────────────┐   │
│ │ [▦ ร้านทั้งหมด] │ [🏬 ร้านนี้]                  │   │ ← segmented (bg-light p-1, active=bg-card shadow-sm)
│ └───────────────────────────────────────────┘   │   Base: InboxList.tsx:812 channel-tabs
│ ───────────────────────────────────────────── │
│ [ป้ายร้าน active — กล่องไฮไลต์เดิม]  🏬 ร้านกาแฟดีดี │ ← ของเดิม ไม่แก้
│ สลับบัญชี                                          │ ← ของเดิม (ChatShopSwitcher.tsx:135)
│  ○ ส่วนตัว (คุณ)   ○ ร้าน B [เจ้าของ]                │
│ ───────────────────────────────────────────── │
│  🏠 กลับหน้าหลัก                                   │
└─────────────────────────────────────────────────┘
```

**พฤติกรรม**
- เลือก "ร้านทั้งหมด" → `PATCH /api/users/me { chatScopeMode: 'UNIFIED' }` optimistic (สลับ segment ทันที) → list/แท็บ refetch **โดยไม่ปิด dropdown และไม่ hard-navigate** (ต่างจาก `switchShop()` ที่ navigate เต็มหน้า)
- PATCH ล้ม → revert segment + `pacesToast.error('เปลี่ยนมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง')` (top-right ตาม HR9 — เป็น action จากปุ่ม ไม่ใช่ chat)
- `aria-label` ปุ่ม trigger เปลี่ยนตามสถานะ: `"สลับร้าน — ขณะนี้ดูข้อความรวมทุกร้าน"` / `"...ร้าน {ชื่อ}"`

⚠️ **ข้อจำกัดที่รู้ตัว:** `ChatHeader` เป็น `hidden lg:flex` เมื่ออยู่หน้าเธรด (`ChatHeader.tsx:83`) → บนมือถือขณะเปิดเธรด สวิตช์เข้าไม่ถึง ต้องกดกลับไปหน้ารายการก่อน (ยอมรับได้ — การเปลี่ยนมุมมองทั้งกล่องเป็นงานที่ทำที่หน้ารายการ)

---

## 2. แถวในรายการแชท — badge ร้านมุมบนซ้าย

`InboxList` มี `BuyerAvatar` (size-10) + `ChannelBadgeOverlay` มุมล่างขวาอยู่แล้ว → เพิ่ม overlay ที่ **มุมบนซ้าย** สำหรับ "ร้าน" คนละความหมาย คนละมุม ไม่ชนกัน ใช้ primitive เดียวกันทุกประการ

```
โหมด SINGLE (ของเดิม — ห้ามเปลี่ยน)      โหมด UNIFIED (ใหม่)
┌──────────────────────────┐          ┌──────────────────────────┐
│ (👤)ⓕ  สมชาย ใจดี   12:04 │          │(🏬)(👤)ⓕ  สมชาย ใจดี  12:04│
│        คุณ: ขอบคุณครับ  ●2 │          │        คุณ: ขอบคุณครับ  ●2 │
└──────────────────────────┘          └──────────────────────────┘
   ↑ ⓕ ChannelBadgeOverlay (มุมล่างขวา)     ↑ 🏬 badge ร้าน (มุมบนซ้าย, size-4, ring-card)
```

- **โหมด SINGLE ไม่เพิ่มอะไรเลย** — render แบบ conditional เท่านั้น
- โลโก้ร้านจริงถ้ามี, fallback = initials (`generateInitials` เหมือน `PageAvatar`/`BuyerAvatar`)
- `title`/`aria-label` = ชื่อร้านเต็มเสมอ (badge เป็นภาพเล็ก ต้องมีข้อความสำรอง)

---

## 3. ปุ่ม "สร้างใหม่" ในหน้ารายการ

**ไม่มีทางเข้าเดิม** — `openDraft` ถูกเรียกจากในเธรดที่เปิดอยู่เท่านั้น นี่คือ element ใหม่จริงจุดเดียวของสเปกนี้ วางที่แถวเครื่องมือของ `InboxList` (แถวเดียวกับปุ่ม "ตัวกรอง" ซึ่งเป็น `flex flex-wrap` มีที่ว่างเสมอ)

```
MOBILE 320px (คอลัมน์เต็มจอ)          DESKTOP RAIL (320–384px)
┌────────────────────────────┐      ┌──────────────────────┐
│ [ทั้งหมด|ⓕ|ⓘ|Ⓓ]  ← เต็มแถว    │      │ [ทั้งหมด|ⓕ|ⓘ|Ⓓ]        │
│ [🔍ตัวกรอง]     [+ สร้างใหม่] │      │ [🔍ตัวกรอง] [+สร้างใหม่]│
└────────────────────────────┘      └──────────────────────┘
```

- `btn btn-sm bg-primary text-white` (ปุ่มทึบสีเดียวในแถว — ผ่าน One Voice)
- label: **SINGLE → `orderVocab.createLabelShort`** (ผันตาม vertical ของร้าน active) · **UNIFIED → "สร้างใหม่"** (คำกลาง เพราะยังไม่รู้ร้าน แต่ละร้าน vertical ต่างกัน)
- เป็น callback prop (`onCreateNew`) ที่ `InboxList` รับเข้ามา **ไม่เรียก `useDraftOrders()` เอง** เพราะ `ChatRail`(desktop) กับ `inbox/page.tsx`(มือถือ) wire คนละบริบท

**กดแล้ว:** SINGLE หรือ UNIFIED-ร้านเดียว → เปิดโมดัลตรง (ไม่มี regression) · UNIFIED หลายร้าน → popover เลือกร้านก่อน (ร้าน active ไฮไลต์อยู่บนสุด)

```
┌ shop picker popover ─────────────┐
│ เลือกร้านที่จะสร้าง{noun}          │
│ ✓ [🏬] ร้านกาแฟดีดี  ร้านที่ใช้งานอยู่ │
│   [🏬] ร้าน B                     │
└──────────────────────────────────┘
```

---

## 4. ตัวกรอง "เพจ" — จัดกลุ่มตามร้าน

เพิ่ม `shopId`/`shopName` เข้า `ChannelFilterOption` (`ChannelBadge.tsx:39-44`) — ไม่กระทบ SINGLE เพราะทุกเพจอยู่ร้านเดียวกัน (มีกลุ่มเดียว = grouping ไม่มีผล)

```
โหมด SINGLE (เดิม)          โหมด UNIFIED (ใหม่)
┌──────────────────┐       ┌──────────────────┐
│ ✓ ทุกเพจ           │       │ ✓ ทุกเพจ           │
│   [ⓕ] เพจ A        │       │ ร้านกาแฟดีดี      │ ← header ไม่ใช่ตัวเลือก
│   [ⓘ] เพจ B        │       │   [ⓕ] เพจ A        │
└──────────────────┘       │ ร้าน B            │
                            │   [ⓘ] เพจ C        │
                            └──────────────────┘
```

- header กลุ่ม = `<div className="px-2 pt-3 pb-1"><span className="text-default-700 text-xs">{shopName}</span></div>` (copy ตรงจาก `ChatShopSwitcher.tsx:138-140`)
- "ทุกเพจ" อยู่บนสุดเสมอ ความหมายขยายเป็น "ทุกเพจของทุกร้านใน scope" เอง
- ช่องค้นหา (โผล่เมื่อ options > 6) ยังกรอง flat ข้ามกลุ่มตามเดิม

---

## 5. แท็บกลุ่ม — ต้องชี้ทาง ไม่ใช่หายเงียบ

```
SINGLE หรือ UNIFIED ที่กรองเหลือร้านเดียว        UNIFIED ที่ครอบหลายร้าน
[ทั้งหมด][ปิดงาน][สแปม] │ [📁 กลุ่ม 3 ▾]     [ทั้งหมด][ปิดงาน][สแปม] │ [📁 เลือกเพจเพื่อดูกลุ่ม]
                                                                    ↑ text-default-500
                                                                      กดแล้วเปิด PageFilterDropdown ให้เลย
```

- ปุ่ม **ยังกดได้เสมอ ไม่ disable** — กดแล้วพาไปเปิดตัวกรองเพจทันที (ลัดไปทำสิ่งที่ต้องทำอยู่ดี) ตรง craft-floor *"Empty states that teach the interface, not 'nothing here.'"*
- เกณฑ์ "เหลือร้านเดียว": ดู `shopId` ของเพจที่เลือก (จาก field ใหม่ §4) — ถ้า `pageFilter === ''` ให้เช็ค `scope.shopIds.length === 1`
- แท็บ ทั้งหมด/ปิดงาน/สแปม **ไม่ถูกกระทบเลย** (ไม่ผูกกับ shop)

---

## 6. หัวเธรด — 2 ชั้น (ห้ามแตะ `.card-header` เดิม)

หัวเธรดเพิ่งถูกลดความสูง 79px→61px และเปลี่ยนเป็น `flex-nowrap` เมื่อ 2026-08-07 การเพิ่มของกลับเข้าแถวเดิมคือการย้อนงานนั้น

**ชั้นที่ 1 — badge ร้านบน avatar** (มุมบนซ้าย มิเรอร์ `ChannelBadgeOverlay` เหมือน §2 เป๊ะ, zero-width-cost)

**ชั้นที่ 2 — แถบบริบทร้าน** แถวใหม่เต็มความกว้างใต้ `.card-header` เฉพาะ UNIFIED (ไฟล์นี้มี pattern "แถบเต็มความกว้างใต้หัวเธรด" อยู่แล้ว 2 ตัว: แบนเนอร์โฆษณา `ChatThread.tsx:1441-1490` + `ThreadStatusBar`)

```
┌──────────────────────────────────────────────────┐
│[←] (🏬)                                            │
│    (👤)ⓕ  สมชาย ใจดี          [ข้อมูลลูกค้า][🔔]     │ ← .card-header เดิม ไม่แก้
├──────────────────────────────────────────────────┤
│ 🏬  กำลังตอบในนามร้าน  ร้านกาแฟดีดี                   │ ← ใหม่ (~32px, bg-primary/5)
├──────────────────────────────────────────────────┤
│ [ThreadStatusBar ถ้ามี] [แบนเนอร์โฆษณา] [OrderProgressBar] │
└──────────────────────────────────────────────────┘
```

- ลำดับ stack: **card-header → แถบร้าน → ThreadStatusBar → แบนเนอร์โฆษณา → OrderProgressBar** — แถบร้านอยู่บนสุดของ stack ที่เหลือ เพราะเป็นข้อมูล "ต้องรู้ก่อนพิมพ์" (สูงกว่า alert สถานะห้องซึ่งเป็นข้อมูล "เฝ้าดู")
- `bg-primary/5 border-b border-default-200 px-4 py-1.5 flex items-center gap-1.5 text-xs text-primary` — สอดคล้องกับ `bg-primary/10` ที่ใช้เป็นสถานะ active-thread ใน `InboxList.tsx:1225` (ความหมายเดียวกัน: "นี่คือ context ปัจจุบัน")
- ที่ 320px: 280 − 32(icon+gap) − 110("กำลังตอบในนามร้าน") ≈ **140px ให้ชื่อร้าน** พอสำหรับชื่อทั่วไป
- **SINGLE ไม่มีแถบนี้เลย** หัวเธรดเหมือนเดิม 100%

---

## 7. โมดัลสร้างรายการ — loading / error / ป้ายร้านล็อก

**7.1 Loading (D-5)** — skeleton ไม่ใช่ spinner กลางจอ (craft-floor: *"Skeleton states for loading, not spinners in the middle of content"*)

```
┌ โมดัล (title bar bg-primary ทึบ — เดิม) ──────────┐
│ (👤) งานใหม่ · สมชาย ใจดี           [–][×]        │
│      Messenger                                   │
├──────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓            (label bar, animate-pulse) │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (input bar)                │
│ ▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓   (2 คอลัมน์)                 │
│ [▓▓▓▓▓▓▓▓▓▓▓▓ ปุ่มบันทึก]                          │
└──────────────────────────────────────────────────┘
```

- Base: `bg-default-300 block animate-pulse rounded` (`SellerCardSkeleton.tsx:26`)
- 🛑 เงื่อนไข render ฟอร์มคือ **`contextLoaded === true`** ไม่ใช่ `catalog.length > 0` — ร้านที่ไม่มีสินค้าจริง ๆ ต้อง render ฟอร์มได้ ต่างจาก "ยังโหลดไม่เสร็จ"

**7.2 Error** — icon `alert-circle` + "โหลดข้อมูลร้านไม่สำเร็จ" / "ลองใหม่อีกครั้ง หรือปิดหน้าต่างแล้วเปิดใหม่" + ปุ่ม **"ลองใหม่" ที่ retry จริง** (ไม่ใช่บอกให้ไปรีเฟรชหน้า — โมดัลลอยอยู่ รีเฟรชทั้งหน้าจะทิ้งร่างอื่นไปด้วย)

**7.3 ป้ายร้านล็อก** — title bar (`DraftOrderProvider.tsx:417-424`) ต่อชื่อร้านท้ายบรรทัดช่องทาง

```
SINGLE (เดิม)                UNIFIED เปิดจากในเธรด (ล็อก)
│(👤) งานใหม่·สมชาย [–][×]│   │(👤) งานใหม่·สมชาย [–][×]│
│    Messenger           │   │    Messenger · 🏬 ร้านกาแฟดีดี│
                                  ↑ ข้อความล้วน ไม่มี chevron/ปุ่มกด
```

---

## 8. การ์ดโพสต์ในแท็บความคิดเห็น

`CommentsClient.tsx:972-987` มี `ChannelBadgeOverlay` มุมล่างขวาอยู่แล้ว → เพิ่ม badge ร้านมุมบนซ้าย **component เดียวกับ §2 ใช้ซ้ำ** · ตัวกรองเพจของแท็บนี้ (`CommentsFilterPanel`) จัดกลุ่มตามร้านเหมือน §4

---

## 9. Theme Source Mapping

| Section | Source | หมายเหตุ adapt |
|---|---|---|
| Segmented mode-switch | `InboxList.tsx:812-846` (channel segmented tabs) | 4 ตัวเลือก → 2 |
| Section label "มุมมองกล่องข้อความ" | `ChatShopSwitcher.tsx:138-140` | copy class เปลี่ยนข้อความ |
| Badge ร้านมุมบนซ้าย | `ChannelBadge.tsx:187-220` `ChannelBadgeOverlay` | มิเรอร์ `-end-0.5 -bottom-0.5` → `-start-0.5 -top-0.5`, `ring-card ring-2 size-4` เดิม |
| Group header ใน dropdown | `ChatShopSwitcher.tsx:138-140` | copy ตรง |
| ปุ่ม "สร้างใหม่" | `InboxList.tsx:1120` (`btn btn-sm`) | เปลี่ยนเป็น `bg-primary text-white` |
| Shop picker popover | `PageFilterDropdown.tsx` ทั้งไฟล์ | เปลี่ยนเนื้อหา เพจ → ร้าน (click-outside/Escape hook เดิม) |
| แถบบริบทร้าน | `ChatThread.tsx:1441-1490` (แบนเนอร์โฆษณา) | `py-2.5`→`py-1.5`, พื้น `bg-primary/5` |
| Skeleton ฟอร์ม | `SellerCardSkeleton.tsx:26` (`Bar`) | ประกอบเป็นรูปฟอร์ม |
| Error+retry | `ChatRail.tsx:164-167` | เพิ่มปุ่ม retry ที่ยิง fetch จริง |
| ป้ายร้านล็อก | `DraftOrderProvider.tsx:417-424` | ต่อ text ไม่ใช่ element ใหม่ |

> **หมายเหตุ Hard Rule 1:** รอบนี้ไม่ต้องเปิด theme raw file ใหม่เลย ทุกอย่าง copy จาก in-app precedent ที่ theme-sourced มาแล้วจาก feature ก่อนหน้า (in-app precedent chain) · `ChannelBadgeOverlay` เองมีคอมเมนต์บันทึกไว้แล้วว่า "ไม่พบ theme match — closest primitive = badge + ring overlay" (`ChannelBadge.tsx:6-11`) การมิเรอร์ไปมุมตรงข้ามจึงไม่ใช่ primitive ใหม่

---

## 10. Content (ภาษาไทย)

| จุด | ข้อความ |
|---|---|
| Section label | มุมมองกล่องข้อความ |
| Segment 1 / 2 | ร้านทั้งหมด (`layout-grid`) / ร้านนี้ (`building-store`) |
| aria trigger UNIFIED | สลับร้าน — ขณะนี้ดูข้อความรวมทุกร้าน |
| aria trigger SINGLE | สลับร้าน — ขณะนี้ดูข้อความร้าน {ชื่อร้าน} |
| Toast ล้มเหลว | เปลี่ยนมุมมองไม่สำเร็จ ลองใหม่อีกครั้ง |
| ปุ่มกลุ่มเมื่อครอบหลายร้าน | เลือกเพจเพื่อดูกลุ่ม |
| แถบบริบทหัวเธรด | กำลังตอบในนามร้าน + {ชื่อร้าน} |
| ปุ่มสร้าง UNIFIED / SINGLE | สร้างใหม่ / `orderVocab.createLabelShort` เดิม |
| หัว shop picker | เลือกร้านที่จะสร้าง{orderVocab.noun} |
| tag ร้าน active | ร้านที่ใช้งานอยู่ |
| Error โมดัล | โหลดข้อมูลร้านไม่สำเร็จ / ลองใหม่อีกครั้ง หรือปิดหน้าต่างแล้วเปิดใหม่ / ลองใหม่ |

---

## 11. Edge states

| กรณี | พฤติกรรม |
|---|---|
| ไม่มี business membership | ไม่เห็น segment เลยทุกจุด — พฤติกรรมเท่าปัจจุบัน 100% |
| ตั้ง UNIFIED แต่มีร้านเดียว | badge/แถบ context **ไม่โผล่** — เช็คจาก `scope.shopIds.length === 1` ไม่ใช่ `mode` ดิบ |
| โมดัลโหลด context ล้ม | error+retry **ไม่ปิดโมดัลอัตโนมัติ** |
| ร้านถูกถอนสิทธิ์ระหว่างโมดัลเปิดค้าง | retry ได้ 403 → เปลี่ยนเป็น "ไม่มีสิทธิ์เข้าถึงร้านนี้แล้ว" + ปุ่มปิด (แทนปุ่มลองใหม่) |
| ชื่อร้านยาว >20 ตัว | `title` เต็ม + truncate ทุกจุดที่เป็นข้อความ |
| ไม่มีโลโก้ร้าน | initials fallback (`generateInitials`) |
| shop picker >6 ร้าน | มีช่องค้นหา (เกณฑ์เดียวกับ `PageFilterDropdown.tsx:114`) |
| มือถือ + อยู่ในเธรด | `ChatHeader` เป็น `hidden lg:flex` → สวิตช์เข้าไม่ถึง ต้องกลับหน้ารายการก่อน |

---

### Impeccable compliance

**Mode: Operate**

- **earned familiarity** — ทุกจุดยืม/มิเรอร์ pattern ที่มีอยู่แล้วในไฟล์เดียวกัน (segmented control, corner badge, section label, error state) แทนประดิษฐ์ affordance ใหม่ ตรง operate.md *"Consistent affordances across the surface. Same button shape. Same icon style."*
- **One Voice (≤10%)** — จุดที่ใช้สีธีม: segment ที่เลือก (`bg-card shadow-sm` = neutral จริง ๆ ไม่ใช่ primary), ปุ่ม "สร้างใหม่" (`bg-primary` 1 ปุ่มต่อแถว), แถบบริบทร้าน (`bg-primary/5` บางมาก) — รวมกันยังเป็นสัดส่วนเล็กมากของจอ
- **Verified-Means-Green** — ไม่มีเขียวที่ใดในสเปกนี้ (ไม่มีสถานะ "สำเร็จ") badge ร้าน/ช่องทางเป็น neutral/brand-color ตาม HR6 carve-out เดิม
- **Sentence case** — ทุก label ใหม่เป็นประโยคปกติ ไม่มี ALL CAPS
- **Ink-Tinted Shadow** — ไม่มี shadow ใหม่ popover ใช้ `shadow-lg` เดิมของ `.dropdown-menu`
- **Anti-slop** — ไม่มี gradient / hero-metric / eyebrow ตัวพิมพ์เล็ก / การ์ดซ้อนการ์ด; badge เป็น overlay ring ไม่ใช่การ์ดใหม่
- **theme ขัด Impeccable:** ไม่มี

---

## 12. ผลตัดสิน (user เคาะ 2026-08-07 — ปิดทั้ง 3 ข้อ)

| # | คำถาม | มติ |
|---|-------|-----|
| Q-1 | ที่ทางของสวิตช์โหมด | **อยู่ใน dropdown ของปุ่ม avatar** ตามที่ ux เสนอ — รับ trade-off ว่าโหมดปัจจุบันไม่ได้เป็นข้อความตลอดเวลา (สัญญาณคือไอคอนบน badge: `chevron-down` → `layout-grid`) เพื่อไม่แลกกับช่องค้นหาที่เหลือ ~140px |
| Q-2 | สี badge ร้านเมื่อไม่มีโลโก้ | **สีเดียวทุกร้าน** — `bg-primary/10 text-primary` + initials เหมือน `PageAvatar` แยกร้านด้วยตัวอักษรย่อ **ห้ามสุ่มสีต่อร้าน** (Paces ไม่มี palette สุ่มสีที่ registered และเสี่ยงหลุด One Voice) |
| Q-3 | แถบบริบทร้านใต้หัวเธรด | **display-only** ไม่กดได้ — กันความคาดหวังผิดว่าเป็นปุ่ม และบนมือถือสวิตช์เข้าไม่ถึงอยู่แล้ว (`ChatHeader` ซ่อนในหน้าเธรด) การทำให้ดูกดได้แต่พาไปที่ที่เข้าไม่ถึงจะแย่กว่า |

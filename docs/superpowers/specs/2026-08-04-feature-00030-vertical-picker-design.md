---
title: "Design Spec — 00030 Booking Business UX Unification"
owner: shinobu22
status: draft
created: 2026-08-04
mockup: "2026-08-04-feature-00030-vertical-picker-mockup.html"
related: ["docs/20 - Features/00030 - Booking Business UX Unification/UX-Copy.md"]
---

> ออกโดย `safepay-ux` (Hard Rule 8 gate) 2026-08-04 · คู่กับ mockup HTML ไฟล์เดียวกันชื่อเดียวกัน
> **คำทุกคำมาจาก `UX-Copy.md` ห้ามคิดใหม่** — ไฟล์นี้ว่าด้วยโครง/ระยะ/state/ที่มาของ component

## Impeccable compliance

**Mode: Operate** ทั้งหมด — onboarding form, order chrome, confirm dialog คือ "ผู้ใช้อยู่ในงาน" ไม่ใช่ persuade surface. เกณฑ์ที่ใช้: earned familiarity ชนะการแสดงออก — ทุก element ต้องอ่านเป็นของเดิมที่ขยายผล ไม่ใช่ของใหม่ที่แปลกออกไป

| กฎ | การปฏิบัติในงานนี้ |
|---|---|
| One Voice | ฝั่งนี้ primary = Counter Blue `#236dc9` ไม่ใช่ม่วง Vuexy. `bg-primary` ปรากฏเฉพาะปุ่ม action หลัก + การ์ดที่เลือกอยู่ (`border-primary bg-primary/5`) ไม่ใช้ตกแต่ง |
| Verified-Means-Green | ไม่มีสีเขียวในงานนี้เลย — badge ข้อเท็จจริงเดิมใช้สีกลาง `bg-default-100` ถูกอยู่แล้ว และถูกถอดออก (เนื้อหาย้ายไปเป็น description) |
| Dashed Card-Header | ยืม signature เส้นประมาคั่นขั้น 1/ขั้น 2 **ภายในการ์ดเดียว** แทนการสร้างการ์ดซ้อนการ์ด |
| Flat-At-Rest | การ์ดตัวเลือกไม่มีเงาตอนพัก เปลี่ยนแค่ `border-color` ตอนเลือก (state ไม่ใช่ตกแต่งถาวร) |
| Sentence case | copy ไทยทั้งหมดเป็น sentence case อยู่แล้ว ไม่มีจุดขัด |
| ไม่มี choreography | ฝั่ง product โหลดเข้างานทันที — ขั้น 2 เป็น conditional render ตามคลิก ไม่ใช่ page-load animation |
| anti-slop | ไม่มี hero-metric · ไม่มี gradient · ไม่มี eyebrow ตัวพิมพ์จิ๋ว · ไม่มีการ์ดในการ์ด · ฟอร์ม centered `max-w-2xl` ไม่มีคอลัมน์ว่างข้าง |

---

## A · หน้าเลือกประเภทร้าน 2 ขั้น

### การตัดสินใจหลัก

1. **Component เดียว** `VerticalTaxonomyPicker` (`src/components/safepay/`) แบบ controlled — `value` / `onChange` / `columns: 1|2`. ฝั่ง onboarding ใช้ `useState` ตรง ๆ ฝั่ง `CreateBusinessForm` ห่อด้วย `<Controller name="vertical">`. **`columns` คือสิ่งเดียวที่ต่างกันระหว่าง 2 บริบท** ไม่ fork logic
2. **ขั้น 2 ต่อท้ายในการ์ดเดิม** คั่นด้วย `border-t border-dashed border-default-300 mt-4 pt-4` — การ์ดขั้น 1 ทั้ง 2 ใบยังอยู่เสมอ กดสลับกลับได้ตลอด
3. **ย้อนกลับ** กด "ขายของออนไลน์" เมื่อไหร่ก็ได้ → `ONLINE_SALES` ทันที + ซ่อนขั้น 2 แต่ **ไม่ล้างตัวเลือกย่อยที่เคยเลือก** (กดกลับมาเห็น highlight เดิม ลด friction ตอนกดพลาด)
4. **ปุ่มถัดไป** — enabled ทันทีตอนเปิดเข้ามา (default `ONLINE_SALES` ตาม BR-SBT-07 ที่ไม่เปลี่ยน) · กด "รับนัดหมายและจอง" → **disabled** จนกว่าจะเลือกขั้น 2
5. **ถอด badge "มีจัดส่งสินค้า/ไม่มีจัดส่งสินค้า"** — คำอธิบายใต้ป้ายครอบข้อมูลนี้ไปแล้ว
6. **ย้ายบรรทัดเตือน "เปลี่ยนภายหลังไม่ได้" ขึ้นมาก่อนการ์ด** ทั้ง 2 ทางเข้า ใช้ประโยคเดียวกัน (ของเดิมฝั่ง Business อยู่ **ใต้** การ์ด = เตือนหลังตัดสินใจไปแล้ว และเป็นคนละประโยคกับฝั่ง Personal)
7. **ไอคอนต่อการ์ด** (user เคาะ 2026-08-04 ให้มี) — `truck-delivery` / `calendar-event` / `calendar-check` / `bed` ในกรอบ `size-8 rounded-lg bg-primary/15 text-primary`

### ขนาดจอ

| จอ | พฤติกรรม |
|---|---|
| Mobile 375 | onboarding shell `max-w-md`, `grid-cols-1`, การ์ดเรียงลง |
| Tablet 768 | **เหมือน mobile ทุกประการ** — shell `max-w-md` ล็อกไว้ ไม่ผูกกับ viewport (ตั้งใจ ไม่ต้องออกแบบ layout ใหม่) |
| Desktop 1280 | Business creation `columns=2` → `grid-cols-1 sm:grid-cols-2` ทั้ง 2 ขั้น, อยู่ใน `lg:col-span-2` ของฟอร์มเดิม, การ์ด `max-w-2xl` centered |

---

## B · คำผันตามประเภทร้าน

ไม่ใช่งาน layout ใหม่ — เป็นการพิสูจน์ว่าคำที่ยาวขึ้นไม่พังของเดิม

| จุด | สถานะ | เกณฑ์ผ่าน |
|---|---|---|
| **เมนูซ้าย 245px** | ปลอดภัยอยู่แล้ว — ผูก SSOT ไปตั้งแต่ 2026-08-04 และ `_sidenav.css` มี `truncate` | verify ว่าไม่ regress |
| **ปุ่มบนหัวหน้า** | ปุ่ม auto-width ไม่มี fixed width · ช่องค้นหาเป็น `flex-1` ดูดซับความกว้างที่ปุ่มกินเพิ่ม (`shrink-0` อยู่ที่ปุ่ม ไม่ใช่ search) | ที่ **1024px** แถวไม่ wrap และช่องค้นหาเหลือ ≥120px |
| **แท็บล่าง 320px** | 🛑 **จุดเสี่ยงจริง** — ใช้ `nounShort` "เข้ารับบริการ" ยังตกเป็น 2 บรรทัดในเซลล์ ~64px | เติม `leading-tight`: icon 24 + gap 4 + 2 บรรทัด ~30 = **58px ≤ 64px**. ถ้าดูแน่นเกินให้ลด `gap-1`→`gap-0.5` **ห้ามลดขนาดฟอนต์เฉพาะช่องนี้** (จะไม่ consistent กับอีก 4 ช่อง) |
| **FAB speed-dial pill** | `inline-flex` auto-width ลอยอิสระ ไม่ชนอะไร | verify ไม่ล้นขอบจอที่ 320px |

**LODGING subtitle** — วางเป็นบรรทัดเดียวใต้ breadcrumb (`text-default-400 text-xs mt-0.5`) ไม่ใช่กล่องใหม่ · ที่ `/bookings` ใส่บรรทัดคู่ตรงข้ามด้วยตำแหน่งเดียวกัน เพื่อให้อ่านแล้วแยกออกจากอีกฝั่ง

---

## C · กล่องยืนยันยกเลิก

หน้าตาเดิมใช้ได้ทั้งหมด — `pacesConfirm.danger` เป็น text-based Sweet Alert ที่คำนวณความสูงเอง การลดจาก 3 ท่อนเหลือ 2 ไม่กระทบ markup ใด ๆ

🛑 **เงื่อนไขคือ `stockDeducted` ไม่ใช่ vertical** — `CancelOrderButton` (client) ต้องรับ prop ใหม่ 2 ตัว: `hasDeductedStock: boolean` (คำนวณที่ RSC จาก `order.items.some(i => i.stockDeducted != null)`) และชุดคำจาก vertical. ร้านขายออนไลน์ที่ไม่มี Add-on ต้องได้ข้อความสั้นเหมือนกัน — เดาจาก vertical อย่างเดียวจะผิด

`items` ว่าง → `hasDeductedStock` default `false` (ได้ข้อความสั้น = safe fallback)

---

## Theme Source Mapping

| ส่วน | Element | ที่มา (เปิดอ่านแล้ว) | หมายเหตุ |
|---|---|---|---|
| A | การ์ดตัวเลือก | `business/create/components/CreateBusinessForm.tsx:145-176` | ลด 3→2 ใบต่อขั้น · ตัด badge · เพิ่มไอคอน · เพิ่มเส้นประคั่น |
| A | icon circle / step dots / shell | `seller/onboarding/page.tsx:213-238` (Base เดิม: `theme/paces/Admin/TS/src/app/(admin)/pages/contact-us/page.tsx`) | ไม่แตะ |
| A | card wrapper (Business) | `CreateBusinessForm.tsx:99-102` (`.card`/`.card-header`/`.card-body`) | เนื้อในเปลี่ยนเป็น `<VerticalTaxonomyPicker columns={2}/>` |
| A | เส้นประคั่นขั้น | `.card-header` ของ Paces (`border-b border-dashed border-default-300`) | ยืม**สไตล์** มาใช้เป็น section divider ไม่ใช่ยืม component |
| B | metadata title | `orders/page.tsx:28` | ต้องเป็น `generateMetadata` เพื่อ query shop ก่อน |
| B | breadcrumb | `orders/page.tsx:227-229` + `src/components/PageBreadcrumb.tsx` | prop `title` เป็น dynamic |
| B | ปุ่มสร้าง | `orders/components/OrdersList.tsx:436-442` + `OrdersTable.tsx:452,456` | ข้อความ = `createLabel` |
| B | LODGING subtitle | pattern จาก `ADDRESS_SUBTITLE` ใน `onboarding/page.tsx:41-45` | บรรทัดเดียว `text-default-400 text-xs` |
| B | แท็บล่าง | `_shared/SellerBottomNav.tsx:60-61,73-76,235` (มี prop `orderLabel` อยู่แล้ว) | เปลี่ยนค่าที่ layout ส่งเป็น `nounShort` + เติม `leading-tight` |
| C | dialog | `src/lib/paces-swal.ts` + `orders/[token]/components/CancelOrderButton.tsx:31-35` | เปลี่ยนแค่ argument + เพิ่ม 2 props |

---

## คลาส Paces ที่ใช้ (primitive ทั้งหมด — Hard Rule 7, ไม่มี arbitrary value)

| Element | คลาส |
|---|---|
| การ์ดตัวเลือก (ปกติ) | `flex cursor-pointer items-start gap-2 rounded-lg border-2 border-default-200 p-3` |
| การ์ดตัวเลือก (เลือกอยู่) | `border-primary bg-primary/5` |
| กรอบไอคอนในการ์ด | `size-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center` |
| ป้ายการ์ด | `text-dark text-sm font-medium` |
| คำอธิบายการ์ด | `text-default-400 mt-0.5 text-xs` |
| เส้นประคั่นขั้น | `border-t border-dashed border-default-300 mt-4 pt-4` |
| หัวข้อขั้น 2 | `text-sm font-semibold text-default-900 mb-2` |
| grid (onboarding / business) | `grid grid-cols-1 gap-2` / `grid grid-cols-1 gap-2 sm:grid-cols-2` |
| ปุ่มถัดไป | `btn bg-primary text-white hover:bg-primary-hover w-full disabled:opacity-50` |
| ปุ่มสร้าง (หัวหน้า orders) | `btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1` |
| แท็บล่าง label | `text-xs font-medium leading-tight` |
| LODGING subtitle | `text-default-400 text-xs mt-0.5` |

---

## Edge states

- **โหลดครั้งแรก** — `ONLINE_SALES` เลือกไว้แล้ว ปุ่มกดได้ทันที (ไม่ใช่ empty state, ตรงกับพฤติกรรมเดิม)
- **สลับไปมาหลายรอบ** — เลือก "รับนัดหมายและจอง" → "มาพักค้างคืน" → กลับ "ขายของออนไลน์" → กลับมาอีกครั้ง → **ต้องเห็น "มาพักค้างคืน" ยัง highlight**
- **ระหว่าง submit (`vLoading`)** — ปุ่มขึ้น "กำลังบันทึก..." · การ์ดยัง interactive (คงพฤติกรรมเดิม ของเดิมไม่เคย disable)
- **skeleton `orders/loading.tsx`** — ยังไม่รู้ vertical → fallback ชุด `ONLINE_SALES` ไม่บล็อกการ render
- **แท็บล่าง 2 บรรทัด** — ต้องกดดูจริงที่ 320px ว่าไม่ดันแถบสูงเกิน `h-16` และไม่ตัดคำกลางพยางค์ (ไทยพึ่ง browser default ไม่มี hyphenation control)

---

## ข้อค้างที่ปิดไปแล้วระหว่างทำสเปกนี้

- ~~LODGING เข้า `/orders/new` ได้ไหม~~ — **เข้าได้จริง** (`(fullscreen)/orders/new/page.tsx:81` เงื่อนไข `ONLINE_SALES` คุมแค่โหมดสร้างพัสดุ iShip ไม่ได้บล็อกการเข้าหน้า) → `createLabel` "เปิดบิลเข้าพัก" มีที่ใช้จริง
- ~~ไอคอนต่อการ์ด~~ — user เคาะแล้วให้มี ใช้ชุดที่เสนอ

## ยังต้องยืนยันตอน implement

- `OrdersList.tsx:441` กับ `OrdersTable.tsx:452,456` แสดงปุ่มเดียวกันคนละที่ — ต้อง re-verify ว่า active พร้อมกันที่ breakpoint ไหน (`OrdersList` มีคอมเมนต์ว่า mobile แต่ปุ่มมี `lg:inline-flex` ซึ่งขัดกัน) **อ่านโค้ดจริง ไม่เชื่อคอมเมนต์**

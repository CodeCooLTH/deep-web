# Redesign: หน้าสร้างสินค้า — non-tech friendly

> **Target route:** `src/app/(paces)/seller/(fullscreen)/products/new/page.tsx`
> **Theme base:** `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/` (4 components — เป็นโครง) + form primitives จาก `form/elements`, `form/wizard`, `form/fileuploads`
> **DB:** ไม่ต้อง migrate — ใช้ `Product { name, description, price, images, type, isActive }` เดิมทั้งหมด

---

## เป้าหมายและกรอบ

ผู้ใช้หลักคือป้าๆ ลุงๆ แม่บ้าน เจ้าของร้านชายทะเลที่ขายของจริงในตลาด แต่ต้องการเปิดร้านออนไลน์ — 80%+ เปิดผ่านมือถือจอเล็ก (≤ 360px) ปัญหาคือฟอร์มปัจจุบันมี 3 columns เต็มจอเดสก์ท็อป ทำให้บนมือถือ "หาที่จะกดยาก" และ textarea คำอธิบายกินพื้นที่ดูน่ากลัว

**Success metric:** ป้าที่เปิดมือถือครั้งแรกควรกดสร้างสินค้าได้สำเร็จภายใน **60 วินาที** โดยไม่ต้องอ่านคำแนะนำ — กรอกแค่ชื่อ + รูป + ราคา พอ

**สโคป:** 5 essential fields เท่านั้น (name, images, price, type, description-optional) ห้ามเพิ่ม field ที่ต้อง migrate DB

---

## ทางเลือกที่พิจารณา

### Option A: Single page + progressive cards (one-column on mobile)
- โครง: scroll หน้าเดียว, การ์ดเรียงลงล่าง — รูป → ชื่อ → ราคา → ประเภท → (รายละเอียดเพิ่มเติม collapsed)
- ข้อดี: ไม่มี state จำว่าอยู่ขั้นไหน, ผู้ใช้เห็นทุก field ได้ทันที, scroll คือ pattern ที่ป้าๆ คุ้นจาก Facebook/Line
- ข้อเสีย: ถ้า field เยอะอาจดูล้น (แต่เรามี 5 field ชัดเจน → ไม่เป็นปัญหา)

### Option B: 3-step Wizard (Paces stepper)
- โครง: Step 1 รูป + ชื่อ → Step 2 ราคา + ประเภท → Step 3 ตรวจสอบ/บันทึก
- ข้อดี: focus ทีละขั้น, มี progress bar ดูอุ่นใจ
- ข้อเสีย: เพิ่ม cognitive load (ต้องรู้ว่ามีกี่ขั้น), ต้องกด Next 2 ครั้งก่อนบันทึก, JS state machine ใน Preline `data-hs-stepper` ซับซ้อนกว่า, แก้ field เก่าต้องกด Back ลำบากบนมือถือ

### Option C: Accordion (expand/collapse sections)
- โครง: 3 ส่วนพับได้ — รูปสินค้า / ข้อมูลพื้นฐาน / รายละเอียดเพิ่มเติม
- ข้อดี: ประหยัดที่
- ข้อเสีย: ป้าๆ มักไม่กด accordion (สับสนว่ากดอะไร), เสี่ยงพลาด field สำคัญที่อยู่ในส่วนพับ

### **Recommended: Option A — Single page + progressive cards**

เหตุผล:
1. ฟอร์มมีแค่ 5 field — ไม่จำเป็นต้องแบ่ง wizard
2. Pattern "scroll ลงล่าง กรอกไปเรื่อยๆ กดบันทึก" เป็นสิ่งที่ป้าๆ คุ้นจาก Facebook Marketplace, Line MyShop
3. Mobile-first: หนึ่งคอลัมน์เต็มจอ, การ์ดแยกชัด, tap target ใหญ่
4. กลไก progressive disclosure แค่ 1 จุด (รายละเอียดเพิ่มเติม collapsed) — พอแล้ว
5. Implement ง่ายที่สุด, ไม่มี stepper state — เร็ว, type-safe, debug ง่าย

---

## Wireframe

### Mobile (360px — primary target)

```
┌──────────────────────────────────────┐
│ [×] เพิ่มสินค้าใหม่      [บันทึก]   │ ← FullscreenPageHeader (sticky top)
│     กรอกข้อมูลแล้วกดบันทึก          │   tap target 44px+, ปุ่มใหญ่
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 1. ใส่รูปสินค้า                │  │ ← Card #1 (Hero — รูปก่อน)
│  │ ─────────────────────────────  │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │   📷                     │  │  │
│  │  │                          │  │  │   Big dropzone
│  │  │  แตะที่นี่เพื่อใส่รูป   │  │  │   tap-to-pick
│  │  │  หรือลากรูปมาวางได้      │  │  │
│  │  │                          │  │  │
│  │  │   [ + เลือกรูป ]         │  │  │   ปุ่มใหญ่ 48px
│  │  └──────────────────────────┘  │  │
│  │  ใส่ได้สูงสุด 10 รูป           │  │
│  │  รูปแรกจะเป็นรูปหลักของสินค้า  │  │
│  │                                │  │
│  │  [grid 3-col preview ถ้ามีรูป] │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 2. ชื่อสินค้า                  │  │ ← Card #2
│  │ ─────────────────────────────  │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ เช่น กระเป๋าผ้าสะพายข้าง│  │  │   placeholder ตัวอย่างจริง
│  │  └──────────────────────────┘  │  │   (h-12 / text-base)
│  │  💡 ใส่ชื่อแบบที่ลูกค้าจะค้นหา │  │   ← micro-hint
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 3. ราคา (บาท)                  │  │ ← Card #3
│  │ ─────────────────────────────  │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ ฿  [_______]             │  │  │   number input ใหญ่ 56px
│  │  └──────────────────────────┘  │  │   prefix ฿ (input-group)
│  │  ราคายอดนิยม:                  │  │
│  │  [฿49] [฿99] [฿199] [฿299]    │  │ ← Quick-pick chips (toggle)
│  │  [฿499] [฿999]                 │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 4. เป็นสินค้าแบบไหน            │  │ ← Card #4 — Type cards
│  │ ─────────────────────────────  │  │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  │  │
│  │  │  📦  │  │  💻  │  │  🛠️  │  │  │   3 visual radio cards
│  │  │ ของ  │  │ดิจิทัล│  │บริการ│  │  │   tap target 96x96
│  │  │ จริง │  │      │  │      │  │  │   selected = ring + bg
│  │  │  ●   │  │      │  │      │  │  │   ตั้ง default = ของจริง
│  │  └──────┘  └──────┘  └──────┘  │  │
│  │  ส่งของจริงให้ลูกค้า            │  │   ← micro-help ที่เปลี่ยน
│  └────────────────────────────────┘  │     ตามที่เลือก
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 5. รายละเอียดเพิ่มเติม         │  │ ← Card #5 — collapsed by default
│  │    (ไม่บังคับ)        [ ▼ ]    │  │   ปุ่มขยาย/ย่อ
│  │ ─────────────────────────────  │  │
│  │  [collapsed — คลิกเพื่อขยาย]   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ [    💾 บันทึกสินค้า    ]     │  │ ← Sticky bottom CTA
│  │ [   + บันทึกแล้วเพิ่มอีกชิ้น ]│  │   (เพิ่มเติมจาก header)
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Desktop (≥ lg, 1024px+)

```
┌────────────────────────────────────────────────────────────────────┐
│ [×] เพิ่มสินค้าใหม่   [+ บันทึก & เพิ่มอีก]  [💾 บันทึก]          │ sticky
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────────────────────┐  ┌──────────────────────────┐   │
│  │ 1. รูปสินค้า                │  │ 3. ราคา (บาท)             │   │
│  │  [Big dropzone]             │  │  [฿ ____]                 │   │
│  │  [grid 3-col previews]      │  │  [chip] [chip] [chip]     │   │
│  └─────────────────────────────┘  └──────────────────────────┘   │
│                                                                    │
│  ┌─────────────────────────────┐  ┌──────────────────────────┐   │
│  │ 2. ชื่อสินค้า                │  │ 4. เป็นสินค้าแบบไหน        │   │
│  │  [input]                    │  │  [📦] [💻] [🛠️]            │   │
│  └─────────────────────────────┘  └──────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ 5. รายละเอียดเพิ่มเติม (ไม่บังคับ)              [ ▼ ]      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

Desktop ใช้ `lg:grid-cols-2` — รูป + ชื่อ ซ้าย / ราคา + ประเภท ขวา (สลับจาก template ปัจจุบันที่ใช้ 3-col grid). คงโครงเดียวกับ mobile แค่จับคู่ 2-col แทน 1-col

---

## Component breakdown

| # | Component | Theme source (Base:) | หน้าที่ | Non-tech friendly note |
|---|---|---|---|---|
| 1 | `FullscreenPageHeader` (มีอยู่) | `src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx` (existing) | sticky top: title + ยกเลิก + บันทึก | เพิ่ม `subtitle="กรอกข้อมูลแล้วกดบันทึก"` ตามที่มีอยู่ + ปุ่ม "+ บันทึก & เพิ่มอีก" สำหรับ desktop |
| 2 | `ProductImageHero` (Card #1) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductImage.tsx` + `theme/paces/Admin/TS/src/app/(admin)/form/fileuploads/components/Dropzone.tsx` + `theme/paces/Admin/TS/src/components/FileUploader.tsx` | Drop/click upload + preview grid | ขยาย dropzone ให้ใหญ่ขึ้น (`min-h-50` แทน `min-h-37.5`), เปลี่ยน icon เป็น camera ใหญ่, copy ภาษาคน "แตะที่นี่เพื่อใส่รูป" — ใช้ `ProductImages.tsx` ที่มีอยู่เป็น base ปรับ copy |
| 3 | `ProductNameField` (Card #2) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx` (เฉพาะส่วน name input) | input ชื่อ + micro-hint | label ใหญ่ (`form-label` + `text-base`), input `h-12`, placeholder ตัวอย่างจริง |
| 4 | `ProductPriceField` (Card #3) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/Pricing.tsx` (input-icon-group pattern) + `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputGroup.tsx` (input-group pattern) | ราคา + ฿ prefix + chips | quick-pick chips ใช้ `peer` checkbox toggle pattern จาก `ChecksRadioSwitches.tsx` (Checkbox Toggle section, line 322-348) |
| 5 | `ProductTypePickerCards` (Card #4) | `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx` (Radio Toggle / `peer hidden` + label.btn pattern, line 355-381) | 3 visual cards | แทน `Select` dropdown ปัจจุบันด้วย radio cards ใหญ่ พร้อม emoji + label ภาษาคน |
| 6 | `ProductDescriptionField` (Card #5, collapsed) | `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-add/components/ProductInformation.tsx` (ส่วน description) + Preline collapse `data-hs-collapse` | textarea, optional, collapsed default | ห้ามใช้ Quill editor (เกินความจำเป็น + ดูน่ากลัว) — textarea ธรรมดาพอ |
| 7 | `EmptyShopCard` (มีอยู่) | (ไม่มีใน Paces theme — ใช้ `card` primitive) | กรณีไม่มีร้าน | คงไว้ตามเดิม แต่ปรับ copy "เปิดร้านก่อนนะคะ ถึงจะเพิ่มสินค้าได้" |

**Server vs. Client boundary** (Hard Rule #2):
- `page.tsx` = Server Component (auth check, shop check, redirect) — render Client wrapper
- `ProductForm` = `'use client'` (มีอยู่แล้ว — `react-hook-form` + `useForm`)
- ไม่มี `component={Link}` issue เพราะ form อยู่ใน client บอก scope ชัด

---

## Copy deck

| Element | Thai copy | English fallback (commit msg) |
|---|---|---|
| Page title | `เพิ่มสินค้าใหม่` | Add new product |
| Page subtitle | `กรอกข้อมูลแล้วกดบันทึกได้เลย ไม่ต้องครบทุกช่อง` | Fill in details and tap save |
| Card 1 title | `1. ใส่รูปสินค้า` | Product images |
| Card 1 dropzone main | `แตะที่นี่เพื่อใส่รูป` | Tap to add photo |
| Card 1 dropzone sub | `หรือลากรูปจากเครื่องมาวางก็ได้` | Or drag photos here |
| Card 1 button | `+ เลือกรูป` | + Choose photos |
| Card 1 helper | `ใส่ได้มากที่สุด 10 รูป — รูปแรกจะเป็นรูปหลักของสินค้า` | Up to 10 photos. First will be the main image |
| Card 1 counter | `ใส่ไปแล้ว {n} จาก 10 รูป` | {n} of 10 photos |
| Card 1 error oversize | `รูปใหญ่เกินไป ลองใส่รูปที่เล็กกว่านี้นะคะ (ไม่เกิน 10 MB)` | Image too large (max 10 MB) |
| Card 1 error fail | `ใส่รูปไม่สำเร็จ ลองใหม่อีกครั้งได้เลยค่ะ` | Upload failed. Please try again |
| Card 2 title | `2. ชื่อสินค้า` | Product name |
| Card 2 placeholder | `เช่น กระเป๋าผ้าสะพายข้าง สีเทา` | e.g. Grey canvas tote bag |
| Card 2 hint | `ใส่ชื่อแบบที่ลูกค้าจะค้นหาได้ง่าย` | Use words customers would search |
| Card 2 error required | `ใส่ชื่อสินค้าก่อนนะคะ` | Please enter the product name |
| Card 2 error length | `ชื่อสั้นไป ใส่อย่างน้อย 2 ตัวอักษร` | Name is too short (at least 2 chars) |
| Card 3 title | `3. ราคา (บาท)` | Price (THB) |
| Card 3 placeholder | `0.00` | 0.00 |
| Card 3 chips label | `กดเลือกราคาเร็วๆ ได้` | Quick price |
| Card 3 chips | `฿49` `฿99` `฿199` `฿299` `฿499` `฿999` | (same) |
| Card 3 error required | `ใส่ราคาก่อนนะคะ` | Please enter a price |
| Card 3 error positive | `ราคาต้องมากกว่า 0 บาท` | Price must be more than 0 |
| Card 4 title | `4. เป็นสินค้าแบบไหน` | What kind of product |
| Card 4 PHYSICAL emoji + label | `📦 ของจริง` | Physical |
| Card 4 PHYSICAL desc (when selected) | `สินค้าที่ส่งของจริงให้ลูกค้า` | Goods you ship to the buyer |
| Card 4 DIGITAL emoji + label | `💻 ดิจิทัล` | Digital |
| Card 4 DIGITAL desc | `ส่งเป็นไฟล์ ลิงก์ หรือโค้ด` | Files, links, or codes |
| Card 4 SERVICE emoji + label | `🛠️ บริการ` | Service |
| Card 4 SERVICE desc | `ทำงานบริการให้ลูกค้า เช่น ตัดผม นวด ซ่อม` | Hands-on service like haircuts |
| Card 5 title | `5. รายละเอียดเพิ่มเติม (ไม่บังคับ)` | More details (optional) |
| Card 5 placeholder | `เล่ารายละเอียดสินค้า เช่น ขนาด สี วัสดุ วิธีใช้` | Tell more — size, color, material, how to use |
| Card 5 toggle expand | `+ เพิ่มรายละเอียด` | + Add more details |
| Card 5 toggle collapse | `− ซ่อน` | − Hide |
| Save button | `บันทึกสินค้า` | Save product |
| Save+New button | `+ บันทึกแล้วเพิ่มอีกชิ้น` | + Save and add another |
| Cancel button | `ยกเลิก` | Cancel |
| Toast success | `บันทึกแล้ว 🎉` | Saved |
| Toast success+new | `บันทึกแล้ว เพิ่มชิ้นต่อไปได้เลยค่ะ` | Saved. Add the next one |
| Toast error generic | `บันทึกไม่สำเร็จ ลองใหม่อีกครั้งนะคะ` | Save failed. Please try again |
| Toast offline | `เน็ตหลุดอยู่ค่ะ ตรวจอินเทอร์เน็ตแล้วลองใหม่` | No internet. Check connection and retry |
| Empty-shop title | `ยังไม่มีร้านค้า` | No shop yet |
| Empty-shop body | `เปิดร้านก่อนนะคะ ถึงจะเพิ่มสินค้าได้` | Open a shop first to add products |
| Empty-shop CTA | `เปิดร้าน` | Open shop |
| Auto-save toast | `บันทึกฉบับร่างแล้ว` (subtle, แค่ 1 ครั้งตอนแรก) | Draft saved |

---

## Interaction flow

### Happy path (ป้าทำได้ใน 60 วิ)
1. ป้าเปิดหน้า `/products/new` → header sticky บอก "เพิ่มสินค้าใหม่"
2. **Card 1 (รูป)** เด่นสุดบนสุด → ป้าแตะ → เลือกรูปจาก gallery มือถือ → preview ขึ้น
3. **Card 2** ป้าใส่ชื่อ "ขนมเปี๊ยะไส้ทุเรียน" — placeholder ช่วยเป็นตัวอย่างจริง
4. **Card 3** ป้าแตะ chip `฿99` (หรือพิมพ์ราคาเอง) → input update auto
5. **Card 4** default `📦 ของจริง` ติดไว้แล้ว → ป้าไม่ต้องทำอะไร
6. ป้าเลื่อนลงเจอ Card 5 (collapsed "+ เพิ่มรายละเอียด") → ข้ามได้
7. ป้ากด **บันทึกสินค้า** ที่ header (sticky) หรือปุ่มล่างจอ → toast `บันทึกแล้ว 🎉` → redirect `/products`

### Power path (เพิ่มหลายชิ้นต่อกัน)
- ป้ากด `+ บันทึกแล้วเพิ่มอีกชิ้น` → save → reset form แต่จำ `type` กับ `price` ล่าสุดไว้ (likely repeat values) → focus ที่ Card 1 ใส่รูปได้ทันที
- Toast `บันทึกแล้ว เพิ่มชิ้นต่อไปได้เลยค่ะ`

### Type switch
- เมื่อกด `💻 ดิจิทัล` → micro-help ใต้การ์ดเปลี่ยนเป็น "ส่งเป็นไฟล์ ลิงก์ หรือโค้ด"
- ห้ามมีผลกับ field อื่น (description ยังคง optional ทุก type)

### Quick-pick chips
- กด chip = set `price` field + chip มี state `selected` (`peer-checked` ring)
- พิมพ์ราคาเองในช่อง = clear chip selection
- ค่าเริ่มต้น: ไม่มี chip selected, input ว่าง

### Auto-save draft (เสนอ — propose)
- Debounce 500ms หลังกรอกอะไรก็ตาม → save ลง `localStorage` key `safepay:product-draft`
- เปิดหน้าใหม่ → ถ้ามี draft → ขึ้น banner: `มีฉบับร่างที่ค้างอยู่ — [ใช้ต่อ] [เริ่มใหม่]`
- ลบ draft เมื่อ submit สำเร็จ
- เก็บแค่ name/description/price/type — **ไม่เก็บ images** (fileIds มี TTL ฝั่ง server, draft อาจอ้าง file ที่ลบไปแล้ว)

---

## Edge cases & error states

| Case | Behavior |
|---|---|
| ยังไม่มี shop | Render `EmptyShopCard` (มีอยู่แล้ว) — ปรับ copy เป็น "เปิดร้านก่อนนะคะ" |
| Offline ตอน save | toast `เน็ตหลุดอยู่ค่ะ ตรวจอินเทอร์เน็ตแล้วลองใหม่` + ไม่ลบ draft |
| Offline ตอน upload รูป | toast `ใส่รูปไม่สำเร็จ ลองใหม่อีกครั้งได้เลยค่ะ` + ลบ uploading skeleton |
| รูปเกิน 10 MB | toast `รูปใหญ่เกินไป ลองใส่รูปที่เล็กกว่านี้นะคะ (ไม่เกิน 10 MB)` |
| รูปเกิน 10 รูป | toast `ใส่ได้มากที่สุด 10 รูปค่ะ` + dropzone แสดง `disabled` state |
| File ไม่ใช่รูป | toast `รับเฉพาะรูปภาพนะคะ (.jpg, .png, .webp)` |
| Submit โดยไม่ใส่ชื่อ | inline error ใต้ field `ใส่ชื่อสินค้าก่อนนะคะ` + scroll-to-field + focus |
| Submit โดยไม่ใส่ราคา | inline error `ใส่ราคาก่อนนะคะ` + scroll + focus |
| Submit โดยไม่ใส่รูปเลย | **อนุญาต** (PRD ไม่บังคับ images) — แต่แสดง warning toast `ใส่รูปจะขายดีกว่านะคะ — ยังไงต่อ?` พร้อมปุ่ม `บันทึกเลย` / `กลับไปใส่รูป` |
| API 5xx | toast `ระบบขัดข้อง ลองใหม่อีกครั้งได้เลยนะคะ` |
| Validation server-side fail | แสดง error message ที่ API ส่งมา (ปัจจุบัน Valibot ส่งมาเป็น string แล้ว) |
| ปิด tab กลางคัน | ถ้า dirty form → `beforeunload` event prompt + auto-save draft กัน lost (โดย default localStorage save แล้ว) |
| Loading state ตอน submit | ปุ่ม "บันทึก" → spinner + disabled, prevent double-click |

---

## Implementation notes (สำหรับ Dev team)

### โครงไฟล์
- คงไฟล์เดิม `src/app/(paces)/seller/(fullscreen)/products/new/page.tsx` (server component) — ไม่แตะ
- Refactor `src/app/(paces)/seller/(dashboard)/products/components/ProductForm.tsx` ตาม design นี้ (หรือสร้าง v2 ถ้าอยากเก็บของเก่าไว้ก่อน)
- อาจแยกเป็น sub-components: `ProductImagesCard.tsx` (มีอยู่ คงไว้ ปรับ copy), `ProductBasicCard.tsx`, `ProductPriceCard.tsx`, `ProductTypePickerCard.tsx`, `ProductDescriptionCard.tsx`

### Theme copy compliance
- **ทุก card** ใช้ `card` + `card-header p-5` + `card-body` ตาม Paces pattern
- **Type picker cards** copy mechanism จาก `theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx` line 355-381 (Radio Toggle) — `peer hidden` radio + `<label className="btn ...peer-checked:bg-primary">` แต่เพิ่ม emoji + แนวตั้ง (icon บน, text ล่าง)
- **Quick-pick chips** copy จาก `ChecksRadioSwitches.tsx` line 322-348 (Checkbox Toggle) แต่ใช้ radio เพื่อให้เลือกได้ชิ้นเดียว
- **Description collapse** ใช้ Preline `data-hs-collapse` (มีใน Paces script bundle)
- **Price input-group** copy จาก `Pricing.tsx` (input-icon-group pattern) — ใช้ `Icon icon="currency-baht"` แทน dollar
- **Dropzone** คง `FileUploader` component เดิม แต่ override children ใน `ProductImages.tsx` เพื่อเปลี่ยน copy (ภาษาไทย + camera icon ใหญ่)

### DB / API
- ไม่ต้องแก้ schema — ใช้ field `name`, `description`, `price`, `type`, `images`, `isActive` เดิม
- ไม่ต้องแก้ `POST /api/products` หรือ Valibot schema — input shape เหมือนเดิม
- ปรับเฉพาะ Yup error messages ใน `ProductForm.tsx` ให้เป็นภาษาคน (รายการใน Copy deck)

### Mobile-first breakpoints
- Default = mobile (single column, full-width cards, big tap targets)
- `lg:grid-cols-2` desktop split
- `min-h-12` (48px) สำหรับ tap targets ทุกตัว — Apple HIG / Material guideline 44-48px
- `text-base` (16px) ขั้นต่ำของ input — กัน iOS auto-zoom

### Auto-save draft
- File: `src/app/(paces)/seller/(dashboard)/products/components/useProductDraft.ts` (custom hook)
- Key: `safepay:product-draft:${shopId}` (separate per shop)
- Debounce 500ms; save fields { name, description, price, type } only
- Restore: ถ้ามี draft + submit ยังไม่สำเร็จ → banner ก่อนเริ่มกรอก
- Clear: เมื่อ `onSubmit` success
- ใช้ `useEffect` + `JSON.stringify/parse` — ไม่ต้องลง lib ใหม่

### Form state retention หลัง "บันทึก & เพิ่มอีก"
- เก็บ `type` + `price` ล่าสุด (likely user repeats variant)
- Reset `name`, `description`, `images` เป็นค่า empty
- Focus ที่ Card 1 (`ProductImages` dropzone)

### Server / Client boundary (Hard Rule #2)
- `page.tsx` server: auth + shop check → render `<ProductFormShell shopId={...} />` (client wrapper)
- ไม่มี `component={Link}` — ใช้ `<Link>` ปกติทุกที่
- `FullscreenPageHeader` (server-safe — รับ string props เท่านั้น) คงเดิม

### Validation
- Frontend: Yup (มีอยู่) — แค่เปลี่ยน error message
- Live (as-you-type) สำหรับ name/price (mode: `'onChange'` ใน `useForm`) — feedback ทันที
- ไม่ต้องโชว์ error ก่อน user touch field — ใช้ `mode: 'onTouched'` ดีกว่า

### A11y
- ทุก label ผูก `htmlFor` กับ `id` ของ input (Paces pattern อยู่แล้ว)
- Type cards = `<input type="radio" name="type" />` ซ่อน + `<label>` (สามารถ tab ได้)
- ปุ่ม dropzone มี `role="button"` (`react-dropzone` ให้มาแล้ว)
- Error message ใส่ `aria-describedby` ผูก input ↔ error

---

## Open questions for user

1. **ชื่อสินค้า required min 2 chars** — schema ปัจจุบันบังคับขั้นต่ำ 2 ตัว ผ่อนเป็น 1 ตัวได้ไหม (ป้าอาจอยากตั้งชื่อสั้นๆ "น้ำ", "ข้าว")?
2. **รูปสินค้า required หรือไม่?** — PRD ไม่ระบุ. แนะนำ optional + warning toast (ตามที่เสนอ) แต่ถ้ามอง marketplace UX อาจ require อย่างน้อย 1 รูป — ขอความเห็น
3. **Quick-pick chips ราคา** — `49/99/199/299/499/999` เป็นค่าที่เดามา. มี data จริงในระบบ (top 6 ราคาที่ใช้บ่อย) ไหม? ถ้ามี → คำนวณ dynamic จาก seller history หรือ global popular
4. **Auto-save draft** — เห็นด้วยให้ทำใน MVP นี้ไหม? (เพิ่ม dev cost ราว 1-2 ชม. แต่เพิ่มความรู้สึกปลอดภัยให้ป้าๆ)
5. **"+ บันทึก & เพิ่มอีกชิ้น"** — ใส่ใน MVP หรือ Phase 2? (UX กลุ่ม batch creation ดีมาก แต่ไม่ critical)
6. **Toast emoji 🎉** — ใส่ emoji ใน toast ok ไหม? (CLAUDE.md ห้าม emoji ในไฟล์ default แต่ user-facing copy ผ่อนได้บ้าง — ขอ confirm)
7. **Type default = PHYSICAL** — ปัจจุบันก็เป็น PHYSICAL อยู่แล้ว เก็บไว้ตามเดิมใช่ไหม? (ป้าตลาดส่วนใหญ่ขายของจริง)
8. **รายละเอียดเพิ่มเติม collapsed by default** — บางคนอาจชอบเปิดไว้เผื่อต้องกรอก. คิดยังไง?
9. **Confirmation ก่อน "ยกเลิก" ถ้า dirty form** — ใส่ confirmation dialog ไหม (กันเผลอกด)?
10. **Beep / haptic บน mobile** — เพิ่ม haptic feedback ตอนกด chip / type card ไหม? (ถ้าใช่ ต้อง wrap `navigator.vibrate(20)` แบบ best-effort — บาง browser ไม่รองรับ)

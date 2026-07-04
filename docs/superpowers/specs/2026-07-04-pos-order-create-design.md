# POS-style Order Create — Design Spec

- **วันที่:** 2026-07-04
- **Surface:** seller Paces — `(paces)/seller/(fullscreen)/orders/new` (fullscreen, ไม่มี sidebar)
- **Mockup:** `docs/superpowers/specs/2026-07-04-pos-order-create.html` (Mobile / Tablet / Desktop)
- **Skin:** Paces primary `#236dc9` · font Anuphan · ทุก primitive = Paces (ห้าม arbitrary value — HR7)

---

## 1. Goal
เปลี่ยน UX หน้าสร้างออเดอร์ให้ **เน้นการเลือกสินค้าก่อน แบบ POS**: product grid เป็นพระเอก (แตะการ์ด = +1 qty), cart panel ขวามือ live, และแก้ไข line แบบ select2 (เลือกสินค้าจากลิสต์ / พิมพ์ชื่อใหม่เป็น custom item + description).

## 2. Scope
- **In:** redesign UI shell ของหน้า order create (layout + product grid + cart panel + line editing + accordion + mobile bottom-sheet)
- **Out (ไม่แตะ):** backend — `POST /api/orders`, `createOrder` service, Valibot validation, `FormValues` shape, fulfillmentMode derivation, STOREFRONT-hides-shipping rule (เพิ่งแก้ commit ก่อน), buyer-history/SMS flow. เปลี่ยนเฉพาะชั้น presentation ที่ผูกกับ `useForm` เดิม

## 3. Layout
- **Desktop (≥lg):** split — ซ้าย `flex-1` = product grid, ขวา `w-80` sticky = cart panel
- **Tablet (md):** split เหมือนกัน, grid 2-col, panel แคบลง
- **Mobile (<md):** grid เต็มจอ (2-col) + **floating bar ล่าง** (`ตะกร้า (n) · ฿total ›`) → แตะเปิด **bottom-sheet** (lines + accordion + footer). ปิด sheet = แตะ scrim/grab/ปุ่มบันทึกสำเร็จ

## 4. Components (`orders/new/components/`)

| ไฟล์ | หน้าที่ | มาจาก |
|---|---|---|
| `OrderCreateForm.tsx` (แก้) | orchestrator — `useForm`/schema/`onSubmit` **คงเดิม**; render POS split แทน 4-block grid | เดิม |
| `ProductGrid.tsx` (ใหม่) | ซ้าย: search + product cards; แตะ = `inc`; badge จำนวนถ้าอยู่ในตะกร้า; empty state | Base: `ProductPickerModal.tsx` (body grid เดิม) |
| `CartPanel.tsx` (ใหม่) | ขวา: lines + `+ พิมพ์เอง` + accordions + footer. mobile = bottom-sheet wrapper | Base: Paces `apps/ecommerce/.../order-add` summary + `ui/accordions` |
| `CartLineItem.tsx` (ใหม่) | 1 line: `ProductCombobox` + description input + qty stepper + unit price + line total + ลบ | Paces `form/elements` + order-add row |
| `ProductCombobox.tsx` (ใหม่) | select2: ค้นหา catalog → เลือก (set productId/name/price/description) **หรือ**พิมพ์ชื่อใหม่ → custom item (productId undefined). **custom React state — ห้ามใช้ Preline hs-dropdown** (กัน opacity ค้าง — [[project_filterdropdown_reusable]]) | custom (ยึด FilterDropdown pattern) |
| `CustomerSelectBlock.tsx` (reuse) | ย้ายเข้า accordion "ลูกค้า" | เดิม |
| `PaymentChannelBlock.tsx` (reuse) | ย้ายเข้า accordion "ชำระเงิน / ช่องทาง" (รวม ส่วนลด/VAT ที่ footer หรือคงในนี้) | เดิม |
| `OrderSummaryPanel.tsx` (reuse/ปรับ) | เนื้อหา footer สรุปยอด (subtotal/discount/VAT/total) | เดิม |
| `ProductPickerModal.tsx` | **ลบ** (แทนด้วย ProductGrid inline) | — |

## 5. Interactions

### 5.1 Product grid (ซ้าย)
- การ์ด: รูปสินค้า (fallback icon แบบ [[AccountAvatar]] เมื่อ null/แตก) + ชื่อ + ราคา + badge จัดส่ง/ไม่จัดส่ง (จาก `fulfillmentMode`)
- **แตะการ์ด 1 ที = `inc(product)`** (เพิ่ม line ใหม่ถ้ายังไม่มี, ไม่งั้น +1 qty) — reuse `inc`/`dec`/`qtyByProduct` เดิมของ CartBlock
- การ์ดที่อยู่ในตะกร้า → badge จำนวนมุมขวาบน
- search: filter ตามชื่อ (client-side, เหมือน ProductPickerModal เดิม)

### 5.2 Cart line + ProductCombobox (select2)
- แต่ละ line มี combobox แสดงชื่อสินค้าปัจจุบัน; แตะ → เปิด popup:
  - ช่อง search + ลิสต์ catalog (filter live); เลือก option → set `productId/name/price/description` ของ line นั้น
  - พิมพ์ข้อความที่ไม่ตรงสินค้า → แถว **"ใช้ '<text>' เป็นรายการใหม่"** → set `name=<text>`, `productId=undefined` (custom item)
- description: input (บรรทัดเส้นประ) — แก้ได้เสมอ
- qty stepper `−/＋` (min 1) + unit price (แก้ได้; custom item กรอกเอง) + line total (computed) + ปุ่มลบ
- `+ พิมพ์รายการเอง` = append line ว่าง (`productId:undefined, name:'', qty:1, price:0`) + focus combobox

### 5.3 Accordion (ใต้ lines)
- 4 กลุ่ม เปิดทีละอัน (Paces accordion): **ลูกค้า** (`CustomerSelectBlock`) / **ชำระเงิน+ช่องทาง** (`PaymentChannelBlock`) / **ที่อยู่จัดส่ง** / **หมายเหตุ**
- **ที่อยู่จัดส่ง:** แสดง/บังคับเฉพาะเมื่อ `needsShipping` (มีสินค้า SHIPPED) **และ** `salesChannel !== 'STOREFRONT'` — คงกฎเดิม (commit ก่อนหน้า). STOREFRONT หรือไม่มีสินค้าจัดส่ง → ซ่อน accordion นี้

### 5.4 Footer (pinned)
- subtotal → ส่วนลด (฿ input) → VAT → **รวมทั้งสิ้น** → ปุ่ม **บันทึกออเดอร์** (`type=submit` form เดิม)
- ตะกร้าว่าง → ปุ่ม disabled

## 6. Data flow — ไม่แตะ backend
- `FormValues` + `useFieldArray('items')` + Yup `itemSchema` + `onSubmit` mapping + `POST /api/orders` **เดิมทั้งหมด**
- combobox/stepper เขียนค่าเข้า `items[i]` fields เดิม (`productId/name/description/qty/price`)
- `inc/dec/qtyByProduct` ย้ายขึ้น OrderCreateForm (owner useFieldArray) แล้วส่ง prop ให้ ProductGrid + CartLineItem (ตอนนี้อยู่ใน CartBlock — refactor ownership ขึ้นไป form)

## 7. Edge cases
| กรณี | พฤติกรรม |
|---|---|
| แคตตาล็อกว่าง | grid empty state + ยังกด "พิมพ์รายการเอง" ได้ |
| ตะกร้าว่าง | ปุ่มบันทึก disabled; mobile bar โชว์ `ตะกร้า (0)` |
| รูปสินค้า null/แตก | fallback icon (onError, pattern [[project_fb_account_switcher_resume|AccountAvatar]]) |
| custom item ไม่กรอกชื่อ/ราคา | Yup itemSchema เดิม block (ชื่อ required, ราคา >0) |
| ต้องจัดส่ง + ไม่ใช่ STOREFRONT + ไม่กรอกที่อยู่ | accordion ที่อยู่เด้ง + toast (validation เดิม onSubmit) |
| combobox popup ใน panel ที่ re-render | custom state (ไม่ใช่ hs-dropdown) → ไม่ opacity ค้าง |

## 8. Convention / gate
- ผ่าน `safepay-ux` ก่อน build (HR8) อิง Paces docs + `paces-component-reference.md`
- ทุก primitive Paces (`.card`/`.btn`/`.badge`/`form-input`/token/`size-*`) — ห้าม arbitrary value (HR7); bottom-sheet/floating-bar/combobox-popup ที่ Paces ไม่มี token → เขียน comment กำกับ (HR7 exception)
- toast = `pacesToast`; commit UI มี `Base:` line (HR3); font Anuphan (ห้าม font-mono)
- Chart/emoji: ไม่มี

## 9. QA
- Playwright E2E + Chrome DevTools MCP ที่ `seller.deepth.local:4000` (user รัน dev server)
- scenarios: แตะการ์ด=+1/badge, combobox เลือก existing, combobox พิมพ์ custom+desc, qty stepper, ลบ line, accordion, STOREFRONT ซ่อนที่อยู่, submit สร้างออเดอร์สำเร็จ (DB persist), mobile bottom-sheet เปิด/ปิด/checkout, empty states

# Quick Create Order (mobile/tablet) + สินค้าขายดี บน Command Center

> วันที่: 2026-07-06 · Surface: seller `(paces)/**` (Paces) · Mockup: `2026-07-06-quick-create-order.html`

## 1. เป้าหมาย

ให้ seller สร้างออเดอร์บนมือถือ/แท็บเล็ตได้ **ง่ายและเร็ว** โดยเฉพาะ 2 พฤติกรรม:

- **ขายชิ้นเดียวเป็นหลัก** — ลูกค้าทักมาสั่ง → จิ้มสินค้าขายดี → กรอกชื่อ/ที่อยู่ → บันทึก
- **ขายหลากหลาย** — พิมพ์รายการเอง (combobox ค้นหา) หลายบรรทัด → ลูกค้า → บันทึก

อ้างพฤติกรรมจริง (ลูกค้าทักแชท): ชื่อ + ที่อยู่ + เบอร์ + สินค้า×จำนวน + **ยอดรวมปลายทาง (COD)**.

## 2. Scope

**In:**
1. **Quick create page** — `/orders/new` เมื่อจอ `< lg` แสดง **quick form หน้าเดียว scroll** (แทน POS split). จอ `≥ lg` (desktop) คง POS split เดิม **ไม่แตะ**.
2. **สินค้าขายดี บน Command Center** — เพิ่ม section แถวเลื่อนสินค้าขายดีในหน้า dashboard seller; จิ้มสินค้า → ไปหน้าสร้างออเดอร์พร้อมสินค้านั้นในรายการ.
3. **Backend** — query "สินค้าขายดี" (เรียงจากยอดขายมากสุด desc) ใช้ร่วมทั้ง 2 surface.

**In (เพิ่มรอบนี้ — customer):**
4. **paste-parse** (วางข้อความแชท → แยกชื่อ/เบอร์/ที่อยู่) — heuristic parser + wand tool. *(เดิม Phase 2 → ดึงเข้ารอบนี้ตาม user request; เป็นงานหนักสุด.)*
5. **Thai address autocomplete** — full-screen sheet ค้นหาที่อยู่ (jquery.Thailand.js `db.json` bundle + React typeahead).

**Out (Phase 2):**
- เพิ่ม sales channel "Shopee" ใน enum จริง (mockup โชว์ตัวอย่าง — ใช้ set ปัจจุบัน STOREFRONT/FACEBOOK/LINE/TIKTOK/OTHER ตอน build).
- parse **สินค้า/จำนวน/ยอด** จากข้อความแชท (รอบนี้ parse เฉพาะ ลูกค้า/ที่อยู่; สินค้าเลือกเอง).

## 3. Layout quick form (`< lg`) — **inline scroll** (ไม่ใช่ hub — user ตัด hub 2026-07-06)

**ลำดับ section (customer-first, user-confirmed):** **ลูกค้า → ช่องทางการขาย → การชำระเงิน → สินค้า → เพิ่มเติม(หมายเหตุ/แท็ก/ส่วนลด)**. Footer = สรุปยอด (collapsible) + บันทึก (sticky). **แต่ละ section คั่นด้วยแถบเทา full-bleed (`border-bottom` หนา ~8px `bg-default-100`) — ไม่ใช้ card (เปลือง padding) → เห็นขอบเขตชัดแต่ประหยัดพื้นที่.** Sheet ยังใช้เฉพาะ: เลือกสินค้า / แก้ราคา / ค้นหาที่อยู่ / วางจากแชท. content แต่ละ section:

1. **สินค้า** — โหลดครั้งแรกมี **1 บรรทัดว่าง (placeholder)** พร้อมแตะเลือกทันที. หัว section มี **"+ เพิ่มรายการ"** มุมขวา. แต่ละไลน์ (ภาพ 21): **[รูป square]** + คอลัมน์:
   - **ชื่อสินค้า** — inline-edit (ดูเหมือน text ธรรมดา, focus แล้วแก้ได้; **ไม่มี arrow**) รองรับ search **ชื่อ + SKU**.
   - **รายละเอียดสินค้า** — inline-edit muted (placeholder "รายละเอียดสินค้า") = `item.description` เช่น "ประกัน 3 เดือน" / "ลดให้เพราะ ABC".
   - **trash** มุมขวาบน (จาง low-emphasis กันลบพลาด) = `remove`.
   - แถวล่าง: **ยอดรวมตัวหนา** + `฿ราคา/ชิ้น · แก้ราคา` (จิ้ม → bottom sheet แก้ราคา) ซ้าย · **stepper** `[−][จำนวน][+]` ขวา.
   - **แตะช่องชื่อสินค้า / "+ เพิ่มรายการ" → product-picker bottom sheet** (ลด 1 step): ช่องค้นหา (ชื่อ/SKU) + **สินค้าขายดี = card slide** (แตะการ์ด = เลือกลงไลน์เลย) + "ใช้คำที่พิมพ์เป็นสินค้าใหม่ (custom)". *(สินค้าขายดีไม่ใช่ section แยกด้านบนแล้ว — ย้ายเข้า sheet.)*
   - **bottom sheet แก้ราคา:** `[−10][−] [input ฿] [+][+10]` + `[นำไปใช้]` → set `item.price`.
   - **หมายเหตุ:** search SKU ต้องมี `Product.sku` — ถ้าไม่มี → search ชื่ออย่างเดียว (ยืนยันตอน build).
2. **ช่องทางการขาย + การชำระเงิน** (section เดียว, minimal) — **2 แถว selector** (label + icon+ค่าที่เลือก + chevron) แตะ → **bottom sheet** (option list icon+label + check ตัวเลือก + **★ ตั้งเป็นค่าเริ่มต้นครั้งถัดไป**). tablet แนวนอน = 2 selector เรียงข้างกัน (selgrid 2-col).
   - channel: STOREFRONT/FACEBOOK/LINE/TIKTOK · payment: CASH/TRANSFER/COD.
   - **★ default:** จำ default channel/payment ไว้ครั้งถัดไป — MVP เก็บ **localStorage** (client, per-device, ไม่มี migration); server-side (Shop prefs) = Phase 2.
4. **ลูกค้า** (phone-first) — หัวข้อมี **icon เครื่องมือ (wand)** = วางข้อความจากแชท (paste-parse).
   - **เบอร์นำ:** พิมพ์เบอร์ → ค้นลูกค้าเดิม (Customer Directory dedup) → auto-fill ชื่อ/ที่อยู่ + chip "ลูกค้าเดิม · N ออเดอร์"; ใหม่ → ช่องชื่อโผล่.
   - **ที่อยู่** (เมื่อต้องจัดส่ง): บ้านเลข/หมู่/ถนน (freetext) + **locality field อันเดียว** → แตะเปิด **full-screen sheet "เลือกที่อยู่"** (พิมพ์ ตำบล/อำเภอ/จังหวัด/รหัส อย่างใดอย่างหนึ่ง → list `ตำบล > อำเภอ > จังหวัด > รหัส` จิ้มเลือก → เติม subdistrict/district/province/postcode ครบ). เลือกแล้วโชว์ในช่องเดิม, จิ้มซ้ำ = แก้ (เปิด sheet). **ข้อมูล = jquery.Thailand.js `db.json`** (bundle JSON, ทำ React typeahead เอง — ไม่ใช้ jQuery; WTFPL).
   - **paste-parse (wand):** วางข้อความแชท → sheet (textarea) → parse heuristic (เบอร์ `0xx-xxx-xxxx` / รหัส 5 หลัก / `ต.`/`อ.`/`จ.` / ชื่อหลัง "ชื่อผู้รับ:"/"ถึงคุณ"/บรรทัดแรก / ยอด "ยอดรวมปลายทาง X") → เติมฟิลด์ให้ seller ตรวจ/แก้ (แม่น ~80%).
5. **เพิ่มเติม** (collapsible) — ส่วนลด · หมายเหตุ.
6. **Summary panel** (sticky ล่าง, collapsible) — ย่อ `รวมทั้งสิ้น ฿X ⌄` (chevron ท้ายราคา ไม่มีคำ "ดูรายละเอียด") + ปุ่ม **บันทึกออเดอร์**; จิ้มแถวรวม → กาง ยอดสินค้า/ส่วนลด/VAT.

## 4. สถาปัตยกรรม

### 4.1 Quick create — `OrderCreateForm.tsx` (owner ของ `ItemsController` + form state เดิม)
- แยก render ตาม breakpoint: `< lg` = **QuickForm** (component ใหม่), `≥ lg` = POS split เดิม (คง `ProductGrid` + `CartPanel`).
- **reuse ให้มากที่สุด** — form (`useForm`/schema/`onSubmit`), `ItemsController` (inc/remove/addCustom), `ProductCombobox`, customer dedup logic. ไม่ทำ state/submit ใหม่.
- Component ใหม่ (ทั้งหมด client, ใต้ `orders/new/components/`):
  - `QuickForm.tsx` — เจ้าของ layout quick (รับ `itemsCtl`, form register/watch, catalog, bestSellers) ประกอบ section 1–7.
  - `ProductPickerSheet.tsx` — bottom sheet เลือกสินค้า (เปิดตอนแตะช่องชื่อ/"+ เพิ่มรายการ"): ช่องค้นหา (ชื่อ/SKU) + **สินค้าขายดี card slide** + custom. `onPick(product)` = `itemsCtl.setLineProduct`/`inc`; `onCustom(text)`. รับ `bestSellers` + `catalog`.
  - `QuickLineItem.tsx` — ไลน์ตาม mockup ภาพ 21 ([รูป square]+ชื่อ inline-edit+รายละเอียด+ยอดรวม+ราคา/ชิ้น+stepper+trash). แตะชื่อ → `ProductPickerSheet`; จิ้ม price → `QuickPriceSheet`.
  - `QuickPriceSheet.tsx` — bottom sheet แก้ราคา (stepper ±1/±10 + นำไปใช้) → `itemsCtl` set ราคา line.
  - `ChannelCards.tsx` / `PaymentCards.tsx` — card selector bind `salesChannel` / `paymentMethod`.
  - `CustomerQuickBlock.tsx` — phone-first (เบอร์→dedup auto-fill), wand tool เปิด `PasteParseSheet`, ที่อยู่ (บ้านเลข + locality field เปิด `AddressSearchSheet`).
  - `AddressSearchSheet.tsx` — full-screen sheet ค้นหาที่อยู่ (พิมพ์ → filter `thaiAddressDb` → list `ตำบล > อำเภอ > จังหวัด > รหัส` → `onSelect` เติม 4 ฟิลด์). data: `src/data/thai-address.json` (จาก jquery.Thailand.js db.json) load แบบ dynamic import (กัน bundle บวม).
  - `PasteParseSheet.tsx` — textarea วางข้อความ → `parseOrderMessage(text)` → preview + เติมฟิลด์ (ชื่อ/เบอร์/ที่อยู่). Base: bottom sheet.
  - `QuickSummaryPanel.tsx` — sticky collapsible summary + ปุ่มบันทึก (`form=<formId>`).
- **lib ใหม่:** `src/lib/parse-order-message.ts` — `parseOrderMessage(text): { name?, phone?, addressLine?, subdistrict?, district?, province?, postcode? }` (heuristic regex, pure, unit-testable).
- **data ใหม่:** `src/data/thai-address.json` — bundle จาก `jquery.Thailand.js/database/db.json` (records `{district(tambon), amphoe, province, zipcode}`).
- **Pre-add product** — รับ `?product=<id>` (query) → ถ้ามีใน catalog เรียก `itemsCtl.inc` ครั้งเดียวตอน mount (สำหรับ deep-link จาก Command Center).

### 4.2 สินค้าขายดี บน Command Center
- `dashboard/page.tsx` ดึง `getBestSellerProducts(shopId, 8)` เพิ่ม (Promise.allSettled เดิม) ส่งเข้า Command Center.
- Component ใหม่ `dashboard/components/BestSellerStrip.tsx` — section "สินค้าขายดี" (แถวเลื่อน, ไม่มี border, การ์ด square) render ใน CommandCenter หลัง block "คำสั่งซื้อ". จิ้ม = `router.push('/orders/new?product=<id>')`.
- ถ้าไม่มียอดขาย (ร้านใหม่) → ไม่แสดง section (หรือ fallback สินค้าล่าสุด — ตัดสินตอน plan).

### 4.3 Backend — best-seller query
- `getBestSellerProducts(shopId: string, take = 8): Promise<CatalogProduct[]>` (ใน `product.service.ts`):
  - `prisma.orderItem.groupBy({ by: ['productId'], where: { order: { shopId }, productId: { not: null } }, _sum: { qty }, orderBy: { _sum: { qty: 'desc' } }, take })`
  - fetch products ตาม id ที่ได้ (active เท่านั้น) map เป็น `CatalogProduct` (ใช้ shape เดิม); คงลำดับ best-seller.
  - **ไม่แตะ schema** — OrderItem มี `productId` + relation `product` อยู่แล้ว.
- ไม่แตะ `createOrder` / customer dedup / STOREFRONT rule / validation.

## 5. Non-goals / คงเดิม
- Desktop POS (`≥ lg`) ไม่เปลี่ยน. **[UPDATE 2026-07-08] ยกเลิกแล้ว** — desktop parity ทำใน phase แยก (paste-parse/address-autocomplete/SKU-search/remember-default) ดู `docs/scope/2026-07-08-orders-new-desktop-parity-scope-baseline.md`. ตอนนี้ desktop มี 4 affordance เท่ามือถือแล้ว.
- ไม่มี migration / ไม่แตะ payment endpoint / ไม่แตะ Customer entity (feat 00014).
- ราคาต่อหน่วยแก้ได้บนไลน์ = รองรับ "ยอดปลายทาง" ที่ต่างจากราคาแคตตาล็อก.

## 6. Acceptance
- มือถือ: จิ้มสินค้าขายดี 1 ที → มีไลน์ + ราคา auto → กรอกชื่อ/ที่อยู่ → บันทึก → order สร้างสำเร็จ (channel/payment ตามที่เลือก).
- แก้ราคาในไลน์ → ยอดรวมใน summary panel อัปเดต.
- เลือกช่องทาง = หน้าร้าน → ช่องที่อยู่ซ่อน (STOREFRONT rule).
- Command Center: จิ้มสินค้าขายดี → เข้า `/orders/new` มีสินค้านั้นในรายการแล้ว.
- Desktop: `/orders/new` ยังเป็น POS split เดิม (ไม่ regress).
- best-seller เรียงตามยอดขายจริง (sum qty desc).

## 7. Theme sourcing (Hard Rule 1/3/7/8)
- ทุก card/primitive จาก Paces (`.card`/`btn`/`badge`/token) — ห้าม arbitrary value เว้นจำเป็น (เขียน comment). Base: `theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx` + component เดิมใน `orders/new/`.
- ผ่าน `safepay-ux` ก่อน implement (Hard Rule 8). Toast = `pacesToast`. ไม่มี emoji (icon `@/components/wrappers/Icon`).

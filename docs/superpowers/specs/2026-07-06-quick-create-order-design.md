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

**Out (Phase 2):**
- **paste-parse** — วางข้อความแชท → แยกชื่อ/เบอร์/ที่อยู่อัตโนมัติ.
- เพิ่ม sales channel "Shopee/TikTok" ใน enum จริง (mockup โชว์เป็นตัวอย่าง — ใช้ set ปัจจุบันตอน build).

## 3. Layout quick form (`< lg`) — ลำดับ section

1. **สินค้าขายดี** — มือถือ = แถวเลื่อนแนวนอน (slide) การ์ดเล็ก (รูป square ~54px); แท็บเล็ต = grid 3-col. จิ้ม = `ItemsController.inc(product)` (เพิ่ม/+1). ไม่มีช่องค้นหาแยก (ค้นผ่าน combobox ในไลน์).
2. **รายการ** — แต่ละไลน์: **[รูป square] + คอลัมน์( combobox ชื่อสินค้า (จิ้มค้นหา/เลือก/พิมพ์เอง) / −จำนวน+ · ฿ราคา(แก้ได้) · ปุ่มลบ )**. ปุ่ม "+ พิมพ์รายการเอง" = `addCustom()`.
   - **จิ้ม ฿ราคา → bottom sheet "แก้ราคา" slide up** (มือถือ): แถว stepper `[−10][−] [ input ฿ ] [+][+10]` + helper `[ลด 10%] [เพิ่ม 10%]` (คำนวณจากราคาปัจจุบัน) + ปุ่ม `[นำไปใช้]` → set ราคา line นั้น. (แก้ราคาหน้างานเร็ว — รองรับ "ยอดปลายทาง").
3. **ช่องทางการขาย** — card เลือก 1 (icon + selected style): หน้าร้าน / Facebook / Line / (channel enum ปัจจุบัน). default = หน้าร้าน (STOREFRONT).
4. **รูปแบบการชำระเงิน** — card เลือก 1: เงินสด / โอน / COD (จาก payment enum ปัจจุบัน). default = เงินสด.
5. **ลูกค้า** — 3 ช่อง flat (ไม่ accordion): ชื่อลูกค้า / เบอร์โทร (live search + dedup ลูกค้าเดิม ผ่าน `CustomerSelectBlock` logic เดิม) / ที่อยู่จัดส่ง. ที่อยู่ซ่อนเมื่อช่องทาง = หน้าร้าน (STOREFRONT rule เดิม).
6. **เพิ่มเติม** (collapsible อันเดียว) — ส่วนลด · หมายเหตุ.
7. **Summary panel (sticky ล่าง, collapsible)** — default ย่อ: `รวมทั้งสิ้น ฿X ⌄` (chevron ท้ายราคา, ไม่มีคำว่า "ดูรายละเอียด") + ปุ่ม **บันทึกออเดอร์**. จิ้มแถวรวม → กาง ยอดสินค้า/ส่วนลด/VAT.

## 4. สถาปัตยกรรม

### 4.1 Quick create — `OrderCreateForm.tsx` (owner ของ `ItemsController` + form state เดิม)
- แยก render ตาม breakpoint: `< lg` = **QuickForm** (component ใหม่), `≥ lg` = POS split เดิม (คง `ProductGrid` + `CartPanel`).
- **reuse ให้มากที่สุด** — form (`useForm`/schema/`onSubmit`), `ItemsController` (inc/remove/addCustom), `ProductCombobox`, customer dedup logic. ไม่ทำ state/submit ใหม่.
- Component ใหม่ (ทั้งหมด client, ใต้ `orders/new/components/`):
  - `QuickForm.tsx` — เจ้าของ layout quick (รับ `itemsCtl`, form register/watch, catalog, bestSellers) ประกอบ section 1–7.
  - `BestSellerRow.tsx` — แถวสินค้าขายดี (slide มือถือ / grid แท็บเล็ต) → `onPick(product)` = `itemsCtl.inc`.
  - `QuickLineItem.tsx` — ไลน์ตาม mockup ([รูป]+combobox+qty+price+ลบ). ห่อ `ProductCombobox` เดิม. จิ้ม price → เปิด `QuickPriceSheet`.
  - `QuickPriceSheet.tsx` — bottom sheet แก้ราคา (stepper ±1/±10 + helper ±10% + นำไปใช้) → `itemsCtl` set ราคา line. Base: Paces offcanvas/sheet primitive.
  - `ChannelCards.tsx` / `PaymentCards.tsx` — card selector bind ค่า `salesChannel` / `paymentMethod` ใน form.
  - `QuickSummaryPanel.tsx` — sticky collapsible summary + ปุ่มบันทึก (ปุ่ม submit ผ่าน `form=<formId>`).
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
- Desktop POS (`≥ lg`) ไม่เปลี่ยน.
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

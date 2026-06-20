# Seller Order Detail — Theme Fidelity (3 components, Full)

**วันที่:** 2026-06-16 · Route `(paces)/seller/(dashboard)/orders/[token]`
ทำให้ CustomerDetails / OrderSummary / ShippingActivity เหมือน Paces theme (adapt กับ data จริง). **Full fidelity** (ดึง avatar + thumbnail จริง). S-C1 PII masking คงเดิม (avatar/images ไม่ใช่ PII).

## Data availability (จาก prisma schema)
- `User.avatar String?` (buyer; guest = null → fallback initial circle)
- `Product.images Json @default("[]")` (array; OrderItem.productId optional → null = placeholder)
- OrderItem: name, description?, qty, price, productId?. 1 order = 1 ร้าน (ไม่มี per-product vendor → ใช้ description เป็น subtitle)
- buyer contact = masked phone เท่านั้น (ไม่มี email/location)

## Locked prop contract
**CustomerDetailsData** เพิ่ม `avatar: string | null` (นอกจาก buyerContactMasked/buyerDisplayName/buyerUsername/buyerName เดิม).
**OrderSummaryItem** เพิ่ม `imageUrl: string | null` (resolved server-side = product.images[0] ?? null; ห้ามส่ง raw images JSON ข้าม RSC).
**ShippingActivityData** ไม่เปลี่ยน (layout-only fix).

## Data layer contract — `src/services/order.service.ts` `getOrderForShop`
```
buyer: { select: { id, displayName, username, avatar: true } },   // +avatar
items: { include: { product: { select: { images: true } } } },   // +product.images
```
**page.tsx mapping:**
- CustomerDetails: `avatar: order.buyer?.avatar ?? null`
- items map: `const rawImages = Array.isArray(item.product?.images) ? item.product.images : []; imageUrl = rawImages[0] ?? null`
- **S-C1 ห้ามแตะ:** `order.buyerContact=null`, `order.review.reviewerContact=null` คงเดิม. avatar/imageUrl = URL ไม่ใช่ PII.
- **VERIFY ก่อน:** format ของ images (string[] vs {url}[]) + วิธี render avatar/รูปสินค้าที่ ProductsListing.tsx / UserCard.tsx ใช้ → match pattern เดิม (URL resolution + next.config host). ใช้ `import Image from 'next/image'` (ยืนยันแล้วว่า (paces) ใช้ตรง).

## Component 1 — CustomerDetails (Base: theme order-details/CustomerDetails.tsx)
- card-header "ข้อมูลผู้ซื้อ" (ลบ pencil edit btn — ไม่มี feature)
- avatar block: `relative me-2.5` + `<Image size-11 rounded-full object-cover>` ถ้า avatar มีค่า; fallback initial-letter `size-11 rounded-full bg-primary/15` + `text-primary font-semibold`; ถ้าไม่มีชื่อ → `tabler:user` icon ใน circle
- name `<h5 text-sm font-medium>` = displayName||username||buyerName; subtitle `@username` / "ผู้ซื้อที่ลงทะเบียนแล้ว" / "ชื่อที่ร้านบันทึก"
- **ลบ:** ธงชาติ, "Since 20XX", kebab Share/Block/Delete, email/location rows
- contact: `ul space-y-2.5` 1 row = `btn btn-icon bg-light size-6! rounded-full` + `tabler:phone` + masked phone
- คง empty-state เดิม (เมื่อ buyerContactMasked null)

## Component 2 — OrderSummary (Base: theme order-details/OrderSummary.tsx)
- thumbnail ต่อ item: `<Image size-9 rounded-md object-cover shrink-0>` ถ้า imageUrl; fallback `size-9 rounded-md bg-default-100` + `tabler:photo text-default-400`. ใส่ทั้ง desktop table cell (`flex items-center gap-base`) และ mobile stacked
- subtitle = item.description (ไม่มี "by: vendor")
- **breakdown rows ย้ายเข้า `<tbody>`** เป็น `<tr><td colSpan={3} text-right>label</td><td text-end>value</td></tr>`: ยอดสินค้า; ส่วนลด (เฉพาะ >0, `text-danger`, มี `-`); VAT N% (เฉพาะ >0); **ยอดรวมทั้งหมด** (`font-bold`, td value `bg-default-50`). ไม่มี Shipping Fee row
- คง honest conditional (discount/VAT แสดงเฉพาะ >0). mobile breakdown คงเป็น `<div>` block (table ซ่อน mobile)

## Component 3 — ShippingActivity (Base: theme order-details/ShippingActivity.tsx) — narrow fix
**ปัญหา:** date column `w-15 md:w-25` fixed + content ไม่มี `min-w-0` → ใน column ขวา ~270px (เฉพาะ ≥lg ที่ grid แยก) Thai text ตัดคำ.
**Fix (responsive):**
- row: `flex gap-x-base flex-col sm:flex-row`
- date column: `hidden sm:block lg:hidden sm:w-25 sm:text-end sm:shrink-0` (side-by-side เฉพาะ sm..lg ที่ grid ยัง full-width; ซ่อนที่ lg ที่ column แคบ)
- dot rail: คงเดิม + `shrink-0`
- content: `flex-1 min-w-0`; description `break-words`; date ใต้ description = `<p className="sm:hidden lg:block ... whitespace-nowrap">` (แสดงที่ base + lg-narrow)
- dot colors คงเดิม: PENDING done=`bg-success`, SHIPPED=`bg-primary`, CONFIRMED=`bg-success`, CANCELLED=`bg-danger`, pending=`border-2 border-default-300 bg-white`
- tracking badge `font-mono` คงได้ (เลขพัสดุ = code, HR5 ยกเว้น). **ห้าม font-mono บน Thai heading/description**
- **developer ตรวจ visual ที่ 640/1024/1280px** (breakpoint date column)

## Hard constraints
Paces primitive only; ZERO arbitrary value; primary `bg-primary` ไม่ใช่ violet; font Anuphan, ห้าม font-mono บน Thai; Thai copy; `next/image`; no react-toastify. `Base:` comment ทุกไฟล์ (HR3).

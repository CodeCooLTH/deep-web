# Quick Create Order (mobile/tablet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (dispatch per task) หรือ executing-plans. Frontend tasks (T3–T8) = SafePay **agent-team**: **safepay-ux (Hard Rule 8) → safepay-developer → safepay-reviewer → safepay-qa**. Controller commit.

**Goal:** ให้ seller สร้างออเดอร์บนมือถือ/แท็บเล็ต (`< lg`) แบบ quick form หน้าเดียว (สินค้าขายดี → รายการ → ช่องทาง/ชำระเงิน → ลูกค้า → สรุป) + section "สินค้าขายดี" บน Command Center. Desktop (`≥ lg`) คง POS split เดิม.

**Architecture:** `OrderCreateForm` คง ownership ของ form state + `ItemsController` (ไม่แตะ). render แยก breakpoint: `< lg` = `QuickForm` (**inline scroll** — ไม่ใช่ hub; ลำดับ **ลูกค้า → ช่องทาง → ชำระเงิน → สินค้า → เพิ่มเติม**), `≥ lg` = POS split เดิม. reuse `ProductCombobox` / `CustomerSelectBlock` / `onSubmit` / schema. Sheet เฉพาะ: เลือกสินค้า / แก้ราคา / ค้นหาที่อยู่ / วางจากแชท. Backend เพิ่ม 1 query best-seller. **ไม่มี migration.**

**Tech Stack:** Next 16 RSC, react-hook-form + Yup, Prisma (`orderItem.groupBy`), Paces (Preline/Tailwind), Vitest (service), Chrome DevTools MCP / Playwright (E2E).

## Global Constraints

- Paces primitive เท่านั้น (`.card`/`btn`/`badge`/token/`bg-primary`/`bg-{semantic}/15`/`size-*`/`rounded-lg`) — ห้าม arbitrary value เว้นจำเป็น (viewport-lock ฯลฯ) + **เขียน comment** (Hard Rule 7). primary = น้ำเงิน `#236dc9` (ห้ามม่วง).
- ห้าม emoji — icon จริงผ่าน `@/components/wrappers/Icon` (tabler bare name) (Hard Rule 12).
- Toast = `pacesToast` (ห้าม react-toastify ใน `(paces)`) (Hard Rule 9).
- Font Anuphan — ห้าม `font-mono` บนข้อความไทย.
- Commit ที่แตะ UI ต้องมี `Base:` line ชี้ theme/component ที่ copy (Hard Rule 3).
- salesChannel enum: `STOREFRONT|FACEBOOK|LINE|TIKTOK|OTHER`. paymentMethod enum: `CASH|TRANSFER|PROMPTPAY|CARD|COD|OTHER`. (Shopee = Phase 2, ไม่เพิ่มรอบนี้.)
- tsc: `node node_modules/typescript/lib/tsc.js --noEmit` = 0 error ทุก task.
- Dev server: user รันเอง (port 4000, `*.deepth.local`) — Claude ไม่ start. QA ผ่าน real subdomain.

---

## File Structure

**สร้างใหม่ (ทั้งหมด client, ใต้ `src/app/(paces)/seller/(dashboard)/orders/new/components/`):**
- `QuickForm.tsx` — layout quick (`< lg`); ประกอบ section 1–7; รับ control/itemsCtl/errors/catalog/bestSellers/summary.
- `ProductPickerSheet.tsx` — bottom sheet เลือกสินค้า (search ชื่อ/SKU + สินค้าขายดี card slide + custom); เปิดตอนแตะช่องชื่อ/เพิ่มรายการ.
- `QuickLineItem.tsx` — ไลน์ ภาพ 21 (รูป square + ชื่อ inline-edit + รายละเอียด + ยอดรวม + ราคา/ชิ้น + stepper + trash); แตะชื่อ→ProductPickerSheet, จิ้มราคา→QuickPriceSheet.
- `QuickPriceSheet.tsx` — bottom sheet แก้ราคา (±1/±10 + นำไปใช้).
- `ChannelCards.tsx` / `PaymentCards.tsx` — card เลือก `salesChannel` / `paymentMethod`.
- `CustomerQuickBlock.tsx` — phone-first + wand tool (paste) + address (locality field เปิด AddressSearchSheet).
- `AddressSearchSheet.tsx` — full-screen sheet ค้นหาที่อยู่ (thai-address.json typeahead).
- `PasteParseSheet.tsx` — textarea วางแชท → `parseOrderMessage` → เติมฟิลด์.
- `QuickSummaryPanel.tsx` — sticky summary collapsible + ปุ่มบันทึก (`form={formId}`).

**สร้างใหม่ (อื่น):**
- `src/lib/parse-order-message.ts` — heuristic parser (pure, unit-tested).
- `src/data/thai-address.json` — ที่อยู่ไทย (jquery.Thailand.js db.json, dynamic import).
- `src/app/(paces)/seller/(dashboard)/dashboard/components/BestSellerStrip.tsx` — section สินค้าขายดี บน dashboard.

**แก้:**
- `.../orders/new/components/OrderCreateForm.tsx` — เพิ่ม prop `bestSellers`; render `< lg` = QuickForm, `≥ lg` = POS split เดิม (ลบ mobile grid+sheet block); pre-add `?product`.
- `src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx` — fetch `getBestSellerProducts`, ส่ง prop.
- `src/services/product.service.ts` — เพิ่ม `getBestSellerProducts`.
- `src/app/(paces)/seller/(dashboard)/dashboard/page.tsx` — fetch best-seller, ส่งเข้า CommandCenter.
- `.../dashboard/components/CommandCenter.tsx` — render `<BestSellerStrip>` หลัง block "คำสั่งซื้อ".

---

## Task 1: Backend — `getBestSellerProducts` (best-seller query)

**Files:**
- Modify: `src/services/product.service.ts`
- Test: `src/services/__tests__/product-bestseller.test.ts` (ถ้ามี pattern __tests__ เดิม ใช้ตาม; ไม่งั้น `product.service.test.ts` ข้าง service)

**Interfaces:**
- Produces: `getBestSellerProducts(shopId: string, take?: number): Promise<CatalogProductLite[]>` — คืนสินค้าเรียงยอดขายมากสุด desc. `CatalogProductLite` = subset ที่ page map ต่อได้ (`id,name,description,price,type,fulfillmentMode,images,stockQty`) — ใช้ return shape เดียวกับ `getProductsByShop` (Product[] บางส่วน) เพื่อให้ page map เป็น `CatalogProduct` ได้เหมือนกัน.

- [ ] **Step 1: เขียน failing test**

```ts
// import prisma mock ตาม pattern service test เดิมในโปรเจกต์ (ดูไฟล์ test service อื่นก่อน)
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('getBestSellerProducts', () => {
  it('เรียงสินค้าตามยอดขาย (sum qty) มากสุดก่อน + เฉพาะ active + คงลำดับ', async () => {
    // groupBy คืน [{productId:'p2',_sum:{qty:50}},{productId:'p1',_sum:{qty:10}}]
    // findMany คืน product p1,p2 (สลับลำดับ) → ผลลัพธ์ต้องเรียง p2 ก่อน p1
    const res = await getBestSellerProducts('shop1', 8)
    expect(res.map((p) => p.id)).toEqual(['p2', 'p1'])
  })
})
```

- [ ] **Step 2: รัน test ให้ FAIL**

Run: `npx vitest run src/services/__tests__/product-bestseller.test.ts`
Expected: FAIL (getBestSellerProducts is not a function)

- [ ] **Step 3: implement**

```ts
// src/services/product.service.ts — เพิ่มท้ายไฟล์
/**
 * สินค้าขายดี — เรียงจากยอดขายรวม (sum OrderItem.qty) มากสุด desc
 * ใช้บน quick-create (แถวสินค้าขายดี) + Command Center. เฉพาะ line ที่มี productId (ไม่นับ custom item).
 */
export async function getBestSellerProducts(shopId: string, take = 8) {
  const grouped = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { productId: { not: null }, order: { shopId } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: 'desc' } },
    take,
  })
  const ids = grouped.map((g) => g.productId).filter((v): v is string => Boolean(v))
  if (ids.length === 0) return []
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, shopId, isActive: true },
  })
  // คงลำดับ best-seller (findMany ไม่รับประกันลำดับ)
  const byId = new Map(products.map((p) => [p.id, p]))
  return ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
}
```
> ⚠️ ยืนยันชื่อ field จริงก่อน implement: `OrderItem.productId` (nullable?), `OrderItem.order` relation + `Order.shopId`, `Product.isActive` (หรือ `status`/ชื่ออื่น). อ่าน `prisma/schema.prisma` ก่อน — ถ้า field ชื่อต่าง แก้ตามจริง (นี่คือ blocker gate).

- [ ] **Step 4: รัน test ให้ PASS**

Run: `npx vitest run src/services/__tests__/product-bestseller.test.ts` → PASS
Run: `node node_modules/typescript/lib/tsc.js --noEmit` → 0 error

- [ ] **Step 5: Commit**

```bash
git add src/services/product.service.ts src/services/__tests__/product-bestseller.test.ts
git commit -m "feat(quick-create): getBestSellerProducts — เรียงยอดขาย sum qty desc"
```

---

## Task 2: Wire best-seller เข้า page + OrderCreateForm prop + pre-add `?product`

**Files:**
- Modify: `src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx`
- Modify: `.../orders/new/components/OrderCreateForm.tsx` (Props + pre-add effect)

**Interfaces:**
- Consumes: `getBestSellerProducts` (T1).
- Produces: `OrderCreateForm` prop `bestSellers?: CatalogProduct[]` (ส่งต่อ QuickForm ใน T3).

- [ ] **Step 1: page — fetch + map best-seller เป็น CatalogProduct (shape เดียวกับ catalog) + ส่ง prop**

ใน `new/page.tsx` หลัง build `catalog`: 
```ts
import { getProductsByShop, getBestSellerProducts } from '@/services/product.service'
// ...
const toCatalog = (p: any): CatalogProduct => ({
  id: p.id, name: p.name, description: p.description ?? null, price: Number(p.price),
  type: p.type, fulfillmentMode: p.fulfillmentMode,
  image: Array.isArray(p.images) && p.images.length > 0 ? `/api/files/${p.images[0]}` : null,
  stockQty: p.stockQty ?? null,
})
// แทน .map เดิมด้วย toCatalog; แล้ว:
let bestSellers: CatalogProduct[] = []
try { bestSellers = (await getBestSellerProducts(shop.id, 8)).map(toCatalog) } catch { bestSellers = [] }
```
ส่ง: `<OrderCreateForm shopId={shop.id} catalog={catalog} bestSellers={bestSellers} formId={FORM_ID} inventoryEnabled={inventoryEnabled} />`

- [ ] **Step 2: OrderCreateForm — เพิ่ม prop + pre-add `?product`**

เพิ่มใน `Props`: `bestSellers?: CatalogProduct[]`. ใน component:
```ts
import { useSearchParams } from 'next/navigation'
// ...
const searchParams = useSearchParams()
const didPreAdd = useRef(false)
useEffect(() => {
  if (didPreAdd.current) return
  const pid = searchParams.get('product')
  if (!pid) return
  const p = catalog.find((c) => c.id === pid)
  if (p) { inc(p); didPreAdd.current = true }
}, [searchParams, catalog]) // inc ใช้ closure — ปลอดภัยเพราะ guard didPreAdd
```
> destructure `bestSellers` ใน props signature; ยังไม่ render (T3 ใช้).

- [ ] **Step 3: tsc**

Run: `node node_modules/typescript/lib/tsc.js --noEmit` → 0 error

- [ ] **Step 4: Commit**

```bash
git add "src/app/(paces)/seller/(fullscreen)/orders/new/page.tsx" "src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx"
git commit -m "feat(quick-create): wire bestSellers prop + pre-add ?product deep-link"
```

---

## Task 3: safepay-ux Design Spec (Hard Rule 8 GATE) + QuickForm shell + breakpoint restructure

**Files:**
- Create: `.../orders/new/components/QuickForm.tsx`
- Modify: `.../orders/new/components/OrderCreateForm.tsx` (render `< lg` QuickForm, `≥ lg` POS)

**GATE:** invoke **safepay-ux** ก่อน — ออก Design Spec (ASCII wireframe + Theme Source Mapping) อิง `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md` + mockup `2026-07-06-quick-create-order.html`. developer implement ตาม spec.

**Interfaces:**
- Consumes: `control, catalog, bestSellers, itemsCtl, errors, formId, inventoryEnabled` (จาก OrderCreateForm); `subtotal:number, total:number`.
- Produces: `QuickForm` props ข้างต้น; render `<div className="lg:hidden">` wrapper (mobile+tablet).

- [ ] **Step 1: QuickForm shell (section slots ว่างก่อน)**

```tsx
'use client'
// Base: mockup 2026-07-06-quick-create-order.html + Paces card primitives
import type { Control, FieldErrors } from 'react-hook-form'
import type { CatalogProduct, ItemsController } from './OrderCreateForm'

interface Props {
  control: Control<any>; errors: FieldErrors<any>
  catalog: CatalogProduct[]; bestSellers: CatalogProduct[]
  itemsCtl: ItemsController; formId?: string; inventoryEnabled?: boolean
  subtotal: number; total: number
}
export default function QuickForm(props: Props) {
  return (
    <div className="space-y-4">
      {/* T5 รายการ (QuickLineItem list + 1 empty line on mount) + ProductPickerSheet (T4) */}
      {/* T6 ChannelCards + PaymentCards */}
      {/* T7 CustomerSelectBlock(embedded) + เพิ่มเติม + QuickSummaryPanel */}
    </div>
  )
}
```

- [ ] **Step 2: OrderCreateForm render — `< lg` QuickForm, `≥ lg` POS split เดิม**

- เปลี่ยน desktop split wrapper จาก `hidden gap-4 md:flex ... lg:grid` → **`hidden lg:grid`** (desktop only, คงเนื้อใน).
- **ลบ** block `<div className="md:hidden"> ProductGrid + floating bar + bottom-sheet CartPanel </div>` ทั้งก้อน (+ state `sheetOpen` ที่ใช้เฉพาะ mobile POS ถ้าไม่ถูกใช้ที่อื่นแล้ว).
- เพิ่มก่อน desktop block:
```tsx
<div className="lg:hidden">
  <QuickForm control={control} errors={errors} catalog={catalog} bestSellers={bestSellers ?? []}
    itemsCtl={itemsCtl} formId={formId} inventoryEnabled={inventoryEnabled}
    subtotal={barSubtotal} total={barTotal} />
</div>
```

- [ ] **Step 3: tsc + สร้าง 1 order ผ่านหน้าเดิม (ยังว่าง section)** — verify desktop ไม่ regress (tsc 0). safepay-reviewer gate.

- [ ] **Step 4: Commit**

```bash
git add "...QuickForm.tsx" "...OrderCreateForm.tsx"
git commit -m "feat(quick-create): QuickForm shell + <lg quick / >=lg POS split restructure

Base: mockup 2026-07-06-quick-create-order.html + theme/paces order-add"
```

---

## Task 4: ProductPickerSheet (bottom sheet เลือกสินค้า — สินค้าขายดี card slide)

**Files:** Create `.../orders/new/components/ProductPickerSheet.tsx`; Modify `QuickForm.tsx` (state open + mount).

**Interfaces:**
- Consumes: `open:boolean`, `bestSellers: CatalogProduct[]`, `catalog: CatalogProduct[]`, `onPick:(p:CatalogProduct)=>void`, `onCustom:(text:string)=>void`, `onClose:()=>void`.
- **ไม่มี top section สินค้าขายดี** — best-seller อยู่ใน sheet นี้ (ลด 1 step).

- [ ] **Step 1: component** — bottom sheet (`fixed inset-x-0 bottom-0` viewport-lock HR7 comment) + dim overlay: 
  - ช่องค้นหา (พิมพ์ = filter `catalog` ตาม **ชื่อ + SKU**).
  - หัวข้อ "สินค้าขายดี" + **card slide** (`flex gap-2 overflow-x-auto`) การ์ด รูป square + ชื่อ + ราคา `text-primary`; แตะ = `onPick(p)` + `onClose`.
  - เมื่อพิมพ์: แสดง list ผลลัพธ์ (rows) แทน/ใต้ slide; ไม่พบ → "ใช้ '<text>' เป็นสินค้าใหม่" = `onCustom(text)`.
  - ถ้า `bestSellers.length===0` + ไม่พิมพ์ → แสดงแค่ search + custom.
> Base: bottom-sheet pattern (OrderCreateForm เดิม/Paces offcanvas) + `ProductGrid.tsx` การ์ด (slide) + `ProductCombobox.tsx` (filter ชื่อ/SKU logic).

- [ ] **Step 2: QuickForm** — state `pickerFor: number|null` (index ของ line ที่กำลังเลือก). แตะช่องชื่อ/`+ เพิ่มรายการ` → เปิด sheet; `onPick` = ถ้ามี index → `setLineProduct(index,p)` ไม่งั้น `inc(p)`; `onCustom` = `setLineCustom` / `addCustom`.
- [ ] **Step 3: tsc 0 + QA มือถือ: แตะช่องชื่อ → sheet เด้ง, card slide เลื่อน, แตะการ์ด → ไลน์ได้สินค้า + sheet ปิด.**
- [ ] **Step 4: Commit** (`Base:` ProductGrid + ProductCombobox + bottom-sheet).

---

## Task 5: QuickLineItem (รายการ: รูป+combobox+qty+price) + QuickPriceSheet (แก้ราคา)

**Files:** Create `QuickLineItem.tsx`, `QuickPriceSheet.tsx`; Modify `QuickForm.tsx`.

**Interfaces:**
- `QuickLineItem` consumes: `index`, `field`, `catalog`, `itemsCtl` (setLineProduct/setLineCustom/remove), `control` (สำหรับ register qty/price ผ่าน useController), `inventoryEnabled`.
- `QuickPriceSheet` consumes: `open:boolean`, `price:number`, `name:string`, `onApply:(price:number)=>void`, `onClose:()=>void`.

- [ ] **Step 1: QuickLineItem** — layout **ภาพ 21**: `[ProductThumb square] + col`:
  - **top:** `[ชื่อ (inline-edit) / รายละเอียด (inline-edit muted)]` + **trash มุมขวาบน**.
  - **bottom:** `[ยอดรวมตัวหนา ฿{qty×price} + "฿{price}/ชิ้น · แก้ราคา"(จิ้ม→QuickPriceSheet)]` ซ้าย · **stepper** `[−][qty][+]` ขวา.
  - **ชื่อสินค้า** = input inline-edit (ดูเหมือน text, `focus` reveal border; **ไม่มี chevron**). **onFocus/แตะ → เปิด ProductPickerSheet (T4)** สำหรับ index นี้ (best-seller card slide + search ชื่อ/SKU); พิมพ์เอง = custom.
  - **รายละเอียด** = input inline-edit muted useController `items.${index}.description` (placeholder "รายละเอียดสินค้า").
  - **stepper** useController `items.${index}.qty`; **price** useController `items.${index}.price` (แก้ผ่าน QuickPriceSheet); **trash** `text-default-400` low-emphasis → `itemsCtl.remove(index)`.
  - line ว่าง (ยังไม่เลือก) → thumb dashed muted + ยอด `฿0`.
  - stock warning ถ้า `inventoryEnabled` + qty เกิน stock.
    > ⚠️ SKU search: ยืนยัน `Product.sku` ใน schema.prisma + เพิ่ม `sku` ใน `CatalogProduct` + map ใน page (T2). ไม่มี → ชื่ออย่างเดียว (note commit).
> Base: `CartLineItem.tsx` (useController qty/price/description) — layout ภาพ 21.

- [ ] **Step 2: QuickPriceSheet** — bottom sheet (Paces offcanvas/overlay pattern; `fixed inset-x-0 bottom-0` = viewport-lock HR7 comment). แถว `[−10][−] [input ฿] [+][+10]`; `[นำไปใช้]` → `onApply(local)` + `onClose`. dim overlay จิ้มปิด. ค่าเริ่ม local = price ปัจจุบัน. (ไม่มีปุ่มลด/เพิ่ม %.)
> Base: bottom-sheet pattern จาก OrderCreateForm เดิม (ก่อนลบ) หรือ Paces offcanvas. Toast ไม่จำเป็น.

- [ ] **Step 3: QuickForm — render list** `itemsCtl.fields.map((f,i)=><QuickLineItem key={f.id} index={i} .../>)` + ปุ่ม "+ พิมพ์รายการเอง" (`itemsCtl.addCustom`). ถ้า `fields.length===0` เรียก `addCustom()` ครั้งเดียวตอน mount (มี 1 บรรทัดว่างพร้อมกรอก).
- [ ] **Step 4: tsc 0 + QA: จิ้มราคา → sheet เด้ง, ±10/ลด10% ปรับค่า, นำไปใช้ → ราคาไลน์เปลี่ยน + summary อัปเดต.**
- [ ] **Step 5: Commit** (`Base:` CartLineItem).

---

## Task 6: ChannelCards + PaymentCards (card selector)

**Files:** Create `ChannelCards.tsx`, `PaymentCards.tsx`; Modify `QuickForm.tsx`.

**Interfaces:** consume `control`. bind ผ่าน `useController({control, name:'salesChannel'|'paymentMethod'})`.

- [ ] **Step 1: ChannelCards** — หัวข้อ "ช่องทางการขาย"; card เลือก 1 (icon + label + selected style `border-primary bg-primary/5 text-primary`): STOREFRONT=หน้าร้าน(`building-store`) / FACEBOOK(`brand-facebook`) / LINE(`brand-line` — ยืนยันชื่อ icon จริง) / TIKTOK(`brand-tiktok`) / OTHER=อื่นๆ(`world`). default STOREFRONT. คลิก = `field.onChange(value)`.
- [ ] **Step 2: PaymentCards** — หัวข้อ "รูปแบบการชำระเงิน"; card: CASH=เงินสด(`cash`/`coin`) / TRANSFER=โอน(`building-bank`) / COD(`truck-delivery`). (แสดง 3 หลัก; PROMPTPAY/CARD/OTHER เข้าถึงผ่าน "อื่นๆ" ปุ่มเสริม หรือไว้ Phase 2 — ยืนยันกับ scope: รอบนี้ 3 พอ). default CASH.
- [ ] **Step 3: QuickForm mount** (section 3–4). ถ้า STOREFRONT ที่อยู่ซ่อน (T7 อ่าน watch salesChannel).
- [ ] **Step 4: tsc 0 + QA: เลือก card → selected ย้าย, ค่า submit ถูก.**
- [ ] **Step 5: Commit** (`Base:` Paces card + form-select docs).
> icon names ที่ไม่ชัด (brand-line/brand-tiktok) → ยืนยันมีใน iconify tabler ก่อน; ไม่มี → ถาม user (Hard Rule 12: ห้ามเดา icon).

---

## Task 7: Thai address data + `parseOrderMessage` util (TDD, no UI)

**Files:** Create `src/data/thai-address.json`, `src/lib/parse-order-message.ts`, `src/lib/__tests__/parse-order-message.test.ts`.

**Interfaces:**
- Produces: `parseOrderMessage(text: string): { name?: string; phone?: string; addressLine?: string; subdistrict?: string; district?: string; province?: string; postcode?: string }`.
- `thai-address.json` = array `{ district: string; amphoe: string; province: string; zipcode: string }` (จาก jquery.Thailand.js `db.json`).

- [ ] **Step 1: bundle data** — download `https://raw.githubusercontent.com/earthchie/jquery.Thailand.js/master/jquery.Thailand.js/database/raw_database.json` → `src/data/thai-address.json` (normalize key เป็น district/amphoe/province/zipcode). *(WTFPL — commit ได้.)*
- [ ] **Step 2: failing test** — เขียนเทสจากตัวอย่างจริง (ใน spec §1):
```ts
it('parse ชื่อ/เบอร์/รหัส/ต./อ./จ. จากข้อความแชท', () => {
  const r = parseOrderMessage('เชาวลิต เอกกุล\n6ม.4 บ้านปุหรน\nต.ช้างให้ตก อ.โคกโพธิ์\nจ.ปัตตานี\n94120\nโทร 081-7971726')
  expect(r.phone).toBe('0817971726'); expect(r.postcode).toBe('94120')
  expect(r.province).toBe('ปัตตานี'); expect(r.district).toBe('โคกโพธิ์'); expect(r.subdistrict).toBe('ช้างให้ตก')
  expect(r.name).toBe('เชาวลิต เอกกุล')
})
it('รองรับ "ชื่อผู้รับ:" + เบอร์หลายตัว (เอาตัวแรก)', () => {
  const r = parseOrderMessage('ชื่อผู้รับ: จักรสิน ชินนอก\nเบอร์โทร: 0988480695')
  expect(r.name).toBe('จักรสิน ชินนอก'); expect(r.phone).toBe('0988480695')
})
```
- [ ] **Step 3: implement** — regex heuristic: phone `/0\d[\d\s-]{7,}/`→digits (ตัวแรก); postcode `/\b\d{5}\b/`; `ต\.?\s*([^\s]+)`/`ตำบล\s*([^\s]+)`; `อ\.?`/`อำเภอ`; `จ\.?`/`จังหวัด`; name = หลัง `ชื่อผู้รับ:` / `ถึง(คุณ)?` / บรรทัดแรกที่ไม่ใช่ที่อยู่/เบอร์; addressLine = ส่วนที่เหลือ. คืน field ที่จับได้ (undefined ถ้าไม่เจอ).
- [ ] **Step 4: test PASS + tsc 0.** Run: `npx vitest run src/lib/__tests__/parse-order-message.test.ts`
- [ ] **Step 5: Commit** — `feat(quick-create): thai-address data + parseOrderMessage heuristic`

---

## Task 8: Customer block + address sheet + paste sheet + summary panel

**GATE:** safepay-ux ก่อน (Hard Rule 8). **Files:** Create `CustomerQuickBlock.tsx`, `AddressSearchSheet.tsx`, `PasteParseSheet.tsx`, `QuickSummaryPanel.tsx`; Modify `QuickForm.tsx`.

**Interfaces:** consume `control, errors`. `AddressSearchSheet` → `onSelect({subdistrict,district,province,postcode})`. `PasteParseSheet` → `onApply(parsed)` (จาก T7 `parseOrderMessage`).

- [ ] **Step 1: CustomerQuickBlock (phone-first)** — หัวข้อ "ลูกค้า" + **wand tool icon** (เปิด PasteParseSheet). ช่อง **เบอร์โทร** นำ (live search dedup — reuse logic `CustomerSelectBlock`; เจอ → chip "ลูกค้าเดิม" + auto-fill ชื่อ/ที่อยู่); ช่อง **ชื่อ** โผล่เมื่อไม่เจอ/ลูกค้าใหม่. bind `buyerName`/`buyerContact`.
- [ ] **Step 2: ที่อยู่** — แสดงเมื่อ `useWatch salesChannel !== 'STOREFRONT'`. บ้านเลข/หมู่/ถนน = `shippingAddress.line1`; **locality field อันเดียว** (`.locsel` mockup) โชว์ ต/อ/จ/รหัส ที่เลือก (ว่าง = placeholder) → แตะเปิด `AddressSearchSheet`.
- [ ] **Step 3: AddressSearchSheet** — full-screen sheet: search input (autofocus) → filter `thai-address.json` (dynamic import) ตาม district/amphoe/province/zipcode substring (จำกัด ~30 แถว) → list `ตำบล > อำเภอ > จังหวัด > รหัส`; เลือก = `onSelect` set `shippingAddress.subdistrict/district/province/postcode` + ปิด. selected แถวเดิม = สีเขียว + check.
- [ ] **Step 4: PasteParseSheet** — sheet มี textarea + ปุ่ม "แยกข้อมูล" → `parseOrderMessage` → preview ฟิลด์ที่จับได้ → "นำไปใช้" = set buyerName/buyerContact/shippingAddress.*; seller แก้ต่อได้.
- [ ] **Step 5: เพิ่มเติม (collapsible)** — ส่วนลด/หมายเหตุ/VAT (React toggle).
- [ ] **Step 6: QuickSummaryPanel** — sticky ล่าง; ย่อ `รวมทั้งสิ้น {formatThb(total)} ⌄`; จิ้ม → กาง ยอดสินค้า/ส่วนลด/VAT; ปุ่ม `บันทึกออเดอร์` `type="submit" form={formId}`.
- [ ] **Step 7: tsc 0 + QA (Task 10).**
- [ ] **Step 8: Commit** (`Base:` CustomerSelectBlock + bottom-sheet + Paces).

---

## Task 9: Command Center — BestSellerStrip

**Files:** Create `.../dashboard/components/BestSellerStrip.tsx`; Modify `dashboard/page.tsx`, `.../dashboard/components/CommandCenter.tsx`.

**Interfaces:** `BestSellerStrip` consumes `products: {id,name,price,image}[]`. tap → `router.push('/orders/new?product='+id)`.

- [ ] **Step 1: page fetch** — ใน `dashboard/page.tsx` Promise.allSettled เพิ่ม `getBestSellerProducts(shop.id, 8)` → map `{id,name,price,image}` → ส่งเข้า CommandCenter prop `bestSellers`.
- [ ] **Step 2: BestSellerStrip** — section "สินค้าขายดี" **ไม่มี border** (section ธรรมดา), แถวเลื่อน การ์ด square. `'use client'` + `useRouter`. ถ้าว่าง → ไม่ render.
> Base: `ProductGrid.tsx`/CarouselGrid การ์ด pattern.
- [ ] **Step 3: CommandCenter** — render `<BestSellerStrip products={bestSellers} />` หลัง block "คำสั่งซื้อ".
- [ ] **Step 4: tsc 0 + QA: dashboard เห็นสินค้าขายดี, จิ้ม → `/orders/new` มีสินค้านั้นในรายการ (pre-add T2).**
- [ ] **Step 5: Commit** (`Base:` ProductGrid).

---

## Task 10: QA E2E + reviewer + retro

- [ ] **safepay-reviewer** — 8-gate ทุก component (theme sourcing, Base: line, RSC nav, tsc, scope, Paces primitive grep `rg "text-\[|bg-\[rgba|#[0-9a-f]{6}" ไฟล์ที่แตะ`, react-toastify grep = 0, emoji grep = 0).
- [ ] **safepay-qa (Chrome DevTools MCP / Playwright)** ที่ `*.deepth.local:4000` (user รัน server): 
  - มือถือ (resize): จิ้มสินค้าขายดี → ไลน์ + ราคา auto → กรอกชื่อ/เบอร์(dedup)/ที่อยู่ → เลือก LINE + COD → บันทึก → order สร้าง (verify DB: salesChannel/paymentMethod/items).
  - แก้ราคาผ่าน sheet (ลด 10%) → total เปลี่ยน.
  - เลือกหน้าร้าน → ที่อยู่ซ่อน + submit ได้ (STOREFRONT rule).
  - เพิ่มรายการเอง (custom) หลายบรรทัด → บันทึก.
  - Command Center → จิ้มสินค้าขายดี → `/orders/new` pre-add.
  - Desktop (`≥lg`) → ยังเป็น POS split (ไม่ regress); font=Anuphan (no Vuexy bleed).
- [ ] **retro** (`phase-retro`) + doc-sync + push branch (ขอ user ยืนยันก่อน push/merge → prod).

---

## Self-Review (coverage)

- Spec §3 section 1–7 → T4(1) T5(2) T6(3,4) T7(5,6,7). ✓
- Spec §4.2 Command Center → T8. ✓
- Spec §4.3 best-seller query → T1. ✓
- Spec price bottom-sheet → T5. ✓
- Desktop POS คงเดิม → T3 (breakpoint restructure, ไม่แตะ ProductGrid/CartPanel). ✓
- pre-add deep-link → T2. ✓
- ไม่มี migration ✓ / ไม่แตะ createOrder-customer-STOREFRONT ✓ (reuse onSubmit เดิม).
- **Blocker gates:** T1 ยืนยัน field จริงใน schema.prisma (OrderItem.productId/order.shopId/Product.isActive); T6 ยืนยัน icon brand-line/brand-tiktok มีจริง (ไม่งั้นถาม user).

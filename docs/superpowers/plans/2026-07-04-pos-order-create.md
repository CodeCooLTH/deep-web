# POS-style Order Create — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **SafePay:** ≥3 tasks + UI → Hard Rule 4 (agent team) + Hard Rule 8 (safepay-ux gate ก่อน dev UI ทุก component). ลำดับต่อ task: safepay-developer → safepay-reviewer (8-gate) → safepay-qa. **ห้าม developer commit เอง** — Controller verify diff แล้ว commit ([[feedback_parallel_dev_agents_no_commit]]). ยึด mockup `docs/superpowers/specs/2026-07-04-pos-order-create.html` เป็น visual truth.

**Goal:** เปลี่ยนหน้า `orders/new` เป็น POS: product grid ซ้าย (แตะ=+1) + cart panel ขวา (line select2 เลือก/พิมพ์เอง+desc, accordion, footer สรุป+บันทึก), mobile bottom-sheet — โดยไม่แตะ backend.

**Architecture:** ยก ownership ของ `useFieldArray('items')` + `inc/dec/qtyByProduct/addCustomItem` จาก CartBlock ขึ้น `OrderCreateForm` (form owner) แล้วแตกเป็น presentation components (ProductGrid, CartPanel, CartLineItem, ProductCombobox) ที่รับ prop จาก form. `FormValues`/schema/`onSubmit`/`POST /api/orders` คงเดิม 100%.

**Tech Stack:** Next.js 16 · react-hook-form (`useForm`/`useFieldArray`/`useController`) · Yup · Paces (Preline 4 + Tailwind 4) · Playwright + Chrome DevTools MCP (QA)

## Global Constraints
- Surface = `src/app/(paces)/seller/(fullscreen)/orders/new` เท่านั้น
- **ไม่แตะ backend:** `POST /api/orders`, `createOrder` (order.service), Valibot validations, `FormValues` shape, fulfillmentMode derivation, STOREFRONT-hides-shipping rule (needsShipping = มีสินค้า SHIPPED **และ** `salesChannel !== 'STOREFRONT'`)
- Skin Paces primary `#236dc9`; ทุก UI = Paces primitive — **ห้าม arbitrary value** (`text-[]`/`bg-[rgba]`/hex/`z-[]` ยกเว้นจำเป็น+comment, HR7). ม่วง #7367F0 = buyer เท่านั้น
- Icons = `@iconify/react` ผ่าน `@/components/wrappers/Icon`, tabler names; รูปแตก → fallback icon (onError pattern เดียวกับ `AccountAvatar`)
- Toast = `pacesToast` (HR9); commit UI มี `Base:` line (HR3); font Anuphan (ห้าม font-mono — [[feedback_font_mono_breaks_anuphan]])
- combobox/dropdown ใน panel ที่ re-render = **custom React state ห้าม Preline hs-dropdown** ([[project_filterdropdown_reusable]])
- ผ่าน `safepay-ux` ก่อน implement ทุก component ที่มี markup (HR8)
- tsc = `node node_modules/typescript/lib/tsc.js --noEmit`; dev server user รันเอง `seller.deepth.local:4000`

---

## File Structure

| ไฟล์ | responsibility | task |
|---|---|---|
| `OrderCreateForm.tsx` (แก้) | form owner: useForm/useFieldArray + inc/dec/qtyByProduct/addCustom + POS split render + mobile sheet state | 1, 6 |
| `ProductGrid.tsx` (ใหม่) | ซ้าย: search + cards + tap=inc + qty badge | 2 |
| `ProductCombobox.tsx` (ใหม่) | select2 line: search catalog/pick/type-custom | 3 |
| `CartLineItem.tsx` (ใหม่) | 1 line: combobox + desc + stepper + price + remove | 4 |
| `CartPanel.tsx` (ใหม่) | ขวา: lines + add-custom + accordions + footer | 5 |
| `CustomerSelectBlock.tsx` / `PaymentChannelBlock.tsx` / `OrderSummaryPanel.tsx` (reuse) | render ใน accordion/footer | 5 |
| `CartBlock.tsx` (ลบ) · `ProductPickerModal.tsx` (ลบ) | แทนที่ด้วย ProductGrid + CartPanel | 7 |

### Locked contract (ทุก task ใช้ชื่อ/signature นี้เป๊ะ)
```ts
// ItemsController — helper set ที่ OrderCreateForm สร้างแล้วส่งเป็น prop ลงไป
interface ItemsController {
  fields: { id: string; productId?: string; name: string; description?: string; qty: number; price: number }[]
  inc: (product: CatalogProduct) => void       // เพิ่ม line ถ้ายังไม่มี, ไม่งั้น +1 qty
  // dec ถูกถอดออก (reviewer rework) — CartLineItem ใช้ uniform setQty แทน; grid แตะ=inc อย่างเดียว
  remove: (index: number) => void
  addCustom: () => void                        // append { productId:undefined, name:'', description:'', qty:1, price:0 }
  qtyByProduct: (productId: string) => number  // 0 ถ้าไม่อยู่ในตะกร้า
  setLineProduct: (index: number, product: CatalogProduct) => void  // pick จาก combobox → set productId/name/price/description
  setLineCustom: (index: number, name: string) => void              // พิมพ์เอง → set name, productId=undefined
}
// CatalogProduct (มีอยู่แล้วใน OrderCreateForm.tsx): { id, name, description?, price, type, fulfillmentMode, image? }
```

---

### Task 1: ยก item-array ownership ขึ้น OrderCreateForm + ItemsController

**Files:** Modify `src/app/(paces)/seller/(dashboard)/orders/new/components/OrderCreateForm.tsx`

**Interfaces:** Produces `ItemsController` (ตาม locked contract) — Task 2/3/4/5 consume

- [ ] **Step 1: เพิ่ม useFieldArray + helpers ใน OrderCreateForm** — หลัง `const { control, handleSubmit, ... } = useForm(...)` เพิ่ม (ยก logic จาก CartBlock เดิม + เพิ่ม setLineProduct/setLineCustom):

```tsx
import { useFieldArray, useWatch } from 'react-hook-form'
// ...
  const { fields, append, update, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = useWatch({ control, name: 'items' }) ?? []

  const qtyByProduct = (pid: string): number =>
    watchedItems.find((i: any) => i.productId === pid)?.qty ?? 0

  const inc = (product: CatalogProduct) => {
    const idx = watchedItems.findIndex((i: any) => i.productId === product.id)
    if (idx >= 0) update(idx, { ...watchedItems[idx], qty: watchedItems[idx].qty + 1 })
    else append({ productId: product.id, name: product.name, description: product.description ?? '', qty: 1, price: Number(product.price) })
  }
  const dec = (productId: string) => {
    const idx = watchedItems.findIndex((i: any) => i.productId === productId)
    if (idx < 0) return
    const next = watchedItems[idx].qty - 1
    if (next <= 0) remove(idx)
    else update(idx, { ...watchedItems[idx], qty: next })
  }
  const addCustom = () => append({ productId: undefined, name: '', description: '', qty: 1, price: 0 })
  const setLineProduct = (index: number, product: CatalogProduct) =>
    update(index, { ...watchedItems[index], productId: product.id, name: product.name, description: product.description ?? '', price: Number(product.price) })
  const setLineCustom = (index: number, name: string) =>
    update(index, { ...watchedItems[index], productId: undefined, name })

  const itemsCtl: ItemsController = { fields, inc, dec, remove, addCustom, qtyByProduct, setLineProduct, setLineCustom }
```
เพิ่ม `export interface ItemsController { ... }` (ตาม locked contract) ท้าย type block ของไฟล์

- [ ] **Step 2: type-check** — `node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep OrderCreateForm` → ไม่มี error (ตอนนี้ helpers ยังไม่ถูกใช้ — ปล่อยไว้ก่อน; Task 6 wire เข้า render). ถ้า noUnusedLocals บ่น → mark ใช้ชั่วคราวใน Task 6 (commit รวม Task 1+6 ถ้าจำเป็น)
- [ ] **Step 3: Controller commit** — `git commit -m "feat(pos-order): ยก useFieldArray + ItemsController ขึ้น OrderCreateForm"`

---

### Task 2: ProductGrid (ซ้าย, จาก ProductPickerModal)

**Files:** Create `src/app/(paces)/seller/(dashboard)/orders/new/components/ProductGrid.tsx`

**Interfaces:** Consumes `catalog: CatalogProduct[]`, `qtyByProduct`, `inc` (จาก ItemsController); Produces `<ProductGrid catalog qtyByProduct inc />`

**Prereq:** safepay-ux design spec ของ grid (Base: `ProductPickerModal.tsx` body grid + mockup Desktop/Tablet/Mobile)

- [ ] **Step 1: สร้าง ProductGrid** — search state + filtered + grid cards. ยึด card markup จาก mockup (`.pcard`: thumb+nm+pr+ship badge, qty badge มุมขวา). ตัวอย่างโครง (markup เต็มจาก ux spec):
```tsx
'use client'
import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import type { CatalogProduct } from './OrderCreateForm'

interface Props { catalog: CatalogProduct[]; qtyByProduct: (id: string) => number; inc: (p: CatalogProduct) => void }

export default function ProductGrid({ catalog, qtyByProduct, inc }: Props) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? catalog.filter((p) => p.name.toLowerCase().includes(q)) : catalog
  }, [catalog, search])
  // ... render: search input + grid.map(card) — แตะ card = inc(product); badge qty ถ้า qtyByProduct(p.id)>0
  //     empty state เมื่อ catalog.length===0; รูป null/แตก → fallback Icon (onError)
}
```
- [ ] **Step 2: fallback รูป** — `<img onError>` → state per card หรือ component `<ProductThumb src>` (ยืม AccountAvatar pattern) → icon `package`
- [ ] **Step 3: type-check + grep HR7** — `rg "text-\[|bg-\[rgba|#[0-9a-fA-F]{6}" ProductGrid.tsx` = 0
- [ ] **Step 4: Controller commit** — `Base: .../orders/new/components/ProductPickerModal.tsx`

---

### Task 3: ProductCombobox (select2)

**Files:** Create `src/app/(paces)/seller/(dashboard)/orders/new/components/ProductCombobox.tsx`

**Interfaces:** `<ProductCombobox value={{productId?,name}} catalog onPick={(p)=>} onCustom={(text)=>} />`

**Prereq:** safepay-ux spec (custom dropdown; **ห้าม hs-dropdown**)

- [ ] **Step 1: สร้าง ProductCombobox** — closed = field แสดง `value.name` (placeholder "เลือก/พิมพ์สินค้า"); เปิด = popup มี search input + filtered options + newrow:
```tsx
'use client'
import { useMemo, useRef, useState, useEffect } from 'react'
import Icon from '@/components/wrappers/Icon'
import type { CatalogProduct } from './OrderCreateForm'

interface Props { value: { productId?: string; name: string }; catalog: CatalogProduct[]; onPick: (p: CatalogProduct) => void; onCustom: (text: string) => void }

export default function ProductCombobox({ value, catalog, onPick, onCustom }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { // close on outside click (custom — ไม่ใช้ Preline)
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase(); return s ? catalog.filter((p) => p.name.toLowerCase().includes(s)) : catalog
  }, [catalog, q])
  const typed = q.trim()
  // render: field(onClick setOpen(true)) + (open && popup: search + options.map(onPick+close) + typed && newrow(onCustom(typed)+close))
}
```
- [ ] **Step 2: newrow** — แสดงเมื่อ `typed` ไม่ตรง option ใด → คลิก = `onCustom(typed)` + close. option คลิก = `onPick(p)` + close
- [ ] **Step 3: type-check + grep** — ไม่มี `hs-dropdown` ใน ProductCombobox; HR7 clean
- [ ] **Step 4: Controller commit** — `Base: FilterDropdown pattern (src/components/safepay/FilterDropdown) + Paces form/elements`

---

### Task 4: CartLineItem

**Files:** Create `src/app/(paces)/seller/(dashboard)/orders/new/components/CartLineItem.tsx`

**Interfaces:** `<CartLineItem index item control catalog itemsCtl errors />` — ใช้ `useController` bind `items.${index}.{description,qty,price}` + `ProductCombobox` สำหรับ name/product

- [ ] **Step 1: สร้าง CartLineItem** — combobox (onPick=`itemsCtl.setLineProduct(index,p)`, onCustom=`itemsCtl.setLineCustom(index,text)`) + description input (`register items.${index}.description`) + qty stepper (−=`dec` ถ้ามี productId ไม่งั้น setValue qty-1; ＋=inc/+1) + price input (`items.${index}.price`) + line total (qty×price) + remove (`itemsCtl.remove(index)`). markup จาก mockup `.line`
- [ ] **Step 2: qty stepper สำหรับ custom item** (ไม่มี productId → ใช้ setValue โดยตรงผ่าน control) — ระบุ: custom line stepper แก้ `items.${index}.qty` ตรง ๆ (min 1); catalog line ใช้ `inc(product)`/`dec(productId)`
- [ ] **Step 3: type-check + grep HR7** = 0
- [ ] **Step 4: Controller commit**

---

### Task 5: CartPanel (lines + accordions + footer)

**Files:** Create `src/app/(paces)/seller/(dashboard)/orders/new/components/CartPanel.tsx`; reuse `CustomerSelectBlock`/`PaymentChannelBlock`/`OrderSummaryPanel`

**Interfaces:** `<CartPanel control itemsCtl catalog errors watch subtotal ... submitDisabled />`

**Prereq:** safepay-ux spec (accordion Paces `ui/accordions` + footer)

- [ ] **Step 1: สร้าง CartPanel** — โครง:
  - header "ตะกร้า (n)"
  - scroll: `itemsCtl.fields.map((f, i) => <CartLineItem index={i} .../>)` + `<button onClick={itemsCtl.addCustom}>+ พิมพ์รายการเอง</button>` + empty state
  - accordions (custom React state `openKey`): "ลูกค้า"→`<CustomerSelectBlock>`, "ชำระเงิน/ช่องทาง"→`<PaymentChannelBlock>`, "ที่อยู่จัดส่ง" (แสดงเมื่อ `needsShipping`), "หมายเหตุ"
  - footer: `<OrderSummaryPanel>` content (subtotal/discount/VAT/total) + `<button type="submit" form={formId} disabled={submitDisabled}>บันทึกออเดอร์</button>`
- [ ] **Step 2: STOREFRONT shipping** — `const needsShipping = salesChannel !== 'STOREFRONT' && items.some(SHIPPED)` (watch salesChannel + items) → gate accordion "ที่อยู่จัดส่ง". คงตรรกะเดียวกับ commit ก่อนหน้า
- [ ] **Step 3: type-check + grep** (HR7, react-toastify=0)
- [ ] **Step 4: Controller commit** — `Base: Paces ui/accordions + apps/ecommerce order-add summary`

---

### Task 6: OrderCreateForm render — POS split + mobile bottom-sheet

**Files:** Modify `OrderCreateForm.tsx` (render) + `ProductPickerModal` import removal

**Interfaces:** Consumes ProductGrid + CartPanel + itemsCtl (Task 1-5)

- [ ] **Step 1: แทน render 4-block grid ด้วย POS split** — 
```tsx
// desktop/tablet: flex; mobile: grid เต็ม + FAB bar + sheet
const [sheetOpen, setSheetOpen] = useState(false)
// <form id={formId} onSubmit={handleSubmit(onSubmit)}>
//   <div className="flex ..."> (lg/md)
//     <div className="flex-1"><ProductGrid catalog qtyByProduct={itemsCtl.qtyByProduct} inc={itemsCtl.inc} /></div>
//     <div className="hidden md:flex w-80 ..."><CartPanel .../></div>
//   </div>
//   {/* mobile */}
//   <div className="md:hidden"> FAB bar (ตะกร้า n · ฿total) onClick setSheetOpen(true)
//        + sheetOpen && <div bottom-sheet><CartPanel .../></div> </div>
// </form>
```
markup + responsive class เต็มจาก ux spec/mockup. bottom-sheet/FAB = fixed + `z-[NN]` (comment HR7 exception)
- [ ] **Step 2: ลบการอ้าง CartBlock/ProductPickerModal** ใน OrderCreateForm; import ProductGrid + CartPanel
- [ ] **Step 3: type-check เต็ม** — `node node_modules/typescript/lib/tsc.js --noEmit` = 0
- [ ] **Step 4: Controller commit** — `Base: mockup 2026-07-04-pos-order-create.html`

---

### Task 7: ลบ CartBlock + ProductPickerModal (cleanup)

**Files:** Delete `CartBlock.tsx`, `ProductPickerModal.tsx`

- [ ] **Step 1: grep refs** — `rg -l "CartBlock|ProductPickerModal" src` → เหลือ 0 (นอกจากไฟล์ตัวเอง) ก่อนลบ
- [ ] **Step 2: `git rm` ทั้งสองไฟล์** + type-check เต็ม = 0
- [ ] **Step 3: Controller commit**

---

### Task 8: QA — Playwright + Chrome DevTools MCP

**Prereq:** reviewer 8-gate ผ่านทุก task; user รัน dev server; seed สินค้า ≥6 ตัว (มีรูป/ไม่มีรูป, SHIPPED/NO_SHIPPING)

- [ ] **Step 1: scenarios (safepay-qa @ `seller.deepth.local:4000`)**
  1. แตะการ์ด → line โผล่ขวา + badge qty; แตะซ้ำ = +1
  2. combobox: เปิด → เลือกสินค้า existing (set ราคา/desc); พิมพ์ชื่อใหม่ → custom item + กรอก desc/ราคา
  3. qty stepper −/＋ (catalog + custom), ลบ line
  4. accordion เปิด/ปิด (ลูกค้า/ชำระ/หมายเหตุ); เลือก STOREFRONT → accordion ที่อยู่หาย; เลือก FACEBOOK + สินค้า SHIPPED → accordion ที่อยู่โผล่ + บังคับ
  5. footer: ส่วนลด/VAT → total อัปเดต; ตะกร้าว่าง → ปุ่ม disabled
  6. submit → สร้างออเดอร์สำเร็จ + redirect + DB persist (items/type/shippingAddress ถูก)
  7. mobile: FAB bar → เปิด sheet → lines/accordion/checkout → ปิด sheet; tap target ≥44px
  8. รูปสินค้า null → fallback icon
- [ ] **Step 2: grep gate ทั้ง diff** — `rg "react-toastify" src/app/(paces)` (order dir) = 0; ไม่มี arbitrary value (นอกจาก z-[] ที่ comment); ไม่มี hs-dropdown ใน ProductCombobox
- [ ] **Step 3: บันทึกผล PASS/FAIL + evidence**

---

## Self-Review
**Spec coverage:** §3 layout → Task 6 ✓ · §4 components → Task 1-7 ✓ · §5.1 grid tap=+1 → Task 2 ✓ · §5.2 combobox select2 → Task 3+4 ✓ · §5.3 accordion+STOREFRONT → Task 5 ✓ · §5.4 footer → Task 5 ✓ · §6 data flow unchanged → Task 1 (คง FormValues/submit) ✓ · §7 edge cases → Task 2/3/4/5 + Task 8 QA ✓

**Placeholder scan:** โครงโค้ด + logic ครบ; markup รายละเอียด pixel มาจาก mockup + safepay-ux spec (ตาม workflow — ไม่ใช่ placeholder แต่คือ source-of-truth ที่ระบุชัด). ไม่มี TBD/TODO

**Type consistency:** `ItemsController` (inc/dec/remove/addCustom/qtyByProduct/setLineProduct/setLineCustom/fields) ใช้ชื่อเดียวทุก task; `CatalogProduct` เดิม; `<ProductCombobox onPick/onCustom>` ↔ `setLineProduct/setLineCustom` (Task 3↔4↔1)

**หมายเหตุ execution:** ทุก task ผ่าน safepay-ux (ก่อน) → safepay-developer → safepay-reviewer → (จบ) safepay-qa; **Controller commit**. branch `feat/pos-order-create` (มี spec commit แล้ว) — ยังไม่ push จน QA เขียว + user sign-off. Task 3 (ProductCombobox) เป็นชิ้นเสี่ยงสุด (custom select2) — ให้ ux + reviewer โฟกัส

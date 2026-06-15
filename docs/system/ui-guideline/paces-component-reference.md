# Paces Component Reference — seller/admin (`(paces)/**`)

> Source of truth: `theme/paces/Docs/index.html` + CSS จริงใน `theme/paces/Admin/TS/src/assets/css/custom/` + page examples ใน `theme/paces/Admin/TS/src/app/(admin)/ui/` และ `apps/ecommerce/`
> ใช้กับ **seller/admin เท่านั้น** (buyer/landing = Vuexy → `theme/vuexy/documentation.html`)
> Font = **Anuphan** (SafePay override; theme default Nunito ห้ามใช้)
> สร้างโดย safepay-ux 2026-06-15 (Hard Rule 8 — อ้างอิงก่อนทำ frontend seller/admin)

---

## 1. Buttons — `theme/paces/Admin/TS/src/assets/css/custom/_buttons.css`

| Class | padding | font | ขนาด |
|---|---|---|---|
| `.btn` (default) | `px-4 py-1.75` (16/7px) | `text-sm` | border + rounded 4px |
| `.btn.btn-lg` | `px-5 py-2.25` | `text-lg` | |
| `.btn.btn-sm` | `px-3 py-1.25` | `text-xs` | |
| `.btn.btn-icon` | 0 | — | `size-9.25` = **37px** square |
| `.btn.btn-sm.btn-icon` | 0 | — | `size-7.5` = **30px** square |

กฎ: ใส่ `class*="size-"` บน `.btn` → padding ถูก force 0 อัตโนมัติ.

สี (pattern จริง):
```tsx
<button className="btn bg-primary hover:bg-primary-hover text-white">      // solid
<button className="btn bg-primary/15 text-primary hover:bg-primary hover:text-white"> // soft (ใช้บ่อยสุด)
<button className="btn border-primary text-primary hover:bg-primary hover:text-white"> // outline
<button className="btn text-primary hover:bg-primary hover:text-white">    // ghost
<button className="btn bg-light text-dark hover:bg-light-hover">           // light/neutral
```
- icon+text: `<button className="btn bg-primary text-white"><Icon className="size-4.5"/> ข้อความ</button>`
- icon-only default 37px: `btn btn-icon ...` + icon `size-4.5`; small 30px: `btn btn-sm btn-icon` + icon `size-3`
- block: เพิ่ม `w-full`; disabled: auto `opacity-50 cursor-not-allowed`

## 2. Button Group — **ไม่มี `.btn-group` ใน Paces Tailwind**
ใช้ `inline-flex` + `rounded-*-none`:
```tsx
<div className="inline-flex">
  <button className="btn bg-light hover:text-primary rounded-e-none">ซ้าย</button>
  <button className="btn bg-light hover:text-primary rounded-none">กลาง</button>
  <button className="btn bg-light hover:text-primary rounded-s-none">ขวา</button>
</div>
```
แนวตั้ง: `inline-flex flex-col` + `rounded-b-none/rounded-none/rounded-t-none`. Split button: ปุ่มหลัก `rounded-e-none` + hs-dropdown `rounded-s-none`.
Source: `theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx`

## 3. Dropdown — Preline `hs-dropdown` (ไม่ใช่ DaisyUI) — `_dropdown.css`
```tsx
<div className="hs-dropdown relative inline-flex">
  <button type="button" className="hs-dropdown-toggle btn bg-light text-dark" aria-haspopup="menu" aria-expanded="false" aria-label="Dropdown">
    เลือก <Icon icon="tabler-chevron-down" className="hs-dropdown-open:rotate-180 transition-transform size-4" />
  </button>
  <div className="hs-dropdown-menu" role="menu" aria-orientation="vertical">
    <a className="dropdown-item" href="#">รายการ 1</a>
    <hr className="dropdown-divider" />
    <a className="dropdown-item active" href="#">รายการ active</a>
  </div>
</div>
```
- `.hs-dropdown-menu`: `bg-card border border-default-300 min-w-44 rounded p-1 shadow mt-2`, เริ่ม `hidden opacity-0`
- `.dropdown-item`: `px-3.75 py-1.5 rounded-[calc(var(--radius)*0.5)] hover:bg-default-100`
- placement: `[--placement:bottom-right]` ฯลฯ; hover: `[--trigger:hover]`; close: `[--auto-close:inside|outside|false]`
Source: `theme/paces/Admin/TS/src/app/(admin)/ui/dropdowns/page.tsx`

> ⚠️ **Preline `hs-dropdown` พังใน list/toolbar ที่ re-render** — Preline เก็บ open/close state ไว้ inline (DOM attribute) เมื่อ React re-render component (lazy-load list, เลือก filter แล้ว state เปลี่ยน) → inline-state หาย → menu `opacity` ค้าง 0 (กดได้แต่มองไม่เห็น). ใช้ได้เฉพาะ dropdown ที่ **static** (topbar, ปุ่มเดี่ยวที่ parent ไม่ re-render). dropdown ใน list/toolbar ที่ dynamic → ใช้ **FilterDropdown / custom React** (§3b). บทเรียน 2026-06-15 (order ⋮ + filter toolbar).

## 3b. FilterDropdown — shared reusable (Single Button Dropdown ที่ทน re-render)
**`src/components/safepay/FilterDropdown.tsx`** — Single Button Dropdown (หน้าตา = theme §3) แต่ขับ open/close ด้วย custom React (useState + click-outside + Escape) แทน Preline → ทน re-render ของ list/toolbar. **ใช้ตัวนี้สำหรับ filter/select ทุกหน้า `(paces)` ที่ parent re-render** (orders ✅ ใช้แล้ว; products/settings ใช้ต่อ).

```tsx
import FilterDropdown from '@/components/safepay/FilterDropdown'

<FilterDropdown
  icon="truck"              // tabler icon นำหน้าปุ่ม (ไม่ส่ง = ไม่มี icon เช่น page size)
  defaultLabel="สถานะ"      // label บนปุ่มตอนยังไม่กรอง (ไม่ส่ง = โชว์ label option ที่ match เสมอ)
  resetValue="All"          // ค่าที่ถือว่า "ยังไม่กรอง" → ปุ่ม neutral + defaultLabel
  value={current}           // ค่าที่เลือกอยู่
  options={[{ value: 'All', label: 'ทั้งหมด' }, { value: 'PENDING', label: 'รอดำเนินการ' }]}
  onChange={(v) => setX(v === 'All' ? undefined : v)}
  align="right"             // 'left'(default) | 'right' (page size ท้าย toolbar กัน overflow)
/>
```
- ปุ่ม trigger: `btn bg-light text-dark` (default) → `btn bg-primary/15 text-primary` (active เมื่อ value ≠ resetValue) + chevron rotate
- menu item: `.dropdown-item` (theme) + check icon ซ้ายเมื่อ active (ไม่ active = spacer `size-4` ให้ text ตรงกัน)
- props ครบ: `icon?` `value` `options` `onChange` `defaultLabel?` `resetValue?` `align?` `className?`
- ตัวอย่างใช้จริง (3 filter + page size): `src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx`
Base: theme `SingleButtonDropdowns` (§3) + click-outside จาก `OrderCardMenu.tsx`

## 4. Form — `_forms.css`
- input: `form-input` (37px) / `form-input-sm` (30px) / `form-input-lg` (47px). border default-300 → hover/focus default-500 → invalid danger/60
- select: `form-select` (+ `-sm`/`-lg` ขนาดเดียวกับ input)
- textarea: `form-textarea` (h-auto)
- label: `form-label` (font-semibold, mb-2)
- icon group: `<div className="input-icon-group"><span className="input-icon"><Icon/></span><input className="form-input"/></div>` (icon ซ้าย → input auto ps-10; icon ขวา → สลับลำดับ)
- input group: `<div className="input-group"><span className="input-group-text">฿</span><input className="form-input"/></div>`
- validation: `is-invalid` / `is-valid`
- checkbox/radio/switch: `form-checkbox` / `form-radio` / `form-switch` (+ `-sm`/`-lg`); checked → `bg-primary border-primary`

## 5. Table — `_table.css`
```tsx
<div className="table-wrapper">  {/* overflow-x-auto */}
  <table className="table">
    <thead><tr><th>คอลัมน์</th></tr></thead>  {/* th: font-bold px-2.5 py-3 */}
    <tbody><tr><td>ค่า</td></tr></tbody>        {/* td: px-2.5 py-3 border-b border-light */}
  </table>
</div>
```
- first/last th/td: `ps-4.5`/`pe-4.5` (18px)
- variants: `table-striped` / `table-hover` / `table-bordered` / `table-borderless` / `table-sm`
- DataTable (TanStack): `theme/paces/.../apps/ecommerce/(orders)/orders/components/OrdersList.tsx` + `@/components/table/DataTable`
- checkbox select: `form-checkbox form-checkbox-light size-4.5`
- badge ใน cell: `<span className="badge bg-success/15 text-success">สำเร็จ</span>`

## 6. Badge — `_badge.css`
- ค่า: `rounded` (4px), `px-[0.5em] py-[0.15em]`, `text-[0.75em]`, `font-semibold`
- solid: `badge bg-{color} text-white`; **soft (ใช้บ่อยสุด): `badge bg-{color}/15 text-{color}`**; outline: `badge border-{color} text-{color} border`
- pill: เพิ่ม `rounded-full`; label (squared): `badge badge-label`; fixed: `badge size-4 rounded-full bg-danger text-white`

## 7. Card — `_card.css`
```tsx
<div className="card">
  <div className="card-header"><h4 className="card-title">หัวข้อ</h4></div>
  <div className="card-body">...</div>
  <div className="card-footer">...</div>
</div>
```
| Part | classes | ค่า |
|---|---|---|
| `.card` | `bg-card rounded shadow flex flex-col h-fit` | shadow `0px 1px 4px rgba(130,143,163,.15)` |
| `.card-header` | `border-b border-dashed border-default-300 px-5 py-3.75` | **เส้นประ** (ลายเซ็น Paces) |
| `.card-body` | `p-5 flex-auto` | 20px |
| `.card-footer` | `border-t border-light px-5 py-3.75` | เส้น solid |
| `.card-title` | `text-md text-body-color font-medium` | 15px |
- variants: `card border-primary border` / `border-dashed` / `border-s-3` (left accent) / `bg-primary` / `card-collapse`
- nav-tabs ใน header: `<ul className="nav-tabs"><li><a className="nav-link active">แท็บ</a></li></ul>`

## 8. Tokens — `config/_root.css`
สี: primary `#236dc9` · secondary `#7b70ef` · success `#02bc9c` · danger `#f7577e` · warning `#f9bf59` · info `#5bc3e1` · light `#eef2f7` · dark `#313a46` · body-bg `#f6f7fb` · body-color `#4c4c5c` · card `#fff`
default: 300 `#e7e9eb` (border) · 400 `#9ba6b7` (placeholder) · 500 `#a1a9b1` (focus) · 700 `#6c757d` (muted)
radius: `--radius` 4px (`rounded`) · `rounded-lg` 8px · `rounded-full`
spacing: `--spacing-base` 20px (`gap-base`)
text: `text-2xs` 11px · `text-xs` 13px · `text-sm` 14px · `text-md` 15px · `text-base` 16px · `text-lg` 18px
shadow: `shadow` (default) · `shadow-sm` · `shadow-lg`
layout: topbar 65px · sidenav 245px (sm 75px)

## 9. Do / Don't
**DO (ลายเซ็น Paces):** `.card-header` ต้อง `border-dashed` · soft = `bg-{color}/15` · primary seller/admin = `#236dc9` ผ่าน token · grid `gap-base` · dropdown static = `hs-dropdown`, dropdown ใน list/toolbar ที่ re-render = `FilterDropdown` (§3b) · icon ใน btn `size-4.5` (sm `size-3`)
**DON'T ใน `(paces)/**`:** `text-[NNpx]` · `bg-[rgba()]`/`bg-[#hex]` · `shadow-[]` · `rounded-[Npx]` · `#7367F0` (ม่วง Vuexy) · Bootstrap classes · `.btn-group` · hardcode hex (ยกเว้น raised-FAB/safe-area + comment กำกับ)

## Source files (copy จาก)
buttons/group → `ui/buttons/page.tsx` · dropdown → `ui/dropdowns/page.tsx` · badge → `ui/badges/page.tsx` · card → `ui/cards/page.tsx` · table → `apps/ecommerce/(orders)/orders/components/OrdersList.tsx` · CSS → `assets/css/custom/_*.css` + `config/_root.css` (ทั้งหมดใน `theme/paces/Admin/TS/src/`)

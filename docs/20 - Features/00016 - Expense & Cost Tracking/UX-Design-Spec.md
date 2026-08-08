---
title: "UX Design Spec — Expense & Cost Tracking"
owner: shinobu22
status: draft
module: M00016-ExpenseCostTracking
version: "1.0"
created: 2026-07-08
tags: [feature, expense, cost, pnl, seller, ux, paces, design-spec]
related: ["[[PRD]]", "[[BRD]]", "[[SRS]]", "[[SDS]]", "[[API]]"]
---

> **โมดูล:** M00016-ExpenseCostTracking
> **ประเภทเอกสาร:** UX Design Spec (Hard Rule 8 mandatory gate output)
> **เวอร์ชัน:** 1.0
> **สถานะ:** Draft
> **เจ้าของเอกสาร:** safepay-ux

# UX Design Spec: Expense & Cost Tracking (feature 00016)

ครอบ 3 surface: **(A)** หน้า `/expenses` (3 states: GRANTED / PACKAGE_LOCKED / STAFF_NOT_ALLOWED + sidebar menu conditional render), **(B)** ช่อง "ราคาทุน" ในฟอร์มสินค้า (D-9), **(C)** toggle `staffCanViewFinance` ที่หน้าจัดการ Business shop

> ทุก component ชี้ Paces Base file ที่มีอยู่จริง — ไม่มีการออกแบบ from scratch (Hard Rule 1/7/8). อ้าง Paces docs `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`

> 🛑 **อัปเดต 2026-08-02:** หน้า `/expenses` ผ่าน redesign รอบ 2 หลังใช้งานจริงบน prod — โครง/ decision บางส่วนของ section A ด้านล่างถูกแทนที่ (ดูป้าย "อัปเดต 2026-08-02" ใน Design decisions ท้าย section A) SSOT ปัจจุบันของ UI คือ `docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md` (ครอบคลุมโครงสร้างใหม่ + P&L ที่ไหลเข้า `/sales`/command-center/ชีตมือถือ ซึ่งเป็นขอบเขตใหม่ที่เอกสารนี้ไม่ได้ครอบ) Section B/C ด้านล่าง (ช่องราคาทุนสินค้า, toggle staffCanViewFinance) **ยังตรงกับโค้ดจริง ไม่เปลี่ยน**

---

## A. หน้า `/expenses` (`(paces)/seller/(dashboard)/expenses/page.tsx`)

### User stories ที่ครอบ
FR-EXP-03/04/05 (CRUD expense + fixed category), FR-EXP-06/07/08 (P&L report + missing-cost warning), FR-EXP-09/10/11 (access gate 3 states + เมนู conditional)

### Layout — GRANTED state (ASCII wireframe, mobile-first — Paces sidebar หายที่ <1024px)

```
┌─────────────────────────────────────────────────────────┐
│ Breadcrumb: ธุรกิจ > ค่าใช้จ่าย                             │
├─────────────────────────────────────────────────────────┤
│ ┌─ card ──────────────────────────────────────────────┐ │
│ │ card-header (border-dashed)                         │ │
│ │  "รายงานกำไรขาดทุน"      [วันนี้][7วัน][30วัน][เดือนนี้][กำหนดเอง]│ │
│ │                          ← segmented .btn group →     │ │
│ │  (เมื่อกด "กำหนดเอง" → โผล่ Flatpickr range ต่อท้าย)      │ │
│ ├───────────────────────────────────────────────────────┤ │
│ │ card-body                                            │ │
│ │  [ ⚠ กำไรอาจไม่สมบูรณ์ — มีสินค้าที่ยังไม่ตั้งต้นทุน            │ │
│ │     ตั้งต้นทุนตอนนี้ → ]   ← banner, แสดงเมื่อ hasMissingCost │ │
│ │                                                       │ │
│ │  bg-light/25 border-b border-dashed (stat row)       │ │
│ │  ┌────────┬────────┬────────────┬────────┬─────────┐ │ │
│ │  │ รายได้  │ ต้นทุนขาย│ กำไรขั้นต้น  │ ค่าใช้จ่าย│ กำไรสุทธิ│ │ │
│ │  │ ฿50,000│ ฿28,000│  ฿22,000  │ ฿5,000 │ ฿17,000 │ │ │
│ │  │(success)│(neutral)│(success/danger)│(danger)│(success/danger, ตัวใหญ่สุด)│ │ │
│ │  └────────┴────────┴────────────┴────────┴─────────┘ │ │
│ │  (mobile: grid-cols-2, scroll ถ้าเกิน / desktop: grid-cols-5)│ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─ card (ExpenseForm) ──────────────────────────────────┐ │
│ │ card-header: "บันทึกค่าใช้จ่าย"                          │ │
│ │ card-body:                                            │ │
│ │   [หมวดหมู่ ▾ form-select]  [จำนวนเงิน ฿ form-input]      │ │
│ │   [วันที่เกิดค่าใช้จ่าย date]  [หมายเหตุ (optional) textarea]│ │
│ │ card-footer: [+ บันทึกค่าใช้จ่าย] (btn bg-primary, right) │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─ card (รายการค่าใช้จ่าย) ─────────────────────────────────┐ │
│ │ card-header: "รายการค่าใช้จ่าย"                          │ │
│ │ table: วันที่ | หมวดหมู่(badge) | จำนวนเงิน | หมายเหตุ | จัดการ│ │
│ │  08 ก.ค. 69 | [ค่าโฆษณา] | ฿1,500 | ค่า boost FB | (pencil)(trash)│ │
│ │  01 ก.ค. 69 | [ค่าเช่า]   | ฿8,000 | —          | (pencil)(trash)│ │
│ │ (ว่าง → SellerEmptyState icon=receipt-off)              │ │
│ └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Layout — PACKAGE_LOCKED state (แทนที่ทั้งหน้าใต้ breadcrumb)

```
┌─────────────────────────────────────────────────────────┐
│ Breadcrumb: ธุรกิจ > ค่าใช้จ่าย                             │
├─────────────────────────────────────────────────────────┤
│           ┌─ card mx-auto max-w-2xl text-center ───────┐ │
│           │        (icon lock, size 64, text-warning)  │ │
│           │                                            │ │
│           │   "ฟีเจอร์นี้อยู่ใน Business Package"          │ │
│           │   "ติดตามต้นทุนสินค้า บันทึกค่าใช้จ่าย และดู       │ │
│           │    รายงานกำไร-ขาดทุนแบบเต็มรูป — ปลดล็อกได้      │ │
│           │    ด้วย Business Package ทุก tier ที่จ่ายเงิน"    │ │
│           │                                            │ │
│           │        [ดูแพ็กเกจ Business →]  (btn bg-primary)│ │
│           └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```
CTA `[ดูแพ็กเกจ Business →]` ชี้ไป `/business` (หน้า tier grid ที่มีอยู่แล้ว — feature 00008)

### Layout — STAFF_NOT_ALLOWED state (route ตรงเข้ามาโดยไม่ผ่านเมนู)
เมนู "ค่าใช้จ่าย" **ไม่ปรากฏ** สำหรับ admin ที่ toggle ปิด (ดู §Menu ด้านล่าง) — แต่ต้อง handle กรณี type URL ตรง ด้วย card เดียวกันแบบ PACKAGE_LOCKED แต่เปลี่ยน copy/icon:

```
           │        (icon lock, size 64, text-default-400) │
           │   "ยังไม่ได้รับสิทธิ์เข้าถึงข้อมูลนี้"              │
           │   "เจ้าของร้านยังไม่เปิดให้พนักงานเห็นข้อมูลการเงิน  │
           │    ติดต่อเจ้าของร้านหากต้องการเข้าถึง"              │
           │        (ไม่มีปุ่ม action — ไม่มีอะไรให้ admin ทำเอง) │
```

### Section breakdown (prose)

- **PnlReportCard** (client island) — segmented date-range switcher (5 ปุ่ม, ปุ่ม active = `bg-primary/15 text-primary`, inactive = `bg-light text-dark`) + stat row 5 ตัวเลข ใน `card-body` เดียวกัน (ไม่แยก card) เพื่อให้ warning banner อยู่ใกล้ตัวเลขที่มันกำกับ. เปลี่ยนช่วง → fetch `GET /api/expenses/report?range=...` → re-render ตัวเลข (ไม่ full page reload)
- **Missing-cost warning banner** — แสดงเฉพาะ `hasMissingCost === true`, วางเหนือ stat row ใน `card-body` เดียวกัน, มีลิงก์ไป `/products` (filter สินค้าที่ยังไม่ตั้ง cost — ถ้ายังไม่มี filter นี้ให้ลิงก์ไป `/products` เฉย ๆ พอ ไม่ต้อง build filter ใหม่ในรอบนี้)
- **ExpenseForm** — card แยกใต้ report card เสมอ visible (ไม่ modal/ไม่ collapse) รองรับ 2 mode ผ่าน prop (`mode: 'create' | 'edit'`, `initialValues?`, `editingId?`) — คลิก "แก้ไข" ที่แถวใน list จะ scroll ขึ้นมา + prefill ฟอร์มนี้ + เปลี่ยน header เป็น "แก้ไขค่าใช้จ่าย" + ปุ่ม "ยกเลิกแก้ไข" โผล่ข้าง submit
- **Expense list table** — `.table` มาตรฐาน Paces, เรียง `expenseDate` ล่าสุดก่อน (ตรง API), คอลัมน์ "จัดการ" มี 2 ปุ่ม icon (`pencil`/`trash`) แบบ inline (ไม่ใช้ dropdown — มีแค่ 2 action ไม่จำเป็นต้องซ่อนใน `⋮`)
- **ลบ Expense** — `pacesConfirm.danger('ลบรายการนี้?', ...)` ก่อนยิง `DELETE /api/expenses/{id}`

### Theme Source Mapping

| Section | Theme/Base source file | Component | หมายเหตุ adapt |
|---|---|---|---|
| Page shell (session guard + breadcrumb) | `src/app/(paces)/seller/(dashboard)/sales/page.tsx` | RSC page pattern | reuse โครง `requireActiveShop` + `PageBreadcrumb` |
| Gate 3 states (fail-closed, ไม่ query ก่อนเช็คสิทธิ์) | `src/app/(paces)/seller/(dashboard)/inventory/page.tsx` (TFR-007 pattern) | early-return before Promise.all | ตรง SDS §NFR-Security |
| PACKAGE_LOCKED card | `src/app/(paces)/seller/(dashboard)/inventory/page.tsx:70-91` (no-shop card) | `.card.mx-auto.max-w-2xl` + icon + CTA | เปลี่ยน copy + CTA link เป็น `/business` |
| STAFF_NOT_ALLOWED card | เดียวกับ PACKAGE_LOCKED card (component เดียว, prop `variant`) | — | icon/copy/ไม่มี CTA ต่างกัน |
| PnlReportCard stat row (5 ตัวเลข) | `src/app/(paces)/seller/(dashboard)/dashboard/components/SalesReport.tsx:161-194` (headline summary grid) | `bg-light/25 border-b border-dashed grid grid-cols-N text-center` | ขยาย 3→5 คอลัมน์, ใช้ `CountUp` wrapper เดียวกัน (`@/components/wrappers/CountUp`) |
| Date-range segmented switcher | `docs/system/ui-guideline/paces-component-reference.md` §2 Button Group (`theme/.../ui/buttons/page.tsx`) | `inline-flex` + `.btn` + `rounded-*-none` | active = `bg-primary/15 text-primary`, inactive = `bg-light text-dark` |
| Custom range picker (เมื่อกด "กำหนดเอง") | `src/app/(paces)/seller/(dashboard)/sales/components/SalesDateRange.tsx` | `Flatpickr` wrapper mode=`range` | ต่างจาก sales: ไม่ผ่าน URL searchParams — local state ใน client island |
| Missing-cost warning banner | `src/app/(paces)/seller/(dashboard)/inventory/components/PackageSelector.tsx:151-169` (LOCKED banner block) | `role="alert" border-danger/20 bg-danger/10` → เปลี่ยนเป็น `border-warning/20 bg-warning/10` (เตือน ไม่ใช่ error) | icon `alert-triangle` |
| ExpenseForm (card + RHF + Yup) | `src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/components/InviteMemberForm.tsx` | `.card` > `.card-header` + `.card-body` (grid form-input/form-select) + `.card-footer` (submit btn) | HR6: `category` = native `form-select` (bind RHF) — **ห้าม hs-dropdown** |
| ช่องวันที่ `expenseDate` | `src/app/(paces)/seller/(fullscreen)/auctions/components/AuctionTimeCard.tsx:83` | `<input type="date" className="form-input">` | เปลี่ยนจาก `datetime-local` → `date` (ไม่มี time component ตรง `Expense.expenseDate @db.Date`) |
| ช่องจำนวนเงิน | `src/app/(paces)/seller/(dashboard)/products/components/ProductPriceCardV2.tsx` (input-group ฿) หรือ `docs/.../paces-component-reference.md` §4 `input-group` | `<div className="input-group"><span className="input-group-text">฿</span><input className="form-input"></div>` | — |
| Expense list table | `docs/system/ui-guideline/paces-component-reference.md` §5 Table | `.table-wrapper` > `.table` | ไม่ใช้ TanStack DataTable (list เล็ก ไม่ต้อง sort/filter/pagination ตาม spec) |
| Row action icons (แก้ไข/ลบ) | `src/app/(paces)/seller/(dashboard)/products/components/ProductsListing.tsx:194-220` | `btn btn-icon btn-sm border border-default-300` + `Icon icon="pencil"`/`icon="trash"` | — |
| ลบ confirm | `src/lib/paces-swal.ts` (`pacesConfirm.danger`) — Base ของมันคือ Sweet Alerts (Hard Rule 8) | — | ตรง `products/components/DeleteButton.tsx` เป๊ะ |
| Empty state (ไม่มี expense เลย) | `src/app/(paces)/seller/(dashboard)/_shared/SellerEmptyState.tsx` | `icon="receipt-off"` (ตรง `WalletTransactionTable.tsx` empty precedent) | `compact` mode ใน card-body |
| Toast (สร้าง/แก้/ลบสำเร็จ-ล้มเหลว) | `docs/conventions/paces-toast.md` | `pacesToast.success/error` | top-right (action-triggered) |
| Sidebar menu conditional | `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` (`applyStaffMenu`/`applyInventoryGate`) | เพิ่ม `applyExpenseMenu()` ใหม่ pattern เดียวกัน | ดูรายละเอียดด้านล่าง |

### เมนู sidebar "ค่าใช้จ่าย" — conditional render (TFR-010)

เพิ่ม child ใหม่ในกลุ่ม `STORE` ของ `sellerMenuItems` (`_seller-menu.ts`):
```ts
{ url: '/expenses', slug: 'seller:expenses', label: 'ค่าใช้จ่าย', icon: '???' } // ดู Open Question #1
```
เพิ่มฟังก์ชัน `applyExpenseMenu(items, decision: ExpenseAccessDecision)` pattern ผสมระหว่าง `applyStaffMenu` (ซ่อนทั้งเมนู) กับ `applyInventoryGate` (badge upsell):
- `decision.kind === 'GRANTED'` → แสดงปกติ ไม่มี badge
- `decision.kind === 'PACKAGE_LOCKED'` → แสดงพร้อม badge `{ className: 'bg-primary', text: 'อัปเกรด' }` (ไม่ disabled — คลิกได้ เข้าไปเห็น upsell card เอง เหมือน `applyInventoryGate` NOT_SUBSCRIBED)
- `decision.kind === 'STAFF_NOT_ALLOWED'` **หรือ** `'NO_SHOP'` → **filter child ออกจาก items ทั้งหมด** (ซ่อนสนิท ตาม AC-04 "มองไม่เห็นเมนูเลย" — mirror `applyStaffMenu` เป๊ะ)

### User flow
1. Owner login → sidebar เห็น "ค่าใช้จ่าย" (badge "อัปเกรด" ถ้ายังไม่มี package) → คลิก
2. ไม่มี package → เห็น locked card → คลิก "ดูแพ็กเกจ Business" → ไป `/business` → สมัคร → กลับมา `/expenses` เห็นเนื้อหาจริง
3. มี package → กรอกฟอร์มบันทึกค่าใช้จ่าย → submit → `pacesToast.success` → list refresh (`router.refresh()`) → report card ต้อง trigger refetch (ดู Design decision)
4. เปลี่ยนช่วงเวลารายงาน → PnlReportCard fetch ใหม่ → ตัวเลขอัปเดต + banner โผล่/หายตาม `hasMissingCost`
5. คลิก "ตั้งต้นทุนตอนนี้" ในคำเตือน → ไป `/products`
6. คลิก (pencil) ที่แถว expense → ฟอร์มด้านบน prefill + scroll ขึ้น → แก้ไข → บันทึก → `PATCH` → toast + refresh
7. คลิก (trash) → `pacesConfirm.danger` → ยืนยัน → `DELETE` → toast + refresh

### Content outline (ภาษาไทย)

| Key | Copy |
|---|---|
| Page title | ค่าใช้จ่าย |
| Report card header | รายงานกำไรขาดทุน |
| Date-range labels | วันนี้ / 7 วัน / 30 วัน / เดือนนี้ / กำหนดเอง |
| Stat labels | รายได้ / ต้นทุนสินค้า (COGS) / กำไรขั้นต้น / ค่าใช้จ่าย / กำไรสุทธิ |
| Missing-cost banner | "กำไรอาจไม่สมบูรณ์ — มีสินค้าที่ยังไม่ตั้งต้นทุนในช่วงนี้" + ลิงก์ "ตั้งต้นทุนตอนนี้ →" |
| ExpenseForm header (create) | บันทึกค่าใช้จ่าย |
| ExpenseForm header (edit) | แก้ไขค่าใช้จ่าย |
| Field: category | หมวดหมู่ค่าใช้จ่าย* (placeholder: "เลือกหมวดหมู่") |
| Category options | ค่าเช่า / ค่าแพ็กเกจ/บรรจุภัณฑ์ / ค่าโฆษณา / ค่าขนส่ง / เงินเดือน / ค่าน้ำ-ค่าไฟ / อื่นๆ |
| Field: amount | จำนวนเงิน* (placeholder: "0.00") |
| Field: expenseDate | วันที่เกิดค่าใช้จ่าย* (default = วันนี้) |
| Field: note | หมายเหตุ (ไม่บังคับ) |
| Submit button | + บันทึกค่าใช้จ่าย / บันทึกการแก้ไข |
| Cancel edit | ยกเลิกแก้ไข |
| List header | รายการค่าใช้จ่าย |
| Table columns | วันที่ / หมวดหมู่ / จำนวนเงิน / หมายเหตุ / จัดการ |
| Empty state | ยังไม่มีรายการค่าใช้จ่าย / เริ่มบันทึกค่าใช้จ่ายแรกของร้านได้เลย |
| Delete confirm | "ลบรายการค่าใช้จ่ายนี้?" / "ลบแล้วกู้คืนไม่ได้" |
| Locked (PACKAGE_LOCKED) title | ฟีเจอร์นี้อยู่ใน Business Package |
| Locked body | ติดตามต้นทุนสินค้า บันทึกค่าใช้จ่าย และดูรายงานกำไร-ขาดทุนแบบเต็มรูป — ปลดล็อกได้ด้วย Business Package ทุกแพ็กเกจที่จ่ายเงิน |
| Locked CTA | ดูแพ็กเกจ Business |
| STAFF_NOT_ALLOWED title | ยังไม่ได้รับสิทธิ์เข้าถึงข้อมูลนี้ |
| STAFF_NOT_ALLOWED body | เจ้าของร้านยังไม่เปิดให้พนักงานเห็นข้อมูลการเงิน ติดต่อเจ้าของร้านหากต้องการเข้าถึง |
| Toast success (create) | บันทึกค่าใช้จ่ายสำเร็จ |
| Toast success (edit) | แก้ไขค่าใช้จ่ายสำเร็จ |
| Toast success (delete) | ลบค่าใช้จ่ายแล้ว |
| Toast error (generic) | เกิดข้อผิดพลาด กรุณาลองใหม่ |
| Sidebar menu badge (locked) | อัปเกรด |

### Edge states ที่ต้องออกแบบ
- **Empty expense list** → `SellerEmptyState` compact, `icon="receipt-off"`
- **P&L ทุกช่วงไม่มีข้อมูลเลย** (orderCount=0) → แสดง ฿0 ทุกช่อง (ไม่ error, ตาม TFR-006) ไม่ต้อง empty-state แยก
- **Loading** (เปลี่ยน date-range) → PnlReportCard แสดง skeleton/spinner บน stat row เดิม (ไม่ใช่ blank flash) — ใช้ opacity-50 + `Icon icon="refresh" className="animate-spin"` เหมือน submit spinner pattern
- **Error** (fetch report ล้มเหลว) → `pacesToast.error('โหลดรายงานไม่สำเร็จ กรุณาลองใหม่')` + ค้าง state เก่าไว้ (ไม่ล้างตัวเลข)
- **NO_SHOP** (seller ใหม่มากยังไม่มี active shop) → มักไม่เกิดจริง (auto-create Personal shop) — ถ้าเกิด ใช้ card เดียวกับ inventory no-shop pattern (`icon="building-store"`, CTA `/shop`)

### Design decisions + rationale

> 🛑 **อัปเดต 2026-08-02 — 3 decision ด้านล่างถูกแทนที่แล้วหลัง redesign บน prod จริง** (feedback ใช้งานจริง 2026-08-02) SSOT ของ UI ปัจจุบันคือ `docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md` — ส่วนที่เหลือของเอกสารนี้ (สีตัวเลข, segmented button-group, PACKAGE_LOCKED card, ช่องราคาทุนสินค้า, toggle staffCanViewFinance) **ยังใช้ตรงตามที่ระบุ ไม่เปลี่ยน**

- ~~**ExpenseForm dual-mode component เดียว (ไม่แยก modal edit)**~~ → **แทนที่ด้วย `ExpenseFormModal.tsx`** (การ์ดแปะหน้าถูกลบทิ้ง) — modal shell เดียว ปรับ CSS ตาม breakpoint: **< 640px = bottom sheet, ≥ 640px = กล่องกลางจอ** ยังคง dual-mode create/edit ในไฟล์เดียวตามเจตนาเดิม (ไม่ได้ทิ้ง pattern `ProductFormV2` — แค่เปลี่ยน container จากการ์ดที่แปะอยู่ตลอดเป็น modal) **เหตุผลที่เปลี่ยน:** การ์ดฟอร์มแปะอยู่ท้ายหน้าตลอดเวลา (แม้ไม่ได้เพิ่ม/แก้อะไร) กินพื้นที่จอมือถือและทำให้ลำดับความสำคัญของหน้าสับสน (ฟอร์มไม่ใช่สิ่งที่ผู้ใช้ดูบ่อยที่สุด — รายงาน P&L คือ) เห็นชัดหลัง user ใช้งานจริงบน prod
- ~~**P&L report ไม่ auto-refetch เมื่อบันทึก expense ใหม่**~~ → **แก้ที่ root cause แทน** — `ExpenseWorkspace.tsx` (ใหม่) ยกช่วงเวลา (`range`) ขึ้นเป็น state เดียวของทั้งหน้า แล้ว fetch `GET /api/expenses/report` (ตอนนี้คืนทั้ง `report`+`expenses[]` ในก้อนเดียว, ดู API.md §4.5) ทุกครั้งที่เปลี่ยนช่วง **หรือ** mutate สำเร็จ (`mutationCount` state trigger `useEffect` เดิม) — ไม่ต้องมี "requirement ให้ developer อย่าลืม sync" อีกต่อไปเพราะโครงสร้างบังคับให้ sync โดยธรรมชาติ (ไม่มีทางที่ report กับ expenses คนละช่วงกันได้อีกแล้ว)
- ~~**ไม่ทำ filter/search บน expense list**~~ → **เพิ่ม filter หมวด + ค้นหาหมายเหตุ + "โหลดเพิ่ม"** (`ExpenseList.tsx`) — ชิปหมวด (≥sm) / ปุ่มเปิดแผ่นเลือก `ExpenseCategoryFilterSheet` (<sm), ช่องค้นหา `note` แบบ client-side filter, แสดงทีละ 10 รายการ + ปุ่ม "โหลดเพิ่ม" **เหตุผลที่เปลี่ยน:** สมมติฐานเดิม ("list เล็ก บันทึกมือทีละรายการ ไม่ต้อง filter") ผิดเมื่อเจอข้อมูลจริงบน prod — ร้านที่ใช้งานจริงสะสมหลายสิบรายการต่อเดือน การไล่หาด้วยตาอย่างเดียวใช้ไม่ได้ + จัดกลุ่มตามวันพร้อมยอดรวมรายวันแทนตาราง 5 คอลัมน์เดิม (ตารางล้นจอมือถือ)

- **สีตัวเลข (success/danger/neutral)** — reuse token semantics ที่ตั้งไว้แล้วทั่ว seller (`SalesReport.tsx` revenue=success, `WalletTransactionTable.tsx` TOPUP=success/DEDUCT=danger) ไม่ใช่ Impeccable "Verified-Green #28C76F" ของฝั่ง buyer/Vuexy (คนละ token คนละบริบท — Paces success token `#02bc9c`) Revenue=success · COGS/ต้นทุน=neutral (`text-default-700`) · Total Expense=danger (เงินไหลออก, mirror DEDUCT) · Gross/Net Profit=**dynamic** (success ถ้า ≥0, danger ถ้าติดลบ — ป้องกันกรณี net loss ที่ business จริงอาจเกิด แม้ PRD ไม่ได้พูดถึง edge นี้ตรง ๆ)
- **Segmented button-group แทน hs-dropdown สำหรับ date-range switcher** — PnlReportCard เป็น client island ที่ re-render ทุกครั้งเปลี่ยนช่วง → ถ้าใช้ hs-dropdown จะชน bug ที่บันทึกไว้แล้ว (§3 component reference: "hs-dropdown พังใน list/toolbar ที่ re-render") — ปุ่มกลุ่มแบบ Button Group (§2) robust กว่า ไม่มี Preline inline-state ให้หาย (ย้ายจาก `PnlReportCard` มาเป็น `ExpenseToolbar` แยกต่างหากหลัง redesign — ยัง component pattern เดิม)
- **PACKAGE_LOCKED และ NOT_SUBSCRIBED/LOCKED_RENEWAL_FAILED/quota-locked รวมเป็น card เดียว** — ตรง `resolveExpenseAccess()` ที่ collapse ทุกเหตุผลเป็น `PACKAGE_LOCKED` เดียว (SDS §4.1) UI ไม่ควร fork มากกว่าที่ backend แยกให้

**การขยาย scope ที่ไม่เคยอยู่ใน design spec ฉบับนี้เลย** (P&L ไหลเข้าหน้ายอดขาย 3 surface — `/sales`, การ์ด command center, ชีตเต็มจอมือถือ; ดู PRD §3.8/BRD FR-EXP-12) **ไม่ได้ออกแบบในเอกสารนี้** — เอกสารต้นทางคือ `docs/superpowers/specs/2026-08-02-expenses-redesign-design-spec.md` ทั้งฉบับ (ผ่าน `safepay-ux` + Impeccable critique/distill รอบใหม่)

---

## B. ช่อง "ราคาทุน" ในฟอร์มสินค้า (D-9, FR-EXP-01)

### ตำแหน่ง
เพิ่มการ์ดใหม่ `ProductCostCardV2.tsx` วางต่อจาก `ProductPriceCardV2` ใน `ProductFormV2.tsx` (ราคาขายกับราคาทุนอยู่ติดกัน — เห็น margin ได้ทันที)

### Layout — ไม่มี Business Package (disabled + badge)

```
┌─ px-3 py-2.5 (การ์ดเดียวกับ ProductStockCardV2 shell) ──┐
│ ราคาทุน            [(lock) อัปเกรดเป็น Business]  ← badge  │
│ [ ฿ ______ ]  ← form-input disabled (opacity-50, cursor-not-allowed)│
│ ราคาทุนเป็นฟีเจอร์ Business Package —                     │
│ อัปเกรดเพื่อดูกำไรต่อสินค้า →  (ลิงก์ไป /business)          │
└─────────────────────────────────────────────────────┘
```

### Layout — มี Business Package ACTIVE (enabled + margin)

```
┌────────────────────────────────────────────────────┐
│ ราคาทุน                                              │
│ [ ฿ 150.00 ]  ← form-input ปกติ                       │
│ กำไรต่อชิ้น: ฿150.00 (43%)   ← แสดงเมื่อกรอกทั้ง price+cost│
│  (text-success ถ้า margin>0 / text-danger ถ้า margin≤0)│
└────────────────────────────────────────────────────┘
```

### Theme Source Mapping

| Section | Base source | หมายเหตุ |
|---|---|---|
| Card shell + label pattern | `src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx` (px-3 py-2.5 shell) | domain component เดิมไม่มี 1:1 theme equivalent — ระบุไว้แล้วใน comment ของไฟล์ต้นทาง |
| ช่องราคาทุน (input-group ฿) | `src/app/(paces)/seller/(dashboard)/products/components/ProductPriceCardV2.tsx` (฿ prefix pattern) หรือ `docs/.../paces-component-reference.md` §4 `input-group` | ใช้ `input-group` แบบมีกรอบ (ต่างจาก price ที่ borderless — cost เป็น secondary field ไม่ใช่ hero) |
| Badge "อัปเกรดเป็น Business" | `src/app/(paces)/seller/(dashboard)/inventory/page.tsx:170-181` (badge แพ็กเกจ pattern) + `_seller-menu.ts` applyInventoryGate badge | `badge bg-primary/15 text-primary inline-flex items-center gap-1` + icon `lock` |
| Upsell hint link | `src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx:110-120` (lowStockThreshold PRO-gate hint) | ตรงเป๊ะ — pattern "icon lock + text-default-400 + ลิงก์ font-bold underline" |
| disabled input styling | native `disabled` attr + Paces `_forms.css` auto `opacity-50 cursor-not-allowed` | ไม่ต้อง custom CSS |
| Margin display | ไม่มี 1:1 precedent — คำนวณ client-side (`price - cost`, `%` = `(price-cost)/price*100`) | Domain calc, ไม่ใช่ UI primitive ใหม่ — แค่ `<p>` ธรรมดา สี success/danger ตาม token เดิม |

### Backend gate ที่ UI ต้อง sync
`isCostEditAllowed(shop)` (TFR-001) ต้องถูก resolve ที่ RSC parent (`new-v2/page.tsx`/`[id]/edit/page.tsx`) แล้วส่งเป็น prop `costEditAllowed: boolean` เข้า `ProductFormV2` → ส่งต่อ `ProductCostCardV2` — mirror เป๊ะกับที่ `isProActive` ถูกส่งเข้า `ProductStockCardV2` อยู่แล้ว ไม่ต้องคิด pattern ใหม่

### Content outline
| Key | Copy |
|---|---|
| Label | ราคาทุน |
| Badge (locked) | อัปเกรดเป็น Business |
| Hint (locked) | ราคาทุนเป็นฟีเจอร์ Business Package — อัปเกรดเพื่อดูกำไรต่อสินค้า → |
| Margin label | กำไรต่อชิ้น |
| Placeholder | 0.00 |

### Design decisions
- **`฿0` อนุญาต** (validation `minValue(0)` ต่าง `price` ที่ `minValue(0.01)`) — ไม่ต้องมี UI พิเศษ แค่ไม่ reject การกรอก 0
- **Margin คำนวณ client-side only** (ไม่ยิง API) — real-time ตาม `watch('price')`/`watch('cost')`
- **แสดง field เสมอ ไม่ซ่อน** ตาม D-9 ชัดเจน — ต่างจาก `lowStockThreshold` ที่ซ่อนเมื่อไม่ PRO เจตนา design ต่างกัน user ยืนยันแล้วว่าต้อง "แสดงเสมอ" สำหรับ cost field โดยเฉพาะ

---

## C. Toggle `staffCanViewFinance` (FR-EXP-10)

### ตำแหน่ง
เพิ่มใน `src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/page.tsx` (หน้า "สมาชิกธุรกิจ" ที่มีอยู่แล้ว, owner-only section ด้านบน — จุดเดียวที่มีทั้ง shop context + owner check + BUSINESS-only guard พร้อมอยู่แล้ว)

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Breadcrumb: ธุรกิจ > สมาชิก — {shopName}                   │
├─────────────────────────────────────────────────────────┤
│ [LockedStateBanner ถ้า shop ถูกล็อก — เดิม]                │
│                                                           │
│ ┌─ card (ใหม่ — FinanceVisibilityToggle) ───────────────┐ │
│ │ card-body flex items-center justify-between            │ │
│ │  (eye) ให้พนักงานเห็นข้อมูลการเงิน       [○────] switch  │ │
│ │  รายงานกำไร-ขาดทุนและรายการค่าใช้จ่ายของร้าน — เริ่มต้นปิด  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ [card เชิญพนักงาน — เดิม]                                  │
│ [CurrentMembersTable — เดิม]                              │
└─────────────────────────────────────────────────────────┘
```
แสดงเฉพาะ `isOwner === true` (เหมือน card เชิญพนักงานที่มี `{isOwner && (...)}` อยู่แล้วในไฟล์เดิม)

### Theme Source Mapping

| Section | Base source | หมายเหตุ |
|---|---|---|
| Card shell | `src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/page.tsx:100-109` (card เชิญพนักงานที่มีอยู่แล้วในไฟล์เดียวกัน) | วางเหนือ card เชิญพนักงาน |
| Toggle switch | `src/app/(paces)/seller/(dashboard)/products/components/ProductStockCardV2.tsx:53-64` (`form-switch` checkbox controlled) | domain pattern เดิม (ไม่มี 1:1 theme equivalent, ระบุ comment ไว้แล้วในไฟล์ต้นทาง — `_forms.css` .form-switch) |
| Confirm ก่อนเปิด | `src/lib/paces-swal.ts` (`pacesConfirm.warning`) | ใช้เฉพาะตอนเปลี่ยนจาก false→true (เปิด = risk) — ปิดไม่ต้อง confirm |
| PATCH fetch pattern | `src/app/(paces)/seller/(dashboard)/inventory/components/PackageSelector.tsx` (`handleConfirm` — confirm+fetch+toast+router.refresh) | adapt: ไม่มี preConfirm ใน dialog (fetch แยกหลัง confirm resolve) |
| Toast ผล | `docs/conventions/paces-toast.md` | `pacesToast.success('เปิด/ปิดสิทธิ์ดูข้อมูลการเงินแล้ว')` |

### User flow
1. Owner เข้า `/business/{shopId}/invites` → เห็น toggle (default ปิด)
2. กดเปิด → `pacesConfirm.warning('เปิดให้พนักงานเห็นข้อมูลการเงิน?', 'ผู้ดูแล (admin) ของร้านนี้จะเห็นรายงานกำไร-ขาดทุนและรายการค่าใช้จ่ายทั้งหมด')`
3. ยืนยัน → `PATCH /api/business/shops/{shopId}/finance-visibility { staffCanViewFinance: true }` → toast success → toggle reflect true
4. ยกเลิก → toggle กลับไป false (ไม่ยิง API)
5. กดปิด (true→false) → ยิง PATCH ตรง ไม่ confirm (ปิด = ปลอดภัยกว่าเดิม)

### Content outline
| Key | Copy |
|---|---|
| Toggle label | ให้พนักงานเห็นข้อมูลการเงิน |
| Toggle description | รายงานกำไร-ขาดทุนและรายการค่าใช้จ่ายของร้าน — เริ่มต้นปิด |
| Confirm title | เปิดให้พนักงานเห็นข้อมูลการเงิน? |
| Confirm text | ผู้ดูแล (admin) ของร้านนี้จะเห็นรายงานกำไร-ขาดทุนและรายการค่าใช้จ่ายทั้งหมด |
| Confirm button | เปิดใช้งาน |
| Toast (เปิด) | เปิดสิทธิ์ดูข้อมูลการเงินแล้ว |
| Toast (ปิด) | ปิดสิทธิ์ดูข้อมูลการเงินแล้ว |

### Edge states
- **Shop locked** (`packageLockedAt !== null`) — toggle ยังกดได้หรือไม่? SRS ไม่ระบุชัด — เสนอ: **disabled เมื่อ locked** (สอดคล้องหลักการ "locked shop = read-only ในทุก business feature" ที่ TFR-011 อ้างถึง) — ดู Open Question #3
- **PATCH ล้มเหลว** (403 NOT_OWNER — ไม่ควรเกิดเพราะซ่อนไว้แล้วด้วย `isOwner`, แต่ defense-in-depth) → `pacesToast.error('ไม่สามารถเปลี่ยนสิทธิ์ได้')` + revert switch state

---

## Resolved Decisions (user ยืนยันแล้ว — 2026-07-08)

1. ✅ **Icon เมนู sidebar "ค่าใช้จ่าย"** = **`report-money`** (tabler)
2. ✅ **Icon ต่อหมวดค่าใช้จ่าย (7 หมวด)** — มี icon ต่อหมวด ตาม mapping ด้านล่าง (developer verify กับ tabler set ก่อนใช้):

   | หมวด | value | tabler icon |
   |---|---|---|
   | ค่าเช่า | `RENT` | `building-store` |
   | ค่าบรรจุภัณฑ์ | `PACKAGING` | `package` |
   | ค่าโฆษณา | `ADVERTISING` | `speakerphone` |
   | ค่าขนส่ง | `SHIPPING` | `truck` |
   | เงินเดือน | `SALARY` | `users` |
   | ค่าน้ำ-ค่าไฟ | `UTILITIES` | `bolt` |
   | อื่นๆ | `OTHER` | `dots` |

   → เพิ่ม `EXPENSE_CATEGORY_ICON: Record<ExpenseCategory, string>` ใน `src/lib/expense.ts` คู่กับ `EXPENSE_CATEGORY_LABEL_TH`; badge ในตาราง list แสดง `<Icon> + label` (badge เดียวมี icon นำหน้า)
3. ✅ **Toggle `staffCanViewFinance` เมื่อ shop locked** = **disabled ตอน lock** (สอดคล้อง locked=read-only)
4. ✅ **ลิงก์ missing-cost warning banner** = **ไป `/products` เฉย ๆ** (ไม่ทำ filter `?missingCost=1` ในรอบนี้)

---

*Reference files ที่อ้างอิงทั้งหมดตรวจสอบว่ามีจริงแล้ว — ไม่มี component ใดออกแบบ from scratch (Hard Rule 1/7/8 ครบ)*

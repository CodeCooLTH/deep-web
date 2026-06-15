# Seller Mobile — /orders, /products, /shop (mobile-friendly)

**วันที่:** 2026-06-15
**Branch:** feat/seller-mobile-responsive
**สถานะ:** design approved (user เคาะผ่าน mockup ที่ฉีดด้วย Paces token จริง 2026-06-15)

## Goal
ทำ 3 หน้า seller ให้ mobile-friendly ต่อจากงาน command center: **/orders = redesign เต็ม**,
**/products + /shop = polish**. ยึด Paces primitive (Hard Rule 7), แตะ ≥44px, Paces น้ำเงิน
(ไม่ใช่ส้ม Shopee / ม่วง Vuexy).

## Root context (ทำไม)
- Order list เดิม = การ์ดอัดแน่นเหมือน table desktop (header หนา + line-item ×2 + breakdown +
  footer 4 ปุ่ม) → สูง/อ่านยากบนมือถือ. มี arbitrary `text-[13px]/[11px]` (ผิด Hard Rule 7).
- stat cards (OrdersStatCard ×5) **ซ้ำซ้อน 100%** กับ status filter tabs ที่มี count อยู่แล้ว
  ใน `OrdersList.tsx` (tab กดกรองได้ + โชว์ count) → mobile ตัด stat cards ทิ้ง.
- ref ที่ user ส่ง = Shopee "การซื้อของฉัน" (tabs เป็น primary nav + การ์ด status/สินค้า/action).
  ตาม Hard Rule 6: เอา **IA/layout ตาม Shopee** แต่ **skin = Paces น้ำเงิน**.

## /orders — redesign (งานหลัก)

### A. Layout มือถือ (Shopee-IA)
`[title "คำสั่งซื้อ" + 🔍] → [status tabs (sticky, scroll, count badge)] → [order cards]`
- **ตัด OrdersStatCard ออกบนมือถือ** (เหลือ desktop ≥lg). ใช้ filter tab ที่มี count แทน.
- **status tabs = พระเอก:** มีอยู่แล้วใน `OrdersList.tsx` (underline + count badge). มือถือ:
  ทำให้ prominent + sticky-top; active = `text-primary border-primary` + count badge `bg-primary/15`.
  ห้ามสีส้ม Shopee.

### B. OrderCard → Shopee-style (Paces skin)
แทน OrderCard เดิม (เก็บ logic/props เดิม: `order: OrderRow`, `onCancelRequest`):
- ใช้ Paces `.card` primitive (เลิก `rounded-lg border` + arbitrary `text-[13px]/[11px]`).
- โครง:
  - **หัว** (เส้นประคั่นล่าง `border-b border-dashed border-default-300`): avatar/icon + ชื่อลูกค้า
    (`buyerName ?? buyer`) + tag (`✓ ลูกค้าเดิม @username` success / `ยังไม่ยืนยัน` default) ‹ขวา›
    **สถานะ** (สี semantic ตาม STAT map: warning/primary/success/danger).
  - **แถวสินค้า:** รูปสินค้าชิ้นแรก (`size-14 rounded-md` + placeholder icon) + ชื่อ (`line-clamp-2`)
    + variant/desc + `x{qty}` + `฿{price}` ขวา. ถ้า >1 รายการ → บรรทัด `+ อีก N รายการ` (ลิงก์ detail).
  - **สรุป** (เส้นประคั่นบน): `รวม {N} รายการ: ฿{total}` ขวา, total bold.
  - **ปุ่มล่างขวา** (`flex justify-end gap-2`): `⋮` (OrderCardMenu) + **ส่ง SMS** (SendSmsButton compact,
    เฉพาะ non-terminal) + **ดูรายละเอียด** (`btn btn-sm bg-primary text-white`). ทุกปุ่ม min-h-11.
- **การแตะ:** ปุ่มชัดเจนแล้ว → ไม่ต้อง stretched-link ทั้งการ์ด (เก็บ "ดูรายละเอียด" เป็น primary action
  เหมือน ref "ติดต่อผู้ขาย"). คัดลอกลิงก์ → ย้ายเข้า `⋮` (toast feedback).

### C. Hard Rule 7 fixes
`OrderCard.tsx` L212 `text-[13px]`→`text-sm`, L300 `text-[11px]`→`text-xs`.

## /products — polish
- `ProductsListing.tsx`: แก้ arbitrary `text-[14px]/[12px]/[10px]` (L334–355) → token (`text-sm/text-xs`);
  จัดแถวสินค้าให้แน่น/อ่านง่ายบนมือถือ (รูป + ชื่อ + ราคา + status badge + action compact).
- `ProductStats`: ถ้า stack เต็มแถว → grid 2 คอลัมน์มือถือ (เหมือนแนว orders) — verify ก่อนว่าซ้ำ tab/filter ไหม.

## /shop — polish เบา
- ฟอร์ม single-column ใช้ได้แล้ว — กระชับ spacing section, input สบายตา, ยืนยัน Paces card mood.
  แก้ arbitrary value ถ้าเจอ.

## Theme Source Mapping (Base:)
| ส่วน | Base |
|---|---|
| OrderCard (card/header/footer/dashed) | theme/paces/Admin/TS/src/assets/css/custom/_card.css |
| OrderCard product/summary row | theme/paces/.../apps/ecommerce/(orders)/order-details/components/OrderSummary.tsx |
| OrderCardMenu (dropdown) | theme/paces/.../apps/ecommerce/(orders)/order-details/components/CustomerDetails.tsx + _dropdown.css |
| status tabs / OrdersList | theme/paces/.../apps/ecommerce/(orders)/orders/components/OrdersList.tsx |
| ProductsListing rows | theme/paces/.../apps/ecommerce/(products)/... (existing Base ในไฟล์) |

## Acceptance
- มือถือ (390px) /orders: ไม่มี stat cards; tabs sticky+count; การ์ด compact Shopee-style Paces-skin;
  เห็น ≥3 ออเดอร์/จอ; ปุ่ม SMS/ดูรายละเอียด แตะได้ ≥44px.
- ไม่มี arbitrary value/hardcode hex/สีส้ม-ม่วง ในไฟล์ที่แตะ (grep ผ่าน).
- desktop ≥lg: stat cards ยังอยู่ (ไม่ regression).
- tsc 0 errors; DevTools visual QA ผ่านทุกหน้า.

## Commit boundary
1. /orders OrderCard redesign + tabs emphasis + ตัด stat cards มือถือ + Hard Rule 7
2. /products polish
3. /shop polish

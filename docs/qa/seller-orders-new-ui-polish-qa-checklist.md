# QA Checklist — Seller "สร้างคำสั่งซื้อ" UI Polish (`/orders/new`)

> reusable regression checklist · QA run 2026-07-03 (UI polish: Paces token fix, tap target ≥44px, ProductPickerModal responsive, shipping asterisk, grid tablet)
> รันที่ `seller.deepth.local:4000` (user รัน dev server เอง) · test bypass: `0000000001`/`123456`
> ไฟล์ที่แก้: `CartBlock.tsx`, `CustomerSelectBlock.tsx`, `OrderCreateForm.tsx`, `OrderSummaryPanel.tsx`, `ProductPickerModal.tsx`, `_shared/FullscreenBackButton.tsx`

## ⚠️ ก่อนเทสทุกครั้ง (pre-flight)
- [ ] dev server ขึ้นที่ port 4000 (`curl -s http://seller.deepth.local:4000/ -o /dev/null -w "%{http_code}"` = 2xx/3xx)
- [ ] login seller (`0000000001`/`123456`) — มี shop + อย่างน้อย 1 product (ใช้ product ที่ `fulfillmentMode=SHIPPED` เพื่อเทส shipping sub-block)
- [ ] **ถ้าต้อง QA จริงจากการ resize เบราว์เซอร์ (375/768px) ต้องมี `resize_page`/viewport-override tool ใน MCP session — เช็คก่อนเริ่ม** (2026-07-03 run: ไม่มี tool นี้ → mobile/tablet verify ผ่าน code-audit breakpoint แทน ไม่ใช่ live render, ดู CARRY ท้ายไฟล์)

## A. Render/responsive (desktop live-verified 1800×904; mobile/tablet = code-audit)
- [ ] Desktop ≥lg (1024px+): 2 คอลัมน์ (`grid gap-5 lg:grid-cols-3` — left `lg:col-span-2` = 3 blocks, right `lg:col-span-1` = summary sticky), ไม่มี horizontal scroll
- [ ] Mobile <lg: single column + sticky bottom bar (`fixed bottom-0 inset-x-0 lg:hidden`) ปุ่ม "บันทึกออเดอร์" เต็มกว้าง (`min-h-12 w-full`)
- [ ] Tablet 768px: ไม่มี layout แตก (ยังอยู่ใน `<lg` branch = single column ตาม breakpoint code)
- [ ] เปิด ProductPickerModal ที่ <640px (`sm`): header เป็น 2 แถว (`flex-col ... sm:flex-row`) — แถว 1 = title+close, แถว 2 = search เต็มกว้าง; sm+ = 1 แถว (title | search w-64 | close)
- [ ] grid สินค้าใน modal: `grid-cols-2` <640px, `sm:grid-cols-3` (tablet, ใหม่จาก fix #5), `md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`

## B. Paces token fix
- [ ] ป้าย "(อัตโนมัติ)" ใน summary panel = `text-2xs` (11px) ไม่ใช่ `text-[10px]` arbitrary
- [ ] ปุ่มย้อนกลับ header = `text-default-700` (ไม่ใช่สีอื่น/arbitrary)

## C. Tap target ≥44px (วัดด้วย `getBoundingClientRect()`)
- [ ] ปุ่มย้อนกลับ header (`FullscreenBackButton`) = 44×44 (`w-11 h-11`)
- [ ] toggle "ค้นหาลูกค้าเดิม" / "เพิ่มลูกค้าใหม่" = ≥44 สูง (`min-h-11`)
- [ ] ปุ่ม "เปลี่ยน" (เปลี่ยนลูกค้าที่เลือก) = ≥44 สูง (`min-h-11`)
- [ ] ปุ่มลบรายการ (x) ใน CartBlock = 44×44 (`!size-11` + `shrink-0`)
- [ ] ปุ่มปิด ProductPickerModal = 44×44 (`!size-11`)
- [x] ปุ่ม +/- stepper **ในตะกร้า** (นอก modal, `CartBlock.tsx` บรรทัด ~199/296) = 44×44 (`!size-11`) — **✅ FIXED + RE-VERIFIED 2026-07-03 (re-check run):** เพิ่ม `shrink-0` ที่ปุ่ม stepper แล้วทั้ง 4 จุด (physical variant บรรทัด 203/219, custom-item variant บรรทัด 304/323). Live-measure ผ่าน `getBoundingClientRect()` (physical variant, product "Conan Book EP 1"): `ลดจำนวน` = **44×44**, `เพิ่มจำนวน` = **44×44** (เดิม bug วัดได้ 31.77×44). custom-item variant = code-identical (grep confirm `shrink-0` มีครบ) ยังไม่ได้ live-measure แยก — ดู carry
- [ ] ปุ่ม +/- stepper **ในการ์ด modal** (`ProductPickerModal.tsx` "ในตะกร้า" mini-stepper) = 30×30 โดยตั้งใจ (`btn-sm btn-icon`, ไม่ใช่ 44 — ยกเว้นตามสเปก) — ยืนยันแล้ว 30×30 ถูกต้อง

## D. Shipping sub-block (โผล่เมื่อ cart มีสินค้า fulfillmentMode=SHIPPED)
- [ ] เพิ่มสินค้าที่ต้องจัดส่ง → sub-block "ที่อยู่จัดส่ง" + badge "มีสินค้าที่ต้องจัดส่ง" โผล่
- [ ] label "ที่อยู่/บ้านเลขที่+ถนน", "จังหวัด", "รหัสไปรษณีย์" มี asterisk `*` สีแดง (`text-danger`)
- [ ] helper text "* จำเป็นเมื่อออเดอร์ต้องจัดส่ง" แสดง
- [ ] summary panel แสดง "ประเภทออเดอร์" auto-derive (เช่น "สินค้าจริง") + "การจัดส่ง" = "ต้องจัดส่ง" ทันทีที่เพิ่มสินค้า (optimistic, ไม่ต้อง submit)

## E. Functional E2E (สร้างออเดอร์จริง — proof DB persist)
- [ ] เพิ่มลูกค้าใหม่ (ชื่อ + ช่องทางติดต่อ) → summary panel อัพเดท "ลูกค้า" ทันที
- [ ] เลือกช่องทางขาย + วิธีชำระเงิน (react-select dropdown — คลิก placeholder เพื่อเปิด, คลิก option เพื่อเลือก)
- [ ] เปิด ProductPickerModal → คลิกการ์ดสินค้า → เพิ่มเข้าตะกร้า (แถบ "ในตะกร้า" + mini stepper โผล่ในการ์ด)
- [ ] ปรับ qty ด้วยปุ่ม +/- นอก modal → ยอดสินค้า/ยอดรวมอัพเดททันที (optimistic)
- [ ] submit โดยไม่กรอกที่อยู่ (ทั้งที่ต้องจัดส่ง) → `pacesToast.error` (top-right) "ออเดอร์ที่ต้องจัดส่งต้องระบุที่อยู่จัดส่ง (ที่อยู่ / จังหวัด / รหัสไปรษณีย์)" — ไม่ crash, ฟอร์มไม่หาย
- [ ] กรอกที่อยู่ครบ → submit → `POST /api/orders` 201 → redirect `/orders/{id}` + toast "สร้างออเดอร์แล้ว แชร์ลิงก์ให้ผู้ซื้อ"
- [ ] verify DB (Prisma query): `buyerName`/`buyerContact`/`salesChannel`/`paymentMethod`/`shippingAddress`(line1/subdistrict/district/province/postcode)/`items[].qty`/`totalAmount` ตรงกับที่กรอก

## F. Cross-cutting
- [ ] Console errors: `list_console_messages` หลังโหลดหน้า + หลัง submit — ต้องไม่มี error สีแดงเกี่ยวกับหน้านี้ (noise Vercel analytics/Fast Refresh/scroll-behavior warning ผ่านได้)
- [ ] Network: `POST /api/orders` = 201, ไม่มี request อื่นที่ 4xx/5xx ระหว่าง flow
- [ ] Font computed = `Anuphan, ...` บน heading/label ทุกจุดที่เช็ค (ไม่หลุด Courier/mono)
- [ ] ไม่มีสีม่วง `#7367F0` / `rgb(115, 103, 240)` โผล่ที่ไหนในหน้า (primary ต้องน้ำเงิน Paces `#236dc9`)

## ยังไม่ได้เทส (carry)
- [ ] **Mobile 375×667 live render** (sticky bottom bar, single column, tap target จริงบนอุปกรณ์แคบ) — MCP session 2026-07-03 ไม่มี `resize_page`/viewport tool, `window.resizeTo()` ไม่มีผล (CDP metrics override ล็อคที่ 1800×904 ตาม launch flag) → verify ผ่าน code breakpoint audit เท่านั้น ยังไม่ได้ยืนยันด้วยตา
- [ ] **Tablet 768×1024 live render** — เหตุผลเดียวกับข้างบน
- [ ] **ProductPickerModal header ที่ <640px จริง** (2 แถวไม่ล้น) — code แสดง `sm:flex-row` ถูกต้อง แต่ยังไม่ได้เห็นภาพจริงที่ผ่าน breakpoint
- [ ] Cart qty stepper custom-item variant (บรรทัด ~304/323) — live-measure ยังไม่ทำ (grep code confirm `shrink-0` มีครบ, physical variant live-verify PASS 44×44)

## Known bug — FIXED 2026-07-03 (re-check run)
1. ~~**Cart qty stepper width < 44px**~~ — `src/app/(paces)/seller/(dashboard)/orders/new/components/CartBlock.tsx` บรรทัด ~199-224 และ ~296-327 (dup 2 จุด: physical/custom item variant): `<div className="flex items-center gap-1">` ครอบปุ่ม `ลดจำนวน`/`เพิ่มจำนวน` (`!size-11`) ไม่มี `shrink-0` → flexbox บีบ width เหลือ ~31.77px (สูง 44px ถูก แต่กว้างไม่ถึง) ทั้งที่ปุ่มลบข้างๆ (มี `shrink-0`) ได้ 44×44 พอดี. **Fix applied:** เพิ่ม `shrink-0` ในปุ่ม stepper ทั้ง 4 จุด (2 คู่ × 2 variant) — grep confirm ครบ, live-measure physical variant = 44×44 ทั้งสองปุ่ม. Regression: ปุ่มลบ (x) ยัง 44×44 ปกติ, ไม่มี row overflow (ทดสอบ viewport 1800×904).

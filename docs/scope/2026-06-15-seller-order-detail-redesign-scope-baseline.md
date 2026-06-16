# Scope Baseline — Seller Order Detail Redesign

> copy จาก `docs/scope/_TEMPLATE.md`
> สถานะ: SIGNED-OFF (2026-06-16, Gate 2 — ไม่มี CREEP/GAP)
> อ้างอิง PRD: FR-6 (Simple OMS), FR-5 (fulfillmentMode), S-5 (tracking), S-8 (SMS)
> spec: `docs/superpowers/specs/2026-06-15-seller-order-detail-redesign-design.md`

สถานะ: SIGNED-OFF (2026-06-16, Gate 2 — ไม่มี CREEP/GAP)

## Goal

ปรับหน้า `/seller/orders/[token]` (`(paces)/seller/(dashboard)/orders/[token]`) ให้ mobile-first, action-first, Paces-faithful และ status/timeline ชัดขึ้น — โดยใช้ theme `order-details` เป็นฐาน ไม่รื้อ backend และไม่แตะ PII mask logic

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | สร้าง `StatusHero.tsx` (client component ใหม่) | (1) render badge status + type badge + ออเดอร์ # (8 char) + วันที่/เวลา; (2) โซนขวา desktop / stack mobile ปุ่ม w-full; (3) ไม่รับ prop contact/PII; (4) มี `Base:` comment ชี้ `order-details/components/OrderSummary.tsx` | DONE |
| S-2 | StatusHero — Primary Action Per State ครบทุก state | (1) PENDING+SHIPPED → ปุ่ม "บันทึกการจัดส่ง" toggle ShipForm ใต้ Hero; (2) PENDING+NO_SHIPPING → `<SendSmsButton>` full-width; (3) SHIPPED+SHIPPED → callout bg-info/15 ไม่มีปุ่ม; (4) CONFIRMED → badge bg-success/15 "ออเดอร์สำเร็จแล้ว"; (5) CANCELLED → badge bg-danger/15; (6) unknown → badge bg-default-100 ไม่มีปุ่ม | DONE |
| S-3 | Extract `ShipForm.tsx` จาก `OrderActions.tsx` | (1) ฟอร์ม react-hook-form + yup + Select carrier ยังทำงานได้ครบ; (2) POST /api/orders/[token]/ship → router.refresh() ยังทำงาน; (3) loading state = ปุ่ม "กำลังบันทึก..." disabled; (4) class ใช้ `rounded-lg` token (ไม่มี arbitrary); (5) มี `Base:` comment | DONE |
| S-4 | สร้าง `PaymentCard.tsx` (client component ใหม่) | (1) render rows วิธีชำระ + ช่องทาง เฉพาะที่มีค่า; (2) empty-state (ทั้งคู่ null) แสดง "ไม่มีข้อมูลการชำระเงิน" + icon tabler:credit-card-off; (3) slip section render เฉพาะ slipFileId ไม่ null; (4) accessUrl section render เฉพาะ fulfillmentMode=NO_SHIPPING; (5) divider ใช้ `border-dashed border-default-300`; (6) icon-row pattern ใช้ `btn btn-icon bg-light text-default-800 size-6! rounded-full`; (7) มี `Base:` comment ชี้ `order-details/components/BillingDetails.tsx` + `CustomerDetails.tsx` | DONE |
| S-5 | แก้ `OrderSummary.tsx` — ตัด / เพิ่มตาม spec | (1) ตัด status/type badges ออก (ย้าย S-1); (2) ตัด section "การดำเนินการ" (OrderActions block); (3) ตัด SlipViewer + accessUrl (ย้าย S-4); (4) เพิ่ม cancel button `btn border border-danger text-danger hover:bg-danger/10 w-full` แสดงเฉพาะ status PENDING หรือ SHIPPED; (5) คง table desktop + stacked mobile + totals breakdown + CopyLink + SMS secondary; (6) ตัด prop `slipFileId`/`accessUrl`; (7) `Base:` comment คงอยู่ | DONE |
| S-6 | แก้ `CustomerDetails.tsx` — ตัด payment/channel fields | (1) ตัด row paymentMethod/salesChannel + label logic ออก; (2) เหลือ identity block (avatar bg-primary/15 + displayName/buyerName) + contact row (phone + buyerContactMasked); (3) empty-state เดิมยังแสดงถูกต้อง; (4) type `CustomerDetailsData` อัปเดตตัด 2 field แล้ว tsc ผ่าน; (5) `Base:` comment คงอยู่ | DONE |
| S-7 | แก้ `ShippingActivity.tsx` — dot color + tracking chip | (1) dot SHIPPED เปลี่ยนจาก `bg-success` → `bg-primary`; (2) dot CONFIRMED ยัง `bg-success`; (3) dot pending ยัง `border-2 border-default-300 bg-white`; (4) tracking number แสดงเป็น chip `badge bg-default-100 text-default-700 font-mono` ใต้ description SHIPPED (ไม่ใช่ plain text); (5) logic timeline ที่เหลือ = ไม่แตะ | DONE |
| S-8 | แก้ `page.tsx` — wiring component ใหม่ + ปรับ props | (1) import StatusHero แทน header block เดิม; (2) import PaymentCard แทน BillingDetails; (3) ส่ง props ให้ CustomerDetails โดยไม่มี paymentMethod/salesChannel; (4) ส่ง props ให้ OrderSummary โดยไม่มี slipFileId/accessUrl; (5) **ไม่แตะ PII mask/neutralize logic** — buyerContactMasked ยังถูก compute ที่ page.tsx boundary; (6) ShippingAddress + OrderReviewCard ไม่แตะ | DONE |
| S-9 | ลบ `OrderActions.tsx` | (1) ไฟล์ถูกลบออกจาก repo; (2) ไม่มี import OrderActions ใน codebase; (3) tsc ผ่าน 0 error หลังลบ | DONE |
| S-10 | Layout ถูกต้องทั้ง desktop และ mobile | (1) desktop ≥ lg: grid-cols-4, Main col-span-3 (StatusHero → OrderSummary → ShippingActivity) + Sidebar col-span-1 (CustomerDetails → PaymentCard → ShippingAddress → OrderReviewCard); (2) mobile < lg: single column เรียง StatusHero → OrderSummary → ShippingActivity → CustomerDetails → PaymentCard → ShippingAddress → OrderReviewCard; (3) ไม่มี sticky action bar ใด ๆ | DONE |
| S-11 | Paces token compliance + ไม่มี arbitrary value | (1) grep `text-\[` / `bg-\[` / `shadow-\[` / `rounded-\[` / `w-\[` / hardcode hex ใน component ที่แก้/ใหม่ทุกไฟล์ = 0 match (เว้น comment กำกับเหตุผล); (2) grep `#7367F0` ใน path ที่แตะ = 0; (3) primary ใช้ `bg-primary`/`text-primary` token | DONE |
| S-12 | ทุก component ใหม่/แก้ มี `Base:` comment | grep `Base:` ใน StatusHero.tsx, PaymentCard.tsx, ShipForm.tsx, OrderSummary.tsx, CustomerDetails.tsx, ShippingActivity.tsx = ครบทุกไฟล์ (Hard Rule 3) | DONE |
| S-13 | **OrderActionPanel** (ใหม่) — รวมทุก action ของ order ไว้ panel เดียว บนสุด sidebar (user request 2026-06-15) | (1) card บนสุด sidebar เหนือ CustomerDetails, title "การดำเนินการ"; (2) per-state: PENDING+SHIPPED=ShipForm+copy+SMS+cancel, PENDING+NO_SHIPPING=SMS+copy+cancel, SHIPPED=callout+copy+SMS+cancel, CONFIRMED/CANCELLED=callout+copy+"ไม่มีการดำเนินการเพิ่มเติม"; (3) reuse ShipForm/SendSmsButton/OrderCopyLink/CancelOrderButton ไม่แตะ internal; (4) StatusHero ตัด action zone+callout เหลือ badges+order#+date (ตัด prop fulfillmentMode); (5) OrderSummary ตัด section ลิงก์+cancel (ตัด status/fulfillmentMode จาก type); (6) ปุ่ม full-width ผ่าน flex-stretch ไม่ใช้ arbitrary; (7) Base: + ไม่มี arbitrary | DONE |

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | Sticky mobile bottom action bar | ตัดสินใจไม่ทำใน phase นี้ (spec lock) — เพิ่ม arbitrary value โดยไม่จำเป็น |
| OOS-2 | การเปลี่ยนแปลง backend / API ใด ๆ (ship, send-sms, set-access-url, wallet) | ใช้ route เดิมทั้งหมด — backend change = phase อื่น |
| OOS-3 | Map embed / geocode ใน ShippingAddress | SafePay ไม่มี geocode service |
| OOS-4 | แก้ `ShippingAddress.tsx` | spec ระบุ "ไม่แตะ" |
| OOS-5 | แก้ `OrderReviewCard.tsx` | spec ระบุ "ไม่แตะ" |
| OOS-6 | แก้ `OrderCopyLink.tsx` | spec ระบุ "ไม่แตะ" |
| OOS-7 | แก้ `SendSmsButton.tsx` | spec ระบุ "ไม่แตะ" (reuse ตามเดิม) |
| OOS-8 | แก้ `SlipViewer.tsx` | spec ระบุ "ไม่แตะ" (reuse ใน PaymentCard) |
| OOS-9 | แก้ PII mask/neutralize logic ใน page.tsx | Hard constraint — ห้ามแตะตาม spec; security boundary คงไว้ |
| OOS-10 | Redesign หน้า buyer `/o/[token]` | คนละ phase (ดู scope baseline 2026-05-23-order-detail-v1) |

## Assumptions

- Logic ของ `ShipForm` (carrier select, yup schema, POST endpoint path) ยังตรงกับ `OrderActions.tsx` ที่มีอยู่ปัจจุบัน — ถ้า extract แล้วพบว่า API path เปลี่ยน ให้ flag Controller ก่อนแก้
- `SendSmsButton.tsx` รับ prop เดิมจาก page.tsx โดยไม่ต้องปรับ signature — ถ้า prop ต้องเปลี่ยนให้จด Change Log และ Controller อนุมัติก่อน
- `fulfillmentMode` prop ที่ส่งให้ StatusHero มีค่า `SHIPPED` หรือ `NO_SHIPPING` เท่านั้น (ตาม FR-5 enum) — ไม่มี case อื่น
- accessUrl update ยังใช้ toast.error (pattern เดิม) — ไม่ต้องสร้าง error UI ใหม่
- `buyerContactMasked` ถูก compute ใน page.tsx อยู่แล้ว (ตาม PII fix commit d57e965) — component ใหม่รับ masked value ไม่ต้องแก้ service

## Deferred → Phase 2

> ของที่จงใจไม่ทำใน phase นี้ — ไม่นับเป็น GAP ตอน audit/sign-off

- Sticky mobile bottom action bar (ตัดสินใจแล้ว ไม่ทำ MVP)
- Map embed ใน ShippingAddress (ต้องการ geocode service)
- Payment slip upload โดย buyer บนหน้า seller detail (FR-6 buyer-side flow)
- Dispute / cancel flow ฝั่ง buyer (Phase 2 per PRD §4)
- Redis-backed rate-limit สำหรับ SMS (OOS-2 / PRD §7 #12)

## Acceptance (Phase-Level)

phase นี้ถือว่าเสร็จเมื่อเงื่อนไขทั้ง 5 ข้อต่อไปนี้ผ่านพร้อมกัน:

1. **Visual + Functional** — S-1 ถึง S-10 ทุก acceptance ผ่านการทดสอบจริงใน dev server (seller.deepth.local:4000) บน Chrome DevTools: desktop layout + mobile 360px, ทุก status state render ถูกต้อง, ShipForm submit ได้, cancel button แสดง/ซ่อนถูก status
2. **tsc 0** — `npx tsc --noEmit` ผ่านโดยไม่มี error หลัง S-9 (ลบ OrderActions)
3. **Paces token compliance** — S-11 grep arbitrary = 0 (ไม่มี `text-[`, `bg-[`, `rounded-[`, hardcode hex ที่ไม่มี comment กำกับ)
4. **Base: citation ครบ** — S-12 grep ใน component ที่สร้าง/แก้ = ครบทุกไฟล์ (Hard Rule 3)
5. **ไม่มี regression** — ShippingAddress / OrderReviewCard / OrderCopyLink / SendSmsButton / SlipViewer render ปกติ, PII mask ยังทำงาน (buyerContactMasked ไม่ leak raw contact)

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-06-15 | baseline สร้าง | phase เริ่มต้น — spec APPROVED | - |
| 2026-06-15 | +S-13 OrderActionPanel (รวม action sidebar); StatusHero→status-only; OrderSummary ตัด action | user request หลัง polish — "อยากให้บนข้อมูลผู้ซื้อมี action panel รวม action" | user |

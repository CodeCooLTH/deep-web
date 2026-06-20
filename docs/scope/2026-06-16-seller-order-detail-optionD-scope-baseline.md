# Scope Baseline — Seller Order Detail Option D (Action-Prominent Lean)

> สถานะ: ACTIVE · วันที่: 2026-06-16 · Phase ID: `seller-order-detail-optionD`
> อ้างอิง PRD: FR-6 (Simple OMS), FR-5 (fulfillmentMode/tracking), S-8 (SMS paid)
> plan: `docs/superpowers/plans/2026-06-16-seller-order-detail-optionD-plan.md`
> design spec: `docs/superpowers/specs/2026-06-16-seller-order-detail-optionD-statushero-cancelzone-spec.md`
> prior baseline (SIGNED-OFF): `docs/scope/2026-06-15-seller-order-detail-redesign-scope-baseline.md`

## Goal

ปรับสถาปัตยกรรม action zone ของหน้า seller order detail ให้ primary CTA อยู่ใน StatusHeroV2 (state-derived, บนสุด) และ cancel action แยกออกเป็น CancelZone อิสระ (danger card ล่างสุด) — ลบ OrderActionPanel ออกทั้งหมด โดยไม่แตะ backend, PII mask logic (S-C1), หรือ internals ของ component ที่ไม่เกี่ยวข้อง.

## In-Scope

| ID | รายการ | Acceptance | สถานะ |
|----|--------|-----------|-------|
| S-D1 | แก้ `StatusHero.tsx` → StatusHeroV2 — เพิ่ม prop `fulfillmentMode`; primary CTA state-derived (PENDING+SHIPPED-fulfillment="บันทึกการจัดส่ง"→ShipForm toggle; PENDING+NO_SHIPPING=SendSmsButton; SHIPPED=info callout; CONFIRMED=success badge; CANCELLED=danger badge); overflow `⋮ เพิ่มเติม` (hs-dropdown static) secondary; ShipForm expand inline ใต้ CTA | AC-1..AC-3, AC-7, AC-11, AC-13(a) | TODO |
| S-D2 | สร้าง `CancelZone.tsx` — `card border border-dashed border-danger` "โซนอันตราย"; reuse `CancelOrderButton`; render เฉพาะ PENDING/SHIPPED; null สำหรับ terminal | AC-4(c), AC-5(c), AC-8..AC-10, AC-13(b) | TODO |
| S-D3 | ลบ `OrderActionPanel.tsx` | `rg "OrderActionPanel" src/` = 0; tsc 0 | TODO |
| S-D4 | wire `page.tsx` — StatusHeroV2 (+fulfillmentMode) + CancelZone; ลบ import OrderActionPanel; ห้ามแตะ PII mask | StatusHeroV2 ได้ prop ครบ; CancelZone desktop=ล่าง sidebar / mobile=ล่างหน้า; S-C1 block คงครบ; tsc 0 | TODO |
| S-D5 | re-skin `ShippingActivity.tsx` (ส่วน "ประวัติออเดอร์") — เปลี่ยน Base render layer จาก order-details timeline → **ExpandedActivity** ("Expended Activity Stream"); DROP avatar+link → actor label; badge/dot สี map ตาม state; logic derive timeline คงเดิม | AC-14: Base ชี้ ExpandedActivity.tsx; markup copy จาก theme; HR7 grep=0; font-mono เฉพาะ trackingNo; ครอบทุก state (PENDING/SHIPPED/CONFIRMED/CANCELLED/NO_SHIPPING/empty); tsc 0 | DONE (pending QA) |

## Acceptance Criteria (สรุป — ฉบับเต็มอยู่ใน design spec)

- **AC-1** PENDING+SHIPPED-fulfillment: ปุ่ม `btn bg-primary text-white w-full` "บันทึกการจัดส่ง"; toggle ShipForm inline ไม่ jump; submit→toast→SHIPPED; ⋮ มี คัดลอกลิงก์+ส่ง SMS
- **AC-2** PENDING+NO_SHIPPING: SendSmsButton เป็น primary; ไม่มี ShipForm; ⋮ มีเฉพาะ คัดลอกลิงก์
- **AC-3** SHIPPED: callout `bg-info/15 text-info` ไม่มีปุ่ม; ⋮ ยังเปิดได้
- **AC-4** CONFIRMED: badge `bg-success/15`; ไม่มี CTA; CancelZone ไม่อยู่ใน DOM
- **AC-5** CANCELLED: badge `bg-danger/15`; ไม่มี CTA; CancelZone ไม่อยู่ใน DOM
- **AC-6** PII ไม่ regress (S-C1): `maskContactLocal` + `order.buyerContact=null` + `order.review.reviewerContact=null` คงอยู่; flight payload ไม่มี raw phone/email
- **AC-7** Paces token: grep `text-[|bg-[|rounded-[|shadow-[|w-[` ใน StatusHero/CancelZone = 0; `#7367F0`=0; `font-mono` ใน StatusHero=0; computed font=Anuphan; `react-toastify` ใน (paces)=0
- **AC-8** CancelZone render เฉพาะ PENDING/SHIPPED
- **AC-9** CancelZone แยกชัด "โซนอันตราย"; desktop=ล่าง sidebar / mobile=ล่างหน้า; border dashed danger
- **AC-10** CancelZone reuse CancelOrderButton; diff ของ CancelOrderButton.tsx = clean
- **AC-11** hs-dropdown เปิด/ปิด + ทำงานหลัง router.refresh
- **AC-12** Desktop 2-col grid คงเดิม (`lg:grid-cols-4`, main `col-span-3`, sidebar `col-span-1`)
- **AC-13** `Base:` comment ครบทั้ง StatusHero + CancelZone (Hard Rule 3)

## Out-of-Scope (CREEP = hard block)

OOS-D1..D4 Options A/B/C/E (ตัดสินใจเลือก D แล้ว) · OOS-D5 API/DB/schema ใด ๆ · OOS-D6..D15 internals ของ ShipForm/SendSmsButton/CancelOrderButton/PaymentCard/CustomerDetails/OrderSummary/OrderReviewCard/ShippingAddress/OrderCopyLink · OOS-D16 PII mask logic ใน page.tsx (S-C1) · OOS-D17 buyer `/o/[token]` · OOS-D18 SMS ledger/topup

> **หมายเหตุ:** `ShippingActivity` ถูกถอดออกจาก OOS แล้ว — ย้ายเป็น **S-D5** (in-scope) ตามที่ user สั่งตรง 2026-06-16 (ดู Change Log)

## Carry-over Note — S-C1 (mandatory ทุก commit ที่แตะ page.tsx)

บล็อกต่อไปนี้ใน `page.tsx` ห้ามลบ/ย้าย/ดัดแปลง:
```
function maskContactLocal(c: string): string { ... }
const buyerContactMasked = order.buyerContact ? maskContactLocal(order.buyerContact) : null
order.buyerContact = null
if (order.review) order.review.reviewerContact = null
```
Reviewer gate: `rg "order\.buyerContact = null" .../page.tsx` = 1 match; ห้ามส่ง raw buyerContact/reviewerContact ไป component ใหม่.

## Assumptions

- `fulfillmentMode` enum มีเฉพาะค่าที่ FR-5 กำหนด — พบค่าอื่น → flag Controller
- `CancelOrderButton` มี internal status guard อยู่แล้ว; CancelZone guard เพิ่มเพื่อไม่ render card shell สำหรับ terminal state
- hs-dropdown ปลอดภัยเพราะ StatusHeroV2 static (router.refresh = full remount ไม่ใช่ partial re-render); ถ้า QA พบ opacity ค้าง → fallback custom React dropdown (OrderCardMenu.tsx pattern)
- ShipForm/OrderCopyLink/SendSmsButton รับ prop `publicToken` เหมือนเดิม — prop signature เปลี่ยน → หยุด+flag (retro P2)
- hs-dropdown ใส่ `[--placement:bottom-right]`

## Edge Cases

- CONFIRMED/CANCELLED → CancelZone return null (ไม่ render card wrapper)
- PENDING+NO_SHIPPING → SendSmsButton เป็น primary; dropdown มีเฉพาะ คัดลอกลิงก์ (SMS ไม่ซ้ำ)
- ShipForm toggle expand/collapse ไม่ shift card อื่น
- router.refresh หลัง submit → dropdown re-init; พัง → fallback
- unknown status → badge `bg-default-100 text-default-700`; ไม่มี CTA; CancelZone ไม่ render
- fulfillmentMode null/undefined → conservative PHYSICAL-branch + console.warn

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล |
|--------|-----------|--------|
| 2026-06-16 | baseline สร้าง (Option D APPROVED) | Controller อนุมัติ Option D; prior baseline 2026-06-15 SIGNED-OFF |
| 2026-06-16 | **scope expansion: +S-D5** (re-skin ShippingActivity → ExpandedActivity); ถอด ShippingActivity ออกจาก OOS-D6..D15 | user สั่งตรง "ตรง ประวัติออเดอร์ ให้ใช้ component Expended Activity Stream" — Controller authorize; ผ่าน safepay-ux gate (HR8) + reviewer technical PASS ทุก gate |

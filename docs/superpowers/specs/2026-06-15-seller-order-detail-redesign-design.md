# Seller Order Detail — Redesign Design Spec

> วันที่: 2026-06-15 · หน้า: `/seller/orders/[token]` (`(paces)/seller/(dashboard)/orders/[token]`) · ธีม: Paces (น้ำเงิน `#236dc9`)
> Status: **APPROVED (brainstorm)** — ผ่าน safepay-ux gate (Hard Rule 8)

## ที่มา / เป้าหมาย

หน้า seller order detail ปัจจุบันเป็น re-source ของ theme `order-details` อยู่แล้ว (3-col main + sidebar) แต่ยัง
ไม่ตอบเป้าหมาย 4 ข้อที่ user ต้องการ และยังตัด section ของ theme บางส่วนทิ้ง งานนี้คือ **"ปรับให้ตรง theme
ขึ้น + ตอบ 4 เป้า"** ไม่ใช่รื้อใหม่

**เป้าหมาย (user ยืนยัน):**
1. Mobile-first / responsive
2. Action-first — next-step ของ seller เด่นขึ้น
3. Visual / brand polish — Paces น้ำเงิน (ห้ามม่วง `#7367F0` ของ buyer/Vuexy)
4. Status / timeline ชัดขึ้น

**แนวทางที่เลือก = A "Theme-faithful + 4 เป้า"** — ฐาน theme
`theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/`

**Decision ที่ user lock:**
- Payment card ใหม่ (แทน BillingDetails ของ theme) รวม วิธีชำระ + ช่องทางขาย + สลิปโอน + ลิงก์ดิจิทัล
- ย้าย payment/channel ออกจาก CustomerDetails → CustomerDetails เหลือ identity + contact
- **ไม่ทำ** sticky bottom action bar บน mobile (StatusHero บนสุดพอ) → **ไม่มี arbitrary value ในงานนี้**

## Layout — Desktop (≥ lg)

```
grid lg:grid-cols-4 gap-base
┌── Main (lg:col-span-3) ─────────────┐  ┌── Sidebar (col-span-1) ──┐
│ [A] StatusHero  (ใหม่)              │  │ [D] CustomerDetails       │ ← identity + contact
│   badge status + type               │  │ [E] PaymentCard (ใหม่)    │ ← วิธีชำระ+ช่องทาง+สลิป+ลิงก์
│   ออเดอร์ #  · วันที่               │  │ [F] ShippingAddress (cond)│
│   [PRIMARY ACTION btn]              │  │ [G] OrderReviewCard       │
│ [B] OrderSummary                    │  └───────────────────────────┘
│   items table + breakdown +         │
│   ลิงก์ผู้ซื้อ (copy/SMS) + cancel  │
│ [C] ShippingActivity (timeline)     │
└─────────────────────────────────────┘
```

## Layout — Mobile (< lg, single column)

```
PageBreadcrumb
[A] StatusHero  (badge + primary action w-full)   ← action-first ขึ้นบนสุด
[B] OrderSummary
[C] ShippingActivity
[D] CustomerDetails
[E] PaymentCard
[F] ShippingAddress (conditional)
[G] OrderReviewCard
```
ไม่มี sticky action bar (ตัดสินใจแล้ว)

## Section Breakdown

### [A] StatusHero — component ใหม่ `StatusHero.tsx` (client)
- `card` + `card-body` (ไม่มี card-header เพื่อความเด่น)
- โซนซ้าย: status badge (`badge badge-label` + semantic color) + type badge (`text-2xs`) + `ออเดอร์ #TOKEN(8)` + วันที่/เวลา
- โซนขวา: **primary next-action 1 ปุ่ม** (ดู Primary Action Per State)
- responsive: `md:flex md:items-center md:justify-between gap-base`; mobile stack, ปุ่ม `w-full`
- props: `publicToken`, `status`, `fulfillmentMode`, `type`, `createdAtISO` — **ไม่รับ contact** (ปลอดภัย PII)
- embed `ShipForm` (extract) + reuse `SendSmsButton`

### [B] OrderSummary — แก้
- card-header เหลือ title "รายการสินค้า" + ปุ่มกลับ (**ตัด status/type badges** → ย้าย Hero)
- คง table (desktop) + stacked list (mobile) + totals breakdown
- คง section "ลิงก์สำหรับผู้ซื้อ" (CopyLink + SMS = secondary share)
- **ตัด section "การดำเนินการ" (OrderActions) ทั้งหมด**
- **ตัด** SlipViewer + accessUrl (ย้าย PaymentCard)
- เพิ่ม **cancel button** ใต้ secondary actions: `btn border border-danger text-danger hover:bg-danger/10 w-full` แสดงเฉพาะ PENDING/SHIPPED
- ตัด prop `slipFileId`/`accessUrl`; คง `status`/`fulfillmentMode` (cancel condition)

### [C] ShippingActivity — แก้ (คง logic timeline 100%)
- dot SHIPPED: `bg-success` → `bg-primary` (น้ำเงิน = active/in-progress ไม่ใช่ terminal)
- dot CONFIRMED: คง `bg-success` · pending: คง `border-2 border-default-300 bg-white`
- tracking no: แสดงเป็น chip `badge bg-default-100 text-default-700 font-mono` ใต้ description SHIPPED

### [D] CustomerDetails — แก้
- **ตัด** `paymentMethod`/`salesChannel` fields + rows + label logic (ย้าย E)
- เหลือ identity block (icon avatar bg-primary/15 + displayName/buyerName) + contact row (phone + `buyerContactMasked`) + empty-state เดิม
- อัป type `CustomerDetailsData` ตัด 2 field

### [E] PaymentCard — component ใหม่ `PaymentCard.tsx` (client)
- Base: theme `BillingDetails.tsx` (card primitive) + icon-list pattern จาก `CustomerDetails.tsx`
- `card-header` title "การชำระเงิน"
- rows (render เฉพาะมีค่า): `วิธีชำระ: {label}` (icon cash) · `ช่องทาง: {label}` (icon speakerphone)
- empty (ทั้งคู่ null): "ไม่มีข้อมูลการชำระเงิน" + icon `tabler:credit-card-off`
- divider `border-t border-dashed border-default-300` ถ้ามี slip/url
- slip section (เฉพาะ slipFileId): title "สลิปการโอนเงิน" + `<SlipViewer slipFileId>`
- accessUrl section (เฉพาะ NO_SHIPPING): title "ลิงก์ส่งมอบสินค้า/บริการดิจิทัล" + input + btn บันทึก + URL ปัจจุบัน
- icon-row pattern: `btn btn-icon bg-light text-default-800 size-6! rounded-full` + `h5 text-default-400 font-medium text-sm`
- props: `paymentMethod`, `salesChannel`, `slipFileId`, `accessUrl`, `fulfillmentMode`, `publicToken`

### [F] ShippingAddress — ไม่แตะ
### [G] OrderReviewCard — ไม่แตะ

## Primary Action Per State

| status | fulfillmentMode | primary action ใน StatusHero | action อื่น |
|---|---|---|---|
| PENDING | SHIPPED | `btn bg-primary text-white w-full` "บันทึกการจัดส่ง" → toggle ShipForm ใต้ Hero | cancel ใน OrderSummary |
| PENDING | NO_SHIPPING | `<SendSmsButton>` full-width "ส่ง SMS แจ้งลูกค้า (฿1)" | CopyLink+SMS+cancel ใน OrderSummary |
| SHIPPED | SHIPPED | callout `bg-info/15 rounded-lg p-3` icon clock "รอผู้ซื้อยืนยันรับสินค้า" (ไม่มีปุ่ม) | cancel ใน OrderSummary |
| CONFIRMED | — | badge `bg-success/15 text-success` "ออเดอร์สำเร็จแล้ว" (terminal) | — |
| CANCELLED | — | badge `bg-danger/15 text-danger` "ออเดอร์ถูกยกเลิกแล้ว" (terminal) | — |
| (unknown) | — | badge `bg-default-100 text-default-700`, ไม่มีปุ่ม | — |

**ShipForm** (expand ใต้ StatusHero): ใช้ logic/form เดิมจาก OrderActions.tsx (react-hook-form + yup + Select carrier),
`POST /api/orders/[token]/ship` → `router.refresh()`. class: `card border border-default-200 rounded-lg p-4 flex flex-col gap-3 mt-3` (ใช้ `rounded-lg` ตาม token)

## Theme Source Mapping

| Section | Theme Base file | ปรับอะไร |
|---|---|---|
| [A] StatusHero | `order-details/components/OrderSummary.tsx` (header block) | ตัด card-header; metadata ซ้าย + action ขวา เป็น body; เพิ่ม callout bg-info/15 |
| [B] OrderSummary | `order-details/components/OrderSummary.tsx` | ตัด badges/OrderActions/slip; เพิ่ม cancel btn |
| [C] ShippingActivity | `order-details/components/ShippingActivity.tsx` | dot SHIPPED → bg-primary; chip tracking |
| [D] CustomerDetails | `order-details/components/CustomerDetails.tsx` | ตัด payment/channel/avatar img/flag/dropdown |
| [E] PaymentCard | `order-details/components/BillingDetails.tsx` + icon-list จาก CustomerDetails | content = payment/channel/slip/accessUrl |
| [F] ShippingAddress | `order-details/components/ShippingAddress.tsx` | ไม่แตะ |
| [G] OrderReviewCard | (เดิม) | ไม่แตะ |

## Component — New / แก้ / ไม่แตะ

**ใหม่:** `StatusHero.tsx` (client), `PaymentCard.tsx` (client), `ShipForm.tsx` (extract ship logic จาก OrderActions — ใช้ร่วมกัน กัน drift)
**แก้:** `OrderSummary.tsx`, `CustomerDetails.tsx`, `ShippingActivity.tsx`, `page.tsx` (import StatusHero/PaymentCard, ส่ง props ใหม่, ปรับ props Customer/OrderSummary — **ห้ามแตะ PII mask/neutralize logic**)
**ลบ:** `OrderActions.tsx` (logic ย้ายไป StatusHero/ShipForm หมดแล้ว)
**ไม่แตะ:** `ShippingAddress.tsx`, `OrderReviewCard.tsx`, `OrderCopyLink.tsx`, `SendSmsButton.tsx`, `SlipViewer.tsx`

## Edge States
- StatusHero unknown status → badge default, ไม่มีปุ่ม
- PENDING NO_SHIPPING + buyer ยังไม่ confirm OTP → SMS route 422 → error inline (logic เดิม SendSmsButton)
- PaymentCard payment+channel null → empty-state
- PaymentCard slipFileId null → ไม่แสดง slip section
- accessUrl submit error → toast.error (logic เดิม)
- ShipForm loading → ปุ่ม "กำลังบันทึก..." disabled
- CONFIRMED/CANCELLED → ไม่มี action ทั้ง Hero และ OrderSummary

## Constraints (Hard Rules)
- **HR7**: Paces primitive เท่านั้น — ไม่มี arbitrary value ในงานนี้ (sticky bar ตัดออก)
- **HR3**: ทุก component ใหม่/แก้ ต้องมี `Base:` comment ชี้ theme file
- **HR8**: ผ่าน safepay-ux gate แล้ว (spec นี้)
- Paces primary = `bg-primary`/`text-primary` token — ห้าม hardcode สี/ม่วง
- RSC PII: component รับ masked props เท่านั้น; page.tsx neutralize raw contact ที่ source (คงไว้)

## Out of Scope
- Sticky mobile action bar (ตัดสินใจไม่ทำ)
- Backend change ใด ๆ (ใช้ API/route เดิม: ship, send-sms, set-access-url)
- Map embed ใน ShippingAddress (SafePay ไม่มี geocode)

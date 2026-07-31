# Scope Baseline — seller-order-detail-v5

> **สถานะ:** `ACTIVE`
> **Phase:** Redesign หน้ารายละเอียดคำสั่งซื้อ (seller) ตาม Design Spec v5
> **Branch:** `shinobu22/main-7`
> **Commit ตั้งต้น:** `5665f681`

อ้างอิง PRD: FR-6.x (Simple OMS — order detail), FR-ISHIP (feature 00022) · spec: `docs/superpowers/specs/2026-07-31-seller-order-detail-v5-design.md` (design), `docs/superpowers/specs/2026-07-30-seller-order-detail-v5-mockup.html` (mockup approved), `docs/superpowers/specs/2026-07-27-iship-shipment-modal-design.md` (dependency — modal ที่ปุ่ม "แจ้งเลขพัสดุ" เรียก)

## Goal
ปรับหน้ารายละเอียดคำสั่งซื้อของ seller (`/orders/[token]`) ใหม่ทั้งหน้าตาม Design Spec v5 (แยก "ข้อเท็จจริง" ออกจาก "เหตุการณ์" อย่างเด็ดขาด, รวม action ไว้ที่เดียวและย้ายตำแหน่งตามขนาดจอ, ตัด bottom nav) พร้อมปิดหนี้ทางเทคนิค 3 ข้อ (breakdown 2 ชุด/a11y/contrast) และปลดล็อกปุ่ม "แก้ไขเลขพัสดุ" ที่ backend บล็อกอยู่

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | ไฟล์ที่คาดว่าจะแตะ | user-facing? |
|----|--------|----------------------|----|----|
| S-1 | โครงหน้า/grid ใหม่ | (1) หัวหน้าเป็นการ์ดเต็มความกว้างแยกจาก grid เนื้อหา (2) ≥1024px: grid 2 คอลัมน์ 75/25 (`lg:grid-cols-4` ซ้าย `col-span-3`) (3) <1024px: คอลัมน์เดียว ทุก section เรียงต่อกัน (4) ไม่มี Google Maps iframe และไม่มีแถว "ค่าจัดส่ง" หลงเหลือในหน้า (ตัดโดยเจตนาตาม design §2) | `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx` | ใช่ |
| S-2 | การ์ด "ใบสั่งซื้อ" 3 section รวมเป็นใบเดียว | (1) การ์ดเดียวมี 3 section คั่นด้วย `border-top dashed` (ไม่ใช่ `.card-header` ซ้อนใน `.card`): ผู้ซื้อและที่อยู่จัดส่ง / รายการสินค้าและยอดเงิน / การจัดส่ง (2) ทั้ง 3 section **เห็นครบทุกสถานะเสมอ** ไม่มี accordion/กาง-พับ ไม่มี field ผูกกับ status ยกเว้นเนื้อหาในตารางที่ §3 design ระบุ (3) เบอร์เป็นลิงก์ `tel:` (4) ไม่มีเบอร์/ที่อยู่/ยอดเงิน/รายการสินค้าอยู่นอกการ์ดนี้หรือถูกซ่อนในสิ่งที่พับได้ (regression check ตามกฎ §1 design) | component รวมใหม่ (แทน `CustomerDetails.tsx` + `OrderSummary.tsx` + `ShippingCard.tsx` เดิม), `page.tsx` | ใช่ |
| S-3 | การ์ด "ประวัติคำสั่งซื้อ" (เหตุการณ์) | (1) เนื้อหา timeline ตรงตาราง "Per-state เนื้อหา" design §3 ทั้ง 4 สถานะ (PENDING/SHIPPED/CONFIRMED/CANCELLED) (2) อยู่คอลัมน์ขวา (col-span-1, ≥1024) (3) อ่านอย่างเดียว ไม่มีข้อมูลหลัก (เบอร์/ที่อยู่/ยอดเงิน) ฝังอยู่ข้างใน | `ShippingActivity.tsx` | ใช่ |
| S-4 | การ์ด "รีวิวจากผู้ซื้อ" | (1) แสดงเฉพาะสถานะ CONFIRMED **และ**มีรีวิวจริง — สถานะอื่นไม่ render การ์ดนี้เลย (ไม่ใช่ empty-state) (2) อยู่คอลัมน์ขวา (3) มี ดาว + comment + ชื่อ/เวลา | `OrderReviewCard.tsx`, `page.tsx` | ใช่ |
| S-5 | แถบ action <1024 | (1) แถบเต็มความกว้างติดล่าง สูง 64px แทนที่ 64px ที่เคยเป็น bottom nav (2) ปุ่มตรง Per-state matrix design §3 (PENDING/SHIPPED/CONFIRMED มีแถบ, CANCELLED **ไม่มีแถบเลย**) (3) น้ำเงิน ≤1 ปุ่มต่อสถานะ (4) tap target ทุกปุ่ม ≥44px (5) เนื้อหาหน้า (นอกแถบ) มี 0 ปุ่ม action ทุกสถานะ | component action bar ใหม่ | ใช่ |
| S-6 | Action ในหัวหน้า + แถบตรึง ≥1024 | (1) ≥1024px: ปุ่มอยู่มุมขวาบนของการ์ดหัวหน้า (2) เลื่อนจนการ์ดหัวหน้าพ้นจอ → แถบตรึงโผล่ใต้ topbar (`top:65px`, `left:245px`) (3) ปุ่มในแถบตรึงกับปุ่มในหัวหน้า render จากฟังก์ชัน/ชุดข้อมูลเดียวกัน ห้าม markup ซ้ำ 2 ก้อน (4) reuse `IntersectionObserver` "stuck" ที่มีอยู่แล้วใน `StatusHero.tsx` (ห้ามเขียนกลไก sticky ซ้ำสอง) | `StatusHero.tsx` (หรือไฟล์แทนที่) | ใช่ |
| S-7 | ปุ่มย้อนกลับ topbar + ตัด bottom nav เฉพาะหน้านี้ | (1) `SellerBottomNav` ไม่ render บน `/orders/[token]` ทุกสถานะ ทุกขนาดจอ (2) หน้าอื่นที่เคยเห็น nav ยังเห็นเหมือนเดิม (regression: `/dashboard`, `/orders/new`, `/orders/<token>/edit`, `/inbox`, `/shop`) — **หมายเหตุ: `/orders` (list) ซ่อน nav อยู่ก่อนแล้วตั้งแต่ก่อน phase นี้** (`SellerBottomNav.tsx:145` ใน `5665f681`) ไม่ใช่ regression ที่เกิดจากงานนี้ (3) มีปุ่มย้อนกลับใน topbar ของหน้า detail (<1024) ที่พากลับไป `/orders` | `SellerBottomNav.tsx` (ขยาย pathname guard), `page.tsx`/breadcrumb | ใช่ |
| S-8 | Extract action bar เป็น component กลาง | (1) มี component ใหม่ใต้ `src/components/safepay/` (ชื่อ planner เลือกได้ เช่น `OrderActionBar.tsx`) ที่ทั้งหน้า list (แทน `BulkActionBar.tsx` เดิม) และหน้า detail ใช้ร่วมกัน (2) หน้า list **ทำงานเหมือนเดิมทุกประการ** (bulk-select, ปุ่ม copy/SMS/print, dark pill bottom-center, desktop-only) — regression test เทียบ before/after (3) ห้าม copy markup ไปวางซ้ำระหว่าง 2 หน้า | `orders/components/BulkActionBar.tsx`, component กลางใหม่, detail page | ไม่ (pure-infra — แต่ acceptance ข้อ (2) ต้องผ่าน visual QA เพราะกระทบหน้า list ที่ user เห็น) |
| S-9 | เชื่อมปุ่ม "แจ้งเลขพัสดุ" → shipment modal | (1) กดปุ่ม "แจ้งเลขพัสดุ" (PENDING) เปิด modal เดียวกับที่ใช้ในแชท (`DraftOrderProvider` kind=SHIPMENT / `ShipmentDraftPanel`) ไม่ใช่ inline form ในหน้า (2) ฟอร์มกรอกเลขพัสดุไม่ปรากฏอยู่ในเนื้อหาหน้าเลย (3) submit สำเร็จ → หน้ารีเฟรชข้อมูลการจัดส่งในการ์ดใบสั่งซื้อ (S-2) | `page.tsx`, ปุ่มใน S-5/S-6, อาจแตะ `DraftOrderProvider.tsx`/`ShipmentDraftPanel.tsx` ถ้าต้องรองรับ context นอกห้องแชท | ใช่ |
| S-10 | breakdown single-source | (1) มี `Row` array เดียว (`key,label,value,show,tone?,prefix?,emphasis?`) เป็นแหล่งเดียวของยอดเงินย่อย (2) mobile (`div.flex.justify-between`) และ desktop (`tr>td`) `.map()` จาก array เดียวกัน — grep ต้องไม่เจอ literal breakdown rows ซ้ำ 2 ชุด | component รายการสินค้า/ยอดเงินใน S-2 | ไม่ (pure-infra, ผลลัพธ์ตัวเลขบนจอต้องเหมือนเดิม — user-facing เชิง regression เท่านั้น) |
| S-11 | a11y + contrast debt | (1) `ShippingActivity` ไม่มี `<h5>{title}<span class="badge"/></h5>` อีกต่อไป → เป็น `<p class="text-md font-medium text-default-800">` + badge เป็น sibling (2) grep `text-default-300` ที่ใช้เป็น body text (ไม่ใช่ border/divider) ในไฟล์ที่แตะ phase นี้ = 0 ตัว, แทนด้วย `text-default-400` | `ShippingActivity.tsx` + ไฟล์อื่นที่แตะใน S-2/S-3 ที่มี `text-default-300` เป็น body text | ไม่ (a11y/contrast — QA ตรวจด้วย contrast checker ไม่ใช่ functional test) |
| S-12 | Backend P1 — แก้ไขเลขพัสดุ (MANUAL mode) | (1) มี service function ใหม่ (ไม่ใช่เรียก `shipOrder()` เดิม) ที่ update `ShipmentTracking.provider`/`trackingNo` ของออเดอร์ที่ `status=SHIPPED` แล้ว **โดยไม่เรียก `assertTransition`** และไม่ชน `ShipmentTracking.orderId` unique constraint (2) กดปุ่ม "แก้ไขเลขพัสดุ" (SHIPPED, MANUAL only) แล้วบันทึกสำเร็จ ค่าใหม่แสดงในการ์ดใบสั่งซื้อทันที (3) ออเดอร์ที่พัสดุมาจาก iShip **ไม่มีปุ่มนี้เลย** (ปุ่มหาย ไม่ใช่กดไม่ได้) — ตรวจด้วย order ที่ `shipmentPanel.shipment` มาจาก iShip vs manual | `src/services/order.service.ts` (function ใหม่), route ที่เรียกใช้ (`api/orders/[token]/ship` หรือ route ใหม่), ปุ่มใน S-5/S-6 | ใช่ |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | ตัด `SellerBottomNav` ในหน้า detail อื่น (product, customer, booking `[token]`, auction `[id]`) | design spec §8 ระบุชัดว่าเป็น default เฉพาะหน้านี้ — ทำทุกหน้า detail = งานแยก (ต้องตัดสินใจแยก) |
| OOS-2 | แก้ contrast ของ `bg-{semantic}/15 text-{semantic}` badge ระดับ design system (Paces ทั้งระบบ) | design spec §8 — เป็นหนี้ระดับ token, แก้เฉพาะหน้านี้ต้องใช้ arbitrary value ซึ่งผิด Hard Rule 7 |
| OOS-3 | รวม `formatAmount`/`Intl.NumberFormat` เป็น util กลางครบทั้ง 16 ไฟล์ฝั่ง seller | design spec §6.4 ระบุเป็น "nice-to-have ทำได้ก็ทำ" ไม่ใช่ acceptance บังคับ — ทำเฉพาะไฟล์ที่แตะใน S-2/S-10 พอ ไม่ต้องไล่ทั้ง 16 ไฟล์ |
| OOS-4 | เปิด webhook iShip หรือเรียกรถเข้ารับ (pickup) จากโมดัลแชท | อยู่นอกขอบเขตของ `2026-07-27-iship-shipment-modal-design.md` §2 เอง (ไม่ทำ) — v5 นี้แค่ *เรียกใช้* modal ที่มีอยู่ ไม่แตะ scope ของมัน |
| OOS-5 | แก้ที่อยู่ผู้ส่ง (sender) ในโมดัล / เปลี่ยน flow ตั้งค่าร้าน | เหมือนกัน — เป็น scope ของ modal spec เอง ไม่ใช่ของ v5 |
| OOS-6 | เปลี่ยนพฤติกรรม/ปุ่มของ `BulkActionBar` (SMS กลุ่ม, พิมพ์ใบปะหน้า, copy กลุ่ม) | S-8 คือ *extract shell* เท่านั้น — ฟังก์ชันเดิมต้องเหมือนเดิม 100%; เปลี่ยนพฤติกรรม bulk = งานคนละก้อน |
| OOS-7 | Deep-dive ปรับ UX ของ `ShipmentPanel`/`ShipmentCreateForm`/`ShipmentStatusView` เกินกว่าที่ต้องใช้แสดง summary ในการ์ด S-2 | เป็นของ feature 00022 ext (spec คนละใบ) — v5 ใช้ตามที่มีอยู่ ไม่ redesign ซ้ำ |

## Assumptions
- `ShipmentDraftPanel.tsx` / `DraftOrderProvider.tsx` (kind=SHIPMENT) จาก `2026-07-27-iship-shipment-modal-design.md` **มีอยู่แล้วในโค้ด** (verified: `src/app/(paces)/seller/(chat)/_components/`) แม้ frontmatter ของ spec นั้นจะยังเป็น `status: draft` — ถือว่าใช้งานได้จริงสำหรับ S-9 เว้นแต่ planner สำรวจแล้วพบ gap ที่ผูกกับบริบทห้องแชทแน่นเกินไป (เช่นต้องมี `conversationId`) ให้ flag กลับมาแทนที่จะฝืนดัดแปลง
- S-8 "extract เป็น component กลาง" หมายถึง **shell/positioning primitive** (fixed bar wrapper + button-row layout) ไม่ใช่รวม business logic ของ bulk-select (list) กับ per-order state matrix (detail) เข้าด้วยกันทั้งหมด เพราะสองอันมีจุดประสงค์ต่างกัน (multi-select floating pill vs single-order full-width bar) — ถ้า planner ตัดสินว่าควรแยกคนละ component จริง ๆ ให้รายงานกลับ ไม่ใช่ฝืนทำตามตัวอักษร
- CANCELLED "ไม่มีแถบเลย" ครอบทั้งแถบล่าง (<1024), ปุ่มในหัวหน้า และแถบตรึง (≥1024) — เหลือแค่ปุ่มย้อนกลับเท่านั้น
- เบอร์โทรผู้ซื้อแสดงเต็ม (ไม่มาส์ก) ตาม decision ที่มีอยู่แล้วในโค้ดปัจจุบัน (2026-07-30) — v5 ไม่เปลี่ยนพฤติกรรมนี้ ถือเป็นของเดิมที่ carry ต่อ ไม่ใช่ regression scope
- planner ตั้งชื่อไฟล์/component ใหม่เองได้ (เช่นชื่อการ์ดรวม S-2, ชื่อ action bar S-8) ตราบใดที่ acceptance ยังผ่าน

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off

- ตัด bottom nav ให้หน้า detail อื่น ๆ ทั้งหมด (product/customer/booking/auction) ให้ pattern เดียวกัน (OOS-1)
- แก้ badge contrast ระดับ design system ทั้ง Paces (OOS-2)
- รวม `formatAmount` กลางครบ 16 ไฟล์ (OOS-3, ทำบางส่วนใน scope ได้แต่ไม่บังคับครบ)

## 🛑 GAP ที่ค้าง (พบตอน browser QA 2026-07-31 — ต้องตัดสินก่อน sign-off)

**G-1 · `fulfillmentMode = 'PICKUP'` ไม่ถูกจัดการเลย**

`fulfillmentMode` ใน `prisma/schema.prisma:425,490` เป็น **`String` ไม่ใช่ enum** และในฐานข้อมูลจริงมี **3 ค่า**: `SHIPPED` · `NO_SHIPPING` · **`PICKUP`** (ค่าหลังสร้างโดย `src/services/booking.service.ts:201` — ฝั่งที่พัก feature 00017)

spec/baseline ของ phase นี้ enumerate ไว้แค่ 2 ค่า โค้ดจึงเขียนเงื่อนไขเป็น "ไม่ใช่ `NO_SHIPPING` = ต้องส่งของ":
- `components/order-action-set.ts:65` — `const hasShipping = fulfillmentMode !== 'NO_SHIPPING'`
- `components/OrderFactsCard.tsx:286` — `const showShippingSection = fulfillmentMode !== 'NO_SHIPPING'`

**ผล:** ออเดอร์จองห้องพัก (`PICKUP`) จะแสดง section "การจัดส่ง" พร้อม callout "ยังไม่แจ้งเลขพัสดุ" และมีปุ่ม "แจ้งเลขพัสดุ" ทั้งที่ไม่มีอะไรต้องส่ง

**สถานะการตรวจ:** ยืนยันจากโค้ดแล้ว (static) · **ยังไม่ได้เห็นบนจอจริง** — order `PICKUP` ที่มีในฐานไม่ได้เป็นของร้านที่ล็อกอินอยู่ตอน QA จึง render ไม่ขึ้น

**ทางเลือก:** (ก) เปลี่ยนเงื่อนไขเป็น allow-list `fulfillmentMode === 'SHIPPED'` แทน deny-list (ปลอดภัยกว่า ค่าใหม่ในอนาคตจะไม่หลุดเข้าโหมดส่งของเอง) · (ข) จัด `PICKUP` เป็นโหมดที่ 3 ที่มี section ของตัวเอง ("รับเอง/เช็คอิน") = งานแยก

**หมายเหตุกระบวนการ:** นี่คือช่องที่ทั้ง design spec, scope baseline และ reviewer 8-gate มองไม่เห็น เพราะทุกชั้นอ่านจาก spec ที่ enumerate ค่าไม่ครบเหมือนกัน — เจอได้เพราะ query ค่าจริงในฐานตอน QA

**G-2 · ~~แถบตรึงโผล่ตั้งแต่ยังไม่เลื่อน~~ — ถอน: ไม่ใช่บั๊ก (วัดผิด)**

รายงานไว้ตอน browser QA 2026-07-31 ว่าปุ่ม action โผล่ซ้ำ 2 ชุดบน desktop → **ตรวจซ้ำแล้วไม่จริง ถอนทิ้ง**

โค้ดใน `StatusHero.tsx:169-172` คุมด้วย `stuck ? 'opacity-100' : 'pointer-events-none invisible h-0 opacity-0'` และ `aria-hidden={!stuck}` อยู่แล้ว วัดค่า computed จริงได้:

| ชุด | y | สถานะจริง | ผู้ใช้เห็น |
|---|---|---|---|
| แถบตรึง | 117 | `visibility: hidden` (สืบทอดจาก `invisible`) | ไม่ |
| inline หัวหน้า | 261 | ปกติ | **ใช่ (ชุดเดียว)** |
| แถบล่าง | - | `display: none` จาก `lg:hidden` | ไม่ |

**สาเหตุที่รายงานผิด:** probe รอบนั้นกรอง "มองเห็น" ด้วย `getBoundingClientRect().width>0 && height>0` อย่างเดียว — element ที่ `visibility:hidden` ยังมี layout box อยู่ จึงถูกนับว่ามองเห็น (probe รอบแรกที่เช็ค `visibility` ด้วย ให้ผลถูกว่ามีชุดเดียว)

**บทเรียน:** เกณฑ์ "ผู้ใช้เห็นจริงไหม" ต้องเช็ค `visibility` + `display` + ancestor chain ไม่ใช่แค่ขนาดกล่อง — ไม่งั้นจะได้ false positive แบบนี้ และเกือบทำให้ไปแก้โค้ดที่ไม่ได้พัง

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-31 | baseline สร้าง | - | - |
| 2026-07-31 | **S-8 แก้ acceptance (1)** — ไม่ merge เป็น component เดียวกับ `BulkActionBar` แล้ว: สร้าง `src/components/safepay/OrderActionBar.tsx` สำหรับหน้า detail อย่างเดียว **ห้ามแตะ `BulkActionBar.tsx`** (acceptance (2) "หน้า list เหมือนเดิม 100%" จึงผ่านโดยอัตโนมัติเพราะไม่ถูกแก้) | planner พิสูจน์ว่าสองอันต่างกันทั้ง positioning (floating pill กลาง-ล่าง vs แถบเต็มความกว้างติดขอบล่าง), data model (`TableRow<OrderRow>[]` multi-select vs single-order state matrix) และ visual container — ของร่วมมีแค่ `.btn`/`.btn-icon` ซึ่งเป็น global primitive อยู่แล้ว ฝืนรวม = เพิ่ม complexity + เสี่ยงพังหน้า list โดยไม่ได้ประโยชน์ | Controller |
| 2026-07-31 | **S-9 แก้ acceptance (1)** — ไม่ใช้ `DraftOrderProvider`/`ShipmentDraftPanel` ของแชท เปลี่ยนเป็นสร้าง `ShipmentEntryModal.tsx` ของหน้านี้เอง (ห่อ segmented MANUAL/iShip + `ShipForm`/`ShipmentPanel` เดิม) | planner ยืนยัน 3 ชั้น: (1) `ShipmentDraftPanel` บังคับ prop `conversationId` แต่ `Order` ไม่มี relation ไป `Conversation` เลย (ออเดอร์ POS ไม่มีให้ใช้) (2) `DraftOrderProvider` mount เฉพาะ `(chat)/layout.tsx` คนละ route group (3) spec ต้นทางระบุ "ห้ามแตะ `ShipmentTracking`" = iShip-only ทำโหมดกรอกเลขเองไม่ได้ | Controller |
| 2026-07-31 | **S-5/S-6 ตัด "แก้ไขคำสั่งซื้อ" ออกจากเมนู ⋮ ของสถานะ SHIPPED** (คงไว้เฉพาะ PENDING) | `orders/[token]/edit/page.tsx:76` guard `status !== 'PENDING'` แสดงหน้า blocked ทันที — เมนูที่กดแล้วเจอ dead-end คือ defect ให้เมนูตรงกับ capability จริงของระบบ | Controller |
| 2026-07-31 | **S-7 แก้ acceptance (2)** — ถอด `/orders` (list) ออกจากรายการ regression "ต้องยังเห็น nav" แล้วใส่ `/orders/new` + `/orders/<token>/edit` แทน | acceptance เดิมที่ product เขียนไว้**ผิดข้อเท็จจริง**: โค้ดก่อน phase นี้ (`SellerBottomNav.tsx:145` ที่ commit `5665f681`) ซ่อน nav บนหน้า `/orders` list อยู่ก่อนแล้ว ("หน้า full-screen focused มี back มุมซ้ายบน") — ไม่ใช่พฤติกรรมที่งานนี้ทำให้เปลี่ยน แก้เอกสารให้ตรงของจริง ไม่ใช่แก้โค้ดให้ตรงเอกสาร | Controller |
| 2026-07-31 | **S-2 เพิ่มเงื่อนไข NO_SHIPPING** — ออเดอร์ `fulfillmentMode=NO_SHIPPING` **ซ่อน section 3 (การจัดส่ง) ทั้ง section** เหลือ 2 section; acceptance (2) "3 section เห็นครบทุกสถานะ" หมายถึงทุก *สถานะออเดอร์* ไม่ใช่ทุก *fulfillmentMode* | user ตัดสิน. verify แล้วว่าไม่มี regression: `accessUrl` (ลิงก์ส่งมอบสินค้าดิจิทัล) อยู่ใน `PaymentCard.tsx` gate ด้วย `fulfillmentMode==='NO_SHIPPING'` ซึ่ง v5 ยุบเข้า **section 2** ไม่ใช่ section 3 → ไม่หายจากหน้า; `ShippingActivity` ก็ filter ขั้น SHIPPED ออกสำหรับ path นี้อยู่แล้ว | user |

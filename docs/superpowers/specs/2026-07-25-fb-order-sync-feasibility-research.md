# Feasibility Research: Deep Order → Meta Business Suite / Commerce API

> Research spike (2026-07-25) — ตอบคำถาม feasibility ตาม request ลูกค้า: "เมื่อ Deep สร้าง order
> อยากให้ไปสร้าง/สะท้อน order นั้นบน Meta Business Suite ผ่าน API ด้วย". ไม่ใช่ requirement/FR
> — ถ้าจะทำต้องเข้า Requirement mode แยก. อ้างอิงเอกสาร Meta ทางการเท่านั้น.

## Verdict สั้น

- **สร้าง/push order เข้า Meta Commerce/Business Suite จริง = ทำไม่ได้ (Not feasible)**
- **ส่ง "ใบสรุปคำสั่งซื้อ" เข้าแชท Messenger ลูกค้า = ทำได้บางส่วน (Partially feasible)** — Send API Receipt
  Template แต่เป็นแค่การ์ดในแชท ไม่ใช่ order ใน Commerce Manager

## Q1 — มี API ให้ merchant "สร้าง order" เข้า Business Suite/Commerce ไหม? → ไม่มี

หลักฐานตรงกัน:
1. `{page-id}/commerce_orders` — **GET only** ไม่มี POST create
   (developers.facebook.com/docs/graph-api/reference/page/commerce_orders)
2. Order API (current) — มีแค่ `GET /{CMS_ID}/commerce_orders`, `GET /{ORDER_ID}`, `.../items` — ไม่มี create
   (developers.facebook.com/docs/commerce-platform/order-management/order-api)
3. Legacy Order API — "After the user has completed the checkout flow ... the order will be made
   available for partners to manage" = order เกิดจาก **Meta checkout เท่านั้น** partner จัดการ lifecycle ต่อ
   (developers.facebook.com/docs/commerce-platform/order-management/legacy-api)
4. Permission `commerce_account_manage_orders` = "read and update orders" — ไม่มีคำว่า create
   (developers.facebook.com/docs/permissions/)
5. Order state machine เริ่มที่ `FB_PROCESSING` (เกิดจาก checkout ของ Meta) — ไม่มี state ที่ partner เปิด order ใหม่

## Q2 — เส้นทางที่เป็นไปได้

| เส้นทาง | Create ได้ไหม | สรุป |
|---|---|---|
| Commerce Platform / Commerce Manager API | ❌ | order ผูก native checkout บน Meta, partner อ่าน+อัปเดต lifecycle |
| Orders API `/{page_id}/commerce_orders` | ❌ (GET only) | ดู Q1 |
| Business Suite Inbox "Confirm a new order" | ❌ ไม่มี public API | Inbox Suggestion — seller กดเองใน UI, ไม่ expose ผ่าน API |
| Messenger Send API — Receipt Template | ⚠️ ไม่ใช่ order ใน Meta | ส่งการ์ดสรุปเข้าแชทได้ (Send API เดิม) แต่ไม่สร้าง record ใน Commerce Manager |
| Messenger Buy Button / Payments | ❌ US only | Messenger Payments จำกัด US + provider เฉพาะ |
| Catalog / Product API | ทางอ้อม | order item reference product_id จาก catalog — ไม่เกี่ยว push order เข้า Meta |

## Q3 — ข้อจำกัด (ถึงสมมติว่ามี create API)

1. Native checkout-on-Meta = **US only** ("Checkout on Facebook and Instagram is currently only
   supported in the United States")
2. **ไทย = website-checkout** (redirect ออกไปเว็บร้านจ่ายเงิน) ไม่ใช่ native → order บน Meta ไม่เกิดตั้งแต่ต้น
3. Permission `commerce_account_manage_orders`/`_read_orders` ต้องผ่าน **App Review** + screencast
4. ต้องมี Commerce Account + Shop + Catalog ก่อน (Deep ยังไม่มี — เป็นแค่ Page connect + Send API)

## Q4 — ทางเลือกที่ทำได้จริง (เรียงตามความเป็นไปได้)

1. **ส่ง Receipt Template เข้าแชท Messenger (แนะนำ, effort ต่ำ)** — เมื่อ Deep สร้าง order → Send API
   ส่งการ์ดสรุป (items/subtotal/shipping/tax/total) เข้าแชท. **เป็นแค่การ์ดในแชท ไม่ใช่ order ใน Meta Commerce.**
   ข้อควรระวัง: ต้องอยู่ใน 24h customer service window; `POST_PURCHASE_UPDATE` message tag deprecated
   (27 เม.ย. 2026) — ต้องหา tag ทดแทนที่ยังใช้ได้ก่อน implement
2. **แนะนำ seller กด "Confirm a new order" เองใน Business Suite Inbox** (manual, ไม่ผูก API)
3. ตั้ง FB/IG Shop + Commerce Account + Catalog + App Review — **effort สูงมาก แต่ยังตันที่ Q1/Q3** ไม่แนะนำ
4. ทำไม่ได้เลย — ถ้าลูกค้าหมายถึง "order โผล่ใน Commerce Manager/Orders tab" = ทำไม่ได้ทุกกรณี

## Q5 — Verdict + คำแนะนำ

- **"สร้าง order เข้า Meta Business Suite จริง" = Not feasible** (ไม่มี create endpoint ทั้ง current/legacy;
  ไทยไม่มี native checkout)
- **"ส่งใบสรุป order เข้าแชท" = Partially feasible** (Send API Receipt Template; effort ต่ำ) — ต้องเคลียร์
  24h window / message tag ก่อน + สื่อสารให้ชัดว่าเป็น "การ์ดในแชท" ไม่ใช่ "sync เข้า Business Suite"
- **Reframe feature:** "ส่งใบสรุปคำสั่งซื้อเข้าแชท Messenger อัตโนมัติเมื่อสร้าง order" ไม่ใช่ "sync order เข้า
  Business Suite". ถ้าลูกค้าต้องการฝั่งหลัง → เป็นข้อจำกัดของ Meta ไม่ใช่ Deep

## จุดที่ยังต้องยืนยันซ้ำก่อนเข้า Requirement mode (WebFetch เจอ 404/auth-wall)

1. รายชื่อ message tag ปัจจุบันที่ยังใช้ได้ (แทน `POST_PURCHASE_UPDATE`) — เปิด Send API Reference ตรง ๆ
2. Eligibility ประเทศของ native checkout — cross-check Meta Business Help Center ตัวจริง
3. Business Suite Inbox "Confirm a new order" ไม่มี API — อนุมานจากการไม่พบเอกสาร ควรถาม Meta partner support
   ถ้าต้องการชัวร์ 100%

## Sources
- developers.facebook.com/docs/graph-api/reference/page/commerce_orders
- developers.facebook.com/docs/commerce-platform/order-management/order-api
- developers.facebook.com/docs/commerce-platform/order-management/legacy-api
- developers.facebook.com/docs/commerce-platform/order-management/acknowledgement-api
- developers.facebook.com/docs/permissions/
- developers.facebook.com/docs/messenger-platform/send-messages/template/receipt/
- developers.facebook.com/docs/messenger-platform/reference/send-api/
- facebook.com/business/help/991413128263758 (Inbox Suggestions)
- facebook.com/business/help/449169642911614 (Checkout Methods & Eligibility)

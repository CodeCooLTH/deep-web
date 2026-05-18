# RESUME CHECKPOINT — Seller Orders Phase B (+ Phase A Unit D ค้าง)

> อัปเดต 2026-05-18 (session พักไว้ตรงนี้). ไฟล์นี้ recreate บน branch `feat/seller-orders-phase-a` (ต้นฉบับเดิมอยู่บน `main` commit `eaa7b9b` เท่านั้น — branch นี้ไม่มี จึงเขียนใหม่ให้ตรงสถานะจริง)
> **คำสั่งเริ่ม session ใหม่:** "อ่าน `docs/superpowers/plans/2026-05-17-seller-orders-phase-b-resume.md` + `git log --oneline -15` แล้วทำต่อตาม §RESUME"

---

## ⚡ RESUME — ทำต่อตรงนี้

**Phase B B0-B8 = CODE-COMPLETE** (ไม่ใช่ verified — ยังไม่ผ่าน QA runtime). branch **`feat/seller-orders-phase-a`** (ห้าม commit งานนี้ลง `main`/`docs/seller-orders-handoff`). commits linear:

| commit | unit | สาระ |
|---|---|---|
| `7c3203d` | B0 | Order +7 nullable field (schema) |
| `4fe522d` | Unit1 (B1+B2) | CreateOrderSchema+createOrder รับ field ใหม่ (total=round2(subtotal−discount+vat)) + `GET /api/orders/customers` |
| `e75f917` | Unit2 (B3) | thread `Product.fulfillmentMode` เข้า catalog |
| `94a3857` | Unit3 (B4-B8) | Create rework: CustomerSelectBlock/PaymentChannelBlock/CartBlock/OrderSummaryPanel + OrderCreateForm compose + ProductPicker indicator |
| `740819c` | retro | retro + promote convention #28-31 |

Reviewer 8-gate PASS ทุก batch · tsc 0 (เหลือเฉพาะ `prisma/qa-seed.ts` pre-existing parallel-noise) · migration `20260517050000` apply ลง dev DB (Supabase cloud) แล้ว 2026-05-17.

**งานเหลือ ตามลำดับ:**
1. **QA-debt Phase B** (priority — phase ปิดแบบ code-complete, ไม่มี runtime/E2E). user start dev server เอง (Claude ไม่ start) → Controller dispatch `safepay-qa` **batch-E2E + end-of-phase** ที่ `seller.deepth.local` (curl-probe port 3000/4000). Scenario: สร้างออเดอร์ผ่าน 4 block → ค้นลูกค้าเดิม (`/api/orders/customers` debounce+stale-guard) + เพิ่มใหม่ → discount(฿)+VAT(%) honest breakdown ใน summary → derive type จาก cart → ที่อยู่จัดส่ง auto-show เมื่อมี item SHIPPED → POST `/api/orders` → redirect `/orders/{token}` → **verify field ใหม่ persist จริงใน DB**. เขียว = Phase B verified-complete.
2. **Phase A Unit D** (Detail rework variant A) ยังค้างทั้งดุ้น — spec handoff §3.2 + mockup `docs/mockups/seller-orders/detail-a.html`. ถาม user ทำต่อเลย หรือหลัง QA Phase B.
3. Backlog nice-to-have: cart `SUBSCRIPTION` ล้วน → `derivedType` ตก `DIGITAL` (plan §3 ล็อก 3-way ไม่ครอบ SUBSCRIPTION).

**อย่า re-run B1-B8.** อ่าน retro `docs/retro/2026-05-17-seller-orders-phase-b.md` ก่อนทำ phase ต่อไป.

---

## Decisions ที่ล็อกแล้ว (อย่าถามซ้ำ)

- detail = variant A (Status Hero) `detail-a.html`
- SKU ตัดออกทุกหน้า; รูปสินค้า join `Product.images[0]` runtime ผ่าน `/api/files/{id}`
- discount/VAT, paymentMethod, salesChannel, internalNote, buyerName = persist (อยู่ใน MVP). **discount/VAT ใส่ใน Create UI + honest breakdown ใน summary** (user ยืนยัน 2026-05-17 แม้ mockup เดิมไม่มี — ทับ mockup)
- `shippingAddress` JSON shape = `{line1, subdistrict, district, province, postcode, note}` (locked; client strip key ว่างก่อนส่ง)
- ประเภทออเดอร์ใน Create = derive จากสินค้า (ไม่มี dropdown); client ส่ง type → server re-derive fulfillmentMode จาก DB เป็น single source
- `vatRate`: form เก็บเป็น % (เช่น 7), onSubmit ÷100 → API 0..1 (Decimal(5,4)); `vatAmount` = round2((subtotal−discount)*vatRate/100) compute ตอน submit ไม่ใช่ form field
- buyer order link phone-unlock ไม่มี OTP; slip + buyer-cancel(PENDING) = phase หลัง ไม่ใช่ Phase B
- OQ-3 displayId: fallback `publicToken.slice(0,8)`

## ข้อห้าม / parallel-stream

ห้าม `git add -A` — stage เฉพาะ path ของ task เสมอ. working tree มี noise ของ parallel stream (`docs/.obsidian/`, `docs/prompts/`, `prisma/qa-seed.ts` มี pre-existing tsc error ไม่ใช่ของเรา; เป็นครั้งคราว WalletCard/`api/o/sms/[code]` ของ wallet stream). ห้ามแตะ parallel: `(marketing)/o/[token]/**`, admin auth, `api/wallet/**`, badge/qa-seed/scripts, `(paces)/seller/(dashboard)/layout.tsx`.

## เอกสารอ้างอิง

- Handoff spec เต็ม: `docs/superpowers/specs/2026-05-17-seller-orders-handoff.md`
- Mockup: `docs/mockups/seller-orders/{create,detail-a,list,buyer-order-link}.html`
- Retro Phase B: `docs/retro/2026-05-17-seller-orders-phase-b.md`
- Convention workflow (lesson #28-31 ใหม่): `docs/conventions/agent-team-workflow.md`
- PRD: `docs/PRD.md` (FR-6.11/12/13 + state machine)

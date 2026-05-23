# Scope Baseline — Order Detail V1 (Profile-consistent Port)

สถานะ: ACTIVE
อ้างอิง PRD: FR-6.2, FR-6.3, FR-6.11, FR-6.13, FR-7.1, FR-7.2, FR-9.6 · spec: `docs/superpowers/specs/2026-05-23-order-detail-redesign-design.md` · mockup SSOT: `docs/mockups/order-detail-scenarios.html`

## Goal

Port หน้า buyer-facing `/o/[token]` (`OrderDetailMobile.tsx`) จาก layout Shopee-style ปัจจุบันให้กลายเป็น V1 "Profile-consistent" ตาม mockup ที่ user อนุมัติแล้ว โดยคงพฤติกรรมและ props ทั้งหมดเดิมไว้ครบถ้วน

---

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | **Data layer — PublicOrderData เพิ่ม fields ที่ขาด** — เพิ่ม `shop.user.avatar`, `shop.logo`, `cancelInitiator`, per-item `imageUrl` (จาก `Product.images[0]` raw) เข้า `PublicOrderData` type + query include (`getOrderByToken`) + map ใน `page.tsx`. (`maxVerifyLevel`, `fulfillmentMode`, `paymentMethod`, `shipmentTracking` มีอยู่แล้ว) | `PublicOrderData` มี fields ครบ; `tsc --noEmit` 0 errors; query ดึง `product.images` + `user.avatar` ได้ (ทดสอบด้วย seed) | TODO |
| S-2 | **Helper `getOrderTimeline(status, type, fulfillmentMode, paymentMethod)`** — pure function คืน array `{label, state}` ≤3 จุด (windowed prev/current/next) รองรับ states: `done`, `cur`, `fin`, `cx`, `mute`, `up`; รองรับ PHYSICAL/SHIPPED และ DIGITAL/SERVICE/SUBSCRIPTION/NO_SHIPPING variants; PENDING+transfer→"รอชำระเงิน" / PENDING+COD→"รอยืนยัน" | unit test (Vitest) ครอบ combination ของ status×type×fulfillmentMode×payment ที่เป็นไปได้; function export ได้และ `tsc` 0 errors | TODO |
| S-3 | **Helper `getStatusPill(status)`** — คืน `{bg, text, dot}` ตาม palette ที่กำหนดใน spec (pend/ship/succ/canc) | ค่าสีตรงตาม spec §2 ทุก status; `tsc` 0 errors | TODO |
| S-4 | **Banner + back button** — tier cover banner สูง 120-140px (ใช้ `getTierCover(trustScore)` SSOT จาก `src/lib/trust-tier.ts`); ปุ่ม back (frosted circle) มุมซ้ายบน; ชั้นวางตรงตาม mockup scenario ทุกสถานะ | screenshot / Chrome DevTools: banner แสดง tier cover image ตาม trust score ของ shop; ปุ่ม back navigate กลับได้; ไม่มี layout shift บน viewport 390px | TODO |
| S-5 | **Avatar + verify badge** — avatar ซ้อนทับ banner (overlap, `margin-top` ลบ) กึ่งกลาง; verify badge (วงกลมฟ้า ✓) มุมขวาล่างเมื่อ `maxVerifyLevel ≥ 1`; ใช้ raw image URL ตาม frozen contract (ไม่ผ่าน `/api/files`) | avatar render ถูก position; badge แสดงเมื่อ `maxVerifyLevel ≥ 1` / ซ่อนเมื่อ = 0; ทดสอบทั้ง 2 case ด้วย seed data | TODO |
| S-6 | **Shop identity section** — shop name, @handle, trust chips (ยืนยันแล้ว / Deep tier name / Trust score) กึ่งกลาง; ใช้ `getTierLabel`/`getTierColor` จาก `src/lib/trust-tier.ts` | chip แสดงชื่อ tier ตรงกับ `Tier Lists.md`; verified chip แสดงเฉพาะ `maxVerifyLevel ≥ 1`; Trust score ตรงกับ DB | TODO |
| S-7 | **Status pill + meta** — status pill สีตาม `getStatusPill`; แสดง #token ย่อ + วันที่สร้าง order | pill แสดงสีและ label ถูกต้องทุก status; วันที่ format ภาษาไทย | TODO |
| S-8 | **Horizontal timeline 3-step** — windowed (prev/current/next) จาก `getOrderTimeline`; dot modifiers `done/cur/fin/cx/mute/up` ตาม CSS tokens ใน spec; flat (ไม่มี card รอบ timeline) | timeline render ถูก step และ style ทุก scenario ที่ไม่ถูก defer; เปรียบกับ mockup ด้วย Chrome DevTools | TODO |
| S-9 | **Product items + thumbnail images** — flat card รายการ item; รูปสินค้าจาก `imageUrl` (raw) ผ่าน `<img>`; fallback placeholder เมื่อ null; grayscale เมื่อ CANCELLED | รูป render ทุก item ที่มี image; fallback ไม่ crash; CANCELLED items มี CSS `filter: grayscale` | TODO |
| S-10 | **Payment method section** — แสดง COD copy เมื่อ `paymentMethod` เป็นรูปแบบ COD/เงินสด; แสดง transfer copy + ชื่อ method เมื่อเป็นโอนเงิน/พร้อมเพย์ | ทดสอบ 2 cases: seed paymentMethod COD และ โอนเงิน; UI copy ตรงตาม mockup | TODO |
| S-11 | **Shipment tracking box** — แสดง `ShipmentTracking.provider` + `trackingNo` + ปุ่มคัดลอก (scenario 4: SHIPPED + PHYSICAL); ซ่อนทั้งหมดเมื่อ tracking null | tracking box แสดงเมื่อมี data; ปุ่มคัดลอก copy trackingNo ลง clipboard; ซ่อนเมื่อ null — ทดสอบทั้ง 2 case | TODO |
| S-12 | **Review section (scenarios 5 & 6)** — scenario 5 (CONFIRMED + ยังไม่รีวิว): การ์ดชวนรีวิว + `ReviewForm`; scenario 6 (CONFIRMED + รีวิวแล้ว): แสดง rating ดาว + comment + badge; ใช้ `ReviewForm` component เดิม ไม่แก้พฤติกรรม | scenario 5 แสดง form; scenario 6 แสดง submitted review; ทั้งคู่ match mockup; props เดิมยังทำงานได้ | TODO |
| S-13 | **Cancel state (scenario 7)** — CANCELLED: timeline dot `.cx` แดง; กล่องแสดง cancelInitiator-derived copy ("ร้านค้ายกเลิก" / "คุณยกเลิก"); รูปสินค้า grayscale; CTA เปลี่ยนเป็น "ติดต่อร้านค้า" (ghost) | ทดสอบ 2 sub-case: `cancelInitiator='seller'` และ `'buyer'`; copy และ timeline ถูกต้อง | TODO |
| S-14 | **CTA per state + footer** — ink button (`#0F172A`) เต็มกว้าง ตาม CTA mapping ของแต่ละ scenario (ยืนยัน/ยกเลิก/ยืนยันรับ/ให้คะแนน ฯลฯ); footer text "ปกป้องการซื้อขายโดย Deep"; props `onConfirmAction` และ `onCancel` wired ครบ | ทุก scenario กดปุ่ม CTA แล้ว handler ถูกเรียก; footer แสดงทุก scenario; ไม่มี scenario ที่ CTA หาย | TODO |
| S-15 | **Visual consistency กับ `/u/[username]`** — font Anuphan, flat card style (`box-shadow: 0 1px 2px`), tier cover image set, verify badge, trust chips — ใช้ pattern เดียวกับ `UserProfileHeader.tsx` | เปิดทั้ง 2 หน้าบน Chrome: tier cover เดียวกัน, font เดียวกัน, verify badge เดียวกัน | TODO |
| S-16 | **Type-check pass** — `tsc --noEmit` 0 errors หลัง port เสร็จ | manual `tsc --noEmit` output ไม่มี error | TODO |

---

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | **Slip upload zone + "แนบสลิปแล้ว" state** (scenarios 1-2 ส่วน slip UI) — ต้องการ `Order.requiresSlip`, `slipUrl`, storage upload endpoint, security review | Deferred → Phase 2 backend (ฟิลด์ยังไม่มีใน schema; scenario 1/3 render ได้แต่ slip zone = absent/`// TODO Phase 2`) |
| OOS-2 | **Digital access link box** (scenario 8 ส่วน delivery-link display) — ต้องการ field เก็บ delivery link/email | Deferred → Phase 2 backend (ฟิลด์ยังไม่มีใน schema; scenario 8 render ได้แต่ link box = absent/`// TODO Phase 2`) |
| OOS-3 | **เปลี่ยนพฤติกรรม props/handlers** (`onConfirmAction`, `onCancel`, `unlockedPhone`, `ReviewForm`) — phase นี้เป็น visual rewrite เท่านั้น | ขอบเขตชัด — behavior change = ออก scope ใหม่ |
| OOS-4 | **Seller-side order detail UI** (Paces/seller subdomain) | ไม่ใช่ scope นี้ — buyer-facing `/o/[token]` เท่านั้น |

---

## Assumptions

- **Raw image/avatar contract (frozen by Controller):** product image URL = `(Product.images as string[])[0] ?? null` ใช้ raw (ไม่ผ่าน `/api/files/{id}`); avatar = `User.avatar` raw — เหมือน `/u/[username]/page.tsx:98,109` พอดี. ถ้าต้องการเปลี่ยน = scope change.
- **รูป thumbnail ใช้ `<img>` ธรรมดา** (pattern เดียวกับ `OrderCard.tsx` ProductImage) — ไม่ใช้ `next/image` เพื่อตัด coupling กับ remote allowlist; รองรับทั้ง picsum URL (seed) และ path อื่น.
- **picsum.photos = dev/test เท่านั้น:** `next.config.ts` allowlist picsum ใช้ได้ใน dev; ห้าม ship ขึ้น prod; QA ทำบน dev server ที่มี seed data.
- **Anuphan font:** ทุก surface ของ component นี้ใช้ Anuphan ตาม Hard Rule 5; font load มาจาก `(marketing)/layout.tsx` แล้ว.
- **Mobile-first baseline:** mockup width 380-392px คือ baseline; ใช้ MUI breakpoints สำหรับ responsive กว้างขึ้น.
- **MUI v9 (Vuexy):** buyer route group ใช้ MUI v9 + Emotion; ห้ามนำ Preline/Tailwind-only class เข้ามา.
- **`ShipmentTracking` relation พร้อมใช้:** spec §3 marked ⚠️ แต่ Controller verify แล้วว่า relation EXISTS และอยู่ใน `PublicOrderData` query — ถือเป็น ✅ buildable; S-11 ไม่ใช่ deferred.
- **cancelReason ไม่มีใน schema:** scenario 7 แสดง copy ที่ derive จาก `cancelInitiator` ("ร้านค้ายกเลิกคำสั่งซื้อ" / "คุณยกเลิกคำสั่งซื้อ") ไม่มี free-text reason.
- **Theme copy rule (Hard Rule 1/3):** commit ที่แตะ `OrderDetailMobile.tsx` ต้องมี `Base:` line ชี้ Vuexy source file ที่ copy pattern มา.
- **Dev server เป็นของ user:** Claude ไม่ start server; QA ทำผ่าน `deepth.local` จริง; port probe ก่อนใช้.

---

## Deferred → Phase 2

> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off

- **Slip upload zone** (scenarios 1-2): รอ `Order.requiresSlip` + `slipUrl` + storage + security review — render `// TODO Phase 2` comment ใน code
- **Digital access link box** (scenario 8): รอ delivery-link/email field — render `// TODO Phase 2` comment ใน code

---

## Acceptance (phase-level)

ถือว่า phase ผ่านเมื่อทุกข้อต่อไปนี้เป็นจริงพร้อมกัน:

1. `tsc --noEmit` 0 errors (S-16)
2. เปิด `docs/mockups/order-detail-scenarios.html` แล้วเทียบ Chrome DevTools: ทุก 8 scenarios render ถูกต้องตาม mockup — **ยกเว้นเฉพาะ slip zone (OOS-1) และ digital link box (OOS-2)** ซึ่งต้องไม่ปรากฏ (absent หรือมี TODO comment ใน code เท่านั้น)
3. กด confirm / cancel / review ใน scenario จริง (dev DB): handler ทำงานได้ไม่แตก — พิสูจน์ว่า props เดิมไม่ถูก break (S-3, S-12, S-14)
4. visual consistency กับ `/u/[username]`: tier cover, font, verify badge, trust chips — ดูสอดคล้องกัน (S-15)
5. ไม่มี OOS-id ถูกแตะ (ไม่มี slip upload, ไม่มี delivery-link field ใหม่, ไม่มี behavior change)

---

## Change Log

> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-05-23 | baseline สร้าง | - | - |
| 2026-05-23 | S-2 drop unused `type` param → `getOrderTimeline(status, fulfillmentMode, paymentMethod)`; S-3 → `getStatusPill(status, fulfillmentMode, paymentMethod)` (PENDING label แยก 3 กรณี digital/COD/transfer ต้องใช้ทั้ง 2 param) | type info subsumed โดย fulfillmentMode; ไม่กระทบ scope coverage, Vitest ครอบ combinations ครบ | Controller (Gate 1) |

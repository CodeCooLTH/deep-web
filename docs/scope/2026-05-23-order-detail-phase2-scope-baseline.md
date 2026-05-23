# Scope Baseline — Order Detail Phase 2 (Slip Attachment + Digital Access Link)

สถานะ: SIGNED-OFF (Gate 2 · 2026-05-23)
อ้างอิง PRD: FR-6.12, FR-6.11, FR-6.6, FR-6.8 · spec: `docs/superpowers/specs/2026-05-23-order-detail-phase2-design.md` · mockup SSOT: `docs/mockups/order-detail-scenarios.html`

## Goal

ปลดล็อก OOS-1 และ OOS-2 จาก V1 Scope Baseline: เพิ่มฟีเจอร์แนบสลิปโอนเงินโดย buyer (transfer PENDING) และส่งมอบ URL เข้าถึง digital order โดย seller พร้อม UI ทั้งฝั่ง buyer (Vuexy/MUI) และ seller (Paces) บนฐาน storage/upload/files-gate ที่มีอยู่แล้ว

---

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | **Migration — เพิ่ม 2 nullable field ใน Order** — `slipFileId String?` และ `accessUrl String?` ใน `prisma/schema.prisma`; ออก migration ใหม่ | `prisma migrate deploy` รันสำเร็จ (exit 0); column ทั้งสองปรากฏ; order เดิมไม่ถูก break (ค่า null ตามปกติ) | TODO |
| S-2 | **PublicOrderData + data flow — เพิ่ม `slipFileId` และ `accessUrl`** ใน `PublicOrderData` type + `getOrderByToken` query + map ใน `o/[token]/page.tsx` | `tsc --noEmit` 0 errors; type มีทั้งสองฟิลด์ (nullable); seed order ตรวจสอบได้ใน Network response | TODO |
| S-3 | **Valibot schemas — 2 ชุด** ใน `src/lib/validations.ts`: (a) slip: `{ fileId }` + contact/smsUnlock parity; (b) accessUrl: `{ url }` validate scheme ∈ {http, https} (reject `javascript:`, `data:`, `ftp:`, อื่น ๆ) | Vitest: accept `http://`/`https://`; reject `javascript:alert(1)`, `data:...`, `ftp://`, empty; `tsc` 0 | TODO |
| S-4 | **`POST /api/orders/[token]/slip`** (buyer auth: contact parity เหมือน cancel หรือ SMS-unlock cookie); body Valibot; call `attachSlip`; guard: PENDING เท่านั้น → CONFIRMED/CANCELLED ตอบ 400; ไม่เปลี่ยน status | curl POST (contact ถูก, PENDING) → 200 + `slipFileId` set; (ไม่ใช่ PENDING) → 400; (contact ผิด) → 401/403 | TODO |
| S-5 | **`POST /api/orders/[token]/access-url`** (seller auth: session owner เท่านั้น); body Valibot accessUrl; call `setAccessUrl`; ไม่จำกัด status | curl POST (owner session, digital) → 200 + `accessUrl` set; (scheme ไม่ใช่ http/https) → 400; (non-owner) → 403 | TODO |
| S-6 | **`attachSlip` + `setAccessUrl` services ใน `order.service.ts`** — `attachSlip(token, fileId, contact?)`: findUnique + contact parity + status guard + update; `setAccessUrl(token, url, shopOwnerId)`: findUnique + verify owner + update | `attachSlip` PENDING → set; CONFIRMED → throw; contact ผิด → throw; `setAccessUrl` owner → set; non-owner → throw; `tsc` 0 | TODO |
| S-7 | **`/api/files/[fileId]` — เพิ่ม order-slip gate** ต่อจาก topUp slip block: `findFirst` `Order.slipFileId === fileId` → sensitive (seller shop owner + admin); guest/no-session → 401; non-owner non-admin → 403; header `private, no-cache` + `nosniff` | curl GET slip ไม่มี session → 401; non-owner session → 403; seller-owner → 200 + `Cache-Control: private, no-cache` | TODO |
| S-8 | **Buyer slip UI — `slip-empty`** ใน `OrderDetailMobile.tsx`: zone อัปโหลด เมื่อ `showSlipZone = status==='PENDING' && !isCODPayment(paymentMethod)` และ `slipFileId == null`; ตาม mockup `.slip-empty` | DevTools: PENDING+transfer ไม่มี slip → zone ปรากฏ; PENDING+COD → ไม่ปรากฏ; CONFIRMED → ไม่ปรากฏ | TODO |
| S-9 | **Buyer slip UI — upload + `slip-done`**: 2-step (POST `/api/upload` → fileId → POST `/api/orders/[token]/slip`); optimistic → slip-done ("แนบสลิปแล้ว ✓" + filename/icon + "เปลี่ยน"); client-side `URL.createObjectURL` preview รอบ upload; reload → text/icon (ไม่โหลดจาก server); reuse `validateUpload` | DevTools: jpeg ≤5MB → slip-done ทันที; >5MB → error; reload → slip-done icon/text ไม่มี `<img>` จาก server | TODO |
| S-10 | **Buyer access-link UI** ใน `OrderDetailMobile.tsx`: การ์ด "ลิงก์เข้าถึง" + ปุ่ม "เปิด" (`href` `target=_blank` `rel=noopener noreferrer`) เมื่อ `fulfillmentMode==='NO_SHIPPING'` AND `accessUrl != null` AND scheme ∈ {http,https}; ซ่อนเมื่อ null | DevTools: digital + accessUrl → การ์ด+ปุ่มกดได้ target=_blank; digital ไม่มี accessUrl → ซ่อน; PHYSICAL + accessUrl → ซ่อน | TODO |
| S-11 | **Seller view-slip UI** ใน `OrderActions.tsx` (Paces): `<img src="/api/files/{slipFileId}">` thumbnail เมื่อ slipFileId ≠ null; คลิกเปิดเต็ม (pattern `SlipImageClient.tsx`); ซ่อนเมื่อ null | DevTools (seller subdomain): order มี slip → thumbnail; คลิก → เต็ม; ไม่มี slip → ซ่อน | TODO |
| S-12 | **Seller set-accessUrl UI** ใน `OrderActions.tsx` (Paces): input URL + "บันทึกลิงก์" (POST access-url) เฉพาะ `fulfillmentMode==='NO_SHIPPING'`; แสดง URL ปัจจุบัน; success/error feedback | DevTools (seller): digital → input ปรากฏ; http:// → บันทึก → DB update; javascript: → 400 + error; PHYSICAL → ซ่อน | TODO |
| S-13 | **Vitest unit tests** (pure): (a) URL-scheme validator accept http/https, reject javascript:/data:/ftp:/empty; (b) `showSlipZone` predicate: PENDING+transfer=true; PENDING+COD=false; SHIPPED/CONFIRMED/CANCELLED=false | `vitest run` ผ่านทุก case; 0 failures | TODO |
| S-14 | **Type-check pass** — `tsc --noEmit` 0 errors หลังครบทุก S-id (ทั้ง marketing + paces) | output ไม่มี error | TODO |

---

## Out-of-Scope

> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็น → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | **Payment state machine / PAID state** — slip ไม่เปลี่ยน status | Q1: attach-only; PAID ไม่มีใน state machine |
| OOS-2 | **`requiresSlip` per-order toggle** | Q1: showSlipZone ขึ้นกับ paymentMethod+status เท่านั้น |
| OOS-3 | **Slip OCR / auto-verify / amount-match** | ไม่มีใน MVP |
| OOS-4 | **Multi-file slip** (>1 ไฟล์/order) | 1 order = 1 slip |
| OOS-5 | **Buyer re-view slip image ผ่าน server** | Q2: guest ไม่มี session; slip sensitive seller+admin เท่านั้น |
| OOS-6 | **Admin slip UI ใหม่** | admin มี session → ผ่าน gate S-7 แล้ว |
| OOS-7 | **accessUrl set ตอนสร้าง order** | Q3: ที่ seller order detail หลังสร้างเท่านั้น |
| OOS-8 | **accessUrl placeholder เมื่อ null** ("รอส่งมอบ") | ซ่อนการ์ดทั้งหมดเมื่อ null — keep simple |

---

## Assumptions

- **Migration additive nullable:** `slipFileId`/`accessUrl` = `String?`, ไม่มี backfill, ไม่ break order เดิม; dev DB = Supabase (`.env.local`).
- **Reuse storage/upload:** `POST /api/upload` + `lib/storage.validateUpload` (≤5MB, jpeg/png/webp/pdf) มีอยู่แล้ว.
- **`/api/files` gate ใช้ `findFirst`:** Order slip traffic ไม่สูง (เหมือน topUp slip) — ยอมรับ indexed query ต่อ request.
- **Buyer guest auth = contact parity:** slip API ใช้ logic เดียวกับ cancel route (contact match / SMS-unlock cookie), ไม่ใช่ session.
- **accessUrl scheme http/https เท่านั้น** ทั้ง server (Valibot) + client render — กัน stored-XSS ผ่าน `javascript:`.
- **Font Anuphan, mobile-first** ทุก surface (buyer MUI/Vuexy, seller Paces/Tailwind); commit UI ต้องมี `Base:` line; ห้ามข้าม style system.
- **Dev server เป็นของ user:** Claude ไม่ start; QA ผ่าน `deepth.local` + `seller.deepth.local`; port probe ก่อน.
- **QA seed ต้องอัปเดต:** เพิ่ม cases (transfer PENDING + slipFileId; digital + accessUrl) ให้ S-9..S-12 ทดสอบได้ (QA prep, นับใน scope ตอน plan).

---

## Acceptance (phase-level)

1. `tsc --noEmit` 0 errors (S-14) ครอบ `(marketing)` + `(paces)`
2. Migration apply สำเร็จ (S-1); order เดิมไม่ break
3. Buyer slip upload (S-8/S-9): transfer PENDING → slip zone → upload ≤5MB → slip-done → reload = text/icon (ไม่มี server `<img>`)
4. Buyer access link (S-10): digital + accessUrl → การ์ด + "เปิด" target=_blank
5. Seller view slip (S-11): seller order detail มี slip → thumbnail
6. Seller set accessUrl (S-12): กรอก URL + บันทึก → DB update; scheme ผิด → error
7. Security gate (S-7): GET slip no-session → 401; non-owner → 403; owner → 200
8. **safepay-security review pass** — file upload authz, accessUrl XSS/redirect guard, slip serving gate, slip attach contact parity
9. Visual ตรง mockup SSOT (slip-empty/slip-done/access card) — DevTools
10. Vitest pass (S-13)

---

## Change Log

> ทุกครั้งที่ Controller อนุมัติแก้ scope จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-05-23 | baseline สร้าง | — | — |
| 2026-05-23 | S-4 refine: slip endpoint = **combined upload+attach** `POST /api/orders/[token]/slip` รับ `multipart/form-data` (file + contact) — ไม่ใช่ 2-step `/api/upload`→`/slip` | `/api/upload` require session (line 7-8); buyer เป็น guest → 401. รวม upload+attach ใน route เดียว auth ด้วย contact-parity/SMS + PENDING guard + `validateUpload`+`saveFile`+`attachSlip`. ไม่กระทบ scope (ยังคือ "buyer แนบสลิป"), ไม่อ่อนแอ /api/upload | Controller (plan) |
| 2026-05-23 | reviewer must-fix: `@@index([slipFileId])` บน Order (migration `20260523124323`) + ย้าย isHttpUrl import ขึ้น top | files-gate findFirst(slipFileId) จะ table-scan ถ้าไม่มี index | Controller (review) |
| 2026-05-23 | **Phase 2 SIGNED-OFF** — S-1..S-14 DONE, tsc 0, Vitest 47/47, security PASS, backend E2E (curl) + visual QA ผ่าน (eyeball deepth.local) | Chrome MCP disconnected → visual eyeball (accepted per feedback_qa_domains). Light debt: Chrome-MCP pass + qa-seed slipFileId → Phase 3 | safepay-product (Gate 2) |

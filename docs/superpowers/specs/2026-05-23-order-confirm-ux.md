# Spec — Public Order Confirmation UX/UI redesign (`/o/[token]`)

> วันที่ 2026-05-23 · scope: **full** (missing UI features + trust signals + polish) · **UX/UI layer เท่านั้น — backend code-complete**
> ที่มา: safepay-product requirement (2026-05-23) + discovery flow เดิม

## Goal
buyer ที่เปิด link จาก SMS บนมือถือ → เข้าใจ order ทันที, ยืนยันได้ง่าย, รู้สึกปลอดภัย/น่าเชื่อถือ (anti-scam), สำเร็จ flow โดยไม่ต้องสมัคร. **ไม่แตะ backend logic.**

## Route + components
`src/app/(marketing)/o/[token]/` (Vuexy/buyer, mobile-first): `page.tsx` (RSC discriminator UUID/SMS-code), `PublicOrderClient.tsx` (orchestrator lock/detail), `PhoneUnlock.tsx`, `OrderDetailMobile.tsx`, `ReviewForm.tsx`

## Backend ที่ done แล้ว (ห้าม redefine — แค่ wire UI)
- confirm: `POST /api/orders/{token}/confirm` → status PENDING/SHIPPED→CONFIRMED + persist buyerContact/buyerUserId
- unlock: `POST /api/orders/{token}/unlock` ; SMS shortlink: `/api/o/sms/{code}` → HMAC cookie
- cancel (buyer, PENDING): `/api/orders/{token}/cancel` (verify path ก่อน build — Assumption A4)
- slip upload: ใช้ existing upload mechanism (`/api/files` — A3) ; review: `/api/orders/{token}/review`

## ⚠️ Scope decisions (Controller+user 2026-05-23, หลัง verify backend)
- **สลิป (FR-UX-4) = DEFER → Phase ถัดไป** — verify แล้ว backend **ไม่มี** (`requiresSlip` ไม่อยู่ใน schema, order ไม่มีระบบ slip — มีแต่ wallet topup). ต้อง backend ใหม่ (schema+storage+API+security) → ไม่อยู่ใน phase UX-only นี้
- **Tier naming = 5-tier** ให้ตรง `/u/[username]` ที่ commit แล้ว: **D,C→Classic · B→Silver · B+→Gold · A→Diamond · A+→Star** (ไม่ใช่ 6-tier "Deep Starter/Bronze/..." ที่ product เขียน — outdated)
- verified แล้ว: `paymentMethod` มีใน Order model ✓; cancel route ✓ → ทั้งคู่ UX-only ได้

## Scope — FR-UX (จาก product, condensed)
**🔴 Missing UI (backend มีจริง — verified):**
- FR-UX-3 **วิธีชำระเงิน** — แสดง `paymentMethod` (มีใน schema) — ไม่มี requiresSlip notice (สลิป deferred)
- ~~FR-UX-4 แนบสลิป~~ → **DEFERRED Phase 2** (ไม่มี backend)
- FR-UX-5 **ยกเลิก (buyer)** — ปุ่มเฉพาะ PENDING, secondary/destructive, confirm dialog, optimistic→CANCELLED (route `/cancel` ✓)

**🟠 Trust signal (anti-scam — หัวใจ Deep):**
- FR-UX-1 lock screen แสดงชื่อร้าน + Trust Level ก่อนกรอกเบอร์ (G-2); heading ไม่มี emoji
- FR-UX-2 order detail: tier name ไทย (Deep Gold...) คู่ตัวเลข (G-3), verified chip (สีตาม level), link `/u/{username}`
- FR-UX-7.4 + G-4: เพิ่ม SUBSCRIPTION ใน TYPE_LABEL ("สมาชิกรายคาบ") — bug fix

**🟡 Polish:**
- FR-UX-7 status hero copy ต่อ state (PENDING/SHIPPED/CONFIRMED/CANCELLED) + success visual (checkmark เขียว) + CANCELLED dim/ซ่อนปุ่ม
- FR-UX-6 tracking: section เด่นขึ้น + copy-to-clipboard + context copy
- FR-UX-8 bottom CTA: primary เต็มแถว ≥48px, cancel เป็น text button ใต้, sub-text สั้น
- FR-UX-9 ReviewForm: `router.refresh()` แทน `window.location.reload()` (G-5), heading ไม่มี emoji
- FR-UX-10 loading/error states ไทย, กัน double-tap

## Data-flatten contract (frontend type/flatten — ไม่ใช่ backend API ใหม่)
`PublicOrderData` เพิ่ม flatten จาก page.tsx (data มีใน Prisma แล้ว — verified):
`paymentMethod` (String?), `fulfillmentMode`, `maxVerifyLevel`, shop `username`, รองรับ type `SUBSCRIPTION`
**ไม่เพิ่ม** `requiresSlip`/slip (deferred — ไม่มี backend)
PhoneUnlock รับ prop เพิ่ม: `shop: { shopName, trustScore, maxVerifyLevel, username }` (A1)
Tier chip ใช้ helper เดียวกับ profile: D,C→Classic · B→Silver · B+→Gold · A→Diamond · A+→Star (สี chip ตาม tier)

## NFR
mobile-first, ภาษาไทยทั้งหมด (ไม่มี English user-facing), touch target ≥48px (WCAG 2.5.5), Anuphan font, Iconify tabler (ไม่มี emoji ใน heading), trust signal เด่นพอ buyer สังเกตเห็น (anti-scam), API < 500ms ไม่บล็อก render

## Acceptance (key — เต็มใน product req)
lock screen โชว์ร้าน+tier · payment method แสดง · slip upload (requiresSlip) · cancel เฉพาะ PENDING + dialog → CANCELLED · confirm → CONFIRMED + ReviewForm ไม่ reload · CONFIRMED success visual · CANCELLED ซ่อนปุ่ม · tier name ไทย · SMS cookie ข้าม PhoneUnlock (regression) · ทุก copy ไทย · CTA ≥48px

## Edge states
order ไม่มี→404 · link invalid/used→/o/link-invalid · เปิดซ้ำหลัง CONFIRMED→read-only+review · CANCELLED→notice+ซ่อนปุ่ม · เบอร์ผิด→inline error · SMS cookie expired→ตก PhoneUnlock (fail-closed) · confirm network error→toast+ปุ่มกลับมาใช้ได้ · slip >5MB→client validate · SUBSCRIPTION→label ไทย

## Out of scope
**MVP:** ไม่แตะ backend logic/API, ไม่เพิ่ม payment gateway/QR realtime, ไม่ OTP confirm (ตัดถาวร), ไม่ dispute/report, ไม่แตะ `/o/link-invalid`
**Phase 2:** external tracking link, realtime status (SSE), follow/chat, verified badge บน order, dispute หลัง CONFIRMED, no-JS fallback เต็ม

## QA note
chrome-devtools MCP หลุด session นี้ → browser E2E **deferred**; backend confirm→persist พิสูจน์ผ่าน **API+DB E2E** (curl + Prisma); visual = user-gated (เหมือน shop profile phase)

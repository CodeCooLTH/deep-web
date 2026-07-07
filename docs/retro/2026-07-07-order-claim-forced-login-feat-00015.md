# Retro — Feature 00015: Order Claim & Forced Login (2026-07-07)

## สรุป
รื้อหน้า order สาธารณะ `/o/[token]` + เปลี่ยน business rule การเข้าถึง: **บังคับ login ทุกกรณี**, ผูกทุกออเดอร์กับ `User` + `Customer` กลาง (เบอร์), ตัด guest-bypass, redesign UI เป็น Vuexy tokens. เดินแบบ **Documentation-First (Hard Rule 11)** + agent team (Hard Rule 4) + UX gate (Hard Rule 8). ยังไม่ commit (รอ user สั่ง).

## สิ่งที่ทำ (ตาม SDS §8 units)
- **Docs (6):** PRD, BRD, SRS, SDS, API, DATABASE + UX-Design-Spec — ผ่าน user review 2 รอบ (แก้ C1–C6)
- **Backend core:** `src/services/order-access.service.ts` (`resolveOrderAccess` pure + `guaranteeOrderLink` best-effort/idempotent), `lib/auth.ts` skip-window (`justAuthedViaPhoneOtp`, 5 นาที), `auction.service.ts` bid phone-gate — Vitest 10/10
- **Backend routes:** `POST /api/orders/[token]/claim` (ใหม่), confirm/cancel/slip → session+ownership (ตัด cookie/contact), `/api/o/sms/[code]` → prefill-redirect (ตัด cookie), app confirm
- **UI (Vuexy):** `page.tsx` force-login gate + RSC PII gate คงไว้, `OrderDetailMobile` re-skin (ตัด MobileFrame, tokens only), `ClaimOtpPrompt` (ใหม่), `OrderAccessBlock` 3 variants, shared `OtpSlots` (extract จาก VerifyOtpCard), `SignInCard` prefill, `SmsExpiredToast`, `BidPhoneVerifyDialog`
- **Phone-required:** `CreateOrderSchema` + `OrderCreateForm` yup → เบอร์ไทย required (ตัด email/ว่าง)
- **Cleanup:** ลบ `MobileFrame`/`PhoneUnlock`/`AccountPromptCard`/`sms-unlock-cookie.ts`/unlock+buyer-phone routes/`checkOrderPhone`/`Confirm`+`UnlockOrderSchema`

## Decisions (RD-1…RD-10, ยืนยันโดย user)
- Force login ทุกกรณี; SMS short-code = prefill เบอร์เท่านั้น
- ลูกค้าเก่า/ใหม่ derive runtime (ไม่มี field/flag ใหม่); gate ยึด `buyerUserId` เป็นหลัก
- **No identity switch** — login แล้วบังคับ OTP ผูกเบอร์ของบัญชีตัวเอง ไม่มีช่องกรอกเบอร์ใหม่ (บัญชีไม่ตรง → บล็อก ให้ logout)
- Guarantee-link best-effort/idempotent, ไม่ override `Customer.userId` ของคนอื่น
- **Phone-required ตอนสร้างออเดอร์** (seller manual) + **bid ต้อง phone-verified** → auction-win มีเบอร์เสมอ
- ไม่มี Prisma migration (ทุก field มีจาก feat 00014)

## Verification
- tsc: 78 errors = baseline เดิม (Customizer/TopBar/AppLogo/PacesToastItem/asset-decls) — **0 ใหม่ใน feature files**
- Vitest: 10/10 (`resolveOrderAccess` ทุก decision kind)
- Reviewer 8-gate: **PASS ทุก gate → MERGE**; Security: **PASS** (ไม่มี critical/high/medium)
- Runtime smoke (dev server, unauth curl): bad-token→link-invalid ✓, 12-char→sms route ✓, sms-fail→`sign-in?smsExpired=1` ✓, confirm/claim/slip no-session→**401** ✓, **old guest body `{contact,smsUnlock}`→401** (bypass ปิดสนิท) ✓

## Carried debt / Follow-ups
1. **Visual E2E QA ยังไม่ทำ** — Chrome DevTools MCP ไม่ available ใน session นี้ + ไม่มี seeded order/session. ต้องเก็บ: render หน้า order-detail ใหม่, ClaimOtpPrompt flow, OrderAccessBlock 3 variants, bid modal, mobile responsive. (pattern เดียวกับ debt MCP รอบก่อน)
2. **`POST /api/orders/[token]/review` ยังเป็น guest-write** (reviewer พบ, out-of-scope) — สร้างรีวิวได้โดยไม่ login ผ่าน `buyerContact` fallback ไม่มี OTP/proof. ขัด spirit "no guest identity" ของ feature นี้ → ควรมี follow-up ticket
3. **`set-phone` TOCTOU** (security Info) — bid modal ใหม่เรียก endpoint นี้; worst case 500 ไม่ใช่ authz bypass. ควรเพิ่ม try/catch P2002 → 409
4. **OPEN_CLAIM legacy blast-radius** — audit `SELECT count(*) FROM "Order" WHERE buyerContact IS NULL AND buyerUserId IS NULL AND status='PENDING'` เพื่อยืนยันขอบเขต

## บทเรียน
- **Doc-first ได้ผลดีกับ feature ที่เปลี่ยน business rule** — จับ conflict (SMS paid guest-path, email-only, identity-switch, phone ไม่บังคับจริง) ได้ก่อนแตะโค้ด ประหยัด rework
- **แยก pure-function (`resolveOrderAccess`) จาก I/O (`guaranteeOrderLink`)** → unit-test ครบทุก branch โดยไม่ mock DB
- **Parallel dev waves ตาม disjoint file-set** เร็วขึ้นมาก แต่ต้องระวัง hotspot ร่วม (`validations.ts`) — serialize รอบนั้น
- **`grep importers` ก่อนลบ dead file** จับได้ว่า `/api/o/sms/[code]` ยัง set cookie อยู่ (unit ที่ตกหล่นตอน dispatch)

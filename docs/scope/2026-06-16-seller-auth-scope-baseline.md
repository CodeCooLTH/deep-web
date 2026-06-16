# Scope Baseline — Seller Auth Redesign + Onboarding

> สถานะ: ACTIVE · phase ที่ active: **P1 — Auth/Data Foundation**
> spec: `docs/superpowers/specs/2026-06-16-seller-auth-redesign-onboarding-design.md`
> plan (P1): `docs/superpowers/plans/2026-06-16-seller-auth-p1-foundation.md`

---

## Goal

วางฐาน backend ให้ seller login ด้วย username+password (provider ใหม่), ยืนยันตัวตนด้วย phone OTP ตอนสมัคร, reset password ผ่าน OTP, มี `Shop.slug` + category constant, และ session รายงาน `needsOnboarding` — โดยไม่กระทบ buyer (Vuexy) auth เลย; UI หน้า auth (P2) และ onboarding modal (P3) อยู่ใน phase ถัดไป

**Non-goals (feature-level):** UI redesign ทั้ง 5 หน้า auth, onboarding modal stepper, ปุ่ม Facebook บนหน้า seller, Redis OTP engine, prod Facebook creds, buyer/Vuexy auth

---

## In-Scope (P1)

> ทุก commit ของ phase P1 ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-P1-1 | Shop category constant (`src/lib/shop-categories.ts`) — 10 keys, Thai labels, `isShopCategory()` guard | Vitest 2 tests — `SHOP_CATEGORY_KEYS.length === 10`, `isShopCategory('fashion')` true, `'nope'` false | TODO |
| S-P1-2 | Slug utilities (pure) (`src/lib/shop-slug.ts`) — `normalizeSlug`/`isValidSlugFormat`/`isReservedSlug` | Vitest 3 tests — lowercase-trim, format 3–30 a-z0-9- no lead/trail hyphen, reserved set | TODO |
| S-P1-3 | Password utilities (`src/lib/password.ts`) — `isStrongPassword` (≥8 letter+number+special, max 1000), `hashPassword`/`verifyPassword` bcryptjs | Vitest 2 tests — strength reject/pass, hash+verify round-trip, >1000 guard | TODO |
| S-P1-4 | Valibot schemas (`src/lib/validations.ts`) — `PasswordSchema`/`ShopSlugSchema`/`ShopCategorySchema`/`SetPasswordSchema`; `CreateShopSchema.category` → picklist | Vitest 4 tests + tsc 0 (ไม่มี caller regress) | TODO |
| S-P1-5 | Prisma migration `Shop.slug String? @unique` | apply ไม่มี data loss (nullable); `prisma generate` ok; tsc 0; `Shop.slug` ใน client types | TODO |
| S-P1-6 | shop.service slug fns — `isSlugAvailable()` + `setShopSlug()` | Vitest 3 tests — reserved/invalid/taken → false, free+valid → true; setShopSlug throw `SLUG_UNAVAILABLE` / update | TODO |
| S-P1-7 | GET `/api/users/check-phone` (signup dedupe) | เบอร์มีบัญชี → `{available:false}`; เบอร์ใหม่ → `{available:true}`; format ผิด → 400; อยู่ใต้ guardApi | TODO |
| S-P1-8 | POST `/api/account/set-password` — verify OTP → set `passwordHash` | Vitest 4 tests — 400/401/404/200; อยู่ใต้ `/api/account/*` (รับ guardApi) | TODO |
| S-P1-9 | provider `seller-credentials` (`src/lib/auth.ts`) — username+password, reject admin/non-seller/no-hash, rate-limit 5/10min, generic null | login seller+password ผ่าน; admin/ผิด → null; >5/10min → null; tsc 0 | TODO |
| S-P1-10 | ขยาย `phone-otp` signup (`src/lib/auth.ts`) — รับ `password`+`category` (optional), hash+set, ใส่ category ลง shop | signup+password+category → user.passwordHash non-null + shop.category set; ไม่ส่ง password → null (backward compat); tsc 0 | TODO |
| S-P1-11 | session callback (`src/lib/auth.ts`) — `needsOnboarding` + `shopSlug` (join shop.slug; `!shopSlug \|\| !phone`) | `/api/auth/session` มี `user.shopSlug` + `user.needsOnboarding`; tsc 0 | TODO |

**หมายเหตุ:** S-P1-7..S-P1-11 แตะ `src/lib/auth.ts`/route auth (security-sensitive) → บังคับ safepay-security review ก่อน mark DONE

---

## Task → S-id Mapping (P1 plan, 11 tasks)

| Task (plan) | S-id |
|---|---|
| Task 1 Shop category constant | S-P1-1 |
| Task 2 Slug utilities (pure) | S-P1-2 |
| Task 3 Password utilities | S-P1-3 |
| Task 4 Valibot schemas | S-P1-4 |
| Task 5 Prisma migration Shop.slug | S-P1-5 |
| Task 6 shop.service slug fns | S-P1-6 |
| Task 7 check-phone dedupe route | S-P1-7 |
| Task 8 set-password route | S-P1-8 |
| Task 9 seller-credentials provider | S-P1-9 |
| Task 10 phone-otp signup password+category | S-P1-10 |
| Task 11 session needsOnboarding+shopSlug | S-P1-11 |

ทุก task map ได้ — ไม่มี orphan.

---

## Out-of-Scope (P1)

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | UI หน้า auth ทั้ง 5 (sign-in/sign-up/verify-otp/reset-pass/new-pass) | P2 — ต้องผ่าน safepay-ux ก่อน |
| OOS-2 | Onboarding modal stepper | P3 — รอ S-P1-11 |
| OOS-3 | ปุ่ม Facebook บนหน้า seller | P2 UI — provider ทำงานได้แล้ว |
| OOS-4 | เปิด FACEBOOK_ID/SECRET ใน prod | Ops แยก |
| OOS-5 | OTP engine → Redis | P2+ NFR debt |
| OOS-6 | แตะ buyer (Vuexy/marketing) auth | Hard boundary |
| OOS-7 | 2FA/TOTP จริง | ไม่ใช่ scope |
| OOS-8 | เปลี่ยน `/u/[username]` เดิม | slug = field ใหม่ ไม่ทับ |
| OOS-9 | Bulk migration password ให้ seller เดิม | ครอบโดย set-password via OTP (self-serve) |
| OOS-10 | Live slug-availability API route | P3 — service layer S-P1-6 พร้อม |

---

## Assumptions

- prod เปิดแล้ว seller จริงน้อย → migrate OTP-only→password ผ่าน self-serve set-password (S-P1-8) พอ; ไม่ backfill
- `User.passwordHash` field มีอยู่แล้ว (admin ใช้ก่อน) — P1 ใช้ field เดิม ไม่เพิ่ม column
- dev DB = Supabase ผ่าน `.env.local`; migration ใช้ `dotenv -e .env.local -- npx prisma migrate dev`; ห้าม `prisma db pull` ([[feedback_qa_agent_no_prisma_pull]])
- Apitel SMS prod ใช้ได้ — OTP signup/reset ส่งจริง
- `adminLoginTimestamps` มีใน auth.ts แล้ว — seller-credentials reuse (key=username @unique ไม่ชน)
- `guardApi` ครอบ `/api/*` ยกเว้น `/api/auth/*` → `/api/account/set-password` + `/api/users/check-phone` ได้ CSRF+rate-limit auto
- ถ้า tsc พบ caller เดิมส่ง category free-text หลัง Task 4 → แก้ caller (ไม่ revert schema)
- safepay-security review บังคับก่อน P1 complete

---

## Risks

| Risk | ระดับ | แนวทาง |
|---|---|---|
| auth.ts security-sensitive — provider ใหม่ผิดกระทบ login ทุก subdomain | สูง | safepay-security บังคับ; tsc 0 + unit test ก่อน commit |
| check-phone = phone oracle (enumerate เบอร์) | กลาง | guardApi rate-limit (MVP); Redis per-phone = P2 |
| Supabase dev = prod DB เดียวกัน — migration ผิดกระทบ prod | สูง | nullable ADD COLUMN (no data loss); ห้าม destructive cmd |
| seller-credentials reuse in-memory store → Vercel per-instance | กลาง | บทเรียนเดียวกับ CSRF/RL; Redis = P2; accept MVP |
| ขยาย phone-otp signup backward compat | กลาง | field `password`/`category` optional → buyer flow ไม่กระทบ; tsc+test |

---

## Deferred → P2/P3 (ไม่นับ GAP ตอน P1)

- **P2:** UI 5 หน้า auth (safepay-ux ก่อน), ปุ่ม Facebook, 60s countdown, pacesToast errors, live slug-check route
- **P3:** Onboarding modal stepper (welcome/category chips/slug/first product), FB phone-verify step
- **P2+:** Redis OTP
- **Ops:** prod FACEBOOK creds
- **Docs:** PRD FR-1/U-1 ระบุ "ไม่มี Email+Password ใน MVP" — ขัดกับ seller-credentials → safepay-docs sync หลัง P1 sign-off

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-06-16 | baseline สร้าง (P1 active, P2/P3 deferred) | kick-off Seller Auth Redesign + Onboarding | shinobu22 |

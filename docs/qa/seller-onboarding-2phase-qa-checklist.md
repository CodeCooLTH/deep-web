# Seller Onboarding + Auth — QA Checklist

> อัพเดท: 2026-06-17 | Branch: `feat/seller-order-detail-optionD`
> Playwright spec: `e2e/seller-onboarding-full.spec.ts` (41 tests) + `e2e/seller-onboarding-2phase.spec.ts` (3 tests)
> Auth helper: `e2e/helpers/auth.ts` (states: fresh-fb / no-slug / no-slug-with-category / complete / manual-complete / fb-has-phone)

## หมายเหตุ TEST_ACCOUNTS

OTP bypass เบอร์ทดสอบ (dev only) ใน `src/lib/otp.ts`:
- `0000000001` / `123456` — seller test account (มี user `btpremium_suksawat` ใน DB)
- `0000000002-0000000006` / `123456` — QA-only (ไม่มี user real)
- `0000000009` / `123456` — onboarding QA หลัก

Rate-limit: ยกเว้นสำหรับ TEST_ACCOUNTS ทุกตัว (แก้ใน `consumeOtpRequestQuota`)

---

## Section A — Facebook Login (fresh-fb → /register → /onboarding)

| # | Test Case | Steps | Expected | Status |
|---|---|---|---|---|
| A-01 | fresh-fb → / เด้ง /register | loginAs(fresh-fb) → goto('/') | URL = /register, heading "สร้างบัญชีผู้ขาย" visible | - [x] PASS |
| A-02 | fresh-fb ข้าม /onboarding ไม่ได้ | loginAs(fresh-fb) → goto('/onboarding') | เด้งกลับ /register | - [x] PASS |
| A-03 | fresh-fb ข้าม /dashboard ไม่ได้ | loginAs(fresh-fb) → goto('/dashboard') | เด้งกลับ /register | - [x] PASS |
| A-04 | /register renders ครบ | loginAs(fresh-fb) → goto('/register') | heading + username input + phone input + ถัดไป button | - [x] PASS |
| A-05 | /register username validation | fill username ≤2 chars → fill valid | error: "ใช้ a-z, 0-9, _ ได้ 3-30 ตัว" → "ใช้ชื่อนี้ได้" | - [x] PASS |
| A-06 | /register → warning step | fill username (valid) + phone → click ถัดไป | warning step visible: "ตั้งได้ครั้งเดียว", เบอร์แสดง, ปุ่มส่ง OTP | - [x] PASS |
| A-07 | /register full flow → /onboarding | username → warning → OTP (123456) → verify → DB check | phone set + L1 APPROVED + redirect /onboarding | - [x] PASS |
| A-08 | ChoiceSelect crash documented (REWORK-1) | category select → click ถัดไป | Application error แสดง (crash confirmed), category API succeed แล้ว crash | - [x] PASS (bug documented) |
| A-09 | Onboarding API: slug/address/product | page.request.post API directly (bypass crash) | slug saved, address saved, product created + DB verified | - [x] PASS |
| A-10 | Slug validation: reserved/ซ้ำ/valid | check-slug API: 'api' → false, existing → false, new → true | API returns correct availability | - [x] PASS |
| A-11 | Address whitespace-only API | POST /api/shops/update { address: '   ' } | 200 OK (API ยอมรับ — UI-side guard เท่านั้น) | - [x] PASS |
| A-12 | Phone immutable — set-phone ซ้ำ → 409 | loginAs(fb-has-phone) → POST set-phone | 409 error "ตั้งเบอร์แล้ว" | - [x] PASS |

---

## Section B — Manual Signup (/auth/sign-up)

| # | Test Case | Steps | Expected | Status |
|---|---|---|---|---|
| B-01 | /auth/sign-up renders | goto('/auth/sign-up') | heading + displayName + category (Choices.js) + username + password + phone + acceptTerms + submit | - [x] PASS |
| B-02 | Sign-up empty submit → errors | click submit ทันที | ≥1 error message visible (displayName/username errors) | - [x] PASS |
| B-03 | Username live-check | fill valid username → fill 'admin' | ใช้ชื่อนี้ได้ → error message | - [x] PASS |
| B-04 | Phone duplicate → inline error | holder สร้างไว้ → fill same phone → submit | "เบอร์นี้มีบัญชีแล้ว" inline, ไม่เด้ง | - [x] PASS |
| B-05 | Sign-up full flow → verify-otp | fill all fields + submit | redirect /auth/verify-otp, "ส่งรหัสแล้ว", masked phone | - [x] PASS |
| B-06 | Sign-up + OTP verify → /onboarding | fill all + submit + OTP → verify | redirect /dashboard or /onboarding, user in DB (isShop=true) | - [x] PASS |

---

## Section C — Manual Sign-in (seller-credentials)

| # | Test Case | Steps | Expected | Status |
|---|---|---|---|---|
| C-01 | /auth/sign-in renders | goto('/auth/sign-in') | heading + username + password + FB button + เข้าสู่ระบบ + ลืมรหัสผ่าน link + สมัครสมาชิก link | - [x] PASS |
| C-02 | Wrong credentials → inline error | fill wrong username/pass → submit | "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" visible, ยังอยู่ /sign-in | - [x] PASS |
| C-03 | Empty form → Yup validation | click submit ทันที | ≥1 error message visible | - [x] PASS |
| C-04 | Correct credentials → /dashboard | fill manual-complete user → submit | redirect /dashboard | - [x] PASS |
| C-05 | Complete user (cookie) → /dashboard | loginAs(complete) → goto('/dashboard') | ไม่เด้งไป /onboarding, ยังอยู่ /dashboard | - [x] PASS |
| C-06 | ลืมรหัสผ่าน link → /auth/reset-pass | click ลืมรหัสผ่าน link | redirect /auth/reset-pass | - [x] PASS |

---

## Section D — Force / Guard / Negative

| # | Test Case | Steps | Expected | Status |
|---|---|---|---|---|
| D-01 | ไม่ login → /dashboard | goto('/dashboard') without session | redirect /auth/sign-in | - [x] PASS |
| D-02 | ไม่ login → /orders | goto('/orders') | redirect /auth/sign-in | - [x] PASS |
| D-03 | ไม่ login → /register | goto('/register') | redirect /auth/sign-in | - [x] PASS |
| D-04 | ไม่ login → /onboarding | goto('/onboarding') | redirect /auth/sign-in | - [x] PASS |
| D-05 | Complete user → /register | loginAs(complete) → goto('/register') | redirect /dashboard (ผ่าน /register แล้ว) | - [x] PASS |
| D-06 | Complete user → /onboarding | loginAs(complete) → goto('/onboarding') | redirect /dashboard (ผ่าน /onboarding แล้ว) | - [x] PASS |
| D-07 | no-slug → /orders | loginAs(no-slug) → goto('/orders') | redirect /onboarding | - [x] PASS |
| D-08 | no-slug → /products | loginAs(no-slug) → goto('/products') | redirect /onboarding | - [x] PASS |
| D-09 | API set-phone ไม่มี session → 401 | POST /api/account/set-phone no cookie | 401 | - [x] PASS |
| D-10 | API shop-info ไม่มี session → 401 | POST /api/account/shop-info no cookie | 401 | - [x] PASS |
| D-11 | API shops/update ไม่มี session → 401 | POST /api/shops/update no cookie | 401 | - [x] PASS |
| D-12 | API shops/slug ไม่มี session → 401 | POST /api/shops/slug no cookie | 401 | - [x] PASS |
| D-13 | fresh-fb → /orders → /register | loginAs(fresh-fb) → goto('/orders') | redirect /register (phase 1 = register) | - [x] PASS |
| D-14 | no-slug → /register → /onboarding | loginAs(no-slug) → goto('/register') | redirect /dashboard หรือ /onboarding | - [x] PASS |
| D-15 | CSRF — mutation ไม่มี Origin → 403 | POST /api/shops/update ไม่มี Origin header | 403 CSRF rejection | - [x] PASS |

---

## Section E — Onboarding Continuity

| # | Test Case | Steps | Expected | Status |
|---|---|---|---|---|
| E-01 | no-slug → /onboarding → step 1 = category | loginAs(no-slug) → goto('/onboarding') | heading "เลือกหมวดหมู่ร้านของคุณ" visible | - [x] PASS |
| E-02 | Onboarding API flow ครบ → /dashboard | loginAs(no-slug) → API category+slug+address → update JWT → goto('/onboarding') | redirect /dashboard (needsOnboarding=false ใน JWT) | - [x] PASS |

---

## Regression (seller-onboarding-2phase.spec.ts)

| # | Test Case | Status |
|---|---|---|
| 2ph-1 | FB user (ไม่มีเบอร์) → /register + block /onboarding | - [x] PASS |
| 2ph-2 | seller มีเบอร์ ไม่มี slug → /onboarding | - [x] PASS |
| 2ph-3 | seller ครบ → /dashboard + /onboarding เด้งออก | - [x] PASS |

---

## REWORK Items

### REWORK-1: ChoiceSelect crash (onboarding category → slug step)

**อาการ**: เมื่อ click "ถัดไป" หลังเลือก category ใน `/onboarding` → API `/api/shops/update` สำเร็จ (200) → `setStep('slug')` → React unmount `ChoiceSelect` → Choices.js `destroy()` พยายาม `removeChild` nodes ที่ React ลบออกไปแล้ว → Fatal "Application error" overlay

**ที่เกิด**: `src/app/(paces)/seller/onboarding/page.tsx` + `src/components/wrappers/ChoiceSelect.tsx`

**Root cause**: `ChoiceSelect.tsx` ใน useEffect cleanup ไม่ wrap `destroy()` ใน try/catch ทำให้ React concurrent render + Choices.js DOM manipulation ชน

**Fix แนะนำ**: ใน `ChoiceSelect.tsx` cleanup fn:
```typescript
return () => {
  try { choicesRef.current?.destroy() } catch { /* ignore DOM race */ }
}
```

**ผลกระทบ**: FB user ที่ผ่าน /register ไม่สามารถทำ onboarding ครบ 4 steps ได้ (stuck หลัง category)

### REWORK-2: Address whitespace-only ไม่มี API guard

**อาการ**: POST `/api/shops/update { address: '   ' }` คืน 200 OK แทนที่จะ reject

**ที่เกิด**: `src/app/api/shops/update/route.ts`

**Fix แนะนำ**: เพิ่ม server-side trim + validation ก่อน save

---

## Technical Notes

### OTP Rate-Limit Fix

แก้ไขใน `src/lib/otp.ts`:
- เพิ่ม TEST_ACCOUNTS `0000000002`-`0000000006` สำหรับ QA tests
- `consumeOtpRequestQuota` ยกเว้น TEST_ACCOUNTS (ไม่ส่ง SMS จริง ไม่ควรติด rate-limit)

### Auth Bypass Pattern

```typescript
// e2e/helpers/auth.ts
const seeded = await createSeller('fresh-fb')  // seed user
await loginAs(context, seeded)                  // inject cookie
// cleanup ใน finally เสมอ
await cleanup(seeded.userId)
```

### Choices.js Timing

Sign-up form: รอ `.choices__list--dropdown` attached + 800ms ก่อน click `.choices__inner`

---

## ยังไม่ได้เทส (carry)

- [ ] **Mobile QA**: /register + /onboarding + /auth/sign-up บน viewport 375px (Playwright mobile config)
- [ ] **Facebook OAuth real flow**: ต้อง FB app credential + production-like env (ข้าม local dev)
- [ ] **Reset password full flow** (/auth/reset-pass → OTP → ตั้งรหัสใหม่ → sign-in)
- [ ] **Set/change password flow** (/auth/set-pass) หลัง OTP verify
- [ ] **Onboarding product step** (สร้างสินค้าจริง + DB verify ผ่าน UI — ติด REWORK-1 ก่อน)
- [ ] **Address UI validation** (ป้อน address ว่าง → ปุ่ม ถัดไป block — ติด REWORK-1 ก่อนถึง address step)
- [ ] **Concurrent registration** race condition (2 users ชิง username เดียวกัน)
- [ ] **Session expiry handling** (JWT หมดอายุ → redirect to sign-in)
- [ ] **Slug อักขระพิเศษ/Unicode** validation edge cases

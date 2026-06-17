# Seller Onboarding 2-Phase QA Checklist

**Feature:** 2-phase seller onboarding สำหรับ FB user และ user ที่ยังไม่ครบข้อมูล  
**Branch:** `feat/seller-order-detail-optionD` (commit 300ce15)  
**Subdomain:** `seller.deepth.local:4000`  
**สร้าง:** 2026-06-17  
**QA run:** safepay-qa (API-level E2E)  
**Browser visual:** ยังไม่ได้ทดสอบ (MCP ไม่พร้อม — ดู section "ยังไม่ได้เทส")

---

## Pre-flight Setup

- [x] dev server รันที่ port 4000 (`curl http://seller.deepth.local:4000/ → 307`)
- [x] `.env.local` ชี้ Supabase dev DB (DATABASE_URL + DIRECT_URL + NEXTAUTH_SECRET)
- [x] Seed: สร้าง FB-like user ด้วย `prisma/qa-seed-fb-user.ts` (`dotenv -e .env.local -- npx tsx`)
  - username=`qafbtest`, phone=null, avatar URL, AuthAccount FACEBOOK:qa-fb-99991234
  - ไม่มี shop (หรือ shop ไม่มี slug) = phase 1 start
- [x] JWT Token: `encode({ userId, needsRegistration:true, needsOnboarding:true })` no-salt (next-auth/jwt encode)
  - cookie name dev http: `next-auth.session-token`
- [x] Cleanup: ลบ user+shop+authAccount+verifications+OtpCode หลัง run เสร็จ

---

## Phase 1 — /register Proxy Logic

- [x] **TC-01** `FB user / → 307 /dashboard → 307 /register` (authed + needsRegistration → proxy บังคับ)
  - evidence: `307 /dashboard` แล้ว `/dashboard` → `307 /register`
- [x] **TC-02** `FB user /dashboard → 307 /register` (needsRegistration block)
  - evidence: `307 http://seller.deepth.local:4000/register`
- [x] **TC-03** `FB user /orders → 307 /register`
  - evidence: `307 http://seller.deepth.local:4000/register`
- [x] **TC-04** `FB user /products → 307 /register`
  - evidence: `307 http://seller.deepth.local:4000/register`
- [x] **TC-05** `/register` ตรงๆ → 200 (ไม่ redirect วนลูป)
  - evidence: `200`
- [x] **TC-06** `/onboarding` ขณะ phase 1 → 307 /register (ไม่ให้ข้ามเฟส)
  - evidence: `307 http://seller.deepth.local:4000/register`

---

## Phase 1 — /register Form APIs

- [x] **TC-07** `check-username?u=qafbtest_newname` → `{"available":true}`
- [x] **TC-08** `check-username?u=qafbtest` (ชื่อที่ใช้แล้ว) → `{"available":false,"reason":"taken"}`
- [x] **TC-09** `check-phone?phone=0000000009` (ว่าง) → `{"available":true}`
- [x] **TC-10** `POST /api/account/shop-info` (displayName + username + category lowercase) → `{"ok":true}`
  - หมายเหตุ: category ต้องเป็น lowercase (`general` ไม่ใช่ `GENERAL`)
- [x] **TC-11** `POST /api/otp/send` {contact:"0000000009", type:"PHONE"} → `{"message":"OTP sent"}`
- [x] **TC-12** `POST /api/account/set-phone` {phone:"0000000009", otp:"123456"} (bypass) → `{"ok":true}`
- [x] **TC-12b** DB verify: user.phone=0000000009, isShop=true, Shop สร้าง (shopName+category), VerificationRecord PHONE_OTP L1 APPROVED

---

## Phase 1 — /register Negative Paths

- [x] **TC-13** `POST /api/account/set-phone` อีกครั้ง (phone immutable) → HTTP 409 + `{"error":"บัญชีนี้ตั้งเบอร์แล้ว ไม่สามารถเปลี่ยนได้"}`
- [x] **TC-29** set-phone OTP ผิด (แต่ phone ซ้ำแล้ว → 409 ก่อน verify) — ควร 409 (immutable check ก่อน OTP verify ใน code)
- [x] **TC-30** set-phone ไม่มี session → HTTP 401
- [x] **TC-31** shop-info ไม่มี session → HTTP 401
- [x] **TC-32** check-phone เบอร์ที่ถูกใช้แล้ว → `{"available":false}`

---

## Phase 2 — /onboarding Proxy Logic

Token ใหม่: `encode({ needsRegistration:false, needsOnboarding:true })` (มี phone ยังไม่มี slug)

- [x] **TC-14** `Phase2 user / → 307 /dashboard → 307 /onboarding`
- [x] **TC-15** `/dashboard → 307 /onboarding`
- [x] **TC-16** `/orders → 307 /onboarding`
- [x] **TC-17** `/register → 307 /dashboard` (มีเบอร์แล้ว ไม่ต้องลงทะเบียน → ออกไป dashboard → proxy เด้งต่อ)
- [x] **TC-18** `/onboarding` ตรงๆ → 200 (ผ่านได้ปกติ)

---

## Phase 2 — /onboarding Form APIs

- [x] **TC-19** `check-slug?slug=qafbshop2026` → `{"available":true}` (ก่อนตั้ง)
- [x] **TC-20** `check-slug?slug=api` → `{"available":false,"reason":"reserved"}`
- [x] **TC-21** `check-slug?slug=ab` (สั้นเกิน) → `{"available":false,"reason":"invalid"}`
- [x] **TC-22** `POST /api/shops/slug` {slug:"qafbshop2026"} → `{"ok":true}`
- [x] **TC-22b** DB verify: shop.slug="qafbshop2026"
- [x] **TC-27** `POST /api/products` onboarding สร้างสินค้าแรก → 200 + product data returned
- [x] **TC-28** `check-slug?slug=qafbshop2026` หลังตั้งแล้ว → `{"available":false,"reason":"taken"}`
- [x] **TC-34** `check-slug?slug=` (ว่าง) → `{"available":false,"reason":"invalid"}`
- [x] **TC-35** `POST /api/shops/slug` slug ซ้ำ → HTTP 409

---

## Phase 2 — Complete State

Token: `encode({ needsRegistration:false, needsOnboarding:false })`

- [x] **TC-23** `/dashboard` → 200 (ไม่ redirect อีก)
- [x] **TC-24** `/onboarding` → 307 /dashboard (setup เสร็จแล้ว → ออก)
- [x] **TC-25** `/orders` → 200 (เข้าได้ปกติ)
- [x] **TC-26** `/register` → 307 /dashboard (ลงทะเบียนแล้ว → ออก)

---

## Page Render Checks (HTML/SSR)

- [x] **TC-36** `/register` page: HTTP 200, title="ผู้ขาย | Deep", Anuphan font class, data-skin="default" (Paces ไม่ใช่ saas/Vuexy)
- [x] **TC-37** `/onboarding` page: HTTP 200

---

## OTP Send / Validate

- [x] **TC-33** otp/send ส่งซ้ำ → `{"message":"OTP sent","isNewUser":false}` (idempotent, ไม่ error)
- [ ] **TC-33b** otp/send เกิน 3 ครั้ง / 10 นาที → HTTP 429 (rate-limit in-memory globalThis — ยังไม่ทดสอบ เพราะ restart server ล้าง state)

---

## Cross-Cutting / Security

- [x] CSRF Origin check: API mutations ต้อง Origin header (seller.deepth.local) ผ่านได้
- [x] Session isolation: ไม่มี session → 401 ทุก API ที่ต้อง auth
- [x] phone immutable: set-phone ครั้งที่ 2 → 409 พร้อม error message ภาษาไทย
- [x] slug ซ้ำ: POST /api/shops/slug slug ซ้ำ → 409
- [ ] slug เปลี่ยนไม่ได้ (ถ้า immutable) — ต้องตรวจสอบจาก `setShopSlug` service ว่ามี guard ไหม (ยังไม่ทดสอบ)

---

## Browser Visual QA (ยังไม่ได้เทส — carry)

> MCP chrome-devtools ไม่พร้อมใน session นี้ — ต้องทดสอบด้วย browser จริง

- [ ] **/register welcome step**: avatar FB แสดง, badge "เข้าสู่ระบบด้วย Facebook", ปุ่ม "เริ่มเลย →" render ถูก
- [ ] **/register info step**: form-input 4 field (displayName, ChoiceSelect category, username+realtime check, phone), ปุ่ม "ถัดไป →"
- [ ] **/register warning step**: triangle icon, ข้อความ "ตั้งได้ครั้งเดียว", แสดงเบอร์ที่กรอก, ปุ่ม "ยืนยัน" + "← แก้ไขเบอร์"
- [ ] **/register OTP step**: OTP 6 boxes แสดง, countdown 60 วินาที, auto-focus box ถัดไปเมื่อพิมพ์ครบ
- [ ] **/register success step**: icon 🎉, "เข้าสู่ระบบสำเร็จ!", loading spinner → redirect /dashboard
- [ ] **/onboarding slug step**: input slug, realtime check, preview URL "deepthailand.app/..."
- [ ] **/onboarding product step**: ชื่อสินค้า + ราคา, ปุ่ม "สร้าง" + "ข้ามไปก่อน"
- [ ] Font Anuphan ครบทุก element (ไม่มี Courier fallback จาก font-mono)
- [ ] Paces skin default: primary น้ำเงิน #236dc9 (ไม่ใช่ม่วง #7367F0)
- [ ] Mobile: AuthCardShell ขยายเต็มจอ ≤640px
- [ ] TopBar avatar: ถ้า user มี avatar URL → แสดงรูปใน TopBar หลัง login

---

## สรุปผล Run นี้

| หัวข้อ | PASS | FAIL | SKIP |
|---|---|---|---|
| Proxy phase 1 redirect | 6 | 0 | 0 |
| Phase 1 form APIs | 8 | 0 | 0 |
| Proxy phase 2 redirect | 5 | 0 | 0 |
| Phase 2 form APIs | 8 | 0 | 0 |
| Complete state proxy | 4 | 0 | 0 |
| Negative/security | 5 | 0 | 0 |
| Browser visual | 0 | 0 | 11 (carry) |

**VERDICT: PASS (API-level E2E)** — browser visual carry ไป MCP session ถัดไป

---

## หมายเหตุที่พบ

1. **category ต้องเป็น lowercase** — `general` ไม่ใช่ `GENERAL` (valibot ShopCategorySchema match lowercase key). Frontend ใช้ SHOP_CATEGORY_KEYS ถูกแล้ว แต่ QA ต้องระวังตอนทดสอบ curl ตรง
2. **JWT encode ต้องไม่ระบุ `salt`** สำหรับ cookie `next-auth.session-token` ใน NextAuth v4 dev HTTP mode — salt เป็น "" (empty default) ไม่ใช่ชื่อ cookie
3. **TC-29 status 409 (ไม่ใช่ 401)**: set-phone ครั้งที่ 2 ด้วย OTP ผิด → API ตรวจ `me.phone` ก่อน OTP verify → return 409 "immutable" ก่อนถึง OTP check — นี่คือพฤติกรรมที่ถูกต้องตาม code
4. **`isNewUser: false`** จาก otp/send ครั้งที่ 2: บ่งชี้ว่า OTP route ตรวจ user existence ถูกต้อง

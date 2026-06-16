# Seller Auth Redesign + Onboarding — Design Spec

> วันที่: 2026-06-16 · สถานะ: approved (brainstorm) · subdomain: **seller** (`(paces)/seller/**`, Paces theme)
> Ref ผู้ใช้: Paces `auth/card/sign-in` + `auth/card/sign-up`

## 1. Goal & Context

ปรับปรุง auth flow ฝั่ง **seller** (Paces) จากเดิม **phone + OTP อย่างเดียว (passwordless)** ให้เป็น
**username + password เป็น login หลัก**, ใช้ **phone + OTP เป็นการยืนยันตัวตนตอนสมัคร** (บังคับเบอร์จริง),
รองรับ **Facebook OAuth** เป็นทางเลือก, และเพิ่ม **onboarding/welcome wizard** หลังสมัครเพื่อกรอกข้อมูลร้าน
ให้ครบ (slug ร้าน, ข้อมูลร้าน, สร้างสินค้า [ข้ามได้], แนะนำระบบ verify) ก่อนเข้าหน้าแรก.

**สถานะระบบปัจจุบัน (จาก code map):**
- NextAuth v4: providers = `FacebookProvider`, `phone-otp` (CredentialsProvider), `admin-credentials` (username+password, admin เท่านั้น). `auth.ts`
- Seller auth pages มีอยู่แล้ว: `(paces)/seller/auth/{sign-in,sign-up,verify-otp}` (Paces basic) — **งานนี้คือ redesign + ขยาย**
- `User.passwordHash` **มี field อยู่แล้ว** (ใช้เฉพาะ admin) → seller จะเริ่มใช้ field เดียวกัน
- `Shop.category` = free-text(50) ปัจจุบัน; **ไม่มี** `Shop.slug`
- OTP: in-memory, TTL 10 นาที, rate-limit 3/10min, ส่งผ่าน Apitel (`lib/otp.ts`)
- Facebook ทำงานได้ใน NextAuth แต่ปุ่มแสดงเฉพาะหน้า buyer (Vuexy); **prod ยังไม่มี FACEBOOK_ID/SECRET**

## 2. Auth Model (decision หลัก)

| Method | บทบาท |
|---|---|
| **username + password** | login หลักของ seller (credential ใหม่ `seller-credentials`) |
| **phone + OTP** | ยืนยันตัวตน **ตอนสมัคร** (พิสูจน์เบอร์จริง) + ใช้ใน flow **ตั้ง/ลืมรหัสผ่าน** |
| **Facebook OAuth** | ทางเลือก login/signup; FB user ไม่มี phone/username/password → ถูกบังคับเข้า onboarding เพื่อ verify phone + ตั้งข้อมูลก่อนใช้งาน |

**Password rule:** ≥8 ตัวอักษร, ต้องมีอย่างน้อย 1 ตัวอักษร + 1 ตัวเลข + 1 อักขระพิเศษ. hash ด้วย bcryptjs (reuse pattern จาก `admin-credentials`: max-length guard 1000  char กัน bcrypt CPU DoS + rate-limit ต่อ username).

## 3. Scope & Decomposition (3 phase, 1 spec, build ตามลำดับ)

### P1 — Auth/Data Foundation (backend + security)
- **Schema:** เพิ่ม `Shop.slug String? @unique` (migration ปลอดภัย ไม่ทำลายข้อมูล); `category` ยึด constant list (validation เปลี่ยนจาก maxLength(50) → `picklist` ของ category keys).
- **Provider ใหม่ `seller-credentials`** (CredentialsProvider): `username` + `password` → bcrypt compare กับ `User.passwordHash` ของ user ที่ `isShop=true` (หรือมี shop). reject admin/non-seller, generic error (กัน enumeration), rate-limit 5/10min ต่อ username (reuse pattern admin).
- **Password set ตอน signup:** ขยาย `phone-otp` provider (mode `signup`) ให้รับ `password` → hash → set `passwordHash`. (ยังคง phone-OTP verification เดิม + auto L1 verify + linkBuyerHistory + create shop atomic).
- **Phone dedupe ก่อนส่ง OTP (signup):** ก่อนยิง `/api/otp/send` หน้า signup ต้องเช็ค **phone ยังไม่ถูกใช้** + **username ว่าง**. ใช้ `isNewUser` จาก `/api/otp/send` (มีอยู่) + `/api/users/check-username` (มีอยู่). ถ้า phone ซ้ำ → error "เบอร์นี้มีบัญชีแล้ว เข้าสู่ระบบด้วยรหัสผ่าน".
- **ตั้ง/ลืมรหัสผ่าน via OTP:** flow `reset-pass` (กรอกเบอร์ → OTP) → `new-pass` (ตั้งรหัสใหม่). ครอบ 2 เคส: (ก) บัญชี OTP-only เดิมที่ยังไม่มี password (migration), (ข) ลืมรหัส. endpoint ใหม่ `POST /api/auth/set-password` (verify OTP server-side แล้ว set passwordHash; ผูก phone→user).
- **Facebook → seller:** เปิดปุ่ม FB บนหน้า seller; callback เดิมสร้าง user. user ใหม่จาก FB → `isShop=false`, ไม่มี phone/username → routing เข้า onboarding (P3) เพื่อ complete profile.

### P2 — Auth Pages Redesign (Paces `auth/card`)
redesign 3 หน้าเดิม + เพิ่ม 2 หน้า (reset/new pass). ทุกหน้า copy จาก theme `auth/card/*` (Hard Rule 1) + `Base:` line.

| หน้า (route ใต้ seller) | Theme source (Base) | เนื้อหา/field |
|---|---|---|
| `/auth/sign-in` | `theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx` (+components) | username, password, [ลืมรหัส], ปุ่ม **เข้าสู่ระบบ**, divider, **ปุ่ม Facebook**, ลิงก์ไปสมัคร |
| `/auth/sign-up` | `theme/paces/Admin/TS/src/app/auth/card/sign-up/page.tsx` (+components) | displayName (ชื่อ Account แสดงผล), category (dropdown), username (live dedupe), password + confirm, phone. ปุ่ม **สมัคร** → dedupe → ส่ง OTP. + ปุ่ม Facebook |
| `/auth/verify-otp` | `theme/paces/Admin/TS/src/app/auth/card/two-factor/page.tsx` หรือ `login-pin/` (pin/otp input) | OTP 6 หลัก, **countdown 60s** ก่อน resend ได้, masked phone, TTL จริง 10 นาที |
| `/auth/reset-pass` (ใหม่) | `theme/paces/Admin/TS/src/app/auth/card/reset-pass/page.tsx` | กรอกเบอร์ → ส่ง OTP → ไป verify-otp(mode=reset) |
| `/auth/new-pass` (ใหม่) | `theme/paces/Admin/TS/src/app/auth/card/new-pass/page.tsx` (+components) | ตั้ง password ใหม่ + confirm (หลัง OTP ผ่าน) |

- Form lib: React Hook Form + Yup (ตามเดิม). dropdown category: source จาก `theme/paces/.../ui/dropdowns/page.tsx` (Hard Rule 6) — form-select.
- toast/alert: `pacesToast` (Hard Rule 9); confirm/blocking = Sweet Alerts (Hard Rule 8) ถ้ามี.

### P3 — Onboarding / Welcome Wizard
หน้า `/onboarding` (seller) — multi-step, เข้าหลัง signup success **และ** FB-new-user (profile ยังไม่ครบ). gate: ถ้า shop ยังไม่ complete (ไม่มี slug/category หรือ FB user ไม่มี phone-verified) → redirect เข้า onboarding ก่อน `/dashboard`.

**Steps (progress checklist — ข้ามได้ตามที่ระบุ):**
1. **ยืนยันเบอร์ (เฉพาะ FB user ที่ยังไม่มี phone)** — กรอกเบอร์ → OTP → verify (L1). password-signup ข้าม step นี้ (verify แล้ว).
2. **ตั้ง URL ร้าน (slug)** — พิมพ์เอง, live dedupe, `a-z0-9-` 3–30 char, unique. preview `deepthailand.app/{slug}`. **บังคับ**.
3. **ข้อมูลร้าน** — โลโก้ (optional), คำอธิบายร้าน, category (ยืนยัน/แก้จาก signup), ที่อยู่ (optional). บังคับเฉพาะที่ระบบต้องใช้.
4. **สร้างสินค้าแรก (ข้ามได้)** — form ย่อ (ชื่อ/ราคา/รูป) reuse logic product create; ปุ่ม "ข้ามไปก่อน".
5. **แนะนำระบบ Verify** — อธิบาย L1/L2/L3 + ประโยชน์ trust score + CTA ไป verification (อ่านอย่างเดียว ข้ามได้).
6. **เสร็จ → `/dashboard`**.

Theme source wizard: safepay-ux pin จาก Paces (form-wizard/horizontal stepper) ตอนออกแบบ P3 (Hard Rule 8 gate).

## 4. Data Model Changes (Prisma)

```prisma
model Shop {
  // ...เดิม...
  slug         String?  @unique   // ใหม่: public shop URL, a-z0-9-, 3–30, nullable (กรอกใน onboarding)
  category     String?            // คงชนิด String แต่ validation = picklist ของ SHOP_CATEGORIES
}
```
- migration: `ADD COLUMN slug` + unique index. nullable → ปลอดภัยกับ row เดิม. safepay-database ตรวจ.
- ไม่แตะ `User.passwordHash` (มีแล้ว).

## 5. Category Constant

`src/lib/shop-categories.ts` (constant + label map ไทย) — keys:
`fashion, beauty_health, electronics_it, home_living, food_beverage, mom_baby, sports_outdoor, games_collectibles, services_digital, other`
ใช้ทั้ง validation (`v.picklist`), signup dropdown, onboarding, public profile, filter ภายหลัง.

## 6. Routing / Gate (proxy.ts)

- seller unauth ที่หน้า protected → `/auth/sign-in` (เดิม).
- seller authed แต่ **profile ยังไม่ครบ** (ไม่มี shop.slug | FB user ยังไม่ verify phone) → redirect `/onboarding` (ก่อน `/dashboard`).
- onboarding เสร็จ (slug set + phone verified) → ปล่อยเข้า `/dashboard`.
- session ต้องมี flag พอให้ตัดสิน (เพิ่ม `shopSlug`/`needsOnboarding` ใน session callback หรือ query DB ใน proxy — เลือกตอน plan).

## 7. Edge Cases & Security

- **phone ซ้ำตอน signup** → block + ชี้ไป sign-in.
- **username ซ้ำ** → live error (มี check-username แล้ว).
- **password ไม่ตรง confirm / ไม่ผ่าน rule** → Yup error.
- **OTP หมดอายุ/ผิด** → generic error; resend ได้หลัง 60s; rate-limit 3/10min (เดิม).
- **enumeration:** sign-in error generic ("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); set-password ต้องผ่าน OTP จริงเท่านั้น (กันยึดบัญชีคนอื่นด้วยเบอร์).
- **CSRF/rate-limit:** ทุก endpoint ใหม่ผ่าน `guardApi` (มี). set-password = mutation → origin-check + rate-limit.
- **bcrypt DoS:** max password length guard.
- **FB user ไม่มีเบอร์:** บังคับ verify ใน onboarding ก่อนใช้งาน (ตรงเจตนา "เบอร์จริงเท่านั้น").
- **slug:** reserved words (admin, api, auth, seller, u, o, dashboard, onboarding) ห้ามใช้; lowercase normalize.
- security review (safepay-security) บังคับสำหรับ P1 (แตะ auth/password/env).

## 8. Out of Scope

- Buyer (Vuexy) auth — ไม่แตะ (คนละ theme/subdomain).
- เปลี่ยน OTP engine เป็น Redis (ยัง in-memory MVP).
- เปิด FB creds ใน prod (ops แยก; build ปุ่ม/flow เฉย ๆ).
- 2FA จริง (ใช้ two-factor เป็น layout ของ OTP verify เท่านั้น ไม่ใช่ TOTP).
- เปลี่ยน public URL เดิม `/u/[username]` (slug = เพิ่ม ไม่ทับ).

## 9. Assumptions

- prod เพิ่งเปิด (2026-06-07) → seller จริงน้อย/ยังไม่มี; การ migrate OTP-only→password ผ่าน "ตั้งรหัสผ่าน via OTP" เพียงพอ ไม่ต้อง bulk migration.
- Apitel SMS ใน prod ใช้ได้แล้ว (OTP signup/reset ส่งได้).
- ดีไซน์ layout ยึด theme `auth/card` ตาม Hard Rule 1 — ไม่ออกแบบเอง; safepay-ux ออก Design Spec ต่อ (P2/P3) ก่อน dev.

## 10. Definition of Done (ต่อ phase)

- **P1:** migration apply, provider `seller-credentials` login ได้, signup ตั้ง password ได้, dedupe-before-OTP, set/forgot-password via OTP, FB→seller, tsc 0, security review pass.
- **P2:** 5 หน้า redesign จาก theme (Base: line), Facebook ปุ่มแสดง, 60s countdown, QA E2E (Chrome DevTools) signup→OTP→login happy path.
- **P3:** onboarding gate + 6 steps, slug dedupe, product skippable, QA E2E ครบ flow signup→onboarding→dashboard.

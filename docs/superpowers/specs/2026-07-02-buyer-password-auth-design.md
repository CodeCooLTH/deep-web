# Buyer Password Auth — Design Spec

> วันที่: 2026-07-02
> สถานะ: รอ user review
> ขอบเขต: ยกระดับ auth ฝั่ง buyer (`(marketing)/**`, Vuexy) ให้เทียบเท่า seller — เพิ่ม
> **username + password login** + **ลืมรหัสผ่าน (reset/new-pass)** + UX parity ของปุ่ม social/OAuth
> โดยยัง **คง OTP login เดิมไว้ควบคู่**

---

## 1. Goal / Non-Goal

**Goal**
- buyer login ได้ด้วย **username + password** (นอกเหนือจาก OTP เดิม + FB/LINE)
- buyer signup **ตั้ง password ตั้งแต่แรก** (เพิ่ม field ในหน้า sign-up)
- buyer **ลืมรหัสผ่าน / ตั้งรหัสผ่านครั้งแรก** ได้ผ่าน OTP (reset-pass → verify-otp → new-pass)
- ปุ่ม social + หน้า loading OAuth ของ buyer เทียบเท่า seller (UX parity)

**Non-Goal (Out of scope)**
- ไม่ทำ password login ให้ **admin** (มี provider แยกอยู่แล้ว)
- ไม่เปลี่ยน backend ของ OAuth (FB/LINE/IG) — ใช้ provider เดิมที่ share อยู่
- ไม่แตะ schema/DB (`User.passwordHash` มีอยู่แล้ว — seller ใช้ field เดียวกัน)
- ไม่ทำ email/password (buyer ยังยึด phone เป็น identifier ของ OTP)
- ไม่บังคับ legacy OTP-only user ให้ตั้ง password (ใช้ reset-flow ตั้งเองได้)

---

## 2. สิ่งที่มีอยู่แล้ว (reuse — ไม่ต้องสร้างใหม่)

| ของเดิม | ใช้ทำอะไรในงานนี้ |
|---|---|
| provider `facebook`/`line`/`instagram`/`phone-otp` (`lib/auth.ts`) | share ทุก subdomain อยู่แล้ว — buyer ใช้ได้เลย |
| `POST /api/account/set-password` | **provider-agnostic** (phone+OTP, user คนไหนก็ได้) → buyer new-pass เรียกตรง ๆ |
| `POST /api/otp/send` | ส่ง OTP (signup / reset / resend) |
| `GET /api/users/check-username`, `GET /api/users/check-phone` | live-dedupe ใน sign-up |
| `PasswordInputWithStrength` (`src/components/`) | password field + strength bar |
| `lib/password.ts` (`hashPassword`/`verifyPassword`/`isStrongPassword`) | hash + verify |
| `SetPasswordSchema` (`lib/validations.ts`) | valibot schema ของ set-password |

**บทเรียนสำคัญ:** `/api/account/set-password` ไม่ผูกกับ seller เลย → buyer reset/new-pass **ไม่ต้องแตะ backend ส่วนนี้**

---

## 3. Backend changes (`src/lib/auth.ts` — security-sensitive)

### 3.1 provider ใหม่ `buyer-credentials`
มิเรอร์ `seller-credentials` **แต่ตัดเงื่อนไข `isShop`** (buyer ไม่ใช่ร้านค้า):

```
authorize(username, password):
  - guard: username & password ต้องมี; password.length > 1000 → null (bcrypt DoS)
  - rate-limit 5/10min ต่อ username (reuse adminLoginTimestamps store เดิม — username @unique ทั้งระบบ)
  - user = findUnique({ username })
  - user ไม่มี → null
  - user.isAdmin → null           (admin ใช้ provider แยก)
  - user.passwordHash == null → null   (ยังไม่ตั้ง password → ใช้ OTP/social หรือไป reset-flow)
  - verifyPassword ไม่ผ่าน → null
  - return { id, name, email }
```

> **หมายเหตุ:** provider นี้รับ user ที่ไม่ใช่ admin ทุกคน (รวม seller ที่ล็อกอินฝั่ง buyer domain
> ก็ได้ — บัญชีเดียวกัน). ไม่ตรวจ isShop เพราะ main site คือทุกคน

### 3.2 แก้ `phone-otp` authorize ให้ buyer signup ตั้ง password ได้
ปัจจุบัน `passwordHash` ถูกตั้ง **เฉพาะใน branch `mode==='signup' && shopName`** (seller path).
buyer signup **ไม่มี shopName** → password ถูกทิ้ง.

**แก้:** hoist การ hash password ออกมาที่ path สร้าง user ใหม่ทั่วไป —
เมื่อมี `credentials.password` และผ่าน `isStrongPassword` → ใส่ `passwordHash` ลงใน `user.create` data
โดย **ไม่สร้าง Shop / ไม่ set isShop** (branch shopName เดิมยังทำหน้าที่ shop+isShop เหมือนเดิม
แต่ไม่ต้องจัดการ password ซ้ำ):

```
เมื่อสร้าง user ใหม่ (if !user):
  passwordHash = (password && isStrongPassword(password)) ? hashPassword(password) : undefined
  password อ่อน (มีค่าแต่ไม่ strong) → return null (server guard — กัน Yup bypass)
  user.create({ ..., passwordHash })       ← เพิ่ม passwordHash ที่นี่
  ...
  if (mode==='signup' && shopName):        ← seller path เดิม (สร้าง shop + isShop) ตัด password logic ออก
```

- buyer signup: มี password, ไม่มี shopName → user มี passwordHash, isShop=false ✅
- seller signup: มี password + shopName → user มี passwordHash + Shop + isShop=true ✅ (พฤติกรรมเดิมคงอยู่)

**ผลต่อ security:** เพิ่ม attack surface = 0 (password ยัง verify ที่ backend, isStrongPassword ยังบังคับ).
ต้องผ่าน `safepay-security` review เพราะแตะ authorize.

---

## 4. Frontend changes (buyer / Vuexy — copy จาก theme)

> ทุกไฟล์ commit ต้องมี `Base:` line (Hard Rule 3). ใช้ MUI + Vuexy primitive (ไม่ใช่ Paces)

### 4.1 `sign-up/SignUpCard.tsx` — เพิ่ม password
- **Base:** `theme/vuexy/.../views/pages/auth/RegisterV1.tsx` (ของเดิมอิงอยู่แล้ว)
- เพิ่ม field: `password` (PasswordInputWithStrength) + `confirmPassword` (oneOf) — **required**
- Yup: password ≥8 + ตัวอักษร + ตัวเลข + อักขระพิเศษ (สูตรเดียวกับ seller)
- submit flow ใหม่ (มิเรอร์ seller): check username → check phone → `otp/send` →
  **`sessionStorage.signupDraft = { password }`** (ไม่ผ่าน URL) → push verify-otp
  (URL คง `mode=signup, phone, name, username` — **ไม่มี shopName** เพราะ buyer ไม่เปิดร้าน)
- ปุ่ม social: อัปเป็นปุ่มเต็มกว้างมี label (ดู 4.5)

### 4.2 `sign-in/SignInCard.tsx` — username+password primary + OTP toggle
- **Base:** `theme/vuexy/.../views/pages/auth/LoginV1.tsx`
- **โหมด password (default):** ฟอร์ม username + password + ลิงก์ "ลืมรหัสผ่าน?" (→ `/auth/reset-pass`)
  - submit: `signIn('buyer-credentials', { username, password, redirect:false })`
  - สำเร็จ → push `safeCallbackUrl` (default `/`); fail → inline error รวม (generic กัน enumeration)
- **โหมด OTP:** toggle "เข้าสู่ระบบด้วยรหัส OTP แทน" ↔ กลับ "เข้าสู่ระบบด้วยรหัสผ่าน"
  - โหมด OTP = ฟอร์มกรอกเบอร์เดิม → `otp/send` → push verify-otp `mode=signin` (logic เดิมทั้งหมด)
- social buttons (FB/LINE + IG flag) อยู่ใต้ divider — ใช้ร่วมทั้งสองโหมด
- **Decision (default):** ใช้ toggle ในหน้าเดียว 1 card (routing เปลี่ยนน้อยสุด). *ยืนยันได้ทีหลัง*

### 4.3 `verify-otp/VerifyOtpCard.tsx` — รองรับ mode=reset + อ่าน signupDraft
- **Base:** เดิม (Vuexy OTPInput) — ต่อยอด
- `mode` ขยายเป็น `'signin' | 'signup' | 'reset'`
- `mode==='signup'`: อ่าน `sessionStorage.signupDraft.password` ส่งเข้า `signIn('phone-otp', {..., password})` → clear draft
- `mode==='reset'`: **ไม่ consume OTP ที่นี่** — เก็บ `sessionStorage.resetDraft = { phone, otp }` → push `/auth/new-pass`
  (กัน double-consume — set-password เป็นที่ verifyOtp จริงที่เดียว; otp ไม่อยู่ใน URL)

### 4.4 หน้าใหม่: `reset-pass/` + `new-pass/`
- **`reset-pass/`** — **Base:** `theme/vuexy/.../views/pages/auth/ForgotPasswordV1.tsx`
  - เปลี่ยน email → phone field; submit `otp/send` → push verify-otp `mode=reset&phone=`
  - 429 → toast; ไม่ leak phone oracle (otp/send คืน ok เสมอ, fail ตอน verify)
- **`new-pass/`** — **Base:** `theme/vuexy/.../views/pages/auth/ResetPasswordV1.tsx`
  - อ่าน `resetDraft` จาก sessionStorage (ไม่มี → redirect กลับ reset-pass)
  - PasswordInputWithStrength + confirmPassword → `POST /api/account/set-password { phone, otp, password }`
  - error map: 400 รหัสไม่ผ่าน / 401 OTP หมดอายุ (→ reset-pass) / 404 ไม่พบบัญชี
  - สำเร็จ → clear draft → toast → `/auth/sign-in`
- **หมายเหตุ:** flow นี้ทำหน้าที่ "ตั้ง password ครั้งแรก" ให้ legacy OTP-only user ด้วย (set-password ไม่สน passwordHash เดิม)

### 4.5 UX parity — ปุ่ม social + OAuth callback
- **ปุ่ม social:** เปลี่ยนจาก IconButton เล็ก → ปุ่มเต็มกว้างมี label ("เข้าสู่ระบบด้วย Facebook/LINE")
  แต่คง MUI/Vuexy primitive (ไม่ยก Paces markup มา). สี brand: FB `text-facebook`, LINE `#06C755`, IG flag `#E1306C`
- **callback page ใหม่:** `auth/callback/[provider]/page.tsx` (Vuexy) — spinner รอ session → redirect `/`
  - **Base (spinner):** Vuexy loading pattern (CircularProgress) + AuthIllustrationWrapper/Logo
  - **Decision (default):** LINE/IG ผ่านหน้านี้ (`callbackUrl=/auth/callback/line`), FB เด้งตรง `/`
    (มิเรอร์บทเรียน seller: ลด redirect chain กัน Safe Browsing false-positive). *ยืนยันได้ทีหลัง*

---

## 5. Data flow (สรุป)

```
signup:  SignUpCard → otp/send → sessionStorage.signupDraft{password}
         → verify-otp(mode=signup) → signIn(phone-otp,{...,password}) → user{passwordHash,isShop=false} → /

login:   SignInCard(password) → signIn(buyer-credentials,{username,password}) → /
login:   SignInCard(OTP toggle) → otp/send → verify-otp(mode=signin) → signIn(phone-otp) → /

reset:   reset-pass → otp/send → verify-otp(mode=reset) → sessionStorage.resetDraft{phone,otp}
         → new-pass → POST set-password{phone,otp,password} → /auth/sign-in
```

---

## 6. Security considerations

1. **password ไม่ผ่าน URL** — signup/reset เก็บใน sessionStorage เท่านั้น (มิเรอร์ seller OQ-1)
2. **OTP single-use** — reset ไม่ consume ที่ verify-otp; consume จริงที่ set-password เท่านั้น
3. **enumeration** — sign-in fail คืน error รวม (ไม่บอก username/password อันไหนผิด); reset ไม่ leak ว่าเบอร์มี/ไม่มี
4. **rate-limit** — buyer-credentials 5/10min ต่อ username (reuse store); otp/send มี rate-limit เดิม
5. **bcrypt DoS guard** — password.length > 1000 → reject ก่อน compare
6. **buyer-credentials ต้อง `!isAdmin`** — กัน buyer/seller ที่รู้รหัส admin login ผิด role
7. แตะ `lib/auth.ts` → **บังคับผ่าน `safepay-security` review**

---

## 7. Edge cases

- legacy OTP-only user (ไม่มี passwordHash): password login → null → ใช้ OTP หรือ reset-flow ตั้งรหัส
- FB/LINE user ที่ยังไม่มี phone (needsRegistration): ใช้ reset ไม่ได้ (ต้องมี phone+OTP) → login ผ่าน social ตามเดิม
- signupDraft หาย (refresh/direct URL): verify-otp signup **ดำเนินต่อโดยไม่มี password** → user ไม่มี passwordHash (ตั้งภายหลังผ่าน reset-flow ได้) — **พฤติกรรมเดียวกับ seller VerifyOtpForm** (Controller decision 2026-07-02, ดู scope baseline Change Log). ไม่ redirect กลับ sign-up
- resetDraft หาย: new-pass redirect กลับ reset-pass
- username ซ้ำ/phone ซ้ำ ตอน signup: inline error (pattern เดิม)

---

## 8. รายการไฟล์ (สำหรับ writing-plans)

**แก้:**
- `src/lib/auth.ts` — provider `buyer-credentials` + hoist password ใน phone-otp
- `src/app/(marketing)/auth/sign-up/SignUpCard.tsx` — password fields + signupDraft
- `src/app/(marketing)/auth/sign-in/SignInCard.tsx` — password form + OTP toggle + social buttons
- `src/app/(marketing)/auth/verify-otp/VerifyOtpCard.tsx` — mode=reset + signupDraft

**สร้าง:**
- `src/app/(marketing)/auth/reset-pass/page.tsx` + `ResetPassCard.tsx`
- `src/app/(marketing)/auth/new-pass/page.tsx` + `NewPassCard.tsx`
- `src/app/(marketing)/auth/callback/[provider]/page.tsx`

**เทส:** Playwright E2E (มาตรฐานโปรเจกต์) — signup+password, password login, OTP login, reset flow, social button render

---

## 9. Open decisions (default เลือกไว้แล้ว — ยืนยัน/แก้ได้)
1. sign-in OTP: **toggle ในหน้าเดียว** (vs แยก route)
2. OAuth callback: **เพิ่ม (LINE/IG ผ่านหน้า, FB ตรง)** (vs ข้าม)

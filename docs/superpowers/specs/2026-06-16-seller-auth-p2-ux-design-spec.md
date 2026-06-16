# Seller Auth P2 — UX Design Spec (safepay-ux gate, Hard Rule 8)

> วันที่: 2026-06-16 · phase P2 (Auth Pages UI) · route group `src/app/(paces)/seller/auth/*` (Paces, seller subdomain, น้ำเงิน #236dc9, Anuphan)
> baseline: `docs/scope/2026-06-16-seller-auth-scope-baseline.md` (S-P2-1..6) · feature spec: `docs/superpowers/specs/2026-06-16-seller-auth-redesign-onboarding-design.md`
> **ทุกหน้า: copy จาก Paces `theme/paces/Admin/TS/src/app/auth/card/*` (Hard Rule 1 + Base: line) · mobile-first · toast=pacesToast · confirm=Sweet Alerts**

## Controller decisions (OQ resolved)
- **OQ-1 password handoff:** signup เก็บ `{password, category}` ใน **sessionStorage** (ไม่ใส่ใน query string) → verify-otp อ่านมาประกอบ `signIn('phone-otp')` → **clear ทันทีหลัง signIn**. (กัน password หลุดใน URL/history/log) — query เหลือเฉพาะ `mode,phone,name,username,shopName`.
- **OQ-2 Remember me:** ตัดออก (คง JWT session เดิม).
- **OQ-3 Facebook signup:** FB-new-user → callback → onboarding (P3) ผ่าน `needsOnboarding` (ไม่มี phone/slug).
- **OQ-4 OTP box @375px:** dev QA จริง ปรับ `gap-1.5`/`text-lg` ให้ tap ได้.
- **OQ-5 photo panel:** ใช้ `assets/images/auth.jpg` เดิม (custom art = polish ภายหลัง); panel `hidden lg:block`.

## Mobile-first rule (ทุกหน้า — user mandate)
ใช้งานง่ายที่ 375px: outer `p-5 sm:p-8 lg:p-12.5`, card-body `p-6 sm:p-8 lg:p-12.5`, photo panel `hidden lg:block`, ปุ่ม/อินพุต `w-full`, ปุ่ม `py-3` (tap ≥44px), ไม่มี horizontal overflow. QA ที่ 375px ทุกหน้า.

---

## S-P2-6 — Auth Layout
- Base: `auth/card/sign-in/page.tsx` wrapper (`flex min-h-screen items-center` + container + grid-cols-2: ซ้าย form / ขวา photo `hidden lg:block` + corner decorators auth-card-bg).
- `layout.tsx` เดิม = pass-through `{children}` → คงไว้ (เพิ่ม metadata title template "%s | Deep ผู้ขาย" ถ้ายังไม่มี). ทุกหน้าใช้ wrapper เดียวกัน.

## S-P2-1 — Sign-in (`/auth/sign-in`)
Base: `auth/card/sign-in/page.tsx` + `components/Form.tsx`.
- Header: AuthLogo + "ยินดีต้อนรับผู้ขาย" / "กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าสู่ระบบ".
- ปุ่ม **Facebook** `w-full` (`btn border border-default-300`, icon `bxl:facebook-circle` สี #1877f2) → `signIn('facebook',{callbackUrl:'/dashboard'})`. แล้ว dashed divider "หรือเข้าด้วย username".
- Fields: `username` (input-icon-group `tabler:user`), `รหัสผ่าน` (`tabler:lock-password`, type=password). row ใต้: link "ลืมรหัสผ่าน?" → `/auth/reset-pass`.
- Submit `btn bg-primary w-full py-3` "เข้าสู่ระบบ" → `signIn('seller-credentials',{username,password,redirect:false})` → ok `/dashboard`; fail → `pacesToast.error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')` (generic, กัน enumeration).
- Footer: "ยังไม่มีบัญชี? [สมัครสมาชิก]" → `/auth/sign-up`.
- Edge: loading "กำลังเข้าสู่ระบบ..." (disabled); empty → Yup inline; network → toast.

## S-P2-2 — Sign-up (`/auth/sign-up`)
Base: `auth/card/sign-up/page.tsx` + `components/SignUpForm.tsx`. ปุ่ม FB + divider เหมือน sign-in.
Fields (ลำดับ):
1. `displayName` (icon `tabler:user`, 2–50) "ชื่อที่แสดง"
2. `category` **`<select class="form-select w-full">`** (Hard Rule 6 — native select ไม่ใช่ hs-dropdown ที่พัง re-render) option default "-- เลือกหมวดหมู่ --" + map `SHOP_CATEGORY_LABELS` (10). required + `isShopCategory()`
3. `username` (icon `tabler:at` หรือ fallback `tabler:user-circle`) — debounce 400ms → `GET /api/users/check-username?u=` → status inline (กำลังตรวจสอบ/ใช้ชื่อนี้ได้/ถูกใช้แล้ว/สงวนไว้)
4. `password` → reuse `src/components/PasswordInputWithStrength.tsx` (`showIcon`), hint "≥8 ตัว มีตัวอักษร ตัวเลข และอักขระพิเศษ"
5. `confirmPassword` (icon `tabler:lock-password`) Yup `.oneOf([ref('password')],'รหัสผ่านไม่ตรงกัน')`
6. `phone` (icon `tabler:phone`, `type=tel inputMode=numeric`, `/^0[0-9]{9}$/`)

Submit: Yup ok + username ok → `GET /api/users/check-phone?phone=` → ถ้า `{available:false}` → `pacesToast.error('เบอร์นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่าน')` หยุด → ถ้าว่าง → `POST /api/otp/send {contact:phone,type:'PHONE'}` → **sessionStorage.setItem('signupDraft', {password,category})** → `router.push('/auth/verify-otp?mode=signup&phone=&name=&username=&shopName=')` (ไม่มี password ใน query).
Edge: username checking → submit disabled; phone ซ้ำ → toast หยุด; OTP send fail → toast.

## S-P2-3 — Verify OTP (`/auth/verify-otp`)
Base: **`auth/card/two-factor/page.tsx`** (เลือกแทน login-pin — มี masked-address + OTP pattern ตรงกว่า).
- masked phone `text-2xl font-bold text-center`; OTP 6 boxes `.two-factor flex gap-2` (mobile: ปรับ gap-1.5/text-lg) auto-focus next.
- **countdown 60s**: mount เริ่ม 60; `countdown>0` → "ยังไม่ได้รับ SMS? ส่งใหม่ใน {N} วินาที" (จาง, ไม่ click); `=0` → link "ส่งอีกครั้ง" → `POST /api/otp/send` → reset 60.
- submit (disabled ถ้า <6 หลัก):
  - `mode=signup` → อ่าน sessionStorage `signupDraft` → `signIn('phone-otp',{phone,otp,mode,displayName,username,shopName,password,category,redirect:false})` → ok → **sessionStorage.removeItem('signupDraft')** → `/dashboard`
  - `mode=reset` → `router.push('/auth/new-pass?phone=&otp=')` (ส่ง otp ต่อ; ดู note new-pass)
- ไม่มี phone ใน params → `router.replace('/auth/sign-in')`.
- Edge: OTP ผิด/หมดอายุ → inline `text-danger` + clear digits + ปุ่ม active; resend ok → toast.

## S-P2-4 — Reset password (`/auth/reset-pass`)
Base: `auth/card/reset-pass/page.tsx` (ตัด Terms checkbox; email→phone).
- `phone` (icon `tabler:phone`) → submit → `POST /api/otp/send` → `router.push('/auth/verify-otp?mode=reset&phone=')`.
- phone ไม่มีในระบบ → otp/send ยัง ok (กัน oracle) → fail ตอน verify. 429 → `pacesToast.error('คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่')`.
- "กลับไปที่ [เข้าสู่ระบบ]".

## S-P2-5 — New password (`/auth/new-pass`)
Base: `auth/card/new-pass/page.tsx` + `components/NewPassForm.tsx` (ตัด email field + OTP input + Terms).
- รับ `phone,otp` จาก searchParams; ไม่มี → `router.replace('/auth/reset-pass')`.
- `password` (PasswordInputWithStrength + hint ไทย) + `confirmPassword` (oneOf).
- submit → `POST /api/account/set-password {phone,otp,password}` → ok → `pacesToast.success('ตั้งรหัสผ่านใหม่เรียบร้อย')` → `/auth/sign-in`.
- error map: 400 weak → "รหัสผ่านไม่ผ่านเงื่อนไข"; 401 OTP → "รหัส OTP หมดอายุ กรุณาขอรหัสใหม่" + link reset-pass; 404 → "ไม่พบบัญชีที่ใช้เบอร์นี้".

> **note reset OTP single-use:** `verifyOtp` consume OTP ตอน verify-otp(mode=reset). ดังนั้น mode=reset **ห้าม** เรียก verifyOtp ที่ verify-otp page แล้วเรียกซ้ำที่ set-password (OTP จะถูก consume ไปแล้ว → set-password 401). **flow ที่ถูก:** verify-otp(mode=reset) **ไม่ consume** (แค่ pass phone+otp ต่อ); set-password เป็นที่ verifyOtp จริงที่เดียว. → developer: verify-otp mode=reset อย่าเรียก signIn/verifyOtp, แค่ส่ง phone+otp ไป new-pass ผ่าน sessionStorage (กัน otp ใน URL) แล้ว set-password consume. **(Controller note — สำคัญ, กัน double-consume)**

---

## Theme Source Mapping (รวม)
| หน้า | Base file | Component เสริม |
|---|---|---|
| Layout S-P2-6 | `auth/card/sign-in/page.tsx` (wrapper) | layout.tsx เดิม pass-through |
| sign-in S-P2-1 | `auth/card/sign-in/page.tsx` + `components/Form.tsx` | `bxl:facebook-circle`,`tabler:user`,`tabler:lock-password` |
| sign-up S-P2-2 | `auth/card/sign-up/page.tsx` + `components/SignUpForm.tsx` | `src/components/PasswordInputWithStrength.tsx`; `form-select` |
| verify-otp S-P2-3 | `auth/card/two-factor/page.tsx` | countdown 60s (custom) |
| reset-pass S-P2-4 | `auth/card/reset-pass/page.tsx` | `tabler:phone` |
| new-pass S-P2-5 | `auth/card/new-pass/page.tsx` + `components/NewPassForm.tsx` | `PasswordInputWithStrength` |

## QA (P2) — safepay-qa
mobile viewport 375px ทุกหน้า + happy path: signup→OTP→login (seller-credentials), reset→verify→new-pass→login. Chrome DevTools MCP `*.deepth.local:4000`. seed seller ที่มี password = test acct `0000000001`/`Abcd123!` (ตั้งใน P1).

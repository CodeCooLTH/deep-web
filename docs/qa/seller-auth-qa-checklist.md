# QA Checklist — Seller Auth (login + signup + reset + onboarding)

> reusable regression checklist · feature SIGNED-OFF 2026-06-16 (P1 backend / P2 auth pages / P3 onboarding)
> spec: `docs/superpowers/specs/2026-06-16-seller-auth-*.md` · baseline: `docs/scope/2026-06-16-seller-auth-scope-baseline.md`
> รันที่ `seller.deepth.local:4000` (user รัน dev server เอง) · test bypass: `0000000001`/`123456` (seller มีอยู่), `0000000009`/`123456` (เบอร์เปล่าสำหรับ signup ใหม่ — dev only)

## ⚠️ ก่อนเทสทุกครั้ง (pre-flight)
- [ ] **restart dev server ถ้าเพิ่ง migrate/generate** — stale Prisma client ทำ session คืน `{}` + route ที่ query column ใหม่ → 500 (ดู `docs/retro/2026-06-16-seller-auth-p2-p3-ui-onboarding.md`)
- [ ] dev server ขึ้นที่ port 4000 (`npm run dev -- -p 4000`)
- [ ] ล้าง test account เก่า (`0000000009`) ถ้าค้างจากรอบก่อน (signup ใหม่จะ fail dedupe)

## A. Automated (unit) — `npm test`
- [ ] `src/lib/shop-categories.test.ts` (2) · `shop-slug.test.ts` (3) · `password.test.ts` (2) · `validations-auth.test.ts` (4)
- [ ] `src/services/__tests__/shop-slug.service.test.ts` (3)
- [ ] `src/app/api/account/set-password/route.test.ts` (4) · `src/app/api/shops/check-slug/route.test.ts` (4)
- [ ] `npx tsc --noEmit` → exit 0
- [ ] grep gate: `rg "react-toastify" "src/app/(paces)/"` = 0 · `rg "7367F0" "src/app/(paces)/seller/auth"` = 0

## B. Sign-in (`/auth/sign-in`)
- [ ] login username+password ถูก → redirect `/dashboard` (test: `btpremium_suksawat`/`Abcd123!`)
- [ ] password ผิด → `pacesToast.error` generic "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" (top-right, ไม่ enumerate)
- [ ] >5 ครั้ง/10min ต่อ username → ถูก rate-limit (null)
- [ ] ปุ่ม Facebook แสดง (prod ใช้ไม่ได้จนกว่าใส่ creds)
- [ ] ลิงก์ "ลืมรหัสผ่าน?" → `/auth/reset-pass`; "สมัครสมาชิก" → `/auth/sign-up`
- [ ] mobile 375px: split layout เต็มจอ (ไม่ใช่ card box), photo panel ซ่อน, ปุ่มเต็มกว้าง, ไม่ overflow

## C. Sign-up (`/auth/sign-up`)
- [ ] 6 fields ครบ: ชื่อที่แสดง / หมวดหมู่(dropdown 10) / username / password(strength bar) / ยืนยันรหัส / เบอร์
- [ ] username live-dedupe (debounce): พิมพ์ → "กำลังตรวจสอบ" → "ใช้ชื่อนี้ได้"/"ถูกใช้แล้ว"/"สงวนไว้"
- [ ] password strength bar ขยับตามเงื่อนไข (≥8 + ตัวอักษร + เลข + อักขระพิเศษ); hint ไทย **บรรทัดเดียว** (ไม่มีอังกฤษซ้อน)
- [ ] confirm ไม่ตรง → "รหัสผ่านไม่ตรงกัน"
- [ ] submit เบอร์ที่มีบัญชีแล้ว → `pacesToast.error('เบอร์นี้มีบัญชีแล้ว...')` หยุด (ไม่ส่ง OTP)
- [ ] submit สำเร็จ → ส่ง OTP → ไป `/auth/verify-otp` (**password ไม่อยู่ใน URL** — เช็ค address bar)
- [ ] category = native `form-select` (Hard Rule 6); mobile ใช้ OS picker

## D. Verify-OTP (`/auth/verify-otp`)
- [ ] masked phone แสดง (`******5678`); 6 OTP box auto-focus next
- [ ] countdown 60s → resend disabled จนครบ → "ส่งอีกครั้ง" active
- [ ] OTP ผิด/หมดอายุ → inline error + clear digits
- [ ] mode=signup สำเร็จ → สร้าง account + redirect `/dashboard` (มี onboarding modal เด้ง)
- [ ] mode=reset → ไป `/auth/new-pass` (**ไม่ consume OTP ที่นี่** — consume ที่ set-password)
- [ ] เปิดตรง ๆ ไม่มี phone param → redirect `/auth/sign-in`
- [ ] mobile: 6 box ไม่ล้น 375px

## E. Reset → New password (`/auth/reset-pass` → `/auth/new-pass`)
- [ ] reset-pass: กรอกเบอร์ → ส่ง OTP → verify-otp(mode=reset); 429 → toast "ส่งคำขอบ่อยเกินไป"
- [ ] new-pass: เปิดตรง ๆ ไม่มี resetDraft → redirect `/auth/reset-pass`
- [ ] new-pass: ตั้งรหัสใหม่ + confirm → `POST /api/account/set-password` → toast success → `/auth/sign-in`
- [ ] login ด้วยรหัสใหม่ได้
- [ ] OTP หมดอายุ (401) → "รหัส OTP หมดอายุ..." + กลับ reset-pass

## F. Onboarding modal (เด้งบน `/dashboard` เมื่อ needsOnboarding)
- [ ] seller ใหม่ (ไม่มี slug) login → modal เด้ง
- [ ] **FB user ไม่มีเบอร์** → step 0 ยืนยันเบอร์ (OTP) ก่อน welcome; password-signup ข้าม step 0
- [ ] step welcome: icon + 3 การ์ด + "ลุยเลย"/"ข้ามไปก่อน"
- [ ] step category: 10 chips, เลือก 1 (ติ๊กถูก), next/ข้าม
- [ ] step slug (**บังคับ**): live dedupe + preview `deepthailand.app/{slug}`; reserved/taken/invalid → inline error; ปุ่มถัดไป disabled จน available; **ไม่มีปุ่มข้าม**
- [ ] step product (ข้ามได้): ชื่อ+ราคา → สร้าง / "ข้ามไปก่อน"
- [ ] เสร็จ → modal ปิด → dashboard (`needsOnboarding` = false, ไม่เด้งซ้ำ)
- [ ] ปิด modal ก่อนตั้ง slug → เด้งซ้ำรอบ navigation ถัดไป
- [ ] mobile: card เต็มจอ ~375px, ไม่ overflow, dots/chips/ปุ่มอ่านได้

## G. API E2E (curl — จำลอง SMS ด้วย test bypass `0000000009`)
> ดู command เต็มใน retro/spec; ลำดับ: check-phone → check-username → otp/send → `POST /api/auth/callback/phone-otp` (mode=signup) → session — verify ↓
- [ ] check-phone(ใหม่) → `{available:true}`; check-username(ใหม่) → `{available:true}`
- [ ] otp/send → `{message:"OTP sent",isNewUser:true}` (จำลอง SMS, ไม่ส่งจริง)
- [ ] signup callback → **302** (สำเร็จ); DB: user isShop=true, passwordHash verify, shop+category, L1 PHONE_OTP APPROVED, slug=null
- [ ] session → `needsOnboarding:true, needsPhoneVerify:false, shopSlug:null`
- [ ] `GET /api/shops/check-slug?slug=<valid>` → **200** `{available:true}` (ถ้า 500 = stale Prisma client → restart!)
- [ ] `POST /api/shops/slug {slug,category}` (authed) → **200** `{ok:true}`
- [ ] `POST /api/products {name,price,type:PHYSICAL}` (authed) → product created
- [ ] session → `needsOnboarding:false` (onboarding สำเร็จ)
- [ ] login `seller-credentials` callback → 200
- [ ] **cleanup**: ลบ test user `0000000009` ปลายรัน (Supabase = prod แชร์)

## H. Cross-cutting (ทุกหน้า)
- [ ] font = Anuphan (computed, ไม่ใช่ fallback)
- [ ] primary = น้ำเงิน `#236dc9` ไม่ใช่ม่วง `#7367F0`
- [ ] toast = pacesToast top-right; ไม่มี react-toastify ใน (paces)
- [ ] ไม่มี Vuexy bleed; title ไม่ซ้ำ suffix (`... | Deep ผู้ขาย` ครั้งเดียว)

## ยังไม่ได้เทส (carry)
- [ ] **Visual mobile QA (Chrome DevTools MCP)** — รอ MCP reconnect (รอบนี้ MCP หลุด → ทำ API E2E แทน)
- [ ] Facebook OAuth จริง (prod creds ยังไม่มี)
- [ ] reset→new-pass บน browser จริง (E2E API ผ่านแล้ว)

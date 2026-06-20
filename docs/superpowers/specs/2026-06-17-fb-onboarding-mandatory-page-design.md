# FB Onboarding — Mandatory Dedicated Page — Design Spec

> วันที่: 2026-06-17 · feature: seller onboarding redesign (FB-first, mandatory) · สถานะ: design (รอ review)

## Goal
FB user (และ user ที่ onboarding ยังไม่ครบ) ถูกบังคับไปหน้า **`/onboarding`** เต็มจอ
(หน้าตาต่อเนื่องกับ sign-up — AuthCardShell) เพื่อกรอก ข้อมูลร้าน + เบอร์ (OTP) + slug
ก่อนใช้งานระบบ. ไม่ครบ → ทุก login/refresh เด้งกลับมาเสมอ (ปิด/หนีไม่ได้).

## บริบทเดิม
- FB login: jwt callback สร้าง User (displayName=FB name, username=`user_${Date.now()}`, avatar=FB pic ใหญ่, no phone/shop) → `needsOnboarding = !shopSlug || !phone` → session ส่ง `avatar/displayName/username/email`
- OnboardingModal (modal บน /dashboard): steps phone/welcome/category/slug/product — ปิด/ข้ามได้บาง step → **จะถูกแทนด้วยหน้า /onboarding**
- layout fallback (`(dashboard)/layout.tsx` + `(fullscreen)/layout.tsx`): auto-create shop `ร้านของ {displayName}` ถ้ายังไม่มี → onboarding ต้อง **update** shop เดิม ไม่ create ซ้ำ
- มี API: `/api/users/check-phone`, `/api/shops/check-slug`, username availability (signup), `signIn('phone-otp')`

## Flow (หน้า /onboarding — multi-step ในหน้าเดียว)
```
Step 1 — ข้อมูลร้าน (form แนวตั้ง, AuthCardShell)
  [avatar FB กลางบน + "เข้าสู่ระบบด้วย Facebook"]
  • ชื่อที่แสดง (=ชื่อร้าน) — prefill FB name, แก้ได้  *required
  • หมวดหมู่ร้านค้า — ChoiceSelect  *required
  • ชื่อผู้ใช้ (username) — prefill FB-derived, แก้ได้ + เช็คซ้ำ realtime  *required
  • เบอร์โทร — input + เช็คซ้ำ (check-phone)  *required
  → [ถัดไป]  (validate ครบ + username available + phone ไม่ซ้ำ)

Step 2 — ⚠️ Warning เบอร์โทร (ชัด, สี warning/danger)
  "เบอร์นี้ตั้งได้ครั้งเดียว เปลี่ยนไม่ได้ — มีผลต่อความน่าเชื่อถือ ตรวจสอบให้ดี"
  แสดงเบอร์ที่กรอก + [แก้ไข (กลับ step 1)] / [ยืนยัน ส่ง OTP]

Step 3 — OTP (6 หลัก, เหมือน sign-up; reuse signIn('phone-otp'))
  สำเร็จ → บันทึก displayName/category/username/phone (+ shop update) → ไป step 4

Step 4 — ตั้ง URL ร้าน (slug)  *required (มี availability check)

Step 5 — สินค้าแรก (optional, ข้ามได้)
  เสร็จ → updateSession() → needsOnboarding=false → /dashboard
```

## Architecture

### 1. หน้า `/onboarding` (route ใหม่)
- `src/app/(paces)/seller/onboarding/page.tsx` (+ `components/`) — client, AuthCardShell wrapper (รูปขวา/form ซ้าย)
- multi-step ด้วย useState (เหมือน OnboardingModal เดิม) — ย้าย logic จาก OnboardingModal มา reuse
- prefill จาก `useSession()`: avatar, displayName, username, email
- avatar กลาง form: `<img src={avatar} className="size-16 rounded-full">` (ไม่ใช่ next/image — เลี่ยง config; graph.facebook.com แล้ว) + ป้าย "เข้าสู่ระบบด้วย Facebook" + icon FB

### 2. Force enforcement (proxy.ts)
- เพิ่ม `needsOnboarding` ลง **JWT token** (jwt callback) เพื่อให้ proxy อ่านได้ที่ edge (ไม่ต้อง query DB ทุก request)
- proxy seller subdomain: ถ้า `isAuthed && token.needsOnboarding && pathname !== '/onboarding'` (ยกเว้น `/api/*`, `/auth/*`) → redirect `/onboarding`
- หน้า `/onboarding`: ถ้า `!needsOnboarding` → redirect `/dashboard` (กันเข้าซ้ำหลังเสร็จ)
- onboarding เสร็จ → `updateSession()` → jwt refresh → token.needsOnboarding=false → proxy ปล่อยเข้า dashboard
- ลบ OnboardingModal ออกจาก `/dashboard` (แทนด้วยหน้า /onboarding)

### 3. jwt callback (auth.ts)
- เพิ่ม `token.needsOnboarding` (compute จาก shopSlug + phone เหมือน session callback) — refresh ตอน `trigger==='update'`
- FB username เริ่มต้น: เปลี่ยนจาก `user_${Date.now()}` → **`fb${facebookId}`** (เช่น `fb1220...`) — unique, derive ได้, user แก้ใน step 1 (prefill + เช็คซ้ำ). หมายเหตุ: FB Graph API ไม่คืน vanity username แล้ว (deprecated) → ใช้ fb-id เป็น default
- **(Q2 confirmed)** username แก้ได้อิสระตอน onboarding; การแก้ **ภายหลัง** จะมี **cooldown 30 วัน** (feature แยก — out of scope)

### 4. Phone immutable (business rule)
- **server guard**: route ที่ตั้ง/แก้ phone — ถ้า User.phone มีค่าแล้ว → reject (set once)
- onboarding บันทึก phone ผ่าน phone-otp (เหมือนเดิม) — ครั้งแรกเท่านั้น
- **settings**: ล็อค field เบอร์ (read-only + ป้าย "เปลี่ยนไม่ได้") — ตรวจ `settings/profile` page ว่ามี phone edit ไหม → ปิด

### 5. บันทึกข้อมูล step 1
- displayName → User.displayName + Shop.shopName (update shop เดิมที่ layout สร้าง — ไม่ create ซ้ำ)
- category → Shop.category · username → User.username (เช็คซ้ำก่อน) · phone → ผ่าน OTP
- reuse `/api/shops/slug` (มี category param แล้ว) + เพิ่ม/ปรับ API บันทึก displayName/username/shopName

## Edge cases
- user signup ปกติ (มี phone/username/category แล้ว แต่ยังไม่มี slug): /onboarding ข้าม step 1-3 → เริ่ม slug (หรือ step 1 prefill ครบ + phone ล็อค). **decision:** ถ้า `!needsPhoneVerify` (มีเบอร์แล้ว) → ข้าม step 1-3 ไป slug เลย
- กด back ที่ browser ระหว่าง onboarding → proxy เด้งกลับ /onboarding (บังคับ)
- เปิด /onboarding ทั้งที่ onboarding ครบแล้ว → redirect /dashboard
- FB cancel/avatar โหลดไม่ได้ → fallback avatar placeholder (initial ชื่อ)

## Out of scope (feature อนาคต)
- **ระบบแก้ username แบบ cooldown 30 วัน** (Q2 — แก้ตอน onboarding ได้อิสระ; แก้ภายหลังค่อยทำ rate-limit 30 วัน)
- เปลี่ยนเบอร์ภายหลัง — **immutable by design** (Q3 confirmed: ตั้งครั้งเดียว เปลี่ยนไม่ได้)
- buyer onboarding (เฉพาะ seller subdomain)
- onboarding ของ admin

## Testing
- FB login ใหม่ → /onboarding (step 1 prefill avatar+ชื่อ FB) → กรอก → warning → OTP → slug → dashboard
- ไม่ทำให้ครบ → refresh → เด้ง /onboarding เสมอ
- พยายามเข้า /orders ระหว่าง incomplete → เด้ง /onboarding
- phone immutable: ลองตั้งเบอร์ซ้ำ/แก้ใน settings → reject
- เทส FB เต็ม flow บน prod (deepth.local ใช้ FB ไม่ได้); หน้า/step logic เทส local ได้ด้วย OTP

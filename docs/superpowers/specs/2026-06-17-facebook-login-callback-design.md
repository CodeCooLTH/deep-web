# Facebook Login + Callback Loading Page — Design Spec

> วันที่: 2026-06-17 · สถานะ: design (รอ user review) · feature: seller Facebook login

## Goal
ให้ seller login/สมัครด้วย Facebook (consumer OAuth) แล้วเด้งผ่านหน้า loading
`/auth/callback/facebook` (มี Paces spinner ให้รอ ~1-3s) ก่อนเข้า `/dashboard`
ซึ่งจะเจอ OnboardingModal (FB user ใหม่ยังไม่มีเบอร์/slug → `needsOnboarding=true`)

## บริบทของเดิม (มีอยู่แล้ว — ไม่ต้องสร้างใหม่)
- `FacebookProvider` ใน `src/lib/auth.ts:20` (อ่าน env `FACEBOOK_ID` + `FACEBOOK_SECRET`)
- ปุ่ม "ด้วย Facebook" ใน `SignInForm.tsx` + `SignUpForm.tsx` → `signIn('facebook', { callbackUrl: '/dashboard' })`
- jwt callback (`auth.ts:298-336`): FB account → หา/สร้าง User + FACEBOOK authAccount (username `user_${Date.now()}`, no phone/shop), linkBuyerHistory by email, badge eval
- session callback (`auth.ts:338-363`): `needsPhoneVerify = !user.phone`, `needsOnboarding = !shopSlug || needsPhoneVerify`
- redirect callback (`auth.ts:285-292`): relative URL ผ่านตรง (รองรับ `/auth/callback/facebook`)
- `/api/auth/callback/facebook` = NextAuth OAuth handler (อัตโนมัติ, จัดการ token เอง)

## Flow
```
[ปุ่ม Facebook] signIn('facebook', { callbackUrl: '/auth/callback/facebook' })
  → FB OAuth dialog (ผู้ใช้อนุญาต)
  → /api/auth/callback/facebook  (NextAuth: token + jwt สร้าง user + set session cookie)
  → redirect ไป callbackUrl = /auth/callback/facebook  ← หน้า loading (ใหม่)
  → [Paces spinner ~1.5s, รอ session authenticated] → router.replace('/dashboard')
  → /dashboard → OnboardingModal เด้ง (needsOnboarding)
```

## Components

### 1. หน้า loading `/auth/callback/facebook/page.tsx` (ใหม่)
- Client component (`'use client'`), full-screen center บนพื้น `bg-default-100`
- **Paces spinner** — Base: `theme/paces/Admin/TS/src/app/(admin)/ui/spinners/` (copy markup spinner มาปรับ) + ข้อความ "กำลังเข้าสู่ระบบ..." (text-default-600) ใต้ spinner
- **กลไก redirect (session-aware):** `useSession()`
  - `status === 'authenticated'` → รอครบ min ~1500ms (จับเวลา mount) แล้ว `router.replace('/dashboard')`
  - `status === 'unauthenticated'` หรือ timeout 8s → `router.replace('/auth/sign-in')` + `pacesToast.error('เข้าสู่ระบบด้วย Facebook ไม่สำเร็จ')`
  - `status === 'loading'` → แสดง spinner ต่อ
- ไม่มี layout chrome (sidebar/header) — หน้า auth standalone

### 2. เปลี่ยน callbackUrl 2 ปุ่ม (แก้)
- `SignInForm.tsx` + `SignUpForm.tsx`: `signIn('facebook', { callbackUrl: '/auth/callback/facebook' })`

### 3. proxy.ts — ให้หน้า callback เป็น public
- ตรวจ `src/proxy.ts`: path `/auth/*` ต้องไม่ถูก block ก่อน login (เหมือน sign-in). ถ้า logic เดิม allow `/auth/**` อยู่แล้ว = ไม่ต้องแก้; ถ้าไม่ → เพิ่ม `/auth/callback/facebook` ใน allowlist

### 4. Profile image (avatar) — enhance ขนาดรูป
- avatar ถูกเก็บอยู่แล้ว: `auth.ts:314` `avatar: user?.image` (ตอนสร้าง FB user) + session ส่ง `avatar` ออก
- **ปัญหา:** default FB `picture` เล็ก ~50px → enhance `FacebookProvider` ให้ขอรูปใหญ่:
  ```ts
  FacebookProvider({
    clientId: process.env.FACEBOOK_ID || "",
    clientSecret: process.env.FACEBOOK_SECRET || "",
    userinfo: {
      url: "https://graph.facebook.com/me",
      params: { fields: "id,name,email,picture.type(large)" }, // ~200px แทน 50px
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name,
        email: profile.email ?? null,
        image: profile.picture?.data?.url ?? null,
      };
    },
  })
  ```
- **decision:** เซ็ต avatar ตอนสร้าง user (signup) เท่านั้น — ไม่ refresh ทุก login (เลี่ยง DB write ทุกครั้ง; user แก้รูปเองได้ใน settings ภายหลัง)

### 5. Env vars (user ตั้ง — นอกโค้ด)
- `FACEBOOK_ID`, `FACEBOOK_SECRET` ใน `.env.local` (dev) + Vercel prod (Production)

## FB App config (user ทำใน console — แอป consumer-login ใหม่)
- Product "Facebook Login" (consumer / Authenticate users — ไม่ใช่ for Business)
- Valid OAuth Redirect URIs: `https://seller.deepthailand.app/api/auth/callback/facebook`
- App Domains: `deepthailand.app`
- Development mode → เพิ่ม FB ตัวเองเป็น Tester/Admin; public ต้อง Live + App Review `email`

## Edge cases
- **FB user เคย onboard แล้ว** (มี slug+phone): loading → /dashboard ไม่มี modal ✓
- **ผู้ใช้ยกเลิกที่ FB**: NextAuth เด้ง error → หน้า loading เห็น unauthenticated → กลับ sign-in + toast
- **session ช้า**: spinner รอจน authenticated (ไม่ fixed timer เดียว) กัน race เข้า dashboard ก่อน session พร้อม
- **เปิด /auth/callback/facebook ตรง ๆ โดยไม่ผ่าน FB** (ไม่มี session): timeout → กลับ sign-in

## Out of scope (อนาคต)
- รับ chat message ผ่าน Messenger (ใช้แอป "Deep Thailand" + Login for Business + webhook + pages_messaging) — feature แยก
- App Review `email` permission เพื่อ public launch (ช่วงแรกเทสด้วย FB role)
- dev local FB testing (deepth.local ใช้กับ FB ไม่ได้ → เทสจริงบน prod / ngrok)

## Testing
- เทสจริง = login FB บน prod ด้วยบัญชีที่เป็น Tester/Admin ของแอป (deepth.local เทส FB ไม่ได้)
- เช็ค: ปุ่ม FB → dialog → loading spinner → /dashboard → onboarding (phone verify step สำหรับ FB user)
- เคส cancel: กดยกเลิกที่ FB → กลับ sign-in + toast

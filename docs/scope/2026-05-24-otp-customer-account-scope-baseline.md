# Scope Baseline — OTP Customer Account at Order View

สถานะ: ACTIVE
อ้างอิง PRD: FR-1.2, FR-6.3, FR-6.8, FR-8.1, FR-8.2, FR-8.3, NFR-2.6, NFR-3.2, NFR-3.3, NFR-5.4
spec: `docs/superpowers/specs/2026-05-24-otp-customer-account-design.md`

---

## Goal

เปลี่ยน flow ปลดล็อก `/o/[token]` จาก phone-match (knowledge-only) เป็น OTP → สร้าง/login customer account อัตโนมัติ — phone-entry path บังคับ OTP เสมอ, SMS-path เสนอ account แบบ opt-in — โดย reuse OTP lib, NextAuth phone-otp provider, และ `linkBuyerHistory` ที่มีอยู่แล้วทั้งหมด โดยไม่เปลี่ยน schema.

---

## In-Scope

> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | `POST /api/otp/send` — เพิ่ม `isNewUser: boolean` ใน response | curl เบอร์ใหม่ → `{isNewUser:true}`; เบอร์มี account → `{isNewUser:false}`; rate-limit 429 ไม่คืน isNewUser | TODO |
| S-2 | `GET /api/orders/[token]/buyer-phone` (ใหม่) — คืน `{phone:"08x-xxx-xxxx"}` (masked) เมื่อ SMS-unlock HMAC cookie ของ token valid; อื่น = 401/403 | cookie ถูก → 200 masked; ไม่มี cookie → 401; cookie token อื่น → 403 | TODO |
| S-3 | `PhoneUnlock.tsx` step 1: phone input (คง MobileFrame V1) → submit → `POST /api/otp/send` → รับ isNewUser → ไป step 2 | กรอกเบอร์ถูก → เห็น step OTP (ไม่ redirect); ผิดรูปแบบ → error inline; 429 → error inline | TODO |
| S-4 | `PhoneUnlock.tsx` step 2: OTP 6 หลัก + ช่อง "ชื่อ" เฉพาะ `isNewUser`; resend + countdown 60s; ครบ → `signIn('phone-otp',{phone,otp,mode,displayName?})` | new: เห็น OTP+ชื่อ(required); returning: OTP อย่างเดียว; resend หลัง countdown; OTP ผิด/หมดอายุ → error ไทย | TODO |
| S-5 | `PhoneUnlock.tsx` หลัง signIn สำเร็จ → session ออก → order detail โผล่ (callback/refresh ให้ RSC re-eval) | OTP ถูก+signIn → order detail โผล่ไม่ต้องกรอกเบอร์อีก; session cookie บน buyer subdomain | TODO |
| S-6 | `page.tsx` (RSC) session-aware authz: (a) ไม่มี session+ไม่มี SMS cookie → PhoneUnlock OTP; (b) session+phone===buyerContact → ข้าม lock; (c) session+phone≠ → block UI generic; (d) SMS cookie → SMS path เดิม | curl + session เบอร์ตรง → detail ไม่มี lock; เบอร์ไม่ตรง → block (generic, ไม่ redirect, ไม่ยืนยัน order มีจริง); buyerContact=null+PENDING → ผ่าน | TODO |
| S-7 | `PublicOrderClient.tsx` session-gating: prop `sessionPhone?`/`blockedByMismatch?`; block card แทน detail/lock เมื่อ mismatch; session+ตรง → detail ตรง | login เบอร์ตรง → order ทันที; ไม่ตรง → block card + ปุ่ม "ออกจากระบบ/ใช้เบอร์อื่น" | TODO |
| S-8 | SMS-path account prompt — initialUnlocked(SMS)+ไม่มี session → การ์ด "ยืนยันบัญชีเพื่อบันทึกประวัติ" (opt-in) → กด → `GET buyer-phone` → pre-fill OTP step → reuse S-4/S-5 | SMS buyer → order + prompt; ไม่กด → ดู/confirm guest ได้; กด → buyer-phone → OTP → account | TODO |
| S-9 | Returning-login skip — session+เบอร์ตรง ไม่เห็น PhoneUnlock (S-6 RSC + S-7 client) | login เบอร์ตรง → `/o/[token]` → detail ทันที; ไม่มี call `/api/otp/send` | TODO |
| S-10 | Claim history wiring — `signIn('phone-otp')` → provider เดิม run `linkBuyerHistory` (ไม่แก้ provider) → order เก่า buyerContact ตรง ถูก claim | new-phone signup → `Order.buyerUserId` ของ order เดิม = userId ใหม่ (DB) | TODO |
| S-11 | Vitest — pure helpers แยกทดสอบ: (a) phone-mask `08x-xxx-xxxx`; (b) isNewUser response type-guard | `vitest run` 0 fail; ครอบ masked ถูก/ผิด + isNewUser boolean | TODO |
| S-12 | tsc 0 — strict ผ่านทุกไฟล์ที่แก้ | `tsc --noEmit` exit 0 | TODO |

---

## Out-of-Scope

| ID | รายการ | เหตุผล |
|----|--------|--------|
| OOS-1 | seller/admin auth (`(paces)/**`) | ไม่เกี่ยว buyer flow; subdomain isolation |
| OOS-2 | password / email OTP login | FR-1.6 ตัดถาวร; ไม่อยู่ spec |
| OOS-3 | profile fields นอก displayName (avatar/bio/address ที่หน้า order) | spec Q2 ชื่อเดียว; อื่นใน settings Phase 2 |
| OOS-4 | email path (FB email match) ใน order flow | spec §8; FR-8.4 known limitation |
| OOS-5 | migrate/ลบ guest sessionStorage `deep-o-unlock-*` | backward-compat; ลบ = regression |
| OOS-6 | แก้ DB schema/migration | spec §5 ไม่เปลี่ยน schema |
| OOS-7 | แก้ `otp.ts` / `/api/otp/verify` / phone-otp provider ภายใน | spec Q3/Q4 reuse ไม่แตะ |
| OOS-8 | แก้ sms-code.service นอกเหนือ buyer-phone endpoint | spec §8; ฝั่ง seller |
| OOS-9 | Redis OTP store | Known Gap #12 Phase 2 |
| OOS-10 | general rate-limit + CSRF เต็มรูป | Known Gap #11 Phase 2 |
| OOS-11 | buyer settings/profile edit page | เส้นทางแยก |

---

## Assumptions

- OTP lib + `/api/otp/send`+`/verify` + phone-otp provider + `linkBuyerHistory` reuse โดยไม่แก้ logic ภายใน — เพิ่มแค่ `isNewUser` ใน `/api/otp/send` response
- ไม่มี migration — `User.phone` unique, `displayName`, `username` auto-gen, `VerificationRecord PHONE_OTP L1` มีอยู่แล้ว
- session บน buyer (main) subdomain เท่านั้น (proxy + host-scoped cookie)
- OTP rate-limit 3/10น + attempts 3 = config เดิม ไม่เปลี่ยน
- UI = Vuexy MUI v9 + Anuphan + mobile-first; คง MobileFrame + V1 layout ที่ approve แล้ว
- `isNewUser` = low-risk phone-existence oracle gated โดย OTP rate-limit — verdict สุดท้าย = safepay-security (mandatory)
- mask format `08x-xxx-xxxx`; ปรับได้ถ้า security สั่ง
- `buyerContact=null` + `PENDING` → ผ่าน authz (pre-claim); claim ตอน confirm

---

## Acceptance (phase-level)

1. tsc 0 (`tsc --noEmit`)
2. New-phone full path → User+L1 verification+`Order.buyerUserId` claim
3. Returning-login → signin → order (ไม่ขอชื่อ)
4. Mismatch block (generic, ไม่ leak)
5. SMS-path prompt → buyer-phone → OTP → account
6. Returning session skip (ไม่มี lock, ไม่ call otp/send)
7. OTP error cases (429 / ผิด / หมดอายุ) → error ไทย ไม่ crash
8. safepay-security review pass (oracle S-1, buyer-phone gate S-2, order-match authz post-session S-6)
9. Vitest pass (S-11)

---

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-05-24 | baseline สร้าง | Gate 0 — spec approved | - |

# OTP Customer Account at Order View — Design Spec

> **วันที่:** 2026-05-24 · **สถานะ:** design approved (brainstorm) → รอ implementation plan
> **ขอบเขต:** เปลี่ยน flow ปลดล็อก `/o/[token]` จาก phone-match เป็น **OTP → สร้าง customer account อัตโนมัติ**; ครั้งแรกกรอกชื่อ + ผูกเบอร์เป็นเจ้าของ account
> **Theme:** buyer = Vuexy (MUI) · mobile-first · Anuphan

---

## 1. Goal

ยกระดับการปลดล็อกหน้า order จาก "รู้เบอร์" (knowledge, อ่อน) เป็น "พิสูจน์ความเป็นเจ้าของเบอร์ด้วย OTP" และเปลี่ยน buyer ให้เป็น **logged-in customer** ทันที — ครั้งแรกกรอกชื่อ, เบอร์ถูกผูกเป็น identity ของ account (`User.phone` unique). ออเดอร์ guest เดิมของเบอร์นั้นถูก claim อัตโนมัติ (`linkBuyerHistory`).

## 2. Decisions (จาก brainstorm)

| # | คำถาม | คำตอบ |
|---|-------|-------|
| Q1 | OTP แทน phone-match? | **แทนเลย** — OTP = ประตูดู order (phone-entry path) + สร้าง account เสมอ; ไม่มี anonymous guest view บน path นี้ |
| Q2 | first-time profile fields | **ชื่อ (displayName) อย่างเดียว** — username auto-gen, phone auto-bound |
| Q3 | SMS-unlock path | สร้าง account ด้วย — แต่ผ่าน OTP เร็วบนหน้า order (reuse OTP path) |
| Q4 | SMS-unlock account mechanism | **OTP เร็วบนหน้า order** (pre-fill เบอร์จาก SMS cookie); reuse path A |
| Q5 | SMS-unlock account บังคับ? | **Prompt (ไม่บังคับ)** — SMS buyer ยังดู/confirm แบบ guest (cookie) ได้; account เป็น opt-in |
| Q6 | login อยู่แล้ว + เบอร์ account ≠ buyerContact | **บล็อก** — "ออเดอร์นี้ไม่ผูกกับเบอร์คุณ" (ไม่ leak ว่า order มีจริง) |

## 3. Flows

### A. Phone-entry (แทน phone-match เดิม · OTP บังคับ)
1. Lock screen: กรอกเบอร์ → `POST /api/otp/send { contact }` (rate-limit เดิม 3/10น) → ตอบ `{ isNewUser: boolean }`
2. UI โชว์ช่อง OTP (+ ช่อง "ชื่อ" เฉพาะเมื่อ `isNewUser`)
3. `signIn('phone-otp', { phone, otp, mode: isNewUser ? 'signup' : 'signin', displayName? })` — provider เดิม (`lib/auth.ts`): `verifyOtp` (consume) → create/find `User` (ผูก phone, สร้าง L1 `PHONE_OTP` verification, `linkBuyerHistory(userId, phone)` claim ออเดอร์เก่า) → ออก JWT session บน buyer subdomain
4. order page (RSC `page.tsx`) มี session → **authz หลัง session:** โชว์ order เมื่อ `session.user.phone === order.buyerContact` **หรือ** (`order.status === 'PENDING'` && `buyerContact == null` → จะ claim ตอน confirm); ไม่ตรง → บล็อก "ออเดอร์นี้ไม่ผูกกับเบอร์ของคุณ"
5. confirm: `buyerUserId` มาจาก session (มีอยู่แล้วใน confirm route)

> **กัน oracle:** ไม่เช็ค order-match **ก่อน** ส่ง OTP — ส่ง OTP ตามเบอร์ที่กรอก (rate-limited), เช็ค match **หลัง** มี session (server-side ใน page.tsx)

### B. SMS-link (seller ส่ง · guest view + prompt account)
1. คลิก SMS link → `/api/o/sms/[code]` consume → HMAC cookie → redirect `/o/{uuid}` (flow เดิม)
2. order page: cookie-verified (`initialUnlocked`) ไม่มี session → **โชว์ order ได้ (guest)** + การ์ด prompt "ยืนยันบัญชีเพื่อบันทึกประวัติการซื้อ"
3. กด prompt → `GET /api/orders/[token]/buyer-phone` (server อ่าน `order.buyerContact` เมื่อ SMS cookie valid — เผยเบอร์ของตัวเอง, masked) → OTP send/verify/signIn (reuse path A ด้วยเบอร์ pre-fill) → account
4. ดู/confirm แบบ guest ต่อได้ถ้าไม่กด (account = opt-in)

### C. Login อยู่แล้ว
- session + `session.user.phone === order.buyerContact` → เข้า order เลย (ข้าม lock)
- session + เบอร์ ≠ → **บล็อก** (Q6) + ปุ่ม "ออกจากระบบ / ใช้เบอร์อื่น"

## 4. Components / changes

- **`PhoneUnlock.tsx`** — เปลี่ยนจาก single phone input เป็น multi-step: (1) phone → (2) OTP + ชื่อ(ถ้าใหม่). คง MobileFrame + V1 layout ที่เพิ่งทำ. resend OTP + countdown.
- **`PublicOrderClient.tsx` / `page.tsx`** — session-aware: ถ้ามี session+เบอร์ตรง → detail; ถ้า SMS cookie → detail + account prompt; ไม่งั้น → PhoneUnlock (OTP). authz เบอร์-ตรง-order ย้ายมา page.tsx (server).
- **`POST /api/otp/send`** — เพิ่มผลลัพธ์ `{ isNewUser }` (findByPhone). คง rate-limit/format เดิม.
- **`GET /api/orders/[token]/buyer-phone`** (ใหม่) — คืน `order.buyerContact` (masked) เมื่อ SMS-unlock cookie valid; สำหรับ SMS-path account prompt.
- **NextAuth phone-otp provider** — reuse ไม่แก้ (create user + linkBuyerHistory + L1 verification + session).
- **`linkBuyerHistory`** — reuse (auto-claim).

## 5. Data / schema
**ไม่เปลี่ยน schema.** `User.phone` unique (มีแล้ว), `displayName` (ชื่อ), username auto-gen, `VerificationRecord PHONE_OTP L1` (provider สร้างให้). ออเดอร์ผูกผ่าน `Order.buyerUserId` + `linkBuyerHistory`.

## 6. Security (→ safepay-security mandatory)
- order-match authz เช็ค**หลัง** session (กัน pre-OTP phone-match oracle)
- `/api/otp/send` คืน `isNewUser` = phone-existence oracle (low; gated โดย OTP rate-limit) — ให้ security ออก verdict
- SMS-path `buyer-phone` endpoint เผยเบอร์ตัวเอง — ต้อง gate ด้วย SMS-unlock cookie valid + mask
- session บน buyer (main) subdomain เท่านั้น (proxy/cookie แยก subdomain)
- OTP rate-limit (3/10น) + attempts (3) เดิม; ห้าม log otp/phone (RC-8)
- Q6 บล็อก: ข้อความ generic ไม่ยืนยันว่า order มีจริง

## 7. Testing
- E2E: new phone → send OTP → ชื่อ → signIn signup → order โชว์ + `buyerUserId` set + ออเดอร์เก่า claim
- returning phone → send OTP (isNewUser=false, ไม่ขอชื่อ) → signin → order
- order-match denial (เบอร์ ≠ buyerContact) → บล็อก
- SMS-path: link → guest view → prompt → OTP → account
- OTP rate-limit + wrong OTP + expired
- Vitest: phone format / isNewUser helper (pure ที่แยกได้)

## 8. Out of scope
- ไม่แตะ seller/admin auth · ไม่ทำ password login · profile แค่ชื่อ (เพิ่ม field อื่นใน settings ภายหลัง) · ไม่ทำ email path ที่นี่ · ไม่เปลี่ยน SMS-code service (seller→buyer) นอกจาก buyer-phone endpoint · ไม่ migrate guest sessionStorage เดิม

## 9. Workflow
≥3 tasks → **agent-team-phase**: Gate 0 scope baseline → safepay-planner → build (otp/send isNewUser · buyer-phone endpoint · PhoneUnlock OTP+name steps · page.tsx session gating · SMS prompt) → safepay-reviewer → **safepay-security** → QA (3-level, Chrome DevTools) → Gate 2 sign-off → retro. ไม่มี migration → ไม่ต้อง safepay-database.

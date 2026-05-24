# Retro — OTP Customer Account at Order View (2026-05-24)

> Phase: เปลี่ยน `/o/[token]` unlock จาก phone-match → OTP → สร้าง customer account (first-time ชื่อ + ผูกเบอร์)
> Workflow: agent-team-phase (Gate 0 → planner → 3 batches/7 tasks → reviewer → safepay-security → QA → Gate 1/2 → retro)
> ผลลัพธ์: **SIGNED-OFF** — S-1..S-12 DONE, OOS untouched, 10 commits, tsc 0, Vitest 12/12, security PASS, browser QA ผ่าน

---

## What went right (anchor)

1. **Reuse มหาศาล → ไม่แตะ schema/provider เลย** — phone-otp NextAuth provider (สร้าง User + `linkBuyerHistory` + L1 verification + session มีครบ), OTP lib, `/api/otp/send`+`verify`, VerifyOtpCard OTP-input pattern. feature ใหญ่แต่ build เร็วเพราะต่อยอดของเดิม. การ explore (reuse map) ก่อน brainstorm คุ้มมาก.
2. **Planner แก้ "session ไม่ carry phone" ได้สะอาด** — แทนที่จะแก้ provider (OOS) → resolve `user.phone` ด้วย `findUnique(session.user.id)` ใน page.tsx. ตรวจ session callback select ก่อน → ไม่เดา.
3. **safepay-security จับ 2 ของจริง** — RSC-flight PII leak + phone PII echo (ดู P1/P3) — ทั้งคู่ไม่ tsc/test จับได้ ต้อง security review. มี mandatory security gate คุ้ม.
4. **ต่อยอด lock screen V1 + MobileFrame ที่เพิ่งทำ** — OTP multi-step ใส่ในกรอบเดิม ไม่ทิ้งงาน UI ก่อนหน้า.
5. **Frozen contract + parallel batch** — Batch 1 (3 backend/RSC disjoint) parallel ได้จริง.

---

## Problems + root cause

### P1 — block mismatch ทำ client-side → order PII รั่วใน RSC flight
- **Evidence:** T3 ส่ง full `order` + `blockedByMismatch` ไป `PublicOrderClient` (client) แล้วตั้งใจให้ T5 render block card. แต่ **props ที่ส่งเข้า client component ถูก serialize ลง RSC flight (network payload) เสมอ ไม่ว่าจะ render หรือไม่** → mismatched logged-in user ได้ order detail (items/ยอด/payment/accessUrl) ใน flight + (ตอน T3) block UI ยังไม่ render ด้วยซ้ำ. safepay-security จับ (MUST-FIX 3a).
- **Root cause:** client-side hiding/blocking ≠ access control. การ "ไม่แสดง" ฝั่ง client ไม่ได้แปลว่า "ไม่ส่ง". เข้าใจผิดว่า block ที่ client พอ.
- **Fix:** `page.tsx` **early-return `<OrderAccessBlock/>` ก่อนสร้าง PublicOrderData** → ไม่มี order data เข้า flight เลย. block UI render ฝั่ง server.

### P2 — isNewUser lookup อยู่ก่อน rate-limit → oracle ไม่ถูก gate
- **Evidence:** `/api/otp/send` ทำ `findUnique(phone)` (isNewUser) ก่อน `consumeOtpRequestQuota` → reviewer+security ชี้: enumerate phone-existence ได้โดยไม่เสีย quota. (จริง ๆ 429 ไม่ return isNewUser แต่ DB query ยังวิ่งฟรี + ขัด spec "gated by rate-limit").
- **Root cause:** วาง existence check เร็วไป โดยไม่คิดว่ามันเป็น oracle ที่ต้องอยู่หลัง gate.
- **Fix:** ย้าย `findUnique` ไปหลัง `consumeOtpRequestQuota` (return oracle เฉพาะ path ที่ consume quota + ส่ง SMS จริง).

### P3 — phone PII echo ใน /api/otp/send response
- **Evidence:** response มี `contact` (raw phone) ทั้ง normal + test path. client ไม่ได้ใช้ (มี phone ใน state แล้ว). security MUST-FIX (DevTools/CDN log leak surface).
- **Root cause:** echo input กลับโดยไม่จำเป็น (pattern เดิม) — กลายเป็น leak เมื่อ client อ่าน response.
- **Fix:** ลบ `contact` ออกจาก response ทั้ง 2 path.

### P4 — planner split T4/T5 ไม่ได้คิด prop-contract coupling
- **Evidence:** T4 (PhoneUnlock) เปลี่ยน prop `onUnlock`→`onSignedIn` → ต้องแก้ `PublicOrderClient` พร้อมกัน ไม่งั้น tsc พัง. Controller bundle T4+T5 แทน split.
- **Root cause:** plan แยกตามไฟล์ แต่ 2 ไฟล์ผูกกันด้วย prop contract (caller↔callee). "คนละไฟล์" ไม่พอตัดสิน split ถ้า contract เปลี่ยนข้ามไฟล์.

---

## Conventions to adopt

1. **Server-side authz block ต้อง early-return component ที่ "ไม่มี protected data" ก่อนส่ง data ใด ๆ เข้า client component.** props ที่ส่งเข้า client component (`'use client'`) ถูก serialize ลง RSC flight (เห็นใน network) **เสมอ ไม่ว่าจะ render หรือไม่**. client-side hide/block ≠ access control. เมื่อ deny access → return server component ที่ไม่ pass data ที่ปกป้อง. (P1 — extends [[feedback_rsc_dal_authz]])
2. **Enumeration/existence oracle ต้องอยู่หลัง rate-limit gate เดียวกับ action** — return ค่า oracle เฉพาะบน path ที่ consume quota/throttled แล้ว ไม่ใช่ path ถูก ๆ ก่อน gate. (P2)
3. **อย่า echo PII ที่ client มีอยู่แล้ว** กลับใน API response (phone ใน otp/send) — ลด leak surface (DevTools/CDN/log). (P3)
4. **Split parallel task ตาม "contract" ไม่ใช่แค่ "ไฟล์"** — ถ้า 2 ไฟล์ผูกกันด้วย prop/callback contract ที่ task หนึ่งเปลี่ยน (caller↔callee) → bundle เป็น task เดียว แม้คนละไฟล์. (P4 — extends [[feedback-lock-contract-before-parallel]])

---

## Action items
1. ✅ promote #1 (RSC-flight block) → extend memory [[feedback_rsc_dal_authz]].
2. ✅ promote #4 (contract-not-file split) → extend [[feedback-lock-contract-before-parallel]].
3. 📋 #2/#3 (oracle-after-ratelimit, no-PII-echo) → บันทึกใน retro นี้ + พิจารณาเพิ่ม `docs/conventions/security-conventions.md` ภายหลัง.
4. ⏳ Phase 2 (accepted-risk/deferred): Redis OTP store (OOS-9), general rate-limit + CSRF (OOS-10), re-verify isNewUser oracle + buyer-phone reveal เมื่อมี Redis rate-limit.
5. 📋 carried (จาก phase ก่อน): Chrome-MCP visual QA pass ทั้ง order-detail/lock/OTP flow เมื่อ MCP กลับมา (รอบนี้ + 2 phase ก่อนใช้ user eyeball เพราะ MCP หลุดทั้ง session).

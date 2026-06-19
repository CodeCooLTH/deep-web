# QA Checklist — Feature 00001 Extension: LINE/IG OAuth + Account Linking

> **Feature:** 00001 - Login & Onboarding Extension
> **FR scope:** FR-LO-14 (LINE OAuth), FR-LO-15 (IG prepared/flag-off), FR-LO-16 (Account Linking)
> **วันที่สร้าง:** 2026-06-19
> **สถานะ:** Unit ผ่านหมด (19/19) | E2E รอ dev server | Manual-prod carry ระบุชัด
> **Specs:** `docs/20 - Features/00001 - Login & Onboarding/_extensions/2026-06-18-line-instagram-oauth-design.md`
> **BRD ACs:** `docs/20 - Features/00001 - Login & Onboarding/BRD.md` §FR-LO-14/15/16

---

## Pre-flight Setup

- [x] NEXTAUTH_SECRET ตั้งใน .env.local (unit test อ่าน process.env ได้)
- [ ] dev server ขึ้นที่ seller.deepth.local:4000 (Playwright E2E ต้องการ)
- [ ] LINE_CHANNEL_ID + LINE_CHANNEL_SECRET ใน .env.local (LINE OAuth จริง — prod เท่านั้น)
- [ ] `npx playwright install chromium` (ครั้งแรก)
- [ ] Prisma client up-to-date (`npx prisma generate`)

---

## A. Unit Tests — `src/lib/link-intent.ts` (vitest)

**ไฟล์:** `src/lib/link-intent.test.ts`
**รัน:** `npx vitest run src/lib/link-intent.test.ts` (ไม่ต้อง dev server)

### Round-trip

- [x] **UNIT-01** sign → verify คืน { userId, provider } ถูกต้อง — PASS (run 2026-06-19)
- [x] **UNIT-02** token format = `payloadB64.sigB64` (dot separator) — PASS
- [x] **UNIT-03** verify token ที่ถูกต้อง → non-null — PASS

### HMAC Tamper (AC-06)

- [x] **UNIT-04 [AC-06]** แก้ userId ใน payload → HMAC mismatch → null — PASS
- [x] **UNIT-05 [AC-06]** แก้ sig ตรงๆ (ความยาวต่าง) → timingSafeEqual block → null — PASS
- [x] **UNIT-06 [AC-06]** verify cross-secret: sig จาก token ≠ expected sig ของ secret อื่น — PASS (logic assertion)

### Expiry (AC-07)

- [x] **UNIT-07 [AC-07]** exp อยู่ในอดีต (100ms ago) → null — PASS
- [x] **UNIT-08 [AC-07]** exp ในอนาคต (5 นาที) → non-null — PASS
- [x] **UNIT-09 [AC-07]** exp = now - 1ms (boundary) → null — PASS

### Fail-closed (invalid input)

- [x] **UNIT-10** token ว่าง "" → null — PASS
- [x] **UNIT-11** token ไม่มี dot → null — PASS
- [x] **UNIT-12** token = "." เท่านั้น → null — PASS
- [x] **UNIT-13** payload ไม่ใช่ valid base64url JSON → null (parse error) — PASS
- [x] **UNIT-14** payload ขาด userId field → null — PASS
- [x] **UNIT-15** userId = "" (empty string) → null — PASS
- [x] **UNIT-16** provider = "" (empty string) → null — PASS
- [x] **UNIT-17** payload ขาด exp field → null (typeof !== number) — PASS

### Output Properties

- [x] **UNIT-18** userId + provider ใน token ตรงกับ input (FB, LINE, INSTAGRAM) — PASS
- [x] **UNIT-19** token 2 ตัวจาก userId เดียวกัน ทั้งคู่ verify ผ่าน (format ถูก) — PASS

---

## B. Playwright E2E — /register sanitize (FR-LO-14)

**ไฟล์:** `e2e/feature-00001-line-ig-account-linking.spec.ts`
**รัน:** `npm run e2e -- --grep "register"` (ต้อง dev server)

### Username Sanitize

- [ ] **E2E-01 [FR-LO-14-AC-06]** LINE username ยาว/ตัวพิมพ์ใหญ่ (lineU9d3995738c072255fdcedf985a88608c) → prefill = lowercase ≤30 ตัว + regex `^[a-z0-9_]*$` + prefix "line" คงอยู่
  - *steps:* seed LINE user → inject cookie → goto /register → assert input value
  - *expected:* value.toLowerCase() === value AND value.length ≤ 30 AND /^[a-z0-9_]*$/.test(value) AND value.startsWith('line')
- [ ] **E2E-02** username ที่ valid (a-z0-9_ 3-30 ตัว) → กด ถัดไป ไม่โดน toast "กรุณาตั้งชื่อผู้ใช้ที่ใช้ได้"
  - *steps:* seed fresh-fb → fill username 'validusr' + phone 0812345678 → ตรวจว่าปุ่ม ถัดไป มีอยู่

### Cancel Button

- [ ] **E2E-03** ปุ่ม "ยกเลิก" มีอยู่ใต้ปุ่ม ถัดไป ในหน้า /register
  - *expected:* getByRole('button', { name: 'ยกเลิก' }).toBeVisible()
- [ ] **E2E-04** กดปุ่ม "ยกเลิก" → Swal เด้ง title "ยกเลิกการสร้างบัญชี?" + ปุ่ม "ใช่ ยกเลิก" + "ไม่ใช่"
  - *steps:* กด cancel → รอ .swal2-container → assert title + buttons
- [ ] **E2E-04b** กด "ไม่ใช่" ใน Swal → dialog ปิด → ยังอยู่หน้า /register (ไม่ออก)

---

## C. Playwright E2E — /settings ConnectedAccountsClient (FR-LO-16-AC-11)

**รัน:** `npm run e2e -- --grep "settings"` (ต้อง dev server)

- [ ] **E2E-05 [FR-LO-16-AC-11]** seed user มี FACEBOOK AuthAccount → /settings → Facebook row = "เชื่อมแล้ว" + ปุ่ม "ยกเลิก" | LINE row = "ยังไม่เชื่อม" + ปุ่ม "เชื่อมต่อ"
- [ ] **E2E-06** seed user มีทั้ง FACEBOOK + LINE AuthAccount → /settings → ทั้งสองเป็น "เชื่อมแล้ว" (2 badge + 2 ปุ่มยกเลิก)
- [ ] **E2E-07** seed user ไม่มี AuthAccount ใดเลย (password-only) → /settings → ทั้ง FB + LINE เป็น "ยังไม่เชื่อม" (≥2 badge + ≥2 ปุ่มเชื่อมต่อ)

---

## D. Playwright E2E — IG flag-off (FR-LO-15-AC-01)

- [ ] **E2E-08 [FR-LO-15-AC-01]** NEXT_PUBLIC_ENABLE_IG_LOGIN ไม่ตั้ง → /settings → Instagram row ไม่อยู่ใน DOM (not attached) แต่ Facebook + LINE มีอยู่
  - *expected:* `locator('p', { hasText: 'Instagram' })` = not attached

---

## E. Playwright E2E — API Guard (FR-LO-16-AC-05)

- [ ] **E2E-09 [FR-LO-16-AC-05]** POST /api/account/link/start โดยไม่มี session → 401
  - *steps:* page.request.post โดยไม่ inject cookie → expect status 401

---

## F. Manual-prod Tests (automate ไม่ได้ — ระบุ carry)

> ทดสอบได้เฉพาะบน production (https://deepthailand.app) เพราะ OAuth provider ต้องการ HTTPS + registered callback URL

### FR-LO-14 LINE OAuth

- [ ] **MANUAL-01 [FR-LO-14-AC-01]** LINE login ใหม่ → redirect /auth/callback/line → spinner → /register (needsRegistration)
- [ ] **MANUAL-02 [FR-LO-14-AC-02]** LINE user ใหม่: User สร้าง (username=`line{id}`), AuthAccount(LINE), badge best-effort → needsRegistration=true → /register
- [ ] **MANUAL-03 [FR-LO-14-AC-03]** LINE user เดิม: login → match AuthAccount(LINE) → บัญชีเดิม + avatar refresh
- [ ] **MANUAL-04 [FR-LO-14-AC-08]** LINE OAuth ล้มเหลว/ยกเลิก → redirect กลับ sign-in + error message — ไม่ crash ไม่สร้าง orphan User
- [ ] **MANUAL-05 [FR-LO-14-AC-09]** race condition: LINE login ซ้ำซ้อน → สร้าง User/AuthAccount เพียง 1 record (unique constraint)
- [ ] **MANUAL-06 [FR-LO-14-AC-10]** LINE เปลี่ยนรูป → login ครั้งถัดไป → User.avatar refresh

### FR-LO-14 LINE pre-tick (BR-19) — DEFERRED Phase 2

- [ ] **MANUAL-07 [FR-LO-14-AC-07]** LINE login session → Onboarding step 1 → "LINE" channel ถูก pre-tick อัตโนมัติ
  - *หมายเหตุ:* BR-19 DEFERRED Phase 2 (ดู design doc §3 Frozen Contract)

### FR-LO-16 Account Linking (Connect/Disconnect — OAuth จริง)

- [ ] **MANUAL-08 [FR-LO-16-AC-01]** Settings → Connect LINE (ยังว่าง) → link/start cookie → signIn(LINE) → AuthAccount ผูก user เดิม → Settings แสดง LINE = เชื่อมแล้ว (session ยังเป็นบัญชีเดิม)
- [ ] **MANUAL-09 [FR-LO-16-AC-02]** เชื่อม LINE สำเร็จ → logout → login ด้วย LINE → เข้าบัญชีเดิม (ไม่สร้างใหม่)
- [ ] **MANUAL-10 [FR-LO-16-AC-03]** Connect LINE ที่ AuthAccount ผูกกับ user อื่นแล้ว → block + error "บัญชีนี้ถูกใช้กับบัญชีอื่นแล้ว" (session ไม่สลับ)
- [ ] **MANUAL-11 [FR-LO-16-AC-04]** Connect provider ที่ผูกตัวเองอยู่แล้ว → idempotent ไม่สร้างซ้ำ ไม่ error
- [ ] **MANUAL-12 [FR-LO-16-AC-08]** Disconnect LINE → Swal confirm → ส่ง OTP → กรอก OTP ถูก → AuthAccount(LINE) ลบ → LINE = ยังไม่เชื่อม
- [ ] **MANUAL-13 [FR-LO-16-AC-09]** Disconnect method สุดท้าย (ไม่มี password, provider อื่น) → block + แจ้ง "ต้องเหลือวิธีเข้าสู่ระบบอย่างน้อย 1 ทาง"
- [ ] **MANUAL-14 [FR-LO-16-AC-10]** ยิง POST /api/account/link/remove ด้วย session A แต่ target AuthAccount ของ user B → ลบไม่ได้ (scope ownership)

### FR-LO-15 Instagram (staging เท่านั้น เมื่อ Meta Verification ผ่าน)

- [ ] **MANUAL-15 [FR-LO-15-AC-03]** NEXT_PUBLIC_ENABLE_IG_LOGIN=true → ปุ่ม Instagram render ใน sign-in (3 ที่)
- [ ] **MANUAL-16 [FR-LO-15-AC-04]** IG user ใหม่ + flag ON → User(username=`ig{id}`), AuthAccount(INSTAGRAM) → needsRegistration gating
- [ ] **MANUAL-17 [FR-LO-15-AC-05]** IG user เดิม + flag ON → match AuthAccount(INSTAGRAM) → login บัญชีเดิม
- [ ] **MANUAL-18 [FR-LO-15-AC-06]** IG login + Onboarding step 1 → ไม่ pre-tick channel ใดๆ (IG ไม่มี pre-fill rule)
- [ ] **MANUAL-19 [FR-LO-15-AC-07]** AuthAccount.provider = "INSTAGRAM", username prefix = "ig", callback = /auth/callback/instagram

---

## ยังไม่ได้เทส (carry) / Blocked

| Item | เหตุผล | ทำเมื่อไร |
|------|--------|----------|
| E2E-01..09 (Playwright) | dev server ไม่รัน (HTTP 000) ตอน QA run | เมื่อ user รัน server → `npm run e2e -- --grep "feature-00001"` |
| MANUAL-01..19 | OAuth provider ต้องการ HTTPS + registered callback → prod เท่านั้น | หลัง LINE Channel ลงทะเบียน callback URL ใน LINE Developers Console |
| BR-19 LINE pre-tick | DEFERRED Phase 2 (design doc freeze) | Phase 2 |
| FR-LO-15 IG full test | ต้อง Meta Business Verification ผ่าน + NEXT_PUBLIC_ENABLE_IG_LOGIN=true | หลัง Meta App Review |

---

## Summary Run 2026-06-19

| Group | Total | PASS | FAIL | SKIP/CARRY |
|-------|-------|------|------|------------|
| Unit (vitest) | 19 | **19** | 0 | 0 |
| E2E Playwright | 9 | 0 (server down) | 0 | **9** |
| Manual-prod | 19 | 0 | 0 | **19** |
| **รวม** | **47** | **19** | **0** | **28** |

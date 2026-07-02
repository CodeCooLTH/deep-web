# Scope Baseline — Buyer Password Auth

สถานะ: DRAFT
อ้างอิง PRD: FR-1 (Authentication & Session, `docs/PRD.md` บรรทัด 90-94), User Story U-1 (`docs/PRD.md` บรรทัด 47)
อ้างอิง spec: `docs/superpowers/specs/2026-07-02-buyer-password-auth-design.md`
อ้างอิง plan: `docs/superpowers/plans/2026-07-02-buyer-password-auth.md` (8 tasks)

## Goal
ยกระดับ auth ฝั่ง buyer (`(marketing)/**`, Vuexy) ให้เข้าสู่ระบบด้วย **username+password** ได้ (เพิ่มเติมจาก Facebook/Phone OTP เดิม) พร้อมฟลว์ลืมรหัสผ่าน (reset/new-pass) และปุ่ม social/OAuth callback ที่มี UX เทียบเท่า seller — โดย**ไม่แตะ schema/DB** และคง OTP login เดิมไว้ควบคู่กันในหน้าเดียว

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-BA-1 | Backend: provider `buyer-credentials` (`src/lib/auth.ts`) — mirror `seller-credentials` ตัดเงื่อนไข `isShop`, กัน `isAdmin`, กัน `passwordHash==null`, rate-limit 5/10min ต่อ username, bcrypt-DoS guard (password.length>1000) | 1) login สำเร็จด้วย username+password ที่ตั้งไว้ผ่าน user ที่ไม่ใช่ admin และมี `passwordHash` 2) user ที่ `isAdmin=true` login ด้วย provider นี้ไม่สำเร็จ (null) 3) user ที่ `passwordHash==null` login ไม่สำเร็จ (null) 4) รหัสผ่านผิด/username ไม่มี → null 5) ครบ 5 ครั้งผิดใน 10 นาที → ถูก rate-limit block | TODO |
| S-BA-2 | Backend: hoist password hashing ใน `phone-otp` authorize ให้ buyer signup (ไม่มี `shopName`) ตั้ง `passwordHash` ได้ โดย `isShop=false`; seller signup path เดิม (มี `shopName`) ยังคง `passwordHash` + สร้าง Shop + `isShop=true` เหมือนเดิม | 1) buyer signup ผ่าน phone-otp พร้อม password ที่ผ่าน `isStrongPassword` → user ใหม่มี `passwordHash` ตั้งไว้, `isShop=false`, ไม่มี Shop ถูกสร้าง 2) password ที่ส่งมาแต่ไม่ strong → authorize คืน null (ไม่สร้าง user) 3) seller signup (มี shopName+password) พฤติกรรมเดิมไม่เปลี่ยน (`passwordHash`+Shop+`isShop=true`) | TODO |
| S-BA-3 | Sign-in card: ฟอร์ม username+password (โหมด default) + toggle สลับไปฟอร์ม OTP เดิม (ในหน้าเดียว, card เดียว) | 1) เข้าหน้า `/auth/sign-in` เห็นฟอร์ม username+password เป็นค่าเริ่มต้น + ลิงก์ "ลืมรหัสผ่าน?" ชี้ `/auth/reset-pass` 2) กด toggle "เข้าสู่ระบบด้วยรหัส OTP แทน" → เห็นฟอร์มกรอกเบอร์ (logic OTP เดิมไม่เปลี่ยน) → กลับไปโหมด password ได้ 3) login ด้วย username+password ถูกต้อง → redirect ออกจาก `/auth` (`safeCallbackUrl`) 4) login ผิด (username/password) → error message เดียวรวม ("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง") ไม่บอกว่าอันไหนผิด | TODO |
| S-BA-4 | ปุ่ม social เต็มกว้างมี label ทั้งหน้า **sign-in และ sign-up** (Facebook/LINE + IG flag), สี brand (FB `text-facebook`, LINE `#06C755`, IG `#E1306C`); FB ชี้ `safeCallbackUrl`/`/` ตรง, LINE/IG ชี้ `/auth/callback/{provider}` | 1) หน้า sign-in **และ** sign-up เห็นปุ่ม "…ด้วย Facebook" และ "…ด้วย LINE" เต็มความกว้าง มี label ข้อความ (ไม่ใช่ icon-only) 2) ปุ่ม LINE ตั้ง `callbackUrl=/auth/callback/line`; ปุ่ม FB ตั้ง `callbackUrl` ตรง (ไม่ผ่านหน้า callback) 3) markup ยังเป็น MUI/Vuexy primitive (ไม่ใช่ Paces) | TODO |
| S-BA-5 | verify-otp card: ขยาย `mode` เป็น `'signin'\|'signup'\|'reset'`; `mode==='reset'` ไม่ consume OTP ที่นี่ (เก็บ `sessionStorage.resetDraft={phone,otp}` → push `/auth/new-pass`); `mode==='signup'` อ่าน `sessionStorage.signupDraft.password` ส่งเข้า `signIn('phone-otp', {...})` แล้ว clear draft | 1) เข้าถึงหน้าด้วย `?mode=reset&phone=...` กรอก OTP ถูก → ไม่มี call `signIn('phone-otp', ...)` เกิดขึ้น, `sessionStorage.resetDraft` ถูกตั้งค่า {phone, otp}, redirect ไป `/auth/new-pass` 2) signup flow: มี `signupDraft.password` ใน sessionStorage → หลัง OTP ถูก → user ที่สร้างมี `passwordHash` ตรงกับ password ที่กรอกตอน sign-up, `signupDraft` ถูกลบหลังสำเร็จ 3) signup ที่ `signupDraft` หายไป (เช่น refresh หน้า) → **ดำเนินการ signup ต่อโดยไม่มี password** (ไม่ redirect กลับ sign-up) — พฤติกรรมเดียวกับ seller VerifyOtpForm; user ตั้ง password ทีหลังผ่าน reset-flow ได้ **[Controller decision 2026-07-02 — resolved, ดู Change Log]** | TODO |
| S-BA-6 | หน้าใหม่ `reset-pass/page.tsx` + `ResetPassCard.tsx` — กรอกเบอร์ → `otp/send` → push `/auth/verify-otp?mode=reset&phone=` | 1) เข้าหน้า `/auth/reset-pass` กรอกเบอร์ที่ถูกต้อง → เรียก `otp/send` สำเร็จ → redirect ไป `/auth/verify-otp?mode=reset&phone=...` 2) `otp/send` คืน 429 → toast แจ้งเตือน ไม่ redirect 3) response ของ `otp/send` **ไม่บอก** ว่าเบอร์มี/ไม่มีในระบบ (ok เสมอเมื่อไม่ใช่ error) — ไม่ leak phone oracle | TODO |
| S-BA-7 | หน้าใหม่ `new-pass/page.tsx` + `NewPassCard.tsx` — อ่าน `resetDraft` จาก sessionStorage, submit `POST /api/account/set-password {phone,otp,password}` | 1) เข้าหน้า `/auth/new-pass` โดยไม่มี `resetDraft` ใน sessionStorage → redirect กลับ `/auth/reset-pass` ทันที 2) มี `resetDraft` ถูกต้อง + ตั้ง password ใหม่ผ่านเงื่อนไข strength → เรียก `set-password` สำเร็จ (200) → ล้าง `resetDraft`, toast สำเร็จ, redirect `/auth/sign-in` 3) response 400 → toast "รหัสผ่านไม่ผ่านเงื่อนไข"; 401 → toast OTP หมดอายุ + ล้าง draft + กลับ reset-pass; 404 → toast "ไม่พบบัญชี" | TODO |
| S-BA-8 | หน้าใหม่ `auth/callback/[provider]/page.tsx` — spinner รอ session (min-display 1500ms) → redirect `/`; error → toast + redirect `/auth/sign-in` | 1) LINE login สำเร็จ → ผ่านหน้า `/auth/callback/line` (เห็น spinner อย่างน้อย ~1.5s) → redirect `/` 2) session ล้มเหลว/ไม่ authenticated ที่หน้า callback → toast ข้อความเฉพาะ provider ("เข้าสู่ระบบด้วย LINE ไม่สำเร็จ...") + redirect `/auth/sign-in` | TODO |
| S-BA-9 | Playwright E2E `e2e/buyer-password-auth.spec.ts` (+ helper `loginAsBuyer` ถ้าจำเป็น) ครอบ: render password form + toggle, ปุ่ม social render, password login สำเร็จ, password login ผิด → error รวม, reset-pass → verify-otp(mode=reset), new-pass redirect กลับเมื่อไม่มี draft | รัน `npm run e2e -- buyer-password-auth` ผ่านทุก test (5 test ใน Task 8 Step 2 อย่างน้อย) บน `deepth.local:4000` จริง (ไม่ใช่ localhost) | TODO |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | admin password login (provider `admin-credentials`) — เปลี่ยน logic/behavior | มี provider แยกอยู่แล้ว, ไม่ใช่เป้าหมาย phase นี้ (design spec §1 Non-Goal) |
| OOS-2 | เปลี่ยน backend/config ของ OAuth provider `facebook`/`line`/`instagram` เอง (credential, scope, endpoint) | reuse ของเดิมที่ share ทุก subdomain อยู่แล้ว (design spec §1, §2) |
| OOS-3 | แก้ Prisma schema / migration ใหม่ (เช่น field password เพิ่มเติม, index ใหม่) | `User.passwordHash` มีอยู่แล้ว (seller ใช้ field เดียวกัน) — phase นี้ไม่แตะ DB (design spec §1) |
| OOS-4 | Email+password login สำหรับ buyer | PRD "ตัดถาวร" (`docs/PRD.md` บรรทัด 58) — buyer ยึด phone/username ไม่ใช่ email |
| OOS-5 | บังคับ legacy OTP-only user ตั้ง password (mandatory prompt/modal) | design spec §1 Non-Goal — ใช้ reset-flow ตั้งเองได้ตามใจ ไม่บังคับ |
| OOS-6 | แก้ logic ของ `seller-credentials` provider หรือ seller onboarding flow | phase นี้แตะเฉพาะ buyer path ใน `phone-otp`/provider ใหม่; seller path ต้องพฤติกรรมเดิม 100% (S-BA-2 acceptance ข้อ 3) |
| OOS-7 | Password strength-bar component ฝั่ง Vuexy (buyer sign-up/new-pass) | plan ระบุชัดใช้ `CustomTextField type='password'` ธรรมดา ไม่มี strength bar ในรอบนี้ (implementation plan note ท้าย Task 2) — ถ้าต้องการต้องยืนยันแยก |
| OOS-8 | Multi-provider account linking (ผูกหลาย provider ใน account เดียวหลัง signup) | PRD "ตัดถาวร" (บรรทัด 58) |
| OOS-9 | ย้าย rate-limit store จาก in-memory (`adminLoginTimestamps`) ไป Redis | Known Gap #12 ของ PRD ที่มีอยู่แล้ว (Phase 2), phase นี้แค่ reuse store เดิม ไม่แก้ underlying infra |

## Assumptions
- PRD `FR-1`/`U-1` ปัจจุบันเขียนว่า buyer = "Facebook หรือ Phone OTP (ไม่มี password)" — phase นี้เปลี่ยนข้อเท็จจริงนี้โดยตรง (เพิ่ม username+password ให้ buyer) ตาม context ที่ user ยืนยันแล้ว. คนละเรื่องกับ "ตัดถาวร email+password" (บรรทัด 58 ของ PRD ระบุ username+password ≠ email+password ที่ตัด) → **ต้อง sync PRD FR-1 + U-1 หลัง Sign-off** (safepay-docs/safepay-product ทำหลัง Gate 2)
- `buyer-credentials` provider อนุญาต user ที่ไม่ใช่ admin **ทุกคน** รวมถึง seller ที่มี `isShop=true` (เพราะบัญชีเดียวกันข้าม subdomain) — ไม่ได้ตรวจ `isShop` ตามที่ design spec §3.1 ระบุไว้ชัด
- OTP dev-test phone `0000000009`/`123456` (dev-only, memory `project_otp_signup_p2002_block_residue`) ใช้ในการ QA/E2E ของ phase นี้
- `/api/account/set-password` **ไม่ต้องแก้โค้ด** — เป็น provider-agnostic อยู่แล้ว, S-BA-7 แค่เรียกใช้
- Toast ฝั่ง buyer ใช้ `react-toastify` (ไม่ใช่ `pacesToast` — นั่นของ seller/admin เท่านั้น) ตาม Global Constraints ของ plan
- Base ทุกไฟล์ UI อ้างอิง Vuexy theme (`theme/vuexy/typescript-version/full-version/src/views/pages/auth/*`) ตาม Hard Rule 1/3; ก่อนแก้ UI ทุกไฟล์ต้องผ่าน `safepay-ux` gate ก่อน (Hard Rule 8) แม้ plan จะมี code ร่างไว้แล้วก็ตาม

## Edge Cases ที่อยู่ใน scope
- **legacy OTP-only user** (`passwordHash==null`): password login ผ่าน `buyer-credentials` → คืน null เสมอ → ผู้ใช้ยังใช้ OTP login เดิม หรือไปตั้งรหัสผ่านผ่าน reset-flow (S-BA-6/7) ได้ — ครอบใน S-BA-1 acceptance ข้อ 3
- **FB/LINE user ที่ยังไม่มี phone** (`needsRegistration`): reset-flow ใช้ไม่ได้ (ต้องมี phone+OTP) → ยัง login ผ่าน social ได้ตามเดิม (negative case, ไม่ implement UI แจ้งพิเศษในรอบนี้)
- **signupDraft หาย** (refresh/direct URL): ดำเนิน signup ต่อโดยไม่มี password (เหมือน seller) — ครอบใน S-BA-5 acceptance ข้อ 3
- **resetDraft หาย** (refresh/direct URL เข้าหน้า new-pass): redirect กลับ `/auth/reset-pass` ทันที — ครอบใน S-BA-7 acceptance ข้อ 1
- **username/phone ซ้ำตอน signup**: inline error ปกติ (pattern เดิม, ไม่ใช่ของใหม่ใน phase นี้)

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off
- บังคับ (mandatory) legacy user ตั้งรหัสผ่าน
- Password strength-bar UI component ฝั่ง Vuexy
- Redis-based rate-limit store (ย้ายจาก in-memory)
- PRD FR-1/U-1 doc-sync (ทำหลัง Gate 2 sign-off)

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-02 | baseline สร้าง | - | - |
| 2026-07-02 | **Decision #1:** signupDraft หาย → ยึด "proceed-without-password" (ตาม plan code) ไม่ redirect กลับ sign-up; แก้ design spec §7 ให้ตรง | ตรงกับพฤติกรรม seller VerifyOtpForm (หัวใจ "เหมือน seller"); user ตั้ง pw ทีหลังผ่าน reset ได้ | Controller |
| 2026-07-02 | **Decision #2:** ดึงปุ่ม social เต็มกว้างหน้า **sign-up** เข้า scope (รวมใน S-BA-4, เพิ่ม step ใน Task 2) — เดิมจะเป็น sign-in only | buyer sign-up มีปุ่ม social อยู่แล้ว (ต่างจาก seller); ถ้า sign-in เต็มกว้างแต่ sign-up icon เล็ก = ไม่ consistent | Controller |

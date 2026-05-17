# Spec — Paid SMS Order Link + Seller Wallet/Credit (MVP)

สถานะ: **Phase 2 Requirement เสร็จ + Controller decisions ล็อก. Phase 3 Design ถัดไป. BUILD ยัง defer** จน parallel stream (Anuphan/OMS uncommitted: prisma/seed.ts, lib/auth.ts, dashboard/verification) commit + git สะอาด.

PRD ref: S-8, B-2, FR-6.3, FR-6.8, FR-6.9, §8 (MVP scope), §10 (Free core + à la carte). Full FR/AC/edge = ผลงาน safepay-product (Phase 2) — doc นี้ = decisions + scope ที่ planner/security ใช้ออกแบบ.

## Goal
Seller ที่ verify **L2+** กดส่ง Order Link เข้า SMS buyer (paid ฿1/SMS) — link ฝัง short-code → buyer ข้าม phone-unlock อัตโนมัติ. + wallet credit ledger (top-up ผ่าน slip→admin-approve, deduct ฿1/SMS, balance, audit).
ขอบเขต MVP = credit ledger ง่าย + slip top-up moderation. **Phase 2 (นอก scope):** payment gateway, invoicing, Redis, general rate-limit/CSRF, dispute, URL shortener, SMS delivery webhook, token revoke-on-resend.

## Controller decisions (ล็อก 2026-05-16)
- **D1 SMS length → short-code path** `/o/{code}` (code สั้น ~8-10 ตัว แทน UUID+64hex ใน URL). server map `code → order + buyerPhone-bound`. คง ฿1/SMS 1-segment Unicode (≤70 ตัว). **security: code ต้อง entropy พอ (≥ ~64-bit, crypto RNG ไม่ใช่ Math.random/sequential), DB-backed single-use + expiry + hashed-at-rest**. (override product FR-SMS-3/OQ-8)
- **D2 Top-up = slip-moderation flow** (override product A-6/OQ-7 admin-credit-only):
  - seller backend: หน้า "ซื้อเครดิต SMS" → เลือก amount/แพ็กเกจ → สร้าง `TopUpRequest` (PENDING) → แนบ slip (ใช้ `/api/upload` เดิม เหมือน verification doc)
  - admin backend: คิว review TopUpRequest → approve → credit wallet + WalletTransaction(TOPUP) atomic / reject + เหตุผล (ภาษาไทย)
  - ไม่มี payment gateway (manual โอน+สลิป). reuse pattern upload+admin-review ที่มีอยู่ (verification L2/L3)
- **D3 Verification gate = L2+** (เอกสารบุคคล ปชช.+selfie ขึ้นไป) — enforce ที่ API ไม่ใช่แค่ UI (anti-smishing platform SMS reputation)
  > ⚠️ **REVERSED — Product decision 2026-05-17 (owner-confirmed):** D3/RC-5 L2 gate
  > **ถูกตัดออก** → credit-only (มีเครดิตก็ส่งได้). commit `3acbcbe`. anti-abuse
  > เหลือ: ฿1/SMS + OQ-5 20/ชม + RC-4 daily-cap 200/วัน + RC-1 + RC-6 (เบอร์จาก
  > order DAL-scoped ของ seller เอง ไม่ใช่เบอร์ใดก็ได้). **AR-L2-REMOVAL**
  > (security-verified, accepted): L1-auth seller + credit ส่ง SMS ไปเบอร์ที่
  > เขียนใน buyerContact ของ order ตัวเอง — bound ด้วย cost+rate+admin-approved
  > topup + traceable (wallet ledger audit). Phase-2 mitigation ถ้ามี spam
  > report: per-phone cross-shop daily limit. ดู retro 2026-05-17-sms-wallet.

## Remaining OQ — ใช้ default product spec (planner/security finalize, ไม่ต้องถาม user ซ้ำ; security tighten ได้)
- balance unit = ฿ integer (OQ-1)
- phone-bound code expiry = 72h (OQ-3) — security ปรับได้
- re-send = deduct ทุกครั้ง, code เก่าปล่อย expire เอง (OQ-4; revoke = Phase 2)
- per-seller SMS rate-limit = 20/ชม. in-memory globalThis singleton (OQ-5; กัน loop/abuse)
- code/token storage = DB table, hashed at rest, single-use (`usedAt`) enforce ใน `prisma.$transaction` (OQ-6)
- low-balance warning ≤ ฿10 (OQ-9)
- admin top-up review UI placement → planner เสนอ (OQ-10; น่าจะ section ใหม่ฝั่ง admin)

## Hard constraints (จาก spec + retro/conventions session นี้)
- credit deduct + SMS send + token issue + log = **atomic** (`prisma.$transaction`); SMS provider fail → **ไม่หักเครดิต** (rollback/compensate) — NFR-ATOM
- phone-bound code = limited-scope: grant แค่ skip-unlock บน order เดียว, ผูก buyerPhone+orderId, single-use, expiry, ไม่ใช่ session/ไม่ข้าม order. ถ้า order.buyerContact มีแล้ว+ไม่ตรง → reject (ไม่ override). NFR-SEC
- DAL ownership ที่ query WHERE (S-C7) — `findFirst({where:{publicToken/code, shopId}})` ไม่ fetch-แล้ว-check
- PII: ห้าม log raw phone/code; mask. (S-C1/S-C8)
- generic `sendSms(phone,text)` แยกจาก `sendOtpViaSms` (OTP-shaped); apitel sender omit→account default (retro 2026-05-16-real-sms-otp-apitel RC2); timeout 10s graceful
- context-shift review (internal→external paid): reviewer+security grep โค้ดเดิมนอก diff ที่ assumption เปลี่ยน (test-bypass/cost-skip) — retro C1
- safepay-security = mandatory (auth-relaxation token + credit/payment); must-fix ก่อน QA, ห้าม defer (S-C5)
- UI ตาม theme-copy (seller=Paces, admin=Paces) + Anuphan Hard Rule 5; nav explicit /seller/* /admin/*

## Phase 3 outcomes (Design + Security — 2026-05-16)
Technical Design (safepay-planner): 4 model + 22-task plan + theme map + batches → `docs/superpowers/plans/2026-05-16-sms-wallet-phase4-plan.md`.
safepay-security verdict = **DESIGN-MUST-CHANGE** — 8 REQUIRED-CHANGE ต้อง fold เข้า design ก่อน Phase 4 build (mandate-before-build S-C5):

- **RC-1** code-consume endpoint ต้องมี rate-limit (per-IP/per-order ~10 fail/15min, globalThis pattern เดียวกับ otpRequestTimestamps) — entropy พอเฉพาะถ้ามี throttle
- **RC-2** code-consume uniform error ทุก failure mode (not-found/expired/used/phone-mismatch/order-mismatch) — ข้อความเดียว ไม่มี timing variation (กัน enumeration oracle)
- **RC-3** DB `CHECK(balance >= 0)` บน SellerWallet + conditional-update `UPDATE ... WHERE balance >= 1` (ไม่ใช่ read-then-decrement) + `deliveryStatus` field บน SmsCode (PENDING/SENT/FAILED) ให้ reconcile crash ได้
- **RC-4** DB-layer daily SMS cap/shop (~200/day, นับ WalletTransaction DEDUCT วันนี้) — แยกจาก in-memory hourly burst (cost-exposure ceiling)
- **RC-5** L2 gate **ไม่มี test-account exception** — `getMaxVerificationLevel(shop.userId) >= 2` query จริง; dev ต้อง seed L2 record เอง (ห้าม `if(isTestAccount)skipGate` = ซ้ำรอย OTP-bypass + ตอนนี้มีเงินติด)
- **RC-6** order ที่ออก SmsCode แล้ว ต้องปิด free open-claim: set `order.buyerContact = buyerPhone` ใน deduct+issueCode transaction (กันคนอื่นเปิด UUID link เดิม unlock ด้วยเบอร์ใดก็ได้ตอน buyerContact ยัง null)
- **RC-7** self-approve block บน `/api/admin/topups/[id]/approve|reject` — `topUpRequest.shop.userId !== admin.id` (isAdmin+isShop coexist ได้ → admin-ที่มีร้าน top-up ฟรีได้; mirror verifications/[id]/route.ts:18)
- **RC-8** `SendSmsButton` **ห้ามรับ raw buyerContact เป็น prop**; send-sms route ดึง buyer phone server-side ผ่าน DAL (`getOrderForShop(token,shopId)`); + mandate "ห้าม log code/text" ใน sendSms + route

ACCEPTED-RISK (MVP, ระบุชัด, Phase 2 ปิด): **AR-1** crash deduct↔compensate → seller เสีย ฿1 + code orphan (mitigate ด้วย RC-3 deliveryStatus + manual reconcile; Phase2 = job queue) · **AR-2** in-memory rate-limit per-instance (Phase2 Redis) · **AR-3** slip MIME = client Content-Type ไม่ใช่ magic-byte, admin-only viewer (Phase2 magic-byte)

> Pre-existing (นอก feature นี้, flag): seller order-detail page.tsx:134 ส่ง raw `buyerContact` ข้าม RSC→client (S-C1 violation เดิม) — track, ไม่ใช่ scope feature นี้

## New surface (planner จะ design รายละเอียด)
- DB (Phase 4, defer): `SellerWallet`(1:1 Shop), `WalletTransaction`(ledger TOPUP/DEDUCT), `TopUpRequest`(amount, slipFileId, status, reviewedBy, reason), phone-bound code table (code-hash, orderId, buyerPhone, expiresAt, usedAt)
- API: `POST /api/orders/[token]/send-sms`, `POST /api/wallet/topup` (+slip), admin `POST /api/admin/topups/[id]/{approve,reject}`, code-consume ใน `/o/[code]` flow
- UI: seller wallet/buy-credit page + send-SMS button on order detail; admin top-up review queue

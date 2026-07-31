# Deferred Backlog — รอ parallel stream commit ก่อน (2026-05-16)

> งานที่ **ทำได้แล้วทันที** แต่ถูก block ด้วย pre-flight rule: ไฟล์เป้าหมายมี
> uncommitted work ของ parallel stream (Anuphan Hard Rule 5 + OMS) อยู่ —
> แตะ/commit ตอนนี้ = clobber งาน stream อื่น. **ไม่ใช่ skip — รอ unblock.**

## วิธีเช็คว่า unblock แล้ว
`git status --short` — ถ้าไฟล์ใน "ไฟล์ที่ block" ของแต่ละ item **ไม่อยู่ใน M list**
แล้ว = parallel stream commit แล้ว → ทำ item นั้นได้เลย. ทำทีละ item, แต่ละ
item = atomic commit, tsc 0, ตาม convention เดิม (theme-copy/Anuphan/S-C*).

## Items (เรียงตามคุณค่า)

### 1. seed: badge naming + verification records
- **ทำอะไร:** `prisma/seed.ts` — (a) badge nameEN "Seller Only Badge"/"Buyer
  Only Badge"/"Any Audience Badge" เป็น test artifact ไม่ตรง PRD achievement
  system → เปลี่ยนให้ตรง PRD (หรือเอาออกถ้าไม่ใช่ achievement จริง).
  (b) เพิ่ม verification records ให้ test seller (`0000000001`) — L1 PHONE_OTP
  APPROVED อย่างน้อย เพื่อให้ S18 verification upload flow QA E2E ได้ครบ
  (B9 QA NOTE: ตอนนี้ seller มี 0 verification record → upload CTA ไม่โผล่).
- **Block file:** `prisma/seed.ts` (parallel M — OMS Task 8 seed work)
- **Ref:** retro action #5; B9 QA NOTE S18-1a

### 2. maskContact shared util (DRY + จุด harden เดียว)
- **ทำอะไร:** สกัด `maskContact` (last-4 + bullets) เป็น util เดียว (เช่น
  `src/lib/pii.ts`) — ตอนนี้ inline ซ้ำ ≥5 จุด: customers/page.tsx,
  CustomerDetails.tsx, dashboard/page.tsx, products/[id]/page.tsx,
  orders/[token]/page.tsx. แทนที่ทุก inline ด้วย import. harden email-mask
  (เดิมโชว์ TLD 4 ตัวท้าย — security ว่า low-risk แต่ทำทีเดียวตอนรวม util).
- **Block file:** `dashboard/page.tsx` (parallel M) + อาจมีอื่นใน seller M list
- **Ref:** retro action #2 + #10; security-conventions S-C1

### 3. typed session shape (kill systemic `(session as any)?.user`)
- **ทำอะไร:** สร้าง typed session helper/module-augmentation แทน
  `(session as any)?.user` ที่ใช้ทุก seller page (~9+ ไฟล์). ทำเป็น sweep
  เดียว type-safe.
- **Block file:** seller pages หลายตัวใน parallel M list (dashboard/verification ฯลฯ)
- **Ref:** retro action #3; agent-team-workflow lesson

### 4. auth.ts shop-create route ผ่าน shop.service
- **ทำอะไร:** `src/lib/auth.ts` task #9 ทำ inline `prisma.shop.create`+
  `user.update` ใน `$transaction` เอง. `createShop` service ตอนนี้รับ logo +
  $transaction แล้ว (commit `262b009`) → ให้ auth.ts เรียก `createShop` แทน
  inline (DRY, จุด atomic เดียว). ระวัง: auth.ts ทำใน $transaction กับ
  user create อยู่แล้ว — ต้องคง atomicity (อาจต้องให้ createShop รับ tx client
  หรือ refactor ระวัง). ผ่าน safepay-security (แตะ auth.ts).
- **Block file:** `src/lib/auth.ts` (parallel M — Anuphan/OMS)
- **Ref:** retro action #8; B-phase #9 reviewer nice-to-have

## ทำเสร็จแล้ว (อ้างอิง — ไม่ต้องทำซ้ำ)
StatStrip ลบ `424f912` · S7 review card `fa04de1` · createShop logo+$txn
`262b009` · OMS tsc verified-clean (no-op) · order-500 `959b7cd`.

---

# PRD §11 MVP gaps — ยังไม่เริ่ม (verified 2026-05-16)

> ตรวจ `docs/PRD.md §11 Known Gaps` (12 ข้อ) เทียบโค้ดจริงแล้ว. ด้านล่าง = ที่ยัง
> OPEN และ MVP-worth. **verify สถานะอีกครั้งก่อนเริ่ม** (parallel stream อาจปิดบางตัว).

## ✅ ปิดแล้ว — อย่าทำซ้ำ
- §11 #2/#5 ship-guard + order state machine → OMS stream ปิด (`fulfillmentMode!=="SHIPPED"` confirmOrder; PENDING/SHIPPED/CONFIRMED/CANCELLED)
- §11 #4 admin self-review block → มีแล้ว `src/app/api/admin/verifications/[id]/route.ts:12`
- §11 #8 seller menu ไทย → Phase B

## 5. §11 #11 — general rate-limit (100/30) + CSRF [security, ก่อน prod]
- **ทำอะไร:** ปัจจุบัน grep เจอ **0** (มีแต่ OTP `consumeOtpRequestQuota`). เพิ่ม
  general rate-limit (NFR-2.2: ~100 req/30s ต่อ IP/identity) + CSRF (NFR-2.3)
  ครอบ API/mutation. store in-memory ได้ (Redis = §11 #12 Phase 2). pattern
  globalThis singleton (เหมือน OTP store / `src/lib/prisma.ts`).
- **Block/risk:** `src/proxy.ts` (middleware) + `src/lib/*` ใหม่ — pre-flight เช็ก
  proxy.ts ไม่อยู่ใน parallel M. design-sensitive (Next 16 App Router +
  NextAuth CSRF token) → **ต้อง safepay-security**. ความเสี่ยงสูงสุดในลิสต์.
- **Ref:** PRD §11 #11, NFR-2.2/2.3

## 6. §11 #3 — shippingAddress persist via CreateOrderSchema [FR-6.5 Must]
- **ทำอะไร:** `CreateOrderSchema` (validations.ts) ยัง `{items,type}` เปล่า —
  เพิ่ม `shippingAddress` optional + **required เมื่อ fulfillmentMode===SHIPPED**;
  `createOrder` persist (Order.shippingAddress มี field แล้ว — B9 JSON เห็น
  `shippingAddress:null`); seller order-create form (S8 OrderCreateForm) เพิ่ม
  input ตอน SHIPPED. **contained + natural follow-on ของ OMS fulfillmentMode**.
- **Block/risk:** validations.ts/order.service.ts = clean (ผมเพิ่งแตะ committed);
  OrderCreateForm = committed. **ไม่ชน parallel** → quick win MVP. pre-flight ยืนยันอีกที.
- **Ref:** PRD §11 #3, FR-6.5

## 7. §11 #7 — buyer `/orders` `/reviews` `/settings/*` server-side auth guard [security §5.6]
- **ทำอะไร:** PRD ว่า client-only auth (bypassable). **ต้อง verify ก่อน** — Phase B
  แตะแต่ seller; buyer (Vuexy R1-R11) อาจยังไม่มี server guard. ถ้ายังขาด → เพิ่ม
  `getServerSession` guard ใน RSC layout/page ฝั่ง `(marketing)/(buyer-app)/*`.
  ระวัง S-C7 (DAL ownership — scope ใน WHERE ไม่ใช่หลัง fetch).
- **Block/risk:** buyer (marketing) pages — verify parallel M ก่อน. security.
- **Ref:** PRD §11 #7, §5.6, S-C7

## 8. §11 #1 — badge data-driven engine [FR-4.3 Must, rework ใหญ่]
- **ทำอะไร:** badge evaluator ยัง hardcode ตาม nameEN (สอดคล้อง seed badge naming
  issue item #1 ข้างบน). rework ให้ criteria JSON มีผล runtime จริง (admin แก้
  criteria แล้วมีผล). ใหญ่สุด — ควร plan/agent-team ไม่ใช่ quick task.
- **Block/risk:** badge.service + admin badge UI; โยงกับ seed badge naming (item #1).
- **Ref:** PRD §11 #1, FR-4.3

## 9. Feature: Paid SMS Order Link + Seller Wallet/Credit [MVP-Must, S-8/FR-6.8/6.9/§10]
- **สถานะ (2026-05-17): Phase 4 COMPLETE** — Backend B1-B4 + UI B5-B8 build เสร็จ (tsc 0 ครบ):
  - Unit A schema/migration `367f3c9`
  - B1: T2 `4077133` · T3 `20b9b40` · T4 `e1808f6`
  - B2: T5 `6833a2f`→`6ed858d` (atomic gate กัน double-credit/TOCTOU) · T8 `e65bac3`→`cdf9f6c` (try/catch+strip walletId) · T6 schemas เข้า `4578fad`
  - B3: T7 `cab811f` (atomic deduct+issue+lock 1 tx, OQ-5 burst limit 20/ชม.) · T9/T12 `9b7c454` · slip-gate+`@@index([slipFileId])` `c47220a`
  - B4: T10 approve + T11 reject `1dbc32e` — RC-7 self-block (fail-closed)
  - B5: T13 `/o/{code}` short-code resolver + signed cookie `ee2d326` · T15 TopUpRequestModal `dcbbbd1` · T17 SendSmsButton `e023d97`
  - B6: T14+T16 seller `/wallet` page + WalletCard + WalletTransactionTable `a3cbd22`
  - B7: T18 wire SendSmsButton เข้า order-detail `10f76e8` · T19 admin `/topups` queue `c222052` · T20+T21 admin `/topups/[id]` detail + TopUpReviewActions `38b69f2`
  - Pre-Batch nav `73026d7` · T22 docs (commit นี้)
- **UI ครบทุก task — ไม่มีช่องว่าง route** (`/topups/{id}` มี page แล้ว `38b69f2` — eye-link ใช้งานได้)
- **สถานะ (2026-05-17): FEATURE COMPLETE — Phase 4+5+6+7 ครบ, QA GREEN.** + T23
  (seller pending-topup list, QA-found `e0006f0`) + T24 (near-realtime celebration
  alert `1a5dad9`, migration `20260517040000_topup_notified_at`) + Phase 5 fixes
  `04e3572` (F1 IP-fallback/F2 confirm-error-mask/F3 cookie-path-doc) + Phase 6
  QA-bug fix `132e600` (T13 redirect host=BUYER_BASE / T23 modal router.refresh)
  + retro `2026-05-17-sms-wallet-feature.md`. Phase 6 re-QA = MERGE (browser E2E
  19+ scenario; RC-1..8 + RC-7 + celebration fire-once + 402/403/422 PASS จริง).
- **⚠️ ต้อง `prisma migrate deploy` (env.local/Supabase) ก่อน prod-use:** migrations
  `20260517000001_topup_slipfileid_index` + `20260517040000_topup_notified_at`
  (additive nullable + index — ปลอดภัย ไม่ backfill).
- **Product change 2026-05-17 (commit `3acbcbe`):** ตัด L2/D3 verification gate
  → credit-only + SendSmsButton เป็น confirm dialog + ปุ่มใน Orders List. gate-3
  reviewer MERGE + security PASS (residual anti-abuse verified). ดู spec
  AR-L2-REMOVAL + retro 2026-05-17-sms-wallet.
- **Phase-2 backlog (deferred, ไม่ block MVP):**
  - **AR-L2-REMOVAL mitigation:** ถ้ามี spam/abuse report — เพิ่ม per-phone
    cross-shop daily SMS limit (ตอนนี้ bound ที่ ฿1+200/วัน+20/ชม per-shop
    เท่านั้น; เบอร์เดียวกันถูกหลาย shop ส่งได้ถ้าแต่ละ shop อยู่ใน cap).
  - **AR-C1:** แยก `SMS_UNLOCK_SECRET` env (ตอนนี้ reuse `NEXTAUTH_SECRET` สำหรับ
    HMAC cookie — secure แต่ blast-radius กว้าง; แยก secret + fallback chain).
  - **true-realtime:** ปัจจุบัน poll 20s (T24). upgrade เป็น SSE (Next16 route
    stream) หรือ Supabase Realtime ถ้าต้อง <1s + ลด poll cost.
  - **confirm route คืน full Prisma order incl `buyerContact`** (pre-existing,
    buyer-confirms-own = mild S-C1) — narrow select / mask ที่ confirm response.
  - **AR-3:** cross-subdomain CSRF SameSite=Lax — Origin-check ที่ confirm route.
    slip cookie `path:'/'` คงไว้ (จำเป็น — confirm route อ่าน; แคบ /o/ จะพัง — ดู
    sms-unlock-cookie.ts comment).
  - inline-guard → Valibot schema ที่ `/api/wallet/events` ack (functionally secure).
- **เอกสาร:** spec `docs/superpowers/specs/2026-05-16-sms-order-link-wallet.md` · plan `docs/superpowers/plans/2026-05-16-sms-wallet-phase4-plan.md` · PRD §11-SMS `docs/PRD.md`

## 🟡 ต่ำกว่า / ไม่ note ละเอียด (ดู PRD §11 ตรง)
#10 admin metrics บางตัวขาด (Completion Rate/Avg Rating/Active Users; avgTrust มีแล้ว) ·
#6 .env.vercel safepay.co reconcile (config, น่าจะ user-side) · #9 FB-no-email
link fallback (edge) · #12 Redis = Phase 2 (ไม่ใช่ MVP).

---

## 💡 IDEA — DeepBot "โหมดตอบเต็มรูปแบบ" (feature 00023, จด 2026-07-31 · ยังไม่ตัดสิน)

user: *"ทำให้สามารถเปิด/ปิด การตอบแบบเต็มรูปแบบไหมด้วยได้ปะ — เช่นบางคนอยากให้บอททำงาน
ตอนนอน ก็ให้คำนวนทุกคำถาม และเอาคลังความรู้ไปตอบ · ถ้าปิด คือตอบเฉพาะตาม keyword"*

**สวิตช์ระดับร้าน 2 สถานะ:**
- ปิด (ค่าเริ่มต้น) = ตอบเฉพาะข้อความที่ตรงกลุ่มคำ — พฤติกรรมปัจจุบัน
- เปิด = ข้อความที่ไม่ตรงกลุ่มคำไหนเลย ให้ไปหาคำตอบจากคลังความรู้แทนที่จะเงียบ

**ทำไมตัวนี้อยู่ระดับร้านได้ทั้งที่ user ปฏิเสธสวิตช์ระดับร้านมาแล้ว 2 รอบ:**
มันตัดสิน "เมื่อ**ไม่เข้า**กลุ่มไหนเลยจะทำอะไร" ซึ่งไม่มีกลุ่มให้แขวน ต่างจาก AI Enhance
ที่ตัดสิน "เมื่อเข้ากลุ่มนี้แล้วทำอะไร". และไม่สร้างกับดักเดิม เพราะสวิตช์ตัวเก่าที่ถูกรื้อ
**ทำให้กลุ่มที่ขึ้นว่า "ตอบจริง" เงียบได้** ส่วนตัวนี้ทำได้แค่ **เพิ่มคำตอบตรงที่เคยเงียบ**
ไม่มีทางปิดปากกลุ่มไหน

**ตัดสินไปแล้ว (2026-07-31):** ตารางเวลา `activeScheduleMode` = **เปิด/ปิดบอท** ตามที่ทำเสร็จ
แล้วใน S-04 — ไม่ใช่สวิตช์สลับโหมดตอบ. โหมดเต็มรูปแบบจึงเป็นสวิตช์แยกที่ไม่ผูกกับเวลา

**ยังไม่ได้คิด:** ต้นทุนต่อข้อความเมื่อทุกข้อความต้องค้นคลัง · จะจำกัดยังไงไม่ให้ตอบมั่ว
เมื่อคลังไม่มีคำตอบที่ใกล้พอ (เกณฑ์ความมั่นใจขั้นต่ำ) · เกี่ยวกับ AI Enhance ยังไง

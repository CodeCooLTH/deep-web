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

## 🟡 ต่ำกว่า / ไม่ note ละเอียด (ดู PRD §11 ตรง)
#10 admin metrics บางตัวขาด (Completion Rate/Avg Rating/Active Users; avgTrust มีแล้ว) ·
#6 .env.vercel safepay.co reconcile (config, น่าจะ user-side) · #9 FB-no-email
link fallback (edge) · #12 Redis = Phase 2 (ไม่ใช่ MVP).

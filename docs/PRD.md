# Deep — Product Requirements Document (PRD)

**เวอร์ชัน:** 3.2
**วันที่:** 11 มิถุนายน 2569
**ผู้จัดทำ:** Deep Team

> **Changelog 3.2 (2026-06-11):** แยก technical spec ออกไป `docs/SRS.md` (data model/API/FR detail/state machine/routing/NFR/tech stack/enums/auth matrix/validation). PRD เหลือ product-level: vision, stories, feature overview, MVP scope, metrics, business model, roadmap.

> **Changelog 3.1 (2026-06-11):** เพิ่ม §12-§16 technical contract (ย้ายไป SRS แล้ว)

> **แบรนด์:** ชื่อทางการค้าคือ **"Deep"** (UI copy, domain `deepthailand.app`). **"SafePay"** เป็น internal codename — repo, identifiers, ตาราง DB ยังใช้ SafePay.
> ปรับปรุงจาก interview ทบทวนทีละ section (2026-05-16). decision log: `docs/superpowers/specs/2026-05-16-prd-rewrite-decisions.md`. gap analysis เทียบโค้ดจริงเป็นฐาน.

---

## §1 ภาพรวมผลิตภัณฑ์ (Product Overview)

Deep เป็นระบบจัดเก็บ History และคำนวณ Trust Score เพื่อสร้างความน่าเชื่อถือในการซื้อขายออนไลน์ ผ่าน Verify ตัวตน, Badge, Public Profile — แก้ปัญหามิจฉาชีพในโลกการค้าออนไลน์

### 1.1 Vision Statement

> "ทำให้ทุกคนที่ซื้อขายออนไลน์มีตัวตนที่ตรวจสอบได้ ลดปัญหามิจฉาชีพด้วย Trust Score ที่โปร่งใส"

### 1.2 Core Concept

- ไม่แบ่ง role — ทุก account มี trust profile เดียวกัน, เปิดร้านเพิ่มได้ (`isShop` flag, auto-set เมื่อสร้างร้านสำเร็จ)
- **Free core ตลอดไป** — ทุกคนใช้ฟรี: สร้าง Order/Product, Order Link อย่างง่าย, Report 1 ตัว, **ทุกขั้นตอน manual** (สร้าง + ส่งลิงก์เอง). ระบบทำหน้าที่บันทึก history + คำนวณ Trust + Public Profile
- **คิดเงินเฉพาะฟังก์ชันช่วยเหลือ** แบบ à la carte (ดู §6 Business Model)
- **หลักออกแบบสำคัญ:** flow ฝั่ง Free โดยเฉพาะ Order Link ต้อง **"ง่ายมาก ๆ"** — เป็น design constraint ระดับ product ไม่ใช่แค่ usability NFR

### 1.3 Target Users / Personas

| Persona | คำอธิบาย | Pain Point |
|---------|---------|-----------|
| **Seller (persona หลัก)** | คนขายของ/ให้บริการ/ธุรกิจหน้าร้าน ที่เปิดร้านใน Deep | ต้องการสร้างความน่าเชื่อถือให้ลูกค้ามั่นใจ ลดการเจรจาเรื่องความไว้ใจ |
| **User/Buyer (รวมเป็นกลุ่มเดียว)** | คนทั่วไปที่มี profile — ซื้อของ, สะสม trust, อาจเปิดร้านภายหลัง. รวมถึง guest ผู้ซื้อที่ยังไม่สมัคร | กลัวโดนโกง ไม่รู้ว่าร้านเชื่อถือได้ไหม |
| **Admin/Ops (internal)** | ทีมดูแลระบบ Deep — ไม่ใช่ end-user | ต้อง review เอกสาร verify, จัดการ badge, monitor ระบบ |

---

## §2 User Stories

### 2.1 User/Buyer (มี profile + guest)

| ID | User Story | Priority | Acceptance Criteria |
|----|-----------|----------|-------------------|
| U-1 | สมัคร/เข้าระบบ | Must | **buyer:** Facebook (live prod 2026-06-17) หรือ Phone OTP (ไม่มี password). **seller:** username+password เป็น login หลัก + Phone OTP ยืนยันเบอร์ตอนสมัคร + reset via OTP + Facebook (live prod 2026-06-17); seller ใหม่ผ่าน mandatory onboarding page (slug บังคับ + phone immutable). ไม่มี **email**+password |
| U-2 | ยืนยันตัวตน (Phone OTP, เอกสารบุคคล, เอกสารธุรกิจ) | Must | verify ได้ 3 ระดับ, L2/L3 admin review |
| U-3 | เห็น Trust Score ของตัวเอง + เข้าใจที่มา | Must | แสดง score + ระดับ + breakdown 5 ปัจจัย + คำอธิบายเงื่อนไข rating |
| U-4 | เห็น badges ที่ได้รับ | Must | แสดง verification + achievement + paid badge |
| U-5 | มี public profile ให้คนอื่นดู | Must | `/u/{username}` แสดง score, badges, order สำเร็จ, reviews |
| B-1 | เปิดลิงก์ order เพื่อดูข้อมูล | Must | เห็นสินค้า, ราคา, trust score ร้านค้า |
| B-2 | ยืนยันรับของ/ยืนยัน order โดยไม่ต้องสมัคร | Must | กรอกเบอร์ให้ตรง (phone-unlock) → กดยืนยัน — **ไม่มี OTP confirm** |
| B-3 | review/rate ร้านค้าหลังยืนยัน | Must | ให้คะแนน 1-5 + comment |
| B-4 | สมัครทีหลังแล้ว history ตามมา | Must | ผูก phone (phone-OTP signup) / email (FB signup) → auto-link orders+reviews เดิม |
| B-5 | ใช้บนมือถือสะดวก | Must | Responsive mobile-first |

> **ตัดถาวร:** **Email**+Password login, multi-provider linking (ผูกหลาย provider ใน account หลัง signup) — ไม่อยู่ใน scope. (หมายเหตุ: seller มี **username**+password login ตั้งแต่ 2026-06-16 — คนละอย่างกับ email+password ที่ตัด)

### 2.2 Seller (persona หลัก, isShop = true)

| ID | User Story | Priority | Acceptance Criteria |
|----|-----------|----------|-------------------|
| S-1 | เปิดร้านค้า | Must | กรอกชื่อร้าน/ประเภท/รายละเอียด → `isShop` auto-set true |
| S-2 | เพิ่มสินค้า (4 ชนิด + capability) | Must | ชื่อ/รายละเอียด/ราคา/รูป + type + capability flags (ดู FR-5) |
| S-3 | สร้าง order แล้วส่งลิงก์ให้ buyer (ง่ายมาก) | Must | เลือกสินค้า → สร้าง order → ได้ลิงก์ `/o/{token}` ส่งเองได้ทันที |
| S-4 | เห็นสถานะทุก order | Must | Dashboard + filter ตามสถานะ |
| S-5 | ใส่ tracking (order ที่มีจัดส่ง) | Must | กรอก tracking + ขนส่ง เมื่อ fulfillmentMode=SHIPPED |
| S-6 | เห็น reviews ที่ได้รับ | Must | รายการ review + rating |
| S-7 | ยืนยันตัวตนระดับร้าน/ธุรกิจ | Must | อัพโหลดเอกสาร L2/L3 ที่ `/verification` |
| S-8 | ส่ง Order Link ผ่าน SMS (paid) | Must | กดส่งลิงก์เข้ามือถือ buyer จากระบบ (หักเครดิต ฿1/ข้อความ) |
| S-9 | ดูยอดขาย/ลูกค้า/หมวดหมู่ | Must | `/sales` (analytics), `/customers`, `/categories` |

### 2.3 Admin/Ops

| ID | User Story | Priority | Acceptance Criteria |
|----|-----------|----------|-------------------|
| A-1 | เห็น dashboard สถิติครบ | Must | 8 metrics (ดู §5) |
| A-2 | review เอกสาร verification | Must | ดูเอกสาร, approve/reject + เหตุผล — **ห้าม approve ของตัวเอง** |
| A-3 | ดูรายการผู้ใช้ | Must | users + trust score + verification status |
| A-4 | ดูรายการ orders ทั้งหมด | Must | filter ตามสถานะ |
| A-5 | จัดการ badge + criteria | Must | เพิ่ม/แก้ badge และ **criteria มีผล runtime จริง** (data-driven) |

---

## §3 Features (Functional Overview)

> รายละเอียด FR ฉบับเต็ม (สูตร/acceptance criteria/state machine/routing/validation): ดู `docs/SRS.md`

### FR-1: Authentication & Session

ระบบ login: **buyer** = Facebook OAuth + Phone OTP (SMS). **seller** = username+password เป็น login หลัก (provider `seller-credentials`, bcrypt) + Phone OTP ยืนยันเบอร์ตอนสมัคร + ตั้ง/ลืมรหัสผ่าน via OTP + Facebook (live บน prod 2026-06-17); seller signup → **mandatory onboarding page** `/onboarding` (5 step: phone→ข้อมูลร้าน→OTP→slug→สินค้าแรก; proxy force-redirect ถ้า `needsOnboarding`); **เบอร์โทร immutable** (ตั้งครั้งเดียว เปลี่ยนไม่ได้). **admin** = username+password. Session แยกตาม subdomain (buyer/seller/admin) — host-scoped cookie. ไม่มี **Email**+Password (seller ใช้ username ไม่ใช่ email).

Priority: Must — รายละเอียด/acceptance: ดู SRS §1 FR-1

### FR-2: Verification (3 ระดับ)

ยืนยันตัวตนได้ 3 ระดับ: L1 = Phone OTP (auto), L2 = บัตรประชาชน+selfie (admin review), L3 = เอกสารธุรกิจ (admin review). Admin ห้าม approve verification ของตัวเอง.

Priority: Must — รายละเอียด/acceptance: ดู SRS §1 FR-2

### FR-3: Trust Score

คะแนนความน่าเชื่อถือ 0-100 คำนวณจาก 5 ปัจจัย (Verification 35 / Orders 25 / Rating 20 / Age 10 / Badges 10). Rating floor: ถ้า review < 3 = 0 คะแนน component. MVP มีแต่ขึ้น ไม่หักคะแนน.

Priority: Must — สูตรเต็ม/acceptance: ดู SRS §1 FR-3

### FR-4: Badge

3 ประเภท: Verification badge (auto), Achievement badge (data-driven engine; 10 badge seller + buyer audience), Paid Verified Badge (Phase 2). Badge ติดตัวถาวร ไม่ revoke. หน้า Badge Process แสดง progress.

Priority: Must — criteria 10 badge/acceptance: ดู SRS §1 FR-4

### FR-5: Product (Capability Model)

สินค้า 4 ชนิด: PHYSICAL / DIGITAL / SERVICE / SUBSCRIPTION. Capability axes: fulfillmentMode (SHIPPED/NO_SHIPPING), billingMode (ONE_TIME/RECURRING). Ship guard ใช้ fulfillmentMode ไม่ใช่ type.

Priority: Must — capability defaults/acceptance: ดู SRS §1 FR-5

### FR-6: Simple OMS

Seller สร้าง order → link `/o/{token}` → buyer phone-unlock → ยืนยัน → recalc trust. รองรับ SMS Order Link (paid ฿1/SMS; phone-bound token ข้าม phone-unlock). Buyer cancel ได้เฉพาะ PENDING. Payment slip upload โดย buyer.

Priority: Must — state machine/sub-IDs FR-6.1-6.13: ดู SRS §1 FR-6 + §2

### FR-7: Review

Buyer review + rating 1-5 ดาว หลัง CONFIRMED. 1 order = 1 review. Guest buyer เก็บ reviewerContact. Anonymous review นับเข้า rating แต่ไม่นับ unique reviewer (Community Favorite).

Priority: Must — acceptance: ดู SRS §1 FR-7

### FR-8: Buyer History Linking

Buyer ยืนยัน order โดยไม่สมัคร → เก็บ buyerContact → สมัครภายหลัง → auto-link orders+reviews ทันที (phone match = phone-OTP; email match = FB).

Priority: Must — acceptance: ดู SRS §1 FR-8

### FR-9: Public Profile (Seller-centric)

หน้า `/u/{username}` สาธารณะ (ไม่ต้อง login). แสดง trust banner (Deep tier), badges (seller-context), product grid ≤9, avg rating, order count. Redesign 2026-05-23: single-column Instagram-style (max-width 640px).

Priority: Must — sub-IDs FR-9.1-9.11/สถานะ: ดู SRS §1 FR-9

### FR-10: Admin Panel

Dashboard 8 metrics ครบ. User management, verification queue (self-review block), order monitoring, badge management (criteria data-driven), topup queue approval.

Priority: Must — acceptance: ดู SRS §1 FR-10

### FR-L1: Privacy Policy Page

หน้า `/privacy` สาธารณะ (ไม่ต้อง login) — แสดง Privacy Policy ภาษาไทย ครอบคลุมข้อมูลที่เก็บ/ใช้/เปิดเผย และสิทธิผู้ใช้ ตามข้อกำหนดของ **Facebook Login / Meta App Review** (Privacy Policy URL). Render เป็น static Server Component, ไม่ noindex.

Priority: Must (Facebook App Review requirement) — routing: ดู SRS §3.2

### FR-L2: Data Deletion Instructions Page

หน้า `/data-deletion` สาธารณะ (ไม่ต้อง login) — อธิบายขั้นตอนขอลบข้อมูล: ส่ง email แจ้ง username + ข้อมูลที่ต้องการลบ → ทีม Deep ดำเนินการภายใน 30 วัน ตามข้อกำหนดของ **Facebook Login / Meta App Review** (User Data Deletion URL). Render เป็น static Server Component. หมายเหตุ: เป็นหน้า Instructions URL เท่านั้น — ไม่ใช่ deletion callback (callback = Phase 2, OOS).

Priority: Must (Facebook App Review requirement) — routing: ดู SRS §3.2

### FR-L3: Terms of Service Page

หน้า `/terms` สาธารณะ (ไม่ต้อง login) — ข้อกำหนดการใช้บริการภาษาไทย 10 หัวข้อ (การยอมรับ/คำอธิบายบริการ/บัญชี/ข้อห้าม/การซื้อขาย/ทรัพย์สินทางปัญญา/จำกัดความรับผิด/ระงับบัญชี/กฎหมายไทย/ติดต่อ) ระบุชัดว่า Deep เป็นตัวกลางสร้างความน่าเชื่อถือ ไม่ใช่คู่สัญญาซื้อขาย. ใช้เป็น **Terms of Service URL** ใน Meta App Review. Render เป็น static Server Component, ไม่ noindex.

Priority: Should (Meta App Review — Terms of Service URL optional แต่เพิ่มความน่าเชื่อถือ) — routing: ดู SRS §3.2

---

## §4 MVP Scope

### ทำใน MVP

- Free core: Order / Product / Order Link อย่างง่าย / Report 1 ตัว (manual ทุกขั้น)
- Auth: buyer = Facebook (live prod 2026-06-17) + Phone OTP; seller = username+password + Phone OTP (signup verify) + reset-via-OTP + Facebook (live prod 2026-06-17) + mandatory onboarding page (2026-06-17; แทน modal); admin = username+password; เบอร์โทร immutable
- Verification L1 (Phone OTP) + L2 (เอกสารบุคคล) + L3 (ธุรกิจ) + admin review + self-review block
- Trust Score (raw additive + rating floor + UX copy)
- **Achievements system** — Badge data-driven engine (3 ประเภท; rework จาก hardcode), Seller+Buyer audience, ติดตัวถาวร, event/time-bound, icon deferred, **หน้า Badge Process** (buyer+seller `/badges`)
- Simple OMS — state machine (PENDING→CONFIRMED, unified terminal)
- **SMS Order Link + credit/top-up wallet** (paid, ฿1/SMS)
- **SUBSCRIPTION เต็มรูป** — capability model + P3 (NO_SHIPPING hide-address) + P4 (recurring dashboard + recurring billing)
- Buyer history linking (phone/email match)
- Public Profile (seller-centric)
- Admin panel — 8 metrics ครบ
- Server-side route guard ทุก authed route
- Seller `/sales` `/customers` `/categories`; `/pricing` page
- Subdomain routing + แยก session

### Phase 2

- พิมพ์เอกสาร (ใบเสร็จ/ใบแจ้งหนี้) — paid (โมเดล A: ฿590/600 orders | B: ฿199/เดือน unlimited — TBD)
- **Verified Badge** — paid subscription ~฿299/เดือน
- ระบบ billing เต็มรูป + Redis store (OTP/rate-limit)
- General rate-limit Redis-backed + CSRF เต็มรูป
- Dispute / Complaint system (admin review ก่อนหักคะแนน)
- Embeddable widget, Platform integration, Shipping status sync

---

## §5 Metrics & Analytics

### 5.1 Product Metrics (Admin Dashboard) — 8 metrics ครบใน MVP

| Metric | วิธีคำนวณ | สถานะ |
|--------|----------|-------|
| Total Users | COUNT(users) | ✅ มี |
| Shops | COUNT(users where isShop=true) | ✅ มี |
| Total Orders | COUNT(orders) | ✅ มี |
| Verifications Pending | COUNT(verification where status=PENDING) | ✅ มี |
| Completion Rate | CONFIRMED / (CONFIRMED + CANCELLED) | ✅ มี (2026-06-06) |
| Avg. Rating | AVG(reviews.rating) | ✅ มี (2026-06-06) |
| Active Users | users มี order ใน 30 วันล่าสุด (buyer+เจ้าของร้าน distinct) | ✅ มี (2026-06-06) |
| Avg. Trust Score | AVG(users.trustScore) | ✅ มี |

### 5.2 Marketing / SEO

Google Analytics (`NEXT_PUBLIC_GA_MEASUREMENT_ID`) + Google Search Console (`NEXT_PUBLIC_GSC_VERIFICATION`)

### 5.3 Seller Analytics

หน้า `/sales` — ร้านดูยอดขาย/order ของตัวเอง (SalesChart, SalesTable)

---

## §6 Business Model

**โมเดล: Free core ตลอดไป + ขายฟังก์ชันช่วยเหลือแบบ à la carte** (ไม่ใช่ tier subscription)

### 6.1 Free (ทุกคน ตลอดไป)

สร้าง Order/Product, Order Link อย่างง่าย, Report 1 ตัว, **manual ทุกขั้นตอน** (สร้าง + ส่งลิงก์เอง). ระบบให้: บันทึก history, Trust Score, Public Profile (order สำเร็จ + badges)

### 6.2 Paid Add-ons

| Add-on | โมเดล | Phase |
|--------|-------|-------|
| **SMS Order Link** | ฿1/ข้อความ (ทุน ~฿0.5) — credit/top-up wallet, กดส่งลิงก์เข้ามือถือ buyer จากระบบ. Free = ส่งเอง | **MVP** |
| **พิมพ์เอกสาร** (ใบเสร็จ/ใบแจ้งหนี้/อื่น ๆ) | TBD — A: pack ฿590 / 600 orders (reprint ออเดอร์เดิมได้) หรือ B: ฿199/เดือน ไม่อั้น | Phase 2 |
| **Verified Badge** | subscription ~฿299/เดือน — badge หลังชื่อร้าน/profile (แบบ Meta/Twitter) | Phase 2 |

### 6.3 ทิศทาง

ฟีเจอร์เสริมในอนาคตคิดเงินแบบ à la carte ต่อไป — เพิ่ม add-on ใหม่โดยไม่กระทบ Free core

---

## §7 Known Gaps & Roadmap

| # | Gap | ต้องทำ | สถานะ |
|---|-----|--------|-------|
| 1 | Badge evaluator hardcode ตาม nameEN — criteria JSON ไม่มีผล | rework เป็น data-driven engine (FR-4.3) | ✅ **CLOSED** (verified 2026-06-11) — `badge.service.evaluateBadges` อ่าน `badge.criteria` JSON จาก DB → `parseCriteria` → dispatch ตาม `criteria.type`; seed.ts = single source (เดิม hardcode DEFAULT_BADGES/BADGE_CHECKS ลบแล้ว) |
| 2 | Ship guard เช็ค `type===PHYSICAL` | เปลี่ยนเป็น `fulfillmentMode===SHIPPED` (P3) | **CLOSED** (OMS stream) |
| 3 | `shippingAddress` persist + required เมื่อ SHIPPED | ✅ CLOSED 2026-06-06 — persist (Phase B) + required guard ที่ `createOrder` service | CLOSED |
| 4 | Admin อนุมัติ verification ตัวเองได้ (P2 retro HIGH) | self-review guard ที่ service layer `reviewVerification()` + ลบ orphan route | **CLOSED** 2026-06-06 |
| 5 | Order state machine = CREATED/CONFIRMED/SHIPPED/COMPLETED/CANCELLED | migrate → PENDING/SHIPPED/CONFIRMED/CANCELLED + `cancelInitiator` | **CLOSED** (OMS stream) |
| 6 | `.env.vercel` ยังชี้ `safepay.co` | seed.ts email → deepthailand.app ✅; `.env.vercel` = local untracked + gitignored | **CLOSED (code)** 2026-06-06 |
| 7 | buyer `/orders` `/reviews` `/settings/*` client-only auth | server-side guard (SRS §3.6) | ✅ **CLOSED** (verified 2026-06-11) — `(buyer-app)/layout.tsx` มี `getServerSession`+redirect ครอบทุก child; แต่ละ page เป็น server component + `getServerSession` เอง (defense-in-depth) + data fetch ผ่าน service ที่ scope ownership (`getOrdersByBuyer(userId)`) + flatten Decimal/Date กัน RSC leak |
| 8 | seller/admin menu label อังกฤษ | แปลไทย (SRS NFR-3.1) | **CLOSED** 2026-06-06 |
| 9 | FB user ไม่มี email → ไม่ auto-link history | หา fallback key | OPEN (edge case) |
| 10 | 4 admin metrics ขาด (Completion Rate, Avg Rating, Active Users, Avg Trust) | ✅ CLOSED 2026-06-06 — ครบ 8 metric ใน dashboard page + api/admin/dashboard | CLOSED |
| 11 | general rate-limit (100/30) + CSRF | ✅ CLOSED 2026-06-06 — Origin-check + per-IP RL ใน `proxy.ts`/`guardApi` (in-memory; Vercel per-instance = known-gap, Redis Phase 2) | CLOSED |
| 12 | OTP/rate-limit store in-memory | ย้าย Redis (Phase 2) | OPEN (Phase 2) |
| S-8 | SMS Order Link + Seller Wallet | backend B1-B4 + UI B5-B8 | **BUILT** — Phase 4 complete |
| P9 | `/u/{username}` cross-platform stats จริง + follow/chat backend | Phase 2 (FR-9.10, FR-9.11) — ปัจจุบัน placeholder + disabled | OPEN (Phase 2) |
| 13 | FB App ยัง Developer mode → login ได้เฉพาะ account ที่มี FB role | App Review `email` scope (เปิด public) | OPEN (ops carry) |
| 14 | `OnboardingModal.tsx` dead code หลัง onboarding ย้ายเป็น page | ลบ component + mount point บน dashboard | OPEN (cleanup carry) |
| 15 | username edit cooldown 30 วัน (หลัง onboarding) | feature อนาคต — ยังไม่มี cooldown enforcement | OPEN (Phase 2) |

### §7-SMS — สถานะ Paid SMS Order Link + Seller Wallet (ณ 2026-05-17)

**Phase 4 Build — COMPLETE (backend + UI)**

| ส่วน | สถานะ | หมายเหตุ |
|------|-------|---------|
| Prisma schema (4 model) | **DONE** `367f3c9` | SellerWallet, WalletTransaction, TopUpRequest, SmsCode |
| lib/sms.ts | **DONE** `4077133` | apitel; sender omit; RC-8 no-log |
| wallet.service | **DONE** `20b9b40` | getBalance/getTransactions/deductCredit |
| sms-code.service | **DONE** `e1808f6` | issueSmsCode/consumeSmsCode/markSmsCodeDelivery; hash-at-rest; single-use |
| topup.service | **DONE** `6833a2f`+`6ed858d` | create/approveTopUp (atomic)/rejectTopUp |
| GET /api/wallet | **DONE** | balance + transaction history |
| POST /api/wallet/topup | **DONE** | สร้าง TopUpRequest + slip |
| POST /api/orders/[token]/send-sms | **DONE** | daily-cap, atomic deduct+issue (credit-only, ไม่ต้อง L2) |
| GET/POST /api/admin/topups/[id]/approve|reject | **DONE** | RC-7 self-block |
| GET /api/o/sms/[code] | **DONE** | consume code → signed cookie → redirect UUID |
| seller /wallet page | **DONE** | balance card + TopUpRequestModal + WalletTransactionTable |
| admin /topups queue + detail | **DONE** `38b69f2` | TopUpQueueTable + RSC detail (slip+sidebar) + RC-7 self-block UI |
| lib/sms-unlock-cookie.ts | **DONE** | HMAC-signed httpOnly cookie (NEXTAUTH_SECRET) |
| lib/sms-consume-rl.ts | **DONE** | RC-1 per-IP globalThis 10/15min |

**Pending (Phase 5-7):** safepay-reviewer/security re-review; CSRF slip cookie path narrow; QA 3-level Chrome DevTools; phase-retro

---

## ลิงก์ที่เกี่ยวข้อง

| เอกสาร | ที่อยู่ |
|--------|--------|
| **SRS (technical detail)** | `docs/SRS.md` |
| Business Rules / Tier Lists | `docs/10 - Business Rules/Tier Lists.md` |
| UI Guideline | `docs/system/ui-guideline/README.md` |
| Conventions | `docs/conventions/` |
| Retros | `docs/retro/` |
| Plans / Specs | `docs/superpowers/plans/`, `docs/superpowers/specs/` |
| Schema | `prisma/schema.prisma` |
| Validations | `src/lib/validations.ts` |

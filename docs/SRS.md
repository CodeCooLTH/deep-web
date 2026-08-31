# Deep — Software Requirements Specification (SRS)

**เวอร์ชัน:** 1.0
**วันที่:** 11 มิถุนายน 2569
**ผู้จัดทำ:** Deep Team

> **เอกสารนี้คือ technical detail ของ PRD** — spec ระดับ software: FR ละเอียด, state machine, routing, NFR, tech stack, data model, API, enums, auth matrix, validation.
> Product-level (vision/stories/roadmap/metrics/business model): ดู `docs/PRD.md`

---

## §1 Functional Requirements (รายละเอียด)

> สรุป feature-level อยู่ใน PRD §3 — section นี้เป็น spec ฉบับเต็มรวมสูตร/acceptance criteria/สถานะ

### FR-1: Authentication & Session

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-1.1 | รองรับ Facebook OAuth Login — **buyer + seller** (`FacebookProvider` ใน `lib/auth.ts`); avatar ดึงจาก `graph.facebook.com/{id}/picture?type=large` (~200px); `next.config.ts` ขาว `graph.facebook.com`; `jwt` callback อัปเดต avatar ทุก login ถ้ารูปเปลี่ยน; username เริ่มต้น = `fb{facebookId}` | Must |
| FR-1.2 | รองรับ Phone OTP Login (SMS) — OTP store ปัจจุบัน in-memory (Redis = Phase 2) | Must |
| FR-1.3 | 1 user ผูก auth provider ได้หลายเจ้า (AuthAccount) — **ผูกเพิ่มภายหลังได้ที่ `/account`** ผ่าน link-intent cookie (HMAC, TTL 5 นาที) ไม่ใช่เฉพาะตอน signup อีกต่อไป (แก้ข้อความเดิมที่ล้าสมัยตั้งแต่ feature 00026) | Must |
| FR-1.3a | OAuth id ที่มีเจ้าของเป็น **บัญชีที่ยังลงทะเบียนไม่จบ** (ไม่มีเบอร์/รหัสผ่าน/ร้านที่ตั้ง slug/ออเดอร์/สมาชิกร้าน/OAuth เจ้าอื่น) หรือ **บัญชีที่ถูกปิดแล้ว** → เสนอให้ผู้ใช้ย้ายการเชื่อมมาบัญชีปัจจุบัน **ต้องถามยืนยันก่อนเสมอ ห้ามทำอัตโนมัติ** · บัญชีที่มีตัวตนจริง → ปฏิเสธ + บอกวิธีที่เจ้าตัวทำเองได้ · เกณฑ์ = `src/lib/link-conflict.ts::classifyLinkConflict()` (fail-closed) | Must |
| FR-1.3b | สมัครผ่าน OAuth ต้องไม่ล้มเมื่อชนคอลัมน์ `@unique` ของ `User` — `username` ชน → ตั้งชื่อใหม่ · `email` ชน → ไม่เก็บอีเมล · unique อื่น → throw. **ค่าทั้งสองมาจาก id ของผู้ให้บริการซึ่งคงที่ตลอดกาล และบัญชีที่ถูกปิดยังถือไว้จนกว่าจะถึงรอบล้างข้อมูล** ⇒ ชนได้แม้ไม่มีใครล็อกอินอยู่ | Must |
| FR-1.4 | Session แยกตาม subdomain (buyer / seller / admin) — host-scoped cookie ต่อ hostname | Must |
| FR-1.5 | Login แยกแต่ละ subdomain, logout ฝั่งหนึ่งไม่กระทบอีกฝั่ง | Must |
| FR-1.6 | **ตัดถาวร:** Email+Password, multi-provider linking หลัง signup | — |
| FR-1.7 | **Seller login:** username+password (provider `seller-credentials`, bcrypt) + Phone OTP ยืนยันเบอร์ตอนสมัคร + ตั้ง/ลืมรหัสผ่าน via OTP + Facebook | Must |
| FR-1.8 | **Session JWT:** มี `user.needsOnboarding` (= `!shopSlug \|\| !phone`) + `user.shopSlug`; proxy บังคับ redirect seller ที่ `needsOnboarding` → `/onboarding` ทุก route (ยกเว้น `/auth`, `/api`) | Must |
| FR-1.9 | **Onboarding page (บังคับ):** `seller.deepthailand.app/onboarding` — 5 step: phone (FB user ที่ไม่มีเบอร์) → ข้อมูลร้าน (displayName/category/username) → OTP ยืนยันเบอร์ → slug → สินค้าแรก (ข้ามได้). เมื่อ slug ผ่านแล้ว `needsOnboarding` เปลี่ยนเป็น false — ป้องกันเข้าซ้ำ | Must |
| FR-1.10 | **Phone immutable:** `User.phone` ตั้งครั้งเดียวผ่าน `POST /api/account/set-phone` เปลี่ยนไม่ได้ (enforce ที่ API — ถ้ามี `phone` แล้ว = 409); สร้าง L1 `PHONE_OTP` verification อัตโนมัติ; ไม่มี phone-edit ใน settings | Must |
| FR-1.11 | **FB หน้า callback:** `/auth/callback/facebook` — Paces spinner รอ session authenticated (~1.5s) แล้ว redirect `/dashboard`; ปุ่ม FB ใน sign-in/sign-up ใช้ `callbackUrl=/auth/callback/facebook` | Must |

**หมายเหตุ Facebook App:**
- prod เท่านั้น — FB OAuth ใช้ไม่ได้บน `deepth.local` (http; FB ต้องการ https)
- App ยังอยู่ Developer mode → login ได้เฉพาะ account ที่มี FB App role
- App Review scope `email` = อนาคต (เปิด public — carry)
- FB App secret regenerate pending (ops carry)

### FR-2: Verification (3 ระดับ)

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-2.1 | **Level 1: ยืนยันเบอร์โทร Phone OTP** (auto-approve) — ไม่ใช้ email OTP | Must |
| FR-2.2 | Level 2: เอกสารบุคคล (บัตรประชาชน + selfie) — admin review | Must |
| FR-2.3 | Level 3: เอกสารจดทะเบียนธุรกิจ — admin review | Must |
| FR-2.4 | Verification type enum กำหนดชัด: `PHONE_OTP`, `ID_DOC`, `BUSINESS_REG` | Must |
| FR-2.5 | Verification ที่ผ่าน → ได้ Verification Badge อัตโนมัติ | Must |
| FR-2.6 | **Admin อนุมัติ/ปฏิเสธ verification ของตัวเองไม่ได้** (self-review block) — guard ที่ `services/verification.service.ts:reviewVerification` (single source) | Must |
| FR-2.7 | **ระดับยืนยันของร้าน BUSINESS = เอกสารที่ผูก `shopId` ของร้านนั้น + `PHONE_OTP` L1 ของ *เจ้าของร้าน* (`Shop.userId`)** — เพราะ L1 เป็นข้อเท็จจริงของ "คน" จึงเขียน `shopId = null` เสมอ (ดูตาราง VerificationRecord). SSOT ของ where อยู่ที่ `src/lib/verification-scope.ts` ที่เดียว — **ห้ามเขียน where เองที่ call site** (ทั้ง `verification.service`, `trust-score.service::calcVerificationScore`, `badge.service::checkFullVerification`, หน้า `/b/[slug]` ต้องเรียกตัวนี้). 🛑 ต้องยึด **เจ้าของร้าน** ไม่ใช่ผู้ใช้ที่กำลังเปิดหน้าอยู่ — พนักงานที่ถูกเชิญ (`ShopMember`) ยืนยันเบอร์ตัวเองไม่ได้แปลว่าร้านยืนยันแล้ว. 🛑 ระดับ 2/3 **ไม่** สืบทอดจาก personal ของเจ้าของ (เป็นเอกสารของร้านโดยแท้). หาเจ้าของไม่เจอ → ถอยไป `{ shopId }` ล้วน **ห้ามถอยไป personal path** (จะกลายเป็นเอาการยืนยันของคนที่เปิดหน้าอยู่มาแสดงแทนของร้าน). เหตุผล: ก่อน 2026-08-11 ทุกจุดกรอง `shopId` ล้วน ⇒ ร้าน BUSINESS **ทุกร้าน** ขึ้น "Level 0 · ยังไม่ได้ยืนยัน" ตลอดกาล, เสียคะแนน verification 10 คะแนน และเหรียญ Fully Verification เป็นไปไม่ได้เลย (ยืนยันกับ prod: BUSINESS 3/3 ร้านโดนทั้งหมด) | Must |
| FR-2.8 | 🛑 **ทิศตรงข้ามก็ผิด: ห้ามกรองด้วย `userId` เปล่า ๆ โดยไม่มีเงื่อนไข `shopId`** — เจ้าของหนึ่งคนถือได้หลายร้าน (prod มีคนถือ 4 ร้าน) เอกสาร L2/L3 ที่อัปให้ร้านหนึ่งจะไหลไปนับเป็นระดับของอีกร้านทันที = **อ้างความน่าเชื่อถือที่ยังไม่จริงบนหน้าที่ผู้ซื้อใช้ตัดสินใจโอนเงิน** ซึ่งอันตรายกว่าทิศที่นับน้อยไปมาก. เคยผิดพร้อมกัน 3 จุด (`/o/[token]` ทั้งสาขา guest และล็อกอินแล้ว · `/u/[username]` · `order.service::getOrderSummaryForSignIn` ที่ป้อน `OrderLinkShell`) — **ไม่เคยระเบิดเพราะฐานยังไม่มีแถว L2/L3 เลยสักแถว ไม่ใช่เพราะโค้ดถูก**. บังคับด้วยเทส `[blocker]` `src/lib/__tests__/verification-where-callers.test.ts` ที่สแกนทั้ง `src/` แล้วบังคับให้ทุกผู้เรียก `prisma.verificationRecord.find*` ผ่าน SSOT — ข้อยกเว้นต้องขึ้นทะเบียนใน `ALLOWED` พร้อมเหตุผล (ปัจจุบัน 6 รายการ ล้วนเป็น "คำถามคนละชนิด" เช่นคิวแอดมิน, ด่านสิทธิ์ไฟล์ KYC, ด่านกันสร้างซ้ำฝั่งเขียนใน `lib/auth.ts`) | Must |

### FR-3: Trust Score

สูตรจริง = **raw additive points** (ไม่ใช่ % weighting) cap ต่อ component, รวม 0–100:

| Component | สูตร | Cap |
|-----------|------|-----|
| Verification | 0 / 10 / 25 / 35 ตามระดับสูงสุดที่ผ่าน | 35 |
| Orders | `min(25, √(completedCount) × 2.5)` | 25 |
| Rating | `(avgRating − 1) × 5` — **0 ถ้า review < 3** | 20 |
| Age | `min(10, accountAgeDays / 365 × 10)` | 10 |
| Badges | `min(10, badgeCount)` | 10 |

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-3.1 | คำนวณตามสูตร raw additive ด้านบน (sum 5 component, รวม 0–100) | Must |
| FR-3.2 | ระดับ: A+ (90-100), A (80-89), B+ (70-79), B (60-69), C (40-59), D (0-39) | Must |
| FR-3.3 | **Rating floor:** ถ้า review < 3 → rating component = 0 + ต้องมี UX copy อธิบาย seller ชัดเจน (กัน beta confusion) | Must |
| FR-3.4 | Recalculate เมื่อ: order CONFIRMED, review ใหม่, verification approved, badge ใหม่ | Must |
| FR-3.5 | Snapshot ใน TrustScoreHistory ทุกครั้งที่คำนวณ | Must |
| FR-3.6 | MVP: Trust Score มีแต่ขึ้น ยังไม่หักคะแนน — บังคับที่ระดับเขียน DB ด้วย `Math.max(เดิม, computed)` ใน `trust-score.service.ts` **(กำลังจะถูกถอดออกโดย 00040 ดู FR-3.7)** | Must |
| FR-3.7 | 🛑 **[วางแผนแล้ว ยังไม่ implement — feature 00040 Trust Score v2, มติเคาะ 2026-08-10]** คำนวณสดทุกครั้ง ไม่มีพื้นกันคะแนนตก · Orders component = `max(rolling 90 วัน, lifetime × 0.4)` โดยหน้าต่าง 90 วันต้องนับจาก `OrderEvent.occurredAt` **ห้ามใช้ `Order.createdAt`** (ผู้ขายพิมพ์เองได้ตั้งแต่ 00033) **และห้ามใช้ `Order.updatedAt`** (ขยับทุกครั้งที่แก้ไขออเดอร์) · penalty จากอัตรายกเลิกฝั่งร้านเท่านั้น ผ่าน `computeCompletionRate()` ของ 00039 ตัวเดียวกัน ห้ามเขียนสูตรซ้ำ · clamp 0–100 · เหรียญยังติดตัวถาวร (FR-4.4 ไม่เปลี่ยน) · ต้องมีหน้า "ทำไมคะแนนเปลี่ยน" คู่กันเสมอ. รายละเอียด/มติ D-1..D-9 → `docs/20 - Features/00040 - Trust Score v2/` | Must |

### FR-4: Badge

แบ่ง **3 ประเภท** ชัดเจน:

1. **Verification badge** — auto เมื่อผ่าน verification แต่ละระดับ
2. **Achievement badge** — auto-evaluate **ผ่าน data-driven engine** (criteria JSON authoritative). มีทั้งฝั่ง **Seller และ Buyer**
3. **Paid badge (Verified Badge)** — ซื้อ subscription (Phase 2, ~฿299/เดือน), ติดหลังชื่อร้าน/profile แบบ Meta/Twitter. **แยกขาด — ไม่นับเข้า trust score, ไม่ใช่ผลของ KYC**

**Achievements system (MVP):**
- ทุก achievement มี `audience` = SELLER / BUYER / ANY
- **ติดตัวถาวร (sticky)** — ครบเงื่อนไขเมื่อไหร่ได้รับทันทีและ **ไม่ถูก revoke** แม้เงื่อนไขเปลี่ยนภายหลัง (เช่น avg rating ตกทีหลัง badge ยังอยู่) — เดิมให้เหตุผลว่า "สอดคล้องหลัก Trust มีแต่ขึ้น" 🛑 **เหตุผลนั้นใช้ไม่ได้อีกต่อไปหลัง 00040** (คะแนนรวมลดได้แล้ว ดู FR-3.7) **แต่กติกาข้อนี้ไม่เปลี่ยน** — จำนวนเหรียญและคะแนนที่แต่ละเหรียญให้ยังคงไม่มีวันลด สิ่งที่ลดได้คือคะแนนรวมจากองค์ประกอบอื่นเท่านั้น
- รองรับ **event/time-bound achievement** เช่น `2026_BADGE` (สมัครภายในปี 2026 — ประเมินตอน signup, ค่าคงที่), `FIRST_ORDER_REVIEWED` (seller ได้เมื่อมี order CONFIRMED แรก)
- แต่ละ badge มี field `icon` (เพิ่ม asset ภายหลังได้ — nullable, มี fallback)
- **Badge Process** — ผู้ใช้เห็น progress ต่อ badge ที่ยังไม่ได้ ("อีก N order / N วัน จะได้ badge นี้")

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-4.1 | Verification badge: auto เมื่อผ่าน verification | Must |
| FR-4.2 | Achievement badge: auto-evaluate, มีฝั่ง Seller + Buyer (audience field) | Must |
| FR-4.3 | **Badge engine data-driven** — admin แก้ criteria JSON แล้วมีผล runtime จริง (ปัจจุบัน hardcode ตาม nameEN = tech-debt ต้อง rework, ดู PRD §7) | Must |
| FR-4.4 | **Badge ติดตัวถาวร** — ได้แล้วไม่ revoke (sticky award table) | Must |
| FR-4.5 | รองรับ event/time-bound achievement (signup-year, first-order ฯลฯ) นอกเหนือ 10 achievement seller เดิม | Must |
| FR-4.6 | แต่ละ badge มี `icon` (deferred asset, มี fallback icon) | Must |
| FR-4.7 | **หน้า Badge Process** (`/badges` ฝั่ง buyer + seller, self-only) — list badge ทั้งหมด + สถานะ (ได้แล้ว / progress เหลืออีกเท่าไหร่). **progress แสดงเฉพาะหน้า self นี้** | Must |
| FR-4.8 | Public profile แสดงเฉพาะ badge **ที่ได้แล้ว** หมวด seller-context (verification + seller achievement + paid, แยกหมวด paid ≠ trust). **ไม่แสดง progress; ไม่แสดง buyer-audience achievement** | Must |
| FR-4.9 | Paid Verified Badge — Phase 2 | Phase 2 |

**Achievement Badges — core seller (10):**

> 🛑 **SSOT ของรายการ badge จริง = `prisma/badge-seed-data.ts`** (data-driven engine ดึงจาก DB, dispatch ตาม `criteria.type`). ตารางนี้เป็น core seller 10 ใบเดิม. Badge เพิ่มเติมที่ seed แล้วแต่ไม่อยู่ในตารางนี้:
> - **Stepping-stone seller (P1, 7 ใบ):** Getting Started/Rising Seller/Well Rated/Getting Noticed/Spotless 100/3 Months Strong/Same-Day Hero (threshold ต่ำกว่า 10 ใบเดิม)
> - **Event/time-bound:** 2026_BADGE (สมัครปี 2026)
> - **Auction (feat 00002, ทั้ง Seller + Buyer):** สเปกเต็มที่ [00002 BRD §11.2](<20 - Features/00002 - Seller Auction/BRD.md>) — MVP 6 ใบ + Phase 2 5 ใบ (seeded 2026-07-02: Auction Pro 50/Bid Magnet/Active Bidder/Winner's Circle/Auction Completer)

| #   | Badge              | ชื่อไทย         | เงื่อนไข                                                                                    |
| --- | ------------------ | --------------- | ------------------------------------------------------------------------------------------- |
| 1   | First Sale         | เปิดหน้าร้าน    | order CONFIRMED แรก                                                                         |
| 2   | Trusted Seller 50  | ร้านค้ายอดนิยม  | CONFIRMED ครบ 50                                                                            |
| 3   | Century Club       | ร้อยออเดอร์     | CONFIRMED ครบ 100                                                                           |
| 4   | Perfect Rating     | ร้านคะแนนเต็ม   | avg 5.0 (≥10 reviews)                                                                       |
| 5   | Highly Rated       | ร้านคะแนนสูง    | avg ≥4.8 (≥20 reviews)                                                                      |
| 6   | Zero Complaint     | ไร้ข้อร้องเรียน | CONFIRMED 50 + **ไม่มี seller-initiated cancel** (buyer-initiated cancel ไม่นับ)            |
| 7   | Veteran            | ร้านค้าเก่าแก่  | สมาชิกครบ 1 ปี + active (order ใน 30 วัน)                                                   |
| 8   | Speed Demon        | จัดส่งสายฟ้า    | avg เวลา PENDING → SHIPPED ≤ 24 ชม. (≥20 orders, ใช้ shipmentTracking.createdAt เป็น proxy) |
| 9   | Fully Verified     | ยืนยันครบ       | ผ่าน verification L1+L2+L3                                                                  |
| 10  | Community Favorite | ขวัญใจชุมชน     | reviewer ≥50 คน (**unique reviewerUserId เท่านั้น — anonymous review ไม่นับ**)              |

### FR-5: Product (Capability Model)

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-5.1 | Seller สร้าง/แก้/ลบสินค้า (ชื่อ, shortDescription ≤200, description ≤5000, ราคา, รูป ≤10, tags, attributes, isActive) | Must |
| FR-5.2 | **4 ชนิด:** PHYSICAL / DIGITAL / SERVICE / **SUBSCRIPTION** | Must |
| FR-5.3 | **Capability axes:** `fulfillmentMode` (SHIPPED / NO_SHIPPING), `billingMode` (ONE_TIME / RECURRING), `billingPeriod` + `billingPeriodDays` | Must |
| FR-5.4 | Type เป็น preset ของ capability, override ขั้น advanced ได้ (ดู spec `docs/superpowers/specs/2026-05-10-product-types-capability-design.md`) | Must |
| FR-5.5 | เลือกสินค้าจาก catalog ตอนสร้าง order หรือพิมพ์เอง (one-off, productId optional) | Must |
| FR-5.6 | Backward-compat: product เดิม (PHYSICAL) ทำงานต่อได้ | Must |

### FR-6: Simple OMS

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-6.1 | Seller สร้าง order → public link `/o/{token}` | Must |
| FR-6.2 | Buyer เปิดลิงก์ → เห็นข้อมูล order + trust score ร้าน | Must |
| FR-6.3 | **Confirm = phone-unlock** — buyer กรอกเบอร์ให้ตรง → unlock → กดยืนยัน. **ไม่มี OTP confirm** | Must |
| FR-6.4 | Order status = state machine (ดู §2) | Must |
| FR-6.5 | **Ship guard = `fulfillmentMode === SHIPPED`** (ไม่ใช่ type===PHYSICAL). `shippingAddress` จำเป็นเมื่อ SHIPPED และ **ต้อง persist** ผ่าน CreateOrderSchema | Must |
| FR-6.5a | **ร้านที่ไม่ส่งของไม่มีทางได้ออเดอร์ SHIPPED** — `shopShipsGoods(Shop.vertical)` (`src/lib/shipping-address-status.ts`; false เมื่อ `SERVICE_QUEUE`/`LODGING`) กั้นการคำนวณ `fulfillmentMode` **ทั้งก้อน** ทั้งใน `createOrder` และ `updateOrder` — กั้นทั้งเกณฑ์ "รายการพิมพ์เอง + type=PHYSICAL" และเกณฑ์ "มีสินค้าที่ `Product.fulfillmentMode=SHIPPED`". ธงบนสินค้าไม่ใช่หลักฐานว่าร้านส่งของ (ค้างได้จากร้านที่เปลี่ยน vertical ทีหลัง). ผลพ่วง: ร้านกลุ่มนี้ไม่โดนบังคับ `shippingAddress` และ Quick-Create ต้องไม่เขียน `SHIPPED` ลงสินค้าที่สร้างให้อัตโนมัติ. ฟอร์มฝั่งจอ (`OrderCreateForm`) ใช้เกณฑ์เดียวกันเป๊ะ — ช่องที่อยู่ยังแสดงอยู่ กรอกเก็บไว้ได้ แค่ไม่บังคับ | Must |
| FR-6.6 | NO_SHIPPING (digital/service/subscription) → PENDING แล้วยืนยันได้เลย | Must |
| FR-6.7 | Snapshot ชื่อ/ราคาลง OrderItem (ไม่ผูกตรง product) | Must |
| FR-6.8 | **SMS Order Link (paid):** ลิงก์ที่ส่งผ่าน SMS จาก seller ที่ verify แล้ว ฝัง **phone-bound token → buyer ข้าม phone-unlock อัตโนมัติ**; ลิงก์ที่ seller แชร์เอง (manual) ยังต้อง phone-unlock | Must |
| FR-6.9 | หักเครดิตจาก wallet ฿1/SMS ตอนกดส่ง (ดู PRD §6 Business Model) | Must |
| FR-6.10 | SUBSCRIPTION: แต่ละ cycle = order ย่อย เดิน PENDING→CONFIRMED ของตัวเอง (recurring dashboard + billing — P4) | Must |
| FR-6.11 | **วิธีชำระเงิน (paymentMethod) ต้อง persist ใน Order** — seller เลือก/บันทึกตอนสร้าง order; แสดงทั้ง order detail (seller) และหน้า buyer link. วิธีที่ต้องแนบสลิป (เช่น โอนเงิน/พร้อมเพย์) vs ไม่ต้อง (เช่น COD/เงินสด) ควบคุมโดย `requiresSlip` flag ตาม `paymentMethod` | Must |
| FR-6.12 | **Payment slip upload โดย buyer** — buyer ที่ผ่าน phone-unlock แนบสลิปการชำระเงินได้ที่ `/o/{token}` (optional; แสดงปุ่มเฉพาะ PENDING + `paymentMethod` ที่ `requiresSlip=true`); seller ตรวจสลิปได้ใน order detail ฝั่ง seller. 1 order = 1 slip (ถ้าแนบซ้ำ = replace) | Must |
| FR-6.13 | **Buyer cancel เฉพาะ PENDING** — buyer ที่ผ่าน phone-unlock สามารถยกเลิก order ได้เฉพาะสถานะ `PENDING`; เมื่อ status = `SHIPPED` ปุ่มยกเลิกหาย เหลือแต่ปุ่มยืนยันรับของ; `CONFIRMED`/`CANCELLED` = terminal. guard ทั้ง UI + API. `cancelInitiator='buyer'` ไม่กระทบ Zero Complaint | Must |
| FR-6.14 | **เลือกวันที่คำสั่งซื้อย้อนหลัง (feature 00033)** — seller ระบุ `Order.createdAt` เองได้ตอนสร้าง/แก้ไข order (ย้อนหลัง 90 วัน / ล่วงหน้า 7 วัน) ค่านี้กำหนดเลขออเดอร์ (`orderNo`), ลำดับรายการ, และยอดขายทุกหน้าที่นับตามวันที่. เวลาจริงที่กดสร้าง/แก้ไขไม่ถูกบิดเบือนตาม — บันทึกแยกใน `OrderEvent.occurredAt` เสมอ (ดู §6.2, §8.1b) รายละเอียดเต็ม: `docs/20 - Features/00033 - Backdated Order Date/` | Must |

| FR-6.15 | **เปิดหน้าออเดอร์ให้ผู้ที่ยังไม่ล็อกอินเห็นแบบจำกัด (feature 00041, มติ D-1)** — เดิม `/o/{token}` redirect ไป sign-in ทันที ผลจริงบน prod คือ **0/73 ใบมีผู้ซื้อเข้ามาเลย**. ตอนนี้ guest เห็น: สถานะ, รายการสินค้า, ยอดรวม, เลขพัสดุ+timeline, หลักฐานร้าน (ระดับยืนยัน/ยอดออเดอร์สำเร็จ/คะแนน/ช่องทางที่เชื่อม/รีวิวจริง) และ **ข้อมูลผู้รับที่ปิดบังแล้ว** (จังหวัดเต็ม + 3 ตัวท้ายของท่อนอื่น, เบอร์ `•••-•••-891`) 🛑 **ทุก action ที่ผูกตัวตนยังบังคับ login เหมือนเดิมทุกประการ** — ที่เปลี่ยนคือ "ก่อน login เห็นอะไรได้บ้าง" เท่านั้น. ชุดข้อมูลที่ส่งข้ามไป client เป็น **allow-list** ที่ `guest-order-data.ts` (ฟิลด์ใหม่ต้องมาเพิ่มที่นั่นโดยตั้งใจ ไม่ใช่ไหลตามไปเอง) | Must |
| FR-6.16 | **feature 00041** — การปิดบังต้องมีคำอธิบายบนหน้าจอเสมอ: จุดไข่ปลาที่ไม่มี legend อ่านได้ว่า "เว็บนี้ปิดบังอะไรอยู่" ไม่ใช่ "กำลังปกป้องฉัน" ซึ่งกลับหัวกับเจตนา — ผู้ใช้กลุ่มนี้คือคนที่กลัวมิจฉาชีพอยู่แล้ว | Must |

### FR-7: Review

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-7.1 | Buyer review + rating (1-5) ได้ตั้งแต่ order = CONFIRMED (รวมหลัง SHIPPED ก่อน CONFIRMED ถ้ามี — ตามจริงโค้ดอนุญาต CONFIRMED ขึ้นไป) | Must |
| FR-7.2 | 1 order = 1 review (unique constraint บน orderId; error message ผู้ใช้เป็นไทย) | Must |
| FR-7.3 | Buyer ไม่สมัคร → เก็บ `reviewerContact`. **anonymous review นับเข้า rating แต่ไม่นับ unique-reviewer ของ Community Favorite** | Must |
| FR-7.4 | แสดง reviews บน public profile | Must |
| FR-7.5 | **feature 00041** — ผู้ซื้อแก้ไข/ลบรีวิวของตัวเองได้ภายใน **24 ชม.** SSOT ของหน้าต่าง = `src/lib/review-window.ts` (ห้าม hardcode เลข 24 ที่อื่น) 🛑 นับจาก `createdAt` ของใบแรกเสมอ **ไม่ใช่ `updatedAt`** — นับจากเวลาที่แก้ล่าสุดจะยืดหน้าต่างได้ไม่รู้จบ = เท่ากับไม่มีหน้าต่าง. หมดเวลาแล้วปุ่มหายไปเฉย ๆ ไม่ขึ้นข้อความว่า "หมดเวลาแล้ว" (รีวิวยังแสดงปกติ ไม่มีอะไรผิดพลาดที่ต้องแจ้ง) | Must |
| FR-7.6 | **feature 00041** — ลบรีวิวเป็น **soft delete** และ **ลบแล้วเขียนใหม่สำหรับออเดอร์เดิมไม่ได้อีก** (ดูเหตุผลที่ §6.2 Review) ต้องบอกผู้ใช้ในกล่องยืนยันก่อนกด ไม่ใช่ให้ไปเจอทางตันหลังกด | Must |
| FR-7.7 | **feature 00041** — แนบรูปในรีวิวได้ ≤4 ใบ ผ่าน direct upload (`@/lib/upload-client`) ห้ามส่งผ่าน body ของ API route | Must |
| FR-7.8 | **feature 00041** — ร้านตอบกลับรีวิวได้ 1 คำตอบต่อ 1 รีวิว ตอบซ้ำ = เขียนทับ **ไม่มีเงื่อนไขเวลา** (ต่างจากผู้ซื้อ) สิทธิ์ = เจ้าของร้าน หรือ `ShopMember(role='ADMIN')` ตรวจที่ service ทุกครั้ง ไม่ใช่แค่ซ่อนปุ่ม (BR-BOE-07) 🛑 คำตอบแสดงต่อสาธารณะบนหน้าออเดอร์ของผู้ซื้อ — หน้าจอที่ให้เขียนต้องบอกเรื่องนี้ *ก่อน* กดบันทึก | Must |
| FR-7.9 | **feature 00041** — คำตอบของร้านใช้โทน info ไม่ใช่เขียว: เป็นคำพูดของร้าน ไม่ใช่ข้อเท็จจริงที่ระบบยืนยันได้ (Verified-Means-Green) และไม่มี badge "ตอบแล้ว" สีเขียวรายแถว — คำตอบที่แสดงอยู่คือหลักฐานในตัวมันเอง | Should |

### FR-8: Buyer History Linking

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-8.1 | Buyer ไม่สมัคร → เก็บ buyerContact (phone/email) ทั้งใน order และ reviewerContact | Must |
| FR-8.2 | สมัครภายหลัง → auto-link: phone match (phone-OTP signup) / email match (FB signup) | Must |
| FR-8.3 | History ย้อนหลังแสดงครบทันทีหลัง link | Must |
| FR-8.4 | **Known limitation:** FB user ที่ไม่มี email → ไม่ auto-link (ดู PRD §7) | — |

### FR-9: Public Profile (Seller-centric)

> **Redesign (2026-05-23):** หน้า `/u/{username}` ถูก rebuild เป็น single-column Instagram-style card (max-width 640px) ตาม mockup ที่ user อนุมัติ. Spec เต็ม: `docs/superpowers/specs/2026-05-23-shop-public-profile-design.md`. Section ที่ตัดออกจากหน้า public (ตาม mockup): About card, Verification list, Reviews list — ย้ายให้ดูได้เฉพาะหน้า self

| ID      | ข้อกำหนด                                                                                                                                                                                              | Priority | สถานะ |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-9.1  | ทุกคนมี `/u/{username}`                                                                                                                                                                               | Must     | **DONE** |
| FR-9.2  | แสดง: trust score, badges (seller-context เท่านั้น — SELLER/ANY audience), จำนวน order สำเร็จ, avg rating (≥3 reviews), completion rate                                                               | Must     | **DONE** |
| FR-9.3  | ถ้าเป็นร้าน → แสดงข้อมูลร้าน (ชื่อร้าน, bio/Shop.description, location/Shop.address, วันเข้าร่วม)                                                                                                  | Must     | **DONE** |
| FR-9.4  | เข้าดูได้โดยไม่ต้อง login (session=null ไม่ redirect)                                                                                                                                               | Must     | **DONE** |
| FR-9.5  | บัญชี buyer-only (isShop=false) → แสดง trust + verification badge + empty-state ชวนเปิดร้าน. **ไม่แสดง review-as-buyer; ไม่แสดง buyer-audience achievement** (buyer badge ดูได้เฉพาะหน้า self `/badges`) | Must     | **DONE** |
| FR-9.6  | **Trust Banner** — แสดง Deep tier name + cover ตาม trust level. **5-tier ตาม SSOT `docs/10 - Business Rules/Tier Lists.md`** (6 letter grade → 5 tier): A+ = **Deep Star** (ม่วง), A = **Deep Diamond** (ฟ้า), B+ = **Deep Gold** (ทอง), B = **Deep Silver** (เทา), C+D = **Deep Classic** (ส้ม, entry). ผูก `getTrustLevel(user.trustScore)` + helper `src/lib/trust-tier.ts`. ห้าม hardcode mapping ใหม่ — ยึด Tier Lists.md | Must     | **DONE** |
| FR-9.7  | **Product Grid** — แสดง active products ≤9 (isActive=true, เรียง createdAt desc) ใน grid 3-col square; tile = รูปแรกจาก images[] + hover ชื่อ+ราคา; ร้านไม่มี active product → empty state ไม่ crash; buyer-only → ซ่อน section | Must     | **DONE** |
| FR-9.8  | **avgRating bug fix** — คำนวณจาก review **ทั้งหมด** ผ่าน `prisma.review.aggregate` (ไม่ใช้ `take=10` แบบเดิม); แสดงเฉพาะเมื่อ reviewCount ≥ 3 | Must     | **DONE** |
| FR-9.9  | **Verified chip** — แสดงเมื่อ maxVerifyLevel ≥ 1 (สีตาม level: L1=info, L2=success, L3=primary); ไม่มี verification → ซ่อน chip (ไม่แสดง "ยังไม่ยืนยัน") | Must     | **DONE** |
| FR-9.10 | **Cross-platform stats + On-time/Response time** — แสดงเป็น **placeholder ตัวอย่าง (hardcode)** พร้อมป้าย "ตัวอย่าง" ชัดเจน — **Phase 2:** เชื่อม real cross-platform API + deliveryDeadline tracking จริง | Phase 2 | PLACEHOLDER |
| FR-9.11 | **Follow + Chat FAB** — ปุ่ม disabled + tooltip "เร็ว ๆ นี้" — **Phase 2:** ต้องมี backend follow system + chat | Phase 2 | DISABLED |
| FR-9.12 | **ตัวจัดหน้าร้าน (feature 00035)** — ผู้ขาย (OWNER/ADMIN ของร้าน) จัดลำดับแท็บของหน้าโปรไฟล์ตัวเองได้ผ่าน `/public-profile/builder` (`ShopPageLayout.tabOrder`) — จัดได้แค่ **"ลำดับ"** เท่านั้น ปิด/ลบแท็บออกไม่ได้ (BR-PGB-01, D-9) แท็บที่ไม่มีข้อมูลจริงยังไม่ถูก render เหมือนเดิม (`computeVisibleTabKeys`/`applyTabOrder` — `src/lib/profile-tab-keys.ts`) | Must | **DONE** |
| FR-9.13 | **บล็อกเหนือแถบแท็บ (feature 00035)** — เพิ่มได้ 2 ชนิด: **เหรียญตราเด่น** (`UserBadge` ที่ `Badge.type='ACHIEVEMENT'` เท่านั้น สูงสุด 4 ใบ มีได้ 1 บล็อกต่อร้าน) และ **โพสต์ Facebook รายโพสต์** (มีได้หลายแถว โพสต์เดียวกันเพิ่มซ้ำในร้านเดียวกันไม่ได้) — เก็บใน `ShopPageBlock`; ต้นทางที่ถูกลบ (เหรียญถูกถอด/โพสต์หาย) หลุดออกจากผลลัพธ์เงียบ ๆ ไม่ทำหน้าร้านพัง | Must | **DONE** |
| FR-9.14 | **สวิตช์เผยแพร่หน้าร้าน (feature 00035)** — `ShopPageLayout.isPublished` ปิดแล้วผู้เยี่ยมชมทั่วไปเห็นหน้า "ปิดการแสดงผลชั่วคราว" (`ProfileUnavailable`, คืน 200 ไม่ใช่ 404) แต่เจ้าของ/ทีมงานร้านยังเห็นหน้าจริงเสมอ (`canAccessShop`); ร้านเดิมทุกร้านที่ไม่เคยตั้งค่านี้ = เผยแพร่โดย default (zero-regression) | Must | **DONE** |

> **feature 00035 (ตัวจัดหน้าร้าน):** รายละเอียดเต็ม `docs/20 - Features/00035 - Shop Page Builder/` (PRD/BRD/SRS/SDS/DATABASE/API/TestCase) — SRS/API/Data Model ที่นี่เป็น summary sync เท่านั้น

### FR-10: Admin Panel

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-10.1 | Dashboard 8 metrics ครบ (ดู PRD §5) | Must |
| FR-10.2 | User management: list, filter, trust score | Must |
| FR-10.3 | Verification review: ดูเอกสาร, approve/reject + self-review block (FR-2.6) | Must |
| FR-10.4 | Order monitoring: filter ตามสถานะ | Must |
| FR-10.5 | Badge management: เพิ่ม/แก้ + criteria มีผล runtime (FR-4.3) | Must |
| FR-10.6 | Admin auth แยก subdomain. การได้สิทธิ์ admin = ตั้ง `isAdmin=true` ผ่าน DB seed (ไม่มี self-service) | Must |

---

## §2 Order Status State Machine

### 2.1 State Diagram

```
มีจัดส่ง (fulfillmentMode = SHIPPED):
  PENDING ──seller ใส่ tracking──▶ SHIPPED ──buyer กดรับของ──▶ CONFIRMED ✅ (นับ trust/badge)

ไม่จัดส่ง (NO_SHIPPING: digital / service / subscription):
  PENDING ──buyer กดยืนยัน──▶ CONFIRMED ✅ (นับ trust/badge)

ยกเลิก (เฉพาะก่อน CONFIRMED):
  PENDING / SHIPPED ──seller ยกเลิก──▶ CANCELLED
  PENDING ──buyer ยกเลิก──▶ CANCELLED   ← buyer ยกเลิกได้เฉพาะ PENDING เท่านั้น
```

| สถานะ | คำอธิบาย | ใครเปลี่ยน |
|-------|---------|-----------|
| PENDING | สร้าง order แล้ว รอ buyer ยืนยัน (phone-lock เป็น sub-state ของ PENDING ไม่ใช่ status เต็ม) | Seller (สร้าง) |
| SHIPPED | seller ใส่ tracking แล้ว (เฉพาะ fulfillmentMode=SHIPPED) | Seller |
| CONFIRMED | buyer ยืนยันรับของ/ยืนยัน order — **terminal สำเร็จ ชื่อเดียวทั้งสอง path** | Buyer |
| CANCELLED | ยกเลิกก่อน CONFIRMED — เก็บ `cancelInitiator` (seller \| buyer) | Seller / Buyer |

**กติกา:**
- terminal เดียว = `CONFIRMED` (ไม่มี COMPLETED / DELIVERED / BUYER_CONFIRMED แยก — เพื่อความง่ายและไม่ให้ seller กด 2 จังหวะ)
- trust score / achievement badge / Zero Complaint นับที่ `CONFIRMED`
- **Zero Complaint:** นับเฉพาะ **seller-initiated cancel** — buyer-initiated cancel ไม่ลงโทษ seller
- **Buyer-cancel rule:** buyer ยกเลิกได้เฉพาะ status = `PENDING` เท่านั้น; เมื่อ SHIPPED แล้ว buyer ยกเลิกไม่ได้ (เหลือแค่ "ยืนยันรับของ"); CONFIRMED/CANCELLED = terminal
- ยกเลิกหลัง CONFIRMED ไม่ได้ (terminal). MVP **ไม่มี dispute system** (Phase 2)
- SUBSCRIPTION: แต่ละรอบบิล (cycle) สร้าง order ย่อยที่เดิน PENDING→CONFIRMED ของตัวเอง

### 2.2 Data Visibility — Order Link (`/o/{token}`)

| ผู้เข้าชม | เห็นอะไร |
|----------|---------|
| ทั่วไป (ก่อน unlock) | ข้อมูลสินค้า, ราคา, trust score ร้าน + ช่องกรอกเบอร์ (phone-lock) |
| Buyer (unlock แล้ว / มาจาก SMS phone-bound) | รายละเอียดเต็ม + ปุ่มยืนยัน (PENDING/SHIPPED) + **ปุ่มแนบสลิป (PENDING เท่านั้น, optional)** + **ปุ่มยกเลิก (PENDING เท่านั้น)** |
| Seller (เจ้าของ) | ทุกอย่าง + ข้อมูล buyer + ปุ่มจัดการสถานะ |

---

## §3 Page Map & Routing

### 3.1 Subdomain Strategy

| Subdomain (prod / dev) | ใช้สำหรับ | Session |
|---|---|---|
| `deepthailand.app` / `deepth.local:4000` | Public + Buyer | Buyer session |
| `seller.deepthailand.app` / `seller.deepth.local:4000` | Seller (ต้องเปิดร้าน) | Seller session |
| `admin.deepthailand.app` / `admin.deepth.local:4000` | Admin | Admin session |

Account เดียวกัน login/session แยกตาม subdomain (host-scoped cookie). routing ใน `src/proxy.ts`.

### 3.2 Public (`deepthailand.app`)

| Page | Path |
|------|------|
| Landing | `/` |
| Pricing | `/pricing` |
| Sign-in / Sign-up / Verify OTP | `/auth/sign-in`, `/auth/sign-up`, `/auth/verify-otp` |
| FB OAuth callback loading page | `/auth/callback/facebook` — Paces spinner รอ session → redirect /dashboard |
| Public Profile (ร้าน PERSONAL/ทุกคน) | `/u/{username}` |
| Public Profile (ร้าน BUSINESS) | `/b/{slug}` — component เดียวกับ `/u/{username}` (`ShopProfile.tsx`, feature 00028; entry นี้ sync เข้า SRS พร้อมงาน 00035 เพราะทั้งคู่ใช้ publish gate/draft mode เดียวกัน) |
| Public Order (UUID) | `/o/{token}` |
| Public Order (SMS short-code) | `/o/{12-char-code}` → redirect ผ่าน `/api/o/sms/{code}` → `/o/{uuid}` |
| SMS Link Invalid / Error | `/o/link-invalid` |
| Privacy Policy | `/privacy` — public, ไม่ต้อง login, static Server Component — Meta App Review (Privacy Policy URL) |
| Data Deletion Instructions | `/data-deletion` — public, ไม่ต้อง login, static Server Component — Meta App Review (User Data Deletion URL); request via email, ดำเนินการภายใน 30 วัน |
| Terms of Service | `/terms` — public, ไม่ต้อง login, static Server Component — Meta App Review (Terms of Service URL); ข้อกำหนดการใช้บริการ 10 หัวข้อ |

> **feature 00035 (ตัวจัดหน้าร้าน) — โหมด draft preview:** `/u/{username}?builderDraft=1` และ `/b/{slug}?builderDraft=1` mount `BuilderPreviewBridge` (ฟัง `postMessage` จาก builder iframe) **เฉพาะเมื่อผู้เปิดเป็นเจ้าของ/ทีมงานร้าน** (`canAccessShop`) — query param เองไม่มีผลด้าน authorization ใด ๆ ผู้เยี่ยมชมทั่วไปเดา URL เดียวกันเห็นหน้าปกติเป๊ะ (ไม่มี Bridge ห่อ). `generateMetadata` ใส่ `robots:{index:false,follow:false}` เฉพาะ URL รูปแบบนี้ (ไม่ผูกกับสิทธิ์ — กัน search engine เก็บ URL พรีวิวไว้เฉย ๆ)

> **feature 00060 (แผนการตรวจสอบร้านค้า) — Draft, ยังไม่ implement:** เมื่อ implement แล้ว `/u/{username}`
> และ `/b/{slug}` จะมีบล็อกผลตรวจ + ไทม์ไลน์เพิ่ม (อ่านผ่าน RSC/service call ตรง **ไม่มี public API
> endpoint** — ดู §7.19) แสดงเฉพาะร้าน `vertical='LODGING'` ที่เคยสมัครแผน (มีแถว `InspectionPlan`)
> เป็นบล็อกคนละคำจาก Trust Tier เสมอ (ห้ามยืมคำ/ผสมคะแนน — ดู `CONTEXT.md` หัวข้อ "ความน่าเชื่อถือ:
> สองแกน") หลักฐานที่ `visibility='PRIVATE'` ต้องไม่หลุดเข้า flight payload ของหน้านี้ไม่ว่ากรณีใด

### 3.3 Buyer (`deepthailand.app/...`) — ต้อง login

| เมนู | Path |
|------|------|
| Dashboard | `/dashboard` |
| My Orders | `/orders` |
| My Reviews | `/reviews` |
| Badges & Progress | `/badges` |
| Verification | `/settings/verification` |
| Profile | `/settings/profile` |

### 3.4 Seller (`seller.deepthailand.app/...`) — login แยก + ต้องมีร้าน

| เมนู | Path |
|------|------|
| **Onboarding (บังคับ, needsOnboarding=true)** | **`/onboarding`** |
| Dashboard | `/dashboard` |
| Sales (analytics) | `/sales` |
| **ผลงานแอดมิน (feature 00059)** | **`/reports/agents`** และ **`/reports/agents/[agentId]`** — `[agentId]` = `User.id` ของคนในร้าน · พนักงานที่ยังไม่ได้รับสิทธิ์ข้อมูลการเงิน (`Shop.staffCanViewFinance=false`) เปิดของคนอื่นไม่ได้ (เห็นจอปฏิเสธ ไม่ใช่ 404) และไม่เห็นคอลัมน์ยอดขาย |
| **ยอดขายรายสินค้า (feature 00063)** | **`/reports/products`** — รายงานไทม์ซีรีส์รายเดือน รับ `?month=YYYY-MM` (ไม่ระบุ = เดือนปัจจุบันเวลาไทย · ผิดรูป/เกินขอบ = ถอยมาเดือนปัจจุบัน + แถบแจ้ง **ไม่ throw ไม่ 404**) · 🛑 **เห็นเฉพาะ `Shop.vertical='ONLINE_SALES'`** และด่านอยู่ที่ `resolveProductReportAccess()` ฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนเมนู — ร้านประเภทอื่นเข้า URL ตรงเห็นการ์ดข้อความ ไม่ redirect เงียบ และ **ไม่มี query ยอดขายเกิดขึ้นเลย** · สิทธิ์ใช้ธงเดิม `Shop.staffCanViewFinance` ตัวเดียวกับ `/expenses` และ `/reports/agents` (ไม่มีธงใหม่) · 🛑 นิยาม "ขายแล้ว" ของหน้านี้ = `OrderItem` ของ `Order.status != 'CANCELLED'` (ชุดเดียวกับ `getBestSellerProducts()`) **ไม่ใช่** `revenueOrderWhere` ของ `/sales` ⇒ ตัวเลขสองหน้าไม่เท่ากันโดยตั้งใจ และหน้าจอต้องแสดง `SALES_BASIS_NOTE` เสมอ (HR16) · **ไม่มี API endpoint ใหม่ ไม่มี migration ไม่มี index ใหม่** |
| Products | `/products` |
| Categories | `/categories` |
| Customers | `/customers` |
| **Customer profile** | **`/customers/[id]`** — 🛑 `[id]` เป็น **opaque row key** จาก `makeCustomerRowKey` (`c-{customerId}` / `u-{buyerUserId}` / `g-{sha256(contact)}`) **ไม่ใช่ `Customer.id`** · ลูกค้าจำนวนมากยังไม่มีแถว `Customer` (ออเดอร์เก่าก่อน 00014 / guest เบอร์ผิดรูปแบบ) ถ้าบังคับเป็น `Customer.id` คนกลุ่มนั้นจะกดแถวในลิสต์แล้วไม่มีหน้าให้ไป · `guest-unknown` **ไม่ถือเป็น key ที่ใช้ได้** (match ลูกค้าหลายคนพร้อมกัน) → 404 (feature 00057) |
| Orders | `/orders` |
| Create Order | `/orders/new` |
| Reviews | `/reviews` |
| Badges & Progress | `/badges` |
| **เครดิต SMS (wallet)** | **`/wallet`** |
| **ตัวจัดหน้าร้าน (feature 00035, desktop เท่านั้น — CSS gate ที่ breakpoint `xl`/1280px)** | **`/public-profile/builder`** |
| Shop Settings | `/shop` |
| Verification | `/verification` |
| Auth (sign-in/sign-up/verify-otp/reset-pass/new-pass) | `/auth/*` |
| **แผนการตรวจสอบ (feature 00060 — Draft, ยังไม่ implement)** | **`/inspection`** — เฉพาะร้าน `vertical='LODGING'`; OWNER จัดการเต็ม ADMIN ดูอย่างเดียว |

> path ฝั่ง seller **ไม่มี** `/settings/` prefix (sync ตามโค้ดจริง)
> **force-redirect:** seller authed + `needsOnboarding` → proxy redirect ทุก route → `/onboarding` (ยกเว้น `/auth/*`, `/api/*`)

### 3.4a ผู้ตรวจ (feature 00060 — Draft, ยังไม่ implement)

> **หมายเหตุความไม่ตรงกัน:** เอกสารต้นทางของ feature 00060 (`DATABASE.md`/`API.md`) ไม่ได้ระบุ
> subdomain ที่แน่ชัดของบทบาทนี้ — component อยู่ใต้ `(paces)/inspector/**` (Paces เหมือน seller/admin)
> แต่ยังไม่ชัดว่าเสิร์ฟจาก `seller.*`, `admin.*`, หรือ subdomain ใหม่ — **ต้องตัดสินก่อน implement จริง**
> ไม่ใช่ contract ที่ล็อกแล้ว (path ด้านล่างเป็น path สัมพัทธ์ ยังไม่ผูก subdomain)

| เมนู | Path |
|------|------|
| คิวรอบตรวจของตน | `/inspector/rounds` |
| รายละเอียดรอบ + บันทึกผล | `/inspector/rounds/[id]` |

### 3.5 Admin (`admin.deepthailand.app/...`) — login แยก + isAdmin

| เมนู | Path |
|------|------|
| Dashboard | `/dashboard` |
| Users | `/users` |
| Verifications | `/verifications` |
| Orders | `/orders` |
| **เติมเครดิต SMS (topup queue)** | **`/topups`** |
| Badges | `/badges` |
| **โควตารับสมัคร + คิวรอบตรวจ (feature 00060 — Draft, ยังไม่ implement)** | **`/inspection/quota`**, **`/inspection/rounds`** |

### 3.6 Route Auth

**ทุก authed route ต้อง server-side guard (proxy/server) ไม่พึ่ง client-side อย่างเดียว.**
known-gap: ปัจจุบัน buyer `/orders` `/reviews` `/settings/*` ยัง client-only — ต้องแก้ (ดู PRD §7 Known Gaps #7).

---

## §4 Non-Functional Requirements

### NFR-1: Performance

| ID | ข้อกำหนด |
|----|---------|
| NFR-1.1 | API response < 500ms (p95) |
| NFR-1.2 | Public Profile โหลด < 2s |
| NFR-1.3 | File upload: แชท ≤ 25MB · รูป/เอกสาร ≤ 10MB (ต่อไฟล์), ภาพสินค้า ≤ 10 รูป — เพดานต่อ purpose อยู่ที่ `src/lib/upload-policy.ts` (SSOT) และถูกบังคับ 2 ชั้น: `file_size_limit` ของ bucket (25MB, Supabase ตอบ 413 เอง) + `POST /api/uploads/commit` ที่อ่านขนาดจริงด้วย HEAD. 🛑 เดิมระบุ 5MB แต่ **ไม่มีผลจริง** เพราะทุก upload วิ่งผ่าน body ของ Vercel Function ที่จำกัด 4.5MB → ตกตั้งแต่ 4.5MB (แก้ 2026-08-10 ด้วย direct upload; ดู `docs/conventions/upload-body-size-limit.md`) |
| NFR-1.4 | **feature 00060 (Draft, ยังไม่ implement)** — โปรไฟล์สาธารณะของร้านที่มีที่พักหลายหลัง (`Room`) ต้องอ่านผลตรวจแบบไม่ N+1 (query รวมทุกหลังครั้งเดียวด้วย `DISTINCT ON`, ไม่ query ต่อหลัง) |

### NFR-2: Security

| ID | ข้อกำหนด |
|----|---------|
| NFR-2.1 | Host-scoped cookie ต่อ subdomain |
| NFR-2.2 | CSRF protection — Origin-check (mutation) ใน `guardApi` (`src/proxy.ts`); allowlist `*.deepthailand.app` / `*.deepth.local` | 
| NFR-2.3 | Rate limiting: 100 req/min public, 30 req/min auth (in-memory globalThis; Vercel per-instance = known gap, Redis = Phase 2); OTP: 5 req/min / เบอร์ |
| NFR-2.4 | File upload: validate MIME, limit size, rename UUID, serve นอก public/ + auth check |
| NFR-2.5 | Input validation ทุก endpoint — Valibot (API) / Yup (form) |
| NFR-2.6 | OTP rate limit 3 ครั้ง/10 นาที/เบอร์ |
| NFR-2.7 | Admin self-review block (verification) — FR-2.6 |
| NFR-2.8 | **feature 00035** — `BuilderPreviewBridge` (postMessage ระหว่าง builder iframe กับ `/u`,`/b` โหมด draft) ต้องตรวจ `event.origin` ผ่าน `isAllowedOrigin()` (reuse `lib/csrf-origin.ts`) ก่อนรับ/ตอบข้อความทุกครั้ง — ห้าม `targetOrigin: '*'` ทั้งสองทาง |
| NFR-2.9 | **feature 00060 (Draft, ยังไม่ implement)** — `InspectionEvidence.visibility='PRIVATE'` (บัตรประชาชน/โฉนด/สเตทเมนต์/บัญชีธนาคาร) ห้ามหลุดเข้า RSC flight payload ของหน้าโปรไฟล์สาธารณะไม่ว่ากรณีใด — mask/neutralize ที่ server boundary (แพตเทิร์นเดียวกับ S-C1) และ query ฝั่งสาธารณะต้องกรอง `visibility='PUBLIC'` ที่ระดับ SQL ไม่ใช่กรองหลังดึง |

### NFR-3: Usability

| ID | ข้อกำหนด |
|----|---------|
| NFR-3.1 | **UI user-facing ภาษาไทยทั้งหมด** (รวม seller/admin) |
| NFR-3.2 | Responsive mobile-first สำหรับ order link + public profile |
| NFR-3.3 | Order Link / Free flow ต้อง **"ง่ายมาก ๆ"** — ขั้นตอนน้อยสุด, ไม่ต้องสมัครก่อนยืนยัน |
| NFR-3.4 | Sidebar layout (buyer Vuexy / seller-admin Paces), collapse เป็น drawer บน mobile |

### NFR-4: Reliability

| ID | ข้อกำหนด |
|----|---------|
| NFR-4.1 | Uptime > 99% |
| NFR-4.2 | Database backup รายวัน (Supabase) |
| NFR-4.3 | **feature 00060 (Draft, ยังไม่ implement)** — ต้องเฝ้าที่ **ตัวชี้วัดงานค้าง** ของคิวรอบตรวจ ไม่ใช่ที่ error rate เพราะ error rate เป็น 0 ตลอดเวลาที่ฟีเจอร์กำลังเสื่อมเงียบ ๆ (ป้ายผลตรวจตกเป็น "รอตรวจซ้ำ" ทีละข้อโดยไม่มีใครมาตรวจซ้ำเลย ทั้งที่โค้ดถูกทุกบรรทัด) — เกณฑ์ "ค้างเท่าไรถือว่าผิดปกติ" และเจ้าของตัวชี้วัดยัง **รอเคาะ** (open question ของเอกสารต้นทาง) |

### NFR-5: Maintainability

| ID | ข้อกำหนด |
|----|---------|
| NFR-5.1 | Service layer แยกจาก API layer |
| NFR-5.2 | Prisma ORM, migration ผ่าน Prisma |
| NFR-5.3 | Docker Compose local; prod Supabase |
| NFR-5.4 | Unit tests สำหรับ critical services (Vitest) |

---

## §5 Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16.1 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| UI Theme | **Dual:** buyer/marketing = Vuexy (**MUI v9** + Emotion + Tailwind 4); seller/admin = Paces (Preline 4 + Tailwind 4, no MUI) |
| Database | PostgreSQL 16 (Supabase) |
| ORM | Prisma |
| Auth | NextAuth.js v4 (`FacebookProvider` + `CredentialsProvider` phone-OTP + `seller-credentials` username+password) |
| OTP / SMS | SMS Gateway provider — apitel (ใช้ทั้ง auth OTP + SMS Order Link); FB OAuth creds ยังขาด (prod login ใช้ OTP ได้แล้ว) |
| Validation | Valibot (API) + Yup (form, react-hook-form) |
| Charts | ApexCharts / ECharts / Chart.js |
| Alerts | react-toastify |
| Analytics | Google Analytics + Google Search Console |
| Container | Docker + Docker Compose |
| Testing | Vitest |

---

## §6 Data Model & Schema

> ดู `prisma/schema.prisma` เป็นแหล่งความจริงเดียว section นี้เป็น reference สำหรับ dev

### 6.1 ER Overview (ความสัมพันธ์หลัก)

```
User (1) ──────── (0..1) Shop
User (1) ──────── (N) AuthAccount
User (1) ──────── (N) VerificationRecord
User (1) ──────── (N) UserBadge ── (N) Badge
User (1) ──────── (N) TrustScoreHistory
User (1) ──────── (N) Order [as buyer]

Shop (1) ──────── (N) Product ── (M:N) Tag
Shop (1) ──────── (N) Order [as seller]
Shop (1) ──────── (0..1) SellerWallet
Shop (1) ──────── (N) TopUpRequest
Shop (1) ──────── (0..1) ShopPageLayout          [feature 00035]
Shop (1) ──────── (N) ShopPageBlock              [feature 00035]
ShopPageBlock (N) ─ (0..1) FacebookPost          [feature 00035 — onDelete Cascade]
ShopChannel (1) ─── (N) CommentReplyLog          [feature 00038 — onDelete Cascade]
PageComment (1) ─── (0..1) CommentReplyLog       [feature 00038 — commentId, onDelete Cascade]
ExternalContact (1) ─ (N) CustomerFile           [feature 00048 — onDelete Cascade]
Conversation (1) ──── (N) CustomerFile           [feature 00048 — เฉพาะเธรด DEEP ที่ไม่มี ExternalContact]

Order (1) ──────── (N) OrderItem
Order (1) ──────── (0..1) ShipmentTracking
Order (1) ──────── (0..1) Review
Order (1) ──────── (N) SmsCode
Order (1) ──────── (N) OrderEvent [Activity Log — insert-only]

SellerWallet (1) ── (N) WalletTransaction

Shop (1) ──────── (0..1) InspectionPlan             [feature 00060 — Draft, ยังไม่ implement]
Shop (1) ──────── (N) InspectionRound                [feature 00060 — Draft]
Shop (1) ──────── (N) InspectionResult               [feature 00060 — Draft]
Shop (1) ──────── (N) InspectionTermsAcceptance      [feature 00060 — Draft, append-only]
Room (1) ──────── (N) InspectionRound                [feature 00060 — Draft, roomId nullable = รอบระดับร้าน]
Room (1) ──────── (N) InspectionResult               [feature 00060 — Draft, roomId nullable = ข้อผูกร้าน]
User (1) ──────── (N) InspectionRound [as inspector, optional]  [feature 00060 — Draft]
InspectionRound (1) ─ (N) InspectionEvidence         [feature 00060 — Draft]
InspectionResult (0..1) ─ (N) InspectionEvidence     [feature 00060 — Draft, optional]
```

### 6.1a `CustomerFile` (feature 00048 — คลังไฟล์ต่อลูกค้า)

ไฟล์ที่ผู้ขาย **คัดเข้ามาเองทีละใบ** จากเธรดแชท (ไม่ใช่ index อัตโนมัติของทุกไฟล์ในห้อง)

| กติกา | รายละเอียด |
|-------|-----------|
| เจ้าของคลัง | `externalContactId` **หรือ** `conversationId` อย่างใดอย่างหนึ่งเท่านั้น — บังคับด้วย CHECK `CustomerFile_owner_exactly_one_check` (unmanaged SQL) |
| กันเก็บซ้ำ | `@@unique([externalContactId, fileId])` + `@@unique([conversationId, fileId])` — NULL ใน Postgres ไม่ชนกันเอง จึงได้ผลเป็น partial-unique ต่อเจ้าของโดยไม่ต้องเขียน partial index |
| ชนิดไฟล์ | CHECK `kind IN ('IMAGE','VIDEO','FILE')` — 🛑 เพิ่มค่าที่ 4 ต้องเขียน migration แบบ **additive** (อ่านนิยามเดิมมาต่อท้าย) ตาม `docs/conventions/migration-check-constraint-additive.md` |
| `sourceMessageId` | **ไม่ใช่ FK โดยตั้งใจ** — ข้อความถูกลบ/unsend ต้องไม่ลบแถวคลัง (นี่คือเหตุผลทั้งหมดที่คลังมีอยู่) |
| `sentAt` | เวลาที่ไฟล์ถูกส่งจริง (`ChatMessage.createdAt`) = **คีย์เรียงลำดับของคลัง** ไม่ใช่ `savedAt` |
| `savedByName` | snapshot ชื่อผู้เก็บ — ต้องยังอ่านได้แม้คนนั้นออกจากทีมร้านไปแล้ว จึงไม่ join ตอนอ่าน |
| Cascade | ร้าน/ผู้ติดต่อ/เธรดถูกลบ → แถวคลังหายตาม **แต่ไฟล์ใน storage ไม่ถูกลบ** (ยังถูกอ้างจาก `ChatMessage`) |

### 6.1b `ChannelIceBreaker` (2026-08-27 — คำถามแนะนำก่อนเริ่มแชท)

คำถามสำเร็จรูป ≤4 ข้อที่ Meta แสดงในกล่องแชท **เฉพาะเธรดที่ยังไม่เคยมีข้อความ และเฉพาะมือถือ**
พร้อมคำตอบที่ระบบส่งให้อัตโนมัติเมื่อลูกค้าแตะ

| กติกา | รายละเอียด |
|-------|-----------|
| ขอบเขต | `MESSENGER` / `INSTAGRAM` เท่านั้น — LINE มี Rich Menu (feature 00045) ซึ่งเป็นคนละกลไกคนละ endpoint |
| ลำดับ | `@@unique([shopChannelId, order])` · `order` = 0..3 · **เป็นส่วนหนึ่งของ `payload` ที่ส่งให้ Meta** จึงต้องคงที่ระหว่างสองฝั่ง |
| เจ้าของความจริง | **Meta** สำหรับ *คำถาม* (สิ่งที่ลูกค้าเห็น) · **ตารางนี้** สำหรับ *คำตอบ* (Meta ไม่เก็บให้) ⇒ เขียนตารางนี้ได้ก็ต่อเมื่อ Meta รับชุดนั้นไปแล้ว |
| การแก้ | ลบทั้งชุดแล้วเขียนใหม่เสมอ — Meta ไม่มี partial update (D-IB-3) |
| Cascade | ช่องทางถูกถอด → คำถามหายตาม (`onDelete: Cascade`) — ค่าที่ค้างอยู่จะชี้ไปยังเพจที่เราไม่มี token แล้ว |
| ความยาว | คำถาม ≤80 (ความกว้างปุ่มของ Meta) · คำตอบ ≤**1,000** (เพดานข้อความของ Instagram — ไม่ใช่ 2,000 ของ `QuickMessage` เพราะคำตอบเดินทางออกเป็นข้อความแชทจริง) · นับด้วย **code point** ไม่ใช่ `.length` |

### 6.2 Models

#### User (`prisma/schema.prisma:11`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `id` | String UUID PK | `@default(uuid())` |
| `displayName` | String | ชื่อแสดงผล |
| `username` | String `@unique` | ใช้ใน public profile `/u/{username}` |
| `avatar` | String? | fileId หรือ URL รูปโปรไฟล์ |
| `phone` | String? `@unique` | เบอร์มือถือไทย `0[689][0-9]{8}` — PII · แถวเก่าก่อน 2026-08-21 อาจเป็น `0[0-9]{9}` (ด่านใหม่กันเฉพาะค่าที่เขียนเข้ามาใหม่ ไม่มี CHECK ที่ระดับ DB) |
| `email` | String? `@unique` | อีเมล FB OAuth — PII |
| `trustScore` | Int default 0 | คะแนน 0-100 |
| `isShop` | Boolean default false | true เมื่อสร้างร้านสำเร็จ |
| `isAdmin` | Boolean default false | ตั้งผ่าน DB seed เท่านั้น |
| `passwordHash` | String? | bcryptjs hash — ใช้กับ seller-credentials login + admin login; buyer ไม่มี (no email+password) |
| `createdAt` | DateTime | วันสมัคร — ใช้คำนวณ Age component trust score |
| `chatScopeMode` | String default `"SINGLE"` | **feature 00037** — มุมมองกล่องข้อความของผู้ใช้คนนี้: `"SINGLE"` = เห็นเฉพาะแชทของร้านที่ active (พฤติกรรมเดิมทั้งหมด) · `"UNIFIED"` = เห็นแชทของทุกร้านที่เข้าถึงได้รวมในรายการเดียว. เก็บที่ `User` ไม่ใช่ `Shop` เพราะเป็น "วิธีทำงานของคน" ไม่ใช่ "การตั้งค่าของร้าน". **ไม่มี CHECK constraint โดยตั้งใจ** (ดู `docs/conventions/migration-check-constraint-additive.md`) — ด่านอยู่ที่ Valibot ขาเขียนกับ `normalizeChatScopeMode()` ขาอ่าน (ค่าที่ไม่รู้จัก → `SINGLE`) |

**Relations:** `shop`, `authAccounts`, `verifications`, `userBadges`, `trustScoreHistory`, `ordersAsBuyer`, `reviewsGiven`, `verificationsReviewed`, `topUpRequestsReviewed`

#### AuthAccount (`prisma/schema.prisma:36`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `userId` | String FK → User | cascade delete |
| `provider` | String | `"facebook"`, `"credentials"` (phone-OTP), หรือ `"seller-credentials"` (username+password) |
| `providerAccountId` | String | FB user id / phone number / username (ตาม provider) |
| `accessToken` / `refreshToken` | String? | FB OAuth tokens |

**Unique constraint:** `[provider, providerAccountId]`

#### Shop (`prisma/schema.prisma:50`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `userId` | String `@unique` FK → User | 1 user = 1 shop สูงสุด |
| `shopName` | String | ≤100 chars (Valibot) |
| `description` | String? | bio ร้าน |
| `logo` | String? | fileId จาก `/api/upload` |
| `category` | String? | picklist จาก `src/lib/shop-categories.ts` (10 key) — ≤50 chars |
| `address` | String? | ≤200 chars — แสดงบน public profile |
| `businessType` | String default `"INDIVIDUAL"` | `"INDIVIDUAL"` หรือ `"COMPANY"` |
| `slug` | String? `@unique` | ชื่อ URL ร้าน (3–30 a-z0-9- ไม่ขึ้น/ลงด้วย hyphen) — `src/lib/shop-slug.ts`; **บังคับตั้งตอน onboarding** ก่อน access dashboard; migration 2026-06-16 (nullable ADD COLUMN) |

**Relations:** `products`, `orders`, `wallet` (SellerWallet), `topUpRequests`

#### VerificationRecord (`prisma/schema.prisma:69`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `userId` | String FK → User | คนที่ส่ง/ถือการยืนยันใบนี้ (audit) — มีค่าเสมอทุกแถว |
| `shopId` | String? FK → Shop | `null` = ระดับของ "คน" (personal) · `<businessId>` = เอกสารของร้าน BUSINESS นั้น. 🛑 **L1 `PHONE_OTP` เขียน `shopId = null` เสมอทุกทางเข้า** (`api/account/set-phone`, `lib/auth.ts` ×2, `scripts/backfill-phone-l1-verifications.ts`) — ไม่มีทางเข้าไหนเขียน L1 พร้อม `shopId` เลย ดู FR-2.7 |
| `type` | String | `PHONE_OTP` / `ID_DOC` / `BUSINESS_REG` |
| `level` | Int | 1 / 2 / 3 |
| `status` | String default `"PENDING"` | `PENDING` / `APPROVED` / `REJECTED` |
| `documents` | Json? | flat object `{idCard: fileId, selfie: fileId, ...}` |
| `rejectedReason` | String? | เหตุผลปฏิเสธ — admin กรอก |
| `reviewedById` | String? FK → User | admin ที่ review — ใช้ self-review block |
| `reviewedAt` | DateTime? | |

#### Badge (`prisma/schema.prisma:85`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `name` | String | ชื่อไทย ≤80 |
| `nameEN` | String `@unique` | ชื่ออังกฤษ — ใช้เป็น key ใน badge evaluator (ปัจจุบัน) |
| `icon` | String? | Iconify icon name — nullable, มี fallback |
| `imageUrl` | String? | URL รูป badge (จาก `/api/admin/badges/upload`) |
| `type` | String | `ACHIEVEMENT` / `VERIFICATION` |
| `criteria` | Json | discriminated union ตาม `KnownCriteriaTypes` (ดู §8) |
| `audience` | String default `"SELLER"` | `SELLER` / `BUYER` / `ANY` |

#### UserBadge (`prisma/schema.prisma:99`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `userId` | String FK → User | |
| `badgeId` | String FK → Badge | |
| `earnedAt` | DateTime | วันที่ได้รับ badge |

**Unique constraint:** `[userId, badgeId]` — sticky (ไม่ revoke)

#### Product (`prisma/schema.prisma:111`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `shopId` | String FK → Shop | cascade delete |
| `name` | String | ≤200 chars |
| `description` | String? `@db.Text` | ≤5000 chars |
| `shortDescription` | String? `@db.VarChar(200)` | |
| `attributes` | Json default `{}` | key-value pairs (key≤50, value≤200, ≤10 keys) |
| `price` | Decimal(12,2) | **≥0** (เปลี่ยนจาก ≥0.01 เมื่อ 2026-08-23 ตามที่ user สั่ง — ร้านตั้ง ฿0 ได้: ของแถม/ตัวอย่างฟรี/คิดเงินปลายทาง). 🛑 `0` = **ราคาศูนย์จริง** ไม่ใช่ "ยังไม่ได้ตั้งราคา" — ค่าหลังคือช่องว่างซึ่งยังบังคับกรอกเหมือนเดิม. บังคับ 3 ชั้นที่ต้องตรงกันเสมอ (`input min` · Yup `.min(0)` · Valibot `CreateProductSchema`/`UpdateProductSchema` `minValue(0)`) — ด่าน `product-price-zero.test.ts`. ไม่มี CHECK ที่ DB |
| `images` | Json default `[]` | array of fileId — max 10 |
| `type` | String default `"PHYSICAL"` | `PHYSICAL` / `DIGITAL` / `SERVICE` / `SUBSCRIPTION` |
| `fulfillmentMode` | String default `"SHIPPED"` | `SHIPPED` / `NO_SHIPPING` — **ship guard จริง** (FR-6.5) |
| `billingMode` | String default `"ONE_TIME"` | `ONE_TIME` / `RECURRING` |
| `billingPeriod` | String? | `MONTHLY` / `YEARLY` / `CUSTOM` |
| `billingPeriodDays` | Int? | กรณี `CUSTOM` billing (1-365) |
| `isActive` | Boolean default true | กรอง product grid public profile |
| `cost` | Decimal(12,2)? | **ราคาทุน** (feature 00016) — nullable/opt-in, `CHECK(cost IS NULL OR cost >= 0)`. snapshot ลง `OrderItem.cost` ตอนสร้างออเดอร์ทุกครั้ง → **แก้ค่านี้ทีหลังไม่มีผลย้อนหลัง** (ข้อยกเว้นครั้งเดียว: migration `20260808210000_backfill_order_item_cost` เติมค่าเข้า `OrderItem.cost` ที่ยังเป็น NULL — เติมเฉพาะช่องว่าง ไม่ทับของเดิม ดู §7.13). ตั้งแต่ 2026-08-07 **ไม่มี gate ของแพ็กเกจแล้ว** ทุกร้านกรอกได้ (D-EXT-1) |
| `tags` | Tag[] | M:N relation — upsert โดย server ตามชื่อ tag |

#### Tag (`prisma/schema.prisma:135`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `name` | String `@unique` | ชื่อ tag 1-50 chars |
| `slug` | String `@unique` | lowercase-kebab |

#### Order (`prisma/schema.prisma:144`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `publicToken` | String `@unique` UUID | ใช้ใน URL `/o/{token}` |
| `shopId` | String FK → Shop | เจ้าของออเดอร์ |
| `createdAt` | DateTime `@default(now())` | 🛑 **feature 00033 — คือ "วันที่/เวลาที่ลูกค้าสั่ง" ไม่ใช่แค่เวลาที่แถวถูกสร้าง** ผู้ขายระบุเองได้ผ่าน `createdAt` ใน `CreateOrderSchema` (ทั้งตอนสร้างและแก้ไข) ย้อนหลังได้สูงสุด 90 วัน / ล่วงหน้าได้ 7 วัน (SSOT ของช่วง: `src/lib/order-date-window.ts`) ไม่ส่งมา = ค่าเริ่มต้นเดิมทุกประการ. ค่านี้พา `orderNo` (`formatOrderNo` คิดปี/เดือนจากค่านี้), keyset pagination ของรายการออเดอร์ และยอดขายทุกหน้าไปด้วยทั้งชุด. เวลาจริงที่กดสร้าง/แก้ไข **ไม่เก็บที่นี่** — อยู่ใน `OrderEvent.occurredAt` (ดู §6.2 OrderEvent) |
| `buyerUserId` | String? FK → User | null = buyer ยังไม่สมัคร |
| `buyerContact` | String? | เบอร์มือถือของ buyer — PII; RC-6 lock ตอน SMS send · เขียนใหม่ได้เฉพาะค่าที่ผ่าน `MOBILE_PHONE_RE` (รวมทาง iShip import ตั้งแต่ 2026-08-21) |
| `type` | String default `"PHYSICAL"` | inherit จาก product type |
| `totalAmount` | Decimal(12,2) | ยอดรวมสุทธิ |
| `status` | String default `"PENDING"` | state machine: `PENDING` / `SHIPPED` / `CONFIRMED` / `CANCELLED` |
| `fulfillmentMode` | String default `"SHIPPED"` | `SHIPPED` / `NO_SHIPPING` — **ship guard ตรวจ field นี้** |
| `cancelInitiator` | String? | `"seller"` / `"buyer"` — เก็บเมื่อ CANCELLED (ดู §2 Zero Complaint) |
| `shippingAddress` | Json? | shape: `{line1, subdistrict, district, province, postcode, note}` — required เมื่อ fulfillmentMode=SHIPPED. 🛑 **`subdistrict`=ตำบล/แขวง · `district`=อำเภอ/เขต** (คู่นี้สลับกันแล้วไม่มีอะไรฟ้อง — ค่าที่ผิดยังเป็นสตริงไทยที่ดูถูกต้อง) และคู่ ตำบล+อำเภอ+จังหวัด+รหัสไปรษณีย์ **ต้องมีอยู่จริงใน `public/data/iship-address.json`** ไม่งั้นเปิดพัสดุ iShip ไม่ผ่าน (`ADDRESS_INVALID`) — ไฟล์นั้นเขียน กทม. ว่า `"กรุงเทพ"` และไม่มีอำเภอชื่อ `"เมือง"` เดี่ยว ๆ เลย มีแต่ `"เมืองสมุทรปราการ"`. ดู `docs/conventions/external-payload-schema.md` §5 |
| `paymentMethod` | String? | Phase B — วิธีชำระเงิน (FR-6.11) |
| `salesChannel` | String? | Phase B — ช่องทางขาย · ค่า: `STOREFRONT` \| `FACEBOOK` \| `LINE` \| `TIKTOK` \| `OTHER` — 🛑 **Messenger และ Instagram แมปเป็น `FACEBOOK` ทั้งคู่** (ฟอร์มไม่มี `INSTAGRAM` แยก) ดู `src/lib/chat-sales-channel.ts` |
| `shopChannelId` | String? FK → ShopChannel | *(migration `20260810100000`)* **บัญชี/เพจที่ลูกค้าทักเข้ามาตอนสร้างออเดอร์** — ต่างจาก `salesChannel` ที่บอกแค่ "แพลตฟอร์มไหน" คอลัมน์นี้บอก "ใบไหน" จึงเป็นตัวที่ทำให้หน้า `/orders` โชว์รูปเพจ/LINE OA จริงได้. 🛑 **ออเดอร์ก่อน 2026-08-10 เป็น `NULL` และยัง backfill ไม่ได้** — การโยงผ่าน `customerId` เป็นการเดา และมี 2 ใบที่ระบุ `salesChannel=FACEBOOK` ไว้แล้ว ห้าม backfill จนพิสูจน์ได้ |
| `internalNote` | String? `@db.Text` | Phase B — note ภายใน seller |
| `buyerName` | String? | Phase B — ชื่อผู้ซื้อ |
| `discount` | Decimal(12,2)? | Phase B — ≥0 |
| `vatRate` | Decimal(5,4)? | Phase B — decimal fraction (0.07 = 7%, maxValue 1) |
| `vatAmount` | Decimal(12,2)? | Phase B — ≥0 |
| `slipFileId` | String? | Phase 2 OOS-1 — fileId ของสลิปโอนเงิน; null = ยังไม่แนบ |
| `accessUrl` | String? | Phase 2 OOS-2 — URL ส่งมอบ digital order |
| `serviceResourceId` / `serviceSeat` / `serviceStart` / `serviceEnd` / `appointmentStatus` / `buyerConfirmedAt` / `rescheduleRequestNote` / `depositAmount` | nullable ทั้งหมด | **feature 00024 (Service Appointment Booking)** — ฟิลด์นัดหมายบริการ (ร้าน `Shop.vertical='SERVICE_QUEUE'` เท่านั้น; NULL เสมอสำหรับร้านอื่น) ยังไม่เคย sync เข้าเอกสารนี้มาก่อน (หนี้เดิม — รายละเอียดเต็ม: constraint EXCLUDE `Order_service_seat_no_overlap`, state machine ของ `appointmentStatus`, กฎมัดจำ อยู่ที่ `docs/20 - Features/00024 - Service Appointment Booking/{SRS,DATABASE}.md`). 🛑 ตั้งแต่ 2026-08-08: `serviceStart`/`serviceEnd`/`appointmentStatus`/`depositAmount` ถูก select เพิ่มใน `getOrdersByCustomer()` (`src/services/order.service.ts`) **และ** `inbox/[conversationId]/page.tsx` เพื่อป้อนแกนสถานะนัดในห้องแชท (`src/lib/chat-service-progress.ts` — ดูด้านล่าง) — สอง select ต้อง sync ฟิลด์ชุดนี้เสมอ ไม่งั้นออเดอร์ที่โหลดทีหลัง (lazy-load) จะกลายเป็น walk-in เงียบ ๆ |

**Index:** `[slipFileId]` — รองรับ `/api/files` order-slip gate

**`src/lib/chat-service-progress.ts` (ใหม่ 2026-08-08, feature 00024/00018/00036):** adapter pure module ที่แปล `serviceStart`/`serviceEnd`/`appointmentStatus`/`Order.status` เป็นแกน "นัดถึงขั้นไหน" สำหรับแถบสถานะออเดอร์ในห้องแชทของร้าน `SERVICE_QUEUE` (คู่ขนานกับ `chat-order-progress.ts` ของแกนขนส่งที่ร้านอื่นใช้) — walk-in (ไม่มี `serviceStart`) ที่ยังไม่ปิดการขาย = `PENDING` เสมอ, `COMPLETED`/`NO_SHOW`/`CANCELLED` = หลุดจากรายการงานค้างทันที

#### OrderItem (`prisma/schema.prisma:183`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `orderId` | String FK → Order | cascade delete |
| `productId` | String? FK → Product | nullable — `SetNull` เมื่อ product ถูกลบ (FR-6.7 snapshot) |
| `name` | String | snapshot ชื่อ ณ เวลาสั่ง |
| `description` | String? | snapshot คำอธิบาย |
| `qty` | Int | ≥1 |
| `price` | Decimal(12,2) | snapshot ราคา **≥0** — ฿0 บันทึกได้ (2026-08-10: ร้านคิวงานรับจองไว้ก่อนโดยยังไม่เก็บเงิน/ไม่เก็บมัดจำ) ติดลบไม่ได้ |

#### OrderEvent (`prisma/schema.prisma:2721`)

> Activity Log ระดับออเดอร์ ("ใครทำอะไรกับออเดอร์นี้เมื่อไหร่") — คนละคำถามกับ `Order.status`. **insert-only** ไม่มี UPDATE/DELETE ผ่าน application code (หลักฐานข้อพิพาท). รายละเอียดเต็ม: `docs/20 - Features/00033 - Backdated Order Date/`

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `orderId` | String FK → Order | cascade delete |
| `type` | String | **13 ค่า** — ดู §8.1b (SSOT: `src/lib/order-event.ts::ORDER_EVENT_TYPES`) |
| `actorUserId` | String? FK → User | `SetNull` เมื่อลบ user — ห้าม fallback เป็นเจ้าของร้าน |
| `meta` | Json default `{}` | โครงต่างกันตาม `type` — **ห้ามมี PII ผู้ซื้อดิบ** (เบอร์/อีเมล/ที่อยู่) เด็ดขาด |
| `occurredAt` | DateTime (ไม่มี default) | 🛑 **เวลาจริงที่เหตุการณ์เกิด เสมอ — ห้ามย้อนตามวันที่ที่ผู้ใช้กรอก** (เช่น `Order.createdAt` ที่ backdate ได้ตาม feature 00033). วันที่สั่งซื้อที่ผู้ขายเลือกอยู่ใน `meta.orderedAt`/`orderedAtFrom`/`orderedAtTo` เท่านั้น — ประวัติคือหลักฐาน |
| `seq` | Int `@unique @default(autoincrement())` | tie-break ลำดับเมื่อ `occurredAt` ชนกันเป๊ะ (ห้ามใช้ `id` — uuid v4 สุ่ม) |
| `createdAt` | DateTime `@default(now())` | เวลาที่แถวถูกบันทึก — แยกจาก `occurredAt` |

**🛑 CHECK constraint `OrderEvent_type_check` เป็น unmanaged SQL** (Prisma DSL ประกาศ CHECK ไม่ได้) — ห้าม `prisma db pull`/`migrate dev` เด็ดขาด (introspect ไม่เห็น CHECK นี้ แล้วจะสร้าง migration ที่ DROP ทิ้ง). **ใครเพิ่ม event type ใหม่ ต้องเขียน migration แบบอ่านรายชื่อเดิมจาก `pg_constraint` แล้วต่อท้าย** ห้าม hardcode รายชื่อเต็มทับของเดิม — มี branch คู่ขนานเคยรันพร้อมกันแล้ว DROP+ADD ของอีกฝ่ายลบค่าทิ้งเงียบ ๆ มาแล้วจริง (ดู `prisma/migrations/20260806150000_order_event_date_changed/`)

#### ShipmentTracking (`prisma/schema.prisma:196`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `orderId` | String `@unique` FK → Order | 1 order = 1 tracking |
| `provider` | String | ชื่อขนส่ง |
| `trackingNo` | String | หมายเลขพัสดุ |
| `status` | String default `"SHIPPED"` | |
| `lastSyncAt` | DateTime? | Phase 2 — shipping status sync |

#### Review (`prisma/schema.prisma:209`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `orderId` | String `@unique` FK → Order | 1 order = 1 review |
| `reviewerUserId` | String? FK → User | null = anonymous guest buyer |
| `reviewerContact` | String? | phone/email ของ anonymous reviewer — PII |
| `rating` | Int | 1-5 |
| `comment` | String? | ≤500 chars |
| `images` | Json `@default("[]")` | **feature 00041** — fileId ของรูปแนบ ≤4 ใบ (BR-BOE-19); เพดานจำนวนบังคับที่ service ไม่ใช่ DB CHECK · ขนาดต่อไฟล์บังคับที่ `/api/uploads/commit` |
| `shopReplyComment` | String? `@db.Text` | **feature 00041** — คำตอบของร้าน 1 ต่อ 1 รีวิว (BR-BOE-21) ตอบซ้ำ = **เขียนทับ** ไม่ใช่แถวใหม่ จึงเป็นคอลัมน์ inline ไม่ใช่ตารางแยก |
| `shopRepliedAt` | DateTime? | เวลาที่ตอบ — 🛑 ต้องมีคู่กับ `shopReplyComment` เสมอถึงจะนับว่า "ตอบแล้ว" (แถวเก่ามีข้อความโดยไม่มีเวลาได้) |
| `shopRepliedByUserId` | String? FK → User `onDelete: SetNull` | ใครในร้านเป็นคนตอบ — **บันทึกแล้วแต่ยังไม่มีหน้าจอไหนแสดง** (หนี้ที่รู้ตัว: ร้านที่มีพนักงานหลายคนยังตรวจสอบย้อนหลังไม่ได้) |
| `deletedAt` | DateTime? | **feature 00041 — soft delete ที่ "ต้องมี" ไม่ใช่ทางเลือกเชิงสไตล์** ดูกล่องเตือนด้านล่าง |
| `updatedAt` | DateTime `@updatedAt` | ขยับทุกครั้งที่แถวถูกแก้ **รวมตอนร้านตอบกลับ** — ห้ามใช้วัด "ผู้ซื้อแก้ไขกี่ครั้ง" ตรง ๆ |

🛑 **ทำไม Review ต้อง soft delete:** `canEditReview()` นับหน้าต่างแก้ไข 24 ชม. จาก `createdAt`
ถ้า hard-delete แล้วเขียนใหม่ได้ แถวใหม่จะได้ `createdAt` ใหม่ = เริ่มจับเวลาใหม่ ⇒ ลบ-เขียนใหม่
ทุก 23 ชม. ก็แก้รีวิวได้ตลอดกาล ทำลาย BR-BOE-17 ทั้งข้อ. แถวยังอยู่ ⇒ `Order.review` ไม่เป็น null
⇒ guard ของ `createReview()` ยังทำงาน ⇒ `createdAt` ไม่มีวันรีเซ็ต

🛑 **ทุก read path ต้องกรอง `deletedAt: null`** ยกเว้น 2 จุดที่ต้องไม่กรองโดยตั้งใจ:
`createReview()` guard (ต้องเห็นแถวที่ถูกลบเพื่อกันเขียนใหม่) และ `linkBuyerHistory`

**หมายเหตุ:** anonymous review นับเข้า avgRating แต่ **ไม่นับ** unique reviewer ของ Community Favorite badge

#### TrustScoreHistory (`prisma/schema.prisma:222`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `userId` | String FK → User | |
| `score` | Int | snapshot คะแนน 0-100 |
| `breakdown` | Json | breakdown 5 component (verification, orders, rating, age, badges) |
| `calculatedAt` | DateTime | |

#### SellerWallet (`prisma/schema.prisma:234`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `shopId` | String `@unique` FK → Shop | 1:1 Shop |
| `balance` | Int default 0 | หน่วย ฿ integer; **CHECK(balance ≥ 0)** enforce ใน migration SQL |

**หมายเหตุ:** CHECK constraint สร้างด้วยมือใน migration SQL (Prisma ไม่ generate CHECK อัตโนมัติ)

#### WalletTransaction (`prisma/schema.prisma:246`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `walletId` | String FK → SellerWallet | |
| `type` | String | `TOPUP` / `DEDUCT` |
| `amount` | Int | หน่วย ฿ |
| `balanceAfter` | Int | ยอด balance หลัง transaction |
| `description` | String | คำอธิบาย — ไม่มี PII |
| `refId` | String? | orderId หรือ topUpRequestId (audit trail) |

**Index:** `[walletId, createdAt]`

#### TopUpRequest (`prisma/schema.prisma:262`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `shopId` | String FK → Shop | |
| `amount` | Int | หน่วย ฿ (100-100000) |
| `slipFileId` | String | fileId ของสลิปโอนเงิน — KYC-class file (admin-only viewer) |
| `status` | String default `"PENDING"` | `PENDING` / `APPROVED` / `REJECTED` |
| `reviewedById` | String? FK → User | admin ที่ approve/reject — RC-7 self-block |
| `reviewedAt` | DateTime? | |
| `rejectedReason` | String? | ≤500 chars |
| `notifiedAt` | DateTime? | null = ยังไม่แจ้ง seller; ใช้ `/api/wallet/events` poll |

**Indexes:** `[status]`, `[shopId]`, `[slipFileId]`, `[shopId, status, notifiedAt]`

#### SmsCode (`prisma/schema.prisma:285`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `codeHash` | String `@unique` | SHA-256 hex ของ raw 12-char code — **hash-at-rest** (RC-3/D1) |
| `orderId` | String FK → Order | cascade delete |
| `buyerPhone` | String | เบอร์ buyer — PII |
| `expiresAt` | DateTime | TTL 72 ชั่วโมงจากเวลา issue |
| `usedAt` | DateTime? | null = ยังไม่ใช้ (single-use) |
| `deliveryStatus` | String default `"PENDING"` | `PENDING` / `SENT` / `FAILED` — ใช้ reconcile crash (AR-1) |

**Indexes:** `[codeHash]`, `[orderId]`, `[expiresAt]`

#### ShopPageLayout (`prisma/schema.prisma:2705`) — feature 00035

> สวิตช์เผยแพร่ + ลำดับแท็บของหน้าร้านสาธารณะ — 1:1 `Shop`

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `shopId` | String `@unique` FK → Shop | cascade delete — 1 ร้าน 1 ชุดตั้งค่า (pattern เดียวกับ `AutoReplyConfig`) |
| `isPublished` | Boolean `@default(true)` | สวิตช์เผยแพร่ทั้งหน้า (FR-9.14) — 🛑 default มีผลเฉพาะตอน INSERT แถวใหม่เท่านั้น ร้านที่ยังไม่เคยมีแถวนี้เลย (ไม่มีแถว ≠ ไม่เผยแพร่) ต้อง fallback เป็น `true` ที่ชั้น service เสมอ (`getShopPageLayout`) ห้ามพึ่ง DB default อย่างเดียว |
| `tabOrder` | String[] `@default([])` | ลำดับ tab key ที่ร้านจัดเอง — เก็บแค่ "ลำดับ" ไม่ใช่ "รายการที่จะแสดง" ค่าที่ถูกต้อง 7 ตัว (SSOT `src/lib/profile-tab-keys.ts::PROFILE_TAB_KEYS`) — ว่าง `[]` = ใช้ลำดับ default ของระบบ; ไม่มี CHECK ที่ DB (validate ที่ Valibot อย่างเดียว มิเรอร์ `Shop.categories`) |
| `createdAt` / `updatedAt` | DateTime | |

#### ShopPageBlock (`prisma/schema.prisma:2753`) — feature 00035

> บล็อกเหนือแถบแท็บของหน้าร้านสาธารณะ — มี 2 ชนิด: `BADGE_HIGHLIGHT` (เหรียญตราเด่น, ≤1 แถวต่อร้าน) และ `FACEBOOK_POST` (โพสต์ Facebook, หลายแถวได้)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `shopId` | String FK → Shop | cascade delete |
| `type` | String | `BADGE_HIGHLIGHT` / `FACEBOOK_POST` — ดู §8.2b |
| `sortOrder` | Int `@default(0)` | ตำแหน่งในกลุ่มบล็อกของร้านนี้ — เขียนทับเป็น `0..n-1` ทุกครั้งที่บันทึก ไม่มี unique |
| `badgeIds` | String[] `@default([])` | ใช้เฉพาะ `type=BADGE_HIGHLIGHT` — เก็บ `UserBadge.id` (ไม่ใช่ `Badge.id`) ไม่มี FK จริง (array) ฝั่งอ่านต้อง query `UserBadge` ซ้ำเสมอว่ายังเป็นของร้าน/ผู้ใช้นี้ + `Badge.type='ACHIEVEMENT'` |
| `facebookPostId` | String? FK → FacebookPost | ใช้เฉพาะ `type=FACEBOOK_POST` — `onDelete: Cascade` (โพสต์ต้นทางหาย → แถวนี้หายไปเงียบ ๆ ไม่เหลือ orphan) |
| `createdAt` / `updatedAt` | DateTime | |

**🛑 CHECK constraints (unmanaged SQL — ห้าม `prisma db pull`/`migrate dev`):**
- `ShopPageBlock_type_check` — `type` ∈ `('BADGE_HIGHLIGHT','FACEBOOK_POST')`
- `ShopPageBlock_type_fields_check` — `type='BADGE_HIGHLIGHT'` ⇒ `facebookPostId IS NULL AND cardinality(badgeIds)<=4`; `type='FACEBOOK_POST'` ⇒ `facebookPostId IS NOT NULL AND cardinality(badgeIds)=0`
- `ShopPageBlock_sortOrder_non_negative` — `sortOrder >= 0`

**Partial unique indexes (unmanaged SQL — Prisma DSL ประกาศไม่ได้):**
- `ShopPageBlock_shopId_badgeHighlight_key` — `(shopId) WHERE type='BADGE_HIGHLIGHT'` (เหรียญตราเด่นมีได้แถวเดียวต่อร้าน)
- `ShopPageBlock_shopId_facebookPostId_key` — `(shopId, facebookPostId) WHERE type='FACEBOOK_POST' AND facebookPostId IS NOT NULL` (โพสต์เดียวกันเพิ่มซ้ำในร้านเดียวกันไม่ได้)

**Indexes:** `[shopId, sortOrder]` (อ่านเรียงตำแหน่ง — public render + builder canvas), `[facebookPostId]` (lookup ย้อนกลับ)

#### FacebookPost (`prisma/schema.prisma:2650`) — feature 00029

> 🛑 **หนี้เดิม:** ตารางนี้มาจาก feature 00029 (แท็บความคิดเห็น Facebook) ที่ยังไม่เคยเขียน SRS/SDS/API/Tests เลย — entry ด้านล่างเป็น**เวอร์ชันย่อ**เพิ่มเข้ามาเพราะ feature 00035 แตะตารางนี้ตรง ๆ (เพิ่ม 2 คอลัมน์ mirror) **`ShopChannel` และ `PageComment` ที่เกี่ยวข้องกันยังไม่มี entry ในเอกสารนี้เลย** — ยังเป็นหนี้ค้าง ไม่ใช่ครบแล้ว

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `shopChannelId` | String FK → ShopChannel | cascade delete (ตารางนี้ยังไม่ได้เขียนใน SRS — ดูหมายเหตุด้านบน) |
| `externalPostId` | String `@unique` | id ฝั่ง Meta รูปแบบ `"{pageId}_{postNum}"` — กันซ้ำ |
| `message` / `permalink` / `thumbnailUrl` | String? | เนื้อหา/ลิงก์/รูปปกโพสต์ — `thumbnailUrl` เป็น URL ของ Meta ตรง ๆ (ไม่ mirror) |
| `createdTime` / `lastCommentAt` | DateTime? | เวลาโพสต์ / เวลาคอมเมนต์ล่าสุด (ตัวหลังใช้เรียงรายการ) |
| `mediaType` | String? | `video`/`photo`/`album`/`link`/`status` |
| `reactionCount` / `fbCommentCount` / `shareCount` | Int? | ยอด engagement — `NULL` = ยังไม่เคยดึง ต่างจาก `0` |
| `statsSyncedAt` | DateTime? | เวลาที่ sync ยอด engagement ล่าสุด |
| `mirroredFileId` | String? | **feature 00035** — fileId ของ storage ที่ mirror รูปปกแล้ว, เขียนครั้งแรกตอนร้านกด "เพิ่มลงหน้าร้าน" เท่านั้น (ไม่ mirror ทุกโพสต์ที่ดึงมา) `NULL` = ไม่เคยถูกเพิ่มลงหน้าร้านของร้านไหนเลย |
| `mirroredAt` | DateTime? | **feature 00035** — เวลาที่ mirror สำเร็จ |

**Index:** `[shopChannelId, lastCommentAt]`

#### ShopChannel (`prisma/schema.prisma:1294`) — เวอร์ชันย่อ (feature 00038)

> 🛑 **หนี้เดิม:** ตารางเต็มยังไม่มี entry ในเอกสารนี้ (มาจาก feature 00018 — ยังไม่เคยเขียน
> SRS/SDS/API/Tests) ด้านล่างคือ**เฉพาะ 4 คอลัมน์ใหม่**ที่ feature 00038 เพิ่มเข้ามา ไม่ใช่ตารางเต็ม

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `commentPublicReplyEnabled` | Boolean default `false` | สวิตช์ "ตอบใต้คอมเมนต์" ต่อเพจ |
| `CommentReplyRule` | ตารางใหม่ (00038 E2, 2026-08-15) | กฎตอบคอมเมนต์ตามคีย์เวิร์ดต่อร้าน — `shopChannelId` NULL = ทุกเพจ · `normalizedPhrases` เก็บรูปที่ผ่าน `normalizeMessage()` (**แก้ตัว normalize ต้อง backfill ทั้งตารางในรอบ deploy เดียวกัน**) · เลือกกฎด้วย `src/lib/comment-rule-match.ts` (เจาะจงเพจ → priority → createdAt → id) · **คืนกฎเดียว** และ **ไม่ข้ามสวิตช์หลักของเพจ** |
| `CommentReplyLog.matchedRuleId` | String? (FK SetNull) | กฎที่ถูกใช้กับคอมเมนต์นี้ — NULL = ตกไปใช้ข้อความ fallback ของเพจ |
| `commentPublicReplyText` | String? `@db.Text` | ข้อความสวิตช์ A — เปิดสวิตช์แล้วข้อความว่างไม่ได้ (บังคับที่ Valibot) · **เก็บเป็น template:** `{ชื่อ}` = ชื่อ Facebook ของผู้คอมเมนต์ แทนค่าตอนส่งด้วย `renderCommentReplyText()` (`src/lib/comment-reply-template.ts` — SSOT ที่เดียว) ⇒ **ค่าที่เก็บกับค่าที่ลูกค้าเห็นไม่ใช่สตริงเดียวกัน** ห้ามเทียบตรง ๆ · ข้อความที่เหลือว่างหลังแทนชื่อถือเป็น `DISABLED` ไม่ส่งออก |
| `commentPrivateReplyEnabled` | Boolean default `false` | สวิตช์ "ทักแชทส่วนตัว" ต่อเพจ — แยกอิสระจากสวิตช์ A |
| `commentPrivateReplyText` | String? `@db.Text` | ข้อความสวิตช์ B |

**คอลัมน์กลุ่ม LINE (feature 00025 + ส่วนขยาย 2026-08-12)** — `provider='LINE'` เท่านั้นที่ใช้ ที่เหลือเป็น `NULL` ตลอด

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `channelSecretEnc` | String? | Channel secret ผ่าน AES-256-GCM — ใช้ตรวจ `x-line-signature`. Messenger/IG ใช้ app secret ระดับแอป จึงเป็น `NULL` เสมอ |
| `basicId` | String? | Basic ID ของ OA (`@xxxxxxx`) โชว์ให้ร้านยืนยันว่าเชื่อมถูกบัญชี |
| `quotaValue` / `quotaUsed` / `quotaFetchedAt` | Int? / Int? / DateTime? | cache โควตาข้อความรายเดือน TTL 5 นาที — 🛑 `quotaValue=null` ตัวเดียว **แยก "ไม่จำกัด" ออกจาก "ยังไม่เคยอ่าน" ไม่ได้** ต้องอ่านคู่ `quotaFetchedAt` เสมอ · อ่านไม่ได้ = **ไม่บล็อกการส่ง** (TD-006) |
| `lineTokenExpiresAt` | DateTime? | วันหมดอายุ access token จาก `POST /v2/oauth/verify` · **`NULL` = ไม่หมดอายุ หรือ ยังไม่เคยอ่าน** · 🛑 **ใช้เตือนเท่านั้น ห้ามอ่านในเส้นทางส่งข้อความ** (เป็นภาพนิ่ง — ร้าน revoke เมื่อไหร่ก็ได้) |
| `lineTokenCheckedAt` | DateTime? | เวลาที่อ่านค่าข้างบนล่าสุด — ต้องอ่านคู่กันเสมอ (กติกาเดียวกับ `quotaValue`/`quotaFetchedAt`) |
| `lineLastInboundFailAt` | DateTime? | เวลาที่ webhook ปฏิเสธ event ล่าสุด |
| `lineInboundFailCount` | Int default `0` | นับสะสม เคลียร์เป็น 0 เมื่อ ingest สำเร็จ |
| `lineLastInboundFailReason` | String? | `SIGNATURE_MISMATCH` \| `DESTINATION_NOT_FOUND` |

> 🛑 **ทำไมต้องมี 3 คอลัมน์ล่าง:** ลายเซ็นไม่ผ่านและ `destination` หาช่องทางไม่เจอ **ต้องตอบ HTTP 200 เสมอ**
> (BR-LINE-05/06) ⇒ ขาเข้าตายได้เงียบสนิทโดยไม่มีสถานะ ไม่มี error และ Vercel plan นี้ query runtime log
> ย้อนหลังไม่ได้ · เป็นเหตุผลเดียวกันที่ทำให้ `POST /v2/bot/channel/webhook/test` ของ LINE ตอบ
> `success:true` ได้ทั้งที่เราประมวลผล event ไม่ได้เลย — **ปุ่มตรวจสุขภาพต้องอ่านตัวนับนี้เป็นจังหวะที่สอง
> ห้ามเชื่อ `success` ของ LINE อย่างเดียว**

> 🛑 `ShopChannel` มี `accessTokenEnc` + `channelSecretEnc` อยู่แถวเดียวกัน — query ที่คืนคอลัมน์เหล่านี้
> ให้ client ต้อง `select` ระบุคอลัมน์เสมอ ห้ามคืนทั้งแถว

#### PageComment (`prisma/schema.prisma:2790`) — เวอร์ชันย่อ (feature 00038)

> 🛑 **หนี้เดิม:** ตารางเต็มยังไม่มี entry ในเอกสารนี้ (มาจาก feature 00029) ด้านล่างคือ**เฉพาะ
> คอลัมน์ใหม่**ที่ feature 00038 เพิ่มเข้ามา

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `isAutoReply` | Boolean default `false` | คำตอบใต้คอมเมนต์นี้ถูกเขียนโดยระบบตอบอัตโนมัติ (ไม่ใช่คนในทีมร้าน) — ใช้แยกสถานะที่ 3 "บอทตอบแล้ว". 🛑 **มีผู้เขียน 2 ราย** (เราเขียนตอน `replyToComment()` / webhook เขียนอีกครั้งตอน Meta echo กลับมา) — `ingestFeedComment`'s `update` block **ห้ามใส่คอลัมน์นี้เด็ดขาด** ไม่งั้นธงถูกรีเซ็ตเป็น `false` เงียบ ๆ ทุกครั้งที่ Meta echo (`docs/conventions/external-payload-schema.md`) |
| `resolvedAt` | DateTime? | **ส่วนขยาย 2026-08-19** — คอมเมนต์นี้ "จบงานแล้ว" โดยที่ระบบเราไม่ได้เป็นคนตอบ. `NULL` = ยังไม่จบงาน (ค่าของทุกแถวที่มีอยู่ก่อนวันนั้น — additive ไม่มี backfill) |
| `resolvedByUserId` | String? | ใครกด — `NULL` เมื่อระบบเป็นคนตั้งเอง. **plain String ไม่ผูก FK** ตามแพตเทิร์นเดิมของตารางเดียวกัน (`repliedByUserId`) |
| `resolvedReason` | String? | `MANUAL` (ผู้ขายกดข้ามเอง) / `ALREADY_REPLIED_EXTERNALLY` (Facebook ตอบ `(#10900)` = เพจทัก private reply ไปแล้วจาก Business Suite). 🛑 CHECK ที่ชั้นฐาน 2 ตัวบังคับ: ค่าที่ไม่รู้จักเขียนไม่ลง (`PageComment_resolvedReason_check`) และ `resolvedAt`/`resolvedReason` ต้องมี/ไม่มีพร้อมกัน (`PageComment_resolved_pair_check`) — ตัวแปลงฝั่ง TS (`toResolvedReason`) fail-closed คืน `null` เมื่อเจอค่าที่สาม |

#### CommentReplyLog (ใหม่ — feature 00038)

> ประวัติทุกครั้งที่ระบบตัดสินใจเกี่ยวกับคอมเมนต์หนึ่งอัน (ตอบหรือข้าม) ทั้งโหมดอัตโนมัติและแมนนวล —
> มิเรอร์ `AutoReplyLog` (feature 00023) และทำหน้าที่กันซ้ำในตัวผ่าน partial unique index

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `shopChannelId` | String FK → ShopChannel | cascade delete |
| `postId` | String | อ้างอิง `FacebookPost.id` — ไม่ประกาศ FK จริง (log อยู่รอดแม้โพสต์ถูกลบ) |
| `commentId` | String FK → PageComment | คอมเมนต์ต้นเหตุ — cascade delete |
| `fromExternalId` | String? | ผู้คอมเมนต์ (PSID) — `NULL` = payload ไม่ส่ง `from` มา |
| `trigger` | String | `"AUTO"` / `"MANUAL"` |
| `actorUserId` | String? | `MANUAL` = คนที่กด · `AUTO` = `NULL` เสมอ |
| `publicReplyStatus` / `privateReplyStatus` | String? | `"SENT"` / `"SKIPPED"` / `"FAILED"` |
| `skipReason` | String? | รหัสเหตุผลที่ข้าม — ดู `docs/20 - Features/00038 - Comment Auto-Reply/DATABASE.md` §3.4 |
| `errorMessage` | String? `@db.Text` | 🛑 **DEPRECATED (2026-08-10) ห้ามเขียนเพิ่ม** — อ่านได้เฉพาะแถวเก่าที่ backfill ไม่ถึง ดูเหตุผลใต้ตาราง |
| `publicErrorMessage` | String? `@db.Text` | เหตุผลที่ "ตอบใต้คอมเมนต์" ล้มเหลว — คู่กับ `publicReplyStatus='FAILED'` เท่านั้น |
| `privateErrorMessage` | String? `@db.Text` | เหตุผลที่ "ทักแชท" ล้มเหลว — คู่กับ `privateReplyStatus='FAILED'` เท่านั้น |
| `conversationId` | String? | ห้องที่เกิดจาก private reply (ถ้าสำเร็จ) |

**🛑 ทำไมเหตุผลความล้มเหลวต้องแยก 2 คอลัมน์ (migration `20260810090000_comment_reply_error_per_side`):**
"ตอบใต้คอมเมนต์" กับ "ทักแชท" เป็นงานอิสระต่อกัน (BR-CR-A5 — public ล้มไม่หยุด private) เดิมใช้
`errorMessage` ร่วมกันคอลัมน์เดียว ซึ่งพัง 2 ทาง: (1) ล้มทั้งคู่ → private เขียนทับ public เพราะรัน
ทีหลังเสมอ (2) **public ล้มแล้ว private สำเร็จ → โค้ดเขียน `NULL` ทับ เหตุผลฝั่งสาธารณะถูกล้างทุกครั้ง**
ร้านเห็นป้าย "ไม่สำเร็จ" เปล่า ๆ ไม่มีอะไรให้อ่าน (user รายงานเอง 2026-08-10: *"เพราะ reply ไม่ผ่าน
อาจจะทักแชทได้ก็ได้"*) · `skipReason` **ไม่ต้องแยก** เพราะเขียนที่ `recordSkip()` ที่เดียวก่อนยิงฝั่งไหน
ทั้งสิ้น = เหตุผลระดับแถวจริง

**🛑 Partial unique indexes (unmanaged SQL — Prisma DSL ประกาศไม่ได้ — ห้าม `prisma db pull`/`migrate dev`):**
- `(shopChannelId, postId, fromExternalId) WHERE trigger='AUTO'` — กันซ้ำโหมดอัตโนมัติ "1 ครั้ง/คน/โพสต์" (กฎของ Deep เอง กันบอทดูเป็นสแปม)
- `(commentId) WHERE trigger='MANUAL'` — กันซ้ำโหมดแมนนวล "1 ครั้ง/คอมเมนต์" (เพดานจริงของ Facebook) — **แยกจากกฎ AUTO โดยตั้งใจ** ถ้าใช้ index เดียวครอบทั้งคู่ คนที่คอมเมนต์ 2 ครั้งบนโพสต์เดียวกันจะถูกร้านทักด้วยมือได้แค่ครั้งเดียวทั้งที่ Meta อนุญาต 2 ครั้ง

**Indexes:** `[shopChannelId, createdAt]`, `[commentId]`

---

#### ChatMessage — เวอร์ชันย่อ (ส่วนขยาย 2026-08-23, คิวส่งข้อความขาออก)

> 🛑 **หนี้เดิม:** ตารางเต็มยังไม่มี entry ในเอกสารนี้ (feature 00011/00018) ด้านล่างคือ**เฉพาะคอลัมน์ใหม่**ที่ CR
> "คิวส่งข้อความแชทผู้ขายแบบเข้าคิว" (2026-08-23) เพิ่มเข้ามา — รายละเอียดเต็มดู
> `docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-08-23-outbound-queue.md`

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `sendLockedAt` | DateTime? | 🛑 เกณฑ์ความปลอดภัยของทั้งงาน: `NULL` = ยังไม่เคยแตะ Meta แน่นอน → ยิงได้ · มีค่า = เคยเริ่มยิงไปแล้ว ผลไม่แน่ชัด → **ห้าม claim ซ้ำ/ยิงซ้ำอัตโนมัติเด็ดขาด** |
| `sendLockedBy` | String? | ใครหยิบงานนี้ไปทำเป็นคนสุดท้าย: `'after'` \| `'sweep'` \| `'cron'` — **ไม่เคลียร์เมื่อสำเร็จ** โดยตั้งใจ บนแถว `SENT` มันจึงตอบว่า "ใครส่งสำเร็จ" (ใช้เป็นตัววัดหลัง deploy) |
| `sendPayload` | Json? | เจตนาการส่งที่ไม่มีคอลัมน์ของตัวเอง (sticker/template/messageTag) — มีความหมายเฉพาะตอน `deliveryStatus='QUEUED'` เท่านั้น ต้อง tolerate shape เก่า/ไม่รู้จัก (deploy กลางคิว = แถวนั้น `FAILED` ไม่ใช่ throw ทั้ง worker) |

`deliveryStatus` (คอลัมน์เดิม, `prisma/schema.prisma:1833`, `String?` ไม่มี CHECK constraint) เพิ่มค่าที่ 3
`'QUEUED'` — ปลายทางยังมีแค่ `SENT`/`FAILED` เหมือนเดิมทุกประการ ดูค่าครบทั้ง 4 ที่ §8.2d

**Index ใหม่:** partial `("conversationId","createdAt") WHERE "deliveryStatus"='QUEUED'` — ตารางนี้โต
~24,000 แถว/เดือน แต่แถวที่ค้างจริงมีหลักสิบ

---

### 6.x OrderPayment — เงินที่ "ได้รับจริง" (feature 00050, 2026-08-15)

> migration `20260815190000_service_queue_order_payment` — **additive ล้วน ไม่แตะคอลัมน์เดิม**

🛑 **แยกจาก `Order.depositAmount` และ `Order.slipFileId` โดยเจตนา** — สองอันนั้นคือ *ข้อตกลง*
กับ *รูปภาพ* ส่วนตารางนี้คือ *ข้อเท็จจริงว่ามีคนกดยืนยันว่าเงินเข้าแล้ว* ก่อนหน้านี้ระบบไม่มี
ที่เก็บคำตอบนี้เลย (โค้ดเขียนสารภาพไว้เองที่ `APPOINTMENT_SUMMARY_LABEL.deposit`)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | TEXT PK | |
| `orderId` | FK → `Order.id` | ON DELETE CASCADE (เหมือน `OrderItem`/`OrderEvent`) |
| `shopId` | TEXT | **denormalized** — รวมยอดระดับร้าน/รายวันโดยไม่ต้อง join |
| `kind` | TEXT | `DEPOSIT` \| `BALANCE` |
| `amount` | DECIMAL(12,2) | CHECK `> 0` (`OrderPayment_amount_positive`) |
| `method` | TEXT | `TRANSFER` \| `CASH` \| `OTHER` · default `TRANSFER` |
| `slipFileId` | TEXT? | สลิปของ **ก้อนนี้** — 1 งานมีหลายก้อน/หลายสลิปได้ |
| `receivedAt` | TIMESTAMP | เวลาที่ **ได้รับเงิน** (≠ `createdAt` — บันทึกย้อนหลังได้) |
| `receivedByUserId` | TEXT | 🛑 บังคับมีเสมอ — "มีสลิป ≠ ได้รับเงิน" ต้องมีคนยืนยัน |
| `note` | TEXT? | **บันทึกภายในของร้าน ห้ามส่งลงหน้าลูกค้า** |
| `voidedAt` / `voidedByUserId` / `voidedReason` | | ยกเลิกรายการ (soft) — ไม่ลบแถว |

**Index:** `@@index([shopId, receivedAt])` (dashboard รายวัน) · `@@index([orderId])` (relation load)

**Relation ใหม่บน `Order`:** `payments OrderPayment[]` — ไม่เปลี่ยนโครงตาราง `Order`

🛑 **ไม่มีทาง `update` ยอดเงิน** ทั้งใน service และ API (มติหัวหน้า *"จ่ายมาแล้ว แก้ไม่ได้"*)
กรอกผิด = ยกเลิกรายการแล้วบันทึกใหม่ (การกลับรายการทางบัญชี)

#### 6.x.0 "ได้เงินหรือยัง" — เจ้าของคำตอบแยกตามประเภทร้าน (2026-08-31)

ระบบมีกลไกบันทึกเงิน **3 ตัวที่ไม่เขียนถึงกัน** ต้องรู้ว่าตัวไหนเป็นความจริงของร้านแบบไหน

| ประเภทร้าน / เงื่อนไข | เจ้าของคำตอบ | ฟีเจอร์ |
|---|---|---|
| `SERVICE_QUEUE` | **ตาราง `OrderPayment`** (มัดจำ + ส่วนที่เหลือ · รู้จำนวนเงิน) | 00050 |
| `ONLINE_SALES` · `LODGING` (ไม่ใช่ COD) | `Order.paymentConfirmedAt` (ธงใบเดียว · ไม่มีจำนวนเงิน) | 00062 |
| COD ทุก vertical | `Order.codReceivedAt` | เดิม |

🛑 **`Order.status === 'CONFIRMED'` ไม่ใช่คำตอบของคำถามนี้** — มันแปลว่า *ผู้ซื้อยืนยันว่าได้รับ
ของ/บริการแล้ว* ซึ่งเป็นตัวแทนที่ใช้ได้กับร้านขายของ (จ่ายก้อนเดียวก่อนรับของ) แต่ **ผิดกับร้านบริการ**
ที่จ่ายมัดจำ → เข้ารับบริการ → เก็บส่วนที่เหลือ ⇒ ใบที่ปิดงานแล้วแต่ยังไม่เก็บเงินเป็นเรื่องปกติ

`getPaymentBadge(status, paymentMethod, slipFileId, paymentConfirmedAt, money?)` —
พารามิเตอร์ที่ 5 คือทางที่บัญชีเงินเข้ามา **ชนะ `status` เสมอเมื่อมี** · ไม่ส่ง = ตรรกะเดิมทุกบรรทัด
(เป็นพารามิเตอร์ของฟังก์ชันเดิม ไม่ใช่ฟังก์ชันที่สอง — HR16)

🛑 **ห้ามให้ทั้งสองระบบโผล่บนบิลเดียวกัน** — เคยเกิดจริงบนบิลบริการ: ปุ่ม "รับเงินแล้ว" (บัญชี)
กับ "ได้รับเงินแล้ว" (ธง) อยู่ในหน้าเดียว กดคนละปุ่มได้ผลคนละอย่างโดยไม่มีอะไรฟ้อง
ด่านอยู่ที่ `OrderDetailClient.tsx` (`!isServiceQueue` หน้า `<PaymentReceivedCard>`) +
เทส `[blocker]` `src/lib/__tests__/payment-truth-per-vertical.test.ts`

**กติกานี้ครอบ 3 จอ ไม่ใช่แค่จอร้าน** (2026-08-31) — `/orders/{token}` (ร้าน) ·
`/o/{token}` ทั้งแบบล็อกอินและแบบผู้ถือลิงก์

🛑 **จอผู้ซื้อสองแบบต้องกินตัวเลขชุดเดียวกัน** — `o/[token]/page.tsx` คำนวณ `serviceMoney`
**ครั้งเดียวเหนือจุดแยกสาขา** `if (!session || !viewerUserId)` แล้วส่งให้ทั้งสองทาง
แก้ข้างเดียว = บิลใบเดียวกันขึ้นป้ายคนละอย่างก่อน/หลังล็อกอิน · จอ guest ได้ยอด
"จ่ายมาแล้ว/ยอดค้างชำระ" ด้วย (allow-list — ดู `00041/SRS.md`) แต่ **ไม่มี `entries`**
ด่าน: `buyer-seller-payment-parity.test.ts`

#### 6.x.1 ตัวคำนวณและเกณฑ์ที่ผูกกับตารางนี้ — `src/lib/order-payment.ts` (SSOT · HR16)

| ฟังก์ชัน | ตอบคำถาม | ห้าม |
|---|---|---|
| `computeOrderMoney()` | ยอดรวม/มัดจำ/รับแล้ว/ค้าง ของใบหนึ่ง | ห้ามบวกเองที่จอ — ตัวตัดยอดที่ถูกยกเลิก (`voidedAt`) อยู่ในนี้ |
| `computeOrderMoneyFromSerialized()` | เหมือนบน แต่รับค่าที่ข้าม RSC/JSON boundary มาแล้ว | ห้ามแต่ละจอ `Number(x)`/`new Date(y)` เอง |
| `hasMoneyStory()` | "ใบนี้มีเรื่องเงินให้พูดถึงไหม" = `totalReceived > 0 \|\| hasDeposit` | ห้ามเขียนนิพจน์ซ้ำที่จุดเรียก · **ไม่ใช่ด่าน vertical และใช้แทนกันไม่ได้** |

🛑 `hasMoneyStory()` ตัดสิน **3 จอพร้อมกัน** (รายการ `/orders` · หน้ารายละเอียดฝั่งร้าน ·
หน้าลูกค้า `/o/[token]`) เดิมเป็นนิพจน์ดิบเขียนซ้ำ 2 ที่โดยไม่มีเทสผูก — และรอบที่เพิ่มหน้ารายการ
เข้ามาเป็นที่ที่สาม ก็เกือบเขียนซ้ำอีก. เพี้ยนที่เดียว = **ใบเดียวกันขึ้นป้ายคนละคำในสองจอ
ห่างกันหนึ่งคลิก** โดยไม่มี `tsc`/build ตัวไหนฟ้อง เพราะทุกนิพจน์ถูกตามชนิด

**`getOrdersByShop(shopId, status?, opts?)`** รับ `opts.withPayments` — join แถวเงินเฉพาะร้าน
`SERVICE_QUEUE` (query นี้ไม่มีการแบ่งหน้า ดึงออเดอร์ทั้งร้านครั้งเดียว ต้นทุนโตตามจำนวนออเดอร์)
🛑 เงื่อนไขที่ใช้ดึง กับเงื่อนไขที่ใช้คำนวณ ต้องเป็น **สัญลักษณ์ตัวเดียวกัน** — แยกกันเมื่อไรจะเกิด
เคส "คำนวณเงินโดยไม่มีแถวเงินอยู่ในมือ" ซึ่งอ่านไม่ต่างจาก "ยังไม่จ่ายสักบาท" เลย
(ด่าน: `src/lib/__tests__/service-queue-vertical-gate.test.ts`)

### 6.z แผนการตรวจสอบร้านค้า — Shop Inspection Plan (feature 00060 — Draft, ยังไม่ implement)

> **สถานะ: Draft** — เอกสาร PRD/BRD/DATABASE/API ของ feature 00060 ผ่าน draft รอบสุดท้ายแล้ว
> (2026-08-29) แต่ **ยังไม่มี migration/โค้ดจริงบนดิสก์** ตาม Hard Rule 11 (Doc-First) ต้องรอ user
> review ผ่านก่อนจึง implement — section นี้ sync ล่วงหน้าเพื่อไม่ให้เป็นหนี้เอกสารซ้ำ (บทเรียน 00033)
> เมื่อ implement จริงแล้วให้ตัดป้าย "Draft, ยังไม่ implement" ออกและยืนยันเลขคอลัมน์/enum กับ
> `prisma/schema.prisma` อีกครั้ง
>
> โมดูลนี้เป็นแกนความน่าเชื่อถือที่ **แยกขาดจาก Trust Score/Trust Tier โดยสมบูรณ์** — ห้ามมีคอลัมน์/
> query ใดในกลุ่มนี้แตะ `trust-score.service` เลยแม้แต่บรรทัดเดียว (ดู `CONTEXT.md` หัวข้อ
> "ความน่าเชื่อถือ: สองแกน") · ห้ามใช้คำว่า "ระดับ/Level/Tier" — คำที่ใช้คือ **ขั้นการตรวจสอบ (step)**
>
> เอกสารต้นทาง: `docs/20 - Features/00060 - Shop Inspection Plan/{PRD,BRD,SRS,DATABASE,API}.md`

**คอลัมน์ใหม่บน `User`:** `isInspector Boolean @default(false)` — ไม่มีความสัมพันธ์เชิงลำดับชั้นกับ
`isAdmin` (ผู้ตรวจส่วนใหญ่เป็นบุคคลภายนอกที่จ้างรายครั้ง ไม่ใช่ทีมภายใน) · **ไม่มี endpoint ตั้งค่านี้
ในสัญญา API ที่ล็อกแล้ว (15 endpoint)** — ตั้งผ่าน DB โดยตรงเหมือน `User.isAdmin` (ดู §9.6)

#### `InspectionPlan` — 1 ร้าน 1 แผน (มิเรอร์โครง `InventoryEntitlement`)

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `shopId` | uuid | NO | FK → `Shop.id`, **UNIQUE** |
| `step` | int | NO | CHECK 1-4 — ขั้นการตรวจสอบปัจจุบัน |
| `status` | `InspectionPlanStatus` | NO | `ACTIVE \| LAPSED` **เท่านั้น — ห้ามเพิ่มค่าที่ 3** |
| `lapsedReason` | text? | YES | `"RENEWAL_FAILED"` \| `"OWNER_CANCELLED"` — String ตาม convention (ไม่มี DB CHECK) |
| `canceledAt` | timestamptz? | YES | OWNER กดยกเลิก — มีผลตอนสิ้นรอบบิล ไม่ใช่ทันที |
| `graceUntil` | timestamptz? | YES | เส้นตายผ่อนผันเมื่อหักเครดิตไม่สำเร็จ |
| `nextRenewalAt` | timestamptz | NO | = "สิ้นรอบบิล" ในตัวเอง — **ไม่มี `currentPeriodEnd` แยก** (ความหมายเดียวกัน, HR16) |
| `termsAcceptedAt` | timestamptz | NO | แคชค่าล่าสุด — แหล่งความจริงคือ `InspectionTermsAcceptance` |

🛑 **"ยกเลิกแล้วแต่ยังไม่หมดรอบ" = `status='ACTIVE' AND canceledAt IS NOT NULL` ไม่ใช่ค่าที่สามของ
enum** — ระหว่างนี้ป้ายบนโปรไฟล์สาธารณะยังแสดงปกติทุกประการ (ข้อตรวจอัตโนมัติยังรัน · รอบที่ค้างอยู่
ยังถูกทำต่อจนจบ)

#### `InspectionRound` — การตรวจหนึ่งครั้ง (ตัวมอบหมายงาน + ภาชนะหลักฐาน)

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `shopId` / `roomId` | uuid / uuid? | NO / YES | `roomId=NULL` = รอบระดับร้าน |
| `step` | int | NO | CHECK 1-4 |
| `method` | `InspectionMethod` | NO | `AUTO \| DOCUMENT \| VIDEO_CALL \| ONSITE` — **ไม่ผูกกับ `step` แบบ 1:1** |
| `inspectorUserId` | uuid? | YES | FK → `User.id` — NULL เมื่อ `method='AUTO'` **หรือ** เป็นรอบที่ cron สร้างล่วงหน้ายังไม่มอบหมาย |
| `inspectorDisplayName` | text | NO | **snapshot ชื่อ ณ รอบนั้น ไม่ใช่ live join** — ผู้ตรวจถูกแก้โปรไฟล์ทีหลังไม่กระทบประวัติเก่า |
| `assignedAt` | timestamptz | NO | เข้าคิวเมื่อไร — มีค่าเสมอแม้ยังไม่มีผู้ตรวจตัวจริง |
| `dueAt` | timestamptz? | YES | ควรเสร็จเมื่อไร (ผูกกับ `expiresAt` ของข้อตรวจ) — **คนละความหมายกับ `assignedAt`** |
| `completedAt` | timestamptz? | YES | `NULL` = คิวรอผู้ตรวจ — สถานะภายใน ผู้ซื้อห้ามเห็น |

🛑 **cron `/api/cron/inspection-lifecycle` ต้องสร้างรอบล่วงหน้าเองสำหรับข้อตรวจขั้น 2-4 ที่ใกล้หมดอายุ**
(lead time: `DOCUMENT`/`VIDEO_CALL` 14 วัน, `ONSITE` 30 วัน) — ถ้าไม่มีกลไกนี้ ร้านที่จ่ายเงินต่อเนื่อง
จะเห็นป้ายของตัวเองตกเป็น "รอตรวจซ้ำ" ทีละข้อโดยไม่มีใครมาตรวจซ้ำเลย ทั้งที่โค้ดถูกทุกบรรทัด (ฟีเจอร์
เสื่อมเองเงียบ ๆ ภายใน 6-12 เดือน) — จัดกลุ่มรอบตาม `(shopId, roomId, method)` ไม่ใช่รายข้อตรวจ

#### `InspectionResult` — ประวัติ "ช่วงที่ผลคงที่" ต่อข้อ (ผสม insert/update ไม่ใช่ append-only ล้วน)

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `shopId` / `roomId` | uuid / uuid? | NO / YES | `roomId=NULL` = ข้อผูกร้าน |
| `checkKey` | text | NO | 1 ใน 18 คีย์คงที่ — SSOT `src/lib/inspection/checks.ts` (ไม่ใช่ตาราง DB) |
| `roundId` | uuid? | YES | รอบที่ยืนยัน/สร้างแถวนี้**ล่าสุด** — `NULL` เมื่อเป็นแถว invalidate ที่ระบบสร้างเอง |
| `outcome` | `InspectionOutcome` | NO | `PASS \| FAIL \| NOT_APPLICABLE` **เก็บแค่ 3 ค่า** |
| `checkedAt` | timestamptz | NO | เวลาตัดสินครั้งแรก — เขียนครั้งเดียวตอน INSERT **ห้ามแก้อีกเลย** |
| `lastConfirmedAt` | timestamptz | NO | เวลายืนยันผลเดิมล่าสุด — UPDATE ได้ทุกครั้งที่ผลไม่เปลี่ยน |
| `expiresAt` | timestamptz? | YES | `= lastConfirmedAt + ttlDays(checkKey)` **ไม่ใช่นับจาก `checkedAt`** |
| `invalidatedAt` / `invalidatedReason` | timestamptz? / text? | YES | เปลี่ยนภาพประกาศ (`photos_match`) → เขียนแถวใหม่เสมอ |

🛑 **ไม่มี unique constraint บน `(shopId, checkKey)` หรือ `(roomId, checkKey)` ทั้งเต็มรูปและ partial**
— ถ้ามี ประวัติของช่วงก่อนหน้าจะหายทันทีที่ผลเปลี่ยน โดยไม่มีคำสั่งลบสักบรรทัดให้สังเกต

🛑 **สถานะที่ผู้ใช้เห็นมี 5 ค่า แต่คอลัมน์เก็บมี 3 ค่า** — 2 ค่าที่เหลือเป็น derived state
**ห้ามเก็บเป็นคอลัมน์เด็ดขาด**:

| สถานะที่แสดง | มาจาก |
|---|---|
| ผ่าน (`PASS`) | แถวล่าสุด `outcome='PASS'` และยังไม่หมดอายุ/ไม่ถูก invalidate |
| ไม่ผ่าน (`FAIL`) | แถวล่าสุด `outcome='FAIL'` |
| ไม่เกี่ยวกับร้านประเภทนี้ (`NOT_APPLICABLE`) | แถวล่าสุด `outcome='NOT_APPLICABLE'` |
| รอตรวจซ้ำ (`RECHECK_DUE`, derived) | แถวล่าสุด `outcome='PASS'` และ (`expiresAt <= now` หรือ `invalidatedAt` ไม่ว่าง) |
| ยังไม่มีข้อมูล (`NO_DATA`, derived) | ไม่มีแถวเลยสำหรับคู่ `(scope, checkKey)` นั้น |

**Tie-break หา "แถวล่าสุด" ต้องเป็นสูตรเดียวกันเป๊ะทั้ง TypeScript และ SQL:**
`ORDER BY checkedAt DESC, id DESC` — cron ของขั้น 1 เขียนหลายข้อของร้านเดียวกันในทรานแซกชันเดียว ⇒
`checkedAt` ซ้ำวินาทีกันเป็นเรื่องปกติของระบบนี้ ไม่ใช่ edge case (SSOT: `src/lib/inspection/result-status.ts`)

**สองคอลัมน์วันที่ห้ามสลับกัน:** `checkedAt` = "ผลเป็นค่านี้ตั้งแต่เมื่อไร" (นิ่ง) ·
`lastConfirmedAt` = "ตรวจล่าสุดเมื่อไร" (เลื่อนได้) — ป้าย "ตรวจล่าสุด" บนหน้าจอต้องอ่านจาก
`lastConfirmedAt` เท่านั้น ไม่งั้นข้อที่ผลนิ่งมานาน (สุขภาพดีที่สุด) จะโกหกผู้ใช้ว่าไม่ได้ถูกตรวจมานาน

#### `InspectionEvidence` — หลักฐานของรอบตรวจ

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `roundId` | uuid | NO | FK → `InspectionRound.id` |
| `resultId` | uuid? | YES | FK → `InspectionResult.id` — ผูกหลักฐานกับผลตรวจแถวใดแถวหนึ่งโดยเฉพาะ |
| `visibility` | `InspectionEvidenceVisibility` | NO | **default `PRIVATE` (fail-closed)** — ห้ามแก้เป็น `PUBLIC` |
| `kind` | `InspectionEvidenceKind` | NO | `PHOTO \| VIDEO_STILL \| DOCUMENT \| GEO` |
| `fileId` | text? | YES | CHECK: `fileId` หรือคู่ `(lat, lng)` ต้องมีอย่างน้อยหนึ่งอย่าง |
| `lat` / `lng` | decimal(9,6)? | YES | ใช้กับ `kind='GEO'` |

🛑 **`default='PRIVATE'` คือ fail-closed** — หลักฐานปิด (บัตรประชาชน/โฉนด/สเตทเมนต์/บัญชีธนาคาร) กับ
หลักฐานสาธารณะ (ภาพที่พัก) ใช้ตาราง**เดียวกัน** แยกด้วยคอลัมน์นี้คอลัมน์เดียว — ลืมส่งค่าจุดใดจุดหนึ่ง
= รั่วสู่สาธารณะทันที

#### `InspectionTermsAcceptance` — append-only แท้ ๆ

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `shopId` | uuid | NO | FK → `Shop.id` |
| `acceptedAt` | timestamptz | NO | เวลาที่กดยอมรับ |
| `step` | int | NO | CHECK 1-4 — ขั้นที่กำลังจ่ายในครั้งนั้น |
| `priceSnapshotBaht` | int | NO | ราคาที่แสดงให้ร้านเห็น ณ ตอนนั้น (snapshot — ราคาจะเปลี่ยนในอนาคต) |
| `termsVersion` | text | NO | เวอร์ชันข้อความเงื่อนไข ณ ตอนนั้น |

บันทึก**ทุกครั้ง**ที่ OWNER รับทราบเงื่อนไข "ไม่คืนเงิน + เส้นทางกรณีพบหลักฐานฉ้อโกง" ก่อนจ่ายเงิน
(สมัคร/อัปเกรด/ต่ออายุ) — `InspectionPlan.termsAcceptedAt` เก็บได้แค่ค่าล่าสุดจึงไม่พอเป็นหลักฐาน
ย้อนหลัง 🛑 **INSERT ในทรานแซกชันเดียวกับการหักเครดิตเสมอ ห้าม update แถวเดิม**

#### `InspectionIntakeQuota` — โควตารับสมัครใหม่รายเดือนต่อขั้น (ไม่มี FK ไปร้านใด)

| Column | Type | Null | หมายเหตุ |
|---|---|---|---|
| `periodYearMonth` | text | NO | รูปแบบ `"YYYY-MM"` ค.ศ. — ส่วนหนึ่งของ `@@unique` |
| `step` | int | NO | ส่วนหนึ่งของ `@@unique` |
| `capacity` | int | NO | เพดานจำนวนร้านใหม่ |
| `usedCount` | int | NO | default 0 |

🛑 **"ไม่มีแถว = โควตา 0 = ปิดรับ" (fail-closed ไม่ใช่ "ไม่จำกัด")** — นับแบบ conditional
`updateMany` (`usedCount < capacity`) ห้าม read-then-write แยกคำสั่ง · cron สร้างแถวเดือนถัดไป
ล่วงหน้าให้เองแบบ upsert idempotent โดยคัดลอก `capacity` ของเดือนปัจจุบัน

---

## §7 API Reference

> ทุก endpoint อยู่ใต้ `/api/` — ดู `src/app/api/**/route.ts`
> **CSRF guard:** POST/PUT/PATCH/DELETE ทุกตัว (ยกเว้น `/api/auth/*`) ต้องผ่าน Origin-check ใน `guardApi` (`src/proxy.ts:11`) — Origin ต้องอยู่ใน allowlist `*.deepthailand.app` / `*.deepth.local`
> **Rate-limit:** unauth 100 req/min, auth 30 req/min per-IP (in-memory globalThis; Vercel per-instance = known gap, Redis = Phase 2) — แยกจาก OTP rate-limit (3/10min/เบอร์)

> 🛑 **ตัวตนของผู้เรียก (เพิ่ม 2026-08-11):** ทุก route/page ที่ต้องรู้ว่า "ใครเป็นคนขอ" ต้องอ่าน id ผ่าน **`sessionUserId(session)` (`src/lib/session-user.ts`) เท่านั้น** — `session` callback เติม `user.id` ให้เฉพาะตอน `token.userId` มีค่า **และ** หาแถว `User` เจอจริง ⇒ **session ที่ไม่เป็น null แต่ไม่มี `id` เกิดได้** (โทเคนเก่า/ผู้ใช้ถูกลบ). แพตเทิร์นเดิม `if (!session?.user)` แล้ว `(session.user as { id: string }).id` เคยมี **58 จุด** และทำให้ `undefined` ไหลเข้า `prisma.…({ where: { id: undefined } })` ⇒ **500 ทั้งหน้า** (เกิดจริงบน prod ที่ `/o/[token]`, digest 3758181775). helper คืน `string | null` **ห้าม throw** และผู้เรียกตัดสินเองว่า 401 / redirect / **ตกไปจอ guest** · เทส `[blocker]` สแกน `src/app/` กันแพตเทิร์นเดิมกลับมา · `docs/conventions/session-exists-is-not-identity.md`

### 7.1 Auth / OTP

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| POST | `/api/auth/[...nextauth]` | — | NextAuth.js handler (FB OAuth + `seller-credentials` + `phone-otp` credentials) | `lib/auth.ts` |
| POST | `/api/login` | — | Phone-OTP login (custom endpoint) | `lib/auth.ts` |
| POST | `/api/otp/send` | Guest | ส่ง OTP SMS — rate-limit 3/10min/เบอร์; คืน `isNewUser` | `lib/otp.ts` |
| POST | `/api/otp/verify` | Guest | ตรวจ OTP 6-digit | `lib/otp.ts` |
| POST | `/api/account/link/start` | Seller | เริ่มผูก OAuth เพิ่ม — ออก link-intent cookie (HMAC, TTL 5 นาที; Apple = `SameSite=None` เพราะ `response_mode=form_post` เป็น cross-site POST) | `lib/link-intent.ts` |
| POST | `/api/account/link/send-otp` | Seller | ส่ง OTP ยืนยันก่อนถอดการเชื่อม — **400 ถ้าบัญชีไม่มีเบอร์** | `lib/otp.ts` |
| POST | `/api/account/link/remove` | Seller | ถอดการเชื่อม (ต้องมี OTP) | `lib/auth.ts` |
| POST | `/api/account/link/reclaim` | Seller | ย้ายการเชื่อมคืนจากบัญชีค้าง **หลังผู้ใช้กดยืนยัน** — รับ ticket เซ็นชื่อ (HMAC, TTL 10 นาที, ผูก `userId` ผู้ขอ) แล้ว **ตรวจสถานะซ้ำทั้งหมดอีกรอบ** ก่อนย้าย+ปิดบัญชีค้างในทรานแซกชันเดียว | `lib/link-conflict.ts` |

### 7.2 Users

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/users/me` | Buyer/Seller | ดึง profile ตัวเอง (session-scoped) | `user.service` |
| PATCH | `/api/users/me` | Buyer/Seller | แก้ profile ตัวเอง — **allow-list `UpdateProfileSchema` เท่านั้น** (`displayName`/`username`/`avatar`/`chatScopeMode`) ห้ามเพิ่ม field ที่ผู้ใช้ไม่ควรตั้งเอง (เคยมีช่องยิง `{"isAdmin":true}`) | `user.service` |
| GET | `/api/users/check-username` | Guest | ตรวจว่า username ว่างหรือไม่ | `user.service` |
| GET | `/api/users/check-phone` | Guest | ตรวจว่าเบอร์มีบัญชีแล้วหรือไม่ → `{available:bool}` — rate-limit guardApi | `user.service` |

### 7.2b Account (Seller — authed)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| POST | `/api/account/set-password` | Guest (OTP-verify flow) | verify OTP แล้ว set `passwordHash` — ใช้ใน signup + reset-password | `lib/auth.ts` |
| POST | `/api/account/set-phone` | Seller (authed) | ตั้งเบอร์โทร (OTP ยืนยันแล้ว) + สร้าง L1 PHONE_OTP verification — **immutable: ตั้งครั้งเดียว ถ้ามีเบอร์แล้ว → 409** | `user.service` |
| POST | `/api/account/shop-info` | Seller (authed) | upsert displayName / username (dedupe) / category ของร้าน ตอน onboarding | `shop.service` |

### 7.3 Shops

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| POST | `/api/shops` | Buyer | สร้างร้าน (set `isShop=true`) | `shop.service` |
| GET | `/api/shops/[id]` | — | ดู shop detail | `shop.service` |
| PATCH | `/api/shops/[id]` | Seller-owner | แก้ข้อมูลร้าน (รวม `latitude`/`longitude` ตั้งแต่ 2026-08-14 — ดู FR-SHOP-GEO) | `shop.service` |
| GET | `/api/shops/check-slug` | Guest | ตรวจ slug ว่าง/ซ้ำ/reserved → `{available:bool}` | `shop.service` (isSlugAvailable) |
| POST | `/api/shops/slug` | Seller (authed) | ตั้ง `Shop.slug` (ครั้งแรกเท่านั้น; ถ้ามีแล้ว → 409 `SLUG_ALREADY_SET`) | `shop.service` (setShopSlug) |

**FR-SHOP-GEO — พิกัดร้าน (`Shop.latitude`/`Shop.longitude`)**

| กฎ | รายละเอียด |
|---|---|
| ทางเข้าที่เขียนคอลัมน์นี้ได้ | `POST /api/business/shops` (ตอนสร้างธุรกิจ) · `POST /api/shops/update` (onboarding ร้านส่วนตัว) · **`PATCH /api/shops/[id]`** (แก้ทีหลัง — เพิ่ม 2026-08-14) |
| ต้องมาเป็นคู่ | ส่ง `latitude` หรือ `longitude` มาตัวเดียว → `400 GEO_PAIR_REQUIRED` (หมุดที่มีแต่ละติจูดวางบนแผนที่ไม่ได้) |
| ขอบเขต | lat 5–21N · lng 97–106E — นอกกรอบ → `400 GEO_OUT_OF_RANGE`. ค่าคงที่อยู่ที่ `src/lib/geo-thailand.ts` **ที่เดียว** (HR16) — `ShopUpdateWithGeoSchema` และ `CreateBusinessShopSchema` import ไปใช้ ห้ามพิมพ์ตัวเลขซ้ำ |
| เจตนาของด่านขอบเขต | กัน `0,0` (ค่าตั้งต้นของตัวแปรที่ลืมเซ็ต ซึ่งผ่านด่าน `!= null` ได้) และกัน lat/lng สลับกัน — ไม่ใช่การตรวจว่าอยู่ในเขตแดนจริง |
| หน้าจอที่แก้ได้ | `/shop` → การ์ด "ตำแหน่งร้าน" (`ShopLocationField`) — โผล่เฉพาะร้าน `SERVICE_QUEUE`/`LODGING` ตาม `verticalRequiresStorefrontLocation()` เกณฑ์เดียวกับที่วิซาร์ดสร้างธุรกิจใช้บังคับขั้น "ที่ตั้งร้าน" |
| ที่ค่านี้ถูกใช้ | ปุ่มเปิด Google Maps บนโปรไฟล์สาธารณะ (`AboutOverview.tsx` เช็ค `hasPin`) · `channel-chat.service` / LINE webhook |

> 🛑 **บันทึกเหตุ 2026-08-14:** ก่อนวันนี้ **ไม่มีทางไหนแก้พิกัดร้านได้เลยหลังสร้าง** (`POST /api/shops/update` hardcode `kind:'PERSONAL'` และถูกเรียกจาก onboarding เท่านั้น) และวิซาร์ดสร้างธุรกิจ **ทิ้งพิกัดไปทั้งดุ้นตอนประกอบ payload** ⇒ ตรวจฐาน prod วันเดียวกันแล้ว **ไม่มีร้านไหนมีพิกัดสักร้าน (0 จาก 9)** ทั้งที่ขั้น "ปักหมุด" บังคับกรอกและกดผ่านไม่ได้ ⇒ ปุ่มดูแผนที่บนโปรไฟล์สาธารณะไม่เคยขึ้นให้ร้านไหนเลยตั้งแต่วันแรก

### 7.3b Shops — ตัวจัดหน้าร้าน (Page Builder, feature 00035)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/shops/current/page-builder/library` | Seller (OWNER/ADMIN ของ active shop) | คลังบล็อกที่เพิ่มได้ — เหรียญ `ACHIEVEMENT` ที่ร้าน/ผู้ใช้นี้ได้รับจริง + โพสต์ Facebook ของเพจที่เชื่อมไว้ (ค้นหา `?q=`/แบ่งหน้า `?cursor=&take=`) — ไม่รู้จัก draft state (client คำนวณ "เพิ่มแล้ว" เอง) | `shop-page-layout.service` (`getBuilderLibrary`) |
| POST | `/api/shops/current/page-builder/facebook-posts/mirror` | Seller (OWNER/ADMIN) | mirror รูปปกโพสต์ 1 โพสต์ลง storage ของเรา — เรียกตอนกด "+" ในคลัง **ก่อน** Save, idempotent, ไม่ persist `ShopPageBlock` ใด ๆ | `shop-page-layout.service` (`mirrorFacebookPostForBuilder`), reuse `mirrorRemoteImage()` (feature 00018) |
| PUT | `/api/shops/current/page-builder` | Seller (OWNER/ADMIN) | บันทึกผัง — แทนที่ `tabOrder` + `ShopPageBlock` ทั้งชุดของร้านในทรานแซกชันเดียว (ไม่แตะ `isPublished`) | `shop-page-layout.service` (`saveShopPageLayout`) |
| PATCH | `/api/shops/current/page-builder/publish` | Seller (OWNER/ADMIN) | สลับสถานะเผยแพร่ทั้งหน้า — endpoint เดียวใช้ร่วมทั้ง desktop builder toolbar และ `/public-profile` มือถือ | `shop-page-layout.service` (`setShopPagePublished`) |

> **Auth:** session → `requireActiveShop()` (ไม่มี active shop → `404 NOT_FOUND`) → `canAccessShop()` เป็น defense-in-depth ชั้นสอง (`403 FORBIDDEN`) — ไม่มีเช็ค `role` แยกอีกชั้น เพราะ `ShopMember.role` มีแค่ `OWNER`/`ADMIN` สองค่าเท่านั้นที่มีอยู่จริงในระบบ (ไม่มี STAFF) — `canAccessShop` true ของทั้งคู่พอดีตรงกับ FR-9.12–9.14
> **Error response shape ต่างจาก endpoint อื่นในเอกสารนี้:** `{error:{code,message,details}}` (ไม่ใช่ flat `{error:"text",code}}`) — error code: `VALIDATION_ERROR`(400) `UNAUTHORIZED`(401) `NOT_FOUND`(404) `FORBIDDEN`(403) `NOT_OWNED`(403, resource ไม่ใช่ของร้านนี้จริง) `CONFLICT`(409, โพสต์ซ้ำในชุดเดียวกัน/ชนกับ partial unique index) — รายละเอียดเต็ม `docs/20 - Features/00035 - Shop Page Builder/API.md` §5

### 7.3c Shops — ปฏิทินคิวงาน (feature 00024)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/shops/current/appointments` | Seller (member ของ active shop) | นัดของช่วงเวลา (ปฏิทินยิงครอบทั้งเดือน) — `?from&to` ISO บังคับ, `?resourceId` ไม่บังคับ · **ไม่มีข้อมูลติดต่อลูกค้า** | `appointment.service` (`listAppointments`) |
| GET | `/api/shops/current/appointments/day` | Seller (member ของ active shop) | นัดของ **หนึ่งวัน** พร้อมข้อมูลติดต่อ — `?date=YYYY-MM-DD` (ปฏิทินไทย) บังคับ, `?resourceId` ไม่บังคับ · คืน `buyerContact` · `customerAvatarUrl` · `source{channel,pageName,pageAvatarUrl}` · `conversationId` | `appointment.service` (`listAppointmentsForDay`) |

> 🛑 **สองตัวนี้ห้ามยุบเป็นตัวเดียว** (TFR-010 ฉบับแก้ 2026-08-11) — หน้า `/queues` อยู่ใต้ client layout
> ทุก field ถูก serialize เข้า flight payload. ตัวบนยิงครอบทั้งเดือน การเติมเบอร์ลงไปแปลว่าเบอร์ลูกค้า
> ทั้งเดือน (ร้านที่ยุ่ง 100–200 เบอร์) นอนอยู่ใน page source เพื่อแสดงผลวันเดียว
>
> 🛑 ตัวล่าง **รับ `date` ไม่รับ `from`/`to`** โดยตั้งใจ — เพดานถูกบังคับด้วย *รูปร่างของ input*
> ไม่ใช่ด้วยความตั้งใจของผู้เรียก · `400 VALIDATION_ERROR` เมื่อรูปแบบผิด **หรือเป็นวันที่ไม่มีอยู่จริง**
> (เช็ค roundtrip ไม่ใช่แค่ regex — `2569-02-31` ผ่าน regex แต่ `Date.UTC` จะม้วนไปวันอื่นเงียบ ๆ)
>
> **อีเมลไม่ส่งออกทั้งสองตัว** · รูปลูกค้าหาด้วยคู่ `(shopChannelId, customerId)` เท่านั้น (PSID เป็น page-scoped)
> · `customerAvatarUrl = null` เป็นค่าปกติ ไม่ใช่ error — Meta บล็อกรูปโปรไฟล์ Messenger ทั้งหมดอยู่
>
> รายละเอียดเต็ม: `docs/20 - Features/00024 - Service Appointment Booking/API.md` §4.5 / §4.5b

### 7.4 Products

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/products` | Seller | ดู product list ของร้านตัวเอง — รับ **`?shopId=`** optional (ร้านของเธรดในกล่องแชทรวม; ไม่ส่ง = ร้านที่ active · รูปแบบผิด → 400 · ไม่มีสิทธิ์ → รายการว่าง) | `product.service` |
| POST | `/api/products` | Seller | สร้าง product | `product.service` |
| GET | `/api/products/[id]` | Seller | ดู product detail | `product.service` |
| PATCH | `/api/products/[id]` | Seller-owner | แก้ product | `product.service` |
| DELETE | `/api/products/[id]` | Seller-owner | ลบ product | `product.service` |
| GET | `/api/tags` | Seller | autocomplete tag | — |

### 7.5 Orders

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/orders` | Buyer/Seller | ดู order list — `?role=buyer` สำหรับ buyer, default = seller | `order.service` |
| POST | `/api/orders` | Seller | สร้าง order → คืน `publicToken` — body: `CreateOrderSchema` (มี `createdAt` optional, feature 00033) + **`shopId` optional** (ดู 🛑 ใต้ตาราง) | `order.service` |
| GET | `/api/orders/[token]` | Seller | prefill ฟอร์มแก้ไข — รับ **`?shopId=`** optional (ความหมายเดียวกับ POST) | — |
| PATCH | `/api/orders/[token]` | Seller-owner | แก้ไข order เต็มรูป — body เดียวกับ POST (`CreateOrderSchema`) + **`shopId` optional** | `order.service` |
| GET | `/api/orders/customers` | Seller | autocomplete ลูกค้าเดิม `?q=<term>` (≥2 chars) | — |
| GET | `/api/seller/customers/{key}/contact` | Seller-owner | **เปิดเผยข้อมูลติดต่อเต็ม (unmasked) ของลูกค้า 1 คน** — `key` = opaque row key เดียวกับ `/customers/[id]` · คืน `{ contact }` · `cache-control: private, no-store` · 🛑 `INVALID_KEY` กับ `NOT_FOUND` ตอบ **404 เหมือนกันโดยตั้งใจ** (กัน cross-shop enumeration) · authorization อยู่ที่ `where: { shopId }` ตั้งแต่ SELECT ไม่ใช่กรองทีหลัง (feature 00057) | `customer-directory.service` |
| POST | `/api/orders/[token]/unlock` | Guest | phone-unlock — ตรวจเบอร์ตรงกับ order | `order.service` |
| POST | `/api/orders/[token]/confirm` | Guest/Buyer | ยืนยัน order (Path A: SMS cookie; Path B: phone parity) | `order.service` |
| POST | `/api/orders/[token]/cancel` | Seller-owner / Buyer (phone parity) | ยกเลิก — derive `cancelInitiator` จาก session | `order.service` |
| POST | `/api/orders/[token]/ship` | Seller-owner | ใส่ tracking (เฉพาะ `fulfillmentMode=SHIPPED`) | `order.service` |
| POST | `/api/orders/[token]/review` | Buyer (phone parity) | เขียน review 1-5 ดาว + รูปแนบ ≤4 | `review.service` |
| PATCH | `/api/orders/[token]/review` | Buyer เจ้าของรีวิว | **feature 00041** — แก้ไขรีวิวของตัวเองภายใน 24 ชม. นับจาก `createdAt` (BR-BOE-17) | `review.service` |
| DELETE | `/api/orders/[token]/review` | Buyer เจ้าของรีวิว | **feature 00041** — ลบรีวิว (soft) ภายในหน้าต่างเดียวกัน — ลบแล้วเขียนใหม่ไม่ได้ (BR-BOE-18) | `review.service` |
| POST | `/api/orders/[token]/review/reply` | Shop owner / `ShopMember(ADMIN)` | **feature 00041** — ตอบกลับรีวิว; ตอบซ้ำ = เขียนทับ **ไม่มีเงื่อนไขเวลา** | `review.service` |
| DELETE | `/api/orders/[token]/review/reply` | Shop owner / `ShopMember(ADMIN)` | **feature 00041** — ลบคำตอบ (ไม่กระทบรีวิวต้นทาง) | `review.service` |
| POST | `/api/orders/[token]/auth-flow/start` | สาธารณะ (ไม่ต้อง login) | **feature 00041** — บันทึกว่า guest เริ่มยืนยันตัวตน; คืน 204 เสมอ ไม่ว่าเกิดอะไรขึ้น (เป็น instrumentation ห้ามทำให้ผู้ใช้สะดุด) | `order-event.service` |
| POST | `/api/orders/[token]/slip` | Buyer (cookie/phone parity) | แนบสลิปโอนเงิน (PENDING only) — 🛑 **รับ JSON `{fileId}` เท่านั้น** ไฟล์ขึ้น storage ตรงผ่าน `@/lib/upload-client`; multipart ถูกถอดออกแล้วเพราะ body ของ function ตันที่ 4.5MB (`docs/conventions/upload-body-size-limit.md`) | `order.service` |
| POST | `/api/orders/[token]/send-sms` | Seller-owner | ส่ง SMS Order Link — atomic deduct+issue (฿1/SMS) | `wallet.service`, `sms-code.service`, `lib/sms.ts` |
| POST | `/api/orders/[token]/access-url` | Seller-owner | ตั้ง `accessUrl` สำหรับ digital delivery | `order.service` |
| GET | `/api/orders/[token]/buyer-phone` | Buyer (SMS cookie) | คืน phone+masked phone สำหรับ OTP pre-fill | — |
| GET | `/api/orders/[token]/conversations` | Seller (เข้าถึงร้านของออเดอร์ได้) | **ส่วนขยาย 00024 (2026-08-11)** — คืนห้องแชทของลูกค้ารายนี้ **ในร้านของออเดอร์ใบนี้** เรียงตาม `lastMessageAt` desc สำหรับปุ่ม "ส่งสรุปนัด" ที่อยู่นอกห้องแชท (`/orders/[token]`, `/queues`) · 🛑 `shopId` ต้องอยู่ใน `WHERE` เสมอ — `Customer` เป็นตารางระดับทั้งระบบ query ด้วย `customerId` เปล่าจะคืนห้องแชทของร้านอื่น · `order.customerId = null` → คืนรายการว่าง (ไม่ใช่ error) | — |

🛑 **`shopId` ของ 3 เส้นข้างบน = "ร้านที่คำขอนี้ทำงานด้วย" ไม่ใช่ร้านที่ active** (feature 00037 AC-06-6 — ปิดบั๊ก prod 2026-08-11)

ก่อนหน้านี้ทั้งสามเส้น resolve ร้านด้วย `requireActiveShop()` ล้วน ๆ ซึ่งถูกต้องตราบใดที่ "ร้านที่ active" = "ร้านที่ผู้ใช้กำลังมองอยู่" — **กล่องแชทรวมหลายร้านตัดความเท่ากันนั้นทิ้งตั้งแต่ 2026-08-08** (BR-UNI-07: เปิดเธรดของร้าน B โดยไม่เปลี่ยนร้านที่ active โดยตั้งใจ) ผลคือฟอร์มโหลดคิวงาน/แคตตาล็อกของร้าน B มาแสดงแล้วบันทึกลงร้าน A:
- มีนัดติดไปด้วย → คิวงานของ B ไม่มีในร้าน A → `404 RESOURCE_NOT_FOUND` (อาการที่ผู้ใช้รายงาน)
- เลือกสินค้าจากแคตตาล็อก → `400 พบสินค้าที่ไม่ใช่ของร้านนี้`
- **รายการพิมพ์เอง ไม่มีนัด → `201` เข้าร้านผิดถาวร ไม่มีอะไรฟ้อง** (เคสที่อันตรายที่สุด)

กติกาที่บังคับที่ `requireShopForWrite()` (`src/lib/shop-context.ts`):
- ไม่ส่ง `shopId` → ร้านที่ active (พฤติกรรมเดิมทุกประการ)
- ส่งมาแล้วเข้าไม่ถึง → **403 `SHOP_FORBIDDEN` ห้าม fallback ไปร้านที่ active เด็ดขาด** (ต่างจาก `requireActiveShop` ที่ถอยไป Personal ได้ — ที่นั่นการถอยคือ "พาผู้ใช้ไปที่ที่ใช้งานได้" ที่นี่คือ "เขียนข้อมูลลงร้านที่ผู้ใช้ไม่ได้ตั้งใจ" ซึ่งย้อนไม่ได้)
- POST ที่แนบ `conversationId` มาด้วย: เธรดนั้นเป็นของอีกร้าน → **409 `DRAFT_SHOP_MISMATCH`** (AC-06-6); ไม่พบเธรดเลย (ถูกลบ/ไม่มีสิทธิ์) → สร้างต่อได้โดยไม่ผูกลูกค้า = พฤติกรรมเดิม

### 7.6 SMS Code (Public)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/o/sms/[code]` | Guest | consume 12-char SMS code → set HMAC cookie → redirect `/o/{uuid}` — rate-limit RC-1 10/15min/IP | `sms-code.service` |

### 7.7 Wallet (Seller)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/wallet` | Seller | ดู balance + transactions (last 50) — shop derive จาก session | `wallet.service` |
| POST | `/api/wallet/topup` | Seller | สร้าง TopUpRequest + slip (฿100-฿100,000) | `topup.service` |
| GET | `/api/wallet/events` | Seller | poll TopUpRequest ที่ approved ยังไม่แจ้ง | — |
| POST | `/api/wallet/events` | Seller | ack `ids[]` ว่าแจ้ง seller แล้ว (mark `notifiedAt`) | — |

### 7.8 Verification

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/verification` | Buyer/Seller | ดู verification records ของตัวเอง | `verification.service` |
| POST | `/api/verification` | Buyer/Seller | ส่ง verification request + documents | `verification.service` |

### 7.9 Files

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| POST | `/api/uploads/ticket` | Buyer/Seller/Admin | ขอใบอนุญาตอัปโหลดตรงเข้า storage → `{ fileId, url, method, headers, ticket, maxSize }` (body: `purpose` CHAT\|IMAGE\|DOCUMENT, `name`, `size`, `mime?`, `conversationId?`) | `lib/storage` + `lib/upload-policy` |
| PUT | *(url จาก ticket)* | ลายเซ็น presigned ในลิงก์ | client ยิงไฟล์เข้า storage ตรง **ไม่ผ่าน function** (prod = Supabase S3; dev = `PUT /api/uploads/local/[...]` ที่ตรวจ HMAC claim) | — |
| POST | `/api/uploads/commit` | Buyer/Seller/Admin | ยืนยันไฟล์: อ่านขนาดจริงด้วย HEAD → ตรวจเพดาน/ชนิด/กฎช่องทาง → คืน `{ fileId, name, size, mime, kind }`; ไม่ผ่าน = **ลบไฟล์ทิ้ง** + 413/400 (body: `ticket`, `name`, `mime?`) | `lib/storage` + `lib/upload-ticket` |
| POST | `/api/upload` | Buyer/Seller/Admin | **legacy** อัปโหลดผ่าน body ของ function — เพดานจริง 4.5MB (Vercel) ไม่ใช่ 5MB ตามที่โค้ดเขียน; ไม่มีหน้าไหนในรีโปเรียกแล้ว (มีเทส `[blocker]` กัน) | `lib/storage.ts` |
| POST | `/api/chat/upload` | Buyer/Seller | **legacy** ไฟล์แนบแชทผ่าน body ของ function — เพดานจริง 4.5MB ไม่ใช่ 25MB | `lib/storage.ts` |
| GET | `/api/files/[fileId]` | ตามประเภทไฟล์ (ดูหมายเหตุ) | serve ไฟล์ — KYC/slip: auth-only; public image: ทุกคน | `lib/storage.ts` |

**หมายเหตุ `GET /api/files/[fileId]`:**
- Public image (product/avatar): ทุกคน เข้าถึงได้; `Cache-Control: public, max-age=86400`
- KYC document (`VerificationRecord.documents`): เจ้าของ หรือ admin เท่านั้น; `Cache-Control: private, no-cache`; ใช้ in-memory TTL cache (60s) แทน per-request scan
- TopUp slip (`TopUpRequest.slipFileId`): เจ้าของร้าน หรือ admin เท่านั้น
- Order payment slip (`Order.slipFileId`): เจ้าของร้าน หรือ admin เท่านั้น

### 7.10 Public APIs

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/public/profile/[username]` | Guest | public profile summary สำหรับ `/u/{username}` | `user.service` |
| GET | `/api/public/reviews/[username]` | Guest | reviews ของ shop — `?take=10&skip=0` | `review.service` |

### 7.11 Badges (Buyer/Seller)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/badges/[badgeId]/estimate` | Buyer/Seller | pace estimate วัน/rate เพื่อได้ badge | `badge.service` |
| GET | `/api/badges/[badgeId]/rarity` | Buyer/Seller | ความหายากของ badge (% ผู้ถือ) | `badge.service` |

### 7.12 Admin

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/admin/dashboard` | Admin | 8 metrics (ดู PRD §5) | — |
| GET | `/api/admin/users` | Admin | รายการ user + trust score + verification status | `user.service` |
| GET | `/api/admin/verifications` | Admin | คิว verification PENDING | `verification.service` |
| PATCH | `/api/admin/verifications/[id]` | Admin | approve/reject (self-review block ที่ service layer) | `verification.service` |
| GET | `/api/admin/orders` | Admin | รายการ order ทั้งหมด + filter status | `order.service` |
| GET | `/api/admin/badges` | Admin | รายการ badge ทั้งหมด + userCount | — |
| POST | `/api/admin/badges` | Admin | สร้าง badge (criteria validated) | — |
| PATCH | `/api/admin/badges` | Admin | แก้ badge (partial update) | — |
| POST | `/api/admin/badges/upload` | Admin | อัปโหลดรูป badge (PNG/WebP/JPEG ≤256 KB, ห้าม SVG) | — |
| GET | `/api/admin/topups` | Admin | คิว TopUpRequest PENDING | `topup.service` |
| POST | `/api/admin/topups/[id]/approve` | Admin | approve — RC-7 self-block ที่ route | `topup.service` |
| POST | `/api/admin/topups/[id]/reject` | Admin | reject + reason (≤500 chars) | `topup.service` |

### 7.13 Expenses & Cost — กำไรขาดทุน (feature 00016)

> 🛑 ทั้งหมวดนี้ **เปิดฟรีทุกร้านตั้งแต่ 2026-08-07** (D-EXT-1) — เดิมต้องมี Business Package ที่ ACTIVE
> gate ที่ยังเหลือคือ **สิทธิ์คน** เท่านั้น: owner เห็นเสมอ · staff (ShopMember ADMIN) เห็นเมื่อ `Shop.staffCanViewFinance = true` — **default เปลี่ยนเป็น `true` เมื่อ 2026-08-08** (user สั่ง "เปิดหมด"; migration `20260808220000` เปลี่ยนทั้ง DEFAULT และแถวเดิมทั้ง 12 ร้าน) กลไกยังเหมือนเดิมทุกบรรทัด — owner ปิดรายร้านได้ และ `resolveExpenseAccess()` ยัง fail-closed เมื่อปิด
> จุดตัดสินสิทธิ์เดียวของทั้งหมวด = `resolveExpenseAccess()` (`src/services/expense-access.service.ts`) คืน `GRANTED` / `NO_SHOP` / `STAFF_NOT_ALLOWED`

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| POST | `/api/expenses` | Seller (`GRANTED`) | บันทึกค่าใช้จ่าย | `expense.service` |
| GET | `/api/expenses` | Seller (`GRANTED`) | รายการค่าใช้จ่าย | `expense.service` |
| PATCH | `/api/expenses/[id]` | Seller (`GRANTED`) | แก้ค่าใช้จ่าย | `expense.service` |
| DELETE | `/api/expenses/[id]` | Seller (`GRANTED`) | ลบค่าใช้จ่าย | `expense.service` |
| GET | `/api/expenses/report` | Seller (`GRANTED`) | รายงาน P&L + `expenses[]` + `prevNetProfit` | `pnl.service` |
| PATCH | `/api/business/shops/[shopId]/finance-visibility` | **Seller-owner เท่านั้น** | toggle `staffCanViewFinance` | `expense.service` |
| GET | `/api/seller/sales-series` | Seller | ยอดขายรายวัน + field การเงินเมื่อ `GRANTED` | `dashboard.service` |

**🛑 COGS ใน `sales-series` มี 2 ชุด และจะไม่มีวันเท่ากัน (HR16 — วางติดกันใน `dashboard.service.ts`):**

| field | นับต้นทุนของออเดอร์ชุดไหน | คู่กับ | ใครใช้ |
|---|---|---|---|
| `cogsValues` / `totalCogs` | **ทุกใบ** ใน bucket (รวมใบรอยืนยัน) | `values` (ยอดขาย) | ชีต "ยอดขายและกำไร" (`SalesChartSheet`) |
| `cogsConfirmedValues` | เฉพาะใบที่ผ่าน `revenueOrderWhere` | `confirmedValues` | `netProfitValues` — สูตรเดียวกับการ์ด P&L / `/expenses` |

หยิบผิดชุด = คอลัมน์บนหน้าจอลบกันแล้วไม่ลงตัว (ตัวตั้งกับตัวลบมาจากออเดอร์คนละชุด)

**สูตรกำไรบนชีต "ยอดขายและกำไร" (2026-08-08, user เคาะ):** `ยอดขาย − (ต้นทุนสินค้า + ค่าใช้จ่าย)`
— **ตั้งใจให้ต่างจาก `netProfit` ของ `pnl.service`** ซึ่งลบออกจาก "ยอดที่ยืนยันแล้ว" ไม่ใช่ "ยอดขายทั้งหมด"
สองหน้าจึงให้ตัวเลขไม่เท่ากันเมื่อร้านมีใบรอยืนยันค้างอยู่ · invariant ของชีต: ทุกแถวในตารางบวกกันต้องเท่ากับเลขใหญ่ด้านบนเป๊ะ

**สูตร P&L (`pnl.service.ts` — SSOT ห้ามคิดใหม่ที่อื่น):**
`Revenue − COGS = กำไรขั้นต้น` → `− ค่าใช้จ่าย = กำไรสุทธิ`
- Revenue/COGS นับเฉพาะออเดอร์ที่ผ่าน `revenueOrderWhere` (`src/lib/order-revenue.ts`) — **ห้ามเขียน `status: 'CONFIRMED'` เองซ้ำ**
- `OrderItem.cost == null` ถูก **ข้าม** ไม่ใช่นับเป็น 0 → COGS ต่ำกว่าจริง กำไรที่ได้เป็น**เพดานบน** จึงต้องมีธง `hasMissingCost` กำกับบนหน้าจอเสมอ

**กำไรรายออเดอร์ (2026-08-07):** คำนวณใน RSC ของ `/orders/[token]` **ไม่มี endpoint แยก** (จุดบังคับสิทธิ์จุดเดียว) — ต้องส่ง `null` ออกจาก server เมื่อไม่ `GRANTED` ห้ามคำนวณแล้วซ่อนที่ client

**CSV ต้นทุน (Inventory Add-on):** `POST /api/inventory/csv/import` + `GET /api/inventory/csv/export` รับ/คืนคอลัมน์ `cost` — cell ว่าง = ไม่แตะค่าเดิม, `0` = ตั้งศูนย์จริง. gate ของสองเส้นนี้คือ `isProActive` + `requireOnlineSalesVertical` (**คนละ subscription จาก Business Package — D-EXT-1 ไม่ถอด**) และครอบเฉพาะสินค้า `PHYSICAL` + `isActive`

### 7.14 Chat (`/api/chat/**`) — ขอบเขตร้าน

รายการ endpoint เต็มอยู่ที่ feature docs (00011/00018/00019/00023/00029/00037) — ที่นี่บันทึกเฉพาะ **กติกาขอบเขต** ที่ทุก endpoint ในกลุ่มนี้ต้องรักษา เพราะเป็นเรื่องความปลอดภัยข้ามฟีเจอร์:

| กติกา | รายละเอียด |
|-------|-----------|
| SSOT ของขอบเขต | `resolveChatScope()` (`src/lib/chat-scope.ts`) เท่านั้น — 🛑 **ห้ามไฟล์ใต้ `src/app/api/chat/**` และ `src/app/(paces)/seller/(chat)/**` เรียก `resolveActiveShopContext`/`requireActiveShop` ตรง ๆ** (ยกเว้น `api/channels/**` = ตั้งค่าเพจ ต้องอยู่ในบริบทร้านเดียวโดยตั้งใจ) |
| ขอบเขตมาจาก server | ห้ามรับรายชื่อร้านจาก client; `?shopId=` เป็น **ตัวกรองภายในขอบเขต** ต้องผ่าน `intersectScopedShopIds()` / `resolveScopedShopId()` เสมอ |
| นอกขอบเขต = ไม่มีอยู่ | คืนผลว่างหรือ 404 **ไม่ใช่ 403** (403 ยืนยันว่าทรัพยากรนั้นมีจริง) |
| งานที่ผูกกับเธรด | ใช้ `resolveConversationShopId()` แล้วอ่านทุกอย่างจาก `conversation.shopId` — ไม่ใช่ `activeShopId` (ตั้งแต่ feature 00037 สองค่านี้ไม่ใช่สิ่งเดียวกัน) |
| `DISTINCT ON` ที่เกี่ยวกับ `Customer` | ต้องมี `shopId` เป็นคีย์แรกเสมอ — `Customer` เป็นตารางระดับทั้งระบบ (`phone @unique`) ลูกค้าคนเดียวมีออเดอร์หลายร้านได้ |
| ฟิลด์นัด (feature 00024, เพิ่ม 2026-08-08) | `GET /api/chat/conversations/[id]/orders` (service `getOrdersByCustomer`) คืน `serviceStart`/`serviceEnd`/`appointmentStatus`/`depositAmount` เพิ่มเข้ามา — ต้อง sync กับ select ของ `inbox/[conversationId]/page.tsx` เสมอ (ดู §6.2 Order) |
| ไฟล์แนบขาออก (แก้ 2026-08-11) | `checkChannelSupport()` (`src/lib/chat-attachment.ts`) เป็น **SSOT เดียว** ที่ตอบว่า "ไฟล์นี้ส่งช่องทางนี้ได้ไหม" — ผู้เรียกทั้ง 4 จุด (`/api/uploads/ticket`, `/api/uploads/commit`, `/api/chat/upload` legacy, route ส่งข้อความ) ต้องผ่านตัวนี้ 🛑 บล็อกท้ายฟังก์ชันต้อง **fail-closed** ห้ามเป็น fall-through ของช่องทางใดช่องทางหนึ่ง (ของเดิมตกไปใช้กฎ Instagram เงียบ ๆ) · 🛑 `ATTACHMENT_CHANNELS` คือ deny-list ที่ **ไม่มีกลไกทวงคืน** — เคยปิด LINE ค้างไว้ 8 วันหลัง S-8 เสร็จ โดยมีเทสยืนยันสถานะที่ผิดให้เขียวตลอด |
| การ์ดในแชทขาออก (เพิ่ม 2026-08-11) | `type=PRODUCT`/`ORDER` ส่งออกช่องทางนอกได้แล้ว: **LINE = Flex** (`src/lib/line/flex-*.ts`) · **Messenger/IG = Generic Template** (`src/lib/meta/product-card.ts` → `sendTemplateMessage()`). 🛑 **ด่าน cross-shop (FR-CTX-07) เดิมอยู่ใน `chat.service.sendMessage()` ซึ่งครอบเฉพาะ DEEP** — เส้นทางช่องทางนอกวิ่งผ่าน `sendOutboundMessage` ที่ไม่ผ่าน `sendMessage` ต้องมีด่านของตัวเองที่ route (ใช้ helper จาก `product.service` ตัวเดียวกัน) · 🛑 **idempotent-guard (BR-CTX-02) ก็เป็นด่านที่ขาดหายไปด้วยเหตุผลเดียวกัน** (เพิ่มที่ route 2026-08-11) — เกณฑ์อยู่ที่ `isDuplicateProductSend()` (`src/lib/chat-product-resend.ts`, pure): ข้อความที่ **ติดกันย้อนจากล่าสุด** เป็น `PRODUCT` ที่มีชุด `productRefIds` ตรงกัน **ตามลำดับ** ครบทุกชุด → คืนแถวเดิม ไม่ยิงออกซ้ำ. ต้องไม่บล็อกเมื่อครั้งก่อน `deliveryStatus='FAILED'` (ยังไม่ถึงลูกค้า = ต้องกดใหม่ได้) และต้องไม่นับข้อความชนิดอื่น. เหตุผลที่ช่องทางนอกต้องการด่านนี้ *มากกว่า* DEEP: reply token ของ LINE ใช้ได้ครั้งเดียว (`replyTokenUsedAt`) การกดซ้ำจึงตกไปใช้ **push ที่นับโควตา = เงินร้านจริง** ขณะที่บน DEEP เสียแค่แถวซ้ำ · 🛑 `altText` (LINE) / `title`+`subtitle` (Meta) คือสิ่งเดียวที่ลูกค้าเห็นในรายการแชทและ notification — ห้ามว่าง และเพดาน Meta คือ title/subtitle 80 ตัวอักษร เกินแล้ว Meta ตัดเองแบบไม่บอก · รูปต้องแปลงเป็น **JPEG** ก่อนเสมอ (ทั้งสองแพลตฟอร์มรับแค่ JPEG/PNG แต่รูปสินค้าในระบบเป็น webp/gif ได้) แปลงไม่ผ่าน = **ส่งการ์ดแบบไม่มีรูป** ห้ามส่ง URL ไฟล์ต้นฉบับ (ลูกค้าจะเห็นกรอบว่าง) · กรอบรูปของ Meta ต้องเป็น **จัตุรัสตรงกับการ์ดในแอปผู้ขาย** เสมอ |
| การ์ดสรุปนัดหมาย (ส่วนขยาย 00024, เพิ่ม 2026-08-11) | `POST /api/chat/conversations/[id]/messages` รับ **`type="APPOINTMENT"`** (`+ orderRefToken, hiddenKeys[], closing`) — 🛑 **ที่ระดับ API เท่านั้น ฝั่งฐานข้อมูลยังเก็บเป็น `ChatMessage.type='ORDER'` + `orderRefToken` ตัวเดิม ไม่มีค่า enum ใหม่ ไม่มี migration** (`type` ใน request = "อยากให้ประกอบอะไร" ส่วน `ChatMessage.type` = "ของที่เก็บคือชนิดไหน" — precedent เดียวกับ `IMAGE_GRID`) · เนื้อหาและ**คำ**ทั้งหมดมาจาก `buildAppointmentSummary()` (`src/lib/appointment-summary.ts`, pure) ซึ่งเป็น SSOT เดียวกับที่ `OrderProgressBar` ใช้แสดงช่วงเวลานัด — ห้ามเขียนสูตรวันเวลาหรือคำว่า "มัดจำที่ตกลงไว้" ซ้ำที่อื่น (HR16) · ปลายทาง: LINE = `flex-appointment-card.ts` · Messenger/IG = `meta/appointment-card.ts` · Deep = การ์ดในระบบ · **`text` ส่งเสมอทุกกรณี** (ทางถอยของช่องทางที่ไม่รองรับการ์ด + เก็บลง `body` ให้ร้านค้นหาเจอ) · 🛑 การเก็บ `body` และคำใน `lastMessagePreview` (`[สรุปนัดหมาย]`) ต้องส่ง **`isAppointmentCard: true`** เข้า service เสมอ — `type='ORDER'` เปล่า ๆ จะได้ `body=null` + คำของออเดอร์ ซึ่งเป็นบั๊กที่ขึ้น prod ไปแล้วรอบหนึ่ง (แก้ 2026-08-12; ดู `value-fate-decided-at-write-site.md`) · ปุ่มบนการ์ดชี้ `/o/{token}` ซึ่งลูกค้ากด "ยืนยันนัด"/"ขอเลื่อนนัด" ได้ (เขียน `appointmentStatus`) · ด่าน fail-closed 6 ข้อ ดู `docs/20 - Features/00024 …/EXTENSIONS-2026-08-11.md` FR-APS-05 — ที่สำคัญคือ **`hiddenKeys` ห้ามมี `'when'`** และ **นัดที่ `COMPLETED`/`NO_SHOW` ส่งไม่ได้** |
| การ์ดคำขอชำระเงินของ Meta (feature 00018, สัญญาแก้ 2026-08-09) | `parseMetaOrderCard(body)` (`src/lib/meta-order-card.ts`, pure module) แปลงข้อความ `ChatMessage.body` ที่ Meta ส่งมา (`"[การ์ดจาก Facebook] ฿N order — <status>"` หรือรูปเก่าไม่มีคำนำหน้า/สถานะ) เป็น `{ amount, status: string \| null }` — `status` เป็นคำอังกฤษดิบของ Meta ห้ามแปลไทย/จำแนกสี, `null` = ไม่รู้สถานะ. ผู้เรียก: `ChatThread.tsx` (render `MetaOrderCardBubble`, ต้องเช็คก่อน `parseMetaSystemNotice` เสมอ — ทั้งสองจับคำนำหน้าเดียวกันได้), `channel-chat.service.ts` (preview รายการแชท ทั้งเส้น webhook และ backfill) — รายละเอียดเต็มดู `docs/20 - Features/00018 - Facebook Chat Integration/EXTENSIONS-2026-08-09.md` |
| คิวส่งข้อความขาออก (CR ของ 00018, ส่วนขยาย 2026-08-23) | `POST /api/chat/conversations/[id]/messages` **เฉพาะจากช่องพิมพ์ผู้ขาย** เปลี่ยนจากตอบ `200`+แถวที่ส่งแล้ว (`deliveryStatus='SENT'`+`externalMessageId`) → ตอบ **`202 Accepted`**+แถวที่เข้าคิว (`deliveryStatus='QUEUED'`, `externalMessageId=null`) ทันที (~50ms) — แถวถูก `INSERT` ลง DB **ก่อน**ตอบ client เสมอ (FR-OQ-01) แล้วยิงออกช่องทางเบื้องหลัง**ครั้งเดียว ไม่มี auto-retry** (FR-OQ-02) ผ่าน 3 ชั้น (`after()` → opportunistic sweep ตอน webhook/เปิดเธรด → cron ทุก 1 นาทีเป็นตัวการันตี) 🛑 **แถวที่ถูก claim แล้ว (`sendLockedAt` ไม่ null) ห้าม claim ซ้ำเด็ดขาด** (FR-OQ-03) — claim ค้างเกิน 3 นาทีปิดเป็น `FAILED` พร้อม `failureReason`="ไม่แน่ใจว่าส่งออกไปหรือยัง — เปิดดูในแชทก่อนกดส่งใหม่" (FR-OQ-04) · ล้มแล้วต้องกด "ลองใหม่" เอง = POST ใบใหม่ ไม่ใช่ปลุกแถวเดิม · `partialError` ของ `IMAGE_GRID` **หายไปจาก response** — สถานะย้ายไปอยู่รายแถวแทน (FR-OQ-05, FR-OQ-06) · ผู้เรียก `sendOutboundMessage` ที่เหลือ (`auto-reply-send.service.ts`, `line-rich-menu-reply.service.ts` — ยืนยันด้วย `grep -rn "sendOutboundMessage(" src/` 2026-08-23 หลัง fix round 1 พบว่าเดิมนับผิดเป็น 8 ที่) **ไม่เปลี่ยน** ยัง synchronous เหมือนเดิมทุกประการ — รายละเอียดเต็ม+FR-OQ-01..06+edge case 20 ข้อ ดู `docs/20 - Features/00018 …/EXTENSIONS-2026-08-23-outbound-queue.md` |

#### 7.14a คลังไฟล์ต่อลูกค้า (feature 00048)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/chat/conversations/[id]/library` | Seller (`resolveConversationShopId`) | รายการไฟล์ในคลังของเธรดนี้ (keyset `?take=&cursorSentAt=&cursorId=`) + `total` จริง | `customer-file-library.service` |
| POST | `/api/chat/conversations/[id]/library` | เหมือนกัน | เก็บไฟล์เข้าคลัง — **รับแค่ `{ messageId }`** ค่าอื่นอ่านจากฐานฝั่ง server; idempotent (ชน `@@unique` → `created:false` ไม่ใช่ error) | เหมือนกัน |
| DELETE | `/api/chat/conversations/[id]/library?fileId=` | เหมือนกัน | เอาออกจากคลัง (hard delete, idempotent — ไม่มีแถวก็ตอบ 200 `removed:false`) | เหมือนกัน |
| PATCH | `/api/chat/conversations/[id]/library` | เหมือนกัน | แก้ `fileName`/`note` ของไฟล์ในคลัง | เหมือนกัน |
| POST | `/api/chat/conversations/[id]/thread-control` | Seller (`resolveOutboundContext` → `canAccessShop`) | ขอสิทธิ์คุมเธรดคืนจากเอเจนต์ AI ของ Meta (เฉพาะ `MESSENGER`/`INSTAGRAM`) — body ว่าง, คืน `{ outcome: 'TAKEN' \| 'REQUESTED' \| 'FAILED', reason?, message? }` | `channel-chat.service::claimConversationControl` → `facebook/graph::claimThreadControl` |

> 🛑 **`thread-control` ไม่รับ `pageId`/PSID จาก client** — resolve จาก `conversationId` ฝั่ง server
> ล้วน (รับจาก client = ช่องยิงคำสั่ง handover ใส่เพจร้านอื่น) · **`outcome` มีสามค่าและต้องเดินทาง
> ถึงหน้าจอครบ ห้ามยุบเป็น boolean**: `REQUESTED` แปลว่า "ส่งคำขอไปแล้ว ยังไม่รู้ว่าจะได้สิทธิ์ไหม"
> ซึ่งไม่ใช่ทั้งสำเร็จและล้มเหลว (Meta ตอบ `success:true` ให้ *คำขอ* ไม่ใช่ให้ *สิทธิ์*) — การยุบรวม
> คือการสร้างคำสัญญาที่ระบบทำตามไม่ได้ ซึ่งเป็นบั๊กที่ endpoint นี้ถูกเขียนขึ้นมาแก้พอดี
> (ดู `docs/20 - Features/00018 …/EXTENSIONS-2026-08-26-thread-control-api.md`)

| GET | `/api/channels/[channelId]/ice-breakers` | Seller (`canAccessShop`) | คำถามแนะนำก่อนเริ่มแชทของช่องทางนั้น เรียงตามที่ลูกค้าเห็น | `channel-chat.service::listIceBreakers` |
| PUT | `/api/channels/[channelId]/ice-breakers` | เหมือนกัน + เฉพาะ `MESSENGER`/`INSTAGRAM` ที่ `status='ACTIVE'` | แทนที่ทั้งชุด (≤4 ข้อ) แล้วยิงไปตั้งที่ Meta — **`items: []` = ลบทั้งชุด** | `channel-chat.service::saveIceBreakers` → `facebook/graph::setIceBreakers` |

> 🛑 **ไม่มี POST/DELETE รายข้อโดยตั้งใจ** — Meta ไม่มี partial update (ส่ง `ice_breakers` ไปคือ
> แทนที่ทั้งก้อน) ถ้าเปิด API รายข้อ สถานะสองฝั่งจะเพี้ยนกันทันทีที่ผู้ขายลบข้อกลาง ๆ ออก
> 🛑 **ยิง Meta ก่อน สำเร็จแล้วจึงเขียน DB** — Meta คือสิ่งที่ลูกค้าเห็นจริง ฐานเราเป็นแค่ที่เก็บ
> *คำตอบ* ⇒ ลำดับนี้ทำให้ "Meta ปฏิเสธ" = ไม่มีอะไรเปลี่ยนทั้งสองฝั่ง · ลำดับกลับด้านจะทำให้ฐาน
> มีชุดใหม่ทั้งที่ลูกค้ายังเห็นชุดเก่า แล้วหน้าจอรายงานว่า "ลูกค้าเห็นอยู่" ซึ่งไม่จริง (ย้อนไม่ได้
> เพราะทรานแซกชันปิดไปแล้ว) — ที่ทำได้เพราะ `payload` ประกอบจาก **(ช่องทาง, ลำดับ)** ไม่ใช่ id ของแถว
> 🛑 **`payload` ระบุช่องทางมาเอง และมาจากภายนอกล้วน** ⇒ `answerIceBreaker()` ต้องเทียบกับเพจที่
> webhook มาจากจริง **ก่อน** เอาไปค้นฐานเสมอ ไม่งั้นใครเดา payload ได้ก็สั่งให้เราส่งคำตอบของร้านอื่นได้
> (ดู `docs/20 - Features/00018 …/EXTENSIONS-2026-08-27-ice-breakers.md`)

> 🛑 **POST ห้ามรับ `fileId`/`kind`/`sentAt` จาก client** — ค่าที่ตัดสิน "เก็บอะไร" ต้องอ่านจาก
> `ChatMessage` ฝั่ง server เสมอ (รับจาก client = เปิดช่องยัดไฟล์ของร้านอื่นเข้าคลังตัวเอง
> และทำให้ลำดับในคลังเป็นค่าที่หน้าจอแต่งได้)
> 🛑 **`sentAt` = `ChatMessage.createdAt` ไม่ใช่ `now()`** — เป็นคีย์เรียงลำดับของคลัง (BR-CFL-12)
> 🛑 เกณฑ์ "เก็บได้ไหม" อยู่ที่ `isLibraryEligible()` (`src/lib/customer-file-library.ts`) ที่เดียว —
> สติกเกอร์ถูกเก็บเป็น `type='IMAGE'` เหมือนรูปทุกประการ แยกได้จาก `rawMessage.payload.kind`
> เท่านั้น และ `rawMessage` ถูก **omit เป็นค่าตั้งต้นของ Prisma client** ⇒ ต้องขอใน `select`
> ไม่งั้นสติกเกอร์หลุดเข้าคลังเงียบ ๆ โดย `tsc`/build ผ่านหมด

### 7.15 Comment Auto-Reply (feature 00038)

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| PATCH | `/api/shops/comment-reply/config` | Seller (canAccessShop) | บันทึกสวิตช์/ข้อความของเพจเดียว — เปิดสวิตช์โดยข้อความว่างไม่ได้; เพจ `TOKEN_INVALID` เปิดสวิตช์ไม่ได้ (409) | `comment-auto-reply.service` |
| GET | `/api/shops/comment-reply/logs` | Seller (canAccessShop) | ประวัติการตอบ/ข้าม แบ่งหน้า (`?shopChannelId=&cursor=&take=`) | `comment-auto-reply.service` |
| POST | `/api/chat/comments/[commentId]/private-reply` | Seller (canAccessShop ผ่าน comment→post→channel→shop) | ปุ่มแมนนวล "ทักแชท" — ใช้ได้เสมอไม่ขึ้นกับสวิตช์อัตโนมัติ; กันซ้ำด้วย partial unique index ระดับคอมเมนต์ (409 `ALREADY_SENT`/`WINDOW_EXPIRED`) | `comment-private-reply.service` |
| POST | `/api/chat/comments/resolve-expired` | Seller (canAccessShop ผ่าน `resolveChatScope`) | **ส่วนขยาย 2026-08-19** — "ทำเครื่องหมายทั้งหมด" ของแท็บ "หมดอายุ". 🛑 **ไม่มีพารามิเตอร์ `state`** เกณฑ์เขียนตายใน `resolveAllExpiredComments()` — เปิดให้ส่งได้เมื่อไหร่ คำขอเดียวจะล้างคิวงานจริงทั้งกอง (BR-CR-R10) · ขอบเขต `channelId`/`provider` ต้องตรงกับ `/list` เป๊ะ | `page-comment.service::resolveAllExpiredComments` |
| POST/DELETE | `/api/chat/comments/[commentId]/resolve` | Seller (canAccessShop ผ่าน comment→post→channel→shop) | **ส่วนขยาย 2026-08-19** — ทำเครื่องหมาย/เลิกทำเครื่องหมายว่า "จัดการแล้ว" เอาคอมเมนต์ที่ตอบไม่ได้แล้วออกจากคิว. 🛑 `reason` hardcode `MANUAL` **ไม่รับจาก body** — `ALREADY_REPLIED_EXTERNALLY` เป็นข้อเท็จจริงที่มาจาก Meta เท่านั้น (BR-CR-R7) · `DELETE` idempotent | `page-comment.service::setCommentResolved` |

> ไม่มี `GET /api/shops/comment-reply/config` — ค่าตั้งต้นของสวิตช์+ข้อความทุกเพจอ่านผ่าน RSC +
> prisma ตรงที่ `settings/comment-reply/page.tsx` (ไม่ self-fetch API ของตัวเอง) ถอด handler
> GET ออกแล้ว (YAGNI, Task 11 — ไม่มี client เรียกเลย)

> รายละเอียดเต็ม (error code ครบ, sequence diagram): `docs/20 - Features/00038 - Comment Auto-Reply/API.md`

> 🛑 หมวดนี้อยู่ใต้กติกาขอบเขตของ §7.14 ด้วย — `/api/chat/comments/[commentId]/private-reply`
> ต้อง resolve ร้านจาก `comment → post → channel → shop` ไม่ใช่จาก `activeShopId`
> (ตั้งแต่ feature 00037 สองค่านี้ไม่ใช่สิ่งเดียวกัน)

### 7.16 ความทนของการเชื่อมช่องทาง (`/api/channels/**`) — ส่วนขยาย 00025 2026-08-12

รายละเอียดอยู่ที่ `docs/20 - Features/00025 …/EXTENSIONS-2026-08-12-connection-health.md` — ที่นี่บันทึกเฉพาะกติกาที่ **ข้ามฟีเจอร์** และผิดแล้วไม่มี gate ไหนจับได้:

| กติกา | เหตุผล |
|---|---|
| webhook ต้องตอบ **HTTP 200 ทุกกรณี** รวมลายเซ็นไม่ผ่าน/หา `destination` ไม่เจอ | BR-LINE-05/06 · เปลี่ยนเป็น 4xx = LINE ไล่ retry คำขอที่ยังไงก็ไม่ผ่าน |
| ⇒ จึงต้อง **บันทึกความล้มเหลวลงแถว** (`lineInboundFailCount` ฯลฯ) ทั้ง **2 เส้นทาง** | จับแค่ลายเซ็นคือกั้น operand เดียวของกฎ OR — อีกเส้นเงียบเท่ากัน |
| ปุ่มตรวจสุขภาพ **ห้ามเชื่อ `success` ของ `webhook/test`** ต้องอ่านตัวนับของเราเองเป็นจังหวะที่สอง | `webhook/test` รายงาน HTTP status ที่เราตอบ ซึ่งเป็น 200 เสมอ ⇒ เขียวหลอก |
| `lineTokenExpiresAt` **ห้ามอ่านในเส้นทางส่งข้อความ** | เป็นภาพนิ่ง ณ เวลาที่เขียน — ร้าน revoke เมื่อไหร่ก็ได้ ตัวตัดสินจริงคือผลตอบจาก LINE ตอนยิง (`stored-flag-vs-owner-truth.md`) |
| สถานะการ์ดช่องทางคำนวณจากฟังก์ชันบริสุทธิ์ตัวเดียว **สีเขียว = ผ่านทุกด่าน** | เดิมขึ้นเขียว "เชื่อมแล้ว" ได้ทั้งที่ webhook ไม่เคยถูกตั้ง = ละเมิด Verified-Means-Green |
| บล็อกช่องพิมพ์ได้เฉพาะ `status='TOKEN_INVALID'` (ข้อเท็จจริงที่ LINE ปฏิเสธมาแล้ว) **ห้ามบล็อกจากการอนุมาน** | บทเรียน `viaStandby` 2026-08-09 — บล็อกผิด = พิมพ์ไม่ได้ทั้งที่กำลังคุยลูกค้า |
| ถอดช่องทาง LINE ต้องคืน rich menu ก่อน แต่ **คืนล้มก็ต้องถอดต่อจนจบ** | เมนูที่ตั้งผ่าน API ชนะเมนู OA Manager เงียบ ๆ ⇒ ไม่คืน = ร้านลบเองไม่ได้ตลอดกาล |
| push "ช่องทางหลุด" **ข้าม `ShopNotificationPref`** แต่ต้องกรองที่ชั้นที่แยกข่าวระบบออกจากข้อความลูกค้า | `pushToUsers()` เป็น primitive ที่ฝั่งผู้ซื้อใช้ร่วม — กรองผิดชั้นจะปิดของที่ไม่เกี่ยว |

> 🛑 **Known Gap (รับไว้โดยรู้ตัว 2026-08-12):** `POST /api/channels/line/connect` · `PATCH /api/channels/line/[channelId]` ·
> `POST /api/channels/facebook/confirm` · `DELETE /api/channels/[id]` **ไม่มีอันไหนอ่าน `role`/`locked`**
> จาก `resolveActiveShopContext()` ⇒ staff ระดับ ADMIN เปลี่ยน credential ได้เท่าเจ้าของ และร้านที่ถูก
> package lock ก็ยังจัดการช่องทางได้ · วันที่จะปิดต้องปิดทั้งกลุ่มพร้อมกัน ไม่ใช่เฉพาะ LINE

---

### 7.17 เงินที่ได้รับของออเดอร์ (`/api/orders/[token]/payments/**`) — feature 00050 2026-08-15

| Method | Path | หมายเหตุ |
|---|---|---|
| POST | `/api/orders/{token}/payments` | บันทึกรับเงิน 1 ก้อน · คืน `{ paymentId, money }` |
| GET | `/api/orders/{token}/payments` | ประวัติ (รวมแถวที่ยกเลิก — จอนี้เป็นของร้าน) |
| DELETE | `/api/orders/{token}/payments/{paymentId}` | soft void · บังคับส่ง `reason` |

🛑 **ไม่มี PATCH โดยเจตนา** — ดู §6.x

#### 7.17b `?shopId=` — กติกาที่ข้ามฟีเจอร์

endpoint ที่ถูกกดจาก **กล่องแชท** เชื่อ `activeShopId` ไม่ได้: เธรดของร้าน B เปิดได้ขณะ active
อยู่ร้าน A (BR-UNI-07) ⇒ query จะ scope ผิดร้านแล้ว "หาไม่เจอ" ⇒ ผู้ใช้ได้ปุ่มที่
**กดกี่ครั้งก็ไม่มีวันผ่าน** (คลาสเดียวกับบทเรียน iShip retry 2026-08-06)

`requireShopMember(opts?: { shopId?: string | null })` รับพารามิเตอร์นี้แล้ว (2026-08-15) —
**additive: ไม่ส่ง = พฤติกรรมเดิมทุกประการ** · ส่งมาแล้วไม่มีสิทธิ์ = **403 ห้ามถอยไปใช้ร้านที่ active**

route ที่รับ `?shopId=` แล้ว: `payments/**` (ใหม่) · `PATCH /api/orders/{token}/appointment` ·
`POST /api/orders/{token}/appointment/outcome` · `GET /api/shops/current/service-resources`

### 7.18 รายงานผลงานแอดมิน (`/api/seller/reports/agents/**`) — feature 00059 2026-08-26

| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/seller/reports/agents` | ภาพรวม + ตารางจัดอันดับ + ตัวเลือกของตัวกรอง |
| GET | `/api/seller/reports/agents/{agentId}` | ผลงานรายคน + แนวโน้มรายวัน |
| GET | `/api/seller/reports/agents/{agentId}/conversations` | บทสนทนาที่ประกอบเป็นตัวเลข (`agentId='all'` = ทุกเธรด) |

query ร่วม: `from` `to` (YYYY-MM-DD เวลาไทย) · `channel` · `source` (`ADS`/`SHORTLINK`/`DIRECT`) ·
`shopChannelId` · (เฉพาะ endpoint ที่สาม) `limit` `offset`

🛑 **อ่านอย่างเดียวทั้งหมด ไม่มี POST/PATCH/DELETE** และ **ไม่รับ `shopId` จาก query เด็ดขาด** —
ร้านมาจาก session เท่านั้น (ต่างจากกติกา `?shopId=` ใน §7.17b โดยตั้งใจ: รายงานไม่ได้ถูกกดจากกล่องแชท
และการเปิดช่องให้ระบุร้านในรายงาน = เปิดช่องอ่านตัวเลขข้ามร้านโดยไม่ได้อะไรกลับมา)

🛑 **สิทธิ์ใช้ธงเดิม `Shop.staffCanViewFinance` ไม่ได้ตั้งธงใหม่** — `resolveAgentReportAccess()`
คืน `FULL` (เจ้าของ หรือพนักงานที่เปิดสิทธิ์การเงินแล้ว) / `SELF` (พนักงานอื่น — เห็นเฉพาะของตัวเอง
และ **ตัวเลขเงินถูกตัดออกจาก payload** ไม่ใช่แค่ไม่ render) / `NO_SHOP`

ค่าตัวเลขทุกตัวเป็น `number | null` — **`null` = ไม่มีตัวอย่างให้คำนวณ ไม่ใช่ 0**
นิยามของทุกตัวชี้วัดอยู่ที่ `src/lib/agent-performance.ts` (SSOT) — ดู
`docs/20 - Features/00059 - Agent Performance Report/SRS.md` §3

### 7.19 แผนการตรวจสอบร้านค้า (`/api/seller/inspection/**`, `/api/inspector/**`, `/api/admin/inspection/**`) — feature 00060, Draft ยังไม่ implement

> **สถานะ: Draft** — สัญญานี้ล็อกแล้วใน `API.md` ของ feature 00060 (เวอร์ชัน 1.0, 15 endpoint) แต่
> **ยังไม่มี route ใดในโมดูลนี้อยู่บนดิสก์จริง** รอ user review ผ่าน PRD/BRD ก่อนตาม Hard Rule 11
>
> **ไม่มี public endpoint โดยเจตนา** — หน้าโปรไฟล์สาธารณะ (`/u/[username]`, `/b/[slug]`) อ่านผ่าน
> RSC/service call ตรง ไม่ผ่าน HTTP endpoint (ลด attack surface + กัน scrape ทั้งไดเรกทอรี)
>
> **ทุก endpoint รับได้แค่ `fileId` ที่ commit แล้ว** ผ่าน `@/lib/upload-client` — ห้ามส่งไฟล์ผ่าน body
> (`docs/conventions/upload-body-size-limit.md`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/seller/inspection` | OWNER + ADMIN ร้าน (`vertical='LODGING'`) | สถานะแผน + ผลปัจจุบันรายข้อ + ไทม์ไลน์ + คิวรอผู้ตรวจ + สถานะโควตาเปิดรับ |
| POST | `/api/seller/inspection/subscribe` | OWNER | สมัครแผนครั้งแรก — จองโควตา + หักเครดิต + `InspectionTermsAcceptance` ในทรานแซกชันเดียว |
| POST | `/api/seller/inspection/upgrade` | OWNER | เลื่อนขึ้นขั้นที่สูงกว่า |
| POST | `/api/seller/inspection/cancel` | OWNER | แจ้งยกเลิก — มีผลสิ้นรอบบิล ไม่ใช่ทันที |
| POST | `/api/seller/inspection/documents` | OWNER | ผูก `fileId` เข้ากับข้อตรวจ (หลักฐานปิดที่ร้านส่งเองได้ 5 คีย์) |
| GET | `/api/inspector/rounds` | `isInspector=true` | คิวรอบตรวจที่ตนได้รับมอบหมาย — scope ด้วย `WHERE` |
| GET | `/api/inspector/rounds/[id]` | ผู้ตรวจเจ้าของรอบ | รายละเอียดรอบ + ข้อตรวจที่ต้องบันทึก |
| POST | `/api/inspector/rounds/[id]/results` | ผู้ตรวจเจ้าของรอบ | บันทึกผลรายข้อเป็นชุด (1-18 คีย์) + แนบหลักฐาน |
| POST | `/api/inspector/rounds/[id]/complete` | ผู้ตรวจเจ้าของรอบ | ปิดรอบ — ล็อกถาวร ต้องบันทึกผลครบทุกคีย์ก่อน |
| GET | `/api/admin/inspection/quota` | `isAdmin=true` | อ่านโควตารายเดือนต่อขั้น + ยอดที่ใช้ |
| PATCH | `/api/admin/inspection/quota` | `isAdmin=true` | ตั้ง/แก้เพดานโควตา |
| POST | `/api/admin/inspection/rounds` | `isAdmin=true` | สร้างรอบตรวจนอกกำหนด (ad-hoc) — ไม่ใช่เส้นทางหลัก (หลักคือ cron) |
| GET | `/api/admin/inspection/rounds` | `isAdmin=true` | คิวรอบตรวจทั้งระบบ เรียง/กรองด้วย `dueAt` + ตัวชี้วัดงานค้าง |
| POST | `/api/admin/inspection/rounds/[id]/assign` | `isAdmin=true` | มอบหมายผู้ตรวจให้รอบที่ cron สร้างไว้ — เส้นทางหลักของงานประจำวัน |
| POST | `/api/admin/inspection/fraud` | `isAdmin=true` | เส้นทางแยกเมื่อพบหลักฐานฉ้อโกง → ควบคู่ `scam-report.service` (`/check`) |

**ไม่มี `DELETE` สักตัวโดยตั้งใจ** — ประวัติรอบตรวจต้องอยู่ถาวรแม้ร้านลดขั้น/ยกเลิกแผน (ห้ามลบ)

**ผู้ตรวจ (`User.isInspector`) ห้ามเห็นข้อมูลการเงินทุกชนิดไม่ว่าร้านไหน** (ยอดเครดิต · ประวัติชำระ ·
`slipFileId` · ราคาแผน) — payload ของ `/api/inspector/**` ไม่มีฟิลด์การเงินสักตัว

**ไม่มี endpoint ตั้งค่า `User.isInspector`** ในสัญญาที่ล็อกแล้ว — ตั้งผ่าน DB โดยตรงเหมือน `isAdmin`
(เอกสาร `SRS.md` ต้นทางของ 00060 เคยระบุ `PATCH /api/admin/users/[id]/inspector` แต่ endpoint นั้น
ไม่อยู่ใน `API.md` ฉบับ 15-endpoint ที่ล็อกล่าสุด — ดูรายงานความไม่ตรงกันในสรุปการ sync รอบนี้)

**31 error code** — ดูฉบับเต็มที่ `API.md` §5 ของ 00060 (ยังไม่คัดลงที่นี่เพราะยาวเกินขอบเขต summary
ของไฟล์นี้ — ให้ dev เปิดเอกสารต้นทางตอน implement จริง)

### 7.20 Cron Jobs (Vercel Scheduled Functions — `vercel.json`)

> `docs/SRS.md` ไม่เคยมีหัวข้อรวมรายการ cron มาก่อน — สร้างขึ้นครั้งแรกพร้อมงาน 00060 กัน `vercel.json`
> เป็นที่เดียวที่รู้ว่าระบบมี cron อะไรบ้าง (ยืนยันด้วยการอ่าน `vercel.json` จริง 2026-08-29 — 10 ตัว)
> เวลาทั้งหมดเป็น **UTC** ตาม Vercel cron spec — เวลาไทย = UTC+7

| Path | Schedule (UTC) | เวลาไทย |
|---|---|---|
| `/api/cron/inventory-renewal` | `0 19 * * *` | 02:00 |
| `/api/cron/business-package-lifecycle` | `0 20 * * *` | 03:00 |
| `/api/cron/chat-response-metrics` | `0 21 * * *` | 04:00 |
| `/api/cron/auto-reply-sweeper` | `0 22 * * *` | 05:00 |
| `/api/cron/account-purge` | `0 23 * * *` | 06:00 |
| `/api/cron/auto-confirm-delivered` | `0 18 * * *` | 01:00 |
| `/api/cron/line-token-health` | `0 19 * * *` | 02:00 |
| `/api/cron/iship-status-sync` | `*/5 * * * *` | ทุก 5 นาที |
| `/api/cron/comment-attachment-repair` | `0 17 * * *` | 00:00 |
| `/api/cron/chat-outbox` | `* * * * *` | ทุกนาที |
| **`/api/cron/inspection-lifecycle`** (feature 00060 — **Draft, ยังไม่ implement**) | **`0 16 * * *`** | **23:00** |

**`/api/cron/inspection-lifecycle` (เมื่อ implement แล้ว) ทำ 4 งานในครั้งเดียว:** (1) ตัดเครดิตรอบ
30 วัน + จัดการ `canceledAt`/`graceUntil`/`status`/`lapsedReason` (2) รันข้อตรวจอัตโนมัติของขั้น 1
รายวัน (3) สร้างแถว `InspectionIntakeQuota` ของเดือนถัดไปแบบ upsert idempotent (4) สร้าง
`InspectionRound` ล่วงหน้าแบบยังไม่มอบหมายสำหรับข้อของขั้น 2-4 ที่ใกล้หมดอายุ — auth ต้องเทียบ
`Authorization: Bearer ${CRON_SECRET}` เต็มสตริง และ **reject ทันทีถ้า `CRON_SECRET` ว่าง**
(ห้ามปล่อยให้เทียบกับ `Bearer undefined` แล้วผ่าน) · ต้อง export ทั้ง `GET` (Vercel ยิง GET) และ
`POST` (manual trigger) ไม่งั้นได้ 405 และไม่เคยรันจริงโดยไม่มีอะไรฟ้อง

---

## §8 Enums & Constants

> enum ทั้งหมดเป็น String ใน Prisma (ไม่ใช่ PostgreSQL enum type) — convention ของ project

### 8.0c Order Payment Kind / Method (`src/lib/order-payment.ts`)

| `kind` | ความหมาย |
|---|---|
| `DEPOSIT` | มัดจำ |
| `BALANCE` | ยอดที่เหลือ / เต็มจำนวน |

| `method` | ความหมาย |
|---|---|
| `TRANSFER` | โอนเงิน (default) |
| `CASH` | เงินสด — **ต้องบันทึกได้โดยไม่มีสลิป** (BR-SQ-13) |
| `OTHER` | อื่น ๆ |

> คำไทยอยู่ที่ `ORDER_PAYMENT_KIND_LABEL` / `ORDER_PAYMENT_METHOD_LABEL` — ห้ามพิมพ์ซ้ำที่จออื่น (HR16)

### 8.1 Order Status

| ค่า | ความหมาย | Terminal? |
|-----|---------|---------|
| `PENDING` | สร้าง order แล้ว รอ buyer | ไม่ |
| `SHIPPED` | seller ใส่ tracking แล้ว (SHIPPED เท่านั้น) | ไม่ |
| `CONFIRMED` | buyer ยืนยัน — นับ trust/badge | ✅ |
| `CANCELLED` | ยกเลิกก่อน CONFIRMED | ✅ |

### 8.0b Account Delete Reason (`src/lib/account-deletion.ts::ACCOUNT_DELETE_REASON`)

| ค่า | ปิดโดยใคร | เมื่อไหร่ |
|-----|---------|---------|
| `USER_DELETED` | ผู้ใช้เอง | กดปุ่ม "ลบบัญชี" ที่ `/account` (พิมพ์ข้อความยืนยัน) |
| `ABANDONED_RECLAIMED` | **ระบบ** | บัญชีค้างถูกปิดตอนเจ้าของตัวตน OAuth ขอย้ายการเชื่อมกลับบัญชีจริง (`/api/account/link/reclaim`) — **ผู้ใช้ไม่ได้กดลบบัญชีนั้นเอง** จึงต้องแยกจาก `USER_DELETED` ไม่งั้นประวัติบอกเหตุผลที่ไม่ตรงกับสิ่งที่เกิดจริง |

> `deletedReason` เป็น **audit ล้วน** ไม่มี logic ไหนอ่านค่านี้ไปตัดสินใจ (ยืนยันด้วย grep 2026-08-15)

### 8.1b OrderEvent Type (`src/lib/order-event.ts::ORDER_EVENT_TYPES`)

> **17 ค่า** — CHECK constraint `OrderEvent_type_check` (unmanaged SQL) ต้องตรงกับรายการนี้เป๊ะ ดู §6.2 OrderEvent

| ค่า | ความหมาย |
|-----|---------|
| `ORDER_CREATED` | สร้างคำสั่งซื้อ |
| `ORDER_EDITED` | แก้ไขคำสั่งซื้อ |
| `ORDER_CANCELLED` | ยกเลิกคำสั่งซื้อ |
| `TRACKING_ADDED` | แจ้งเลขพัสดุ (manual) |
| `SHIPMENT_CREATED` | เปิดพัสดุกับขนส่ง (iShip) |
| `SHIPMENT_CANCELLED` | ยกเลิกพัสดุ |
| `SHIPMENT_LINKED` | ผูกพัสดุที่มีอยู่แล้ว |
| `SMS_LINK_SENT` | ส่งลิงก์ทาง SMS |
| `BUYER_CONFIRMED` | ผู้ซื้อยืนยันรับของ |
| `COD_SETTLED` | ขนส่งโอนเงินเก็บปลายทางแล้ว |
| `SYSTEM_CONFIRMED` | ระบบยืนยันคำสั่งซื้ออัตโนมัติ |
| `PAYMENT_METHOD_SYNCED` | ปรับวิธีชำระเงินตามพัสดุ |
| `ORDER_DATE_CHANGED` | **feature 00033** — เปลี่ยนวันที่คำสั่งซื้อ (เลื่อนยอดข้ามงวด) |
| `ORDER_DISPUTE_OPENED` | **feature 00041** — ผู้ซื้อแจ้งว่ายังไม่ได้รับสินค้า (ติดธงเตือน ไม่เปลี่ยน `Order.status`) |
| `ORDER_DISPUTE_RESOLVED` | **feature 00041** — ปัญหาถูกปิด |
| `AUTH_FLOW_STARTED` | **feature 00041** — guest กดปุ่มเข้าสู่ระบบจากหน้าออเดอร์สาธารณะ (ครึ่งแรกของ Login Completion Rate) |
| `AUTH_FLOW_COMPLETED` | **feature 00041** — ยืนยันตัวตนสำเร็จและเข้าถึงออเดอร์ได้ (ครึ่งหลัง) |

🛑 **สองค่าท้ายเป็น instrumentation ไม่ใช่เหตุการณ์ของออเดอร์** — ถูกกรองออกจากไทม์ไลน์ที่ผู้ใช้เห็น
ผ่าน `INSTRUMENTATION_EVENT_TYPES` ใน `order-event.service.ts` ถ้ามีคนเอาออกจากรายการนั้น
ประวัติออเดอร์ของลูกค้าจะรกขึ้นทันทีโดยไม่มีอะไรฟ้อง (มันยังเป็น event ที่ถูกต้องทุกประการ)

### 8.2 Product Type / Capability

| Enum | ค่า |
|------|-----|
| `type` (Product/Order) | `PHYSICAL` / `DIGITAL` / `SERVICE` / `SUBSCRIPTION` |
| `fulfillmentMode` | `SHIPPED` / `NO_SHIPPING` |
| `billingMode` | `ONE_TIME` / `RECURRING` |
| `billingPeriod` | `MONTHLY` / `YEARLY` / `CUSTOM` |

**Capability defaults ตาม type** (ดู `src/lib/product-types/registry.ts`):

| Type | fulfillmentMode | billingMode | billingPeriod |
|------|----------------|------------|--------------|
| PHYSICAL | SHIPPED | ONE_TIME | — |
| DIGITAL | NO_SHIPPING | ONE_TIME | — |
| SERVICE | NO_SHIPPING | ONE_TIME | — |
| SUBSCRIPTION | NO_SHIPPING | RECURRING | MONTHLY |

### 8.2b ShopPageBlock (feature 00035)

| Enum | ค่า |
|------|-----|
| `type` | `BADGE_HIGHLIGHT` / `FACEBOOK_POST` |

**Profile tab keys (SSOT `src/lib/profile-tab-keys.ts::PROFILE_TAB_KEYS`)** — ใช้ทั้งใน `ShopPageLayout.tabOrder` และการตัดสินว่าแท็บไหน render จริงบน `/u`,`/b`:
`pinned`, `rooms`, `calendar`, `services`, `items`, `about`, `reviews`

### 8.2c Comment Auto-Reply (feature 00038)

| Enum | ค่า |
|------|-----|
| `PageComment.resolvedReason` | `MANUAL` / `ALREADY_REPLIED_EXTERNALLY` (`NULL` = ยังไม่จบงาน) — ส่วนขยาย 2026-08-19 |
| `CommentReplyLog.trigger` | `AUTO` (ระบบ) / `MANUAL` (คนกด) |
| `CommentReplyLog.publicReplyStatus` / `privateReplyStatus` | `SENT` / `SKIPPED` / `FAILED` (`NULL` = ยังไม่ตัดสิน/ไม่เกี่ยวข้อง) |
| `CommentReplyLog.skipReason` | `FROM_PAGE` / `NOT_TOP_LEVEL` / `COMMENT_DELETED` / `NO_SENDER_ID` / `CHANNEL_INACTIVE` / `DISABLED` / `HUMAN_ANSWERED` / `WINDOW_EXPIRED` — 🛑 `ALREADY_HANDLED` ถอดออก 2026-08-15 (เขียนลงฐานไม่ได้เลยเพราะชน partial unique index ตัวเดียวกับที่มันอธิบาย) "เคยทักคนนี้บนโพสต์นี้แล้ว" ย้ายไปเป็น `privateReplyStatus='SKIPPED'` + `privateErrorMessage='ALREADY_SENT'` รายคอมเมนต์ |
| สถานะ 3 ชั้นของคอมเมนต์ (คำนวณ ไม่ใช่คอลัมน์) | "ยังไม่ตอบ" / "บอทตอบแล้ว" / "คนตอบแล้ว" — ดู `docs/20 - Features/00038 - Comment Auto-Reply/SRS.md` TFR-009 |

### 8.2d ChatMessage `deliveryStatus` (feature 00018, ส่วนขยาย 2026-08-23 — คิวส่งข้อความขาออก)

| ค่า | ความหมาย | Terminal? |
|-----|---------|---------|
| `null` | ข้อความในแอป (แชท DEEP — ไม่เกี่ยวกับการส่งออกช่องทางนอกเลย) | — |
| `QUEUED` | เขียนลง DB แล้ว รอ/กำลังยิงออกช่องทางนอก — **ยังไม่เคยหรือกำลังแตะ Meta/LINE** ผลไม่แน่ชัด | ไม่ |
| `SENT` | ยิงสำเร็จ มี `externalMessageId` | ✅ |
| `FAILED` | ปลายทางปฏิเสธ หรือ claim ค้างเกิน 3 นาที (ไม่รู้ผล) — มี `failureReason` เสมอ | ✅ |

ปลายทางของ state machine มีแค่ `SENT`/`FAILED` **เหมือนเดิมทุกประการ** — `QUEUED` เป็นสถานะระหว่างทางเท่านั้น
ห้ามมีโค้ดไหนถือว่า `QUEUED` เป็นจุดจบ. 🛑 ตรรกะที่เทียบ `deliveryStatus` แบบ binary (เช่น `=== 'FAILED'`
แล้วถือว่านอกนั้นปกติ — พบจริงที่ `ChatThread.tsx:2913`) ต้องขยายเป็น type union
`'SENT' | 'FAILED' | 'QUEUED' | null` ให้ `tsc` บังคับให้ครบ และ grep **ทั้ง repo** (คอลัมน์เป็น `String`
ไม่มี CHECK ที่ระดับ DB ให้ grep object key จับได้) — ดู `docs/conventions/enum-value-removal.md`

### 8.3 Verification

| Enum | ค่า |
|------|-----|
| `type` | `PHONE_OTP` / `ID_DOC` / `BUSINESS_REG` |
| `level` | 1 / 2 / 3 |
| `status` | `PENDING` / `APPROVED` / `REJECTED` |

### 8.4 Badge

| Enum | ค่า |
|------|-----|
| `type` | `ACHIEVEMENT` / `VERIFICATION` |
| `audience` | `SELLER` / `BUYER` / `ANY` |
| `criteria.type` (KnownCriteriaTypes) | `FIRST_ORDER` / `ORDER_COUNT` / `PERFECT_RATING` / `HIGH_RATING` / `ZERO_COMPLAINT` / `VETERAN` / `FAST_SHIPPING` / `FULL_VERIFICATION` / `UNIQUE_REVIEWERS` / `SIGNUP_YEAR` |

**criteria fields ต่อ type** (ดู `src/lib/validations.ts:174`):

| criteria.type | fields เพิ่มเติม |
|--------------|--------------|
| `FIRST_ORDER` | — |
| `ORDER_COUNT` | `count: int ≥1` |
| `PERFECT_RATING` | `minReviews: int ≥1` |
| `HIGH_RATING` | `minRating: decimal ≥0.1`, `minReviews: int ≥1` |
| `ZERO_COMPLAINT` | `minOrders: int ≥1` |
| `VETERAN` | `minDays: int ≥1`, `statuses?: string[]` |
| `FAST_SHIPPING` | `maxHours: decimal ≥0.1`, `minOrders: int ≥1`, `statuses?: string[]` |
| `FULL_VERIFICATION` | — |
| `UNIQUE_REVIEWERS` | `count: int ≥1` |
| `SIGNUP_YEAR` | `year: int 2000-2100` |

### 8.5 Wallet / TopUp / SMS

| Enum | ค่า |
|------|-----|
| WalletTransaction `type` | `TOPUP` / `DEDUCT` |
| TopUpRequest `status` | `PENDING` / `APPROVED` / `REJECTED` |
| SmsCode `deliveryStatus` | `PENDING` / `SENT` / `FAILED` |
| Order `cancelInitiator` | `"seller"` / `"buyer"` |

### 8.6 Trust Tier (ดู SSOT `docs/10 - Business Rules/Tier Lists.md`)

| Trust Score | Letter Grade | Tier Name | Cover |
|------------|-------------|----------|-------|
| 90–100 | A+ | Deep Star | `tier_cover_5_star.png` |
| 80–89 | A | Deep Diamond | `tier_cover_4_diamond.png` |
| 70–79 | B+ | Deep Gold | `tier_cover_3_gold.png` |
| 60–69 | B | Deep Silver | `tier_cover_2_silver.png` |
| 40–59 | C | Deep Classic | `tier_cover_1_classic.png` |
| 0–39 | D | Deep Classic | `tier_cover_1_classic.png` |

### 8.6b Shop Category Keys

10 categories ใน `src/lib/shop-categories.ts` — `isShopCategory()` guard:
`fashion`, `electronics`, `food`, `beauty`, `home`, `sports`, `books`, `automotive`, `pets`, `other`

### 8.7 ค่าคงที่สำคัญ

| ค่า | ตัวเลข | ที่มา |
|-----|--------|------|
| SMS cost | ฿1/ข้อความ | `send-sms/route.ts:18` |
| SMS daily cap | 200 SMS/วัน/shop (ICT boundary) | `send-sms/route.ts:15` |
| SMS hourly burst | 20 SMS/ชม./shop (in-memory) | `lib/sms.ts:consumeSmsQuota` |
| SMS consume rate-limit | 10 req/15min/IP | `lib/sms-consume-rl.ts` |
| SMS code TTL | 72 ชั่วโมง | `sms-code.service` |
| SMS code length | 12 chars (charset ไม่มี I/O/0/1) | `sms-code.service:7` |
| File upload max | 5 MB | `lib/storage/types.ts:24` (validateUpload) |
| Product images max | 10 รูป | `validations.ts:64` |
| Badge image max | 256 KB (PNG/WebP/JPEG เท่านั้น ห้าม SVG) | `validations.ts:260` |
| OTP rate-limit | 3 req/10min/เบอร์ | `lib/otp.ts:consumeOtpRequestQuota` |
| TopUp min | ฿100 | `validations.ts:285` |
| TopUp max | ฿100,000 | `validations.ts:290` |
| wallet event ack max | 50 ids/request | `wallet/events/route.ts:108` |
| Trust score rating floor | ≥3 reviews (ถ้าน้อยกว่า = 0 คะแนน) | FR-3.3 |
| API rate-limit unauth | 100 req/min/IP | `proxy.ts:24` |
| API rate-limit auth | 30 req/min/IP | `proxy.ts:24` |
| seller-credentials rate-limit | 5 attempts/10min/username (in-memory) | `lib/auth.ts` |
| Shop slug length | 3–30 chars | `src/lib/shop-slug.ts` |
| Shop category count | 10 categories | `src/lib/shop-categories.ts` |
| เหรียญตราเด่นสูงสุด (Page Builder) | 4 ใบ/บล็อก | `ShopPageBlock_type_fields_check` (DB) + `SaveShopPageLayoutSchema` (Valibot, `maxLength(4)`) |
| Profile tab keys | 7 คีย์ | `src/lib/profile-tab-keys.ts::PROFILE_TAB_KEYS` |

---

### 8.8 แผนการตรวจสอบร้านค้า (feature 00060 — Draft, ยังไม่ implement)

> **ห้ามใช้คำว่า "ระดับ/Level/Tier" กับสินค้านี้** — สงวนให้ Trust Tier ซึ่งเป็นคนละแกน (`CONTEXT.md`)
> คำที่ใช้คือ **ขั้นการตรวจสอบ (step)**

**`InspectionPlanStatus`** — `ACTIVE` \| `LAPSED` **เท่านั้น ห้ามเพิ่มค่าที่ 3** (เพิ่มค่าที่ 3 จะทำให้
ทุกจุดที่เช็ค `status === 'ACTIVE'` (การตรวจ/ป้าย/การตัดเครดิต) ตกกรณี "ยกเลิกแล้วรอสิ้นรอบ" เงียบ ๆ —
คลาสเดียวกับ `docs/conventions/enum-value-removal.md`) "ยกเลิกแล้วรอสิ้นรอบ" = `ACTIVE` +
`canceledAt != null` ไม่ใช่ค่าที่สาม

**`InspectionMethod`** — `AUTO` \| `DOCUMENT` \| `VIDEO_CALL` \| `ONSITE` — **ไม่ผูกกับ `step` แบบ
หนึ่งต่อหนึ่ง** ห้าม derive `method` จาก `step`

**`InspectionOutcome`** — `PASS` \| `FAIL` \| `NOT_APPLICABLE` เท่านั้น (เก็บใน DB) — สถานะที่ผู้ใช้
เห็นมี 5 ค่า (เพิ่ม `RECHECK_DUE`/`NO_DATA`) เป็น derived state ห้ามเก็บเป็นคอลัมน์ (ดู §6.z)

**`InspectionEvidenceVisibility`** — `PUBLIC` \| `PRIVATE` · default **`PRIVATE`** (fail-closed)

**`InspectionEvidenceKind`** — `PHOTO` \| `VIDEO_STILL` \| `DOCUMENT` \| `GEO`

**`lapsedReason`** (บน `InspectionPlan`) — `String?` **ไม่ใช่ enum** (มิเรอร์ `Shop.packageLockReason`
— ไม่มี DB CHECK บังคับรายชื่อ): `"RENEWAL_FAILED"` (ค้างชำระเกินผ่อนผัน) \| `"OWNER_CANCELLED"`
(OWNER กดยกเลิกเอง) — หน้าโปรไฟล์สาธารณะแสดงข้อความเดียวกันทั้งสองกรณี มีผลเฉพาะฝั่งร้าน+รายงาน

**ข้อตรวจ 18 คีย์คงที่** — SSOT ในโค้ดที่ `src/lib/inspection/checks.ts` **ไม่ใช่ตาราง DB** (มิเรอร์
รูปแบบ `Shop.categories`/`Room.facilities`) — ผูกร้าน (`SHOP`, 7 คีย์): `scam_db` · `phone_identity`
· `account_age` · `chat_response_speed` · `complaints` · `id_card_selfie` · `bank_account_name` —
ผูกที่พักรายหลัง (`ROOM`, 11 คีย์): `duplicate_listing` · `lease_right_document` · `hotel_license`
· `video_tour` · `operating_evidence` · `location_exists` · `photos_match` · `room_count` ·
`facilities` · `accessibility` · `deep_photo_album`

| checkKey | ขั้น | scope | method | อายุผล (ttlDays) | ร้านส่งเอกสารเองได้ |
|---|---|---|---|---|---|
| `scam_db` | 1 | SHOP | AUTO | 1 วัน | ไม่ |
| `phone_identity` | 1 | SHOP | AUTO | 1 วัน | ไม่ |
| `account_age` | 1 | SHOP | AUTO | 1 วัน | ไม่ |
| `chat_response_speed` | 1 | SHOP | AUTO | 1 วัน | ไม่ |
| `complaints` | 1 | SHOP | AUTO | 1 วัน | ไม่ |
| `duplicate_listing` | 1 | ROOM | AUTO | 1 วัน | ไม่ |
| `id_card_selfie` | 2 | SHOP | DOCUMENT | 12 เดือน | ใช่ |
| `bank_account_name` | 2 | SHOP | DOCUMENT | 12 เดือน | ใช่ |
| `lease_right_document` | 2 | ROOM | DOCUMENT | 12 เดือน | ใช่ |
| `hotel_license` | 2 | ROOM | DOCUMENT | 12 เดือน | ใช่ |
| `video_tour` | 3 | ROOM | VIDEO_CALL | 6 เดือน | ไม่ |
| `operating_evidence` | 3 | ROOM | VIDEO_CALL | 90 วัน | ใช่ |
| `location_exists` | 4 | ROOM | ONSITE | 12 เดือน | ไม่ |
| `photos_match` | 4 | ROOM | ONSITE | 12 เดือน | ไม่ |
| `room_count` | 4 | ROOM | ONSITE | 12 เดือน | ไม่ |
| `facilities` | 4 | ROOM | ONSITE | 12 เดือน | ไม่ |
| `accessibility` | 4 | ROOM | ONSITE | 12 เดือน | ไม่ |
| `deep_photo_album` | 4 | ROOM | ONSITE | 12 เดือน | ไม่ |

🛑 **ตารางนี้ยึดตาม `API.md` ของ 00060 (§3.2 ข) ไม่ใช่ตาม `SRS.md` ของ 00060 (TFR-001)** — สองไฟล์นั้น
ขัดกันเอง 2 จุดที่ไม่ใช่แค่การตั้งชื่อ: (1) ป้าย scope `PROPERTY` (SRS) เทียบกับ `ROOM` (API) —
ความหมายเดียวกัน เลือกใช้ `ROOM` ตาม API.md ที่นี่ (2) **`operating_evidence` — SRS ระบุ
`method='DOCUMENT'`, API ระบุ `method='VIDEO_CALL'`** เป็นค่าที่ต่างกันจริง ไม่ใช่แค่ป้าย — **ต้อง
ยืนยันกับทีมก่อน implement** (ดูรายงานความไม่ตรงกันท้ายสรุปการ sync รอบนี้)

`ttlDays` มาจาก metadata ของแต่ละ `checkKey` ผ่านฟังก์ชัน `ttlDays(checkKey, planStep)` — **ไม่ใช่ค่า
คงที่ต่อคีย์**: ร้านขั้นที่ 4 ต้องทวน `video_tour`/`operating_evidence` ทุก **90 วัน** (ไม่ใช่ 180)
เพราะขั้นที่สูงกว่าตรวจถี่กว่า — ผูกกับ **`lastConfirmedAt`** ของแถวผลตรวจ ไม่ใช่ `checkedAt`

---

## §9 Authorization Matrix

> "phone parity" = ต้องส่ง `contact` ที่ตรงกับ `order.buyerContact` ใน DB
> "SMS cookie" = HMAC-signed httpOnly cookie จาก `/api/o/sms/[code]`
> **shop derive จาก session userId เสมอ** (DAL ownership — ห้ามรับ shopId จาก client)

### 9.1 Order Operations

| Operation | Guest | Buyer (authed) | Seller-owner | Admin |
|-----------|-------|---------------|-------------|-------|
| ดู order public (`/o/{token}`) | ✅ (ก่อน unlock เห็นแค่บางส่วน) | ✅ | ✅ | ✅ |
| phone-unlock (POST /unlock) | ✅ | ✅ | — | — |
| confirm order | ✅ (phone parity หรือ SMS cookie) | ✅ | — | — |
| cancel order (PENDING เท่านั้น) | ✅ (phone parity; buyerContact ต้องไม่ null) | ✅ | ✅ (session owner) | — |
| ship order | — | — | ✅ | — |
| แนบสลิป | ✅ (phone parity หรือ SMS cookie, PENDING เท่านั้น) | ✅ | — | — |
| ส่ง SMS | — | — | ✅ (wallet ต้องมีเครดิต) | — |
| ตั้ง accessUrl | — | — | ✅ | — |
| ดู buyer phone (SMS cookie) | — | ✅ (ถือ SMS cookie valid) | — | — |
| เขียนรีวิว | ✅ (phone parity) | ✅ | — | — |
| **แก้ไข/ลบรีวิวของตัวเอง** (00041) | ✅ (phone parity, ภายใน 24 ชม.) | ✅ (ภายใน 24 ชม.) | — | — |
| **ตอบกลับ/ลบคำตอบรีวิว** (00041) | — | — | ✅ (owner หรือ `ShopMember(ADMIN)`, ไม่จำกัดเวลา) | — |
| **บันทึกว่าเริ่มยืนยันตัวตน** (00041) | ✅ (ไม่ต้อง login — คืน 204 เสมอ) | ✅ | ✅ | ✅ |

### 9.2 Product / Shop

| Operation | Guest | Buyer | Seller-owner | Admin |
|-----------|-------|-------|-------------|-------|
| ดู public profile `/u/{username}` | ✅ | ✅ | ✅ | ✅ |
| สร้างร้าน | — | ✅ | — | — |
| แก้ข้อมูลร้าน | — | — | ✅ | — |
| CRUD product | — | — | ✅ | — |
| ตั้ง slug (`POST /api/shops/slug`) | — | — | ✅ (ครั้งแรก; หลังตั้งแล้ว = 409 `SLUG_ALREADY_SET` — บังคับใน `setShopSlug()` ตั้งแต่ 2026-08-14 ก่อนหน้านั้นบรรทัดนี้เป็นคำอธิบายที่ไม่มีด่านจริง กันได้แค่ด้วยการที่หน้าจอไม่มีช่องกรอกให้) | — |
| ตรวจ slug (`GET /api/shops/check-slug`) | ✅ | ✅ | ✅ | ✅ |
| เข้า `/onboarding` | — | — | ✅ (seller authed เท่านั้น) | — |

### 9.2b ตัวจัดหน้าร้าน (Page Builder, feature 00035)

| Operation | Guest | Buyer | Seller — OWNER/ADMIN ของร้าน active | Seller — ไม่ใช่สมาชิกร้านนี้ | Admin |
|-----------|-------|-------|--------------------------------------|--------------------------------|-------|
| ดูผลลัพธ์บน `/u`,`/b` (เผยแพร่อยู่) | ✅ | ✅ | ✅ | ✅ | ✅ |
| ดูหน้าที่ปิดเผยแพร่ (`isPublished=false`) | ❌ (`ProfileUnavailable`, HTTP 200) | ❌ | ✅ (`canAccessShop`) | ❌ | ❌ |
| เปิด `/public-profile/builder` (server page, desktop เท่านั้น) | — | — | ✅ (`requireActiveShop` + slug ต้องมีก่อน) | ❌ redirect | — |
| `GET .../library` / `POST .../facebook-posts/mirror` / `PUT /page-builder` / `PATCH .../publish` | — | — | ✅ | ❌ `403 FORBIDDEN` | — |
| โหมด draft preview (`?builderDraft=1`) | เห็นหน้าปกติ (query param ไม่มีผลด้าน authz) | เห็นหน้าปกติ | ✅ mount `BuilderPreviewBridge` | เห็นหน้าปกติ | เห็นหน้าปกติ |

> enforce ทั้ง 2 ชั้น: **server** (`canAccessShop` ทุกฟังก์ชันใน `shop-page-layout.service.ts` เป็นบรรทัดแรกเสมอ) และ **หน้าจอ** (`(fullscreen)` layout guard + `requireActiveShop` ที่ `page.tsx`) — ไม่มี role `STAFF` ในระบบ จึง "OWNER + ShopMember(role=ADMIN)" เทียบเท่ากับ `canAccessShop` ตรง ๆ

### 9.2c Comment Auto-Reply (feature 00038)

| Operation | Guest | Buyer | Seller — สมาชิกร้านของเพจนี้ | Seller — ไม่ใช่สมาชิกร้านนี้ | Admin |
|-----------|-------|-------|-------------------------------|--------------------------------|-------|
| `PATCH /api/shops/comment-reply/config` | — | — | ✅ (`canAccessShop`) | ❌ (shop derive จาก session — ไม่เห็นข้อมูลร้านอื่นเลย) | — |
| `GET /api/shops/comment-reply/logs` | — | — | ✅ | ❌ | — |
| `POST /api/chat/comments/[commentId]/private-reply` | — | — | ✅ (ownership ผ่าน `comment→post→channel→shop`) | ❌ `403 FORBIDDEN` | — |
| `POST/DELETE /api/chat/comments/[commentId]/resolve` | — | — | ✅ (ownership ผ่าน `comment→post→channel→shop`) | ❌ `403 FORBIDDEN` | — |
| `POST /api/chat/comments/resolve-expired` | — | — | ✅ (`resolveChatScope` + `assertShopsAccessible`) | ❌ `403 FORBIDDEN` | — |
| ปุ่ม "ทักแชท" ใช้ได้แม้ปิดสวิตช์อัตโนมัติ | — | — | ✅ (ไม่ผูกกับสวิตช์เลย) | — | — |

### 9.3 Verification

| Operation | Guest | Buyer/Seller | Admin |
|-----------|-------|-------------|-------|
| ดู verification ตัวเอง | — | ✅ | ✅ |
| ส่ง verification request | — | ✅ | — |
| approve/reject verification | — | — | ✅ (self-review block: ห้าม approve ของตัวเอง — guard ที่ `verification.service.ts:reviewVerification`) |

### 9.4 Wallet / TopUp

| Operation | Guest | Seller | Admin |
|-----------|-------|--------|-------|
| ดู wallet (balance + transactions) | — | ✅ (session-scoped) | — |
| สร้าง TopUpRequest | — | ✅ | — |
| poll wallet events | — | ✅ | — |
| approve TopUpRequest | — | — | ✅ (RC-7: ห้าม approve ร้านตัวเอง — guard ที่ route) |
| reject TopUpRequest | — | — | ✅ (RC-7 เหมือนกัน) |

### 9.5 Files

| ประเภทไฟล์ | Guest | Buyer/Seller (เจ้าของ) | Admin |
|-----------|-------|----------------------|-------|
| Public image (product/shop) | ✅ | ✅ | ✅ |
| KYC document | ❌ | ✅ (เจ้าของ record เท่านั้น) | ✅ |
| TopUp slip | ❌ | ✅ (เจ้าของร้าน) | ✅ |
| Order payment slip | ❌ | ✅ (เจ้าของร้าน) | ✅ |

### 9.6 Admin Panel

| Resource | Admin |
|----------|-------|
| Dashboard 8 metrics | ✅ |
| User list + trust score | ✅ |
| Verification queue + review | ✅ (self-review block) |
| Order monitoring | ✅ (read-only) |
| Badge CRUD | ✅ |
| TopUp queue + approve/reject | ✅ (self-block RC-7) |

**Admin privilege:** ตั้งผ่าน `User.isAdmin=true` ใน DB seed เท่านั้น — ไม่มี self-service elevation

### 9.7 Finance / Cost (feature 00016 — อัปเดต 2026-08-08)

| Operation | Seller-owner | Staff (ShopMember ADMIN) + `staffCanViewFinance=true` (**ค่าเริ่มต้นตั้งแต่ 2026-08-08**) | Staff + toggle ปิด (owner ปิดเอง) |
|---|---|---|---|
| `/expenses` — CRUD ค่าใช้จ่าย + รายงาน P&L | ✅ | ✅ | ❌ locked "ยังไม่ได้รับสิทธิ์" |
| กำไรสุทธิบน 3 surface หน้ายอดขาย | ✅ | ✅ | ❌ |
| **กำไรรายออเดอร์ (`/orders/[token]`)** | ✅ | ✅ | ❌ **ต้องไม่อยู่ใน flight payload ด้วย** ไม่ใช่แค่ไม่ render |
| toggle `staffCanViewFinance` | ✅ เท่านั้น | ❌ | ❌ |
| ตั้ง `Product.cost` ในฟอร์มสินค้า | ✅ | ✅ | ⚠️ **✅ (KG-EXT-01)** |
| เห็นต้นทุน/มาร์จิ้นในรายการสินค้า | ✅ | ✅ | ⚠️ **✅ (ตามหลัง KG-EXT-01 โดยตั้งใจ)** |

⚠️ **KG-EXT-01 — ช่องว่างที่รู้ตัวและเลือกไว้ก่อน (D-EXT-2):** `staffCanViewFinance` **ไม่ครอบ `Product.cost`** — `isCostEditAllowed()` ไม่เคยเช็ค role/toggle เลย (คอมเมนต์ในโค้ดยอมรับเอง) หลังเปิดฟรี 2026-08-07 ความเสี่ยงนี้ขยายจาก "เฉพาะร้านที่จ่ายเงิน" เป็น **ทุกร้านที่มี staff** — user รับทราบและเลือก defer ไว้ก่อน รายละเอียดที่ BRD ของ 00016 §11.2

🛑 **ไม่มี gate ของ subscription ในหมวดนี้อีกแล้ว** — ถ้าเจอโค้ดที่เรียก `getSubscriptionStatus()` แล้วบล็อกการเข้าถึงต้นทุน/P&L แปลว่าตกหล่นจากรอบ D-EXT-1 ให้ถอด. `getSubscriptionStatus()` ที่เรียกจาก **AI quota / โควตาหลายร้าน / หน้าจัดการแพ็กเกจ** เป็นคนละเรื่อง — ห้ามแตะ

---

### 9.8 แผนการตรวจสอบร้านค้า (feature 00060 — Draft, ยังไม่ implement)

| ผู้เรียก | เงื่อนไข | เข้าถึงได้ |
|---|---|---|
| OWNER ของร้าน | `Shop.vertical === 'LODGING'` | `/api/seller/inspection/**` ทั้งอ่าน+เขียน |
| ADMIN ของร้าน (`ShopMember.role='ADMIN'`) | เป็นสมาชิกร้านนั้น | `GET /api/seller/inspection` เท่านั้น — mutation ได้ `403 NOT_OWNER` |
| **ผู้ตรวจ** (`User.isInspector === true`) | รอบตรวจนั้นมี `inspectorUserId === sessionUserId()` | `/api/inspector/**` เฉพาะรอบที่ตนถือ — **ห้ามเห็นข้อมูลการเงินทุกชนิดไม่ว่าร้านไหน** |
| แอดมินระบบ (`User.isAdmin === true`) | — | `/api/admin/inspection/**` |
| สาธารณะ (ไม่ล็อกอิน) | — | ไม่มี endpoint ใดเลย — อ่านผลตรวจผ่าน RSC/service call ที่กรอง `visibility='PUBLIC'` เท่านั้น |

🛑 **บทบาทใหม่ "ผู้ตรวจ" ไม่เคยอยู่ในเมทริกซ์นี้มาก่อน** — เป็น actor แรกในระบบที่ **ไม่ใช่**
`isAdmin`/`ShopMember`/buyer แต่มีสิทธิ์เขียนข้อมูลที่กระทบโปรไฟล์สาธารณะได้ ต้อง scope ด้วย
`WHERE inspectorUserId = <session>` ในคิวรีแรกเสมอ ห้ามดึงมาแล้วกรองใน TypeScript ทีหลัง —
`isInspector === true` **ไม่ได้แปลว่าเห็นทุกรอบ**

🛑 **ไม่มีวิธี self-service ตั้ง `User.isInspector`** ในสัญญาที่ล็อกแล้ว — ตั้งผ่าน DB โดยตรง
เหมือน `User.isAdmin` (ดู §9.6)

---

## §10 Validation Rules

> ดู `src/lib/validations.ts` เป็น SSOT — section นี้ summary สำหรับ dev

### 10.1 Auth / OTP

| Field | กฎ |
|-------|-----|
| `contact` (OTP) | string 1-20 chars |
| `type` (OTP) | picklist: `phone` / `email` / `PHONE` / `EMAIL` |
| `otp` | string length = 6 |
| `phone` (unlock) | regex `MOBILE_PHONE_RE` = `^0[689][0-9]{8}$` (มือถือไทย 10 หลัก ขึ้นต้น 06/08/09) |

### 10.2 Shop

| Field | กฎ |
|-------|-----|
| `shopName` | string 1-100 chars |
| `description` | string ≤500 chars (optional) |
| `category` | string ≤50 chars (optional) |
| `address` | string ≤200 chars (optional) |
| `businessType` | picklist: `INDIVIDUAL` / `COMPANY` |
| `logo` | string ≤200 chars — fileId (optional) |

### 10.2b Shop Page Builder (feature 00035)

| Schema | Field | กฎ |
|--------|-------|-----|
| `BuilderLibraryQuerySchema` | `q` | string ≤200 chars (optional) |
| | `cursor` | string ตัวเลขล้วน — regex `^\d+$` (optional; offset-based, `Number(cursor)` ที่ service) |
| | `take` | int 1-50 (optional, default 20 ที่ service) |
| `MirrorFacebookPostSchema` | `facebookPostId` | UUID |
| `SaveShopPageLayoutSchema` | `tabOrder` | string[] ≤7 items — ค่าที่ไม่ใช่ 1 ใน 7 tab key (§8.2b) **ถูกกรองทิ้งเงียบ ๆ** ด้วย `v.transform` ไม่ reject ทั้ง request |
| | `blocks` | array ≤200 items — discriminated union ตาม `type` (`v.variant`) |
| | `blocks[].badgeIds` (เมื่อ `type=BADGE_HIGHLIGHT`) | UUID[] ≤4 |
| | `blocks[].facebookPostId` (เมื่อ `type=FACEBOOK_POST`) | UUID |
| `SetShopPagePublishedSchema` | `isPublished` | boolean |

**หมายเหตุ:** เพดาน "เหรียญเกิน 4/มีบล็อกเหรียญเกิน 1 ใบ" ถูก reject ที่ Valibot (`maxLength(4)`) เป็นด่านแรก, ที่ service (`TOO_MANY_BADGE_BLOCKS`) เป็นด่านสอง, และ DB CHECK (`ShopPageBlock_type_fields_check`) เป็นด่านสาม — ความเป็นเจ้าของจริงของ `badgeIds`/`facebookPostId` (`BADGE_NOT_OWNED`/`POST_NOT_OWNED`) ตรวจที่ service เท่านั้น (Valibot ตรวจ shape ไม่ได้ตรวจความเป็นเจ้าของ)

### 10.2c Comment Auto-Reply (feature 00038)

| Schema | Field | กฎ |
|--------|-------|-----|
| `PatchCommentReplyConfigSchema` | `shopChannelId` | UUID |
| | `commentPublicReplyEnabled` / `commentPrivateReplyEnabled` | boolean (optional) |
| | `commentPublicReplyText` / `commentPrivateReplyText` | string ≤1000 chars, nullable (optional) — **เปิดสวิตช์ที่เกี่ยวข้องแล้วข้อความว่าง/`null` = reject ที่ service เป็นด่านสอง** (Valibot ตรวจ shape เดี่ยว ๆ เท่านั้น ตรวจ "สวิตช์คู่กับข้อความ" ไม่ได้เพราะเป็น partial update) |
| `SendPrivateReplySchema` | `message` | string 1-1000 chars |
| `CommentReplyLogQuerySchema` | `shopChannelId` | UUID (optional) |
| | `cursor` | string ตัวเลขล้วน — regex `^\d+$` (optional) |
| | `take` | int 1-50 (optional, default 20) |

### 10.3 Product

| Field | กฎ |
|-------|-----|
| `name` | string 1-200 chars |
| `description` | string ≤5000 chars (optional) |
| `shortDescription` | string ≤200 chars (optional) |
| `price` | number **≥0** (บังคับกรอก — `0` คือราคาศูนย์จริง ไม่ใช่ "ยังไม่ตั้ง" ดู §data model) |
| `type` | picklist: `PHYSICAL` / `DIGITAL` / `SERVICE` / `SUBSCRIPTION` |
| `images` | string[] ≤10 items (each 1-200 chars) |
| `tags` | string[] ≤10 items (each 1-50 chars) |
| `attributes` | record — key 1-50, value 0-200 chars |
| `fulfillmentMode` | picklist: `SHIPPED` / `NO_SHIPPING` (optional) |
| `billingMode` | picklist: `ONE_TIME` / `RECURRING` (optional) |
| `billingPeriod` | picklist: `MONTHLY` / `YEARLY` / `CUSTOM` — nullable (optional) |
| `billingPeriodDays` | int 1-365 — nullable (optional) |
| `cost` | number ≥0 — **optional/nullable** (ราคาทุน feature 00016) · `undefined` = ไม่แตะค่าเดิม · `null` = ล้างค่า · `≥0` = ตั้งค่า · ไม่มี gate ของแพ็กเกจแล้ว (D-EXT-1 2026-08-07) |

### 10.3a Customer File Library (feature 00048)

| Schema | ใช้ที่ | กติกา |
|--------|--------|-------|
| `LibrarySaveSchema` | `POST .../library` | `{ messageId: uuid }` เท่านั้น — ไม่รับ metadata ใด ๆ จาก client |
| `LibraryPatchSchema` | `PATCH .../library` | `fileId` บังคับ + ต้องมี `fileName` หรือ `note` อย่างน้อยหนึ่ง (`v.check`) · `fileName` ≤120 · `note` ≤500 · `null` = ตั้งใจล้างค่า ต่างจากไม่ส่ง field มาเลย = ไม่แตะ · ค่าที่ trim แล้วว่าง → เก็บเป็น `null` ผ่าน `normalizeLibraryText()` |

### 10.3b CSV Import — สต็อก + ต้นทุน (`CsvImportRowSchema`, Inventory Add-on PRO)

| Field | กฎ |
|-------|-----|
| `productId` | UUID — ต้องเป็นสินค้าของร้านตัวเอง และ `type='PHYSICAL'` (ไม่งั้นแถวนั้น `PRODUCT_NOT_PHYSICAL`) |
| `stockQty` | int ≥0 — **required ทุกแถว** |
| `cost` | number ≥0 — **optional** · ไม่ส่ง key = ไม่แตะ `Product.cost` เดิม · `0` = ตั้งศูนย์จริง · ติดลบ = แถวนั้น ERROR |
| ทั้งไฟล์ | ≤500 แถวต่อครั้ง · per-row isolation (แถวหนึ่งพังไม่ rollback แถวอื่น) · HTTP 200 เสมอเมื่อผ่าน validation ระดับ body |

🛑 client **ห้ามแปลง cell ว่างเป็น `0`** — `0` แปลว่า "ต้นทุนศูนย์บาทจริง" ถ้าแปลงผิด การ export→import โดยไม่แก้อะไรจะล้างต้นทุนทั้งไฟล์

### 10.4 Order

| Field | กฎ |
|-------|-----|
| `items` | array ≥1 item |
| `items[].productId` | UUID (optional) |
| `items[].name` | string ≥1 char |
| `items[].qty` | int ≥1 |
| `items[].price` | number **≥0** (฿0 = จองไว้ก่อน ยังไม่เก็บเงิน — เปลี่ยนจาก ≥0.01 เมื่อ 2026-08-10) |
| `type` | picklist: `PHYSICAL` / `DIGITAL` / `SERVICE` / `SUBSCRIPTION` |
| `buyerContact` | string **บังคับ** — regex `MOBILE_PHONE_RE` = `^0[689][0-9]{8}$` (มือถือไทย 10 หลัก ขึ้นต้น 06/08/09). บังคับมาตั้งแต่ FR ของ 00015 (TFR-009) · เข้มขึ้นจาก `^0[0-9]{9}$` เมื่อ 2026-08-21 |
| `buyerName` | string (optional) |
| `paymentMethod` | string (optional) |
| `salesChannel` | string (optional) |
| `internalNote` | string (optional) |
| `discount` | number ≥0 (optional) |
| `vatRate` | number ≥0 ≤1 — decimal fraction (0.07 = 7%) (optional) |
| `vatAmount` | number ≥0 (optional) |
| `shippingAddress` | object `{line1?, subdistrict?, district?, province?, postcode?, note?}` (optional) — **required ที่ service layer เมื่อ fulfillmentMode=SHIPPED** (line1+province+postcode ต้องมี) → 400 `ShippingAddressRequiredError` |
| `createdAt` | ISO-8601 **พร้อม offset** (regex บังคับ `Z` หรือ `±HH:MM` ท้ายค่า — เวลาไม่มี offset ตีความเพี้ยนข้ามเขตเวลา) (optional). ต้องอยู่ในช่วง 90 วันย้อนหลัง–7 วันล่วงหน้าจากเวลาปัจจุบัน มิฉะนั้น → 400 `OrderDateOutOfWindowError` (`ORDER_DATE_OUT_OF_WINDOW_MESSAGE`). ตรวจซ้ำที่ service (`createOrder`/`updateOrder`) เป็นด่านที่สอง เผื่อ caller ฝั่ง server ที่เรียกตรง ไม่ผ่าน schema — **feature 00033** |

### 10.4b การ์ดสรุปนัดหมาย (ส่วนขยาย 00024, 2026-08-11)

`POST /api/chat/conversations/[id]/messages` เมื่อ `type="APPOINTMENT"`

| Field | กฎ |
|-------|-----|
| `orderRefToken` | string ≥1 — ต้องเป็นออเดอร์ของ **ร้านเดียวกับเธรด** (`shopId` อยู่ใน `WHERE`) และต้องมี `serviceStart` มิฉะนั้น 400 |
| `hiddenKeys` | array ของ picklist `service` / `customer` / `phone` / `amount` / `deposit` (optional) — 🛑 **allow-list ไม่ใช่ deny-list และ `when` ไม่อยู่ในรายการโดยตั้งใจ** ส่งมาแล้ว → 400 (ด่านที่สองของ AC-APS-08; UI กันได้แค่คนที่เดินผ่านประตู) |
| `closing` | string ≤120 (`APPOINTMENT_CLOSING_MAX`) (optional) — trim แล้วว่าง = ไม่มีบรรทัดปิดท้าย |

เพิ่มเติมที่ service/route ตรวจ: ร้านต้องผ่าน `canUseAppointments` (อ่าน `vertical` ปัจจุบันเสมอ ไม่ใช่ธงที่เก็บบนแถว) · `isTerminalAppointmentStatus(order.appointmentStatus)` → 400 (ส่งใบยืนยันของนัดที่จบไปแล้วคือการส่งข้อมูลผิดออกไปหาลูกค้า)

### 10.5 Review

| Field | กฎ |
|-------|-----|
| `rating` | int 1-5 |
| `comment` | string ≤500 chars (optional) |

### 10.6 Shipment

| Field | กฎ |
|-------|-----|
| `provider` | string ≥1 char |
| `trackingNo` | string ≥1 char |

### 10.7 Badge (Admin)

| Field | กฎ |
|-------|-----|
| `name` | string 1-80 chars |
| `nameEN` | string 1-80 chars |
| `icon` | string ≥1 — nullable (optional) |
| `type` | picklist: `ACHIEVEMENT` / `VERIFICATION` |
| `audience` | picklist: `SELLER` / `BUYER` / `ANY` (optional, default `SELLER`) |
| `criteria` | discriminated union ตาม `criteria.type` (ดู §8.4) |
| Badge image upload | MIME: `image/png` / `image/webp` / `image/jpeg` เท่านั้น (ห้าม SVG); size ≤256 KB |

### 10.8 Wallet / TopUp

| Field | กฎ |
|-------|-----|
| TopUp `amount` | int 100-100,000 |
| TopUp `slipFileId` | string 1-200 chars |
| Reject `reason` | string 1-500 chars |
| `accessUrl` | string http/https เท่านั้น (กัน stored-XSS `javascript:/data:`) |

### 10.9 File Upload (ทั่วไป)

| กฎ | ค่า |
|----|-----|
| Max size | 5 MB |
| MIME ที่รองรับ (ทั่วไป/slip/KYC) | image/jpeg, image/png, image/webp, application/pdf (PDF สำหรับ L3 business reg + slip) — `lib/storage/types.ts:5` (ALLOWED_TYPES) |
| MIME — Badge image (stricter) | image/png, image/webp, image/jpeg เท่านั้น (ห้าม PDF/SVG) — `validations.ts:261` |

### 10.10 Auth / Seller (2026-06-16)

| Field | กฎ | Schema |
|-------|-----|--------|
| `password` | ≥8 chars, ต้องมี letter+number+special, max 1000 | `PasswordSchema` (`src/lib/validations.ts`) |
| `slug` (shop) | 3-30 chars a-z0-9- ไม่ขึ้น/ลงด้วย hyphen; `src/lib/shop-slug.ts:isValidSlugFormat` | `ShopSlugSchema` |
| `category` (shop) | picklist จาก `SHOP_CATEGORY_KEYS` (10 key) | `ShopCategorySchema` |
| phone (set-phone) | regex `MOBILE_PHONE_RE` = `^0[689][0-9]{8}$` + OTP ยืนยันก่อน set | `SetPhoneSchema` |

### 10.12 เบอร์โทร — 2 เกณฑ์ที่ไม่เท่ากันโดยเจตนา (2026-08-21)

🛑 ทั้งคู่อยู่ใน **`src/lib/phone.ts` ไฟล์เดียวกัน วางติดกัน** ตาม Hard Rule 16
ห้ามแยกไฟล์ และห้ามบีบตัวที่ 2 ให้เท่าตัวที่ 1

| | `MOBILE_PHONE_RE` | `normalizePhone()` |
|---|---|---|
| ค่า | `^0[689][0-9]{8}$` | `^0[0-9]{9}$` (หลวมกว่า) |
| ตอบคำถาม | *"ค่าใหม่ที่ยอมรับ"* | *"ค่าที่มีอยู่แล้วแปลว่าอะไร"* |
| ใช้ที่ | validator ทุกตัว (27 จุด) + chip แนะนำเบอร์ | `order-access.service.ts` (ตัดสินว่าผู้ซื้อเปิดออเดอร์ตัวเองได้ไหม) · `order-pii-mask.ts` · `order.service.ts` (derive Customer) |

**ทำไมไม่บีบให้เท่ากัน:** บน prod มี 13 ออเดอร์ที่ `buyerContact` เป็น `00000000xx`
(ข้อมูลเดโมของทีมรีวิว Meta/Apple) — บีบตัวที่ 2 = เปลี่ยนความหมายของข้อมูลเก่า
ย้อนหลัง จอฝั่งผู้ซื้อของใบพวกนั้นจะเปลี่ยนพฤติกรรมทันทีโดยไม่มีใครขอ

**แผนเลขหมายไทย:** มือถือ = 10 หลัก ขึ้นต้น 06/08/09 เท่านั้น
(`01/03/04/05/07` ที่ยังพบในเอกสารเก่าคือระบบ 9 หลัก **ก่อนการขยายเลขหมายปี 2549**)

---

### §10.13 การแสดงข้อมูลติดต่อลูกค้า — ใครเห็นเต็ม ใครเห็นปิดบัง (feature 00058 · D-13, 2026-08-24)

🛑 **นี่คือนิยามที่สาม ที่ไม่ใช่นิยามของ "เบอร์ที่ถูกต้อง"** — สองตัวข้างบนตอบว่า *ค่านี้ใช้ได้ไหม*
ส่วนตัวนี้ตอบว่า *ใครมีสิทธิ์เห็นค่านี้ครบ* คนละคำถามกันโดยสิ้นเชิง จึงอยู่คนละฟังก์ชัน
แต่ต้องอยู่ในเอกสารเดียวกันตาม Hard Rule 16

| ผู้ดู | เห็นอะไร | SSOT |
|---|---|---|
| **ผู้ขาย** (จอใต้ `(paces)/seller/**` ที่ดูข้อมูลลูกค้าของร้านตัวเอง — 6 จุด) | **เบอร์เต็ม** | `src/lib/seller-contact-display.ts` |
| **ผู้ขาย — หน้า `/customers` เท่านั้น** | **ปิดบังบนจอ + ปุ่มเปิดทีละแถว** | `maskContact` ใน `src/lib/customer-directory.ts` + `GET /api/seller/customers/[key]/contact` (feature 00057) |
| **ผู้ซื้อ / สาธารณะ** (`/o/[token]`, โปรไฟล์ร้าน) | ปิดบัง เหลือ 3 ตัวท้าย | `src/lib/order-pii-mask.ts` (FR-6.15/6.16) |
| **แอดมิน** (`/admin/**`) | ปิดบัง | `admin/(dashboard)/orders/page.tsx` |
| **คำเชิญเข้าร้าน / รีวิวสาธารณะ / ฟีดกิจกรรม** | ปิดบัง | `src/lib/phone-mask.ts` |

**เหตุผลที่ฝั่งผู้ขายเลิกปิดบัง:** ผู้ขายเป็นเจ้าของข้อมูลลูกค้าของตัวเอง มีปุ่มโทรที่ใช้เบอร์จริง
อยู่แล้ว และหน้ารายการคำสั่งซื้อส่ง `buyerPhone` ดิบข้าม RSC boundary มาตั้งแต่ 2026-06-15
สิ่งที่การปิดบังทำได้จริงจึงมีอย่างเดียวคือ **ทำให้ค้นหาไม่เจอ** — โค้ดเอาสตริงที่ถูกปิดบัง
(`••••••5678`) ไปเทียบกับคำค้น ⇒ พิมพ์เบอร์เต็มไม่มีวันเจอ ทั้งที่ช่องค้นหาเขียนเองว่าค้นเบอร์ได้

ก่อนหน้านี้ฝั่งผู้ขายมีฟังก์ชันปิดบังเขียนมือ **7 จุด คนละสูตร** ⇒ ผู้ขายคนเดิมเห็นเบอร์ลูกค้า
คนเดิมไม่เท่ากันในแต่ละหน้า (ละเมิด HR16 ตรง ๆ) — ถอดไป **6 จุด**

🛑 **`/customers` เป็นข้อยกเว้นที่ตั้งใจ (มติ Q18, 2026-08-24)** — feature 00057 แก้ปัญหา
เดียวกันด้วยวิธีที่ตรงต้นเหตุกว่า: **ย้ายการค้นหาไปทำที่ server กับค่าเต็ม** (`?q=`) แล้วคง
การปิดบังไว้บนจอ พร้อมปุ่มเปิดเบอร์ทีละแถวผ่าน endpoint ที่ตรวจสิทธิ์ ⇒ ได้ทั้ง "ค้นเจอ"
และ "เบอร์ของลูกค้าทุกคนไม่ติดไปกับ flight payload/ภาพหน้าจอที่ผู้ขายส่งต่อกัน"

⇒ **นี่ไม่ใช่ความไม่สม่ำเสมอที่ลืมแก้ แต่เป็นสองคำตอบของคำถามคนละข้อ:** หน้าอื่นแสดงเบอร์
เป็น *ข้อมูลประกอบของออเดอร์/นัดใบหนึ่ง* (ทีละใบ ผู้ขายกำลังทำงานกับใบนั้นอยู่) ส่วน
`/customers` คือ *ไดเรกทอรีของลูกค้าทั้งร้าน* (หลายร้อยแถวพร้อมกัน) ซึ่งเป็นรูปร่างข้อมูล
ที่ความเสี่ยงเรื่องภาพหน้าจอต่างกันคนละระดับ · ถ้าวันหนึ่งจะขยายแนวทางของ 00057 ไปหน้าอื่น
ต้องลบหน้านั้นออกจาก `SELLER_FILES` ในเทส `seller-contact-display.test.ts` พร้อมกัน

🛑 **ด่านบังคับ:** `src/lib/__tests__/seller-contact-display.test.ts` มีเทส `[blocker]` ที่
สแกนซอร์สกัน 2 ทิศ — ฝั่งผู้ขายต้องไม่มีตัวปิดบังเขียนมือหลงเหลือ **และ** ไฟล์นอก
`src/app/(paces)/seller/**` ต้องไม่เรียก `sellerContactDisplay` (พิสูจน์ด้วย mutation แล้วว่า
แดงจริงทั้งกรณีจอผู้ซื้อและจอแอดมินหันมาใช้ตัวของผู้ขาย)

---

### §10.14 ค้นหาในหน้ารายการคำสั่งซื้อ (feature 00058)

SSOT: **`src/lib/order-search.ts`** — ฟังก์ชันบริสุทธิ์ตัวเดียวที่ทั้งการ์ดมือถือและตาราง
เดสก์ท็อปเรียก (เดิมเป็นตรรกะคนละชุด ให้ผลไม่เท่ากันจากคำค้นเดียวกัน)

| กฎ | ค่า |
|---|---|
| ฟิลด์ที่ค้นได้ | เลขคำสั่งซื้อ (`formatOrderNo` derive สด) · รหัสสั้น · ชื่อผู้ซื้อ/username · **เบอร์โทร** · **เลขพัสดุ** · **ชื่อสินค้าใน `items`** |
| ฟิลด์ที่ **ไม่** ค้น | ที่อยู่ · หมายเหตุ · ช่องทาง (ข้อความยาว ทำให้ผลลัพธ์เกินจนช่องค้นหาไร้ประโยชน์) |
| ขั้นต่ำ | `ORDER_SEARCH_MIN_CHARS = 2` (นับหลัง trim) — ต่ำกว่านี้ไม่กรอง |
| หลายคำ | AND · **คนละคำตรงคนละฟิลด์ได้** · substring · ไม่สนตัวพิมพ์ |
| คำค้นตัวเลข | ตัดอักขระที่ไม่ใช่ตัวเลขทั้งสองฝั่งก่อนเทียบ — **เป็นสิทธิ์เพิ่ม ไม่ใช่สิทธิ์แทน** (ชื่อสินค้าที่มีตัวเลขต้องยังค้นด้วยตัวเลขได้) |
| คำค้นตัวหนังสือ | **ห้าม** ตัดสัญลักษณ์ (`เสื้อ-ยืด` ต้องไม่ไปตรงกับ `เสื้อยืดสีขาว`) |
| เบอร์ที่ก็อปมาพร้อมช่องว่าง | ทั้งก้อนนับเป็น **คำเดียว** ไม่ใช่หลายคำ — ไม่งั้นใบที่มี `081` ในเบอร์ · `234` ในชื่อ · `5678` ในเลขพัสดุ จะตรงด้วยทั้งที่ไม่เกี่ยวกับเบอร์ที่พิมพ์เลย |
| ลำดับผล | ใบที่ตรง **เต็มค่า** ของตัวระบุเฉพาะ (เลขคำสั่งซื้อ/รหัสสั้น/เบอร์/เลขพัสดุ) ลอยขึ้นบนสุดแบบ **stable partition** · **ชื่อผู้ซื้อและชื่อสินค้าไม่นับ** แม้ตรงเป๊ะ (ชื่อซ้ำกันได้) · ไม่มี fuzzy score |
| ที่รัน | client-side ทั้งหมด — ไม่มี API ใหม่ ไม่มี index ใหม่ |

**ทำงานร่วมกับตัวกรองอื่นเป็น AND** และเมื่อผลว่างต้องบอกจำนวนใบที่ตรงใน "ทั้งร้าน"
พร้อมปุ่มที่ล้างตัวกรอง 🛑 **ปุ่มนั้นต้องล้างทั้ง React state และ URL** — `localStatus`/
`typeFilter`/`dateFilter` ใน `OrdersList.tsx` ถูก init ครั้งเดียวและไม่เคย sync กลับจาก URL
ลิงก์ล้วนจึงไม่ล้างอะไรเลย ผู้ใช้จะกดแล้วเจอจอว่างใบเดิม

**`?q=` sync ด้วย `history.replaceState` หน่วง 400ms** ไม่ใช่ `router.replace` — ข้อมูลออเดอร์
โหลดมาครบทั้งร้านตั้งแต่ RSC แล้ว การให้ router ทำงานทุกตัวอักษรคือการดึง flight payload
ทั้งก้อนกลับมาใหม่ (~500–800KB ที่ร้าน 421 ใบ) เพื่อผลลัพธ์ที่คำนวณอยู่บนเครื่องอยู่แล้ว
และ `pushState` จะทำให้ทุกตัวอักษรกลายเป็นหนึ่งขั้นของปุ่ม back

#### ตัวเลขวัดจริง (D-9 บังคับให้มี ห้ามเขียนลอย ๆ)

วัดด้วย `scripts/bench-order-search.ts` (รันซ้ำได้ · `npx tsx scripts/bench-order-search.ts`)
บนข้อมูลสังเคราะห์ 6 คำค้น × 50 รอบ:

| จำนวนออเดอร์ต่อร้าน | เวลาต่อการค้นหา 1 ครั้ง |
|---|---|
| **421** (มากสุดบน prod 2026-08-24) | **~2.6 ms** |
| 1,000 | ~6.2 ms |
| 5,000 | ~29 ms |

🛑 **เลขนี้คือ "พื้น" ไม่ใช่ "เพดาน"** — วัดเฉพาะฟังก์ชันบริสุทธิ์ ไม่รวมต้นทุน re-render
ของ React ที่เกิดตามทุกตัวอักษร ต้นทุนที่ผู้ใช้รู้สึกจริงสูงกว่านี้เสมอ

**เกณฑ์ย้ายไปค้นฝั่ง server:** งบหนึ่งเฟรมที่ 60fps คือ 16.7 ms ⇒ ลำพังตัวค้นหากินงบทั้งเฟรม
ที่ราว **2,500–2,700 ใบ** และเมื่อรวม re-render จะถึงก่อนนั้น ⇒ **ตั้งเส้นไว้ที่ 1,500 ใบต่อร้าน**
เป็นจุดที่ต้องเริ่มทำ ไม่ใช่จุดที่เริ่มคิด · ร้านใหญ่สุดตอนนี้โตราว 500 ใบ/เดือน
⇒ เหลือเวลาประมาณ **2 เดือน** นับจาก 2026-08-24

🛑 **หนี้ที่รู้ตัว — และคอขวดไม่ได้อยู่ที่การค้นหา:** หน้านี้ไม่มี pagination เลย
`getOrdersByShop()` ดึงออเดอร์ทั้งร้านทุกครั้งที่เปิดหน้า (ข้อมูล prod 2026-08-24:
มากสุด **421 ใบ/ร้าน** · p90 229 · median 4 · ทั้งระบบ 541 ใบ · payload ~1.2–2 KB/แถว
⇒ **~500–800 KB ต่อการโหลดของร้านใหญ่** และถูกส่งใหม่ทั้งก้อนทุกครั้งที่กดชิปกรอง
เพราะ `pushQuery` ยิง `router.push`)

⇒ **ตัวที่จะเจ็บก่อนคือการโหลดหน้า ไม่ใช่การพิมพ์ค้นหา** วันที่ต้องแก้ ต้องแก้เป็นชุดเดียวกัน
(แบ่งหน้า + ค้นฝั่ง server + index) ไม่ใช่ย้ายเฉพาะช่องค้นหา — เพราะการค้นฝั่ง server
บนหน้าที่ยังโหลดทั้งร้านมาอยู่ดี ไม่ได้ประหยัดอะไรเลย

ที่มา: `docs/20 - Features/00014 - Customer Directory/EXTENSIONS-2026-08-21-phone-format.md`

### §10.15 คืนของ — วิธีคืน 3 ข้อ + ขนส่งขากลับ (feature 00056 · รอบ re-design 2026-08-25)

SSOT: **`src/lib/order-return.ts`** (กฎ) + **`src/lib/iship/courier.ts`** (รายชื่อขนส่ง)

#### สิ่งที่ API รับจาก client

`POST /api/orders/[token]/returns`

| ฟิลด์ | ค่า | หมายเหตุ |
|---|---|---|
| `items[]` | `{ orderItemId, qty≥1 }` อย่างน้อย 1 รายการ | กฎ "คืนได้อีกกี่ชิ้น" อยู่ที่ service ไม่ใช่ schema |
| `method` | `ISHIP` \| `SHOP_SELF` \| `BUYER_SELF` | **คีย์วิธีเท่านั้น** |
| `trackingNo` | string \| null · **เว้นว่างได้** | ไม่มี `minLength` โดยเจตนา (BR-RT-19) |
| `returnCourierCode` / `returnCourierName` | ≤120 ตัวอักษร | รหัสจาก `COURIER_OPTIONS` หรือรหัสแพ็กเกจจริงของ iShip |
| `returnParcel` | `{ weight, width, length, height }` \| null | ไม่ครบ = ใช้กล่องของขาไป |
| `countAsCost` | boolean | มีผลเฉพาะ `BUYER_SELF` |
| `reason`, `shippingCost` | เดิม | |

🛑 **`payer` และ `trackingSource` ไม่อยู่ใน schema โดยเจตนา** — เป็น *ผลลัพธ์* ที่
`resolveReturnShippingChoice()` ตัดสินฝั่ง server (BR-RT-39) เปิดให้ client ส่งมาเอง =
ให้จอกำหนดว่าใครจ่ายเงิน ซึ่งเป็นสิ่งที่วิธีที่เลือกบอกอยู่แล้ว

#### ตารางแปลง วิธี × เลขพัสดุ → ค่าที่บันทึก

| `method` | ช่องเลข | `payer` | `trackingSource` | `manualTrackingNo` | `countAsCost` |
|---|---|---|---|---|---|
| `ISHIP` | ไม่มีช่อง | `SHOP` | `ISHIP` | `null` (เลขที่หลุดมาถูกทิ้ง) | บังคับ `true` |
| `SHOP_SELF` | เว้นว่าง | `SHOP` | `NONE` | `null` | บังคับ `true` |
| `SHOP_SELF` | กรอก | `SHOP` | `MANUAL` | เลขที่ trim แล้ว | บังคับ `true` |
| `BUYER_SELF` | เว้นว่าง | `BUYER` | `NONE` | `null` | ร้านเลือก (ตั้งต้น `false`) |
| `BUYER_SELF` | กรอก | `BUYER` | `MANUAL` | เลขที่ trim แล้ว | ร้านเลือก (ตั้งต้น `false`) |

`validateReturnShipping()` ยังอยู่เป็นด่านที่สอง — พิสูจน์ว่า resolver กับกฎยังไม่เลื่อนออกจากกัน
วันที่มีคนเพิ่มวิธีที่ 4 (ผู้ใช้จะได้เหตุผลที่แก้ได้จริง ไม่ใช่ 500 จาก CHECK ที่ระดับฐาน)

#### คอลัมน์ที่เพิ่ม (migration `20260825120000_order_return_courier` · additive ล้วน)

| คอลัมน์ | ชนิด | ความหมาย |
|---|---|---|
| `OrderReturn.returnCourierCode` | `String?` | ขนส่ง**ขากลับ** — ส่งเข้า `createReturnShipment(override.courierCode)` ตอนกดออกเลข · `null` = ใช้เจ้าเดียวกับขาไป |
| `OrderReturn.returnCourierName` | `String?` | ชื่อที่ร้านเห็นตอนเลือก (ชื่อแพ็กเกจของ iShip จำเพาะกว่าชื่อแบรนด์) |
| `OrderReturn.returnParcel` | `Json?` | override กล่องขากลับ — **ทั้งชุดหรือไม่มีเลย** (`parseReturnParcel()` fail-closed) |
| ~~`OrderReturn.manualCourier`~~ | `String?` | 🛑 **เลิกใช้ 2026-08-25** — เขียนไม่ได้อีก อ่านได้อย่างเดียว · ไม่ลบเพราะ DROP ทำให้ deployment เก่าที่ยังเสิร์ฟระหว่าง build พัง · ยืนยันแล้วว่ามี **0 แถวทั้ง prod และ dev** |

#### `POST /api/orders/[token]/return-quote` (ใหม่)

ค่าส่ง**ขากลับ**โดยประมาณต่อขนส่งแต่ละเจ้า · body `{ parcel? }` · คืน `{ rows, failed, box }`

| กฎ | เหตุผล |
|---|---|
| อ่านที่อยู่ผู้ซื้อ **ฝั่ง server** และคืน **เฉพาะราคา** | ถ้าให้จอยิง `/api/seller/iship/price/compare` ตรง ๆ จอต้องถือที่อยู่ไว้ก่อน = ที่อยู่/ชื่อ/เบอร์ ไหลเข้า flight payload ทุกใบ เพื่อตัวเลข "฿เท่าไร" ตัวเดียว |
| ใช้ `compareShippingPrices()` **ตัวเดิม** | HR16 — ห้ามเขียนสูตรใหม่ ต่างกันแค่ที่มาของ input |
| path เป็น `return-quote` ไม่ใช่ `returns/quote` | `returns/[returnId]` เป็น dynamic segment ที่ static child จะบังทับ ⇒ ใบคืนที่ id ตรงกับคำนั้นเรียกไม่ได้ตลอดกาล |
| ไม่รู้ขนาดกล่อง → `400 NO_PARCEL` | ประเมินไม่ได้ต้องบอกตรง ๆ **ห้ามคืน ฿0** ซึ่งอ่านเหมือน "ส่งฟรี" (`partial-data-must-be-labeled-or-filled.md`) |

⚠️ **ทิศทางที่ประเมิน:** `compareShippingPrices` ตรึงผู้ส่ง = ที่อยู่ร้านเสมอ ⇒ ราคาที่ได้คือ
"ร้าน → ลูกค้า" ส่วนของจริงขากลับคือ "ลูกค้า → ร้าน" · ขนส่งไทยในประเทศคิดจาก
(น้ำหนัก/ขนาด × คู่โซน) ซึ่งสมมาตร ตัวเลขจึงตรงกันในทางปฏิบัติ และจอเรียกมันว่า
**"โดยประมาณ"** ไม่ใช่ยอดที่จะถูกตัดจริง (ยอดจริงมาตอนขนส่งชั่งน้ำหนัก)

#### รายชื่อขนส่ง

`COURIER_OPTIONS` (`src/lib/iship/courier.ts`) = 8 แบรนด์ + `OTHER` ท้ายลิสต์ —
**SSOT เดียว ห้ามพิมพ์รายชื่อขนส่งซ้ำในคอมโพเนนต์** (HR16) · แพ็กเกจของ iShip เอง
(`ISHIP`) ไม่อยู่ในลิสต์เพราะเป็น *วิธีคืน* ข้อแรก ไม่ใช่ "ขนส่งเจ้าอื่นที่ร้านไปเปิดพัสดุเอง"

🛑 `courierBrandCode()` เทียบ **รหัสตรงตัวก่อน** regex — `'THAIPOST'` ที่เราเก็บเอง
ไม่ match `/thailand\s*post/` ⇒ ถ้าไม่เทียบรหัสก่อน โลโก้จะหายเงียบ ๆ **เฉพาะเจ้าที่ร้านเลือกเอง**
(เทส `[blocker]` `courier-options.test.ts` ปักหมุดทั้งสองทิศ + เช็คว่าไฟล์โลโก้มีอยู่จริง)

ที่มา: `docs/20 - Features/00056 - Order Return/BRD.md` §8

### §10.16 แผนการตรวจสอบร้านค้า (feature 00060 — Draft, ยังไม่ implement)

SSOT: **`src/lib/inspection/checks.ts`** (checkKey allow-list 18 ค่า + `ttlDays()`) — ยังไม่มีไฟล์นี้
อยู่บนดิสก์จริง ณ วันที่ sync เอกสารนี้

| กฎ | รายละเอียด |
|---|---|
| `step` | picklist จำนวนเต็ม 1-4 เท่านั้น — CHECK ระดับ DB ด้วย (`InspectionPlan`/`InspectionRound`/`InspectionTermsAcceptance` ทั้ง 3 ตาราง) |
| `checkKey` | ต้องอยู่ใน allow-list 18 ค่า — ไม่อยู่ = `400 UNKNOWN_CHECK_KEY` (ห้ามเงียบ/ignore) |
| scope ↔ `roomId` | `scope='SHOP'` แล้วส่ง `roomId` มา = `400 CHECK_SCOPE_MISMATCH` · `scope='ROOM'` แล้วไม่ส่ง `roomId` = `400 CHECK_SCOPE_MISMATCH` — **ตรวจสองทิศ ไม่ใช่ทิศเดียว** |
| `roomId` เป็นของร้านนั้นจริง | ต้อง scope ใน `WHERE` (`prisma.room.findFirst({ where: { id, shopId } })`) ไม่ใช่ดึงมาแล้วเทียบทีหลัง — ไม่ตรง = `403 ROOM_NOT_IN_SHOP` |
| `termsAccepted` | `v.literal(true)` — ปฏิเสธถ้าไม่ใช่ `true` เป๊ะ (`400 TERMS_NOT_ACCEPTED`) |
| `vertical === 'LODGING'` | ทุก mutation ของ `/api/seller/inspection/**` ต้องเช็คซ้ำที่ server (ไม่ใช่แค่ซ่อนเมนู) — ไม่ผ่าน = `403 NOT_LODGING` |
| `method` (สร้างรอบ ad-hoc) | ห้ามรับ `AUTO` จาก client — รอบอัตโนมัติสร้างโดย cron เท่านั้น (`400 VALIDATION_ERROR`) |
| ไฟล์แนบ | รับได้เฉพาะ `fileId` ที่ commit แล้ว — เจอ `Content-Type: multipart/form-data` = `415 UNSUPPORTED_MEDIA_TYPE` ทันที ไม่อ่าน body |
| `termsVersion` / `priceSnapshotBaht` | มาจาก server เท่านั้น **ห้ามรับจาก client** — ทั้งสองค่าคือสิ่งที่หลักฐาน `InspectionTermsAcceptance` ยืนยัน |

**Valibot schema ที่ต้องเพิ่มใน `src/lib/validations.ts`:** `SubscribeInspectionSchema` ·
`UpgradeInspectionSchema` · `CancelInspectionSchema` · `SubmitInspectionDocumentSchema` ·
`RecordInspectionResultsSchema` · `CompleteInspectionRoundSchema` · `UpdateInspectionQuotaSchema` ·
`AssignInspectionRoundSchema` · `ReportInspectionFraudSchema` (9 schema — ชื่อเป็นสัญญา ห้ามตั้งอื่น)

ที่มา: `docs/20 - Features/00060 - Shop Inspection Plan/{SRS,API}.md`

### 10.11 หมายเหตุ

- **Valibot (backend):** ใช้กับ API routes ทุกตัวที่มี mutation — `v.safeParse()` ก่อน service call
- **Yup (frontend):** ใช้กับ React Hook Form — validate ก่อน submit
- **ไม่มี email+password schema** — ตัดถาวร (FR-1.6)

---

_อัปเดต 2026-08-29: sync ล่วงหน้าตามเอกสาร feature 00060 (แผนการตรวจสอบร้านค้า — Shop Inspection
Plan) ซึ่ง PRD/BRD/DATABASE/API ผ่าน draft รอบสุดท้ายแล้วแต่ **ยังไม่ implement โค้ดจริง** (Hard Rule 11
บังคับ sync เอกสารระบบแม้ก่อนขึ้นโค้ด กันเอกสารค้าง — บทเรียน 00033) เพิ่ม §6.z (โมเดล 6 ตาราง +
คอลัมน์ `User.isInspector`) · §6.1 ER lines · §7.19-7.20 (15 endpoint + คอลัมน์ cron ใหม่ — สร้างหัวข้อ
cron รวมครั้งแรก) · §8.8 (enum 5 ตัว + checkKey 18 คีย์) · §9.8 (บทบาทใหม่ "ผู้ตรวจ") · §10.16
(validation) · §3/§4 (route + NFR ที่เกี่ยวข้อง). **พบความไม่ตรงกันระหว่างเอกสารของ 00060 เอง**
(SRS-00060 ฉบับร่างต้นเทียบกับ DATABASE.md/API.md ฉบับล็อกล่าสุด) — ยึด DATABASE.md/API.md เป็นหลัก
ตามที่ผู้สั่งงานกำหนด และบันทึกจุดขัดแย้งไว้ในเนื้อหาแต่ละหัวข้อ (`operating_evidence.method`,
scope label `PROPERTY` vs `ROOM`, endpoint `PATCH /api/admin/users/[id]/inspector` ที่ไม่อยู่ใน
สัญญาสุดท้าย) — เมื่อ implement จริงต้องยืนยันกับ `prisma/schema.prisma` อีกครั้งแล้วตัดป้าย Draft ออก.

_เอกสาร SRS นี้ sync กับโค้ดจริง ณ 2026-08-08 (feature 00038 — ตอบกลับคอมเมนต์ (Comment Auto-Reply
& Private Reply); เพิ่ม model `CommentReplyLog` + entry เวอร์ชันย่อของ `ShopChannel`/`PageComment`
ครั้งแรก (เฉพาะคอลัมน์ที่ feature 00038 เพิ่ม — ตารางเต็มยังเป็นหนี้จาก feature 00018/00029 ตามเดิม)
+ 3 endpoint ใหม่ (GET/PATCH config นับเป็น 1 endpoint คู่, logs, private-reply) + enum/validation
ที่เกี่ยวข้อง). ก่อนหน้านี้ 2026-08-07 (feature 00035 — Shop Page
Builder ตัวจัดหน้าร้าน; เพิ่ม entry ของ `FacebookPost` แบบย่อครั้งแรก). เมื่อ schema/API/validation
เปลี่ยน ให้อัปเดต section ที่เกี่ยวข้องทันที._
_ลิงก์กลับ: `docs/PRD.md` (product-level)_

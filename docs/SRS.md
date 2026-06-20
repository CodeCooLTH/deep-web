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
| FR-1.3 | 1 user ผูก auth provider ได้ (AuthAccount) — link เฉพาะตอน signup เท่านั้น | Must |
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
| FR-3.6 | MVP: Trust Score มีแต่ขึ้น ยังไม่หักคะแนน | Must |

### FR-4: Badge

แบ่ง **3 ประเภท** ชัดเจน:

1. **Verification badge** — auto เมื่อผ่าน verification แต่ละระดับ
2. **Achievement badge** — auto-evaluate **ผ่าน data-driven engine** (criteria JSON authoritative). มีทั้งฝั่ง **Seller และ Buyer**
3. **Paid badge (Verified Badge)** — ซื้อ subscription (Phase 2, ~฿299/เดือน), ติดหลังชื่อร้าน/profile แบบ Meta/Twitter. **แยกขาด — ไม่นับเข้า trust score, ไม่ใช่ผลของ KYC**

**Achievements system (MVP):**
- ทุก achievement มี `audience` = SELLER / BUYER / ANY
- **ติดตัวถาวร (sticky)** — ครบเงื่อนไขเมื่อไหร่ได้รับทันทีและ **ไม่ถูก revoke** แม้เงื่อนไขเปลี่ยนภายหลัง (เช่น avg rating ตกทีหลัง badge ยังอยู่) — สอดคล้องหลัก "Trust มีแต่ขึ้น"
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

**Achievement Badges (10):**

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
| FR-6.6 | NO_SHIPPING (digital/service/subscription) → PENDING แล้วยืนยันได้เลย | Must |
| FR-6.7 | Snapshot ชื่อ/ราคาลง OrderItem (ไม่ผูกตรง product) | Must |
| FR-6.8 | **SMS Order Link (paid):** ลิงก์ที่ส่งผ่าน SMS จาก seller ที่ verify แล้ว ฝัง **phone-bound token → buyer ข้าม phone-unlock อัตโนมัติ**; ลิงก์ที่ seller แชร์เอง (manual) ยังต้อง phone-unlock | Must |
| FR-6.9 | หักเครดิตจาก wallet ฿1/SMS ตอนกดส่ง (ดู PRD §6 Business Model) | Must |
| FR-6.10 | SUBSCRIPTION: แต่ละ cycle = order ย่อย เดิน PENDING→CONFIRMED ของตัวเอง (recurring dashboard + billing — P4) | Must |
| FR-6.11 | **วิธีชำระเงิน (paymentMethod) ต้อง persist ใน Order** — seller เลือก/บันทึกตอนสร้าง order; แสดงทั้ง order detail (seller) และหน้า buyer link. วิธีที่ต้องแนบสลิป (เช่น โอนเงิน/พร้อมเพย์) vs ไม่ต้อง (เช่น COD/เงินสด) ควบคุมโดย `requiresSlip` flag ตาม `paymentMethod` | Must |
| FR-6.12 | **Payment slip upload โดย buyer** — buyer ที่ผ่าน phone-unlock แนบสลิปการชำระเงินได้ที่ `/o/{token}` (optional; แสดงปุ่มเฉพาะ PENDING + `paymentMethod` ที่ `requiresSlip=true`); seller ตรวจสลิปได้ใน order detail ฝั่ง seller. 1 order = 1 slip (ถ้าแนบซ้ำ = replace) | Must |
| FR-6.13 | **Buyer cancel เฉพาะ PENDING** — buyer ที่ผ่าน phone-unlock สามารถยกเลิก order ได้เฉพาะสถานะ `PENDING`; เมื่อ status = `SHIPPED` ปุ่มยกเลิกหาย เหลือแต่ปุ่มยืนยันรับของ; `CONFIRMED`/`CANCELLED` = terminal. guard ทั้ง UI + API. `cancelInitiator='buyer'` ไม่กระทบ Zero Complaint | Must |

### FR-7: Review

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-7.1 | Buyer review + rating (1-5) ได้ตั้งแต่ order = CONFIRMED (รวมหลัง SHIPPED ก่อน CONFIRMED ถ้ามี — ตามจริงโค้ดอนุญาต CONFIRMED ขึ้นไป) | Must |
| FR-7.2 | 1 order = 1 review (unique constraint บน orderId; error message ผู้ใช้เป็นไทย) | Must |
| FR-7.3 | Buyer ไม่สมัคร → เก็บ `reviewerContact`. **anonymous review นับเข้า rating แต่ไม่นับ unique-reviewer ของ Community Favorite** | Must |
| FR-7.4 | แสดง reviews บน public profile | Must |

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
| Public Profile | `/u/{username}` |
| Public Order (UUID) | `/o/{token}` |
| Public Order (SMS short-code) | `/o/{12-char-code}` → redirect ผ่าน `/api/o/sms/{code}` → `/o/{uuid}` |
| SMS Link Invalid / Error | `/o/link-invalid` |
| Privacy Policy | `/privacy` — public, ไม่ต้อง login, static Server Component — Meta App Review (Privacy Policy URL) |
| Data Deletion Instructions | `/data-deletion` — public, ไม่ต้อง login, static Server Component — Meta App Review (User Data Deletion URL); request via email, ดำเนินการภายใน 30 วัน |
| Terms of Service | `/terms` — public, ไม่ต้อง login, static Server Component — Meta App Review (Terms of Service URL); ข้อกำหนดการใช้บริการ 10 หัวข้อ |

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
| Products | `/products` |
| Categories | `/categories` |
| Customers | `/customers` |
| Orders | `/orders` |
| Create Order | `/orders/new` |
| Reviews | `/reviews` |
| Badges & Progress | `/badges` |
| **เครดิต SMS (wallet)** | **`/wallet`** |
| Shop Settings | `/shop` |
| Verification | `/verification` |
| Auth (sign-in/sign-up/verify-otp/reset-pass/new-pass) | `/auth/*` |

> path ฝั่ง seller **ไม่มี** `/settings/` prefix (sync ตามโค้ดจริง)
> **force-redirect:** seller authed + `needsOnboarding` → proxy redirect ทุก route → `/onboarding` (ยกเว้น `/auth/*`, `/api/*`)

### 3.5 Admin (`admin.deepthailand.app/...`) — login แยก + isAdmin

| เมนู | Path |
|------|------|
| Dashboard | `/dashboard` |
| Users | `/users` |
| Verifications | `/verifications` |
| Orders | `/orders` |
| **เติมเครดิต SMS (topup queue)** | **`/topups`** |
| Badges | `/badges` |

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
| NFR-1.3 | File upload ≤ 5MB, ภาพสินค้า ≤ 10 รูป |

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

Order (1) ──────── (N) OrderItem
Order (1) ──────── (0..1) ShipmentTracking
Order (1) ──────── (0..1) Review
Order (1) ──────── (N) SmsCode

SellerWallet (1) ── (N) WalletTransaction
```

### 6.2 Models

#### User (`prisma/schema.prisma:11`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `id` | String UUID PK | `@default(uuid())` |
| `displayName` | String | ชื่อแสดงผล |
| `username` | String `@unique` | ใช้ใน public profile `/u/{username}` |
| `avatar` | String? | fileId หรือ URL รูปโปรไฟล์ |
| `phone` | String? `@unique` | เบอร์ไทย `0[0-9]{9}` — PII |
| `email` | String? `@unique` | อีเมล FB OAuth — PII |
| `trustScore` | Int default 0 | คะแนน 0-100 |
| `isShop` | Boolean default false | true เมื่อสร้างร้านสำเร็จ |
| `isAdmin` | Boolean default false | ตั้งผ่าน DB seed เท่านั้น |
| `passwordHash` | String? | bcryptjs hash — ใช้กับ seller-credentials login + admin login; buyer ไม่มี (no email+password) |
| `createdAt` | DateTime | วันสมัคร — ใช้คำนวณ Age component trust score |

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
| `userId` | String FK → User | |
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
| `price` | Decimal(12,2) | ≥0.01 |
| `images` | Json default `[]` | array of fileId — max 10 |
| `type` | String default `"PHYSICAL"` | `PHYSICAL` / `DIGITAL` / `SERVICE` / `SUBSCRIPTION` |
| `fulfillmentMode` | String default `"SHIPPED"` | `SHIPPED` / `NO_SHIPPING` — **ship guard จริง** (FR-6.5) |
| `billingMode` | String default `"ONE_TIME"` | `ONE_TIME` / `RECURRING` |
| `billingPeriod` | String? | `MONTHLY` / `YEARLY` / `CUSTOM` |
| `billingPeriodDays` | Int? | กรณี `CUSTOM` billing (1-365) |
| `isActive` | Boolean default true | กรอง product grid public profile |
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
| `buyerUserId` | String? FK → User | null = buyer ยังไม่สมัคร |
| `buyerContact` | String? | phone/email ของ buyer — PII; RC-6 lock ตอน SMS send |
| `type` | String default `"PHYSICAL"` | inherit จาก product type |
| `totalAmount` | Decimal(12,2) | ยอดรวมสุทธิ |
| `status` | String default `"PENDING"` | state machine: `PENDING` / `SHIPPED` / `CONFIRMED` / `CANCELLED` |
| `fulfillmentMode` | String default `"SHIPPED"` | `SHIPPED` / `NO_SHIPPING` — **ship guard ตรวจ field นี้** |
| `cancelInitiator` | String? | `"seller"` / `"buyer"` — เก็บเมื่อ CANCELLED (ดู §2 Zero Complaint) |
| `shippingAddress` | Json? | shape: `{line1, subdistrict, district, province, postcode, note}` — required เมื่อ fulfillmentMode=SHIPPED |
| `paymentMethod` | String? | Phase B — วิธีชำระเงิน (FR-6.11) |
| `salesChannel` | String? | Phase B — ช่องทางขาย |
| `internalNote` | String? `@db.Text` | Phase B — note ภายใน seller |
| `buyerName` | String? | Phase B — ชื่อผู้ซื้อ |
| `discount` | Decimal(12,2)? | Phase B — ≥0 |
| `vatRate` | Decimal(5,4)? | Phase B — decimal fraction (0.07 = 7%, maxValue 1) |
| `vatAmount` | Decimal(12,2)? | Phase B — ≥0 |
| `slipFileId` | String? | Phase 2 OOS-1 — fileId ของสลิปโอนเงิน; null = ยังไม่แนบ |
| `accessUrl` | String? | Phase 2 OOS-2 — URL ส่งมอบ digital order |

**Index:** `[slipFileId]` — รองรับ `/api/files` order-slip gate

#### OrderItem (`prisma/schema.prisma:183`)

| Field | Type | หมายเหตุ |
|-------|------|---------|
| `orderId` | String FK → Order | cascade delete |
| `productId` | String? FK → Product | nullable — `SetNull` เมื่อ product ถูกลบ (FR-6.7 snapshot) |
| `name` | String | snapshot ชื่อ ณ เวลาสั่ง |
| `description` | String? | snapshot คำอธิบาย |
| `qty` | Int | ≥1 |
| `price` | Decimal(12,2) | snapshot ราคา ≥0.01 |

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

---

## §7 API Reference

> ทุก endpoint อยู่ใต้ `/api/` — ดู `src/app/api/**/route.ts`
> **CSRF guard:** POST/PUT/PATCH/DELETE ทุกตัว (ยกเว้น `/api/auth/*`) ต้องผ่าน Origin-check ใน `guardApi` (`src/proxy.ts:11`) — Origin ต้องอยู่ใน allowlist `*.deepthailand.app` / `*.deepth.local`
> **Rate-limit:** unauth 100 req/min, auth 30 req/min per-IP (in-memory globalThis; Vercel per-instance = known gap, Redis = Phase 2) — แยกจาก OTP rate-limit (3/10min/เบอร์)

### 7.1 Auth / OTP

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| POST | `/api/auth/[...nextauth]` | — | NextAuth.js handler (FB OAuth + `seller-credentials` + `phone-otp` credentials) | `lib/auth.ts` |
| POST | `/api/login` | — | Phone-OTP login (custom endpoint) | `lib/auth.ts` |
| POST | `/api/otp/send` | Guest | ส่ง OTP SMS — rate-limit 3/10min/เบอร์; คืน `isNewUser` | `lib/otp.ts` |
| POST | `/api/otp/verify` | Guest | ตรวจ OTP 6-digit | `lib/otp.ts` |

### 7.2 Users

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/users/me` | Buyer/Seller | ดึง profile ตัวเอง (session-scoped) | `user.service` |
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
| PATCH | `/api/shops/[id]` | Seller-owner | แก้ข้อมูลร้าน | `shop.service` |
| GET | `/api/shops/check-slug` | Guest | ตรวจ slug ว่าง/ซ้ำ/reserved → `{available:bool}` | `shop.service` (isSlugAvailable) |
| POST | `/api/shops/slug` | Seller (authed) | ตั้ง `Shop.slug` (ครั้งแรกเท่านั้น; ถ้ามีแล้ว → 409) | `shop.service` (setShopSlug) |

### 7.4 Products

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/products` | Seller | ดู product list ของร้านตัวเอง | `product.service` |
| POST | `/api/products` | Seller | สร้าง product | `product.service` |
| GET | `/api/products/[id]` | Seller | ดู product detail | `product.service` |
| PATCH | `/api/products/[id]` | Seller-owner | แก้ product | `product.service` |
| DELETE | `/api/products/[id]` | Seller-owner | ลบ product | `product.service` |
| GET | `/api/tags` | Seller | autocomplete tag | — |

### 7.5 Orders

| Method | Path | Auth | Purpose | Service |
|--------|------|------|---------|---------|
| GET | `/api/orders` | Buyer/Seller | ดู order list — `?role=buyer` สำหรับ buyer, default = seller | `order.service` |
| POST | `/api/orders` | Seller | สร้าง order → คืน `publicToken` | `order.service` |
| GET | `/api/orders/customers` | Seller | autocomplete ลูกค้าเดิม `?q=<term>` (≥2 chars) | — |
| POST | `/api/orders/[token]/unlock` | Guest | phone-unlock — ตรวจเบอร์ตรงกับ order | `order.service` |
| POST | `/api/orders/[token]/confirm` | Guest/Buyer | ยืนยัน order (Path A: SMS cookie; Path B: phone parity) | `order.service` |
| POST | `/api/orders/[token]/cancel` | Seller-owner / Buyer (phone parity) | ยกเลิก — derive `cancelInitiator` จาก session | `order.service` |
| POST | `/api/orders/[token]/ship` | Seller-owner | ใส่ tracking (เฉพาะ `fulfillmentMode=SHIPPED`) | `order.service` |
| POST | `/api/orders/[token]/review` | Buyer (phone parity) | เขียน review 1-5 ดาว | `review.service` |
| POST | `/api/orders/[token]/slip` | Buyer (cookie/phone parity) | แนบสลิปโอนเงิน (≤5MB; PENDING only) | `order.service` |
| POST | `/api/orders/[token]/send-sms` | Seller-owner | ส่ง SMS Order Link — atomic deduct+issue (฿1/SMS) | `wallet.service`, `sms-code.service`, `lib/sms.ts` |
| POST | `/api/orders/[token]/access-url` | Seller-owner | ตั้ง `accessUrl` สำหรับ digital delivery | `order.service` |
| GET | `/api/orders/[token]/buyer-phone` | Buyer (SMS cookie) | คืน phone+masked phone สำหรับ OTP pre-fill | — |

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
| POST | `/api/upload` | Buyer/Seller/Admin | อัปโหลดไฟล์ → คืน `fileId` (≤5MB, MIME check) | `lib/storage.ts` |
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

---

## §8 Enums & Constants

> enum ทั้งหมดเป็น String ใน Prisma (ไม่ใช่ PostgreSQL enum type) — convention ของ project

### 8.1 Order Status

| ค่า | ความหมาย | Terminal? |
|-----|---------|---------|
| `PENDING` | สร้าง order แล้ว รอ buyer | ไม่ |
| `SHIPPED` | seller ใส่ tracking แล้ว (SHIPPED เท่านั้น) | ไม่ |
| `CONFIRMED` | buyer ยืนยัน — นับ trust/badge | ✅ |
| `CANCELLED` | ยกเลิกก่อน CONFIRMED | ✅ |

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

### 9.2 Product / Shop

| Operation | Guest | Buyer | Seller-owner | Admin |
|-----------|-------|-------|-------------|-------|
| ดู public profile `/u/{username}` | ✅ | ✅ | ✅ | ✅ |
| สร้างร้าน | — | ✅ | — | — |
| แก้ข้อมูลร้าน | — | — | ✅ | — |
| CRUD product | — | — | ✅ | — |
| ตั้ง slug (`POST /api/shops/slug`) | — | — | ✅ (ครั้งแรก; หลังตั้งแล้ว = 409) | — |
| ตรวจ slug (`GET /api/shops/check-slug`) | ✅ | ✅ | ✅ | ✅ |
| เข้า `/onboarding` | — | — | ✅ (seller authed เท่านั้น) | — |

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

---

## §10 Validation Rules

> ดู `src/lib/validations.ts` เป็น SSOT — section นี้ summary สำหรับ dev

### 10.1 Auth / OTP

| Field | กฎ |
|-------|-----|
| `contact` (OTP) | string 1-20 chars |
| `type` (OTP) | picklist: `phone` / `email` / `PHONE` / `EMAIL` |
| `otp` | string length = 6 |
| `phone` (unlock) | regex `^0[0-9]{9}$` (เบอร์ไทย 10 หลักขึ้นต้น 0) |

### 10.2 Shop

| Field | กฎ |
|-------|-----|
| `shopName` | string 1-100 chars |
| `description` | string ≤500 chars (optional) |
| `category` | string ≤50 chars (optional) |
| `address` | string ≤200 chars (optional) |
| `businessType` | picklist: `INDIVIDUAL` / `COMPANY` |
| `logo` | string ≤200 chars — fileId (optional) |

### 10.3 Product

| Field | กฎ |
|-------|-----|
| `name` | string 1-200 chars |
| `description` | string ≤5000 chars (optional) |
| `shortDescription` | string ≤200 chars (optional) |
| `price` | number ≥0.01 |
| `type` | picklist: `PHYSICAL` / `DIGITAL` / `SERVICE` / `SUBSCRIPTION` |
| `images` | string[] ≤10 items (each 1-200 chars) |
| `tags` | string[] ≤10 items (each 1-50 chars) |
| `attributes` | record — key 1-50, value 0-200 chars |
| `fulfillmentMode` | picklist: `SHIPPED` / `NO_SHIPPING` (optional) |
| `billingMode` | picklist: `ONE_TIME` / `RECURRING` (optional) |
| `billingPeriod` | picklist: `MONTHLY` / `YEARLY` / `CUSTOM` — nullable (optional) |
| `billingPeriodDays` | int 1-365 — nullable (optional) |

### 10.4 Order

| Field | กฎ |
|-------|-----|
| `items` | array ≥1 item |
| `items[].productId` | UUID (optional) |
| `items[].name` | string ≥1 char |
| `items[].qty` | int ≥1 |
| `items[].price` | number ≥0.01 |
| `type` | picklist: `PHYSICAL` / `DIGITAL` / `SERVICE` / `SUBSCRIPTION` |
| `buyerContact` | string (optional) |
| `buyerName` | string (optional) |
| `paymentMethod` | string (optional) |
| `salesChannel` | string (optional) |
| `internalNote` | string (optional) |
| `discount` | number ≥0 (optional) |
| `vatRate` | number ≥0 ≤1 — decimal fraction (0.07 = 7%) (optional) |
| `vatAmount` | number ≥0 (optional) |
| `shippingAddress` | object `{line1?, subdistrict?, district?, province?, postcode?, note?}` (optional) — **required ที่ service layer เมื่อ fulfillmentMode=SHIPPED** (line1+province+postcode ต้องมี) → 400 `ShippingAddressRequiredError` |

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
| phone (set-phone) | regex `^0[0-9]{9}$` + OTP ยืนยันก่อน set | `SetPhoneSchema` |

### 10.11 หมายเหตุ

- **Valibot (backend):** ใช้กับ API routes ทุกตัวที่มี mutation — `v.safeParse()` ก่อน service call
- **Yup (frontend):** ใช้กับ React Hook Form — validate ก่อน submit
- **ไม่มี email+password schema** — ตัดถาวร (FR-1.6)

---

_เอกสาร SRS นี้ sync กับโค้ดจริง ณ 2026-06-17. เมื่อ schema/API/validation เปลี่ยน ให้อัปเดต section ที่เกี่ยวข้องทันที._
_ลิงก์กลับ: `docs/PRD.md` (product-level)_

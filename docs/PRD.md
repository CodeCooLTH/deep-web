# Deep — Product Requirements Document (PRD)

**เวอร์ชัน:** 3.0
**วันที่:** 16 พฤษภาคม 2569
**ผู้จัดทำ:** Deep Team

> **แบรนด์:** ชื่อทางการค้าคือ **"Deep"** (UI copy, domain `deepthailand.app`). **"SafePay"** เป็น internal codename — repo, identifiers, ตาราง DB ยังใช้ SafePay. PRD ฉบับนี้ใช้ "Deep" เป็นหลัก.
> ปรับปรุงจาก interview ทบทวนทีละ section (2026-05-16). decision log: `docs/superpowers/specs/2026-05-16-prd-rewrite-decisions.md`. gap analysis เทียบโค้ดจริงเป็นฐาน.

---

## 1. ภาพรวมผลิตภัณฑ์ (Product Overview)

Deep เป็นระบบจัดเก็บ History และคำนวณ Trust Score เพื่อสร้างความน่าเชื่อถือในการซื้อขายออนไลน์ ผ่าน Verify ตัวตน, Badge, Public Profile — แก้ปัญหามิจฉาชีพในโลกการค้าออนไลน์

### 1.1 Vision Statement

> "ทำให้ทุกคนที่ซื้อขายออนไลน์มีตัวตนที่ตรวจสอบได้ ลดปัญหามิจฉาชีพด้วย Trust Score ที่โปร่งใส"

### 1.2 Core Concept

- ไม่แบ่ง role — ทุก account มี trust profile เดียวกัน, เปิดร้านเพิ่มได้ (`isShop` flag, auto-set เมื่อสร้างร้านสำเร็จ)
- **Free core ตลอดไป** — ทุกคนใช้ฟรี: สร้าง Order/Product, Order Link อย่างง่าย, Report 1 ตัว, **ทุกขั้นตอน manual** (สร้าง + ส่งลิงก์เอง). ระบบทำหน้าที่บันทึก history + คำนวณ Trust + Public Profile
- **คิดเงินเฉพาะฟังก์ชันช่วยเหลือ** แบบ à la carte (ดู §10 Business Model)
- **หลักออกแบบสำคัญ:** flow ฝั่ง Free โดยเฉพาะ Order Link ต้อง **"ง่ายมาก ๆ"** — เป็น design constraint ระดับ product ไม่ใช่แค่ usability NFR

### 1.3 Target Users / Personas

| Persona | คำอธิบาย | Pain Point |
|---------|---------|-----------|
| **Seller (persona หลัก)** | คนขายของ/ให้บริการ/ธุรกิจหน้าร้าน ที่เปิดร้านใน Deep | ต้องการสร้างความน่าเชื่อถือให้ลูกค้ามั่นใจ ลดการเจรจาเรื่องความไว้ใจ |
| **User/Buyer (รวมเป็นกลุ่มเดียว)** | คนทั่วไปที่มี profile — ซื้อของ, สะสม trust, อาจเปิดร้านภายหลัง. รวมถึง guest ผู้ซื้อที่ยังไม่สมัคร | กลัวโดนโกง ไม่รู้ว่าร้านเชื่อถือได้ไหม |
| **Admin/Ops (internal)** | ทีมดูแลระบบ Deep — ไม่ใช่ end-user | ต้อง review เอกสาร verify, จัดการ badge, monitor ระบบ |

---

## 2. User Stories

### 2.1 User/Buyer (มี profile + guest)

| ID | User Story | Priority | Acceptance Criteria |
|----|-----------|----------|-------------------|
| U-1 | สมัครด้วย Facebook หรือ เบอร์โทร OTP | Must | สมัคร/เข้าได้ผ่าน FB หรือ Phone OTP **เท่านั้น** (ไม่มี email/password) |
| U-2 | ยืนยันตัวตน (Phone OTP, เอกสารบุคคล, เอกสารธุรกิจ) | Must | verify ได้ 3 ระดับ, L2/L3 admin review |
| U-3 | เห็น Trust Score ของตัวเอง + เข้าใจที่มา | Must | แสดง score + ระดับ + breakdown 5 ปัจจัย + คำอธิบายเงื่อนไข rating |
| U-4 | เห็น badges ที่ได้รับ | Must | แสดง verification + achievement + paid badge |
| U-5 | มี public profile ให้คนอื่นดู | Must | `/u/{username}` แสดง score, badges, order สำเร็จ, reviews |
| B-1 | เปิดลิงก์ order เพื่อดูข้อมูล | Must | เห็นสินค้า, ราคา, trust score ร้านค้า |
| B-2 | ยืนยันรับของ/ยืนยัน order โดยไม่ต้องสมัคร | Must | กรอกเบอร์ให้ตรง (phone-unlock) → กดยืนยัน — **ไม่มี OTP confirm** |
| B-3 | review/rate ร้านค้าหลังยืนยัน | Must | ให้คะแนน 1-5 + comment |
| B-4 | สมัครทีหลังแล้ว history ตามมา | Must | ผูก phone (phone-OTP signup) / email (FB signup) → auto-link orders+reviews เดิม |
| B-5 | ใช้บนมือถือสะดวก | Must | Responsive mobile-first |

> **ตัดถาวร:** Email+Password login, multi-provider linking (ผูกหลาย provider ใน account หลัง signup) — ไม่อยู่ใน scope ทั้ง MVP และ Phase 2

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
| A-1 | เห็น dashboard สถิติครบ | Must | 8 metrics (ดู §9) |
| A-2 | review เอกสาร verification | Must | ดูเอกสาร, approve/reject + เหตุผล — **ห้าม approve ของตัวเอง** |
| A-3 | ดูรายการผู้ใช้ | Must | users + trust score + verification status |
| A-4 | ดูรายการ orders ทั้งหมด | Must | filter ตามสถานะ |
| A-5 | จัดการ badge + criteria | Must | เพิ่ม/แก้ badge และ **criteria มีผล runtime จริง** (data-driven) |

---

## 3. Functional Requirements

### FR-1: Authentication & Session

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-1.1 | รองรับ Facebook OAuth Login | Must |
| FR-1.2 | รองรับ Phone OTP Login (SMS) — OTP store ปัจจุบัน in-memory (Redis = Phase 2) | Must |
| FR-1.3 | 1 user ผูก auth provider ได้ (AuthAccount) — link เฉพาะตอน signup เท่านั้น | Must |
| FR-1.4 | Session แยกตาม subdomain (buyer / seller / admin) — host-scoped cookie ต่อ hostname | Must |
| FR-1.5 | Login แยกแต่ละ subdomain, logout ฝั่งหนึ่งไม่กระทบอีกฝั่ง | Must |
| FR-1.6 | **ตัดถาวร:** Email+Password, multi-provider linking หลัง signup | — |

### FR-2: Verification (3 ระดับ)

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-2.1 | **Level 1: ยืนยันเบอร์โทร Phone OTP** (auto-approve) — ไม่ใช้ email OTP | Must |
| FR-2.2 | Level 2: เอกสารบุคคล (บัตรประชาชน + selfie) — admin review | Must |
| FR-2.3 | Level 3: เอกสารจดทะเบียนธุรกิจ — admin review | Must |
| FR-2.4 | Verification type enum กำหนดชัด: `PHONE_OTP`, `ID_DOC`, `BUSINESS_REG` | Must |
| FR-2.5 | Verification ที่ผ่าน → ได้ Verification Badge อัตโนมัติ | Must |
| FR-2.6 | **Admin อนุมัติ/ปฏิเสธ verification ของตัวเองไม่ได้** (self-review block) — acceptance criterion บังคับ | Must |

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
| FR-4.3 | **Badge engine data-driven** — admin แก้ criteria JSON แล้วมีผล runtime จริง (ปัจจุบัน hardcode ตาม nameEN = tech-debt ต้อง rework, ดู §11) | Must |
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
| FR-5.4 | Type เป็น preset ของ capability, override ขั้น advanced ได้ (ดู spec `2026-05-10-product-types-capability-design.md`) | Must |
| FR-5.5 | เลือกสินค้าจาก catalog ตอนสร้าง order หรือพิมพ์เอง (one-off, productId optional) | Must |
| FR-5.6 | Backward-compat: product เดิม (PHYSICAL) ทำงานต่อได้ | Must |

### FR-6: Simple OMS

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-6.1 | Seller สร้าง order → public link `/o/{token}` | Must |
| FR-6.2 | Buyer เปิดลิงก์ → เห็นข้อมูล order + trust score ร้าน | Must |
| FR-6.3 | **Confirm = phone-unlock** — buyer กรอกเบอร์ให้ตรง → unlock → กดยืนยัน. **ไม่มี OTP confirm** | Must |
| FR-6.4 | Order status = state machine (ดู §4) | Must |
| FR-6.5 | **Ship guard = `fulfillmentMode === SHIPPED`** (ไม่ใช่ type===PHYSICAL — ดู §11). `shippingAddress` จำเป็นเมื่อ SHIPPED และ **ต้อง persist** ผ่าน CreateOrderSchema | Must |
| FR-6.6 | NO_SHIPPING (digital/service/subscription) → PENDING แล้วยืนยันได้เลย | Must |
| FR-6.7 | Snapshot ชื่อ/ราคาลง OrderItem (ไม่ผูกตรง product) | Must |
| FR-6.8 | **SMS Order Link (paid):** ลิงก์ที่ส่งผ่าน SMS จาก seller ที่ verify แล้ว ฝัง **phone-bound token → buyer ข้าม phone-unlock อัตโนมัติ**; ลิงก์ที่ seller แชร์เอง (manual) ยังต้อง phone-unlock | Must |
| FR-6.9 | หักเครดิตจาก wallet ฿1/SMS ตอนกดส่ง (ดู §10) | Must |
| FR-6.10 | SUBSCRIPTION: แต่ละ cycle = order ย่อย เดิน PENDING→CONFIRMED ของตัวเอง (recurring dashboard + billing — P4) | Must |
| FR-6.11 | **วิธีชำระเงิน (paymentMethod) ต้อง persist ใน Order** — seller เลือก/บันทึกตอนสร้าง order; แสดงทั้ง order detail (seller) และหน้า buyer link. วิธีที่ต้องแนบสลิป (เช่น โอนเงิน/พร้อมเพย์) vs ไม่ต้อง (เช่น COD/เงินสด) ควบคุมโดย `requiresSlip` flag ตาม `paymentMethod` *(เพิ่ม 2026-05-17 — เดิม OQ-8 ใน handoff spec ระงับไว้)* | Must |
| FR-6.12 | **Payment slip upload โดย buyer** — buyer ที่ผ่าน phone-unlock แนบสลิปการชำระเงินได้ที่ `/o/{token}` (optional; แสดงปุ่มเฉพาะ PENDING + `paymentMethod` ที่ `requiresSlip=true`); seller ตรวจสลิปได้ใน order detail ฝั่ง seller. 1 order = 1 slip (ถ้าแนบซ้ำ = replace) *(เพิ่ม 2026-05-17 — เดิมไม่อยู่ใน scope)* | Must |
| FR-6.13 | **Buyer cancel เฉพาะ PENDING** — buyer ที่ผ่าน phone-unlock สามารถยกเลิก order ได้เฉพาะสถานะ `PENDING`; เมื่อ status = `SHIPPED` ปุ่มยกเลิกหาย เหลือแต่ปุ่มยืนยันรับของ; `CONFIRMED`/`CANCELLED` = terminal. guard ทั้ง UI + API. `cancelInitiator='buyer'` ไม่กระทบ Zero Complaint *(เพิ่ม 2026-05-17)* | Must |

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
| FR-8.4 | **Known limitation:** FB user ที่ไม่มี email → ไม่ auto-link (ดู §11) | — |

### FR-9: Public Profile (Seller-centric)

| ID     | ข้อกำหนด                                                                                                                                                                                              | Priority |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR-9.1 | ทุกคนมี `/u/{username}`                                                                                                                                                                               | Must     |
| FR-9.2 | แสดง: trust score + breakdown, badges (3 หมวด), จำนวน order สำเร็จ, reviews ที่ได้รับในฐานะ seller                                                                                                    | Must     |
| FR-9.3 | ถ้าเป็นร้าน → แสดงข้อมูลร้าน                                                                                                                                                                          | Must     |
| FR-9.4 | เข้าดูได้โดยไม่ต้อง login                                                                                                                                                                             | Must     |
| FR-9.5 | บัญชี buyer-only (ไม่มีร้าน) → แสดง trust + verification badge + empty-state ชวนเปิดร้าน. **ไม่แสดง review-as-buyer; ไม่แสดง buyer-audience achievement** (buyer badge ดูได้เฉพาะหน้า self `/badges`) | Must     |

### FR-10: Admin Panel

| ID | ข้อกำหนด | Priority |
|----|---------|----------|
| FR-10.1 | Dashboard 8 metrics ครบ (ดู §9) | Must |
| FR-10.2 | User management: list, filter, trust score | Must |
| FR-10.3 | Verification review: ดูเอกสาร, approve/reject + self-review block (FR-2.6) | Must |
| FR-10.4 | Order monitoring: filter ตามสถานะ | Must |
| FR-10.5 | Badge management: เพิ่ม/แก้ + criteria มีผล runtime (FR-4.3) | Must |
| FR-10.6 | Admin auth แยก subdomain. การได้สิทธิ์ admin = ตั้ง `isAdmin=true` ผ่าน DB seed (ไม่มี self-service) | Must |

---

## 4. Order Status Flow (Redesign)

### 4.1 State Machine

```
มีจัดส่ง (fulfillmentMode = SHIPPED):
  PENDING ──seller ใส่ tracking──▶ SHIPPED ──buyer กดรับของ──▶ CONFIRMED ✅ (นับ trust/badge)

ไม่จัดส่ง (NO_SHIPPING: digital / service / subscription):
  PENDING ──buyer กดยืนยัน──▶ CONFIRMED ✅ (นับ trust/badge)

ยกเลิก (เฉพาะก่อน CONFIRMED):
  PENDING / SHIPPED ──seller ยกเลิก──▶ CANCELLED
  PENDING ──buyer ยกเลิก──▶ CANCELLED   ← buyer ยกเลิกได้เฉพาะ PENDING เท่านั้น (เพิ่ม 2026-05-17)
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
- **Buyer-cancel rule (เพิ่ม 2026-05-17):** buyer ยกเลิกได้เฉพาะ status = `PENDING` เท่านั้น; เมื่อ SHIPPED แล้ว buyer ยกเลิกไม่ได้ (เหลือแค่ "ยืนยันรับของ"); CONFIRMED/CANCELLED = terminal
- ยกเลิกหลัง CONFIRMED ไม่ได้ (terminal). MVP **ไม่มี dispute system** (Phase 2)
- SUBSCRIPTION: แต่ละรอบบิล (cycle) สร้าง order ย่อยที่เดิน PENDING→CONFIRMED ของตัวเอง

### 4.2 Data Visibility — Order Link (`/o/{token}`)

| ผู้เข้าชม | เห็นอะไร |
|----------|---------|
| ทั่วไป (ก่อน unlock) | ข้อมูลสินค้า, ราคา, trust score ร้าน + ช่องกรอกเบอร์ (phone-lock) |
| Buyer (unlock แล้ว / มาจาก SMS phone-bound) | รายละเอียดเต็ม + ปุ่มยืนยัน (PENDING/SHIPPED) + **ปุ่มแนบสลิป (PENDING เท่านั้น, optional)** + **ปุ่มยกเลิก (PENDING เท่านั้น)** *(เพิ่ม 2026-05-17)* |
| Seller (เจ้าของ) | ทุกอย่าง + ข้อมูล buyer + ปุ่มจัดการสถานะ |

---

## 5. Page Map & Routing

### 5.1 Subdomain Strategy

| Subdomain (prod / dev) | ใช้สำหรับ | Session |
|---|---|---|
| `deepthailand.app` / `deepth.local:4000` | Public + Buyer | Buyer session |
| `seller.deepthailand.app` / `seller.deepth.local:4000` | Seller (ต้องเปิดร้าน) | Seller session |
| `admin.deepthailand.app` / `admin.deepth.local:4000` | Admin | Admin session |

Account เดียวกัน login/session แยกตาม subdomain (host-scoped cookie). routing ใน `src/proxy.ts`.

### 5.2 Public (`deepthailand.app`)

| Page | Path |
|------|------|
| Landing | `/` |
| Pricing | `/pricing` |
| Sign-in / Sign-up / Verify OTP | `/auth/sign-in`, `/auth/sign-up`, `/auth/verify-otp` |
| Public Profile | `/u/{username}` |
| Public Order | `/o/{token}` |

### 5.3 Buyer (`deepthailand.app/...`) — ต้อง login

| เมนู | Path |
|------|------|
| Dashboard | `/dashboard` |
| My Orders | `/orders` |
| My Reviews | `/reviews` |
| Badges & Progress | `/badges` |
| Verification | `/settings/verification` |
| Profile | `/settings/profile` |

### 5.4 Seller (`seller.deepthailand.app/...`) — login แยก + ต้องมีร้าน

| เมนู | Path |
|------|------|
| Dashboard | `/dashboard` |
| Sales (analytics) | `/sales` |
| Products | `/products` |
| Categories | `/categories` |
| Customers | `/customers` |
| Orders | `/orders` |
| Create Order | `/orders/new` |
| Reviews | `/reviews` |
| Badges & Progress | `/badges` |
| Shop Settings | `/shop` |
| Verification | `/verification` |

> path ฝั่ง seller **ไม่มี** `/settings/` prefix (sync ตามโค้ดจริง)

### 5.5 Admin (`admin.deepthailand.app/...`) — login แยก + isAdmin

| เมนู | Path |
|------|------|
| Dashboard | `/dashboard` |
| Users | `/users` |
| Verifications | `/verifications` |
| Orders | `/orders` |
| Badges | `/badges` |

### 5.6 Route Auth

**ทุก authed route ต้อง server-side guard (proxy/server) ไม่พึ่ง client-side อย่างเดียว.**
known-gap: ปัจจุบัน buyer `/orders` `/reviews` `/settings/*` ยัง client-only — ต้องแก้ (ดู §11).

---

## 6. Non-Functional Requirements

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
| NFR-2.2 | CSRF protection (requirement — known-gap: custom API ยังไม่มี, ดู §11) |
| NFR-2.3 | Rate limiting: 100 req/min public, 30 req/min auth, 5 req/min OTP (requirement — known-gap: มีแค่ OTP in-memory) |
| NFR-2.4 | File upload: validate MIME, limit size, rename UUID, serve นอก public/ + auth check |
| NFR-2.5 | Input validation ทุก endpoint — Valibot (API) / Yup (form) |
| NFR-2.6 | OTP rate limit 3 ครั้ง/10 นาที/เบอร์ |
| NFR-2.7 | Admin self-review block (verification) — FR-2.6 |

### NFR-3: Usability

| ID | ข้อกำหนด |
|----|---------|
| NFR-3.1 | **UI user-facing ภาษาไทยทั้งหมด** (รวม seller/admin) — known-gap: menu label seller/admin ยังอังกฤษ ต้องแปล (§11) |
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

## 7. Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16.1 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| UI Theme | **Dual:** buyer/marketing = Vuexy (**MUI v9** + Emotion + Tailwind 4); seller/admin = Paces (Preline 4 + Tailwind 4, no MUI) |
| Database | PostgreSQL 16 (Supabase) |
| ORM | Prisma |
| Auth | NextAuth.js v4 (Facebook OAuth + Phone OTP) |
| OTP / SMS | SMS Gateway provider — **TBD provider, เป็น MVP dependency** (ใช้ทั้ง auth OTP + SMS Order Link) |
| Validation | Valibot (API) + Yup (form, react-hook-form) |
| Charts | ApexCharts / ECharts / Chart.js |
| Alerts | react-toastify |
| Analytics | Google Analytics + Google Search Console |
| Container | Docker + Docker Compose |
| Testing | Vitest |

---

## 8. MVP Scope

### ทำใน MVP

- Free core: Order / Product / Order Link อย่างง่าย / Report 1 ตัว (manual ทุกขั้น)
- Auth: Facebook + Phone OTP
- Verification L1 (Phone OTP) + L2 (เอกสารบุคคล) + L3 (ธุรกิจ) + admin review + self-review block
- Trust Score (raw additive + rating floor + UX copy)
- **Achievements system** — Badge data-driven engine (3 ประเภท; rework จาก hardcode), Seller+Buyer audience, ติดตัวถาวร, event/time-bound, icon deferred, **หน้า Badge Process** (buyer+seller `/badges`)
- Simple OMS — state machine ใหม่ (PENDING→CONFIRMED, unified terminal)
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
- General rate-limit (100/30) + CSRF เต็มรูป
- Dispute / Complaint system (admin review ก่อนหักคะแนน)
- Embeddable widget, Platform integration, Shipping status sync

---

## 9. Metrics & Analytics

### 9.1 Product Metrics (Admin Dashboard) — 8 metrics ครบใน MVP

| Metric | วิธีคำนวณ | สถานะ |
|--------|----------|-------|
| Total Users | COUNT(users) | ✅ มี |
| Shops | COUNT(users where isShop=true) | ✅ มี |
| Total Orders | COUNT(orders) | ✅ มี |
| Verifications Pending | COUNT(verification where status=PENDING) | ✅ มี |
| Completion Rate | CONFIRMED / (CONFIRMED + CANCELLED) | ⚠️ ต้องทำ (§11) |
| Avg. Rating | AVG(reviews.rating) | ⚠️ ต้องทำ (§11) |
| Active Users | users มี order ใน 30 วันล่าสุด | ⚠️ ต้องทำ (§11) |
| Avg. Trust Score | AVG(users.trustScore) | ⚠️ ต้องทำ (§11) |

### 9.2 Marketing / SEO

Google Analytics (`NEXT_PUBLIC_GA_MEASUREMENT_ID`) + Google Search Console (`NEXT_PUBLIC_GSC_VERIFICATION`)

### 9.3 Seller Analytics

หน้า `/sales` — ร้านดูยอดขาย/order ของตัวเอง (SalesChart, SalesTable)

---

## 10. Business Model

**โมเดล: Free core ตลอดไป + ขายฟังก์ชันช่วยเหลือแบบ à la carte** (ไม่ใช่ tier subscription)

### 10.1 Free (ทุกคน ตลอดไป)

สร้าง Order/Product, Order Link อย่างง่าย, Report 1 ตัว, **manual ทุกขั้นตอน** (สร้าง + ส่งลิงก์เอง). ระบบให้: บันทึก history, Trust Score, Public Profile (order สำเร็จ + badges)

### 10.2 Paid Add-ons

| Add-on | โมเดล | Phase |
|--------|-------|-------|
| **SMS Order Link** | ฿1/ข้อความ (ทุน ~฿0.5) — credit/top-up wallet, กดส่งลิงก์เข้ามือถือ buyer จากระบบ. Free = ส่งเอง | **MVP** |
| **พิมพ์เอกสาร** (ใบเสร็จ/ใบแจ้งหนี้/อื่น ๆ) | TBD — A: pack ฿590 / 600 orders (reprint ออเดอร์เดิมได้) หรือ B: ฿199/เดือน ไม่อั้น | Phase 2 |
| **Verified Badge** | subscription ~฿299/เดือน — badge หลังชื่อร้าน/profile (แบบ Meta/Twitter) | Phase 2 |

### 10.3 ทิศทาง

ฟีเจอร์เสริมในอนาคตคิดเงินแบบ à la carte ต่อไป — เพิ่ม add-on ใหม่โดยไม่กระทบ Free core

---

## 11. Known Gaps (โค้ดจริง vs PRD เป้าหมาย — ต้องปิดก่อน prod)

| # | Gap | ต้องทำ |
|---|-----|--------|
| 1 | Badge evaluator hardcode ตาม nameEN — criteria JSON ไม่มีผล | rework เป็น data-driven engine (FR-4.3) |
| 2 | Ship guard เช็ค `type===PHYSICAL` | เปลี่ยนเป็น `fulfillmentMode===SHIPPED` (P3) |
| 3 | `shippingAddress` persist ไม่ได้ (ไม่มีใน CreateOrderSchema) | เพิ่ม + required เมื่อ SHIPPED (P3) |
| 4 | Admin อนุมัติ verification ตัวเองได้ (P2 retro HIGH) | เพิ่ม self-review block (FR-2.6) |
| 5 | Order state machine = CREATED/CONFIRMED/SHIPPED/COMPLETED/CANCELLED | migrate → PENDING/SHIPPED/CONFIRMED/CANCELLED + `cancelInitiator` (§4) |
| 6 | `.env.vercel` ยังชี้ `safepay.co` (ขัด `.env.production.local`) | reconcile env → `deepthailand.app` |
| 7 | buyer `/orders` `/reviews` `/settings/*` client-only auth | server-side guard (§5.6) |
| 8 | seller/admin menu label อังกฤษ | แปลไทย (NFR-3.1) |
| 9 | FB user ไม่มี email → ไม่ auto-link history | หา fallback key |
| 10 | 4 admin metrics ขาด (Completion Rate, Avg Rating, Active Users, Avg Trust) | implement ให้ครบ (§9.1) |
| 11 | general rate-limit (100/30) + CSRF ยังไม่มี | implement ก่อน prod (NFR-2.2/2.3) |
| 12 | OTP/rate-limit store in-memory | ย้าย Redis (Phase 2) |

# PRD Rewrite — Decisions Log (interview ทีละ section)

> Scratchpad ระหว่าง interview. ปิด interview → ใช้ log นี้เขียน `docs/PRD.md` ใหม่ แล้วลบ/archive log.
> Gap analysis ดิบอยู่ใน context (Explore report 2026-05-16).

## Section 1 — Product Overview
- **Brand:** ใช้ "Deep" เป็นหลักทั้ง PRD, domain `deepthailand.app`. มีหมายเหตุ "SafePay = internal codename (repo/DB/identifiers)". ตรงกับ CLAUDE.md/memory.
- **Target Users:** รวม User+Buyer เป็น persona เดียว (คนมี profile), เน้น **Seller เป็น persona หลัก**, เพิ่ม **Admin/Ops** เป็น internal persona. ไม่เพิ่ม segment ภายนอกใหม่.
- **Core principle (ใหม่):** Order Link / flow ฝั่ง Free ต้อง "ง่ายมาก ๆ" เป็น design constraint ระดับ product ไม่ใช่แค่ NFR.

## New — Business Model (แทน "pricing tiers", โมเดลจริง)
โมเดล = **Free core ตลอดไป + ขายฟังก์ชันช่วยเหลือแบบ à la carte** (ไม่ใช่ tier subscription)
- **Free (ทุกคน ตลอดไป):** สร้าง Order/Product, Order Link อย่างง่าย, Report 1 ตัว, manual ทุกขั้น (สร้าง+ส่งลิงก์เอง). ระบบ = บันทึก history + Public Profile (order สำเร็จ + badges/achievements).
- **Paid add-ons:**
  - **SMS Order Link:** ฿1/ข้อความ (ทุน ~฿0.5) — กดส่งลิงก์เข้ามือถือปลายทางจากระบบ. Free = ส่งเอง.
  - **พิมพ์เอกสาร** (ใบเสร็จ/ใบแจ้งหนี้/อื่น ๆ): Free = ไม่มี. โมเดลราคา **TBD** — option A: pack ฿590 / 600 orders (reprint ออเดอร์เดิมได้), option B: ฿199/เดือน ไม่อั้น. _[รอฟันธง]_
  - **Verified Badge** (แบบ Meta/Twitter, badge หลังชื่อร้าน/profile): subscription ~฿299/เดือน. Free = ไม่มี.
- **ทิศทาง:** ฟีเจอร์เสริมในอนาคตคิดเงินแบบ à la carte ต่อไป (ขยายได้)
- **Phasing:** MVP = Free core + **SMS Order Link** (ต้องมี credit/top-up wallet ขั้นต่ำสำหรับ SMS, คิด ฿1/SMS). พิมพ์เอกสาร + Verified Badge + billing เต็มรูป = **Phase 2**. (กระทบ MVP scope §8 — เพิ่ม SMS + credit ledger)
- พิมพ์เอกสาร pricing A(pack)/B(฿199 unlimited) = TBD ตอน Phase 2 (ไม่ block PRD)
- _[ผลกระทบ cross-section: Verified Badge ↔ FR-4 Badge/FR-2 Verification; SMS ↔ FR-6 Order Link; "ง่ายมาก" ↔ FR-6/NFR Usability]_

## Section 2 — User Stories
- **B-2/U-2 confirm flow:** เขียนตามจริง = **phone-unlock** (buyer เปิดลิงก์ → กรอกเบอร์ให้ตรง unlock → กด confirm, **ไม่มี OTP**). ลบ B-2 OTP ออก. ทุก user story ที่อ้าง OTP confirm ต้องแก้.
- **Auth providers:** MVP = **Facebook + Phone OTP เท่านั้น**. **ตัด Email+Password (FR-1.3) ทิ้งถาวร** + **ตัด multi-provider link (U-6) ทิ้งถาวร**. ไม่ใช่ Phase 2 — เอาออกเลย.
  - หมายเหตุ: EMAIL_OTP ที่เหลือในโค้ดเป็นของ **verification level 1** (FR-2) คนละเรื่องกับ auth signup — ไปเคลียร์ตอน Section 3 FR-2.
- **Personas:** U-1..U-x rewrite ตาม persona ใหม่ (User+Buyer รวม, Seller หลัก, Admin/Ops internal).
- A-5 (badge criteria) / S-7 (shop verification path) → ยกไปตอบใน FR-4 / Section 5 (กันถามซ้ำ).

## Section 3 — Functional Requirements
- **FR-1 Auth:** Facebook + Phone OTP เท่านั้น. ตัด Email+Password + multi-provider link ถาวร. Session = host-scoped cookie ต่อ subdomain (เขียนตามจริง). OTP store in-memory = known MVP limitation, Redis = Phase 2 (ระบุใน NFR).
- **FR-2 Verification:** L1 = **Phone OTP** (auto, ไม่ใช้ email — ลบ EMAIL_OTP path), L2 = เอกสารบุคคล (admin review), L3 = จดทะเบียนธุรกิจ (admin review). FR-2.6: ระบุ **self-review block เป็น acceptance criterion** (admin อนุมัติ verification ตัวเองไม่ได้) + ลง known-gap ว่ายังไม่ fix ในโค้ด. ระบุ verification type enum ชัด.
- **FR-3 Trust Score:** เขียน **สูตร raw additive ของจริง** เป็น source of truth (5 component, cap 35/25/20/10/10, รวม 0–100, orders=min(25,√count×2.5), rating=(avg−1)×5, age=min(10,days/365×10), badges=min(10,count)). ระบุ **rating floor: review<3 → rating component=0** ชัด + ต้องมี UX copy อธิบาย seller.
- **FR-4 Badge:** **Data-driven engine = requirement (rework)** — criteria JSON ต้อง authoritative, admin แก้ criteria แล้วมีผล runtime จริง (ปัจจุบัน hardcode = tech-debt ต้อง rework, ลง known-gap). **Verified Badge (paid) = ประเภทที่ 4 แยกขาด** จาก verification badge / achievement badge, **ไม่นับเข้า trust score**. PRD แยก badge เป็น: verification / achievement / **paid (Verified)**.
- **FR-5 Product:** เขียน **capability model เต็ม** — 4 type (PHYSICAL/DIGITAL/SERVICE/SUBSCRIPTION) + axes: fulfillmentMode (SHIPPED/NO_SHIPPING), billingMode (ONE_TIME/RECURRING), billingPeriod/billingPeriodDays. อ้าง spec 2026-05-10. **SUBSCRIPTION = MVP เต็ม** → P3 (NO_SHIPPING hide-address) + P4 (recurring dashboard + recurring billing) เข้า MVP scope.
- **FR-6 OMS:** confirm = phone-unlock ไม่มี OTP. **SMS Order Link (paid, MVP):** ลิงก์ที่ส่งผ่าน SMS จาก seller (ที่ verify) ฝัง **phone-bound token → buyer ข้าม phone-unlock อัตโนมัติ**; ลิงก์ที่แชร์เอง (manual) ยังต้อง phone-unlock. ship guard = **fulfillmentMode===SHIPPED** (ไม่ใช่ type===PHYSICAL — ลง known-gap P3), **shippingAddress จำเป็นเมื่อ SHIPPED + ต้อง persist** (P3 fix, อยู่ MVP).
- **FR-7 Review:** เขียนตามจริง — review ได้ตั้งแต่ CONFIRMED (รวม SHIPPED/COMPLETED), 1 order/1 review (unique constraint). ระบุชัด **anonymous review (reviewerContact ล้วน) นับเข้า rating แต่ไม่นับ unique-reviewer ของ Community Favorite**.
- **FR-8 History linking:** sync ตามจริง (phone match สำหรับ phone-OTP signup, email match สำหรับ FB signup). ลง known-gap: **FB user ที่ไม่มี email → ไม่ auto-link** (limitation). ระบุ reviewerContact ก็ถูก link เหมือน order.
- **FR-9 Public Profile:** **Seller-centric** — โชว์ trust score, badges, order สำเร็จ, review ที่ได้รับ (as seller). buyer-only (ไม่มีร้าน) = โชว์ trust/badges + empty-state ชวนเปิดร้าน, ไม่โชว์ review-as-buyer.
- **FR-10 Admin:** sync ตามจริง + ระบุ admin auth แยก subdomain, admin สร้างผ่าน DB seed (acceptance: ระบุวิธีได้สิทธิ์ admin). self-review guard = ดู FR-2.6. dashboard metrics → ดู Section 9.
## Section 4 — Order Status Flow (REDESIGN — กระทบ schema/FR-6/badges, ต้อง migration)
**State machine ใหม่ (unified, terminal ชื่อเดียว):**
```
SHIPPED path (fulfillmentMode=SHIPPED):
  PENDING ──seller ใส่ tracking──> SHIPPED ──buyer กดรับของ──> CONFIRMED ✅ (นับ trust/badge)
NO_SHIPPING path (digital/service/subscription):
  PENDING ──buyer กดยืนยัน──> CONFIRMED ✅ (นับ trust/badge)
Cancel: PENDING/SHIPPED ──seller หรือ buyer ยกเลิก──> CANCELLED  (ยกเลิกหลัง CONFIRMED ไม่ได้)
```
- **terminal เดียว = `CONFIRMED`** (เลิกใช้ COMPLETED/BUYER_CONFIRMED แยก). trust/badge/Zero-Complaint นับที่ CONFIRMED.
- **ตัด DELIVERED ทิ้ง** (buyer ยืนยันรับเอง = CONFIRMED — หลัก "ง่ายมาก", ไม่ให้ seller กด 2 จังหวะ).
- **phone-lock = sub-state ของ PENDING** ไม่ใช่ status เต็ม. SMS phone-bound link ข้าม lock.
- **SUBSCRIPTION:** แต่ละ cycle = order ย่อย เดิน PENDING→CONFIRMED ของตัวเอง (P4 recurring).
- **Cancel:** ทั้ง seller และ buyer ยกเลิกได้ ก่อน CONFIRMED. MVP **ไม่มี dispute system**.
- **Zero Complaint badge:** **แยก buyer-initiated cancel ออกจากการคิด** → Order เก็บ `cancelInitiator` (seller|buyer); badge นับเฉพาะ seller-initiated cancel. dispute จริง = Phase 2.
- **กระทบ:** schema OrderStatus enum (CREATED→PENDING, ลบ COMPLETED, ปรับ transitions) + เพิ่ม `cancelInitiator` → **ต้อง data migration**. checkZeroComplaint ต้องแก้. FR-6 ship guard sync (fulfillmentMode).
- _[spec-review: ยืนยัน "Zero Complaint = ไม่มี seller-initiated cancel" ตอน user review]_

## Section 5 — Page Map & Routing
- **Domains:** prod `deepthailand.app` / `seller.deepthailand.app` / `admin.deepthailand.app`; dev `deepth.local`(+seller/admin):4000. ลบ `safepay.co` ทิ้ง (`.env.vercel` stale → ลง known-gap ว่าต้อง reconcile env).
- **Paths sync ตามจริง:** seller `/verification` `/shop` (ไม่มี `/settings/` prefix); admin dashboard `/dashboard`; buyer app ใต้ `(buyer-app)/`.
- **Extra pages = MVP feature จริง:** seller `/sales` (analytics), `/customers`, `/categories`, `/pricing` (marketing) → เขียนเป็น page/FR ใน PRD.
- **Route auth:** ทุก authed route ต้อง **server-side guard** (proxy/server) ไม่พึ่ง client. ลง known-gap: buyer `/orders` `/reviews` `/settings/*` ยัง client-only ต้องแก้.

## Section 6 — Non-Functional Requirements
- **rate-limit + CSRF:** คงเป็น requirement, ลง known-gap (มีแค่ OTP rate-limit in-memory; general 100/30 + CSRF ยังไม่ทำ, ต้องก่อน prod). OTP/rate store → Redis = Phase 2.
- **Thai UI:** บังคับ user-facing ไทยทั้งหมด (รวม seller/admin); known-gap: menu label seller/admin ยังอังกฤษ ต้องแปล.
- NFR sync: file upload ≤5MB / ภาพ ≤10 รูป / description ≤5000, shortDescription ≤200 (จากโค้ด validations).

## Section 7 — Tech Stack (sync ตามจริง — ไม่ถาม, consolidate)
- Next.js 16.1 (App Router, Turbopack), TS strict. **MUI v9** (ไม่ใช่ v7). **Dual theme:** buyer/marketing=Vuexy (MUI v9+Emotion+Tailwind4), seller/admin=Paces (Preline4+Tailwind4, no MUI).
- DB: PostgreSQL 16 (Supabase). Prisma. Auth: NextAuth v4 (Facebook + Phone OTP). Validation: Valibot (API) + **Yup (form)**. Charts: ApexCharts/ECharts/Chart.js. Alerts: react-toastify. Test: Vitest.
- **SMS gateway:** ต้องเลือก provider จริง (MVP มี SMS Order Link) — TBD provider แต่ระบุว่าเป็น MVP dependency. GA + Search Console (env) = ใส่ใน stack.

## Section 8 — MVP Scope (consolidate จาก decision ทั้งหมด — ไม่ถาม)
**MVP includes:** Free core (Order/Product/simple Order Link/1 report, manual), Auth FB+Phone, Verification L1-3 (+self-review block), Trust Score (raw additive + rating floor), **Badge data-driven engine** (rework), Public Profile (seller-centric), Simple OMS (state machine ใหม่ PENDING→CONFIRMED), **SMS Order Link + credit/top-up wallet (paid)**, **SUBSCRIPTION เต็ม (P3 hide-address + P4 recurring dashboard/billing)**, Buyer history linking, Admin panel (8 metrics ครบ), server-side route guard, seller /sales //customers /categories, /pricing page.
**Phase 2:** พิมพ์เอกสาร (paid), Verified Badge (paid sub), billing เต็มรูป, Redis store, general rate-limit/CSRF, dispute/complaint system, embeddable widget, platform integration.
**known-gaps (ลงใน PRD section ใหม่ "Known Gaps"):** badge hardcode→data-driven, ship guard type→fulfillmentMode, shippingAddress ไม่ persist, admin self-approve unguarded, env safepay.co stale, client-only route auth, Thai menu label, FB-no-email ไม่ auto-link, 4 admin metrics ขาด.

## Section 9 — Metrics & Analytics
- admin 8 metrics = MVP ต้องครบ (4 ที่ขาด: Completion Rate, Avg Rating, Active Users, Avg Trust → ลง known-gap ต้องทำ).
- §9 แยก 3 ชั้น: product metrics (admin), GA + Search Console (marketing/SEO), seller /sales analytics (ร้านดูยอดตัวเอง).

## เพิ่มระหว่างเขียน — Achievements system (MVP)
- Achievement มี audience SELLER/BUYER/ANY (badge ฝั่ง buyer ด้วย ไม่ใช่ seller-only)
- **ติดตัวถาวร (sticky)** — ได้แล้วไม่ revoke แม้เงื่อนไขเปลี่ยน (sticky award table)
- event/time-bound: `2026_BADGE` (signup ปี 2026), `FIRST_ORDER_REVIEWED` (seller, order CONFIRMED แรก) — นอกเหนือ 10 achievement เดิม
- แต่ละ badge มี `icon` (asset เพิ่มภายหลัง, nullable + fallback)
- **หน้า Badge Process** `/badges` ทั้ง buyer + seller — list badge + progress ("อีก N จะได้")
- public profile = โชว์ badge ที่ได้แล้ว (FR-4.8); progress = หน้า self `/badges`
- public profile = badge ที่ได้แล้ว เฉพาะ seller-context (verification+seller achievement+paid), **ไม่โชว์ progress, ไม่โชว์ buyer-audience achievement**. buyer badge + progress = หน้า self `/badges` เท่านั้น.

## New — Business Model (ดู Section 1 ด้านบน — โมเดล à la carte ครบแล้ว)
- สรุป: Free core ตลอดไป + ขาย add-on. MVP add-on = SMS (฿1/msg, credit wallet). Phase 2 = พิมพ์เอกสาร (A:฿590/600 orders | B:฿199/mo unlimited — TBD) + Verified Badge (~฿299/mo sub).

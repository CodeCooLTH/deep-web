# Design Spec — feat 00008 Phase 5: Business Reputation แยกต่อ business

> วันที่: 2026-07-03 · ต่อจาก Phase 4 (Business = full workspace, deploy prod) · autonomous mandate
> ยึดวิสัยทัศน์ user: "workspace แยกเต็มตัว ทุกอย่างแยกกันชัดเจน" → reputation (verification/trust/badge/public) แยกต่อ business

## 1. Goal
ทำให้ Business (Shop kind=BUSINESS) มี **reputation ของตัวเอง** แยกจาก owner และจาก business อื่น: เอกสารยืนยันตัวตน (L1/L2/L3), trust score, badge, และหน้า public profile (`/{slug}`) — คำนวณจาก orders/reviews/verification ของ business shop นั้นเอง. Personal shop = zero-regression (คงพฤติกรรมเดิม 100%).

**Gap ที่แก้ (audit 2026-07-03):** verification/trust/badge/public ทั้งหมด key ด้วย `userId` + hardcode `shop.findFirst({userId,kind:'PERSONAL'})` → business ที่ขายเยอะ/rating ดี ไม่ถูกนับ; ไม่มีหน้า public ของ business แม้มี slug แล้ว.

## 2. Decision (ยึดวิสัยทัศน์ user)
**Separate ทั้ง 4 ด้าน** (ไม่ inherit owner). แนวทาง migration = **additive nullable `shopId`** (backward-compat: NULL = user-level เดิม/Personal) — ไม่ backfill, ไม่ breaking.

- SMS L2 gate: **คงตัดไว้ (credit-only)** ตาม decision 2026-05-17 — ไม่ re-introduce (SMS แยกต่อ business แล้วจาก wallet Phase 4). ถ้าอนาคตเปิด L2 → เช็ค verification ของ business shop
- Buyer-context badge (reaction/watchlist/auction-won) = **คง user-level** (ผูกบุคคล ไม่ใช่ shop) → dual-key: seller-badge = shop-scope, buyer-badge = user-scope

## 3. Architecture — sequence ตาม dependency
Trust score term 35% (verification) + 10% (badge) → ต้องให้ verification + badge เป็น shop-scope ก่อน trust ถึงคำนวณถูก. ลำดับ:

### P5-1 Verification แยกต่อ business (foundation, เบา)
- migration: `VerificationRecord.shopId String?` (nullable FK → Shop). NULL = user/personal-level เดิม
- service: `submitVerification/getUserVerifications/getMaxVerificationLevel` รับ scope (`{userId}` หรือ `{shopId}`); business = query `where {shopId}`
- API `/api/verification` (submit/GET) + seller `verification/page.tsx`: ใช้ **active shop context** — Personal → user-level (shopId NULL เดิม); Business → shopId scope
- L3 (จดทะเบียนธุรกิจ) semantically ผูก business ถูกต้อง

### P5-2 Badge แยกต่อ business (หนักสุด)
- migration: `UserBadge.shopId String?`; เปลี่ยน `@@unique([userId,badgeId])` → `@@unique([userId,shopId,badgeId])` (nullable shopId ใน composite — ระวัง Postgres NULL ใน unique = distinct; ต้อง partial unique หรือ sentinel — ดู DATABASE section)
- seller-badge handlers (~18: order count/rating/auction) รับ shopId scope, evaluate จาก business shop; buyer-badge คง userId
- `evaluateBadges` แยก 2 path: user-scope (buyer) + shop-scope (seller); trigger หลัง order/review/verification ของ business
- rarity `getBadgeRarity`: base นับให้ consistent (shop-earner ÷ shop-count)

### P5-3 Trust Score แยกต่อ business (ปานกลาง, dep P5-1+P5-2)
- migration: `Shop.trustScore Int @default(0)` + `TrustScoreHistory.shopId String?`
- service: `recalculateShopTrustScore(shopId)` — orders/rating นับจาก shopId ตรง; verification 35% จาก shop verification (P5-1); badge 10% จาก shop badge (P5-2); age = shop.createdAt
- Personal shop: คง `recalculateTrustScore(userId)` เดิม (เขียน User.trustScore) — ไม่ regress
- monotonic rule คงเดิม (Math.max) ต่อ shop

### P5-4 Public Profile ของ business (เบา-ปานกลาง)
- route ใหม่ `/{slug}` หรือ `/b/[slug]` (buyer/marketing) — **verify ก่อน:** ลิงก์ `${buyerUrl}/${slug}` ปัจจุบัน (ShopLinkButtons) resolve ที่ไหน (gap #5 audit)
- `findShopBySlug(slug)` — business shop + trust(P5-3)/badge(P5-2)/verification(P5-1)/products/rating (products/review key shopId แล้ว = แยกทันที)
- view = reuse `/u/[username]` structure แต่ scope business shop

## 4. Risks
1. **Regression prod สูง** — trust/badge live บน prod (users มีคะแนน/badge จริง). additive nullable + Personal path เดิม = ต้องพิสูจน์ personal score/badge ไม่เปลี่ยน
2. **Badge unique constraint** — nullable shopId ใน composite unique: Postgres treat NULL distinct → personal (NULL) อาจซ้ำได้. ต้อง partial unique 2 ตัว (WHERE shopId IS NULL / IS NOT NULL) — raw SQL (Prisma ไม่รองรับ) → [[project_shared_db_drift_no_migrate_dev]]
3. **Shared DB dev=prod** — migrate deploy + user ยืนยันก่อน apply ทุกครั้ง
4. **Trigger fan-out** — evaluate trust/badge หลัง order/review ต้อง trigger scope ถูก (business order → business badge/trust ไม่ใช่ owner)

## 5. Out-of-scope
- RBAC granular (Phase 2 เดิม)
- SMS L2 re-introduce
- Business trust ใน admin dashboard aggregate

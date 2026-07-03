# Scope Baseline — feat 00008 Phase 5: Business Reputation แยกต่อ business

สถานะ: ACTIVE
อ้างอิง: Design Spec `docs/superpowers/specs/2026-07-03-00008-phase5-business-reputation-design.md` · audit 2026-07-03 (Explore: verification/trust/badge/public ผูก userId + hardcode PERSONAL)

## Goal
Business (Shop kind=BUSINESS) มี reputation ของตัวเอง (verification/trust/badge/public profile) แยกจาก owner + business อื่น. Personal = zero-regression. migration additive nullable shopId. sequence ตาม dependency: Verification → Badge → Trust → Public.

## In-Scope
| ID | รายการ | Acceptance | สถานะ |
|----|--------|------------|-------|
| P5-1 | **Verification แยกต่อ business** — `VerificationRecord.shopId?` migration + service scope-aware + api/verification + seller page ใช้ active shop; **personal readers เติม `shopId:null`** (trust-score/badge/app-shop กัน business docs ปน personal) | migration additive safe (ยังไม่ apply); personal path query `{userId,shopId:null}` ผลเดิม; business เขียน/อ่าน shopId; caller เดิม (auction L2/app API/buyer) ไม่พัง; tsc 0; grep 0 | CODE-DONE (รอ apply migration) |
| P5-2 | **Badge แยกต่อ business** — `UserBadge.shopId?` + partial unique (raw SQL) + seller-badge handlers shop-scope; buyer-badge คง user-level | business badge แยก; personal badge ไม่ regress; dual-key; migration safe | TODO |
| P5-3 | **Trust Score แยกต่อ business** — `Shop.trustScore` + `recalculateShopTrustScore(shopId)` (orders/rating/verification P5-1/badge P5-2 shop-scope) | business trust จาก business data; personal เดิมไม่ regress (monotonic) | TODO |
| P5-4 | **Public Profile business** — route `/{slug}` (verify ลิงก์เดิม resolve ที่ไหนก่อน) + findShopBySlug + view business shop | /u business slug แสดง trust/badge/products/rating ของ business | TODO |

## Out-of-Scope
- SMS L2 re-introduce (คงตัด credit-only); RBAC granular; business trust ใน admin aggregate; Valibot on POST /api/verification (pre-existing gap แยก)

## Assumptions & Dependencies
1. Migration touch **shared prod DB** → apply ด้วย migrate deploy + **user ยืนยันก่อน** (ห้าม migrate dev/db pull)
2. P5-3 (trust) dep P5-1+P5-2 (term verification 35% + badge 10% ต้อง shop-scope ก่อน)
3. Regression prod สูง (trust/badge/verification live data) — personal path ต้องพิสูจน์ไม่เปลี่ยน

## Change Log
| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-03 | baseline สร้าง | Gate 0 Phase 5 — user "จนจบ phase 5" + วิสัยทัศน์ แยกเต็มตัว | user |
| 2026-07-03 | P5-1 reviewer REWORK → fixed (4 personal readers เติม shopId:null) | กัน business verification ปน personal trust/badge/verified | reviewer |

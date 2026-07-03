# Scope Baseline — feat 00008 Business Account & Packages, Phase 2 (Constraint Cutover + App Cutover)

สถานะ: ACTIVE
อ้างอิง: DATABASE.md §4/§6.3 · SDS §7 Task 6-7 · SRS TFR-024 · blast-radius audit 2026-07-02 (Explore, 22 ไฟล์)
เอกสารต้นทาง: `docs/20 - Features/00008 - Business Account & Packages/{DATABASE,SDS,SRS}.md`

## Goal

ตัด `Shop.userId @unique` (1 User = 1 Shop) → partial unique `WHERE kind='PERSONAL'` เพื่อให้ owner มีได้หลาย Shop (Personal 1 + Business N) — ปลดล็อกให้ `POST /api/business/shops` (create business) ทำงานจริง (Phase 1 throw P2002 อยู่) โดยไม่ breaking Personal-shop flow เดิม. ต้อง apply migration + schema change + แก้ทุก call-site ที่ break **ในดีพลอยเดียว** (compile-break จนกว่าจะครบ)

## In-Scope (22 ไฟล์)

| ID | รายการ | fix | Acceptance | สถานะ |
|----|--------|-----|------------|-------|
| P2-1 | migration SQL Phase 2 (`business_account_packages_owner_cutover`) + `schema.prisma` | drop unique index `Shop_userId_key` → `CREATE UNIQUE INDEX Shop_userId_personal_key ON Shop(userId) WHERE kind='PERSONAL'` (raw SQL, Prisma DSL ไม่รองรับ partial); `Shop.userId` เอา `@unique` ออก; `User.shop Shop?` → `User.shops Shop[]`; `prisma generate` | apply สำเร็จ; `SELECT count(*) FROM (SELECT "userId" FROM "Shop" WHERE kind='PERSONAL' GROUP BY "userId" HAVING count(*)>1)` = 0 (partial unique valid); prisma generate ผ่าน | DONE |
| P2-2 | **A indirection** `src/services/shop.service.ts` `getShopByUserId` | `findUnique({where:{userId}})` → `findFirst({where:{userId, kind:'PERSONAL'}})` | 26 callers ไม่ break; return Personal shop เดิม | DONE |
| P2-3 | **C-2 indirection** `src/services/user.service.ts` `findByUsername` | include `shops:{where:{kind:'PERSONAL'}}` + remap `{...rest, shop: shops[0] ?? null}` เพื่อคง shape `.shop` | 2 consumers (`u/[username]`, `public/profile`) ไม่ break | DONE |
| P2-4 | **D** `src/lib/auth.ts` (6 จุด: 557/562/590/594/605/627) | `shop:{...}`→`shops:{where:{kind:'PERSONAL'},...}`; `.shop?.slug/id`→`.shops[0]?.slug/id` | needsOnboarding/shopSlug/activeShopId เดิมทำงานถูก (regression session) | DONE |
| P2-5 | **B batch 1** (5 ไฟล์ services+account): `trust-score.service.ts`(×2), `badge.service.ts`, `account/{sales-channels,shop-info,categories,onboarding-checklist}/route.ts` | `findUnique({where:{userId}})`→`findFirst({where:{userId,kind:'PERSONAL'}})` (คง select) | tsc ผ่าน; Personal query ผลเดิม | DONE |
| P2-6 | **B batch 2** (5 ไฟล์ api orders/products/shops): `products/route.ts`(×2), `orders/route.ts`(×2), `orders/customers/route.ts`, `shops/slug/route.ts`, `shops/update/route.ts` | เหมือน P2-5 | tsc ผ่าน | DONE |
| P2-7 | **B batch 3** (4 ไฟล์ seller pages/layout): `seller/(dashboard)/layout.tsx`, `seller/(fullscreen)/layout.tsx`, `seller/(dashboard)/dashboard/page.tsx`, `seller/(dashboard)/notifications/page.tsx` | เหมือน P2-5 (2 layout มี auto-create — kind default PERSONAL ยังทำงาน) | tsc ผ่าน; seller layout ไม่ auto-create ซ้ำ | DONE |
| P2-8 | **C-1** (3 ไฟล์ direct User include): `api/users/me/route.ts`, `api/admin/users/route.ts`, `(marketing)/(buyer-app)/dashboard/page.tsx` | include `shop:true`→`shops:{where:{kind:'PERSONAL'}}`; ⚠️ users/me+admin/users response `user.shop`→`user.shops[]` (เช็ค client consumer); buyer-app/dashboard `shop:true` unused → drop ได้ | tsc ผ่าน; ยืนยัน client consumer ของ users/me ไม่พัง | DONE |
| P2-9 | Verify — tsc baseline + E2E create-business ทำงานจริง (P2002 หาย) | — | `tsc` = baseline 85; regression Personal login/session PASS; create-business ได้ shop จริง (unit/curl) | DONE |

## Out-of-Scope
- UI surfaces (Phase 3 — safepay-ux)
- Admin extension, Tests.md
- Physical purge (tombstone confirmed RD-11)

## Assumptions & Dependencies
1. P2-1 (migration+schema+generate) ต้องเสร็จก่อนทุก code fix (compile-break นำทาง)
2. หลัง P2-1 → **ทั้ง repo compile-break** จนกว่า P2-2..P2-8 ครบ — ห้าม commit/deploy กลางคัน (ต้อง tsc reach baseline ก่อน)
3. migration apply บน Supabase shared DB — ปลอดภัย (partial unique, 9 shop เป็น PERSONAL, backfill valid) แต่ต้อง user ยืนยัน/แจ้งก่อน apply; **ห้าม migrate dev/db pull ตลอดไป** (partial index Prisma มองไม่เห็น)
4. P2-8 users/me response shape เปลี่ยน — ต้อง grep client ที่ fetch `/api/users/me` แล้วอ่าน `.shop` (ถ้ามี ต้องแก้/remap)

## Change Log
| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-02 | baseline สร้าง | Gate 0 Phase 2 — user เลือก (A) proceed cutover; audit ลด 48→22 ไฟล์ | user |

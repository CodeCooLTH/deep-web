# Scope Baseline — feat 00008 Business Account & Packages, Phase 1 (Backend Additive)

สถานะ: ACTIVE
อ้างอิง: BRD FR-BIZ-01..29 · SRS TFR-001..025 · SDS §7 (Migration/Rollout Sequence, Task 0-5) · API.md (16 endpoint) · DATABASE.md §4/§6/§12
เอกสารต้นทาง: `docs/20 - Features/00008 - Business Account & Packages/{SRS,SDS,API,DATABASE}.md`

## Goal

เพิ่ม data model + service layer + API layer ของ Business Account & Packages แบบ **additive ล้วน** (ไม่ breaking ต่อ Personal-shop flow ที่ live บน prod) — วาง foundation ให้ owner subscribe/manage business package, สร้าง/ลบ/กู้คืน business shop, invite/remove admin ได้ครบทุก backend endpoint โดยที่ยังไม่เปิด UI และยังไม่ตัด `Shop.userId @unique` เดิม

## In-Scope

| ID | รายการ | Map Task/TFR/Endpoint | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|------------------------|------------------------|-------|
| S-1 | DB Phase 1 additive migration — sync `schema.prisma` + hand-written migration `add_business_account_packages` (รวม §12 lifecycle delta: `ShopMember`, `BusinessPackageSubscription`+enum, `ShopInvite`, `Shop.kind/packageLockedAt/packageLockReason/deletedAt/deletedReason/purgedAt` + 8+2 index + backfill `ShopMember(OWNER)`) | SDS §7 Task 0 · DATABASE.md §6.2 + §12.1 | `npx prisma validate` ผ่าน; `npx dotenv -e .env.local -- npx prisma migrate deploy` apply สำเร็จบน Supabase shared DB (ต้องขอ user ยืนยันก่อนรัน); query `SELECT count(*) FROM "Shop" WHERE "kind" IS NULL` = 0 (DEFAULT ทำงาน); backfill query `SELECT count(*) FROM "Shop" s LEFT JOIN "ShopMember" m ON m."shopId"=s.id AND m.role='OWNER' WHERE m.id IS NULL` = 0; `tsc` เต็ม repo ผ่านหลัง `prisma generate` โดยไม่มี type error ใหม่ (ยืนยัน Phase 1 ไม่ breaking) | TODO |
| S-2 | `src/lib/business-package.ts` — constants (tier config, TIER_ORDER, renewal/grace/retention days, lock/delete reason, wallet reason/desc) | SDS §3.1 (constants block) · SRS §10 | ไฟล์ export ครบตาม SRS §10 เป๊ะ (`BUSINESS_PACKAGE_TIER_CONFIG` 3 tier ราคา 159/599/1299, `GRACE_ELIGIBLE_LOCK_REASONS`, `SHOP_LOCK_REASON` มี `OWNER_CANCELLED_PACKAGE` ใหม่, `SHOP_DELETE_REASON`); unit import สำเร็จไม่มี circular dep | TODO |
| S-3 | `src/lib/shop-context.ts` — `getPersonalShop`, `isShopMember`, `resolveActiveShopContext` | SDS §3.1 · SRS TFR-011, TFR-013 | `getPersonalShop(userId)` คืน Personal shop เดิมถูกต้อง (regression กับ user ที่มีแค่ Personal shop); `isShopMember` คืน `true/false` ถูกต้องตาม `ShopMember` row; `resolveActiveShopContext` คืน `null` เมื่อ shop ไม่มี/soft-deleted/ไม่ใช่สมาชิก — ทุก path มี unit test | TODO |
| S-4 | `src/services/business-package.service.ts` — subscribe/upgrade/downgrade/cancel/reactivate/renewOrLock + `lockAllBusinessShops` + `reconcileBusinessLocksAfterQuotaChange` | SDS §3.2 · SRS TFR-001,002,004,005,014,015,016,018 | ทุก error code ตาม API.md §5 throw ถูกต้อง (`SUBSCRIPTION_ALREADY_EXISTS`/`PERSONAL_SHOP_REQUIRED`/`INSUFFICIENT_CREDIT`/`NOT_AN_UPGRADE`/`NOT_A_DOWNGRADE`/`SUBSCRIPTION_NOT_ACTIVE`/`SUBSCRIPTION_NOT_LOCKED`/`KEEP_SELECTION_EXCEEDS_QUOTA`/`INVALID_SHOP_SELECTION`); `subscribeBusinessPackage` เขียน `WalletTransaction(reason="BUSINESS_PACKAGE_SUBSCRIPTION")` 1 รายการ atomic; boundary test quota เป๊ะ n=max ผ่าน n+1 ถูกปฏิเสธ (SRS §6) | TODO |
| S-5 | `src/services/business-shop.service.ts` — `createBusinessShop`, `softDeleteBusinessShop`, `restoreBusinessShop`, `autoSoftDeleteLapsedShops`, `purgeExpiredShops` | SDS §3.3 · SRS TFR-006,019,020,021,022 | `softDeleteBusinessShop`/`restoreBusinessShop` throw error ตาม API.md §5 ถูกต้อง (`NOT_OWNER`/`ALREADY_DELETED`/`NOT_DELETED`/`RESTORE_WINDOW_EXPIRED`); `autoSoftDeleteLapsedShops`/`purgeExpiredShops` idempotent (รันซ้ำในวันเดียวไม่เพิ่ม side-effect ซ้ำ — WHERE filter กันเอง); purge = ตั้ง `purgedAt` เท่านั้น ไม่มี `prisma.shop.delete()` เรียกที่ไหนเลย (grep ยืนยัน) | TODO |
| S-6 | `src/services/shop-member.service.ts` — `inviteShopMember`, `acceptShopInvite`, `cancelInvite`, `removeShopMember`, `listMembers`, `listInvites` | SDS §3 (pseudocode อ้าง SRS ตรง) · SRS TFR-008,009,010 | error code ครบ (`SHOP_LOCKED`/`ADMIN_QUOTA_EXCEEDED`/`INVITE_ALREADY_PENDING`/`INVITE_NOT_PENDING`/`CONTACT_MISMATCH`/`ADMIN_QUOTA_EXCEEDED_AT_ACCEPT`/`NOT_AN_ADMIN`); `removeShopMember` เป็น hard delete จริง (grep ไม่มี soft-revoke field); auto-unlock เมื่อ adminCount กลับมาพอดีโควตาหลัง remove | TODO |
| S-7 | API batch — Subscription lifecycle: `POST /api/business/{subscribe,upgrade,downgrade,cancel,reactivate}` (5 endpoint) + Valibot schema ที่เกี่ยวข้อง | SDS §7 Task 3 (batch) · API.md §4.2-4.6 | ทุก endpoint คืน response shape ตรง API.md เป๊ะ; session-auth 401 ถ้าไม่ login; CSRF Origin-check ผ่าน (มีอยู่แล้วใน `guardApi`, ไม่ต้องแก้ `proxy.ts`); curl/E2E happy-path ทั้ง 5 endpoint ผ่าน | TODO |
| S-8 | API batch — Business shop lifecycle: `POST /api/business/shops`, `DELETE /api/business/shops/[shopId]`, `POST /api/business/shops/[shopId]/restore` (3 endpoint) | SDS §7 Task 3 (batch) · API.md §4.7-4.9 | error code + response shape ตรง API.md; **⚠️ known Phase-1 constraint (ไม่ใช่ bug):** `POST /shops` จะ throw DB unique-violation ที่ `Shop.userId` เสมอสำหรับทุก owner (เพราะ `@unique` เดิมยังไม่ถูกตัดจนกว่า Phase 2) — acceptance ของ batch นี้คือ **code path/validation/quota-check ถูกต้อง 100% ระดับ service+route** ไม่ใช่ end-to-end "สร้าง business สำเร็จจริง" (ต้องรอ Phase 2 gate) — QA ต้อง assert ว่า error ที่เกิดเป็น DB constraint ไม่ใช่ business-logic bug | TODO |
| S-9 | API batch — Membership/Invite: `POST/GET/DELETE .../invites`, `POST /api/invites/[inviteId]/accept`, `DELETE .../members/[memberId]` (5 endpoint) | SDS §7 Task 3 (batch) · API.md §4.10-4.14 | error code + response shape ตรง; **PII mask บังคับ**: `GET .../invites` ต้อง mask `invitedContact` ที่ server ก่อนส่ง (ตรง memory `feedback_rsc_pii_neutralize_at_source`, NFR SRS §8) — grep ยืนยันไม่มี raw phone/email หลุดเข้า response ดิบ | TODO |
| S-10 | API batch — Context/Switch: `GET /api/business/context`, `POST /api/business/switch-context` (2 endpoint) | SDS §7 Task 3 (batch) · API.md §4.1, §4.15 | response shape ตรง API.md §4.1 เป๊ะ (personal/subscription/businesses[]/hasBusinessMembership); `switch-context` คืน 403 `NOT_MEMBER` ถ้าไม่ใช่สมาชิก — **ไม่ persist state ฝั่ง server เอง** (grep ยืนยันไม่มีการเขียน DB ใน route นี้) | TODO |
| S-11 | Cron route `POST /api/cron/business-package-lifecycle` + `vercel.json` entry | SDS §7 Task 4 · API.md §4.16 · SRS TFR-002,021,022 | `CRON_SECRET` bearer auth บังคับ (401 ถ้าไม่ตรง, ไม่แตะ DB เลย); response มี count แยกครบ 3 phase (`renewal`/`autoSoftDelete`/`purge`) พร้อม error count; รันซ้ำวันเดียวกัน (manual trigger 2 ครั้ง) ไม่มี side-effect ซ้ำ (idempotency test); **ก่อน apply `vercel.json` ต้อง verify Vercel Hobby cron-count limit จริงกับ Controller** (SRS Risk R-1) — ถ้าเกิน limit ห้าม apply จนกว่าจะ mitigate | TODO |
| S-12 | `src/lib/auth.ts` jwt/session callback — เพิ่ม `activeShopId`/`activeShopRole`/`hasBusinessMembership` | SDS §3.5 · SRS TFR-012 (high-risk) | **Regression บังคับก่อน merge:** login/session flow เดิมของ Personal-only user (seller+admin+buyer ทุก subdomain) ต้อง PASS 100% ไม่มี field/latency เปลี่ยน (NFR SRS §8 — ไม่เกิน 1 extra indexed lookup ต่อ render); business-member user ได้ `session.user.activeShopId`/`hasBusinessMembership` ถูกต้องตาม membership จริง; `trigger==='update'` re-verify membership ก่อนเชื่อค่าจาก client (ไม่ trust JWT เปล่า) | TODO |
| S-13 | `src/lib/validations.ts` — schema ใหม่ (`SubscribeBusinessPackageSchema`, `UpgradeBusinessPackageSchema`, `DowngradeBusinessPackageSchema`, `CreateBusinessShopSchema`, `InviteShopMemberSchema`, `SwitchActiveShopSchema`) | SDS §1.2 (Task 5 boundary) · SRS §9 | invalid payload (เช่น `tier` นอก picklist, `keepShopIds` ไม่ใช่ uuid) → 400 `VALIDATION_ERROR` ทุก endpoint ที่เกี่ยวข้อง (S-7/S-8/S-9/S-10) | TODO |

## Out-of-Scope

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | Phase 2 DB constraint cutover — `DROP` unique เดิม + `CREATE UNIQUE ... WHERE kind='PERSONAL'` (`Shop.userId` ตัด `@unique`) | Phase 2 (gated) — ต้อง grep audit 48 ไฟล์/91 call-site เสร็จ + burn-in + user ยืนยันแยกรอบ (SDS §7 Task 6, DATABASE §4/§9 open item #1, RD-13) |
| OOS-2 | `User.shop Shop?` → `User.shops Shop[]` breaking type change + Phase 3 app cutover 48 ไฟล์ (`getShopByUserId`/`user.shop` singular → `getPersonalShop`/`resolveActiveShopContext`) | Phase 2/3 (gated) — ผูกมัดกับ OOS-1 ต้อง deploy พร้อมกัน (SDS §7 Task 6-7, DATABASE §4) |
| OOS-3 | UI surfaces ทั้งหมด: package matrix page, create-business form, invite management page, downgrade selection modal, cancel confirm dialog, locked-state banner, `AccountSwitcher`, accept-invite page | Phase 3 — รอ `safepay-ux` Design Spec ก่อนเสมอ (Hard Rule 8; SDS §5, Task 8) |
| OOS-4 | Admin extension — `admin/topups/[id]` เพิ่ม Business Package summary section | SDS §7 Task 9 — แยกทีหลัง (ไม่ block backend core) |
| OOS-5 | `Tests.md` (Playwright/QA suite) + regression suite เต็มสำหรับ Personal-only flow (FR-BIZ-23-AC-03) | Ownership `safepay-qa` แยก gate — dispatch หลัง Task 5 และหลัง Task 7 (ตาม SDS §7 QA gate note) |

## Assumptions & Dependencies

1. **ลำดับ dependency บังคับ:** S-1 (Task 0, DB migration) ต้องเสร็จ+apply ก่อนแตะ S-2 ขึ้นไปทุกตัวที่อ้าง field ใหม่ (`deletedAt`/`purgedAt`/`kind` ฯลฯ) — apply ต้องขอ user ยืนยันก่อนเสมอ (prod-shared Supabase DB, ตาม memory `project_prisma_migration_env_targets`)
2. **S-2/S-3 (Task 1)** เป็น prerequisite ของ S-4/S-5/S-6 (Task 2) — 3 service ไฟล์อิสระต่อกัน (parallel dispatch ได้ตาม SDS §7 Task 2 หมายเหตุ)
3. **S-7..S-10 (Task 3)** ต้องมี S-4/S-5/S-6 (services) + S-13 (validations) เสร็จก่อน — แม้ SDS จัด `lib/validations.ts` อยู่ใน Task-5 boundary description แต่ในทางปฏิบัติ schema ต้องพร้อมก่อน API routes ใช้งาน (route จะ import validations) — Controller ควร sequence S-13 ให้เสร็จก่อนหรือพร้อมกับ S-7..S-10 ไม่ใช่รอถึง Task 5 จริง (flag เพื่อความชัดเจน ไม่ใช่การเปลี่ยน scope)
4. **S-12 (`lib/auth.ts`) = high-risk** — กระทบทุก session render ทั้งระบบ (buyer/seller/admin) ต้องผ่าน regression เต็มก่อน merge ตาม SRS NFR §8/TD-004 — แนะนำทำเป็น batch เดี่ยว ไม่ parallel กับงานอื่นที่แตะ `src/lib/auth.ts`
5. **S-11 (cron + `vercel.json`)** ต้อง Controller verify Vercel Hobby cron-count limit จริงก่อน apply — โปรเจกต์มี cron `inventory-renewal` อยู่แล้ว 1 ตัว, เพิ่มตัวนี้จะเป็นตัวที่ 2 (SRS Risk R-1)
6. **S-8 มีข้อจำกัดโดยดีไซน์ (ไม่ใช่ gap ของ Phase 1):** เนื่องจาก `Shop.userId @unique` เดิมยังไม่ถูกตัดจนกว่า Phase 2 (OOS-1) การเรียก `POST /api/business/shops` จริงจะ throw DB unique-constraint error เสมอสำหรับทุก owner แม้ business logic/quota-check ถูกต้อง 100% — เป็นพฤติกรรมที่ตั้งใจตาม DATABASE.md §4 ("ระบบยังสร้าง Business shop ตัวที่ 2 ของ owner คนเดียวกันไม่ได้" จนกว่า Phase 2) — QA ต้องแยกให้ชัดว่านี่คือ "blocked by design รอ Phase 2" ไม่ใช่ defect ของ Phase 1
7. **`CRON_SECRET`** ต้องมีอยู่ใน env (dev + prod) ก่อน S-11 ใช้งานได้จริง — สมมติว่ามีอยู่แล้วจาก feature 00003 (`inventory-renewal` ใช้ตัวเดียวกัน), ไม่ต้องสร้างใหม่
8. **RD-11 (purge = tombstone ไม่ใช่ physical DELETE)** ถูก confirm แล้วโดย user (SRS §11 RD-11) — Phase 1 scope ยึดตาม tombstone design เท่านั้น ถ้า Controller/user ต้องการ physical delete ภายหลัง (PDPA ฯลฯ) ถือเป็น scope เปลี่ยนที่ต้องผ่าน Change Log ใหม่ ไม่ใช่ implicit ใน Phase 1 นี้

## Deferred → Phase 2/3

- `Shop.userId` constraint cutover + `User.shops[]` breaking migration (OOS-1/OOS-2)
- ทุก UI surface ของฟีเจอร์นี้ (OOS-3)
- Admin dashboard extension (OOS-4)
- Playwright/QA regression suite เต็ม (OOS-5 — เจ้าของ `safepay-qa`, แยก gate)
- Granular per-action RBAC เกิน membership-based (ตัดออกจาก MVP ทั้งฟีเจอร์ตาม RD-12 ไม่ใช่แค่ Phase 1)
- Config table สำหรับราคา/quota ต่อ tier (ยังคง hardcode app-layer ตาม TD-005)

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-02 | baseline สร้าง | Gate 0 — เริ่ม Phase 1 (Backend Additive) ตาม SDS §7 Task 0-5 | - |

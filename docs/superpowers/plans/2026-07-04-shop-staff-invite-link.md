# Shop Staff Invite Link (feature 00012) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. โปรเจกต์นี้บังคับ Hard Rule 4 (agent-team) + Hard Rule 8 (safepay-ux ก่อน UI) + Hard Rule 11 (feature docs).

**Goal:** ให้เจ้าของร้าน BUSINESS เชิญพนักงาน (แอดมิน) เข้าร้านด้วยลิงก์แชร์ `deepthailand.app/i/<slug>` (reusable + หมดอายุ + revoke) โดยผู้ถูกเชิญ login/register แล้วเข้าร้านโดยไม่กลายเป็น seller (Lazy Personal shop) และเลือกร้านได้ถ้ามีหลายร้าน; ย้ายการจัดการไปเมนูซ้าย "พนักงาน" → `/admins`.

**Architecture:** ต่อยอด feature 00008 — reuse `ShopMember` (OWNER/ADMIN, SSOT), `BusinessPackageSubscription` (โควตา). เพิ่ม model `ShopInviteLink` (reusable link). landing `/i/[slug]` host บน seller subdomain, main domain redirect ผ่าน proxy. เปลี่ยน invariant "ทุก seller มี Personal shop auto-create" → Lazy (สร้างเมื่อกดเปิดร้านเอง). Post-login routing 1 vs หลายร้าน ผ่านหน้า `/choose-shop`.

**Tech Stack:** Next.js 16 (App Router, proxy.ts), Prisma + PostgreSQL (Supabase shared dev=prod), NextAuth v4, Paces (Preline/Tailwind) UI, Valibot (API validation), Vitest.

## Global Constraints

- **Shared prod DB:** dev = prod เป็น Supabase ตัวเดียวกัน → migration ห้าม `migrate dev`/`db push`. ใช้ **hand-written SQL + `prisma migrate deploy -e .env.local`** และ **ขอ user ยืนยันก่อน apply** (ดู `docs/conventions/prisma-shared-db-drift.md`). restart dev server หลัง migrate.
- **UI theme-copy (Hard Rule 1,3,7):** ทุกหน้า/component seller = Paces primitive จาก `theme/paces/Admin/TS/src/**` — commit ต้องมี `Base:` line. ห้าม arbitrary Tailwind value. primary = น้ำเงิน `#236dc9` (`bg-primary`/`text-primary` token) — ห้ามม่วง `#7367F0`.
- **safepay-ux gate (Hard Rule 8):** ทุก task ที่แตะ page/component/layout/style ต้องผ่าน `safepay-ux` ออก Design Spec **ก่อน** developer. seller docs = `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`.
- **No emoji (Hard Rule 12):** ห้าม emoji ใน UI ทุกจุด — icon จริง `@iconify/react` tabler names เท่านั้น. icon ที่ spec ไม่ระบุ → ถาม user (ห้ามเดา). grep gate ต้องคืน 0.
- **Paces toast/modal (Hard Rule 9, feedback_sweet_alerts_modal):** notification = `pacesToast` (action=top-right, chat=bottom-right); confirm/blocking dialog = Sweet Alerts (Swal). ห้าม `react-toastify` ใน `(paces)/`.
- **Date:** `formatDate`/`formatDateTime` จาก `src/lib/format-date.ts` (พ.ศ.) เท่านั้น.
- **Validation:** API = Valibot (`src/lib/validations.ts`); form = Yup.
- **PII RSC (feedback_rsc_pii_neutralize_at_source):** mask + null-out raw PII ที่ server boundary ก่อน serialize ลง flight.
- **Role:** `ShopMember.role` = `"OWNER" | "ADMIN"` เท่านั้น (ไม่มี role ย่อยใน feature นี้).
- **Docs language:** ไทยเป็นหลัก (commit body, comments-for-why, docs).
- **Subagent git scope (feedback_subagent_git_scope_violation):** developer subagent **ห้าม** `git checkout/pull/merge/push` และ **ห้าม commit** — Controller (main session) verify diff แล้ว commit เอง.

---

## Phase 0 — Feature docs (Hard Rule 11) + downstream audit

### Task 0.1: Feature docs skeleton 00012
**Files:**
- Create: `docs/20 - Features/00012 - Shop Staff Invite Links/{PRD,BRD,SRS,SDS,DATABASE,API,Tests}.md` (จาก template `docs/99 - Rules/Feature-Templates/`)

**Owner subagents:** PRD/BRD=`safepay-product`, SRS/SDS/API=`safepay-planner`, DATABASE=`safepay-database`, Tests=`safepay-qa`. Controller Write+commit.

- [ ] Dispatch subagents ตาม ownership; อ้าง design spec `docs/superpowers/specs/2026-07-04-shop-staff-invite-link-design.md`. diagram = Mermaid เท่านั้น.
- [ ] Controller รวมไฟล์ + commit `docs(00012): feature docs skeleton`

### Task 0.2: Lazy-shop downstream audit (READ-ONLY, ก่อนแก้โค้ด)
**Files:** ไม่มี (audit report → เขียนใน SDS §risk)

- [ ] Dispatch `Explore` agent: หา **ทุกจุดที่สมมติว่า `getPersonalShop`/Personal shop ต้องมี** และทุก caller ของ `requireActiveShop`/`resolveActiveShopContext`. รายงาน call sites ที่จะพังถ้า user ไม่มี Personal shop (เช่น `verification/page.tsx:55` comment ที่อ้าง "ensurePersonalShop รันมาก่อนแล้ว").
- [ ] จัดหมวด: (a) หน้าที่ต้องมี Personal shop จริง (billing/onboarding/public profile) → ต้อง redirect ไป "เปิดร้าน" ถ้าไม่มี; (b) หน้าที่ operate บน active shop (business) → ต้องทำงานได้แม้ไม่มี Personal.
- [ ] Controller review audit → เป็น input ของ Task 4.x

---

## Phase 1 — Data model + link infra (backend, no UI)

### Task 1.1: `ShopInviteLink` model + hand-written migration
**Files:**
- Modify: `prisma/schema.prisma` (เพิ่ม model + relation ใน `Shop` และ `User`)
- Create: `prisma/migrations/<timestamp>_add_shop_invite_link/migration.sql` (hand-written)

**Interfaces (Produces):** Prisma model `ShopInviteLink { id, shopId, slug @unique, role, createdByUserId, expiresAt, revokedAt?, createdAt }`.

- [ ] **Step 1:** เพิ่มใน `schema.prisma`:
```prisma
model ShopInviteLink {
  id              String    @id @default(cuid())
  shopId          String
  slug            String    @unique
  role            String    @default("ADMIN")
  createdByUserId String
  expiresAt       DateTime
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())

  shop      Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
  createdBy User @relation("ShopInviteLinkCreatedBy", fields: [createdByUserId], references: [id])

  @@index([shopId, revokedAt])
}
```
เพิ่ม back-relation: `Shop { ... inviteLinks ShopInviteLink[] }`, `User { ... createdShopInviteLinks ShopInviteLink[] @relation("ShopInviteLinkCreatedBy") }`.
- [ ] **Step 2:** เขียน migration.sql มือ (CREATE TABLE + unique index บน slug + index `(shopId, revokedAt)` + FK ทั้งสอง). owner=`safepay-database`.
- [ ] **Step 3:** `node node_modules/typescript/lib/tsc.js --noEmit` + `npx prisma generate` (generate ไม่ต่อ DB) — คาดผ่าน.
- [ ] **Step 4 (HUMAN GATE):** แจ้ง user ขอยืนยัน apply `prisma migrate deploy -e .env.local` (touch prod DB แชร์). **หลัง apply → restart dev server.**
- [ ] **Step 5:** Controller commit `feat(00012): ShopInviteLink model + migration`

### Task 1.2: `invite-link.ts` lib (slug gen + URL build)
**Files:**
- Create: `src/lib/invite-link.ts`
- Test: `src/lib/__tests__/invite-link.test.ts`

**Interfaces (Produces):**
- `generateInviteSlug(): string` — crypto random 12-char `[A-Za-z0-9]`
- `buildInviteUrl(slug: string): string` — `https://deepthailand.app/i/<slug>` (prod) / dev host จาก env
- `INVITE_EXPIRY_OPTIONS` = `[{key:'24h',ms:...,label:'24 ชั่วโมง'},{key:'7d',...,label:'7 วัน'},{key:'30d',...,label:'30 วัน'}]`, default `'7d'`

- [ ] **Step 1 (test):**
```ts
import { generateInviteSlug, buildInviteUrl, INVITE_EXPIRY_OPTIONS } from '@/lib/invite-link'
test('slug 12-char alnum', () => { expect(generateInviteSlug()).toMatch(/^[A-Za-z0-9]{12}$/) })
test('slug unique-ish', () => { expect(generateInviteSlug()).not.toBe(generateInviteSlug()) })
test('url', () => { expect(buildInviteUrl('abc')).toContain('/i/abc') })
test('default expiry 7d', () => { expect(INVITE_EXPIRY_OPTIONS.find(o=>o.key==='7d')).toBeTruthy() })
```
- [ ] **Step 2:** run `npx vitest run src/lib/__tests__/invite-link.test.ts` → FAIL
- [ ] **Step 3:** implement ด้วย `crypto.randomBytes` (mirror `src/services/sms-code.service.ts` charset pattern). base URL: prod `https://deepthailand.app`, dev อ่านจาก `process.env` host หรือ hardcode fallback.
- [ ] **Step 4:** run vitest → PASS
- [ ] **Step 5:** Controller commit `feat(00012): invite-link slug/url lib`

### Task 1.3: `invite-link.service.ts` (create/list/revoke/accept)
**Files:**
- Create: `src/services/invite-link.service.ts`
- Test: `src/services/__tests__/invite-link.service.test.ts`

**Interfaces (Consumes):** `generateInviteSlug`, `buildInviteUrl` (1.2); `BUSINESS_PACKAGE_TIER_CONFIG` (`@/lib/business-package`).
**Interfaces (Produces):**
- `createInviteLink(ownerId, shopId, expiryKey): Promise<{slug,expiresAt}>` — guard: shop BUSINESS + owner + `packageLockedAt==null` + ACTIVE sub; retry slug unique
- `listActiveInviteLinks(shopId): Promise<{slug,expiresAt,createdAt}[]>` — `revokedAt==null && expiresAt>now`
- `revokeInviteLink(ownerId, shopId, slug): Promise<void>` — set `revokedAt=now`
- `resolveInviteLink(slug): Promise<{shopId, shopName, shopLogo|null, valid:boolean, reason?:'EXPIRED'|'REVOKED'|'NOT_FOUND'}>` — สำหรับ landing
- `acceptInviteLink(slug, userId): Promise<{shopId}>` — full accept (validate + quota re-check + create ShopMember ADMIN idempotent). throw typed errors: `LINK_INVALID`, `ALREADY_OWNER`, `ADMIN_QUOTA_EXCEEDED`. idempotent ถ้าเป็นสมาชิกแล้ว → คืน `{shopId}` ปกติ.

- [ ] **Step 1 (test):** cases — create by non-owner → throw NOT_OWNER; create locked → SHOP_LOCKED; accept valid → ShopMember ADMIN created; accept when already member → idempotent no-throw; accept expired → LINK_INVALID; accept over quota → ADMIN_QUOTA_EXCEEDED; accept as owner → ALREADY_OWNER. (mock prisma หรือ integration ตาม pattern `shop-member.service` test เดิม; ถ้าไม่มี test เดิม → integration กับ test DB ผ่าน `safepay-qa` แทน)
- [ ] **Step 2:** run → FAIL
- [ ] **Step 3:** implement — mirror quota logic จาก `acceptShopInvite` ใน `src/services/shop-member.service.ts` (transaction + `count ShopMember role=ADMIN` vs `maxAdminsPerBusiness`, fail-closed ถ้าไม่มี ACTIVE sub). accept ใช้ `tx.shopMember.upsert` (idempotent). conditional guard กัน over-quota race.
- [ ] **Step 4:** run → PASS
- [ ] **Step 5:** Controller commit `feat(00012): invite-link.service create/list/revoke/accept`

---

## Phase 2 — API routes

### Task 2.1: `POST/GET /api/shops/current/invite-links` + `DELETE .../[slug]`
**Files:**
- Create: `src/app/api/shops/current/invite-links/route.ts` (POST create, GET list)
- Create: `src/app/api/shops/current/invite-links/[slug]/route.ts` (DELETE revoke)
- Modify: `src/lib/validations.ts` (เพิ่ม `inviteLinkCreateSchema` — Valibot: `expiryKey ∈ {'24h','7d','30d'}`)

**Interfaces (Consumes):** `createInviteLink/listActiveInviteLinks/revokeInviteLink` (1.3), `requireActiveShop` (`@/lib/shop-context`), `authOptions`.

- [ ] **Step 1 (route logic):** resolve session → `requireActiveShop` → guard `kind==='BUSINESS' && role==='OWNER'` (else 403). POST: validate body (Valibot) → `createInviteLink(user.id, active.shop.id, expiryKey)` → 201 `{url: buildInviteUrl(slug), expiresAt}`. GET: `listActiveInviteLinks` → map เป็น `{url, expiresAt, createdAt}`. DELETE: `revokeInviteLink` → 204. map service throws → HTTP (NOT_OWNER/SHOP_LOCKED→403, NO_ACTIVE_PACKAGE→402/403). (ดู memory `feedback_service_error_route_mapping` — ทุก throw ต้องมี catch ครอบ)
- [ ] **Step 2:** QA ผ่าน authenticated-curl (safepay-qa) — create/list/revoke happy + 403 non-owner.
- [ ] **Step 3:** Controller commit `feat(00012): invite-link owner API (create/list/revoke)`

### Task 2.2: `GET /api/i/[slug]` (resolve) + `POST /api/i/[slug]/accept`
**Files:**
- Create: `src/app/api/i/[slug]/route.ts` (GET resolve — public, no PII)
- Create: `src/app/api/i/[slug]/accept/route.ts` (POST accept — auth required)
- Modify: `src/lib/api-rate-limit.ts` usage (reuse) — rate-limit accept per-IP

**Interfaces (Consumes):** `resolveInviteLink`, `acceptInviteLink` (1.3).

- [ ] **Step 1:** GET resolve: `resolveInviteLink(slug)` → 200 `{valid, shopName, shopLogo}` (ไม่คืน shopId ถ้า invalid; ไม่รั่วเหตุผลละเอียด). POST accept: require session (401 ถ้าไม่มี) → rate-limit per-IP (reuse `checkApiRateLimit`) → `acceptInviteLink(slug, user.id)` → 200 `{shopId}`. map throws: LINK_INVALID→410, ALREADY_OWNER→409, ADMIN_QUOTA_EXCEEDED→409. **หมายเหตุ:** set activeShopId ทำฝั่ง client ผ่าน `session.update({activeShopId})` (RSC/route set JWT ไม่ได้ตรง — เหมือน switch-context เดิม).
- [ ] **Step 2:** QA authenticated-curl — resolve valid/expired, accept happy/quota/already-member.
- [ ] **Step 3:** Controller commit `feat(00012): public invite resolve + accept API`

---

## Phase 3 — Lazy Personal shop (invariant change) ⚠️ สูงเสี่ยง

### Task 3.1: auth.ts — แยก "เป็น seller ตั้งใจ" ออกจาก needsRegistration/needsOnboarding
**Files:**
- Modify: `src/lib/auth.ts` (jwt callback ~563-564, session callback ~600-639)

**Interfaces (Produces):** session/token flags ใหม่:
- `isShop` (มีอยู่) = true เฉพาะเมื่อ user มี Personal shop จริง
- `needsOnboarding` = true **เฉพาะเมื่อ** user มี Personal shop ที่ slug ว่าง (ตั้งใจเป็น seller แต่ยัง setup ไม่เสร็จ) — **ไม่ใช่** `!shopSlug` เปล่า ๆ
- `needsRegistration` = คงเดิม (`!phone`) แต่ **ยกเว้น** invited-only user (มี ShopMember business แต่ไม่มี Personal) — invited user ไม่ควรโดนบังคับ /register ถ้า accept ผ่าน social ที่ไม่มีเบอร์? → **ยืนยัน rule กับ user** (ดู open item). Default: invited-only user ที่ไม่มีเบอร์ → **ไม่บังคับ** register (ให้เข้าร้านได้), บังคับเฉพาะตอนกด "เปิดร้านของฉัน"
- เพิ่ม `hasAnyShopMembership: boolean` (มี ShopMember ≥1 แถว) เพื่อให้ proxy/หน้าตัดสินได้

- [ ] **Step 1:** ใน session callback: query `shopMemberships` (count) + Personal shop. คำนวณ: `hasPersonal = !!personalShop`, `needsOnboarding = hasPersonal && !personalShop.slug`, `needsRegistration = !phone && hasPersonal` (invited-only ไม่โดน). expose `hasAnyShopMembership`.
- [ ] **Step 2:** jwt callback: mirror logic (token.needsOnboarding / needsRegistration ใช้ค่าเดียวกัน) — คง comment อธิบาย "ทำไม" (ไทย).
- [ ] **Step 3:** tsc + QA: login เป็น (a) seller เดิมมี slug → ไม่เด้ง; (b) seller ใหม่ไม่มี slug → เด้ง onboarding; (c) invited-only (mock ShopMember, no Personal) → เข้า /dashboard ได้ไม่โดนเด้ง.
- [ ] **Step 4:** Controller commit `feat(00012): auth flags แยก invited-only ออกจาก onboarding gate`

### Task 3.2: ถอด ensurePersonalShop auto-create ออกจาก layouts
**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/layout.tsx:39` (ลบ `await ensurePersonalShop`)
- Modify: `src/app/(paces)/seller/(fullscreen)/layout.tsx:38`
- Modify: `src/lib/shop-context.ts` — `requireActiveShop` ต้องคืน active business context ได้แม้ไม่มี Personal (ปัจจุบัน fallback Personal → null ถ้าไม่มี). เพิ่มกรณี: activeShopId ชี้ business ที่ user เป็น member → คืน business context โดยไม่ต้องมี Personal.

- [ ] **Step 1:** layout: แทน `ensurePersonalShop` ด้วย logic: resolve `requireActiveShop`; ถ้า `null` (ไม่มีทั้ง active + Personal + membership) → redirect `/choose-shop` (Task 4.1) ซึ่งจะพาไป "เปิดร้าน" หรือ list ร้าน.
- [ ] **Step 2:** `resolveActiveShopContext`: เมื่อ `activeShopId` null และไม่มี Personal → แทนคืน null เฉย ๆ ให้ caller หา membership แรก (business) แทน. เพิ่ม helper `getFirstShopContext(userId)` คืน active context จาก ShopMember แรกถ้าไม่มี Personal.
- [ ] **Step 3:** tsc + QA regression: seller เดิม (มี Personal) เข้า /dashboard ปกติ; invited-only เข้า /dashboard เห็น business workspace.
- [ ] **Step 4:** Controller commit `feat(00012): Lazy Personal shop — ถอด auto-create, resolve business-first`

### Task 3.3: proxy.ts — ปรับ force-redirect gate ให้ไม่ดัก invited-only
**Files:**
- Modify: `src/proxy.ts:98-115` (seller subdomain gate)

- [ ] **Step 1:** gate `needsRegistration`/`needsOnboarding` ใช้ค่าใหม่จาก Task 3.1 (invited-only = false ทั้งคู่) → invited user ไม่โดนเด้ง /register หรือ /onboarding. เพิ่ม exempt path `/choose-shop` และ `/i` (landing) จาก gate.
- [ ] **Step 2:** QA: invited-only user เข้า seller subdomain ทุก route ไม่โดน redirect loop.
- [ ] **Step 3:** Controller commit `feat(00012): proxy gate ยกเว้น invited-only + /choose-shop + /i`

### Task 3.4: proxy.ts — main domain `/i/*` redirect → seller subdomain
**Files:**
- Modify: `src/proxy.ts` (MAIN domain block ~74-90)

- [ ] **Step 1:** ใน `subdomain === 'main'`: ถ้า `pathname.startsWith('/i/')` → `NextResponse.redirect` ไป `https://seller.<rootDomain>/i/<slug>` (prod `seller.deepthailand.app`, dev `seller.deepth.local:PORT`). derive root domain จาก host (reuse `getSubdomain`/`src/lib/subdomain.ts`). ต้องไม่โดน block `/seller` rule.
- [ ] **Step 2:** QA: `curl -I deepth.local:4000/i/abc` (main) → 307/302 ไป seller subdomain.
- [ ] **Step 3:** Controller commit `feat(00012): proxy main /i/* → seller subdomain redirect`

---

## Phase 4 — UI (ต้องผ่าน safepay-ux ก่อนทุก task)

### Task 4.1: หน้า `/choose-shop` + "เปิดร้านของฉัน" flow
**Files:**
- Create: `src/app/(paces)/seller/(fullscreen)/choose-shop/page.tsx` (RSC)
- Create: `src/app/(paces)/seller/(fullscreen)/choose-shop/components/ChooseShopClient.tsx`
- Create: `src/app/api/shops/open-personal/route.ts` (POST — สร้าง Personal shop lazily = `ensurePersonalShop` + set isShop=true → คืน `{shopId}` แล้ว client set activeShop + ไป /onboarding)

**safepay-ux ก่อน:** Design Spec หน้า choose-shop (Base: theme card/grid) + สถานะ 0/1/หลายร้าน.

- [ ] **Step 1 (ux):** invoke `safepay-ux` — เลือก Base จาก Paces (card grid). ยืนยัน icon กับ user.
- [ ] **Step 2 (dev):** RSC: resolve `ShopMember[]` + Personal. **0 ร้าน** → การ์ด "เปิดร้านของฉัน" + ช่องวางลิงก์เชิญ. **1 ร้าน** → auto `redirect('/dashboard')` (ไม่แสดงหน้านี้). **≥2** → grid เลือกร้าน. เลือกร้าน → client `session.update({activeShopId})` → `/dashboard`. "เปิดร้านของฉัน" → `POST /api/shops/open-personal` → `session.update` → `/onboarding`.
- [ ] **Step 3 (review+qa):** `safepay-reviewer` 8-gate + `safepay-qa` (grep emoji=0, react-toastify=0). QA ด้วย user dev server.
- [ ] **Step 4:** Controller commit `feat(00012): choose-shop + open-personal (become seller)` + `Base:` line

### Task 4.2: landing `/i/[slug]` (login/register + accept)
**Files:**
- Create: `src/app/(paces)/seller/i/[slug]/page.tsx` (RSC — resolve link, ไม่รั่ว PII)
- Create: `src/app/(paces)/seller/i/[slug]/components/InviteLandingClient.tsx` (login buttons / accept button)
- Create: `src/app/(paces)/seller/i/invalid/page.tsx` (error กลาง ๆ)

**safepay-ux ก่อน:** Base = Paces `auth/split` / AuthCardShell (เดียวกับ onboarding). states: not-logged-in (social buttons FB/LINE/OTP, callbackUrl กลับ `/i/<slug>`), logged-in (accept button), invalid.

- [ ] **Step 1 (ux):** invoke `safepay-ux`. ยืนยัน icon.
- [ ] **Step 2 (dev):** RSC: `resolveInviteLink(slug)` → invalid → render invalid state. valid + session → accept button (`POST /api/i/<slug>/accept` → `session.update({activeShopId})` → `/dashboard`). valid + no session → social login buttons (reuse ปุ่ม auth เดิมจาก seller `auth/sign-in`) ด้วย `callbackUrl=/i/<slug>`.
- [ ] **Step 3 (review+qa):** reviewer + qa (real route + simulated social/OTP `0000000009`/`123456` dev-only).
- [ ] **Step 4:** Controller commit `feat(00012): invite landing /i/[slug] login+accept` + `Base:`

### Task 4.3: เมนูซ้าย "พนักงาน" + หน้า `/admins`
**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` (เพิ่ม item + `applyStaffMenu` transform — แสดงเฉพาะ BUSINESS+OWNER)
- Modify: `src/app/(paces)/seller/(dashboard)/layout.tsx` (เรียก `applyStaffMenu(items, active)` เหมือน applyInventoryGate)
- Create: `src/app/(paces)/seller/(dashboard)/admins/page.tsx` (RSC — list members + active links, PII-masked)
- Create: `src/app/(paces)/seller/(dashboard)/admins/components/InviteLinkCard.tsx` (สร้าง/คัดลอก/revoke + เลือกอายุ)
- Create: `src/app/(paces)/seller/(dashboard)/admins/components/MembersTable.tsx` (reuse pattern `CurrentMembersTable`)
- Modify: `src/app/(paces)/seller/(dashboard)/getSellerPageTitle.ts` (เพิ่ม title `/admins` = "พนักงาน")

**safepay-ux ก่อน:** Base = Paces card + table. **icon เมนู `tabler-users-group` (ยืนยัน user)**. toast = `pacesToast` (คัดลอกสำเร็จ top-right), revoke confirm = Swal.

- [ ] **Step 1 (ux):** invoke `safepay-ux`. ยืนยัน icon เมนู + icon ปุ่ม.
- [ ] **Step 2 (menu):** เพิ่ม item `{ url:'/admins', slug:'seller:admins', label:'พนักงาน', icon:'users-group' }` ใน section CUSTOMERS หรือ STORE. เขียน `applyStaffMenu(items, {kind,role})` — ถ้าไม่ใช่ BUSINESS+OWNER → กรอง item ออก (return items ไม่มี admins). verify icon มีจริง (api.iconify.design/tabler.json — ตาม comment เดิมใน _seller-menu).
- [ ] **Step 3 (page):** RSC guard `active.kind==='BUSINESS' && role==='OWNER'` else `notFound()`. list `ShopMember` (join user displayName/avatar) + `listActiveInviteLinks`. mask PII. render MembersTable (remove = owner-only, ลบตัวเอง/owner ไม่ได้ — reuse `removeShopMember` service + existing `RowActionDeleteButton` pattern) + InviteLinkCard.
- [ ] **Step 4 (review+qa):** reviewer grep gates (emoji=0, react-toastify=0, arbitrary-value=0, Base: line) + qa (create link → copy → revoke → remove member).
- [ ] **Step 5:** Controller commit `feat(00012): เมนูพนักงาน + หน้า /admins` + `Base:`

### Task 4.4: Deprecate contact-match invite UI/API (ซ่อน ไม่ลบ DB)
**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/page.tsx` — เปลี่ยนเป็น redirect → `/admins` (หรือลบ InviteMemberForm + PendingInvitesTable, เหลือ CurrentMembers)
- Modify: TopBar dropdown `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx` — ลิงก์ "จัดการสมาชิก" ชี้ `/admins`
- **ไม่แตะ** `src/services/shop-member.service.ts` `inviteShopMember/acceptShopInvite` (คงไว้ dead แต่ไม่ drop; ปิด API route ด้วย 410 gone หรือคงไว้ — ตัดสินใน review)

- [ ] **Step 1:** redirect หน้าเดิม → `/admins`; อัปเดตลิงก์ทุกจุดที่ชี้ `/business/[shopId]/invites`.
- [ ] **Step 2:** reviewer verify ไม่มี dead link; qa หน้าเดิม redirect ถูก.
- [ ] **Step 3:** Controller commit `refactor(00012): เลิก contact-match invite UI → รวมที่ /admins`

---

## Phase 5 — Integration QA + docs sync + retro

### Task 5.1: E2E happy path (user dev server)
- [ ] `safepay-qa` Playwright/Chrome-DevTools E2E: owner สร้างลิงก์ → เปิดลิงก์ (incognito/2nd account) → social login → accept → เข้า business dashboard เป็น admin → ไม่มี Personal shop (ไม่เป็น seller) → กด "เปิดร้านของฉัน" → onboarding → มี Personal → /choose-shop แสดง 2 ร้าน.
- [ ] แก้ bug ที่เจอ (loop จนเขียว). evidence screenshots.

### Task 5.2: Docs sync + retro
- [ ] `safepay-docs`: อัปเดต CLAUDE.md Current State + PRD/SRS 00012 + memory (`project_shop_staff_invite_resume`).
- [ ] `phase-retro`: เขียน retro `docs/retro/2026-07-04-shop-staff-invite-link-retrospective.md`.
- [ ] Controller commit + **แจ้ง user ก่อน push/merge** (ห้าม auto-push main — feedback_subagent_git_scope_violation).

---

## Open items (ต้องยืนยัน user ก่อน task ที่เกี่ยว)
1. **icon** เมนู "พนักงาน" (`tabler-users-group`?) + icon ปุ่ม copy/revoke/social — Hard Rule 12.
2. **invited-only ที่ไม่มีเบอร์:** บังคับ verify เบอร์ก่อน accept ไหม? (default = ไม่บังคับ, ให้ social ล้วนเข้าได้)
3. **API contact-match เดิม** (`inviteShopMember`/`/api/business/.../invites` POST): ปิด 410 หรือคงไว้ dead? (default = คง service, redirect UI)

## Self-Review notes
- Spec coverage: ทุก §ใน design spec map ครบ (model=1.1, link=1.2, service=1.3, API=2.x, landing=4.2, lazy-shop=3.x, choose-shop=4.1, menu/list=4.3, deprecate=4.4, docs=0.1/5.2).
- Type consistency: `acceptInviteLink→{shopId}`, `resolveInviteLink→{valid,shopName,shopLogo,shopId?}`, `createInviteLink→{slug,expiresAt}` ใช้สม่ำเสมอ.
- ⚠️ ความเสี่ยงหลัก = Phase 3 (Lazy shop) — audit (0.2) ต้องเสร็จก่อน; regression test seller เดิมทุก task.

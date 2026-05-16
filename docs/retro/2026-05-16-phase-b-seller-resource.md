# Phase B Retrospective — Seller-side Re-source S1–S20 (2026-05-16)

**Scope:** Re-source ทั้งฝั่ง seller (`src/app/(paces)/seller/**`) จาก hand-composed off-theme → Paces theme ตาม `docs/system/ui-guideline/seller/page-sourcing.md` (เทียบเท่า R1–R11 buyer/Vuexy แต่ฝั่ง Paces). รวม Phase A (restructure UI guideline → folder tree) นำหน้า.

**Outcome:** S1–S20 re-source ครบ + Phase A guideline tree + systemic buyer-route sweep + #12 infra + retro-QA + 3 PDPA fix + **ค้นพบ&ปิด CRITICAL prod auth-bypass** + shop-name onboarding. B9 end-of-phase QA: seller UI **GREEN ทุกหน้า** (auth journey จริงผ่าน browser, 14 หน้า on-theme + real data + Anuphan + zero console). ~40+ commits ของ Phase B (จาก ~80 รวม parallel OMS).

**Pattern ที่ใช้:** agent-team-phase (Planner→Developer→Reviewer→QA→Controller, 5 gates) ต่อ batch B0–B9, batch ≤3 concurrent.

---

## Problems + Root causes + Evidence

### P1. Tailwind v4 oxide สแกน `docs/**/*.md` → literal `bg-[url()]` ใน retro/comment พังทั้ง group (เกิดซ้ำ 2 รอบ)
- Evidence: B1 `533fefa` (แก้ comment เดียว = symptom), กลับมาอีกที่ `docs/retro/...achievements-phase4.md` → root fix `a8b945b`.
- **Root cause:** `@import "tailwindcss"` ใน app.css/marketing.css → Tailwind v4 auto-content-detection สแกนทั้ง repo รวม `.md`. retro/convention ที่ "อธิบายบั๊ก" โดยพิมพ์ literal class จึง re-trigger บั๊กนั้นเอง. symptom-fix (ลบ literal ทีละจุด) ไม่ยั่งยืน — ต้อง exclude docs ที่ระดับ build config.

### P2. env split-brain → QA "real data" เชื่อไม่ได้ (B3 blocker วินิจฉัยผิดว่าเป็น code)
- Evidence: B3 AchievementLevel แสดง `0/0 badges`, reviewer/QA คิดว่า code bug; จริง ๆ Next.js SSR อ่าน Supabase (`.env.local`) แต่ QA tsx อ่าน Docker (`.env`) — Supabase ไม่ถูก seed. Fix `c37c93d` + `docs/conventions/seed-and-env.md`.
- **Root cause:** ไม่มีเอกสารระบุ DB ไหนคือ authoritative + วิธี seed ให้ตรง DB ที่ dev server อ่าน. `silent catch {}` ใน dashboard/page.tsx ซ่อน error (แก้เป็น `catch(e){console.error}`).

### P3. seed.ts FK P2003 บน Supabase + `tests/setup.ts` อาจ wipe Supabase
- **Root cause:** `Promise.all(product.create())` ไม่ปลอดภัยกับ pgbouncer transaction mode (parent ไม่ visible ข้าม pooler session) + `cleanDatabase()` ไม่มี guard กัน DATABASE_URL ที่ชี้ Supabase. Fix: sequential creates + DIRECT_URL + hard guard throw ถ้า DATABASE_URL=supabase.

### P4. (CRITICAL/systemic) bare-route nav → seller login พังทั้ง flow
- Evidence: B7 browser QA — OTP สำเร็จ → `router.push('/dashboard')` → buyer `/dashboard` → เด้ง buyer `/auth/sign-in`. 26 nav fix / 15 ไฟล์ `eee83fb` + convention `befb8b1` + เก็บ extra-2 + sidebar `_seller-menu` + dashboard layout.
- **Root cause:** reviewer S4/S12 ตัดสินว่า bare route "proxy-safe" โดย**สมมุติ ไม่ verify**. `src/proxy.ts` `NextResponse.rewrite` ครอบแค่ cold HTTP GET (address bar / `<a>` / sidebar) — **ไม่ครอบ client `router.push`/server `redirect()`**. assumption ผิดนี้แพร่ข้ามหลาย batch.

### P5. PDPA leak 3 จุด (raw buyer contact ใน RSC payload)
- Evidence (retro-QA seeded DB): `customers` key=buyerContact ดิบ ใน `__next_f`; `dashboard` buyerLabel ดิบ → RecentOrder client; `products/[id]` email mask อ่อน (`jo***@gmail.com`). UI mask แต่ page-source เห็นเบอร์เต็ม.
- **Root cause:** masking ทำที่ "display" ไม่ใช่ที่ "RSC→client boundary" — raw PII ข้ามไป client แล้วค่อยปิดบังตอน render. แก้: hash row-key, mask ก่อน prop ข้าม boundary, มาตรฐาน maskContact เดียวกัน. safepay-security SECURITY-PASS หลังแก้.

### P6. (CRITICAL) hardcoded credential bypass auth ใน production
- Evidence: `0000000001`/`123456` ใน `prisma/seed.ts` (commit แล้ว) + `verifyOtp` bypass **unconditional ไม่มี NODE_ENV guard** → authenticate เป็น seller "BT Premium" ได้ทุก env รวม prod. ค้นพบตอนขยาย bypass ไป `/api/otp/send` เพื่อปลดล็อก browser E2E. safepay-security = SECURITY-FAIL → fix `a6afee6` (`TEST_ACCOUNTS = NODE_ENV==='production' ? {} : {...}`).
- **Root cause:** test bypass ไม่ถูก env-gate ตั้งแต่แรก + credential ถูก commit. การขยาย bypass โดย "mirror model เดิม" = ขยาย vulnerability โดยไม่รู้ตัว — security ต้อง gate ก่อน ไม่ defer.

### P7. shopName collected→dropped (S3) ต้อง defer แล้ว wire ทีหลัง (task #9)
- **Root cause:** dev S3 เพิ่ม field โดยไม่ wire ครบ chain → reviewer จับได้ field หายเงียบ. ตัดสินใจ: ตัด field คง S3 เป็น pure re-source, defer full wiring → task #9 (ต้อง + server-side length guard + `$transaction` ตาม security/reviewer).

### P8. parallel OMS refactor (Task 6–10) = collateral นอก Phase B
- Evidence: B9 `POST /api/orders` 500 (createOrder service), seed.ts/admin-orders tsc errors (`fulfillmentMode`/status remap). commits `b7924f3`/`d3afd3d`/`09d57bb`/`44d1d86`...
- **Root cause:** OMS stream refactor backend (status COMPLETED→CONFIRMED + fulfillmentMode + state-machine cutover) คนละ track กับ Phase B (UI theme-copy). order-API 500 ไม่ใช่ Phase B defect — track ให้ OMS stream.

### P9. reviewer noise: "ยังไม่ commit = Hard Rule 3 FAIL" ซ้ำ ๆ
- ทุก batch reviewer flag working-tree-uncommitted เป็น gate-1 FAIL. เป็น artifact (Controller commit ที่ integrate gate) ไม่ใช่ defect.

---

## Conventions to adopt

### C1. proxy ไม่ใช่ redirect/nav safety-net — explicit `/seller/*` เสมอ (CRITICAL-class)
ทุก `router.push/replace`, server `redirect()`, `<Link href>`, `cancelHref`, `signOut({callbackUrl})` ใน `(paces)/seller/**` ที่ชี้ route ใต้ `/seller/**` ต้องเขียน `/seller/...` explicit. proxy rewrite ครอบแค่ cold HTTP. ข้อยกเว้น: `/u`,`/o` = absolute buyer-domain (`resolveBuyerBaseUrl`); `/api/*` agnostic; `?query` relative. → อยู่ใน `docs/system/ui-guideline/seller/page-sourcing.md` แล้ว.

### C2. ห้าม literal Tailwind arbitrary-value token (`bg-[url()]` ฯลฯ) ในไฟล์ที่ Tailwind สแกน รวม comment/docs
root-protected: `@source not "../../../docs"` ใน app.css + marketing.css. reviewer ยัง grep `bg-[` ใน comment ของไฟล์ที่แตะ.

### C3. PII mask ที่ RSC→client boundary ไม่ใช่ที่ display
ห้ามส่ง raw phone/email ใน prop/key/field ใด ๆ ที่ข้าม RSC→client. identity ใช้ hash (sha256 server-side). เฉพาะ masked string (`••••1234`) เท่านั้นที่ข้ามได้. → `docs/conventions/security-conventions.md`.

### C4. test-account bypass ต้อง NODE_ENV-gated (prod-dead) เสมอ
ห้าม ship hardcoded credential ที่ authenticate ได้ใน production. gate ที่ source-of-truth (`TEST_ACCOUNTS = NODE_ENV==='production' ? {} : {...}`) ให้ตายทั้ง verify + send path พร้อมกัน. → security-conventions.md.

### C5. QA ต้องรันบน DB เดียวกับที่ dev server อ่าน
seed: `npm run seed:supabase`. browser E2E: TEST_ACCOUNTS send-bypass (dev only). → `docs/conventions/seed-and-env.md` (มีแล้ว).

### C6. reviewer ต้อง verify routing/"proxy-safe" claims เชิงประจักษ์ ไม่สมมุติ
อย่ารับ "proxy จะ handle" โดยไม่อ่าน proxy.ts + ไม่ทดสอบ flow จริง. P4 เกิดเพราะ assumption แพร่ข้าม batch.

### C7. input ข้าม auth boundary ต้อง server-side validate แม้ frontend validate แล้ว
`credentials.*` ใน NextAuth authorize() = untrusted (bypass Yup ได้). length/charset guard ก่อน DB write เสมอ.

### C8. multi-write ที่ต้อง consistent → `prisma.$transaction`
shop.create + user.update(isShop) แบบ non-atomic = partial-fail กู้ไม่ได้ (unique constraint บล็อก recreate). wrap transaction.

### C9. reviewer pre-commit: ประเมิน code + JSDoc-Base ไม่ใช่ commit body
working-tree uncommitted ไม่ใช่ Hard Rule 3 FAIL — Controller commit ที่ integrate gate. (→ ปรับใน agent-team-workflow §reviewer)

---

## What went right (anchor — ทำซ้ำ)

1. **Front-load conventions + Explore (B0 E1/E2)** — ก่อนแตะโค้ด: guideline tree (Phase A) + Explore แก้ ambiguous source (S18 SellerStatisticCard→AddCategoryModal, S19 no-Paces-fullscreen). developer agent cite path ได้เลย ไม่เดา.
2. **Independent reviewer จับ defect จริงทุก batch** — fake-data widgets (S5), dead code (S6/S9), mis-Base (S3), type-safety (S15), the proxy-assumption, PDPA. type-check/smoke จับไม่ได้.
3. **safepay-security จ่ายค่าตัวเอง** — ค้นพบ CRITICAL prod auth-bypass + 3 PDPA + บังคับ hardening (length guard, $transaction) ก่อน commit. การ mandate-before-commit (ไม่ defer) ถูกต้อง.
4. **retro-QA หลังแก้ #12 (seeded DB)** — เปิดโปง 3 defect ที่ env-gap เคยบัง. พิสูจน์หลักการ "แก้ infra ให้ QA เชื่อได้ก่อน แล้วค่อย QA ใหม่".
5. **ฝังบทเรียนสะสมใน dev prompt ทุก batch** — B4/B5 rework รอบน้อยลงกว่า B3 (no-fake-data, no-arbitrary-class, /seller/* embedded).
6. **atomic per-task commit + Base: line** — auditability เต็ม; grep `Base:` trace ทุกไฟล์ → theme source.
7. **Controller แยก RED-env vs RED-code** — ไม่ทิ้ง defect เงียบ, ไม่ block phase ด้วย env/parallel-track issue.

---

## Action items (numbered, concrete)

1. **[OMS-track, ไม่ใช่ Phase B]** fix `POST /api/orders` 500 + seed.ts/admin-orders tsc errors — collateral จาก OMS Task 6–10 (status remap + fulfillmentMode + state-machine). ส่งให้ OMS stream เจ้าของ.
2. extract shared `maskContact` util (ตอนนี้ inline ซ้ำ 4 จุด: customers, CustomerDetails, dashboard, products/[id]) — DRY + จุด harden เดียว.
3. typed session shape — kill systemic `(session as any)?.user` ทุก seller page.
4. `getOrderByToken` เพิ่ม `buyer` include → ชื่อ registered buyer ขึ้นบน order detail.
5. seed badge naming ("Seller/Buyer/Any Audience Badge") → ตรง PRD achievement system.
6. ตัดสิน StatStrip keep-vs-delete (orphaned, zero importer หลัง S6/S9/S13 migrate).
7. ตัดสิน dashboard stat "ออเดอร์" นับรวม cancelled หรือไม่ (product decision).
8. `createShop`/`CreateShopSchema` รับ `logo`; route auth.ts shop-create ผ่าน `shop.service` (จุด atomic เดียว).
9. S7 per-order review card (ถูก drop เพราะ theme ไม่มี) — ตัดสิน reinstate vs accept.
10. maskContact อ่อนกับ email (โชว์ TLD 4 ตัวท้าย) — harden ถ้าจำเป็น (security ว่า low-risk).
11. fix `(session as any)` + nested-`any` cast เป็น tech-debt sweep แยก.

---

## Retro of the retro

จุดที่ทำให้ Phase B รอด: **independent reviewer + safepay-security + retro-QA-after-infra-fix**. สามชั้นนี้จับสิ่งที่ type-check/smoke/single-thread มองไม่เห็น — โดยเฉพาะ CRITICAL prod auth-bypass (P6) ที่ถ้าไม่มี security gate จะ ship ขึ้น prod. บทเรียนใหญ่: **อย่าสมมุติ infra/proxy/env ปลอดภัย — verify เชิงประจักษ์** (P4 proxy, P2 env, P6 bypass ล้วนเกิดจาก assumption ที่ไม่ verify). ฝังบทเรียนใน dev prompt ทุก batch ลด rework จริง — convention-as-prompt-input ได้ผลเท่ากับ convention-as-doc.

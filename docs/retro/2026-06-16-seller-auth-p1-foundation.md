# Retro — Seller Auth P1 (Backend/Security Foundation)

> phase: P1 ของ feature Seller Auth Redesign + Onboarding · สถานะ: SIGNED-OFF 2026-06-16
> commits: 850bb0e..78ebba4 (S-P1-1..11 + Gate0/Gate2) · baseline `docs/scope/2026-06-16-seller-auth-scope-baseline.md`

## Problems

1. **Migration target กำกวม — เกือบ apply ผิด DB / เกือบทำ session พังบน prod**
   - `npm run migrate` script ชี้ `.env` (localhost Docker) แต่ `.env` **ไม่มี `DIRECT_URL`** → `prisma migrate dev` fail (P1012) ที่ Docker.
   - DB จริงที่ dev app + prod ใช้ = **`.env.local` → Supabase** (`aws-1-ap-southeast-1.pooler.supabase.com`) ซึ่ง **dev=prod ตัวเดียวกัน** (memory `project_prod_deploy_setup`).
   - committed code (S-P1-11 session callback) query `shop.slug` ทันที — ถ้า migration ไม่ apply ลง Supabase → session ของ seller ที่ login = 500 (column does not exist). evidence: `git diff src/lib/auth.ts` session select + `prisma migrate deploy` log.

2. **Reviewer 2 ตัวขัดกัน (security PASS vs reviewer REWORK) เรื่อง `!isShop` guard**
   - safepay-security: buyer-login-via-seller-credentials = PASS (unified-account architecture).
   - safepay-reviewer: REWORK — baseline S-P1-9 acceptance เขียน "reject **non-seller**" → code ต้องมี `if (!user.isShop) return null`.

3. **Parallel streams ใน repo เดียว** — มี order-detail stream (user/linter แก้ `CancelOrderButton`/`SendSmsButton`/`OrderSummary` ฯลฯ + commit 9d6e41e/d523452 แทรก) + worktree `home-redesign` ที่ vitest glob เก็บ test (`.claude/worktrees/home-redesign/.../report.service.test.ts` 2 fail) ปนผล. pre-existing `auth.ts` (`+email:true`) ค้างใน working tree ตั้งแต่ session เริ่ม.

## Root causes

1. **ทำไม migration กำกวม:** `.env` ถูกตั้งค่าไม่ครบ (ไม่มี DIRECT_URL) + dev/prod แชร์ Supabase → "dev DB" ไม่ใช่ sandbox จริง. การ assume ว่า `migrate` script (`-e .env`) = sandbox จึงผิด. **ต้อง verify host ของแต่ละ env ก่อนรัน DB command เสมอ** (เคยมีบทเรียน `feedback_verify_dont_assume`).
2. **ทำไม reviewer ขัดกัน:** security ประเมินจาก "มี vuln ไหม", reviewer ประเมินจาก "ตรง acceptance ใน baseline ไหม" — คนละเกณฑ์ ทั้งคู่ถูกในมุมตัวเอง. **baseline acceptance = tiebreaker** (contract ชนะความเห็น).
3. **ทำไม parallel ไม่พัง commit เรา:** เพราะ stage explicit per-file ทุก commit (ไม่เคย `git add -A`) — ตรงบทเรียน `feedback_parallel_dev_agents_no_commit` + `feedback_lock_contract_before_parallel`.

## Conventions to adopt

1. **ก่อนรัน prisma migrate/db command ใด ๆ บนโปรเจกต์นี้: verify `DATABASE_URL` host ของ env ที่จะใช้ก่อน** (`.env`=localhost Docker [ไม่มี DIRECT_URL → ใช้ migrate ไม่ได้], `.env.local`=Supabase=**dev/prod แชร์**). apply ลง Supabase = touch prod → **ต้องขอ user ยืนยันก่อน**. apply ด้วย `dotenv -e .env.local -- npx prisma migrate deploy` (deploy = apply pending เท่านั้น ไม่ reset).
2. **เมื่อ code commit ใหม่ query column ที่เพิ่งเพิ่มจาก migration → ต้อง apply migration ลง DB ที่ running app ใช้ ก่อนถือว่า phase ใช้งานได้** (ไม่งั้น runtime 500 แม้ unit test เขียว). ลำดับ: schema edit → generate (types) → code → **apply migration to running DB** → live smoke.
3. **เมื่อ safepay-security กับ safepay-reviewer ให้ verdict ขัดกัน → ยึด acceptance ใน scope baseline เป็นตัวตัดสิน** (ถ้า baseline ไม่ครอบ → Controller ตัดสิน + จด Change Log).

## What went right (anchor — ทำซ้ำ)

- **แตก pure helper (shop-categories/shop-slug/password) ออกจาก provider/route** → TDD สะอาด (unit test ครอบ logic จริง), provider/route แค่ wire → integration-verify พอ. 18 P1 unit tests เขียวก่อนแตะ auth.ts.
- **Scope baseline (Gate 0) + S-id mapping** → zero creep ตลอด phase; ShopForm.tsx ripple ถูก classify เป็น justified (baseline เขียน assumption ไว้ล่วงหน้า).
- **set-password route ใต้ `/api/account/*` ไม่ใช่ `/api/auth/*`** → ได้ guardApi CSRF/rate-limit (ถ้าเผลอวางใต้ /api/auth/ จะ bypass). Controller จับตอนเขียน plan.
- **stage per-file ทุก commit** → parallel stream (order-detail + worktree) ไม่ปนเข้า commit P1 เลย.
- **live smoke ปิดท้าย** (set-password 200 → ตรวจ passwordHash+isShop+bcrypt verify) → พิสูจน์ chain จริงเหนือ unit test.

## Action items

1. ✅ apply `20260616000000_add_shop_slug` ลง Supabase (ทำแล้ว, user อนุมัติ).
2. ⏭️ **P2 (UI, ต้องผ่าน safepay-ux):** 5 หน้า auth จาก Paces `auth/card/*` + ปุ่ม Facebook + **wiring `signIn('seller-credentials')`** (provider พร้อม แต่ยังไม่มี form เรียก — security observation) + 60s OTP countdown. **+ requirement ใหม่จาก user: ทุกหน้าต้อง mobile-friendly** → ใส่เป็น acceptance ใน safepay-ux Design Spec + QA mobile viewport.
3. ⏭️ **PRD doc-sync (safepay-docs):** FR-1/U-1 เขียน "ไม่มี Email+Password ใน MVP" — ขัดกับ seller-credentials → อัปเดต.
4. ⏭️ **P2+ hardening (security notes, accepted-risk):** rate-limit key เป็น `provider:username`; per-phone throttle บน set-password; Redis OTP/rate-limit.
5. ⏭️ **P3:** onboarding modal stepper (ref images `docs/superpowers/specs/assets/2026-06-16-onboarding-ref/`).

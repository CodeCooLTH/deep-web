# Retro — Admin Username+Password Auth (2026-05-17)

## Scope

เปลี่ยน admin login จาก Phone OTP → username+password (buyer/seller ไม่แตะ). 4 task, agent-team workflow (Planner→Developer→Reviewer→Security→QA→Controller).

- `fc3e19b` T1 — `User.passwordHash String?` + migration
- `3eec4b2` T4 — seed admin จาก env `ADMIN_DEFAULT_PASSWORD`
- `22aed8d` T2 — `admin-credentials` CredentialsProvider (rate-limit + isAdmin guard)
- `6b4618b` T3 — sign-in UI username+password, ลบ FacebookButton/OAuthErrorToast

QA 9/9 PASS (TC1 form / TC2-3 error generic กัน enumeration / TC4 login success / TC4b wrong-pass / TC4c non-admin block / TC5-6 buyer+seller regression).

---

## Problems

### P1 — Subagent สลับ branch, T3 commit หลุดออก main
T3 commit (`add5407`) ลงบน branch `docs/seller-orders-handoff` แทน `main`. reflog: `HEAD@{2}: checkout: moving from main to docs/seller-orders-handoff` เกิดหลัง T2 commit — มี subagent (มี Bash) ทำ `git checkout` + commit `3a23b48` (docs/mockups deferred work) โดยไม่ได้รับมอบหมาย. กู้ด้วย `git checkout main && git cherry-pick add5407` → `6b4618b` บน main.

### P2 — T1 "done" แต่ migration ไม่ได้ apply ลง DB ที่ใช้จริง
T1 agent รายงาน done criteria ครบ (schema diff, migration file, `prisma generate`, `tsc:0`) แต่ migration **ไม่เคยถูก apply ลง DB ที่ dev server/seed ใช้จริง**. QA TC4 FAIL: `seed` ได้ `P2022 column User.passwordHash does not exist`. tsc ผ่านเพราะ generated client มี field — แต่ DB schema จริงไม่มี.

### P3 — DB target ความเชื่อ ≠ ความจริง (assumption miss)
ถาม user → ตอบ "dev server เชื่อม Supabase (.env.local)". apply migration + seed ลง Supabase. QA TC4 ยัง FAIL — QA empirical (docker exec) พบ dev server query **local Docker** (localhost:5432). ต้อง apply migration + seed ลง **ทั้งสอง** DB. (หมายเหตุ: memory `project_dev_db_and_paces_pitfalls` ระบุ dev อ่าน Supabase — ขัดกับ empirical รอบนี้; ภาพรวมคือ **ห้ามเชื่อ ต้อง probe DB จริงที่ runtime query**)

### P4 — Turbopack cache Prisma client เก่าหลัง schema change (QA FAIL 2 รอบ)
หลัง apply migration + seed ครบทั้ง 2 DB แล้ว TC4 ยัง FAIL. root cause: dev server เปิดอยู่ก่อน `prisma generate` → Turbopack cache compiled Prisma client เก่า (0 references `passwordHash` ใน `.next/dev/node_modules/@prisma/client-*/default.js`). `user.passwordHash` = `undefined`, `undefined == null` → guard ตัด → 401. แก้ด้วย user restart dev server (`rm -rf .next && prisma generate && npm run dev`). QA ต้องวนถึงรอบ 3 ถึงเขียว.

---

## Root causes

- **P1:** subagent prompt ไม่ได้ห้าม `git checkout`/branch ops ชัดเจน; Controller ไม่ได้ verify `git branch --show-current` หลัง commit (เห็น `[main ...]` กลายเป็น `[docs/... ...]` ตอน T3 commit ถึงรู้).
- **P2:** done-criteria ของ schema task เขียน "migration file สร้าง + tsc ผ่าน" ซึ่ง **proxy ที่ผิด** — ไม่ใช่ proof ว่า DB จริงมี column. `prisma migrate dev` ของ T1 agent ติด `DIRECT_URL` not found หรือชนกับ env resolution → migration file ออกแต่ไม่ apply ลง runtime DB.
- **P3:** เชื่อคำตอบ user เรื่อง infra แทนการ probe ตรงที่ query — ตรงกับ memory `feedback_verify_dont_assume` ("re-QA on real DB") แต่ยังพลาด.
- **P4:** ความรู้ที่หายไป — schema change ที่กระทบ generated client **ต้อง restart dev server** (Turbopack ไม่ hot-reload generated `@prisma/client`). ไม่มี checklist ขั้นนี้ก่อน QA.

---

## Conventions to adopt

1. **Schema-change task done-criteria เพิ่ม 2 ข้อบังคับ:** (a) apply migration ลง **ทุก DB ที่ dev server/seed อาจ query** (Supabase `.env.local` + local Docker `.env`) แล้ว verify ด้วย query `information_schema.columns` จริง — ไม่ใช่ tsc/migration-file; (b) ระบุใน report ว่า "ต้อง restart dev server ก่อน QA" ถ้า schema change กระทบ generated Prisma client.
2. **หลัง Prisma schema/generate change → ก่อน QA ต้อง restart dev server** (`rm -rf .next && npx prisma generate && npm run dev`). Turbopack cache generated client; hot-reload ไม่ครอบ. Controller แจ้ง user ขั้นนี้ก่อน dispatch QA ที่แตะ schema.
3. **Controller verify branch หลังทุก commit:** `git branch --show-current` ต้อง = branch ของ phase ก่อน mark task complete. subagent prompt (developer/reviewer/qa) เพิ่มบรรทัด "ห้าม `git checkout`/`git branch`/`git commit`/`git stash` — Controller เท่านั้นที่จัดการ git state".
4. **Infra/DB target = probe ที่ runtime query เสมอ** ไม่เชื่อคำตอบ user หรือ memory; QA ที่แตะ DB ต้องยืนยัน DB จริงที่ server connect (docker exec / `information_schema`) เป็นส่วนของ evidence.

---

## What went right (anchor — ทำซ้ำ)

- **Agent-team จับบั๊กก่อน commit:** reviewer + security (รอบ 1) จับ rate-limit ordering bug — rate-limit อยู่หลัง `isAdmin` check → username ที่ไม่ใช่ admin bypass rate-limit + unlimited DB probe. แก้รอบ rework ก่อน commit. นี่คือ value ของ 5-gate ที่ single-threaded build จะพลาด.
- **safepay-product flag PRD conflict ก่อนแตะโค้ด:** จับว่า request เดิม ("เปลี่ยน login ทั้งระบบ") ขัด PRD §2 U-1 → ถาม Controller จน scope แคบเหลือ admin-only เท่านั้น — กันการ build ผิดทั้ง phase.
- **Atomic commit + selective stage:** มี deferred T13 work ปนใน working tree ตลอด; stage เฉพาะไฟล์ task ทุก commit → ไม่มี cross-contamination บน main.
- **QA empirical ไม่ยอม PASS ลอย:** QA ปฏิเสธ assumption (Supabase) แล้ว docker-exec พิสูจน์ local Docker; รอบ 3 ยืนยัน HTTP 200 + session isAdmin จริง ไม่ใช่แค่ screenshot.

---

## Action items

1. ✅ (retro นี้) — เขียน convention #1–#4
2. Promote convention #2 (Turbopack restart หลัง schema change) → `docs/conventions/seed-and-env.md`
3. Promote convention #3 (Controller git-state ownership + subagent git ban) → `docs/conventions/agent-team-workflow.md`
4. memory `project_dev_db_and_paces_pitfalls` — เพิ่มว่า "dev DB target ขัดแย้งกันได้ → probe runtime เสมอ, apply migration ทั้ง 2 DB" (เสริม convention #1/#4)
5. ครั้งหน้า schema-change phase: Planner ใส่ "restart dev server + dual-DB migrate + verify information_schema" เป็น explicit step ใน plan ไม่ใช่ implicit

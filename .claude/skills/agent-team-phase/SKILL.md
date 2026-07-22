---
name: agent-team-phase
description: Use เมื่อจะเริ่ม phase ใด ๆ ใน SafePay/Deep ที่มี ≥3 tasks (P1,P2,R1-R11, multi-step build). บังคับ workflow Planner→Developer→Reviewer→QA→Controller แทน single-threaded build.
---

# Agent-Team Phase Orchestration — Hard Rule 4

phase ที่มี ≥3 tasks ห้าม build single-threaded. background: P1 build เดี่ยว พัง theme-copy 10 หน้าโดยไม่มี checkpoint (retro 2026-04-18-p1).

## Controller (main session) คือคนเดียวที่ commit / mark task complete

## Phase-level scope gates (3 จุด — เกาะ 3-level QA cadence)
product เป็นเจ้าของ scope ตลอด phase. Controller dispatch `safepay-product` ที่ 3 จุด:
- **Gate 0 — Scope Baseline** (ต้น phase, **ก่อน** Planner): dispatch product (baseline mode) → ได้เนื้อ baseline → Controller Write `docs/scope/<YYYY-MM-DD>-<phase-id>-scope-baseline.md` + commit. ทุก task ต้อง map กับ `S-id` ในไฟล์นี้.
  - **Pre-Gate-0 env/branch preflight (บังคับ ก่อน dispatch อะไรก็ตาม):**
    1. **worktree env** — ถ้าทำงานใน git worktree ที่ไม่ใช่ main repo dir ให้เช็ค `.env.local` มีจริง (`ls -la .env.local`). ถ้าไม่มี → migration/QA/dev รันไม่ได้ (บทเรียน 00003 P4, 00009 P3 — root cause เดียวกัน `.env.local` gitignore ไม่ copy ข้าม worktree). แก้ด้วยชี้ env จาก main repo (`dotenv -e <main-repo>/.env.local ...`) หรือ symlink ก่อนเริ่ม.
    2. **branch divergence** — `git fetch origin && git rev-list --left-right --count origin/main...HEAD`. ถ้า origin ล้ำหน้า (เลขซ้าย > 0) → sync ก่อน (บทเรียน 00009 P1: 47 commits หลุดจนตอน merge; 00012: `reset --hard` เกือบเสียงาน). ห้ามเริ่ม phase บน branch ที่ diverge โดยไม่รู้ตัว.
- **Gate 1 — Scope-diff** (ต่อ batch, **รวมกับ batch-integration QA**): dispatch product (scope-audit mode) พร้อม baseline path + `git diff --stat` + commit messages + task list. verdict `PASS|CREEP|GAP`. **CREEP/GAP = hard block** → Controller หยุด commit batch แล้วตัดสิน: (ก) ตัดงานเกิน / (ข) รับเข้า scope → product อัปเดต baseline + Change Log แล้ว re-audit / (ค) เลื่อน Phase 2.
- **Gate 2 — Sign-off** (ปลาย phase, **ก่อน** `phase-retro`): dispatch product (sign-off mode) พร้อม baseline + commit ทั้ง phase + ผล QA end-of-phase. ต้องได้ `SIGNED-OFF` (Controller flip สถานะใน baseline) ก่อน invoke `phase-retro`.

## 5 gates ต่อ task
1. **Plan** — dispatch `safepay-planner` → ได้ target↔theme mapping + atomic-commit boundary + **map ทุก task → `S-id` ใน Scope Baseline** (task ที่ไม่ map S-id ใด ๆ = ห้ามมี). ถ้าแผนมีแถว "ต้อง Explore: ..." → Controller dispatch Explore agent (subagent_type Explore หรือ general-purpose) แก้ให้ได้ theme path ที่แน่นอน แล้ว re-dispatch `safepay-planner` ก่อนเข้า Develop. ไม่มีแผน → ไม่ dispatch.
2. **Develop** — dispatch `safepay-developer` (prompt self-contained: goal / target path / theme source / content ไทย / constraints / done criteria / report format).
3. **Review** — dispatch `safepay-reviewer` (independent, ไม่ pre-bias). อย่า parallelize reviewer กับงานที่มันรีวิว.
4. **QA** — dispatch `safepay-qa` สำหรับ user-facing task (skip เฉพาะ pure-infra เช่น shell copy ไม่มี URL). ดู 3-level cadence.
5. **Integrate** — Controller อ่าน review+QA → pass/fail. fail → re-dispatch developer พร้อม findings. pass → commit + mark complete.

## Parallelism
- independent tasks (คนละไฟล์ ไม่มี dependency) → dispatch developer หลายตัวใน tool message เดียว
- batch ceiling: **3 concurrent developer agents**. ใหญ่กว่านั้น split sub-batch.
- dependent task → A → review → B.

## 3-level QA cadence
per-task smoke (หลัง review) → batch-E2E (ทุก ≤3 tasks, functional) → end-of-phase (full PRD FR walk + cross-subdomain). dispatch `safepay-qa` พร้อมระบุ level.

## จบ phase
ทุก task done + QA เขียว → **Gate 2 sign-off** (product คืน `SIGNED-OFF`, Controller flip สถานะ baseline) → invoke skill `phase-retro` ก่อน claim phase complete. ห้าม retro ถ้า sign-off = `BLOCKED`.

## ไม่ใช้ team
single-file single-concept change, exploration ที่ Grep/Read ตอบใน 30s, debugging ที่ Controller มี context ครบแล้ว.

## Deep reference (prompt templates เต็ม + scenario QA + TODO→task)
`docs/conventions/agent-team-workflow.md`

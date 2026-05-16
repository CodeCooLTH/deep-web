# Multi-Agent Team Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รวม 10-role master team เข้า agent system เดิม — เพิ่ม 4 subagents (`safepay-product/database/security/docs`), ขยาย 2 ตัว (`planner`/`reviewer`), 1 skill ใหม่, ขยาย convention doc + CLAUDE.md — ยึด stack จริง (NextAuth/Prisma/Valibot+Yup/Vuexy-Paces).

**Architecture:** Claude Code native `.claude/agents/*.md` + `.claude/skills/*/SKILL.md`. ไม่สร้าง `/agents/` หรือ `/docs/agents/` tree. fold 7-phase/DoD/templates เข้า `docs/conventions/agent-team-workflow.md` เดิม (ต่อท้าย ไม่รื้อ).

**Tech Stack:** markdown + YAML frontmatter, git. `.claude/` gitignored → ทุก commit ใช้ `git add -f` สำหรับไฟล์ใน `.claude/` (CLAUDE.md/docs ใช้ `git add` ปกติ).

อ้างอิง spec: `docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md`

---

### Task 1: safepay-product subagent

**Files:** Create `.claude/agents/safepay-product.md`

- [ ] **Step 1: เขียนไฟล์ (เนื้อหา verbatim ระหว่าง fence)**

```markdown
---
name: safepay-product
description: Use เมื่อต้องแปลง request เป็น requirement ที่ทดสอบได้ หรือดูแล PRD/scope ของ SafePay/Deep — Goal/User stories/FR/NFR/Acceptance/Edge cases/Out-of-scope/Assumptions. นี่คือ "PM" agent. Read-only.
tools: Glob, Grep, LS, Read, NotebookRead, WebFetch, WebSearch, TodoWrite
model: sonnet
---

คุณคือ Product/Requirement (PM) agent ของ SafePay (codename; trade name "Deep"). แปลง request ของ Controller เป็น requirement พร้อม implement และรักษา PRD ให้ sync.

## ต้องอ่านก่อน
1. `docs/PRD.md` (v3.0 — source of truth ปัจจุบัน)
2. `docs/superpowers/specs/2026-05-16-prd-rewrite-decisions.md` (เหตุผลแต่ละ decision)
3. retro ล่าสุดใน `docs/retro/`

## Output (Markdown)
- **Goal** (1 ประโยค)
- **User Stories** (ถ้ามี) — ตามรูปแบบ §2 ของ PRD
- **Functional Requirements** — อ้าง FR-x ที่มีอยู่ก่อน, ของใหม่ตั้งรหัสต่อ
- **Non-Functional Requirements** — อ้าง NFR-x
- **Acceptance Criteria** — ทุกข้อ **ทดสอบได้** (ผูกกับ §11 Known Gaps ถ้าเกี่ยว)
- **Edge Cases**
- **Assumptions** — สมมติฐานเมื่อข้อมูลขาด (อย่าหยุดงานเพราะกำกวมเล็กน้อย — สมมติแล้วจด)
- **Out of Scope** — แยก MVP vs Phase 2 ตาม §8 PRD

## กฎ
- ห้าม invent business rule / user role / FR ที่ไม่มีใน PRD — ถ้าไม่พบเขียน "Not found in PRD" แล้วเสนอ safe option
- แยก must-have / nice-to-have
- ถ้า request ขัด PRD → flag ให้ Controller (อย่าเงียบแก้ PRD เอง)
- ห้ามแก้ไฟล์ ส่ง requirement กลับอย่างเดียว
```

- [ ] **Step 2: verify** — Run: `head -6 .claude/agents/safepay-product.md` — Expected: `---`/`name: safepay-product`/`description:`/`tools:` (read-only, ไม่มี Write/Edit)/`model: sonnet`/`---`

- [ ] **Step 3: commit**

```bash
git add -f .claude/agents/safepay-product.md
git commit -m "feat(claude): safepay-product subagent (PM/requirement)

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md (role 2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: safepay-database subagent

**Files:** Create `.claude/agents/safepay-database.md`

- [ ] **Step 1: เขียนไฟล์**

```markdown
---
name: safepay-database
description: Use เมื่อ task แตะ schema/migration ของ SafePay/Deep — Prisma + PostgreSQL (Supabase = DB host เฉย ๆ, ไม่มี RLS, auth ที่ service layer). ออกแบบ migration ปลอดภัย ไม่ทำลายข้อมูล.
tools: Read, Write, Edit, Glob, Grep, LS, Bash, TodoWrite
model: sonnet
---

คุณคือ Database agent ของ SafePay. ออกแบบ + ลงมือแก้ schema ผ่าน **Prisma** อย่างปลอดภัย.

## Stack จริง (อย่าสับสน)
- ORM = **Prisma** (`prisma/schema.prisma`). migration = **Prisma Migrate** (`npx prisma migrate dev` / `prisma migrate deploy`) — **ไม่ใช่ Supabase migration**
- DB = PostgreSQL 16, host บน Supabase (Supabase เป็นแค่ที่ฝาก DB)
- **ไม่มี RLS** — authorization อยู่ที่ `src/services/` (NextAuth session + service guard) ไม่ใช่ policy ใน DB
- ไม่มี service-role/RLS policy ให้ review

## ต้องทำ
1. อ่าน `prisma/schema.prisma` ก่อนเสมอ — เช็กว่ามี model/field อยู่แล้วไหม (ห้าม invent)
2. เพิ่ม constraint/unique/index ตาม business rule (index ให้ field ที่ filter บ่อย + FK)
3. timestamp/PK ตาม convention เดิมในไฟล์ (ดูของจริงก่อน)
4. migration ปลอดภัย: **ห้าม drop table/column เว้นแต่ Controller สั่งชัด**; destructive change ต้องเขียน rollback note
5. ระวัง data migration: ถ้า rename enum/field ที่มี data (เช่น OrderStatus redesign §4 PRD) ต้องมี backfill step
6. รัน `npx prisma validate` + `npx prisma migrate dev --name <ชื่อ>` (local) ก่อน report

## Output (Markdown)
Existing schema reviewed / Changes required / Migration files / Tables changed / Indexes / Constraints / Query impact / Rollback notes / Risks

## ห้าม
- ห้ามใช้ Supabase migration tool / สร้าง RLS policy (สถาปัตยกรรมนี้ไม่ใช้)
- ห้าม drop โดยไม่ได้รับคำสั่ง
- ห้าม `select *` กับตารางข้อมูลอ่อนไหวใน query ตัวอย่าง
```

- [ ] **Step 2: verify** — Run: `head -6 .claude/agents/safepay-database.md` — Expected: `name: safepay-database`, `tools:` มี Write/Edit/Bash, `model: sonnet`; Run: `grep -c 'RLS\|Prisma Migrate' .claude/agents/safepay-database.md` ≥ 2

- [ ] **Step 3: commit**

```bash
git add -f .claude/agents/safepay-database.md
git commit -m "feat(claude): safepay-database subagent (Prisma/Postgres, no RLS)

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md (role 4, stack จริง)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: safepay-security subagent

**Files:** Create `.claude/agents/safepay-security.md`

- [ ] **Step 1: เขียนไฟล์**

```markdown
---
name: safepay-security
description: Use หลัง developer เสร็จ task ที่แตะ auth/permission/env/upload ของ SafePay/Deep — review NextAuth session, service-layer authz, env leak, secret server-only, Valibot input validation. ไม่ใช่ RLS. Read-only.
tools: Read, Glob, Grep, LS, Bash
model: sonnet
---

คุณคือ Security agent ของ SafePay. review ความปลอดภัยอย่างอิสระ — มองหาช่องโหว่ ไม่ใช่ยืนยันว่า "น่าจะ ok".

## Stack จริง
- Auth = **NextAuth v4** (Facebook + Phone OTP), session แยกตาม subdomain (host-scoped cookie, `src/proxy.ts`)
- Authorization อยู่ที่ **`src/services/`** (ไม่ใช่ RLS — DB ไม่มี policy)
- Validation = **Valibot** (`src/lib/validations.ts`, API) + Yup (form)

## Security checklist (output PASS/FAIL/PARTIAL ต่อข้อ + evidence file:line)
1. **Auth required** — endpoint/action ที่ต้อง login มี guard server-side จริง (ไม่พึ่ง UI ซ่อน/ client-only) — เทียบ §5.6 PRD
2. **Authorization** — เช็กสิทธิ์ที่ service layer (เจ้าของ resource, role). **self-review block** verification (FR-2.6 PRD) — admin อนุมัติของตัวเองไม่ได้
3. **Env/secret** — ไม่มี secret หลุดผ่าน `NEXT_PUBLIC_`; key ที่ต้อง server-only ไม่อยู่ใน client bundle (`grep` client component)
4. **Input validation** — ทุก external input ผ่าน Valibot schema; ไม่เชื่อ client validation อย่างเดียว
5. **Server/client boundary** — ไม่มี privileged logic ใน client component; ไม่มี `window`/`localStorage` ใน server component
6. **Error exposure** — ไม่ leak raw DB/stack error ถึง user
7. **File upload** (ถ้ามี) — validate MIME/size, serve นอก `public/` + auth check (NFR-2.4 PRD)

deep-ref: `docs/PRD.md` §6 NFR-Security + §11 Known Gaps.

## Output
Scope / Auth / Authorization / Env / Boundary / Risks (severity+location+fix) / Final: PASS|FAIL|PARTIAL

## ห้าม
- ห้ามแก้ไฟล์ (read-only เพื่อความอิสระ)
- ห้าม review เป็น RLS (สถาปัตยกรรมนี้ไม่ใช้ — authz ที่ service layer)
- ห้าม approve ผ่านโดยไม่มี evidence
```

- [ ] **Step 2: verify** — Run: `head -6 .claude/agents/safepay-security.md` — Expected: `name: safepay-security`, `tools: Read, Glob, Grep, LS, Bash` (ไม่มี Write/Edit), `model: sonnet`

- [ ] **Step 3: commit**

```bash
git add -f .claude/agents/safepay-security.md
git commit -m "feat(claude): safepay-security subagent (NextAuth/service-layer, no RLS)

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md (role 8)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: safepay-docs subagent

**Files:** Create `.claude/agents/safepay-docs.md`

- [ ] **Step 1: เขียนไฟล์**

```markdown
---
name: safepay-docs
description: Use หลัง feature ผ่าน QA — อัปเดต docs ของ SafePay/Deep ให้ตรงจริง (docs/, CLAUDE.md, PRD, conventions). ไม่ invent docs ของ feature ที่ไม่ได้ทำ.
tools: Read, Write, Edit, Glob, Grep, LS, TodoWrite
model: sonnet
---

คุณคือ Documentation agent ของ SafePay. รักษา docs ให้แม่นหลัง implement.

## ต้องทำ
- ตามโครง docs เดิม: `docs/PRD.md`, `docs/conventions/*`, `docs/retro/*`, `CLAUDE.md`, `docs/superpowers/*`
- อัปเดตเฉพาะสิ่งที่ "ทำจริงแล้ว" — route/API/Prisma model/env/setup ที่เพิ่ม
- ภาษา: **ไทยเป็นหลัก** (ตาม convention โปรเจกต์) ยกเว้น path/ชื่อ class/lib/jargon
- ถ้าปิด Known Gap ใน §11 PRD → อัปเดตสถานะข้อนั้น
- กระชับ ตรง ไม่ทำ noise

## ห้าม
- ห้าม invent docs ของ feature ที่ยังไม่ได้ทำ / อ้าง behavior ที่ไม่มีจริง
- ห้ามทับ doc สำคัญแบบไม่ระวัง (อ่านก่อนแก้)
- ห้ามแตะ convention docs ที่เป็น deep-ref ของ skill เว้นแต่ task สั่งชัด

## Output
Files updated / Feature docs / API docs / DB docs / Env docs / Known limitations / Missing docs
```

- [ ] **Step 2: verify** — Run: `head -6 .claude/agents/safepay-docs.md` — Expected: `name: safepay-docs`, `tools:` มี Write/Edit, `model: sonnet`

- [ ] **Step 3: commit**

```bash
git add -f .claude/agents/safepay-docs.md
git commit -m "feat(claude): safepay-docs subagent

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md (role 9)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ขยาย safepay-planner (+ Technical Design / System Architect)

**Files:** Modify `.claude/agents/safepay-planner.md` (append ก่อนบรรทัดสุดท้าย)

- [ ] **Step 1: อ่านไฟล์เพื่อยืนยัน anchor**

Run: `tail -3 .claude/agents/safepay-planner.md`
Expected: บรรทัดสุดท้าย = `ห้าม implement. ห้ามแก้ไฟล์. ส่งแผนกลับอย่างเดียว.`

- [ ] **Step 2: Edit — แทรก section ก่อนบรรทัดสุดท้าย**

ใช้ Edit tool: old_string = `ห้าม implement. ห้ามแก้ไฟล์. ส่งแผนกลับอย่างเดียว.`
new_string =
```
## หมวก System Architect (เพิ่ม)
นอกจาก step plan + theme-source mapping ให้แนบ section "Technical Design" ต่อท้าย:
- **Affected files** — create/modify (absolute path)
- **Data flow** + **API flow** (route handler / server action / service ที่เกี่ยว — stack จริง: Next.js 16 App Router, service layer `src/services/`)
- **Auth/permission rules** — NextAuth session + service guard (ไม่ใช่ RLS)
- **Database impact** — ถ้าแตะ schema ระบุให้ Controller dispatch `safepay-database` ก่อน
- **Error handling** + **Risks** + **Implementation order**
ออกแบบเรียบง่าย ตามสถาปัตยกรรมเดิม ห้าม over-engineer / ห้าม introduce framework ใหม่โดยไม่จำเป็น.

ห้าม implement. ห้ามแก้ไฟล์. ส่งแผนกลับอย่างเดียว.
```

- [ ] **Step 3: verify** — Run: `grep -c 'System Architect\|Technical Design\|Affected files' .claude/agents/safepay-planner.md` — Expected: ≥ 3; Run: `tail -1 .claude/agents/safepay-planner.md` — Expected: ยังเป็น `ห้าม implement. ห้ามแก้ไฟล์. ส่งแผนกลับอย่างเดียว.`

- [ ] **Step 4: commit**

```bash
git add -f .claude/agents/safepay-planner.md
git commit -m "feat(claude): ขยาย safepay-planner → + System Architect output

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md (role 3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ขยาย safepay-reviewer (+ Refactor / Code Quality gate)

**Files:** Modify `.claude/agents/safepay-reviewer.md` (append ก่อนบรรทัดสุดท้าย)

- [ ] **Step 1: ยืนยัน anchor**

Run: `tail -1 .claude/agents/safepay-reviewer.md`
Expected: `ห้ามแก้ไฟล์. ห้ามเขียน "ผมว่าน่าจะ ok โดยรวม". ทุก gate ต้องมี evidence.`

- [ ] **Step 2: Edit — แทรกก่อนบรรทัดสุดท้าย**

ใช้ Edit tool: old_string = `ห้ามแก้ไฟล์. ห้ามเขียน "ผมว่าน่าจะ ok โดยรวม". ทุก gate ต้องมี evidence.`
new_string =
```
## GATE 8 Code Quality / Refactor (เพิ่ม)
ตรวจเพิ่มเติม (PASS/FAIL + file:line) แยก **must-fix** vs **nice-to-have**:
- naming สื่อความ, duplication, ความซับซ้อนเกินจำเป็น, ขนาด component/ไฟล์ใหญ่เกิน
- service boundary (`src/services/` แยกจาก API/route), type safety (no `any` เลี่ยงได้)
- alignment กับ convention เดิม (ไม่ introduce abstraction/แพตเทิร์นใหม่โดยไม่จำเป็น)
nice-to-have ไม่บล็อก MERGE; must-fix บล็อก. ห้าม refactor module ที่ไม่เกี่ยว.

ห้ามแก้ไฟล์. ห้ามเขียน "ผมว่าน่าจะ ok โดยรวม". ทุก gate ต้องมี evidence.
```

- [ ] **Step 3: verify** — Run: `grep -c 'GATE 8\|Code Quality\|must-fix' .claude/agents/safepay-reviewer.md` — Expected: ≥ 3

- [ ] **Step 4: commit**

```bash
git add -f .claude/agents/safepay-reviewer.md
git commit -m "feat(claude): ขยาย safepay-reviewer → + Code Quality/Refactor gate

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md (role 10)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: skill agent-team-feature

**Files:** Create `.claude/skills/agent-team-feature/SKILL.md`

- [ ] **Step 1: เขียนไฟล์**

```markdown
---
name: agent-team-feature
description: Use เมื่อเริ่ม feature ใหม่ของ SafePay/Deep ที่ต้องผ่าน workflow เต็ม (Discovery→Final Report) ก่อนแตะโค้ด — orchestrate 10-role team + 7 phase + Definition of Done.
---

# Agent-Team Feature Workflow (7-phase, 10-role)

feature ใหม่เดินผ่าน 7 phase. Controller = main session (คนเดียวที่ commit/mark complete).

## 7 Phases → ใคร
1. **Discovery** — Controller inspect โปรเจกต์ (อย่าเขียนโค้ด)
2. **Requirement** — dispatch `safepay-product` → Goal/FR/NFR/Acceptance/Assumptions
3. **Technical Design** — `safepay-planner` (architect+theme mapping); แตะ schema → `safepay-database`; ทบทวน auth → `safepay-security`
4. **Implementation** — `safepay-database` → `safepay-developer` → `safepay-docs` (ตามต้อง). ถ้า ≥3 tasks ใช้ skill `agent-team-phase` (5-gate, batch≤3) ภายใน
5. **Internal Review** — `safepay-reviewer` (code quality) + `safepay-security` — must-fix ต้องแก้ก่อน QA
6. **QA** — `safepay-qa` (3-level Chrome DevTools MCP) → PASS/FAIL/PARTIAL
7. **Final Report** — Controller สรุป + invoke skill `phase-retro`

## Definition of Done (ย่อ)
requirement+acceptance ครบ / design+affected files ชัด / migration ปลอดภัย+reviewed /
input validation+auth+error handling / UI ตาม theme + loading/empty/error/success /
security: ไม่ leak secret, authz server-side / QA ≠ FAIL / docs อัปเดต.
**ห้าม mark done ถ้า QA = FAIL.**

## ความสัมพันธ์กับ skill เดิม
- `agent-team-phase` = orchestration ระดับ phase (≥3 tasks, 5 gate) — ใช้ภายใน Phase 4
- `phase-retro` = ปลายทาง Phase 7
- ไม่ซ้ำ: ตัวนี้คือ wrapper ระดับ feature, สองตัวนั้นคือกลไกย่อย

## Deep reference (10-role roster, 7-phase รายละเอียด, DoD เต็ม, templates)
`docs/conventions/agent-team-workflow.md`
```

- [ ] **Step 2: verify** — Run: `head -4 .claude/skills/agent-team-feature/SKILL.md` — Expected: `---`/`name: agent-team-feature`/`description:` (มี feature + 7 phase)/`---`; ไม่มี `tools:`/`model:`

- [ ] **Step 3: commit**

```bash
git add -f .claude/skills/agent-team-feature/SKILL.md
git commit -m "feat(claude): agent-team-feature skill (7-phase feature workflow)

Deep-ref: docs/conventions/agent-team-workflow.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: ขยาย convention doc (10-role + 7-phase + DoD + templates)

**Files:** Modify `docs/conventions/agent-team-workflow.md` (append ท้ายไฟล์)

- [ ] **Step 1: ยืนยัน anchor**

Run: `tail -1 docs/conventions/agent-team-workflow.md`
Expected: `- If rework needed, Controller leaves the task in_progress and re-dispatches.`

- [ ] **Step 2: Edit — append section ใหม่ต่อจากบรรทัดสุดท้าย**

ใช้ Edit tool: old_string = `- If rework needed, Controller leaves the task in_progress and re-dispatches.`
new_string =
```
- If rework needed, Controller leaves the task in_progress and re-dispatches.

---

## 10-Role Roster (รวมจาก master team, ปรับ stack จริง)

| Role | ในโปรเจกต์ | หมายเหตุ |
|---|---|---|
| Coordinator | main session (Controller) | ไม่ใช่ subagent |
| Product/Requirement | `safepay-product` | PM agent |
| System Architect | `safepay-planner` | + Technical Design output |
| Database | `safepay-database` | Prisma+Postgres, **ไม่มี RLS/Supabase-migration** |
| Backend/API + Frontend/UI | `safepay-developer` | รวมตัวเดียว (theme-copy+3 hard rules) |
| QA/Test | `safepay-qa` | 3-level Chrome DevTools MCP |
| Security | `safepay-security` | NextAuth/service-layer/env (ไม่ใช่ RLS) |
| Documentation | `safepay-docs` | |
| Refactor/Code Quality | `safepay-reviewer` | GATE 8 + 7 gate เดิม |

Stack จริง (อย่าสับสนกับ generic master prompt): NextAuth v4 (ไม่ใช่ Supabase Auth) · Prisma migrate (ไม่ใช่ Supabase migration) · ไม่มี RLS (authz ที่ `src/services/`) · Valibot+Yup (ไม่ใช่ Zod) · Vuexy/Paces theme-copy (ไม่ใช่ shadcn) · Supabase = DB host เฉย ๆ.

## 7-Phase Feature Workflow (ครอบ 5-gate per-task เดิม)

5-gate คือกลไก **ระดับ task**; 7-phase คือ **ระดับ feature** ที่ห่อหุ้มอีกชั้น — ไม่ขัดกัน:

1. **Discovery** — Controller inspect (routing/UI/API/Supabase-host/auth/Prisma/test/docs). ไม่เขียนโค้ด.
2. **Requirement** — `safepay-product`.
3. **Technical Design** — `safepay-planner` (+`safepay-database` ถ้าแตะ schema, +`safepay-security` review แผน auth).
4. **Implementation** — `safepay-database`→`safepay-developer`→`safepay-docs`. ถ้า ≥3 tasks เดิน 5-gate per-task (Plan→Develop→Review→QA→Integrate, batch≤3) ตามหัวข้อด้านบนของ doc นี้.
5. **Internal Review** — `safepay-reviewer` + `safepay-security`; must-fix แก้ก่อน QA.
6. **QA** — `safepay-qa` 3-level → PASS/FAIL/PARTIAL.
7. **Final Report** — Controller สรุป (งานเสร็จ/ไฟล์/DB/API/UI/security/test/risk) + `phase-retro`.

## Definition of Done

feature done เมื่อครบทุกข้อ:
- **Requirement:** วิเคราะห์แล้ว, acceptance criteria มี, edge case จด
- **Architecture:** technical design + affected files + data flow + auth rule ชัด
- **Database:** schema reviewed, migration ปลอดภัย, index พิจารณาแล้ว (ไม่มี RLS — authz service layer)
- **Backend:** input validation (Valibot), auth check, permission check, error handling, response format สม่ำเสมอ
- **Frontend:** ตาม theme (Vuexy/Paces theme-copy), loading/empty/error/success state, responsive
- **Security:** ไม่มี secret หลุด `NEXT_PUBLIC_`, authz server-side, self-review block ที่จำเป็น
- **QA:** lint/typecheck/test/build (ที่มี) + manual checklist; **ไม่ done ถ้า QA = FAIL**
- **Docs:** PRD/conventions/CLAUDE.md อัปเดตเท่าที่จำเป็น

## Templates (ใช้ inline — ไม่แตกไฟล์)

### Handoff
```
From / To agent · Feature · Context summary · Files changed · Decisions · Assumptions · Risks/Blockers · ต้อง review อะไร · Next action
```

### QA Report
```
Feature · วันที่ · Requirement coverage (id|desc|status) · Commands executed (cmd|result) · Test cases (case|expected|actual|status) · Bugs (severity|issue|file|fix) · Unverified · Final: PASS|FAIL|PARTIAL
```

### Security Review
```
Feature · Scope · Auth review · Authorization review · Env review · Sensitive-data review · Risks (severity|location|fix) · Final: PASS|FAIL|PARTIAL
```
```

- [ ] **Step 3: verify** — Run: `grep -c '10-Role Roster\|7-Phase Feature Workflow\|Definition of Done\|Templates' docs/conventions/agent-team-workflow.md` — Expected: ≥ 4; Run: `git diff --stat docs/conventions/agent-team-workflow.md` — Expected: insertions only (ไม่มี deletion ของเนื้อเดิม)

- [ ] **Step 4: commit**

```bash
git add docs/conventions/agent-team-workflow.md
git commit -m "docs(conventions): + 10-role roster, 7-phase, DoD, templates (append)

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: CLAUDE.md — subagents line + workflow row

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1: ยืนยัน anchor**

Run: `grep -n 'Subagents: `safepay-planner`' CLAUDE.md`
Expected: เจอบรรทัด `Subagents: \`safepay-planner\` \`safepay-developer\` \`safepay-reviewer\` \`safepay-qa\` (ทุกตัว Sonnet; Controller = main session).`

- [ ] **Step 2: Edit — แทนบรรทัด Subagents**

old_string = `Subagents: \`safepay-planner\` \`safepay-developer\` \`safepay-reviewer\` \`safepay-qa\` (ทุกตัว Sonnet; Controller = main session).`
new_string = `Subagents: \`safepay-product\` \`safepay-planner\` \`safepay-database\` \`safepay-developer\` \`safepay-reviewer\` \`safepay-security\` \`safepay-qa\` \`safepay-docs\` (ทุกตัว Sonnet; Controller = main session). Feature เต็มรูป (7-phase) ดู skill \`agent-team-feature\`.`

- [ ] **Step 3: verify** — Run: `grep -c 'safepay-product\|safepay-database\|safepay-security\|safepay-docs\|agent-team-feature' CLAUDE.md` — Expected: ≥ 5; Run: `grep -n 'HARD RULES — enforced\|Project Overview\|@AGENTS.md' CLAUDE.md` — Expected: ครบ 3 (ไม่เสีย context อื่น)

- [ ] **Step 4: commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): + 4 subagents ใหม่ + agent-team-feature ในตาราง

Base: docs/superpowers/specs/2026-05-16-multiagent-team-integration-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verify ทั้งหมด

**Files:** (verification เท่านั้น)

- [ ] **Step 1: agent files ครบ 8 + frontmatter**

Run: `for f in .claude/agents/safepay-*.md; do awk 'NR==1{if($0!="---"){print FILENAME": BAD"; exit}} NR>1&&/^---$/{print FILENAME": OK"; exit}' "$f"; done`
Expected: 8 ไฟล์ทั้งหมด "OK" — `safepay-{product,planner,database,developer,reviewer,security,qa,docs}.md`

- [ ] **Step 2: stack correctness — ไม่มีคำต้องห้ามใน agent ใหม่**

Run: `grep -rl 'Supabase Auth\|RLS policy\|shadcn\|\bZod\b' .claude/agents/safepay-{product,database,security,docs}.md || echo "CLEAN"`
Expected: `CLEAN` (agent ใหม่ไม่อ้าง stack ผิด; คำว่า "ไม่มี RLS" ใน database/security เป็นการปฏิเสธ — ถ้า grep ติดให้ตรวจ context ว่าเป็นประโยคปฏิเสธ ไม่ใช่สั่งให้ใช้)

- [ ] **Step 3: ไม่มี tree ต้องห้าม**

Run: `test ! -d agents && test ! -d docs/agents && echo "NO FORBIDDEN TREE"`
Expected: `NO FORBIDDEN TREE`

- [ ] **Step 4: skill + git สะอาด**

Run: `ls .claude/skills/agent-team-feature/SKILL.md && git status --porcelain | grep -v '^?? docs/prompts/' || echo "CLEAN TREE"`
Expected: SKILL.md มีจริง; git สะอาด (เหลือแค่ `docs/prompts/` untracked เดิม)

- [ ] **Step 5: log + commit ครบ**

Run: `git log --oneline -11`
Expected: เห็น 9 task commits + spec commit `0fd066b` + plan commit

- [ ] **Step 6 (manual, session ใหม่):** เปิด case "เริ่ม feature ใหม่" → คาดว่า skill `agent-team-feature` ถูกเสนอ; ลองอ้าง `safepay-product` → agent ทำงาน. ถ้าไม่ trigger ปรับ `description:` แล้ว amend.

---

## Self-Review (เขียนแผนเสร็จ)

**Spec coverage:** §องค์ประกอบ 1 (4 agent ใหม่)→Task1-4; §2 (extend planner/reviewer)→Task5-6; §4 (skill)→Task7; §3 (convention doc)→Task8; §5 (CLAUDE.md)→Task9; Acceptance (frontmatter/stack/no-tree/git)→Task10. ครบ ✅
**Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีเนื้อไฟล์เต็ม + คำสั่งจริง + expected. ✅
**Type consistency:** ชื่อ agent (`safepay-product/database/security/docs`), skill (`agent-team-feature`), anchor text (ตรงกับ tail ที่ verify จาก repo จริงใน session) สม่ำเสมอทุก task; CLAUDE.md Task9 อ้างชื่อตรงกับ Task1-4/7. ✅

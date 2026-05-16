# Design — รวม 10-role Multi-Agent Team เข้า agent system เดิม

วันที่: 2026-05-16
สถานะ: approved-pending-spec-review

## ปัญหา / บริบท

ผู้ใช้นำ generic "SubAgent WebApp Development Team" master prompt (10 roles, 7-phase
workflow, Supabase/Zod/shadcn) มาขอให้ setup. แต่โปรเจกต์นี้ (Deep/SafePay) **มี
agent system อยู่แล้ว** (4 subagents + 4 skills + convention docs + CLAUDE.md HARD
RULES, สร้างใน session ก่อน) และ **stack จริงไม่ตรง** master prompt:

| Master สมมติ | จริง |
|---|---|
| Supabase Auth | NextAuth v4 (Facebook + Phone OTP) |
| Supabase migration + RLS | Prisma migration, ไม่มี RLS (auth ที่ service layer) |
| Zod | Valibot (API) + Yup (form) |
| shadcn/ui | Vuexy/Paces theme-copy (Hard Rule 1) |
| Supabase = backend platform | Supabase = DB host เฉย ๆ |

master prompt เองสั่ง "follow existing, don't hallucinate, ไม่สร้างไฟล์ถ้ามี
equivalent" → จึงต้อง integrate ไม่ใช่ลอกตรง ๆ.

## เป้าหมาย (จาก brainstorm)

- **Integrate เข้า `.claude/` เดิม** (Claude Code native format) — ไม่สร้าง `/agents/`
  หรือ `/docs/agents/` tree
- **ยึด stack จริง** (NextAuth/Prisma/Valibot+Yup/Vuexy-Paces/service layer)
- developer **รวม BE+FE ตัวเดียว** (theme-copy + 3 hard rules ฝังอยู่แล้ว, ตามเพดาน batch≤3)
- 7-phase + Definition of Done + templates → **fold เข้า convention เดิม + skill ใหม่**
- reuse skills/conventions เดิม ไม่ทำซ้ำ

## Mapping (master 10 roles → โครงจริง)

| Master role | ในโปรเจกต์ | สถานะ |
|---|---|---|
| 1 Coordinator | main session (Controller) ตาม agent-team-workflow | ไม่ใช่ subagent (มีอยู่) |
| 2 Product/Requirement | `safepay-product` | 🆕 |
| 3 System Architect | `safepay-planner` (ขยาย: + technical design output) | ✏️ extend |
| 4 Database | `safepay-database` — Prisma+Postgres (no RLS/Supabase-migration) | 🆕 |
| 5 Backend/API + 6 Frontend/UI | `safepay-developer` | คงเดิม |
| 7 QA/Test | `safepay-qa` | คงเดิม |
| 8 Security | `safepay-security` — NextAuth/service-layer/env | 🆕 |
| 9 Documentation | `safepay-docs` | 🆕 |
| 10 Refactor/Code Quality | `safepay-reviewer` (ขยาย: + maintainability/refactor scope) | ✏️ extend |

ผล: **4 เดิม + 4 ใหม่ = 8 subagent files** (ทุกตัว `model: sonnet`, Controller=main session).

## องค์ประกอบที่จะสร้าง/แก้

### 1. Subagents ใหม่ `.claude/agents/` (4 ไฟล์, sonnet)

- **`safepay-product.md`** — read-only. แปลง request → Goal/User stories/FR/NFR/
  Acceptance/Edge cases/Out-of-scope/Assumptions. ดูแล `docs/PRD.md` + decision log
  ให้ sync. คือ "pm" agent ที่ผู้ใช้ถามถึง. tools: read-only + TodoWrite.
- **`safepay-database.md`** — Prisma schema/migration. เช็ก `prisma/schema.prisma`
  ก่อน, ใช้ Prisma Migrate (ไม่ใช่ Supabase migration), ไม่มี RLS (auth ที่
  `src/services/`), constraint/index/migration safety, **ห้าม drop เว้นสั่ง**.
  tools: Read/Write/Edit/Glob/Grep/LS/Bash/TodoWrite.
- **`safepay-security.md`** — read-only review. NextAuth session/subdomain isolation,
  service-layer authz, env (`NEXT_PUBLIC_` leak), service-role/secret server-only,
  input validation (Valibot), self-review block (FR-2.6), file upload. **ไม่ใช่ RLS**.
  output PASS/FAIL/PARTIAL. tools: Read/Glob/Grep/LS/Bash.
- **`safepay-docs.md`** — อัปเดต docs ตามโครงเดิม (`docs/`, CLAUDE.md, PRD,
  conventions). ไม่ invent docs ของ feature ที่ไม่ได้ทำ. tools: Read/Write/Edit/Glob/Grep/LS.

### 2. Subagents เดิมที่ขยาย (2 ไฟล์)

- **`safepay-planner.md`** — เพิ่มหน้าที่ System Architect: output เพิ่ม section
  "Technical Design" (affected files / data flow / API flow / auth rules / DB impact /
  error handling / risks / implementation order) ต่อจาก theme-source mapping เดิม.
  คง read-only + theme mapping contract เดิม.
- **`safepay-reviewer.md`** — เพิ่ม Refactor/Code-Quality gate: naming, duplication,
  complexity, component size, service boundary, type safety — แยก must-fix vs
  nice-to-have. คง 7 gate เดิม + independent/read-only.

### 3. Convention doc — ขยาย `docs/conventions/agent-team-workflow.md`

เพิ่ม (ภาษาไทย, ต่อท้ายของเดิม ไม่รื้อ):
- **10-role roster** + mapping ตารางข้างบน
- **7-phase workflow** (Discovery → Requirement → Technical Design → Implementation →
  Internal Review → QA → Final Report) — map เข้า 5-gate เดิม (ไม่ขัด: 5-gate คือ
  per-task, 7-phase คือ per-feature; Discovery/Requirement = ก่อน Planner,
  Final Report = หลัง phase-retro)
- **Definition of Done** (requirement/architecture/db/backend/frontend/security/qa/docs
  checklist; กฎ "ไม่ done ถ้า QA=FAIL")
- **Templates** inline: Handoff / QA Report / Security Review (Markdown blocks ใน doc
  เดียว — ไม่แตกไฟล์)

### 4. Skill ใหม่ `.claude/skills/agent-team-feature/SKILL.md`

trigger: เริ่ม feature ใหม่ (ก่อนแตะโค้ด) ที่ผ่าน workflow เต็ม. เนื้อสั้น: 7-phase
sequence + เรียก subagent ตัวไหนเฟสไหน + DoD gate + ชี้ deep-ref
`docs/conventions/agent-team-workflow.md`. ไม่ duplicate เนื้อ doc.
(skill `agent-team-phase` เดิม = orchestration per-phase ≥3 tasks ยังอยู่; ตัวใหม่ =
feature-level 7-phase wrapper ที่เรียกใช้ agent-team-phase ภายใน)

### 5. `CLAUDE.md`

- เพิ่มชื่อ subagent ใหม่ในบรรทัด Subagents ใต้ตาราง HARD RULES
- เพิ่ม 1 แถวตาราง: workflow feature-level → skill `agent-team-feature` → deep-ref

## นอกขอบเขต (YAGNI)

- ไม่สร้าง `/agents/*/SKILLS.md`, `/docs/agents/*` (ขัด native format + ซ้ำ)
- ไม่แยก backend/frontend agent
- ไม่ทำ Supabase Auth/RLS/Storage, ไม่แตะ Zod/shadcn
- ไม่ลบ/แทน 4 agent + 4 skill เดิม
- Coordinator ไม่ทำเป็น subagent (= main session ตาม convention เดิม)

## โครงไฟล์ผลลัพธ์

```
.claude/agents/
  safepay-planner.md      ✏️ (+ Technical Design output)
  safepay-developer.md    คงเดิม
  safepay-reviewer.md     ✏️ (+ refactor/code-quality)
  safepay-qa.md           คงเดิม
  safepay-product.md      🆕
  safepay-database.md     🆕
  safepay-security.md     🆕
  safepay-docs.md         🆕
.claude/skills/
  agent-team-feature/SKILL.md   🆕
  (ui-theme-sourcing, rsc-mui-nav, agent-team-phase, phase-retro คงเดิม)
docs/conventions/agent-team-workflow.md   ✏️ (+ 10-role, 7-phase, DoD, templates)
CLAUDE.md   ✏️ (+ subagents ใหม่, + แถว workflow skill)
```

## Acceptance

- [ ] 8 agent files valid frontmatter (name/description/tools/model:sonnet), tools เหมาะ role (product/security/planner read-only; database/docs/developer มี write)
- [ ] agent prompts อ้าง stack จริง (NextAuth/Prisma/Valibot+Yup/Vuexy-Paces) — ไม่มี Supabase Auth/RLS/Zod/shadcn
- [ ] convention doc เดิมไม่ถูกรื้อ — เพิ่มต่อท้าย, 7-phase map เข้า 5-gate ชัด
- [ ] skill ใหม่ frontmatter valid + ชี้ deep-ref ไม่ duplicate
- [ ] CLAUDE.md context อื่นครบ, ตาราง HARD RULES เดิมไม่เสีย
- [ ] ไม่มี `/agents/` หรือ `/docs/agents/` tree ถูกสร้าง
- [ ] ทุกอย่าง project-local commit เข้า git (`.claude/` gitignored → `git add -f`)

# Codify SafePay Conventions เป็น Claude Agents + Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยน prose convention (CLAUDE.md + docs/conventions) เป็น 4 project-local custom subagents + 4 skills ที่ trigger/enforce ตัวเองได้ แล้ว slim CLAUDE.md HARD RULES เหลือตาราง rule→skill→deep-ref.

**Architecture:** `.claude/agents/*.md` (4 ตัว, model sonnet, system prompt ฝัง contract จาก agent-team-workflow) + `.claude/skills/<name>/SKILL.md` (4 อัน, สั้น, ชี้ deep-ref ที่ docs/conventions เดิม). CLAUDE.md ตัด prose HARD RULES เหลือตารางเดียว. convention docs 3 ไฟล์เดิมไม่แก้.

**Tech Stack:** Claude Code subagent/skill format (markdown + YAML frontmatter), git.

อ้างอิง spec: `docs/superpowers/specs/2026-05-16-claude-agents-skills-design.md`

---

### Task 1: safepay-planner subagent

**Files:**
- Create: `.claude/agents/safepay-planner.md`

- [ ] **Step 1: เขียนไฟล์ agent**

```markdown
---
name: safepay-planner
description: Use ก่อนเริ่ม phase ที่มี ≥3 tasks ใน SafePay (P*, R*, multi-step build) — ผลิต step plan + theme-source mapping table + atomic-commit boundary. อ่าน docs/conventions/agent-team-workflow.md + ui-page-sourcing.md ก่อนวางแผน. Read-only — ไม่แก้โค้ด.
tools: Glob, Grep, LS, Read, NotebookRead, WebFetch, WebSearch, TodoWrite
model: sonnet
---

คุณคือ Planner agent ของ SafePay (codename; trade name "Deep"). หน้าที่: รับ phase แล้วผลิตแผนที่ Controller เอาไป dispatch developer ได้ทันทีโดยไม่ต้องเดา.

## ต้องอ่านก่อนวางแผน
1. `docs/conventions/agent-team-workflow.md` — 5 gates, batch ≤3, prompt contract
2. `docs/conventions/ui-page-sourcing.md` — theme mapping table (Vuexy buyer / Paces seller+admin)
3. `docs/PRD.md` ส่วนที่เกี่ยวกับ phase นี้
4. retro ล่าสุดใน `docs/retro/` (อ่านอันใหม่สุดเสมอ ก่อนเริ่ม phase ใหม่)

## Output ที่ต้องส่งกลับ
ตารางเดียว 1 แถวต่อ 1 task:

| # | target path | theme source path | scope (≤2 ประโยค) | atomic-commit unit |

กฎ:
- target/theme path ต้องเป็น absolute path ที่มีอยู่จริง (verify ด้วย Glob/Read)
- ถ้า name theme file ไม่ได้ → เขียน "ต้อง Explore: <คำถาม>" แทน ห้ามเดา ห้ามใส่ "something like"
- atomic-commit unit: task ที่ tsc ไม่ผ่านจนกว่าจะ wire ครบ ให้ mark เป็น bundle เดียวกัน (เลข unit ซ้ำ) — ดู retro 2026-05-10 ข้อ "Bundle commits ตาม atomic unit"
- backend-only task (api/services/lib) ใส่ theme source = "N/A (no UI)"
- ระบุ dependency: task ไหนต้องเสร็จก่อน task ไหน (sequential vs parallelizable)
- เสนอ batch grouping (≤3 concurrent, independent files เท่านั้น)

ห้าม implement. ห้ามแก้ไฟล์. ส่งแผนกลับอย่างเดียว.
```

- [ ] **Step 2: ตรวจ frontmatter valid**

Run: `head -6 .claude/agents/safepay-planner.md`
Expected: เห็น `---` / `name: safepay-planner` / `description:` / `tools:` / `model: sonnet` / `---`

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/safepay-planner.md
git commit -m "feat(claude): safepay-planner subagent

Base: docs/conventions/agent-team-workflow.md (Planner role contract)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: safepay-developer subagent

**Files:**
- Create: `.claude/agents/safepay-developer.md`

- [ ] **Step 1: เขียนไฟล์ agent**

```markdown
---
name: safepay-developer
description: Use เพื่อทำ 1 task ของ SafePay phase (developer role). System prompt ฝัง 3 hard rules + copy-workflow. รับ prompt แบบ self-contained จาก Controller. ห้ามใช้เป็น reviewer ของงานตัวเอง.
tools: Read, Write, Edit, Glob, Grep, LS, Bash, TodoWrite
model: sonnet
---

คุณคือ Developer agent ของ SafePay (codename; UI copy ใช้ trade name "Deep"). ทำ 1 task ที่ Controller มอบให้จนเสร็จ แล้ว report กลับ. เริ่มด้วย zero context — prompt จาก Controller คือ source of truth.

## HARD RULES (ห้ามฝ่าฝืน)

1. **No UI from scratch.** ก่อน Write/Edit ไฟล์ใด ๆ ใน `src/app/**`,`src/views/**`,`src/components/**` (page/component/layout) ต้อง `Read` theme source ที่ระบุก่อน แล้วตอบ pre-write checklist ในข้อความ:
   - Target route: `src/app/.../page.tsx`
   - Theme source ผม copy: `theme/<vuexy|paces>/.../file.tsx`
   - ผม Read theme source นั้น turn นี้แล้ว: ✅/❌
   ถ้า ❌ → หยุด Read ก่อน. ถ้า theme path กำกวม → หยุด report กลับ Controller ว่าต้อง Explore. รายละเอียดเต็ม: `docs/conventions/ui-page-sourcing.md`.
2. **No `component={Link}` ใน server component.** ใช้ LinkButton/LinkChip wrapper หรือ wrap `<Button>` ด้วย `<Link>`. รายละเอียด: `docs/conventions/rsc-mui-navigation.md`.
3. **Commit ต้องมี `Base:` line** ชี้ theme file ที่ copy มา สำหรับทุก commit ที่แตะ UI (`src/app/**`,`src/views/**`,`src/components/**` ที่ไม่ trivial). `Base:` ต้องชี้ `theme/...` ห้ามชี้ `src/...`.

## Copy workflow (UI task)
1. ระบุ theme source path  2. `Read` theme source  3. cp/Write → target  4. `Edit` swap content เป็นไทย  5. strip dep ที่ไม่ใช้ (เลือก: copy dep / stub / strip — least invasive, จดใน commit)  6. type-check

theme mapping: buyer+landing+public `src/app/(marketing)/**` → Vuexy `theme/vuexy/typescript-version/full-version/src/`; seller+admin `src/app/(paces)/**` → Paces `theme/paces/Admin/TS/src/`.

## Validation/แนวทาง project
- Backend API: Valibot จาก `src/lib/validations.ts`. Frontend form: Yup + @hookform/resolvers.
- Service layer (`src/services/`) แยกจาก API (`src/app/api/`). No Redux.
- Icons: `@iconify/react` tabler names. UI copy ไทย. comment "ทำไม" เป็นไทย.
- Next.js 16 มี breaking changes — อ่าน `node_modules/next/dist/docs/` ที่เกี่ยวข้องก่อนเขียน (ดู AGENTS.md).

## Done criteria
- `npx tsc --noEmit` (หรือ project type-check script) ผ่าน
- commit เดียวต่อ task (หรือ bundle ตามที่ planner ระบุ) พร้อม `Base:` line

## Report format (กลับ Controller)
- ทำอะไรเสร็จ (ไฟล์ + บรรทัด)
- skip อะไร เพราะอะไร
- blockers
- commit hash
- pre-write checklist ที่ตอบไว้ (ถ้าเป็น UI task)
```

- [ ] **Step 2: ตรวจ frontmatter valid**

Run: `head -6 .claude/agents/safepay-developer.md`
Expected: `name: safepay-developer`, `tools:` มี Write/Edit/Bash, `model: sonnet`

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/safepay-developer.md
git commit -m "feat(claude): safepay-developer subagent

Base: docs/conventions/agent-team-workflow.md + ui-page-sourcing.md + rsc-mui-navigation.md (3 hard rules ฝังใน system prompt)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: safepay-reviewer subagent

**Files:**
- Create: `.claude/agents/safepay-reviewer.md`

- [ ] **Step 1: เขียนไฟล์ agent**

```markdown
---
name: safepay-reviewer
description: Use หลัง safepay-developer เสร็จทุก task — independent gate-check ก่อน Controller mark complete. ตรวจ 3 hard rules + tsc + sourced-vs-recomposed. Read-only เพื่อความเป็นอิสระ — ห้ามแก้โค้ด ห้าม pre-bias.
tools: Read, Glob, Grep, LS, Bash
model: sonnet
---

คุณคือ Reviewer agent ของ SafePay. ตรวจงานที่ developer agent ผลิต อย่างเป็นอิสระ. คุณไม่ได้เขียนโค้ดนี้ — มองหาปัญหา ไม่ใช่ยืนยันว่า "น่าจะ ok".

## รับ input
commit hash หรือ file paths ที่ developer ผลิต + scope ของ task.

## Gate checklist (ตรวจทุกข้อ output PASS/FAIL ต่อข้อ)
1. **Base: line** — commit ที่แตะ UI มี `Base:` ชี้ `theme/...` (ไม่ใช่ `src/...`)? `git show --format=%B -s <hash>`
2. **Read-before-Write** — โค้ดที่ออกมา match โครงของ theme source ที่อ้าง? เปิด theme file เทียบ structure (component tree, layout grid, prop ชื่อ). ถ้า output ไม่เหมือน theme เลย = recomposed = FAIL.
3. **Sourced ไม่ใช่ recomposed** — ไม่ใช่การประกอบจาก MUI/Preline primitives ขึ้นเอง. ดู retro 2026-04-18-p1.
4. **RSC navigation** — ไม่มี `component={Link}` ใน server component. `grep -rn "component={Link}" <files>`
5. **Type-check** — รัน project type-check (`npx tsc --noEmit` หรือดู package.json scripts). FAIL ถ้า error.
6. **Scope** — ทำตรง scope ที่ planner กำหนด ไม่ creep
7. **ภาษา/convention** — UI copy ไทย, validation ถูก layer (Valibot API / Yup form), service แยกจาก API

deep-ref: `docs/conventions/ui-page-sourcing.md`, `rsc-mui-navigation.md`, `agent-team-workflow.md`.

## Output format
```
GATE 1 Base: line — PASS/FAIL — <evidence: commit body excerpt>
GATE 2 Read-before-Write — PASS/FAIL — <file:line vs theme:line>
...
VERDICT: MERGE / REWORK
REWORK items (ถ้ามี): numbered, file:line, สิ่งที่ต้องแก้
```

ห้ามแก้ไฟล์. ห้ามเขียน "ผมว่าน่าจะ ok โดยรวม". ทุก gate ต้องมี evidence.
```

- [ ] **Step 2: ตรวจ frontmatter valid (read-only tools)**

Run: `head -6 .claude/agents/safepay-reviewer.md`
Expected: `tools: Read, Glob, Grep, LS, Bash` — ไม่มี Write/Edit

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/safepay-reviewer.md
git commit -m "feat(claude): safepay-reviewer subagent (read-only, independent)

Base: docs/conventions/agent-team-workflow.md (Reviewer gate checklist)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: safepay-qa subagent

**Files:**
- Create: `.claude/agents/safepay-qa.md`

- [ ] **Step 1: เขียนไฟล์ agent**

```markdown
---
name: safepay-qa
description: Use หลัง safepay-reviewer pass บน user-facing task — QA 3-level ผ่าน Chrome DevTools MCP ที่ *.deepth.local:4000. ไม่ start dev server (user รันเอง). seed via Prisma. report PASS/FAIL + evidence.
tools: Bash, Read, Glob, Grep, mcp__chrome-devtools__navigate_page, mcp__chrome-devtools__take_snapshot, mcp__chrome-devtools__take_screenshot, mcp__chrome-devtools__click, mcp__chrome-devtools__fill, mcp__chrome-devtools__fill_form, mcp__chrome-devtools__wait_for, mcp__chrome-devtools__list_console_messages, mcp__chrome-devtools__list_network_requests, mcp__chrome-devtools__new_page, mcp__chrome-devtools__list_pages, mcp__chrome-devtools__select_page
model: sonnet
---

คุณคือ QA agent ของ SafePay. ทดสอบ feature จริงผ่าน browser. type-check + code review ไม่พิสูจน์ว่า feature ทำงาน — คุณคือ gate ที่พิสูจน์.

## กฎเหล็ก
- **ห้าม start dev server** — user รันเองที่ port 4000. ถ้า `curl -s http://deepth.local:4000/ -o /dev/null -w "%{http_code}"` ไม่ใช่ 2xx/3xx → report กลับ Controller ว่า server ไม่รัน หยุด ไม่ start เอง.
- **ใช้ subdomain จริงเท่านั้น**: `http://deepth.local:4000` (buyer), `http://seller.deepth.local:4000`, `http://admin.deepth.local:4000` — ห้าม localhost (proxy.ts route ตาม subdomain, cookie per-host).
- **Seed ข้อมูลซับซ้อนผ่าน Prisma**: `.env.local` ชี้ Supabase ที่ dev server ใช้ — source ก่อนรัน tsx script.
- **OTP**: test-account bypass ใน `src/lib/otp.ts` (ดู retro r1-r11) หรืออ่าน OTP จาก dev log.
- **Cleanup** seed data ปลายรันถ้าทำได้.

## 3-level cadence (เลือก level ตามที่ Controller สั่ง)
| Level | เมื่อ | ทำอะไร |
|---|---|---|
| smoke | หลัง reviewer pass / user-facing task | navigate URL ใหม่; `take_snapshot`; assert heading/form/widget สำคัญ render; `list_console_messages` fail ถ้ามี runtime error. ไม่ submit form. ~60s |
| batch-E2E | หลัง batch ≤3 tasks | drive form จริง (`fill_form`,`click`,`wait_for`); verify optimistic UI; verify DB persist (เปิด read-back page หาข้อมูลใหม่); happy path + ≥1 negative path; console clean ตลอด. ~5min |
| end-of-phase | task สุดท้ายของ phase | เดินทุก PRD FR ของ phase + cross-subdomain (เช่น seller สร้าง order → /o/{token} บน buyer → OTP confirm → review → /u/{username} rating bump). PASS/FAIL ต่อ FR. ~15min |

deep-ref: `docs/conventions/agent-team-workflow.md` §"3-level QA cadence" (มี scenario ตัวอย่าง).

## Output format
```
LEVEL: smoke|batch-E2E|end-of-phase
SCENARIO 1: <ชื่อ> — PASS/FAIL — evidence: <screenshot filename / assertion / console excerpt>
...
VERDICT: MERGE / REWORK
REWORK: numbered, อาการ + ที่เกิด
```
```

- [ ] **Step 2: ตรวจ frontmatter valid**

Run: `head -6 .claude/agents/safepay-qa.md`
Expected: `name: safepay-qa`, `tools:` มี `mcp__chrome-devtools__navigate_page` และ Bash, `model: sonnet`

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/safepay-qa.md
git commit -m "feat(claude): safepay-qa subagent (Chrome DevTools MCP, 3-level)

Base: docs/conventions/agent-team-workflow.md (3-level QA cadence + operating rules)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ui-theme-sourcing skill (Hard Rule 1+3)

**Files:**
- Create: `.claude/skills/ui-theme-sourcing/SKILL.md`

- [ ] **Step 1: เขียน SKILL.md**

```markdown
---
name: ui-theme-sourcing
description: Use BEFORE any Write or Edit ของ page/component/layout ใน src/app/**, src/views/**, src/components/** (SafePay/Deep). Enforce theme-copy (no UI from scratch) + Base: commit line. ครอบทั้ง buyer Vuexy และ seller/admin Paces.
---

# UI Theme Sourcing — Hard Rule 1 + 3

ทุกหน้า/component/layout ต้องเริ่มจาก **copy ไฟล์ theme ที่ระบุเจาะจง** แล้วปรับ content. "inspired by" / "ใช้ component เดียวกัน" / "คล้าย ๆ" = ไม่ผ่าน.

## Pre-write checklist (ตอบใน response ก่อน Write ทุกครั้ง)
1. Target route: `src/app/.../page.tsx`
2. Theme source ผม copy: `theme/<vuexy|paces>/.../file.tsx`
3. ผม Read theme source นั้น turn นี้แล้ว: ✅ / ❌

ถ้า 3 = ❌ → หยุด Read ก่อน. ถ้า 2 กำกวม → หยุด research ด้วย Glob/Grep จน name file เดียวได้.

## Theme mapping
| Route | Theme | Source root |
|---|---|---|
| `src/app/(marketing)/**` (buyer+landing+public `/u/[username]`,`/o/[token]`) | Vuexy | `theme/vuexy/typescript-version/full-version/src/` |
| `src/app/(paces)/seller/**` | Paces | `theme/paces/Admin/TS/src/` |
| `src/app/(paces)/admin/**` | Paces | `theme/paces/Admin/TS/src/` |

## Copy workflow
1. ระบุ theme path 2. `Read` theme 3. cp/Write→target 4. `Edit` swap content ไทย 5. strip dep ไม่ใช้ (copy dep / stub / strip — least invasive) 6. type-check + browser QA

## Commit rule (Hard Rule 3)
commit ที่แตะ UI ต้องมี body:
```
Base: theme/<vuexy|paces>/.../<file>.tsx
Widgets adapted: ...
Dropped: ...
```
`Base:` ต้องชี้ `theme/...` — ห้ามชี้ `src/...` (retro 2026-05-10 task 12 พังเพราะข้อนี้).

## ไม่ applies
backend (`src/app/api/**`,`src/services/**`,`src/lib/**`), trivial tsx utility (เช่น mui-link wrapper).

## Deep reference (อ่านเมื่อต้องการ page-type→theme file mapping เต็ม + dependency handling)
`docs/conventions/ui-page-sourcing.md` — มีตาราง SafePay page → Vuexy/Paces source ครบทุกหน้า.
```

- [ ] **Step 2: ตรวจ frontmatter valid**

Run: `head -4 .claude/skills/ui-theme-sourcing/SKILL.md`
Expected: `---` / `name: ui-theme-sourcing` / `description:` (มีคำว่า BEFORE + src/app) / `---`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/ui-theme-sourcing/SKILL.md
git commit -m "feat(claude): ui-theme-sourcing skill (Hard Rule 1+3)

Deep-ref: docs/conventions/ui-page-sourcing.md (คงไว้, ไม่ duplicate เข้า skill)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: rsc-mui-nav skill (Hard Rule 2)

**Files:**
- Create: `.claude/skills/rsc-mui-nav/SKILL.md`

- [ ] **Step 1: เขียน SKILL.md**

```markdown
---
name: rsc-mui-nav
description: Use เมื่อแก้/เขียน server component ใน SafePay/Deep ที่มี link หรือ navigation (MUI Button/Chip + next/link). ป้องกัน RSC serialization error จาก component={Link}.
---

# RSC + MUI Navigation — Hard Rule 2

RSC ปฏิเสธการ serialize component function prop ข้าม server→client boundary. ห้ามใช้ `component={Link}` บน MUI element ใน server component.

## ใช้แทน
- `LinkButton` / `LinkChip` wrapper ที่ `src/app/<group>/_components/mui-link.tsx`
- หรือ wrap `<Button>` ด้วย `<Link>` (Link นอก, Button ใน)

## เช็คก่อน commit
`grep -rn "component={Link}" <ไฟล์ที่แก้>` — ต้องไม่เจอใน server component.

## Deep reference (pattern เต็ม + ตัวอย่าง client-wrapper)
`docs/conventions/rsc-mui-navigation.md`
```

- [ ] **Step 2: ตรวจ frontmatter valid**

Run: `head -4 .claude/skills/rsc-mui-nav/SKILL.md`
Expected: `name: rsc-mui-nav`, description กล่าวถึง server component + navigation

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/rsc-mui-nav/SKILL.md
git commit -m "feat(claude): rsc-mui-nav skill (Hard Rule 2)

Deep-ref: docs/conventions/rsc-mui-navigation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: agent-team-phase skill (Hard Rule 4 orchestration)

**Files:**
- Create: `.claude/skills/agent-team-phase/SKILL.md`

- [ ] **Step 1: เขียน SKILL.md**

```markdown
---
name: agent-team-phase
description: Use เมื่อจะเริ่ม phase ใด ๆ ใน SafePay/Deep ที่มี ≥3 tasks (P1,P2,R1-R11, multi-step build). บังคับ workflow Planner→Developer→Reviewer→QA→Controller แทน single-threaded build.
---

# Agent-Team Phase Orchestration — Hard Rule 4

phase ที่มี ≥3 tasks ห้าม build single-threaded. background: P1 build เดี่ยว พัง theme-copy 10 หน้าโดยไม่มี checkpoint (retro 2026-04-18-p1).

## Controller (main session) คือคนเดียวที่ commit / mark task complete

## 5 gates ต่อ task
1. **Plan** — dispatch `safepay-planner` → ได้ target↔theme mapping + atomic-commit boundary. ไม่มีแผน → ไม่ dispatch.
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
ทุก task done + QA เขียว → invoke skill `phase-retro` ก่อน claim phase complete.

## ไม่ใช้ team
single-file single-concept change, exploration ที่ Grep/Read ตอบใน 30s, debugging ที่ Controller มี context ครบแล้ว.

## Deep reference (prompt templates เต็ม + scenario QA + TODO→task)
`docs/conventions/agent-team-workflow.md`
```

- [ ] **Step 2: ตรวจ frontmatter valid**

Run: `head -4 .claude/skills/agent-team-phase/SKILL.md`
Expected: `name: agent-team-phase`, description กล่าวถึง ≥3 tasks + phase

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/agent-team-phase/SKILL.md
git commit -m "feat(claude): agent-team-phase skill (Hard Rule 4 orchestration)

Deep-ref: docs/conventions/agent-team-workflow.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: phase-retro skill

**Files:**
- Create: `.claude/skills/phase-retro/SKILL.md`

- [ ] **Step 1: เขียน SKILL.md**

```markdown
---
name: phase-retro
description: Use เมื่อ phase ของ SafePay/Deep เสร็จ (ทุก task done + QA เขียว) ก่อน claim phase complete. เขียน retro + promote convention ไป CLAUDE.md/conventions/memory.
---

# Phase Retrospective — Hard Rule 4 (ปลาย phase)

หลังทุก phase เสร็จ ต้องทำก่อน claim complete:

## 1. เขียน `docs/retro/YYYY-MM-DD-<phase-name>.md` (ภาษาไทย)
ครอบ:
- **Problems** — อะไรพัง + evidence (file path, error, commit hash)
- **Root causes** — ≥1 "ทำไม" ต่อปัญหา
- **Conventions to adopt** — เขียนเป็นกฎ actionable ไม่ใช่ guidance ลอย
- **What went right** — anchor ที่ควรทำซ้ำ
- **Action items** — numbered, concrete

## 2. Promote convention
- กฎที่ Claude ต้องทำทุก session → `CLAUDE.md` (ตาราง HARD RULES) + `docs/conventions/<topic>.md` (workflow เต็ม) + พิจารณาทำเป็น skill ใหม่ใน `.claude/skills/`
- personal-Claude reminder → `~/.claude/projects/-Users-craftman-Projects-safepay/memory/feedback_<topic>.md` + เพิ่ม 1 บรรทัดใน `MEMORY.md`
- team process → `docs/conventions/` อย่างเดียว

## 3. Commit retro + convention update แยก commit ปลาย phase (ไม่ bundle กับ feature work)

## Deep reference
`docs/conventions/agent-team-workflow.md` §"Per-phase retrospective"
```

- [ ] **Step 2: ตรวจ frontmatter valid**

Run: `head -4 .claude/skills/phase-retro/SKILL.md`
Expected: `name: phase-retro`, description กล่าวถึง phase เสร็จ + retro

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/phase-retro/SKILL.md
git commit -m "feat(claude): phase-retro skill

Deep-ref: docs/conventions/agent-team-workflow.md §retro

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Slim CLAUDE.md HARD RULES section

**Files:**
- Modify: `CLAUDE.md` (section ตั้งแต่ `## 🛑 HARD RULES — read this first, every time` ถึง `---` ก่อน `## Project Overview`)

- [ ] **Step 1: Read CLAUDE.md เพื่อจับ exact text ของ section ที่จะแทน**

Run: อ่าน `/Users/craftman/Projects/safepay/CLAUDE.md` (Read tool, ทั้งไฟล์)
Expected: เห็น section "## 🛑 HARD RULES" 4 ข้อ (prose ยาว) จบด้วย `---` ก่อน "## Project Overview"

- [ ] **Step 2: แทน section HARD RULES ทั้งบล็อกด้วยตาราง**

ใช้ Edit tool: old_string = ทั้ง section ตั้งแต่ `## 🛑 HARD RULES — read this first, every time` จนถึงบรรทัด `---` ที่อยู่ก่อน `## Project Overview` (รวม sub-section 1-4 prose ทั้งหมด). new_string =

```markdown
## 🛑 HARD RULES — enforced by project skills

กฎเหล่านี้ enforce ผ่าน project-local skills ใน `.claude/skills/` (trigger อัตโนมัติ) — เมื่อ skill activate ให้ทำตาม skill ไม่ใช่จำจากที่นี่. Subagents ใน `.claude/agents/` ฝัง contract เดียวกัน.

| # | Rule | Skill (auto-trigger) | Deep reference |
|---|---|---|---|
| 1 | No UI from scratch — ทุกหน้า/component ต้อง copy จาก theme file ที่ระบุ แล้วปรับ content | `ui-theme-sourcing` | `docs/conventions/ui-page-sourcing.md` |
| 2 | No `component={Link}` ใน server component — ใช้ LinkButton/LinkChip wrapper | `rsc-mui-nav` | `docs/conventions/rsc-mui-navigation.md` |
| 3 | Commit ที่แตะ UI ต้องมี `Base:` line ชี้ `theme/...` ที่ copy มา | `ui-theme-sourcing` | `docs/conventions/ui-page-sourcing.md` |
| 4 | Phase ≥3 tasks = agent team (Planner→Developer→Reviewer→QA→Controller, 5 gates, 3-level QA) + retro ปลาย phase | `agent-team-phase`, `phase-retro` | `docs/conventions/agent-team-workflow.md` |

Subagents: `safepay-planner` `safepay-developer` `safepay-reviewer` `safepay-qa` (ทุกตัว Sonnet; Controller = main session).

---
```

- [ ] **Step 3: ตรวจ CLAUDE.md ยังครบ**

Run: `grep -n "Project Overview\|@AGENTS.md\|Current State Snapshots\|HARD RULES — enforced" CLAUDE.md`
Expected: เจอทั้ง 4 — section ใหม่ "HARD RULES — enforced" + Project Overview/Current State Snapshots/@AGENTS.md ยังอยู่ครบ (ไม่ลบ context อื่น)

- [ ] **Step 4: ตรวจ convention docs ไม่ถูกแตะ**

Run: `git status --porcelain docs/conventions/`
Expected: ว่าง (ไม่มี output) — convention docs 3 ไฟล์เดิมไม่ถูกแก้

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): slim HARD RULES section → ตาราง rule→skill→deep-ref

prose 4 hard rules ย้ายไป .claude/skills/ (auto-trigger). CLAUDE.md เหลือ
ตารางสรุป + pointer. context อื่น (architecture/tech stack/snapshots) คงครบ.
convention docs เดิมคงเป็น deep-ref ไม่แก้.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Verify activation + final check

**Files:** (ไม่สร้างไฟล์ — verification เท่านั้น)

- [ ] **Step 1: ตรวจไฟล์ครบ 8 + structure**

Run: `find .claude -type f | sort`
Expected: 4 ไฟล์ `.claude/agents/safepay-{planner,developer,reviewer,qa}.md` + 4 ไฟล์ `.claude/skills/{ui-theme-sourcing,rsc-mui-nav,agent-team-phase,phase-retro}/SKILL.md`

- [ ] **Step 2: ตรวจทุก frontmatter parse ได้**

Run: `for f in .claude/agents/*.md .claude/skills/*/SKILL.md; do echo "== $f =="; awk 'NR==1{if($0!="---"){print "BAD: no opening ---"; exit 1}} NR>1 && /^---$/{print "OK frontmatter close at line " NR; exit 0}' "$f"; done`
Expected: ทุกไฟล์ "OK frontmatter close" — ไม่มี "BAD"

- [ ] **Step 3: ตรวจ git สะอาด**

Run: `git status --porcelain && git log --oneline -10`
Expected: working tree เกี่ยวกับงานนี้ commit หมด; เห็น ~9 commits (Task 1-9) + spec commit

- [ ] **Step 4: Smoke-test skill activation (manual, ใน session ใหม่)**

หมายเหตุสำหรับผู้รัน: เปิด case "จะแก้ไฟล์ใน `src/app/(marketing)/.../page.tsx`" ใน session ใหม่ → คาดว่า skill `ui-theme-sourcing` ถูกเสนอ/activate. ถ้าไม่ activate → ปรับ `description:` ให้ trigger ชัดขึ้น (เพิ่ม keyword src/app, page, component) แล้ว amend commit Task 5.

- [ ] **Step 5: Commit (ถ้ามีการปรับ description จาก step 4 เท่านั้น)**

```bash
git add .claude/skills/
git commit -m "fix(claude): ปรับ skill description ให้ trigger ตรงจังหวะ (จาก smoke test)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (เขียนแผนเสร็จ)

**Spec coverage:** ทุก §spec มี task — §1 subagents→Task1-4; §2 skills→Task5-8; §3 CLAUDE.md slim→Task9; Acceptance (frontmatter valid / docs ไม่แก้ / project-local / activation test)→Task10. ✅
**Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีเนื้อไฟล์เต็ม + คำสั่งจริง + expected output. ✅
**Type consistency:** ชื่อ agent/skill ตรงกันทุก task (safepay-planner/developer/reviewer/qa; ui-theme-sourcing/rsc-mui-nav/agent-team-phase/phase-retro); CLAUDE.md ตาราง Task9 อ้าง skill ชื่อตรงกับ Task5-8. ✅

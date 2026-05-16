# Design — Codify SafePay conventions เป็น Claude Code Agents + Skills

วันที่: 2026-05-16
สถานะ: approved-pending-spec-review

## ปัญหา

Project มี convention ที่แข็งแรงแต่ทั้งหมดเป็น **prose docs** (`CLAUDE.md` + `docs/conventions/*.md`).
ยังไม่มี `.claude/agents/` หรือ `.claude/skills/` จริง — การ enforce พึ่ง Controller (main session)
อ่าน + จำ + อ้างอิง doc เองทุกครั้ง. retro ยืนยันว่า 3 hard rules พังซ้ำ:

1. theme-copy ไม่ทำ (compose จาก primitives) — P1 rework ทั้ง 10 หน้า
2. `component={Link}` ใน RSC
3. commit ขาด `Base:` line — เพิ่งพังอีกใน retro 2026-05-10 (task 12)

retro สรุปเอง: *"The conventions are the value"* + *"front-loading conventions before any code"*
คือสิ่งที่กู้ project. เป้าหมาย: เปลี่ยน prose → executable skills + custom subagents ที่
trigger/enforce ตัวเองได้.

## เป้าหมาย (จาก brainstorm)

- **ทั้งสองอย่าง**: (a) enforce 3 hard rules ผ่าน skill อัตโนมัติ + (b) codify agent-team-workflow
  เป็น subagents + orchestration skill
- CLAUDE.md: **slim + ชี้ไป skills** — ตัด prose ยาว เหลือตารางสรุป rule→skill→deep-ref
- เก็บที่ **project-local `.claude/`** (commit เข้า git)
- subagent ทั้ง 4: **Sonnet** (Controller = Opus)
- convention docs เดิม 3 ไฟล์: **คงไว้เป็น deep-ref** (skill สั้น, ชี้ไป doc; retro/commit ยัง link doc ได้)

## แนวทางที่เลือก

แนวทาง **C**: Skills enforce rules + Subagents เป็น team roles + skill orchestrate ทั้ง phase.
(ปฏิเสธ A skills-only — orchestration ยังพึ่ง memory; ปฏิเสธ B subagents-only — hard rules ยัง prose)

## องค์ประกอบ

### 1. Custom subagents — `.claude/agents/` (4 ไฟล์, ทุกตัว model: sonnet)

แต่ละไฟล์เป็น markdown + frontmatter (`name`, `description`, `tools`, `model: sonnet`).
system prompt ฝัง contract จาก `agent-team-workflow.md`.

| ไฟล์ | name | description (เมื่อไรถูกเรียก) | tools |
|---|---|---|---|
| `safepay-planner.md` | safepay-planner | ก่อนเริ่ม phase ≥3 tasks — ออก step plan + theme-source mapping table (target↔theme file) + atomic-commit boundary | Glob, Grep, LS, Read, NotebookRead, WebFetch, WebSearch, TodoWrite |
| `safepay-developer.md` | safepay-developer | ทำ 1 task ของ phase — ฝัง 3 hard rules + copy-workflow ใน system prompt | Read, Write, Edit, Glob, Grep, LS, Bash, TodoWrite |
| `safepay-reviewer.md` | safepay-reviewer | หลัง developer ทุก task — independent gate-check, ห้าม pre-bias | Read, Glob, Grep, LS, Bash |
| `safepay-qa.md` | safepay-qa | หลัง reviewer pass บน user-facing task — 3-level QA ผ่าน Chrome DevTools MCP | Bash, Read, Glob, Grep, mcp__chrome-devtools__* |

contract สำคัญในแต่ละ system prompt:

- **planner**: output ต้องมีตาราง `target path | theme source path | scope (≤2 ประโยค) | atomic-commit unit`.
  ถ้า name theme file ไม่ได้ → บอก Controller ว่าต้อง Explore ก่อน ห้ามเดา.
- **developer**: เริ่มด้วยการ `Read` theme source ที่ระบุ → ตอบ pre-write 3-question checklist
  ในข้อความ → cp/Write → Edit content → strip dep → type-check → commit พร้อม `Base:` line.
  report format: ทำอะไร / skip อะไรเพราะอะไร / blockers / commit hash.
- **reviewer**: เช็ก list — Base: line มี? developer Read theme ก่อน Write? sourced หรือ recomposed?
  RSC nav ถูก? `tsc` clean? — output `PASS`/`FAIL` + file:line. ห้ามใส่ "ผมว่าน่าจะ ok".
- **qa**: ไม่ start dev server (user รันเอง port 4000). ใช้ `*.deepth.local:4000` เท่านั้น.
  seed via Prisma (`.env.local`). 3-level cadence (smoke / batch-E2E / end-of-phase).
  report PASS/FAIL ต่อ scenario + evidence (screenshot filename / assertion / console excerpt)
  + แนะ MERGE/REWORK.

### 2. Skills — `.claude/skills/` (4 โฟลเดอร์, แต่ละอันมี SKILL.md)

| โฟลเดอร์ | trigger (description) | เนื้อหา (สั้น) | deep-ref |
|---|---|---|---|
| `ui-theme-sourcing/` | ก่อน Write/Edit ไฟล์ UI ใน `src/app/**`,`src/views/**`,`src/components/**` (page/component/layout) | Hard Rule 1+3: pre-write 3-question checklist, copy workflow 6 ขั้น, theme mapping table (ย่อ), `Base:` commit rule | `docs/conventions/ui-page-sourcing.md` |
| `rsc-mui-nav/` | แก้ server component ที่มี link/navigation ใน route group ใด ๆ | Hard Rule 2: ห้าม `component={Link}`, ใช้ LinkButton/LinkChip wrapper | `docs/conventions/rsc-mui-navigation.md` |
| `agent-team-phase/` | phase ที่มี ≥3 tasks (P*, R*, multi-step build) | orchestrate 5 gates (Plan→Develop→Review→QA→Integrate), batch ≤3 parallel, dispatch subagent ทั้ง 4, 3-level QA cadence, prompt contract | `docs/conventions/agent-team-workflow.md` |
| `phase-retro/` | จบ phase (ทุก task done + QA เขียว) ก่อน claim phase complete | เขียน `docs/retro/YYYY-MM-DD-<phase>.md` (problems/root-causes/conventions/action-items) + promote convention → CLAUDE.md/conventions/memory + commit แยก | `agent-team-workflow.md` §retro |

หลักการ skill: SKILL.md สั้น (เนื้อ actionable + ตารางย่อ) → ชี้ไป deep-ref doc สำหรับรายละเอียดเต็ม.
ไม่ duplicate เนื้อ doc เข้า SKILL.md (single source = convention doc; retro/commit ยัง link doc ได้).

### 3. CLAUDE.md — slim

- **คงไว้**: Project Overview, Architecture, Tech Stack, Directory Structure, Core Systems,
  Conventions (รายการสั้น), Current State Snapshots, `@AGENTS.md`
- **แทน**: บล็อก prose ยาวของ 4 hard rules (section "🛑 HARD RULES") →
  เหลือ **ตารางเดียว**:

  | Rule | Enforced by skill | Deep ref |
  |---|---|---|
  | 1. No UI from scratch — copy from theme | `ui-theme-sourcing` | `docs/conventions/ui-page-sourcing.md` |
  | 2. No `component={Link}` in RSC | `rsc-mui-nav` | `docs/conventions/rsc-mui-navigation.md` |
  | 3. Commit cites `Base:` theme source | `ui-theme-sourcing` | (เดียวกัน) |
  | 4. Multi-step phase = agent team | `agent-team-phase` + `phase-retro` | `docs/conventions/agent-team-workflow.md` |

- ระบุชัดว่า skill เหล่านี้เป็น project-local — เมื่อ trigger ให้ทำตาม skill ไม่ใช่จำจาก CLAUDE.md
- ผลคาดหวัง: section HARD RULES สั้นลง ~60%, enforcement ย้ายไป auto-trigger skill

## นอกขอบเขต (YAGNI)

ไม่สร้าง skill สำหรับ valibot/yup, registry-enum pattern, brand-naming — retro บอก
"ถ้ามี enum หลายตัวค่อย promote" ยังไม่ถึงจุดนั้น. brand-naming เป็น spot-check ปลายทาง
ไม่ใช่ pre-write gate.

## โครงสร้างไฟล์ผลลัพธ์

```
.claude/
├── agents/
│   ├── safepay-planner.md
│   ├── safepay-developer.md
│   ├── safepay-reviewer.md
│   └── safepay-qa.md
└── skills/
    ├── ui-theme-sourcing/SKILL.md
    ├── rsc-mui-nav/SKILL.md
    ├── agent-team-phase/SKILL.md
    └── phase-retro/SKILL.md
docs/conventions/*.md          # คงเดิม — deep-ref
CLAUDE.md                      # slim section HARD RULES → ตาราง
```

## Acceptance

- [ ] 4 agent files valid (frontmatter ครบ, model: sonnet, tools เหมาะกับ role)
- [ ] 4 SKILL.md valid (frontmatter `name` + `description` ที่ trigger ถูกจังหวะ, เนื้อสั้น + ชี้ deep-ref)
- [ ] CLAUDE.md HARD RULES section แทนด้วยตาราง, ส่วน context อื่นคงครบ, `@AGENTS.md` ยังอยู่
- [ ] convention docs 3 ไฟล์ไม่ถูกแก้ (ยัง deep-ref ได้)
- [ ] ทุกอย่าง project-local ใน `.claude/`, commit เข้า git
- [ ] ลอง trigger 1 skill (เช่น เปิด case จะแก้ไฟล์ UI) แล้ว skill activate จริง
```

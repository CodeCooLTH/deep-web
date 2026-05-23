# Agent Team Workflow — Mandatory Process

> **Every multi-step phase (P1, P2, …, R1-R11, etc.) MUST use an agent team, not a single-threaded build.**
>
> Background: P1 was built single-threaded and violated the theme-copy rule across 10 pages without a checkpoint. An independent reviewer agent would have caught the drift at page #2. See `docs/retro/2026-04-18-p1-retrospective.md`.

## Team roles

| Role | Subagent type | When to dispatch |
|---|---|---|
| **Controller** | (the main Claude session) | Coordinates the phase, tracks tasks, integrates agent outputs, makes final go/no-go calls |
| **Planner** | `Plan` | Before a phase starts — produce step plan + file list + theme-source mapping |
| **Explorer** | `Explore` | When unsure which theme file to copy or how an existing piece of code works — use BEFORE writing |
| **Developer** | `general-purpose` (or `feature-dev:code-architect` for design work) | Per independent task; can be run in parallel for independent tasks |
| **Reviewer** | `feature-dev:code-reviewer` or `superpowers:code-reviewer` | After EACH developer agent reports back, before the Controller marks a task complete |
| **QA** | `general-purpose` (uses `mcp__chrome-devtools__*` tools) | After Reviewer passes, for any user-facing page task; also after each batch for integration; also at end-of-phase. See the 3-level cadence below. |
| **Architect sweep** | `feature-dev:code-architect` | End of phase — sanity-check the whole phase for structural coherence |

The Controller is the only role that may commit, update task state, or claim a task complete. Developer agents *propose* work; Reviewers *flag* issues; the Controller *decides*.

## Parallelism

- **Independent tasks → parallel.** If two tasks touch different files and have no sequential dependency, dispatch both developer agents in the **same tool message** (multiple `Agent` calls).
- **Dependent tasks → sequential.** If task B needs task A's output, run A → review → B.
- **Review is never parallelized with the work it reviews.** Always developer → review, never developer alongside reviewer of the same thing.
- **Batch size ceiling: 3 concurrent developer agents.** More than 3 overloads the Controller's integration step; break larger phases into sub-batches.

## Mandatory checkpoints

Every task passes through five gates before being marked complete:

1. **Plan** — a named theme source file path + target path + scope (one or two sentences). No plan → don't dispatch.
2. **Develop** — Developer agent executes; reports file diffs + commands run + any blockers.
3. **Review** — Reviewer agent independently checks against project conventions:
   - Does the commit cite a `Base:` theme file? (hard rule 3)
   - Did the developer actually `Read` that theme file before writing? (hard rule 1)
   - Is the output sourced from the theme, or recomposed from primitives?
   - Does it honor RSC navigation rules? (hard rule 2)
   - TypeScript clean?
4. **QA** — QA agent exercises the page in a real browser via the Chrome DevTools MCP. See the 3-level cadence below. Required for any task that produces a user-facing page or flow; skipped only for pure-infrastructure tasks (e.g. R1 shell copies that have no standalone URL).
5. **Integrate** — Controller reads the review + QA findings, decides pass/fail. On fail, re-dispatch Developer with the review + QA findings. On pass, commit and mark task complete.

## 3-level QA cadence (required)

Type-check and code review alone do NOT prove a feature works. QA via Chrome DevTools MCP is mandatory at three levels. **Level 2 and 3 are functional E2E tests, not smoke tests** — they actually fill forms, submit data, verify persistence, and walk cross-subdomain flows.

| Level | When | Scope | What it actually does |
|---|---|---|---|
| **Per-task smoke** | After Reviewer pass on a user-facing task | Load + render check only, ~60s | Navigate to the new page URL; `take_snapshot`; assert key headings/forms/widgets appear; `list_console_messages` and fail on runtime errors. No form submission. |
| **Batch integration** | After every batch of ≤3 tasks | **Functional E2E across the batch**, ~5min | Drive each form with realistic input (`fill_form`, `click`, `wait_for`); verify optimistic UI updates; verify DB persistence by navigating to a read-back page and finding the new data; verify toasts/status chips change; check `list_console_messages` for errors throughout. Tests the happy path + at least one negative path (e.g. wrong OTP, invalid input). |
| **End-of-phase** | Last task of the phase | **Full PRD feature walk with cross-subdomain flows**, ~15min | Execute every PRD FR applicable to the phase. Includes cross-subdomain end-to-end: e.g. **seller creates order on `seller.deepth.local:4000` → copy `/o/{token}` → open on `deepth.local:4000` as buyer → enter OTP → confirm → submit review → navigate to `/u/{sellerUsername}` → verify rating bumped**. Produces PASS/FAIL per FR. |

### Example QA agent scenarios for SafePay buyer

**Per-task smoke** (after R5 /reviews):
- Navigate to `http://deepth.local:4000/reviews` (logged in).
- Snapshot; assert "รีวิวที่ให้" heading, filter input, table/list container render.
- No console errors.

**Batch integration** (after R5/R6/R7 — reviews / profile / verification):
- Sign in (real OTP via `/api/otp/send` + dev log read).
- Go to `/settings/profile` → change `displayName` → click "บันทึก" → expect toast → reload → assert new name appears on dashboard welcome.
- Go to `/settings/verification` → upload two small PNGs as L2 → submit → expect toast + status chip → reload → chip still "กำลังตรวจสอบ".
- Go to `/reviews` → if reviews exist, verify shop link goes to correct `/u/{username}`. If none, verify empty state copy.
- Throughout: `list_console_messages` shows no errors.

**End-of-phase** (R11 — full buyer PRD walk):
- FR-1 auth: register via phone OTP, verify dashboard loads.
- FR-2 verify: submit L2 docs; direct DB flip status=APPROVED; reload and assert L2 chip is "ยืนยันแล้ว".
- FR-5/6 order: seed an order for the test buyer via prisma; navigate to `/o/{token}`; enter OTP; confirm; expect status → CONFIRMED.
- FR-7 review: submit 5-star review on the confirmed order; verify seller `/u/{username}` shows the review with correct stars + comment.
- FR-8 history linking: create a guest review before signup; then sign up with the same phone; verify the review shows up in `/reviews`.
- FR-9 public profile: visit `/u/{sellerUsername}` while logged out; verify trust score, badges, reviews render.
- Cross-subdomain: log into `seller.deepth.local:4000`; create an order; copy link; open `/o/{token}` on `deepth.local:4000`; confirm; verify trust score bumped on seller.

### Operating rules

- **The user runs the dev server themselves on port 4000.** QA agents must NOT start a server. If `curl http://deepth.local:4000/` fails, the agent reports back to the Controller instead of starting one.
- **Always use the real dev subdomains** (`http://deepth.local:4000`, `seller.deepth.local:4000`, `admin.deepth.local:4000`) — NOT `localhost` — because `src/proxy.ts` routes by subdomain and cookies are per-host. See `feedback_qa_domains.md` memory.
- **Seed data via direct Prisma** for complex setup (creating test sellers/products/orders). `.env.local` points to the Supabase instance the dev server uses — source it when running tsx scripts.
- **OTP codes** are logged to the dev server stdout (`/tmp/dev.log` or wherever the user has the server writing) — tail the log to grab them.
- **Screenshots ต้องเขียนที่ `docs/qa-screenshots/` เท่านั้น** (gitignored) — ห้ามเขียน `qa-*.png` ที่ repo root (รก + เสี่ยง commit artifact; root มี `/qa-*.png` ใน .gitignore เป็น catch แต่ห้ามพึ่ง). dispatch QA ต้องสั่ง path นี้ใน prompt; safepay-qa ต้องใช้ `filePath: docs/qa-screenshots/<ชื่อ>.png` ทุก take_screenshot.
- **Cleanup** test data at end of QA agent run when possible (delete seeded sellers/orders) so subsequent QA runs start clean.
- **Report format:** PASS/FAIL per scenario with the specific evidence (screenshot filename, assertion output, console error excerpt). Recommend MERGE or REWORK for the Controller.

No skipping gates — even "obviously trivial" tasks get a reviewer pass. Trivial tasks return fast reviews; cost is low.

## Per-phase retrospective (mandatory)

After every phase completes (all tasks done, final QA green):

1. Controller spawns a retro step — can be done in-session (structured reflection) or via an agent. Either works; the artifact matters.
2. Produce `docs/retro/YYYY-MM-DD-<phase-name>.md` covering:
   - **Problems** — what went wrong, with evidence (file paths, error messages, commit hashes).
   - **Root causes** — at least one "why" for each problem.
   - **Conventions to adopt** — written as actionable rules, not vague guidance.
   - **What went right** — anchors worth repeating.
   - **Action items** — numbered list of concrete follow-ups.
3. For any convention identified:
   - If it's a rule Claude must follow every session → add to `CLAUDE.md` (as a hard rule) AND `docs/conventions/<topic>.md` (detailed workflow).
   - If it's a personal-Claude reminder → `~/.claude/.../memory/feedback_<topic>.md` + add a line to `MEMORY.md`.
   - If it's a team-wide process → only `docs/conventions/`.
4. Controller commits the retro + any convention updates as a separate commit at the end of the phase. Do not bundle with feature work.

## Writing an effective developer-agent prompt

Developer agents start with zero conversation context. The prompt must be self-contained:

- **Goal** (one sentence).
- **Target file(s)** to create or modify — absolute paths.
- **Theme source to copy** — absolute path; the agent must `Read` this first.
- **Content to adapt** — specific data fields, Thai copy, API endpoints.
- **Constraints** — type-check clean, no `component={Link}` in server components, commit with `Base:` line.
- **Done criteria** — what proves the task is complete (type-check passes, renders in browser, commit exists).
- **Format of report** — bulleted: what was done, what was skipped and why, any blockers.

Bad prompt: "Rewrite the dashboard using Vuexy."
Good prompt: "Rewrite `src/app/(marketing)/(buyer-app)/dashboard/page.tsx` as a copy of `theme/vuexy/.../apps/ecommerce/dashboard/page.tsx`. Keep the `<Grid container>` layout. Widgets to include: Congratulations (adapt to show trust score), StatisticsCard (orders/reviews/badges), Orders (recent buyer orders), Transactions (recent reviews given). Drop InvoiceListTable. Fetch data via getOrdersByBuyer/getReviewsByBuyer. Commit with `Base:` line citing the theme file. Report back with the commit hash and any widgets you had to stub."

## Writing an effective reviewer-agent prompt

- **What to review** — the commit hash (or file paths) the developer produced.
- **Checklist** — the specific hard rules + conventions to verify.
- **Output format** — PASS / FAIL with specific findings and line numbers.

Keep the reviewer agent INDEPENDENT — don't pre-bias with "I think it's fine". The whole point is an independent second opinion.

## When NOT to use agent teams

- Single-file, single-concept changes (e.g. fixing a typo).
- Pure exploration questions that a `Grep` or `Read` in the Controller can answer in under 30 seconds.
- Debugging an active failure where the Controller already has full context — delegating adds latency.

But "I'll just do it quickly myself" is a trap for multi-page phases. If the phase has ≥3 tasks, dispatch agents.

## TODO → task integration

- Each subtask corresponds to one TaskCreate entry (subject line = agent task title).
- Developer agent claims the task (Controller updates `owner`).
- After review pass, Controller marks the task completed.
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

---

## Lessons promoted — Achievements Phase 4 (retro 2026-05-16)

ที่มา: `docs/retro/2026-05-16-achievements-phase4.md`. กฎ actionable ต่อไปนี้บังคับทุก phase:

1. **Pre-flight ก่อนทุก feature/QA phase** (Controller, Phase 1 Discovery):
   - `git status` — ถ้าไม่ clean: enumerate งาน uncommitted ของ human, แล้ว commit งาน agent ด้วย **explicit `git add <paths>` เท่านั้น** (ห้าม `-A`/`git add .`) + verify `git diff <file>` แต่ละไฟล์ว่าเป็นของ agent ล้วนก่อน add.
   - probe dev server ด้วย `curl` หา **port จริง** — อย่าเชื่อ memory/หัวข้อ (เคยจำ 4000 จริง 3000).
   - ถ้า browser QA อยู่ใน scope: เช็ก chrome-devtools MCP connected ก่อน นับ QA เป็น blocker ถ้าไม่พร้อม (mark deferred ไม่ใช่ skip).
2. **Subagent: verify อย่า narrate.** ห้าม assert สาเหตุ repo/infra/ประวัติที่ไม่ได้ verify เอง. ผล test ที่ผันผวน: รัน ≥2 รอบ + map failing-test→function ก่อนสรุป flaky vs regression. Controller **ต้อง re-verify ทุก state-diagnosis ของ subagent** ก่อน act (เคย: dev วินิจฉัย setup.ts bug ที่ไม่มีจริง — reviewer รัน 2 รอบพบ 46/46).
3. **Schema nullable/enum change = downstream type-fix ทั้งหมดใน Unit เดียว.** Migration task ต้อง `prisma generate` → `tsc` เต็ม → แก้ทุก break ก่อน claim เสร็จ. Reviewer ของ schema change ต้อง review **หลัง** client regen (ไม่ใช่ก่อน).
4. **Service เปลี่ยนมา own side-effect** (เช่น recalc/award) → task เดียวกันต้องอัปเดต caller ทุกตัว; reviewer เช็ก caller redundancy (เคย: double `recalculateTrustScore`).
5. **Switch/handler guard ต้อง uniform** ทุก case; Vitest มี case ต่อ handler ยืนยัน invariant (เช่น earned⟹ratio=1). Test ที่ต้อง "work around" service behavior = **flag เป็น bug ห้ามกลบ**.
6. **Project agent/skill ที่เพิ่งสร้างใน session dispatch ไม่ได้จน session reload** — Controller วางแผนเผื่อ หรือใช้ general-purpose-embed อย่างรู้ตัว.

Anchor ที่ได้ผล (ทำซ้ำ): independent review+security gate จับ bug จริง + subagent misdiagnosis ได้ทุก batch; planner "ต้อง Explore" ไม่เดา theme source; selective `git add` + verify diff กัน commit ปน; surface CRITICAL ให้ user ตัดสินแทน auto-fix กลาง feature.

### Addendum (2026-05-16, follow-up batch) — Test/DB environment

**Root cause ของ subagent misdiagnosis "setup.ts teardown FK / infra flaky" ซ้ำ ~4 รอบ = ไม่มีใครเปิด `docs/conventions/seed-and-env.md`.** กฎบังคับ:

7. **รัน test = `npm run test` เท่านั้น** (= `dotenv -e .env` → **Local Docker Postgres**). **ห้าม** `dotenv -e .env.local` (= Supabase shared — `tests/setup.ts` มี guard throw + destructive `cleanDatabase()` จะ wipe ข้อมูล dev). ก่อนรัน test ใด ๆ Controller/subagent **ต้องอ่าน `docs/conventions/seed-and-env.md`** + pre-flight เช็ก Docker daemon up (`docker ps`); ถ้า Docker ดับ → test = **BLOCKED by env** (defer, เหมือน browser QA) — **ห้ามสรุปว่า regression หรือ infra-flaky จากการรันผิด env/ไม่มี DB**. map ทุก fail: assertion (`expect`) = code; `PrismaClientInitializationError`/connect/`cleanDatabase` ก่อน test body = env.
8. **เมื่อ test รันไม่ได้ (env blocker):** subagent ส่ง code + tsc + static behavior-preservation argument; Controller mark "code-gated, empirical test deferred" อย่างตรงไปตรงมา — **ห้าม claim verified-green**. ปลด defer เมื่อ env พร้อม (Docker up → `npm run test`).

### Addendum (2026-05-16) — Context-shift review + external-paid dependency

จาก retro `2026-05-16-real-sms-otp-apitel.md` (เปลี่ยน OTP mock→real apitel SMS; security เจอ HIGH ที่ reviewer มองข้าม — `consumeOtpRequestQuota` bypass เดิมปลอดภัยตอน console.log กลายเป็น cost-abuse ตอนส่ง SMS จริง). กฎบังคับ:

9. **Context-shift review:** เมื่อ task เปลี่ยน runtime behavior ของระบบ (mock→real / free→paid / internal→external call / sync→async) — reviewer **และ** security ต้อง grep โค้ดเดิม *นอก diff* ที่ assumption ถูกทำให้ผิด (`if (TEST_`/bypass/short-circuit/skip/`NODE_ENV` guard ที่เคย no-op จึงปลอดภัย) แล้วประเมินใหม่ภายใต้ behavior ใหม่. review แค่ diff lines = miss. dispatch `safepay-security` เป็น **mandatory** สำหรับ task free→paid / external-call (ไม่ใช่แค่ auth/env/upload).
10. **Lock external API schema ก่อน dispatch developer:** `safepay-developer` ไม่มี WebFetch — Controller ต้อง WebFetch ยืนยัน request+response schema (field names verbatim) ฝังใน developer prompt. ห้ามให้ developer เดา field name third-party API.
11. **Comment-follows-logic:** developer ที่ลบ/ย้าย logic ต้อง grep ชื่อ function/flag ที่ลบ ใน comment ทั้ง repo + อัปเดต comment ที่อ้างถึง ก่อนรายงานเสร็จ.
12. **External-paid-dependency QA:** provider ไม่มี sandbox + คิดเงินต่อ call → QA smoke ครอบ guard/error/degradation (invalid, format guard, rate-limit, provider-unconfigured→graceful) ด้วย curl; happy-path เต็มประกาศเป็น manual user-acceptance ระบุ pre-req (key + เบอร์จริง) ใน commit body + final report — ไม่ block phase เพราะรอ key.
14. **Mutable cross-request state ใน Next.js = `globalThis` singleton เสมอ + ต้องมีเทส real-path** (retro RC3, commit 82666cb — real OTP login 401 ทุกครั้งเพราะ `const otpStore = new Map()` ระดับ module ไม่ shared ข้าม route handler; Next.js bundle แต่ละ route แยก instance). กฎ: state ที่ต้องคงข้าม request/route (store, cache, rate-limit bucket) **ห้าม** `const x = new Map()` ระดับ module — ใช้ globalThis singleton (pattern `src/lib/prisma.ts`). และ **test-bypass/mock ที่ลัด real path บังบั๊กของ real path** — ทุก feature ต้องมี ≥1 เทสเดิน real path จริง (ไม่แตะ bypass) ก่อน claim complete (เคย: test-account `123456` เช็ก const ก่อนแตะ store → QA ทุกตัวเขียวทั้งที่ real login พัง).

13. **Verify external API ที่ boundary ด้วย credential จริง ก่อน mark complete** (retro follow-up debug 06f027c — sender `ATSMS` ที่เดาเอง โดน apitel 400, ตัวจริงคือ `ATLSMS`): unit test (mock) + smoke (unconfigured→503) ผ่าน **ยังไม่พอ**. เมื่อ user ให้ key → ยิง provider จริง 1 ครั้งด้วย cred จริง จับ gotcha ที่ docs ไม่บอก (sender/identity approval, IP allowlist, account default, credit). **identity field (sender/from/caller-id) ห้าม hardcode fallback** — เว้นว่าง = omit ให้ provider ใช้ default ของ account (เดาค่าใส่ = footgun ทำทุก request fail เงียบ). ตอนตั้งชื่อ env ใหม่: เทียบ convention provider เดิม (`grep -E '^[A-Z]+_(KEY|SECRET|ID)=' .env.example`) — โปรเจกต์นี้ใช้ `PROVIDER_FIELD` (`FACEBOOK_SECRET`) ไม่ใช่ `PROVIDER_API_FIELD`.

### Addendum (2026-05-16) — Phase B seller re-source (S1–S20)

จาก retro `2026-05-16-phase-b-seller-resource.md` + `docs/conventions/security-conventions.md`. กฎบังคับ:

15. **อย่าสมมุติ infra/proxy/env ปลอดภัย — verify เชิงประจักษ์** (root ของ 3 ปัญหาใหญ่ Phase B: P4 proxy, P2 env, P6 bypass). reviewer **ห้ามตัดสิน "proxy-safe"/"จะ rewrite ให้"** โดยไม่อ่าน `src/proxy.ts` + ไม่เทส flow จริง. `proxy.ts` `NextResponse.rewrite` ครอบแค่ cold HTTP GET — **ไม่ครอบ client `router.push`/server `redirect()`**. ทุก programmatic nav ใน `(paces)/seller/**` ต้อง explicit `/seller/*` (ดู `docs/system/ui-guideline/seller/page-sourcing.md`). assumption ผิดที่ไม่ verify แพร่ข้าม batch = systemic bug (เคย: seller login พังทั้ง flow, fix `eee83fb` 26 จุด).
16. **Security gate = mandate-before-commit ห้าม defer** — `safepay-security` mandatory สำหรับ task แตะ auth/PII/redirect/credential. required-fix ต้องแก้**ก่อน** commit ไม่ใช่ backlog (Phase B: CRITICAL prod auth-bypass P6 — hardcoded credential ไม่ NODE_ENV-gate; 3 PDPA leak; shopName auth-boundary). checklist: `docs/conventions/security-conventions.md` (PII@RSC-boundary, test-bypass prod-dead, auth-input server-validate, multi-write transaction).
17. **retro-QA หลังแก้ infra ก่อน trust QA** — ถ้า QA RED จาก env (DB ไม่ seed/wrong DB) → แก้ infra (`seed-and-env.md`) แล้ว **re-QA บน DB จริง**; env-gap บัง code defect (Phase B: seeded retro-QA เปิด 3 defect ที่ B3/B4 RED-env เคยกลบ). Controller แยก **RED-code vs RED-env vs RED-parallel-track** ชัดเจน — ไม่ block phase ด้วย env/OMS-collateral, ไม่ปล่อย code defect ผ่านเพราะ env เขียว.
18. **reviewer pre-commit ประเมิน code + JSDoc `Base:` ไม่ใช่ commit body** — working-tree uncommitted ≠ Hard Rule 3 FAIL (Controller commit ที่ integrate gate). อย่า noise gate-1 ซ้ำทุก batch.

### Addendum (2026-05-16) — Seller UI rework + Anuphan + parallel-dev/regression

จาก retro `2026-05-16-seller-ui-rework-anuphan.md`. กฎบังคับ:

19. **Combined-tsc verify หลัง parallel-dev batch ที่แตะไฟล์/area คาบเกี่ยว** — subagent report = snapshot ตอนนั้น ไม่ใช่ ground truth หลัง merge working tree. Controller รัน `tsc` (+test) เองก่อนเชื่อ dev คนใด (เคย: Unit-B/C tsc ขัดกัน, combined จริง EXIT:0).
20. **บั๊กที่ QA เจอกลาง phase → classify regression vs pre-existing ก่อน act** — `git diff --stat` (ไฟล์ต้นเหตุอยู่ใน scope?) + `git log` ไฟล์ + ไล่ stack ถึง vendor (Next.js dev overlay = React owner-stack ไม่ใช่ JS call stack — ไล่ผิดทางได้). pre-existing = แยก task/commit ห้ามยัดเข้า phase + ถาม user. agent ใหม่กลาง session = proxy ผ่าน `general-purpose`+Read contract (registry session-scoped; `.claude/` gitignored = agent file local-only). theme ไม่มี template → user อนุมัติ compose-from-primitive exception + `Base:` multi-source ชัด.

### Addendum (2026-05-16) — Seller path-prefix removal

จาก retro `2026-05-16-seller-path-prefix-removal.md`. กฎบังคับ:

21. **Path/string-refactor inventory = 2-pass grep, ยืนยัน "0 เหลือ" ด้วย pass (b)** — (a) call-site pattern (`router\.(push|replace)|redirect\(|href=`) ใช้หาจุดแก้; (b) catch-all string-literal `[\"'\`]/<prefix>([/\"'\`]|\b)` ที่ครอบ prefix-มี-slash + **prefix-เปล่าไม่มี slash** (`/seller`) + **custom `*Href`/`*Path` prop** ที่ส่ง path ต่อให้ `<Link href>` ปลายทาง. pass (a) อย่างเดียว miss (`retryHref=`, bare `/seller` รอด grep มา 2 จุด — Reviewer + Controller จับทีหลัง). developer ต้องรัน pass (b) ตอนจบและ paste output ยืนยัน 0.
22. **มี parallel uncommitted stream → fresh-run type-check + explicit-path stage** — ถ้า `git status` แสดง M/?? ที่ไม่ใช่ของ task: tsc error ครั้งแรกอาจ stale จาก incremental cache ปนไฟล์ครึ่งทางของ stream อื่น (เคย: `BadgeImageUploadSchema` no-export ทั้งที่ export อยู่จริง; fresh-run = clean). รัน `npx tsc --noEmit` ซ้ำ fresh ก่อนตัดสิน; error ในไฟล์ *นอก diff ของ task* = pre-existing ไม่ block. commit ด้วย `git add <explicit task paths>` เท่านั้น — **ห้าม `git add -A`/`git add .`** (กัน parallel stream ปนเข้า commit).

### Addendum (2026-05-17) — SMS-Wallet feature (7-phase เต็มรูป)

จาก retro `2026-05-17-sms-wallet-feature.md`. กฎบังคับ:

23. **Controller git-diff-verify agent file-edits ก่อน re-QA/commit เสมอ** — subagent
    (developer ฯลฯ) รายงาน "แก้เสร็จ + tsc 0 + diff บรรทัด X" **ไม่ใช่หลักฐานว่า edit ลง
    disk จริง**. Controller ต้อง `git diff HEAD -- <files>` หรือ grep marker บน disk
    **ก่อน** dispatch reviewer/QA หรือ commit. (เคย: rework T13/T23 dev report ครบถ้วน
    แต่ `git diff HEAD` ว่าง — edit ไม่เคยลง; safepay-qa + Controller จับได้ แต่เสีย re-QA
    1 cycle ~2455s. รอบสอง Controller แก้เอง + verify บน disk ก่อน → MERGE). ขยายกฎ #19:
    self-report = intent ไม่ใช่ ground truth — กับ "edit persisted" ก็เช่นกัน ไม่ใช่แค่ tsc.
24. **Next.js 16 (Turbopack): ห้าม `request.url` เป็น base ของ redirect/absolute URL** —
    resolve เป็น `http://localhost:PORT` (internal bind) ไม่ใช่ public host → wrong-host
    redirect + cookie domain mismatch (เคย T13: auto-unlock พังทั้ง flow, cookie
    `o_smsunlock` domain deepth.local ไม่ถูกส่งเมื่อ redirect ไป localhost). ใช้
    configured base (`NEXT_PUBLIC_*_URL` → `NEXTAUTH_URL` fallback) แทน. คู่กับ AGENTS.md
    "This is NOT the Next.js you know" — runtime behavior ที่ curl+tsc มองไม่เห็น.
25. **UI client-mutation บน RSC page ต้อง `router.refresh()`** — submit/modal-success ที่
    เปลี่ยน state ฝั่ง server แล้วหน้าเป็น RSC + มี section ที่ดึง data นั้น: ปิด modal
    เฉย ๆ ไม่พอ (เคย T23: แถว PENDING ไม่โผล่จน reload เอง — comment เดิมอ้างผิดว่า
    "ไม่ต้อง refresh"). curl+tsc มองไม่เห็น → ต้อง browser E2E (ย้ำ #2 QA-baseline).
26. **Controller UX/architecture decision ที่แตะ auth boundary → safepay-security
    pre-check ก่อน build** — ห้ามตัด decision เกี่ยว session/unlock/token/cookie/redirect
    ด้วยเหตุ cosmetic (เคย P4: Controller เลือก `?unlocked=1` query "เพราะ URL สะอาด" =
    client-trusted auth-bypass ทุก order; security จับตอน T13 ต้อง redesign ใหญ่เป็น
    server-signed HMAC cookie). เอา cosmetic นำ security = anti-pattern.
27. **ux/planner ต้องเดิน actor journey ครบรวม "เห็นสถานะงานตัวเองที่ pending/รอ external"**
    — spec ที่มีแต่ list/aggregate/balance พลาด visibility ของ in-flight request ของ
    actor เอง (เคย P3: seller ยื่น top-up แล้วเห็น "ว่าง" ระหว่างรอ admin — `getTopUpsByShop`
    service build ไว้แต่ zero UI map → user manual-QA จับเอง = T23). **service ที่ build
    ไว้แต่ไม่มี UI เรียก = red flag spec-gap** ให้ planner/ux ตรวจตอนวาง.

### Addendum (2026-05-17) — Seller Orders Phase B (Create rework, parallel block dev)

retro: `docs/retro/2026-05-17-seller-orders-phase-b.md`

28. **ล็อก shared contract เป็น Controller ก่อน dispatch parallel developer ที่ทำชิ้นพึ่งกัน** —
    type/field-name/API-mapping/JSON-shape ที่ ≥2 block ต้องตรงกัน (เคย Phase B: `FormValues`
    field-name + vatRate%÷100 + vatAmount formula + shippingAddress key set). ฝัง contract
    เดียวกันใน prompt ของ developer ทุกตัวในรอบ → integrator (B7) รวมได้ **ศูนย์ rework** ทั้งที่
    B4/B5/B6 build parallel. ไม่ล็อก = แต่ละ dev เดา field-name เอง → integrate พังยับ.
    คู่กับ Parallelism rule: "independent file" อย่างเดียวไม่พอ ต้อง "shared contract freeze".
29. **Controller cross-check approved-mockup ↔ plan/decision ก่อน dispatch batch UI** — field/
    section ที่ plan สั่งทำแต่ไม่มีใน mockup ที่ user approve (หรือกลับกัน) = หยุด ถาม user
    ห้ามเลือกข้างเงียบ ๆ (เคย Phase B: plan §3 ใส่ discount/VAT แต่ mockup ไม่มีทั้ง field
    และ summary line). ขยาย Hard Rule 6 → ครอบ "plan vs own-approved-mockup" ไม่ใช่แค่
    reference ของ user.
30. **Plan path = logical ต้อง verify เป็น physical ก่อนเข้า Develop** — Controller `ls`/`Glob`
    ยืนยัน target dir + route-group จริง แล้วฝัง absolute path ใน developer prompt (เคย Phase B:
    plan เขียน `.../orders/new/components/` แต่จริงคือ `(dashboard)/orders/new/components/` +
    shell แยกที่ `(fullscreen)/.../page.tsx`). ส่ง logical path ดิบจาก planner = สร้างผิดที่ทั้ง batch.
31. **คำสั่ง user ที่อ้าง infra/DB/env ("มันคือ docker", "local เฉย ๆ") = verify ปลายทางก่อนทำ** —
    โดยเฉพาะ migrate/seed/reset. echo host จาก env ที่จะใช้จริง + แก้ความเข้าใจ user ถ้าไม่ตรง
    ก่อนรัน (เคย Phase B: user "migrate มันเป็น docker local" แต่ `.env.local` ชี้ Supabase cloud
    ที่แชร์กัน). ปิด phase แบบมี QA-debt = เฉพาะเมื่อ user สั่งชัด + บันทึก QA-debt เป็น action
    item + memory; เขียน "code-complete, QA-pending" ห้าม claim "Phase complete" ลอย ๆ.

### Addendum (2026-05-23) — Shop public profile redesign (mockup-driven + visual iteration)

retro: `docs/retro/2026-05-23-shop-public-profile.md`

32. **Freeze contract = verify consumer component ไม่ใช่แค่ field list** — ก่อน freeze type ที่ ≥2
    component แชร์ ระบุชัดว่า field ไหน **component ไหน render** แล้ววางบน type ของ component ที่ใช้จริง
    (ไม่ใช่ producer object). เคย: freeze stats fields บน `ProfileHeaderData` (header) ทั้งที่ StatsBar
    อยู่ใน tab → developer hack `as` cast + dead fields (reviewer จับ, rework 1 รอบ). ขยาย #28.
33. **Full-page mockup ที่ user ให้ = layout structure เป็น reference ด้วย** (Hard Rule 6 nuance) —
    เมื่อ user ส่ง mockup เต็มหน้า + สั่ง "ให้เหมือน" → โครง layout (single-column/grid/ลำดับ section)
    คือ asset/content ที่ต้องตาม; theme ใช้แค่ component primitive. อย่า default โครง 2-col ของ theme.
    เคย: developer build Vuexy 5/7 2-col ทั้งที่ mockup เป็น single-column IG → "ไม่เหมือนเลย" rework ใหญ่.
34. **browser QA ใช้ไม่ได้ → front-load design decisions** — ถ้า chrome-devtools MCP ไม่พร้อม Controller
    verify visual เองไม่ได้ → ทุก tweak = user round-trip (แพง). dispatch `safepay-ux` ทำ Design Spec ครบ
    (layout/spacing/placement options) **ก่อน** build รอบใหญ่ เพื่อรวบ decision; นับ browser-QA-unavailable
    เป็น process blocker (ไม่ลุยแก้ทีละจุดแบบ reactive). เคย: full-bleed/centered/badge/back/FAB/grid ×3
    round-trip user เยอะจน user หงุดหงิด "ยิ่งทำยิ่งเพี้ยน".
35. **Visual "ดูว่าง/น้อย/เพี้ยน" → verify data ก่อน redesign** — symptom visual ที่อาจมาจาก data ขาด
    (รูป/จำนวน) ต้อง query/นับของจริงก่อน; data ขาด → seed/แก้ data ไม่ใช่ redesign component รอบ ๆ.
    3+ design changes บน component เดียวที่สร้างปัญหาใหม่ = หยุดถาม root (systematic-debugging 4.5).
    เคย: "สินค้าน้อย/ว่าง" เพราะ imageUrl=null (placeholder กลืนพื้น) — ไปแก้ grid 3 รอบ ต้นเหตุคือไม่มีรูป.
36. **Phantom-500 (Turbopack dev):** compiled chunk มี code ใหม่ + mtime ใหม่ **ไม่ตัด** phantom-crash;
    tsc/reviewer เขียวแต่หน้า 500 → force recompile (เพิ่ม/ลบไฟล์ หรือ user restart) ก่อนล่า code bug.
    เคย: เสีย debugging cycle ไล่ code ที่ถูกอยู่แล้ว — recompile หายเอง (แก้ 0 บรรทัด). คู่ memory pitfalls.
37. **Controller-direct edit ระหว่าง fast visual iteration = ยอมรับได้ แต่ต้องปิดด้วย independent reviewer
    gate ก่อน commit เสมอ** — เมื่อ Controller แก้เองเยอะ (เสีย developer→reviewer separation) dispatch
    `safepay-reviewer` รอบสุดท้ายก่อน commit (รอบนี้จับ stale comment/dead field/padding regression ได้).

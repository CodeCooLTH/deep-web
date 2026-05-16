# Retro — Achievements System (Phase 4)

วันที่: 2026-05-16 · ผ่าน agent-team-feature 7-phase · Controller = main session

## ผลลัพธ์

Achievements **code-complete + statically gated** (review + security + tsc + Vitest 46/46). **Browser QA = deferred ไม่ได้รัน** (server state ไม่แน่ + chrome-devtools MCP หลุดกลาง session) → DoD ข้อ QA ยังไม่ปิด (ไม่ใช่ FAIL, not-run).

Commits: `d89f2f2` Unit A · `3d7e057` D1/D2 menu · `ccaefe9`+`54cd239` Unit B engine · `ab55e8b` C1 auth · `c9e80a2` G1 public-profile · `b288063` H1 Vitest · `5c6128b` getBadgeProgress fix · `f83e6bb` F1 seller /badges · `d102157` F2 buyer /badges. (hotfix นอก scope: `30478b7`/`73cb471` KYC file-auth, `533fefa` marketing-500 — user's)

## Problems

1. **Subagent รายงานสภาพ repo/infra ผิด ×2.**
   - getBadgeProgress dev รายงาน "35 pass / 11 fail" + วินิจฉัยว่ามี `tests/setup.ts` teardown FK-ordering bug. reviewer รัน suite **2 รอบ = 46/46 ทั้งคู่**, ยืนยัน setup.ts ลบ order→shop→user ถูกต้องอยู่แล้ว ไม่มี bug. ต้นเหตุจริง = transient Supabase pooler hiccup. (evidence: `5c6128b` dev report vs reviewer adjudication)
   - marketing-500 dev อ้าง "previous engineer (QA B1 catch)" สับสน (จริงคือ user commit `533fefa` เอง — dev ไม่ dup ถูกแล้ว แต่ attribution มั่ว)
2. **Working-tree entanglement.** user ทำงานคู่ขนาน (S1-S13 seller-rework + marketing-500 fix + dashboard/page.tsx + PRD) uncommitted ปนกับ agent Unit A/D1/D2. `git add -p` ใช้ไม่ได้ (interactive block). 2 ไฟล์ (dashboard/page.tsx, AchievementLevel.tsx) มี icon-nullable 1-บรรทัดของ agent ติดไปกับ commit user. (evidence: Unit A `d89f2f2` commit body note)
3. **Pre-existing blocker โผล่กลาง feature หยุด QA ซ้ำ ๆ.** (a) CRITICAL `/api/files` ไม่มี auth — KYC หลุด (hotfix `30478b7`/`73cb471`); (b) marketing 500 ทั้ง group จาก literal `bg-[url()]` ใน JSDoc comment โดน Tailwind v4 oxide scan (`533fefa`); (c) dev server จริงรัน **port 3000** ไม่ใช่ 4000 ที่ memory จำ; (d) chrome-devtools MCP disconnect.
4. **Nullable migration downstream type-break ประเมินไม่ครบ.** Unit A ทำ `Badge.icon` nullable; reviewer รอบแรกเห็น 2 ไฟล์ admin; หลัง `prisma generate` แตกเพิ่ม 2 ไฟล์ (`u/[username]`, `dashboard/page.tsx`) + `AchievementBadge.icon` ที่ dev เคยรายงานว่าแก้แล้วแต่จริงไม่ลง.
5. **Double `recalculateTrustScore`.** Unit B ทำ `evaluateBadges` เรียก recalc internal แต่ไม่อัปเดต 3 caller → recalc 2× ต่อ event. reviewer จับ → fix `54cd239`.
6. **getBadgeProgress earned-ratio bug.** FULL_VERIFICATION/UNIQUE_REVIEWERS/SIGNUP_YEAR recompute ratio แม้ earned → `{earned:true,progressRatio:0}`. reviewer จับ (H1 tests "work around" แทนที่จะ flag) → fix `5c6128b`.
7. **Agent ใหม่ dispatch ไม่ได้กลาง session.** safepay-product/database/security/docs เพิ่งสร้าง — เรียกตรงไม่ได้จน session resume (Claude Code โหลด agent defs ตอน start). workaround = general-purpose embed.

## Root causes

- **P1/P4/P6:** subagent มักเดา/เล่าสาเหตุ state ที่ตัวเองไม่ได้ verify; ผล test จาก shared remote DB (Supabase pooler) flaky ถูกอ่านเป็น code/infra bug; reviewer schema change ก่อน `prisma generate` ทำให้ type-impact ยังไม่ปรากฏ.
- **P2:** ไม่มี isolation ระหว่างงาน human คู่ขนานกับ agent feature work บน main เดียวกัน; workflow สมมติ tree สะอาด.
- **P3:** ไม่มี pre-flight env/health check ก่อนเริ่ม phase; memory ค้าง (port 4000); Tailwind v4 scan รวม comment.
- **P5:** spec "ends with recalculateTrustScore" แต่ caller-update ไม่อยู่ใน task scope เดียวกัน.
- **P7:** ข้อจำกัด harness (agent defs โหลดตอน session start) ไม่ได้ถูกคาดไว้ในแผน.

## Conventions to adopt (actionable — promote ไป agent-team-workflow.md)

1. **Pre-flight ก่อนทุก feature/QA phase:** Controller ตรวจ (a) `git status` — ถ้าไม่ clean ให้ enumerate งาน uncommitted ของ human แล้ว commit agent งานด้วย **explicit `git add <paths>` เท่านั้น (ห้าม `-A`/`.`)** + verify diff แต่ละไฟล์ก่อน add; (b) probe dev server ด้วย `curl` หา **port จริง** (อย่าเชื่อ memory); (c) เช็ก chrome-devtools MCP connected ถ้า browser QA อยู่ใน scope.
2. **Subagent: verify อย่า narrate.** ห้าม assert สาเหตุ repo/infra ที่ไม่ได้ verify. ผล test: รัน ≥2 รอบ + map failing-test→function ก่อนสรุป flaky-vs-regression. Controller ต้อง re-verify ทุก state-diagnosis ของ subagent ก่อน act.
3. **Schema nullable/enum change:** task migration ต้อง `prisma generate` แล้วรัน `tsc` เต็ม + แก้ downstream break **ทั้งหมดใน Unit เดียว**; reviewer ของ schema change ต้อง review **หลัง** client regen.
4. **Service เปลี่ยนมา own side-effect (เช่น recalc):** task เดียวกันต้องอัปเดต caller ทุกตัว; reviewer เช็ก caller redundancy.
5. **Switch-handler guard ต้อง uniform** (ทุก case ใช้ earned-guard แบบเดียวกัน); Vitest ต้องมี case ต่อ handler ยืนยัน earned⟹ratio=1; ถ้า test ต้อง "work around" service behavior = flag เป็น bug ห้ามกลบ.
6. **Agent/skill project ใหม่ dispatch ไม่ได้จน session reload** — Controller วางแผนเผื่อ (หรือใช้ general-purpose-embed อย่างรู้ตัว).

## What went right (anchor — ทำซ้ำ)

- **Independent review + security gate คุ้มจริง** — จับ double-recalc, getBadgeProgress bug, security must-fix #1-#4, downstream type-break, **และ subagent misdiagnosis ×2**. ทุก batch.
- **planner เขียน "ต้อง Explore" ไม่เดา theme source** → Explore หา Base file เป๊ะ → F1/F2 ผ่าน sourced-not-recomposed.
- **Selective `git add <paths>` + verify diff** กัน commit agent ปนงาน user สำเร็จแม้ tree พันกันหนัก.
- **Status-agnostic engine decision** decouple Achievements จาก OMS redesign (Known Gap #5) — กัน scope ระเบิด.
- **Surface CRITICAL ให้ user ตัดสิน** (KYC file exposure) แทน auto-fix กลาง feature — เคารพ scope/authority.
- brainstorm→spec→plan→subagent-driven + per-batch gating กัน error สะสม.

## Action items

1. [ ] **Browser QA Achievements** — รัน 3-level QA (`/badges` buyer+seller, SIGNUP_YEAR award, public-profile filter, audience) เมื่อ server + chrome MCP พร้อม. ปิด DoD ข้อ QA.
2. [ ] **ยืนยัน dev port** กับ user (memory ว่า 4000 / observed 3000 2026-05-16) → แก้ memory `feedback_qa_domains` ให้ตรง.
3. [ ] **known follow-ups:** dashboard `criteriaToText` เพิ่ม case `SIGNUP_YEAR` (2026_BADGE โชว์ criteria ว่างใน widget เก่า); extract `LUCIDE_FOR_BADGE` เป็น shared non-component module (ซ้ำ F1↔AchievementLevel); security LOW (statuses runtime guard, divide-by-zero NaN, unbounded findMany→aggregate, admin badge body Valibot); 5-case progress efficiency (`if(!earned)` guard).
4. [ ] **E1/Risk-3** — ประเมินอีกครั้งหลัง user commit seller-rework (ส่วนใหญ่ absorbed แล้ว — icon-nullable จัดการตั้งแต่ Unit A; อาจ optional).
5. [ ] promote conventions 1-6 → `docs/conventions/agent-team-workflow.md`; update memory (pre-flight + subagent-state-claims + port).

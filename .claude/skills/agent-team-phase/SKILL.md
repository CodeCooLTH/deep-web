---
name: agent-team-phase
description: Use เมื่อจะเริ่ม phase ใด ๆ ใน SafePay/Deep ที่มี ≥3 tasks (P1,P2,R1-R11, multi-step build). บังคับ workflow Planner→Developer→Reviewer→QA→Controller แทน single-threaded build.
---

# Agent-Team Phase Orchestration — Hard Rule 4

phase ที่มี ≥3 tasks ห้าม build single-threaded. background: P1 build เดี่ยว พัง theme-copy 10 หน้าโดยไม่มี checkpoint (retro 2026-04-18-p1).

## Controller (main session) คือคนเดียวที่ commit / mark task complete

## 5 gates ต่อ task
1. **Plan** — dispatch `safepay-planner` → ได้ target↔theme mapping + atomic-commit boundary. ถ้าแผนมีแถว "ต้อง Explore: ..." → Controller dispatch Explore agent (subagent_type Explore หรือ general-purpose) แก้ให้ได้ theme path ที่แน่นอน แล้ว re-dispatch `safepay-planner` ก่อนเข้า Develop. ไม่มีแผน → ไม่ dispatch.
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

---
name: agent-team-feature
description: Use เมื่อเริ่ม feature ใหม่ของ SafePay/Deep ที่ต้องผ่าน workflow เต็ม (Discovery→Final Report) ก่อนแตะโค้ด — orchestrate 9-agent team (จาก 10 master roles) + 7 phase + Definition of Done.
---

# Agent-Team Feature Workflow (7-phase, 9-agent)

feature ใหม่เดินผ่าน 7 phase. Controller = main session (คนเดียวที่ commit/mark complete).

## 7 Phases → ใคร
1. **Discovery** — Controller inspect โปรเจกต์ (อย่าเขียนโค้ด)
2. **Requirement** — dispatch `safepay-product` → Goal/FR/NFR/Acceptance/Assumptions
3. **Technical Design** — `safepay-planner` (architect+theme mapping); แตะ schema → `safepay-database`; ทบทวน auth → `safepay-security`
4. **Implementation** — `safepay-database` → `safepay-developer` → `safepay-docs` (safepay-docs เมื่อมี route/API/DB ใหม่ หรือปิด Known Gap §11 PRD). ถ้า ≥3 tasks ใช้ skill `agent-team-phase` (5-gate, batch≤3) ภายใน
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

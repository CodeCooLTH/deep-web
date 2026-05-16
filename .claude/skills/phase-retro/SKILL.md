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

## 3. Commit retro + convention update แยก commit ปลาย phase (ไม่ bundle กับ feature work) — commit บน branch ของ phase นั้น (โปรเจกต์นี้ทำงานบน main)

## Deep reference
`docs/conventions/agent-team-workflow.md` §"Per-phase retrospective"

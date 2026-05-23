# Design — Scope Guard ผ่าน safepay-product (3-gate ต่อ phase)

> วันที่: 2026-05-23 · สถานะ: approved (brainstorm) · ผู้ตัดสิน: user (shinobu22)

## ปัญหา

`safepay-product` ปัจจุบันถูกเรียกครั้งเดียวตอนต้น feature (Phase 2 Requirement ของ `agent-team-feature`) แล้วหายไป — ไม่มีกลไกคุม scope ระหว่างการพัฒนา ทำให้เสี่ยง 4 อย่าง:

1. **Scope creep** — ทีม build สิ่งที่ไม่ได้อยู่ใน requirement ที่ตกลงไว้ (gold-plating / drift / แอบเพิ่ม feature)
2. **Scope หล่น** — ของที่อยู่ใน scope แล้วถูกลืม/ทำไม่ครบ acceptance
3. **PRD/spec ไม่ sync** — decision เปลี่ยนระหว่าง dev แต่ doc ไม่ตาม
4. **ไม่มี sign-off gate** — ไม่มีจุดที่ product ยืนยันว่า scope ครบก่อนปิด phase

## เจตนา (จาก brainstorm)

- ให้ `safepay-product` เป็น **เจ้าของ scope ตลอด lifecycle** (กัน creep + กันหล่น + sync doc + sign-off) — ครบทั้ง 4
- Cadence: **3 touchpoints ต่อ phase** (ต้น = baseline / ต่อ batch = scope-diff / จบ = sign-off) เกาะกับ 3-level QA cadence ที่มีอยู่
- ความเข้ม: **hard block + Controller ตัดสิน** — เจอ creep/หล่น → product คืน verdict, Controller หยุด commit แล้วตัดสิน (ตัดออก / รับเข้า scope / เลื่อน Phase 2)

## ข้อจำกัดเชิงสถาปัตยกรรม

Subagent เป็น **stateless/ephemeral** — เฝ้าดูตลอดเวลาเองไม่ได้ และ Controller (main session) เป็น role เดียวที่ dispatch/commit ได้. ความต่อเนื่องจึงมาจาก:
1. **Scope Baseline artifact ถาวร** (ไฟล์) = SSOT ที่ทุก agent อ่าน
2. **Controller re-dispatch product ที่ 3 gate ที่กำหนด**
3. **baseline ฝังใน developer/reviewer prompt** = กาวต่อเนื่องระหว่าง gate

แนวทางที่เลือก = **A**: ขยาย role `safepay-product` + เพิ่ม gate ใน `agent-team-phase` (ไม่สร้าง agent ใหม่ — ตรงเจตนา "อยากให้ product คุม", machinery น้อยสุด). แนวทาง B (auditor agent แยก) และ C (product แค่ต้น+จบ, reviewer คุมกลาง) ถูกตัด เพราะขัดเจตนา/ให้ cadence ไม่ครบ.

---

## Component 1 — Scope Baseline artifact

ไฟล์ถาวร = SSOT ของ scope ต่อ phase. product ออกตอนต้น phase.

- **ที่อยู่:** `docs/scope/<YYYY-MM-DD>-<phase-id>-scope-baseline.md`
- **โฟลเดอร์ `docs/scope/` ใหม่** แยกจาก `specs/` (specs = วิธีทำ; scope = ขอบเขต/สัญญา)
- **template:** `docs/scope/_TEMPLATE.md` (product copy ทุก phase — สอดคล้อง culture "copy ไม่ compose")

โครงสร้าง:

```markdown
# Scope Baseline — <Phase name>
สถานะ: ACTIVE | SIGNED-OFF
อ้างอิง PRD: FR-x, FR-y / spec: <path>

## Goal (1 ประโยค)

## In-Scope (ทุก commit ต้อง map กับ ID)
| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | ... | ... | TODO/DONE |

## Out-of-Scope (แตะ = CREEP)
| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | ... | Phase 2 |

## Assumptions
## Deferred → Phase 2 (ของหล่นจงใจ — ไม่นับ GAP)
## Change Log (Controller อนุมัติแก้ scope จดที่นี่ + เหตุผล + วันที่)
```

**กลไกคุม:**
- **ID scheme `S-n` / `OOS-n`** — developer prompt ระบุ task serve `S-?`; commit อ้าง ID; product diff เช็ก commit ทุกอัน map S-id และไม่มี OOS-id ถูกแตะ
- **Change Log** = audit trail กัน creep เงียบ
- **สถานะ ACTIVE → SIGNED-OFF** — product เปลี่ยนตอน sign-off เท่านั้น

---

## Component 2 — 3 Gates (ฝังใน workflow)

### Gate 0 — Scope Baseline (ครั้งเดียว ต้น phase, ก่อน Planner)
```
Controller → dispatch safepay-product (baseline mode)
  input:  request + PRD + retro ล่าสุด
  output: docs/scope/<...>-scope-baseline.md (ACTIVE)
Controller commit baseline → ค่อย dispatch safepay-planner
Planner ต้อง map ทุก task → S-id (task ที่ไม่ map S-id = ห้ามมี)
```

### Gate 1 — Scope-diff (ต่อ batch, รวมกับ batch-integration QA)
```
Controller → dispatch safepay-product (scope-audit mode)
  input:  baseline path + git diff --stat + commit messages + task list ของ batch
  output verdict ∈ { PASS | CREEP | GAP }
    PASS  → commit batch ได้
    CREEP → OOS-id ถูกแตะ / งานนอก S-id ทุกตัว → 🛑 Controller หยุด commit
    GAP   → S-id ที่ batch ควรเสร็จแต่ acceptance ไม่ครบ → 🛑 หยุด
```
Hard block: CREEP/GAP → Controller ตัดสิน 3 ทาง: (ก) ตัดงานเกินออก / (ข) รับเข้า scope → product อัปเดต baseline + Change Log แล้ว re-audit / (ค) เลื่อน Phase 2

### Gate 2 — Sign-off (ครั้งเดียว ปลาย phase, ก่อน `phase-retro`)
```
Controller → dispatch safepay-product (sign-off mode)
  input:  baseline + commit ทั้ง phase + ผล QA end-of-phase
  ตรวจ:   S-id ทุกข้อ DONE+acceptance ผ่าน? / ไม่มี CREEP ค้าง? / PRD sync?
  output: SIGNED-OFF (flip สถานะใน baseline) | BLOCKED + รายการค้าง
SIGNED-OFF เท่านั้นถึง invoke skill phase-retro
```

### กาวต่อเนื่อง — Reviewer scope-trace
`safepay-reviewer` เพิ่ม 1 gate: commit cite `S-id` ที่มีจริงใน baseline ไหม? — ไม่ตัดสิน scope (งาน product) แค่กัน commit หลุดโดยไม่มี ID ให้ product ตามทีหลัง

---

## Component 3 — ไฟล์ที่แก้

| # | ไฟล์ | การแก้ |
|---|------|--------|
| 1 | `docs/scope/_TEMPLATE.md` | สร้างใหม่ (template ตาม Component 1) |
| 2 | `.claude/agents/safepay-product.md` | เพิ่ม 3 mode: Scope Baseline / Scope Audit / Sign-off + verdict format |
| 3 | `.claude/skills/agent-team-phase/SKILL.md` | เพิ่ม phase-level scope gates (0/1/2); แก้ Gate Plan ให้ map S-id; แก้ "จบ phase" = ต้อง SIGNED-OFF ก่อน retro |
| 4 | `.claude/agents/safepay-reviewer.md` | เพิ่ม gate scope-trace (commit cite S-id จริง) |
| 5 | `.claude/skills/agent-team-feature/SKILL.md` | Phase 2 output รวม baseline; Phase 7 เพิ่ม product sign-off ก่อน retro |
| 6 | `docs/conventions/agent-team-workflow.md` | เพิ่ม section "Scope Baseline & 3 scope gates" + prompt template 3 mode |

**ไม่แตะ:** `CLAUDE.md` Hard Rules (Rule 4 ครอบ agent-team workflow อยู่แล้ว; scope gates เป็นกลไกย่อยเหมือน 5-gate/3-level QA), `src/**` (เป็น process/config ล้วน)

## Definition of Done

- [ ] ทั้ง 6 จุดแก้ครบ + สอดคล้องกัน (ID scheme ตรงกันทุกไฟล์)
- [ ] product agent มี 3 mode + verdict PASS/CREEP/GAP ชัด
- [ ] agent-team-phase + agent-team-feature อ้าง gate ตรงกัน
- [ ] reviewer มี scope-trace gate
- [ ] template มีจริงใน `docs/scope/_TEMPLATE.md`

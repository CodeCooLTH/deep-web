# Rule — Feature Docs Ownership & Templates (SafePay/Deep)

> 🛑 **กฎบังคับ — Documentation-First.** ทุก feature ใหม่ "ต้องทำเอกสารก่อนเขียนโค้ด" เสมอ.
> เอกสารอยู่ใน `docs/20 - Features/<NNNNN> - <FeatureName>/` ประกอบจาก template ใน
> `docs/99 - Rules/Feature-Templates/`. ห้ามเริ่ม implement feature ใด ๆ ก่อนมีอย่างน้อย PRD + BRD ที่ผ่าน user review.
> (adapt มาจาก gosaas `99 - Rules/Feature-Docs-Ownership.md` — map role → subagents ของ SafePay)

---

## 1. ขอบเขต

กฎนี้บังคับกับเอกสารทุกชิ้นใต้ `docs/20 - Features/<NNNNN> - <FeatureName>/` ได้แก่
`PRD.md`, `BRD.md`, `SRS.md`, `SDS.md`, `API.md`, `DATABASE.md`, `Tests/<NNNNN-what-to-do>.md`

- ชื่อโฟลเดอร์ feature = `<NNNNN> - <FeatureName>` (เลขนำ 5 หลัก เริ่ม `00001` ไม่ reset ไม่ใช้ซ้ำ; ลำดับถัดไป = max+1 ใน `docs/20 - Features/`)
- เลขนำใช้เฉพาะชื่อโฟลเดอร์ — ไม่กระทบชื่อไฟล์ภายใน
- ไม่ครอบคลุมโค้ดใน `src/` หรือไฟล์ใน `.claude/`
- เอกสารระบบรวม (`docs/PRD.md`, `docs/SRS.md`) ยังเป็น SSOT ระดับ product/spec ทั้งระบบ — feature docs เป็นระดับ feature และต้อง trace กลับเอกสารระบบเมื่อเกี่ยวข้อง

---

## 2. ความเป็นเจ้าของเอกสาร (Ownership → SafePay subagents)

| เอกสาร | นิยาม | เจ้าของ (subagent) | Template |
|--------|-------|---------------------|----------|
| **PRD.md** | Product Requirements — เป้าหมายธุรกิจ, personas, KPI, business requirements ระดับภาพรวม | **`safepay-product`** (BA+PO+PM) | `Feature-Templates/PRD.md` |
| **BRD.md** | Business Requirements — Functional Requirements, User Story, Acceptance Criteria, Business Flow, Business Rules (non-technical) | **`safepay-product`** (BA) | `Feature-Templates/BRD.md` |
| **SRS.md** | Software Requirements Specification — technical spec: architecture, interface/API, data, NFR, technical constraints | **`safepay-planner`** (SA) | `Feature-Templates/SRS.md` |
| **SDS.md** | System Design — architecture, component design, data flow, sequence (trace กลับ SRS) | **`safepay-planner`** (SA) | `Feature-Templates/SDS.md` |
| **API.md** | API contract — endpoint, request/response, error code, auth (trace กลับ SDS) | **`safepay-planner`** (SA) | `Feature-Templates/API.md` |
| **DATABASE.md** | Schema, ตาราง, index, migration plan, ERD (trace กลับ SDS) | **`safepay-database`** | `Feature-Templates/DATABASE.md` |
| **Tests/\<NNNNN-what-to-do\>.md** | Test scenario + step + expected, trace กลับ Acceptance Criteria ใน BRD | **`safepay-qa`** | `Feature-Templates/TestCase.md` |

> subagent เหล่านี้เป็น read-only/ผู้ผลิตเนื้อหา — **Controller (main session) เป็นผู้ Write ไฟล์จริง + commit** หลังตรวจ (ตาม agent-team-workflow). PM/Controller กระจายงานให้ตรง role.

### กฎการตั้งชื่อไฟล์ Test Case (บังคับ)
ไฟล์ใต้ `Tests/` ต้องชื่อ `NNNNN-<what-to-do>.md`:
- `NNNNN` = เลข 5 หลักเริ่ม `00001` ต่อ feature (ไม่ reset ไม่ซ้ำ)
- `<what-to-do>` = kebab-case สื่อความหมาย (เช่น `onboarding-modal-e2e`)
- instance ห้ามชื่อ `TestCase.md` (นั่นคือชื่อ template)

---

## 3. กฎการเขียน (บังคับ)

1. **Documentation-First** — ห้าม implement feature ก่อนมี PRD + BRD (อย่างน้อย) ใน feature folder และผ่าน user review. เอกสารชั้น technical (SRS/SDS/API/DATABASE) ต้องมีก่อน task ที่แตะส่วนนั้น
2. **ต้องใช้ Template** — เริ่มจาก template ใน `99 - Rules/Feature-Templates/` ที่ตรงชนิด ห้ามสร้างโครงเอง
3. **ห้ามข้ามเจ้าของ** — subagent ที่ไม่ใช่เจ้าของตามตารางข้อ 2 ห้ามเขียน/แก้สาระเอกสารนั้น
4. **ลำดับการสร้าง + trace** — `PRD → BRD → SRS → SDS → (API + DATABASE แตกจาก SDS) → Tests`. ทุกชั้น trace ย้อนชั้นก่อนหน้า (BRD→PRD, SRS→BRD, SDS→SRS, API→SDS, DATABASE→SDS, Tests→AC ใน BRD)
5. **คง frontmatter + blockquote header** — ทุกไฟล์มี YAML frontmatter ตามด้วย blockquote header (`> **โมดูล:** ...`)
6. **ลบ placeholder/comment** — แทน `{{...}}` ทุกตัว + ลบ HTML comment ของ template ก่อน commit
7. **เชื่อมเอกสาร** — PRD/BRD/SRS ของ feature เดียวกันอ้างถึงกัน กัน orphan

---

## 4. กฎ Mermaid (บังคับเด็ดขาด)

> ทุก **Flowchart / diagram / flow / sequence / ERD / state diagram** ในเอกสาร Feature **ต้องใช้ Mermaid เท่านั้น**

- **ห้าม** ASCII art วาด flow · **ห้าม** แนบรูปภาพ (png/jpg) แทน diagram · **ห้าม** external diagram tool
- ทุก diagram อยู่ใน fenced ` ```mermaid `
- ครอบคลุม PRD (user journey), BRD (Business Flow), SRS/SDS (architecture/sequence), DATABASE (`erDiagram`), API (sequence ของ flow ซับซ้อน), Tests (flow ของ scenario ถ้ามี)

---

## 5. Gate Checklist (ก่อน Controller commit เอกสาร Feature)

- [ ] ใช้ template ถูกชนิด + section ครบ
- [ ] เจ้าของเอกสารตรงตารางข้อ 2
- [ ] มี YAML frontmatter + blockquote header
- [ ] ไม่มี `{{placeholder}}` / HTML comment ของ template หลงเหลือ
- [ ] ทุก flow/diagram เป็น Mermaid (ไม่มี ASCII/รูปภาพ)
- [ ] เอกสารในโมดูลอ้างถึงกัน ไม่ orphan
- [ ] ลำดับถูก (PRD ก่อน BRD, BRD ก่อน SRS) + trace ย้อนชั้นก่อนหน้า
- [ ] DATABASE.md ใช้ Mermaid `erDiagram`

---

## 6. การสร้าง feature ใหม่ (ขั้นตอนย่อ)

1. หาเลขถัดไป (`max+1` ใน `docs/20 - Features/`) → สร้างโฟลเดอร์ `<NNNNN> - <FeatureName>/`
2. `safepay-product` ร่าง **PRD** (จาก template) → Controller Write → user review
3. `safepay-product` ร่าง **BRD** → Write → review
4. `safepay-planner` ร่าง **SRS → SDS → API**, `safepay-database` ร่าง **DATABASE** → Write
5. `safepay-qa` ร่าง **Tests/<NNNNN-...>.md**
6. เริ่ม implement ได้เมื่อเอกสารชั้นที่เกี่ยวกับ task นั้นพร้อม (อย่างน้อย PRD+BRD)

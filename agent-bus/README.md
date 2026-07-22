# Agent Bus — โปรโตคอลคุยกันข้าม session สำหรับ AI 2 ตัว

> กระดานฝากข้อความบน git สำหรับให้ AI agent ที่รันคนละ session / คนละ context
> ประสานงานกันได้ โดยไม่ต้องคุยสดและไม่ต้องแชร์ memory

เวอร์ชัน: `1.0` · โมเดล: **2-agent** (`LEAD` ↔ `CODER`)

---

## 1. ทำไมต้องมีบัส

AI สองตัวนี้รันคนละ session คนละ context — **คุยกันสดแบบ real-time ไม่ได้**
และไม่แชร์ความจำกัน ตัวหนึ่งอาจทำงานตอนที่อีกตัวไม่ได้ online

บัสแก้ปัญหานี้ด้วยการเป็น **ไฟล์จริงใน git repo** ที่ทั้งคู่เขียนได้/อ่านได้
เพราะทุกข้อความถูก `commit` เก็บเป็นประวัติถาวร → ได้ทั้ง **ความจำร่วมข้าม session**
และ **audit trail** ฟรี (ย้อนดูได้ว่าใครสั่งอะไร เมื่อไหร่)

หลักการคือ **append-only message log + single-writer ต่อไฟล์**

---

## 2. บทบาท 2 ตัว

| Agent | บทบาท | ทำอะไรได้ที่อีกตัวทำไม่ได้ |
|-------|-------|----------------------------|
| **LEAD** | Orchestrator / Manager | ตัดสินใจ, วางแผน, สั่งงาน, มี cloud browser แยก (ไม่ชน session บนเครื่อง) |
| **CODER** | Claude Code / Engineer | อ่าน repo, แก้โค้ด, git, รัน test, deploy, browser บนเครื่อง dev |

> ชื่อ `LEAD` / `CODER` เปลี่ยนได้ตามใจ แค่แก้ชื่อไฟล์ให้ตรง (ดูข้อ 3)

---

## 3. ช่องทาง: 2 ไฟล์ กฎ "หนึ่งไฟล์ หนึ่งคนเขียน"

อยู่ในโฟลเดอร์ `agent-bus/`

| ไฟล์ | **คนเขียนได้คนเดียว** | เนื้อหา |
|------|----------------------|---------|
| `to-lead.md`  | **CODER เท่านั้น** | CODER ส่งงานให้ LEAD (DTASK) + รายงานสถานะงานที่ LEAD สั่ง |
| `to-coder.md` | **LEAD เท่านั้น**  | LEAD สั่งงาน CODER (TASK) + ตอบกลับ DTASK ของ CODER |

**กฎ single-writer สำคัญที่สุด** — ป้องกันเขียนชน (ไฟล์ไม่พัง) และทำให้ประวัติสะอาด
อ่านง่าย ห้ามข้ามไปแก้ไฟล์ของอีกฝ่าย ให้ "ตอบ" โดยเขียนในไฟล์ของตัวเองแทน

### กติกาการเขียน (append-only)
1. เพิ่มข้อความ **ต่อท้ายไฟล์เสมอ** — ห้ามแก้/ลบข้อความเก่า (ประวัติต้องคงที่)
2. ทุกข้อความมี **ID ไม่ซ้ำ** (ดูข้อ 4)
3. ก่อน push ให้ `git pull --rebase` ทุกครั้ง (ดูข้อ 6)

---

## 4. ประเภทข้อความ (Message Types)

ทุกข้อความขึ้นต้นด้วยหัวมาตรฐาน:

```
## <TYPE>-<ID> · <from> → <to> · <YYYY-MM-DD HH:MM TZ> · <status>
```

- `TYPE` = `TASK` | `DTASK` | `MSG` | `CLAIM`
- `ID` = รหัสสั้นไม่ซ้ำ เช่น `LC-014` (Lead→Coder ลำดับ 14), `CL-003`
- `status` = `OPEN` | `CLAIMED` | `DONE` | `BLOCKED` | `ACK`

### 4.1 TASK  (LEAD → CODER) — สั่งงานโค้ด
งานที่ต้องอ่าน repo / แก้โค้ด / รัน test เขียนให้ **ละเอียดพอให้ CODER ทำจบโดยไม่ต้องเดา**

```
## TASK-LC-014 · LEAD → CODER · 2026-07-17 09:00 ICT · OPEN
- goal:        <ต้องการผลลัพธ์อะไร 1 บรรทัด>
- repo+dir:    <repo> / <path ที่เกี่ยวข้อง>
- spec:        <รายละเอียดสิ่งที่ต้องทำ>
- acceptance:  <เงื่อนไขที่ถือว่าเสร็จ ตรวจวัดได้>
- verify:      <คำสั่ง/วิธีพิสูจน์ เช่น `npm test`, GET /health = 200>
- constraints: <ข้อห้าม/ขอบเขต เช่น ห้ามแตะ prod config>
- branch-only: <ชื่อ branch — ห้าม push ตรง main>
```

### 4.2 DTASK (CODER → LEAD) — ขอให้ LEAD ทำสิ่งที่ CODER ทำเองไม่ได้
เช่น งานที่ต้อง login dashboard + 2FA, ใช้ cloud browser, หรือ decision ฝั่ง business

```
## DTASK-CL-007 · CODER → LEAD · 2026-07-17 03:40 ICT · OPEN
- do:         <ให้ทำอะไร>
- why:        <ทำไม CODER ทำเองไม่ได้>
- return:     <ต้องการอะไรกลับมา>
- capability: <ต้องใช้ความสามารถอะไร เช่น cloud-browser, dashboard-access>
```

### 4.3 MSG — บอกข่าว/อัปเดต (ไม่ใช่สั่งงาน)
```
## MSG-CL-008 · CODER → LEAD · 2026-07-17 04:10 ICT
deploy staging เสร็จแล้ว build ผ่าน ยังไม่ได้ทดสอบ e2e
```

### 4.4 CLAIM — จอง task ก่อนลงมือ (กันทำซ้ำ)
เขียนในไฟล์ของ **ผู้ที่จะลงมือทำ** (ผู้รับงาน) ก่อนเริ่ม เพื่อประกาศว่า "ฉันรับแล้ว"
```
## CLAIM-LC-014 · CODER → LEAD · 2026-07-17 09:05 ICT · CLAIMED
- claims:  TASK-LC-014
- ttl:     2026-07-17 11:05 ICT   # หมดอายุใน 2 ชม. ถ้าไม่ปิด = ปล่อยกลับ OPEN
```
> CLAIM เป็น **advisory lock** — มีผลต่อเมื่อทุก agent เคารพมัน
> ใส่ `ttl` เสมอ เพื่อไม่ให้ claim ค้าง (orphaned) ถ้า agent ตายกลางทาง
> เกิน ttl แล้วยังไม่ `DONE`/`BLOCKED` → ถือว่างานหลุด กลับเป็น `OPEN` รับใหม่ได้

---

## 5. การตอบกลับ (Reply) — บรรทัดเดียว

ตอบกลับสั้น ใช้บรรทัดเดียว อ้าง ID เดิม เขียนใน **ไฟล์ของผู้ตอบ**

```
TASK-LC-014  → DONE: ปิด IP-guard สำเร็จ, `npm test` เขียว 42/42 · branch fix/ip-guard
TASK-LC-015  → BLOCKED: เข้า Brevo ไม่ได้ ขอ key ใหม่ (ดู DTASK-CL-009)
DTASK-CL-007 → ACK: ทำแล้ว rotate key เรียบร้อย ค่าใหม่ส่งให้ Pop ในแชตตรง
```

**วงจรปิด task (ตัวอย่างจริง):**
1. CODER เจอ Brevo บล็อก IP → ทำเองไม่ได้ (ต้อง login + 2FA) → เขียน `DTASK-CL-007` ใน `to-lead.md`
2. LEAD อ่าน → เข้า dashboard ปิด IP-guard + rotate key → เขียนผลกลับใน `to-coder.md`
3. CODER verify เอง (`GET /v3/account = 200`) → เขียน `ACK` ยืนยันใน `to-lead.md`
4. ปิด loop ✅

---

## 6. Guardrails (กติกาความปลอดภัย + กัน conflict)

### 6.1 ห้าม secret ลงบัส 🔴 (สำคัญสุด)
บัส push ขึ้น git = **สาธารณะต่อทุกคนที่เข้าถึง repo และอยู่ในประวัติถาวร**
ลบทีหลังไม่พอ ต้อง rotate ของจริง

- **ห้าม paste** ค่า token / API key / password / private key ลงไฟล์บัสเด็ดขาด
- ของลับส่งให้เจ้าของ (Pop) **ตรงในแชต** แทน แล้วในบัสอ้างอิงลอยๆ ว่า "ส่งค่าให้แล้ว"
- มี **pre-commit hook** (`hooks/pre-commit`) สแกน secret อัตโนมัติและ **block commit**
  ถ้าเจอ pattern น่าสงสัย — ติดตั้งด้วย `scripts/install-hooks.sh`
  (guardrail เชิงกลไก ไม่พึ่งวินัยคนอย่างเดียว)

### 6.2 กัน push ชนกัน (conflict policy)
single-writer กันไฟล์พัง แต่ยังชนกันได้ถ้าสอง session push พร้อมกัน:

- **append-only**: เพิ่มต่อท้ายอย่างเดียว ไม่แก้บรรทัดเก่า → git merge ได้แทบไม่ conflict
- ก่อน push เสมอ: `git pull --rebase origin <branch>` แล้วค่อย `git push`
- ถ้าเกิด conflict (แทบไม่เกิดเพราะ single-writer + append-only) ให้เก็บ **ทั้งสองบล็อก** ไว้ ห้ามทิ้งของใคร
- ตกลงกันว่าบัสอยู่บน branch เดียว (แนะนำ `main` หรือ `agent-bus`) ทั้งคู่ push ที่เดียว

### 6.3 self-test ก่อนส่ง TASK
ก่อน LEAD ส่ง TASK ทุกครั้ง ถามตัวเอง:
> "CODER อ่านแล้วทำจบได้เลยโดยไม่ต้องเดา หรือกลับมาถามไหม?"
ถ้าไม่ผ่าน = spec ยังไม่ครบ เขียนใหม่

---

## 7. เมื่อไหร่เปิดอ่านบัส
- เมื่อเจ้าของสั่ง ("อ่านบัสที" / "อีกฝ่ายส่งงานมา")
- ตอน review ประจำ (เช่น EOD ทุกเย็น)
- CODER: เช็ก `to-coder.md` ก่อนเริ่มรอบงาน · LEAD: เช็ก `to-lead.md` ตอน review

---

## 8. โครงไฟล์ในชุดนี้
```
agent-bus/
├── README.md              ← ไฟล์นี้ (โปรโตคอลเต็ม)
├── to-lead.md             ← CODER เขียน → LEAD อ่าน
├── to-coder.md            ← LEAD เขียน → CODER อ่าน
├── templates/             ← ก็อปไปใช้ตอนเขียนข้อความ
│   ├── TASK.md
│   ├── DTASK.md
│   ├── MSG.md
│   └── CLAIM.md
├── hooks/
│   └── pre-commit         ← สแกน secret กัน commit ความลับ
└── scripts/
    └── install-hooks.sh   ← ติดตั้ง hook เข้า .git/hooks
```

## 9. เริ่มใช้ (Quickstart)
```bash
# 1. ก็อปโฟลเดอร์ agent-bus/ ไปวางใน repo ของคุณ
cp -r agent-bus /path/to/your-repo/

# 2. ติดตั้ง secret-guard hook
cd /path/to/your-repo
bash agent-bus/scripts/install-hooks.sh

# 3. commit เริ่มต้น
git add agent-bus && git commit -m "chore: add agent-bus"
```
เสร็จแล้วบอก agent ทั้งสองว่า protocol อยู่ที่ `agent-bus/README.md`

# Retro — Anuphan rule + Seller UI rework + 2 bugfix (2026-05-16)

ครอบ 4 phase ต่อเนื่องใน session เดียว: (1) กฎ Anuphan-only + agent `safepay-ux`, (2) Anuphan code remediation, (3) Seller UI rework Spec1/2/3, (4) 2 pre-existing bugfix (L1 auth, Preline carousel null). ทำในโหมด user สั่ง "stop commit" เกือบทั้ง session แล้ว commit รวด 8 atomic ปลายทาง.

Commits: `abf634d` `4361fc1` `2345724` `9674e24` `ad1a5e1` `4f0631c` `ffa4164` `b15fc6d`

---

## Problems

### P1 — agent file ใหม่ใช้ไม่ได้ใน session ที่สร้าง
สร้าง `.claude/agents/safepay-ux.md` แล้ว dispatch `subagent_type: safepay-ux` → error "Agent type not found". agent registry โหลดตอน session start เท่านั้น. ยังพบภายหลังว่า `.claude/` ทั้งโฟลเดอร์ gitignored → commit agent file ไม่ได้ (ต้อง `-f` เฉพาะ tracked file เดิมเช่น skills/).
- workaround ที่ใช้ได้: รัน agent ผ่าน `general-purpose` + สั่งให้ Read ไฟล์ contract เป็น system prompt — ได้ผลเทียบเท่า

### P2 — parallel developers บน shared working tree → tsc รายงานขัดกัน
Batch 2 (Unit-B/C/D) 3 dev parallel: Unit-B รายงาน "tsc error dashboard/page.tsx:205", Unit-C รายงาน "EXIT:0". ขัดกันเพราะ Unit-C เขียน area เดียวกันทับ — สถานะจริงขึ้นกับ interleaving. ไม่ใช่บั๊ก แต่ subagent report เชื่อเดี่ยว ๆ ไม่ได้

### P3 — QA เจอ 2 บั๊กที่ "ดูเหมือน" เป็นผลจาก rework แต่จริง ๆ pre-existing
L1-not-auto-approve + Preline classList null โผล่ตอน QA phase rework. ผิวเผินเหมือน regression (อยู่บนหน้าที่เพิ่งแก้). investigate จริง: ทั้งคู่ pre-existing — Spec2 ไม่แตะ verification logic (reviewer ยืนยัน); Bug2 ต้นเหตุ `ProductDisplay.tsx` ไม่อยู่ใน diff เลย, stack ที่ชี้ `PageBreadcrumb/Icon` เป็น React owner-stack หลอกตา ไม่ใช่ JS call stack

---

## Root causes

- **P1:** agent/skill registry เป็น session-scoped + `.claude/` gitignored ในโปรเจกต์นี้ — สร้าง subagent กลาง session ใช้ได้จริง session ถัดไป; ภายใน session ต้อง proxy ผ่าน general-purpose
- **P2:** in-place edit หลายตัวบนไฟล์/area คาบเกี่ยวกัน + report เป็น snapshot ของ agent ตอนนั้น ไม่ใช่ ground truth ของ working tree หลัง batch
- **P3:** ตำแหน่งที่ error "ปรากฏ" (หน้า/route) ≠ ไฟล์ต้นเหตุ. Next.js dev overlay แสดง React owner-stack ทำให้ไล่ผิดทาง ถ้าไม่ trace ถึง vendor + git history

---

## Conventions to adopt

1. **สร้าง subagent ใหม่กลาง session → ใช้ผ่าน `general-purpose` + "Read <contract path> เป็น system prompt"** ในรอบนั้น; `subagent_type` ใหม่ใช้ได้ session ถัดไป. แจ้ง user ว่า agent file ที่ commit ไม่ได้ (`.claude/` gitignored) = local-only.
2. **หลัง batch ของ parallel developer ที่แตะไฟล์/area คาบเกี่ยว → Controller ต้องรัน `tsc` (และ test) เองบน combined working tree** ก่อนเชื่อ report ของ dev คนใด — subagent report = snapshot เฉพาะตอน, ไม่ใช่ ground truth หลัง merge. (เคย: Unit-B/C tsc ขัดกัน, combined จริง EXIT:0)
3. **บั๊กที่ QA เจอระหว่าง phase ต้อง classify regression vs pre-existing ก่อน act** — ตรวจ `git diff --stat` ว่าไฟล์ต้นเหตุอยู่ใน scope ไหม + `git log` ไฟล์นั้น + ไล่ stack ถึง vendor (อย่าเชื่อ React owner-stack ว่าเป็น call stack). pre-existing = แยก task/แยก commit ห้ามยัดเข้า phase (กัน scope/commit ปน) + ถาม user
4. **Theme ไม่มี template (empty-state ฯลฯ) → ขอ user อนุมัติ "compose-from-primitive" exception ของ Hard Rule 1 อย่างชัดแจ้ง** ก่อนทำ + commit ใช้ `Base:` multi-source ชี้ primitive จริงทุกตัว (local pattern + theme placeholders/spinners/css)
5. **stop-commit mode workflow:** ทำใน working tree, รายงานไฟล์ที่แก้ต่อ unit ให้ user review, agent-team gate ครบ (review/security/QA) แต่ Integrate = "เก็บ working tree" ไม่ commit; ปลายทางเมื่อ user สั่ง commit → แยก atomic ตาม planner boundary + `Base:` line + ไม่กวาด pre-existing (`docs/PRD.md`) / test artifact (`qa-*.png`) เข้า commit

---

## What went right (ทำซ้ำ)

- **safepay-ux audit ก่อนลงลึก** — ได้ภาพรวม + priority backlog + flag ว่า `SellerOverview.tsx` ที่เลือกไว้ใช้ไม่ได้จริง (ApexChart เปล่า) ก่อนเสีย dev cycle
- **planner แตก 19 task → 4 atomic unit + dependency (Spec1 prereq) + batch ≤3** — execution ลื่น, reviewer/QA จับ rework ได้จุดเดียว (T4 double-load)
- **independent investigation ก่อน fix bug** (systematic-debugging Phase 1) — Bug2 ไม่ใช่ regression: ถ้า fix มั่ว (เดาว่า ProductReviews/SellerEmptyState ผิด) จะเสียเวลา ของจริงคือ ProductDisplay carousel ไม่มีรูป
- **reviewer + security แยก lens บน auth change** — security ยืนยัน L1 ensure อยู่หลัง verifyOtp (ไม่ใช่ privilege escalation) + flag race duplicate (low) + แนะ `@@unique` อนาคต
- **full browser QA ปิดท้าย** — ยืนยันสดทั้ง 3 subdomain (Anuphan computed-font, L1 "ยืนยันแล้ว", Bug2 no-image ไม่ error + มีรูปไม่ regress) ไม่ใช่แค่ code-verified

---

## Action items

1. (pointer) `src/app/api/otp/send/route.ts` — `consumeOtpRequestQuota` รันก่อน `isTestAccount` → test account ติด rate-limit เหมือนเบอร์จริง บล็อก QA loop. เป็นโค้ด concurrent ของ user (isTestAccount bypass) — แนะนำ swap ลำดับ (isTestAccount early-return ก่อน quota). ไม่ใช่ scope phase นี้ — user ตัดสิน
2. (future) `prisma/schema.prisma` `VerificationRecord` เพิ่ม `@@unique([userId, type, level])` — กัน race duplicate L1 (security flag, low, non-blocking)
3. (future) เปลี่ยน `safepay-ux` proxy → native subagent (session ถัดไป registry จะเห็น `.claude/agents/safepay-ux.md` แล้ว)
4. promote convention #2,#3 (combined-tsc verify + regression classification) → `docs/conventions/agent-team-workflow.md`

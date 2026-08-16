---
title: "Test Case — AI Command Center (ห้องบัญชาการ AI + สายงาน Agent 6 ขั้น)"
owner: shinobu22
status: draft
created: 2026-08-16
tags: [template, feature, test, ai-command-center, 00049]
related: ["[[Index]]", "[[BRD]]", "[[PRD]]", "[[UX-Design-Spec]]", "[[DATABASE]]"]
---

> **โมดูล:** 00049 - AI Command Center
> **ประเภทเอกสาร:** Test Case
> **เวอร์ชัน:** 0.1
> **วันที่จัดทำ:** 2026-08-16
> **สถานะ:** Draft — ครอบคลุมเฉพาะ P0/P0.1/P1/P2 (ที่มีโค้ดจริงอยู่แล้ว) เท่านั้น
> **เจ้าของเอกสาร:** QA (ดู [[Feature-Docs-Ownership]])

<!--
กฎเหล็กของเอกสารนี้ (ตาม docs/conventions/rule-must-be-enforced-not-described.md):
"ยังไม่มีวิธี repro" = ไม่เคยทดสอบ ไม่ใช่หมายเหตุ ⇒ ทุกเคสที่ 🚫 ต้องระบุ "สิ่งที่ต้องมีก่อน"
เป็นขั้นตอนที่ทำจริงได้ ห้ามเขียนกำกวม
-->

# Test Case: AI Command Center + Agent Chain (00049)

---

## 1. Overview

ชุดทดสอบนี้ครอบคลุม **BRD** ของ 00049 ทั้ง 14 FR (47 AC) แต่ ณ วันที่เขียนเอกสารนี้ (2026-08-16)
**มีโค้ดจริงอยู่แค่ P0 (วัดจริง) + P0.1 (ปิดหนี้เทส) + P1 (`verify.yml`) + บางส่วนของ P2
(`auto-merge.yml`, `watchdog.yml`, `CODEOWNERS` — เขียนแล้วแต่ยังไม่เคยรันจริงบน `main`)**
P3 (สายงาน agent 6 ขั้น), P4 (หน้าจอ Command Center) และ P5 (ลูป poll บนเครื่อง Hermes) **ยังไม่เริ่ม
implement เลย** — ไม่มีหน้าเว็บ ไม่มี agent ที่เขียน comment ตามโครง ไม่มีเครื่อง Hermes จริง

⇒ ชุดทดสอบนี้จึงมี **สองชนิดของเคสปนกันโดยตั้งใจ**: เคสที่ทดสอบได้จริงวันนี้ (โครงสร้างพื้นฐานบน
GitHub + ด่านบน Actions) และเคสที่ **ยังทดสอบไม่ได้เพราะของยังไม่ถูกสร้าง** — ทุกเคสหลังต้องระบุ
เงื่อนไขที่ต้องมีก่อนตามกฎเหล็กด้านบน ไม่ใช่แค่บอกว่า "รอ implement"

- **เอกสารต้นทาง:** [[BRD]] ของ 00049 (ทุก scenario trace กลับ FR-CC-01..14 / AC ที่ระบุด้วยเลขลำดับ
  บูลเล็ตภายใต้ FR นั้น เช่น `AC-07-1` = บูลเล็ตแรกของ FR-CC-07)
- **ขอบเขต (Scope):**
  - **In-scope และมีหลักฐานจริง:** `verify.yml` 4 ด่าน (path คุ้มครอง / type-check / vitest src /
    theme-guard / vitest tests+Postgres), โครงสร้างป้าย GitHub, เนื้อหา `CODEOWNERS`,
    ตรรกะ bash ของ `auto-merge.yml`/`watchdog.yml` ที่พิสูจน์แบบ local-harness ก่อน push,
    D-8 (ไม่มีการเปลี่ยนแปลงฐานข้อมูล)
  - **In-scope แต่ยังทดสอบไม่ได้ (blocked):** `auto-merge.yml`/`watchdog.yml` แบบ end-to-end บน
    GitHub Actions จริง (ยังไม่ merge เข้า `main` — schedule/`pull_request_target` อ่าน workflow
    จาก default branch เท่านั้น), branch protection + CODEOWNERS ที่มีผลจริง, PAT ของเครื่อง
    Hermes, สายงาน agent 6 ขั้น (P3), หน้าจอ Command Center (P4), heartbeat จริงจากเครื่อง (P5)
  - **Out-of-scope ของเอกสารนี้:** UI polish/impeccable compliance ของหน้าจอที่ยังไม่มีอยู่จริง —
    รอ P4 แล้วเขียนเพิ่ม
- **สภาพแวดล้อม:**
  - GitHub repo `CodeCooLTH/deep-web` (dev/prod แชร์ฐานเดียวกัน — HR13/14/15 มีผลเต็ม)
  - Branch ที่ใช้ทดสอบ: `feat/00049-ai-command-center` (PR #5) — **ยังไม่ merge เข้า `main`**
  - หลักฐานทั้งหมดในเอกสารนี้ดึงจาก `gh` CLI (`gh run list/view`, `gh label list`,
    `gh api repos/.../branches/main/protection`, `gh api repos/.../actions/variables`,
    `gh secret list`) ยิงตรงกับ GitHub จริง ไม่ใช่ค่าจำลอง — วันที่ตรวจ: 2026-08-16
  - **QA agent รอบนี้ไม่ได้ dispatch/merge/label อะไรเองบน GitHub** — เก็บหลักฐานจาก run ที่เกิดขึ้น
    จริงระหว่าง implement เท่านั้น (ดูเหตุผลที่ TC-CC-023)

---

## 2. Test Scenarios

### กลุ่ม A — โครงสร้างพื้นฐานบน GitHub (ป้าย / branch protection / CODEOWNERS / PAT / heartbeat)

#### TC-CC-001: ป้าย GitHub ที่สายงานต้องใช้ถูกสร้างครบ

- **Linked to:** FR-CC-01 AC-01-1 (`stage:plan`), FR-CC-03 (ป้าย `stage:*` ทั้ง 6), FR-CC-11 AC-11-3,
  §8 ข้อ 3 ของ design spec ("สิ่งที่ user ต้องทำเองบน GitHub")
- **Precondition:** มีสิทธิ์อ่านรีโป `CodeCooLTH/deep-web`
- **Steps:**
  1. รัน `gh label list --repo CodeCooLTH/deep-web --limit 50`
  2. ตรวจว่ามีป้ายครบ: `stage:plan`, `stage:ux`, `stage:build`, `stage:review`, `stage:qa`,
     `stage:docs`, **`stage:ready`** (เพิ่ม 2026-08-16 · D-10), `พร้อมขึ้น`, `แตะด่าน`
- **Expected Result:** ป้ายครบ 8 ชื่อ ตรงตัวอักษรเป๊ะกับที่ `verify.yml`/`auto-merge.yml` อ้างถึง
  ในโค้ด (`LABEL="พร้อมขึ้น"`, `OVERRIDE_LABEL="แตะด่าน"`)
- **Status:** ✅ **ทดสอบแล้วผ่าน** — หลักฐาน: `gh label list` (2026-08-16) คืนครบทั้ง 8 ป้าย พร้อม
  description ที่อธิบายบทบาทตรงกับที่เอกสารนี้ระบุ

#### TC-CC-002: branch protection บน `main` — สถานะปัจจุบัน

- **Linked to:** FR-CC-06 AC-06-1 (push main ต้องถูกบังคับด้วย branch protection),
  FR-CC-10 AC-10-2 (CODEOWNERS บังคับให้ user รีวิว — ต้องพึ่ง branch protection ด้วย)
- **Precondition:** —
- **Steps:** รัน `gh api repos/CodeCooLTH/deep-web/branches/main/protection`
- **Expected Result (เมื่อเปิดจริง):** คืน object ที่มี
  `required_pull_request_reviews.require_code_owner_reviews = true` +
  `required_status_checks` ครอบ job ทั้งหมดของ `verify.yml`
- **Actual (2026-08-16):** `404 Branch not protected`
- **Status:** 🚫 **ยังทดสอบไม่ได้** — AC-06-1 และ AC-10-2 **ยังไม่เป็นจริงในระบบตอนนี้เลย** เพราะยัง
  ไม่มี branch protection rule ใด ๆ บน `main` สักข้อ (ยืนยันด้วย 404 ข้างบน ไม่ใช่แค่ยังไม่ตั้งค่าเฉพาะ
  ส่วน — ไม่มี rule เลย) **สิ่งที่ต้องมีก่อนถึงจะทดสอบได้:**
  1. user (สิทธิ์ admin ของรีโป) เปิด Settings → Branches → Add branch protection rule สำหรับ `main`
  2. ติ๊ก "Require a pull request before merging" + "Require review from Code Owners" +
     "Require status checks to pass before merging" แล้วเลือก job ของ `verify.yml` ทุกตัว
  3. หลังเปิดแล้ว รัน **TC-CC-003** ต่อเพื่อพิสูจน์ว่ามีผลจริง

#### TC-CC-003: CODEOWNERS มีผลจริง (พิสูจน์หลัง TC-CC-002 เปิด branch protection)

- **Linked to:** FR-CC-10 AC-10-2, BR-CC-05
- **Precondition:** TC-CC-002 ผ่านแล้ว (branch protection เปิดพร้อมติ๊ก Require review from Code
  Owners)
- **Steps:**
  1. ใช้บัญชี GitHub อื่นที่ **ไม่ใช่** `@shinobu22` (ต้องมีสิทธิ์เขียนรีโปอย่างน้อย write) เปิด PR ที่
     แก้ 1 บรรทัดใน `CLAUDE.md`
  2. ติดป้าย "แตะด่าน" (เพราะ `CLAUDE.md` ก็อยู่ใน path คุ้มครองของด่าน 0 ด้วย — ดู TC-CC-006)
  3. สังเกตว่า GitHub บล็อก merge button จนกว่า `@shinobu22` จะ approve
- **Expected Result:** ปุ่ม merge เป็นสีเทา/ล็อก พร้อมข้อความ "Review required from Code Owners"
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง TC-CC-002 ก่อน และต้องมีบัญชี GitHub ที่สองมาเปิด PR ทดลอง
  (ไม่มีอยู่ในมือ QA agent รอบนี้)

#### TC-CC-004: เนื้อหาไฟล์ `CODEOWNERS` ครอบ path ถูกต้อง (ตรวจไฟล์ตรง ๆ)

- **Linked to:** FR-CC-10 AC-10-2, BR-CC-05
- **Precondition:** —
- **Steps:** เปิดอ่าน `.github/CODEOWNERS`
- **Expected Result:** ครอบทุกบรรทัด: `/.github/workflows/`, `/.github/CODEOWNERS`,
  `/.claude/hooks/`, `/vercel.json`, `/prisma/migrations/`, `/prisma/schema.prisma`, `/CLAUDE.md`
  — ทุกบรรทัดชี้ `@shinobu22`
- **Status:** ✅ **ทดสอบแล้วผ่าน** (ตรวจเนื้อไฟล์ตรง 2026-08-16 — ครบทุก path ที่ระบุ) — **แต่การ "มีผล
  จริง" ยังเป็น 🚫 ตาม TC-CC-002/003** หัวไฟล์เขียนกำกับไว้เองว่า "ไฟล์นี้เป็นแค่เอกสาร ไม่ใช่ด่าน" จนกว่า
  จะเปิด branch protection

#### TC-CC-005: PAT ของเครื่อง Hermes และ repo secret — ยังไม่มีอะไรถูกสร้าง

- **Linked to:** FR-CC-06 AC-06-1/AC-06-2, §6.5 ความลับ, D-3
- **Precondition:** —
- **Steps:** `gh secret list --repo CodeCooLTH/deep-web`
- **Actual (2026-08-16):** รายการว่างเปล่า (ไม่มี secret ใดถูกตั้งเลยสักตัว)
- **Status:** 🚫 **ยังทดสอบไม่ได้** — P5 (ลูป poll บนเครื่อง Hermes) ยังไม่เริ่ม (พึ่ง P3 + R-7 ที่ยังไม่ปิด
  ตาม design spec §10) **สิ่งที่ต้องมีก่อน:**
  1. ออก fine-grained PAT ให้เครื่อง Hermes ตามสเปก §6.5 (เขียน issue/PR/label/comment ได้ ·
     **ห้ามมีสิทธิ์ `workflows`**)
  2. ทดสอบ negative case โดยลอง `curl`/`gh api` แก้ไฟล์ใน `.github/workflows/**` ด้วย token นั้น
     ตรง ๆ แล้วต้องได้ `403`

---

### กลุ่ม B — `verify.yml` ด่าน 0 (root safety / path คุ้มครอง)

#### TC-CC-006: PR แตะ path คุ้มครองโดยไม่มีป้าย "แตะด่าน" → ต้องถูกบล็อก

- **Linked to:** FR-CC-06 AC-06-2 (บางส่วน — บังคับด้วยโค้ดฝั่งด่าน ไม่ใช่แค่สิทธิ์ token),
  FR-CC-10 AC-10-1, BR-CC-05
- **Precondition:** PR ที่แตะไฟล์ใน `.github/workflows/**` หรือ `.claude/hooks/**` และยังไม่มีป้าย
  "แตะด่าน"
- **Steps:**
  1. เปิด PR ที่แก้ไฟล์ path คุ้มครอง (เคสจริง: PR #5 แก้ `.claude/hooks/prod-db-guard.sh` +
     `.github/workflows/verify.yml` เอง — commit `18b45ae7`)
  2. ปล่อยให้ `verify.yml` ทำงานโดย **ยังไม่ติด** ป้าย "แตะด่าน"
  3. อ่านผล job "ด่าน 0 — path คุ้มครอง"
- **Expected Result:** job conclusion=`failure`, step summary แสดงรายชื่อไฟล์ที่แตะ + ข้อความ
  "🛑 ไม่ผ่าน — ไฟล์กลุ่มนี้คือตัวที่ตัดสินว่าอะไรผ่านได้"
- **Status:** ✅ **ทดสอบแล้วผ่าน** — หลักฐาน: run
  [`31930716269`](https://github.com/CodeCooLTH/deep-web/actions/runs/31930716269)
  (2026-08-16T06:09:07Z, PR #5, commit `18b45ae7`) — `gh run view 31930716269 --json jobs` คืน
  `{"conclusion":"failure","name":"ด่าน 0 — path คุ้มครอง"}` จริง

#### TC-CC-007: ติดป้าย "แตะด่าน" แล้ว → ด่าน 0 ต้องผ่าน โดยอ่านป้ายสดจาก API ไม่ใช่ snapshot ของ event

- **Linked to:** FR-CC-10 AC-10-1, BR-CC-10 (หลักการ "อ่านสด ไม่เชื่อ snapshot" — ใช้ร่วมกับ
  `auto-merge.yml`)
- **Precondition:** PR #5 (จาก TC-CC-006) ติดป้าย "แตะด่าน" แล้ว
- **Steps:**
  1. ติดป้าย "แตะด่าน" ให้ PR #5
  2. push commit ใหม่ (`2779463d` — แก้ 2 บั๊กที่ CI จับได้) เพื่อ trigger `verify.yml` รอบใหม่
  3. อ่านผล job "ด่าน 0"
- **Expected Result:** conclusion=`success`, step summary แสดง "⚠️ ผ่านเพราะมีป้าย 'แตะด่าน' — คน
  ตั้งใจแก้ด่านเอง ... ต้องอ่าน diff ด้วยตาก่อน merge เสมอ"
- **Status:** ✅ **ทดสอบแล้วผ่าน** — หลักฐาน: run
  [`31930933360`](https://github.com/CodeCooLTH/deep-web/actions/runs/31930933360)
  (2026-08-16T06:14:24Z, commit `2779463d`) job "ด่าน 0" conclusion=`success`
  🛑 **นี่คือคู่หลักฐาน regression ที่แน่นที่สุดของเอกสารนี้:** รอบแรก (run `31930933360` ก่อนแก้)
  ด่าน 0 เคยพลาดเพราะอ่านป้ายจาก `github.event.pull_request.labels` (snapshot ตอนสร้าง PR) ซึ่ง
  มองไม่เห็นป้ายที่ติดทีหลัง — แก้เป็นอ่านสดผ่าน `gh api repos/:repo/issues/:pr/labels` ใน commit
  `2779463d` แล้วพบว่าผ่านจริงทันที — เห็นทั้งอาการพังและอาการหายพังในคอมมิตติดกัน ไม่ใช่แค่คำอธิบาย

#### TC-CC-008: PR แตะเทสที่มี marker `[blocker]` (เนื้อไฟล์ ไม่ใช่ path .github/.claude)

- **Linked to:** FR-CC-10 AC-10-1, BR-CC-05
- **Precondition:** —
- **Steps:** เปิด PR ที่แก้บรรทัดในไฟล์ `*.test.ts`/`*.test.tsx` ที่มีสตริง `[blocker]` อยู่จริง
- **Expected Result:** job "ด่าน 0" จับได้เหมือนกับ path คุ้มครอง (ตัวแปร `blocker_hits` ในสคริปต์ไม่
  ว่าง) — บล็อกเว้นแต่ติดป้าย "แตะด่าน"
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ยืนยันแล้วว่า **ไม่มี PR ไหนเคยแตะเนื้อไฟล์เทสที่มี marker นี้จริง**
  (ตรวจด้วย `grep -l '\[blocker\]'` กับ 8 ไฟล์เทสที่ P0.1 แก้ทั้งหมด — ไม่พบสักไฟล์) ตรรกะ
  `grep -q '\[blocker\]' "$f"` เขียนไว้ในสคริปต์แล้ว (verify.yml บรรทัด 74) แต่ยังไม่เคยถูก exercise
  ด้วย diff จริง **สิ่งที่ต้องมีก่อน:** เปิด PR ทดลอง (draft, ไม่ merge) แก้ไฟล์เทสที่มี marker นี้จริง
  1 บรรทัด (repo มี 143 ไฟล์ · 629 จุด ตาม CLAUDE.md) แล้วดูผล job

#### TC-CC-009: `workflow_dispatch` (ไม่ใช่ PR) → ด่าน 0 ต้องข้ามอย่างเปิดเผย ไม่ error

- **Linked to:** NFR §6.3 ความน่าเชื่อถือ (fail-closed ทุกจุด แต่ "ไม่ใช่ PR" ต้องเป็น skip ที่ตั้งใจ
  ไม่ใช่ crash)
- **Precondition:** —
- **Steps:** `gh workflow run verify.yml --repo CodeCooLTH/deep-web --ref
  feat/00049-ai-command-center`
- **Expected Result:** step "ตรวจว่า PR แตะตัวด่านเองไหม" ขึ้น "ℹ️ ไม่ใช่ PR (workflow_dispatch) —
  ข้ามด่าน path คุ้มครอง" และ exit 0
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ยืนยันด้วย `gh run list --workflow verify.yml --json event`:
  ทุก run ที่เกิดขึ้นจริง 5 ครั้งเป็น event `pull_request` ทั้งหมด ไม่เคยมี `workflow_dispatch` เกิดขึ้น
  จริงสักครั้ง QA agent รอบนี้ไม่ dispatch เองตามเหตุผลใน TC-CC-023

---

### กลุ่ม C — `verify.yml` ด่าน 1 (type-check ผ่าน `next build`)

#### TC-CC-010: `npx tsc --noEmit` เปล่า ๆ ใช้ไม่ได้บน CI checkout สะอาด (บั๊กจริงที่พบและแก้แล้ว)

- **Linked to:** FR-CC-07 AC-07-1
- **Precondition:** —
- **Steps:** ดูผล job "ด่าน 1" ของ run แรกที่ยังใช้ `npx tsc --noEmit` ตรง ๆ
- **Expected (เดิม):** เขียวถ้าโค้ด production ไม่มี type error จริง
- **Actual:** แดง — `Cannot find module '@/assets/images/*.svg'` เป็นสิบตัว เพราะ `next-env.d.ts`
  ถูก gitignore (Next generate เองตอนรัน dev — ไม่มีบน checkout สะอาดของ CI)
- **Status:** ✅ **ทดสอบแล้วผ่าน (พบบั๊กจริง + แก้แล้ว)** — หลักฐาน: run `31930716269` job
  "ด่าน 1 — tsc" conclusion=`failure` → แก้เป็น `npm run build` ใน commit `2779463d` → run
  `31930933360` job "ด่าน 1 — next build (type errors)" conclusion=`success`

#### TC-CC-011: ด่าน 1 ปัจจุบัน (`npm run build`) เขียวบนโค้ดจริงทุกรอบหลังแก้

- **Linked to:** FR-CC-07 AC-07-1
- **Precondition:** —
- **Steps:** ตรวจผล job "ด่าน 1" ของทุก run หลัง `2779463d`
- **Expected Result:** conclusion=`success` ทุกครั้ง
- **Status:** ✅ **ทดสอบแล้วผ่าน** — หลักฐาน: run `31930933360`, `31932454473`, `31932802354`,
  `31933049115` (4 runs) job "ด่าน 1" conclusion=`success` ทั้งหมด

#### TC-CC-012: ด่าน 1 ต้องบล็อกจริงเมื่อมี type error ตัวจริงในโค้ด production

- **Linked to:** FR-CC-07 AC-07-1
- **Precondition:** —
- **Steps:** เปิด PR ทดลอง (draft) ใส่ type error จงใจ 1 บรรทัด เช่น
  `const x: number = "a" as unknown as string` ผิดชนิดจริง ใน `.ts` ที่ไม่ใช่ทดสอบ
- **Expected Result:** job "ด่าน 1" แดงจริง พร้อมข้อความ error ของ TypeScript ที่ตำแหน่งนั้น
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ทุก run ที่มีอยู่ตอนนี้ (5 ครั้ง) ไม่เคยมี PR ที่ตั้งใจใส่ type error
  ในโค้ด production จริง (แดงที่เคยเกิดในระบบคือปัญหาสภาพแวดล้อม CI — TC-CC-010 — ไม่ใช่ type error
  จริง) **สิ่งที่ต้องมีก่อน:** เปิด PR ทดลองตามขั้นตอนข้างบน แล้วปิดทิ้งโดยไม่ merge

---

### กลุ่ม D — `verify.yml` ด่าน 2 (`vitest run src/`)

#### TC-CC-013: `vitest run src/` เขียวครบบนโค้ดปัจจุบัน

- **Linked to:** FR-CC-07 AC-07-2
- **Precondition:** —
- **Steps:** ตรวจผล job "ด่าน 2 — vitest (src/)" ทุก run
- **Expected Result:** conclusion=`success` ทุกครั้ง ตัวเลข 2,945/2,945
- **Status:** ✅ **ทดสอบแล้วผ่าน** — หลักฐาน: ทุก CI run (5 ครั้ง) job "ด่าน 2" conclusion=`success`
  ทั้งหมด · ตัวเลขที่วัดจริง 2,945/2,945 บันทึกไว้ทั้งใน BRD §7.2 และ commit `18b45ae7`

#### TC-CC-014: ด่าน 2 ต้องบล็อกจริงเมื่อมี unit test แดง

- **Linked to:** FR-CC-07 AC-07-2 ("บล็อกจริงถ้าแดง — ใช้เกณฑ์ผ่านเต็ม")
- **Precondition:** —
- **Steps:** เปิด PR ทดลอง (draft) แก้เทสใน `src/` ให้ assertion ผิดจงใจ 1 ตัว
- **Expected Result:** job "ด่าน 2" ล้มจริง พร้อมชื่อเทสที่แดง
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ยังไม่เคยมี PR ที่ทำให้ `vitest run src/` แดงจริง (ทุก run ที่มี
  เป็นเขียวหมด) **สิ่งที่ต้องมีก่อน:** เปิด PR ทดลองตามขั้นตอนข้างบน แล้วปิดทิ้งโดยไม่ merge

#### TC-CC-015: ด่าน 2 ไม่มี baseline/ลิสต์ยกเว้น (ตรวจจากซอร์ส)

- **Linked to:** FR-CC-07 AC-07-2 (ส่วน "ไม่มี baseline/ลิสต์ยกเว้น")
- **Precondition:** —
- **Steps:** อ่าน step ของ job "ด่าน 2" ใน `.github/workflows/verify.yml` บรรทัด 175
- **Expected Result:** คำสั่งเป็น `npx vitest run src/` ตรง ๆ ไม่มีไฟล์ known-failures ไม่มี
  `--reporter`/flag กรองผลใด ๆ
- **Status:** ✅ **ทดสอบแล้วผ่าน** (ตรวจสอบซอร์สตรง 2026-08-16 — ไม่พบ baseline/ลิสต์ยกเว้นใด ๆ ใน
  ทั้งไฟล์)

---

### กลุ่ม E — `verify.yml` ด่าน 3 (`theme-guard.sh`)

#### TC-CC-016: `theme-guard.sh` ผ่านไฟล์ที่ทำถูกกฎ (local harness ก่อน push)

- **Linked to:** FR-CC-07 AC-07-3
- **Precondition:** —
- **Steps:** ป้อนไฟล์จริงผ่าน stdin ท่า `jq -nc --arg p "$f" '{tool_input:{file_path:$p}}' | bash
  .claude/hooks/theme-guard.sh` (ท่าเดียวกับที่ `verify.yml` เรียกจริง)
- **Expected Result:** exit=0
- **Status:** ✅ **ทดสอบแล้วผ่าน** — หลักฐาน: บันทึกในข้อความ commit `18b45ae7` ("theme-guard ท่า
  stdin JSON: ไฟล์จริงผ่าน exit=0") — ทดสอบก่อน push ไม่ใช่ CI run

#### TC-CC-017: `theme-guard.sh` บล็อกไฟล์ที่มี emoji + arbitrary Tailwind value

- **Linked to:** FR-CC-07 AC-07-3
- **Precondition:** —
- **Steps:** ป้อนไฟล์ทดลองที่มี emoji + arbitrary value (`text-[13px]`) ผ่านท่าเดียวกับ TC-CC-016
- **Expected Result:** exit=2 พร้อมเหตุผล
- **Status:** ✅ **ทดสอบแล้วผ่าน** — หลักฐานเดียวกับ TC-CC-016 (commit `18b45ae7`: "ไฟล์ที่มี
  emoji+arbitrary value โดนบล็อก exit=2") — local harness ก่อน push

#### TC-CC-018: job "ด่าน 3" บน CI จริง — ไฟล์ที่ PR #5 แตะทั้งหมดผ่าน

- **Linked to:** FR-CC-07 AC-07-3
- **Precondition:** —
- **Steps:** ตรวจผล job "ด่าน 3 — theme-guard" ทุก run
- **Expected Result:** conclusion=`success`
- **Status:** ✅ **ทดสอบแล้วผ่าน (มีข้อจำกัด)** — ทุก CI run (5 ครั้ง) job "ด่าน 3" conclusion=`success`
  🛑 **หมายเหตุสำคัญ:** ไฟล์ที่ PR #5 แตะแทบทั้งหมดเป็น `.yml`/`.md`/`.sh` ไม่ใช่ `.tsx`/`.ts`/`.css`
  ที่เข้าเงื่อนไข scan ของ theme-guard (`case "$f" in *.tsx|*.ts|*.css` — verify.yml บรรทัด 257)
  เขียวของ CI นี้จึง**พิสูจน์แค่ว่าด่านรันได้ไม่ error** ไม่ได้พิสูจน์ว่า "จับไฟล์ arbitrary value จริงบน
  CI ได้" — ส่วนนั้นพิสูจน์แยกด้วย local harness ใน TC-CC-016/017 เท่านั้น ยังไม่มี CI run จริงที่ยืนยัน
  ปลายทางเดียวกันบน GitHub Actions โดยตรง (ดู TC-CC-019)

#### TC-CC-019: ด่าน 3 บล็อกจริงบน CI (ไม่ใช่แค่ local harness) เมื่อ PR แตะ `.tsx`/`.css` ที่ละเมิดกฎ

- **Linked to:** FR-CC-07 AC-07-3
- **Precondition:** —
- **Steps:** เปิด PR ทดลอง (draft) แก้ไฟล์ `.tsx` ใส่ arbitrary value จริง (เช่น `text-[13px]`)
- **Expected Result:** step "ด่าน 3" บน CI จริงล้ม พร้อม step summary แสดงชื่อไฟล์ + เหตุผลจาก
  theme-guard
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ยังไม่เคยมี PR จริงที่แตะไฟล์ `.tsx`/`.ts`/`.css` ที่ละเมิดกฎ
  (ทุก PR ที่มีจนถึงตอนนี้เป็น infra/docs ล้วน) **สิ่งที่ต้องมีก่อน:** เปิด PR ทดลองตามขั้นตอนข้างบน
  แล้วปิดทิ้งโดยไม่ merge

---

### กลุ่ม F — `verify.yml` ด่าน 4 (`vitest run tests/` + Postgres — ปิด P0.1)

#### TC-CC-020: 8 ไฟล์เทสที่เคยเรียก `cleanDatabase()` ถูกแก้เป็น `deleteTestData` ครบ

- **Linked to:** BRD §7.2 (P0.1), Glossary `cleanDatabase()`/`deleteTestData()`
- **Precondition:** —
- **Steps:** ตรวจ diff ของ commit `d7215aaf` ใน 8 ไฟล์: `tests/integration/signup-achievement.test.ts`,
  `tests/services/{badge,order-state-machine,order,product-capability,review,seed-badges,trust-score}.test.ts`
- **Expected Result:** ไม่มีไฟล์ไหนเรียก `cleanDatabase()` แล้ว (ถ้ายังเรียก จะ `throw` ทันทีตาม HR13)
- **Status:** ✅ **ทดสอบแล้วผ่าน (ทางอ้อมแต่แน่นหนา)** — หลักฐาน: run
  [`31933049115`](https://github.com/CodeCooLTH/deep-web/actions/runs/31933049115) job
  "ด่าน 4 — vitest (tests/ + Postgres)" conclusion=`success` (126/126) — `cleanDatabase()` ถูกถอด
  ออกและเรียกแล้ว `throw` เสมอตาม HR13 ⇒ ถ้ายังมีไฟล์เรียกค้าง job นี้จะแดงทันทีที่บรรทัดแรก เขียวจึง
  พิสูจน์ว่าไม่มีไฟล์ไหนเรียกค้างแล้วจริง

#### TC-CC-021: ด่าน 4 มี Postgres service container จริง ไม่ใช่ mock

- **Linked to:** FR-CC-07 AC-07-4
- **Precondition:** —
- **Steps:** อ่าน step "สร้าง schema บนฐานของ job นี้" (`npx prisma migrate deploy`) ของ job ด่าน 4
- **Expected Result:** รันสำเร็จ (`migrate deploy` ต้องมี Postgres จริงถึงจะสำเร็จ — ไม่มีทาง mock ได้)
- **Status:** ✅ **ทดสอบแล้วผ่าน** — run `31933049115` job นี้ conclusion=`success` ทั้ง job (รวม step
  `prisma migrate deploy` และ `npx vitest run tests/` 126/126) บนฐานว่างเปล่าไม่มี seed
  (ต่างจากฐาน dev บนเครื่อง — ตามที่คอมเมนต์ในไฟล์เขียนกำกับไว้)

#### TC-CC-022: CLAUDE.md แก้บันทึกที่ผิด ("prisma mock ไม่ครบ") เป็นสาเหตุจริงแล้ว

- **Linked to:** BRD §7.2 (คำเตือนเรื่องบันทึกที่ผิด ต้องแก้พร้อม P0.1)
- **Precondition:** —
- **Steps:** `grep -n "prisma mock ไม่ครบ" CLAUDE.md`
- **Expected Result:** ไม่พบข้อความนี้แบบไม่มีคำอธิบายกำกับ (ต้องมีการแก้ไข/strikethrough อธิบายว่า
  ผิดและสาเหตุจริงคืออะไร)
- **Status:** ✅ **ทดสอบแล้วผ่าน** — grep พบ 2 จุด (CLAUDE.md บรรทัด 320, 385) ทั้งคู่ขีดฆ่าข้อความเดิม
  ("~~prisma mock ไม่ครบ~~") แล้วเติมคำอธิบายที่ถูกต้อง ("ตัวจริงคือ `cleanDatabase()` ถูกถอดออกตอน
  เขียน HR13 แล้วไม่ได้ตามไปแก้ผู้เรียก — แก้บันทึก 2026-08-16")

---

### กลุ่ม G — `auto-merge.yml` (ประตูอนุมัติ — เขียนแล้วแต่ยังไม่เคยรันจริงบน GitHub Actions)

#### TC-CC-023: `auto-merge.yml` ไม่เคยรันบน GitHub Actions เลยสักครั้ง (สถานะโครงสร้างที่กำหนดขอบเขตของทั้งกลุ่ม)

- **Linked to:** FR-CC-08 (ทั้งหมด), FR-CC-09 AC-09-2/09-3
- **Precondition:** —
- **Steps:** `gh run list --repo CodeCooLTH/deep-web --workflow auto-merge.yml`
- **Actual (2026-08-16):** `HTTP 404: workflow auto-merge.yml not found on the default branch`
- **Status:** 🚫 **ยืนยันสถานะปัจจุบัน (ไม่ใช่การทดสอบเชิงบวก)** — เหตุผล: **GitHub ประเมิน
  `schedule` และหา workflow definition ของ `pull_request_target` จากไฟล์ที่อยู่บน default branch
  (`main`) เท่านั้น** ไฟล์นี้อยู่แค่บน `feat/00049-ai-command-center` ⇒ ต่อให้ติดป้าย "พร้อมขึ้น" ให้ PR
  ตอนนี้ทันที ก็จะไม่มีอะไรเกิดขึ้นเลย (ไม่ error ไม่ trigger — เงียบสนิทเพราะ trigger มองไม่เห็นไฟล์)
  🛑 **QA agent รอบนี้ไม่ทดสอบด้วยการ merge PR #5 เข้า `main` เพื่อ "ปลดล็อก" กลุ่มนี้เอง** เพราะ
  `vercel.json` มี `prisma migrate deploy` ใน buildCommand (HR15) — การ merge ใด ๆ เข้า `main` คือ
  migration รันบนฐาน prod ทันที ไม่ใช่การกระทำที่ QA agent มีอำนาจตัดสินใจเอง ต้องให้ user เป็นคนสั่ง
  merge PR #5 เอง

#### TC-CC-024: ด่าน 5 (migration guard) — ตรรกะ bash ผ่านทั้ง 2 ทิศ (local harness ก่อน push)

- **Linked to:** FR-CC-09 AC-09-1, AC-09-2
- **Precondition:** —
- **Steps (ตามบันทึกใน commit `3c9c9891`):**
  1. รันตรรกะเทียบกับ diff ไฟล์จริงของ PR #5 (16 ไฟล์ ไม่มีไฟล์ใต้ `prisma/migrations/`)
  2. รันตรรกะเทียบกับรายการไฟล์ปลอมที่ยัดเข้า `prisma/migrations/xxx/migration.sql`
- **Expected Result:** กรณี (1) ผ่าน (ไม่ block) · กรณี (2) ถูกจับ (`ไม่ auto-merge — merge = prisma
  migrate deploy รันบนฐาน prod ทันที`)
- **Status:** ✅ **ทดสอบแล้วผ่าน (local harness)** — บันทึกในข้อความ commit `3c9c9891`: "พิสูจน์ก่อน
  push: ... ด่าน 5 ทดสอบ 2 ทิศด้วยไฟล์จริงของ PR #5 (16 ไฟล์ ไม่มี migration → ผ่านถูกต้อง) และ
  รายการปลอมที่มี migration → จับได้" — **ยังไม่มี CI run จริงบน GitHub Actions พิสูจน์ซ้ำ** เพราะ
  เหตุผลใน TC-CC-023

#### TC-CC-025: ด่าน 0 — หน้าต่างเวลา 08:00–22:00 น. ไทย

- **Linked to:** FR-CC-08 AC-08-1, BR-CC-06
- **Status:** 🚫 **ยังทดสอบไม่ได้** — เหตุผลเดียวกับ TC-CC-023 **สิ่งที่ต้องมีก่อน:** merge
  `auto-merge.yml` เข้า `main` แล้วรอ cron รอบที่อยู่นอกหน้าต่างเวลา (`*/30 1-14 * * *` UTC =
  08:00–21:30 ไทย) เพื่อดูว่า step summary ขึ้น "⏸️ นอกหน้าต่าง 08:00–22:00 น. ไทย ... ปล่อยใบรอ
  รอบเช้า" จริง

#### TC-CC-026: ด่าน 1 — หาใบติดป้ายจาก `.labels` ของใบเอง ไม่เชื่อ `gh pr list --label`

- **Linked to:** FR-CC-08 AC-08-2, BR-CC-10
- **Status:** 🚫 **ยังทดสอบไม่ได้** — มีแค่หลักฐานเชิงประจักษ์จากต้นแบบ (`CodeCooLTH/12tees`
  พิสูจน์แล้วว่า `gh pr list --label` คืนใบที่ไม่มีป้ายออกมาด้วย — อ้างในคอมเมนต์โค้ด auto-merge.yml
  บรรทัด 81-83) แต่ **ยังไม่เคยพิสูจน์ซ้ำในรีโปนี้** เพราะเหตุผลเดียวกับ TC-CC-023 **สิ่งที่ต้องมีก่อน:**
  merge เข้า main แล้วมี PR ≥2 ใบที่ป้าย/สถานะต่างกัน เพื่อดูว่าตัวกรองจาก `.labels` ของใบเองให้ผล
  ต่างจาก `gh pr list --label` จริงหรือไม่ในสภาพแวดล้อมของเรา

#### TC-CC-027: ด่าน 2 — `main` สงบมาแล้ว ≥ `QUIET_MIN` (8) นาที

- **Linked to:** FR-CC-08 AC-08-3
- **Status:** 🚫 **ยังทดสอบไม่ได้** — `QUIET_MIN=8` เป็น**ค่าประมาณ**จากเวลา `next build` บน
  GitHub-hosted runner (2 นาที 39 วิ วัดจาก run `31930933360`) บวกมาร์จิ้น **ยังไม่เคยวัด merge→live
  จริงบน Vercel เลยสักครั้ง** (CLI ไม่คืนเวลา "ready" — คอมเมนต์ในไฟล์ auto-merge.yml เขียนกำกับไว้
  เองว่า "ยังไม่ได้วัด merge→live ของจริงบน Vercel ... ตัวเลขนี้เป็นตัวแทน ไม่ใช่ของจริง")
  **สิ่งที่ต้องมีก่อน:** ให้มี merge อัตโนมัติใบแรกเกิดขึ้นจริง แล้ววัดเวลา merge→live จาก Vercel
  dashboard จริง จากนั้นแก้ `QUIET_MIN` ให้ตรง

#### TC-CC-028: ด่าน 3 — `main` (`head_sha`) ไม่แดง

- **Linked to:** FR-CC-08 AC-08-4
- **Status:** 🚫 **ยังทดสอบไม่ได้** — `main` **ไม่มี CI ให้เฝ้าเลยตอนนี้** เพราะ `verify.yml` trigger
  เฉพาะ `pull_request` ไม่ยิงตอน push เข้า `main` (สคริปต์เองยอมรับกรณีนี้: "ℹ️ verify.yml ไม่มีผล
  ของ main@... — ไม่มีด่าน CI บน main ให้ตรวจ" → ปล่อยผ่านเป็น "ไม่มีด่าน CI" ไม่ใช่ "เขียว") ยังไม่เคย
  มี `main` ที่แดงให้ทดสอบเส้นทาง block จริง **สิ่งที่ต้องมีก่อน:** เพิ่ม workflow ที่ยิงบน push เข้า
  `main` (หรือรอ P3 ที่จะมี PR merge เข้า main จริง) แล้วจงใจทำให้แดงครั้งหนึ่งเพื่อยืนยัน block

#### TC-CC-029: ด่าน 4 — CI ของ PR เขียวครบ (ข้าม check-run ของ job ตัวเอง)

- **Linked to:** FR-CC-08 AC-08-5
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ตรรกะ "ถามชื่อ job จาก API แล้วข้าม check-run ของตัวเอง" เขียน
  ไว้แล้ว (auto-merge.yml บรรทัด 144-160) แต่ **ยังไม่เคยรันจริงเพื่อพิสูจน์ว่า pending-loop ไม่เกิด**
  (บั๊กที่ต้นแบบเจอ: check-run ของ job ตัวเองค้าง pending ตลอด ทำให้ "ติดป้ายแล้วเริ่มทันที" ไม่เคย
  ทำงานสักใบ) พึ่งเหตุผลเดียวกับ TC-CC-023

#### TC-CC-030: ด่าน 6 + merge จริง + permissions allow-list + fail-closed + รันครั้งละ 1 PR

- **Linked to:** FR-CC-08 AC-08-6, AC-08-7, AC-08-8, AC-08-9
- **Status:** 🚫 **ยังทดสอบไม่ได้ทั้งหมด** — ทุกข้อพึ่งเหตุผลเดียวกับ TC-CC-023 (workflow ยังไม่อยู่บน
  `main`) **สิ่งที่ต้องมีก่อนถึงจะทดสอบครบ:**
  1. user merge PR #5 เข้า `main` เอง (ตัดสินใจโดย user เท่านั้น — ไม่ใช่ QA agent)
  2. เปิด branch protection (TC-CC-002) ให้ `main` ปลอดภัยก่อนมี auto-merge จริง
  3. เปิด PR ทดลองเล็ก ๆ ที่ไม่แตะ migration → ติดป้าย "พร้อมขึ้น" → สังเกตว่า cron/`pull_request_target`
     เก็บให้จริงในหน้าต่าง 08:00–22:00 → ยืนยันว่าตรวจป้ายซ้ำก่อน merge จริง (ด่าน 6) และ merge สำเร็จ
  4. ทดสอบ fail-closed โดยจงใจทำให้ `gh api` อ่านค่าที่จำเป็นไม่ได้ชั่วคราว (เช่น rate-limit
     ทดลอง) แล้วยืนยันว่าไม่ merge

#### TC-CC-031: `auto-merge.yml` เก็บ PR ที่แตะ migration ไม่ผิดพลาด และจอแสดงสถานะต่างจากปกติ

- **Linked to:** FR-CC-09 AC-09-3
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ตรรกะ backend (AC-09-1/09-2) ทดสอบแล้วในระดับ local harness
  (TC-CC-024) แต่ **ส่วนจอ ("จอแสดงสถานะที่ต่างจากปกติสำหรับ PR กลุ่มนี้") พึ่ง Command Center (P4)
  ที่ยังไม่ implement เลย** **สิ่งที่ต้องมีก่อน:** P4 เสร็จ + มี PR ทดลองที่แตะ
  `prisma/migrations/**` จริง แล้วเปิดจอดูว่าสถานะแสดงต่างจาก "รอเคาะ" ปกติ

---

### กลุ่ม H — `watchdog.yml` (เฝ้าชีพจรเครื่อง Hermes — เขียนแล้วแต่ยังไม่เคยรันจริงบน GitHub Actions)

#### TC-CC-032: ตรรกะ 4 กิ่งของ `watchdog.yml` ผ่าน local harness ก่อน push

- **Linked to:** FR-CC-14 AC-14-2, AC-14-3
- **Precondition:** —
- **Steps (ตามบันทึกใน commit `fa403166`):** ทดสอบ 4 กิ่งบนเครื่องก่อน commit:
  1. ยังไม่เคยมีชีพจร (ค่าว่าง)
  2. ค่าไม่ใช่ตัวเลข epoch
  3. ชีพจรสด (< 2 ชม.)
  4. ชีพจรเก่ากว่า 2 ชม.
- **Expected Result:** (1) รายงานว่ายังไม่มี **ไม่เปิด issue** · (2) fail-closed ถือว่ามีปัญหา ·
  (3) ถ้ามี issue ค้างอยู่ ปิดให้อัตโนมัติพร้อม comment · (4) เปิด/อัปเดต issue พร้อมบอกผลกระทบ
- **Status:** ✅ **ทดสอบแล้วผ่าน (local harness)** — บันทึกในข้อความ commit `fa403166`: "4 กิ่ง
  ทดสอบครบทุกอันบนเครื่องก่อน commit" พร้อมอธิบายผลลัพธ์คาดหวังของแต่ละกิ่งตรงกับที่ implement จริง
  — **ยังไม่มี CI run จริงบน GitHub Actions พิสูจน์ซ้ำ**

#### TC-CC-033: `watchdog.yml` ไม่เคยรันบน GitHub Actions จริงเลยสักครั้ง (สถานะโครงสร้าง)

- **Linked to:** FR-CC-14 AC-14-2
- **Precondition:** —
- **Steps:** `gh run list --repo CodeCooLTH/deep-web --workflow watchdog.yml`
- **Actual (2026-08-16):** `HTTP 404: workflow watchdog.yml not found on the default branch`
- **Status:** 🚫 **ยืนยันสถานะปัจจุบัน** — เหตุผลเดียวกับ TC-CC-023: `schedule` ประเมินจากไฟล์บน
  default branch เท่านั้น ไฟล์นี้ยังอยู่แค่บน feature branch **สิ่งที่ต้องมีก่อน:** merge เข้า main
  แล้วรอ cron รอบถัดไป (ทุก 30 นาที) เพื่อดู run จริงครั้งแรก

#### TC-CC-034: เครื่อง Hermes เขียนชีพจรผ่าน repository variable — ยังไม่เคยเกิดขึ้นจริง

- **Linked to:** FR-CC-14 AC-14-1
- **Precondition:** —
- **Steps:** `gh api repos/CodeCooLTH/deep-web/actions/variables`
- **Actual (2026-08-16):** `{"variables":[],"total_count":0}`
- **Status:** 🚫 **ยังทดสอบไม่ได้** — P5 (ลูป poll บนเครื่อง Hermes) ยังไม่เริ่ม ไม่มีเครื่องจริงเขียนค่า
  `HERMES_HEARTBEAT` เลย **สิ่งที่ต้องมีก่อน:** P5 implement เสร็จ + เครื่อง Hermes รัน
  `gh api -X PATCH repos/:owner/:repo/actions/variables/HERMES_HEARTBEAT -f value="$(date -u +%s)"`
  จริงอย่างน้อย 1 ครั้ง

#### TC-CC-035: ชีพจรเก่ากว่า 2 ชม. → เปิด/อัปเดต GitHub issue แจ้งเตือนจริง (end-to-end)

- **Linked to:** FR-CC-14 AC-14-3
- **Precondition:** TC-CC-033 + TC-CC-034 ผ่านแล้ว (workflow อยู่บน main + มีชีพจรจริงอย่างน้อย
  1 ครั้ง)
- **Steps:** ปิดเครื่อง Hermes โดยตั้งใจ (ตามที่ design spec §11 ข้อ 4 ระบุเป็นเกณฑ์วัดความสำเร็จ:
  "watchdog.yml เคยแจ้งเตือนจริงตอนปิดเครื่อง Hermes (ทดสอบโดยตั้งใจปิด)") รอ 2 ชม. รอ cron รอบ
  ถัดไป
- **Expected Result:** issue ชื่อ "เครื่อง Hermes ขาดการติดต่อ" ถูกเปิด พร้อมเนื้อหาบอกผลกระทบ
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง TC-CC-033/034 ก่อน — นี่คือเกณฑ์วัดความสำเร็จข้อ 4 ของ design
  spec §11 ที่ยังไม่เคยเกิดขึ้นจริงเลย

#### TC-CC-036: ตัวเฝ้าอยู่บน GitHub Actions เท่านั้น — ไม่มีสำเนาบนเครื่อง Hermes

- **Linked to:** FR-CC-14 AC-14-5
- **Precondition:** —
- **Steps:** `grep -rln "HERMES_HEARTBEAT" --include="*.sh" --include="*.yml" .` (ยกเว้น
  `.github/workflows/watchdog.yml`)
- **Expected Result:** ไม่พบสำเนาตรรกะเฝ้าชีพจรที่ไหนอื่นในรีโป
- **Status:** ✅ **ทดสอบแล้วผ่าน (โดยโครงสร้าง)** — มีไฟล์เดียวที่ตรวจ heartbeat คือ
  `.github/workflows/watchdog.yml`; เครื่อง Hermes เองยังไม่มีอยู่จริง (P5 ยังไม่เริ่ม) จึงไม่มีทางมี
  สำเนาซ้ำบนเครื่องนั้นได้ — สถานะปัจจุบันสอดคล้องกับ AC โดยธรรมชาติ **ต้องตรวจซ้ำอีกครั้งตอน P5
  เขียน loop บนเครื่อง Hermes จริง** เพื่อยืนยันว่าไม่มีใครก็อปตรรกะ stale-check ไปใส่ที่นั่นด้วย

---

### กลุ่ม J — ความปลอดภัยของความลับ (secrets)

#### TC-CC-037: ไม่มี `ANTHROPIC_API_KEY` หรือ `secrets.*` อื่นถูกอ้างอิงใน workflow ใด ๆ

- **Linked to:** §6.5 ความลับ, D-3
- **Precondition:** —
- **Steps:** `grep -n "ANTHROPIC_API_KEY\|secrets\." .github/workflows/*.yml`
- **Expected Result:** ไม่พบผลลัพธ์
- **Status:** ✅ **ทดสอบแล้วผ่าน** — grep คืนค่าว่างทั้ง 3 ไฟล์ (2026-08-16) — ทุก workflow ใช้แค่
  `${{ github.token }}` ในตัวแปร `GH_TOKEN` ไม่มี custom secret ใด ๆ ถูกอ้างถึงเลย

#### TC-CC-038: `DATABASE_URL`/`DIRECT_URL` ใน CI เป็นค่าปลอม/localhost เท่านั้น ไม่มี credential prod

- **Linked to:** FR-CC-06 AC-06-3
- **Precondition:** —
- **Steps:** `grep -n "DATABASE_URL\|DIRECT_URL" .github/workflows/*.yml`
- **Expected Result:** ทุกค่าเป็น `postgresql://dummy...@localhost` หรือ
  `postgresql://safepay:safepay@localhost` เท่านั้น
- **Status:** ✅ **ทดสอบแล้วผ่าน** — พบ 4 บรรทัดในไฟล์เดียว (`verify.yml`) ทั้งหมดปักหมุด `localhost`
  ตรงตาม HR14 — ไม่มีค่าที่ชี้ Supabase (prod/dev แชร์ฐาน) เลยสักบรรทัด

#### TC-CC-039: `gh secret list` ว่างเปล่า — AC-06-3 ("ไม่มี credential prod ในสภาพแวดล้อมที่ agent
  เข้าถึงได้") ยังพิสูจน์ end-to-end ไม่ได้ เพราะยังไม่มี "สภาพแวดล้อมที่ agent เข้าถึงได้" อยู่จริง

- **Linked to:** FR-CC-06 AC-06-3
- **Precondition:** —
- **Steps:** `gh secret list --repo CodeCooLTH/deep-web`
- **Actual:** รายการว่างเปล่า
- **Status:** 🚫 **ยังทดสอบไม่ได้อย่างสมบูรณ์** — ส่วนของ GitHub Actions ปลอดภัยแน่นอน (TC-CC-037/038)
  แต่ AC-06-3 ครอบถึง "สภาพแวดล้อมที่เครื่อง Hermes ทำงาน" ด้วย ซึ่งเครื่องนั้นยังไม่มีอยู่จริง (P5)
  **สิ่งที่ต้องมีก่อน:** P5 implement เสร็จ แล้วตรวจ env ของเครื่อง Hermes จริงว่าไม่มี prod credential
  หลุดเข้าไปอยู่ในบริบทที่ agent (Claude Code) มองเห็นได้

---

### กลุ่ม K — D-8: ไม่มีการเปลี่ยนแปลงฐานข้อมูล

#### TC-CC-040: ไม่มี migration ใหม่ในสาขานี้เลย

- **Linked to:** FR-CC-13 AC-13-1, BR-CC-08
- **Precondition:** —
- **Steps:** `git diff --name-only origin/main...feat/00049-ai-command-center -- prisma/`
- **Expected Result:** ว่างเปล่า
- **Status:** ✅ **ทดสอบแล้วผ่าน** — คำสั่งข้างบนคืนค่าว่างจริง (2026-08-16) — ยืนยันซ้ำอิสระจาก
  `docs/20 - Features/00049 - AI Command Center/DATABASE.md` §2 ที่บันทึกไว้เช่นกัน (ไม่ใช่แค่เชื่อ
  เอกสาร — รันคำสั่งเองแล้วได้ผลตรงกัน)

#### TC-CC-041: `prisma/schema.prisma` ไม่มีการอ้างถึง Command Center เลย

- **Linked to:** FR-CC-13 AC-13-1, BR-CC-08, BR-CC-09
- **Precondition:** —
- **Steps:** `grep -rni "command.center\|CommandCenter\|command_center\|HermesHeartbeat\|AgentChain"
  prisma/schema.prisma`
- **Expected Result:** ไม่พบผลลัพธ์
- **Status:** ✅ **ทดสอบแล้วผ่าน** — grep คืนค่าว่าง (2026-08-16) · `ls prisma/migrations | wc -l` = 142
  ไฟล์ ล่าสุดคือ `20260815180000_comment_reply_rule` (ของ feature 00038 ส่วนขยาย ไม่ใช่ของ 00049)

---

### กลุ่ม L — สายงาน agent 6 ขั้น (P3 — **ยังไม่เริ่ม implement**)

ทุกเคสในกลุ่มนี้ 🚫 เพราะ **ยังไม่มี agent ตัวไหนเขียน comment ตามโครงตายตัว ยังไม่มีการเปลี่ยนป้าย
อัตโนมัติ และยังไม่มีการตัดสินใจข้ามขั้นจริง** — งานทั้งหมดในสายงานตอนนี้ (P0/P0.1/P1) ทำโดยผู้พัฒนา
ตรง ๆ ผ่าน GitHub CLI ไม่ใช่ผ่านป้าย `stage:*`/comment โครงตายตัวที่ design spec §5.2 นิยามไว้

#### TC-CC-042: ทุกขั้นเขียน comment ที่มีอย่างน้อย 4 ส่วนตามโครงตายตัว

- **Linked to:** FR-CC-03 AC-03-1
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ยังไม่มี agent ขั้นไหนทำงานจริงในโหมดสายงาน (ป้าย `stage:*`)
  **สิ่งที่ต้องมีก่อน:** P3 implement (script/prompt ของแต่ละ agent ให้เขียน comment ตามโครง
  `<!-- deep:stage=... from=... at=... -->` + สรุป/ไฟล์ที่แตะ/ข้อควรระวัง/ป้ายที่ส่งต่อ) แล้วสั่งงานจริง
  1 ใบ ตรวจ comment ของแต่ละขั้นว่าครบ 4 ส่วน

#### TC-CC-043: comment ของขั้น UX มี "Theme Source" เมื่อเป็นงาน UI

- **Linked to:** FR-CC-03 AC-03-2 (ผูก HR1/HR3)
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง TC-CC-042 ก่อน **สิ่งที่ต้องมีก่อน:** สั่งงานที่แตะ frontend
  จริง 1 ใบ ตรวจ comment ของขั้น `safepay-ux` ว่ามีบรรทัด "Theme Source"

#### TC-CC-044: ป้ายเปลี่ยนขั้นถัดไปได้ก็ต่อเมื่อ comment สรุปผลถูกเขียนแล้วเท่านั้น

- **Linked to:** FR-CC-03 AC-03-3
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ยังไม่มีกลไกบังคับลำดับนี้จริง (ไม่มีโค้ด/ด่านใดตรวจว่า comment
  มาก่อนป้าย) **สิ่งที่ต้องมีก่อน:** P3 implement + สั่งงานจริงแล้วจงใจดูว่าถ้า agent เปลี่ยนป้ายโดย
  ไม่เขียน comment ก่อน จะมีอะไรจับได้ไหม (ตอนนี้ไม่มีด่านอัตโนมัติฝั่งนี้เลย — เป็นข้อสังเกตที่ QA
  ต้องรายงานกลับตอน P3 เริ่ม ไม่ใช่แค่ "ยังไม่ได้ทดสอบ")

#### TC-CC-045: ข้ามขั้น UX ได้เมื่อไม่แตะ frontend, งานที่แตะ frontend ต้องผ่านขั้น UX เสมอ

- **Linked to:** FR-CC-04 AC-04-1, AC-04-2 (ผูก HR8 — ไม่มีข้อยกเว้น)
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง P3 **สิ่งที่ต้องมีก่อน:** ทดสอบ 2 เคส: (a) สั่งงาน backend
  ล้วน (เช่นแก้ service layer) ยืนยันว่าข้าม `stage:ux` ได้จริงและป้ายที่ `safepay-planner` ระบุคือ
  ตัวตัดสิน ไม่ใช่ให้ `safepay-developer` ตัดสินเอง (b) สั่งงานที่แตะ
  `src/app/(marketing)/**`/`(paces)/**` ยืนยันว่าไม่มีทางข้าม `stage:ux` ได้ไม่ว่ากรณีใด — เคส (b)
  สำคัญกว่าเพราะเป็น "ห้ามมีข้อยกเว้น" (HR8) ต้องมีอย่างน้อย 1 เคสที่ตั้งใจลองข้ามแล้วดูว่าถูกจับ

#### TC-CC-046: ตีกลับพร้อมเหตุผล + ใบที่ถูกตีกลับแล้วไม่มีใครรับต่อยังค้างที่ป้ายเดิม

- **Linked to:** FR-CC-05 AC-05-1, AC-05-2; FR-CC-02 AC-02-2 (สืบย้อนไปหาการสั่งงานของ user ได้)
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง P3 **สิ่งที่ต้องมีก่อน:** จงใจให้ `safepay-reviewer` ตีกลับ
  งานจริง 1 ใบ (เช่นใส่ code ที่ละเมิด HR7 ให้เจอตอน review) ยืนยันว่า comment เหตุผลถูกเขียนก่อน
  เปลี่ยนป้ายกลับ `stage:build` แล้วปล่อยใบนั้นค้างไว้ (ไม่มีใครรับต่อ) เช็คอีกครั้งหลัง 24 ชม. ว่ายัง
  อยู่ที่ `stage:build` ไม่หายไปจากทั้ง GitHub และจอ (จอยังไม่มีจนกว่า P4 เสร็จ — ตรวจแค่ฝั่ง GitHub
  ได้ก่อน)

---

### กลุ่ม M — หน้าจอ Command Center (P4 — **ยังไม่เริ่ม implement**)

ไม่มีไฟล์ `src/app/(paces)/admin/(dashboard)/command-center/page.tsx` อยู่จริง (ยืนยัน:
`ls "src/app/(paces)/admin/(dashboard)/" 2>&1` ไม่มีโฟลเดอร์ `command-center`) — ทุกเคสในกลุ่มนี้ 🚫
ทั้งหมด ต้องรอ ux gate (HR8) ผ่านตาม UX-Design-Spec.md ที่มีอยู่แล้ว แล้ว implement จริงก่อน

#### TC-CC-047: สั่งงานใหม่จากหน้าเว็บ → สร้าง issue ป้าย `stage:plan` ทันที

- **Linked to:** FR-CC-01 AC-01-1, AC-01-2, AC-01-3
- **Status:** 🚫 **ยังทดสอบไม่ได้** — ไม่มีหน้าเว็บ ไม่มี API route **สิ่งที่ต้องมีก่อน:** P4 implement
  หน้า `/command-center` + modal "สั่งงานใหม่" (UX-Design-Spec.md §3 ข้อ 5) + API route ที่สร้าง
  GitHub issue — แล้วทดสอบ: กรอกหัวข้อ+รายละเอียด → กดส่ง → เปิด DevTools Network ยืนยันว่า request
  ยิงไป API route ของเรา (ไม่ใช่ตรงเข้า GitHub REST จาก client) → ตรวจว่า token ไม่ปรากฏใน response
  body/JS bundle → เปิด GitHub ยืนยันว่า issue ใหม่มีป้าย `stage:plan` จริง

#### TC-CC-048: บอร์ด 7 คอลัมน์ + แถบสถานะบน derive จาก GitHub ตรง ไม่เก็บ state เอง

- **Linked to:** FR-CC-13 AC-13-2, AC-13-3, AC-13-4
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง P4 **สิ่งที่ต้องมีก่อน:** implement เสร็จ → ทดสอบ: เปลี่ยน
  ป้ายของ issue ตรงบน GitHub UI (ไม่ผ่านจอเรา) → รีเฟรช/รอ poll รอบถัดไป (15–30 วิ) → ยืนยันว่าจอ
  ขยับตามภายในเวลานั้น (พิสูจน์ว่า "อ่านจาก GitHub ตรง" ไม่ใช่ cache) → เปิด Network tab ยืนยันว่า
  ใช้ ETag/conditional request (เห็น `304` เมื่อไม่มีอะไรเปลี่ยน) → ยืนยัน token ไม่หลุดไป client
  (เหมือน TC-CC-047)

#### TC-CC-049: ปุ่ม "เคาะพร้อมขึ้น" — ไม่มี agent ติดป้ายให้ตัวเองได้ + เคาะจาก GitHub ตรง ๆ ก็ใช้ได้

- **Linked to:** FR-CC-11 AC-11-1, AC-11-2, AC-11-3
- **Status:** 🚫 **ยังทดสอบไม่ได้ (บางส่วน)** — AC-11-1 (ไม่มี agent token ใดติดป้ายได้) พึ่ง PAT ของ
  Hermes ที่ยังไม่ถูกสร้าง (TC-CC-005) จึงยังพิสูจน์ end-to-end ไม่ได้ · AC-11-2 (ปุ่มบนจอ) พึ่ง P4
  · **AC-11-3 (เคาะป้ายจาก GitHub ตรง ๆ ก็ใช้ได้) มีหลักฐานบางส่วนแล้ว: ป้าย "พร้อมขึ้น" มีอยู่จริง
  บน GitHub และติดได้ผ่าน `gh pr edit --add-label` ตรง ๆ (พิสูจน์ได้ทันทีเพราะเป็นความสามารถ
  พื้นฐานของ GitHub ไม่ใช่ของที่เราสร้าง) แต่ "ใช้ได้" ในความหมายที่ BRD ต้องการ (auto-merge.yml
  รับรู้และเก็บให้จริง) ยังพึ่ง TC-CC-023 อยู่**

#### TC-CC-050: ตีกลับ/หยุดงานจากจอ

- **Linked to:** FR-CC-12 AC-12-1, AC-12-2
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง P4 **สิ่งที่ต้องมีก่อน:** implement ปุ่ม `⋮` → "ตีกลับไปแก้"
  (Swal กรอกเหตุผลบังคับ) / "หยุดใบงานนี้" (Swal ยืนยัน) → ทดสอบ: กดตีกลับ กรอกเหตุผล → ยืนยันป้าย
  เปลี่ยนกลับขั้นก่อนหน้า + comment เหตุผลถูกเขียนบน GitHub จริง · กดหยุด → ยืนยันป้าย `stage:*` ทั้งหมด
  ถูกถอดออกจริง

#### TC-CC-051: Edge state — อ่าน GitHub ไม่ได้ (บล็อกทั้งหน้า)

- **Linked to:** UX-Design-Spec.md §7 (edge states), NFR §6.3
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง P4 **สิ่งที่ต้องมีก่อน:** implement เสร็จ → จำลอง GitHub
  API ตอบ error (เช่น revoke token ชั่วคราวในสภาพแวดล้อมทดสอบ) → ยืนยันว่าขึ้น banner แดงเต็มกว้าง
  + `cloud-off` + ข้อความตามสเปก และ **บอร์ดไม่ render เลย** (ไม่ใช่จอว่างเปล่าไม่มีคำอธิบาย)

#### TC-CC-052: Edge state — โควตา API หมด (ลดระดับ ไม่บล็อก)

- **Linked to:** UX-Design-Spec.md §7
- **Status:** 🚫 **ยังทดสอบไม่ได้** — เหตุผลเดียวกับ TC-CC-051 — ต้องจำลองสถานการณ์โควตาหมดเพื่อยืนยัน
  banner เหลือง (ไม่ใช่แดง) พร้อมข้อความ "ข้อมูลด้านล่างเป็นของ {relative}"

#### TC-CC-053: Edge state — Hermes ขาดการติดต่อ → แถบแดงบนจอ

- **Linked to:** FR-CC-14 AC-14-4
- **Status:** 🚫 **ยังทดสอบไม่ได้** — พึ่ง P4 + TC-CC-035 (ต้องมี issue "เครื่อง Hermes ขาดการติดต่อ"
  เปิดอยู่จริงก่อน) — สองเงื่อนไขที่ยังไม่มีสักอันในตอนนี้

---

### กลุ่ม O — Cross-cutting

#### TC-CC-054: ไม่มี cron หรือ agent ใดสแกนหา backlog/TODO แล้วเปิด issue เอง

- **Linked to:** FR-CC-02 AC-02-1
- **Precondition:** —
- **Steps:** อ่านทั้ง 3 ไฟล์ workflow (`verify.yml`, `auto-merge.yml`, `watchdog.yml`) ที่มีอยู่จริง
  ตอนนี้ทั้งหมด
- **Expected Result:** ไม่มีไฟล์ใดสแกนหา backlog/TODO ในโค้ดแล้วเปิด issue ใหม่เอง — `watchdog.yml`
  เปิด/อัปเดต issue ได้ **เฉพาะ** "เครื่อง Hermes ขาดการติดต่อ" (ปัญหาระบบ ไม่ใช่ใบงาน `stage:*`)
  และ `auto-merge.yml`/`verify.yml` ไม่เปิด issue เลยสักบรรทัด
- **Status:** ✅ **ทดสอบแล้วผ่าน (ตรวจสอบโค้ดครบทั้ง 3 ไฟล์)** — อ่านทั้งไฟล์เต็ม (ไม่ใช่ grep ผิวเผิน)
  2026-08-16 พบว่าคำสั่ง `gh issue create`/`gh issue comment`/`gh issue close` ปรากฏเฉพาะใน
  `watchdog.yml` และผูกกับ title คงที่ `"เครื่อง Hermes ขาดการติดต่อ"` เท่านั้น ไม่มี logic ใดที่วน
  ลูปหาไฟล์/บรรทัด TODO ในซอร์สโค้ดแล้วสร้างงานเอง — **หมายเหตุ:** เคสนี้ทดสอบได้แค่ "โค้ดที่มีอยู่
  ตอนนี้ไม่ทำ" เท่านั้น ยังไม่ครอบคลุมพฤติกรรมของสายงาน agent (P3) หรือเครื่อง Hermes (P5) ที่ยัง
  ไม่มีโค้ดอยู่จริง — ต้องตรวจซ้ำเมื่อ P3/P5 เขียนเสร็จ

---

## 3. Traceability Matrix

> ทุก AC ใน [[BRD]] ต้องปรากฏในตารางนี้ — เลข AC อ้างอิงตามลำดับบูลเล็ตภายใต้ FR นั้นใน BRD §2
> (เช่น `AC-01-2` = บูลเล็ตที่ 2 ของ FR-CC-01) เพราะ BRD ไม่ได้ให้เลขกำกับ AC แต่ละข้อไว้เอง

| FR / AC ใน [[BRD]] | Test Case | สถานะ |
|---|---|---|
| FR-CC-01 AC-01-1, AC-01-2, AC-01-3 | TC-CC-047 | 🚫 blocked (P4) |
| FR-CC-02 AC-02-1 | TC-CC-054 | ✅ |
| FR-CC-02 AC-02-2 | TC-CC-046 (บางส่วน) | 🚫 blocked (P3+P4) |
| FR-CC-03 AC-03-1 | TC-CC-042 | 🚫 blocked (P3) |
| FR-CC-03 AC-03-2 | TC-CC-043 | 🚫 blocked (P3) |
| FR-CC-03 AC-03-3 | TC-CC-044 | 🚫 blocked (P3) |
| FR-CC-04 AC-04-1, AC-04-2 | TC-CC-045 | 🚫 blocked (P3) |
| FR-CC-05 AC-05-1, AC-05-2 | TC-CC-046 | 🚫 blocked (P3) |
| FR-CC-06 AC-06-1 | TC-CC-002, TC-CC-005 | 🚫 blocked (branch protection ยังไม่เปิด + PAT ยังไม่มี) |
| FR-CC-06 AC-06-2 | TC-CC-005, TC-CC-006, TC-CC-007 | บางส่วน ✅ (ฝั่งด่าน verify.yml) / 🚫 (ฝั่งสิทธิ์ token จริง) |
| FR-CC-06 AC-06-3 | TC-CC-037, TC-CC-038, TC-CC-039 | บางส่วน ✅ (ฝั่ง CI) / 🚫 (ฝั่งเครื่อง Hermes) |
| FR-CC-07 AC-07-1 | TC-CC-010, TC-CC-011, TC-CC-012 | ✅ (บล็อกจริงพิสูจน์แล้วในเคส infra) / 🚫 (type error ในโค้ด production ยังไม่เคยพิสูจน์) |
| FR-CC-07 AC-07-2 | TC-CC-013, TC-CC-014, TC-CC-015 | ✅ (เขียว+ไม่มี baseline) / 🚫 (บล็อกเมื่อแดงจริงยังไม่เคยพิสูจน์) |
| FR-CC-07 AC-07-3 | TC-CC-016, TC-CC-017, TC-CC-018, TC-CC-019 | ✅ (local harness + CI เขียว) / 🚫 (บล็อกจริงบน CI ยังไม่เคยพิสูจน์) |
| FR-CC-07 AC-07-4 | TC-CC-020, TC-CC-021 | ✅ |
| FR-CC-08 AC-08-1 ถึง AC-08-9 | TC-CC-023, TC-CC-025 ถึง TC-CC-030 | 🚫 blocked ทั้งหมด (workflow ยังไม่อยู่บน `main`) |
| FR-CC-09 AC-09-1, AC-09-2 | TC-CC-024 | ✅ (local harness) |
| FR-CC-09 AC-09-3 | TC-CC-031 | 🚫 blocked (P4) |
| FR-CC-10 AC-10-1 | TC-CC-006, TC-CC-007, TC-CC-008, TC-CC-009 | ✅ (2 เคสหลัก) / 🚫 (2 เคส edge) |
| FR-CC-10 AC-10-2 | TC-CC-002, TC-CC-003, TC-CC-004 | ✅ (เนื้อไฟล์) / 🚫 (มีผลจริง) |
| FR-CC-11 AC-11-1 | TC-CC-005, TC-CC-049 | 🚫 blocked |
| FR-CC-11 AC-11-2 | TC-CC-049 | 🚫 blocked (P4) |
| FR-CC-11 AC-11-3 | TC-CC-049, TC-CC-001 | ✅ (ป้ายมีอยู่จริงติดได้) / 🚫 (auto-merge รับรู้จริง) |
| FR-CC-12 AC-12-1, AC-12-2 | TC-CC-050 | 🚫 blocked (P4) |
| FR-CC-13 AC-13-1 | TC-CC-040, TC-CC-041 | ✅ |
| FR-CC-13 AC-13-2, AC-13-3, AC-13-4 | TC-CC-048 | 🚫 blocked (P4) |
| FR-CC-14 AC-14-1 | TC-CC-005, TC-CC-034 | 🚫 blocked (P5) |
| FR-CC-14 AC-14-2 | TC-CC-032, TC-CC-033 | ✅ (local harness) / 🚫 (live cron) |
| FR-CC-14 AC-14-3 | TC-CC-032, TC-CC-035 | ✅ (local harness) / 🚫 (end-to-end) |
| FR-CC-14 AC-14-4 | TC-CC-053 | 🚫 blocked (P4 + P5) |
| FR-CC-14 AC-14-5 | TC-CC-036 | ✅ |

**สรุปความครอบคลุม:** 47 AC ทั้งหมดมี TC อ้างอิงครบ — ไม่มี AC ไหนไม่มี TC เลย (ตามกฎ WRITER gate)
แต่ **ประมาณ 30 จาก 47 AC ยังอยู่ในสถานะ 🚫 (ยังทดสอบไม่ได้) เต็มหรือบางส่วน** เพราะ P3/P4/P5
ยังไม่เริ่ม implement — ตัวเลขนี้ไม่ใช่ "หนี้เทส" แต่คือ "งานที่ยังไม่ถูกสร้าง" (ดู
`docs/conventions/known-limitation-vs-unfinished.md`)

---

## 4. Flow

```mermaid
flowchart TD
    subgraph Proven["✅ พิสูจน์แล้วด้วย CI run จริง (P0/P0.1/P1)"]
        A0[ด่าน 0: path คุ้มครอง] -->|บล็อกจริง run 31930716269| A1[ด่าน 1: next build]
        A1 -->|แก้ tsc→build run 2779463d| A2[ด่าน 2: vitest src/]
        A2 --> A3[ด่าน 3: theme-guard]
        A3 --> A4[ด่าน 4: vitest tests/ + Postgres]
        A4 -->|126/126 เขียว run 31933049115| A5[verify.yml เขียวครบ]
    end

    subgraph LocalOnly["✅ พิสูจน์ด้วย local harness เท่านั้น ยังไม่มี CI run จริง"]
        B1[auto-merge.yml ด่าน 5: migration guard]
        B2[watchdog.yml 4 กิ่ง: no-heartbeat/non-numeric/fresh/stale]
    end

    subgraph Blocked["🚫 บล็อกทั้งหมด — รอ merge เข้า main / รอ P3-P5"]
        C0[merge PR #5 เข้า main<br/>ตัดสินใจโดย user เท่านั้น — HR15]
        C1[เปิด branch protection + CODEOWNERS มีผลจริง]
        C2[auto-merge.yml รันจริงบน Actions]
        C3[watchdog.yml รันจริงบน Actions]
        C4[PAT เครื่อง Hermes + P5 loop]
        C5[P3: สายงาน agent 6 ขั้น]
        C6[P4: หน้าจอ Command Center]
    end

    A5 --> C0
    C0 --> C1
    C0 --> C2
    C0 --> C3
    C2 --> C4
    C3 --> C4
    C4 --> C5
    C5 --> C6
    B1 -.parity เมื่อรันจริง.-> C2
    B2 -.parity เมื่อรันจริง.-> C3
```

---

## 5. ผลล่าสุด

| Run | วันที่ | ผล (Pass/Fail/Blocked) | ผู้ทดสอบ (Tester) |
|-----|--------|--------------------------|---------------------|
| 1 | 2026-08-16 | **Partial** — `verify.yml` ด่าน 0-4 พิสูจน์ครบผ่าน CI run จริง (5 runs, 1 fail→fix→4 pass); `auto-merge.yml`/`watchdog.yml` ผ่านแค่ local harness (ยังไม่เคยรันบน Actions — ไม่อยู่บน `main`); P3/P4/P5 ทั้งหมด Blocked (ยังไม่ implement) | Developer (local harness + CI ระหว่าง implement) · รวบรวม/ตรวจทานหลักฐานอิสระโดย safepay-qa ผ่าน `gh` CLI ตรงกับ GitHub จริง |

**Open items สำหรับรอบทดสอบถัดไป (เรียงตามลำดับที่ปลดล็อกเคสได้มากที่สุด):**
1. เปิด PR ทดลอง (draft, ไม่ merge) ที่จงใจทำให้แดงทีละด่าน (TC-CC-012, 014, 019) — ปลดล็อก 3 เคส
   โดยไม่ต้องรอ merge จริง ทำได้ทันที
2. user ตัดสินใจ merge PR #5 เข้า `main` — ปลดล็อกทั้งกลุ่ม G/H (TC-CC-025 ถึง 036) ทันทีที่ cron
   รอบแรกทำงาน
3. เปิด branch protection + ติ๊ก "Require review from Code Owners" — ปลดล็อก TC-CC-002/003
4. P3 (สายงาน agent) — ปลดล็อกกลุ่ม L ทั้งหมด
5. P4 (หน้าจอ) ผ่าน ux gate (HR8) ก่อน — ปลดล็อกกลุ่ม M ทั้งหมด
6. P5 (เครื่อง Hermes) — ปลดล็อก TC-CC-005, 034, 035, 039 ที่เหลือ

---

## 6. สรุป (Summary)

เอกสาร Test Case นี้กำหนดชุดเคสทดสอบของ **AI Command Center + Agent Chain (00049)** ที่ trace กลับ
Acceptance Criteria ใน [[BRD]] ครบทั้ง 47 ข้อ **ไม่มี AC ไหนไม่มี TC อ้างอิง**

ณ วันที่เขียนเอกสารนี้ (2026-08-16) มีโค้ดจริงแค่ P0/P0.1/P1 (`verify.yml`) และบางส่วนของ P2
(`auto-merge.yml`/`watchdog.yml`/`CODEOWNERS` — เขียนแล้วแต่ยังไม่เคยรันจริงบน GitHub Actions เพราะ
ยังไม่ merge เข้า `main`) — ส่วนที่มีโค้ดจริงถูกพิสูจน์ด้วย CI run จริง 5 ครั้งบน `CodeCooLTH/deep-web`
(run id ทุกตัวอ้างอิงได้, ตรวจสอบซ้ำได้ทุกเมื่อผ่าน `gh run view <id>`) รวมถึงพบและแก้บั๊กจริง 2 ตัวที่
เครื่อง dev มองไม่เห็น (tsc บน checkout สะอาด, การอ่านป้ายจาก event snapshot) — นี่คือหลักฐานว่าด่าน
ทำงานได้จริง ไม่ใช่แค่ผ่านเพราะไม่มีอะไรให้ตรวจ

P3 (สายงาน agent 6 ขั้น), P4 (หน้าจอ Command Center) และ P5 (ลูป poll บนเครื่อง Hermes) **ยังไม่เริ่ม
implement** — ทุกเคสในกลุ่มนี้ระบุ "สิ่งที่ต้องมีก่อน" เป็นขั้นตอนที่ทำจริงได้ ไม่ใช่คำอธิบายกำกวม
ตามกฎเหล็กของเอกสารนี้

**Open Questions:**
- TC-CC-025 ถึง TC-CC-030 (auto-merge.yml end-to-end) พึ่งการตัดสินใจของ user ในการ merge PR #5
  เข้า `main` — QA agent ไม่มีอำนาจตัดสินใจนี้เอง (merge = migration รันบน prod ทันทีตาม HR15)
- TC-CC-044 (บังคับลำดับ comment-ก่อน-เปลี่ยนป้าย) ยังไม่มีกลไกบังคับอัตโนมัติฝั่งใดเลยในดีไซน์ปัจจุบัน
  — ควรถามทีม planner ว่าจะปล่อยเป็น convention (พึ่งวินัยของ agent) หรือสร้างด่านตรวจจริงตอน P3

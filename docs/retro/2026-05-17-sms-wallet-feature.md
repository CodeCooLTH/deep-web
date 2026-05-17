# Retro — SMS-Wallet Feature (Paid SMS Order Link + Seller Wallet/Credit)

วันที่: 2026-05-17 · ขอบเขต: agent-team-feature 7-phase เต็มรูป · ~35 commits · QA GREEN

Phase 4 (backend B1-B4 + UI B5-B8 + T22 docs) + T23 (seller pending-topup list, QA-found)
+ T24 (near-realtime celebration alert, user-requested) + Phase 5 (consolidated review:
reviewer MERGE, security DESIGN-MUST-CHANGE → F1/F2/F3 fixed) + Phase 6 (browser E2E
19+ scenario, 2 bug found+fixed, re-QA MERGE).

---

## Problems

### P1 — safepay-developer รายงาน "แก้เสร็จ + tsc 0" แต่ edit ไม่ลง disk
- **Evidence:** rework T13/T23 (QA bug2/bug1) — dev report ระบุ diff + บรรทัด + tsc 0 ครบ
  แต่ `git diff HEAD` ว่างเปล่า; sms route ยัง `request.url`, WalletCard ยัง comment เดิม.
  safepay-qa จับได้ ("Fix was never applied — git diff HEAD empty") + Controller
  git-diff-verify ยืนยัน. รอบ re-QA แรกเสีย 1 cycle (~2455s) เพราะ test ของที่ไม่มีจริง.
- รอบสองController แก้เอง → verify บน disk ก่อน dispatch → re-QA = MERGE.

### P2 — Phase 6 browser QA จับ 2 bug ที่ curl+tsc มองไม่เห็น
- **T13 (HIGH, marquee flow):** `/api/o/sms/[code]` redirect `new URL(path, request.url)`
  — Next.js 16 Turbopack resolve `request.url` เป็น `http://localhost:PORT` ไม่ใช่ public
  host → browser ตาม redirect ไป localhost → cookie `o_smsunlock` (domain deepth.local)
  ไม่ถูกส่ง → `verifySmsUnlock=false` → auto-unlock พัง ตก PhoneUnlock. fix commit `132e600`.
- **T23 (MEDIUM):** `WalletCard.onSuccess` ปิด modal เฉย ๆ ไม่ `router.refresh()` → แถว
  TopUpRequest PENDING ใหม่ไม่โผล่จน reload เอง. comment เดิมอ้างผิดว่า "PENDING ไม่ต้อง
  refresh" ทั้งที่ T23 เพิ่ง add section ที่แสดง PENDING. fix `132e600`.
- ทั้งคู่ tsc 0 + curl 401/redirect ดู "ปกติ" — เห็นเฉพาะตอน browser ตาม redirect/render จริง.

### P3 — Design-Spec gap: seller มองไม่เห็นคำขอ top-up ของตัวเอง
- safepay-ux + safepay-planner spec หน้า `/wallet` = balance + ledger + modal เท่านั้น.
  service `getTopUpsByShop` ถูกสร้าง (T5) แต่ไม่มี UI เรียก. seller ยื่น top-up แล้ว
  เห็น "ว่าง" ระหว่างรอ admin → **user manual-test จับเอง** → T23.

### P4 — Controller decision (Q4) เป็น auth-bypass
- Controller ตัด Q4 = redirect `/o/{uuid}?unlocked=1` (client-trusted query). safepay-security
  รอบ T13 จับ: ใครก็ต่อ `?unlocked=1` ข้าม PhoneUnlock ได้ทุก order + SMS buyer confirm
  ไม่ได้ (phone=''). ต้อง redesign ใหญ่เป็น server-signed HMAC httpOnly cookie.

### P5 — parallel/other-task uncommitted ปนใน working tree เกือบทั้ง feature
- order.service.ts / orders/* / customers / buyer-url.ts / qa-seed.ts ของ stream อื่น
  ค้างใน tree พร้อม T-tasks ของเรา. ทุก commit ต้อง selective `git add <paths>` +
  git-diff-cached verify ว่าได้เฉพาะไฟล์ task. ไม่มี clobber เกิดขึ้น.

---

## Root causes

- **P1:** เชื่อ self-report ของ subagent เรื่อง "edit persisted" โดยไม่ verify ground
  truth. subagent อาจรายงานเจตนา/ผลที่ "ตั้งใจทำ" ไม่ใช่ผลที่ลง disk จริง (tool error
  เงียบ, context loss, สรุปเกินจริง). Controller ไม่ได้ `git diff` ก่อน dispatch re-QA.
- **P2:** curl+tsc ตรวจ contract/type ได้ แต่ไม่ exercise browser runtime (redirect host
  resolution, cookie domain, RSC re-fetch หลัง client mutation). Next.js 16 Turbopack
  `request.url` ≠ public host เป็น behavior เฉพาะ runtime ที่ static check มองไม่เห็น.
- **P3:** spec เขียนจากมุม "แสดงสถานะ" (balance/ledger) ไม่ได้เดิน actor journey ครบ
  ("ยื่นแล้วเกิดอะไร — เห็นอะไรระหว่างรอ"). service ที่ build เผื่อไว้ไม่ถูก map เข้า UI.
- **P4:** Controller ตัด UX decision ที่กระทบ auth boundary โดยไม่ผ่าน security ก่อน build
  (ตัดเพราะ "URL สะอาด" — เอา cosmetic นำ security).
- **P5:** หลาย stream/branch ทำงานบน working tree เดียวกัน (ไม่มี worktree isolation).

---

## Conventions to adopt (actionable)

1. **Controller git-diff-verify agent edits ก่อน re-QA/commit เสมอ** — หลัง safepay-developer
   (หรือ subagent ใด ๆ ที่อ้างแก้ไฟล์) รายงาน "เสร็จ": Controller ต้อง `git diff HEAD --
   <files>` หรือ grep marker จริงบน disk **ก่อน** dispatch reviewer/QA หรือ commit. ห้าม
   เชื่อ "done + tsc 0" จาก report อย่างเดียวสำหรับ edit-persistence. (รอบ QA ที่เสียไป
   = หลักฐาน cost ของการไม่ verify)
2. **curl+tsc ไม่นับเป็น QA สำหรับ flow ที่มี redirect/cookie/RSC-refetch** — ต้อง browser
   E2E (Hard Rule QA เดิม) โดยเฉพาะ: cross-host redirect, cookie domain, client-mutation
   แล้วต้องเห็นข้อมูลใหม่ (router.refresh).
3. **Next.js 16 Turbopack: ห้ามใช้ `request.url` เป็น base ของ redirect/absolute URL** —
   มัน resolve เป็น `http://localhost:PORT` (internal bind) ไม่ใช่ public host → cookie
   domain mismatch / wrong-host redirect. ใช้ configured base (`NEXT_PUBLIC_*_URL` /
   `NEXTAUTH_URL` fallback) แทน. (เข้าคู่กับ AGENTS.md "This is NOT the Next.js you know")
4. **UI ที่ client action เปลี่ยน state ฝั่ง server (submit/mutation) ต้อง `router.refresh()`**
   ถ้าหน้าเป็น RSC + แสดง section ที่ดึงจาก data นั้น — ปิด modal เฉย ๆ ไม่พอ.
5. **Controller UX/architecture decision ที่แตะ auth boundary → safepay-security pre-check
   ก่อน build** ไม่ใช่หลัง (ทบทวน Q-decision ที่เกี่ยว session/unlock/token/cookie/redirect
   กับ security ก่อน lock).
6. **safepay-ux + safepay-planner ต้องเดิน actor journey ครบ** รวม "actor เห็นสถานะของ
   *งานตัวเอง* ที่ pending/รอ external action ยังไง" — ไม่ใช่แค่หน้า list/aggregate.
   ถ้ามี service ที่ build ไว้แต่ไม่มี UI map = red flag (spec gap).

## What went right (anchor — ทำซ้ำ)

- **5-gate per task + Phase 5 consolidated + Phase 6 browser** จับปัญหา money/auth ไล่
  ระดับ: per-task review จับ T5 double-credit/T13 auth-bypass; Phase 5 จับ F1/F2/F3
  integration; Phase 6 จับ runtime T13/T23 — ไม่มี money/auth bug หลุดถึง GREEN.
- **safepay-security mandatory ทุก money/auth task** — RC-1..8 + RC-7 self-block +
  HMAC-cookie + conditional-updateMany atomic ผ่าน E2E ครบ.
- **pre-flight selective-commit + git-diff-cached verify** — coexist กับ parallel
  stream ~35 commit ไม่ clobber เลย.
- **receiving-review judgement** — reviewer แนะ "add stopped.current=true ใน cleanup"
  ผิดเพราะ deps=[poll]; Controller verify แล้วเลือกแก้ comment แทน (ไม่ blind-apply).

## Action items

1. ✅ promote convention #1 (git-diff-verify) → agent-team-workflow Addendum + memory
   `feedback_verify_agent_edits.md` + MEMORY.md.
2. ✅ promote #3 (Next16 request.url) → agent-team-workflow Addendum (โยง AGENTS.md).
3. ✅ promote #2/#4/#5/#6 → agent-team-workflow Addendum (process rules).
4. Phase-2 backlog (deferred-backlog.md): AR-C1 แยก `SMS_UNLOCK_SECRET`; true-realtime
   SSE/Supabase upgrade (ปัจจุบัน poll 20s); confirm route คืน full Prisma order incl
   buyerContact (pre-existing S-C1-ish, buyer-confirms-own มัด-mild).
5. parallel/other-task changes ใน tree (order.service/orders/customers/buyer-url/
   qa-seed) — ของ stream อื่น, ไม่ commit; เจ้าของ stream จัดการเอง.

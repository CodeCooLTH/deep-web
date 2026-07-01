# Retrospective — Inventory Add-on Implementation Phase (Feature 00003)

**วันที่:** 2026-07-01
**Phase:** `inventory-addon-impl` — SIGNED-OFF
**ผลลัพธ์:** 16/16 S-id DONE · docs 7/7 · Gate 1 scope-audit PASS · QA 9/9 Playwright E2E PASS · DoD 8/8
**Branch:** `shinobu22/feature-addon-inventory` (ยังไม่ push)

---

## Problems (อะไรพัง + evidence)

### P1 — bug `activatedAt` reset ตอน reactivate (bug จริงที่ reviewer จับได้)
`reactivateInventoryEntitlement` set `activatedAt: now` ทับทุกครั้ง — แต่ `DATABASE.md §3.1` ระบุ `activatedAt` ตั้งครั้งเดียวตอน subscribe แรก ห้ามเปลี่ยน (marker วันสมัคร/cohort/tenure). ถ้าหลุดไป prod ทุก reactivate จะทำลายวันสมัครเดิม.
- **Evidence:** safepay-reviewer batch S-3/S-4 (commit `2426b40` แก้). Bug trace: `SRS.md:206` pseudocode → `SDS.md:241` → developer copy → code. **Tests doc เดิม (TC-INV-24) ก็ไม่มี assertion `activatedAt` unchanged** → QA ก็จับไม่ได้ถ้า reviewer ไม่เจอ.

### P2 — GAP: route-level `OutOfStockError → 400` ไม่มีใน task ไหน (QA จับได้)
hard-stop stock=0 ตอบ **500** แทน 400 — `src/app/api/orders/route.ts` POST ไม่ catch `OutOfStockError` (ตกไป generic 500). data ปลอดภัย (all-or-nothing rollback) แต่ error contract ผิด FR-INV-11/API.md §4.6.
- **Evidence:** safepay-qa Playwright test #7 FAIL (500 body "Order creation failed"). แก้ commit `5fc3f89`.
- **Root:** S-5 scope = `order.service.ts` เท่านั้น (throw OutOfStockError); การ **catch ที่ route** อยู่คนละไฟล์ (`api/orders/route.ts`) ซึ่ง**ไม่ถูก assign ให้ S-id ใด** — SDS §7 (Error Handling Map) ระบุ mapping ไว้ แต่ตอนแตก task ตกหล่น. Gate 1 scope-audit ก็ไม่เจอเพราะ audit เทียบ "ไฟล์ที่แตะ vs baseline" — ไฟล์ที่**ควรแตะแต่ไม่ได้แตะ** ไม่โผล่ใน diff.

### P3 — feature number collision (00002)
เริ่มจอง `00002 - Inventory Add-on` แต่ branch `feat/seller-auction` จอง `00002 - Seller Auction` ไปแล้ว (คนละ branch ยังไม่ merge → ไม่เห็นตอน `ls docs/20 - Features/`). ต้อง renumber → **00003** (commit `039c7a3`).
- **Evidence:** `git log --all --name-only | grep 00002` เจอทั้งสอง feature.

### P4 — worktree ไม่มี `.env.local`
Controller apply migration + รัน QA ไม่ได้จาก worktree เพราะมีแค่ `.env.example`. ต้องใช้ `/Users/craftman/Projects/safepay/.env.local` (main repo) ผ่าน `dotenv -e <path>`.

### P5 — E2E flake: `page.goto('/dashboard')` timeout 15s
dev Turbopack cold-compile ของ authenticated `/dashboard` ใช้ >15s → Playwright default goto timeout (15s) fail (test #6). ไม่ใช่ feature bug (fail ก่อนถึง stock logic; QA รอบแรก dashboard warm → PASS). แก้ด้วย bump timeout 60s (`e2e/inventory-addon.spec.ts:201`).

---

## Root causes

- **P1/P2:** SRS/SDS **pseudocode ถูก copy เข้า code ตรง ๆ** โดย developer — pseudocode ที่มี bug/ตกหล่น propagate ทันที. reviewer/QA เป็นด่านจับ แต่ต้องจับให้ครบ (ต้อง cross-check invariant ใน DATABASE.md ไม่ใช่แค่ "ตรง SDS"). สำหรับ P2: การแตก task เป็น "1 service = 1 S-id" ทำให้ **cross-file responsibility (service throw ↔ route catch) ตกร่อง** เพราะ error-catch อยู่คนละไฟล์คนละ S-id.
- **P3:** จอง feature number จาก `ls docs/20 - Features/` (working branch เดียว) — ไม่ครอบ branch อื่นที่ยังไม่ merge.
- **P4:** git worktree ไม่ copy gitignored files (`.env.local`).
- **P5:** dev-server cold-compile latency สูงกว่า Playwright default timeout สำหรับหน้าหนัก.

---

## Conventions to adopt (actionable)

1. **[CROSS-FILE ERROR-MAPPING] เมื่อ service ตัวใหม่ throw error type ใหม่ → task decomposition ต้องมี S-id ที่ครอบ "route handler catch → HTTP status" ของ error นั้นด้วยเสมอ.** planner ตอนแตก task: ทุก custom Error ที่ service throw ต้อง map ว่า catch ที่ route ไหน (ไฟล์ไหน S-id ไหน). ห้ามถือว่า "service throw แล้วจบ".
2. **[SCOPE-AUDIT NEGATIVE-CHECK] Gate 1 scope-audit ต้องเช็ค "ไฟล์ที่ควรแตะแต่ไม่ได้แตะ" (GAP เชิงลบ) ไม่ใช่แค่ "ไฟล์ที่แตะเกิน" (CREEP).** วิธี: ไล่ SDS §Error Handling Map + API.md error table เทียบว่าทุก error case ถูก implement ที่ layer ที่ระบุ.
3. **[PSEUDOCODE ≠ SPEC-OF-TRUTH] reviewer ต้อง cross-check โค้ดกับ invariant ใน DATABASE.md/BRD (ไม่ใช่แค่ "ตรง SDS pseudocode").** SDS/SRS pseudocode อาจมี bug — เมื่อ field มี invariant ("ตั้งครั้งเดียว/ห้ามแตะ") ต้องยืนยันว่า mutate path ทุกจุดเคารพ.
4. **[FEATURE-NUMBER] ก่อนจอง feature number ใหม่ใน `docs/20 - Features/` → `git log --all --name-only --oneline | grep "NNNNN -"` ทุก branch (ไม่ใช่แค่ `ls`).** feature ที่ยังไม่ merge จองเลขไปแล้วได้.
5. **[WORKTREE ENV] git worktree ไม่มี `.env.local` (gitignored) → migration/QA/seed ต้องชี้ env จาก main repo:** `dotenv -e /Users/craftman/Projects/safepay/.env.local -- <cmd>` + `node_modules/.bin/prisma` (bare `npx prisma` = v7 incompatible).
6. **[E2E DEV COLD-COMPILE] Playwright goto ไปหน้าหนัก (dashboard) บน dev Turbopack → ใส่ `{ timeout: 60000 }` (default 15s ไม่พอ cold-compile).**

---

## What went right (anchor ที่ควรทำซ้ำ)

- **agent-team-phase workflow จับ bug ได้จริง 2 ตัวก่อน prod:** reviewer จับ P1 (activatedAt), QA จับ P2 (500→400) — ทั้งคู่ escape ถ้า single-threaded build.
- **planner verify source จริงก่อน implement เจอ 3 TD corrections** (cron CSRF exclude, retry-around-tx Postgres-abort, renewal claim+revert idempotent) — bug ที่ถ้า dev ทำตาม SRS pseudocode ตรง ๆ จะพังตอน runtime. คุ้มค่ามากที่ SDS แก้ก่อน.
- **Documentation-First 7/7 ก่อนแตะโค้ด** — scope frozen ผ่าน user review ทุก decision → implementation ไม่มี rework จาก scope drift (Gate 1 PASS 0 CREEP).
- **contract frozen ใน prompt ทุก parallel developer** (ชื่อ model/field/signature) → 3-4 developer ขนานไม่ drift.
- **highest-risk task (S-5 order.service) serialize + reviewer 8-gate + regression QA** — zero regression บน core order flow.
- **QA เขียน/รัน Playwright E2E จริง + seed idempotent** (ไม่ใช่แค่ curl) — จับ error-contract bug ที่ type-check/review ไม่เห็น.

---

## Action items

1. ✅ P1 activatedAt — แก้แล้ว (code+SDS+SRS+Tests sync, commit `2426b40`)
2. ✅ P2 OutOfStockError→400 — แก้แล้ว (commit `5fc3f89`) + re-QA 9/9
3. ✅ P3 renumber 00003 — แก้แล้ว (commit `039c7a3`)
4. ⬜ **CRON_SECRET** ตั้งใน Vercel prod env ก่อน merge→main+deploy (ไม่งั้น S-7/S-8 cron ไม่ทำงานจริงบน prod)
5. ⬜ push branch + (เมื่อพร้อม) merge→main
6. ⬜ QA carries รอบหน้า: reactivate-402 e2e, cron integration test, AdvanceWarningBanner coverage, mobile-viewport (docs/qa/inventory-addon-qa-checklist.md)
7. ⬜ promote convention #1-#6 → memory/CLAUDE.md (ทำใน commit retro นี้)

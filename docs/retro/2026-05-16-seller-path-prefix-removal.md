# Retro — เอา `/seller` prefix ออกจาก path บน seller subdomain

**วันที่:** 2026-05-16
**Phase:** seller-path-prefix-removal (Option A)
**Commits:** `068bcc5` (SP-1 strip hardcode 38 ไฟล์), `accf9af` (SP-2 proxy backward-compat 301)
**Workflow:** agent-team-phase — 2 tasks, ครบ 5 gates ทั้งคู่ (Planner→Developer→Reviewer→QA→Controller)

---

## Problems

### P1 — grep inventory pattern พลาด nav path 2 จุด

Developer SP-1 ใช้ inventory grep ที่ Planner/Controller ให้มา:
`-E "(router\.(push|replace)|redirect\(|href=)[\"'\`][^\"'\`]*/seller/"`

pattern นี้พลาด 2 จุด:
1. `src/app/(paces)/seller/(dashboard)/verification/page.tsx:73` — `retryHref="/seller/verification"` — attribute ชื่อ `retryHref=` ไม่ใช่ `href=` (Reviewer จับได้)
2. `src/layouts/components/Sidenav/components/UserProfileSettings.tsx:37` — `href="/seller"` — **bare `/seller` ไม่มี trailing slash** ทำให้ pattern `/seller/` (มี `/` ปิดท้าย) ไม่ match (Controller จับเพิ่มตอน re-verify ด้วย broader grep)

evidence: Reviewer SP-1 verdict REWORK; Controller broad grep `[\"'\`]/seller([/\"'\`]|s?\b)` เจอจุดที่ 2 หลัง fix จุดแรก

### P2 — transient incremental tsc error จาก parallel uncommitted stream

ระหว่าง verify SP-2 รัน `npx tsc --noEmit` ครั้งแรกเจอ
`src/app/api/admin/badges/upload/route.ts(6,10): error TS2305: ... no exported member 'BadgeImageUploadSchema'`
ทั้งที่ `BadgeImageUploadSchema` export อยู่จริงใน `validations.ts:243`. fresh-run ครั้งถัดมา = clean (0 บรรทัด)

evidence: `git status` แสดง `validations.ts` M + `admin/badges/upload/` ?? = parallel stream ที่ไม่ใช่งาน phase นี้ (ตรง memory `project_deferred_backlog`)

---

## Root causes

**P1:** inventory pattern ออกแบบจากสมมติฐานว่า nav path มาในรูป `href=` หรือ `router.push/redirect` เท่านั้น — ไม่ครอบ (ก) custom prop ที่ส่ง path ต่อให้ `<Link href>` ปลายทาง (`retryHref`, `cancelHref`, `*Href`) และ (ข) path prefix ที่ไม่มี segment ต่อท้าย (`/seller` เปล่า). การ refactor path แบบ "strip prefix" ต้องจับ **ทุก string literal ที่เป็น `/seller` prefix** ไม่ใช่แค่ call-site ที่รู้จัก

**P2:** tsc incremental cache ปนเปื้อนจาก working-tree ของ parallel stream (ไฟล์ครึ่งทาง) — error สะท้อนสถานะ stale ไม่ใช่โค้ดของ phase นี้ การไม่แยกแยะจะ false-fail งานที่ถูกต้อง หรือ false-pass โดย bundle ไฟล์ parallel เข้า commit

---

## Conventions to adopt

1. **Path-refactor inventory ต้องใช้ 2-pass grep:** (a) call-site pattern (`router.push|replace|redirect\(|href=`) **และ** (b) catch-all string-literal pattern `[\"'\`]/<prefix>([/\"'\`]|\b)` ที่ครอบทั้ง prefix-มี-slash, prefix-เปล่า, และ custom `*Href`/`*Path` props. ยืนยัน "0 เหลือ" ด้วย pass (b) เสมอ ไม่ใช่ pass (a) อย่างเดียว
2. **type-check ปลาย gate ต้อง fresh-run เมื่อ working tree มี parallel uncommitted stream:** ถ้า `git status` แสดงไฟล์ M/?? ที่ไม่ใช่ของ task — รัน `npx tsc --noEmit` ซ้ำ fresh ก่อนตัดสิน; error ที่อยู่ในไฟล์ parallel (ไม่ใช่ diff ของ task) = pre-existing/unrelated ไม่ block task แต่ **ห้าม `git add -A`/`git add .`** — stage เฉพาะ path ของ task

## What went right (anchor — ทำซ้ำ)

- **Reviewer independent จับ miss ที่ developer grep พลาด** — การไม่ pre-bias reviewer ด้วย dev report ทำให้ gate 3 ทำงานจริง (จับ P1.1)
- **Controller re-verify ด้วย broader grep หลัง reviewer fix** — ไม่เชื่อ "fixed" ลอย ๆ ทำให้เจอ P1.2 ก่อนถึง QA
- **stage แบบ explicit path (`git add src/proxy.ts`) ไม่ใช่ `-A`** — กัน parallel stream (validations.ts/badges/wallet) ปนเข้า commit ของ phase สำเร็จ
- **Decompose ตามธรรมชาติของงาน ไม่ใช่ตามจำนวน task ใน plan** — Planner เสนอ 11 micro-task แต่งานเป็น mechanical strip uniform; Controller รวบเป็น 2 cohesive task (strip-all + proxy) ลด inconsistency risk โดยยังคง 5 gates ครบ
- **SP-1 testable แยกจาก SP-2** — ระบุชัดว่า proxy rewrite เดิมทำให้ SP-1 ให้ผล address-bar สะอาดได้โดยไม่ต้องรอ SP-2 → QA ได้เป็น checkpoint จริง

## Action items

1. ✅ เขียน retro นี้
2. Promote convention #1 (2-pass grep inventory) → `docs/conventions/agent-team-workflow.md` ส่วน path-refactor + memory `feedback_path_refactor_inventory.md`
3. Promote convention #2 (fresh tsc + explicit stage เมื่อมี parallel stream) → memory `feedback_verify_dont_assume.md` (ต่อยอด rule เดิม) — ไม่ต้องขึ้น CLAUDE.md (process detail ไม่ใช่ hard rule ทุก session)
4. cleanup: test order `a2312c3f-55f9-4463-91d4-8b5a4d0b54c8` ("ทดสอบ SP-2") ค้างใน DB จาก QA — ลบ manual หรือปล่อย next seed sweep (ไม่ block)

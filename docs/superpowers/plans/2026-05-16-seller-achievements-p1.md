# Seller Achievements P1 — Implementation Plan (full phase)

> **For agentic workers:** phase นี้ ≥3 tasks + แตะ schema/UI/security → ใช้ project
> workflow `agent-team-phase` (Planner→Developer→Reviewer→QA→Controller, gates)
> orchestrate ด้วย safepay-* subagents (= subagent-driven ตามที่ user เลือก).

**Goal:** เพิ่ม 7 seller achievement badge (ไม่มี reward) + รูป badge เป็น asset จริง
(bundled default + admin upload override) แสดงทุก surface

**Architecture:** ดู spec `docs/superpowers/specs/2026-05-16-seller-achievements-p1-design.md`
— badge engine data-driven เดิม (reuse criteria type) + field `Badge.imageUrl String?`
+ helper render precedence (imageUrl → emoji/lucide fallback) + admin-gated upload
ผ่าน storage lib เดิม

**Tech Stack:** Prisma 6/Postgres, Next.js 16 App Router, Vuexy(MUI)+Paces(Tailwind),
storage lib (`local`/`s3`), Valibot, Vitest, Chrome DevTools MCP

---

## Task Breakdown (เรียงตาม dependency — gate ต่อ task)

### Task 1 — DB migration `Badge.imageUrl` (agent: `safepay-database`)
- เพิ่ม `imageUrl String?` ใน model `Badge` (`prisma/schema.prisma:81-92`)
- migration additive nullable (ไม่มี default destructive, ไม่ rename/drop)
- `npx prisma migrate dev` + `prisma generate`; ยืนยัน badge เดิม 11 ครบ
- gate: safepay-database review (no data loss) → commit (1)

### Task 2 — Clone assets + seed (agent: `safepay-developer`)
- สร้าง `public/images/badges/seller/` clone 7 SVG จาก
  `/Users/craftman/Documents/Claude/Projects/Deep Achivements/ach_p1_*.svg`
  rename เป็น kebab-case ตาม spec §3 (mapping table)
- `prisma/seed.ts`: refactor `const badges` → `export const defaultBadges`
  (+`export type BadgeSeed`) ย้ายเหนือ `main()`, loop ใช้ `defaultBadges`;
  เพิ่ม 7 entry P1 (criteria + icon emoji + `imageUrl:"/images/badges/seller/<file>.svg"`)
  — **ยึดค่า 11 entry เดิมในไฟล์จริง ห้ามแก้**
- `npm run seed:local` → `Seeded 18 badges`
- gate: safepay-reviewer → commit (1, no `Base:` — data/asset ไม่ใช่ UI theme)

### Task 3 — Render helper + wire ทุก surface (agent: `safepay-developer`, skill `ui-theme-sourcing`)
- helper กลาง: input `{imageUrl, icon, nameEN}` → ถ้า `imageUrl` มีค่า render
  `<img src loading=lazy>` (min 96px); ไม่มี → fallback เดิม (buyer/public=emoji
  `icon`; seller/admin=`LUCIDE_FOR_BADGE`+`FALLBACK_LUCIDE`). `<img>` ล้วน
  ไม่ผูก MUI/Preline
- เพิ่ม 7 key ใน `LUCIDE_FOR_BADGE` (`_constants/badge-icons.ts`) เป็น fallback
  เผื่อ imageUrl หลุด: sprout/trending-up/thumbs-up/eye/sparkles/calendar-check/rocket
- wire 4 surface (spec §4.3): buyer `(buyer-app)/badges/page.tsx`, seller
  `seller/(dashboard)/badges/page.tsx` + `dashboard/components/AchievementLevel.tsx`,
  public `u/[username]`, admin badges table
- commit ที่แตะ UI ต้องมี `Base:` line ชี้ theme file ที่ copy
- gate: ui-theme-sourcing + safepay-reviewer → commit (อาจหลาย commit/surface)

### Task 4 — Admin upload (agent: `safepay-developer` → `safepay-security`)
- API route **ใหม่ admin-gated** (อย่า reuse `/api/upload` ที่เปิดทุก user):
  ตรวจ session + admin (ตามแบบ admin route เดิมในโปรเจกต์) → validate ไฟล์
  (Valibot: mime ∈ {png,webp,jpeg}, ≤256KB, **reject SVG**) → `saveFile()` →
  service set `badge.imageUrl="/api/files/<fileId>"`
- `BadgeFormDialog.tsx` (admin Paces): field อัปโหลด + preview — ผ่าน
  `ui-theme-sourcing` (copy จาก theme/paces), `Base:` line
- gate: **safepay-security mandatory** (auth bypass, file-type allowlist,
  size, path traversal, SVG XSS, env leak) ก่อน commit

### Task 5 — Tests (agent: `safepay-developer`)
- `tests/services/seed-badges.test.ts` (DB จริงผ่าน `../setup`):
  - `defaultBadges` มี 7 P1 criteria เป๊ะ + `audience SELLER` + `imageUrl`
    ขึ้นต้น `/images/badges/seller/` + `LUCIDE_FOR_BADGE` มีทุก nameEN + ไม่มี nameEN ซ้ำ
  - `evaluateBadges`: `ORDER_COUNT:10` award `Getting Started` ที่ 10 order,
    ไม่ award ที่ 9 (boundary)
- test render helper: imageUrl set → คืน img branch; null → fallback branch
- `npm test -- --run` เขียว + `npx tsc --noEmit` เขียว
- gate: safepay-reviewer → commit (1)

### Task 6 — QA 3-level (agent: `safepay-qa`, Chrome DevTools MCP)
- spec §7: 4 surface เห็นรูป asset; admin upload happy path (อัป PNG →
  ทุก surface เปลี่ยน); reject SVG/ไฟล์ใหญ่; non-admin ยิง API → 401/403
- user รัน dev server เอง (ห้าม start); probe port 3000/4000; `*.deepth.local`
- report PASS/FAIL + screenshot ต่อจุด

### Task 7 — ปิด phase (Controller)
- ติ๊ก DoD ใน spec §8, commit; retro ผ่าน `phase-retro`

---

## Self-Review Notes
- Spec coverage: §3→T2, §4.1→T1, §4.3→T3, §4.4→T4, §7→T5/T6, §8→T7 ครบ
- Out of scope (ยืนยัน): reward, criteria type ใหม่, locked/progress mockup,
  smooth vector, bundle รูป 10 badge เดิม
- ความเสี่ยงเผื่อไว้: 11 entry เดิมของจริง (T2 ยึดไฟล์), SVG XSS (T4 reject SVG
  upload), admin auth (T4 safepay-security mandatory), cross-theme helper (T3
  `<img>` ล้วน)
- Type consistency: `defaultBadges`/`BadgeSeed` (T2) ใช้ใน T5 import;
  `Badge.imageUrl` (T1) ใช้ทุก task ถัดไป; `LUCIDE_FOR_BADGE` ตรง export จริง

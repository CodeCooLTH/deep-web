# Retro — Command Center V6 Rebuild (2026-06-10)

> branch `feat/seller-mobile-responsive` | phase command-center-v6-rebuild | 11 commit (Gate 0 + T1–T10 + sign-off)
> ผล: SIGNED-OFF, QA 20/20, tsc 0. seller mobile dashboard rebuild ตาม mockup v6 (dense/modern/on-theme + bottom nav)

---

## Problems

### P1 — V4 ที่ "approved แล้ว" ถูก user ปฏิเสธทันทีที่เห็นบนมือถือจริง
V4 visual polish (commit `b6e412b`, 2026-06-07) ผ่าน "approve visual" + QA 7/7 แต่ user ดูบนมือถือจริงแล้วบอก **"ดูเก่า ไม่เข้า theme spacing เปลือง"**. หลักฐาน: `docs/mockups/home/command-center-v4.html` ใช้ `--blue:#2563eb` + `--bg:#eef1f6` + `border-radius:20px` — **ไม่ใช่ token ของ Deep DESIGN.md เลย** (system = violet `#7367F0`, mist `#F8F7FA`, radius 8–10px). pastel icon-circle grid ยังเป็น "เทมเพลต AI-SaaS" ที่ PRODUCT.md ระบุเป็น anti-reference ตรง ๆ.

### P2 — เริ่ม session บน branch `main` ผิด
งาน command center ทั้งหมดอยู่ `feat/seller-mobile-responsive` แต่ user สั่ง "switch ไป main" แล้วต่อด้วยงาน CC. ถ้า build บน main จะทับฐานที่ไม่มี mobile shell. จับได้ตอน `git branch` + ตรวจว่า spec/component อยู่ branch ไหน → switch กลับก่อนเริ่ม.

### P3 — safepay-qa รัน `prisma db pull` ทำ `schema.prisma` เสีย (รุนแรงสุด)
ระหว่าง QA setup, safepay-qa รัน `prisma db pull` + `prisma generate` → introspect ทับ `schema.prisma` ทั้งไฟล์: ลบ `@default(uuid())` ทุก `@id`, rename relation ทั้งหมด (`user`→`User`), และดึง model ของ branch อื่นจาก **shared prod/dev DB** (`Category`/`Report`/`User.isBlocked`). regenerated client ทำให้ `qa-seed-order-detail.ts` tsc พัง (ดูเหมือน pre-existing). จับได้ตอน Controller `git status` (เห็น `M prisma/schema.prisma` ที่ไม่ได้ตั้งใจ) → `git checkout` + `prisma generate` คืน tsc 0, **ไม่หลุดเข้า commit**.

### P4 — bottom nav เป็น gap ที่ค้างมาตั้งแต่ V3
DESIGN.md ระบุว่า seller mobile ต้องมี "bottom nav" แต่ shell ที่ build จริง (V3/V4) แค่ซ่อน sidebar + FAB ลอย — ไม่เคยมี bottom nav. user ต้องชี้เองว่า "mobile ปกติมี menu bottom".

### P5 — touch target bottom nav tab = 41.75px (<44px)
grid `items-center` จัด child ที่ content-height ทำให้ tab link สูงแค่ 41.75px. จับโดย QA → แก้ด้วย `h-full justify-center` ให้เต็ม grid cell 64px (วัดซ้ำ = 63px).

---

## Root causes

1. **P1:** mockup ถูกสร้าง/อนุมัติโดย**ไม่ cross-check token กับ DESIGN.md** — "approved visual" ≠ "on-theme". V4 author ใช้ token Paces/blue generic. ไม่มี gate ที่เทียบสี/radius ของ mockup กับ DESIGN.md ตอน approve. + V4 ถูกออกแบบบนสมมติฐาน "polish โครงเดิม" จึง inherit token ที่เพี้ยนมาตั้งแต่ V1–V3.
2. **P2:** ทำตามคำสั่ง "switch main" ตรงตัว แล้วต่องาน feature โดยไม่ตรวจ branch ownership ของ task ก่อน — task ที่มี artifact (spec/component) อยู่ branch อื่นต้องกลับไป branch นั้น.
3. **P3:** QA agent เอื้อมไปใช้ `prisma db pull` เพื่อ "เข้าใจ schema" แทนที่จะ Read; ขยายความเสียหายเพราะ prod = dev Supabase ตัวเดียวกัน (db pull ดึง schema งาน branch อื่นเข้ามาปน).
4. **P4:** spec รุ่นแรก ๆ (V3) ไม่ได้ cross-check ส่วน Navigation ของ DESIGN.md ที่พูดถึง bottom nav → gap ฝังมาเงียบ ๆ.
5. **P5:** CSS grid `items-center` จัด flex child ที่ content height; child ต้องมี `h-full` explicit เพื่อเต็ม track เป็น touch target.

---

## Conventions to adopt

1. **Mockup ต้อง cross-check token กับ DESIGN.md ก่อน mark "approved".** ก่อนอนุมัติ mockup ใด ๆ: grep สี/radius/shadow ใน mockup เทียบ DESIGN.md. mockup ที่ใช้ token นอกระบบ (เช่น blue `#2563eb` ทั้งที่ระบบ violet `#7367F0`, radius 20px ทั้งที่ระบบ 8–14px) = off-theme แม้ "ดูโอเค". "approved visual" บน mockup ที่ token เพี้ยน = หนี้ที่จะถูกปฏิเสธตอนเห็นบนของจริง.
2. **QA/seed agent ห้าม `prisma db pull/push/migrate`** — อ่าน schema ด้วย Read, seed ด้วย Prisma Client. Controller ต้อง `git status --short prisma/` หลัง QA ทุกครั้ง. (memory `feedback_qa_agent_no_prisma_pull`)
3. **task ที่มี artifact อยู่ branch อื่น → ตรวจ branch ownership ก่อนเริ่ม** แม้ user เพิ่งสั่ง switch branch อื่น.
4. **bottom nav grid tab ต้อง `h-full`** (ไม่ใช่ content height) เพื่อ touch ≥44px เมื่อ container ใช้ `items-center`.

---

## What went right (anchor — ทำซ้ำ)

1. **`git status` หลัง QA จับ schema corruption ได้ก่อน commit** — verify-don't-assume ครอบ artifact ที่ agent ไม่ได้ตั้งใจแก้ ([[feedback_verify_agent_edits]]).
2. **ตรวจ branch ownership ก่อน dispatch** — กัน build ทับฐานผิด.
3. **agent-team workflow ทำงาน:** reviewer จับ token V4 ตกค้าง + icon prefix; QA จับ touch-target 41.75px; product sign-off เทียบ S-id ครบ. ไม่มี gate ไหน rubber-stamp.
4. **โหลด reference จริง (`voltagent/awesome-design-md` → Wise/Linear/Stripe DESIGN.md) ยืนยันทิศทาง** restraint/density/accent-เดียว ก่อน build — ลด guesswork.
5. **impeccable + DESIGN.md grounding** ทำให้ redesign coherent + on-brand ในรอบเดียว (v5 → +bottom nav = v6 approved).
6. **lock contract สี tile (T2↔T5) ก่อน parallel** — Batch B ไม่ชนกัน.

---

## Action items

1. ✅ เขียน memory `feedback_qa_agent_no_prisma_pull` + เพิ่มใน MEMORY.md (done this phase).
2. ✅ เขียน memory `feedback_mockup_token_crosscheck` (mockup approval cross-check DESIGN.md) — ดู promote ด้านล่าง.
3. ✅ update memory `project_seller_mobile_command_center` — V4 rejected → v6 approved + built (done).
4. (future) seller mobile pages อื่น ๆ ตอนนี้มี bottom nav ขึ้นทุกหน้าแล้ว (ผ่าน layout `bottomNavSlot`) — งาน responsive page อื่นเผื่อ padding-bottom (มี CSS global แล้ว).
5. (consider) เพิ่ม "QA ห้าม prisma db pull" ลง contract ของ safepay-qa agent + "mockup token cross-check" ลง reviewer gate ของ ui-theme-sourcing.

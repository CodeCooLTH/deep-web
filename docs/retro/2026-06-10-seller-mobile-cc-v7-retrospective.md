# Retro — Seller Mobile Command Center v7 Redesign (2026-06-10)

> phase: redesign UI seller mobile command center (หน้า `/dashboard`, `lg:hidden`) ตาม Design Spec v7
> branch: `feat/seller-mobile-responsive` · 7 commits (`b1e05ee` Gate 0 → `8d28362` sign-off)
> workflow: agent-team-phase เต็ม (product baseline → planner → 5 developer 2 batch → reviewer ×2 → qa → product sign-off)
> verdict: ✅ SIGNED-OFF — S-1..S-10 ผ่านครบ, QA mobile 360px PASS, console clean

---

## Problems

### P1 — Design Spec กำหนด wrapper padding (`px-4 pb-28`) ที่ขัดกับ shell CSS ที่ครอบอยู่แล้ว
- safepay-ux spec v7 §4 Section D + scope baseline S-10 acceptance สั่ง `<div className="lg:hidden relative px-4 pb-28">`
- ความจริง: `.seller-mobile-shell .page-content main` ใน `src/assets/css/safepay-overrides.css` L98/L101 มี `padding-inline:1rem !important` + `padding-bottom:calc(5rem + safe-area) !important` ครอบอยู่แล้ว
- ใส่ `px-4` ซ้ำ → ขอบแนวนอนเป็น 32px (เยื้องเกิน); `pb-28` ซ้ำ → ล่างห่าง ~192px (เว่อร์)
- evidence: U-E developer flag จาก comment เดิมใน `RecentActivityFeed.tsx:76` + `CommandCenter.tsx:11` ("pb-28 ลบออก — padding-bottom ครอบโดย global CSS แล้ว" — เคยถูกลบใน v6.1 มาแล้ว แต่ spec v7 re-add กลับมา)
- แก้: Controller grep css ยืนยัน → revert padding (เก็บแค่ section reorder) → อัปเดต baseline S-10 + Change Log

### P2 — product agent (Gate 0) Glob ผิด path → สรุปว่า `command-center.ts` ไม่มีอยู่
- product baseline assumption A-2 เขียนว่า "ไฟล์ยังไม่มี — developer ต้องสร้างใหม่"
- ความจริง: ไฟล์อยู่ที่ `dashboard/_constants/command-center.ts` (Glob ของ agent หา `(dashboard)/_constants/` ผิดชั้น)
- ผลกระทบ: ถ้าเชื่อตาม agent → developer อาจสร้างไฟล์ซ้ำ/ทับ type เดิม
- แก้: Controller อ่านไฟล์จริงยืนยันก่อนเขียน baseline → แก้ A-2/A-7 เป็น "edit ไฟล์ที่มีอยู่"

### P3 — git `index.lock` race ตอน commit หลาย unit ติดกัน (2 รอบ)
- commit U-D/U-E ใน Bash call เดียว (หลายคำสั่งคั่นด้วย newline ไม่มี `&&`) → คำสั่งที่ 2 ชน lock ของคำสั่งแรกที่ยังไม่ปล่อย
- ผล: U-D commit หลุด (เหลือ uncommitted), เกิด state สับสนชั่วคราว
- แก้: `rm -f .git/index.lock` + commit ใหม่ทีละ unit

### P4 — Controller แก้ JSX พลาด: วาง `{/* comment */}` ก่อน root `<div>` ใน `return ( ... )`
- ตอน revert padding ผม (Controller) ใส่ JSX comment เป็น sibling ก่อน root element ใน return → 2 expression → `TS1005 ')' expected` (10 errors)
- จับได้ด้วย fresh `tsc --noEmit` ทันทีหลัง edit (ไม่เชื่อ "แก้ 1 บรรทัดไม่พัง")
- แก้: ย้าย comment เป็น `//` นอก JSX เหนือ `return`

---

## Root Causes

- **P1:** spec/mockup เขียนจาก visual intent ("ให้ section มี side padding สม่ำเสมอ") โดยไม่ได้ inspect ว่า layout shell ให้ padding มาแล้ว — design layer ไม่เห็น CSS global layer. นี่คือ pattern เดียวกับ mockup-token-crosscheck (mockup เพี้ยนจาก DESIGN.md) แต่ย้ายมาที่ **layout/spacing แทนสี**
- **P2:** subagent มี tool budget จำกัด + Glob query เดียวพลาด = สรุปผิด. agent "ไม่เจอ" ≠ "ไม่มี"
- **P3:** หลาย git mutation ใน shell script เดียวไม่มี barrier — git ปล่อย lock แบบ async เล็กน้อย
- **P4:** JSX syntax — root ของ `return (...)` ต้องเป็น element/fragment เดียว; `{/* */}` เป็น expression แยก

---

## Conventions to Adopt

1. **Spec/mockup ที่กำหนด wrapper padding/margin/bottom-spacing → ต้อง grep shell/global CSS ที่ครอบ component นั้นก่อน implement** (เช่น `safepay-overrides.css` `.seller-mobile-shell main`). ถ้า shell ให้ `padding-inline`/`padding-bottom` แล้ว → ห้ามใส่ซ้ำที่ wrapper. ขยายจาก mockup-token-crosscheck (สี/radius) ไปยัง **spacing/padding layer**
2. **Controller อ่านไฟล์จริงยืนยันก่อนเชื่อ subagent ที่รายงานว่า "ไฟล์ไม่มี/ไม่เจอ"** — โดยเฉพาะเมื่อจะตัดสิน create-vs-edit. ขยาย verify-agent-edits ไปทางกลับ (verify agent's *absence* claims ด้วย)
3. **commit หลาย unit = แยก Bash call ต่อ commit** (หรือคั่นด้วย `&&` + `sleep` สั้น) — กัน index.lock race
4. **JSX: comment เหนือ root element ใน `return (...)` ใช้ `//` นอก JSX** — `{/* */}` ใส่ได้เฉพาะ *ภายใน* element

---

## What Went Right (anchor — ทำซ้ำ)

- **U-E developer flag padding แทนที่จะทำตาม spec ดื้อ ๆ** → Controller จับ P1 ได้ก่อน ship. developer prompt ที่บอก "ถ้าเจอ padding ซ้อนให้รายงาน อย่าแก้ section ลูก" ทำงาน
- **fresh-tsc หลังทุก edit (รวม edit ของ Controller เอง)** → จับ P4 ทันที
- **Controller อ่าน command-center.ts จริงก่อนเขียน baseline** → แก้ P2 ก่อนลาม
- **5-way color literal class (NF-5)** developer ทำถูกตั้งแต่แรก — เคารพ comment เตือน Tailwind v4 purge ที่มีในไฟล์เดิม
- **token discipline** — ทุก developer grep DESIGN.md ยืนยันสีก่อนเสร็จ; `#F2F1F6` ถูก flag ว่าเป็น Paces neutral surface (ไม่ใช่สีใหม่) — ไม่ลาก CC V4 reject ซ้ำ
- **scope baseline กัน creep ได้จริง** — S-10 padding correction ถูกบันทึก Change Log แทนที่จะเงียบ ๆ เปลี่ยน

---

## Action Items

1. ✅ เพิ่ม convention #1 (padding vs shell CSS crosscheck) → memory `feedback_mockup_token_crosscheck` (ขยาย scope จากสีไป spacing) + 1 บรรทัด MEMORY.md
2. ✅ retro นี้ commit แยกปลาย phase
3. ⏳ carried-debt: S-6 empty-state E2E — verify เมื่อ seed account ที่ไม่มี activity ได้ (Phase 2 QA)
4. (พิจารณา) เพิ่ม note ใน `safepay-ux` agent / ui-guideline: spec ที่แตะ wrapper spacing ต้องอ้าง shell CSS ที่ครอบ

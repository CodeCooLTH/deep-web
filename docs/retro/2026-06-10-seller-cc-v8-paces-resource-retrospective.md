# Retro — Seller Command Center v8 (Paces Re-source) 2026-06-10

> phase: rebuild seller mobile command center (`/dashboard`) + route ใหม่ `/notifications` จาก Paces primitive จริง
> branch: `feat/seller-mobile-responsive` · ~20 commits (`ce577ba` spec → baseline SIGNED-OFF)
> workflow: agent-team-phase เต็ม (product baseline S-1..S-12 → planner 12 task → 1 dev contract-freeze → 2 batch parallel dev → reviewer 8-gate → QA Chrome DevTools 360px → product sign-off)
> verdict: ✅ SIGNED-OFF — S-1..S-12 ผ่าน, QA mobile PASS (Paces blue, ม่วง 0, console clean)

---

## Problems

### P1 — v6/v7 "cite Base: theme แต่ implement arbitrary" = theme-copy violation ในเชิงจิตวิญญาณ
- v6/v7 มี `Base: theme/paces/...` ใน comment **แต่** เขียน UI ด้วย **arbitrary Tailwind ล้วน** (`text-[13px]`, `text-[14.5px]`, `rounded-[14px]`, `bg-[rgba(115,103,240,0.12)]`, `shadow-[0_2px_8px...]`, hardcode `#7367F0`) + mockup-driven sizing → ผลคือหน้าตา **ไม่เหมือน Paces demo** และฝัง bug สีม่วง
- evidence: user ทักตรง ๆ "ทำไม seller สีม่วง มันต้องเป็น paces / paces มันไม่ม่วง" → ต่อด้วย "เหมือนนี่มันยัง mockup html เปล่า ๆ หรือเปล่า"
- Hard Rule 1/3 (theme-copy + Base: line) **ผ่านตามตัวอักษร** (มี Base: comment) แต่ **ละเมิดเจตนา** — "copy แล้วปรับ content" กลายเป็น "แต่งเองจนแทบไม่เหลือ Paces"

### P2 — ม่วง Vuexy `#7367F0` รั่วเข้าหลังบ้าน (จาก P1)
- hardcode `#7367F0`/`rgba(115,103,240,*)` 22 จุดใน command center v6/v7 ทั้งที่ Paces primary = น้ำเงิน `#236dc9`
- แก้รอบแรก (commit `2ab35da`) แทนด้วย `bg-primary`/`text-primary` token — แต่โครงยังเป็น arbitrary (P1) → ต้อง v8 rebuild

### P3 — standalone HTML mockup = "เดา Paces" ไม่ใช่ Paces จริง
- ทำ mockup HTML หลายรอบด้วยค่า approximate (`--primary:#236dc9`, `.card` ปลอม) — user สังเกตว่ามันไม่ใช่ theme จริง
- root: Paces = Tailwind v4 + Preline ที่ **purge class ตอน build** → standalone HTML ที่ link compiled CSS ก็ได้แค่ class ที่ถูก purge ไว้ ไม่ครบ

### P4 — git index.lock race (recurring จาก v7)
- commit หลาย unit ติดกันใน Bash call เดียว → "fatal: unable to write new_index file" → SellerHeader (S-1) bundled เข้า commit ShortcutGrid (`f442531`) แทนที่จะแยก → reviewer Gate 6 flag S-1 ไม่ traceable

### P5 — header ซ้อน 2 อันตอน rebuild header
- SellerHeader (น้ำเงิน) render ใน CommandCenter (page content) แต่ layout ยัง render SellerMobileHeader→IdentityBar (mist เก่า) บน /dashboard → header ซ้อน
- จับได้ตอน T8 integration (Controller review-on-integrate) ก่อน QA

---

## Root Causes

- **P1:** "Base: comment" เป็น gate ที่ check **การมีอยู่ของ citation** ไม่ได้ check **ว่า output เหมือน source จริงไหม**. dev/mockup สร้างจาก visual intent + arbitrary value แทนที่จะ copy markup + class ของ Paces component. ไม่มีกฎห้าม arbitrary value ชัด ๆ → ช่องโหว่
- **P2:** สืบจาก P1 — เมื่อแต่งเอง ก็หยิบสีม่วง Vuexy (ที่จำได้จาก buyer) มาใส่
- **P3:** ธรรมชาติของ Tailwind purge — utility ที่ไม่ถูกใช้ในโค้ดจริงจะไม่อยู่ใน bundle; mockup นอกแอปจึง render ไม่ตรง
- **P4:** หลาย git mutation ใน shell script เดียว, git ปล่อย lock async; disk/fs hiccup ทำ index write fail
- **P5:** layout-level header (topbarSlot) กับ page-level header เป็นคนละชั้น; rebuild ที่ page ต้อง suppress layout ของ route นั้นด้วย ไม่งั้นซ้อน

---

## Conventions to Adopt

1. **🛑 Hard Rule 7 (ใหม่ — promote เข้า CLAUDE.md): หน้า `(paces)/**` ต้องประกอบจาก Paces primitive — ห้าม arbitrary Tailwind value.** ใช้ `.card`/`.card-header`/`.card-title`/`.card-body`/`btn btn-primary btn-sm`/`badge bg-*/15 text-*`/`text-default-400/500/700/900`/`bg-primary bg-primary/15`/`text-success/danger/warning/info`/`size-7.5 size-9 size-11 size-12`/`rounded-lg rounded-full`/`after:border-dashed`/grid-flex util. **ห้าม** `text-[NNpx]`/`bg-[rgba()]`/`shadow-[...]`/`rounded-[Npx]`/`w-[Npx]`/hardcode hex — **เว้นจำเป็นจริง (เช่น raised-FAB ที่ Paces ไม่มี token, safe-area) เขียน comment กำกับเหตุผล**. reviewer ต้อง grep arbitrary ที่ไม่มี comment เป็น gate.
2. **reference-vs-theme ขยายไป competitor app:** user ส่ง screenshot แอปอื่น (Shopee ฯลฯ) = เอา **IA/layout/structure ตาม ref** แต่ **skin (สี/component/token) = theme ปัจจุบัน** (Paces น้ำเงิน ไม่ใช่ Shopee ส้ม). ขยาย [[feedback_reference_adapt_not_copy]].
3. **Real-theme fidelity ต้อง build ในแอป:** จะดู Paces (หรือ theme ที่ purge) จริง → build ในแอป + view dev server. standalone HTML mockup = approximate เท่านั้น, ใช้ lock layout/IA ได้ แต่อย่าตัดสิน "ตรง theme ไหม" จากมัน.
4. **commit หลาย unit = แยก Bash call ต่อ commit** (recurring — เน้นซ้ำจาก v7) กัน index.lock race + boundary เพี้ยน.
5. **rebuild page header ใน page content → suppress layout header ของ route นั้น** (เช่น SellerMobileHeader คืน null บน /dashboard) กัน header ซ้อน.

---

## What Went Right (anchor)

- **agent-team contract-freeze ก่อน parallel** (T1/T2: type expand + page data) → 5 component แตกขนาน 2 batch โดยไม่ชน type — lock-contract-before-parallel ทำงาน
- **re-source จาก Paces component จริง** (StatisticCard/UserCard/RecentActivity/CRM-Activities) → output เป็น Paces แท้, QA ยืนยัน "วางข้าง demo เป็นตระกูลเดียวกัน"
- **brainstorming + mockup iteration** ก่อน build → lock IA (Shopee-style), header น้ำเงิน, noti timeline, lazy-load ก่อนแตะโค้ดจริง — ลด rework ใหญ่
- **/impeccable audit ก่อน build** → จับ a11y (default-400 contrast) fold เข้า spec ตั้งแต่ต้น
- **Controller review-on-integrate จับ P5 header ซ้อน** ก่อน QA
- **QA Chrome DevTools จริง** (authenticated, mobile 360px, interactive tab/lazy-load) → ยืนยัน behavior ไม่ใช่แค่ render
- **token discipline:** grep `#7367F0` ทุก task = 0; arbitrary มี comment กำกับครบ

---

## Action Items

1. ✅ promote **Hard Rule 7** เข้า CLAUDE.md ตาราง HARD RULES + memory `feedback_paces_no_arbitrary_value`
2. ✅ retro นี้ commit แยกปลาย phase
3. ⏳ Phase 2 carried-debt: (a) /notifications sub-page title — เพิ่ม map ใน getSellerPageTitle/_seller-menu; (b) activity feed slice 3-5 (หรือคง 8 ถ้า user ok); (c) real notification data (Notification model + unread persistence + bell count + lazy-load cursor)
4. ⏳ พิจารณา promote Hard Rule 7 เป็น project skill (`paces-no-arbitrary`) ที่ trigger ตอนแก้หน้า (paces) — auto grep arbitrary
5. ⏳ push branch `feat/seller-mobile-responsive` (มี commit ค้างเยอะตั้งแต่ v6/v7/color-fix/v8) + เลือก merge→main เมื่อไร

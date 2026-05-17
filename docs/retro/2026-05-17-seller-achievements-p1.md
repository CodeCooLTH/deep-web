# Retro: Seller Achievements P1 (Badges + รูป asset + Modal)

วันที่: 2026-05-17
Phase: T1–T8d + fixes (commits `9f2e027` … `393071a`)
Scope จริง (บานจาก spec เดิม): 7 badge ใหม่ + `Badge.imageUrl` + bundled pixel asset
+ admin upload + render ทุก surface + Earned/Locked grid (mockup) + rich detail modal
(rarity/pace honest data) + backfill

---

## Problems + Root causes + Evidence

### P1. "รูป badge ขึ้นเป็น icon ทั้งหมด" — ไล่ผิด 3 ชั้น เสียเวลามาก
- **ชั้น 1:** seed เข้า Docker (`.env`) แต่ dev server อ่าน Supabase (`.env.local`).
  **Root:** `next dev` โหลด `.env.local` ก่อน `.env`; `npm run seed:local` ใช้ `.env`
  → คนละ DB. ไม่ verify DB ที่ app ใช้จริงก่อนสรุปว่า "โค้ด render พัง".
- **ชั้น 2:** เพิ่ม `export const dynamic = 'force-dynamic'` (เดาว่า cache) → Paces
  `AppProvidersWrapper`/LayoutProvider แตก (`useLayoutContext` crash @ MenuToggler,
  `src/context/useLayoutContext.tsx:101`). commit `3095b02` ถอดออก.
  **Root:** วินิจฉัยจาก assumption ไม่ใช่หลักฐาน; force-dynamic บน Paces child page
  เป็น anti-pattern ที่รู้อยู่แล้ว (ไม่มี seller page อื่นใช้).
- **ชั้น 3 (ตัวจริง):** `proxy.ts:56` บน seller subdomain rewrite ทุก path → `/seller${path}`;
  matcher (`proxy.ts:85`) ยกเว้นแค่ `images|icons|_next` → `public/badges/seller/*.svg`
  ถูก 404. commit `1bb9f7d` ย้าย → `public/images/badges/` (ใต้ dir ที่ยกเว้น).
  **Root:** วาง static asset ใต้ path ที่ชนกับ route + ไม่อยู่ใน proxy matcher exclusion;
  ไม่ได้ curl-verify static path บน dev server ตั้งแต่แรก.

### P2. "ปี 2026 / 100 Orders ไม่มีรูป" — bundled imageUrl ไม่ครบ
- seed ใส่ imageUrl แค่ 7 P1; `2026_BADGE`/`Century Club` มี asset ตรงใน ref set
  แต่ไม่ถูก map. commit `1447543`.
  **Root:** spec ตั้ง scope "ไม่ bundle รูป badge เดิม" โดยไม่เช็คว่า ref set มี asset
  ตรง 1:1 (`ach_deep_2026`, `ach_orders_100`) — under-scoped.

### P3. "ร้านที่มีอยู่ไม่ได้ badge ที่ควรได้"
- `evaluateBadges` รันเฉพาะตอน trigger (order/review/verify/signup). user/shop ที่
  seed ก่อนเพิ่ม badge → ไม่เคยถูก evaluate. แก้ด้วย `scripts/backfill-badges.ts`.
  **Root:** trigger-based evaluation ไม่มี backfill path สำหรับ data ที่มีอยู่ก่อน.

### P4. Layout/visual thrash หลายรอบ (theme→mockup→ใหญ่ไป→lock circle→rich)
- Revert layout เข้า theme แรงไปจนทิ้งดีไซน์ mockup (P3-fix) → user reject →
  rework เป็น Earned/Locked grid (T8b) → card ใหญ่ไป → ลด → lock-circle เปล่า งง → ลบ
  → modal minimal "ง่อย" → rich (T8d).
  **Root:** (a) ตีความ "reference" ผิด 2 ทาง (copy ดิบ vs ทิ้ง asset) ก่อนตก Rule 6;
  (b) ไม่มี visual QA loop (Chrome MCP profile-lock เกือบทั้ง phase) → iterate แบบตาบอด
  พึ่ง user เป็น QA ทุกครั้ง.

### P5. git/branch churn — เกือบ commit ลง branch ผิด / ลาก WIP ปน
- working tree มี WIP ค้างก่อน session + parallel stream commit แทรกบน branch เดียวกัน
  (`docs/seller-orders-handoff`). `git add -A` หลาย pathspec เคย abort + เกือบลาก
  qa-*.png/parallel เข้า commit.
  **Root:** ทำงานบน branch ที่มี parallel stream; ใช้ `-A`/multi-pathspec แทน explicit paths.

### P6. phantom `useLayoutContext` crash หลัง churn หนัก (รอบที่ไม่มี force-dynamic)
- source ถูกโครงสร้างแต่ยัง crash; `npm run clean` (rm -rf .next) + restart → หาย.
  **Root:** `.next` build cache เพี้ยนหลัง HMR + structural change (RSC↔client island,
  ย้ายไฟล์, restart หลายรอบ) สะสม.

---

## What went right (anchor — ทำซ้ำ)
- **Verify ไม่เดา** (เมื่อทำจริง): curl static path / query 2 DB ตรง ๆ / git reflog
  → เจอ root cause ชั้น 3 ได้ (P1). บทเรียน: ทำตั้งแต่แรก ไม่ใช่หลังเดาผิด 2 รอบ.
- **RSC island pattern**: page.tsx คง RSC, แยก client (`BadgeGrid`/`BadgeDetailModal`)
  — ไม่ทำ provider crash ซ้ำ + ไม่เสีย RSC data layer. ใช้เป็น pattern มาตรฐาน.
- **Honest data over mockup fabrication**: rarity = count จริง (guard shopCount<20),
  pace = order 30 วันจริง, reward → ผลจริง (Trust Score 10%). ไม่กุเลขหลอก seller.
- **safepay-ux ก่อน developer** สำหรับ UI ไม่ trivial → spec มี Theme Source Mapping
  + data mapping ลด recompose; reviewer/security gate จับ blocker จริง (LEGENDARY ปลอม,
  duplicate id, force-dynamic) ก่อนถึง user.
- **Selective commit** หลังเจอ P5: stage explicit path ทุก commit → ไม่มี parallel ปน.

---

## Conventions to adopt (actionable)

1. **ก่อนสรุป "โค้ด render พัง" → query DB ที่ app ใช้จริงก่อน.** `next dev` =
   `.env.local` (Supabase) ไม่ใช่ `.env` (Docker). seed ให้ตรง: `seed:supabase`
   หรือ badge-only script + `dotenv -e .env.local`. → [[project_dev_db_and_paces_pitfalls]]
2. **ห้าม `export const dynamic = 'force-dynamic'` ใน Paces page** — LayoutProvider
   crash. getServerSession ทำ dynamic อยู่แล้ว. → memory เดิม
3. **Static asset ที่เสิร์ฟผ่าน subdomain ต้องอยู่ใต้ proxy-matcher exclusion**
   (`public/images/**`, `icons/**`) — path ที่ชนกับ route (`/badges`,`/orders`,...)
   หรือนอก exclusion จะถูก proxy rewrite → 404. **curl-verify static URL บน dev
   server ก่อนถือว่าเสร็จ** (ไม่ใช่แค่ไฟล์อยู่ใน public/).
4. **Reference = 2 ชั้น** (asset ใช้ตาม ref / layout เข้า theme; ไม่ชัด→ถาม).
   → CLAUDE Hard Rule 6 + `docs/conventions/reference-vs-theme-source.md` (promoted แล้ว)
5. **Trigger-based evaluation ต้องมี backfill path.** ฟีเจอร์ที่ award/คำนวณตอน event
   (badge, trust score, ...) เมื่อเพิ่ม rule ใหม่/มี data เก่า → รัน backfill script
   (idempotent) เข้า DB ที่ dev/prod ใช้. เก็บ `scripts/backfill-badges.ts` เป็น template.
6. **บน branch ที่มี parallel stream: commit ด้วย explicit path เท่านั้น** ห้าม
   `git add -A`/multi-pathspec กว้าง — กันลาก WIP/artifact ปน.
7. **phantom provider/boundary crash + source ถูก → `npm run clean` + restart ก่อน
   ขุดโค้ด.** churn หนัก (RSC↔client, ย้ายไฟล์, restart) ทำ `.next` เพี้ยน.
8. **Honest data**: ห้ามแสดงตัวเลข/สัญญาที่ระบบไม่มี data จริง (rarity/estimate/reward).
   คำนวณจริง + guard sample size, หรือซ่อน. → ส่วนหนึ่งของ Rule 6 spirit.

---

## Action items
1. ✅ promoted: Rule 6 + reference-vs-theme-source.md + memory reference/db-pitfalls
2. extend `project_dev_db_and_paces_pitfalls.md` memory: + proxy-static-path,
   + stale-.next-clean, + backfill-after-trigger
3. เพิ่มหมายเหตุใน `docs/conventions/` (หรือ ui-guideline) เรื่อง static asset ใต้
   proxy-exclusion + curl-verify
4. (debt, non-block) `getBadgeProgressById(userId,badgeId)` ลด N+1 ใน estimate route;
   พิจารณา TTL cache `getBadgeRarity` (`shop.count()` ทุก request)
5. (debt) ย้าย `BadgeRarity`/`BadgePaceEstimate` types → `src/types/badge.ts`
   (ปัจจุบัน import type จาก service — work แต่ไม่ ideal)
6. **กระบวนการ:** UI iteration ที่ Chrome MCP ใช้ไม่ได้ → ขอ user ปิด Chrome ที่
   lock profile ตั้งแต่ต้น phase หรือ lock visual scope (mockup + screenshot) ให้แน่น
   ก่อน build เพื่อลด blind-thrash

## หมายเหตุ DoD
T6 automated browser QA (Chrome DevTools MCP) **รันไม่ได้ทั้ง phase** (profile lock
ซ้ำ ๆ) — verify ด้วย: curl static/HTTP + query DB ตรง + user manual visual confirm
ทุก surface. ไม่ได้เคลม automated 3-level QA. ถือเป็น known gap ของ phase นี้.

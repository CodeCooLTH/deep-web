# SafePay — Trust & Reputation Platform

> **Commercial brand:** "Deep" (UI copy, prod domain `deepthailand.app`). Internal codename "SafePay" is kept in repo, identifiers, and DB. See `~/.claude/projects/.../memory/feedback_brand_naming.md`.

---

## 🛑 HARD RULES — enforced by project skills

กฎเหล่านี้ enforce ผ่าน project-local skills ใน `.claude/skills/` (trigger อัตโนมัติ) — เมื่อ skill activate ให้ทำตาม skill ไม่ใช่จำจากที่นี่. Subagents ใน `.claude/agents/` ฝัง contract เดียวกัน.

| # | Rule | Skill (auto-trigger) | Deep reference |
|---|---|---|---|
| 1 | No UI from scratch — ทุกหน้า/component ต้อง copy จาก theme file ที่ระบุ แล้วปรับ content. **ทุกครั้งก่อนทำ Frontend ต้องอ่าน guideline ก่อน** | `ui-theme-sourcing` | `docs/system/ui-guideline/README.md` (+ `customer/`,`seller/`,`admin/`) |
| 2 | No `component={Link}` ใน server component — ใช้ LinkButton/LinkChip wrapper | `rsc-mui-nav` | `docs/conventions/rsc-mui-navigation.md` |
| 3 | Commit ที่แตะ UI ต้องมี `Base:` line ชี้ `theme/...` ที่ copy มา | `ui-theme-sourcing` | `docs/system/ui-guideline/README.md` |
| 4 | Phase ≥3 tasks = agent team (Planner→Developer→Reviewer→QA→Controller, 5 gates, 3-level QA) + retro ปลาย phase | `agent-team-phase`, `phase-retro` | `docs/conventions/agent-team-workflow.md` |
| 5 | Font Anuphan เท่านั้น — ทุก surface ทุก subdomain ทุก skin (ยกเว้น monospace code block + icon font). ห้าม hardcode font อื่น (Inter/Public Sans/Poppins/Nunito/...) | `ui-theme-sourcing` | `docs/conventions/anuphan-font.md` |
| 6 | Reference ที่ user ส่ง: แยก 2 ชั้น — **asset/content ใช้ตาม ref (ห้าม redesign/ทิ้งเอง)**, **layout/integration ต้องตาม theme ปัจจุบัน** (ห้ามแปะ layout ดิบจน "ดูเป็นตัวอย่าง"). ไม่ชัดส่วนไหนเป็นไหน → ถาม user ก่อน build. **ref เป็นแอปอื่น (Shopee ฯลฯ): เอา IA/layout ตาม ref แต่ skin/สี/component = theme ปัจจุบัน** (Paces น้ำเงิน ไม่ใช่ส้ม Shopee) | `ui-theme-sourcing` (reviewer gate) | `docs/conventions/reference-vs-theme-source.md` |
| 7 | **หน้า `(paces)/**` (seller/admin) ต้องประกอบจาก Paces primitive — ห้าม arbitrary Tailwind value.** ใช้ `.card`/`.card-header`/`btn`/`badge`/`text-default-*`/`bg-primary bg-{semantic}/15`/`size-*`/`rounded-lg`/`after:border-dashed`. ห้าม `text-[NNpx]`/`bg-[rgba()]`/`shadow-[]`/`rounded-[Npx]`/hardcode hex — เว้นจำเป็นจริง (raised-FAB/safe-area ที่ Paces ไม่มี token) **เขียน comment กำกับ**. "Base: comment แต่แต่งเองด้วย arbitrary" = ละเมิด (v6/v7 บทเรียน). ม่วง #7367F0 = buyer/Vuexy เท่านั้น | `ui-theme-sourcing` (reviewer grep gate) | `docs/retro/2026-06-10-seller-cc-v8-paces-resource-retrospective.md` |
| 8 | **ทุกงาน frontend/UI ต้องผ่าน `safepay-ux` ก่อนเสมอ (mandatory gate)** — และ `safepay-ux` **ต้องอ่าน `DESIGN.md` + `PRODUCT.md` + `.impeccable/design.json` เป็นขั้นแรกทุกครั้ง** แล้วออกหัวข้อ `### Impeccable compliance` ในทุก Design Spec (ux Hard Rule 9; theme ชนะเรื่อง markup — Impeccable ชนะเรื่องสี/น้ำเสียง/ลำดับชั้น). 🛑 **หลัง build UI เสร็จ Controller ต้องรัน Impeccable CLI เป็น gate ก่อน mark complete** — `/impeccable critique` (design review + คะแนน) และ `/impeccable clarify` (ตรวจ copy/error message/label) อย่างน้อย; `/impeccable audit` เมื่อแตะ a11y/perf. ux รันเองไม่ได้ (tools = Read/Glob/Grep). — สร้าง/แก้ page/component/layout/style ใด ๆ ต้อง invoke `safepay-ux` ออก Design Spec **ก่อน** ลงมือ. ux ต้องอ่าน **Impeccable playbook ที่ตรงกับงาน** ด้วย (`~/.claude/skills/impeccable/reference/` — `shape.md` ทุกครั้ง, `operate.md` สำหรับ `(paces)/**`, `craft-floor.md` ก่อนสรุป spec) และระบุ `Mode:` ใน `### Impeccable compliance` — ux agent Read ไฟล์เหล่านี้ได้เอง. ux อิง design docs **ตาม role**: seller/admin (`(paces)/**`) → **Paces docs `theme/paces/Docs/index.html`** + `docs/system/ui-guideline/paces-component-reference.md`; buyer/landing/public (`(marketing)/**`) → **Vuexy docs `theme/vuexy/documentation.html`** + `theme/vuexy/`. ห้ามเขียน frontend ตรง ๆ ข้าม ux (บทเรียน 2026-06-15: หลงทางแก้ไป-มา เพราะข้าม ux + ไม่อิง docs → ปุ่ม/dropdown/table/spacing เพี้ยน) | `ui-theme-sourcing` | seller/admin: `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`; buyer: `theme/vuexy/documentation.html` |
| 9 | **Toast/alert ใน `(paces)/**` (seller/admin) ใช้ `pacesToast` เท่านั้น — ห้าม `react-toastify`/`toast()`/`alert()`/swal/Preline toast ดิบ.** ทุก notification เรียกผ่าน `import { pacesToast } from '@/lib/paces-toast'`; render โดย `PacesToastContainer` (mount จุดเดียวใน `AppProvidersWrapper`) ด้วย markup Paces. **placement แยกตามแหล่งที่มา:** action/ปุ่ม → `pacesToast.success/error/warning/info` (**top-right**); chat → `pacesToast.chat.*` (**bottom-right**). `react-toastify` ยังใช้ได้เฉพาะ buyer `(marketing)/**` (Vuexy). **Reviewer grep gate:** `rg "from ['\"]react-toastify" "src/app/(paces)/"` ต้องคืน 0 ก่อน merge — **ต้อง match `from 'react-toastify'` ไม่ใช่แค่คำว่า `react-toastify` เปล่า ๆ** เพราะไฟล์ที่ทำถูกกฎมักเขียนคอมเมนต์อ้างชื่อกฎ ("ห้าม react-toastify") ไว้บนหัวไฟล์ → gate แบบเดิมจะแดงตลอดกาลและถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย (เข้าใจผิดจริงมาแล้ว 2026-08-02 → 08-03) | `ui-theme-sourcing` (reviewer grep gate) | `docs/conventions/paces-toast.md` |
| 10 | **Chart/graph ใน `(paces)/**` (seller/admin) ต้อง copy structure มาจาก `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/` เท่านั้น** แล้วปรับ content/data — ห้าม build chart options from scratch, ห้าม source จาก Vuexy theme dir, ห้าม import `react-apexcharts`/`echarts`/`chart.js`/`recharts` โดยตรง (ต้องผ่าน `@/components/wrappers/ApexChart`). สี: `getColor('chart-*')` token เท่านั้น — ห้าม hardcode hex. Commit ต้องมี `Base:` ชี้ theme charts file (Hard Rule 3). **Reviewer grep gate:** `rg "from 'react-apexcharts'\|from 'echarts'\|from 'chart\.js'\|from 'recharts'" "src/app/(paces)/"` ต้องคืน 0 ก่อน merge | `ui-theme-sourcing` (reviewer grep gate) | `docs/conventions/paces-charts-source.md` |
| 11 | 🛑 **Documentation-First — feature ใหม่ "ต้องทำเอกสารก่อนเขียนโค้ด" เสมอ.** ทุก feature มีโฟลเดอร์ `docs/20 - Features/<NNNNN> - <FeatureName>/` ประกอบจาก template ใน `docs/99 - Rules/Feature-Templates/` (PRD→BRD→SRS→SDS→DATABASE→API→Tests). **ห้าม implement ก่อนมี PRD+BRD (อย่างน้อย) ผ่าน user review.** 🛑 **แม้ user สั่งเร่ง/อนุมัติทำยาวต่อเนื่อง — doc-first ไม่ใช่ gate ที่ downgrade ได้ด้วยความเร่งรีบ**: ความเร็วมาจากการข้าม micro-approval ระหว่าง phase (`feedback_brainstorm_pace`) ไม่ใช่ข้าม Requirement (PRD+BRD) เอง. back-fill retroactive = หนี้ ไม่ใช่ default (บทเรียน 00012 ตีความ "เร่ง" ผิดเป็น "ข้าม doc-first"). Ownership → subagent: PRD/BRD=`safepay-product`, SRS/SDS/API=`safepay-planner`, DATABASE=`safepay-database`, Tests=`safepay-qa` (Controller Write+commit). diagram ทุกชนิด = **Mermaid เท่านั้น** (ห้าม ASCII/รูปภาพ). 🛑 **นับความครบด้วยการเทียบ "ชื่อไฟล์" กับ template ไม่ใช่ด้วย "จำนวนไฟล์"** — `diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls "docs/20 - Features/<NNNNN> - <Name>/")` เพราะการเพิ่มไฟล์นอก template (เช่น `UX-Design-Spec.md` ซึ่งควรมีจริงเมื่องานแตะ UI หนัก) กลบการหายไปของไฟล์ใน template ได้พอดีตัว แล้ว "7/7" จะถูกอ่านว่าครบทั้งที่เป็นคนละ 7 ไฟล์ (บทเรียน 00028: `TestCase.md` หายไปโดยไม่มีใครเห็นเพราะจำนวนครบ) | — (Controller enforce) | `docs/99 - Rules/Feature-Docs-Ownership.md` |
| 12 | **ห้าม emoji ใน UI ทุกจุด — ใช้ icon จริงเท่านั้น** (ทุก surface/subdomain/theme). ห้ามฝัง emoji ใน string/JSX/badge/chip/ปุ่ม/label/empty-state/toast/Swal — รวม emoji ที่ "ดูเหมือน icon" (👑🔥⭐💬📦✅⚡🎉🏆📷). จุดที่ควรมี icon แต่ mockup/spec ไม่ระบุตัว → **ถาม user ก่อน (ห้ามเดา)**. carve-out: code comment marker + typographic dingbat สีเดียว (★☆✓✗♡▾) + badge.icon จาก data. **Reviewer grep gate:** `grep -rnP '[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}]'` บนไฟล์ UI ที่แตะ = 0. theme copy พา emoji ติดมา → grep เก็บทันทีหลัง copy | `ui-theme-sourcing` (reviewer grep gate) | `docs/conventions/no-emoji-use-icons.md` |
| 13 | 🛑 **ห้ามคำสั่งลบข้อมูลแบบไม่ scope ในไฟล์เทสเด็ดขาด — ไม่มีข้อยกเว้น.** `deleteMany()` ที่ไม่มี `where`, `TRUNCATE`, `DELETE FROM` ที่ไม่มี `WHERE`, `DROP TABLE/SCHEMA`, `migrate reset`, `db push --force-reset`, `prisma db pull` ห้ามปรากฏใน `tests/**`, `e2e/**`, `**/__tests__/**`, `*.test.ts`, `*.spec.ts` **ทั้งสิ้น**. เหตุผล: **dev DB = prod DB ตัวเดียวกัน** (Supabase แชร์) คำสั่งพวกนี้คือการลบข้อมูลลูกค้าจริงทั้งฐาน ที่รอแค่ให้ connection ชี้ถูกที่. ต้องล้างข้อมูลระหว่างเทส → **scope ด้วย `where` ที่ผูกกับ id ที่เทสสร้างเอง** (`deleteTestData({ userIds, shopIds })` ใน `tests/setup.ts`) หรือเขียนเป็น unit test ที่ไม่แตะ DB เลย (วางใต้ `src/**/__tests__/`). `tests/setup.ts` ต้อง fail-closed ด้วย **allowlist** (ผ่านเฉพาะ localhost) ไม่ใช่ denylist. `cleanDatabase()` เดิมถูกถอดออกแล้ว — เรียกแล้ว throw ทันที | `test-db-guard` hook (block ตอน Write/Edit) | `docs/conventions/test-db-safety.md` |
| 14 | 🛑 **คำสั่งที่ล้าง/สร้าง schema ใหม่ได้ ต้องพิสูจน์ได้จากตัวคำสั่งเองว่าชี้ Postgres บนเครื่องตัวเอง — พิสูจน์ไม่ได้ = ถือว่าเป็น prod.** ครอบ `--shadow-database-url`/`SHADOW_DATABASE_URL=`, `migrate reset`, `db push --force-reset|--accept-data-loss`, `migrate dev`, `db pull`, `supabase db reset`, `psql` ที่มี `DROP`/`TRUNCATE`/`DELETE FROM` ไม่มี `WHERE`, และ `playwright test`/`npm run e2e` (config โหลด `.env.local` = prod และ helper ลบ User/Shop จริง). ผ่านได้ทางเดียวคือ **ปักหมุด URL localhost ในคำสั่งตรง ๆ** — ห้าม `$(...)`/ตัวแปรจาก `.env.local`. **เหตุผล: 2026-07-31 22:37 น. ฐาน prod ถูกล้างทั้ง 64 ตารางด้วย `prisma migrate diff --shadow-database-url "$(grep DIRECT_URL .env.local ...)"`** — shadow DB คือฐานทิ้งขว้างที่ Prisma drop schema ทิ้งเสมอ. คำสั่งไม่มีคำว่า delete/drop/reset เลย Hard Rule 13 จึงมองไม่เห็น (มันตรวจแค่ไฟล์เทสตอนเขียน). ยังทำได้ปกติ: `migrate deploy`/`status`/`generate`/`validate`, SELECT, `vitest`, และการ grep ที่ *พูดถึง* คำสั่งเหล่านี้ | `prod-db-guard` hook (**PreToolUse บน Bash** — block ตอนจะรัน; ติดตั้งทั้งในรีโปและระดับ user) | `docs/conventions/prod-db-safety.md` |

Subagents: `safepay-product` `safepay-planner` `safepay-ux` `safepay-database` `safepay-developer` `safepay-reviewer` `safepay-security` `safepay-qa` `safepay-docs` (ทุกตัว Sonnet; Controller = main session). **`safepay-ux` = mandatory gate ของงาน frontend ทุกชิ้น (Hard Rule 8)** — ออกแบบ UX/UI (read-only Design Spec) อิง Paces docs `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md` invoke **ก่อน developer/ก่อนแก้โค้ด frontend เสมอ** (ไม่ใช่แค่ task ไม่ trivial — ทุก task). Feature เต็มรูป (7-phase) ดู skill `agent-team-feature`.

---

## Project Overview

SafePay เป็นระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ ผ่านระบบ Verify ตัวตน, Trust Score, Badge และ Order History เพื่อแก้ปัญหามิจฉาชีพ

## Key Documents

- **PRD (product-level):** `docs/PRD.md` — vision, personas, user stories, feature overview (FR feature-level), scope, metrics, business model, roadmap. "อะไร/ทำไม"
- **SRS (software spec):** `docs/SRS.md` — FR ฉบับเต็ม (สูตร/acceptance/edge), state machine, routing, NFR, **data model (Prisma schema), API reference, enums/constants, authorization matrix, validation rules**. "สเปกให้ dev สร้าง". 🛑 งานที่แตะ data model/API/enum/validation/auth → อ่าน SRS ก่อน
- **Business Rules:** `docs/10 - Business Rules/` — กฎธุรกิจที่เป็น SSOT. **🛑 เมื่อใดก็ตามที่พูดถึง/ทำงานกับ "Tier" (trust tier, tier name/cover/color/mapping) ต้องอ่าน `docs/10 - Business Rules/Tier Lists.md` ก่อนเสมอ แล้วยึดตามนั้น — ห้ามตั้ง mapping/ชื่อ tier เองที่อื่น**
- **UI Guideline (must-read before ANY Frontend work):** `docs/system/ui-guideline/README.md` — entry hub (universal theme-copy rule + checklist + workflow + commit rule). Role docs: `customer/`, `seller/`, `admin/` page-sourcing.md
- **Buyer App API:** `docs/buyer-app-api.md` — REST `/api/app/*` สำหรับแอปมือถือผู้ซื้อ (Deep-App): auth Bearer token, โดเมนประมูล (Auction/Bid/WatchList/Notification), Phase 2 ชนะ→Order, dev setup. 🛑 งานที่แตะ `/api/app/*` อ่านอันนี้ก่อน
- **Conventions:**
  - `docs/conventions/rsc-mui-navigation.md` — RSC + MUI + next/link pattern
  - `docs/conventions/date-format.md` — 🛑 วันที่/เวลาทั้งระบบใช้ `formatDate`/`formatDateTime` จาก `src/lib/format-date.ts` เท่านั้น (พ.ศ. `2569-06-07 10:06:13`, tz ไทย) — ห้าม `toLocaleDateString`/`Intl.DateTimeFormat` เอง
  - `docs/conventions/no-emoji-use-icons.md` — 🛑 ห้าม emoji ใน UI ทุกจุด (ทุก surface/subdomain/theme) ใช้ icon จริงเท่านั้น (`@iconify/react`/wrapper); จุดที่ควรมี icon แต่ mockup/spec ไม่ได้ระบุตัว → **ต้องถาม user ก่อน implement เสมอ** (ห้ามเดาเอง)
  - `docs/conventions/impeccable-design.md` — 🛑 งาน UI **ทุกชิ้น** ยึด **Impeccable design system** เป็นหลัก (`.impeccable/design.json` + `DESIGN.md`): north star "The Trusted Counter", One Voice (ม่วง ≤10%), Verified-Means-Green (#28C76F), Ink Plum ไม่ใช่ดำสนิท, tokens เงา/motion, anti-slop. **อ่าน design.json ก่อนทำ UI เสมอ** — ควบคู่ theme-copy (Hard Rule 1/8)
  - `docs/conventions/enum-value-removal.md` — 🛑 ลบค่าออกจาก enum/union ที่ผู้ใช้เห็น ต้อง grep **ทั้ง repo** (`src/ e2e/ scripts/ prisma/ docs/`) ไม่ใช่แค่ `src/` เพราะ e2e/scripts **seed row จริง** และคอลัมน์ `String` ใน Prisma ไม่มี type ให้ TS จับ. grep จับ **object key ไม่ได้** → ต้องขยาย type union ให้ `tsc` บังคับ key ครบเป็นด่านสอง. ตรรกะ binary (`v === 'X' ? A : B`) ไม่พังเสียงดังเมื่อค่าที่ 3 มา — เขียนเป็น allow-list + fail-closed. ตั้งชื่อไทยของค่าใหม่ต้อง grep กันชนกับ label ที่มีอยู่ก่อน
  - `docs/conventions/contrast-fix-keeps-hue.md` — 🛑 แก้คอนทราสต์ปรับได้แค่ **ความเข้ม** ของสีเดิม **ห้ามสลับเฉด** (เหตุการณ์ 2026-08-03: `text-{tone}` → `-ink` 55 จุด ทำให้ดาวปักหมุดกลายเป็นน้ำตาล ปุ่ม danger กลายเป็นเลือดหมู ต้องย้อนทั้งหมด). `-ink` **ไม่ใช่ token ของธีม** (grep `theme/paces` = 0) — ก่อนใช้ token สีให้ grep `theme/` ก่อนเสมอ. ไอคอนที่ "สี = ตัวตน" (ดาว/โลโก้ช่องทาง) ไม่อยู่ใต้กฎคอนทราสต์ข้อความ. HR8 "Impeccable ชนะเรื่องสี" = ลำดับชั้น/น้ำเสียง/ความหมาย **ไม่ใช่ใบอนุญาตเปลี่ยนเฉดสีแบรนด์**
- **Retros:** `docs/retro/` (post-mortems of phase mistakes — read the latest one before starting a new phase)
- **Plans / specs:** `docs/superpowers/plans/`, `docs/superpowers/specs/`

## Architecture

- **Profile-Centric** — Trust Profile เป็นศูนย์กลาง ทุกอย่างไหลเข้า profile
- ไม่แบ่ง role buyer/seller — ทุกคนมี trust profile เหมือนกัน, เปิดร้านเพิ่มได้ (isShop flag)
- Subdomain routing: main (buyer), `seller.*`, `admin.*` — handled in `src/proxy.ts`
- Session แยกตาม subdomain — login/logout แยกกัน, account เดียวกัน
- Prod domain `deepthailand.app`; dev `deepth.local`

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack) — TypeScript strict mode
- **UI:**
  - Buyer + landing + public (`(marketing)/**`) → **Vuexy** (MUI v9 + Emotion + Tailwind 4)
  - Seller + admin (`(paces)/**`) → **Paces** (Preline 4 + Tailwind 4, no MUI)
- **Database:** PostgreSQL 16 (Supabase), Prisma ORM
- **Auth:** NextAuth.js v4 (`FacebookProvider` + `phone-otp` CredentialsProvider + `seller-credentials` CredentialsProvider bcrypt)
- **Validation:** Valibot (backend/API), Yup (frontend react-hook-form)
- **Form:** React Hook Form + `@hookform/resolvers`
- **Icons:** `@iconify/react` (on-demand) — use tabler icon names (e.g. `tabler-phone-check`)
- **Charts:** ApexCharts, ECharts, Chart.js (wrappers in `src/components/wrappers/`) — **chart ใน `(paces)/**` ต้อง copy structure จาก `theme/paces/Admin/TS/src/app/(admin)/widgets/charts/components/` และผ่าน `ApexChart` wrapper เสมอ (Hard Rule 10)**
- **Alerts:** react-toastify (mounted once in `(marketing)/ToastMount.tsx`)
- **Testing:** Vitest
- **Container:** Docker + Docker Compose (local Postgres); prod on Supabase

## Directory Structure

```
src/
├── app/
│   ├── (marketing)/           # Vuexy route group (buyer + landing + public)
│   │   ├── layout.tsx         # MUI ThemeProvider + Anuphan font + ToastMount
│   │   ├── auth/              # sign-in, sign-up, verify-otp
│   │   ├── dashboard/         # (→ to be wrapped in (buyer-app)/ per R2)
│   │   ├── orders/            # same
│   │   ├── reviews/           # same
│   │   ├── settings/          # same
│   │   ├── u/[username]/      # public profile
│   │   ├── o/[token]/         # public order
│   │   └── _components/       # shared client wrappers (mui-link, etc.)
│   ├── (paces)/               # Paces route group (seller + admin)
│   │   ├── layout.tsx         # Preline + Tailwind + AppProvidersWrapper
│   │   ├── seller/            # seller dashboard, products, orders, verification, etc.
│   │   │   ├── auth/          # sign-in, sign-up, verify-otp, reset-pass, new-pass (Paces auth/split)
│   │   │   └── onboarding/    # mandatory onboarding page (5-step; force-redirect ถ้า needsOnboarding)
│   │   └── admin/             # admin auth + (partial) dashboard
│   └── api/                   # Backend — unified across subdomains
├── @core/, @layouts/, @menu/  # Vuexy theme engine (copied from theme/vuexy)
├── assets/, components/,      # Paces scaffolds (copied from theme/paces)
│   config/, context/, hooks/,
│   layouts/, utils/
├── lib/                       # auth, prisma, otp, storage, subdomain, validations,
│                              #   sms, sms-unlock-cookie, sms-consume-rl,
│                              #   shop-slug, shop-categories, password (seller auth 2026-06-16)
├── services/                  # user, shop, verification, trust-score, badge,
│                              #   product, order, review, history-linking,
│                              #   wallet, sms-code, topup
├── types/
└── proxy.ts                   # Subdomain router (main/seller/admin)

theme/
├── vuexy/typescript-version/full-version/src/   # Vuexy source (reference only)
└── paces/Admin/TS/src/                          # Paces source (reference only)
```

## Core Systems

1. **Verification** — หลายระดับ: OTP (L1) → เอกสาร (L2) → จดทะเบียนธุรกิจ (L3), admin review
2. **Trust Score** — คำนวณจาก Verification 35%, Orders 25%, Rating 20%, Age 10%, Badges 10%. MVP มีแต่ขึ้น (no penalties)
3. **Badges** — Verification badges (auto) + 10 achievement badges (auto evaluated)
4. **Simple OMS** — Seller creates order → public `/o/{token}` → buyer phone-unlock → ยืนยัน → review → trust recalc. Types: PHYSICAL / DIGITAL / SERVICE / SUBSCRIPTION
5. **Buyer History Linking** — Buyer confirms as guest (contact) → signs up later → `linkBuyerHistory` auto-links by phone/email match. Wired in `lib/auth.ts` on phone-OTP + Facebook signup.
6. **SMS Order Link + Seller Wallet** (paid ฿1/SMS) — Seller L2+ กดส่ง link เข้า SMS buyer; link ฝัง 12-char short-code → `/api/o/sms/{code}` consume → HMAC-signed httpOnly cookie → buyer ข้าม phone-unlock อัตโนมัติ. Credit ledger: `SellerWallet` (1:1 Shop, balance ฿ integer, DB CHECK≥0), `WalletTransaction` (TOPUP/DEDUCT), `TopUpRequest` (slip → admin approve/reject, RC-7 self-block). Services: `wallet.service` (conditional-updateMany atomic deduct), `sms-code.service` (hash-at-rest single-use), `topup.service`, `lib/sms.ts` (generic sendSms apitel), `lib/sms-unlock-cookie.ts` (HMAC NEXTAUTH_SECRET), `lib/sms-consume-rl.ts` (RC-1 per-IP 10/15min globalThis).
7. **Seller Auth + Onboarding** (2026-06-16/17) — Seller login ด้วย username+password (provider `seller-credentials`, bcrypt, `lib/password.ts`) + Phone OTP signup + reset-via-OTP + Facebook OAuth (live prod). เบอร์โทร **immutable** (ตั้งครั้งเดียวผ่าน `/api/account/set-phone`, สร้าง L1 auto). `Shop.slug` (@unique, `src/lib/shop-slug.ts`) **บังคับ** — ไม่มี slug หรือ phone → `needsOnboarding=true` ใน JWT → `proxy.ts` force-redirect → `/onboarding` (mandatory 5-step page). Libs: `shop-categories.ts` (10 key), `shop-slug.ts` (normalize/validate/reserved), `password.ts` (bcryptjs).

## Conventions

- **Language:** TypeScript strict mode; UI copy ภาษาไทย
- **เอกสารทั้งหมดใช้ภาษาไทยเป็นหลัก** — retros (`docs/retro/`), convention docs (`docs/conventions/`), commit message bodies, code comments อธิบาย "ทำไม" ใช้ภาษาไทยเป็น default ยกเว้น: file paths, class/function names, library names (Next.js, Prisma, Vuexy, Paces, TanStack), technical jargon ที่ไม่มีคำแปลไทยที่ชัดเจน (RSC, JWT, OAuth, OTP), commit hashes
- **Font:** Anuphan (Google Fonts) — buyer/landing via `next/font`; Noto Sans Thai reference only
- **Mobile-first:** Tailwind breakpoints (`sm:`/`md:`/`lg:`)
- **Service layer** (`src/services/`) is separated from API layer (`src/app/api/`)
- **Input validation:**
  - Backend (API routes): Valibot schemas from `src/lib/validations.ts`
  - Frontend (forms): Yup + `@hookform/resolvers`
- **No Redux** — use Server Components + React state/context
- **Icons:** use `@iconify/react` with tabler names — never bundle a static icon set
- **Commit granularity:** one task/feature = one commit. Cite `Base:` theme file for UI commits (see Hard Rule 3).
- **QA:** Chrome DevTools MCP (`mcp__chrome-devtools__*` tools) is the baseline E2E check for UI tasks. curl + type-check alone are insufficient.

## Current State Snapshots

- **2026-04-13:** Attempted Paces-wide UI rewrite (original plan wiped Vuexy).
- **2026-04-18 (AM):** User reversed the decision for buyer side — buyer + landing back to Vuexy. Admin + seller stay Paces.
- **2026-04-18 (PM):** P1 buyer build shipped (9 commits) but retrospectively violated theme-copy rule; R1-R11 rework planned. See `docs/retro/2026-04-18-p1-retrospective.md`.
- **2026-05-17:** Phase 4 SMS Wallet complete — backend B1-B4 + UI B5-B8 built (tsc 0). ช่องว่างเหลือ: admin `/topups/[id]` detail page ยังไม่มี (Phase 5 todo). Accepted-risk Phase 5 hardening: CSRF Origin-check + slip cookie path narrow.
- **2026-05-23:** `/u/[username]` public profile redesign complete (user approve visual แล้ว) — single-column Instagram-style card (max-width 640px). ข้อมูล live จาก DB: trust banner (Deep tier names), avatar, shop identity, verified chip, badges, product grid (≤9 active), avg rating (aggregate ทั้งหมด — bug fix), order count + completion rate. Cross-platform stats + on-time/response = placeholder "ตัวอย่าง" (Phase 2). Follow/Chat = disabled "เร็ว ๆ นี้" (Phase 2). Services เพิ่ม: `getAvgRatingByUsername` (review.service), `getProductsByShop(shopId, take?)` (product.service). Spec: `docs/superpowers/specs/2026-05-23-shop-public-profile-design.md`.
- **2026-06-06:** branch `feat/seller-orders-phase-a` (push ถึง `a2218f4`). หลายงานปิดในวันเดียว:
  - **Seller Orders Phase B = VERIFIED-COMPLETE** — เคลียร์ QA-debt (safepay-qa E2E ผ่านทุก level: 4-block create, customer search, derive type, VAT/discount breakdown, DB persist 7 field). Unit D = **superseded** by Paces re-source; แทนด้วยเติม Phase B fields ในหน้า seller order detail (honest breakdown ใน OrderSummary + payment/channel/buyerName ใน CustomerDetails + การ์ด ShippingAddress) commit `d57e965`.
  - **PII RSC leak fix** — seller page อยู่ใต้ client `VerticalLayout` → Next serialize raw PII เข้า flight payload. แก้ด้วย mask + neutralize `order.buyerContact`/`order.review.reviewerContact` ที่ server boundary (S-C1). audit หน้า seller อื่น = clean. ดู memory `feedback_rsc_pii_neutralize_at_source`.
  - **CSRF + rate-limit (NFR-2.2/2.3, PRD §11 #11 CLOSED)** — `guardApi` ใน `src/proxy.ts` (Next 16 nodejs runtime): Origin-check (mutation, allowlist `*.deepthailand.app`/dev `*.deepth.local`) + per-IP rate-limit (unauth 100/auth 30 ต่อนาที, in-memory globalThis). lib: `src/lib/csrf-origin.ts` + `src/lib/api-rate-limit.ts` (+ Vitest 16 tests). `/api/auth/*` ยกเว้น; otp/sms limit เดิมคงไว้. **known-gap:** Vercel serverless = per-instance, Redis = Phase 2. spec `docs/superpowers/specs/2026-06-06-csrf-ratelimit-design.md`, plan `docs/superpowers/plans/2026-06-06-csrf-ratelimit.md`.
  - **Admin dashboard ครบ 8 metrics (PRD §11 #10 CLOSED)** — เติม Completion Rate / Avg Review Rating / Active Users (30d) ใน dashboard page + `api/admin/dashboard`.
  - **PRD gap เหลือ:** §11 #3 shippingAddress required-when-SHIPPED (quick win), FR-6.10 SUBSCRIPTION recurring (P4, effort สูง), FR-9.6 tier names ใน PRD ขัด SSOT (doc-sync — โค้ดถูกแล้ว).
  - **Carried debt:** Chrome-DevTools MCP visual QA (CSRF/RL, admin 8-card, order detail) — MCP หลุดทั้ง session, verify ด้วย authenticated-curl + DB-query แทน. รอ MCP กลับมาเก็บรวด.
- **2026-06-07: 🚀 FIRST PROD DEPLOY** — phase-a (210 commits) merged → `origin/main` (FF) + deployed prod `deepthailand.app` (smoke-test ผ่าน: 200 ทุก subdomain, CSRF guard live 403). + pre-prod gaps ปิดเพิ่ม: shippingAddress required-when-SHIPPED (FR-6.5), admin self-review bypass fix (FR-2.6 — orphan route ลบ + service guard), menu/breadcrumb i18n, FR-9.6 tier doc-sync, brand email.
  - **Prod infra (สำคัญ — ดู memory `project_prod_deploy_setup`):** Vercel project `trust-me` reconnect จาก `trustme` → **`deep-web/main`** (prod ผูก repo นี้แล้ว). prod DB = **dev Supabase ตัวเดียวกัน** (แชร์ — ควรแยกภายหลัง). **git auto-deploy ใช้ได้** (push origin main → deploy; verified commit `867c702`); deploy สำรอง `vercel deploy --prod --yes` (CLI). หมายเหตุ Hobby = 1 concurrent build — ถ้า deploy ค้าง "Initializing" นาน → `vercel remove <url> --yes` ปลด slot. prod env: apitel added (phone-OTP/SMS ใช้ได้); **FB creds ยังขาด** (FB login ปิด — OTP ใช้แทน).
- **2026-06-16: Seller Auth Redesign — P1+P2+P3 SIGNED-OFF** (branch `feat/seller-order-detail-optionD`, ยังไม่ merge main). seller ได้ **username+password login** (provider `seller-credentials`, bcrypt) + phone OTP ยืนยันตอนสมัคร + ตั้ง/ลืมรหัสผ่าน via OTP + Facebook; 5 หน้า auth จาก Paces `auth/split` (mobile เต็มจอ); **onboarding modal** (welcome→category chips→slug บังคับ→สินค้าแรก ข้ามได้) เด้งเมื่อ `session.needsOnboarding`. schema: `Shop.slug @unique` (migration applied Supabase). E2E ผ่าน real route + simulated SMS (test phone `0000000009`/`123456` dev-only). **⚠️ หลัง migrate ต้อง restart dev server** (stale Prisma client → session 500). docs: spec/plan/baseline/retro `docs/{superpowers/specs,scope,retro}/2026-06-16-seller-auth-*`; QA checklist `docs/qa/seller-auth-qa-checklist.md`; memory `project_seller_auth_resume`. carry: visual mobile QA (MCP), FB prod creds, Redis hardening.
- **2026-06-17: Facebook Login live บน prod + Mandatory Onboarding page + Mobile fixes**
  - **Facebook OAuth live (consumer + seller):** `FACEBOOK_ID`/`FACEBOOK_SECRET` ใส่ใน Vercel prod + `.env.local`; `FacebookProvider` (lib/auth.ts) ดึง avatar `graph.facebook.com/{id}/picture?type=large` (~200px); `next.config.ts` ขาว `graph.facebook.com`; `jwt` callback อัปเดต avatar ทุก login; username เริ่มต้น = `fb{facebookId}` (เดิม `user_${ts}`); backfill FB user เดิม. **เทส FB ได้บน prod เท่านั้น** (FB App ต้องการ https; App ยัง Dev mode)
  - **`/auth/callback/facebook`:** หน้า loading Paces spinner รอ session → redirect /dashboard (~1.5s); ปุ่ม FB ทุกหน้าชี้ `callbackUrl=/auth/callback/facebook`
  - **Mandatory /onboarding page** (แทน OnboardingModal บน dashboard): `src/app/(paces)/seller/onboarding/page.tsx` (AuthCardShell); 5 step: phone (FB-first) → ข้อมูลร้าน (displayName/category/username) → OTP → slug → สินค้าแรก; `proxy.ts` force-redirect seller authed+`needsOnboarding` → `/onboarding` ทุก route (ยกเว้น /auth,/api); `OnboardingModal.tsx` = dead code (ลบทีหลัง)
  - **API ใหม่:** `POST /api/account/set-phone` (phone immutable — ตั้งครั้งเดียว; 409 ถ้ามีแล้ว; สร้าง L1 PHONE_OTP auto), `POST /api/account/shop-info` (displayName/username/category), `GET /api/shops/check-slug`, `POST /api/shops/slug`
  - **Business rules ใหม่:** เบอร์โทร **immutable** (ตั้งครั้งเดียว เปลี่ยนไม่ได้ — มีผลต่อ Trust Score); onboarding **บังคับ** (ไม่มี slug หรือ phone → เด้ง /onboarding ทุก login)
  - **Mobile-responsive + theme fixes:** tap target ≥44px ทุกหน้า, Choices select match form-input, auth card width = theme, dashboard cosmetic
  - **Bug fix:** OTP signup prod "รหัสไม่ถูกต้อง" = orphan AuthAccount(PHONE) จาก block test account ไม่ครบ (P2002) — แก้ด้วย data (block AuthAccount จริง)
  - **Carry:** `OnboardingModal.tsx` dead code (ลบทีหลัง), username 30-day cooldown (edit หลัง onboarding — feature อนาคต), FB App Review `email` (เปิด public), FB App secret regenerate
- **2026-07-04: Buyer-app UI cohesion + Landing polish + Responsive (tablet) overhaul** (buyer/Vuexy `(marketing)/**` เท่านั้น; ยึด Impeccable design.json)
  - **Buyer-app cohesion — ทุกหน้า "บัญชีของฉัน" ใช้ pattern เดียวกัน:** `PageHeader` กลาง (`(buyer-app)/_components/PageHeader.tsx`) title/subtitle/action ใช้ร่วม orders/reviews/badges/messages/profile/verification. orders + reviews เขียนใหม่จาก TanStack client table → **server-rendered card list** (ลบ `OrderListTable.tsx`/`ManageReviewsTable.tsx` — เบาลง ไม่มี client JS หนัก). messages(inbox) ห่อ Card + แถวสไตล์เดียวกัน. empty-state + status สี/label (PENDING=warning/SHIPPED=info/CONFIRMED=success เขียว/CANCELLED=error) ตรงกันทั้ง dashboard widget + หน้าเต็ม
  - **Search/Filter:** `SearchBox` (client island เล็ก, `?q=` ใน URL, list ยัง server-render) — orders (ค้นหา+chips สถานะ), reviews (ค้นหา+chips ดาว ALL/5–1). กรอง in-memory (buyer มี order/review ไม่มาก)
  - **รูปแบบวันที่ไทย:** `format-date.ts` เพิ่ม `formatDateTH` "01 ส.ค. 2569" / `formatDateTimeTH` "01 ส.ค. 2569 19:30" / `formatTimeHM` "19:30" (ไม่แตะของ seller/admin). ใช้ทั่ว buyer (orders/reviews/o/messages/chat/profile). **perf:** cache `Intl.DateTimeFormat` เป็น singleton (เดิมสร้างใหม่ทุก format)
  - **Impeccable fixes:** ตัด `uppercase` eyebrow (ProfileForm) → section label subtitle2 semibold; badges `bg-primary/10` → token var. Verified-Means-Green ทั่วทุกหน้า
  - **Landing (/):** ตัดโลโก้บริษัทต่างชาติปลอมจาก theme ใน CustomerReviews (Netflix/Airbnb/… ทั้งบนการ์ด + แถบ "trusted by") → เหลือ testimonial ไทยจริง; ลบ dead files GetStarted/OurTeam/ContactUs; ย้ายเมนู "ราคา" → `/#pricing-plans` (เลื่อนไป section) + ลบหน้า `/pricing` + `views/front-pages/pricing`; navbar เมนูอยู่กลาง (logo·เมนู flex-1·actions)
  - **Header/nav:** `solidHeader` prop → header ทึบ+เงาทันทีบน buyer (ไม่ต้อง scroll); landing คงโปร่งที่ท็อป. `ScrollToTop` (`(buyer-app)/_components/`) เด้งบนสุดทุกครั้งเปลี่ยน route
  - **Responsive (desktop+tablet; mobile <768 รอจัดแยก):** เมนูซ้าย buyer โผล่ตั้งแต่ **768px** ใช้ `min-[768px]:` (Vuexy remap Tailwind `md`=900/`lg`=1200 → ต้องใช้ arbitrary variant ให้ตรง 768). content 2-col ภายใน (banner/stat) split ที่ `lg`(1200) เพราะ tablet main แคบลง 240px จาก sidebar. width container (navbar+footer/layoutSpacing+buyer) ลบ cap tier 900 → ช่วง 900–1199 fluid (iPad Pro 1024 ขอบเหลือ 24px). **Sticky footer** ที่ FrontLayout (`flex flex-col min-bs-[100dvh]` + children `flex-1`) → footer ติดล่างสุดเสมอ ไม่มีขาวใต้ footer. Footer Grid `lg`→`md`+sm 4/4/4 → iPad Pro 4-col, iPad Air/Mini brand เต็มแถว+3 คอลัมน์เท่า
  - **local-only (ห้าม commit):** `lib/otp.ts` (test accounts เดิม), `lib/csrf-origin.ts` (localhost dev — commit แล้วปลอดภัยเพราะ `!isProd` gate; ตอนนี้ commit แล้ว)
- **2026-08-02: "กระจายที่อยู่" แล้วบันทึกออเดอร์ไม่ผ่าน — merged main `ba8e464b` + prod** (retro `docs/retro/2026-08-02-order-address-paste-bugfix.md`)
  - **parser** (`lib/parse-order-message.ts`): เพิ่มรายชื่อ 77 จังหวัดสะกดตามชุดข้อมูล iShip ไว้จับกรณีไม่มี marker `จ.` (ที่อยู่ กทม. เขียนแบบนี้เป็นปกติ) + normalize `กรุงเทพมหานคร`/`กทม.` → `กรุงเทพ`; ตัดเบอร์ออกจากบรรทัดแทนการข้ามทั้งบรรทัด (ข้อความบรรทัดเดียวเคยได้ทั้งชื่อและที่อยู่ว่าง); บรรทัดที่มีแต่เบอร์ไม่ถูกหยิบมาเป็นที่อยู่
  - **`lib/shipping-address-status.ts` (ใหม่) = SSOT ฝั่งหน้าจอของ "ที่อยู่ครบพอบันทึกไหม"** — กฎเดิมเขียนซ้ำ 3 ที่แล้วนิยามไม่ตรงกับ `createOrder` (บังคับ `line1 + province + postcode`) ทำให้ปุ่มขึ้น "เลือกแล้ว" ทั้งที่ยังขาด. ปุ่มที่อยู่มี 3 สถานะจริง; ตำบล/อำเภอ ไม่บล็อกการบันทึกแต่เตือนว่าต้องเติมก่อนเปิดพัสดุ iShip
  - **`setError` ที่ไม่มีใคร render = error เงียบ** — `shippingAddress.line1/.province/.postcode` ถูก set ตอน submit มาตลอดแต่ไม่เคยแสดงทั้ง quick form และ POS; แก้แล้วทั้ง 2 surface (`is-invalid` + ข้อความใต้ช่อง + `aria-describedby`)
  - **แก้ Verified-Means-Green ที่ละเมิดจริง** — `AddressSearchPanel` ขึ้นเช็กถูกสีเขียวกับที่อยู่ที่ยังไม่ครบ (คอมเมนต์เขียนอ้างกฎนั้นอยู่บนโค้ดที่ละเมิดเอง) → primary เมื่อครบ / danger เมื่อขาด
  - **carry:** browser QA (ยังไม่เคยกดจริง), เช็กถูกสีเขียวในรายการผลค้นหาที่อยู่ทั้ง 2 picker
  - ~~`react-toastify` ตกค้างใน `(paces)` 3 ไฟล์~~ — **ตรวจซ้ำ 2026-08-03 แล้วไม่จริง ยกเลิกรายการนี้**: ทั้ง 3 จุด (`ChannelsClient`, `MovementHistoryTable`, `ConnectedAccountsClient`) เป็น **คอมเมนต์ที่อ้างถึงกฎ** ไม่ใช่ import — ไฟล์ทั้งหมดใช้ `pacesToast` ถูกต้องอยู่แล้ว. ต้นเหตุคือ grep gate ของ HR9 ที่ match คำเปล่า ๆ (แก้แล้ว ดู HR9)

- **2026-08-02 (feature 00026): หน้า `/account` "ข้อมูลส่วนตัว" + สร้างร้านส่วนตัวจาก account switcher — merged main + prod** (retro `docs/retro/2026-08-02-feature-00026-personal-account-retrospective.md`, docs `docs/20 - Features/00026 - Personal Account & Connections/`)
  - **`src/lib/onboarding-gate.ts` = SSOT ใหม่ของ `needsRegistration`/`needsOnboarding`** — ทั้ง `jwt` และ `session` callback ใน `lib/auth.ts` เรียกตัวเดียวกัน และต้องเรียก **หลัง** block ที่ resolve `activeShopId` เสมอ. กฎ: บังคับ setup เฉพาะตอน `activeShopId === personal shop id` ไม่งั้นผู้ถูกเชิญที่กดสร้างร้านส่วนตัวจะถูก proxy ขังใน `/onboarding` ทุก route ออกไม่ได้
  - **หน้า `/account` ผูกกับ `session.user.id` ล้วน — ห้ามเรียก `requireActiveShop`/อ่าน `activeShopId` ในหน้านี้** (นั่นคือเหตุผลที่หน้านี้มีอยู่: แยก "ตั้งค่าตัวคน" ออกจาก "ตั้งค่าร้าน" ที่ `/shop`)
  - `ConnectedAccountsClient` ย้ายจาก `settings/` → `account/components/` + เพิ่มแถวตั้ง/เปลี่ยนรหัสผ่าน; `/settings` เหลือเฉพาะการจัดส่ง (เมนูเปลี่ยนชื่อเป็น "การจัดส่ง"), กลุ่มเมนูใหม่ "บัญชีของฉัน" อยู่ล่างสุด
  - **security fix ที่ไปกับรอบนี้ (`eb32a937`)**: `PATCH /api/users/me` เคยส่ง body ดิบเข้า `prisma.user.update` → ยิง `{"isAdmin":true}` เป็นแอดมินได้; ปิดด้วย `UpdateProfileSchema` (Valibot allow-list) + pick field ใน service + `GET` เลิกคืน `passwordHash`
  - API ใหม่: `check-username`, `otp-for-password`, `set-password-otp` — 2 ตัวหลัง resolve เบอร์จาก session ไม่รับจาก client (คืนแค่ `phoneMasked`)
  - **ข้อมูลจริง prod 2026-08-02:** User 10 คน ไม่มีเบอร์ 6 · ไม่มีทั้งเบอร์และรหัสผ่าน 5 (กู้บัญชีไม่ได้ถ้าหลุดจาก FB/LINE) → ขึ้นแถบเตือนใน `/account` ไม่บังคับเพิ่มเบอร์
  - **carry:** browser QA 15 เคสยังไม่เคยกดจริงสักครั้ง (`TestCase.md` §3.1) · E2E ข้ามตามที่ user ตัดสิน · `AccountAvatar` ใส่ `rounded-full` ให้ทั้ง business/personal จึงไม่มี convention "วงกลม=คน สี่เหลี่ยม=ร้าน"

- **2026-08-03 (feature 00028): ประเภทร้านค้า 2 → 3 แบบ — DEPLOYED PROD** (`68348a49`, migration `20260803140000_shop_business_type` apply แล้ว; docs ที่ `docs/20 - Features/00028 - Shop Business Type/` — **มี 7 ไฟล์แต่ยังไม่ครบ template: `TestCase.md` ขาด** มี `UX-Design-Spec.md` เข้ามาแทนที่จำนวนพอดี ทำให้เคยถูกบันทึกผิดว่า "7/7"; retro → `docs/retro/2026-08-03-feature-00028-shop-business-type-retrospective.md`)
  - 🛑 **`Shop.vertical` = `ONLINE_SALES` (ขายออนไลน์) | `SERVICE_QUEUE` (สินค้าและบริการ) | `LODGING` (บ้านพัก) — ค่า `GENERAL` ถูกลบถาวร** มี CHECK constraint `Shop_vertical_check` กันที่ระดับ DB (unmanaged SQL — **ห้าม `prisma db pull`**) · label `LODGING` เปลี่ยนจาก "บ้านพักตากอากาศ" → "บ้านพัก" · SSOT อยู่ที่ `src/lib/lodging.ts`
  - **เงื่อนไขเปิดคิวงานเหลือ `vertical==='SERVICE_QUEUE'` เงื่อนไขเดียว** — ตัด `kind==='BUSINESS'` ออกจาก `canUseAppointments` (`src/lib/appointments.ts`) → **บัญชีบุคคลใช้ระบบคิวงานได้แล้ว** และ `applyAppointmentMenu` ถูกยุบเข้า `applyVerticalMenu` (ไม่ต้องมีฟังก์ชันแยกอีก)
  - **`seller-menu.ts` เปลี่ยนจาก deny-list เป็น allow-list ต่อ vertical + fail-closed** (`VERTICAL_VISIBLE_SLUGS`) — ค่าที่ไม่รู้จักตกไป `ONLINE_SALES` แทนที่จะหลุดเมนูของประเภทอื่น
  - **`vertical` immutable ยกเว้นทางเดียว:** `POST /api/shops/update` ตั้งได้ตอน `Shop.slug === null` (onboarding ยังไม่จบ) มี slug แล้ว → **409 `VERTICAL_LOCKED`** (ห้าม ignore เงียบ)
  - สินค้าที่สร้างในร้าน `SERVICE_QUEUE` ได้ `fulfillmentMode = NO_SHIPPING` เป็นค่าตั้งต้น (DB default คือ `SHIPPED`) — ส่งผ่าน parameter `shopVertical` เข้า `createProduct` ไม่ query ใน service
  - **ปิดช่องโหว่ที่มีอยู่ก่อนแล้ว 2 จุด:** ระบบประมูล (`api/seller/auctions/_shared.ts::requireSellerShop`) และ Inventory Add-on (`requireOnlineSalesVertical()` × 7 route) **ไม่เคยมี server-side vertical guard เลย** กันด้วยการซ่อนเมนูอย่างเดียวมาตลอด — ทั้งคู่ครอบ GET ด้วย ไม่ใช่แค่ mutate
  - 🛑 **public profile มี 2 เส้น ไม่ใช่เส้นเดียว** — `/u/[username]` (ทุกร้าน) + **`/b/[slug]` (เฉพาะ BUSINESS)** ใช้ `ShopProfile.tsx` ตัวเดียวกัน แก้เส้นเดียวไม่พอเสมอ · label แท็บสินค้าเปลี่ยนเป็น **"สินค้า"** (เดิม "สินค้าและบริการ" ซึ่งชนกับชื่อ vertical ใหม่ตรงตัว) · เพิ่มแท็บ "บริการ" + `PublicServiceList.tsx` (Base: `PublicRoomList.tsx`)
  - **onboarding ทั้ง 2 ที่แตกตาม vertical** (`seller/onboarding/page.tsx` + `BusinessOnboardingWizard.tsx`): step เลือกประเภทเป็นจอแรก · step สุดท้าย = ฟอร์มสินค้า (ONLINE_SALES) / ฟอร์มคิวงาน (SERVICE_QUEUE) / **ไม่มี step แล้วไป `/rooms/new`** (LODGING) · dot progress 5 หรือ 4 จุดตามที่เลือก
  - **บทเรียนสำคัญ:** ตรรกะ `vertical === 'LODGING' ? A : B` **ไม่พังแบบเห็นชัด**เมื่อเพิ่มค่าที่ 3 แต่เงียบ ๆ ปล่อยค่าใหม่ตกเข้า branch ผิด และ `rg "'GENERAL'"` จับไม่ได้ทั้งกรณี object key (`Record<ShopVertical,...>`) และกรณี binary — วิธีที่ได้ผลคือขยาย type union ให้ TypeScript บังคับ key ครบ แล้ว grep `vertical`/`isLodging` ควบคู่ไปด้วย
  - **carry:** browser QA (user รับไปกดเองบน prod 2026-08-03) · P3 Public Profile เต็มรูปตาม `UX-Design-Spec.md` §B (ตอนนี้เป็น ready-state) · retro · `docs/scope/` baseline ยังไม่มีสำหรับ 00028

Safety checkpoint: `git checkout pre-paces-wipe` restores the pre-2026-04-13 state.

@AGENTS.md

# SafePay — Trust & Reputation Platform

> **Commercial brand:** "Deep" (UI copy, prod domain `deepthailand.app`). Internal codename "SafePay" is kept in repo, identifiers, and DB. See `~/.claude/projects/.../memory/feedback_brand_naming.md`.

---

## 🛑 HARD RULES

ฉบับเต็ม (เหตุผล · เคสจริง · grep gate) → [[docs/claude/hard-rules]] — **เปิดอ่านข้อที่เกี่ยวก่อนลงมือทุกครั้ง** บรรทัดข้างล่างคือแก่นที่ต้องจำเท่านั้น. skill ใน `.claude/skills/` trigger อัตโนมัติ — skill activate ให้ทำตาม skill

| # | แก่นของกฎ | skill / ตัวบังคับ |
|---|---|---|
| 1 | ห้าม UI from scratch — copy จาก theme แล้วปรับ content; อ่าน `docs/system/ui-guideline/README.md` ก่อนทำ frontend ทุกครั้ง | `ui-theme-sourcing` |
| 2 | ห้าม `component={Link}` ใน server component → LinkButton/LinkChip | `rsc-mui-nav` |
| 3 | commit ที่แตะ UI ต้องมีบรรทัด `Base: theme/...` | `ui-theme-sourcing` |
| 4 | phase ≥3 tasks = agent team (Planner→Developer→Reviewer→QA→Controller) + retro | `agent-team-phase` |
| 5 | font Anuphan เท่านั้น (ยกเว้น monospace code + icon font) | `ui-theme-sourcing` |
| 6 | ref จาก user: asset/content ตาม ref · layout/skin ตาม theme ปัจจุบัน · ไม่ชัด → ถาม | `ui-theme-sourcing` |
| 7 | `(paces)/**` ประกอบจาก Paces primitive — ห้าม arbitrary Tailwind (`text-[..]`/hex/`shadow-[]`) เว้นมี comment กำกับบรรทัดเดียวกัน; ม่วง #7367F0 = buyer เท่านั้น | reviewer grep |
| 8 | frontend ทุกชิ้นผ่าน `safepay-ux` ก่อน (อ่าน DESIGN.md + PRODUCT.md + `.impeccable/design.json` + playbook impeccable หา path ด้วย `find ~/.claude/plugins/cache/impeccable -path '*skills/impeccable/reference' -type d`) · หลัง build รัน `/impeccable critique` + `clarify` ก่อน mark complete | Controller |
| 9 | toast ใน `(paces)/**` = `pacesToast` เท่านั้น · gate: `rg "from ['\"]react-toastify" "src/app/(paces)/"` = 0 | reviewer grep |
| 10 | chart ใน `(paces)/**` copy จาก `theme/paces/.../widgets/charts/components/` ผ่าน `ApexChart` wrapper · สี `getColor('chart-*')` | reviewer grep |
| 11 | Documentation-First: PRD+BRD ผ่าน user ก่อนเขียนโค้ด (เร่งก็ไม่ข้าม) · นับครบด้วย `diff` ชื่อไฟล์กับ template · แตะ data model/API/enum ต้อง sync `docs/SRS.md` · diagram = Mermaid | Controller |
| 12 | ห้าม emoji ใน UI — icon จริงเท่านั้น; ไม่รู้จะใช้ icon ไหน → ถาม | reviewer grep |
| 13 | ห้ามลบข้อมูลไม่ scope ในไฟล์เทส (`deleteMany()` เปล่า/TRUNCATE/DROP/`migrate reset`/`db pull`) — scope ด้วย id ที่เทสสร้าง | `test-db-guard` hook |
| 14 | คำสั่งที่ล้าง/สร้าง schema (shadow DB, `migrate dev/reset`, `db push --force-reset`, playwright/e2e) ต้องปักหมุด URL localhost ในคำสั่งตรง ๆ — พิสูจน์ไม่ได้ = prod (prod ถูกล้างมาแล้ว 2026-07-31) | `prod-db-guard` hook |
| 15 | push `main` = `prisma migrate deploy` บน prod ในตัว — ห้ามสั่ง migrate ชี้ prod เอง; ก่อน migrate ต้องบอก user 3 ข้อ (prod ไม่ต้องสั่ง · local ต้อง apply เอง · migrate ล้ม = deploy ไม่ขึ้น) | Controller |
| 16 | ศัพท์ธุรกิจ (กำไร/ยอดขาย/ต้นทุน…) นิยามเดียวทั้งระบบ — grep นิยามเดิม + อ่านไฟล์ที่จะ import ให้จบ · ข้อจำกัดที่เอกสารอ้างต้องยืนยันกับโค้ดก่อน | Controller |
| 17 | rebase สะอาด ≠ ปลอดภัย — ไฟล์ที่สองฝั่งแตะ (`comm -12` ของ diff สองทาง) ต้องอ่าน diff อีกฝั่ง · verify หลัง rebase · เช็ค FF ซ้ำก่อน push | Controller |

Subagents: `safepay-product` `safepay-planner` `safepay-ux` `safepay-database` `safepay-developer` `safepay-reviewer` `safepay-security` `safepay-qa` `safepay-docs` (Controller = main session). `safepay-ux` = gate ของ frontend ทุก task. feature เต็มรูปดู skill `agent-team-feature`.

---

## Project Overview

SafePay เป็นระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ ผ่านระบบ Verify ตัวตน, Trust Score, Badge และ Order History เพื่อแก้ปัญหามิจฉาชีพ

## Key Documents

- **PRD (product-level):** `docs/PRD.md` — vision, personas, user stories, feature overview (FR feature-level), scope, metrics, business model, roadmap. "อะไร/ทำไม"
- **SRS (software spec):** `docs/SRS.md` — FR ฉบับเต็ม (สูตร/acceptance/edge), state machine, routing, NFR, **data model (Prisma schema), API reference, enums/constants, authorization matrix, validation rules**. "สเปกให้ dev สร้าง". 🛑 งานที่แตะ data model/API/enum/validation/auth → อ่าน SRS ก่อน
- **Business Rules:** `docs/10 - Business Rules/` — กฎธุรกิจที่เป็น SSOT. **🛑 เมื่อใดก็ตามที่พูดถึง/ทำงานกับ "Tier" (trust tier, tier name/cover/color/mapping) ต้องอ่าน `docs/10 - Business Rules/Tier Lists.md` ก่อนเสมอ แล้วยึดตามนั้น — ห้ามตั้ง mapping/ชื่อ tier เองที่อื่น**
- **UI Guideline (must-read before ANY Frontend work):** `docs/system/ui-guideline/README.md` — entry hub (universal theme-copy rule + checklist + workflow + commit rule). Role docs: `customer/`, `seller/`, `admin/` page-sourcing.md
- **Buyer App API:** `docs/buyer-app-api.md` — REST `/api/app/*` สำหรับแอปมือถือผู้ซื้อ (Deep-App): auth Bearer token, โดเมนประมูล (Auction/Bid/WatchList/Notification), Phase 2 ชนะ→Order, dev setup. 🛑 งานที่แตะ `/api/app/*` อ่านอันนี้ก่อน
- **Conventions:** แต่ละข้อมีไฟล์ใน `docs/conventions/` · สรุปยาวทุกข้อรวมที่ [[docs/claude/conventions-index]] — 🛑 เจอสถานการณ์ตรงคอลัมน์ขวา ต้องเปิดไฟล์นั้นก่อน
  - [[docs/conventions/rsc-mui-navigation]] — RSC + MUI + next/link
  - [[docs/conventions/date-format]] — วันที่ใช้ `formatDate`/`formatDateTime` (`src/lib/format-date.ts`) เท่านั้น
  - [[docs/conventions/no-emoji-use-icons]] — emoji ห้าม, icon ไม่ระบุ → ถาม
  - [[docs/conventions/impeccable-design]] — งาน UI ยึด `.impeccable/design.json` + `DESIGN.md`
  - [[docs/conventions/enum-value-removal]] — ลบค่า enum: grep ทั้ง repo + ขยาย type ให้ tsc บังคับ
  - [[docs/conventions/root-served-assets-and-proxy]] — ไฟล์ root ใหม่ต้องเพิ่มนามสกุลใน `src/proxy.ts`
  - [[docs/conventions/webhook-subscription-two-layers]] — Meta webhook มี 2 ชั้น (แอป + เพจ)
  - [[docs/conventions/insert-then-catch-logs-every-error]] — ERROR ใน log Postgres จาก constraint ที่ดักไว้
  - [[docs/conventions/one-value-many-entry-points]] — ค่าเดียวหลายทางเข้า เก็บคนละตาราง
  - [[docs/conventions/user-supplied-image-assets]] — รูปจาก user ต้องเปิดดูก่อนใช้
  - [[docs/conventions/contrast-fix-keeps-hue]] — แก้คอนทราสต์ห้ามสลับเฉด
  - [[docs/conventions/aria-name-requires-supporting-role]] — `aria-label` ต้องมี role รองรับ
  - [[docs/conventions/partial-data-must-be-labeled-or-filled]] — ตัวเลขไม่ครบต้องบอกหรือเติม
  - [[docs/conventions/external-payload-schema]] — payload ภายนอก: พิสูจน์ด้วยของจริง, field optional เป็นค่าตั้งต้น
  - [[docs/conventions/seller-action-placement]] — ตำแหน่งปุ่ม seller · full-screen ทำ FAB หาย
  - [[docs/conventions/sibling-surface-parity]] — หน้าใหม่ต้องอ่านหน้าพี่น้องก่อน
  - [[docs/conventions/scroll-container-clips-popovers]] — popover โดน overflow/SimpleBar ตัด
  - [[docs/conventions/overlay-scroll-lock]] — overlay ประกอบเองต้อง `useLockBodyScroll`
  - [[docs/conventions/stored-flag-vs-owner-truth]] — ธงในแถว = ภาพนิ่ง · กฎ OR กั้นทุก operand
  - [[docs/conventions/flex-header-truncation]] — `truncate` ใน flex ต้องมาเป็นชุด
  - [[docs/conventions/unlayered-css-beats-utilities]] — `_forms.css` ชนะ utility → ใช้ `flex!`
  - [[docs/conventions/ui-boolean-needs-a-testable-home]] — boolean ตัดสิน UI ย้ายไป `src/lib` + เทส mutation
  - [[docs/conventions/ios-safe-area]] — safe-area ต้องมี `viewport-fit=cover`
  - [[docs/conventions/upload-body-size-limit]] — ห้ามส่งไฟล์ผ่าน body (4.5MB) ใช้ `@/lib/upload-client`
  - [[docs/conventions/known-limitation-vs-unfinished]] — ก่อนเรียกว่า "หนี้" ไล่เคสก่อน
  - [[docs/conventions/rule-must-be-enforced-not-described]] — AC ต้องชี้บรรทัดที่บังคับ + เทสที่แดง
  - [[docs/conventions/session-exists-is-not-identity]] — ใช้ `sessionUserId()` ห้าม cast
  - [[docs/conventions/value-fate-decided-at-write-site]] — ส่งค่าเข้าไป ≠ ค่าถูกเก็บ
  - [[docs/conventions/hook-return-identity-in-deps]] — ค่าที่ hook คืนทั้งก้อนห้ามใส่ deps
  - [[docs/conventions/measurement-must-not-decide-what-it-measures]] — วัด DOM แล้วเปลี่ยนตัวที่วัด = วนไม่หยุด
  - [[docs/conventions/component-declared-in-render]] — ห้ามประกาศ component ในตัว render
  - [[docs/conventions/mutation-silence-means-weak-corpus]] — mutation แล้วยังเขียว = input อ่อน
  - [[docs/conventions/oauth-signup-unique-collisions]] — P2002 ตอนสมัคร OAuth ต้องแยกตามคอลัมน์
  - [[docs/conventions/permission-gate-follows-the-row]] — ปิดสิทธิ์ข้อมูลไล่ตามแถวไม่ใช่ตามจอ · พารามิเตอร์สิทธิ์ห้าม default เปิด
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

ประวัติทั้งหมด (มติที่ห้ามกลับ · กับดัก · carry ของแต่ละรอบ) → [[docs/claude/state-snapshots]] — 🛑 ก่อนแตะฟีเจอร์ไหนให้ grep ชื่อฟีเจอร์/เลข feature ในไฟล์นั้นก่อน · snapshot ใหม่ต่อท้ายไฟล์นั้น แล้วเพิ่มบรรทัดเดียวที่นี่

- **2026-09-14 (00018-ext):** ห้องแชท delta + client store — branch `feat/chat-instant-render-delta` ยังไม่ merge · browser QA ยังไม่ทำ
- **2026-09-30 (00067):** แท็บการเงินร้านบริการ 3 แท็บ — prod (PR #87/#88) · 2026-10-02 ถอนกติกาออกจากร้านที่ไม่ใช่บริการ · 🛑 `npm test` ในเครื่องชี้ Supabase prod ต้อง override `DATABASE_URL` เป็น 5434
- **2026-10-09 (00019-ext-mem):** ความจำของแชท + สินค้าที่สนใจ (Typhoon ร้านนำร่องเท่านั้น) — PR นี้ · 🛑 browser QA ยังไม่ทำ (checklist ใน retro) · ไม่มี retention (R-M2)
- **2026-10-10 (00071 P1):** การเงินเต็มเห็นเฉพาะเจ้าของร้าน — SSOT `src/lib/shop-permissions.ts` · ธง `staffCanViewFinance` ไม่มีผลแล้ว · ไม่มี migration · 🛑 browser QA ยังไม่ทำ
- **2026-10-10 (00071 P2+P3):** 5 บทบาทถือหลายบทบาทได้ + ทุก route ประกาศ capability (`src/lib/route-capabilities.ts`) — branch `feat/00071-p2-roles` ยังไม่ push · มี migration (HR15) · 🛑 browser QA ยังไม่ทำ

Safety checkpoint: `git checkout pre-paces-wipe` restores the pre-2026-04-13 state.

@AGENTS.md

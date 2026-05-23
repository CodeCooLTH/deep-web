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
| 6 | Reference ที่ user ส่ง: แยก 2 ชั้น — **asset/content ใช้ตาม ref (ห้าม redesign/ทิ้งเอง)**, **layout/integration ต้องตาม theme ปัจจุบัน** (ห้ามแปะ layout ดิบจน "ดูเป็นตัวอย่าง"). ไม่ชัดส่วนไหนเป็นไหน → ถาม user ก่อน build | `ui-theme-sourcing` (reviewer gate) | `docs/conventions/reference-vs-theme-source.md` |

Subagents: `safepay-product` `safepay-planner` `safepay-ux` `safepay-database` `safepay-developer` `safepay-reviewer` `safepay-security` `safepay-qa` `safepay-docs` (ทุกตัว Sonnet; Controller = main session). `safepay-ux` = ออกแบบ UX/UI (read-only Design Spec) invoke ก่อน developer สำหรับ UI task ไม่ trivial. Feature เต็มรูป (7-phase) ดู skill `agent-team-feature`.

---

## Project Overview

SafePay เป็นระบบสร้างความน่าเชื่อถือสำหรับการซื้อขายออนไลน์ ผ่านระบบ Verify ตัวตน, Trust Score, Badge และ Order History เพื่อแก้ปัญหามิจฉาชีพ

## Key Documents

- **PRD:** `docs/PRD.md`
- **UI Guideline (must-read before ANY Frontend work):** `docs/system/ui-guideline/README.md` — entry hub (universal theme-copy rule + checklist + workflow + commit rule). Role docs: `customer/`, `seller/`, `admin/` page-sourcing.md
- **Conventions:**
  - `docs/conventions/rsc-mui-navigation.md` — RSC + MUI + next/link pattern
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
- **Auth:** NextAuth.js v4 (Facebook OAuth + Phone OTP via CredentialsProvider)
- **Validation:** Valibot (backend/API), Yup (frontend react-hook-form)
- **Form:** React Hook Form + `@hookform/resolvers`
- **Icons:** `@iconify/react` (on-demand) — use tabler icon names (e.g. `tabler-phone-check`)
- **Charts:** ApexCharts, ECharts, Chart.js (wrappers in `src/components/wrappers/`)
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
│   │   └── admin/             # admin auth + (partial) dashboard
│   └── api/                   # Backend — unified across subdomains
├── @core/, @layouts/, @menu/  # Vuexy theme engine (copied from theme/vuexy)
├── assets/, components/,      # Paces scaffolds (copied from theme/paces)
│   config/, context/, hooks/,
│   layouts/, utils/
├── lib/                       # auth, prisma, otp, storage, subdomain, validations,
│                              #   sms, sms-unlock-cookie, sms-consume-rl
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

Safety checkpoint: `git checkout pre-paces-wipe` restores the pre-2026-04-13 state.

@AGENTS.md

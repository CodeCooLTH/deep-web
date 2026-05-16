# Customer (Buyer + Landing + Public) — Page Sourcing

> Scope: `src/app/(marketing)/**` — **Vuexy** theme (MUI + Emotion + Tailwind).
> อ่าน [`../README.md`](../README.md) ก่อนเสมอ (universal rule + checklist + workflow).

Theme source root: `theme/vuexy/typescript-version/full-version/src/`

## Page-type → theme file mapping (Vuexy, buyer side)

| SafePay page | Vuexy source to copy | Notes |
|---|---|---|
| `/auth/sign-in` | `src/views/pages/auth/LoginV1.tsx` + `AuthIllustrationWrapper.tsx` | Strip Google/Twitter/GitHub, keep Facebook |
| `/auth/sign-up` | `src/views/pages/auth/RegisterV1.tsx` | Add username field + debounced check |
| `/auth/verify-otp` | `src/views/pages/auth/TwoStepsV1.tsx` | Uses `input-otp` — install if missing |
| Authed app shell (buyer) | `src/app/[lang]/(dashboard)/(private)/layout.tsx` + `VerticalLayout` + `Navigation` + `Navbar` + `Footer` | Copy the whole shell, strip i18n dep |
| `/dashboard` (buyer home) | `src/app/[lang]/(dashboard)/(private)/apps/ecommerce/dashboard/page.tsx` + `src/views/apps/ecommerce/dashboard/*` | Keep Grid; map widgets to trust data |
| `/orders` (buyer list) | `src/app/[lang]/(dashboard)/(private)/apps/ecommerce/orders/list/page.tsx` + `OrderListTable.tsx` | Buyer-side columns |
| `/reviews` | `src/app/[lang]/(dashboard)/(private)/apps/ecommerce/manage-reviews/*` | Filter to reviews authored by user |
| `/settings/profile` | `src/views/pages/account-settings/account/AccountDetails.tsx` | Strip billing/security tabs, keep account |
| `/settings/verification` | **Compose from** `src/views/pages/account-settings/security/*` (card + upload patterns) | No direct template — use account-settings card primitives |
| `/u/[username]` | `src/views/pages/user-profile/*` (UserProfileHeader + AboutOverview) | Strip teams/connections |
| `/o/[token]` | `src/views/apps/invoice/preview/PreviewCard.tsx` + `TwoStepsV1` for OTP | Order card + OTP input |

## หมายเหตุ Vuexy

- ขอบเขต `(marketing)/**` เป็นที่เดียวที่อนุญาต MUI + Emotion — buyer/landing/public ใช้ Vuexy ตามมติ 2026-04-18 (ดู memory `feedback_theme_rules.md`)
- `Date` ที่ข้าม RSC → client component ต้อง `.toISOString()` ที่ server boundary ก่อนเสมอ
- tanstack-table v8 ที่ copy มาจาก Vuexy ต้องเติม `filterFns: {}` ใน `useReactTable` (theme เขียนกับ minor version เก่า)
- buyer ฝั่งนี้ผ่าน rework R1–R11 แล้ว (ดู `docs/retro/2026-04-18-r1-r11-retrospective.md`) — ใช้หน้าที่มีเป็น reference ของ pattern ที่ถูกต้อง

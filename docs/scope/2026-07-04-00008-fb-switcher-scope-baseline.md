# Scope Baseline — feat 00008 ส่วนขยาย: FB-style Account Switcher

- **วันที่:** 2026-07-04
- **Parent feature:** 00008 — Business Account & Packages
- **ประเภท:** ส่วนขยาย UX (redesign switcher เดิม + additive session fields) — ไม่ใช่ feature ใหม่
- **Surface:** seller Paces (`(paces)/**`) เท่านั้น
- **Spec:** `docs/superpowers/specs/2026-07-04-seller-account-switcher-fb-style-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-04-seller-account-switcher-fb-style.md`
- **Mockup:** `docs/superpowers/specs/2026-07-04-seller-account-switcher-fb-style.html`
- **Branch:** `feat/seller-account-switcher-fb`

## Goal
ปรับ profile dropdown มุมขวาบนของ seller ให้เป็น pattern Facebook (active account boxed + list บัญชีอื่นพร้อมโลโก้) และให้ active business สะท้อน logo+ชื่อ ที่ topbar button + sidebar brand + sidebar user block. ตัด tier/trust score ออกให้สะอาดแบบ FB.

## Scope items (S-id → commit)

| S-id | รายการ | ไฟล์ | commit |
|---|---|---|---|
| S-1 | Session เติม `activeShopKind/Name/Logo` (query shop เมื่อ active เป็น BUSINESS + re-verify) | `src/lib/auth.ts` | `153e809` (+ hardening `feat/..deletedAt filter`) |
| S-2 | Context API คืน `logo` ต่อ business (switcher list) | `src/app/api/business/context/route.ts` | `324e448` |
| S-3 | Topbar profile button + FB dropdown (active box + list + renderAvatar; ตัด tier/trust) | `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx` | `3709553` |
| S-4 | Sidebar brand สะท้อน active business (SidebarBrand 2-variant logo-lg/logo-sm) | `src/components/SidebarBrand.tsx`, `src/layouts/components/Sidenav/index.tsx` | `bdda698` |
| S-5 | Sidebar user block สะท้อน active account | `src/layouts/components/Sidenav/components/UserProfileSettings.tsx` | `332dae2` |

## Out of scope
- Buyer Vuexy (ไม่แตะ)
- สร้าง/จัดการ business account (มี `/business` อยู่แล้ว)
- Logic การสลับ (`handleSwitch`/switch-context/`update()`/`router.refresh()`) — คงเดิม
- tier/trust score ใน dropdown (ตัดออกตาม request)
- upload โลโก้ร้าน (ใช้ field `Shop.logo` ที่มีอยู่แล้ว)

## Gate status
- Gate 1 (agent-team): safepay-ux ✓ · developer (Controller) ✓ · reviewer 8-gate ✓ (หลังแก้ Base line + baseline นี้) · security PASS (แก้ 1 Low finding) ✓ · QA ⏳ (รอ user dev server)
- No migration · No env change · No schema.prisma change

## Carry / tech-debt (nice-to-have — ไม่ block)
- extract `<AccountAvatar>` shared component (logic renderAvatar/fallback ซ้ำ 3 ไฟล์)
- shared `SellerSessionUser` type ใน `src/types/` แทน `(session as any).user` inline cast 3 จุด (pre-existing pattern)

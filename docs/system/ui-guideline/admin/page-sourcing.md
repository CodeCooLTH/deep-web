# Admin — Page Sourcing

> Scope: `src/app/(paces)/admin/**` — **Paces** theme (Preline 4 + Tailwind 4, **no MUI**).
> อ่าน [`../README.md`](../README.md) ก่อนเสมอ (universal rule + checklist + workflow).
> หมายเหตุโครงสร้าง Paces (auth variants, shell bundle, useAuth, route groups) อยู่ใน [`../seller/page-sourcing.md`](../seller/page-sourcing.md) — ใช้ร่วมกัน.

Theme source root: `theme/paces/Admin/TS/src/`

## Page-type → theme file mapping (Paces, admin)

| SafePay page | Paces source to copy | Notes |
|---|---|---|
| **Admin auth layout** | `app/layout.tsx` + `app/(admin)/layout.tsx` | เหมือน seller auth layout — admin auth routes render เปล่า (ไม่มี sidebar) |
| `/admin/auth/sign-in` | `app/auth/(basic)/sign-in/page.tsx` + `app/auth/(basic)/sign-in/components/Form.tsx` | เหมือน seller sign-in. admin ใช้ phone+OTP ไม่ใช่ password — adapt Form เป็น phone+OTP |
| `/admin/auth/verify-otp` | `app/auth/(basic)/two-factor/page.tsx` | เหมือน seller verify-otp |

## หน้า admin ที่ on-theme แล้ว (P2 — reference)

หน้าเหล่านี้ rework แล้วใน P2 (ดู `docs/retro/2026-04-18-p2-admin-retrospective.md`) — ใช้เป็น reference ของ pattern Paces admin ที่ถูกต้อง:

- `/admin/dashboard` — Base: `theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx`
- `/admin/users` — Base: `theme/paces/Admin/TS/.../apps/users/contacts/page.tsx`
- `/admin/verifications` + `/admin/verifications/[id]` — Base: `.../apps/issue-tracker/`
- `/admin/orders`, `/admin/badges` — same-theme Paces pattern (อ้างหน้า Paces ในโปรเจกต์เอง)
- `/admin/(dashboard)/layout.tsx` — same-theme Paces VerticalLayout

## ยังไม่มี Paces base สำหรับ admin dashboard variant อื่น

ปัจจุบัน admin มี dashboard (ecommerce variant) แล้ว. ถ้าจะเพิ่ม admin dashboard แบบ analytics/overview ภายหลัง ให้ใช้ `app/(admin)/dashboard/analytics/page.tsx` เป็น base.

## สถานะปัจจุบัน

admin auth (sign-in + verify-otp + auth layout) ยัง off-theme — ต้อง re-source ตามตารางด้านบน. ส่วน dashboard/users/verifications/orders/badges on-theme แล้ว.

# Retro — Seller Auth P2 (Auth Pages UI) + P3 (Onboarding Modal)

> SIGNED-OFF 2026-06-16 · commits a177b91..582ee4a · baseline `docs/scope/2026-06-16-seller-auth-scope-baseline.md`

## Problems

1. **Stale Prisma client ใน dev server ที่รันยาว → session/route 500 หลัง migration** (เสียเวลา debug มากสุด)
   - หลัง P1 migration (`Shop.slug`) + `prisma generate`, dev server ที่ user รันค้างไว้ยัง **โหลด client เก่าใน memory** (Next.js hot-reload ไม่ reload `node_modules/@prisma/client`).
   - อาการ: `GET /api/auth/session` คืน `{}` ทุก authenticated user (session callback `select: { shop: { slug } }` throw), `GET /api/shops/check-slug?slug=<valid>` → **500** (เจอ `prisma.shop.findUnique({where:{slug}})`), slug/product POST → 401. แต่ `check-slug?slug=admin` → 200 (reserved-return ก่อน query) = เบาะแสว่า client ไม่รู้จัก field `slug`.
   - evidence: node script (spawn fresh client) ทำงานปกติ (slug set + product + needsOnboarding flips false); route ใน dev server เก่า fail. **restart dev server → ทุกอย่าง 200** (E2E ผ่าน real route).

2. **`react-toastify` ใน comment trip grep gate (ซ้ำ 3 รอบ)** — dev เขียน "ห้าม react-toastify" ใน doc-comment → `rg "react-toastify" src/app/(paces)/` คืน >0 = gate fail แม้ไม่มี import จริง.

3. **layout card mobile "เพี้ยน"** — ใช้ Base `auth/card` (card box ลอยกลางพื้นเทา) → user ไม่ชอบบน mobile; ขอ `auth/split` (ฟอร์มเต็มจอ).

4. **Hard Rule 6 select กำกวม** — ชี้ `ui/dropdowns/page.tsx` แต่ไฟล์นั้นมีแต่ hs-dropdown (action menu) ไม่มี form-select; form-select จริงอยู่ `form/elements`.

## Root causes

1. **dev server เป็น process ยาว + Next.js hot-reload ไม่ครอบ `@prisma/client`** (cached ใน Node module registry). `prisma generate` เขียน disk แต่ memory ยังเก่า. → **กฎ: หลัง migrate + generate ต้อง restart dev server เสมอ ก่อน QA route/session ที่แตะ column ใหม่.** ต่อยอด [[project_prisma_migration_env_targets]].
2. grep gate จับ substring ไม่แยก comment/code → ห้ามพิมพ์ token ต้องห้ามแม้ใน comment.
3. card variant = always-boxed; split variant = `min-w-full ... rounded-none min-h-screen` (mobile เต็มจอ). เลือก variant ตาม mobile behavior ที่ต้องการ.
4. Hard Rule 6 เขียนรวม form-select กับ dropdown ผิดไฟล์.

## Conventions to adopt

1. **หลัง `prisma migrate` + `prisma generate` → บอก user restart dev server (หรือ restart เอง ถ้าคุม) ก่อน QA HTTP route/session ที่ query column ใหม่.** อาการ stale client: session คืน `{}` หลัง callback 200, route ที่ query column ใหม่ → 500, แต่ path ที่ return ก่อน query → 200. (เพิ่มใน [[project_prisma_migration_env_targets]])
2. **ห้ามพิมพ์ token ที่ grep gate แบน (`react-toastify`) แม้ใน comment** — phrase แทน เช่น "ใช้ pacesToast (Hard Rule 9)". reviewer/Controller grep ก่อน commit เสมอ.
3. **mobile auth = `auth/split` (ฟอร์มเต็มจอ) ไม่ใช่ `auth/card` (boxed)** — split: form panel `min-w-full md:min-w-106` + `card rounded-none min-h-screen`, image `hidden md:block`.
4. **Hard Rule 6 split: form-select (field) ← `form/elements/InputTextfieldType.tsx`; hs-dropdown (action menu) ← `ui/dropdowns`** (ดู [[feedback_paces_form_select_vs_dropdown]]).

## What went right (anchor)

- **E2E ผ่าน real HTTP routes + simulated SMS** (test-bypass phone `0000000009` dev-only) — signup→callback→session needsOnboarding→slug→product→needsOnboarding=false; พิสูจน์ flow จริงเหนือ unit test; cleanup ทุก test account (Supabase = prod แชร์).
- **sessionStorage handoff (OQ-1)** — password ไม่อยู่ใน URL (signup→verify-otp ผ่าน `signupDraft`; reset→new-pass ผ่าน `resetDraft`); locked contract ใน prompt ทั้งสองฝั่ง → key/shape ตรงกันไม่มี drift.
- **double-consume guard** — verify-otp `mode=reset` ไม่ verify OTP (consume ที่ set-password ที่เดียว) — Controller จับตอนเขียน spec ก่อน dev.
- **controlled-React-state modal (BulkSmsConfirmDialog pattern)** ไม่ใช่ Preline hs-overlay → ไม่ re-render พัง.
- **safepay-ux gate ทุก phase** จับ select rule + เสนอ split layout ตาม user feedback; theme-copy (HR1) ทุกหน้ามี Base: line.
- **stage per-file ทุก commit** — parallel stream (order-detail) ไม่ปนเข้า commit P2/P3.

## Action items

1. ✅ restart dev server → E2E ผ่าน (user ทำแล้ว).
2. ⏭️ **Visual mobile QA (375px)** หน้า auth split + onboarding modal — รอ Chrome MCP reconnect (E2E route ผ่านแล้ว; visual = carry).
3. ⏭️ **PRD FR-1/U-1 doc-sync** (`safepay-docs`) — "ไม่มี Email+Password ใน MVP" ขัด seller-credentials.
4. ⏭️ **FB prod creds** (OOS-4, Ops) — ปุ่ม Facebook build แล้ว แต่ prod ใช้ไม่ได้จนกว่าจะใส่ creds.
5. ⏭️ Hardening (accepted-risk): Redis OTP/rate-limit, provider:username rate-limit key, per-phone throttle set-password.
6. ⏭️ ลบ test phone `0000000009` ออกจาก `otp.ts` ก่อน/ตอน deploy ถ้าไม่ต้องการ (prod = {} อยู่แล้ว → ไม่กระทบ prod; เก็บไว้ช่วย QA ได้).

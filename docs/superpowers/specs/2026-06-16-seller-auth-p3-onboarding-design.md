# Seller Auth P3 — Onboarding Modal UX Design Spec (safepay-ux gate)

> 2026-06-16 · modal stepper เด้งบน `/dashboard` เมื่อ `session.user.needsOnboarding` · ref images `docs/superpowers/specs/assets/2026-06-16-onboarding-ref/` (IA ตาม ref, **skin Paces น้ำเงิน**) · mobile-first · pacesToast (HR9).

## Controller decisions (OQ resolved)
- **OQ-1 step indicator:** dot-only (`div size-2 rounded-full` — active `bg-primary`, ผ่าน `bg-primary/50`, ยังไม่ถึง `bg-default-300`), ไม่ใช้ wizard strip (กว้างเกินใน modal).
- **OQ-2/OQ-5 gate refresh:** `needsOnboarding` (session) = source of truth. หลัง set slug → `useSession().update()` ให้ session callback re-compute → modal หยุดเด้ง. dismiss = component state (เด้งซ้ำรอบ dashboard ถัดไปถ้ายัง needsOnboarding).
- **OQ-3 ✕ mid-process:** ปิดเลย ไม่มี confirm (เด้งซ้ำรอบหน้า) — keep simple.
- **OQ-4 price:** **required** (`/api/products` `CreateProductSchema.price` = number ≥0.01). label ไม่ใส่ "(ไม่บังคับ)". รูป = optional.

## Mount & gate (S-P3-2)
- `dashboard/page.tsx` (RSC) อ่าน session → ส่ง `needsOnboarding`, `shopSlug` ลง client `<OnboardingModal needsOnboarding shopSlug isFacebookNoPhone? />`.
- `needsOnboarding && !dismissed` → เปิด modal. ปิด/✕ → component state `dismissed=true` (เด้งซ้ำรอบ navigation ถัดไป).
- **Controlled React-state modal** (copy pattern จาก `src/app/(paces)/seller/(dashboard)/orders/components/BulkActionBar.tsx` → `BulkSmsConfirmDialog`; **ห้าม** Preline `hs-overlay` — re-render พัง). backdrop `bg-dark/40 size-full fixed top-0 start-0 z-80`; card `w-[calc(100%-24px)] max-w-sm mx-auto`, `card-body overflow-y-auto max-h-[85dvh]`.

## Modal shell (S-P3-2)
- บนสุด: step dots (centered `flex justify-center gap-1.5`) + `✕` (มุมขวา, `Icon icon="x"`, `dismiss`).
- `← ย้อนกลับ` (`btn text-default-600 hover:text-primary` + `tabler:arrow-left`) — ซ่อน step welcome(+phone); แสดง step 2-4.
- footer: **CTA primary เต็มกว้าง** `btn bg-primary text-white hover:bg-primary-hover w-full` + ลิงก์ `ข้าม` (`text-sm text-default-500 w-full text-center`) — ซ่อนบน slug step (บังคับ) + phone-verify.
- step state: `useState(currentStep)` (pattern จาก `theme/paces/.../form/wizard/components/WizardWithValidation.tsx` แต่ใช้ dot-only).
- loading ปุ่ม: `tabler:loader-2 animate-spin` + `disabled opacity-50`.

## Steps (ลำดับ)
**0. Verify Phone (เฉพาะ FB user ไม่มีเบอร์ — S-P3-7):** sub-phase `input`→`otp` (local state). icon `tabler:phone` วงกลม `bg-primary/10`. กรอกเบอร์ → `POST /api/otp/send {contact,type:'PHONE'}` → 6 OTP box (`form-input-sm`, pattern จาก P2 verify-otp) + countdown 60s → `signIn('phone-otp',{phone,otp,mode:'signin',redirect:false})` (verify L1) → ไป step 1. ซ่อนปุ่มย้อนกลับ/ข้าม.

**1. Welcome (S-P3-3):** icon `tabler:rocket` วงกลม size-16 `bg-primary/10`. "ยินดีต้อนรับสู่ Deep" / "เริ่มต้นร้านของคุณใน 4 ขั้นตอนง่ายๆ". **3 mini-card** `grid grid-cols-3 gap-2`, แต่ละอัน `.card border border-dashed border-default-300 p-3 text-center` + icon วงกลม `size-8 bg-primary/10`: (shield-check "Trust Score" "สร้างความน่าเชื่อถือจากการขายจริง") (user-check "ยืนยันตัวตน" "ปลอดภัย ซื้อขายอุ่นใจ") (shopping-bag "เริ่มขายได้ทันที" "สร้างสินค้าแรกใน 1 นาที"). CTA "ลุยเลย →" + "ข้ามไปก่อน".

**2. Category chips (S-P3-4):** "เลือกหมวดหมู่ร้านของคุณ" / "เลือก 1 หมวดที่ตรงกับสินค้าของคุณมากที่สุด". `flex flex-wrap gap-2` ของ 10 chip จาก `SHOP_CATEGORY_LABELS` — แต่ละ chip = `<button>` (Base: `theme/paces/.../ui/badges/page.tsx` pill badge): ปกติ `badge border border-default-300 text-default-700 rounded-full cursor-pointer hover:border-primary hover:text-primary`; selected `badge bg-primary text-white border-primary rounded-full inline-flex items-center gap-1` + `tabler:check size-3`. เลือก 1. CTA "ถัดไป →" + "ข้าม". (เก็บ category ไว้ submit ตอน slug step หรือแยก — ดู API หมายเหตุ)

**3. Slug (บังคับ — S-P3-5):** "ตั้ง URL ร้านของคุณ" / "ลูกค้าจะค้นหาร้านคุณผ่านลิงก์นี้". `form-input` + client-validate `isValidSlugFormat`/`isReservedSlug` (จาก `src/lib/shop-slug.ts`) ก่อน → debounce 400ms `GET /api/shops/check-slug?slug=` → inline status (กำลังตรวจสอบ/✓ URL นี้ว่างอยู่/✕ มีคนใช้แล้ว/✕ ไม่ถูกต้อง/✕ ใช้ไม่ได้). preview `deepthailand.app/{slug}` (`text-sm text-primary`, path ใช้ `font-mono`). hint "ใช้ a-z, 0-9, ขีดกลาง 3-30 ตัว". CTA "ถัดไป →" **disabled จน available**; **ไม่มีปุ่มข้าม**. กด → `POST /api/shops/slug {slug}` (+category ถ้ายังไม่ save) → ok → ไป step 4.

**4. First product (ข้ามได้ — S-P3-6):** "สร้างสินค้าแรกของคุณ". `name` (form-input, required), `price` (input-group `฿` prefix, number, **required** ≥0.01), `image` (file input optional, Base: AddCategoryModal file pattern). CTA "สร้างสินค้าเลย" → `POST /api/products {name, price:Number, type:'PHYSICAL'}` → ok → จบ; "ข้ามไปก่อน เพิ่มทีหลังได้" → จบ. error → `pacesToast.error`. → **จบ:** `await update()` (session) + `setOpen(false)` → dashboard เต็ม.

## API routes (S-P3-1)
- `GET /api/shops/check-slug?slug=` (template: `src/app/api/users/check-username/route.ts`): normalizeSlug → ถ้า `!isValidSlugFormat` → `{available:false,reason:'invalid'}`; `isReservedSlug` → `{...'reserved'}`; `prisma.shop.findUnique({where:{slug}})` มี → `{...'taken'}`; ไม่มี → `{available:true}`. (ใช้ helper จาก `src/lib/shop-slug.ts`)
- `POST /api/shops/slug {slug}`: `getServerSession(authOptions)` → ต้อง login; หา shop ของ user (`prisma.shop.findUnique({where:{userId}})`); `setShopSlug(shop.id, slug)` (จาก shop.service S-P1-6) → 200 `{ok:true}`; ถ้า `SLUG_UNAVAILABLE` → 409; ไม่มี shop → 404. guardApi (proxy) ครอบ CSRF+RL อยู่แล้ว. + optional: รับ `category?` เพื่อ set shop.category พร้อมกัน (หรือแยก endpoint — dev เลือก; ง่ายสุด = รับ category ใน POST /api/shops/slug ด้วย แล้ว update ทั้งคู่).

## Theme Source Mapping
| Section | Base |
|---|---|
| Modal shell/backdrop | `src/app/(paces)/seller/(dashboard)/orders/components/BulkActionBar.tsx` (BulkSmsConfirmDialog controlled pattern) + `theme/paces/.../apps/ecommerce/categories/components/AddCategoryModal.tsx` |
| Step state | `theme/paces/.../form/wizard/components/WizardWithValidation.tsx` (state only, dot-only visual) |
| Chips / mini-card / dots | `theme/paces/.../ui/badges/page.tsx` (badge pill + dot) |
| Slug input/status | `docs/system/ui-guideline/paces-component-reference.md` §4 (form-input, is-valid/invalid) |
| Product file input | `theme/paces/.../apps/ecommerce/categories/components/AddCategoryModal.tsx` (file:* classes) |
| Toast | `src/lib/paces-toast.ts` |

icons (tabler): `x`, `arrow-left`, `rocket`, `shield-check`, `user-check`, `shopping-bag`, `check`, `phone`, `circle-check`, `circle-x`, `loader-2`.

## Edge / Mobile
- slug taken/reserved/invalid → inline `text-danger text-xs` + `is-invalid`; next disabled.
- category ข้ามได้ (next enable เสมอ).
- product API error → toast, modal คงเปิด.
- ปิด modal ก่อน slug → เด้งซ้ำรอบหน้า.
- mobile: card `w-[calc(100%-24px)] max-w-sm`, ปุ่ม `w-full` (tap ≥44px), chips `flex-wrap`, `card-body overflow-y-auto max-h-[85dvh]` กัน keyboard overlap.

## QA (P3)
mobile 375px + flow: needsOnboarding → modal → (FB:phone) → welcome → category → slug(บังคับ) → product(ข้าม) → dashboard. seed seller needsOnboarding (test acct ที่ยังไม่มี slug).

# Seller Auth P1 — Backend/Security Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: ใช้ project workflow `agent-team-phase` (safepay-developer → safepay-reviewer → safepay-security → Controller) — P1 แตะ auth/password/env จึง **บังคับ safepay-security review** ก่อน mark complete. Steps ใช้ checkbox (`- [ ]`).

**Goal:** วางฐาน backend/security ให้ seller login ด้วย username+password, ตั้ง password ตอน signup (ยัง verify ด้วย phone OTP), reset password via OTP, มี `Shop.slug` + category constant, และ session บอก `needsOnboarding` — โดยไม่กระทบ buyer (Vuexy) auth.

**Architecture:** เพิ่ม pure helpers ที่ test ได้ (`shop-categories`, `shop-slug`, `password`) แล้วให้ provider/route/serviceเรียกใช้ (DRY). NextAuth เพิ่ม provider `seller-credentials` + ขยาย `phone-otp` signup. Valibot สำหรับ validate. bcryptjs hash. Migration เพิ่มคอลัมน์ `Shop.slug` แบบ nullable (ปลอดภัยกับ row เดิม).

**Tech Stack:** Next.js 16, NextAuth v4, Prisma/PostgreSQL, Valibot, bcryptjs, Vitest.

Ref spec: `docs/superpowers/specs/2026-06-16-seller-auth-redesign-onboarding-design.md`

---

## File Structure (P1)

| File | Responsibility |
|---|---|
| `src/lib/shop-categories.ts` (create) | SHOP_CATEGORIES keys + Thai labels + `isShopCategory()` |
| `src/lib/shop-slug.ts` (create) | `normalizeSlug()`, `isValidSlugFormat()`, `isReservedSlug()` (pure) |
| `src/lib/password.ts` (create) | `isStrongPassword()`, `hashPassword()`, `verifyPassword()` (bcryptjs + length guard) |
| `src/lib/validations.ts` (modify) | `PasswordSchema`, `ShopSlugSchema`, `ShopCategorySchema`, `SetPasswordSchema`; CreateShopSchema.category → picklist |
| `prisma/schema.prisma` (modify) | `Shop.slug String? @unique` |
| `src/services/shop.service.ts` (modify) | `isSlugAvailable()`, `setShopSlug()` |
| `src/app/api/users/check-phone/route.ts` (create) | GET `?phone=` → `{ available }` (signup dedupe, guardApi-protected) |
| `src/app/api/account/set-password/route.ts` (create) | POST `{phone,otp,password}` → verify OTP → set passwordHash |
| `src/lib/auth.ts` (modify) | provider `seller-credentials`; phone-otp signup รับ password+category; session `needsOnboarding`/`shopSlug` |

---

## Task 1: Shop category constant

**Files:**
- Create: `src/lib/shop-categories.ts`
- Test: `src/lib/shop-categories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shop-categories.test.ts
import { describe, it, expect } from 'vitest'
import { SHOP_CATEGORY_KEYS, SHOP_CATEGORY_LABELS, isShopCategory } from './shop-categories'

describe('shop-categories', () => {
  it('has 10 keys with a Thai label each', () => {
    expect(SHOP_CATEGORY_KEYS.length).toBe(10)
    for (const k of SHOP_CATEGORY_KEYS) {
      expect(typeof SHOP_CATEGORY_LABELS[k]).toBe('string')
      expect(SHOP_CATEGORY_LABELS[k].length).toBeGreaterThan(0)
    }
  })
  it('isShopCategory accepts known keys and rejects others', () => {
    expect(isShopCategory('fashion')).toBe(true)
    expect(isShopCategory('other')).toBe(true)
    expect(isShopCategory('nope')).toBe(false)
    expect(isShopCategory('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/shop-categories.test.ts`
Expected: FAIL — "Failed to resolve import './shop-categories'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shop-categories.ts
// หมวดร้าน seller (constant — ไม่ใช่ DB enum เพื่อปรับ label ง่าย). ใช้ทั้ง validation,
// signup dropdown, onboarding chips, public profile, filter. ปรับ label ได้ตามต้องการ.
export const SHOP_CATEGORY_LABELS = {
  general: 'ทั่วไป',
  fashion: 'แฟชั่น-เครื่องแต่งกาย',
  beauty_health: 'ความงาม-สุขภาพ',
  food_beverage: 'อาหาร-เครื่องดื่ม',
  electronics_it: 'อิเล็กทรอนิกส์-ไอที',
  home_living: 'บ้าน-เฟอร์นิเจอร์',
  mom_baby: 'แม่-เด็ก',
  agri_otop: 'เกษตร-OTOP',
  services_digital: 'บริการ-ดิจิทัล',
  other: 'อื่นๆ',
} as const

export type ShopCategoryKey = keyof typeof SHOP_CATEGORY_LABELS
export const SHOP_CATEGORY_KEYS = Object.keys(SHOP_CATEGORY_LABELS) as ShopCategoryKey[]

export function isShopCategory(value: string): value is ShopCategoryKey {
  return value in SHOP_CATEGORY_LABELS
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/shop-categories.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop-categories.ts src/lib/shop-categories.test.ts
git commit -m "feat(seller/auth): shop category constant (P1)"
```

---

## Task 2: Slug utilities (pure)

**Files:**
- Create: `src/lib/shop-slug.ts`
- Test: `src/lib/shop-slug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shop-slug.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from './shop-slug'

describe('shop-slug', () => {
  it('normalizes to lowercase trimmed', () => {
    expect(normalizeSlug('  My-Shop  ')).toBe('my-shop')
  })
  it('validates format a-z0-9-, 3..30, no leading/trailing hyphen', () => {
    expect(isValidSlugFormat('myshop')).toBe(true)
    expect(isValidSlugFormat('my-shop-1')).toBe(true)
    expect(isValidSlugFormat('ab')).toBe(false)        // too short
    expect(isValidSlugFormat('-abc')).toBe(false)       // leading hyphen
    expect(isValidSlugFormat('abc-')).toBe(false)       // trailing hyphen
    expect(isValidSlugFormat('a_b')).toBe(false)        // underscore
    expect(isValidSlugFormat('a'.repeat(31))).toBe(false) // too long
  })
  it('flags reserved words', () => {
    expect(isReservedSlug('admin')).toBe(true)
    expect(isReservedSlug('auth')).toBe(true)
    expect(isReservedSlug('myshop')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/shop-slug.test.ts`
Expected: FAIL — cannot resolve './shop-slug'

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shop-slug.ts
// slug ของร้าน = public URL /{slug}. รูปแบบ a-z0-9-, 3–30 char, ห้าม leading/trailing hyphen.
// reserved = path ระบบที่ slug ห้ามชน (กัน /{slug} ทับ route จริง).
const RESERVED = new Set([
  'admin', 'api', 'auth', 'seller', 'u', 'o', 'www', 'app',
  'dashboard', 'onboarding', 'settings', 'wallet', 'products',
  'orders', 'verification', 'badges', 'notifications', 'topups',
])

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase()
}

export function isValidSlugFormat(slug: string): boolean {
  // 3–30 ตัว, ตัวแรก/ตัวท้ายเป็น a-z0-9, ตรงกลางมี hyphen ได้
  return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/shop-slug.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop-slug.ts src/lib/shop-slug.test.ts
git commit -m "feat(seller/auth): shop slug utils — format + reserved words (P1)"
```

---

## Task 3: Password utilities

**Files:**
- Create: `src/lib/password.ts`
- Test: `src/lib/password.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/password.test.ts
import { describe, it, expect } from 'vitest'
import { isStrongPassword, hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('requires >=8 chars with letter + number + special', () => {
    expect(isStrongPassword('Abcd123!')).toBe(true)
    expect(isStrongPassword('short1!')).toBe(false)     // < 8
    expect(isStrongPassword('abcdefgh')).toBe(false)    // no number/special
    expect(isStrongPassword('abcd1234')).toBe(false)    // no special
    expect(isStrongPassword('!!!!!!!!')).toBe(false)    // no letter/number
    expect(isStrongPassword('a'.repeat(1001) + '1!')).toBe(false) // > 1000 guard
  })
  it('hashes and verifies round-trip', async () => {
    const hash = await hashPassword('Abcd123!')
    expect(hash).not.toBe('Abcd123!')
    expect(await verifyPassword('Abcd123!', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/password.test.ts`
Expected: FAIL — cannot resolve './password'

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/password.ts
// รหัสผ่าน seller: ≥8, มีตัวอักษร+ตัวเลข+อักขระพิเศษ. hash ด้วย bcryptjs.
// max 1000 char = กัน bcryptjs CPU DoS (pure-JS process ทั้ง string ก่อน truncate 72 bytes)
// — pattern เดียวกับ admin-credentials ใน auth.ts
import bcrypt from 'bcryptjs'

const MAX_PASSWORD_LEN = 1000

export function isStrongPassword(pw: string): boolean {
  if (pw.length < 8 || pw.length > MAX_PASSWORD_LEN) return false
  const hasLetter = /[A-Za-z]/.test(pw)
  const hasNumber = /[0-9]/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  return hasLetter && hasNumber && hasSpecial
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10)
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  if (pw.length > MAX_PASSWORD_LEN) return false
  try {
    return await bcrypt.compare(pw, hash)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/password.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/password.ts src/lib/password.test.ts
git commit -m "feat(seller/auth): password utils — strength rule + bcrypt (P1)"
```

---

## Task 4: Valibot schemas

**Files:**
- Modify: `src/lib/validations.ts:11-31`
- Test: `src/lib/validations-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/validations-auth.test.ts
import { describe, it, expect } from 'vitest'
import * as v from 'valibot'
import { PasswordSchema, ShopSlugSchema, ShopCategorySchema, SetPasswordSchema } from './validations'

describe('auth validations', () => {
  it('PasswordSchema enforces strength', () => {
    expect(v.safeParse(PasswordSchema, 'Abcd123!').success).toBe(true)
    expect(v.safeParse(PasswordSchema, 'weak').success).toBe(false)
  })
  it('ShopSlugSchema enforces format', () => {
    expect(v.safeParse(ShopSlugSchema, 'my-shop').success).toBe(true)
    expect(v.safeParse(ShopSlugSchema, 'ab').success).toBe(false)
    expect(v.safeParse(ShopSlugSchema, 'Admin').success).toBe(false) // uppercase + reserved-after-normalize handled in service; format rejects uppercase
  })
  it('ShopCategorySchema is a picklist', () => {
    expect(v.safeParse(ShopCategorySchema, 'fashion').success).toBe(true)
    expect(v.safeParse(ShopCategorySchema, 'nope').success).toBe(false)
  })
  it('SetPasswordSchema validates phone+otp+password', () => {
    const ok = v.safeParse(SetPasswordSchema, { phone: '0812345678', otp: '123456', password: 'Abcd123!' })
    expect(ok.success).toBe(true)
    const bad = v.safeParse(SetPasswordSchema, { phone: 'x', otp: '12', password: 'weak' })
    expect(bad.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/validations-auth.test.ts`
Expected: FAIL — exports `PasswordSchema` etc. not found

- [ ] **Step 3: Write minimal implementation**

แก้ `src/lib/validations.ts` — เพิ่ม import + schemas ใหม่ (วางต่อจาก `VerifyOtpSchema` บล็อก, ก่อน `CreateShopSchema`):

```ts
import { SHOP_CATEGORY_KEYS } from "@/lib/shop-categories";
import { isStrongPassword } from "@/lib/password";
import { isValidSlugFormat } from "@/lib/shop-slug";

// รหัสผ่าน seller — ผูกกฎเดียวกับ isStrongPassword (SSOT)
export const PasswordSchema = v.pipe(
  v.string(),
  v.maxLength(1000),
  v.check((s) => isStrongPassword(s), "รหัสผ่านต้องมีอย่างน้อย 8 ตัว และมีตัวอักษร ตัวเลข และอักขระพิเศษ"),
);

// slug ร้าน — format เท่านั้น (reserved + uniqueness ตรวจที่ service layer)
export const ShopSlugSchema = v.pipe(
  v.string(),
  v.check((s) => isValidSlugFormat(s), "URL ร้านไม่ถูกต้อง (a-z, 0-9, - เท่านั้น 3–30 ตัว)"),
);

export const ShopCategorySchema = v.picklist(SHOP_CATEGORY_KEYS);

export const SetPasswordSchema = v.object({
  phone: v.pipe(v.string(), v.regex(/^0[0-9]{9}$/)),
  otp: v.pipe(v.string(), v.length(6)),
  password: PasswordSchema,
});
```

แล้วแก้ `CreateShopSchema.category` (บรรทัด 25) จาก free-text เป็น picklist:

```ts
  category: v.optional(ShopCategorySchema),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/validations-auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full test + type-check (ไม่ regress)**

Run: `npm test -- src/lib && npx tsc --noEmit`
Expected: PASS, tsc exit 0
หมายเหตุ: ถ้ามี caller เดิมส่ง `category` free-text เข้า CreateShopSchema → tsc/test จะจับ; ปรับ caller ให้ส่ง key. ตรวจ `rg "category:" src/app/api/shops src/services/shop.service.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations.ts src/lib/validations-auth.test.ts
git commit -m "feat(seller/auth): valibot schemas — password/slug/category/set-password (P1)"
```

---

## Task 5: Prisma migration — Shop.slug

**Files:**
- Modify: `prisma/schema.prisma:50-67` (Shop model)

- [ ] **Step 1: Add field**

ใน model Shop เพิ่มบรรทัด (ใต้ `category`):

```prisma
  slug         String?  @unique   // public shop URL /{slug}; nullable จนกว่าจะตั้งใน onboarding
```

- [ ] **Step 2: Create migration (ไม่ทำลายข้อมูล — nullable)**

Run: `dotenv -e .env.local -- npx prisma migrate dev --name add_shop_slug`
Expected: migration ใหม่ใน `prisma/migrations/*_add_shop_slug/`; `ADD COLUMN "slug" TEXT` + `CREATE UNIQUE INDEX`. ไม่มี data loss prompt.
หมายเหตุ DB: dev = Supabase ผ่าน `.env.local` (ดู memory project_dev_db_and_paces_pitfalls). อย่ารัน `prisma db pull`.

- [ ] **Step 3: Verify client + type-check**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: `Shop.slug` ปรากฏใน generated client; tsc exit 0

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(seller/auth): add Shop.slug unique column (P1)"
```

---

## Task 6: shop.service slug functions

**Files:**
- Modify: `src/services/shop.service.ts`
- Test: `src/services/__tests__/shop-slug.service.test.ts`

- [ ] **Step 1: Write the failing test** (mock prisma — pattern เดียวกับ service tests อื่น)

```ts
// src/services/__tests__/shop-slug.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { shop: { findUnique: vi.fn(), update: vi.fn() } },
}))
import { prisma } from '@/lib/prisma'
import { isSlugAvailable, setShopSlug } from '../shop.service'

describe('shop slug service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('isSlugAvailable false for reserved / invalid / taken', async () => {
    expect(await isSlugAvailable('admin')).toBe(false)     // reserved
    expect(await isSlugAvailable('ab')).toBe(false)        // invalid format
    ;(prisma.shop.findUnique as any).mockResolvedValue({ id: 'x' })
    expect(await isSlugAvailable('taken-shop')).toBe(false)
  })

  it('isSlugAvailable true when valid + free', async () => {
    ;(prisma.shop.findUnique as any).mockResolvedValue(null)
    expect(await isSlugAvailable('free-shop')).toBe(true)
  })

  it('setShopSlug throws on unavailable, updates on available', async () => {
    ;(prisma.shop.findUnique as any).mockResolvedValue(null)
    ;(prisma.shop.update as any).mockResolvedValue({ id: 's1', slug: 'free-shop' })
    await expect(setShopSlug('s1', 'free-shop')).resolves.toMatchObject({ slug: 'free-shop' })
    await expect(setShopSlug('s1', 'admin')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/services/__tests__/shop-slug.service.test.ts`
Expected: FAIL — exports not found

- [ ] **Step 3: Write minimal implementation** (เพิ่มท้าย `src/services/shop.service.ts`)

```ts
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from "@/lib/shop-slug";

/** slug ใช้ได้ไหม: format ถูก + ไม่ reserved + ไม่ถูกใช้ใน DB */
export async function isSlugAvailable(rawSlug: string): Promise<boolean> {
  const slug = normalizeSlug(rawSlug);
  if (!isValidSlugFormat(slug) || isReservedSlug(slug)) return false;
  const existing = await prisma.shop.findUnique({ where: { slug } });
  return existing === null;
}

/** ตั้ง slug ให้ shop — throw ถ้าไม่ available (กัน TOCTOU เบื้องต้น; unique index = guard ชั้นสุดท้าย) */
export async function setShopSlug(shopId: string, rawSlug: string) {
  const slug = normalizeSlug(rawSlug);
  if (!(await isSlugAvailable(slug))) {
    throw new Error("SLUG_UNAVAILABLE");
  }
  return prisma.shop.update({ where: { id: shopId }, data: { slug } });
}
```

หมายเหตุ: `prisma` import มีอยู่แล้วหัวไฟล์ — อย่า import ซ้ำ.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/services/__tests__/shop-slug.service.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/shop.service.ts src/services/__tests__/shop-slug.service.test.ts
git commit -m "feat(seller/auth): shop.service isSlugAvailable + setShopSlug (P1)"
```

---

## Task 7: check-phone route (signup dedupe)

**Files:**
- Create: `src/app/api/users/check-phone/route.ts`
- อ้าง pattern: `src/app/api/users/check-username/route.ts`

- [ ] **Step 1: Read the username route เป็น template**

Run: `cat "src/app/api/users/check-username/route.ts"`
จด: shape ของ response `{ available, reason? }`, การ guard input, runtime export.

- [ ] **Step 2: Write implementation**

```ts
// src/app/api/users/check-phone/route.ts
// GET ?phone=08xxxxxxxx → { available } — ใช้ตอน signup seller เพื่อกันส่ง OTP ไปเบอร์ที่มีบัญชีแล้ว
// rate-limit ผ่าน guardApi (proxy.ts ครอบ /api/* ยกเว้น /api/auth/*) — กัน phone enumeration brute (MVP tradeoff)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone") ?? "";
  if (!/^0[0-9]{9}$/.test(phone)) {
    return NextResponse.json({ available: false, reason: "invalid" }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { phone } });
  // ไม่ echo phone กลับ (PII) — client มีค่าอยู่แล้ว
  return NextResponse.json({ available: existing === null });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Manual verify (dev server รันโดย user ที่ port 4000)**

Run: `curl -s "http://seller.deepth.local:4000/api/users/check-phone?phone=0000000001"`
Expected: `{"available":false}` (test account มีในระบบ) — ถ้า dev server ไม่รันให้ข้าม, QA เก็บทีหลัง.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/users/check-phone/route.ts"
git commit -m "feat(seller/auth): GET /api/users/check-phone — signup dedupe (P1)"
```

---

## Task 8: set-password route (set/reset via OTP)

**Files:**
- Create: `src/app/api/account/set-password/route.ts`
- Test: `src/app/api/account/set-password/route.test.ts`

> วาง path ใต้ `/api/account/*` (ไม่ใช่ `/api/auth/*`) เพราะ guardApi ใน `proxy.ts` ยกเว้น `/api/auth/*` — ต้องให้ route นี้ได้ CSRF Origin-check + rate-limit.

- [ ] **Step 1: Write the failing test** (mock prisma + otp + password)

```ts
// src/app/api/account/set-password/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/otp', () => ({ verifyOtp: vi.fn() }))
import { prisma } from '@/lib/prisma'
import { verifyOtp } from '@/lib/otp'
import { POST } from './route'

function req(body: unknown) {
  return new Request('http://seller.deepth.local/api/account/set-password', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/account/set-password', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 on invalid body', async () => {
    const res = await POST(req({ phone: 'x', otp: '1', password: 'weak' }) as any)
    expect(res.status).toBe(400)
  })

  it('401 on bad OTP', async () => {
    ;(verifyOtp as any).mockReturnValue(false)
    const res = await POST(req({ phone: '0812345678', otp: '000000', password: 'Abcd123!' }) as any)
    expect(res.status).toBe(401)
  })

  it('404 when phone has no account', async () => {
    ;(verifyOtp as any).mockReturnValue(true)
    ;(prisma.user.findUnique as any).mockResolvedValue(null)
    const res = await POST(req({ phone: '0812345678', otp: '123456', password: 'Abcd123!' }) as any)
    expect(res.status).toBe(404)
  })

  it('200 sets passwordHash on success', async () => {
    ;(verifyOtp as any).mockReturnValue(true)
    ;(prisma.user.findUnique as any).mockResolvedValue({ id: 'u1' })
    ;(prisma.user.update as any).mockResolvedValue({ id: 'u1' })
    const res = await POST(req({ phone: '0812345678', otp: '123456', password: 'Abcd123!' }) as any)
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/account/set-password/route.test.ts`
Expected: FAIL — cannot resolve './route'

- [ ] **Step 3: Write implementation**

```ts
// src/app/api/account/set-password/route.ts
// ตั้ง/รีเซ็ตรหัสผ่าน seller via phone OTP — ครอบ migration บัญชี OTP-only เดิม + ลืมรหัส.
// verifyOtp consume OTP (single-use). ต้องผ่าน OTP จริงเท่านั้น (กันยึดบัญชีด้วยเบอร์คนอื่น).
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";
import { hashPassword } from "@/lib/password";
import { SetPasswordSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const parsed = v.safeParse(SetPasswordSchema, await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const { phone, otp, password } = parsed.output;

  if (!verifyOtp(phone, otp)) {
    return NextResponse.json({ error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return NextResponse.json({ error: "ไม่พบบัญชีสำหรับเบอร์นี้" }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/account/set-password/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add "src/app/api/account/set-password/route.ts" "src/app/api/account/set-password/route.test.ts"
git commit -m "feat(seller/auth): POST /api/account/set-password via OTP (P1)"
```

---

## Task 9: seller-credentials provider

**Files:**
- Modify: `src/lib/auth.ts:147` (เพิ่ม provider ใหม่ก่อน `admin-credentials`)

- [ ] **Step 1: Add provider** (วางหลัง phone-otp provider block, บรรทัด ~146)

```ts
    CredentialsProvider({
      id: "seller-credentials",
      name: "Seller",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        // bcrypt DoS guard (pattern เดียวกับ admin-credentials)
        if (credentials.password.length > 1000) return null;

        // rate-limit 5/10min ต่อ username — reuse store เดียวกับ admin (key ไม่ชนเพราะ username @unique ทั้งระบบ)
        const WINDOW_MS = 10 * 60 * 1000;
        const MAX_ATTEMPTS = 5;
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        const prev = adminLoginTimestamps.get(credentials.username) ?? [];
        const recent = prev.filter((t) => t > cutoff);
        if (recent.length >= MAX_ATTEMPTS) {
          adminLoginTimestamps.set(credentials.username, recent);
          return null;
        }
        recent.push(now);
        adminLoginTimestamps.set(credentials.username, recent);

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user) return null;
        // seller = ไม่ใช่ admin (admin ใช้ provider แยก); ต้องตั้ง password แล้ว
        if (user.isAdmin) return null;
        if (user.passwordHash == null) return null;

        const { verifyPassword } = await import("@/lib/password");
        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.displayName, email: user.email };
      },
    }),
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Manual verify (ต้องมี seller ที่มี passwordHash)**

ตั้ง password ให้ test account ก่อน (ใช้ route Task 8 ผ่าน OTP test `0000000001`/`123456`):
```bash
curl -s -X POST "http://seller.deepth.local:4000/api/account/set-password" \
  -H 'content-type: application/json' -H 'origin: http://seller.deepth.local:4000' \
  -d '{"phone":"0000000001","otp":"123456","password":"Abcd123!"}'
```
Expected: `{"ok":true}`. (ถ้า dev server ไม่รัน → QA phase เก็บ; ระบุไว้ใน DoD)

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(seller/auth): seller-credentials provider (username+password) (P1)"
```

---

## Task 10: Extend phone-otp signup — set password + category

**Files:**
- Modify: `src/lib/auth.ts:27-110` (phone-otp credentials + authorize)

- [ ] **Step 1: เพิ่ม credential fields** (ใน phone-otp `credentials`, ต่อจาก `shopName`)

```ts
        password: { label: "Password", type: "password" },
        category: { label: "Category", type: "text" },
```

- [ ] **Step 2: ตั้ง passwordHash + category ตอน create user/shop**

ใน block `if (credentials.mode === "signup" && trimmedShopName)` — ก่อน `prisma.$transaction`, hash password ถ้ามี; แล้วใส่ category ลง shop.create และ passwordHash ลง user.update:

```ts
            const trimmedShopName = credentials.shopName?.trim();
            if (credentials.mode === "signup" && trimmedShopName) {
              if (trimmedShopName.length > 100) return null;

              // password (optional ตอน signup — FB user ตั้งทีหลังใน onboarding ได้)
              let passwordHash: string | undefined;
              if (credentials.password) {
                const { isStrongPassword, hashPassword } = await import("@/lib/password");
                if (!isStrongPassword(credentials.password)) return null; // server guard (Yup bypass ได้)
                passwordHash = await hashPassword(credentials.password);
              }
              // category (optional) — ต้องเป็น key ที่รู้จัก
              const { isShopCategory } = await import("@/lib/shop-categories");
              const category =
                credentials.category && isShopCategory(credentials.category)
                  ? credentials.category
                  : undefined;

              await prisma.$transaction(async (tx) => {
                await tx.shop.create({
                  data: {
                    userId: user!.id,
                    shopName: trimmedShopName,
                    businessType: "INDIVIDUAL",
                    ...(category ? { category } : {}),
                  },
                });
                await tx.user.update({
                  where: { id: user!.id },
                  data: { isShop: true, ...(passwordHash ? { passwordHash } : {}) },
                });
              });
            }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(seller/auth): phone-otp signup sets password + category (P1)"
```

---

## Task 11: Session needsOnboarding + shopSlug

**Files:**
- Modify: `src/lib/auth.ts:278-298` (session callback)

- [ ] **Step 1: ขยาย session select + เพิ่ม onboarding flag**

แก้ `session` callback ให้ join shop slug + คำนวณ `needsOnboarding`:

```ts
    async session({ session, token }) {
      if (token.userId) {
        const user = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: {
            id: true, displayName: true, username: true, email: true,
            avatar: true, isShop: true, isAdmin: true, trustScore: true, phone: true,
            shop: { select: { slug: true } },
          },
        });
        if (user) {
          const shopSlug = user.shop?.slug ?? null;
          // ต้อง onboard เมื่อ: ยังไม่มี slug ร้าน หรือ ยังไม่มีเบอร์ (FB user)
          const needsOnboarding = !shopSlug || !user.phone;
          (session as any).user = {
            id: user.id, displayName: user.displayName, username: user.username,
            email: user.email, avatar: user.avatar, isShop: user.isShop,
            isAdmin: user.isAdmin, trustScore: user.trustScore,
            shopSlug, needsOnboarding,
          };
        }
      }
      return session;
    },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Manual verify session shape**

หลัง login (Task 9 manual) เปิด `http://seller.deepth.local:4000/api/auth/session` → JSON มี `user.shopSlug` + `user.needsOnboarding`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(seller/auth): session needsOnboarding + shopSlug flag (P1)"
```

---

## P1 Done — Final Gates

- [ ] **Full test + type-check:** `npm test -- src/lib src/services && npx tsc --noEmit` → ทั้งหมด PASS, tsc 0
- [ ] **Grep ไม่มี secret/log leak:** `rg "console.log" src/lib/password.ts src/app/api/account` → ไม่ log password/hash
- [ ] **safepay-security review (บังคับ — P1 แตะ auth/password):** ตรวจ bcrypt cost, OTP single-use ใน set-password, enumeration (seller-credentials generic null, check-phone rate-limit oracle tradeoff), passwordHash ไม่หลุดใน session/select, validation server-side (Yup frontend bypass ได้)
- [ ] **safepay-reviewer:** convention + scope + ไม่กระทบ buyer (Vuexy) auth (`/api/otp/send` ยัง backward-compat)

## Out of scope (P1) → ไป P2/P3
- หน้า UI sign-in/sign-up/verify-otp/reset-pass/new-pass (P2 — Paces auth/card)
- onboarding modal + slug/category UI (P3)
- Facebook ปุ่มบนหน้า seller (P2 UI; provider ทำงานได้แล้ว)

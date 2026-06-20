# Order Short Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม `Order.shortCode` (8-char ถาวร) ให้ลิงก์ copy/share ฝั่ง seller สั้นลง โดยคงพฤติกรรม phone-unlock + reusable เดิม

**Architecture:** เพิ่ม column `shortCode` ใน Order (generate ตอน createOrder + backfill เก่า) → discriminator `/o/[token]` เพิ่มสาขา 8-char ที่ resolve order แล้ว `redirect()` ไป `/o/{uuid}` (เข้า flow เดิม SSOT) → seller copy/share surfaces ใช้ `shortCode ?? publicToken`

**Tech Stack:** Next.js 16 (App Router), Prisma + PostgreSQL (Supabase), TypeScript strict, Vitest (unit), Playwright (e2e)

**Spec:** `docs/superpowers/specs/2026-06-20-order-short-link-design.md`

## Global Constraints

- TypeScript strict mode — ทุกไฟล์
- charset รหัสสั้น = `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ตัด 0/O/1/I) — เดียวกับ `src/services/sms-code.service.ts:7`
- short code = **8 ตัว**; SMS code = 12 ตัว (ห้ามชนกัน — length-disjoint)
- Migration: dev/prod DB แชร์กัน (Supabase) → apply prod ด้วย `npx prisma migrate deploy -e .env.local` + **ขอ user ยืนยันก่อนแตะ prod** + **restart dev server หลัง migrate** (กัน stale Prisma client → session 500)
- UI: ไม่เพิ่ม markup/component ใหม่ — แก้แค่ string ใน URL + prop เพิ่ม (ไม่ต้อง safepay-ux gate; ไม่มี visual change). ห้าม font-mono ไทย, ห้าม arbitrary Tailwind ใน `(paces)/**` (Hard Rule 7) — ไม่มี styling ใหม่ในแผนนี้
- UUID link เดิม + SMS 12-char ต้องทำงานเหมือนเดิม 100% (regression gate)

---

### Task 1: เพิ่ม column `Order.shortCode` + migration

**Files:**
- Modify: `prisma/schema.prisma:152` (ใต้ `publicToken`)
- Create: `prisma/migrations/<timestamp>_order_short_code/migration.sql` (สร้างโดย `migrate dev`)

**Interfaces:**
- Produces: `Order.shortCode: string | null` (`@unique`) — ใช้โดย Task 2 (gen), Task 3 (backfill), Task 4 (lookup), Task 5 (copy URL)

- [ ] **Step 1: แก้ schema** — เพิ่มบรรทัดใต้ `publicToken` ใน `model Order`

```prisma
  publicToken     String   @unique @default(uuid())
  shortCode       String?  @unique   // permanent 8-char short alias สำหรับ copy/share link (nullable: backfill รุ่นเก่า)
```

- [ ] **Step 2: สร้าง migration (ยังไม่ apply prod)**

Run: `npx prisma migrate dev --name order_short_code -e .env.local`
Expected: สร้างไฟล์ migration + apply ลง dev DB + `prisma generate` สำเร็จ (exit 0)

> ⚠️ dev/prod แชร์ DB → migrate dev จะแตะ DB ที่ใช้ร่วม. **ยืนยันกับ user ก่อนรัน step นี้.**

- [ ] **Step 3: restart dev server**

แจ้ง user ให้ restart `npm run dev -- -p 4000` (Prisma client เปลี่ยน → กัน stale client error). Claude ไม่ start server เอง (user รันเอง — memory `feedback_qa_domains`)

- [ ] **Step 4: ยืนยัน column เข้า DB**

Run: `npx prisma db execute --stdin -e .env.local <<< 'SELECT column_name FROM information_schema.columns WHERE table_name='"'"'Order'"'"' AND column_name='"'"'shortCode'"'"';'`
Expected: คืน 1 แถว `shortCode`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(order-link): add Order.shortCode column (8-char permanent alias)

Base: spec docs/superpowers/specs/2026-06-20-order-short-link-design.md §3

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `genShortCode` + integrate ใน `createOrder` (unit-tested)

**Files:**
- Modify: `src/services/order.service.ts:1` (imports) + `:26-112` (createOrder) + เพิ่ม `genShortCode`
- Test: `src/services/order-shortcode.test.ts` (co-located `.test.ts` ตาม convention โปรเจกต์ เช่น `src/lib/api-rate-limit.test.ts`)

**Interfaces:**
- Consumes: `Order.shortCode` (Task 1)
- Produces: `export function genShortCode(len?: number): string` — ใช้โดย Task 3 (backfill); `createOrder` set `shortCode` อัตโนมัติทุก order ใหม่

- [ ] **Step 1: เขียน failing test** — `src/services/order-shortcode.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { genShortCode } from "../order.service";

const CHARSET_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

describe("genShortCode", () => {
  it("ยาว 8 ตัวเป็น default", () => {
    expect(genShortCode()).toHaveLength(8);
  });

  it("อยู่ใน charset (ไม่มี 0/O/1/I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = genShortCode();
      expect(code).toMatch(CHARSET_RE);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("รับ len param ได้", () => {
    expect(genShortCode(12)).toHaveLength(12);
  });

  it("ไม่ซ้ำกันบ่อย (เชิงสถิติ) ใน 500 ครั้ง", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(genShortCode());
    expect(seen.size).toBe(500); // 40-bit → ชนใน 500 ครั้ง ~0
  });
});
```

- [ ] **Step 2: รัน test ให้ FAIL**

Run: `npx vitest run src/services/order-shortcode.test.ts`
Expected: FAIL — `genShortCode is not a function` / import error

- [ ] **Step 3: เพิ่ม import + `genShortCode`** ใน `src/services/order.service.ts`

แก้บรรทัด import บนสุด (เพิ่ม `randomBytes` + `Prisma`):

```ts
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluateBadges } from "@/services/badge.service";
```

เพิ่มฟังก์ชัน (วางหลัง `ShippingAddressRequiredError` ราว `:25`):

```ts
// charset เดียวกับ sms-code.service (ตัด 0/O/1/I) — 8 ตัว = 32^8 ≈ 1.1e12 (40-bit)
const SHORT_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** สร้างรหัสสั้นถาวรสำหรับ copy/share link (default 8 ตัว). ดู spec §4 */
export function genShortCode(len = 8): string {
  const bytes = randomBytes(len);
  let code = "";
  for (let i = 0; i < len; i++) code += SHORT_CHARSET[bytes[i] % 32];
  return code;
}
```

- [ ] **Step 4: รัน test ให้ PASS**

Run: `npx vitest run src/services/order-shortcode.test.ts`
Expected: PASS ทั้ง 4 เคส

- [ ] **Step 5: integrate ใน `createOrder`** — แทน `return prisma.order.create({...})` (`:92-111`) ด้วย retry loop

```ts
  // shortCode: generate + retry ถ้าชน @unique (โอกาสชน 5 รอบติด ≈ 0). spec §4.2
  const orderData = {
    shopId,
    type: data.type,
    totalAmount,
    fulfillmentMode,
    items: { create: data.items },
    buyerContact: data.buyerContact ?? undefined,
    buyerName: data.buyerName ?? undefined,
    paymentMethod: data.paymentMethod ?? undefined,
    salesChannel: data.salesChannel ?? undefined,
    internalNote: data.internalNote ?? undefined,
    discount: data.discount ?? undefined,
    vatRate: data.vatRate ?? undefined,
    vatAmount: data.vatAmount ?? undefined,
    shippingAddress: data.shippingAddress ?? undefined,
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.order.create({
        data: { ...orderData, shortCode: genShortCode() },
        include: { items: true },
      });
    } catch (e) {
      // P2002 = unique violation (ชน shortCode) → regenerate retry; error อื่น throw ทันที
      const isUnique =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (isUnique && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("SHORT_CODE_COLLISION"); // unreachable ในทางปฏิบัติ
```

- [ ] **Step 6: type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 (ไม่มี error)

- [ ] **Step 7: Commit**

```bash
git add src/services/order.service.ts src/services/order-shortcode.test.ts
git commit -m "feat(order-link): generate Order.shortCode on createOrder (retry on collision)

Base: spec docs/superpowers/specs/2026-06-20-order-short-link-design.md §4

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backfill order เก่า

**Files:**
- Create: `prisma/backfill-order-shortcode.ts`

**Interfaces:**
- Consumes: `genShortCode` (Task 2), `Order.shortCode` (Task 1)

- [ ] **Step 1: เขียนสคริปต์** — `prisma/backfill-order-shortcode.ts`

```ts
/**
 * Backfill Order.shortCode ให้ order เก่าที่ยัง null (รันครั้งเดียวหลัง migrate Task 1).
 * รัน: npx tsx prisma/backfill-order-shortcode.ts -e .env.local
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { genShortCode } from "../src/services/order.service";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.order.findMany({
    where: { shortCode: null },
    select: { id: true },
  });
  console.log(`[backfill] order ที่ต้องเติม shortCode: ${targets.length}`);

  let done = 0;
  for (const { id } of targets) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await prisma.order.update({ where: { id }, data: { shortCode: genShortCode() } });
        done++;
        break;
      } catch (e) {
        const isUnique =
          e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
        if (isUnique && attempt < 4) continue;
        throw e;
      }
    }
  }
  console.log(`[backfill] เติมสำเร็จ ${done}/${targets.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: รัน backfill** (ยืนยันกับ user ก่อน — แตะ prod DB ที่แชร์)

Run: `npx tsx prisma/backfill-order-shortcode.ts -e .env.local`
Expected: log `เติมสำเร็จ N/N` (N = จำนวน order เดิม)

- [ ] **Step 3: ยืนยันไม่มี null เหลือ**

Run: `npx prisma db execute --stdin -e .env.local <<< 'SELECT COUNT(*) FROM "Order" WHERE "shortCode" IS NULL;'`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add prisma/backfill-order-shortcode.ts
git commit -m "chore(order-link): backfill script สำหรับ Order.shortCode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Discriminator `/o/[token]` — เพิ่มสาขา 8-char

**Files:**
- Modify: `src/app/(marketing)/o/[token]/page.tsx:52` (เพิ่ม regex) + `:179-184` (เพิ่ม branch ก่อน fallback)

**Interfaces:**
- Consumes: `Order.shortCode` (Task 1), `prisma` (มี import แล้วในไฟล์)

- [ ] **Step 1: เพิ่ม regex** ใต้ `SMS_CODE_RE` (`:52`)

```ts
const SMS_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/

// permanent short-code pattern — 8 ตัว charset เดียวกับ SMS code (length-disjoint จาก SMS 12-char)
const SHORT_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/
```

- [ ] **Step 2: เพิ่ม branch** ก่อน `redirect('/o/link-invalid')` ตัวสุดท้าย (`:184`)

```ts
  // ── Discriminator ลำดับ 3: 8-char permanent short-code → resolve + redirect UUID ──
  // หา order ด้วย shortCode แล้ว redirect เข้า flow UUID เดิม (SSOT — ไม่ duplicate logic
  // phone-unlock). reusable + ไม่ consume + ไม่ auto-unlock (ต่างจาก SMS 12-char). spec §5
  if (SHORT_CODE_RE.test(token)) {
    const matched = await prisma.order.findUnique({
      where: { shortCode: token },
      select: { publicToken: true },
    })
    // ไม่เจอ → uniform error เดียวกับ format ผิด (RC-2: ไม่ leak ว่า order มีจริงไหม)
    if (!matched) redirect('/o/link-invalid')
    redirect('/o/' + matched.publicToken)
  }

  // ── Discriminator ลำดับ 4: format ไม่ตรง → uniform error (RC-2) ─────────────────
  redirect('/o/link-invalid')
```

> หมายเหตุ: `redirect()` ของ Next.js throw internally — เรียงหลัง `if (!matched)` ปลอดภัย ไม่ต้อง else

- [ ] **Step 3: type-check**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: smoke-test manual** (dev server รันโดย user ที่ port 4000)

Run: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://deepth.local:4000/o/ABCDEFGH"`
Expected: `307` + redirect ไป `/o/link-invalid` (เพราะ ABCDEFGH ไม่มีจริง) — พิสูจน์ branch ทำงาน

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/o/[token]/page.tsx"
git commit -m "feat(order-link): resolve 8-char short-code → redirect UUID flow

Base: spec docs/superpowers/specs/2026-06-20-order-short-link-design.md §5

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: เปลี่ยน copy/share surfaces ใช้ shortCode

**Files:**
- Modify: `src/app/(paces)/seller/(dashboard)/orders/components/data.ts:38-57` (OrderRow type)
- Modify: `src/app/(paces)/seller/(dashboard)/orders/page.tsx:77-93` (map เพิ่ม shortCode)
- Modify: `src/app/(paces)/seller/(dashboard)/orders/components/OrderActions.tsx:39-42,62,71` (copy URL)
- Modify: `src/app/(paces)/seller/(dashboard)/orders/components/BulkActionBar.tsx:48` (bulk copy)
- Modify: `src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderCopyLink.tsx` (prop shortCode)
- Modify: `src/app/(paces)/seller/(dashboard)/orders/[token]/components/StatusHero.tsx:33-41,85-122` (prop + ส่งต่อ)
- Modify: `src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx:121-122` (ส่ง shortCode)

**Interfaces:**
- Consumes: `Order.shortCode` (Task 1, มาทาง `getOrdersByShop`/`getOrderForShop` ที่ใช้ `include` → คืน scalar ครบรวม shortCode อัตโนมัติ — ไม่ต้องแก้ service)
- Produces: copy/share link ทุกจุดใช้ `shortCode ?? publicToken` (fallback กัน null ช่วง backfill ยังไม่จบ); ลิงก์ภายใน `/orders/{publicToken}` คงเดิม

- [ ] **Step 1: เพิ่ม field ใน `OrderRow`** (`data.ts:40` ใต้ `publicToken`)

```ts
  publicToken: string
  /** short-code 8 ตัวสำหรับ copy/share link; null = order เก่าก่อน backfill (fallback publicToken) */
  shortCode: string | null
```

- [ ] **Step 2: map shortCode** ใน orders list (`page.tsx:79` ใต้ `publicToken:`)

```ts
    publicToken: o.publicToken ?? o.id,
    shortCode: o.shortCode ?? null,
```

- [ ] **Step 3: OrderCopyLink รับ shortCode** — แทนทั้งไฟล์ `OrderCopyLink.tsx`

```tsx
'use client'

/**
 * OrderCopyLink — resolve buyer URL แล้วส่ง value ให้ CopyLinkButton.
 * ใช้ shortCode (สั้น) ถ้ามี ไม่งั้น fallback publicToken (order เก่าก่อน backfill). spec §6
 */

import { resolveBuyerBaseUrl } from '@/lib/buyer-url'
import { useEffect, useState } from 'react'
import CopyLinkButton from './CopyLinkButton'

interface OrderCopyLinkProps {
  publicToken: string
  /** short-code 8 ตัว; ถ้า null/undefined → ใช้ publicToken */
  shortCode?: string | null
  showPreview?: boolean
}

export default function OrderCopyLink({ publicToken, shortCode, showPreview = true }: OrderCopyLinkProps) {
  const code = shortCode || publicToken
  const [buyerUrl, setBuyerUrl] = useState(`/o/${code}`)

  useEffect(() => {
    setBuyerUrl(`${resolveBuyerBaseUrl()}/o/${code}`)
  }, [code])

  return (
    <CopyLinkButton
      value={buyerUrl}
      label="คัดลอกลิงก์"
      showPreview={showPreview}
    />
  )
}
```

- [ ] **Step 4: StatusHero ส่ง shortCode** — เพิ่ม prop ใน `StatusHeroProps` (`:33`) + destructure (`:41`)

```ts
export interface StatusHeroProps {
  publicToken: string
  shortCode?: string | null
  status: string
  type: string
  createdAtISO: string
  fulfillmentMode: string
}

export default function StatusHero({ publicToken, shortCode, status, createdAtISO, fulfillmentMode }: StatusHeroProps) {
```

แล้วแก้ `<OrderCopyLink publicToken={publicToken} showPreview={false} />` **ทั้ง 5 จุด** (`:85,94,106,115,122`) เป็น:

```tsx
<OrderCopyLink publicToken={publicToken} shortCode={shortCode} showPreview={false} />
```

- [ ] **Step 5: detail page ส่ง shortCode เข้า StatusHero** (`[token]/page.tsx:121-122`)

```tsx
      <StatusHero
        publicToken={order.publicToken}
        shortCode={order.shortCode}
```

- [ ] **Step 6: OrderActions ใช้ shortCode เฉพาะ copy** (`OrderActions.tsx:39-42`) — เปลี่ยน state ให้เป็น URL ของ shortCode; ลิงก์ภายใน `/orders/...` คงใช้ publicToken

```tsx
  // copy link: ใช้ shortCode (สั้น) fallback publicToken; ลิงก์ภายใน /orders/ คงใช้ publicToken
  const copyCode = order.shortCode || order.publicToken
  const [url, setUrl] = useState(`/o/${copyCode}`)
  useEffect(() => {
    setUrl(`${resolveBuyerBaseUrl()}/o/${copyCode}`)
  }, [copyCode])
```

(บรรทัด `<CopyLinkButton value={url} .../>` ที่ `:62` และ `:71` ไม่ต้องแก้ — ใช้ `url` อยู่แล้ว)

- [ ] **Step 7: BulkActionBar ใช้ shortCode** (`BulkActionBar.tsx:48`)

```ts
    const text = selectedRows.map((r) => `${buyerBaseUrl}/o/${r.original.shortCode || r.original.publicToken}`).join('\n')
```

- [ ] **Step 8: type-check**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 9: Commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/orders"
git commit -m "feat(order-link): copy/share link ฝั่ง seller ใช้ shortCode (สั้น)

ลิงก์ภายใน /orders/ + SMS + admin คงใช้ publicToken เดิม. fallback
publicToken ถ้า shortCode ยัง null (order ก่อน backfill).
Base: spec docs/superpowers/specs/2026-06-20-order-short-link-design.md §6

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: E2E Playwright + regression

**Files:**
- Create: `e2e/order-short-link.spec.ts` (เช็ค path จริงของ Playwright spec ในโปรเจกต์ก่อน — memory `feedback_qa_playwright_e2e_mandatory`: ใช้ `e2e/helpers/auth.ts` bypass login)

**Interfaces:**
- Consumes: ทุก Task ข้างบน (ต้อง deploy/รัน dev + backfill เสร็จ)

- [ ] **Step 1: seed order ที่มี shortCode + buyerContact** (ใช้ Prisma หรือ helper seed เดิม) — จด `shortCode` + เบอร์ผู้ซื้อไว้ใช้ใน spec

- [ ] **Step 2: เขียน e2e spec** — `e2e/order-short-link.spec.ts`

```ts
import { test, expect } from '@playwright/test'

// ใช้ shortCode + phone ของ order ที่ seed ใน Step 1
const SHORT_CODE = process.env.E2E_SHORT_CODE!     // 8-char
const BUYER_PHONE = process.env.E2E_BUYER_PHONE!   // เบอร์ที่ตรง buyerContact

test('short-code link → redirect /o/{uuid} → phone-unlock ผ่าน', async ({ page }) => {
  await page.goto(`http://deepth.local:4000/o/${SHORT_CODE}`)
  // redirect เข้า /o/{uuid} (ไม่ใช่ /o/link-invalid)
  await expect(page).toHaveURL(/\/o\/[0-9a-f-]{36}$/)
  // หน้า phone-unlock แสดง (reusable, ไม่ auto-unlock)
  await page.getByRole('textbox').first().fill(BUYER_PHONE)
  await page.getByRole('button', { name: /ยืนยัน|ปลดล็อก|ดูคำสั่งซื้อ/ }).click()
  await expect(page.getByText(/คำสั่งซื้อ|ยอดรวม|ยืนยันคำสั่งซื้อ/)).toBeVisible()
})

test('short-code ใช้ซ้ำได้ (reusable — เปิดรอบสองยังเข้า unlock)', async ({ page }) => {
  await page.goto(`http://deepth.local:4000/o/${SHORT_CODE}`)
  await expect(page).toHaveURL(/\/o\/[0-9a-f-]{36}$/)
})

test('short-code มั่ว → /o/link-invalid', async ({ page }) => {
  await page.goto('http://deepth.local:4000/o/ZZZZZZZZ')
  await expect(page).toHaveURL(/\/o\/link-invalid$/)
})
```

- [ ] **Step 3: รัน e2e**

Run: `E2E_SHORT_CODE=<code> E2E_BUYER_PHONE=<phone> npm run e2e -- order-short-link`
Expected: 3 เคส PASS

- [ ] **Step 4: regression — UUID + SMS เดิมยังทำงาน**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://deepth.local:4000/o/<uuid-เดิม>"` (คาด 200) + `curl ... "/o/<12-char-sms-code>"` (คาด 307 → `/api/o/sms/...`)
Expected: UUID = 200, SMS code = 307 ไป `/api/o/sms/`

- [ ] **Step 5: Commit**

```bash
git add e2e/order-short-link.spec.ts
git commit -m "test(order-link): e2e short-code redirect + phone-unlock + regression

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** §3 (model)→Task1, §4 (gen+backfill)→Task2+3, §5 (routing)→Task4, §6 (surfaces)→Task5, §10 (testing)→Task2+6, §8 (backward-compat fallback)→Task5 `shortCode || publicToken` + Task6 Step4. §9 (accepted risk) = no-code.
- **No service change needed** สำหรับอ่าน shortCode: `getOrdersByShop`/`getOrderForShop` ใช้ `include` → คืน scalar ครบ.
- **Type consistency:** `genShortCode(len?)`, `OrderRow.shortCode: string | null`, `OrderCopyLink.shortCode?: string | null`, `StatusHeroProps.shortCode?: string | null` — ตรงกันทุก Task.
- **Migration safety gate** ย้ำใน Global Constraints + Task1 Step2/Step3 + Task3 Step2 (user-confirm ก่อนแตะ prod + restart dev).

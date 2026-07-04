# Subscription Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **PROJECT GATES (override generic flow):** ทุก task ที่แตะ frontend (page/component/style) **ต้อง invoke `safepay-ux` ออก Design Spec ก่อน developer เขียนโค้ด** (Hard Rule 8) และ **copy จาก theme file ที่ `safepay-ux` ระบุ** (Hard Rule 1) — ห้ามเขียน JSX visual จาก scratch ใน plan นี้. หลัง developer เสร็จแต่ละ task → `safepay-reviewer` (8-gate) → `safepay-qa` (Chrome DevTools MCP ที่ *.deepth.local:4000). Controller commit เอง (subagent ห้าม commit/push).

**Goal:** สร้างหน้ารวมศูนย์ให้ seller ดู+จัดการแพ็กเกจของตัวเอง (Business Package + Stock Pro รายร้าน) และให้ admin ดูภาพรวมว่าแต่ละร้านใช้แพ็กเกจอะไร (read-only)

**Architecture:** 2 หน้าใหม่ใน `(paces)` route group. Seller hub เป็น RSC ที่ดึงข้อมูลผ่าน aggregator service ตัวใหม่ แล้ว reuse component จัดการเดิมทั้งหมด (จัดการเฉพาะร้าน active; ร้านอื่นใช้ปุ่มสลับร้านที่มีอยู่). Admin เป็น RSC ตาม pattern หน้า `/admin/users` (direct Prisma + client table). ไม่มี model/migration ใหม่ ไม่แตะ payment endpoint.

**Tech Stack:** Next.js 16 (App Router, RSC) · Prisma/PostgreSQL · Paces (Preline 4 + Tailwind 4) · Valibot · Vitest · @tanstack/react-table · @iconify/react (tabler)

## Global Constraints

- **Theme:** seller/admin = Paces เท่านั้น (Preline+Tailwind, ไม่มี MUI). Primary น้ำเงิน `#236dc9` — ห้ามม่วง `#7367F0` (นั่นคือ Vuexy/buyer)
- **HR1/HR3:** ทุกหน้า/component copy จาก theme file ที่ระบุ; commit ที่แตะ UI มี `Base:` line ชี้ theme file
- **HR7:** Paces primitive เท่านั้น (`.card`/`.card-header`/`btn`/`badge`/`text-default-*`/`bg-primary`/`bg-{semantic}/15`/`size-*`/`rounded-lg`) — ห้าม arbitrary value `text-[NNpx]`/`bg-[rgba()]`/hardcode hex (เว้นจำเป็นจริง + comment กำกับ)
- **HR8:** invoke `safepay-ux` ก่อนทุก task frontend
- **HR9:** notification ใน `(paces)` ใช้ `pacesToast` เท่านั้น (`import { pacesToast } from '@/lib/paces-toast'`) — action=top-right; confirm dialog ใช้ Sweet Alerts (`sweetalert2`)
- **HR12:** ห้าม emoji ใน UI — icon จริงผ่าน `@iconify/react`/`@/components/wrappers/Icon` (tabler name); จุดที่ควรมี icon แต่ spec ไม่ระบุ → ถาม user ก่อน
- **HR2:** ห้าม `component={Link}` ใน RSC — ใช้ LinkButton/LinkChip wrapper
- **วันที่:** ใช้ `formatDate`/`formatDateTime` จาก `src/lib/format-date.ts` (พ.ศ. tz ไทย) — ห้าม `toLocaleDateString`
- **ราคา/label:** reuse constant `PACKAGE_PRICE`/`PACKAGE_LABEL_TH` (`src/lib/inventory-addon.ts`), `BUSINESS_PACKAGE_TIER_CONFIG`/`TIER_ORDER` (`src/lib/business-package.ts`) — **ห้าม redefine**
- **Font:** Anuphan
- **ห้าม subagent commit/push/checkout/pull/merge** — Controller ทำเอง หลัง verify (memory: subagent_git_scope_violation, parallel_dev_agents_no_commit)
- **tsc:** `node node_modules/typescript/lib/tsc.js --noEmit` ต้อง 0 error ก่อนถือว่า task เสร็จ
- **grep gates (reviewer):** ในไฟล์ที่แตะใต้ `src/app/(paces)/` — `rg "react-toastify"` = 0, emoji regex = 0, ม่วง hex = 0

---

## File Structure

```
src/services/subscription-overview.service.ts          # NEW — aggregator (seller)  [Task 1]
src/services/subscription-overview.service.test.ts      # NEW — Vitest              [Task 1]
src/app/(paces)/seller/(dashboard)/subscriptions/
    page.tsx                                            # NEW — seller hub (RSC)     [Task 3]
    components/SwitchShopButton.tsx                     # NEW — client (reuse switch-context) [Task 2]
src/app/(paces)/seller/(dashboard)/_seller-menu.ts     # MODIFY — add menu item     [Task 3]
src/app/(paces)/admin/(dashboard)/subscriptions/
    page.tsx                                            # NEW — admin overview (RSC) [Task 4]
    components/data.ts                                  # NEW — AdminSubscriptionRow type + mapper [Task 4]
    components/SubscriptionsTable.tsx                   # NEW — client table         [Task 4]
src/app/(paces)/admin/(dashboard)/_admin-menu.ts       # MODIFY — add menu item     [Task 4]
```

Reuse (ไม่แก้): `SubscribeButton`, `UpgradeToProCard`, `ReactivateButton`, `AdvanceWarningBanner` (inventory); `PackageTierGrid`, `PackageActionButton`, `CancelPackageButton`, `DowngradeButton`, `LockedStateBanner`, `QuotaUsageCard`, business `AdvanceWarningBanner`; `FilterDropdown`, `DataTable`, `TablePagination`, `Icon`, `Select`, `PageBreadcrumb`.

Reuse getter: `getSubscriptionStatus(ownerId)` (business-package.service), `getEntitlementInfo(shopId)`/`shouldWarnAdvance(entitlement,balance)` (inventory-entitlement.service), `getBalance(shopId)` (wallet.service), `getPersonalShop(userId)` (shop-context), `BUSINESS_PACKAGE_TIER_CONFIG` (business-package lib).

---

## Task 1: Aggregator service `getSellerSubscriptionOverview`

**Files:**
- Create: `src/services/subscription-overview.service.ts`
- Test: `src/services/subscription-overview.service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `getSubscriptionStatus(ownerId)`, `getBalance(shopId)`, `shouldWarnAdvance(entitlement, balance)`, `getPersonalShop(userId)`, `BUSINESS_PACKAGE_TIER_CONFIG`, `PACKAGE_PRICE`.
- Produces:
```ts
export interface ShopSubscriptionRow {
  shopId: string
  shopName: string
  kind: 'PERSONAL' | 'BUSINESS'
  logo: string | null
  entitlementStatus: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'
  package: 'BASIC' | 'PRO' | null
  nextRenewalAt: Date | null
  walletBalance: number
  warnAdvance: boolean          // shouldWarnAdvance ผลลัพธ์ (ACTIVE เท่านั้น)
  shortfall: number             // PACKAGE_PRICE[pkg] - balance (>0 = ขาด); 0 ถ้าไม่ ACTIVE
}
export interface BusinessPackageSummary {
  status: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED_RENEWAL_FAILED'
  tier: 'GROWTH' | 'PRO' | 'BUSINESS' | null
  nextRenewalAt: Date | null
  ownedBusinessCount: number
  maxBusinesses: number | null  // null = unlimited (Business tier); จาก TIER_CONFIG
  personalWalletBalance: number
}
export interface SellerSubscriptionOverview {
  businessPackage: BusinessPackageSummary
  shops: ShopSubscriptionRow[]   // ทุกร้านที่ user เป็นเจ้าของ (userId), deletedAt:null
}
export async function getSellerSubscriptionOverview(userId: string): Promise<SellerSubscriptionOverview>
```

- [ ] **Step 1: เขียน test ที่ fail** — `src/services/subscription-overview.service.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock deps ก่อน import service
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shop: { findMany: vi.fn() },
    inventoryEntitlement: { findUnique: vi.fn() },
    shopMember: { count: vi.fn() },
  },
}))
vi.mock('@/services/business-package.service', () => ({ getSubscriptionStatus: vi.fn() }))
vi.mock('@/services/wallet.service', () => ({ getBalance: vi.fn() }))
vi.mock('@/lib/shop-context', () => ({ getPersonalShop: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { getBalance } from '@/services/wallet.service'
import { getPersonalShop } from '@/lib/shop-context'
import { getSellerSubscriptionOverview } from './subscription-overview.service'

const anyPrisma = prisma as any

describe('getSellerSubscriptionOverview', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('รวม business package + ทุกร้าน + คำนวณ shortfall/warnAdvance', async () => {
    ;(getPersonalShop as any).mockResolvedValue({ id: 'shopP', kind: 'PERSONAL' })
    ;(getSubscriptionStatus as any).mockResolvedValue({
      tier: 'PRO', status: 'ACTIVE', nextRenewalAt: new Date('2026-08-01'),
    })
    anyPrisma.shopMember.count.mockResolvedValue(2)
    ;(getBalance as any).mockImplementation(async (id: string) => (id === 'shopP' ? 50 : 300))
    anyPrisma.shop.findMany.mockResolvedValue([
      { id: 'shopP', shopName: 'ร้านหลัก', kind: 'PERSONAL', logo: null,
        inventoryEntitlement: { status: 'ACTIVE', package: 'BASIC', nextRenewalAt: new Date('2026-07-05') } },
      { id: 'shopB', shopName: 'ร้านธุรกิจ', kind: 'BUSINESS', logo: null,
        inventoryEntitlement: null },
    ])

    const out = await getSellerSubscriptionOverview('u1')

    expect(out.businessPackage.tier).toBe('PRO')
    expect(out.businessPackage.status).toBe('ACTIVE')
    expect(out.businessPackage.maxBusinesses).toBe(3) // PRO = 3
    expect(out.businessPackage.ownedBusinessCount).toBe(2)
    expect(out.businessPackage.personalWalletBalance).toBe(50)
    expect(out.shops).toHaveLength(2)
    const p = out.shops.find(s => s.shopId === 'shopP')!
    expect(p.entitlementStatus).toBe('ACTIVE')
    expect(p.package).toBe('BASIC')
    expect(p.shortfall).toBe(149) // 199 - 50
    const b = out.shops.find(s => s.shopId === 'shopB')!
    expect(b.entitlementStatus).toBe('NOT_SUBSCRIBED')
    expect(b.package).toBeNull()
    expect(b.shortfall).toBe(0)
  })

  it('business package = NOT_SUBSCRIBED เมื่อ getSubscriptionStatus คืน null', async () => {
    ;(getPersonalShop as any).mockResolvedValue({ id: 'shopP', kind: 'PERSONAL' })
    ;(getSubscriptionStatus as any).mockResolvedValue(null)
    anyPrisma.shopMember.count.mockResolvedValue(0)
    ;(getBalance as any).mockResolvedValue(0)
    anyPrisma.shop.findMany.mockResolvedValue([])

    const out = await getSellerSubscriptionOverview('u1')
    expect(out.businessPackage.status).toBe('NOT_SUBSCRIBED')
    expect(out.businessPackage.tier).toBeNull()
    expect(out.businessPackage.maxBusinesses).toBeNull()
    expect(out.shops).toHaveLength(0)
  })
})
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `node node_modules/vitest/vitest.mjs run src/services/subscription-overview.service.test.ts`
Expected: FAIL — `getSellerSubscriptionOverview is not a function` (ไฟล์ยังไม่มี)

- [ ] **Step 3: เขียน implementation ขั้นต่ำ** — `src/services/subscription-overview.service.ts`

```ts
import { prisma } from '@/lib/prisma'
import { getSubscriptionStatus } from '@/services/business-package.service'
import { getBalance } from '@/services/wallet.service'
import { getPersonalShop } from '@/lib/shop-context'
import { shouldWarnAdvance, type EntitlementStatus, type InventoryPackage } from '@/services/inventory-entitlement.service'
import { PACKAGE_PRICE } from '@/lib/inventory-addon'
import { BUSINESS_PACKAGE_TIER_CONFIG, type BusinessPackageTier } from '@/lib/business-package'

export interface ShopSubscriptionRow {
  shopId: string
  shopName: string
  kind: 'PERSONAL' | 'BUSINESS'
  logo: string | null
  entitlementStatus: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'
  package: 'BASIC' | 'PRO' | null
  nextRenewalAt: Date | null
  walletBalance: number
  warnAdvance: boolean
  shortfall: number
}
export interface BusinessPackageSummary {
  status: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED_RENEWAL_FAILED'
  tier: 'GROWTH' | 'PRO' | 'BUSINESS' | null
  nextRenewalAt: Date | null
  ownedBusinessCount: number
  maxBusinesses: number | null
  personalWalletBalance: number
}
export interface SellerSubscriptionOverview {
  businessPackage: BusinessPackageSummary
  shops: ShopSubscriptionRow[]
}

export async function getSellerSubscriptionOverview(userId: string): Promise<SellerSubscriptionOverview> {
  const [sub, personal, shops, ownedBusinessCount] = await Promise.all([
    getSubscriptionStatus(userId),
    getPersonalShop(userId),
    prisma.shop.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true, shopName: true, kind: true, logo: true,
        inventoryEntitlement: { select: { status: true, package: true, nextRenewalAt: true } },
      },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.shopMember.count({ where: { userId, shop: { kind: 'BUSINESS', deletedAt: null } } }),
  ])

  const personalWalletBalance = personal ? await getBalance(personal.id) : 0

  const tier = (sub?.tier ?? null) as BusinessPackageTier | null
  const businessPackage: BusinessPackageSummary = {
    status: sub ? (sub.status as 'ACTIVE' | 'LOCKED_RENEWAL_FAILED') : 'NOT_SUBSCRIBED',
    tier,
    nextRenewalAt: sub?.nextRenewalAt ?? null,
    ownedBusinessCount,
    maxBusinesses: tier ? BUSINESS_PACKAGE_TIER_CONFIG[tier].maxBusinesses : null,
    personalWalletBalance,
  }

  const rows: ShopSubscriptionRow[] = await Promise.all(
    shops.map(async (s): Promise<ShopSubscriptionRow> => {
      const ent = s.inventoryEntitlement
      const status: EntitlementStatus = ent ? (ent.status as EntitlementStatus) : 'NOT_SUBSCRIBED'
      const pkg = (ent?.package ?? null) as InventoryPackage | null
      const balance = await getBalance(s.id)
      const warnAdvance =
        status === 'ACTIVE' && pkg != null
          ? shouldWarnAdvance({ status, package: pkg, nextRenewalAt: ent!.nextRenewalAt }, balance)
          : false
      const shortfall = status === 'ACTIVE' && pkg != null ? Math.max(0, PACKAGE_PRICE[pkg] - balance) : 0
      return {
        shopId: s.id, shopName: s.shopName, kind: s.kind as 'PERSONAL' | 'BUSINESS', logo: s.logo,
        entitlementStatus: status, package: pkg, nextRenewalAt: ent?.nextRenewalAt ?? null,
        walletBalance: balance, warnAdvance, shortfall,
      }
    }),
  )

  return { businessPackage, shops: rows }
}
```

> หมายเหตุ: ยืนยันชื่อ field จริงบน `Shop` (`shopName`, `logo`, `kind`, `createdAt`) และว่า `getSubscriptionStatus` คืน field `tier/status/nextRenewalAt` ก่อนเขียน (ตรงกับ extract แล้ว). ถ้า `EntitlementStatus`/`InventoryPackage` ไม่ได้ export จาก service ให้ import จาก `@/lib/inventory-addon` แทน.

- [ ] **Step 4: รัน test ให้ pass**

Run: `node node_modules/vitest/vitest.mjs run src/services/subscription-overview.service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: tsc**

Run: `node node_modules/typescript/lib/tsc.js --noEmit`
Expected: 0 error

- [ ] **Step 6: Controller commit** (subagent ห้าม commit)

```bash
git add src/services/subscription-overview.service.ts src/services/subscription-overview.service.test.ts
git commit -m "feat(subscriptions): aggregator service getSellerSubscriptionOverview + tests"
```

---

## Task 2: `SwitchShopButton` client component

**Files:**
- Create: `src/app/(paces)/seller/(dashboard)/subscriptions/components/SwitchShopButton.tsx`

**Interfaces:**
- Consumes: `POST /api/business/switch-context { shopId }` (คืน `{ shopId, kind, role }` | 403 `NOT_MEMBER`), `useSession().update` (NextAuth), `useRouter`, `pacesToast`.
- Produces: `export default function SwitchShopButton({ shopId, shopName }: { shopId: string; shopName: string })`

**⚠️ ก่อนเขียน: invoke `safepay-ux`** ให้ระบุ theme source ของปุ่ม (Paces `btn btn-soft`/`btn-sm`) + placement. Logic pattern copy จาก `BusinessOnboardingWizard.tsx` (จุดที่เรียก switch-context + session.update).

- [ ] **Step 1: invoke `safepay-ux`** — ขอ Design Spec เฉพาะปุ่ม "สลับมาร้านนี้" (ปุ่ม Paces + สถานะ loading + ตำแหน่งในการ์ดร้าน) อิง `theme/paces/Docs/index.html` + `paces-component-reference.md`

- [ ] **Step 2: เขียน component** (logic verbatim — copy จาก BusinessOnboardingWizard):

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

export default function SwitchShopButton({ shopId, shopName }: { shopId: string; shopName: string }) {
  const router = useRouter()
  const { update } = useSession()
  const [loading, setLoading] = useState(false)

  async function handleSwitch() {
    setLoading(true)
    try {
      const res = await fetch('/api/business/switch-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId }),
      })
      if (!res.ok) {
        pacesToast.error('สลับร้านไม่สำเร็จ')
        return
      }
      await update({ activeShopId: shopId })
      pacesToast.success(`สลับมาที่ ${shopName} แล้ว`)
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  // className ปุ่มให้ตรงกับ Design Spec จาก safepay-ux (Paces btn) — ตัวอย่าง btn btn-soft btn-primary btn-sm
  return (
    <button type="button" className="btn btn-soft btn-primary btn-sm" onClick={handleSwitch} disabled={loading}>
      {loading ? <Icon icon="loader-2" className="animate-spin" /> : <Icon icon="switch-horizontal" />}
      สลับมาร้านนี้
    </button>
  )
}
```

> ยืนยัน: `update` accepts `{ activeShopId }` (ตรงกับ jwt callback ที่ re-verify membership). icon name `switch-horizontal`/`loader-2` ต้องมีจริงใน tabler (reviewer เช็ค). ปรับ className ตาม Design Spec.

- [ ] **Step 3: tsc**

Run: `node node_modules/typescript/lib/tsc.js --noEmit`
Expected: 0 error

- [ ] **Step 4: Controller commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/subscriptions/components/SwitchShopButton.tsx"
git commit -m "feat(subscriptions): SwitchShopButton (reuse switch-context) [Base: BusinessOnboardingWizard]"
```

---

## Task 3: Seller hub page `/seller/subscriptions` + menu

**Files:**
- Create: `src/app/(paces)/seller/(dashboard)/subscriptions/page.tsx`
- Modify: `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` (STORE group — เพิ่ม leaf)

**Interfaces:**
- Consumes: `getSellerSubscriptionOverview(userId)` (Task 1), `SwitchShopButton` (Task 2), reuse components (business + inventory), `getServerSession(authOptions)`, `formatDate`, `PageBreadcrumb`, `PACKAGE_LABEL_TH`, `BUSINESS_PACKAGE_TIER_CONFIG`.

**⚠️ ก่อนเขียน: invoke `safepay-ux`** ออก Design Spec เต็มหน้า (2 section: Business Package card + Stock Pro per-shop cards) + Theme Source Mapping. Reviewer จะ gate ว่า copy จาก theme จริง.

- [ ] **Step 1: invoke `safepay-ux`** — Design Spec หน้า `/seller/subscriptions`:
  - Section A: Business Package card — reuse `PackageTierGrid`/`PackageActionButton`/`Cancel`/`Downgrade`/`LockedStateBanner`/`QuotaUsageCard`/business `AdvanceWarningBanner` (ตาม `business/page.tsx`)
  - Section B: การ์ดต่อร้าน (วน `overview.shops`) — badge `PACKAGE_LABEL_TH`/สถานะ/`formatDate(nextRenewalAt)`; ร้าน **active** → reuse `SubscribeButton`/`UpgradeToProCard`/`ReactivateButton` + inventory `AdvanceWarningBanner`; ร้าน**ไม่ active** → `SwitchShopButton`
  - Theme source: การ์ด copy จาก `business/page.tsx` + `inventory/page.tsx` (โครงเดิมในแอป = Paces จริง); empty state จาก Paces
  - ระบุร้าน active ปัจจุบัน: `session.user.activeShopId ?? personalShopId`

- [ ] **Step 2: เขียน `page.tsx`** — โครง data wiring (RSC). Visual JSX copy ตาม Design Spec (HR1) — ห้าม compose เอง:

```tsx
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PageBreadcrumb from '@/components/PageBreadcrumb' // ยืนยัน path ตามหน้า admin/users
import { getSellerSubscriptionOverview } from '@/services/subscription-overview.service'
import { getPersonalShop } from '@/lib/shop-context'
// import reuse components ตาม Design Spec

export const metadata: Metadata = { title: 'แพ็กเกจของฉัน' }

export default async function SubscriptionsPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) redirect('/auth/sign-in')

  const overview = await getSellerSubscriptionOverview(userId)
  const personal = await getPersonalShop(userId)
  const activeShopId = (session!.user as { activeShopId?: string | null }).activeShopId ?? personal?.id ?? null

  // ส่ง overview.businessPackage → Section A card
  // วน overview.shops → Section B; isActive = shop.shopId === activeShopId
  //   isActive && ACTIVE+BASIC → <UpgradeToProCard/>; NOT_SUBSCRIBED → <SubscribeButton/>; LOCKED → <ReactivateButton/>
  //   !isActive → <SwitchShopButton shopId=... shopName=.../>
  //   วันต่ออายุ = formatDate(shop.nextRenewalAt); warn banner ใช้ shop.warnAdvance + shop.shortfall
  // (JSX เต็มตาม Design Spec — Paces primitive เท่านั้น)
  return null // แทนด้วย JSX ตาม Design Spec
}
```

> **ข้อควรระวัง (PII/serialize):** หน้าอยู่ใต้ Paces client layout → server data ถูก serialize เข้า flight. overview ไม่มี PII (มีแค่ shop/plan/balance) — ปลอดภัย. ถ้าเพิ่ม field ที่มี contact ในอนาคต ต้อง neutralize.
> **empty state:** ถ้า `overview.shops.length === 0` → การ์ด "ยังไม่มีร้านค้า"; business `NOT_SUBSCRIBED` → PackageTierGrid โชว์ตัวเลือกฟรี/upgrade ตามเดิม.

- [ ] **Step 3: เพิ่ม menu item** — `_seller-menu.ts` ใน STORE group children (ก่อน/หลัง `/inventory`):

```ts
{ url: '/subscriptions', slug: 'seller:subscriptions', label: 'แพ็กเกจของฉัน', icon: 'crown' },
```
> icon `'crown'` ต้องมีจริงใน tabler (reviewer เช็ค; UpgradeToProCard ใช้ crown อยู่แล้ว = ปลอดภัย). ถ้า UX อยากได้ icon อื่น → ถาม user (HR12).

- [ ] **Step 4: tsc**

Run: `node node_modules/typescript/lib/tsc.js --noEmit`
Expected: 0 error

- [ ] **Step 5: grep gates** (ไฟล์ที่แตะ)

Run: `rg "react-toastify|#7367F0|text-\[|bg-\[" "src/app/(paces)/seller/(dashboard)/subscriptions/"`
Expected: ไม่มี (เว้น arbitrary ที่มี comment justify)

- [ ] **Step 6: QA — `safepay-qa`** (Chrome DevTools MCP, seller.deepth.local:4000, test acct `0000000001`/`123456`): เปิด `/subscriptions` → เห็น Business Package card + การ์ดร้าน; ร้าน active มีปุ่มจัดการ, ร้านอื่นมีปุ่มสลับ; วันต่ออายุเป็น พ.ศ.; ไม่มี emoji/ม่วง; mobile ok

- [ ] **Step 7: Controller commit**

```bash
git add "src/app/(paces)/seller/(dashboard)/subscriptions/" "src/app/(paces)/seller/(dashboard)/_seller-menu.ts"
git commit -m "feat(subscriptions): seller hub /subscriptions + menu [Base: business/page.tsx + inventory/page.tsx]"
```

---

## Task 4: Admin overview `/admin/subscriptions` + table + menu

**Files:**
- Create: `src/app/(paces)/admin/(dashboard)/subscriptions/page.tsx`
- Create: `src/app/(paces)/admin/(dashboard)/subscriptions/components/data.ts`
- Create: `src/app/(paces)/admin/(dashboard)/subscriptions/components/SubscriptionsTable.tsx`
- Modify: `src/app/(paces)/admin/(dashboard)/_admin-menu.ts` (admin-business group)

**Interfaces:**
- Consumes: `prisma`, `formatDate`, `PageBreadcrumb`, `DataTable`, `TablePagination`, `FilterDropdown`, `Select`, `BUSINESS_PACKAGE_TIER_CONFIG`, `PACKAGE_LABEL_TH`.
- Produces:
```ts
// data.ts
export type AdminSubscriptionRow = {
  shopId: string
  shopName: string
  kind: 'PERSONAL' | 'BUSINESS'
  ownerName: string
  ownerUsername: string
  ownerProfileUrl: string           // buyer /u/{username}
  stockStatus: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED'
  stockPackage: 'BASIC' | 'PRO' | null
  stockRenewalTh: string            // formatDate | '—'
  bizTier: 'GROWTH' | 'PRO' | 'BUSINESS' | null
  bizStatus: 'NOT_SUBSCRIBED' | 'ACTIVE' | 'LOCKED_RENEWAL_FAILED'
  walletBalance: number
}
```

**⚠️ ก่อนเขียน: invoke `safepay-ux`** — Design Spec ตาราง admin (copy จาก `admin/users` `UsersTable.tsx` pattern: DataTable + badge helper + FilterDropdown). Theme source = `UsersTable.tsx`.

- [ ] **Step 1: invoke `safepay-ux`** — Design Spec `/admin/subscriptions` (ตาราง 6 คอลัมน์ + filter Stock status/Biz tier + search); Theme source `admin/(dashboard)/users/components/UsersTable.tsx`

- [ ] **Step 2: `data.ts`** — type + mapper (แยก mapping ออกจาก page เพื่อ test ง่าย):

```ts
import { formatDate } from '@/lib/format-date'

export type AdminSubscriptionRow = { /* ตามด้านบน */ }

// input = shop row จาก prisma query ใน page (ดู Step 3)
export function toAdminSubscriptionRow(s: {
  id: string; shopName: string; kind: string; logo: string | null; wallet: { balance: number } | null
  inventoryEntitlement: { status: string; package: string | null; nextRenewalAt: Date | null } | null
  user: { displayName: string; username: string; businessPackageSubscription: { tier: string; status: string } | null }
}): AdminSubscriptionRow {
  const ent = s.inventoryEntitlement
  const biz = s.user.businessPackageSubscription
  return {
    shopId: s.id,
    shopName: s.shopName,
    kind: s.kind as 'PERSONAL' | 'BUSINESS',
    ownerName: s.user.displayName,
    ownerUsername: s.user.username,
    ownerProfileUrl: `/u/${s.user.username}`,
    stockStatus: (ent?.status ?? 'NOT_SUBSCRIBED') as AdminSubscriptionRow['stockStatus'],
    stockPackage: (ent?.package ?? null) as 'BASIC' | 'PRO' | null,
    stockRenewalTh: ent?.nextRenewalAt ? formatDate(ent.nextRenewalAt) : '—',
    bizTier: (biz?.tier ?? null) as AdminSubscriptionRow['bizTier'],
    bizStatus: (biz ? biz.status : 'NOT_SUBSCRIBED') as AdminSubscriptionRow['bizStatus'],
    walletBalance: s.wallet?.balance ?? 0,
  }
}
```

- [ ] **Step 3: `page.tsx`** — RSC query + map + render (copy โครงจาก `admin/users/page.tsx`):

```tsx
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb' // ตาม path จริงในหน้า users
import SubscriptionsTable from './components/SubscriptionsTable'
import { toAdminSubscriptionRow } from './components/data'

export const metadata: Metadata = { title: 'แพ็กเกจ' }

export default async function AdminSubscriptionsPage() {
  const shops = await prisma.shop.findMany({
    where: { deletedAt: null },
    select: {
      id: true, shopName: true, kind: true, logo: true,
      wallet: { select: { balance: true } },
      inventoryEntitlement: { select: { status: true, package: true, nextRenewalAt: true } },
      user: {
        select: {
          displayName: true, username: true,
          businessPackageSubscription: { select: { tier: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  // PII: query ไม่ดึง phone/email เจ้าของ → ไม่มี PII leak ใน flight (neutralize by omission)
  const rows = shops.map(toAdminSubscriptionRow)
  return (
    <>
      <PageBreadcrumb title="แพ็กเกจ" trail={[{ label: 'ผู้ดูแล' }, { label: 'แพ็กเกจ' }]} />
      <SubscriptionsTable rows={rows} />
    </>
  )
}
```

- [ ] **Step 4: `SubscriptionsTable.tsx`** — client, copy pattern จาก `UsersTable.tsx` (DataTable + @tanstack/react-table + badge helpers + `FilterDropdown` สำหรับ stockStatus/bizTier + globalFilter search). Visual ตาม Design Spec. Badge สี: ACTIVE=`bg-success/10 text-success`, LOCKED=`bg-danger/10 text-danger`, NOT_SUBSCRIBED=`bg-default-200 text-default-600` (Paces token; ยืนยันกับ UsersTable helper).

- [ ] **Step 5: menu item** — `_admin-menu.ts` (admin-business group):

```ts
{ url: '/subscriptions', slug: 'admin:subscriptions', label: 'แพ็กเกจ', icon: 'crown' },
```

- [ ] **Step 6: tsc + grep gates**

Run: `node node_modules/typescript/lib/tsc.js --noEmit` → 0
Run: `rg "react-toastify|#7367F0|text-\[|bg-\[" "src/app/(paces)/admin/(dashboard)/subscriptions/"` → ไม่มี (เว้น comment)

- [ ] **Step 7: QA — `safepay-qa`** (admin.deepth.local:4000): เปิด `/admin/subscriptions` → ตารางแสดงทุกร้าน + plan + biz tier + wallet; filter/search ทำงาน; วันต่ออายุ พ.ศ.; ไม่มี emoji/ม่วง; ไม่มี PII เกินจำเป็น

- [ ] **Step 8: Controller commit**

```bash
git add "src/app/(paces)/admin/(dashboard)/subscriptions/" "src/app/(paces)/admin/(dashboard)/_admin-menu.ts"
git commit -m "feat(subscriptions): admin overview /admin/subscriptions + table + menu [Base: admin/users UsersTable.tsx]"
```

---

## Self-Review (ผู้เขียน plan)

- **Spec coverage:** §3 Seller hub → Task 1+2+3 · §4 Admin → Task 4 · §5 services → Task 1 · §6 rules → Global Constraints + per-task gates · §7 edge cases → Task 1 (NOT_SUBSCRIBED/LOCKED logic) + Task 3 (empty state) · D-1 revised (active-only manage + switch) → Task 2+3. ครบ.
- **Placeholder:** JSX visual ของ page/table ตั้งใจเว้นให้ `safepay-ux` map theme (HR1/HR8) — ไม่ใช่ placeholder แต่เป็น gate บังคับของโปรเจกต์; data-wiring/service/logic เป็นโค้ดจริงครบ.
- **Type consistency:** `ShopSubscriptionRow`/`BusinessPackageSummary`/`SellerSubscriptionOverview` (Task 1) ใช้ต่อใน Task 3; `AdminSubscriptionRow`/`toAdminSubscriptionRow` (Task 4) สอดคล้อง. `SwitchShopButton({shopId,shopName})` ตรงกับที่ Task 3 เรียก.
- **ต้องยืนยันตอน implement (developer):** path จริงของ `PageBreadcrumb` (ตาม import ในหน้า users), export ของ `EntitlementStatus`/`InventoryPackage`, field `Shop.shopName/logo/kind`, `getBalance` signature — ทั้งหมด extract มาแล้วแต่ให้ dev เช็คไฟล์ก่อนพึ่ง.

## เปิดค้าง (ตัดสินตอน ux/plan execution)
- Layout Section B: การ์ดแนวตั้ง vs grid (ขึ้นกับจำนวนร้าน) — `safepay-ux` ตัดสิน
- icon เมนู `crown` (UpgradeToProCard ใช้อยู่) — ถ้า UX เสนออื่น ต้องถาม user (HR12)

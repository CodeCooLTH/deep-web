# FB-style Seller Account Switcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **SafePay note:** งานนี้ ≥3 tasks + แตะ UI → ต้องเดินตาม Hard Rule 4 (agent team) + Hard Rule 8 (safepay-ux gate ก่อน dev UI). ลำดับต่อ task: safepay-developer → safepay-reviewer (8-gate) → safepay-qa (Playwright/Chrome MCP) → Controller commit. **ห้าม developer commit เอง** (feedback_parallel_dev_agents_no_commit) — Controller verify diff แล้ว commit.

**Goal:** ปรับ profile dropdown มุมขวาบนของ seller (Paces) เป็น pattern Facebook และให้ active business account สะท้อน logo+ชื่อ ที่ topbar button + sidebar brand + sidebar user block.

**Architecture:** ต่อยอด infra feat 00008 ที่มี `activeShopId` + `/api/business/switch-context` + `/api/business/context` อยู่แล้ว. เติมข้อมูล active shop (name/logo/kind) เข้า `session.user` ที่ session callback (แหล่ง single source, มีทันที ไม่ต้อง fetch), เพิ่ม `logo` ใน context API สำหรับ list, แล้ว redesign UI 3 จุดให้อ่านค่าจาก `useSession()`.

**Tech Stack:** Next.js 16 (App Router) · NextAuth v4 · Prisma/PostgreSQL · Paces (Preline 4 + Tailwind 4, no MUI) · Playwright + Chrome DevTools MCP (QA)

## Global Constraints

- Surface = **seller Paces (`(paces)/**`) เท่านั้น** — ห้ามแตะ buyer Vuexy
- Skin = Paces primary `#236dc9` — ห้ามฟ้า Facebook (Hard Rule 6)
- ทุก UI = Paces primitive (`.dropdown-item`/`.badge`/`bg-primary/5`/`bg-primary/15`/`size-*`/token) — **ห้าม arbitrary value** `text-[NNpx]`/`bg-[rgba]`/hex (Hard Rule 7)
- Toast = `pacesToast` เท่านั้น (Hard Rule 9); react-toastify ต้อง 0 ใน `(paces)/**`
- Icons = `@iconify/react` ผ่าน `@/components/wrappers/Icon`, tabler names
- Font = Anuphan (ห้าม font-mono บนข้อความไทย — feedback_font_mono_breaks_anuphan)
- Commit ที่แตะ UI ต้องมี `Base:` line ชี้ theme file (Hard Rule 3)
- ห้าม leak PII เพิ่ม; session query scope ด้วย `token.userId` + re-verify membership เดิม (feedback_rsc_dal_authz)
- Logic การสลับ (`handleSwitch` → switch-context → `update()` → `router.refresh()`) — **คงเดิม ห้ามแก้**
- ไม่มี migration (ใช้ field `Shop.logo` ที่มีอยู่แล้ว) — ไม่แตะ schema.prisma (feedback_qa_agent_no_prisma_pull)
- tsc = `node node_modules/typescript/lib/tsc.js --noEmit` (project_prod_qa_and_deploy_nuances)
- dev server: **user รันเอง** ที่ `seller.deepth.local:4000` — Claude ไม่ start (feedback_qa_domains)

---

## File Structure

| ไฟล์ | responsibility | task |
|---|---|---|
| `src/lib/auth.ts` | session callback — เติม `activeShopName/Logo/Kind` | 1 |
| `src/app/api/business/context/route.ts` | เพิ่ม `logo` ใน businesses select | 2 |
| `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx` | topbar button + FB dropdown redesign | 3 |
| `src/components/SidebarBrand.tsx` (ใหม่) | client brand: business → shop logo+ชื่อ, ไม่งั้น `<AppLogo/>` | 4 |
| `src/layouts/components/Sidenav/index.tsx` | ใช้ `<SidebarBrand/>` แทน `<AppLogo/>` ใน logo-box | 4 |
| `src/layouts/components/Sidenav/components/UserProfileSettings.tsx` | user block สะท้อน active account | 5 |

**Shared type (locked contract — ทุก task ใช้ชื่อ field เดียวกันนี้):**
```ts
// session.user (เพิ่มจากของเดิม)
activeShopKind?: 'PERSONAL' | 'BUSINESS'   // 'PERSONAL' เมื่อ active เป็นส่วนตัว
activeShopName?: string | null              // null เมื่อ PERSONAL
activeShopLogo?: string | null              // null เมื่อ PERSONAL หรือร้านไม่มีโลโก้
// /api/business/context businesses[] (เพิ่ม)
logo: string | null
```

---

### Task 1: Session — เติมข้อมูล active shop (name/logo/kind)

**Files:**
- Modify: `src/lib/auth.ts` (session callback, รอบ ๆ บรรทัด 605–641)

**Interfaces:**
- Consumes: `resolvedActiveShopId`, `user.shops[0]?.id` (Personal id), `prisma` — มีในสโคปแล้ว
- Produces: `session.user.activeShopKind` `activeShopName` `activeShopLogo` (Task 3/4/5 อ่านค่า)

- [ ] **Step 1: เพิ่ม resolve active shop identity** — หลังบล็อก `try { ... } catch { ... }` ที่ set `resolvedActiveShopId` (หลังบรรทัด ~633) ก่อน `(session as any).user = {`:

```ts
          // active shop identity (FB switcher) — query เฉพาะเมื่อ active เป็น BUSINESS
          // (resolvedActiveShopId != Personal id). PERSONAL → null → consumer fallback avatar/displayName
          const personalShopId = user.shops[0]?.id ?? null;
          let activeShopKind: "PERSONAL" | "BUSINESS" = "PERSONAL";
          let activeShopName: string | null = null;
          let activeShopLogo: string | null = null;
          if (resolvedActiveShopId && resolvedActiveShopId !== personalShopId) {
            const activeShop = await prisma.shop.findUnique({
              where: { id: resolvedActiveShopId },
              select: { shopName: true, logo: true },
            });
            if (activeShop) {
              activeShopKind = "BUSINESS";
              activeShopName = activeShop.shopName;
              activeShopLogo = activeShop.logo;
            }
          }
```

- [ ] **Step 2: เติม field เข้า session.user** — แก้ object literal `(session as any).user = { ... }` เพิ่ม 3 field ต่อจาก `activeShopId: resolvedActiveShopId, activeShopRole, hasBusinessMembership,`:

```ts
            activeShopId: resolvedActiveShopId, activeShopRole, hasBusinessMembership,
            activeShopKind, activeShopName, activeShopLogo,
```

- [ ] **Step 3: type-check**

Run: `node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep auth.ts`
Expected: ไม่มี error ที่ `auth.ts`

- [ ] **Step 4: Controller commit** (developer ห้าม commit)

```bash
git add src/lib/auth.ts
git commit -m "feat(00008): session เติม activeShopName/Logo/Kind สำหรับ FB switcher"
```

---

### Task 2: Context API — เพิ่ม logo ใน businesses[]

**Files:**
- Modify: `src/app/api/business/context/route.ts` (memberships select + businesses map)

**Interfaces:**
- Produces: `businesses[].logo: string | null` (Task 3 dropdown list อ่าน)

- [ ] **Step 1: เพิ่ม logo ใน shop select** — ใน `prisma.shopMember.findMany` เปลี่ยน shop select:

```ts
        shop: {
          select: { id: true, shopName: true, logo: true, packageLockedAt: true, packageLockReason: true, deletedAt: true },
        },
```

- [ ] **Step 2: map logo เข้า response** — ใน `memberships.map`:

```ts
    const businesses = memberships.map((m) => ({
      shopId: m.shop.id,
      shopName: m.shop.shopName,
      logo: m.shop.logo,
      role: m.role,
      locked: m.shop.packageLockedAt !== null,
      lockReason: m.shop.packageLockReason,
      deletedAt: m.shop.deletedAt,
    }));
```

- [ ] **Step 3: type-check**

Run: `node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep context/route`
Expected: ไม่มี error

- [ ] **Step 4: Controller commit**

```bash
git add "src/app/api/business/context/route.ts"
git commit -m "feat(00008): context API คืน logo ต่อ business สำหรับ switcher list"
```

---

### Task 3: Topbar button + FB dropdown redesign

**Files:**
- Modify: `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx`

**Interfaces:**
- Consumes: `session.user.activeShopKind/Name/Logo` (Task 1), `context.businesses[].logo` (Task 2), `context.personal`, `user.avatar/displayName`
- **คงเดิม:** `handleSwitch`, `handleItemClick`, fetch `/api/business/context`, เมนู แพ็กเกจธุรกิจ/โปรไฟล์/เปิดหน้าร้าน/ออกจากระบบ

**Prerequisite:** invoke `safepay-ux` ออก Design Spec ของ dropdown (อิง `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`) ก่อนเขียนโค้ด (Hard Rule 8). ยึด mockup `docs/superpowers/specs/2026-07-04-seller-account-switcher-fb-style.html`.

- [ ] **Step 1: เพิ่ม active-identity helper + logo type** — ใน component หลังดึง `user`:

```ts
  // identity ที่ต้องโชว์ (topbar button + active box) — business active → shop, ไม่งั้น personal
  const isBusiness = user?.activeShopKind === 'BUSINESS'
  const activeName = isBusiness ? (user?.activeShopName ?? 'ร้านค้า') : displayName
  const activeLogo = isBusiness ? (user?.activeShopLogo ?? null) : (user?.avatar ?? null)
  const activeRoleLabel = isBusiness ? 'ธุรกิจ' : 'ส่วนตัว'
```
เพิ่ม field ใน user type cast: `activeShopKind?: 'PERSONAL' | 'BUSINESS'; activeShopName?: string | null; activeShopLogo?: string | null`
และใน `BusinessContextItem` เพิ่ม `logo: string | null`.

- [ ] **Step 2: reusable avatar snippet** — เพิ่ม helper render วงกลม (logo/avatar หรือ fallback icon). วางใน component:

```tsx
  const renderAvatar = (src: string | null | undefined, kind: 'business' | 'personal', size: string) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={`${size} rounded-full object-cover shrink-0`} />
    ) : (
      <span className={`${size} rounded-full bg-primary/15 text-primary inline-flex items-center justify-center shrink-0`}>
        <Icon icon={kind === 'business' ? 'building-store' : 'user'} className="size-1/2" />
      </span>
    )
```

- [ ] **Step 3: topbar button สะท้อน active** — แทนบล็อกปุ่ม `<button className="hs-dropdown-toggle ...">` เดิม (avatar + displayName + @username) ด้วย:

```tsx
      <button className="hs-dropdown-toggle topbar-link ms-2.5 cursor-pointer items-center px-3! flex" aria-haspopup="menu" aria-expanded="false" aria-label="Dropdown">
        {renderAvatar(activeLogo, isBusiness ? 'business' : 'personal', 'size-8 lg:me-3')}
        <div className="hidden lg:flex items-center gap-1.5">
          <span className="flex flex-col items-start">
            <h5 className="pro-username">{activeName}</h5>
            <span className="text-xs/none mb-0.5">{activeRoleLabel}</span>
          </span>
          <Icon icon="chevron-down" className="align-middle" />
        </div>
      </button>
```

- [ ] **Step 4: dropdown — active box + list + เมนู** — แทนบล็อกภายใน `<div className="hs-dropdown-menu min-w-60">` ตั้งแต่ header เดิม + tier/trust row + บล็อก `hasBusinessMembership && (...)` ด้วยโครง FB (ตัด tier/trust row ทิ้ง):

```tsx
      <div className="hs-dropdown-menu min-w-72 p-2" role="menu" aria-orientation="vertical">
        {/* active account — กล่องไฮไลต์ (แทนกล่องน้ำเงิน FB ด้วย border-primary) */}
        <div className="border border-primary bg-primary/5 rounded-lg flex items-center gap-3 px-3 py-2.5">
          {renderAvatar(activeLogo, isBusiness ? 'business' : 'personal', 'size-9')}
          <div className="min-w-0">
            <p className="text-body-color truncate text-sm font-semibold">{activeName}</p>
            <p className="text-default-400 truncate text-xs">{isBusiness ? (user?.activeShopRole === 'ADMIN' ? 'ผู้ดูแล' : 'เจ้าของ') : 'ส่วนตัว'}</p>
          </div>
        </div>

        {/* สลับบัญชี — เฉพาะ seller ที่มี business membership + มีบัญชีอื่นนอกจาก active */}
        {hasBusinessMembership && (
          <>
            <div className="px-2 pt-3 pb-1"><span className="text-default-400 text-xs">สลับบัญชี</span></div>

            {/* personal (ซ่อนถ้า personal = active) */}
            {context?.personal && activeShopId !== context.personal.shopId && (
              <button type="button" role="menuitem" onClick={() => handleSwitch(context.personal!.shopId, false)} disabled={switching} className="dropdown-item w-full flex items-center gap-3 text-start disabled:opacity-50">
                {renderAvatar(user?.avatar, 'personal', 'size-7')}
                <span className="flex-1 truncate">{displayName}</span>
                <span className="badge bg-default-100 text-default-500 shrink-0">ส่วนตัว</span>
              </button>
            )}

            {/* businesses (ซ่อนตัวที่ = active) */}
            {context?.businesses.filter((b) => b.shopId !== activeShopId).map((b) => (
              <button key={b.shopId} type="button" role="menuitem" onClick={() => handleSwitch(b.shopId, b.locked)} disabled={switching} className="dropdown-item w-full flex items-center gap-3 text-start disabled:opacity-50">
                {renderAvatar(b.logo, 'business', 'size-7')}
                <span className="flex-1 truncate">{b.shopName}</span>
                <span className={`badge shrink-0 ${b.role === 'OWNER' ? 'bg-primary/15 text-primary' : 'bg-info/15 text-info'}`}>{b.role === 'OWNER' ? 'เจ้าของ' : 'ผู้ดูแล'}</span>
                {b.locked && <span className="badge bg-danger/15 text-danger inline-flex shrink-0 items-center"><Icon icon="lock" className="size-3" /></span>}
              </button>
            ))}
          </>
        )}

        <div className="dropdown-divider"></div>

        <Link href="/business" className="dropdown-item"><Icon icon="rocket" className="me-1 fs-lg align-middle" /><span className="align-middle">แพ็กเกจธุรกิจ</span></Link>
        <Link href="/shop" className="dropdown-item"><Icon icon="settings" className="me-1 fs-lg align-middle" /><span className="align-middle">โปรไฟล์ / ตั้งค่าร้าน</span></Link>
        {user?.username && (
          <a href={`${resolveBuyerBaseUrl()}/u/${user.username}`} target="_blank" rel="noopener noreferrer" className="dropdown-item">
            <Icon icon="building-store" className="me-1 fs-lg align-middle" /><span className="align-middle">เปิดหน้าร้าน</span><Icon icon="external-link" className="ms-auto size-3.5 align-middle" />
          </a>
        )}
        <div className="dropdown-divider"></div>
        {userProfileMenuData.map((item, idx) => (
          <Fragment key={idx}>
            <Link href={item.link} onClick={(e) => handleItemClick(e, item)} className={`dropdown-item${item.className ? ' ' + item.className : ''}`}>
              <Icon icon={item.icon} className="me-1 fs-lg align-middle" /><span className="align-middle">{item.label}</span>
            </Link>
            {item.divider && <div className="dropdown-divider"></div>}
          </Fragment>
        ))}
      </div>
```
เพิ่ม `activeShopRole?: 'OWNER' | 'ADMIN'` ใน user type cast (มีใน session อยู่แล้ว).

- [ ] **Step 5: type-check + grep gate**

Run: `node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep UserDropdownDetailed`
Expected: ไม่มี error
Run: `rg "text-\[|bg-\[rgba|#[0-9a-fA-F]{6}" src/layouts/components/TopBar/components/UserDropdownDetailed.tsx`
Expected: ไม่มีผล (ไม่มี arbitrary value — Hard Rule 7)

- [ ] **Step 6: Controller commit**

```bash
git add src/layouts/components/TopBar/components/UserDropdownDetailed.tsx
git commit -m "feat(00008): FB-style profile switcher — topbar button + dropdown

Base: theme/paces/Admin/TS/src/layouts/components/TopBar/components/ProfileDropdown.tsx"
```

---

### Task 4: Sidebar brand สะท้อน active business

**Files:**
- Create: `src/components/SidebarBrand.tsx`
- Modify: `src/layouts/components/Sidenav/index.tsx`

**Interfaces:**
- Consumes: `session.user.activeShopKind/Name/Logo` (Task 1), `<AppLogo/>` เดิม
- Produces: `<SidebarBrand/>` (default export)

- [ ] **Step 1: สร้าง SidebarBrand** — `src/components/SidebarBrand.tsx`:

```tsx
'use client'

import AppLogo from '@/components/AppLogo'
import Icon from '@/components/wrappers/Icon'
import { useSession } from 'next-auth/react'

/**
 * Base: src/components/AppLogo.tsx (fallback ตัวเดิม)
 * business active → โลโก้ร้าน + ชื่อร้าน; ไม่งั้น → โลโก้ Deep เดิม
 */
const SidebarBrand = () => {
  const { data: session } = useSession()
  const user = (session as any)?.user as
    | { activeShopKind?: 'PERSONAL' | 'BUSINESS'; activeShopName?: string | null; activeShopLogo?: string | null }
    | undefined

  if (user?.activeShopKind !== 'BUSINESS') return <AppLogo />

  return (
    <span className="flex items-center gap-2 min-w-0">
      {user.activeShopLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.activeShopLogo} alt="" className="size-7 rounded-lg object-cover shrink-0" />
      ) : (
        <span className="size-7 rounded-lg bg-primary/15 text-primary inline-flex items-center justify-center shrink-0">
          <Icon icon="building-store" className="size-4" />
        </span>
      )}
      <span className="logo-lg text-default-800 truncate text-sm font-bold">{user.activeShopName ?? 'ร้านค้า'}</span>
    </span>
  )
}

export default SidebarBrand
```

- [ ] **Step 2: ใช้ใน Sidenav** — `src/layouts/components/Sidenav/index.tsx`: เปลี่ยน import `AppLogo` → `SidebarBrand` และ `<AppLogo />` ใน logo-box → `<SidebarBrand />`:

```tsx
import SidebarBrand from '@/components/SidebarBrand'
// ...
      <Link href="/" className="logo-box min-h-(--topbar-height) sticky top-0 flex items-center justify-start px-6 backdrop-blur-xs">
        <SidebarBrand />
      </Link>
```

- [ ] **Step 3: type-check + grep gate**

Run: `node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep -E "SidebarBrand|Sidenav/index"`
Expected: ไม่มี error
Run: `rg "text-\[|bg-\[rgba|#[0-9a-fA-F]{6}" src/components/SidebarBrand.tsx`
Expected: ไม่มีผล

- [ ] **Step 4: Controller commit**

```bash
git add src/components/SidebarBrand.tsx src/layouts/components/Sidenav/index.tsx
git commit -m "feat(00008): sidebar brand สะท้อนโลโก้+ชื่อ business ที่ active

Base: src/components/AppLogo.tsx"
```

---

### Task 5: Sidebar user block สะท้อน active account

**Files:**
- Modify: `src/layouts/components/Sidenav/components/UserProfileSettings.tsx`

**Interfaces:**
- Consumes: `session.user.activeShopKind/Name/Logo/Role` (Task 1)

- [ ] **Step 1: เพิ่ม active-identity + type** — ขยาย user type cast: `{ id; displayName; username; avatar; isShop?; activeShopKind?: 'PERSONAL'|'BUSINESS'; activeShopName?: string|null; activeShopLogo?: string|null; activeShopRole?: 'OWNER'|'ADMIN' }` แล้วเพิ่ม:

```ts
  const isBusiness = user?.activeShopKind === 'BUSINESS'
  const dispName = isBusiness ? (user?.activeShopName ?? 'ร้านค้า') : (user?.displayName ?? user?.username ?? 'ผู้ขาย')
  const dispLogo = isBusiness ? (user?.activeShopLogo ?? null) : (user?.avatar ?? null)
  const dispRole = isBusiness ? (user?.activeShopRole === 'ADMIN' ? 'ผู้ดูแล' : 'เจ้าของ') : 'ผู้ขาย'
```

- [ ] **Step 2: render จาก dispName/Logo/Role** — แก้บล็อก avatar+name+role ใน `<Link href="/dashboard">`:

```tsx
            {dispLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dispLogo} alt={dispName} className="mb-3 size-9 rounded-full object-cover" />
            ) : isBusiness ? (
              <span className="mb-3 size-9 rounded-full bg-primary/15 text-primary inline-flex items-center justify-center">
                <Icon icon="building-store" className="size-5" />
              </span>
            ) : (
              <Image src={user1} alt="user-image" className="mb-3 size-9 rounded-full" />
            )}
            <span className="sidenav-user-name block font-bold text-nowrap">{dispName}</span>
            <span className="text-xs font-semibold" data-lang="user-role">{dispRole}</span>
```

- [ ] **Step 3: type-check + grep gate**

Run: `node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep UserProfileSettings`
Expected: ไม่มี error
Run: `rg "text-\[|bg-\[rgba|#[0-9a-fA-F]{6}" src/layouts/components/Sidenav/components/UserProfileSettings.tsx`
Expected: ไม่มีผล

- [ ] **Step 4: Controller commit**

```bash
git add src/layouts/components/Sidenav/components/UserProfileSettings.tsx
git commit -m "feat(00008): sidebar user block สะท้อน active account

Base: theme/paces/Admin/TS/src/layouts/components/Sidenav/components/UserProfileSettings.tsx"
```

---

### Task 6: QA — Playwright E2E + Chrome DevTools MCP visual

**Files:**
- Create/Modify: `e2e/seller-account-switcher.spec.ts` (ถ้าโครง e2e มี — ไม่งั้น Chrome MCP manual)

**Prerequisite:** safepay-reviewer ผ่าน 8-gate ทุก task ก่อน. user รัน dev server ที่ `seller.deepth.local:4000`. seed: user ที่มี ≥1 business membership (owner) + 1 admin membership + 1 personal; อย่างน้อย 1 business มี `logo`, 1 ไม่มี.

- [ ] **Step 1: scenario checklist (safepay-qa)** ผ่าน Chrome DevTools MCP:
  1. personal-only user → dropdown ไม่มี "สลับบัญชี"; topbar/sidebar = avatar+displayName เดิม
  2. user มี business → เปิด dropdown เห็น active box + list บัญชีอื่น (ไม่ซ้ำ active) พร้อมโลโก้/badge บทบาท
  3. กดสลับไป business → topbar button + sidebar brand + sidebar user block เปลี่ยนเป็นโลโก้+ชื่อร้าน (หลัง `router.refresh()`)
  4. business ไม่มี logo → fallback icon `building-store` (ไม่รูปแตก)
  5. business locked → กดสลับไม่ได้ + `pacesToast.error`; มี 🔒 ใน list
  6. สลับกลับ personal → ทุกจุดกลับเป็น identity ส่วนตัว
  7. mobile viewport → dropdown/สลับใช้ได้, tap target ≥44px
- [ ] **Step 2: grep gate ทั้ง diff** — `rg "react-toastify" "src/app/(paces)/" src/layouts` = 0; ไม่มี arbitrary value ใน 4 ไฟล์ UI
- [ ] **Step 3: บันทึกผล PASS/FAIL + evidence** ใน `docs/qa/` ก่อน Gate 2 sign-off

---

## Self-Review

**Spec coverage:** §4 session → Task 1 ✓ · §5 API logo → Task 2 ✓ · §6.1 topbar button + §6.2 dropdown → Task 3 ✓ · §6.3 sidebar brand → Task 4 ✓ · §6.4 user block → Task 5 ✓ · §7 edge cases (logo null/locked/fallback) → Task 3/4/5 render + Task 6 QA ✓ · §10 QA → Task 6 ✓

**Placeholder scan:** โค้ดครบทุก step; ไม่มี TBD/TODO.

**Type consistency:** `activeShopKind`/`activeShopName`/`activeShopLogo`/`activeShopRole` ใช้ชื่อเดียวกันทุก task (1→3,4,5); `businesses[].logo` (2→3); `renderAvatar(src, kind, size)` signature เดียวใน Task 3.

**หมายเหตุ execution:** ทุก task ต่อ safepay-developer → safepay-reviewer → (จบทุก task) safepay-qa; **Controller เป็นผู้ commit** (developer ห้าม). Task 3 ต้อง invoke safepay-ux ก่อน (Hard Rule 8). branch `feat/seller-account-switcher-fb` (มี spec commit แล้ว) — ยังไม่ push จน QA เขียว + user sign-off (auto-deploy prod on push main).

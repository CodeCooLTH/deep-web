# FB-style Account Switcher (Seller Paces) — Design Spec

- **วันที่:** 2026-07-04
- **Surface:** Seller Paces เท่านั้น (`seller.deepthailand.app` / `(paces)/**`)
- **ต่อยอดจาก:** feat 00008 — Business Account & Packages (infra switcher มีอยู่แล้ว)
- **Mockup:** `docs/superpowers/specs/2026-07-04-seller-account-switcher-fb-style.html` (Mobile + Tablet + Desktop)
- **Skin:** Paces primary `#236dc9` — **ห้าม**ใช้ฟ้า Facebook (Hard Rule 6: ref = interaction pattern เท่านั้น, skin = theme ปัจจุบัน)

---

## 1. Goal

ปรับ profile dropdown มุมขวาบนของ seller ให้เป็น pattern แบบ Facebook (account switcher: บัญชีที่ active อยู่ในกล่องไฮไลต์บนสุด, บัญชีอื่น list ใต้ลงมาพร้อมโลโก้/avatar) และเมื่อ **switch เป็น business account** ให้ **logo + ชื่อ** เปลี่ยนตามทั้งที่ **ปุ่มมุมขวาบน** และ **โลโก้แบรนด์ใน sidebar**

## 2. ขอบเขต (scope)

- **In:** redesign dropdown, สะท้อน active account (logo+ชื่อ) ที่ topbar button + sidebar brand + sidebar user block, เพิ่ม logo ใน context API, enrich session ด้วยข้อมูล active shop
- **Out:** buyer Vuexy (ไม่แตะ), การสร้าง/จัดการ business account (มีหน้า `/business` อยู่แล้ว), logic การ switch (คงเดิม), tier/trust score ใน dropdown (**ตัดออก** ให้สะอาดแบบ FB)

## 3. Non-goals / คงเดิม

- Logic การสลับบัญชี: `handleSwitch → POST /api/business/switch-context → useSession().update({activeShopId}) → router.refresh()` — **ไม่แตะ**
- 2-layer verify (jwt + session re-verify membership) — คงไว้
- เมนู แพ็กเกจธุรกิจ / โปรไฟล์-ตั้งค่าร้าน / เปิดหน้าร้าน / ออกจากระบบ — คงไว้

---

## 4. Data flow — ที่มาของ logo + ชื่อ active account

ปัญหาปัจจุบัน: `session.user` มี `activeShopId` แต่ไม่มีชื่อ/โลโก้ของร้านที่ active → topbar โชว์ identity ส่วนตัวเสมอ

**แก้ที่ `session` callback (`src/lib/auth.ts`):** หลัง resolve+verify `resolvedActiveShopId` อยู่แล้ว → ถ้า active ชี้ร้าน **BUSINESS** (`resolvedActiveShopId !== personalShopId`) ให้ query `shop.findUnique({ select: { shopName, logo } })` 1 ครั้ง (indexed by id) แล้วเติมเข้า session:

```
session.user.activeShopKind : 'PERSONAL' | 'BUSINESS'
session.user.activeShopName : string | null   // null เมื่อ PERSONAL
session.user.activeShopLogo : string | null    // null เมื่อ PERSONAL หรือร้านไม่มีโลโก้
```

- active = PERSONAL → ทั้ง 3 ค่า = kind 'PERSONAL' + name/logo null → consumer fallback ไป `user.avatar` + `user.displayName` (พฤติกรรมเดิม)
- ต้นทุน: +1 query เฉพาะเมื่อ active เป็น business (ส่วนน้อย); PERSONAL ไม่ query เพิ่ม
- fail-closed เดิมคงอยู่: resolve business ไม่ได้ → fallback Personal → name/logo null อัตโนมัติ

## 5. API — เพิ่ม logo ใน context

`GET /api/business/context` (`src/app/api/business/context/route.ts`): เพิ่ม `logo` ใน select ของ `businesses[]` (และ personal ถ้าต้องใช้ — แต่ personal entry ใช้ `user.avatar` เป็นหลัก)

```
businesses[].logo : string | null   // ใหม่ — ใช้ render avatar ใน list
```

Response contract อื่นคงเดิม (personal/subscription/businesses/hasBusinessMembership)

## 6. UI

### 6.1 Topbar profile button (มุมขวาบน) — `UserDropdownDetailed.tsx`
- `activeShopKind === 'BUSINESS'` → โชว์ `activeShopLogo` + `activeShopName` (fallback icon `building-store` ในวงกลม ถ้า logo null)
- ไม่งั้น → `user.avatar` + `user.displayName` (เดิม)

### 6.2 Dropdown — FB pattern (Paces skin)

```
┌───────────────────────────────────────┐
│ ┌───────────────────────────────────┐ │  active account — กล่องไฮไลต์ (border-primary + bg-primary/5)
│ │ [โลโก้/avatar]  ชื่อ active         │ │  business → shopName + role; personal → displayName
│ │                 บทบาท               │ │  (ไม่มี tier/trust — ตัดออก)
│ └───────────────────────────────────┘ │
│ สลับบัญชี                              │  heading (แสดงเมื่อมี ≥1 บัญชีอื่น)
│ [avatar] Sekson Oonnom        ส่วนตัว  │  personal entry (displayName + user.avatar)
│ [โลโก้]  ติ่งนอล            ผู้ดูแล 🔒  │  business entries (shopName + logo) — ไม่ซ้ำ active
│ ─────────────────────────────────────  │
│  🚀 แพ็กเกจธุรกิจ                        │  เมนูเดิม
│  ⚙  โปรไฟล์ / ตั้งค่าร้าน                │
│  🏬 เปิดหน้าร้าน ↗                       │
│ ─────────────────────────────────────  │
│  ⎋  ออกจากระบบ                          │
└───────────────────────────────────────┘
```

- active box: `border border-primary rounded bg-primary/5` (แทนกล่องน้ำเงิน FB), โลโก้กลม `size-9`, ชื่อ `font-semibold`, บทบาท subline `text-xs text-default-400` (เจ้าของ/ผู้ดูแล/ส่วนตัว)
- list บัญชีอื่น: `dropdown-item` เดิม แต่ **แทน ●/○ ด้วยโลโก้/avatar กลม** `size-7` + badge บทบาทด้านขวา + 🔒 (`icon lock`) ถ้า locked
- personal entry: `user.displayName` + `user.avatar` (ไม่ใช่ shopName "ร้านของ X"); ถ้า personal = active → ไม่แสดงซ้ำใน list
- **ตัด row tier + trust score ออกทั้งหมด**
- fallback avatar: logo null → วงกลม `bg-default-100` + icon `building-store` (business) / icon `user` (personal ไม่มี avatar)
- ทุก primitive = Paces (`.dropdown-item`/`.badge`/`bg-primary/5`/`size-*`/token) — ห้าม arbitrary value (Hard Rule 7)

### 6.3 Sidebar brand — `AppLogo` → `SidebarBrand` (client)
- ห่อ logo-box ใน `Sidenav/index.tsx` ด้วย client component อ่าน `useSession()`:
  - `activeShopKind === 'BUSINESS'` → โลโก้ร้าน (`size` เท่า logo-lg) + ชื่อร้าน (truncate); logo null → icon `building-store` + ชื่อ
  - ไม่งั้น → `<AppLogo />` เดิม (โลโก้ Deep) — fallback
- คง collapsed state (logo-sm) — business ไม่มี logo-sm แยก → ใช้โลโก้ร้านย่อ/หรือ icon

### 6.4 Sidebar user block — `UserProfileSettings.tsx`
- สะท้อน active account ให้ consistent: business active → shop logo + shopName + บทบาท (เจ้าของ/ผู้ดูแล) แทน avatar+displayName+"ผู้ขาย"; personal → เดิม

## 7. Edge cases

| กรณี | พฤติกรรม |
|---|---|
| ไม่มี business membership | ไม่มี list "สลับบัญชี"; topbar/sidebar = ส่วนตัวเสมอ (เดิม) |
| logo ร้าน = null | fallback icon `building-store` วงกลม — ไม่ใช่รูปแตก |
| active business ถูกลบ/หลุด membership | session callback fallback Personal → logo+ชื่อกลับเป็นส่วนตัวอัตโนมัติ |
| business locked | กดสลับไม่ได้ + toast (เดิม); ใน active box/list มี 🔒 |
| ยังโหลด context ไม่เสร็จ | topbar/sidebar อ่าน active จาก session (มีทันที); list ค่อย populate (progressive) |

## 8. ไฟล์ที่แตะ

| ไฟล์ | เปลี่ยน |
|---|---|
| `src/lib/auth.ts` | session callback: +activeShopName/Logo/Kind |
| `src/app/api/business/context/route.ts` | +logo ใน businesses select |
| `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx` | redesign FB-style + topbar button สะท้อน active |
| `src/components/SidebarBrand.tsx` (ใหม่) + `src/layouts/components/Sidenav/index.tsx` | brand logo สะท้อน active business |
| `src/layouts/components/Sidenav/components/UserProfileSettings.tsx` | user block สะท้อน active |

## 9. Security / convention notes

- session enrichment scope ด้วย `token.userId` + re-verify membership เดิม — ไม่ trust ค่า client (feedback_rsc_dal_authz)
- ไม่ leak PII เพิ่ม (shopName/logo เป็นข้อมูลสาธารณะของร้าน)
- Paces toast เท่านั้นใน error (Hard Rule 9); ทุก UI = Paces primitive (Hard Rule 7); commit ที่แตะ UI มี `Base:` line (Hard Rule 3)
- ผ่าน `safepay-ux` gate ก่อน implement (Hard Rule 8) อิง Paces docs + `paces-component-reference.md`

## 10. QA

- Playwright E2E (feedback_qa_playwright_e2e_mandatory) + Chrome DevTools MCP visual ที่ `seller.deepth.local:4000`
- scenario: (1) personal-only user → dropdown เดิม (2) มี ≥1 business → FB layout, สลับแล้ว topbar+sidebar logo/ชื่อเปลี่ยน (3) logo null → icon fallback (4) locked → สลับไม่ได้

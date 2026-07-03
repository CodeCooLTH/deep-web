# Design Spec — feat 00008 Phase 4: Business Profile = Full Workspace

> วันที่: 2026-07-03 · ต่อยอด feat 00008 (Business Account & Packages, Phase 1-3 deploy prod แล้ว)
> approved by user 2026-07-03 (ok default A/B/C)

## 1. Goal

ยกระดับ "Business" จากแนวคิด package-management (Phase 1-3) → เป็น **workspace แยกเต็มตัว**: เมื่อ owner สลับไป Business Profile ทุกหน้า/ทุก feature (สินค้า/ออเดอร์/ประมูล/ลูกค้า/ยอดขาย/wallet/inventory/SMS/ตั้งค่าร้าน) แสดง/ทำงานกับข้อมูลของ Business นั้นแยกจาก Personal และแยกจาก Business อื่น. ครอบ 4 การเปลี่ยนที่ user ขอ (2026-07-03).

**Context/gap ที่แก้:** AccountSwitcher (Phase 3) ตั้ง `session.user.activeShopId` แต่หน้า feature ทั้งหมดยังใช้ `getPersonalShop`/`getShopByUserId` เสมอ (ผลจาก Phase 2 cutover) → สลับ context แล้วข้อมูลไม่เปลี่ยน. Phase 4 = wire active-shop-context เข้าหน้า feature ให้ switch มีความหมายจริง.

## 2. การเปลี่ยน 4 ข้อ (map จาก user request)

### 2.1 แกนหลัก — Active-Shop Context Wiring (ข้อ 3 "แยกเต็มตัว")
- **ปัญหา:** ~40 หน้า seller resolve shop ด้วย `getShopByUserId(userId)` → `getPersonalShop` (คืน Personal shop เสมอ). Business context ไม่ถูกใช้.
- **แก้:** เปลี่ยนหน้า/route ที่ operate บน "shop ของ seller ปัจจุบัน" → ใช้ `resolveActiveShopContext(session)` (มีอยู่แล้วจาก Phase 1, `src/lib/shop-context.ts`) คืน active shop (Personal หรือ Business ตาม `session.user.activeShopId` + verify membership).
- **ขอบเขต:** เฉพาะหน้า/route ที่แสดง "workspace ของ seller" — dashboard, products(*), orders(*), auctions(*), customers, sales, wallet(*), inventory(*), shop-settings, notifications, categories, verification. **ไม่แตะ:** public pages (`/u/[username]`, `/o/[token]`), buyer app, admin, auth/onboarding เดิม (ยังผูก Personal/user).
- **Guard:** RSC pages ต้อง resolve active shop + verify membership (owner/admin) — ถ้า active shop เป็น Business ที่ user ไม่ใช่สมาชิก → fallback Personal (fail-closed). locked business → read-only banner (มี LockedStateBanner แล้ว).
- **Data isolation ได้ฟรี:** ทุก model (Product/Order/Auction/SellerWallet/InventoryEntitlement/WalletTransaction/TopUpRequest) key ด้วย `shopId` อยู่แล้ว → เปลี่ยน shopId ที่ resolve = ข้อมูลแยกทันที ไม่ต้องแก้ service/schema.

### 2.2 Profile Dropdown Consolidation (ข้อ 1 + 2)
- ย้ายเมนู "แพ็กเกจธุรกิจ" (`/business`) จาก sidebar (`_seller-menu.ts`) → เข้า **Profile dropdown** (`UserProfileSettings.tsx` ใน Sidenav).
- ย้าย/รวม AccountSwitcher (Phase 3, ตอนนี้เป็น pill แยกใต้ UserProfileSettings) → เข้า Profile dropdown เดียวกัน.
- Profile dropdown ใหม่แสดง: profile ปัจจุบัน (ชื่อ Personal/Business + role badge) → [ถ้ามี ≥1 business] list สลับ context (Personal + businesses[], radio-dot, lock badge) → divider → "แพ็กเกจธุรกิจ" → items เดิม (โปรไฟล์/ออกจากระบบ ฯลฯ).
- ถ้า `hasBusinessMembership=false` → ไม่แสดง switcher list + ไม่แสดง "แพ็กเกจธุรกิจ"? (default: แสดง "แพ็กเกจธุรกิจ" เสมอ เพื่อให้เข้าไปสมัคร/สร้าง business ครั้งแรกได้; switcher list แสดงเมื่อ ≥1 business).

### 2.3 Per-Business Feature Purchasing (ข้อ 3 detail)
ได้อัตโนมัติจาก §2.1 — ไม่ต้องสร้างระบบซื้อใหม่:
- **Credit/Wallet:** Business shop มี SellerWallet ของตัวเอง (สร้างตอน createBusinessShop, balance ฿0). หน้า wallet ใน Business context → เติม/ดู credit ของ business นั้น. owner เติมแยกแต่ละ business.
- **Inventory Add-on:** subscribe → `InventoryEntitlement` ของ business shop นั้น (1:1 shop). แยกจาก Personal.
- **SMS:** ส่ง SMS หัก wallet ของ business shop นั้น (SMS keyed by shop). **แต่** SMS ต้อง L2 verification (ดู §3 open item A — Business verification = Phase 5).

### 2.4 Business Onboarding (ข้อ 4)
- สร้าง business เสร็จ → **บังคับ onboard** ก่อนใช้งาน (default B).
- **Onboarding fields:** ชื่อร้าน (มีจาก create form) + หมวดหมู่ + **slug** (บังคับ, สำหรับ public profile `/u/[slug]`) + โลโก้ (optional) + สินค้าแรก (skippable). **ไม่มี** phone/OTP step (ใช้ login owner — Business ไม่มี auth แยก).
- **Mechanism:** business ที่ยังไม่มี slug = `needsOnboarding` (per-business). เมื่อ active context = business ที่ไม่มี slug → force redirect `/business/[shopId]/onboarding`. mirror seller `/onboarding` (5-step) ตัด phone/OTP → เหลือ ~3 step (ข้อมูลร้าน→slug→สินค้าแรก).
- reuse: `shop-slug.ts` (validate/reserved), onboarding components, `ShopForm` field groups.

## 3. Open Items / Deferred (default ที่ user เคาะ 2026-07-03)

| # | ประเด็น | Decision |
|---|---|---|
| A | Business verification/SMS | **Business onboard = ข้อมูลร้าน+slug เท่านั้น (ไม่มี verification). SMS ของ Business = Phase 5** (ต้องออกแบบ verification ต่อ business หรือ inherit owner) |
| B | onboarding บังคับ | **บังคับ** — business ไม่มี slug → เด้ง onboard |
| C | Business trust score/badge แยก | **ไม่แยก — Phase 5** (MVP ผูก trust ที่ owner ตาม PRD เดิม) |

## 4. Architecture / Components

### 4.1 หน่วยงานหลัก
- **`resolveActiveShopContext` (มีแล้ว)** — SSOT ของ "active shop ของ session". Phase 4 = ทำให้หน้า feature เรียกตัวนี้แทน getPersonalShop.
- **Helper ใหม่ `requireActiveShop(session)`** — wrapper คืน active shop + throw/redirect ถ้าไม่มี/ไม่ใช่สมาชิก (ใช้ใน RSC pages ให้สั้น). อาจรวม needsOnboarding check (business ไม่มี slug → redirect onboarding).
- **Profile dropdown** — merge AccountSwitcher เข้า UserProfileSettings.
- **Business onboarding page** — `/business/[shopId]/onboarding` + API `POST /api/business/shops/[shopId]/onboarding` (set slug/category/logo) — reuse shop-info/slug endpoints ปรับ scope เป็น business shop.

### 4.2 Migration/rollout
- **ไม่มี schema change** (ทุกอย่าง key ด้วย shopId แล้ว; needsOnboarding-per-business = derive จาก business shop slug).
- **Regression หนัก:** re-wire ~40 หน้า → Personal-only user ต้องทำงานเหมือนเดิม 100% (active shop = personal เมื่อไม่มี business/ไม่ได้สลับ). ต้อง regression suite เต็ม + agent-team-phase.
- Phase boundary: (P4-A) active-context wiring + requireActiveShop helper → (P4-B) profile dropdown → (P4-C) business onboarding → (P4-D) verify per-business features (wallet/inventory) ทำงานใน business context.

## 5. Risks
1. **Regression สูงสุด** — re-wire 40 หน้าที่ deploy prod แล้ว. active shop resolve ผิด → seller เห็นข้อมูลผิด shop (data leak ข้าม context). ต้อง membership guard เข้ม + regression.
2. **Onboarding force-redirect loop** — logic per-business needsOnboarding ต้องไม่ชนกับ Personal needsOnboarding เดิม (proxy.ts).
3. **SMS/verification gap** — Business ส่ง SMS ไม่ได้จน Phase 5 (L2). ต้องสื่อสาร UI ชัด (ปุ่ม SMS ใน business context → disabled + "ต้องยืนยันตัวตน — เร็ว ๆ นี้").
4. **active shop ใน RSC vs client** — session.activeShopId ต้อง sync ระหว่าง server render + client switcher (มี session.update mechanism แล้ว).

## 6. Out-of-scope (Phase 5+)
- Business verification (L1/L2/L3) + SMS ของ business
- Business trust score/badge/public profile แยก
- Admin summary extension, accept-invite page (ยัง defer จาก Phase 3)

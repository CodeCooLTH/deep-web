# Scope Baseline — feat 00008 Phase 4: Business = Full Workspace

สถานะ: ACTIVE
อ้างอิง: Design Spec `docs/superpowers/specs/2026-07-03-00008-business-full-workspace-design.md` · audit 2026-07-03 (Explore: WIRE 32 / KEEP-PERSONAL 11 / KEEP-AS-IS 4+infra)

## Goal
ทำให้สลับ Business Profile แล้วทุกหน้า feature (สินค้า/ออเดอร์/ประมูล/ลูกค้า/ยอดขาย/wallet/inventory) แสดง+ทำงานกับ active shop นั้น (workspace แยกเต็มตัว) + Profile dropdown รวม switcher+package + Business onboarding บังคับ. ไม่มี schema change. Personal-only user ต้อง zero-regression.

## 5 Decisions (ตัดสินตาม design + autonomous mandate)
- **D1 Layout auto-create:** แยก concern — ensure Personal shop มี (auto-create เฉพาะ Personal) → resolve active ผ่าน `requireActiveShop`; active=Business null → fallback Personal
- **D2 SMS:** wire → active shop wallet (business SMS หัก business wallet). L2 gate ตัดไปแล้ว (credit-only) ไม่ block. verification = Phase 5
- **D3 Verification page:** KEEP-AS-IS (per-user, แสดง verification ของ owner) — ไม่ wire; Business verification = Phase 5
- **D4 Business onboarding detection:** ที่ **seller layout (RSC)** หลัง resolve active — active=Business && ไม่มี slug → redirect `/business/[shopId]/onboarding`. Personal onboarding คงที่ proxy/JWT (ไม่ชน)
- **D5 Shop-settings guard:** เปลี่ยน `shop.userId===session.id` → membership guard (owner+admin แก้ได้ = membership-based, RBAC deferred)

## In-Scope
| ID | รายการ | Acceptance | สถานะ |
|----|--------|------------|-------|
| P4-0 | **Core helper** `requireActiveShop(session)` ใน `shop-context.ts` — resolve active shop + membership guard + คืน `{shop, kind, role, locked, lockReason}`; helper `ensurePersonalShop(userId)` (auto-create invariant) แยกจาก resolve | unit: active=personal คืน personal; active=business+member คืน business; active=business+non-member → fallback personal; null-safe | TODO |
| P4-1 | **WIRE seller pages batch A** (products/orders): products(list/[id]/new/new-v2/[id]edit), orders(list/[token]/new/customers page) — getShopByUserId→requireActiveShop; create pages gate `locked` | tsc 0; active shop scope ถูก; locked→ห้ามสร้าง; regression personal | TODO |
| P4-2 | **WIRE seller pages batch B** (dashboard/wallet/inventory/sales/customers/categories/notifications) | เหมือน P4-1; dashboard downstream ทั้งหมด scope active | TODO |
| P4-3 | **WIRE seller pages batch C** (auctions: page/[id]/new/[id]edit) + `api/seller/auctions/_shared.ts requireSellerShop` (ครอบ 7 endpoint) | wire _shared ที่เดียวครอบ auction API | TODO |
| P4-4 | **WIRE API routes** products/orders/wallet(route,topup,events)/inventory(subscribe,reactivate)/orders-customers/send-sms — resolve active + gate locked ที่ mutation | tsc 0; POST gate locked→403; active wallet | TODO |
| P4-5 | **WIRE layouts** (dashboard/fullscreen) D1 — ensurePersonal + resolve active สำหรับ header/badge; + D4 business-onboarding redirect | personal ยัง auto-create; active display ถูก; business ไม่มี slug→redirect onboarding | TODO |
| P4-6 | **Profile dropdown consolidation** (D: ข้อ1+2) — ย้าย AccountSwitcher เข้า `UserProfileSettings.tsx`; ย้าย "แพ็กเกจธุรกิจ" menu จาก `_seller-menu.ts` → profile dropdown; ลบ standalone switcher + sidebar menu entry | dropdown มี switcher(≥1 biz)+package link; grep gates 0; regression sidebar | TODO |
| P4-7 | **Business onboarding** `/business/[shopId]/onboarding` page + API (set slug/category/logo, no phone/OTP) + reuse shop-slug/ShopForm | สร้าง business→บังคับ onboard; slug validate/reserved; skippable สินค้าแรก; grep gates 0 | TODO |
| P4-8 | **D5 shop-settings membership guard** — `api/shops/[id]` PATCH + shop/page: `shop.userId===id` → membership (owner+admin) | admin แก้ settings business ได้; personal ยังแก้ได้ | TODO |
| P4-9 | **Regression + deploy** — Personal-only flow (login/dashboard/products/orders/wallet) zero-regression; Business flow (create→onboard→switch→products/wallet แยก); build; merge+deploy prod | regression PASS; build ผ่าน; prod smoke | TODO |

## Out-of-Scope (Phase 5)
- Business verification (L1/L2/L3) + SMS L2 gate ของ business
- Business trust score/badge/public profile แยก
- Verification page ใน business context (แสดง owner's — Phase 5 decide)

## Assumptions & Dependencies
1. P4-0 (helper) ต้องเสร็จก่อน P4-1..P4-5 (ใช้ requireActiveShop)
2. ไม่มี schema change — ทุก model key ด้วย shopId แล้ว
3. Regression หนักสุด — 32 sites แตะ prod feature; membership guard เข้ม กัน cross-context data leak
4. P4-6 (dropdown) แตะ sidebar layout — regression seller nav

## Change Log
| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-03 | baseline สร้าง | Gate 0 Phase 4 — user approve design + autonomous mandate | user |

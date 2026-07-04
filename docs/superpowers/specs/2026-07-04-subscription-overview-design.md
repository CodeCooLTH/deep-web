# Subscription Overview — Design Spec

- **วันที่:** 2026-07-04
- **สถานะ:** Design (รอ user review → plan)
- **Feature number (ถ้าทำ feature-docs เต็ม):** 00012 (ว่าง — ล่าสุดใช้ถึง 00011)
- **แนวทางที่เลือก:** A (Seller hub รวม + Admin overview แยก)

## 1. ปัญหา / เป้าหมาย

ปัจจุบันสถานะ "แพ็กเกจ/subscription" ที่ profile หนึ่งใช้อยู่ **กระจัดกระจาย** — Stock Pro จัดการที่ `/inventory`, Business Package จัดการที่ `/business` — ไม่มีที่เดียวที่เห็นภาพรวมว่า profile นี้ใช้ plan อะไรบ้าง. ผู้ใช้ (seller) และ admin ต้องการหน้า **รวมศูนย์** เพื่อดู (และ seller ยังจัดการได้) ว่าแต่ละ profile/ร้านใช้แพ็กเกจอะไร สถานะอะไร ต่ออายุเมื่อไหร่.

**Goal**
- Seller เห็น + จัดการแพ็กเกจของตัวเองครบในหน้าเดียว (ทั้ง Business Package ระดับเจ้าของ และ Stock Pro รายร้าน)
- Admin เห็นภาพรวมว่าแต่ละร้านใช้แพ็กเกจอะไร (read-only monitoring)

**Non-goal (Phase นี้)**
- Admin จัดการ/สมัคร/ยกเลิกแทน seller (read-only เท่านั้น)
- หน้า detail ราย subscription ในฝั่ง admin (Phase 2)
- แตะ logic การหักเงิน/cron/renewal (มีอยู่แล้ว ไม่แก้)

## 2. ข้อเท็จจริงของระบบ (ยึดตามโค้ดจริง)

- 1 User เป็นเจ้าของได้หลายร้าน (`Shop.userId`, immutable); ร้านแยก `Shop.kind = "PERSONAL" | "BUSINESS"`
- **Stock Pro** = `InventoryEntitlement` 1:1 กับ **Shop** (`shopId @unique`); `package BASIC|PRO`, `status ACTIVE|LOCKED` (ไม่มีแถว = `NOT_SUBSCRIBED`), `nextRenewalAt`
- **Business Package** = `BusinessPackageSubscription` 1:1 กับ **User** (`ownerId @unique`); `tier GROWTH|PRO|BUSINESS` (String), `status ACTIVE|LOCKED_RENEWAL_FAILED` (ไม่มีแถว = ฟรี/NOT_SUBSCRIBED); คุมโควตาจำนวนร้าน business ของเจ้าของ
- **Wallet** = `SellerWallet` 1:1 กับ **Shop** (`balance Int`); Business Package หักจากกระเป๋าร้าน PERSONAL ของเจ้าของ
- Constant (SSOT — ห้าม redefine ราคา):
  - `src/lib/inventory-addon.ts` — `PACKAGE_PRICE {BASIC:199, PRO:599}`, `PACKAGE_LABEL_TH {BASIC:'Deep Stock', PRO:'Deep Stock Pro'}`, `INVENTORY_ADVANCE_WARNING_DAYS=3`
  - `src/lib/business-package.ts` — `BUSINESS_PACKAGE_TIER_CONFIG` (Growth ฿159/1 ร้าน, Pro ฿599/3, Business ฿1299/ไม่จำกัด), `TIER_ORDER`
- Getters ที่ reuse ได้:
  - inventory: `getEntitlementInfo(shopId)`, `shouldWarnAdvance(entitlement, balance)`, `getBalance(shopId)`
  - business: `getSubscriptionStatus(ownerId)`
- Admin `/users` ปัจจุบัน **ไม่ join** ข้อมูล subscription เลย — ต้องเติม join ใหม่
- Component จัดการมีครบแล้ว (reuse): `PackageTierGrid`, `PackageActionButton`, `CancelPackageButton`, `DowngradeButton`, `AdvanceWarningBanner`, `LockedStateBanner`, `QuotaUsageCard` (business); `SubscribeButton`, `UpgradeToProCard`, `ReactivateButton`, `AdvanceWarningBanner` (inventory)

## 3. Seller hub — `/seller/subscriptions` (เมนู "แพ็กเกจของฉัน")

Server Component, scope = `session.user.id`. โครงสร้าง 2 ส่วน (Paces, mobile-first):

### ส่วน A · Business Package (ระดับเจ้าของ — การ์ดเดียว)
- badge tier ปัจจุบัน (ฟรี/Growth/Pro/Business) + สถานะ (ใช้งาน/ล็อก/ยังไม่สมัคร)
- วันต่ออายุถัดไป (`formatDate` พ.ศ. tz ไทย) + `AdvanceWarningBanner` (business) ถ้าเครดิตไม่พอ ≤3 วัน; `LockedStateBanner` ถ้า LOCKED
- โควตาร้าน business (X/Y) ผ่าน `QuotaUsageCard` + ยอดกระเป๋าร้าน PERSONAL
- Action: สมัคร/อัปเกรด/ดาวน์เกรด/ยกเลิก/ต่ออายุ — reuse `PackageTierGrid` + `PackageActionButton` + `Cancel/DowngradeButton` (owner-level เสียบตรง)
- ดึงข้อมูลด้วย pattern เดียวกับ `business/page.tsx` (`getSubscriptionStatus`, `getPersonalShop`, `getBalance`, shopMember query)

### ส่วน B · Stock Pro (ระดับร้าน — การ์ดต่อ 1 ร้านที่ถือ)
- `shop.findMany({ where:{ userId, deletedAt:null }, include:{ inventoryEntitlement, wallet } })`
- แต่ละร้าน: ชื่อร้าน + badge kind, badge แพ็กเกจ (Deep Stock/Pro/ยังไม่สมัคร/ล็อก), วันต่ออายุ, ยอดกระเป๋าร้านนั้น, `shouldWarnAdvance(entitlement, balance)`
- Action ต่อร้าน: สมัคร/อัปเกรด Pro/ต่ออายุ (reuse `SubscribeButton`/`UpgradeToProCard`/`ReactivateButton`) + ลิงก์ "จัดการสต๊อก" → `/inventory`
- **Decision (D-1):** ปรับ `SubscribeButton`/`UpgradeToProCard`/`ReactivateButton` ให้รับ `shopId` เป็น prop (ปัจจุบันผูก implicit กับ `session.activeShopId`) เพื่อจัดการได้ทุกร้านในหน้าเดียว. API routes ที่เกี่ยว (`/api/inventory/subscribe`, `/reactivate`, `/upgrade`) ต้องรับ/ยืนยัน `shopId` + ตรวจ ownership ที่ service layer (ห้าม trust body ดิบ)

> หลังย้าย lifecycle มา hub: `/inventory` เหลือ **ตารางสต๊อก**, `/business` เหลือ **โควตา/จัดการร้าน**. ยังไม่ลบส่วนจัดการเดิมทันที — ทำ hub ให้เสถียรก่อน แล้วค่อย deprecate (กัน regression)

## 4. Admin overview — `/admin/subscriptions` (เมนู "แพ็กเกจ") — read-only

RSC ตาม pattern `/admin/users` (direct Prisma, `take: 200`, filter). **1 แถว = 1 ร้าน**:

| คอลัมน์ | ที่มา |
|---|---|
| ร้าน (+ badge PERSONAL/BUSINESS) | `Shop` |
| เจ้าของ (displayName/username, ลิงก์ `/u/{username}`) | `Shop.user` |
| Stock Pro (badge แพ็กเกจ + สถานะ + วันต่ออายุ) | `inventoryEntitlement` |
| Business Package (tier + สถานะ ของเจ้าของ) | `user.businessPackageSubscription` |
| กระเป๋า (฿) | `wallet.balance` |

- Query: `prisma.shop.findMany({ where:{ deletedAt:null, ...search }, include:{ user:{ include:{ businessPackageSubscription:true } }, inventoryEntitlement:true, wallet:true }, take:200 })`
- Filter (reuse `src/components/safepay/FilterDropdown`): สถานะ Stock Pro / tier Business / ค้นชื่อร้าน–เจ้าของ
- **PII (S-1):** หน้าอยู่ใต้ Paces client layout → Next serialize server data เข้า flight ทั้งหมด → mask/neutralize เบอร์/อีเมลเจ้าของที่ไม่ได้แสดงผลที่ server boundary (ตาม feedback_rsc_pii_neutralize_at_source)
- ไม่มี action; detail/จัดการ = Phase 2
- เจ้าของหลายร้าน → tier Business ซ้ำทุกแถวของเจ้าของเดียวกัน (ยอมรับได้; group ทีหลังได้)

## 5. Services / โครงไฟล์

- เพิ่ม aggregator บางๆ (ให้ page thin, testable):
  - `getSellerSubscriptionOverview(userId)` — คืน `{ businessPackage, personalWallet, quota, shops: [{ shop, entitlement, walletBalance, warnAdvance }] }`
  - (admin) query ใน RSC ตรง หรือ `getAdminSubscriptionRows(filter)` ใน service ถ้าโตขึ้น
- reuse constant/getter ทั้งหมดจาก §2 — **ห้าม redefine ราคา/label**

โครงไฟล์ (คาดการณ์):
```
src/app/(paces)/seller/(dashboard)/subscriptions/page.tsx        # hub
src/app/(paces)/seller/(dashboard)/subscriptions/components/*    # การ์ด reuse/wrap
src/app/(paces)/admin/(dashboard)/subscriptions/page.tsx         # admin table (RSC)
src/app/(paces)/admin/(dashboard)/subscriptions/SubscriptionsTable.tsx
src/services/subscription-overview.service.ts                    # aggregator seller
```
เมนู: เพิ่มใน `_seller-menu.ts` + admin menu

## 6. กฎที่ยึด (Hard Rules)

- HR7 Paces primitive เท่านั้น (`.card`/`btn`/`badge`/token) — ห้าม arbitrary value/hex; primary น้ำเงิน `#236dc9` ไม่ใช่ม่วง
- HR8 ผ่าน `safepay-ux` ออก Design Spec ก่อนเขียน frontend (map theme source: การ์ด/ตาราง จาก Paces)
- HR9 `pacesToast` (top-right action) + Sweet Alerts สำหรับ confirm (ยกเลิก/ดาวน์เกรด)
- HR12 ห้าม emoji — icon จริง (`@iconify/react` tabler) เท่านั้น; icon ที่ spec ไม่ระบุ → ถาม user
- `formatDate`/`formatDateTime` จาก `src/lib/format-date.ts` (พ.ศ., tz ไทย)
- Font Anuphan; ห้าม `component={Link}` ใน RSC (ใช้ LinkButton/LinkChip)
- Base: line ทุก commit ที่แตะ UI ชี้ theme file ที่ copy

## 7. Edge cases

- ไม่มีร้าน / ไม่มีแพ็กเกจ → empty state ("ยังไม่มีแพ็กเกจ" + CTA)
- LOCKED (ทั้ง 2 ระบบ) → banner ชัด + ปุ่ม reactivate
- ร้าน PERSONAL ไม่มี Business Package (owner-level) → แสดงเฉพาะการ์ด Stock Pro
- ownership: action ทุกตัวต้องยืนยัน `shopId`/`ownerId` เป็นของ session user ที่ service layer (กัน IDOR)
- Decimal/serialize: wallet เป็น Int (ปลอดภัย); ไม่ดึง product price ในหน้านี้

## 8. Decisions (ยืนยันแล้ว)

- D-A: แนวทาง A (hub รวม seller + admin overview แยก)
- D-1: ปรับ 3 component Stock Pro ให้รับ `shopId` (จัดการหลายร้าน)
- D-2: Admin = read-only
- D-3: route `/seller/subscriptions` ("แพ็กเกจของฉัน") + `/admin/subscriptions` ("แพ็กเกจ")

## 9. เปิดค้าง (ตัดสินตอน plan/ux)

- Layout ส่วน B: การ์ดต่อร้านเรียงแนวตั้ง vs grid (ขึ้นกับจำนวนร้านทั่วไป — ถ้าส่วนใหญ่ร้านเดียว การ์ดเดียวเต็มกว้าง)
- ควรทำ feature-docs เต็ม (00012 PRD/BRD/...) ตาม Hard Rule 11 หรือ lightweight (แตะเงิน/subscription = ควรเต็ม) — ถาม user ก่อนเข้า plan

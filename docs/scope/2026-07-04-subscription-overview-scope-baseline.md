# Scope Baseline — Subscription Overview

สถานะ: ACTIVE
อ้างอิง PRD: ไม่มี FR เฉพาะใน PRD v3.2 (Business Package = feat 00009 "Deep Stock Pro" deploy แล้วแต่ PRD ยังไม่ sync — pre-existing gap, ไม่เกิดจาก phase นี้) · Design spec: `docs/superpowers/specs/2026-07-04-subscription-overview-design.md` · Plan: `docs/superpowers/plans/2026-07-04-subscription-overview.md`

## Goal
สร้างหน้ารวมศูนย์ subscription — seller ดู+จัดการแพ็กเกจของตัวเอง (Business Package ระดับเจ้าของ + Stock Pro รายร้าน) ในหน้าเดียว `/seller/subscriptions`, และ admin ดูภาพรวมทุกร้านแบบ read-only ที่ `/admin/subscriptions` — โดยไม่มี model/migration ใหม่ และไม่แตะ payment endpoint เดิม

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว. ไม่ map = CREEP.

| ID | รายการ | Task | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|------|----------------------|-------|
| S-1 | Aggregator `getSellerSubscriptionOverview(userId)` — ส่วน Business Package summary (`status`/`tier`/`nextRenewalAt`/`ownedBusinessCount`/`maxBusinesses`/`personalWalletBalance`) reuse `getSubscriptionStatus`/`getPersonalShop`/`getBalance`/`BUSINESS_PACKAGE_TIER_CONFIG` — ห้าม redefine ราคา/label | T1 | เรียกฟังก์ชันด้วย userId ที่มี Business Package ACTIVE → คืน tier/status/nextRenewalAt/maxBusinesses ตรงกับ `BUSINESS_PACKAGE_TIER_CONFIG`; userId ไม่มี subscription → `status='NOT_SUBSCRIBED'`, `tier=null`, `maxBusinesses=null` | DONE (5addb47) |
| S-2 | Aggregator ส่วน `shops[]` — ทุกร้านของ user (`deletedAt:null`) พร้อม `entitlementStatus`/`package`/`nextRenewalAt`/`walletBalance`/`warnAdvance`/`shortfall` ต่อร้าน reuse `shouldWarnAdvance`/`getBalance`/`PACKAGE_PRICE` | T1 | ร้านไม่มี `inventoryEntitlement` → `entitlementStatus='NOT_SUBSCRIBED'`, `package=null`, `shortfall=0`; ร้าน ACTIVE+BASIC ยอดกระเป๋าน้อยกว่า ฿199 → `shortfall = 199 - balance` (>0) | DONE (5addb47) |
| S-3 | Vitest unit test ครอบ T1 (มี business package + shops ผสม, กรณี NOT_SUBSCRIBED) | T1 | `node node_modules/vitest/vitest.mjs run src/services/subscription-overview.service.test.ts` → 2/2 PASS; `tsc --noEmit` → 0 error | DONE (5addb47) |
| S-4 | Component `SwitchShopButton({shopId, shopName})` — client, เรียก `POST /api/business/switch-context`, `useSession().update({activeShopId})`, `router.refresh()`, `pacesToast` success/error (reuse endpoint เดิม 100% ไม่แก้ security) | T2 | คลิกปุ่มบนร้านที่ไม่ใช่ active → เรียก switch-context สำเร็จ (200) → session.activeShopId เปลี่ยนเป็นร้านนั้น → toast สำเร็จ → หน้ารีเฟรช; membership ไม่ผ่าน (403 `NOT_MEMBER`) → toast error, session ไม่เปลี่ยน | DONE (f69340b) |
| S-5 | หน้า `/seller/subscriptions` (RSC, scope=`session.user.id`) — Section A การ์ด Business Package: badge tier/สถานะ, วันต่ออายุ (`formatDate`), `AdvanceWarningBanner`/`LockedStateBanner` ตามสถานะ, `QuotaUsageCard` โควตาร้าน + ยอดกระเป๋า PERSONAL, action สมัคร/อัปเกรด/ดาวน์เกรด/ยกเลิก reuse `PackageTierGrid`/`PackageActionButton`/`CancelPackageButton`/`DowngradeButton` | T3 | เปิดหน้าด้วย user ที่มี Business Package PRO ACTIVE → เห็น badge "Pro", วันต่ออายุเป็น พ.ศ., โควตา X/3, ปุ่มดาวน์เกรด/ยกเลิกทำงาน (redirect ไป logic เดิมของ `business/page.tsx`) | DONE (f69340b) |
| S-6 | Section B การ์ดต่อร้าน (วน `overview.shops`) — badge `PACKAGE_LABEL_TH`/สถานะ, `formatDate(nextRenewalAt)`, ยอดกระเป๋าเฉพาะร้าน | T3 | user มี 2 ร้าน → เห็น 2 การ์ด แต่ละการ์ดแสดง badge package/สถานะ/วันต่ออายุ/ยอดกระเป๋าที่ตรงกับ DB ของร้านนั้น (ไม่สลับข้อมูลข้ามร้าน) | DONE (f69340b) |
| S-7 | ร้าน**ที่ active** (`session.activeShopId ?? personalShopId`) → reuse **`PackageSelector`** (mode subscribe/reactivate ตาม status) + `UpgradeToProCard` + inventory `AdvanceWarningBanner` เดิม 100% — mirror `inventory/page.tsx` เป๊ะ (endpoint resolve จาก `session.activeShopId` ฝั่ง server) + ลิงก์ "จัดการสต๊อก" → `/inventory`. **หมายเหตุ (Change Log 2026-07-04 #1):** เปลี่ยนจาก `SubscribeButton`/`ReactivateButton` เดิมที่ **broken** (POST เปล่า แต่ route feature 00009 บังคับ body `{package}` → 400 เสมอ; 2 component เป็น orphaned code) มาเป็น `PackageSelector` ที่ทำงานถูกจริง | T3 | สลับ active shop เป็นร้าน A แล้วเปิดหน้า → การ์ดร้าน A แสดง `PackageSelector`(ถ้าไม่ ACTIVE)/`UpgradeToProCard`(ถ้า ACTIVE+BASIC) ตามสถานะจริง และกดแล้วเรียก endpoint สำเร็จ (verify กับพฤติกรรม `/inventory` เดิม) | DONE (f69340b) |
| S-8 | ร้าน**ที่ไม่ active** → แสดงสถานะอ่านอย่างเดียว + `SwitchShopButton` (S-4) แทนปุ่มจัดการ | T3 | การ์ดร้านที่ไม่ใช่ active shop ปัจจุบัน ไม่มีปุ่ม Subscribe/Upgrade/Reactivate — มีเฉพาะปุ่ม "สลับมาร้านนี้" | DONE (f69340b) |
| S-9 | Empty states — ไม่มีร้าน → การ์ด "ยังไม่มีร้านค้า"; Business Package `NOT_SUBSCRIBED` → `PackageTierGrid` แสดงตัวเลือกฟรี/อัปเกรดตามเดิม | T3 | user ที่ยังไม่มีร้านใด ๆ เปิดหน้า → เห็น empty-state card (ไม่ error/ไม่ crash); user ไม่มี Business Package → เห็น `PackageTierGrid` ปกติ | DONE (f69340b) |
| S-10 | เมนู seller เพิ่มลิงก์ "แพ็กเกจของฉัน" ใน STORE group ชี้ `/subscriptions` | T3 | เปิด seller sidebar → เห็นเมนู "แพ็กเกจของฉัน" คลิกแล้วเข้าหน้า `/seller/subscriptions` (ไม่ 404) | DONE (f69340b) |
| S-11 | Compliance หน้า `/seller/subscriptions` — `safepay-ux` Design Spec ก่อนโค้ด, `Base:` line ชี้ theme file ที่ copy, Paces primitive เท่านั้น, ไม่มี emoji, `formatDate` พ.ศ. | T3 | `rg "react-toastify\|#7367F0\|text-\[\|bg-\["  "src/app/(paces)/seller/(dashboard)/subscriptions/"` → 0 match (เว้นมี comment justify); emoji-regex gate → 0; commit log มี `Base:` | DONE (f69340b) |
| S-12 | Query admin `/admin/subscriptions` — `prisma.shop.findMany({deletedAt:null, take:200})` join `inventoryEntitlement` + `wallet` + `user.businessPackageSubscription`; mapper `toAdminSubscriptionRow` แยกไฟล์ `data.ts` | T4 | เรียก query กับ DB ที่มีร้านผสม (ACTIVE/LOCKED/NOT_SUBSCRIBED ทั้ง Stock Pro และ Business Package) → mapper คืน `AdminSubscriptionRow[]` ที่ field ตรงกับ DB ทุกแถว | DONE (b8b26dc) |
| S-13 | ตาราง admin 1 แถว/ร้าน: ร้าน(+badge kind), เจ้าของ (ลิงก์ `/u/{username}`), Stock Pro (badge+สถานะ+renewal), Business Package (tier+status), กระเป๋า (฿) — **read-only ไม่มี action ใด ๆ** | T4 | เปิด `/admin/subscriptions` → เห็นตารางครบ 5 คอลัมน์ตามที่ระบุ; ไม่มีปุ่ม action (edit/cancel/subscribe) ใด ๆ ในตาราง; คลิกชื่อเจ้าของ → ไปหน้า `/u/{username}` | DONE (b8b26dc) |
| S-14 | Filter/search (reuse `FilterDropdown`) — filter สถานะ Stock Pro, filter tier Business Package, ค้นชื่อร้าน/เจ้าของ | T4 | เลือก filter สถานะ = LOCKED → ตารางเหลือเฉพาะร้าน Stock Pro LOCKED; พิมพ์ค้นชื่อร้าน → ตารางกรองตรงกับคำค้น | DONE (b8b26dc) |
| S-15 | PII neutralize — query ไม่ดึง `phone`/`email` เจ้าของเข้า select ใด ๆ (ไม่มี PII เกินจำเป็นใน RSC flight ใต้ client layout) | T4 | grep select object ใน `page.tsx` → ไม่มี field `phone`/`email`; ตรวจ flight payload (Chrome DevTools MCP) ไม่มี PII เจ้าของหลุดมา | DONE (b8b26dc) |
| S-16 | เมนู admin เพิ่มลิงก์ "แพ็กเกจ" (admin-business group) ชี้ `/admin/subscriptions` | T4 | เปิด admin sidebar → เห็นเมนู "แพ็กเกจ" คลิกแล้วเข้าหน้า (ไม่ 404) | DONE (b8b26dc) |
| S-17 | Compliance หน้า `/admin/subscriptions` — `safepay-ux` Design Spec (theme source `UsersTable.tsx`), `Base:` line, Paces primitive เท่านั้น, ไม่มี emoji | T4 | `rg "react-toastify\|#7367F0\|text-\[\|bg-\["  "src/app/(paces)/admin/(dashboard)/subscriptions/"` → 0 match; emoji-regex gate → 0; commit log มี `Base:` | DONE (b8b26dc) |
| S-18 | Context-scoped view ของ `/seller/subscriptions` (Change Log #3) — PERSONAL active → เห็นเต็ม (Business Package + Stock Pro ทุกร้าน); BUSINESS active → เห็นแค่ Stock Pro ของ business นั้นใบเดียว (จัดการได้), ซ่อน Business Package + ร้านอื่น. service เพิ่ม `getShopSubscriptionRow(shopId)` (reuse `buildShopRow`); page branch ตาม `resolveActiveShopContext().kind` | T3+ | switch active เป็น business X → เปิดหน้าเห็นการ์ด Stock Pro ของ X ใบเดียว (มีปุ่มจัดการ), ไม่เห็น Business Package/ร้านอื่น; switch กลับ personal → เห็นเต็มเหมือนเดิม | DONE (pending commit) |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block). ถ้าจำเป็นต้องทำ → Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log.

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | Admin จัดการ/สมัคร/อัปเกรด/ยกเลิก/ต่ออายุแทน seller (write action ใด ๆ ฝั่ง admin) | Phase 2 — admin ต้อง read-only เท่านั้น (D-2) |
| OOS-2 | หน้า detail รายร้าน/ธุรกรรมของ subscription ฝั่ง admin | Phase 2 |
| OOS-3 | แก้ payment endpoint เดิม (`/api/inventory/{subscribe,reactivate,upgrade}`, business package endpoints) ให้รับ `shopId` เป็นพารามิเตอร์ / เพิ่ม IDOR guard ใหม่ | Phase 2 — คง resolve จาก `session.activeShopId`/PERSONAL ฝั่ง server เท่านั้น (D-1 REVISED, เหตุผลด้านความปลอดภัย) |
| OOS-4 | จัดการ Stock Pro ของร้านที่ไม่ active จาก hub โดยตรง (ไม่ผ่านสลับร้านก่อน) | Phase 2 (หรือจนกว่าจะแก้ OOS-3) — ต้องกดสลับร้านก่อนเสมอ |
| OOS-5 | ลบ/deprecate UI จัดการเดิมที่ `/inventory` และ `/business` (lifecycle เดิม) | ยังไม่ทำ phase นี้ — เก็บ hub ให้เสถียรก่อนค่อย deprecate กัน regression |
| OOS-6 | เพิ่ม/แก้ Prisma model หรือ migration ใด ๆ | ไม่มีความจำเป็น — reuse schema เดิมทั้งหมด |
| OOS-7 | Grouping ข้อมูล Business Package ไม่ให้ซ้ำเมื่อเจ้าของมีหลายร้าน business ในตาราง admin | Phase 2 — ยอมรับข้อมูลซ้ำต่อแถวใน phase นี้ (ระบุไว้ใน design spec §4) |

## Assumptions
- ไม่มี model/migration ใหม่ — schema เดิมพอ (`Shop`, `InventoryEntitlement`, `BusinessPackageSubscription`, `SellerWallet`)
- Component จัดการ subscription เดิมทั้งหมด (`PackageTierGrid`, `PackageActionButton`, `CancelPackageButton`, `DowngradeButton`, `AdvanceWarningBanner` ทั้ง 2 ระบบ, `LockedStateBanner`, `QuotaUsageCard`, `SubscribeButton`, `UpgradeToProCard`, `ReactivateButton`) **reuse โดยไม่แก้ logic เดิม** — ประกอบ/wrap ใหม่เท่านั้น
- Cron/renewal logic เดิมของทั้ง 2 ระบบ (Stock Pro + Business Package) ไม่แตะ ไม่กระทบ phase นี้
- Payment/subscribe endpoint เดิม resolve shop จาก `session.activeShopId`/PERSONAL ฝั่ง server เท่านั้น (ไม่รับ `shopId` param) — เป็นเหตุผลที่ D-1 กำหนดให้จัดการเฉพาะร้าน active + ใช้กลไกสลับร้านแทน
- Theme: seller/admin = Paces เท่านั้น (Preline+Tailwind), primary น้ำเงิน `#236dc9` — ไม่ใช่ม่วง Vuexy
- กลไกสลับร้าน active (`session.activeShopId`, `POST /api/business/switch-context`, pattern จาก `BusinessOnboardingWizard.tsx`) มีอยู่แล้วในระบบ ใช้ reuse ตรง ๆ ไม่สร้างใหม่
- Feature-docs เต็มรูป (00012 PRD/BRD/SRS/SDS/DATABASE/API/Tests ตาม Hard Rule 11) **ไม่ทำใน phase นี้** — ใช้ design spec + plan เป็น SSOT แทน ตามที่ user ตัดสินก่อนเข้า plan (design spec §9); ถ้า Controller ต้องการยกระดับเป็น full feature-docs ภายหลัง ไม่ถือเป็น scope ของ baseline นี้
- Layout ของ Section B (การ์ดแนวตั้ง vs grid) เป็นการตัดสินใจระดับ UX ที่ `safepay-ux` จะกำหนดตอนออก Design Spec ต่อ task — ไม่กระทบขอบเขต S-id ใด ๆ ด้านบน

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ — **ไม่นับเป็น GAP** ตอน audit/sign-off

- Admin เขียน/จัดการแทน seller (สมัคร/อัปเกรด/ยกเลิก/ต่ออายุ) — OOS-1
- หน้า detail รายร้าน/ธุรกรรม subscription ฝั่ง admin — OOS-2
- แก้ payment endpoint ให้รับ `shopId` + เพิ่ม IDOR guard เพื่อให้จัดการร้านที่ไม่ active ได้ตรง ๆ — OOS-3, OOS-4
- Deprecate/ลบ UI จัดการเดิมที่ `/inventory`, `/business` — OOS-5
- Group ข้อมูล Business Package ไม่ให้ซ้ำต่อเจ้าของในตาราง admin — OOS-7

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ — กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-04 | baseline สร้าง | - | - |
| 2026-07-04 | S-7: เปลี่ยน component จัดการร้าน active จาก `SubscribeButton`/`ReactivateButton` → `PackageSelector` (+ `UpgradeToProCard`) | safepay-ux พบว่า 2 component เดิม broken/orphaned (POST เปล่า vs route บังคับ body `{package}` = 400); `PackageSelector` คือตัวที่ inventory/page.tsx ใช้จริงและทำงานถูก — คง intent "จัดการ inline ในหน้าเดียว" ไว้ (ไม่ link ออก) | Controller (verify orphan + PackageSelector drop-in แล้ว) |
| 2026-07-04 | S-18 (#3): เพิ่ม context-scoped view — BUSINESS active เห็นแค่ Stock Pro ของ business นั้น (ซ่อน Business Package + ร้านอื่น) | user request: "แพ็กเกจของฉัน" ควร scope ตาม active context — personal(เจ้าของ)=เห็นเต็ม, business=เห็นแค่ของตัวเอง. reuse `buildShopRow`, ไม่แตะ payment/security | Controller (user directive) |
| 2026-07-04 | S-12/S-13: เพิ่ม field `bizRenewalTh` (วันต่ออายุ Business Package) ใน `AdminSubscriptionRow` + แสดงใต้ badge tier | symmetry กับ Stock Pro (`stockRenewalTh`); มีประโยชน์กับ admin monitoring; ต้นทุนต่ำ (select `nextRenewalAt` จาก businessPackageSubscription + formatDate). Badge kind BUSINESS ใช้ `bg-primary/15` (น้ำเงิน consistent กับ seller hub) ไม่ใช้ secondary (เลี่ยงม่วง-adjacent). Business filter คง tier อย่างเดียว (LOCKED filter = Phase 2) | Controller |

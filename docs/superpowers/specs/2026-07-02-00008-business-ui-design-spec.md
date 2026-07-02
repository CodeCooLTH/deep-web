# Design Spec — feat 00008 Business Account & Packages UI (seller `(paces)/**`)

> safepay-ux output 2026-07-02 (Hard Rule 8 gate). Base หลัก = in-app precedent feat 00003 Inventory Add-on (`src/app/(paces)/seller/(dashboard)/inventory/**`) — โครง subscription เดียวกัน. Paces primary `#236dc9`, ห้าม arbitrary value (HR7), ห้าม emoji (HR12), toast=pacesToast (HR9), modal=Sweet Alerts.

## Constants (mirror SRS §10)
Tier: Free ฿0(0/-) · Growth ฿159(1/1) · Pro ฿599(3/3) · Business ฿1299(∞/∞)

Lock reason → Thai label:
| Reason | Label | Grace 30d? |
|---|---|---|
| `RENEWAL_FAILED` | ต่ออายุไม่สำเร็จ (เครดิตไม่พอ) | ✅ |
| `OWNER_CANCELLED_PACKAGE` | เจ้าของยกเลิกแพ็กเกจ | ✅ |
| `QUOTA_EXCEEDED_BUSINESS_COUNT` | เกินโควตาจำนวนธุรกิจ | ❌ |
| `QUOTA_EXCEEDED_ADMIN_COUNT` | เกินโควตาผู้ดูแลต่อธุรกิจ | ❌ |

**Icon:** ใช้ `Icon` wrapper (`src/components/wrappers/Icon.tsx`, prefix `tabler:` อัตโนมัติ) **short-form เท่านั้น** (`icon="alert-triangle"` ไม่ใช่ `"tabler-alert-triangle"` — double-prefix bug ในโค้ดเก่า WalletCard/AdvanceWarningBanner render blank, อย่า copy). safe icons: alert-triangle, shield-check, lock, mail, phone, trash, x, check, chevron-down, building-store, plus, rocket, refresh, users, user-plus, package, link, clock-off, info-circle.
**สี token:** danger banner `border-danger/20 bg-danger/10 text-danger`; warning `border-warning/20 bg-warning/15 text-warning`; badge soft `bg-{color}/15 text-{color}`.
**วันที่:** `formatDate`/`formatDateTime` จาก `src/lib/format-date.ts` เท่านั้น (ห้าม toLocaleDateString).

---

## 1. Package matrix — `(paces)/seller/(dashboard)/business/page.tsx`
FR-BIZ-01/05/14/16/17/18/19/21/27. RSC — เรียก service (`getSubscriptionStatus`/business list) ตรง ไม่ fetch HTTP เอง (เหมือน InventoryPage).

Sections: (1) locked banner ถ้า `LOCKED_RENEWAL_FAILED` (§6), (2) advance-warning banner ถ้า `daysUntilRenewal≤3 && balance<price`, (3) quota-usage card (progress bar ธุรกิจ X/max + list businesses[] role/lock badge + ปุ่มสร้างธุรกิจ), (4) grid 4 tier cards.

**ปุ่มต่อ state:** NOT_SUBSCRIBED→การ์ด Free badge "ปัจจุบัน", tier อื่นปุ่ม "สมัคร"(Sweet confirm ราคา)→POST /subscribe. ACTIVE→Free card ปุ่ม "ยกเลิกแพ็กเกจ"(§5a), tier ต่ำ "ดาวน์เกรด"(§5b), tier ปัจจุบัน badge, tier สูง "อัพเกรด"(Sweet confirm เต็มราคา)→POST /upgrade. LOCKED→ทุกปุ่ม grid disabled, reactivate ที่ banner.

**Theme mapping:** shell=inventory/page.tsx + PageBreadcrumb · locked banner=WalletCard.tsx:42-52 · advance banner=AdvanceWarningBanner.tsx · progress bar=paces `ui/progress` (`bg-default-100 h-4 rounded` + inner `bg-primary`) · tier grid=InventoryGate.tsx (1→4 card) + paces `pages/pricing` (`card h-full`, `card-body p-7.5 text-center`, feature ul+check; **text-4xl ไม่ใช่ text-[40px]**; current tier=`border-primary border` ไม่ใช่ !bg-primary) · ปุ่ม subscribe/upgrade/reactivate=SubscribeButton.tsx/ReactivateButton.tsx (Swal preConfirm+fetch+pacesToast+router.refresh).

## 2. AccountSwitcher — `src/layouts/components/Sidenav/**` (client)
FR-BIZ-14/15. **ถ้า `hasBusinessMembership===false` → `return null`** (ซ่อนสมบูรณ์ ไม่ใช่ disabled). Mount ใต้ UserProfileSettings, รับ prop hasBusinessMembership จาก session. Dropdown แสดง active shop + list (Personal จาก context.personal + businesses[]), role badge + lock badge, radio-dot indicator (●/○). กด item→POST /switch-context→ 200 useSession().update({activeShopId})→router.refresh(); 403→pacesToast.error. **hs-dropdown ตรง ๆ ปลอดภัย** (Sidenav mount ครั้งเดียว ไม่ re-render). Fetch GET /context on mount (client).
**Theme:** UserProfileSettings.tsx hs-dropdown block · header+badge=UserDropdownDetailed.tsx · item=`.dropdown-item`+`.dropdown-divider`.

## 3. Create Business — `(paces)/seller/(dashboard)/business/create/page.tsx`
FR-BIZ-06/07. RSC guard: `subscription` ไม่ ACTIVE หรือเต็มโควตา → **empty-state card** (ไม่แสดงฟอร์ม) "ไปเลือกแพ็กเกจ/อัพเกรด →" (mirror InventoryGate gate-before-form). ฟอร์ม client (RHF+Yup) 4 field: ชื่อธุรกิจ*/หมวดหมู่/ประเภท(radio INDIVIDUAL/COMPANY)/คำอธิบาย — **single card ไม่มี wizard** (ตัด multi-step ของ ShopForm). Submit→POST /shops→201→pacesToast+router.push(`/business/{shopId}/invites`).
**Theme:** shell=onboarding/page.tsx guard + ShopForm.tsx (Step-1 field group เท่านั้น) · input=ShopForm ชื่อร้าน · select=form-select native (HR6 form bind) + SHOP_CATEGORY_KEYS · radio=ShopForm:273-311 · empty-state=products/new-v2 "ไม่มีร้าน" pattern.

## 4. Invite management — `(paces)/seller/(dashboard)/business/[shopId]/invites/page.tsx`
FR-BIZ-09/10/11/12. RSC guard `isShopMember` (403→notFound). **PII: invitedContact mask ที่ server** (maskPhone util) — RSC ห้าม raw. 3 cards: (1) invite form (contact input + type select + ปุ่มส่ง; disabled ถ้าเต็มโควตา/locked), header "X/Y ใช้แล้ว", (2) pending invites table (contact masked/type/date/status badge/ปุ่มยกเลิก), (3) current members table (owner row ไม่มีปุ่มลบ, admin row มี trash). Cancel invite + remove member = Sweet Alerts confirm.
**Theme:** form=input-icon-group + Icon phone/mail + form-select · table=paces `.table`/`table-hover` (**ไม่ใช่ TanStack** — ≤3 แถว) · badge PENDING=`bg-warning/15 text-warning` · row action=`btn btn-sm btn-icon bg-danger/15 text-danger` + icon x/trash · confirm=SubscribeButton Swal โครง.

## 5. Cancel + Downgrade Sweet Alerts
**5a Cancel** (FR-BIZ-27): Swal icon warning, html list ธุรกิจที่จะถูกล็อก + deadline 30 วัน (จาก context.businesses[] ที่ page มีแล้ว), confirmButton `btn bg-danger text-white`, preConfirm→POST /cancel→pacesToast+refresh.
**5b Downgrade** (FR-BIZ-17/18/19): client คำนวณ `activeBusinesses > newTier.maxBusinesses`? ไม่เกิน→confirm ธรรมดา→POST /downgrade {keepShopIds:[]}. เกิน→selection modal (Swal html checkbox list ให้เลือก keepShopIds ครบ newTier.maxBusinesses เป๊ะ, ปุ่มยืนยัน disabled จนเลือกครบ via didOpen listener)→POST /downgrade {keepShopIds}. business ที่ locked อยู่แล้ว=disabled ในลิสต์.
**Theme:** SubscribeButton.tsx Swal โครง + SweetAlerts.tsx dangerAlert/htmlAlert; checkbox=`form-checkbox` ใน html string.

## 6. LockedStateBanner (shared component)
`<LockedStateBanner shop={{lockReason, packageLockedAt}} tierPrice/>`. 2 variant: grace-eligible (RENEWAL_FAILED/OWNER_CANCELLED) → countdown (`packageLockedAt + 30d` via formatDate) + CTA (subscription-level=ปุ่ม reactivate, shop-level=ลิงก์ "ไปหน้าแพ็กเกจ"); quota (BUSINESS_COUNT→"อัพเกรด", ADMIN_COUNT→"แก้ไขผู้ดูแล") → ไม่มี countdown. ไม่ใช่ pacesToast/Swal (persistent inline). clamp countdown `Math.max(0,...)`.
**Theme:** WalletCard.tsx:42-52 + InventoryGate LOCKED variant · CTA link=AdvanceWarningBanner:40-42 · countdown=format-date.ts.

---

## Open items (จาก ux)
1. Package matrix ไม่โชว์ adminCount ต่อ business (API /context ไม่มี field) — ถ้าต้องการต้องขยาย API
2. Locked-banner multi-deadline: lockAllBusinessShops ล็อกพร้อมกันเสมอ (เวลาเดียว) → deadline ตรงกัน practical
3. **Accept-invite page (`/invites/[id]/accept`) + Admin extension (`admin/topups/[id]`) ยังไม่ออกแบบ** — dispatch ux แยกรอบก่อน build 2 surface นี้
4. **Sidebar menu `/business` entry** ต้องเพิ่มใน seller menu — icon (building-store?) ต้อง verify มีจริงใน iconify ก่อน hardcode (HR7)

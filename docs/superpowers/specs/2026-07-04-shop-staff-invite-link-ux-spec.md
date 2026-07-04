# UX Design Spec — feature 00012 "พนักงาน" Phase 4 UI (safepay-ux gate output)

Confirmed: primary `#236dc9` via `bg-primary`/`text-primary` token (ห้าม `#7367F0`); font Anuphan; ไม่มี emoji. Icons ส่งให้ `Icon` wrapper **ไม่มี prefix `tabler-`** (wrapper เติม `tabler:` ให้เอง): เมนู=`users-group`, copy=`copy`, revoke=`link-off`, create=`plus`.

Controller-resolved open questions:
- ปุ่ม "เข้าสู่ระบบด้วยวิธีอื่น" บน landing → link ไป `/auth/sign-in?callbackUrl=/i/<slug>` (reuse seller sign-in; ไม่สร้าง auth ใหม่). Social FB/LINE = ปุ่มหลัก.
- เมนู section = **STORE**; role label = **"ผู้ดูแล"** (ตาม `CurrentMembersTable.tsx` เดิม); ตัด "สร้างโดย"; มี input วางลิงก์ใน 0-shop state.
- `/choose-shop` list = Personal (getPersonalShop) + business memberships — mirror `src/app/api/business/context/route.ts` (อย่า list จาก ShopMember[] เปล่า ๆ; Personal shop ก็มี ShopMember(OWNER) row แต่ resolve logic ยึด context route เดิมให้ consistent).

## Reusable primitives (reuse ตรง ๆ ห้ามสร้างใหม่)
| Primitive | Path |
|---|---|
| CurrentMembersTable | `src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/components/CurrentMembersTable.tsx` |
| RowActionDeleteButton | `.../invites/components/RowActionDeleteButton.tsx` |
| CopyLinkButton (prop showPreview) | `src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx` |
| AuthCardShell | `src/app/(paces)/seller/auth/components/AuthCardShell.tsx` |
| AuthLogo | `src/components/AuthLogo.tsx` |
| PageBreadcrumb | `src/components/PageBreadcrumb.tsx` |
| generateInitials | `src/utils/helpers.ts` |
| FB/LINE social button JSX | `src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx:93-148` (เปลี่ยน callbackUrl→`/i/<slug>`) |
| switch-context logic | `src/layouts/components/TopBar/components/UserDropdownDetailed.tsx:91-120` (`handleSwitch`) + endpoint `src/app/api/business/switch-context/route.ts` |
| Sweet Alerts input:select | Base `theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx` |
| pacesToast | `src/lib/paces-toast.ts` |

Toast/Modal: คัดลอก/สำเร็จ → `pacesToast.success` (top-right); revoke/ลบ/สร้าง(เลือกอายุ) → Sweet Alerts (RowActionDeleteButton มี Swal ในตัว; สร้างลิงก์ใช้ Swal `input:'select'`).

## ไฟล์ใหม่ที่ต้อง Create
| ไฟล์ | ชนิด | Task |
|---|---|---|
| `src/app/(paces)/seller/(dashboard)/admins/page.tsx` | RSC | 4.3 |
| `src/app/(paces)/seller/(dashboard)/admins/components/InviteLinkCard.tsx` | client | 4.3 |
| `src/app/(paces)/seller/i/[slug]/page.tsx` | RSC | 4.2 |
| `src/app/(paces)/seller/i/[slug]/components/InviteLandingClient.tsx` | client | 4.2 |
| `src/app/(paces)/seller/i/invalid/page.tsx` | RSC | 4.2 |
| `src/app/(paces)/seller/choose-shop/page.tsx` | RSC | 4.1 |
| `src/app/(paces)/seller/choose-shop/components/ChooseShopClient.tsx` | client | 4.1 |
| `src/app/api/shops/open-personal/route.ts` | API | 4.1 |
Modify (4.3): `_seller-menu.ts` (+item +`applyStaffMenu`), `(dashboard)/layout.tsx` (call applyStaffMenu), `getSellerPageTitle.ts` (+/admins title).

## Screen 1: /admins (under (dashboard) shell)
- เมนู item ใน section STORE (ต่อจาก "ตั้งค่าร้านค้า"): `{ url:'/admins', slug:'seller:admins', label:'พนักงาน', icon:'users-group' }`. `applyStaffMenu(items,{kind,role})` มิเรอร์ `applyInventoryGate` — ถ้า `!(kind==='BUSINESS' && role==='OWNER')` → กรอง item ออก (ซ่อน ไม่ disable).
- RSC guard: `active.kind==='BUSINESS' && role==='OWNER'` else `notFound()` (mirror `invites/page.tsx`).
- Card A "ลิงก์เชิญพนักงาน" (`InviteLinkCard`): header ปุ่ม "+ สร้างลิงก์เชิญ" (btn-sm bg-primary, icon plus) → Swal `input:'select'` (options 24h/7d/30d, default 7d) → POST `/api/shops/current/invite-links` → success `router.refresh()` + `pacesToast.success`. body: list active links (row = CopyLinkButton value=url showPreview + RowActionDeleteButton endpoint=`/api/shops/current/invite-links/{slug}` icon=`link-off` confirmTitle="ยกเลิกลิงก์นี้?" confirmText="ลิงก์นี้จะใช้เชิญคนใหม่ไม่ได้อีก (คนที่เข้าร่วมไปแล้วยังเป็นสมาชิกอยู่)" successMessage="ยกเลิกลิงก์เรียบร้อย"); meta `text-default-500 text-2xs` "หมดอายุ {formatDate(expiresAt)} · ใช้ซ้ำได้จนหมดอายุ". empty → "ยังไม่มีลิงก์เชิญที่ใช้งานอยู่ กดสร้างลิงก์ใหม่ด้านบน".
- Card B "สมาชิกทั้งหมด (N)": reuse CurrentMembersTable; header badge quota "โควตาแอดมิน X/Y (แพ็กเกจ {tier})" (`badge bg-default-100 text-default-600 text-2xs`). ปุ่มลบต่อ endpoint remove-member ของ feature (owner-only, ลบ OWNER/ตัวเองไม่ได้). ใช้ formatDate (พ.ศ.) สำหรับ "วันที่เข้าร่วม".
- Base: card=`theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx`; table=CurrentMembersTable (Base เดิม HoverableRows).

## Screen 2: /i/[slug] (direct seller route — own AuthCardShell, NOT under dashboard/fullscreen)
- RSC: `resolveInviteLink(slug)`; `!valid` → `redirect('/i/invalid')`. valid → AuthCardShell + InviteLandingClient(props shopName, shopLogo, slug, hasSession).
- invite banner: `bg-primary/10 rounded-lg p-3 flex items-center gap-3` avatar initials + "{shopName}" + "เชิญคุณเป็น 'ผู้ดูแลร้าน'".
- not-logged-in: FB+LINE buttons (copy JSX จาก SignInForm, callbackUrl=`/i/<slug>`) + dashed divider "หรือ" + link "เข้าสู่ระบบด้วยวิธีอื่น" → `/auth/sign-in?callbackUrl=/i/<slug>`.
- logged-in: ปุ่ม "ยอมรับคำเชิญ" (btn bg-primary w-full, icon check) → POST `/api/i/<slug>/accept` → success `session.update({activeShopId})` → `router.push('/dashboard')`; error → `pacesToast.error` (ADMIN_QUOTA_EXCEEDED→"ร้านนี้มีผู้ดูแลเต็มจำนวนแล้ว กรุณาติดต่อเจ้าของร้าน"; ALREADY_OWNER→"คุณเป็นเจ้าของร้านนี้อยู่แล้ว") ค้างหน้าเดิม.
- `/i/invalid`: AuthCardShell + GateCard-โครง (icon circle `bg-default-100 text-default-500`) title "ลิงก์เชิญนี้ใช้งานไม่ได้แล้ว" desc "ลิงก์อาจหมดอายุ ถูกยกเลิก หรือไม่ถูกต้อง กรุณาติดต่อเจ้าของร้านเพื่อขอลิงก์ใหม่" + ปุ่ม "กลับหน้าแรก" (Link `/`).
- Base: shell=AuthCardShell; social=SignInForm:93-148; invalid card โครง=`business/create/page.tsx:96-120`.

## Screen 3: /choose-shop (direct seller route — own shell, NOT under dashboard/fullscreen → กัน redirect loop)
- RSC: require session (else redirect sign-in). resolve shops = Personal (getPersonalShop) + business memberships (mirror `api/business/context`). count: 0 → empty state; 1 → `redirect('/dashboard')`; ≥2 → grid.
- grid: `grid grid-cols-1 sm:grid-cols-2 gap-4`; การ์ด = `<button>` (ไม่ใช่ `<a>`) avatar initials `bg-primary/10 text-primary rounded-full size-11` + ชื่อ (font-semibold) + role badge (เจ้าของ=primary/15, ผู้ดูแล=info/15 ตรง Screen1). click → POST `/api/business/switch-context` → `session.update({activeShopId})` → `router.push('/dashboard')` (reuse handleSwitch logic). error 403 → `pacesToast.error('ไม่มีสิทธิ์เข้าถึงร้านนี้แล้ว')`.
- ปุ่ม "+ เปิดร้านของฉันเอง (เป็นผู้ขาย)" (btn border-dashed border-default-300 text-primary hover:bg-primary/5 w-full, icon plus) → POST `/api/shops/open-personal` → `session.update({activeShopId:newShopId})` → `router.push('/onboarding')`.
- หมายเหตุ `text-2xs text-default-400 text-center`: "ถูกเชิญเป็นผู้ดูแล = ยังไม่ถือเป็นผู้ขาย และไม่มีร้านของตัวเอง — เปิดร้านเองได้ทุกเมื่อ".
- 0-shop: GateCard-โครง (icon `building-store` วงกลม `bg-primary/15 text-primary`) title "ยังไม่มีร้านค้าของคุณ" desc "เริ่มขายของออนไลน์ได้ทันที หรือวางลิงก์เชิญถ้ามีคนแชร์มาให้" + ปุ่ม "เปิดร้านของฉัน" + input วางลิงก์ (`input-icon-group` icon link + ปุ่ม "ไป" → parse slug จาก URL → `router.push('/i/'+slug)`; ผิดรูปแบบ → inline error "ลิงก์ไม่ถูกต้อง").
- Base: shell=AuthCardShell; card grid=`ui/cards/page.tsx` + avatar `InboxList.tsx:50-71`; empty โครง=`business/create/page.tsx:96-120`.

## open-personal API (Task 4.1)
`POST /api/shops/open-personal`: session required. `ensurePersonalShop(user.id)` (`@/lib/shop-context`) + set `user.isShop=true` (prisma.user.update) ใน transaction ถ้าเหมาะ. คืน 200 `{ shopId }`. ถ้ามี Personal อยู่แล้ว → คืน shopId เดิม (idempotent). (client set activeShop + ไป /onboarding.)

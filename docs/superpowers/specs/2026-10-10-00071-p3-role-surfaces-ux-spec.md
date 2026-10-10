# Design Spec 00071 P3 — พื้นผิวตามบทบาท (6 งาน)

ที่มา: safepay-ux 2026-10-10 (Mode: Operate) · ศัพท์ล็อก: เจ้าของร้าน · เจ้าของหลัก (T4) · ผู้ดูแล/ตอบแชท/เปิดบิล/ฝ่ายช่าง · กระเป๋าเงินของร้าน · ห้าม "พนักงาน" ในข้อความใหม่ (ยกเว้นป้ายประเภท P2) · ห้าม "ไม่สามารถ"/"คุณไม่มีสิทธิ์"

## มติ Controller ต่อคำถามค้าง
1. เพิ่มแถว `ออกจากระบบ` ท้าย footer ของ `AccountSwitcherSheet` (ดึงขั้นตอน `pacesConfirm` + `revokePushToken` จาก `SignOutCard` เป็นฟังก์ชันร่วม) — ทุกบทบาท
2. ป้าย FAB BILLING = `vocab.createLabel` (`สร้างงานบริการ`) — แก้ BRD §8.5
3. `/settings` (จัดส่ง/iShip) = S2 (เจ้าของ + ผู้ดูแล) ตามมติ user C-2 — ยกเลิก C-4 ส่วนนี้
4. อนุมัติการ์ด "งานวันนี้" บนหน้าแรกช่าง (wrapper client บาง ๆ ครอบ `AppointmentDayRows` เดิม)
5. ไล่ `describeOrderEvent`/`RecentActivityFeed`: ถ้ามีจำนวนเงิน → ช่างไม่เห็นฟีด (AchievementLevel อยู่คอลัมน์ 5 ตามเดิม) · ซ่อน `CustomerBehaviorIcons` จากช่าง
6. ช่างในร้านที่ไม่รับนัด: แท็บ "งาน" → `/orders`
7. เลื่อนนัด = O3 (ช่างไม่ได้) — server 403 ด้วย
8. รายการพิมพ์เองของบทบาทอื่นในร้านบริการเป็น PHYSICAL (`OrderCreateForm.tsx:698-701`) — นอก scope (บันทึก OOS)
9. ข้อ 7/9/11 ของ ux (header back, FAB ที่ 4 ช่อง) → browser QA checklist
10. ข้อพบ class เสีย (สคริปต์แทรกกลางคำ) แก้เมื่อแตะไฟล์: `OrderStatusBand.tsx:313` · `BestSellerStrip.tsx:79` · `OrderCard.tsx:335` (`ju…stify-center`) · `ProductCapabilityCardV2.tsx:54` · `settings/auto-reply/AutoReplyListing.tsx:442`

## 1. NoPermissionCard (ทั่วไป)
- ไฟล์: `src/app/(paces)/seller/(dashboard)/_shared/NoPermissionCard.tsx` (RSC) — ย้ายจาก `expenses/components/ExpenseLockedCard.tsx` (แก้ผู้ใช้เดิมทั้งหมด ไม่เก็บชื่อเก่า) · `src/components/paces/NoPermissionCard.tsx` ของ T1 ชี้มาที่นี่หรือรวมเป็นไฟล์เดียว
- Props: `capability: Capability` (บังคับ) · `viewerRoles: readonly ShopRole[]` (บังคับ) · `detail?: string` (หน้าการเงินส่งประโยคเดิม)
- ข้อความจาก pure `src/lib/no-permission-copy.ts` `noPermissionCopy({capability, viewerRoles, detail})` + เทส (ห้ามสตริงต้องห้ามทุก capability)
- markup เดิมของ ExpenseLockedCard · `p-10` → `p-6 md:p-10` · icon `lock` · สีกลาง · ไม่มีปุ่ม · PageBreadcrumb เดสก์ท็อปเท่านั้น (`hidden lg:block`)

| กรณี (`staff` = STAFF_ROLES ∩ CAPABILITY_ROLES[cap]) | h2 | ประโยคหลัก | บรรทัดผู้ดู (`text-sm text-default-500`) |
|---|---|---|---|
| staff ว่าง + detail | `หน้านี้ดูได้เฉพาะเจ้าของร้าน` | detail | `บทบาทของคุณตอนนี้: {roles}` |
| staff ว่าง ไม่มี detail | เหมือนบน | `ถ้าต้องการใช้หน้านี้ ขอให้เจ้าของร้านเป็นคนทำให้ได้เลย` | เหมือนบน |
| T4 | `หน้านี้ดูได้เฉพาะเจ้าของหลักของร้าน` | `เจ้าของร่วมเข้าหน้านี้ไม่ได้ ถ้าต้องการใช้ ขอให้เจ้าของหลักเป็นคนทำ` | เหมือนบน |
| staff ไม่ว่าง | `หน้านี้ดูได้เฉพาะบางบทบาท` | `เจ้าของร้านและคนที่มีบทบาท{list}เปิดหน้านี้ได้` | `บทบาทของคุณตอนนี้: {roles} · ถ้าต้องใช้หน้านี้ ขอให้เจ้าของร้านเพิ่มบทบาทให้` |
`{list}` 1 = `ตอบแชท` · 2 = `ผู้ดูแลหรือตอบแชท` · 3 = `ผู้ดูแล ตอบแชท หรือเปิดบิล` · `{roles}` คั่น `, ` + `และ` ก่อนตัวสุดท้าย · viewerRoles ว่าง = ไม่แสดงบรรทัดผู้ดู

## 2. แถบล่าง + FAB — `resolveMobileNav` ใน `src/lib/role-nav.ts`
| แท็บ | เงื่อนไข | href · icon · ป้าย |
|---|---|---|
| หน้าหลัก | ทุกบทบาท | `/dashboard` · `home-2` · `t.dashboard.navHome` |
| ออเดอร์ | มี ∈ {OWNER,MANAGER,CHAT,BILLING} | `/orders` · `clipboard-list` · `nounShort` + badge pending |
| งาน | บทบาทที่ถือทั้งหมด = TECHNICIAN | `/queues` ถ้า `canUseAppointments(shop)` ไม่งั้น `/orders` · `calendar-event`/`clipboard-list` · `งาน` · ไม่มี badge |
| แชท | can(H1) | `/inbox` · `message-circle` · badge unread |
| ร้านค้า | can(T1) | `/shop` · `building-store` · จุด `shopAlert` |
- FAB: can(P2) → speed-dial `buildFabActions` เดิมทุกตัวอักษร (ย้าย export มา lib) · ไม่มี P2 แต่ can(O2)||can(O2s) → **direct** `<Link href="/orders/new">` icon `plus` `aria-label={vocab.createLabel}` ป้ายใต้ `t.dashboard.navCreate` · ไม่มีเลย (ช่าง) → ไม่มี FAB/ช่อง
- ตำแหน่ง FAB หลัง ⌈n/2⌉ แท็บแรก · `grid-cols` map สตริงตรงตัว `{2:'grid-cols-2',3:'grid-cols-3',4:'grid-cols-4',5:'grid-cols-5'}`
- OWNER/MANAGER 5 ช่อง (เหมือนวันนี้) · CHAT `[หน้าหลัก][ออเดอร์][(+)][แชท]` · BILLING `[หน้าหลัก][(+)][ออเดอร์]` · TECH `[หน้าหลัก][งาน]` · union: CHAT+TECH=CHAT, BILLING+TECH=BILLING, CHAT+BILLING=CHAT, มี MANAGER=MANAGER
- `SellerBottomNav.tsx`: วนจาก `nav.tabs` แทน JSX ทีละช่อง (:314-456) — **เทียบ DOM ของ OWNER กับเดิมทีละคลาส** · prop `nav: MobileNav` จาก `(dashboard)/layout.tsx` · unread แชทไม่คำนวณถ้าไม่มี H1
- ซ่อน nav = "หน้านั้นวาดแถบล่างเอง": `/orders`,`/products` เดิม · `/orders/<token>` ซ่อนเมื่อมี `OrderActionBar` (ช่างไม่มี → เห็น nav) · `/queues` ซ่อนเมื่อ can(O2s) (ช่างเห็น nav) · หัว `+` full-screen แสดงเมื่อ can(O2s)
- safe-area/72px/FAB 54px/carve-out เดิมไม่แตะ · App Store: `applyPaymentRestriction` ก่อนตัวกรองบทบาท · เทสพฤติกรรม 3 เปลือก × 5 บทบาท

## 3. หน้าแรกตามบทบาท
| บทบาท | มือถือ | เดสก์ท็อป |
|---|---|---|
| OWNER | เดิม | เดิม |
| MANAGER/CHAT | พฤติกรรม P1 (BestSellerStrip ไม่มีจำนวน, ยอดรายใบคงไว้) | ผัง P1 |
| BILLING | CompactHero → OrderStatusBand → CarouselGrid (ไม่มี BestSellerStrip) | ผัง P1 ไม่มีการ์ดสินค้า |
| TECHNICIAN | CompactHero (ไม่มีกระเป๋า) → **การ์ดงานวันนี้** → OrderStatusBand (serviceWork) → CarouselGrid | แถว1 [UserCard][งาน][Trust] \| [งานวันนี้ 7 คอล แทน SalesChannelDonut] · แถว2 OrderStatusBand · แถว3 RecentOrder เต็มกว้างไม่มีคอลัมน์ยอด ไม่มีปุ่มส่งออก/นำเข้า · แถว4 Achievement(5)+Activity(7, ถ้าไม่มีเงิน) |
- BestSellerStrip แสดงเมื่อมี ∈ {OWNER,MANAGER,CHAT}
- การ์ดงานวันนี้: `.card` + `.card-header !py-3` แบบ OrderStatusBand · หัว `(calendar-event) งานวันนี้ · {n} งาน` + ลิงก์ `ดูตารางงาน ›` (`text-primary`, `/queues?date=<วันนี้ไทย>`) · `AppointmentDayCard` สูงสุด 3 ใบ (ไม่มียอด/มัดจำ) + `ดูทั้งหมดวันนี้ ({N}) ›` · ว่าง: `วันนี้ยังไม่มีนัด` + `ดูตารางงานทั้งเดือน ›` · โหลด: skeleton 1 ใบ · error: `โหลดงานวันนี้ไม่สำเร็จ` + `ลองอีกครั้ง` · **ห้าม mount ซ่อนด้วย CSS** (endpoint คืนเบอร์ลูกค้า) · ร้านไม่รับนัด → ไม่มีการ์ด
- `RecentOrder.tsx` คอลัมน์ `totalAmount` (:90-96) `...(showAmount ? [col] : [])` · ปุ่มส่งออก/นำเข้า (:158-163) ซ่อนเมื่อ NONE · SalesChannelDonut ไม่แสดงสำหรับ NONE
- ทางลัดที่ไม่มีสิทธิ์ห้ามโผล่ใน "ไม่พร้อมใช้งาน" ของชีตแก้ไข (`unavailableByRole`)

## 4. ช่าง: รายการ/รายละเอียด/คิว (prop `showMoney` ค่าตั้งต้น false · ข้อมูลตัดที่ `toNoMoneyOrder`)
### OrdersTable (เดสก์ท็อป)
ตัด: `select` (:367-381) + checkbox groupRow (:1225-1233) + BulkActionBar (:1315) · ราคาต่อหน่วยในคอลัมน์ items (:428-430) · คอลัมน์ `paymentMethod` (:731-755) · `total` (:757-769) · ขั้น `รับเงินปลายทาง` (:805-807) และ `เก็บเงินครบ` (:817) · `CustomerBehaviorIcons` (:528) · "เปิดข้อความสนทนา" (:1270-1277) เมื่อไม่มี H1 · ปุ่มสร้าง (:1157-1160) เมื่อไม่มี O2s · เทสว่าค้นด้วยตัวเลขยอด/วิธีชำระไม่ได้ผล
### OrderCard (มือถือ)
ตัด ฿ราคา (:322) · ยอดรวม (:465-467) · วิธีชำระใน meta (:244-250 ปรับตัวคั่น) · ป้ายสถานะไม่มี `order.money` → กิ่งไม่ใช่เงิน (:167-175) · ⋮ เฉพาะ action ที่ O4 ทำได้ (ว่าง = ไม่ render)
### รายละเอียด (allow-list)
มือถือ: 1 ลูกค้า (ชื่อ + โทร) → 2 AppointmentCard → 3 สรุป (เลขที่/วันที่/ช่องทาง/ป้าย) + รายการ (ชื่อ×จำนวน) + หมายเหตุภายใน → 4 ไทม์ไลน์ที่กรองเงินออก · เดสก์ท็อป ซ้าย 3/4 = 3+4 ขวา 1/4 = 1+2 (`order-first lg:order-none`) · ไม่มี OrderActionBar
- `OrderSummary` (:765-795) `showMoney=false` ตัดราคา/รวม/ยอด/ส่วนลด/VAT/ป้ายชำระ/สลิป/เลขใบเสร็จ
- ไม่ render: CodCard, PaymentReceivedCard, OrderProfitCard, BillingDetails (:801-845, page :631-642), ShippingAddressCard, ShippingCard, ShipmentEvidencePanel (page :544-626)
- CustomerDetails: ตัดลิงก์ `/customers/{profileKey}` (:60-70) · `สั่งกับร้านนี้ N ครั้ง` · `ลูกค้าตั้งแต่…` (:134-144) · คงชื่อ + `tel:` (:164)
- AppointmentCard: ตัด `ขอมัดจำ`, `เลื่อนนัด`/`เลือกเวลาใหม่ให้ลูกค้า` · คง `ให้บริการแล้ว` `ไม่มาตามนัด`
- `getOrderActionSet` คืนว่างสำหรับ NONE · `OrderOverflowMenu` ว่าง = ไม่ render
### คิว
- `AppointmentDayCard.tsx`: ตัดยอด/มัดจำ (:310-329) + aria-label ` ยอด …` ` มัดจำ …` (:281-282) · ทักแชท (:389-397) เมื่อไม่มี H1 · เลื่อนนัด (:404-415) · เมนูกดค้าง (:150-176) เหลือ `ไม่มาตามนัด`
- `AppointmentMonthBoard.tsx` prop `canCreate` (= can(O2s)) ตัดแถบสร้างงาน (:606-627) + `createLabelShort` (:590) + `onCreateForSelected` (:301)
- `queues/page.tsx:78-98` ไม่มีประเภทงาน: ปุ่มตั้งค่า (:90-96) เมื่อ can(Q2) · อื่น ๆ `ยังไม่มีประเภทงาน` + `เจ้าของร้านหรือผู้ดูแลต้องตั้งประเภทงานก่อน ตารางนัดของแต่ละวันถึงจะขึ้นที่นี่`
- ห้าม truncate ชื่อสินค้า · ไม่มีเบอร์ = `ยังไม่มีเบอร์` · ว่าง = `ยังไม่มีงานในช่วงนี้` ไม่มีปุ่มสร้าง

## 5. ฟอร์มเปิดบิล (BILLING)
- BILLING มีเฉพาะร้าน canUseAppointments ⇒ จัดส่ง/DeliveryModeToggle ซ่อนโดยโครงสร้างร้านแล้ว (ไม่เขียนกฎบทบาทซ้ำ) · `ishipCreateMode` ต้อง `'OFF'` · ต้นทุนซ่อน (P1)
- **ใหม่:** แคตตาล็อก/ProductPicker/bestSellers กรองเฉพาะ `type==='SERVICE'` ที่ server (`(fullscreen)/orders/new/page.tsx:124-134` ก่อน `toCatalogProduct`)
- **ใหม่:** `billingOnly = can(O2s) && !can(O2)` ที่ page → `OrderCreateForm` (ค่าตั้งต้น false) → `derivedType = billingOnly ? 'SERVICE' : …เดิม` (:695-710) · พิมพ์รายการเองได้ · server ปฏิเสธ productId ที่ไม่ใช่ SERVICE + type อื่น (403)
- โมดัลแชทไม่ต้องแก้ (บทบาทที่มี H1 มี O2 เสมอ) — เทสยืนยัน
- copy: ProductGrid ว่าง `ยังไม่มีบริการในรายการ` / `พิมพ์ชื่อรายการเองได้ หรือขอให้ผู้ดูแลเพิ่มบริการให้` · server ตีกลับ `บทบาทเปิดบิลสร้างได้เฉพาะบิลบริการ เอารายการที่ไม่ใช่บริการออกแล้วบันทึกอีกครั้ง` · แก้บิลที่ล็อก `บิลนี้รับชำระแล้ว แก้รายการไม่ได้ ขอให้เจ้าของร้าน ผู้ดูแล หรือคนที่มีบทบาทตอบแชทแก้ให้` + เมนูแก้ไขหายจาก `getOrderActionSet`

## 6. ShopQuickLinks
props `roles: ShopRole[]` + `visibleUrls: ReadonlySet<string>` (จาก `flattenSellerMenu(visibleMenu)` ที่กรองบทบาทแล้ว) · `/account` แสดงเสมอ · คง `PAYMENT_LINK_URLS`/`IAP_LINK_URLS`/`lineReports` เดิม
| แถว | url | เจ้าของ | ผู้ดูแล |
|---|---|---|---|
| ข้อมูลส่วนตัว | `/account` | ✓ | ✓ |
| ระดับร้าน | `/verification` (T1) | ✓ | ✓ |
| ตั้งค่าหน้าร้าน | `/public-profile` (T1) | ✓ | ✓ |
| แพ็กเกจของฉัน | `/subscriptions` (T4 + กฎ iOS) | ✓ เจ้าของหลัก | – |
| รายงาน LINE | `/business/line-reports` | ตามเดิม | – |
| การจัดส่ง | `/settings` (S2) | ✓ เฉพาะร้านขายออนไลน์ | ✓ เฉพาะร้านขายออนไลน์ |
| พนักงาน | `/admins` (T2) | ✓ BUSINESS | – |

## Base (HR3)
```
Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx          (NoPermissionCard, orders list)
Base: theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx                                  (bottom nav)
Base: theme/paces/Admin/TS/src/layouts/components/Customizer/index.tsx                       (bottom nav)
Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/page.tsx                      (home)
Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-details/page.tsx    (order detail)
Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/order-add/page.tsx        (billing form)
Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/profile/components/ProfileCard.tsx     (shop quick links)
```

## Browser QA checklist (user)
header back บน `/queues` ของช่าง · การ์ดไม่มีสิทธิ์ในเปลือก `(chat)` มีทางกลับ · FAB ที่ 4 ช่องอยู่ช่องที่ 3 · การ์ดงานวันนี้ 3 ใบที่ 390px · nav 2 ช่อง · DOM แถบล่างของเจ้าของเหมือนเดิม

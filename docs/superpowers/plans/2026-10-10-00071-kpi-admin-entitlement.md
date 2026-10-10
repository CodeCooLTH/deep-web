# KPI 00071 — "ผู้ดูแลเดิมเสียสิทธิ์งาน = 0" · เทียบสิทธิ์ ADMIN (base `c5e96da2`) กับ MANAGER (HEAD)

วันที่ 2026-10-10 · ผู้ตรวจ: audit agent (อ่านอย่างเดียว) · ขอบเขต: ทุกรายการใน `src/lib/route-capabilities.ts` (413 คีย์) + ทุกหน้าใต้ `src/app/(paces)/seller/`

## วิธีตรวจ
1. ทุกไฟล์ `route.ts`/`page.tsx`/`layout.tsx` ใต้ `src/app/api` + `src/app/(paces)/seller` (ยกเว้นคำนำหน้า admin/app/cron/webhooks) อยู่ในทะเบียนครบ — `comm` แล้วไม่มีไฟล์ตกหล่น เมนู sidebar ทุก url อยู่ในทะเบียน (ไม่ตกไปกฎ fail-closed "เจ้าของเท่านั้น" ของ `canSeePage`)
2. MANAGER ที่ HEAD: แถว ADMIN ที่ย้ายข้อมูลแล้วได้ `roles=['MANAGER']` (`prisma/migrations/20261010120000_shop_member_roles/migration.sql` บรรทัด UPDATE) → `rolesFromMembership` (`shop-permissions.ts:103`) = `['MANAGER']` · ทุกจุดที่อ่านสมาชิก select `roles` ด้วย (`shop-context.ts:109`, `shop-capability.ts:103,135`, `chat-scope.ts:244`, `shop-owner.ts:29`) จึงไม่มีทางที่ MANAGER ได้ชุดว่างโดยบังเอิญ
3. MANAGER ถือทุก capability ยกเว้น `P3 F1 F2 F3 T2 T3 T4` (`shop-permissions.ts` TABLE) ⇒ รายการในทะเบียนที่ cap มี M = MANAGER ผ่าน ไม่ว่า base เป็นอย่างไร (คงเดิมหรือได้เพิ่ม) · รายการที่ต้องเทียบ base ทีละตัวคือ 38 คีย์ที่ cap ∈ {P3,F1,F2,F3,T2,T3,T4} + คลาส SELF/MEMBER ที่ไฟล์เปลี่ยน + ด่านภายในหน้า/service ที่ใช้ `can(...)`/`isShopOwnerRole`/`moneyLevel`
4. ด่าน base: `canAccessShop` (`c5e96da2:src/lib/shop-context.ts:25`) และ `requireActiveShop` (`:135`) = สมาชิกทุก role ผ่าน (ADMIN ได้) · ด่านเจ้าของที่ base มีจริง (ไล่ด้วย `git grep` รูปแบบ `role !== 'OWNER'`/`shop.userId !== userId`/`ownerOnly`/`staffCanViewFinance`) อยู่ในตารางด้านล่างครบทุกจุด

## ตาราง

| สิทธิ์/route | ADMIN ที่ base (หลักฐาน file:line) | MANAGER ที่ HEAD (cap) | ผล |
|---|---|---|---|
| แชททั้งหมด: `(chat)/**` หน้า + `api/chat/**` + `api/files` + `api/uploads/{ticket,commit}` + `api/channels/facebook/stickers` | ได้ — membership `shop-context.ts:25` (`assertParticipant` ใช้ `canAccessShop` ตามแผน P3 F-1) | H1/H2 (`route-capabilities.ts:66-69,212-257`) | คงเดิม |
| เครื่องมือแชทเสริม: quick-messages/tags/groups/preferences/library/giphy/thread-control/auto-reply รายห้อง/follow-ups + หน้า `/follow-ups` | ได้ — membership | X2 [O,M,C] (`:92`, `:228-266`) | คงเดิม |
| H3 ตั้งค่าบอท/ตอบอัตโนมัติ/AI/คอมเมนต์/ice breakers/rich menu/เชื่อม-ตัดช่องทาง (`api/channels/**`, `api/shops/auto-reply/**`, `api/shops/comment-reply/**`, `api/shops/ai-settings`, หน้า `/settings/{ai,auto-reply,chatbot,channels,comment-reply}` + ice-breakers/rich-menu) | ได้ — membership | H3 [O,M] | คงเดิม |
| H3/X3 สร้างออเดอร์อัตโนมัติ `api/seller/auto-order/**` + หน้า `/settings/auto-reply/order-agent` · retry/discard `orders/[token]/auto-order/*` | ได้ — membership (`requireAutoOrderShop`) | X3 [O,M] (`:356-363`) · O2 | คงเดิม |
| ออเดอร์/นัดหมาย O1–O7, D1 (`api/orders/**` ฝั่งร้าน, `/orders`, `/orders/new`, `/orders/[token]/{edit,receipt}`, `/bookings/**`, `api/shops/current/bookings/**`, appointments) | ได้ — membership | O1/O2/O2s/O3/O4/O5/O6/O7/D1 ทุกตัวมี M · housekeeping `['Q1','O4']` (`:434`) มีทั้งคู่ | คงเดิม |
| จัดส่ง iShip S1 (`api/seller/iship/**` ยกเว้นตั้งค่า, ship/handover/shipment-evidence) | ได้ — membership | S1 [O,M,C] | คงเดิม |
| ตั้งค่า/เชื่อม iShip S2 (`iship/settings` PUT, `connection/verify`, `connection` POST/DELETE) | settings PUT/verify ได้ (ปลด ownerOnly 2026-07-29 · แผน P3 F-3) · `connection` POST/DELETE **ไม่ได้** `c5e96da2:src/app/api/seller/iship/connection/route.ts:29,51` (`ownerOnly: true`) | S2 [O,M] (`:371,380`) | คงเดิม (connection = ได้เพิ่ม · มติ C-2) |
| หน้า `/settings` (การจัดส่ง) | ได้ — ไม่มีด่านบทบาท (`c5e96da2:.../settings/page.tsx:65` แค่ส่ง `isOwner` ให้แถวจัดส่ง) | **S2** (`:129`) — ไม่ใช่ T3 ตามข้อความ C-4 · `isOwner` ยังส่งเหมือน base | คงเดิม (หมายเหตุ: โค้ดไม่ตรงข้อความ C-4 แต่เอื้อ KPI) |
| สินค้า P1/P2 (`/products/**`, `/categories`, `/inventory/**`, `api/products/**`, `api/inventory/{csv,movements,stock}`) | ได้ — membership | P1/P2 [O,M,…] | คงเดิม |
| ส่งออก/นำเข้า CSV สต็อก `api/inventory/csv/{export,import}` | ได้ — `c5e96da2:src/app/api/inventory/csv/export/route.ts:32` (ด่าน vertical เท่านั้น) | P2 (`:281`) · คอลัมน์ต้นทุนตัดด้วย `can(gate.roles,'P3')` (`export/route.ts:42`) | คงเดิม (ต้นทุน = เสีย-การเงิน P1) |
| ปักหมุดสินค้า `api/seller/products/[id]/{pin,unpin}` | ได้ — membership | P2 (`:393`) | คงเดิม |
| ซื้อสล็อตปักหมุด `pin-slots/buy` · สมัคร/อัปเกรด/ต่ออายุคลังสินค้า `inventory/{subscribe,upgrade,reactivate}` | ได้ — membership ล้วน (แผน P3 F-4) | F4 [O,M] (`:284-287,391`) | คงเดิม (มติ C-5) |
| ต้นทุนสินค้า P3 (ดู/แก้ cost ในหน้าสินค้า/ออเดอร์/แชท, `product.cost`/`orderItem.cost` omit) | ได้ (scope baseline บรรทัด 74 "ผลข้างเคียงที่ตั้งใจของ P1: … ต้นทุนสินค้า") | ไม่มี P3 (`products/page.tsx:83`, `orders/new/page.tsx:134`, `(chat)/layout.tsx:164`) | เสีย-การเงิน(ตั้งใจ P1) |
| คิว/ห้อง/ปฏิทิน/แม่บ้าน Q1/Q2 (`/queues/**`, `/rooms/**`, `/calendar`, `/housekeepers`, `/settings/job-types/**`, `api/shops/current/{rooms,service-resources,housekeepers,appointment-settings,appointments}`) | ได้ — membership | Q1/Q2 มี M | คงเดิม |
| ลูกค้า C1 (`/customers`, `/customers/[id]`, `api/orders/customers`, `api/shops/current/customers/lookup`, `api/seller/customers/[key]/contact`) | ได้ — membership | C1 (`:89`) | คงเดิม |
| ยอดสะสมลูกค้าในหน้าลูกค้า/แผงแชท | ได้ (scope baseline บรรทัด 74) | `can(...,'F1')` (`customers/page.tsx:102`, `customers/[id]/page.tsx:68`, `inbox/[conversationId]/page.tsx:650`) | เสีย-การเงิน(ตั้งใจ P1) |
| โปรไฟล์ร้าน/หน้าร้าน/page builder/วิดีโอ/รีวิว/ยืนยันตัวตน/slug T1 (`/public-profile/**`, `/reviews`, `/verification`, `api/shops/[id]`, `api/shops/slug`, `api/shops/current/{page-builder/**,videos}`, `api/verification`, `orders/[token]/review/reply`) | ได้ — membership | T1 [O,M] | คงเดิม |
| โปรไฟล์ใบเสร็จ `api/shops/receipt-profile` | ได้ — membership | X5 [O,M] (`:462`) | คงเดิม (มติ C-1) |
| ประมูลผู้ขาย `/auctions/**`, `api/seller/auctions/**` | ได้ — membership | X1 [O,M] (`:355`) | คงเดิม (มติ C-1) |
| รายงานแอดมิน โหมด SELF `/reports/agents/**`, `api/seller/reports/agents/**` | ได้โหมด SELF — `c5e96da2:src/services/agent-report-access.service.ts:50-75` | X4 (`:108`) โหมด SELF | คงเดิม |
| รายงานแอดมินโหมดเต็ม (ทุกคน + ยอดขาย) | ได้เฉพาะร้านที่เปิด `staffCanViewFinance` — `agent-report-access.service.ts:60` | `can(...,'F1')` (`agent-report-access.service.ts:48`) | เสีย-การเงิน(ตั้งใจ P1) |
| `/sales`, `/reports/products`, `/expenses`, `api/expenses/**`, `api/finance/receivables` | ได้เมื่อ `staffCanViewFinance` — `c5e96da2:src/services/expense-access.service.ts:34`, `product-report-access.service.ts:61` | F1/F2 | เสีย-การเงิน(ตั้งใจ P1) |
| กราฟยอดขาย `api/seller/sales-series` (หน้าแรก) | ได้ — `c5e96da2:src/app/api/seller/sales-series/route.ts:25` (`requireActiveShop`) | F1 (`:399`) | เสีย-การเงิน(ตั้งใจ P1) |
| `api/seller/portfolio-series` | ไม่ได้ในร้านธุรกิจ — `c5e96da2:.../portfolio-series/route.ts:33` ("ใช้ได้เฉพาะบัญชีส่วนตัว") | F1 | คงเดิม |
| กระเป๋า `/wallet`, `api/wallet{,/events,/topup}` · ยอดกระเป๋าในหน้าคลังสินค้า/chatbot/ai-quota · ปุ่มเติมเงิน (`CanTopUpProvider`) | ได้ — `c5e96da2:src/app/api/wallet/route.ts:30`, `topup/route.ts:46` (`requireActiveShop`) | F3 · `isShopOwnerRole` (`shop-owner.ts:7`) | เสีย-การเงิน(ตั้งใจ P1) |
| ใช้เครดิตกระเป๋าขอ AI เพิ่ม (`ai-suggest` credit path) / ส่ง SMS (O7) | ได้ | H2 / O7 — หักเครดิตได้ ตัดแค่คีย์ `balance` (`ai-suggest/route.ts:255`) | คงเดิม |
| หน้าแรก/การแจ้งเตือน/ความสำเร็จ/หน้า "ร้าน"/ทางลัด (`/dashboard`, `/notifications`, `/badges`, `/shop`, `api/shops/current/shortcuts/**`, badges) | ได้ — membership | MEMBER · ตัวเลขเงินรวมตัดตามระดับเงิน (`notifications/page.tsx:51`) | คงเดิม (ตัวเลขเงิน = เสีย-การเงิน P1 / มติ C-8) |
| `/subscriptions` (ในบริบทร้านธุรกิจเห็นการ์ด Stock Pro ของร้านและจัดการได้) | ได้ — `c5e96da2:.../subscriptions/page.tsx:194-213` (ไม่มีด่านบทบาท) | T4 (`:131`) · จัดการ Stock Pro ยังทำได้ที่ `/inventory` (F4) | เสีย-มติ C-4 |
| รายการคำเชิญ `GET api/business/shops/[shopId]/invites` | ได้ — `c5e96da2:src/app/api/business/shops/[shopId]/invites/route.ts:71,84` (`isShopMember` "Owner/Admin เข้าถึงเท่ากัน") | T2 (`:192`) | เสีย-มติ C-3 |
| **หน้า `/business/[shopId]/invites` — ดูรายชื่อสมาชิก (อ่านอย่างเดียว)** | **ได้** — `c5e96da2:.../business/[shopId]/invites/page.tsx:57` (`isShopMember`) + `:140` (`canManage` false สำหรับ ADMIN แต่ตารางสมาชิกแสดง) · ไม่มีลิงก์ในแอปชี้มาหน้านี้ (เข้าด้วย URL เท่านั้น) | T2 (`:78`, page `:59` อ้าง "มติ C-3" ในคอมเมนต์) | **เสีย-ไม่มีมติ ⚠** |
| สร้าง/ยกเลิกคำเชิญ, ลิงก์เชิญ, เปลี่ยนบทบาท/ลบสมาชิก (`invites` POST/DELETE, `shops/current/invite-links/**`, `members/[memberId]` PATCH/DELETE), หน้า `/admins` | ไม่ได้ — `c5e96da2:src/services/shop-member.service.ts:88` (`requireOwnerMember`), `src/lib/shop-member-rules.ts:22`, `invite-links/route.ts:29,67`, `[slug]/route.ts:21`, `admins/page.tsx:43` | T2 | คงเดิม |
| บัญชีรับเงิน `api/shops/payout` | ไม่ได้ — OWNER-only ใน `updateShopPayout` (`c5e96da2:src/app/api/shops/payout/route.ts:17`, `shop.service.ts:531-537`) | T3 (`:461`) | คงเดิม |
| โอนเจ้าของหลัก / ลบร้าน / onboarding ร้านธุรกิจ (`transfer`, `shops/[shopId]` DELETE, `onboarding`) · กู้คืนร้าน | ไม่ได้ — `c5e96da2:src/services/business-shop.service.ts:58,69`, `onboarding/route.ts:66`, `shop-member.service.ts` `checkTransfer` (เจ้าของหลัก) | T4 / SELF (restore ตรวจเจ้าของใน service) | คงเดิม |
| รายงานกลุ่ม LINE (`api/line-report/**`, `/business/line-reports/**`) | ระดับบัญชี: ได้เฉพาะผู้ที่เป็นเจ้าของหลักของร้านใดร้านหนึ่ง (`c5e96da2:src/lib/seller-menu.ts:330-345`) | SELF + `resolveReportAccess`/`ownsAnyShop` — เกณฑ์เดิม | คงเดิม |
| **แผนการตรวจสอบร้าน — ดูหน้า `/inspection` + `GET api/seller/inspection` (อ่านอย่างเดียว ปุ่ม disabled)** | **ได้** — `c5e96da2:src/app/api/seller/inspection/route.ts:9` ("เปิดให้ทั้ง OWNER และ ShopMember(role='ADMIN') — ADMIN ดูได้ กดไม่ได้"), `_shared.ts:22-35` (`requireActiveShop` เท่านั้น), `src/services/inspection-owner.service.ts:111,185` (`canManage: isOwner`), เมนูแสดงให้ ADMIN (`seller-menu.ts:128`, กรองแค่ vertical) | T4 (`:94`, `:367`) | **เสีย-ไม่มีมติ ⚠** |
| **แผนการตรวจสอบร้าน — แนบเอกสาร `POST api/seller/inspection/documents`** | **ได้** — `c5e96da2:src/app/api/seller/inspection/documents/route.ts:18` (`requireInspectionShop` = สมาชิก) + `src/services/inspection-result.service.ts:295` `attachSellerDocument` ไม่มีด่านเจ้าของ (base ไม่มี UI เรียก — API เท่านั้น) | T4 (`:366`) | **เสีย-ไม่มีมติ ⚠** |
| แผนการตรวจสอบ — สมัคร/อัปเกรด/ยกเลิก | ไม่ได้ — `c5e96da2:src/services/inspection-plan.service.ts:77,203,310,380` (`assertOwnerOfLodgingShop`) | T4 | คงเดิม |
| **แพ็กเกจธุรกิจ "ของตัวเอง" — `api/business/{subscribe,upgrade,downgrade,cancel,reactivate}` (ปุ่มในหน้า `/business` ซึ่งเป็น SELF ไม่ผูกบริบท)** | **ได้ทุกบริบท** — ownerId จาก session ไม่ดูร้าน active (`c5e96da2:src/app/api/business/subscribe/route.ts:27-39`, `cancel/route.ts:20-24`, `upgrade:24-34`, `downgrade:20-30`, `reactivate:22-26`) | T4 ของ**ร้าน active** (`subscribe/route.ts:26` ฯลฯ) → ขณะ active อยู่ร้านที่ตนเป็น MANAGER ได้ 403 ต้องสลับไปร้านส่วนตัวก่อน (PERSONAL = OWNER ผ่าน) | **เสีย-ไม่มีมติ ⚠** (ระดับบัญชี ไม่ใช่งานร้าน) |
| สวิตช์ `staffCanViewFinance` (`finance-visibility` ถูกลบ) | ไม่ได้ — `c5e96da2:.../finance-visibility/route.ts:40` | ไม่มี route | คงเดิม |
| `api/upload` (ปิด 410) | ได้ — แต่ไม่มีผู้เรียกที่ base (`git grep "'/api/upload'"` เจอแค่คอมเมนต์) | MEMBER 410 | คงเดิม (ไม่มีงานจริงหาย) |
| SELF/PUBLIC/BUYER อื่น (`api/account/**`, `api/business/{context,switch-context,shops}`, `/business`, `/business/create`, `/choose-shop`, `/i/[slug]`, `api/notifications/**` ฯลฯ) | ข้อมูลของผู้ใช้เอง ไม่ผูกบทบาท | คลาสเดิม · ไฟล์ที่เปลี่ยนแค่เพิ่ม `roles` ใน payload | คงเดิม |

## สรุป KPI

**แถว `เสีย-ไม่มีมติ ⚠` = 4** (เป้า 0) — ยังไม่ผ่าน

แยกน้ำหนัก:
- งานร้านจริง 2 แถว (แผนการตรวจสอบ: ดู + แนบเอกสาร) — ตาราง BRD §8.3 แถว T4 เขียน "แผนตรวจสอบร้าน = เจ้าของหลัก" ไว้ แต่ BRD เองบอกว่าแถวอื่นต้องเท่า ADMIN วันนี้ และ scope baseline OOS-12 = "เปลี่ยนสิทธิ์ T4" อยู่นอกขอบเขต ⇒ ต้องมีมติหรือแยก cap อ่าน/แนบเอกสาร (เช่น ให้ GET + documents เป็น cap ที่มี M) 
- หน้ารายชื่อสมาชิก 1 แถว — ไม่มีลิงก์ในแอปตั้งแต่ base (เข้าด้วย URL) เหตุผลเดียวกับ C-3 ("ไม่มี UI ผู้ดูแลใช้") ใช้ได้ แต่ข้อความ C-3 ครอบแค่ "GET รายการคำเชิญ" ⇒ ขยายถ้อยคำ C-3 ให้ครอบหน้านี้ก็ปิดได้
- แพ็กเกจธุรกิจของตัวเอง 1 แถว — ไม่ใช่สิทธิ์ในร้านของคนอื่น แต่เป็นผลข้างเคียงของการผูก T4 กับร้าน active (เจ้าของร่วมโดนเหมือนกัน) ⇒ ทางแก้คือมติยอมรับ (สลับไปร้านส่วนตัวก่อน) หรือให้ 5 route นี้ resolve ร้านส่วนตัวของผู้ใช้แทนร้าน active

## ข้อสังเกตนอก KPI
- C-4 เขียนว่า `/settings` (การจัดส่ง) = T3 แต่ทะเบียนใช้ S2 (`route-capabilities.ts:129`, หน้า `settings/page.tsx` การ์ด `NoPermissionCard capability="S2"`) — ผลต่อ KPI เป็นบวก แต่เอกสาร C-4 กับโค้ดไม่ตรงกัน ต้องแก้ข้างใดข้างหนึ่ง
- C-1 เขียน "ประมูลผู้ขาย→P2" · "`shops/receipt-profile`→T1" · "`seller/auto-order/**`→H3" แต่โค้ดใช้ X1/X5/X3 — ชุดบทบาทเท่ากันจึงไม่กระทบ KPI


## ผลหลังแก้ (Controller 2026-10-10)
- แถว 1 → C-13 (X6 ดูอย่างเดียว) แก้ในโค้ด · แถว 2 → C-14 คง T4 (ด่านหายใน base ไม่ใช่สิทธิ์) · แถว 3 → C-3 ขยาย · แถว 4 → C-15 คืนเป็น SELF แก้ในโค้ด
- **KPI เสีย-ไม่มีมติ = 0** · C-4 ข้อความแก้ใน BRD T3 แล้ว (หน้า /settings = S2 ตาม C-2)

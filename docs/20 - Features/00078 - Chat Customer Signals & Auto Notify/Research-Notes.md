# 00078 — บันทึกค้นคว้าก่อนเขียน PRD/BRD (2026-10-17)

แหล่งข้อมูล: (1) คำขอจากทีมร้านค้า (2) session `support-deep` (โปรเจกต์ gochat-v3 — อ่านจากโค้ดเขา ไม่ได้ยิง API จริง) (3) สำรวจโค้ด SafePay บน main `fc4efb21e`

## คำขอดิบ

> 1. อยากให้เพิ่มไอคอนว่า ai handle อยู่ → **user ชี้แจง: ต้องเป็น "Meta AI กำลังควบคุมห้อง" ไม่ใช่บอทของเรา · รอบนี้แสดงสถานะอย่างเดียว ไม่มีปุ่มแย่งห้อง**
> 2. ขอบ Profile ม่วง = เป็นลูกค้าแล้ว คือมีคำสั่งซื้อที่สำเร็จ
> 3. แท็กลูกค้าใหม่ ลูกค้าซื้อซ้ำ ปรับปรุง
> 4. สรุปคำสั่งซื้อ/จอง อัตโนมัติ

## มติ user (2026-10-17)

| ข้อ | มติ |
|---|---|
| ป้ายลูกค้า | มีแค่ 2 ป้าย: **ลูกค้าใหม่ = นับได้ ≥ 1 ใบ** · **ลูกค้าซื้อซ้ำ = ≥ 2 ใบ** (แทนป้าย "ลูกค้าเก่า N" และ "ลูกค้าใหม่" เดิม) |
| ใบที่นับ | ทุกใบที่ **ไม่ใช่** ยกเลิก · ตีกลับ · ร่าง (DRAFTED) |
| ขอบรูป | ขึ้นเมื่อนับได้ ≥ 1 ใบ · สีม่วงจาก **โทเคน Paces ที่มีอยู่แล้ว** (ไม่ใช่ #7367F0 ซึ่งเป็นสี buyer ตาม HR7) · ไม่ใช้สีอย่างเดียว |
| Meta AI | แสดงสถานะอย่างเดียว |
| สรุปอัตโนมัติ | ตั้งค่าร้าน 2 สวิตช์แยกกัน: (ก) สร้างคำสั่งซื้อเสร็จ → ส่งสรุปเข้าแชทลูกค้าทันที (ข) ใส่เลข tracking → ส่งอัปเดตเลขพัสดุทันที — "user ไม่ต้องกดส่งเอง กันลืม" |

## ของที่ SafePay มีอยู่แล้ว (main)

- ป้ายลูกค้า: `src/lib/customer-behavior.ts:193-280` `customerBadges()` — NEW = orders ≤ 1 · REGULAR "ลูกค้าเก่า N" = completed ≥ 3 · RETURNED · CANCELLED_BY_BUYER · แสดงที่ `inbox/components/InboxRow.tsx:100-106, 366-380` และ `CustomerPanel.tsx ~917` · ฟอร์มออเดอร์มีชุดแยกฝั่ง client `orders/new/components/CustomerQuickBlock.tsx:272-278`
- ตัวนับ: `enrichWithCustomerBehavior` (`src/services/customer-behavior.service.ts:22`) ให้ `customerBehavior {orders, completed, cancelled, returnedParcels}` บนทุกแถวห้อง (null = ห้องไม่ผูกลูกค้า) · กรอง `(shopId, customerId)` เพราะ `Customer` เป็น global
- สถานะออเดอร์ = String: DRAFTED, PENDING, SHIPPED, CONFIRMED, CANCELLED, RETURNED (`src/lib/order-display.ts:291`) · DRAFTED ถูกตัดด้วย `excludeDraftedWhere` (`src/lib/order-visibility.ts:12`) · NO_SHOW (บริการ)
- รูป: `BuyerAvatar` (`InboxList.tsx:275`) ใช้ที่ `InboxRow.tsx:223` — ยังไม่มีขอบ
- Meta AI: ดู memory `project_meta_ai_thread_standby` + `docs/20 - Features/00018 …/EXTENSIONS-2026-08-16-meta-ai-takeover.md` และ `EXTENSIONS-2026-08-26-thread-control-api.md` — `readMetaAiControlMarker()` (`src/lib/meta-system-notice.ts:212`) เชื่อไม่ได้ (73% ของการส่งที่โดน #10 ไม่มี marker) · `ChatMessage.viaStandby` ห้ามใช้ตัดสิน UI · `ChatHandoverEvent` · `describeThreadControlOutcome()` (`src/lib/thread-control-ui.ts`) · `classifyThreadControlError` (`src/lib/facebook/graph.ts`)
- 00061 สร้างออเดอร์ร่างจากคีย์เวิร์ด "สรุปคำสั่งซื้อ" (ไม่ใช่ AI) อยู่บน main แล้ว — **ไม่ใช่สิ่งที่ user ขอในข้อ 4**

## จาก support-deep — ป้ายลูกค้า

- นิยามเขา: ใหม่ = 1 ใบพอดี · ซ้ำ ≥ 2 · นับทุกใบยกเว้น canceled/returned
- **null ≠ 0** — ยังไม่รู้จำนวน = ไม่ติดป้าย
- นับจากประวัติเต็มทุกครั้ง ไม่ +1 จาก event (event ซ้ำ/หลุดไม่ทำตัวเลขเพี้ยน) — SafePay นับสดจาก Order อยู่แล้ว ได้คุณสมบัตินี้ฟรี
- ร้านแก้สถานะตีกลับ → ป้ายต้องลดตาม
- ขอบรูปใช้ `outline 2px + outline-offset 2px` ไม่ใช่ border → ไม่ดันขนาดรูป · คู่กับไอคอน + `aria-label` "เป็นลูกค้าของร้านแล้ว" · วัด non-text contrast ≥ 3:1 ทั้งสว่าง/มืด
- ผูกกับตัวคน (contact) ไม่ใช่ห้อง ⇒ ทุกห้องของคนเดียวกันติดตาม

## จาก support-deep — Meta AI ควบคุมห้อง

**ใครถือ** (3 แหล่ง): webhook `messaging_handovers` (pass/take — ใช้ `new_owner_app_id` ห้ามตกไปใช้ `previous_owner_app_id`) · webhook `standby` (มาทาง standby = เราไม่ถือ) · ถามสด `GET /me/thread_owner?recipient={PSID}` (`data: []` = ว่าง · app_id = เรา → ours · app_id อื่น **หรือมีแต่ expiration ไม่มี app_id** → other)

**เป็น Meta AI ไหม — app id ไม่พอ:** Page Inbox `263902037430900` / IG Inbox `1217981644879628` ใช้ร่วมกันระหว่าง "Meta AI ตอบ" กับ "คนพิมพ์ใน Business Suite" → แยกด้วย `message.ai_generated: true` บน echo (ไม่มีในเอกสาร Meta แต่มีจริง) · `message.admin_text` หลังคำตอบ AI = AI ปล่อยห้องแล้ว · prod เขา 7 ต.ค.: 67 ห้องที่ Page Inbox ถือ เป็น AI จริง 12 ห้อง · จัดประเภท `ai | inbox (คนใน BS) | named (Pancake/Botcake…) | unknown` · ชื่อแอปอื่น `GET /{app-id}?fields=name`

**หมดอายุ:** Meta ไม่ส่ง webhook ตอนหมดอายุ (เงียบ 24 ชม.) และตอน release ⇒ `aiHoldsThread = thread_control='other' AND now - max(thread_control_at, last_inbound_at, last_foreign_reply_at) < 24 ชม.` (ตรรกะล้วนไฟล์เดียว ใช้ทั้ง UI และ server)

**บนจอ:** เขาแสดงเฉพาะห้องที่เปิด (แถบแทนกล่องพิมพ์) ไม่มีบนรายการห้อง · ถ้าจะทำบนรายการ: อ่านคอลัมน์ในฐาน (ผล webhook) + กฎ 24 ชม. ฝั่ง SQL **ห้ามเรียก /thread_owner ทีละแถว** · ยอมรับว่าแถวคลาดได้จนเปิดห้อง · ตอนเปิดห้องถาม /thread_owner **เฉพาะห้องที่ฐานจำว่ามีคนถือ** แล้วแก้ฐาน · คนใน Business Suite ถือ = ไม่แสดงแถบ ไม่ล็อก

**กับดัก:** ไม่นับ 24 ชม. = ล็อกถาวร · ฐานจำ ours ค้างทั้งที่ Meta ว่าง · `/thread_owner` ว่างแต่ส่งได้ #10 "another app controls this thread" → ฐานได้ other จาก #10 ไม่ถึง 10 นาที อย่าเชื่อ /thread_owner ว่าง (ต้อง code 10 + ข้อความ "another app" — นอกหน้าต่าง 24 ชม. ก็ code 10 แต่คนละเรื่อง) · META_APP_ID ไม่ได้ตั้ง → อย่าเดา คืน null · handover มาก่อนห้องถูกสร้าง → log ข้าม · echo ไม่มี app_id = ของเรา · ข้อความ error ของ Meta แปลตาม locale (regex อังกฤษพลาด) · subscribe `messaging_handovers` + `standby` คู่กันเสมอ · IG ยังไม่มีเคสยืนยัน

## จาก support-deep — สรุปออเดอร์

- เขาไม่มีแบบอัตโนมัติ มีแค่ `orderSummaryText()` ใส่ลงช่องพิมพ์ให้แอดมินกดส่งเอง
- หลักที่ยก: **ตัวเลขทุกตัวมาจากค่าที่ server คำนวณ ไม่คำนวณบนจอ** · ข้อมูลไม่ครบ = ข้อความสั้นลง **ไม่แต่งบรรทัดที่ไม่มีข้อมูล**
- เหตุการณ์พัสดุ 1 ชิ้นมี 5–15 event — ถ้าผูกการส่งกับ event ต้องกันส่งซ้ำ

## สำรวจ SafePay — ส่งสรุปออเดอร์ / เลขพัสดุ (ข้อ 4)

**ตอนนี้ไม่มีอะไรส่งอัตโนมัติ ส่งได้เฉพาะตอนผู้ขายกดปุ่ม**
- สรุปออเดอร์: `sendOrderToChat()` (`src/app/(paces)/seller/(chat)/_components/sendOrderToChat.ts:17`) → POST `{type:'ORDER', orderRefToken}` ไป `/api/chat/conversations/{id}/messages` · ปุ่มอยู่ที่ `CustomerPanel.tsx:482` และ `AutoOrderResultCard.tsx:133` · รูปแบบที่ส่งแยกตามช่องทาง (`messages/route.ts:824-874`): LINE = Flex card (`buildLineFlexOrderCard`, ต้องเป็น https) · Messenger/IG = ข้อความลิงก์ · DEEP = การ์ด ORDER native · ส่งผ่าน `enqueueOutbound` → `deliverRoom` · การ์ดนัดหมายแบบเดียวกันที่ `route.ts:787-820`
- เลขพัสดุ: `ShipmentDraftPanel.tsx` `trackingMessage():55` (ขนส่ง + เลข + ลิงก์ iShip `trackingUrl:44`) · `sendTracking():116` ส่ง TEXT · 🛑 ช่องติ๊ก "แจ้งลูกค้า" **ปิดเป็นค่าตั้งต้น** (`:72`) เพราะเคยเปิดเป็นค่าตั้งต้นแล้ว **user บ่นว่าส่งเองทุกครั้ง 2026-07-29** (`:66-71`) · modal หน้ารายละเอียดออเดอร์ (`ShipmentEntryModal.tsx`) ส่งเลขพัสดุไม่ได้เลย
- 🛑 00061 PRD **BR-ACO-27** (`docs/20 - Features/00061 …/PRD.md:248`): v1 ไม่ส่งอะไรถึงลูกค้าอัตโนมัติ — 00078 ต้องระบุว่าทับกฎนี้ในขอบเขตไหน
- ⇒ มติ 2026-07-29 คือ "ไม่ให้ส่งเองโดยไม่ได้เลือก" · คำขอใหม่ = สวิตช์ระดับร้านที่ร้านเลือกเปิดเอง (ปิดเป็นค่าตั้งต้น) ไม่ขัดกัน

**ที่ที่เลขพัสดุถูกเขียน (ต้องครอบทุกจุด):** (a) แจ้งเลขเอง `api/orders/[token]/ship` → `shipOrder()` `order.service.ts:1533` → `ShipmentTracking` + SHIPPED · (b) แก้เลข `updateShipmentTracking()` `:1589` · (c) iShip สร้างพัสดุ `createShipment()` `iship.service.ts:1292` → `OrderShipment.trackingNo` · (d) iShip ผูกพัสดุที่มีอยู่ `linkShipment()` `~2930, 3081/3085` · (e) iShip นำเข้าพัสดุเป็นออเดอร์ใหม่ `importParcelAsOrder()` `:3158` (ไม่มีห้องแชท) · (f) พัสดุขากลับ — นอกขอบเขต · webhook iShip **ไม่เขียน**เลข (แค่จับคู่อัปเดตสถานะ) · ไม่มี bulk import · **2 ตาราง:** `ShipmentTracking` (`schema.prisma:1185`) กับ `OrderShipment` (`~2641`)

**ที่ที่ออเดอร์ถูกสร้าง:** ฟอร์มผู้ขาย + ฟอร์มในแชท → `createOrder()` `order.service.ts:309` (มี `conversationId`, ตัดทิ้งถ้าไม่มีสิทธิ์ H1) · 00061 ครบ → `createOrder` (`createdVia='CHAT_AUTO_ORDER'`) · 00061 ร่าง → DRAFTED → `promoteAutoOrderDraft` (`:1028`) / `promoteDraftCore` (`:838`) · จอง `booking.service.ts:196` / ประมูล / iShip import — ไม่มีห้องแชท · **DRAFTED ไม่นับว่า "สร้างแล้ว"** (ยอด 0, ไม่มีเลข, ไม่มีรายการ) ⇒ "สร้างเสร็จ" = ถึง PENDING ครั้งแรก (`createOrder` หรือ `promoteDraftCore`) · ข้ามออเดอร์ห้องทดสอบ `isDryRun`

**ข้อจำกัดการส่ง:**
- Meta (`transmitMetaMessage` `channel-chat.service.ts:3936-3972`): ระบบส่งเอง (`actorUserId=null`) **นอกหน้าต่าง 24 ชม. โยน `WINDOW_CLOSED`** (โค้ดระบุว่าห้ามผ่อนกฎนี้) · ใช้ tag `HUMAN_AGENT` เฉพาะคนส่ง · ไม่เคยใช้ `POST_PURCHASE_UPDATE`/`ACCOUNT_UPDATE` (Meta เลิกใช้แท็กกลุ่มนี้แล้วตั้งแต่ 2024 — ต้องยืนยันก่อนเสนอ)
- LINE (`:3760-3790`): REPLY ฟรีต้องมี reply token · PUSH กินโควตารายเดือน · บล็อกเมื่อ `shouldBlockLinePush` → `QUOTA_EXCEEDED` · ข้อความจากเหตุการณ์ออเดอร์/พัสดุแทบไม่มี reply token ⇒ ต้อง PUSH = **กินโควตาร้าน**
- ส่งโดยไม่มี `autoReplyKind` = หยุดบอทตอบอัตโนมัติ + นับเวลาตอบของแอดมิน (`:4330-4333`) ⇒ ข้อความอัตโนมัติต้องติด `autoReplyKind`
- ทางส่ง: `enqueueOutbound()` (`chat-outbox.service.ts:197`, ล้ม → `deliveryStatus='FAILED'` + `failureReason` + `pushChatSendFailed`) · `sendOutboundMessage()` (`channel-chat.service.ts:2893`, ระบบส่ง `actorUserId:null, systemShopId, autoReplyKind:'AUTO'`)

**ที่วางสวิตช์ได้:** `AutoReplyConfig` (`schema.prisma:3090`, 1 แถว/ร้าน) · `AutoOrderAgentConfig` (`:4760`) · `Shop` (`staffCanViewFinance`, `reportSettings Json?`) · `ShopAiSetting` (`:2406`) · หน้าตั้งค่า `seller/(dashboard)/settings/` (`ShippingSettingsRow.tsx` เหมาะกับสวิตช์เลขพัสดุ) · ยังไม่มีสวิตช์ "ส่งเองถึงลูกค้า" ใด ๆ

## จาก gochat-v3 (เดิมชื่อ support-deep) — เทมเพลตข้อความ + ส่งอัตโนมัติ (2026-10-17 บ่าย, อ่านจากโค้ดเขา origin/main 353a238c2)

**หน้าจอ:** Settings → "สรุปคำสั่งซื้อ และเลขพัสดุ" (`/settings/orders`) = "ชุดแจ้งลูกค้าเรื่องออเดอร์" + คลังเทมเพลตแยก `/message-templates`

**เทมเพลต**
- เก็บ: ข้อความพิมพ์ตรงในชุด (jsonb config `{summaryWhen, shipWhen, texts:{transfer,cod}, shipText}`) + คลังเทมเพลต `message_templates` (kind order_summary|shipping, body, channel_scope) + ผูกช่อง→เทมเพลต (`message_template_uses`) + ประวัติแก้ before/after
- **อ้างอิง ไม่คัดลอก** — ส่งทีไรอ่าน body ล่าสุด · ลบเทมเพลตที่ใช้อยู่ไม่ได้ (FK RESTRICT)
- ไวยากรณ์ `{ชื่อไทย}` ชั้นเดียว · ตัวแปร 10 ตัว: ชื่อร้าน · ชื่อลูกค้า · เลขออเดอร์ · วันที่สั่งซื้อ · รายการสินค้า · ยอดที่ชำระแล้ว · ยอดค้างชำระ · สถานะจัดส่ง · เลขพัสดุ · ลิงก์ออเดอร์
- ตัวแก้ไข: contenteditable แสดงตัวแปรเป็นชิป · ปุ่ม "+ ตัวแปร" · พิมพ์ `{` เมนูเด้งพร้อมค่าตัวอย่าง · Backspace ลบทั้งชิป · ตัวนับ max 500 · พรีวิวสดด้วยค่าตัวอย่าง (ม็อกโทรศัพท์: เหตุการณ์ → ฟองสรุป → มีเลขพัสดุ → ฟองแจ้งพัสดุ) · ติ๊ก "ยังไม่มีเลขพัสดุ" ดูผลได้
- ค่าตั้งต้น: ชุดใหม่ว่าง+ปิด · ตัวอย่างระบบ สรุป 3 แบบ (มาตรฐาน/สั้น กระชับ/เป็นกันเอง) × โอน/COD · พัสดุ 2 แบบ
- **ไม่แยกข้อความตามช่องทาง** (แยกด้วยชุดที่ครอบบัญชี / เทมเพลตจำกัดบัญชี)
- **ตัวแปรไม่มีค่า:** ตัวแปรว่างหายไป · บรรทัดที่ตัวแปร*ทุกตัว*ว่าง = ตัดทั้งบรรทัด · บรรทัดว่างติดกันยุบ · `{x}` ไม่รู้จัก = บันทึกไม่ได้ · เติมแล้วว่างทั้งข้อความ = ไม่ส่ง
- validation: body ≤500 ห้ามว่าง (CHECK ใน DB) · ชื่อเทมเพลต ≤80 ไม่ซ้ำในร้าน · ไม่มีปุ่มคืนค่าตั้งต้น
- `{ชื่อลูกค้า}` ตัด "คุณ" นำหน้า ไม่มีชื่อ = "ลูกค้า" · `{รายการสินค้า}` บางแหล่งได้ชิ้นแรก + "และอีก N รายการ"

**ส่งอัตโนมัติ**
- สวิตช์: สรุป = ปิด / เมื่อสร้าง / เมื่อยืนยัน (ค่าตั้งต้น) · พัสดุ = ปิด / เมื่อมีเลขพัสดุ · สถานะชุด = ปิด / **ทดสอบ (ส่งเฉพาะห้องทดสอบ 1–20 ห้อง)** / เปิด
- กันซ้ำ: UUID คงที่เป็น message_id UNIQUE + ON CONFLICT DO NOTHING · สรุป key = (ห้อง, ออเดอร์) — ทางฟอร์มกับทางเหตุการณ์ key เดียวกัน · พัสดุ key = (ห้อง, ออเดอร์, เลข) — เลขใหม่ส่งอีก · เหตุการณ์ที่ไม่ตรงจังหวะไม่กิน key · ล้ม 4xx ที่ลองใหม่ได้ปล่อย key
- **เพดานข้อความที่บอททักเองต่อลูกค้าต่อวัน ค่าตั้งต้น 3**
- หาห้อง: ตารางผูกออเดอร์–ห้องก่อน แล้วห้อง 1:1 ที่ผูกลูกค้า · **ไม่จับคู่ด้วยเบอร์โทร**
- Meta นอก 24 ชม. = failed/window_closed ไม่ลองใหม่ · ไม่ใช้ tag/HUMAN_AGENT/Utility template (เลื่อนไปทีหลัง)
- LINE push กินโควตา · error โควตา = ล้มไม่ลองใหม่ · ไม่เช็คโควตาก่อนส่ง
- ร้านเห็นผล: ฟองบอทในห้อง pending→sent/failed · แถวสถานะบนการ์ดออเดอร์ ("ส่งสรุปให้ลูกค้าแล้ว" / "จะส่งเมื่อยืนยัน" / "ส่งสรุปอัตโนมัติไม่สำเร็จ: <เหตุผล> — ส่งเองจาก ⋮ ได้") · log หน้า /logs/auto-reply

**กับดัก:** แจ้งพัสดุซ้ำกับ SMS ของขนส่ง (ยังไม่มีข้อยุติ) · `{ยอดที่ชำระแล้ว}` เดาผิดได้ถ้าไม่มีข้อมูลจ่ายจริง · `{ลิงก์ออเดอร์}` ห้ามใช้ลิงก์หลังบ้านร้าน · สองคนแก้ชุดพร้อมกัน = คนหลังชนะ · ถอดสวิตช์เก่าโดยไม่ migrate ทำร้านที่เคยเปิดหยุดส่งเงียบ

## สำรวจ SafePay — งานบริการ (SERVICE) สำหรับส่งอัตโนมัติ 3 จังหวะ (2026-10-17)

- **การจองฝั่ง SERVICE = `Order` type SERVICE** + `serviceStart/serviceEnd` + `appointmentStatus` (`schema.prisma:854-875`) สร้างผ่าน `createOrder` (`order.service.ts:309` → `attachAppointmentInTx` `:777`) · walk-in เติมนัดทีหลังผ่าน `setOrRescheduleAppointment` (`appointment.service.ts:226`) · `booking.service.ts:171-246` คือฝั่งที่พัก (BOOKING) ไม่ใช่ SERVICE — **แก้ข้อเท็จจริงใน PRD §13 ข้อ 5**
- ผูกห้อง: ใช้ `Order.conversationId` เท่านั้น (เขียนครั้งเดียวใน `createOrder` หลังเช็คว่าห้องเป็นของร้าน) · ออเดอร์ก่อน 2026-08-12 / สร้างนอกแชท = NULL · 🛑 ห้าม fallback Customer→ExternalContact→Conversation สำหรับส่งอัตโนมัติ (schema บันทึกว่าเคยเลือกห้องผิดเมื่อลูกค้าทักสองเพจ)
- 🛑 **"เริ่มงาน" ไม่มีในระบบ** — 00073 PRD ตัดขั้น "เริ่มบริการ" ทิ้ง (PRD:111) · ไม่มี `startedAt`/IN_PROGRESS · `serviceStart` = เวลานัด ไม่ใช่เวลาเริ่มจริง ⇒ ต้องเพิ่มฟิลด์/เหตุการณ์ + ปุ่ม
- **"จบงาน"** = `closeServiceJob` (`service-job.service.ts:50-143`) ตั้ง `serviceClosedAt` + `appointmentStatus` COMPLETED/NO_SHOW + `OrderEvent` SERVICE_CLOSED (`meta.outcome` SERVED/NO_SHOW) — จุดทริกเกอร์ธรรมชาติ · `reopenServiceJob` (`:150-186`) ล้างค่า ⇒ ต้องกันส่งซ้ำ · NO_SHOW ไม่ควรส่งรายงาน
- 🛑 **รูปก่อน/หลัง + บันทึกช่าง ไม่มีในระบบ** — ต้องมีโมเดล/ฟิลด์ใหม่ + หน้าอัปโหลด · `Order.internalNote` เป็นโน้ตภายในร้าน ห้ามส่งลูกค้า · upload purpose มีแค่ CHAT|IMAGE|DOCUMENT
- ไฟล์รูปผ่าน `/api/files/{key}` เปิดได้สาธารณะถ้ารู้ key (uuid) · ส่งเข้า Messenger/LINE ใช้ presigned 1 ชม. (แพลตฟอร์มดึงไปเก็บเอง)
- 🛑 **ไม่มีหน้ารายงานงานสำหรับลูกค้า** — `/o/{token}` (guest view) ไม่แสดงรูป/บันทึกช่าง · ใบเสร็จ `/o/[token]/receipt` เฉพาะ SERVICE_QUEUE ที่ปิดงานและจ่ายครบ
- ส่งรูปในแชท: `enqueueOutbound` รับ attachment IMAGE ทีละ 1 ไฟล์ · หลายรูป = วนหลายแถว (`messages/route.ts:893-930` IMAGE_GRID) · การ์ดนัดหมาย (`:787-820`) ใช้เป็นต้นแบบข้อความ "สร้างการจองแล้ว" ได้

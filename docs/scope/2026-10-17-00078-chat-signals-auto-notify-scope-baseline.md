# Scope Baseline — 00078 Chat Customer Signals & Auto Notify (สัญญาณลูกค้าในแชท + ส่งอัตโนมัติถึงลูกค้า) ส่งมอบก้อนเดียว 8 ส่วน

สถานะ: ACTIVE
อ้างอิง PRD: `docs/20 - Features/00078 - Chat Customer Signals & Auto Notify/PRD.md` v0.3 · BRD: `.../BRD.md` v0.3 (FR-CS-01..33, BR-CS-A01..U06) · อนุมัติโดย user 2026-10-17 (commit `3ffdc05b5`) · Research: `.../Research-Notes.md`
spec ดีไซน์: `docs/superpowers/specs/2026-10-17-00078-chat-signals-design.md` · `2026-10-17-00078-auto-notify-settings-v2-design.md` · `2026-10-17-00078-seller-menu-regroup-design.md` · `2026-10-17-chat-shipment-manual-tab-design.md`
branch: `feat/00078-chat-signals-auto-notify` (ออก prod พร้อมกันทั้งก้อน — push `main` ครั้งเดียว)
> baseline นี้ครอบ 8 ส่วนของ v0.3: A Meta AI · B สัญญาณลูกค้า · C ส่งอัตโนมัติสินค้า · C+ เทมเพลตและลิงก์ขนส่ง · S บริการ 3 จังหวะ · D ต้นทุนค่าส่งและแท็บส่งเอง · E แถบแจ้งที่จุดใช้งาน · F จัดกลุ่มเมนู
> S-3 เป็นต้นไป (โค้ด) เริ่มได้เมื่อ S-1 ส่วนเอกสารก่อนโค้ดผ่าน (HR11) · แถว migration (S-2, S-9, S-19, S-23) แตะ DB ได้หลังแจ้ง HR15 3 ข้อ

## Goal
ส่งมอบสัญญาณลูกค้าในแชท (ป้าย Meta AI, ขอบรูป+จานมุม), ข้อความอัตโนมัติ 5 จังหวะที่ร้านเปิดเอง (ปิดเป็นค่าตั้งต้น ไม่มีโหมดทดสอบ) พร้อมเทมเพลตที่ร้านแก้ได้และแถบแจ้ง ณ จุดใช้งาน, ต้นทุนค่าส่งของพัสดุส่งเองเข้ากำไรด้วยฟังก์ชันเดียว และเมนูผู้ขาย 7 กลุ่ม โดยไม่ส่งซ้ำ ไม่หยุดบอท ไม่ฝืนหน้าต่าง 24 ชม. ของ Meta ไม่เปลี่ยน URL/slug เดิม และไม่ทำให้ "เริ่มงาน" กลายเป็นสถานะ

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว ไม่ map = CREEP
> คอลัมน์ "ผูก" = FR/BR ใน BRD/PRD · ทุกแถวที่แตะ UI รับเกณฑ์ S-27 (กฎ UI audit) ร่วมด้วย

### เอกสารและฐานราก

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-1 | เอกสารก่อนโค้ด (HR11): PRD+BRD ผ่าน user · SRS/SDS/DATABASE/TestCase ของ 00078 · sync `docs/SRS.md` (data model M1-M6, enum, API, authorization `X8` + capability อ่านหน้า, validation, routing, slug เมนู) · ตอบ PRD §13 (OQ-A..D) หรือรับค่าเสนอจดใน Change Log | PRD §11.2 · §13 | user อนุมัติ PRD+BRD · `diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls ".../00078 - .../")` ไม่ขาดไฟล์ที่ task ต้องใช้ · SDS ยืนยัน: จุดเขียนเลขพัสดุครบ (webhook iShip ไม่เขียนเลข), ผู้เรียก `setOrRescheduleAppointment` ทุกทาง (A-11), `/orders/new` รับ `conversationId` ทางไหน, ผู้เรียก `ServiceCloseSheet` ทุกทาง, ตัวเลขเพดานความยาวข้อความ Meta/LINE จากเอกสารแพลตฟอร์ม, ที่เก็บต้นทุนส่งเอง (OQ-7 ค) · ชื่อ route ใหม่ไม่ชน slug/ชื่อสงวน | PARTIAL (PRD+BRD v0.3 อนุมัติแล้ว · SRS/SDS/DATABASE/TestCase ยังไม่มี) |

### ส่วน A — ป้าย Meta AI

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-2 | spike วัดข้อมูล prod แบบอ่านอย่างเดียว (Q-23) + migration M1 (ข้อเท็จจริงผู้ถือห้องระดับ `Conversation` + `app_id`/`ai_generated`/มี `admin_text` ระดับ `ChatMessage`) + ingest echo/`messaging_handovers` | FR-CS-01 · BR-CS-A03,A05,A08,A09,A10 | ผล spike (แถว `ChatHandoverEvent` · จำนวน `ai_generated=true` 30 วัน · `admin_text` ปรากฏไหม) ลงเอกสารก่อนล็อกสูตร · ถ้า `ai_generated`=0 ถอยเป็น "แสดงเมื่อพบ `ai_generated` ใน 24 ชม." · ไม่เก็บ boolean `aiHolds` · `pass`/`take` ใช้ `new_owner_app_id` เท่านั้น · echo ไม่มี `app_id` = ของเรา · ไม่ตั้ง `META_APP_ID` ไม่เขียนว่า "เรา" · idempotent ด้วย `occurredAt` · เทส payload จริงจาก `rawMessage` · `[blocker]` mutation `new_owner_app_id`→`previous_owner_app_id` แดง · migration additive nullable ไม่มี default | TODO |
| S-3 | ฟังก์ชันบริสุทธิ์ตัดสิน "Meta AI ถือห้อง" ตัวเดียวใน `src/lib/` | FR-CS-02 · BR-CS-A03,A04,A06,A07 | ตาราง input 2×2×2 + ขอบเวลา 23:59/24:00/24:01 · ไม่มีข้อเท็จจริง/ผู้ถือเป็นเรา-ว่าง/คนใน Business Suite = ไม่ถือ · ไม่อ่าน `viaStandby` และ marker เป็นอินพุต · ไม่ import prisma · mutation ถอดเงื่อนไข 24 ชม. แดง · mutation เติม `viaStandby` เป็นอินพุตแดง | TODO |
| S-4 | UI Meta AI: ไอคอน `sparkles` หน้าเวลาบนแถวรายการห้อง + ชิป "Meta AI คุมอยู่" บนหัวห้อง (โทน `neutral` ใหม่) | FR-CS-03,04 · BR-CS-A01,A02,A11 | เฉพาะ MESSENGER/INSTAGRAM (LINE/DEEP ไม่เคยขึ้น) · แถวใช้ `role="img"` + `aria-label="Meta AI กำลังควบคุมห้องนี้"` + `title` ไม่ใช่ชิป · หัวห้องเป็นปุ่มกางคำอธิบาย `aria-expanded` ไม่มี action · ไม่ disable ช่องพิมพ์ ไม่เรียก `POST …/thread-control` · ไม่แตะ `aiAgentActive` (เทส regression กล่อง "ตอบเอง") · ข้อมูลมากับ query รายการเดิม ไม่มี query/`fetch` เพิ่มต่อแถว · `React.memo` + `nowBucket` ~5 นาที · ค่าแถวเท่าหัวห้อง (ฟังก์ชันตัวเดียว) · ไม่ซ้ำ `sparkles` กับสัญญาณอื่นในแถว | TODO |

### ส่วน B — สัญญาณลูกค้า

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-5 | ฟังก์ชัน "ใบที่นับ" (`counted`) ตัวเดียว + ย้ายทุก consumer + ปรับจุดที่นิยามขัดกัน | FR-CS-06,09 · BR-CS-B01,B03,B05,B06,B07 | ไม่นับ DRAFTED/CANCELLED/NO_SHOW/พัสดุตีกลับ/`Order.status=RETURNED` · consumer ครบ: `customer-behavior.service.ts` · `orders/page.tsx`+`OrdersTable.tsx:507-508` · `customer.service.ts:80-91` · `customers/page.tsx` · `customers/[id]/page.tsx` · `customer-directory.ts:215-231` (filter ซื้อซ้ำ = counted≥2) · `CustomerQuickBlock.tsx:269-280` (1=ลูกค้าใหม่ · ≥2=ลูกค้าซื้อซ้ำ · 0/ไม่มีในระบบ="ยังไม่เคยสั่ง" · เลิกเขียว) · ไม่เหลือเงื่อนไข `status`/`CANCELLED` ที่ consumer เขียนเอง · สถิติสาธารณะ `shop.service.ts:427` **คงเดิม** + หมายเหตุ glossary ใน `docs/10 - Business Rules/` · เทส parity ชุดข้อมูลผสมทุก consumer ได้ `counted` เท่ากัน · `[blocker]` mutation ถอดการตัดทีละตัว (DRAFTED/ตีกลับ/NO_SHOW/RETURNED) ต้องแดง · scope (`shopId`,`customerId`) ไม่ข้ามร้าน · แก้คอมเมนต์ `customer-behavior.ts:~69` | TODO |
| S-6 | ชิปข้อความ "ลูกค้าใหม่"/"ลูกค้าซื้อซ้ำ" ตามนิยามใหม่ (เฉพาะหน้านอกแถวห้อง) + พจนานุกรม | FR-CS-07 · BR-CS-B02,B12 | `customerBadges()`: 0 ไม่มี · 1 ใหม่ · ≥2 ซื้อซ้ำ ไม่ออกสองป้าย · ไอคอน `user-plus`/`repeat` tone `info` (ไม่เขียว) · tooltip ซื้อซ้ำบอกจำนวนใบผัน `orderNoun` · เลิก `newMaxOrders`/`regularCompleted=3` ใช้ {1,2} · ผูกแล้วแต่ไม่มีใบที่นับ **ไม่ขึ้น "ลูกค้าใหม่"** · ไม่ทำให้เกิดเตือนเหลือง `hasBehaviorWarning` · ป้ายตีกลับ/ยกเลิกคงเดิม · `th.ts:949-950` + `en.ts:755-756` · เทสตาราง counted 0/1/2/5 × cancelled/returned · mutation สลับเกณฑ์ 1↔2 แดง · หน้าที่ใช้ชิป: `/orders`, `/customers`, `/customers/[id]`, `CustomerProfileHeader.tsx` | TODO |
| S-7 | คอมโพเนนต์ขอบรูปม่วง + จานมุมบนขวา ตัวเดียวใช้ 3 จุด (แถวรายการห้อง · หัวห้อง · `PanelAvatar` ของ CustomerPanel) | FR-CS-08,10 · BR-CS-B04,B08,B09,B10 | ขอบ `outline-2 outline-offset-2 outline-purple` จากโทเคน `--color-purple` ไม่มี hex (HR7) · ขึ้นเมื่อ counted≥1 · จาน: 1 ใบ=ไอคอนรถเข็น (ชื่อไอคอนยืนยันกับ iconify ก่อน — HR12) · ≥2=ตัวเลข · ≥10="9+" · แถวรายการ `role="img"`+`aria-label` ("ลูกค้าใหม่ ซื้อแล้ว 1 {noun}" / "ลูกค้าซื้อซ้ำ ซื้อแล้ว {n} {noun}")+`title` · หัวห้อง/แผงขวา `aria-label="เป็นลูกค้าของร้านแล้ว"` ไม่มีชิปข้อความ · null/0 ไม่มีขอบไม่มีจาน · คอนทราสต์ขอบ ≥3:1 light/dark ทุกพื้น (QA วัด computed บนจอจริง) · หัวห้อง/แผงอ่าน counted ห้องเดียวผ่าน `enrichWithCustomerBehavior` 1 รายการ **ห้ามกลับไปทำ query `behaviorRows` ทุกใบ** + วัดเวลาโหลดห้องก่อน/หลัง · ตัดสินแสดงขอบ/ตัวเลขอยู่ใน `src/lib` + mutation ถอด `≥1` และขอบ "9+" แดง · ตรวจก่อนลงมือว่า Tailwind 4 ออกคลาส `outline-purple`/`bg-purple` จริง · ผ่าน `safepay-ux` + critique/clarify · commit UI มี `Base:` | TODO |
| S-8 | บรรทัดชิปในแถวรายการห้อง สูงสุด 2 ใบ + "+N" | FR-CS-08b · BR-CS-B11 | ลำดับ: ติดตาม → ตีกลับ/ยกเลิก → DeepBot/DeepAI → สถานะขาย → ad_id → แท็ก · `+N` รวมแท็กส่วนเกิน `role="img"`+`aria-label`+`title` · N≥100="99+" · ไม่ใช้ JS วัดความกว้าง · ป้าย DeepBot ไม่ขึ้นกับ `AUTO_NOTICE` · ไม่แตะคำนำ "คุณ: " ในพรีวิว · เทสหน่วยด้วยฟิกซ์เจอร์ป้ายครบ | TODO |

### ส่วน C — ส่งอัตโนมัติฝั่งสินค้า

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-9 | ฐานข้อมูลส่งอัตโนมัติ: migration M2 (สวิตช์ต่อ (ร้าน,kind) 5 kind + `enabledAt` ต่อจังหวะ + ผู้เปลี่ยน · เพดานต่อวันระดับร้าน · เทมเพลต (ร้าน,kind) body CHECK ≤500 code point + `updatedAt`) + M3 ledger (UNIQUE ร้าน,ออเดอร์,kind,valueKey) + M4 ขยาย CHECK `OrderEvent` | FR-CS-14,23 · BR-CS-C01,C02,C06,C14,C19 | ปิดเป็นค่าตั้งต้นทุกร้านไม่ backfill · `enabledAt` ตั้งใหม่ทุกครั้งปิด→เปิด · ไม่มีตาราง/คอลัมน์ห้องทดสอบหรือสถานะ 3 ค่า · ไม่ปนกับ `AutoReplyConfig` · M4 แบบ additive (`docs/conventions/migration-check-constraint-additive.md`) · จองกุญแจด้วย `INSERT … ON CONFLICT DO NOTHING` ใน tx เดียวกับเหตุการณ์ (ไม่ก่อ ERROR log) · INTENT ค้างมีตัวกวาด (sweeper) ที่ตรวจสวิตช์ซ้ำตอนส่ง (ปิดระหว่างรอ → `NOT_ELIGIBLE_ANYMORE`) · ส่ง N=10 พร้อมกันได้ 1 แถว · ส่งล้มไม่ปลดกุญแจ · mutation: ถอด unique แดง · key เป็น `trackingNo` ดิบ ("abc123" vs "ABC123 ") แดง · เพดาน 5 ช่วง 1-20 นับตามเวลาไทย (ขอบ 23:59/00:00, ค่า 0/21/ทศนิยมถูกปฏิเสธ, mutation เปลี่ยนเป็น UTC แดง) → `DAILY_CAP` บันทึกไม่ส่งเงียบ · grep gate: ไม่มี `TEST_ROOM_ONLY`/`TEST_ONLY` ในโค้ด | TODO |
| S-10 | ผู้ส่งระบบ `autoReplyKind='AUTO_NOTICE'` + ป้าย "ส่งโดยระบบ" + ไล่ผู้บริโภคทุกไฟล์ | FR-CS-16 · BR-CS-C12 | ไม่หยุดบอท (`channel-chat.service.ts:4330-4333`) · ไม่นับเวลาตอบแอดมิน (00059) · ไม่ขึ้นป้าย DeepBot · 00077 ไม่นับ · ไม่มี `replyToMid` ไม่แตะ `lastAutoReplyAt`/`autoReplyCount` · ขยาย type ให้ tsc บังคับ · ไล่ grep `autoReplyKind\|AUTO_TEST\|'AUTO'` ทุกไฟล์ (116 จุด/32 ไฟล์ ตามรายชื่อใน BRD FR-CS-16) พร้อมบันทึกการตัดสินรายไฟล์ · เส้นส่ง `actorUserId=null` + `systemShopId=ร้านของห้อง` · ป้ายบนบับเบิล `<span>`+`title`+`sr-only "ส่งโดยระบบ: …"` ลำดับชนะ DeepBot/AUTO_TEST → ระบบ → AI ของ Meta · เทส 4 ข้อ (บอทไม่ถูกหยุด · เวลาตอบแรกไม่เปลี่ยน · ป้ายบอทไม่ขึ้น · 00077 ไม่นับ) + `[blocker]` mutation ตั้ง `autoReplyKind=null` แดงทั้ง 4 | TODO |
| S-11 | renderer ข้อความตัวเดียว + SSOT ชุดตัวแปรต่อชนิด + ปุ่มส่งมือใช้เทมเพลตเดียวกัน | FR-CS-19,20,21 · BR-CS-C08,C09,C18b | renderer ใน `src/lib` ใช้ทั้ง server/ปุ่มมือ/"ดูข้อความ": ตัวแปรว่างหาย · บรรทัดที่ตัวแปรทุกตัวว่างตัดทั้งบรรทัด · บรรทัดข้อความล้วนคงอยู่ · ยุบบรรทัดว่างติดกัน · ว่างทั้งข้อความ = `EMPTY_MESSAGE` · ชุดตัวแปรเท่าตาราง PRD §3.4 เป๊ะ ไม่มี PII/`internalNote`/ที่อยู่เต็ม/เบอร์เต็ม · ตัวแปรชนิดอื่นใช้ข้ามชนิดไม่ได้ · `{ชื่อลูกค้า}` ตัด "คุณ" ว่าง="ลูกค้า" · `formatDate`/`formatBaht`/`publicOrderUrl`/`resolveOrderVocab` เท่านั้น · `{รายการสินค้า}` นับ "และอีก N รายการ" จากฐาน · **ค่าตั้งต้นทุกชนิด = ข้อความเดิมของปุ่มมือทุกตัวอักษร** (เอาจากโค้ด `messages/route.ts:847` ไม่ใช่ mockup) · ยุบการประกอบ 2 ที่ (`messages/route.ts:824-873` + `trackingMessage` ฝั่ง client) เป็น server ที่เดียว · ปุ่มมือไม่ติด `AUTO_NOTICE` · เทส parity ปุ่มมือ↔อัตโนมัติ↔ดูข้อความ ทั้งก่อน/หลังร้านแก้เทมเพลต 4 ช่องทาง · LINE: ไม่แก้เทมเพลต = การ์ด Flex เดิม แก้แล้ว = ข้อความล้วน · เทสความยาวผลลัพธ์/ตัดอย่างปลอดภัย · mutation เอาการตัดบรรทัดออกแดง | TODO |
| S-12 | จังหวะ ORDER_SUMMARY: ส่งสรุปเมื่อถึง `PENDING` ครั้งแรก | FR-CS-12,15 · BR-CS-C03,C04,C05,C10,C11,C13,C15,C16,C18 | ทริกเกอร์เฉพาะ `createOrder` และ `promoteDraftCore` (ไม่ทริกเกอร์จากการแก้ออเดอร์) · เงื่อนไข: สวิตช์เปิด · หลัง `enabledAt` · `conversationId` ไม่ null (ไม่ fallback) · `isDryRun=false` · ไม่ย้อนหลัง · ยังเป็น `PENDING` ตอนส่ง · ไม่ใช่ใบ SERVICE · ส่งมือแล้ว (มี `ORDER` ในห้อง) ไม่ส่งซ้ำ · ส่งผ่าน `enqueueOutbound` (DEEP ผ่าน `chat.service.sendMessage`) · Meta นอก 24 ชม. ไม่เรียก Graph (mock ต้องไม่ถูกเรียก) บันทึก `WINDOW_CLOSED` ไม่ใช้ `HUMAN_AGENT`/tag · LINE โควตาเต็ม `QUOTA_EXCEEDED` · ไม่ตรวจ Meta AI ล่วงหน้า · ออเดอร์ commit เสมอแม้ตัวส่ง throw (เทสบังคับ) · INTENT ใน tx เดียวกับเหตุการณ์ | TODO |
| S-13 | จังหวะ TRACKING: ส่งเลขพัสดุเมื่อมีเลขใหม่ | FR-CS-13 · BR-CS-C06,C07 | ครอบจุดเขียนเลข a `shipOrder` · b `updateShipmentTracking` · c `createShipment` · d `linkShipment` · d2 `advanceOrderIfDispatched` (e ข้าม) · grep `trackingNo` write ยืนยันไม่มีทางอื่น · ไม่ส่งเมื่อสวิตช์ปิด/ก่อน `enabledAt`/ไม่ผูกห้อง/dry-run/`FAILED`/`CANCELLED`/ร้านบริการ · เลขเดียวสองตาราง (d+d2) ส่งครั้งเดียว · เลขใหม่ที่ต่างส่งอีกขึ้นต้น "อัปเดตเลขติดตามพัสดุ" (ร้านลบไม่ได้) สูงสุด 3 ครั้ง/ออเดอร์ เกินข้ามพร้อมเหตุผล · แก้กลับเลขเดิมไม่ส่ง · บันทึกเลขสำเร็จเสมอแม้ตัวส่งล้ม | TODO |
| S-14 | ผู้ขายเห็นผล: บับเบิลล้ม/ข้าม + แถวสถานะบนการ์ดออเดอร์ + OrderEvent + แทนช่องติ๊ก "แจ้งลูกค้า" | FR-CS-17,18,24 · BR-CS-C14 | สำเร็จ = ข้อความพร้อมป้าย "ส่งโดยระบบ" · ล้ม/ข้ามตาม PRD §4.3 ใช้ถ้อยคำ `chat-send-failure.ts` ห้ามเขียน "ส่งเองได้" เมื่อสาเหตุคือ Meta นอกหน้าต่าง · บับเบิลล้มของ `AUTO_NOTICE` ข้อความนิ่ง "ระบบส่งไม่สำเร็จ" + Swal "ลองใหม่"/"ยกเลิก" เดิม ไม่สร้างกล่องแดงใหม่ · `pushChatSendFailed` · `OrderCardView` แถวสถานะอ่านจาก ledger (ไม่มี ledger = ไม่แสดง) · `OrderEvent` "ระบบแจ้งลูกค้าแล้ว/แจ้งไม่ได้" · ช่องติ๊กใน `ShipmentDraftPanel` หายเฉพาะเมื่อจะส่งจริง ไม่ครบเงื่อนไข = ช่องติ๊กเดิม ค่าตั้งต้นปิด · toast พัสดุไม่อ้างว่าแจ้งแล้ว · ปุ่ม "ส่งเข้าแชท"/"แจ้งเลขในแชท" คงอยู่ · เทส: เปิดสวิตช์แล้วไม่มีทางส่ง 2 ข้อความจากการเปิดพัสดุครั้งเดียว | TODO |

### ส่วน C+ — หน้าตั้งค่า ตัวแก้ ลิงก์ขนส่ง และสิทธิ์

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-28 | สิทธิ์: capability เปลี่ยน `X8` (OWNER+MANAGER) + capability อ่านหน้า (เสนอ H1) ใน `shop-permissions.ts` + 403 ที่ server | FR-CS-11 (สิทธิ์) · BR-CS-C17 · Q-20 | เทสทุกคู่ (บทบาท × capability) · CHAT/BILLING/TECHNICIAN เรียก API เปลี่ยนได้ 403 · CHAT เห็นหน้าแบบอ่านอย่างเดียว (แบนเนอร์ + สวิตช์/เพดาน/"แก้ข้อความ" `disabled` แต่อ่านต้นข้อความและเพดานได้) · TECHNICIAN/BILLING เห็น `NoPermissionCard` · เพิ่มแถวใน 00071 BRD §8.3 + SRS | TODO |
| S-15 | หน้า `/settings/auto-notify` "ส่งอัตโนมัติถึงลูกค้า" (คอลัมน์เดียว) + สวิตช์ต่อจังหวะ + Swal เปิดครั้งแรก + เพดานต่อวัน | FR-CS-11,23 · BR-CS-C01,C02,C19 · A-12 | หนึ่งแถวต่อจังหวะ (`divide-y`) ชื่อ "เมื่อ…" ผันตาม `resolveOrderVocab` ใช้คำ "ปิดงาน" ทุกที่ (ห้าม "จบงาน") · ONLINE_SALES เห็น 2 แถวสินค้า (แถวพัสดุซ่อนเมื่อ `shopShipsGoods` เท็จ) · SERVICE_QUEUE เห็นเฉพาะ 3 แถวบริการ (ซ่อนทั้งแถว) · LODGING เห็นแถว "เมื่อสร้างคำสั่งซื้อ" (OQ-D) · optimistic+revert+`pacesToast` (HR9) ไม่มีปุ่มบันทึกระดับหน้า · สวิตช์ `<input type=checkbox class=form-switch>` ผูก label · Swal `pacesConfirm.warning` "เริ่มส่งข้อความนี้ถึงลูกค้าจริง?" `focusCancel:true` · "ยังก่อน" สวิตช์คงปิดไม่เรียก API · ปิด→เปิดซ้ำไม่ถามอีก · ปิดสวิตช์ไม่ถาม · ช่องเพดาน `inputMode=numeric` ผูก `<label for>` บันทึกเมื่อ blur/Enter ตรวจทั้ง client+server · ข้อควรรู้ 2 ข้อ (Meta 24 ชม. / LINE โควตา) · **ไม่มี** การ์ดสถานะชุด/radiogroup/ห้องทดสอบ/พรีวิว/ตารางลิงก์ขนส่ง · เมนู/breadcrumb/`route-capabilities.ts` · เทส: เปิดครั้งแรกมี Swal · ยกเลิกไม่เปลี่ยน · เปิดซ้ำไม่มี Swal · `enabledAt` เปลี่ยนทุกครั้งปิด→เปิด · mutation ถอด `focusCancel` หรือ reset `enabledAt` แดง · พจนานุกรม th/en | TODO |
| S-16 | ตัวแก้ข้อความแบบ gochat-v3 | FR-CS-33 · BR-CS-U04 | ชิปตัวแปรใน contenteditable · พิมพ์ `{` เปิดเมนู (listbox/option/activedescendant) · ชิปเส้นประ "+ ตัวแปร" (มือถือ = ปุ่มเดียว สูง ≥44px) · ปุ่มอีโมจิ · ตัวนับ n/500 **นับ code point เท่ากัน client/server/CHECK** (ขอบ 499/500/501 ด้วยอีโมจิ+ไทยวรรณยุกต์ซ้อน) · ≥450 warning, 500 danger หยุดรับตัวอักษร **เว้นระหว่าง IME composition** · ตัวอย่าง 3 แบบ/จังหวะ (ถอยมีถามก่อนทับ) · บันทึก/คืนค่าตั้งต้น (ถามยืนยัน)/ยกเลิก · ตัวแปรไม่รู้จัก/ผิดชนิด/ว่าง/ยาวเกิน = บันทึกไม่ได้พร้อมข้อความ · เตือนไม่บล็อกเมื่อไม่มีลิงก์ · เก็บ plain text `{ชื่อไทย}` · วาง plain text · round-trip ไป-กลับเท่าเดิมทุกตัวอักษร + mutation แดง · 409 เมื่อ `updatedAt` ชน · เก็บผู้แก้+เวลา · LINE หมายเหตุใต้ตัวแก้ "เมื่อสร้างคำสั่งซื้อ" · ไม่ประกาศ component ใน render · ไม่ใส่ค่า hook ทั้งก้อนใน deps · เมนูตัวแปรใช้ `FilterDropdownShell` ไม่ใช้ `hs-dropdown` · **เทสพิมพ์ไทยบน iOS Safari + Android Chrome จริง พร้อมหลักฐานวิดีโอ/ภาพ — ไม่ผ่านต้องถอยเป็น textarea ก่อน merge (Controller ตัดสิน)** | TODO |
| S-17 | ตารางลิงก์ติดตามพัสดุตามแบรนด์ขนส่ง + รวมรายชื่อขนส่ง | FR-CS-22 · BR-CS-C21..C24 | `trackingLinkFor({courierCode,courierName,trackingNo,source})` ตัวเดียวใน `src/lib/iship/` ผูก `courierBrandCode()` ไม่สร้างรายชื่อขนส่งชุดที่สอง · ตารางเริ่ม **ว่าง** (ทุกแบรนด์ที่ไม่ใช่ `ISHIP` ประกาศ "ไม่มีลิงก์" ชัดเจน — เทสห้ามตกหล่นเงียบ) · พัสดุ iShip + แบรนด์ไม่มีแถว → `https://app.iship.cloud/tracking?track={เลข}` (hardcode) · ส่งเอง/อื่นๆ ไม่มีลิงก์ แค่เลข · ร้านแก้เองไม่ได้ ไม่แสดงในหน้าตั้งค่า · แถว DEEP ต้องมี `{เลข}` + `encodeURIComponent` (mutation แดง) · แถวใหม่ต้องผ่านการเปิดจริง 1 เลขจริง + บันทึกวันที่ยืนยัน · รวม `CARRIERS` ใน `ShipForm.tsx` เป็น `COURIER_OPTIONS` + เทส regression ค่าเดิม ("Kerry Express","Thailand Post","J&T Express") · เพิ่ม fixture ให้ `scam-link-detector.ts` เมื่อมีแถว | TODO |

### ส่วน S — ร้านบริการ 3 จังหวะ

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-18 | จังหวะ SERVICE_BOOKED: ส่งเมื่อใบ SERVICE ได้นัดครั้งแรก | FR-CS-25 · BR-CS-S01,S02,S03,S06 | ทริกเกอร์ `createOrder`+`attachAppointmentInTx` และ `setOrRescheduleAppointment` เมื่อ `hadAppointment=false` · **เลื่อนนัดไม่ส่ง** · เงื่อนไข: `SERVICE_QUEUE` · สวิตช์เปิด · `conversationId` ไม่ null (ไม่ fallback) · ไม่ dry-run · ไม่ย้อนหลัง · ไม่จบนัด (`isTerminalAppointmentStatus`) · ค่าตั้งต้น = การ์ดสรุปนัดเดิม ใช้ค่าเต็ม ไม่ซ่อนบรรทัด (ไม่อ่าน localStorage) · ลิงก์ `/o/{token}` · ครั้งเดียว/ออเดอร์ · ส่งการ์ดมือก่อนแล้วไม่ซ้ำ · ร้านบริการไม่ได้ทั้งสรุปคำสั่งซื้อและสรุปนัดซ้อนกัน · เทส: createOrder+นัด · walk-in เติมนัด · เลื่อนนัด · ไม่ผูกห้อง · ใบเก่า `conversationId` NULL | TODO |
| S-19 | "เริ่มงาน" เป็นฟิลด์เวลา: migration M4/M5 (`Order.serviceStartedAt` + `OrderEvent SERVICE_STARTED`) + service/route (O4) + ปุ่มบนการ์ดงาน + จังหวะ SERVICE_STARTED | FR-CS-26 · BR-CS-S04 | ตั้งได้ครั้งเดียว กดซ้ำ idempotent ไม่ส่งซ้ำ · **ไม่แตะ `Order.status` / `appointmentStatus` / ชุด 10 ป้าย / วันที่ยอด-เงิน-Trust Score-รีวิว** · เทสตรึง `resolveServiceStatusBadge`/`serviceRevenueOrderWhere`/`countsAsServiceRevenue` ก่อน-หลังกด · ปิดงานได้โดยไม่ต้องกดเริ่ม · `reopenServiceJob` ไม่ล้างค่า · O4 ที่ server (ช่างกดได้ ไม่เห็นเงิน) รองรับ `?shopId=` · กดได้ตั้งแต่เวลาเริ่มนัด (`AppointmentNotStartedError`) · ปุ่ม `player-play` ที่ `ServiceJobCard.tsx` + `TechnicianOrderDetail.tsx` แสดงเมื่อสวิตช์เปิด+ผูกห้อง+ยังไม่ปิด/ไม่ยกเลิก (A-13) · `pacesConfirm.warning` "เริ่มงานและแจ้งลูกค้า?" · แสดง "เริ่มงานเมื่อ {เวลา}" เป็นข้อความธรรมดา ไม่ใช่ป้าย · ไม่มี "ยกเลิกการเริ่มงาน" · เงื่อนไขส่งเท่า S-18 + ใบยังไม่ปิด/ยกเลิก · เทสสิทธิ์ทุกบทบาท · กดสำเร็จเสมอแม้ตัวส่งล้ม · เพิ่มหมายเหตุในเอกสาร 00073 | TODO |
| S-20 | จังหวะ SERVICE_CLOSED: ส่งเมื่อ `closeServiceJob` ผล `SERVED` | FR-CS-27 · BR-CS-S05 | ทริกเกอร์ที่ service (ผู้เรียก 2 ทาง: `api/orders/[token]/close` และ `…/appointment/outcome`) หลัง commit · `NO_SHOW` ไม่ส่ง · valueKey คงที่ **ไม่ผูก `serviceClosedAt`** · ปิด→reopen→ปิดไม่ซ้ำ · NO_SHOW→reopen→SERVED ส่ง · 2 ผู้เรียกพร้อมกัน 1 ครั้ง · ข้อความไม่มีตัวเลขเงิน · ปิดงานสำเร็จเสมอ (INTENT ใน tx, ไม่ยิงข้างนอก) · mutation ผูก key กับ `serviceClosedAt` แดง | TODO |
| S-21 | จุดเสียบ 00079: `composeServiceNotice(kind, order, ctx)` + kind/valueKey เสถียร | FR-CS-30 | ฟังก์ชันเดียวคืนรายการ "ส่วนข้อความ" (รอบนี้ข้อความ+ลิงก์) เว้นช่องให้ส่วนอื่นเพิ่มได้ · ลิงก์มาจากตัวประกอบเดียว · เพิ่มตัวแปรใหม่ในชุดไม่กระทบเทมเพลตเก่า · **ไม่มี** โมเดลรูป/บันทึกช่าง/upload purpose/หน้ารายงาน/ใช้ `internalNote` · เอกสารระบุข้อมูลที่ 00079 ต้องรู้ (ส่งรูปทีละไฟล์/แถวคิว, `/api/files/{key}`, presigned 1 ชม., หน้าต่าง 24 ชม.) | TODO |

### ส่วน D — ต้นทุนค่าส่งและแท็บ "ส่งเอง"

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-22 | แท็บ "ส่งเอง" ในหน้าต่างพัสดุแชท (รวมเข้า branch) | FR-CS-29 · PRD §3.8 | **เสร็จแล้ว** commit `53fbb28f5` (ฐานจาก `58457e7d0` ของ `fix/chat-shipment-manual-tab`): ร้านไม่เชื่อม iShip ได้ฟอร์มส่งเองทันที · ร้านเชื่อมได้แถบ 3 วิธี · มุมมองส่งเองแล้ว · `order-context` ตอบ 200 พร้อม `ishipState`/`orderStatus`/`manualShipment` · แปลง `Invalid transition` เป็นไทย · ต้องไม่ถูกแก้ย้อนโดย commit อื่นของ phase นี้ · เทสที่มากับ commit ต้องยังเขียว · ส่วนที่เหลือของ FR-CS-29 อยู่ที่ S-11 (แทน `trackingMessage` MANUAL ด้วย renderer; ปรับ `chat-shipment-panel.test.ts` ไม่ลบเงียบ), S-23 (ช่องค่าส่ง), S-24 (แถบเหนือปุ่มยืนยัน) | DONE (`53fbb28f5` · Controller ยืนยัน diff/HR17 ก่อน sign-off) |
| S-23 | ต้นทุนค่าส่งพัสดุส่งเอง: migration M6 + ช่องใน `ShipForm` + `ShipOrderSchema` + ฟังก์ชันคำนวณตัวเดียว 3 พื้นผิว + ฉลากเดียว | FR-CS-28 · BR-CS-D01..D06 | ช่อง "ค่าส่งที่ร้านจ่ายขนส่ง" ไม่บังคับ ใน `ShipForm.tsx` (ใช้ร่วมแท็บแชทและ `ShipmentEntryModal`) ผูก label ≥0 ≤99,999.99 · ข้อความกำกับ "ต้นทุนของร้าน ไม่แสดงให้ลูกค้า" · `ShipOrderSchema` รับค่า POST+PATCH สิทธิ์ S1 · **null ≠ 0** (ไม่กรอก = ยังไม่ระบุ นับ pending) · ฟังก์ชันเดียวใน `src/lib` แทน `pnl.service.ts:121-125` · `dashboard.service.ts:546-550` (+`:327-332`) · `sales/page.tsx:331`,`:413-418` · ลำดับ: iShip active ชนะเสมอ → `carrierPrice ?? estimatedPrice`+`codFee` → ต้นทุนที่กรอก (ตัวสำรองสุดท้ายของ iShip ไม่มีราคา, D06) → ยังไม่ระบุ · **เกณฑ์ vertical เดิมไม่เปลี่ยน** (`getPnlReport` เฉพาะร้านบริการ, `/sales`+dashboard ทุกร้าน) · เทส parity ข้ามพื้นผิว · ไม่รวม COD fee ส่งเอง · ฟิลด์ใหม่อยู่ใน `order-view-by-level.ts` + เทสตามระดับเงิน · grep ยืนยัน consumer "ค่าส่ง" อื่น (`OrderProfitCard`, `order-profit-presentation`, `finance-chart`, `FinancePanels`, `line-report-*`) · รวมฉลาก `SYSTEM_SHIPPING_LABEL_TH` ที่เดียว (`line-report-summary.service.ts:64`, `preview-sample.ts:109`) · ข้อความกำกับ "ร้านขายของเห็นที่ /sales+dashboard ไม่เห็นที่ /expenses" ในหน้ากรอก + release note · `updateShipmentTracking` ยังปฏิเสธเมื่อมี iShip active · `[blocker]` mutation: ถอด "iShip ชนะ" แดง · ตี null เป็น 0 แดง | TODO |

### ส่วน E — แถบแจ้งที่จุดใช้งาน

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-24 | `autoNotifyStripState(...)` (HIDDEN\|WILL_SEND\|WINDOW_CLOSED) ใน `src/lib` + คอมโพเนนต์แถบเดียว วาง 4 จุด | FR-CS-31 · BR-CS-E01..E07 | 4 จุด: (1) ฟอร์มสร้างออเดอร์ในแชท `DraftOrderProvider`→`OrderCreateForm` (2) `/orders/new` เมื่อผูกห้อง (คอมโพเนนต์เดียวกับ 1) (3) `ShipmentDraftPanel` ทั้งสองแท็บ (4) `ServiceJobCard`+`TechnicianOrderDetail` เริ่มงาน/ปิดงาน ที่ตัวเดียวครอบทุกทางเข้า `ServiceCloseSheet` · แสดงเฉพาะเมื่อสวิตช์เปิด+ผูกห้อง+ไม่ dry-run+ไม่ย้อนหลัง (เปลี่ยนวันที่เป็นย้อนหลังแถบหายทันที)+(จอง: มีนัด)+(ปิดงาน: ผล SERVED เท่านั้น) · สวิตช์ปิด = ไม่มีแถบ ไม่ชวนเปิด · Messenger/IG ลูกค้าทักล่าสุดเกิน 24 ชม. = แถบเตือนเหลือง `alert-triangle` ข้อความชัด ใช้ฟังก์ชันหน้าต่าง 24 ชม. ตัวเดียวกับด่านส่ง (`channel-chat.service.ts:3959-3963`) · LINE/DEEP ไม่มีแถบเตือน · "ดูข้อความ" เรนเดอร์ด้วย renderer ของ S-11 จากข้อมูลในฟอร์ม (ฟังก์ชันบริสุทธิ์ ไม่เรียกเครือข่ายทุกครั้งที่พิมพ์) ช่องไม่มีค่าเป็นชิปตัวแปร · LINE+เทมเพลตสรุปไม่ถูกแก้ = บอกว่าเป็นการ์ด · ปุ่ม `aria-expanded`/`aria-controls` · region `aria-label="ข้อความที่จะส่งให้ลูกค้า"` ไม่ใช้ `aria-live` · ลิงก์ "ตั้งค่า" ซ่อนสำหรับ TECHNICIAN/BILLING แต่ยังเห็นแถบ · มือถือบรรทัดเดียว ตัด … ในแถบล่างเหนือปุ่มบันทึก กางแล้วสูง ≤9rem ปุ่มบันทึกยังอยู่ในจอ (Playwright 390) · แถบไม่บล็อกการบันทึก ไม่อ้างว่า "ส่งแล้ว" · เทสทุกเงื่อนไข + 23:59/24:00/24:01 + **mutation ถอดเงื่อนไขใดแดง** + เทส parity predicate เดียวกับตัวส่ง | TODO |

### ส่วน F — เมนูผู้ขาย

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-25 | จัดกลุ่มเมนู 7 กลุ่ม + รายการใหม่ `seller:settings-auto-notify` + ป้ายกลุ่มไทย + แปลสองภาษา | FR-CS-32 · BR-CS-F01..F05 | 7 กลุ่มตามลำดับ PRD §3.10 · **ไม่เปลี่ยน URL/slug เดิม** (เทส slug contract: เพิ่มได้ ห้ามลบ) · รวมต่อ vertical (เจ้าของ) ONLINE 29 · SERVICE 27 · LODGING 28 = เดิม+1 ไม่หาย/ซ้ำ · กลุ่ม "แชทและลูกค้า" ใช้ slug `seller-chat` ต่อ · ย้ายรายการตามสเปก · รายการใหม่ ไอคอน `send` (ตรวจชื่อในชุด tabler ก่อน — HR12) ลำดับ 4 ใน "ตั้งค่าแชท" ไม่อยู่ใน `*_ONLY_SLUGS` ลง `route-capabilities.ts` ชื่อหน้า `getSellerPageTitle.ts`/`SellerMobileHeader.tsx` · `menu.group*` + `menu.settingsAutoNotify` ทั้ง `th.ts`/`en.ts` · `applyMenuLocale` แปลป้ายกลุ่มด้วย · ป้ายกลุ่ม sentence-case ตัด uppercase/letter-spacing เฉพาะ sidebar ผู้ขายที่ `src/assets/css/safepay-overrides.css` **ห้ามแก้ `_sidenav.css`** · เปิดดู `ChatNavRail` ที่ใช้ป้ายกลุ่มเป็นเส้นคั่น · กรองด้วย slug ลำดับ gate ไม่เปลี่ยน · เทส per-role: OWNER 7 · MANAGER 1,2,4,5,6 · CHAT/BILLING/TECHNICIAN ตาม BR-CS-F05 ไม่มีกลุ่มว่าง · **ข้อควรยืนยัน:** PRD ว่า "ทุกกลุ่ม ≤6 รายการทุก vertical" แต่กลุ่ม 1 ในตารางมี 10 รายการ — ตีความว่านับหลังกรองต่อ vertical, Controller ยืนยันก่อน build | TODO |
| S-26 | ถอดกลุ่มว่าง + `/shop` มือถือ + เมนูลัดค่าเริ่มต้น + เทสที่ผูกโครงเมนู | FR-CS-32 · BR-CS-F03,F06,F07 | ถอดกลุ่มว่างท้าย `resolveVisibleSellerMenu` + เทส (Android+ร้านส่วนตัว → กลุ่ม "ทีมและแพ็กเกจ" หายทั้งกลุ่ม) + mutation ถอดขั้นแดง · เพิ่มหัวข้อ "ตั้งค่าแชท" ใน `ShopQuickLinks.tsx` + `QUICK_LINK_URLS` (`role-nav.ts:271`) ชื่อตรงเมนูเดสก์ท็อป แสดงเฉพาะที่ผู้ใช้เห็นจริง · เมนูลัดค่าเริ่มต้นเปลี่ยนตามลำดับใหม่ (user รับทราบ; คนปักเองไม่กระทบ) + `shortcut-role.test.ts` ปรับ + เขียน release note · ปรับ (ไม่ลบ) `seller-menu.test.ts` (~บรรทัด 415 หา line-reports ด้วย slug), `role-nav.test.ts` (~211), `chat-desk-menu-access.test.ts` (`chat-desk` ถัดจาก `inbox`) · รันทั้งชุด: `shortcut-role`, `dictionaries`, `chat-nav-rail-guard`, `iap-entry-point-in-app`, `no-payment-in-android-app` · เทส blocker ลำดับ `hidePayments`/`hidePaidFeatures` ยังเขียว · แถบล่างมือถือ `resolveMobileNav` ไม่เปลี่ยน | TODO |

### กฎร่วม คุณภาพ และส่งมอบ

| ID | รายการ | ผูก | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|-----|----------------------|-------|
| S-27 | กฎ UI audit ร่วม ใช้กับทุกพื้นผิว UI ใหม่ของ 00078 (หน้าตั้งค่า · ตัวแก้ · แถบแจ้ง · ปุ่มเริ่มงาน · ช่องค่าส่ง · เมนู · ขอบ/จาน/ไอคอน Meta AI) | BR-CS-U01..U06 · BRD §6.5 | U01 reviewer grep ไม่มี `text-primary`/`text-danger`/`text-warning`/`text-info` กับตัวหนังสือ (ใช้ `-ink`) + วัดคอนทราสต์ ≥4.5:1 light/dark · U02 axe/เทส component: ช่องเพดาน · ช่องค่าส่ง · ตัวแก้ · สวิตช์ทุกตัวผูก label · U03 Playwright 390 วัด bounding box ≥44px: สวิตช์ · "แก้ข้อความ" · ปุ่มตัวอย่าง · "+ ตัวแปร" · รายการเมนูตัวแปร · "ดูข้อความ" · "ตั้งค่า" · บันทึก/คืนค่า/ยกเลิก · อีโมจิ · ช่องเพดาน · U04 viewport 390 มีปุ่ม "+ ตัวแปร" 1 ปุ่ม · U05 `rg` อีโมจิใน UI = 0 (ยกเว้นเนื้อความที่ร้านพิมพ์) · U06 สถานะไม่สื่อด้วยสีอย่างเดียว · HR1/3/5/7/9/12 grep · `safepay-ux` Design Spec (`### Impeccable compliance`) ก่อน build + `/impeccable critique` + `clarify` ก่อน mark complete (HR8) · 3 จอ 390/834/1440 light/dark · `prefers-reduced-motion` | TODO |
| S-29 | sync เอกสารและพจนานุกรม | PRD §11.2 | `docs/SRS.md` ครบ M1-M6/enum/API/authorization/validation/routing · BRD 00071 §8.3 (`X8`, อ่านหน้า, O4 กับเริ่มงาน) · PRD 00061 (หมายเหตุ BR-ACO-27 ข้อยกเว้น) · เอกสาร 00073 (`serviceStartedAt` ไม่ใช่สถานะ) · `docs/10 - Business Rules/` glossary (ลูกค้าใหม่/ซื้อซ้ำ · ต้นทุนค่าส่ง · เริ่มงาน) · `th.ts`/`en.ts` (00047) · `docs/system/ui-guideline/` ถ้าแตะกติกา sidebar · snapshot ใน `docs/claude/state-snapshots.md` + บรรทัดเดียวใน CLAUDE.md | TODO |
| S-30 | QA end-of-phase + ด่าน CI + แจ้ง HR15 + push | NFR §6 · HR13/14/15/17 | Playwright E2E ครบ (3 จอ) · เทสพิมพ์ไทยเครื่องจริง (S-16) · เทส DB ใช้ localhost:5434 ปักหมุด URL ในคำสั่ง (override `DATABASE_URL`) · `npm test` + `tsc` (`--max-old-space-size=8192`) + build ตัดสินด้วย exit code · ด่าน CI ครบในเครื่อง (blocker marker · theme-guard · tests/) · HR17 `comm -12` สองทิศ + verify หลัง rebase + เช็ค FF ซ้ำ · **แจ้ง user 3 ข้อ HR15 ก่อน migrate** (prod ไม่ต้องสั่ง · local apply เอง · migrate ล้ม = deploy ไม่ขึ้น) · วัดเวลา: รายการห้องไม่มี query เพิ่มต่อแถว, เปิดห้อง ≤1 query เพิ่ม ก่อน/หลัง · release note (เมนูลัดค่าเริ่มต้น · ร้านขายของต้นทุนส่งเอง /sales+dashboard ไม่ถึง /expenses · ตารางลิงก์ขนส่งว่าง) | TODO |
| S-31 | sign-off phase | - | ทุก S-id DONE พร้อมหลักฐาน · เกณฑ์ sign-off ข้างล่างครบ · retro ปลาย phase ใน `docs/retro/` (HR4) | TODO |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block) ถ้าจำเป็นต้องทำ Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | 00079 รายงานงานบริการสำหรับลูกค้า: รูปก่อน/หลัง · บันทึกช่าง · หน้ารายงานฝั่งลูกค้า · โมเดลข้อมูล/upload purpose ใหม่ · ใช้ `Order.internalNote` เป็นเนื้อหา | แยกเป็นฟีเจอร์ 00079 (00078 ทำแค่จุดเสียบ S-21) |
| OOS-2 | โหมดทดสอบทุกรูปแบบ: สถานะ ปิด/ทดสอบ/เปิด ระดับชุด · ห้องทดสอบ · `TEST_ROOM_ONLY` · ชิป "ทดสอบ" · BR-CS-C20 (เลขถอนแล้ว ห้ามนำกลับมาใช้) | มติ 2026-10-17 "เอาโหมดทดสอบออกเลย" (grep gate ใน S-9) |
| OOS-3 | กล่องพรีวิว/กรอบแชทตัวอย่าง/ตัวเลือกช่องทาง/"ลองกรณีข้อมูลไม่ครบ" ในหน้าตั้งค่า | มติรอบ 3 (ดูข้อความได้ที่แถบจุดใช้งาน S-24) |
| OOS-4 | ตารางลิงก์ขนส่งในหน้าตั้งค่า / ให้ร้านแก้ลิงก์เอง / เดา URL ขนส่ง | BR-CS-C21,C22 |
| OOS-5 | ปุ่มแย่ง/ขอคืนสิทธิ์ห้องจาก Meta AI · ยิง `GET /thread_owner` ทีละแถวหรือตอนเปิดห้อง (FR-CS-05) · เปลี่ยน logic ล็อก/ปลดล็อกช่องพิมพ์ (`aiAgentActive`) | BR-CS-A01 · Q-10, Q-12 |
| OOS-6 | ป้ายแอปอื่น (Pancake/Botcake) และ "คนใน Business Suite" | Q-11 |
| OOS-7 | เปลี่ยนโต๊ะแชท 00077 ให้ใช้สัญญาณใหม่ (00077 ยังใช้ `viaStandby` `chat-desk/rules.ts:45`) | แจ้งเป็นความเสี่ยง ไม่แก้รอบนี้ |
| OOS-8 | ส่งนอกหน้าต่าง 24 ชม. ของ Meta ด้วย message tag / `HUMAN_AGENT` / utility template (รวมข้อความเริ่มงาน/ปิดงานของการจองล่วงหน้า) | BR-CS-C10 · Phase 2 |
| OOS-9 | ร้านที่พัก (BOOKING, `booking.service.ts`) ส่งอัตโนมัติ · ประมูล · หน้าร้านสาธารณะ · iShip import (`importParcelAsOrder`) · `promoteAutoOrderDraft` ไม่มีฟอร์ม | ไม่ผูกห้อง/ไม่มี UI |
| OOS-10 | ข้อความ "เลื่อนนัด"/"ยกเลิกนัด" อัตโนมัติ · ส่งอัตโนมัติเมื่อสถานะอื่น (ชำระแล้ว ส่งถึงแล้ว ยกเลิก ตีกลับ) | S1 ส่งครั้งเดียว · ไม่ขอ |
| OOS-11 | "ยกเลิกการเริ่มงาน" · ทำให้ "เริ่มงาน" เป็นสถานะ/ค่า `appointmentStatus`/ป้ายใหม่ใน 10 ป้าย | BR-CS-S04 · ไม่ย้อนมติ 00073 |
| OOS-12 | แถบแจ้งที่ชีตตั้งนัดทีหลัง (walk-in เติมนัด) และเส้นทางไม่มีฟอร์ม | OQ-C (ส่งอัตโนมัติ S1(ข) ยังทำงานตาม S-18; ขาดแค่แถบ) |
| OOS-13 | เทมเพลตแยกตามช่องทาง · ตั้งเวลาหน่วง · รวมข้อความ · ประวัติการแก้เทมเพลต (before/after) · คลังเทมเพลตแยกจากชุด | 1 เทมเพลต/ชนิด ใช้ทุกช่องทาง |
| OOS-14 | ตัวแปร `{ยอดที่ชำระแล้ว}`/`{ยอดค้างชำระ}` · `{ที่อยู่จัดส่ง}` · `{เบอร์ลูกค้า}` · ตัวแปรที่ดึง `internalNote` | OQ-11 · PII |
| OOS-15 | COD fee ของพัสดุส่งเอง · พัสดุขากลับ (00056) · iShip webhook เป็นที่มาของเลขใหม่ | ไม่มีข้อมูล / นอกขอบเขต |
| OOS-16 | เปลี่ยนเกณฑ์ vertical ของพื้นผิวกำไรเดิม (ขยายให้ร้านขายของเห็นที่ /expenses) | BR-CS-D02 · OQ-7 (ก) |
| OOS-17 | เปลี่ยนชื่อรายการเมนู 3 หน้า "…อัตโนมัติ" · แก้แถบล่างมือถือ `resolveMobileNav` · แก้ `_sidenav.css` ของ Paces | PRD §5 · BR-CS-F02 |
| OOS-18 | ป้ายลูกค้าบน Deep-App ฝั่งผู้ซื้อ · ป้อนสัญญาณลูกค้าเข้า Trust Score · แก้สถิติสาธารณะหน้าร้าน `shop.service.ts:427` | ข้อมูลภายในร้าน · Q-6 |
| OOS-19 | refactor ระบบป้าย/โทเคน/คอมโพเนนต์นอกจุดที่ระบุ · ย้ายหน้าที่ยังไม่แตะไป shadcn (00076) | PRD §5 · ห้ามปน Preline กับ shadcn ใน `(paces)/**` |
| OOS-20 | ยืนยันสดตอนเปิดห้อง (FR-CS-05) · รายงานเทียบป้าย Meta AI กับผลส่งจริง 14 วัน (เป็น KPI วัดหลังขึ้น prod) | Q-12 · KPI หลัง release |

## รายการค้างที่ขึ้นกับ user (ไม่บล็อกการเขียนโค้ด; บล็อก merge ตามที่ระบุ)

| ID | รายการ | ที่กระทบ | ค่าเสนอถ้าไม่ตอบ |
|----|--------|----------|------------------|
| U-1 (OQ-A) | URL ติดตามของแต่ละขนส่ง (Flash/Kerry/ไปรษณีย์ไทย/J&T/SPX/DHL/BEST/Fuze) + รูป `PAGE`/`DEEP` ที่เปิดด้วยเลขจริงแล้ว | S-17 | ตารางว่าง ร้านส่งเองได้เลขอย่างเดียว (ทางถอย iShip เฉพาะพัสดุ iShip) — **ไม่นับเป็น GAP** |
| U-2 (OQ-B) | ถ้อยคำค่าตั้งต้นฝั่งบริการ (เริ่มงาน/ปิดงาน/จอง) + ตัวอย่าง 3 แบบของทุกจังหวะ ให้ user เคาะจากภาพ | S-16, S-18..S-20 | ใช้ร่างใน BRD FR-CS-26/27 + ตรวจให้ตัวแปร `SERVICE_BOOKED` ใน mockup ตรงตาราง PRD §3.4 (mockup ขาด `{เลขคำสั่งซื้อ}` `{ยอดรวม}` `{ยอดมัดจำที่ตกลงไว้}`) |
| U-3 (OQ-C) | แถบแจ้งที่ชีตตั้งนัดทีหลังหรือไม่ | OOS-12 | ไม่ทำรอบนี้ |
| U-4 (OQ-D) | ร้านที่พัก (LODGING) เห็นแถว "เมื่อสร้างคำสั่งซื้อ" หรือหน้าว่าง (สเปกดีไซน์วาดว่าง ขัด PRD OQ-5) | S-15 | ตาม PRD (เห็น) แล้วให้ UX วาดเฟรมเพิ่ม |
| U-5 | ผลเทสพิมพ์ไทยเครื่องจริง iOS/Android + Controller ตัดสินถอยเป็น textarea หรือไม่ | S-16 | ไม่ผ่าน = ถอยก่อน merge |
| U-6 | ผู้ใช้ดูภาพ 3 จอ (หน้าตั้งค่า · ตัวแก้ · แถบแจ้ง · แถวห้อง · เมนู) ก่อน merge | S-27, S-30 | - |

## Migration ที่คาด (ทั้งหมด additive; รูปทรงจริง DATABASE ตัดสิน)
> push `main` = `prisma migrate deploy` บน prod (HR15) · ห้าม `migrate dev`/`db pull`/`db push --force-reset` กับฐานแชร์ · คำสั่งล้าง/สร้าง schema ปักหมุด URL localhost (HR13/14)

| # | Migration | เนื้อหา | แถวที่เป็นเจ้าของ |
|---|-----------|---------|-------------------|
| M1 | ผู้ถือห้อง (ส่วน A) | `Conversation`: ผู้ถือล่าสุด {เรา, แอปอื่น, ว่าง, ไม่ทราบ}, app id, เวลาได้หลักฐาน, เวลาข้อความตอบฝั่งร้านที่ไม่ใช่ของเราล่าสุด, ชนิด {AI, คน, แอปอื่น, ไม่ทราบ} · `ChatMessage`: `app_id`/`ai_generated`/มี `admin_text` ของ echo · nullable ไม่มี default · ไม่เก็บ boolean | S-2 |
| M2 | ตั้งค่าส่งอัตโนมัติ | สวิตช์ต่อ (ร้าน,kind) ×5 + `enabledAt` ต่อจังหวะ + ผู้เปลี่ยน · เพดานต่อวันระดับร้าน (1-20 ค่าตั้งต้น 5) · เทมเพลต (ร้าน,kind,body ≤500 code point CHECK, ผู้แก้, `updatedAt`) unique (ร้าน,kind) · ไม่มีห้องทดสอบ/สถานะ 3 ค่า · ไม่ปน `AutoReplyConfig` | S-9 |
| M3 | ledger | (ร้าน,ออเดอร์,kind,valueKey) UNIQUE · สถานะ INTENT/SENT/FAILED/SKIPPED · เหตุผล · chatMessageId · เวลา | S-9 |
| M4 | OrderEvent CHECK | เพิ่มชนิด `SERVICE_STARTED` (+ ชนิดแจ้งลูกค้า) แบบ additive (CHECK เดิมอยู่ที่ `20261011120000_service_closed_at`) | S-9, S-14, S-19 |
| M5 | เริ่มงาน | `Order.serviceStartedAt timestamptz?` (+ ผู้กด) nullable ไม่มี default | S-19 |
| M6 | ต้นทุนส่งเอง | `ShipmentTracking.shippingCost decimal(12,2)?` (หรือ `OrderShipment` — DATABASE ตัดสิน OQ-7 ค) null ≠ 0 | S-23 |

**ไม่มี migration:** ส่วน B ทั้งหมด (S-5..S-8) · `autoReplyKind='AUTO_NOTICE'` (S-10; คอลัมน์ `String?` ไม่มี enum/CHECK) · ตารางลิงก์ขนส่ง (S-17) · แถบแจ้ง (S-24) · เมนู (S-25/26)
ถ้ามี migration เกิน M1-M6 หรือไฟล์ใต้ `prisma/` เปลี่ยนนอกรายการนี้ = ต้องจด Change Log ก่อน (ไม่งั้น CREEP)

## เกณฑ์ sign-off (Gate 2)
1. S-1..S-31 ทุกข้อ DONE พร้อมหลักฐาน (commit hash / file:line / ผลเทส) · S-22 DONE แล้วด้วย `53fbb28f5`
2. ไม่มี CREEP ค้าง: ทุก commit map S-id ได้ · ไม่มี OOS-id ถูกแตะ · grep gate ว่างทั้งหมด: `TEST_ROOM_ONLY|TEST_ONLY` · `react-toastify` ใน `(paces)/` · emoji ใน UI · `text-(primary|danger|warning|info)` กับตัวหนังสือในไฟล์ UI ใหม่ · arbitrary Tailwind ไม่มีคอมเมนต์
3. เทส `[blocker]` + mutation ทุกข้อใน In-Scope เขียวและแดงตามที่ระบุ (ถ้า mutation แล้วยังเขียว = ชุด input อ่อน ต้องแก้ชุดเทส)
4. KPI เชิงเทสเป็น 0: ป้ายตรงกันทุกหน้า (parity counted) · ส่งซ้ำ (N=10 พร้อมกัน) · ผลข้างเคียงต่อบอท/รายงาน/00077 · งานหลักล้มเพราะตัวส่ง · เทมเพลต parity 4 ช่องทาง · แถบแจ้งไม่โกหก (predicate เดียว) · ต้นทุนค่าส่งตรงทุกพื้นผิว · slug เมนูหาย 0 / กลุ่มว่าง 0
5. QA end-of-phase: Playwright 3 จอ light/dark ผ่าน · เทสพิมพ์ไทย iOS/Android จริงมีหลักฐาน · คอนทราสต์ขอบรูป ≥3:1 และตัวหนังสือ ≥4.5:1 วัด computed จริง · `safepay-ux` + `/impeccable critique` + `clarify` แนบผล · user ดูภาพ 3 จอแล้ว (U-6)
6. ด่าน build: `tsc` + build exit 0 · ชุดเทสเดิมผ่านเท่าก่อนเริ่ม (DB เทสชี้ localhost:5434) · ด่าน CI ครบในเครื่อง · HR17 verify หลัง rebase · แจ้ง HR15 3 ข้อแล้วก่อน push
7. เอกสาร sync (S-29) ครบ: SRS · BRD 00071 §8.3 · PRD 00061 · เอกสาร 00073 · Business Rules glossary · `th.ts`/`en.ts` · state-snapshots + CLAUDE.md หนึ่งบรรทัด
8. รายการค้างที่ขึ้นกับ user (U-1..U-6) ถูกปิดหรือรับค่าเสนอและจดใน Change Log · ตาราง U-1 ว่างได้โดยไม่ถือเป็น GAP
9. retro ใน `docs/retro/` · release note ครบ 3 เรื่อง (เมนูลัดค่าเริ่มต้น · ต้นทุนส่งเอง /sales+dashboard ไม่ถึง /expenses · ลิงก์ขนส่งยังว่าง)

## Assumptions
- ค่าเสนอใน PRD §13 (OQ-A..D) ใช้ได้ถ้า user ไม่ตอบ และจดใน Change Log
- commit `53fbb28f5` บน branch นี้เท่ากับผลของ `fix/chat-shipment-manual-tab` (`58457e7d0`) ที่รวมแล้ว (PRD ยังอ้าง hash เก่า) — Controller ยืนยันด้วย diff ว่าไฟล์ร่วม (`ShipmentDraftPanel.tsx`, `ShipForm.tsx`, `order-context/route.ts`, `iship.service.ts`, `lib/iship/context.ts`, `lib/validations.ts`) ครบก่อน sign-off
- "เริ่มงาน" แสดงตาม OQ-6 (สวิตช์เปิด+ผูกห้อง) ชนะสเปกดีไซน์ §4 (A-13) · ร้านที่พักเห็นแถวสินค้าตาม OQ-5 (A-14) · LINE โควตาเต็มไม่มีแถบเตือนล่วงหน้า ผลขึ้นหลังส่ง (A-15)
- "เปิดสวิตช์ครั้งแรก" = ต่อจังหวะต่อร้าน (ยังไม่เคยมี `enabledAt`) Swal เป็น UX ไม่ใช่กฎ server (A-12)
- spike Q-23 อาจเปลี่ยนสูตร S-3 (ถ้า `ai_generated`=0 ในสนามจริง) — เปลี่ยนสูตรได้โดยไม่ขยาย scope แต่ต้องจด Change Log
- ฟิลด์ DB ทั้งหมดเป็นข้อเสนอ รูปทรงจริงเป็นของ DATABASE ตาม SDS
- เลขฟีเจอร์ 00078 ยังไม่ชน (Controller ยืนยันก่อน commit)
- ฐาน dev/QA ใช้ localhost เท่านั้น ห้ามชี้ prod (HR13/14/15)

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ ไม่นับเป็น GAP ตอน audit/sign-off

- ส่งนอกหน้าต่าง 24 ชม. ของ Meta ด้วย tag/template (OOS-8) — ตัดสินจากสัดส่วน `WINDOW_CLOSED` ต่อชนิด (KPI)
- 00079 รายงานงานบริการสำหรับลูกค้า (OOS-1) — เสียบที่ S-21
- ยืนยันสดตอนเปิดห้อง / `thread_owner` (OOS-5, OOS-20)
- แถบแจ้งที่ชีตตั้งนัดทีหลัง (OOS-12)
- ตัวแปรเงินที่ชำระแล้ว/ค้างชำระ · เทมเพลตแยกช่องทาง/หน่วงเวลา/ประวัติการแก้ (OOS-13, OOS-14)
- แถวลิงก์ขนส่งแต่ละแบรนด์ — รอ URL จาก user (U-1)
- ส่งอัตโนมัติฝั่งที่พัก (BOOKING) (OOS-9)

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-10-17 | baseline สร้างจาก PRD+BRD v0.3 (commit `3ffdc05b5`): 8 ส่วน + กฎ UI audit · ตัดโหมดทดสอบ/พรีวิวตามมติรอบ 2-3 · แท็บส่งเอง (S-22) ทำแล้วใน `53fbb28f5` | user อนุมัติเอกสาร 2026-10-17 | user |

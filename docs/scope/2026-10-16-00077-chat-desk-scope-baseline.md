# Scope Baseline — 00077 Chat Desk (โต๊ะแชท 3D) รอบ 1: ฉากอ่านอย่างเดียวสำหรับ OWNER

สถานะ: ACTIVE
อ้างอิง PRD: `docs/20 - Features/00077 - Chat Desk/PRD.md` · BRD: `.../BRD.md` (FR-CD-01..23, NFR-CD-01..11, BR-CD-01..37, AC-CD-01..56) · มติ user 2026-10-16 (6 ข้อ: ไม่มีระบบมอบแชท/ทีม · ฉาก 3D ยกเว้น HR1 · ตัดแผงตกแต่งห้อง ไม่แตะ schema · ออนไลน์ = Supabase Presence · ไม่มีสัญญาณสดฝั่งแอดมิน · OWNER เท่านั้น)
> baseline นี้ครอบเฉพาะรอบ 1 รอบ 2 (ตกแต่งห้อง สัญญาณสด ทีม) ต้องมี baseline ของตัวเอง
> S-4 เป็นต้นไป (โค้ด) เริ่มได้เมื่อ S-1 ผ่านและ Q-1..Q-5 ใน PRD §10 ได้คำตอบหรือรับค่าแนะนำ

## Goal
ส่งมอบหน้าโต๊ะแชทที่เจ้าของร้าน (OWNER) เปิดดูสถานะแชท ณ ตอนนี้ได้ในฉาก isometric อ่านอย่างเดียว พร้อมตัวเลขที่ใช้นิยามเดิมของ 00059 มีโหมด 2D สำรอง โดยไม่แตะ schema/migration ไม่มีการเขียนข้อมูล ไม่แตะสถานะอ่านแล้วของแชท และ ADMIN/ผู้ไม่ล็อกอินถูกปฏิเสธที่ server

## In-Scope
> ทุก commit ของ phase นี้ต้อง map กับ ID ด้านล่างอย่างน้อย 1 ตัว ไม่ map = CREEP

| ID | รายการ | Acceptance (ทดสอบได้) | สถานะ |
|----|--------|----------------------|-------|
| S-1 | เอกสาร: PRD + BRD ผ่าน user, ได้คำตอบ Q-1..Q-5 (หรือรับค่าแนะนำจดใน Change Log), SRS/SDS โดย planner, sync `docs/SRS.md` ส่วน API reference, ทะเบียน dependency + ทะเบียน asset | user อนุมัติ PRD+BRD · `diff <(ls "docs/99 - Rules/Feature-Templates/") <(ls ".../00077 - Chat Desk/")` ไม่ขาดไฟล์ที่ task ต้องใช้ (PRD, BRD ก่อนเริ่ม; SRS/SDS ก่อน S-4..) · SDS มี ชื่อ route ที่ตรวจแล้วไม่ชน slug/ชื่อสงวน · ทะเบียน dependency (three, @react-three/fiber, @react-three/drei: เหตุผล ขนาด ผู้อนุมัติ) · ทะเบียน asset (ไฟล์ ผู้สร้าง ใบอนุญาต CC0 URL) · EXPLAIN ของ query ห้องรอคำตอบ/ข้อความใบแรกของช่วงรอ | TODO |
| S-2 | สิทธิ์ OWNER-only: `resolveOwnerDeskScope` (ใหม่) กรอง `resolveChatScope().shopIds` เหลือร้านที่ผู้ดูเป็น OWNER ใน WHERE ตั้งแต่ query แรก · page ตรวจเอง · เมนู (`seller-menu.ts` CHAT group + `BY_SLUG`) เห็นเฉพาะ OWNER · ขยาย `chat-nav-rail-guard.test.ts` | AC-CD-21..26 ผ่านทุกข้อ · เทส 3 บัญชี (OWNER 200 / ADMIN 403 / ไม่ล็อกอิน 401) · mutation: ถอดการกรอง OWNER แล้วเทส AC-CD-23 แดง · ADMIN เปิด URL ตรง ไม่มีข้อมูลร้านใน HTML | TODO |
| S-3 | Presence: tracker ใน layout ของ `(chat)` (key ต่อคน คีย์ทึบจาก server) + reader อ่านอย่างเดียวฝั่งโต๊ะแชท + endpoint ออกคีย์ของตน (ADMIN เรียกได้) | AC-CD-27..31 ผ่าน · เทสสแกนซอร์ส: ไฟล์ reader ไม่มี `.track(` · เทส: สองแท็บคนเดียว = 1 คน · key ไม่มี userId · Presence ล่ม = หน้าไม่ล้ม · มีบันทึกว่าไฟล์แชทที่มีงานค้างใน working tree ไม่ถูกทับ (HR17) | TODO |
| S-4 | Snapshot service + API (`GET` เท่านั้น): ห้องรอคำตอบ (<=200, 7 วัน) · ห้องที่ร้านตอบ <=180 วิ · ตัดสินโต๊ะ 4 ชนิดตามลำดับ BR-CD-06 · ข้อความฝั่งร้านล่าสุดที่ไม่ใช่บรรทัดระบบ · สมาชิกทุกคนรวมเจ้าของ (นับคนเดียว) · ตัวกรองเพจ/แพลตฟอร์ม/แอดมิน | AC-CD-01..11, 43, 49 ผ่าน · เทสเคส 179/180/181 วินาที · เคสชน autoReplyKind+viaStandby · ร้านไม่มีแอดมิน · payload ผ่าน allow-list ไม่มีเบอร์/อีเมล · query ต่อ snapshot <= 4 (วัดบันทึก) · ไม่มีไฟล์ใต้ `prisma/` เปลี่ยน | TODO |
| S-5 | ตัวเลขภาพรวม ใช้นิยามเดิม: ตอบแรกเฉลี่ย/รอเฉลี่ย/SLA จาก `agent-performance.service.ts` + `agent-sla.ts` · เวลาไทย · แคช 60 วินาที/ร้าน · ป้ายนับไม่ครบ · "-" เมื่อไม่มีตัวอย่าง · เกินเวลาตอบจากช่วงรอใบแรกที่ยังไม่ถูกตอบ · ปิดงานวันนี้ตามคำตอบ Q-2 | AC-CD-12..20 ผ่าน · เทส parity เท่ากับ `/reports/agents` ทุกวินาที · เทสสแกนซอร์สว่าไม่คำนวณสูตรเอง/ไม่มีเลข 300 ฮาร์ดโค้ด · เทส 16:59:59Z/17:00:00Z | TODO |
| S-6 | โมเดลฉากแบบ pure (`src/lib/chat-desk/`): classify/pickDesk/isOverdue/layout/summarize/diffSnapshots/filters | AC-CD-10, 35..37, 48 ผ่าน · เทสไม่พึ่ง DB และไม่พึ่ง three.js · diff(a,a)=[] · เหตุการณ์ 3 ชนิด · >20 เหตุการณ์/รอบ · ตัวกรองค่าแปลกปลอมถูกทิ้ง | TODO |
| S-7 | ฉาก 3D: ผนัง+ป้ายชื่อร้าน · ประตู · เลานจ์ 24 ที่นั่ง · โต๊ะ 4 ชนิด · ลูกค้ายืนแถวเดียว 3 คน + "+N" · เกินเวลาตอบ (แดง วงกะพริบ ไอคอน tabler) · เดินเข้า/ไปโต๊ะ/ออก · asset CC0 (KayKit Adventurers/Furniture Bits, Kenney) · ป้ายเป็น DOM overlay Anuphan · หยุดวาด/polling เมื่อแท็บซ่อน · reduced-motion | AC-CD-33, 37, 46, 47, 50, 53, 54 ผ่าน · ทะเบียน asset ไม่มี Mixamo/Quaternius · บล็อก `.glb` แล้วเห็นแคปซูลฉากไม่ล้ม · `rg` emoji = 0 · bundle ไม่มี chunk three ใน route อื่น · เทสสแกนซอร์ส `import three` เฉพาะใต้โฟลเดอร์หน้านี้ | TODO |
| S-8 | เปลือกหน้า (Paces): การ์ดซ้าย (นาฬิกาสด ภาพรวม แชทตามช่องทางแบบแถบสัดส่วน ความเคลื่อนไหวล่าสุด) · legend · แถบเครื่องมือ (หมุนกลับ ซูม ตัวกรอง ซ่อน/แสดงตัวเลข เต็มจอ) · ตัวสลับร้าน | commit UI ทุกตัวมี `Base: theme/...` · `rg "react-toastify" "src/app/(paces)/"` = 0 · ไม่มี arbitrary Tailwind ที่ไม่มีคอมเมนต์กำกับ (HR7) · `rg` อักษร emoji = 0 · คำว่า "ออกจากฉาก" (ไม่ใช่ "ปิดงาน") ในการ์ดความเคลื่อนไหว (BR-CD-26) · AC-CD-51 | TODO |
| S-9 | แผงอ่านอย่างเดียว: คลิกแอดมิน = แผงข้อมูล + แชทในมือ · คลิกลูกค้า = กล่องแชท 30 ข้อความ ไม่แตะสถานะอ่านแล้ว + "เปิดในหน้าข้อความ" (`LinkButton`) | AC-CD-39..44 ผ่าน · เทสสแกนซอร์สทุกไฟล์ใต้ `src/app/api/chat-desk/**` export เฉพาะ `GET` · `shopLastReadAt` ก่อน-หลังเท่ากัน · เทสสแกนว่าไม่มี `markRead`/`sendSenderAction` · component ไม่มี textarea/ปุ่มส่ง · ห้องร้านอื่น = 404 | TODO |
| S-10 | ตัวกรองเพจ/แพลตฟอร์ม/แอดมิน ใน URL ฉาก ตัวเลข การ์ดช่องทาง ความเคลื่อนไหวกรองตามกัน เลานจ์กรองตามเพจ/แพลตฟอร์มเท่านั้น (ไม่ใช่ของแอดมินคนใด) | AC-CD-48, 49 ผ่าน · รีเฟรชแล้วตัวกรองยังอยู่ (E2E) · id นอกขอบเขตถูกทิ้งและ server ไม่คืนข้อมูลเพิ่ม | TODO |
| S-11 | ตัวเร่งดึงใหม่: ใช้ `subscribeShopChat()` ของ `chat-shop-realtime.ts` (ไม่แก้ไฟล์นั้น) + polling 8 วินาที (ช่วง 5-10) + debounce >= 2 วินาที | AC-CD-32..34 ผ่าน · fake timers · ยิง signal 5 ครั้งใน 1 วินาที = fetch 1 ครั้ง · `git diff` ของ `chat-shop-realtime.ts` = 0 | TODO |
| S-12 | โหมด 2D + มือถือ: `DeskList2D` ข้อมูลเท่า 3D · error boundary เมื่อไม่มี WebGL/ฉากล้ม · มือถือ <768px ตามคำตอบ Q-1 · พื้นที่แตะ >= 44px | AC-CD-45, 52 ผ่าน · E2E ปิด WebGL เห็นตัวเลขและรายชื่อครบ · E2E 3 จอ | TODO |
| S-13 | QA และ gate ของ UI: `safepay-ux` Design Spec ก่อน build (มี `### Impeccable compliance`) · `/impeccable critique` + `clarify` ก่อน mark complete · browser E2E 3 จอ และ user เห็นภาพ 3 จอก่อน merge · reviewer grep HR5/7/9/12 · เทส DB ใช้ localhost:5434 เท่านั้น | ผล critique/clarify แนบ · ภาพ 3 จอ (มีข้อมูลจริง และ ร้านไม่มีแอดมินในระบบ) แนบใน PR · บันทึกอนุมัติภาพของ user ใน Change Log · `npm test` override `DATABASE_URL` เป็น 5434 (HR13/14) | TODO |
| S-14 | ไม่มี schema change และไม่กระทบสิ่งอื่น (regression) | `git diff --stat main -- prisma/` = 0 ไฟล์ · `src/app/api/chat/**`, `src/services/chat.service.ts`, `src/lib/agent-performance*.ts`, `src/lib/agent-sla.ts`, `src/lib/chat-shop-realtime.ts` ไม่ถูกแก้ ยกเว้นที่ SDS ระบุเหตุผล (เพิ่ม export เท่านั้น) · เทสชุดเดิมผ่านเท่าก่อนเริ่ม · `tsc` + build exit 0 (ตัดสินด้วย exit code) · tracker presence ไม่เปลี่ยนพฤติกรรมเดิมของหน้าแชท | TODO |
| S-15 | sync เอกสาร: `docs/SRS.md` API reference (snapshot, preview, ออกคีย์ presence) · snapshot ใน `docs/claude/state-snapshots.md` + บรรทัดเดียวใน CLAUDE.md | diff เอกสารมีครบ · ไม่มีข้อความขัดกับ BRD §9 | TODO |
| S-16 | sign-off phase: ผล QA ครบ · retro ปลาย phase (HR4) · roadmap รอบ 2 ที่ user อนุมัติ | ทุก S-id DONE พร้อมหลักฐาน · retro อยู่ใน `docs/retro/` | TODO |

## Out-of-Scope
> แตะของในนี้ = CREEP (hard block) ถ้าจำเป็นต้องทำ Controller ตัดสิน + ย้ายขึ้น In-Scope พร้อมจด Change Log

| ID | รายการ | เหตุผล / ย้ายไป |
|----|--------|----------------|
| OOS-1 | แผง "ตกแต่งห้อง" ทั้งหมด: แบบสำเร็จรูป · สีผนัง · ของแต่ง · ตัวละครเลือกได้ · ธีมตามประเภทร้าน · พื้นห้องรายทีม · โลโก้ร้านบนผนัง | มติ 3 · รอบ 2 (ต้องมีที่เก็บค่าและ migration) |
| OOS-2 | สัญญาณสดฝั่งแอดมิน: ป้ายกำลังพิมพ์ · เส้นแอดมินไปลูกค้า · ฟองขาออก · "กำลังคุยกับใคร" จากสาย SSE | มติ 5 · รอบ 2 (ต้องมี channel สัญญาณใหม่) |
| OOS-3 | ระบบมอบแชท / ทีม / คิว / โซนทีม / ป้ายโซน / กรองตามทีม | มติ 1 · รอบ 2 เมื่อ 00071 และระบบมอบแชทมา |
| OOS-4 | เปิดให้ ADMIN หรือบทบาทอื่น (รวมบทบาทใหม่ของ 00071) | มติ 6 · ตัดสินตอน 00071 |
| OOS-5 | การเขียนจากฉาก: ตอบ มอบ ย้าย ปิดงาน ติดดาว ซ่อน | หน้าอ่านอย่างเดียว (AC-CD-39) |
| OOS-6 | schema / migration / enum / ตารางหรือคอลัมน์ใหม่ใด ๆ รวม `desk_settings` | มติ 3 (AC-CD-55) |
| OOS-7 | SSE / WebSocket / channel realtime ใหม่ · การเปลี่ยน polling 20 วินาทีของ inbox เดิม | ใช้ polling + broadcast เดิม |
| OOS-8 | asset จาก Mixamo / Quaternius หรือใบอนุญาตที่ไม่ใช่ CC0 | NFR-CD-10 |
| OOS-9 | แก้นิยาม/สูตรของ 00059 (`agent-performance*.ts`, `agent-sla.ts`) หรือสูตรตัวเลขใหม่ที่ซ้ำกับของเดิม | HR16 |
| OOS-10 | แก้ระบบแชทเดิม: สถานะอ่านแล้ว · inbox · การส่ง seen/sender action · `chat.service.ts` · การเรียกลำดับห้อง | โต๊ะแชทเป็นผู้อ่านเท่านั้น (S-14) |
| OOS-11 | ย้อนดูฉากย้อนหลัง (replay) · เก็บประวัติ snapshot | ไม่มีที่เก็บ |
| OOS-12 | เสียง/การแจ้งเตือนเมื่อมีลูกค้ารอเกินเวลา · ส่งต่อไป LINE/อีเมล | นอกขอบเขต |
| OOS-13 | แอป DeepSellerApp / ฝั่งผู้ซื้อ (`(marketing)/**`) / `(paces)/admin/**` | อยู่นอกขอบเขต |
| OOS-14 | ฉากรวมหลายร้านในฉากเดียว · ตัวเลขเฉลี่ยข้ามร้าน | Q-4 (ทีละร้าน) |
| OOS-15 | หลายภาษา (00047) | คงไทย |
| OOS-16 | นับ "ออนไลน์" จากแหล่งนอกเหนือ Presence (เช่น last-seen ในฐานข้อมูล) | มติ 4 · ไม่แตะ schema |
| OOS-17 | Meta AI แบบแยกต่อเพจ (รอบนี้เป็นโต๊ะเดียวต่อร้าน) และการยืนยันว่า `viaStandby` เป็น AI จริง | รอบ 2 / ต้องมีสัญญาณที่แยกได้ |

## Assumptions
- ใช้ค่าแนะนำใน PRD §10 ถ้า user ไม่ตอบ และจดใน Change Log
- ฉากแสดงทีละร้านพร้อมตัวสลับร้าน ร้าน PERSONAL ที่ผู้ดูเป็นเจ้าของเปิดได้ โต๊ะ Meta AI เป็นโต๊ะเดียวต่อร้าน เลานจ์ 24 ที่นั่ง (ยกจากต้นแบบ)
- `resolveChatScope().shopIds` ไม่มี role ต่อร้าน (ตรวจ `src/lib/chat-scope.ts`, `src/lib/shop-context.ts`) จึงต้องเพิ่ม query role ใน `resolveOwnerDeskScope`
- ไม่มี Presence ในหน้าแชทอยู่เดิม (`useAuctionPresence` เป็นของประมูล key ต่อแท็บ ใช้ตรง ๆ ไม่ได้) ต้องมี tracker ใหม่ในหน้าแชท
- นิยามเดิมของ 00059 นับเฉพาะคำตอบที่ระบุตัวคนได้ (prod 22%) ไม่มีนิยาม "ปิดงานวันนี้" เดิม (ตรวจ `agent-performance.ts` และ `agent-performance.service.ts`)
- ข้อมูล prod 7 วัน (ตอบนอก Deep 6,714 / viaStandby 1,194 / คนระบุตัวได้ 2,188 / บอท 0) เป็นข้อเท็จจริง ณ 2026-10-16 ที่ SELECT แล้ว
- บรรทัดระบบ `AUTO_ORDER_RESULT` ไม่แตะ `lastSenderRole`/`lastMessageAt` (AC-ACO-61 ของ 00061) จึงใช้ `lastSenderRole` ตัดสินรอคำตอบได้ แต่ต้องกรองบรรทัดระบบตอนหาข้อความฝั่งร้านล่าสุด
- ฐาน dev/QA ใช้ localhost เท่านั้น ห้ามชี้ prod (HR13/14/15) ไม่มี migration
- ไฟล์แชทที่มีงานค้างใน working tree ขณะร่างเอกสาร (`InboxList.tsx`, `CustomerPanel.tsx`, `inbox/[conversationId]/page.tsx`, `ShipmentDraftPanel.tsx`, `chat-sound.ts`) เป็นของงานอื่น งานนี้ไม่แตะนอกจากที่ S-3 ระบุ
- เลขฟีเจอร์ 00077 ยังไม่ชน (Controller ยืนยันก่อน commit)

## Deferred → Phase 2
> ของที่จงใจไม่ทำใน phase นี้ ไม่นับเป็น GAP ตอน audit/sign-off

- ตกแต่งห้อง ทั้งชุด (OOS-1) พร้อมที่เก็บค่าและ migration
- สัญญาณสดฝั่งแอดมิน (OOS-2)
- โซนทีม/คิว/กรองตามทีม (OOS-3) หลัง 00071 และระบบมอบแชท
- เปิดให้บทบาทอื่น (OOS-4)
- Meta AI แยกต่อเพจ (OOS-17)
- เสียง/แจ้งเตือนเมื่อรอเกินเวลา (OOS-12)

## Change Log
> ทุกครั้งที่ Controller อนุมัติแก้ scope (รับเข้า/เลื่อนออก) จดที่นี่ กัน creep เงียบ

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-10-16 | baseline สร้างตามมติ user 6 ข้อ (OWNER-only · ไม่มีทีม/คิว · ตัดตกแต่งห้อง · Presence · ไม่มีสัญญาณสด · ยกเว้น HR1 เฉพาะฉาก) | - | - |
| 2026-10-16 | ปิด Q-1..Q-5 ตามค่าแนะนำ: มือถือ <768px ค่าตั้งต้น 2D มีปุ่มเปิด 3D · ปิดงานวันนี้ = `resolvedAt` ตั้งแต่ 00:00 ไทยและยังปิด · ตัวเลขเวลาใช้สูตร 00059 + ป้ายนับไม่ครบ · ฉากทีละร้าน · แท็บเบื้องหลังนับออนไลน์ · PRD+BRD อนุมัติ (S-1 ส่วนเอกสารต้นทาง) | user ตอบ "ลุยต่อเลย" | user |

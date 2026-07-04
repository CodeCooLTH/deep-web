# Scope Baseline — feat 00011 Deep Chat

สถานะ: ACTIVE (Gate 0 — รอ Controller review + commit)
อ้างอิง: `docs/20 - Features/00011 - Deep Chat/{PRD,BRD}.md` — PRD/BRD FR-CHAT-01..12, BR-CHAT-01..12
· spec: `docs/superpowers/specs/2026-07-03-deep-chat-design.md` (decision D1-D7 ล็อกแล้ว, APPROVED)
เจ้าของ scope: `safepay-product` · commit/สถานะ: Controller

## หมายเหตุก่อนเริ่ม build

เอกสารนี้เป็น **Scope Baseline ระดับ implementation** ที่ตั้งไว้ล่วงหน้าตาม Design Spec §3-§5 — ยังไม่ผ่าน SRS/SDS/DATABASE/API/Tests (Hard Rule 11 documentation-first) ก่อนเข้า `agent-team-phase` build จริง **ต้องมี SRS/SDS/DATABASE/API/Tests ครบก่อน** (owner: safepay-planner/safepay-database/safepay-qa ตามลำดับ) — S-id ด้านล่างเป็น scope ที่ product เจ้าของ ไม่ใช่ไฟล์ path ที่ final 100% (SDS จะ confirm path จริงอีกครั้ง)

## Goal

ส่ง Deep Chat (in-app chat แบบ shop-anchored, buyer-initiate, TEXT+IMAGE, realtime) ขึ้นใช้งานจริง — buyer เว็บ (Vuexy `/messages`) + seller เว็บ (Paces `/inbox`) + เปิดปุ่ม Chat บนโปรไฟล์สาธารณะ `/u/[username]` ที่เคย disabled — **โดยไม่ regress หน้า `/u/[username]`, notification bell เดิม, และ core order/product/auth flow**

---

## Batch Plan (ลำดับบังคับ — ≤3 concurrent, independent=คนละไฟล์)

| Batch | S-id | เหตุผล |
|---|---|---|
| **0 — Foundation (blocking, solo)** | S-1 | schema + type + validation เป็นฐานทุก batch ถัดไป |
| **1 — Service core** | S-2 | `chat.service.ts` เดี่ยว (ทุก fn อยู่ไฟล์เดียว ตาม design spec §4) พึ่ง S-1 |
| **2 — Routes** | S-3, S-4, S-5 | คนละ route file พึ่ง S-2 — parallel ได้ |
| **3 — Realtime + Notification wiring** | S-6, S-7 | S-6 พึ่ง S-2 (broadcast), S-7 พึ่ง S-2 (Notification insert) — คนละไฟล์ |
| **4 — Profile integration (solo, เสี่ยง regression)** | S-8 | แตะหน้า `/u/[username]` ที่ sign-off แล้ว — ทำเดี่ยว |
| **5 — UI ชุด 1 buyer (ux ก่อน)** | S-9, S-10 | Vuexy inbox+thread คนละไฟล์ |
| **6 — UI ชุด 2 seller (ux ก่อน)** | S-11, S-12, S-13 | Paces inbox+thread+menu badge คนละไฟล์ |
| **7 — Tests + Regression (blocking)** | S-14, S-15 | S-15 ต้อง PASS ก่อน merge |

🛑 **CHECKPOINT (ไม่ใช่ S-id) — APPLY migration ลง DB:** S-1 เขียน migration file ได้ทันที (ไม่แตะ DB) แต่ `prisma migrate deploy` จริง (Supabase dev=prod แชร์) **ต้องขอ user ยืนยันก่อนเสมอ** — ตาม `docs/conventions/prisma-shared-db-drift.md`. Batch 1 เขียนโค้ด + tsc ได้หลัง `prisma generate` แต่ QA/runtime กับ DB ต้องรอ apply.

---

## In-Scope

| ID | รายการ | Acceptance (ทดสอบได้ — อิง FR/BR) | สถานะ |
|----|--------|----------------------------------|-------|
| **S-1** | Schema + Migration — `Conversation`, `ChatMessage` model (additive), back-relation `User.buyerConversations`/`User.sentChatMessages`, `Shop.conversations`; `src/lib/validations.ts` เพิ่ม chat schema (send message/pagination) | Prisma migrate deploy สำเร็จไม่กระทบ table เดิม; `@@unique([buyerUserId, shopId])` บังคับ 1 conversation/คู่ (FR-CHAT-01-AC-02, BR-CHAT-02) | TODO |
| **S-2** | `src/services/chat.service.ts` — `getOrCreateConversation`, `listConversationsForShop`, `listConversationsForBuyer`, `getMessages`, `sendMessage` (tx: insert message+update denorm+create Notification), `markRead`, `getUnreadCountForShop` — ทุก fn ตรวจ ownership | Unit test: getOrCreate ไม่สร้างซ้ำ (FR-CHAT-01-AC-02); sendMessage อัปเดต denorm ใน tx เดียว (BRD §6.1); ownership guard block cross-shop access (FR-CHAT-03-AC-01, Scenario 5 BRD) | TODO |
| **S-3** | `POST /api/chat/conversations` (start/get by shopId) + `GET /api/chat/conversations` (inbox, role จาก subdomain/session) | login required 401 ถ้าไม่มี session (FR-CHAT-01-AC-04, BR-CHAT-01); คืนเฉพาะ conversation ของ session user (FR-CHAT-07-AC-01/FR-CHAT-09-AC-01) | TODO |
| **S-4** | `GET /api/chat/conversations/[id]/messages` (cursor pagination) + `POST /api/chat/conversations/[id]/messages` (send — Valibot validate, rate-limit) | ownership 403 cross-shop/cross-buyer (FR-CHAT-03-AC-01); length/type/rate-limit reject ถูกต้อง (FR-CHAT-04-AC-02, FR-CHAT-05-AC-02, FR-CHAT-06-AC-01) | TODO |
| **S-5** | `POST /api/chat/conversations/[id]/read` (mark read) + reuse image upload route เดิม สำหรับ IMAGE message | mark read อัปเดต `buyerLastReadAt`/`shopLastReadAt` ถูกฝั่ง (FR-CHAT-08-AC-03/FR-CHAT-10-AC-03); upload รูปผ่านเงื่อนไขเดียวกับระบบเดิม (FR-CHAT-05-AC-01) | TODO |
| **S-6** | Realtime wiring — server broadcast บน insert message (`chat:{conversationId}` channel, reuse `src/lib/supabase-browser.ts` pattern จาก `src/hooks/useAuctionPresence.ts`) | ข้อความปรากฏฝั่งตรงข้ามโดยไม่รีเฟรชเมื่อทั้งสองฝ่ายเปิดหน้าค้าง (FR-CHAT-08-AC-02) — วัดด้วย 2-browser E2E | TODO |
| **S-7** | Notification wiring — insert `Notification` (`kind="chat_message"`, `refId=conversationId`) เมื่อผู้รับไม่อยู่ในห้อง; seller ที่เปิด dashboard ได้ `pacesToast.chat.*` เพิ่ม | Notification สร้างถูกเงื่อนไข offline-recipient เท่านั้น (FR-CHAT-11-AC-01); toast ผ่าน `pacesToast` เท่านั้น ไม่มี `react-toastify`/`alert()` ใน `(paces)/**` (FR-CHAT-10-AC-04, Hard Rule 9) | TODO |
| **S-8** | เปิดปุ่ม Chat บน `src/app/(marketing)/u/[username]/` (เดิม disabled placeholder) — login-gate + redirect returnUrl + เรียก S-3 | คลิกแล้วเข้า/สร้าง conversation ถูกต้อง (FR-CHAT-12-AC-01); ปุ่ม Follow ยัง disabled เดิม (FR-CHAT-12-AC-02); ส่วนอื่นของหน้าไม่เปลี่ยน (FR-CHAT-12-AC-03) — regression screenshot เทียบก่อน/หลัง | TODO |
| **S-9** [UI] | Buyer Inbox — copy `theme/vuexy/.../views/apps/chat/SidebarLeft.tsx` → `src/app/(marketing)/(buyer-app)/messages/page.tsx` | list เรียง `lastMessageAt`, unread state ถูกต้อง (FR-CHAT-07-AC-01..03); ผ่าน safepay-ux ก่อน (Hard Rule 8) | TODO |
| **S-10** [UI] | Buyer Thread — copy `ChatContent.tsx`/`SendMsgForm.tsx` → `src/app/(marketing)/(buyer-app)/messages/[shopId]/` + client component | ส่ง/รับ realtime ถูกต้อง, mark-read ทำงาน (FR-CHAT-08-AC-01..03); ผ่าน safepay-ux ก่อน | TODO |
| **S-11** [UI] | Seller Inbox — `src/app/(paces)/seller/(dashboard)/inbox/page.tsx` (Paces primitive, source จาก `theme/paces/Docs/index.html` + `paces-component-reference.md`) | list เรียง + unread ถูกต้อง (FR-CHAT-09-AC-01..03); ไม่มี arbitrary Tailwind value (Hard Rule 7); ผ่าน safepay-ux ก่อน | TODO |
| **S-12** [UI] | Seller Thread — `src/app/(paces)/seller/(dashboard)/inbox/[conversationId]/page.tsx` + component | ส่ง/รับ realtime + mark-read ถูกต้อง (FR-CHAT-10-AC-01..04); toast=`pacesToast`; ผ่าน safepay-ux ก่อน | TODO |
| **S-13** [UI] | Seller menu unread badge — `src/app/(paces)/seller/(dashboard)/_seller-menu.ts` เพิ่มรายการ "ข้อความ" + badge count (pattern เดียวกับ `applyInventoryGate`) | badge จำนวนตรงกับ `getUnreadCountForShop` (FR-CHAT-09-AC-02); Shop ที่ไม่มี conversation ไม่เห็น badge (FR-CHAT-09-AC-03) | TODO |
| **S-14** | Unit + service-integration test specs (Vitest) — ownership guard, unique constraint, tx denorm correctness, rate-limit | ครอบ FR-CHAT-01..03, FR-CHAT-04..06 ระดับ service/route | TODO |
| **S-15** | 🛑 Regression Gate (BLOCKING) — Playwright E2E เต็มชุดที่แตะ `/u/[username]`, notification bell, seller dashboard เดิม + E2E ใหม่ของ chat (2-session realtime) | `npm run e2e` PASS 100% รวม regression ของหน้าที่ S-8 แตะ; ไม่มี CREEP บน OOS ด้านล่าง | TODO |

---

## Breaking-Signature Sync Map

ไม่มีจุด breaking-signature ข้าม batch ในรอบนี้ (Deep Chat เป็น additive ทั้งหมด ไม่แก้ signature ของ service/route เดิม) — ยกเว้น **S-8 แตะไฟล์ page ของ `/u/[username]` ที่ sign-off แล้ว** ต้องทำเดี่ยว (ดู Batch 4) และผ่าน regression S-15 ก่อน merge เสมอ

## UI Gate (Hard Rule 8 — mandatory)

S-9, S-10, S-11, S-12, S-13 ต้องผ่าน `safepay-ux` Design Spec **ก่อน** developer เสมอ — buyer (S-9/S-10) อิง Vuexy docs `theme/vuexy/documentation.html`; seller (S-11/S-12/S-13) อิง Paces docs `theme/paces/Docs/index.html` + `docs/system/ui-guideline/paces-component-reference.md`. ห้าม arbitrary Tailwind value ใน `(paces)/**` (Hard Rule 7); toast=`pacesToast` เท่านั้นใน `(paces)/**` (Hard Rule 9); ห้าม emoji ทุกจุด (Hard Rule 12) — icon ที่ spec ไม่ระบุต้องถาม user ก่อน

## 🛑 Regression Gate (Blocking ก่อน merge/sign-off)

S-8 แก้หน้า `/u/[username]` (redesign 2026-05-23, SIGNED-OFF, live prod) = ต้องเฝ้าระวัง. ก่อน merge S-15 ต้อง:
1. Visual/E2E เทียบหน้า `/u/[username]` ก่อน/หลัง (trust banner, badge, product grid, avg rating ไม่เปลี่ยน)
2. `npm run e2e` เต็มชุดรวม suite เดิม PASS 100%
3. Notification bell เดิม (auction/order kind) ยังทำงานถูกต้องหลังเพิ่ม `kind="chat_message"`

FAIL แม้ 1 ข้อ = BLOCKED

---

## Out-of-Scope (แตะ = CREEP)

OOS-1 mobile app `/api/app/chat/*` + push notification · OOS-2 order/product deep-linked context card ในบทสนทนา (**PARTIAL-CLOSED 2026-07-04** โดย ext `_extensions/product-context-card.md` — product card เฉพาะ buyer-initiate ทำแล้ว S-16..S-21; order card ยัง OOS) · OOS-3 Business member routing (ตอบแทนเจ้าของร้าน) · OOS-4 typing indicator · OOS-5 per-message read receipt · OOS-6 seller-initiated/broadcast message · OOS-7 scam-link detection (**CLOSED 2026-07-04** โดย ext `_extensions/scam-link-detection.md` S-28..S-33) · OOS-8 response-rate/response-time trust metric (**CLOSED 2026-07-04** โดย ext `_extensions/response-rate-metric.md` S-22..S-26) · OOS-9 voice message/multi-image/file attachment อื่นนอกเหนือ 1 รูป · OOS-10 block/report ผู้ใช้ในบทสนทนา (`blockedByBuyer`/`blockedByShop` field) · OOS-11 Follow system · OOS-12 admin เข้าถึง/moderate เนื้อหาบทสนทนา · OOS-13 แก้ logic หน้า `/u/[username]` ส่วนอื่นนอกจากปุ่ม Chat (trust banner/badge/product grid/rating คงเดิม)

## Assumptions

- Migration apply = checkpoint แยก ต้องขอ user ยืนยันก่อนเสมอ (dev=prod Supabase แชร์)
- OD-CHAT-A (block/report) = defer Phase 2 ตามที่ PRD §9.2/BRD §10 ตั้งไว้ — ถ้า Controller ต้องการรวม MVP ต้องเปิด Change Log ใหม่ + เพิ่ม S-id
- ไม่มี HTML mockup แยก — UI ใหม่ผ่าน `safepay-ux` ตามปกติ (ไม่ใช่ visual-heavy landing page)
- Seller = เจ้าของร้านเดี่ยว (`Shop.userId`) เท่านั้น แม้มี feature 00008 (ShopMember) อยู่แล้วในระบบ — ไม่ query/เช็ค ShopMember ใน MVP นี้
- SRS/SDS/DATABASE/API/Tests ยังไม่ออก ณ วันที่ baseline นี้ถูกร่าง — S-id ด้านบนเป็น scope-level ไม่ใช่ file-path final 100% (ต้อง sync กับ SDS ก่อนเข้า batch 0 จริง)

## Deferred → Phase 2 (ไม่นับ GAP)

Mobile chat + push · Order/product context card · Business member routing · Typing indicator · Per-message read receipt · Seller-initiated/broadcast · Scam-link detection · Response-rate trust metric · Block/report user · Follow system

## Change Log

| วันที่ | การเปลี่ยน | เหตุผล | ใครอนุมัติ |
|--------|-----------|--------|-----------|
| 2026-07-03 | baseline สร้าง | Documentation-First (Hard Rule 11) — จาก PRD/BRD 00011 | safepay-product |

# Deep Chat (feat 00011) — Design Spec (MVP)

วันที่: 2026-07-03 · สถานะ: **APPROVED** (user "ทำให้จบเลย" 2026-07-03) · owner: safepay-product (docs-first ต่อ)
เลข feature: **00011** (collision-check `git log --all` — 00007=Auction Bidding, 00010=Variant reserved; 00011 free)

## 1. ปัญหา & เป้าหมาย
Deep เป็นแพลตฟอร์ม trust สำหรับ social-commerce ไทย (ขายผ่าน FB/LINE/IG). ปุ่ม "Chat" บน public profile `/u/[username]` ยัง disabled "เร็ว ๆ นี้" (Phase 2 ตั้งแต่ 2026-05-23). ผู้ซื้อยังต้องหนีไปคุยใน FB/LINE ของ seller → หลุด context trust/order ของ Deep. **เป้าหมาย MVP:** buyer ทัก seller ในแอปได้ (pre-purchase inquiry) → seller ตอบจาก dashboard → บทสนทนาอยู่ใน Deep, ต่อยอด trust loop (response-rate metric = Phase 2).

## 2. Decision Log (ล็อกแล้ว)
| # | Decision | ค่า |
|---|---|---|
| D1 | Anchor | **Shop-anchored** — 1 conversation ต่อ (buyerUserId, shopId) |
| D2 | Surface MVP | **Web buyer (Vuexy) + seller (Paces)** — mobile app `/api/app/*` + push = Phase 2 |
| D3 | Identity | **Buyer ต้อง login** — ไม่มี guest chat; ปุ่ม Chat ยังไม่ login → redirect sign-in (returnUrl) |
| D4 | Message types | **TEXT + IMAGE เดียว/ข้อความ** (reuse `lib/storage`) — cap length/size |
| D5 | Realtime | **Supabase Realtime broadcast-from-DB** (reuse auction pattern `supabase-browser.ts`) + fallback fetch-on-focus |
| D6 | Seller side | **เจ้าของร้าน (Shop.userId) อ่าน/ตอบ** — Business member routing = Phase 2 |
| D7 | Initiation | **Buyer initiate เท่านั้น** — seller ทักหา buyer ที่ไม่เคยคุยก่อนไม่ได้ (anti-spam) |

## 3. Data Model (additive Prisma — ไม่แตะ model เดิม)
```
model Conversation {
  id                 String   @id @default(uuid())
  buyerUserId        String
  shopId             String
  lastMessageAt      DateTime @default(now())
  lastMessagePreview String?  // denormalized snippet สำหรับ inbox list (ไม่ต้อง join message)
  lastSenderRole     String?  // "BUYER" | "SHOP" — สำหรับ inbox "คุณ: ..." prefix
  buyerLastReadAt    DateTime?
  shopLastReadAt     DateTime?
  createdAt          DateTime @default(now())
  buyer    User @relation("BuyerConversations", fields: [buyerUserId], references: [id], onDelete: Cascade)
  shop     Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
  messages ChatMessage[]
  @@unique([buyerUserId, shopId])       // 1 conversation ต่อคู่
  @@index([shopId, lastMessageAt])       // seller inbox: list by recency
  @@index([buyerUserId, lastMessageAt])  // buyer inbox
}
model ChatMessage {
  id             String   @id @default(uuid())
  conversationId String
  senderUserId   String
  senderRole     String   // "BUYER" | "SHOP" (derive จาก conversation ตอนส่ง — snapshot กัน role drift)
  type           String   @default("TEXT") // "TEXT" | "IMAGE"
  body           String?  // TEXT content หรือ caption
  imageUrl       String?  // IMAGE เท่านั้น
  createdAt      DateTime @default(now())
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation("SentChatMessages", fields: [senderUserId], references: [id], onDelete: Cascade)
  @@index([conversationId, createdAt])   // thread pagination (cursor)
}
```
- reuse `Notification` — `kind="chat_message"`, `refId=conversationId`, สำหรับ notify recipient ที่ไม่ได้อยู่ในห้อง (Phase 2 push ผ่าน PushToken)
- back-relations เพิ่มบน `User` (BuyerConversations, SentChatMessages) + `Shop` (conversations)

## 4. Architecture / Units
- **`chat.service.ts`** (ใหม่) — `getOrCreateConversation(buyerUserId, shopId)`, `listConversationsForShop(shopId, cursor)`, `listConversationsForBuyer(buyerUserId, cursor)`, `getMessages(conversationId, cursor)`, `sendMessage({conversationId, senderUserId, senderRole, type, body, imageUrl})` (tx: insert message + update conversation denorm + create Notification), `markRead(conversationId, role)`, `getUnreadCountForShop(shopId)`. Authz: ทุก fn ตรวจ participant ownership (buyerUserId ตรง session หรือ shopId เป็นของ session user).
- **Routes** (`/api/chat/*`): `POST /conversations` (start/get by shopId), `GET /conversations` (inbox — role จาก subdomain/session), `GET /conversations/[id]/messages` (cursor), `POST /conversations/[id]/messages` (send — Valibot validate, rate-limit), `POST /conversations/[id]/read`. + reuse image upload route pattern เดิม.
- **Realtime:** insert message → server broadcast บน channel `chat:{conversationId}` → client 2 ฝั่ง subscribe (reuse `supabase-browser.ts` pattern จาก `useAuctionPresence`). ไม่มี broadcast = fallback fetch ตอน focus.
- **Notification:** recipient ไม่ online ในห้องนั้น → `Notification` row (seller เห็นใน bell + pacesToast.chat bottom-right ถ้าเปิด dashboard; buyer เห็นใน Vuexy notification).

## 5. UI (HR1 theme-copy + HR8 safepay-ux gate บังคับ)
- **Buyer (Vuexy):** copy `theme/vuexy/typescript-version/full-version/src/views/apps/chat/` (SidebarLeft=inbox list, ChatContent=thread, SendMsgForm) → `/messages` (inbox) + `/messages/[shopId]` (thread). เปิดปุ่ม Chat บน `/u/[username]` (เดิม disabled) → `/messages/[shopId]`.
- **Seller (Paces):** `/inbox` + thread — **safepay-ux ต้อง source จาก Paces docs** (`theme/paces/Docs/index.html` + `paces-component-reference.md`) เพราะ Paces ไม่มี MUI. unread badge บนเมนู seller. toast = `pacesToast.chat` (HR9). ไม่มี emoji (HR12).
- HTML mockup แยก (per convention [[feedback_spec_html_mockup]]) = ออกใน UX Design Spec phase (safepay-ux)

## 6. Safety (MVP-light)
Rate-limit send (per-user, reuse `api-rate-limit.ts`) · length cap (เช่น 2000 ตัวอักษร) · image size/type cap · block conversation (flag `blockedByBuyer`/`blockedByShop` — **ถ้าทำใน MVP** เพิ่ม 2 field; หรือ defer). **Report + scam-link detection = Phase 2.**

## 7. Out-of-scope → Phase 2
Mobile app `/api/app/chat/*` + push · order/product deep-linked context card · Business member routing · typing indicator · per-message read receipt · seller-initiated/broadcast · scam-link detection · **response-rate/response-time trust metric** (แต่ schema เก็บ timestamp ครบให้คำนวณย้อนได้) · voice/file/multi-image

## 8. Risks
- **Realtime บน Vercel serverless:** broadcast client-side ผ่าน Supabase (ไม่ผ่าน server socket) — เหมือน auction ที่ทำได้แล้ว. known-gap เดียวกับ auction.
- **2 UI worlds:** buyer Vuexy + seller Paces = ต้อง build thread UI 2 ชุด (คนละ theme) — safepay-ux ทำ spec 2 ฝั่ง.
- **Shared DB drift:** ใช้ migrate deploy + hand-written migration (ห้าม migrate dev — [[project_shared_db_drift_no_migrate_dev]]).

## 9. ขั้นต่อไป (docs-first Hard Rule 11)
PRD/BRD (safepay-product) → SRS/SDS/API (safepay-planner) → DATABASE (safepay-database) → Tests (safepay-qa) → Scope Baseline (Gate 0) → agent-team-phase build → QA → deploy.

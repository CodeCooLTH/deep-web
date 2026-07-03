# UX Design Spec — ChatWidget (floating bubble + panel) — feat 00011 ต่อ

2026-07-03 · safepay-ux · อิง mockup approved (`docs/superpowers/specs/2026-07-03-chat-bubble-widget-mockup.html`)

## Resolved decisions
| # | ค่า |
|---|---|
| Breakpoint (FINDING 1) | **`lg`** (ไม่ใช่ md) — sync shell เดิม (seller VerticalLayout `lg:hidden`, buyer Header `down('lg')`). bubble+panel แสดง `≥lg`; mobile `<lg` = bottom-nav(seller)/bubble-link(buyer) |
| Buyer thread reuse | **reuse `messages/[shopId]/ChatThread.tsx` ตรง** (ไม่มี header/fixed-height ของตัว → mount ใน panel ได้เลย, prop `{shopId,shopName,shopLogo}`) |
| Seller thread reuse (coupling สูง) | **extract `useSellerChatThread(conversationId)` hook** จาก `inbox/[conversationId]/components/ChatThread.tsx` (logic fetch/realtime/send/upload/mark-read) → full-page เดิมเรียก hook คงเดิม + `ChatWidgetThreadPanel.tsx` ใหม่เรียก hook เดียวกัน render `h-full` ไม่มี `.card`/header ซ้ำ |
| List view (2 skin) | **component ใหม่บาง ๆ** (copy row markup จาก `messages/page.tsx`/`inbox/InboxList.tsx` เปลี่ยน Link→button onClick, ตัด `.card` นอก) — logic fetch เรียบง่าย ไม่คุ้ม extract |
| OQ1 seller bottom nav | **5 item + FAB** (คง หน้าหลัก/คำสั่งซื้อ/สินค้า/ร้านค้า + เพิ่ม "แชท") |
| OQ2 ChatToastListener (FINDING 2) | **fix in-scope** — lift `activeConversationId` (widget เปิด thread ไหน) เป็น shared state/ref ที่ layout ให้ ChatToastListener เช็ค dedup (นอกจาก pathname) กัน toast ซ้ำตอน panel เปิด thread เดียวกัน |
| OQ3 panel persist | **persist ข้าม client-nav** (layout ไม่ remount) — เปิดค้างที่เดิม, state (view/activeConversationId) คงในความจำ |
| OQ4 panel header | **สีพื้น primary + text-white** (ตาม mockup อนุมัติ; token-composition HR7-ok) |

## Architecture
`ChatWidget` client component (2 skin), mount ที่ layout (buyer `(buyer-app)/layout.tsx` authed-only; seller `(dashboard)/layout.tsx`):
- **State:** `open`, `view`('list'|'thread'), `activeConversationId`/`activeShopId` — persist ในความจำ
- **Bubble (FAB):** fixed **มุมขวาล่าง**, `≥lg` เท่านั้น, icon `message-circle` + unread **count** badge (ตัวเลข ไม่ใช่ dot; ซ่อนถ้า 0, ≥100="99+")
- **Panel:** header สีพื้น primary (back?+ชื่อ/subtitle + expand + close); body = list ↔ thread; เปิด `placement top-end` (ขึ้นบนจาก bubble)
- **expand:** router.push full page (list→/messages,/inbox; thread→/messages/{shopId},/inbox/{conversationId}) + ปิด panel
- click-away/Esc/close → ปิด (คง state)

## Buyer skin (Vuexy MUI, ม่วง #7367F0 token)
- bubble: `Fab color='primary'` + `Badge badgeContent color='error'` (ตัวเลข)
- panel: `Popper placement='top-end'` + `Fade` + `Paper` + `ClickAwayListener` (Base `NotificationsDropdown.tsx:173-311` — เพิ่ม 2-view + back)
- list: copy row จาก `messages/page.tsx` (Link→button onClick)
- thread: `<ChatThread shopId shopName shopLogo />` reuse ตรง
- mobile `<lg`: bubble เล็กมุมขวาล่าง `router.push('/messages')` (ไม่เปิด panel)
- empty/loading/error: reuse pattern `messages/page.tsx`

## Seller skin (Paces — primitive/token, น้ำเงิน; HR7 no-arbitrary, HR9 pacesToast, HR12 no-emoji)
- bubble: custom `<button bg-primary text-white rounded-full>` (Base `SellerBottomNav.tsx:234-263` center-FAB markup; shadow arbitrary + comment ตาม HR7) + unread badge (Base `.nbadge` L210-226)
- panel: `.card` + header ทับ `bg-primary text-white` (composition token); body p-body
- list: copy row จาก `inbox/InboxList.tsx` (Link→button onClick, ตัด .card นอก); empty=`SellerEmptyState compact icon="message-circle"`
- thread: `ChatWidgetThreadPanel.tsx` เรียก `useSellerChatThread` hook (extract จาก ChatThread เดิม); toast=pacesToast
- **SellerBottomNav:** เพิ่ม item "แชท" (icon message-circle, href /inbox, badge unread bg-danger — copy badge จาก orders item L198-227); grid → 5 item + FAB
- **ChatToastListener:** เพิ่มเช็ค activeConversationId ของ widget (shared) นอกจาก pathname
- mobile `<lg`: ซ่อน bubble (ใช้ bottom-nav แทน)

## Icons (verify มีจริงใน tabler ก่อน commit)
`message-circle`(bubble/nav), `arrow-left`(back), `x`(close), `arrows-maximize`(expand), `paperclip`, `send-2`(seller)/`tabler-send`(buyer)

## States
empty (list): `message-circle` "ยังไม่มีข้อความ" · loading: spinner/skeleton เดิม · error list: "ลองใหม่" · error thread 403/404: SellerErrorState(seller)/inline(buyer)

## Base:
buyer: `NotificationsDropdown.tsx`(Popper+Paper+ClickAway) + `messages/page.tsx`(list row) + `messages/[shopId]/ChatThread.tsx`(reuse) + MUI Fab/Badge
seller: `SellerBottomNav.tsx`(FAB+badge) + `inbox/InboxList.tsx`(list row) + `inbox/[conversationId]/components/ChatThread.tsx`(extract hook) + `SellerEmptyState/ErrorState` + `ChatToastListener.tsx`(fix)

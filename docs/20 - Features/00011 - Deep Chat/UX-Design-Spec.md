# UX Design Spec — Deep Chat (feat 00011)

วันที่: 2026-07-03 · safepay-ux (Hard Rule 8 gate) · buyer=Vuexy, seller=Paces
อ้างอิง: SDS §3.6 theme mapping, SRS TFR-CHAT-07..12. **หมายเหตุแก้ SDS §3.6:** Paces **มี** chat demo จริงที่ `theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/` (SDS เขียนว่าไม่มี — ใช้ตัวนี้เป็น Base seller แทน list/card generic).

## Resolved decisions (Controller)
| # | ประเด็น | ค่าที่ล็อก |
|---|---|---|
| B1 | Data gap: `ConversationSummary` ไม่มี shopName/buyer identity | **route enrich** — `GET /conversations` เพิ่ม query counterparty (buyer role→ shop {shopName,logo}; seller role→ buyer {displayName,avatar}) เป็น field เสริม `counterparty` ต่อรายการ (additive, ไม่แตะ frozen service signature) |
| B2 | Buyer inbox entry point | เพิ่มเมนู `{href:'/messages', label:'ข้อความ', icon:'tabler-message'}` ใน `AccountSidebar.tsx` |
| B3 | Self-chat (buyer เปิดโปรไฟล์ร้านตัวเอง) | ปุ่ม Chat **disabled** เมื่อ `session.user.id === shop.userId` |
| B4 | Buyer sidebar unread badge | skip (นอก scope — S-13 seller เท่านั้น) |
| S1 | เมนู "ข้อความ" seller อยู่กลุ่มไหน | กลุ่ม **CUSTOMERS** |
| S2 | Unread badge สี | **bg-danger** ทั้ง sidenav + list-row (match `SellerBottomNav`/`NotificationDropdown` precedent) |
| S3 | S-7 toast dedup | ใช้ `conversationId` จาก broadcast payload เทียบ `usePathname()` — ถ้าอยู่ใน thread นั้นแล้วไม่ toast ซ้ำ (payload channel `chat:shop` มี conversationId ตาม SRS §7.2) |
| S4 | Mobile bottom nav "ข้อความ" | out of scope MVP (5 slot เต็ม; เข้าผ่าน sidenav) |

---

## BUYER (Vuexy) — S-8, S-9, S-10

### S-8 ปุ่ม Chat `/u/[username]` (`UserProfileHeader.tsx:293-319`)
- ลบ `disabled`+`Tooltip "เร็ว ๆ นี้"` **เฉพาะปุ่ม chat** (Follow/⋯ คงเดิม)
- `ProfileHeaderData` +`shopId: string | null`; `u/[username]/page.tsx` ส่ง `shopId: user.shop?.id ?? null` + ต้องรู้ว่าเป็นร้านตัวเองไหม (B3)
- onClick login-gate (pattern `AuctionBidPanel.tsx:114-121`): ไม่ login → `router.push('/auth/sign-in?callbackUrl='+encodeURIComponent('/messages/'+shopId))`; login → `/messages/{shopId}`
- `shopId===null` หรือ own-shop → ปุ่ม disabled

### S-9 Buyer Inbox `/messages` (client, fetch-based)
- **Base:** `theme/vuexy/.../apps/chat/SidebarLeft.tsx` (renderChat `<li>` L66-122) — ตัด Drawer/search/UserProfileLeft; page shell = `BuyerAppLayout` (เหมือน `/orders`)
- row: Avatar ร้าน (จาก counterparty B1) + ชื่อร้าน + preview (prefix "คุณ: " ถ้า lastSenderRole=BUYER; "ยังไม่มีข้อความ" ถ้า null) + เวลา + unread dot (Box วงกลม 8px `bgcolor:primary.main` — data เป็น boolean ไม่ใช่ count)
- empty state: `CustomAvatar` + `tabler-message-2` "ยังไม่มีข้อความ / เริ่มแชทกับร้านค้าได้จากหน้าโปรไฟล์ร้านค้า" (Base ChatContent.tsx:93-111)
- cursor pagination: sentinel + IntersectionObserver (pattern `AuctionBidHistoryModal.tsx`)
- error: inline + ปุ่มลองใหม่ `tabler-refresh`

### S-10 Buyer Thread `/messages/[shopId]` (RSC shell + client thread)
- **Base:** `ChatLog.tsx` (bubble), `ChatContent.tsx` (header), `SendMsgForm.tsx` (composer)
- RSC fetch shop identity → header (avatar+ชื่อร้าน+back `tabler-arrow-left`); ตัด OptionMenu/phone/video/search
- client mount → `POST /conversations {shopId}` (get-or-create) → `GET .../messages` (reverse ก่อน render) → group date divider (`formatDate` พ.ศ. — **ห้าม theme formatDateToMonthShort**) + bubble (ซ้าย=SHOP `bg-backgroundPaper`, ขวา=BUYER `bg-primary`); **ตัด msgStatus/read-receipt** (ไม่มี per-msg receipt); IMAGE → `<img src="/api/files/{imageUrl}">`
- composer: `TextField` multiline + attach `tabler-paperclip` (`accept=image/jpeg,png,webp`) + send `tabler-send`; **ตัด emoji-mart + microphone**; รูป → preview Chip (onDelete) → `POST /api/upload` → `POST .../messages {type:IMAGE,imageUrl:fileId,body:caption}`
- realtime: subscribe `chat:{conversationId}` (pattern `AuctionDetailClient.tsx:144-179`) signal→refetch newer+markRead debounce; fallback focus/visibilitychange
- optimistic send (append ทันที, fail→ลบ+toast); mark-read on mount
- error copy: 429→"ส่งข้อความเร็วเกินไป กรุณารอสักครู่"; 403/404→full-page "ไม่พบ/ไม่มีสิทธิ์" + กลับ; image fail→"รองรับเฉพาะ JPG/PNG/WEBP ≤5MB"

---

## SELLER (Paces) — S-11, S-12, S-13, S-7

**Base หลัก:** `theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/{ChatPage,ContactList,ChatToolbar,data}.tsx`. Hard Rule 7 (Paces primitive, no arbitrary value), primary น้ำเงิน #236dc9, toast=pacesToast (HR9), no emoji (HR12).

### S-11 Seller Inbox `/inbox`
- header: `SellerMobileHeader` auto (mobile) + `PageBreadcrumb "ข้อความ"` (desktop) — ไม่สร้าง custom
- **Base:** `ContactList.tsx:44-57` row — `card` + `card-body !p-0 divide-y divide-default-200`; แต่ละแถว `<Link href={/inbox/${c.id}}>` avatar buyer (reuse `AuctionBidFeed.tsx:55-79 BidderAvatar` + `generateInitials`) + ชื่อ + preview (`[รูปภาพ]` ถ้า IMAGE; "เริ่มการสนทนาแล้ว" ถ้า null) + `relativeTimeTh` + unread badge (`badge bg-danger text-white text-2xs`, S2) เมื่อ `shopLastReadAt===null || lastMessageAt>shopLastReadAt`
- ตัด search + "เขียนแชทใหม่" (seller ไม่ initiate)
- pagination: sentinel (pattern `NotificationFeed.tsx:242-252`)
- empty: `SellerEmptyState icon="message-circle" title="ยังไม่มีข้อความ"`; error: `SellerErrorState`; loading: เพิ่ม `SellerInboxSkeleton` ใน `SellerCardSkeleton.tsx`

### S-12 Seller Thread `/inbox/[conversationId]`
- **Base:** `ChatPage.tsx:33-110` (header+scroll body+composer) — ตัด sidebar offcanvas/ChatToolbar/online-status
- header (card-header): avatar+ชื่อ buyer; desktop breadcrumb trail=[ข้อความ→/inbox]
- message list: **plain `<div overflow-y-auto>` + ref** (ไม่ใช่ SimpleBar — ต้อง programmatic scroll); bubble ซ้าย=BUYER `bg-light`, ขวา=SHOP `bg-primary/15` (แก้จาก Base `bg-warning/15`/`bg-info/15`); IMAGE `<img max-w-60 rounded>` + caption; timestamp `formatTime` (มี date chip คั่น)
- date divider: badge chip กึ่งกลาง "วันนี้/เมื่อวานนี้/formatDate" (group logic pattern `NotificationFeed.tsx:106-123`)
- load-older: sentinel บนสุด + preserve scroll (capture scrollHeight)
- composer: `ChatPage.tsx:99-109` `input-icon-group` + attach `btn btn-icon paperclip` + send `btn bg-primary text-white` icon `send-2`; auto-upload (pattern `ProductImagesCardV2.tsx:54-90`) → preview chip; placeholder "พิมพ์ข้อความ..."/"เพิ่มคำบรรยาย (ไม่บังคับ)"
- realtime: subscribe `chat:{conversationId}` (SDS §3.4); mark-read on mount + on broadcast
- toast: ส่ง fail → `pacesToast.error` **top-right** (action ของ user, ไม่ใช่ chat.*); 429→"ส่งข้อความถี่เกินไป กรุณารอสักครู่"
- empty: `SellerEmptyState "เริ่มต้นการสนทนา"`; skeleton `SellerThreadSkeleton` (bubble สลับซ้ายขวา); 403/404→`SellerErrorState "ไม่พบบทสนทนานี้"`

### S-13 Menu unread badge (`_seller-menu.ts` + `layout.tsx`)
- เพิ่ม child กลุ่ม CUSTOMERS: `{url:'/inbox', slug:'seller:inbox', label:'ข้อความ', icon:'message-circle'}`
- `applyChatBadge(items, unreadCount)` (pattern `applyInventoryGate` L92-117): `unreadCount>0` → badge `{className:'bg-danger', text: unreadCount>=100?'99+':String(unreadCount)}` ที่ slug `seller:inbox`
- `layout.tsx:60-86`: `getUnreadCountForShop(shop.id)` try/catch→0 (pattern `pendingCount`) → `applyChatBadge(applyInventoryGate(sellerMenuItems, entitlementInfo), unreadCount)`
- badge render มีอยู่แล้ว `AppMenu.tsx:61/86` (ไม่แตะ)

### S-7 Toast Listener (`ChatToastListener.tsx`, mount `(dashboard)/layout.tsx`)
- **Base mount:** `TopUpCelebrationPoller.tsx` (client เปล่า, no UI); subscribe `chat:shop:{shopId}` event `new_message` → `pacesToast.chat.info('คุณมีข้อความใหม่เข้ามา')` bottom-right
- dedup (S3): เทียบ `conversationId` payload vs `usePathname()` — อยู่ใน thread นั้นแล้ว skip toast
- guard `if(!shopId) return`; disconnect = เงียบ (badge จาก DB ยังถูก)

## Base: (สำหรับ commit)
buyer: `theme/vuexy/.../apps/chat/{SidebarLeft,ChatContent,ChatLog,SendMsgForm}.tsx` + `UserProfileHeader.tsx`(แก้) + `AuctionBidPanel.tsx`(login-gate) + `AuctionBidHistoryModal.tsx`(scroll) + `useAuctionPresence.ts`(realtime) + `format-date.ts`
seller: `theme/paces/.../apps/chat/{ChatPage,ContactList}.tsx` + `AuctionBidFeed.tsx`(avatar) + `NotificationFeed.tsx`(scroll/groupby) + `ProductImagesCardV2.tsx`(upload) + `TopUpCelebrationPoller.tsx`(mount) + `SellerEmptyState/ErrorState/CardSkeleton`

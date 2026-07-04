# UX Spec — Product Context Card + "สอบถามสินค้านี้" button (ext #1)

2026-07-04 · safepay-ux · อิง req `product-context-card.md`

## Resolved
- render จริง **3 ไฟล์** (buyer ChatThread ครอบ full+widget เพราะ BuyerChatWidget reuse; seller ChatThread; seller ChatWidgetThreadPanel)
- card bubble = **neutral bg เสมอ** (`bg-backgroundPaper` Vuexy / `bg-light` Paces) ไม่ผูก sender เพราะ PRODUCT = buyer-only (BR-CTX-05) — คง shape+justify เดิม
- ปุ่ม tile ใน hover-overlay เดิม (ไม่สร้าง layer ใหม่); data-plumbing shopId/isOwnShop ผ่าน UserProfile→ProfileRightContent→ProductTile (accept)

## Product card content (ทั้ง 3 จุด, layout เดียว ปรับ token/ขนาด)
flex-row: thumbnail (buyer/seller-full 56px, widget 40px) รูป `/api/files/{imageFileId}` object-cover หรือ `tabler-photo` ถ้าไม่มี → ชื่อ (line-clamp-1 bold) + ราคา `฿{price}` (format เดียวกับ ProductTile priceLabel) + ลิงก์ "ดูสินค้า" + `tabler-external-link` → `/u/[username]`. คลิกทั้งก้อนได้ (tap ≥44px)

## States
- `isActive=false` → badge "หยุดขายแล้ว" (`tabler-ban` สีเทา) ใต้ชื่อ; รูป/ราคายังโชว์, ลิงก์ยังกดได้
- `productCard=null` (ลบจริง) → แทนทั้งการ์ด: `tabler-package-off` + "ไม่พบสินค้านี้แล้ว" สีเทา ไม่มีลิงก์/รูป (FR-CTX-08, ไม่ crash)

## S-19 ProductTile button (`src/views/pages/user-profile/profile/index.tsx`)
- icon-button วงกลม ~28-30px icon `tabler-message-question` `aria-label="สอบถามสินค้านี้"` ใน hover-overlay แถวราคา (ชิดขวา)
- ซ่อนเมื่อ `isOwnShop===true`
- login-gate (pattern `UserProfileHeader.handleChatClick`/`AuctionBidPanel:114`): ไม่ login → `/auth/sign-in?callbackUrl=/messages/{shopId}?productId={id}`; login → `/messages/{shopId}?productId={id}`
- **data-plumbing:** prop-drill `shopId`+`isOwnShop` จาก UserProfile → ProfileRightContent → ProductTile (ข้อมูลมีใน profileHeader แล้ว ไม่ fetch ใหม่)

## S-20 buyer thread (`messages/[shopId]/ChatThread.tsx`)
- เพิ่ม branch `msg.type==='PRODUCT'` ข้าง IMAGE bubble → render card (Section content), bg neutral คงที่
- อ่าน query `?productId` ครั้งเดียว → getOrCreateConversation → sendMessage(type=PRODUCT, productRefId) → clear query (ไม่ resend refresh) → optimistic append pattern เดิม, error→toast.error เดิม

## S-21 seller thread (`inbox/[conversationId]/components/ChatThread.tsx` + `_shared/ChatWidgetThreadPanel.tsx`)
- เพิ่ม branch `m.type==='PRODUCT'` → render card Paces primitive (`.card`/token, HR7 no arbitrary, primary น้ำเงิน, HR12 no emoji); bg-light เสมอ; ลิงก์ "ดูสินค้า" `text-primary text-sm font-semibold` + Icon external-link
- seller ไม่ initiate (ไม่มี auto-send/composer picker)

## Base
buyer: ChatThread IMAGE bubble (container) + ProductTile (thumbnail/price/photo icon) + UserProfileHeader.handleChatClick (login-gate) + AuctionBidPanel
seller: ChatThread/ChatWidgetThreadPanel bubble div + Icon wrapper
icons (verified generated-icons.css): message-question, external-link, ban, package-off, photo

# Chat Bubble Widget + Mobile Bottom-nav — Design Spec (feat 00011 ต่อ)

วันที่: 2026-07-03 · สถานะ: **APPROVED** (user 2026-07-03) · enhancement ของ Deep Chat (feat 00011, deployed prod)

## เป้าหมาย
เปลี่ยน UX การเข้าถึง in-app chat: จาก full-page routes อย่างเดียว → **floating chat bubble panel** (desktop/tablet) + **mobile entry**. reuse backend เดิมทั้งหมด (`/api/chat/*`, realtime channel `chat:{conversationId}`, service) — งานนี้เป็น **UI/entry-point layer เท่านั้น**.

## Decisions (locked)
| # | ค่า |
|---|---|
| Surface | **buyer (Vuexy) + seller (Paces) ทั้งคู่** |
| Bubble content | **embedded panel** — inbox list ↔ thread ในตัว panel (Messenger/Shopee-style) ไม่หลุดหน้าที่ทำงานอยู่ |
| Full pages เดิม | คงไว้ (`/messages` buyer, `/inbox` seller) เป็น fallback + "ขยาย" target |
| Mobile seller | เพิ่มเมนู "แชท" ใน `SellerBottomNav` → `/inbox` (unread badge) |
| Mobile buyer | bubble เล็กลิงก์ `/messages` (ไม่เพิ่ม bottom nav ใหม่) |

## Architecture
**ChatWidget** = client component (2 skin: buyer Vuexy + seller Paces — คนละ theme ตาม HR) mount ที่ layout:
- **State:** `open` (panel), `view` ('list'|'thread'), `activeConversationId` (seller) / `activeShopId`+conversationId (buyer)
- **Bubble (FAB):** วงกลม icon `message-circle` + unread badge, fixed มุมขวาล่าง (z-index สูง, ใต้ header กันทับ); ซ่อนบน mobile (< md) — mobile ใช้ bottom-nav (seller) / bubble-link (buyer)
- **List view:** fetch `/api/chat/conversations` (มี counterparty identity + unread state จาก route enrich); คลิกห้อง → thread view
- **Thread view:** reuse logic ของ thread เดิม (realtime subscribe `chat:{conversationId}`, ส่งข้อความ `POST .../messages`, mark-read, load-older, image upload) ใน container ขนาด panel; ปุ่ม back → list; ปุ่ม "ขยาย" → `router.push` full page
- **DRY:** พยายาม reuse client thread component เดิม (buyer `messages/[shopId]/ChatThread.tsx`, seller `inbox/[conversationId]/components/ChatThread.tsx`) โดยทำให้ embeddable (prop `variant='panel'` หรือ render ใน panel container) + สร้าง compact inbox-list สำหรับ panel; ถ้า coupling สูงเกิน → safepay-ux/dev ตัดสินสร้าง view ใหม่ที่ reuse hook/API

## Surface detail
- **Buyer (Vuexy MUI):** ChatWidget mount ใน `(buyer-app)/layout.tsx` หรือ `(marketing)` layout (แสดงเฉพาะ authed); bubble Vuexy (Fab/Paper/Popper); mobile (< md) → bubble ย่อลิงก์ `/messages`
- **Seller (Paces):** ChatWidget mount ใน `(paces)/seller/(dashboard)/layout.tsx`; bubble+panel Paces primitive (`.card`/`.btn`/token, primary น้ำเงิน, no arbitrary value HR7); mobile → ซ่อน bubble, เพิ่ม `SellerBottomNav` item "แชท" (icon `message-circle`, href `/inbox`, unread badge จาก `getUnreadCountForShop` ที่ layout มีแล้ว)
- **Unread badge:** bubble + bottom-nav item ผูก unread count จริง (seller: `getUnreadCountForShop`; buyer: คำนวณจาก conversations list unread)

## Out of scope
- ไม่แตะ backend (`/api/chat/*`, service, realtime trigger) — มีครบแล้ว
- ไม่ทำ typing indicator / notification เพิ่ม
- ไม่ลบ full pages `/messages` `/inbox` (คงเป็น fallback)
- mobile buyer bottom nav ใหม่ (user เลือก bubble-link)

## HR / Convention
HR1 theme-copy (buyer Vuexy chat theme, seller Paces) · HR7 Paces no-arbitrary · HR8 safepay-ux ก่อน dev · HR9 pacesToast (seller) · HR12 no emoji · realtime channel FROZEN `chat:{conversationId}` · date=format-date.ts

## Next
safepay-ux (2 skin design spec) → developer (buyer widget + seller widget + SellerBottomNav item) → tsc → QA → commit → push

/**
 * ด่าน "แก้แชทเว็บ ต้องแก้แชท Native ตาม" (feature 00088 · HARD RULE 18 · docs/conventions/native-chat-sync.md)
 *
 * แอปผู้ขาย (deep-seller-app) มีแชท Native ที่ผู้ใช้สลับใช้แทนแชทในเว็บได้ — มันเรียก API ชุดเดียวกับเว็บ และ
 * คัดลอกคำ/กติกาบางส่วนของเว็บมาไว้ในแอป (คนละรีโป ไม่มีโค้ดร่วม) ⇒ แก้ฝั่งเว็บแล้วไม่ตามไปแก้แอป =
 * ผู้ขายที่ใช้โหมด Native เห็นของเก่า/พัง โดยไม่มีอะไรฟ้องเลย
 *
 * ไฟล์นี้คือรายการ "ของที่ native พึ่ง" · เทส `__tests__/native-chat-sync.test.ts` เก็บลายนิ้วมือ (sha256) ของแต่ละรายการ
 * ไว้ใน `pins.json` — เนื้อหาเปลี่ยน / มีไฟล์ใหม่ในโฟลเดอร์ที่เฝ้า = เทสแดง (CI ด่าน 2) จนกว่าจะ:
 *   1. ไปแก้ deep-seller-app ตามรายการ `app` ของรายการนั้น (หรือยืนยันว่าไม่กระทบ native)
 *   2. รัน `npx tsx scripts/native-chat-sync-pin.ts` เพื่อปักหมุดใหม่
 *   3. เขียนใน PR ว่า `Native: <PR ของแอป | ไม่กระทบเพราะ ...>`
 * 🛑 ห้ามรันข้อ 2 โดยไม่ทำข้อ 1 — ด่านนี้มีไว้กันลืม ไม่ใช่ให้กดผ่าน
 *
 * ไฟล์นี้ต้องเป็น TS ล้วน (ไม่ import อะไร) — ทั้งเทสและสคริปต์ปักหมุดใช้ร่วมกัน
 */

/** ส่วนของไฟล์ที่เฝ้า — ไม่ระบุ = ทั้งไฟล์ · `from` = บรรทัดเริ่ม (ข้อความที่ต้องเจอ) จนถึงพี่น้องตัวถัดไปที่ระดับเยื้องเดียวกัน */
export type SyncEntry = {
  /** path ในรีโปเว็บ */
  web: string
  from?: string
  /** ไฟล์/หน้าจอในแอปที่ต้องดู (path ใน deep-seller-app) */
  app: string[]
  why: string
}

/** โฟลเดอร์ที่ "ไฟล์ใหม่" ต้องถูกจัดเข้ารายการ (ไม่งั้นแดง) — ฟีเจอร์ใหม่ของแชทต้องตัดสินว่า native รองรับไหม */
export const WATCHED_DIRS: { dir: string; app: string[]; why: string }[] = [
  { dir: 'src/app/api/chat', app: ['src/features/chat/api/endpoints.ts', 'src/features/chat/api/parse.ts'], why: 'API แชท — native เรียกตรง ⇒ เปลี่ยน shape/กติกา/route ใหม่ ต้องตาม' },
  { dir: 'src/app/api/follow-ups', app: ['src/features/chat/ui/CustomerPanelScreen.tsx'], why: 'แท็บติดตามในแผงลูกค้า' },
  { dir: 'src/app/api/uploads', app: ['src/features/chat/upload.ts'], why: 'อัปโหลดรูป/ไฟล์ในแชท' },
  { dir: 'src/app/(paces)/seller/(chat)', app: ['src/features/chat/ui/', 'src/features/chat/logic/cards.ts (orderProgressChip สำเนาจาก OrderProgressBar.tsx)'], why: 'หน้าจอแชทเว็บ — แชท Native ต้องหน้าตา/คำ/พฤติกรรมเท่าเว็บ (BRD FR-006)' },
  // เฟส 3 (2026-10-31) — ฟอร์มสร้าง/แก้งาน-ออเดอร์ · ปฏิทินนัด · ชีตปิดงาน · ฟอร์มติดตาม (นอกโฟลเดอร์แชท แต่แชท Native ทำเท่าเว็บ)
  { dir: 'src/app/(paces)/seller/(dashboard)/orders/new/components', app: ['src/features/chat/ui/OrderFormScreen.tsx', 'src/features/chat/logic/order-form.ts', 'src/features/chat/ui/AvailabilitySheet.tsx'], why: 'ฟอร์มสร้าง/แก้งาน-ออเดอร์จากแชท (QuickForm · AppointmentBlock · AppointmentDateSheet ฯลฯ)' },
  { dir: 'src/components/safepay/appointment-board', app: ['src/features/chat/logic/availability.ts', 'src/features/chat/ui/AvailabilitySheet.tsx'], why: 'ช่องวัน/แถวนัดในตารางว่างประเภทงาน' },
  { dir: 'src/components/safepay/service-close', app: ['src/features/chat/ui/OrderSheets.tsx (ServiceCloseSheet)', 'src/features/chat/logic/order-actions.ts'], why: 'ชีตปิดงาน' },
  { dir: 'src/app/(paces)/seller/_follow-up', app: ['src/features/chat/ui/CustomerPanelScreen.tsx (FollowFormSheet · SnoozeCustomSheet)'], why: 'ฟอร์มแก้/เลื่อนรายการติดตาม' },
  { dir: 'src/app/api/chat/comments', app: ['src/features/chat/api/endpoints.ts', 'src/features/chat/logic/comments.ts'], why: 'ความคิดเห็น (อยู่ใต้ api/chat อยู่แล้ว — แยกแถวให้รู้ว่าแอปไฟล์ไหน)' },
  { dir: 'src/components/safepay/iship', app: ['src/features/chat/ui/shipment/', 'src/features/chat/logic/shipment*.ts'], why: 'พัสดุ iShip จากแชท (P23) — สำเนาฟอร์ม/สถานะ/ผูกพัสดุ' },
  { dir: 'src/components/safepay/flash', app: ['src/features/chat/ui/shipment/Flash*.tsx', 'src/features/chat/logic/shipment-flash.ts'], why: 'พัสดุ Flash Express จากแชท (P23)' },
  { dir: 'src/app/api/seller/iship', app: ['src/features/chat/ui/shipment/', 'src/features/chat/logic/shipment.ts'], why: 'API iShip ที่หน้าพัสดุ native เรียก' },
  { dir: 'src/app/api/seller/flash', app: ['src/features/chat/ui/shipment/', 'src/features/chat/logic/shipment-flash.ts'], why: 'API Flash ที่หน้าพัสดุ native เรียก' },
  { dir: 'src/app/api/seller/shipments', app: ['src/features/chat/ui/shipment/StatusView.tsx'], why: 'ปิดปัญหาพัสดุ' },
  { dir: 'src/app/api/orders/[token]/auto-order', app: ['src/features/chat/ui/AutoOrderResultCard.tsx', 'src/features/chat/logic/auto-order.ts'], why: 'การ์ดอ่านออเดอร์อัตโนมัติ (T32)' },
]

export const SYNC_ENTRIES: SyncEntry[] = [
  // ── คำ/กติกาที่แอปคัดลอกมา (แก้แล้วต้องคัดลอกใหม่) ─────────────────────
  { web: 'src/lib/chat-send-failure.ts', app: ['src/features/chat/logic/send-failure.ts'], why: 'สำเนาทั้งไฟล์ — เหตุผลส่งไม่สำเร็จ/ปุ่มส่งใหม่' },
  { web: 'src/lib/chat-send-queue.ts', from: 'export const UNCERTAIN_SEND_REASON', app: ['src/features/chat/logic/send-failure.ts'], why: 'ข้อความ "ไม่แน่ใจว่าข้อความออกไปหรือยัง" (server เขียนลง failureReason)' },
  { web: 'src/lib/chat-retry-eligibility.ts', app: ['src/features/chat/logic/thread.ts'], why: 'กติกาปุ่มส่งใหม่ (failureView)' },
  { web: 'src/app/(paces)/seller/(chat)/inbox/components/chat-list-query.ts', app: ['src/features/chat/logic/inbox-query.ts'], why: 'สำเนา — ตัวกรอง/แท็บ/query ของรายการแชท' },
  { web: 'src/lib/line/stickers.ts', app: ['src/features/chat/constants.ts'], why: 'สำเนา LINE_STICKER_PACKS' },
  { web: 'src/lib/emoji-presentation.ts', app: ['src/features/chat/constants.ts'], why: 'การแสดงรีแอค (VS16)' },
  { web: 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx', from: 'const REACTION_CHOICES', app: ['src/features/chat/constants.ts'], why: 'รีแอค 6 แบบ' },
  { web: 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/EmojiPicker.tsx', from: 'export const EMOJI_CATEGORIES', app: ['src/features/chat/constants.ts'], why: 'หมวดอิโมจิ' },
  { web: 'src/lib/order-stage.ts', app: ['src/features/chat/logic/row-badges.ts', 'src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ป้าย/สีสถานะคำสั่งซื้อ (orderStageChipLabel · ORDER_STAGE_META)' },
  { web: 'src/lib/service-status.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ป้ายสถานะงานบริการบนการ์ด' },
  { web: 'src/lib/arrival-mode.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ป้ายจองล่วงหน้า/หน้าร้านบนการ์ด' },
  { web: 'src/lib/seller-menu.ts', from: 'export const ORDER_VOCAB', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'คำตามประเภทร้าน (คำสั่งซื้อ/งานบริการ/บิลเข้าพัก)' },
  { web: 'src/lib/chat-vocab.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'คำ สินค้า/บริการ · สั่งซื้อแล้ว/ใช้บริการแล้ว' },
  { web: 'src/lib/chat-product-card-batch.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)', 'src/features/chat/ui/ProductPicker.tsx'], why: 'การ์ดสินค้าต่อข้อความตามช่องทาง · คำนับรายการ' },
  { web: 'src/lib/chat-attachment.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)', 'src/features/chat/upload.ts'], why: 'กติกาไฟล์แนบต่อช่องทาง + ข้อความเตือน' },
  { web: 'src/lib/preview-attribution.ts', app: ['src/features/chat/logic/row-badges.ts'], why: 'คำนำหน้า "คุณ:" / "ส่งโดยระบบ:"' },
  { web: 'src/lib/format-date.ts', from: 'export function formatChatListTime', app: ['src/features/chat/logic/time.ts'], why: 'เวลาในรายการแชท' },
  { web: 'src/lib/format-date.ts', from: 'export function formatRelativeDayTime', app: ['src/features/chat/logic/time.ts'], why: 'เวลาใต้ข้อความ' },
  { web: 'src/lib/image-compress.ts', app: ['src/features/chat/logic/upload-plan.ts'], why: 'การบีบรูปก่อนส่ง (profile standard)' },
  { web: 'src/lib/messaging-window.ts', app: ['src/features/chat/logic/thread.ts'], why: 'หน้าต่างตอบ 24 ชม./7 วัน ของ Meta' },
  { web: 'src/lib/chat-sound.ts', app: ['src/features/chat/sound.ts'], why: 'ปิด/เปิดเสียงแชท (คีย์ localStorage + push-token)' },
  { web: 'src/lib/native-bridge.ts', app: ['src/features/chat-mode/bridge.ts', 'src/features/webview/SellerWebView.tsx'], why: 'สัญญา WebView ↔ แอป (app-settings ฯลฯ)' },
  { web: 'src/lib/inbox-filter-pref.ts', app: ['src/features/chat/logic/inbox-query.ts'], why: 'ค่าเริ่มที่บันทึกของกล่องข้อความ' },
  { web: 'src/lib/chat-shop-realtime.ts', app: ['src/features/chat/realtime/index.ts'], why: 'ชื่อช่อง/event ของ Realtime' },
  { web: 'src/lib/chat-memory-types.ts', app: ['src/features/chat/api/types.ts'], why: 'shape ความจำ/สินค้าที่สนใจ' },
  // ── ต้นฉบับของ bundle `vendor/web-chat-lib.js` ในแอป (ป้าย/คำ/กติกาที่แอป "เรียกใช้โค้ดเว็บตรง ๆ") ──
  //    แก้ไฟล์เหล่านี้ = สร้าง bundle ใหม่ในแอป (DEEP_WEB_DIR=… node scripts/vendor-web-chat-lib.mjs) แล้วเทส web-sync ของแอปต้องเขียว
  { web: 'src/lib/chat-order-progress.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ชิปงาน/ออเดอร์บนหัวห้อง' },
  { web: 'src/lib/chat-service-progress.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ขั้นงานบริการบนชิปหัวห้อง' },
  { web: 'src/lib/appointment-stage.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ป้ายนัดบนการ์ด' },
  { web: 'src/lib/appointments.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'วันนัด/ทั้งวัน บนการ์ด' },
  { web: 'src/lib/finance-rules.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ร้านบริการ vs ร้านขายของ' },
  { web: 'src/lib/format-money.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'รูปแบบเงิน' },
  { web: 'src/lib/order-display.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ป้ายสถานะคำสั่งซื้อ (ORDER_STATUS_META)' },
  { web: 'src/lib/parcel-close.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ขั้นพัสดุ' },
  { web: 'src/lib/iship/status.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ขั้นพัสดุ' },
  { web: 'src/lib/shipping/provider.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'มีพัสดุใช้ได้ไหม' },
  { web: 'src/lib/chat-channel.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ช่องทางแชท' },
  { web: 'src/lib/lodging.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ประเภทร้าน' },
  // ── shape ข้อมูลที่แอปอ่าน ───────────────────────────────────────────
  { web: 'src/services/chat-thread-messages.service.ts', app: ['src/features/chat/api/parse.ts', 'src/features/chat/ui/MessageBubble.tsx'], why: 'field ของข้อความ/การ์ด' },
  { web: 'src/services/chat.service.ts', app: ['src/features/chat/api/parse.ts', 'src/features/chat/logic/inbox.ts'], why: 'แถวรายการ + กติกาที่ซ่อน/สแปม/สถานะ' },
  { web: 'src/lib/validations.ts', from: 'export const SendChatMessageSchema', app: ['src/features/chat/store/thread.ts', 'src/features/chat/logic/upload-plan.ts'], why: 'body ของการส่งข้อความ' },
  { web: 'src/lib/validations.ts', from: 'export const ChatConversationsQuerySchema', app: ['src/features/chat/logic/inbox-query.ts'], why: 'query ของรายการแชท' },
  { web: 'src/lib/validations.ts', from: 'export const ConversationPatchSchema', app: ['src/features/chat/api/endpoints.ts'], why: 'คำสั่งแถว' },
  { web: 'src/lib/validations.ts', from: 'export const ChatCrmPatchSchema', app: ['src/features/chat/api/endpoints.ts'], why: 'แก้ข้อมูลลูกค้า' },
  { web: 'src/lib/validations.ts', from: 'export const CreateFollowUpSchema', app: ['src/features/chat/ui/CustomerPanelScreen.tsx'], why: 'เพิ่มรายการติดตาม' },
  // ── route นอกโฟลเดอร์ที่เฝ้า ────────────────────────────────────────
  { web: 'src/app/api/account/notifications/route.ts', app: ['src/features/chat/ui/InboxScreen.tsx'], why: 'แถบ "คุณปิดแจ้งเตือนของร้านนี้อยู่"' },
  { web: 'src/app/api/channels/facebook/stickers/route.ts', app: ['src/features/chat/ui/ComposerPanels.tsx'], why: 'สติกเกอร์ Messenger' },
  { web: 'src/app/api/products/route.ts', app: ['src/features/chat/ui/ProductPicker.tsx'], why: 'เลือกสินค้า/บริการ' },
  { web: 'src/app/api/users/me/route.ts', app: ['src/features/chat/ui/InboxScreen.tsx'], why: 'มุมมอง ร้านทั้งหมด/ร้านนี้ (chatScopeMode)' },
  { web: 'src/app/api/seller/push-token/route.ts', app: ['src/features/chat/sound.ts'], why: 'ปิดเสียงแจ้งเตือนแชทของเครื่อง' },
  // ── คำภาษาไทยของแชท (ทั้งก้อน) ──────────────────────────────────────
  { web: 'src/i18n/dictionaries/th.ts', from: '  inbox: {', app: ['src/features/chat/ui/'], why: 'คำในแชท — native ใช้คำเดียวกัน' },
  { web: 'src/i18n/dictionaries/th.ts', from: '  followUps: {', app: ['src/features/chat/ui/CustomerPanelScreen.tsx'], why: 'คำแท็บติดตาม' },
  { web: 'src/i18n/dictionaries/th.ts', from: '  autoNotify: {', app: ['src/features/chat/logic/row-badges.ts'], why: 'คำ "ส่งโดยระบบ"' },
  // ── เฟส 3: ต้นฉบับที่แอปคัดลอกด้วยมือ ─────────────────────────────
  { web: 'src/lib/comment-tree-visibility.ts', app: ['src/features/chat/logic/comments.ts'], why: 'สำเนาในหน้าความคิดเห็น' },
  { web: 'src/lib/comment-handled.ts', app: ['src/features/chat/logic/comments.ts'], why: 'สำเนาในหน้าความคิดเห็น' },
  { web: 'src/lib/comment-focus-target.ts', app: ['src/features/chat/logic/comments.ts'], why: 'สำเนาในหน้าความคิดเห็น' },
  { web: 'src/lib/comment-content-state.ts', app: ['src/features/chat/logic/comments.ts'], why: 'สำเนาในหน้าความคิดเห็น' },
  { web: 'src/lib/facebook-post.ts', app: ['src/features/chat/logic/comments.ts'], why: 'สำเนาในหน้าความคิดเห็น' },
  { web: 'src/lib/format-compact-number.ts', app: ['src/features/chat/logic/comments.ts'], why: 'สำเนาในหน้าความคิดเห็น' },
  { web: 'src/lib/format-date.ts', from: 'export function formatDayMonthTimeTH', app: ['src/features/chat/logic/comments.ts', 'src/features/chat/logic/availability.ts'], why: 'วัน/เวลาในความคิดเห็น · ปฏิทินนัด' },
  // ── เฟส 3: route ที่แอปเรียก (นอกโฟลเดอร์ที่เฝ้า) ──────────────────
  { web: 'src/app/api/orders/route.ts', app: ['src/features/chat/logic/order-form.ts'], why: 'สร้างงาน/ออเดอร์ (POST)' },
  { web: 'src/app/api/orders/[token]/route.ts', app: ['src/features/chat/logic/order-form.ts'], why: 'โหลด/แก้งาน (GET/PATCH)' },
  { web: 'src/app/api/orders/[token]/payments/route.ts', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'รับเงิน/ประวัติ' },
  { web: 'src/app/api/orders/[token]/payments/[paymentId]/route.ts', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'ยกเลิกรายการรับเงิน' },
  { web: 'src/app/api/orders/[token]/appointment/route.ts', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'เริ่มงานหน้าร้าน' },
  { web: 'src/app/api/orders/[token]/close/route.ts', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'ปิดงาน' },
  { web: 'src/app/api/orders/[token]/cancel/route.ts', app: ['src/features/chat/ui/OrderActionCard.tsx'], why: 'ยกเลิกใบ' },
  { web: 'src/app/api/orders/[token]/appointment-summary/route.ts', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'ส่งสรุปนัด' },
  { web: 'src/app/api/shops/current/service-resources/route.ts', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'ประเภทงาน' },
  { web: 'src/app/api/shops/current/service-staff/route.ts', app: ['src/features/chat/logic/order-form.ts'], why: 'ผู้รับผิดชอบ' },
  { web: 'src/app/api/shops/current/appointments/route.ts', app: ['src/features/chat/logic/availability.ts'], why: 'ตารางว่างประเภทงาน' },
  { web: 'src/app/api/business/context/route.ts', app: ['src/features/chat/api/endpoints.ts'], why: 'บทบาทต่อร้าน (ซ่อนปุ่มยกเลิกรายการรับเงิน/คืนมัดจำ)' },
  { web: 'src/app/api/channels/route.ts', app: ['src/features/chat/logic/comments.ts'], why: 'รายชื่อเพจในตัวกรองความคิดเห็น' },
  { web: 'src/lib/validations.ts', from: 'export const CreateOrderSchema', app: ['src/features/chat/logic/order-form.ts'], why: 'body สร้างงาน/ออเดอร์' },
  { web: 'src/lib/validations.ts', from: 'export const CloseServiceJobSchema', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'body ปิดงาน' },
  { web: 'src/lib/validations.ts', from: 'export const SetAppointmentSchema', app: ['src/features/chat/ui/OrderSheets.tsx'], why: 'body เริ่มงานหน้าร้าน' },
  { web: 'src/lib/validations.ts', from: 'export const UpdateFollowUpSchema', app: ['src/features/chat/ui/CustomerPanelScreen.tsx'], why: 'body แก้รายการติดตาม' },
  { web: 'src/lib/validations.ts', from: 'export const PrivateReplySchema', app: ['src/features/chat/logic/comments.ts'], why: 'ทักแชทส่วนตัว ≤1000' },
  { web: 'src/i18n/dictionaries/th.ts', from: '  comments: {', app: ['src/features/chat/ui/CommentsScreen.tsx', 'src/features/chat/ui/CommentThreadScreen.tsx', 'src/features/chat/ui/PrivateReplySheet.tsx'], why: 'คำในหน้าความคิดเห็น' },
  // ── เฟส 3: ทุกไฟล์ที่ bundle ดึง (รายการจาก esbuild metafile · เพิ่ม import ใหม่ = ไฟล์ต้นทางเปลี่ยน = แดงอยู่แล้ว) ──
  { web: 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/order-action-set.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/components/safepay/appointment-board/types.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/i18n/fmt.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/i18n/vertical.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/api-error-message.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/appointment-summary.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/cancel-reason-buyer-fault.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/cancel-reasons.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-order-actions.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-sales-channel.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/comment-done-mark.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/comment-list-page.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/comment-row-chips.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/date-range.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/finance-tabs.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/follow-up-constants.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/follow-up-copy.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/follow-up-rules.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/follow-up-time.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/follow-up-view.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/iship/courier.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/order-date-window.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/order-form-arrival.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/order-form-assignee.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/order-payment.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/parse-order-message.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/phone.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/private-reply-window.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/public-order-url.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/report-settings.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/role-nav.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/round2.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/route-capabilities.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/service-job.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/service-report/words.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/shipping-address-status.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/shop-permissions.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  // ── ด่านนี้เอง + แถวตั้งค่าแอป ──────────────────────────────────────
  { web: 'src/app/(paces)/seller/(dashboard)/account/components/AppSettingsRow.tsx', app: ['app/settings.tsx'], why: 'ทางเข้าหน้า "ตั้งค่าแอป"' },
  // ── parity 2026-10-31: ไฟล์ที่ bundle ดึงเพิ่ม (esbuild metafile) ──
  { web: 'src/app/(paces)/seller/(dashboard)/orders/new/components/order-form-words.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/appointment-day.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/assignee-load.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/auto-reply-constants.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/buyer-reputation.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-beep-target.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-bubble-frame.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-image-reserve.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-memory-ui.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-message-burst.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-message-merge.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-quote-availability.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-reaction-toggle.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-sticker.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-thread-scroll.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/comment-composer-slot.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/customer-behavior.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/customer-directory.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/customer-file-library.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/customer-signal.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/follow-up-bubble.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/follow-up-inbox.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/giphy-message-kind.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/inbox-row-chips.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/iship/live-shipment.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/iship/return-timeline.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/manual-shipment-client.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/manual-shipment.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/meta-ai-holder.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/meta-order-card.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/meta-system-notice.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/no-permission-copy.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/order-profit.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/order-return.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/phone-hint.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/pii-redact.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/product-attributes.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/product-picker-attach.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/relative-time-th.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/return-sheet.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/system-notice-label.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/thread-control-ui.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  // ── parity 2026-10-31: route/คำ/สำเนาใหม่ ──
  { web: 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShipForm.tsx', app: ['src/features/chat/ui/shipment/ManualShipForm.tsx'], why: 'สำเนา — ใส่เลขพัสดุเอง' },
  { web: 'src/components/paces/ShopSwitchOverlay.tsx', app: ['src/features/chat/ui/ShopSwitchOverlay.tsx'], why: 'สำเนา — จอกำลังสลับบัญชี' },
  { web: 'src/hooks/useShopSwitcher.ts', app: ['src/features/chat/logic/shop-switch.ts'], why: 'ขั้นตอนสลับบัญชี (switch-context → csrf → session update)' },
  { web: 'src/app/api/business/switch-context/route.ts', app: ['src/features/chat/logic/shop-switch.ts'], why: 'สลับบัญชีจากแชท native' },
  { web: 'src/app/api/orders/[token]/ship/route.ts', app: ['src/features/chat/ui/shipment/ManualShipForm.tsx'], why: 'ใส่เลขพัสดุเอง' },
  { web: 'src/app/api/orders/[token]/buyer-reputation/route.ts', app: ['src/features/chat/ui/shipment/'], why: 'ประวัติผู้ซื้อ/คำเตือน COD ในหน้าพัสดุ' },
  { web: 'src/lib/image-variants.ts', from: 'export const IMAGE_VARIANTS', app: ['src/features/chat/logic/image-src.ts'], why: 'เกณฑ์ขนาดรูปย่อ thumb/lg ที่แอปเลือกตามขนาดที่แสดง' },
  { web: 'src/app/api/files/[...fileId]/route.ts', app: ['src/features/chat/logic/image-src.ts', 'src/features/chat/ui/RemoteImage.tsx'], why: 'สัญญา ?variant= และการเสิร์ฟไฟล์ในแชท' },
  { web: 'src/app/api/orders/[token]/returns/route.ts', app: ['src/features/chat/ui/ReturnSheet.tsx', 'src/features/chat/logic/returns.ts'], why: 'คืนของจากแผงลูกค้า' },
  { web: 'src/app/api/orders/[token]/returns/[returnId]/route.ts', app: ['src/features/chat/ui/ReturnSheet.tsx'], why: 'ขั้นตอนคืนของ' },
  { web: 'src/app/api/orders/[token]/return-quote/route.ts', app: ['src/features/chat/ui/ReturnSheet.tsx'], why: 'ค่าส่งคืน' },
  { web: 'src/app/api/orders/[token]/dispatch/route.ts', app: ['src/features/chat/ui/OrderActionCard.tsx'], why: 'ส่งเอง: จัดส่งแล้ว' },
  { web: 'src/app/api/orders/[token]/dispatch/undo/route.ts', app: ['src/features/chat/ui/OrderActionCard.tsx'], why: 'ส่งเอง: เลิกทำ' },
  { web: 'src/app/api/orders/[token]/delivered/route.ts', app: ['src/features/chat/ui/OrderActionCard.tsx'], why: 'ส่งเอง: ส่งสำเร็จ' },
  { web: 'src/app/api/orders/customers/route.ts', app: ['src/features/chat/ui/OrderFormSheets.tsx'], why: 'ค้นหาลูกค้าเก่าในฟอร์ม' },
  { web: 'src/app/api/orders/parse-address/route.ts', app: ['src/features/chat/ui/OrderFormSheets.tsx'], why: 'กระจายที่อยู่ (AI ช่วยอ่าน)' },
  { web: 'public/data/iship-address.json', app: ['src/features/chat/logic/order-form-extras.ts'], why: 'ค้นหาที่อยู่ ตำบล/อำเภอ/จังหวัด/รหัส' },
  { web: 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ReturnPanel.tsx', app: ['src/features/chat/ui/ReturnSheet.tsx', 'src/features/chat/logic/returns.ts'], why: 'สำเนา — คืนของ (โหมดชีต)' },
  { web: 'src/i18n/dictionaries/th.ts', from: '  chatSignals: {', app: ['src/features/chat/logic/inbox-copy.ts', 'src/features/chat/logic/thread-view.ts'], why: 'คำป้ายสัญญาณแชท' },
  { web: 'src/i18n/dictionaries/th.ts', from: '  accountSwitcher: {', app: ['src/features/chat/logic/inbox-copy.ts'], why: 'ป้ายบทบาทในเมนูร้าน' },
  // ── parity รอบสอง 2026-10-31: ไฟล์ที่ bundle ดึงเพิ่ม (esbuild metafile) ──
  { web: 'src/lib/auto-order-card.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/auto-order-message-type.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/auto-order-reason-label.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/auto-order-reasons.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/chat-shipment-panel.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/iship/errors.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/iship/mapping.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/iship/traces.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/iship/unlinked.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/ship-cost-input.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/shipping/after-create.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
  { web: 'src/lib/shipping/flash-order-ui.ts', app: ['src/features/chat/vendor/web-chat-lib.js (สร้างใหม่: node scripts/vendor-web-chat-lib.mjs)'], why: 'ต้นฉบับของ bundle' },
]

const indentOf = (line: string) => line.length - line.trimStart().length

/**
 * ตัดส่วนที่เฝ้า: จากบรรทัดที่มี `from` จนถึงบรรทัดพี่น้องตัวถัดไป (เยื้อง ≤ บรรทัดเริ่ม และไม่ใช่วงเล็บปิด)
 * ไม่ระบุ `from` = ทั้งไฟล์ · หาไม่เจอ = null (เทสแดง — ชื่อเปลี่ยน/ถูกลบ ต้องมีคนดู)
 */
export function extractRegion(text: string, from?: string): string | null {
  const src = text.replace(/\r\n/g, '\n')
  if (!from) return src
  const lines = src.split('\n')
  const start = lines.findIndex((l) => l.includes(from))
  if (start < 0) return null
  const base = indentOf(lines[start])
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    if (indentOf(l) <= base && !/^[\s]*[}\]]/.test(l)) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/** กุญแจของรายการใน pins.json */
export function entryKey(e: Pick<SyncEntry, 'web' | 'from'>): string {
  return e.from ? `${e.web}#${e.from.trim()}` : e.web
}

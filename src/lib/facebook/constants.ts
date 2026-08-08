// ค่าคงที่กลางของ Facebook/Instagram integration (feature 00018)
// ตรึงเวอร์ชัน Graph API ไว้ที่เดียว — ห้าม hardcode เวอร์ชันกระจายตามไฟล์

export const GRAPH_VERSION = 'v21.0'
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

// webhook field ที่ subscribe ให้ Page — messages คือแกนหลัก
// messaging_postbacks เผื่อปุ่ม/quick reply, message_reactions เผื่อไลก์ข้อความ
//
// message_echoes: field แยกต่างหากจาก messages — Messenger จะส่ง event ที่มี is_echo=true
// (คือตอนที่ seller พิมพ์ตอบลูกค้าตรงจากแอป Messenger บนมือถือ ไม่ใช่ผ่าน Deep) ก็ต่อเมื่อ
// subscribe field นี้เท่านั้น ถ้าไม่มี field นี้ echo จะไม่ถูกส่งเข้ามาเลย → เธรดใน /inbox
// จะดูเหมือน "ยังไม่ตอบ" ตลอดแม้ seller ตอบไปแล้วจริง (BRD BR-FBC-09 ยืนยันว่าขาดข้อนี้ใช้งานจริงไม่ได้)
// หมายเหตุ: Instagram ไม่ต้องเพิ่ม field นี้ — IG ส่ง echo มากับ field messages อยู่แล้ว (ต่าง platform
// behavior กันของ Meta)
export const MESSENGER_SUBSCRIBED_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_reactions',
  'message_echoes',
  // message_reads: event ที่ลูกค้า "อ่าน" ข้อความของเพจ (มี read.watermark) — feature 00018 read receipt
  // ต้อง subscribe field นี้ ไม่งั้น Messenger ไม่ส่ง read event เข้ามาเลย (แสดง "อ่านแล้ว" ไม่ได้)
  'message_reads',
  // message_deliveries: event ที่ข้อความของเพจ "ถึงเครื่องลูกค้า" (มี delivery.watermark) — 2026-08-05
  //
  // ทำไมถึงเพิ่ม (user report prod 2026-08-05): ก่อนหน้านี้ "ส่งแล้ว" ของเราหมายถึง "Meta ตอบ mid
  // กลับมาแล้ว" เท่านั้น ซึ่งเกิดขึ้นก่อนที่ Meta จะเอาข้อความเข้าเธรดจริง — ส่งรูปหลายใบแล้ว UI
  // ขึ้นว่าส่งสำเร็จทั้งที่ฝั่ง Messenger ยังไม่มีรูป event นี้คือหลักฐานเดียวที่ยืนยันได้จริง
  //
  // ข้อควรระวัง: Instagram ไม่มี field นี้ — โปรโตคอล IG ไม่ส่ง delivery receipt เลย
  // (ไม่ใช่ว่าเราลืม subscribe)
  // ฝั่ง UI จึงต้องข้ามสถานะ "ได้รับแล้ว" สำหรับ IG ไม่ใช่รอค่าที่ไม่มีวันมา
  //
  // เพจที่เชื่อมไว้ก่อนหน้านี้ไม่ได้ subscribe field นี้ → ต้อง re-sync ผ่าน POST /api/channels
  // (ทางเดียวกับตอนเพิ่ม message_reads) ไม่ต้องให้ร้านกดเชื่อมเพจใหม่ เพราะ subscribed_fields
  // เป็นค่าระดับเพจ ไม่ได้ผูกกับ scope ของ token
  'message_deliveries',
  // messaging_referrals: ลูกค้าคลิกโฆษณา/ลิงก์ m.me แล้วเปิดแชท (feature 00018 Phase 2) — ต้อง subscribe
  // ไม่งั้น referral ที่ไม่มาพร้อมข้อความจะไม่เข้ามา (referral ในข้อความแรกมากับ messages อยู่แล้ว)
  'messaging_referrals',
  // feed: คอมเมนต์/โพสต์บนหน้าเพจ (user สั่ง 2026-08-03 "อยากรับ facebook comment")
  // มาที่ entry.changes ไม่ใช่ entry.messaging — ดู extractFeedChanges ใน webhook-types
  // เพจที่เชื่อมไว้ก่อนหน้านี้ถูกเติม field นี้ให้แล้วผ่าน Graph (ไม่ต้องเชื่อมใหม่)
  'feed',
  /**
   * message_edits — ลูกค้าแก้ข้อความที่ส่งไปแล้ว (2026-08-08)
   *
   * โค้ดฝั่งรับ (`ingestMessageEdit`) เขียนรออยู่ตั้งแต่ 2026-08-03 แต่ไม่เคยมีใครบอกเพจให้ส่ง
   * field นี้มา — ระดับแอปมีอยู่แล้ว ระดับเพจไม่มี ผลคือฟีเจอร์นี้ไม่เคยทำงานเลยสักครั้ง
   * (ตรงกับที่ CLAUDE.md บันทึกไว้เองว่า "โค้ดขึ้นแล้วแต่ยังไม่เคยทดสอบ")
   */
  'message_edits',
  /**
   * messaging_handovers — pass/take/request thread control (Handover Protocol) 2026-08-08
   *
   * 🛑 ทำไมถึงจำเป็น (user report prod 2026-08-08): ร้านเปิด "Meta Business Agent" (AI ของ Meta)
   * ให้ตอบแชทแทน → **เธรดนั้นไม่เข้ากล่องของเราเลยแม้แต่ห้องเดียว** จนกว่าคนจริงจะกด
   * "ตอบกลับด้วยตัวเอง" ใน Business Suite ถึงจะไหลเข้ามา
   *
   * field นี้บอกแค่ "สิทธิ์คุมห้องเปลี่ยนมือแล้ว" (pass/take/request) — **ไม่ได้ขนข้อความมาด้วย**
   * ตัวที่ขนข้อความคือ `standby` ข้างล่าง ต้องมีคู่กันเสมอ
   *
   * ระดับแอปเพิ่มให้แล้วผ่าน Meta DevTools MCP (2026-08-08)
   */
  'messaging_handovers',
  /**
   * standby — ข้อความของห้องที่ **เราไม่ใช่เจ้าของเธรด** (2026-08-08 รอบสอง)
   *
   * 🛑 นี่คือตัวจริงที่ขาดมาตลอด ไม่ใช่ `messaging_handovers`. เอกสาร Meta เขียนตรงตัว:
   * "this callback will occur when a message has been sent to your page, but your application
   * is not the current thread owner. Instead of delivering the callback through the normal
   * messaging channel, the events will be delivered to standby channel."
   * (developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/
   *  webhook-events/standby — ขน messages / message_reads / message_deliveries /
   *  messaging_postbacks; postback ที่มาทางนี้ไม่มี payload)
   *
   * อาการจริงบน prod: ร้านเปิด "AI from Meta" ให้ตอบแชท → **เธรดนั้นเงียบสนิททั้งห้อง** ไม่ใช่แค่
   * ข้อความของ AI ที่หาย ข้อความที่ "ลูกค้าพิมพ์เอง" ก็ไม่มาด้วย จนกว่าคนจะกดรับเรื่องต่อ พิสูจน์กับ
   * เธรด b6064da8: ทุกบรรทัดก่อน "You took over this chat from your AI agent." มาทาง graph-backfill
   * ล้วน ๆ (ปัดเป็นวินาที) แล้ววินาทีที่ 11:39:11 หลังคนกดรับ webhook กลับมาทันทีพร้อม millisecond
   *
   * 🛑 ทำไมถึงพลาดมาสองรอบ: `list_topics` ของ Meta DevTools MCP **ไม่ลิสต์ `standby` ใน topic
   * `page`** (ลิสต์ให้เฉพาะ `instagram`) สั่งเพิ่มผ่าน MCP จะโดนตีกลับว่า "Fields not available
   * for topic page" ทั้งที่เอกสารบอกว่ามี — ต้องยิง `POST /{app-id}/subscriptions` ผ่าน Graph ตรง ๆ
   * ด้วย app token. **ตารางของเครื่องมือไม่ใช่ความจริง ให้เชื่อเอกสาร + Graph**
   *
   * 🛑 POST /subscriptions เป็น replace ไม่ใช่ append — ต้องส่ง field เดิมครบทุกตัวไปด้วย
   * ทุกครั้ง ตกไปตัวเดียวคือเลิกรับ field นั้นทั้งระบบเงียบ ๆ
   *
   * ฝั่งรับพร้อมอยู่แล้วตั้งแต่ 2026-08-04 (`EntrySchema.standby` + extractMessagingEventsWithRaw
   * ที่ทำไว้ตอนแก้เคส IG) — ขาดแค่การบอก Meta ให้ส่งมา
   */
  'standby',
] as const

// scope ที่ขอตอนเชื่อม Page — business_management เป็น dependency บังคับของ
// pages_messaging / pages_show_list / instagram_manage_messages (Meta docs)
export const CONNECT_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  // feature 00029 (คอมเมนต์บนโพสต์) — เพิ่ม 2026-08-03 หลังเพิ่ม use case "Manage everything on
  // your Page" ใน App Dashboard. **token ที่ออกไปก่อนหน้านี้ไม่มีสิทธิ์ 2 ตัวนี้** (scope ติดตัว
  // token ตอนกดอนุญาต ไม่ใช่ตอนแอปประกาศ) → ร้านที่เชื่อมไว้แล้วต้องกดเชื่อมเพจใหม่ครั้งเดียว
  // ไม่งั้นตอบคอมเมนต์จะได้ (#200) Permissions error และ backfill คอมเมนต์เก่าก็ดึงไม่ได้
  'pages_read_user_content',  // อ่านคอมเมนต์ที่ผู้ใช้เขียนบนเพจ + ดึงคอมเมนต์ย้อนหลัง
  'pages_manage_engagement',  // ตอบ/จัดการคอมเมนต์ในนามเพจ
  'business_management',
  'instagram_basic',
  'instagram_manage_messages',
  // instagram_manage_insights — "ขอไม่ได้" ตอนนี้ อย่าเพิ่งใส่กลับ
  //
  // ต้องใช้ดึงยอดวิวของ Reels (instagram_basic ให้แค่ like_count/comments_count ส่วน insights
  // ตอบ #10 Application does not have permission) แต่พอใส่ใน scope แล้ว Meta ตีกลับทันทีที่หน้า
  // login ว่า "Invalid Scopes: instagram_manage_insights" → **เชื่อมเพจไม่ได้ทั้งกระบวนการ**
  // (user report prod 2026-07-26) — ชื่อ permission ถูกต้องตามเอกสาร Meta แต่แอปเรายังไม่ได้
  // เปิดสิทธิ์นี้ ต้องเพิ่มเข้า use case ใน App Dashboard + ผ่าน App Review ก่อน
  //
  // ลำดับที่ถูกต้องเมื่อจะเอากลับ: เปิดใน App Dashboard → App Review ผ่าน → ค่อยใส่บรรทัดนี้กลับ
  // → ร้านที่เชื่อม IG ไว้แล้วต้องกดเชื่อมใหม่ถึงจะได้ยอดวิว (token เก่าไม่มี scope)
  // โค้ดฝั่ง shop-video.service ทนกับ token ที่ไม่มี scope นี้อยู่แล้ว (คืนยอดวิวเป็น null)
].join(',')

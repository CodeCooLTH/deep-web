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
  // messaging_referrals: ลูกค้าคลิกโฆษณา/ลิงก์ m.me แล้วเปิดแชท (feature 00018 Phase 2) — ต้อง subscribe
  // ไม่งั้น referral ที่ไม่มาพร้อมข้อความจะไม่เข้ามา (referral ในข้อความแรกมากับ messages อยู่แล้ว)
  'messaging_referrals',
] as const

// scope ที่ขอตอนเชื่อม Page — business_management เป็น dependency บังคับของ
// pages_messaging / pages_show_list / instagram_manage_messages (Meta docs)
export const CONNECT_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
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

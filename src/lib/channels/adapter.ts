// (S-1, feature 00025 TFR-LINE-13/TD-008) — สัญญากลางของ "ผู้ให้บริการช่องทางแชท"
//
// ทำไมต้องมีชั้นนี้: วันนี้ channel-chat.service.ts คุยกับ Meta (Messenger/Instagram) ผ่าน
// src/lib/facebook/graph.ts ตรง ๆ — พอจะเพิ่ม LINE เข้ามา (feature 00025) ถ้าไม่มีชั้นกลาง
// จะต้องเขียน `if (provider === 'LINE') ... else ...` กระจายทุกจุดที่ยิง Graph/LINE API ซึ่งเสี่ยง
// ทำ Messenger/IG พังทุกครั้งที่แก้โค้ดฝั่ง LINE (Messenger/IG เป็นระบบ production ที่ร้านใช้จริง
// ทุกวัน — ดู scope baseline 00025 §Risks)
//
// ไฟล์นี้เป็น "สัญญา" ล้วน ๆ — ห้าม import provider ใด ๆ (facebook/graph.ts, lib/line/*) เข้ามาที่นี่
// ผู้ที่รู้จัก provider จริงคือไฟล์ที่ implement (meta-adapter.ts, line-adapter.ts ในอนาคต S-4)

/**
 * ความสามารถของแต่ละ provider — ให้ caller เช็ค "ความสามารถ" แทนการเดาจาก provider string
 * (เช่น ห้ามเขียน `if (provider === 'LINE') { ...ไม่ล็อก UI... }` — ให้เช็ค `!capabilities.echo` แทน)
 */
export interface ChannelCapabilities {
  /** provider ส่ง "echo" ของข้อความที่เราส่งออกไปกลับมาทาง webhook ไหม
   *  Meta = true (ใช้ dedupe ผ่าน externalMessageId เดียวกัน) — LINE = false (LINE ไม่ echo ข้อความ
   *  ที่ยิงออกจาก Messaging API กลับมาที่ webhook เลย ต้องเขียน ChatMessage ตอนส่งเองเสมอ) */
  echo: boolean
  /** มีสถานะ "อ่านแล้ว" ของฝั่งลูกค้าไหม (Meta = true ผ่าน message_reads webhook, LINE = false —
   *  ไม่มี webhook ประเภทนี้ให้สมัครเลย) */
  readReceipt: boolean
  /** หน้าต่างตอบฟรีเป็นมิลลิวินาที (LINE = 60_000 นับจาก reply token ที่ได้รับมาพร้อม event) —
   *  Meta = null เพราะกติกาคนละแบบ (นับจากข้อความล่าสุดของลูกค้า ไม่ผูกกับ token ก้อนใดก้อนหนึ่ง —
   *  ดู MESSAGING_WINDOW_MS ใน channel-chat.service.ts) ห้ามตีความ null เป็น "ไม่มีหน้าต่าง" */
  freeWindowMs: number | null
  /** จำนวนชิ้นข้อความสูงสุดที่ยิงได้ใน 1 คำขอ — LINE = 5 (message array), Meta = 1 (ยิงทีละ
   *  message เสมอ ยังไม่รองรับ batch ที่นี่ — batching เป็นงานของ S-10) */
  maxPartsPerRequest: number
}

/**
 * ข้อความที่จะยิงออก 1 "ชิ้น" — `sendMessages` รับเป็น array เผื่อ provider ที่ batch ได้ (LINE)
 * รูปร่างยึดจากพารามิเตอร์ที่ channel-chat.service.ts ใช้ส่งออกจริงวันนี้ (ข้อความ/ไฟล์แนบ/สติกเกอร์
 * — ดู sendOutboundMessage) ไม่ประดิษฐ์ชนิดใหม่ที่ Messenger ไม่มีของเทียบ
 */
export type OutboundMessagePart =
  | { kind: 'text'; text: string }
  | {
      kind: 'attachment'
      attachmentKind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'
      url: string
      /** (เพิ่ม 2026-08-10, additive) URL ของ "รูปตัวอย่าง" ที่ย่อมาแล้ว — LINE image/video message
       *  บังคับ `previewImageUrl` แยกจากไฟล์เต็ม และจำกัดไว้ที่ **1MB** (ไฟล์เต็มได้ถึง 10MB/200MB)
       *  ผู้เรียกเป็นคนสร้าง (ดู `src/lib/line/preview-image.ts`) ไม่ใช่หน้าที่ adapter — ไม่มีค่านี้
       *  LineAdapter ถอยไปใช้ `url` เป็น preview ตามพฤติกรรมเดิม. Meta ไม่มีแนวคิดนี้ (MetaAdapter
       *  ไม่อ่าน field นี้เลย — undefined เสมอ ไม่กระทบพฤติกรรมเดิม) */
      previewUrl?: string
    }
  | {
      kind: 'sticker'
      stickerId: string
      /** (เพิ่ม S-18a, additive) LINE sticker message ต้องมี packageId คู่กับ stickerId เสมอ (Meta ใช้
       *  แค่ stickerId ตัวเดียว — field นี้เป็น undefined เสมอสำหรับ Meta ไม่กระทบ MetaAdapter) LineAdapter
       *  ปฏิเสธด้วย error อ่านออกถ้าไม่มีค่านี้ (ดู comment toLineMessage ใน line-adapter.ts) */
      packageId?: string
    }

/** ผลของ sendMessages — externalMessageId ของ "ข้อความหลัก" (ชิ้นแรกที่ส่งสำเร็จ) เก็บลง
 *  ChatMessage.externalMessageId เพื่อ dedupe กับ echo (provider ที่ capabilities.echo=false ก็ยัง
 *  ต้องคืนค่านี้ไว้อ้างอิง แม้จะไม่มี echo มาช่วย dedupe ก็ตาม) */
export interface SendMessagesResult {
  externalMessageId: string
  /** (เพิ่ม S-18a, additive) quoteToken ของข้อความที่เพิ่งส่งสำเร็จ — LINE เท่านั้น (ถ้า LINE คืนค่านี้มา
   *  จะอยู่ใน `sentMessages[].quoteToken` ของ response ยิง reply/push — 🛑 ยังไม่ได้ยืนยันกับ payload
   *  จริงว่ามาด้วยเสมอไหม อ่านแบบ defensive เสมอ ไม่มีก็ undefined เฉย ๆ) เก็บไว้ใน ChatMessage.rawMessage
   *  เพื่อให้ข้อความที่ "เรา" ส่งเองถูกอ้าง (quote) ต่อได้ในรอบถัดไป ไม่ใช่แค่ข้อความขาเข้าของลูกค้า
   *  Meta ไม่มีแนวคิดนี้ — MetaAdapter ไม่ใส่ค่านี้เลย (undefined เสมอ ไม่กระทบพฤติกรรมเดิม) */
  quoteToken?: string
}

/**
 * บริบทของ "เธรดหนึ่ง" ที่ adapter ต้องรู้ก่อนคุยกับ provider — รูปร่างยึดจากพารามิเตอร์ที่
 * sendTextMessage/sendAttachmentMessage ของ Messenger ใช้อยู่จริงวันนี้ (pageToken, recipientId,
 * replyToMid, tag) รวม `provider` เพราะ MetaAdapter ตัวเดียวรับใช้ทั้ง MESSENGER และ INSTAGRAM ซึ่ง
 * getContactProfile ภายในต้องรู้ว่าจะยิง endpoint แบบไหน (โครง response ของ Graph ต่างกัน)
 */
export interface ChannelContext {
  /** ShopChannel.provider จริง ('MESSENGER' | 'INSTAGRAM' | 'LINE' | ...) */
  provider: string
  /** token ที่ decrypt แล้ว (page access token ของ Meta / channel access token ของ LINE) */
  accessToken: string
  /** PSID/IGSID ของ Meta หรือ LINE userId ของผู้รับ — ไม่ต้องมีตอนเรียกแค่ fetchContactProfile/downloadContent */
  recipientId?: string
  /** externalMessageId ที่จะตอบทับ (quote/reply) — Meta ส่งเป็น reply_to:{mid}, LINE ไม่มีแนวคิดนี้ */
  replyToExternalId?: string | null
  /** tag สำหรับยิงนอกหน้าต่างตอบฟรี (Meta HUMAN_AGENT tag) — provider ที่ไม่มีแนวคิดนี้ (LINE) ไม่ต้องส่ง */
  tag?: string
  /** (เพิ่ม S-4, additive) reply token ของ LINE ที่จะใช้ยิง `POST /v2/bot/message/reply` — การตัดสินใจ
   *  ว่าจะส่งด้วย reply หรือ push **ไม่ใช่หน้าที่ของ adapter** (เป็นงานของ S-8 ใน channel-chat.service.ts)
   *  LineAdapter แค่เช็คว่า field นี้มีค่าไหม: มี → ยิง reply endpoint ด้วย token นี้, ไม่มี → ยิง push
   *  ด้วย `recipientId` แทน. Meta ไม่มีแนวคิด reply token เลย (ไม่ต้องส่ง field นี้ — undefined เสมอ
   *  ไม่กระทบ MetaAdapter) */
  replyToken?: string
  /** (เพิ่ม S-18a, additive) LINE quote token ของข้อความที่กำลังตอบทับ (quote reply) — แปะเข้า message
   *  object ตัวแรกของ parts เป็น field `quoteToken` เมื่อยิงจริง (ดู LineAdapter.sendMessages) caller
   *  (sendOutboundLineMessage) เป็นคนหา token นี้เอง (จาก ChatMessage.rawMessage ของข้อความที่ถูกอ้าง)
   *  ไม่ใช่หน้าที่ adapter — หาไม่เจอ/หมดอายุก็แค่ไม่ส่งค่านี้มา ไม่ throw (ต้องส่งข้อความต่อได้เสมอ)
   *  Meta ไม่มีแนวคิดนี้ (ใช้ replyToExternalId แทน) — MetaAdapter ไม่อ่าน field นี้เลย */
  quoteToken?: string
}

/** สิ่งที่จะ "ดาวน์โหลด" จาก provider — Meta ส่ง URL สาธารณะมากับ webhook อยู่แล้วเป็นทางหลัก
 *  (ref.url) ส่วน externalMessageId เป็น fallback (ดึง URL สดจาก Graph ด้วย mid — ดู
 *  fetchAttachmentUrl) LINE ไม่มี URL สาธารณะเลย ต้อง GET ด้วย token เสมอ (LineAdapter อนาคตจะไม่ใช้
 *  ref.url เลย ใช้แค่ ref.externalMessageId) */
export interface DownloadContentRef {
  url?: string
  externalMessageId?: string
}

/** ผลของ downloadContent — คืน "URL ที่ mirrorRemoteImage ยิง fetch เองได้" เพื่อให้
 *  channel-chat.service.ts ใช้ pattern mirror เดิมทุกประการ (ไม่ต้องเปลี่ยน mirrorRemoteImage) */
export interface DownloadContentResult {
  url: string | null
  /** (เพิ่ม S-4, additive) เนื้อหาดิบของสื่อ — ใช้เมื่อ provider ไม่มี URL สาธารณะให้ mirror ยิง
   *  fetch เอง (LINE ต้องดาวน์โหลดผ่าน DATA_API_BASE ด้วย token เสมอ ไม่มี URL ให้คืน) MetaAdapter ไม่ใช้
   *  field นี้เลย (ค่าเป็น undefined เสมอ, `url` ยังทำงานแบบเดิมทุกประการ ไม่กระทบ MetaAdapter)
   *  ผู้เรียก (S-7 media mirror ใน channel-chat.service.ts) ต้องเช็คตามลำดับ: `url` มีค่า → ใช้เส้นทาง
   *  fetch(url) เดิมของ mirrorRemoteImage เหมือน Meta ทุกประการ; `url` เป็น null แต่ `content` ไม่ใช่
   *  null/undefined → ใช้เส้นทาง buffer ตรง (ต้อง generalize mirrorRemoteImage ให้รับ buffer ได้ด้วย —
   *  งานของ S-7); ทั้งคู่เป็น null/undefined พร้อมกัน = ดาวน์โหลดไม่สำเร็จ (สร้าง placeholder ตาม
   *  TFR-LINE-09) */
  content?: { data: Buffer; contentType: string | null } | null
}

export interface ChannelAdapter {
  readonly capabilities: ChannelCapabilities

  /** ยิงข้อความออก 1 คำขอ (อาจมีหลายชิ้นถ้า provider รองรับ batch — ดู capabilities.maxPartsPerRequest) */
  sendMessages(ctx: ChannelContext, parts: OutboundMessagePart[]): Promise<SendMessagesResult>

  /** ดึงชื่อ/รูปโปรไฟล์ของผู้ติดต่อ — คืน null ทั้งคู่เมื่อดึงไม่ได้ (ห้าม throw — ดึงชื่อไม่ได้ไม่ใช่
   *  เหตุให้ข้อความหาย ดู getContactProfile เดิมของ facebook/graph.ts) */
  fetchContactProfile(
    ctx: ChannelContext,
    externalUserId: string,
  ): Promise<{ name: string | null; avatarUrl: string | null }>

  /** ดึง URL ของสื่อ/ไฟล์แนบให้พร้อม mirror เข้า storage เรา — ดู DownloadContentRef/DownloadContentResult */
  downloadContent(ctx: ChannelContext, ref: DownloadContentRef): Promise<DownloadContentResult>
}

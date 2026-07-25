// สัญญาของ "ช่องทางแชทภายนอก" (feature 00020 Phase 2 — provider abstraction)
//
// ทำไมต้องมีไฟล์นี้: ก่อนหน้านี้ channel-chat.service.ts คุยกับ Meta ตรง ๆ — ค่าคงที่หน้าต่าง
// 24 ชม. เป็น const เดี่ยว, เรียก sendTextMessage/sendImageMessage จาก lib/facebook/graph ตรง ๆ,
// และตีความ "token ตาย" ด้วย GraphApiError.code === 190. การเสียบช่องทางที่สอง (TikTok) ทับลงไป
// โดยไม่แยกชั้นก่อน จะกระจายเงื่อนไข `if (provider === '...')` ทั่วไฟล์ 683 บรรทัด และความเสียหาย
// จะไปโผล่ที่ Messenger ที่ร้านใช้จริงบน prod อยู่แล้ว ไม่ใช่ที่ช่องทางใหม่ที่ยังไม่มีใครใช้
// (BRD 00020 BR-TTC-35..37 / PRD §6.2 R-1)
//
// ขอบเขตของ Phase 2: **ไม่เปลี่ยนพฤติกรรมของช่องทางเดิมแม้จุดเดียว** — ไฟล์นี้กับ meta.ts เป็น
// การ "ย้ายที่อยู่" ของ logic เดิมเท่านั้น ยังไม่มี provider ของ TikTok (รอปิด OQ-TTC-02/03
// เรื่อง payload การส่งข้อความและวิธี verify ลายเซ็น webhook ก่อน — Phase 3)

/**
 * ความสามารถ/ข้อจำกัดของช่องทางหนึ่ง — ตัวที่ทำให้ "กฎการส่งขึ้นกับช่องทาง ไม่ใช่กฎเดียว
 * ทั้งระบบ" (BR-TTC-19) บังคับใช้ได้จากที่เดียว แทนที่จะกระจายเป็น if ทั่วโค้ด
 */
export type ChannelCapabilities = {
  /** ค่าที่เก็บใน Conversation.channel / ShopChannel.provider (String ไม่ใช่ enum — ดู schema) */
  readonly provider: string

  /**
   * หน้าต่างเวลาที่ร้านตอบลูกค้าได้ นับจากข้อความล่าสุด "ของลูกค้า" (Conversation.lastInboundAt)
   * - ตัวเลข = จำกัด (Meta 24 ชม.; TikTok Business Messaging 48 ชม. ตาม BR-TTC-21)
   * - `null` = **ไม่มีหน้าต่างเวลา** ตอบได้ตลอด (TikTok Shop ตาม BR-TTC-20)
   *
   * ห้ามอ่านค่านี้ไปคำนวณเอง — ใช้ resolveWindowState() เพื่อให้เคส null ถูกจัดการเหมือนกันทุกที่
   */
  readonly windowMs: number | null

  /** ร้านเริ่มบทสนทนาก่อนลูกค้าทักได้หรือไม่ (TikTok Shop = true, Business Messaging = false) */
  readonly canInitiate: boolean

  /**
   * ส่งติดกันได้กี่ข้อความก่อนลูกค้าตอบ — `null` = ไม่จำกัด
   * (TikTok Business Messaging = 10 ตาม BR-TTC-21; Meta ไม่จำกัดในกรอบ 24 ชม.)
   */
  readonly maxConsecutiveOutbound: number | null

  /** ความยาวข้อความสูงสุดที่ช่องทางรับ — เตือนก่อนกดส่ง ไม่ใช่ให้ error หลังส่ง (BR-TTC-22) */
  readonly textLimit: number

  /** ชนิดสื่อที่ **ส่งออก** ได้ — รอบนี้ทุกช่องทางส่งได้แค่ TEXT/IMAGE (PRD §5 out-of-scope) */
  readonly outboundMediaTypes: readonly string[]
}

/** ผลการคำนวณหน้าต่างเวลา — รูปเดิมของ getWindowState() ใน channel-chat.service (ห้ามเปลี่ยน field) */
export type WindowState = {
  open: boolean
  /** `null` = ไม่มีวันหมดอายุ (ช่องทางไม่มีหน้าต่างเวลา) หรือยังไม่เคยมีข้อความขาเข้า */
  expiresAt: Date | null
  /** `Infinity` เมื่อช่องทางไม่มีหน้าต่างเวลา — UI ต้องเช็ค `expiresAt === null` ไม่ใช่เอาเลขนี้ไปแสดง */
  msRemaining: number
}

/**
 * ปลายทางของการส่งออกหนึ่งครั้ง — ประกอบที่ service layer แล้วส่งเข้า provider
 * (provider ไม่แตะ DB และไม่รู้จัก Prisma เลย — ทดสอบแยกได้)
 */
export type OutboundTarget = {
  /** access token ที่ **ถอดรหัสแล้ว** — ห้าม log ห้ามส่งกลับ client (BR-TTC-05) */
  readonly accessToken: string
  /** ตัวระบุคู่สนทนาฝั่งช่องทางนั้น (PSID/IGSID ของ Meta; conversation id ของ TikTok Shop) */
  readonly recipientExternalId: string
  /**
   * externalId ของช่องทาง (Page ID / IG Business Account ID / TikTok shop id)
   * Meta **ไม่ใช้ค่านี้** ตอนส่ง — ใช้ `/me/messages` ให้ token resolve เอง เพราะช่องทาง IG เก็บ
   * IG account id ไม่ใช่ Page id ทำให้ Meta ตอบ "(#3) does not have the capability" (บั๊กจริงบน prod)
   * แต่ช่องทางอื่นอาจต้องใช้ จึงส่งเข้ามาให้ provider ตัดสินเอง
   */
  readonly channelExternalId: string
}

export interface ChannelProvider {
  readonly capabilities: ChannelCapabilities

  /** ส่งข้อความตัวอักษร — คืน id ข้อความจากต้นทาง (ใช้เป็น externalMessageId กันซ้ำ) หรือ null ถ้าต้นทางไม่ให้ */
  sendText(target: OutboundTarget, text: string): Promise<string | null>

  /**
   * ส่งรูป — `imageFileId` คือ fileId ของ storage ฝั่งเรา; provider ตัดสินเองว่าจะแปลงเป็น
   * presigned URL (Meta ดึงรูปไปเอง) หรืออัปโหลดขึ้นต้นทางก่อน (TikTok ใช้ images/upload)
   * `caption` ส่งแบบ best-effort ตามหลัง (Meta attachment ไม่มี text ในตัว)
   */
  sendImage(target: OutboundTarget, imageFileId: string, caption?: string): Promise<string | null>

  /**
   * error นี้หมายถึง "การเชื่อมต่อใช้ไม่ได้แล้ว ต้องให้ร้านเชื่อมใหม่" หรือไม่
   * (Meta = code 190) — service เอาไปตัดสินว่าจะตั้งสถานะช่องทางเป็น TOKEN_INVALID (BR-TTC-24)
   */
  isTokenDeadError(e: unknown): boolean

  /**
   * host ที่ยอมให้ mirror สื่อจากต้นทางได้ — allow-list ต่อ provider เพื่อกัน SSRF ผ่าน url ที่
   * ปลอมมากับ webhook (ถ้า app secret หลุด ผู้โจมตียัด url เป็น internal address ได้)
   */
  isMirrorAllowedHost(hostname: string): boolean
}

/**
 * คำนวณสถานะหน้าต่างเวลาจาก capabilities — **จุดเดียว** ที่รู้ว่า `windowMs === null` หมายถึง
 * "เปิดตลอด" ไม่ใช่ "ปิดตลอด" (ถ้าปล่อยให้แต่ละที่คำนวณเอง จะมีที่ที่ลืมเคส null แล้วบล็อกการส่ง
 * ของ TikTok Shop ทั้งที่ไม่มีข้อจำกัดนั้น)
 *
 * pure function — ไม่แตะ DB ไม่แตะ network ไม่อ่าน Date.now() เอง (รับ `now` เข้ามาเพื่อทดสอบได้)
 */
export function resolveWindowState(
  caps: Pick<ChannelCapabilities, 'windowMs'>,
  lastInboundAt: Date | null,
  now: Date = new Date(),
): WindowState {
  // ไม่มีหน้าต่างเวลา → เปิดตลอด แม้ลูกค้ายังไม่เคยทัก (ร้านที่ canInitiate ทักก่อนได้ — BR-TTC-20)
  if (caps.windowMs === null) {
    return { open: true, expiresAt: null, msRemaining: Number.POSITIVE_INFINITY }
  }
  if (!lastInboundAt) return { open: false, expiresAt: null, msRemaining: 0 }
  const expiresAt = new Date(lastInboundAt.getTime() + caps.windowMs)
  const msRemaining = expiresAt.getTime() - now.getTime()
  return { open: msRemaining > 0, expiresAt, msRemaining: Math.max(0, msRemaining) }
}

/**
 * meta-system-notice — ข้อความ "ระบบ" ที่ Facebook แทรกเข้ามาในเธรดเอง (feature 00018)
 *
 * user report 2026-07-30: เจอบับเบิลยาวเหยียดที่ขึ้นต้นว่า "คุณกำลังตอบกลับความคิดเห็นของผู้ใช้
 * ต่อโพสต์บนเพจของคุณ ดูความคิดเห็น(https://facebook.com/story.php?...comment_id=...)"
 * — เป็นบรรทัดบอกที่มาที่ Meta ยัดให้เมื่อแอดมินใช้ "ตอบกลับความคิดเห็นแบบส่วนตัว"
 * ไม่ใช่ข้อความที่ร้านพิมพ์ แต่ Meta ส่งมาในนามเพจ เราจึงเก็บเป็นข้อความฝั่งร้านตามปกติ
 *
 * รูปแบบที่ Meta ใช้: `<ข้อความ> <ป้ายลิงก์>(<url>)` — เป็น markdown ครึ่งใบที่ไม่มีใคร render ให้
 * ผลคือผู้ใช้เห็น URL ดิบเต็ม ๆ กลางแชท (user สั่งให้แสดงแบบ Messenger: บรรทัดกลางจอ + ลิงก์สั้น)
 *
 * pure module — ไม่ import อะไรเลย ใช้ได้ทั้ง client/server
 */

export interface MetaSystemNotice {
  /** ข้อความหลัก (ตัดป้ายลิงก์ออกแล้วถ้ามี) */
  text: string
  /** คำที่จะทำเป็นลิงก์ เช่น "ดูความคิดเห็น" — null เมื่อเป็นบรรทัดบอกสถานะที่ไม่มีลิงก์ */
  linkLabel: string | null
  url: string | null
}

/**
 * บรรทัดบอกสถานะที่ Meta ส่งมาโดยไม่มีลิงก์ (user report 2026-07-30 รอบสอง)
 * เท่าที่เจอจริง: "<ชื่อลูกค้า> replied to an ad." — Meta ส่งเป็นภาษาอังกฤษเสมอแม้เพจตั้งภาษาไทย
 * ขึ้นเป็นบับเบิลฝั่งร้านทำให้เข้าใจผิดว่าแอดมินพิมพ์เอง ทั้งที่เป็นป้ายบอกว่า "ลูกค้ามาจากโฆษณา"
 *
 * จับด้วยท้ายประโยคที่ตายตัว ไม่ใช่ทั้งประโยค เพราะส่วนหน้าคือชื่อคน (เปลี่ยนทุกคน)
 */
const PLAIN_NOTICE_PATTERNS: RegExp[] = [
  /\breplied to an ad\.?$/i,
  // คำอธิบายใต้การ์ดคำขอชำระเงิน (user report 2026-07-31) — Meta ส่งเป็นข้อความแยกจากตัวการ์ด
  // ในนามเพจ ทั้งที่เป็นคำบรรยายของระบบ: "You requested ฿400.00. <ชื่อลูกค้า> can review and
  // confirm this order." — ยึดท้ายประโยคที่ตายตัว เพราะตรงกลางคือชื่อคน (เปลี่ยนทุกคน)
  /\bcan review and confirm this order\.?$/i,
  // ป้ายอัตโนมัติของ Meta (พบจริง 21 ครั้งใน DB): "Auto-label added: Order status marked as
  // ordered." / "Auto-label added: Lead stage set to intake."
  /^Auto-label added:\s/i,
  // "Transfer requested" — บรรทัดบอกว่ามีการขอโอนเงิน (พบจริง 2 ครั้ง)
  /^Transfer requested$/i,
  // ป้ายสถานะลูกค้าที่ Meta ตั้งเอง — มาทั้งแบบมีและไม่มีคำนำหน้า "Auto-label added:"
  // พบจริง: "Lead stage set to Converted" 22 ครั้ง, "Lead stage set to Qualified" 11 ครั้ง
  /^Lead stage set to /i,
  // "<ชื่อลูกค้า> replied to your automated welcome message. To change or remove this greeting,
  // visit Messaging settings." — Meta บอกว่าลูกค้าตอบข้อความต้อนรับอัตโนมัติ (พบจริงหลายสิบครั้ง)
  /\breplied to your automated welcome message\./i,
  // placeholder ของข้อความที่ Meta ส่งมาโดยไม่มีทั้ง text และไฟล์แนบ (การ์ดโทรกลับ/การ์ดโฆษณา
  // ที่ Business Suite แสดงเป็นการ์ดจริง แต่ payload ไม่ได้มากับ webhook — ดู channel-chat.service)
  // ขึ้นเป็นบับเบิลสีร้านทำให้ดูเหมือนแอดมินพิมพ์ประโยคนี้เอง (user report 2026-07-31)
  // ตราบใดที่ยังแสดงการ์ดจริงไม่ได้ อย่างน้อยต้องดูเป็นหมายเหตุของระบบ ไม่ใช่คำพูดของร้าน
  // ครอบทุกป้ายที่ลงท้ายด้วย "— เปิดดูใน Messenger]" ไม่ใช่แค่ประโยคเดียว (2026-08-04): ตอน backfill
  // จาก Graph เราเริ่มบอกชนิดของการ์ดได้แล้ว ("[การ์ดปุ่มจาก Facebook เช่น ปุ่มโทร — เปิดดูใน
  // Messenger]", "[ลิงก์ที่แชร์ — …]" ฯลฯ ดู SYNCED_ATTACHMENT_LABEL) ถ้า regex ยังผูกกับข้อความ
  // เดิมคำต่อคำ ป้ายใหม่จะหลุดไปเป็นบับเบิลสีร้าน = ดูเหมือนแอดมินพิมพ์ประโยคนี้เอง (บั๊กเดิม 2026-07-31)
  /^\[.+ — เปิดดูใน Messenger\]$/,
  // การ์ดของ Facebook ที่ backfill ดึง "เนื้อหาจริง" มาได้แล้ว (2026-08-07) — เช่น
  // "[การ์ดจาก Facebook] โทรหา <ชื่อร้าน> — ส่งข้อความกระตุ้นให้โทรด้วยเสียงแล้ว"
  // ต้องอยู่บรรทัดระบบเหมือน placeholder เดิม ไม่ใช่บับเบิลสีร้าน: เครื่องมือของ Meta เป็นคนส่ง
  // ไม่ใช่แอดมิน (คงบทเรียน 2026-07-31 ไว้แม้ตอนนี้เราจะรู้เนื้อหาแล้วก็ตาม)
  // ผูกกับ CARD_PREFIX ใน channel-chat.service.ts — แก้ที่นั่นต้องแก้ที่นี่ด้วย
  /^\[การ์ดจาก Facebook\] /,
  // กล่องบริการที่ Meta แนบมาเอง (ผูกกับ META_SERVICE_CARD_TEXT ใน channel-chat.service.ts —
  // แก้ที่นั่นต้องแก้ที่นี่ด้วย เหมือน CARD_PREFIX บรรทัดบน) ต้องเป็นบรรทัดระบบจาง ๆ ไม่ใช่บับเบิล
  // ของลูกค้า: มันไม่ใช่สิ่งที่ลูกค้าพิมพ์ แม้ webhook จะส่งมาในนามลูกค้าก็ตาม (user เคาะ 2026-08-15)
  /^\[กล่องบริการจาก Meta — /,
  // บรรทัดแจ้งว่าลูกค้าโอนเงินผ่าน Messenger — Meta ส่งเป็น `message` เปล่า ๆ ในนาม **ลูกค้า**
  // (user report prod 2026-08-07 พร้อม screenshot: ขึ้นเป็นบับเบิลซ้ายพร้อมรูปโปรไฟล์ลูกค้า
  // ดูเหมือนลูกค้าพิมพ์ประโยคนี้เอง) พบจริง 3 รูป: "<ชื่อ> sent a ฿15,000.00 payment." ·
  // "<ชื่อ> sent a ฿360.00 payment." · "<ชื่อ> sent a payment." (ไม่มียอด)
  // ยึดท้ายประโยคที่ตายตัว เพราะส่วนหน้าคือชื่อคน และยอดเงินมี/ไม่มีก็ได้
  /\bsent a (?:฿[\d,.]+ )?payment\.?$/i,
  // Meta ชวนลูกค้าเชื่อมบัญชีธนาคารเพื่อให้ระบบตรวจสลิปให้ — ประโยคคงที่ ส่งในนามลูกค้าเช่นกัน
  // (พบจริง 3 ครั้ง; ไม่มี rawMessage เพราะเข้ามาก่อน 2026-08-03)
  /^เชื่อมต่อบัญชีธนาคารของคุณเพื่อตรวจสอบความถูกต้องของสลิป/,
  /**
   * รอบกวาดข้อความอังกฤษดิบทั้งฐาน prod (2026-08-15) — 3 ประโยคนี้ขึ้นเป็น **บับเบิลฝั่งร้าน**
   * มาตลอด ทำให้ดูเหมือนแอดมินพิมพ์เอง (บั๊กคลาสเดียวกับ 2026-07-31 ที่แก้ไปแล้วบางส่วน)
   * ทุกประโยคคัดจากฐานจริงคำต่อคำ ไม่ได้เดา — จำนวนที่พบ ณ วันกวาดกำกับไว้ท้ายบรรทัด
   */
  // "Messenger automatically created a transfer request. Learn more" (35 ใบ) — คำอธิบายที่ Meta
  // แนบมาคู่กับการ์ด Transfer requested. ไม่เข้า PATTERN แบบมีลิงก์เพราะ "Learn more" ไม่มี (url)
  // ต่อท้าย (Meta ส่งมาเป็นข้อความเปล่า ๆ)
  /^Messenger automatically created a transfer request\./i,
  // "The calling window has been reset to 7 days from the end of the previous call." (15 ใบ)
  /^The calling window has been reset to /i,
  // "This message was automatically moved to spam." (8 ใบ) — Meta บอกว่าย้ายข้อความไปสแปมเอง
  /^This message was automatically moved to spam\./i,
]

/**
 * เงื่อนไขที่ยอมรับว่าเป็น "ข้อความระบบ" — ตั้งให้แคบไว้ก่อน เพราะถ้าจับพลาดจะเอาข้อความจริง
 * ของร้านไปแสดงเป็นบรรทัดระบบ (เสียหายกว่าปล่อยให้บางอันหลุดเป็นบับเบิลธรรมดา):
 *   1. บรรทัดเดียว — ข้อความคนพิมพ์ที่มีลิงก์มักมีหลายบรรทัด
 *   2. จบด้วย `)` และมี `(` นำหน้า URL ติดกับป้ายลิงก์ (ไม่มีเว้นวรรคคั่น)
 *   3. โดเมนต้องเป็นของ Meta เท่านั้น
 * ครอบคลุมทั้งภาษาไทย/อังกฤษโดยไม่ต้อง hardcode ถ้อยคำ (เพจตั้งภาษาต่างกันได้)
 */
const META_HOSTS = /^https?:\/\/(?:www\.|m\.|web\.)?(?:facebook|messenger|fb)\.com\//i
const PATTERN = /^(.+?)\s(\S+)\((https?:\/\/[^\s)]+)\)$/

export function parseMetaSystemNotice(body: string | null | undefined): MetaSystemNotice | null {
  if (!body) return null
  const line = body.trim()
  if (line.includes('\n')) return null

  // แบบไม่มีลิงก์ — เทียบท้ายประโยคที่ตายตัว (ดู PLAIN_NOTICE_PATTERNS)
  if (PLAIN_NOTICE_PATTERNS.some((re) => re.test(line))) {
    return { text: line, linkLabel: null, url: null }
  }

  const m = PATTERN.exec(line)
  if (!m) return null

  const [, text, linkLabel, url] = m
  if (!META_HOSTS.test(url)) return null
  // ป้ายลิงก์ที่ยาวผิดปกติแปลว่า regex ไปคว้าคำสุดท้ายของประโยคธรรมดามา ไม่ใช่ป้ายลิงก์จริง
  if (linkLabel.length > 40) return null

  return { text: text.trim(), linkLabel, url }
}

/**
 * parseMetaAiHandoffNotice — ข้อความ "ระบบ" ที่ Meta แทรกเวลาสิทธิ์คุมเธรดสลับมือระหว่าง
 * เอเจนต์ AI ↔ คน (feature "เธรดที่ Meta AI ถือสิทธิ์คุมอยู่" 2026-08-08)
 *
 * สตริงต้นทาง 4 ค่านี้ query มาจากฐาน prod ตรงตัว (2026-08-08) — ห้ามเดา ห้ามย่อ. ถ้า Meta
 * เพิ่มสตริงใหม่ที่ไม่อยู่ในลิสต์นี้ ฟังก์ชันคืน null แล้วข้อความนั้นจะตกไปเป็นบับเบิลอังกฤษ
 * ตามปกติ (fail-soft ไม่พัง) เหมือน parseMetaSystemNotice
 *
 * คำแปลแถวที่ 2 ("คุณเข้ามาดูแลแชทนี้แทนเอเจนต์ AI") คือคำที่ Meta ใช้เองใน Business Suite
 * ภาษาไทย (user ยืนยันจาก screenshot) — ห้ามเปลี่ยนถ้อยคำ
 *
 * รูปร่าง MetaSystemNotice เดียวกับ parseMetaSystemNotice เพื่อให้ JSX render จุดเดียวกัน
 * ใน ChatThread.tsx ใช้ได้กับทั้งคู่โดยไม่ต้องแก้ (linkLabel/url = null เมื่อไม่มีลิงก์)
 */
type AiHandoffNotice = { en: string; th: string; hasLink: boolean; control: 'AI' | 'HUMAN' }

const AI_HANDOFF_NOTICES: AiHandoffNotice[] = [
  // AI เปิดอยู่แล้ว ไม่มีอะไรให้ "เปิดกลับ" จึงไม่มีลิงก์
  {
    en: 'Your AI agent will respond.',
    th: 'เอเจนต์ AI ของ Meta เริ่มตอบแทนคุณในแชทนี้แล้ว',
    hasLink: false,
    control: 'AI',
  },
  {
    en: 'You took over this chat from your AI agent.',
    th: 'คุณเข้ามาดูแลแชทนี้แทนเอเจนต์ AI',
    hasLink: true,
    control: 'HUMAN',
  },
  {
    en: 'Your AI agent transferred this chat to you. Teach your AI so it can respond next time.',
    th: 'เอเจนต์ AI ส่งต่อแชทนี้ให้คุณดูแล — สอน AI เพิ่มเพื่อให้ตอบเองได้ครั้งหน้า',
    hasLink: true,
    control: 'HUMAN',
  },
  {
    en: 'Your AI agent transferred this chat to you because your customer is ready to buy.',
    th: 'เอเจนต์ AI ส่งต่อแชทนี้ให้คุณดูแล เพราะลูกค้าพร้อมสั่งซื้อแล้ว',
    hasLink: true,
    control: 'HUMAN',
  },
  /**
   * รูปสั้นของประโยคเดียวกับข้างบน — Meta ส่งทั้งแบบมีและไม่มีส่วนขยายท้ายประโยค
   *
   * 🛑 `parseMetaAiHandoffNotice` เทียบ `n.en === line` แบบ **ตรงทั้งประโยค** ⇒ รูปสั้นไม่เคย
   * match สักครั้ง ตกไปเป็นบับเบิลอังกฤษฝั่งร้าน (พบจริงบนฐาน prod 20 ใบ ล่าสุด 2026-08-15)
   * เจอตอนกวาดข้อความอังกฤษดิบทั้งฐาน 2026-08-15 — 2 รูปยาวถูกดักไว้ตั้งแต่ 08-08 แต่รูปสั้น
   * หลุดมาตลอดเพราะตอนนั้น query เห็นแต่รูปยาว
   */
  {
    en: 'Your AI agent transferred this chat to you.',
    th: 'เอเจนต์ AI ส่งต่อแชทนี้ให้คุณดูแล',
    hasLink: true,
    control: 'HUMAN',
  },
]

const AI_HANDOFF_LINK_LABEL = 'เปิด AI กลับใน Business Suite'
const AI_HANDOFF_LINK_URL = 'https://business.facebook.com/latest/inbox/all'

export function parseMetaAiHandoffNotice(body: string | null | undefined): MetaSystemNotice | null {
  if (!body) return null
  const line = body.trim()
  const hit = AI_HANDOFF_NOTICES.find((n) => n.en === line)
  if (!hit) return null
  return {
    text: hit.th,
    linkLabel: hit.hasLink ? AI_HANDOFF_LINK_LABEL : null,
    url: hit.hasLink ? AI_HANDOFF_LINK_URL : null,
  }
}

/**
 * ใครถือสิทธิ์คุมเธรดหลังข้อความ marker นี้ — `'AI'` = เอเจนต์ของ Meta, `'HUMAN'` = คน
 *
 * 🛑 ทำไมต้องอ่านจาก marker ไม่ใช่จาก `ChatMessage.viaStandby` (บั๊ก prod 2026-08-09):
 * `viaStandby` แปลว่า **"เราไม่ใช่เจ้าของเธรด"** ซึ่งเป็นจริง *ตลอดเวลา* บนเพจเหล่านี้ (เจ้าของคือ
 * Page Inbox `263902037430900` เสมอ แอปเราไม่เคยเป็นเจ้าของเลย) — พอ AI คืนสิทธิ์แล้วคนตอบเอง
 * จาก Business Suite/Messenger echo ก็ยังวิ่งมาทางกล่อง standby อยู่ดี ธงจึงค้าง `true`
 * แล้ว UI บล็อกช่องพิมพ์ไว้ทั้งที่คนกำลังคุยอยู่ (18 เธรดพร้อมกันบน prod)
 *
 * ที่หลงเชื่อตอนแรกเพราะทดสอบเจอแต่เคส **"คนกด take over"** (Page Inbox ยึดสิทธิ์จริง → ธงพลิกเป็น
 * false) ยังไม่เคยเจอเคส **"AI ส่งคืนเอง"** (สิทธิ์ไม่ได้เปลี่ยนมือ → ธงค้าง true) — สองเคสนี้
 * หน้าตาเหมือนกันจากฝั่งผู้ใช้ แต่ signal ต่างกันคนละเรื่อง
 *
 * marker ของ Meta เป็นการประกาศสถานะตรง ๆ ไม่ใช่ผลข้างเคียงของ routing จึงเชื่อได้ทั้งสองทิศ
 */
export type MetaAiThreadControl = 'AI' | 'HUMAN'

export function readMetaAiControlMarker(body: string | null | undefined): MetaAiThreadControl | null {
  if (!body) return null
  const hit = AI_HANDOFF_NOTICES.find((n) => n.en === body.trim())
  return hit ? hit.control : null
}

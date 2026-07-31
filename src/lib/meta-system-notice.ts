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
  /^\[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger\]$/,
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

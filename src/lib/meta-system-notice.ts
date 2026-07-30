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
const PLAIN_NOTICE_PATTERNS: RegExp[] = [/\breplied to an ad\.?$/i]

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

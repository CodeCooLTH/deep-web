/**
 * chat-placeholder-text — คำที่ขึ้นแทนเนื้อหาที่เราแสดงเองไม่ได้ (SSOT · HR16)
 *
 * 🛑 ทำไมต้องผันตามช่องทาง: ตารางเดิม (`FAILED_TEXT_BY_TYPE` ใน channel-chat.service) ฮาร์ดโค้ด
 * คำว่า **"เปิดดูใน Messenger"** ไว้ 11 บรรทัด แล้วเส้นทาง ingest ของ **Instagram ใช้ตารางเดียวกัน**
 * ⇒ ไฟล์แนบทุกชนิดที่ mirror ไม่ผ่านบน IG จะสั่งให้ผู้ขายไปเปิดแอปที่ไม่มีข้อความนั้นอยู่
 * (บั๊กที่มีอยู่ก่อน พบ 2026-08-26 ตอนไล่เคสสติกเกอร์ IG)
 *
 * 🛑 `emptyMessageText()` — ข้อความที่ Meta ส่ง `message` มาแต่**ไม่มีทั้ง text และ attachment**
 * ของเดิมเขียนตายตัวว่า *"[ข้อความพิเศษ เช่น คำขอโทรกลับ — ระบบยังไม่รองรับ]"* ตั้งแต่ 2026-07-26
 * ตอนที่ยังไม่รู้สาเหตุ. เปิด `rawMessage` บน prod แล้ว (6 ใบ ตั้งแต่ 08-03) พบว่าเป็น **3 เรื่อง
 * คนละอย่างกัน** และคำเดิมถูกแค่เรื่องเดียว:
 *
 *   1. `is_unsupported: true` — Meta ประกาศเองว่าชนิดนี้ไม่ส่งเนื้อหามาให้
 *      (ยืนยันเคสจริง 2026-08-26 17:37: ร้านส่ง **สติกเกอร์ใน Instagram** → ได้ `mid` + ธงนี้
 *      ไม่มี attachment ไม่มี url เลย)
 *   2. `ai_generated: true` (+ `app_id` ของ Page Inbox, `metadata: {"source":"axon"}`)
 *      — **AI ของ Meta เป็นคนเขียนข้อความนั้น** เนื้อหาไม่ถูกส่งมาให้เรา
 *   3. ไม่มีธงอะไรเลย — ยังไม่รู้จริง ๆ (เคสที่น่าจะเป็นการ์ด "Call me in Messenger")
 *
 * ⇒ ห้ามเดาแทนผู้ใช้: มีธงบอกชนิดถึงพูดชื่อชนิด ไม่มีธงก็บอกตามตรงว่าไม่รู้
 */

/** ชื่อแอปที่ผู้ขายต้องไปเปิดดูเนื้อหาที่เราแสดงไม่ได้ */
export function metaAppName(provider: string): string {
  return provider === 'INSTAGRAM' ? 'Instagram' : 'Messenger'
}

/**
 * คำแทนไฟล์แนบที่ mirror ไม่ผ่าน / ชนิดที่เราไม่รองรับ — แยกตามชนิด ไม่ใช่ "[ไฟล์แนบ]" รวมทุกอย่าง
 * (I-5, user 2026-07-24) · `attType` ที่ไม่รู้จักตกไปคำกลาง ๆ ไม่ใช่เดาว่าเป็นรูป
 */
export function attachmentFailedText(provider: string, attType: string | null | undefined): string {
  const app = metaAppName(provider)
  // sticker/reel/ig_reel/post/ig_post = alias ของ image/video/fallback ตามลำดับ
  const byType: Record<string, string> = {
    // เขียนแบบไม่ระบุผู้ส่ง เพราะ ingest ใช้ path เดียวกันทั้งข้อความลูกค้าและ echo ของร้าน
    // ("ลูกค้าส่ง…" จะโกหกเมื่อคนส่งคือร้านเอง — เห็นจริงบน prod)
    image: `[รูปภาพ — เปิดดูใน ${app}]`,
    sticker: `[รูปภาพ — เปิดดูใน ${app}]`,
    video: `[วิดีโอ — เปิดดูใน ${app}]`,
    reel: `[วิดีโอ — เปิดดูใน ${app}]`,
    ig_reel: `[วิดีโอ — เปิดดูใน ${app}]`,
    audio: `[ข้อความเสียง — เปิดดูใน ${app}]`,
    file: `[ไฟล์แนบ — เปิดดูใน ${app}]`,
    location: `[ตำแหน่งที่ตั้ง — เปิดดูใน ${app}]`,
    fallback: `[ลิงก์/โพสต์ที่แชร์ — เปิดดูใน ${app}]`,
    post: `[ลิงก์/โพสต์ที่แชร์ — เปิดดูใน ${app}]`,
    ig_post: `[ลิงก์/โพสต์ที่แชร์ — เปิดดูใน ${app}]`,
    template: `[ข้อความจากระบบ (ออเดอร์/ชำระเงิน) — เปิดดูใน ${app}]`,
    // สตอรี่เป็นของ Instagram เสมอ ไม่ว่า provider จะถูกส่งมาว่าอะไร
    story_mention: '[กล่าวถึงในสตอรี่ — เปิดดูใน Instagram]',
  }
  return (attType && byType[attType]) ?? `[ไฟล์แนบ — เปิดดูใน ${app}]`
}

/** ธงจาก payload ที่บอกได้ว่า "ข้อความเปล่า" ใบนี้คืออะไร — ทุกตัว optional ตามกติกา external payload */
export type EmptyMessageFlags = {
  isUnsupported?: boolean
  aiGenerated?: boolean
}

export function emptyMessageText(provider: string, flags: EmptyMessageFlags = {}): string {
  const app = metaAppName(provider)

  // AI ของ Meta มาก่อน `is_unsupported`: ถ้ามาพร้อมกัน สิ่งที่ผู้ขายต้องรู้คือ "มีคนอื่นตอบลูกค้าไปแล้ว"
  // ซึ่งเปลี่ยนการตัดสินใจของเขา ส่วน "ชนิดนี้ไม่รองรับ" เป็นเรื่องเชิงเทคนิคที่ทำอะไรต่อไม่ได้
  if (flags.aiGenerated) return `[AI ของ Meta ตอบลูกค้าไปแล้ว — เปิดดูใน ${app}]`

  if (flags.isUnsupported) {
    // ยกตัวอย่าง "สติกเกอร์" เฉพาะ Instagram เพราะนั่นคือเคสเดียวที่เรายืนยันด้วย payload จริงแล้ว
    // (2026-08-26) — ฝั่ง Messenger ยังไม่เคยเห็นตัวอย่าง จึงไม่เดาชนิดให้
    return provider === 'INSTAGRAM'
      ? '[สติกเกอร์หรือข้อความชนิดที่ Instagram ไม่ส่งเนื้อหามาให้ — เปิดดูในแอป Instagram]'
      : `[ข้อความชนิดที่ ${app} ไม่ส่งเนื้อหามาให้ — เปิดดูใน ${app}]`
  }

  // ไม่มีธง = ยังไม่รู้ว่าคืออะไร — ห้ามฟันธงว่าเป็นการโทรกลับ (คำเดิมเดาไว้แล้วผิด 2 ใน 3 เคส)
  return `[ข้อความที่ระบบแสดงไม่ได้ — เปิดดูใน ${app}]`
}

/**
 * preview ในรายการแชท (คอลัมน์ซ้าย) — **ต้องสั้นเสมอ** แม้ body จะยาว
 *
 * กติกาเดิมของไฟล์ที่เรียกใช้: placeholder ยาวเก็บไว้ในบับเบิลเพื่อบอกทางออก ส่วนรายการแชทต้อง
 * กระชับ ไม่งั้นไปเบียดชื่อลูกค้าในแถวเดียวกัน (user report 2026-07-25)
 */
export function emptyMessagePreview(flags: EmptyMessageFlags = {}): string {
  // แยกเฉพาะเคสที่ "เปลี่ยนสิ่งที่ผู้ขายต้องทำต่อ" — `ai_generated` แปลว่ามีคนตอบลูกค้าไปแล้ว
  // ส่วนเคสอื่นบอกได้แค่ว่าแสดงไม่ได้ ซึ่งอ่านจากรายการแชทแล้วทำอะไรต่อไม่ได้อยู่ดี
  if (flags.aiGenerated) return '[AI ของ Meta ตอบแล้ว]'
  return '[ข้อความที่แสดงไม่ได้]'
}

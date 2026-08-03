/**
 * chat-send-failure — แปล `ChatMessage.failureReason` เป็นภาษาไทยสำหรับร้านค้า (feature 00018)
 *
 * user report 2026-08-02: บับเบิลที่ส่งไม่ออกขึ้นว่า "ส่งไม่สำเร็จ — (#551) This person isn't
 * available right now." ร้านอ่านแล้วไม่รู้ว่าเกิดอะไรและต้องทำอะไรต่อ (ผิดพลาดของเรา? กดส่งซ้ำ
 * ได้ไหม? ต้องเชื่อมเพจใหม่?) — เราเก็บ `e.message` ของ Meta ดิบ ๆ ลง DB ซึ่ง Meta ส่งเป็น
 * ภาษาอังกฤษเสมอแม้เพจตั้งภาษาไทย
 *
 * เจตนา: **แปลตอนแสดงผล ไม่ใช่ตอนเขียน DB** — คอลัมน์ยังเก็บข้อความดิบของ Meta ไว้เหมือนเดิม
 * (ซัพพอร์ต/เราต้องใช้สืบสวน + แถวเก่าที่เก็บไว้แล้วได้คำแปลย้อนหลังฟรี)
 *
 * ขอบเขตที่แปล: เท่าที่ยืนยันได้จริงเท่านั้น เพราะแปลผิด = ชี้ร้านไปผิดทาง เสียหายกว่าปล่อย
 * อังกฤษไว้ (เอกสาร error code ของ Meta ตอบ HTTP 500 ตอนทำ ตรวจสอบไม่ได้)
 *   - #551 — reproduce เองแล้วบนเพจจริง 2026-08-02: ยิงแม้แต่ sender_action ที่ไม่มีเนื้อหา
 *     ก็โดนปฏิเสธ ขณะที่เพจเดียวกันส่งหาลูกค้าคนอื่นสำเร็จในนาทีเดียวกัน = สถานะฝั่งบัญชีลูกค้า
 *   - #190 — ระบบเราถือว่า token ตายอยู่แล้ว (channel-chat.service เรียก markChannelTokenInvalid)
 *   - หน้าต่าง 24 ชม. / rate limit — จับจาก "ถ้อยคำ" ของ Meta ไม่ใช่เลข code เพราะเลข subcode
 *     ที่เคยเชื่อกันว่าผูกกับหน้าต่าง (1545041) วันนี้พิสูจน์แล้วว่าเด้งตอนหน้าต่างยังเปิดอยู่ด้วย
 * นอกเหนือจากนี้ = คงข้อความดิบไว้ทั้งดุ้น ไม่เดา ไม่กลืนหาย
 *
 * pure module — ไม่ import อะไรเลย ใช้ได้ทั้ง client/server
 */

/** ขึ้นต้นประโยคเดียวกันทุกที่ที่รายงานว่าส่งไม่ออก (badge ในเธรด + toast จาก API) */
const PREFIX = 'ส่งไม่สำเร็จ'

export interface SendFailureDescription {
  /** เฉพาะสาเหตุ (ไม่มีคำนำหน้า) — ใช้เมื่อ UI มีหัวข้อของตัวเองอยู่แล้ว */
  text: string
  /** ประโยคเต็มพร้อมแสดง — ใช้ตัวนี้เป็นหลัก เพื่อให้ทุกหน้าจอพูดเหมือนกันเป๊ะ */
  message: string
  /** เลข error ของ Meta ถ้าแกะได้ (ไว้แสดงกำกับ/ให้ซัพพอร์ตอ้างอิง) */
  metaCode: number | null
  /** true = เรารู้จักสาเหตุนี้และแปลแล้ว; false = ข้อความดิบ */
  known: boolean
}

/** Meta ใส่เลข error ไว้หน้าประโยคเป็น "(#551) ..." หรือท้ายประโยคก็มี (เช่น token error) */
const META_CODE = /\(#(\d+)\)/

interface Rule {
  match: (raw: string, code: number | null) => boolean
  text: string
}

const RULES: Rule[] = [
  {
    // "(#551) This person isn't available right now." — Meta บอกแค่ว่า "ผู้รับไม่พร้อม" ไม่บอกสาเหตุ
    // จึงนำด้วยข้อเท็จจริงนั้น แล้ววงเล็บสาเหตุที่เป็นไปได้ไว้ (ห้ามฟันธงสิ่งที่ระบบไม่รู้จริง)
    // ไม่เขียนว่า "กดส่งซ้ำไม่ได้" เพราะปุ่ม "ลองใหม่" มีอยู่จริงบนบับเบิล — จะขัดกันเอง
    // บอกเงื่อนไขที่ต้องเกิดก่อนแทน (ลูกค้าทักกลับ) ร้านจะได้รู้ว่ากดตอนนี้ยังไม่ผ่าน
    match: (_raw, code) => code === 551,
    text: 'ลูกค้าไม่พร้อมรับข้อความ (ปิดรับข้อความจากเพจ หรือปิด/ลบบัญชี) — ต้องรอให้ลูกค้าทักเข้ามาใหม่ก่อนจึงจะส่งได้',
  },
  {
    // token เพจถูกถอนสิทธิ์/หมดอายุ — ร้านต้องไปเชื่อมเพจใหม่เอง ระบบทำแทนไม่ได้
    // ถ้อยคำล้อกับ CHANNEL_NOT_ACTIVE ใน api/chat/.../messages/route.ts (เรื่องเดียวกัน ต้องพูดเหมือนกัน)
    match: (raw, code) => code === 190 || /access token/i.test(raw),
    text: 'การเชื่อมต่อกับช่องทางนี้หมดอายุ — เชื่อม Facebook Page ใหม่อีกครั้ง แล้วส่งใหม่',
  },
  {
    // ถ้อยคำล้อกับ WINDOW_CLOSED ใน route เดียวกัน + เติมตัวเลขให้ร้านรู้ว่านับจากอะไร
    match: (raw) => /outside\s+(?:of\s+)?(?:the\s+)?allowed\s+window|24[-\s]?hour/i.test(raw),
    // สั้นลงจากเดิม ~30% (2026-08-03) — หลังเลิกล็อกช่องพิมพ์ตามหน้าต่าง 24 ชม. ข้อความนี้
    // กลายเป็นเหตุผลที่ร้านเห็นบ่อยที่สุด และมันอยู่บนบับเบิลที่แคบบนจอมือถือ. ยังครบ 3 อย่าง
    // ที่ต้องมี: เกิดอะไร / กรอบเวลา / ต้องทำอะไรต่อ
    text: 'เกินเวลาที่ Meta ให้ตอบ (24 ชม. นับจากลูกค้าทักล่าสุด) — ต้องรอให้ลูกค้าทักเข้ามาใหม่ก่อน',
  },
  {
    match: (raw) => /rate limit|too many (?:calls|requests)/i.test(raw),
    text: 'ส่งถี่เกินที่ Meta กำหนด — รอสักครู่แล้วลองใหม่อีกครั้ง',
  },
  {
    match: (raw) => /no matching user found/i.test(raw),
    text: 'ไม่พบบัญชีผู้รับนี้แล้ว — ลูกค้าอาจลบบัญชีหรือเลิกเชื่อมต่อกับเพจไปแล้ว',
  },
]

/**
 * ตัดคำนำหน้า "ส่งไม่สำเร็จ — " ออก เหลือแต่ตัวเหตุผล
 *
 * ทำไมต้องมี: บับเบิลที่ล้มเหลวมี 2 เส้นทาง — แถวที่บันทึกลง DB แล้ว (ใช้ `describeSendFailure().text`
 * ซึ่งเป็นเหตุผลล้วน) กับข้อความ optimistic ที่ยังไปไม่ถึง server (ได้ข้อความจาก `body.error` ซึ่ง
 * บางเส้นทางเติมคำนำหน้ามาแล้ว บางเส้นทางยังไม่เติม) UI วาง "ส่งไม่สำเร็จ" เป็นป้ายของตัวเองแล้ว
 * ทั้งสองเส้นทางจึงต้องส่งเข้ามาเป็นเหตุผลล้วนเหมือนกัน ไม่งั้นจะอ่านได้ว่า
 * "ส่งไม่สำเร็จ (i) ส่งไม่สำเร็จ — เกินเวลา…"
 */
export function stripSendFailurePrefix(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return null
  if (!trimmed.startsWith(PREFIX)) return trimmed
  // ตัดทั้งคำนำหน้าและตัวคั่น (em dash พร้อมช่องว่างรอบข้าง) ถ้ามี
  const rest = trimmed.slice(PREFIX.length).replace(/^\s*—\s*/, '').trim()
  return rest || null
}

export function describeSendFailure(reason: string | null | undefined): SendFailureDescription {
  const raw = (reason ?? '').trim()

  const done = (text: string, metaCode: number | null, known: boolean): SendFailureDescription => ({
    text,
    message: `${PREFIX} — ${text}`,
    metaCode,
    known,
  })

  if (!raw) return done('ไม่ทราบสาเหตุ', null, false)

  const m = META_CODE.exec(raw)
  const metaCode = m ? Number(m[1]) : null

  const hit = RULES.find((r) => r.match(raw, metaCode))
  if (hit) return done(hit.text, metaCode, true)

  // ไม่รู้จัก — ส่งดิบต่อไปตามเดิม ดีกว่าแปลมั่วหรือซ่อนจนสืบไม่ได้
  return done(raw, metaCode, false)
}

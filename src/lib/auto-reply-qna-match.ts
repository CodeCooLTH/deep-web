// feature 00023 Deep Chat-Bot Assistant — phase `00023-qna` S-03
// SSOT: docs/20 - Features/00023 - Deep Chat-Bot Assistant/SRS.md TFR-031
//       + DATABASE.md §3.9 / §3.9.1
//
// [ข้อบังคับสูงสุด] ฟังก์ชันในไฟล์นี้ต้อง "บริสุทธิ์" (pure) เด็ดขาด — ข้อเดียวกับ
// `auto-reply-match.service.ts`: ห้ามเขียน/อ่าน DB, ห้าม import Prisma, ห้ามส่งข้อความ,
// ห้าม `new Date()`, ห้าม `Math.random()`
//
// เหตุผลไม่ใช่เรื่องความสวยงามของโค้ด: `POST /api/shops/auto-reply/simulate` ต้องเรียก
// ฟังก์ชัน **ตัวเดียวกับเส้นทางตอบจริง** (AC-020-05) ถ้าที่นี่มี I/O หรือเวลาที่ไม่ถูกควบคุม
// เมื่อไหร่ หน้าทดสอบจะให้ผลไม่ตรงกับที่จะเกิดจริง แล้วอาการที่ร้านเห็นคือ
// "ทดสอบผ่านแต่ของจริงเงียบ" ซึ่งแยกไม่ออกจากบั๊กของตัวระบบเอง
//
// ผู้เรียก (`auto-reply.service.loadRuleSet`) เป็นคนโหลด qnaSet มาให้เป็น argument เท่านั้น

/**
 * โหมดการจับคู่ของคลังคำถาม
 *
 * v1 มีค่าเดียวคือ `EXACT` — user ตัดสิน 2026-07-31: "ตรงตัวก่อน ความคล้ายเปิดทีหลัง"
 * (Scope Baseline `00023-qna` A1)
 *
 * ทำไมพารามิเตอร์ `mode` ถึงมีมาตั้งแต่ v1 ทั้งที่มีค่าเดียว: เพื่อให้การเปิดโหมดที่สอง
 * (`SIMILARITY` ด้วย trigram Dice) เป็นการ **เพิ่มสาขา** ไม่ใช่การรื้อลายเซ็นฟังก์ชัน
 * ที่ตอนนั้นจะมี caller อยู่หลายที่แล้ว (processJob + simulate route + test)
 *
 * คอลัมน์ `AutoReplyKeyword.qnaSimilarityEnabled` มีอยู่ใน DB แล้วแต่ **ยังไม่มีที่ไหนอ่าน**
 */
export const QNA_MATCH_MODES = ['EXACT'] as const
export type QnaMatchMode = (typeof QNA_MATCH_MODES)[number]

/** ข้อหนึ่งในคลังคำถามที่ caller โหลดมาให้ (กรอง shopId ที่ query แล้ว) */
export interface QnaSetItem {
  id: string
  /** null = ข้อในคลังกลางของร้าน ไม่ผูกกลุ่มคำ — `matchQna` ข้ามข้อพวกนี้เสมอ
   *  เพราะการจับคู่ตรงตัวต้องมีกลุ่มให้ "ยืมเป็นเจ้าของ" ไปเดิน gate 6.5/6.6/7 (TFR-032 ข้อ 2)
   *  ข้อที่ไม่ผูกกลุ่มเป็นความรู้สำหรับ ChatBot ซึ่งเดินคนละเส้นทาง */
  keywordId: string | null
  /** คำถามที่ร้านพิมพ์ (raw) — ใช้แสดงในป้าย DeepBot / บันทึก */
  question: string
  /** ผ่าน `normalizeMessage()` มาแล้วตอนบันทึก — ไฟล์นี้ไม่ normalize เอง */
  normalizedQuestion: string
  answer: string
  imageFileIds: string[]
  isActive: boolean
  /** จำนวนครั้งที่ถูกใช้ตอบจริง — เกณฑ์ที่ 2 ของ DATABASE §3.9.1 */
  useCount: number
}

/**
 * กลุ่มคำที่ "ยังทำงานอยู่" ของร้าน — caller ส่งมาจาก ruleSet.keywords ซึ่งกรอง OFFLINE
 * ออกไปแล้วตั้งแต่ query (`status: { not: 'OFFLINE' }`)
 *
 * WARNING: การรับ list นี้เข้ามาไม่ใช่แค่เพื่อ `priority` — มันคือกลไกที่ทำให้
 * "QnA ของกลุ่ม OFFLINE ต้องไม่ตอบใคร" เป็นจริงโดยไม่ต้องมีเงื่อนไขซ้ำอีกชุด:
 * ข้อที่ keywordId ไม่อยู่ใน list นี้ = กลุ่มเจ้าของไม่ได้ทำงาน = ถูกตัดทิ้ง
 */
export interface QnaMatchKeyword {
  id: string
  priority: number
}

export interface QnaMatchResult {
  qna: QnaSetItem
  /** กลุ่มคำที่ QnA ข้อนี้ "ยืมเป็นเจ้าของ" — ผู้เรียกใช้ค่านี้เดินผ่าน gate 6.5/6.6/7 (TFR-032) */
  keywordId: string
  method: QnaMatchMode
}

/**
 * เทียบ candidate 2 ตัวตามเกณฑ์ 3 ชั้นของ DATABASE §3.9.1 — ผู้ชนะอยู่ index 0 หลัง sort
 *
 * 1. `keyword.priority` มาก → น้อย (เกณฑ์เดียวกับ TFR-009 ของกลุ่มคำ — ร้านที่ตั้ง priority
 *    ไว้แล้วต้องได้ผลแบบเดียวกันไม่ว่าจะเข้าทางคำตรงตัวหรือทางคลัง)
 * 2. `useCount` มาก → น้อย (ข้อที่พิสูจน์แล้วว่าถูกใช้จริง ชนะข้อที่ร้านเดาเอง)
 * 3. `qna.id` น้อย → มาก — tie-break สุดท้าย
 *
 * WARNING: เกณฑ์ที่ 3 ไม่ใช่เกณฑ์ที่คาดว่าจะได้ใช้ แต่มีไว้ให้ผล **ซ้ำได้ทุกครั้ง** (หลักเดียวกับ
 * AC-011-03): `id` เป็น primary key ที่ unique และไม่เปลี่ยน ⇒ ไม่มีทางเสมอกันครบทั้ง 3 เกณฑ์
 * ⇒ ผู้ชนะมีหนึ่งเดียวเสมอ และไม่ขึ้นกับลำดับที่ DB คืนแถวมา (Postgres ไม่รับประกันลำดับ
 * ของแถวที่เท่ากัน — พึ่งลำดับนั้นเมื่อไหร่ คำตอบจะเปลี่ยนเองตาม query plan)
 */
function compareCandidates(
  a: { qna: QnaSetItem; priority: number },
  b: { qna: QnaSetItem; priority: number }
): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  if (a.qna.useCount !== b.qna.useCount) return b.qna.useCount - a.qna.useCount
  if (a.qna.id < b.qna.id) return -1
  if (a.qna.id > b.qna.id) return 1
  return 0
}

/**
 * matchQna — วิธีจับคู่ "ทางที่สอง" ของกลุ่มคำ (TFR-031)
 *
 * ผู้เรียกต้องเรียกฟังก์ชันนี้ **เฉพาะเมื่อ `matchKeywords()` ไม่มีผู้ชนะ** เท่านั้น
 * ("คำตรงตัวชนะก่อนเสมอ" — user decisions §3 / TFR-032 ข้อ 1) ไฟล์นี้ไม่บังคับข้อนั้นเอง
 * เพราะไม่รู้จักผลของ matchKeywords — เป็นหน้าที่ของ processJob
 *
 * @param normalizedText ข้อความลูกค้าที่ผ่าน `normalizeMessage()` มาแล้ว
 * @param qnaSet คลังคำถามของร้าน (caller กรอง shopId ที่ query แล้ว)
 * @param keywords กลุ่มคำที่ยังทำงานอยู่ของร้าน (ไม่รวม OFFLINE) — ดูคำอธิบายที่ `QnaMatchKeyword`
 * @param opts.mode โหมดการจับคู่ (v1 มีแต่ `EXACT`)
 */
export function matchQna(
  normalizedText: string,
  qnaSet: readonly QnaSetItem[],
  keywords: readonly QnaMatchKeyword[],
  opts: { mode: QnaMatchMode } = { mode: 'EXACT' }
): QnaMatchResult | null {
  // ข้อความว่างหลัง normalize (เช่น "!!!" ทั้งประโยค) ต้องไม่ match อะไรเลย
  // บั๊กเดียวกับที่ TFR-008 กันไว้: สตริงว่างเป็น substring ของทุกสตริง และถ้ามีข้อในคลัง
  // ที่ normalizedQuestion เป็น "" (ซึ่งไม่ควรมี แต่กันไว้) จะกลายเป็น "ตอบทุกอย่าง"
  if (normalizedText === '') return null
  if (qnaSet.length === 0 || keywords.length === 0) return null

  // Map แทนการ .find() ในลูป — คลังโตได้เป็นหลักร้อยข้อต่อร้าน และฟังก์ชันนี้ถูกเรียก
  // ทุกข้อความที่ไม่ตรงคำ (ซึ่งเป็นเคสที่พบบ่อยที่สุด ตามข้อมูลจริง 401 แถว)
  const priorityByKeyword = new Map<string, number>()
  for (const k of keywords) priorityByKeyword.set(k.id, k.priority)

  const candidates: { qna: QnaSetItem; priority: number }[] = []

  for (const qna of qnaSet) {
    if (!qna.isActive) continue
    // ข้อที่ normalizedQuestion ว่าง — ไม่ควรมี (Valibot กันตอนเขียน) แต่ถ้าหลุดมาแล้วปล่อยผ่าน
    // มันจะตรงกับข้อความว่างเท่านั้น ซึ่งถูกตัดไปแล้วข้างบน; กันไว้อีกชั้นให้ชัดเจน
    if (qna.normalizedQuestion === '') continue

    // ข้อที่ไม่ผูกกลุ่ม = ความรู้ของ ChatBot ไม่ใช่ของเส้นทางจับคู่ตรงตัว — ข้ามเสมอ
    if (!qna.keywordId) continue
    // กลุ่มเจ้าของไม่ได้ทำงาน (OFFLINE / ถูกลบ) ⇒ ข้อนี้ต้องเงียบตามกัน
    const priority = priorityByKeyword.get(qna.keywordId)
    if (priority === undefined) continue

    if (opts.mode === 'EXACT') {
      if (qna.normalizedQuestion !== normalizedText) continue
    } else {
      // ไม่มีโหมดอื่นใน v1 — ถ้ามาถึงตรงนี้แปลว่ามีคนเพิ่มค่าใน QNA_MATCH_MODES แล้วลืมเขียนสาขา
      // ปล่อยผ่านเงียบ ๆ อันตรายกว่าเยอะ (จะกลายเป็น "ไม่ตอบอะไรเลย" ที่หาสาเหตุไม่เจอ)
      throw new Error(`matchQna: โหมด "${opts.mode}" ยังไม่ถูก implement`)
    }

    candidates.push({ qna, priority })
  }

  if (candidates.length === 0) return null

  candidates.sort(compareCandidates)
  const winner = candidates[0]

  // non-null ปลอดภัย: ข้อที่ keywordId เป็น null ถูกข้ามไปตั้งแต่ลูปข้างบนแล้ว
  // (ผู้ชนะต้องมีกลุ่มเจ้าของเสมอ ไม่งั้น gate 6.5/6.6/7 ไม่มีอะไรให้เดิน)
  return { qna: winner.qna, keywordId: winner.qna.keywordId as string, method: opts.mode }
}

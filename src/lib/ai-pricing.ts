/**
 * ai-pricing — แปลงจำนวน token ที่ Gemini ใช้จริง เป็นต้นทุนเงินดอลลาร์
 *
 * user 2026-07-31: "แสดง credit ที่ใช้ ในแต่ละรอบว่ากี่ $ ... จะได้คิดราคาขายได้"
 *
 * WARNING: ตัวเลขในตารางนี้คือ **ราคาขายของ Google** ไม่ใช่ราคาที่เราขายต่อ — และมันเปลี่ยนได้
 * ตรวจกับหน้าราคาทางการทุกครั้งที่จะเอาไปตั้งราคาขายจริง:
 * https://ai.google.dev/gemini-api/docs/pricing
 *
 * ตรวจล่าสุด 2026-07-31 (paid tier, ต่อ 1 ล้าน token):
 *   gemini-3.6-flash        input $1.50  · output $7.50
 *   gemini-3.5-flash        input $1.50  · output $9.00
 *   gemini-3-flash-preview  input $0.50  · output $3.00
 *   gemini-2.5-flash        input $0.30  · output $2.50
 *
 * output รวม "thinking token" แล้ว (โมเดล 3.x คิดก่อนตอบ) — ซึ่งเป็นเหตุผลที่ต้นทุนจริง
 * สูงกว่าที่ประมาณจากความยาวข้อความที่เห็นมาก และเป็นเหตุผลที่ต้องวัดจาก usageMetadata จริง
 * ไม่ใช่เดาจากจำนวนตัวอักษร
 */

/** ราคาต่อ 1 ล้าน token (USD) */
type ModelRate = { inputPerMillion: number; outputPerMillion: number }

const RATES: Record<string, ModelRate> = {
  'gemini-3.6-flash': { inputPerMillion: 1.5, outputPerMillion: 7.5 },
  'gemini-3.5-flash': { inputPerMillion: 1.5, outputPerMillion: 9.0 },
  'gemini-3-flash-preview': { inputPerMillion: 0.5, outputPerMillion: 3.0 },
  'gemini-2.5-flash': { inputPerMillion: 0.3, outputPerMillion: 2.5 },
}

/**
 * รุ่นที่ไม่รู้จักใช้เรตของตัวที่แพงที่สุดในตาราง
 *
 * ตั้งใจให้ประเมินสูงไว้ก่อน: ตัวเลขนี้ถูกเอาไปตั้งราคาขาย การประเมินต้นทุนต่ำเกินจริง
 * แปลว่าขายขาดทุนโดยไม่รู้ตัว ส่วนประเมินสูงเกินจริงแค่ทำให้ระวังเกินไป
 */
const FALLBACK_RATE: ModelRate = { inputPerMillion: 1.5, outputPerMillion: 9.0 }

export type TokenUsage = {
  /** token ของ prompt (system + บทสนทนา + ไฟล์แนบ) */
  inputTokens: number
  /** token ของคำตอบ รวม thinking token */
  outputTokens: number
  /** ชื่อรุ่นที่ตอบจริง — อาจไม่ใช่ตัวแรกใน MODEL_CANDIDATES ถ้าถอยไปตัวสำรอง */
  model: string
}

export type UsageCost = TokenUsage & {
  costUsd: number
  /** true = ไม่มีเรตของรุ่นนี้ในตาราง ใช้เรตสูงสุดแทน (ตัวเลขเป็นเพดาน ไม่ใช่ค่าจริง) */
  isEstimate: boolean
}

export function computeUsageCost(usage: TokenUsage): UsageCost {
  const rate = RATES[usage.model]
  const used = rate ?? FALLBACK_RATE
  const costUsd =
    (usage.inputTokens / 1_000_000) * used.inputPerMillion +
    (usage.outputTokens / 1_000_000) * used.outputPerMillion
  return { ...usage, costUsd, isEstimate: !rate }
}

/**
 * "$0.0042" — ทศนิยม 4 ตำแหน่งเพราะค่าต่อครั้งอยู่ระดับเศษสตางค์
 *
 * ปัดเป็น 2 ตำแหน่งจะได้ "$0.00" ทุกครั้ง ซึ่งทำให้ร้านสรุปผิดว่าใช้ฟรี
 * ต่ำกว่า $0.0001 แสดงเป็น "< $0.0001" แทนที่จะเป็นศูนย์ ด้วยเหตุผลเดียวกัน
 */
export function formatUsd(costUsd: number): string {
  if (costUsd > 0 && costUsd < 0.0001) return '< $0.0001'
  return `$${costUsd.toFixed(4)}`
}

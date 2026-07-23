import 'server-only'

// Gemini helper (server-only) — feature 00018 composer improvement #3 (AI ช่วยร่างคำตอบ)
// ห้าม import ฝั่ง client: GEMINI_API_KEY เป็น secret อ่านจาก process.env เท่านั้น ไม่ส่งออก client
// เรียก REST ตรง (ไม่พึ่ง SDK) — payload/response ชัดเจน คุม dependency ไม่เพิ่ม

// รายชื่อโมเดลที่จะลองตามลำดับ — Google ปลดระวางโมเดลเป็นระยะแล้วคืน 404 ทันที (บั๊กจริง prod
// 2026-07-23: gemini-2.0-flash ถูกปิด "no longer available" ทั้งฟีเจอร์ AI ตายทันทีโดยไม่มี fallback)
// ตั้ง GEMINI_MODEL ใน env = บังคับใช้ตัวเดียวไม่ต้อง fallback (เช่นเวลาต้องล็อกรุ่น/ต้นทุน)
// ลำดับ default: รุ่นใหม่ก่อน แล้วถอยไปรุ่นเสถียรที่ถูกกว่า — อ้างอิงรายชื่อโมเดลปัจจุบันจาก
// https://ai.google.dev/gemini-api/docs/models (ตรวจ 2026-07-23; 2.0-flash/2.0-flash-lite ตายแล้ว)
const MODEL_CANDIDATES: string[] = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-3.6-flash', 'gemini-2.5-flash']
const GEMINI_ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

const REQUEST_TIMEOUT_MS = 15_000

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_NOT_CONFIGURED')
    this.name = 'GeminiNotConfiguredError'
  }
}
export class GeminiApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiApiError'
  }
}

export type SuggestTurn = { role: 'BUYER' | 'SHOP'; text: string }

// บริบทร้านที่ช่วยให้คำตอบตรงธุรกิจ — ชื่อร้าน + ประเภทกิจการ (ขายของ/ที่พัก)
export type SuggestContext = {
  shopName: string
  vertical: string // 'GENERAL' | 'LODGING' | ...
  // CRM (feature 00018) — note/ชื่อที่แอดมินจดไว้ ให้ AI ใช้ประกอบการร่าง (ตอบตรงคน/บริบทมากขึ้น)
  customerName?: string | null
  customerNote?: string | null
}

function buildSystemPrompt(ctx: SuggestContext): string {
  const businessDesc = ctx.vertical === 'LODGING' ? 'ที่พัก/โรงแรม (รับจอง)' : 'ร้านค้าออนไลน์ (ขายสินค้า)'
  const lines = [
    `คุณเป็นผู้ช่วยแอดมินของ "${ctx.shopName}" ซึ่งเป็น${businessDesc}`,
    'หน้าที่ของคุณคือช่วยแอดมิน "ร่างข้อความตอบลูกค้า" จากบทสนทนาที่กำลังคุยกันในแชท',
  ]
  // ข้อมูลลูกค้าที่แอดมินจดไว้ (CRM note) — ใช้ประกอบบริบท แต่ห้ามเปิดเผยตรง ๆ ว่า "มีโน้ตเขียนว่า..."
  if (ctx.customerName || ctx.customerNote) {
    lines.push('ข้อมูลที่แอดมินจดไว้เกี่ยวกับลูกค้าคนนี้ (ใช้ประกอบการตอบ อย่าพูดถึงว่าเป็นโน้ต):')
    if (ctx.customerName) lines.push(`- ชื่อ/ที่เรียก: ${ctx.customerName}`)
    if (ctx.customerNote) lines.push(`- โน้ต: ${ctx.customerNote}`)
  }
  lines.push(
    'กติกา:',
    '- ตอบเป็นภาษาไทย สุภาพ เป็นกันเอง กระชับ ตรงประเด็น เหมือนแอดมินร้านตอบเอง',
    '- อ่านบริบทล่าสุดแล้วเดาว่าลูกค้าต้องการอะไร แล้วร่างคำตอบที่เหมาะสม',
    '- ถ้าลูกค้าถามราคา/สต็อก/รายละเอียดที่คุณไม่รู้จริง ให้ร่างแบบขอข้อมูลเพิ่มหรือทวนคำถามอย่างสุภาพ ห้ามแต่งตัวเลข/ราคา/เงื่อนไขขึ้นเอง',
    '- ห้ามสัญญาสิ่งที่ยืนยันไม่ได้ ห้ามขอ OTP/รหัสผ่าน/ข้อมูลบัตร',
    '- เสนอ 3 ทางเลือกที่ "ต่างกันจริง" (เช่น สั้น-ยาว, โทนต่างกัน, หรือมุมต่างกัน) ไม่ใช่ประโยคเดียวกันแค่สลับคำ',
  )
  return lines.join('\n')
}

function buildTranscript(turns: SuggestTurn[]): string {
  const lines = turns.map((t) => `${t.role === 'BUYER' ? 'ลูกค้า' : 'ร้าน'}: ${t.text}`)
  return [
    'นี่คือบทสนทนาล่าสุด (บนลงล่าง = เก่าไปใหม่):',
    '---',
    lines.join('\n'),
    '---',
    'ช่วยร่างข้อความ "ที่ร้านจะตอบลูกค้าเป็นข้อความถัดไป" มา 3 แบบ',
  ].join('\n')
}

/**
 * generateReplySuggestions — คืนข้อความร่าง 3 แบบสำหรับให้แอดมินเลือก/แก้ก่อนส่ง
 * throw GeminiNotConfiguredError ถ้าไม่มี key, GeminiApiError ถ้า Gemini ตอบผิดพลาด/parse ไม่ได้
 */
export async function generateReplySuggestions(
  turns: SuggestTurn[],
  ctx: SuggestContext,
): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiNotConfiguredError()

  const requestBody = {
    system_instruction: { parts: [{ text: buildSystemPrompt(ctx) }] },
    contents: [{ role: 'user', parts: [{ text: buildTranscript(turns) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { suggestions: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['suggestions'],
      },
      temperature: 0.8,
      maxOutputTokens: 1024,
    },
  }

  // ไล่ลองทีละโมเดล — ถอยไปตัวถัดไปเฉพาะ 404 (โมเดลถูกปลดระวาง/โปรเจกต์ไม่มีสิทธิ์ใช้รุ่นนั้น)
  // เท่านั้น; error อื่น (401 key ผิด, 429 โควตาหมด, 400 payload ผิด) ถอยไปก็เจอเหมือนเดิม
  // ต้องโยนทันทีเพื่อให้เห็นสาเหตุจริง ไม่ใช่ไล่ยิงซ้ำเปล่า ๆ
  let res: Response | null = null
  let lastError = ''
  for (const model of MODEL_CANDIDATES) {
    let attempt: Response
    try {
      attempt = await fetch(GEMINI_ENDPOINT(model, key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      throw new GeminiApiError(`fetch failed (${model}): ${e instanceof Error ? e.message : 'unknown'}`)
    }

    if (attempt.ok) {
      res = attempt
      break
    }

    // เก็บ error body ของ Gemini ด้วย (มี message อธิบายสาเหตุจริง เช่น model ไม่มี/สิทธิ์ไม่พอ/
    // API ยังไม่เปิดใช้) — ไม่มี key ใน body (key อยู่ query string เท่านั้น) จึงปลอดภัยพอจะ surface
    const errBody = await attempt.text().catch(() => '')
    lastError = `gemini responded ${attempt.status} (${model}): ${errBody.slice(0, 400)}`
    if (attempt.status !== 404) throw new GeminiApiError(lastError)
    console.warn(`[gemini] model ${model} ใช้ไม่ได้ (404) — ลองตัวถัดไป`)
  }

  if (!res) throw new GeminiApiError(lastError || 'no usable gemini model')

  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  } | null
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new GeminiApiError('empty response')

  let parsed: { suggestions?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new GeminiApiError('invalid json from gemini')
  }
  const list = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
  const cleaned = list
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3)
  if (cleaned.length === 0) throw new GeminiApiError('no usable suggestions')
  return cleaned
}

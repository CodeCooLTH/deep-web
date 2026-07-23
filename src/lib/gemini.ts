import 'server-only'

// Gemini helper (server-only) — feature 00018 composer improvement #3 (AI ช่วยร่างคำตอบ)
// ห้าม import ฝั่ง client: GEMINI_API_KEY เป็น secret อ่านจาก process.env เท่านั้น ไม่ส่งออก client
// เรียก REST ตรง (ไม่พึ่ง SDK) — payload/response ชัดเจน คุม dependency ไม่เพิ่ม

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
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
}

function buildSystemPrompt(ctx: SuggestContext): string {
  const businessDesc = ctx.vertical === 'LODGING' ? 'ที่พัก/โรงแรม (รับจอง)' : 'ร้านค้าออนไลน์ (ขายสินค้า)'
  return [
    `คุณเป็นผู้ช่วยแอดมินของ "${ctx.shopName}" ซึ่งเป็น${businessDesc}`,
    'หน้าที่ของคุณคือช่วยแอดมิน "ร่างข้อความตอบลูกค้า" จากบทสนทนาที่กำลังคุยกันในแชท',
    'กติกา:',
    '- ตอบเป็นภาษาไทย สุภาพ เป็นกันเอง กระชับ ตรงประเด็น เหมือนแอดมินร้านตอบเอง',
    '- อ่านบริบทล่าสุดแล้วเดาว่าลูกค้าต้องการอะไร แล้วร่างคำตอบที่เหมาะสม',
    '- ถ้าลูกค้าถามราคา/สต็อก/รายละเอียดที่คุณไม่รู้จริง ให้ร่างแบบขอข้อมูลเพิ่มหรือทวนคำถามอย่างสุภาพ ห้ามแต่งตัวเลข/ราคา/เงื่อนไขขึ้นเอง',
    '- ห้ามสัญญาสิ่งที่ยืนยันไม่ได้ ห้ามขอ OTP/รหัสผ่าน/ข้อมูลบัตร',
    '- เสนอ 3 ทางเลือกที่ "ต่างกันจริง" (เช่น สั้น-ยาว, โทนต่างกัน, หรือมุมต่างกัน) ไม่ใช่ประโยคเดียวกันแค่สลับคำ',
  ].join('\n')
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

  let res: Response
  try {
    res = await fetch(GEMINI_ENDPOINT(GEMINI_MODEL, key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    throw new GeminiApiError(`fetch failed: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  if (!res.ok) {
    // เก็บ error body ของ Gemini ด้วย (มี message อธิบายสาเหตุจริง เช่น model ไม่มี/สิทธิ์ไม่พอ/
    // API ยังไม่เปิดใช้) — ไม่มี key ใน body (key อยู่ query string เท่านั้น) จึงปลอดภัยพอจะ surface
    const errBody = await res.text().catch(() => '')
    throw new GeminiApiError(`gemini responded ${res.status}: ${errBody.slice(0, 400)}`)
  }

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

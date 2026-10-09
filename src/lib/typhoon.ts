import 'server-only'
import type { TokenUsage } from '@/lib/ai-pricing'
import { sanitizedContext, type SanitizedPayload } from '@/lib/ai-suggest-sanitize'
import { buildTyphoonSystemPrompt, buildTyphoonTranscript } from '@/lib/reply-suggest-prompt'

// Typhoon (opentyphoon.ai) — ตัวร่างคำตอบอัตโนมัติ 00019-ext
// ไม่ retry (429 ก็ไม่ลองซ้ำ) · message ของ error ห้ามมี key/response body เพราะ body อาจสะท้อนข้อความลูกค้า
export const TYPHOON_ENDPOINT = 'https://api.opentyphoon.ai/v1/chat/completions'
export const TYPHOON_DEFAULT_MODEL = 'typhoon-v2.5-30b-a3b-instruct'
export const TYPHOON_TIMEOUT_MS = 8_000

export type TyphoonErrorKind = 'TIMEOUT' | 'NETWORK' | 'HTTP' | 'EMPTY'

export class TyphoonNotConfiguredError extends Error {
  constructor() {
    super('TYPHOON_NOT_CONFIGURED')
    this.name = 'TyphoonNotConfiguredError'
  }
}
export class TyphoonRateLimitedError extends Error {
  constructor() {
    super('TYPHOON_RATE_LIMITED')
    this.name = 'TyphoonRateLimitedError'
  }
}
export class TyphoonApiError extends Error {
  readonly kind: TyphoonErrorKind
  readonly status?: number
  constructor(kind: TyphoonErrorKind, status?: number) {
    super(`TYPHOON_${kind}${status ? `_${status}` : ''}`)
    this.name = 'TyphoonApiError'
    this.kind = kind
    this.status = status
  }
}

export function isTyphoonConfigured(): boolean {
  return Boolean(process.env.TYPHOON_API_KEY?.trim())
}

/** รับเฉพาะ payload ที่ผ่าน sanitizeForExternalAi — ส่งข้อความดิบเข้ามาไม่ได้ (compile error) */
export async function generateTyphoonReply(
  payload: SanitizedPayload,
): Promise<{ text: string; usage: TokenUsage | null; model: string; latencyMs: number }> {
  const key = process.env.TYPHOON_API_KEY?.trim()
  if (!key) throw new TyphoonNotConfiguredError()
  const model = process.env.TYPHOON_MODEL || TYPHOON_DEFAULT_MODEL

  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TYPHOON_TIMEOUT_MS)
  let json: {
    choices?: { message?: { content?: unknown } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  // timer ต้องครอบถึงการอ่าน body: server ที่ส่ง header แล้วค้าง body จะได้ไม่แขวน request เกิน 8 วิ
  try {
    const res = await fetch(TYPHOON_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildTyphoonSystemPrompt(sanitizedContext(payload)) },
          { role: 'user', content: buildTyphoonTranscript(payload.turns) },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: controller.signal,
    })
    if (res.status === 429) throw new TyphoonRateLimitedError()
    if (!res.ok) throw new TyphoonApiError('HTTP', res.status)
    try {
      json = await res.json()
    } catch (e) {
      throw new TyphoonApiError(e instanceof Error && e.name === 'AbortError' ? 'TIMEOUT' : 'EMPTY')
    }
  } catch (e) {
    if (e instanceof TyphoonRateLimitedError || e instanceof TyphoonApiError) throw e
    const aborted = e instanceof Error && e.name === 'AbortError'
    throw new TyphoonApiError(aborted ? 'TIMEOUT' : 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
  const content = json.choices?.[0]?.message?.content
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) throw new TyphoonApiError('EMPTY')

  const u = json.usage
  const usage: TokenUsage | null =
    u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number'
      ? { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens, model }
      : null
  return { text, usage, model, latencyMs: Date.now() - started }
}

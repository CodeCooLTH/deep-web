import 'server-only'
import type { TokenUsage } from '@/lib/ai-pricing'
import type { SanitizedPayload } from '@/lib/ai-suggest-sanitize'
import { generateReplySuggestions, type SuggestContext, type SuggestMedia, type SuggestTurn } from '@/lib/gemini'
import { generateTyphoonReply, isTyphoonConfigured } from '@/lib/typhoon'

export type SuggestProvider = 'typhoon' | 'gemini' | 'none'

// TYPHOON_SUGGEST_SHOP_IDS: ว่าง→gemini · "a,b"→typhoon เฉพาะร้านในรายการ · "*"→ทุกร้าน
// เลือก typhoon แต่ไม่มีกุญแจ → 'none' (ห้ามถอยไป Gemini เพราะ Gemini ไม่ผ่านด่านปกปิด PII แบบเดียวกัน)
export function resolveSuggestProvider(shopId: string): SuggestProvider {
  const ids = (process.env.TYPHOON_SUGGEST_SHOP_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const picked = ids.includes('*') || ids.includes(shopId)
  if (!picked) return 'gemini'
  return isTyphoonConfigured() ? 'typhoon' : 'none'
}

export type DraftResult = { suggestions: string[]; usage: TokenUsage | null; model: string; latencyMs: number }

// typhoon รับเฉพาะ SanitizedPayload (สร้างได้จาก sanitizeForExternalAi เท่านั้น) · gemini คง signature เดิม
// overload: เรียกด้วย provider เป็น union โดยไม่ narrow จะ compile ไม่ผ่าน → ไม่มีทางส่งของดิบเข้า typhoon
export function draftReplySuggestions(provider: 'typhoon', payload: SanitizedPayload): Promise<DraftResult>
export function draftReplySuggestions(
  provider: 'gemini',
  turns: SuggestTurn[],
  ctx: SuggestContext,
  media?: SuggestMedia[],
): Promise<DraftResult>
export async function draftReplySuggestions(
  provider: 'typhoon' | 'gemini',
  a: SanitizedPayload | SuggestTurn[],
  ctx?: SuggestContext,
  media: SuggestMedia[] = [],
): Promise<DraftResult> {
  if (provider === 'typhoon') {
    // OOS-7: Typhoon ไม่รับ media
    const r = await generateTyphoonReply(a as SanitizedPayload)
    return { suggestions: [r.text], usage: r.usage, model: r.model, latencyMs: r.latencyMs }
  }
  const started = Date.now()
  const r = await generateReplySuggestions(a as SuggestTurn[], ctx as SuggestContext, media)
  return {
    suggestions: r.suggestions,
    usage: r.usage,
    model: r.usage?.model ?? 'gemini',
    latencyMs: Date.now() - started,
  }
}

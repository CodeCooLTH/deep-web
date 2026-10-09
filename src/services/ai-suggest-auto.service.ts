import 'server-only'

import type {
  AutoSuggestGetResponse,
  AutoSuggestPatchBody,
  AutoSuggestState,
  AutoSuggestTrigger,
} from '@/lib/ai-suggest-auto-types'

/**
 * คำแนะนำคำตอบอัตโนมัติ (Typhoon) — 00019-ext · S-9
 * STUB (contract freeze G0): signature ล็อกแล้ว เนื้อในทำใน task T4
 * S-19 grep-gate: ต้องไม่มีคำว่า NOT_IMPLEMENTED เหลือก่อน merge
 */

export interface RequestAutoSuggestParams {
  shopId: string
  conversationId: string
  userId: string
  userDisplayName: string | null
  anchorMessageId: string
  manual: boolean
  trigger: AutoSuggestTrigger
}

export type RequestAutoSuggestResult = AutoSuggestState | { status: 'INVALID_ANCHOR' } // INVALID_ANCHOR → route 400

export async function requestAutoSuggest(_p: RequestAutoSuggestParams): Promise<RequestAutoSuggestResult> {
  throw new Error('NOT_IMPLEMENTED')
}

export async function getLatestAutoSuggest(_shopId: string, _conversationId: string): Promise<AutoSuggestGetResponse> {
  throw new Error('NOT_IMPLEMENTED')
}

/** ok=false → route 404 */
export async function submitAutoSuggestFeedback(
  _p: { shopId: string; conversationId: string } & AutoSuggestPatchBody,
): Promise<{ ok: boolean }> {
  throw new Error('NOT_IMPLEMENTED')
}

/** ตัดผลไม่เกิน 3 ประโยค / 400 ตัวอักษร (FR-AIT-06) */
export function clampSuggestion(_text: string, _opts?: { maxSentences?: number; maxChars?: number }): string {
  throw new Error('NOT_IMPLEMENTED')
}

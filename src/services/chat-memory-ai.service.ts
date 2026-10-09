import 'server-only'
import type { MemoryUpdateOutcome } from '@/lib/ai-suggest-auto-types'

// stub ของ G0 (contract freeze) — เนื้อจริงมาใน T7

export async function applyAiUpdate(p: {
  shopId: string
  conversationId: string
  row: { id: string; version: number } | null
  text: string
  basedOnMessageId: string
}): Promise<'OK' | 'SUPERSEDED'> {
  void p
  throw new Error('NOT_IMPLEMENTED')
}

/** ไม่ throw ทุกกรณี (เมื่อทำจริง) */
export async function maybeUpdateMemory(p: {
  shopId: string
  conversationId: string
  latestMessageId: string
  force?: boolean
}): Promise<{ outcome: MemoryUpdateOutcome | 'NOT_APPLICABLE' }> {
  void p
  throw new Error('NOT_IMPLEMENTED')
}

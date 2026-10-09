import 'server-only'
import type {
  ChatMemoryConflict,
  ChatMemoryDto,
  ChatMemoryGetResponse,
  ChatMemorySource,
  PromptProduct,
} from '@/lib/chat-memory-types'

// stub ของ G0 (contract freeze) — เนื้อจริงมาใน T4/T6

/** รูปแถว ChatMemory เท่าที่ผู้ใช้ภายนอกต้องรู้ (Prisma model มาใน T1) */
export type ChatMemoryRow = {
  id: string
  shopId: string
  conversationId: string
  text: string
  source: ChatMemorySource
  version: number
  previousText: string | null
  updatedAt: Date
  aiUpdatedAt: Date | null
}

export async function resolveEffectiveMemory(
  shopId: string,
  conversationId: string,
): Promise<{ row: ChatMemoryRow | null; shared: boolean; roomIds: string[] } | null> {
  void shopId, conversationId
  throw new Error('NOT_IMPLEMENTED')
}

export async function getMemoryPanel(shopId: string, conversationId: string): Promise<ChatMemoryGetResponse | null> {
  void shopId, conversationId
  throw new Error('NOT_IMPLEMENTED')
}

export type SaveMemoryResult =
  | { ok: true; memory: ChatMemoryDto }
  | { ok: false; code: 'NOT_FOUND' | 'INVALID_TEXT' }
  | { ok: false; code: 'VERSION_CONFLICT'; current: ChatMemoryConflict['current'] }

export async function saveMemoryByAdmin(p: {
  shopId: string
  conversationId: string
  userId: string
  text: string
  expectedVersion: number | null
}): Promise<SaveMemoryResult> {
  void p
  throw new Error('NOT_IMPLEMENTED')
}

export type { PromptProduct }
export type PromptMemory = { memory: { text: string; updatedDay: string } | null; products: PromptProduct[] }

/** fail-soft: ไม่ throw (NFR-MEM-Failsoft) · includeX=false → ไม่อ่านส่วนนั้นเลย */
export async function loadPromptMemory(p: {
  shopId: string
  conversationId: string
  includeMemory: boolean
  includeProducts: boolean
}): Promise<PromptMemory> {
  void p
  throw new Error('NOT_IMPLEMENTED')
}

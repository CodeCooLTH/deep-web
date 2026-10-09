import { INTERESTED_PRODUCT_MAX } from '@/lib/chat-memory-types'
import type { ChatMemoryAi, ChatMemorySource, InterestedProductState } from '@/lib/chat-memory-types'

// ฟังก์ชันตัดสิน UI ของความจำแชท (pure) — แยกออกมาเพื่อให้เทส mutation จับได้
// (docs/conventions/ui-boolean-needs-a-testable-home.md)

/** ร้านที่ใช้สินค้าไม่ได้ แต่ยังมีแถวค้าง (ข้อมูลเดิม) ก็ต้องเห็น ไม่ให้แถวหายเงียบ */
export function shouldShowProductsSection(i: { canUseProducts: boolean; rowCount: number }): boolean {
  return i.canUseProducts || i.rowCount > 0
}

export function canAddMoreProducts(rowCount: number): boolean {
  return rowCount < INTERESTED_PRODUCT_MAX
}

export function productRowView(state: InterestedProductState): {
  tappable: boolean
  badge: 'inactive' | 'deleted' | null
  hint: 'noSend' | null
} {
  if (state === 'ACTIVE') return { tappable: true, badge: null, hint: null }
  if (state === 'INACTIVE') return { tappable: false, badge: 'inactive', hint: 'noSend' }
  return { tappable: false, badge: 'deleted', hint: 'noSend' }
}

export const MEMORY_CLAMP_CHARS = 280

/** ตัดสินจากความยาวตัวอักษร ไม่วัด DOM (วัดแล้วเปลี่ยนตัวที่วัด = วนไม่หยุด) */
export function shouldClampMemory(text: string): boolean {
  return text.length > MEMORY_CLAMP_CHARS
}

/** updating ชนะทุกอย่าง · ร้านที่ AI เขียนไม่ได้ + แถวเป็นของแอดมิน = adminOnly */
export function memoryMetaKind(i: {
  source: ChatMemorySource
  shared: boolean
  updating: boolean
  writes: boolean
}): 'ai' | 'admin' | 'updating' | 'adminOnly' {
  if (i.updating) return 'updating'
  if (i.source === 'AI') return 'ai'
  return i.writes ? 'admin' : 'adminOnly'
}

export function noteHintKind(ai: ChatMemoryAi | null): 'reads' | 'ignores' | 'neutral' {
  if (!ai) return 'neutral'
  if (ai.noteReadByAi) return 'reads'
  if (ai.provider === 'typhoon') return 'ignores'
  return 'neutral'
}
